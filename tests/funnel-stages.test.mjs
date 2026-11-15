import { test } from 'node:test';
import assert from 'node:assert/strict';
import { funnelStageRank, parseStatusLogStages, recoverFunnelStages } from '../funnel-stages.mjs';

test('stage rank treats a rejection as a reply and normalizes canonical case', () => {
  assert.equal(funnelStageRank(' rejected '), 2);
  assert.equal(funnelStageRank('OFFER'), 5);
  assert.equal(funnelStageRank('ASSESSMENT'), 3);
  assert.equal(funnelStageRank('constructor'), 0);
  assert.equal(funnelStageRank('Discarded'), 0);
});
test('history recovery ignores malformed and orphan rows and retains highest stage once', () => {
  const ledger = parseStatusLogStages('1\t2026-09-01\toffer\tdiscarded\r\n1\t2026-09-02\tApplied\tRejected\n2\t2026-09-01\tOffer\tHired\n1junk\t2026-09-01\tOffer\tHired\n1\t\tOffer\tHired');
  assert.equal(ledger.length, 3);
  assert.deepEqual([...recoverFunnelStages(new Map([[1,'Discarded']]), ledger)], [[1,5]]);
});

test('current SKIP rows remain outside the funnel despite prior stages', () => {
  const statuses = new Map([[1, 'SKIP'], [2, ' skip '], [3, 'Rejected']]);
  const ledger = parseStatusLogStages([
    '1\t2026-09-01\tInterview\tSKIP',
    '2\t2026-09-01\tOffer\tSKIP',
    '3\t2026-09-01\tInterview\tRejected',
  ].join('\n'));
  assert.deepEqual([...recoverFunnelStages(statuses, ledger)], [[3, 4]]);
  assert.deepEqual([...recoverFunnelStages(statuses, [])], [[3, 2]]);
});

test('Assessment recovery proves a reply but never an interview', () => {
  const statuses = new Map([[1, 'Assessment'], [2, 'Discarded']]);
  const ledger = parseStatusLogStages('2\t2026-10-01\tAssessment\tDiscarded');
  assert.deepEqual([...recoverFunnelStages(statuses, ledger)], [[1, 3], [2, 3]]);
});

test('a retraction line removes the latest surviving observation (the ledger\'s documented undo)', () => {
  // Mis-click: Evaluated -> Applied, then set back, then both transitions retracted.
  const ledger = parseStatusLogStages([
    '1\t2026-11-14\tEvaluated\tApplied\tweb',
    '1\t2026-11-14\tApplied\tEvaluated\tweb',
    '1\t2026-11-14\t-\t-\tset-status\tretract the set-back',
    '1\t2026-11-14\t-\t-\tset-status\tretract the mis-click',
  ].join('\n'));
  assert.deepEqual(ledger, []);
  assert.deepEqual([...recoverFunnelStages(new Map([[1, 'Evaluated']]), ledger)], [[1, 0]]);
});

test('a retraction only undoes its own tracker# and only the latest observation', () => {
  const ledger = parseStatusLogStages([
    '1\t2026-11-01\tEvaluated\tApplied\tset-status',
    '1\t2026-11-05\tApplied\tInterview\tset-status',
    '2\t2026-11-02\tEvaluated\tApplied\tset-status',
    '1\t2026-11-06\t-\t-\tset-status\tinterview never happened',
  ].join('\n'));
  assert.deepEqual(ledger.map(o => `${o.num}:${o.to}`), ['1:Applied', '2:Applied']);
  const reached = recoverFunnelStages(new Map([[1, 'Applied'], [2, 'Applied']]), ledger);
  assert.equal(reached.get(1), 1, 'row 1 never reached Interview');
});

test('a retraction with nothing to retract is harmless', () => {
  assert.deepEqual(parseStatusLogStages('7\t2026-11-01\t-\t-\tset-status\tnothing before it'), []);
});
