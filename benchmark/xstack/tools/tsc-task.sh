#!/bin/bash
# usage: tools/tsc-task.sh <taskdir> [sol]  -> strict tsc (verbatimModuleSyntax) of the task's src/ui in a scratch clone of vite-spa/base
set -e
cd "$(dirname "$0")/.."; W=work/tmp-tsc-$$; cp -cR work/stacks/vite-spa/base $W; rm -rf $W/src/ui; mkdir -p $W/src/ui
cp -R "$1"/app/. $W/src/ui/; [ "$2" = sol ] && cp -R "$1"/solution/. $W/src/ui/
(cd $W && node_modules/.bin/tsc --noEmit -p tsconfig.ui.json) || true
/bin/rm -rf $W
