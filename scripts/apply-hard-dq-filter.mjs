#!/usr/bin/env node
/**
 * apply-hard-dq-filter.mjs — zero-token hard-disqualifier pass over
 * data/pipeline.md, run BEFORE prepare-shortlist-batch.mjs selects what the
 * shortlist LLM agent has to read.
 *
 * Every day the shortlist agent spends a full read+judge on postings whose
 * verdict modes/_brief.md already documents as MECHANICAL: a named country/
 * region restriction excluding the candidate ("Check this before anything
 * else"), an explicit on-site/hybrid signal with no remote qualifier, or a
 * primary-function Web3/blockchain title. The logs show these dominate the
 * Skip list on every single run (hybrid/on-site/country-restricted postings,
 * day after day). This script catches the UNAMBIGUOUS cases of those same
 * rules deterministically — see lib/hard-dq-filters.mjs for the matching and
 * its safety contract (a miss just proceeds to the LLM as before; a false
 * skip is the one thing it is built to avoid).
 *
 * Only ever MARKS a line `[x] ... — skip: {reason}` (same convention as
 * apply-shortlist-skips.mjs / prune-stale-backlog.mjs) — never deletes a
 * line, never touches a line the matcher didn't confidently flag.
 *
 *   node scripts/apply-hard-dq-filter.mjs [--root DIR] [--dry-run] [--json]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { withPipelineLock } from '../pipeline-lock.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { loadYaml } from '../lib/yaml-document.mjs';
import { getProfilePath } from '../path-resolver.mjs';
import { classifyTitleLocationHardDQ, HARD_DQ_VERSION } from '../lib/hard-dq-filters.mjs';

const MAX_REASON = 160;

const USAGE = `Usage: node scripts/apply-hard-dq-filter.mjs [--root DIR] [--dry-run] [--json]

  --root DIR   Data root to read/write (default: the repository this script lives in)
  --dry-run    Report what would be auto-skipped without writing pipeline.md
  --json       Print a machine-readable summary instead of prose
  --help, -h   Show this message and exit
`;

// explicitRoot is only set when the caller passed --root; getProfilePath()
// called bare (no arg) is what honors CAREER_OPS_PROFILE — passing a root
// always bypasses the override (see path-resolver.mjs's getProfilePath doc),
// which is exactly right for an explicit --root but wrong as the default.
function loadHomeCountry(explicitRoot) {
  const profilePath = explicitRoot ? getProfilePath(explicitRoot) : getProfilePath();
  if (!existsSync(profilePath)) return undefined;
  try {
    const raw = loadYaml(readFileSync(profilePath, 'utf8')) || {};
    const country = raw?.location?.country;
    return typeof country === 'string' && country.trim() ? country.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} pipelineMd
 * @param {{ homeCountry?: string }} opts
 * @returns {{ text: string, scanned: number, flagged: number }}
 */
export function applyHardDqFilter(pipelineMd, opts = {}) {
  let scanned = 0;
  let flagged = 0;
  const lines = pipelineMd.split('\n').map((line) => {
    const m = line.match(/^- \[ \] (https?:\/\/\S+) \| ([^|]*) \| ([^|]*)(.*)$/);
    if (!m) return line;
    scanned++;
    const [, , , titleRaw, restRaw] = m;
    const title = titleRaw.trim();
    // Everything after the title — location/comp/posted/trust columns, order
    // and presence vary, so this is scanned as one blob rather than typed
    // per-column (see lib/hard-dq-filters.mjs's own note on why that's safe:
    // the patterns only fire on explicit restrictive phrasing, never on a
    // bare date or tier label).
    const locationText = restRaw.replace(/^\s*\|\s*/, '').trim();
    const verdict = classifyTitleLocationHardDQ({ title, locationText, homeCountry: opts.homeCountry });
    if (!verdict.skip) return line;
    flagged++;
    const reason = String(verdict.reason).slice(0, MAX_REASON);
    // Must actually flip "- [ ]" -> "- [x]", not just append text after the
    // still-pending prefix — the pending regex everything else matches on
    // (selectNewestPending, scan.mjs's own dedup) only ever looks at
    // `^- \[ \]`, so a merely-annotated line would stay "pending" forever and
    // never actually be excluded from anything downstream.
    return `- [x] ${line.slice('- [ ] '.length)} — skip: ${reason} (auto-filter v${HARD_DQ_VERSION}, pre-shortlist)`;
  });
  return { text: lines.join('\n'), scanned, flagged };
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
  const explicitRoot = rootIdx >= 0 ? argv[rootIdx + 1] : undefined;
  const root = explicitRoot || join(dirname(fileURLToPath(import.meta.url)), '..');

  const pipelinePath = join(root, 'data', 'pipeline.md');
  if (!existsSync(pipelinePath)) {
    console.log('apply-hard-dq-filter: nothing to do (missing pipeline.md)');
    return;
  }

  const homeCountry = loadHomeCountry(explicitRoot);

  const doApply = () => applyHardDqFilter(readFileSync(pipelinePath, 'utf8'), { homeCountry });

  const result = dryRun ? doApply() : await withPipelineLock(pipelinePath, () => {
    const r = doApply();
    if (r.flagged > 0) {
      const tmp = `${pipelinePath}.tmp`;
      writeFileSync(tmp, r.text);
      renameSync(tmp, pipelinePath);
    }
    return r;
  });

  const summary = { scanned: result.scanned, flagged: result.flagged, homeCountry: homeCountry || null, dryRun };
  if (asJson) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(
      `apply-hard-dq-filter: ${result.scanned} pending entries scanned (home country: ${homeCountry || 'unknown'}) -> ` +
        `${result.flagged} ${dryRun ? 'would be ' : ''}auto-skipped on a mechanical rule (country/region restriction, on-site/hybrid, or Web3 primary title)`
    );
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
