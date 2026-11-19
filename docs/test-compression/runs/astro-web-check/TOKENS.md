# astro-web-check token counts: control vs agentic-node

o200k_base via gpt-tokenizer on the raw capture files (ANSI bytes included). saved = control - agentic-node (negative = agentic-node output is larger).

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| astro-build-happy | 1687 | 1689 | -2 | -0.1% | 0 | 0 |
| astro-dev-happy | 427 | 409 | 18 | 4.2% | foreground dev command 0; astro dev logs 0 | foreground dev command 0; astro dev logs 0 |
| dev-yarn-engines-refusal | 160 | 123 | 37 | 23.1% | 1 | 1 |
| island-results-not-hydrated-browser | 28 | 28 | 0 | 0.0% | 0 | 0 |
| island-results-not-hydrated-dev | 1087 | 651 | 436 | 40.1% | foreground dev command 0; astro dev logs 0 | foreground dev command 0; astro dev logs 0 |
| ssr-home-background-window-browser | 28 | 28 | 0 | 0.0% | 0 | 0 |
| ssr-home-background-window-browser-default | 56 | 56 | 0 | 0.0% | 0 | 0 |
| ssr-home-background-window-check | 1688 | 1688 | 0 | 0.0% | 0 | 0 |
| ssr-home-background-window-check-boss | 2101 | 2152 | -51 | -2.4% | 1 | 1 |
| ssr-home-background-window-dev | 772 | 754 | 18 | 2.3% | foreground dev command 0; astro dev logs 0 | foreground dev command 0; astro dev logs 0 |
| ssr-home-background-window-dev-default | 446 | 428 | 18 | 4.0% | foreground dev command 0; astro dev logs 0 | foreground dev command 0; astro dev logs 0 |
