// Brute-force protection for the sign-in route, which is reachable from the
// public internet. In-memory by design: one dashboard process, and a restart
// forgiving everyone is acceptable for a personal instance (a multi-instance
// deployment would move this to shared storage).
//
// Two ceilings over a sliding window:
//   - per client key (first X-Forwarded-For hop): stops one source hammering
//   - global: caps total guesses per window even when sources are spread out.
//     The cost is that a determined attacker can lock the owner out for one
//     window; the owner's existing 30-day session cookie is unaffected.
// A successful sign-in clears that client's failures.

export const WINDOW_MS = 15 * 60 * 1000;
export const PER_CLIENT_MAX = 8;
export const GLOBAL_MAX = 60;

/**
 * @param {{ now?: () => number, windowMs?: number, perClientMax?: number, globalMax?: number }} [opts]
 */
export function createLoginThrottle({ now = Date.now, windowMs = WINDOW_MS, perClientMax = PER_CLIENT_MAX, globalMax = GLOBAL_MAX } = {}) {
  /** @type {Map<string, number[]>} */
  const perClient = new Map();
  /** @type {number[]} */
  let global = [];

  const recent = (list) => list.filter((t) => now() - t < windowMs);

  return {
    /** @returns {{ allowed: true } | { allowed: false, retryAfterSec: number }} */
    check(client) {
      const mine = recent(perClient.get(client) ?? []);
      global = recent(global);
      const blocked = mine.length >= perClientMax ? mine : global.length >= globalMax ? global : null;
      if (!blocked) return { allowed: true };
      const retryAfterMs = Math.max(1000, windowMs - (now() - Math.min(...blocked)));
      return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
    },
    recordFailure(client) {
      const t = now();
      const mine = recent(perClient.get(client) ?? []);
      mine.push(t);
      perClient.set(client, mine);
      global.push(t);
      // Keep the map from growing without bound under a spread-out attack.
      if (perClient.size > 5000) {
        for (const [k, v] of perClient) if (recent(v).length === 0) perClient.delete(k);
      }
    },
    recordSuccess(client) {
      perClient.delete(client);
    },
  };
}

/** The caller's address as the proxy in front of us reports it, else a shared bucket. */
export function clientKey(headers) {
  const xff = headers.get("x-forwarded-for");
  const first = xff ? xff.split(",")[0].trim() : "";
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
