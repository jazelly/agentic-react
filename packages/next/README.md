# @agentic-react/next

Next.js adapter for Agentic React local-dev MCP integration.

```bash
pnpm install @agentic-react/next -D
```

```js
import withAgenticReactNext from '@agentic-react/next';

export default withAgenticReactNext(nextConfig);
```

This adapter injects `@agentic-react/core` through Next's Webpack config and starts a local bridge server for MCP. By default the bridge runs at `http://127.0.0.1:51426/mcp`.

## Settings Configuration

The Next adapter enables the toolbox Settings section when its local bridge server is enabled. User overrides are global to the machine under `~/.agentic-react/` and take precedence over project defaults and package defaults.

Use `settingsRoot` only when you need an isolated settings directory for tests, demos, or temporary environments. Project defaults are configured with `toolkit.settings.shortcuts`, and the project default launcher icon is configured with `toolkit.iconUrl`.

```ts
import withAgenticReactNext from '@agentic-react/next';
import type { AgenticReactToolkitConfig } from '@agentic-react/next';

const toolkit: AgenticReactToolkitConfig = {
  iconUrl: '/agentic-react-logo.png',
  settings: {
    shortcuts: {
      singleSelect: 'Ctrl+Shift+S',
      multiSelect: 'Ctrl+Shift+M',
      toggleToolbox: 'Ctrl+Shift+A',
      done: 'Enter',
    },
  },
};

export default withAgenticReactNext(nextConfig, {
  settingsRoot: '/tmp/agentic-react-settings',
  toolkit,
});
```

The Settings UI can change shortcuts and crop a custom toolbox icon. Reset removes the global override and falls back to the project default when present, otherwise to the package default. `Escape` is reserved for cancelling pending selection and cannot be assigned. If `server.enabled` is `false`, persistent Settings are unavailable because the browser has no adapter-hosted bridge.

Clicking a target captures a pending selection but does not copy it. Click Done, or press the configured Done shortcut, to copy and commit the pending selection; multiselect copies the complete pending set.

## Tuning Modal Configuration

Pass tuning modal options as the second argument to `withAgenticReactNext`. The `toolkit` object uses the shared `ToolkitConfig` shape; `toolkit.tuningModal` accepts `classNames`, `styles`, and `tokens`.

```ts
import withAgenticReactNext from '@agentic-react/next';
import type { ToolkitConfig } from '@agentic-react/next';

const toolkit: ToolkitConfig = {
  tuningModal: {
    classNames: {
      surface: 'next-playground-tuning-surface',
      panel: 'next-playground-tuning-panel',
      control: 'next-playground-tuning-control',
    },
    tokens: {
      panelRadius: '12px',
      controlRadius: '9px',
      primaryButtonBackground: '#7c2d12',
      primaryButtonColor: '#ffffff',
      panelShadow: '0 24px 72px rgba(124, 45, 18, 0.2)',
    },
    styles: {
      surface: {
        filter: 'drop-shadow(0 18px 40px rgba(124, 45, 18, 0.14))',
      },
      panel: {
        border: '1px solid rgba(124, 45, 18, 0.24)',
      },
      targetTag: {
        background: '#fff7ed',
        color: '#7c2d12',
      },
      sectionTitle: {
        color: '#7c2d12',
      },
    },
  },
};

export default withAgenticReactNext(nextConfig, {
  toolkit,
});
```

This example is drawn from `playground/agentic-react-next-playground/next.config.mjs`. Slot names include `root`, `surface`, `panel`, `arrow`, `title`, `body`, `targetTag`, `customPromptForm`, `customPromptInput`, `customPromptButton`, `sectionTitle`, `row`, `label`, `controlWrap`, `control`, `colorInput`, `numberInput`, `stepperButton`, `select`, `textarea`, `suffix`, and `closeButton`.

Token names are camelCase and become `--agentic-react-tuning-*` CSS variables. For example, `panelRadius` maps to `--agentic-react-tuning-panel-radius`, while `primaryButtonBackground` maps to `--agentic-react-tuning-primary-button-background`.

For DOM-level extensions, register a runtime extension in browser code with `window.__AGENTIC_REACT__?.registerTuningModalExtension({ id, beforeFields, afterFields, footer, wrapModal })`. `wrapModal` receives the modal `surfaceElement` and `panelElement`; return a cleanup function when adding listeners or observers.
