/**
 * Impressão OS (Ordem de serviço) e GP (Guia de pedido).
 * Imagens opcionais apenas em memória — não persistem.
 */
(function () {
    const PRINT_IMAGE_TIMEOUT_MS = 4000;

    function getPlaceholderImagem() {
        return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="100%" height="100%" fill="#d1d5db"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#374151" font-size="42" font-family="Arial">Imagem indisponivel</text></svg>')}`;
    }

    function garantirOverlayImpressao() {
        let overlay = document.getElementById('printLoadingOverlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'printLoadingOverlay';
        overlay.className = 'print-loading-overlay hidden';
        overlay.innerHTML = `
            <div class="print-loading-card">
                <div class="print-loading-spinner"></div>
                <p id="printLoadingMensagem">Preparando documento para impressão...</p>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function mostrarOverlayImpressao(msg) {
        const overlay = garantirOverlayImpressao();
        const texto = overlay.querySelector('#printLoadingMensagem');
        if (texto) texto.textContent = msg || 'Preparando documento para impressão...';
        overlay.classList.remove('hidden');
    }

    function esconderOverlayImpressao() {
        document.getElementById('printLoadingOverlay')?.classList.add('hidden');
    }

    /** Alinha URLs do Drive ao preview (thumbnail); blob/data inalterados. */
    function resolverSrcImpressao(url) {
        if (!url) return '';
        const s = String(url);
        if (/^blob:/i.test(s) || /^data:/i.test(s)) return s;
        if (typeof normalizarUrlDriveParaImg === 'function') {
            return normalizarUrlDriveParaImg(s) || s;
        }
        return s;
    }

    function preloadImageWithTimeout(src, timeoutMs = PRINT_IMAGE_TIMEOUT_MS) {
        return new Promise((resolve) => {
            if (!src) {
                resolve({ ok: false, reason: 'empty' });
                return;
            }
            const img = new Image();
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                resolve({ ok: false, reason: 'timeout' });
            }, timeoutMs);

            const finish = (ok, reason) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve({ ok, reason });
            };

            img.onload = () => finish(true, 'loaded');
            img.onerror = () => finish(false, 'error');
            img.decoding = 'async';
            img.src = src;
        });
    }

    async function prepararImagensParaImpressao(mountEl, onProgress) {
        const imgs = Array.from(mountEl.querySelectorAll('img'));
        if (!imgs.length) return;
        let concluidas = 0;
        const total = imgs.length;
        if (typeof onProgress === 'function') onProgress(concluidas, total);
        const resultados = await Promise.allSettled(imgs.map(async (img) => {
            const resultado = await preloadImageWithTimeout(img.src, PRINT_IMAGE_TIMEOUT_MS);
            concluidas += 1;
            if (typeof onProgress === 'function') onProgress(concluidas, total);
            return resultado;
        }));
        resultados.forEach((resultado, idx) => {
            const ok = resultado.status === 'fulfilled' && resultado.value && resultado.value.ok;
            if (!ok) imgs[idx].src = getPlaceholderImagem();
        });
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function idCurtoPedido(dados) {
        const ib = String(dados.idBusca || '').replace(/\D/g, '');
        if (ib.length >= 4) return ib.slice(-4);
        const id = String(dados.id || '');
        const partes = id.split(/[-_]/);
        const ult = partes[partes.length - 1];
        if (ult && /^\d+$/.test(ult)) return ult;
        return id.slice(0, 12) || '—';
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
        return tipo || det || '—';
    }

    function tamanhosComQuantidade(prod) {
        const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
        return tams.filter((t) => t && (Number(t.quantidade) || 0) > 0);
    }

    function pecasDoProduto(prod) {
        return tamanhosComQuantidade(prod).reduce((s, t) => s + (Number(t.quantidade) || 0), 0);
    }

    function estampasValidas(prod) {
        const arr = Array.isArray(prod.estampas) ? prod.estampas : [];
        return arr.filter((e) => e && (e.tipo || e.localidade));
    }

    function textoGrade(prod) {
        const partes = tamanhosComQuantidade(prod).map((t) => `${t.tamanho} ${Number(t.quantidade) || 0}`);
        return partes.length ? partes.join(' · ') : '—';
    }

    function htmlEstampasCurtas(prod) {
        const lista = estampasValidas(prod);
        if (!lista.length) return '—';
        return lista
            .map((e) => {
                const partes = [e.tipo, e.localidade, e.quantidadeCores].filter(Boolean);
                return escapeHtml(partes.join(' · '));
            })
            .join('<br>');
    }

    function calcularTotalPecasGp(produtos) {
        let n = 0;
        (produtos || []).forEach((prod) => {
            const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
            tams.forEach((t) => {
                n += Number(t.quantidade) || 0;
            });
        });
        return n;
    }

    function listaEstampasProduto(prod) {
        const lista = estampasValidas(prod);
        if (!lista.length) return '—';
        return lista
            .map((e) => [e.tipo, e.localidade, e.quantidadeCores].filter(Boolean).join(' · '))
            .join('; ');
    }

    function montarGaleriaArtesHtml(artesSrc) {
        const lista = Array.isArray(artesSrc) ? artesSrc.filter(Boolean) : [];
        if (!lista.length) return '';
        const thumbs = lista.map((src, idx) => `
            <div class="gp-arte-item">
                <img src="${src}" alt="Arte ${idx + 1}" class="gp-arte-img" loading="lazy" decoding="async">
            </div>
        `).join('');
        return `<section class="gp-artes"><h2 class="gp-sec-titulo gp-sec-titulo--sub">Artes / Estampas</h2><div class="gp-artes-grid">${thumbs}</div></section>`;
    }

    function montarHtmlGp(dados, mockupSrcsPorProduto, artesSrc) {
        const emp = (typeof CONFIG !== 'undefined' && CONFIG.EMPRESA) ? CONFIG.EMPRESA : {};
        const nomeEmp = emp.nome || 'ADONAY CONFECÇÃO';
        const tel = emp.telefone1 || '';
        const end = emp.endereco || '';
        const idC = idCurtoPedido(dados);
        const fin = dados.financeiro || {};
        const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
        const totalLinhas = produtos.reduce((soma, prod) => {
            return soma + pecasDoProduto(prod) * (Number(prod.precoUnitario) || 0);
        }, 0);
        const total = Number(fin.totalPedido) || totalLinhas;
        const entrada = Number(fin.valorEntrada) || 0;
        const restanteInformado = Number(fin.restante);
        const restante = Number(fin.totalPedido) > 0 && Number.isFinite(restanteInformado)
            ? restanteInformado
            : total - entrada;
        const totalPecasCalc = calcularTotalPecasGp(produtos);
        const totalPecas =
            totalPecasCalc > 0 ? totalPecasCalc : Number(dados.totalPecas) || 0;
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const obsHtml = obs.trim() ? escapeHtml(obs) : '—';
        const mockupsArr = Array.isArray(mockupSrcsPorProduto) ? mockupSrcsPorProduto : [];

        const faixaMock = produtos
            .map((prod, idx) => {
                const tituloProd = prod.nomeProduto || `Produto ${idx + 1}`;
                const src = mockupsArr[idx] || '';
                if (!src) return '';
                return `<figure class="gp-faixa-item"><img src="${src}" alt="Mockup" class="gp-faixa-img"><figcaption>${escapeHtml(tituloProd)}</figcaption></figure>`;
            })
            .filter(Boolean)
            .join('');

        const blocos = produtos.map((prod, idx) => {
            const tituloProd = prod.nomeProduto || `Produto ${idx + 1}`;
            const qtd = pecasDoProduto(prod);
            const pu = Number(prod.precoUnitario) || 0;
            const peca = prod.detalhesPeca || prod.tipoPeca || '—';
            return `<article class="gp-item">
                <header><strong>${escapeHtml(tituloProd)}</strong><b>${Utils.formatarMoeda(qtd * pu)}</b></header>
                <p>${escapeHtml(peca)} · ${escapeHtml(prod.corMalha || '—')} · ${escapeHtml(malhaCurta(prod.tipoMalha))}</p>
                <p>${escapeHtml(textoGrade(prod))} · ${qtd} peças · ${Utils.formatarMoeda(pu)} un.</p>
                <p class="gp-item-est">${htmlEstampasCurtas(prod)}</p>
            </article>`;
        }).join('');

        return `
<div class="gp-doc gp-doc--limpa">
    <header class="gp-topo">
        <div>
            <strong>${escapeHtml(nomeEmp)}</strong>
            <span>${escapeHtml(tel)} · ${escapeHtml(end)}</span>
        </div>
        <div class="gp-id">ID ${escapeHtml(idC)}</div>
    </header>
    <section class="gp-cliente">
        <div><small>Cliente</small><strong>${escapeHtml(cli.nome || '—')}</strong><span>${escapeHtml(cli.telefone || '')}</span></div>
        <div><small>Entrega</small><strong>${formatarDataBR(dados.datas?.entrega)}</strong><span>Pedido ${formatarDataBR(dados.datas?.pedido)}</span></div>
    </section>
    ${obs.trim() ? `<p class="gp-obs">${obsHtml}</p>` : ''}
    ${blocos || '<p>Nenhum produto informado.</p>'}
    ${faixaMock ? `<section class="gp-faixa"><div class="gp-faixa-lista">${faixaMock}</div></section>` : ''}
    ${montarGaleriaArtesHtml(artesSrc)}
    <div class="gp-rodape-valores">
        <div class="gp-resumo-financeiro">
            <h2 class="gp-sec-titulo gp-sec-titulo--sub">Resumo financeiro</h2>
            <dl class="gp-resumo-lista">
                <div class="gp-resumo-linha"><dt>Total de peças</dt><dd>${totalPecas}</dd></div>
                <div class="gp-resumo-linha"><dt>Valor total do pedido</dt><dd>${Utils.formatarMoeda(total)}</dd></div>
                <div class="gp-resumo-linha"><dt>Valor da entrada</dt><dd>${entrada > 0 ? Utils.formatarMoeda(entrada) : '—'}</dd></div>
                <div class="gp-resumo-linha"><dt>Valor restante</dt><dd>${Utils.formatarMoeda(restante)}</dd></div>
            </dl>
        </div>
        <div class="gp-assinatura">
            <p class="gp-assinatura-texto">Declaro ter lido e estar de acordo com o descrito nesta guia.</p>
            <div class="gp-linha-assinatura"></div>
            <p class="gp-assinatura-rotulo">Assinatura do cliente</p>
        </div>
    </div>
    <div class="gp-rodape">GP — Guia de Pedido</div>
</div>`;
    }

    function malhaCurta(tipo) {
        const s = String(tipo || '').trim();
        if (!s) return '—';
        const i = s.indexOf('(');
        return (i > 0 ? s.slice(0, i) : s).trim();
    }

    function tecnicaCurta(tipo) {
        const s = String(tipo || '').toLowerCase();
        if (s.includes('silk')) return 'Silk';
        if (s.includes('dtf')) return 'DTF';
        if (s.includes('bordado')) return 'Bordado';
        if (s.includes('full') || s.includes('total')) return 'Full print';
        if (s.includes('sublim')) return 'Sublimação';
        return String(tipo || 'Estampa').trim();
    }

    function zonaEstampa(localidade) {
        const s = String(localidade || '').toLowerCase();
        if (s.includes('full') || (s.includes('total') && !s.includes('barra'))) return 'total';
        if (s.includes('manga') && s.includes('esquer')) return 'manga-e';
        if (s.includes('manga')) return 'manga-d';
        if (s.includes('ombro') && s.includes('esquer')) return 'ombro-e';
        if (s.includes('ombro')) return 'ombro-d';
        if (s.includes('pesco')) return 'pescoco';
        if (s.includes('costas')) {
            if (s.includes('barra')) {
                if (s.includes('direit')) return 'barra-d';
                if (s.includes('esquer')) return 'barra-e';
                return 'barra';
            }
            return 'corpo';
        }
        if (s.includes('barra')) {
            if (s.includes('direit')) return 'barra-d';
            if (s.includes('esquer')) return 'barra-e';
            return 'barra';
        }
        if (s.includes('peito') && s.includes('direit')) return 'peito-d';
        if (s.includes('peito')) return 'peito-e';
        if (s.includes('frente') || s.includes('a4') || s.includes('a3')) return 'corpo';
        return 'corpo';
    }

    function svgPeca(lado, marcas) {
        const frente = lado === 'frente';
        const pontos = frente
            ? { 'peito-e': [36, 46], 'peito-d': [64, 46], corpo: [50, 58], 'ombro-e': [24, 30], 'ombro-d': [76, 30], barra: [50, 96], 'barra-e': [36, 96], 'barra-d': [64, 96], 'manga-e': [10, 40], 'manga-d': [90, 40] }
            : { corpo: [50, 50], pescoco: [50, 24], barra: [50, 96], 'barra-e': [36, 96], 'barra-d': [64, 96], 'manga-e': [10, 40], 'manga-d': [90, 40] };
        const bolhas = marcas
            .filter((m) => m.zona !== 'total' && pontos[m.zona])
            .map((m) => {
                const [x, y] = pontos[m.zona];
                return `<circle cx="${x}" cy="${y}" r="5.2" fill="#111"/><text x="${x}" y="${y + 1.6}" text-anchor="middle" font-size="6" fill="#fff" font-family="Arial">${m.n}</text>`;
            })
            .join('');
        const total = marcas.some((m) => m.zona === 'total');
        return `<svg class="os-silhueta" viewBox="0 0 100 118" aria-hidden="true">
            <path d="M32 16 L18 28 L6 42 L16 50 L26 40 V108 H74 V40 L84 50 L94 42 L82 28 L68 16 Q50 26 32 16 Z" fill="${total ? '#e5e5e5' : '#fff'}" stroke="#111" stroke-width="1.6"/>
            ${bolhas}
        </svg>`;
    }

    function mapaEstampas(lista) {
        const marcas = lista.map((e, i) => ({ n: i + 1, zona: zonaEstampa(e.localidade), frente: !/costas|pesco/.test(String(e.localidade || '').toLowerCase()) }));
        const frente = marcas.filter((m) => m.frente || m.zona === 'total');
        const costas = marcas.filter((m) => !m.frente || m.zona === 'total');
        return `<div class="os-mapas">
            <figure>${svgPeca('frente', frente)}<figcaption>Frente</figcaption></figure>
            <figure>${svgPeca('costas', costas)}<figcaption>Costas</figcaption></figure>
        </div>`;
    }

    function montarHtmlOs(dados, mockupSrcsPorProduto, artesSrc) {
        const idC = idCurtoPedido(dados);
        const cli = dados.cliente || {};
        const obs = String(dados.observacoes || '').trim();
        const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
        const mockupsArr = Array.isArray(mockupSrcsPorProduto) ? mockupSrcsPorProduto : [];
        const artes = Array.isArray(artesSrc) ? artesSrc.filter(Boolean) : [];
        const varios = produtos.length > 1;
        const entrega = formatarDataBR(dados.datas?.entrega);

        const fichas = produtos
            .map((prod, idx) => {
                const n = idx + 1;
                const tituloProd = prod.nomeProduto || `Produto ${n}`;
                const qtd = pecasDoProduto(prod);
                const tams = tamanhosComQuantidade(prod);
                const grade = tams.length
                    ? `<table class="os-grade"><thead><tr>${tams.map((t) => `<th>${escapeHtml(t.tamanho || '—')}</th>`).join('')}</tr></thead><tbody><tr>${tams.map((t) => `<td>${Number(t.quantidade) || 0}</td>`).join('')}</tr></tbody></table>`
                    : '';
                const lista = estampasValidas(prod);
                const locais = lista.length
                    ? `<ol class="os-locais">${lista.map((e, i) => `<li><b>${i + 1}</b><em>${escapeHtml(tecnicaCurta(e.tipo))}</em><span>${escapeHtml(e.localidade || '—')}</span>${e.quantidadeCores ? `<strong>${escapeHtml(e.quantidadeCores)}</strong>` : ''}</li>`).join('')}</ol>`
                    : '';
                const mockSrc = mockupsArr[idx] || '';
                const visual = mockSrc
                    ? `<img src="${mockSrc}" alt="" class="os-prova">`
                    : mapaEstampas(lista);
                const artesHtml = idx === 0 && artes.length
                    ? `<div class="os-artes">${artes.slice(0, 4).map((src) => `<img src="${src}" alt="">`).join('')}</div>`
                    : '';
                const quebra = varios ? ' os-folha--nova' : '';
                return `<article class="os-folha${quebra}">
                    <header class="os-barra">
                        <div><small>OS</small><strong>${escapeHtml(idC)}</strong></div>
                        <div class="os-entrega"><small>Entrega</small><strong>${escapeHtml(entrega)}</strong></div>
                        <div class="os-pecas"><small>Peças</small><strong>${qtd}</strong></div>
                    </header>
                    <p class="os-quem">${escapeHtml(cli.nome || '—')}${varios ? ` · ${n}/${produtos.length}` : ''}</p>
                    <h1>${escapeHtml(tituloProd)}</h1>
                    ${obs ? `<p class="os-nota">${escapeHtml(obs)}</p>` : ''}
                    <div class="os-miolo">
                        <div>
                            <p class="os-cor">${escapeHtml(prod.corMalha || '—')}</p>
                            <p class="os-malha">${escapeHtml(malhaCurta(prod.tipoMalha))}</p>
                            <p class="os-peca">${escapeHtml(prod.detalhesPeca || prod.tipoPeca || '—')}</p>
                            ${grade}
                        </div>
                        <div class="os-visual">${visual}</div>
                    </div>
                    ${locais}
                    ${artesHtml}
                </article>`;
            })
            .join('');

        return `<div class="os-doc os-doc--visual">${fichas}</div>`;
    }

    function obterDadosImpressao() {
        if (typeof coletarDadosFormulario !== 'function') return null;
        return coletarDadosFormulario();
    }

    function prepararMockupsProdutosParaImpressao(dados) {
        const srcs = [];
        const revokes = [];
        const prods = Array.isArray(dados.produtos) ? dados.produtos : [];
        prods.forEach((prod) => {
            const pid = prod.numero;
            const inp = pid != null ? document.getElementById(`inputMockup-${pid}`) : null;
            if (inp && inp.files && inp.files[0]) {
                const file = inp.files[0];
                if (file.type === 'image/png' || file.type === 'image/jpeg') {
                    const url = URL.createObjectURL(file);
                    srcs.push(url);
                    revokes.push(url);
                    return;
                }
            }
            const uDrive = prod.urlMockup ? String(prod.urlMockup).trim() : '';
            if (uDrive) {
                srcs.push(resolverSrcImpressao(uDrive));
                return;
            }
            if (pid != null) {
                const wrap = document.getElementById(`previewMockup-${pid}`);
                const img = document.getElementById(`imgPreviewMockup-${pid}`);
                if (wrap && !wrap.classList.contains('hidden') && img) {
                    const u = img.currentSrc || img.src;
                    if (u) {
                        srcs.push(u);
                        return;
                    }
                }
            }
            srcs.push('');
        });
        return { srcs, revokes };
    }

    function prepararArtesParaImpressao() {
        const src = [];
        const revokes = [];
        const itens = document.querySelectorAll('#containerArtes .arte-upload-item');
        itens.forEach((item) => {
            const inputArte = item.querySelector('.arte-input');
            if (inputArte && inputArte.files && inputArte.files[0]) {
                const file = inputArte.files[0];
                if (file.type === 'image/png' || file.type === 'image/jpeg') {
                    const localUrl = URL.createObjectURL(file);
                    src.push(localUrl);
                    revokes.push(localUrl);
                    return;
                }
            }
            const urlExistente = item.dataset?.urlDrive || '';
            if (urlExistente) {
                src.push(resolverSrcImpressao(urlExistente));
                return;
            }
            const thumb = item.querySelector('.arte-thumb');
            const uThumb = thumb && (thumb.currentSrc || thumb.src);
            if (uThumb) src.push(resolverSrcImpressao(uThumb));
        });

        if (!src.length) {
            const driveList = (typeof estadoApp !== 'undefined' && estadoApp.imagens && Array.isArray(estadoApp.imagens.artesUrlDrive))
                ? estadoApp.imagens.artesUrlDrive
                : [];
            driveList.forEach((u) => {
                if (u) src.push(resolverSrcImpressao(u));
            });
        }
        return { src, revokes };
    }

    async function executarImpressao(tipo) {
        const dados = obterDadosImpressao();
        if (!dados || !dados.cliente) {
            if (typeof Utils !== 'undefined' && Utils.mostrarNotificacao) {
                Utils.mostrarNotificacao('Carregue um pedido antes de imprimir.', 'error');
            }
            return;
        }

        const mount = document.getElementById(tipo === 'os' ? 'printOsMount' : 'printGpMount');
        if (!mount) return;

        mostrarOverlayImpressao('Preparando documento para impressão...');
        const mockData = prepararMockupsProdutosParaImpressao(dados);
        const artes = prepararArtesParaImpressao();
        const cls = tipo === 'os' ? 'imprimindo-doc-os' : 'imprimindo-doc-gp';

        try {
            mount.innerHTML = tipo === 'os'
                ? montarHtmlOs(dados, mockData.srcs, artes.src)
                : montarHtmlGp(dados, mockData.srcs, artes.src);
            document.body.classList.add(cls);
            await prepararImagensParaImpressao(mount, (concluidas, total) => {
                const msg = total > 0
                    ? `Preparando documento para impressão... (${concluidas}/${total})`
                    : 'Preparando documento para impressão...';
                mostrarOverlayImpressao(msg);
            });

            const cleanup = () => {
                document.body.classList.remove(cls);
                mount.innerHTML = '';
                mockData.revokes.forEach((url) => URL.revokeObjectURL(url));
                artes.revokes.forEach((url) => URL.revokeObjectURL(url));
                esconderOverlayImpressao();
                window.removeEventListener('afterprint', cleanup);
            };
            window.addEventListener('afterprint', cleanup);
            window.print();
        } catch (err) {
            console.error('Erro ao preparar impressão', err);
            esconderOverlayImpressao();
            if (typeof Utils !== 'undefined' && Utils.mostrarNotificacao) {
                Utils.mostrarNotificacao('Não foi possível preparar a impressão.', 'error');
            }
        }
    }

    window.imprimirOrdemServico = function () {
        executarImpressao('os');
    };
    window.imprimirGuiaPedido = function () {
        executarImpressao('gp');
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btnImprimirOs')?.addEventListener('click', () => executarImpressao('os'));
        document.getElementById('btnImprimirGp')?.addEventListener('click', () => executarImpressao('gp'));
    });
})();
