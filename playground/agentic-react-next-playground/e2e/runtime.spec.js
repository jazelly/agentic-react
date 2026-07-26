import { expect, test } from '@playwright/test';

const bridgePort = process.env.AGENTIC_REACT_NEXT_BRIDGE_PORT || '51426';
const MCP_SERVER_URL = `http://127.0.0.1:${bridgePort}/mcp`;

const createMcpClient = async () => {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ]);
  const client = new Client({
    name: 'next-playground-mcp-e2e',
    version: '0.0.0',
  });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  await client.connect(transport);
  return { client, transport };
};

const parseToolResponse = (result) => {
  const textContent = result.content.find((content) => content.type === 'text');
  if (!textContent || typeof textContent.text !== 'string') {
    return null;
  }
  return JSON.parse(textContent.text);
};

const installClipboardStub = async (page) => {
  await page.evaluate(() => {
    window.__AGENTIC_REACT_TEST_CLIPBOARD__ = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__AGENTIC_REACT_TEST_CLIPBOARD__ = String(text);
        },
      },
    });
  });
};

test('next playground injects runtime globals', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const runtimeShape = await page.evaluate(() => ({
    hasRuntime: Boolean(window.__AGENTIC_REACT__),
    hasTools: Boolean(window.__AGENTIC_REACT_TOOLS__),
    hasSelectionMode: typeof window.__AGENTIC_REACT__?.setSelectionMode,
    hasGetContext: typeof window.__AGENTIC_REACT__?.getLastSelectionContext,
    hasCopyContext: typeof window.__AGENTIC_REACT__?.copyLastSelectionContext,
    hasRegisterTuningModalExtension:
      typeof window.__AGENTIC_REACT__?.registerTuningModalExtension,
    tuningSurfaceClassName:
      window.__AGENTIC_REACT_CONFIG__?.toolkit?.tuningModal?.classNames
        ?.surface,
    tuningPanelClassName:
      window.__AGENTIC_REACT_CONFIG__?.toolkit?.tuningModal?.classNames?.panel,
    unregisterType: (() => {
      const unregister =
        window.__AGENTIC_REACT__?.registerTuningModalExtension({
          id: 'next-runtime-smoke',
        });
      unregister?.();
      return typeof unregister;
    })(),
  }));

  expect(runtimeShape.hasRuntime).toBe(true);
  expect(runtimeShape.hasTools).toBe(true);
  expect(runtimeShape.hasSelectionMode).toBe('function');
  expect(runtimeShape.hasGetContext).toBe('function');
  expect(runtimeShape.hasCopyContext).toBe('function');
  expect(runtimeShape.hasRegisterTuningModalExtension).toBe('function');
  expect(runtimeShape.tuningSurfaceClassName).toBe(
    'next-playground-tuning-surface',
  );
  expect(runtimeShape.tuningPanelClassName).toBe(
    'next-playground-tuning-panel',
  );
  expect(runtimeShape.unregisterType).toBe('function');
});

test('next playground MCP tools return expected outcomes', async ({ page }) => {
  const legacySourceLookupRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/__agentic_react_source') {
      legacySourceLookupRequests.push(request.url());
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await installClipboardStub(page);

  const { client, transport } = await createMcpClient();
  try {
    const htmlMatchesRaw = await client.callTool({
      name: 'get-html-elements',
      arguments: {
        queries: ['next-copy-target'],
        maxMatches: 3,
      },
    });
    const htmlMatches = parseToolResponse(htmlMatchesRaw);
    expect(htmlMatches.success).toBe(true);
    expect(htmlMatches.count).toBeGreaterThan(0);
    expect(htmlMatches.matches[0].selector).toBe('#next-copy-target');

    const reactSourceRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['next-copy-target'],
        maxMatches: 3,
        includeSourceSnippets: true,
      },
    });
    const reactSource = parseToolResponse(reactSourceRaw);
    expect(reactSource.success).toBe(true);
    expect(reactSource.chosenMatch.selector).toBe('#next-copy-target');
    expect(reactSource.context).toBeTruthy();

    const noMatchRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['text-not-present-in-next-playground'],
      },
    });
    const noMatch = parseToolResponse(noMatchRaw);
    expect(noMatch.success).toBe(false);
    expect(noMatch.reason).toContain('No element matched');
    expect(noMatch.context).toBeNull();

    const enableSelectionRaw = await client.callTool({
      name: 'set-selection-mode',
      arguments: { enabled: true },
    });
    const enableSelection = parseToolResponse(enableSelectionRaw);
    expect(enableSelection.success).toBe(true);
    expect(enableSelection.enabled).toBe(true);

    const contextBeforeSelectionRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 3,
        maxFiles: 3,
      },
    });
    const contextBeforeSelection = parseToolResponse(contextBeforeSelectionRaw);
    expect(contextBeforeSelection.success).toBe(false);
    expect(contextBeforeSelection.context).toBeNull();

    await page.locator('#next-copy-target').click();
    await expect(
      page.locator('[data-agentic-react-selected-label="true"]'),
    ).toBeVisible();
    const pendingContextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 3,
        maxFiles: 3,
      },
    });
    const pendingContext = parseToolResponse(pendingContextRaw);
    expect(pendingContext.success).toBe(false);
    expect(pendingContext.context).toBeNull();

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForFunction(
      () =>
        window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
        '#next-copy-target',
    );
    const contextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 3,
        maxFiles: 3,
      },
    });
    const context = parseToolResponse(contextRaw);
    expect(context.success).toBe(true);
    expect(context.context.selector).toBe('#next-copy-target');

    const copyRaw = await client.callTool({
      name: 'copy-last-selection-context',
      arguments: { format: 'json' },
    });
    const copyResponse = parseToolResponse(copyRaw);
    expect(copyResponse.success).toBe(true);
    expect(copyResponse.copied).toBe(true);
    expect(legacySourceLookupRequests).toEqual([]);
  } finally {
    await transport.close();
  }
});
