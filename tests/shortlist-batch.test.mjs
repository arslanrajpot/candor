#!/usr/bin/env node
/**
 * The daily triage no longer lets an LLM pick which pending lines to read or
 * hand-edit pipeline.md: scripts/prepare-shortlist-batch.mjs selects the newest
 * N and scripts/apply-shortlist-skips.mjs writes the Skip marks back.
 *
 * Run: node test-all.mjs --only shortlist-batch
 */

import { pass, fail } from './helpers.mjs';
import { selectNewestPending, renderBatch } from '../scripts/prepare-shortlist-batch.mjs';
import { parseSkipEntries, markSkips } from '../scripts/apply-shortlist-skips.mjs';

console.log('\nShortlist batch selection + skip write-back');

function check(label, ok, detail = '') {
  if (ok) pass(label);
  else fail(`${label}${detail ? `: ${detail}` : ''}`);
}

const line = (n, extra = '') => `- [ ] https://x.example/job/${n} | Co${n} | Engineer ${n} | Remote | posted: 2026-11-0${(n % 9) + 1}${extra}`;
const pipeline = [
  '# Pipeline — Pending URLs',
  '',
  '## Pending',
  '',
  '- [x] https://x.example/job/old | Old | Done | Remote — skip: stale',
  ...[1, 2, 3, 4, 5, 6].map((n) => line(n)),
  '- [ ] https://x.example/job/2 | Co2 | Engineer 2 | Remote | posted: 2026-11-12', // duplicate URL, newer
  '',
  '## Processed',
  '',
  '- [ ] https://x.example/job/outside | Nope | Not pending section | Remote',
].join('\n');

// --- selection ---
const sel = selectNewestPending(pipeline, 3);
check('selects the NEWEST n distinct pending lines (bottom of the file)', sel.selected === 3 && sel.lines[sel.lines.length - 1].includes('job/2 |'), JSON.stringify(sel.lines));
const dup = selectNewestPending(pipeline, 100).lines.filter((l) => l.includes('/job/2 '));
check('a duplicate URL keeps only its latest occurrence', dup.length === 1 && dup[0].includes('posted: 2026-11-12'), JSON.stringify(dup));
check('counts distinct pending, not raw lines', sel.totalPending === 6 && sel.leftover === 3, `total=${sel.totalPending} leftover=${sel.leftover}`);
check('checked lines are never selected', !sel.lines.some((l) => l.includes('/job/old')));
check('lines outside ## Pending are never selected', !selectNewestPending(pipeline, 100).lines.some((l) => l.includes('/outside')));
check('limit larger than the queue selects everything pending', selectNewestPending(pipeline, 100).selected === 6);
check('limit 0 / garbage selects nothing', selectNewestPending(pipeline, 0).selected === 0 && selectNewestPending(pipeline, NaN).selected === 0);
check('an empty pipeline is fine', selectNewestPending('', 5).selected === 0);
const batch = renderBatch(sel, '2026-11-14');
check('batch file states the counts the agent must report', /3 newest pending postings \(of 6 pending\)\. 3 older/.test(batch), batch.slice(0, 160));

// --- skip write-back ---
const shortlist = [
  '# Shortlist — 2026-11-14',
  '',
  '## Worth a look',
  '',
  '- Co1 — Engineer 1 — great fit  https://x.example/job/1',
  '',
  '## Skip',
  '',
  '- Co3 — Senior Software Engineer — Data Platform — off-target, data role  https://x.example/job/3',
  '- Co4 — Engineer 4 — on-site only  https://x.example/job/4',
  '- Co5 — Engineer 5 — x  https://x.example/job/not-in-pipeline',
  'garbage line without a url',
].join('\n');
const skips = parseSkipEntries(shortlist);
check('parses Skip entries only (not Worth a look)', skips.size === 3 && !skips.has('https://x.example/job/1'), [...skips.keys()].join(','));
check('a title containing " — " does not corrupt the reason', skips.get('https://x.example/job/3') === 'off-target, data role', skips.get('https://x.example/job/3'));

const { text, marked } = markSkips(pipeline, skips);
check('marks exactly the pending lines named in Skip', marked === 2, `marked=${marked}`);
check('a marked line is checked and carries the reason', /^- \[x\] https:\/\/x\.example\/job\/3 \|.* — skip: off-target, data role$/m.test(text));
check('Worth a look / unlisted pending lines stay unchecked', /^- \[ \] https:\/\/x\.example\/job\/1 /m.test(text) && /^- \[ \] https:\/\/x\.example\/job\/6 /m.test(text));
check('already-checked and out-of-section lines are untouched', text.includes('- [x] https://x.example/job/old | Old | Done | Remote — skip: stale') && text.includes('- [ ] https://x.example/job/outside'));
check('marking is idempotent', markSkips(text, skips).marked === 0 && markSkips(text, skips).text === text);
check('line count is preserved (no line added or dropped)', text.split('\n').length === pipeline.split('\n').length);
