// The ring, Build 3: Evals opens with the first Packet Snare boss beaten, and each boss beaten opens a step of its kinds.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const Evals = require('../evals.js');

test.afterEach(() => E.setRing(false));

test('the ring: Evals opens when the first boss falls, and only under the ring', () => {
    E.setRing(true);
    const s = E.defaultState(Date.now());
    assert.equal(E.evalsOpen(s), false);
    E.snareBossDown(s, E.SNARE_FIRST_BOSS);
    assert.equal(E.evalsOpen(s), true);
    E.setRing(false);
    assert.equal(E.evalsOpen(s), false, 'the old game has no Evals app');
    assert.equal(E.evalsOpts(s).steps, undefined, 'and its ladder is its own');
});

test('the ring: each different boss beaten opens a step of kinds; a replay opens nothing', () => {
    E.setRing(true);
    const s = E.defaultState(Date.now());
    const first = E.SNARE_FIRST_BOSS, second = first + E.SNARE_BOSS_EVERY;
    E.snareBossDown(s, first);
    assert.equal(E.evalsOpts(s).steps, 1);
    E.snareBossDown(s, first);   // the same boss again, on a replay
    assert.equal(E.evalsOpts(s).steps, 1);
    s.snare.sector = second; E.snareBossDown(s, second);
    assert.equal(E.evalsOpts(s).steps, 2);
});

test('Evals: with steps given, handing a kind over opens no kinds', () => {
    const learn = Evals.newLearn ? Evals.newLearn() : { kinds: {}, mis: 0 };
    const one = { ...Evals.EVALS, ladder: 1, steps: 1 }, two = { ...one, steps: 2 };
    assert.deepEqual(Evals.openKinds(learn, one), Evals.LADDER[0].kinds);
    learn.kinds[Evals.LADDER[0].kinds[0]] = { ...(learn.kinds[Evals.LADDER[0].kinds[0]] || {}), handed: true };
    assert.deepEqual(Evals.openKinds(learn, one), Evals.LADDER[0].kinds, 'a handover opens nothing');
    assert.deepEqual(Evals.openKinds(learn, two), [...Evals.LADDER[0].kinds, ...Evals.LADDER[1].kinds]);
    assert.equal(Evals.openKinds(learn, { ...one, steps: 99 }).length, Evals.LADDER.flatMap(x => x.kinds).length);
});
