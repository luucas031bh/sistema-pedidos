// Configurações do Sistema Adonay Confecção

const CONFIG = {
    // URL do Google Apps Script (Web App)
    // IMPORTANTE: Sempre que alterar Code.gs, faça Implantação > Gerenciar implantações >
    // Editar > Versão: Nova versão > Implantar e cole aqui a URL /exec dessa implantação.
    // Se esta URL estiver desatualizada, o painel e a edição podem falhar ou apontar para lógica antiga.
    //
    // CHECKLIST após mudanças (evita duplicação / lógica antiga no ar):
    // [ ] Colar o Code.gs atualizado no projeto Google Apps Script
    // [ ] Implantação > Gerenciar implantações > Editar > Versão: Nova versão > Implantar
    // [ ] Copiar a URL /exec desta implantação e colar em APPS_SCRIPT_URL abaixo
    // [ ] Publicar no host do site: script.js, home.js, config.js, utils.js, index.html, editar-pedido.html (o que mudou)
    // [ ] Hard refresh no navegador; na planilha, remover linhas duplicadas com o mesmo ID se existirem
    //
    // INSTRUÇÕES:
    // 1. Siga o GUIA-BANCO-DADOS.md para criar o banco de dados
    // 2. Após o PASSO 5 (Deploy), copie a URL do aplicativo da Web
    // 3. Cole a URL completa aqui (deve terminar com /exec)
    // 4. Exemplo: 'https://script.google.com/macros/s/AKfycby.../exec'
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby9LFyzYkXW_Zo9i_u3jdGfRweu5UaDvf4PsGWyTh8UB0hXGEls2l_oELjJSDkpZwDoAQ/exec',
    
    // Informações da Empresa
    EMPRESA: {
        nome: 'ADONAY CONFECÇÃO',
        cnpj: '42.522.845/0001-97',
        endereco: 'Rua Geraldo Teixeira da Costa, São Benedito, Santa Luzia - MG',
        telefone1: '(31) 3950-3089',
        telefone2: '(31) 3950-3089',
        instagram: '@adonayconfeccao',
        whatsappPadrao: '5531995030089' // Número padrão para envio (sem formatação)
    },
    
    // Configurações de Cálculo
    CALCULOS: {
        percentualFixoOperacional: 15, // 15% de custo fixo operacional
        diasParaEntrega: 35, // Dias padrão para entrega
        margemLucroPadrao: 100 // Margem de lucro padrão (%)
    },
    
    // Tamanhos disponíveis
    TAMANHOS: [
        '2', '4', '6', '8', '10', '12', '14',
        'PP', 'P', 'M', 'G', 'GG', 'EG', 'XX',
        'PP (BL)', 'P (BL)', 'M (BL)', 'G (BL)', 'GG (BL)'
    ],
    
    // Tipos de Estampas
    TIPOS_ESTAMPAS: [
        'Silk Screen',
        'DTF (Direct to Film)',
        'Bordado',
        'Sublimação Localizada',
        'Sublimação Total (Full Print)'
    ],
    
    // Localidades de Estampas (17 opções)
    LOCALIDADES_FRENTE: [
        'Peito Esquerdo 10x10',
        'Peito Direito 10x10',
        'Frente A4',
        'Frente A3',
        'Barra Centro Frente 10x10',
        'Barra Direita Frente 10x10',
        'Barra Esquerda Frente 10x10',
        'Ombro Direito 10x6',
        'Ombro Esquerdo 10x6'
    ],
    
    LOCALIDADES_COSTAS: [
        'Costas A4',
        'Costas A3',
        'Barra Centro Costas 10x10',
        'Barra Direita Costas 10x10',
        'Barra Esquerda Costas 10x10',
        'Pescoço Topo 10x6'
    ],
    
    LOCALIDADES_MANGA: [
        'Manga Direita 10x6',
        'Manga Esquerda 10x6'
    ],
    
    // Quantidades de cores para Silk Screen
    QUANTIDADES_CORES_SILK: [
        '1 Cor',
        '2 Cores',
        '3 Cores',
        '4 Cores',
        'Policromia (5+ cores)'
    ],
    
    // Tipos de Peças (Arrays Simples - conforme especificação)
    TIPOS_PECAS: {
        'Camisas Comum': [
            'Gola O - Manga Curta - Com Punho Personalizado',
            'Gola O - Manga Curta - Com Bainha',
            'Gola O - Manga Longa',
            'Gola V - Manga Curta - Com Punho Personalizado',
            'Gola V - Manga Curta - Com Bainha',
            'Gola V - Manga Longa'
        ],
        'Moletons': [
            'Capuz com Bolso',
            'Capuz sem Bolso',
            'Careca com Bolso',
            'Careca Sem Bolso'
        ],
        'Camisas POLO': [
            'Manga Curta - Com Punho Personalizado',
            'Manga Curta - Com Bainha',
            'Manga Longa'
        ],
        'Camisa Social': [
            'Manga Curta',
            'Manga Longa'
        ]
    },
    
    // Tipos de Malha (conforme especificação)
    TIPOS_MALHA: [
        'PV (65% Poliéster 35% Viscose)',
        'Algodão Peteado (100% Algodão)',
        'DryFit (100% Poliéster)',
        'Dry Poliamida (100% Poliamida)',
        'Helanca Light (100% Poliéster)',
        'Piquet (50% Algodão 50% Poliéster)',
        'Moletom (50% Algodão 50% Poliéster)',
        'Malha PP (100% Poliéster)',
        'Algodão com Elastano (98% Algodão 2% Elastano)'
    ],
    
    // Status operacionais (select único; valores gravados na planilha como texto)
    STATUS_PEDIDO: [
        'Novo pedido',
        'Pendente',
        'Orçamento',
        'Em produção',
        'Atrasado',
        'Cancelado',
        'Travado',
        'Finalizado'
    ],
    
    // Mensagens do Sistema
    MENSAGENS: {
        salvandoPedido: 'Salvando pedido...',
        pedidoSalvo: 'Pedido salvo com sucesso!',
        erroPedido: 'Erro ao salvar pedido. Tente novamente.',
        buscandoPedido: 'Buscando pedido...',
        pedidoNaoEncontrado: 'Pedido não encontrado.',
        camposObrigatorios: 'Preencha todos os campos obrigatórios.',
        telefoneInvalido: 'Telefone inválido. Use o formato (XX) X XXXX-XXXX',
        dataPedidoInvalida: 'Data de entrega deve ser posterior à data do pedido.',
        carregandoDados: 'Carregando dados...',
        erroCarregarDados: 'Erro ao carregar dados. Verifique a conexão.'
    }
};

// Exportar para uso global
window.CONFIG = CONFIG;

