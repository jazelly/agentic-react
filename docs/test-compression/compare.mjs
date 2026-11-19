// Token counts (o200k_base) for real captures (before/) vs hand-written target digests (after/).
// Usage: npm i --no-save gpt-tokenizer@4.1.2 && node docs/test-compression/compare.mjs
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base'
const S = dirname(fileURLToPath(import.meta.url))
const r = (p) => readFileSync(p, 'utf8')
const strip = (t) => t.replace(/\n?\(node:\d+\) Warning: The 'NO_COLOR'[^\n]*\n\(Use `node --trace-warnings[^\n]*\n/g, '')
const before = (n) => r(`${S}/before/${n}.txt`)
const rows = [
  ['playwright-pass', strip(before('playwright-pass'))],
  ['playwright-fail', strip(before('playwright-fail'))],
  ['cypress-pass', before('cypress-pass')],
  ['cypress-fail', before('cypress-fail')],
  ['rtl-unable-to-find', before('rtl-unable-to-find')],
  ['rtl-pass-warnings', before('rtl-pass-warnings')],
  ['vitest-browser-fail', before('vitest-browser-fail')],
  ['hydration-mismatch-console', before('hydration-mismatch-console')],
  ['vite-compile-error.agent', before('vite-compile-error.agent')],
  ['webpack-compile-error', before('webpack-compile-error')],
]
console.log('| case | before | after (target) | change |')
console.log('| --- | ---: | ---: | ---: |')
for (const [n, b] of rows) {
  const a = r(`${S}/after/${n}.txt`); const tb = countTokens(b), ta = countTokens(a)
  console.log(`| ${n} | ${tb} | ${ta} | ${((ta / tb - 1) * 100).toFixed(1)}% |`)
}
const pf = countTokens(strip(before('playwright-fail'))) + countTokens(before('playwright-fail.error-context'))
console.log('playwright-fail + error-context', pf)
console.log('rtl colors-false', countTokens(before('rtl-unable-to-find.colors-false')))
console.log('rtl agent', countTokens(before('rtl-pass-warnings.agent')))
