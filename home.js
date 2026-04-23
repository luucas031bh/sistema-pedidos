let homePodeRecarregarVisibilidade = false;

document.addEventListener('DOMContentLoaded', () => {
    atualizarRelogioHome();
    setInterval(atualizarRelogioHome, 1000);
    document.getElementById('btnAtualizarHome')?.addEventListener('click', carregarHome);
    document.getElementById('btnBuscarPedidoHome')?.addEventListener('click', executarBuscaPedidoHome);
    document.getElementById('inputBuscaIdBusca')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            executarBuscaPedidoHome();
        }
    });
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

/** Telefone completo → últimos 4 dígitos; senão texto para nome/ID. */
function termoBuscaHomeParaApi(valorBruto) {
    const t = String(valorBruto || '').trim();
    if (!t) return '';
    const soDigitos = t.replace(/\D/g, '');
    if (soDigitos.length >= 4) return soDigitos.slice(-4);
    return t;
}

function formatarDataHoraPedidoHome(val) {
    if (val == null || val === '') return '—';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function normalizarDigitosHome(v) {
    return String(v == null ? '' : v).replace(/\D/g, '');
}

function ultimos4Normalizados(strDigitos) {
    const d = normalizarDigitosHome(strDigitos);
    if (d.length >= 4) return d.slice(-4);
    return (`0000${d}`).slice(-4);
}

/** Match por últimos 4 dígitos: idBusca, telefone (número ou string), Utils.obterIdBusca, segmentos do ID. */
function pedidoMatchTermo4Digitos(p, soDigitos) {
    if (soDigitos.length !== 4) return false;
    const ib = ultimos4Normalizados(p.idBusca);
    if (ib === soDigitos) return true;

    const tel = normalizarDigitosHome(p.cliente && p.cliente.telefone);
    if (tel.length >= 4 && tel.slice(-4) === soDigitos) return true;

    if (typeof Utils !== 'undefined' && Utils.obterIdBusca) {
        const chave = Utils.obterIdBusca(String(p.cliente?.telefone != null ? p.cliente.telefone : ''));
        if (String(chave) === soDigitos) return true;
    }

    const idStr = String(p.id != null ? p.id : '');
    const partes = idStr.split(/[-_]/);
    let i;
    for (i = 0; i < partes.length; i++) {
        const seg = normalizarDigitosHome(partes[i]);
        if (seg.length >= 4 && seg.slice(-4) === soDigitos) return true;
        if (seg === soDigitos || partes[i] === soDigitos) return true;
    }
    return false;
}

function obterIdBuscaExibicaoPedido(p) {
    if (p.idBusca != null && String(p.idBusca).trim() !== '') return String(p.idBusca).trim();
    if (typeof Utils !== 'undefined' && Utils.obterIdBusca) {
        return Utils.obterIdBusca(String(p.cliente?.telefone || ''));
    }
    const t = normalizarDigitosHome(p.cliente?.telefone);
    return t.length >= 4 ? t.slice(-4) : '—';
}

const LIMITE_DIAS_ETAPA_FILA = {
    pedido_feito: 2,
    fechamento_arte: 4,
    insumos: 7,
    corte: 13,
    estampa: 17,
    costura: 24,
    embalo: 26
};

const IDS_ETAPA_PRODUCAO_FALLBACK = ['pedido_feito', 'fechamento_arte', 'insumos', 'corte', 'estampa', 'costura', 'embalo', 'aguardando_retirada'];

function idsEtapasProducaoValidasHome() {
    const fromConfig = (CONFIG.ETAPAS_PRODUCAO || []).map((e) => e.id).filter(Boolean);
    if (fromConfig.length) return fromConfig;
    return IDS_ETAPA_PRODUCAO_FALLBACK.slice();
}

function normalizarIdEtapaProducaoHome(valor) {
    const s = String(valor || '').trim().toLowerCase().replace(/\s+/g, '_');
    const valid = idsEtapasProducaoValidasHome();
    if (valid.includes(s)) return s;
    const mapa = {
        'pedido feito': 'pedido_feito',
        'fechamento de arte': 'fechamento_arte',
        'fechamento_arte': 'fechamento_arte',
        'aguardando retirada': 'aguardando_retirada',
        'aguardando_retirar': 'aguardando_retirada'
    };
    const m = mapa[s];
    return valid.includes(m) ? m : '';
}

function labelEtapaProducaoHome(id) {
    const nid = normalizarIdEtapaProducaoHome(id);
    const lista = CONFIG.ETAPAS_PRODUCAO || [];
    const found = lista.find((e) => e.id === nid);
    return found ? found.label : nid;
}

function diasCorridosDesdeDataPedidoHome(dataPedido) {
    const ref = parseDataEntregaLocal(dataPedido);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (!ref) return 0;
    ref.setHours(0, 0, 0, 0);
    return Math.floor((hoje.getTime() - ref.getTime()) / 86400000);
}

/** Ordem: etapa canônica do pedido; se vazia/ inválida, flags legados (planilha antiga). */
function resolverEtapaParaExibicao(pedido) {
    const topo = normalizarIdEtapaProducaoHome(pedido.etapaProducaoAtual);
    if (topo) return topo;
    const sp = pedido.statusProducao || {};
    if (sp.prontoParaEnvio) return 'aguardando_retirada';
    if (sp.costura) return 'costura';
    if (sp.estampa) return 'estampa';
    if (sp.corte) return 'corte';
    if (sp.os) return 'insumos';
    if (sp.arte) return 'fechamento_arte';
    return 'pedido_feito';
}

function classeCorEtapaProducaoFila(pedido) {
    const etapa = resolverEtapaParaExibicao(pedido);
    if (etapa === 'aguardando_retirada') {
        const ent = parseDataEntregaLocal(pedido.datas?.entrega);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        if (!ent) return 'home-etapa-badge--neutro';
        ent.setHours(0, 0, 0, 0);
        if (hoje.getTime() > ent.getTime()) return 'home-etapa-badge--amarelo';
        return 'home-etapa-badge--verde';
    }
    const lim = LIMITE_DIAS_ETAPA_FILA[etapa];
    if (lim == null) return 'home-etapa-badge--verde';
    const dias = diasCorridosDesdeDataPedidoHome(pedido.datas?.pedido);
    if (dias > lim) return 'home-etapa-badge--vermelho';
    return 'home-etapa-badge--verde';
}

function pedidoContaNosIndicadores(pedido) {
    const s = String(pedido?.statusOperacional || '').trim().toLowerCase();
    return s !== 'orçamento' && s !== 'orcamento';
}

/** Se o Apps Script implantado ainda não tiver buscarPedidos, filtra após listarPedidos. */
function filtrarPedidosPorTermoLocal(pedidos, termoApi) {
    const t = String(termoApi || '').trim();
    const soDigitos = t.replace(/\D/g, '');
    const lista = Array.isArray(pedidos) ? pedidos : [];
    if (soDigitos.length === 4) {
        return lista.filter((p) => pedidoMatchTermo4Digitos(p, soDigitos));
    }
    const termoLower = t.toLowerCase();
    const telFull = soDigitos;
    return lista.filter((p) => {
        const nome = String(p.cliente?.nome || '').toLowerCase();
        const tel = String(p.cliente?.telefone || '').replace(/\D/g, '');
        const id = String(p.id || '');
        if (termoLower.length > 0 && nome.indexOf(termoLower) !== -1) return true;
        if (telFull.length >= 10 && tel === telFull) return true;
        if (t && (id === t || id.indexOf(t) !== -1)) return true;
        return id.split(/[-_]/).some((seg) => seg && String(seg) === t);
    });
}

/** Sempre lista todos e filtra no cliente (match por idBusca e pelos últimos 4 dígitos do telefone). */
async function buscarPedidosComFallback(termo) {
    const res2 = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=listarPedidos&acao=listarPedidos`);
    const data2 = await res2.json();
    if (!res2.ok || data2.sucesso === false) {
        return { sucesso: false, erro: data2.erro || `Erro HTTP ${res2.status}` };
    }
    const todos = data2.pedidos || data2.fila || [];
    return { sucesso: true, pedidos: filtrarPedidosPorTermoLocal(todos, termo) };
}

function mostrarMsgBuscaHome(texto, tipo) {
    const el = document.getElementById('homeBuscaMensagem');
    if (!el) return;
    el.textContent = texto || '';
    el.classList.remove('hidden', 'home-busca-msg--erro', 'home-busca-msg--ok');
    if (!texto) {
        el.classList.add('hidden');
        return;
    }
    if (tipo === 'erro') el.classList.add('home-busca-msg--erro');
    else el.classList.add('home-busca-msg--ok');
}

async function executarBuscaPedidoHome() {
    const input = document.getElementById('inputBuscaIdBusca');
    const wrap = document.getElementById('homeBuscaResultados');
    if (!input || !wrap) return;

    const termo = termoBuscaHomeParaApi(input.value);
    if (!termo) {
        mostrarMsgBuscaHome('Informe os 4 últimos dígitos do telefone, nome ou ID do pedido.', 'erro');
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }

    if (window.location.protocol === 'file:') {
        mostrarMsgBuscaHome('Abra via servidor local (localhost) para buscar pedidos.', 'erro');
        return;
    }

    mostrarMsgBuscaHome('Buscando...', 'ok');
    wrap.classList.add('hidden');
    wrap.innerHTML = '';

    try {
        const data = await buscarPedidosComFallback(termo);
        if (!data.sucesso) {
            mostrarMsgBuscaHome(data.erro || 'Falha na busca.', 'erro');
            return;
        }
        const lista = data.pedidos || [];
        if (lista.length === 0) {
            mostrarMsgBuscaHome('Nenhum pedido encontrado para esse termo.', 'erro');
            return;
        }
        const msgLista =
            lista.length === 1
                ? '1 pedido encontrado. Clique em Abrir para abrir a página do pedido.'
                : `${lista.length} pedidos encontrados. Escolha qual abrir:`;
        mostrarMsgBuscaHome(msgLista, 'ok');
        wrap.classList.remove('hidden');
        wrap.innerHTML = `
            <div class="tabela-dinamica home-busca-tabela">
                <table>
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Data do pedido</th>
                            <th>ID Busca</th>
                            <th>ID pedido</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map((p) => {
                            const id = p.id || '';
                            const nome = escapeHtmlHome(p.cliente?.nome || '—');
                            const dp = formatarDataHoraPedidoHome(p.datas?.pedido || p.dataCriacao);
                            const idBuscaEx = escapeHtmlHome(obterIdBuscaExibicaoPedido(p));
                            const idEsc = encodeURIComponent(id);
                            return `
                                <tr>
                                    <td>${nome}</td>
                                    <td>${escapeHtmlHome(dp)}</td>
                                    <td>${idBuscaEx}</td>
                                    <td class="home-busca-id-cell">${escapeHtmlHome(String(id))}</td>
                                    <td><a class="btn btn-small btn-primary" href="index.html?id=${idEsc}">Abrir</a></td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (err) {
        console.error(err);
        mostrarMsgBuscaHome('Falha na busca (rede ou resposta inválida).', 'erro');
    }
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
        tbody.innerHTML = '<tr><td colspan="10">Nenhum pedido em aberto.</td></tr>';
        return;
    }
    tbody.innerHTML = abertos.map((pedido) => {
        const link = `index.html?id=${encodeURIComponent(pedido.id || '')}`;
        const resumo = obterResumoProdutoPedidoHome(pedido);
        const tipoRes = resumirTipoPeca(resumo.tipoPeca, resumo.detalhePeca);
        const nome = escapeHtmlHome(pedido.cliente?.nome || '-');
        const idBusca = escapeHtmlHome(obterIdBuscaExibicaoPedido(pedido));
        const etapaId = resolverEtapaParaExibicao(pedido);
        const etapaLabel = escapeHtmlHome(labelEtapaProducaoHome(etapaId));
        const etapaCls = classeCorEtapaProducaoFila({ ...pedido, etapaProducaoAtual: etapaId });
        return `
            <tr>
                <td><a class="cliente-link" href="${link}" target="_blank" rel="noopener noreferrer">${nome}</a></td>
                <td>${escapeHtmlHome(textoDiasParaEntrega(pedido.datas?.entrega))}</td>
                <td>${idBusca}</td>
                <td>${escapeHtmlHome(String(pedido.statusOperacional || '—'))}</td>
                <td>${pedido.totalPecas ?? 0}</td>
                <td>${escapeHtmlHome(tipoRes)}</td>
                <td>${escapeHtmlHome(resumo.tipoMalha || '—')}</td>
                <td>${escapeHtmlHome(resumo.corMalha || '—')}</td>
                <td>${escapeHtmlHome(resumo.estampaResumo || '—')}</td>
                <td><span class="home-etapa-badge ${etapaCls}">${etapaLabel}</span></td>
            </tr>
        `;
    }).join('');
}

async function carregarHome() {
    const tbody = document.getElementById('homeFilaBody');
    if (!tbody) return;

    if (window.location.protocol === 'file:') {
        tbody.innerHTML = '<tr><td colspan="10">Abra via servidor local (localhost) para carregar a fila.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="10">Atualizando...</td></tr>';
    try {
        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=listarPedidos&acao=listarPedidos&_ts=${Date.now()}`);
        const data = await res.json();
        if (!res.ok || data.sucesso === false) {
            const msg = data.erro || `Erro HTTP ${res.status}`;
            tbody.innerHTML = `<tr><td colspan="10">${escapeHtmlHome(msg)}</td></tr>`;
            renderizarKpisHome([]);
            return;
        }
        const todos = data.pedidos || [];
        const abertos = todos.filter(pedidoEstaAberto);
        const abertosParaKpi = abertos.filter(pedidoContaNosIndicadores);
        abertos.sort((a, b) => {
            const da = parseDataEntregaLocal(a.datas?.entrega)?.getTime() ?? 0;
            const db = parseDataEntregaLocal(b.datas?.entrega)?.getTime() ?? 0;
            return da - db;
        });
        renderizarKpisHome(abertosParaKpi);
        renderizarFilaHome(abertos);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="10">Falha ao carregar dados (rede ou resposta inválida).</td></tr>';
        renderizarKpisHome([]);
    }
}
