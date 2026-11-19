#!/bin/bash
# usage: collect-logs.sh <workspace> <destdir>  — moves every .agentic-node dir under <workspace> (incl. node_modules, depth<=4) into <destdir>/<relative path>
ws=$1; dest=$2; n=0
while IFS= read -r d; do
  rel=${d#$ws/}; mkdir -p "$dest/$(dirname "$rel")"; cp -R "$d" "$dest/$rel" && rm -rf "$d"; n=$((n+1))
done < <( { find "$ws" -path "$ws/node_modules" -prune -o -name node_modules -prune -o -type d -name .agentic-node -print; find "$ws/node_modules" -maxdepth 4 -type d -name .agentic-node -print 2>/dev/null; } )
echo "agentic-node log dirs collected: $n"
