// A/B agent runner. Agents run on the HOST with the user's own Claude Code / Codex subscription login (API-key env vars are stripped).
// Each run: fresh APFS clone of a pre-installed stack variant -> dev server + headless tab -> agent -> diff -> clean-room hidden verify.
// Network isolation is NOT enforced (host run). The agent only gets the workspace as cwd.
//
// usage: node harness/run.mjs --task <id|tag> --stack <id> --agent claude|codex [--arm baseline|agentic|both]
//          [--model sonnet|opus|haiku|gpt-6.1-sol|...] [--effort low|medium|high|xhigh] [--reps 1] [--timeout 1800] [--keep] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { listTasks, loadStack, stackStatus, materialize, verify, startServer, waitHttp, freePort, WORK, RESULTS, XS, PW_BROWSERS, sh, rmrf } from './lib.mjs';
import { parseUsage } from './usage.mjs';
import { mcpProbe } from './mcp-probe.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const agent = opt('--agent', 'claude');
const model = opt('--model', agent === 'codex' ? 'gpt-6.1-sol' : 'sonnet');
const effort = opt('--effort', agent === 'codex' ? 'medium' : null);
const arms = opt('--arm', 'both') === 'both' ? ['baseline', 'agentic'] : [opt('--arm')];
const reps = Number(opt('--reps', '1'));
const timeoutSec = Number(opt('--timeout', '1800'));
const keep = args.includes('--keep'); const dry = args.includes('--dry-run');
const tasks = listTasks(opt('--task')); const stackId = opt('--stack', 'vite-spa');
if (!tasks.length) throw new Error('no task matched');
const stack = loadStack(stackId);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const cliVersion = (() => { try { return execSync(`${agent === 'codex' ? 'codex' : 'claude'} --version`, { encoding: 'utf8' }).trim(); } catch { return null; } })();

function agentEnv() {
  const env = { ...process.env };
  // subscription mode: never let an API key take over billing
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'OPENAI_API_KEY', 'CODEX_API_KEY']) delete env[k];
  return env;
}

function prompt(task, ctx) {
  return `${task.prompt}

---
Project context (same for every run):
- Stack: ${stack.framework} / ${stack.bundler}. The app's UI code lives in ${stack.taskDir ?? 'src/ui'}/ (entry App.tsx). Package manager: pnpm (dependencies are already installed; do not add new ones unless required).
- A dev server is already running at ${ctx.url} (log file: ${ctx.devLog}). It hot-reloads on save.
- Useful scripts: \`pnpm build\` (production build), \`pnpm dev\` is already running.
- Work only inside the current directory. When you are done, stop.`;
}

function runAgent(ws, text, mcpUrl, transcript, stderrFile) {
  let cmd, argv, input = null;
  if (agent === 'claude') {
    const mcpFile = path.join(path.dirname(transcript), 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: mcpUrl ? { 'agentic-react': { type: 'http', url: mcpUrl } } : {} }));
    cmd = 'claude';
    argv = ['-p', text, '--output-format', 'stream-json', '--verbose', '--model', model, '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config', '--mcp-config', mcpFile, '--setting-sources', 'project', '--disable-slash-commands', '--no-session-persistence'];
    if (effort) argv.push('--effort', effort);
  } else {
    cmd = 'codex';
    argv = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '-C', ws, '-m', model,
      '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true', '-c', 'approval_policy="never"'];
    if (effort) argv.push('-c', `model_reasoning_effort="${effort}"`);
    if (mcpUrl) argv.push('-c', `mcp_servers.agentic-react.url="${mcpUrl}"`);
    argv.push('-'); input = text;
  }
  return new Promise((resolve) => {
    const out = fs.openSync(transcript, 'w'); const err = fs.openSync(stderrFile, 'w');
    const t0 = Date.now();
    const child = spawn(cmd, argv, { cwd: ws, env: agentEnv(), stdio: [input ? 'pipe' : 'ignore', out, err], detached: true });
    if (input) { child.stdin.write(input); child.stdin.end(); }
    let timedOut = false;
    const to = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} }, timeoutSec * 1000);
    child.on('exit', (code) => { clearTimeout(to); resolve({ code, timedOut, wall_ms: Date.now() - t0, argv: [cmd, ...argv.map((a) => (a === text ? '<prompt>' : a))] }); });
  });
}

async function mcpReady(url, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bench-probe', version: '0' } } }) });
      if (r.status < 400) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function one(task, arm, rep) {
  const st = stackStatus(task, stackId);
  if (st.status !== 'applicable') return console.log(`skip ${task.id}@${stackId}: ${st.status}`);
  if (arm === 'agentic' && !stack.agentic) return console.log(`skip agentic arm @${stackId}: no adapter (${stack.agentic_note ?? ''}) -> agentic == baseline`);
  const id = [stamp, task.id.replace(/\//g, '__'), stackId, `${agent}-${model}${effort ? '-' + effort : ''}`, arm, `r${rep}`].join('__');
  const runDir = path.join(WORK, 'runs', id); const ws = path.join(runDir, 'ws'); fs.mkdirSync(runDir, { recursive: true });
  const rec = { id, stamp, task: task.id, suite: task.suite, stack: stackId, arm, rep, agent, cli: cliVersion, model, effort, network_isolated: false };
  try {
    const m = materialize(task, stackId, ws, { variant: arm === 'agentic' ? 'agentic' : 'base' });
    rec.variant = m.variant;
    const port = await freePort(); const bridgePort = await freePort();
    const url = `http://127.0.0.1:${port}/`; const devLog = path.join(runDir, 'dev.log');
    const dev = startServer(stack.dev, { cwd: ws, port, logFile: devLog, env: { AGENTIC_REACT_BRIDGE_PORT: String(bridgePort) } });
    rec.dev_up = await waitHttp(url, 180_000);
    const keeper = spawn('node', [path.join(XS, 'harness', 'browser-keeper.mjs'), url], { stdio: ['ignore', fs.openSync(path.join(runDir, 'browser.log'), 'w'), 'inherit'], env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: PW_BROWSERS } });
    await new Promise((r) => setTimeout(r, 4000));
    let mcpUrl = null;
    if (arm === 'agentic') {
      mcpUrl = stack.agentic.mcp.replace('$PORT', String(port)).replace('$BRIDGE_PORT', String(bridgePort));
      rec.mcp_url = mcpUrl; rec.mcp_ready = await mcpReady(mcpUrl);
    }
    const text = prompt(task, { url, devLog });
    fs.writeFileSync(path.join(runDir, 'prompt.txt'), text);
    if (dry) { rec.dry_run = true; if (mcpUrl) { await new Promise((r) => setTimeout(r, 6000)); rec.mcp_probe = await mcpProbe(mcpUrl).catch((e) => ({ error: String(e) })); rec.mcp_probe_src = await mcpProbe(mcpUrl, 'get-react-source-code', { queries: ['API'] }).catch((e) => ({ error: String(e) })); } rec.browser_log = fs.readFileSync(path.join(runDir, 'browser.log'), 'utf8').slice(0, 800); }
    else {
      const r = await runAgent(ws, text, mcpUrl, path.join(runDir, 'transcript.jsonl'), path.join(runDir, 'agent.stderr'));
      Object.assign(rec, { exit_code: r.code, timed_out: r.timedOut, wall_ms: r.wall_ms, argv: r.argv });
      rec.usage = parseUsage(agent, path.join(runDir, 'transcript.jsonl'));
    }
    keeper.kill('SIGTERM'); dev.stop(); await new Promise((r) => setTimeout(r, 1500));
    // agent diff vs baseline (overlay is inside the baseline commit, so it never appears here)
    sh('git add -A', { cwd: ws });
    const patch = path.join(runDir, 'agent.patch');
    const d = sh(`git diff --cached --binary HEAD > "${patch}" && git diff --cached --numstat HEAD`, { cwd: ws });
    rec.diff_files = d.output.trim().split('\n').filter(Boolean).length;
    if (dry) { if (!keep) rmrf(ws); throw Object.assign(new Error('dry-run (no agent, no verify)'), { dry: true }); }
    // clean-room verify on a fresh BASE materialization (agentic adapter absent from graded build)
    const vws = path.join(runDir, 'verify-ws');
    materialize(task, stackId, vws, { variant: 'base' });
    let ap = fs.statSync(patch).size === 0 ? { ok: true } : sh(`git apply --whitespace=nowarn "${patch}"`, { cwd: vws });
    if (!ap.ok && m.overlayFiles.length) { ap = sh(`git apply --whitespace=nowarn ${m.overlayFiles.map((f) => `--exclude="${f}"`).join(' ')} "${patch}"`, { cwd: vws }); rec.overlay_files_excluded = m.overlayFiles; }
    rec.patch_applied = ap.ok;
    const v = ap.ok ? await verify(task, stackId, vws, { logDir: path.join(runDir, 'verify') }) : { success: false, steps: [{ type: 'apply', ok: false, detail: ap.output }] };
    rec.success = v.success; rec.steps = v.steps.map((s) => ({ type: s.type, ok: s.ok }));
    if (!keep) { rmrf(ws); rmrf(vws); }
  } catch (e) { if (!e.dry) rec.error = String(e.stack ?? e).slice(0, 1500); }
  fs.mkdirSync(RESULTS, { recursive: true });
  fs.appendFileSync(path.join(RESULTS, dry ? 'runs-dry.jsonl' : 'runs.jsonl'), JSON.stringify(rec) + '\n');
  fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(rec, null, 2));
  const u = rec.usage ?? {};
  console.log(`${rec.success ? 'PASS' : 'FAIL'} ${task.id}@${stackId} ${agent}/${model} ${arm} r${rep}  in=${u.total_input_tokens} out=${u.output_tokens} reason=${u.reasoning_tokens} turns=${u.turns} tools=${u.tool_calls} mcp=${u.mcp_tool_calls} toolout=${u.tool_output_chars} wall=${Math.round((rec.wall_ms ?? 0) / 1000)}s${rec.error ? ' ERROR ' + rec.error.split('\n')[0] : ''}`);
}

for (const task of tasks) for (let rep = 1; rep <= reps; rep++) for (const arm of arms) await one(task, arm, rep);
