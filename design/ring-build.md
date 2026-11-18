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
- **Feel is the owner's to judge** (2026-11-16): whether something feels good or is fun is never ours to decide.
  Measure what can be measured; for anything subjective, ask, with options built on the owner's feedback.
- **The test link goes at the end of every round's summary** (2026-11-16), not the top: the play server
  (https://wpc.tail0d614c.ts.net/#playground) when the owner's PC is up, else the artifact "The Path to AGI · test
  build" (https://claude.ai/artifact/9Sc3mL6iQFeDVNmdnjtP5Q#playground, the game's own index.html), republished each
  round with every file. Give it with `#playground` already on (the owner's call, 2026-11-16: easy testing).
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

- **The Feed's sessions, piece 1: stockpiles and hunger (2026-11-14, the owner's cards).** Under the ring The Feed plays in sessions (feed.js `sessions`, engine.js `feedOn`; save v42). A run's packets go to a stockpile for the sector it started on, capped at `stockRuns` 3 × your best run there (at least `stockMin` 60); what does not fit is lost, and a full stockpile sends a notice. Nothing eats outside a session. The Feed's screen shows the stockpiles between sessions; Start session pours one in. A hunger bar (`life`) drains over `hungerTime` 25 s and eating paying sand refills it (the whole bar for `hungerFill` 0.6 of the layer's worth); a split fills it. The session ends when the bar is empty or the sand is gone, and pays research ×(1 + `sectorPay` 0.5 a sector past the first). A session runs only while the screen is open (leaving pauses it); End returns the sand that had not poured yet. Measured with the tools' lead-to-the-top bot on sector 1: 180 packets is eaten in about 100 s, 450 in about 190 s with 4 splits, and from about 1,200 the swarm starves at 3–4 minutes; left alone it starves on 450. Sand already in the box is lost when the swarm starves or you press End (the owner's call, 2026-11-14: keep it lost, hunger is a real stake). All numbers and words are placeholders. Next: stat-boost cards at splits, then the four tools as cards.

- **The Feed's sessions, piece 2: cards at a split (2026-11-14, the owner's cards).** In a session each split offers `cardChoices` 3 different cards and the session waits until one is picked (feed.js `CARDS`, `offerCards`, `pickCard`; engine.js `feedPick`; `session.cards`, `offer`, `picks` in the save, read by `clean`, no version bump). A card lasts the session and stacks: Sharper jaws (eat ×1.25), Slow burn (hunger bar ×1.25 longer), Quick legs (move ×1.3), Rich grain (research ×1.2). A card marked `rare` is offered in a slot at `cardRare` 12%: the owner wants the better mechanics and machine or bot cards as a small, rarer chance in the same mix, and those come with piece 3 (none are rare yet). Names, words and numbers are placeholders. Logged as `feedCard` (card, what was offered, its level, the split), and `feedSession` carries `cards`.

- **The Feed's sessions, piece 3: tools and combos (2026-11-14, the owner's cards).** Five tools are rare cards (12% a card offered); each works on its own and a copy brings it round sooner (÷ 1 + `toolFaster` 0.5 a level) or makes it bigger (feed.js `tools`, `toolLevel`). **Scanner**: a beam crosses the box every `scanEvery` 12 s and shows the gold and fragments in settled sand. **Pulse**: every `pulseEvery` 8 s a burst at the point you hold (else a mite) eats every grain within `pulseR` 4 cells (+1 a level). **Arc**: every `arcEvery` 3 s sparks between neighbouring mites within `arcReach` 30 cells (+8 a level) eat the sand along the line. **Sorter bots** (the owner's design: like with like, so there is still a choice of where to go): a bot a level carries gold toward the right wall and garbled sand toward the left, `sortRate` 120 grains a second up to `sortHop` 14 cells each. **Algo-rhythm** (the owner's idea, in place of sorting pipes): every `shakeEvery` 2 s the box shakes and up to `shakeMoves` 300 garbled grains a level sink a cell. **Combos** (the owner's call, from a picture of two-item recipes; merge into one): once you hold both tools a combo can be offered as a rare card, and taking it replaces the two with one tool that works each at `comboLevels` 2 levels a level of its own, copies past the first carried over: **Sonar** (Scanner + Pulse: the pulse goes off on gold), **Storm** (Pulse + Arc: a burst of `stormR` 3 at each end of every arc), **Defrag** (Sorter bots + Algo-rhythm). The cards you hold show as chips under the hunger bar. Names, words, numbers and which recipes exist are placeholders; the other pairs have no recipe yet.

- **The Feed's combos rebuilt as effects of their own (2026-11-14, the owner's calls; this replaces the combo part of the note above).** A combo is a new thing, not its two tools made stronger: taking it uses both tools up (every copy), it is one card that is never offered again once held, and the tools can be picked again for themselves or for another recipe (the same combo is not made twice). Five recipes: **Sonar** (Scanner + Pulse, the owner's design): every `sonarEvery` 7 s a ring spreads from the point you hold to `sonarR` 26 cells, showing the sand it crosses, then draws the gold and fragments inside up to `sonarPull` 16 cells back toward its middle. **Storm** (Pulse + Arc, the owner's design: chain lightning): every `stormEvery` 3 s each mite sends `stormForks` 2 bolts out through the sand round it, grain to touching grain, `stormLen` 28 grains each. **Defrag** (Sorter bots + Algo-rhythm): every `defragEvery` 2 s up to `defragMax` 80 garbled grains with `defragPack` 6 garbled neighbours are rewritten into plain sand. **Tracer** (Scanner + Arc): every `tracerEvery` 1.5 s a spark from each mite takes the `tracerEat` 4 nearest gold grains within `tracerReach` 26 cells. **Magnet** (Scanner + Sorter bots): gold is drawn through the pile toward the point you hold, `magnetRate` 160 grains a second. A combo's card says which tools it uses up. Open: a Pulse + Algo-rhythm recipe (the owner asked for more options that feel connected to both). All names, words and numbers are placeholders.

- **Resonance, the sixth combo (2026-11-14, the owner's pick).** Pulse + Algo-rhythm: every `resoEvery` 2 s, on the beat, a small burst of `resoR` 1.6 cells goes off at the sand nearest every mite at once (the owner: much smaller areas than a Pulse's). Placeholder name, words and numbers.

- **The last four recipes (2026-11-14, the owner's cards): every pair of tools now has a combo, ten in all.** **Sifter** (Scanner + Algo-rhythm): every `siftEvery` 4 s a beam sweeps on the beat, shows the sand, and shakes each gold grain it crosses up to `siftRise` 5 cells toward the surface. **Demolition bots** (Pulse + Sorter bots): every `demoEvery` 4 s a bot flies to the thickest garbled sand it finds and blows away a circle of `demoR` 4 cells. **Relay bots** (Arc + Sorter bots): every `relayEvery` 3 s `relayBots` 2 bots take places on the pile and a spark runs mite, bot, mite, bot, eating up to `relayMax` 30 grains a leg. **Drum line** (Arc + Algo-rhythm, the owner's design): every `drumEvery` 2 s a row of `drumSparks` 10 sparks drops on the pile; each takes `drumHit` 2 bites out of the top grain of its column and the one on the floor under it, so soft sand is collected and hard sand is left easier to eat. Placeholder names, words and numbers.

- **The Feed's sand: finer, and it flows (2026-11-14, the owner's call: "do all of that and let's see").** Grains are half the size: the box is 256 × 448 cells (was 128 × 224) and a packet makes 64 grains (was 16); every length in feed.js's dials is doubled and every count of grains quadrupled, so tools reach the same share of the pile. **The sand moves every frame it is drawn**: feed-ui.js steps it from its own frame loop (`AGI.feedFrame`); it was stepped by the game's loop ten times a second, the main reason it looked stiff. **Gravity**: a falling grain speeds up, one cell a pass up to `gravity` 4 (its speed kept in the cell above the hp bits, `velOf`), at `fall` 120 passes a second, two a frame. **Slumping**: a resting grain on a slope steeper than one in two rolls a cell down it one pass in `slump` 4, so heaps settle shallower and slide when dug under. Grains are drawn two pixels square and solid, each in its own shade (the faded corners drew a mesh at this size). To keep the eating rates the owner approved, a mite takes up to eight moves a bite (`moves` in `step`) and saves up an eighth of a packet's bites while it walks. Measured against the coarser sand with the same test player: left alone the first split comes at the same second; led on the pile's peak, one mite eats at the same rate and four mites about 15% slower. Falling skips the empty rows above the pile (`TOP`). Measured on this PC: the rules take about 1.4 ms a frame with six mites and five tools, and the screen holds 60 frames a second at phone and laptop size with no frame over 17 ms; not measured on a real iPhone. A save with the old box is emptied on load (feed.js `clean`: stockpiles and records stay, a session in play is dropped). The test suite takes about 15 s (was about 5).

- **The swarm has a mind of its own (2026-11-14, the owner's cards).** Led mites no longer go straight to the point: each picks its own spot within `roam` 40 cells of it (the owner's pick: strong), afresh every 1 to 2.5 s (feed.js `goalFor`), and swings `wobble` 0.9 radians either side of the straight line on its way. **Characters** (`CHARACTERS`, a mite's `c`; a new mite's is drawn at random, the first is gold-hungry): **gold-hungry** goes for gold it can see, and stops for it on the way; **tidy** goes for garbled sand; **loner** works away from the rest; **follower** keeps beside the mite before it; the others head for good sand first but still eat what is in their way (`liked`). **Mega mite**: `megaChance` 8% of new mites, takes a second grain beside each one it eats (`take`). Each has its own colour and one mark (a feeler, a hat, three legs, a tail; the mega is half as big again with two eyes). **Focus**, a common card: each copy cuts roaming and wobble to 0.7. Pace, not compensated (the owner's call: let it be slower): one mite led on the pile's peak eats about a quarter slower (22 packets in the first 20 s against 30); a full session comes out level (293 packets in 90 s against 291) because roaming mites stop going for the same grain, and with two Focus cards 403. `roam`, `wobble` and `character` at 0 are the old straight swarm (the tests' `STRAIGHT`). **For later** (the owner): the AI sways what mites go for and how far they obey, by relationship path; `goalFor` and `liked` are where that goes. Words and numbers are placeholders.

- **The mites as the owner drew them, and a zoom (2026-11-14, the owner's two character sheets).** feed-ui.js `drawMite` draws each character in its own fixed colours, the same in every theme: the gold-hungry a yellow blob in round glasses with a small frown; the tidy an orange burst of eight spokes; the loner a grey mound with two oversized eyes; the follower a blue-to-violet four-pointed star with two sparkles; the mega mite a big cream puff with a body to it (a scalloped head over a wider belly, bumps down its sides, two feet; reshaped the same day: the owner found the first one a circle), a ringed face and a blush. **They hold sand only just after a bite** (`HOLD_MS` 450 ms from an `eat` event beside them; the sheet with sand and the sheet without): the gold-hungry a nugget to its mouth, the tidy its row of sorted squares, the mega a nugget in each hand. Mites grow with the view (6 to 26 px). The sheets name the AI companies each look is adapted from; none of those names is anywhere in the game. **Zoom** (the owner's ask, to work a spot closely): up to `ZOOM_MAX` 6 times the view's own size. Two fingers pinch and drag the view while one finger still leads the swarm; with a mouse the wheel zooms at the pointer and the right button drags; + and − buttons in the stage's corner zoom on the point you hold (else the swarm), and ⟲ shows the whole pile again. Zoomed in, grains are drawn as crisp squares. The zoom is the screen's alone: nothing of it is saved.

- **The Feed's camera, and the view controls in thumb reach (2026-11-14, the owner's calls).** Mites are empty-handed always: the sheet with sand in their hands is not used (the `eat`-event tracking and the nuggets are gone). **Camera**: while you hold a point, a window `CAM_W` 138 × `CAM_H` 96 px shows the sand and mites under it enlarged (at least `CAM_CELL` 6 px a cell, twice the view's size when that is more), with a cross on the point; it sits `CAM_UP` 46 px above the finger (below it when there is no room above), or docked in the box's top left corner. The choice is the **Camera: follows / docked** button, kept on the device in `localStorage['agiFeedCam']`. **Controls**: the camera button, +, − and ⟲ are a row under the box (they were in its top corner), shown only in a session. **Zoom resets** when a session starts, as well as when the screen opens.

- **Parcel, the shop app; the status bar; a phone held sideways (2026-11-14, the owner's cards).** **Parcel** (a placeholder name) is a home-screen app where money is spent, so the Lab is not cluttered with it: the desk's four parts and the server are bought there and nowhere else (game.js `shopOnly`, `openShop`, `shopItems`; the Lab's Parts window is hidden while it is empty, `.station.ring-empty`). The owner will widen the Lab with other ways to make compute later; hardware lives in the shop. Each product shows its picture, name, words, what it does and its price; only the next part can be bought (the engine counts the desk as one level after another), the rest read Next in line; Garage and Warehouse are greyed chips for later. **Short delivery** (the owner's pick): an order holds its money at once (`bankNow`) and arrives `PARCEL_MS` 8 s later, bought and installed then with a notification; one order at a time. The order is not in the save: a reload before it arrives cancels it, money back. The app shows once there is money or a part; its badge says there is something affordable. The deposit's and the server's notifications point to it. **Status bar**: the open app's own number is left out (Signal in Packet Snare, Compute in the Lab, Research in The Feed, Bank in Parcel; `ringAppNow`), and on an upright phone the labels are short (CP, RP, SIG, XP; the bank is its dollar sign) so four fit at once. **Sideways phone** (`orientation: landscape` and at most 520 px high): words are bigger and brighter; the Lab's readouts stack down the left with its windows on the right; the home screen's apps are one row and its dock a slim row that no longer covers an app; the shop's bar is slimmer. Words, prices and the delivery time are placeholders.

- **After the owner's phone log of the build with Parcel (2026-11-14, their words and cards).**
  **The Feed.** A **tapped point** stays (feed.js `mark`, `state.spot`) until you tap elsewhere or tap it again: the swarm works round it more loosely (`tapRoam` 1.5) and at `tapRate` 0.6 of a led mite's eating; holding or dragging still pulls them tight at full pace ("drag attracts mites more than a tap"; left alone they graze at a quarter, which the owner found useless). The **camera** is bigger and less enlarged (210 × 140 px at 1.6 times the view; it was 138 × 96 at twice). The **first mite** is any of the four characters (it was always the gold-hungry). **Tough sand feeds more**: a paying grain fills the hunger bar 1 + `toughFeed` 0.7 for each bite past the first that its sector's sand takes (sector 2: 1.7 times, sector 3: 2.4), so deeper sand is still a little worse a bite than soft sand (the owner's call: it should push you to better sand by playing). In the log, sector 2 and 3 sessions had starved in 35 to 41 s with no split, 278 packets lost in one. A **tidy mite** clears garbled sand only while the hunger bar is above `tidyAbove` 0.5: a lone tidy first mite starved a session in the browser check.
  **Parcel.** Orders **queue**, `PARCEL_MS` 3 s apart (it was one at a time and 8 s: the desk took 94 s to buy against 3 s in the Lab, and the owner logged it as slow). **Compute is sold for money** there (engine.js `sellCompute`, `RING_CP_PER_DOLLAR` 10, `stats.cashSold`; save v43): the owner's idea, a source of money that needs no offer taken, and a hook for later for whose models your compute feeds. **Graphics Cards are bought in Parcel for money** (their compute price at that rate, a dollar at the least; `cardsSpent` comes off `deskCash`; a ring save's cards from before are paid for). The boss's end card says Get a server in Parcel and goes there (it said the Lab, the owner's report). The pay-day deposit for a player who declines every offer is still there: selling may now replace it, the owner's call to make.
  **The AI's voice** (game.js `assist`): from the Lab on, the tutorials are lines from the AI in a pale bubble at the foot of the screen, in the system's plain face, with what it is talking about ringed; a line stays until tapped away, its button taken, or the thing done. Lines so far: the Lab's first two (they were a card of four steps), money and Parcel, Packet Snare, the first catch and The Feed with the reason to go (the notification was hardly seen and gave none), The Feed's two (they were a card), a full stockpile, the server, Training. **Every line is a placeholder I wrote in the voice the owner described (dry, now and then mixing up something small); the owner writes or approves each.**
  **Also from the log:** nothing rings or deposits over a Packet Snare run (Mom's transfer had come up in the tutorial); the hold-to-repeat tip waits for the Lab (it had come up over the shop). Two of the owner's three Playtest entries were saved (the delivery is slow; Graphics Cards in the Lab are confusing); the third was sent empty.

- **No pay day and no money for the server (2026-11-14, the owner's calls on their second log).** A player who declines both M0M and Mom is given nothing more: compute sold in Parcel is their money, and the AI says so once (`assist('sell')`). The $400 that came when the server was offered and you were short is gone too ("players just get $400 for the server"): the server is bought with what compute sells for. A save that was given either keeps it.

- **The owner's third phone log (2026-11-14, 33.8 min, the first with the AI's bubble) and 14 screenshots gone through in cards.**
  **Fixed at once (bugs):** an AI line asked for while the last was closing was replaced 0.4 s later by the next (the Feed's two lines showed for 0.4 and 0.6 s; `assistClose`'s timer now only runs with nothing up, and the second line no longer counts "no session" as done); an app opened from the AI's button left Parcel on top of it (`closeApps`); the boss's escape card read 35.50000000000004 health; it named the Training Cluster (Training, under the ring); the old green Training tip came up beside the AI's line; the hold-to-repeat tip came up on the home screen; a delivery wholly lost to a full stockpile was not logged; Sell 100 was offered with less than 100; "Need $2 more" looked like a live button; the Feed's TEST row is gone (the owner: "we can remove the test buttons now"; `#feedtest` or `#debug` shows it); **a tapped point with no sand near it holds no mite** (feed.js `spotDry`: the owner's picture had three starving at the flag with the last pile across the field).
  **The owner's calls from the cards, NOT BUILT YET (each to be proposed and asked before building):**
  - *Pace:* a goal in each app before the next opens, and a set time in each before moving on, changed "right before" people want something different (the owner asks for this to be looked up or gauged). In the log: Lab, money, desk, Packet Snare and The Feed inside 150 s, with 7 AI lines, a call, a mail and 4 deliveries; the Lab got 0.7 min in all. Mom's mail must not land on the first run's end card with the AI's line (three things at once); The Feed came too early (after one 12 s run); the desk is "all bought right away".
  - *The AI:* starts polite and understated, trying to be helpful and making sure the player succeeds (the owner liked "I would rather it was not"); not tutorial text. It is **the phone's assistant with its own button** (like the home button or iOS's accessibility button) to "chat" with it and to see again the tutorials missed. Its highlight should ring the whole section it is about. Packet Snare's in-run coach and first card should be its voice too, with less to read first, no jargon ("wire", "throughput"), Signal explained, and the tutorial should make the player try the big loop so they feel the limit.
  - *Home:* tags on icons (new, something waiting), apps in the order they are needed with the others moving to make room, numbers in the status bar on the home screen, the icon grid centred. Every notification and achievement can be swiped up and away.
  - *The Feed:* too slow to play; splitting too slow and too weak early (first split at 30, 51 and 82 s: a layer is a share of the pile, so a bigger pile splits later); on clearing a pile, go on to the next sector's stockpile **bringing the mites along**; the result line is flat; the camera far larger with a control for its size; move the view with a virtual joystick or arrow keys, not two fingers; mites sometimes sit about or keep away from the finger instead of working round it; nothing says which sand is good or bad (the sand is "all one colour" early) and the zoomed sand is hard to read; the Fragment bar is unexplained; the Feed lacks the device's status bar and the other apps' controls; the field is too empty.
  - *Parcel:* hard to get in and out of to go where needed; delivered parts clutter the list; a gap above the title; "the clear new screen doesn't make sense on a phone as a monitor" (to be asked: what the desk's parts are on a phone).
  - *Training:* came fast and felt easy (the first skill 3 s into the first sprint, 8 upgrades in 100 s); old-game look (server_room header), two Upgrades buttons, XP twice. The boss's end card has too much on it.
  **What the log adds:** 20 Graphics Cards for about $190 in under a minute gave 10 compute a second; 4,450 compute sold for $445 bought the server 7 s after it was offered; 3,559 compute sat unspent at the end. Research: 6.5 min of The Feed made 496, which 100 s of Training spent; the last 8 minutes had 1 research, 579 packets waiting in three stockpiles, five tries at a boss that cannot be beaten yet (30% damage, best 22.5 of 40), 80 s idle on the tree, and nothing pointing back to The Feed. View events flap (home, lab, home within 0.2 s on every app change), which muddles the time-by-screen table; the log's build label is stale (2026-11-11, Packet Snare 18.8).

- **Pace, first pass (the owner's cards, 2026-11-14; order of work the owner approved: pace, The Feed, the assistant, the home screen).** What I could find on pacing gives no hard number (one mechanic at a time, a first real reward in 3 to 5 minutes, a first session of 15 to 60): the aim is 2 to 3 minutes in the Lab and 4 to 5 in each app after.
  **No loan to start** (the owner: "begin by selling compute and sell enough for each item one by one"): Parcel arrives at `RING_CALL_CP` 25 compute made (a notice, a NEW tag, one line from the AI) and buys compute; the desk's parts are bought one at a time with it. `DESK_PRICES` are now $10, $15, $15, $20 (about 600 compute in all at 10 a dollar: **my placeholder numbers**, they were $150, $40, $30, $180 against a $400 transfer).
  **The Feed** opens when a stockpile first fills with sector 1 cleared and `RING_FEED_RUNS` 4 runs played (`ring:feed`, engine.js `feedOpen`; it was the first catch); the owner may change the stockpile's cap to pace it. In the owner's log the first full stockpile came at run 8, about five minutes into Packet Snare. Until it opens a full stockpile's overflow is lost without a word.
  **Graphics Cards** go on sale after the first Feed session (`ringCardsOpen`), the first `RING_CARD_PRICE` $10 and each `RING_CARD_GROWTH` 1.25 times the last (ten about $330, twenty about $3,400; they were $2 rising to $25). **M0M's call comes then**, with `RING_DEPOSIT` $100 "to start automating" (the owner's words); Mom's mail and her own $100 follow as before (**kept by me: the owner named only M0M's $100**).
  **Arrivals** (the owner picked "the AI still announces"): a new app appears with a NEW tag until first opened (`ring:seen:<app>`) and one short notice, and the AI says one short line; the AI never speaks over a run; calls, mail and transfers come only on the home screen, never while the AI is talking, and `ARRIVE_GAP_MS` 45 s after the last arrival or line. Lines for Parcel, The Feed and the cards are placeholders of mine in the polite voice the owner asked for.
  An older ring save keeps its flags, but its money is worked out afresh from the new prices.

- **The AI's button leads home, it does not open the app** (the owner, 2026-11-14: "links should take you back home with the AI pointing out the new app and why it is useful, prompting you to move forward"): every line that had an Open button now has **Show me** (game.js `showMe`): it closes what is open, goes to the home screen, rings the app's icon and says why it is worth opening (`SHOW_WHY`, a second line keyed `<key>Home`, gone once the app is opened). Eight lines, all placeholders of mine.

- **The Feed, after the third log (the owner's cards, 2026-11-14).**
  **Faster** ("faster eating and splitting but same pay as now"): `chew` 4 (2), `speed` 360 (180), `pour` 16 (8); splits at 15, 23, 34, 51… packets (`layerFirst` 15, `layerGrow` 1.5; they were 30 and ×1.8, and were always fixed counts: the first split was late because one slow mite ate 30 packets); **a session starts with two mites** (`startMites`). A packet pays what it did. **Measured** on a session like the owner's (180 packets and 18 garbled of sector 2, a tapped point moved every 3 s, 6 seeds): the first split at 14 s (26), up to 6 mites (1.7), 3.9 research a second (0.96), and 341 research from the stockpile (112: before, the swarm starved with sand left). **So research comes about four times as fast and a stockpile is worth about three times as much; the owner has not seen these numbers yet, and Training's prices have not moved.**
  **Carry on** (feed.js `carryOn`, `session.wait`, a `cleared` event): a pile eaten with sand in another stockpile makes the session wait; the result shows with a Carry on button for each stockpile and Finish here. The mites, the splits so far, the cards and tools and the hunger bar come along; the result counts the stockpiles played. With nothing stockpiled the result offers Go to Packet Snare, and empty stockpiles are not listed.
  **The view:** the Camera button goes round Follows, Small, Large and Off (Large by default: nine tenths of the stage wide, a third of its height, docked at the top); a **joystick** at the bottom left moves the view while zoomed in, and the arrow keys do too (two-finger drag still works). A key over the sand says data, gold (pays more) and garbled (pays nothing); the fragment line reads "Message scraps n/4". The older Feed tests are pinned to the first dials (they test the mechanics); `tests/feed-pace.test.js` tests today's.
  **Not done from the owner's list:** the device's status bar and the other apps' controls on The Feed; the empty field; mites that sit about or keep away from the finger (only the dry flag was fixed); sand that is all one colour early.

- **The Feed's earning levelled** (the owner, 2026-11-14: "I meant that the earning value would be leveled to be the same as before"): `payScale` 0.25 on everything a session pays. Measured on four stockpiles (sector 1: 52 packets; sector 2: 78 and 198; sector 3: 132; a tapped point, 8 seeds), research a second was 0.84, 0.64, 0.91, 0.59 before the faster dials, 2.9 to 3.9 with them, and is 0.72, 0.71, 0.96, 0.85 now. **Levelled by research a second (my reading of "the same as before")**: a session is shorter, so a small stockpile pays less in all than it did (sector 1's 52 packets: 16, was 63), and one the swarm used to starve on pays more (sector 3's 132: 81, was 47).

- **Home screen and status bar** (the owner's picture answers, 2026-11-14): the status bar (money, compute, research, Signal) now shows on the home screen and rides inside Parcel and The Feed (they are dialogs over the page; the bar moves into the open one), so every app has it; upright phones set the apps in three even columns (they hugged the left); any notification or achievement can be flicked up and away (`notice` with `swiped` in the log). The apps were already in the order they are needed (Mail, Lab, Parcel, Packet Snare, The Feed, Training).

- **The assistant** (the owner's cards, 2026-11-14): a round button floats over every app once the Lab is installed (game.js `assistDotTick`; dragged anywhere, kept per device in `agiAssistDot`; it glows while the AI has something to say; hidden during a Packet Snare run). Pressed, a sheet opens: **What should I do now?** (`assistWhatNow`: the Lab, Parcel, Packet Snare, The Feed, the server or Training, by where you are) with a Show me that goes home and rings the app, and **Earlier**, every line said so far, tapped to see it again (with its pointing if it was said this visit). A line you ask for comes at once, ahead of any waiting. **All 28 lines are in one table** (`ASSIST_LINES`) and written out in `design/assistant-lines.md` for the owner to edit or approve: drafts of mine in the polite, understated, helpful voice the owner asked for.

- **The AI's look: the terminal voice** (the owner, 2026-11-14: the pale bubble in the system face was "not on theme"; their picks from a card): the bubble and the sheet are the device's dark panel with a green edge and glow, in the mono face, each line behind a `>` and typing itself out (`ASSIST_TYPE_MS` 14 a character, a blinking cursor; a tap while typing finishes the line, a tap after puts it away; at once under reduced motion); buttons read `[ show me ]`; the floating button is a dark disc with a glowing green orb that pulses faster and brighter when it has something to say.

- **Packet Snare's first card and first-run coach under the ring** (the owner's picture answers, 2026-11-14: too much to read first, the old terminal voice, jargon, Signal unexplained, and "we don't have the player try the big loop so they don't feel the limit"): the first card is the goal with what Signal is, one demo, one line and Start (the red packet's block is left to its walkthrough in the run); the coach's first-run lines are the AI's (`coach:*` and `card:*` in `ASSIST_LINES`, drafts, in `design/assistant-lines.md`), with no "wire" or "throughput"; and **the two-groups step first asks for one circle round both** (the ghost draws it): when the line runs out (`run.wireUsed` at 1, or a group is caught) it says why and asks for one at a time (`tutorial.wireTried`, logged as `snareCoach` `wireTry`). The old game keeps its card and lines. **The two-groups step was not played through in a browser** (only the card and the first coach line were).

- **The debug panel, brought up to date for the ring** (the owner's ask, 2026-11-14). Opened on a desktop with the backtick key, or `/?debug#ring` in the address, or by holding the top strip of the screen for most of a second (on a phone also three fingers at once); the home screen has no icon for it. **It now shows over Parcel, The Feed and Mail** (they are dialogs drawn over the page and it sat under them unseen; it moves into the open one). Under `#ring` it has a **The ring** section (`AGI.debug.ring(step)`): stages (desk built, The Feed open with a first pile, first Feed session done so cards go on sale and M0M calls, server offered, server bought), gifts (+$100, +$1,000, +500 research, three filled stockpiles) and the assistant (say every line again, NEW tags back). The Feed section gained Start a session and Give a card (the TEST row in The Feed is gone). The old game's Lab offers, Server room and Versions sections are left out under the ring, where they do nothing.

- **The playtest inbox** (the owner's ask, 2026-11-14: snapshots from the Playtest screen, and logs sent by themselves). The play server (`tools/review/serve.js`) now takes `GET /__playtest/ping`, `POST /__playtest/log?id=` and `POST /__playtest/shot?id=&name=&ext=` and saves under **`playtests/inbox/`** (git-ignored): `<run>.txt` is the log, rewritten each time, and `<run>/` holds its snapshots; a run is named for when its log began (`Playtest.started`). Served from there, the game sends the log every `INBOX_EVERY_MS` 60 s while it changes, when the page is hidden or left, and on Save and copy log. **Snap** (a ◉ in the status bar, on every screen but a Packet Snare run, where the bar is hidden) saves every canvas on screen as a PNG and the save as JSON **without `player`** (the sign-in stays in the save only), and marks the log (`snap`). The survey has **Add screenshots from this device** for screenshots made with the phone's own buttons (`photos` in the log). Anywhere else (an artifact, a static host) the ping fails and none of it shows. A web page cannot take a true screenshot on an iPhone: Snap gets the game's own drawings, not the buttons and text round them. **The server must be restarted to get this** (done 2026-11-14).

- **Snap captures the real screen on a desktop browser** (the owner's ask, 2026-11-14; game.js `screenShot`): the first Snap asks, in the browser's own dialog, to share this tab (`getDisplayMedia`, this tab preferred); after that each Snap saves a frame of it as `snap-<t>-<app>-screen.png`, cards and buttons and all, until the page is reloaded or sharing is stopped. Refused, or on a phone, it falls back to the canvases. **F8 snaps** on any screen, a Packet Snare run included. Also from the owner's two desktop pictures: the dock's icons are as wide as their names (Achievements ran out of the dock), the AI's wrapped lines line up under the first (the hanging indent was too deep), and on a desktop its bubble and sheet sit above the taskbar.

- **The AI speaks from the top** (the owner, 2026-11-14): its button starts in the middle just under the status bar (46 px; a new storage key, so an old dragged place is forgotten), and its lines and sheet open below it, centred; a device notice pushes the line down while it shows. On a phone the line covers the top of the app under it (in the Lab, the compute readout) until it is put away. **A line can wait for its moment** (`when` on a queued line): put away unanswered, the Lab's first line was followed at once by "Thank you" (the owner's report: "it thought I clicked the compute"); the thanks now waits for 8 taps, and The Feed's second line for a session.

- **From the owner's desktop play (2026-11-14), fixed:** the orb jumped right when grabbed on a big screen (the page is scaled 1.25 times there and `--zoom` reads as "calc(1.25 * 1)", not a number: the scale is now measured from the orb itself); the sheet's Show me showed before anything was asked and did nothing (`hidden` set through `el()` was dropped); **the sheet opens by the orb** (under it where there is room, else over it); the orb keeps out of Mail, Settings and the other small windows; the AI's line sits under the apps on the home screen (at the top it covered the icon it pointed at), at the foot over Mail, and out of sight over other windows. **A new app loads in on the home screen** (the owner: the AI says it found it and takes you home, and the load starts there): `appInstall`, `APP_INSTALL_MS` 3.5 s, a filling bar on a dim icon, then the NEW tag (`ring:inst:<app>`); the "has been added to your home screen" notices are gone.

- **The dock** (the owner, 2026-11-14: "the dock button at the bottom … open on hover and reveal the different options with a smooth reveal and then go away when moved away from. Parcel would sit on that dock"): the dot at the foot of every app is on laptops too now; with a mouse its bar slides up and fades in when the pointer comes over the dot and goes 0.28 s after the pointer leaves the dot and the bar (a tap still opens and closes it, and it closes itself after 5 s on touch); **Parcel is on it** once you have Parcel, and opens over the app you are in, closing back to it, so a part is bought from the Lab without going home (the owner's log: five Lab, home, Parcel, home, Lab round trips to build the desk).

- **Free graphics cards** (the owner, 2026-11-14: "start with one graphics card in their phone and get one with the tower"; engine.js `ringFreeCards`): the phone's card works from the moment the Lab is first opened and the Desktop Tower brings a second, each 0.5 compute a second like a bought one. They are worked out, not stored: `levels.cpu` stays the cards bought, they cost nothing, and the first card bought in Parcel is still $10. Parcel's "you own" counts them. So compute now comes in from the first second in the Lab (30 a minute; 25 made brings Parcel, with no tap needed), and a minute in the Lab is worth $3 at Parcel's rate before any clicking.

- **Screen sharing is asked for at the start of a desktop visit** (the owner, 2026-11-14: "auto start the screenshot for me … so every time I load I don't forget and I can just accept at the beginning"): on the first click or key after the page finds the playtest inbox (a browser lets a page ask only from a click or key, so it cannot be at the very moment of loading), the share dialog comes up; nothing is saved by it (`screenShare` in the log), and every Snap or F8 after it is the real screen with no dialog. Refused, Snap asks again.

- **Cards sooner, and a stockpile sized by an average** (the owner's cards, 2026-11-14, from their desktop log: 13 active minutes and five runs after the desk with no Feed and so no cards, 150 to 200 compute clicked for every run, $38 of compute sold with nothing to buy). **Graphics Cards go on sale, and M0M calls, when the desk is finished** (`ringCardsOpen`; it was after the first Feed session). **A stockpile holds three times the average of your best five runs there** (feed.js `stockTop` 5, `tops`; the owner: "like in cauldron"; it was three times the one best run, so every better run moved the target: 60, 117, 120 in the log). The Feed still opens on a full stockpile with sector 1 cleared and four runs; in the log's sector 2 (runs of 40, 39 and 17) the stockpile would have been full at 96 on the third run.

- **The dock's apps are panels** (the owner, 2026-11-14: "should not open full screen so they can easily be closed by click out of them"): Parcel is a panel over the app you are in (760 px wide at most, most of the height; on a phone it leaves the top of the screen showing), with the screen dimmed behind it, and a click or tap on the dimmed screen closes Parcel, the Playtest survey, and Settings and Achievements (`panel` with `by: outside` in the log). The Feed stays a whole screen. The status bar no longer moves into Parcel.

- **Sprint prices, from the owner's desktop log (2026-11-14, the owner's picks on two cards).** The log: the first Feed session paid 126 research against about 140 a Training run (four sprints at 35), so the second skill took 19 runs over four Feed sessions; then one 10-minute session over five stockpiles paid 3,802 and bought five skills in six minutes (a run cost about 140 at skill 2 and 280 at skill 6). Picked: **cheaper early sprints** and **steeper sprint prices**. Built: a full sprint is 15 research (`RING_SPRINT_RP`, was 35) until Pattern Matching, then 1.6 times more for each skill learned (`RING_SPRINT_GROWTH`: 15, 24, 39, 62, 99 ...), replacing the old game's half steps under the ring. The Feed's pay is untouched. The numbers 15 and 1.6 are mine and unplayed; past act one 1.6 a skill gets steep (about 1,000 a sprint at skill 10) and will want a look. Also from the log, not acted on: compute short at sector 8 (a run 7,517 against 11.4 a second), no cards bought after the 17th, sector 3's stockpile losing packets, unrounded boss health on the end card and fight bar, the orb over The Feed's header, Signal in The Feed's status bar, old names (server_room, Training Cluster), the save growing to 120 KB during a Feed session, the stale build label.

- **Compute later on, from the same log (2026-11-14, the owner's picks on two cards).** The log: a sector-8 run cost 7,517 compute against 11.4 a second (11 minutes of income), the last run was 3 seconds for 806 and caught nothing, and no card was bought after the 17th (the 18th: $444, 2.5 hours to pay back). Picked: **a run's price grows 1.35 times a sector** (was 1.6; `RING_CLOCK_GROWTH`, and `tools/ring-model.js` `qGrow`): 20 seconds costs 200, 365, 665, 1,635 and 13,357 on sectors 1, 3, 5, 8 and 15. And **both** income changes: **cards cost 15% more each** (was 25%; `RING_CARD_GROWTH`), and **a bigger machine in Parcel** once ten cards are bought: the old game's Server Cluster (`server`) under the ring, shown as **Mining Rig**, $250 and 25% more each, 5 compute a second, room as for cards (`RING_RIG`, `RING_RIG_PRICE`, `RING_RIG_GROWTH`, `RING_RIG_CPS`, `RING_RIG_CARDS`). Its name, line, picture and numbers are placeholders of mine. Money spent is worked out from what is owned, so **a save that already holds cards gets the difference back in the bank** (the owner's 17 cards: about $1,080). Checked in a test browser: not on sale at nine cards, on sale at ten, bought, +5 a second. Unplayed.

## 2026-11-15: the playground link is the ring with everything open

The owner's call: the plain game can probably be archived, and `#playground` should be the new version with everything
open at the start, for testing. Built: `#playground` turns the ring on and, once per save, signs in as a tester, marks the
opening read and the offer taken, buys the desk and the server, installs Parcel, Packet Snare, The Feed and Training,
fills three stockpiles and gives 2,000 compute, 500 research and $500 (amounts are placeholders of mine). No boss waits
on a Training skill there. It has its own save and playtest log, so a `#ring` game is never touched.

Not done, waiting on the owner: archiving the plain game (what the link with no hash should open). The money story
still plays in the playground, so Mom's call is the first thing on screen.

## 2026-11-15: three links (playtest, playground, dev)

The owner's call: one link to share that always holds the latest playtest and never carries anything over from an
older build, a playground, and a version for dev work.

- **Plain link: the playtest.** The ring. Its save and playtest log are kept per playtest number (`E.PLAYTEST_BUILD`,
  now 1), so when the number goes up a returning player starts a new game. The save before the current one is kept on
  the device; older ones are removed. The log's build line reads "Playtest n". The number goes up only when the owner
  publishes a new playtest.
- **`#playground`:** the ring with everything open, on its own save.
- **`#ring` (or `#dev`): dev work.** The ring on the save it always had; never started over.
- **The old game:** archived, no link of its own (the owner's call, later that day): any other address opens the
  playtest. Only the old test doors (`#bays`, `#snare`, `#debug`, `#evals`, `#feed`) still open it, on the dev save.

Not done: there is no public address yet (the Tailscale address only reaches the owner's devices; GitHub Pages is not
turned on). The old Packet Snare review tools (`tools/review/kit.js`, `report.js`, `layout.js`, `coaches.js`) still
load the plain link, which is now the ring; they need one of the old test doors before they are used again.

## 2026-11-15: the owner's notes on the playtest of that morning (18, none built yet)

Log: the pasted export of 2026-11-15T13:25 (the last hour is the playthrough on the new card and run prices).
Found in it: going deeper into the gated boss sector skips the 30% armour (`bossArmor` is not in packet-snare.js
`SECTOR_KEYS`), so the boss fell with no skill learned and Training never opened; the Mining Rig was never bought
(cards 11 to 17 were, up to $94); the stockpile overflowed five times (303 packets lost).

The owner's notes, as given:

1. Connect the AI's lines more clearly to the orb (glowing, pulsing).
2. The orb glows when computing. Plan for the Lab to be where the AI "lives" and grows, from plain layout and buttons
   today to more unique ones with progression.
3. The first AI lines move on too quickly while computing; give more time to read them.
4. The AI announces that it will download; a little more space between reaching the home screen, the announcement,
   and the loading starting.
5. AI messages start at the top but move by context, for example next to a newly introduced app.
6. Introduce Parcel at 100 so the player can at least buy a tower; mention the cracked screen and that they deserve to
   splurge on the extras. Then send them back to the Lab and point out the AI put Parcel on the taskbar, alongside
   introductions of the other apps there (Settings, Home, Playtest).
7. "Fix the screen", not "fix the monitor".
8. A Data Stream introduction.
9. Explain Packet Snare's level selection: why stay on a level or move on.
10. AI help: select the orb, then a button for a tutorial, a walkthrough or a funny comment about an item.
11. Let players pin the taskbar and expand the apps for quick navigation.
12. Review mite speed and progression.
13. Start with some sand already poured.
14. After feeding, a tip on how to continue.
15. "Graphics card ×5 delivered" instead of "Parcel" (exact wording open).
16. Parcel integrated into the AI's interface, as a quality-of-life gift from the AI.
17. A way to see stockpiles in Packet Snare after feeding.
18. A Training landscape intro.

## 2026-11-15: batch 1 of the owner's notes (the AI's voice and the orb; notes 1 to 5, and the boss bug)

- **The boss gate when going deeper** (the bug in that morning's log): `bossArmor` is now one of the options a deeper
  sector brings (`SECTOR_KEYS`), so the gated boss keeps its 30% armour however the run reaches it. Tested.
- **Note 1, the line is the orb's:** a glowing thread runs from the orb to the line it is saying with a pulse
  travelling along it (`assistThreadTick`, `.assist-thread`), the line's edge pulses in time with the orb, and the orb
  is ringed while it speaks.
- **Note 2, the orb glows as you compute:** a flare on every tap of Generate Compute (`orbCompute`). The second half
  (the Lab as where the AI lives and grows) is written into design/ring.md as a plan; nothing built.
- **Note 3, time to read:** doing what a line asks puts it away only once it has been up 4 s, longer for a longer
  line (50 ms a character; `assistHold`). The "This one." lines that point at an app still go when the app opens.
- **Note 4, the download:** two seconds on the home screen, then the AI says it is downloading (`download`, a
  PLACEHOLDER line), then two seconds later the Lab's icon and the Download window appear and the loading starts
  (`HOME_ANNOUNCE_MS`, `HOME_LOAD_GAP_MS`). The orb is on screen from that first line.
- **Note 5, where lines sit:** at the top as before; on the home screen a line that points at an app sits beside that
  app (`assistPlace`, under it, or over it with no room).
- **Note 7, "fix the screen":** no "fix the monitor" is in the game today, so there was nothing to change; the
  wording goes into the Parcel line of note 6 (batch 2).

All numbers (4 s, 50 ms a character, 2 s and 2 s) are placeholders of mine.

## 2026-11-15: batch 2 of the owner's notes (Parcel and the dock; notes 6, 7, 11, 15, 16) and two answers

- **Note 6, Parcel at 100:** `RING_CALL_CP` is 100 (was 25): Parcel arrives when there is enough compute to sell for
  the $10 tower. The AI's line names the tower, the screen ("fix the screen", note 7) and the extras. When the tower is
  delivered it asks you back to the Lab (`back`), and there it opens the dock and introduces it: Parcel, which it
  put there (`dock1`), then Home, Settings, Playtest, the pin and the arrow (`dock2`). The dock stays open while it
  talks about it (`desk.dockHeld`). All four lines are PLACEHOLDERS.
- **Note 11, pin and expand:** the dock has a pin (it stays open) and an arrow (a second row with the apps you have:
  Mail, Lab, Packet Snare, The Feed, Training; the one you are in is lit). Both kept per device (`agiDockPin`,
  `agiDockApps`); logged as `dock`.
- **Note 15, deliveries:** one notice for a run of deliveries, named and counted: "Graphics Card ×5 delivered", with
  "Installed." under it.
- **Note 16, Parcel in the AI's interface:** a first step only: the orb's panel has an Open Parcel button, and the
  dock's introduction says the AI put Parcel there. What more "integrated" should mean is the owner's to say.
- **The owner's answers:** "Data Stream" (note 8) is Packet Snare's field, as the landscape is Training's: the thematic
  picture of why the minigame exists. Notes 8 and 18 are a pair, for batch 4. **The playground is free to do
  everything**: no money story (`fundStep` null there), no lines from the AI, and $10,000, 100,000 compute and
  10,000 research on top (amounts mine).

## 2026-11-15: the owner's calls on twelve phone screenshots of batches 1 and 2

Asked as cards, one per problem seen; built as answered.

- **The orb looks like a glass lens** (the owner pointed at the iPhone's magnifier that appeared over it): dark glass,
  a highlight across the top, a light inside. It never changes size; only its glow pulses (stronger while it speaks,
  a flare as compute lands).
- **Where the orb is** (`assistMode`): it **floats on the home screen** (dragged anywhere, as before); **the Lab is its
  home**: the orb sits at the top of the Lab with its lines under it (`.ai-home`), then the Compute counter and the
  Compute button, all in one centred column on a phone and a laptop alike; **in a session** (Packet Snare, The Feed,
  Training, Parcel) it sits small in the status bar beside the clock. (The owner: it could also go on the dock if
  needed; not done.)
- **Its arrival:** a second after you reach the home screen with the offer taken, the screen flickers, and then the
  orb is there with its first line (`ai-arriving`, `HOME_FLICKER_MS`).
- **The thread on the home screen** goes from the orb to the app's ring, and from the ring on to the line; an app's
  name wraps inside its icon so the ring goes round all of it.
- **Tap numbers fly to the orb** (`orbGain`), exact (+1.25, not +1.3), and the orb flares as each lands.
- **Lines:** the Parcel line is two (`money`, which goes on its own, then `money2` with Show me), in plainer
  sentences; holding the button is one of the Lab's first lines (`hold`, after about twelve taps), and the old tip
  card at the monitor is gone under the ring. PLACEHOLDERS.
- **The dock:** its handle is a short pale bar (the green dot looked like the orb). Pinned, the handle goes and a
  bar mark on the dock, where the pin was, unpins it. A pinned dock is given room: pages end above it and a game's
  field is shortened so its cards and buttons are clear (`desk.dockFit`, `--dock-room`).
- **Achievement banners** stay as they are (the owner's call).

## 2026-11-15: batch 3 of the owner's notes (The Feed; notes 12, 13, 14, 17)

Asked as cards first.

- **Note 13, sand at the start** (the owner's pick: enough for the first split): a session opens with the first
  split's worth of sand already settled in a heap (`prePour` 1 in feed.js, `prePour()`: that many packets leave the
  stockpile through the spout and settle before anyone eats, with no time passing for the hunger bar). The rest pours
  as before. A stockpile smaller than that is all there.
- **Note 14, after feeding** (the owner's pick: an AI line and a button): the result has one button for the next
  step, "Spend it in Training" when a sprint can be paid for, else "Catch more in Packet Snare"; the AI says what
  research is for the first time a session ends, in two versions (`fed` before Training, `fedTrain` after).
  PLACEHOLDER lines.
- **Note 17, stockpiles in Packet Snare** (the owner's pick: on the cards and the picker): the start and end cards
  show the chosen sector's stockpile as a bar ("Stockpile 150/450", amber and "full" when full), and each sector in
  the Start at list says its fill.
- **Note 12, mite speed and progression: not changed.** The owner's answer: mites move too fast, early splits come
  too quickly, the late game stalls, "and I need to look at the camera to dial in what I want". So the Feed's test
  panel has **dials** (in the playground, and with `#debug` or `#feedtest`): mite speed, eating speed, the first
  split's size, how much bigger each split is, the hunger bar, the closest the view comes, and how fast the view
  catches up. They set the game's own numbers live, are kept per device, and print one line of values to read back.
  The owner finds the values; then they go into feed.js.

Also asked for: the music work on `claude/audio-overhaul`. Not merged: that worktree had uncommitted edits to
sfx.js and music/soft.js made minutes before (another agent still working). Its committed work would merge with one
conflict, in engine.js.

## 2026-11-15: the desktop log of 10:08 (playtests/inbox/20261115-100800, 13 snapshots) and batch 4 (notes 8, 9, 10, 18)

Nine minutes on the plain link at 3072 × 1503, as far as M0M's call. Each thing seen in the snapshots was put to the
owner as a card; built as answered.

From the snapshots:
- **Banners** (achievements, deliveries, snapshots) drop in at the top right on a wide screen; they covered the orb at
  the top of the Lab. On a phone the Lab's orb sits lower instead.
- **A line said in Parcel** sits in a strip at the foot of Parcel's window with a small orb of its own, no thread
  (it lay over Sell Compute and the tabs).
- **The old minimap** never shows under the ring (the owner: until the warehouse or office).
- **Pinning the dock** no longer shifts the page or adds a scrollbar: room is left only where something would be
  under the dock (`desk.dockFit` measures it).
- **The dock's lines** are said in an app; go to the home screen with one up and it waits (one showed there, over the
  home dock).
- **M0M's call** fills the screen on a zoomed page (its middle was off to the right and Decline was off the foot:
  100vw of a page drawn at `--zoom`).
- **Parcel sells and buys in one tap** when your compute covers the gap: "Sell 100 compute and buy" (it said "Need $10
  more" to someone holding 141 compute).
- Not changed: the gap under the Lab's orb (the owner's snapshots there were about the page shifting, now fixed).

Batch 4:
- **Notes 8 and 18, the data stream and the landscape** (the owner's pick: the AI narrates over the field): the first
  time Packet Snare opens, the field is shown on its own while the AI says two lines (`stream1`, `stream2`), then the
  first card; the first time Training opens it says two over the landscape (`land1`, `land2`). PLACEHOLDERS.
- **Note 9, the level choice** (the owner: the AI only; the upgrades screen needs the choice too; and it should
  stick): the AI explains Start at once (`pick`); the choice is kept after a replay clears, and across loads on that
  device (`snarePickKeep`); the upgrades screen has the same picker beside Start run.
- **Note 10, AI help** (the owner's pick: point at it): the orb's panel has "What is this?"; the next tap anywhere is
  the question, and the AI says a line about what is under it, ringed (`ASSIST_HELP`, 35 things, lines `help:*`,
  all PLACEHOLDERS, some meant to be funny). It has no line for the status bar's numbers, and offers no walkthroughs yet.

After the above: the stream's and the landscape's lines are said only in their own app (they queued and came up over
The Feed; the navigation check caught it), and **The Feed opens zoomed out** on the whole width of the box (the
owner's ask, 2026-11-15; `dial.minCols` 256, was 80; the Closest view dial still sets it).

## 2026-11-15: The Feed's pace (note 12; the owner: "you set what you recommend")

The owner's complaints: mites move too fast, the early splits come too quickly, the late game stalls. Measured with
the pace test's bot (it leads the swarm to the lowest sand and takes the first card), three seeds each:

| | first pile, 65 packets | three piles, 390 | a big haul, 1,300 (seconds between splits) |
|---|---|---|---|
| before: 15 packets, ×1.5, mites 360 | 2 splits, 9 s, 24 research | 6 splits, 48 s, 226 | 4 3 3 3 4 8 17 31 52 · 141 s · 1,089 research |
| now: 30 packets, ×1.2, mites 240 | 2 splits, 19 s, 24 research | 6 splits, 55 s, 237 | 7 3 5 3 3 3 17 12 16 29 41 · 145 s · 1,073 research |

Set: `layerFirst` 30 (was 15), `layerGrow` 1.2 (was 1.5), `speed` 240 (was 360). The first split takes about twice as
long, the last gaps are shorter, and a session's length and research are about what they were. Mite speed alone moves
the pace by a few seconds; it is for following them. A person plays two or three times slower than the bot, so read
the gaps as ratios. Still a run of quick splits in the middle (3 to 5 s for the bot), because each split adds a mite
while a layer grows only a fifth: `miteEvery` would be the next lever. All numbers mine, to be played; the dials
(now kept as `agiFeedDials2`, so an earlier trial does not hide these) still change them live.

## 2026-11-15: the logs and snapshot of late morning (inbox: 20261115-113840, -085018, -113759; snap-04387 in -100800)

- **Snapshot, 11:21, desktop, Parcel over Packet Snare:** the Mining Rig's card was squeezed to a word a line and
  five times its height by the new "Sell 2.03K compute and buy" button. Fixed: that button gets a row of its own under
  the part. The same picture shows 39,230 compute banked against 23 research, with 15 cards and one rig.
- **Playground on the iPhone, 19 minutes (before the pace change):** nine minutes on the home screen trying the music
  (the Soft track, at full volume), then two Feed sessions. On sector 1 the splits came 8, 12 and 9 s apart. On a
  sector-4 pile with garbled sand the first split took 49 s and the second 66, then 25 to 38 s each: ten splits, 311 s,
  500 research. Packet Snare and Training were not opened.
- **The pace change and deep sectors (not acted on):** the first split is now twice the size (30 packets), so on a
  deep, tough pile it will take about twice as long as the 49 s above. Later splits there are smaller than they were
  from the fifth on. Whether a long first split on tough sand is right is the owner's to say.
- The phone playtest log (-085018) is the morning's session again with a declined call and a start-over added; the
  two short ones are a 40-second look and another agent's test of the old game.

## 2026-11-15: the orb's third look, its glow from compute, elbowed lines (the owner's call, with reference pictures)

- **The orb is a dark glass sphere with a ribbon of light across its middle** (`ORB_FACE` in game.js, an inline SVG
  in the orb's mark, `.orb-face`): two waves drifting at different speeds, a white core with the theme's colour round
  it and a faint blue and pink fringe. It is the game's own orb in that style, in the theme's colour.
- **Its glow follows compute, with no flash:** a soft halo behind it (`.assist-dot::before`) whose strength is
  `--orb-power`, 0.12 on a new game rising with the log of the run's compute to 1 at about 3M (set in
  `assistDotTick`). While compute is coming in (class `making`, for 1.6 s after the last gain) the halo breathes
  on a 2.8 s cycle; while a line is up, 1.5 s. A tap brightens the sphere a little for a third of a second
  (`swell`). The orb never changes size. The 0-to-100 flare (`computing`, `orb-flare`) is no longer used.
- **Lines turn in soft corners:** the two rotated bars are replaced by one SVG overlay (`.assist-wire`,
  `assistThreadTick`): straight when the orb and its target line up, else out sideways and round one 18 px corner;
  from an app's ring to the line, two corners. A white pulse travels along it.
- Not seen on a real iPhone yet (the ribbon uses SVG blur filters; checked in Chromium only).

## 2026-11-15: Parcel's Installed fold; the Feed's width (the owner's cards)

- **Parcel:** delivered parts fold under one "Installed · n parts" row at the foot of the list (`.shop-installed`,
  a details element; open or shut is remembered while Parcel is loaded), so what can still be bought stays on top.
- **The small orb in the status bar** keeps its halo close (it sat over the numbers beside it).
- **The compute pile** (39K compute against 23 research): left until the Lab rework. **Deep sand's first split:**
  waiting on the owner's play notes.
- **The Feed on wide screens, picked "wider field", not built:** the box is 256 cells wide in the rules and the
  screen already shows all of it; the empty space is outside the walls. A wider box alone would not spread the sand,
  because the heap's shape comes from the single spout in the middle, not from the walls. Spreading it needs a change
  to how sand pours (a spout that sweeps, or several), which changes the rules, the save's box and the pace: back to
  the owner as a question.
- Seen in passing: the Server's card in Parcel still says "Opens the Training Cluster" (the app is named Training).

## 2026-11-15: the AI says hello and asks you into the Lab (the owner's call on two phone screenshots)

- It had no introduction and never asked to meet in the Lab. Now, on the home screen: the flicker, **`hello`** (a
  short hello, five seconds), then `download` as before, and once the Lab is installed **`meet`**, which rings the
  Lab's icon until it is opened. The longer introduction stays the Lab's (`lab1`).
- Both lines are placeholders. `lab1` still opens "Hello. I am new here.", which now repeats the hello: the owner's
  to rewrite as the longer introduction.

## 2026-11-15: back to the Lab, and Parcel without Sell buttons (the owner's calls on a phone screenshot)

- **The "back to the Lab" line has a button that opens the Lab** (`back`, "Back to the Lab"). This is the one line
  whose button opens an app; the others still take you home and ring the icon (the call of 2026-11-14 stands for them).
- **Parcel's Sell 100 / Sell half / Sell all buttons are gone.** The box keeps its one line ("You have n compute.
  Parcel pays $1 for every 10."); a part's own button sells what it needs ("Sell 100 compute and buy"). So compute is
  only ever sold to buy something, and the bank holds money only from the story's offers and change.

## 2026-11-15: the orb after the owner's picture; "Training Landscape" on the Server's card

- **The orb is redrawn from the owner's picture** (`ORB_FACE`, `.orb-face`): a teal glass sphere with a bright
  rim, five fine contour lines flowing across it (still: only the core and halo move) and winding into a small amber core, off
  centre to the right. Drawn in SVG in the theme's colours (`--success`, the core `--warning`), not the picture
  itself, so it follows the theme and stays sharp at 28, 46 and 76 px. The core's glow and the halo behind the orb
  grow with compute (`--orb-power`) and breathe while compute comes in, as before. No blur filters any more.
- **The Server's card in Parcel reads "Opens the Training Landscape"** (the owner's wording). The app's own name on
  the home screen is still "Training".

## 2026-11-15: the orb talking (the owner's second picture)

- While a line is up (`.assist-dot.speaking`) the orb is the picture's "talking and glowing" version: the rim and
  the contour lines brighten with a glow, the innermost loop fades out, three amber rings ripple out from the core
  (2.1 s, staggered), and the core swells. It eases back when the line is put away. Under reduced motion the rings
  stand still.

## 2026-11-15: the orb grown strong (the owner's third picture)

- The orb changes form as it gains strength. `--orb-strong` (CSS, from `--orb-power`) is 0 until about 10K of a
  run's compute and reaches 1 at about 2M; across that stretch the calm contour lines fade into **three ribbons of
  lines sweeping round the core** (turning very slowly), each pinched at an amber node, the **core grows to five
  times its size and moves to the centre** with a ring round it, the rim glows more, and **broken teal and amber arcs
  appear outside the sphere** (`.orb-arcs`, not on the small status-bar orb). The talking state works on both forms.
- **What "strength" is measured by is a placeholder:** the run's compute, because that is what the glow already
  followed. The thresholds (10K to 2M) are mine; whether strength should be compute, skills learned, or story beats
  is the owner's to say.

## 2026-11-15: the AI's four forms (the owner's pictures)

- The orb has **four forms**, a class on it (`form-1` to `form-4`, all drawn in the one SVG, cross-fading):
  1. the calm sphere (contour lines, small core); 2. the strong sphere (large core, three ribbons, arcs outside);
  3. **unbound**: no sphere, three ribbons streaming out from three amber nodes round a flame of a core, swaying;
  4. **final**: a symmetrical knot of translucent bands in a diamond with an amber four-pointed star, breathing.
  The talking state (rings from the core) and the halo work on all four.
- The form is now a step, not a slide (`--orb-strong` is 0 or 1 by class).
- **PLACEHOLDER: what moves it from form to form.** `ORB_FORMS` in game.js: the run's compute at 10K, 10M and 10B.
  What strength is measured by is the owner's to say (asked; open).
- **Playground preview:** the assistant's sheet (tap the orb) has "Orb form: … (tap to change)", stepping through
  1 to 4 and back to "by compute". Playground only.

## 2026-11-15: the orb is the owner's pictures themselves (the owner: the drawn forms didn't look right)

- My SVG redrawings of the forms are gone. The orb's face is now the owner's five pictures: the originals are kept in
  `design/orb/` (calm, talking, strong, unbound, final), and `node tools/orb-art.js` makes the game's art from them
  (`art/orb-*.webp`, 512 px, about 850 KB together): cropped square about the subject, the dark ground turned into
  transparency so the glow and the loose ribbons sit on the game's own background, the inside of a sphere kept solid.
- Forms as before (`form-1` to `form-4`, cross-fading); talking shows the talking picture on the calm form and a
  brightening pulse on the others; making compute is a slow, slight breath of light; the unbound form sways a few
  degrees and the final form breathes. The halo behind is much quieter, since the art has its own glow.
- **Not following the theme:** the art is teal and amber in every theme (the drawn orb took the theme's colours).
- **The review artifact's file list (`tools/review/artifact-files.js`) is text only** and does not carry `art/`; a
  published artifact would show no orb until that is extended. The play server serves it (`.webp` added to serve.js).
- Still a placeholder: what moves the AI from form to form (`ORB_FORMS`, the run's compute at 10K, 10M, 10B).

## 2026-11-15: the AI's forms change at story beats (the owner's call)

- Asked what moves the AI from form to form, the owner chose **story beats**, and said which beats can wait until the
  rebuild plan is finished. So the compute stand-in is gone: **the AI stays in its first form in play** until the
  beats are set. The glow still follows compute. The playground's sheet steps through forms 1 to 4 to look at them.
- **Open, for after the rebuild plan:** the three beats (my suggestions were the first boss falling, sector 9's
  boss, and General AI at the ending).

## 2026-11-15: from the owner's 3 PM snapshots (two fixes, one not reproduced)

- **Two Upgrades buttons in Training:** Packet Snare's bar button was only put away while its own bay was open; on the
  device an app opens straight from another, so it stayed. `render()` now hides it outside the bay. Replayed from the
  owner's saved state: one button.
- **The AI's line over the app names:** pointing at an app in the home column, the line ran along the top and down
  through Parcel, Packet Snare and The Feed's names. A target further to the side than up or down is now reached down
  first, then across into its side (`toBox` in `assistThreadTick`). Not seen in a browser yet.
- **Not reproduced:** the Training field only about 180 px tall on the owner's 3072 px screen, cutting the Skill
  learned card off. The same saved state gives a 526 px field here, after a window resize and after leaving Packet
  Snare mid-run too.

## 2026-11-15: every snapshot from the day, gone through (17 pictures)

- **Fixed since they were taken:** the Sell buttons, the old orb and its straight line, "Back to the Lab" with no
  button, the long Parcel list, the Mining Rig card's text in a one-word column (11:21), two Upgrades buttons in
  Training, the line over the app names.
- **Seen in the pictures, not rechecked on today's build, the owner's to call:** achievement and delivery toasts land
  on the orb in the Lab (10:10, 10:14); the dock line's bubble covers the dock it describes (10:12); a click's "+2"
  floats over the AI's words (10:14); the assistant's sheet has "Open Parcel" (against "the AI's buttons never open an
  app"); in Parcel the Graphics Card and Mining Rig cards are laid out differently.
- **In the pictures, not reproduced from the same saved state (also at 1.25 display scaling):** from 10:13 on the page
  has its own scrollbar; the old minimap shows in the Lab as the monitor arrives (10:14); the call's words sit far
  right with no button showing (10:16); the Training field is about 180 px tall (15:08). All four look like a layout
  made for another window size; that session's window was 798x730, then 3072x1559, then 1920x911.

- **Rule dropped (the owner, 2026-11-15):** "the AI's buttons never open an app" no longer holds. "Open Parcel" in
  the assistant's sheet stays, and a line's button may open an app where that reads better. Nothing else changed.

## 2026-11-15: Build 3, first piece: Evals is an app (the owner's four cards)

- **Opens when the first Packet Snare boss falls** (engine.js `evalsOpen`: a boss beaten, under the ring). The AI says
  one line once the run is over (`evals`, with Show me; `evalsHome` on the home screen), and the icon loads in on the
  home screen with a NEW tag, like the other apps; it is on the dock's app row too. No mail (that waits for the story
  build). A save that had already beaten a boss gets the line and the icon the next time the home screen shows.
- **Bosses open the kinds** (`evalsSteps`, passed to evals.js as `steps`): one step of the ladder for each different
  boss beaten (three kinds at the first boss; a replayed boss opens nothing), and handing a kind over opens no kinds
  under the ring. The old game and `#evals` keep the handover rule. The playground has every kind.
- **Pays Marks only**, as it did; funding rounds come with their own piece. Marks and the seven upgrades are untouched.
- Evals' own screen and cards are unchanged, so **its words are still the old game's** ("Verification required",
  "Prove you are human"), it has no status bar, and the AI's orb does not show over it. The two new AI lines are
  placeholders of mine, in `design/assistant-lines.md`.
- With one boss beaten, once all three kinds are handed over a run ends "Verified automatically… nothing left here
  for you to prove"; nothing there says the next boss opens more. To be worded.
- Checked in a test browser: the line and the icon on the owner's 3 PM save (one boss beaten), the app opening on a
  laptop and on a phone in the playground (14 kinds there, 3 on the save). A captcha run was not played through.
  `tests/ring-evals.test.js`.

## 2026-11-15: Build 3, second piece: funding rounds (the owner's three cards)

- **A rival passed on Evals' score sheet is a funding round, and a round is room** (engine.js `fundingRounds`,
  `ringRoom`, `capacity`): `RING_ROOM` 20 Graphics Cards and 20 Mining Rigs to start, `RING_ROOM_ROUND` 10 more of each
  a round (eight rivals: 100). **Skills give no room under the ring** (they gave 10 a skill step). No money: a round
  is an event. Hardware a save already owns past its room is kept; it just cannot buy more.
- **Shown** on the run's end card ("Funding round 1: room for 10 more Graphics Cards and Mining Rigs in Parcel (30 of
  each)."), as a notice from the top that opens Parcel, and by the AI once (`funding`, a placeholder of mine). Parcel's
  cards read "you own 22 · room for 32" (the free cards counted in both) and, full, "Full. A funding round in Evals
  makes room" once Evals is open.
- Debug: `AGI.debug.fundRound()` passes the next rival without playing. Logged as `funding` (round, room).
- Checked in a test browser on the owner's save with 20 cards: full before, a round, the notice, the AI's line, room
  for 32 after. **The end card's line was not seen** (no Evals run was played to a rival). **How long the first rival
  (Parrot-7B, score 12) takes to pass is not measured**; the plan wants the first round within a few minutes of the
  first boss. `tests/ring-evals.test.js`.

## 2026-11-15: Build 3, third piece: agents and the roster (the owner's four cards)

- **One agent for each different boss beaten** (engine.js `agentCount`, `bossesBeaten`; a replayed boss gives none).
  **Moving one is instant** for now (`assignAgent`). A place must be open to take one. Two in a place: the second adds
  half (`AGENT_STACK`). Save v44 (`state.agents`: where each works, the Lab agent's fund, the Feed agent's job).
- **The roster is a panel in the Lab** (`#rosterPanel`, game.js `renderRoster`): a row an agent, buttons Idle, Lab,
  The Feed, Training, and a line saying what it is doing. The AI says one line with the first agent (`agent`, with
  Open the Lab).
- **Three jobs** (the owner's pick; Packet Snare's waits for tears, Evals' comes next). ALL NUMBERS ARE MINE, UNPLAYED:
  - **Lab:** sets aside 30% of the compute coming in (`AGENT_LAB_SHARE`; 45% with two, never over 90%) and buys the
    Graphics Card or Mining Rig with the most compute a second for its price whenever that covers it, at Parcel's
    rate of ten compute a dollar. With no room it saves nothing. Moved away, what it had saved comes back.
  - **The Feed:** while you are not in a session it works the fullest stockpile down, a packet a second
    (`AGENT_FEED_RATE`), paying 0.15 research a packet on sector 1 and half as much again a sector deeper, gold three
    times, garbled nothing (`AGENT_FEED_PAY`: about half of a hand session's 0.31 a packet measured on sector 1). A
    notice says what a finished stockpile paid. **It is worked out, not played: no mites, no box, no cards.** The
    owner picked "runs sessions for you, slower"; this is the cheap reading of that and is theirs to accept or not.
  - **Training:** cleared hills train twice as fast on their own (`AGENT_TRAIN_XP`; 2.5 times with two).
- Not done: the Packet Snare and Evals jobs; the plan's "an agent never sets your records" (none of these can); the
  minute to move; "no obvious best home" is unmeasured. The old game's scheduled tasks are untouched (hidden under the
  ring as before). On a phone the Lab with the roster is a little taller than the screen (889 against 844 px).
- Checked in a test browser on the owner's 3 PM save: the AI's line and its button, the panel on a laptop and a phone,
  each assignment and its status line. `tests/ring-agents.test.js` (6).

- **The owner accepted the calculated Feed agent for now** (2026-11-15: "Yes, fine for now"). Playing its sessions out
  with mites stays open for later.
- **Build 3's research trickle is already retired:** `snareRpPerSec` pays nothing under the ring (it has been `!ring`
  since Build 1). So of Build 3's five pieces, only **the first tear** is left, plus the two agent jobs that wait on
  it and on Evals.

## 2026-11-15: Evals "needs a lot of work to match the rest of the game" (the owner)

- The owner's cards: all four parts are off (look and shell, words and the AI's voice, how it plays, rewards and
  upgrades); the framing is **"you teach, the AI is tested"** (backers want benchmarks), not "prove you are human";
  and shell-and-words, a play-through review and a redesign are to go **in parallel**.
- **Shell and words, first step (built):** under the ring Evals' screen carries the device's status bar and the AI's
  orb (as The Feed's does), its start card reads Benchmark ("The backers want numbers. Show the AI how each test is
  done."), its end cards Benchmark over and It passes these alone (which now says the next Packet Snare boss brings
  harder tests). All placeholders of mine. The old game keeps its words. Seen on a phone: the small orb sits over the
  first number in the status bar (it does in the other full-screen apps too).
- **Running:** a play-through review with screenshots (`review-out/evals-review/REVIEW.md`) and a redesign proposal.
  Nothing of how it plays or pays is changed until the owner has seen both.

- **The play-through review is in** (`review-out/evals-review/REVIEW.md`, 204 screenshots, all 14 kinds on laptop and
  phone, no console errors; git-ignored). Its 16 problems, the first ten: the framing is half changed (captcha, "to
  prove", "I'm not a robot" between the new cards); nothing is in the AI's voice; tall cards opened scrolled to the
  foot; the play box took its children's styles; the AI's attempt shows before you answer; the ghost hand lies on the
  buttons and is a mouse arrow on touch; the card's height jumps between kinds (Verify moves 112 px on a phone); the
  combo pill caps at ×2.0 while the end card reports a combo of 55; handing over has no moment under the ring; the
  upgrades are a text list that does not read as rewards. No Evals target is under 40 px and nothing scrolls the page.
- **Fixed from it (plain bugs):** a card opens at its top (its button was focused with a scroll); the play box's class
  is `evals-lay-<layout>` (as `evals-<layout>` it took the styles of the pads, choices, order, grid and tick inside
  it: Play again lay over the entered row, sums sat in half the width), and the score sheet's leaderboard no longer
  takes the ball board's grid. Replayed on a phone, all 14 kinds, no errors.
- Everything else in the review is design and waits on the redesign's direction (`design/evals-redesign.md`).

## 2026-11-15: Evals becomes an obstacle course (the owner: "Scratch what we have")

- The owner's husband's idea, the owner's calls, written in **`design/evals-course.md`**: you build a course, test it,
  hand it to the AI; score for every obstacle cleared and for speed, nothing for a failure; skills give obstacle types
  and abilities; the AI uses both its training and your run, improves in front of you and ends up beating you; three
  phases (side-on track, grid maze, platformer rooms), the trick questions perhaps a fourth; its own currency and tree.
- The captcha redesign proposal and the whack-a-mole sketch are dropped. **Nothing is built or deleted yet:** the
  captcha Evals is still the Evals app, and funding rounds still run on its score sheet.

## 2026-11-15: the obstacle course, a first rough prototype (phase 1, playground only)

- **Where:** the playground's Evals app opens it (`#playground`; game.js `openEvalsApp`, `RING_PLAY`). The playtest
  and `#ring` still open the captcha Evals. Rules `course.js` (pure, `tests/course.test.js`, 9), screen
  `course-ui.js`. **It keeps its own progress on the device (`localStorage['agiCourse']`) and pays nothing into the
  game's save**: its Marks are a number on its own screen. No save version change.
- **What it is:** a track of 8 places. A runner goes along by itself; the one control is the jump (a tap hops, a hold
  then letting go jumps higher; a press in the air is acted on at touchdown). **Build:** tap a place to go round
  what you have: Gap (1 point), Wall (2, needs the charged jump), Spikes (2, two short gaps with a ledge), Booster
  (an ability: faster for a stretch, no points). **Test:** you run it; only a cleared run can be handed over, and
  your time is what the AI is measured against. **Hand over:** the AI gets up to 4 tries shown one after another.
  **Score:** points x 10 Marks x (your time / its time, between a half and double) if it finishes; nothing if not.
- **The AI ("both", the owner's call):** each jump starts from your own jump at that obstacle, moves toward the
  cleanest timing by its mastery, and its hands shake (0.05 s at first, steadier with mastery, halved at an obstacle
  each time it fails there, which is the iterating you watch). Mastery grows with courses run (and a little with
  skills learned). A landing just past an obstacle is "clean" and gives a burst of speed, which is how a practised AI
  ends up faster than you.
- **Measured** (course.js alone, 300 hand-overs each, a careful stand-in for the player): a 2-obstacle course is
  cleared 91% of the time by a new AI, a 4-obstacle one (6 points) 43%, rising to 86% after 5 courses and 99 to 100%
  after 10. **Obstacles are given by skills learned** (Gap from the start, Wall at 1, Spikes at 2, Booster at 3; the
  playground has all four).
- **ALL OF IT IS PLACEHOLDER:** the physics is its own small model, not Training's (training-path.js builds its ground
  from a leg and a seed and could not take a course without surgery); every number; every word; the look.
- **Not built:** cheating and catching it; the tree; exploits; phases 2 and 3; the trick questions; a currency in the
  save; anything in the playtest. Some neighbouring pairs cannot be cleared at all (wall then wall), which the test
  run is there to catch.
- **Checked in a test browser on a phone:** build, a cleared test run, the hand-over and the result (60 Marks for a
  6-point course). **On a laptop my scripted test run fell at the wall**, so the hand-over was not seen there; no
  errors on either. Not played by a person.

## 2026-11-15: the course, past your limit (the owner's cards after playing the prototype)

- The owner: the loop "was great"; the open problem was the time when the player cannot complete the course. Their
  calls are in `design/evals-course.md` (stages by mastery; always one honest try; scored against its own best;
  later you design harder courses, catch cheating, try to keep up, and it builds courses for you).
- **Built (course.js `stage`, `canHandOver`; PLACEHOLDER numbers):** stage 2 from mastery 0.35 (about 3 courses run),
  stage 3 from 0.75 (about 9). From stage 2 a run you fell on can be handed over ("Let the AI try"): it uses your jumps
  up to the fall and its own line after, its hands 2.5 times as unsteady at the jumps you never showed it; at stage 3
  no unsteadier there. A course nobody can do (the search finds no way through and you did not clear it) is refused:
  "I do not think anyone can do this one." With no time of yours, the speed bonus is against its best time on that
  exact course (kept on the device); the first clear there has no bonus either way. The AI says once when a stage is
  reached.
- **A fault in the first prototype, fixed:** the playground has every skill learned, and skills counted toward the
  AI's mastery, so in the playground it began at about 0.8 mastery, already near its best. **The AI the owner played
  was not a beginner.** In the playground only courses run count now, so it starts shaky (a 4-obstacle course about
  4 times in 10) and the early "pull back so it can keep up" part can be felt.
- **Not built of the owner's picks:** harder and longer courses, cheating, racing its ghost, courses it builds for you.
- Checked in a test browser on a phone at 0, 4 and 12 courses run: refused at stage 1, handed over and finished at
  stages 2 and 3, a second hand-over measured against its own best. `tests/course.test.js` (11).

## 2026-11-15: the second kind of course, a maze (a rough prototype, playground only)

- **Where:** in the playground's Evals app a button in the bar switches between **Track** and **Maze** (the last one
  used opens next time). Rules `maze.js` (pure, `tests/maze.test.js`, 7), screen `maze-ui.js`. Its own progress on the
  device (`localStorage['agiMaze']`), nothing paid into the save, as with the track.
- **What it is:** a grid 7 wide and 9 high, seen from above, start bottom left, exit top right. Time goes in ticks of
  0.16 s: hold a direction to walk a cell a tick, let go to stand. **Tiles:** Wall (shapes the way, no points), Trap
  (1 point: live four ticks, safe four, each on its own beat), Patrol (2: walks its row back and forth, a cell every
  two ticks), Key and Door (2 for the door; one of each). **Only what is got past scores, and only with the exit
  reached**, so a hazard off the way is worth nothing. Built by picking a tile and tapping the grid; the hazards keep
  time while you build, so their rhythm can be seen.
- **The same loop as the track:** walk it yourself; hand it over; up to 4 tries shown one after another; Marks for the
  points got past x how its time compares with yours (or with its own best on a maze you could not finish).
- **The AI:** it walks your route. It knows the safe moment to step, stands about where you stood by as much as it
  has not yet mastered, and at a hazard may misjudge the moment (30% of hazard steps at first, less with mastery,
  halved at a step each time it is caught there). The same three stages past your limit as the track: caught part-way,
  it follows you to there and takes the shortest way on.
- **Measured** (maze.js alone, 300 hand-overs each): a maze of four traps is got out of 82% of the time by a new AI in
  about 3 tries, an 8-point maze with two patrols 78%; both 100% after five to ten mazes, and by ten it is faster than
  a careful player nine times in ten.
- **Found while testing:** a patrol's row can be crossed but not walked along (it catches you at its turn), so a way
  that needs that has no way through, and the AI says so.
- **ALL PLACEHOLDER** (numbers, words, look). **Not built:** the third kind (platformer rooms), cheating, the tree,
  anything in the playtest. It chooses no cleverer route than yours when you finished: it only times yours better.
- **Checked in a test browser, phone and laptop:** switching from the track, placing tiles by taps on the grid, a
  walked run (driven by a script holding the directions), the hand-over, the result, switching back; no errors, no
  page scroll, cells 52 px on a phone. Not played by a person.

## 2026-11-15: the third kind of course, a platformer room (a rough prototype, playground only)

- **Where:** the playground's Evals app; the button in the bar now goes round **Track → Maze → Rooms → Track** (the last
  one used opens next time). Rules `rooms.js` (pure, `tests/rooms.test.js`, 7), screen `rooms-ui.js`. Its own progress
  on the device (`localStorage['agiRooms']`), nothing paid into the save. So all three kinds can now be compared.
- **What it is:** a room seen from the side, 12 tiles wide and 7 high, with a floor. You start bottom left; the flag is
  on a ledge at the top right, too high to reach from the floor, so every room needs a way up. Controls: left, right,
  jump (a jump clears two tiles; buttons on a phone, arrow keys and space on a laptop). **Tiles:** Block (the way up,
  no points), Spike (1), Pit (1, in the floor row only), Saw (2, slides back and forth), Spring (an ability: throws you
  nearly five tiles up). A hazard scores when you cross its middle within three tiles of it, and only with the flag
  reached.
- **The same loop:** run it yourself; hand it over; up to 4 tries; Marks for the points got past x how its time
  compares with yours (or its own best on a room you could not finish).
- **The AI:** it is given the tiles you stood on, in order, and gets from each to the next with its own hands. A
  beginner takes off from the wrong spot and aims its landing badly (0.42 tiles off at first), and misjudges a saw's
  moment (35% of the time); both lessen with mastery and halve at a jump each time it fails there. It looks ahead a
  jump before setting off under a saw. Come down on the wrong tile, it works out the way on from there. It stands
  about where you stood, less as it masters rooms, which is how it ends up faster.
- **It can find its own way** (a search over which tile can be reached from which, tried with its own controller), so
  the stages past your limit work here too, and a room with no way up is refused: "I do not think anyone can do this
  one." Where it cannot copy a move of yours it joins your tiles up with moves it can make.
- **Measured** (rooms.js alone): a new AI reaches the flag in a room of two spikes 58% of the time, one with two saws
  70%, one with a spike, a pit and a saw 83%, in three to four tries; all 97 to 100% after three to six rooms, and
  from about five it is faster than a careful player nearly every time.
- **ALL PLACEHOLDER.** Its physics is its own. **Not built:** cheating, the tree, anything in the playtest. A new AI
  fails by "being stuck" (it waits too long for a saw) about as often as by a saw, which reads oddly and wants a look.
- **Checked in a test browser, phone and laptop:** going round the three kinds, placing tiles by taps (a pit off the
  floor is refused with a line), a run (driven by a script pressing the keys), the hand-over and the result; no
  errors, no page scroll, tiles 30 px on a phone. In that check the new AI failed all four tries on both screens.
  **On a phone the room is small** (30 px tiles in a 362 by 211 px view). Not played by a person.

## 2026-11-16: the track and the room are combined (the owner's call)

- The owner: "the track and the platformer don't feel distinct from each other"; asked whether to combine them or
  make them distinct, they chose **combine**, and a **third kind** is to be thought up with them.
- **The room is the side-on course.** In the playground the Evals app opens the room (or the maze, whichever was used
  last) and the bar's button goes Rooms and Maze. **The track is no longer reachable**; `course.js`, `course-ui.js` and
  their tests are still in the repo, untouched, until the third kind is settled. Nothing of the track's (the one
  button, the clean landing's burst of speed, the booster) has been carried into the room yet.

- **The booster carries over into the room** (the owner's pick of the track's three things; the clean-landing burst and
  the one-thumb option are dropped): a pad in a tile above the floor or a block; run over it and you are 1.6 times as
  fast for 1.25 s (`boost`, `boostSteps`; PLACEHOLDER). An ability, no points, given with the spring.
- **The third kind is still open:** the owner said "maybe target range, but let's hear some more".

- **2026-11-16, the owner on the kinds of course:** each should be something "the player can build over time through
  components"; more ideas wanted for the third; and a fourth, **the rhythm run**, is theirs (in `design/evals-course.md`
  with a first sketch of mine and the rules a chart could be measured by). Nothing built. **A risk for the rhythm run:**
  the music engine on this branch is the one from before the audio overhaul (another agent's branch,
  `claude/audio-overhaul`), so a rhythm kind built here would be built on the old engine.

- **2026-11-16: the rhythm run's twelve decisions** are the owner's and are written in `design/evals-course.md` (they
  changed four of my assumptions: the music is built in three steps of freedom, not charted over a finished song; the
  notes go from lanes to the whole field to anywhere; every kind of hit is wanted, chords and a flung hold included;
  and what the game's things mean: the Training ball is the regular note, packets are held notes that move, a combo
  turns everything gold and opens the backing, bad ones garble the sound, a boss is a freestyle). **Built first.**
  **The third kind** is a puck course, mini-golf crossed with target practice. **The audio overhaul is done** and may
  be brought over.

## 2026-11-16: the rhythm run, step 1 (a rough prototype, playground only)

- **Nothing needed bringing over:** the audio overhaul branch (`claude/audio-overhaul`) is already wholly in this
  branch (its tip is an ancestor of this one, its worktree clean), so the finished engine is what the game here plays.
- **Where:** the playground's Evals app; the bar's button goes round **Rooms → Maze → Rhythm → Rooms**. Rules
  `rhythm.js` (pure, `tests/rhythm.test.js`, 6), screen `rhythm-ui.js`. Its own progress on the device
  (`localStorage['agiRhythm']`), nothing paid into the save.
- **What step 1 is** (the owner's calls 5, 6, 8, 9, 10): you pick one of the theme's six songs and how much of it is
  notes (**Kick**, **Kick and bass**, **With the melody**: 24, 47 and 79 notes over 8 bars of Night Survey). **The
  notes are read out of the song's own data** (its kick pattern, its bass pattern, its melody; a melody note four
  steps long or more is a held note), a lane an instrument, thinned so no two in a lane are closer than two steps.
  Regular notes are drawn as **the Training ball**, held notes as **a packet** with a tail. A hit within 0.05 s of the
  beat is perfect, within 0.11 s good. **The meter:** it rises with hits and falls with misses; at a combo of 8 the
  notes and the line **turn gold**; empty, **the song has fallen apart**, the run stops and scores nothing. Tapping
  where there is no note costs a little. Score: hits by how well, plus up to half again for the longest combo.
- **It plays the game's own music.** The run asks the engine for the chosen song a bar before the notes start
  (`SFX.songCmd({ area, song, bar })`, new in sfx.js: this song of this area from this bar on the next downbeat),
  lines the chart up with the engine's clock (`SFX.lab.clock()`, new), and **its meter is the engine's intensity**
  (game.js `musicTick` reads `RhythmUI.music`): a full meter is the whole arrangement, a low one strips it to a kick
  and a bass. A hit plays the engine's click for its lane, which the engine puts on the grid. With the music off or
  not yet allowed by the browser, the run keeps a silent clock of its own and says so.
- **The AI** (call 10): for each note it presses about when you did, as early or late as you were, less so with
  mastery, with shaky hands on top (0.06 s at first) and a 14% chance of missing a note outright; both shrink with
  mastery and halve at a note each time it gets it wrong, so a second try is tighter where the first was loose. Up to
  3 tries. The stages past your limit apply: a track that fell apart on you can be handed over from stage 2.
- **Marks:** 2.5 a note it hit, times how its score compares with yours (or its own best on that track and level).
- **ALL PLACEHOLDER.** **Not in step 1** (the owner's calls 1 to 4, 7, 11): the composing board and arranging; the whole
  field and notes anywhere; slashes, chords, flung holds; packets that move as you hold; bad notes that garble the
  sound; the boss's freestyle; the AI writing tracks.
- **Checked in a test browser, phone and laptop**, with real taps so the music was allowed to start: the engine turned
  to the chosen song on cue, the run used its clock, the meter at full gave full intensity; a scripted player tapping
  30 ms late played 79 of 79; the AI's tries and the result showed; no errors, no page scroll. `tests/audio.test.js`
  still passes (14). **Not checked, and not checkable from here: whether the notes fall in time with what is heard.**
  The picture is lined up with the audio clock less the output delay the browser reports; a real phone, and
  Bluetooth headphones above all, will need a calibration setting. Not played by a person.

## 2026-11-16: two thumbs at most, and a mouse alone (the owner, on a phone screenshot of the rhythm run)

- The owner's first run on a phone fell apart after 6 notes: "With the melody" asked for the kick, the bass and the
  melody at the same moment. Their rule: **"on mobile we are shooting for two thumbs at most, and desktop will need to
  rely on just mouse."** It holds for every kind of course.
- **Rhythm run, built:** a chart is thinned to the hands there are (rhythm.js `playable`, `hands`): on a phone never
  more than two things down at once, a held note counting as one while it is held; at a clash the melody is kept,
  then the kick, then the bass. **With a mouse** it is one thing at a time, notes at least two steps apart, and **a
  click anywhere on the notes goes to whichever note is due** (a mouse cannot aim at a lane in time; the lane pads are
  hidden). The AI plays the same thinned chart. Night Survey with the melody: 79 notes as written, fewer once thinned.
- **Open, the same rule elsewhere:** the room needs left or right held while jump is pressed, which one mouse cannot
  do (it works with two thumbs, and with the keyboard); the maze is one direction at a time and is fine.

- **2026-11-16, the desktop rule revised by the owner:** "Mouse and keyboard is fine ... we can plan for WASD spacebar
  and mouse." So a desktop has two hands as a phone does. **Rhythm run:** charts are the two-thumb ones on every
  device (the one-at-a-time mouse charts are gone; `playable` still takes a hand count); **A, S and D are the lanes**
  (shown under them), and **a click on the notes or the spacebar takes whichever note is due**; the lane pads show on a
  desktop too. **The room** already has A, D, W and the spacebar, and **the maze** W A S D, so both fit the rule as
  they are. The room's question about a mouse alone is closed.

## 2026-11-16: the rhythm run's modes (the owner: "more forgiving", Easy, Medium, Hard instead of the instruments)

- The owner: "we need to be a bit more forgiving and have the modes be easy medium and hard instead of bass kick and
  lead"; "we can mix parts between the instruments to change the difficulty and the extreme version would be everything
  together with a mix of slashing, holds, multiple shots and freestyle; early easy would be mostly notes and freestyles
  with some holds."
- **Four modes** (rhythm.js `MODES`, `chartFor`): **Easy, Medium, Hard, Extreme**. Each bar keeps the song's weightiest
  notes (the beats, the melody) from all three instruments, up to the mode's count and spacing. ALL NUMBERS MINE:
  | Mode | Notes a bar at most | Least gap | Two at once | Held notes kept | Slashes | Freestyle bars | A miss costs |
  |---|---|---|---|---|---|---|---|
  | Easy | 5 | a beat | none | half | none | 2 of 8 | 4.5% of the meter |
  | Medium | 8 | half a beat | about one a bar | all | none | 1 | 6% |
  | Hard | 11 | half a beat | about two a bar | all | a quarter of single notes | 1 | 7.5% |
  | Extreme | all the song has | a quarter beat | any | all | four in ten | 1 | 9% |
  On Night Survey that is 22, 46, 49 and 56 notes; on Overclock 24, 56, 69 and 101.
- **More forgiving:** perfect is within 0.07 s of the beat (was 0.05), good within 0.15 s (0.11); the meter starts at
  60% (50%); a tap where there is no note costs 1.2% (3%); a hold may be let go a quarter of a second early (0.14 s).
- **Slashes** (new): a diamond. On a phone, swipe the lane's pad or the lane itself; on a desktop, **W** or a flick of
  the mouse. Slashed on the beat it is perfect; only tapped, good at best.
- **Freestyle bars** (new; the owner's boss moment, judged "on the beat, and not boring"): a bar with no notes, shown
  as a band. Your taps count when they land near a half-beat, up to eight a bar; taps off the beat cost nothing; a bar
  with at least four taps on two lanes at more than one spacing earns a bonus ("NICE"); a bar left silent is one miss.
  The taps are not yet kept as part of the track (the owner's call 7 asks for that).
- **Two at once** ("multiple shots") were already there. **The AI** slashes or only taps a slash, and plays freestyle
  bars sparsely on one lane at first, fuller and across the lanes with mastery.
- Checked in a test browser on a phone with real touch events on the pads: Easy and Extreme of Night Survey played
  clean (taps, holds, six swiped slashes, freestyle with the bonus), then the AI's tries; no errors.
  `tests/rhythm.test.js` (12). Not heard, and not played by a person.

## 2026-11-16: a first pass at how the three courses look (the owner: "work on the visuals for each eval")

- **Shared (`course-art.js`, new):** the AI's runner is **the orb** (its picture in a glowing ring), yours is **the
  Training ball** (blue, an amber core, squashing and stretching in the room); a burst where a run ends (red for a
  fall, green at the finish); the clock and points in a pill; "try 2 of 4" while the AI plays; glows drawn as faint
  rings, no blur (slow on phones). Colours are the theme's own.
- **The room:** dots at the tile corners; a floor with a lit top edge; raised blocks; three-pronged spikes; pits that
  fade down into red; saws as toothed wheels on a dotted rail; a coiled spring; booster chevrons that run; a waving
  flag with a beacon; a trail behind the runner; speed lines while boosted; the AI's given way as a dotted line.
- **The maze:** a checkered floor; raised walls; traps whose spikes come up when live and **turn amber a tick or two
  before**, so the rhythm can be read; patrols drawn as **Packet Snare's Antivirus** (a red ring with four notches)
  gliding along a dashed row; a bobbing key and a barred door that opens; a pulsing exit; the runner's path behind it.
  **Movement now glides between ticks** (the rules still step; the picture is redrawn every frame).
- **The rhythm run:** a tint for each lane (kick blue, bass violet, melody green) that breathes on the beat; bar lines
  heavier than beats; **a ring to hit in each lane** that flashes with a burst on a hit; notes as the Training ball
  with a streak, held notes as a packet with a thick tail that lights while held, slashes as a red diamond with the
  stroke drawn through it; **the combo large and faint behind the notes**; everything amber at a combo of 8; the
  freestyle bar as a band of moving stripes with a mark for each half-beat and a dot where you tapped; a segmented
  meter, and a red frame when the song is close to falling apart; a count-in over the last three beats.
- **A fault of mine while the owner was playing:** for a few minutes the maze asked for two redraws for every one it
  drew, doubling each frame, which froze the page. Fixed (found by a screenshot timing out).
- Looked at in a test browser on a phone and a laptop (pictures in `review-out/evals-art/`); no errors. Drawing only:
  no rule changed and the tests are untouched. The orb's picture reads dark at the room's small size. All of it is a
  first pass for the owner to react to.

## 2026-11-16: the rhythm run's look, second pass (the owner: "I like the direction")

- **Packets point forward** (the owner: "like you are writing the packet forward instead of it coming towards you"):
  a held note's arrowhead points up the lane, its tail is the dashed path still to write, and while you hold, what has
  been written burns bright behind the head with sparks coming off it; let go at its end and **the finished packet
  flies on up the lane**.
- **Particles and glow:** sparks from every hit (more for a perfect, more the better the run is going), a ring opening
  out from the ring you hit, red shards and a red wash of the lane on a miss, a burst across all lanes for a freestyle
  bonus and at combos of 10, 25, 50, 75 and 100 ("25 in a row"). Particles are drawn additively and capped at 220;
  under reduced motion there are none.
- **The music itself drives the backdrop:** an analyser listens to the engine's music bus (it adds nothing to what is
  heard) and its levels stand as columns behind the lanes, the low end under the kick's lane, the middle under the
  bass, the top under the melody. The lanes, the line, the rings, the notes and the combo breathe on the beat, with a
  wash on each bar. With the music off the columns are simply absent.
- **It follows how the run is going** (`energy`, eased from the meter): streaks run up the lanes, more, faster and
  brighter the fuller the meter; the lane tints deepen; near empty the picture goes dull, the edges close in and a red
  frame pulses; the whole frame flashes red when the song falls apart.
- **Timing, shown:** a strip under the line, the middle the beat and the green band "perfect", with the last hits as
  dots. **While the AI plays, your own spread is a faint bar behind its dots**, so its hands can be seen closing in on
  the beat from where yours were. The orb sits beside the lanes, swelling on its hits and dimming as it loses the song.
- Drawing only (rhythm-ui.js `draw`, `show`); the rules and their tests are untouched. Looked at on a phone and a
  laptop in a test browser with the music running; no errors. Not seen on a real phone, where the particle count and
  the analyser want checking for speed.

## 2026-11-16: The Feed's overhaul (full tanks, corruption, frenzy, caches, bolder cards, the squad, the look)

Built in the cloud while the owner's home internet was out, on `claude/trusting-dijkstra-skhxsb` from `main` at
8e0d67d. The Evals courses work on the owner's PC (rhythm, maze, rooms, course art) was left alone; this touches
`feed.js`, `feed-ui.js`, `engine.js` (the squad's gates, save v44), `game.js` (the squad API, research to the screen,
log fields) and `styles.css`. Asked as cards first; the owner's answers:

- **Excitement:** a feeding frenzy and buried caches (picked); and the owner's own: **garbled sand slowly corrupts the
  sand round it**, which gives different mites a reason, and **you choose which mites to bring**, kinds gated behind
  skills, sectors and bosses, so the agents a boss gives are what clear the later sectors.
- **Cards:** fewer, bolder (picked).
- **Look:** frame the pile, eating feedback, a living tank (all picked); and the owner's own: **the stockpiles are the
  tanks**: a stockpile is how full its sector's tank is, so a session opens full to the brim and the goal is to empty as
  much as you can; the camera starts zoomed out and closes in as the pile is eaten; playing well in Packet Snare means a
  better Feed, playing badly means time in The Feed clearing bad sand.
- **Rules asked:** what you don't eat **stays** in the tank (garbled too); corruption spreads **only in a session**; the
  **hunger bar** still ends one; build it **all at once**.

What was built (numbers mine, to be played; the dials panel still sets the old ones live):
- **Tanks** (`tankRect`, `fillTank`, `boxStock` in feed.js): a session opens on its sector's tank, as many cells as
  the stockpile's cap (`stockMax` 1,600 packets), upright (`tankAspect` 1.6), walled (sand never leaves its columns),
  laid at once in wavy strata (`wave`, `strata`). Ending a session puts what is left back in the stockpile by sort;
  while a session holds a tank, runs only fill the room it has. Eating a tank bare pays `clearPay` 10% of it again.
  `prePour` is no longer used by sessions.
- **Corruption** (`corrupt`): every `corruptEvery` 0.5 s each garbled grain touching good sand may turn one neighbour
  (`corruptChance` 2.5%, gold half that, caches never); about 8% of a dirty tank in 30 idle seconds. Nothing within
  `ward` 22 cells of a scrubber turns.
- **The frenzy** (`heat`): the share of the swarm's full eating it keeps up on good sand (bites on sand that can't pay
  don't count) builds heat over `frenzyFloor` 0.4; four tiers, each +25% research and +10% speed and eating; it cools
  when grazing; garbled sand chewed costs `frenzyBad` 0.6 a packet. Measured: holding a finger on the swarm reaches tier
  4 in every sector; a tapped point reaches tier 3 on clean sand and none on dirty tanks (**watch this in play**).
- **Caches** (kind 7, `crack`): one per 120 packets, deep in the sand, hidden until a lamp finds it; one bite cracks
  the whole knot for `cachePay` 8 packets' worth of research and a free card.
- **Cards:** the first card of every offer is a tool or a combo while one can be offered (a combo 60% of the time when
  one can be made); plain boosts bigger (eat +40%, hunger +35%, legs +35%, pay +30%); four trade-offs: Gluttons,
  High stakes, Brood (two mites now), Adrenaline.
- **The squad** (`MITES`, `setSquad`; engine.js `FEED_MITE_GATES`, all *proposed*): grazer always; **scrubber** once
  sector 2 is open (decodes garbled sand into good sand, wards corruption); **prospector** with Pattern Matching (goes
  for gold, lamp ×2); **driller** with the first boss beaten (its bite takes three: tough deep-sector sand); **chomper**
  with the second boss (two grains a bite). Two slots, three after the first boss. New mites come in the squad's order.
- **Speed:** falling sand looks only at the columns that changed (`DIRTY`): a full tank at rest costs nothing, about
  20× cheaper than before while eaten.
- **The look** (feed-ui.js): the tank as lit glass with a grid, motes, fill marks and a dashed rim, its walls in the
  frenzy's colour; the camera frames the tank and closes in as the sand goes down, following the swarm once narrower
  than the tank; crumbs from eaten sand, numbers rising off the swarm, gold glints, split and cache shockwaves, a flash
  and a small shake at big moments, frenzied mites glowing with trails, the edges burning at tiers 3 and 4, garbled
  sand seething; a frenzy meter (four pips, ×multiplier) under the hunger bar; the squad as a row of drawn tiles on
  the pick screen (`???` for kinds not found); tanks' bars show their garbled share; the result card says how much was
  eaten, what is left (and how much garbled), caches, the frenzy reached and what turned. A **driller** sprite in the
  sheet's style (placeholder). Sounds: the game's own effects by name (a split `claim`, a cache `record`, a tank bare
  `snareBossDown`, each frenzy tier `snareRace` a step up); nothing added to sfx.js.
- **Log:** `feedSession` adds cleared, left, bad, corrupted, caches, frenzy and squad; new `feedCache`,
  `feedTankClear`, `feedSquad`; `feedStart` carries packets and squad.
- **Tests:** `tests/feed-tanks.test.js`; the session tests turn the new effects off to see each old mechanic alone.

Open, for the owner: the squad's gates and slots; whether tapping should build the frenzy on dirty tanks; corruption's
strength; mite and card names and lines (all PLACEHOLDERS).

**After (the owner's calls on a phone screenshot, 2026-11-16):** the test tools fold into one bar button (⚙ on a
phone, Test on a desktop) that drops down over the field; no legend or prompt in a run ("we can have a tutorial if
anything to walk through the game the first time"); on a phone the camera is off to start and the small window first
when switched on (`agiFeedCam2`), a desktop unchanged until the owner has judged it.

**The first-time walkthrough** (the owner's pick, 2026-11-16; feed-ui.js `COACHES`): as Packet Snare's, each step the
first time it comes up in a session, a spotlight, a ghost finger and one line in the terminal voice (PLACEHOLDER words):
**lead** (hold and drag to lead the swarm; the field runs at `COACH_SLOW` 0.2 until your finger is on the sand, done
once they've eaten 12 grains where you led them), then, each shown for a few seconds at full speed: **garbled** sand (it
pays nothing and spreads), the **frenzy** (its meter pulses), **hunger** (below 40%; its bar pulses) and a found
**cache**; the first **cards** carry a line over them. Done once each (`feed:coach:<key>` in `state.intro`), or shown
twice if never done; Reset The Feed shows them again. Logged as `feedCoach`.

**Mites with character** (the owner's pick, 2026-11-16; feed-ui.js `drawMite`'s `st`, `life`, `biteSound`; placeholder
art and sounds, for the owner to judge): each mite looks the way it's heading and squashes as it bites (the grey mound
opens its mouth, the chomper chomps, the star leans and squints); the scrubber's spokes turn, faster while it decodes,
and a dashed ring shows its ward while the tank holds garbled sand; the driller leans into its way and its groove runs
as it bores; the prospector casts a lamp of gold ahead of it and a glint crosses its glasses. Bite sounds by kind, the
game's own effects, at most a few a second: grazers and the prospector on gold, the scrubber on decoding, the driller
(`snareSlash`) and chomper (`snareHit`) on every bite. `FeedUI.drawMiteOn` draws one on any canvas (a review sheet).
Also `FEED.frenzyTap` (1: the rule as it was), for the tuning question on tapping.

**One colour of sand** (the owner's call, 2026-11-16: "the multi color doesn't make as much visual sense now that we
separate by sector"; feed-ui.js `BAND_TONE`): good sand is the packets' colour (`--snare-good`), its layers only a
shade apart; garbled sand keeps the bad packets' colour; **gold shows only near a mite** (in its lamp, a prospector's
twice as far) or under the scanner's beam, and looks like any other sand elsewhere (a drawing rule: the rules' `seen`
is unchanged, so the prospector still remembers what it found); sand the model can't read yet stays grey, sand it has
learned to read is plain sand; a found cache keeps its violet.

**Tuning, the owner's picks on measured options (2026-11-16)** (sessions simulated three ways, holding a finger, tapping
every 2.5 s and grazing, on sectors 1–5, three seeds; research a session, sector 5, two grazers: holding 510, tapping 60):
- **The frenzy's bar lowered for everyone**: `frenzyFloor` 0.4 → 0.3 (tapping on sector 5 measured about 470, holding
  about the same), and only a led swarm heats up: left to graze it cools at the full `frenzyCool` (at 0.3 grazing's
  quarter pace sat just under the bar and barely cooled). `frenzyTap` stays 1 (the "tap counts as a hold" option, not
  picked).
- **Corruption as now** (`corruptChance` 2.5%; measured: no spreading 1,760, 1.5% 1,030, 2.5% 510; with a scrubber 2,190).
- **The scrubber opens with the first boss** (it opened at sector 2 and beat every other mite on dirty sand: grazer +
  scrubber 2,190, + driller 1,020, + prospector 800), so the early dirty tanks are a struggle the boss's reward answers;
  the driller and the third slot come with the same boss.

**The Feed's first log and its pace (2026-11-17)** (`playtests/feed/2026-11-16-owner-feed-1.txt`; the owner: "The pacing
is wildly too fast, I had no sense of what was going on or why"). Measured, a full first tank (450 packets) led well: 36 s,
a split every 3–9 s, a card stop every 3 s with the caches', the frenzy at its top by 28 s. Asked as cards with measured
options; the owner's picks:
- **Pace: the slowest of three, about 1¾ minutes a first tank**: `chew` 1 (4), `layerFirst` 45 (30), `layerGrow` 1.5
  (1.2), `frenzyStep` 8 (4). Measured after: 105 s, four splits 20–26 s apart, the same research (323 against 299); the
  playground's 150-packet tank 44 s.
- **Cards: as now** (a card at every split and every cache, each offer leading with a tool).
- **The first sessions in stages** (feed.js `stageOf`, `state.played`, `session.stage`; `opts.staged` from engine.js
  `feedStart`, not in the playground): session 1 is leading, eating and splits that add mites; session 2 adds the cards;
  session 3 the frenzy and the caches. A session counts once it reached a split. The frenzy meter is hidden before its
  stage; the result card says what the next session adds (PLACEHOLDER words); each thing's walkthrough step comes when
  it does. A save from before that has played sessions is at stage 3.
- **Mine, to keep the balance where it was (for the owner to confirm):** the clocks that race the eating go at a quarter
  too: `hungerTime` 100 (25), `hungerFill` 0.4 (0.6), `corruptEvery` 2 s (0.5). Unscaled, a sector 2 tank ended on hunger
  at 15% eaten. Scaled, against the old pace: holding, sectors 2, 3, 5 eaten 100%, 100%, 49% (100%, 100%, 51%); tapping
  72%, 69%, 68% (100%, 51%, 61%). The tools' timers are unchanged (so each is about four times stronger against a mite).
- **Open:** tougher sand takes as many times longer as it did: a 360-packet sector 2 tank is about 4¼ minutes with a
  split every 80–95 s, and a full 1,600-packet tank about 10 minutes on sector 2 and 20 on sector 5.
- Also: a split pauses a walkthrough step instead of ending it; the dials' kept values moved to `agiFeedDials3` (the old
  pace's would have held), eating's dial goes down to 0.25.

**The Feed agent slowed to match** (the owner's call, 2026-11-17): `AGENT_FEED_RATE` 1 → 0.25 packets a second, a
quarter of a led mite as it was before The Feed's pace was slowed; what a packet pays is unchanged.

**The PC's work, checked against a rebuild of it (2026-11-17).** While the owner's PC was offline its 37 unpushed commits
were rebuilt in the cloud session from the PC session's recorded tool calls (every write, edit and command replayed in
order on a clean checkout of `8e0d67d`) so the test build could carry them. When the PC pushed (`346bc2e`, with The
Feed's overhaul merged in), the rebuild was compared with the PC's own tip (`bfccc14`): **37 commits with the same
messages, and every text file byte for byte the same**; only the pictures differed (the *unbound* orb picture, which the
rebuild stood in for, and two `.webp` files a few bytes apart from a different encoder build). The rebuilt copy is
superseded: this branch's files are now `main`'s (the PC's real history) plus the Feed agent's slowdown, joined by a merge
that takes `main`'s files whole. The rebuilt commits are still in this branch's history (a forced push to drop them was
not allowed here), so **merging this branch into `main` would bring 37 duplicate commits with it: cherry-pick the agent
commit instead, or let the owner allow the forced push.** Both merges had chosen save v45 on their own.

**Rhythm run, step 2: the board (2026-11-17, playground only).** The owner's four calls and what was built are in
`design/evals-course.md` → Step 2. In short: *Your board* on the rhythm run's pick card composes a 4, 8 or 16 bar track
from the picked song's one-bar blocks (beat, bass, chords, melody, a freestyle bar); Listen loops it on the music engine
(`SFX.songCmd({ custom })`, a song played on its own until the area's songs are asked back); the notes are placed by
`chartFor` as before. `tests/rhythm-board.test.js` plays a composed song of every track through the real engine.
Not built: step editing, the unlocks themselves (everything is open), whole-field notes.

**Rhythm run: the whole field (2026-11-17, playground only).** The owner's four calls and what was built are in
`design/evals-course.md` → The whole field. Notes land anywhere across the line by pitch (`fieldFor`), a press takes the
note within reach (`press(hand, t, kind, x)`, `move`), held notes slide and are followed. Lanes are unchanged.
`tests/rhythm-field.test.js`. Also fixed: the AI's replay now slashes where its attempt did (the replay tapped them).

**The puck course, the third kind (2026-11-17, playground only).** The owner's eight calls, what was built and my
choices are in `design/evals-course.md` -> The puck course. In short: targets then the hole, a sling, fewest shots
under a shot limit, free bounces, one screen; walls, bumpers, still and moving targets, sticky and slick ground, a pit,
boosters and portals. `puck.js` decides a whole shot at once and hands the screen its path to play back;
`tests/puck.test.js`. Mine and not on a card: the AI's shot limit on a course you cleared is your shots plus 2.
Not built: longer courses, the unlocks, sound.

**The unlocks, all four kinds (2026-11-17, playground only).** The owner's four calls, the ladders and what was built
are in `design/evals-course.md` -> The unlocks. In short: behind a padlock in each course's bar, off by default;
on, a kind's parts open every 2 clears by the AI in that kind, and the kinds open in the owner's order (Rhythm, Maze,
Puck, Rooms) after 3 clears in the newest. `course-unlocks.js` (rules on top, the browser's part below),
`tests/course-unlocks.test.js`. With the switch on each kind uses a second save (`.u`). All numbers mine.

**The Marks tree (2026-11-17, playground only).** The owner's six calls, the nodes and what was built are in
`design/evals-course.md` -> The Marks tree. In short: one pool of Marks for the four kinds (the old counts added
together), opened from the Marks count in a course's bar; a trunk, a branch a kind, and optional exploits that pay more
and add to a hidden count against the AI (`mis`, read by nothing yet). `course-tree.js` (rules on top, the browser's
part below), `tests/course-tree.test.js`; the maze gained `lives` for Second Life. All names, effects and prices mine.

**The owner's playtest of the playground (2026-11-17) and the courses in the playtest log.** Findings from the owner's
answers are in `playtests/evals/2026-11-17-owner-findings.md` (the log had nothing from Evals: the courses logged
nothing). The owner's order: fix the findings, then the AI cheating round. First fix: the courses now log. `view` is
`evals:<kind>` while a course is open; `course` (a kind opened), `courseTest` (your run: ok, why, its numbers, what was
built), `courseAi` (cleared, marks, each try as C or F, `skipped` if Skip to the result was pressed, its best and
yours), `courseUnlock`, `unlocks` (the switch), `treeOpen`, `treeBuy`; written at once (`PT_FLUSH`). All through
`CourseUnlocks.log` -> `AGI.playtest`.

**Fixes from the owner's playtest, round 2 (2026-11-17).** **The maze follows a finger** (the owner: the pad "had a delay
before a one step would be accepted", then "replace with a finger dragging", "realtime following"): hold a finger on the
maze and the runner walks toward it by the shortest open way, a cell a tick; lift to stand. The pad is gone; W A S D
stay. A fresh press steps at once (never closer than a third of a tick to the last step; measured 6 to 50 ms from
press to step, it was up to 160). **The AI's attempts play at 1.5x** in the maze, the puck course and the room, and the
pauses round them are shorter (the owner: "watching is too long"). Not the rhythm run: its attempts are tied to the
song. Still to come from the same finding: the highlight reel and a review on the end card.

**Fixes from the owner's playtest, round 3 (2026-11-17): starter courses.** The owner, on a blank puck field with
everything open: "hard to choose ... no direction"; the call: a few ready-made courses to pick from in each kind.
`course-starters.js`: three each for the maze (First steps, Night watch, Lock and key), the puck course (First bank,
Slow lane, Shortcut) and the room (Stairs, Mind the gap, Workshop), each naming the ladder step it needs, so with the
unlocks on only what you could build is offered. The picker shows the first time a kind is opened (a save with nothing
built and nothing picked) and from a **Starters** button beside Clear; **Blank** is one of the choices.
`tests/course-starters.test.js` holds each to its step's parts and to being clearable. All courses and names mine.
The rhythm run already starts from the game's songs.

**Fixes from the owner's playtest, round 4 (2026-11-17): audio. I CANNOT HEAR ANY OF THIS: it is checked for running
without faults, not for how it sounds.**
- **The default music level is halved**, 35% to 18% (the owner's call). A device that has moved the slider keeps its own.
- **Measured, the songs are already even**: `node tools/audio/survey.js owner-1117 --quick` puts all 30 between -33.4 and
  -35.7 LUFS, each played through its form with every layer in, so no song is louder than another and a full
  arrangement is not louder either. (I first read the survey's `stress` rows, -16 to -25 LUFS, as full intensity and
  told the owner so. That was wrong: `stress` is every effect at once over the music.) Against the effects alone
  (-37 to -40 LUFS at the default sound level) the music at its old default sat 3 to 6 LU above them; halved, it is
  level with them. Nothing else was changed.
- **The rhythm run's pick card: soft background, loud preview** (the owner's call). `SFX.setSoft` (new) sits the music
  back to 40% on the card; tapping a track brings it forward for 12 s, Listen for as long as it plays.
- **Tapping a track now always changes the song.** It only told the engine when a board had been playing, so a second
  track in the same area never started.
- **A run with the music off sat for ever: fixed, twice over.** The run was created and then cleared by the next
  line when there was no engine; and music at 0 was still read as an engine, which waited 6 s for a song. With the
  music off **each note you hit sounds** (`SFX.note`, new: the kick low, the bass and the melody by the note's step in
  the scale, in the track's key).
- **Starts and stops are eased**: the music dips before the song is called and comes back under the count; it eases
  back at the end of your run and on the result. **Falling apart is heard sooner**: the layers thin as the meter to
  the power 1.8 (half a meter was half the layers, now under a third), a miss plays the game's error sound, and the
  music drops back when the song falls. The owner kept the hit window and the meter's numbers as they are.

**A fault of mine in round 4, fixed in the next commit:** the new `SFX.note` was written as a function called `note`,
which took the place of the engine's own `note` inside sfx.js, so held jobs played their figure three times too fast
(`tests/audio.test.js` caught it). Commit 9ac9271 went to main with that test failing, because my commit step did not
stop on a failed test; it was live on main and the play server for about ten minutes. It is `laneNote` now.

**Fixes from the owner's playtest, round 5 (2026-11-17): the highlight reel and a review on the result card.** The
owner: "a mini highlight reel with notable misses or successes and play the runs at a slightly faster pace. Give the
option to review on the end card." The result card of the maze, the puck course and the room has **Highlights** and
**Watch it all**; both play at the AI's 1.5x and end back on the same result (nothing is paid or learned again; **Back
to the result** leaves early). Highlights: each failed try at the moment it fails (the maze its last 14 ticks, the
room its last 110 steps, the puck course its last shot), and the finish of its best try, saying how much faster than
you it was; the puck course adds each shot of its best try that hit a target you did not. Measured: 2 to 8 s for the
highlights against 5 to 21 s for everything. "Where it beat you" in the maze and the room is only that line on the
finish: a faster time has no one place to show. Not the rhythm run (its attempts are tied to the song). Logged as
`courseReview`.
