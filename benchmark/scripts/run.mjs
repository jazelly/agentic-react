#!/usr/bin/env node
// Minimal A/B runner skeleton.
//   node scripts/run.mjs --task vite-shadcn-admin/runtime-tasks-status-crash --arm baseline --agent claude --reps 3
//   node scripts/run.mjs --task vite-shadcn-admin --arm both --agent codex       (substring filter, both arms)
// Writes runs/<stamp>/<task>/<arm>-<rep>/{transcript.jsonl,result.json} and appends to results/results.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listTasks, prepareWorkspace, runChecks, applyEdits, sh, BENCH, RUNS } from '../lib/task-kit.mjs';
import { parseUsage } from '../lib/usage.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const filter = arg('task', ''); const armArg = arg('arm', 'baseline'); const agent = arg('agent', 'claude');
const reps = Number(arg('reps', '1')); const dry = process.argv.includes('--dry-run');
const arms = armArg === 'both' ? ['baseline', 'agentic'] : [armArg];

// Agent command templates. {prompt_file} and {mcp_config} are substituted. Pin model + version in env for comparability.
const AGENTS = {
  claude: (p) => `claude -p "$(cat ${p.prompt_file})" --output-format stream-json --verbose --max-turns ${p.maxTurns} --permission-mode acceptEdits ${p.mcp_config ? `--mcp-config ${p.mcp_config}` : ''} ${process.env.ARB_MODEL ? `--model ${process.env.ARB_MODEL}` : ''}`,
  codex: (p) => `codex exec --json --skip-git-repo-check --sandbox workspace-write ${process.env.ARB_MODEL ? `-m ${process.env.ARB_MODEL}` : ''} "$(cat ${p.prompt_file})"`,
};

/** Arm B: enable agentic-react for this repo. TODO per bundler (see README "Arms"). */
function enableAgenticReact(ws, task, runDir) {
  const overlay = path.join(BENCH, 'arms', 'agentic', `${task.repo}.json`);
  if (fs.existsSync(overlay)) applyEdits(ws.appRoot, JSON.parse(fs.readFileSync(overlay, 'utf8')).edits);
  else console.warn(`  [agentic] no overlay arms/agentic/${task.repo}.json yet -> arm B == baseline for this repo`);
  // Agent-facing instructions (their tokens are billed to arm B).
  const snippet = fs.readFileSync(path.join(BENCH, 'arms', 'agentic', 'AGENTS.snippet.md'), 'utf8');
  for (const f of ['AGENTS.md', 'CLAUDE.md']) fs.appendFileSync(path.join(ws.wsDir, f), '\n' + snippet);
  // Fold the overlay into the scratch baseline so it is invisible to `git diff` and to only-changed checks.
  const g = 'git -c user.email=bench@local -c user.name=bench';
  sh(`${g} add -A && ${g} commit -q --amend --no-edit --no-verify`, { cwd: ws.wsDir, quiet: true });
  const mcp = path.join(runDir, 'mcp.json');
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { 'agentic-react': { type: 'http', url: process.env.ARB_MCP_URL ?? 'http://localhost:5173/mcp' } } }, null, 2));
  return mcp;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(path.join(BENCH, 'results'), { recursive: true });
for (const task of listTasks(filter)) for (const arm of arms) for (let rep = 1; rep <= reps; rep++) {
  const runDir = path.join(RUNS, stamp, task.id.replace('/', '__'), `${arm}-${rep}`);
  fs.mkdirSync(runDir, { recursive: true });
  const ws = prepareWorkspace(task, path.join(runDir, 'workspace'));
  const mcp_config = arm === 'agentic' ? enableAgenticReact(ws, task, runDir) : null;
  const prompt_file = path.join(runDir, 'prompt.md');
  fs.writeFileSync(prompt_file, task.prompt + '\n');
  const cmd = AGENTS[agent]({ prompt_file, mcp_config, maxTurns: task.budget?.maxTurns ?? 60 });
  console.log(`> ${task.id} [${arm} #${rep}] ${dry ? '(dry-run) ' : ''}${cmd.slice(0, 120)}…`);
  const transcript = path.join(runDir, 'transcript.jsonl');
  const t0 = Date.now();
  if (!dry) {
    const out = fs.openSync(transcript, 'w');
    spawnSync('bash', ['-lc', cmd], { cwd: ws.wsDir, stdio: ['ignore', out, 'inherit'], timeout: (task.budget?.timeoutMin ?? 30) * 60_000,
      env: { ...process.env, ...(arm === 'agentic' ? { AGENTIC_REACT_OUT: 'compact' } : { AGENTIC_REACT_OUT: 'raw' }) } });
    fs.closeSync(out);
  }
  const wall_ms = Date.now() - t0;
  const usage = dry ? {} : parseUsage(agent, transcript);
  const check = dry ? { success: null, steps: [] } : await runChecks(task, ws);
  const diffstat = sh('git diff --stat HEAD', { cwd: ws.wsDir, quiet: true }).output.trim().split('\n').pop();
  const row = { task: task.id, category: task.category, repo: task.repo, arm, rep, agent, model: process.env.ARB_MODEL ?? null, stamp,
    success: check.success, ...usage, wall_ms, diffstat, steps: check.steps };
  fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(row, null, 2));
  fs.appendFileSync(path.join(BENCH, 'results', 'results.jsonl'), JSON.stringify(row) + '\n');
  console.log(`  success=${row.success} output_tokens=${row.output_tokens ?? '-'} turns=${row.turns ?? '-'} wall=${Math.round(wall_ms / 1000)}s`);
}
