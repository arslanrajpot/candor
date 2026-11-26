#!/bin/zsh
# _claude-run-guard.sh — shared fail-fast wrapper around a headless `claude -p`
# invocation, sourced (not executed) by the unattended sweep scripts.
#
# THE BUG THIS FIXES (found 2026-11-26): when the account has already hit its
# usage limit, `claude -p` prints the limit banner as its very first line of
# output, then — instead of exiting — sits for ~3-3.5 hours before finally
# giving up with exit 1. A plain `"$CLAUDE_BIN" -p "$PROMPT" ... >> log 2>&1`
# blocks on that the whole time, so two back-to-back launchd jobs
# (websearchdiscovery 07:20, shortlist 07:55) each camped on the account's
# usage window from ~07:20 to ~11:10 every morning, burning wall-clock for
# nothing and never reaching the point where they'd actually suggest a role.
# (The same "Request timed out" hang was seen once before, 2026-11-15, under
# a different message — so the guard below matches on more than one phrase.)
#
# There is no CLI flag for this (checked `claude --help`: no --timeout,
# --max-turns or retry knob), and this machine has neither `timeout` nor
# `gtimeout` installed, so the fix is a portable poll loop: run the agent in
# the background, tail its own log for the limit banner (or any of a few
# other known-stuck signatures) every few seconds, and kill it the moment one
# appears — instead of waiting for the CLI's own internal retry to give up.
# A generous wall-clock backstop still applies in case something else hangs
# silently with no matching banner.
#
# Usage (from a script that has already set LOG_FILE and CLAUDE_BIN):
#   run_claude_guarded "$LOG_FILE" <max_wait_seconds> "$CLAUDE_BIN" -p "$PROMPT" --allowedTools ...
#   my_status=$?   # NOT "status" — zsh reserves that name as a synonym for $?
#   case $my_status in
#     0)   ... ;;                 # genuine success
#     75)  ... ;;                 # usage-limit detected and aborted early (sysexits EX_TEMPFAIL — retry later, not a bug)
#     124) ... ;;                 # backstop wall-clock timeout fired, no limit banner seen (genuine hang/unusually slow run)
#     *)   ... ;;                 # the CLI's own real exit code
#   esac
#
# The caller's own `>> "$LOG_FILE" 2>&1` redirection is NOT needed around this
# call — the guard redirects the child itself, so the log still gets every
# line, just via the backgrounded process's own fd instead of the caller's.

CLAUDE_GUARD_POLL_SECONDS=5
# Phrases observed to mean "stuck, not making progress" rather than "still
# thinking" — kept short and specific so normal agent output (a job posting's
# own text, included verbatim in prompts as untrusted data) is vanishingly
# unlikely to false-positive match. Case-insensitive.
CLAUDE_GUARD_STUCK_PATTERN='hit your .*(hour|usage)[^.]*limit|usage limit reached|request timed out'

run_claude_guarded() {
  local log_file="$1"
  local max_wait="$2"
  local claude_bin="$3"
  shift 3

  "$claude_bin" "$@" >> "$log_file" 2>&1 &
  local pid=$!
  local start_ts
  start_ts=$(date +%s)
  local reason=""

  while kill -0 "$pid" 2>/dev/null; do
    # Only the tail of the log needs checking each poll — the banner, when it
    # appears, is within the first few lines the CLI ever writes.
    if tail -c 4000 "$log_file" 2>/dev/null | grep -qiE "$CLAUDE_GUARD_STUCK_PATTERN"; then
      reason="usage-limit"
      break
    fi
    if [ $(( $(date +%s) - start_ts )) -ge "$max_wait" ]; then
      reason="timeout"
      break
    fi
    sleep "$CLAUDE_GUARD_POLL_SECONDS"
  done

  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null
    sleep 2
    kill -KILL "$pid" 2>/dev/null
  fi
  wait "$pid" 2>/dev/null
  local child_exit_code=$?

  case "$reason" in
    usage-limit)
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') claude-run-guard: aborted early — usage-limit banner seen in output; killed instead of waiting out the CLI's internal retry (previously observed ~3-3.5h hangs). Will simply retry at the next scheduled run. ===" >> "$log_file"
      return 75
      ;;
    timeout)
      echo "=== $(date '+%Y-%m-%d %H:%M:%S') claude-run-guard: aborted — exceeded ${max_wait}s wall-clock budget with no usage-limit banner seen (genuine hang or unusually slow run); killed ===" >> "$log_file"
      return 124
      ;;
    *)
      return "$child_exit_code"
      ;;
  esac
}
