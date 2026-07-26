# @agentic-react/core

Bundler-agnostic Agentic React runtime primitives.

Use this package when you need browser-side React selection and inspection without Vite, Webpack, or Next.js adapter wiring.

```ts
import { createSelectionToolkit } from '@agentic-react/core';

const toolkit = createSelectionToolkit();
toolkit.enable();
```

For full local-dev MCP features, install an adapter instead:

- `@agentic-react/vite`
- `@agentic-react/webpack`
- `@agentic-react/next`

Adapters depend on `@agentic-react/core` internally and add runtime injection, bridge transport, MCP endpoints, and source-root context.

## Settings Availability

`@agentic-react/core` contains the browser UI and shared types for toolbox Settings, but persistent Settings require an adapter-hosted bridge. Direct runtime usage cannot read or write `~/.agentic-react/settings.json`, cannot persist a custom toolbox icon, and cannot save shortcut changes unless you provide your own `AgenticReactSettingsClient`.

Without that bridge, the selection toolkit can still use package defaults and code-provided `toolkit` defaults. The package shortcut defaults are `Ctrl+Alt+Shift+S` for single select, `Ctrl+Alt+Shift+M` for multiselect, `Ctrl+Alt+Shift+A` for toggling the toolbox, and `Enter` for Done. `Escape` is reserved for cancelling pending selection.

Adapter-backed Settings resolve values as:

```text
global user override
  > project configuration default
  > package default
```

Project defaults are supplied by adapters through `toolkit.settings.shortcuts` and `toolkit.iconUrl`. Runtime-only integrations should treat those as code defaults, not persisted user preferences.

## Selection Confirmation

Single selection is pending until the user confirms it. Clicking a target captures and highlights the context, but does not copy it. Clicking Done, or pressing the configured Done shortcut, copies that pending context and commits it as the last selection. If clipboard writing fails, the pending context stays available for retry.

Multiselect collects pending contexts until Done copies the complete set. `Escape` cancels pending single and multiselect contexts without copying and leaves the last committed selection intact.

## Tuning Modal Runtime API

The browser runtime exposes the tuning modal through the selection toolkit and `window.__AGENTIC_REACT__`.

```ts
window.__AGENTIC_REACT__?.setToolkitConfig({
  tuningModal: {
    classNames: {
      panel: 'my-tuning-panel',
      control: 'my-tuning-control',
    },
    styles: {
      panel: { border: '1px solid rgba(15, 23, 42, 0.18)' },
      sectionTitle: { color: '#0f766e' },
    },
    tokens: {
      panelRadius: '14px',
      controlRadius: '10px',
      primaryButtonBackground: '#0f766e',
      primaryButtonColor: '#ffffff',
    },
  },
});
```

`tuningModal.classNames` and `tuningModal.styles` target modal slots: `root`, `surface`, `panel`, `arrow`, `title`, `body`, `targetTag`, `customPromptForm`, `customPromptInput`, `customPromptButton`, `sectionTitle`, `row`, `label`, `controlWrap`, `control`, `colorInput`, `numberInput`, `stepperButton`, `select`, `textarea`, `suffix`, and `closeButton`.

`tuningModal.tokens` are converted to CSS variables with the `--agentic-react-tuning-` prefix. `panelRadius` becomes `--agentic-react-tuning-panel-radius`; `primaryButtonBackground` becomes `--agentic-react-tuning-primary-button-background`.

Use `registerTuningModalExtension()` for structural changes that cannot be handled by classes, inline styles, or tokens.

```ts
const unregister = window.__AGENTIC_REACT__?.registerTuningModalExtension({
  id: 'modal-footer-hint',
  footer({ container, actions }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Add design-system review';
    button.addEventListener('click', () => {
      actions.addPrompt('Review this selection against the design system.');
      actions.close();
    });
    container.appendChild(button);

    return () => {
      button.remove();
    };
  },
  wrapModal({ surfaceElement, actions }) {
    surfaceElement.dataset.agenticWrapper = 'design-system';
    actions.requestReposition();
  },
});
```

The extension context includes the selected `element`, `tagName`, `targetLabel`, computed styles, and the current selection context. Actions can add tuning prompts, close the modal, or request a position recalculation. Call the returned `unregister` function when your integration unloads.
