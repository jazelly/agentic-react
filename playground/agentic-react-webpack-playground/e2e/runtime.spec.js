import { expect, test } from '@playwright/test';

const MCP_SERVER_URL = `http://127.0.0.1:${process.env.AGENTIC_REACT_WEBPACK_PLAYGROUND_PORT || '51425'}/mcp`;

const createMcpClient = async () => {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ]);
  const client = new Client({
    name: 'webpack-playground-mcp-e2e',
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

test('webpack playground injects runtime globals', async ({ page }) => {
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
          id: 'webpack-runtime-smoke',
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
    'webpack-playground-tuning-surface',
  );
  expect(runtimeShape.tuningPanelClassName).toBe(
    'webpack-playground-tuning-panel',
  );
  expect(runtimeShape.unregisterType).toBe('function');
});

test('webpack playground MCP tools return expected outcomes', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  try {
    const htmlMatchesRaw = await client.callTool({
      name: 'get-html-elements',
      arguments: {
        queries: ['html'],
        maxMatches: 3,
      },
    });
    const htmlMatches = parseToolResponse(htmlMatchesRaw);
    expect(htmlMatches.success).toBe(true);
    expect(htmlMatches.count).toBeGreaterThan(0);
    expect(htmlMatches.matches[0].selector).toBeTruthy();

    const reactSourceRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['html'],
        maxMatches: 3,
        includeSourceSnippets: true,
      },
    });
    const reactSource = parseToolResponse(reactSourceRaw);
    expect(reactSource.success).toBe(true);
    expect(reactSource.chosenMatch.selector).toBeTruthy();
    expect(reactSource.context).toBeTruthy();

    const noMatchRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['text-not-present-in-webpack-playground'],
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

    const contextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 3,
        maxFiles: 3,
      },
    });
    const context = parseToolResponse(contextRaw);
    expect(context.success).toBe(false);
    expect(context.context).toBeNull();

    const copyRaw = await client.callTool({
      name: 'copy-last-selection-context',
      arguments: { format: 'json' },
    });
    const copyResponse = parseToolResponse(copyRaw);
    expect(copyResponse.success).toBe(false);
    expect(copyResponse.copied).toBe(false);
    expect(copyResponse.error).toContain('No selection context found');
  } finally {
    await transport.close();
  }
});

test('webpack selection captures the primary CTA as userland AppContent source', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await installClipboardStub(page);

  await page.evaluate(() => window.__AGENTIC_REACT__.setSelectionMode(true));
  const contextBeforeSelection = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(contextBeforeSelection).toBeNull();

  const primaryCta = page.locator('.primary-cta');
  await expect(primaryCta).toBeVisible();
  const ctaBox = await primaryCta.boundingBox();
  expect(ctaBox).toBeTruthy();
  await page.mouse.move(
    ctaBox.x + ctaBox.width / 2,
    ctaBox.y + ctaBox.height / 2,
  );

  const hoverLabel = page.locator('[data-agentic-react-hover-label="true"]');
  await expect(hoverLabel).toHaveText('<AppContent> in App.jsx:489');
  const hoverLabelBox = await hoverLabel.boundingBox();
  expect(hoverLabelBox).toBeTruthy();
  expect(hoverLabelBox.y + hoverLabelBox.height).toBeLessThanOrEqual(
    ctaBox.y,
  );

  await primaryCta.click();
  const selectedLabel = page.locator(
    '[data-agentic-react-selected-label="true"]',
  );
  await expect(selectedLabel).toHaveText('<AppContent> in App.jsx:489');
  const selectedLabelBox = await selectedLabel.boundingBox();
  expect(selectedLabelBox).toBeTruthy();
  expect(selectedLabelBox.y + selectedLabelBox.height).toBeLessThanOrEqual(
    ctaBox.y,
  );
  const pendingCommittedContext = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(pendingCommittedContext).toBeNull();

  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
      '.hero > .hero-copy > .primary-cta',
  );

  const runtimeContext = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(runtimeContext.componentName).toBe('AppContent');
  expect(runtimeContext.externalComponent).toBeNull();
  expect(runtimeContext.resolvedSources).toContainEqual(
    expect.objectContaining({
      componentName: 'AppContent',
      filePath: expect.stringContaining('src/App.jsx'),
      lineNumber: 489,
    }),
  );

  const { client, transport } = await createMcpClient();
  try {
    const selectedContextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 3,
        maxFiles: 2,
      },
    });
    const selectedContext = parseToolResponse(selectedContextRaw);
    expect(selectedContext.success).toBe(true);
    expect(selectedContext.summary).toContain('component: AppContent');
    expect(selectedContext.summary).toContain('src/App.jsx:489');
    expect(selectedContext.summary).not.toContain(
      'selected external component:',
    );
    expect(selectedContext.summary).not.toContain('component: a');
    expect(selectedContext.context.sourceSnippets).toContainEqual(
      expect.objectContaining({
        filePath: 'src/App.jsx',
        snippet: expect.stringContaining('className="primary-cta"'),
      }),
    );
  } finally {
    await transport.close();
  }
});
