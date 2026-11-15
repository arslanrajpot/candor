#!/usr/bin/env node
/**
 * fetch-jds-for-digest.mjs — deterministic pre-fetch step for daily-digest-sweep.sh.
 *
 * Why this exists: the digest sweep used to let the headless `claude -p` agent
 * fetch each JD itself (WebFetch, with a browser-extract.mjs fallback for
 * JS-rendered boards). Testing that fallback found `--allowedTools
 * "Bash(node browser-extract.mjs *)"` actually grants FULL unscoped Bash in
 * this CLI, not a narrow allowlist — unsafe to hand an unattended agent that
 * reads untrusted job-posting text. Fix: do the fetching here, in a plain
 * zero-token Node script with no LLM involved, and hand the agent pre-fetched
 * text to read. The agent never touches WebFetch or Bash at all now.
 *
 * Usage:
 *   node scripts/fetch-jds-for-digest.mjs [--shortlist <path>] [--out <path>] [--cap N]
 *
 * Reads the given shortlist.md (default data/shortlist.md), builds a worklist
 * from '## Worth a look' then '## Maybe' (cap 25 by default, same priority
 * order the digest prompt used to apply itself), and for each URL:
 *   - a `.pdf` URL is downloaded to data/tmp-jd-pdfs/ for the agent to Read
 *   - everything else goes through `node browser-extract.mjs <url> --mode jd`
 *     (Playwright-rendered — handles JS-heavy SPA boards including Workday)
 * Writes one JSON file the agent reads instead of fetching anything itself.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const out = { shortlist: join(REPO_ROOT, 'data', 'shortlist.md'), out: null, cap: 25 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--shortlist') out.shortlist = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--cap') out.cap = Number(argv[++i]) || 25;
  }
  return out;
}

function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith(heading));
  if (startIdx === -1) return [];
  const rows = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line.trim())) break;
    const m = line.match(/^- (.+?) — (.+?) — .*?(https?:\/\/\S+)\s*$/);
    if (m) rows.push({ company: m[1].trim(), title: m[2].trim(), url: m[3].trim() });
  }
  return rows;
}

function buildWorklist(shortlistPath, cap) {
  if (!existsSync(shortlistPath)) return [];
  const md = readFileSync(shortlistPath, 'utf8');
  const worthALook = extractSection(md, '## Worth a look').map((r) => ({ ...r, section: 'worth_a_look' }));
  const maybe = extractSection(md, '## Maybe').map((r) => ({ ...r, section: 'maybe' }));
  return [...worthALook, ...maybe].slice(0, cap);
}

async function downloadPdf(url, destDir) {
  mkdirSync(destDir, { recursive: true });
  const safeName = url.replace(/[^a-zA-Z0-9]+/g, '_').slice(-80) + '.pdf';
  const destPath = join(destDir, safeName);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return destPath;
}

function extractViaBrowser(url) {
  try {
    // `timeout` here is a hard kill on the whole subprocess (SIGTERM), separate
    // from browser-extract.mjs's own --timeout on page.goto — defense in depth
    // against a hung browser launch blocking the rest of the morning chain.
    const stdout = execFileSync(
      process.execPath,
      [join(REPO_ROOT, 'browser-extract.mjs'), url, '--mode', 'jd', '--timeout', '15000'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }
    );
    const parsed = JSON.parse(stdout);
    return { ok: true, text: parsed.text, title: parsed.title };
  } catch (err) {
    if (err.signal === 'SIGTERM' || err.killed) {
      return { ok: false, error: 'extraction timed out after 30s' };
    }
    // execFileSync throws on non-zero exit; the tool's own JSON error is on stderr.
    const stderrText = err.stderr ? String(err.stderr).trim() : '';
    try {
      const parsed = JSON.parse(stderrText);
      return { ok: false, error: parsed.error || 'extraction failed' };
    } catch {
      return { ok: false, error: stderrText.slice(0, 200) || String(err.message).slice(0, 200) };
    }
  }
}

async function main() {
  const { shortlist, out, cap } = parseArgs(process.argv.slice(2));
  const outPath = out || join(REPO_ROOT, 'data', `digest-jd-cache-${new Date().toISOString().slice(0, 10)}.json`);
  const pdfDir = join(REPO_ROOT, 'data', 'tmp-jd-pdfs');

  const results = [];
  let ok = 0;
  let failed = 0;

  // Always write outPath, even if something below throws partway through —
  // the digest sweep reads this file unconditionally, and a missing file
  // (vs. an empty array) is not a case its prompt is written to handle.
  try {
    const worklist = buildWorklist(shortlist, cap);

    for (const item of worklist) {
      if (/\.pdf(\?|$)/i.test(item.url)) {
        try {
          const localPath = await downloadPdf(item.url, pdfDir);
          results.push({ ...item, jdText: null, jdError: null, localPdfPath: localPath });
          ok++;
        } catch (err) {
          results.push({ ...item, jdText: null, jdError: `pdf download failed: ${String(err.message).slice(0, 150)}`, localPdfPath: null });
          failed++;
        }
        continue;
      }
      const extracted = extractViaBrowser(item.url);
      if (extracted.ok) {
        results.push({ ...item, jdText: extracted.text, jdError: null, localPdfPath: null });
        ok++;
      } else {
        results.push({ ...item, jdText: null, jdError: extracted.error, localPdfPath: null });
        failed++;
      }
    }
    console.log(`fetch-jds-for-digest: ${worklist.length} in worklist, ${ok} fetched, ${failed} failed -> ${outPath}`);
  } catch (err) {
    console.error(`fetch-jds-for-digest: top-level failure after ${results.length} processed: ${err.stack || err.message}`);
  } finally {
    writeFileSync(outPath, JSON.stringify(results, null, 2));
  }
}

main();
