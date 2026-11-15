// Signed, stateless session token for the optional dashboard password gate.
//
// Runs inside src/proxy.ts, which executes on the edge runtime (see
// origin-guard.mjs's own header) — so this stays free of `node:crypto` /
// `Buffer` and uses only Web Crypto (`crypto.subtle`) and `btoa`/`atob`,
// which both the edge runtime and Node 22+ provide as globals. The login
// route (full Node runtime) imports the same module so the two never sign
// or verify against incompatible implementations.
//
// Token shape: `{expiresAtMs}.{base64url(HMAC-SHA256(expiresAtMs))}`. There is
// no session store: anyone holding a validly-signed, unexpired token is "the
// one person with the password" by construction, which is all a single-user
// dashboard needs. Signing uses SESSION_SECRET, never the password itself, so
// rotating the secret (not the password) is what invalidates every session.

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** A signed token valid for `maxAgeSeconds` from now (default 30 days). */
export async function createSessionToken(secret, maxAgeSeconds = 60 * 60 * 24 * 30) {
  const expiresAt = String(Date.now() + maxAgeSeconds * 1000);
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(expiresAt)));
  return `${expiresAt}.${toBase64Url(sig)}`;
}

/** True only for a token whose signature matches `secret` and that has not expired. */
export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expiresAt = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  if (!/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) < Date.now()) return false;
  let sigBytes;
  try {
    sigBytes = fromBase64Url(sigPart);
  } catch {
    return false;
  }
  const key = await hmacKey(secret);
  // subtle.verify does the signature comparison in constant time internally.
  return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(expiresAt));
}

export const DASHBOARD_SESSION_COOKIE = "co_dash_session";
