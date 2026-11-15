# 指标定义（agentic-react benchmark）

目标：在**同一任务、同一模型、同一 agent 版本**下，比较「baseline」和「agentic-react enabled」两组，量化 agentic-react 是否降低 AI agent 做 React 开发的成本，同时不降低成功率。

## 1. 主指标

| 指标 | 定义 | 来源 |
|---|---|---|
| **success** | 任务的 `check.steps` 全部通过（非 optional 步骤）。由 `lib/task-kit.mjs#runChecks` 在 agent 结束后的 workspace 上执行 | checker |
| **output_tokens** | 本次运行所有模型请求的输出 token 总和 = 推理 + 写出的代码/文本 + tool-call 参数 | agent usage |
| ├ reasoning_tokens | 推理/思考 token（能拆时才拆）。Codex：`reasoning_output_tokens`；Claude Code：不单独上报，记 `null` | agent usage |
| └ completion_tokens | `output_tokens - reasoning_tokens`（含 tool-call 参数）。另记 `tool_call_arg_chars` 作为 tool-call 参数的近似体量 | 计算 |
| **turns** | 模型请求轮数（一次 assistant 回复 = 1 轮，含 tool 调用轮）。Claude Code：`result.num_turns`；Codex：`tool 调用数 + 1`（近似，Codex 不逐请求上报） | agent log |

为什么 output 和 turns 是主指标：output token 单价通常是 input 的 4–8 倍，且不受 prompt cache 影响；每多一轮都要重付一遍（大部分被缓存的）上下文。定位更快、错误信息更短，体现在**更少的轮数**和**更少的推理/试错输出**上。

## 2. 次指标

| 指标 | 定义 |
|---|---|
| input_tokens | 非缓存输入 token（按 agent 口径；Codex 的 `input_tokens` 含 cached，需用 `input_tokens - cached_input_tokens` 得非缓存部分） |
| cached_input_tokens | 缓存命中的输入 token |
| tool_output_chars | agent 实际看到的工具输出字符数（命令 stdout/stderr、MCP 结果）。直接反映 agentic-react 压缩输出的效果 |
| wall_ms | 从启动 agent 到退出的墙钟时间（不含 checker） |
| cost_usd | 仅在 agent 上报时记录（Claude Code `total_cost_usd`）；否则离线按价目表估算，单列说明价格假设 |
| diffstat | agent 最终改动规模，用于发现"改太多" |

## 3. A/B 两组

| | baseline (A) | agentic (B) |
|---|---|---|
| 仓库与任务 | 同一 pinned SHA、同一 setup 注入 | 同左 |
| agent / 模型 / 版本 / 温度 / 预算 | 固定，记录在结果里（`ARB_MODEL`） | 同左 |
| 基础工具 | shell + 文件编辑；dev server 可由 agent 自己启动 | 同左 |
| agentic-react | **关闭**，`AGENTIC_REACT_OUT=raw` | 按 `arms/agentic/<repo>.json` 注入 adapter（Vite/webpack/Next 插件）+ MCP 配置 + `AGENTS.snippet.md`；`AGENTIC_REACT_OUT=compact` |

公平性约定：

- 两组都**不**预先提供截图或浏览器工具；是否给 baseline 配 `playwright-cli` / chrome-devtools-mcp 是待定项（见 README「待决定」）。
- 两组 prompt 完全相同，prompt 里不提 agentic-react。arm B 只通过工具和一小段 AGENTS 说明暴露能力（这段说明的 token 计入 B 的成本）。
- workspace 去掉上游 `.git`，重新 init 一个 baseline commit，agent 无法通过 `git diff` 直接看到注入的 bug。
- hidden test 只在 checker 阶段拷入，跑完即删。

## 4. 统计方法

- 每个任务每组至少 3 次（`--reps 3`）；先取每组中位数，再按任务配对。
- 汇总：成功率（两组各自的 passed/total，以及配对差）；output_tokens、turns 等用**每任务比值 B/A 的中位数**（`scripts/summarize.mjs`），并给 bootstrap 95% CI（TODO：可复用 agentic-node `benchmark/scripts/analyze.mjs` 的实现）。
- 只在**两组都成功**的任务上比较 token/turns；成功率下降时一律视为负收益，单独报告。
- 分维度报告：按 bundler（vite / webpack / rsbuild / turbopack）、framework、category（ui-locate-edit / runtime-error / ssr-error / hydration / state-bug / build-type-error）分组。

## 5. 结果记录格式（`results/results.jsonl`，每行一次运行）

```json
{"task":"vite-shadcn-admin/runtime-tasks-status-crash","category":"runtime-error","repo":"vite-shadcn-admin",
 "arm":"agentic","rep":1,"agent":"claude-code","model":"…","success":true,
 "output_tokens":4210,"reasoning_tokens":null,"completion_tokens":null,"turns":9,"tool_calls":8,"tool_call_arg_chars":3100,
 "input_tokens":5200,"cached_input_tokens":182000,"tool_output_chars":14800,"wall_ms":95000,"cost_usd":0.21,
 "diffstat":"1 file changed, 4 insertions(+), 1 deletion(-)","steps":[{"type":"regex","ok":true,"detail":"…"}]}
```

## 6. 已知局限

- Codex 的 `turns` 是近似值；Claude Code 不拆分 reasoning。跨 agent 只比较各自的 B/A 比值，不比较绝对值。
- 静态 regex 检查只能确认"改对了地方"，不保证运行时完全正确；有现成测试的任务优先用测试（hidden-test / cmd）。标了 `optional` 的 `browser` 步骤默认不跑。
- 一部分任务的 oracle（注入后 check 失败、修复后 check 通过）尚未在本机跑过，见 README。
