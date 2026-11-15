import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../../src/lib/safe-redirect.mjs";
import { createLoginThrottle, clientKey, WINDOW_MS } from "../../src/lib/login-throttle.mjs";

test("safeNextPath keeps same-site paths, query strings included", () => {
  assert.equal(safeNextPath("/pipeline"), "/pipeline");
  assert.equal(safeNextPath("/pipeline?tab=EVALUATED&q=a%20b"), "/pipeline?tab=EVALUATED&q=a%20b");
  assert.equal(safeNextPath("/pipeline/1/apply"), "/pipeline/1/apply");
});

test("safeNextPath refuses anything that could leave the site", () => {
  for (const evil of [
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "http://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    null,
    undefined,
    42,
    "/a\\b",
    "/x".repeat(2000),
  ]) {
    assert.equal(safeNextPath(evil), "/", `must reject ${JSON.stringify(evil)?.slice(0, 40)}`);
  }
});

test("safeNextPath never bounces back into the sign-in page", () => {
  assert.equal(safeNextPath("/dashboard-login"), "/");
  assert.equal(safeNextPath("/dashboard-login?next=/pipeline"), "/");
});

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms) };
};

test("throttle allows a few failures then blocks that client", () => {
  const c = clock();
  const th = createLoginThrottle({ now: c.now, perClientMax: 3, globalMax: 100 });
  for (let i = 0; i < 3; i++) {
    assert.equal(th.check("1.1.1.1").allowed, true);
    th.recordFailure("1.1.1.1");
  }
  const blocked = th.check("1.1.1.1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= WINDOW_MS / 1000);
  assert.equal(th.check("2.2.2.2").allowed, true, "another client is unaffected");
});

test("throttle forgives after the window and on success", () => {
  const c = clock();
  const th = createLoginThrottle({ now: c.now, perClientMax: 2, globalMax: 100 });
  th.recordFailure("a");
  th.recordFailure("a");
  assert.equal(th.check("a").allowed, false);
  c.advance(WINDOW_MS + 1);
  assert.equal(th.check("a").allowed, true, "window elapsed");

  th.recordFailure("b");
  th.recordFailure("b");
  th.recordSuccess("b");
  assert.equal(th.check("b").allowed, true, "a correct password clears the count");
});

test("global ceiling stops a spread-out guesser", () => {
  const c = clock();
  const th = createLoginThrottle({ now: c.now, perClientMax: 100, globalMax: 5 });
  for (let i = 0; i < 5; i++) th.recordFailure(`ip-${i}`);
  assert.equal(th.check("fresh-ip").allowed, false);
});

test("clientKey prefers the first forwarded hop", () => {
  const h = (o) => new Headers(o);
  assert.equal(clientKey(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientKey(h({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientKey(h({})), "unknown");
});
