// tools/review/prompt.js <round> <role: early|late|screens|verify> <report dir> <url> [--base <url>] [--fixes <file>] [--out <root>]
// A reviewer's prompt for a round: the brief for its role, the owner's settled calls, the known issues, the decisions
// waiting on the owner, the rubric and its anchors, the round's report and the frozen build's URL. With --base (the
// previous build, served by freeze.sh), a side-by-side: better, same or worse than it, per category. `verify` takes the fix
// list (--fixes) and doesn't score. Prints the model the role uses (design/review/roles.json), so it's the same each round.
// Reviewers aren't told any target score: they hold the game to the best of its kind.
'use strict';
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const [round, role, report, url] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!round || !role || !report || !url) { console.error('usage: prompt.js <round> <early|late|screens|verify> <report dir> <url> [--base <url>] [--fixes <file>] [--out <root>]'); process.exit(1); }
const repo = path.join(__dirname, '..', '..');
const R = f => path.join(repo, 'design', 'review', f);
const outRoot = opt('out') || path.dirname(path.resolve(report));
const dir = path.join(outRoot, `r${round}-${role}`);
const base = opt('base');
const model = JSON.parse(fs.readFileSync(R('roles.json'), 'utf8'))[role] || '?';
const kit = `Drive a real Chromium with Playwright through the kit, \`require('${path.join(repo, 'tools', 'review', 'kit.js')}')\` with REVIEW_URL set to the build's URL (read its header: launch desktop or phone, a fresh first visit, \`scenario(page, k)\` for sector k with a realistic build, start, bubbles, loops, flicks, the run's state, screenshots). Write your scripts, notes and screenshots in ${dir}/ only, and don't modify files under ${repo}. Open your screenshots to judge what a player sees.`;
const reading = `1. Your brief: ${R(`brief-${role}.md`)}
2. The known issues (confirm or update them first, then look for what isn't there): ${R('known-issues.md')}
3. The owner's settled calls and the decisions waiting on them (don't spend top issues on either): ${R('settled.md')}, ${R('decisions.md')}
4. This build's report (tests, pacing on both screens, rule checks, standard screenshots and what changed since the last report, a full field's frame rate): ${path.join(path.resolve(report), 'report.md')} and the PNGs beside it. Don't re-measure what it measured unless you doubt it.`;
let body;
if (role === 'verify') {
    const fixes = opt('fixes') ? fs.readFileSync(opt('fixes'), 'utf8').trim() : '(see the known issues\' "fixed: verify" section)';
    body = `You verify a batch of fixes to **Packet Snare** (a minigame in a browser incremental game, repo at ${repo}). You don't score the game.

**Read first:**
${reading}

**The fixes in this batch:**
${fixes}

**The build** is frozen and served at ${url}. ${kit}

**Your final message:** a line per fix (holds / doesn't hold / can't tell, with the screenshot or steps), then regressions (\`[regression]\`, how to reproduce), then anything new you noticed in passing (\`[new]\`), briefly.`;
} else {
    body = `You are an experienced game designer and critic reviewing **Packet Snare**, a minigame inside a browser incremental game ("The Path to AGI", repo at ${repo}). Hold it to the standard of the best-loved games of its kind (incremental and idle games, arcade action toys). Don't inflate or deflate: score what you observe.

**Read first, in this order:**
${reading}
5. The rubric (seven categories, Early/Late, the "+1" change) and what a 6 and an 8 look like in this game: ${path.join(repo, 'design', 'review-rubric.md')}, ${R('anchors.md')}

**How to play:** the build is frozen for this round and served at ${url}. ${kit}${base ? `

**Side by side:** the previous build is served at ${base}. Play the same moments on both (the first card and first runs, a scenario or two from your brief). For each category you score, say whether this build is **better, the same or worse** than the previous one, and why, in a line.` : ''}

**Your final message is your review** (under ~1,200 words):
- **Scores:** a line per category you score, \`Category (Early|Late): n/10${base ? ' · better|same|worse than before' : ''} — one-sentence reason · +1: the one change that would raise it a point\`.
- **Known issues:** a line per K# and F# in known-issues.md you could check: still there / fixed / can't tell.
- **Measurements:** what you measured beyond the report.
- **Top issues, most important first** (up to 10), each tagged \`[new]\`, \`[known K#]\` or \`[regression]\`, none against a settled call or an open decision: what you saw (how to reproduce, screenshot), why it matters, a concrete fix.
- **Against settled calls or open decisions:** any suggestions on them, briefly.
- **What works well** (briefly).`;
}
console.log(body);
console.error(`model for ${role}: ${model} (design/review/roles.json)`);
