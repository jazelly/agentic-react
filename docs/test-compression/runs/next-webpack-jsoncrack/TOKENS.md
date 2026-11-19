# next-webpack-jsoncrack token counts: control vs agentic-node

o200k_base via gpt-tokenizer on the raw capture files (ANSI bytes included). saved = control - agentic-node (negative = agentic-node output is larger).

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| build-webpack-wasm-config | 1073 | 1068 | 5 | 0.5% | 1 | 1 |
| hydration-hero-cta-browser | 1657 | 1657 | 0 | 0.0% | 0 | 0 |
| hydration-hero-cta-dev | 1134 | 1153 | -19 | -1.7% | n/a (killed) | n/a (killed) |
| runtime-editor-title-crash-browser | 3303 | 3303 | 0 | 0.0% | 0 | 0 |
| runtime-editor-title-crash-dev | 713 | 713 | 0 | 0.0% | n/a (killed) | n/a (killed) |
| runtime-editor-title-crash-typecheck | 246 | 246 | 0 | 0.0% | 1 | 1 |
