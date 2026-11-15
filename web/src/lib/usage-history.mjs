// Pure helpers for the /usage page: turns the worker job list (job-store.tsx's
// `Job[]`, persisted client-side in localStorage — see jobs-persist.mjs) into
// the per-run and per-kind cost summaries the page renders. No fetch, no
// browser APIs, so this is unit-testable without a DOM.
//
// This is NOT a cost ledger: job-store keeps at most 40 jobs (job-store.tsx),
// and that list lives only in this browser's localStorage — a different
// browser, a cleared site data, or the 41st run all lose history this page
// can't recover. See the page's own "what this is / isn't" note. A real
// ledger would persist cost server-side per run; nothing here claims to be
// that.

const KIND_LABELS = {
  evaluate: "Evaluate",
  pdf: "Generate CV",
  cover: "Cover letter",
  "fix-portal": "Fix portal",
};

/** Human label for a job kind, falling back to a capitalized version of an unknown one. */
export function labelForKind(kind) {
  if (!kind) return "Other";
  return KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

function hasCost(job) {
  return typeof job?.cost?.tokens === "number" && job.cost.tokens > 0;
}

/** Cost-bearing jobs, newest first — the rows the page's table lists. */
export function costHistory(jobs) {
  return (Array.isArray(jobs) ? jobs : [])
    .filter(hasCost)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

/**
 * Totals and a per-kind breakdown over every cost-bearing job.
 * `usdKnownFor` is the token total of only the runs that also reported a
 * dollar figure — the page uses it to say "at least $X" rather than a false
 * precise total when a CLI reported tokens but no cost.
 */
export function summarizeUsage(jobs) {
  const rows = costHistory(jobs);
  const byKind = new Map();
  let totalTokens = 0;
  let totalUsd = 0;
  let usdKnownRuns = 0;

  for (const job of rows) {
    const kind = job.kind ?? "other";
    const entry = byKind.get(kind) ?? { kind, label: labelForKind(kind), count: 0, tokens: 0, usd: 0, usdKnownRuns: 0 };
    entry.count += 1;
    entry.tokens += job.cost.tokens;
    totalTokens += job.cost.tokens;
    if (typeof job.cost.usd === "number") {
      entry.usd += job.cost.usd;
      entry.usdKnownRuns += 1;
      totalUsd += job.cost.usd;
      usdKnownRuns += 1;
    }
    byKind.set(kind, entry);
  }

  return {
    runCount: rows.length,
    totalTokens,
    totalUsd,
    usdKnownRuns, // < runCount means some runs' $ cost is unknown (e.g. a non-Claude CLI) — totalUsd is a floor, not exact
    byKind: [...byKind.values()].sort((a, b) => b.usd - a.usd || b.tokens - a.tokens),
  };
}
