// Human-model balance sim for "The Path to AGI" (first version only).
// Usage: node tools/sim.js [gameDir] [seed] [--quiet]   (gameDir defaults to this repo)
//   PROFILE (default playtests/profile.json, the real players' pooled mean; 'none' for the old bot) sets the player:
//   env LABSHARE (bot 0.2): share of each minute in the lab; CLICKS (bot 3): clicks/s in the lab; IDLE (bot 0): share
//   neither in the lab nor training; PAUSE (bot 2): seconds between runs;
//   MINUTES (default 150), MAXSKILL (default 20, warm-up = skill 0), CLEAN (bot 0.5): clean-prompt hit rate,
//   HYBRID (default 1): the Auto-Trainer drives only while the player is in the lab (HYBRID=0: it drives every run,
//   and since it only replays cleared legs the bot then stops at the skill it earned it on); LABDBG=1: hardware against capacity.
// Mirrors game.js's run loop (pushBall, fireSprint/promptBonus, updateThrust/lightBurn, crestFrontier,
// clearLeg, takeToken, finishRoll, nearMiss, STUCK_GRACE) with the engine's real API.
'use strict';
const path = require('path');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const QUIET = process.argv.includes('--quiet');
const dir = path.resolve(args[0] || path.join(__dirname, '..'));
const SEED = +(args[1] || 42);

// Seeded Math.random before the game modules load.
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
Math.random = mulberry32(SEED * 7919 + 1);
const rng = mulberry32(SEED * 104729 + 17);

const E = require(path.join(dir, 'engine.js'));
const T = require(path.join(dir, 'training-path.js'));

// PROFILE=<file.json>: a player profile measured from real playtest logs (tools/playtest-calibrate.js --json writes
// one: { sim: { CLICKS, LABSHARE, IDLE, CLEAN, PAUSE } }, or a flat object with those keys). Env vars still win.
// The default is the pooled mean of the real logs (playtests/profile.json); PROFILE=none is the old bot (3 clicks/s,
// a fifth of each minute in the lab, no idle time), which starved itself of data no human did.
const PROFILE = (() => {
    const file = process.env.PROFILE ?? path.join(__dirname, '..', 'playtests', 'profile.json');
    if (file === 'none' || !require('fs').existsSync(file)) return {};
    const p = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    return p.sim || p;
})();
const knob = (name, fallback) => +(process.env[name] ?? PROFILE[name] ?? fallback);
const LABSHARE = knob('LABSHARE', 0.2);
const CLICKS = knob('CLICKS', 3);
// IDLE: the share of each minute (after the server room opens) spent neither in the lab nor training: the skill
// tree, mail, other rooms, reading, away. Runs in flight roll on; nothing is clicked, bought or sprinted.
const IDLE = knob('IDLE', 0);
// SNARE (default 0): the share of each minute, once the Data Pipeline is open, spent in Packet Snare, played by a simple
// bot (it loops the biggest clean cluster it can find, tries a tight loop round the boss, and buys the cheapest node).
// Packet Snare pays Signal (its own tree) and its best haul trickles research, so its only pull on the pacing is RP.
const SNARE = Number(process.env.SNARE || 0);
const P = SNARE > 0 ? require(path.join(dir, 'packet-snare.js')) : null;
const MINUTES = +(process.env.MINUTES ?? 150);
const MAXSKILL = +(process.env.MAXSKILL ?? 20);
const CLEAN = knob('CLEAN', 0.5);
const DT = 0.05;
const RESERVE = +(process.env.RESERVE ?? 0);
// HYBRID=1 (the default): the Auto-Trainer drives only while the player is in the lab; while training, the human
// plays. HYBRID=0 leaves it on for every run: it only replays cleared legs, so the bot never passes skill 3.
const HYBRID = !!+(process.env.HYBRID ?? 1);
const STUCK_GRACE = 3;
const HUMAN_PAUSE = knob('PAUSE', 2);   // seconds between a run's end and Train again
const AUTO_PAUSE = 1.2;          // RESULT_PAUSE
const AUTO_THRUST_SPEED = 1.5;
const FIRST_SUMMIT_MARGIN = 1.01;

// A fixed clock: defaultState stamps runStart from Date.now(), which seeds every roll's terrain.
const realNow = Date.now;
Date.now = () => 1.7e12 + SEED * 1000;
const s = E.defaultState();
Date.now = realNow;
const out = [];
const say = (...a) => { out.push(a.join(' ')); };
const xpBy = { distance: 0, prompts: 0, crest: 0, passive: 0, tokens: 0, cleared: 0, nearMiss: 0, other: 0 };
const skills = [];
let generalAt = null;
let xpAtGeneral = null;
let pmRuns = null;
let runs = 0;
let sprints = 0, partial = 0;

// ---- the run ----
const run = { roll: null, handCharges: [], autoAt: 0, autoThrusting: false, rollPushes: 0, pause: 0, brokeFor: 0, maxEffort: false, burnUnit: null, burnStrength: null };
const d0 = () => E.derive(s);
const ballLeg = () => (run.roll ? Math.min(run.roll.leg, s.path.learned) : s.path.learned);
const chargeBudget = () => E.affordableCharge(s, ballLeg());
const pushIndex = roll => run.rollPushes - roll.pushesLeft;
const thrustLeg = roll => roll.leg >= T.LATE_LEG;

function newRoll(auto) {
    const d = d0();
    // The human starts on the frontier; the Auto-Trainer (game.js startLeg) replays the newest cleared leg.
    const replay = auto && s.path.learned > 0;
    const first = replay ? s.path.learned - 1 : s.path.learned;
    run.roll = T.createRoll(first, E.rollSeed(s), { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction,
        hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, onward: true, last: s.path.learned });
    run.roll.frontier = s.path.learned;
    run.roll.auto = replay;
    run.autoAt = 0;
    run.rollPushes = d.pushesPerRoll;
    run.burnUnit = null;
    run.burnStrength = null;
    run.brokeFor = 0;
    run.maxEffort = false;
}

function firstSummitStrength(roll, d) {
    const crests = strength => {
        const t = T.createRoll(0, roll.ground.seed, { pushes: 1, cooldown: 1, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: 0 });
        t.push(strength);
        for (let i = 0; i < 1200 && !t.over; i++) if (t.step(0.05).some(e => e.type === 'crest')) return true;
        return false;
    };
    let lo = 0, hi = 1;
    while (!crests(hi) && hi < 1e3) hi *= 2;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (crests(mid)) hi = mid; else lo = mid; }
    return hi * FIRST_SUMMIT_MARGIN;
}

function launchBreakthrough(roll, superBreak) {
    if (!superBreak) return;
    const g = roll.ground;
    const leg = g.legAt(roll.ball.x);
    roll.smash(Math.max(4, 0.3 * g.legLength(leg)));
}

function pushBall(auto, fraction, kind, effort) {
    const roll = run.roll;
    if (roll.over || roll.crested || roll.pushesLeft <= 0 || roll.ball.cooldown > 0) return false;
    const leg = ballLeg();
    const budget = chargeBudget();
    fraction = Math.min(fraction, budget);
    if (fraction < E.PATH.minCharge || !E.payPush(s, fraction, leg)) return false;
    sprints++;
    if (budget < 0.999) partial++;
    const index = pushIndex(roll);
    const seed = roll.ground.seed;
    const surge = !!E.surgeSprint?.(s, pushIndex(roll));
    const breakthrough = E.breakthroughHit(s, seed, index) || E.breakGuaranteed(s);
    E.settleBreakCountdown(s, breakthrough);
    const superBreak = breakthrough && E.superHit(s, 'breakthrough', seed, index);
    const strength = !roll.launched && s.path.learned === 0 && roll.ground.stretch === 0
        ? firstSummitStrength(roll, d0())
        : E.sprintStrength(s, fraction, kind, breakthrough, effort) * (surge ? E.SURGE_POWER : 1);
    roll.push(strength, false);
    if (breakthrough) {
        roll.breakthroughs = (roll.breakthroughs || 0) + 1;
        s.stats.breakthroughs = (s.stats.breakthroughs || 0) + 1;
        launchBreakthrough(roll, superBreak);
    }
    if (!auto && !effort && !run.maxEffort && roll.pushesLeft > 0 && E.maxEffortHit(s, seed, index)) run.maxEffort = true;
    return true;
}

function promptBonus(roll, kind, leg, charge) {
    const xp = E.grantPushBonus(s, kind, leg, charge);
    xpBy.prompts += xp;
    if (kind === 'perfect' || kind === 'system') s.stats.superPrompts = (s.stats.superPrompts || 0) + 1;
    roll.units = (roll.units || 0) + E.cleanUnits(kind, s);
    roll.bonusXp = (roll.bonusXp || 0) + xp;
}

function currentZone(roll) {
    const d = d0();
    return E.bonusZone(roll.ground.seed, pushIndex(roll), d.zoneWidth, d.perfectWidth, d.systemWidth, d.zoneBias);
}

// Climbing without the energy to make the next crest (game.js wontClear).
function wontClear(roll) {
    const b = roll.ball, g = roll.ground;
    if (b.v <= 0 || g.slope(b.x) < 0.02) return false;
    const next = g.bumps.find(h => h.peak > b.x);
    if (!next) return false;
    return 0.5 * b.v * b.v < T.GRAVITY * (next.height - g.height(b.x)) * 1.05;
}

// The human: sprints from rest, when stalling on a climb, or near rest; clean prompts CLEAN of the time.
function humanSprint(roll) {
    if (roll.over || roll.airborne || roll.ball.cooldown > 0 || roll.pushesLeft <= 0) return;
    const nearRest = roll.launched && Math.abs(roll.ball.v) < 0.15;
    if (!(!roll.launched || roll.atRest || nearRest || wontClear(roll))) return;
    const budget = chargeBudget();
    if (budget < E.PATH.minCharge) return;
    if (run.maxEffort) {
        if (pushBall(false, 1, 'perfect', true)) { run.maxEffort = false; promptBonus(roll, 'perfect', ballLeg(), 1); }
        return;
    }
    const zone = currentZone(roll);
    let level = budget;
    if (zone.to > zone.from && rng() < CLEAN) {
        const lo = Math.max(zone.from, E.PATH.minCharge), hi = Math.min(zone.to, budget);
        if (hi > lo) level = lo + (hi - lo) * rng();
    }
    const kind = zone.to > zone.from ? E.zoneHit(zone, level) : null;
    const leg = ballLeg();
    const pushed = pushBall(false, Math.max(E.PATH.minCharge, level), kind, false);
    if (pushed) { run.handCharges.push(level); if (run.handCharges.length > 20) run.handCharges.shift(); }
    if (pushed && kind) promptBonus(roll, kind, leg, level);
}

// The Auto-Trainer as game.js plays it: your recent charges with a wobble, after a reaction delay, both shrinking
// with its level and with skills learned (AUTO_ERROR, AUTO_REACTION, autoSkill, autoCharge, autoReady).
const AUTO_ERROR = [0.24, 0.13, 0.06];
const AUTO_REACTION = [0.7, 0.35, 0.15];
function autoSkill(lvl) {
    const l = Math.max(1, Math.min(3, lvl));
    const learn = Math.max(0.5, 1 - 0.04 * Math.max(0, E.legPos(s.path.learned) - 3));
    return { err: AUTO_ERROR[l - 1] * learn, react: AUTO_REACTION[l - 1] * learn };
}
const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
function autoReady(want, react) {
    if (!want) { run.autoAt = 0; return false; }
    if (!run.autoAt) run.autoAt = s.stats.playTime + react * rng();
    return s.stats.playTime >= run.autoAt;
}

function autoSprint(roll, lvl) {
    if (roll.over || roll.ball.cooldown > 0 || roll.airborne) { run.autoAt = 0; return; }
    const { err, react } = autoSkill(lvl);
    if (!autoReady(!roll.launched || roll.atRest || wontClear(roll), react)) return;
    run.autoAt = 0;
    const budget = chargeBudget();
    if (budget < E.PATH.minCharge) return;
    if (lvl >= 2) {
        const zone = currentZone(roll);
        const aim = lvl >= 3 && zone.perfectTo > zone.perfectFrom ? (zone.perfectFrom + zone.perfectTo) / 2 : (zone.from + zone.to) / 2;
        if (zone.to > zone.from && aim <= budget) {
            const level = Math.max(E.PATH.minCharge, Math.min(budget, aim + gauss() * err * 0.5));
            const kind = E.zoneHit(zone, level);
            if (pushBall(true, level, kind) && kind) promptBonus(roll, kind, ballLeg(), level);
            return;
        }
    }
    const h = run.handCharges;
    const usual = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0.8;
    pushBall(true, Math.max(E.PATH.minCharge, Math.min(budget, usual + gauss() * err)));
}

// The ghost (game.js ghostTrain): the Auto-Trainer's own run beside yours, from the newest cleared leg to the last
// cleared hill, at GHOST_POWER of your strength with GHOST_FUMBLE of its sprints fumbled, stepped every tick.
const GHOST_POWER = [0.5, 0.7, 0.85];
const GHOST_FUMBLE = [0.35, 0.2, 0.1];
const GHOST_PAUSE = 1.5;
const ghost = { roll: null, pause: 0, at: 0, legs: 0, first: 0, thrusting: false, broke: 0 };
let ghostXp = 0, ghostRuns = 0;
function ghostReady(want, react) {
    if (!want) { ghost.at = 0; return false; }
    if (!ghost.at) ghost.at = s.stats.playTime + react * rng();
    return s.stats.playTime >= ghost.at;
}
function finishGhost(ev, done) {
    const leg = Math.min(ev.leg ?? ghost.first, s.path.learned - 1);
    ghostXp += E.finishRoll(s, done ? 0 : ev.progress || 0, false, 0, done ? 0 : ev.metres || 0, leg, false, ghost.legs).xp;
    ghostRuns++;
    ghost.roll = null;
    ghost.pause = GHOST_PAUSE;
}
function ghostTrain(dt) {
    const lvl = E.autoTrainerLevel(s);
    if (!lvl || !s.path.learned || process.env.GHOST === '0') { ghost.roll = null; return; }
    if (ghost.pause > 0) { ghost.pause -= dt; return; }
    if (!ghost.roll || ghost.roll.frontier !== s.path.learned) {
        const d = d0();
        ghost.first = s.path.learned - 1;
        ghost.roll = T.createRoll(ghost.first, (E.rollSeed(s) * 31 + 977) >>> 0, { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction,
            hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: s.path.learned });
        ghost.roll.frontier = s.path.learned;
        ghost.legs = 0; ghost.at = 0; ghost.broke = 0;
    }
    const roll = ghost.roll;
    const l = Math.max(1, Math.min(3, lvl));
    const trained = Math.max(0, E.legPos(s.path.learned) - 3);
    const power = Math.min(1, GHOST_POWER[l - 1] * (1 + 0.03 * trained));
    const fumble = GHOST_FUMBLE[l - 1] * Math.max(0.5, 1 - 0.04 * trained);
    const { err, react } = autoSkill(lvl);
    const leg = Math.min(roll.leg, s.path.learned - 1);
    roll.thrust = 0;
    if (roll.leg >= T.LATE_LEG && !roll.over && roll.pushesLeft > 0) {
        const want = !roll.launched || (!roll.airborne && roll.ball.v < AUTO_THRUST_SPEED) || wontClear(roll) || (roll.airborne && roll.vy < 0);
        ghost.thrusting = want && (ghost.thrusting || ghostReady(want, react));
        if (ghost.thrusting) {
            const st = E.legPower(s, leg) * power;
            roll.thrust = E.PATH.thrustEfficiency * st * st / T.BURN_SECONDS;
        }
    } else if (!roll.over && roll.ball.cooldown <= 0 && !roll.airborne && roll.pushesLeft > 0
        && ghostReady(!roll.launched || roll.atRest || wontClear(roll), react)) {
        ghost.at = 0;
        const h = run.handCharges;
        const usual = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0.8;
        const fraction = rng() < fumble ? 0.1 + 0.25 * rng() : Math.max(E.PATH.minCharge, Math.min(1, usual + gauss() * err));
        roll.push(E.legPower(s, leg) * E.sprintStrength(s, fraction, null, false, false) / E.sprintStrength(s, 1, null, false, false) * power);
    }
    for (const ev of roll.step(dt)) {
        if (ev.type === 'clear') {
            ghostXp += E.clearLeg(s, ev.skill, ghost.legs);
            ghost.legs++;
            if (ev.skill >= s.path.learned - 1) { finishGhost(roll.end(), true); return; }
        } else if (ev.type === 'token') ghostXp += E.collectToken(s, ev.leg, ghost.legs);
        else if (ev.type === 'end') { finishGhost(ev, false); return; }
    }
}

// Act two: thrust (game.js updateThrust / lightBurn / slipstream).
function lightBurn(roll) {
    const index = pushIndex(roll);
    const seed = roll.ground.seed;
    const effort = run.maxEffort;
    run.maxEffort = false;
    const surge = !!E.surgeSprint?.(s, index);
    const breakthrough = E.breakthroughHit(s, seed, index);
    const superBreak = breakthrough && E.superHit(s, 'breakthrough', seed, index);
    run.burnStrength = E.sprintStrength(s, 1, null, breakthrough, effort) * (surge ? E.SURGE_POWER : 1);
    if (breakthrough) {
        roll.breakthroughs = (roll.breakthroughs || 0) + 1;
        s.stats.breakthroughs = (s.stats.breakthroughs || 0) + 1;
        launchBreakthrough(roll, superBreak);
    }
    if (!run.maxEffort && roll.pushesLeft > 1 && E.maxEffortHit(s, seed, index)) run.maxEffort = true;
}
function updateThrust(roll, want, sim) {
    let power = 0;
    if (want && thrustLeg(roll) && !roll.over && !roll.crested && !roll.flowing && roll.pushesLeft > 0) {
        const unit = Math.ceil(roll.pushesLeft - 1e-9);
        if (run.burnUnit !== unit || run.burnStrength == null) { run.burnUnit = unit; lightBurn(roll); }
        if (E.payBurn(s, sim / T.BURN_SECONDS, ballLeg())) {
            power = E.PATH.thrustEfficiency * run.burnStrength * run.burnStrength / T.BURN_SECONDS;
            if (roll.airborne) {
                roll.slip = (roll.slip || 0) + sim / T.BURN_SECONDS;
                while (roll.slip >= E.PATH.slipstream) {
                    roll.slip -= E.PATH.slipstream;
                    const xp = E.grantPushBonus(s, 'clean', ballLeg(), 1);
                    xpBy.prompts += xp;
                    roll.units = (roll.units || 0) + 1;
                    roll.bonusXp = (roll.bonusXp || 0) + xp;
                }
            }
        }
    }
    roll.thrust = power;
    roll.thrustFree = false;
}
function wantThrust(roll, lvl) {
    if (!thrustLeg(roll) || roll.over || roll.pushesLeft <= 0) return false;
    const slow = !roll.airborne && roll.ball.v < AUTO_THRUST_SPEED;
    // From rest, when slow or stalling, and on the way down in flight (the human and the Auto-Trainer alike; the
    // Auto-Trainer starts a burn after its reaction delay and keeps on while the reason holds).
    const want = !roll.launched || slow || wontClear(roll) || (roll.airborne && roll.vy < 0);
    if (!lvl) return want;
    const on = want && (run.autoThrusting || autoReady(want, autoSkill(lvl).react));
    run.autoThrusting = on;
    if (!want) run.autoAt = 0;
    return on;
}

function markLegEntry(roll, leg) {
    const banked = (roll.bonusXp || 0) + (roll.legXp || 0) + (roll.tokenXp || 0);
    (roll.legEntries = roll.legEntries || []).push({ leg, banked });
}

function crestFrontier(ev) {
    const roll = run.roll;
    const { xp, skill } = E.crestSkill(s, ev.metres, roll.units || 0, roll.legs || 0);
    xpBy.crest += xp;
    roll.extend();
    if (!skill) return;
    roll.legs = (roll.legs || 0) + 1;
    roll.legXp = (roll.legXp || 0) + xp;
    markLegEntry(roll, ev.skill + 1);
    onSkill(skill);
}
function clearLeg(ev) {
    const roll = run.roll;
    const xp = E.clearLeg(s, ev.skill, roll.legs || 0);
    xpBy.cleared += xp;
    if (roll.auto && ev.skill >= s.path.learned - 1) roll.autoDone = true;   // the replay ends at the frontier
    roll.legs = (roll.legs || 0) + 1;
    roll.legXp = (roll.legXp || 0) + xp;
    markLegEntry(roll, ev.skill + 1);
}
function takeToken(ev) {
    const roll = run.roll;
    const xp = E.collectToken(s, ev.leg, roll.legs || 0);
    xpBy.tokens += xp;
    roll.tokenXp = (roll.tokenXp || 0) + xp;
    roll.tokens = (roll.tokens || 0) + 1;
}
function finishRoll(ev) {
    const roll = run.roll;
    if (!ev) return;
    const crested = ev.type === 'crest' || !!ev.crested;
    const leg = ev.leg ?? s.path.learned;
    const replay = roll.ground.stretch < roll.frontier;
    const units = roll.units || 0;
    const banked = (roll.bonusXp || 0) + (roll.legXp || 0) + (roll.tokenXp || 0);
    const legs = roll.legs || 0;
    const metres = ev.metres || 0;
    const viral = metres > 0 && E.windfallHit(s, roll.ground.seed);
    const before = s.path.learned;
    const result = E.finishRoll(s, ev.progress, crested, units, metres, leg, viral, legs);
    xpBy.distance += result.xp;
    if (roll.launched) E.settleSurge?.(s);
    E.recordLegPower(s, roll.ground.stretch, leg);
    if (!roll.auto) E.recordLegs(s, roll.ground.stretch, roll.legEntries, result.xp + banked, viral ? d0().windfallMult : 1, result.xp);
    if (!crested && !replay && !legs && !ev.rolledBack && leg === before) {
        const goal = roll.ground.goal;
        const top = roll.ball.maxX;
        if (top > goal.start && top < goal.peak) {
            const frac = roll.ground.height(top) / goal.height;
            xpBy.nearMiss += E.nearMiss(s, frac, result.xp + banked);
        }
    }
    if (result.skill) onSkill(result.skill);
    runs++;
    run.pause = HUMAN_PAUSE;
    buyTree();
}

function onSkill(skill) {
    const i = s.path.learned - 1;
    skills.push({ i, name: skill.name, min: s.stats.playTime / 60, run: runs + 1 });
    if (i === E.FIRST_REAL_SKILL && pmRuns == null) pmRuns = runs + 1;
    if (!QUIET) say(`  skill ${String(i).padStart(2)} ${skill.name.padEnd(28)} ${(s.stats.playTime / 60).toFixed(1).padStart(6)} min  run ${runs + 1}`);
}

function stepRun(dt, inLab) {
    if (!s.unlocked['module:path']) return;
    // Your runs are always yours (the Auto-Trainer runs its own ghost, ghostTrain below). With HYBRID=0 the
    // player never trains by hand: only the ghost does.
    if (!HYBRID) return;
    if (!run.roll || run.roll.over) {
        if (inLab) return;   // Train again is a click: not while in the lab
        if ((run.pause -= dt) > 0) return;
        newRoll(false);
    }
    const roll = run.roll;
    const lvl = 0;
    const acting = !inLab;
    if (thrustLeg(roll)) updateThrust(roll, acting && wantThrust(roll, lvl), dt);
    else {
        roll.thrust = 0;
        if (acting) { if (lvl) autoSprint(roll, lvl); else humanSprint(roll); }
    }
    const events = roll.step(dt);
    for (const ev of events) {
        if (ev.type === 'clear') clearLeg(ev);
        else if (ev.type === 'token') takeToken(ev);
        else if (ev.type === 'launch' || ev.type === 'bump') { /* nothing */ }
        else if (ev.type === 'land') { if ((ev.flight || 0) >= E.LONG_FLIGHT) s.stats.flights++; }
        else if (ev.type === 'crest' && ev.onward) crestFrontier(ev);
        else if (ev.type === 'crest' && !roll.over) { /* rollOut only */ }
        else finishRoll(ev);
    }
    if (roll.autoDone && !roll.over) finishRoll(roll.end());
    if (!roll.over) {
        const broke = roll.launched && roll.atRest && roll.pushesLeft > 0
            && (thrustLeg(roll) ? !E.canAfford(s, E.burnCost(s, 0.1, ballLeg())) : chargeBudget() < E.PATH.minCharge);
        run.brokeFor = broke ? run.brokeFor + dt : 0;
        if (run.brokeFor > STUCK_GRACE) { run.brokeFor = 0; finishRoll(roll.end()); }
    }
}

// ---- the lab ----
const LAB_TABS = new Set(['hardware', 'software', 'algorithms', 'consciousness']);
function reserve() {
    // RESERVE (default 0): full sprints' worth of CP/DP kept back from lab buys.
    if (!s.unlocked['module:path']) return { cp: 0, dp: 0 };
    const c = E.pushCost(s, 1, s.path.learned);
    return { cp: RESERVE * (c.cp || 0), dp: RESERVE * (c.dp || 0) };
}
function affordableWith(cost, keep) {
    for (const [k, v] of Object.entries(cost)) {
        const have = s.res[k] - (keep[k] || 0);
        if (have < v) return false;
    }
    return true;
}
function labBuy() {
    for (let guard = 0; guard < 200; guard++) {
        const keep = reserve();
        const cands = E.UPGRADES.filter(u => LAB_TABS.has(u.tab) && !u.legacy && E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && !E.atCapacity(s, u));
        let best = null, bestScore = Infinity;
        const d = d0();
        for (const u of cands) {
            const cost = E.upgradeCost(u, E.level(s, u.id));
            if (!affordableWith(cost, keep)) continue;
            let score;
            if (u.cps || u.id === 'keyboard') {
                s.levels[u.id] = (s.levels[u.id] || 0) + 1;
                const d2 = d0();
                s.levels[u.id]--;
                const gain = (d2.cpPerSec - d.cpPerSec) + (d2.clickPower - d.clickPower) * CLICKS * LABSHARE;
                score = (cost.cp || 0) / Math.max(1e-9, gain);
            } else {
                score = -1e9 + Object.values(cost).reduce((a, v) => a + v, 0);   // gates and multipliers first, cheapest first
            }
            if (score < bestScore) { bestScore = score; best = u; }
        }
        if (!best) return;
        if (!E.buy(s, best.id).ok) return;
    }
}
function labClick() {
    const full = s.unlocked['module:path'] ? E.pushCost(s, 1, s.path.learned) : { cp: 0, dp: 0 };
    const dpWant = Math.max(40, 4 * (full.dp || 0));
    if (s.unlocked['action:collect'] && (s.stats.collects < 40 || s.res.dp < dpWant) && s.res.cp >= 10) return E.act(s, 'collect');
    const rpWanted = E.UPGRADES.some(u => LAB_TABS.has(u.tab) && E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && !E.atCapacity(s, u) && (u.cost.rp || 0) > 0);
    if (s.unlocked['action:research'] && (s.stats.researchManual < (E.AUTOMATION.researchAssistant.need) || rpWanted) && s.res.cp >= 200 + (full.cp || 0) && s.res.dp >= 40 + (full.dp || 0)) return E.act(s, 'research');
    return E.act(s, 'compute');
}
function claimOffers() {
    for (const o of [...(s.projects?.offers || [])]) {
        if (E.projectProgress(s, o) >= o.target) E.claimProject(s, o.id);
    }
}
// TREE=smart: strength, sprints and XP first (cost / weight); default: cheapest first.
const TREE = process.env.TREE || 'cheap';
const TREE_W = { push: 4, pushMult: 4, pushes: 4, xp: 3, slope: 2, friction: 2, clean: 2, cleanPower: 2, zone: 3 };
const treeWeight = u => Math.max(1, ...Object.keys(u.boost || {}).map(k => TREE_W[k] || 1));
function buyTree() {
    E.evaluate(s);
    for (let guard = 0; guard < 50; guard++) {
        const cands = E.UPGRADES.filter(u => u.tab === 'training' && E.isUpgradeVisible(s, u) && !E.isMaxed(s, u))
            .map(u => ({ u, cost: E.upgradeCost(u, E.level(s, u.id)) }))
            .filter(c => E.canAfford(s, c.cost))
            .map(c => ({ ...c, w: TREE === 'smart' ? treeWeight(c.u) : 1 }))
            .sort((a, b) => (a.cost.xp || 0) / a.w - (b.cost.xp || 0) / b.w);
        if (!cands.length) return;
        if (!E.buy(s, cands[0].u.id).ok) return;
        E.evaluate(s);
    }
}

// ---- Packet Snare's bot ----
const snareSim = { run: null, plan: [], wait: 0, runs: 0, haul: 0, signal: 0 };
function snareStep(dt) {
    if (!snareSim.run || snareSim.run.over) {
        if (snareSim.run) {
            E.finishSnare(s, snareSim.haul, null, snareSim.run.stats);
            snareSim.runs++;
            // the cheapest node it can buy
            for (;;) {
                const c = E.SNARE_TREE.filter(u => E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && E.canAfford(s, E.upgradeCost(u, E.level(s, u.id))))
                    .sort((a, b) => E.upgradeCost(a, E.level(s, a.id)).signal - E.upgradeCost(b, E.level(s, b.id)).signal)[0];
                if (!c || !E.buy(s, c.id).ok) break;
                E.evaluate(s);
            }
        }
        const o = E.snareOpts(s);
        snareSim.sector = s.snare.sector;
        snareSim.run = P.createSnare({ ...o, seed: Math.floor(rng() * 1e9) });
        snareSim.haul = 0;
        snareSim.plan = [];
    }
    const r = snareSim.run;
    // feed the planned loop a point a frame; a new plan once it's done and the pen's free
    if (snareSim.plan.length) { r.addPoint(...snareSim.plan.shift()); if (!snareSim.plan.length) r.liftPen(); }
    else if (r.cooldown <= 0 && (snareSim.wait -= dt) <= 0) {
        snareSim.wait = 0.4;
        let target = null, rad = 1.3;
        if (r.boss && rng() < 0.5) { target = r.boss; rad = 1.25; }
        else {
            let best = 0;
            for (const p of r.packets) {
                if (p.kind === 'corrupt') continue;
                const near = r.packets.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 1.7);
                if (near.some(q => q.kind === 'corrupt')) continue;
                if (near.length > best) { best = near.length; target = p; }
            }
        }
        if (target) {
            const n = 36, cx = target.x + target.vx * 0.3, cy = target.y + target.vy * 0.3;
            for (let i = 0; i <= n + 2; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; snareSim.plan.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
        }
    }
    r.step(dt);
    for (const e of r.takeEvents()) {
        if (e.type === 'catch' || e.type === 'laser' || e.type === 'quarantine') snareSim.haul += E.snareCatch(s, e.units, snareSim.sector);
        if (e.type === 'bossDown') { snareSim.haul += E.snareCatch(s, 10 * E.snareBossHits(snareSim.sector), snareSim.sector); E.snareBossDown(s); }
    }
}

// ---- main loop ----
let clickAcc = 0, secAcc = 0, nextReport = 0;
say(`sim ${dir} seed ${SEED} labshare ${LABSHARE} idle ${IDLE} clicks ${CLICKS}/s clean ${CLEAN} pause ${HUMAN_PAUSE}s`);
while (s.stats.playTime < MINUTES * 60 && s.path.learned <= MAXSKILL) {
    const t = s.stats.playTime;
    const inLab = !s.unlocked['module:path'] || (t % 60) < 60 * LABSHARE;
    const idle = !inLab && (t % 60) < 60 * (LABSHARE + IDLE);
    const snaring = SNARE > 0 && !inLab && !idle && s.unlocked['module:snare'] && (t % 60) < 60 * (LABSHARE + IDLE + SNARE);
    if (snaring) snareStep(DT);
    if (inLab) {
        clickAcc += CLICKS * DT;
        while (clickAcc >= 1) { clickAcc--; labClick(); }
    }
    stepRun(DT, inLab || idle || snaring);
    // Earning the Auto-Trainer asks first (game.js promptAutoTrainer): the sim always says yes.
    if (E.level(s, 'autoTrainer') > 0 && !s.intro['prompt:autoTrainer']) { s.intro['prompt:autoTrainer'] = true; E.setTaskOn(s, 'autoTrainer', true); }
    ghostTrain(DT);
    const before = s.res.xp;
    const xps = d0().xpPerSec;
    E.tick(s, DT);
    xpBy.passive += xps * DT;
    void before;
    if ((secAcc += DT) >= 1) {
        secAcc -= 1;
        const ev = E.evaluate(s);
        if (generalAt == null && E.phaseIndex(s) >= 1) { generalAt = s.stats.playTime / 60; xpAtGeneral = { ...xpBy }; if (!QUIET) say(`  ** General AI at ${generalAt.toFixed(1)} min`); }
        if (inLab) { claimOffers(); labBuy(); }
        if (ev.upgrades?.length) buyTree();
    }
    if (t >= nextReport) {
        const d = d0();
        if (!QUIET) say(`  [${(t / 60).toFixed(0).padStart(3)} min] passive ${E.format(d.cpPerSec)} CP/s vs held ${E.format(d.clickPower * 4.13)} CP/s (×${(d.cpPerSec / Math.max(1e-9, d.clickPower * 4.13)).toFixed(2)})  skills ${s.path.learned}  runs ${runs}  xp ${E.format(s.res.xp)}`);
        if (!QUIET && process.env.LABDBG) say(`      own ${["keyboard","cpu","server","quantum","neural","datacenter","compilerOpt","kernelFusion"].map(i => i + ":" + E.level(s, i) + "/" + (E.capacity(s, E.UPGRADE_BY_ID[i]) === Infinity ? "-" : E.capacity(s, E.UPGRADE_BY_ID[i])) + (s.unlocked["up:" + i] ? "" : "(hid)")).join(" ")}  cp ${E.format(s.res.cp)} dp ${E.format(s.res.dp)} runCp ${E.format(s.stats.runCp)}`);
        nextReport += 300;
    }
}
const total = Object.values(xpBy).reduce((a, b) => a + b, 0) || 1;
say(`  Pattern Matching on run ${pmRuns ?? '-'}; General AI at ${generalAt == null ? '-' : generalAt.toFixed(1) + ' min'}; runs ${runs}; sprints ${sprints} (${Math.round(100 * partial / Math.max(1, sprints))}% below full charge)`);
const share = o => { const tot = Object.values(o).reduce((a, b) => a + b, 0) || 1; return Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(', '); };
if (xpAtGeneral) say('  XP to General AI: ' + share(xpAtGeneral));
say('  XP (whole sim): ' + Object.entries(xpBy).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(100 * v / total)}%`).join(', '));
say('  skills (min): ' + skills.map(k => `${k.i}:${k.min.toFixed(0)}`).join(' '));
if (SNARE > 0) say(`  Packet Snare: ${snareSim.runs} runs, best haul ${Math.round(s.snare.best)} Signal, sector ${s.snare.sector + 1}, ${E.SNARE_TREE.filter(u => E.level(s, u.id)).length} nodes, research trickle ${E.format(E.derive(s).snareRp)} RP/s`);
console.log(out.join('\n'));
module.exports = { skills, generalAt, pmRuns };
