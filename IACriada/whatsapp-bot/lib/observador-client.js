import { config } from "./config.js";
import { log } from "./logger.js";

const BASE = config.observadorApiBase.replace(/\/$/, "");

async function postJson(path, body, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn("Observador API erro", { path, status: res.status, data });
      return { ok: false, data };
    }
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timer);
    log.warn("Observador API falhou", { path, err: String(err) });
    return { ok: false, err: String(err) };
  }
}

export async function enviarEventoWhatsapp(payload) {
  return postJson("/api/observador/whatsapp", payload, config.aiTimeoutMs);
}

export async function tickSnapshotRp() {
  return postJson("/api/observador/tick", {}, 120000);
}
