#!/bin/zsh
# Weekly portal health check (improvement #2). Zero-token: reuses the project's
# own stats.mjs --prune, which reads data/scan-history.tsv + data/portal-health.tsv
# (both already written by the daily morning scan) and flags companies that used
# to produce matches but have stopped. Only notifies when something is newly
# actionable — a quiet week stays silent.

set -uo pipefail

REPO="$(cd "$(dirname "${0}")/.." && pwd)"
cd "$REPO"

LOG_FILE="$REPO/data/portal-health-sweep.log"
mkdir -p "$(dirname "$LOG_FILE")"

NODE_BIN="$(command -v node || echo "/opt/homebrew/bin/node")"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') portal health sweep starting ==="
  "$NODE_BIN" stats.mjs --summary --prune
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') portal health sweep done ==="
} >> "$LOG_FILE" 2>&1

FAILING_NOW="$(grep -o 'Previously producing, failing now: [0-9]*' "$LOG_FILE" | tail -1 | grep -o '[0-9]*$')"

if [ -n "${FAILING_NOW:-}" ] && [ "$FAILING_NOW" -gt 0 ] 2>/dev/null; then
  osascript -e "display notification \"$FAILING_NOW tracked companies have stopped producing matches — see data/portal-health-sweep.log\" with title \"career-ops\"" >/dev/null 2>&1 || true
fi

# Weekly housekeeping, piggybacked on this job since it already runs once a week:
# - truncate any sweep .log file over 2MB to its last 2000 lines (unbounded
#   append otherwise, forever)
# - delete disposable per-day JD pre-fetch caches, downloaded JD PDFs, and
#   raw websearch-discovery output older than 30 days (all explicitly
#   documented as disposable in the scripts that write them;
#   reports/daily-digest-*.md and reports/weekly-digest-*.md are real records
#   and are never touched here)
for f in "$REPO"/data/*.log; do
  [ -e "$f" ] || continue
  size=$(stat -f%z "$f" 2>/dev/null || echo 0)
  if [ "$size" -gt 2097152 ]; then
    tail -2000 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') truncated $f (was ${size} bytes) ===" >> "$LOG_FILE"
  fi
done

find "$REPO/data" -maxdepth 1 -name 'digest-jd-cache-*.json' -mtime +30 -delete 2>/dev/null || true
find "$REPO/data/tmp-jd-pdfs" -maxdepth 1 -type f -mtime +30 -delete 2>/dev/null || true
find "$REPO/data" -maxdepth 1 -name 'websearch-raw-*.json' -mtime +30 -delete 2>/dev/null || true
