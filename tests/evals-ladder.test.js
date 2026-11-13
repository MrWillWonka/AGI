// The unlock ladder (evals.js `LADDER`): a run starts with three quick kinds, each kind the AI takes over opens the next step,
// and the wider the rotation the longer each kind lasts.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');
// These measure the AI taking kinds over by itself, the rule before handing over (`handoff: 0`); with handing over the
// ladder counts the kinds you hand it (tests/evals-handoff.test.js).

// A steady, clean player: every answer right, at a brisk pace for the captcha. Plays runs on one learner until
// `until(learn)` or `cap` captchas; returns how many captchas each kind had been watched when it was taken over.
function play(until, cap = 4000, opts = {}) {
    const learn = Evals.newLearn(), tookAt = {}, order = [], sizes = [];
    let n = 0;
    for (let seed = 1; n < cap && !until(learn); seed++) {
        const run = Evals.createRun({ seed, learn, lives: 999, handoff: 0, ...opts });
        for (let j = 0; j < 60 && !run.over && n < cap && !until(learn); j++) {
            const c = run.current;
            const r = run.submit(c.answer, Evals.par(c) * 0.9);
            n++;
            if (r.takeover) {
                tookAt[r.takeover] = learn.kinds[r.takeover].solves;
                order.push(r.takeover);
                sizes.push(Evals.rotation(learn).length);
            }
        }
    }
    return { learn, tookAt, order, sizes, n };
}
const takenCount = learn => Object.keys(Evals.takenMap(learn)).length;

test('the ladder holds every kind once, starts with three quick kinds, and each step is learned slower than the last', () => {
    const all = Evals.LADDER.flatMap(s => s.kinds);
    assert.deepStrictEqual([...all].sort(), Object.keys(Evals.KINDS).sort());
    assert.strictEqual(new Set(all).size, all.length);
    assert.deepStrictEqual(Evals.LADDER[0].kinds, ['read.word', 'invisible.tick', 'answer.sum']);
    const speeds = Evals.LADDER.map(s => s.speed || 1);
    assert.ok(speeds.every((v, i) => i === 0 || v < speeds[i - 1]), speeds.join(' '));
});

test('a new run draws only its three starting kinds, and with the ladder off every family comes up', () => {
    const run = Evals.createRun({ seed: 5, lives: 999 });
    const seen = new Set();
    for (let j = 0; j < 12; j++) { seen.add(run.current.kind); run.submit([], 60); }   // wrong answers: it learns little, takes nothing
    assert.deepStrictEqual([...seen].sort(), [...Evals.LADDER[0].kinds].sort());
    const off = Evals.createRun({ seed: 5, ladder: 0, overtake: 999, lives: 999 });
    const families = new Set();
    for (let j = 0; j < 30; j++) { families.add(off.current.family); off.submit(off.current.answer, 60); }
    assert.strictEqual(families.size, Evals.ORDER.length);
});

test('the rotation grows 3, 4, 6, 8, 10 as it takes kinds over, and a takeover says what it opened', () => {
    const learn = Evals.newLearn();
    assert.deepStrictEqual(Evals.rotation(learn), Evals.LADDER[0].kinds);
    const sizes = [Evals.rotation(learn).length];
    // Take the first kind of what is in rotation, four times.
    for (let step = 0; step < 4; step++) {
        Evals.kindOf(learn, Evals.rotation(learn)[0]).taken = true;
        sizes.push(Evals.rotation(learn).length);
    }
    assert.deepStrictEqual(sizes, [3, 4, 6, 8, 10]);
    assert.strictEqual(Evals.openKinds(learn).length, Object.keys(Evals.KINDS).length);
    // In a run: the takeover's result names the step it opened, and the next captcha is one of them.
    const { order } = play(l => takenCount(l) >= 1);
    assert.ok(order.length === 1 && Evals.LADDER[0].kinds.includes(order[0]));
    const fresh = Evals.newLearn();
    const run = Evals.createRun({ seed: 3, learn: fresh, lives: 999, handoff: 0 });
    let r;
    for (let j = 0; j < 60 && !(r && r.takeover); j++) r = run.submit(run.current.answer, Evals.par(run.current) * 0.9);
    assert.ok(Evals.LADDER[0].kinds.includes(r.takeover));
    assert.deepStrictEqual(r.unlocked, Evals.LADDER[1].kinds);
    assert.deepStrictEqual(run.unlocks, Evals.LADDER[1].kinds);
});

test('the starting kinds go quickly, and later kinds take more watching', () => {
    const first = play(l => takenCount(l) >= 1);
    assert.ok(first.tookAt[first.order[0]] >= 5 && first.tookAt[first.order[0]] <= 12, `${first.order[0]} taken after ${first.tookAt[first.order[0]]} watched`);
    const later = play(l => takenCount(l) >= 5);
    assert.strictEqual(later.order.length, 5);
    assert.deepStrictEqual(later.order.slice(0, 3).sort(), [...Evals.LADDER[0].kinds].sort());
    for (const k of Evals.LADDER[0].kinds) assert.ok(later.tookAt[k] <= 12, `${k} taken after ${later.tookAt[k]} watched`);
    for (const k of later.order.slice(3)) assert.ok(later.tookAt[k] > 14, `${k} taken after ${later.tookAt[k]} watched`);
});

test('with handing over, a steady player has taught each starting kind fully within about ten solves of it', () => {
    const learn = Evals.newLearn();
    const run = Evals.createRun({ seed: 2, learn, lives: 999 });
    for (let j = 0; j < 36; j++) run.submit(run.current.answer, Evals.par(run.current) * 0.9);
    for (const k of Evals.LADDER[0].kinds) assert.ok(learn.kinds[k].m >= 1 && learn.kinds[k].solves <= 13, `${k}: ${learn.kinds[k].m} after ${learn.kinds[k].solves}`);
});

test('what is open comes from the kinds taken, so a save needs nothing new and learning on a locked kind waits', () => {
    const learn = Evals.newLearn();
    Evals.kindOf(learn, 'pick.scene').m = 0.5;   // learned off the ladder (an older save)
    assert.deepStrictEqual(Evals.rotation(learn), Evals.LADDER[0].kinds);
    assert.ok(Evals.blockedMap(learn)['pick.scene']);
    assert.strictEqual(learn.kinds['pick.scene'].m, 0.5);
    assert.ok(!Evals.blockedMap(learn, { ...Evals.EVALS, ladder: 0 })['pick.scene']);
});
