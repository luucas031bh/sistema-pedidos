document.addEventListener('DOMContentLoaded', () => {
    atualizarRelogioPainel();
    setInterval(atualizarRelogioPainel, 1000);
    document.getElementById('btnAtualizarPainel')?.addEventListener('click', carregarPainel);
    carregarPainel();
});

function atualizarRelogioPainel() {
    const el = document.getElementById('relogio');
    if (el) el.textContent = Utils.dataHoraCompleta();
}

async function carregarPainel() {
    const tbody = document.getElementById('painelFilaBody');
    if (!tbody) return;

    if (window.location.protocol === 'file:') {
        tbody.innerHTML = '<tr><td colspan="14">Abra via localhost para carregar o painel.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="14">Atualizando...</td></tr>';
    try {
        const [filaRes, statsRes] = await Promise.all([
            fetch(`${CONFIG.APPS_SCRIPT_URL}?action=listarPedidos&acao=listarPedidos`),
            fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getStats&acao=getStats`)
        ]);
        const filaData = await filaRes.json();
        const statsData = await statsRes.json();

        renderizarFilaPainel(filaData.pedidos || []);
        renderizarStats(statsData.stats || {});
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="14">Falha ao carregar dados do painel.</td></tr>';
    }
}

function renderizarFilaPainel(pedidos) {
    const tbody = document.getElementById('painelFilaBody');
    if (!tbody) return;
    if (!pedidos.length) {
        tbody.innerHTML = '<tr><td colspan="14">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = pedidos.map((pedido) => {
        const linkPedido = `editar-pedido.html?id=${encodeURIComponent(pedido.id || '')}`;
        const resumo = obterResumoProdutoPedido(pedido);
        return `
            <tr>
                <td><a class="cliente-link" href="${linkPedido}" target="_blank" rel="noopener noreferrer">${pedido.cliente?.nome || '-'}</a></td>
                <td>${pedido.id || '-'}</td>
                <td>${formatarDataEntregaSimples(pedido.datas?.entrega)}</td>
                <td>${pedido.totalPecas ?? 0}</td>
                <td>${resumo.tipoPeca || '-'}</td>
                <td>${resumo.tipoMalha || '-'}</td>
                <td>${resumo.corMalha || '-'}</td>
                <td>${resumo.detalhePeca || '-'}</td>
                <td>${resumo.estampaResumo || '-'}</td>
                <td>${renderizarBadgeProducao(pedido.statusProducao?.arte)}</td>
                <td>${renderizarBadgeProducao(pedido.statusProducao?.os)}</td>
                <td>${renderizarBadgeProducao(pedido.statusProducao?.corte)}</td>
                <td>${renderizarBadgeProducao(pedido.statusProducao?.estampa)}</td>
                <td>${renderizarBadgeProducao(pedido.statusProducao?.prontoParaEnvio)}</td>
            </tr>
        `;
    }).join('');
}

function renderizarStats(stats) {
    document.getElementById('kpiTotal').textContent = stats.totalPedidos ?? 0;
    document.getElementById('kpiHoje').textContent = stats.pedidosHoje ?? 0;
    document.getElementById('kpiSemana').textContent = stats.pedidosEstaSemana ?? 0;
    document.getElementById('kpiValor').textContent = Utils.formatarMoeda(stats.valorTotal ?? 0);
}

function formatarDataEntregaSimples(data) {
    if (!data) return '-';
    if (typeof data === 'string') {
        const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    const dataObj = new Date(data);
    if (Number.isNaN(dataObj.getTime())) return '-';
    return `${String(dataObj.getDate()).padStart(2, '0')}/${String(dataObj.getMonth() + 1).padStart(2, '0')}/${dataObj.getFullYear()}`;
}

function renderizarBadgeProducao(status) {
    return status ? '<span class="badge-producao badge-producao-ok">VERDE</span>' : '<span class="badge-producao badge-producao-pendente">VERMELHO</span>';
}

function obterResumoProdutoPedido(pedido) {
    const resumo = pedido.resumoProduto || {};
    if (resumo.tipoPeca || resumo.tipoMalha || resumo.corMalha || resumo.detalhePeca || resumo.estampaResumo) return resumo;
    const produto = Array.isArray(pedido.produtos) ? (pedido.produtos[0] || {}) : {};
    const estampas = Array.isArray(produto.estampas) ? produto.estampas : [];
    return {
        tipoPeca: produto.tipoPeca || '',
        tipoMalha: produto.tipoMalha || '',
        corMalha: produto.corMalha || '',
        detalhePeca: produto.detalhesPeca || produto.detalhePeca || '',
        estampaResumo: estampas.map((item) => item?.tipo).filter(Boolean).join(', ')
    };
}
