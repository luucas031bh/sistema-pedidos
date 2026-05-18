const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const form = document.getElementById("form-chat");
const input = document.getElementById("input");
const btnSend = document.getElementById("btn-send");
const statusBox = document.getElementById("status-box");
const selModelo = document.getElementById("sel-modelo");
const chkInternet = document.getElementById("chk-internet");
const btnNovo = document.getElementById("btn-novo");
const btnIndexar = document.getElementById("btn-indexar");
const btnIndexarSistema = document.getElementById("btn-indexar-sistema");
const indexStatus = document.getElementById("index-status");
const listaClientes = document.getElementById("lista-clientes");
const filePdf = document.getElementById("file-pdf");
const btnPdf = document.getElementById("btn-pdf");
const memoriaHint = document.getElementById("memoria-hint");
const inpApiBase = document.getElementById("inp-api-base");
const listaIntegracoes = document.getElementById("lista-integracoes");
const modelHint = document.getElementById("model-hint");

const SESSAO_KEY = "adonay_sessao_id";
const API_BASE_KEY = "adonay_api_base";
const DEFAULT_API_BASE = "http://127.0.0.1:8765";

function getApiBase() {
  const saved = localStorage.getItem(API_BASE_KEY);
  if (saved) return saved.replace(/\/$/, "");
  if (
    location.hostname === "127.0.0.1" ||
    location.hostname === "localhost"
  ) {
    return location.origin;
  }
  return DEFAULT_API_BASE;
}

function setApiBase(url) {
  const clean = (url || "").trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(API_BASE_KEY, clean);
  else localStorage.removeItem(API_BASE_KEY);
}

function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : "/" + path;
  return base + p;
}

let enviando = false;

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
  if (welcomeEl) welcomeEl.remove();
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
  if (meta?.rp_direto) {
    logs.push("✓ Dados reais do RP (planilha) — resposta sem inventar pedidos");
  }
  if (meta?.sistema_codigo) {
    logs.push(
      "✓ Código sistema-pedidos (pasta local indexada): " +
        (meta.arquivos || []).slice(0, 5).join(", ")
    );
  }
  if (meta?.intencao) {
    logs.push(`Intenção: ${meta.intencao} · executar: ${meta.executar}`);
  }
  (meta?.bloqueados || []).forEach((b) => {
    logs.push(`🚫 Bloqueado: ${b.ferramenta} — ${b.motivo}`);
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

function renderIntegracoes(lista) {
  if (!listaIntegracoes) return;
  if (!lista.length) {
    listaIntegracoes.innerHTML =
      '<p class="integracoes-vazio">Nenhuma integracao configurada.</p>';
    return;
  }
  listaIntegracoes.innerHTML = lista
    .map(
      (i) =>
        `<button type="button" class="btn-integracao" data-id="${i.id}" title="Modelo: ${i.modelo || "qwen2.5:7b"}">
          <strong>${i.nome}</strong>
          <span>${i.descricao || "Abre no terminal"}</span>
        </button>`
    )
    .join("");
  listaIntegracoes.querySelectorAll(".btn-integracao").forEach((btn) => {
    btn.addEventListener("click", () => abrirIntegracao(btn.dataset.id));
  });
}

async function abrirIntegracao(id) {
  try {
    const r = await fetch(apiUrl("/api/launch-integracao"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: id }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Erro");
    alert(d.mensagem || "Abrindo…");
  } catch (err) {
    alert("Nao foi possivel abrir: " + err.message);
  }
}

async function carregarClientes() {
  try {
    const r = await fetch(apiUrl("/api/clientes"));
    const d = await r.json();
    const lista = d.clientes || [];
    if (!lista.length) {
      listaClientes.textContent = "Indexe o OneDrive primeiro.";
      return;
    }
    listaClientes.innerHTML = lista
      .slice(0, 40)
      .map(
        (c) =>
          `<button type="button" class="cliente-item" data-msg="abrir pasta do ${c.cliente} ${c.ultimos_4_digitos}">${c.cliente} ${c.ultimos_4_digitos} (${c.n})</button>`
      )
      .join("");
    document.querySelectorAll(".cliente-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.msg;
        autoResize();
        form.requestSubmit();
      });
    });
  } catch {
    listaClientes.textContent = "Erro ao carregar clientes.";
  }
}

async function carregarStatus() {
  try {
    const r = await fetch(apiUrl("/api/status"));
    const d = await r.json();
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
      modelHint.textContent =
        modelos.length <= 1 && sug.length
          ? `So ha 1 modelo local. Para mais: ollama pull ${sug[0]}`
          : modelos.length
            ? `${modelos.length} modelo(s) no Ollama`
            : "Nenhum modelo — rode: ollama pull qwen2.5:7b";
    }
    renderIntegracoes(d.integracoes_ollama || []);
    if (d.ollama) {
      const idx = d.indexador?.arquivos_indexados ?? 0;
      const sp = d.indexador_sistema?.arquivos ?? 0;
      statusBox.textContent = `Ollama OK · ${d.modelo_padrao || ""} · OneDrive: ${idx} · sistema: ${sp} arq`;
      statusBox.className = "status-box ok";
    } else if (d.estado === "nao_instalado") {
      statusBox.textContent = "Ollama não instalado — ollama pull qwen2.5:7b";
      statusBox.className = "status-box err";
    } else if (d.estado === "sem_modelos") {
      statusBox.textContent = "Falta modelo: ollama pull qwen2.5:7b";
      statusBox.className = "status-box err";
    } else {
      statusBox.textContent = d.mensagem || "Ollama offline";
      statusBox.className = "status-box err";
    }
    if (d.indexando) {
      indexStatus.textContent = "Indexando…";
    } else if (d.indexador) {
      indexStatus.textContent = `${d.indexador.arquivos_indexados || 0} arquivos`;
    }
    if (memoriaHint && d.contexto_pasta) {
      memoriaHint.textContent = "Contexto: " + d.contexto_pasta;
      memoriaHint.title = d.historico_db || d.contexto_pasta;
    }
  } catch {
    statusBox.textContent = "Servidor offline — INICIAR.bat";
    statusBox.className = "status-box err";
  }
}

btnIndexarSistema?.addEventListener("click", async () => {
  indexStatus.textContent = "Indexando sistema-pedidos…";
  try {
    await fetch(apiUrl("/api/indexar-sistema"), { method: "POST" });
    const poll = setInterval(async () => {
      const r = await fetch(apiUrl("/api/indexar-sistema/status"));
      const s = await r.json();
      if (s.rodando) {
        indexStatus.textContent = "Indexando código… aguarde";
        return;
      }
      clearInterval(poll);
      const res = s.resultado || {};
      indexStatus.textContent = res.total_arquivos
        ? `Sistema: ${res.total_arquivos} arquivos, ${res.total_chunks} trechos`
        : res.erro || "Concluído";
      carregarStatus();
    }, 2000);
  } catch {
    indexStatus.textContent = "Erro ao indexar sistema";
  }
});

btnIndexar.addEventListener("click", async () => {
  indexStatus.textContent = "Iniciando…";
  try {
    await fetch(apiUrl("/api/indexar"), { method: "POST" });
    const poll = setInterval(async () => {
      const r = await fetch(apiUrl("/api/indexar/status"));
      const s = await r.json();
      if (s.rodando) {
        indexStatus.textContent = "Indexando… aguarde";
        return;
      }
      clearInterval(poll);
      const res = s.resultado || {};
      indexStatus.textContent = res.total
        ? `OK: ${res.total} arquivos`
        : res.erro || "Concluído";
      carregarStatus();
      carregarClientes();
    }, 2000);
  } catch {
    indexStatus.textContent = "Erro ao indexar";
  }
});

btnPdf.addEventListener("click", () => filePdf.click());

filePdf.addEventListener("change", async () => {
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
        modelo: selModelo.value || null,
        permitir_internet: chkInternet.checked,
      }),
    });
    const d = await r.json();
    removeTyping();
    if (!r.ok) throw new Error(d.detail || "Erro na API");
    addMessage("bot", d.resposta, d.passos || [], d.meta || null);
  } catch (err) {
    removeTyping();
    addMessage("bot", "Erro: " + err.message);
  }

  enviando = false;
  btnSend.disabled = false;
  input.focus();
});

const WELCOME_HTML =
  "<h1>Olá</h1>" +
  "<p>Converse normalmente ou dê comandos claros: abrir programa, pasta do cliente, CDR, RP.</p>" +
  '<div class="chips">' +
  '<button type="button" class="chip" data-msg="abrir corel">Abrir Corel</button>' +
  '<button type="button" class="chip" data-msg="abrir pasta do Victor 0032">Pasta Victor 0032</button>' +
  '<button type="button" class="chip" data-msg="abrir fila do RP">Fila RP</button>' +
  '<button type="button" class="chip" data-msg="me mostrar todos os pedidos com status em arte">Pedidos em ARTE</button>' +
  '<button type="button" class="chip" data-msg="como funciona o Code.gs do sistema de pedidos?">Como funciona Code.gs</button>' +
  "</div>";

async function carregarHistorico() {
  const sessao = obterSessaoId();
  try {
    const r = await fetch(
      apiUrl(
        "/api/historico?sessao=" + encodeURIComponent(sessao) + "&limite=200"
      )
    );
    const d = await r.json();
    const msgs = d.mensagens || [];
    if (!msgs.length) return;
    esconderWelcome();
    msgs.forEach((m) => {
      const role = m.role === "user" ? "user" : "bot";
      addMessage(role, m.content || "");
    });
    if (memoriaHint && d.total) {
      const base = memoriaHint.textContent || "Contexto salvo";
      memoriaHint.textContent = base + " · " + d.total + " mensagens";
    }
  } catch {
    /* sem historico */
  }
}

btnNovo.addEventListener("click", async () => {
  const antiga = obterSessaoId();
  await fetch(apiUrl("/api/limpar?sessao=" + encodeURIComponent(antiga)), {
    method: "POST",
  });
  novaSessaoId();
  messagesEl.innerHTML = "";
  const w = document.createElement("div");
  w.className = "welcome";
  w.id = "welcome";
  w.innerHTML = WELCOME_HTML;
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

bindChips();

if (inpApiBase) {
  inpApiBase.value = getApiBase();
  inpApiBase.addEventListener("change", () => {
    setApiBase(inpApiBase.value);
    carregarStatus();
    carregarClientes();
  });
}

carregarStatus();
carregarClientes();
carregarHistorico();
setInterval(carregarStatus, 15000);
