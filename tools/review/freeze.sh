#!/usr/bin/env bash
# tools/review/freeze.sh <round> — freeze this commit for a review round: a detached checkout of HEAD in its own directory,
# served on its own port, so work can carry on in the repo while reviewers play a build that doesn't change under them.
#   tools/review/freeze.sh 9          # → /tmp/agi-review-r9 at HEAD, then serve it with the printed command
# Prints the directory, the port (8200 + round) and the commands to serve it and to report on it.
set -euo pipefail
round="${1:?round number}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
dir="/tmp/agi-review-r${round}"
port=$((8200 + round))
if [ -d "$dir" ]; then git -C "$repo" worktree remove --force "$dir" >/dev/null 2>&1 || rm -rf "$dir"; fi
git -C "$repo" worktree prune
git -C "$repo" worktree add --detach "$dir" HEAD >/dev/null
echo "frozen: $(git -C "$dir" log --oneline -1)"
echo "dir:    $dir"
echo "port:   $port"
echo "serve:  (cd $dir && python3 server.py $port --no-browser)"
echo "report: node $repo/tools/review/report.js $repo/review-out/r${round} --url http://localhost:${port}/"
