const recentRequests = new Map();
const COOLDOWN_MS = 3000;

function checkCooldown(userId) {
  if (!userId) return { ok: true };

  const now = Date.now();
  const last = recentRequests.get(userId);

  if (last && now - last < COOLDOWN_MS) {
    return {
      ok: false,
      reason: 'Aguarde alguns segundos antes do próximo comando.',
    };
  }

  recentRequests.set(userId, now);

  if (recentRequests.size > 500) {
    const cutoff = now - COOLDOWN_MS * 10;
    for (const [key, ts] of recentRequests.entries()) {
      if (ts < cutoff) recentRequests.delete(key);
    }
  }

  return { ok: true };
}

module.exports = { checkCooldown };
