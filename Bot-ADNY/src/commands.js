import { gasGet } from './gas.js';
import {
  formatListaAbertos,
  formatBuscaMultipla,
  formatBuscaUm,
  formatRelatorio,
  helpText,
} from './format.js';

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

/** Remove o gatilho e retorna o restante do comando. */
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

export function shouldHandle(config, text) {
  return mentionsTrigger(text, config.botTriggers);
}

export async function runCommand(config, text) {
  const rest = stripTrigger(text, config.botTriggers);
  const lower = rest.toLowerCase();

  if (!rest || lower === 'ajuda' || lower === 'help' || lower === '?') {
    return helpText();
  }

  if (lower === 'abertos' || lower === 'fila' || lower === 'aberto' || lower === 'em aberto') {
    const data = await gasGet(config, 'listarPedidos', { filtro: '' });
    if (!data.sucesso) return `Erro: ${data.erro || 'listar pedidos'}`;
    return formatListaAbertos(data.pedidos || []);
  }

  const mBusca = lower.match(/^busca(r)?\s+(.+)$/i);
  if (mBusca) {
    const termo = mBusca[2].trim();
    if (!termo) return 'Informe o termo: *adny busca (nome, telefone, ID…)*';
    const data = await gasGet(config, 'buscarPedidos', { termo });
    return formatBuscaMultipla(data);
  }

  const mPedido = lower.match(/^pedido\s+(.+)$/i);
  if (mPedido) {
    const termo = mPedido[1].trim();
    const data = await gasGet(config, 'buscarPedido', { termo });
    return formatBuscaUm(data);
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

  return `Não entendi. ${helpText()}`;
}
