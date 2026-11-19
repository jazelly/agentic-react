#!/bin/bash
# usage: ARM=<arm> NODEV=<v> [WARM=1] run.sh <outbase> <cwd> <cmd>
# One discarded warm-up run (same env) unless WARM=0, then the captured run.
# Writes <outbase>.txt (raw combined stdout+stderr) and <outbase>.run (auto meta fields).
out=$1; cwd=$2; cmd=$3; D="$(cd "$(dirname "$0")" && pwd)"
source "$D/env.sh"
cd "$cwd" || exit 99
if [ "${WARM:-1}" = 1 ]; then
  bash -c "$cmd" < /dev/null > "$out.warmup.tmp" 2>&1; wec=$?
  [ -n "${LOGDEST:-}" ] && "$D/collect-logs.sh" "$cwd" "$LOGDEST/warmup" > /dev/null
  [ -n "${BETWEEN:-}" ] && bash -c "$BETWEEN"
fi
s=$(python3 -c 'import time;print(time.time())')
bash -c "$cmd" < /dev/null > "$out.txt" 2>&1
ec=$?
e=$(python3 -c 'import time;print(time.time())')
[ -n "${LOGDEST:-}" ] && "$D/collect-logs.sh" "$cwd" "$LOGDEST" > /dev/null
{ echo "arm: $ARM"; echo "command: $cmd"; echo "cwd: $cwd"; echo "node: $(node -v)"; echo "exit_code: $ec"; python3 -c "print('duration_s: %.1f' % ($e-$s))";
  if [ "${WARM:-1}" = 1 ]; then echo "warmup: yes (one discarded run with identical env/command immediately before; warm-up exit code $wec)"; else echo "warmup: no"; fi
  echo "stdio: stdin=/dev/null, stdout+stderr -> one file (non-TTY)"; echo "env: $(envline)"; } > "$out.run"
rm -f "$out.warmup.tmp"
cat "$out.run"
