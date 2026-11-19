# source me. Requires: O, REPO, SHA, TOOLS, BROWSER, NODEV set by the caller.
S="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# cmdcase <case> <task> <cwd> <cmd> <deviations> <notes> [restore-cmd run before each arm]
cmdcase() {
  local c=$1 task=$2 cwd=$3 cmd=$4 dev=$5 notes=$6 restore=${7:-}
  for arm in control agentic-node; do
    [ -n "$restore" ] && (cd "$cwd" && bash -c "$restore")
    local ob="$O/$REPO/$c.$arm" ld=""
    [ $arm = agentic-node ] && ld="$O/$REPO/agentic-node-logs/$c"
    echo ">>> $REPO $c [$arm]"
    ARM=$arm NODEV=$NODEV LOGDEST=$ld BETWEEN="$restore" "$S/run.sh" "$ob" "$cwd" "$cmd"
    REPO=$REPO SHA=$SHA TASK=$task CASE=$c TOOLS=$TOOLS BROWSER=$BROWSER DEVIATIONS=$dev NOTES=$notes "$S/mkmeta.sh" "$ob" "$ob.run"
    rm -f "$ob.run"
  done
  [ -n "$restore" ] && (cd "$cwd" && bash -c "$restore")
}
# devcase <caseprefix> <task> <cwd> <cmd> <url> <deviations> <notes> [restore]
devcase() {
  local c=$1 task=$2 cwd=$3 cmd=$4 url=$5 dev=$6 notes=$7 restore=${8:-}
  for arm in control agentic-node; do
    [ -n "$restore" ] && (cd "$cwd" && bash -c "$restore")
    local tb="$O/$REPO/$c-devserver.$arm" bb="$O/$REPO/$c-browser-console.$arm" ld=""
    [ $arm = agentic-node ] && ld="$O/$REPO/agentic-node-logs/$c"
    echo ">>> $REPO $c [$arm]"
    ARM=$arm NODEV=$NODEV LOGDEST=$ld PW_TZ=${PW_TZ:-} "$S/dev.sh" "$tb" "$bb" "$cwd" "$cmd" "$url"
    REPO=$REPO SHA=$SHA TASK=$task CASE=$c-devserver TOOLS=$TOOLS BROWSER=$BROWSER DEVIATIONS=$dev NOTES="Dev-server terminal output; browser console of the same session is $c-browser-console.$arm.txt. $notes" "$S/mkmeta.sh" "$tb" "$tb.run"
    REPO=$REPO SHA=$SHA TASK=$task CASE=$c-browser-console TOOLS=$TOOLS BROWSER=$BROWSER DEVIATIONS=$dev NOTES="Browser console (Playwright 1.65.1 from pw-latest; lines '[<type>] <text>' and '[pageerror] <stack>', in order) of the same session as $c-devserver.$arm.txt; the capture script ran without NODE_OPTIONS. $notes" "$S/mkmeta.sh" "$bb" "$tb.run"
    rm -f "$tb.run"
  done
  [ -n "$restore" ] && (cd "$cwd" && bash -c "$restore")
}
