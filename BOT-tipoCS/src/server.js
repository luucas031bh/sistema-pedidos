const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { loadConfig } = require('./config');
const { initBot, getSocket } = require('./bot');

const app = express();
app.use(cors());
app.use(express.json());

const cfg = loadConfig();
const PORT = cfg.port;

let bootError = null;

(async () => {
  try {
    await initBot();
  } catch (err) {
    bootError = err;
    console.error('Erro no boot do bot:', err);
  }
})();

app.get('/health', (_req, res) => {
  const sock = getSocket();
  res.json({
    status: bootError ? 'error' : 'ok',
    bot: sock ? 'iniciado' : 'desconectado',
    error: bootError ? String(bootError.message || bootError) : null,
    uptime: process.uptime(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'BOT-tipoCS — consulta sistema-pedidos',
    endpoints: ['/health'],
  });
});

app.listen(PORT, () => {
  console.log(`HTTP em http://127.0.0.1:${PORT} (health)`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
