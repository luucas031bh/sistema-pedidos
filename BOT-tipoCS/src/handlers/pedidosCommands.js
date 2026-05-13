const { gasGet } = require('../services/gasGet');
const { runNaturalLanguage, segundaDomingoISO, finalizeOrganic } = require('../ai/nlIntent');
const {
  formatBuscaMultipla,
  formatBuscaUm,
  formatEntregasPeriodo,
  formatIntentFallback,
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

/** Frases tipo "lista de pedidos para entregar essa semana" — sem roteador Gemini. */
function matchEntregaEstaSemana(lower) {
  if (/\bentregas?\s+semana\b/i.test(lower) || lower === 'entrega semana') return true;
  const semanaAtual = /\b(es[st]a)\s+semana\b/i.test(lower);
  const intencaoEntrega = /(entregas?|entregar|entregue|entregues|entreguem)/i.test(lower);
  const pedidoOuLista = /\b(pedidos?|lista)\b/i.test(lower);
  if (semanaAtual && intencaoEntrega) return true;
  if (/\bsemana\b/i.test(lower) && intencaoEntrega && pedidoOuLista) return true;
  return false;
}

/**
 * Comandos explícitos. Retorna envelope para resposta orgânica ou null.
 * @returns {Promise<null | { type: 'text', text: string } | { type: 'organic', kind: string, facts: object }>}
 */
async function tryStructuredCommand(config, rest) {
  const lower = rest.toLowerCase();

  if (lower === 'abertos' || lower === 'fila' || lower === 'aberto' || lower === 'em aberto') {
    const data = await gasGet(config, 'listarPedidos', { filtro: '' });
    if (!data.sucesso) return { type: 'text', text: `Erro: ${data.erro || 'listar pedidos'}` };
    return { type: 'organic', kind: 'lista_pedidos', facts: data };
  }

  const mBusca = lower.match(/^busca(r)?\s+(.+)$/i);
  if (mBusca) {
    const termo = mBusca[2].trim();
    if (!termo) return { type: 'text', text: 'Informe o termo: *busca (nome, telefone, ID…)*' };
    const data = await gasGet(config, 'buscarPedidos', { termo });
    return { type: 'organic', kind: 'busca_pedidos', facts: data };
  }

  const mPedido = lower.match(/^pedido\s+(.+)$/i);
  if (mPedido) {
    const termo = mPedido[1].trim();
    const data = await gasGet(config, 'buscarPedido', { termo });
    return { type: 'organic', kind: 'detalhe_pedido', facts: data };
  }

  const mEtapa = lower.match(/^etapa\s+(.+)$/i);
  if (mEtapa) {
    const etapaNome = mEtapa[1].trim();
    const data = await gasGet(config, 'contarPorEtapaProducao', {
      etapa: etapaNome,
      excluirCancelados: 'true',
    });
    return { type: 'organic', kind: 'contagem_etapa_producao', facts: data };
  }

  if (matchEntregaEstaSemana(lower)) {
    const { dataInicio, dataFim } = segundaDomingoISO(new Date());
    const data = await gasGet(config, 'listarPedidosEntregaPeriodo', { dataInicio, dataFim });
    return { type: 'organic', kind: 'entregas_no_periodo', facts: data };
  }

  const mTam = lower.match(/^tamanhos(?:\s+(.+))?$/i);
  if (mTam) {
    const corExtra = (mTam[1] || '').trim();
    const data = await gasGet(config, 'agregarPecasAbertos', { cor: corExtra });
    return { type: 'organic', kind: 'pecas_por_tamanho_abertos', facts: data };
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
    return { type: 'organic', kind: 'relatorio_periodo', facts: data };
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const [dataInicio, dataFim] = rest.split(/\s+/);
    const data = await gasGet(config, 'relatorioPedidos', {
      dataInicio,
      dataFim,
      dimensao: 'tipoMalha',
      nivel: 'item',
    });
    return { type: 'organic', kind: 'relatorio_periodo', facts: data };
  }

  return null;
}

/** Se nao houver Gemini ou respostas organicas desligadas, devolve texto em formato lista. */
function structuredPlainText(exec) {
  if (exec.type === 'text') return exec.text;
  return formatIntentFallback(exec.kind, exec.facts);
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
    if (config.naturalLanguageEnabled && config.geminiOrganicResponses) {
      const out = await finalizeOrganic(config, rest, structured);
      return out;
    }
    return structuredPlainText(structured);
  }

  if (config.naturalLanguageEnabled) {
    try {
      const nl = await runNaturalLanguage(config, rest);
      if (nl) return nl;
    } catch (e) {
      console.error('IA (Gemini):', e);
      if (matchEntregaEstaSemana(lower)) {
        try {
          const { dataInicio, dataFim } = segundaDomingoISO(new Date());
          const data = await gasGet(config, 'listarPedidosEntregaPeriodo', { dataInicio, dataFim });
          const exec = { type: 'organic', kind: 'entregas_no_periodo', facts: data };
          const lista = config.geminiOrganicResponses
            ? await finalizeOrganic(config, rest, exec).catch(() => formatEntregasPeriodo(data))
            : formatEntregasPeriodo(data);
          return `${lista}\n\n_(IA indisponível; dados acima vêm da planilha.)_`;
        } catch (e2) {
          console.error('Fallback entrega semana:', e2);
        }
      }
      const msg = String(e && e.message ? e.message : e);
      if (/429|quota|Quota|RESOURCE_EXHAUSTED/i.test(msg)) {
        return [
          '*Cota do Gemini esgotada ou modelo sem uso gratuito (429).*',
          '· No `.env` use `GEMINI_MODEL=gemini-2.5-flash` ou `gemini-2.5-flash-lite` e reinicie;',
          '· Ou crie outra chave / ative faturamento em Google AI Studio.',
          '· `GEMINI_ORGANIC_RESPONSES=false` reduz chamadas (só roteador ou listas).',
          '',
          '*Sem IA:* `ADNY entregas semana` ou pergunte de novo com *lista* + *pedidos* + *entrega* + *essa semana*.',
        ].join('\n');
      }
      return `Falha na interpretação por IA:\n${msg.slice(0, 500)}\n\nTente *ajuda* ou comandos fixos.`;
    }
  }

  const termoDireto = rest.trim();
  if (termoDireto.length >= 2) {
    const dataUm = await gasGet(config, 'buscarPedido', { termo: termoDireto });
    if (dataUm.sucesso && dataUm.pedido) {
      const exec = { type: 'organic', kind: 'detalhe_pedido', facts: dataUm };
      if (config.naturalLanguageEnabled && config.geminiOrganicResponses) {
        return finalizeOrganic(config, rest, exec);
      }
      return formatBuscaUm(dataUm);
    }
    const dataMulti = await gasGet(config, 'buscarPedidos', { termo: termoDireto });
    if (dataMulti.sucesso && (dataMulti.pedidos || []).length > 0) {
      const exec = { type: 'organic', kind: 'busca_pedidos', facts: dataMulti };
      if (config.naturalLanguageEnabled && config.geminiOrganicResponses) {
        return finalizeOrganic(config, rest, exec);
      }
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
