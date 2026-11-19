// usage: node tokens.mjs <OUT>/<repo>  -> writes <OUT>/<repo>/TOKENS.md
// o200k_base via gpt-tokenizer (installed in scratchpad/captures). Raw files, ANSI bytes included.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'
const req = createRequire('/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/captures/')
const { countTokens } = req('gpt-tokenizer/encoding/o200k_base')
const dir = process.argv[2]
const cases = [...new Set(readdirSync(dir).filter((f) => /\.control\.txt$/.test(f)).map((f) => f.replace(/\.control\.txt$/, '')))].sort()
const exit = (c, arm) => { const m = readFileSync(join(dir, `${c}.${arm}.meta.txt`), 'utf8').match(/^exit_code: (.*)$/m); return m ? (m[1].startsWith('n/a') ? 'n/a (dev server)' : m[1]) : '?' }
const rows = cases.map((c) => {
  const a = countTokens(readFileSync(join(dir, `${c}.control.txt`), 'utf8'))
  const b = existsSync(join(dir, `${c}.agentic-node.txt`)) ? countTokens(readFileSync(join(dir, `${c}.agentic-node.txt`), 'utf8')) : NaN
  const pct = a ? ((a - b) / a * 100).toFixed(1) + '%' : 'n/a'
  return `| ${c} | ${a} | ${b} | ${a - b} | ${pct} | ${exit(c, 'control')} | ${exit(c, 'agentic-node')} |`
})
const md = [`# ${basename(dir)}: control vs agentic-node`, '', 'o200k_base token counts (gpt-tokenizer) over the raw capture files, ANSI bytes included. saved = control - agentic-node.', '',
  '| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |', '| --- | ---: | ---: | ---: | ---: | --- | --- |', ...rows, ''].join('\n')
writeFileSync(join(dir, 'TOKENS.md'), md); console.log(md)
