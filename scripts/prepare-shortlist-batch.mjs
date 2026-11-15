#!/usr/bin/env node
/**
 * prepare-shortlist-batch.mjs — zero-token selection step for shortlist-sweep.sh.
 *
 * The sweep used to hand an LLM the whole of data/pipeline.md (450 KB and
 * growing) and ask it to find "the first 50 pending lines" — which meant the
 * oldest backlog was triaged while fresh postings waited weeks, and a read that
 * could not even reach the end of the file. Choosing which lines to triage is
 * not a judgment call, so it is done here, deterministically: the NEWEST N
 * distinct pending postings (the scanner appends at the bottom) are written to
 * data/shortlist-batch.md and the agent reads only that.
 *
 *   node scripts/prepare-shortlist-batch.mjs [--limit N] [--root DIR]
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const PENDING_LINE = /^- \[ \] (https?:\/\/\S+)/;

/**
 * @param {string} markdown contents of data/pipeline.md
 * @param {number} limit how many postings to select
 * @returns {{ lines: string[], totalPending: number, selected: number, leftover: number }}
 */
export function selectNewestPending(markdown, limit) {
  const rows = [];
  let inPending = false;
  for (const line of markdown.split('\n')) {
    if (/^##\s/.test(line)) inPending = /^##\s+Pending\b/i.test(line);
    if (!inPending) continue;
    const m = line.match(PENDING_LINE);
    if (m) rows.push({ url: m[1], line });
  }
  // The same posting can be listed twice (re-scans, aggregators). Keep the
  // LAST occurrence of each URL: it is the newest, and triaging it once is enough.
  const lastIndex = new Map();
  rows.forEach((r, i) => lastIndex.set(r.url, i));
  const unique = rows.filter((r, i) => lastIndex.get(r.url) === i);
  const n = Math.max(0, Math.trunc(limit) || 0);
  const picked = n === 0 ? [] : unique.slice(-n);
  return {
    lines: picked.map((r) => r.line),
    totalPending: unique.length,
    selected: picked.length,
    leftover: unique.length - picked.length,
  };
}

export function renderBatch({ lines, totalPending, selected, leftover }, date) {
  return [
    `# Shortlist batch — ${date}`,
    '',
    `${selected} newest pending postings (of ${totalPending} pending). ${leftover} older pending postings are not in this batch and are left untouched.`,
    '',
    ...lines,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { limit: 100, root: join(dirname(fileURLToPath(import.meta.url)), '..') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]);
    else if (argv[i] === '--root') out.root = argv[++i];
  }
  return out;
}

function main() {
  const { limit, root } = parseArgs(process.argv.slice(2));
  const pipelinePath = join(root, 'data', 'pipeline.md');
  const outPath = join(root, 'data', 'shortlist-batch.md');
  const markdown = existsSync(pipelinePath) ? readFileSync(pipelinePath, 'utf8') : '';
  const result = selectNewestPending(markdown, limit);
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, renderBatch(result, date));
  renameSync(tmp, outPath);
  console.log(`prepare-shortlist-batch: ${result.selected} selected, ${result.leftover} older left, ${result.totalPending} pending -> ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
