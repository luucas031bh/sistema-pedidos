import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { log } from "./logger.js";
import { setBotIdentity } from "./bot-identity.js";
import { limparQrPng, salvarQrPng } from "./qr-png.js";

let sockGlobal = null;
let botJidGlobal = null;

export function getSocket() {
  return sockGlobal;
}

export function getBotJid() {
  return botJidGlobal;
}

export async function conectarWhatsApp(onMensagem) {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: config.debug ? "warn" : "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    defaultQueryTimeoutMs: 60_000,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  sockGlobal = sock;

  sock.ev.on("creds.update", () => {
    saveCreds();
    setBotIdentity(sock);
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      salvarQrPng(qr).catch((e) =>
        log.error("Falha ao gerar PNG do QR", { err: String(e) })
      );
      if (config.debug) {
        log.info("QR no terminal (DEBUG)");
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === "open") {
      limparQrPng();
      botJidGlobal = sock.user?.id || null;
      setBotIdentity(sock);
      const id = getBotIdentityLog(sock);
      log.info("WhatsApp conectado", id);
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.data?.reason;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn("Conexao fechada", { code, loggedOut });

      if (loggedOut) {
        limparQrPng();
        log.error(
          "Sessao encerrada. Apague auth_info/ e escaneie o QR novamente."
        );
        return;
      }

      // 515 = restart required apos parear QR (comportamento normal do Baileys)
      if (code === DisconnectReason.restartRequired || code === 515) {
        log.info("Reinicio da conexao apos pareamento (codigo 515)…");
      }

      log.info(`Reconectando em ${config.reconnectDelayMs}ms…`);
      setTimeout(() => {
        conectarWhatsApp(onMensagem).catch((e) =>
          log.error("Erro na reconexao", { e: String(e) })
        );
      }, config.reconnectDelayMs);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        await onMensagem(sock, msg);
      } catch (err) {
        log.error("Erro ao processar mensagem", { err: String(err) });
      }
    }
  });

  return sock;
}

function getBotIdentityLog(sock) {
  const me = sock.authState?.creds?.me || {};
  return {
    bot: sock.user?.id,
    lid: me.lid || null,
    nome: me.name || null,
  };
}

export { getBotIdentityLog };
