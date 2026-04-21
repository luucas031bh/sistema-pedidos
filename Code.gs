// ================= CONFIG =================
const CONFIG = {
  ABAS: {
    PEDIDOS: 'PEDIDOS',
    CUSTOS_MALHAS: 'CUSTOS_MALHAS',
    CUSTOS_MAO_OBRA: 'CUSTOS_MAO_OBRA',
    CUSTOS_ESTAMPAS: 'CUSTOS_ESTAMPAS',
    LOCALIDADES_ESTAMPAS: 'LOCALIDADES_ESTAMPAS',
    DASHBOARD_DATA: 'DASHBOARD_DATA'
  }
};

// ================= INIT =================
function criarTodasAbas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(CONFIG.ABAS).forEach(function(nome) {
    if (!ss.getSheetByName(nome)) ss.insertSheet(nome);
  });

  const pedidos = ss.getSheetByName(CONFIG.ABAS.PEDIDOS);
  if (pedidos.getLastRow() === 0) {
    pedidos.appendRow([
      'ID', 'Nome Cliente', 'Telefone', 'Data Pedido', 'Data Entrega',
      'Total Peças', 'Produtos', 'Observações', 'Valor Total', 'Entrada',
      'Restante', 'Status', 'Data Criação', 'Data Modificação',
      'ARTE', 'OS', 'CORTE', 'COSTURA', 'ESTAMPA PRODUÇÃO', 'PRONTO PARA ENVIO',
      'Tipo Peça', 'Tipo Malha', 'Cor Malha', 'Detalhe Peça', 'Estampa Resumo',
      'Vendedor', 'Tag Pedido'
    ]);
  }
  return { sucesso: true, mensagem: 'Banco criado com sucesso' };
}

/**
 * Migração: planilhas que só tinham colunas A–N (até Data Modificação).
 * 1) Rode expandirCabecalhoPedidos() ou migrarPedidosPlanilhaAntiga() uma vez no editor (Executar).
 * 2) IDs duplicados (ex.: várias linhas com 1133): apague ou una manualmente — mantenha uma linha por ID.
 *    Caso contrário o painel e a edição podem mostrar a linha “errada”.
 */
var CABECALHO_PEDIDOS_COLUNAS_EXTRAS = [
  'ARTE', 'OS', 'CORTE', 'COSTURA', 'ESTAMPA PRODUÇÃO', 'PRONTO PARA ENVIO',
  'Tipo Peça', 'Tipo Malha', 'Cor Malha', 'Detalhe Peça', 'Estampa Resumo',
  'Vendedor', 'Tag Pedido'
];

/** Preenche O1:AA1 com os títulos oficiais. Não apaga A1:N1. Se lastColumn < 15, grava o bloco inteiro. */
function expandirCabecalhoPedidos() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
  if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };
  var extras = CABECALHO_PEDIDOS_COLUNAS_EXTRAS;
  var lastCol = sheet.getLastColumn();
  var preenchidos = 0;
  if (lastCol < 15) {
    // getRange(row, col, numRows, numColumns): o 4º parâmetro é a QUANTIDADE de colunas, não o índice da última coluna.
    sheet.getRange(1, 15, 1, extras.length).setValues([extras]);
    preenchidos = extras.length;
  } else {
    var i;
    for (i = 0; i < extras.length; i++) {
      var col = 15 + i;
      var cur = sheet.getRange(1, col).getValue();
      if (cur === '' || cur === null || String(cur).trim() === '') {
        sheet.getRange(1, col).setValue(extras[i]);
        preenchidos++;
      }
    }
  }
  return {
    sucesso: true,
    mensagem: 'Cabeçalhos de produção e resumo (colunas O em diante) verificados.',
    celulasPreenchidas: preenchidos
  };
}

/**
 * Nas linhas de dados (2..última), colunas de flags ARTE até PRONTO recebem FALSE onde estiver vazio.
 * Não altera células que já têm valor. Execute após expandirCabecalhoPedidos.
 */
function preencherFlagsVaziasPedidos() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
  if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };
  expandirCabecalhoPedidos();
  var temCostura = planilhaPedidosTemColunaCostura(sheet);
  var lastFlagCol = temCostura ? 20 : 19;
  var lastRow = sheet.getLastRow();
  var alteradas = 0;
  if (lastRow < 2) {
    return { sucesso: true, mensagem: 'Nenhuma linha de dado abaixo do cabeçalho.', alteradas: 0 };
  }
  var r;
  var c;
  for (r = 2; r <= lastRow; r++) {
    for (c = 15; c <= lastFlagCol; c++) {
      var v = sheet.getRange(r, c).getValue();
      if (v === '' || v === null || v === undefined) {
        sheet.getRange(r, c).setValue(false);
        alteradas++;
      }
    }
  }
  return { sucesso: true, mensagem: 'Flags de produção vazias preenchidas com FALSE.', alteradas: alteradas };
}

/** Executa expandir cabeçalho + preencher flags. Use uma vez após colar o Code.gs no projeto. */
function migrarPedidosPlanilhaAntiga() {
  var h = expandirCabecalhoPedidos();
  var f = preencherFlagsVaziasPedidos();
  return {
    sucesso: h.sucesso && f.sucesso,
    cabecalho: h,
    flags: f,
    lembrete: 'Revise linhas com o mesmo ID e deixe apenas uma por pedido. Implante nova versão da Web App após migrar.'
  };
}

// ================= GET =================
function doGet(e) {
  try {
    const acao = (e && e.parameter && (e.parameter.action || e.parameter.acao)) || 'online';

    if (acao === 'online') return resposta({ status: 'online' });
    if (acao === 'buscarPedido') return resposta(buscarPedido((e.parameter && e.parameter.termo) || ''));
    if (acao === 'obterDados') return resposta(obterDados());
    if (acao === 'listarPedidos' || acao === 'obterFila') return resposta(listarPedidos((e.parameter && e.parameter.filtro) || ''));
    if (acao === 'getStats') return resposta({ sucesso: true, stats: getStats() });

    return resposta({ sucesso: false, erro: 'Ação inválida: ' + acao });
  } catch (erro) {
    return resposta({ sucesso: false, erro: erro.toString() });
  }
}

/** Garante objeto vindo do POST (string JSON dupla ou payload inválido). */
function normalizarDadosObjeto(dados) {
  if (dados === null || dados === undefined) return {};
  if (typeof dados === 'string') {
    try {
      dados = JSON.parse(dados);
    } catch (err1) {
      return {};
    }
    if (typeof dados === 'string') {
      try {
        dados = JSON.parse(dados);
      } catch (err2) {
        return {};
      }
    }
  }
  if (typeof dados !== 'object' || Array.isArray(dados)) return {};
  return dados;
}

// ================= POST =================
function doPost(e) {
  try {
    var acao = '';
    var dados = {};
    var modoEdParam = null;
    var idEdParam = null;

    // Corpo JSON (ex.: edição com Content-Type text/plain): ler primeiro — payload grande fica íntegro em postData.contents.
    if (e && e.postData && e.postData.contents) {
      var raw = String(e.postData.contents).trim();
      if (raw.charAt(0) === '{') {
        try {
          var payload = JSON.parse(raw);
          acao = payload.action || payload.acao || '';
          if (payload.dados !== undefined && payload.dados !== null) {
            dados = payload.dados;
          }
          if (payload.modoEdicao !== undefined && payload.modoEdicao !== null) {
            modoEdParam = payload.modoEdicao;
          }
          if (payload.idEdicao !== undefined && payload.idEdicao !== null) {
            idEdParam = payload.idEdicao;
          }
        } catch (parseJsonErr) {
          // tenta form-urlencoded abaixo
        }
      }
    }

    if (e && e.parameter) {
      acao = acao || e.parameter.action || e.parameter.acao || '';
      if (e.parameter.dados) {
        var dadosVazios = true;
        try {
          var prov = normalizarDadosObjeto(dados);
          dadosVazios = !prov || Object.keys(prov).length === 0;
        } catch (ign) {
          dadosVazios = true;
        }
        if (dadosVazios) {
          try {
            dados = JSON.parse(e.parameter.dados);
          } catch (parseErr) {
            dados = e.parameter.dados;
          }
        }
      }
      if (modoEdParam === null || modoEdParam === undefined || modoEdParam === '') {
        modoEdParam = e.parameter.modoEdicao;
      }
      if (idEdParam === null || idEdParam === undefined || idEdParam === '') {
        idEdParam = e.parameter.idEdicao;
      }
    }

    dados = normalizarDadosObjeto(dados);

    if (modoEdParam === 'true' || modoEdParam === true) {
      dados.atualizacao = true;
    }
    if (idEdParam != null && normalizarId(idEdParam)) {
      dados.id = normalizarId(dados.id) || normalizarId(idEdParam);
    }

    if (!acao) {
      return resposta({ sucesso: false, erro: 'Nenhum dado recebido' });
    }

    if (acao === 'salvarPedido') return resposta(salvarPedido(dados));
    if (acao === 'buscarPedido') return resposta(buscarPedido(dados.termo || dados.id || ''));
    if (acao === 'obterDados') return resposta(obterDados());
    if (acao === 'listarPedidos' || acao === 'obterFila') return resposta(listarPedidos(dados.filtro || ''));

    return resposta({ sucesso: false, erro: 'Ação inválida: ' + acao });
  } catch (erro) {
    return resposta({ sucesso: false, erro: erro.toString() });
  }
}

// ================= SALVAR =================
function salvarPedido(dados) {
  try {
    dados = normalizarDadosObjeto(dados);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };

    var eAtualizacao = dados.atualizacao === true ||
      dados.atualizacao === 'true' ||
      String(dados.atualizacao || '').toLowerCase().trim() === 'true';
    if (eAtualizacao && !normalizarId(dados.id)) {
      return { sucesso: false, erro: 'ID obrigatório para atualizar o pedido.' };
    }

    const idPedido = eAtualizacao
      ? normalizarId(dados.id)
      : (normalizarId(dados.id) || normalizarId(gerarId()));
    const nomeCliente = (dados.cliente && dados.cliente.nome) || '';
    const telefone = (dados.cliente && dados.cliente.telefone) || '';
    const dataPedido = (dados.datas && dados.datas.pedido) || '';
    const dataEntrega = (dados.datas && dados.datas.entrega) || '';
    const totalPecas = Number(dados.totalPecas || 0);
    const observacoes = dados.observacoes || '';
    const valorTotal = Number((dados.financeiro && dados.financeiro.totalPedido) || 0);
    const valorEntrada = Number((dados.financeiro && dados.financeiro.valorEntrada) || 0);
    const restante = Number((dados.financeiro && dados.financeiro.restante) || 0);
    const status = normalizarStatusOperacional(dados.statusOperacional || dados.status || 'PENDENTE');
    const vendedor = dados.responsavelAtual || dados.vendedor || 'ISABELA SIRAY';
    const tagPedido = dados.tagPedido || 'PEDIDO';
    const statusProducao = normalizarStatusProducao(dados.statusProducao || {});
    const resumoProduto = extrairResumoProduto((dados.produtos && dados.produtos[0]) || {});

    const dadosPlanilha = sheet.getDataRange().getValues();
    var temCostura = planilhaPedidosTemColunaCostura(sheet);
    var colunas = temCostura ? 27 : 26;

    var indicesMatch = [];
    var j;
    for (j = 1; j < dadosPlanilha.length; j++) {
      if (idsCorrespondem(dadosPlanilha[j][0], idPedido)) {
        indicesMatch.push(j);
      }
    }

    if (eAtualizacao) {
      if (indicesMatch.length === 0) {
        return {
          sucesso: false,
          erro: 'Pedido não encontrado na planilha para atualizar. Nenhuma linha com este ID.'
        };
      }
      var idResposta = idPedido;
      var m;
      for (m = 0; m < indicesMatch.length; m++) {
        var i = indicesMatch[m];
        const linhaAtual = dadosPlanilha[i];
        var idGravar = linhaAtual[0] !== undefined && linhaAtual[0] !== null && String(linhaAtual[0]).trim() !== ''
          ? linhaAtual[0]
          : idPedido;
        var linhaVals = montarLinhaValoresPedido(
          idGravar, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
          dados.produtos || [], observacoes, valorTotal, valorEntrada, restante, status,
          linhaAtual[12], new Date(), statusProducao, resumoProduto, vendedor, tagPedido,
          temCostura
        );
        sheet.getRange(i + 1, 1, 1, colunas).setValues([linhaVals]);
        idResposta = normalizarId(idGravar) || idPedido;
      }
      var respEdicao = {
        sucesso: true,
        mensagem: 'Pedido atualizado',
        id: idResposta,
        operacao: 'atualizado',
        linhasAtualizadas: indicesMatch.length
      };
      if (indicesMatch.length > 1) {
        respEdicao.aviso = 'Varias linhas com o mesmo ID foram atualizadas; considere apagar duplicatas na planilha.';
      }
      return respEdicao;
    }

    if (indicesMatch.length > 0) {
      var i0 = indicesMatch[0];
      const linhaAtual0 = dadosPlanilha[i0];
      var idGravar0 = linhaAtual0[0] !== undefined && linhaAtual0[0] !== null && String(linhaAtual0[0]).trim() !== ''
        ? linhaAtual0[0]
        : idPedido;
      var linhaVals0 = montarLinhaValoresPedido(
        idGravar0, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
        dados.produtos || [], observacoes, valorTotal, valorEntrada, restante, status,
        linhaAtual0[12], new Date(), statusProducao, resumoProduto, vendedor, tagPedido,
        temCostura
      );
      sheet.getRange(i0 + 1, 1, 1, colunas).setValues([linhaVals0]);
      return {
        sucesso: true,
        mensagem: 'Pedido atualizado',
        id: normalizarId(idGravar0) || idPedido,
        operacao: 'atualizado'
      };
    }

    var linhaNova = montarLinhaValoresPedido(
      idPedido, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
      dados.produtos || [], observacoes, valorTotal, valorEntrada, restante, status,
      new Date(), new Date(), statusProducao, resumoProduto, vendedor, tagPedido,
      temCostura
    );
    sheet.appendRow(linhaNova);

    return { sucesso: true, mensagem: 'Pedido salvo', id: idPedido, operacao: 'criado' };
  } catch (erro) {
    return { sucesso: false, erro: erro.toString() };
  }
}

// ================= BUSCAR =================
function buscarPedido(termo) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    const dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) return { sucesso: false, erro: 'Nenhum pedido cadastrado' };

    const termoId = normalizarId(termo);
    var i;
    var temCosturaBusca = planilhaPedidosTemColunaCostura(sheet);
    for (i = 1; i < dados.length; i++) {
      if (idsCorrespondem(dados[i][0], termoId)) {
        return { sucesso: true, pedido: linhaParaPedido(dados[i], temCosturaBusca) };
      }
    }

    const termoStr = String(termo || '').toLowerCase();
    const termoTelefone = normalizarTelefone(termo);
    for (i = 1; i < dados.length; i++) {
      const row = dados[i];
      const rowNome = String(row[1] || '').toLowerCase();
      const rowTelefone = normalizarTelefone(row[2]);
      var matchNome = termoStr.length > 0 && rowNome.indexOf(termoStr) !== -1;
      var matchFone = termoTelefone.length > 0 && rowTelefone === termoTelefone;
      if (matchNome || matchFone) {
        return { sucesso: true, pedido: linhaParaPedido(row, temCosturaBusca) };
      }
    }
    return { sucesso: false, erro: 'Pedido não encontrado' };
  } catch (erro) {
    return { sucesso: false, erro: erro.toString() };
  }
}

/** Coluna R (18): se o cabeçalho for COSTURA, usa layout 27 colunas; senão layout legado 26. */
function planilhaPedidosTemColunaCostura(sheet) {
  try {
    var v = String(sheet.getRange(1, 18).getValue() || '').toUpperCase();
    return v.indexOf('COSTUR') !== -1;
  } catch (err) {
    return false;
  }
}

function montarLinhaValoresPedido(idGravar, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas, produtosArr, observacoes, valorTotal, valorEntrada, restante, status, dataCriacao, dataModificacao, statusProducao, resumoProduto, vendedor, tagPedido, temCostura) {
  var produtosJson = JSON.stringify(produtosArr);
  var sp = normalizarStatusProducao(statusProducao);
  var a = sp.arte;
  var o = sp.os;
  var c = sp.corte;
  var co = sp.costura;
  var e = sp.estampa;
  var p = sp.prontoParaEnvio;
  var base = [
    idGravar, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
    produtosJson, observacoes, valorTotal, valorEntrada, restante, status, dataCriacao, dataModificacao
  ];
  if (temCostura) {
    return base.concat([a, o, c, co, e, p,
      resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
      vendedor, tagPedido
    ]);
  }
  return base.concat([a, o, c, e, p,
    resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
    vendedor, tagPedido
  ]);
}

function linhaParaPedido(row, temCostura) {
  var sp;
  var rp;
  if (temCostura) {
    sp = {
      arte: asBoolean(row[14]),
      os: asBoolean(row[15]),
      corte: asBoolean(row[16]),
      costura: asBoolean(row[17]),
      estampa: asBoolean(row[18]),
      prontoParaEnvio: asBoolean(row[19])
    };
    rp = {
      tipoPeca: row[20] || '',
      tipoMalha: row[21] || '',
      corMalha: row[22] || '',
      detalhePeca: row[23] || '',
      estampaResumo: row[24] || ''
    };
    return {
      id: row[0],
      cliente: { nome: row[1], telefone: row[2] },
      datas: { pedido: row[3], entrega: row[4] },
      totalPecas: row[5],
      produtos: parseProdutosSeguro(row[6]),
      observacoes: row[7],
      financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
      statusOperacional: row[11],
      statusProducao: sp,
      resumoProduto: rp,
      responsavelAtual: row[25] || 'ISABELA SIRAY',
      tagPedido: row[26] || 'PEDIDO',
      dataCriacao: row[12],
      dataModificacao: row[13]
    };
  }
  sp = {
    arte: asBoolean(row[14]),
    os: asBoolean(row[15]),
    corte: asBoolean(row[16]),
    costura: false,
    estampa: asBoolean(row[17]),
    prontoParaEnvio: asBoolean(row[18])
  };
  rp = {
    tipoPeca: row[19] || '',
    tipoMalha: row[20] || '',
    corMalha: row[21] || '',
    detalhePeca: row[22] || '',
    estampaResumo: row[23] || ''
  };
  return {
    id: row[0],
    cliente: { nome: row[1], telefone: row[2] },
    datas: { pedido: row[3], entrega: row[4] },
    totalPecas: row[5],
    produtos: parseProdutosSeguro(row[6]),
    observacoes: row[7],
    financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
    statusOperacional: row[11],
    statusProducao: sp,
    resumoProduto: rp,
    responsavelAtual: row[24] || 'ISABELA SIRAY',
    tagPedido: row[25] || 'PEDIDO',
    dataCriacao: row[12],
    dataModificacao: row[13]
  };
}

// ================= LISTAR =================
function listarPedidos(filtro) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    const data = sheet.getDataRange().getValues();
    data.shift();
    var temCosturaLista = planilhaPedidosTemColunaCostura(sheet);

    const pedidosPorId = {};
    data.forEach(function(row) {
      const pedido = linhaParaPedido(row, temCosturaLista);
      const chaveIdNormalizada = normalizarId(pedido.id);
      const chaveId = chaveIdNormalizada ? chaveIdNormalizada : ('ROW_' + row[0] + '_' + row[12] + '_' + row[13]);
      const existente = pedidosPorId[chaveId];
      if (!existente) {
        pedidosPorId[chaveId] = pedido;
        return;
      }
      const dataAtual = obterTimestampSeguro(pedido.dataModificacao || pedido.dataCriacao);
      const dataExistente = obterTimestampSeguro(existente.dataModificacao || existente.dataCriacao);
      if (dataAtual >= dataExistente) pedidosPorId[chaveId] = pedido;
    });

    const pedidos = Object.keys(pedidosPorId).map(function(chave) {
      return pedidosPorId[chave];
    }).filter(function(pedido) {
      return !filtro || pedido.statusOperacional === filtro;
    });

    return { sucesso: true, pedidos: pedidos, fila: pedidos };
  } catch (erro) {
    return { sucesso: false, erro: erro.toString() };
  }
}

// ================= OBTER DADOS =================
function obterDados() {
  return {
    sucesso: true,
    custosMalhas: [],
    custosMaoObra: [],
    custosEstampas: [],
    localidadesEstampas: []
  };
}

// ================= UTIL =================
function gerarId() {
  return 'PED-' + new Date().getTime();
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function asBoolean(valor) {
  if (valor === null || valor === undefined || valor === '') return false;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;
  if (typeof valor === 'string') {
    const normalizado = valor.toLowerCase().trim();
    if (normalizado === 'false' || normalizado === 'falso' || normalizado === 'não' || normalizado === 'nao' || normalizado === '0') return false;
    return normalizado === 'true' || normalizado === 'sim' || normalizado === '1' || normalizado === 'x' ||
      normalizado === 'verdadeiro' || normalizado === 'v' || normalizado === '✓' || normalizado === '☑';
  }
  return false;
}

function parseProdutosSeguro(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  try {
    var parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch (erro) {
    return [];
  }
}

function normalizarId(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number' && !isNaN(valor)) return String(Math.round(valor));
  return String(valor).trim();
}

/** Igualdade exata (após normalizar) ou o termo coincide com algum segmento do ID (ex.: PED-ts-1133-abc e termo 1133). Segmentos só contam se o termo tiver pelo menos 3 caracteres (evita "1" casar em falso). */
function idsCorrespondem(idPlanilha, termo) {
  var a = normalizarId(idPlanilha);
  var b = normalizarId(termo);
  if (!a || !b) return a === b;
  if (a === b) return true;
  if (b.length < 3) return false;
  var partes = String(idPlanilha).split(/[-_]/);
  var j;
  for (j = 0; j < partes.length; j++) {
    if (normalizarId(partes[j]) === b) return true;
  }
  return false;
}

function normalizarTelefone(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
}

function obterTimestampSeguro(valorData) {
  if (!valorData) return 0;
  var data = valorData instanceof Date ? valorData : new Date(valorData);
  var timestamp = data.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizarStatusOperacional(status) {
  var valor = String(status || '').trim().toLowerCase();
  if (valor === 'novo pedido' || valor === 'novo') return 'PENDENTE';
  if (valor === 'finalizado' || valor === 'entregue') return 'Entregue';
  if (valor === 'cancelado') return 'Cancelado';
  return status || 'PENDENTE';
}

function normalizarStatusProducao(statusProducao) {
  var s = statusProducao;
  if (s === null || s === undefined || typeof s !== 'object' || Array.isArray(s)) {
    s = {};
  }
  return {
    arte: asBoolean(s.arte),
    os: asBoolean(s.os),
    corte: asBoolean(s.corte),
    costura: asBoolean(s.costura),
    estampa: asBoolean(s.estampa),
    prontoParaEnvio: asBoolean(s.prontoParaEnvio)
  };
}

function extrairResumoProduto(produto) {
  const estampas = Array.isArray(produto.estampas) ? produto.estampas : [];
  const estampaResumo = estampas.map(function(item) {
    return item && item.tipo ? item.tipo : '';
  }).filter(function(item) {
    return item;
  }).join(', ');
  return {
    tipoPeca: produto.tipoPeca || '',
    tipoMalha: produto.tipoMalha || '',
    corMalha: produto.corMalha || '',
    detalhePeca: produto.detalhesPeca || produto.detalhePeca || '',
    estampaResumo: estampaResumo
  };
}

function getStats() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
  const data = sheet.getDataRange().getValues();
  data.shift();

  let totalPedidos = data.length;
  let pedidosNovo = 0;
  let pedidosFinalizado = 0;
  let pedidosCancelado = 0;
  let valorTotal = 0;
  let pedidosHoje = 0;
  let pedidosEstaSemana = 0;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const semanaPassada = new Date(hoje);
  semanaPassada.setDate(hoje.getDate() - 7);

  data.forEach(function(row) {
    const statusNorm = normalizarStatusOperacional(row[11]);
    const statusLower = String(statusNorm || '').trim().toLowerCase();
    const valor = parseFloat(row[8]) || 0;
    const dataPedido = new Date(row[3]);
    dataPedido.setHours(0, 0, 0, 0);

    valorTotal += valor;
    if (statusNorm === 'PENDENTE' || statusLower === 'novo pedido' || statusLower === 'novo') pedidosNovo++;
    if (statusNorm === 'Entregue' || statusLower === 'finalizado') pedidosFinalizado++;
    if (statusNorm === 'Cancelado' || statusLower === 'cancelado') pedidosCancelado++;
    if (!Number.isNaN(dataPedido.getTime()) && dataPedido.getTime() === hoje.getTime()) pedidosHoje++;
    if (!Number.isNaN(dataPedido.getTime()) && dataPedido >= semanaPassada) pedidosEstaSemana++;
  });

  return {
    totalPedidos: totalPedidos,
    pedidosNovo: pedidosNovo,
    pedidosFinalizado: pedidosFinalizado,
    pedidosCancelado: pedidosCancelado,
    valorTotal: valorTotal,
    pedidosHoje: pedidosHoje,
    pedidosEstaSemana: pedidosEstaSemana,
    ticketMedio: totalPedidos > 0 ? valorTotal / totalPedidos : 0
  };
}
