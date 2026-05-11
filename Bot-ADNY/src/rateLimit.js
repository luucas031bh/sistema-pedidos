const windows = new Map();

export function rateAllowed(key, maxPerMinute) {
  const now = Date.now();
  const windowMs = 60_000;
  let arr = windows.get(key);
  if (!arr) {
    arr = [];
    windows.set(key, arr);
  }
  const fresh = arr.filter((t) => now - t < windowMs);
  windows.set(key, fresh);
  if (fresh.length >= maxPerMinute) return false;
  fresh.push(now);
  return true;
}
