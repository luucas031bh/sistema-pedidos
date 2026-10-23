/** Migra exclusivamente a aba PEDIDOS da CÓPIA, sem tocar no banco original. */
function adny2AnalyzeMigration() {
  const source = adny2ReadLegacy_();
  const projection = adny2Project_(source);
  return projection.report;
}

function adny2ImportHistoricalOrders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('MIGRATION_BUSY');
  try {
    adny2PrepareSchema();
    const ss = adny2Spreadsheet_();
    const source = adny2ReadLegacy_();
    const projection = adny2Project_(source);
    if (!projection.report.pedidos) throw new Error('EMPTY_LEGACY_SOURCE');
    const existing = ss.getSheetByName('V2_MIGRACAO');
    if (existing.getLastRow() > 1) throw new Error('MIGRATION_ALREADY_RUN: review before retry');
    Object.keys(projection.tables).forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (sheet.getLastRow() > 1) throw new Error('TARGET_NOT_EMPTY: ' + name);
    });
    // Confere todas as matrizes antes da primeira escrita.
    Object.entries(projection.tables).forEach(([name, rows]) => {
      const width = ADNY2.tables[name].length;
      if (rows.some(row => row.length !== width)) throw new Error('ROW_WIDTH: ' + name);
    });
    const projected = projection.tables.V2_PEDIDOS;
    if (projected.length !== projection.report.pedidos ||
        projected.reduce((n, row) => n + Number(row[14]), 0) !== projection.report.pecas ||
        projected.reduce((n, row) => n + Number(row[15]), 0) !== projection.report.totalCentavos) {
      throw new Error('PREWRITE_VALIDATION_FAILED');
    }
    Object.entries(projection.tables).forEach(([name, rows]) => {
      if (rows.length) ss.getSheetByName(name).getRange(2, 1, rows.length, ADNY2.tables[name].length).setValues(rows);
    });
    const persisted = ss.getSheetByName('V2_PEDIDOS').getRange(2, 1, projected.length, ADNY2.tables.V2_PEDIDOS.length).getValues();
    if (persisted.length !== projected.length ||
        persisted.reduce((n, row) => n + Number(row[14]), 0) !== projection.report.pecas ||
        persisted.reduce((n, row) => n + Number(row[15]), 0) !== projection.report.totalCentavos) {
      throw new Error('POSTWRITE_VALIDATION_FAILED: do not retry automatically');
    }
    return Object.assign({}, projection.report, {status: 'importado_e_conferido'});
  } finally {
    lock.releaseLock();
  }
}

function adny2ReadLegacy_() {
  const sheet = adny2Spreadsheet_().getSheetByName('PEDIDOS');
  if (!sheet) throw new Error('LEGACY_SHEET_MISSING');
  const rows = sheet.getDataRange().getValues();
  if (!rows.length || String(rows[0][0]).trim() !== 'ID') throw new Error('LEGACY_SCHEMA_UNEXPECTED');
  const headers = rows[0].map(value => String(value || '').trim());
  const required = ['ID', 'Nome Cliente', 'Telefone', 'Data Pedido', 'Data Entrega', 'Total Peças', 'Produtos', 'Observações', 'Valor Total', 'Entrada', 'Restante', 'Status'];
  required.forEach(name => { if (!headers.includes(name)) throw new Error('LEGACY_COLUMN_MISSING: ' + name); });
  return {headers, rows: rows.slice(1).filter(row => String(row[0] || '').trim() !== '')};
}

function adny2LegacyStage_(column, row, parsed) {
  const valid = ['Pedido em Aberto', 'Arte', 'Insumos', 'Corte', 'Estampa', 'Costura', 'Embalo', 'Aguardando retirada'];
  const embedded = String(parsed.etapaProducaoAtual || '').trim();
  const exact = valid.find(stage => stage.toLowerCase() === embedded.toLowerCase());
  if (exact) return exact;
  const flagged = value => value === true || value === 1 || ['TRUE', 'VERDADEIRO', 'SIM', '1'].includes(String(value || '').trim().toUpperCase());
  const milestones = [
    ['PRONTO PARA ENVIO', 'Aguardando retirada'],
    ['COSTURA', 'Costura'],
    ['ESTAMPA PRODUÇÃO', 'Estampa'],
    ['CORTE', 'Corte'],
    ['OS', 'Insumos'],
    ['ARTE', 'Arte']
  ];
  const reached = milestones.find(([name]) => flagged(column(row, name)));
  return reached ? reached[1] : 'Pedido em Aberto';
}

function adny2Project_(source) {
  const rows = source.rows;
  const headers = source.headers;
  const column = (row, name) => {
    const index = headers.indexOf(name);
    return index < 0 ? '' : row[index];
  };
  const tables = Object.fromEntries(Object.keys(ADNY2.tables).map(name => [name, []]));
  const unique = new Set();
  let pieces = 0, products = 0, cents = 0;
  const now = new Date().toISOString();
  rows.forEach(row => {
    const legacyId = String(row[0]).trim();
    if (unique.has(legacyId)) throw new Error('DUPLICATE_LEGACY_ID: ' + legacyId);
    unique.add(legacyId);
    const payloadText = String(column(row, 'Produtos') || '');
    let parsed;
    try { parsed = JSON.parse(payloadText); } catch (e) { throw new Error('INVALID_JSON: ' + legacyId); }
    const items = Array.isArray(parsed) ? parsed : parsed && parsed.produtos;
    if (!Array.isArray(items)) throw new Error('NO_PRODUCTS: ' + legacyId);
    const pedidoId = 'P2-' + adny2Hash_(legacyId).slice(0, 20);
    // Não mescla clientes por telefone ou nome: identidade exige conferência humana.
    const clienteId = 'C2-' + adny2Hash_(legacyId).slice(0, 20);
    const rowPieces = Number(column(row, 'Total Peças') || 0);
    const rowTotal = adny2Money_(column(row, 'Valor Total'));
    const rowEntrance = adny2Money_(column(row, 'Entrada'));
    const rowBalance = adny2Money_(column(row, 'Restante'));
    const itemPieces = items.reduce((sum, item) => sum + (item.tamanhos || []).reduce((s, size) => s + Number(size.quantidade || 0), 0), 0);
    const itemTotal = items.reduce((sum, item) => sum + adny2Money_(item.valorTotal), 0);
    if (itemPieces !== rowPieces || Math.abs(itemTotal - rowTotal) > 1) throw new Error('TOTAL_MISMATCH: ' + legacyId);
    pieces += rowPieces; products += items.length; cents += rowTotal;
    tables.V2_CLIENTES.push([clienteId, String(column(row, 'Nome Cliente') || ''), String(column(row, 'Telefone') || ''), now]);
    tables.V2_PEDIDOS.push([pedidoId, legacyId, clienteId, String(column(row, 'Nome Cliente') || ''), String(column(row, 'Telefone') || ''), adny2Date_(column(row, 'Data Pedido')), adny2Date_(column(row, 'Data Entrega')), column(row, 'Data Criação') || '', column(row, 'Data Modificação') || '', column(row, 'Vendedor') || '', column(row, 'Tag Pedido') || '', column(row, 'Status') || '', adny2LegacyStage_(column, row, parsed), column(row, 'Observações') || '', rowPieces, rowTotal, rowEntrance, rowBalance, 1]);
    items.forEach((item, index) => {
      const produtoId = pedidoId + '-I' + (index + 1);
      const sizes = item.tamanhos || [];
      const quantity = sizes.reduce((sum, size) => sum + Number(size.quantidade || 0), 0);
      tables.V2_PRODUTOS.push([produtoId, pedidoId, index + 1, item.nomeProduto || '', item.tipoPeca || '', item.detalhesPeca || '', item.tipoMalha || '', item.corMalha || '', quantity, adny2Money_(item.precoUnitario), adny2Money_(item.valorTotal), Number(item.margemLucro || 0), JSON.stringify(item.custos || {}), item.urlMockup || '']);
      sizes.forEach((size, n) => tables.V2_GRADES.push([produtoId + '-T' + (n + 1), produtoId, String(size.tamanho || ''), Number(size.quantidade || 0)]));
      (item.estampas || []).forEach((print, n) => tables.V2_ESTAMPAS.push([produtoId + '-E' + (n + 1), produtoId, print.tipo || '', print.localidade || '', String(print.quantidadeCores || '')]));
      if (item.urlMockup) tables.V2_ANEXOS.push([produtoId + '-M', pedidoId, produtoId, 'mockup', 0, item.urlMockup, 'legado']);
    });
    const mockup = column(row, 'URL Mockup');
    if (mockup) tables.V2_ANEXOS.push([pedidoId + '-M', pedidoId, '', 'mockup', 0, mockup, 'legado']);
    for (let i = 1; i <= 10; i++) {
      const url = column(row, 'URL Arte ' + i);
      if (url) tables.V2_ANEXOS.push([pedidoId + '-A' + i, pedidoId, '', 'arte', i, url, 'legado']);
    }
    const personalization = column(row, 'Lista Personalização');
    if (personalization) tables.V2_PERSONALIZACOES.push([pedidoId + '-L', pedidoId, '', String(personalization)]);
    tables.V2_MIGRACAO.push([legacyId, pedidoId, adny2Hash_(JSON.stringify(row)), now, 'importado']);
  });
  return { tables, report: {pedidos: rows.length, produtos: products, pecas: pieces, totalCentavos: cents, listas: tables.V2_PERSONALIZACOES.length, anexos: tables.V2_ANEXOS.length, status: 'validado_em_memoria'} };
}
