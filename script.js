// Sistema Adonay Confecção - Integração Google Sheets
const estadoApp = { produtos: [], produtoAtualId: 1, pedidoEmEdicao: null };

document.addEventListener('DOMContentLoaded', () => inicializarApp());

async function inicializarApp() {
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    configurarBotaoVoltarPrincipal();
    configurarValoresPadraoFormulario();
    configurarEventListeners();
    adicionarProduto();
    await carregarPedidoViaURL();
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
}

function configurarBotaoVoltarPrincipal() {
    const btn = document.getElementById('btnVoltarPrincipal');
    if (!btn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) btn.classList.remove('hidden');
}

function atualizarID() {
    if (estadoApp.pedidoEmEdicao) return;
    const telefone = document.getElementById('telefone').value;
    if (telefone) document.getElementById('idPedido').value = Utils.gerarID(telefone);
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
          <span class="produto-numero">📦 PRODUTO #${produtoId}</span>
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
          <div class="form-group"><label class="form-label required">Margem (%)</label><input type="number" class="form-input" id="margemLucro-${produtoId}" min="0" value="${CONFIG.CALCULOS.margemLucroPadrao}" onchange="calcularCustosProduto(${produtoId})"></div>
          <div class="form-group"><label class="form-label">Preço unitário</label><input type="text" class="form-input" id="precoUnitario-${produtoId}" disabled></div>
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

function calcularCustosProduto(produtoId) {
    const custoMalhaMap = {
        'PV (65% Poliéster 35% Viscose)': 8.91, 'Algodão Peteado (100% Algodão)': 8.25,
        'Piquet (50% Algodão 50% Poliéster)': 11.79, 'DryFit (100% Poliéster)': 7.30,
        'Dry Poliamida (100% Poliamida)': 17.35, 'Moletom (50% Algodão 50% Poliéster)': 20.56,
        'Malha PP (100% Poliéster)': 7.48, 'Algodão com Elastano (98% Algodão 2% Elastano)': 8.25,
        'Helanca Light (100% Poliéster)': 7.48
    };
    const custoMaoObraMap = { 'Camisas Comum': 4.50, 'Camisas POLO': 16.00, Moletons: 19.50, 'Camisa Social': 4.50 };

    const tipoMalha = document.getElementById(`tipoMalha-${produtoId}`)?.value || '';
    const tipoPeca = document.getElementById(`tipoPeca-${produtoId}`)?.value || '';
    const margem = parseFloat(document.getElementById(`margemLucro-${produtoId}`)?.value || '100');
    const quantidade = obterQuantidadeProduto(produtoId);

    const custoMalha = custoMalhaMap[tipoMalha] || 0;
    const custoMaoObra = custoMaoObraMap[tipoPeca] || 0;
    const custoEstampas = calcularCustoEstampas(produtoId);
    const custoFixo = 10;
    const custoTotal = custoMalha + custoMaoObra + custoEstampas + custoFixo;
    const precoUnitario = custoTotal * (1 + margem / 100);
    const valorTotal = precoUnitario * quantidade;

    document.getElementById(`custoMalha-${produtoId}`).textContent = Utils.formatarMoeda(custoMalha);
    document.getElementById(`custoMaoObra-${produtoId}`).textContent = Utils.formatarMoeda(custoMaoObra);
    document.getElementById(`custoEstampas-${produtoId}`).textContent = Utils.formatarMoeda(custoEstampas);
    document.getElementById(`custoFixo-${produtoId}`).textContent = Utils.formatarMoeda(custoFixo);
    document.getElementById(`custoTotal-${produtoId}`).textContent = Utils.formatarMoeda(custoTotal);
    document.getElementById(`precoUnitario-${produtoId}`).value = Utils.formatarMoeda(precoUnitario);
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
    const valores = { silk_10x10: 0.88, silk_10x6: 0.88, silk_a4: 3.88, silk_a3: 6.75, dtf_10x10: 1.40, dtf_10x6: 0.84, dtf_a4: 8.74, dtf_a3: 17.48, bordado_10x10: 5.00, bordado_10x6: 6.00, bordado_a4: 15.00, bordado_a3: 15.00, sub_10x10: 0.30, sub_10x6: 0.30, sub_a4: 1.00, sub_a3: 1.00, sub_total: 5.27 };
    let total = 0;
    document.querySelectorAll(`#estampasBody-${produtoId} tr`).forEach((tr) => {
        const selects = tr.querySelectorAll('select');
        const tipo = selects[0]?.value || '';
        const local = selects[1]?.value || '';
        const corSilk = tr.querySelector('.quantidade-cores')?.value || '';
        if (!tipo || !local) return;
        const localLower = local.toLowerCase();
        const isA3 = localLower.includes('a3');
        const isA4 = localLower.includes('a4');
        const is10x6 = localLower.includes('10x6') || localLower.includes('manga') || localLower.includes('ombro') || localLower.includes('pescoço');
        let valor = 0;
        if (tipo === 'Silk Screen') {
            valor = isA3 ? valores.silk_a3 : isA4 ? valores.silk_a4 : is10x6 ? valores.silk_10x6 : valores.silk_10x10;
            const numCores = parseInt(corSilk, 10);
            if (!Number.isNaN(numCores) && numCores > 1) valor += numCores * 0.25;
        } else if (tipo === 'DTF (Direct to Film)') valor = isA3 ? valores.dtf_a3 : isA4 ? valores.dtf_a4 : is10x6 ? valores.dtf_10x6 : valores.dtf_10x10;
        else if (tipo === 'Bordado') valor = isA3 ? valores.bordado_a3 : isA4 ? valores.bordado_a4 : is10x6 ? valores.bordado_10x6 : valores.bordado_10x10;
        else if (tipo === 'Sublimação Localizada') valor = isA3 ? valores.sub_a3 : isA4 ? valores.sub_a4 : is10x6 ? valores.sub_10x6 : valores.sub_10x10;
        else if (tipo === 'Sublimação Total (Full Print)') valor = valores.sub_total;
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

async function salvarPedido() {
    if (!validarFormulario()) return Utils.mostrarNotificacao('Preencha corretamente os campos obrigatórios.', 'error');
    if (!CONFIG.APPS_SCRIPT_URL) return Utils.mostrarNotificacao('Configure a URL do Apps Script em config.js.', 'error');
    if (window.location.protocol === 'file:') {
        Utils.mostrarNotificacao('Abra o sistema via localhost para evitar bloqueio CORS.', 'error');
        return;
    }

    mostrarLoading('Salvando pedido...');
    try {
        const dados = coletarDadosFormulario();
        const body = new URLSearchParams();
        body.append('action', 'salvarPedido');
        body.append('acao', 'salvarPedido');
        body.append('dados', JSON.stringify(dados));

        const resposta = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            body
        });
        const resultado = await resposta.json();
        if (!resultado.sucesso) throw new Error(resultado.erro || 'Falha ao salvar');
        estadoApp.pedidoEmEdicao = resultado.id || dados.id;
        Utils.mostrarNotificacao('Pedido salvo com sucesso!', 'success');
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Erro ao salvar pedido.', 'error');
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

function coletarDadosFormulario() {
    const totalPedido = Utils.limparMoeda(document.getElementById('resumoTotalPedido').textContent);
    const valorEntrada = parseFloat(document.getElementById('valorEntrada').value || '0');
    return {
        id: document.getElementById('idPedido').value || Utils.gerarID(document.getElementById('telefone').value),
        cliente: { nome: document.getElementById('nomeCliente').value, telefone: document.getElementById('telefone').value },
        datas: { pedido: document.getElementById('dataPedido').value, entrega: document.getElementById('dataEntrega').value },
        totalPecas: parseInt(document.getElementById('totalPecas').value || '0', 10),
        observacoes: document.getElementById('observacoes').value,
        statusOperacional: 'PENDENTE',
        responsavelAtual: document.getElementById('responsavelAtual')?.value || 'ISABELA SIRAY',
        tagPedido: document.getElementById('tagPedido')?.value || 'PEDIDO',
        statusProducao: {
            arte: false,
            os: false,
            corte: false,
            estampa: false,
            prontoParaEnvio: false
        },
        financeiro: { totalPedido, valorEntrada, restante: totalPedido - valorEntrada },
        produtos: estadoApp.produtos.map((p) => coletarProduto(p.id))
    };
}

function coletarProduto(produtoId) {
    const produto = {
        numero: produtoId,
        tipoPeca: document.getElementById(`tipoPeca-${produtoId}`)?.value || '',
        detalhesPeca: document.getElementById(`detalhesPeca-${produtoId}`)?.value || '',
        tipoMalha: document.getElementById(`tipoMalha-${produtoId}`)?.value || '',
        corMalha: document.getElementById(`corMalha-${produtoId}`)?.value || '',
        margemLucro: parseFloat(document.getElementById(`margemLucro-${produtoId}`)?.value || '0'),
        precoUnitario: Utils.limparMoeda(document.getElementById(`precoUnitario-${produtoId}`)?.value || '0'),
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
        preencherFormulario(resultado.pedido);
        fecharModalBusca();
        window.open(`editar-pedido.html?id=${encodeURIComponent(resultado.pedido.id)}`, '_blank', 'noopener,noreferrer');
        Utils.mostrarNotificacao('Abrindo pedido para edição.', 'success');
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Não foi possível localizar o pedido.', 'error');
    } finally {
        esconderLoading();
    }
}

function preencherFormulario(pedido) {
    limparFormulario();
    estadoApp.pedidoEmEdicao = pedido.id;
    document.getElementById('idPedido').value = pedido.id || '';
    document.getElementById('nomeCliente').value = pedido.cliente?.nome || '';
    document.getElementById('telefone').value = pedido.cliente?.telefone || '';
    document.getElementById('dataPedido').value = pedido.datas?.pedido || '';
    document.getElementById('dataEntrega').value = pedido.datas?.entrega || '';
    document.getElementById('totalPecas').value = pedido.totalPecas || 0;
    document.getElementById('observacoes').value = pedido.observacoes || '';
    document.getElementById('resumoTotalPedido').textContent = Utils.formatarMoeda(pedido.financeiro?.totalPedido || 0);
    document.getElementById('valorEntrada').value = pedido.financeiro?.valorEntrada || 0;
    document.getElementById('resumoRestante').textContent = Utils.formatarMoeda(pedido.financeiro?.restante || 0);
    document.getElementById('responsavelAtual').value = pedido.responsavelAtual || 'ISABELA SIRAY';
    document.getElementById('tagPedido').value = pedido.tagPedido || 'PEDIDO';
}

function limparFormulario() {
    document.getElementById('formPedido').reset();
    document.getElementById('produtosContainer').innerHTML = '';
    estadoApp.produtos = [];
    estadoApp.produtoAtualId = 1;
    estadoApp.pedidoEmEdicao = null;
    document.getElementById('resumoTotalPedido').textContent = 'R$ 0,00';
    document.getElementById('resumoRestante').textContent = 'R$ 0,00';
    configurarValoresPadraoFormulario();
    adicionarProduto();
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
        preencherFormulario(resultado.pedido);
    } catch (erro) {
        console.error(erro);
        Utils.mostrarNotificacao('Não foi possível carregar o pedido da fila.', 'error');
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

