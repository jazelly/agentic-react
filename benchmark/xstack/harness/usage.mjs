// Parse agent transcripts (subscription mode: no API key; token counts come from the CLI's own event stream).
import fs from 'node:fs';
const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const len = (x) => (typeof x === 'string' ? x.length : Array.isArray(x) ? x.reduce((n, c) => n + (c?.type === 'text' ? (c.text ?? '').length : JSON.stringify(c ?? '').length), 0) : JSON.stringify(x ?? '').length);

/** Claude Code `claude -p --output-format stream-json --verbose` */
export function parseClaude(file) {
  const ev = lines(file);
  const init = ev.find((e) => e.type === 'system' && e.subtype === 'init') ?? {};
  const result = [...ev].reverse().find((e) => e.type === 'result') ?? {};
  const assistant = ev.filter((e) => e.type === 'assistant');
  const toolUses = assistant.flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  const toolResults = ev.filter((e) => e.type === 'user').flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : [])).filter((c) => c.type === 'tool_result');
  const u = result.usage ?? {};
  return {
    model_reported: init.model ?? null,
    mcp_servers: init.mcp_servers ?? null,
    input_tokens: u.input_tokens ?? null,
    cache_read_input_tokens: u.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
    output_tokens: u.output_tokens ?? null, // includes thinking; Claude Code does not split reasoning out
    reasoning_tokens: null,
    total_input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    model_usage: result.modelUsage ?? null, // per-model breakdown (e.g. haiku side-calls)
    turns: result.num_turns ?? assistant.length,
    tool_calls: toolUses.length,
    mcp_tool_calls: toolUses.filter((t) => String(t.name).startsWith('mcp__')).length,
    tool_names: Object.fromEntries(Object.entries(toolUses.reduce((m, t) => ((m[t.name] = (m[t.name] ?? 0) + 1), m), {}))),
    tool_call_arg_chars: toolUses.reduce((n, t) => n + JSON.stringify(t.input ?? {}).length, 0),
    tool_output_chars: toolResults.reduce((n, t) => n + len(t.content), 0),
    notional_cost_usd: result.total_cost_usd ?? null, // API-price equivalent; NOT billed under a subscription
    agent_duration_ms: result.duration_ms ?? null,
    api_duration_ms: result.duration_api_ms ?? null,
    is_error: result.is_error ?? null,
    stop: result.subtype ?? null,
  };
}

/** Codex CLI `codex exec --json` (usage in turn.completed; reasoning_output_tokens is a subset of output_tokens) */
export function parseCodex(file) {
  const ev = lines(file);
  const turns = ev.filter((e) => e.type === 'turn.completed');
  const sum = (k) => turns.reduce((n, e) => n + (e.usage?.[k] ?? 0), 0);
  const items = ev.filter((e) => e.type === 'item.completed').map((e) => e.item ?? {});
  const tools = items.filter((i) => ['command_execution', 'mcp_tool_call', 'file_change', 'web_search'].includes(i.type));
  const out = sum('output_tokens'); const reasoning = sum('reasoning_output_tokens');
  return {
    model_reported: null,
    input_tokens: sum('input_tokens') - sum('cached_input_tokens'), // uncached part (codex input_tokens includes cached)
    cache_read_input_tokens: sum('cached_input_tokens'),
    cache_creation_input_tokens: null,
    output_tokens: out,
    reasoning_tokens: reasoning,
    total_input_tokens: sum('input_tokens'),
    turns: tools.length + 1, // approx: codex exec emits no per-request event; one model call per tool round + final
    tool_calls: tools.length,
    mcp_tool_calls: tools.filter((i) => i.type === 'mcp_tool_call').length,
    tool_names: tools.reduce((m, i) => { const k = i.type === 'mcp_tool_call' ? `mcp__${i.server}__${i.tool}` : i.type; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
    tool_call_arg_chars: tools.reduce((n, i) => n + JSON.stringify(i.command ?? i.arguments ?? i.changes ?? '').length, 0),
    tool_output_chars: tools.reduce((n, i) => n + len(i.aggregated_output ?? i.result ?? ''), 0),
    notional_cost_usd: null,
    errors: ev.filter((e) => e.type === 'error' || e.type === 'turn.failed').map((e) => JSON.stringify(e).slice(0, 300)),
  };
}
export const parseUsage = (agent, file) => (agent === 'codex' ? parseCodex(file) : parseClaude(file));
