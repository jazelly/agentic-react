# vite-shadcn-admin: control vs agentic-node

o200k_base token counts (gpt-tokenizer) over the raw capture files, ANSI bytes included. saved = control - agentic-node.

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| a-test-happy | 147 | 136 | 11 | 7.5% | 0 | 0 |
| b-signout-full-suite-fail | 571 | 473 | 98 | 17.2% | 1 | 1 |
| b-signout-hidden-test-fail | 507 | 409 | 98 | 19.3% | 1 | 1 |
| c-tasks-crash-browser-console | 633 | 633 | 0 | 0.0% | n/a (dev server) | n/a (dev server) |
| c-tasks-crash-devserver | 830 | 307 | 523 | 63.0% | n/a (dev server) | n/a (dev server) |
| d-bad-import-browser-console | 219 | 445 | -226 | -103.2% | n/a (dev server) | n/a (dev server) |
| d-bad-import-devserver | 2547 | 1790 | 757 | 29.7% | n/a (dev server) | n/a (dev server) |
