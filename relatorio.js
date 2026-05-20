/* global Chart, CONFIG, Utils */

(function () {
    const charts = {};
    const estado = {
        pedidosA: [],
        pedidosB: [],
        periodoA: null,
        periodoB: null,
        comparar: false,
        abaAtiva: 'financeiro'
    };

    const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const GOLD = 'rgba(212, 175, 55, 0.85)';
    const GOLD_DIM = 'rgba(212, 175, 55, 0.35)';
    const TEAL = 'rgba(56, 189, 248, 0.75)';
    const VERDE = 'rgba(74, 222, 128, 0.75)';
    const VERMELHO = 'rgba(248, 113, 113, 0.75)';

    function $(id) {
        return document.getElementById(id);
    }

    function isoLocal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function escapeHtml(t) {
        return String(t || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseDataRel(val) {
        if (val == null || val === '') return null;
        if (typeof val === 'string') {
            const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
                return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
            }
        }
        const d = val instanceof Date ? new Date(val.getTime()) : new Date(val);
        if (Number.isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatarDataBR(d) {
        if (!d) return '—';
        if (typeof d === 'string') return Utils.dataISOParaBR(d.split('T')[0]) || d;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    function segundaFeiraDaSemana(ref) {
        const d = new Date(ref);
        d.setHours(0, 0, 0, 0);
        const dia = d.getDay();
        const diff = dia === 0 ? -6 : 1 - dia;
        d.setDate(d.getDate() + diff);
        return d;
    }

    function pedidoEstaAberto(p) {
        const s = String(p?.statusOperacional || '').trim().toLowerCase();
        if (!s) return true;
        if (s === 'entregue' || s === 'finalizado' || s === 'cancelado') return false;
        return true;
    }

    function isOrcamento(p) {
        const tag = String(p?.tagPedido || '').trim().toLowerCase();
        const st = String(p?.statusOperacional || '').normalize('NFC').trim().toLowerCase();
        return tag === 'orçamento' || tag === 'orcamento' || st === 'orçamento' || st === 'orcamento';
    }

    function isCancelado(p) {
        return String(p?.statusOperacional || '').trim().toLowerCase() === 'cancelado';
    }

    function dataDoPedido(p, tipoData) {
        return tipoData === 'entrega'
            ? parseDataRel(p.datas?.entrega)
            : parseDataRel(p.datas?.pedido);
    }

    function lerFiltrosForm() {
        return {
            tipoData: $('relTipoData').value,
            nivel: $('relNivel').value,
            filtroStatus: $('relStatus').value.trim(),
            vendedor: $('relVendedor').value.trim(),
            tag: $('relTag').value.trim(),
            excluirCancelados: $('relExcluirCancelados').checked,
            excluirOrcamentos: $('relExcluirOrcamentos').checked,
            comparar: $('relComparar').checked,
            iniA: $('relIniA').value,
            fimA: $('relFimA').value,
            iniB: $('relIniB').value,
            fimB: $('relFimB').value
        };
    }

    function parseLimite(iso, fimDoDia) {
        if (!iso) return null;
        const p = iso.split('-');
        if (p.length !== 3) return null;
        const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        if (fimDoDia) d.setHours(23, 59, 59, 999);
        else d.setHours(0, 0, 0, 0);
        return d;
    }

    function pedidoPassaFiltros(p, f, di, df) {
        const dp = dataDoPedido(p, f.tipoData);
        if (!dp || dp < di || dp > df) return false;
        if (f.excluirCancelados && isCancelado(p)) return false;
        if (f.excluirOrcamentos && isOrcamento(p)) return false;
        if (f.filtroStatus) {
            const fo = f.filtroStatus.toLowerCase();
            const po = String(p.statusOperacional || '').trim().toLowerCase();
            if (po !== fo) return false;
        }
        if (f.vendedor && String(p.responsavelAtual || '').trim() !== f.vendedor) return false;
        if (f.tag && String(p.tagPedido || '').trim().toUpperCase() !== f.tag.toUpperCase()) return false;
        return true;
    }

    function filtrarPedidos(lista, f, ini, fim) {
        const di = parseLimite(ini, false);
        const df = parseLimite(fim, true);
        if (!di || !df) return [];
        return (lista || []).filter((p) => pedidoPassaFiltros(p, f, di, df));
    }

    function extrairResumoProduto(prod) {
        const estampas = Array.isArray(prod.estampas) ? prod.estampas : [];
        return {
            tipoPeca: prod.tipoPeca || '',
            tipoMalha: prod.tipoMalha || '',
            corMalha: prod.corMalha || '',
            detalhePeca: prod.detalhesPeca || prod.detalhePeca || '',
            estampaResumo: estampas.map((e) => e?.tipo).filter(Boolean).join(', ')
        };
    }

    function normChave(v) {
        const s = String(v == null ? '' : v).trim();
        return s || '(sem informação)';
    }

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
        return tipo || det || '(sem informação)';
    }

    function dimensaoChave(resumo, pedido, dimensao) {
        const d = String(dimensao || 'tipoMalha').toLowerCase();
        switch (d) {
            case 'tipopeca':
            case 'tipo_peca':
                return normChave(resumirTipoPeca(resumo.tipoPeca, resumo.detalhePeca));
            case 'tipomalha':
            case 'tipo_malha':
                return normChave(resumo.tipoMalha);
            case 'cormalha':
            case 'cor_malha':
                return normChave(resumo.corMalha);
            case 'estampa':
            case 'tipo_estampa':
                return normChave(resumo.estampaResumo);
            case 'detalhepeca':
            case 'detalhe_peca':
                return normChave(resumo.detalhePeca);
            case 'statusoperacional':
            case 'status':
                return normChave(pedido.statusOperacional);
            default:
                return normChave(resumo.tipoMalha);
        }
    }

    function totalPecasProduto(prod) {
        const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
        return tams.reduce((s, t) => s + (Number(t.quantidade) || 0), 0);
    }

    function agregarPorDimensao(pedidos, dimensao, nivel) {
        const map = {};
        function add(chave, pedidoId, valorFrac, pecas) {
            if (!map[chave]) map[chave] = { valor: 0, pecas: 0, _ids: {} };
            map[chave].valor += valorFrac;
            map[chave].pecas += pecas;
            if (pedidoId != null && String(pedidoId) !== '') map[chave]._ids[String(pedidoId)] = true;
        }

        pedidos.forEach((pedido) => {
            const valorPedido = Number(pedido.financeiro?.totalPedido) || 0;
            const totalPecasPedido = Number(pedido.totalPecas) || 0;

            if (nivel === 'pedido') {
                const rp = pedido.resumoProduto || {};
                add(dimensaoChave(rp, pedido, dimensao), pedido.id, valorPedido, totalPecasPedido);
                return;
            }

            const prods = Array.isArray(pedido.produtos) ? pedido.produtos : [];
            if (!prods.length) {
                const rp = pedido.resumoProduto || {};
                add(dimensaoChave(rp, pedido, dimensao), pedido.id, valorPedido, totalPecasPedido);
                return;
            }

            const pecasPorProd = prods.map(totalPecasProduto);
            const sumPecas = pecasPorProd.reduce((a, b) => a + b, 0);
            prods.forEach((prod, idx) => {
                const res = extrairResumoProduto(prod);
                const pecasI = pecasPorProd[idx];
                const share = sumPecas > 0 ? pecasI / sumPecas : 1 / prods.length;
                add(dimensaoChave(res, pedido, dimensao), pedido.id, valorPedido * share, pecasI);
            });
        });

        return Object.keys(map)
            .map((chave) => {
                const g = map[chave];
                const pedidosN = Object.keys(g._ids).length;
                return {
                    chave,
                    valor: Math.round(g.valor * 100) / 100,
                    pecas: Math.round(g.pecas * 100) / 100,
                    pedidos: pedidosN,
                    ticketMedio: pedidosN > 0 ? Math.round((g.valor / pedidosN) * 100) / 100 : 0
                };
            })
            .sort((a, b) => b.valor - a.valor);
    }

    function calcularTotaisFinanceiros(pedidos) {
        let valor = 0;
        let recebido = 0;
        let restante = 0;
        let pecas = 0;
        const ids = {};
        pedidos.forEach((p) => {
            const fin = p.financeiro || {};
            valor += Number(fin.totalPedido) || 0;
            recebido += Number(fin.valorEntrada) || 0;
            restante += Number(fin.restante) || 0;
            pecas += Number(p.totalPecas) || 0;
            if (p.id != null) ids[String(p.id)] = true;
        });
        const n = Object.keys(ids).length;
        return {
            valor: Math.round(valor * 100) / 100,
            recebido: Math.round(recebido * 100) / 100,
            restante: Math.round(restante * 100) / 100,
            pecas: Math.round(pecas * 100) / 100,
            pedidos: n,
            ticketMedio: n > 0 ? Math.round((valor / n) * 100) / 100 : 0
        };
    }

    function agregarPorStatus(pedidos) {
        const map = {};
        pedidos.forEach((p) => {
            const ch = normChave(p.statusOperacional);
            if (!map[ch]) map[ch] = 0;
            map[ch] += Number(p.financeiro?.totalPedido) || 0;
        });
        return Object.entries(map)
            .map(([chave, valor]) => ({ chave, valor: Math.round(valor * 100) / 100 }))
            .sort((a, b) => b.valor - a.valor);
    }

    function agregarPorEtapa(pedidos) {
        const map = {};
        pedidos.forEach((p) => {
            const ch = normChave(p.etapaProducaoAtual || 'Pedido em Aberto');
            if (!map[ch]) map[ch] = 0;
            map[ch] += 1;
        });
        return Object.entries(map)
            .map(([chave, qtd]) => ({ chave, qtd }))
            .sort((a, b) => b.qtd - a.qtd);
    }

    function agregarEntregasPorDiaSemana(pedidos) {
        const map = [0, 0, 0, 0, 0, 0, 0];
        pedidos.forEach((p) => {
            const d = parseDataRel(p.datas?.entrega);
            if (!d) return;
            map[d.getDay()] += 1;
        });
        return DIAS_SEMANA.map((nome, i) => ({ chave: nome, qtd: map[i] }));
    }

    function calcularOperacional(pedidos) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        let abertos = 0;
        let atrasados = 0;
        let aguardandoRetirada = 0;
        pedidos.forEach((p) => {
            if (pedidoEstaAberto(p)) abertos += 1;
            const etapa = String(p.etapaProducaoAtual || '').toLowerCase();
            if (etapa.indexOf('aguardando retir') === 0) aguardandoRetirada += 1;
            const ent = parseDataRel(p.datas?.entrega);
            if (ent && pedidoEstaAberto(p) && ent.getTime() < hoje.getTime()) atrasados += 1;
        });
        return { abertos, atrasados, aguardandoRetirada, total: pedidos.length };
    }

    function variacaoPct(atual, anterior) {
        if (!anterior || anterior === 0) {
            if (!atual) return { texto: '—', cls: 'rel-kpi-var--neutro' };
            return { texto: '+100%', cls: 'rel-kpi-var--up' };
        }
        const pct = ((atual - anterior) / anterior) * 100;
        const sinal = pct > 0 ? '+' : '';
        const cls = pct > 0 ? 'rel-kpi-var--up' : pct < 0 ? 'rel-kpi-var--down' : 'rel-kpi-var--neutro';
        return { texto: `${sinal}${Math.round(pct * 10) / 10}%`, cls };
    }

    function destroyChart(id) {
        const c = charts[id];
        if (c) {
            c.destroy();
            delete charts[id];
        }
        const el = $(id);
        if (el && typeof Chart !== 'undefined') {
            const prev = Chart.getChart(el);
            if (prev) prev.destroy();
        }
    }

    function criarChartBarra(id, labels, datasets, titulo, horizontal) {
        destroyChart(id);
        const canvas = $(id);
        if (!canvas || typeof Chart === 'undefined') return;
        charts[id] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets },
            options: {
                indexAxis: horizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#d4d4d8' } },
                    title: { display: !!titulo, text: titulo || '', color: '#fafafa', font: { size: 13 } },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const v = ctx.raw;
                                if (typeof v === 'number' && v > 999) return `${ctx.dataset.label}: ${Utils.formatarMoeda(v)}`;
                                return `${ctx.dataset.label}: ${v}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                    y: {
                        ticks: {
                            color: '#e4e4e7',
                            callback(val) {
                                const s = this.getLabelForValue(val);
                                return s.length > 28 ? `${s.slice(0, 26)}…` : s;
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    }

    function criarChartRosca(id, labels, valores, cores) {
        destroyChart(id);
        const canvas = $(id);
        if (!canvas || typeof Chart === 'undefined') return;
        charts[id] = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data: valores, backgroundColor: cores, borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#d4d4d8' } },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                return `${ctx.label}: ${Utils.formatarMoeda(ctx.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function htmlKpiMini(valor, label, variacao) {
        const varHtml = variacao
            ? `<div class="rel-kpi-var ${variacao.cls}">${escapeHtml(variacao.texto)} vs período B</div>`
            : '';
        return `<div class="rel-kpi-mini">
            <div class="rel-kpi-mini-val">${escapeHtml(valor)}</div>
            <div class="rel-kpi-mini-lbl">${escapeHtml(label)}</div>
            ${varHtml}
        </div>`;
    }

    function renderizarKpisFinanceiro(totais, totaisB) {
        const el = $('relKpiFinanceiro');
        if (!el) return;
        const cmp = totaisB ? (k) => variacaoPct(totais[k], totaisB[k]) : () => null;
        el.innerHTML = [
            htmlKpiMini(Utils.formatarMoeda(totais.valor), 'Faturamento', cmp('valor')),
            htmlKpiMini(Utils.formatarMoeda(totais.recebido), 'Recebido', cmp('recebido')),
            htmlKpiMini(Utils.formatarMoeda(totais.restante), 'A receber', cmp('restante')),
            htmlKpiMini(Utils.formatarMoeda(totais.ticketMedio), 'Ticket médio', cmp('ticketMedio')),
            htmlKpiMini(String(totais.pedidos), 'Pedidos', cmp('pedidos')),
            htmlKpiMini(String(totais.pecas), 'Peças', cmp('pecas'))
        ].join('');
    }

    function renderizarKpisProducao(totais) {
        const el = $('relKpiProducao');
        if (!el) return;
        const media = totais.pedidos > 0 ? Math.round((totais.pecas / totais.pedidos) * 10) / 10 : 0;
        el.innerHTML = [
            htmlKpiMini(String(totais.pecas), 'Total de peças'),
            htmlKpiMini(String(totais.pedidos), 'Pedidos'),
            htmlKpiMini(String(media), 'Média peças / pedido'),
            htmlKpiMini(Utils.formatarMoeda(totais.valor), 'Faturamento no período')
        ].join('');
    }

    function renderizarKpisOperacional(op, totais) {
        const el = $('relKpiOperacional');
        if (!el) return;
        el.innerHTML = [
            htmlKpiMini(String(totais.pedidos), 'Pedidos no filtro'),
            htmlKpiMini(String(op.abertos), 'Ainda em aberto'),
            htmlKpiMini(String(op.atrasados), 'Atrasados'),
            htmlKpiMini(String(op.aguardandoRetirada), 'Aguardando retirada')
        ].join('');
    }

    function renderizarKpisComparativo(tA, tB) {
        const el = $('relKpiComparativo');
        if (!el) return;
        el.innerHTML = [
            htmlKpiMini(Utils.formatarMoeda(tA.valor), 'Fat. período A', variacaoPct(tA.valor, tB.valor)),
            htmlKpiMini(Utils.formatarMoeda(tB.valor), 'Fat. período B'),
            htmlKpiMini(String(tA.pecas), 'Peças A', variacaoPct(tA.pecas, tB.pecas)),
            htmlKpiMini(String(tB.pecas), 'Peças B'),
            htmlKpiMini(String(tA.pedidos), 'Pedidos A', variacaoPct(tA.pedidos, tB.pedidos)),
            htmlKpiMini(String(tB.pedidos), 'Pedidos B')
        ].join('');
    }

    function htmlTabelaGenerica(cols, rows) {
        const th = cols.map((c) => `<th${c.right ? ' class="text-right"' : ''}>${escapeHtml(c.label)}</th>`).join('');
        const body = rows.length
            ? rows.map((r) => `<tr>${r.map((c, i) => `<td${cols[i].right ? ' class="text-right"' : ''}>${c.html != null ? c.html : escapeHtml(String(c.text ?? ''))}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${cols.length}">Nenhum dado.</td></tr>`;
        return `<table class="tabela-dinamica"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
    }

    function renderizarFinanceiro() {
        const pedidos = estado.pedidosA;
        const totais = calcularTotaisFinanceiros(pedidos);
        const totaisB = estado.comparar ? calcularTotaisFinanceiros(estado.pedidosB) : null;

        renderizarKpisFinanceiro(totais, totaisB);

        criarChartRosca(
            'relChartFinanceiroCaixa',
            ['Recebido', 'A receber'],
            [totais.recebido, totais.restante],
            [VERDE, VERMELHO]
        );

        const porStatus = agregarPorStatus(pedidos).slice(0, 10);
        criarChartBarra(
            'relChartFinanceiroStatus',
            porStatus.map((g) => g.chave),
            [{ label: 'Valor (R$)', data: porStatus.map((g) => g.valor), backgroundColor: GOLD_DIM, borderColor: GOLD, borderWidth: 1 }],
            '',
            true
        );

        const rows = pedidos.map((p) => {
            const fin = p.financeiro || {};
            return [
                { text: p.cliente?.nome || '—' },
                { text: formatarDataBR(p.datas?.pedido) },
                { text: formatarDataBR(p.datas?.entrega) },
                { text: p.statusOperacional || '—' },
                { text: p.totalPecas ?? 0, right: true },
                { text: Utils.formatarMoeda(fin.totalPedido), right: true },
                { text: Utils.formatarMoeda(fin.valorEntrada), right: true },
                { text: Utils.formatarMoeda(fin.restante), right: true },
                { text: p.responsavelAtual || '—' }
            ];
        });
        $('relTabelaFinanceiro').innerHTML = htmlTabelaGenerica(
            [
                { label: 'Cliente' },
                { label: 'Data pedido' },
                { label: 'Entrega' },
                { label: 'Status' },
                { label: 'Peças', right: true },
                { label: 'Total', right: true },
                { label: 'Entrada', right: true },
                { label: 'Restante', right: true },
                { label: 'Vendedor' }
            ],
            rows
        );
    }

    function renderizarProducao() {
        const pedidos = estado.pedidosA;
        const nivel = $('relNivel').value;
        const dim = $('relDimensaoProducao').value;
        const totais = calcularTotaisFinanceiros(pedidos);
        const grupos = agregarPorDimensao(pedidos, dim, nivel);

        renderizarKpisProducao(totais);

        const top = grupos.slice(0, 14);
        criarChartBarra(
            'relChartProducao',
            top.map((g) => g.chave),
            [{ label: 'Peças', data: top.map((g) => g.pecas), backgroundColor: GOLD_DIM, borderColor: GOLD, borderWidth: 1 }],
            '',
            true
        );

        const rows = grupos.map((g) => [
            { text: g.chave },
            { text: g.pecas, right: true },
            { text: g.pedidos, right: true },
            { text: Utils.formatarMoeda(g.valor), right: true },
            { text: Utils.formatarMoeda(g.ticketMedio), right: true }
        ]);
        $('relTabelaProducao').innerHTML = htmlTabelaGenerica(
            [
                { label: 'Grupo' },
                { label: 'Peças', right: true },
                { label: 'Pedidos', right: true },
                { label: 'Valor (R$)', right: true },
                { label: 'Ticket médio', right: true }
            ],
            rows
        );
    }

    function renderizarOperacional() {
        const pedidos = estado.pedidosA;
        const totais = calcularTotaisFinanceiros(pedidos);
        const op = calcularOperacional(pedidos);
        renderizarKpisOperacional(op, totais);

        const etapas = agregarPorEtapa(pedidos).slice(0, 12);
        criarChartBarra(
            'relChartOperacionalEtapa',
            etapas.map((e) => e.chave),
            [{ label: 'Pedidos', data: etapas.map((e) => e.qtd), backgroundColor: TEAL }],
            '',
            true
        );

        const dias = agregarEntregasPorDiaSemana(pedidos);
        criarChartBarra(
            'relChartOperacionalDiaSemana',
            dias.map((d) => d.chave),
            [{ label: 'Entregas', data: dias.map((d) => d.qtd), backgroundColor: GOLD }],
            '',
            false
        );

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const rows = pedidos.map((p) => {
            const ent = parseDataRel(p.datas?.entrega);
            let diasHtml = '—';
            if (ent) {
                const diff = Math.round((ent.getTime() - hoje.getTime()) / 86400000);
                if (diff < 0) diasHtml = `<span class="rel-badge-atraso">Atrasado ${Math.abs(diff)}d</span>`;
                else if (diff === 0) diasHtml = '<span class="rel-badge-ok">Hoje</span>';
                else diasHtml = `${diff}d`;
            }
            return [
                { text: p.cliente?.nome || '—' },
                { text: formatarDataBR(p.datas?.entrega) },
                { html: diasHtml },
                { text: p.statusOperacional || '—' },
                { text: p.etapaProducaoAtual || '—' },
                { text: p.totalPecas ?? 0, right: true },
                { text: p.tagPedido || '—' }
            ];
        });
        $('relTabelaOperacional').innerHTML = htmlTabelaGenerica(
            [
                { label: 'Cliente' },
                { label: 'Entrega' },
                { label: 'Prazo' },
                { label: 'Status OP' },
                { label: 'Etapa PROD.' },
                { label: 'Peças', right: true },
                { label: 'Tag' }
            ],
            rows
        );
    }

    function metricaGrupo(g, metric) {
        if (metric === 'pecas') return g.pecas;
        if (metric === 'pedidos') return g.pedidos;
        if (metric === 'recebido') return g.recebido || 0;
        return g.valor;
    }

    function agregarComRecebido(pedidos, dimensao, nivel) {
        const grupos = agregarPorDimensao(pedidos, dimensao, nivel);
        const mapRec = {};
        pedidos.forEach((p) => {
            const valorEntrada = Number(p.financeiro?.valorEntrada) || 0;
            const prods = Array.isArray(p.produtos) ? p.produtos : [];
            if (nivel === 'pedido' || !prods.length) {
                const rp = p.resumoProduto || {};
                const ch = dimensaoChave(rp, p, dimensao);
                mapRec[ch] = (mapRec[ch] || 0) + valorEntrada;
                return;
            }
            const pecasPorProd = prods.map(totalPecasProduto);
            const sumPecas = pecasPorProd.reduce((a, b) => a + b, 0);
            prods.forEach((prod, idx) => {
                const res = extrairResumoProduto(prod);
                const ch = dimensaoChave(res, p, dimensao);
                const share = sumPecas > 0 ? pecasPorProd[idx] / sumPecas : 1 / prods.length;
                mapRec[ch] = (mapRec[ch] || 0) + valorEntrada * share;
            });
        });
        return grupos.map((g) => ({
            ...g,
            recebido: Math.round((mapRec[g.chave] || 0) * 100) / 100
        }));
    }

    function mergeComparativo(gruposA, gruposB, metric, maxN) {
        const map = {};
        function ingest(lista, key) {
            (lista || []).forEach((g) => {
                if (!map[g.chave]) map[g.chave] = { a: 0, b: 0 };
                map[g.chave][key] = metricaGrupo(g, metric);
            });
        }
        ingest(gruposA, 'a');
        ingest(gruposB, 'b');
        return Object.keys(map)
            .map((chave) => ({ chave, sum: map[chave].a + map[chave].b, ...map[chave] }))
            .sort((x, y) => y.sum - x.sum)
            .slice(0, maxN);
    }

    function renderizarComparativo() {
        const aviso = $('relComparativoAviso');
        if (!estado.comparar || !estado.pedidosB.length && estado.pedidosA.length) {
            if (aviso) {
                aviso.textContent = estado.comparar
                    ? 'Período B sem pedidos ou não configurado. Ajuste as datas comparativas nos filtros.'
                    : 'Ative «Comparar 2º período» nos filtros globais para ver a variação entre A e B.';
                aviso.classList.remove('hidden');
            }
        } else if (aviso) {
            aviso.classList.add('hidden');
        }

        const tA = calcularTotaisFinanceiros(estado.pedidosA);
        const tB = calcularTotaisFinanceiros(estado.pedidosB);
        renderizarKpisComparativo(tA, tB);

        const metric = $('relMetricaComparativo').value;
        const dim = $('relDimensaoComparativo').value;
        const nivel = $('relNivel').value;
        const gA = metric === 'recebido'
            ? agregarComRecebido(estado.pedidosA, dim, nivel)
            : agregarPorDimensao(estado.pedidosA, dim, nivel);
        const gB = metric === 'recebido'
            ? agregarComRecebido(estado.pedidosB, dim, nivel)
            : agregarPorDimensao(estado.pedidosB, dim, nivel);

        const merged = mergeComparativo(gA, gB, metric, 12);
        const labelA = estado.periodoA ? `${estado.periodoA.ini} → ${estado.periodoA.fim}` : 'Período A';
        const labelB = estado.periodoB ? `${estado.periodoB.ini} → ${estado.periodoB.fim}` : 'Período B';

        criarChartBarra(
            'relChartComparativo',
            merged.map((m) => m.chave),
            [
                { label: labelA, data: merged.map((m) => m.a), backgroundColor: GOLD },
                { label: labelB, data: merged.map((m) => m.b), backgroundColor: TEAL }
            ],
            '',
            true
        );

        const rows = merged.map((m) => [
            { text: m.chave },
            { text: metric === 'valor' || metric === 'recebido' ? Utils.formatarMoeda(m.a) : m.a, right: true },
            { text: metric === 'valor' || metric === 'recebido' ? Utils.formatarMoeda(m.b) : m.b, right: true },
            { html: `<span class="${variacaoPct(m.a, m.b).cls}">${escapeHtml(variacaoPct(m.a, m.b).texto)}</span>`, right: true }
        ]);
        $('relTabelaComparativo').innerHTML = htmlTabelaGenerica(
            [
                { label: 'Grupo' },
                { label: 'Período A', right: true },
                { label: 'Período B', right: true },
                { label: 'Variação', right: true }
            ],
            rows
        );
    }

    function renderizarAbaAtiva() {
        switch (estado.abaAtiva) {
            case 'producao':
                renderizarProducao();
                break;
            case 'operacional':
                renderizarOperacional();
                break;
            case 'comparativo':
                renderizarComparativo();
                break;
            default:
                renderizarFinanceiro();
        }
    }

    function exportarCsv(nome, cols, rows) {
        const header = cols.map((c) => c.label).join(';');
        const linhas = rows.map((r) =>
            r.map((c) => {
                const t = c.text != null ? String(c.text) : (c.html || '').replace(/<[^>]+>/g, '');
                return `"${t.replace(/"/g, '""')}"`;
            }).join(';')
        );
        const blob = new Blob(['\ufeff' + [header, ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nome;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function exportFinanceiro() {
        const pedidos = estado.pedidosA;
        const rows = pedidos.map((p) => {
            const fin = p.financeiro || {};
            return [
                { text: p.cliente?.nome },
                { text: formatarDataBR(p.datas?.pedido) },
                { text: formatarDataBR(p.datas?.entrega) },
                { text: p.statusOperacional },
                { text: p.totalPecas },
                { text: fin.totalPedido },
                { text: fin.valorEntrada },
                { text: fin.restante },
                { text: p.responsavelAtual }
            ];
        });
        exportarCsv('relatorio-financeiro.csv', [
            { label: 'Cliente' }, { label: 'Data pedido' }, { label: 'Entrega' },
            { label: 'Status' }, { label: 'Peças' }, { label: 'Total' },
            { label: 'Entrada' }, { label: 'Restante' }, { label: 'Vendedor' }
        ], rows);
    }

    function exportProducao() {
        const dim = $('relDimensaoProducao').value;
        const grupos = agregarPorDimensao(estado.pedidosA, dim, $('relNivel').value);
        const rows = grupos.map((g) => [
            { text: g.chave }, { text: g.pecas }, { text: g.pedidos },
            { text: g.valor }, { text: g.ticketMedio }
        ]);
        exportarCsv('relatorio-producao.csv', [
            { label: 'Grupo' }, { label: 'Peças' }, { label: 'Pedidos' },
            { label: 'Valor' }, { label: 'Ticket medio' }
        ], rows);
    }

    function exportOperacional() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const rows = estado.pedidosA.map((p) => {
            const ent = parseDataRel(p.datas?.entrega);
            let prazo = '';
            if (ent) {
                const diff = Math.round((ent.getTime() - hoje.getTime()) / 86400000);
                prazo = diff < 0 ? `Atrasado ${Math.abs(diff)}d` : diff === 0 ? 'Hoje' : `${diff}d`;
            }
            return [
                { text: p.cliente?.nome }, { text: formatarDataBR(p.datas?.entrega) },
                { text: prazo }, { text: p.statusOperacional }, { text: p.etapaProducaoAtual },
                { text: p.totalPecas }, { text: p.tagPedido }
            ];
        });
        exportarCsv('relatorio-operacional.csv', [
            { label: 'Cliente' }, { label: 'Entrega' }, { label: 'Prazo' },
            { label: 'Status OP' }, { label: 'Etapa' }, { label: 'Peças' }, { label: 'Tag' }
        ], rows);
    }

    async function buscarTodosPedidos() {
        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=listarPedidos&acao=listarPedidos&_ts=${Date.now()}`);
        const data = await res.json();
        if (!res.ok || data.sucesso === false) {
            throw new Error(data.erro || `Erro HTTP ${res.status}`);
        }
        return data.pedidos || data.fila || [];
    }

    function mostrarErro(msg) {
        const el = $('relErro');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }

    function atualizarInfoPeriodo(f) {
        const el = $('relInfoPeriodo');
        if (!el) return;
        const tipo = f.tipoData === 'entrega' ? 'data de entrega' : 'data do pedido';
        let txt = `Período A (${tipo}): ${f.iniA} a ${f.fimA} — ${estado.pedidosA.length} pedido(s).`;
        if (f.comparar && f.iniB && f.fimB) {
            txt += ` Período B: ${f.iniB} a ${f.fimB} — ${estado.pedidosB.length} pedido(s).`;
        }
        el.textContent = txt;
        el.classList.remove('hidden');
    }

    async function gerar() {
        mostrarErro('');
        const f = lerFiltrosForm();
        if (!f.iniA || !f.fimA) {
            mostrarErro('Informe data inicial e final do período principal.');
            return;
        }
        if (f.comparar && (!f.iniB || !f.fimB)) {
            mostrarErro('Para comparar, preencha também o período B.');
            return;
        }

        const btn = $('relBtnGerar');
        btn.disabled = true;

        try {
            if (window.location.protocol === 'file:') {
                throw new Error('Abra via servidor local ou hospedagem (não use file://).');
            }
            if (!CONFIG?.APPS_SCRIPT_URL) throw new Error('CONFIG.APPS_SCRIPT_URL não definido.');

            const todos = await buscarTodosPedidos();
            estado.pedidosA = filtrarPedidos(todos, f, f.iniA, f.fimA);
            estado.pedidosB = f.comparar ? filtrarPedidos(todos, f, f.iniB, f.fimB) : [];
            estado.comparar = f.comparar;
            estado.periodoA = { ini: f.iniA, fim: f.fimA };
            estado.periodoB = f.comparar ? { ini: f.iniB, fim: f.fimB } : null;

            $('relCardResultado').classList.remove('hidden');
            atualizarInfoPeriodo(f);
            renderizarAbaAtiva();
        } catch (e) {
            console.error(e);
            mostrarErro(e.message || String(e));
            $('relCardResultado').classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    }

    function aplicarPreset(tipo, alvo) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        let ini;
        let fim = new Date(hoje);

        if (tipo === '7d') {
            ini = new Date(hoje);
            ini.setDate(hoje.getDate() - 6);
        } else if (tipo === 'mes') {
            ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        } else if (tipo === 'mesAnt') {
            ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        } else if (tipo === 'semana') {
            ini = segundaFeiraDaSemana(hoje);
            fim = new Date(ini);
            fim.setDate(fim.getDate() + 6);
        } else {
            return;
        }

        const prefix = alvo === 'B' ? 'relIniB' : 'relIniA';
        const prefixF = alvo === 'B' ? 'relFimB' : 'relFimA';
        $(prefix).value = isoLocal(ini);
        $(prefixF).value = isoLocal(fim);
    }

    function aplicarPeriodoAnterior() {
        const iniA = $('relIniA').value;
        const fimA = $('relFimA').value;
        if (!iniA || !fimA) return;
        const di = parseLimite(iniA, false);
        const df = parseLimite(fimA, false);
        if (!di || !df) return;
        const dias = Math.round((df.getTime() - di.getTime()) / 86400000) + 1;
        const fimB = new Date(di);
        fimB.setDate(fimB.getDate() - 1);
        const iniB = new Date(fimB);
        iniB.setDate(iniB.getDate() - (dias - 1));
        $('relIniB').value = isoLocal(iniB);
        $('relFimB').value = isoLocal(fimB);
        $('relComparar').checked = true;
        $('relBlocoPeriodoB').classList.remove('hidden');
    }

    function preencherSelects() {
        const selStatus = $('relStatus');
        if (selStatus && CONFIG?.STATUS_PEDIDO) {
            CONFIG.STATUS_PEDIDO.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                selStatus.appendChild(opt);
            });
            ['Entregue', 'Finalizado'].forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                selStatus.appendChild(opt);
            });
        }
    }

    async function preencherVendedores() {
        const sel = $('relVendedor');
        if (!sel || window.location.protocol === 'file:') return;
        try {
            const todos = await buscarTodosPedidos();
            const set = new Set();
            todos.forEach((p) => {
                const v = String(p.responsavelAtual || '').trim();
                if (v) set.add(v);
            });
            [...set].sort().forEach((v) => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                sel.appendChild(opt);
            });
        } catch {
            /* silencioso */
        }
    }

    function trocarAba(tab) {
        estado.abaAtiva = tab;
        document.querySelectorAll('.rel-tab').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
        });
        document.querySelectorAll('.rel-tab-panel').forEach((p) => {
            p.classList.toggle('is-active', p.id === `relPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
        });
        if ($('relCardResultado') && !$('relCardResultado').classList.contains('hidden')) {
            renderizarAbaAtiva();
        }
    }

    function atualizarRelogio() {
        const el = $('relogioRelatorio');
        if (el && Utils.dataHoraCompleta) el.textContent = Utils.dataHoraCompleta();
    }

    document.addEventListener('DOMContentLoaded', () => {
        preencherSelects();
        aplicarPreset('mes', 'A');
        preencherVendedores();
        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);

        $('relComparar').addEventListener('change', () => {
            $('relBlocoPeriodoB').classList.toggle('hidden', !$('relComparar').checked);
        });

        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => aplicarPreset(btn.getAttribute('data-preset'), 'A'));
        });
        document.querySelectorAll('[data-preset-b]').forEach((btn) => {
            btn.addEventListener('click', () => aplicarPreset(btn.getAttribute('data-preset-b'), 'B'));
        });
        $('relBtnPeriodoAnterior')?.addEventListener('click', aplicarPeriodoAnterior);
        $('relBtnGerar').addEventListener('click', gerar);

        document.querySelectorAll('.rel-tab').forEach((btn) => {
            btn.addEventListener('click', () => trocarAba(btn.getAttribute('data-tab')));
        });

        $('relDimensaoProducao')?.addEventListener('change', () => {
            if (estado.abaAtiva === 'producao' && !$('relCardResultado').classList.contains('hidden')) {
                renderizarProducao();
            }
        });
        $('relMetricaComparativo')?.addEventListener('change', () => {
            if (estado.abaAtiva === 'comparativo') renderizarComparativo();
        });
        $('relDimensaoComparativo')?.addEventListener('change', () => {
            if (estado.abaAtiva === 'comparativo') renderizarComparativo();
        });

        $('relExportFinanceiro')?.addEventListener('click', exportFinanceiro);
        $('relExportProducao')?.addEventListener('click', exportProducao);
        $('relExportOperacional')?.addEventListener('click', exportOperacional);
    });
})();
