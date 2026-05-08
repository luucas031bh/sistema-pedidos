/**
 * Impressão OS (Ordem de serviço) e GP (Guia de pedido).
 * Usa mockup e artes do formulário (arquivo local ou URL salva no Drive).
 */
(function () {
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

    function normalizarUrlDriveParaImg(url) {
        if (!url) return '';
        const s = String(url);
        if (/^blob:/i.test(s) || /^data:/i.test(s)) return s;
        if (!s.includes('drive.google.com')) return s;
        const m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/) || s.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!m) return s;
        return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`;
    }

    function montarBlocoImagens(imgs, prefixo) {
        if (!imgs || !imgs.length) {
            return `<div class="${prefixo}-mockup ${prefixo}-mockup--vazio">(Sem imagens)</div>`;
        }
        const itens = imgs
            .map(
                (im) => `
        <figure class="${prefixo}-galeria-item">
            <img src="${im.src}" alt="${escapeHtml(im.label)}" class="${prefixo}-mockup-img">
            <figcaption class="${prefixo}-galeria-leg">${escapeHtml(im.label)}</figcaption>
        </figure>`
            )
            .join('');
        return `<div class="${prefixo}-galeria">${itens}</div>`;
    }

    function listaEstampasProduto(prod) {
        const arr = Array.isArray(prod.estampas) ? prod.estampas : [];
        return arr
            .filter((e) => e && (e.tipo || e.localidade))
            .map((e) => [e.tipo, e.localidade].filter(Boolean).join(' — '))
            .join('; ') || '—';
    }

    function montarHtmlGp(dados, imgs) {
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

        const blocosProduto = produtos
            .map((prod, idx) => {
                const linhas = montarLinhasGpUmProduto(prod);
                const corpo = linhasGpParaHtmlTabela(linhas);
                const n = idx + 1;
                return `
    <section class="gp-produto">
        <h3 class="gp-produto-tit">Produto ${n}</h3>
        <table class="gp-tabela">
            <thead>
                <tr>
                    <th>Quant.</th><th>Tamanho</th><th>Tipo</th><th>Descrição</th><th>Preç. un.</th><th>Total</th>
                </tr>
            </thead>
            <tbody>${corpo}</tbody>
        </table>
    </section>`;
            })
            .join('');

        const imgBloco = montarBlocoImagens(imgs, 'gp');

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
    ${imgBloco}
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

    function montarHtmlOs(dados, imgs) {
        const emp = (typeof CONFIG !== 'undefined' && CONFIG.EMPRESA) ? CONFIG.EMPRESA : {};
        const nomeEmp = emp.nome || 'ADONAY CONFECÇÃO';
        const idC = idCurtoPedido(dados);
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
        let totalPecas = 0;
        const blocosProd = produtos
            .map((prod, idx) => {
                const n = idx + 1;
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
                return `
            <div class="os-modelo">
                <h3 class="os-modelo-tit">Modelo ${n}</h3>
                <table class="os-tab-tam"><thead><tr><th>Tamanho</th><th>Qtd</th></tr></thead><tbody>${linhasTam}</tbody></table>
                <div class="os-info">
                    <div><strong>Malha</strong> ${escapeHtml(prod.tipoMalha || '—')}</div>
                    <div><strong>Cor</strong> ${escapeHtml(prod.corMalha || '—')}</div>
                    <div><strong>Peça / detalhe</strong> ${escapeHtml(prod.tipoPeca || '')} ${escapeHtml(prod.detalhesPeca || '')}</div>
                    <div><strong>Estampas</strong> ${escapeHtml(est)}</div>
                </div>
            </div>`;
            })
            .join('');
        const imgBloco = montarBlocoImagens(imgs, 'os');

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
    ${imgBloco}
</div>`;
    }

    function obterDadosImpressao() {
        if (typeof coletarDadosFormulario !== 'function') return null;
        return coletarDadosFormulario();
    }

    function prepararImagensParaImpressao() {
        const revokes = [];
        const imgs = [];

        const inputMock = document.getElementById('inputMockupPedido');
        if (inputMock && inputMock.files && inputMock.files[0]) {
            const file = inputMock.files[0];
            if (file.type === 'image/png' || file.type === 'image/jpeg') {
                const url = URL.createObjectURL(file);
                revokes.push(url);
                imgs.push({ src: url, label: 'Mockup' });
            }
        } else {
            const raw =
                typeof estadoApp !== 'undefined' && estadoApp.imagens
                    ? estadoApp.imagens.mockupUrlDrive
                    : '';
            if (raw) imgs.push({ src: normalizarUrlDriveParaImg(raw), label: 'Mockup' });
        }

        const container = document.getElementById('containerArtes');
        if (
            container &&
            typeof obterInputArteDoItem === 'function' &&
            typeof obterArquivoLocalArteItem === 'function'
        ) {
            const itens = container.querySelectorAll('.arte-upload-item');
            let arteNum = 0;
            itens.forEach((item) => {
                const inputArte = obterInputArteDoItem(item);
                const local = obterArquivoLocalArteItem(item, inputArte);
                if (local && (local.type === 'image/png' || local.type === 'image/jpeg')) {
                    const url = URL.createObjectURL(local);
                    revokes.push(url);
                    arteNum += 1;
                    imgs.push({ src: url, label: `Arte ${arteNum}` });
                    return;
                }
                const dsUrl = item.dataset && item.dataset.urlDrive ? item.dataset.urlDrive : '';
                if (dsUrl) {
                    arteNum += 1;
                    imgs.push({ src: normalizarUrlDriveParaImg(dsUrl), label: `Arte ${arteNum}` });
                }
            });
        }

        return { imgs, revokes };
    }

    function executarImpressao(tipo) {
        const dados = obterDadosImpressao();
        if (!dados || !dados.cliente) {
            if (typeof Utils !== 'undefined' && Utils.mostrarNotificacao) {
                Utils.mostrarNotificacao('Carregue um pedido antes de imprimir.', 'error');
            }
            return;
        }

        const mount = document.getElementById(tipo === 'os' ? 'printOsMount' : 'printGpMount');
        if (!mount) return;

        const { imgs, revokes } = prepararImagensParaImpressao();

        mount.innerHTML = tipo === 'os' ? montarHtmlOs(dados, imgs) : montarHtmlGp(dados, imgs);

        const cls = tipo === 'os' ? 'imprimindo-doc-os' : 'imprimindo-doc-gp';
        document.body.classList.add(cls);

        const cleanup = () => {
            document.body.classList.remove(cls);
            mount.innerHTML = '';
            revokes.forEach((u) => URL.revokeObjectURL(u));
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);

        setTimeout(() => {
            window.print();
        }, 100);
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
