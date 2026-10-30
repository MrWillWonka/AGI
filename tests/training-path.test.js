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
    const weak = crestRate(1, 1.8, { pushes: 1, cooldown: 2 }, launchOnly);
    assert.equal(weak.crests, 0, 'one launch never reaches the first skill hill');
    assert.ok(weak.progress > 0.03 && weak.progress < 0.5, `launch-only progress ${weak.progress}`);
    const strong = crestRate(1, 2.5, { pushes: 6, cooldown: 0.8 }, rescue);
    assert.ok(strong.progress > weak.progress * 2, `upgraded runs go further (${strong.progress} vs ${weak.progress})`);
});

test('saving pushes for stalls beats firing them all at once', () => {
    const opts = { pushes: 4, cooldown: 0.6 };
    for (const k of [1, 3]) {
        const smart = crestRate(k, 2.5, opts, rescue);
        const dumb = crestRate(k, 2.5, opts, blind);
        // Score: how often the skill hill is cleared, plus average distance.
        const score = r => r.crests + r.progress;
        // Relative, so it holds however long the stretch is: saving pushes must go clearly further.
        assert.ok(score(smart) > score(dumb) * 1.3, `stretch ${k}: ${JSON.stringify(smart)} vs ${JSON.stringify(dumb)}`);
    }
});

test('upgrades that cut friction let the same push roll further', () => {
    const normal = crestRate(2, 2, { pushes: 1, cooldown: 2 }, launchOnly);
    const slick = crestRate(2, 2, { pushes: 1, cooldown: 2, friction: 0.6, slopeDrag: 0.5 }, launchOnly);
    assert.ok(slick.progress > normal.progress, `${slick.progress} vs ${normal.progress}`);
});

test('pushing against a backward roll is wasted energy', () => {
    const roll = T.createRoll(1, 1, { pushes: 3, cooldown: 0 });
    roll.ball.v = -2;
    roll.push(1.5);
    assert.ok(roll.ball.v < 0 && roll.ball.v > -2, 'it only slows the ball');
});

test('pushes are limited per roll and have a cooldown', () => {
    const roll = T.createRoll(1, 1, { pushes: 2, cooldown: 1 });
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
    assert.equal(E.pushCost(s, 1).cp, E.PATH.pushCost.cp, 'Pattern Matching\'s leg costs what the warm-up did');
    E.learnSkill(s, 1);
    assert.ok(E.pushCost(s, 1).cp > E.PATH.pushCost.cp, 'pushes cost more further along');
});

test('engine: training upgrades are bought with XP and change the roll setup', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    const base = E.derive(s);
    assert.equal(base.pushesPerRoll, 2, 'the launch and one more at first');
    assert.equal(base.pushCooldown, E.PATH.baseCooldown);
    assert.equal(E.buy(s, 'initialWeights').ok, false, 'needs XP');
    s.res.xp = 1000;
    for (const id of ['initialWeights', 'trainingEpochs', 'fasterIteration', 'trainingOptimizer']) {
        assert.equal(E.buy(s, id).ok, true, id);
        E.evaluate(s);   // buying a node opens the ones that grow from it
        if (id === 'trainingEpochs') {
            assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.fasterIteration), true, 'shows after Investor Funding\'s first level');
            assert.equal(E.buy(s, id).ok, true);
            E.evaluate(s);
        }
    }
    const d = E.derive(s);
    assert.equal(d.pushesPerRoll, 4, "two to start + two levels of Investor Funding");
    assert.ok(d.pushCooldown < base.pushCooldown);
    assert.ok(d.pushPower > base.pushPower);
    s.levels.fasterIteration = 12;
    assert.equal(E.derive(s).pushCooldown, E.PATH.minCooldown);
});

test('engine: skills grant attributes and permanent bonuses, in order only', () => {
    const s = E.defaultState(NOW);
    const before = E.derive(s);
    assert.equal(E.learnSkill(s, 1), null, 'cannot skip ahead');
    assert.equal(E.learnSkill(s, 0).name, 'Tokenization', 'the warm-up hill');
    assert.deepEqual(s.attr, before && E.defaultState(NOW).attr, 'it grants no attributes');
    assert.equal(E.learnSkill(s, 1).name, 'Pattern Matching');
    assert.equal(E.derive(s).clickPower, before.clickPower + 1);
    for (let i = 2; i < E.SKILLS.length; i++) E.learnSkill(s, i);
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
    s.path.learned = 5;
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
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 2 });
    roll.push(1.8);
    let peak = 0;
    let end;
    for (let t = 0; t < 30 && !end; t += 1 / 60) {
        [end] = roll.step(1 / 60);
        peak = Math.max(peak, roll.ground.progress(roll.ball.maxX));
    }
    assert.ok(end.progress <= peak + 1e-9);
    assert.ok(Math.abs(end.progress - roll.ground.progress(roll.ball.x)) < 1e-9, 'payout uses the resting point');
});


test('a roll can be ended early and reports how far it got', () => {
    const roll = T.createRoll(1, 3, { pushes: 3, cooldown: 0.5 });
    roll.push(1.2);
    for (let t = 0; t < 10 && !roll.atRest; t += 0.05) roll.step(0.05);
    const ev = roll.end();
    assert.equal(ev.type, 'end');
    assert.ok(ev.progress > 0 && ev.progress < 1);
    assert.equal(roll.over, true);
    assert.equal(roll.end(), null, 'only once');
});

test('rollOut: cresting celebrates first, then the ball rolls down the far side and the roll ends crested', () => {
    const roll = T.createRoll(1, 1, { pushes: 1, cooldown: 1, rollOut: true });
    roll.push(20);
    const events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events.push(...roll.step(0.05));
    const crest = events.findIndex(e => e.type === 'crest');
    const end = events.findIndex(e => e.type === 'end');
    assert.ok(crest >= 0 && end > crest, 'crest comes before the end');
    assert.equal(events[end].crested, true);
    assert.equal(events[end].progress, 1);
    assert.ok(roll.ball.x > T.skillHill(1).end, 'it rolled down the far side');
    assert.equal(roll.push(5), false, 'no pushes after the crest');
});

test('without rollOut, cresting still ends the roll at once', () => {
    const roll = T.createRoll(1, 1, { pushes: 1, cooldown: 1 });
    roll.push(20);
    let events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(events.at(-1).type, 'crest');
    assert.ok(roll.ball.x < T.skillHill(1).end);
});

test('hillScale lowers the rolling hills but never the skill hill', () => {
    const a = T.terrain(1, 42);
    const b = T.terrain(1, 42, 0.8);
    const roll = t => t.bumps.filter(x => x.skill === null);
    roll(a).forEach((h, i) => assert.ok(Math.abs(roll(b)[i].height - h.height * 0.8) < 1e-12));
    assert.equal(b.goal.height, a.goal.height);
});

test('with sprints left, the start line bounces the ball back instead of ending the run', () => {
    const roll = T.createRoll(1, 5, { pushes: 3, cooldown: 0 });
    roll.push(0.01);
    roll.ball.v = -1.5;
    let events = [];
    for (let i = 0; i < 40 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(roll.over, false, 'the run goes on');
    assert.ok(events.some(e => e.type === 'bump'));
    assert.ok(roll.ball.x >= roll.ground.start - 0.2);
});

test('the start is flat, and rolling back to the start line with no sprints left ends the run', () => {
    for (const k of [1, 3]) {
        const g = T.terrain(k, 3);
        assert.equal(g.height(g.start - 1), 0, 'nothing behind the start');
        assert.equal(g.height(g.start), 0);
    }
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 0 });
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
    const one = T.terrain(3, 77);
    const same = T.terrain(3, 77, 1, 3);
    assert.deepEqual(one.bumps, same.bumps);
    // From leg 1 to leg 3: three skill hills, the first two cleared on the way.
    const g = T.terrain(1, 77, 1, 3);
    assert.deepEqual(g.bumps.filter(b => b.skill !== null).map(b => b.skill), [1, 2, 3]);
    assert.equal(g.goal.skill, 3);
    assert.equal(g.legAt(g.start + 1), 1);
    assert.equal(g.legAt(T.skillHill(1).peak + 0.5), 2);
    assert.equal(g.legAt(T.skillHill(3).end + 5), 3);
    assert.equal(g.progressIn(2, T.skillHill(2).peak), 1);
    assert.equal(g.progress(T.checkpoint(2) + 0.2), 0, 'progress restarts on each leg');

    // A strong ball pushed whenever it can: clears legs 1 and 2 in order, then crests leg 3.
    const roll = T.createRoll(1, 77, { pushes: 40, cooldown: 0.3, last: 3, rollOut: true });
    const events = [];
    for (let t = 0; t < 400 && !roll.over; t += 1 / 60) {
        if (roll.ball.cooldown === 0 && roll.pushesLeft > 0 && (!roll.launched || roll.ball.v < 3)) roll.push(9);
        events.push(...roll.step(1 / 60));
    }
    assert.deepEqual(events.map(e => e.type + (e.skill ?? '')), ['clear1', 'clear2', 'crest3', 'end3']);
    assert.equal(events.at(-1).leg, 3);

    // A weak one stops part-way along leg 1 and reports that leg.
    const weak = T.createRoll(1, 77, { pushes: 1, cooldown: 1, last: 3 });
    weak.push(2);
    let end = null;
    for (let t = 0; t < 120 && !end; t += 1 / 60) end = weak.step(1 / 60).find(e => e.type === 'end') || null;
    assert.equal(end.leg, 1);
    assert.ok(end.progress > 0 && end.progress < 1);
});

test('free pushes (a crunch) work with no pushes left and barely wait; holdOpen keeps a resting roll going', () => {
    let open = true;
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 2, holdOpen: () => open });
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
    const plain = T.createRoll(1, 11, opts);
    plain.push(2);
    for (let i = 0; i < 2400 && !plain.over; i++) plain.step(1 / 60);
    const flowing = T.createRoll(1, 11, opts);
    flowing.push(2);
    flowing.coast(3, 3);
    assert.ok(flowing.flowing > 0);
    const run = (roll, sec) => { for (let i = 0; i < sec * 60; i++) roll.step(1 / 60); };
    const x0 = flowing.ball.x;
    run(flowing, 1);
    assert.ok(flowing.ball.x - x0 >= 2.9, 'holds its speed over the hills');
    for (let i = 0; i < 2400 && !flowing.over; i++) flowing.step(1 / 60);
    assert.ok(flowing.ball.maxX > plain.ball.maxX, 'and gets further');

    const smashed = T.createRoll(1, 11, opts);
    const ahead = smashed.smash(5);
    assert.ok(ahead.length > 0 && ahead.every(b => b.skill === null), 'only rolling hills break');
    run(smashed, 2);
    assert.ok(ahead.every(b => b.height < 1e-3), 'they settle flat');
    assert.ok(smashed.ground.goal.height > 0, 'the skill hill stands');

    const shrunk = T.createRoll(1, 11, opts);
    shrunk.push(1);
    shrunk.coast(2, 3, 0.25);
    run(shrunk, 2);
    const low = shrunk.ground.bumps.filter(b => b.base != null);
    assert.ok(low.length > 0 && low.every(b => b.target <= b.base * 0.25 + 1e-9), 'a super flow shrinks the hills it passes');
    assert.ok(low.filter(b => b.peak < shrunk.ball.x - 3).every(b => b.height <= b.base * 0.26), 'and they settle low');

    const banked = T.createRoll(1, 11, opts);
    banked.push(1);
    assert.equal(banked.push(1, true), false, 'cooling down');
    const v = banked.ball.v;
    assert.equal(banked.boost(2), true);
    assert.ok(banked.ball.v > v);
    assert.equal(banked.pushesLeft, 0);
});

test('onward: cresting the last skill hill emits crest once and the ball rolls on into an extended leg', () => {
    const roll = T.createRoll(1, 3, { pushes: 1, cooldown: 1, onward: true });
    const g = roll.ground;
    roll.push(0.001);
    Object.assign(roll.ball, { x: g.goal.peak - 0.01, v: 3, maxX: g.goal.peak - 0.01 });
    const crests = [];
    for (let i = 0; i < 40 && !roll.over; i++) {
        for (const e of roll.step(0.05)) {
            if (e.type === 'crest') { crests.push(e); roll.extend(); }
            assert.notEqual(e.type, 'clear', 'the crested hill is not cleared again after extending');
        }
    }
    assert.equal(crests.length, 1);
    assert.equal(crests[0].onward, true);
    assert.equal(g.last, 2, 'the next leg was laid');
    assert.equal(g.goal.skill, 2);
    assert.ok(roll.ball.x > T.skillHill(1).peak && !roll.crested, 'still rolling past the old hill');
});

test('act one is many small hills; act two (from General AI) a few giant swells, many times wider', () => {
    const before = T.rollingHills(T.LATE_LEG - 1, 9);
    assert.ok(before.length > 30);
    const widest = Math.max(...before.map(h => 2 * h.halfWidth));
    for (const k of [T.LATE_LEG, T.LATE_LEG + 4]) {
        const late = T.rollingHills(k, 9);
        assert.ok(late.length >= 4 && late.length <= 8, `${late.length}`);
        for (const h of late) assert.ok(2 * h.halfWidth > 4 * widest && h.height < 0.7 * T.skillHeight(k));
    }
    // The engine's copy of the boundary, and General AI arriving exactly with it on skills alone.
    assert.equal(E.ACT_TWO_LEG, T.LATE_LEG);
    const s = E.defaultState(NOW);
    s.attr.intelligence = 1 + 2 + 2 + 3;   // every algorithm's Intelligence
    for (let i = 0; i < T.LATE_LEG - 1; i++) E.learnSkill(s, i);
    assert.equal(E.phaseIndex(s), 0, 'not a skill sooner, whatever research bought');
    s.attr.intelligence -= 8;
    E.learnSkill(s, T.LATE_LEG - 1);
    assert.equal(E.phaseIndex(s), 1, 'General AI with the skill that opens act two');
});

test('late legs: a fast ball flies off a crest, lands, bounces and rolls on; early legs never launch', () => {
    const fly = k => {
        const roll = T.createRoll(k, 4, { pushes: 1, cooldown: 1 });
        const hill = roll.ground.bumps.find(b => b.skill === null && b.peak > roll.ground.start + 1);
        roll.push(0.001);
        Object.assign(roll.ball, { x: hill.peak - 0.05 * hill.halfWidth, v: 40, maxX: hill.peak });
        const seen = [];
        for (let i = 0; i < 400 && !roll.over; i++) for (const e of roll.step(0.02)) seen.push(e.type);
        return seen;
    };
    const late = fly(T.LATE_LEG);
    assert.ok(late.includes('launch'), 'takes off');
    assert.ok(late.includes('land'), 'lands');
    const early = fly(3);
    assert.ok(!early.includes('launch'));
});

test('a super flow condenses time: the ball covers warp times the ground', () => {
    const run = warp => {
        const roll = T.createRoll(2, 21, { pushes: 2, cooldown: 0.1 });
        roll.push(2);
        const x0 = roll.ball.x;
        roll.coast(2, 1, 0, 1, warp);
        for (let i = 0; i < 40; i++) roll.step(0.05);
        return roll.ball.x - x0;
    };
    const plain = run(1);
    const dream = run(4);
    assert.ok(dream > 3 * plain, `${dream} vs ${plain}`);
});

test('a flight is capped in height, comes back within seconds and settles onto the line without bouncing', () => {
    // A huge upward boost at a fast speed, in scale with the leg.
    for (const k of [T.LATE_LEG, T.LATE_LEG + 4]) {
        const roll = T.createRoll(k, 5, { pushes: 3, cooldown: 0.1 });
        roll.push(0.001);
        const x = roll.ground.start + 0.2 * (T.skillHill(k).start - roll.ground.start);
        const y0 = roll.ground.height(x);
        Object.assign(roll.ball, { x, v: 3.5 * Math.sqrt(9.8 * T.skillHeight(k)), maxX: x, air: { y: y0, vy: 200, peak: y0, from: x, ceil: y0 + T.maxAbove(k) } });
        let t = 0;
        let top = y0;
        const lands = [];
        while (roll.airborne && t < 20) {
            for (const e of roll.step(0.05)) if (e.type === 'land') lands.push(e);
            top = Math.max(top, roll.height);
            t += 0.05;
        }
        assert.ok(top <= y0 + T.maxAbove(k) + 0.01, `top ${top}`);
        assert.ok(t < 4, `aloft ${t.toFixed(1)} s`);
        assert.equal(lands.filter(e => e.bounce).length, 0, `leg ${k}: eases onto the slope, no bounce`);
    }
});

test('flights come down on the nearest down-slope, never on a face', () => {
    let flights = 0;
    let down = 0;
    // Speeds in scale with the leg (its skill hill's height): a fast, a faster and a very fast ball.
    for (let seed = 1; seed <= 40; seed++) for (const f of [1.5, 2.5, 3.5]) {
        const k = T.LATE_LEG + (seed % 3) * 2;
        const roll = T.createRoll(k, seed * 17, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = f * Math.sqrt(9.8 * T.skillHeight(k));
        for (let t = 0; t < 20 && !roll.over && !roll.atRest; t += 0.05) {
            for (const e of roll.step(0.05)) {
                if (e.type !== 'land' || e.flight <= 3) continue;
                flights++;
                const s = roll.ground.slope(e.x);
                assert.ok(s < 0.03, `landed on a face (slope ${s.toFixed(2)})`);
                assert.ok(!e.bounce, 'no bounce');
                if (s < -0.04) down++;
            }
        }
    }
    // The rest come down on a valley floor (a kicker's steep launch can't always bend onto a down-slope).
    assert.ok(flights > 10 && down >= 0.8 * flights, `${down}/${flights} on down-slopes`);
});

test('the warm-up hill: a good sprint or two medium ones crest it on a first run; weak taps fall short', () => {
    const run = charges => {
        const roll = T.createRoll(0, 1, { pushes: charges.length, cooldown: 2, onward: true });
        roll.push(1.4 * charges[0]);
        let i = 1;
        for (let t = 0; t < 30 && !roll.over; t += 0.05) {
            if (i < charges.length && roll.ball.cooldown === 0 && roll.ball.v < 0.4) roll.push(1.4 * charges[i++]);
            if (roll.step(0.05).some(e => e.type === 'crest')) return true;
        }
        return false;
    };
    assert.equal(run([0.6, 0.7]), true);
    assert.equal(run([1, 1]), true);
    assert.equal(run([1]), true, 'one full sprint');
    assert.equal(run([0.4, 0.4]), false, 'it still takes a real effort');
    assert.deepEqual(T.rollingHills(0, 5), [], 'nothing in the way');
});

test('act two: most swells are kickers whose face steepens to a lip, so crests launch with real upward speed', () => {
    let kickers = 0;
    let swells = 0;
    for (let seed = 1; seed <= 30; seed++) {
        for (const b of T.rollingHills(T.LATE_LEG + (seed % 4), seed)) {
            swells++;
            if (!b.up || b.up === 1) continue;
            kickers++;
            const lip = T.bumpSlope(b, b.peak - 1e-6);
            assert.ok(lip >= T.KICK_SLOPE[0] * 0.999 || b.up * b.halfWidth <= 0.4 * b.halfWidth + 1e-9 || lip > 0.3, `lip slope ${lip}`);
            assert.ok(Math.abs(T.bumpAt(b, b.peak) - b.height) < 1e-9 && T.bumpAt(b, b.start) < 1e-9, 'the face runs from the floor to the lip');
            assert.ok(b.end - b.start <= (T.checkpoint(T.LATE_LEG + 1) - T.checkpoint(T.LATE_LEG)), 'fits its pitch');
        }
    }
    assert.ok(kickers / swells > 0.7, `${kickers}/${swells} kickers`);
    // A fast ball leaves a lip climbing.
    let climbs = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = 2.5 * Math.sqrt(9.8 * T.skillHeight(T.LATE_LEG));
        for (let t = 0; t < 10 && !roll.over; t += 0.05) {
            if (roll.step(0.05).some(e => e.type === 'launch') && roll.ball.air?.vy > 0.3 * roll.ball.v) climbs++;
        }
    }
    assert.ok(climbs >= 10, `${climbs} launches climbing off a lip`);
});

test('terrain features: their own random stream (the hills are unchanged), strips push, flights take tokens', () => {
    const a = T.terrain(T.LATE_LEG, 11);
    assert.deepEqual(a.bumps.filter(b => b.skill === null).map(b => b.peak), T.rollingHills(T.LATE_LEG, 11).map(b => b.peak));
    let tokens = 0;
    let strips = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const g = T.terrain(T.LATE_LEG + (seed % 3), seed);
        tokens += g.tokens.length;
        strips += g.strips.length;
        for (const tk of g.tokens) assert.ok(tk.y > 0);
    }
    assert.ok(tokens > 20 && strips > 5, `${tokens} tokens, ${strips} strips`);
    assert.equal(T.terrain(0, 3).tokens.length + T.terrain(0, 3).strips.length, 0, 'the warm-up stays bare');
    // A strip speeds a ball rolling over it.
    const over = keep => {
        for (let seed = 1; seed <= 40; seed++) {
            const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 1, cooldown: 1 });
            const st = roll.ground.strips[0];
            if (!st) continue;
            if (!keep) roll.ground.strips.length = 0;
            roll.push(0.001);
            roll.ball.x = st.from + 0.01;
            roll.ball.v = 0.8;
            roll.step(0.2);
            return roll.ball.v;
        }
        return null;
    };
    assert.ok(over(true) > over(false));
    let taken = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = 2.5 * Math.sqrt(9.8 * T.skillHeight(T.LATE_LEG));
        for (let t = 0; t < 12 && !roll.over; t += 0.05) taken += roll.step(0.05).filter(e => e.type === 'token').length;
    }
    assert.ok(taken > 0, 'fast flights take tokens');
});

test('the tuck: held on act two, the ball gains on the way down and loses on the way up', () => {
    const run = (tuck, from) => {
        const roll = T.createRoll(T.LATE_LEG, 5, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        const b = roll.ground.bumps.find(h => h.skill === null && h.up && h.up !== 1 && h.peak > roll.ground.start + 5);
        roll.ball.x = from === 'back' ? b.peak + 0.1 * b.halfWidth : b.start + 0.05 * b.halfWidth * b.up;
        roll.ball.v = from === 'back' ? 1 : 8;
        roll.tuck = tuck;
        roll.step(0.25);
        return roll.ball.v;
    };
    assert.ok(run(true, 'back') > run(false, 'back'), 'faster down the back');
    assert.ok(run(true, 'face') < run(false, 'face'), 'slower up the face');
    // Act one ignores it.
    const one = tuck => { const r = T.createRoll(2, 3, { pushes: 1, cooldown: 1 }); r.push(1); r.tuck = tuck; for (let i = 0; i < 20; i++) r.step(0.05); return r.ball.x; };
    assert.equal(one(true), one(false));
});

test('a stuck ball swings freely on the slopes and is only braked near the floor of its dip', () => {
    // Rolling back down a slope it can't climb, it speeds up like any falling ball. (It used to be braked on
    // the slopes too, as if through syrup: these seeds gained speed on 0-5% of their downhill steps.)
    for (const seed of [4, 7, 9, 15, 33, 34]) {
        const roll = T.createRoll(1 + seed % 5, seed, { pushes: 1, cooldown: 1 });
        roll.push(1.4 + (seed % 5) * 0.3);
        let downhill = 0, gaining = 0;
        for (let i = 0; i < 3600 && !roll.over; i++) {
            const before = Math.abs(roll.ball.v);
            const slope = roll.ground.slope(roll.ball.x);
            roll.step(1 / 60);
            if (!roll.trapped || Math.abs(slope) <= 0.08) continue;
            if (Math.sign(-slope) === Math.sign(roll.ball.v)) {
                downhill++;
                if (Math.abs(roll.ball.v) > before) gaining++;
            }
        }
        assert.ok(roll.over, `seed ${seed}: it still comes to rest`);
        assert.ok(gaining >= 0.6 * downhill, `seed ${seed}: gained speed on ${gaining}/${downhill} downhill steps`);
    }
});

test('a spent ball sloshing over a boost strip still ends its run (it used to never end)', () => {
    const roll = T.createRoll(2, 1148255, { pushes: 1, cooldown: 1, friction: 0.75, hillScale: 0.8, onward: true, last: 2 });
    roll.push(2.4);
    for (let t = 0; t < 120 && !roll.over; t += 0.05) roll.step(0.05);
    assert.equal(roll.over, true);
});

test('an air dive (tucked in flight) comes down sooner, on a down-slope, and keeps its speed', () => {
    let tried = 0, sooner = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const fling = tuck => {
            const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 0, cooldown: 1, onward: true, last: T.LATE_LEG });
            for (let i = 0; i < 40; i++) roll.step(1 / 60);   // settle on the line
            roll.fly(9, 6);
            let land = null;
            for (let i = 0; i < 1200 && !land; i++) {
                if (i === 12) roll.tuck = tuck;
                land = roll.step(1 / 60).find(e => e.type === 'land');
            }
            return { land, v: roll.ball.v };
        };
        const a = fling(false);
        const b = fling(true);
        if (!a.land || !b.land) continue;
        tried++;
        assert.ok(b.land.x <= a.land.x + 0.5, `seed ${seed}: dived at ${b.land.x.toFixed(2)}, glided to ${a.land.x.toFixed(2)}`);
        if (b.land.x < a.land.x - 0.5) sooner++;
        if (b.land.dive) {
            assert.equal(b.land.bounce, false, 'an air dive sticks');
            assert.ok(b.v > 0, 'and rolls on forward');
        }
    }
    assert.ok(tried >= 6 && sooner >= tried / 3, `${sooner}/${tried} came down sooner`);
});

test('tucked, the ball takes tokens from further away', () => {
    assert.ok(T.TOKEN_PULL > 1);
    assert.ok(T.AIR_DIVE > 1 && T.AIR_DIVE < 1.15);
});
