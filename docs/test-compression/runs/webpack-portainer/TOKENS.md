# webpack-portainer: control vs agentic-node

o200k_base token counts (gpt-tokenizer) over the raw capture files, ANSI bytes included. saved = control - agentic-node.

| case | control tokens | agentic-node tokens | saved | saved % | control exit | agentic-node exit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| a-components-happy | 5411 | 811 | 4600 | 85.0% | 0 | 0 |
| b-addbutton-hidden-test-fail | 2451 | 2128 | 323 | 13.2% | 1 | 1 |
| b-expandable-toggle-fail | 2944 | 2664 | 280 | 9.5% | 1 | 1 |
| c-alias-build-fail | 141906 | 5670 | 136236 | 96.0% | 1 | 1 |
