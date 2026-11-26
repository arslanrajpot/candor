#!/usr/bin/env node
/**
 * apply-shortlist-skips.mjs — zero-token write-back step for shortlist-sweep.sh.
 *
 * The triage agent used to mark each Skip posting in data/pipeline.md itself,
 * one Edit call per line (~60 round trips and most of a run's wall-clock). The
 * agent now only writes data/shortlist.md; this reads that file's `## Skip`
 * section and applies the same mark deterministically:
 *   `- [ ] <url> | ...`  ->  `- [x] <url> | ... — skip: <reason>`
 * Only lines that are still unchecked are touched, and never a line whose URL
 * is not in the Skip section — Worth a look / Maybe stay pending for the digest.
 *
 *   node scripts/apply-shortlist-skips.mjs [--root DIR] [--dry-run]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isMainModule } from '../lib/is-main-module.mjs';

const MAX_REASON = 160;

const USAGE = `Usage: node scripts/apply-shortlist-skips.mjs [--root DIR] [--dry-run]

  --root DIR   Data root to read/write (default: the repository this script lives in)
  --dry-run    Report what would be marked without writing pipeline.md
  --help, -h   Show this message and exit
`;

/** `- <company> — <title> — <reason>  <url>` lines under `## Skip`. */
export function parseSkipEntries(shortlistMd) {
  const entries = new Map();
  let inSkip = false;
  for (const line of shortlistMd.split('\n')) {
    if (/^##\s/.test(line)) inSkip = /^##\s+Skip\b/i.test(line);
    if (!inSkip) continue;
    // Greedy first group: a title may itself contain " — ", so the reason is
    // whatever follows the LAST separator before the URL.
    const m = line.match(/^- (.+) — (.*?)\s+(https?:\/\/\S+)\s*$/);
    if (!m) continue;
    const reason = m[2].replace(/\s+/g, ' ').trim().slice(0, MAX_REASON) || 'off-target';
    entries.set(m[3], reason);
  }
  return entries;
}

/**
 * @param {string} pipelineMd
 * @param {Map<string, string>} skips url -> reason
 * @returns {{ text: string, marked: number }}
 */
export function markSkips(pipelineMd, skips) {
  let marked = 0;
  const text = pipelineMd
    .split('\n')
    .map((line) => {
      const m = line.match(/^- \[ \] (https?:\/\/\S+)(.*)$/);
      if (!m || !skips.has(m[1])) return line;
      marked++;
      return `- [x] ${m[1]}${m[2]} — skip: ${skips.get(m[1])}`;
    })
    .join('\n');
  return { text, marked };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  const dryRun = argv.includes('--dry-run');
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
  const shortlistPath = join(root, 'data', 'shortlist.md');
  const pipelinePath = join(root, 'data', 'pipeline.md');
  if (!existsSync(shortlistPath) || !existsSync(pipelinePath)) {
    console.log('apply-shortlist-skips: nothing to do (missing shortlist.md or pipeline.md)');
    return;
  }
  const skips = parseSkipEntries(readFileSync(shortlistPath, 'utf8'));
  const { text, marked } = markSkips(readFileSync(pipelinePath, 'utf8'), skips);
  if (!dryRun && marked > 0) {
    const tmp = `${pipelinePath}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, pipelinePath);
  }
  console.log(`apply-shortlist-skips: ${skips.size} skip entries, ${marked} pending line(s) ${dryRun ? 'would be ' : ''}marked`);
}

if (isMainModule(import.meta.url)) main();
