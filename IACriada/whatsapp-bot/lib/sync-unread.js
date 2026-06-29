import { log } from "./logger.js";
import { ehDm } from "./heuristica.js";

const chatsNaoLidos = new Map();
let varreduraHistoricoFeita = false;

function registrarChatNaoLido(chat) {
  const id = chat?.id || chat?.jid;
  if (!id || !ehDm(id)) return;
  const n = chat.unreadCount || 0;
  if (n > 0) chatsNaoLidos.set(id, n);
}

async function processarMensagens(sock, onMensagem, messages, filtroJids) {
  let n = 0;
  for (const msg of messages || []) {
    const jid = msg?.key?.remoteJid;
    if (!jid || !ehDm(jid) || msg?.key?.fromMe) continue;
    if (filtroJids && !filtroJids.has(jid)) continue;
    try {
      await onMensagem(sock, msg);
      n++;
    } catch (err) {
      log.warn("Varredura: erro ao processar msg", { jid, err: String(err) });
    }
  }
  return n;
}

export function registrarVarreduraNaoLidos(sock, onMensagem) {
  sock.ev.on("chats.upsert", (chats) => {
    for (const c of chats || []) registrarChatNaoLido(c);
  });

  sock.ev.on("chats.update", (updates) => {
    for (const c of updates || []) registrarChatNaoLido(c);
  });

  sock.ev.on("messaging-history.set", async ({ chats, messages }) => {
    for (const c of chats || []) registrarChatNaoLido(c);
    const unreadIds = new Set(
      [...chatsNaoLidos.keys()].filter((id) => ehDm(id))
    );
    if (!unreadIds.size) return;

    log.info("Varredura: historico sync — chats nao lidos", {
      chats: unreadIds.size,
      mensagens: (messages || []).length,
    });

    const n = await processarMensagens(sock, onMensagem, messages, unreadIds);
    varreduraHistoricoFeita = true;
    log.info("Varredura: historico concluida", { processadas: n });
  });

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection !== "open") return;
    setTimeout(async () => {
      if (varreduraHistoricoFeita || chatsNaoLidos.size === 0) return;
      log.info("Varredura: aguardando sync de chats nao lidos", {
        chats: chatsNaoLidos.size,
      });
    }, 8000);
  });
}
