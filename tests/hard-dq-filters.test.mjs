#!/usr/bin/env node
/**
 * Deterministic hard-disqualifier pre-filter (lib/hard-dq-filters.mjs) and its
 * pipeline.md write-back (scripts/apply-hard-dq-filter.mjs). Added 2026-11-26
 * to cut shortlist-sweep.sh's token spend: modes/_brief.md documents these as
 * MECHANICAL rules ("check this before anything else"), so this encodes the
 * unambiguous cases as plain pattern matching instead of an LLM turn per
 * posting. The safety contract under test: a miss NEVER skips (defers to the
 * LLM exactly as before this module existed); only a confident, documented
 * phrasing match produces a skip.
 *
 * Run: node test-all.mjs --only hard-dq-filters
 */

import { pass, fail } from './helpers.mjs';
import { classifyLocationHardDQ, classifyWeb3PrimaryTitle, classifyTitleLocationHardDQ } from '../lib/hard-dq-filters.mjs';
import { applyHardDqFilter } from '../scripts/apply-hard-dq-filter.mjs';

console.log('\nHard-DQ pre-filter (location/title) + pipeline.md write-back');

function check(label, ok, detail = '') {
  if (ok) pass(label);
  else fail(`${label}${detail ? `: ${detail}` : ''}`);
}

// --- location: must NOT skip (defer to LLM) ---
const NEVER_SKIP = [
  'remote, Warszawa',
  'US Remote',
  'Remote',
  'APAC',
  'South Asia',
  'Lahore, Pakistan',
  'Berlin, Germany',              // bare place, no restriction phrase or remote word -> genuinely ambiguous, defer
  'San Francisco, CA; New York, NY',
  'Remote (US only)',             // 'remote' present anywhere blocks the skip, by design (conservative)
  'about us, join us, trust us',  // pronoun collision guard: lowercase "us" must never match
  'This is a fully remote role, open worldwide',
  'Warszawa, Wrocław, Kraków',
  'BARCELONA, Barcelona, Spain, 08014',
  '',
  undefined,
];
for (const text of NEVER_SKIP) {
  const r = classifyLocationHardDQ(text, { homeCountry: 'Pakistan' });
  check(`never skips: ${JSON.stringify(text)}`, r.skip === false, JSON.stringify(r));
}

// --- location: MUST skip (documented mechanical rules) ---
const MUST_SKIP = [
  'within Poland',                                  // observed real phrasing (DocPlanner, 2026-11-21)
  'within Spain',
  'Hybrid, Warsaw, Poland',
  'hybrid, Wrocław',                                // lowercase variant
  'UK-based candidates only',
  'must be located in the US/Canada',               // modes/_brief.md's own literal example
  'EU/EEA only',                                    // modes/_brief.md's own literal example
  'restricted to the UK',
  'only open to US candidates',
  'US-based applicants only',
];
for (const text of MUST_SKIP) {
  const r = classifyLocationHardDQ(text, { homeCountry: 'Pakistan' });
  check(`skips with a reason: ${JSON.stringify(text)}`, r.skip === true && typeof r.reason === 'string' && r.reason.length > 0, JSON.stringify(r));
}

// --- an exemption anywhere in the text always blocks a skip, even next to a
// restrictive phrase (ambiguous/contradictory text defers to the LLM) ---
check(
  'home-country mention blocks an otherwise-matching restriction',
  classifyLocationHardDQ('UK-based candidates only, or Pakistan', { homeCountry: 'Pakistan' }).skip === false
);

// --- Web3 primary-title: narrow match, backend-adjacent crypto work passes ---
check('"Blockchain Engineer" is a primary-function skip', classifyWeb3PrimaryTitle('Blockchain Engineer').skip === true);
check('"Smart Contract Developer" is a primary-function skip', classifyWeb3PrimaryTitle('Smart Contract Developer').skip === true);
check('"Web3 Developer" is a primary-function skip', classifyWeb3PrimaryTitle('Web3 Developer').skip === true);
check('"Backend Engineer - Crypto Platform" is backend-adjacent, not skipped', classifyWeb3PrimaryTitle('Backend Engineer - Crypto Platform').skip === false);
check('an ordinary AI title is never skipped', classifyWeb3PrimaryTitle('Senior Software Engineer, AI Platform').skip === false);

// --- combined classifier: title check runs before location check ---
check(
  'classifyTitleLocationHardDQ catches a Web3 title even with a clean location',
  classifyTitleLocationHardDQ({ title: 'Solidity Engineer', locationText: 'Remote', homeCountry: 'Pakistan' }).skip === true
);
check(
  'classifyTitleLocationHardDQ catches a location restriction with a clean title',
  classifyTitleLocationHardDQ({ title: 'Senior Backend Engineer', locationText: 'within Poland', homeCountry: 'Pakistan' }).skip === true
);
check(
  'classifyTitleLocationHardDQ passes through when neither signal fires',
  classifyTitleLocationHardDQ({ title: 'Senior Backend Engineer', locationText: 'Remote, Warszawa', homeCountry: 'Pakistan' }).skip === false
);

// --- pipeline.md write-back: correctness of the [ ] -> [x] flip (regression
// guard for the 2026-11-26 bug where the annotation was appended WITHOUT
// flipping the checkbox, leaving a "skipped" line that was still pending) ---
const pipelineMd = [
  '# Pipeline — Pending URLs',
  '',
  '## Pending',
  '',
  '- [ ] https://x.example/job/1 | Co1 | Senior Backend Engineer | Hybrid, Warsaw, Poland | posted: 2026-11-01',
  '- [ ] https://x.example/job/2 | Co2 | Blockchain Engineer | Remote | posted: 2026-11-02',
  '- [ ] https://x.example/job/3 | Co3 | Senior Backend Engineer | Remote, Warszawa | posted: 2026-11-03',
  '- [x] https://x.example/job/4 | Co4 | Already Skipped | Hybrid, Berlin — skip: pre-existing',
  '',
].join('\n');

const result = applyHardDqFilter(pipelineMd, { homeCountry: 'Pakistan' });
check('scans every pending line', result.scanned === 3, `scanned=${result.scanned}`);
check('flags exactly the two mechanical-rule hits', result.flagged === 2, `flagged=${result.flagged}`);
const outLines = result.text.split('\n');
check(
  'the hybrid line is actually checked off, not just annotated',
  outLines.some((l) => /^- \[x\] https:\/\/x\.example\/job\/1 \|.* — skip: .*on-site\/hybrid.*\(auto-filter/.test(l)),
  outLines.join('\n')
);
check(
  'the Web3-title line is actually checked off',
  outLines.some((l) => /^- \[x\] https:\/\/x\.example\/job\/2 \|.* — skip: .*Web3.*\(auto-filter/.test(l))
);
check(
  'no line is left still-pending with an auto-filter annotation (the exact 2026-11-26 regression)',
  !outLines.some((l) => l.startsWith('- [ ]') && l.includes('auto-filter'))
);
check(
  'the genuinely ambiguous line (remote, no restriction) is untouched',
  outLines.some((l) => l === '- [ ] https://x.example/job/3 | Co3 | Senior Backend Engineer | Remote, Warszawa | posted: 2026-11-03')
);
check(
  'a pre-existing checked line is left completely untouched',
  outLines.some((l) => l === '- [x] https://x.example/job/4 | Co4 | Already Skipped | Hybrid, Berlin — skip: pre-existing')
);
check('line count is preserved (no line added or dropped)', outLines.length === pipelineMd.split('\n').length);
check('running it again finds nothing further to flag (idempotent)', applyHardDqFilter(result.text, { homeCountry: 'Pakistan' }).flagged === 0);
