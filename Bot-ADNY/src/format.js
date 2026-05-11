/** Alinhado a home.js: pedido em aberto = não entregue e não cancelado. */
export function pedidoEstaAberto(pedido) {
  const s = String(pedido?.statusOperacional || '').trim().toLowerCase();
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

export function formatListaAbertos(pedidos, max = 40) {
  const abertos = pedidos.filter(pedidoEstaAberto);
  if (abertos.length === 0) return 'Nenhum pedido em aberto.';
  const slice = abertos.slice(0, max);
  const linhas = slice.map((p, i) => linhaPedidoResumo(p, i));
  let out = `Pedidos em aberto (${abertos.length}${abertos.length > max ? `, mostrando ${max}` : ''}):\n${linhas.join('\n')}`;
  if (abertos.length > max) {
    out += '\n\n(Refine a busca no painel ou use "adny busca (termo)".)';
  }
  return out;
}

export function formatBuscaMultipla(data) {
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

export function formatBuscaUm(data) {
  if (!data.sucesso) return `Erro: ${data.erro || 'não encontrado'}`;
  const p = data.pedido;
  if (!p) return 'Pedido não encontrado.';
  const lines = [
    `*Pedido ${p.id}*`,
    `Cliente: ${p.cliente?.nome || '—'} (${p.cliente?.telefone || '—'})`,
    `Status: ${p.statusOperacional || '—'}`,
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

export function formatRelatorio(data) {
  if (!data.sucesso) return `Relatório: ${data.erro || 'erro'}`;
  const { periodo, grupos = [], totais = {}, dimensao, nivel } = data;
  const head = `Relatório ${periodo?.inicio} → ${periodo?.fim}\nDimensão: ${dimensao} · Nível: ${nivel}\n`;
  const tot = `*Totais:* R$ ${totais.valor ?? '—'} · ${totais.pecas ?? '—'} pç · ${totais.pedidos ?? '—'} pedidos\n`;
  const top = grupos.slice(0, 25).map((g, i) => `${i + 1}. ${g.chave}: R$ ${g.valor} (${g.pecas} pç, ${g.pedidos} ped.)`);
  return head + tot + (top.length ? top.join('\n') : '(Sem grupos.)');
}

export function helpText() {
  return [
    '*ADNY — comandos (somente leitura)*',
    'Mencione o bot com a palavra configurada (ex.: ADNY) e:',
    '· `adny abertos` — fila em aberto',
    '· `adny busca João` ou `adny busca 1234`',
    '· `adny pedido 1234` — um pedido (ID, ID busca 4 dígitos, nome ou telefone)',
    '· `adny relatorio 2025-01-01 2025-01-31` — agregado (dimensão padrão tipo malha)',
    '· `adny ajuda`',
    '',
    '_Respostas só leitura; não altera pedidos._',
  ].join('\n');
}
