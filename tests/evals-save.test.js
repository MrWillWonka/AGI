// Evals in the save (engine.js `state.evals`, save v34): what the AI has learned survives a save and a load, and
// anything else is cleaned.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const Evals = require('../evals.js');
const NOW = 1_700_000_000_000;

test('a new game and a save from before Evals both start it empty', () => {
    assert.deepEqual(E.defaultState(NOW).evals, { runs: 0, best: 0, learn: { kinds: {} } });
    const old = E.migrate({ version: 33, res: { cp: 5 } }, NOW);
    assert.equal(old.version, E.SAVE_VERSION);
    assert.ok(E.SAVE_VERSION >= 34);
    assert.deepEqual(old.evals, { runs: 0, best: 0, learn: { kinds: {} } });
});

test('what it learned in a run comes back from a save unchanged', () => {
    const s = E.defaultState(NOW);
    const run = Evals.createRun({ families: ['pick'], seed: 4, learn: s.evals.learn });
    for (let i = 0; i < 5; i++) {
        const c = run.current;
        const taps = c.answer.map((x, j) => ({ i: x, t: 1 + 0.5 * j }));
        run.submit(c.answer, 3, { taps, seconds: 3 });
    }
    assert.ok(s.evals.learn.kinds['pick.thing'].m > 0);
    assert.ok(E.evalsRunEnd(s, run));
    assert.ok(!E.evalsRunEnd(s, run), 'a run is counted once');
    assert.equal(s.evals.runs, 1);
    assert.equal(s.evals.best, 5);
    const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
    assert.deepEqual(back.evals, s.evals);
    // And the learner plays on from it.
    const again = Evals.createRun({ families: ['pick'], seed: 5, learn: back.evals.learn });
    assert.ok(again.ghost.m > 0);
});

test('junk in the save is cleaned', () => {
    const junk = {
        runs: -3, best: 1e300,
        learn: { kinds: {
            'pick.thing': { m: 7, solves: 2.9, ahead: 'x', taken: 'yes', wrongs: 99,
                traces: [{ side: 3, correct: 1, seconds: 1e9, taps: [{ i: 2, t: 1.234 }, { i: 99, t: 1 }, { i: 1, t: -4 }, null] }, { side: 0, taps: [] }, 'no'] },
            '__proto__': { m: 1 }, 'Bad Key!': { m: 1 }, 'pick.none': null,
        } },
    };
    const e = E.migrate({ version: E.SAVE_VERSION, evals: junk }, NOW).evals;
    assert.equal(e.runs, 0);
    assert.equal(e.best, 1e6);
    assert.deepEqual(Object.keys(e.learn.kinds), ['pick.thing']);
    const k = e.learn.kinds['pick.thing'];
    assert.deepEqual({ m: k.m, solves: k.solves, ahead: k.ahead, taken: k.taken, wrongs: k.wrongs }, { m: 1, solves: 2, ahead: 0, taken: false, wrongs: 2 });
    assert.deepEqual(k.traces, [{ n: 9, side: 3, correct: false, seconds: 600, undos: 0, bend: 0, offset: 0, taps: [{ i: 2, t: 1.23 }], path: [] }]);
    for (const bad of [null, 5, 'x', [], { learn: 5 }, { learn: { kinds: [] } }]) {
        assert.deepEqual(E.migrate({ version: E.SAVE_VERSION, evals: bad }, NOW).evals.learn, { kinds: {} });
    }
    // More kinds or traces than it keeps are cut.
    const many = { learn: { kinds: {} } };
    for (let i = 0; i < 200; i++) many.learn.kinds['k.' + 'a'.repeat(1 + i % 20) + String.fromCharCode(97 + i % 26)] = { m: 0.5, traces: Array.from({ length: 30 }, () => ({ side: 3, taps: [] })) };
    const cut = E.migrate({ version: E.SAVE_VERSION, evals: many }, NOW).evals.learn.kinds;
    assert.ok(Object.keys(cut).length <= 64);
    assert.ok(Object.values(cut).every(k => k.traces.length <= 10));
});
