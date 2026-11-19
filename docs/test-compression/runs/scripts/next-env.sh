#!/bin/bash
# Usage: next-env.sh <control|agentic-node> <cmd...>
# Clean, realistic agent env: drop host agent/CI/color vars, set CLAUDECODE=1 AI_AGENT=claude-code,
# keep TERM; agentic-node arm adds the README "sandbox vendor" template. stdin=/dev/null.
ARM=$1; shift
AN=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/agentic-node-tool/node_modules/agentic-node
for v in $(env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | sed 's/=.*//' | grep -E '^(CLAUDE|AI_AGENT|CURSOR|__CURSOR|CODEX|SAND_AGENT|AGENT_TRANSCRIPTS|GEMINI_CLI|OPENCODE|AMP_|REPL_ID|CI$|NO_COLOR$|FORCE_COLOR$|NODE_OPTIONS$|AGENTIC_NODE)'); do unset "$v"; done
export CLAUDECODE=1 AI_AGENT=claude-code
case "$ARM" in
  control) ;;
  agentic-node) export NODE_OPTIONS="--require $AN/src/preload.cjs" AGENTIC_NODE_MODE=auto ;;
  *) echo "bad arm $ARM" >&2; exit 98 ;;
esac
exec "$@" < /dev/null
