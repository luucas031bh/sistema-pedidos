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
      'ARTE', 'OS', 'CORTE', 'ESTAMPA PRODUÇÃO', 'PRONTO PARA ENVIO',
      'Tipo Peça', 'Tipo Malha', 'Cor Malha', 'Detalhe Peça', 'Estampa Resumo',
      'Vendedor', 'Tag Pedido'
    ]);
  }
  return { sucesso: true, mensagem: 'Banco criado com sucesso' };
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

// ================= POST =================
function doPost(e) {
  try {
    let acao = '';
    let dados = {};

    if (e && e.parameter) {
      // Prioriza requests form-urlencoded (evita preflight no navegador).
      acao = e.parameter.action || e.parameter.acao || '';
      if (e.parameter.dados) {
        try {
          dados = JSON.parse(e.parameter.dados);
        } catch (parseErr) {
          dados = e.parameter.dados;
        }
      }
    }

    if (!acao && e && e.postData && e.postData.contents) {
      const payload = JSON.parse(e.postData.contents || '{}');
      acao = payload.action || payload.acao || '';
      dados = payload.dados || dados || payload;
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    if (!sheet) return { sucesso: false, erro: 'Aba PEDIDOS não encontrada' };

    const idPedido = dados.id || gerarId();
    const nomeCliente = (dados.cliente && dados.cliente.nome) || '';
    const telefone = (dados.cliente && dados.cliente.telefone) || '';
    const dataPedido = (dados.datas && dados.datas.pedido) || '';
    const dataEntrega = (dados.datas && dados.datas.entrega) || '';
    const totalPecas = Number(dados.totalPecas || 0);
    const observacoes = dados.observacoes || '';
    const valorTotal = Number((dados.financeiro && dados.financeiro.totalPedido) || 0);
    const valorEntrada = Number((dados.financeiro && dados.financeiro.valorEntrada) || 0);
    const restante = Number((dados.financeiro && dados.financeiro.restante) || 0);
    const status = dados.statusOperacional || dados.status || 'PENDENTE';
    const vendedor = dados.responsavelAtual || dados.vendedor || 'ISABELA SIRAY';
    const tagPedido = dados.tagPedido || 'PEDIDO';
    const statusProducao = normalizarStatusProducao(dados.statusProducao || {});
    const resumoProduto = extrairResumoProduto((dados.produtos && dados.produtos[0]) || {});

    const dadosPlanilha = sheet.getDataRange().getValues();
    const colunas = Math.max((dadosPlanilha[0] || []).length, 26);
    for (var i = 1; i < dadosPlanilha.length; i++) {
      if (dadosPlanilha[i][0] === idPedido) {
        const linhaAtual = dadosPlanilha[i];
        sheet.getRange(i + 1, 1, 1, colunas).setValues([[
          idPedido, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
          JSON.stringify(dados.produtos || []), observacoes, valorTotal, valorEntrada,
          restante, status, linhaAtual[12], new Date(),
          statusProducao.arte, statusProducao.os, statusProducao.corte, statusProducao.estampa, statusProducao.prontoParaEnvio,
          resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
          vendedor, tagPedido
        ]]);
        return { sucesso: true, mensagem: 'Pedido atualizado', id: idPedido };
      }
    }

    sheet.appendRow([
      idPedido, nomeCliente, telefone, dataPedido, dataEntrega, totalPecas,
      JSON.stringify(dados.produtos || []), observacoes, valorTotal, valorEntrada,
      restante, status, new Date(), new Date(),
      statusProducao.arte, statusProducao.os, statusProducao.corte, statusProducao.estampa, statusProducao.prontoParaEnvio,
      resumoProduto.tipoPeca, resumoProduto.tipoMalha, resumoProduto.corMalha, resumoProduto.detalhePeca, resumoProduto.estampaResumo,
      vendedor, tagPedido
    ]);

    return { sucesso: true, mensagem: 'Pedido salvo', id: idPedido };
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

    for (var i = 1; i < dados.length; i++) {
      const row = dados[i];
      if (row[0] == termo || row[1].toString().toLowerCase().indexOf(String(termo).toLowerCase()) !== -1 || row[2] == termo) {
        return {
          sucesso: true,
          pedido: {
            id: row[0],
            cliente: { nome: row[1], telefone: row[2] },
            datas: { pedido: row[3], entrega: row[4] },
            totalPecas: row[5],
            produtos: JSON.parse(row[6] || '[]'),
            observacoes: row[7],
            financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
            statusOperacional: row[11],
            statusProducao: {
              arte: asBoolean(row[14]),
              os: asBoolean(row[15]),
              corte: asBoolean(row[16]),
              estampa: asBoolean(row[17]),
              prontoParaEnvio: asBoolean(row[18])
            },
            resumoProduto: {
              tipoPeca: row[19] || '',
              tipoMalha: row[20] || '',
              corMalha: row[21] || '',
              detalhePeca: row[22] || '',
              estampaResumo: row[23] || ''
            },
            responsavelAtual: row[24] || 'ISABELA SIRAY',
            tagPedido: row[25] || 'PEDIDO',
            dataCriacao: row[12],
            dataModificacao: row[13]
          }
        };
      }
    }
    return { sucesso: false, erro: 'Pedido não encontrado' };
  } catch (erro) {
    return { sucesso: false, erro: erro.toString() };
  }
}

// ================= LISTAR =================
function listarPedidos(filtro) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABAS.PEDIDOS);
    const data = sheet.getDataRange().getValues();
    data.shift();

    const pedidos = data.map(function(row) {
      return {
        id: row[0],
        cliente: { nome: row[1], telefone: row[2] },
        datas: { pedido: row[3], entrega: row[4] },
        totalPecas: row[5],
        produtos: JSON.parse(row[6] || '[]'),
        observacoes: row[7],
        financeiro: { totalPedido: row[8], valorEntrada: row[9], restante: row[10] },
        statusOperacional: row[11],
        statusProducao: {
          arte: asBoolean(row[14]),
          os: asBoolean(row[15]),
          corte: asBoolean(row[16]),
          estampa: asBoolean(row[17]),
          prontoParaEnvio: asBoolean(row[18])
        },
        resumoProduto: {
          tipoPeca: row[19] || '',
          tipoMalha: row[20] || '',
          corMalha: row[21] || '',
          detalhePeca: row[22] || '',
          estampaResumo: row[23] || ''
        },
        responsavelAtual: row[24] || 'ISABELA SIRAY',
        tagPedido: row[25] || 'PEDIDO',
        dataCriacao: row[12],
        dataModificacao: row[13]
      };
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
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;
  if (typeof valor === 'string') {
    const normalizado = valor.toLowerCase().trim();
    return normalizado === 'true' || normalizado === 'sim' || normalizado === '1' || normalizado === 'x';
  }
  return false;
}

function normalizarStatusProducao(statusProducao) {
  return {
    arte: asBoolean(statusProducao.arte),
    os: asBoolean(statusProducao.os),
    corte: asBoolean(statusProducao.corte),
    estampa: asBoolean(statusProducao.estampa),
    prontoParaEnvio: asBoolean(statusProducao.prontoParaEnvio)
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
    const status = row[11];
    const valor = parseFloat(row[8]) || 0;
    const dataPedido = new Date(row[3]);
    dataPedido.setHours(0, 0, 0, 0);

    valorTotal += valor;
    if (status === 'Novo' || status === 'PENDENTE') pedidosNovo++;
    if (status === 'Finalizado' || status === 'Entregue') pedidosFinalizado++;
    if (status === 'Cancelado') pedidosCancelado++;
    if (dataPedido.getTime() === hoje.getTime()) pedidosHoje++;
    if (dataPedido >= semanaPassada) pedidosEstaSemana++;
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
