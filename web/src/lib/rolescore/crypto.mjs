// AES-256-GCM at rest for user-supplied AI API keys. Runs only in route
// handlers (runtime = "nodejs"), never on the edge, so node:crypto is fine.
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

function keyBytes() {
  const secret = process.env.ROLESCORE_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ROLESCORE_ENCRYPTION_KEY is not set — generate one with `openssl rand -base64 32` and add it to web/.env.local",
    );
  }
  // Accept either a base64/hex 32-byte value or an arbitrary passphrase —
  // hash either shape down to exactly 32 bytes so setup can't silently
  // produce a key of the wrong length.
  return createHash("sha256").update(secret).digest();
}

/** Returns "iv.ciphertext.tag", all base64url, for storage as a single column value. */
export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, enc, tag].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored) {
  const [ivB64, encB64, tagB64] = String(stored).split(".");
  if (!ivB64 || !encB64 || !tagB64) throw new Error("Malformed encrypted value");
  const iv = Buffer.from(ivB64, "base64url");
  const enc = Buffer.from(encB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Last 4 chars only — enough for a user to tell keys apart, never the real value. */
export function maskKey(plaintext) {
  const s = String(plaintext);
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}
