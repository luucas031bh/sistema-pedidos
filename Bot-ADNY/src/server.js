import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ override: true });
import { loadConfig } from './config.js';
import { verifyWebhookGet, handleWebhookPost } from './webhookMeta.js';

const config = loadConfig();
const app = express();

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
  console.log(
    `BOT-ADNY http://127.0.0.1:${config.port} — health /health — webhook /webhook/whatsapp`,
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[BOT-ADNY] Porta ${config.port} ja esta em uso (outra instancia do bot ou outro programa).`,
    );
    console.error('Feche a outra janela do CMD ou encerre o processo:');
    console.error(`  netstat -ano | findstr :${config.port}`);
    console.error('  taskkill /PID <numero_ultima_coluna> /F');
    console.error('Ou altere PORT no arquivo .env para outra porta livre.');
    process.exit(1);
  }
  throw err;
});
