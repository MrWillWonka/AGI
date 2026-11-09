// tools/review/prompt.js <round> <role: early|late|screens> <report dir> <url> [out root] — a reviewer's prompt for a
// round: the brief for its role, the owner's settled calls, the rubric, the round's report and the frozen build's URL.
// The reviewers aren't told any target score: they hold the game to the best of its kind.
'use strict';
const path = require('path');
const [round, role, report, url, outRoot = path.dirname(path.resolve(report))] = process.argv.slice(2);
if (!round || !role || !report || !url) { console.error('usage: prompt.js <round> <early|late|screens> <report dir> <url> [out root]'); process.exit(1); }
const repo = path.join(__dirname, '..', '..');
const dir = path.join(outRoot, `r${round}-${role}`);
const brief = path.join(repo, 'design', 'review', `brief-${role}.md`);
console.log(`You are an experienced game designer and critic reviewing **Packet Snare**, a minigame inside a browser incremental game ("The Path to AGI", repo at ${repo}). Hold it to the standard of the best-loved games of its kind (incremental and idle games, arcade action toys). Don't inflate or deflate: score what you observe.

**Read first, in this order:**
1. Your brief: ${brief}
2. The owner's settled calls: ${path.join(repo, 'design', 'review', 'settled.md')}
3. The rubric (seven categories, anchors, Early/Late scores, the "+1" change): ${path.join(repo, 'design', 'review-rubric.md')}
4. This build's report, measured before you start (tests, pacing on both screens, standard screenshots, layout and console checks, a full field's frame rate): ${path.join(path.resolve(report), 'report.md')} and the PNGs beside it. Don't re-measure what it already measured unless you doubt it; spend your time on what only playing shows.

**How to play:** the build is frozen for this round and served at ${url} (don't modify files under ${repo}). Drive a real Chromium with Playwright through the kit, \`require('${path.join(repo, 'tools', 'review', 'kit.js')}')\` with REVIEW_URL=${url} (read its header: launch desktop or phone, a fresh first visit, \`scenario(page, k)\` for sector k with a realistic build, start, bubbles, loops, flicks, the run's state, screenshots). Write your scripts, notes and screenshots in ${dir}/ only. Open your screenshots to judge what a player sees.

**Your final message is your review** (under ~1,200 words):
- **Scores:** a line per category you score, \`Category (Early|Late): n/10 — one-sentence reason · +1: the one change that would raise it a point\`.
- **Measurements:** what you measured beyond the report.
- **Top issues, most important first** (up to 10), none against a settled call: what you saw (how to reproduce, screenshot), why it matters, a concrete fix.
- **Against settled calls:** any suggestions that go against one, briefly.
- **What works well** (briefly).`);
