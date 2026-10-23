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

    function detalhesVisuaisGp(prod) {
        const partes = String(prod.detalhesPeca || '').split(' - ');
        const campos = partes.length >= 3
            ? [['Gola',partes[0]],['Manga',partes[1]],['Acabamento',partes.slice(2).join(' - ')]]
            : [['Peça',prod.tipoPeca || '—'],['Modelo / acabamento',prod.detalhesPeca || '—']];
        const cor = typeof AdonayMockups !== 'undefined' ? AdonayMockups.color(prod.corMalha) : {hex:'#e8e8e5',known:false};
        const grade = tamanhosComQuantidade(prod).map(t => `<span class="gp-grade-token"><span class="gp-grade-size">${escapeHtml(t.tamanho)}</span><span class="gp-grade-count">${Number(t.quantidade)||0} un.</span></span>`).join('');
        const estampas = estampasValidas(prod).map((e,i) => `<li class="gp-application-row"><span class="gp-application-number">${i+1}</span><span class="gp-application-method">${escapeHtml(e.tipo)}</span><span class="gp-application-location">${escapeHtml(e.localidade||'—')}</span>${e.quantidadeCores?`<span class="gp-application-color">${escapeHtml(e.quantidadeCores)}</span>`:''}</li>`).join('');
        return `<div class="gp-product-details"><div class="gp-detail-model">${campos.map(([label,value])=>`<div><span class="gp-detail-label">${escapeHtml(label)}</span><span class="gp-detail-value">${escapeHtml(value)}</span></div>`).join('')}</div><div class="gp-materials"><div class="gp-material-field"><span class="gp-color-dot" style="--fabric-color:${cor.hex}" aria-hidden="true"></span><span class="gp-inline-label">Cor</span><span>${escapeHtml(prod.corMalha||'—')}</span></div><div class="gp-material-field"><span class="gp-inline-label">Malha</span><span>${escapeHtml(malhaCurta(prod.tipoMalha))}</span></div></div><div class="gp-order-quantities"><div><span class="gp-detail-label">Grade</span><div class="gp-grade-tokens">${grade||'—'}</div></div><div><span class="gp-detail-label">Quantidade</span><div class="gp-quantity-main">${pecasDoProduto(prod)} <small>peças</small></div></div><div><span class="gp-detail-label">Valor unitário</span><div class="gp-unit-amount">${Utils.formatarMoeda(Number(prod.precoUnitario)||0)}</div></div></div>${estampas?`<ol class="gp-application-list" aria-label="Aplicações do produto">${estampas}</ol>`:''}</div>`;
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
        const totalPecas = totalPecasCalc > 0 ? totalPecasCalc : Number(dados.totalPecas) || 0;
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const mockupsArr = Array.isArray(mockupSrcsPorProduto) ? mockupSrcsPorProduto : [];
        const faixaMock = produtos.map((prod,idx) => {
            const src=mockupsArr[idx]||'';
            return src?`<figure class="gp-faixa-item"><img src="${src}" alt="Mockup do produto ${idx+1}" class="gp-faixa-img"><figcaption>${escapeHtml(prod.nomeProduto||`Produto ${idx+1}`)}</figcaption></figure>`:'';
        }).filter(Boolean).join('');
        const blocos = produtos.map((prod,idx) => `<article class="gp-item"><header><strong>${escapeHtml(prod.nomeProduto||`Produto ${idx+1}`)}</strong><b>${Utils.formatarMoeda(pecasDoProduto(prod)*(Number(prod.precoUnitario)||0))}</b></header>${detalhesVisuaisGp(prod)}</article>`).join('');
        return `<div class="gp-doc gp-doc--limpa"><header class="gp-topo"><div><strong>${escapeHtml(nomeEmp)}</strong><span>${escapeHtml(tel)} · ${escapeHtml(end)}</span></div><div class="gp-id"><small>Pedido</small>${escapeHtml(idC)}</div></header><div class="gp-title-line"><h1>Guia de Pedido</h1><span>Resumo do pedido e conferência</span></div><section class="gp-cliente"><div><small>Cliente</small><strong>${escapeHtml(cli.nome||'—')}</strong><span>${escapeHtml(cli.telefone||'')}</span></div><div><small>Entrega</small><strong>${formatarDataBR(dados.datas?.entrega)}</strong><span>Pedido ${formatarDataBR(dados.datas?.pedido)}</span></div></section><h2 class="gp-section-title">Produtos do pedido</h2>${blocos||'<p>Nenhum produto informado.</p>'}${String(obs).trim()?`<h2 class="gp-section-title">Observações</h2><p class="gp-obs">${escapeHtml(obs)}</p>`:''}${faixaMock?`<section class="gp-faixa"><h2 class="gp-sec-titulo">Mockups dos produtos</h2><div class="gp-faixa-lista">${faixaMock}</div></section>`:''}${montarGaleriaArtesHtml(artesSrc)}<div class="gp-rodape-valores"><div class="gp-resumo-financeiro"><h2 class="gp-sec-titulo gp-sec-titulo--sub">Resumo financeiro</h2><dl class="gp-resumo-lista"><div class="gp-resumo-linha"><dt>Total de peças</dt><dd>${totalPecas}</dd></div><div class="gp-resumo-linha"><dt>Valor total do pedido</dt><dd>${Utils.formatarMoeda(total)}</dd></div><div class="gp-resumo-linha"><dt>Valor da entrada</dt><dd>${entrada>0?Utils.formatarMoeda(entrada):'—'}</dd></div><div class="gp-resumo-linha"><dt>Valor restante</dt><dd>${Utils.formatarMoeda(restante)}</dd></div></dl></div><div class="gp-assinatura"><p class="gp-assinatura-texto">Declaro ter lido e estar de acordo com o descrito nesta guia.</p><div class="gp-linha-assinatura"></div><p class="gp-assinatura-rotulo">Assinatura do cliente</p></div></div><div class="gp-rodape">GP — Guia de Pedido</div></div>`;
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

    function amostraCor(nome) {
        if (typeof AdonayMockups !== 'undefined') {
            const cor = AdonayMockups.color(nome);
            return cor.known ? `<i class="os-amostra" style="--os-cor:${cor.hex};background:${cor.hex}"></i>` : '<i class="os-amostra os-amostra--vazia"></i>';
        }
        const s = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const pares = [
            ['pret', '#161616'], ['branc', '#f5f5f5'], ['marinh', '#1b2a6b'], ['royal', '#1d4e9e'],
            ['azul', '#2458a6'], ['vermelh', '#c0392b'], ['vinho', '#6e2430'], ['bord', '#7a1f2b'],
            ['verd', '#1e7a45'], ['amarel', '#e2b007'], ['cinza', '#8d939c'], ['rosa', '#e07a9a'],
            ['laranj', '#e36a12'], ['bege', '#e4d3b4'], ['roxo', '#5c3d8f'], ['lilas', '#a98bc4'],
            ['dourad', '#c6a15a'], ['prata', '#c5c8ce']
        ];
        let hex = '';
        for (let i = 0; i < pares.length; i++) {
            if (s.includes(pares[i][0])) { hex = pares[i][1]; break; }
        }
        if (!hex) return '<i class="os-amostra os-amostra--vazia"></i>';
        return `<i class="os-amostra" style="--os-cor:${hex};background:${hex}"></i>`;
    }

    function svgPeca(lado, marcas) {
        const frente = lado === 'frente';
        const pontos = frente
            ? { 'peito-e': [38, 52], 'peito-d': [62, 52], corpo: [50, 64], 'ombro-e': [28, 34], 'ombro-d': [72, 34], barra: [50, 100], 'barra-e': [38, 100], 'barra-d': [62, 100], 'manga-e': [14, 42], 'manga-d': [86, 42] }
            : { corpo: [50, 58], pescoco: [50, 22], barra: [50, 100], 'barra-e': [38, 100], 'barra-d': [62, 100], 'manga-e': [14, 42], 'manga-d': [86, 42] };
        const bolhas = marcas
            .filter((m) => m.zona !== 'total' && pontos[m.zona])
            .map((m) => {
                const [x, y] = pontos[m.zona];
                return `<circle cx="${x}" cy="${y}" r="6.4" fill="#111"/><text x="${x}" y="${y + 2.1}" text-anchor="middle" font-size="7" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${m.n}</text>`;
            })
            .join('');
        const total = marcas.some((m) => m.zona === 'total');
        const corpo = frente
            ? 'M34 20 C42 30 58 30 66 20 L78 28 L94 40 L82 50 L74 42 V108 H26 V42 L18 50 L6 40 L22 28 Z'
            : 'M34 16 C44 22 56 22 66 16 L78 26 L94 40 L82 50 L74 42 V108 H26 V42 L18 50 L6 40 L22 26 Z';
        const gola = frente
            ? '<path d="M40 21 C46 28 54 28 60 21" fill="none" stroke="#111" stroke-width="1.4"/>'
            : '<path d="M42 17 H58" fill="none" stroke="#111" stroke-width="1.4"/>';
        return `<svg class="os-silhueta" viewBox="0 0 100 118" aria-hidden="true">
            <path d="${corpo}" fill="${total ? '#ececec' : '#fff'}" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/>
            ${gola}
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
        const idC=idCurtoPedido(dados), cli=dados.cliente||{},obs=String(dados.observacoes||'').trim();
        const produtos=Array.isArray(dados.produtos)?dados.produtos:[],mockups=Array.isArray(mockupSrcsPorProduto)?mockupSrcsPorProduto:[],artes=Array.isArray(artesSrc)?artesSrc.filter(Boolean):[];
        const emp=(typeof CONFIG!=='undefined'&&CONFIG.EMPRESA)?CONFIG.EMPRESA:{};
        const fichas=produtos.map((prod,idx)=>{
            const lista=estampasValidas(prod),tams=tamanhosComQuantidade(prod);
            const marks=[];
            lista.forEach((e,i)=>{
                const local=String(e.localidade||'').toLowerCase(),zone=zonaEstampa(e.localidade);
                if(zone==='total'){marks.push({side:'frente',zone,number:i+1},{side:'costas',zone,number:i+1});}
                else if(local.includes('costas')||local.includes('pescoço')||local.includes('pescoco'))marks.push({side:'costas',zone,number:i+1});
                else marks.push({side:'frente',zone,number:i+1});
            });
            const visual=mockups[idx]?`<img src="${mockups[idx]}" alt="Mockup anexado ao produto ${idx+1}" class="os-prova">`:(typeof AdonayMockups!=='undefined'?AdonayMockups.render(prod,produtos.length===1?obs:'',marks):mapaEstampas(lista));
            const grade=tams.length?`<div class="os-numeros">${tams.map(t=>`<div><span>${escapeHtml(t.tamanho||'—')}</span><b>${Number(t.quantidade)||0}</b></div>`).join('')}</div>`:'<p class="os-nota">Grade não informada.</p>';
            const locais=lista.length?`<table class="os-table"><thead><tr><th>Aplic.</th><th>Técnica</th><th>Local / tamanho</th><th>Cores</th></tr></thead><tbody>${lista.map((e,i)=>`<tr><td><span class="os-location-mark">${i+1}</span></td><td>${escapeHtml(e.tipo||'—')}</td><td>${escapeHtml(e.localidade||'—')}</td><td>${escapeHtml(e.quantidadeCores||'Não informado')}</td></tr>`).join('')}</tbody></table>`:'<p class="os-nota">Nenhuma aplicação cadastrada.</p>';
            const anexos=idx===0&&artes.length?`<section class="os-reference-section"><h2 class="os-section-heading">Referências anexadas ao pedido</h2><div class="os-artes">${artes.slice(0,4).map((src,i)=>`<img src="${src}" alt="Referência anexada ${i+1}">`).join('')}</div></section>`:'';
            return `<article class="os-folha os-paper${idx?' os-folha--nova':''}"><header class="os-brand-header"><div class="os-brand">${escapeHtml(emp.nome||'ADONAY CONFECÇÃO')}</div><div class="os-doc-title"><h1>Ordem de serviço</h1><span>Ficha de produção por produto</span></div></header><section class="os-data-strip"><div class="os-data-cell"><small>OS / ID Busca</small><strong>${escapeHtml(idC)}</strong></div><div class="os-data-cell"><small>Entrega</small><strong>${escapeHtml(formatarDataBR(dados.datas?.entrega))}</strong></div><div class="os-data-cell"><small>Peças deste produto</small><strong>${pecasDoProduto(prod)}</strong></div><div class="os-data-cell"><small>Produto</small><strong>${String(idx+1).padStart(2,'0')} / ${String(produtos.length).padStart(2,'0')}</strong></div></section><section class="os-identification"><p class="os-section-label">Produto / cliente</p><h2 class="os-product-name">${escapeHtml(prod.nomeProduto||`Produto ${idx+1}`)}</h2><p class="os-client-name">${escapeHtml(cli.nome||'—')}</p></section><section class="os-specifications"><div><small>Cor da malha</small><div class="os-color-label">${amostraCor(prod.corMalha)}${escapeHtml(prod.corMalha||'—')}</div></div><div><small>Malha</small><p class="os-fabric-value">${escapeHtml(prod.tipoMalha||'—')}</p></div><div><small>Modelo / acabamento</small><p class="os-model-value">${escapeHtml(prod.detalhesPeca||prod.tipoPeca||'—')}</p></div></section><section class="os-technical"><div class="os-technical-heading"><h2 class="os-section-heading">Mockup de produção</h2><span class="os-caption">Posições conforme cadastro</span></div><div class="os-visual">${visual}</div></section><section class="os-grade-section"><h2 class="os-section-heading">Grade de produção</h2>${grade}</section><section class="os-print-section"><h2 class="os-section-heading">Estampas e localizações</h2>${locais}</section>${obs?`<section class="os-note-section"><h2>Observações do pedido</h2><p class="os-nota">${escapeHtml(obs)}</p></section>`:''}${anexos}<footer class="os-paper-footer"><span>${escapeHtml(emp.nome||'ADONAY CONFECÇÃO')} · uso interno na produção</span><span>Produto ${String(idx+1).padStart(2,'0')} de ${String(produtos.length).padStart(2,'0')}</span></footer></article>`;
        }).join('');
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
