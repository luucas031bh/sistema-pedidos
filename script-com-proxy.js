// ========== SCRIPT COM PROXY LOCAL ==========
// Este arquivo é uma versão modificada do script.js que inclui
// detecção automática de CORS e uso de proxy local quando necessário

// Detectar se está rodando localmente (file://) ou em servidor
const isLocalFile = window.location.protocol === 'file:';
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Configurar URL baseada no ambiente
const getApiUrl = () => {
    if (isLocalFile) {
        // Se estiver rodando como arquivo local, usar proxy local
        console.log('🔧 Modo: Arquivo local detectado, usando proxy local');
        return 'http://localhost:8000/api/proxy';
    } else if (isLocalhost) {
        // Se estiver rodando em localhost, usar proxy local
        console.log('🔧 Modo: Localhost detectado, usando proxy local');
        return 'http://localhost:8000/api/proxy';
    } else {
        // Se estiver rodando em servidor, usar URL direta
        console.log('🔧 Modo: Servidor detectado, usando URL direta');
        return CONFIG.APPS_SCRIPT_URL;
    }
};

// Função modificada para salvar pedido com detecção automática
async function salvarPedidoComProxy() {
    const dadosPedido = obterDadosPedido();
    
    if (!dadosPedido) {
        return;
    }
    
    // Mostrar loading
    mostrarLoading(CONFIG.MENSAGENS.salvandoPedido);
    
    try {
        const apiUrl = getApiUrl();
        console.log('📡 Enviando para:', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'salvarPedido',
                dados: dadosPedido
            })
        });
        
        const resultado = await response.json();
        
        esconderLoading();
        
        if (resultado.sucesso) {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.pedidoSalvo, 'success');
            console.log('✅ Pedido salvo com sucesso:', resultado);
        } else {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.erroPedido, 'error');
            console.error('❌ Erro ao salvar pedido:', resultado);
        }
    } catch (error) {
        console.error('❌ Erro ao salvar pedido:', error);
        esconderLoading();
        
        // Se for erro CORS e estiver rodando localmente, sugerir servidor
        if (error.message.includes('CORS') || error.message.includes('blocked')) {
            Utils.mostrarNotificacao(
                'Erro CORS detectado. Execute o servidor local (servidor-local.py) para resolver.',
                'error'
            );
            console.log('💡 Solução: Execute o servidor local para contornar CORS');
        } else {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.erroPedido, 'error');
        }
    }
}

// Função modificada para buscar pedido com detecção automática
async function buscarPedidoComProxy(termo) {
    if (!termo) {
        Utils.mostrarNotificacao('Digite um termo para buscar', 'warning');
        return;
    }
    
    mostrarLoading(CONFIG.MENSAGENS.buscandoPedido);
    
    try {
        const apiUrl = getApiUrl();
        console.log('🔍 Buscando em:', apiUrl);
        
        const response = await fetch(`${apiUrl}?acao=buscarPedido&termo=${encodeURIComponent(termo)}`);
        const resultado = await response.json();
        
        esconderLoading();
        
        if (resultado.sucesso && resultado.pedido) {
            carregarDadosPedido(resultado.pedido);
            Utils.mostrarNotificacao('Pedido encontrado!', 'success');
        } else {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.pedidoNaoEncontrado, 'warning');
        }
    } catch (error) {
        console.error('❌ Erro ao buscar pedido:', error);
        esconderLoading();
        Utils.mostrarNotificacao('Erro ao buscar pedido', 'error');
    }
}

// Função para testar conexão
async function testarConexao() {
    try {
        const apiUrl = getApiUrl();
        console.log('🧪 Testando conexão com:', apiUrl);
        
        const response = await fetch(apiUrl);
        const resultado = await response.json();
        
        console.log('✅ Conexão bem-sucedida:', resultado);
        Utils.mostrarNotificacao('Conexão com servidor OK!', 'success');
        return true;
    } catch (error) {
        console.error('❌ Erro na conexão:', error);
        Utils.mostrarNotificacao('Erro de conexão com servidor', 'error');
        return false;
    }
}

// Substituir as funções originais
if (typeof salvarPedido === 'function') {
    // Backup da função original
    window.salvarPedidoOriginal = salvarPedido;
    // Substituir pela versão com proxy
    window.salvarPedido = salvarPedidoComProxy;
}

if (typeof buscarPedido === 'function') {
    // Backup da função original
    window.buscarPedidoOriginal = buscarPedido;
    // Substituir pela versão com proxy
    window.buscarPedido = buscarPedidoComProxy;
}

// Adicionar função de teste ao escopo global
window.testarConexao = testarConexao;

console.log('🔧 Script com proxy carregado');
console.log('🌐 Modo detectado:', isLocalFile ? 'Arquivo Local' : isLocalhost ? 'Localhost' : 'Servidor');
console.log('🔗 URL da API:', getApiUrl());
