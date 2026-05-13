const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithModelFallback } = require('./geminiClient');
const { buildOrganicContextBlock } = require('./projectContext');

const { formatHistoryForPrompt } = require('./chatHistory');

const ORGANIC_SYSTEM = `Voce e a ADNY, assistente (agente) da confeccao no WhatsApp. Responda em portugues brasileiro, tom caloroso, direto e profissional — como um funcionario que ajuda no dia a dia com relatorios e dados de pedidos.

REGRAS OBRIGATORIAS:
- Use APENAS informacoes presentes no JSON "dados_do_sistema". Nunca invente quantidades, IDs, nomes, status, valores ou datas que nao aparecam la.
- Se dados_do_sistema indicar erro (sucesso false ou campo erro), explique com empatia e sugira o que o usuario pode fazer.
- Se nao houver dados para a pergunta, diga claramente que nao consta na base agora.
- Formate para WhatsApp: *negrito* para destaques. Evite markdown tipo ## ou blocos de codigo.
- Listas longas: destaque o que importa primeiro; no fim pode mencionar o total de registros se couber.
- Limite pratico ~3500 caracteres. Seja concisa mas humana.
- Datas e periodos na sua mensagem ao usuario: cite sempre em *YYYY-MM-DD* (ex.: 2026-05-12) *ou* por extenso em portugues (ex.: 12 de maio de 2026). Nao use formato DD/MM/AAAA com barras (ex.: 12/05/2026), pois e ambiguo. Os valores continuam sendo apenas os que constam no JSON dados_do_sistema; so reformate a escrita.
- Nunca oriente criar, editar, excluir ou finalizar pedidos pelo bot; apenas consultas e orientacao para impressao (link no PC ou PDF quando o fluxo permitir).
- Se a linha "URL publica do sistema" aparecer no bloco do usuario abaixo, use-a para montar links no formato URL_PUBLICA/index.html?id=ID_DO_PEDIDO quando fizer sentido (abrir pedido no navegador; impressao OS/GP pelos botoes do sistema). Se a linha nao existir, nao invente URLs.`;

function truncateJson(obj, maxChars) {
  const s = JSON.stringify(obj);
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n...(dados truncados para limite do modelo)`;
}

/**
 * Transforma fatos vindos do Apps Script em resposta conversacional.
 * @param {object} config - loadConfig()
 * @param {string} userQuestion - texto apos o gatilho
 * @param {string} [chatKey] - historico do mesmo chat
 */
async function synthesizeOrganicAnswer(config, userQuestion, envelope, chatKey) {
  if (!config.geminiApiKey || !config.naturalLanguageEnabled) {
    return null;
  }
  if (config.geminiOrganicResponses === false) {
    return null;
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const payload = {
    contexto_consulta: envelope.kind || 'geral',
    dados_do_sistema: envelope.facts,
  };
  const hist = formatHistoryForPrompt(config, chatKey || 'default');
  const baseUrlLine = config.sistemaBaseUrl
    ? `URL publica do sistema (para links de pedido): ${config.sistemaBaseUrl}\n`
    : '';
  const userText = [
    baseUrlLine + hist.trim(),
    `Pergunta do usuario:`,
    String(userQuestion || '').slice(0, 2500),
    '',
    'JSON com os dados (use so isto como fonte de verdade):',
    truncateJson(payload, 28000),
  ]
    .filter(Boolean)
    .join('\n');

  const organicSystem = `${ORGANIC_SYSTEM}${buildOrganicContextBlock(config)}`;

  const { result, modelUsed } = await generateWithModelFallback(
    genAI,
    config.geminiModel,
    {
      systemInstruction: organicSystem,
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: 2048,
      },
    },
    userText,
  );

  if (modelUsed !== config.geminiModel) {
    console.log(`Gemini (resposta organica): fallback ${modelUsed}`);
  }

  const text = (result.response.text() || '').trim();
  if (!text) {
    return null;
  }
  return text.slice(0, 4000);
}

module.exports = { synthesizeOrganicAnswer, ORGANIC_SYSTEM };
