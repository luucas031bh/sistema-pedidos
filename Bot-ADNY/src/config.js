function parseList(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig() {
  const allowed = parseList(process.env.ALLOWED_GROUP_IDS);
  const triggers = parseList(process.env.BOT_TRIGGER_NAMES || 'ADNY')
    .map((s) => s.trim())
    .filter(Boolean);
  if (triggers.length === 0) triggers.push('ADNY');

  return {
    port: Number(process.env.PORT) || 3000,
    metaAppSecret: process.env.META_APP_SECRET || '',
    metaVerifyToken: process.env.META_VERIFY_TOKEN || '',
    metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    metaAccessToken: process.env.META_ACCESS_TOKEN || '',
    metaApiVersion: process.env.META_API_VERSION || 'v21.0',
    allowedGroupIds: new Set(allowed),
    allowlistStrict: allowed.length > 0,
    botTriggers: triggers.map((t) => t.toLowerCase()),
    appsScriptUrl: (process.env.APPS_SCRIPT_URL || '').trim().replace(/\/$/, ''),
    appsScriptToken: (process.env.APPS_SCRIPT_TOKEN || '').trim(),
    rateLimitMax: Number(process.env.RATE_LIMIT_PER_MIN) || 20,
    logWebhookBody: process.env.LOG_WEBHOOK_BODY === '1' || process.env.LOG_WEBHOOK_BODY === 'true',
  };
}
