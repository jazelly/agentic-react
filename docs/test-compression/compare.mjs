// o200k_base token counts: real benchmark captures (before/) vs hand-written target digests (after/).
// The after/ files are targets, not output of any implementation.
// Usage: npm i --no-save gpt-tokenizer@4.1.2 && node docs/test-compression/compare.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base'

const dir = dirname(fileURLToPath(import.meta.url))
console.log('| case | before | after (target) | change |\n| --- | ---: | ---: | ---: |')
for (const repo of readdirSync(join(dir, 'after'))) {
  for (const file of readdirSync(join(dir, 'after', repo))) {
    const b = countTokens(readFileSync(join(dir, 'before', repo, file), 'utf8'))
    const a = countTokens(readFileSync(join(dir, 'after', repo, file), 'utf8'))
    console.log(`| ${repo}/${file.replace(/\.txt$/, '')} | ${b} | ${a} | ${((a / b - 1) * 100).toFixed(1)}% |`)
  }
}
