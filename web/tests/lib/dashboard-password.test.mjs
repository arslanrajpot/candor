import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { hashPassword, verifyPassword } from "../../src/lib/dashboard-password.mjs";

test("hashPassword records strong cost parameters (OWASP scrypt floor), and the password verifies", () => {
  const stored = hashPassword("correct horse battery staple");
  const [n, r, p] = stored.split(":");
  assert.equal(Number(n), 131072); // 2^17, the OWASP minimum — Node's own scryptSync default is 2^14
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("verifyPassword still accepts a legacy {saltHex}:{hashHex} hash made with Node's old scryptSync default", () => {
  const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex").subarray(0, 16);
  const hash = scryptSync("legacy password", salt, 64); // no N/r/p => Node's default (N=16384, r=8, p=1)
  const legacyStored = `${salt.toString("hex")}:${hash.toString("hex")}`;
  assert.equal(verifyPassword("legacy password", legacyStored), true);
  assert.equal(verifyPassword("wrong password", legacyStored), false);
});

test("verifyPassword rejects malformed stored values instead of throwing", () => {
  assert.equal(verifyPassword("anything", ""), false);
  assert.equal(verifyPassword("anything", "not-a-hash"), false);
  assert.equal(verifyPassword("anything", "1:2:3:4"), false); // 4 fields, neither legacy nor current shape
  assert.equal(verifyPassword("anything", null), false);
});
