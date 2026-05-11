import 'dotenv/config';
import express from 'express';
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

app.listen(config.port, () => {
  console.log(
    `BOT-ADNY http://127.0.0.1:${config.port} — health /health — webhook /webhook/whatsapp`,
  );
});
