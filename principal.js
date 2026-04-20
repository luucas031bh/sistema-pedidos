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
        tbody.innerHTML = '<tr><td colspan="6">Abra via localhost para carregar o painel.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6">Atualizando...</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6">Falha ao carregar dados do painel.</td></tr>';
    }
}

function renderizarFilaPainel(pedidos) {
    const tbody = document.getElementById('painelFilaBody');
    if (!tbody) return;
    if (!pedidos.length) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = pedidos.map((pedido) => `
        <tr>
            <td>${pedido.id || '-'}</td>
            <td>${pedido.cliente?.nome || '-'}</td>
            <td>${pedido.cliente?.telefone || '-'}</td>
            <td>${Utils.dataISOParaBR(pedido.datas?.entrega || '')}</td>
            <td>${pedido.statusOperacional || '-'}</td>
            <td>${Utils.formatarMoeda(pedido.financeiro?.totalPedido || 0)}</td>
        </tr>
    `).join('');
}

function renderizarStats(stats) {
    document.getElementById('kpiTotal').textContent = stats.totalPedidos ?? 0;
    document.getElementById('kpiHoje').textContent = stats.pedidosHoje ?? 0;
    document.getElementById('kpiSemana').textContent = stats.pedidosEstaSemana ?? 0;
    document.getElementById('kpiValor').textContent = Utils.formatarMoeda(stats.valorTotal ?? 0);
}
