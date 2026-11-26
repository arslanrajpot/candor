#!/bin/zsh
# Unattended follow-up sweep, run via launchd (see docs/AUTOMATION.md).
# Never sends anything -- writes drafts to output/ for the user to review.

set -euo pipefail

REPO="$(cd "$(dirname "${0}")/.." && pwd)"
cd "$REPO"

# Same data root as followup-cadence.mjs (CAREER_OPS_ROOT, CAREER_OPS_DATA_DIR,
# or .career-ops-data), so drafts, logs, and the enabled check stay aligned.
ROOT="$(node --input-type=module -e "import { getCareerOpsRoot } from './path-resolver.mjs'; process.stdout.write(getCareerOpsRoot())")"
OUT_DIR="$ROOT/output"
DATE_STR="$(date +%Y-%m-%d)"
DRAFT_FILE="$OUT_DIR/followup-drafts-$DATE_STR.md"
LOG_FILE="$ROOT/data/followup-sweep.log"

mkdir -p "$OUT_DIR" "$(dirname "$LOG_FILE")"

# Skip before spending an agent turn when the user turned follow-ups off.
# Exit 0 = off, 1 = on, anything else = the check itself failed.
set +e
node --input-type=module -e "
import { loadFollowupsEnabled } from './followup-cadence.mjs';
try {
  process.exit(loadFollowupsEnabled() ? 1 : 0);
} catch (err) {
  console.error(err);
  process.exit(2);
}
"
enabled_status=$?
set -e
case "$enabled_status" in
  0)
    {
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') follow-up sweep skipped: follow-ups are turned off (follow_ups.enabled: false) ==="
    } >> "$LOG_FILE"
    exit 0
    ;;
  1)
    ;;
  *)
    {
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') follow-up sweep aborted: enabled check failed (exit $enabled_status) ==="
    } >> "$LOG_FILE"
    exit "$enabled_status"
    ;;
esac

PROMPT="Run the career-ops 'followup' mode (modes/followup.md) against $ROOT/data/applications.md and $ROOT/data/follow-ups.md. Run node followup-cadence.mjs, and for every overdue/urgent entry generate the follow-up email/LinkedIn draft per the mode's framework (voice-dna.md guardrails apply). Write the full dashboard plus every generated draft to $DRAFT_FILE as markdown. Do NOT send, submit, or record anything as sent -- draft-only, for the user to review later. If there is nothing overdue/urgent, write a one-line note to that file saying so instead."

CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"
source "$REPO/scripts/_claude-run-guard.sh"
# Backstop only — a usage-limit hit is caught by the guard's content match
# within seconds, long before this 20-minute ceiling would ever fire.
RUN_MAX_WAIT_SECONDS=1200
set +e
echo "=== $(date '+%Y-%m-%d %H:%M:%S') follow-up sweep starting ===" >> "$LOG_FILE"
run_claude_guarded "$LOG_FILE" "$RUN_MAX_WAIT_SECONDS" "$CLAUDE_BIN" -p "$PROMPT"
FOLLOWUP_STATUS=$?
echo "=== $(date '+%Y-%m-%d %H:%M:%S') follow-up sweep done (exit $FOLLOWUP_STATUS) -> $DRAFT_FILE ===" >> "$LOG_FILE"
set -e

if [ "$FOLLOWUP_STATUS" = "0" ] && [ -f "$DRAFT_FILE" ]; then
  osascript -e "display notification \"Follow-up drafts ready: $DRAFT_FILE\" with title \"career-ops\"" >/dev/null 2>&1 || true
elif [ "$FOLLOWUP_STATUS" = "75" ]; then
  osascript -e "display notification \"Follow-up sweep skipped — account usage limit already hit (detected in seconds). Will try again next scheduled run.\" with title \"career-ops\"" >/dev/null 2>&1 || true
else
  osascript -e "display notification \"Follow-up sweep failed (exit $FOLLOWUP_STATUS) — check $LOG_FILE\" with title \"career-ops\"" >/dev/null 2>&1 || true
fi

exit "$FOLLOWUP_STATUS"
