const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const form = document.getElementById("form-chat");
const input = document.getElementById("input");
const btnSend = document.getElementById("btn-send");
const statusBox = document.getElementById("status-box");
const selModelo = document.getElementById("sel-modelo");
const selProvedor = document.getElementById("sel-provedor");
const modelHint = document.getElementById("model-hint");
const provedorHint = document.getElementById("provedor-hint");
const chkInternet = document.getElementById("chk-internet");
const btnNovo = document.getElementById("btn-novo");
const btnIndexar = document.getElementById("btn-indexar");
const btnIndexarSistema = document.getElementById("btn-indexar-sistema");
const indexStatus = document.getElementById("index-status");
const listaClientes = document.getElementById("lista-clientes");
const filePdf = document.getElementById("file-pdf");
const btnPdf = document.getElementById("btn-pdf");
const llmBar = document.getElementById("llm-bar");
const ctxLabel = document.getElementById("ctx-label");
const listaTerminais = document.getElementById("lista-terminais");
const panelApiRemoto = document.getElementById("panel-api-remoto");
const inpApiBase = document.getElementById("inp-api-base");
const llmAviso = document.getElementById("llm-aviso");

const SESSAO_KEY = "adonay_sessao_id";
const PROVEDOR_KEY = "adonay_provedor";
const MODO_KEY = "adonay_modo";
const API_BASE_KEY = "adonay_api_base";
const DEFAULT_API_BASE = "http://127.0.0.1:8765";

const PROVEDOR_LABELS = {
  adonay: "OLLAMA",
  claude: "CLAUDE",
  openclaw: "CLAW",
  ollama: "OLLAMA",
};

const HINTS = {
  adonay: "OLLAMA: pedidos RP, OneDrive e acoes no PC (contexto compartilhado)",
  claude:
    "CLAUDE: responde no chat (codigo). Terminal opcional — botao na barra lateral.",
  openclaw:
    "CLAW: responde no chat. Pode demorar 1–3 min. Terminal opcional na lateral.",
};

const AVISOS_PROVEDOR = {
  claude: "Dica: para codigo longo, use tambem o terminal Claude (barra lateral).",
  openclaw: "Dica: CLAW no chat pode demorar; mensagens curtas funcionam melhor.",
};

let modoAtual = localStorage.getItem(MODO_KEY) || "auto";
let enviando = false;

function isLocalUi() {
  return (
    location.hostname === "127.0.0.1" || location.hostname === "localhost"
  );
}

function getApiBase() {
  const saved = localStorage.getItem(API_BASE_KEY);
  if (saved) return saved.replace(/\/$/, "");
  if (isLocalUi()) return location.origin;
  return DEFAULT_API_BASE;
}

function setApiBase(url) {
  const clean = (url || "").trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(API_BASE_KEY, clean);
  else localStorage.removeItem(API_BASE_KEY);
}

function apiUrl(path) {
  const base = getApiBase();
  return base + (path.startsWith("/") ? path : "/" + path);
}

function obterSessaoId() {
  let id = localStorage.getItem(SESSAO_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "sessao-" + Date.now();
    localStorage.setItem(SESSAO_KEY, id);
  }
  return id;
}

function novaSessaoId() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "sessao-" + Date.now();
  localStorage.setItem(SESSAO_KEY, id);
  return id;
}

function obterProvedorId() {
  if (selProvedor?.value) return selProvedor.value;
  const ativo = llmBar?.querySelector(".llm-pill.active");
  return ativo?.dataset.provedor || localStorage.getItem(PROVEDOR_KEY) || "adonay";
}

function definirProvedor(id) {
  localStorage.setItem(PROVEDOR_KEY, id);
  if (selProvedor) selProvedor.value = id;
  llmBar?.querySelectorAll(".llm-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.provedor === id);
  });
  atualizarHintProvedor();
}

function atualizarHintProvedor() {
  if (!provedorHint) return;
  const id = obterProvedorId();
  provedorHint.textContent = HINTS[id] || HINTS.adonay;
  if (llmAviso) llmAviso.textContent = AVISOS_PROVEDOR[id] || "";
  if (ctxLabel) {
    const label = PROVEDOR_LABELS[id] || id.toUpperCase();
    ctxLabel.textContent = `Contexto compartilhado · ${label}`;
  }
}

async function abrirTerminalIntegracao(id) {
  try {
    const r = await fetch(apiUrl("/api/launch-integracao"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Falha ao abrir");
    if (statusBox) {
      statusBox.textContent = d.mensagem || "Terminal aberto";
      statusBox.className = "status-box ok";
    }
  } catch (err) {
    const msg =
      err.message +
      "\n\n• Servidor local ligado? (AdonayPainel → Servidor web)\n" +
      "• URL correta: http://127.0.0.1:8765\n" +
      "• Ou use AdonayPainel.exe → Ligar em Claude / OpenClaw";
    alert(msg);
  }
}

function renderTerminais(integracoes) {
  if (!listaTerminais) return;
  const lista = integracoes || [];
  if (!lista.length) {
    listaTerminais.innerHTML =
      '<p class="ias-help muted">Terminais: use AdonayPainel.exe</p>';
    return;
  }
  listaTerminais.innerHTML = lista
    .map(
      (i) =>
        `<button type="button" class="btn-terminal" data-id="${i.id}">Abrir ${i.nome || i.id}</button>`
    )
    .join("");
  listaTerminais.querySelectorAll(".btn-terminal").forEach((btn) => {
    btn.addEventListener("click", () => abrirTerminalIntegracao(btn.dataset.id));
  });
}

function initApiRemoto() {
  if (!panelApiRemoto) return;
  if (isLocalUi()) {
    panelApiRemoto.hidden = true;
    return;
  }
  panelApiRemoto.hidden = false;
  if (inpApiBase) {
    inpApiBase.value = getApiBase();
    inpApiBase.addEventListener("change", () => {
      setApiBase(inpApiBase.value);
      carregarStatus();
      carregarClientes();
      carregarHistorico();
    });
  }
  if (statusBox) {
    statusBox.textContent =
      "Pagina no GitHub — aponte o servidor para http://127.0.0.1:8765";
    statusBox.className = "status-box err";
  }
}

function initLlmPills() {
  const salvo = localStorage.getItem(PROVEDOR_KEY) || "adonay";
  definirProvedor(salvo);
  llmBar?.querySelectorAll(".llm-pill").forEach((btn) => {
    btn.addEventListener("click", () => definirProvedor(btn.dataset.provedor));
  });
  selProvedor?.addEventListener("change", () => definirProvedor(selProvedor.value));
}

function renderProvedoresChat(lista) {
  if (!selProvedor || !lista?.length) return;
  const salvo = localStorage.getItem(PROVEDOR_KEY) || "adonay";
  const ordem = ["adonay", "claude", "openclaw", "ollama"];
  selProvedor.innerHTML = "";
  lista
    .slice()
    .sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id))
    .forEach((p) => {
      if (p.id === "ollama") return;
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.nome || p.id;
      if (p.id === salvo) o.selected = true;
      selProvedor.appendChild(o);
    });
  definirProvedor(selProvedor.value || salvo);
}

function initModoButtons() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === modoAtual);
    btn.addEventListener("click", () => {
      modoAtual = btn.dataset.mode;
      localStorage.setItem(MODO_KEY, modoAtual);
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const ph = {
        auto: "Pergunta ou acao — a IA decide…",
        pergunta: "Faca uma pergunta…",
        acao: "Descreva a acao (abrir, listar, consultar RP)…",
      };
      input.placeholder = ph[modoAtual] || ph.auto;
    });
  });
  input.placeholder = "Pergunta ou acao — a IA decide…";
}

document.getElementById("btn-toggle-side")?.addEventListener("click", () => {
  document.querySelector(".app")?.classList.toggle("sidebar-collapsed");
});

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
}

input.addEventListener("input", autoResize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

function esconderWelcome() {
  welcomeEl?.remove();
}

function formatPasso(p) {
  if (p.bloqueado || p.resultado?.bloqueado) {
    return `🚫 ${p.ferramenta}: BLOQUEADO — ${p.motivo || p.resultado?.motivo || ""}`;
  }
  const r =
    typeof p.resultado === "object"
      ? JSON.stringify(p.resultado)
      : String(p.resultado);
  return `⚙ ${p.ferramenta}: ${r.slice(0, 160)}`;
}

function labelProvedor(meta) {
  const id = meta?.provedor || "adonay";
  return PROVEDOR_LABELS[id] || String(id).toUpperCase();
}

function addMessage(role, text, passos = [], meta = null) {
  esconderWelcome();
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const av = document.createElement("div");
  av.className = "avatar";
  av.textContent = role === "user" ? "V" : "IA";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(av);
  row.appendChild(bubble);

  const logs = [];
  if (meta?.provedor) logs.push(`IA: ${labelProvedor(meta)}`);
  if (meta?.rp_direto) logs.push("✓ Dados reais do RP");
  if (meta?.sistema_codigo) logs.push("✓ Codigo sistema-pedidos");
  if (meta?.intencao) logs.push(`Intencao: ${meta.intencao}`);
  (meta?.bloqueados || []).forEach((b) => {
    logs.push(`🚫 ${b.ferramenta}: ${b.motivo}`);
  });
  if (passos.length && role === "bot") {
    passos.forEach((p) => logs.push(formatPasso(p)));
  }
  if (logs.length) {
    const log = document.createElement("div");
    log.className = "tool-log";
    log.textContent = logs.join("\n");
    bubble.appendChild(log);
  }

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addTyping() {
  esconderWelcome();
  const row = document.createElement("div");
  row.className = "msg-row bot";
  row.id = "typing-row";
  row.innerHTML = `
    <div class="avatar">IA</div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>
  `;
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  document.getElementById("typing-row")?.remove();
}

async function carregarClientes() {
  if (!listaClientes) return;
  try {
    const r = await fetch(apiUrl("/api/clientes"));
    const d = await r.json();
    const lista = d.clientes || [];
    if (!lista.length) {
      listaClientes.textContent = "Indexe o OneDrive.";
      return;
    }
    listaClientes.innerHTML = lista
      .slice(0, 40)
      .map(
        (c) =>
          `<button type="button" class="cliente-item" data-msg="abrir pasta do ${c.cliente} ${c.ultimos_4_digitos}">${c.cliente} ${c.ultimos_4_digitos}</button>`
      )
      .join("");
    listaClientes.querySelectorAll(".cliente-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.msg;
        autoResize();
        form.requestSubmit();
      });
    });
  } catch {
    listaClientes.textContent = "Servidor offline.";
  }
}

async function carregarStatus() {
  try {
    const r = await fetch(apiUrl("/api/status"));
    const d = await r.json();
    if (selModelo) {
      selModelo.innerHTML = "";
      const modelos = [...new Set(d.modelos || [])];
      modelos.forEach((m) => {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        if (m === d.modelo_padrao) o.selected = true;
        selModelo.appendChild(o);
      });
      if (modelHint) {
        const sug = (d.modelos_sugeridos || []).filter((m) => !modelos.includes(m));
        modelHint.textContent = modelos.length
          ? `${modelos.length} modelo(s) Ollama. Claude/CLAW: menu "Quem responde no chat".`
          : `Nenhum modelo. Rode: ollama pull ${sug[0] || "qwen2.5:7b"}`;
      }
    }
    renderProvedoresChat(d.provedores || []);
    const diag = d.diagnostico_ias || {};
    if (diag.claude && !diag.claude.instalado && provedorHint) {
      provedorHint.textContent =
        "CLAUDE nao instalado. Rode INSTALAR_CLAUDE_E_CLAW.bat";
    }
    if (llmAviso && diag.openclaw) {
      llmAviso.textContent = diag.openclaw.instalado
        ? "CLAW no chat pode demorar 1–3 min; prefira CLAUDE se der erro."
        : "CLAW nao instalado. Rode INSTALAR_CLAUDE_E_CLAW.bat";
    }
    if (d.ollama) {
      const idx = d.indexador?.arquivos_indexados ?? 0;
      statusBox.textContent = `Ollama OK · ${d.modelo_padrao || ""} · ${idx} arq`;
      statusBox.className = "status-box ok";
    } else {
      statusBox.textContent = d.mensagem || "Ollama offline — use ABRIR_PAINEL.bat";
      statusBox.className = "status-box err";
    }
    if (d.indexando) indexStatus.textContent = "Indexando…";
    else if (d.indexador)
      indexStatus.textContent = `${d.indexador.arquivos_indexados || 0} arquivos`;
    renderTerminais(d.integracoes_ollama || []);
  } catch (err) {
    statusBox.textContent = isLocalUi()
      ? "Offline — AdonayPainel.exe ou INICIAR_TUDO.bat"
      : `Sem conexao com ${getApiBase()} — ligue o servidor no PC`;
    statusBox.className = "status-box err";
    renderTerminais([]);
  }
}

btnIndexarSistema?.addEventListener("click", async () => {
  indexStatus.textContent = "Indexando sistema…";
  await fetch(apiUrl("/api/indexar-sistema"), { method: "POST" });
  const poll = setInterval(async () => {
    const s = await (await fetch(apiUrl("/api/indexar-sistema/status"))).json();
    if (s.rodando) return;
    clearInterval(poll);
    indexStatus.textContent = s.resultado?.total_arquivos
      ? `Sistema: ${s.resultado.total_arquivos} arq`
      : "OK";
    carregarStatus();
  }, 2000);
});

btnIndexar?.addEventListener("click", async () => {
  indexStatus.textContent = "Indexando…";
  await fetch(apiUrl("/api/indexar"), { method: "POST" });
  const poll = setInterval(async () => {
    const s = await (await fetch(apiUrl("/api/indexar/status"))).json();
    if (s.rodando) return;
    clearInterval(poll);
    indexStatus.textContent = s.resultado?.total ? `OK: ${s.resultado.total}` : "OK";
    carregarStatus();
    carregarClientes();
  }, 2000);
});

btnPdf?.addEventListener("click", () => filePdf.click());

filePdf?.addEventListener("change", async () => {
  const f = filePdf.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  try {
    const r = await fetch(apiUrl("/api/upload-pdf"), { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    input.value = `leia o pdf em ${d.caminho}`;
    autoResize();
  } catch (err) {
    alert("Erro no upload: " + err.message);
  }
  filePdf.value = "";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = input.value.trim();
  if (!texto || enviando) return;

  enviando = true;
  btnSend.disabled = true;
  input.value = "";
  autoResize();

  addMessage("user", texto);
  addTyping();

  try {
    const r = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: texto,
        sessao: obterSessaoId(),
        provedor: obterProvedorId(),
        modo: modoAtual,
        modelo: selModelo?.value || null,
        permitir_internet: chkInternet?.checked,
      }),
    });
    const d = await r.json();
    removeTyping();
    if (!r.ok) throw new Error(d.detail || "Erro na API");
    addMessage("bot", d.resposta, d.passos || [], d.meta || null);
  } catch (err) {
    removeTyping();
    let msg = err.message;
    const pid = obterProvedorId();
    if (pid === "claude" || pid === "openclaw") {
      msg +=
        "\n\nNo chat: so envie mensagem com a pílula " +
        (PROVEDOR_LABELS[pid] || pid) +
        " ativa.\n" +
        "Terminal (opcional): botao na barra lateral ou AdonayPainel.exe.";
    }
    if (!isLocalUi() && /fetch|network|failed/i.test(msg)) {
      msg += "\n\nConfira o campo Servidor no PC (porta 8765) na barra lateral.";
    }
    addMessage("bot", "Erro: " + msg);
  }

  enviando = false;
  btnSend.disabled = false;
  input.focus();
});

const WELCOME_HTML = document.getElementById("welcome")?.outerHTML || "";

async function carregarHistorico() {
  try {
    const r = await fetch(
      apiUrl("/api/historico?sessao=" + encodeURIComponent(obterSessaoId()) + "&limite=200")
    );
    const d = await r.json();
    const msgs = d.mensagens || [];
    if (!msgs.length) return;
    esconderWelcome();
    msgs.forEach((m) => {
      addMessage(m.role === "user" ? "user" : "bot", m.content || "");
    });
  } catch {
    /* vazio */
  }
}

btnNovo?.addEventListener("click", async () => {
  const antiga = obterSessaoId();
  await fetch(apiUrl("/api/limpar?sessao=" + encodeURIComponent(antiga)), { method: "POST" });
  novaSessaoId();
  messagesEl.innerHTML = "";
  const w = document.createElement("div");
  w.className = "welcome";
  w.id = "welcome";
  w.innerHTML = `
    <div class="welcome-icon">◇</div>
    <h2>Como posso ajudar?</h2>
    <p>Pergunte ou peca uma acao. Troque a IA embaixo (OLLAMA, CLAUDE, CLAW).</p>
    <div class="chips">
      <button type="button" class="chip" data-msg="resumo financeiro dos pedidos em aberto">Resumo RP</button>
      <button type="button" class="chip" data-msg="abrir corel">Abrir Corel</button>
    </div>
  `;
  messagesEl.appendChild(w);
  bindChips();
});

function bindChips() {
  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.msg;
      autoResize();
      form.requestSubmit();
    });
  });
}

initApiRemoto();
initLlmPills();
initModoButtons();
bindChips();
carregarStatus();
carregarClientes();
carregarHistorico();
setInterval(carregarStatus, 15000);
