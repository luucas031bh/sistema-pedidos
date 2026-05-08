const STORAGE_KEY = "rt_saved";
const MAX_SAVED = 15;

/** @type {Record<string, { hex: string; r: number; g: number; b: number; receita?: { tinta: string; pct: number }[]; bases?: string[] }>} */
let DADOS = {};

const el = (id) => document.getElementById(id);

const res = el("res");
const inp = el("busca");
const badge = el("badge");
const btnSaved = el("btnSaved");
const btnClose = el("btnClose");
const btnPrint = el("btnPrint");
const btnShare = el("btnShare");
const bbInfo = el("bbInfo");
const panel = el("panel");
const overlay = el("overlay");
const spList = el("spList");
const toast = el("toast");
const printHeader = el("printHeader");
const printSub = el("printSub");
const hintCount = el("hintCount");

let saved = [];
let toastTimer = 0;

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toast.hidden = true;
  }, 2800);
}

function luminance({ r, g, b }) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorsReady() {
  return DADOS && Object.keys(DADOS).length > 0;
}

async function resolveDados() {
  const w = typeof globalThis.__RT_COLORS__ === "object" && globalThis.__RT_COLORS__;
  const n = w && typeof w === "object" ? Object.keys(w).length : 0;
  if (n > 0) return w;

  const r = await fetch("data/colors.json", { credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function renderDataErrorHtml() {
  return `<div class="state-miss"><p class="state-miss-msg">Não foi possível carregar a base de cores.</p><p class="sr-msg" style="margin-top:12px;text-align:center">Certifique-se de que os ficheiros <code style="white-space:break-spaces">www/js/colors-data.js</code> e <code>www/data/colors.json</code> existem, ou sirva a pasta <code>www</code> com um servidor (<code>npx serve www</code>). Abrir o HTML diretamente pelo explorador pode impedir o carregamento dos dados.</p></div>`;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function parseSaved(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((c) => DADOS[c]) : [];
  } catch {
    return [];
  }
}

function updateBar() {
  const n = saved.length;
  badge.textContent = String(n);
  if (n > 0) {
    bbInfo.textContent = `${n} cor${n > 1 ? "es" : ""} salva${n > 1 ? "s" : ""}`;
    btnPrint.disabled = false;
    btnShare.disabled = false;
  } else {
    bbInfo.textContent = "Nenhuma cor salva";
    btnPrint.disabled = true;
    btnShare.disabled = true;
  }
}

function isSaved(cod) {
  return saved.includes(cod);
}

function toggleSave(cod) {
  if (!DADOS[cod]) return;
  if (isSaved(cod)) {
    saved = saved.filter((c) => c !== cod);
  } else if (saved.length >= MAX_SAVED) {
    showToast(`Máximo de ${MAX_SAVED} cores salvas.`);
    return;
  } else {
    saved.push(cod);
  }
  persist();
  updateBar();
  const current = inp.value.trim().toUpperCase();
  if (current === cod) renderDetail(cod);
}

function emptyStateHtml() {
  return `
    <div class="state-empty">
      <div class="state-empty-icon" aria-hidden="true">◇</div>
      <div class="state-empty-title">Busque pelo código</div>
      <p>Digite o código da tinta para ver hex, RGB, receita e bases necessárias.</p>
    </div>`;
}

function notFoundHtml(cod) {
  const safe = escapeHtml(cod);
  return `
    <div class="state-miss">
      <div class="state-miss-code">${safe}</div>
      <p class="state-miss-msg">Código não encontrado.</p>
    </div>`;
}

function buildRecipeSections(d, codSafe) {
  const hasRecv = Array.isArray(d.receita) && d.receita.length > 0;
  if (!hasRecv) {
    return `<div class="block"><p class="sr-msg">Receita não disponível para este código.</p></div>`;
  }

  const rows = d.receita
    .map((i) => {
      const name = escapeHtml(i.tinta);
      const pct = escapeHtml(String(i.pct));
      const w = Math.min(100, Math.max(0, Number(i.pct) || 0));
      return `
        <div class="recipe-row">
          <span class="recipe-name">${name}</span>
          <span class="recipe-pct">${pct}%</span>
          <div class="recipe-track" style="grid-column:1/-1;">
            <div class="recipe-fill" style="width:${w}%"></div>
          </div>
        </div>`;
    })
    .join("");

  const bases = Array.isArray(d.bases)
    ? d.bases.map((b) => `<span class="base-chip">${escapeHtml(b)}</span>`).join("")
    : "";

  const baseBlock = bases
    ? `<div class="block"><h3 class="block-title">Cores base necessárias</h3><div class="bases">${bases}</div></div>`
    : "";

  return `
    <div class="block">
      <h3 class="block-title">Receita de tinta</h3>
      <div class="recipe-rows">${rows}</div>
    </div>
    ${baseBlock}`;
}

function renderDetail(cod) {
  const d = DADOS[cod];
  if (!d) {
    res.innerHTML = notFoundHtml(cod);
    return;
  }

  const lm = luminance(d);
  const dk = lm > 170;
  const bg = dk ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)";
  const tc = dk ? "#111" : "#fff";

  const sv = isSaved(cod);
  const codSafe = escapeHtml(cod);
  const hexSafe = escapeHtml(d.hex);

  res.innerHTML = `
    <article class="result-card">
      <div class="swatch" style="background:${escapeHtml(d.hex)}">
        <span class="hex-pill" style="background:${bg};color:${tc}">${hexSafe}</span>
      </div>
      <div class="result-body">
        <h2 class="result-code">${codSafe}</h2>
        <div class="rgb-row">
          <span>R</span>
          <span class="rgb-chip">${d.r}</span>
          <span>G</span>
          <span class="rgb-chip">${d.g}</span>
          <span>B</span>
          <span class="rgb-chip">${d.b}</span>
        </div>
        <button type="button" class="btn-save ${sv ? "saved" : ""}" data-action="toggle-save" data-cod="${escapeHtml(cod)}">
          ${sv ? "Cor salva" : "Salvar cor"}
        </button>
        ${buildRecipeSections(d, codSafe)}
      </div>
    </article>`;
}

function renderPanel() {
  if (saved.length === 0) {
    spList.innerHTML = `<div class="sheet-empty">Nenhuma cor salva.<br>Pesquise e salve até ${MAX_SAVED} cores.</div>`;
    return;
  }

  spList.innerHTML = saved
    .map((cod) => {
      const d = DADOS[cod];
      if (!d) return "";
      const codSafe = escapeHtml(cod);
      const hex = escapeHtml(d.hex);
      return `
        <div class="sp-item">
          <div class="sp-sw" style="background:${hex}" aria-hidden="true"></div>
          <div class="sp-meta">
            <div class="sp-cod">${codSafe}</div>
            <div class="sp-hex">${hex}</div>
          </div>
          <button type="button" class="btn-remove" data-action="remove-save" data-cod="${codSafe}" aria-label="Remover ${codSafe}">×</button>
        </div>`;
    })
    .join("");
}

function openPanel() {
  panel.classList.add("open");
  overlay.classList.add("on");
  panel.setAttribute("aria-hidden", "false");
  overlay.setAttribute("aria-hidden", "false");
  renderPanel();
}

function closePanel() {
  panel.classList.remove("open");
  overlay.classList.remove("on");
  panel.setAttribute("aria-hidden", "true");
  overlay.setAttribute("aria-hidden", "true");
}

/** @returns {string} */
function buildShareTextForCodes(cods) {
  const lines = ["ROANTONE 2025 — receitas"];
  lines.push("");
  cods.forEach((cod) => {
    const c = DADOS[cod];
    if (!c) return;
    lines.push(`• ${cod} — ${c.hex}`);
    lines.push(`  RGB ${c.r} ${c.g} ${c.b}`);
    if (c.receita?.length) {
      c.receita.forEach((i) => lines.push(`  - ${i.tinta}: ${i.pct}%`));
      if (c.bases?.length) lines.push(`  Bases: ${c.bases.join(", ")}`);
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

async function shareSaved() {
  if (saved.length === 0) return;
  const text = buildShareTextForCodes(saved);
  try {
    if (navigator.share) {
      await navigator.share({ title: "ROANTONE 2025", text });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Texto copiado para a área de transferência.");
    } else {
      showToast(text.slice(0, 200) + "…");
    }
  } catch {
    showToast("Não foi possível compartilhar.");
  }
}

function printSaved() {
  if (saved.length === 0) return;
  const n = saved.length;
  printSub.textContent = `${n} cor${n > 1 ? "es" : ""} selecionada${n > 1 ? "s" : ""}`;
  printHeader.hidden = false;

  const fragments = [];
  saved.forEach((cod) => {
    const d = DADOS[cod];
    if (!d) return;
    const lm = luminance(d);
    const dk = lm > 170;
    const tc = dk ? "#111" : "#fff";

    let recipeHtml = `<p class="sr-msg">Receita não disponível.</p>`;
    if (d.receita?.length) {
      const rs = d.receita
        .map(
          (i) =>
            `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #eee"><span>${escapeHtml(i.tinta)}</span><strong>${escapeHtml(String(i.pct))}%</strong></div>`
        )
        .join("");
      const bs = (d.bases || [])
        .map(
          (b) =>
            `<span style="-webkit-print-color-adjust:exact;print-color-adjust:exact;display:inline-block;margin:4px;padding:4px 10px;border-radius:999px;background:#eee;font-size:11px;font-weight:700">${escapeHtml(b)}</span>`
        )
        .join("");
      recipeHtml = `${rs}<div style="margin-top:8px">${bs}</div>`;
    }

    fragments.push(`
      <article class="result-card">
        <div class="swatch" style="min-height:56px;background:${escapeHtml(d.hex)}!important;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          <span class="hex-pill" style="background:${dk ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"};color:${tc}">${escapeHtml(d.hex)}</span>
        </div>
        <div class="result-body">
          <h2 class="result-code">${escapeHtml(cod)}</h2>
          <div class="rgb-row"><span class="rgb-chip">R ${d.r}</span><span class="rgb-chip">G ${d.g}</span><span class="rgb-chip">B ${d.b}</span></div>
          <div class="block"><h3 class="block-title">Receita</h3>${recipeHtml}</div>
        </div>
      </article>`);
  });

  const orig = res.innerHTML;
  const q = inp.value.trim().toUpperCase();

  const onAfterPrint = () => {
    res.innerHTML = orig;
    printHeader.hidden = true;
    window.removeEventListener("afterprint", onAfterPrint);
    if (q && DADOS[q]) renderDetail(q);
    else if (!q) res.innerHTML = emptyStateHtml();
  };

  window.addEventListener("afterprint", onAfterPrint, false);
  res.innerHTML = fragments.join("");
  requestAnimationFrame(() => window.print());
}

function onInput() {
  const c = inp.value.trim().toUpperCase();
  if (!colorsReady()) {
    res.innerHTML = renderDataErrorHtml();
    if (hintCount) hintCount.hidden = true;
    return;
  }
  if (hintCount) {
    if (c.length > 0) {
      hintCount.hidden = false;
      hintCount.textContent = `${c.length}/8`;
    } else {
      hintCount.hidden = true;
    }
  }

  if (!c) {
    res.innerHTML = emptyStateHtml();
    return;
  }
  renderDetail(c);
}

res.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const cod = btn.getAttribute("data-cod") || "";
  if (btn.getAttribute("data-action") === "toggle-save") toggleSave(cod);
});

spList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='remove-save']");
  if (!btn) return;
  const cod = btn.getAttribute("data-cod") || "";
  toggleSave(cod);
  renderPanel();
  const cur = inp.value.trim().toUpperCase();
  if (cur && DADOS[cur]) renderDetail(cur);
});

btnSaved.addEventListener("click", openPanel);
btnClose.addEventListener("click", closePanel);
overlay.addEventListener("click", closePanel);
btnPrint.addEventListener("click", printSaved);
btnShare.addEventListener("click", shareSaved);

async function boot() {
  try {
    DADOS = await resolveDados();
    if (!colorsReady()) throw new Error("empty");
  } catch {
    DADOS = {};
    res.innerHTML = renderDataErrorHtml();
  }

  saved = parseSaved(localStorage.getItem(STORAGE_KEY));
  persist();
  updateBar();

  inp.focus();

  const q = inp.value.trim().toUpperCase();
  if (colorsReady()) {
    if (q && DADOS[q]) renderDetail(q);
    else res.innerHTML = emptyStateHtml();
  }
}

inp.addEventListener("input", onInput);
inp.addEventListener("change", onInput);
inp.addEventListener("paste", () => requestAnimationFrame(onInput));

boot();
