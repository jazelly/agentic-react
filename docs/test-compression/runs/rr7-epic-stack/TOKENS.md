# rr7-epic-stack: control vs agentic-node

o200k_base token counts (gpt-tokenizer) over the raw capture files, ANSI bytes included. saved = control - agentic-node.

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| a-vitest-happy | 4719 | 4337 | 382 | 8.1% | 0 | 0 |
| b-double-check-fail | 1090 | 1003 | 87 | 8.0% | 1 | 1 |
| c-e2e-playwright | 40079 | 24641 | 15438 | 38.5% | 0 | 0 |
| d-hydration-browser-console | 521 | 521 | 0 | 0.0% | n/a (dev server) | n/a (dev server) |
| d-hydration-devserver | 4768 | 3244 | 1524 | 32.0% | n/a (dev server) | n/a (dev server) |
