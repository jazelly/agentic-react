# rsbuild-rsdoctor token counts: control vs agentic-node

o200k_base via gpt-tokenizer on the raw capture files (ANSI bytes included). saved = control - agentic-node (negative = agentic-node output is larger).

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| build-broken-import | 1193 | 1093 | 100 | 8.4% | 1 | 1 |
| build-broken-import-browser | 1526 | 1526 | 0 | 0.0% | 0 | 0 |
| build-broken-import-dev | 772 | 752 | 20 | 2.6% | n/a (killed) | n/a (killed) |
| rstest-happy | 452 | 432 | 20 | 4.4% | 0 | 0 |
| state-bundle-size-sort-order-check | 2618 | 1646 | 972 | 37.1% | 1 | 1 |
