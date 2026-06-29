/** Filtro heurístico — descarta lixo antes de acionar Python/Ollama. */

const LIXO_EXATO = new Set([
  "oi",
  "ola",
  "olá",
  "bom dia",
  "boa tarde",
  "boa noite",
  "ok",
  "okay",
  "obrigado",
  "obrigada",
  "valeu",
  "blz",
  "beleza",
  "tchau",
  "sim",
  "nao",
  "não",
]);

const TERMOS_RELEVANTES = [
  "camisa",
  "camiseta",
  "moletom",
  "malha",
  "estampa",
  "silk",
  "sublim",
  "gola",
  "preco",
  "preço",
  "orcamento",
  "orçamento",
  "cotacao",
  "cotação",
  "pedido",
  "quantidade",
  "peca",
  "peça",
  "tamanho",
  "cor",
  "prazo",
  "entrega",
  "status",
  "duvida",
  "dúvida",
];

export function ehDm(jid) {
  if (!jid) return false;
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

export function ehGrupo(jid) {
  return Boolean(jid && jid.endsWith("@g.us"));
}

export function textoRelevante(texto) {
  const t = (texto || "").trim();
  if (!t || t.length < 3) return false;

  const lower = t.toLowerCase().replace(/[^\w\sáàâãéèêíìîóòôõúùûç]/gi, " ");
  if (LIXO_EXATO.has(lower.trim())) return false;

  if (/\d{2,}/.test(t)) return true;
  if (t.includes("?")) return true;

  for (const termo of TERMOS_RELEVANTES) {
    if (lower.includes(termo)) return true;
  }

  if (t.split(/\s+/).length >= 4) return true;

  return false;
}

export function deveProcessarObservador(msg, texto) {
  const jid = msg?.key?.remoteJid;
  if (!ehDm(jid)) return false;
  if (msg?.key?.fromMe) return false;
  return textoRelevante(texto);
}
