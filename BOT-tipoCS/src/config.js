require('dotenv').config();

const { loadProjectContextSnippet } = require('./ai/projectContext');

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
  const rawGeminiModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim().toLowerCase();
  /** Modelos 1.5 costumam retornar 404 na API atual; evita fallback silencioso em todo restart. */
  const deprecatedGeminiModel = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash-8b': 'gemini-2.5-flash-lite',
    'gemini-1.5-pro': 'gemini-2.5-flash',
  };
  const geminiModel = deprecatedGeminiModel[rawGeminiModel] || process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  if (deprecatedGeminiModel[rawGeminiModel]) {
    console.warn(
      `[config] GEMINI_MODEL "${process.env.GEMINI_MODEL}" indisponível na API; usando "${geminiModel}". Atualize o .env.`,
    );
  }
  const organicRaw = String(process.env.GEMINI_ORGANIC_RESPONSES ?? 'true').toLowerCase();
  const geminiOrganicResponses = organicRaw !== 'false' && organicRaw !== '0';

  const { snippet: projectContextSnippet, sourceLabel: projectContextSourceLabel } =
    loadProjectContextSnippet(process.env);

  const sistemaBaseUrl = (process.env.SISTEMA_BASE_URL || '').trim().replace(/\/$/, '');
  const chatHistoryMax = Math.min(40, Math.max(0, Number(process.env.CHAT_HISTORY_MAX) || 12));
  const persistRaw = String(process.env.CHAT_HISTORY_PERSIST || '').toLowerCase();
  const chatHistoryPersist = persistRaw === 'file' || persistRaw === 'true' || persistRaw === '1';

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
    projectContextSnippet,
    projectContextSourceLabel,
    sistemaBaseUrl,
    chatHistoryMax,
    chatHistoryPersist,
  };
}

module.exports = { loadConfig };
