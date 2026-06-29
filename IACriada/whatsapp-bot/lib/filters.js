import { config } from "./config.js";
import { botFoiMencionado } from "./bot-identity.js";

const TIPOS_IGNORADOS = new Set([
  "audioMessage",
  "pttMessage",
  "stickerMessage",
  "imageMessage",
  "videoMessage",
  "documentMessage",
  "callLog",
  "protocolMessage",
]);

export function extrairTextoMensagem(msg) {
  if (!msg?.message) return "";
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return "";
}

export function tipoMensagem(msg) {
  if (!msg?.message) return "unknown";
  return Object.keys(msg.message)[0] || "unknown";
}

const ROTULOS_MIDIA = {
  audioMessage: "[audio]",
  pttMessage: "[audio]",
  stickerMessage: "[figurinha]",
  imageMessage: "[imagem]",
  videoMessage: "[video]",
  documentMessage: "[documento]",
};

/** Texto ou rotulo de midia — usado pelo observador (captura tudo, sem filtro comercial). */
export function descricaoMensagemObservador(msg) {
  const texto = extrairTextoMensagem(msg).trim();
  if (texto) return texto;
  return ROTULOS_MIDIA[tipoMensagem(msg)] || "";
}

export function mensagemDeveIgnorar(msg) {
  const tipo = tipoMensagem(msg);
  if (TIPOS_IGNORADOS.has(tipo)) return true;
  const texto = extrairTextoMensagem(msg).trim();
  if (!texto) return true;
  if (texto.length > config.maxMessageLength) return true;
  return false;
}

export function obterMencoes(msg) {
  const ctx =
    msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo;
  return ctx?.mentionedJid || [];
}

export function mensagemEhGatilho(texto, msg) {
  const t = (texto || "").trim();
  if (!t) return false;

  if (botFoiMencionado(msg, t)) return true;

  const upper = t.toUpperCase();
  for (const gatilho of config.triggers) {
    const g = gatilho.trim();
    if (!g) continue;
    if (upper.startsWith(g.toUpperCase())) return true;
    if (t.startsWith(g)) return true;
  }
  return false;
}

/** Remove gatilhos do inicio para enviar texto limpo à IA. */
export function limparGatilho(texto) {
  let t = (texto || "").trim();
  // Remove menção @numero, @lid ou rótulo do bot (ex: @Meu numero:)
  t = t.replace(/^@\d+\s*:?\s*/i, "").trim();
  t = t.replace(/^@?meu\s*numero\s*:?\s*/i, "").trim();
  t = t.replace(/^@[\w\s]+:\s*/i, "").trim();
  for (const gatilho of config.triggers) {
    const g = gatilho.trim();
    if (!g) continue;
    if (t.toUpperCase().startsWith(g.toUpperCase())) {
      t = t.slice(g.length).trim();
      break;
    }
  }
  return t.replace(/^[,:\-\s]+/, "").trim();
}
