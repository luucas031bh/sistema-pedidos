/** API de homologação. Requer Auth.gs do projeto atual, com ALLOWLIST V2. */
function doGet() {
  return adny2Json_({sucesso: true, app: 'ADONAY 2.0', estado: 'homologacao'});
}

function doPost(event) {
  let data;
  try {
    data = JSON.parse(event && event.postData && event.postData.contents || '{}');
    const action = String(data.action || '');
    const payload = data.dados || {};
    if (action === 'authStart') return adny2Json_(authStart_(payload));
    if (action === 'authExchange') return adny2Json_(authExchange_(payload));
    if (action === 'authLogout') return adny2Json_(authLogout_(data.authSession));
    const session = authSession_(data.authSession);
    if (!session) return adny2Json_({sucesso: false, code: 'AUTH_REQUIRED'});
    const email = adny2AssertAuthorized_(session.email);
    if (action === 'authCheck') return adny2Json_({sucesso: true, email: email});
    if (action === 'listOrders') return adny2Json_(adny2ListOrders_(payload));
    if (action === 'getOrder') return adny2Json_(adny2GetOrder_(payload.id));
    if (action === 'updateOrderStage') return adny2Json_(adny2UpdateStage_(payload, email));
    return adny2Json_({sucesso: false, code: 'UNKNOWN_ACTION'});
  } catch (e) {
    const error = String(e && e.message || e);
    const allowed = ['ACCESS_DENIED', 'SCHEMA_MISMATCH', 'ORDER_NOT_FOUND', 'VERSION_CONFLICT', 'INVALID_STAGE', 'ORDER_CLOSED', 'MIGRATION_REQUIRED'];
    const code = allowed.find(x => error.startsWith(x)) || 'INTERNAL_ERROR';
    return adny2Json_({sucesso: false, code: code, erro: code === 'INTERNAL_ERROR' ? 'Não foi possível concluir a operação.' : error});
  }
}

function adny2Json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function adny2Table_(name) {
  const sheet = adny2Spreadsheet_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('MIGRATION_REQUIRED');
  const expected = ADNY2.tables[name];
  const headers = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  if (headers.join('|') !== expected.join('|')) throw new Error('SCHEMA_MISMATCH');
  return {sheet, headers: expected, rows: sheet.getRange(2, 1, sheet.getLastRow() - 1, expected.length).getValues()};
}

function adny2ToObject_(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
}

function adny2ListOrders_(request) {
  const table = adny2Table_('V2_PEDIDOS');
  const term = String(request.term || '').trim().toLocaleLowerCase('pt-BR');
  const stage = String(request.etapa || '').trim();
  const limit = Math.max(1, Math.min(100, Number(request.limit) || 40));
  const offset = Math.max(0, Number(request.offset) || 0);
  const items = table.rows.map(row => adny2ToObject_(table.headers, row)).filter(order =>
    (!stage || String(order.etapa) === stage) &&
    (!term || [order.idLegado, order.clienteNomeHistorico, order.telefoneHistorico].some(value => String(value).toLocaleLowerCase('pt-BR').includes(term)))
  ).sort((a, b) => String(a.dataEntrega).localeCompare(String(b.dataEntrega)));
  return {sucesso: true, total: items.length, pedidos: items.slice(offset, offset + limit)};
}

function adny2GetOrder_(id) {
  const pedidoId = String(id || '');
  const orders = adny2Table_('V2_PEDIDOS');
  const row = orders.rows.find(row => row[0] === pedidoId || row[1] === pedidoId);
  if (!row) throw new Error('ORDER_NOT_FOUND');
  const order = adny2ToObject_(orders.headers, row);
  const products = adny2Table_('V2_PRODUTOS');
  const items = products.rows.filter(row => row[1] === order.pedidoId).map(row => adny2ToObject_(products.headers, row));
  const grades = adny2Table_('V2_GRADES');
  const prints = adny2Table_('V2_ESTAMPAS');
  items.forEach(item => {
    item.tamanhos = grades.rows.filter(row => row[1] === item.produtoId).map(row => adny2ToObject_(grades.headers, row));
    item.estampas = prints.rows.filter(row => row[1] === item.produtoId).map(row => adny2ToObject_(prints.headers, row));
  });
  return {sucesso: true, pedido: order, produtos: items};
}

const ADNY2_STAGES = ['Pedido em Aberto', 'Arte', 'Insumos', 'Corte', 'Estampa', 'Costura', 'Embalo', 'Aguardando retirada'];

function adny2UpdateStage_(request, actor) {
  const id = String(request.id || '');
  const stage = String(request.etapa || '');
  const expectedRevision = Number(request.revisao);
  if (!ADNY2_STAGES.includes(stage)) throw new Error('INVALID_STAGE');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('VERSION_CONFLICT');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('VERSION_CONFLICT');
  try {
    const table = adny2Table_('V2_PEDIDOS');
    const index = table.rows.findIndex(row => row[0] === id);
    if (index < 0) throw new Error('ORDER_NOT_FOUND');
    const row = table.rows[index];
    if (Number(row[18]) !== expectedRevision) throw new Error('VERSION_CONFLICT');
    if (['Cancelado', 'Finalizado', 'Entregue'].includes(String(row[11]))) throw new Error('ORDER_CLOSED');
    const previous = String(row[12] || '');
    const nextRevision = expectedRevision + 1;
    const now = new Date().toISOString();
    // Cada escrita aponta para o ID completo e para a revisão validada.
    table.sheet.getRange(index + 2, 13).setValue(stage);
    table.sheet.getRange(index + 2, 9).setValue(now);
    table.sheet.getRange(index + 2, 19).setValue(nextRevision);
    const eventSheet = adny2Spreadsheet_().getSheetByName('V2_EVENTOS');
    eventSheet.appendRow([Utilities.getUuid(), id, actor, 'ETAPA_ALTERADA', JSON.stringify({de: previous, para: stage, revisao: nextRevision}), now]);
    return {sucesso: true, pedidoId: id, etapa: stage, revisao: nextRevision};
  } finally {
    lock.releaseLock();
  }
}
