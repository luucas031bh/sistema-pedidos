import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { log } from "./logger.js";
import { setBotIdentity } from "./bot-identity.js";
import { limparQrPng, salvarQrPng } from "./qr-png.js";
import { gravarStatus } from "./connection-status.js";

let sockGlobal = null;
let botJidGlobal = null;

function limparAuthState() {
  const dir = config.authDir;
  if (!fs.existsSync(dir)) return;
  for (const nome of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, nome));
    } catch {
      /* ignore */
    }
  }
}

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
      gravarStatus({ connection: "qr", qr_pendente: true });
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
      gravarStatus({
        connection: "open",
        qr_pendente: false,
        reconnecting: false,
        bot: sock.user?.id || null,
        nome: id.nome || null,
        ultima_conexao_em: new Date().toISOString(),
      });
      log.info("WhatsApp conectado", id);
    }

    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.data?.reason;
      const loggedOut = code === DisconnectReason.loggedOut;
      const transiente =
        code === DisconnectReason.restartRequired ||
        code === 515 ||
        code === 440;
      gravarStatus({
        connection: transiente ? "reconnecting" : "close",
        qr_pendente: false,
        code,
        logged_out: loggedOut,
        reconnecting: transiente && !loggedOut,
      });
      log.warn("Conexao fechada", { code, loggedOut });

      if (loggedOut) {
        limparQrPng();
        limparAuthState();
        log.error("Sessao encerrada. Gerando novo QR…");
        setTimeout(() => {
          conectarWhatsApp(onMensagem).catch((e) =>
            log.error("Erro ao reconectar apos logout", { e: String(e) })
          );
        }, config.reconnectDelayMs);
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
