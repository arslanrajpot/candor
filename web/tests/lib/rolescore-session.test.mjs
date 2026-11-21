// tests/lib/rolescore-session.test.mjs
//
// THE BUG THIS PINS
//
// createLinkToken/verifyLinkToken originally joined fields with "." and split
// the token back apart the same way. That broke the moment the email itself
// contained a dot — which every real email does, in its domain
// ("name@example.com") — because token.split(".") then produced MORE than
// the 5 expected parts, so parts.length !== 5 rejected every real link on
// its very first use. Caught manually in browser/curl testing (2026-11-21):
// a magic-link request for "magiclink-qa@example.com" redirected straight to
// the expired-link error instead of signing in. Fixed by base64url-encoding
// the email (no dots in that alphabet) instead of encodeURIComponent.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  createLinkToken,
  verifyLinkToken,
} from "../../src/lib/rolescore/session.mjs";

process.env.ROLESCORE_SESSION_SECRET = "test-only-session-secret-not-for-real-use";

test("createSessionToken/verifySessionToken round-trips a user id", () => {
  const token = createSessionToken("user-123");
  assert.equal(verifySessionToken(token), "user-123");
});

test("verifySessionToken rejects an expired token", () => {
  const token = createSessionToken("user-123", -1); // already expired
  assert.equal(verifySessionToken(token), null);
});

test("verifySessionToken rejects a tampered signature", () => {
  const token = createSessionToken("user-123");
  const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
  assert.equal(verifySessionToken(tampered), null);
});

test("verifySessionToken rejects garbage input", () => {
  assert.equal(verifySessionToken(""), null);
  assert.equal(verifySessionToken(null), null);
  assert.equal(verifySessionToken("not-a-real-token"), null);
});

test("createLinkToken/verifyLinkToken round-trips an email whose domain contains a dot", () => {
  // Regression case for the bug above: every real email domain has a dot.
  const token = createLinkToken("magiclink-qa@example.com");
  assert.equal(verifyLinkToken(token), "magiclink-qa@example.com");
});

test("createLinkToken/verifyLinkToken round-trips an email with multiple dots", () => {
  const token = createLinkToken("first.last@mail.example.co.uk");
  assert.equal(verifyLinkToken(token), "first.last@mail.example.co.uk");
});

test("verifyLinkToken enforces single use (replay is rejected)", () => {
  const token = createLinkToken("single-use@example.com");
  assert.equal(verifyLinkToken(token), "single-use@example.com");
  assert.equal(verifyLinkToken(token), null); // second use of the same token
});

test("verifyLinkToken rejects an expired link", () => {
  const originalNow = Date.now;
  Date.now = () => originalNow() - 16 * 60 * 1000; // 16 minutes in the past
  const token = createLinkToken("expired@example.com");
  Date.now = originalNow;
  assert.equal(verifyLinkToken(token), null);
});

test("verifyLinkToken rejects a session token and vice versa (type tag isolation)", () => {
  const sessionToken = createSessionToken("user-123");
  const linkToken = createLinkToken("user@example.com");
  assert.equal(verifyLinkToken(sessionToken), null);
  assert.equal(verifySessionToken(linkToken), null);
});
