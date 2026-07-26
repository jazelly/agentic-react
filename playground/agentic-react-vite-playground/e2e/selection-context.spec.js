import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fileURLToPath } from 'node:url';

const MCP_SERVER_URL = 'http://127.0.0.1:51423/mcp';
const TOOLBOX_ICON_FIXTURE = fileURLToPath(
  new URL(
    '../../../packages/core/src/assets/agentic-react-toolkit-logo.png',
    import.meta.url,
  ),
);
const ACTIVATION_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'touchstart',
  'touchend',
  'contextmenu',
];

const createMcpClient = async () => {
  const client = new Client({
    name: 'agentic-react-e2e',
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

const selectProfileEmailField = async (page) => {
  await page.goto('/profile/1');
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();

  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await page.evaluate(() => window.__AGENTIC_REACT__.setSelectionMode(true));
  await page.locator('#profile-field-email').click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
      '#profile-field-email',
  );
};

const getToolkitRoot = (page) =>
  page.locator('[data-agentic-react-toolkit="true"]');

const setClipboardMarker = async (page, marker) => {
  await page.evaluate((value) => navigator.clipboard.writeText(value), marker);
};

const installHostEventRecorder = async (page) => {
  await page.evaluate((eventNames) => {
    window.__AGENTIC_REACT_E2E_HOST_EVENTS__ = [];
    const popover = document.createElement('div');
    popover.id = 'agentic-react-e2e-transient-popover';
    popover.textContent = 'Transient host UI';
    document.body.appendChild(popover);

    for (const eventName of eventNames) {
      document.addEventListener(eventName, (event) => {
        window.__AGENTIC_REACT_E2E_HOST_EVENTS__.push(event.type);
        popover.remove();
      });
    }
  }, ACTIVATION_EVENTS);
};

const expectHostDidNotReceiveActivation = async (page) => {
  await expect(page.locator('#agentic-react-e2e-transient-popover')).toBeVisible();
  expect(
    await page.evaluate(() => window.__AGENTIC_REACT_E2E_HOST_EVENTS__),
  ).toEqual([]);
};

const dispatchActivationEvents = async (locator) => {
  await locator.evaluate((element, eventNames) => {
    for (const eventName of eventNames) {
      const EventConstructor = eventName.startsWith('pointer')
        ? PointerEvent
        : eventName.startsWith('touch')
          ? Event
          : MouseEvent;
      element.dispatchEvent(
        new EventConstructor(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    }
  }, ACTIVATION_EVENTS);
};

const openSettings = async (page) => {
  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  const settingsButton = toolkitRoot.getByRole('button', {
    name: 'Settings',
    exact: true,
  });
  if ((await settingsButton.getAttribute('aria-expanded')) !== 'true') {
    await settingsButton.click();
  }
  await expect(
    toolkitRoot.locator('[data-agentic-react-settings="true"]'),
  ).toBeVisible();
};

const getShortcutRow = (page, label) =>
  getToolkitRoot(page)
    .locator('[data-agentic-react-settings="true"]')
    .getByText(label, { exact: true })
    .locator('..')
    .locator('..');

const openToolkitPanel = async (page) => {
  const toolkitRoot = getToolkitRoot(page);
  await toolkitRoot.waitFor();
  const selectButton = toolkitRoot.getByRole('button', {
    name: 'Select',
    exact: true,
  });
  if (await selectButton.isVisible()) {
    return;
  }

  const launcherButton = toolkitRoot.locator(
    'button[aria-label*="Agentic React toolkit"]',
  );

  await launcherButton.first().click({ force: true });

  if (!(await selectButton.isVisible())) {
    await launcherButton.first().click({ force: true });
  }

  await expect(selectButton).toBeVisible();
};

const capturePendingWithToolkitUi = async (page, selector) => {
  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator(selector).click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();
  await expect(
    toolkitRoot.getByText('Captured', { exact: false }),
  ).toBeVisible();
};

const captureWithToolkitUi = async (page, selector) => {
  await capturePendingWithToolkitUi(page, selector);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (selectedSelector) =>
      window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
      selectedSelector,
    selector,
  );
};

test('copying without a selection returns a no-selection response', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const copyResult = await page.evaluate(() =>
    window.__AGENTIC_REACT__.copyLastSelectionContext('json'),
  );

  expect(copyResult.success).toBe(false);
  expect(copyResult.error).toBe('No selection context found');
});

test('selecting a profile field captures its React source context', async ({
  page,
}) => {
  await selectProfileEmailField(page);

  const context = await page.waitForFunction(() => {
    const selectionContext =
      window.__AGENTIC_REACT__?.getLastSelectionContext();
    if (!selectionContext) return null;
    return selectionContext;
  });
  const selectionContext = await context.jsonValue();

  expect(selectionContext.componentName).toBe('ProfileField');
  expect(selectionContext.selector).toBe('#profile-field-email');
  expect(selectionContext.resolvedSources).toContainEqual(
    expect.objectContaining({
      filePath: expect.stringContaining(
        'src/components/UserProfile/ProfileField.jsx',
      ),
    }),
  );
});

test('toolkit single select waits for Done before copying', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await setClipboardMarker(page, 'single-select-not-committed');

  await capturePendingWithToolkitUi(page, '#profile-field-email');

  const toolkitRoot = getToolkitRoot(page);
  const doneButton = toolkitRoot.getByRole('button', {
    name: 'Done',
    exact: true,
  });
  await expect(doneButton).toBeVisible();
  await expect(doneButton).toBeEnabled();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'single-select-not-committed',
  );

  await doneButton.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('selector: #profile-field-email');
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('component: ProfileField');
  expect(clipboardText).toContain('selector: #profile-field-email');
  expect(clipboardText).toContain(
    '<web_context type="react_component_location">',
  );
  expect(clipboardText).toContain('</web_context>');
  expect(clipboardText).toContain('source: ');
  expect(clipboardText).toContain(
    '/playground/agentic-react-vite-playground/src/components/UserProfile/ProfileField.jsx',
  );
  await expect(doneButton).toBeHidden();
});

test('Enter commits a pending single selection', async ({ page }) => {
  await page.goto('/profile/1');
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await setClipboardMarker(page, 'enter-not-committed');

  await capturePendingWithToolkitUi(page, '#profile-field-email');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'enter-not-committed',
  );

  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('selector: #profile-field-email');
  await expect(
    getToolkitRoot(page).getByRole('button', { name: 'Done', exact: true }),
  ).toBeHidden();
});

test('Escape cancels active and pending selections without reaching the host', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await setClipboardMarker(page, 'escape-must-not-copy');
  await page.evaluate(() => {
    window.__AGENTIC_REACT_E2E_ESCAPE_EVENTS__ = [];
    for (const eventName of ['keydown', 'keyup']) {
      document.addEventListener(
        eventName,
        (event) => {
          if (event.key === 'Escape') {
            window.__AGENTIC_REACT_E2E_ESCAPE_EVENTS__.push(event.type);
          }
        },
        true,
      );
    }
  });

  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(toolkitRoot).toContainText('Selection cancelled');
  await expect(
    toolkitRoot.getByRole('button', { name: 'Select', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeHidden();

  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('#profile-display-email-value').click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeHidden();
  expect(
    await page.evaluate(() => window.__AGENTIC_REACT__.getLastSelectionContext()),
  ).toBeNull();

  await toolkitRoot
    .getByRole('button', { name: 'Multiselect', exact: true })
    .click();
  await page.locator('#profile-display-email-value').click();
  await page.locator('#profile-header-occupation-value').click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(0);
  await expect(toolkitRoot).toContainText('Selection cancelled');
  await expect(
    toolkitRoot.getByRole('button', { name: 'Select', exact: true }),
  ).toBeVisible();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'escape-must-not-copy',
  );
  expect(
    await page.evaluate(() => window.__AGENTIC_REACT_E2E_ESCAPE_EVENTS__),
  ).toEqual([]);
});

test('toolbox, selection controls, and tuning UI do not activate the host app', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('#profile-display-email-value').click();
  const selectedActions = page.locator(
    '[data-agentic-react-selected-actions="true"]',
  );
  await selectedActions
    .getByRole('button', { name: 'Adjust selection', exact: true })
    .click({ force: true });
  const tuningModal = page.locator('[data-agentic-react-tuning-modal="true"]');
  await expect(tuningModal).toBeVisible();

  await installHostEventRecorder(page);
  await dispatchActivationEvents(
    toolkitRoot.locator('[data-agentic-react-launcher="true"]'),
  );
  await dispatchActivationEvents(
    toolkitRoot.getByRole('button', { name: 'Settings', exact: true }),
  );
  await dispatchActivationEvents(selectedActions);
  await dispatchActivationEvents(tuningModal);

  await expectHostDidNotReceiveActivation(page);
});

test('settings record, reject duplicates, persist, and reset one shortcut', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__?.settings);
  await openSettings(page);

  const toolkitRoot = getToolkitRoot(page);
  const singleRow = getShortcutRow(page, 'Single select');
  await expect(singleRow).toContainText('Ctrl+Alt+Shift+S');
  await expect(singleRow).toContainText('Project configuration');
  await expect(getShortcutRow(page, 'Multi select')).toContainText(
    'Ctrl+Alt+Shift+M',
  );
  await expect(getShortcutRow(page, 'Toggle toolbox')).toContainText(
    'Ctrl+Alt+Shift+A',
  );
  await expect(getShortcutRow(page, 'Done')).toContainText('Enter');
  await expect(toolkitRoot).toContainText('Cancel selection');
  await expect(toolkitRoot).toContainText('Escape');

  await singleRow.getByRole('button').first().click();
  await page.keyboard.press('Control+Alt+Shift+Y');
  await expect(toolkitRoot).toContainText('Saved Ctrl+Alt+Shift+Y.');
  await expect(getShortcutRow(page, 'Single select')).toContainText(
    'Global override',
  );

  const updatedSingleRow = getShortcutRow(page, 'Single select');
  await updatedSingleRow.getByRole('button').first().click();
  await page.keyboard.press('Control+Alt+Shift+M');
  await expect(toolkitRoot).toContainText(
    'already assigned to Multi select',
  );
  await page.keyboard.press('Escape');
  await expect(toolkitRoot).toContainText('Shortcut recording cancelled.');

  await page.reload();
  await page.waitForFunction(() => window.__AGENTIC_REACT__?.settings);
  await openSettings(page);
  await expect(getShortcutRow(page, 'Single select')).toContainText(
    'Ctrl+Alt+Shift+Y',
  );
  await expect(getShortcutRow(page, 'Single select')).toContainText(
    'Global override',
  );

  await page.keyboard.press('Control+Alt+Shift+Y');
  await expect(getToolkitRoot(page)).toContainText('Selection mode enabled.');
  await page.keyboard.press('Escape');

  const persistedSingleRow = getShortcutRow(page, 'Single select');
  await persistedSingleRow.getByRole('button', { name: 'Reset' }).click();
  await expect(getToolkitRoot(page)).toContainText(
    'Reset Single select shortcut.',
  );
  await expect(getShortcutRow(page, 'Single select')).toContainText(
    'Ctrl+Alt+Shift+S',
  );
  await expect(getShortcutRow(page, 'Single select')).toContainText(
    'Project configuration',
  );
});

test('toolbox icon crop persists globally without activating the host and resets to project icon', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__?.settings);
  await openSettings(page);
  const toolkitRoot = getToolkitRoot(page);
  await expect(
    toolkitRoot.getByText('Toolbox icon', { exact: true }).locator('..'),
  ).toContainText('Project configuration');

  await installHostEventRecorder(page);
  await toolkitRoot
    .locator('input[type="file"]')
    .setInputFiles(TOOLBOX_ICON_FIXTURE);
  const cropDialog = page.getByRole('dialog', { name: 'Crop toolbox icon' });
  await expect(cropDialog).toBeVisible();
  await dispatchActivationEvents(cropDialog);
  await expectHostDidNotReceiveActivation(page);

  const zoom = cropDialog.getByLabel('Zoom icon crop');
  await zoom.focus();
  await zoom.press('ArrowRight');
  await cropDialog.getByRole('button', { name: 'Rotate right' }).click();
  await cropDialog.getByRole('button', { name: 'Apply' }).click();
  await expect(cropDialog).toBeHidden();
  await expectHostDidNotReceiveActivation(page);
  await expect(toolkitRoot).toContainText('Updated toolbox icon.');
  await expect
    .poll(() =>
      toolkitRoot
        .locator('[data-agentic-react-launcher="true"] img')
        .getAttribute('src'),
    )
    .toMatch(/^data:image\/(webp|png);base64,/);
  await expect(
    toolkitRoot.getByText('Toolbox icon', { exact: true }).locator('..'),
  ).toContainText('Global override');

  await page.reload();
  await page.waitForFunction(() => window.__AGENTIC_REACT__?.settings);
  await openSettings(page);
  const reloadedToolkitRoot = getToolkitRoot(page);
  await expect
    .poll(() =>
      reloadedToolkitRoot
        .locator('[data-agentic-react-launcher="true"] img')
        .getAttribute('src'),
    )
    .toMatch(/^data:image\/(webp|png);base64,/);
  await expect(
    reloadedToolkitRoot
      .getByText('Toolbox icon', { exact: true })
      .locator('..'),
  ).toContainText('Global override');

  await reloadedToolkitRoot.getByRole('button', { name: 'Reset' }).last().click();
  await expect(reloadedToolkitRoot).toContainText('Reset toolbox icon.');
  await expect
    .poll(() =>
      reloadedToolkitRoot
        .locator('[data-agentic-react-launcher="true"] img')
        .getAttribute('src'),
    )
    .toBe('/agentic-react-logo.png');
  await expect(
    reloadedToolkitRoot
      .getByText('Toolbox icon', { exact: true })
      .locator('..'),
  ).toContainText('Project configuration');
});

test('toolkit multiselect appends selections and copies all on done', async ({
  page,
}, testInfo) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await expect(
    toolkitRoot.getByRole('button', { name: 'Copy', exact: true }),
  ).toHaveCount(0);

  await toolkitRoot
    .getByRole('button', { name: 'Multiselect', exact: true })
    .click();
  const doneButton = toolkitRoot.getByRole('button', {
    name: 'Done',
    exact: true,
  });
  const clearAllButton = toolkitRoot.getByRole('button', {
    name: 'Clear all selections',
    exact: true,
  });
  await expect(doneButton).toBeVisible();
  await expect(clearAllButton).toBeVisible();
  await expect(clearAllButton).toContainText('Clear all');
  await expect(clearAllButton).toBeDisabled();

  const doneStyles = await doneButton.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
    };
  });
  expect(doneStyles.backgroundColor).toBe('rgb(220, 38, 38)');
  expect(doneStyles.color).toBe('rgb(255, 255, 255)');

  await page.locator('#profile-display-email-value').click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(1);
  await page.locator('#profile-header-occupation-value').click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(2);

  await setClipboardMarker(page, 'multi-select-not-committed');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'multi-select-not-committed',
  );
  await expect(clearAllButton).toBeEnabled();

  await clearAllButton.click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(0);
  await expect(clearAllButton).toBeDisabled();
  await expect(toolkitRoot).toContainText('Cleared all selections');

  await page.locator('#profile-display-email-value').click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(1);
  await page.locator('#profile-header-occupation-value').click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(2);

  const multiSelectedOverlays = page.locator(
    '[data-agentic-react-multi-selected="true"]',
  );
  const firstTuneButton = multiSelectedOverlays
    .first()
    .getByRole('button', { name: 'Adjust selection', exact: true });
  await firstTuneButton.click({ force: true });
  const tuningModal = page.locator('[data-agentic-react-tuning-modal="true"]');
  const tuningSurface = page.locator(
    '[data-agentic-react-tuning-surface="true"]',
  );
  const tuningPanel = page.locator('[data-agentic-react-tuning-panel="true"]');
  await expect(tuningModal.getByLabel('Text color')).toBeVisible();
  await expect(tuningModal.getByLabel('Background')).toBeVisible();
  await expect(tuningModal.getByLabel('Opacity', { exact: true })).toBeVisible();
  await expect(
    tuningModal.getByLabel('Font', { exact: true }),
  ).toHaveCount(1);
  await expect(
    tuningModal.getByLabel('Font size', { exact: true }),
  ).toHaveCount(1);
  await expect(
    tuningModal.getByLabel('Font weight', { exact: true }),
  ).toHaveCount(1);
  await expect(tuningModal.getByLabel('Width', { exact: true })).toHaveCount(1);
  await expect(tuningModal.getByLabel('Height', { exact: true })).toHaveCount(1);
  await expect(tuningModal.getByLabel('Padding', { exact: true })).toHaveCount(1);
  await expect(tuningModal.getByLabel('Margin', { exact: true })).toHaveCount(1);
  await expect(
    tuningModal.getByLabel('Describe custom tuning changes'),
  ).toBeVisible();
  await expect(tuningSurface).toHaveClass(/vite-playground-tuning-surface/);
  await expect(tuningPanel).toBeVisible();
  await expect(tuningPanel).toHaveClass(/vite-playground-tuning-panel/);
  await expect(tuningModal.getByLabel('Text color')).toHaveClass(
    /vite-playground-tuning-control/,
  );
  const tuningStyleOverrides = await tuningPanel.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    const targetTagElement = element.querySelector(
      '[data-agentic-react-tuning-target-tag="true"]',
    );
    const targetTagStyles = targetTagElement
      ? window.getComputedStyle(targetTagElement)
      : null;
    return {
      borderRadius: styles.borderRadius,
      borderTopColor: styles.borderTopColor,
      maxHeight: styles.maxHeight,
      overflowY: styles.overflowY,
      targetTagBackground: targetTagStyles?.backgroundColor || '',
      targetTagColor: targetTagStyles?.color || '',
    };
  });
  expect(tuningStyleOverrides.borderRadius).toBe('14px');
  expect(tuningStyleOverrides.borderTopColor).toBe(
    'rgba(15, 118, 110, 0.22)',
  );
  expect(tuningStyleOverrides.maxHeight).toBe('360px');
  expect(tuningStyleOverrides.overflowY).toBe('auto');
  expect(tuningStyleOverrides.targetTagBackground).toBe('rgb(236, 254, 255)');
  expect(tuningStyleOverrides.targetTagColor).toBe('rgb(15, 118, 110)');
  await expect(
    tuningModal
      .locator('[data-agentic-react-color-value="true"]')
      .filter({ hasText: 'rgba(' })
      .first(),
  ).toBeVisible();
  const tuningPanelPlacement = await tuningPanel.evaluate((element) => {
    const panelRect = element.getBoundingClientRect();
    const anchorRect = document
      .querySelector(
        '[data-agentic-react-multi-selected="true"] [aria-label="Adjust selection"]',
      )
      ?.getBoundingClientRect();

    return {
      panel: {
        left: panelRect.left,
        top: panelRect.top,
        right: panelRect.right,
        bottom: panelRect.bottom,
      },
      anchor: anchorRect
        ? {
            left: anchorRect.left,
            right: anchorRect.right,
          }
        : null,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  });
  expect(tuningPanelPlacement.panel.left).toBeGreaterThanOrEqual(-0.5);
  expect(tuningPanelPlacement.panel.top).toBeGreaterThanOrEqual(-0.5);
  expect(tuningPanelPlacement.panel.right).toBeLessThanOrEqual(
    tuningPanelPlacement.viewport.width + 0.5,
  );
  expect(tuningPanelPlacement.panel.bottom).toBeLessThanOrEqual(
    tuningPanelPlacement.viewport.height + 0.5,
  );
  if (!tuningPanelPlacement.anchor) {
    throw new Error('Expected tuning panel to be anchored to the tune button');
  }
  expect(
    Math.min(
      Math.abs(
        tuningPanelPlacement.panel.left - tuningPanelPlacement.anchor.right,
      ),
      Math.abs(
        tuningPanelPlacement.anchor.left - tuningPanelPlacement.panel.right,
      ),
    ),
  ).toBeLessThanOrEqual(16);
  const tuningScreenshotPath =
    process.env.AGENTIC_REACT_TUNING_SCREENSHOT_PATH;
  const tuningScreenshot = await page.screenshot({
    ...(tuningScreenshotPath ? { path: tuningScreenshotPath } : {}),
    fullPage: false,
  });
  await testInfo.attach('tuning-modal-positioning', {
    body: tuningScreenshot,
    contentType: 'image/png',
  });
  const textColorInput = tuningModal.locator('input[name="text-color"]');
  await textColorInput.fill('#336699');
  await textColorInput.dispatchEvent('change');
  await expect(toolkitRoot).toContainText('rgb(51, 102, 153)');
  await expect(
    tuningModal.locator('[data-agentic-react-color-value="true"]').first(),
  ).toContainText('rgba(51, 102, 153, 1)');
  const opacityInput = tuningModal.locator('input[name="opacity"]');
  await opacityInput.fill('0.8');
  await opacityInput.dispatchEvent('change');
  await expect(toolkitRoot).toContainText('opacity to 0.8');
  await tuningModal
    .getByRole('button', { name: 'Increment Font size', exact: true })
    .click();
  await expect(toolkitRoot).toContainText('font size to 17px');
  await tuningPanel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await tuningModal.locator('select[name="font-weight"]').selectOption('700');
  await expect(toolkitRoot).toContainText('font weight to 700');
  const paddingInput = tuningModal.locator('input[name="padding"]');
  await paddingInput.fill('12');
  await paddingInput.dispatchEvent('change');
  await expect(toolkitRoot).toContainText('padding to 12px');
  await tuningModal
    .getByRole('button', { name: 'Close tuning options', exact: true })
    .click();

  await multiSelectedOverlays
    .nth(1)
    .getByRole('button', { name: 'Delete selection', exact: true })
    .click({ force: true });
  await expect(multiSelectedOverlays).toHaveCount(1);

  await doneButton.click();
  await expect(
    page.locator('[data-agentic-react-multi-selected="true"]'),
  ).toHaveCount(0);

  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardText).toContain('Selection 1');
  expect(clipboardText).toContain(
    '<web_context type="react_component_location">',
  );
  expect(clipboardText).toContain('</web_context>');
  expect(clipboardText).toContain('selector: #profile-display-email-value');
  expect(clipboardText).toContain('tuning prompts:');
  expect(clipboardText).toContain('text color to rgb(51, 102, 153).');
  expect(clipboardText).toContain('opacity to 0.8.');
  expect(clipboardText).toContain('font size to 17px.');
  expect(clipboardText).toContain('font weight to 700.');
  expect(clipboardText).toContain('padding to 12px.');
  expect(clipboardText).not.toContain('Selection 2');
  expect(clipboardText).not.toContain(
    'selector: #profile-header-occupation-value',
  );
});

test('copying the selected context includes a playground source snippet', async ({
  page,
}) => {
  await selectProfileEmailField(page);
  await page.waitForFunction(() =>
    window.__AGENTIC_REACT__?.getLastSelectionContext(),
  );

  const copyResult = await page.evaluate(() =>
    window.__AGENTIC_REACT__.copyLastSelectionContext('json'),
  );

  expect(copyResult.success).toBe(true);
  expect(copyResult.context.sourceSnippets).toContainEqual(
    expect.objectContaining({
      filePath: expect.stringContaining(
        'src/components/UserProfile/ProfileField.jsx',
      ),
      snippet: expect.stringContaining('profile-field-${name}'),
    }),
  );
  expect(copyResult.context.sourcePreview).toContain('profile-field-${name}');
  expect(copyResult.context.sourcePreview).toContain('source trace:');
  expect(copyResult.context.sourcePreview).toContain(
    'ProfileField at src/components/UserProfile/ProfileField.jsx',
  );
  expect(copyResult.context.sourcePreview).toContain(
    'src/components/UserProfile/ProfileContent.jsx',
  );
  expect(
    copyResult.context.sourceSnippets.map(({ filePath }) => filePath).join('\n'),
  ).not.toContain('node_modules');
});

test('toolkit tuning exposes layout controls for container elements', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await page.evaluate(() => {
    const fixtureElement = document.createElement('div');
    fixtureElement.id = 'layout-tuning-fixture';
    fixtureElement.style.display = 'flex';
    fixtureElement.style.alignItems = 'center';
    fixtureElement.style.justifyContent = 'space-between';
    fixtureElement.style.gap = '10px';
    fixtureElement.style.margin = '12px';
    fixtureElement.style.padding = '12px';
    fixtureElement.innerHTML =
      '<span>Layout fixture</span><button type="button">Action</button>';
    document.body.prepend(fixtureElement);
  });

  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('#layout-tuning-fixture').click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();

  await page
    .locator('[data-agentic-react-selected="true"]')
    .getByRole('button', { name: 'Adjust selection', exact: true })
    .click({ force: true });

  const tuningModal = page.locator('[data-agentic-react-tuning-modal="true"]');
  await expect(
    tuningModal.getByLabel('Layout direction', { exact: true }),
  ).toBeVisible();
  await expect(
    tuningModal.getByLabel('Distribution', { exact: true }),
  ).toBeVisible();
  await expect(
    tuningModal.getByLabel('Alignment', { exact: true }),
  ).toBeVisible();
  await expect(tuningModal.getByLabel('Spacing', { exact: true })).toBeVisible();

  await tuningModal
    .locator('select[name="layout-direction"]')
    .selectOption('column');
  await expect(toolkitRoot).toContainText('layout direction to column');
});

test('toolkit tuning modal extensions can wrap and add modal content', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);
  await page.evaluate(() => {
    window.__AGENTIC_REACT__.registerTuningModalExtension({
      id: 'e2e-custom-tuning-modal',
      beforeFields({ container, context }) {
        const element = document.createElement('div');
        element.setAttribute('data-e2e-tuning-before', 'true');
        element.textContent = `Custom before ${context.tagName}`;
        container.appendChild(element);
      },
      afterFields({ container, actions }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-e2e-tuning-prompt', 'true');
        button.textContent = 'Add glow prompt';
        button.addEventListener('click', () => {
          actions.addPrompt('Make the selected element glow.');
        });
        container.appendChild(button);
      },
      footer({ container }) {
        const element = document.createElement('div');
        element.setAttribute('data-e2e-tuning-footer', 'true');
        element.textContent = 'Custom footer';
        container.appendChild(element);
      },
      wrapModal({ surfaceElement, panelElement }) {
        const shell = document.createElement('div');
        shell.setAttribute('data-e2e-tuning-wrapper', 'true');
        shell.style.border = '2px solid rgb(14, 165, 233)';
        shell.style.padding = '4px';
        shell.style.background = 'rgb(240, 249, 255)';
        surfaceElement.replaceChildren(shell);
        shell.appendChild(panelElement);

        return () => {
          surfaceElement.replaceChildren(panelElement);
        };
      },
    });
  });

  const toolkitRoot = getToolkitRoot(page);
  await openToolkitPanel(page);
  await toolkitRoot.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('#profile-display-email-value').click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();

  await page
    .locator('[data-agentic-react-selected="true"]')
    .getByRole('button', { name: 'Adjust selection', exact: true })
    .click({ force: true });

  const tuningModal = page.locator('[data-agentic-react-tuning-modal="true"]');
  const tuningSurface = page.locator(
    '[data-agentic-react-tuning-surface="true"]',
  );
  const tuningPanel = page.locator('[data-agentic-react-tuning-panel="true"]');
  await expect(
    tuningSurface.locator('[data-e2e-tuning-wrapper="true"]'),
  ).toBeVisible();
  await expect(
    tuningModal.locator('[data-e2e-tuning-before="true"]'),
  ).toContainText('Custom before');
  await expect(
    tuningModal.locator('[data-e2e-tuning-footer="true"]'),
  ).toContainText('Custom footer');
  await expect(tuningModal.getByLabel('Text color')).toBeVisible();
  await expect(tuningModal.getByLabel('Opacity', { exact: true })).toBeVisible();
  await expect(tuningModal.getByLabel('Width', { exact: true })).toBeVisible();

  const surfacePlacement = await tuningSurface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(surfacePlacement.left).toBeGreaterThanOrEqual(-0.5);
  expect(surfacePlacement.top).toBeGreaterThanOrEqual(-0.5);
  expect(surfacePlacement.right).toBeLessThanOrEqual(
    surfacePlacement.viewportWidth + 0.5,
  );
  expect(surfacePlacement.bottom).toBeLessThanOrEqual(
    surfacePlacement.viewportHeight + 0.5,
  );

  await tuningModal
    .locator('[data-e2e-tuning-prompt="true"]')
    .click({ force: true });
  await expect(toolkitRoot).toContainText('Make the selected element glow.');
  await expect(tuningPanel).toBeVisible();
});

test('selecting an element without an id still returns a usable fallback selector', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await expect(page.locator('#profile-field-email')).toBeVisible();
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  await page.evaluate(() => window.__AGENTIC_REACT__.enterSelectionMode());
  await page.locator('label', { hasText: 'Email' }).first().click();
  await expect(page.locator('[data-agentic-react-selected="true"]')).toBeVisible();
  await page.keyboard.press('Enter');

  const context = await page.waitForFunction(() =>
    window.__AGENTIC_REACT__?.getLastSelectionContext(),
  );
  const selectionContext = await context.jsonValue();

  expect(selectionContext.componentName).toBe('ProfileField');
  expect(selectionContext.selector).toBeTruthy();

  const selectorMatchesSelection = await page.evaluate((selector) => {
    if (!selector) return false;
    return document.querySelector(selector) !== null;
  }, selectionContext.selector);

  expect(selectorMatchesSelection).toBe(true);
});

test('copying root-relative source context does not request filesystem /src fallback', async ({
  page,
}) => {
  let requestedAbsoluteSrcFallback = false;

  await selectProfileEmailField(page);
  await page.waitForFunction(() =>
    window.__AGENTIC_REACT__?.getLastSelectionContext(),
  );
  await page.route('**/src/components/UserProfile/ProfileField.jsx**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.route(
    '**/@fs/src/components/UserProfile/ProfileField.jsx**',
    (route) => {
      requestedAbsoluteSrcFallback = true;
      return route.fulfill({ status: 404, body: '' });
    },
  );

  const copyResult = await page.evaluate(() =>
    window.__AGENTIC_REACT__.copyLastSelectionContext('json'),
  );

  expect(copyResult.success).toBe(true);
  expect(requestedAbsoluteSrcFallback).toBe(false);
});

test('MCP tools return no-selection and selected-context responses', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  let transportClosed = false;
  try {
    const noSelectionRaw = await client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
      },
    });
    const noSelection = parseToolResponse(noSelectionRaw);
    expect(noSelection.success).toBe(false);
    expect(noSelection.context).toBeNull();
    expect(noSelection.message).toContain('No selection context');

    await transport.close();
    transportClosed = true;

    await selectProfileEmailField(page);
    await page.waitForFunction(() =>
      window.__AGENTIC_REACT__?.getLastSelectionContext(),
    );

    const selectionMcp = await createMcpClient();
    try {
      const selectedContextRaw = await selectionMcp.client.callTool({
        name: 'get-last-selection-context',
        arguments: {
          includeSourceSnippets: true,
          contextLines: 3,
          maxFiles: 2,
        },
      });
      const selectedContext = parseToolResponse(selectedContextRaw);
      expect(selectedContext.success).toBe(true);
      expect(selectedContext.context.componentName).toBe('ProfileField');
      expect(selectedContext.context.sourceSnippets.length).toBeGreaterThan(0);
      expect(selectedContext.summary).toContain('ProfileField');
    } finally {
      await selectionMcp.transport.close();
    }
  } finally {
    if (!transportClosed) {
      await transport.close();
    }
  }
});

test('MCP get-html-elements and get-react-source-code return deterministic matches and source context', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  try {
    const htmlMatchesRaw = await client.callTool({
      name: 'get-html-elements',
      arguments: {
        queries: ['profile-field-email'],
        maxMatches: 3,
      },
    });
    const htmlMatches = parseToolResponse(htmlMatchesRaw);

    expect(htmlMatches.success).toBe(true);
    expect(htmlMatches.count).toBeGreaterThan(0);
    expect(htmlMatches.matches[0].selector).toBe('#profile-field-email');

    const reactSourceRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['profile-field-email'],
        maxMatches: 3,
        includeSourceSnippets: true,
        contextLines: 4,
        maxFiles: 3,
      },
    });
    const reactSource = parseToolResponse(reactSourceRaw);

    expect(reactSource.success).toBe(true);
    expect(reactSource.chosenMatch.selector).toBe('#profile-field-email');
    expect(reactSource.context.componentName).toBe('ProfileField');
    expect(reactSource.context.sourceSnippets).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining(
          'src/components/UserProfile/ProfileField.jsx',
        ),
      }),
    );
    expect(reactSource.summary).toContain('ProfileField');
  } finally {
    await transport.close();
  }
});

test('MCP get-react-source-code returns no-match payload when queries miss all elements', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  try {
    const missRaw = await client.callTool({
      name: 'get-react-source-code',
      arguments: {
        queries: ['this-does-not-exist-anywhere'],
      },
    });
    const miss = parseToolResponse(missRaw);
    expect(miss.success).toBe(false);
    expect(miss.reason).toContain('No element matched');
    expect(miss.context).toBeNull();
  } finally {
    await transport.close();
  }
});

test('toolkit bottom-right UI can capture reusable component source context across parents', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const toolkitRoot = getToolkitRoot(page);
  const toolkitPosition = await toolkitRoot.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      position: styles.position,
      right: styles.right,
      bottom: styles.bottom,
    };
  });
  expect(toolkitPosition.position).toBe('fixed');
  expect(toolkitPosition.right).toBe('20px');
  expect(toolkitPosition.bottom).toBe('20px');

  await captureWithToolkitUi(page, '#profile-display-email-value');

  const profileFieldMcp = await createMcpClient();
  try {
    const profileFieldContextRaw = await profileFieldMcp.client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 4,
        maxFiles: 4,
      },
    });
    const profileFieldContext = parseToolResponse(profileFieldContextRaw);
    expect(profileFieldContext.success).toBe(true);
    expect(profileFieldContext.context.selector).toBe('#profile-display-email-value');
    expect(profileFieldContext.context.resolvedSources).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining('src/components/Common/LabeledValue.jsx'),
      }),
    );
    expect(profileFieldContext.context.resolvedSources).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining('src/components/UserProfile/ProfileField.jsx'),
      }),
    );
  } finally {
    await profileFieldMcp.transport.close();
  }

  await captureWithToolkitUi(page, '#profile-header-occupation-value');

  const profileHeaderMcp = await createMcpClient();
  try {
    const profileHeaderContextRaw = await profileHeaderMcp.client.callTool({
      name: 'get-last-selection-context',
      arguments: {
        includeSourceSnippets: true,
        contextLines: 4,
        maxFiles: 4,
      },
    });
    const profileHeaderContext = parseToolResponse(profileHeaderContextRaw);
    expect(profileHeaderContext.success).toBe(true);
    expect(profileHeaderContext.context.selector).toBe(
      '#profile-header-occupation-value',
    );
    expect(profileHeaderContext.context.resolvedSources).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining('src/components/Common/LabeledValue.jsx'),
      }),
    );
    expect(profileHeaderContext.context.resolvedSources).toContainEqual(
      expect.objectContaining({
        filePath: expect.stringContaining('src/components/UserProfile/ProfileHeader.jsx'),
      }),
    );
  } finally {
    await profileHeaderMcp.transport.close();
  }
});

test('MCP built-in tooling endpoints all return expected outcomes', async ({
  page,
}) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  let transportClosed = false;
  try {
    const highlightRaw = await client.callTool({
      name: 'highlight-component',
      arguments: { componentName: 'ProfileField' },
    });
    const highlightText = getToolText(highlightRaw);
    expect(highlightText).toContain('highlighted');

    const treeRaw = await client.callTool({
      name: 'get-component-tree',
      arguments: { allComponents: false },
    });
    const treeText = getToolText(treeRaw);
    const tree = JSON.parse(treeText);
    expect(tree).toBeTruthy();
    expect(JSON.stringify(tree)).toContain('UserProfile');

    const statesRaw = await client.callTool({
      name: 'get-component-states',
      arguments: { componentName: 'ProfileField' },
    });
    const statesText = getToolText(statesRaw);
    const states = JSON.parse(statesText);
    expect(states).toBeTruthy();
    expect(Object.keys(states).length).toBeGreaterThan(0);

    const rerendersRaw = await client.callTool({
      name: 'get-unnecessary-rerenders',
      arguments: { timeframe: 60, allComponents: true },
    });
    const rerendersText = getToolText(rerendersRaw);
    const rerenders = JSON.parse(rerendersText);
    expect(Array.isArray(rerenders)).toBe(true);

    await transport.close();
    transportClosed = true;

    await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
    await expect(page.locator('#profile-field-email')).toBeVisible();
    await page.evaluate(() => window.__AGENTIC_REACT__.setSelectionMode(true));
    await page.locator('#profile-field-email').click();
    await expect(
      page.locator('[data-agentic-react-selected="true"]'),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.__AGENTIC_REACT__.getLastSelectionContext(),
      ),
    ).toBeNull();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        window.__AGENTIC_REACT__?.getLastSelectionContext()?.selector ===
        '#profile-field-email',
    );
    const selectionMcp = await createMcpClient();
    try {
      const copiedRaw = await selectionMcp.client.callTool({
        name: 'copy-last-selection-context',
        arguments: { format: 'json' },
      });
      const copied = parseToolResponse(copiedRaw);
      expect(typeof copied.success).toBe('boolean');
      expect(typeof copied.copied).toBe('boolean');
      expect(copied.format).toBe('json');
      expect(copied.context).toBeTruthy();
      if (!copied.success) {
        expect(copied.error).toContain('Failed to copy context');
      }
    } finally {
      await selectionMcp.transport.close();
    }
  } finally {
    if (!transportClosed) {
      await transport.close();
    }
  }
});

test('MCP custom tools execute inside the browser runtime', async ({ page }) => {
  await page.goto('/profile/1');
  await page.waitForFunction(() => window.__AGENTIC_REACT__);

  const { client, transport } = await createMcpClient();
  try {
    const customToolRaw = await client.callTool({
      name: 'log1',
      arguments: { message: 'browser-runtime-check' },
    });
    const customToolResult = parseToolResponse(customToolRaw);

    expect(customToolResult.success).toBe(true);
    expect(customToolResult.runtime).toBe('browser');
    expect(customToolResult.message).toBe(
      'Log1 received: browser-runtime-check',
    );

    const browserCalls = await page.evaluate(
      () => window.__AGENTIC_REACT_CUSTOM_TOOL_CALLS__ || [],
    );
    expect(browserCalls).toContain('browser-runtime-check');
  } finally {
    await transport.close();
  }
});
