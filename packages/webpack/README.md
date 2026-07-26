# @agentic-react/webpack

Webpack adapter for Agentic React local-dev MCP integration.

```bash
pnpm install @agentic-react/webpack -D
```

```js
import withAgenticReactWebpack from '@agentic-react/webpack';

export default (env, argv) =>
  withAgenticReactWebpack(config, { mode: argv.mode });
```

This adapter injects `@agentic-react/core` through a generated browser entry, attaches the local runtime bridge to webpack-dev-server, and exposes MCP over Streamable HTTP at `/mcp`.

## Settings Configuration

The Webpack adapter enables the toolbox Settings section because it hosts the local bridge used for persistence. User overrides are global to the machine under `~/.agentic-react/` and take precedence over project defaults and package defaults.

Use `settingsRoot` only when you need an isolated settings directory for tests, demos, or temporary environments. Project defaults are configured with `toolkit.settings.shortcuts`, and the project default launcher icon is configured with `toolkit.iconUrl`.

```ts
import withAgenticReactWebpack from '@agentic-react/webpack';
import type { AgenticReactToolkitConfig } from '@agentic-react/webpack';

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

export default (env = {}, argv = {}) =>
  withAgenticReactWebpack(
    config,
    { mode: argv.mode || env.mode || 'development' },
    {
      settingsRoot: '/tmp/agentic-react-settings',
      toolkit,
    },
  );
```

The Settings UI can change shortcuts and crop a custom toolbox icon. Reset removes the global override and falls back to the project default when present, otherwise to the package default. `Escape` is reserved for cancelling pending selection and cannot be assigned.

Clicking a target captures a pending selection but does not copy it. Click Done, or press the configured Done shortcut, to copy and commit the pending selection; multiselect copies the complete pending set.

## Tuning Modal Configuration

Pass tuning modal options as the third argument to `withAgenticReactWebpack`. The `toolkit` object uses the shared `ToolkitConfig` shape; `toolkit.tuningModal` accepts `classNames`, `styles`, and `tokens`.

```ts
import withAgenticReactWebpack from '@agentic-react/webpack';
import type { ToolkitConfig } from '@agentic-react/webpack';

const toolkit: ToolkitConfig = {
  tuningModal: {
    classNames: {
      surface: 'webpack-playground-tuning-surface',
      panel: 'webpack-playground-tuning-panel',
      control: 'webpack-playground-tuning-control',
    },
    tokens: {
      panelRadius: '12px',
      controlRadius: '9px',
      primaryButtonBackground: '#1d4ed8',
      primaryButtonColor: '#ffffff',
      panelShadow: '0 24px 72px rgba(29, 78, 216, 0.22)',
    },
    styles: {
      surface: {
        filter: 'drop-shadow(0 18px 40px rgba(29, 78, 216, 0.16))',
      },
      panel: {
        border: '1px solid rgba(29, 78, 216, 0.24)',
      },
      targetTag: {
        background: '#eff6ff',
        color: '#1d4ed8',
      },
      sectionTitle: {
        color: '#1d4ed8',
      },
    },
  },
};

export default (env = {}, argv = {}) =>
  withAgenticReactWebpack(
    config,
    { mode: argv.mode || env.mode || 'development' },
    { toolkit },
  );
```

This example is drawn from `playground/agentic-react-webpack-playground/webpack.config.mjs`. Slot names include `root`, `surface`, `panel`, `arrow`, `title`, `body`, `targetTag`, `customPromptForm`, `customPromptInput`, `customPromptButton`, `sectionTitle`, `row`, `label`, `controlWrap`, `control`, `colorInput`, `numberInput`, `stepperButton`, `select`, `textarea`, `suffix`, and `closeButton`.

Token names are camelCase and become `--agentic-react-tuning-*` CSS variables. For example, `panelRadius` maps to `--agentic-react-tuning-panel-radius`, while `primaryButtonBackground` maps to `--agentic-react-tuning-primary-button-background`.

For DOM-level extensions, register a runtime extension in browser code with `window.__AGENTIC_REACT__?.registerTuningModalExtension({ id, beforeFields, afterFields, footer, wrapModal })`. `wrapModal` receives the modal `surfaceElement` and `panelElement`; return a cleanup function when adding listeners or observers.
