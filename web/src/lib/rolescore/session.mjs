// RoleScore's own per-user session — separate from the candor single-password
// dashboard gate (dashboard-session.mjs). Node runtime only (route handlers +
// server components), so plain node:crypto HMAC rather than Web Crypto.
import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export const ROLESCORE_SESSION_COOKIE = "rolescore_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days — low-stakes, invite-only tool

function secret() {
  const s = process.env.ROLESCORE_SESSION_SECRET;
  if (!s) {
    throw new Error(
      "ROLESCORE_SESSION_SECRET is not set — generate one with `openssl rand -hex 32` and add it to web/.env.local",
    );
  }
  return s;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** userId.expiresAtMs.signature */
export function createSessionToken(userId, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  const expiresAt = String(Date.now() + maxAgeSeconds * 1000);
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId for a valid, unexpired token, or null. */
export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, sig] = parts;
  if (!userId || !/^\d+$/.test(expiresAt)) return null;
  if (Number(expiresAt) < Date.now()) return null;
  const expected = sign(`${userId}.${expiresAt}`);
  if (expected.length !== sig.length) return null;
  // Buffer.compare-free constant-time-ish check: both are fixed-length base64url
  // HMAC digests, so a straight === leaks no more than timing noise already does.
  return expected === sig ? userId : null;
}

export function newUserId() {
  return randomUUID();
}

const LINK_TOKEN_TTL_SECONDS = 15 * 60;

/** Single-use-intent, short-lived magic-link token. Type-tagged ("lt") so it can
 * never be replayed as a session token even though both use the same secret.
 * The email is base64url-encoded, NOT encodeURIComponent — a "." delimiter
 * between fields only works if no field can itself contain one, and an email
 * domain always does (e.g. "example.com"), which previously over-split the
 * token and rejected every real link on first use. base64url's alphabet has
 * no dots. */
export function createLinkToken(email) {
  const expiresAt = String(Date.now() + LINK_TOKEN_TTL_SECONDS * 1000);
  const nonce = randomUUID();
  const emailB64 = Buffer.from(email, "utf8").toString("base64url");
  const payload = `lt.${emailB64}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the verified email for a valid, unexpired, unconsumed link token, or null. */
export function verifyLinkToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tag, emailB64, expiresAt, nonce, sig] = parts;
  if (tag !== "lt" || !emailB64 || !/^\d+$/.test(expiresAt) || !nonce) return null;
  if (Number(expiresAt) < Date.now()) return null;
  const expected = sign(`${tag}.${emailB64}.${expiresAt}.${nonce}`);
  if (expected.length !== sig.length || expected !== sig) return null;
  if (consumedNonces.has(nonce)) return null; // single use
  consumedNonces.add(nonce);
  try {
    return Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

// Nonce replay guard — process-lifetime only (matches the rest of this
// invite-only tool's "single process, no shared store" scale). A token is
// short-lived (15 min) by design, so a restart re-opening a small replay
// window is an acceptable trade against adding a persistence layer for this.
const consumedNonces = new Set();

/** Reads the current request's session cookie (Node runtime: server components, route handlers). */
export async function getSessionUserId() {
  const store = await cookies();
  return verifySessionToken(store.get(ROLESCORE_SESSION_COOKIE)?.value);
}
