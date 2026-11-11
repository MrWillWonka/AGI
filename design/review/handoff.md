# Handoff: carrying the Packet Snare testing work to a new session

Written 2026-11-10 at the end of the session that built Packet Snare 17.3 → 17.7. Everything below is committed on the
branch `claude/snare-review-rounds` (head: the commit that added this file). A new session should read this file,
`CLAUDE.md` (loaded automatically), `design/review/decisions.md` and the latest rows of `playtests/README.md`.

## Where things stand

- **Live review build:** Packet Snare **18.8**, republished 2026-11-11 22:53 UTC (version `1794437631-8d30`, game.js: the owner's
  tutorial reports: each step takes its own move before it moves on (the bubble step a bubble, the drawn loop's a drawn
  loop; the wrong one catches for nothing and a fresh group swims in), and before that: a catch made before a walkthrough shows counts as that step, a bubble on the drawn loop's step brings a
  fresh group and then moves on, no combo in the tutorial, the old wire on its small field (the share of it was too short
  for the loop it asks for), and its walkthroughs never repeat after the zoom; the build number kept, the owner's call).
  First published 20:56 UTC (version `1794430575-69c8`, index.html,
  engine.js, game.js, packet-snare.js, snare-demos.js and scenarios.json): the owner's calls on the 18.7 log (the 15-sector
  campaign with skill-gated bosses, the meltdown doubling the run, racing combos and a limited wire, defences in the boss
  fight, the bubble nodes on drawn loops; see CLAUDE.md). The owner reviews it on the phone over Tailscale first (below).
- **Before it:** Packet Snare **18.7**, republished 2026-11-11 14:54 UTC (version `1794408849-06ec`, engine.js,
  game.js, packet-snare.js and styles.css): the open decisions closed (flick nodes gone, nets shield the boss, a parry
  knocks it into mines), round 11's layout fixes (F41) and the field filling the width on screens 1700 px and wider. The
  build number stayed 18.7 (the owner's call: a new one only when a playtest led to a change). Before it, 12:23 UTC
  (`1794399783-9146`): the debug panel's long press.
- **Open decisions: none** (2026-11-11, the owner closed them all: D20 the flick nodes removed, K17 nets shield the
  boss and a parry knocks it into mines, K20 phones save space, D15 and K6 closed with no change; see decisions.md).
  The next decisions come from the next playtest log. Older entries below that say "Open" are history.
- **18.7 first went out** 2026-11-11 12:17 UTC (version `1794399429-0082`): the tutorial
  runs bubble, unreadable packet (full speed), drawn loop, and zooms out from the loop's catch.
- **Before it:** Packet Snare **18.6**, published 2026-11-11 03:44 UTC (version `1794368669-b149`): 18.5 plus
  the tutorial's unreadable packet and a zoom out centred on it. To see the tutorial again: debug panel, Reset Packet Snare.
- **Before it:** Packet Snare **18.5**, published 2026-11-11 03:26 UTC (version `1794367558-1ac2`): the
  tutorial field that zooms out, fast slashes with the boss's health doubled, the stun timer, quicker bubbles, catches ×0.7,
  Sprawl level 4 at 1,000 (see the Builds row). **The owner decides pacing**: show them a sweep before any compensating
  change (memory and CLAUDE.md say so). Watch in the next log: the tutorial, the meltdown's 30 hits and shake, fast
  slashes against the doubled health, sector 2–4 runs at ×0.7 pay. Open: the flicks (D20).
- **Before it:** Packet Snare **18.4**, published 2026-11-11 02:46 UTC (version `1794365202-92a4`, from the
  owner's Windows machine): walkthroughs, the meltdown (slash like crazy), the bolt, Hijack, the cut nodes, full sentences;
  see the Builds row. Watch in the next log: the 0.15 slow motion (the owner's fallback is freezing), meltdown hits
  against 30/40/50 and the shake, sectors 6–8 with the dearer Sprawl, Chain Lightning's feel. Open: the flicks (D20).
- **Before it:** Packet Snare **18.1**, published to the owner's artifact
  <https://claude.ai/artifact/9Sc3mL6iQFeDVNmdnjtP5Q> (slug `445c4d6b-4414-4184-aa65-debc63cd7dcf`, version
  `1794349829-0fa7` at publish, 22:30 UTC, from the owner's Windows machine; read: owner). `E.BUILD` in `engine.js` says
  `2026-11-10 22:25 (review branch) · Packet Snare 18.1: …` (18 was `1794337885-40a0`, 19:06; 17.9 was `1794331539-3bb3`,
  17:25; 17.8 was `1794329790-1505`, 16:56). **18.1:** mines looped and slung (K7), the loop count readable (K5), the
  demo pass (K22); see known-issues F28–F30. Watch in the next log: looping a mine on a phone, the sling's full pull
  (a fifth of the shorter side), whether LOOP 1/2 reads mid-fight.
- **What 17.7 changed** (the owner's calls on the 17.6 log): boss mines laid on a ring 0.3 × the field's shorter side
  round the boss; a thrown mine is an air-hockey puck (flies the way it's flicked, bounces off edges up to 2 times, then
  a dud; hits for 3); **Ricochet** node off Riposte (+1 bounce and +50% damage a bounce per level); Antivirus hunt 25%
  faster and steer 20% quicker (`avHunt`, `avTurn` in `E.snareOpts`). Details in `CLAUDE.md` ("Snare 17.7").
- **The build before:** 17.6 capped drawn loops on a phone at a full bubble's multiplier (×n MAX) and taught the mine
  throw; 17.5 made the boss the run's centrepiece (every third sector from 5, arrives at half Focus, swallows the field,
  a 30 s fight clock); 17.5 republished let drawn circles catch on phones.
- **Newest owner log:** `playtests/snare/2026-11-10-owner-snare-18-1.txt` (iPhone, 18.1, sectors 1–8; a summary with
  the owner's notes: the full export is in that session's chat). Its calls are built (Snare 18.3, unpublished): the
  boss's meltdown, a faster mine, dearer big Sprawl steps, the boss nodes waiting for a boss, full sentences. Then (Snare 18.4,
  unpublished): Chain Lightning a travelling bolt, Hijack reworked, Garbage Collection, Second Wind, Clean Sweep, Quarantine
  Relay and Zero Trust gone. **Still to propose to the owner:** the flicks ("don't feel useful or fun at the moment").
- **Older owner log:** `playtests/snare/2026-11-10-owner-snare-17-6.txt` (iPhone, 17.6, through sector 11's boss,
  which escaped twice at 61/80 and 70/80 damage; every mine grabbed was thrown).
- **Watch in the next log:** sector 11's boss with bank shots; whether the faster Antivirus feel right (sector 3); the
  end card's "Mines grabbed · thrown · hit"; sector 9 and 10 run counts; D15 (desktop sector 3).
- **In 17.8 (published 2026-11-10 16:56 UTC):** the K3/K8/K9/K10 layout batch, review round 10 (four
  reviewers on it: scores in `scores.csv`, issues K11–K20) and the owner's calls on it (D19, "Snare 17.8" in CLAUDE.md):
  the fight clock decides fights (a snap costs 2 s of it, not Focus), a parry breaks the mine shield, honest bank-shot
  labels, the mines demo redone as a bank shot, the fight's readouts, the sideways crumbs, Boss now, the tree keeping its
  roots in view. Open: K5–K7, K17
  (nets), K20 (smaller screen issues), D15. **In 17.9 (published 17:25 UTC):** K21
  (shape cues: unreadable a hollow eye, gold a light rim, tags a dotted edge; the owner's picks) and K14 (the boss demo); the slow pacing ratchet held at sector 3's 18 bot runs and
  sector 4's 7 (the owner's calls, `knownMisses` in `targets.json`). **In 18 (published 19:06 UTC):** K19, the goal curve
  skips boss sectors (sector 12 asks 140K, not 843K; the owner's pick of three in a sweep); D15 stays watching (no
  desktop log since 17.2). The owner's 17.9 log (`playtests/snare/2026-11-10-owner-snare-17-9.txt`, sectors 1–4 in 1,
  3, 2, 7 runs, Antivirus snapping the wire in 6 of 9 runs on 3–4): sector 4 left as it is, the owner's call.
- **Also in 17.8, merged in from a local session (2026-11-10): the copy and colour pass and the terminal voice.** See *Copy and colour pass*
  below before touching any Packet Snare text or colour. It changes no rules or balance.
- **Pacing (bot, phone, 3 seeds, 20 min) on 17.7:** sector 3 takes 18 runs (15 on 17.6: faster Antivirus), sector 5 at
  16.6 min. The bot dodges far worse than the owner (owner: sector 3 in 6 runs), so this wasn't tuned away.

## How the owner works (keep to these)

- **Check in before starting work or reviews.** Ask with question cards (AskUserQuestion), a recommended option first,
  labelled "(Rec.)". Nothing is built on an open decision.
- **Publish only on the owner's explicit go-ahead.** Bump the build only when a playtest led to a change in the game
  (the owner's calls, 2026-11-11: anything else, a tool-only change like how the debug panel opens or work not yet
  playtested, republishes its files under the same build, with no `BUILD` bump and no Builds row). For a real change: bump `BUILD` in `engine.js` (UTC time + a few words),
  add a row to `playtests/README.md`'s Builds table (the test `the build stamp has its row…` checks the bold name),
  run `node --test` and `node tools/review/report.js review-out/<name>`, commit, push, then publish.
- **No pull requests.** Commit and push to the session's branch. No model names in commits or artifacts.
- **A report after every fix batch;** reviewer rounds only when the owner asks.
- **Logs:** the owner pastes playtest logs into chat. File each in `playtests/snare/<date>-owner-snare-<build>.txt`
  (a later export of the same log replaces the earlier file) and add a row to `playtests/README.md`'s logs table
  with what it shows. Don't let `tools/review/calibrate-snare.js` overwrite `tools/review/human.json` /
  `design/review/owner-profile.json` from one log without asking (it moves every pacing number).
- **Tone:** friendly, plain, short reports: what changed, what was checked, what to watch.

## Copy and colour pass (merged 2026-11-10, from a local session)

The owner wants Packet Snare's words to follow great game design and other incremental games, not the Training
Cluster's copy rules, and every word and colour to read the same in all five themes (Night, Red, Soft pink, Void,
Arcade). Their calls are in `settled.md` (**Copy**); `CLAUDE.md` has a line on it. What changed, and how it fits the
review work:

- **Node popups** (`SNARE_TREE` in `engine.js`, all 64 nodes): short rules text in the style of a card game (Slay the Spire,
  Balatro): verb first, one level's numbers, no "per level", "(1 / 2 / 3)" or "twice / three times" (the level pill and
  the now → after line already carry them). **No flavour quips on Snare nodes** (the `flavor` field is gone; the
  Training tree keeps its own). `snareRules` in `game.js` sets the line: numbers bold, and "unreadable", "gold" and
  "good packets" in the packets' own theme tokens. `tests/engine.test.js` fails a Snare node with a quip, a per-level
  aside or a colour word.
- **Look out cards and tool tips** (`SNARE_INTROS`): **one line each; the demo teaches the rest** (Nintendo-style show,
  don't tell). This supersedes the numbered lists from K8 for the boss and mines: the merge kept the one-liners, and
  `snareIntroBody` still renders either form, so nothing else changed. The first card's how-to (`snareHowTo`) is one
  line too, and the end card's empty-run line now uses it, so a mouse is told to use the right button (it said "hold
  still").
- **Field callouts, three tiers** (`drawSnarePops`): rewards gold and number-first; losses one red word (BOSS ESCAPED and
  −n STOLEN were gold, now `loss: true`); hints (`kind: 'hint'`: Hold longer, Too small to loop, Aim at the boss, No more
  Focus back this run, Hold the right button for a bubble, and the on-field guides Flick at the boss, Loop round it,
  Swipe across to parry) in normal case, the body font (`snareHintFont`) and the text colour.
- **No colour words.** Themes colour packets differently, so bad packets are **unreadable**, never "red": in node text,
  the now → after labels, demo captions, the end card, the "loose data" mail, the hunt setting and the risk callout
  (HIGH RISK · HIGH REWARD · n UNREADABLE NEAR). A Firewall is a **Firewall**, never a "section". "Gold" is safe: gold
  packets are `--warning`, amber to yellow in every theme. Code names (`corrupt`, `red` intro keys, `.snare-red-line`)
  are unchanged.
- **Colours** (measured: contrast against `--bg-2` and CIEDE2000 between roles that must be told apart, normal vision and
  simulated protanopia and deuteranopia; every role is over 5:1):
  - Snare drawing that used `--primary` (red in the Red theme, pink in Soft pink) now uses `--snare-good`: catch flashes,
    packets flying into a catch or the boss, quarantine, the freeze tint, the containment edge, the current. In the
    Red theme a good catch used to flash red and the freeze tint was red.
  - **Focus bar** is `--snare-good` (red when low). It was `--primary`, so in the Red theme normal and low Focus were the
    same red.
  - **New `--snare-bubble` token** for the bubble, the wire and their preview (`--success` by default): Soft pink's pink
    (its mint sat on the mint good packets), Void's lavender (its teal matched the tag edge), Arcade's magenta (its green
    was close to the lime tag edge).
  - **The scanner beam and towers draw `--snare-tag`**, the colour of the tag they give (they used `--research`: violet
    beams gave teal tags in Void, magenta gave lime in Arcade).
  - The popup's now → after line is `--success` (red in the Red theme read as a warning).
- **The terminal voice (a second pass, 2026-11-10):** everything in Packet Snare that isn't a node's rules text now speaks as the pipeline's terminal (see settled.md → Voice): `SNARE_INTROS` rewritten as alerts (shown `> NAME: line`, the name upper-cased by `snareMeetParts`; the card titled ⚠ THREAT DETECTED, tool tips ↻ SYSTEM NOTICE), `snareHowTo` as CONTROLS:, `snareGoalText` as Objective:, banners (SECTOR BREACHED, BOSS UNINSTALLED, UNINSTALL WINDOW · 30 s, CACHE RECOVERED), every hint as a `> ` prompt in lower case (now in the mono type, `snareHintFont`; LOOPS ARE FOR THE BOSS became a hint), the end card as a session log, the Rogue AI called **Unknown process** (cards and the end card; code names unchanged), and card lines in the mono type (`.snare-card .snare-intro-line`). The four Snare mails keep A Friend's voice with the mechanics brought up to date (bubbles, cores, Firewalls; snareDeep says eight sectors, since bosses come at 5 and 8). **New copy in Snare follows this voice**: K14's boss and mines demos, K16's end card fix and any new hint.
- **Closed out with the owner (2026-11-10):**
  - Demo captions are hidden on every Packet Snare card (`.snare-card .demo figcaption`), so a one-line card isn't
    repeated under its demo; node popups keep their captions.
  - **Colour-blind shape cues (K21) go to the review agent once round 10's fixes are in**, not before, so two sessions
    aren't editing `drawSnarePackets` at once.
  - **17.8 is published by the review agent after round 10's fixes**, bundling them with K3, K8–K10 and this pass (the
    publish report needs Playwright, which the owner's local machine doesn't have). Still only on the owner's go-ahead
    at the time: confirm with them first.
- **Against round 10's issues:** K14's card words no longer describe the pre-17.5 boss (one line: loop it twice, then
  slash), but its demo and the mines demo still show the old fight; the new boss facts (half Focus, the swallow, the
  30 s clock, escaping) belong in the demo, not the card. K20's clipped popup effect line should be rarer (effect lines
  are shorter). Hints added for K5 should use `kind: 'hint'`; any new copy follows `settled.md` → Copy.

## Publishing the artifact

The artifact holds `index.html`, `engine.js`, `game.js`, `packet-snare.js`, `snare-demos.js`, `sfx.js`, `playtest.js`,
`debug-panel.js`, `training-path.js`, `styles.css` and `tools/review/scenarios.json`. `index.html` is generated by
`node tools/review-index.js review-out/<name>.html` (it sets `AGI_SNARE_DIRECT` so the build opens straight into Packet
Snare). Publish only the files that changed: `node tools/review/artifact-files.js review-out/<name>.html` prints each
file's sha256 as the artifact holds it (LF); compare with the artifact's `list_files` and publish the ones that differ
with `publish_files` (slug above, `base_version` = the live version from `get_artifact`, a `label` like
"Packet Snare 17.8"; `--json` prints the `{ as, path }` list). The report regenerates `tools/review/scenarios.json` (the
debug panel's Playtest from this sector presets), so include it when it changed. After publishing, `list_files` again:
every hash should match the script's.

## Reviewing on the owner's phone

The artifact viewer keeps Claude's own bar over the top of the page, so the owner reviews mobile layout over
**Tailscale** (the owner's call, 2026-11-11): a private network between their own devices, with nothing on the open
internet. The PC serves the repo with `node tools/review/serve.js 8123` (no caching, so a refresh shows every edit), and
`tailscale serve --bg 8123` gives it a private `https://<pc-name>.<tailnet>.ts.net` address that only the owner's
signed-in devices can open. Add `#snare` to the address to open straight into Packet Snare. `index.html` carries the
home-screen tags, so "Add to Home Screen" opens the game with no browser bars. The PC must be on and serving. Saves are
per address, so this is a separate game from the artifact's.

## Commands

```bash
node --test                                   # ~2 s; SLOW=1 adds the slow pacing ratchet
node tools/review/pacing.js                   # bot campaign vs the owner's pace (phone, 3 seeds, 20 min)
node tools/review/report.js review-out/<name> # tests, pacing on both screens, screenshots, rule checks (~70 s)
node tools/review-index.js review-out/<name>.html
node tools/review/artifact-files.js review-out/<name>.html   # what to publish (sha256 per file)
node tools/review/serve.js 8123               # the game for the kit by hand (the report serves it itself)
node tools/review/coaches.js                  # every in-run walkthrough on desktop and phone, with screenshots (~2 min)
```

The report needs no server started first: it uses one already serving the game at its URL (port 8123, `--url` or
`REVIEW_URL`), else serves the repo itself (`tools/review/serve.js`, Node), on 8123 or the next free port if that one's
taken. `server.py` still works for playing (`python server.py`).

**On the owner's Windows machine** (set up 2026-11-10, so the report and publishes run locally): Playwright lives in the
repo's git-ignored `node_modules` (`npm install --no-save playwright`, then `npx playwright install chromium`; redo both
after a fresh clone: the kit says so if it's missing). Python 3.12 is installed per user, as `python` and `py` (`python3`
is the Store's stub), though nothing in the review tools needs it now. The report runs in about a minute. `.gitattributes`
checks text out LF everywhere, as the artifact holds it. Git has no identity set there: commit with
`-c user.name=Claude -c user.email=noreply@anthropic.com`.

Browser checks use `tools/review/kit.js` (Playwright; `K.launch({ phone: true })`, `K.fresh`, `K.scenario(page, k)`,
`K.start`, `K.cards`, `K.bubble`, `K.stroke`, `K.flick`, `K.state`); `AGI.debug.snareRun()` reads the run in play.

## Starting the new session

Paste this as the first message (edit the branch name):

> Continue the Packet Snare testing work on branch `<new-branch>` (it carries everything from
> `claude/snare-review-rounds`). Read `design/review/handoff.md`, `design/review/decisions.md` and the latest rows of
> `playtests/README.md` first. The live review artifact is
> https://claude.ai/artifact/9Sc3mL6iQFeDVNmdnjtP5Q (Packet Snare 17.7). Keep to the working rules in the handoff:
> check in with question cards before starting work, publish only when I say so (bump BUILD and the Builds row), no
> PRs, file my playtest logs in `playtests/snare/`. I'll paste my next phone log here.
