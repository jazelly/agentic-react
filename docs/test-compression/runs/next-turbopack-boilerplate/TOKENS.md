# next-turbopack-boilerplate token counts: control vs agentic-node

o200k_base via gpt-tokenizer on the raw capture files (ANSI bytes included). saved = control - agentic-node (negative = agentic-node output is larger).

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| hydration-locale-switcher-browser | 1203 | 1203 | 0 | 0.0% | 0 | 0 |
| hydration-locale-switcher-dev | 991 | 1004 | -13 | -1.3% | n/a (killed) | n/a (killed) |
| playwright-e2e | 1410 | 1397 | 13 | 0.9% | 1 | 1 |
| playwright-e2e-port5432-conflict | 584 | 584 | 0 | 0.0% | 1 | 1 |
| ssr-current-count-crash-browser | 518 | 518 | 0 | 0.0% | 0 | 0 |
| ssr-current-count-crash-dev | 525 | 525 | 0 | 0.0% | n/a (killed) | n/a (killed) |
| validation-counter-range-check | 0 | 0 | 0 | - | 1 | 1 |
| validation-counter-range-playwright | 1254 | 1209 | 45 | 3.6% | 1 | 1 |
| vitest-happy | 144 | 133 | 11 | 7.6% | 0 | 0 |
