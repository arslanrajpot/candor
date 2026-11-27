#!/bin/zsh
# Pulls the private candor-data repo (where .github/workflows/sweeps.yml
# writes its results — see docs/AUTOMATION.md's GitHub Actions section) and
# overlays it onto this local checkout, so the local web dashboard and any
# local CLI session see what the GitHub Actions automation actually produced.
#
# Without this, the local repo only ever reflects what ran ON THIS MAC —
# GitHub Actions' morningscan/shortlist/daily-digest/draft-apply/followup/
# portalhealth/weeklyrollup runs write exclusively to candor-data, and
# nothing pulled that back down until this script existed (discovered
# 2026-11-27: the local dashboard was showing data frozen from before the
# migration, while a full day's worth of real scan/triage/digest results sat
# untouched in candor-data).
#
# Run hourly via launchd (com.arslanarshad.career-ops.syncdata.plist) rather
# than at one fixed time, since GitHub Actions' own `schedule` trigger can
# fire later than its cron time (observed multi-hour delay on this workflow's
# first scheduled runs) — hourly polling tolerates that without needing to
# guess the right single time.
#
# This is a pure local git+rsync operation: no LLM calls, no cost, safe to
# run as often as convenient. It only ever overlays candor-data's content
# onto these specific paths — it never touches anything else in the repo,
# and never pushes anywhere.

set -uo pipefail

REPO="$(cd "$(dirname "${0}")/.." && pwd)"
cd "$REPO"

DATA_REPO_URL="https://github.com/arslanrajpot/candor-data.git"
CACHE_DIR="$HOME/.career-ops-candor-data-cache"
LOG_FILE="$REPO/data/logs/sync-from-candor-data.log"
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') sync-from-candor-data starting ==="

  if [ ! -d "$CACHE_DIR/.git" ]; then
    echo "No cache at $CACHE_DIR yet — cloning candor-data"
    rm -rf "$CACHE_DIR"
    if ! git clone --quiet "$DATA_REPO_URL" "$CACHE_DIR"; then
      echo "git clone failed — leaving the local checkout untouched this run"
      exit 1
    fi
  else
    if ! git -C "$CACHE_DIR" pull --quiet origin main; then
      echo "git pull failed — leaving the local checkout untouched this run"
      exit 1
    fi
  fi

  CHANGED=0
  for p in cv.md config/profile.yml modes/_profile.md modes/_brief.md portals.yml writing-samples documents jds reports interview-prep batch/tracker-additions data; do
    if [ -e "$CACHE_DIR/$p" ]; then
      if ! diff -rq "$CACHE_DIR/$p" "$REPO/$p" >/dev/null 2>&1; then
        CHANGED=1
      fi
      mkdir -p "$REPO/$(dirname "$p")"
      rsync -a "$CACHE_DIR/$p" "$REPO/$(dirname "$p")/"
    fi
  done

  if [ "$CHANGED" = "1" ]; then
    echo "Synced — candor-data had changes not yet reflected locally"
  else
    echo "Synced — nothing new since the last sync"
  fi
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') sync-from-candor-data done ==="
} >> "$LOG_FILE" 2>&1
