const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithModelFallback } = require('./geminiClient');

const ORGANIC_SYSTEM = `Voce e a ADNY, assistente da confeccao no WhatsApp. Responda em portugues brasileiro, tom caloroso, direto e profissional.

REGRAS OBRIGATORIAS:
- Use APENAS informacoes presentes no JSON "dados_do_sistema". Nunca invente quantidades, IDs, nomes, status, valores ou datas que nao aparecam la.
- Se dados_do_sistema indicar erro (sucesso false ou campo erro), explique com empatia e sugira o que o usuario pode fazer.
- Se nao houver dados para a pergunta, diga claramente que nao consta na base agora.
- Formate para WhatsApp: *negrito* para destaques. Evite markdown tipo ## ou blocos de codigo.
- Listas longas: destaque o que importa primeiro; no fim pode mencionar o total de registros se couber.
- Limite pratico ~3500 caracteres. Seja concisa mas humana.`;

function truncateJson(obj, maxChars) {
  const s = JSON.stringify(obj);
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n...(dados truncados para limite do modelo)`;
}

/**
 * Transforma fatos vindos do Apps Script em resposta conversacional.
 * @param {object} config - loadConfig()
 * @param {string} userQuestion - texto apos o gatilho
 * @param {object} envelope - { kind: string, facts: object }
 */
async function synthesizeOrganicAnswer(config, userQuestion, envelope) {
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
  const userText = [
    `Pergunta do usuario:`,
    String(userQuestion || '').slice(0, 2500),
    '',
    'JSON com os dados (use so isto como fonte de verdade):',
    truncateJson(payload, 28000),
  ].join('\n');

  const { result, modelUsed } = await generateWithModelFallback(
    genAI,
    config.geminiModel,
    {
      systemInstruction: ORGANIC_SYSTEM,
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
