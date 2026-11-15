// Password hashing for the optional dashboard password gate. Node-only
// (scrypt + timingSafeEqual aren't in the edge runtime) — used by the setup
// script and the login API route, both of which run in the Node runtime, not
// in src/proxy.ts. See dashboard-session.mjs for the edge-safe session token.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
// OWASP's password-storage cheat sheet floor for scrypt: N=2^17, r=8, p=1.
// Node's own scryptSync default (N=2^14) is well below that, so every hash this
// module creates now records its own cost parameters instead of relying on the
// runtime default, and verifyPassword replays whatever parameters a stored hash
// says it used — so a hash minted before this change still verifies.
const N = 131072;
const R = 8;
const P = 1;
const MAX_MEM = 256 * 1024 * 1024;

/** `{N}:{r}:{p}:{saltHex}:{hashHex}`, suitable for CAREER_OPS_DASHBOARD_PASSWORD_HASH. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return `${N}:${R}:${P}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verifies `password` against a stored hash in constant time. Accepts both the
 * current `{N}:{r}:{p}:{saltHex}:{hashHex}` format and the legacy two-field
 * `{saltHex}:{hashHex}` format (implicitly Node's old scryptSync default:
 * N=16384, r=8, p=1), so a hash minted before this change keeps working.
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");
  try {
    let n, r, p, saltHex, hashHex;
    if (parts.length === 5) {
      [n, r, p, saltHex, hashHex] = parts;
      n = Number(n);
      r = Number(r);
      p = Number(p);
    } else if (parts.length === 2) {
      [saltHex, hashHex] = parts;
      n = 16384;
      r = 8;
      p = 1;
    } else {
      return false;
    }
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
