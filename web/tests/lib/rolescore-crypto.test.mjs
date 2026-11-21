import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, maskKey } from "../../src/lib/rolescore/crypto.mjs";

process.env.ROLESCORE_ENCRYPTION_KEY = "test-only-encryption-key-not-for-real-use";

test("encryptSecret/decryptSecret round-trips the original value", () => {
  const plaintext = "sk-test-1234567890abcdef";
  const stored = encryptSecret(plaintext);
  assert.notEqual(stored, plaintext);
  assert.equal(decryptSecret(stored), plaintext);
});

test("encryptSecret is non-deterministic (random IV per call)", () => {
  const a = encryptSecret("same-input");
  const b = encryptSecret("same-input");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "same-input");
  assert.equal(decryptSecret(b), "same-input");
});

test("decryptSecret rejects a tampered ciphertext (auth tag fails)", () => {
  const stored = encryptSecret("sk-test-1234567890abcdef");
  const [iv, ciphertext, tag] = stored.split(".");
  const tampered = [iv, ciphertext.slice(0, -2) + (ciphertext.at(-2) === "A" ? "B" : "A") + ciphertext.at(-1), tag].join(".");
  assert.throws(() => decryptSecret(tampered));
});

test("maskKey shows only the last 4 characters", () => {
  assert.equal(maskKey("sk-abcdef123456"), "••••3456");
  assert.equal(maskKey("ab"), "••••");
});
