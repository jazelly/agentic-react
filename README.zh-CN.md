# Agentic React

[English](./README.md) | [中文](./README.zh-CN.md)

**把 UI 背后的 React 上下文和源码位置，直接交给 coding agent。**

Agentic React 会为你选中的 React UI 标注 component name、DOM selector、source file location、source snippet、owner trace，并通过本地 MCP tools 暴露给 agent。这样 agent 不需要靠猜测从“页面上这个东西”定位到代码，而是可以直接拿到可执行的 React/source context。

```text
<web_context type="react_component_location">
component: ProfileField
selector: #profile-field-email
source: src/components/UserProfile/ProfileField.jsx:19
source trace:
  -> <ProfileField> at src/components/UserProfile/ProfileField.jsx:19
  -> <ProfileContent> at src/components/UserProfile/ProfileContent.jsx:54
</web_context>
```

安装一个 dev adapter，在浏览器里选择一个或多个元素，然后把 source-aware React context 直接传给你的 agent。

## Demo

### Single Select

![Single Select demo](./playground/demo/demo1-single-select.gif)

### Multiselect

![Multiselect demo](./playground/demo/demo2-multiselect.gif)

## 为什么用 Agentic React

- **Source-aware selection:** 点击真实 UI，捕获 React component、稳定 selector、源码位置和附近源码。
- **Agent-ready context:** selection 可以复制成 text/JSON，也可以通过 MCP 暴露给本地 coding agent。
- **Bundler-native adapters:** 同一套 runtime 支持 Vite、Webpack、Next.js，以及 Nx/module-federation playground。
- **Dev-only bridge:** 本地源码查找和 MCP transport 只存在于开发工具链，不进入 production bundle。
- **Multi-select and tuning:** 一次收集多个 UI target，检查样式，并把视觉调整转成 prompt-ready instructions。

packages 发布在 `@agentic-react` namespace 下。

## Packages

- `@agentic-react/core`: bundler-agnostic browser runtime、React selection toolkit 和 MCP primitives。
- `@agentic-react/vite`: Vite 本地开发 adapter。
- `@agentic-react/webpack`: Webpack 本地开发 adapter。
- `@agentic-react/next`: Next.js 本地开发 adapter。

完整的 local-dev 功能需要安装对应 bundler 的 adapter。adapter 内部依赖 `@agentic-react/core`，所以 app 用户通常不需要同时安装二者。

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

Vite adapter 会注入 core browser runtime，把 runtime bridge 挂到 dev server，并通过下面的地址暴露 MCP：

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

Webpack adapter 会 prepend generated runtime entry，把 runtime bridge 挂到 webpack-dev-server，并在这里暴露 MCP：

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

Next adapter 会通过 Next 的 Webpack config 注入 browser runtime，并启动本地 bridge server。默认 MCP 地址：

```text
http://127.0.0.1:51426/mcp
```

## Runtime-Only Usage

如果只需要 browser-side selection/runtime APIs，不需要本地源码查找或 MCP dev-server wiring，可以直接使用 `@agentic-react/core`。

```bash
pnpm install @agentic-react/core
```

```ts
import { createSelectionToolkit } from '@agentic-react/core';

const toolkit = createSelectionToolkit();
toolkit.enable();
```

runtime-only mode 可以检查 live browser tree，但不能读取或编辑本地文件。source lookup 和 local MCP transport 是 adapter layer 的职责。

## Adapters 额外提供什么

`@agentic-react/core` 运行在浏览器中，可以选择元素、检查 React fibers、高亮组件、格式化 selection context，并暴露 `window.__AGENTIC_REACT__` / `window.__AGENTIC_REACT_TOOLS__`。

Bundler adapters 会增加 runtime 自己无法知道的 local-dev 能力：

- 自动注入 core runtime
- 挂载本地 MCP Streamable HTTP `/mcp` endpoint
- 把 MCP calls 从 Node bridge 到 browser runtime
- 提供 source-root context，用于 source lookup
- 让 dev-only tooling 不进入 production bundles

## Tuning Modal API

selection overlay 包含 tuning modal，可以把视觉调整转换成 prompt text。你可以通过 adapter 的 `toolkit` option 配置它，也可以在 runtime 中调用 `window.__AGENTIC_REACT__.setToolkitConfig()`。

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

`tuningModal.classNames` 会把 classes 加到 modal slots 上。`tuningModal.styles` 会把 inline style objects 应用到同样的 slots。支持的 slots 包括 `root`, `surface`, `panel`, `arrow`, `title`, `body`, `targetTag`, `customPromptForm`, `customPromptInput`, `customPromptButton`, `sectionTitle`, `row`, `label`, `controlWrap`, `control`, `colorInput`, `numberInput`, `stepperButton`, `select`, `textarea`, `suffix`, 和 `closeButton`。

`tuningModal.tokens` 会把 camelCase token names 映射到以 `--agentic-react-tuning-` 开头的 CSS variables。比如 `panelRadius` 会变成 `--agentic-react-tuning-panel-radius`，`primaryButtonBackground` 会变成 `--agentic-react-tuning-primary-button-background`。

adapter 这样传入 config：

```ts
// Vite
AgenticReact({ toolkit });

// Webpack
withAgenticReactWebpack(config, { mode: 'development' }, { toolkit });

// Next.js
withAgenticReactNext(nextConfig, { toolkit });
```

如果需要结构级扩展，可以注册 browser-side tuning modal extension。slot renderers 可以在 fields 前后或 footer 中加入自定义 DOM。`wrapModal` 会收到 `surfaceElement` 和 `panelElement`，方便 design system 加 wrappers、data attributes、observers、portals 或 cleanup-aware 行为。

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

## Custom Tools

Adapters 支持 browser-side custom tools。shared types 可以从你正在使用的 adapter package 中 import：

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

本地运行 release automation smoke test：

```bash
pnpm run test:release-smoke
```

这个测试不会 publish 到 npm，也不会调用 GitHub。它会读取 `.github/workflows/release.yml`，创建临时 git fixtures，并使用 fake `pnpm` 和 `gh` commands 覆盖 release automation branches。

## Development

```bash
pnpm run build
pnpm run playground:vite
pnpm run playground:webpack
pnpm run playground:next
pnpm run playground:nx-mf
```

e2e automation 使用 playground package configs 中固定的本地端口。

## Acknowledgement

This project is inspired by [vite-plugin-vue-mcp](https://github.com/webfansplz/vite-plugin-vue-mcp).

## License

MIT
