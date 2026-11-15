// Parse agent transcripts into the METRICS.md schema. Verify field names against the agent version you run.
import fs from 'node:fs';

const lines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

/** Claude Code: `claude -p --output-format stream-json --verbose` */
export function parseClaude(file) {
  const ev = lines(file);
  const result = ev.findLast?.((e) => e.type === 'result') ?? [...ev].reverse().find((e) => e.type === 'result');
  const assistant = ev.filter((e) => e.type === 'assistant');
  const toolResults = ev.filter((e) => e.type === 'user').flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_result');
  const toolUses = assistant.flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  const u = result?.usage ?? {};
  return {
    agent: 'claude-code',
    output_tokens: u.output_tokens ?? null,
    reasoning_tokens: null, // not reported separately by Claude Code; thinking is inside output_tokens
    completion_tokens: null,
    input_tokens: u.input_tokens ?? null,
    cached_input_tokens: (u.cache_read_input_tokens ?? 0) || null,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
    turns: result?.num_turns ?? assistant.length,
    tool_calls: toolUses.length,
    tool_call_arg_chars: toolUses.reduce((n, t) => n + JSON.stringify(t.input ?? {}).length, 0),
    tool_output_chars: toolResults.reduce((n, t) => n + JSON.stringify(t.content ?? '').length, 0),
    cost_usd: result?.total_cost_usd ?? null,
    duration_ms: result?.duration_ms ?? null,
  };
}

/** Codex CLI: `codex exec --json` (turn.completed carries usage; reasoning_output_tokens is included in output_tokens) */
export function parseCodex(file) {
  const ev = lines(file);
  const turns = ev.filter((e) => e.type === 'turn.completed');
  const sum = (k) => turns.reduce((n, e) => n + (e.usage?.[k] ?? 0), 0);
  const items = ev.filter((e) => e.type === 'item.completed').map((e) => e.item ?? {});
  const tools = items.filter((i) => ['command_execution', 'mcp_tool_call', 'file_change', 'web_search'].includes(i.type ?? i.item_type));
  const out = sum('output_tokens'); const reasoning = sum('reasoning_output_tokens');
  return {
    agent: 'codex',
    output_tokens: out, reasoning_tokens: reasoning, completion_tokens: out - reasoning,
    input_tokens: sum('input_tokens'), cached_input_tokens: sum('cached_input_tokens'), cache_creation_input_tokens: null,
    turns: tools.length + 1, // model calls ≈ tool rounds + final answer (codex does not emit per-request events)
    tool_calls: tools.length,
    tool_call_arg_chars: tools.reduce((n, i) => n + JSON.stringify(i.command ?? i.arguments ?? i.changes ?? '').length, 0),
    tool_output_chars: tools.reduce((n, i) => n + String(i.aggregated_output ?? i.result ?? '').length, 0),
    cost_usd: null, duration_ms: null,
  };
}

export const parseUsage = (agent, file) => (agent === 'codex' ? parseCodex(file) : parseClaude(file));
