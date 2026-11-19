// node next-tokens.mjs <repo-dir>  -> writes <repo-dir>/TOKENS.md (o200k_base via gpt-tokenizer, raw capture bytes incl. ANSI)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/captures/');
const { countTokens } = req('gpt-tokenizer/encoding/o200k_base');
const dir = process.argv[2];
const cases = [...new Set(readdirSync(dir).filter((f) => /\.(control|agentic-node)\.txt$/.test(f)).map((f) => f.replace(/\.(control|agentic-node)\.txt$/, '')))].sort();
const tok = (c, arm) => { const p = join(dir, `${c}.${arm}.txt`); return existsSync(p) ? countTokens(readFileSync(p, 'utf8')) : null; };
const exit = (c, arm) => { const p = join(dir, `${c}.${arm}.meta.txt`); if (!existsSync(p)) return '-'; const m = readFileSync(p, 'utf8').match(/^exit code: (.*)$/m); return m ? m[1].replace(/^n\/a.*/, 'n/a (killed)').replace(/\|/g, '/') : '-'; };
const rows = cases.map((c) => {
  const a = tok(c, 'control'), b = tok(c, 'agentic-node');
  const saved = a != null && b != null ? a - b : null;
  const pct = saved != null ? (a ? ((saved / a) * 100).toFixed(1) + '%' : '-') : '-';
  return `| ${c} | ${a ?? '-'} | ${b ?? '-'} | ${saved ?? '-'} | ${pct} | ${exit(c, 'control')} | ${exit(c, 'agentic-node')} |`;
});
const out = [`# ${basename(dir)} token counts: control vs agentic-node`, '',
  'o200k_base via gpt-tokenizer on the raw capture files (ANSI bytes included). saved = control - agentic-node (negative = agentic-node output is larger).', '',
  '| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |',
  '| --- | ---: | ---: | ---: | ---: | --- | --- |', ...rows, ''].join('\n');
writeFileSync(join(dir, 'TOKENS.md'), out);
console.log(out);
