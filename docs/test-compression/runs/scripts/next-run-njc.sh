#!/bin/bash
# next-webpack-jsoncrack cases, both arms back to back per case.
M=$(cd "$(dirname "$0")" && pwd); C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
R=next-webpack-jsoncrack
TV="turbo 2.10.10, next 16.3.5 (webpack), react 19.3.0, typescript 5.9.3, pnpm $(cd $C/njc-hyd && pnpm -v) (host pnpm; repo packageManager pnpm@10.20.0), vite (jsoncrack-react prebuild)"
PREAG='rm -f apps/www/AGENTS.md apps/www/CLAUDE.md'
c_wasm() { local arm=$1
  WS=$C/njc-wasm PRE="$PREAG" TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/njc-wasm (prepareWorkspace with the task edit: experiments line removed from next.config.js; reused from the previous pass, edit verified). Command = manifest @build, cwd = workspace root as task-kit does; CI unset (runChecks sets CI=1)." \
  "$M/next-cap.sh" $R build-webpack-wasm-config $arm $C/njc-wasm $R/build-webpack-wasm-config -- "pnpm exec turbo run build --filter=www..."
}
c_typecheck() { local arm=$1
  WS=$C/njc-title PRE="$PREAG" TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/njc-title (prepareWorkspace with task edit data?.name -> data.name). Command = manifest @typecheck, cwd workspace root; CI unset." \
  "$M/next-cap.sh" $R runtime-editor-title-crash-typecheck $arm $C/njc-title $R/runtime-editor-title-crash -- "pnpm --filter jsoncrack-react build && pnpm --filter www exec tsc --noEmit"
}
c_hyd() { local arm=$1
  WS=$C/njc-hyd PRE="$PREAG" READY='Ready in' VIEWPORT_W=375 TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/njc-hyd (prepareWorkspace with task setup.edits). Dev command = manifest @dev with --port 5310 appended (repo default 3000), cwd workspace root. Browser viewport 375x800 because the injected bug only diverges when window.innerWidth < 400. apps/www/AGENTS.md + CLAUDE.md removed before each arm's warm-up so Next's one-time agent-file generation lands in the warm-up." \
  "$M/next-devcap.sh" $R hydration-hero-cta-dev hydration-hero-cta-browser $arm $C/njc-hyd $R/hydration-hero-cta "http://localhost:5310/" -- "pnpm --filter jsoncrack-react build && pnpm --filter www dev --port 5310"
}
c_title() { local arm=$1
  WS=$C/njc-title PRE="$PREAG" READY='Ready in' TOOLS="$TV" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/njc-title (prepareWorkspace with task edit). Dev command = manifest @dev with --port 5311 appended, cwd workspace root; page /editor. apps/www/AGENTS.md + CLAUDE.md removed before each arm's warm-up." \
  "$M/next-devcap.sh" $R runtime-editor-title-crash-dev runtime-editor-title-crash-browser $arm $C/njc-title $R/runtime-editor-title-crash "http://localhost:5311/editor" -- "pnpm --filter jsoncrack-react build && pnpm --filter www dev --port 5311"
}
for c in ${CASES:-wasm typecheck hyd title}; do for arm in control agentic-node; do c_$c $arm; done; done
