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
      'Vendedor', 'Tag Pedido', 'ID BUSCA'
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
  'Vendedor', 'Tag Pedido', 'ID BUSCA'
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
    if (acao === 'buscarPedidos') return resposta(buscarPedidos((e.parameter && e.parameter.termo) || ''));
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
      var raw = String(e.postData.contents).replace(/^\uFEFF/, '').trim();
      var jsonSlice = raw;
      if (jsonSlice.charAt(0) !== '{') {
        var idxJson = jsonSlice.indexOf('{');
        if (idxJson !== -1) jsonSlice = jsonSlice.substring(idxJson);
      }
      if (jsonSlice.charAt(0) === '{') {
        try {
          var payload = JSON.parse(jsonSlice);
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
    if (acao === 'buscarPedidos') {
      var termoBusca = '';
      if (dados.termo !== undefined && dados.termo !== null && String(dados.termo).trim() !== '') {
        termoBusca = dados.termo;
      } else if (e.parameter && e.parameter.termo) {
        termoBusca = e.parameter.termo;
      }
      return resposta(buscarPedidos(termoBusca));
    }
    if (acao === 'obterDados') return resposta(obterDados());
    if (acao === 'listarPedidos' || acao === 'obterFila') return resposta(listarPedidos(dados.filtro || ''));

    return resposta({ sucesso: false, erro: 'Ação inválida: ' + acao });
  } catch (erro) {
    return resposta({ sucesso: false, erro: erro.toString() });
  }
}

/** Evita payload “achatado” (produtos/cliente como string) que quebra persistência. */
function garantirEstruturaPayloadSalvar(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return;
  if (typeof dados.produtos === 'string') {
    try {
      dados.produtos = JSON.parse(dados.produtos);
    } catch (prodErr) {
      dados.produtos = [];
    }
  }
  if (dados.produtos && !Array.isArray(dados.produtos)) {
    dados.produtos = [];
  }
  if (typeof dados.financeiro === 'string') {
    try {
      dados.financeiro = JSON.parse(dados.financeiro);
    } catch (finErr) {
      dados.financeiro = {};
    }
  }
  if (typeof dados.cliente === 'string') {
    try {
      dados.cliente = JSON.parse(dados.cliente);
    } catch (cliErr) {
      dados.cliente = {};
    }
  }
  if (typeof dados.datas === 'string') {
    try {
      dados.datas = JSON.parse(dados.datas);
    } catch (datErr) {
      dados.datas = {};
    }
  }
  if (typeof dados.statusProducao === 'string') {
    try {
      dados.statusProducao = JSON.parse(dados.statusProducao);
    } catch (spErr) {
      dados.statusProducao = {};
    }
  }
}

// ================= SALVAR =================
function salvarPedido(dados) {
  try {
    dados = normalizarDadosObjeto(dados);
    garantirEstruturaPayloadSalvar(dados);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };

    var eAtualizacao = dados.atualizacao === true ||
      dados.atualizacao === 'true' ||
      String(dados.atualizacao || '').toLowerCase().trim() === 'true';
    if (dados.modoEdicao === true || dados.modoEdicao === 'true' ||
      String(dados.modoEdicao || '').toLowerCase().trim() === 'true') {
      eAtualizacao = true;
      dados.atualizacao = true;
    }
    if (eAtualizacao && !normalizarId(dados.id)) {
      return { sucesso: false, erro: 'ID obrigatório para atualizar o pedido.' };
    }

    const nomeCliente = (dados.cliente && dados.cliente.nome) || '';
    const telefone = (dados.cliente && dados.cliente.telefone) || '';
    const idPedido = eAtualizacao
      ? normalizarId(dados.id)
      : (normalizarId(dados.id) || normalizarId(gerarId(telefone)));
    const idBuscaVal = idBuscaDeDados(dados);
    const dataPedido = (dados.datas && dados.datas.pedido) || '';
    const dataEntrega = (dados.datas && dados.datas.entrega) || '';
    const totalPecas = Number(dados.totalPecas || 0);
    const observacoes = dados.observacoes || '';
    const valorTotal = Number((dados.financeiro && dados.financeiro.totalPedido) || 0);
    const valorEntrada = Number((dados.financeiro && dados.financeiro.valorEntrada) || 0);
    const restante = Number((dados.financeiro && dados.financeiro.restante) || 0);
    const status = normalizarStatusOperacional(dados.statusOperacional || dados.status || 'Novo pedido');
    const vendedor = dados.responsavelAtual || dados.vendedor || 'ISABELA SIRAY';
    const tagPedido = dados.tagPedido || 'PEDIDO';
    var etapaProducaoAtual = normalizarEtapaProducaoId(dados.etapaProducaoAtual || '');
    if (!etapaProducaoAtual && Array.isArray(dados.produtos) && dados.produtos.length > 0) {
      etapaProducaoAtual = normalizarEtapaProducaoId(dados.produtos[0].etapaProducaoAtual || '');
    }
    var spCliente = normalizarStatusProducao(dados.statusProducao || {});
    var etapaDosFlags = etapaDeFlagsProducao(spCliente);
    if (!etapaProducaoAtual) {
      etapaProducaoAtual = etapaDosFlags || 'pedido_feito';
    }
    if (!etapaProducaoAtual) {
      etapaProducaoAtual = 'pedido_feito';
    }
    const statusProducao = statusProducaoDerivadoDeEtapa(etapaProducaoAtual);
    dados.produtos = normalizarProdutosParaCalculoTemporario(dados.produtos);
    const resumoProduto = extrairResumoProduto((dados.produtos && dados.produtos[0]) || {});

    const dadosPlanilha = sheet.getDataRange().getValues();
    var temCostura = planilhaPedidosTemColunaCostura(sheet);
    var colunas = temCostura ? 28 : 27;

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
          linhaAtual[12], new Date(), statusProducao, etapaProducaoAtual, resumoProduto, vendedor, tagPedido,
          idBuscaVal, temCostura
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
        linhaAtual0[12], new Date(), statusProducao, etapaProducaoAtual, resumoProduto, vendedor, tagPedido,
        idBuscaVal, temCostura
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
      new Date(), new Date(), statusProducao, etapaProducaoAtual, resumoProduto, vendedor, tagPedido,
      idBuscaVal, temCostura
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

    var termoSoDigitos = normalizarTelefone(termo);
    if (termoSoDigitos.length === 4) {
      var idxIdBusca = temCosturaBusca ? 27 : 26;
      for (i = 1; i < dados.length; i++) {
        var rowIb = dados[i];
        var celIb = rowIb.length > idxIdBusca ? rowIb[idxIdBusca] : '';
        if (normalizarIdBuscaPlanilha(celIb) === termoSoDigitos) {
          return { sucesso: true, pedido: linhaParaPedido(rowIb, temCosturaBusca) };
        }
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

/**
 * Lista todos os pedidos que coincidem com o termo.
 * - 4 dígitos: todas as linhas cuja coluna ID BUSCA coincide.
 * - Caso contrário: todas as linhas cujo ID corresponde (idsCorrespondem), senão nome (substring) ou telefone completo.
 */
function buscarPedidos(termo) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };
    const dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) return { sucesso: true, pedidos: [] };

    var temCosturaBusca = planilhaPedidosTemColunaCostura(sheet);
    var idxIdBusca = temCosturaBusca ? 27 : 26;
    var termoStr = String(termo || '').trim();
    if (!termoStr) return { sucesso: false, erro: 'Informe um termo de busca' };

    var resultados = [];
    var termoSoDigitos = normalizarTelefone(termoStr);
    var termoId = normalizarId(termoStr);
    var i;

    if (termoSoDigitos.length === 4) {
      for (i = 1; i < dados.length; i++) {
        var rowIb = dados[i];
        var celIb = rowIb.length > idxIdBusca ? rowIb[idxIdBusca] : '';
        if (normalizarIdBuscaPlanilha(celIb) === termoSoDigitos) {
          resultados.push(linhaParaPedido(rowIb, temCosturaBusca));
        }
      }
      return { sucesso: true, pedidos: resultados };
    }

    for (i = 1; i < dados.length; i++) {
      if (idsCorrespondem(dados[i][0], termoId)) {
        resultados.push(linhaParaPedido(dados[i], temCosturaBusca));
      }
    }
    if (resultados.length > 0) {
      return { sucesso: true, pedidos: resultados };
    }

    var termoLower = termoStr.toLowerCase();
    var termoTelefoneFull = termoSoDigitos;
    for (i = 1; i < dados.length; i++) {
      var row = dados[i];
      var rowNome = String(row[1] || '').toLowerCase();
      var rowTelefone = normalizarTelefone(row[2]);
      var matchNome = termoLower.length > 0 && rowNome.indexOf(termoLower) !== -1;
      var matchFone = termoTelefoneFull.length >= 10 && rowTelefone === termoTelefoneFull;
      if (matchNome || matchFone) {
        resultados.push(linhaParaPedido(row, temCosturaBusca));
      }
    }
    return { sucesso: true, pedidos: resultados };
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

function montarLinhaValoresPedido(idGravar, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas, produtosArr, observacoes, valorTotal, valorEntrada, restante, status, dataCriacao, dataModificacao, statusProducao, etapaProducaoAtual, resumoProduto, vendedor, tagPedido, idBusca, temCostura) {
  var produtosJson = serializarEnvelopeProdutos(produtosArr, etapaProducaoAtual);
  var sp = normalizarStatusProducao(statusProducao);
  var a = sp.arte;
  var o = sp.os;
  var c = sp.corte;
  var co = sp.costura;
  var e = sp.estampa;
  var p = sp.prontoParaEnvio;
  var ib = normalizarIdBuscaPlanilha(idBusca);
  var base = [
    idGravar, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
    produtosJson, observacoes, valorTotal, valorEntrada, restante, status, dataCriacao, dataModificacao
  ];
  if (temCostura) {
    return base.concat([a, o, c, co, e, p,
      resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
      vendedor, tagPedido, ib
    ]);
  }
  return base.concat([a, o, c, e, p,
    resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
    vendedor, tagPedido, ib
  ]);
}

function linhaParaPedido(row, temCostura) {
  var sp;
  var rp;
  var envProd = extrairEnvelopeProdutosColuna(row[6]);
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
    var etapaAtual = normalizarEtapaProducaoId(envProd.etapaProducaoAtual);
    if (!etapaAtual) etapaAtual = etapaDeFlagsProducao(sp);
    return {
      id: row[0],
      cliente: { nome: row[1], telefone: row[2] },
      datas: { pedido: row[3], entrega: row[4] },
      totalPecas: row[5],
      produtos: envProd.produtos,
      observacoes: row[7],
      financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
      statusOperacional: row[11],
      statusProducao: sp,
      etapaProducaoAtual: etapaAtual,
      resumoProduto: rp,
      responsavelAtual: row[25] || 'ISABELA SIRAY',
      tagPedido: row[26] || 'PEDIDO',
      idBusca: row.length > 27 ? normalizarIdBuscaPlanilha(row[27]) : sufixoIdBuscaDeTelefone(normalizarTelefone(row[2])),
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
  var etapaAtualLeg = normalizarEtapaProducaoId(envProd.etapaProducaoAtual);
  if (!etapaAtualLeg) etapaAtualLeg = etapaDeFlagsProducao(sp);
  return {
    id: row[0],
    cliente: { nome: row[1], telefone: row[2] },
    datas: { pedido: row[3], entrega: row[4] },
    totalPecas: row[5],
    produtos: envProd.produtos,
    observacoes: row[7],
    financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
    statusOperacional: row[11],
    statusProducao: sp,
    etapaProducaoAtual: etapaAtualLeg,
    resumoProduto: rp,
    responsavelAtual: row[24] || 'ISABELA SIRAY',
    tagPedido: row[25] || 'PEDIDO',
    idBusca: row.length > 26 ? normalizarIdBuscaPlanilha(row[26]) : sufixoIdBuscaDeTelefone(normalizarTelefone(row[2])),
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
/** 4 dígitos para coluna ID BUSCA e sufixo do PED quando o servidor gera o ID. */
function sufixoIdBuscaDeTelefone(telefone) {
  var d = normalizarTelefone(telefone);
  if (!d.length) return '0000';
  if (d.length >= 4) return d.slice(-4);
  return ('0000' + d).slice(-4);
}

/** Valor vindo do payload ou derivado do telefone do cliente. */
function idBuscaDeDados(dados) {
  if (!dados) return '0000';
  var manual = normalizarId(dados.idBusca);
  if (manual.length >= 4) return manual.slice(-4);
  if (manual.length > 0) return sufixoIdBuscaDeTelefone(manual);
  var tel = dados.cliente && normalizarTelefone(dados.cliente.telefone);
  return sufixoIdBuscaDeTelefone(tel);
}

/** Normaliza célula da planilha ou valor a gravar para string de 4 dígitos. */
function normalizarIdBuscaPlanilha(valor) {
  var s = normalizarId(valor);
  if (!s.length) return '0000';
  if (/^\d+$/.test(s)) {
    if (s.length >= 4) return s.slice(-4);
    return ('0000' + s).slice(-4);
  }
  return sufixoIdBuscaDeTelefone(s);
}

/** Mesmo padrão do front: PED-timestamp-ultimos4-aleatorio3 */
function gerarId(telefone) {
  var suf = sufixoIdBuscaDeTelefone(telefone || '');
  var rnd = Math.floor(Math.random() * 1000);
  return 'PED-' + new Date().getTime() + '-' + suf + '-' + ('000' + rnd).slice(-3);
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
  return extrairEnvelopeProdutosColuna(valor).produtos;
}

function normalizarId(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number' && !isNaN(valor)) return String(Math.round(valor));
  return String(valor).trim();
}

/**
 * Igualdade exata (após normalizar) ou o termo coincide com algum segmento do ID
 * (ex.: PED-ts-1133-abc e termo 1133, ou sufixo "99" com 2 caracteres).
 * Segmentos com termo de 1 caractere não contam (evita "1" casar em falso).
 */
function idsCorrespondem(idPlanilha, termo) {
  var a = normalizarId(idPlanilha);
  var b = normalizarId(termo);
  if (!a || !b) return a === b;
  if (a === b) return true;
  if (b.length < 2) return false;
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

/**
 * Alinha ao CONFIG.STATUS_PEDIDO do front. Preserva Entregue (legado). Mapeia status antigos para o vocabulário novo.
 */
function normalizarStatusOperacional(status) {
  var raw = String(status || '').trim();
  if (!raw) return 'Novo pedido';
  var valor = raw.toLowerCase();
  if (valor === 'entregue') return 'Entregue';
  if (valor === 'finalizado') return 'Finalizado';

  var canon = ['Novo pedido', 'Pendente', 'Orçamento', 'Em produção', 'Atrasado', 'Cancelado', 'Travado', 'Finalizado'];
  var i;
  for (i = 0; i < canon.length; i++) {
    if (canon[i].toLowerCase() === valor) return canon[i];
  }

  if (valor === 'cancelado') return 'Cancelado';

  if (raw === 'PENDENTE' || valor === 'pendente') return 'Pendente';
  if (valor === 'novo pedido' || valor === 'novo') return 'Novo pedido';
  if (valor === 'orçamento' || valor === 'orcamento') return 'Orçamento';
  if (valor === 'atrasado') return 'Atrasado';
  if (valor === 'travado') return 'Travado';
  if (valor === 'em produção' || valor === 'em producao') return 'Em produção';

  var emProd = [
    'em corte', 'em estampa', 'em terceirização', 'em terceirizacao', 'em finalização', 'em finalizacao',
    'pronto para produção', 'pronto para producao', 'aguardando entrada', 'aguardando arte', 'aguardando compra',
    'pronto para entrega'
  ];
  for (i = 0; i < emProd.length; i++) {
    if (valor === emProd[i]) return 'Em produção';
  }

  return raw;
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

var ETAPAS_PRODUCAO_VALIDAS = [
  'pedido_feito', 'fechamento_arte', 'insumos', 'corte', 'estampa', 'costura', 'embalo', 'aguardando_retirada'
];

function normalizarEtapaProducaoId(valor) {
  var s = String(valor || '').trim().toLowerCase().replace(/\s+/g, '_');
  var i;
  for (i = 0; i < ETAPAS_PRODUCAO_VALIDAS.length; i++) {
    if (ETAPAS_PRODUCAO_VALIDAS[i] === s) return ETAPAS_PRODUCAO_VALIDAS[i];
  }
  var mapa = {
    'pedido feito': 'pedido_feito',
    'fechamento de arte': 'fechamento_arte',
    'aguardando retirada': 'aguardando_retirada',
    'aguardando_retirar': 'aguardando_retirada'
  };
  if (mapa[s]) return mapa[s];
  return '';
}

function statusProducaoDerivadoDeEtapa(etapaId) {
  var id = normalizarEtapaProducaoId(etapaId) || 'pedido_feito';
  var ordem = ['pedido_feito', 'fechamento_arte', 'insumos', 'corte', 'estampa', 'costura', 'embalo', 'aguardando_retirada'];
  var idx = ordem.indexOf(id);
  if (idx < 0) idx = 0;
  return {
    arte: idx >= 1,
    os: idx >= 2,
    corte: idx >= 3,
    estampa: idx >= 4,
    costura: idx >= 5,
    prontoParaEnvio: idx >= 7
  };
}

function etapaDeFlagsProducao(sp) {
  if (!sp || typeof sp !== 'object') return 'pedido_feito';
  if (asBoolean(sp.prontoParaEnvio)) return 'aguardando_retirada';
  if (asBoolean(sp.costura)) return 'costura';
  if (asBoolean(sp.estampa)) return 'estampa';
  if (asBoolean(sp.corte)) return 'corte';
  if (asBoolean(sp.os)) return 'insumos';
  if (asBoolean(sp.arte)) return 'fechamento_arte';
  return 'pedido_feito';
}

function extrairEnvelopeProdutosColuna(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return { produtos: [], etapaProducaoAtual: '' };
  }
  if (Array.isArray(valor)) {
    return { produtos: valor, etapaProducaoAtual: '' };
  }
  var raw = String(valor).trim();
  if (!raw) return { produtos: [], etapaProducaoAtual: '' };
  try {
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { produtos: parsed, etapaProducaoAtual: '' };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.produtos)) {
      return {
        produtos: parsed.produtos,
        etapaProducaoAtual: String(parsed.etapaProducaoAtual || '').trim()
      };
    }
  } catch (e1) {
    return { produtos: [], etapaProducaoAtual: '' };
  }
  return { produtos: [], etapaProducaoAtual: '' };
}

function serializarEnvelopeProdutos(produtosArr, etapaProducaoAtual) {
  var et = normalizarEtapaProducaoId(etapaProducaoAtual) || 'pedido_feito';
  return JSON.stringify({
    produtos: Array.isArray(produtosArr) ? produtosArr : [],
    etapaProducaoAtual: et
  });
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

function normalizarTipoMalhaParaCalculoTemporario(tipoMalha) {
  var valor = String(tipoMalha || '');
  if (valor === 'Tricoline Ibiza (Composição)') return 'Piquet (50% Algodão 50% Poliéster)';
  return valor;
}

function normalizarTamanhoParaCalculoTemporario(tamanho) {
  var valor = String(tamanho || '');
  var aliases = {
    'G1': 'EG',
    'G2': 'EG',
    'G3': 'EG',
    'G4': 'EG',
    'G1 (BL)': 'EG',
    'G2 (BL)': 'EG',
    'G3 (BL)': 'EG',
    'G4 (BL)': 'EG'
  };
  return aliases[valor] || valor;
}

function normalizarProdutosParaCalculoTemporario(produtos) {
  if (!Array.isArray(produtos)) return [];
  return produtos.map(function(produto) {
    var p = produto && typeof produto === 'object' ? produto : {};
    var tamanhos = Array.isArray(p.tamanhos) ? p.tamanhos : [];
    var tamanhosCalculo = tamanhos.map(function(item) {
      return {
        tamanhoOriginal: item && item.tamanho ? item.tamanho : '',
        tamanhoCalculo: normalizarTamanhoParaCalculoTemporario(item && item.tamanho),
        quantidade: Number(item && item.quantidade) || 0
      };
    });
    return Object.assign({}, p, {
      tipoMalhaCalculo: normalizarTipoMalhaParaCalculoTemporario(p.tipoMalha),
      tamanhosCalculo: tamanhosCalculo
    });
  });
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
    if (statusNorm === 'Novo pedido' || statusNorm === 'Pendente' || statusNorm === 'PENDENTE' ||
      statusLower === 'novo pedido' || statusLower === 'pendente' || statusLower === 'novo') pedidosNovo++;
    if (statusNorm === 'Entregue' || statusNorm === 'Finalizado' || statusLower === 'finalizado') pedidosFinalizado++;
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
