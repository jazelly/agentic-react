// node next-warmnotes.mjs <repo-dir> : for each <case>.<arm>.meta.txt, scan warmup/<case>.<arm>.txt for known one-off lines
// that do not appear in the capture, and append one "warm-up printed:" line to the meta (idempotent).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const pats = [
  [/This command stopped to show the upgrade recommendation/, "Next 16.4's agent-addressed security-upgrade prompt, then the dev server exited (instructions not followed)"],
  [/Generated AGENTS\.md( and CLAUDE\.md)?/, (m) => `Next '${m[0]}' (one-time agent-file generation)`],
  [/Re-optimizing dependencies because[^\n]*/, (m) => `Vite '${m[0].trim()}'`],
  [/new dependencies optimized[^\n]*/, (m) => `Vite '${m[0].trim()}'`],
  [/\[goto-failed\][^\n]*/, (m) => `browser: '${m[0].trim()}'`],
];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.meta.txt'))) {
  const base = f.replace(/\.meta\.txt$/, '');
  const w = join(dir, 'warmup', base + '.txt'), cap = join(dir, base + '.txt');
  if (!existsSync(w)) continue;
  const wt = readFileSync(w, 'utf8'), ct = existsSync(cap) ? readFileSync(cap, 'utf8') : '';
  const hits = [];
  for (const [re, label] of pats) { const m = wt.match(re); if (m && !ct.match(re)) hits.push(typeof label === 'function' ? label(m) : label); }
  let meta = readFileSync(join(dir, f), 'utf8').replace(/^warm-up printed:.*\n/m, '');
  meta += `warm-up printed: ${hits.length ? hits.join('; ') + ' (absent from the capture)' : 'no known one-off lines beyond what the capture also shows (see warmup file)'}\n`;
  writeFileSync(join(dir, f), meta);
}
