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

test('with only a launch, the first skill hill is a wall; upgrades break through it', () => {
    const weak = crestRate(0, 1.8, { pushes: 1, cooldown: 2 }, launchOnly);
    assert.equal(weak.crests, 0, 'base launch cannot crest the first skill hill');
    assert.ok(weak.progress > 0.2, 'but it earns distance');
    // One Investor Funding plus a couple of GPU Cluster upgrades.
    const strong = crestRate(0, 2.2, { pushes: 2, cooldown: 1.5 }, rescue);
    assert.ok(strong.crests > 0.8, `upgraded rolls get over it (${strong.crests})`);
});

test('saving pushes for stalls beats firing them all at once', () => {
    const opts = { pushes: 3, cooldown: 0.6 };
    for (const k of [2, 4]) {
        const strength = 2.5 * Math.pow(1.1, k - 2); // what upgrades would give by this stretch
        const smart = crestRate(k, strength, opts, rescue);
        const dumb = crestRate(k, strength, opts, blind);
        assert.ok(smart.crests > dumb.crests + 0.3, `stretch ${k}: ${smart.crests} vs ${dumb.crests}`);
    }
});

test('a ball stuck in a dip settles quickly instead of sloshing', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const roll = T.createRoll(1, seed, { pushes: 1, cooldown: 2 });
        roll.push(1.8);
        let t = 0;
        let lastProgress = 0;
        let stuckFor = 0;
        while (!roll.over && t < 60) {
            roll.step(1 / 60);
            t += 1 / 60;
            stuckFor = roll.ball.maxX > lastProgress + 0.01 ? 0 : stuckFor + 1 / 60;
            lastProgress = Math.max(lastProgress, roll.ball.maxX);
        }
        assert.ok(roll.over && stuckFor < 6, `seed ${seed}: sloshed for ${stuckFor.toFixed(1)}s after its last progress`);
    }
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

test('engine: launching costs CP and DP; XP rewards distance, records and crests', () => {
    const s = E.defaultState(NOW);
    s.res.cp = 100;
    s.res.dp = 10;
    assert.equal(E.payRoll(s), false, 'locked until the milestone');
    s.stats.runCp = 50;
    E.evaluate(s);
    assert.equal(E.payRoll(s), true);
    assert.equal(s.res.cp, 100 - E.rollCost(s).cp);

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
    assert.ok(E.rollCost(s).cp > 10, 'rolls cost more further along');
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
    for (const id of ['trainingEpochs', 'fasterIteration', 'trainingOptimizer']) assert.equal(E.buy(s, id).ok, true, id);
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

test('engine: the Auto-Trainer only appears after transcending', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false);
    s.prestige.count = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), true);
});
