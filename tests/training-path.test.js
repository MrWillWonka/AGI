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
    s.res.dp = 10;
    assert.equal(E.payPush(s, 1), false, 'locked until the milestone');
    s.stats.runCp = 50;
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

    assert.ok(E.rollXp(s, 0.8, false) > 2 * E.rollXp(s, 0.4, false), 'further is worth disproportionately more');
    assert.equal(E.rollXp(s, 1, true), E.rollXp(s, 1, false) * E.PATH.crestBonus);

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
    assert.equal(E.buy(s, 'trainingEpochs').ok, false, 'needs XP');
    s.res.xp = 1000;
    for (const id of ['trainingEpochs', 'fasterIteration', 'trainingOptimizer']) {
        assert.equal(E.buy(s, id).ok, true, id);
        E.evaluate(s);   // buying a node opens the ones that grow from it
    }
    const d = E.derive(s);
    assert.equal(d.pushesPerRoll, 2);
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

test('engine: Self-Improve gets pricier with each use in a run', () => {
    const s = E.defaultState(NOW);
    s.unlocked['action:improve'] = true;
    s.res = { cp: 1e6, dp: 1e6, rp: 1e6, xp: 0 };
    const improve = E.ACTIONS.find(a => a.id === 'improve');
    const first = E.actionCost(s, improve);
    E.act(s, 'improve');
    E.act(s, 'improve');
    assert.equal(E.actionCost(s, improve).cp, Math.ceil(first.cp * 1.25 * 1.25));
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

test('engine: the Auto-Trainer needs Scouting Data and a Transcend', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false);
    s.levels.scoutingData = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false, 'still needs a Transcend');
    s.prestige.count = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), true);
});

test('engine: bonus zones sit below the top of the meter, vary per push, and are repeatable', () => {
    const zones = [];
    for (let seed = 1; seed <= 50; seed++) {
        for (let i = 0; i < 6; i++) {
            const z = E.bonusZone(seed * 7919, i, 0.12);
            assert.ok(z.from >= 0.43 && z.to <= 0.92, `zone ${z.from}-${z.to}`);
            assert.ok(Math.abs(z.to - z.from - 0.12) < 1e-9);
            zones.push(z.from);
        }
    }
    assert.deepEqual(E.bonusZone(42, 3, 0.12), E.bonusZone(42, 3, 0.12));
    assert.ok(new Set(zones.map(z => z.toFixed(2))).size > 20, 'zones move around');
});

test('engine: clean pushes bank flat XP and boost the roll; perfect counts triple; all upgradable', () => {
    const s = E.defaultState(NOW);
    const plain = E.rollXp(s, 0.5, false, 0);
    const clean = E.pushBonusXp(s, 'clean');
    assert.ok(clean > 0 && clean < plain, 'a small flat amount');
    assert.equal(E.pushBonusXp(s, null), 0);
    assert.ok(Math.abs(E.pushBonusXp(s, 'perfect') - 3 * clean) < 1e-9);
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 2) - plain * (1 + 2 * E.PATH.cleanRollBonus)) < 1e-9, 'roll multiplier');

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
    assert.ok(Math.abs(E.derive(s).zoneWidth - E.PATH.zoneWidth * 1.5) < 1e-9);
    assert.equal(E.derive(s).perfectWidth, 0);
    s.levels.perfectCalibration = 1;
    assert.ok(E.derive(s).perfectWidth > 0);

    const before = s.res.xp;
    E.grantPushBonus(s, 'clean');
    assert.ok(s.res.xp > before, 'banked immediately');
});

test('engine: GPU Cluster slows the meter sweep, up to a cap', () => {
    const s = E.defaultState(NOW);
    assert.equal(E.derive(s).sweepScale, 1);
    s.levels.trainingOptimizer = 5;
    assert.ok(E.derive(s).sweepScale > 1.2);
    s.levels.trainingOptimizer = 50;
    assert.equal(E.derive(s).sweepScale, 1.7);
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
