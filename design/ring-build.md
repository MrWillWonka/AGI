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
