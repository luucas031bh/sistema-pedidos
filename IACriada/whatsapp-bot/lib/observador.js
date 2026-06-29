import { config } from "./config.js";
import { log } from "./logger.js";
import { deveProcessarObservador } from "./heuristica.js";
import { enviarEventoWhatsapp, tickSnapshotRp } from "./observador-client.js";
import { extrairTextoMensagem } from "./filters.js";

let tickTimer = null;

function isoTimestamp(msg) {
  const ts = msg?.messageTimestamp;
  if (!ts) return new Date().toISOString();
  const n = Number(ts);
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export async function processarObservador(msg, pushName) {
  const texto = extrairTextoMensagem(msg).trim();
  if (!deveProcessarObservador(msg, texto)) {
    log.debug("Observador: ignorada (heuristica)", {
      preview: texto.slice(0, 40),
    });
    return { ok: false, motivo: "heuristica" };
  }

  const jid = msg.key.remoteJid;
  const numero = jid.replace(/@.+$/, "").replace(/\D/g, "");

  const payload = {
    telefone: numero,
    texto,
    mensagem: texto,
    timestamp: isoTimestamp(msg),
    nome: pushName || "",
    classificar: true,
  };

  log.info("Observador: encaminhando ao Python", {
    numero,
    preview: texto.slice(0, 60),
  });

  return enviarEventoWhatsapp(payload);
}

export function iniciarTickRp() {
  if (tickTimer) return;
  const ms = config.observadorTickMs;
  log.info("Observador: tick RP iniciado", { intervalo_ms: ms });

  const run = async () => {
    const r = await tickSnapshotRp();
    if (r.ok) {
      log.debug("Observador: tick RP ok");
    }
  };

  run();
  tickTimer = setInterval(run, ms);
}

export function pararTickRp() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
