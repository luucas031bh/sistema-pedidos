/** ADONAY 2.0 — schema independente; colar no NOVO projeto Apps Script. */
const ADNY2 = Object.freeze({
  spreadsheetId: '1TdFHsbIS7SsdH_ONNt4kqfIy4W_-QH8FdCzzpCwEucM',
  allowedEmails: ['lucas02bh@gmail.com', 'isabelasiray14@gmail.com'],
  schemaVersion: 1,
  tables: {
    V2_CLIENTES: ['clienteId', 'nome', 'telefone', 'criadoEm'],
    V2_PEDIDOS: ['pedidoId', 'idLegado', 'clienteId', 'clienteNomeHistorico', 'telefoneHistorico', 'dataPedido', 'dataEntrega', 'criadoEm', 'atualizadoEm', 'vendedor', 'natureza', 'status', 'etapa', 'observacoes', 'totalPecas', 'totalCentavos', 'entradaLegadaCentavos', 'saldoLegadoCentavos', 'revisao'],
    V2_PRODUTOS: ['produtoId', 'pedidoId', 'ordem', 'nome', 'tipoPeca', 'detalhesPeca', 'tipoMalha', 'corOriginal', 'quantidade', 'precoUnitarioCentavos', 'valorTotalCentavos', 'margemMarkup', 'custosLegadosJson', 'urlMockupLegado'],
    V2_GRADES: ['gradeId', 'produtoId', 'tamanhoOriginal', 'quantidade'],
    V2_ESTAMPAS: ['estampaId', 'produtoId', 'tecnicaOriginal', 'localOriginal', 'coresOriginal'],
    V2_ANEXOS: ['anexoId', 'pedidoId', 'produtoId', 'tipo', 'ordem', 'urlLegada', 'estado'],
    V2_PERSONALIZACOES: ['personalizacaoId', 'pedidoId', 'produtoId', 'dadosOriginaisJson'],
    V2_PAGAMENTOS: ['pagamentoId', 'pedidoId', 'valorCentavos', 'data', 'meio', 'confirmado', 'origem'],
    V2_EVENTOS: ['eventoId', 'pedidoId', 'autor', 'acao', 'dadosJson', 'criadoEm'],
    V2_MIGRACAO: ['idLegado', 'pedidoId', 'hashOrigem', 'importadoEm', 'resultado'],
    V2_CONFIG: ['chave', 'valor']
  }
});

function adny2Spreadsheet_() {
  return SpreadsheetApp.openById(ADNY2.spreadsheetId);
}

function adny2AssertAuthorized_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!ADNY2.allowedEmails.includes(normalized)) throw new Error('ACCESS_DENIED');
  return normalized;
}

function adny2PrepareSchema() {
  const ss = adny2Spreadsheet_();
  Object.entries(ADNY2.tables).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const empty = current.every(value => value === '');
    if (!empty && current.join('\u001f') !== headers.join('\u001f')) {
      throw new Error('SCHEMA_MISMATCH: ' + name);
    }
    if (empty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#202328').setFontColor('#ffffff');
    }
  });
}

function adny2Money_(amount) {
  const value = typeof amount === 'number' ? amount : Number(String(amount || '0').replace(',', '.'));
  if (!Number.isFinite(value)) throw new Error('INVALID_MONEY');
  return Math.round((value + Number.EPSILON) * 100);
}

function adny2Hash_(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return digest.map(n => ('0' + (n & 255).toString(16)).slice(-2)).join('');
}

function adny2Date_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM-dd');
  return String(value || '');
}
