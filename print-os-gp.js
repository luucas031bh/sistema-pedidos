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

    async function prepararImagensParaImpressao(mountEl) {
        const imgs = Array.from(mountEl.querySelectorAll('img'));
        if (!imgs.length) return;
        const resultados = await Promise.allSettled(
            imgs.map((img) => preloadImageWithTimeout(img.src, PRINT_IMAGE_TIMEOUT_MS))
        );
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

    function montarLinhasGpUmProduto(prod) {
        const linhas = [];
        const pu = Number(prod.precoUnitario) || 0;
        const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
        const tipo = resumirTipoPeca(prod.tipoPeca, prod.detalhesPeca);
        const desc = [prod.tipoMalha, prod.corMalha].filter(Boolean).join(' — ') || '—';
        if (tams.length === 0) {
            linhas.push({ q: 0, tam: '—', tipo, desc, un: pu, tot: 0 });
            return linhas;
        }
        tams.forEach((t) => {
            const q = Number(t.quantidade) || 0;
            linhas.push({
                q,
                tam: t.tamanho || '—',
                tipo,
                desc,
                un: pu,
                tot: q * pu
            });
        });
        return linhas;
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

    function linhasGpParaHtmlTabela(linhas) {
        return linhas
            .map(
                (ln) => `
            <tr>
                <td class="gp-num">${ln.q}</td>
                <td>${escapeHtml(ln.tam)}</td>
                <td>${escapeHtml(ln.tipo)}</td>
                <td class="gp-desc">${escapeHtml(ln.desc)}</td>
                <td class="gp-moeda">${Utils.formatarMoeda(ln.un)}</td>
                <td class="gp-moeda">${Utils.formatarMoeda(ln.tot)}</td>
            </tr>`
            )
            .join('');
    }

    function listaEstampasProduto(prod) {
        const arr = Array.isArray(prod.estampas) ? prod.estampas : [];
        return arr
            .filter((e) => e && (e.tipo || e.localidade))
            .map((e) => [e.tipo, e.localidade].filter(Boolean).join(' — '))
            .join('; ') || '—';
    }

    function montarGaleriaArtesHtml(artesSrc) {
        const lista = Array.isArray(artesSrc) ? artesSrc.filter(Boolean) : [];
        if (!lista.length) return '';
        const thumbs = lista.map((src, idx) => `
            <div class="gp-arte-item">
                <img src="${src}" alt="Arte ${idx + 1}" class="gp-arte-img" loading="eager" decoding="async">
            </div>
        `).join('');
        return `<section class="gp-artes"><h2 class="gp-sec-titulo gp-sec-titulo--sub">Artes / Estampas</h2><div class="gp-artes-grid">${thumbs}</div></section>`;
    }

    function montarBlocoMockupGp(mockSrc, nomeProduto, idx) {
        const titulo = escapeHtml(nomeProduto || `Produto ${idx + 1}`);
        if (!mockSrc) {
            return `<div class="gp-mockup gp-mockup--prod gp-mockup--vazio"><div class="gp-mockup-leg">${titulo}</div><p>(Sem mockup)</p></div>`;
        }
        return `<div class="gp-mockup gp-mockup--prod"><div class="gp-mockup-leg">${titulo}</div><img src="${mockSrc}" alt="Mockup" class="gp-mockup-img" loading="eager" decoding="async"></div>`;
    }

    function montarBlocoMockupOs(mockSrc, nomeProduto, idx) {
        const titulo = escapeHtml(nomeProduto || `Modelo ${idx + 1}`);
        if (!mockSrc) return '';
        return `<div class="os-mockup os-mockup--prod"><div class="os-mockup-leg">${titulo}</div><img src="${mockSrc}" alt="Mockup" class="os-mockup-img" loading="eager" decoding="async"></div>`;
    }

    function montarHtmlGp(dados, mockupSrcsPorProduto, artesSrc) {
        const emp = (typeof CONFIG !== 'undefined' && CONFIG.EMPRESA) ? CONFIG.EMPRESA : {};
        const nomeEmp = emp.nome || 'ADONAY CONFECÇÃO';
        const tel = emp.telefone1 || '';
        const end = emp.endereco || '';
        const idC = idCurtoPedido(dados);
        const fin = dados.financeiro || {};
        const total = Number(fin.totalPedido) || 0;
        const entrada = Number(fin.valorEntrada) || 0;
        const restante = Number(fin.restante) != null ? Number(fin.restante) : total - entrada;
        const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
        const totalPecasCalc = calcularTotalPecasGp(produtos);
        const totalPecas =
            totalPecasCalc > 0 ? totalPecasCalc : Number(dados.totalPecas) || 0;
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const obsHtml = obs.trim() ? escapeHtml(obs) : '—';
        const mockupsArr = Array.isArray(mockupSrcsPorProduto) ? mockupSrcsPorProduto : [];

        const blocosProduto = produtos
            .map((prod, idx) => {
                const linhas = montarLinhasGpUmProduto(prod);
                const corpo = linhasGpParaHtmlTabela(linhas);
                const n = idx + 1;
                const tituloProd = prod.nomeProduto || `Produto ${n}`;
                const mockSrc = mockupsArr[idx] || '';
                const mockHtml = montarBlocoMockupGp(mockSrc, tituloProd, idx);
                return `
    <section class="gp-produto">
        <h3 class="gp-produto-tit">${escapeHtml(tituloProd)}</h3>
        <table class="gp-tabela">
            <thead>
                <tr>
                    <th>Quant.</th><th>Tamanho</th><th>Tipo</th><th>Descrição</th><th>Preç. un.</th><th>Total</th>
                </tr>
            </thead>
            <tbody>${corpo}</tbody>
        </table>
        ${mockHtml}
    </section>`;
            })
            .join('');

        return `
<div class="gp-doc">
    <div class="gp-header">
        <div class="gp-marca">${escapeHtml(nomeEmp)}</div>
        <div class="gp-meta">
            <span class="gp-id">ID: ${escapeHtml(idC)}</span>
            <span>${escapeHtml(tel)}</span>
        </div>
        <div class="gp-endereco">${escapeHtml(end)}</div>
    </div>
    <section class="gp-info-cliente">
        <h2 class="gp-sec-titulo">Cliente e prazos</h2>
        <div class="gp-info-cliente-grid">
            <div class="gp-cel">
                <span class="gp-label">Nome</span>
                <span class="gp-val">${escapeHtml(cli.nome)}</span>
            </div>
            <div class="gp-cel">
                <span class="gp-label">Telefone</span>
                <span class="gp-val">${escapeHtml(cli.telefone)}</span>
            </div>
            <div class="gp-cel">
                <span class="gp-label">Data do pedido</span>
                <span class="gp-val">${formatarDataBR(dados.datas?.pedido)}</span>
            </div>
            <div class="gp-cel gp-cel--entrega">
                <span class="gp-label">Data de entrega</span>
                <span class="gp-val">${formatarDataBR(dados.datas?.entrega)}</span>
            </div>
        </div>
    </section>
    <section class="gp-desc-pedido">
        <h2 class="gp-sec-titulo gp-sec-titulo--sub">Descrição do pedido</h2>
        <p class="gp-desc-texto">${obsHtml}</p>
    </section>
    ${blocosProduto}
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
    <div class="gp-rodape">GP</div>
</div>`;
    }

    function montarHtmlOs(dados, mockupSrcsPorProduto, artesSrc) {
        const emp = (typeof CONFIG !== 'undefined' && CONFIG.EMPRESA) ? CONFIG.EMPRESA : {};
        const nomeEmp = emp.nome || 'ADONAY CONFECÇÃO';
        const idC = idCurtoPedido(dados);
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
        const mockupsArr = Array.isArray(mockupSrcsPorProduto) ? mockupSrcsPorProduto : [];
        let totalPecas = 0;
        const blocosProd = produtos
            .map((prod, idx) => {
                const n = idx + 1;
                const tituloProd = prod.nomeProduto || `Modelo ${n}`;
                const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
                let sub = 0;
                const linhasTam = tams
                    .map((t) => {
                        const q = Number(t.quantidade) || 0;
                        sub += q;
                        return `<tr><td>${escapeHtml(t.tamanho || '—')}</td><td class="os-num">${q}</td></tr>`;
                    })
                    .join('');
                totalPecas += sub;
                const est = listaEstampasProduto(prod);
                const mockSrc = mockupsArr[idx] || '';
                const mockHtml = montarBlocoMockupOs(mockSrc, tituloProd, idx);
                return `
            <div class="os-modelo">
                <h3 class="os-modelo-tit">${escapeHtml(tituloProd)}</h3>
                <table class="os-tab-tam"><thead><tr><th>Tamanho</th><th>Qtd</th></tr></thead><tbody>${linhasTam}</tbody></table>
                <div class="os-info">
                    <div><strong>Malha</strong> ${escapeHtml(prod.tipoMalha || '—')}</div>
                    <div><strong>Cor</strong> ${escapeHtml(prod.corMalha || '—')}</div>
                    <div><strong>Peça / detalhe</strong> ${escapeHtml(prod.tipoPeca || '')} ${escapeHtml(prod.detalhesPeca || '')}</div>
                    <div><strong>Estampas</strong> ${escapeHtml(est)}</div>
                </div>
                ${mockHtml}
            </div>`;
            })
            .join('');

        return `
<div class="os-doc">
    <h1 class="os-titulo">Ordem de serviço — ${escapeHtml(nomeEmp)}</h1>
    <div class="os-topo">
        <div><strong>Data</strong> ${formatarDataBR(dados.datas?.pedido)}</div>
        <div><strong>ID</strong> ${escapeHtml(idC)}</div>
    </div>
    <div class="os-cliente">
        <h2>Dados do cliente</h2>
        <div><strong>Nome</strong> ${escapeHtml(cli.nome)}</div>
        <div><strong>Pedido</strong> ${escapeHtml(obs)}</div>
    </div>
    ${blocosProd}
    <div class="os-total-pecas"><strong>Total de peças</strong> ${totalPecas}</div>
    ${montarGaleriaArtesHtml(artesSrc)}
</div>`;
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
            await prepararImagensParaImpressao(mount);

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
