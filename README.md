# Agentic React

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

**Help coding agents find and change the React source behind a UI with fewer tokens and less search time—without requiring a multimodal model.**

Select one or many elements in the browser. Agentic React turns each selection into source-aware text or JSON containing the React component, stable selector, source file, nearby code, owner trace, and any prepared UI tuning prompts.

## Measured on Real Source-Location Tasks

In a controlled three-area benchmark, both input methods found the correct React source. Replacing cropped screenshots with pasted Agentic React UI context reduced the tokens and observed runtime used by the agent to locate that source:

| Measured result                  | Cropped screenshots | Agentic React context | Reduction |
| -------------------------------- | ------------------: | --------------------: | --------: |
| Total tokens                     |             388,694 |               180,302 | **53.6%** |
| Observed source-location runtime |              84.63s |                66.20s | **21.8%** |
| API-equivalent cost              |             $0.3699 |               $0.1254 | **66.1%** |

This is measured evidence from three UI areas, not a general guarantee. See the [benchmark write-up](./docs/blog/agentic-react-ui-context-token-benchmark.md) and [raw evidence manifest](./docs/benchmarks/ui-context-token-study/results.json) for the controlled prompt, full matrix, hashes, pricing assumptions, and limitations.

## Why Agentic React

- **Spend fewer tokens locating source:** give the agent a component, selector, source location, and nearby code instead of making it infer all of that from pixels.
- **No multimodal model required:** copied context is structured text or JSON, so source-location workflows do not depend on screenshot interpretation or vision-capable models.
- **Works across the React ecosystem:** use a bundler-agnostic core with adapters for Vite, Webpack, and Next.js, plus Nx/module-federation playgrounds.
- **Built for agent handoff:** copy context directly or expose it through local MCP tools, with the selected UI and its source kept together.
- **Prepared UI tuning prompts:** choose colors, typography, dimensions, spacing, or layout in the tuning modal. Agentic React places the resulting change request beside the exact source location the agent should edit.

## Copy a Change Request, Not Just a Selector

The tuning modal turns choices such as a new text color or font family into explicit instructions. The copied payload carries those instructions with the component and source trace:

```text
<web_context type="react_component_location">
component: ProfileField
tuning prompts:
- Change <ProfileField> in src/components/UserProfile/ProfileField.jsx:19 text color to rgb(15, 118, 110).
- Change <ProfileField> in src/components/UserProfile/ProfileField.jsx:19 font family to Inter.
selector: #profile-field-email
source: src/components/UserProfile/ProfileField.jsx:19
source trace:
  -> <ProfileField> at src/components/UserProfile/ProfileField.jsx:19
  -> <ProfileContent> at src/components/UserProfile/ProfileContent.jsx:54
</web_context>
```

The agent receives both the desired UI change and the place in the codebase where that change belongs.

## Demos

### Single Select

![Single Select demo](./playground/demo/demo1-single-select.gif)

### Multiselect

![Multiselect demo](./playground/demo/demo2-multiselect.gif)

The packages are published under the `@agentic-react` namespace.

## Packages

- `@agentic-react/core`: bundler-agnostic browser runtime, React selection toolkit, and MCP primitives.
- `@agentic-react/vite`: Vite adapter for local dev.
- `@agentic-react/webpack`: Webpack adapter for local dev.
- `@agentic-react/next`: Next.js adapter for local dev.

For full local-dev features, install the adapter for your bundler. The adapter depends on `@agentic-react/core` internally, so app users do not need to import both packages.

## Local Dev Usage

### Vite

```bash
pnpm install @agentic-react/vite -D
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import AgenticReact from '@agentic-react/vite';

export default defineConfig({
  plugins: [AgenticReact()],
});
```

The Vite adapter injects the core browser runtime, attaches the runtime bridge to the dev server, and exposes MCP over:

```text
http://localhost:<vite-port>/mcp
```

### Webpack

```bash
pnpm install @agentic-react/webpack -D
```

```js
// webpack.config.mjs
import withAgenticReactWebpack from '@agentic-react/webpack';

export default (env, argv) =>
  withAgenticReactWebpack(config, { mode: argv.mode });
```

The Webpack adapter prepends a generated runtime entry, attaches the runtime bridge to webpack-dev-server, and exposes MCP at:

```text
http://localhost:<webpack-dev-server-port>/mcp
```

### Next.js

```bash
pnpm install @agentic-react/next -D
```

```js
// next.config.mjs
import withAgenticReactNext from '@agentic-react/next';

export default withAgenticReactNext(nextConfig);
```

The Next adapter injects the browser runtime through Next's Webpack config and starts a local bridge server. By default MCP is available at:

```text
http://127.0.0.1:51426/mcp
```

## Runtime-Only Usage

Use `@agentic-react/core` directly when you only need browser-side selection/runtime APIs and do not need local source-file lookup or MCP dev-server wiring.

```bash
pnpm install @agentic-react/core
```

```ts
import { createSelectionToolkit } from '@agentic-react/core';

const toolkit = createSelectionToolkit();
toolkit.enable();
```

Runtime-only mode can inspect the live browser tree, but it cannot read or edit local files. Source lookup and local MCP transport are the adapter layer's job.

## What Adapters Add

`@agentic-react/core` runs in the browser and can select elements, inspect React fibers, highlight components, format selection context, and expose `window.__AGENTIC_REACT__` / `window.__AGENTIC_REACT_TOOLS__`.

Bundler adapters add local-dev capabilities that the runtime cannot know on its own:

- inject the core runtime automatically
- attach a local MCP Streamable HTTP `/mcp` endpoint
- bridge MCP calls from Node to the browser runtime
- provide local source-root context for source lookup
- persist toolbox Settings through the adapter-hosted bridge
- keep dev-only tooling out of production bundles

## Settings and Selection Confirmation

The toolbox includes a Settings section when it runs through a supported dev adapter. Settings can configure the single-select, multiselect, toolbox-toggle, and Done shortcuts, and can replace the launcher icon with a cropped custom image.

User settings are global to the local machine and are stored under `~/.agentic-react/`. They are not scoped to a project, browser origin, hostname, port, or bundler. Effective values are resolved in this order:

```text
global user override
  > project configuration default
  > package default
```

Resetting a setting removes only the global override, revealing the project default when one exists and otherwise the package default. Project defaults come from adapter options: `toolkit.settings.shortcuts` for shortcut defaults and `toolkit.iconUrl` for the default toolbox icon.

The package defaults are:

| Action         | Default shortcut   |
| -------------- | ------------------ |
| Single select  | `Ctrl+Alt+Shift+S` |
| Multi select   | `Ctrl+Alt+Shift+M` |
| Toggle toolbox | `Ctrl+Alt+Shift+A` |
| Done           | `Enter`            |

`Escape` is reserved for cancellation and is not configurable. Shortcut recording validates one non-modifier key, supported keys only, and no duplicate normalized shortcuts.

`settingsRoot` is an adapter option for isolated environments such as tests, demos, and temporary sandboxes. Production-like local usage should normally omit it so Agentic React uses the user's global `~/.agentic-react` directory.

```ts
// Vite
AgenticReact({
  settingsRoot: '/tmp/agentic-react-settings',
  toolkit: {
    iconUrl: '/agentic-react-logo.png',
    settings: {
      shortcuts: {
        singleSelect: 'Ctrl+Shift+S',
        done: 'Enter',
      },
    },
  },
});

// Webpack
withAgenticReactWebpack(
  config,
  { mode: 'development' },
  {
    settingsRoot: '/tmp/agentic-react-settings',
    toolkit: {
      iconUrl: '/agentic-react-logo.png',
      settings: {
        shortcuts: {
          multiSelect: 'Ctrl+Shift+M',
        },
      },
    },
  }
);

// Next.js
withAgenticReactNext(nextConfig, {
  settingsRoot: '/tmp/agentic-react-settings',
  toolkit: {
    iconUrl: '/agentic-react-logo.png',
    settings: {
      shortcuts: {
        toggleToolbox: 'Ctrl+Shift+A',
      },
    },
  },
});
```

Selection is an explicit transaction. Clicking a target captures and displays context as pending; it does not copy immediately. Click Done or press the configured Done shortcut, `Enter` by default, to copy and commit the pending selection. In multiselect mode, Done copies the complete pending set. `Escape` cancels pending single and multiselect work without copying and preserves the last committed selection.

Runtime-only `@agentic-react/core` usage can still run browser-side selection APIs and code-provided toolkit defaults, but it has no persistent Settings without an adapter-hosted bridge.

## Tuning Modal API

The selection overlay includes a tuning modal for turning visual adjustments into prompt text. Configure it through the adapter `toolkit` option, or at runtime with `window.__AGENTIC_REACT__.setToolkitConfig()`.

```ts
import type { ToolkitConfig } from '@agentic-react/vite';

// Import ToolkitConfig from the adapter package you use.
const toolkit: ToolkitConfig = {
  enabled: true,
  defaultVisible: true,
  defaultExpanded: false,
  position: 'bottom-right',
  offset: { x: 20, y: 20 },
  accentColor: '#111827',
  zIndex: 2147483000,
  iconUrl: '/agentic-react-logo.png',
  tuningModal: {
    classNames: {
      surface: 'my-tuning-surface',
      panel: 'my-tuning-panel',
      control: 'my-tuning-control',
    },
    styles: {
      panel: { border: '1px solid rgba(15, 23, 42, 0.18)' },
      targetTag: { background: '#f8fafc', color: '#0f172a' },
    },
    tokens: {
      panelRadius: '14px',
      controlRadius: '10px',
      primaryButtonBackground: '#0f766e',
      primaryButtonColor: '#ffffff',
      panelShadow: '0 24px 72px rgba(15, 118, 110, 0.22)',
    },
  },
};
```

`tuningModal.classNames` adds classes to modal slots. `tuningModal.styles` applies inline style objects to the same slots. Supported slots are `root`, `surface`, `panel`, `arrow`, `title`, `body`, `targetTag`, `customPromptForm`, `customPromptInput`, `customPromptButton`, `sectionTitle`, `row`, `label`, `controlWrap`, `control`, `colorInput`, `numberInput`, `stepperButton`, `select`, `textarea`, `suffix`, and `closeButton`.

`tuningModal.tokens` maps camelCase token names to CSS variables prefixed with `--agentic-react-tuning-`. For example, `panelRadius` becomes `--agentic-react-tuning-panel-radius`, and `primaryButtonBackground` becomes `--agentic-react-tuning-primary-button-background`. Built-in controls currently read tokens such as `panelBackground`, `panelBorder`, `panelRadius`, `panelShadow`, `panelColor`, `controlBorder`, `controlRadius`, `controlBackground`, `controlColor`, `labelColor`, `sectionColor`, `primaryButtonBorder`, `primaryButtonBackground`, `primaryButtonColor`, `secondaryButtonBackground`, and `secondaryButtonColor`.

Adapters pass the config as:

```ts
// Vite
AgenticReact({ toolkit });

// Webpack
withAgenticReactWebpack(config, { mode: 'development' }, { toolkit });

// Next.js
withAgenticReactNext(nextConfig, { toolkit });
```

For structural extensions, register a browser-side tuning modal extension. Slot renderers can add custom DOM before fields, after fields, or in the footer. `wrapModal` receives the modal `surfaceElement` and `panelElement`, which lets design systems add wrappers, data attributes, observers, portals, or cleanup-aware behavior around the rendered modal.

```ts
const unregister = window.__AGENTIC_REACT__?.registerTuningModalExtension({
  id: 'design-system-audit',
  beforeFields({ container, context }) {
    const badge = document.createElement('div');
    badge.textContent = `Editing ${context.tagName}`;
    badge.className = 'agentic-design-system-badge';
    container.appendChild(badge);
  },
  wrapModal({ surfaceElement, actions }) {
    surfaceElement.dataset.designSystem = 'acme';
    const onTransitionEnd = () => actions.requestReposition();
    surfaceElement.addEventListener('transitionend', onTransitionEnd);
    return () => {
      surfaceElement.removeEventListener('transitionend', onTransitionEnd);
    };
  },
});
```

Concrete playground example:

```ts
// playground/agentic-react-vite-playground/vite.config.js
AgenticReact({
  toolkit: {
    iconUrl: '/agentic-react-logo.png',
    tuningModal: {
      classNames: {
        surface: 'vite-playground-tuning-surface',
        panel: 'vite-playground-tuning-panel',
        control: 'vite-playground-tuning-control',
      },
      tokens: {
        panelRadius: '14px',
        controlRadius: '10px',
        primaryButtonBackground: '#0f766e',
        primaryButtonColor: '#ffffff',
        panelShadow: '0 24px 72px rgba(15, 118, 110, 0.22)',
      },
      styles: {
        surface: {
          filter: 'drop-shadow(0 18px 40px rgba(15, 118, 110, 0.16))',
        },
        panel: {
          border: '1px solid rgba(15, 118, 110, 0.22)',
        },
        targetTag: {
          background: '#ecfeff',
          color: '#0f766e',
        },
        sectionTitle: {
          color: '#0f766e',
        },
      },
    },
  },
});
```

## Custom Tools

Adapters accept browser-side custom tools. Import shared types from the adapter package you use:

```ts
import type { ToolResultValue } from '@agentic-react/vite';

export default function logMessage(args: { message: string }): ToolResultValue {
  return {
    success: true,
    message: `Received: ${args.message}`,
  };
}
```

```ts
import { defineConfig } from 'vite';
import AgenticReact from '@agentic-react/vite';
import { z } from 'zod';
import logMessage from './src/tools/logMessage';

export default defineConfig({
  plugins: [
    AgenticReact({
      customTools: [
        {
          name: 'log-message',
          description: 'Log a message in the browser runtime',
          schema: z.object({ message: z.string() }),
          clientFunction: logMessage,
        },
      ],
    }),
  ],
});
```

## Release Smoke Test

Run the release automation smoke test locally with:

```bash
pnpm run test:release-smoke
```

The test does not publish to npm or call GitHub. It reads
`.github/workflows/release.yml`, creates temporary git fixtures, and uses fake
`pnpm` and `gh` commands for the release automation branches.
It protects the release regressions fixed in this workflow:

- pending changeset detection ignores `.changeset/README.md`, runs
  `version-packages` only when a real changeset Markdown file exists, commits
  `chore: version packages`, and pushes that commit back to `main`
- the release workflow remains a `main` push workflow and keeps publish order as
  version, build, publish, tag push, GitHub release creation
- package tags created during publishing are pushed with
  `git push origin --tags`
- GitHub releases are selected from tags that point at `HEAD` and filtered to
  `@agentic-react/*`, so stale package tags and non-package tags do not create
  releases

## Development

```bash
pnpm run build
pnpm run playground:vite
pnpm run playground:webpack
pnpm run playground:next
pnpm run playground:nx-mf
```

For e2e automation, Playwright uses fixed local ports configured in the playground package configs.

## Acknowledgement

This project is inspired by [vite-plugin-vue-mcp](https://github.com/webfansplz/vite-plugin-vue-mcp).

## License

MIT
