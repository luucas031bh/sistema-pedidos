/**
 * Chamadas somente GET ao Web App do Apps Script (read-only na prática).
 */

function buildUrl(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function gasGet(config, action, extraParams = {}) {
  if (!config.appsScriptUrl) {
    throw new Error('APPS_SCRIPT_URL não configurado no .env');
  }
  const params = { action, ...extraParams };
  const url = buildUrl(config.appsScriptUrl, params);
  const headers = { Accept: 'application/json' };
  if (config.appsScriptToken) {
    headers['X-Bot-Token'] = config.appsScriptToken;
  }
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não é JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  return data;
}
