// node prep.mjs <repo> <task-id-or-"happy"> <wsName>
import path from 'node:path';
import { prepareWorkspace, listTasks, RUNS } from '/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/lib/task-kit.mjs';
const [repo, t, name] = process.argv.slice(2);
const task = t === 'happy' ? { repo, setup: { edits: [] } } : listTasks(`${repo}/${t}`).find((x) => x.id === `${repo}/${t}`);
if (!task) throw new Error('no task ' + t);
const ws = path.join(RUNS, 'caps', name);
const r = prepareWorkspace(task, ws);
console.log(r.wsDir, r.appRoot);
