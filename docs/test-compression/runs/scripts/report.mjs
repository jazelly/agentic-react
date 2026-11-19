// Token report over all captured cases. o200k_base via gpt-tokenizer.
// Usage: node report.mjs <bench-arms dir>   (prints markdown)
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base'
const A = process.argv[2]
const EXCLUDE = { 'next-turbopack-boilerplate/playwright-e2e-port5432-conflict': 'host port conflict, not a task scenario',
  'astro-web-check/dev-yarn-engines-refusal': 'host Node version refused by yarn engines, not a task scenario',
  'next-turbopack-boilerplate/validation-counter-range-check': 'empty output (check prints nothing)' }
const TYPE = { 'ssr-home-background-window-check': 'build / typecheck', 'ssr-home-background-window-check-boss': 'build / typecheck', 'c-e2e-playwright': 'tests passing' }
const type = (c) => TYPE[c] ?? (/browser/.test(c) ? 'browser console' : /(^|-)dev(server)?(-|$)|devserver/.test(c) ? 'dev server' : /build|typecheck/.test(c) ? 'build / typecheck' : /happy/.test(c) ? 'tests passing' : 'tests failing')
const tok = (p) => existsSync(p) ? countTokens(readFileSync(p, 'utf8')) : null
const rows = []
for (const repo of readdirSync(A).filter((d) => !['scripts', 'diag'].includes(d)).sort()) {
  for (const f of readdirSync(join(A, repo)).filter((f) => f.endsWith('.control.txt')).sort()) {
    const c = f.replace('.control.txt', ''), b = join(A, repo, c)
    rows.push({ repo, c, key: `${repo}/${c}`, t: type(c), ctl: tok(`${b}.control.txt`), an: tok(`${b}.agentic-node.txt`), ar: tok(`${b}.agentic-react.txt`), both: tok(`${b}.both.txt`) })
  }
}
const pct = (a, b) => (b ? `${(((b - a) / b) * 100).toFixed(1)}%` : '-')
const fmt = (n) => (n == null ? '' : n.toLocaleString('en-US'))
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const inc = rows.filter((r) => !EXCLUDE[r.key])
const out = []
out.push('### All cases', '', '| Repo / case | Type | control | agentic-node (measured) | saved | agentic-react (target) | saved | both (estimate) | saved |', '|---|---|---:|---:|---:|---:|---:|---:|---:|')
for (const r of rows) out.push(`| ${r.key}${EXCLUDE[r.key] ? ' (excluded)' : ''} | ${r.t} | ${fmt(r.ctl)} | ${fmt(r.an)} | ${pct(r.an, r.ctl)} | ${fmt(r.ar)} | ${r.ar == null ? '' : pct(r.ar, r.ctl)} | ${fmt(r.both)} | ${r.both == null ? '' : pct(r.both, r.ctl)} |`)
out.push('', 'Excluded from totals: ' + Object.entries(EXCLUDE).map(([k, v]) => `\`${k}\` (${v})`).join('; ') + '.', '')
const sum = (xs, k) => xs.reduce((s, r) => s + r[k], 0)
const ratio = (xs, k) => med(xs.filter((r) => r.ctl > 0).map((r) => r[k] / r.ctl))
out.push('### agentic-node vs control, all included cases (measured)', '', '| Group | Cases | control | agentic-node | saved | saved % (sum) | median per-case saving |', '|---|---:|---:|---:|---:|---:|---:|')
const grp = (name, xs) => out.push(`| ${name} | ${xs.length} | ${fmt(sum(xs, 'ctl'))} | ${fmt(sum(xs, 'an'))} | ${fmt(sum(xs, 'ctl') - sum(xs, 'an'))} | ${pct(sum(xs, 'an'), sum(xs, 'ctl'))} | ${((1 - ratio(xs, 'an')) * 100).toFixed(1)}% |`)
grp('**all**', inc)
const noBig = inc.filter((r) => r.key !== 'webpack-portainer/c-alias-build-fail')
grp('all except portainer webpack build', noBig)
for (const t of ['tests passing', 'tests failing', 'build / typecheck', 'dev server', 'browser console']) grp(`type: ${t}`, inc.filter((r) => r.t === t))
for (const repo of [...new Set(inc.map((r) => r.repo))]) grp(`repo: ${repo}`, inc.filter((r) => r.repo === repo))
const tg = inc.filter((r) => r.ar != null)
out.push('', '### The six cases with an agentic-react target', '', '| Arm | control | arm | saved | saved % (sum) | median per-case saving |', '|---|---:|---:|---:|---:|---:|')
for (const [n, k] of [['agentic-node (measured)', 'an'], ['agentic-react (target)', 'ar'], ['both (estimate)', 'both']])
  out.push(`| ${n} | ${fmt(sum(tg, 'ctl'))} | ${fmt(sum(tg, k))} | ${fmt(sum(tg, 'ctl') - sum(tg, k))} | ${pct(sum(tg, k), sum(tg, 'ctl'))} | ${((1 - ratio(tg, k)) * 100).toFixed(1)}% |`)
console.log(out.join('\n'))
