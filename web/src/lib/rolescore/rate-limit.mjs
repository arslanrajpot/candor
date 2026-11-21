// Tiny in-memory fixed-window limiter. Single-process Node server (this repo
// runs one `node server.mjs` instance, no horizontal scaling), so no shared
// store is needed — mirrors the scale of candor's own dashboard login
// throttle (proxy.ts: 8 failures/15 min per client, in memory).
const buckets = new Map();

// Unbounded growth guard: sweep expired entries occasionally rather than on
// every call (this is a low-traffic, invite-only tool).
let lastSweep = Date.now();
function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}

/**
 * @param {string} key - e.g. `${action}:${ip}` or `${action}:${userId}`
 * @param {number} limit - max calls allowed per window
 * @param {number} windowMs - window length
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/** Best-effort client IP from standard proxy headers, falling back to a shared bucket. */
export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
