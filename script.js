// Sistema Adonay Confecção - Integração Google Sheets
const estadoApp = {
    produtos: [],
    produtoAtualId: 1,
    pedidoEmEdicao: null,
    modoEdicao: false,
    idEdicao: null,
    somenteLeitura: false,
    imagens: {
        mockupUrlDrive: '',
        artesUrlDrive: []
    }
};

/** Fallback local (mesmos números que o sistema usava antes da config dinâmica). */
const CONFIG_CALCULO_FALLBACK = {
    malhas: {
        'PV (65% Poliéster 35% Viscose)': 8.91,
        'Algodão Peteado (100% Algodão)': 8.25,
        'Piquet (50% Algodão 50% Poliéster)': 11.79,
        'Tricoline Ibiza (Composição)': 11.79,
        'DryFit (100% Poliéster)': 7.30,
        'Dry Poliamida (100% Poliamida)': 17.35,
        'Moletom (50% Algodão 50% Poliéster)': 20.56,
        'Malha PP (100% Poliéster)': 7.48,
        'Algodão com Elastano (98% Algodão 2% Elastano)': 8.25,
        'Helanca Light (100% Poliéster)': 7.48
    },
    maoObra: { 'Camisas Comum': 4.50, 'Camisas POLO': 16.00, Moletons: 19.50, 'Camisa Social': 4.50 },
    estampas: {
        'Silk Screen': { valor_10x10: 0.88, valor_10x6: 0.88, valor_a4: 3.88, valor_a3: 6.75, valor_full_print: 0 },
        'DTF (Direct to Film)': { valor_10x10: 1.40, valor_10x6: 0.84, valor_a4: 8.74, valor_a3: 17.48, valor_full_print: 0 },
        Bordado: { valor_10x10: 5.00, valor_10x6: 6.00, valor_a4: 15.00, valor_a3: 15.00, valor_full_print: 0 },
        'Sublimação Localizada': { valor_10x10: 0.30, valor_10x6: 0.30, valor_a4: 1.00, valor_a3: 1.00, valor_full_print: 0 },
        'Sublimação Total (Full Print)': { valor_10x10: 0, valor_10x6: 0, valor_a4: 0, valor_a3: 0, valor_full_print: 5.27 }
    },
    tamanhos: {},
    geral: { custo_fixo: 10, margem_padrao: 100, adicional_por_cor_silk: 0.25 }
};

(function preencherFallbackTamanhos() {
    const um = (CONFIG && CONFIG.TAMANHOS) ? CONFIG.TAMANHOS : [];
    um.forEach((t) => { CONFIG_CALCULO_FALLBACK.tamanhos[t] = 1; });
    CONFIG_CALCULO_FALLBACK.tamanhos.EG = 1;
})();

window.CONFIG_CALCULO = null;

function aplicarConfigCalculoRuntime(data) {
    const geral = { ...CONFIG_CALCULO_FALLBACK.geral, ...(data.geral || {}) };
    const dm = data.malhas || [];
    const dmo = data.maoObra || [];
    const de = data.estampas || [];
    const dt = data.tamanhos || [];

    const malhas = dm.length === 0 ? { ...CONFIG_CALCULO_FALLBACK.malhas } : {};
    dm.forEach((m) => {
        if (m.identificador) malhas[m.identificador] = Number(m.valor) || 0;
    });

    const maoObra = dmo.length === 0 ? { ...CONFIG_CALCULO_FALLBACK.maoObra } : {};
    dmo.forEach((m) => {
        if (m.identificador) maoObra[m.identificador] = Number(m.valor) || 0;
    });

    const estampas = de.length === 0 ? JSON.parse(JSON.stringify(CONFIG_CALCULO_FALLBACK.estampas)) : {};
    de.forEach((e) => {
        if (e.tipo) {
            estampas[e.tipo] = {
                valor_10x10: Number(e.valor_10x10) || 0,
                valor_10x6: Number(e.valor_10x6) || 0,
                valor_a4: Number(e.valor_a4) || 0,
                valor_a3: Number(e.valor_a3) || 0,
                valor_full_print: Number(e.valor_full_print) || 0
            };
        }
    });

    const tamanhos = dt.length === 0 ? { ...CONFIG_CALCULO_FALLBACK.tamanhos } : {};
    dt.forEach((t) => {
        if (t.tamanho) tamanhos[t.tamanho] = Number(t.valor) || 1;
    });

    window.CONFIG_CALCULO = { malhas, maoObra, estampas, tamanhos, geral };
}

async function carregarConfigCalculo() {
    aplicarConfigCalculoRuntime({ malhas: [], maoObra: [], estampas: [], tamanhos: [], geral: {} });
    if (window.location.protocol === 'file:') return;
    if (!CONFIG.APPS_SCRIPT_URL) return;
    try {
        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=obterConfigCalculo&acao=obterConfigCalculo&_ts=${Date.now()}`);
        const data = await res.json();
        if (data.sucesso && Array.isArray(data.malhas)) {
            aplicarConfigCalculoRuntime(data);
        }
    } catch (err) {
        console.warn('carregarConfigCalculo', err);
    }
}

function obterMargemPadraoCalc() {
    const g = window.CONFIG_CALCULO && window.CONFIG_CALCULO.geral;
    if (g && g.margem_padrao != null) return Number(g.margem_padrao);
    return CONFIG.CALCULOS.margemLucroPadrao;
}

function obterCustoFixoCalc() {
    const g = window.CONFIG_CALCULO && window.CONFIG_CALCULO.geral;
    if (g && g.custo_fixo != null) return Number(g.custo_fixo);
    return CONFIG_CALCULO_FALLBACK.geral.custo_fixo;
}

function obterAdicionalCorSilkCalc() {
    const g = window.CONFIG_CALCULO && window.CONFIG_CALCULO.geral;
    if (g && g.adicional_por_cor_silk != null) return Number(g.adicional_por_cor_silk);
    return CONFIG_CALCULO_FALLBACK.geral.adicional_por_cor_silk;
}

function obterFatorTamanhoDaConfig(tamanhoRaw) {
    const map = (window.CONFIG_CALCULO && window.CONFIG_CALCULO.tamanhos) || CONFIG_CALCULO_FALLBACK.tamanhos;
    const tNorm = normalizarTamanhoParaCalculo(tamanhoRaw);
    if (map[tamanhoRaw] != null && map[tamanhoRaw] !== '') return Number(map[tamanhoRaw]) || 1;
    if (map[tNorm] != null && map[tNorm] !== '') return Number(map[tNorm]) || 1;
    return 1;
}

document.addEventListener('DOMContentLoaded', () => inicializarApp());

async function inicializarApp() {
    // Setup síncrono — não depende de rede
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    configurarBotaoVoltarPrincipal();
    configurarValoresPadraoFormulario();
    popularOpcoesStatusOperacionalIndex();
    popularOpcoesStatusProducaoIndex();
    configurarEventListeners();

    const idUrl = (new URLSearchParams(window.location.search).get('id') || '').trim();
    if (!idUrl) adicionarProduto();

    // Dispara as duas requisições ao mesmo tempo em vez de sequencialmente
    await Promise.all([
        carregarConfigCalculo(),
        carregarPedidoViaURL()
    ]);

    atualizarSecaoImpressaoPedido();
    const container = document.getElementById('produtosContainer');
    if (container && !container.children.length) adicionarProduto();
    if (!estadoApp.somenteLeitura) garantirSlotArteMinimo();
}

function atualizarRelogio() {
    const relogio = document.getElementById('relogio');
    if (relogio) relogio.textContent = Utils.dataHoraCompleta();
}

function configurarValoresPadraoFormulario() {
    document.getElementById('dataPedido').value = Utils.dataAtual();
    calcularDataEntrega();
    const vendedorSelect = document.getElementById('responsavelAtual');
    if (vendedorSelect) vendedorSelect.value = 'ISABELA SIRAY';
    const tagSelect = document.getElementById('tagPedido');
    if (tagSelect) tagSelect.value = 'PEDIDO';
}

function configurarEventListeners() {
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', (e) => {
            e.target.value = Utils.formatarTelefone(e.target.value);
            atualizarID();
        });
    }

    document.getElementById('dataPedido')?.addEventListener('change', calcularDataEntrega);
    document.getElementById('valorEntrada')?.addEventListener('input', calcularResumoFinanceiro);
    document.getElementById('btnAdicionarProduto')?.addEventListener('click', adicionarProduto);
    document.getElementById('btnSalvar')?.addEventListener('click', salvarPedido);
    inicializarSecaoImagens();
}

/* ================================================================
   SEÇÃO DE IMAGENS DO PEDIDO (Mockup + Artes)
   ================================================================ */

const MAX_ARTES = 10;
const MAX_TAMANHO_IMAGEM_MB = 4;

function inicializarSecaoImagens() {
    const inputMockup = document.getElementById('inputMockupPedido');
    if (inputMockup) {
        inputMockup.addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const file = this.files[0];
            if (!validarArquivoImagem(file)) { this.value = ''; return; }
            mostrarPreviewMockup(URL.createObjectURL(file), file.name, '');
        });
    }
    document.getElementById('btnAdicionarArte')?.addEventListener('click', () => adicionarArteUpload());
}

function validarArquivoImagem(file) {
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
        Utils.mostrarNotificacao('Use apenas imagem PNG ou JPG.', 'error');
        return false;
    }
    if (file.size > MAX_TAMANHO_IMAGEM_MB * 1024 * 1024) {
        Utils.mostrarNotificacao(`A imagem deve ter no máximo ${MAX_TAMANHO_IMAGEM_MB}MB.`, 'error');
        return false;
    }
    return true;
}

function mostrarPreviewMockup(src, nomeArquivo, urlDrive) {
    const wrap = document.getElementById('previewMockup');
    const img = document.getElementById('imgPreviewMockup');
    const link = document.getElementById('linkMockupDrive');
    if (!wrap || !img) return;
    img.src = src;
    img.onclick = () => window.open(src, '_blank');
    if (link) {
        if (urlDrive) {
            link.href = urlDrive;
            link.classList.remove('hidden');
        } else {
            link.classList.add('hidden');
        }
    }
    const nomeEl = wrap.querySelector('.imagem-nome-arquivo');
    if (nomeEl) nomeEl.textContent = nomeArquivo || '';
    wrap.classList.remove('hidden');
}

function limparMockup() {
    const input = document.getElementById('inputMockupPedido');
    const wrap = document.getElementById('previewMockup');
    const img = document.getElementById('imgPreviewMockup');
    if (input) input.value = '';
    if (img) img.src = '';
    if (wrap) wrap.classList.add('hidden');
    estadoApp.imagens.mockupUrlDrive = '';
}

function adicionarArteUpload(urlDrive, nomeArquivo) {
    if (typeof urlDrive !== 'string') {
        urlDrive = '';
    }
    if (typeof nomeArquivo !== 'string') {
        nomeArquivo = '';
    }

    const container = document.getElementById('containerArtes');
    if (!container) return;

    const total = container.querySelectorAll('.arte-upload-item').length;
    if (total >= MAX_ARTES) {
        Utils.mostrarNotificacao(`Máximo de ${MAX_ARTES} artes atingido.`, 'error');
        return;
    }

    const num = total + 1;
    const itemId = `arteItem-${Date.now()}`;
    const inputId = `inputArte-${itemId}`;

    const item = document.createElement('div');
    item.className = 'arte-upload-item';
    item.id = itemId;
    item.dataset.urlDrive = urlDrive || '';

    item.innerHTML = `
        <span class="arte-upload-numero">Arte ${num}</span>
        <div class="form-group">
            <label class="form-label" for="${inputId}">Imagem da Arte (PNG ou JPG)</label>
            <input type="file" id="${inputId}" class="form-input arte-input arte-file-input" accept=".png,.jpg,.jpeg,image/png,image/jpeg">
        </div>
        <div class="imagem-preview-wrap hidden arte-preview">
            <img class="imagem-thumb arte-thumb" alt="Arte ${num}">
            ${urlDrive ? `<a href="${urlDrive}" target="_blank" class="imagem-link-drive">Ver no Drive</a>` : ''}
        </div>
        <button type="button" class="btn-remover-imagem" title="Remover arte" onclick="removerArteUpload('${itemId}')">✕</button>
    `;

    container.appendChild(item);

    if (urlDrive && nomeArquivo) {
        const previewWrap = item.querySelector('.arte-preview');
        const thumb = item.querySelector('.arte-thumb');
        if (previewWrap && thumb) {
            thumb.src = urlDrive;
            thumb.onclick = () => window.open(urlDrive, '_blank');
            previewWrap.classList.remove('hidden');
        }
    }

    const inputEl = obterInputArteDoItem(item);
    item._arquivoArtePedido = null;
    if (inputEl) {
        inputEl.addEventListener('change', function () {
            if (!this.files || !this.files[0]) {
                item._arquivoArtePedido = null;
                return;
            }
            const file = this.files[0];
            if (!validarArquivoImagem(file)) {
                this.value = '';
                item._arquivoArtePedido = null;
                return;
            }
            item._arquivoArtePedido = file;
            const previewWrap = item.querySelector('.arte-preview');
            const thumb = item.querySelector('.arte-thumb');
            if (previewWrap && thumb) {
                const localUrl = URL.createObjectURL(file);
                thumb.src = localUrl;
                thumb.onclick = () => window.open(localUrl, '_blank');
                previewWrap.classList.remove('hidden');
                item.dataset.urlDrive = '';
                const driveLink = previewWrap.querySelector('.imagem-link-drive');
                if (driveLink) driveLink.remove();
            }
        });
    }

    atualizarBotaoAdicionarArte();
}

function removerArteUpload(itemId) {
    const item = document.getElementById(itemId);
    if (!item) return;
    item._arquivoArtePedido = null;
    item.remove();
    renumerarArtes();
    atualizarBotaoAdicionarArte();
}

function renumerarArtes() {
    const container = document.getElementById('containerArtes');
    if (!container) return;
    container.querySelectorAll('.arte-upload-item').forEach((item, idx) => {
        const numEl = item.querySelector('.arte-upload-numero');
        if (numEl) numEl.textContent = `Arte ${idx + 1}`;
        const thumb = item.querySelector('.arte-thumb');
        if (thumb) thumb.alt = `Arte ${idx + 1}`;
    });
}

function atualizarBotaoAdicionarArte() {
    const container = document.getElementById('containerArtes');
    const btn = document.getElementById('btnAdicionarArte');
    if (!container || !btn) return;
    const total = container.querySelectorAll('.arte-upload-item').length;
    btn.disabled = total >= MAX_ARTES;
    btn.title = total >= MAX_ARTES ? `Máximo de ${MAX_ARTES} artes` : '';
}

/** Um único input file por bloco de arte; não depende só de .arte-input (minificadores podem colar classes). */
function obterInputArteDoItem(item) {
    if (!item) return null;
    return item.querySelector('input.arte-file-input')
        || item.querySelector('input.arte-input')
        || item.querySelector('input[type="file"]');
}

function obterArquivoLocalArteItem(item, inputArte) {
    if (item && item._arquivoArtePedido instanceof File) return item._arquivoArtePedido;
    if (inputArte && inputArte.files && inputArte.files[0]) return inputArte.files[0];
    return null;
}

/** Com o #containerArtes vazio, coletarImagens não encontra .arte-upload-item. Cria um slot inicial quando o pedido é editável. */
function garantirSlotArteMinimo() {
    if (estadoApp.somenteLeitura) return;
    const container = document.getElementById('containerArtes');
    if (!container || container.querySelector('.arte-upload-item')) return;
    adicionarArteUpload();
}

function lerArquivoBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const base64 = dataUrl.split(',')[1];
            resolve({ base64, tipo: file.type, extensao: file.type === 'image/png' ? 'png' : 'jpg', nome: file.name });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function coletarImagens() {
    const resultado = {
        mockup: null,
        mockupUrlExistente: estadoApp.imagens.mockupUrlDrive || '',
        artes: []
    };

    const inputMockup = document.getElementById('inputMockupPedido');
    if (inputMockup && inputMockup.files && inputMockup.files[0]) {
        try {
            resultado.mockup = await lerArquivoBase64(inputMockup.files[0]);
            resultado.mockupUrlExistente = '';
        } catch (e) {
            console.warn('Erro ao ler mockup:', e);
        }
    }

    const container = document.getElementById('containerArtes');
    if (container) {
        const itens = container.querySelectorAll('.arte-upload-item');
        for (const item of itens) {
            const inputArte = obterInputArteDoItem(item);
            const urlExistente = item.dataset.urlDrive || '';
            const arquivoLocal = obterArquivoLocalArteItem(item, inputArte);
            if (arquivoLocal) {
                try {
                    const arteBase64 = await lerArquivoBase64(arquivoLocal);
                    resultado.artes.push({ ...arteBase64, urlExistente: '' });
                } catch (e) {
                    console.warn('Erro ao ler arte:', e);
                    resultado.artes.push({ urlExistente });
                }
            } else if (urlExistente) {
                resultado.artes.push({ urlExistente });
            }
        }
    }

    const temAlgo = resultado.mockup !== null || resultado.mockupUrlExistente || resultado.artes.length > 0;
    return temAlgo ? resultado : null;
}

function carregarImagensSalvas(pedido) {
    estadoApp.imagens.mockupUrlDrive = pedido.urlMockup || '';
    estadoApp.imagens.artesUrlDrive = pedido.urlArtes || [];

    const container = document.getElementById('containerArtes');
    if (container) container.innerHTML = '';

    if (pedido.urlMockup) {
        const input = document.getElementById('inputMockupPedido');
        if (input) input.value = '';
        mostrarPreviewMockup(pedido.urlMockup, 'Mockup salvo no Drive', pedido.urlMockup);
    } else {
        const wrap = document.getElementById('previewMockup');
        if (wrap) wrap.classList.add('hidden');
    }

    const artes = pedido.urlArtes || [];
    artes.forEach((url) => {
        if (url) adicionarArteUpload(url, 'Arte salva no Drive');
    });

    atualizarBotaoAdicionarArte();
}

function configurarBotaoVoltarPrincipal() {
    const btn = document.getElementById('btnVoltarPrincipal');
    if (!btn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('id') || estadoApp.modoEdicao) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function atualizarID() {
    if (estadoApp.pedidoEmEdicao) return;
    const telefone = document.getElementById('telefone').value;
    const elIdBusca = document.getElementById('idBusca');
    if (telefone) {
        document.getElementById('idPedido').value = Utils.gerarID(telefone);
        if (elIdBusca) elIdBusca.value = Utils.obterIdBusca(telefone);
    } else {
        document.getElementById('idPedido').value = '';
        if (elIdBusca) elIdBusca.value = '';
    }
}

function calcularDataEntrega() {
    const dataPedido = document.getElementById('dataPedido').value;
    const dataEntregaInput = document.getElementById('dataEntrega');
    if (!dataPedido || !dataEntregaInput) return;
    const entrega = Utils.adicionarDias(new Date(dataPedido), CONFIG.CALCULOS.diasParaEntrega);
    dataEntregaInput.value = `${entrega.getFullYear()}-${String(entrega.getMonth() + 1).padStart(2, '0')}-${String(entrega.getDate()).padStart(2, '0')}`;
}

function adicionarProduto() {
    const container = document.getElementById('produtosContainer');
    if (!container) return;
    const produtoId = estadoApp.produtoAtualId++;
    const tipos = Object.keys(CONFIG.TIPOS_PECAS).map((tipo) => `<option value="${tipo}">${tipo}</option>`).join('');
    const malhas = CONFIG.TIPOS_MALHA.map((malha) => `<option value="${malha}">${malha}</option>`).join('');
    const tamanhos = CONFIG.TAMANHOS.map((tam) => `<option value="${tam}">${tam}</option>`).join('');
    const estampas = CONFIG.TIPOS_ESTAMPAS.map((tipo) => `<option value="${tipo}">${tipo}</option>`).join('');
    const cores = CONFIG.QUANTIDADES_CORES_SILK.map((cor) => `<option value="${cor}">${cor}</option>`).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="produto-container" id="produto-${produtoId}" data-produto-id="${produtoId}">
        <div class="produto-header">
          <span
            class="produto-numero produto-nome-editavel"
            id="nomeProduto-${produtoId}"
            contenteditable="true"
            spellcheck="false"
            title="Clique para renomear"
            data-default="📦 PRODUTO #${produtoId}"
            onblur="if(!this.textContent.trim()){this.textContent=this.dataset.default;}"
          >📦 PRODUTO #${produtoId}</span>
          ${produtoId > 1 ? `<button type="button" class="btn-remover-produto" onclick="removerProduto(${produtoId})">🗑️ Remover</button>` : ''}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Tipo de Peça</label>
            <select class="form-select" id="tipoPeca-${produtoId}" onchange="atualizarDetalhesPeca(${produtoId})">
              <option value="">Selecione...</option>${tipos}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label required">Detalhes</label>
            <select class="form-select" id="detalhesPeca-${produtoId}" disabled>
              <option value="">Selecione o tipo primeiro...</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Tipo de Malha</label>
            <select class="form-select" id="tipoMalha-${produtoId}" onchange="calcularCustosProduto(${produtoId})">
              <option value="">Selecione...</option>${malhas}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label required">Cor da Malha</label>
            <input type="text" class="form-input" id="corMalha-${produtoId}">
          </div>
        </div>
        <div class="card-subtitle">📏 Tamanhos e Quantidades</div>
        <div class="tabela-dinamica"><table><tbody id="tamanhosBody-${produtoId}">
          <tr>
            <td><select class="form-select" onchange="calcularTotalPecas()"><option value="">Selecione...</option>${tamanhos}</select></td>
            <td><input type="number" class="form-input" min="0" value="0" onchange="calcularTotalPecas();calcularCustosProduto(${produtoId})"></td>
            <td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaTamanho(this)">❌</button></td>
          </tr>
        </tbody></table></div>
        <button type="button" class="btn btn-small btn-secondary mt-1" onclick="adicionarLinhaTamanho(${produtoId})">➕ Adicionar Tamanho</button>

        <div class="card-subtitle">🎨 Tipos de Estampa</div>
        <div class="tabela-dinamica"><table><tbody id="estampasBody-${produtoId}">
          <tr>
            <td><select class="form-select" onchange="atualizarLocalidadesEstampa(this);calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${estampas}</select></td>
            <td><select class="form-select" disabled onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione o tipo primeiro...</option></select></td>
            <td><select class="form-select quantidade-cores" disabled style="display:none;" onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${cores}</select></td>
            <td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaEstampa(this,${produtoId})">❌</button></td>
          </tr>
        </tbody></table></div>
        <button type="button" class="btn btn-small btn-secondary mt-1" onclick="adicionarLinhaEstampa(${produtoId})">➕ Adicionar Estampa</button>

        <div class="card-subtitle">💰 Cálculo de Custos</div>
        <div class="custos-container">
          <div class="custo-item"><span class="custo-label">Malha:</span><span class="custo-valor" id="custoMalha-${produtoId}">R$ 0,00</span></div>
          <div class="custo-item"><span class="custo-label">Mão de obra:</span><span class="custo-valor" id="custoMaoObra-${produtoId}">R$ 0,00</span></div>
          <div class="custo-item"><span class="custo-label">Estampas:</span><span class="custo-valor" id="custoEstampas-${produtoId}">R$ 0,00</span></div>
          <div class="custo-item"><span class="custo-label">Fixo:</span><span class="custo-valor" id="custoFixo-${produtoId}">R$ 10,00</span></div>
          <div class="custo-item"><span class="custo-label">Total unitário:</span><span class="custo-valor" id="custoTotal-${produtoId}">R$ 0,00</span></div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group"><label class="form-label required">Margem (%)</label><input type="number" class="form-input" id="margemLucro-${produtoId}" min="0" step="0.01" value="${obterMargemPadraoCalc()}" onchange="calcularCustosProduto(${produtoId}, 'margem')"></div>
          <div class="form-group"><label class="form-label">Preço unitário</label><input type="number" class="form-input" id="precoUnitario-${produtoId}" min="0" step="0.01" onchange="calcularCustosProduto(${produtoId}, 'precoUnitario')"></div>
          <div class="form-group"><label class="form-label">Valor total</label><input type="text" class="form-input" id="valorTotalProduto-${produtoId}" disabled></div>
        </div>
      </div>
    `);

    estadoApp.produtos.push({ id: produtoId, valorTotal: 0, custoTotal: 0 });
}

function removerProduto(produtoId) {
    if (!confirm('Deseja realmente remover este produto?')) return;
    document.getElementById(`produto-${produtoId}`)?.remove();
    estadoApp.produtos = estadoApp.produtos.filter((p) => p.id !== produtoId);
    calcularTotalPecas();
    calcularResumoFinanceiro();
}

function atualizarDetalhesPeca(produtoId) {
    const selectTipo = document.getElementById(`tipoPeca-${produtoId}`);
    const selectDetalhes = document.getElementById(`detalhesPeca-${produtoId}`);
    if (!selectTipo || !selectDetalhes) return;
    const detalhes = CONFIG.TIPOS_PECAS[selectTipo.value] || [];
    selectDetalhes.innerHTML = '<option value="">Selecione...</option>' + detalhes.map((d) => `<option value="${d}">${d}</option>`).join('');
    selectDetalhes.disabled = detalhes.length === 0;
}

function adicionarLinhaTamanho(produtoId) {
    const tbody = document.getElementById(`tamanhosBody-${produtoId}`);
    if (!tbody) return;
    const opcoes = CONFIG.TAMANHOS.map((tam) => `<option value="${tam}">${tam}</option>`).join('');
    tbody.insertAdjacentHTML('beforeend', `<tr><td><select class="form-select" onchange="calcularTotalPecas()"><option value="">Selecione...</option>${opcoes}</select></td><td><input type="number" class="form-input" min="0" value="0" onchange="calcularTotalPecas();calcularCustosProduto(${produtoId})"></td><td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaTamanho(this)">❌</button></td></tr>`);
}

function removerLinhaTamanho(btn) {
    const tr = btn.closest('tr');
    const tbody = tr?.parentElement;
    if (!tbody || tbody.children.length <= 1) return Utils.mostrarNotificacao('Deve haver pelo menos uma linha de tamanho.', 'error');
    tr.remove();
    calcularTotalPecas();
}

function calcularTotalPecas() {
    let total = 0;
    document.querySelectorAll('[id^="tamanhosBody-"] input[type="number"]').forEach((input) => { total += parseInt(input.value, 10) || 0; });
    const el = document.getElementById('totalPecas');
    if (el) el.value = total;
}

function adicionarLinhaEstampa(produtoId) {
    const tbody = document.getElementById(`estampasBody-${produtoId}`);
    if (!tbody) return;
    const tipos = CONFIG.TIPOS_ESTAMPAS.map((tipo) => `<option value="${tipo}">${tipo}</option>`).join('');
    const cores = CONFIG.QUANTIDADES_CORES_SILK.map((cor) => `<option value="${cor}">${cor}</option>`).join('');
    tbody.insertAdjacentHTML('beforeend', `<tr><td><select class="form-select" onchange="atualizarLocalidadesEstampa(this);calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${tipos}</select></td><td><select class="form-select" disabled onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione o tipo primeiro...</option></select></td><td><select class="form-select quantidade-cores" disabled style="display:none;" onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${cores}</select></td><td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaEstampa(this,${produtoId})">❌</button></td></tr>`);
}

function removerLinhaEstampa(btn, produtoId) {
    btn.closest('tr')?.remove();
    calcularCustosProduto(produtoId);
}

function atualizarLocalidadesEstampa(selectTipo) {
    const tr = selectTipo.closest('tr');
    const selects = tr ? tr.querySelectorAll('select') : [];
    const selectLocalidade = selects.length >= 2 ? selects[1] : null;
    const selectCores = tr ? tr.querySelector('.quantidade-cores') : null;
    if (!selectLocalidade || !selectCores) return;

    const tipo = selectTipo.value;
    const localidades = [...CONFIG.LOCALIDADES_FRENTE, ...CONFIG.LOCALIDADES_COSTAS, ...CONFIG.LOCALIDADES_MANGA];
    if (!tipo) {
        selectLocalidade.disabled = true;
        selectLocalidade.innerHTML = '<option value="">Selecione o tipo primeiro...</option>';
        selectCores.style.display = 'none';
        selectCores.disabled = true;
        return;
    }

    const lista = tipo === 'Sublimação Total (Full Print)' ? ['Total (Full Print)'] : localidades;
    selectLocalidade.disabled = false;
    selectLocalidade.innerHTML = '<option value="">Selecione...</option>' + lista.map((loc) => `<option value="${loc}">${loc}</option>`).join('');

    if (tipo === 'Silk Screen') {
        selectCores.style.display = 'block';
        selectCores.disabled = false;
    } else {
        selectCores.style.display = 'none';
        selectCores.disabled = true;
    }
}

function normalizarTipoMalhaParaCalculo(tipoMalha) {
    const aliases = {
        'Tricoline Ibiza (Composição)': 'Piquet (50% Algodão 50% Poliéster)'
    };
    return aliases[tipoMalha] || tipoMalha;
}

function normalizarTamanhoParaCalculo(tamanho) {
    const aliases = {
        G1: 'EG',
        G2: 'EG',
        G3: 'EG',
        G4: 'EG',
        'G1 (BL)': 'EG',
        'G2 (BL)': 'EG',
        'G3 (BL)': 'EG',
        'G4 (BL)': 'EG'
    };
    return aliases[tamanho] || tamanho;
}

function calcularFatorTamanhoProduto(produtoId) {
    let totalQtd = 0;
    let somaPonderada = 0;
    document.querySelectorAll(`#tamanhosBody-${produtoId} tr`).forEach((tr) => {
        const tamanhoRaw = tr.querySelector('select')?.value || '';
        const quantidade = parseInt(tr.querySelector('input[type="number"]')?.value || '0', 10) || 0;
        if (!quantidade) return;
        const fator = obterFatorTamanhoDaConfig(tamanhoRaw);
        totalQtd += quantidade;
        somaPonderada += fator * quantidade;
    });
    if (!totalQtd) return 1;
    return somaPonderada / totalQtd;
}

function obterValorNumericoInput(input) {
    if (!input) return NaN;
    const bruto = String(input.value || '').trim();
    if (!bruto) return NaN;
    const normalizado = bruto.replace(',', '.');
    return parseFloat(normalizado);
}

function calcularCustosProduto(produtoId, origem = 'margem') {
    const cfg = window.CONFIG_CALCULO || { malhas: {}, maoObra: {} };
    const custoMalhaMap = cfg.malhas;
    const custoMaoObraMap = cfg.maoObra;

    const tipoMalha = normalizarTipoMalhaParaCalculo(document.getElementById(`tipoMalha-${produtoId}`)?.value || '');
    const tipoPeca = document.getElementById(`tipoPeca-${produtoId}`)?.value || '';
    const margemInput = document.getElementById(`margemLucro-${produtoId}`);
    const precoUnitarioInput = document.getElementById(`precoUnitario-${produtoId}`);
    const margem = parseFloat(margemInput?.value || '100');
    const quantidade = obterQuantidadeProduto(produtoId);
    const fatorTamanho = calcularFatorTamanhoProduto(produtoId);

    const custoMalha = (custoMalhaMap[tipoMalha] || 0) * fatorTamanho;
    const custoMaoObra = custoMaoObraMap[tipoPeca] || 0;
    const custoEstampas = calcularCustoEstampas(produtoId);
    const custoFixo = obterCustoFixoCalc();
    const custoTotal = custoMalha + custoMaoObra + custoEstampas + custoFixo;
    let precoUnitario = custoTotal * (1 + margem / 100);

    if (origem === 'precoUnitario') {
        const precoDigitado = obterValorNumericoInput(precoUnitarioInput);
        if (!Number.isNaN(precoDigitado) && precoDigitado >= 0) {
            precoUnitario = precoDigitado;
            if (custoTotal > 0 && margemInput) {
                const margemCalculada = ((precoUnitario / custoTotal) - 1) * 100;
                margemInput.value = Utils.arredondar(margemCalculada).toFixed(2);
            }
        }
    }

    const valorTotal = precoUnitario * quantidade;

    document.getElementById(`custoMalha-${produtoId}`).textContent = Utils.formatarMoeda(custoMalha);
    document.getElementById(`custoMaoObra-${produtoId}`).textContent = Utils.formatarMoeda(custoMaoObra);
    document.getElementById(`custoEstampas-${produtoId}`).textContent = Utils.formatarMoeda(custoEstampas);
    document.getElementById(`custoFixo-${produtoId}`).textContent = Utils.formatarMoeda(custoFixo);
    document.getElementById(`custoTotal-${produtoId}`).textContent = Utils.formatarMoeda(custoTotal);
    if (precoUnitarioInput) precoUnitarioInput.value = Utils.arredondar(precoUnitario).toFixed(2);
    document.getElementById(`valorTotalProduto-${produtoId}`).value = Utils.formatarMoeda(valorTotal);

    const item = estadoApp.produtos.find((p) => p.id === produtoId);
    if (item) {
        item.custoTotal = custoTotal;
        item.valorTotal = valorTotal;
    }
    calcularResumoFinanceiro();
}

function obterQuantidadeProduto(produtoId) {
    let qtd = 0;
    document.querySelectorAll(`#tamanhosBody-${produtoId} input[type="number"]`).forEach((input) => { qtd += parseInt(input.value, 10) || 0; });
    return qtd;
}

function calcularCustoEstampas(produtoId) {
    const est = (window.CONFIG_CALCULO && window.CONFIG_CALCULO.estampas) || CONFIG_CALCULO_FALLBACK.estampas;
    const adicSilk = obterAdicionalCorSilkCalc();
    let total = 0;
    document.querySelectorAll(`#estampasBody-${produtoId} tr`).forEach((tr) => {
        const selects = tr.querySelectorAll('select');
        const tipo = selects[0]?.value || '';
        const local = selects[1]?.value || '';
        const corSilk = tr.querySelector('.quantidade-cores')?.value || '';
        if (!tipo || !local) return;
        const ev = est[tipo] || { valor_10x10: 0, valor_10x6: 0, valor_a4: 0, valor_a3: 0, valor_full_print: 0 };
        const localLower = local.toLowerCase();
        const isA3 = localLower.includes('a3');
        const isA4 = localLower.includes('a4');
        const is10x6 = localLower.includes('10x6') || localLower.includes('manga') || localLower.includes('ombro') || localLower.includes('pescoço');
        let valor = 0;
        if (tipo === 'Silk Screen') {
            valor = isA3 ? ev.valor_a3 : isA4 ? ev.valor_a4 : is10x6 ? ev.valor_10x6 : ev.valor_10x10;
            const numCores = parseInt(corSilk, 10);
            if (!Number.isNaN(numCores) && numCores > 1) valor += numCores * adicSilk;
        } else if (tipo === 'DTF (Direct to Film)') valor = isA3 ? ev.valor_a3 : isA4 ? ev.valor_a4 : is10x6 ? ev.valor_10x6 : ev.valor_10x10;
        else if (tipo === 'Bordado') valor = isA3 ? ev.valor_a3 : isA4 ? ev.valor_a4 : is10x6 ? ev.valor_10x6 : ev.valor_10x10;
        else if (tipo === 'Sublimação Localizada') valor = isA3 ? ev.valor_a3 : isA4 ? ev.valor_a4 : is10x6 ? ev.valor_10x6 : ev.valor_10x10;
        else if (tipo === 'Sublimação Total (Full Print)') valor = ev.valor_full_print;
        total += valor;
    });
    return total;
}

function calcularResumoFinanceiro() {
    calcularTotalPecas();
    let totalPedido = 0;
    estadoApp.produtos.forEach((produto) => {
        totalPedido += Utils.limparMoeda(document.getElementById(`valorTotalProduto-${produto.id}`)?.value || '0');
    });
    const valorEntrada = parseFloat(document.getElementById('valorEntrada').value || '0');
    const restante = totalPedido - valorEntrada;
    document.getElementById('resumoTotalPedido').textContent = Utils.formatarMoeda(totalPedido);
    document.getElementById('resumoRestante').textContent = Utils.formatarMoeda(restante);
}

function normalizarDataInput(data) {
    if (!data) return '';
    if (typeof data === 'string') {
        const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = data instanceof Date ? data : new Date(data);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeAttrIndex(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtmlIndex(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function popularOpcoesStatusOperacionalIndex() {
    const select = document.getElementById('statusOperacionalIndex');
    if (!select || select.options.length > 0) return;
    select.innerHTML = CONFIG.STATUS_PEDIDO.map((status) => `<option value="${escapeAttrIndex(status)}">${escapeHtmlIndex(status)}</option>`).join('');
}

function garantirOpcaoStatusIndex(valorPlanilha) {
    const select = document.getElementById('statusOperacionalIndex');
    if (!select || !valorPlanilha) return;
    const v = String(valorPlanilha);
    const existe = Array.from(select.options).some((opt) => opt.value === v);
    if (!existe) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `${v} (planilha)`;
        select.appendChild(opt);
    }
}

function popularOpcoesStatusProducaoIndex() {
    const select = document.getElementById('etapaProducaoAtual');
    if (!select || select.options.length > 0) return;
    select.innerHTML = (CONFIG.STATUS_PRODUCAO || []).map((s) => `<option value="${escapeAttrIndex(s)}">${escapeHtmlIndex(s)}</option>`).join('');
}

function garantirOpcaoStatusProducaoIndex(valorPlanilha) {
    const select = document.getElementById('etapaProducaoAtual');
    if (!select || !valorPlanilha) return;
    const v = String(valorPlanilha);
    const existe = Array.from(select.options).some((opt) => opt.value === v);
    if (!existe) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
    }
}

function pedidoSomenteLeituraPorStatus(pedido) {
    const s = String(pedido?.statusOperacional || '').trim().toLowerCase();
    if (s === 'entregue' || s === 'finalizado') return true;
    if (s === 'cancelado') return true;
    return false;
}

function aplicarUIModoEdicao() {
    document.body.classList.add('modo-edicao-index');
    document.getElementById('secaoStatusEdicao')?.classList.remove('hidden');
    const titulo = document.getElementById('tituloPrincipalIndex');
    if (titulo) titulo.textContent = '✏️ Editar pedido';
    const btn = document.getElementById('btnSalvar');
    if (btn && btn.dataset.labelEdicao) btn.textContent = btn.dataset.labelEdicao;
    configurarBotaoVoltarPrincipal();
}

function aplicarUIModoVisualizacao() {
    document.body.classList.add('modo-edicao-index');
    document.getElementById('secaoStatusEdicao')?.classList.remove('hidden');
    const titulo = document.getElementById('tituloPrincipalIndex');
    if (titulo) titulo.textContent = 'Visualizar pedido';
    configurarBotaoVoltarPrincipal();
}

function aplicarSomenteLeituraIndex() {
    estadoApp.somenteLeitura = true;
    document.body.classList.add('pedido-somente-leitura');
    document.getElementById('faixaSomenteLeitura')?.classList.remove('hidden');
    document.querySelectorAll('#formPedido input, #formPedido select, #formPedido textarea').forEach((el) => {
        el.disabled = true;
    });
}

function desativarSomenteLeituraIndex() {
    estadoApp.somenteLeitura = false;
    document.body.classList.remove('pedido-somente-leitura');
    document.getElementById('faixaSomenteLeitura')?.classList.add('hidden');
    document.querySelectorAll('#formPedido input, #formPedido select, #formPedido textarea').forEach((el) => {
        el.disabled = false;
    });
    ['idPedido', 'idBusca', 'totalPecas'].forEach((id) => {
        const n = document.getElementById(id);
        if (n) n.disabled = true;
    });
    document.querySelectorAll('[id^="valorTotalProduto-"]').forEach((el) => {
        el.disabled = true;
    });
}

function desativarUIModoEdicaoIndex() {
    document.body.classList.remove('modo-edicao-index');
    document.getElementById('secaoStatusEdicao')?.classList.add('hidden');
    const titulo = document.getElementById('tituloPrincipalIndex');
    if (titulo) titulo.textContent = '🏠 Cadastro de Pedidos';
    const btn = document.getElementById('btnSalvar');
    if (btn && btn.dataset.labelNovo) btn.textContent = btn.dataset.labelNovo;
    desativarSomenteLeituraIndex();
    configurarBotaoVoltarPrincipal();
}

function atualizarSecaoImpressaoPedido() {
    const sec = document.getElementById('secaoImpressaoPedido');
    if (!sec) return;
    const id = (document.getElementById('idPedido')?.value || '').trim();
    const pedidoPersistidoOuCarregado = Boolean(estadoApp.modoEdicao && estadoApp.idEdicao);
    sec.classList.toggle('hidden', !id || !pedidoPersistidoOuCarregado);
}

function sincronizarBotoesRemocaoProdutosIndex() {
    const nodes = document.querySelectorAll('.produto-container');
    nodes.forEach((el) => {
        const produtoId = parseInt(el.getAttribute('data-produto-id'), 10);
        const header = el.querySelector('.produto-header');
        let btn = el.querySelector('.btn-remover-produto');
        if (nodes.length > 1) {
            if (!btn && header) {
                header.insertAdjacentHTML(
                    'beforeend',
                    `<button type="button" class="btn-remover-produto" onclick="removerProduto(${produtoId})">🗑️ Remover</button>`
                );
            }
        } else if (btn) btn.remove();
    });
}

function reconstruirLinhasTamanhos(produtoId, linhas) {
    const tbody = document.getElementById(`tamanhosBody-${produtoId}`);
    if (!tbody) return;
    const opcoes = CONFIG.TAMANHOS.map((tam) => `<option value="${tam}">${tam}</option>`).join('');
    const dados = Array.isArray(linhas) && linhas.length ? linhas : [{ tamanho: '', quantidade: 0 }];
    tbody.innerHTML = '';
    dados.forEach((linha) => {
        tbody.insertAdjacentHTML(
            'beforeend',
            `<tr><td><select class="form-select" onchange="calcularTotalPecas()"><option value="">Selecione...</option>${opcoes}</select></td><td><input type="number" class="form-input" min="0" value="0" onchange="calcularTotalPecas();calcularCustosProduto(${produtoId})"></td><td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaTamanho(this)">❌</button></td></tr>`
        );
        const tr = tbody.lastElementChild;
        const sel = tr.querySelector('select');
        const inp = tr.querySelector('input[type="number"]');
        if (linha.tamanho) sel.value = linha.tamanho;
        inp.value = String(linha.quantidade ?? 0);
    });
}

function reconstruirLinhasEstampas(produtoId, linhas) {
    const tbody = document.getElementById(`estampasBody-${produtoId}`);
    if (!tbody) return;
    const tipos = CONFIG.TIPOS_ESTAMPAS.map((tipo) => `<option value="${tipo}">${tipo}</option>`).join('');
    const cores = CONFIG.QUANTIDADES_CORES_SILK.map((cor) => `<option value="${cor}">${cor}</option>`).join('');
    const dados = Array.isArray(linhas) && linhas.length ? linhas : [{ tipo: '', localidade: '', quantidadeCores: '' }];
    tbody.innerHTML = '';
    dados.forEach((linha) => {
        tbody.insertAdjacentHTML(
            'beforeend',
            `<tr><td><select class="form-select" onchange="atualizarLocalidadesEstampa(this);calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${tipos}</select></td><td><select class="form-select" disabled onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione o tipo primeiro...</option></select></td><td><select class="form-select quantidade-cores" disabled style="display:none;" onchange="calcularCustosProduto(${produtoId})"><option value="">Selecione...</option>${cores}</select></td><td><button type="button" class="btn btn-small btn-danger" onclick="removerLinhaEstampa(this,${produtoId})">❌</button></td></tr>`
        );
        const tr = tbody.lastElementChild;
        const selectTipo = tr.querySelectorAll('select')[0];
        if (linha.tipo) {
            selectTipo.value = linha.tipo;
            atualizarLocalidadesEstampa(selectTipo);
            const selectLoc = tr.querySelectorAll('select')[1];
            if (linha.localidade && selectLoc) selectLoc.value = linha.localidade;
            if (linha.tipo === 'Silk Screen' && linha.quantidadeCores != null && linha.quantidadeCores !== '') {
                const sc = tr.querySelector('.quantidade-cores');
                if (sc) sc.value = String(linha.quantidadeCores);
            }
        }
    });
}

function preencherFormularioCompleto(pedido) {
    const container = document.getElementById('produtosContainer');
    if (container) container.innerHTML = '';
    estadoApp.produtos = [];
    estadoApp.produtoAtualId = 1;

    estadoApp.pedidoEmEdicao = pedido.id;
    estadoApp.modoEdicao = true;
    estadoApp.idEdicao = pedido.id != null ? String(pedido.id) : '';

    document.getElementById('idPedido').value = pedido.id || '';
    const elIb = document.getElementById('idBusca');
    if (elIb) elIb.value = pedido.idBusca || Utils.obterIdBusca(pedido.cliente?.telefone || '');
    document.getElementById('nomeCliente').value = pedido.cliente?.nome || '';
    document.getElementById('telefone').value = pedido.cliente?.telefone || '';
    document.getElementById('dataPedido').value = normalizarDataInput(pedido.datas?.pedido);
    document.getElementById('dataEntrega').value = normalizarDataInput(pedido.datas?.entrega);
    document.getElementById('totalPecas').value = pedido.totalPecas || 0;
    document.getElementById('observacoes').value = pedido.observacoes || '';
    document.getElementById('resumoTotalPedido').textContent = Utils.formatarMoeda(pedido.financeiro?.totalPedido || 0);
    document.getElementById('valorEntrada').value = pedido.financeiro?.valorEntrada ?? 0;
    document.getElementById('resumoRestante').textContent = Utils.formatarMoeda(pedido.financeiro?.restante || 0);
    const resp = document.getElementById('responsavelAtual');
    if (resp) resp.value = pedido.responsavelAtual || 'ISABELA SIRAY';
    const tag = document.getElementById('tagPedido');
    if (tag) tag.value = pedido.tagPedido || 'PEDIDO';

    popularOpcoesStatusOperacionalIndex();
    const statusAtual = pedido.statusOperacional || CONFIG.STATUS_PEDIDO[0];
    garantirOpcaoStatusIndex(statusAtual);
    const selStatus = document.getElementById('statusOperacionalIndex');
    if (selStatus) selStatus.value = statusAtual;

    popularOpcoesStatusProducaoIndex();
    const statusProd = pedido.etapaProducaoAtual || (CONFIG.STATUS_PRODUCAO && CONFIG.STATUS_PRODUCAO[0]) || '';
    garantirOpcaoStatusProducaoIndex(statusProd);
    const selProd = document.getElementById('etapaProducaoAtual');
    if (selProd) selProd.value = statusProd;

    const listaProdutos = Array.isArray(pedido.produtos) && pedido.produtos.length ? pedido.produtos : [{}];
    listaProdutos.forEach((p) => {
        adicionarProduto();
        const pid = estadoApp.produtos[estadoApp.produtos.length - 1].id;
        const nomeEl = document.getElementById(`nomeProduto-${pid}`);
        if (nomeEl && p.nomeProduto) nomeEl.textContent = p.nomeProduto;
        const tipoPecaEl = document.getElementById(`tipoPeca-${pid}`);
        if (tipoPecaEl && p.tipoPeca) tipoPecaEl.value = p.tipoPeca;
        atualizarDetalhesPeca(pid);
        const detEl = document.getElementById(`detalhesPeca-${pid}`);
        const det = p.detalhesPeca || p.detalhePeca || '';
        if (detEl && det) detEl.value = det;
        const tm = document.getElementById(`tipoMalha-${pid}`);
        if (tm && p.tipoMalha) tm.value = p.tipoMalha;
        const cm = document.getElementById(`corMalha-${pid}`);
        if (cm) cm.value = p.corMalha || '';
        reconstruirLinhasTamanhos(pid, p.tamanhos);
        reconstruirLinhasEstampas(pid, p.estampas);
        const margem = document.getElementById(`margemLucro-${pid}`);
        if (margem) {
            const m = p.margemLucro;
            margem.value = m != null && m !== '' ? String(m) : String(obterMargemPadraoCalc());
        }
        calcularCustosProduto(pid);
    });

    sincronizarBotoesRemocaoProdutosIndex();
    calcularTotalPecas();
    calcularResumoFinanceiro();
    preencherListaPersonalizacao(pedido.listaPersonalizacao || null);
    carregarImagensSalvas(pedido);
}

async function recarregarPedidoAposSalvar() {
    const id = String(estadoApp.idEdicao || document.getElementById('idPedido')?.value || '').trim();
    if (!id || window.location.protocol === 'file:') return;
    try {
        const resposta = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=buscarPedido&acao=buscarPedido&termo=${encodeURIComponent(id)}&_ts=${Date.now()}`);
        const texto = await resposta.text();
        let resultado;
        try {
            resultado = JSON.parse(texto);
        } catch (parseErr) {
            console.error('buscarPedido: resposta não é JSON', texto.substring(0, 300));
            return;
        }
        if (!resultado.sucesso || !resultado.pedido) throw new Error(resultado.erro || 'Pedido não encontrado');
        estadoApp.modoEdicao = true;
        estadoApp.idEdicao = String(resultado.pedido.id != null ? resultado.pedido.id : id);
        preencherFormularioCompleto(resultado.pedido);
        estadoApp.somenteLeitura = pedidoSomenteLeituraPorStatus(resultado.pedido);
        if (estadoApp.somenteLeitura) {
            aplicarUIModoVisualizacao();
            aplicarSomenteLeituraIndex();
        } else {
            desativarSomenteLeituraIndex();
            aplicarUIModoEdicao();
        }
        garantirSlotArteMinimo();
    } catch (e) {
        console.error(e);
        Utils.mostrarNotificacao('Salvo. Se os dados não baterem, atualize a página (F5) ou confira o deploy do Apps Script.', 'info');
    }
}

async function salvarPedido() {
    if (estadoApp.somenteLeitura) {
        Utils.mostrarNotificacao('Este pedido não pode ser alterado.', 'error');
        return;
    }
    if (!validarFormulario()) return Utils.mostrarNotificacao('Preencha corretamente os campos obrigatórios.', 'error');
    if (!CONFIG.APPS_SCRIPT_URL) return Utils.mostrarNotificacao('Configure a URL do Apps Script em config.js.', 'error');
    if (window.location.protocol === 'file:') {
        Utils.mostrarNotificacao('Abra o sistema via localhost para evitar bloqueio CORS.', 'error');
        return;
    }

    mostrarLoading(estadoApp.modoEdicao ? 'Salvando alterações...' : 'Salvando pedido...');
    try {
        const dados = coletarDadosFormulario();
        const imagens = await coletarImagens();
        const temImagensNovas = imagens !== null && (imagens.mockup !== null || imagens.artes.length > 0);

        if (temImagensNovas) {
            mostrarLoading('Enviando imagens... (pode demorar)');
        }

        if (estadoApp.modoEdicao && estadoApp.idEdicao) {
            const payload = {
                action: 'salvarPedido',
                acao: 'salvarPedido',
                dados,
                modoEdicao: 'true',
                idEdicao: String(estadoApp.idEdicao),
                imagens: temImagensNovas ? imagens : null
            };
            const resposta = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const textoResp = await resposta.text();
            let resultado;
            try {
                resultado = JSON.parse(textoResp);
            } catch (parseJsonErr) {
                console.error('salvarPedido: resposta não é JSON', textoResp.substring(0, 400));
                throw new Error('Resposta inválida do servidor. Verifique URL do Apps Script e deploy.');
            }
            if (!resultado.sucesso) throw new Error(resultado.erro || 'Falha ao salvar');
            if (resultado.operacao === 'criado') {
                Utils.mostrarNotificacao('Atenção: foi criado um novo registro em vez de atualizar. Verifique o ID na planilha.', 'error');
                return;
            }
            estadoApp.pedidoEmEdicao = resultado.id != null ? String(resultado.id) : estadoApp.idEdicao;
            if (resultado.id != null) {
                estadoApp.idEdicao = String(resultado.id);
                document.getElementById('idPedido').value = estadoApp.idEdicao;
            }
            if (resultado.aviso) Utils.mostrarNotificacao(resultado.aviso, 'info');
            Utils.mostrarNotificacao('Alterações salvas com sucesso!', 'success');
            atualizarSecaoImpressaoPedido();
            await recarregarPedidoAposSalvar();
            return;
        }

        const resposta = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'salvarPedido',
                    acao: 'salvarPedido',
                    dados,
                    imagens: temImagensNovas ? imagens : null
                })
            });
        const textoRespNovo = await resposta.text();
        let resultado;
        try {
            resultado = JSON.parse(textoRespNovo);
        } catch (parseJsonErrNovo) {
            console.error('salvarPedido: resposta não é JSON', textoRespNovo.substring(0, 400));
            throw new Error('Resposta inválida do servidor. Verifique URL do Apps Script e deploy.');
        }
        if (!resultado.sucesso) throw new Error(resultado.erro || 'Falha ao salvar');
        if (resultado.id != null && String(resultado.id).trim() !== '') {
            const idSrv = String(resultado.id);
            document.getElementById('idPedido').value = idSrv;
            estadoApp.pedidoEmEdicao = idSrv;
            estadoApp.modoEdicao = true;
            estadoApp.idEdicao = idSrv;
            const elIb = document.getElementById('idBusca');
            if (elIb && !elIb.value) elIb.value = Utils.obterIdBusca(document.getElementById('telefone').value);
            aplicarUIModoEdicao();
        } else {
            estadoApp.pedidoEmEdicao = resultado.id || dados.id;
        }
        Utils.mostrarNotificacao('Pedido salvo com sucesso!', 'success');
        atualizarSecaoImpressaoPedido();
    } catch (erro) {
        console.error(erro);
        const msg = erro && erro.message ? erro.message : (estadoApp.modoEdicao ? 'Erro ao salvar alterações.' : 'Erro ao salvar pedido.');
        Utils.mostrarNotificacao(msg, 'error');
    } finally {
        esconderLoading();
    }
}

function validarFormulario() {
    if (!Utils.validarCampoObrigatorio(document.getElementById('nomeCliente').value)) return false;
    if (!Utils.validarTelefone(document.getElementById('telefone').value)) return false;
    if (!Utils.validarCampoObrigatorio(document.getElementById('dataEntrega').value)) return false;
    return estadoApp.produtos.length > 0;
}


function lerEtapaDoFormulario() {
    const sel = document.getElementById('etapaProducaoAtual');
    return sel ? (sel.value || (CONFIG.STATUS_PRODUCAO && CONFIG.STATUS_PRODUCAO[0]) || '') : '';
}

function coletarDadosFormulario() {
    const totalPedido = Utils.limparMoeda(document.getElementById('resumoTotalPedido').textContent);
    const valorEntrada = parseFloat(document.getElementById('valorEntrada').value || '0');
    const tel = document.getElementById('telefone').value;
    const etapaProducaoAtual = lerEtapaDoFormulario();
    const produtosLimpos = estadoApp.produtos.map((p) => coletarProduto(p.id));
    const base = {
        id: document.getElementById('idPedido').value || Utils.gerarID(tel),
        idBusca: Utils.obterIdBusca(tel),
        cliente: { nome: document.getElementById('nomeCliente').value, telefone: tel },
        datas: { pedido: document.getElementById('dataPedido').value, entrega: document.getElementById('dataEntrega').value },
        totalPecas: parseInt(document.getElementById('totalPecas').value || '0', 10),
        observacoes: document.getElementById('observacoes').value,
        responsavelAtual: document.getElementById('responsavelAtual')?.value || 'ISABELA SIRAY',
        tagPedido: document.getElementById('tagPedido')?.value || 'PEDIDO',
        financeiro: { totalPedido, valorEntrada, restante: totalPedido - valorEntrada },
        produtos: produtosLimpos,
        listaPersonalizacao: coletarListaPersonalizacao()
    };

    if (estadoApp.modoEdicao && estadoApp.idEdicao) {
        return {
            ...base,
            id: String(estadoApp.idEdicao),
            idBusca: document.getElementById('idBusca')?.value || Utils.obterIdBusca(tel) || base.idBusca,
            atualizacao: true,
            modoEdicao: true,
            statusOperacional: document.getElementById('statusOperacionalIndex')?.value || CONFIG.STATUS_PEDIDO[0],
            etapaProducaoAtual
        };
    }

    return {
        ...base,
        statusOperacional: 'Novo pedido',
        etapaProducaoAtual
    };
}

function coletarProduto(produtoId) {
    const precoUnitarioInput = document.getElementById(`precoUnitario-${produtoId}`);
    const precoUnitarioNumero = obterValorNumericoInput(precoUnitarioInput);
    const nomeEl = document.getElementById(`nomeProduto-${produtoId}`);
    const nomeProduto = nomeEl ? (nomeEl.textContent.trim() || nomeEl.dataset.default) : `📦 PRODUTO #${produtoId}`;
    const produto = {
        numero: produtoId,
        nomeProduto,
        tipoPeca: document.getElementById(`tipoPeca-${produtoId}`)?.value || '',
        detalhesPeca: document.getElementById(`detalhesPeca-${produtoId}`)?.value || '',
        tipoMalha: document.getElementById(`tipoMalha-${produtoId}`)?.value || '',
        corMalha: document.getElementById(`corMalha-${produtoId}`)?.value || '',
        margemLucro: parseFloat(document.getElementById(`margemLucro-${produtoId}`)?.value || '0'),
        precoUnitario: Number.isNaN(precoUnitarioNumero) ? 0 : precoUnitarioNumero,
        valorTotal: Utils.limparMoeda(document.getElementById(`valorTotalProduto-${produtoId}`)?.value || '0'),
        custos: {
            malha: Utils.limparMoeda(document.getElementById(`custoMalha-${produtoId}`)?.textContent || '0'),
            maoObra: Utils.limparMoeda(document.getElementById(`custoMaoObra-${produtoId}`)?.textContent || '0'),
            estampas: Utils.limparMoeda(document.getElementById(`custoEstampas-${produtoId}`)?.textContent || '0'),
            fixo: Utils.limparMoeda(document.getElementById(`custoFixo-${produtoId}`)?.textContent || '0'),
            total: Utils.limparMoeda(document.getElementById(`custoTotal-${produtoId}`)?.textContent || '0')
        },
        tamanhos: [],
        estampas: []
    };

    document.querySelectorAll(`#tamanhosBody-${produtoId} tr`).forEach((tr) => {
        const tamanho = tr.querySelector('select')?.value;
        const quantidade = parseInt(tr.querySelector('input[type="number"]')?.value || '0', 10);
        if (tamanho && quantidade > 0) produto.tamanhos.push({ tamanho, quantidade });
    });

    document.querySelectorAll(`#estampasBody-${produtoId} tr`).forEach((tr) => {
        const selects = tr.querySelectorAll('select');
        const tipo = selects[0]?.value;
        const localidade = selects[1]?.value;
        const quantidadeCores = tr.querySelector('.quantidade-cores')?.value || '';
        if (tipo && localidade) produto.estampas.push({ tipo, localidade, quantidadeCores });
    });
    return produto;
}

function abrirModalBusca() {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="modalBusca"><div class="modal-content"><div class="modal-header"><h3 class="modal-title">🔍 Buscar Pedido</h3><button class="btn-close-modal" onclick="fecharModalBusca()">✖</button></div><div class="form-group"><label class="form-label">ID ou Nome</label><input type="text" class="form-input" id="inputBusca" placeholder="Digite para buscar"></div><div class="btn-group"><button class="btn btn-primary" onclick="buscarPedido()">Buscar</button><button class="btn btn-secondary" onclick="fecharModalBusca()">Cancelar</button></div></div></div>`);
    setTimeout(() => document.getElementById('modalBusca')?.classList.add('show'), 10);
}

function fecharModalBusca() {
    const modal = document.getElementById('modalBusca');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 200);
}

async function buscarPedido() {
    const termo = document.getElementById('inputBusca')?.value?.trim();
    if (!termo) return Utils.mostrarNotificacao('Digite um termo para busca.', 'error');
    if (window.location.protocol === 'file:') return Utils.mostrarNotificacao('Abra o sistema via localhost para evitar CORS.', 'error');

    mostrarLoading('Buscando pedido...');
    try {
        const resposta = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=buscarPedido&acao=buscarPedido&termo=${encodeURIComponent(termo)}`);
        const resultado = await resposta.json();
        if (!resultado.sucesso || !resultado.pedido) throw new Error('Pedido não encontrado');
        fecharModalBusca();
        window.open(`index.html?id=${encodeURIComponent(resultado.pedido.id)}`, '_blank', 'noopener,noreferrer');
        Utils.mostrarNotificacao('Abrindo pedido para edição.', 'success');
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Não foi possível localizar o pedido.', 'error');
    } finally {
        esconderLoading();
    }
}

function limparFormulario() {
    document.getElementById('formPedido').reset();
    const elIb = document.getElementById('idBusca');
    if (elIb) elIb.value = '';
    document.getElementById('produtosContainer').innerHTML = '';
    estadoApp.produtos = [];
    estadoApp.produtoAtualId = 1;
    estadoApp.pedidoEmEdicao = null;
    estadoApp.modoEdicao = false;
    estadoApp.idEdicao = null;
    estadoApp.somenteLeitura = false;
    estadoApp.imagens = { mockupUrlDrive: '', artesUrlDrive: [] };
    document.getElementById('resumoTotalPedido').textContent = 'R$ 0,00';
    document.getElementById('resumoRestante').textContent = 'R$ 0,00';
    const containerArtes = document.getElementById('containerArtes');
    if (containerArtes) containerArtes.innerHTML = '';
    const previewMockup = document.getElementById('previewMockup');
    if (previewMockup) previewMockup.classList.add('hidden');
    atualizarBotaoAdicionarArte();
    garantirSlotArteMinimo();
    desativarUIModoEdicaoIndex();
    configurarValoresPadraoFormulario();
    adicionarProduto();
    atualizarSecaoImpressaoPedido();
}

async function carregarPedidoViaURL() {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get('id') || '').trim();
    if (!id) return;
    if (window.location.protocol === 'file:') return;
    mostrarLoading('Carregando pedido...');
    try {
        const resposta = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=buscarPedido&acao=buscarPedido&termo=${encodeURIComponent(id)}`);
        const resultado = await resposta.json();
        if (!resultado.sucesso || !resultado.pedido) throw new Error('Pedido não encontrado');
        preencherFormularioCompleto(resultado.pedido);
        estadoApp.somenteLeitura = pedidoSomenteLeituraPorStatus(resultado.pedido);
        if (estadoApp.somenteLeitura) {
            aplicarUIModoVisualizacao();
            aplicarSomenteLeituraIndex();
        } else {
            aplicarUIModoEdicao();
        }
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Não foi possível carregar o pedido da fila.', 'error');
        const container = document.getElementById('produtosContainer');
        if (container && !container.children.length) adicionarProduto();
    } finally {
        esconderLoading();
    }
}

function enviarWhatsApp() {
    const nome = document.getElementById('nomeCliente').value;
    const telefone = Utils.limparTelefone(document.getElementById('telefone').value);
    if (!nome || !telefone) return Utils.mostrarNotificacao('Informe nome e telefone.', 'error');
    const idPedido = document.getElementById('idPedido').value || 'N/I';
    const totalPedido = document.getElementById('resumoTotalPedido').textContent;
    const restante = document.getElementById('resumoRestante').textContent;
    const entrega = Utils.dataISOParaBR(document.getElementById('dataEntrega').value);
    const msg = `*PEDIDO #${idPedido} - ADONAY CONFECÇÃO*\n\nCliente: ${nome}\nEntrega: ${entrega}\nTotal: ${totalPedido}\nRestante: ${restante}`;
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function mostrarLoading(mensagem = 'Carregando...') {
    document.body.insertAdjacentHTML('beforeend', `<div class="loading-overlay" id="loadingOverlay"><div class="loading-content"><div class="loading loading-big"></div><p>${mensagem}</p></div></div>`);
}

function esconderLoading() {
    document.getElementById('loadingOverlay')?.remove();
}

/* ================================================================
   LISTA DE PERSONALIZAÇÃO DE CAMISAS
   ================================================================ */

const LISTA_TAMANHOS = [
    'PP','P','M','G','GG','G1','G2','G3','G4','G5',
    'PP(BL)','P(BL)','M(BL)','G(BL)','GG(BL)',
    'G1(BL)','G2(BL)','G3(BL)','G4(BL)','G5(BL)'
];

const LISTA_TIPOS = ['POLO','GOLA O','GOLA V','MOLETOM','REGATA'];

function listaCriarSelect(lista, cls) {
    return `<select class="${cls}">${lista.map(i => `<option value="${i}">${i}</option>`).join('')}</select>`;
}

function listaAdicionarLinha(dados) {
    const tbody = document.getElementById('lista-bodyTabela');
    if (!tbody) return;
    const tr = document.createElement('tr');
    const selTam = listaCriarSelect(LISTA_TAMANHOS, 'lista-sel-tam');
    const selTipo = listaCriarSelect(LISTA_TIPOS, 'lista-sel-tipo');
    tr.innerHTML = `
        <td><input type="text" placeholder="Nome completo" value="${dados?.nome || ''}"></td>
        <td><input type="text" placeholder="Apelido" value="${dados?.apelido || ''}"></td>
        <td>${selTam}</td>
        <td>${selTipo}</td>
        <td><input type="text" placeholder="Ex: Azul" value="${dados?.cor || ''}"></td>
        <td><input type="number" value="${dados?.qtd || 1}" min="1" style="width:60px;text-align:center"></td>
        <td><button type="button" class="lista-btn-remover" onclick="listaRemoverLinha(this)" title="Remover">✕</button></td>
    `;
    tbody.appendChild(tr);
    if (dados?.tamanho) {
        const sel = tr.querySelector('.lista-sel-tam');
        if (sel) sel.value = dados.tamanho;
    }
    if (dados?.tipo) {
        const sel = tr.querySelector('.lista-sel-tipo');
        if (sel) sel.value = dados.tipo;
    }
}

function listaRemoverLinha(btn) {
    btn.closest('tr').remove();
}

function coletarListaPersonalizacao() {
    const linhas = [];
    const rows = document.querySelectorAll('#lista-bodyTabela tr');
    rows.forEach((tr) => {
        const inputs = tr.querySelectorAll('input');
        const selects = tr.querySelectorAll('select');
        const nome = inputs[0]?.value?.trim() || '';
        const apelido = inputs[1]?.value?.trim() || '';
        const cor = inputs[2]?.value?.trim() || '';
        const qtd = inputs[3]?.value || '1';
        const tamanho = selects[0]?.value || '';
        const tipo = selects[1]?.value || '';
        if (nome || apelido || cor) {
            linhas.push({ nome, apelido, tamanho, tipo, cor, qtd });
        }
    });
    return linhas.length > 0 ? linhas : null;
}

function preencherListaPersonalizacao(listaPersonalizacao) {
    const tbody = document.getElementById('lista-bodyTabela');
    if (!tbody) return;
    tbody.innerHTML = '';
    let lista = listaPersonalizacao;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch (_) { lista = []; }
    }
    if (!Array.isArray(lista) || lista.length === 0) return;
    lista.forEach((item) => listaAdicionarLinha(item));
}

function imprimirListaPersonalizacao() {
    const linhas = [];
    document.querySelectorAll('#lista-bodyTabela tr').forEach((tr) => {
        const inputs = tr.querySelectorAll('input');
        const selects = tr.querySelectorAll('select');
        linhas.push({
            nome: inputs[0]?.value || '',
            apelido: inputs[1]?.value || '',
            tamanho: selects[0]?.value || '',
            tipo: selects[1]?.value || '',
            cor: inputs[2]?.value || '',
            qtd: inputs[3]?.value || '1',
        });
    });

    const nomeCliente = document.getElementById('nomeCliente')?.value || '—';
    const telefoneCliente = document.getElementById('telefone')?.value || '—';
    const agora = new Date();
    const diasSemana = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const diaSemana = diasSemana[agora.getDay()];
    const data = `${String(agora.getDate()).padStart(2,'0')} de ${meses[agora.getMonth()]} de ${agora.getFullYear()}`;
    const hora = [agora.getHours(), agora.getMinutes(), agora.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
    const emissao = `${diaSemana}, ${data} - ${hora}`;

    const linhasHTML = linhas.map((l, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f4f4f4'};">
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;">${l.nome}</td>
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;">${l.apelido}</td>
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;text-align:center;">${l.tamanho}</td>
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;text-align:center;">${l.tipo}</td>
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;text-align:center;">${l.cor}</td>
            <td style="border:1px solid #bbb;padding:7px 10px;font-size:13px;text-align:center;">${l.qtd}</td>
        </tr>
    `).join('');

    const templateHTML = `
        <div style="font-family:Arial,sans-serif;background:#fff;color:#111;padding:28px 32px;max-width:800px;margin:0 auto;">
            <div style="text-align:center;border-bottom:3px solid #1a1a1a;padding-bottom:16px;margin-bottom:18px;">
                <div style="font-size:26px;font-weight:900;letter-spacing:2px;color:#b8922a;text-transform:uppercase;margin-bottom:6px;">ADONAY CONFECÇÃO</div>
                <div style="font-size:12px;color:#444;line-height:1.9;">
                    CNPJ: 42.522.845/0001-97<br>
                    Rua Geraldo Teixeira da Costa, São Benedito, Santa Luzia - MG<br>
                    ☎ (31) 3950-3089 &nbsp;|&nbsp; @adonayconfeccao
                </div>
                <div style="margin-top:8px;font-size:11px;color:#777;font-style:italic;">Emitido em: ${emissao}</div>
            </div>
            <div style="display:flex;gap:32px;margin-bottom:18px;padding:10px 14px;background:#f9f9f9;border:1px solid #ddd;border-radius:6px;font-size:13px;">
                <div><span style="font-weight:700;color:#333;">Cliente:</span> ${nomeCliente}</div>
                <div><span style="font-weight:700;color:#333;">Telefone:</span> ${telefoneCliente}</div>
            </div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#555;margin-bottom:6px;">Lista de Personalização de Camisas</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#1a1a1a;color:#ffffff;">
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;">Nome do Aluno</th>
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;">Nome / Apelido</th>
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;">Tamanho</th>
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;">Tipo</th>
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;">Cor</th>
                        <th style="border:1px solid #1a1a1a;padding:9px 10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;">Qtd</th>
                    </tr>
                </thead>
                <tbody>${linhasHTML}</tbody>
            </table>
            <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:10px;">
                Adonay Confecção &mdash; Santa Luzia/MG &mdash; (31) 3950-3089
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    if (!win) {
        Utils.mostrarNotificacao('Pop-up bloqueado. Permita pop-ups neste site e tente novamente.', 'error');
        return;
    }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
        <meta charset="UTF-8"><title>Lista Personalização — Adonay</title>
        <style>
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:Arial,sans-serif;background:#fff}
            @media print{@page{margin:8mm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
        </style></head><body>
        ${templateHTML}
        <script>window.onload=function(){setTimeout(function(){window.print();},350)}<\/script>
    </body></html>`);
    win.document.close();
}

