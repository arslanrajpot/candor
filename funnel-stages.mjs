// Pure cumulative-stage contract shared by CLI statistics and web views.
// No filesystem access: the caller chooses the tracker and its sibling ledger.
const RANKS = new Map([
  ['APPLIED', 1], ['RESPONDED', 2], ['REJECTED', 2],
  ['ASSESSMENT', 3], ['INTERVIEW', 4], ['OFFER', 5], ['HIRED', 6],
]);

export function funnelStageRank(status) {
  return RANKS.get(String(status ?? '').trim().toUpperCase()) || 0;
}

/**
 * Parse {num}\t{date}\t{from}\t{to} observations, ignoring torn rows.
 *
 * A row whose `to` is "-" is a retraction — the ledger's documented fix for "that
 * transition never happened" (see funnel-velocity.mjs foldObservations): it
 * removes that tracker#'s latest surviving observation. Without this the
 * cumulative funnel kept the highest stage ever *logged*, so an undone
 * mis-click on Applied stayed in the funnel permanently.
 */
export function parseStatusLogStages(content) {
  const byNum = new Map();
  const order = [];
  for (const line of String(content ?? '').replace(/\r/g, '').split('\n')) {
    const [rawNum, date, from, to] = line.split('\t').map(s => s.trim());
    if (!/^\d+$/.test(rawNum || '') || !date || !from || !to) continue;
    const num = Number(rawNum);
    if (to === '-') {
      const last = byNum.get(num)?.pop();
      if (last) order.splice(order.lastIndexOf(last), 1);
      continue;
    }
    const obs = { num, from, to };
    if (!byNum.has(num)) byNum.set(num, []);
    byNum.get(num).push(obs);
    order.push(obs);
  }
  return order;
}

/** Highest observed stage per distinct current tracker identity.
 * Non-numeric identities can retain snapshot counts but never join the ledger.
 * Current SKIP rows remain outside the funnel regardless of their history.
 */
export function recoverFunnelStages(statusByNum, ledger) {
  const reached = new Map();
  const bump = (num, status) => reached.set(num, Math.max(reached.get(num) || 0, funnelStageRank(status)));
  for (const [num, status] of statusByNum) {
    if (String(status ?? '').trim().toUpperCase() !== 'SKIP') bump(num, status);
  }
  for (const { num, from, to } of ledger) {
    if (!reached.has(num)) continue;
    bump(num, from);
    bump(num, to);
  }
  return reached;
}
