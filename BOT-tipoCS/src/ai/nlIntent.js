const { GoogleGenerativeAI } = require('@google/generative-ai');
const { gasGet } = require('../services/gasGet');
const { generateWithModelFallback } = require('./geminiClient');
const { synthesizeOrganicAnswer } = require('./organicReply');
const { formatIntentFallback } = require('../format/respostas');

const ALLOWED_ACTIONS = new Set([
  'none',
  'contarPorEtapaProducao',
  'listarPedidosEntregaPeriodo',
  'agregarPecasAbertos',
  'listarPedidos',
  'buscarPedidos',
  'buscarPedido',
  'relatorioPedidos',
]);

function segundaDomingoISO(d = new Date()) {
  const day = d.getDay();
  const diffMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  mon.setDate(mon.getDate() + diffMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return { dataInicio: ymd(mon), dataFim: ymd(sun) };
}

function buildSystemPrompt() {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const { dataInicio: seg, dataFim: dom } = segundaDomingoISO(now);
  return `Voce e um ROTEADOR de intencoes para consultas de PEDIDOS (confeccao). Nao invente numeros: so escolha uma acao e parametros.

Responda APENAS com um objeto JSON valido (sem markdown, sem texto fora do JSON).

Acoes permitidas e params:
1) {"action":"none","reply_pt":"mensagem curta em PT-BR"} — use se a pergunta for fora do escopo (ex.: clima), ou faltarem dados essenciais (ex.: relatorio sem periodo), ou for so cumprimento.
2) {"action":"contarPorEtapaProducao","params":{"etapa":"Arte"}} — etapa uma de: Pedido em Aberto, Arte, Insumos, Corte, Estampa, Costura, Embalo, Aguardando retirada. Opcional: "apenasAbertosOperacional":"true"|"false", "excluirCancelados":"true"|"false" (padrao true).
3) {"action":"listarPedidosEntregaPeriodo","params":{"dataInicio":"YYYY-MM-DD","dataFim":"YYYY-MM-DD"}} — pedidos com DATA DE ENTREGA nesse intervalo (inclusive).
4) {"action":"agregarPecasAbertos","params":{}} — pecas por tamanho em pedidos em aberto. Opcional: "cor":"trecho da cor da malha" (ex.: preta).
5) {"action":"listarPedidos","params":{"filtro":""}} — filtro vazio = todos; ou status operacional exato se o usuario pedir filtro claro.
6) {"action":"buscarPedidos","params":{"termo":"..."}} — varios resultados por nome/telefone/id.
7) {"action":"buscarPedido","params":{"termo":"..."}} — um pedido quando parece ID/nome bem especifico.
8) {"action":"relatorioPedidos","params":{"dataInicio":"YYYY-MM-DD","dataFim":"YYYY-MM-DD","dimensao":"tipoMalha"}} — dimensao opcional: tipoMalha, corMalha, tipoPeca, estampa, status, etc.

Contexto de datas (use para "esta semana", "semana atual"):
- Hoje (ISO): ${iso(now)}
- Segunda a domingo desta semana no servidor: dataInicio=${seg}, dataFim=${dom}

Exemplos:
- "quantos pedidos na arte?" -> contarPorEtapaProducao etapa Arte
- "entregas essa semana" -> listarPedidosEntregaPeriodo com seg e dom acima
- "pecas por tamanho malha preta em aberto" -> agregarPecasAbertos cor preta
- "lista aberta" / "fila" -> listarPedidos filtro vazio
- "relatorio de janeiro" sem datas claras -> none pedindo as duas datas YYYY-MM-DD`;
}

function safeJsonParse(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function pickParams(obj, keys) {
  const p = obj && typeof obj.params === 'object' && !Array.isArray(obj.params) ? obj.params : {};
  const out = {};
  for (const k of keys) {
    if (p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== '') {
      out[k] = String(p[k]).trim();
    }
  }
  return out;
}

/**
 * Executa intenção: busca dados no GAS. Retorno para resposta orgânica ou texto direto.
 * @returns {Promise<{ type: 'text', text: string } | { type: 'organic', kind: string, facts: object }>}
 */
async function executeIntentData(config, intent) {
  const action = intent && intent.action;
  if (!ALLOWED_ACTIONS.has(action)) {
    return { type: 'text', text: 'Resposta da IA inválida (ação desconhecida). Use comandos fixos ou tente de novo.' };
  }
  if (action === 'none') {
    const r = intent.reply_pt || intent.reply || 'Não consegui interpretar. Reformule ou use *ajuda*.';
    return { type: 'text', text: String(r).slice(0, 3500) };
  }

  let params = {};
  try {
    switch (action) {
      case 'contarPorEtapaProducao': {
        params = pickParams(intent, ['etapa', 'apenasAbertosOperacional', 'excluirCancelados']);
        if (!params.etapa) {
          return { type: 'text', text: 'Faltou a etapa de produção (ex.: Arte).' };
        }
        if (!params.excluirCancelados) params.excluirCancelados = 'true';
        const data = await gasGet(config, action, params);
        return { type: 'organic', kind: 'contagem_etapa_producao', facts: data };
      }
      case 'listarPedidosEntregaPeriodo': {
        params = pickParams(intent, ['dataInicio', 'dataFim']);
        if (!params.dataInicio || !params.dataFim) {
          return { type: 'text', text: 'Faltou período de entrega (data início e fim).' };
        }
        const data = await gasGet(config, action, params);
        return { type: 'organic', kind: 'entregas_no_periodo', facts: data };
      }
      case 'agregarPecasAbertos': {
        params = pickParams(intent, ['cor', 'corMalha']);
        if (params.corMalha && !params.cor) params.cor = params.corMalha;
        const data = await gasGet(config, 'agregarPecasAbertos', { cor: params.cor || '' });
        return { type: 'organic', kind: 'pecas_por_tamanho_abertos', facts: data };
      }
      case 'listarPedidos': {
        params = pickParams(intent, ['filtro']);
        const data = await gasGet(config, action, { filtro: params.filtro || '' });
        if (!data.sucesso) return { type: 'text', text: `Erro: ${data.erro || 'listar'}` };
        return { type: 'organic', kind: 'lista_pedidos', facts: data };
      }
      case 'buscarPedidos': {
        params = pickParams(intent, ['termo']);
        if (!params.termo) return { type: 'text', text: 'Informe o que buscar (nome, telefone, ID…).' };
        const data = await gasGet(config, action, params);
        return { type: 'organic', kind: 'busca_pedidos', facts: data };
      }
      case 'buscarPedido': {
        params = pickParams(intent, ['termo']);
        if (!params.termo) return { type: 'text', text: 'Informe o pedido (ID, nome ou telefone).' };
        const data = await gasGet(config, action, params);
        return { type: 'organic', kind: 'detalhe_pedido', facts: data };
      }
      case 'relatorioPedidos': {
        params = pickParams(intent, ['dataInicio', 'dataFim', 'dimensao', 'nivel']);
        if (!params.dataInicio || !params.dataFim) {
          return { type: 'text', text: 'Informe o período do relatório (duas datas YYYY-MM-DD).' };
        }
        const data = await gasGet(config, action, {
          dataInicio: params.dataInicio,
          dataFim: params.dataFim,
          dimensao: params.dimensao || 'tipoMalha',
          nivel: params.nivel || 'item',
        });
        return { type: 'organic', kind: 'relatorio_periodo', facts: data };
      }
      default:
        return { type: 'text', text: 'Ação não suportada.' };
    }
  } catch (e) {
    return { type: 'text', text: `Erro ao consultar: ${e.message || e}` };
  }
}

async function finalizeOrganic(config, userQuestion, exec) {
  if (exec.type === 'text') return exec.text;
  const organic = await synthesizeOrganicAnswer(config, userQuestion, {
    kind: exec.kind,
    facts: exec.facts,
  });
  if (organic) return organic;
  return formatIntentFallback(exec.kind, exec.facts);
}

/**
 * Interpreta pergunta em linguagem natural, executa GET no Apps Script e devolve resposta organica (Gemini) quando possivel.
 */
async function runNaturalLanguage(config, userQuestion) {
  if (!config.geminiApiKey || !config.naturalLanguageEnabled) {
    return null;
  }

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const userPrompt = `Pergunta do usuario (apos o gatilho do bot):\n"""${String(userQuestion).slice(0, 2000)}"""`;

  const { result, modelUsed } = await generateWithModelFallback(
    genAI,
    config.geminiModel,
    {
      systemInstruction: `${buildSystemPrompt()}\n\nResponda APENAS um objeto JSON valido, sem markdown nem texto fora do JSON.`,
      generationConfig: {
        temperature: 0.12,
        maxOutputTokens: 1024,
      },
    },
    userPrompt,
  );
  if (modelUsed !== config.geminiModel) {
    console.log(`Gemini (roteador): fallback ${modelUsed} (config: ${config.geminiModel})`);
  }

  const raw = result.response.text();
  const intent = safeJsonParse(raw);
  if (!intent || typeof intent.action !== 'string') {
    return 'Não consegui interpretar a resposta da IA. Tente de novo ou use *ajuda*.';
  }
  const exec = await executeIntentData(config, intent);
  return finalizeOrganic(config, userQuestion, exec);
}

/** Compat: executa e devolve so texto (lista) sem segunda chamada Gemini. */
async function executeIntent(config, intent) {
  const exec = await executeIntentData(config, intent);
  if (exec.type === 'text') return exec.text;
  return formatIntentFallback(exec.kind, exec.facts);
}

module.exports = {
  runNaturalLanguage,
  executeIntent,
  executeIntentData,
  finalizeOrganic,
  segundaDomingoISO,
};
