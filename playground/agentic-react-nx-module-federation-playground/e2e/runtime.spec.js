import { expect, test } from '@playwright/test';

const shellPort = process.env.NX_MF_SHELL_PORT || '4200';
const catalogPort = process.env.NX_MF_CATALOG_PORT || '4201';
const profilePort = process.env.NX_MF_PROFILE_PORT || '4202';
const MCP_SERVER_URL = `http://127.0.0.1:${shellPort}/mcp`;
const REMOTE_ENTRY_URLS = [
  [`http://127.0.0.1:${catalogPort}/remoteEntry.js`, 'var catalog'],
  [`http://127.0.0.1:${profilePort}/remoteEntry.js`, 'var profile'],
];

const waitForRemoteEntries = async (request) => {
  for (const [remoteEntryUrl, expectedContainer] of REMOTE_ENTRY_URLS) {
    await expect
      .poll(
        async () => {
          const response = await request.get(remoteEntryUrl).catch(() => null);
          if (response?.status() !== 200) {
            return false;
          }
          return (await response.text()).includes(expectedContainer);
        },
        { timeout: 30000 },
      )
      .toBe(true);
  }
};

const createMcpClient = async () => {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ]);
  const client = new Client({
    name: 'nx-module-federation-playground-mcp-e2e',
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

const getToolText = (result) => {
  const textContent = result.content.find((content) => content.type === 'text');
  if (!textContent || typeof textContent.text !== 'string') {
    return '';
  }
  return textContent.text;
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

const waitForPendingSelectionOverlay = async (page) => {
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll('[data-agentic-react-selected-label="true"]'),
    ).some((element) => {
      const parentElement = element.parentElement;
      if (!parentElement) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const parentStyle = window.getComputedStyle(parentElement);
      return (
        style.visibility !== 'hidden' &&
        parentStyle.display !== 'none' &&
        parentStyle.visibility !== 'hidden' &&
        element.textContent.trim().length > 0
      );
    }),
  );
};

const expectProfileMemberCardSource = (context) => {
  expect(context.resolvedSources).toContainEqual(
    expect.objectContaining({
      componentName: 'ProfileMemberCard',
      filePath: expect.stringContaining('ProfileMemberCard.tsx'),
    }),
  );
  expect(context.sourceSnippets).toContainEqual(
    expect.objectContaining({
      filePath: expect.stringContaining('ProfileMemberCard.tsx'),
      snippet: expect.stringContaining('function ProfileMemberCard'),
    }),
  );
  expect(context.sourceSnippets).toContainEqual(
    expect.objectContaining({
      filePath: expect.stringContaining('ProfileMemberCard.tsx'),
      snippet: expect.stringContaining('profile-member-${memberId}'),
    }),
  );
};

const selectRemoteProfileMember = async (page, request) => {
  await waitForRemoteEntries(request);
  await page.goto('/profile');
  await expect(page.getByText('Federated team profile routes.')).toBeVisible();
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await installClipboardStub(page);

  await page.evaluate(() => window.__AGENTIC_REACT__.setSelectionMode(true));
  const contextBeforeSelection = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(contextBeforeSelection).toBeNull();
  await page.locator('#profile-member-sam-rivera').click();

  await waitForPendingSelectionOverlay(page);
  const pendingCommittedContext = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(pendingCommittedContext).toBeNull();

  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
      '#profile-member-sam-rivera',
  );
};

test('nx module federation playground injects runtime globals', async ({
  page,
}) => {
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
          id: 'nx-runtime-smoke',
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
  expect(runtimeShape.tuningSurfaceClassName).toBe('nx-shell-tuning-surface');
  expect(runtimeShape.tuningPanelClassName).toBe('nx-shell-tuning-panel');
  expect(runtimeShape.unregisterType).toBe('function');
});

test('nx module federation host exposes remote React context to MCP', async ({
  page,
  request,
}) => {
  await waitForRemoteEntries(request);
  await page.goto('/catalog');
  await expect(page.getByText('Federated product routes.')).toBeVisible();
  await expect(page.getByText('React Router 6.4.2 route island')).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByText('Federated team profile routes.')).toBeVisible();
  await expect(page.getByText('Component inspection')).toBeVisible();
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  try {
    const treeRaw = await client.callTool({
      name: 'get-component-tree',
      arguments: {
        allComponents: true,
      },
    });
    const tree = parseToolResponse(treeRaw);
    expect(JSON.stringify(tree)).toContain('ProfileRoutes');
  } finally {
    await transport.close();
  }
});

test('nx module federation selection captures remote component source context', async ({
  page,
  request,
}) => {
  await selectRemoteProfileMember(page, request);

  const selectionContext = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );

  expect(selectionContext.componentName).toBe('ProfileMemberCard');
  expect(selectionContext.selector).toBe('#profile-member-sam-rivera');
  expect(selectionContext.resolvedSources).toContainEqual(
    expect.objectContaining({
      componentName: 'ProfileMemberCard',
      filePath: expect.stringContaining('ProfileMemberCard.tsx'),
    }),
  );

  const { client, transport } = await createMcpClient();
  try {
    const selectedContextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 12,
        maxFiles: 3,
      },
    });
    const selectedContext = parseToolResponse(selectedContextRaw);
    expect(selectedContext.success).toBe(true);
    expect(selectedContext.context.componentName).toBe('ProfileMemberCard');
    expect(selectedContext.context.selector).toBe('#profile-member-sam-rivera');
    expect(selectedContext.summary).toContain('ProfileMemberCard');
    expect(selectedContext.summary).toContain('function ProfileMemberCard');
    expectProfileMemberCardSource(selectedContext.context);

    const reactSourceRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['article profile-member-sam-rivera'],
        maxMatches: 3,
        includeSourceSnippets: true,
        contextLines: 12,
        maxFiles: 3,
      },
    });
    const reactSource = parseToolResponse(reactSourceRaw);
    expect(reactSource.success).toBe(true);
    expect(reactSource.chosenMatch.selector).toBe(
      '#profile-member-sam-rivera',
    );
    expect(reactSource.context.componentName).toBe('ProfileMemberCard');
    expect(reactSource.summary).toContain('function ProfileMemberCard');
    expectProfileMemberCardSource(reactSource.context);

    const highlightRaw = await client.callTool({
      name: 'highlight-component',
      arguments: { componentName: 'ProfileMemberCard' },
    });
    expect(getToolText(highlightRaw)).toContain('highlighted');
  } finally {
    await transport.close();
  }
});

test('nx selection attributes external package components to local usage source', async ({
  page,
  request,
}) => {
  await waitForRemoteEntries(request);
  await page.goto('/profile');
  await expect(page.getByText('Federated team profile routes.')).toBeVisible();
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await installClipboardStub(page);

  await page.evaluate(() => window.__AGENTIC_REACT__.setSelectionMode(true));
  const contextBeforeSelection = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(contextBeforeSelection).toBeNull();
  await page.locator('#profile-external-component-probe').click();
  await waitForPendingSelectionOverlay(page);
  const pendingCommittedContext = await page.evaluate(() =>
    window.__AGENTIC_REACT__.getLastSelectionContext(),
  );
  expect(pendingCommittedContext).toBeNull();

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForFunction(
    () =>
      window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
      '#profile-external-component-probe',
  );

  const { client, transport } = await createMcpClient();
  try {
    const selectedContextRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 24,
        maxFiles: 2,
      },
    });
    const selectedContext = parseToolResponse(selectedContextRaw);
    const selectionContext = selectedContext.context;

    expect(selectionContext.externalComponent).toEqual(
      expect.objectContaining({
        componentName: expect.any(String),
        packageName: expect.stringMatching(/^@chakra-ui\//),
        usedBy: expect.objectContaining({
          componentName: 'ExternalDependencySelectionProbe',
          filePath: expect.stringContaining(
            'ExternalDependencySelectionProbe.tsx',
          ),
        }),
      }),
    );
    expect(selectionContext.sourcePreview).toContain(
      'selected external component:',
    );
    expect(selectionContext.sourcePreview).toContain(
      'ExternalDependencySelectionProbe.tsx',
    );
    expect(selectionContext.sourceSnippets).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining(
          'ExternalDependencySelectionProbe.tsx',
        ),
        snippet: expect.stringContaining('Review access note'),
      }),
    );
  } finally {
    await transport.close();
  }
});
