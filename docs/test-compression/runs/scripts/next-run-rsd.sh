#!/bin/bash
# rsbuild-rsdoctor cases, both arms back to back per case.
M=$(cd "$(dirname "$0")" && pwd); C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
R=rsbuild-rsdoctor
TV="pnpm 12.6.0 via corepack, @rstest/core 0.12.5, @rstackjs/cli 0.9.0 (rs), @rsbuild/core 2.3.1, @rspack/core 2.3.1, react 19.3.1"
c_build() { local arm=$1
  WS=$C/rsd-imp TOOLS="$TV, @rslib 1.0.5 for workspace deps" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/rsd-imp (prepareWorkspace with the task edit Size -> Sizes as Size; reused from the previous pass, edit verified). Command = manifest @build, cwd workspace root (CI unset; runChecks would set CI=1)." \
  "$M/next-cap.sh" $R build-broken-import $arm $C/rsd-imp $R/build-broken-import -- "corepack pnpm --filter '@rsdoctor/client...' build"
}
c_dev() { local arm=$1
  WS=$C/rsd-imp READY='Local:|error' TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/rsd-imp (task edit applied). Dev command = manifest @dev with '--port 5320' appended, cwd workspace root." \
  DEVNOTES="the final pnpm ELIFECYCLE exit 143 trailer (if present) is caused by our SIGTERM, not by the build error." \
  "$M/next-devcap.sh" $R build-broken-import-dev build-broken-import-browser $arm $C/rsd-imp $R/build-broken-import "http://localhost:5320/" -- "corepack pnpm --filter @rsdoctor/client dev --port 5320"
}
c_rstest() { local arm=$1
  WS=$C/rsd-happy TOOLS="$TV" \
  DEVIATIONS="Previous pass ran this in benchmark/repos/$R; now run in a fresh scratch copy benchmark/runs/caps/rsd-happy (task-kit prepareWorkspace, no edits) so agentic-node's .agentic-node logs and any tool caches never touch benchmark/repos. Absolute paths in output therefore show runs/caps/rsd-happy." \
  "$M/next-cap.sh" $R rstest-happy $arm $C/rsd-happy - -- "corepack pnpm --filter @rsdoctor/client test"
}
c_sort() { local arm=$1
  WS=$C/rsd-sort TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/rsd-sort (prepareWorkspace with the task edit swapping a/b in the comparator). cwd = appRoot packages/client as task-kit runChecks does for non-@ commands; CI unset (runChecks would set CI=1)." \
  "$M/next-cap.sh" $R state-bundle-size-sort-order-check $arm $C/rsd-sort/packages/client $R/state-bundle-size-sort-order -- "corepack pnpm --filter @rsdoctor/client test -- module-tree-sort"
}
for c in ${CASES:-build dev rstest sort}; do for arm in control agentic-node; do c_$c $arm; done; done
