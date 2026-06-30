/**
 * Sincroniza mensagens DM de hoje (America/Sao_Paulo) — nao apenas nao lidas.
 * Complementa messages.upsert em tempo real.
 */
import { log } from "./logger.js";
import { ehDm } from "./heuristica.js";

const TZ = "America/Sao_Paulo";
const INTERVALO_MS = 10 * 60 * 1000;
const DELAY_APOS_CONEXAO_MS = 6000;

const chatsAtivos = new Map();
let syncEmAndamento = false;
let timerPeriodico = null;

function inicioHojeMs() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = partes.find((p) => p.type === "year")?.value;
  const m = partes.find((p) => p.type === "month")?.value;
  const d = partes.find((p) => p.type === "day")?.value;
  const iso = `${y}-${m}-${d}T00:00:00`;
  const utc = Date.parse(iso + "-03:00");
  if (!Number.isNaN(utc)) return utc;
  const local = new Date();
  local.setHours(0, 0, 0, 0);
  return local.getTime();
}

function msgTimestampMs(msg) {
  const ts = msg?.messageTimestamp;
  if (!ts) return Date.now();
  const n = Number(ts);
  return n > 1e12 ? n : n * 1000;
}

function ehMensagemHoje(msg) {
  return msgTimestampMs(msg) >= inicioHojeMs();
}

function registrarChat(chat) {
  const id = chat?.id || chat?.jid;
  if (!id || !ehDm(id)) return;
  const ts = Number(chat.conversationTimestamp || 0);
  if (ts > 0) {
    const prev = chatsAtivos.get(id) || 0;
    chatsAtivos.set(id, Math.max(prev, ts));
  }
}

async function processarMensagens(sock, onMensagem, messages) {
  const inicio = inicioHojeMs();
  let n = 0;
  for (const msg of messages || []) {
    const jid = msg?.key?.remoteJid;
    if (!jid || !ehDm(jid) || msg?.key?.fromMe) continue;
    if (msgTimestampMs(msg) < inicio) continue;
    try {
      await onMensagem(sock, msg);
      n++;
    } catch (err) {
      log.warn("Sync-hoje: erro ao processar msg", { jid, err: String(err) });
    }
  }
  return n;
}

function jidsAtivosHoje() {
  const inicioSeg = Math.floor(inicioHojeMs() / 1000);
  return [...chatsAtivos.entries()]
    .filter(([jid, ts]) => ehDm(jid) && ts >= inicioSeg)
    .map(([jid]) => jid);
}

async function solicitarHistoricoChat(sock, jid) {
  const tsChat = chatsAtivos.get(jid);
  if (!tsChat) return;
  const tsMs = tsChat > 1e12 ? tsChat : tsChat * 1000;
  const key = {
    remoteJid: jid,
    fromMe: true,
    id: "3EB0SYNC000000000000",
  };
  try {
    await sock.fetchMessageHistory(50, key, tsMs);
    await new Promise((r) => setTimeout(r, 800));
  } catch (err) {
    log.debug("Sync-hoje: fetchMessageHistory falhou", { jid, err: String(err) });
  }
}

async function varrerChatsHoje(sock, onMensagem) {
  if (syncEmAndamento) return;
  const jids = jidsAtivosHoje();
  if (!jids.length) return;

  syncEmAndamento = true;
  log.info("Sync-hoje: varredura on-demand", { chats: jids.length });

  try {
    for (const jid of jids) {
      await solicitarHistoricoChat(sock, jid);
    }
  } finally {
    syncEmAndamento = false;
  }
}

function agendarVarredura(sock, onMensagem) {
  setTimeout(() => {
    varrerChatsHoje(sock, onMensagem).catch((e) =>
      log.warn("Sync-hoje: varredura falhou", { err: String(e) })
    );
  }, DELAY_APOS_CONEXAO_MS);
}

function iniciarTimerPeriodico(sock, onMensagem) {
  if (timerPeriodico) clearInterval(timerPeriodico);
  timerPeriodico = setInterval(() => {
    varrerChatsHoje(sock, onMensagem).catch((e) =>
      log.warn("Sync-hoje: timer falhou", { err: String(e) })
    );
  }, INTERVALO_MS);
}

export function registrarSyncHoje(sock, onMensagem) {
  sock.ev.on("chats.set", (chats) => {
    for (const c of chats || []) registrarChat(c);
  });

  sock.ev.on("chats.upsert", (chats) => {
    for (const c of chats || []) registrarChat(c);
  });

  sock.ev.on("chats.update", (updates) => {
    for (const c of updates || []) registrarChat(c);
  });

  sock.ev.on("messaging-history.set", async ({ chats, messages }) => {
    for (const c of chats || []) registrarChat(c);
    const n = await processarMensagens(sock, onMensagem, messages);
    if (n > 0) {
      log.info("Sync-hoje: historico processado", { mensagens: n });
    }
  });

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection !== "open") return;
    agendarVarredura(sock, onMensagem);
    iniciarTimerPeriodico(sock, onMensagem);
  });
}
