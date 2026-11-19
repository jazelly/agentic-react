#!/bin/bash
# usage: ARM=<arm> NODEV=<v> [PW_TZ=UTC] dev.sh <termOutbase> <browserOutbase> <cwd> <devCmd> <url> [readyTimeoutSec] [settleMs]
# Discarded warm-up session (server + browser, same env) then captured session.
# Dev server: background, output -> file; readiness polled with curl; then Playwright 1.65.1 (pw-latest,
# chromium-headless-shell 1255) loads the URL (networkidle + settle); then SIGINT to the server process group.
# The browser capture script itself runs WITHOUT NODE_OPTIONS (it is the measuring harness, not the case).
term=$1; bout=$2; cwd=$3; cmd=$4; url=$5; rt=${6:-120}; settle=${7:-3000}; D="$(cd "$(dirname "$0")" && pwd)"
PW=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/pw-latest
source "$D/env.sh"
cd "$cwd" || exit 99
port=$(python3 -c "import urllib.parse,sys;print(urllib.parse.urlparse('$url').port)")
session() { # $1 term file, $2 browser file
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "PORT $port BUSY" >&2; exit 97; fi
  set -m
  bash -c "$cmd" < /dev/null > "$1" 2>&1 &
  pid=$!; set +m
  ok=0; for i in $(seq 1 $rt); do curl -s -o /dev/null --max-time 2 "$url" && { ok=1; break; }; sleep 1; done
  readyline="ready=$ok after ${i}s"
  if [ $ok = 1 ]; then env -u NODE_OPTIONS -u AGENTIC_NODE_MODE PW_TZ="${PW_TZ:-}" node "$D/browser-cap.mjs" "$PW" "$url" "$2" "$settle"; else : > "$2"; fi
  sleep 2
  kill -INT -$pid 2>/dev/null; sleep 2; kill -TERM -$pid 2>/dev/null; sleep 1; kill -KILL -$pid 2>/dev/null
  wait $pid 2>/dev/null; sec=$?
}
session "$term.warmup.tmp" "$bout.warmup.tmp"
[ -n "${LOGDEST:-}" ] && "$D/collect-logs.sh" "$cwd" "$LOGDEST/warmup" > /dev/null
rm -f "$term.warmup.tmp" "$bout.warmup.tmp"
sleep 1
s=$(python3 -c 'import time;print(time.time())')
session "$term.txt" "$bout.txt"
e=$(python3 -c 'import time;print(time.time())')
[ -n "${LOGDEST:-}" ] && "$D/collect-logs.sh" "$cwd" "$LOGDEST" > /dev/null
{ echo "arm: $ARM"; echo "command: $cmd"; echo "cwd: $cwd"; echo "url: $url"; echo "node: $(node -v)"; echo "exit_code: n/a (long-running dev server, stopped with SIGINT to its process group; wait status $sec)"; echo "readiness: $readyline"; python3 -c "print('wall_s (start..stop incl. browser + settle): %.1f' % ($e-$s))";
  echo "warmup: yes (one discarded server+browser session with identical env/command immediately before)"; echo "browser_timezone: ${PW_TZ:-host default}";
  echo "stdio: stdin=/dev/null, stdout+stderr -> one file (non-TTY)"; echo "env: $(envline)"; } > "$term.run"
cat "$term.run"
