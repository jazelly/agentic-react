#!/bin/bash
# Usage: next-anlogs.sh <wsRoot> <destDir|->   copy every .agentic-node dir under wsRoot (node_modules pruned) to destDir, then delete them.
WS=$1; DEST=$2
find "$WS" -name node_modules -prune -o -type d -name .agentic-node -print 2>/dev/null | while read -r d; do
  rel=${d#$WS/}; rel=${rel%/.agentic-node}; [ "$rel" = "$d" ] && rel=.; [ "$rel" = ".agentic-node" ] && rel=.
  if [ "$DEST" != "-" ]; then mkdir -p "$DEST/$rel"; cp -R "$d/." "$DEST/$rel/"; fi
  rm -rf "$d"
done
