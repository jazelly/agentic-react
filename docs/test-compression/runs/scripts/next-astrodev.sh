#!/bin/bash
# Usage: next-astrodev.sh <repo> <devCase> <browserCase|-> <arm> <cwd> <task> <url> -- <dev cmd string>
# astro 7.4 under agent markers daemonizes `astro dev`. Procedure (arm env everywhere, stdin /dev/null):
#   1. run the dev command in the foreground -> <devCase>.<arm>.txt (it prints the daemon notice and exits; exit code recorded)
#   2. wait until the port accepts TCP (nc -z, no HTTP request so no extra request log line)
#   3. load <url> with next-console.mjs -> <browserCase>.<arm>.txt (or one curl request when browserCase is -)
#   4. wait 4s, then append `npx astro dev logs` output to the same <devCase>.<arm>.txt (what the agent sees next)
#   5. `npx astro dev stop` (output kept in warmup/<devCase>.<arm>.stop.txt, not part of the case)
# A discarded warm-up with the identical procedure runs first. env: WS TOOLS DEVIATIONS NOTES DEVNOTES BROWSERNOTES EXTRAENV
REPO=$1; DC=$2; BC=$3; ARM=$4; CWD=$5; TASK=$6; URL=$7; shift 7; [ "$1" = "--" ] && shift
CMD="$*"; M=$(cd "$(dirname "$0")" && pwd); OUT=$(dirname "$M")/$REPO
WS=${WS:-$CWD}
PW=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/pw-latest/node_modules
SHA=$(git -C /Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/repos/$REPO rev-parse HEAD)
mkdir -p "$OUT/warmup"
now() { python3 -c 'import time;print(time.time())'; }
PORT=$(echo "$URL" | sed -E 's#.*:([0-9]+).*#\1#')
run_once() { # $1 devOut $2 browserOut|- $3 stopOut
  local dout=$1 bout=$2 sout=$3
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT busy" >&2; exit 97; fi
  local s=$(now)
  (cd "$CWD" && "$M/next-env.sh" "$ARM" bash -c "$CMD" > "$dout" 2>&1); R_FEC=$?
  R_FDUR=$(python3 -c "print(round($(now)-$s,2))")
  R_READY=no
  for i in $(seq 1 240); do nc -z localhost $PORT 2>/dev/null && { R_READY=yes; break; }; sleep 0.5; done
  R_TREADY=$(python3 -c "print(round($(now)-$s,2))")
  R_HTTP=; R_BEC=; R_BDUR=
  if [ "$bout" != "-" ]; then
    local bs=$(now)
    (cd "$CWD" && "$M/next-env.sh" "$ARM" node "$M/next-console.mjs" "$PW" "$URL" 4000 > "$bout" 2> "$bout.stderr"); R_BEC=$?
    R_BDUR=$(python3 -c "print(round($(now)-$bs,2))")
    R_HTTP=$(cat "$bout.stderr"); rm -f "$bout.stderr"
  else
    R_HTTP="curl: $(curl -s -o /dev/null -w '%{http_code}' -m 240 "$URL")"
  fi
  sleep 4
  local ls=$(now)
  (cd "$CWD" && "$M/next-env.sh" "$ARM" npx astro dev logs >> "$dout" 2>&1); R_LEC=$?
  R_LDUR=$(python3 -c "print(round($(now)-$ls,2))")
  (cd "$CWD" && "$M/next-env.sh" "$ARM" npx astro dev stop > "$sout" 2>&1); R_SEC=$?
  for i in $(seq 1 20); do lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.5; done
  R_DUR=$(python3 -c "print(round($(now)-$s,2))")
}
"$M/next-anlogs.sh" "$WS" -
wb=-; [ "$BC" != "-" ] && wb="$OUT/warmup/$BC.$ARM.txt"
run_once "$OUT/warmup/$DC.$ARM.txt" "$wb" "$OUT/warmup/$DC.$ARM.warmup-stop.txt"
"$M/next-anlogs.sh" "$WS" -
WARMINFO="yes: one discarded run with the identical procedure and env (foreground exit $R_FEC, ready=$R_READY, page: $R_HTTP, logs exit $R_LEC, stop exit $R_SEC, ${R_DUR}s); output in warmup/$DC.$ARM.txt$( [ "$BC" != "-" ] && echo " / warmup/$BC.$ARM.txt")"
bo=-; [ "$BC" != "-" ] && bo="$OUT/$BC.$ARM.txt"
run_once "$OUT/$DC.$ARM.txt" "$bo" "$OUT/warmup/$DC.$ARM.stop.txt"
LOGS="none written"
if [ "$ARM" = agentic-node ]; then
  "$M/next-anlogs.sh" "$WS" "$OUT/agentic-node-logs/$DC"
  [ -d "$OUT/agentic-node-logs/$DC" ] && LOGS="copied to agentic-node-logs/$DC/ ($(find "$OUT/agentic-node-logs/$DC" -type f | wc -l | tr -d ' ') files)"
fi
common() {
echo "repo: $REPO"; echo "pinned SHA: $SHA"; echo "task: $TASK"; echo "arm: $ARM"; echo "cwd: $CWD"
echo "env: CLAUDECODE=1 AI_AGENT=claude-code; other host agent vars (CLAUDE*, CURSOR*, CODEX*, ...), CI, NO_COLOR, FORCE_COLOR, NODE_OPTIONS unset (harness shell had NO_COLOR=1 FORCE_COLOR=0); TERM=$TERM inherited; stdin=/dev/null; stdout+stderr combined into one file (non-TTY)${EXTRAENV:+; $EXTRAENV}"
[ "$ARM" = agentic-node ] && echo "agentic-node: NODE_OPTIONS=\"--require <SCRATCH>/agentic-node-tool/node_modules/agentic-node/src/preload.cjs\" AGENTIC_NODE_MODE=auto (agentic-node github:jazelly/agentic-node#4e604d36ccc0c7b3b491a02c28f654e474bce60b), inherited by yarn/astro (incl. the daemonized dev server), astro dev logs/stop and the browser-capture script; .agentic-node logs: $LOGS"
echo "node: $(node -v)"
[ -n "$TOOLS" ] && echo "tool versions: $TOOLS"
echo "warm-up: $WARMINFO"
[ -n "$DEVIATIONS" ] && echo "deviations: $DEVIATIONS"
}
{ common; echo "command: $CMD   then (after the page load + 4s): npx astro dev logs   (both outputs appended to this one file, in that order)"
  echo "procedure: foreground dev command (astro daemonizes under agent markers; foreground exit code $R_FEC, ${R_FDUR}s); waited for TCP port $PORT (nc -z, ready=$R_READY after ${R_TREADY}s); then $( [ "$BC" != "-" ] && echo "loaded $URL in headless Chromium via next-console.mjs" || echo "requested $URL once with curl"); waited 4s; ran npx astro dev logs (exit $R_LEC, ${R_LDUR}s) appending to this file; then npx astro dev stop (exit $R_SEC; output in warmup/$DC.$ARM.stop.txt, not part of the case)."
  echo "page: $R_HTTP"
  echo "exit code: foreground dev command $R_FEC; astro dev logs $R_LEC"; echo "duration (start to stop): ${R_DUR}s"
  [ -n "$NOTES$DEVNOTES" ] && echo "notes: $NOTES $DEVNOTES"; } > "$OUT/$DC.$ARM.meta.txt"
if [ "$BC" != "-" ]; then
{ common; echo "command: node next-console.mjs <pw-latest playwright> $URL 4000  (records page 'console' events as [type] text and 'pageerror' as [pageerror] stack, waitUntil networkidle + 4s)"
  echo "browser: Playwright 1.65.1, chromium headless shell 1255 (Chrome for Testing 159.0.8154.6)"
  echo "page response: $R_HTTP"; echo "dev server command: $CMD (daemonized server of $DC.$ARM.txt)"
  echo "exit code: $R_BEC"; echo "duration: ${R_BDUR}s"
  [ -n "$NOTES$BROWSERNOTES" ] && echo "notes: $NOTES $BROWSERNOTES"; } > "$OUT/$BC.$ARM.meta.txt"
fi
echo "$DC.$ARM fg=$R_FEC ready=$R_READY page=$R_HTTP logs=$R_LEC stop=$R_SEC total=${R_DUR}s | $WARMINFO"
