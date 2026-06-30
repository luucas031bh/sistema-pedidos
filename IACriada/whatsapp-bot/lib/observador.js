import { config } from "./config.js";
import { log } from "./logger.js";
import { ehDm } from "./heuristica.js";
import { enviarEventoWhatsapp, tickSnapshotRp } from "./observador-client.js";
import { descricaoMensagemObservador, tipoMensagem } from "./filters.js";
import { registrarAtividade } from "./observador-stats.js";

const TIPOS_SEM_LOG = new Set(["callLog", "protocolMessage", "reactionMessage"]);

let tickTimer = null;

function isoTimestamp(msg) {
  const ts = msg?.messageTimestamp;
  if (!ts) return new Date().toISOString();
  const n = Number(ts);
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export async function processarObservador(msg, pushName) {
  const jid = msg?.key?.remoteJid;
  if (!ehDm(jid) || msg?.key?.fromMe) {
    return { ok: false, motivo: "nao_dm" };
  }

  const tipo = tipoMensagem(msg);
  if (TIPOS_SEM_LOG.has(tipo)) {
    return { ok: false, motivo: "tipo_ignorado" };
  }

  registrarAtividade("recebida");
  const texto = descricaoMensagemObservador(msg);
  if (!texto) {
    registrarAtividade("ignorada");
    return { ok: false, motivo: "vazio" };
  }

  const numero = jid.replace(/@.+$/, "").replace(/\D/g, "");

  const payload = {
    telefone: numero,
    texto,
    mensagem: texto,
    timestamp: isoTimestamp(msg),
    nome: pushName || "",
    classificar: true,
    direcao: "entrada",
  };

  log.info("Observador: gravando DM no Python", {
    numero,
    preview: texto.slice(0, 60),
  });

  const r = await enviarEventoWhatsapp(payload);
  if (r.ok) {
    registrarAtividade("encaminhada");
  } else {
    registrarAtividade("falha");
    log.warn("Observador: falha ao gravar no Python", {
      numero,
      status: r.data?.detail || r.err || r.data,
    });
  }
  return r;
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
