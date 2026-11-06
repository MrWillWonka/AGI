# Architecture map (round C, deep audit, build 1c7b90a)

## Modules and dependencies
| Module | Size | DOM | Owns |
|---|---|---|---|
| engine.js | 162 KB, 2.1K lines | no (UMD) | all content data, the save schema (defaultState / migrate / serialize, SAVE_VERSION 15), the lab economy (derive, tick, act, buy, tasks, procurement), the path economy (pushCost, rollXp, finishRoll, crestSkill, recordLegs, passive XP), luck dice, prestige / transcend / challenges / perks, investor projects |
| training-path.js | 51 KB | no, no clock, no randomness | terrain and the fixed-step ball physics |
| game.js | 410 KB, 7.5K lines | yes | UI, input, save I/O, tab lock, the **run loop** (sprint/thrust resolution, luck sequencing, settlement), the Auto-Trainer policy, first-summit sizing, camera and drawing |
| sfx.js | 108 KB | WebAudio | sound and music |
| playtest.js | 9 KB | no | telemetry log |
| tools/sim.js | 446 lines | no | the human-model balance bot; **re-implements game.js's run loop** |

A star: engine.js and training-path.js import nothing; game.js reads both through globals (`window.AGIEngine`,
`window.TrainingPath`). No circular imports.

## Can `simulate(state, actions, elapsed)` run in Node?
- **Lab economy: yes.** `E.act`, `E.buy/buyMany`, `E.tick`, `E.evaluate`, `E.prestige`, `E.transcend` are pure and
  deterministic; this audit fuzzed 120,000 random operations (odd dt incl. NaN, -1, 1e6; random buys, ships,
  task shares, claims) with 0 NaN/Infinity/negative values and 0 thrown errors.
- **Training progression: only by copying game.js.** The run loop that turns physics events into economy calls
  (pushBall, lightBurn/updateThrust/slipstream, crestFrontier + roll.extend, clearLeg, takeToken, markLegEntry,
  finishRoll settlement incl. recordLegs/nearMiss/settleSurge/settleBreakCountdown, STUCK_GRACE, the Auto-Trainer
  policy autoTrain/wontClear/AUTO_THRUST_SPEED, firstSummitStrength) lives in game.js. tools/sim.js mirrors it by
  hand (about 250 lines). The mirror omits crunches, Bullet Time, flows and Lucid Dream (legacy-only power-ups),
  so every post-ship balance number from the sim understates versions that buy them.

## Duplicated formulas and constants
- engine `legMetres`/`legEase`/`ACT_TWO_EASE`/`isWallLeg`/`ACT_TWO_LEG` mirror training-path geometry: kept equal by tests.
- game.js ↔ tools/sim.js: `FIRST_SUMMIT_MARGIN`, `AUTO_THRUST_SPEED`, `STUCK_GRACE`, `RESULT_PAUSE`, the luck order in
  pushBall/lightBurn, `wontClear`: **no test keeps these in step.**
- 32 `E.derive(state)` calls in game.js; derive is recomputed (not cached) by every luck roll (`breakthroughHit`,
  `maxEffortHit` ...), `rollXp`, `pushBonusXp`, `collectToken`, and up to 20× inside one procurement tick.

## Global mutable state
game.js: `state` plus 48 module-level `let`s (path, camera, fx, debugRates, debugSpeed, openBay, view ...).
game.js writes state directly in a few places (stats counters such as breakthroughs/superPrompts/holds/flights,
`path.best`, settings, debug). engine.js: module-level `notation` (setNotation).

## Schema ownership
engine.js owns the shape: defaultState, migrate (every version 1–15 tested here: all load, 0 bad numbers),
serialize/deserialize. Round trip of 5 canonical states (fresh, first automation, act two, post-ship, late) is exact,
and migrate is idempotent on all five. game.js still stores a UI queue (`tasks.procurement.bought`) inside the saved
state (migrate drops it). Patch fcc2a34 adds a level cap (1000) so tampered levels can't overflow production.

## Recommendation (not done here)
Move the run loop's economy side (sprint resolution and luck order, end-of-run settlement, the Auto-Trainer policy)
into an engine-side `runController(state, roll, input)` used by both game.js and tools/sim.js; then
`simulate(state, policy, seconds)` is one function and the sim can't drift.
