# agentic-react benchmark

衡量 agentic-react 能不能让 AI coding agent 做 React 开发时**少花 output token、少跑几轮**，同时成功率不降。指标定义见 [`METRICS.md`](METRICS.md)。

- **不用 playground**：全部是真实开源项目，pin 到固定 commit。
- **不只做 Vite**：主流 bundler 和 React 元框架各至少一个项目。
- 零依赖脚本（Node ≥ 22），仓库 clone 在 `repos/`（已 gitignore）。

## 项目矩阵

| id | bundler | framework | 渲染 | React | 包管理 | 许可 | 本机验证 |
|---|---|---|---|---|---|---|---|
| `vite-shadcn-admin` | Vite 8 (Rolldown) | React SPA + TanStack Router | CSR | 19.2 | pnpm | MIT | ✅ install + build（6.4s）+ oracle 4/4 |
| `webpack-portainer` | webpack 5.107 | React 17 SPA（AngularJS 混合） | CSR | 17 | pnpm | Zlib | clone + 配置 |
| `rsbuild-rsdoctor` | Rsbuild / Rspack（Rstack `rs`） | React SPA（antd） | CSR | 19.3 | pnpm 12（corepack） | MIT | clone + 配置 |
| `next-turbopack-boilerplate` | Turbopack（Next 16 默认） | Next.js 16.4 App Router | SSR + RSC | 19.2 | npm | MIT | clone + 配置 |
| `next-webpack-jsoncrack` | webpack 5（`next --webpack`，自定义 webpack()） | Next.js 16.3 Pages Router，静态导出 | SSG + hydration | 19.3 | pnpm | Apache-2.0 | ✅ install + build（45s）+ oracle 4/4 |
| `tanstack-start-trellaux` | Vite 8 + TanStack Start 插件 | TanStack Start | SSR | 19 | pnpm | MIT | clone（sparse）+ 配置 |
| `astro-web-check` | Vite（Astro 7） | Astro + React islands（+ Svelte） | SSG + islands | 19.3 | yarn 1 | MIT | clone + 配置 |
| `rr7-epic-stack` | Vite 7 + `@react-router/dev` | React Router v7 framework mode + Express | SSR | 19.2 | npm | MIT | clone + 配置 |

完整字段（repo URL、pinned SHA、dev/build/test/typecheck 命令、为什么选它、adapter 支持状态）在 [`manifest.json`](manifest.json)。

外部长任务（只引用，不复制数据）：`../../agentic-node/benchmark/suites/swe-marathon`（`nextjs-vite-rewrite`）和 `frontierswe-v2`（Remotion）。

## 目录

```text
benchmark/
├── manifest.json            # 仓库矩阵：repo、pinned SHA、bundler、framework、React 版本、命令、许可
├── METRICS.md               # 主/次指标、A/B 设计、统计方法、结果格式
├── tasks/<repo-id>/<task-id>/
│   ├── task.json            # prompt、setup.edits（注入 bug）、solution（oracle）、check.steps、budget
│   ├── prompt.md            # 同 prompt，方便人读
│   └── hidden/              # 部分任务的隐藏测试：只在 check 阶段拷入，跑完删除
├── arms/agentic/            # B 组 overlay：每个仓库怎么启用 agentic-react（目前只写了 vite-shadcn-admin 示例）
├── lib/task-kit.mjs         # 准备 workspace、应用 edits、跑 checks
├── lib/usage.mjs            # 解析 Claude Code / Codex 的 JSONL 用量
├── scripts/
│   ├── clone.mjs            # 按 manifest 重建 pinned clone（幂等，会报告 DRIFT）
│   ├── validate-tasks.mjs   # 静态校验所有 edits 能匹配；--oracle 跑"注入→失败→修复→通过"
│   ├── run.mjs              # A/B runner 骨架
│   └── summarize.mjs        # 配对汇总
├── repos/   (gitignored)    # pinned 浅 clone
├── runs/    (gitignored)    # scratch workspace + transcript
└── results/ (gitignored)    # results.jsonl
```

## 任务

8 个仓库 × 4 = **32 个任务**，类别分布：

| category | 数量 | 说明 |
|---|---:|---|
| `ui-locate-edit` | 8 | 只描述 UI 上看到的东西，不给文件名；考定位 + 小改 |
| `state-bug` | 7 | 排序/状态/校验逻辑被注入 bug，表现为 UI 行为错 |
| `build-type-error` | 6 | tsc 大量报错（如 portainer 88 处调用点）、webpack alias 断了、Next webpack wasm 配置被删、未完成的 prop 重命名 |
| `hydration` | 5 | SSR/SSG 框架的 hydration mismatch、Astro island 指令丢失 |
| `runtime-error` | 3 | 浏览器运行时崩溃（undefined 访问等） |
| `ssr-error` | 3 | Server Component / loader / 预渲染时报错 |

`task.json` 的 check 步骤类型：`regex`（文件内容必须/不得匹配）、`cmd`（命令退出码，`@typecheck`/`@build`/`@dev` 取自 manifest）、`hidden-test`、`only-changed`（只允许改这些文件）、`forbid`（diff 里不得出现 `@ts-ignore` / `as any` 等）、`browser`（可选：起 dev server，用 Playwright 看 console 有没有 hydration 报错）。

## 怎么跑

```bash
cd benchmark
node scripts/clone.mjs                      # 首次或换机器：按 pinned SHA 重建 repos/
node scripts/validate-tasks.mjs             # 静态校验 32 个任务的注入点都能精确匹配

# 安装依赖（在 pinned clone 里装一次，scratch workspace 用 APFS clone 复制，很快）
cd repos/vite-shadcn-admin && pnpm install --ignore-workspace --frozen-lockfile && cd ../..
#   ⚠ 没有自带 pnpm-workspace.yaml 的仓库一定要加 --ignore-workspace，
#     否则 pnpm 会往上找到 agentic-react 根目录的 workspace，把整个 monorepo 装一遍。

node scripts/validate-tasks.mjs --oracle vite-shadcn-admin   # oracle：注入后 check 失败、修复后通过

# A/B（默认 Claude Code；--agent codex 用 Codex CLI）
ARB_MODEL=<model-id> node scripts/run.mjs --task vite-shadcn-admin/runtime-tasks-status-crash --arm both --reps 3
node scripts/run.mjs --task next-webpack-jsoncrack --arm baseline --dry-run   # 只打印命令
node scripts/summarize.mjs
```

runner 做的事：APFS copy-on-write 复制 pinned clone → 删除上游 `.git` → 应用 setup 注入 → 新建 scratch baseline commit → （B 组）应用 `arms/agentic/<repo>.json` + 写 MCP 配置 → 启动 agent → 解析用量 → 跑 checks → 追加到 `results/results.jsonl`。

## B 组（agentic-react enabled）怎么接入

| 仓库 | adapter | 状态 |
|---|---|---|
| vite-shadcn-admin / rr7-epic-stack / tanstack-start-trellaux | `@agentic-react/vite` | 有 adapter；示例 overlay 见 `arms/agentic/vite-shadcn-admin.json`；SSR 框架需确认 runtime 注入只在客户端 |
| webpack-portainer | `@agentic-react/webpack` | 有 adapter，overlay 待写 |
| next-webpack-jsoncrack | `@agentic-react/next` | 有 adapter（webpack 模式），overlay 待写 |
| next-turbopack-boilerplate | `@agentic-react/next` | **缺**：现有 adapter 只改 webpack 配置，Turbopack 需要新的注入方式 |
| rsbuild-rsdoctor | — | **缺**：需验证 webpack adapter 在 Rspack 下可用，或新做 `@agentic-react/rsbuild` |
| astro-web-check | `@agentic-react/vite`（经 `astro.config` 的 `vite.plugins`） | **待验证**：islands 下 runtime 需要按 island root 挂载 |

## 已知问题 / 注意

- `next-webpack-jsoncrack`：直接在 `apps/www` 跑 `next build` 会因 workspace 包 `jsoncrack-react` 未构建而失败，用 manifest 里的 turbo 命令。
- `next-turbopack-boilerplate`：需要 `CLERK_SECRET_KEY`（`.env` 只带了 publishable key）。
- `astro-web-check`：`engines.node` 要求 `^24.16.0`，本机是 24.15.0，yarn 1 会拒绝安装（升级 Node 或 `--ignore-engines`）。
- `rsbuild-rsdoctor`：要求 pnpm 12（corepack），本机全局是 10.6.5。
- `tanstack-start-trellaux`：example 目录没有 lockfile，依赖版本会漂移。
- 已在本机跑通 oracle（注入→check 失败→修复→check 通过）：`vite-shadcn-admin` 4/4、`next-webpack-jsoncrack` 4/4。其余 6 个仓库只做了静态校验（32/32 注入点精确匹配），依赖尚未安装。
