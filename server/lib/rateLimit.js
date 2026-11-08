/**
 * Simple in-memory sliding window rate limiter (per key).
 * Fine for a single-process MVP: counts reset on restart and aren't shared across
 * instances. Keys are never evicted, so the map grows with distinct users.
 */
const buckets = new Map();

export function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  let timestamps = buckets.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    const retryAfterMs = windowMs - (now - timestamps[0]);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}
