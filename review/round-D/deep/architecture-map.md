# Architecture map (round D, deep audit, build 92a207b)

## Modules
| Module | Size | DOM | Owns |
|---|---|---|---|
| engine.js | 163 KB, 2.1K lines, UMD | none (only `Date.now()` as a default in `defaultState`) | all content data; the save schema (`defaultState`, `migrate`, `serialize`/`deserialize`, `SAVE_VERSION` 15); the lab economy (`derive`, `tick`, `act`, `buy`/`buyMany`, tasks, procurement, capacity); the path economy (`pushCost`, `payPush`/`payBurn`, `rollXp`, `finishRoll`, `crestSkill`, `clearLeg`, `recordLegs`, passive leg XP, `nearMiss`); luck dice (`luck`, `*Hit`); prestige / transcend / challenges / perks; investor projects |
| training-path.js | 51 KB | none, no clock, no randomness | terrain (`terrain`, `rollingHills`, `features`) and the fixed-step ball (`createRoll`: push, burn, fly, smash, coast, extend) |
| game.js | 421 KB, 7.7K lines, one IIFE | yes | UI, input, save I/O, tab lock, **the run loop** (pushBall, fireSprint/promptBonus, updateThrust/lightBurn/slipstream, crestFrontier + `roll.extend`, clearLeg/takeToken/markLegEntry, finishRoll settlement: recordLegs, nearMiss, settleSurge, settleBreakCountdown), **the Auto-Trainer policy** (autoTrain, autoCharge, wontClear, AUTO_THRUST_SPEED), **first-summit sizing** (`firstSummitStrength`), crunch/flow/bullet-time sequencing, camera, drawing |
| playtest.js | 9 KB | none | telemetry log |
| sfx.js | 108 KB | WebAudio | sound and music |
| tools/sim.js | 484 lines | none | the human-model balance bot; **re-implements the game.js run loop by hand (~250 lines)** |

Dependency graph is a star: engine.js and training-path.js import nothing; game.js, debug-panel.js and tools/sim.js read them (`window.AGIEngine`/`window.TrainingPath` or `require`). No circular imports.

## Can `simulate(state, actions, elapsed)` run in Node without the DOM?
- **Lab economy: yes.** `E.act`, `E.buy`, `E.tick`, `E.evaluate`, `E.prestige`, `E.transcend` are pure functions of `state` (deterministic: projects are seeded by `projects.seq`, luck by roll seed and sprint index). Fuzzed here: 300K random operations, 0 throws; the only non-finite values came from API inputs the UI can't produce (`tick(Infinity)`, `setTaskShare(NaN)`).
- **Training progression: only by copying game.js.** Physics events are turned into economy calls by the run loop inside game.js's IIFE (not exported). tools/sim.js mirrors it by hand; `tests/sim-sync.test.js` checks names of the economy calls and four constants, not behaviour. It omits crunches, flows, Bullet Time and Lucid Dream (legacy only), so post-ship numbers understate versions that buy them. The sim's **default mode is now wrong**: with `HYBRID` unset the Auto-Trainer drives every run once earned, and since the owner's change it only replays cleared legs, so the bot never passes skill 3 (0 skills from minute 14 to 150 on seeds 1/2/42). Only `HYBRID=1` reproduces CLAUDE.md's numbers.
- Recommendation: move the run loop's settlement (sprint resolution order, crest/clear/token handling, finishRoll settlement) into a pure `runner.js` (no DOM, takes `E`, `T`, a policy and an RNG) used by both game.js and the sim. That gives the rubric's `simulate(state, actions, elapsed)` and removes the 250-line copy.

## Duplicated formulas and constants
- engine `legMetres`/`legEase`/`ACT_TWO_EASE`/`isWallLeg`/`ACT_TWO_LEG`/`WALL_EVERY` mirror training-path geometry: kept equal by tests.
- game.js and tools/sim.js: `FIRST_SUMMIT_MARGIN`, `AUTO_THRUST_SPEED`, `STUCK_GRACE`, `RESULT_PAUSE` (tested); `AUTO_ERROR`, `AUTO_REACTION`, `autoSkill`, `wontClear`, the luck order in pushBall/lightBurn, `firstSummitStrength` (not tested, equal today).
- `derive()` is recomputed on demand: 32 call sites in game.js, plus every luck roll (`breakthroughHit`, `maxEffortHit`, …), `rollXp`, `pushBonusXp`, `collectToken`, `recordRun`, `legXpRate` default argument, and up to 20 per procurement tick. Cheap today (tick p95 well under a frame, see perf), but it is the cost centre if content grows.

## Global mutable state
- game.js: `state` plus 48 module-level `let`s (path, camera, fx, debugRates, debugSpeed, openBay, view, …).
- game.js writes the saved state directly in a few non-debug places: `stats.holds`, `stats.breakthroughs`, `stats.superPrompts`, `stats.flights` (counters), `state.intro[...]`, and `tasks.procurement.bought` is drained by game.js each tick. Everything else goes through engine functions.
- Engine module state: `notation` (formatting only).

## Schema ownership
- engine.js owns the schema; `migrate()` rebuilds a state from defaults and copies known keys, so unknown keys are dropped and every value is type-checked and capped.
- `tasks.procurement.bought` is a **transient UI event queue stored inside the saved state** (written by `E.tick`, drained by game.js `advanceTasks`). `migrate()` drops it, so a save→load is not byte-identical, and any headless consumer (the sim) grows it without bound. It is not authoritative (round trip of all authoritative fields: 100% on 8 fixtures).
- Per-device screen state lives outside the save (`agiRoom`, `agiRackLog`, `agiTreeCam3`, `agiLabSeen`, `agiPlaytest`, …), on purpose.
