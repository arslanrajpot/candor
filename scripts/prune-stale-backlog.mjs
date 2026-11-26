#!/usr/bin/env node
/**
 * prune-stale-backlog.mjs — zero-token backlog pruner for data/pipeline.md.
 *
 * shortlist-sweep.sh only ever triages the NEWEST `--limit` unchecked
 * postings per run (see its own header comment: a flat "read everything"
 * approach used to mean fresh postings waited behind a 450 KB backlog of
 * ancient ones). That design is correct for keeping each run cheap, but it
 * has a side effect nothing else corrects: a posting that is never in the
 * newest window just sits `- [ ]` forever, and the pending count grows
 * without bound (3500+ as of 2026-11-26). This script is the missing other
 * half — it discards (marks `- [x] ... — skip: stale backlog ...`) anything
 * that has been sitting unprocessed longer than `--max-age-days` (default 7),
 * so the backlog stops being a one-way ratchet.
 *
 * "Sitting in the backlog" is QUEUE age, not the employer's own posting date:
 * read from scan-history.tsv's `first_seen` column (the date this script/scan
 * first discovered the URL), never the `posted: YYYY-MM-DD` suffix some
 * pipeline.md lines carry (that's often missing, and describes when the
 * employer listed the role, not how long it's been waiting in this queue).
 *
 * Only touches lines that are:
 *   - still unchecked (`- [ ] ...`)
 *   - resolvable to a first_seen date via scan-history.tsv (by exact URL)
 *   - older than --max-age-days
 * A line whose URL isn't in scan-history.tsv is left untouched (never
 * guessed) — it's reported separately so the count is honest about coverage.
 *
 *   node scripts/prune-stale-backlog.mjs [--root DIR] [--max-age-days N] [--dry-run] [--today YYYY-MM-DD] [--json]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { withPipelineLock } from '../pipeline-lock.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';

const DEFAULT_MAX_AGE_DAYS = 7;

const USAGE = `Usage: node scripts/prune-stale-backlog.mjs [--root DIR] [--max-age-days N] [--dry-run] [--today YYYY-MM-DD] [--json]

  --root DIR          Data root to read/write (default: the repository this script lives in)
  --max-age-days N    Discard a pending posting once it has queued this many days (default: ${DEFAULT_MAX_AGE_DAYS})
  --dry-run           Report what would be pruned without writing pipeline.md
  --today YYYY-MM-DD  Treat this date as "today" (default: the real current date)
  --json              Print a machine-readable summary instead of prose
  --help, -h          Show this message and exit
`;

/** Parse scan-history.tsv into a Map<url, earliest first_seen (YYYY-MM-DD)>. */
export function parseFirstSeen(scanHistoryTsv) {
  const lines = scanHistoryTsv.split('\n').filter((l) => l.length > 0);
  const map = new Map();
  if (lines.length === 0) return map;
  const header = lines[0].split('\t');
  const urlIdx = header.indexOf('url');
  const firstSeenIdx = header.indexOf('first_seen');
  if (urlIdx < 0 || firstSeenIdx < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const url = cols[urlIdx];
    const firstSeen = cols[firstSeenIdx];
    if (!url || !firstSeen || !/^\d{4}-\d{2}-\d{2}$/.test(firstSeen)) continue;
    const existing = map.get(url);
    if (!existing || firstSeen < existing) map.set(url, firstSeen);
  }
  return map;
}

function daysBetween(earlierYmd, laterYmd) {
  const a = new Date(`${earlierYmd}T00:00:00Z`).getTime();
  const b = new Date(`${laterYmd}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * @param {string} pipelineMd
 * @param {Map<string, string>} firstSeenByUrl
 * @param {{ maxAgeDays: number, today: string }} opts
 * @returns {{ text: string, pruned: number, resolved: number, unresolved: number, unchecked: number }}
 */
export function pruneStaleEntries(pipelineMd, firstSeenByUrl, { maxAgeDays, today }) {
  let pruned = 0;
  let resolved = 0;
  let unresolved = 0;
  let unchecked = 0;
  const lines = pipelineMd.split('\n').map((line) => {
    const m = line.match(/^- \[ \] (https?:\/\/\S+)(.*)$/);
    if (!m) return line;
    unchecked++;
    const [, url, rest] = m;
    const firstSeen = firstSeenByUrl.get(url);
    if (!firstSeen) {
      unresolved++;
      return line;
    }
    resolved++;
    const age = daysBetween(firstSeen, today);
    if (age <= maxAgeDays) return line;
    pruned++;
    return `- [x] ${url}${rest} — skip: stale backlog, queued since ${firstSeen} (${age}d > ${maxAgeDays}d, auto-discarded ${today})`;
  });
  return { text: lines.join('\n'), pruned, resolved, unresolved, unchecked };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
  const maxAgeIdx = argv.indexOf('--max-age-days');
  const maxAgeDays = maxAgeIdx >= 0 ? Number(argv[maxAgeIdx + 1]) : DEFAULT_MAX_AGE_DAYS;
  const todayIdx = argv.indexOf('--today');
  const today = todayIdx >= 0 ? argv[todayIdx + 1] : new Date().toISOString().slice(0, 10);

  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    console.error(`ERROR: --max-age-days must be a non-negative number, got ${argv[maxAgeIdx + 1]}`);
    process.exitCode = 2;
    return;
  }

  const pipelinePath = join(root, 'data', 'pipeline.md');
  const scanHistoryPath = join(root, 'data', 'scan-history.tsv');
  if (!existsSync(pipelinePath) || !existsSync(scanHistoryPath)) {
    console.log('prune-stale-backlog: nothing to do (missing pipeline.md or scan-history.tsv)');
    return;
  }

  const firstSeenByUrl = parseFirstSeen(readFileSync(scanHistoryPath, 'utf8'));

  const doPrune = () => {
    const { text, pruned, resolved, unresolved, unchecked } = pruneStaleEntries(
      readFileSync(pipelinePath, 'utf8'),
      firstSeenByUrl,
      { maxAgeDays, today }
    );
    if (!dryRun && pruned > 0) {
      const tmp = `${pipelinePath}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, pipelinePath);
    }
    return { unchecked, resolved, unresolved, pruned };
  };

  // dry-run never writes, so it never needs the cross-process lock.
  const result = dryRun ? doPrune() : await withPipelineLock(pipelinePath, doPrune);

  const summary = { ...result, maxAgeDays, today, dryRun };
  if (asJson) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(
      `prune-stale-backlog: ${result.unchecked} pending entries (${result.resolved} with a known queue date, ${result.unresolved} unresolved) -> ` +
        `${result.pruned} ${dryRun ? 'would be ' : ''}discarded as stale (queued > ${maxAgeDays}d as of ${today})`
    );
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
