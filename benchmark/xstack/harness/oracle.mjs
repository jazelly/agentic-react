// Oracle validation: for each task x applicable stack:
//   initial state  -> hidden verifier must FAIL   (unless task.initialPasses)
//   reference sol. -> hidden verifier must PASS
// usage: node harness/oracle.mjs [taskFilter] [--stacks a,b] [--concurrency 2] [--keep]
import fs from 'node:fs';
import path from 'node:path';
import { listTasks, STACK_IDS, stackStatus, materialize, applySolution, verify, WORK, RESULTS, rmrf } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const filter = args.find((a, i) => !a.startsWith('--') && !['--stacks', '--concurrency'].includes(args[i - 1]));
const stacks = opt('--stacks', STACK_IDS.join(',')).split(',');
const conc = Number(opt('--concurrency', '2'));
const keep = args.includes('--keep');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(RESULTS, { recursive: true });
const outFile = path.join(RESULTS, `oracle-${stamp}.jsonl`);

const jobs = [];
for (const task of listTasks(filter)) for (const s of stacks) {
  const st = stackStatus(task, s);
  if (st.status !== 'applicable') { console.log(`skip ${task.id} @ ${s}: ${st.status} (${st.reason ?? ''})`); continue; }
  jobs.push({ task, s });
}

async function one({ task, s }) {
  const base = path.join(WORK, 'oracle', `${task.id.replace(/\//g, '__')}__${s}`);
  const rec = { task: task.id, stack: s, stamp };
  const t0 = Date.now();
  try {
    materialize(task, s, path.join(base, 'ws'));
    const before = await verify(task, s, path.join(base, 'ws'), { logDir: path.join(base, 'logs-initial') });
    applySolution(task, s, path.join(base, 'ws'));
    const after = await verify(task, s, path.join(base, 'ws'), { logDir: path.join(base, 'logs-solution') });
    rec.initial = before.success; rec.solution = after.success;
    rec.ok = after.success && (task.initialPasses ? true : !before.success);
    rec.failedSteps = { initial: before.steps.filter((x) => !x.ok).map((x) => x.type), solution: after.steps.filter((x) => !x.ok).map((x) => ({ type: x.type, detail: x.detail.slice(-600) })) };
  } catch (e) { rec.ok = false; rec.error = String(e.stack ?? e).slice(0, 1500); }
  rec.sec = Math.round((Date.now() - t0) / 1000);
  fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
  console.log(`${rec.ok ? 'PASS' : 'FAIL'} ${task.id} @ ${s}  initial=${rec.initial ? 'pass' : 'fail'} solution=${rec.solution ? 'pass' : 'fail'} ${rec.sec}s${rec.error ? ' ERROR ' + rec.error.split('\n')[0] : ''}`);
  if (!rec.ok && rec.failedSteps?.solution?.length) for (const f of rec.failedSteps.solution) console.log(`     solution ${f.type}: ${f.detail.replace(/\s+/g, ' ').slice(-300)}`);
  if (!keep) rmrf(path.join(base, 'ws')); // logs are kept under work/oracle/
}

const queue = [...jobs];
await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await one(queue.shift()); }));
console.log(`\nresults: ${outFile}`);
