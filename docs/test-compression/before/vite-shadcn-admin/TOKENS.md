# vite-shadcn-admin token counts

Counter: gpt-tokenizer o200k_base over the raw capture file (ANSI escapes included where present). lines = newline count, chars = code points.

| case | lines | chars | o200k tokens |
| --- | ---: | ---: | ---: |
| a-test-happy.agent | 13 | 419 | 145 |
| a-test-happy | 38 | 4251 | 2314 |
| b-signout-full-suite-fail.agent | 48 | 1499 | 571 |
| b-signout-full-suite-fail | 74 | 5977 | 3268 |
| b-signout-hidden-test-fail.agent | 43 | 1252 | 507 |
| b-signout-hidden-test-fail | 43 | 1969 | 1134 |
| c-tasks-crash-browser-console | 30 | 2128 | 660 |
| c-tasks-crash-devserver.agent | 36 | 2601 | 830 |
| c-tasks-crash-devserver | 9 | 250 | 93 |
| d-bad-import-browser-console | 15 | 945 | 219 |
| d-bad-import-devserver.agent | 61 | 7713 | 2547 |
| d-bad-import-devserver | 54 | 7277 | 2441 |
