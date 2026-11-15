import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireInFlightRun, releaseInFlightRun } from "../../src/lib/core/run-registry.ts";

test("acquireInFlightRun refuses a second acquire for the same kind+input until released", () => {
  const input = `https://example.test/job-${Date.now()}`; // unique per run so tests don't collide
  assert.equal(acquireInFlightRun("evaluate", input), true);
  assert.equal(acquireInFlightRun("evaluate", input), false); // the double-click / second tab case
  releaseInFlightRun("evaluate", input);
  assert.equal(acquireInFlightRun("evaluate", input), true); // free again after release
  releaseInFlightRun("evaluate", input);
});

test("acquireInFlightRun keys by kind+input, so pdf and evaluate for the same application don't block each other", () => {
  const input = `app-${Date.now()}`;
  assert.equal(acquireInFlightRun("evaluate", input), true);
  assert.equal(acquireInFlightRun("pdf", input), true);
  assert.equal(acquireInFlightRun("cover", input), true);
  releaseInFlightRun("evaluate", input);
  releaseInFlightRun("pdf", input);
  releaseInFlightRun("cover", input);
});

test("acquireInFlightRun distinguishes different inputs of the same kind", () => {
  const a = `a-${Date.now()}`;
  const b = `b-${Date.now()}`;
  assert.equal(acquireInFlightRun("evaluate", a), true);
  assert.equal(acquireInFlightRun("evaluate", b), true); // different application — not blocked
  releaseInFlightRun("evaluate", a);
  releaseInFlightRun("evaluate", b);
});
