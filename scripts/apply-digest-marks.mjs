#!/usr/bin/env node
/**
 * apply-digest-marks.mjs — zero-token write-back step for daily-digest-sweep.sh.
 *
 * The digest agent used to mark each scored posting in data/pipeline.md itself
 * via the Edit tool, one line at a time. At ~25 lines/run that consistently
 * tempted the agent into writing and asking to run a bulk Python script
 * instead (Bash is deliberately not in its --allowedTools — see
 * daily-digest-sweep.sh's header comment on why) — which then needed a human
 * to approve and run by hand, so most days' scored postings silently stayed
 * unmarked and were rescored at full cost the next day (#rediscovered
 * 2026-11-21: this had been happening since at least 2026-11-14).
 *
 * This mirrors apply-shortlist-skips.mjs's fix for the same shape of problem:
 * the agent only WRITES data/digest-results-{date}.json (one Write call, a
 * tool it already has), and this script applies the marks deterministically:
 *   `- [ ] <url> ...`  ->  `- [x] <url> ... — digest: PASS 4.2/5 (2026-11-21)`
 *   `- [ ] <url> ...`  ->  `- [x] <url> ... — digest: SKIP (2026-11-21)`
 * Only lines still unchecked are touched, and only for a URL present in the
 * results file — nothing is ever marked on a guess.
 *
 *   node scripts/apply-digest-marks.mjs --date YYYY-MM-DD [--root DIR] [--dry-run]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * @param {string} json - the digest-results-{date}.json contents
 * @returns {Map<string, {verdict: string, score: number|null}>}
 */
export function parseDigestResults(json) {
  const rows = JSON.parse(json);
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row.url !== 'string' || typeof row.verdict !== 'string') continue;
    const score = typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : null;
    out.set(row.url, { verdict: row.verdict.toUpperCase(), score });
  }
  return out;
}

/**
 * @param {string} pipelineMd
 * @param {Map<string, {verdict: string, score: number|null}>} results url -> {verdict, score}
 * @param {string} date - YYYY-MM-DD, for the appended suffix
 * @returns {{ text: string, marked: number }}
 */
export function markDigestResults(pipelineMd, results, date) {
  let marked = 0;
  const text = pipelineMd
    .split('\n')
    .map((line) => {
      const m = line.match(/^- \[ \] (https?:\/\/\S+)(.*)$/);
      if (!m || !results.has(m[1])) return line;
      const { verdict, score } = results.get(m[1]);
      const suffix =
        verdict === 'SKIP' || score === null
          ? ` — digest: SKIP (${date})`
          : ` — digest: ${verdict} ${score.toFixed(1)}/5 (${date})`;
      marked++;
      return `- [x] ${m[1]}${m[2]}${suffix}`;
    })
    .join('\n');
  return { text, marked };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
  const dateIdx = argv.indexOf('--date');
  const date = dateIdx >= 0 ? argv[dateIdx + 1] : new Date().toISOString().slice(0, 10);

  const resultsPath = join(root, 'data', `digest-results-${date}.json`);
  const pipelinePath = join(root, 'data', 'pipeline.md');
  if (!existsSync(resultsPath) || !existsSync(pipelinePath)) {
    console.log('apply-digest-marks: nothing to do (missing digest-results file or pipeline.md)');
    return;
  }

  const results = parseDigestResults(readFileSync(resultsPath, 'utf8'));
  const { text, marked } = markDigestResults(readFileSync(pipelinePath, 'utf8'), results, date);
  if (!dryRun && marked > 0) {
    const tmp = `${pipelinePath}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, pipelinePath);
  }
  console.log(
    `apply-digest-marks: ${results.size} result(s), ${marked} pending line(s) ${dryRun ? 'would be ' : ''}marked`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
