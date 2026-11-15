#!/usr/bin/env node
/**
 * list-websearch-targets.mjs — zero-token prep step for websearch-discovery-sweep.sh.
 *
 * portals.yml marks some companies `scan_method: websearch` because no
 * zero-token provider (API/local-parser/Playwright) can reach their board —
 * scan.mjs itself calls these out at the end of every run as "Agent/WebSearch
 * handoff" but only ever prints them to a log; nothing was acting on them.
 *
 * This script re-derives that same list deterministically (loads portals.yml
 * the same way scan.mjs does) and writes it as JSON so a headless agent can
 * Read it instead of being handed the whole 170KB portals.yml, and so the
 * query list always reflects the current config with no copy-paste drift.
 *
 * Usage: node scripts/list-websearch-targets.mjs [--out <path>] [--cap N]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadYaml } from '../lib/yaml-document.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const out = { out: join(REPO_ROOT, 'data', 'websearch-targets.json'), cap: 40 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--cap') out.cap = Number(argv[++i]) || 40;
  }
  return out;
}

function main() {
  const { out, cap } = parseArgs(process.argv.slice(2));
  const portalsPath = join(REPO_ROOT, 'portals.yml');
  const config = loadYaml(readFileSync(portalsPath, 'utf8'));
  const companies = Array.isArray(config.tracked_companies) ? config.tracked_companies : [];

  const targets = companies
    .filter((c) => c && typeof c === 'object' && c.scan_method === 'websearch' && c.enabled !== false)
    .map((c) => ({
      company: c.name,
      query: (c.scan_query || c.search_query || `"${c.name}" careers software engineer`).trim(),
      careers_url: c.careers_url || '',
    }))
    .filter((t) => typeof t.company === 'string' && t.company.trim().length > 0)
    .slice(0, cap);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(targets, null, 2));
  console.log(`list-websearch-targets: ${targets.length} target(s) (of ${companies.filter((c) => c?.scan_method === 'websearch').length} declared) -> ${out}`);
}

main();
