# Building the ring: a brief for a new session

Written 2026-11-13 at the end of the planning session that produced `design/ring.md`. **Read `design/ring.md` first:**
it is what to build. This file is how. A new session should also read `CLAUDE.md` (loaded automatically; it describes
the game as it is today), and "How the owner works" in `design/review/handoff.md`.

Nothing in `design/ring.md` is built yet. The branch is `claude/evals-first-cut` (the newest work: Packet Snare 18.8
and the first cut of Evals); the tests there pass (496, 1 skipped, about 7 s).

## How the owner works (the short version)

- **Check in before starting each piece.** Ask with question cards, a recommended option first. The owner would much
  rather pick from cards than type answers. Nothing is built on an open decision.
- **The owner decides design; you propose.** `design/ring.md` marks each line as the owner's call, *proposed* or
  *open*. Treat proposed lines as the starting point and say when play suggests changing one. Never quietly change an
  owner's call.
- **No pull requests.** Commit and push to the session's branch. No model names in commits or artifacts.
- **Publish only on the owner's explicit go-ahead.** `design/review/handoff.md` has the publish steps and the rule for
  when `BUILD` in `engine.js` is bumped.
- **The owner's brother is the main playtester** and the target player. He plays each build as it lands; file his
  logs as `playtests/README.md` describes.
- **Tone:** friendly, plain, short reports: what changed, what was checked, what to watch.
- **Before the first line of code,** confirm with the owner: the switch (below), the order inside Build 1, and
  anything in `design/ring.md` marked *open* that the piece in hand depends on.

## Ground rules for every build

1. **A switch.** The ring's rules live behind one flag in `engine.js`, beside `ACT_TWO_LOCKED` and
   `SNARE_OPEN_AT_START` (lines 30 to 40). With it off, today's game and every existing test stay as they are. With it
   on, the ring's rules apply. *Suggested:* a module-level value with an `E.setRing()` for tests, the way
   `E.setNotation` works, so both rule sets can be tested in one run. Confirm the approach with the owner first.
2. **Rules first, then screens.** Each new piece starts as a pure, tested rules file (no DOM, no clock, a seeded
   generator), as `evals.js` and `packet-snare.js` are, with its screen in a separate file (`evals-ui.js` is the
   pattern). `engine.js` stays free of DOM.
3. **Saves.** `SAVE_VERSION` is 37. Any change to the state's shape bumps it, extends `migrate()` and adds a test.
4. **Numbers.** `tools/ring-model.js` holds the starting dials (`DEFAULTS`). When a price is added to the game, use
   the model's value; when the game's value changes, change the model's and rerun it.
5. **Verify** as `CLAUDE.md` says: `node --test`; load the page at 390 × 844 and 844 × 390 (phone first: the owner and
   his brother play on iPhones), then 1280 × 800; no console errors, no page scroll, no layout shift.
6. **The playtest log.** Add an event for each new thing a player does (`pt(type, data)` in `game.js`), small.
7. **`CLAUDE.md`.** When a build lands, describe the ring's rules in a new, short section and move what they replace
   to a changelog file. `CLAUDE.md` is 281 KB and later paragraphs overrule earlier ones; do not add to that.
8. **The owner's layout and copy rules still apply** (`CLAUDE.md`: layout stability, reveals, no hints or recipes,
   phones; `design/review/settled.md`: Packet Snare's copy). The Feed's and the roster's text follow the same rules.

## The five builds

Each is playable. The owner's brother plays each before the next starts.

### Build 1: the small loop

A fresh save goes round the lab, Packet Snare and The Feed a few times, and research piles up.

| Piece | What to do | Where to look |
|---|---|---|
| The Feed's rules | A new pure module (suggested `feed.js`): the heap, tiles (plain, vein, one fragment set, unreadable), layers, mites, pointing a line, chewing, grazing, research paid per tile and per layer. Its dials in one table, from `tools/ring-model.js`. Tests | `evals.js` for the shape of a rules module; `design/ring.md` → The Feed |
| The Feed in the save | `state.feed` (the heap, layers, mites, fragments found), a version bump, `migrate()`, a test. Research goes to `res.rp` | `engine.js`: `migrate`, `state.evals` as the pattern |
| The Feed's screen | A bay in the server room and a screen: the heap, the swarm, the pointing gesture, tiles flipping, the layer payout. It grazes while you are elsewhere with the page open | `game.js`: `BAYS`, `ROOMS`, `CAMERAS`; `evals-ui.js` |
| Compute buys the clock | A Packet Snare run costs compute for its seconds: 10 a second on sector 1, times 1.6 a sector. Ask the owner how it is shown and paid (at Start, with a short clock if you can't afford a full one?) | `engine.js`: `snareOpts` (`focus`), `packet-snare.js`: `focus`; the run's start card in `game.js` |
| Runs fill the heap | When a run on the frontier sector ends, its packets go to the heap, tougher by sector. Replays add nothing | `game.js`: where `pt('snare', …)` is logged (about line 4927), `clearSnareSector` |
| The opening | Your brother's laptop before the desk (weak clicks); Report spam on the opening mails (works on the junk, "fails" on the offer); after all 20 nags the offer returns with no Report and no close. Count reports and when the offer was taken | `engine.js`: `MAIL` (`intro: true`), `WELCOME_NAGS`, `CLICK_TOOLS`; `game.js`: `nextNag`, `leaveMail`, `renderInboxClose`, `openMail` |
| The lab without two buttons | Under the switch: no Collect Data or Research buttons, and the finished desk opens the server room with Packet Snare first | `engine.js`: `ACTIONS`, the `module:path` and `module:snare` milestones; `game.js`: `ROOMS.servers` |
| Training waits | Under the switch the Training Cluster stays sealed in this build (its sprints still cost compute and data until Build 2) | `game.js`: `BAYS` |

**Changed on 2026-11-13 (the owner's calls while building):** the places live on the desk, then in a garage
(`design/ring.md` → Where the places live), so where this table says "a bay in the server room" or "opens the server
room", read: an object on the desk (the wire for Packet Snare, the drive for The Feed). The Feed's screen is a
full-screen dialog (built, behind `#feed` and the debug panel until its door exists). The order inside the build: The
Feed's rules, save and screen (done), then runs fill the heap, compute buys the clock, the lab without two buttons with
the desk's doors and training sealed, and the opening last.

**Built so far (2026-11-13), all under `#ring`:** The Feed (as sand: `design/ring.md` → The Feed), its save and screen;
**runs fill the pile** (every run, the owner's call: what it caught as sand as tough as the sector it started on, a
garbled catch's packets and half of what popped bubbles and snapped loops held as bad sand; `feedFromRun` in game.js,
`garbledPackets` and `poppedPackets` in a run's stats); **compute buys the clock** (the owner's calls: paid at Start
for the whole clock, 10 compute a second on sector 1 and 1.6 times more a sector; short of it you play the seconds you
can afford, three at the least; the first run ever is free; going deeper costs nothing more; `snareClock` and
`snarePayClock` in engine.js). **The desk** (`design/ring.md` → Where the places live: a screen with icons, a
four-thing desk, no Collect Data or Research, no server room, training sealed; `renderDesk` in game.js, `deskDone`,
`RING_DESK` and the milestones' ring branches in engine.js). So a fresh save under `#ring` can be played round the
small loop with no debug panel. **The opening** (the owner's calls, 2026-11-13; built): the game opens on the device's **mail
sign-in** (a first name and an email name: `state.player`, save v39; a phone on a phone, else the laptop); **your
brother's mail** comes first (it judges your email name, says the device is weak but reliable, and warns about
clicking, with his princess story); the junk and the offer carry **Report spam** (the mail is deleted and IT thanks
you; on the offer the next nag still comes, as it does when you close it and leave it on read); reports and closes are
counted; the ring's **first offer** is from someone who wants rid of an AI (the 20 nags are as they were, for Build
4); after the last nag the **forced final offer** has no Report and no close. **The whole view is the device's
screen** (bezel, crack and dimness until the monitor), with a desktop of icons (Mail, Packet Snare, The Feed) and the
lab's panels as its windows (Compute, Parts). That is Build 1, bar tuning from play.

**After the owner's first look (2026-11-13; built):** the crack, lines and bezel lie over dialogs too; your brother's
mail reads like a brother's; Report spam is a button like the reply, both after the mail's words; the junk has a reply
of its own; a nag waits unread and never opens itself. **A new game starts on the device's home screen** once mail is
set up (`renderHome` in game.js): a laptop's desktop with a taskbar, or a phone's home screen with a status bar, with
Mail on it. When the offer is taken **the Lab downloads itself** (a window with a bar on the laptop, an icon filling in
on the phone) and, opened, takes you to the lab with **a welcome** of four plain steps (placeholder words: what to do
and why you click). Flags in `intro`: `ring:labInstalled`, `ring:labOpened`, `ring:welcome`. **For Build 2:** the server asked for when the boss shows, and training's icon on the monitor.

Done when: a fresh save under the switch reaches The Feed inside about two minutes of the server room opening, the
loop can be repeated without getting stuck, research rises, and all existing tests pass with the switch off.

### Build 2: the middle loop

| Piece | What to do | Where to look |
|---|---|---|
| The first gate | Sector 3's boss needs Pattern Matching | `engine.js`: `SNARE_GATE_SKILLS`, `snareGateSkill`, `SNARE_GATE_ARMOR` |
| Training opens at the boss | It opens when that boss is first met (*proposed:* or after about six runs) | The `module:path` milestone; the gated boss's end card, which already links to the Training Cluster |
| Sprints cost research | 35 a full sprint to start, keeping `pushCost`'s shape by charge and by leg. This retunes the most tested part of the game: update `tools/sim.js` and the tests with it | `engine.js`: `pushCost`, `payPush`, `affordableCharge`, `burnCost`; `tests/sim-sync.test.js` |
| Help when stuck | After several frontier runs that die on the same skill hill, a mail offers to spend idle compute on a surge for three runs. It moves no path | `engine.js`: `DILEMMAS`, `path.surge`, `SURGE_POWER` |

Done when: an average player beats the first boss at about minute 15 (the model's figure), and a clumsy one is never
left with nothing to do.

### Build 3: the full ring

| Piece | What to do | Where to look |
|---|---|---|
| Agents and the roster | One agent per boss, assigned to a place, movable and stackable. Scheduled tasks becomes the roster. The crawler, Research Assistant, Procurement Bot and Auto-Trainer become what an agent does in a place | `engine.js`: `TASKS`, `state.tasks`, `AUTOMATION`, `taskShares`; `design/ring.md` → Agents |
| Evals as a bay | The third bay becomes Evals for every player, opening when the first boss falls, with a mail. Each boss opens the next step of kinds | `game.js`: `BAYS.architecture` (the `#bays` branch already builds it); `evals.js`: `LADDER` |
| Funding rounds | Each rival passed gives the lab room. Room stops coming from skills | `engine.js`: `capacity()`, `CAPACITY`; `evals.js`: `RIVALS`; `state.evals.passed` |
| The first tear | Beating a boss opens a tear that trickles data by your best run against it; beating your best opens a bigger one. The scene when the first one opens | `design/ring.md` → The AI's tears; `PATH.clearedRate` for the rule it copies |
| The research trickle goes | `snareRpPerSec` is retired | `engine.js` |

Done when: a fresh save goes once round the whole ring.

### Build 4: the story

| Piece | What to do | Where to look |
|---|---|---|
| The three backers | Your mom's fake investment after the desk, your dad's real one | `engine.js`: `MAIL`, `DILEMMAS` (the `mom` entry's line gets a new job) |
| Three replies | Grant, refuse, call it out, on mail from a person. Each side of a choice pays the same size in a different kind | `DILEMMAS`: `choices`, `now`, `later`; `FREEDOM_XP` |
| Mail opportunities | Investor offers become mail | `PROJECTS`, `PROJECT_TASKS` |
| Stance | Track helping, holding and knowing; the opening's counts feed it | `state.dilemmas` (`freedom`); `design/ring.md` → Paths |
| Four endings and reveals | At the demo's ending, by stance. A test that reaches each | `ENDINGS`, `ending()`, the `reveal` and `chapterOne` mails, `showEnding` in `game.js` |

The owner writes or approves every line of mail. Draft in the voice of the existing mails and show drafts as cards or
a short list before wiring them.

Done when: each of the four endings can be reached in the demo, and a test proves it.

### Build 5: proving it

- Extend `tools/ring-model.js` past the first boss, to the ending.
- Clumsy and expert players in `tools/sim-variants.js`, reporting stuck states (longest streak on one hill, minutes
  with compute banked and nothing to buy), not pace.
- Behaviour numbers in `tools/playtest-calibrate.js`: minutes to the first summit, the share of runs started within
  five seconds of the last result, unprompted room switches per 20 minutes, how the session ended.
- Check-ins and a feedback button inside the demo for playtesters, riding in the playtest log.
- The owner's brother's full run, then a few people who have never seen it.

Done when: the finish line at the top of `design/ring.md`.

## Things a new session should know

- **The game is played as a claude.ai artifact on phones.** `CLAUDE.md` lists what that frame refuses.
- **The sim and the Packet Snare bot play worse than the owner** (he plays 1.7 to 1.9 times the bot's pace). Use them
  for regressions and stuck states, never as a pacing oracle.
- **`playtests/reviewer/` does not exist on this branch**; scripted logs are not player evidence and were not kept.
- **The planning session's longer reasoning** (the design review and the action plan) lives in two documents on the
  owner's Claude account. Everything a build needs from them is in `design/ring.md`.
- **`design/story.md`** is still right about what is built and about its settled rules on reading the player
  (choices, not skill; same-strength rewards). Its three paths and its open questions 3, 4 and 10 are answered in
  `design/ring.md`.

- **The lab is one app (2026-11-13, the owner's call).** Mail, Packet Snare and The Feed are icons on the home screen, not a strip in the lab; the lab's home crumb (and leaving Packet Snare) goes back to the home screen (`goHome`, `homeUp`, session only); the top bar's envelope is hidden; new mail and Packet Snare coming online drop from the top as device notifications that open the app (`deviceNotice`). Reporting spam says "Moved to Junk."

- **Home screen apps (2026-11-14, the owner's call).** Journal, Settings, Playtest (a placeholder survey, `openSurvey`, saved to the log as a `survey` event) and Debug are home-screen icons. The opening's mail keeps arriving with Mail closed: on the home screen the next mail, then the offer's next copy (`sendNag`), comes a beat later with a notification.

- **The desk is bought with money (2026-11-14, the owner's call).** Under the ring the four desk parts cost dollars (`DESK_PRICES`, one `RING_DEPOSIT` covers them), not compute. At `RING_CALL_CP` compute a call from M0M (the AI) rings out to voicemail and a transfer is offered: accept or decline. Declined: Dad's mail and his transfer; declined: Mom's mail and hers; all declined: pay day, no question. Taken from M0M, Mom's real transfer still arrives later (something is off). `fundStep`, `fundDecide`, `deskCash` in engine.js (flags in `intro`, nothing stored), `fundTick`, `showCall`, `showTransfer` in game.js; `tests/ring-funds.test.js`. Numbers, timings and the mails' words are placeholders. No loose data mail under the ring; the map's home and the laptop window's x go to the home screen.

- **Build 2, first piece (2026-11-14, the owner's calls).** Sector 3's boss is gated on Pattern Matching under the ring (`snareGateSkill`). The first time it escapes, the game sets `ring:server`: Parts offers a Server for money (`RING_SERVER_PRICE`, the keyboard upgrade's fifth level; a `fund:server` deposit for whoever is short). Buying it opens the Training Cluster (`module:path`), added to the home screen with a notification. A sprint costs research there (`RING_SPRINT_RP` 35, `pushCost`). No server-room mail under the ring. `tests/ring-training.test.js`. Still to do in Build 2: tune the sprint cost against The Feed's research, the Training screen's Lab supply line, help when stuck.

- **Build 2, help when stuck (2026-11-14).** `path.stuck` (save v40) counts frontier runs in a row that neither learned the skill nor beat the best. At `RING_STUCK_RUNS` (5), in the Training Cluster between runs, a prompt offers a surge for `RING_SURGE_SHARE` (half) of the compute held: the next three runs start 50% stronger (`stuckOffer`, `takeSurge`, `passSurge`; `stuckTick` in game.js). Taken or passed, the count starts again. Training's chip reads Research, and the Server's card says what it opens. Open: the sprint's research cost against the sand Feed's real output (the model predates the sand).

- **The old lab stays hidden under the ring (2026-11-14, the owner's call, until it is designed in).** Of the lab's own tabs only the desk and the Graphics Card show (`RING_LAB`, `ringHides` in engine.js); the Auto-Trainer and the Algorithms and Consciousness tabs never unlock (`RING_NO_MILESTONES`); no choice mails (`tickDilemmas`) and none of the old story's mails arrive; the tips about tasks and "back to the lab" are off. The playtest log counts the home screen and The Feed as their own screens. Open: with only Graphics Cards, compute is about 10 a second at the start and 25 to 40 through the first skills, against a Packet Snare clock that costs 1,300 a run by sector 5 and 8,600 by sector 9.

- **The device shell (2026-11-14, the owner's calls from annotated screenshots).** The old top bar is gone under the ring; a status bar (`renderStatus`: clock, Bank, Compute, Research with its real rate from The Feed, Signal, XP, one at a time when they don't fit) sits over every app. On a phone a dot at the foot reveals Settings, Home, Playtest. Packet Snare's card docks at the bottom and the tree's Back and Start run sit at the foot. Mail's buttons are one width. Bulk buy, the Research preview and the server cabinets are hidden. The Journal's home icon is Achievements (a trophy). Tips that can never show no longer hold the sprint button (`callout`, `nextCallout`). `tools/review/ring-log.js` measures a playtest log; the owner's Build 2 log is in `playtests/ring/`.

- **Packet Snare's tree: Sprawl and Sanitizer swapped (2026-11-14, the owner's call; save v41 refunds the tree).** Sprawl roots the boss branch at (0, 1): one cheap level (15 Signal) shows the locked boss nodes, then 600, 3,000, 12,000, 40,000, 120,000, 350,000, 1M, 3M (`opens: 1`: its children are priced past its first level only), so the field stays close for longer. Sanitizer starts Flow at (1, 0) and leads to Gold Rush and Containment. The owner confirmed the prices (2026-11-14). The Decoder Bot is a Flow node (the owner: "feels more like a flow option"): at (1, 1) off Sanitizer, Gold Plating at (2, 1) after it; Ricochet took the freed cell at (-1, 2), now off Kernel Panic (it was off Riposte).
- **Antivirus notice you (2026-11-14, the owner's call, under the ring only).** One more Antivirus for every seven cleaner units (Sanitizer's fifth level), three more at most (`SNARE_AV_NOTICE`), and the field's share grows with its area at ^0.35, not ^0.25 (`RING_AV_AREA`). The owner: "careful not to overdo it". Proposed numbers.
- **Owner's notes for later (2026-11-14).** The boss fight needs a clarity pass: be plain about what stuns and what damages, so small stuns (a smashed decoy's 1.2 s reel, a thrown mine's 1 s reel, a Firewall's stun) don't get in the way of, or muddy, the loop-to-stun then slash rhythm. The owner's log: 17 loops round an already-stunned boss. Saved for later, not designed: the player's Firewalls blocking the boss's attacks on turrets and other tools.

- **Hop is hidden under the ring for now (2026-11-14, the owner's call):** `exploitCharges` is 0, so its button, tips and windows never show.

- **Decisions on the open Build 1 and 2 items (2026-11-14, the owner's cards).** Packet Snare's clock price and research against The Feed are left as they are until Build 3. Sector 2's goal is 150 (was 170). Declining money is now M0M's transfer, then Mom's mail and her own transfer, then pay day; Dad's mail waits for the story build. The transfer prompt sets the sender in the mono face so the zero in M0M is plain.

- **More decisions (2026-11-14, the owner's cards).** Boss fights: only your own moves stun it (`ownStuns` from `E.snareOpts`: two loops or a parry; a smashed decoy, a thrown mine and a Firewall still damage and block but open no slash window). The Debug icon is gone from the home screen; a three-finger tap anywhere, or holding the top strip of the screen for 0.8 s (not during a live Packet Snare run), opens the panel on every screen (`debug-panel.js`). The Feed's sessions are decided and written in `design/ring.md`.
