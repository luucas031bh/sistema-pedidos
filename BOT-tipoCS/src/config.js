require('dotenv').config();

function parseList(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfig() {
  const allowed = parseList(process.env.ALLOWED_GROUP_IDS);
  const triggers = parseList(process.env.BOT_TRIGGERS || process.env.BOT_TRIGGER_NAMES || 'ADNY')
    .map((s) => s.trim())
    .filter(Boolean);
  if (triggers.length === 0) triggers.push('ADNY');

  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const organicRaw = String(process.env.GEMINI_ORGANIC_RESPONSES ?? 'true').toLowerCase();
  const geminiOrganicResponses = organicRaw !== 'false' && organicRaw !== '0';

  return {
    port: Number(process.env.PORT) || 3010,
    allowedGroupIds: new Set(allowed),
    allowlistStrict: allowed.length > 0,
    botTriggers: triggers.map((t) => t.toLowerCase()),
    appsScriptUrl: (process.env.APPS_SCRIPT_URL || '').trim().replace(/\/$/, ''),
    appsScriptToken: (process.env.APPS_SCRIPT_TOKEN || '').trim(),
    geminiApiKey: geminiKey,
    geminiModel,
    geminiOrganicResponses,
    naturalLanguageEnabled: geminiKey.length >= 10,
  };
}

module.exports = { loadConfig };
