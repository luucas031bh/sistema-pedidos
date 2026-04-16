/**
 * Sistema Adonay Confecção - Google Apps Script
 * Versão 1.0 - Banco de Dados Completo
 * 
 * Este script gerencia:
 * - Salvamento de pedidos
 * - Busca de pedidos
 * - Atualização de pedidos
 * - Dados para Dashboard
 */

// ========== CONFIGURAÇÕES ==========
const CONFIGURACAO = {
  NOME_PLANILHA: 'Adonay Confecção - Sistema de Pedidos',
  ABAS: {
    PEDIDOS: 'PEDIDOS',
    CUSTOS_MALHAS: 'CUSTOS_MALHAS',
    CUSTOS_MAO_OBRA: 'CUSTOS_MAO_OBRA',
    CUSTOS_ESTAMPAS: 'CUSTOS_ESTAMPAS',
    LOCALIDADES_ESTAMPAS: 'LOCALIDADES_ESTAMPAS',
    DASHBOARD_DATA: 'DASHBOARD_DATA'
  }
};

// ========== FUNÇÃO PRINCIPAL GET ==========
function doGet(e) {
  try {
    const acao = e.parameter.acao || 'obterDados';
    
    switch(acao) {
      case 'obterDados':
        return retornarJSON(obterDados());
      case 'buscarPedido':
        const termo = e.parameter.termo;
        return retornarJSON(buscarPedido(termo));
      case 'listarPedidos':
        const filtro = e.parameter.filtro;
        return retornarJSON(listarPedidos(filtro));
      case 'obterDashboard':
        return retornarJSON(obterDashboard());
      default:
        return retornarJSON({ erro: 'Ação não encontrada' }, 400);
    }
  } catch (error) {
    console.error('Erro no doGet:', error);
    return retornarJSON({ erro: 'Erro interno do servidor' }, 500);
  }
}

// ========== FUNÇÃO PRINCIPAL OPTIONS (CORS) ==========
function doOptions(e) {
  return retornarJSON({}, 200);
}

// ========== FUNÇÃO PRINCIPAL POST ==========
function doPost(e) {
  try {
    const acao = e.parameter.acao;
const dados = JSON.parse(e.parameter.dados);
    
    switch(acao) {
      case 'salvarPedido':
        return retornarJSON(salvarPedido(dados));
      case 'atualizarPedido':
        return retornarJSON(atualizarPedido(dados));
      case 'atualizarStatus':
        return retornarJSON(atualizarStatus(dados.id, dados.status));
      case 'excluirPedido':
        return retornarJSON(excluirPedido(dados.id));
      default:
        return retornarJSON({ erro: 'Ação não encontrada' }, 400);
    }
  } catch (error) {
    console.error('Erro no doPost:', error);
    return retornarJSON({ erro: 'Erro interno do servidor' }, 500);
  }
}

// ========== FUNÇÕES DE UTILIDADE ==========
function retornarJSON(dados, codigo = 200) {
  return ContentService
    .createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

function obterPlanilha() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  if (!planilha) {
    throw new Error('Planilha não encontrada. Execute criarTodasAbas() primeiro.');
  }
  return planilha;
}

function obterAba(nomeAba) {
  const planilha = obterPlanilha();
  let aba = planilha.getSheetByName(nomeAba);
  if (!aba) {
    throw new Error(`Aba '${nomeAba}' não encontrada. Execute criarTodasAbas() primeiro.`);
  }
  return aba;
}

// ========== CRIAÇÃO DE ABAS ==========
function criarTodasAbas() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    
    // Criar aba PEDIDOS
    criarAbaPedidos(planilha);
    
    // Criar aba CUSTOS_MALHAS
    criarAbaCustosMalhas(planilha);
    
    // Criar aba CUSTOS_MAO_OBRA
    criarAbaCustosMaoObra(planilha);
    
    // Criar aba CUSTOS_ESTAMPAS
    criarAbaCustosEstampas(planilha);
    
    // Criar aba LOCALIDADES_ESTAMPAS
    criarAbaLocalidadesEstampas(planilha);
    
    // Criar aba DASHBOARD_DATA
    criarAbaDashboardData(planilha);
    
    console.log('Todas as abas foram criadas com sucesso!');
    return { sucesso: true, mensagem: 'Todas as abas foram criadas com sucesso!' };
    
  } catch (error) {
    console.error('Erro ao criar abas:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function criarAbaPedidos(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.PEDIDOS);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.PEDIDOS);
  
  // Cabeçalhos
  const cabecalhos = [
    'ID', 'Nome Cliente', 'Telefone', 'Data Pedido', 'Data Entrega',
    'Total Peças', 'Produtos (JSON)', 'Observações', 'Total Pedido (R$)',
    'Valor Entrada (R$)', 'Restante (R$)', 'Status', 'Data Criação', 'Data Modificação'
  ];
  
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  // Congelar primeira linha
  aba.setFrozenRows(1);
  
  // Ajustar largura das colunas
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba PEDIDOS criada com sucesso!');
}

function criarAbaCustosMalhas(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.CUSTOS_MALHAS);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.CUSTOS_MALHAS);
  
  // Cabeçalhos
  const cabecalhos = ['Tipo Malha', 'Preço/kg (R$)', 'Rendimento/kg', 'Custo/peça (R$)'];
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Dados das malhas
  const dados = [
    ['PV (65% Poliéster 35% Viscose)', 42.00, 2.1, 8.91],
    ['Algodão Peteado (100% Algodão)', 44.00, 2.4, 8.25],
    ['Piquet (50% Algodão 50% Poliéster)', 55.00, 2.1, 11.79],
    ['DryFit (100% Poliéster)', 41.90, 4.2, 7.30],
    ['Dry Poliamida (100% Poliamida)', 90.00, 3.8, 17.35],
    ['Moletom (50% Algodão 50% Poliéster)', 37.00, 1.8, 20.56],
    ['Malha PP (100% Poliéster)', 34.90, 2.1, 7.48],
    ['Algodão com Elastano (98% Algodão 2% Elastano)', 44.00, 2.4, 8.25]
  ];
  
  aba.getRange(2, 1, dados.length, cabecalhos.length).setValues(dados);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba CUSTOS_MALHAS criada com sucesso!');
}

function criarAbaCustosMaoObra(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.CUSTOS_MAO_OBRA);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.CUSTOS_MAO_OBRA);
  
  // Cabeçalhos
  const cabecalhos = ['Tipo Peça', 'Custo por Peça (R$)'];
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Dados da mão de obra
  const dados = [
    ['Camisas Comum', 4.50],
    ['Camisas POLO', 16.00],
    ['Moletons', 19.50],
    ['Camisa Social', 4.50]
  ];
  
  aba.getRange(2, 1, dados.length, cabecalhos.length).setValues(dados);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba CUSTOS_MAO_OBRA criada com sucesso!');
}

function criarAbaCustosEstampas(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.CUSTOS_ESTAMPAS);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.CUSTOS_ESTAMPAS);
  
  // Cabeçalhos
  const cabecalhos = ['Tipo Estampa', 'Localidade', 'Tamanho', 'Custo Unitário (R$)'];
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Dados das estampas (todas as 17 localidades)
  const dados = [
    // Silk Screen - Frente (9 localidades)
    ['Silk Screen', 'Peito Esquerdo 10x10', '10x10', 0.88],
    ['Silk Screen', 'Peito Direito 10x10', '10x10', 0.88],
    ['Silk Screen', 'Frente A4', 'A4', 3.88],
    ['Silk Screen', 'Frente A3', 'A3', 6.75],
    ['Silk Screen', 'Barra Centro Frente 10x10', '10x10', 0.88],
    ['Silk Screen', 'Barra Direita Frente 10x10', '10x10', 0.88],
    ['Silk Screen', 'Barra Esquerda Frente 10x10', '10x10', 0.88],
    ['Silk Screen', 'Ombro Direito 10x6', '10x6', 0.88],
    ['Silk Screen', 'Ombro Esquerdo 10x6', '10x6', 0.88],

    // Silk Screen - Costas (6 localidades)
    ['Silk Screen', 'Costas A4', 'A4', 3.88],
    ['Silk Screen', 'Costas A3', 'A3', 6.75],
    ['Silk Screen', 'Barra Centro Costas 10x10', '10x10', 0.88],
    ['Silk Screen', 'Barra Direita Costas 10x10', '10x10', 0.88],
    ['Silk Screen', 'Barra Esquerda Costas 10x10', '10x10', 0.88],
    ['Silk Screen', 'Pescoço Topo 10x6', '10x6', 0.88],

    // Silk Screen - Manga (2 localidades)
    ['Silk Screen', 'Manga Direita 10x6', '10x6', 0.88],
    ['Silk Screen', 'Manga Esquerda 10x6', '10x6', 0.88],

    // DTF - Todas as localidades
    ['DTF (Direct to Film)', 'Peito Esquerdo 10x10', '10x10', 1.40],
    ['DTF (Direct to Film)', 'Peito Direito 10x10', '10x10', 1.40],
    ['DTF (Direct to Film)', 'Frente A4', 'A4', 8.74],
    ['DTF (Direct to Film)', 'Frente A3', 'A3', 17.48],
    ['DTF (Direct to Film)', 'Costas A4', 'A4', 8.74],
    ['DTF (Direct to Film)', 'Costas A3', 'A3', 17.48],
    ['DTF (Direct to Film)', 'Manga Direita 10x6', '10x6', 0.84],
    ['DTF (Direct to Film)', 'Manga Esquerda 10x6', '10x6', 0.84],

    // Bordado - Principais localidades
    ['Bordado', 'Peito Esquerdo 10x10', '10x10', 5.00],
    ['Bordado', 'Peito Direito 10x10', '10x10', 5.00],
    ['Bordado', 'Frente A4', 'A4', 15.00],
    ['Bordado', 'Costas A4', 'A4', 15.00],
    ['Bordado', 'Manga Direita 10x6', '10x6', 6.00],
    ['Bordado', 'Manga Esquerda 10x6', '10x6', 6.00],

    // Sublimação Localizada
    ['Sublimação Localizada', 'Peito Esquerdo 10x10', '10x10', 0.30],
    ['Sublimação Localizada', 'Peito Direito 10x10', '10x10', 0.30],
    ['Sublimação Localizada', 'Frente A4', 'A4', 1.00],
    ['Sublimação Localizada', 'Frente A3', 'A3', 1.00],
    ['Sublimação Localizada', 'Costas A4', 'A4', 1.00],
    ['Sublimação Localizada', 'Costas A3', 'A3', 1.00],
    ['Sublimação Localizada', 'Manga Direita 10x6', '10x6', 0.30],
    ['Sublimação Localizada', 'Manga Esquerda 10x6', '10x6', 0.30],

    // Sublimação Total
    ['Sublimação Total (Full Print)', 'Total (Full Print)', 'Total', 5.27]
  ];
  
  aba.getRange(2, 1, dados.length, cabecalhos.length).setValues(dados);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba CUSTOS_ESTAMPAS criada com sucesso!');
}

function criarAbaLocalidadesEstampas(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.LOCALIDADES_ESTAMPAS);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.LOCALIDADES_ESTAMPAS);
  
  // Cabeçalhos
  const cabecalhos = ['Categoria', 'Localidade', 'Tamanho'];
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Dados das localidades
  const dados = [
    // Frente
    ['Frente', 'Peito Esquerdo 10x10', '10x10'],
    ['Frente', 'Peito Direito 10x10', '10x10'],
    ['Frente', 'Frente A4', 'A4'],
    ['Frente', 'Frente A3', 'A3'],
    ['Frente', 'Barra Centro Frente 10x10', '10x10'],
    ['Frente', 'Barra Direita Frente 10x10', '10x10'],
    ['Frente', 'Barra Esquerda Frente 10x10', '10x10'],
    ['Frente', 'Ombro Direito 10x6', '10x6'],
    ['Frente', 'Ombro Esquerdo 10x6', '10x6'],
    
    // Costas
    ['Costas', 'Costas A4', 'A4'],
    ['Costas', 'Costas A3', 'A3'],
    ['Costas', 'Barra Centro Costas 10x10', '10x10'],
    ['Costas', 'Barra Direita Costas 10x10', '10x10'],
    ['Costas', 'Barra Esquerda Costas 10x10', '10x10'],
    ['Costas', 'Pescoço Topo 10x6', '10x6'],
    
    // Manga
    ['Manga', 'Manga Direita 10x6', '10x6'],
    ['Manga', 'Manga Esquerda 10x6', '10x6']
  ];
  
  aba.getRange(2, 1, dados.length, cabecalhos.length).setValues(dados);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba LOCALIDADES_ESTAMPAS criada com sucesso!');
}

function criarAbaDashboardData(planilha) {
  let aba = planilha.getSheetByName(CONFIGURACAO.ABAS.DASHBOARD_DATA);
  if (aba) {
    planilha.deleteSheet(aba);
  }
  
  aba = planilha.insertSheet(CONFIGURACAO.ABAS.DASHBOARD_DATA);
  
  // Cabeçalhos
  const cabecalhos = ['Métrica', 'Valor', 'Data Atualização'];
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  
  // Dados iniciais do dashboard
  const dados = [
    ['Total Pedidos', 0, new Date()],
    ['Total Vendas (R$)', 0, new Date()],
    ['Pedidos Este Mês', 0, new Date()],
    ['Vendas Este Mês (R$)', 0, new Date()],
    ['Status: Em Análise', 0, new Date()],
    ['Status: Aprovado', 0, new Date()],
    ['Status: Em Produção', 0, new Date()],
    ['Status: Finalizado', 0, new Date()],
    ['Status: Entregue', 0, new Date()],
    ['Status: Cancelado', 0, new Date()]
  ];
  
  aba.getRange(2, 1, dados.length, cabecalhos.length).setValues(dados);
  
  // Formatação
  const cabecalhoRange = aba.getRange(1, 1, 1, cabecalhos.length);
  cabecalhoRange.setBackground('#2c3e50');
  cabecalhoRange.setFontColor('#ffffff');
  cabecalhoRange.setFontWeight('bold');
  
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalhos.length);
  
  console.log('Aba DASHBOARD_DATA criada com sucesso!');
}

// ========== FUNÇÕES DE DADOS ==========
function obterDados() {
  try {
    const custosMalhas = obterCustosMalhas();
    const custosMaoObra = obterCustosMaoObra();
    const custosEstampas = obterCustosEstampas();
    const localidades = obterLocalidades();
    
    return {
      sucesso: true,
      dados: {
        custosMalhas,
        custosMaoObra,
        custosEstampas,
        localidades
      }
    };
  } catch (error) {
    console.error('Erro ao obter dados:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function obterCustosMalhas() {
  const aba = obterAba(CONFIGURACAO.ABAS.CUSTOS_MALHAS);
  const dados = aba.getDataRange().getValues();
  
  const custos = {};
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    custos[linha[0]] = {
      precoPorKg: linha[1],
      rendimentoPorKg: linha[2],
      custoPorPeca: linha[3]
    };
  }
  
  return custos;
}

function obterCustosMaoObra() {
  const aba = obterAba(CONFIGURACAO.ABAS.CUSTOS_MAO_OBRA);
  const dados = aba.getDataRange().getValues();
  
  const custos = {};
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    custos[linha[0]] = {
      custoPorPeca: linha[1]
    };
  }
  
  return custos;
}

function obterCustosEstampas() {
  const aba = obterAba(CONFIGURACAO.ABAS.CUSTOS_ESTAMPAS);
  const dados = aba.getDataRange().getValues();
  
  const custos = {};
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const tipo = linha[0];
    const localidade = linha[1];
    const tamanho = linha[2];
    const custo = linha[3];
    
    if (!custos[tipo]) {
      custos[tipo] = {};
    }
    
    if (!custos[tipo][tamanho]) {
      custos[tipo][tamanho] = {};
    }
    
    custos[tipo][tamanho][localidade] = custo;
  }
  
  return custos;
}

function obterLocalidades() {
  const aba = obterAba(CONFIGURACAO.ABAS.LOCALIDADES_ESTAMPAS);
  const dados = aba.getDataRange().getValues();
  
  const localidades = {
    frente: [],
    costas: [],
    manga: []
  };
  
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    const categoria = linha[0].toLowerCase();
    const localidade = linha[1];
    
    if (localidades[categoria]) {
      localidades[categoria].push(localidade);
    }
  }
  
  return localidades;
}

// ========== FUNÇÕES DE PEDIDOS ==========
function salvarPedido(dados) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    
    // Verificar se ID já existe
    if (dados.id && pedidoExiste(dados.id)) {
      return { sucesso: false, erro: 'ID já existe. Use atualizarPedido() para modificar.' };
    }
    
    // Preparar dados para inserção
    const dadosLinha = [
      dados.id,
      dados.cliente.nome,
      dados.cliente.telefone,
      dados.datas.pedido,
      dados.datas.entrega,
      dados.totalPecas,
      JSON.stringify(dados.produtos),
      dados.observacoes,
      dados.financeiro.totalPedido,
      dados.financeiro.valorEntrada,
      dados.financeiro.restante,
      'Em Análise', // Status padrão
      new Date().toISOString(),
      new Date().toISOString()
    ];
    
    // Inserir nova linha
    const ultimaLinha = aba.getLastRow();
    aba.getRange(ultimaLinha + 1, 1, 1, dadosLinha.length).setValues([dadosLinha]);
    
    // Atualizar dashboard
    atualizarDashboard();
    
    console.log(`Pedido ${dados.id} salvo com sucesso!`);
    return { sucesso: true, mensagem: 'Pedido salvo com sucesso!' };
    
  } catch (error) {
    console.error('Erro ao salvar pedido:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function buscarPedido(termo) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dados = aba.getDataRange().getValues();
    
    // Buscar por ID ou nome
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const id = linha[0];
      const nome = linha[1];
      
      if (id === termo || nome.toLowerCase().includes(termo.toLowerCase())) {
        const pedido = {
          id: linha[0],
          cliente: {
            nome: linha[1],
            telefone: linha[2]
          },
          datas: {
            pedido: linha[3],
            entrega: linha[4]
          },
          totalPecas: linha[5],
          produtos: JSON.parse(linha[6] || '[]'),
          observacoes: linha[7],
          financeiro: {
            totalPedido: linha[8],
            valorEntrada: linha[9],
            restante: linha[10]
          },
          status: linha[11],
          dataCriacao: linha[12],
          dataModificacao: linha[13]
        };
        
        return { sucesso: true, pedido };
      }
    }
    
    return { sucesso: false, erro: 'Pedido não encontrado' };
    
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function atualizarPedido(dados) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dadosPlanilha = aba.getDataRange().getValues();
    
    // Encontrar linha do pedido
    for (let i = 1; i < dadosPlanilha.length; i++) {
      const linha = dadosPlanilha[i];
      if (linha[0] === dados.id) {
        // Atualizar dados
        const dadosLinha = [
          dados.id,
          dados.cliente.nome,
          dados.cliente.telefone,
          dados.datas.pedido,
          dados.datas.entrega,
          dados.totalPecas,
          JSON.stringify(dados.produtos),
          dados.observacoes,
          dados.financeiro.totalPedido,
          dados.financeiro.valorEntrada,
          dados.financeiro.restante,
          linha[11], // Manter status atual
          linha[12], // Manter data criação
          new Date().toISOString() // Atualizar data modificação
        ];
        
        aba.getRange(i + 1, 1, 1, dadosLinha.length).setValues([dadosLinha]);
        
        // Atualizar dashboard
        atualizarDashboard();
        
        console.log(`Pedido ${dados.id} atualizado com sucesso!`);
        return { sucesso: true, mensagem: 'Pedido atualizado com sucesso!' };
      }
    }
    
    return { sucesso: false, erro: 'Pedido não encontrado' };
    
  } catch (error) {
    console.error('Erro ao atualizar pedido:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function atualizarStatus(id, status) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dadosPlanilha = aba.getDataRange().getValues();
    
    // Encontrar linha do pedido
    for (let i = 1; i < dadosPlanilha.length; i++) {
      const linha = dadosPlanilha[i];
      if (linha[0] === id) {
        // Atualizar status e data modificação
        aba.getRange(i + 1, 12).setValue(status); // Coluna Status
        aba.getRange(i + 1, 14).setValue(new Date().toISOString()); // Data Modificação
        
        // Atualizar dashboard
        atualizarDashboard();
        
        console.log(`Status do pedido ${id} atualizado para ${status}!`);
        return { sucesso: true, mensagem: `Status atualizado para ${status}` };
      }
    }
    
    return { sucesso: false, erro: 'Pedido não encontrado' };
    
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function excluirPedido(id) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dadosPlanilha = aba.getDataRange().getValues();
    
    // Encontrar linha do pedido
    for (let i = 1; i < dadosPlanilha.length; i++) {
      const linha = dadosPlanilha[i];
      if (linha[0] === id) {
        // Soft delete - marcar como cancelado
        aba.getRange(i + 1, 12).setValue('Cancelado'); // Coluna Status
        aba.getRange(i + 1, 14).setValue(new Date().toISOString()); // Data Modificação
        
        // Atualizar dashboard
        atualizarDashboard();
        
        console.log(`Pedido ${id} marcado como cancelado!`);
        return { sucesso: true, mensagem: 'Pedido cancelado com sucesso!' };
      }
    }
    
    return { sucesso: false, erro: 'Pedido não encontrado' };
    
  } catch (error) {
    console.error('Erro ao excluir pedido:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function listarPedidos(filtro = null) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dados = aba.getDataRange().getValues();
    
    const pedidos = [];
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const status = linha[11];
      
      // Aplicar filtro se especificado
      if (!filtro || status === filtro) {
        const pedido = {
          id: linha[0],
          cliente: {
            nome: linha[1],
            telefone: linha[2]
          },
          datas: {
            pedido: linha[3],
            entrega: linha[4]
          },
          totalPecas: linha[5],
          totalPedido: linha[8],
          status: status,
          dataCriacao: linha[12]
        };
        pedidos.push(pedido);
      }
    }
    
    return { sucesso: true, pedidos };
    
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function pedidoExiste(id) {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const dados = aba.getDataRange().getValues();
    
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === id) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

// ========== FUNÇÕES DE DASHBOARD ==========
function obterDashboard() {
  try {
    const aba = obterAba(CONFIGURACAO.ABAS.DASHBOARD_DATA);
    const dados = aba.getDataRange().getValues();
    
    const dashboard = {};
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      dashboard[linha[0]] = linha[1];
    }
    
    return { sucesso: true, dashboard };
    
  } catch (error) {
    console.error('Erro ao obter dashboard:', error);
    return { sucesso: false, erro: error.toString() };
  }
}

function atualizarDashboard() {
  try {
    const abaPedidos = obterAba(CONFIGURACAO.ABAS.PEDIDOS);
    const abaDashboard = obterAba(CONFIGURACAO.ABAS.DASHBOARD_DATA);
    
    const dadosPedidos = abaPedidos.getDataRange().getValues();
    
    // Calcular métricas
    let totalPedidos = 0;
    let totalVendas = 0;
    let pedidosEsteMes = 0;
    let vendasEsteMes = 0;
    const statusCount = {};
    
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();
    
    for (let i = 1; i < dadosPedidos.length; i++) {
      const linha = dadosPedidos[i];
      const status = linha[11];
      const totalPedido = parseFloat(linha[8]) || 0;
      const dataCriacao = new Date(linha[12]);
      
      totalPedidos++;
      totalVendas += totalPedido;
      
      // Verificar se é do mês atual
      if (dataCriacao.getMonth() === mesAtual && dataCriacao.getFullYear() === anoAtual) {
        pedidosEsteMes++;
        vendasEsteMes += totalPedido;
      }
      
      // Contar status
      statusCount[status] = (statusCount[status] || 0) + 1;
    }
    
    // Atualizar dashboard
    const dadosDashboard = [
      ['Total Pedidos', totalPedidos, new Date()],
      ['Total Vendas (R$)', totalVendas, new Date()],
      ['Pedidos Este Mês', pedidosEsteMes, new Date()],
      ['Vendas Este Mês (R$)', vendasEsteMes, new Date()],
      ['Status: Em Análise', statusCount['Em Análise'] || 0, new Date()],
      ['Status: Aprovado', statusCount['Aprovado'] || 0, new Date()],
      ['Status: Em Produção', statusCount['Em Produção'] || 0, new Date()],
      ['Status: Finalizado', statusCount['Finalizado'] || 0, new Date()],
      ['Status: Entregue', statusCount['Entregue'] || 0, new Date()],
      ['Status: Cancelado', statusCount['Cancelado'] || 0, new Date()]
    ];
    
    // Limpar dados antigos e inserir novos
    abaDashboard.getRange(2, 1, dadosDashboard.length, 3).setValues(dadosDashboard);
    
    console.log('Dashboard atualizado com sucesso!');
    
  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
  }
}

// ========== FUNÇÕES DE TESTE ==========
function testarConexao() {
  try {
    const planilha = obterPlanilha();
    return { sucesso: true, mensagem: 'Conexão com planilha OK!' };
  } catch (error) {
    return { sucesso: false, erro: error.toString() };
  }
}

function testarSalvarPedido() {
  const dadosTeste = {
    id: 'TESTE-001',
    cliente: {
      nome: 'Cliente Teste',
      telefone: '(31) 99999-9999'
    },
    datas: {
      pedido: '2024-01-15',
      entrega: '2024-02-19'
    },
    totalPecas: 10,
    produtos: [{
      numero: 1,
      tipoPeca: 'Camisas Comum',
      detalhesPeca: 'Gola O - Manga Curta - Com Punho Personalizado',
      tipoMalha: 'Algodão Peteado (100% Algodão)',
      corMalha: 'Branco',
      tamanhos: [{ tamanho: 'M', quantidade: 5 }, { tamanho: 'G', quantidade: 5 }],
      estampas: [{ tipo: 'Bordado', localidade: 'Peito Esquerdo 10x10' }],
      custos: { malha: 8.25, maoObra: 4.50, estampas: 5.00, fixo: 10.00, total: 27.75 },
      margemLucro: 100,
      precoUnitario: 55.50,
      valorTotal: 555.00
    }],
    observacoes: 'Pedido de teste',
    financeiro: {
      totalPedido: 555.00,
      valorEntrada: 200.00,
      restante: 355.00
    }
  };
  
  return salvarPedido(dadosTeste);
}

// ========== LOGS E MONITORAMENTO ==========
function logOperacao(operacao, dados, resultado) {
  console.log(`[${new Date().toISOString()}] ${operacao}:`, {
    dados: dados,
    resultado: resultado
  });
}

// ========== INICIALIZAÇÃO ==========
function inicializarSistema() {
  try {
    console.log('Inicializando Sistema Adonay Confecção...');
    
    // Verificar se as abas existem
    const planilha = obterPlanilha();
    const abasExistentes = planilha.getSheets().map(aba => aba.getName());
    
    const abasNecessarias = Object.values(CONFIGURACAO.ABAS);
    const abasFaltando = abasNecessarias.filter(aba => !abasExistentes.includes(aba));
    
    if (abasFaltando.length > 0) {
      console.log('Abas faltando:', abasFaltando);
      console.log('Execute criarTodasAbas() para criar as abas necessárias.');
      return { sucesso: false, erro: 'Abas faltando. Execute criarTodasAbas() primeiro.' };
    }
    
    console.log('Sistema inicializado com sucesso!');
    return { sucesso: true, mensagem: 'Sistema inicializado com sucesso!' };
    
  } catch (error) {
    console.error('Erro ao inicializar sistema:', error);
    return { sucesso: false, erro: error.toString() };
  }
}