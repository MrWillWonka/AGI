// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../training-path.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// Play one roll: push whenever `rule` says so, until the roll ends.
function play(k, seed, strength, opts, rule) {
    const roll = T.createRoll(k, seed, opts);
    for (let t = 0; t < 180; t += 1 / 60) {
        if (rule(roll)) roll.push(strength);
        const [ev] = roll.step(1 / 60);
        if (ev) return ev;
    }
    throw new Error('roll never ended');
}
const launchOnly = roll => !roll.launched;
const rescue = roll => roll.atRest || (roll.ball.v > 0 && roll.ball.v < 0.5 && roll.ground.slope(roll.ball.x) > 0.05);
const blind = () => true;

function crestRate(k, strength, opts, rule, n = 40) {
    let crests = 0;
    let progress = 0;
    for (let seed = 1; seed <= n; seed++) {
        const ev = play(k, seed, strength, opts, rule);
        if (ev.type === 'crest') crests++;
        progress += ev.progress;
    }
    return { crests: crests / n, progress: progress / n };
}

test('skill hills grow along the trail and stretches do not overlap', () => {
    for (let k = 0; k < 25; k++) {
        const a = T.skillHill(k);
        const b = T.skillHill(k + 1);
        assert.ok(b.height > a.height && b.halfWidth > a.halfWidth);
        assert.ok(T.checkpoint(k + 1) > a.end, 'next checkpoint is past this skill hill');
        assert.ok(a.start > T.checkpoint(k));
    }
});

test('rolling hills are random per roll, deterministic per seed, and smaller than the skill hill', () => {
    const a = T.rollingHills(3, 11);
    assert.deepEqual(a, T.rollingHills(3, 11));
    assert.notDeepEqual(a, T.rollingHills(3, 12));
    const goal = T.skillHill(3);
    for (const hill of a) {
        assert.ok(hill.height < goal.height * 0.7);
        assert.ok(hill.end < goal.start && hill.start > T.checkpoint(3));
    }
    const sizes = a.map(h => h.height);
    assert.ok(Math.max(...sizes) > 2 * Math.min(...sizes), 'hills vary in size');
});

test('terrain slope matches its height curve', () => {
    const g = T.terrain(2, 5);
    for (const x of [g.start, ...g.bumps.flatMap(b => [b.start + 0.05, b.peak - 0.03, b.end - 0.1])]) {
        const numeric = (g.height(x + 1e-6) - g.height(x - 1e-6)) / 2e-6;
        assert.ok(Math.abs(numeric - g.slope(x)) < 1e-3, `x=${x}`);
    }
});

test('a stretch is long: a single launch covers only part of it, and more pushes go further', () => {
    const weak = crestRate(0, 1.8, { pushes: 1, cooldown: 2 }, launchOnly);
    assert.equal(weak.crests, 0, 'one launch never reaches the first skill hill');
    assert.ok(weak.progress > 0.03 && weak.progress < 0.5, `launch-only progress ${weak.progress}`);
    const strong = crestRate(0, 2.5, { pushes: 6, cooldown: 0.8 }, rescue);
    assert.ok(strong.progress > weak.progress * 2, `upgraded runs go further (${strong.progress} vs ${weak.progress})`);
});

test('saving pushes for stalls beats firing them all at once', () => {
    const opts = { pushes: 4, cooldown: 0.6 };
    for (const k of [0, 2]) {
        const smart = crestRate(k, 2.5, opts, rescue);
        const dumb = crestRate(k, 2.5, opts, blind);
        // Score: how often the skill hill is cleared, plus average distance.
        const score = r => r.crests + r.progress;
        // Relative, so it holds however long the stretch is: saving pushes must go clearly further.
        assert.ok(score(smart) > score(dumb) * 1.3, `stretch ${k}: ${JSON.stringify(smart)} vs ${JSON.stringify(dumb)}`);
    }
});

test('upgrades that cut friction let the same push roll further', () => {
    const normal = crestRate(1, 2, { pushes: 1, cooldown: 2 }, launchOnly);
    const slick = crestRate(1, 2, { pushes: 1, cooldown: 2, friction: 0.6, slopeDrag: 0.5 }, launchOnly);
    assert.ok(slick.progress > normal.progress, `${slick.progress} vs ${normal.progress}`);
});

test('pushing against a backward roll is wasted energy', () => {
    const roll = T.createRoll(0, 1, { pushes: 3, cooldown: 0 });
    roll.ball.v = -2;
    roll.push(1.5);
    assert.ok(roll.ball.v < 0 && roll.ball.v > -2, 'it only slows the ball');
});

test('pushes are limited per roll and have a cooldown', () => {
    const roll = T.createRoll(0, 1, { pushes: 2, cooldown: 1 });
    assert.equal(roll.push(1), true);
    assert.equal(roll.push(1), false, 'cooling down');
    for (let t = 0; t < 1.05; t += 0.05) roll.step(0.05);
    assert.equal(roll.push(1), true);
    for (let t = 0; t < 1.05; t += 0.05) roll.step(0.05);
    assert.equal(roll.push(1), false, 'out of pushes');
    assert.equal(roll.pushesLeft, 0);
});

test('a roll is deterministic', () => {
    const run = () => {
        const roll = T.createRoll(3, 9, { pushes: 3, cooldown: 0.5 });
        const trace = [];
        for (let t = 0; t < 30 && !roll.over; t += 0.05) {
            if (rescue(roll)) roll.push(2.4);
            trace.push(...roll.step(0.05), +roll.ball.x.toFixed(6));
        }
        return trace;
    };
    assert.deepEqual(run(), run());
});

test('engine: pushes cost CP and DP by charge; XP rewards distance, records and crests', () => {
    const s = E.defaultState(NOW);
    s.res.cp = 100;
    s.res.dp = 40;
    assert.equal(E.payPush(s, 1), false, 'locked until the milestone');
    s.stats.collects = 40;
    E.evaluate(s);
    const full = E.pushCost(s, 1);
    const half = E.pushCost(s, 0.5);
    assert.ok(half.cp < full.cp / 2, 'cost grows with the square of the charge');
    assert.equal(E.payPush(s, 1), true);
    assert.equal(s.res.cp, 100 - full.cp);

    // The affordable charge is capped by your resources.
    s.res.cp = full.cp / 4;
    const cap = E.affordableCharge(s);
    assert.ok(cap > 0.4 && cap < 0.6, `cap ${cap}`);
    assert.equal(E.payPush(s, 1), false, 'cannot pay for a full push');
    assert.equal(E.payPush(s, cap), true);
    s.res.cp = 0;
    assert.equal(E.affordableCharge(s), 0);

    assert.ok(E.rollXp(s, 0.8, false, 0, 8) > 2 * E.rollXp(s, 0.4, false, 0, 4), 'further is worth disproportionately more');
    assert.equal(E.rollXp(s, 1, true, 0, 10), E.rollXp(s, 1, false, 0, 10) * E.PATH.crestBonus);

    const seed = E.rollSeed(s);
    const r1 = E.finishRoll(s, 0.5, false);
    assert.equal(r1.record, true);
    assert.equal(s.path.best, 0.5);
    assert.notEqual(E.rollSeed(s), seed, 'every roll gets new terrain');
    assert.equal(E.finishRoll(s, 0.3, false).record, false);
    const r3 = E.finishRoll(s, 1, true);
    assert.equal(r3.skill.name, E.SKILLS[0].name);
    assert.equal(s.path.learned, 1);
    assert.equal(s.path.best, 0, 'record resets for the new stretch');
    assert.ok(E.pushCost(s, 1).cp > E.PATH.pushCost.cp, 'pushes cost more further along');
});

test('engine: training upgrades are bought with XP and change the roll setup', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    const base = E.derive(s);
    assert.equal(base.pushesPerRoll, 1, 'launch only at first');
    assert.equal(base.pushCooldown, E.PATH.baseCooldown);
    assert.equal(E.buy(s, 'initialWeights').ok, false, 'needs XP');
    s.res.xp = 1000;
    for (const id of ['initialWeights', 'trainingEpochs', 'fasterIteration', 'trainingOptimizer']) {
        assert.equal(E.buy(s, id).ok, true, id);
        E.evaluate(s);   // finishing a node opens the ones that grow from it
        if (id === 'trainingEpochs') {
            assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.fasterIteration), false, 'hidden until Investor Funding is maxed');
            assert.equal(E.buy(s, id).ok, true);
            E.evaluate(s);
        }
    }
    const d = E.derive(s);
    assert.equal(d.pushesPerRoll, 3, "launch + two levels of Investor Funding");
    assert.ok(d.pushCooldown < base.pushCooldown);
    assert.ok(d.pushPower > base.pushPower);
    s.levels.fasterIteration = 12;
    assert.equal(E.derive(s).pushCooldown, E.PATH.minCooldown);
});

test('engine: skills grant attributes and permanent bonuses, in order only', () => {
    const s = E.defaultState(NOW);
    const before = E.derive(s);
    assert.equal(E.learnSkill(s, 1), null, 'cannot skip ahead');
    assert.equal(E.learnSkill(s, 0).name, 'Pattern Matching');
    assert.equal(E.derive(s).clickPower, before.clickPower + 1);
    for (let i = 1; i < E.SKILLS.length; i++) E.learnSkill(s, i);
    assert.ok(E.derive(s).pushPower > before.pushPower, 'Analogy and Self-Modeling boost pushes');
    assert.match(E.learnSkill(s, E.SKILLS.length).name, /^Frontier Skill 1$/);
});

test('engine: push strength does not grow with Intelligence (no runaway loop)', () => {
    const s = E.defaultState(NOW);
    const base = E.derive(s).pushPower;
    s.attr.intelligence = 1e6;
    assert.equal(E.derive(s).pushPower, base);
});

test('engine: Self-Improve is gone; Intelligence comes from training and the algorithms', () => {
    assert.equal(E.ACTIONS.some(a => a.id === 'improve'), false);
    assert.equal(E.MILESTONES.some(m => m.key === 'action:improve'), false);
});

test('engine: path progress and XP save; prestige resets the run but keeps lifetime stats', () => {
    const s = E.defaultState(NOW);
    E.finishRoll(s, 0.6, false);
    E.finishRoll(s, 1, true);
    const loaded = E.deserialize(E.serialize(s), NOW);
    assert.equal(loaded.path.learned, 1);
    assert.equal(loaded.res.xp, s.res.xp);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, path: { learned: -2, best: 7 } }, NOW).path.best, 1);
    s.attr.intelligence = 10;
    s.stats.runCp = 1e6;
    const next = E.prestige(s, NOW + 1).state;
    assert.deepEqual([next.path.learned, next.res.xp, next.stats.rolls, next.stats.skillsLearned], [0, 0, 2, 1]);
});

test('engine: the Auto-Trainer needs Faster Chips and a new version, costs Insight, and can be switched off', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false);
    s.levels.fasterIteration = 2;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false, 'still needs a new version');
    s.prestige.count = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), true);
    assert.equal(E.buy(s, 'autoTrainer').ok, false, 'costs Insight');
    s.prestige.points = 3;
    assert.equal(E.buy(s, 'autoTrainer').ok, true);
    assert.equal(E.autoTrainerLevel(s), 1);
    E.setTaskOn(s, 'autoTrainer', false);
    assert.equal(E.autoTrainerLevel(s), 0);
});

test('engine: bonus zones land anywhere on the meter, vary per push, are repeatable, and Prompt Tuning lifts them', () => {
    const zones = [];
    const avg = bias => { let t = 0; for (let seed = 1; seed <= 300; seed++) t += E.bonusZone(seed * 31, 0, 0.12, 0, 0, bias).from; return t / 300; };
    assert.ok(avg(2) > avg(0) + 0.08, 'biased zones sit higher on average');
    for (let seed = 1; seed <= 50; seed++) {
        for (let i = 0; i < 6; i++) {
            const z = E.bonusZone(seed * 7919, i, 0.12);
            assert.ok(z.from >= 0.18 && z.to <= 0.97, `zone ${z.from}-${z.to}`);
            assert.ok(Math.abs(z.to - z.from - 0.12) < 1e-9);
            zones.push(z.from);
        }
    }
    assert.deepEqual(E.bonusZone(42, 3, 0.12), E.bonusZone(42, 3, 0.12));
    assert.ok(new Set(zones.map(z => z.toFixed(2))).size > 20, 'zones move around');
});

test('engine: clean pushes bank flat XP and boost the roll; perfect counts triple; all upgradable', () => {
    const s = E.defaultState(NOW);
    const plain = E.rollXp(s, 0.5, false, 0, 5);
    const clean = E.pushBonusXp(s, 'clean');
    assert.ok(clean > 0 && clean < plain, 'a small flat amount');
    assert.equal(E.pushBonusXp(s, null), 0);
    assert.ok(Math.abs(E.pushBonusXp(s, 'perfect') - 3 * clean) < 1e-9);
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 2, 5) - plain * (1 + 2 * E.PATH.cleanRollBonus)) < 1e-9, 'roll multiplier');

    const zone = E.bonusZone(9, 0, 0.12, 0.03);
    const mid = (zone.from + zone.to) / 2;
    assert.equal(E.zoneHit(zone, mid), 'perfect');
    assert.equal(E.zoneHit(zone, zone.from + 0.001), 'clean');
    assert.equal(E.zoneHit(zone, zone.to + 0.01), null);
    assert.equal(E.zoneHit(E.bonusZone(9, 0, 0.12, 0), mid), 'clean', 'no perfect spot without the upgrade');

    s.levels.benchmarkPrizes = 2;
    s.levels.curatedData = 2;
    s.levels.precisionTuning = 2;
    assert.ok(Math.abs(E.pushBonusXp(s, 'clean') - clean * 1.5) < 1e-9);
    assert.ok(Math.abs(E.derive(s).cleanRollBonus - E.PATH.cleanRollBonus * 1.5) < 1e-9);
    assert.equal(E.derive(s).perfectWidth, 0);
    s.levels.perfectCalibration = 1;
    assert.ok(E.derive(s).perfectWidth > 0);

    const before = s.res.xp;
    E.grantPushBonus(s, 'clean');
    assert.ok(s.res.xp > before, 'banked immediately');
});

test('XP follows the ball: rolling back lowers it, and the payout is where it stops', () => {
    const roll = T.createRoll(0, 5, { pushes: 1, cooldown: 2 });
    roll.push(1.8);
    let peak = 0;
    let end;
    for (let t = 0; t < 30 && !end; t += 1 / 60) {
        peak = Math.max(peak, roll.progress);
        [end] = roll.step(1 / 60);
    }
    assert.ok(end.progress <= peak + 1e-9);
    assert.ok(Math.abs(end.progress - roll.ground.progress(roll.ball.x)) < 1e-9, 'payout uses the resting point');
});


test('a roll can be ended early and reports how far it got', () => {
    const roll = T.createRoll(0, 3, { pushes: 3, cooldown: 0.5 });
    roll.push(1.2);
    for (let t = 0; t < 10 && !roll.atRest; t += 0.05) roll.step(0.05);
    const ev = roll.end();
    assert.equal(ev.type, 'end');
    assert.ok(ev.progress > 0 && ev.progress < 1);
    assert.equal(roll.over, true);
    assert.equal(roll.end(), null, 'only once');
});

test('rollOut: cresting celebrates first, then the ball rolls down the far side and the roll ends crested', () => {
    const roll = T.createRoll(0, 1, { pushes: 1, cooldown: 1, rollOut: true });
    roll.push(20);
    const events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events.push(...roll.step(0.05));
    const crest = events.findIndex(e => e.type === 'crest');
    const end = events.findIndex(e => e.type === 'end');
    assert.ok(crest >= 0 && end > crest, 'crest comes before the end');
    assert.equal(events[end].crested, true);
    assert.equal(events[end].progress, 1);
    assert.ok(roll.ball.x > T.skillHill(0).end, 'it rolled down the far side');
    assert.equal(roll.push(5), false, 'no pushes after the crest');
});

test('without rollOut, cresting still ends the roll at once', () => {
    const roll = T.createRoll(0, 1, { pushes: 1, cooldown: 1 });
    roll.push(20);
    let events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(events.at(-1).type, 'crest');
    assert.ok(roll.ball.x < T.skillHill(0).end);
});

test('hillScale lowers the rolling hills but never the skill hill', () => {
    const a = T.terrain(1, 42);
    const b = T.terrain(1, 42, 0.8);
    const roll = t => t.bumps.filter(x => x.skill === null);
    roll(a).forEach((h, i) => assert.ok(Math.abs(roll(b)[i].height - h.height * 0.8) < 1e-12));
    assert.equal(b.goal.height, a.goal.height);
});

test('the start is flat, and rolling back to the start line ends the run', () => {
    for (const k of [0, 2]) {
        const g = T.terrain(k, 3);
        assert.equal(g.height(g.start - 1), 0, 'nothing behind the start');
        assert.equal(g.height(g.start), 0);
    }
    const roll = T.createRoll(1, 5, { pushes: 2, cooldown: 0 });
    roll.push(0.01);
    roll.ball.v = -1.5;
    roll.ball.maxX = roll.ball.x + 3;   // it had got 3 m out before rolling back
    let events = [];
    for (let i = 0; i < 200 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(roll.over, true, 'the run ended');
    assert.equal(events.at(-1).rolledBack, true);
    assert.ok(Math.abs(events.at(-1).metres - 1.5) < 1e-9, 'half the furthest distance still pays');
    assert.equal(events.at(-1).progress, 0);
});

test('legs: a roll from a cleared leg runs on through every later skill hill to the last', () => {
    // A single-leg roll is unchanged by the leg support.
    const one = T.terrain(2, 77);
    const same = T.terrain(2, 77, 1, 2);
    assert.deepEqual(one.bumps, same.bumps);
    // From leg 0 to leg 2: three skill hills, the first two cleared on the way.
    const g = T.terrain(0, 77, 1, 2);
    assert.deepEqual(g.bumps.filter(b => b.skill !== null).map(b => b.skill), [0, 1, 2]);
    assert.equal(g.goal.skill, 2);
    assert.equal(g.legAt(g.start + 1), 0);
    assert.equal(g.legAt(T.skillHill(0).peak + 0.5), 1);
    assert.equal(g.legAt(T.skillHill(2).end + 5), 2);
    assert.equal(g.progressIn(1, T.skillHill(1).peak), 1);
    assert.equal(g.progress(T.checkpoint(1) + 0.2), 0, 'progress restarts on each leg');

    // A strong ball pushed whenever it can: clears legs 0 and 1 in order, then crests leg 2.
    const roll = T.createRoll(0, 77, { pushes: 40, cooldown: 0.3, last: 2, rollOut: true });
    const events = [];
    for (let t = 0; t < 400 && !roll.over; t += 1 / 60) {
        if (roll.ball.cooldown === 0 && roll.pushesLeft > 0 && (!roll.launched || roll.ball.v < 3)) roll.push(9);
        events.push(...roll.step(1 / 60));
    }
    assert.deepEqual(events.map(e => e.type + (e.skill ?? '')), ['clear0', 'clear1', 'crest2', 'end2']);
    assert.equal(events.at(-1).leg, 2);

    // A weak one stops part-way along leg 0 and reports that leg.
    const weak = T.createRoll(0, 77, { pushes: 1, cooldown: 1, last: 2 });
    weak.push(2);
    let end = null;
    for (let t = 0; t < 120 && !end; t += 1 / 60) end = weak.step(1 / 60).find(e => e.type === 'end') || null;
    assert.equal(end.leg, 0);
    assert.ok(end.progress > 0 && end.progress < 1);
});

test('free pushes (a crunch) work with no pushes left and barely wait; holdOpen keeps a resting roll going', () => {
    let open = true;
    const roll = T.createRoll(0, 5, { pushes: 1, cooldown: 2, holdOpen: () => open });
    assert.equal(roll.push(1), true);
    assert.equal(roll.pushesLeft, 0);
    for (let i = 0; i < 400; i++) roll.step(1 / 60);
    assert.equal(roll.over, false, 'held open while resting');
    assert.equal(roll.push(1), false, 'no normal push left');
    assert.equal(roll.push(1, true), true, 'a free one works');
    assert.ok(roll.ball.cooldown <= 0.35);
    assert.equal(roll.pushesLeft, 0);
    open = false;
    for (let i = 0; i < 2000 && !roll.over; i++) roll.step(1 / 60);
    assert.equal(roll.over, true, 'ends once no longer held');
});

test('power-ups: a flow coasts over hills, a smash flattens the hills ahead, a boost ignores the cooldown', () => {
    const opts = { pushes: 1, cooldown: 2, rollOut: true };
    const plain = T.createRoll(0, 11, opts);
    plain.push(2);
    for (let i = 0; i < 2400 && !plain.over; i++) plain.step(1 / 60);
    const flowing = T.createRoll(0, 11, opts);
    flowing.push(2);
    flowing.coast(3, 3);
    assert.ok(flowing.flowing > 0);
    const run = (roll, sec) => { for (let i = 0; i < sec * 60; i++) roll.step(1 / 60); };
    const x0 = flowing.ball.x;
    run(flowing, 1);
    assert.ok(flowing.ball.x - x0 >= 2.9, 'holds its speed over the hills');
    for (let i = 0; i < 2400 && !flowing.over; i++) flowing.step(1 / 60);
    assert.ok(flowing.ball.maxX > plain.ball.maxX, 'and gets further');

    const smashed = T.createRoll(0, 11, opts);
    const ahead = smashed.smash(5);
    assert.ok(ahead.length > 0 && ahead.every(b => b.skill === null), 'only rolling hills break');
    run(smashed, 2);
    assert.ok(ahead.every(b => b.height < 1e-3), 'they settle flat');
    assert.ok(smashed.ground.goal.height > 0, 'the skill hill stands');

    const shrunk = T.createRoll(0, 11, opts);
    shrunk.push(1);
    shrunk.coast(2, 3, 0.25);
    run(shrunk, 2);
    const low = shrunk.ground.bumps.filter(b => b.base != null);
    assert.ok(low.length > 0 && low.every(b => b.target <= b.base * 0.25 + 1e-9), 'a super flow shrinks the hills it passes');
    assert.ok(low.filter(b => b.peak < shrunk.ball.x - 3).every(b => b.height <= b.base * 0.26), 'and they settle low');

    const banked = T.createRoll(0, 11, opts);
    banked.push(1);
    assert.equal(banked.push(1, true), false, 'cooling down');
    const v = banked.ball.v;
    assert.equal(banked.boost(2), true);
    assert.ok(banked.ball.v > v);
    assert.equal(banked.pushesLeft, 0);
});
