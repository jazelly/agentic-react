#!/usr/bin/env node
// Paired summary per task: median per arm, then overall median of per-task ratios (agentic / baseline). See METRICS.md.
import fs from 'node:fs';
import path from 'node:path';
import { BENCH } from '../lib/task-kit.mjs';

const file = process.argv[2] ?? path.join(BENCH, 'results', 'results.jsonl');
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const metrics = ['output_tokens', 'reasoning_tokens', 'turns', 'input_tokens', 'cached_input_tokens', 'tool_output_chars', 'wall_ms'];
const byTask = Map.groupBy ? Map.groupBy(rows, (r) => r.task) : rows.reduce((m, r) => m.set(r.task, [...(m.get(r.task) ?? []), r]), new Map());
const ratios = Object.fromEntries(metrics.map((m) => [m, []]));
console.log(['task', 'arm', 'n', 'success', ...metrics].join('\t'));
for (const [task, rs] of byTask) {
  const per = {};
  for (const arm of ['baseline', 'agentic']) {
    const a = rs.filter((r) => r.arm === arm); if (!a.length) continue;
    per[arm] = Object.fromEntries(metrics.map((m) => [m, med(a.map((r) => r[m]))]));
    console.log([task, arm, a.length, `${a.filter((r) => r.success).length}/${a.length}`, ...metrics.map((m) => per[arm][m] ?? '-')].join('\t'));
  }
  if (per.baseline && per.agentic) for (const m of metrics) if (per.baseline[m] && per.agentic[m] != null) ratios[m].push(per.agentic[m] / per.baseline[m]);
}
console.log('\nmedian per-task ratio agentic/baseline (lower is better):');
for (const m of metrics) console.log(`  ${m}: ${ratios[m].length ? med(ratios[m]).toFixed(3) : '-'} (n=${ratios[m].length} tasks)`);
const sr = (arm) => { const a = rows.filter((r) => r.arm === arm); return a.length ? `${a.filter((r) => r.success).length}/${a.length}` : '-'; };
console.log(`success: baseline ${sr('baseline')}, agentic ${sr('agentic')}`);
