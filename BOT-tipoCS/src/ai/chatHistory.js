const fs = require('fs');
const path = require('path');

/** @type {Map<string, { role: string, text: string }[]>} */
const memory = new Map();

function sanitizeKey(chatKey) {
  return String(chatKey || 'default').replace(/[^a-zA-Z0-9:@._-]/g, '_').slice(0, 200);
}

function maxTurns(config) {
  const n = Number(config.chatHistoryMax);
  if (Number.isFinite(n) && n >= 0) return Math.min(40, Math.max(0, Math.floor(n)));
  return 12;
}

function persistPath(config) {
  if (!config.chatHistoryPersist) return null;
  const dir = path.join(__dirname, '..', '..', 'data');
  return path.join(dir, 'chat-history.json');
}

function loadDisk(config) {
  const p = persistPath(config);
  if (!p || !fs.existsSync(p)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (raw && typeof raw === 'object') {
      memory.clear();
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) memory.set(k, v.slice(-maxTurns(config) * 2));
      }
    }
  } catch (e) {
    console.warn('[chatHistory] Falha ao carregar:', e.message || e);
  }
}

function saveDisk(config) {
  const p = persistPath(config);
  if (!p) return;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = {};
    memory.forEach((v, k) => {
      obj[k] = v;
    });
    fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
  } catch (e) {
    console.warn('[chatHistory] Falha ao gravar:', e.message || e);
  }
}

function getTurns(config, chatKey) {
  const key = sanitizeKey(chatKey);
  if (config.chatHistoryPersist && memory.size === 0) loadDisk(config);
  return memory.get(key) || [];
}

/**
 * Texto compacto para o prompt (ultimas mensagens).
 */
function formatHistoryForPrompt(config, chatKey) {
  const max = maxTurns(config);
  if (max === 0) return '';
  const turns = getTurns(config, chatKey).slice(-max);
  if (!turns.length) return '';
  const lines = turns.map((t) => `${t.role === 'user' ? 'Usuario' : 'ADNY'}: ${String(t.text).slice(0, 800)}`);
  return `\n\nHistorico recente (mesmo chat, ordem cronologica):\n${lines.join('\n')}\n`;
}

function appendTurn(config, chatKey, role, text) {
  const max = maxTurns(config);
  if (max === 0) return;
  const key = sanitizeKey(chatKey);
  const msg = String(text || '').trim();
  if (!msg) return;
  const arr = memory.get(key) || [];
  arr.push({ role: role === 'assistant' ? 'assistant' : 'user', text: msg.slice(0, 4000) });
  while (arr.length > max) arr.shift();
  memory.set(key, arr);
  if (config.chatHistoryPersist) saveDisk(config);
}

module.exports = {
  formatHistoryForPrompt,
  appendTurn,
  sanitizeKey,
};
