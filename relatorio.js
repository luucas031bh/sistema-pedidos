/* global Chart, CONFIG, Utils */

(function () {
    let chartInst = null;

    function $(id) {
        return document.getElementById(id);
    }

    function relatorioIsoLocal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function relatorioMetricaGrupo(g, metric) {
        switch (metric) {
            case 'pecas':
                return Number(g.pecas) || 0;
            case 'pedidos':
                return Number(g.pedidos) || 0;
            case 'ticketMedio':
                return Number(g.ticketMedio) || 0;
            default:
                return Number(g.valor) || 0;
        }
    }

    function relatorioLabelMetrica(metric) {
        switch (metric) {
            case 'pecas':
                return 'Peças';
            case 'pedidos':
                return 'Pedidos';
            case 'ticketMedio':
                return 'Ticket médio (R$)';
            default:
                return 'Valor (R$)';
        }
    }

    function relatorioFormatCelula(metric, val) {
        if (metric === 'valor' || metric === 'ticketMedio') {
            return Utils.formatarMoeda(val);
        }
        if (metric === 'pecas' || metric === 'pedidos') {
            return String(Math.round(val * 100) / 100);
        }
        return String(val);
    }

    function montarUrlRelatorio(payload) {
        const base = CONFIG.APPS_SCRIPT_URL;
        const u = new URL(base);
        u.searchParams.set('action', 'relatorioPedidos');
        u.searchParams.set('dataInicio', payload.dataInicio);
        u.searchParams.set('dataFim', payload.dataFim);
        u.searchParams.set('dimensao', payload.dimensao);
        u.searchParams.set('nivel', payload.nivel);
        if (payload.filtroStatus) u.searchParams.set('filtroStatus', payload.filtroStatus);
        u.searchParams.set('excluirCancelados', payload.excluirCancelados ? 'true' : 'false');
        return u.toString();
    }

    async function buscarRelatorio(payload) {
        const url = montarUrlRelatorio(payload);
        const res = await fetch(url);
        const texto = await res.text();
        let data;
        try {
            data = JSON.parse(texto);
        } catch {
            throw new Error('Resposta inválida do servidor.');
        }
        return data;
    }

    function construirPayloadDoForm() {
        return {
            dimensao: $('relDimensao').value,
            nivel: $('relNivel').value,
            filtroStatus: $('relStatus').value.trim(),
            excluirCancelados: $('relExcluirCancelados').checked
        };
    }

    function mergeTopLabels(gruposA, gruposB, metric, maxN) {
        const map = {};
        function ingest(grupos, key) {
            (grupos || []).forEach((g) => {
                if (!map[g.chave]) map[g.chave] = { a: 0, b: 0 };
                map[g.chave][key] = relatorioMetricaGrupo(g, metric);
            });
        }
        ingest(gruposA, 'a');
        ingest(gruposB, 'b');
        const rows = Object.keys(map).map((chave) => {
            const v = map[chave];
            return { chave, sum: v.a + v.b, a: v.a, b: v.b };
        });
        rows.sort((x, y) => y.sum - x.sum);
        return rows.slice(0, maxN);
    }

    function ordenarGrupos(grupos, metric) {
        return [...(grupos || [])].sort(
            (x, y) => relatorioMetricaGrupo(y, metric) - relatorioMetricaGrupo(x, metric)
        );
    }

    function renderizarGrafico(resA, resB, metric, comparar) {
        const canvas = $('relChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const prev = Chart.getChart(canvas);
        if (prev) prev.destroy();

        const gold = 'rgba(212, 175, 55, 0.85)';
        const goldDim = 'rgba(212, 175, 55, 0.35)';
        const teal = 'rgba(56, 189, 248, 0.75)';

        let labels;
        let datasets;

        if (comparar && resB && resB.sucesso) {
            const merged = mergeTopLabels(resA.grupos, resB.grupos, metric, 14);
            labels = merged.map((r) => r.chave);
            datasets = [
                {
                    label: `${resA.periodo.inicio} → ${resA.periodo.fim}`,
                    data: merged.map((r) => r.a),
                    backgroundColor: gold
                },
                {
                    label: `${resB.periodo.inicio} → ${resB.periodo.fim}`,
                    data: merged.map((r) => r.b),
                    backgroundColor: teal
                }
            ];
        } else {
            const ord = ordenarGrupos(resA.grupos, metric).slice(0, 16);
            labels = ord.map((g) => g.chave);
            datasets = [
                {
                    label: relatorioLabelMetrica(metric),
                    data: ord.map((g) => relatorioMetricaGrupo(g, metric)),
                    backgroundColor: goldDim,
                    borderColor: gold,
                    borderWidth: 1
                }
            ];
        }

        const metricLabel = relatorioLabelMetrica(metric);
        chartInst = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#d4d4d8', font: { size: 12 } }
                    },
                    title: {
                        display: true,
                        text: metricLabel,
                        color: '#fafafa',
                        font: { size: 14, weight: '600' }
                    },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const v = ctx.raw;
                                if (metric === 'valor' || metric === 'ticketMedio') {
                                    return `${ctx.dataset.label}: ${Utils.formatarMoeda(v)}`;
                                }
                                return `${ctx.dataset.label}: ${v}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#a1a1aa' },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    y: {
                        ticks: {
                            color: '#e4e4e7',
                            callback(val, idx) {
                                const s = this.getLabelForValue(val);
                                return s.length > 36 ? `${s.slice(0, 34)}…` : s;
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    }

    function htmlTabela(grupos, metric, titulo) {
        const rows = ordenarGrupos(grupos, metric)
            .map(
                (g) =>
                    `<tr>
                        <td>${escapeHtml(String(g.chave))}</td>
                        <td class="text-right">${escapeHtml(relatorioFormatCelula('valor', g.valor))}</td>
                        <td class="text-right">${escapeHtml(relatorioFormatCelula('pecas', g.pecas))}</td>
                        <td class="text-right">${escapeHtml(relatorioFormatCelula('pedidos', g.pedidos))}</td>
                        <td class="text-right">${escapeHtml(relatorioFormatCelula('ticketMedio', g.ticketMedio))}</td>
                    </tr>`
            )
            .join('');
        return `
            <h3 class="card-subtitle mt-2">${escapeHtml(titulo)}</h3>
            <div class="relatorio-tabela-scroll">
                <table class="tabela-dinamica">
                    <thead>
                        <tr>
                            <th>Grupo</th>
                            <th class="text-right">Valor</th>
                            <th class="text-right">Peças</th>
                            <th class="text-right">Pedidos</th>
                            <th class="text-right">Ticket médio</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5">Nenhum dado.</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    function escapeHtml(t) {
        return String(t || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatarResumoTotais(totais) {
        if (!totais) return '';
        return `
            <span><strong>Pedidos:</strong> ${totais.pedidos}</span>
            &nbsp;·&nbsp;
            <span><strong>Peças:</strong> ${totais.pecas}</span>
            &nbsp;·&nbsp;
            <span><strong>Valor total:</strong> ${Utils.formatarMoeda(totais.valor)}</span>`;
    }

    function mostrarErro(msg) {
        const el = $('relErro');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }

    async function gerar() {
        mostrarErro('');
        const base = construirPayloadDoForm();
        const iniA = $('relIniA').value;
        const fimA = $('relFimA').value;
        if (!iniA || !fimA) {
            mostrarErro('Informe data inicial e final do período principal.');
            return;
        }

        const comparar = $('relComparar').checked;
        const iniB = $('relIniB').value;
        const fimB = $('relFimB').value;
        if (comparar && (!iniB || !fimB)) {
            mostrarErro('Para comparar, preencha também o segundo período.');
            return;
        }

        const metric = $('relMetrica').value;
        const btn = $('relBtnGerar');
        btn.disabled = true;

        try {
            if (window.location.protocol === 'file:') {
                throw new Error('Abra esta página via servidor local ou hospedagem (não use file://).');
            }
            if (!CONFIG || !CONFIG.APPS_SCRIPT_URL) {
                throw new Error('CONFIG.APPS_SCRIPT_URL não definido.');
            }

            const payA = {
                ...base,
                dataInicio: iniA,
                dataFim: fimA
            };
            const resA = await buscarRelatorio(payA);
            if (!resA.sucesso) throw new Error(resA.erro || 'Falha no período principal.');

            let resB = null;
            if (comparar) {
                const payB = { ...base, dataInicio: iniB, dataFim: fimB };
                resB = await buscarRelatorio(payB);
                if (!resB.sucesso) throw new Error(resB.erro || 'Falha no período comparativo.');
            }

            $('relCardResultado').classList.remove('hidden');
            $('relResumoTotais').innerHTML =
                `<div><strong>Período A:</strong> ${formatarResumoTotais(resA.totais)}</div>` +
                (resB && resB.sucesso
                    ? `<div class="mt-1"><strong>Período B:</strong> ${formatarResumoTotais(resB.totais)}</div>`
                    : '');

            $('relTabelas').innerHTML =
                htmlTabela(
                    resA.grupos,
                    metric,
                    `Detalhe — ${resA.periodo.inicio} a ${resA.periodo.fim}`
                ) +
                (resB && resB.sucesso
                    ? htmlTabela(
                          resB.grupos,
                          metric,
                          `Detalhe — ${resB.periodo.inicio} a ${resB.periodo.fim}`
                      )
                    : '');

            renderizarGrafico(resA, resB, metric, !!(comparar && resB && resB.sucesso));
        } catch (e) {
            console.error(e);
            mostrarErro(e.message || String(e));
            $('relCardResultado').classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    }

    function aplicarPreset(tipo) {
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
        } else {
            return;
        }

        $('relIniA').value = relatorioIsoLocal(ini);
        $('relFimA').value = relatorioIsoLocal(fim);
    }

    function preencherStatus() {
        const sel = $('relStatus');
        if (!sel || !CONFIG || !Array.isArray(CONFIG.STATUS_PEDIDO)) return;
        CONFIG.STATUS_PEDIDO.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            sel.appendChild(opt);
        });
        const ex = document.createElement('option');
        ex.value = 'Entregue';
        ex.textContent = 'Entregue';
        sel.appendChild(ex);
    }

    function atualizarRelogio() {
        const el = $('relogioRelatorio');
        if (el && Utils.dataHoraCompleta) el.textContent = Utils.dataHoraCompleta();
    }

    document.addEventListener('DOMContentLoaded', () => {
        preencherStatus();
        aplicarPreset('mes');
        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);

        $('relComparar').addEventListener('change', () => {
            $('relBlocoPeriodoB').classList.toggle('hidden', !$('relComparar').checked);
        });

        document.querySelectorAll('.relatorio-presets button[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => aplicarPreset(btn.getAttribute('data-preset')));
        });

        $('relBtnGerar').addEventListener('click', gerar);
    });
})();
