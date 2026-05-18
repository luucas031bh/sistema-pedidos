import { config } from "./config.js";

export async function responderGrupo(sock, jid, texto) {
  const txt = (texto || "").trim();
  if (!txt) return;
  const parte =
    txt.length > config.maxMessageLength
      ? txt.slice(0, config.maxMessageLength - 20) + "\n…(cortado)"
      : txt;
  await sock.sendMessage(jid, { text: parte });
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
