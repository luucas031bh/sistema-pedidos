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
const listaAtendimentos = document.getElementById("lista-atendimentos");
const snapshotResumo = document.getElementById("snapshot-resumo");
const whatsappStatus = document.getElementById("whatsapp-status");
const btnWhatsappQr = document.getElementById("btn-whatsapp-qr");
const observadorBar = document.getElementById("observador-bar");
const observadorTexto = document.getElementById("observador-texto");
const filePdf = document.getElementById("file-pdf");
const btnPdf = document.getElementById("btn-pdf");
const llmBar = document.getElementById("llm-bar");
const ctxLabel = document.getElementById("ctx-label");
const listaTerminais = document.getElementById("lista-terminais");
const panelApiRemoto = document.getElementById("panel-api-remoto");
const inpApiBase = document.getElementById("inp-api-base");
const inpApiToken = document.getElementById("inp-api-token");
const apiRemotoAjuda = document.getElementById("api-remoto-ajuda");
const llmAviso = document.getElementById("llm-aviso");
const linkFilaRp = document.getElementById("link-fila-rp");

const RP_HOME_FALLBACK =
  "https://luucas031bh.github.io/sistema-pedidos/home.html";

const SESSAO_KEY = "adonay_sessao_id";
const PROVEDOR_KEY = "adonay_provedor";
const MODO_KEY = "adonay_modo";
const API_BASE_KEY = "adonay_api_base";
const API_TOKEN_KEY = "adonay_api_token";
const DEFAULT_API_BASE = "http://127.0.0.1:8765";
const PUBLIC_CONFIG_FILE = "adny-public.json";

const PROVEDOR_FIXO = "adonay";

const PROVEDOR_LABELS = {
  adonay: "ADNY",
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

function getApiToken() {
  return (localStorage.getItem(API_TOKEN_KEY) || "").trim();
}

function setApiToken(token) {
  const t = (token || "").trim();
  if (t) localStorage.setItem(API_TOKEN_KEY, t);
  else localStorage.removeItem(API_TOKEN_KEY);
}

function apiHeaders(extra = {}) {
  const h = { ...extra };
  const t = getApiToken();
  if (t) h["X-Adonay-Token"] = t;
  return h;
}

async function apiFetch(path, options = {}) {
  const opts = { ...options };
  opts.headers = apiHeaders(opts.headers || {});
  return fetch(apiUrl(path), opts);
}

async function carregarPublicConfig() {
  if (isLocalUi()) return null;
  try {
    const cfgUrl = new URL(PUBLIC_CONFIG_FILE, location.href).href;
    const r = await fetch(`${cfgUrl}?v=${Date.now()}`);
    if (!r.ok) return null;
    const cfg = await r.json();
    if (cfg.api_url) {
      setApiBase(String(cfg.api_url).replace(/\/$/, ""));
      if (inpApiBase) inpApiBase.value = getApiBase();
    }
    return cfg;
  } catch {
    return null;
  }
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
  return PROVEDOR_FIXO;
}

function definirProvedor(_id) {
  localStorage.setItem(PROVEDOR_KEY, PROVEDOR_FIXO);
  atualizarHintProvedor();
}

function atualizarHintProvedor() {
  if (provedorHint) {
    provedorHint.textContent =
      "ADNY Hub-and-Spoke · dados reais (pedidos.json + WhatsApp + RP).";
  }
  if (ctxLabel) ctxLabel.textContent = "Assistente unico · WhatsApp + RP";
}

async function abrirTerminalIntegracao(id) {
  try {
    const r = await apiFetch("/api/launch-integracao", {
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
      "\n\n• Servidor local ligado? (INICIAR_TUDO.bat ou AdonayPainel)\n" +
      "• URL correta: http://127.0.0.1:8765";
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

function initLinkFilaRp() {
  if (!linkFilaRp) return;
  if (isLocalUi()) {
    linkFilaRp.href = apiUrl("/fila-rp");
    return;
  }
  try {
    linkFilaRp.href = new URL("../../home.html", location.href).href;
  } catch {
    linkFilaRp.href = RP_HOME_FALLBACK;
  }
}

async function atualizarLinkFilaRp() {
  if (!linkFilaRp) return;
  try {
    const r = await apiFetch("/api/config");
    if (!r.ok) return;
    const cfg = await r.json();
    const rp = cfg.rp || {};
    const url = rp.url_home || cfg.rp_url_home;
    if (url) linkFilaRp.href = isLocalUi() ? apiUrl("/fila-rp") : url;
  } catch {
    /* mantem fallback */
  }
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
      recarregarPainel();
    });
  }
  if (inpApiToken) {
    inpApiToken.value = getApiToken();
    inpApiToken.addEventListener("change", () => {
      setApiToken(inpApiToken.value);
      recarregarPainel();
    });
  }
  if (statusBox && !getApiBase()) {
    statusBox.textContent =
      "Configure api_url em static/adny-public.json (tunel HTTPS) e publique no GitHub.";
    statusBox.className = "status-box err";
  } else if (statusBox && getApiBase() && !getApiToken()) {
    statusBox.textContent = "Informe o Token ADNY no painel lateral (uma vez por aparelho).";
    statusBox.className = "status-box warn";
  }
}

function recarregarPainel() {
  carregarStatus();
  carregarSnapshot();
  carregarHistorico();
}

function initLlmPills() {
  definirProvedor(PROVEDOR_FIXO);
}

function renderProvedoresChat(_lista) {
  definirProvedor(PROVEDOR_FIXO);
}

function initModoButtons() {
  input.placeholder = "Mensagem para o ADNY…";
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
  if (p.agente === "consultor_whatsapp") {
    return `📋 Consultor WhatsApp: ${p.mensagens ?? 0} mensagem(ns) (${p.periodo_horas ?? "?"}h)`;
  }
  if (p.agente === "followup_whatsapp") {
    return `↩ Follow-up WhatsApp: ${p.modo || "continuacao"} (${p.mensagens ?? 0} msg)`;
  }
  if (p.agente === "sintetizador") {
    if (p.modo === "briefing") return "📋 Sintetizador: briefing ADNY (snapshot factual)";
    return `📋 Sintetizador: ${p.conversas ?? 0} conversa(s) no snapshot`;
  }
  if (p.agente === "gerente_fila") {
    return `📋 Gerente Fila: ${p.total_abertos ?? "?"} pedido(s) abertos`;
  }
  if (p.agente === "calculadora_malha") {
    return `📋 Calculadora Malha${p.codigo ? ` · pedido ${p.codigo}` : ""}`;
  }
  if (p.agente === "developer_local") {
    return `📋 Developer Local${p.arquivos != null ? ` · ${p.arquivos} arquivo(s)` : ""}`;
  }
  if (p.bloqueado || p.resultado?.bloqueado) {
    return `🚫 ${p.ferramenta}: BLOQUEADO — ${p.motivo || p.resultado?.motivo || ""}`;
  }
  if (!p.ferramenta) {
    if (p.agente) return `📋 ${p.agente}`;
    return "";
  }
  const r =
    typeof p.resultado === "object"
      ? JSON.stringify(p.resultado)
      : String(p.resultado ?? "");
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
  if (meta?.route) logs.push(`Rota: ${meta.route}`);
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

function renderObservadorBar(st) {
  if (!observadorBar || !observadorTexto) return;
  observadorBar.hidden = false;
  const stats = st.observador_stats || {};
  const nome = (st.whatsapp_nome || "").trim();
  const conta = nome || (st.whatsapp_bot || "").replace(/@.+$/, "") || "";

  if (st.whatsapp_conectado) {
    observadorBar.className = "observador-bar ok";
    const enc = stats.dms_encaminhadas || 0;
    const logTotal = st.mensagens_no_log ?? 0;
    const falhas = stats.dms_falha_envio || 0;
    let extra = `${enc} encaminhada(s) · ${logTotal} no log`;
    if (falhas > 0) extra += ` · ${falhas} falha(s) API`;
    if (enc === 0 && (stats.dms_recebidas || 0) > 0) {
      extra += " — reinicie o bot se acabou de atualizar";
    }
    observadorTexto.textContent =
      `Observador ativo${conta ? ` (${conta})` : ""} · ${extra}`;
  } else if (st.whatsapp_aguardando_qr) {
    observadorBar.className = "observador-bar warn";
    observadorTexto.textContent = "Observador aguardando QR — escaneie no celular";
  } else if (st.whatsapp_bot_rodando) {
    observadorBar.className = "observador-bar warn";
    observadorTexto.textContent = "Bot WhatsApp rodando — reconectando…";
  } else {
    observadorBar.className = "observador-bar err";
    observadorTexto.textContent =
      "Observador offline — use Conectar WhatsApp (QR) na barra lateral";
  }
}

async function carregarSnapshot() {
  if (!snapshotResumo || !listaAtendimentos) return;
  try {
    const [rSnap, rStatus] = await Promise.all([
      apiFetch("/api/pedidos-snapshot"),
      apiFetch("/api/observador/status"),
    ]);
    const d = await rSnap.json();
    const st = rStatus.ok ? await rStatus.json() : {};

    renderObservadorBar(st);

    if (whatsappStatus) {
      if (st.whatsapp_conectado) {
        const stats = st.observador_stats || {};
        const totalLog = st.mensagens_no_log ?? 0;
        const enc = stats.dms_encaminhadas || 0;
        whatsappStatus.textContent =
          `Conectado · ${totalLog} msg no log · ${enc} encaminhada(s) ao Python`;
        whatsappStatus.className = enc > 0 || totalLog > 0 ? "wpp-status ok" : "wpp-status warn";
      } else if (st.whatsapp_aguardando_qr) {
        whatsappStatus.textContent = "Escaneie o QR (janela Adonay WhatsApp ou whatsapp-qr.png)";
        whatsappStatus.className = "wpp-status warn";
      } else if (st.whatsapp_bot_rodando) {
        whatsappStatus.textContent = "Bot rodando — aguardando conexão…";
        whatsappStatus.className = "wpp-status warn";
      } else {
        whatsappStatus.textContent = "WhatsApp offline — clique em Conectar WhatsApp (QR)";
        whatsappStatus.className = "wpp-status err";
      }
    }

    const m = d.metricas || {};
    const fila = d.fila_rp || {};
    snapshotResumo.textContent =
      `RP abertos: ${fila.total_abertos ?? "?"} · Orçamentos: ${m.orcamentos_pendentes ?? 0} · ` +
      `Sem resp. 24h: ${m.sem_resposta_24h ?? 0}`;
    const conversas = (d.whatsapp && d.whatsapp.conversas_ativas) || [];
    if (!conversas.length) {
      listaAtendimentos.innerHTML =
        '<span class="muted">Nenhuma DM capturada ainda. Só aparecem mensagens reais do WhatsApp.</span>';
      return;
    }
    listaAtendimentos.innerHTML = conversas
      .slice(0, 12)
      .map((c) => {
        const tel = c.telefone || "";
        const nome = (c.nome || "").trim();
        const rotulo = nome ? `${nome} (${tel})` : tel;
        return (
          `<button type="button" class="atendimento-item" data-msg="resumo do atendimento ${tel} ${c.intencao || ""}">` +
          `<span class="tag">${c.intencao || "outro"}</span> ` +
          `${rotulo}: ${(c.resumo || c.ultima_msg || "").slice(0, 50)}` +
          `</button>`
        );
      })
      .join("");
    listaAtendimentos.querySelectorAll(".atendimento-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.msg;
        autoResize();
        form.requestSubmit();
      });
    });
  } catch {
    snapshotResumo.textContent = "Snapshot offline.";
    listaAtendimentos.textContent = "—";
    if (whatsappStatus) {
      whatsappStatus.textContent = "Status WhatsApp indisponível";
      whatsappStatus.className = "wpp-status err";
    }
  }
}

async function conectarWhatsapp() {
  try {
    const r = await apiFetch("/api/launch-whatsapp", { method: "POST" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Falha ao abrir bot");
    if (whatsappStatus) {
      whatsappStatus.textContent = d.mensagem || "Abrindo janela do WhatsApp…";
      whatsappStatus.className = "wpp-status warn";
    }
    setTimeout(carregarSnapshot, 4000);
  } catch (err) {
    alert(String(err.message || err));
  }
}

btnWhatsappQr?.addEventListener("click", conectarWhatsapp);

async function carregarStatus() {
  try {
    const r = await apiFetch("/api/status");
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
          ? `${modelos.length} modelo(s) local(is). Roteamento automatico.`
          : `Nenhum modelo. Rode: ollama pull ${sug[0] || "qwen2.5:7b"}`;
      }
    }
    renderProvedoresChat(d.provedores || []);
    if (d.ollama) {
      statusBox.textContent = `ADNY online · ${d.modelo_padrao || ""}`;
      statusBox.className = "status-box ok";
    } else {
      statusBox.textContent = d.mensagem || "Ollama offline — use INICIAR_TUDO.bat";
      statusBox.className = "status-box err";
    }
  } catch (err) {
    statusBox.textContent = isLocalUi()
      ? "Offline — AdonayPainel.exe ou INICIAR_TUDO.bat"
      : `Sem conexao com ${getApiBase()} — PC host ligado? Tunel ativo? Token correto?`;
    statusBox.className = "status-box err";
    renderTerminais([]);
  }
}

btnIndexarSistema?.addEventListener("click", async () => {
  indexStatus.textContent = "Indexando sistema…";
  await apiFetch("/api/indexar-sistema", { method: "POST" });
  const poll = setInterval(async () => {
    const s = await (await apiFetch("/api/indexar-sistema/status")).json();
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
  await apiFetch("/api/indexar", { method: "POST" });
  const poll = setInterval(async () => {
    const s = await (await apiFetch("/api/indexar/status")).json();
    if (s.rodando) return;
    clearInterval(poll);
    indexStatus.textContent = s.resultado?.total ? `OK: ${s.resultado.total}` : "OK";
    carregarStatus();
  }, 2000);
});

btnPdf?.addEventListener("click", () => filePdf.click());

filePdf?.addEventListener("change", async () => {
  const f = filePdf.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  try {
    const r = await apiFetch("/api/upload-pdf", { method: "POST", body: fd });
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
    const r = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: texto,
        sessao: obterSessaoId(),
        provedor: PROVEDOR_FIXO,
        modo: "auto",
        modelo: selModelo?.value || null,
        permitir_internet: false,
      }),
    });
    const d = await r.json();
    removeTyping();
    if (!r.ok) {
      if (r.status === 401) {
        throw new Error("Token invalido ou ausente — preencha Token ADNY no painel lateral.");
      }
      throw new Error(d.detail || "Erro na API");
    }
    const respostaBot = (d.resposta || "").trim();
    addMessage(
      "bot",
      respostaBot || "Sem resposta do servidor. Tente de novo.",
      d.passos || [],
      d.meta || null
    );
  } catch (err) {
    removeTyping();
    let msg = err.message;
    if (!isLocalUi() && /fetch|network|failed/i.test(msg)) {
      msg += "\n\nConfira: PC host ligado, tunel ativo, Token ADNY no painel lateral.";
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
    const r = await apiFetch(
      "/api/historico?sessao=" + encodeURIComponent(obterSessaoId()) + "&limite=200"
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
  await apiFetch("/api/limpar?sessao=" + encodeURIComponent(antiga), { method: "POST" });
  novaSessaoId();
  messagesEl.innerHTML = "";
  if (WELCOME_HTML) {
    messagesEl.insertAdjacentHTML("beforeend", WELCOME_HTML);
  }
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

initLinkFilaRp();
atualizarLinkFilaRp();
initLlmPills();
initModoButtons();
bindChips();

async function bootstrap() {
  await carregarPublicConfig();
  initApiRemoto();
  carregarStatus();
  carregarSnapshot();
  carregarHistorico();
}

bootstrap();
setInterval(carregarStatus, 15000);
setInterval(carregarSnapshot, 10000);
