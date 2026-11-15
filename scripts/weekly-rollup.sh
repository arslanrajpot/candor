#!/bin/zsh
# Weekly rollup (improvement #3). Zero-token, pure text processing: concatenates
# the PASS/MARGINAL rows from the last 7 days of reports/daily-digest-*.md into
# one file, so a few days away doesn't mean opening half a dozen separate files
# to catch up. Does not touch the source digest files.

set -uo pipefail

REPO="$(cd "$(dirname "${0}")/.." && pwd)"
cd "$REPO"

TODAY="$(date '+%Y-%m-%d')"
WEEK_START="$(date -v-6d '+%Y-%m-%d' 2>/dev/null || date -d '6 days ago' '+%Y-%m-%d')"
OUT_FILE="$REPO/reports/weekly-digest-${WEEK_START}-to-${TODAY}.md"
LOG_FILE="$REPO/data/weekly-rollup.log"
mkdir -p "$REPO/reports" "$(dirname "$LOG_FILE")"

{
  echo "# Weekly Digest — ${WEEK_START} to ${TODAY}"
  echo ""
  echo "Rolled up from reports/daily-digest-*.md — nothing here was applied to."
  echo ""

  total_pass=0
  total_marginal=0
  found_any=0

  for f in "$REPO"/reports/daily-digest-*.md; do
    [ -e "$f" ] || continue
    base="$(basename "$f" .md)"
    day="${base#daily-digest-}"
    # Only include files from the last 7 days (lexical date compare works for YYYY-MM-DD)
    if [[ "$day" < "$WEEK_START" ]]; then
      continue
    fi
    if [[ "$day" > "$TODAY" ]]; then
      continue
    fi

    # Excludes a stray "- None today." (the agent is told to write it without a
    # leading dash, but a defensive filter here costs nothing and prevents a
    # fake PASS/MARGINAL row if it ever doesn't).
    pass_lines="$(awk '/^## PASS/{flag=1; next} /^## /{flag=0} flag && /^- / && tolower($0) !~ /^- none today\.?$/{print}' "$f")"
    marginal_lines="$(awk '/^## MARGINAL/{flag=1; next} /^## /{flag=0} flag && /^- / && tolower($0) !~ /^- none today\.?$/{print}' "$f")"

    if [ -n "$pass_lines" ] || [ -n "$marginal_lines" ]; then
      found_any=1
      echo "## ${day}"
      echo ""
      if [ -n "$pass_lines" ]; then
        echo "**PASS**"
        echo "$pass_lines"
        total_pass=$((total_pass + $(echo "$pass_lines" | grep -c '^- ')))
        echo ""
      fi
      if [ -n "$marginal_lines" ]; then
        echo "**MARGINAL**"
        echo "$marginal_lines"
        total_marginal=$((total_marginal + $(echo "$marginal_lines" | grep -c '^- ')))
        echo ""
      fi
    fi
  done

  if [ "$found_any" -eq 0 ]; then
    echo "No PASS or MARGINAL roles in this window."
  else
    echo "---"
    echo "Totals this week: ${total_pass} PASS, ${total_marginal} MARGINAL."
  fi
} > "$OUT_FILE"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') weekly rollup written -> $OUT_FILE ===" >> "$LOG_FILE"

osascript -e "display notification \"Weekly digest ready: $OUT_FILE\" with title \"career-ops\"" >/dev/null 2>&1 || true
