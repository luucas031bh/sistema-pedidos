/**
 * Admin: custos de cálculo persistidos na planilha (Code.gs).
 */
const estadoConfigCalculo = {
    malhas: [],
    maoObra: [],
    estampas: [],
    tamanhos: [],
    geral: { custo_fixo: 10, margem_padrao: 100, adicional_por_cor_silk: 0.25 }
};

function atualizarRelogioCfg() {
    const el = document.getElementById('relogio');
    if (el && typeof Utils !== 'undefined') el.textContent = Utils.dataHoraCompleta();
}

function escAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function renderTudo() {
    const tbM = document.getElementById('tbodyMalhas');
    const tbO = document.getElementById('tbodyMaoObra');
    const tbE = document.getElementById('tbodyEstampas');
    const tbT = document.getElementById('tbodyTamanhos');
    const g = estadoConfigCalculo.geral;
    document.getElementById('geralCustoFixo').value = g.custo_fixo;
    document.getElementById('geralMargem').value = g.margem_padrao;
    document.getElementById('geralAdicSilk').value = g.adicional_por_cor_silk;

    tbM.innerHTML = estadoConfigCalculo.malhas
        .map(
            (row, i) => `
        <tr data-idx="${i}" data-kind="malha">
            <td><input type="text" class="form-input cfg-id-malha" value="${escAttr(row.identificador)}"></td>
            <td><input type="number" class="form-input cfg-val-malha" min="0" step="0.01" value="${Number(row.valor)}"></td>
            <td><button type="button" class="btn btn-small btn-danger cfg-del">Remover</button></td>
        </tr>`
        )
        .join('');

    tbO.innerHTML = estadoConfigCalculo.maoObra
        .map(
            (row, i) => `
        <tr data-idx="${i}" data-kind="maoObra">
            <td><input type="text" class="form-input cfg-id-ob" value="${escAttr(row.identificador)}"></td>
            <td><input type="number" class="form-input cfg-val-ob" min="0" step="0.01" value="${Number(row.valor)}"></td>
            <td><button type="button" class="btn btn-small btn-danger cfg-del">Remover</button></td>
        </tr>`
        )
        .join('');

    tbE.innerHTML = estadoConfigCalculo.estampas
        .map(
            (row, i) => `
        <tr data-idx="${i}" data-kind="estampa">
            <td><input type="text" class="form-input cfg-tipo-est" value="${escAttr(row.tipo)}"></td>
            <td><input type="number" class="form-input cfg-e1" min="0" step="0.01" value="${Number(row.valor_10x10)}"></td>
            <td><input type="number" class="form-input cfg-e2" min="0" step="0.01" value="${Number(row.valor_10x6)}"></td>
            <td><input type="number" class="form-input cfg-e3" min="0" step="0.01" value="${Number(row.valor_a4)}"></td>
            <td><input type="number" class="form-input cfg-e4" min="0" step="0.01" value="${Number(row.valor_a3)}"></td>
            <td><input type="number" class="form-input cfg-e5" min="0" step="0.01" value="${Number(row.valor_full_print)}"></td>
            <td><button type="button" class="btn btn-small btn-danger cfg-del">Remover</button></td>
        </tr>`
        )
        .join('');

    tbT.innerHTML = estadoConfigCalculo.tamanhos
        .map(
            (row, i) => `
        <tr data-idx="${i}" data-kind="tamanho">
            <td><input type="text" class="form-input cfg-tam" value="${escAttr(row.tamanho)}"></td>
            <td><input type="number" class="form-input cfg-tam-v" min="0" step="0.01" value="${Number(row.valor)}"></td>
            <td><button type="button" class="btn btn-small btn-danger cfg-del">Remover</button></td>
        </tr>`
        )
        .join('');

    document.querySelectorAll('.cfg-del').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tr = btn.closest('tr');
            const kind = tr.getAttribute('data-kind');
            const idx = parseInt(tr.getAttribute('data-idx'), 10);
            if (kind === 'malha') estadoConfigCalculo.malhas.splice(idx, 1);
            else if (kind === 'maoObra') estadoConfigCalculo.maoObra.splice(idx, 1);
            else if (kind === 'estampa') estadoConfigCalculo.estampas.splice(idx, 1);
            else if (kind === 'tamanho') estadoConfigCalculo.tamanhos.splice(idx, 1);
            renderTudo();
        });
    });
}

function lerFormularioParaEstado() {
    estadoConfigCalculo.geral = {
        custo_fixo: parseFloat(document.getElementById('geralCustoFixo').value) || 0,
        margem_padrao: parseFloat(document.getElementById('geralMargem').value) || 0,
        adicional_por_cor_silk: parseFloat(document.getElementById('geralAdicSilk').value) || 0
    };
    estadoConfigCalculo.malhas = [];
    document.querySelectorAll('#tbodyMalhas tr').forEach((tr) => {
        const id = tr.querySelector('.cfg-id-malha')?.value?.trim() || '';
        const v = parseFloat(tr.querySelector('.cfg-val-malha')?.value) || 0;
        if (id) estadoConfigCalculo.malhas.push({ identificador: id, valor: v });
    });
    estadoConfigCalculo.maoObra = [];
    document.querySelectorAll('#tbodyMaoObra tr').forEach((tr) => {
        const id = tr.querySelector('.cfg-id-ob')?.value?.trim() || '';
        const v = parseFloat(tr.querySelector('.cfg-val-ob')?.value) || 0;
        if (id) estadoConfigCalculo.maoObra.push({ identificador: id, valor: v });
    });
    estadoConfigCalculo.estampas = [];
    document.querySelectorAll('#tbodyEstampas tr').forEach((tr) => {
        const tipo = tr.querySelector('.cfg-tipo-est')?.value?.trim() || '';
        if (!tipo) return;
        estadoConfigCalculo.estampas.push({
            tipo,
            valor_10x10: parseFloat(tr.querySelector('.cfg-e1')?.value) || 0,
            valor_10x6: parseFloat(tr.querySelector('.cfg-e2')?.value) || 0,
            valor_a4: parseFloat(tr.querySelector('.cfg-e3')?.value) || 0,
            valor_a3: parseFloat(tr.querySelector('.cfg-e4')?.value) || 0,
            valor_full_print: parseFloat(tr.querySelector('.cfg-e5')?.value) || 0
        });
    });
    estadoConfigCalculo.tamanhos = [];
    document.querySelectorAll('#tbodyTamanhos tr').forEach((tr) => {
        const tam = tr.querySelector('.cfg-tam')?.value?.trim() || '';
        const v = parseFloat(tr.querySelector('.cfg-tam-v')?.value);
        if (tam) estadoConfigCalculo.tamanhos.push({ tamanho: tam, valor: Number.isNaN(v) ? 1 : v });
    });
}

function aplicarRespostaServidor(data) {
    if (!data.sucesso) throw new Error(data.erro || 'Resposta inválida');
    estadoConfigCalculo.malhas = (data.malhas || []).map((m) => ({
        identificador: m.identificador,
        valor: Number(m.valor) || 0
    }));
    estadoConfigCalculo.maoObra = (data.maoObra || []).map((m) => ({
        identificador: m.identificador,
        valor: Number(m.valor) || 0
    }));
    estadoConfigCalculo.estampas = (data.estampas || []).map((e) => ({
        tipo: e.tipo,
        valor_10x10: Number(e.valor_10x10) || 0,
        valor_10x6: Number(e.valor_10x6) || 0,
        valor_a4: Number(e.valor_a4) || 0,
        valor_a3: Number(e.valor_a3) || 0,
        valor_full_print: Number(e.valor_full_print) || 0
    }));
    estadoConfigCalculo.tamanhos = (data.tamanhos || []).map((t) => ({
        tamanho: t.tamanho,
        valor: t.valor != null ? Number(t.valor) : 1
    }));
    estadoConfigCalculo.geral = {
        custo_fixo: Number(data.geral?.custo_fixo) || 10,
        margem_padrao: Number(data.geral?.margem_padrao) || 100,
        adicional_por_cor_silk: Number(data.geral?.adicional_por_cor_silk) || 0.25
    };
}

async function carregarDoServidor() {
    if (window.location.protocol === 'file:') {
        Utils.mostrarNotificacao('Abra via http(s) para carregar a planilha.', 'error');
        return;
    }
    const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=obterConfigCalculo&acao=obterConfigCalculo&_ts=${Date.now()}`);
    const data = await res.json();
    aplicarRespostaServidor(data);
    renderTudo();
    if (data.vazio) {
        Utils.mostrarNotificacao('Planilha sem dados: exibindo padrão. Salve para gravar.', 'info');
    } else {
        Utils.mostrarNotificacao('Configuração carregada.', 'success');
    }
}

async function salvarNoServidor() {
    if (window.location.protocol === 'file:') {
        Utils.mostrarNotificacao('Abra via http(s) para salvar.', 'error');
        return;
    }
    lerFormularioParaEstado();
    const payload = {
        action: 'salvarConfigCalculo',
        acao: 'salvarConfigCalculo',
        dados: {
            malhas: estadoConfigCalculo.malhas,
            maoObra: estadoConfigCalculo.maoObra,
            estampas: estadoConfigCalculo.estampas,
            tamanhos: estadoConfigCalculo.tamanhos,
            geral: estadoConfigCalculo.geral
        }
    };
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    });
    const texto = await res.text();
    let data;
    try {
        data = JSON.parse(texto);
    } catch (e) {
        Utils.mostrarNotificacao('Resposta inválida do servidor.', 'error');
        return;
    }
    if (data.sucesso) {
        Utils.mostrarNotificacao('Configuração salva com sucesso.', 'success');
    } else {
        Utils.mostrarNotificacao(data.erro || 'Falha ao salvar.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    atualizarRelogioCfg();
    setInterval(atualizarRelogioCfg, 1000);

    document.getElementById('btnRecarregarConfig')?.addEventListener('click', () => {
        carregarDoServidor().catch((err) => {
            console.error(err);
            Utils.mostrarNotificacao(String(err.message || err), 'error');
        });
    });
    document.getElementById('btnSalvarConfig')?.addEventListener('click', () => {
        salvarNoServidor().catch((err) => {
            console.error(err);
            Utils.mostrarNotificacao(String(err.message || err), 'error');
        });
    });

    document.getElementById('btnAddMalha')?.addEventListener('click', () => {
        lerFormularioParaEstado();
        estadoConfigCalculo.malhas.push({ identificador: '', valor: 0 });
        renderTudo();
    });
    document.getElementById('btnAddMaoObra')?.addEventListener('click', () => {
        lerFormularioParaEstado();
        estadoConfigCalculo.maoObra.push({ identificador: '', valor: 0 });
        renderTudo();
    });
    document.getElementById('btnAddEstampa')?.addEventListener('click', () => {
        lerFormularioParaEstado();
        estadoConfigCalculo.estampas.push({
            tipo: '',
            valor_10x10: 0,
            valor_10x6: 0,
            valor_a4: 0,
            valor_a3: 0,
            valor_full_print: 0
        });
        renderTudo();
    });
    document.getElementById('btnAddTamanho')?.addEventListener('click', () => {
        lerFormularioParaEstado();
        estadoConfigCalculo.tamanhos.push({ tamanho: '', valor: 1 });
        renderTudo();
    });

    carregarDoServidor().catch((err) => {
        console.error(err);
        Utils.mostrarNotificacao(String(err.message || err), 'error');
    });
});
