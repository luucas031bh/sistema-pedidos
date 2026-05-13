const path = require('path');
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');

const { loadConfig } = require('./config');
const { extractMessageText } = require('./middleware/extractText');
const { checkCooldown } = require('./middleware/cooldown');
const { shouldHandle, runCommand, stripTrigger } = require('./handlers/pedidosCommands');
const { appendTurn, sanitizeKey } = require('./ai/chatHistory');
const { sendText, sendPdfDocument } = require('./services/whatsappService');

const authDir = path.join(__dirname, '..', 'auth_info');
const logger = pino({ level: 'silent' });

let currentSock = null;

async function initBot() {
  const config = loadConfig();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Baileys version: ${version.join('.')} (latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ['Sistema-Pedidos', 'Chrome', '120.0'],
    syncFullHistory: false,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nEscaneie o QR code com o WhatsApp:\n');
      qrcodeTerminal.generate(qr, { small: true });

      const qrImgPath = path.join(__dirname, '..', 'qrcode.png');
      QRCode.toFile(qrImgPath, qr, { width: 512, margin: 2 }, (err) => {
        if (err) {
          console.warn('Falha ao salvar QR como imagem:', err.message);
        } else {
          console.log(`\nQR também salvo em: ${qrImgPath}\n`);
        }
      });
    }

    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`Conexão fechada. Status: ${statusCode}. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => initBot(), 3000);
      } else {
        console.log('Sessão encerrada. Apague auth_info/ e reinicie para novo QR.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const message = m.messages?.[0];
      if (!message?.message) return;
      if (message.key.fromMe) return;

      const from = message.key.remoteJid;
      const isGroup = from?.endsWith('@g.us');
      const sender = message.key.participant || from;

      if (config.allowlistStrict && isGroup && !config.allowedGroupIds.has(from)) {
        return;
      }

      const text = extractMessageText(message);
      if (!text) return;

      if (!shouldHandle(config, text)) return;

      console.log(`\nComando (${isGroup ? 'grupo' : 'privado'}) ${sender}:`);
      console.log(`  > ${text.slice(0, 200)}`);

      const cooldown = checkCooldown(sender);
      if (!cooldown.ok) {
        await sendText(sock, from, cooldown.reason);
        return;
      }

      const chatKey = sanitizeKey(isGroup ? sender : from);
      const userLine = stripTrigger(text, config.botTriggers);

      const reply = await runCommand(config, text, { chatKey });

      const replyObj = reply && typeof reply === 'object' && reply !== null && 'text' in reply ? reply : null;
      const textOut = replyObj ? replyObj.text : String(reply ?? '');
      await sendText(sock, from, textOut);

      if (replyObj && replyObj.__pdf && replyObj.__pdf.base64) {
        await sendPdfDocument(
          sock,
          from,
          Buffer.from(replyObj.__pdf.base64, 'base64'),
          replyObj.__pdf.fileName || 'documento.pdf',
        );
      }

      appendTurn(config, chatKey, 'user', userLine || text.trim().slice(0, 500));
      const histAssist =
        textOut +
        (replyObj && replyObj.__pdf && replyObj.__pdf.fileName
          ? ` [PDF: ${replyObj.__pdf.fileName}]`
          : '');
      appendTurn(config, chatKey, 'assistant', histAssist.slice(0, 4000));
    } catch (err) {
      console.error('Erro ao processar mensagem:', err);
      try {
        const message = m.messages?.[0];
        const from = message?.key?.remoteJid;
        if (from) {
          await sendText(
            sock,
            from,
            `Erro ao consultar: ${err.message || err}\nConfira APPS_SCRIPT_URL e se o Web App foi republicado após atualizar o Code.gs.`,
          );
        }
      } catch (_) {
        /* ignore */
      }
    }
  });

  currentSock = sock;
  return sock;
}

function getSocket() {
  return currentSock;
}

if (require.main === module) {
  initBot().catch((err) => {
    console.error('Falha ao iniciar bot:', err);
    process.exit(1);
  });
}

module.exports = { initBot, getSocket };
