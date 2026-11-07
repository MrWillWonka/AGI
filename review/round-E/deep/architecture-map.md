# Architecture map (round E deep audit, build 58728e8)

## Modules and ownership
| Module | Size | DOM | Owns |
|---|---|---|---|
| engine.js | 173 KB, UMD | none (only `Date.now()` as `defaultState`'s default) | content data (UPGRADES, SKILLS, MAIL, ACHIEVEMENTS...), the save schema (`defaultState`, `migrate`, `serialize`/`deserialize`, `SAVE_VERSION` 15), the lab economy (`derive`, `tick`, `act`, `buy`/`buyMany`, tasks, procurement, capacity), the path economy (`pushCost`, `payPush`/`payBurn`, `rollXp`, `finishRoll`, `crestSkill`, `clearLeg`, `recordLegs`, passive leg XP, `nearMiss`), luck dice, prestige / transcend / challenges / perks, investor projects |
| training-path.js | 51 KB | none; no clock, no randomness | terrain and the fixed-step ball (`createRoll`: push, burn, fly, smash, coast, extend) |
| game.js | 429 KB, one IIFE, 67 module-level `let`/state objects | yes | UI, input, save I/O, tab lock, and **the run loop** that turns physics events into economy calls (sprint luck order, first-summit sizing, thrust/slipstream, crest/clear/token settlement, `recordLegs`/`nearMiss`/`settleSurge`/`settleBreakCountdown` at a run's end), the Auto-Trainer policy (`autoCharge`, `AUTO_ERROR`, `AUTO_REACTION`, `wontClear`), crunch / flow / Bullet Time sequencing |
| tools/sim.js | 486 lines | none | the human-model balance bot: a hand copy of game.js's run loop (~250 lines) |

Dependency graph: a star. engine.js and training-path.js import nothing; game.js, debug-panel.js, tools/sim.js read them. No cycles.

## `simulate(state, actions, elapsed)` without the DOM?
- **Lab economy: yes.** `act`/`buy`/`tick`/`evaluate`/`prestige`/`transcend`/`claimProject` are pure functions of `state` and deterministic (projects seeded by `projects.seq`, luck by roll seed and sprint index). Fuzz (500K random operations incl. NaN/Infinity/negative inputs, round trips, prestige, transcend): 0 throws, 0 non-finite or negative values.
- **Training: only through a copy of game.js.** The run loop is private to game.js's IIFE. tools/sim.js mirrors it; `tests/sim-sync.test.js` compares constant values and the *names* of the engine calls, not behaviour (order of luck rolls, first-summit sizing, AUTO_ERROR/AUTO_REACTION are unchecked copies). Crunch, flow, Bullet Time and Lucid Dream (legacy) are not in the sim.
- **The sim's default policy is not something the game offers.** `HYBRID=1` (the documented default) has the Auto-Trainer drive only while the player is in the lab and hands a waiting replay back as a frontier run when the player returns. The game has no such mode: with the switch on, every run (present or not) starts on the newest cleared leg (`startLeg()`); picking Frontier switches it off for good. Measured, it doesn't distort the documented pace: a policy that switches it off once and never back on (`autoOff`) reaches General AI at a median 32.6 min and skill 14 at 67 min against 33.6 and 67.9 for HYBRID (5 seeds), i.e. the Auto-Trainer's background replays add nothing measurable to pace. A policy that never touches the switch (`autoOn`, the game's default) never passes skill 3 (finding E-01).

## Duplicated formulas and constants
- engine `legMetres`/`legEase`/`ACT_TWO_EASE`/`isWallLeg`/`ACT_TWO_LEG`/`WALL_EVERY` mirror training-path.js geometry (kept equal by tests).
- game.js ↔ tools/sim.js: FIRST_SUMMIT_MARGIN, AUTO_THRUST_SPEED, STUCK_GRACE, RESULT_PAUSE (tested); AUTO_ERROR, AUTO_REACTION, autoSkill, wontClear, burn power (`thrustEfficiency·strength²/BURN_SECONDS`), the luck order in pushBall/lightBurn, firstSummitStrength (untested copies).
- `derive()` is recomputed on demand everywhere (32 call sites in game.js; every luck roll, rollXp, pushBonusXp, collectToken, recordRun, `legXpRate`'s default argument, and up to 20 per procurement tick). It costs ~10-20 µs; the tick stays far under a frame (see perf), but it is the cost centre if content grows.

## Global mutable state and schema ownership
- engine.js owns the schema; `migrate()` rebuilds from defaults and copies known keys with type checks and caps (numbers ≤ 1e250, levels ≤ 1000, learned ≤ 500, boosts ≤ ×4).
- game.js writes saved state directly in a few non-debug places (counters `stats.holds`/`breakthroughs`/`superPrompts`/`flights`, `state.intro[...]`).
- `tasks.procurement.bought` is a transient UI event queue written by `E.tick` into the saved state and drained by game.js `advanceTasks`; `migrate()` drops it, so save→load is not byte-identical and headless callers grow it without bound (finding E-05).
- Per-device screen state (agiRoom, agiRackLog, agiTreeCam3, agiLabSeen, agiPlaytest, agiBeat, agiMusic...) lives outside the save on purpose.

## Recommendation (unchanged from round D, still the main architectural debt)
Move the run loop's settlement (sprint/burn resolution, luck order, first-summit sizing, crest/clear/token handling, run-end settlement, the Auto-Trainer policy) into a pure `runner.js` (no DOM; takes E, T, a policy and an RNG). game.js and tools/sim.js would both call it, which gives the rubric's `simulate(state, actions, elapsed)` and removes the 250-line copy.
