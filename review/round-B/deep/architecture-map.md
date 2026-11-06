# Architecture map (round B, deep audit, build 3c2d750)

## Modules
| Module | Size | DOM? | Owns |
|---|---|---|---|
| engine.js | 160 KB | no (UMD) | all data (UPGRADES, SKILLS, PHASES...), state schema (defaultState, migrate, serialize), economy (derive, tick, act, buy), path economy (pushCost, rollXp, finishRoll, crestSkill...), luck dice, prestige/transcend, projects |
| training-path.js | 51 KB | no | terrain + fixed-step ball physics (createRoll, step, push, burn, fly, smash) |
| game.js | 406 KB, 7.5K lines | yes | UI, input, the **run loop** (sprint/thrust/luck sequencing), Auto-Trainer policy, first-summit sizing, save I/O, tab lock, camera, drawing |
| sfx.js | 108 KB | WebAudio | sound/music |
| playtest.js | 9 KB | no | telemetry log |
| tools/sim.js | 446 lines | no | human-model bot; **re-implements game.js's run loop** |

Dependency graph is a star: engine.js and training-path.js have no imports; game.js reads both through globals
(`window.AGIEngine`, `window.TrainingPath`); no circular imports.

## Authoritative (saved) state, `defaultState()`
res {cp, dp, rp, xp} · attr {intelligence, creativity, awareness} · levels{} (lab + tree) · unlocked{} · achievements{} ·
intro{} (tips, mail) · prestige {points, total, count, major, minor, levels{} (legacy + Auto-Trainer)} · challenge,
challengesDone · transcend {points, total, count, perks} · stats (≈30 counters incl. playTime, runCp, rolls,
skilledSprints, *Ever gate counts, finishedAt) · path {learned, best, auto[], legBest[], breakDue, surge} ·
projects {offers, boosts, next, seq} · tasks {per task: on, share; procurement.fund, **procurement.bought (UI event
queue, drained by game.js advanceTasks, dropped by migrate)**} · settings · lastSaved. Save 1.3–5.8 KB.

## Derived (`derive(s)`), recomputed on demand
hardwareMult = (1+.5·compilerOpt)(1+.5·kernelFusion)(1+Σskill cp)·insightMult·debug·investor cp·1.5^founders;
cpPerSec = Σ tiers cps·2^(doublings)·hardwareMult; clickPower = 1+clickToolPower+skill click (flat);
dp/rp per action (flat by hand, ×(1+skill%)·insightMult automated); automation converts within task shares;
pushPower = 1.4·(1+tree push+skill push)·1.1^pushMult·√insightMult·investor push·challenge;
xpMult = (1+tree xp)·investor xp·insightMult·1.25^pretrained; xpPerSec = Σ_legs max(2·stretchXpAt(k), legBest[k])·0.0045·xpMult.
insightMult = 1+0.07·√(Insight ever). Insight gain = ⌊0.25·(learned−1)^1.7⌋·(1+0.5·Transcendence ever)·1.25^recursion.

## Sources and sinks
CP: clicks (flat), hardware → sinks: lab buys, collect (10), research (200+40 DP), sprints/thrust (24·1.5^min(n,3)·1.9^(n−3)·charge², n=leg−1), restart, procurement fund.
DP: hand collect, crawler → sinks: lab buys, research, sprints.  RP: research → algorithm/consciousness buys.
XP: run distance, crest ×2, prompts, tokens, replays/chain, near-miss, passive legs (73–83% of all XP in sims), investor grants → tree.
Insight: shipping → legacy nodes. Transcendence → perks.

## Can `simulate(state, actions, elapsed)` run in Node?
**The lab economy, yes:** E.act/E.buy/E.tick/E.evaluate/E.prestige are pure and deterministic (fuzzed: 120K ops, 0 NaN/neg).
**Training progression, only by copying game.js:** the run loop lives in game.js (pushBall/fireSprint, sprint index
→ luck dice order, Max Effort carry, breakthrough guarantee & surge settle, thrust/lightBurn/slipstream, crestFrontier
+ roll.extend, clearLeg/takeToken/markLegEntry/recordLegs aggregation, near-miss detection, STUCK_GRACE, the Auto-Trainer
policy (autoTrain, wontClear, AUTO_THRUST_SPEED), firstSummitStrength). tools/sim.js mirrors ~250 lines of it by hand,
so any change there silently desynchronises the balance sim (CLAUDE.md asks for it to be kept in step by convention only).

## Duplicated formulas / constants
legMetres (engine) ↔ training-path geometry (kept by a test); WALL_EVERY/isWallLeg and ACT_TWO_LEG/LATE_LEG and
ACT_TWO_EASE (both files, tested equal); FIRST_SUMMIT_MARGIN, AUTO_THRUST_SPEED, STUCK_GRACE, RESULT_PAUSE (game.js ↔ sim.js, untested).

## Global mutable state
game.js: `state` plus ~90 module-level `let`s (path, camera, fx, debugRates, debugSpeed...); 68 direct writes to
`state.*` from game.js (stats counters, intro flags, path fields, debug). engine.js: module-level `notation` (setNotation).

## Schema ownership
engine.js owns the shape (defaultState/migrate, SAVE_VERSION 15, every version 2–15 + v1 migrates); game.js also
writes fields directly and stores a UI queue (`tasks.procurement.bought`) inside the saved state.

## Recommendations (not done)
1. Move the run loop's economy side (sprint resolution, luck sequencing, end-of-run settlement, Auto-Trainer policy)
   into an engine-side `runController(state, roll)` used by both game.js and tools/sim.js.
2. Keep UI event queues out of the saved state (return bought ids from tick instead).
