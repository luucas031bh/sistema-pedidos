import { config } from "./config.js";
import { registrarMensagemSaida } from "./observador-client.js";
import { normalizarNumero } from "./permissions.js";

function logMensagemSaida(jid, texto) {
  const numero = normalizarNumero(jid);
  if (!numero || !(texto || "").trim()) return;
  registrarMensagemSaida({
    telefone: numero,
    texto: String(texto).trim(),
    timestamp: new Date().toISOString(),
    classificar: false,
    direcao: "saida",
  }).catch(() => {});
}

export async function responderGrupo(sock, jid, texto) {
  const txt = (texto || "").trim();
  if (!txt) return;
  const parte =
    txt.length > config.maxMessageLength
      ? txt.slice(0, config.maxMessageLength - 20) + "\n…(cortado)"
      : txt;
  await sock.sendMessage(jid, { text: parte });
  logMensagemSaida(jid, parte);
}

export async function responderComDigitacao(sock, jid, texto) {
  try {
    await sock.sendPresenceUpdate("composing", jid);
  } catch {
    /* ignore */
  }
  await responderGrupo(sock, jid, texto);
  try {
    await sock.sendPresenceUpdate("paused", jid);
  } catch {
    /* ignore */
  }
}
