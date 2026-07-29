# Agentic React

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

**让 coding agent 用更少的 token 和搜索时间找到并修改 UI 背后的 React 源码，而且不要求模型具备 multimodal 能力。**

在浏览器中选择一个或多个元素。Agentic React 会把 selection 转换成 source-aware text/JSON，其中包含 React component、稳定 selector、source file、附近源码、owner trace，以及已经准备好的 UI tuning prompts。

## 真实源码定位任务实测

在三个 UI 区域的受控 benchmark 中，两种输入方式都找到了正确的 React 源码。用粘贴的 Agentic React UI context 代替裁剪截图后，agent 定位这些源码所使用的 token 和观察到的运行时间均有下降：

| 实测结果             | 裁剪截图 | Agentic React context |      降幅 |
| -------------------- | -------: | --------------------: | --------: |
| 总 token             |  388,694 |               180,302 | **53.6%** |
| 观察到的源码定位时间 |   84.63s |                66.20s | **21.8%** |
| API 等价成本         |  $0.3699 |               $0.1254 | **66.1%** |

这组数据来自三个 UI 区域，不代表对所有场景的普遍保证。完整的受控 prompt、对照矩阵、文件哈希、定价假设和限制条件，请参阅[中文 Benchmark 文章](./docs/blog/agentic-react-ui-context-token-benchmark.zh-CN.md)与[原始证据清单](./docs/benchmarks/ui-context-token-study/results.json)。

## 为什么用 Agentic React

- **减少定位源码所需的 token：** 直接给 agent component、selector、source location 和附近源码，不再让它从像素内容推断这些信息。
- **不要求 multimodal model：** 复制出的 context 是结构化 text/JSON，因此源码定位流程不依赖截图理解或 vision-capable model。
- **覆盖 React 生态：** bundler-agnostic core 配合 Vite、Webpack、Next.js adapters，并提供 Nx/module-federation playground。
- **为 agent handoff 而设计：** 可以直接复制 context，也可以通过本地 MCP tools 暴露；选中的 UI 和对应源码始终放在一起。
- **预先生成 UI tuning prompt：** 在 tuning modal 中选择颜色、字体、尺寸、间距或 layout。Agentic React 会把具体修改要求与 agent 应该编辑的准确源码位置放进同一份内容。

## 复制的是修改要求，不只是 Selector

在 tuning modal 中选择新的文字颜色或 font family 后，Agentic React 会生成明确指令。复制出的 payload 会把指令、component 和 source trace 一起交给 agent：

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

agent 同时拿到期望的 UI 修改，以及这项修改应该落在 codebase 的什么位置。

## Demo

### Single Select

![Single Select demo](./playground/demo/demo1-single-select.gif)

### Multiselect

![Multiselect demo](./playground/demo/demo2-multiselect.gif)

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
