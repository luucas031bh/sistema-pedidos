/**
 * Impressão OS (Ordem de serviço) e GP (Guia de pedido).
 * Imagens opcionais apenas em memória — não persistem.
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

    function montarLinhasGp(produtos) {
        const linhas = [];
        (produtos || []).forEach((prod) => {
            const pu = Number(prod.precoUnitario) || 0;
            const tams = Array.isArray(prod.tamanhos) ? prod.tamanhos : [];
            const tipo = resumirTipoPeca(prod.tipoPeca, prod.detalhesPeca);
            const desc = [prod.tipoMalha, prod.corMalha].filter(Boolean).join(' — ') || '—';
            if (tams.length === 0) {
                linhas.push({ q: 0, tam: '—', tipo, desc, un: pu, tot: 0 });
                return;
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
        });
        return linhas;
    }

    function listaEstampasProduto(prod) {
        const arr = Array.isArray(prod.estampas) ? prod.estampas : [];
        return arr
            .filter((e) => e && (e.tipo || e.localidade))
            .map((e) => [e.tipo, e.localidade].filter(Boolean).join(' — '))
            .join('; ') || '—';
    }

    function montarHtmlGp(dados, imgSrc) {
        const emp = (typeof CONFIG !== 'undefined' && CONFIG.EMPRESA) ? CONFIG.EMPRESA : {};
        const nomeEmp = emp.nome || 'ADONAY CONFECÇÃO';
        const tel = emp.telefone1 || '';
        const end = emp.endereco || '';
        const idC = idCurtoPedido(dados);
        const fin = dados.financeiro || {};
        const total = Number(fin.totalPedido) || 0;
        const entrada = Number(fin.valorEntrada) || 0;
        const restante = Number(fin.restante) != null ? Number(fin.restante) : total - entrada;
        const linhas = montarLinhasGp(dados.produtos);
        const cli = dados.cliente || {};
        const obs = dados.observacoes || '';
        const linhasHtml = linhas
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
        const imgBloco = imgSrc
            ? `<div class="gp-mockup"><img src="${imgSrc}" alt="Mockup" class="gp-mockup-img"></div>`
            : '<div class="gp-mockup gp-mockup--vazio">(Sem imagem de mockup)</div>';

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
    <div class="gp-datas">
        <div><strong>Data (pedido)</strong><br>${formatarDataBR(dados.datas?.pedido)}</div>
        <div class="gp-entrega"><strong>ENTREGA</strong><br>${formatarDataBR(dados.datas?.entrega)}</div>
    </div>
    <div class="gp-cliente">
        <div><strong>Cliente</strong> ${escapeHtml(cli.nome)}</div>
        <div><strong>Celular</strong> ${escapeHtml(cli.telefone)}</div>
        <div><strong>Pedido / obs.</strong> ${escapeHtml(obs)}</div>
    </div>
    <table class="gp-tabela">
        <thead>
            <tr>
                <th>Quant.</th><th>Tamanho</th><th>Tipo</th><th>Descrição</th><th>Preç. un.</th><th>Total</th>
            </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
    </table>
    <div class="gp-financeiro">
        <div><strong>TOTAL</strong> ${Utils.formatarMoeda(total)}</div>
        <div><strong>ENTRADA</strong> ${entrada > 0 ? Utils.formatarMoeda(entrada) : '—'}</div>
        <div><strong>RESTANTE</strong> ${Utils.formatarMoeda(restante)}</div>
    </div>
    ${imgBloco}
    <div class="gp-rodape">GP</div>
</div>`;
    }

    function montarHtmlOs(dados, imgSrc) {
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
        const imgBloco = imgSrc
            ? `<div class="os-mockup"><img src="${imgSrc}" alt="Mockup" class="os-mockup-img"></div>`
            : '';

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

    function prepararImagemInput(inputEl) {
        if (!inputEl || !inputEl.files || !inputEl.files[0]) return { src: null, revoke: null };
        const url = URL.createObjectURL(inputEl.files[0]);
        return { src: url, revoke: url };
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

        const inputEl = document.getElementById(tipo === 'os' ? 'inputMockupOs' : 'inputMockupGp');
        const { src: imgSrc, revoke } = prepararImagemInput(inputEl);

        mount.innerHTML = tipo === 'os' ? montarHtmlOs(dados, imgSrc) : montarHtmlGp(dados, imgSrc);

        const cls = tipo === 'os' ? 'imprimindo-doc-os' : 'imprimindo-doc-gp';
        document.body.classList.add(cls);

        const cleanup = () => {
            document.body.classList.remove(cls);
            mount.innerHTML = '';
            if (revoke) URL.revokeObjectURL(revoke);
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
