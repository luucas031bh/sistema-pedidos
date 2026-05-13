const { gasGet } = require('../services/gasGet');
const { runNaturalLanguage, segundaDomingoISO } = require('../ai/nlIntent');
const {
  formatListaAbertos,
  formatBuscaMultipla,
  formatBuscaUm,
  formatRelatorio,
  formatContagemEtapa,
  formatEntregasPeriodo,
  formatAgregacaoTamanhos,
  helpText,
} = require('../format/respostas');

function trimmedOriginal(text) {
  return String(text || '').trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsTrigger(text, triggers) {
  const t = trimmedOriginal(text);
  if (!t) return false;
  if (/^\/adny\b/i.test(t)) return true;
  const lower = t.toLowerCase();
  return triggers.some((name) => {
    const re = new RegExp(`(?:@\\s*)?\\b${escapeRe(name)}\\b`, 'i');
    return re.test(lower);
  });
}

function stripTrigger(text, triggers) {
  const raw = trimmedOriginal(text);
  if (/^\/adny\b/i.test(raw)) {
    return raw.replace(/^\/adny\s*/i, '').trim();
  }
  let s = raw;
  const lower = s.toLowerCase();
  for (const name of triggers) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx !== -1) {
      return s.slice(idx + name.length).replace(/^[\s:,-]+/, '').trim();
    }
  }
  return s.trim();
}

/**
 * Comandos explícitos (sem IA). Retorna null se nada casou — aí pode tentar linguagem natural.
 */
async function tryStructuredCommand(config, rest) {
  const lower = rest.toLowerCase();

  if (lower === 'abertos' || lower === 'fila' || lower === 'aberto' || lower === 'em aberto') {
    const data = await gasGet(config, 'listarPedidos', { filtro: '' });
    if (!data.sucesso) return `Erro: ${data.erro || 'listar pedidos'}`;
    return formatListaAbertos(data.pedidos || []);
  }

  const mBusca = lower.match(/^busca(r)?\s+(.+)$/i);
  if (mBusca) {
    const termo = mBusca[2].trim();
    if (!termo) return 'Informe o termo: *busca (nome, telefone, ID…)*';
    const data = await gasGet(config, 'buscarPedidos', { termo });
    return formatBuscaMultipla(data);
  }

  const mPedido = lower.match(/^pedido\s+(.+)$/i);
  if (mPedido) {
    const termo = mPedido[1].trim();
    const data = await gasGet(config, 'buscarPedido', { termo });
    return formatBuscaUm(data);
  }

  const mEtapa = lower.match(/^etapa\s+(.+)$/i);
  if (mEtapa) {
    const etapaNome = mEtapa[1].trim();
    const data = await gasGet(config, 'contarPorEtapaProducao', {
      etapa: etapaNome,
      excluirCancelados: 'true',
    });
    return formatContagemEtapa(data);
  }

  if (/\bentregas?\s+semana\b/i.test(lower) || lower === 'entrega semana') {
    const { dataInicio, dataFim } = segundaDomingoISO(new Date());
    const data = await gasGet(config, 'listarPedidosEntregaPeriodo', { dataInicio, dataFim });
    return formatEntregasPeriodo(data);
  }

  const mTam = lower.match(/^tamanhos(?:\s+(.+))?$/i);
  if (mTam) {
    const corExtra = (mTam[1] || '').trim();
    const data = await gasGet(config, 'agregarPecasAbertos', { cor: corExtra });
    return formatAgregacaoTamanhos(data);
  }

  const mRel = lower.match(
    /^relat[oó]rio\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})(?:\s+(\w+))?\s*$/i,
  );
  if (mRel) {
    const [, dataInicio, dataFim, dimensao] = mRel;
    const data = await gasGet(config, 'relatorioPedidos', {
      dataInicio,
      dataFim,
      dimensao: dimensao || 'tipoMalha',
      nivel: 'item',
    });
    return formatRelatorio(data);
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const [dataInicio, dataFim] = rest.split(/\s+/);
    const data = await gasGet(config, 'relatorioPedidos', {
      dataInicio,
      dataFim,
      dimensao: 'tipoMalha',
      nivel: 'item',
    });
    return formatRelatorio(data);
  }

  return null;
}

function shouldHandle(config, text) {
  return mentionsTrigger(text, config.botTriggers);
}

async function runCommand(config, text) {
  const triggers = config.botTriggers;
  const rest = stripTrigger(text, triggers);
  const lower = rest.toLowerCase();

  if (!rest || lower === 'ajuda' || lower === 'help' || lower === '?') {
    return helpText();
  }

  const structured = await tryStructuredCommand(config, rest);
  if (structured !== null) {
    return structured;
  }

  if (config.naturalLanguageEnabled) {
    try {
      const nl = await runNaturalLanguage(config, rest);
      if (nl) return nl;
    } catch (e) {
      console.error('IA (Gemini):', e);
      return `Falha na interpretação por IA: ${e.message || e}\n\nTente um comando fixo ou veja *ajuda*.`;
    }
  }

  const termoDireto = rest.trim();
  if (termoDireto.length >= 2) {
    const dataUm = await gasGet(config, 'buscarPedido', { termo: termoDireto });
    if (dataUm.sucesso && dataUm.pedido) return formatBuscaUm(dataUm);
    const dataMulti = await gasGet(config, 'buscarPedidos', { termo: termoDireto });
    if (dataMulti.sucesso && (dataMulti.pedidos || []).length > 0) {
      return formatBuscaMultipla(dataMulti);
    }
    if (dataUm.sucesso === false && dataUm.erro) {
      return `Não encontrado: ${dataUm.erro}\n\n${helpText()}`;
    }
  }

  if (config.naturalLanguageEnabled) {
    return `Não entendi. ${helpText()}`;
  }
  return `Não entendi. Configure *GEMINI_API_KEY* no .env para perguntas em linguagem natural, ou use:\n${helpText()}`;
}

module.exports = { shouldHandle, runCommand, stripTrigger };
