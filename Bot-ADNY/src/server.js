import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ override: true });
import { loadConfig } from './config.js';
import { verifyWebhookGet, handleWebhookPost } from './webhookMeta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '..', '.bot-adny.pid');

function writePidFile() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (e) {
    console.warn('[BOT-ADNY] nao foi possivel gravar .bot-adny.pid:', e?.message || e);
  }
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ok */
  }
}

const config = loadConfig();
const app = express();

app.get('/', (_req, res) => {
  res.redirect(302, '/health');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bot-adny' });
});

app.get('/webhook/whatsapp', (req, res) => verifyWebhookGet(config, req, res));

app.post(
  '/webhook/whatsapp',
  express.raw({ type: 'application/json' }),
  (req, res) => handleWebhookPost(config, req, res),
);

const server = app.listen(config.port, () => {
  writePidFile();
  console.log(
    `BOT-ADNY http://127.0.0.1:${config.port} — health /health — webhook /webhook/whatsapp`,
  );
});

function shutdown() {
  removePidFile();
  try {
    server.close();
  } catch {
    /* ok */
  }
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('exit', () => removePidFile());

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[BOT-ADNY] Porta ${config.port} ja esta em uso (outra instancia do bot ou outro programa).`,
    );
    console.error('Feche a outra janela do CMD ou encerre o processo:');
    console.error(`  netstat -ano | findstr :${config.port}`);
    console.error('  taskkill /PID <numero_ultima_coluna> /F');
    console.error('Se usou start.bat, leia as linhas [start.bat] acima: pode ser outro programa ou o Node do Cursor na mesma porta.');
    console.error('Solucao: feche o outro app, ou defina PORT=3002 (ou outra livre) no .env e ngrok na mesma porta.');
    process.exit(1);
  }
  throw err;
});
