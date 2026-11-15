import { test } from "node:test";
import assert from "node:assert/strict";
import { costHistory, labelForKind, summarizeUsage } from "../../src/lib/usage-history.mjs";

const job = (overrides) => ({ id: "x", title: "t", status: "done", steps: [], text: "", startedAt: 0, ...overrides });

test("labelForKind maps known kinds and capitalizes an unknown one", () => {
  assert.equal(labelForKind("evaluate"), "Evaluate");
  assert.equal(labelForKind("pdf"), "Generate CV");
  assert.equal(labelForKind("cover"), "Cover letter");
  assert.equal(labelForKind("fix-portal"), "Fix portal");
  assert.equal(labelForKind("something-new"), "Something-new");
  assert.equal(labelForKind(undefined), "Other");
});

test("costHistory keeps only jobs with a positive token cost, newest first", () => {
  const jobs = [
    job({ id: "a", startedAt: 1, cost: { tokens: 100, usd: 0.1 } }),
    job({ id: "b", startedAt: 3, cost: { tokens: 200, usd: 0.2 } }),
    job({ id: "c", startedAt: 2 }), // no cost at all — still running, or a free kind
    job({ id: "d", startedAt: 4, cost: { tokens: 0 } }), // reported but zero — excluded
  ];
  assert.deepEqual(costHistory(jobs).map((j) => j.id), ["b", "a"]);
});

test("summarizeUsage totals tokens and usd, and groups by kind", () => {
  const jobs = [
    job({ kind: "evaluate", startedAt: 1, cost: { tokens: 1000, usd: 0.7 } }),
    job({ kind: "evaluate", startedAt: 2, cost: { tokens: 500, usd: 0.35 } }),
    job({ kind: "pdf", startedAt: 3, cost: { tokens: 2000, usd: 0.45 } }),
  ];
  const summary = summarizeUsage(jobs);
  assert.equal(summary.runCount, 3);
  assert.equal(summary.totalTokens, 3500);
  assert.equal(Math.round(summary.totalUsd * 100), 150); // 0.7 + 0.35 + 0.45 = 1.50
  assert.equal(summary.usdKnownRuns, 3);
  assert.deepEqual(summary.byKind.map((k) => k.kind), ["evaluate", "pdf"]); // evaluate's $1.05 > pdf's $0.45
  const evaluate = summary.byKind.find((k) => k.kind === "evaluate");
  assert.equal(evaluate.count, 2);
  assert.equal(evaluate.tokens, 1500);
});

test("summarizeUsage treats a run with tokens but no reported $ as a known-floor, not a false precise total", () => {
  const jobs = [
    job({ kind: "fix-portal", startedAt: 1, cost: { tokens: 800 } }), // a CLI that reports tokens but not $
    job({ kind: "evaluate", startedAt: 2, cost: { tokens: 1000, usd: 0.7 } }),
  ];
  const summary = summarizeUsage(jobs);
  assert.equal(summary.runCount, 2);
  assert.equal(summary.usdKnownRuns, 1); // only the evaluate run's $ is known
  assert.equal(summary.totalUsd, 0.7); // the fix-portal run contributes 0, not undefined/NaN
});

test("summarizeUsage returns zeroed totals for an empty or cost-free job list", () => {
  const summary = summarizeUsage([job({ startedAt: 1 })]);
  assert.equal(summary.runCount, 0);
  assert.equal(summary.totalTokens, 0);
  assert.equal(summary.totalUsd, 0);
  assert.deepEqual(summary.byKind, []);
});
