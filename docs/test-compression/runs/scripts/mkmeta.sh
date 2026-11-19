#!/bin/bash
# usage: mkmeta.sh <outbase> <runfile> ; header fields from env: REPO SHA TASK CASE TOOLS BROWSER DEVIATIONS NOTES
out=$1; run=$2
{ echo "repo: $REPO"; echo "pinned_sha: $SHA"; echo "task: $TASK"; echo "case: $CASE"; cat "$run"; echo "tools: $TOOLS"; echo "browser: $BROWSER"; echo "date: $(date +%F)"; echo "deviations: $DEVIATIONS"; echo "notes: $NOTES"; } > "$out.meta.txt"
