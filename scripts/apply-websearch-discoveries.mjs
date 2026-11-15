#!/usr/bin/env node
/**
 * apply-websearch-discoveries.mjs — deterministic filter+dedup+append step for
 * websearch-discovery-sweep.sh.
 *
 * The headless agent that runs the actual WebSearch queries only ever writes
 * ONE throwaway JSON file of raw candidates it extracted from search results
 * (data/websearch-raw-{date}.json) — it never touches pipeline.md or
 * scan-history.tsv directly. This script does that part instead, reusing the
 * real scanner's own exported filter/dedup/append functions (scan.mjs,
 * title-keywords.mjs) so a websearch-discovered posting goes through the
 * EXACT same title_filter / max_posting_age_days / salary_filter / dedup
 * logic as a zero-token-provider posting, and is written in the exact same
 * pipeline.md / scan-history.tsv format — no LLM-authored TSV rows, no risk
 * of the agent's output drifting from what the rest of the project expects.
 *
 * Usage: node scripts/apply-websearch-discoveries.mjs --in <raw.json>
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadYaml } from '../lib/yaml-document.mjs';
import { buildTitleFilter } from '../title-keywords.mjs';
import {
  buildTitleFilterOverrides,
  buildTitleFilterWithOverrides,
  buildPostingAgeFilter,
  buildSalaryFilter,
  unrecordedOffers,
  appendToPipeline,
  appendToScanHistory,
  SCAN_HISTORY_PATH,
} from '../scan.mjs';
import { localToday } from '../lib/local-today.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const out = { in: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') out.in = argv[++i];
  }
  return out;
}

function toEpochMs(dateLike) {
  if (!dateLike || typeof dateLike !== 'string') return undefined;
  const ms = Date.parse(dateLike);
  return Number.isFinite(ms) ? ms : undefined;
}

async function main() {
  const { in: inPath } = parseArgs(process.argv.slice(2));
  if (!inPath) {
    console.error('Usage: apply-websearch-discoveries.mjs --in <raw.json>');
    process.exit(1);
  }
  if (!existsSync(inPath)) {
    console.log(`apply-websearch-discoveries: ${inPath} does not exist — nothing to apply`);
    return;
  }

  /** @type {Array<{company?: string, title?: string, url?: string, location?: string, postedAt?: string}>} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(inPath, 'utf8'));
  } catch (err) {
    console.error(`apply-websearch-discoveries: failed to parse ${inPath}: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error(`apply-websearch-discoveries: ${inPath} is not a JSON array`);
    process.exit(1);
  }

  const portalsPath = join(REPO_ROOT, 'portals.yml');
  const config = loadYaml(readFileSync(portalsPath, 'utf8'));

  const titleOverrides = buildTitleFilterOverrides(config.title_filter_overrides);
  const titleFilter = buildTitleFilterWithOverrides(config.title_filter, titleOverrides);
  const ageFilter = buildPostingAgeFilter(config.max_posting_age_days);
  const salaryFilter = buildSalaryFilter(config.salary_filter);

  let droppedTitle = 0;
  let droppedAge = 0;
  let droppedSalary = 0;
  let droppedMalformed = 0;

  const offers = [];
  for (const item of raw) {
    const company = typeof item?.company === 'string' ? item.company.trim() : '';
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!company || !title || !/^https?:\/\//i.test(url)) {
      droppedMalformed++;
      continue;
    }
    if (!titleFilter(title)) {
      droppedTitle++;
      continue;
    }
    const postedAt = toEpochMs(item.postedAt);
    if (!ageFilter(postedAt)) {
      droppedAge++;
      continue;
    }
    if (!salaryFilter(item.salary)) {
      droppedSalary++;
      continue;
    }
    offers.push({
      company,
      title,
      url,
      location: typeof item.location === 'string' ? item.location : undefined,
      salary: item.salary,
      postedAt,
      source: 'websearch scan',
    });
  }

  const scanHistoryText = existsSync(SCAN_HISTORY_PATH) ? readFileSync(SCAN_HISTORY_PATH, 'utf8') : '';
  const newOffers = unrecordedOffers(offers, 'added', scanHistoryText);

  const date = localToday();
  if (newOffers.length > 0) {
    await appendToScanHistory(newOffers, date, 'added');
    await appendToPipeline(newOffers);
  }

  console.log(
    `apply-websearch-discoveries: ${raw.length} raw -> ${offers.length} passed filters ` +
    `(title -${droppedTitle}, age -${droppedAge}, salary -${droppedSalary}, malformed -${droppedMalformed}) -> ` +
    `${newOffers.length} new (${offers.length - newOffers.length} already known) added to pipeline.md`
  );
}

main();
