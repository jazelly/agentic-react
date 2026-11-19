#!/bin/bash
O=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/bench-arms
W=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/ws
T=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/tasks/webpack-portainer
REPO=webpack-portainer SHA=66c22cf97b3afb4a3968753f7a70ac1924ec4ef0 NODEV=22.22.2
TOOLS="webpack 5.107.2, webpack-cli 6.0.1, vitest 4.1.8 (jsdom 24.1.3), vite 8.0.16, react 17.0.2, @testing-library/react 12.1.5, pnpm 10.26.2 (packageManager pin); agentic-node 0.2.0 @ 4e604d36ccc0c7b3b491a02c28f654e474bce60b (agentic-node arm only)"
BROWSER="n/a (jsdom / webpack build, no browser)"
source "$O/scripts/lib.sh"
OUTSIDE="Runs in a copy OUTSIDE the agentic-react monorepo (scratchpad/ws): inside benchmark/repos vite-tsconfig-paths walks up into the agentic-react pnpm workspace and prints a ~40-line TSConfckParseError (layout artifact). Install was pnpm install --ignore-workspace --no-frozen-lockfile per manifest, lockfile restored to pinned version (previous pass)."
only=${1:-all}
if [ $only = all ] || [ $only = a ]; then
cmdcase a-components-happy - "$W/portainer-base" "pnpm --ignore-workspace exec vitest run app/react/components" "$OUTSIDE" "Slice app/react/components (63 test files)." "git status --porcelain | grep -q . && echo DIRTY >&2; true"
fi
if [ $only = all ] || [ $only = b ]; then
cmdcase b-addbutton-hidden-test-fail webpack-portainer/ui-add-button-default-label "$W/portainer-base" "pnpm --ignore-workspace exec vitest run app/react/components/buttons" "$OUTSIDE" "Task has no setup edits (stock code is the bug). Hidden test copied to app/react/components/buttons/__bench__/ as runChecks does, removed afterwards. runChecks sets CI=1; CI unset here per brief." "mkdir -p app/react/components/buttons/__bench__ && cp $T/ui-add-button-default-label/hidden/AddButton.default-label.test.tsx app/react/components/buttons/__bench__/"
rm -rf "$W/portainer-base/app/react/components/buttons/__bench__"
cmdcase b-expandable-toggle-fail webpack-portainer/state-expandable-message-toggle "$W/portainer-state-expandable-message-toggle" "pnpm --ignore-workspace exec vitest run app/react/components/ExpandableMessageByLines.test.tsx" "$OUTSIDE (prepareWorkspace to a path outside the monorepo)" "The task's cmd check."
fi
if [ $only = all ] || [ $only = c ]; then
cmdcase c-alias-build-fail webpack-portainer/build-webpack-alias-resolution "$W/portainer-build-webpack-alias-resolution" "pnpm --ignore-workspace build" "$OUTSIDE (prepareWorkspace). dist/ deleted before every run (warm-up and captured) so each starts from the same tree; webpack/babel caches are WARM (warm-up run), unlike the previous pass's cold control capture." "The task cmd check (@build = webpack)." "rm -rf dist"
fi
