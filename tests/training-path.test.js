// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../training-path.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// Push with a fixed strength using a timing rule until hill i is crested (or time runs out).
function pushesToCrest(i, dv, timing) {
    const sim = T.createSim(i);
    let pushes = 0;
    for (let t = 0; t < 120; t += 1 / 60) {
        if (timing(sim) && sim.push(dv)) pushes++;
        if (sim.step(1 / 60).some(e => e.type === 'crest' && e.hill === i)) return pushes;
    }
    return Infinity;
}
const forward = sim => sim.ball.v > 0.05 || sim.atRest;
const blind = () => true;

test('the trail is continuous and hills grow taller and wider', () => {
    for (let i = 0; i < 30; i++) {
        const h = T.hill(i);
        const next = T.hill(i + 1);
        assert.ok(next.height > h.height && next.halfWidth > h.halfWidth);
        assert.ok(next.start > h.end, 'a valley separates hills');
        assert.ok(Math.abs(T.height(h.peak) - h.height) < 1e-9);
        assert.ok(T.height(h.start) < 1e-9 && T.height(h.end) < 1e-9, 'hills meet the valley floor smoothly');
        assert.equal(T.height((h.end + next.start) / 2), 0);
    }
    assert.ok(T.height(-0.5) > T.hill(0).height, 'a wall stops the ball rolling off the start');
});

test('slope matches the height curve', () => {
    for (const x of [0.3, T.hill(0).start + 0.1, T.hill(3).peak - 0.2, T.hill(7).peak + 0.5, -0.1]) {
        const numeric = (T.height(x + 1e-6) - T.height(x - 1e-6)) / 2e-6;
        assert.ok(Math.abs(numeric - T.slope(x)) < 1e-4, `x=${x}`);
    }
});

test('the first hill is easy; a weak push rolls back and teaches nothing', () => {
    assert.ok(pushesToCrest(0, 1.8, forward) <= 2);
    const sim = T.createSim(0);
    sim.push(0.8);
    const events = [];
    for (let t = 0; t < 15; t += 0.05) events.push(...sim.step(0.05));
    assert.deepEqual(events, []);
    assert.equal(sim.valley, 0);
    assert.ok(sim.ball.best > 0 && sim.ball.best < 1, 'partial progress is recorded');
    assert.ok(sim.atRest, 'ball settles back in the valley');
});

test('later hills need several pushes, and timing beats blind pushing', () => {
    const smart = pushesToCrest(8, 1.8, forward);
    assert.ok(smart > 3 && smart < Infinity, `hill 8 took ${smart} timed pushes`);
    assert.equal(pushesToCrest(6, 1.8, blind), Infinity, 'blind pushing stalls where timing gets through');
    assert.ok(pushesToCrest(6, 1.8, forward) < Infinity);
});

test('pushes have a cooldown so mashing does not stack', () => {
    const sim = T.createSim(0);
    assert.equal(sim.push(1), true);
    assert.equal(sim.push(1), false);
    for (let t = 0; t < T.PUSH_COOLDOWN + 0.05; t += 0.05) sim.step(0.05);
    assert.equal(sim.push(1), true);
});

test('the simulation is deterministic', () => {
    const run = () => {
        const sim = T.createSim(2);
        const log = [];
        for (let t = 0; t < 20; t += 0.05) {
            if (sim.ball.v >= 0) sim.push(2.2);
            log.push(...sim.step(0.05), +sim.ball.x.toFixed(6));
        }
        return log;
    };
    assert.deepEqual(run(), run());
});

test('a strong push can crest several small hills in one go', () => {
    const sim = T.createSim(0);
    sim.push(4);
    const crests = [];
    for (let t = 0; t < 20; t += 0.05) crests.push(...sim.step(0.05).filter(e => e.type === 'crest').map(e => e.hill));
    assert.ok(crests.length >= 2, `crested ${crests}`);
    assert.deepEqual(crests, crests.map((_, i) => i));
});

test('engine: pushes cost resources that grow along the trail', () => {
    const s = E.defaultState(NOW);
    s.res = { cp: 1000, dp: 1000, rp: 0 };
    assert.equal(E.payPush(s), false, 'locked until the milestone');
    s.stats.runCp = 50;
    E.evaluate(s);
    const first = E.pushCost(s);
    assert.equal(E.payPush(s), true);
    assert.deepEqual(s.res, { cp: 1000 - first.cp, dp: 1000 - first.dp, rp: 0 });
    s.path.learned = 5;
    assert.ok(E.pushCost(s).cp > first.cp * 5);
});

test('engine: learning skills grants attributes and permanent bonuses, in order only', () => {
    const s = E.defaultState(NOW);
    const before = E.derive(s);
    assert.equal(E.learnSkill(s, 1), null, 'cannot skip ahead');
    assert.equal(E.learnSkill(s, 0).name, 'Pattern Matching');
    assert.equal(s.attr.intelligence, 1);
    assert.equal(E.derive(s).clickPower, before.clickPower + 1);
    assert.equal(E.learnSkill(s, 0), null, 'cannot relearn');
    for (let i = 1; i < E.SKILLS.length; i++) E.learnSkill(s, i);
    assert.equal(s.path.learned, E.SKILLS.length);
    assert.ok(E.derive(s).pushPower > before.pushPower, 'Analogy and Self-Modeling boost pushes');
    const frontier = E.learnSkill(s, E.SKILLS.length);
    assert.match(frontier.name, /^Frontier Skill 1$/);
    assert.equal(s.stats.skillsLearned, E.SKILLS.length + 1);
});

test('engine: push strength does not grow with Intelligence (no runaway loop)', () => {
    const s = E.defaultState(NOW);
    const base = E.derive(s).pushPower;
    s.attr.intelligence = 1e6;
    assert.equal(E.derive(s).pushPower, base);
    s.levels.trainingOptimizer = 3;
    assert.ok(Math.abs(E.derive(s).pushPower - base * 1.3) < 1e-9);
});

test('engine: Self-Improve gets pricier with each use in a run', () => {
    const s = E.defaultState(NOW);
    s.unlocked['action:improve'] = true;
    s.res = { cp: 1e6, dp: 1e6, rp: 1e6 };
    const improve = E.ACTIONS.find(a => a.id === 'improve');
    const first = E.actionCost(s, improve);
    E.act(s, 'improve');
    E.act(s, 'improve');
    assert.equal(E.actionCost(s, improve).cp, Math.ceil(first.cp * 1.25 * 1.25));
});

test('engine: path progress saves, and resets on prestige while lifetime stats stay', () => {
    const s = E.defaultState(NOW);
    for (let i = 0; i < 4; i++) E.learnSkill(s, i);
    assert.equal(E.deserialize(E.serialize(s), NOW).path.learned, 4);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, path: { learned: -2 } }, NOW).path.learned, 0);
    s.attr.intelligence = 10;
    s.stats.runCp = 1e6;
    const next = E.prestige(s, NOW + 1).state;
    assert.equal(next.path.learned, 0);
    assert.equal(next.stats.skillsLearned, 4);
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
