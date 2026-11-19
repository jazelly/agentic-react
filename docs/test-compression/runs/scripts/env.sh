# source me. Inputs: ARM=control|agentic-node, NODEV (default 24.15.0).
# Strips every inherited agent marker / color forcing, then sets exactly the realistic agent markers.
for v in $(env | grep -oE '^(CLAUDE[A-Z_]*|CODEX_[A-Z_]*|CURSOR_[A-Z_]*|__CURSOR[A-Z_]*|AGENTIC_NODE_[A-Z_]*)=' | tr -d =); do unset "$v"; done
unset CLAUDECODE AI_AGENT CURSOR_AGENT SAND_AGENT AGENT_TRANSCRIPTS FORCE_COLOR NO_COLOR CI GEMINI_CLI OPENCODE AGENT NODE_OPTIONS
export CLAUDECODE=1 AI_AGENT=claude-code
NODEV=${NODEV:-24.15.0}
export PATH="$HOME/.nvm/versions/node/v$NODEV/bin:$(echo "$PATH" | tr ':' '\n' | grep -v '/.nvm/versions/node/' | paste -sd: -)"
AN_PRELOAD=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/agentic-node-tool/node_modules/agentic-node/src/preload.cjs
case "$ARM" in
  control) ;;
  agentic-node) export NODE_OPTIONS="--require $AN_PRELOAD" AGENTIC_NODE_MODE=auto ;;
  *) echo "ARM must be control|agentic-node" >&2; exit 98 ;;
esac
envline() { echo "CLAUDECODE=${CLAUDECODE-unset} AI_AGENT=${AI_AGENT-unset} CI=${CI-unset} NO_COLOR=${NO_COLOR-unset} FORCE_COLOR=${FORCE_COLOR-unset} TERM=${TERM-unset} COLORTERM=${COLORTERM-unset} NODE_OPTIONS=${NODE_OPTIONS-unset} AGENTIC_NODE_MODE=${AGENTIC_NODE_MODE-unset}"; }
# Diagnostics only (never used for captured cases): extra env, e.g. AN_EXTRA="AGENTIC_NODE_DIR=/elsewhere"
[ -n "${AN_EXTRA:-}" ] && export $AN_EXTRA
