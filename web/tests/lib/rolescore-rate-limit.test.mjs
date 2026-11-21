import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, clientIp } from "../../src/lib/rolescore/rate-limit.mjs";

test("checkRateLimit allows up to the limit, then blocks", () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
  }
  const blocked = checkRateLimit(key, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("checkRateLimit uses separate buckets per key", () => {
  const keyA = `test-a:${Math.random()}`;
  const keyB = `test-b:${Math.random()}`;
  assert.equal(checkRateLimit(keyA, 1, 60_000).allowed, true);
  assert.equal(checkRateLimit(keyA, 1, 60_000).allowed, false);
  // A different key's bucket is untouched by A's limit.
  assert.equal(checkRateLimit(keyB, 1, 60_000).allowed, true);
});

test("checkRateLimit resets after the window elapses", async () => {
  const key = `test-window:${Math.random()}`;
  assert.equal(checkRateLimit(key, 1, 20).allowed, true);
  assert.equal(checkRateLimit(key, 1, 20).allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(checkRateLimit(key, 1, 20).allowed, true);
});

test("clientIp prefers x-forwarded-for, falls back to x-real-ip, then unknown", () => {
  const withFwd = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
  assert.equal(clientIp(withFwd), "1.2.3.4");

  const withReal = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
  assert.equal(clientIp(withReal), "9.9.9.9");

  const withNeither = new Request("http://x");
  assert.equal(clientIp(withNeither), "unknown");
});
