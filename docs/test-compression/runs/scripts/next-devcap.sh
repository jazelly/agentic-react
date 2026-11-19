#!/bin/bash
# Usage: next-devcap.sh <repo> <devCase> <browserCase|-> <arm> <cwd> <task> <url> -- <dev cmd string>
# Starts the dev command in its own process group (arm env, stdin /dev/null, stdout+stderr -> <devCase>.<arm>.txt),
# waits for READY regex in its output (or curl <url>), loads <url> with next-console.mjs (Playwright 1.65.1, arm env)
# -> <browserCase>.<arm>.txt, waits 4s, SIGTERM to the group (SIGKILL after 2s).
# PRE (shell, run in WS) runs once before the warm-up. A discarded warm-up with the identical procedure runs first (WARM=0 disables). env: WS READY VIEWPORT_W PRE TOOLS DEVIATIONS NOTES DEVNOTES BROWSERNOTES EXTRAENV
REPO=$1; DC=$2; BC=$3; ARM=$4; CWD=$5; TASK=$6; URL=$7; shift 7; [ "$1" = "--" ] && shift
CMD="$*"; M=$(cd "$(dirname "$0")" && pwd); OUT=$(dirname "$M")/$REPO
WS=${WS:-$CWD}; WARM=${WARM:-1}
PW=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/pw-latest/node_modules
SHA=$(git -C /Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/repos/$REPO rev-parse HEAD)
mkdir -p "$OUT/warmup"
now() { python3 -c 'import time;print(time.time())'; }
PORT=$(echo "$URL" | sed -E 's#.*:([0-9]+).*#\1#')
run_once() { # $1 devOut $2 browserOut|-  -> sets R_READY R_TREADY R_DUR R_BEC R_BDUR R_HTTP
  local dout=$1 bout=$2
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT busy" >&2; exit 97; fi
  local s=$(now)
  (cd "$CWD" && exec perl -e 'setpgrp(0,0); exec @ARGV' "$M/next-env.sh" "$ARM" bash -c "$CMD" > "$dout" 2>&1) &
  local pg=$!
  R_READY=no
  for i in $(seq 1 480); do
    if [ -n "$READY" ]; then grep -qE "$READY" "$dout" 2>/dev/null && { R_READY=yes; break; }
    else curl -s -o /dev/null -m 5 "$URL" && { R_READY=yes; break; }; fi
    kill -0 $pg 2>/dev/null || break
    sleep 0.5
  done
  R_TREADY=$(python3 -c "print(round($(now)-$s,2))")
  R_HTTP=; R_BEC=; R_BDUR=
  if [ "$bout" != "-" ]; then
    local bs=$(now)
    (cd "$CWD" && VIEWPORT_W=$VIEWPORT_W "$M/next-env.sh" "$ARM" node "$M/next-console.mjs" "$PW" "$URL" 4000 > "$bout" 2> "$bout.stderr"); R_BEC=$?
    R_BDUR=$(python3 -c "print(round($(now)-$bs,2))")
    R_HTTP=$(cat "$bout.stderr"); rm -f "$bout.stderr"
  else
    R_HTTP="curl: $(curl -s -o /dev/null -w '%{http_code}' -m 240 "$URL")"
  fi
  sleep 4
  kill -TERM -- -$pg 2>/dev/null; sleep 2; kill -KILL -- -$pg 2>/dev/null; wait $pg 2>/dev/null
  R_DUR=$(python3 -c "print(round($(now)-$s,2))")
}
"$M/next-anlogs.sh" "$WS" -
WARMINFO="no warm-up"
if [ "$WARM" = 1 ]; then
  [ -n "$PRE" ] && (cd "$WS" && bash -c "$PRE")
  wb=-; [ "$BC" != "-" ] && wb="$OUT/warmup/$BC.$ARM.txt"
  run_once "$OUT/warmup/$DC.$ARM.txt" "$wb"
  "$M/next-anlogs.sh" "$WS" -
  WARMINFO="yes: one discarded run with the identical procedure and env (ready=$R_READY after ${R_TREADY}s, page: $R_HTTP, ${R_DUR}s); output in warmup/$DC.$ARM.txt$( [ "$BC" != "-" ] && echo " / warmup/$BC.$ARM.txt")"
fi
bo=-; [ "$BC" != "-" ] && bo="$OUT/$BC.$ARM.txt"
run_once "$OUT/$DC.$ARM.txt" "$bo"
LOGS="none written"
if [ "$ARM" = agentic-node ]; then
  "$M/next-anlogs.sh" "$WS" "$OUT/agentic-node-logs/$DC"
  [ -d "$OUT/agentic-node-logs/$DC" ] && LOGS="copied to agentic-node-logs/$DC/ ($(find "$OUT/agentic-node-logs/$DC" -type f | wc -l | tr -d ' ') files)"
fi
common() {
echo "repo: $REPO"; echo "pinned SHA: $SHA"; echo "task: $TASK"; echo "arm: $ARM"; echo "cwd: $CWD"
echo "env: CLAUDECODE=1 AI_AGENT=claude-code; other host agent vars (CLAUDE*, CURSOR*, CODEX*, ...), CI, NO_COLOR, FORCE_COLOR, NODE_OPTIONS unset (harness shell had NO_COLOR=1 FORCE_COLOR=0); TERM=$TERM inherited; stdin=/dev/null; stdout+stderr combined into one file (non-TTY)${EXTRAENV:+; $EXTRAENV}"
[ "$ARM" = agentic-node ] && echo "agentic-node: NODE_OPTIONS=\"--require <SCRATCH>/agentic-node-tool/node_modules/agentic-node/src/preload.cjs\" AGENTIC_NODE_MODE=auto (agentic-node github:jazelly/agentic-node#4e604d36ccc0c7b3b491a02c28f654e474bce60b), inherited by the dev server and the browser-capture script; .agentic-node logs: $LOGS"
echo "node: $(node -v)"
[ -n "$TOOLS" ] && echo "tool versions: $TOOLS"
echo "warm-up: $WARMINFO"
[ -n "$DEVIATIONS" ] && echo "deviations: $DEVIATIONS"
}
{ common; echo "command: $CMD"
  echo "procedure: dev server started in its own process group; waited for readiness (${READY:+log matched /$READY/}${READY:-curl $URL answered}) (ready=$R_READY after ${R_TREADY}s); then $( [ "$BC" != "-" ] && echo "loaded $URL in headless Chromium via next-console.mjs" || echo "requested $URL with curl"); waited 4s; SIGTERM to the process group (SIGKILL 2s later). Output is everything the dev process printed until kill."
  echo "page: $R_HTTP"
  echo "exit code: n/a (killed by SIGTERM after capture)"; echo "duration (start to kill): ${R_DUR}s"
  [ -n "$NOTES$DEVNOTES" ] && echo "notes: $NOTES $DEVNOTES"; } > "$OUT/$DC.$ARM.meta.txt"
if [ "$BC" != "-" ]; then
{ common; echo "command: node next-console.mjs <pw-latest playwright> $URL 4000  (records page 'console' events as [type] text and 'pageerror' as [pageerror] stack, waitUntil networkidle + 4s${VIEWPORT_W:+, viewport ${VIEWPORT_W}x800})"
  echo "browser: Playwright 1.65.1, chromium headless shell 1255 (Chrome for Testing 159.0.8154.6)"
  echo "page response: $R_HTTP"; echo "dev server command: $CMD (same process as $DC.$ARM.txt)"
  echo "exit code: $R_BEC"; echo "duration: ${R_BDUR}s"
  [ -n "$NOTES$BROWSERNOTES" ] && echo "notes: $NOTES $BROWSERNOTES"; } > "$OUT/$BC.$ARM.meta.txt"
fi
echo "$DC.$ARM ready=$R_READY t=${R_TREADY}s total=${R_DUR}s page=$R_HTTP | $WARMINFO"
