let pedidoOriginal = null;

document.addEventListener('DOMContentLoaded', () => {
    atualizarRelogioEdicao();
    setInterval(atualizarRelogioEdicao, 1000);
    inicializarStatusOperacionaisEdicao();
    configurarEventosEdicao();
    carregarPedidoPorId();
});

function atualizarRelogioEdicao() {
    const el = document.getElementById('relogio');
    if (el) el.textContent = Utils.dataHoraCompleta();
}

function inicializarStatusOperacionaisEdicao() {
    const select = document.getElementById('statusOperacionalEdicao');
    if (!select) return;
    select.innerHTML = CONFIG.STATUS_PEDIDO.map((status) => `<option value="${status}">${status}</option>`).join('');
}

function configurarEventosEdicao() {
    const telefone = document.getElementById('telefoneEdicao');
    if (telefone) {
        telefone.addEventListener('input', (event) => {
            event.target.value = Utils.formatarTelefone(event.target.value);
        });
    }
}

async function carregarPedidoPorId() {
    const id = (new URLSearchParams(window.location.search).get('id') || '').trim();
    if (!id) {
        Utils.mostrarNotificacao('ID do pedido não informado.', 'error');
        return;
    }
    if (window.location.protocol === 'file:') {
        Utils.mostrarNotificacao('Abra via localhost para carregar dados.', 'error');
        return;
    }
    mostrarLoadingEdicao('Carregando pedido...');
    try {
        const resposta = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=buscarPedido&acao=buscarPedido&termo=${encodeURIComponent(id)}`);
        const resultado = await resposta.json();
        if (!resultado.sucesso || !resultado.pedido) throw new Error('Pedido não encontrado');
        pedidoOriginal = resultado.pedido;
        preencherResumoEdicao(pedidoOriginal);
        preencherFormularioEdicao(pedidoOriginal);
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Não foi possível carregar o pedido.', 'error');
    } finally {
        esconderLoadingEdicao();
    }
}

function preencherResumoEdicao(pedido) {
    document.getElementById('resumoId').textContent = pedido.id || '-';
    document.getElementById('resumoCliente').textContent = pedido.cliente?.nome || '-';
    document.getElementById('resumoValor').textContent = Utils.formatarMoeda(pedido.financeiro?.totalPedido || 0);

    const container = document.getElementById('resumoProdutos');
    const produtos = Array.isArray(pedido.produtos) ? pedido.produtos : [];
    if (!container) return;
    if (!produtos.length) {
        container.innerHTML = '<div class="form-input">Nenhum produto cadastrado.</div>';
        return;
    }
    container.innerHTML = produtos.map((produto, index) => `
        <div class="form-input mt-1">
            <strong>Produto ${index + 1}:</strong> ${produto.tipoPeca || '-'} | ${produto.tipoMalha || '-'} | ${produto.corMalha || '-'} | ${produto.detalhesPeca || '-'} | Tipo de Estampa: ${(produto.estampas || []).map((item) => item?.tipo).filter(Boolean).join(', ') || '-'}
        </div>
    `).join('');
}

function preencherFormularioEdicao(pedido) {
    document.getElementById('nomeClienteEdicao').value = pedido.cliente?.nome || '';
    document.getElementById('telefoneEdicao').value = pedido.cliente?.telefone || '';
    document.getElementById('dataEntregaEdicao').value = normalizarDataISO(pedido.datas?.entrega);
    document.getElementById('dataPedidoEdicao').value = normalizarDataISO(pedido.datas?.pedido);
    document.getElementById('totalPecasEdicao').value = pedido.totalPecas || 0;
    document.getElementById('observacoesEdicao').value = pedido.observacoes || '';
    document.getElementById('statusOperacionalEdicao').value = pedido.statusOperacional || CONFIG.STATUS_PEDIDO[0];

    const resumo = obterResumoProduto(pedido);
    document.getElementById('tipoPecaEdicao').value = resumo.tipoPeca || '';
    document.getElementById('tipoMalhaEdicao').value = resumo.tipoMalha || '';
    document.getElementById('corMalhaEdicao').value = resumo.corMalha || '';
    document.getElementById('detalhePecaEdicao').value = resumo.detalhePeca || '';
    document.getElementById('tipoEstampaEdicao').value = resumo.tipoEstampa || '';

    document.getElementById('statusArteEdicao').checked = !!pedido.statusProducao?.arte;
    document.getElementById('statusOSEdicao').checked = !!pedido.statusProducao?.os;
    document.getElementById('statusCorteEdicao').checked = !!pedido.statusProducao?.corte;
    document.getElementById('statusEstampaOkEdicao').checked = !!pedido.statusProducao?.estampa;
    document.getElementById('statusProntoEnvioEdicao').checked = !!pedido.statusProducao?.prontoParaEnvio;
}

function obterResumoProduto(pedido) {
    const primeiro = Array.isArray(pedido.produtos) ? (pedido.produtos[0] || {}) : {};
    const tipoEstampa = Array.isArray(primeiro.estampas) ? primeiro.estampas.map((item) => item?.tipo).filter(Boolean).join(', ') : '';
    return {
        tipoPeca: primeiro.tipoPeca || pedido.resumoProduto?.tipoPeca || '',
        tipoMalha: primeiro.tipoMalha || pedido.resumoProduto?.tipoMalha || '',
        corMalha: primeiro.corMalha || pedido.resumoProduto?.corMalha || '',
        detalhePeca: primeiro.detalhesPeca || primeiro.detalhePeca || pedido.resumoProduto?.detalhePeca || '',
        tipoEstampa: tipoEstampa || pedido.resumoProduto?.estampaResumo || ''
    };
}

async function salvarEdicaoPedido() {
    if (!pedidoOriginal) return;
    if (!Utils.validarCampoObrigatorio(document.getElementById('nomeClienteEdicao').value)) {
        Utils.mostrarNotificacao('Informe o nome do cliente.', 'error');
        return;
    }
    if (!Utils.validarTelefone(document.getElementById('telefoneEdicao').value)) {
        Utils.mostrarNotificacao('Telefone inválido.', 'error');
        return;
    }
    const dados = montarPayloadEdicao();
    mostrarLoadingEdicao('Salvando edição...');
    try {
        const body = new URLSearchParams();
        body.append('action', 'salvarPedido');
        body.append('acao', 'salvarPedido');
        body.append('dados', JSON.stringify(dados));

        const resposta = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body });
        const resultado = await resposta.json();
        if (!resultado.sucesso) throw new Error(resultado.erro || 'Falha ao salvar');

        pedidoOriginal = dados;
        preencherResumoEdicao(dados);
        Utils.mostrarNotificacao('Edição salva com sucesso!', 'success');
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Erro ao salvar edição.', 'error');
    } finally {
        esconderLoadingEdicao();
    }
}

function montarPayloadEdicao() {
    const produtosOriginais = Array.isArray(pedidoOriginal.produtos) ? [...pedidoOriginal.produtos] : [];
    const primeiro = produtosOriginais[0] || {};
    const tiposEstampa = (document.getElementById('tipoEstampaEdicao').value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const estampas = tiposEstampa.map((tipo) => ({ tipo, localidade: '' }));

    produtosOriginais[0] = {
        ...primeiro,
        tipoPeca: document.getElementById('tipoPecaEdicao').value,
        tipoMalha: document.getElementById('tipoMalhaEdicao').value,
        corMalha: document.getElementById('corMalhaEdicao').value,
        detalhesPeca: document.getElementById('detalhePecaEdicao').value,
        estampas
    };

    return {
        ...pedidoOriginal,
        id: pedidoOriginal.id,
        cliente: {
            ...(pedidoOriginal.cliente || {}),
            nome: document.getElementById('nomeClienteEdicao').value,
            telefone: document.getElementById('telefoneEdicao').value
        },
        datas: {
            ...(pedidoOriginal.datas || {}),
            pedido: document.getElementById('dataPedidoEdicao').value,
            entrega: document.getElementById('dataEntregaEdicao').value
        },
        totalPecas: parseInt(document.getElementById('totalPecasEdicao').value || '0', 10),
        observacoes: document.getElementById('observacoesEdicao').value,
        statusOperacional: document.getElementById('statusOperacionalEdicao').value,
        statusProducao: {
            arte: document.getElementById('statusArteEdicao').checked,
            os: document.getElementById('statusOSEdicao').checked,
            corte: document.getElementById('statusCorteEdicao').checked,
            estampa: document.getElementById('statusEstampaOkEdicao').checked,
            prontoParaEnvio: document.getElementById('statusProntoEnvioEdicao').checked
        },
        produtos: produtosOriginais
    };
}

function normalizarDataISO(data) {
    if (!data) return '';
    if (typeof data === 'string') {
        const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function mostrarLoadingEdicao(mensagem) {
    document.body.insertAdjacentHTML('beforeend', `<div class="loading-overlay" id="loadingOverlay"><div class="loading-content"><div class="loading loading-big"></div><p>${mensagem}</p></div></div>`);
}

function esconderLoadingEdicao() {
    document.getElementById('loadingOverlay')?.remove();
}
