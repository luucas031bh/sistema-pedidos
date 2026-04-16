// Sistema Adonay Confecção - Script Principal

// ========== Estado Global ==========
let estadoApp = {
    produtos: [],
    custosMalhas: [],
    custosMaoObra: [],
    custosEstampas: [],
    localidadesEstampas: [],
    produtoAtualId: 1
};

// ========== Inicialização ==========
document.addEventListener('DOMContentLoaded', () => {
    inicializarApp();
});

async function inicializarApp() {
    console.log('🚀 Iniciando Sistema Adonay Confecção...');
    
    // Inicializar relógio
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    
    // Configurar data padrão
    const hoje = Utils.dataAtual();
    document.getElementById('dataPedido').value = hoje;
    calcularDataEntrega();
    
    // Event listeners principais
    configurarEventListeners();
    
    // Adicionar primeiro produto
    adicionarProduto();
    
    // Carregar dados do backend (se disponível)
    await carregarDadosIniciais();
    
    console.log('✅ Sistema iniciado com sucesso!');
}

// ========== Relógio ==========
function atualizarRelogio() {
    const relogio = document.getElementById('relogio');
    if (relogio) {
        relogio.textContent = Utils.dataHoraCompleta();
    }
}

// ========== Event Listeners ==========
function configurarEventListeners() {
    // Cliente
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', (e) => {
            e.target.value = Utils.formatarTelefone(e.target.value);
            atualizarID();
        });
    }
    
    // Datas
    const dataPedidoInput = document.getElementById('dataPedido');
    if (dataPedidoInput) {
        dataPedidoInput.addEventListener('change', calcularDataEntrega);
    }
    
    // Botões principais
    const btnBuscar = document.getElementById('btnBuscar');
    if (btnBuscar) btnBuscar.addEventListener('click', abrirModalBusca);
    
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarPedido);
    
    const btnWhatsApp = document.getElementById('btnWhatsApp');
    if (btnWhatsApp) btnWhatsApp.addEventListener('click', enviarWhatsApp);
    
    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) btnImprimir.addEventListener('click', () => window.print());
    
    const btnAdicionarProduto = document.getElementById('btnAdicionarProduto');
    if (btnAdicionarProduto) btnAdicionarProduto.addEventListener('click', adicionarProduto);
    
    // Valores financeiros
    const valorEntradaInput = document.getElementById('valorEntrada');
    if (valorEntradaInput) {
        valorEntradaInput.addEventListener('input', calcularResumoFinanceiro);
    }
}

// ========== ID Automático ==========
function atualizarID() {
    const telefone = document.getElementById('telefone').value;
    const idInput = document.getElementById('idPedido');
    if (telefone && idInput) {
        idInput.value = Utils.gerarID(telefone);
    }
}

// ========== Cálculo de Data de Entrega ==========
function calcularDataEntrega() {
    const dataPedido = document.getElementById('dataPedido').value;
    const dataEntregaInput = document.getElementById('dataEntrega');
    
    if (dataPedido && dataEntregaInput) {
        const data = new Date(dataPedido);
        const dataEntrega = Utils.adicionarDias(data, CONFIG.CALCULOS.diasParaEntrega);
        
        const ano = dataEntrega.getFullYear();
        const mes = String(dataEntrega.getMonth() + 1).padStart(2, '0');
        const dia = String(dataEntrega.getDate()).padStart(2, '0');
        
        dataEntregaInput.value = `${ano}-${mes}-${dia}`;
    }
}

// ========== Gerenciamento de Produtos ==========

// Atualizar detalhes do produto baseado no tipo de peça (Arrays Simples)
function atualizarDetalhesPeca(produtoId) {
    const selectTipo = document.getElementById(`tipoPeca-${produtoId}`);
    const selectDetalhes = document.getElementById(`detalhesPeca-${produtoId}`);
    
    if (!selectTipo || !selectDetalhes) {
        return;
    }
    
    const tipoPeca = selectTipo.value;
    selectDetalhes.innerHTML = '<option value="">Selecione...</option>';
    selectDetalhes.disabled = true;
    
    if (tipoPeca && CONFIG.TIPOS_PECAS[tipoPeca]) {
        const opcoes = CONFIG.TIPOS_PECAS[tipoPeca];
        
        // Todos os tipos são arrays simples agora
        opcoes.forEach(opcao => {
            const option = document.createElement('option');
            option.value = opcao;
            option.textContent = opcao;
            selectDetalhes.appendChild(option);
        });
        selectDetalhes.disabled = false;
    }
    
    calcularCustosProduto(produtoId);
}



function adicionarProduto() {
    const container = document.getElementById('produtosContainer');
    if (!container) return;
    
    const produtoId = estadoApp.produtoAtualId++;
    
    const produtoHTML = `
        <div class="produto-container" id="produto-${produtoId}" data-produto-id="${produtoId}">
            <div class="produto-header">
                <span class="produto-numero">📦 PRODUTO #${produtoId}</span>
                ${produtoId > 1 ? `<button type="button" class="btn-remover-produto" onclick="removerProduto(${produtoId})">🗑️ Remover</button>` : ''}
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label required">Tipo de Peça</label>
                    <select class="form-select" id="tipoPeca-${produtoId}" onchange="atualizarDetalhesPeca(${produtoId})" required>
                        <option value="">Selecione...</option>
                        ${Object.keys(CONFIG.TIPOS_PECAS).map(tipo => 
                            `<option value="${tipo}">${tipo}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label required">Detalhes</label>
                    <select class="form-select" id="detalhesPeca-${produtoId}" required disabled>
                        <option value="">Selecione o tipo primeiro...</option>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label required">Tipo de Malha</label>
                    <select class="form-select" id="tipoMalha-${produtoId}" onchange="calcularCustosProduto(${produtoId})" required>
                        <option value="">Selecione...</option>
                        <option value="PV (65% Poliéster 35% Viscose)">PV (65% Poliéster 35% Viscose)</option>
                        <option value="Algodão Peteado (100% Algodão)">Algodão Peteado (100% Algodão)</option>
                        <option value="Piquet (50% Algodão 50% Poliéster)">Piquet (50% Algodão 50% Poliéster)</option>
                        <option value="DryFit (100% Poliéster)">DryFit (100% Poliéster)</option>
                        <option value="Dry Poliamida (100% Poliamida)">Dry Poliamida (100% Poliamida)</option>
                        <option value="Moletom (50% Algodão 50% Poliéster)">Moletom (50% Algodão 50% Poliéster)</option>
                        <option value="Malha PP (100% Poliéster)">Malha PP (100% Poliéster)</option>
                        <option value="Algodão com Elastano (98% Algodão 2% Elastano)">Algodão com Elastano (98% Algodão 2% Elastano)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label required">Cor da Malha</label>
                    <input type="text" class="form-input" id="corMalha-${produtoId}" placeholder="Ex: Branco, Preto, Azul Marinho" required>
                </div>
            </div>
            
            <div class="card-subtitle">📏 Tamanhos e Quantidades</div>
            <div class="tabela-dinamica">
                <table>
                    <thead>
                        <tr>
                            <th>Tamanho</th>
                            <th>Quantidade</th>
                            <th style="width: 50px;">Ação</th>
                        </tr>
                    </thead>
                    <tbody id="tamanhosBody-${produtoId}">
                        <tr>
                            <td>
                                <select class="form-select" onchange="calcularTotalPecas()">
                                    <option value="">Selecione...</option>
                                    ${CONFIG.TAMANHOS.map(tam => 
                                        `<option value="${tam}">${tam}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td>
                                <input type="number" class="form-input" min="0" value="0" onchange="calcularTotalPecas(); calcularCustosProduto(${produtoId})">
                            </td>
                            <td>
                                <button type="button" class="btn btn-small btn-danger" onclick="removerLinhaTamanho(this)">❌</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <button type="button" class="btn btn-small btn-secondary mt-1" onclick="adicionarLinhaTamanho(${produtoId})">➕ Adicionar Tamanho</button>
            
            <div class="card-subtitle">🎨 Estampas</div>
            <div class="tabela-dinamica">
                <table>
                    <thead>
                        <tr>
                            <th>Tipo de Estampa</th>
                            <th>Localidade</th>
                            <th>Quantidade de Cores</th>
                            <th style="width: 50px;">Ação</th>
                        </tr>
                    </thead>
                    <tbody id="estampasBody-${produtoId}">
                        <tr>
                            <td>
                                <select class="form-select" onchange="atualizarLocalidadesEstampa(this); calcularCustosProduto(${produtoId})">
                                    <option value="">Selecione...</option>
                                    ${CONFIG.TIPOS_ESTAMPAS.map(tipo => 
                                        `<option value="${tipo}">${tipo}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td>
                                <select class="form-select" disabled onchange="calcularCustosProduto(${produtoId})">
                                    <option value="">Selecione o tipo primeiro...</option>
                                </select>
                            </td>
                            <td>
                                <select class="form-select quantidade-cores" disabled style="display: none;" onchange="calcularCustosProduto(${produtoId})">
                                    <option value="">Selecione...</option>
                                    ${CONFIG.QUANTIDADES_CORES_SILK.map(cor => 
                                        `<option value="${cor}">${cor}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td>
                                <button type="button" class="btn btn-small btn-danger" onclick="removerLinhaEstampa(this, ${produtoId})">❌</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <button type="button" class="btn btn-small btn-secondary mt-1" onclick="adicionarLinhaEstampa(${produtoId})">➕ Adicionar Estampa</button>
            
            <div class="card-subtitle">💰 Cálculo de Custos</div>
            <div class="custos-container">
                <div class="custo-item">
                    <span class="custo-label">💰 Custo de Malha (por unidade):</span>
                    <span class="custo-valor" id="custoMalha-${produtoId}">R$ 0,00</span>
                </div>
                <div class="custo-item">
                    <span class="custo-label">🧵 Custo de Mão de Obra (por unidade):</span>
                    <span class="custo-valor" id="custoMaoObra-${produtoId}">R$ 0,00</span>
                </div>
                <div class="custo-item">
                    <span class="custo-label">🎨 Custo de Estampas (por unidade):</span>
                    <span class="custo-valor" id="custoEstampas-${produtoId}">R$ 0,00</span>
                </div>
                <div class="custo-item">
                    <span class="custo-label">🏭 Custo Fixo Operacional (por unidade):</span>
                    <span class="custo-valor" id="custoFixo-${produtoId}">R$ 0,00</span>
                </div>
                <div class="custo-item">
                    <span class="custo-label">💵 Custo Total (por unidade):</span>
                    <span class="custo-valor" id="custoTotal-${produtoId}">R$ 0,00</span>
                </div>
            </div>
            
            <div class="form-row mt-2">
                <div class="form-group">
                    <label class="form-label required">💹 Margem de Lucro (%)</label>
                    <input type="number" class="form-input" id="margemLucro-${produtoId}" min="0" max="100" value="${CONFIG.CALCULOS.margemLucroPadrao}" onchange="calcularCustosProduto(${produtoId})" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">💵 Preço Unitário (com lucro)</label>
                    <input type="text" class="form-input" id="precoUnitario-${produtoId}" disabled>
                </div>
                
                <div class="form-group">
                    <label class="form-label">💰 Valor Total do Produto</label>
                    <input type="text" class="form-input" id="valorTotalProduto-${produtoId}" disabled>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', produtoHTML);
    
    // Atualizar array de produtos
    estadoApp.produtos.push({
        id: produtoId,
        custoTotal: 0,
        valorTotal: 0
    });
}

function removerProduto(produtoId) {
    if (confirm('Deseja realmente remover este produto?')) {
        const elemento = document.getElementById(`produto-${produtoId}`);
        if (elemento) {
            elemento.remove();
            // Remover do estado
            estadoApp.produtos = estadoApp.produtos.filter(p => p.id !== produtoId);
            // Recalcular totais
            calcularResumoFinanceiro();
        }
    }
}

function atualizarDetalhesPeca(produtoId) {
    const tipoPecaSelect = document.getElementById(`tipoPeca-${produtoId}`);
    const detalhesPecaSelect = document.getElementById(`detalhesPeca-${produtoId}`);
    
    if (tipoPecaSelect && detalhesPecaSelect) {
        const tipoPeca = tipoPecaSelect.value;
        
        detalhesPecaSelect.innerHTML = '<option value="">Selecione...</option>';
        
        if (tipoPeca && CONFIG.TIPOS_PECAS[tipoPeca]) {
            detalhesPecaSelect.disabled = false;
            CONFIG.TIPOS_PECAS[tipoPeca].forEach(detalhe => {
                const option = document.createElement('option');
                option.value = detalhe;
                option.textContent = detalhe;
                detalhesPecaSelect.appendChild(option);
            });
        } else {
            detalhesPecaSelect.disabled = true;
        }
        
        calcularCustosProduto(produtoId);
    }
}

// ========== Tamanhos ==========
function adicionarLinhaTamanho(produtoId) {
    const tbody = document.getElementById(`tamanhosBody-${produtoId}`);
    if (!tbody) return;
    
    const novaLinha = `
        <tr>
            <td>
                <select class="form-select" onchange="calcularTotalPecas()">
                    <option value="">Selecione...</option>
                    ${CONFIG.TAMANHOS.map(tam => 
                        `<option value="${tam}">${tam}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="form-input" min="0" value="0" onchange="calcularTotalPecas(); calcularCustosProduto(${produtoId})">
            </td>
            <td>
                <button type="button" class="btn btn-small btn-danger" onclick="removerLinhaTamanho(this)">❌</button>
            </td>
        </tr>
    `;
    
    tbody.insertAdjacentHTML('beforeend', novaLinha);
}

function removerLinhaTamanho(btn) {
    const tr = btn.closest('tr');
    const tbody = tr.parentElement;
    
    // Manter pelo menos uma linha
    if (tbody.children.length > 1) {
        tr.remove();
        calcularTotalPecas();
    } else {
        Utils.mostrarNotificacao('Deve haver pelo menos um tamanho!', 'error');
    }
}

function calcularTotalPecas() {
    let total = 0;
    
    // Percorrer todos os produtos
    document.querySelectorAll('[id^="tamanhosBody-"]').forEach(tbody => {
        const inputs = tbody.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
            total += parseInt(input.value) || 0;
        });
    });
    
    const totalPecasInput = document.getElementById('totalPecas');
    if (totalPecasInput) {
        totalPecasInput.value = total;
    }
}

// ========== Estampas ==========
function adicionarLinhaEstampa(produtoId) {
    const tbody = document.getElementById(`estampasBody-${produtoId}`);
    if (!tbody) return;
    
    const novaLinha = `
        <tr>
            <td>
                <select class="form-select" onchange="atualizarLocalidadesEstampa(this); calcularCustosProduto(${produtoId})">
                    <option value="">Selecione...</option>
                    ${CONFIG.TIPOS_ESTAMPAS.map(tipo => 
                        `<option value="${tipo}">${tipo}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                <select class="form-select" disabled onchange="calcularCustosProduto(${produtoId})">
                    <option value="">Selecione o tipo primeiro...</option>
                </select>
            </td>
            <td>
                <select class="form-select quantidade-cores" disabled style="display: none;" onchange="calcularCustosProduto(${produtoId})">
                    <option value="">Selecione...</option>
                    ${CONFIG.QUANTIDADES_CORES_SILK.map(cor => 
                        `<option value="${cor}">${cor}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                <button type="button" class="btn btn-small btn-danger" onclick="removerLinhaEstampa(this, ${produtoId})">❌</button>
            </td>
        </tr>
    `;
    
    tbody.insertAdjacentHTML('beforeend', novaLinha);
}

function removerLinhaEstampa(btn, produtoId) {
    const tr = btn.closest('tr');
    tr.remove();
    calcularCustosProduto(produtoId);
}

function atualizarLocalidadesEstampa(selectTipo) {
    const tr = selectTipo.closest('tr');
    const selects = tr.querySelectorAll('select');
    const selectLocalidade = selects[1];
    const selectQuantidadeCores = tr.querySelector('.quantidade-cores');
    
    if (!selectLocalidade) {
        return;
    }
    
    const tipoEstampa = selectTipo.value;
    
    // Todas as localidades disponíveis (17 opções)
    const todasLocalidades = [
        ...CONFIG.LOCALIDADES_FRENTE,
        ...CONFIG.LOCALIDADES_COSTAS,
        ...CONFIG.LOCALIDADES_MANGA
    ];
    
    // Configurações por tipo de estampa
    const configEstampas = {
        'Silk Screen': {
            localidades: todasLocalidades,
            mostraQuantidadeCores: true,
            validaMalha: false
        },
        'DTF (Direct to Film)': {
            localidades: todasLocalidades,
            mostraQuantidadeCores: false,
            validaMalha: false
        },
        'Bordado': {
            localidades: todasLocalidades,
            mostraQuantidadeCores: false,
            validaMalha: false
        },
        'Sublimação Localizada': {
            localidades: todasLocalidades,
            mostraQuantidadeCores: false,
            validaMalha: true,
            malhaPermitida: ['DryFit (100% Poliéster)', 'Helanca Light (100% Poliéster)', 'Malha PP (100% Poliéster)']
        },
        'Sublimação Total (Full Print)': {
            localidades: ['Total (Full Print)'],
            mostraQuantidadeCores: false,
            validaMalha: true,
            malhaPermitida: ['DryFit (100% Poliéster)', 'Helanca Light (100% Poliéster)', 'Malha PP (100% Poliéster)']
        }
    };
    
    const config = configEstampas[tipoEstampa];
    
    if (config) {
        // Habilitar campo de localidade
        selectLocalidade.disabled = false;
        selectLocalidade.innerHTML = '<option value="">Selecione...</option>';
        
        // Adicionar localidades
        config.localidades.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            selectLocalidade.appendChild(option);
        });
        
        // Mostrar/ocultar campo de quantidade de cores
        if (selectQuantidadeCores) {
            if (config.mostraQuantidadeCores) {
                selectQuantidadeCores.style.display = 'block';
                selectQuantidadeCores.disabled = false;
            } else {
                selectQuantidadeCores.style.display = 'none';
                selectQuantidadeCores.disabled = true;
            }
        }
        
        // Validar malha se necessário
        if (config.validaMalha) {
            validarMalhaParaSublimacao();
        }
    } else {
        // Desabilitar campos
        selectLocalidade.disabled = true;
        selectLocalidade.innerHTML = '<option value="">Selecione o tipo primeiro...</option>';
        
        if (selectQuantidadeCores) {
            selectQuantidadeCores.style.display = 'none';
            selectQuantidadeCores.disabled = true;
        }
    }
}

function validarMalhaParaSublimacao() {
    // Esta função será chamada quando Sublimação for selecionada
    // Verificar se a malha é 100% Poliéster
    const tipoMalha = document.querySelector('#tipoMalha-1')?.value; // Assumindo produto 1
    if (tipoMalha) {
        const malhasPermitidas = ['DryFit (100% Poliéster)', 'Helanca Light (100% Poliéster)', 'Malha PP (100% Poliéster)'];
        if (!malhasPermitidas.includes(tipoMalha)) {
            Utils.mostrarNotificacao('⚠️ Sublimação requer malha 100% Poliéster!', 'error');
        }
    }
}

// ========== Cálculos de Custos ==========
function calcularCustosProduto(produtoId) {
    // Custos padrão (valores estimados - devem vir do Google Sheets)
    const custosBase = {
        malha: {
            'PV (65% Poliéster 35% Viscose)': { precoPorKg: 42.00, rendimentoPorKg: 2.1, custoPorPeca: 8.91 },
            'Algodão Peteado (100% Algodão)': { precoPorKg: 44.00, rendimentoPorKg: 2.4, custoPorPeca: 8.25 },
            'Piquet (50% Algodão 50% Poliéster)': { precoPorKg: 55.00, rendimentoPorKg: 2.1, custoPorPeca: 11.79 },
            'DryFit (100% Poliéster)': { precoPorKg: 41.90, rendimentoPorKg: 4.2, custoPorPeca: 7.30 },
            'Dry Poliamida (100% Poliamida)': { precoPorKg: 90.00, rendimentoPorKg: 3.8, custoPorPeca: 17.35 },
            'Moletom (50% Algodão 50% Poliéster)': { precoPorKg: 37.00, rendimentoPorKg: 1.8, custoPorPeca: 20.56 },
            'Malha PP (100% Poliéster)': { precoPorKg: 34.90, rendimentoPorKg: 2.1, custoPorPeca: 7.48 },
            'Algodão com Elastano (98% Algodão 2% Elastano)': { precoPorKg: 44.00, rendimentoPorKg: 2.4, custoPorPeca: 8.25 }
        },
        maoObra: {
            'Camisas Comum': { custoPorPeca: 4.50 },
            'Camisas POLO': { custoPorPeca: 16.00 },
            'Moletons': { custoPorPeca: 19.50 },
            'Camisa Social': { custoPorPeca: 4.50 }
        },
        estampas: {
            'Silk Screen': {
                '10x10': { custoBase: 0.88, custoPorCor: 0.25 },
                'A3': { custoBase: 6.75, custoPorCor: 0.25 },
                'A4': { custoBase: 3.88, custoPorCor: 0.25 },
                '10x6': { custoBase: 0.88, custoPorCor: 0.25 }
            },
            'DTF (Direct to Film)': {
                '10x10': 1.40,  // Peito, Barras
                '10x6': 0.84,   // Manga, Ombro, Pescoço
                'A4': 8.74,     // Frente/Costas A4
                'A3': 17.48     // Frente/Costas A3
            },
            'Bordado': {
                '10x10': 5.00,  // Peito, Barras
                '20x15': 15.00, // A4/A3
                'NOME': 6.00    // 10x6 (Manga, Ombro, Pescoço)
            },
            'Sublimação Localizada': {
                '10x10': 0.30,  // Peito, Barras
                '10x6': 0.30,   // Manga, Ombro, Pescoço
                'A4': 1.00,      // Frente/Costas A4
                'A3': 1.00       // Frente/Costas A3
            },
            'Sublimação Total (Full Print)': {
                'Total (Full Print)': 5.27
            }
        }
    };
    
    // Obter dados do produto
    const tipoMalha = document.getElementById(`tipoMalha-${produtoId}`)?.value;
    const tipoPeca = document.getElementById(`tipoPeca-${produtoId}`)?.value;
    const detalhesPeca = document.getElementById(`detalhesPeca-${produtoId}`)?.value;
    
    // Calcular quantidade total de peças
    let quantidadeTotal = 0;
    const tamanhosBody = document.getElementById(`tamanhosBody-${produtoId}`);
    if (tamanhosBody) {
        const inputs = tamanhosBody.querySelectorAll('input[type="number"]');
        inputs.forEach(input => {
            quantidadeTotal += parseInt(input.value) || 0;
        });
    }
    
    // 1. Custo de Malha POR UNIDADE
    let custoMalhaPorUnidade = 0;
    if (tipoMalha && custosBase.malha[tipoMalha]) {
        custoMalhaPorUnidade = custosBase.malha[tipoMalha].custoPorPeca;
    }
    
    // 2. Custo de Mão de Obra POR UNIDADE
    let custoMaoObraPorUnidade = 0;
    if (tipoPeca && custosBase.maoObra[tipoPeca]) {
        custoMaoObraPorUnidade = custosBase.maoObra[tipoPeca].custoPorPeca;
    }
    
    // 3. Custo de Estampas POR UNIDADE
    let custoEstampasPorUnidade = 0;
    const estampasBody = document.getElementById(`estampasBody-${produtoId}`);
    if (estampasBody) {
        const linhas = estampasBody.querySelectorAll('tr');
        linhas.forEach(linha => {
            const selects = linha.querySelectorAll('select');
            const tipoEstampa = selects[0]?.value;
            const localidade = selects[1]?.value;
            const quantidadeCores = linha.querySelector('.quantidade-cores')?.value;
            
            if (tipoEstampa && localidade) {
                let custoEstampa = 0;
                
                if (tipoEstampa === 'Silk Screen') {
                    // Mapear localidade para tamanho
                    const tamanhoMap = {
                        'Peito Esquerdo 10x10': '10x10',
                        'Peito Direito 10x10': '10x10',
                        'Frente A4': 'A4',
                        'Frente A3': 'A3',
                        'Costas A4': 'A4',
                        'Costas A3': 'A3',
                        'Manga Direita 10x6': '10x6',
                        'Manga Esquerda 10x6': '10x6'
                    };
                    
                    const tamanho = tamanhoMap[localidade] || '10x10';
                    const dadosSilk = custosBase.estampas['Silk Screen'][tamanho];
                    
                    if (dadosSilk) {
                        custoEstampa = dadosSilk.custoBase;
                        
                        // Adicionar custo por cor
                        if (quantidadeCores) {
                            const numCores = parseInt(quantidadeCores.split(' ')[0]) || 1;
                            if (numCores > 4) {
                                custoEstampa += dadosSilk.custoPorCor * 7; // Policromia = 7 cores
                            } else {
                                custoEstampa += dadosSilk.custoPorCor * numCores;
                            }
                        }
                    }
                } else if (tipoEstampa === 'DTF (Direct to Film)') {
                    const custoDTF = custosBase.estampas['DTF (Direct to Film)'];
                    
                    // Mapear localidade para tamanho
                    let tamanho = '10x10'; // padrão
                    
                    if (localidade.includes('A4')) {
                        tamanho = 'A4';
                    } else if (localidade.includes('A3')) {
                        tamanho = 'A3';
                    } else if (localidade.includes('10x6') || localidade.includes('Manga') || 
                               localidade.includes('Ombro') || localidade.includes('Pescoço')) {
                        tamanho = '10x6';
                    }
                    
                    custoEstampa = custoDTF[tamanho] || 0;
                } else if (tipoEstampa === 'Bordado') {
                    const custoBordado = custosBase.estampas['Bordado'];
                    
                    // Mapear localidade para tamanho
                    let tamanho = '10x10'; // padrão para peito e barras
                    
                    if (localidade.includes('A4') || localidade.includes('A3')) {
                        tamanho = '20x15';
                    } else if (localidade.includes('Manga') || localidade.includes('Ombro') || localidade.includes('Pescoço')) {
                        tamanho = 'NOME';
                    }
                    
                    custoEstampa = custoBordado[tamanho] || 0;
                } else if (tipoEstampa === 'Sublimação Localizada') {
                    const custoSublimacao = custosBase.estampas['Sublimação Localizada'];
                    
                    // Mapear localidade para tamanho
                    let tamanho = '10x10'; // padrão
                    
                    if (localidade.includes('A4')) {
                        tamanho = 'A4';
                    } else if (localidade.includes('A3')) {
                        tamanho = 'A3';
                    } else if (localidade.includes('10x6') || localidade.includes('Manga') || 
                               localidade.includes('Ombro') || localidade.includes('Pescoço')) {
                        tamanho = '10x6';
                    }
                    
                    custoEstampa = custoSublimacao[tamanho] || 0;
                } else if (tipoEstampa === 'Sublimação Total (Full Print)') {
                    custoEstampa = custosBase.estampas['Sublimação Total (Full Print)']['Total (Full Print)'];
                }
                
                custoEstampasPorUnidade += custoEstampa;
            }
        });
    }
    
    // 4. Custo Fixo Operacional POR UNIDADE (R$ 10,00 por peça)
    const custoFixoPorUnidade = 10.00;
    
    // 5. Custo Total POR UNIDADE
    const custoTotalPorUnidade = custoMalhaPorUnidade + custoMaoObraPorUnidade + custoEstampasPorUnidade + custoFixoPorUnidade;
    
    // 6. Valor Total do Produto (com margem de lucro)
    const margemLucro = parseFloat(document.getElementById(`margemLucro-${produtoId}`)?.value) || 100;
    const valorVendaPorUnidade = custoTotalPorUnidade * (1 + margemLucro / 100);
    const valorTotalProduto = valorVendaPorUnidade * quantidadeTotal;
    
    // Atualizar interface COM VALORES UNITÁRIOS
    document.getElementById(`custoMalha-${produtoId}`).textContent = Utils.formatarMoeda(custoMalhaPorUnidade);
    document.getElementById(`custoMaoObra-${produtoId}`).textContent = Utils.formatarMoeda(custoMaoObraPorUnidade);
    document.getElementById(`custoEstampas-${produtoId}`).textContent = Utils.formatarMoeda(custoEstampasPorUnidade);
    document.getElementById(`custoFixo-${produtoId}`).textContent = Utils.formatarMoeda(custoFixoPorUnidade);
    document.getElementById(`custoTotal-${produtoId}`).textContent = Utils.formatarMoeda(custoTotalPorUnidade);
    document.getElementById(`precoUnitario-${produtoId}`).value = Utils.formatarMoeda(valorVendaPorUnidade);
    document.getElementById(`valorTotalProduto-${produtoId}`).value = Utils.formatarMoeda(valorTotalProduto);
    
    // Atualizar estado
    const produtoIndex = estadoApp.produtos.findIndex(p => p.id === produtoId);
    if (produtoIndex !== -1) {
        estadoApp.produtos[produtoIndex].custoTotal = custoTotalPorUnidade;
        estadoApp.produtos[produtoIndex].valorTotal = valorTotalProduto;
    }
    
    // Recalcular resumo financeiro
    calcularResumoFinanceiro();
}

// ========== Resumo Financeiro ==========
function calcularResumoFinanceiro() {
    let totalPedido = 0;
    
    // Somar valor total de todos os produtos
    estadoApp.produtos.forEach(produto => {
        const produtoId = produto.id;
        const valorTotal = Utils.limparMoeda(document.getElementById(`valorTotalProduto-${produtoId}`)?.value || '0');
        totalPedido += valorTotal;
    });
    
    // Atualizar TOTAL
    document.getElementById('resumoTotalPedido').textContent = Utils.formatarMoeda(totalPedido);
    
    // Calcular restante
    const valorEntrada = parseFloat(document.getElementById('valorEntrada').value) || 0;
    const restante = totalPedido - valorEntrada;
    
    // Atualizar restante
    document.getElementById('resumoRestante').textContent = Utils.formatarMoeda(restante);
}


// ========== Carregar Dados Iniciais ==========
async function carregarDadosIniciais() {
    // Verificar se URL do Apps Script está configurada
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'https://script.google.com/macros/s/AKfycby9LFyzYkXW_Zo9i_u3jdGfRweu5UaDvf4PsGWyTh8UB0hXGEls2l_oELjJSDkpZwDoAQ/exec') {
        console.warn('⚠️ URL do Google Apps Script não configurada');
        return;
    }
    
    try {
        const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=obterDados`);
        const dados = await response.json();
        
        if (dados.custosMalhas) estadoApp.custosMalhas = dados.custosMalhas;
        if (dados.custosMaoObra) estadoApp.custosMaoObra = dados.custosMaoObra;
        if (dados.custosEstampas) estadoApp.custosEstampas = dados.custosEstampas;
        if (dados.localidadesEstampas) estadoApp.localidadesEstampas = dados.localidadesEstampas;
        
        console.log('✅ Dados carregados do backend');
    } catch (error) {
        console.warn('⚠️ Erro ao carregar dados do backend:', error);
    }
}

// ========== Salvar Pedido ==========
async function salvarPedido() {
    // 1. Validar campos obrigatórios
    if (!validarFormulario()) {
        Utils.mostrarNotificacao(CONFIG.MENSAGENS.camposObrigatorios, 'error');
        return;
    }
    
    // 2. Coletar dados do formulário
    const dadosPedido = coletarDadosFormulario();
    
    // 3. Mostrar Loading
    mostrarLoading(CONFIG.MENSAGENS.salvandoPedido);

    try {
        // MUDANÇA AQUI: Enviamos a ação pela URL e os dados como texto puro
        const urlComAcao = `${CONFIG.APPS_SCRIPT_URL}?acao=salvarPedido`;
        
        const response = await fetch(urlComAcao, {
            method: 'POST',
            mode: 'cors', // Agora o CORS vai permitir porque o Content-Type é simples
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(dadosPedido)
        });

        const resultado = await response.json();

        if (resultado.sucesso) {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.pedidoSalvo, 'success');
            // Opcional: limparFormulario();
        } else {
            throw new Error(resultado.erro || 'Erro desconhecido no servidor');
        }

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        Utils.mostrarNotificacao('Erro ao salvar no banco: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}
    // Mostrar loading
    mostrarLoading(CONFIG.MENSAGENS.salvandoPedido);
    
    try {
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'salvarPedido',
                dados: dadosPedido
            })
        });
        
        const resultado = await response.json();
        
        esconderLoading();
        
        if (resultado.sucesso) {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.pedidoSalvo, 'success');
        } else {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.erroPedido, 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar pedido:', error);
        esconderLoading();
        Utils.mostrarNotificacao(CONFIG.MENSAGENS.erroPedido, 'error');
    }
}

function validarFormulario() {
    const nome = document.getElementById('nomeCliente').value;
    const telefone = document.getElementById('telefone').value;
    const dataPedido = document.getElementById('dataPedido').value;
    
    if (!Utils.validarCampoObrigatorio(nome)) return false;
    if (!Utils.validarTelefone(telefone)) return false;
    if (!dataPedido) return false;
    
    // Validar pelo menos um produto
    if (estadoApp.produtos.length === 0) return false;
    
    return true;
}

function coletarDadosFormulario() {
    // Dados do cliente
    const dados = {
        id: document.getElementById('idPedido').value,
        cliente: {
            nome: document.getElementById('nomeCliente').value,
            telefone: document.getElementById('telefone').value
        },
        datas: {
            pedido: document.getElementById('dataPedido').value,
            entrega: document.getElementById('dataEntrega').value
        },
        totalPecas: document.getElementById('totalPecas').value,
        produtos: [],
        observacoes: document.getElementById('observacoes').value,
        financeiro: {
            totalPedido: Utils.limparMoeda(document.getElementById('resumoTotalPedido').textContent),
            valorEntrada: parseFloat(document.getElementById('valorEntrada').value) || 0,
            restante: Utils.limparMoeda(document.getElementById('resumoRestante').textContent)
        },
        timestamp: new Date().toISOString()
    };
    
    // Coletar dados dos produtos
    estadoApp.produtos.forEach(produto => {
        const produtoId = produto.id;
        
        const dadosProduto = {
            numero: produtoId,
            tipoPeca: document.getElementById(`tipoPeca-${produtoId}`).value,
            detalhesPeca: document.getElementById(`detalhesPeca-${produtoId}`).value,
            tipoMalha: document.getElementById(`tipoMalha-${produtoId}`).value,
            corMalha: document.getElementById(`corMalha-${produtoId}`).value,
            tamanhos: [],
            estampas: [],
            custos: {
                malha: Utils.limparMoeda(document.getElementById(`custoMalha-${produtoId}`).textContent),
                maoObra: Utils.limparMoeda(document.getElementById(`custoMaoObra-${produtoId}`).textContent),
                estampas: Utils.limparMoeda(document.getElementById(`custoEstampas-${produtoId}`).textContent),
                fixo: Utils.limparMoeda(document.getElementById(`custoFixo-${produtoId}`).textContent),
                total: Utils.limparMoeda(document.getElementById(`custoTotal-${produtoId}`).textContent)
            },
            margemLucro: parseFloat(document.getElementById(`margemLucro-${produtoId}`)?.value || 0),
            precoUnitario: Utils.limparMoeda(document.getElementById(`precoUnitario-${produtoId}`)?.value || '0'),
            valorTotal: Utils.limparMoeda(document.getElementById(`valorTotalProduto-${produtoId}`)?.value || '0')
        };
        
        // Tamanhos
        const tamanhosBody = document.getElementById(`tamanhosBody-${produtoId}`);
        if (tamanhosBody) {
            const linhas = tamanhosBody.querySelectorAll('tr');
            linhas.forEach(linha => {
                const selectTamanho = linha.querySelector('select');
                const inputQuantidade = linha.querySelector('input[type="number"]');
                
                if (selectTamanho && inputQuantidade) {
                    const tamanho = selectTamanho.value;
                    const quantidade = inputQuantidade.value;
                    if (tamanho && quantidade > 0) {
                        dadosProduto.tamanhos.push({ tamanho, quantidade: parseInt(quantidade) });
                    }
                }
            });
        }
        
        // Estampas
        const estampasBody = document.getElementById(`estampasBody-${produtoId}`);
        if (estampasBody) {
            const linhas = estampasBody.querySelectorAll('tr');
            linhas.forEach(linha => {
                const selectTipo = linha.querySelector('select:nth-of-type(1)');
                const selectLocalidade = linha.querySelector('select:nth-of-type(2)');
                
                if (selectTipo && selectLocalidade) {
                    const tipo = selectTipo.value;
                    const localidade = selectLocalidade.value;
                    if (tipo && localidade) {
                        dadosProduto.estampas.push({ tipo, localidade });
                    }
                }
            });
        }
        
        dados.produtos.push(dadosProduto);
    });
    
    return dados;
}

// ========== Buscar Pedido ==========
function abrirModalBusca() {
    const modalHTML = `
        <div class="modal" id="modalBusca">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">🔍 Buscar Pedido</h3>
                    <button class="btn-close-modal" onclick="fecharModalBusca()">✖</button>
                </div>
                <div class="form-group">
                    <label class="form-label">ID ou Nome do Cliente</label>
                    <input type="text" class="form-input" id="inputBusca" placeholder="Digite o ID ou nome...">
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="buscarPedido()">🔍 Buscar</button>
                    <button class="btn btn-secondary" onclick="fecharModalBusca()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('modalBusca');
    setTimeout(() => modal.classList.add('show'), 10);
    
    document.getElementById('inputBusca').focus();
}

function fecharModalBusca() {
    const modal = document.getElementById('modalBusca');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

async function buscarPedido() {
    const termoBusca = document.getElementById('inputBusca').value;
    
    if (!termoBusca) {
        Utils.mostrarNotificacao('Digite um ID ou nome para buscar', 'error');
        return;
    }
    
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'https://script.google.com/macros/s/AKfycby9LFyzYkXW_Zo9i_u3jdGfRweu5UaDvf4PsGWyTh8UB0hXGEls2l_oELjJSDkpZwDoAQ/exec') {
        Utils.mostrarNotificacao('Configure a URL do Google Apps Script', 'error');
        return;
    }
    
    mostrarLoading(CONFIG.MENSAGENS.buscandoPedido);
    
    try {
        const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=buscarPedido&termo=${encodeURIComponent(termoBusca)}`);
        const resultado = await response.json();
        
        esconderLoading();
        
        if (resultado.sucesso && resultado.pedido) {
            preencherFormulario(resultado.pedido);
            fecharModalBusca();
            Utils.mostrarNotificacao('Pedido carregado com sucesso!', 'success');
        } else {
            Utils.mostrarNotificacao(CONFIG.MENSAGENS.pedidoNaoEncontrado, 'error');
        }
    } catch (error) {
        console.error('Erro ao buscar pedido:', error);
        esconderLoading();
        Utils.mostrarNotificacao('Erro ao buscar pedido', 'error');
    }
}

function preencherFormulario(pedido) {
    try {
        // Limpar formulário atual
        limparFormulario();
        
        // Preencher dados do cliente
        document.getElementById('idPedido').value = pedido.id;
        document.getElementById('nomeCliente').value = pedido.cliente.nome;
        document.getElementById('telefone').value = pedido.cliente.telefone;
        document.getElementById('dataPedido').value = pedido.datas.pedido;
        document.getElementById('dataEntrega').value = pedido.datas.entrega;
        document.getElementById('totalPecas').value = pedido.totalPecas;
        document.getElementById('observacoes').value = pedido.observacoes || '';
        
        // Preencher resumo financeiro
        document.getElementById('resumoTotalPedido').textContent = Utils.formatarMoeda(pedido.financeiro.totalPedido);
        document.getElementById('valorEntrada').value = pedido.financeiro.valorEntrada;
        document.getElementById('resumoRestante').textContent = Utils.formatarMoeda(pedido.financeiro.restante);
        
        // Limpar produtos existentes
        const containerProdutos = document.getElementById('produtosContainer');
        containerProdutos.innerHTML = '';
        estadoApp.produtos = [];
        
        // Adicionar produtos do pedido
        if (pedido.produtos && pedido.produtos.length > 0) {
            pedido.produtos.forEach((produto, index) => {
                adicionarProduto();
                const produtoId = `produto-${index + 1}`;
                
                // Preencher dados do produto
                document.getElementById(`tipoPeca-${produtoId}`).value = produto.tipoPeca;
                document.getElementById(`detalhesPeca-${produtoId}`).value = produto.detalhesPeca;
                document.getElementById(`tipoMalha-${produtoId}`).value = produto.tipoMalha;
                document.getElementById(`corMalha-${produtoId}`).value = produto.corMalha;
                
                // Preencher tamanhos
                if (produto.tamanhos && produto.tamanhos.length > 0) {
                    produto.tamanhos.forEach(tamanho => {
                        const tamanhosBody = document.getElementById(`tamanhosBody-${produtoId}`);
                        if (tamanhosBody) {
                            const linhas = tamanhosBody.querySelectorAll('tr');
                            linhas.forEach(linha => {
                                const selectTamanho = linha.querySelector('select');
                                const inputQuantidade = linha.querySelector('input[type="number"]');
                                
                                if (selectTamanho && selectTamanho.value === tamanho.tamanho) {
                                    inputQuantidade.value = tamanho.quantidade;
                                }
                            });
                        }
                    });
                }
                
                // Preencher estampas
                if (produto.estampas && produto.estampas.length > 0) {
                    produto.estampas.forEach((estampa, estampaIndex) => {
                        if (estampaIndex === 0) {
                            // Primeira estampa - preencher linha existente
                            const estampasBody = document.getElementById(`estampasBody-${produtoId}`);
                            if (estampasBody) {
                                const primeiraLinha = estampasBody.querySelector('tr');
                                if (primeiraLinha) {
                                    const selects = primeiraLinha.querySelectorAll('select');
                                    if (selects[0]) selects[0].value = estampa.tipo;
                                    if (selects[1]) selects[1].value = estampa.localidade;
                                }
                            }
                        } else {
                            // Estampas adicionais - adicionar novas linhas
                            adicionarLinhaEstampa(produtoId);
                            const estampasBody = document.getElementById(`estampasBody-${produtoId}`);
                            if (estampasBody) {
                                const linhas = estampasBody.querySelectorAll('tr');
                                const linhaAtual = linhas[linhas.length - 1];
                                if (linhaAtual) {
                                    const selects = linhaAtual.querySelectorAll('select');
                                    if (selects[0]) selects[0].value = estampa.tipo;
                                    if (selects[1]) selects[1].value = estampa.localidade;
                                }
                            }
                        }
                    });
                }
                
                // Recalcular custos do produto
                calcularCustosProduto(produtoId);
            });
        }
        
        // Recalcular resumo financeiro
        calcularResumoFinanceiro();
        
        // Fechar modal de busca
        fecharModalBusca();
        
        // Mostrar notificação de sucesso
        Utils.mostrarNotificacao('Pedido carregado com sucesso!', 'success');
        
        // Scroll para o topo
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } catch (error) {
        console.error('Erro ao preencher formulário:', error);
        Utils.mostrarNotificacao('Erro ao carregar dados do pedido', 'error');
    }
}

function limparFormulario() {
    // Limpar dados do cliente
    document.getElementById('idPedido').value = '';
    document.getElementById('nomeCliente').value = '';
    document.getElementById('telefone').value = '';
    document.getElementById('dataPedido').value = '';
    document.getElementById('dataEntrega').value = '';
    document.getElementById('totalPecas').value = '';
    document.getElementById('observacoes').value = '';
    
    // Limpar resumo financeiro
    document.getElementById('resumoTotalPedido').textContent = 'R$ 0,00';
    document.getElementById('valorEntrada').value = '';
    document.getElementById('resumoRestante').textContent = 'R$ 0,00';
    
    // Limpar produtos
    const containerProdutos = document.getElementById('produtosContainer');
    containerProdutos.innerHTML = '';
    estadoApp.produtos = [];
    
    // Adicionar produto padrão
    adicionarProduto();
}

// ========== WhatsApp ==========
function enviarWhatsApp() {
    const nome = document.getElementById('nomeCliente').value;
    const telefone = Utils.limparTelefone(document.getElementById('telefone').value);
    const idPedido = document.getElementById('idPedido').value;
    const totalPedido = document.getElementById('resumoTotalPedido').textContent;
    const valorEntrada = document.getElementById('valorEntrada').value || '0';
    const restante = document.getElementById('resumoRestante').textContent;
    const dataEntrega = Utils.dataISOParaBR(document.getElementById('dataEntrega').value);
    
    if (!nome || !telefone) {
        Utils.mostrarNotificacao('Preencha nome e telefone do cliente', 'error');
        return;
    }
    
    // Montar mensagem
    const mensagem = `
*PEDIDO #${idPedido} - ADONAY CONFECÇÃO* 🎨

👤 *Cliente:* ${nome}
📅 *Entrega prevista:* ${dataEntrega}

💰 *VALORES*
• Total do Pedido: ${totalPedido}
• Entrada: R$ ${valorEntrada}
• Restante: ${restante}

📋 *Observações:*
${document.getElementById('observacoes').value || 'Nenhuma observação'}

---
📞 Qualquer dúvida, entre em contato!
ADONAY CONFECÇÃO
${CONFIG.EMPRESA.telefone1}
    `.trim();
    
    const url = `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
}

// ========== Loading ==========
function mostrarLoading(mensagem = 'Carregando...') {
    const loadingHTML = `
        <div class="loading-overlay" id="loadingOverlay">
            <div class="loading-content">
                <div class="loading loading-big"></div>
                <p>${mensagem}</p>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', loadingHTML);
}

function esconderLoading() {
    const loading = document.getElementById('loadingOverlay');
    if (loading) {
        loading.remove();
    }
}

