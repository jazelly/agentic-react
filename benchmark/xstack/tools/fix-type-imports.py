# Insert inline `type` modifiers for TS1484 errors (verbatimModuleSyntax) reported by tsc. usage: tsc ... | python3 fix-type-imports.py <ws-src-root> <map-to-dir>
import re, sys, collections, os
ws, dst = sys.argv[1], sys.argv[2]
edits = collections.defaultdict(list)
for line in sys.stdin:
    m = re.match(r"src/ui/(.+?)\((\d+),(\d+)\): error TS1484: '(\w+)'", line)
    if m: edits[m.group(1)].append((int(m.group(2)), int(m.group(3)), m.group(4)))
for f, es in edits.items():
    p = os.path.join(dst, f)
    if not os.path.exists(p): continue
    L = open(p).read().split('\n')
    for ln, col, name in sorted(es, key=lambda e: (-e[0], -e[1])):
        s = L[ln - 1]; i = col - 1
        assert s[i:i + len(name)] == name, (f, ln, s)
        L[ln - 1] = s[:i] + 'type ' + s[i:]
    open(p, 'w').write('\n'.join(L)); print('fixed', p, len(es))
