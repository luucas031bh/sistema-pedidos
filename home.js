let homePodeRecarregarVisibilidade = false;

document.addEventListener('DOMContentLoaded', () => {
    atualizarRelogioHome();
    setInterval(atualizarRelogioHome, 1000);
    document.getElementById('btnAtualizarHome')?.addEventListener('click', carregarHome);
    carregarHome();
    window.setTimeout(() => {
        homePodeRecarregarVisibilidade = true;
    }, 800);
});

window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) carregarHome();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && homePodeRecarregarVisibilidade) {
        carregarHome();
    }
});

function atualizarRelogioHome() {
    const el = document.getElementById('relogio');
    if (el) el.textContent = Utils.dataHoraCompleta();
}

/** Pedido em aberto: não entregue e não cancelado (alinhado ao Code.gs). */
function pedidoEstaAberto(pedido) {
    const s = String(pedido?.statusOperacional || '').trim().toLowerCase();
    if (!s) return true;
    if (s === 'entregue' || s === 'finalizado') return false;
    if (s === 'cancelado') return false;
    return true;
}

function obterResumoProdutoPedidoHome(pedido) {
    const resumo = pedido.resumoProduto || {};
    if (resumo.tipoPeca || resumo.tipoMalha || resumo.corMalha || resumo.detalhePeca || resumo.estampaResumo) {
        return {
            tipoPeca: resumo.tipoPeca || '',
            tipoMalha: resumo.tipoMalha || '',
            corMalha: resumo.corMalha || '',
            detalhePeca: resumo.detalhePeca || '',
            estampaResumo: resumo.estampaResumo || ''
        };
    }
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

/**
 * Rótulo resumido: POLO, GOLA O, GOLA V, Moletom, Camisa SOCIAL.
 */
function resumirTipoPeca(tipoPeca, detalhePeca) {
    const tipo = String(tipoPeca || '').trim();
    const det = String(detalhePeca || '').trim();
    const tLower = tipo.toLowerCase();
    const dLower = det.toLowerCase();

    if (tLower.includes('polo') || dLower.includes('polo')) return 'POLO';
    if (tLower.includes('social')) return 'Camisa SOCIAL';
    if (tLower.includes('moletom') || tLower.includes('moleton')) return 'Moletom';
    if (dLower.includes('gola v')) return 'GOLA V';
    if (dLower.includes('gola o')) return 'GOLA O';
    if (tipo) return tipo;
    return '—';
}

function parseDataEntregaLocal(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(
                parseInt(match[1], 10),
                parseInt(match[2], 10) - 1,
                parseInt(match[3], 10)
            );
        }
    }
    const d = new Date(data);
    return Number.isNaN(d.getTime()) ? null : d;
}

function textoDiasParaEntrega(dataEntrega) {
    const entrega = parseDataEntregaLocal(dataEntrega);
    if (!entrega) return '—';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    entrega.setHours(0, 0, 0, 0);
    const ms = entrega.getTime() - hoje.getTime();
    const diffDias = Math.round(ms / 86400000);
    if (diffDias > 0) return `${diffDias} ${diffDias === 1 ? 'dia' : 'dias'} para entrega`;
    if (diffDias === 0) return 'Entrega hoje';
    const atraso = Math.abs(diffDias);
    return `Atrasado (${atraso} ${atraso === 1 ? 'dia' : 'dias'})`;
}

function formatarDataEntregaBR(data) {
    if (!data) return '—';
    if (typeof data === 'string') {
        const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    const dataObj = new Date(data);
    if (Number.isNaN(dataObj.getTime())) return '—';
    return `${String(dataObj.getDate()).padStart(2, '0')}/${String(dataObj.getMonth() + 1).padStart(2, '0')}/${dataObj.getFullYear()}`;
}

function escapeHtmlHome(texto) {
    return String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderizarKpisHome(abertos) {
    const n = abertos.length;
    let pecas = 0;
    let recebido = 0;
    let receber = 0;
    let total = 0;
    abertos.forEach((p) => {
        pecas += Number(p.totalPecas || 0);
        const fin = p.financeiro || {};
        recebido += Number(fin.valorEntrada || 0);
        receber += Number(fin.restante || 0);
        total += Number(fin.totalPedido || 0);
    });
    document.getElementById('kpiPedidosAbertos').textContent = String(n);
    document.getElementById('kpiPecasTotal').textContent = String(pecas);
    document.getElementById('kpiValorRecebido').textContent = Utils.formatarMoeda(recebido);
    document.getElementById('kpiValorReceber').textContent = Utils.formatarMoeda(receber);
    document.getElementById('kpiValorTotalPedidos').textContent = Utils.formatarMoeda(total);
}

function renderizarFilaHome(abertos) {
    const tbody = document.getElementById('homeFilaBody');
    if (!tbody) return;
    if (!abertos.length) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhum pedido em aberto.</td></tr>';
        return;
    }
    tbody.innerHTML = abertos.map((pedido) => {
        const link = `index.html?id=${encodeURIComponent(pedido.id || '')}`;
        const resumo = obterResumoProdutoPedidoHome(pedido);
        const tipoRes = resumirTipoPeca(resumo.tipoPeca, resumo.detalhePeca);
        const nome = escapeHtmlHome(pedido.cliente?.nome || '-');
        return `
            <tr>
                <td><a class="cliente-link" href="${link}" target="_blank" rel="noopener noreferrer">${nome}</a></td>
                <td>${formatarDataEntregaBR(pedido.datas?.entrega)}</td>
                <td>${pedido.totalPecas ?? 0}</td>
                <td>${escapeHtmlHome(tipoRes)}</td>
                <td>${escapeHtmlHome(resumo.tipoMalha || '—')}</td>
                <td>${escapeHtmlHome(resumo.corMalha || '—')}</td>
                <td>${escapeHtmlHome(resumo.estampaResumo || '—')}</td>
                <td>${escapeHtmlHome(textoDiasParaEntrega(pedido.datas?.entrega))}</td>
            </tr>
        `;
    }).join('');
}

async function carregarHome() {
    const tbody = document.getElementById('homeFilaBody');
    if (!tbody) return;

    if (window.location.protocol === 'file:') {
        tbody.innerHTML = '<tr><td colspan="8">Abra via servidor local (localhost) para carregar a fila.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="8">Atualizando...</td></tr>';
    try {
        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=listarPedidos&acao=listarPedidos`);
        const data = await res.json();
        if (!res.ok || data.sucesso === false) {
            const msg = data.erro || `Erro HTTP ${res.status}`;
            tbody.innerHTML = `<tr><td colspan="8">${escapeHtmlHome(msg)}</td></tr>`;
            renderizarKpisHome([]);
            return;
        }
        const todos = data.pedidos || [];
        const abertos = todos.filter(pedidoEstaAberto);
        abertos.sort((a, b) => {
            const da = parseDataEntregaLocal(a.datas?.entrega)?.getTime() ?? 0;
            const db = parseDataEntregaLocal(b.datas?.entrega)?.getTime() ?? 0;
            return da - db;
        });
        renderizarKpisHome(abertos);
        renderizarFilaHome(abertos);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="8">Falha ao carregar dados (rede ou resposta inválida).</td></tr>';
        renderizarKpisHome([]);
    }
}
