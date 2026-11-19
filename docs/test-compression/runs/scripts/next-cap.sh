#!/bin/bash
# Usage: next-cap.sh <repo> <case> <arm> <cwd> <task|-> -- <cmd string>
# env: WS (workspace root for .agentic-node log collection; default cwd), WARM (1 default; 0 = no warm-up),
#      TOOLS, DEVIATIONS, NOTES, BROWSER (free text for meta), PRE (shell run in WS once, before the warm-up)
REPO=$1; CASE=$2; ARM=$3; CWD=$4; TASK=$5; shift 5; [ "$1" = "--" ] && shift
CMD="$*"; M=$(cd "$(dirname "$0")" && pwd); OUT=$(dirname "$M")/$REPO
WS=${WS:-$CWD}; WARM=${WARM:-1}
SHA=$(git -C /Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/repos/$REPO rev-parse HEAD)
mkdir -p "$OUT/warmup"
now() { python3 -c 'import time;print(time.time())'; }
"$M/next-anlogs.sh" "$WS" -
WARMINFO="no warm-up"
if [ "$WARM" = 1 ]; then
  [ -n "$PRE" ] && (cd "$WS" && bash -c "$PRE")
  ws=$(now); (cd "$CWD" && "$M/next-env.sh" "$ARM" bash -c "$CMD" > "$OUT/warmup/$CASE.$ARM.txt" 2>&1); wec=$?
  wd=$(python3 -c "print(round($(now)-$ws,2))")
  "$M/next-anlogs.sh" "$WS" -
  WARMINFO="yes: one discarded run of the same command with the same env (exit $wec, ${wd}s); its output is warmup/$CASE.$ARM.txt"
fi
s=$(now)
(cd "$CWD" && "$M/next-env.sh" "$ARM" bash -c "$CMD" > "$OUT/$CASE.$ARM.txt" 2>&1); ec=$?
dur=$(python3 -c "print(round($(now)-$s,2))")
LOGS="none written"
if [ "$ARM" = agentic-node ]; then
  "$M/next-anlogs.sh" "$WS" "$OUT/agentic-node-logs/$CASE"
  [ -d "$OUT/agentic-node-logs/$CASE" ] && LOGS="copied to agentic-node-logs/$CASE/ ($(find "$OUT/agentic-node-logs/$CASE" -type f | wc -l | tr -d ' ') files)"
fi
{
echo "repo: $REPO"
echo "pinned SHA: $SHA"
echo "task: $TASK"
echo "arm: $ARM"
echo "command: $CMD"
echo "cwd: $CWD"
echo "env: CLAUDECODE=1 AI_AGENT=claude-code; other host agent vars (CLAUDE*, CURSOR*, CODEX*, ...), CI, NO_COLOR, FORCE_COLOR, NODE_OPTIONS unset (harness shell had NO_COLOR=1 FORCE_COLOR=0); TERM=$TERM inherited; stdin=/dev/null; stdout+stderr combined into one file (non-TTY)${EXTRAENV:+; $EXTRAENV}"
[ "$ARM" = agentic-node ] && echo "agentic-node: NODE_OPTIONS=\"--require <SCRATCH>/agentic-node-tool/node_modules/agentic-node/src/preload.cjs\" AGENTIC_NODE_MODE=auto (agentic-node github:jazelly/agentic-node#4e604d36ccc0c7b3b491a02c28f654e474bce60b); .agentic-node logs: $LOGS"
echo "node: $(node -v)"
[ -n "$TOOLS" ] && echo "tool versions: $TOOLS"
[ -n "$BROWSER" ] && echo "browser: $BROWSER"
echo "exit code: $ec"
echo "duration: ${dur}s"
echo "warm-up: $WARMINFO"
[ -n "$DEVIATIONS" ] && echo "deviations: $DEVIATIONS"
[ -n "$NOTES" ] && echo "notes: $NOTES"
} > "$OUT/$CASE.$ARM.meta.txt"
echo "$CASE.$ARM exit=$ec dur=${dur}s warm=$WARMINFO"
