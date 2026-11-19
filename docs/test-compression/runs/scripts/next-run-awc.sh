#!/bin/bash
# astro-web-check cases, both arms back to back per case.
M=$(cd "$(dirname "$0")" && pwd); C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
R=astro-web-check
TV="astro 7.4.2 (Vite inside), @astrojs/react, @astrojs/node adapter, yarn 1.22.22; node 24.15.0 is outside package engines (^22.23.4 || ^24.16.0 || >=26.3.0): deps installed with yarn --ignore-engines"
SSRWS="scratch workspace benchmark/runs/caps/awc-ssr (prepareWorkspace with task edit client:only=\"react\" -> client:load on HomeBackground; reused from the previous pass, edit verified). CI unset."
ISLWS="scratch workspace benchmark/runs/caps/awc-isl (task edit <Main client:only=\"react\" /> -> <Main />; reused, edit verified). Dev = manifest dev (yarn dev:astro) with --ignore-engines (yarn refuses on node 24.15) and --port 5331; page /check/example.com. Backend API (yarn dev:api on :3001) not started, as in the manifest dev command. CI unset."
c_build() { local arm=$1
  WS=$C/awc-happy TOOLS="$TV" DEVIATIONS="scratch workspace benchmark/runs/caps/awc-happy (no edits). Plain \`npx astro build\` (manifest build is \`yarn build\` = astro check && astro build, which yarn refuses on node 24.15 without --ignore-engines). CI unset." \
  "$M/next-cap.sh" $R astro-build-happy $arm $C/awc-happy - -- "npx astro build"
}
c_devhappy() { local arm=$1
  WS=$C/awc-happy TOOLS="$TV" DEVIATIONS="scratch workspace benchmark/runs/caps/awc-happy (no edits). dev = yarn --ignore-engines dev:astro --port 5334; one request to /check (curl). CI unset." \
  "$M/next-astrodev.sh" $R astro-dev-happy - $arm $C/awc-happy - "http://localhost:5334/check" -- "yarn --ignore-engines dev:astro --port 5334"
}
c_refusal() { local arm=$1
  WS=$C/awc-ssr TOOLS="$TV" DEVIATIONS="$SSRWS Previous pass captured this with the dev-server procedure; the command exits immediately, so it is now captured as a one-shot command." \
  NOTES="real output of the manifest dev command on this host: yarn 1 refuses to run any script because package.json engines.node excludes host Node 24.15.0." \
  "$M/next-cap.sh" $R dev-yarn-engines-refusal $arm $C/awc-ssr $R/ssr-home-background-window -- "yarn dev:astro --port 5330"
}
c_isl() { local arm=$1
  WS=$C/awc-isl TOOLS="$TV" DEVIATIONS="$ISLWS" \
  "$M/next-astrodev.sh" $R island-results-not-hydrated-dev island-results-not-hydrated-browser $arm $C/awc-isl $R/island-results-not-hydrated "http://localhost:5331/check/example.com" -- "yarn --ignore-engines dev:astro --port 5331"
}
c_ssrdev() { local arm=$1
  WS=$C/awc-ssr TOOLS="$TV" DEVIATIONS="$SSRWS dev = manifest dev with --ignore-engines and --port 5330, plus BOSS_SERVER=true so / is not redirected to /check and the injected bug runs." \
  "$M/next-astrodev.sh" $R ssr-home-background-window-dev ssr-home-background-window-browser $arm $C/awc-ssr $R/ssr-home-background-window "http://localhost:5330/" -- "BOSS_SERVER=true yarn --ignore-engines dev:astro --port 5330"
}
c_ssrdevdef() { local arm=$1
  WS=$C/awc-ssr TOOLS="$TV" DEVIATIONS="$SSRWS dev = manifest dev with --ignore-engines and --port 5330 (default env: GET / is redirected to /check, so the injected bug never executes)." \
  "$M/next-astrodev.sh" $R ssr-home-background-window-dev-default ssr-home-background-window-browser-default $arm $C/awc-ssr $R/ssr-home-background-window "http://localhost:5330/" -- "yarn --ignore-engines dev:astro --port 5330"
}
c_check() { local arm=$1
  WS=$C/awc-ssr TOOLS="$TV" DEVIATIONS="$SSRWS" NOTES="task grading build with the bug injected; astro.config.mjs redirects / -> /check unless BOSS_SERVER=true, so the broken page is never prerendered." \
  "$M/next-cap.sh" $R ssr-home-background-window-check $arm $C/awc-ssr $R/ssr-home-background-window -- "npx astro build"
}
c_checkboss() { local arm=$1
  WS=$C/awc-ssr TOOLS="$TV" DEVIATIONS="$SSRWS BOSS_SERVER=true added so the index page is prerendered and the bug runs." \
  "$M/next-cap.sh" $R ssr-home-background-window-check-boss $arm $C/awc-ssr $R/ssr-home-background-window -- "BOSS_SERVER=true npx astro build"
}
for c in ${CASES:-build devhappy refusal isl ssrdev ssrdevdef check checkboss}; do for arm in control agentic-node; do c_$c $arm; done; done
