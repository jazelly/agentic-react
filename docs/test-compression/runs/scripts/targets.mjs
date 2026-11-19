// Builds hand-specified agentic-react target digests from real captures.
// For each case: <case>.agentic-react.txt (target, from the control capture) and
// <case>.both.txt (estimate, same replacement applied to the agentic-node capture).
// Only the part agentic-react owns is replaced; every other line is kept exactly as captured.
// These are NOT outputs of any implementation.
import { readFileSync, writeFileSync } from 'node:fs'
const A = process.argv[2]
const LOG = '[agentic-react] full output: node_modules/.cache/agentic-react/logs/<MMDD-HHMMSS>-<pid>.log'
const strip = (t) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
const lines = (t) => t.split('\n')
const findLine = (L, re, from = 0) => { for (let i = from; i < L.length; i++) if (re.test(strip(L[i]))) return i; return -1 }
const must = (i, what) => { if (i < 0) throw new Error('marker not found: ' + what); return i }

const cases = {
  'webpack-portainer/c-alias-build-fail': (t, ctl) => {
    const L = lines(t), C = strip(ctl)
    const s = must(findLine(L, /^assets by /), 'assets'), e = must(findLine(L, /^webpack [\d.]+ compiled with/), 'compiled')
    const specs = [...C.matchAll(/Can't resolve '([^']+)'/g)].map((m) => m[1])
    const prefix = (x) => (x.startsWith('@@/') ? '@@/' : x.startsWith('@/') ? '@/' : x.split('/')[0] + '/')
    const by = {}; for (const x of specs) (by[prefix(x)] ??= []).push(x)
    const top = (arr, n) => Object.entries(arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} x${v}`).join(', ')
    const groups = Object.entries(by).sort((a, b) => b[1].length - a[1].length)
      .map(([p, arr]) => `  '${p}...' x${arr.length}  top: ${top(arr, 3)}`)
    const first = C.match(/ERROR in \.\/(\S+) (\d+):[^\n]*\nModule not found: Error: Can't resolve '([^']+)'/)
    const out = [strip(L[e]).trim(),
      `ERROR Module not found x${specs.length}; every unresolved specifier uses a path alias:`, ...groups,
      `  webpack resolve: alias has no '@', '@@' or '@api' entry; resolve.tsconfig is not set`,
      `  first: ${first[1]}:${first[2]} imports '${first[3]}'`,
      `  asset/module summary and all ${specs.length} errors with import chains: see log`, LOG]
    return [...L.slice(0, s), ...out, ...L.slice(e + 1)].join('\n')
  },
  'webpack-portainer/b-addbutton-hidden-test-fail': (t) => {
    const L = lines(t)
    const s = must(findLine(L, /^TestingLibraryElementError/), 'rtl')
    let e = -1; for (let i = s; i < L.length; i++) if (strip(L[i]).trim() === '</body>') e = i
    must(e, '</body>')
    return [...L.slice(0, s),
      'TestingLibraryElementError: Unable to find text "Create"',
      '  closest text: "Add" in <a data-cy="bench-add-button"> <AddButton> app/react/components/buttons/AddButton.tsx:26 (via <Button>, <Link>)',
      '    <div>Root</div>',
      '    <a class="btn btn-primary btn-sm" data-cy="bench-add-button">',
      '      <svg lucide-plus />',
      '      Add            <- closest',
      '    </a>',
      '  (findByText retried; same DOM on every retry. Full DOM in log)',
      '  ' + LOG, ...L.slice(e + 1)].join('\n')
  },
  'rsbuild-rsdoctor/build-broken-import': (t) => {
    const L = lines(t)
    const s = must(findLine(L, /^error\s+Build errors:/), 'build errors'), e = must(findLine(L, /^error\s+build failed in/), 'build failed')
    return [...L.slice(0, s),
      'error   Build errors (1 root cause, 3 reports):',
      "src/pages/Plugins/index.tsx:8:10  TS2724: '\"../../constants\"' has no exported member named 'Sizes'. Did you mean 'Size'?",
      "  >  8 | import { Sizes as Size } from '../../constants';",
      '       |          ^^^^^',
      "  same import also fails linking at src/pages/Plugins/index.tsx:18 and :38 (ESModulesLinkingError, export 'Sizes' not found)",
      '  imported via src/diff.tsx > src/DiffApp.tsx > ... > src/pages/index.ts',
      L[e], LOG, ...L.slice(e + 1)].join('\n')
  },
  'tanstack-start-trellaux/b-hydration-browser-console': (t) => hydration(t, (d) => [
    `[pageerror] Hydration failed (text mismatch): server "${d.server}" vs client "${d.client}"`,
    '  at <span> in <Home> src/routes/index.tsx:18',
    '  via <MatchInnerImpl routeId="/"> < <OutletImpl> (TanStack Router)']),
  'next-turbopack-boilerplate/hydration-locale-switcher-browser': (t) => hydration(t, (d) => [
    `[pageerror] Hydration failed (text mismatch): server "${d.server}" vs client "${d.client}"`,
    '  at <option value="en"> in <LocaleSwitcher> src/components/LocaleSwitcher.tsx:33',
    '  via <BaseTemplate> < <Layout> (app/[locale] layout)'], true),
  'rr7-epic-stack/c-e2e-playwright': (t, ctl, arm) => {
    const L = lines(t), C = strip(t)
    const s = must(findLine(L, /^> react-router build/), 'rr build') + 1
    const r = must(findLine(L, /^Running \d+ tests? using/), 'running')
    const flags = [...C.matchAll(/`future\.(v8_\w+)` flag/g)].map((m) => m[1])
    const kinds = [...new Set(flags)]
    const mods = [...C.matchAll(/✓ (\d+) modules transformed/g)].map((m) => m[1])
    const empty = (C.match(/Generated an empty chunk/g) || []).length
    const build = [
      `React Router: Future Flag Warning x${kinds.length} kinds, each printed ${flags.length / kinds.length}x: ${kinds.join(', ')} (https://reactrouter.com/upgrading/future-flags)`,
      `vite client build ok: ${mods[0]} modules, ${empty} empty chunks, 1 sourcemap warning (react-router dom-export.mjs); ssr build ok: ${mods[1]} modules`,
      '  warning: source maps are enabled in production']
    if (arm === 'both') return [...L.slice(0, s), ...build, ...L.slice(r)].join('\n')
    const ws = L.slice(r).filter((l) => strip(l).replace(/^·/, '').startsWith('[WebServer]'))
    const n404 = [...new Set(ws.map(strip).filter((l) => / 404 /.test(l)).map((l) => l.match(/GET (\S+) 404/)?.[1]).filter(Boolean))]
    const passed = C.match(/(\d+) passed \(([\d.]+s)\)/)
    const warn = L.slice(r).filter((l) => /ExperimentalWarning/.test(l))
    return [...L.slice(0, s), ...build, ...warn,
      `playwright: ${passed[1]} passed (chromium, 1 worker) in ${passed[2]}`,
      `  web server: ${ws.length} lines (request log, mock emails), no errors; 404 responses: ${n404.join(', ')}`, LOG, ''].join('\n')
  },
}
function hydration(t, block, dedupeRefused = false) {
  let L = lines(t)
  const s = must(findLine(L, /^\[pageerror\] Error: Hydration failed/), 'pageerror')
  let e = s; for (let i = s + 1; i < L.length && !/^\[(log|info|error|warning|debug|pageerror)\]/.test(L[i]); i++) e = i
  const blk = L.slice(s, e + 1).map(strip)
  const client = blk.find((l) => /^\+\s{3,}\S/.test(l)).replace(/^\+\s+/, '').trim()
  const server = blk.find((l) => /^-\s{3,}\S/.test(l)).replace(/^-\s+/, '').trim()
  const frames = blk.filter((l) => /^\s+at /.test(l)).length
  const out = [...block({ client, server }),
    '  common causes: Date/locale formatting, Date.now()/Math.random(), typeof window branches. https://react.dev/link/hydration-mismatch',
    `  (react-dom frames x${frames} and full message in log)`]
  let rest = [...L.slice(0, s), ...out, ...L.slice(e + 1)]
  if (dedupeRefused) {
    const re = /^\[error\] Failed to load resource: net::ERR_CONNECTION_REFUSED$/
    const n = rest.filter((l) => re.test(l)).length
    let seen = false
    rest = rest.flatMap((l) => (re.test(l) ? (seen ? [] : ((seen = true), [`${l} (x${n}; URLs in log)`])) : [l]))
  }
  rest.push(LOG, '')
  return rest.join('\n')
}
for (const [c, f] of Object.entries(cases)) {
  const ctl = readFileSync(`${A}/${c}.control.txt`, 'utf8'), an = readFileSync(`${A}/${c}.agentic-node.txt`, 'utf8')
  writeFileSync(`${A}/${c}.agentic-react.txt`, f(ctl, ctl, 'agentic-react'))
  writeFileSync(`${A}/${c}.both.txt`, f(an, ctl, 'both'))
}
console.log('ok')
