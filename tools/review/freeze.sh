#!/usr/bin/env bash
# tools/review/freeze.sh <round> [<base commit>] — freeze this commit for a review round: a detached checkout of HEAD in its
# own directory, served on its own port, so work can carry on in the repo while reviewers play a build that doesn't change
# under them. With a base commit (the last round's build), that's frozen too, for a side-by-side.
#   tools/review/freeze.sh 10 7ace32b   # → /tmp/agi-review-r10 at HEAD (port 8210), /tmp/agi-review-r10-base at 7ace32b (8310)
# Prints the directories, the ports and the commands to serve them, report on them and write the prompts.
set -euo pipefail
round="${1:?round number}"
basecommit="${2:-}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
freeze() { # dir commit
    if [ -d "$1" ]; then git -C "$repo" worktree remove --force "$1" >/dev/null 2>&1 || rm -rf "$1"; fi
    git -C "$repo" worktree prune
    git -C "$repo" worktree add --detach "$1" "$2" >/dev/null 2>&1
}
dir="/tmp/agi-review-r${round}"; port=$((8200 + round))
freeze "$dir" HEAD
echo "frozen: $(git -C "$dir" log --oneline -1)"
echo "serve:  (cd $dir && python3 server.py $port --no-browser)"
if [ -n "$basecommit" ]; then
    bdir="${dir}-base"; bport=$((8300 + round))
    freeze "$bdir" "$basecommit"
    echo "base:   $(git -C "$bdir" log --oneline -1)"
    echo "serve:  (cd $bdir && python3 server.py $bport --no-browser)"
fi
prev="$(ls -d "$repo"/review-out/r* 2>/dev/null | grep -v -- '-' | sort -V | tail -1 || true)"
echo "report: node $repo/tools/review/report.js $repo/review-out/r${round} --url http://localhost:${port}/${prev:+ --prev $prev}"
echo "prompt: node $repo/tools/review/prompt.js ${round} <early|late|screens|verify> $repo/review-out/r${round} http://localhost:${port}/${basecommit:+ --base http://localhost:$((8300 + round))/}"
