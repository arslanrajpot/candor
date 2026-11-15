// In-memory registry of in-flight runs that WRITE the tracker (kind evaluate/pdf →
// the core runs merge-tracker / updates applications.md). The web is a single local
// Node process, so a module-level set is enough.
//
// Why this exists: `tracker.mjs delete` (#1200) does NOT yet share a file lock with
// merge-tracker (a documented follow-up — merge-tracker isn't import-safe), so a row
// delete must not run while a worker is mid-merge or one of the two writes is lost.
// The delete route serializes against this registry — coarse (the whole run), but
// correct: we never delete while an evaluation is in flight.
//
// WHAT THIS DOES **NOT** PROTECT, and the reason that matters: this is a counter
// in THIS process's memory. It cannot see the user's CLI, a second `career-ops
// web` instance, or anything else on the machine. Cross-process exclusion on
// data/applications.md is the core's FILE lock (tracker-utils.mjs), which the
// web takes by writing the tracker only through set-status.mjs (#2901).
//
// The distinction is not academic: /api/status wrote the tracker with no file
// lock at all while this registry existed one import away, so the route looked
// guarded and lost updates against the CLI in silence (#2900). A reader who sees
// a guard stops looking for the one that is missing — which is exactly why this
// paragraph is here and not in a commit message.
//
// Rule of thumb: in-flight question → this registry. Writing the tracker →
// set-status.mjs. They compose; neither substitutes for the other.

let seq = 0;
const writing = new Set<number>();

/** Mark that a tracker-writing run has started; returns a token to release with. */
export function acquireTrackerWrite(): number {
  const token = ++seq;
  writing.add(token);
  return token;
}

export function releaseTrackerWrite(token: number): void {
  writing.delete(token);
}

/** True while any evaluation/pdf run that mutates applications.md is in flight. */
export function isTrackerWriting(): boolean {
  return writing.size > 0;
}

// Separate from `writing` above: that set guards the tracker file against a
// concurrent delete, keyed by nothing in particular. This one stops the SAME
// cost-incurring run (same kind + same application) from being launched
// twice while it's already in flight — a double-click, a second browser tab,
// or a replayed request would otherwise spend real LLM tokens/money a second
// time for no reason. Keyed by "kind:input" so an evaluate and a pdf run for
// the same application don't block each other.
const inFlight = new Set<string>();

function inFlightKey(kind: string, input: string): string {
  return `${kind}:${input}`;
}

/**
 * Atomically checks-and-marks a run as in flight: returns true and marks it if
 * none was running, or false (and marks nothing) if one already was. A
 * separate check-then-acquire would race between two near-simultaneous
 * requests for the same application — this is one call so there's no gap for
 * that between them (no await happens between the check and the add).
 * Caller must call releaseInFlightRun() exactly once, on every exit path,
 * whenever this returns true.
 */
export function acquireInFlightRun(kind: string, input: string): boolean {
  const key = inFlightKey(kind, input);
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function releaseInFlightRun(kind: string, input: string): void {
  inFlight.delete(inFlightKey(kind, input));
}
