// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../loss-landscape.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

function runToRest(sim, maxSeconds = 30) {
    const events = [];
    for (let t = 0; t < maxSeconds && sim.balls.length; t += 0.05) events.push(...sim.step(0.05));
    return events;
}

test('landscapes are deterministic and normalized to [0, 1]', () => {
    const a = L.createLandscape(42);
    const b = L.createLandscape(42);
    assert.deepEqual(a.profile, b.profile);
    assert.notDeepEqual(a.profile, L.createLandscape(43).profile);
    const min = Math.min(...a.profile);
    const max = Math.max(...a.profile);
    assert.ok(min >= 0 && min < 0.01, `min ${min}`);
    assert.ok(max <= 1 && max > 0.99, `max ${max}`);
    assert.ok(a.loss(a.globalMinX) < 1e-6);
});

test('every landscape has several local minima to get stuck in', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const p = L.createLandscape(seed).profile;
        let minima = 0;
        for (let i = 1; i < p.length - 1; i++) if (p[i] < p[i - 1] && p[i] <= p[i + 1]) minima++;
        assert.ok(minima >= 2, `seed ${seed} has ${minima} minima`);
    }
});

test('the same drops replay identically (seeded noise)', () => {
    const run = () => {
        const sim = L.createSim(L.createLandscape(7));
        sim.drop(0.1, 0);
        sim.drop(0.6, 2);
        return runToRest(sim);
    };
    assert.deepEqual(run(), run());
});

test('a ball dropped at the global minimum stays and converges', () => {
    const land = L.createLandscape(3);
    const sim = L.createSim(land);
    sim.drop(land.globalMinX, 0);
    const [ev] = runToRest(sim);
    assert.equal(ev.converged, true);
    assert.ok(Math.abs(ev.x - land.globalMinX) < 0.02);
});

test('balls always settle at a local minimum, within a few seconds', () => {
    for (let seed = 1; seed <= 5; seed++) {
        const land = L.createLandscape(seed);
        const sim = L.createSim(land);
        for (let i = 0; i < 20; i++) sim.drop(i / 19, 0);
        const events = runToRest(sim, 10);
        assert.equal(events.length, 20, `seed ${seed}: all balls settle within 10s`);
        for (const ev of events) {
            assert.ok(Math.abs(L.RELIEF * land.slope(ev.x)) < 0.25 || ev.x === 0 || ev.x === 1, `seed ${seed}: settled on a slope at ${ev.x}`);
        }
    }
});

test('momentum can carry a ball over a ridge', () => {
    const land = L.createLandscape(1);
    const still = L.createSim(land);
    still.drop(0.02, 0);
    const flung = L.createSim(land);
    flung.drop(0.02, 3);
    assert.ok(runToRest(flung)[0].x > runToRest(still)[0].x + 0.1);
});

test('engine: drops cost CP and need the module unlocked', () => {
    const s = E.defaultState(NOW);
    s.res.cp = 1000;
    assert.equal(E.payLossDrop(s), false, 'locked');
    s.stats.runCp = 100;
    E.evaluate(s);
    assert.equal(E.payLossDrop(s), true);
    assert.equal(s.res.cp, 1000 - E.LOSS.dropCost.cp);
    s.res.cp = 0;
    assert.equal(E.payLossDrop(s), false, 'unaffordable');
});

test('engine: lower loss earns more, and converging pays double and advances the epoch', () => {
    assert.ok(E.lossGain(0.1, false) > E.lossGain(0.5, false));
    assert.equal(E.lossGain(1, false), 0);
    assert.equal(E.lossGain(0, true), E.LOSS.baseGain * E.LOSS.convergeBonus);

    const s = E.defaultState(NOW);
    const seed = E.lossSeed(s);
    E.settleLoss(s, 0.4, false);
    assert.equal(s.loss.epoch, 0);
    assert.equal(E.lossSeed(s), seed, 'same landscape until convergence');
    const gain = E.settleLoss(s, 0.01, true);
    assert.equal(s.loss.epoch, 1);
    assert.notEqual(E.lossSeed(s), seed, 'new landscape after convergence');
    assert.ok(Math.abs(s.attr.intelligence - (E.lossGain(0.4, false) + gain)) < 1e-9);
    assert.deepEqual([s.stats.lossDrops, s.stats.lossConverged], [2, 1]);
});

test('engine: each run gets different landscapes; epoch survives save/load but resets on prestige', () => {
    const a = E.defaultState(NOW);
    const b = E.defaultState(NOW + 1);
    assert.notEqual(E.lossSeed(a), E.lossSeed(b));

    a.loss.epoch = 4;
    assert.equal(E.deserialize(E.serialize(a), NOW).loss.epoch, 4);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, loss: { epoch: -3 } }, NOW).loss.epoch, 0);

    a.attr.intelligence = 10;
    a.stats.runCp = 1e6;
    a.stats.lossConverged = 2;
    const next = E.prestige(a, NOW + 5).state;
    assert.equal(next.loss.epoch, 0);
    assert.equal(next.stats.lossConverged, 2, 'lifetime stat kept');
});
