function pedidoEstaAberto(p) {
  const s = String(p?.statusOperacional || '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (s.includes('cancel')) return false;
  if (s.includes('entregue')) return false;
  return true;
}

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
}

function linhaPedidoResumo(p, idx) {
  const id = p.id ?? '—';
  const nome = String(p.cliente?.nome || '').trim() || '—';
  const st = String(p.statusOperacional || '').trim() || '—';
  const total = fmtMoney(p.financeiro?.totalPedido);
  const pecas = p.totalPecas ?? '—';
  return `${idx + 1}. ID ${id} · ${nome} · ${pecas} pç · ${total} · ${st}`;
}

function formatListaAbertos(pedidos, max = 40) {
  const abertos = (pedidos || []).filter(pedidoEstaAberto);
  if (abertos.length === 0) return 'Nenhum pedido em aberto.';
  const slice = abertos.slice(0, max);
  const linhas = slice.map((p, i) => linhaPedidoResumo(p, i));
  let out = `Pedidos em aberto (${abertos.length}${abertos.length > max ? `, mostrando ${max}` : ''}):\n${linhas.join('\n')}`;
  if (abertos.length > max) {
    out += '\n\n(Refine com "busca (termo)".)';
  }
  return out;
}

function formatBuscaMultipla(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'falha ao buscar'}`;
  const list = data.pedidos || [];
  if (list.length === 0) return 'Nenhum pedido encontrado para esse termo.';
  const max = 15;
  const slice = list.slice(0, max);
  const linhas = slice.map((p, i) => linhaPedidoResumo(p, i));
  let msg = `Encontrados ${list.length} pedido(s)${list.length > max ? ` (mostrando ${max})` : ''}:\n${linhas.join('\n')}`;
  if (list.length > max) msg += '\n\n(Seja mais específico no termo.)';
  return msg;
}

function formatBuscaUm(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'não encontrado'}`;
  const p = data.pedido;
  if (!p) return 'Pedido não encontrado.';
  const lines = [
    `*Pedido ${p.id}*`,
    `Cliente: ${p.cliente?.nome || '—'} (${p.cliente?.telefone || '—'})`,
    `Status: ${p.statusOperacional || '—'}`,
    `Etapa produção: ${p.etapaProducaoAtual || '—'}`,
    `Peças: ${p.totalPecas ?? '—'} · Total: ${fmtMoney(p.financeiro?.totalPedido)}`,
    `Pago: ${fmtMoney(p.financeiro?.valorEntrada)} · Restante: ${fmtMoney(p.financeiro?.restante)}`,
    `Pedido: ${p.datas?.pedido ?? '—'} · Entrega: ${p.datas?.entrega ?? '—'}`,
  ];
  if (p.produtos?.length) {
    lines.push(`Produtos: ${p.produtos.length} linha(s) no pedido.`);
  }
  const obs = String(p.observacoes || '').trim();
  if (obs) lines.push(`Obs: ${obs.slice(0, 500)}${obs.length > 500 ? '…' : ''}`);
  return lines.join('\n');
}

function formatRelatorio(data) {
  if (!data.sucesso) return `Relatório: ${data.erro || 'erro'}`;
  const { periodo, grupos = [], totais = {}, dimensao, nivel } = data;
  const head = `Relatório ${periodo?.inicio} → ${periodo?.fim}\nDimensão: ${dimensao} · Nível: ${nivel}\n`;
  const tot = `*Totais:* R$ ${totais.valor ?? '—'} · ${totais.pecas ?? '—'} pç · ${totais.pedidos ?? '—'} pedidos\n`;
  const top = grupos.slice(0, 25).map((g, i) => `${i + 1}. ${g.chave}: R$ ${g.valor} (${g.pecas} pç, ${g.pedidos} ped.)`);
  return head + tot + (top.length ? top.join('\n') : '(Sem grupos.)');
}

function formatContagemEtapa(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'contagem'}`;
  const ids = (data.ids || []).slice(0, 30);
  const extra = data.total > ids.length ? `\n_(+${data.total - ids.length} IDs omitidos)_` : '';
  return `*Etapa ${data.etapa}:* ${data.total} pedido(s)\n${ids.length ? `IDs: ${ids.join(', ')}` : ''}${extra}`;
}

function formatEntregasPeriodo(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'lista'}`;
  const ped = data.pedidos || [];
  if (ped.length === 0) {
    return `Nenhum pedido com entrega entre *${data.periodo?.inicio}* e *${data.periodo?.fim}*.`;
  }
  const max = 40;
  const slice = ped.slice(0, max);
  const linhas = slice.map(
    (p, i) =>
      `${i + 1}. ID ${p.id} · ${p.cliente || '—'} · entrega ${p.entrega} · ${p.statusOperacional || '—'} · ${p.etapaProducaoAtual || '—'}`,
  );
  let out = `*Entregas no período* (${data.periodo?.inicio} → ${data.periodo?.fim})\nTotal: ${ped.length}\n\n${linhas.join('\n')}`;
  if (ped.length > max) out += `\n\n_(Mostrando ${max} de ${ped.length}.)_`;
  return out;
}

function formatAgregacaoTamanhos(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'agregação'}`;
  const map = data.totaisPorTamanho || {};
  const keys = Object.keys(map);
  if (keys.length === 0) {
    return data.corFiltro
      ? `Nenhuma peça em pedido aberto com cor contendo "${data.corFiltro}".`
      : 'Nenhuma peça encontrada em pedidos abertos.';
  }
  const linhas = keys.map((k) => `· ${k}: *${map[k]}* pç`);
  const filtro = data.corFiltro ? `\nFiltro cor: _${data.corFiltro}_\n` : '\n';
  return `*Peças por tamanho* (pedidos em aberto)${filtro}Total: *${data.totalPecas}* pç · Pedidos: *${data.pedidosComPeca}*\n\n${linhas.join('\n')}`;
}

function helpText() {
  return [
    '*Consulta sistema-pedidos (somente leitura)*',
    'Mencione o gatilho (ex.: ADNY) e:',
    '· `adny abertos` — fila em aberto',
    '· `adny busca João` ou `adny busca 1234`',
    '· `adny pedido 1234` — detalhe de um pedido',
    '· `adny relatorio 2025-01-01 2025-01-31` — agregado (tipo malha)',
    '· `adny etapa Arte` — quantos pedidos na etapa de produção',
    '· `adny entregas semana` — entregas da semana (seg–dom, data local do servidor)',
    '· `adny tamanhos` — peças por tamanho em pedidos abertos',
    '· `adny tamanhos preta` — idem, malha cuja cor contém "preta"',
    '· `adny ajuda`',
    '',
    '_Não altera pedidos; só consulta a planilha via Web App._',
  ].join('\n');
}

module.exports = {
  formatListaAbertos,
  formatBuscaMultipla,
  formatBuscaUm,
  formatRelatorio,
  formatContagemEtapa,
  formatEntregasPeriodo,
  formatAgregacaoTamanhos,
  helpText,
};
