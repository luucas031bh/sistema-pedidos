(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const number = n => Number(n || 0).toLocaleString('pt-BR');
  const stages = ['Pedido em Aberto', 'Arte', 'Insumos', 'Corte', 'Estampa', 'Costura', 'Embalo', 'Aguardando retirada'];
  let allOrders = [], filtered = [], visible = 30, selected = null;

  function message(text, kind = '') {
    $('notice').textContent = text;
    $('notice').className = 'notice ' + kind;
  }
  async function rpc(action, dados = {}) {
    const response = await fetch(window.CONFIG.APPS_SCRIPT_URL, {
      method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({action, dados})
    });
    if (!response.ok) throw new Error('Falha na comunicação.');
    const result = await response.json();
    if (!result.sucesso) throw new Error(result.code === 'VERSION_CONFLICT' ? 'Este pedido mudou em outra sessão. Recarregue antes de salvar.' : result.erro || result.code || 'Operação recusada.');
    return result;
  }
  async function loadOrders() {
    message('Carregando pedidos…');
    try {
      const entries = [];
      for (let offset = 0; ; offset += 100) {
        const result = await rpc('listOrders', {offset, limit: 100});
        entries.push(...result.pedidos);
        if (entries.length >= result.total || !result.pedidos.length) break;
      }
      allOrders = entries;
      visible = 30;
      applySearch();
      message('Dados de homologação atualizados. ' + number(entries.length) + ' pedidos carregados.', 'ok');
    } catch (error) { message(error.message, 'error'); }
  }
  function applySearch() {
    const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
    filtered = allOrders.filter(p => [p.idLegado, p.clienteNomeHistorico, p.telefoneHistorico].some(v => String(v).toLocaleLowerCase('pt-BR').includes(term)));
    $('metric-orders').textContent = number(filtered.length);
    $('metric-pieces').textContent = number(filtered.reduce((sum, p) => sum + Number(p.totalPecas || 0), 0));
    $('metric-total').textContent = money(filtered.reduce((sum, p) => sum + Number(p.totalCentavos || 0), 0));
    $('metric-balance').textContent = money(filtered.reduce((sum, p) => sum + Number(p.saldoLegadoCentavos || 0), 0));
    renderRows();
  }
  function text(parent, tag, value, className = '') {
    const node = document.createElement(tag);
    node.textContent = String(value ?? '');
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }
  function renderRows() {
    const body = $('orders-list');
    body.replaceChildren();
    filtered.slice(0, visible).forEach(p => {
      const tr = document.createElement('tr');
      const first = text(tr, 'td', p.clienteNomeHistorico);
      text(first, 'small', p.idLegado);
      text(tr, 'td', p.dataEntrega);
      const cell = document.createElement('td');
      text(cell, 'span', p.etapa || 'Não definida', 'status-pill');
      tr.appendChild(cell);
      text(tr, 'td', number(p.totalPecas));
      text(tr, 'td', money(p.totalCentavos));
      const actions = document.createElement('td');
      const button = text(actions, 'button', 'Abrir', 'secondary');
      button.addEventListener('click', () => openOrder(p.pedidoId));
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    $('page-summary').textContent = `Exibindo ${Math.min(visible, filtered.length)} de ${filtered.length}`;
    $('load-more').hidden = visible >= filtered.length;
  }
  function field(container, label, value) {
    const div = document.createElement('div'); div.className = 'detail-field';
    text(div, 'span', label); text(div, 'strong', value); container.appendChild(div);
  }
  async function openOrder(id) {
    $('modal').hidden = false;
    $('order-detail').replaceChildren();
    text($('order-detail'), 'p', 'Carregando informações…');
    try {
      const result = await rpc('getOrder', {id});
      selected = result.pedido;
      $('modal-title').textContent = selected.clienteNomeHistorico || 'Pedido';
      const area = $('order-detail'); area.replaceChildren();
      const grid = document.createElement('div'); grid.className = 'detail-grid';
      field(grid, 'Pedido', selected.idLegado);
      field(grid, 'Entrega', selected.dataEntrega);
      field(grid, 'Peças', number(selected.totalPecas));
      field(grid, 'Valor', money(selected.totalCentavos));
      field(grid, 'Entrada histórica informada', money(selected.entradaLegadaCentavos));
      field(grid, 'Saldo histórico informado', money(selected.saldoLegadoCentavos));
      area.appendChild(grid);
      text(area, 'h3', 'Produtos');
      result.produtos.forEach(item => {
        const card = document.createElement('article'); card.className = 'product-item';
        text(card, 'h3', item.nome || item.tipoPeca || 'Produto');
        text(card, 'p', [item.tipoPeca, item.detalhesPeca, item.corOriginal, item.tipoMalha].filter(Boolean).join(' · '));
        text(card, 'p', item.tamanhos.map(t => `${t.tamanhoOriginal}: ${t.quantidade}`).join(' · '));
        item.estampas.forEach(e => text(card, 'p', `${e.tecnicaOriginal} · ${e.localOriginal}${e.coresOriginal ? ' · ' + e.coresOriginal + ' cores' : ''}`));
        area.appendChild(card);
      });
      const form = document.createElement('div'); form.className = 'stage-form';
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Etapa da produção');
      stages.forEach(stage => { const option = document.createElement('option'); option.value = stage; option.textContent = stage; select.appendChild(option); });
      select.value = stages.includes(selected.etapa) ? selected.etapa : stages[0];
      const save = text(form, 'button', 'Atualizar etapa', 'primary');
      form.prepend(select);
      const closed = ['Finalizado', 'Cancelado', 'Entregue'].includes(String(selected.status));
      save.disabled = closed;
      if (closed) save.title = 'Pedido encerrado: somente leitura';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          const response = await rpc('updateOrderStage', {id: selected.pedidoId, etapa: select.value, revisao: selected.revisao});
          selected.revisao = response.revisao; selected.etapa = response.etapa;
          const local = allOrders.find(p => p.pedidoId === selected.pedidoId);
          if (local) { local.etapa = response.etapa; local.revisao = response.revisao; }
          applySearch(); message('Etapa registrada no banco de homologação.', 'ok');
        } catch (e) { message(e.message, 'error'); }
        finally { save.disabled = closed; }
      });
      area.appendChild(form);
    } catch (error) { $('order-detail').replaceChildren(); text($('order-detail'), 'p', error.message); }
  }
  function setView(view) {
    document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const labels = {home: ['Início', 'Visão geral'], orders: ['Pedidos', 'Consulta de pedidos'], production: ['Produção', 'Controle de etapas']};
    $('page-name').textContent = labels[view][0]; $('page-title').textContent = labels[view][1];
    $('sidebar').classList.remove('open'); $('menu-toggle').setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('refresh').addEventListener('click', loadOrders);
    $('search').addEventListener('input', () => {visible = 30; applySearch();});
    $('load-more').addEventListener('click', () => {visible += 30; renderRows();});
    $('close-modal').addEventListener('click', () => {$('modal').hidden = true; selected = null;});
    $('modal').addEventListener('click', e => {if (e.target === $('modal')) $('close-modal').click();});
    document.addEventListener('keydown', e => {if (e.key === 'Escape' && !$('modal').hidden) $('close-modal').click();});
    $('menu-toggle').addEventListener('click', () => {const open = $('sidebar').classList.toggle('open'); $('menu-toggle').setAttribute('aria-expanded', String(open));});
    document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    // A camada auth.js aguarda a autenticação antes de encaminhar as chamadas.
    loadOrders();
  });
})();
