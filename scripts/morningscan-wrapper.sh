#!/bin/zsh
# Thin wrapper around `node scan.mjs` so launchd gets a failure notification,
# not just silence, when the scan breaks (see docs/AUTOMATION.md section 1).

set -uo pipefail

REPO="$(cd "$(dirname "${0}")/.." && pwd)"
cd "$REPO"

NODE_BIN="$(command -v node || echo "/opt/homebrew/bin/node")"

"$NODE_BIN" scan.mjs
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  osascript -e "display notification \"Morning scan failed (exit $STATUS) — check data/logs/morningscan.err.log\" with title \"career-ops\"" >/dev/null 2>&1 || true
fi

exit $STATUS
