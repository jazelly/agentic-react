// Minimal Streamable-HTTP MCP client: initialize -> tools/list -> tools/call (default get-component-tree).
export async function mcpProbe(url, tool = 'get-component-tree', toolArgs = {}) {
  let sid = null; let id = 0;
  const rpc = async (method, params, notify = false) => {
    const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (sid) h['mcp-session-id'] = sid;
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }) });
    sid = r.headers.get('mcp-session-id') ?? sid;
    const t = await r.text(); if (notify) return null;
    const m = t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((x) => x.id === id) : JSON.parse(t);
    return m;
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bench-probe', version: '0' } });
  await rpc('notifications/initialized', {}, true);
  const list = await rpc('tools/list', {});
  const call = await rpc('tools/call', { name: tool, arguments: toolArgs });
  return { tools: (list?.result?.tools ?? []).map((t) => t.name), callOk: !!call?.result && !call.result.isError, callText: JSON.stringify(call?.result ?? call?.error ?? null).slice(0, 400) };
}
