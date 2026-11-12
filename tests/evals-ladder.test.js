// The unlock ladder (evals.js `LADDER`): a run starts with one kind, each kind the AI takes over opens the next step,
// and the wider the rotation the longer each kind lasts.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

// A steady, clean player: every answer right, at a brisk pace for the captcha. Plays runs on one learner until
// `until(learn)` or `cap` captchas; returns how many captchas each kind had been watched when it was taken over.
function play(until, cap = 4000, opts = {}) {
    const learn = Evals.newLearn(), tookAt = {}, order = [], sizes = [];
    let n = 0;
    for (let seed = 1; n < cap && !until(learn); seed++) {
        const run = Evals.createRun({ seed, learn, lives: 999, ...opts });
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

test('the ladder holds every kind once, and its first is warped words', () => {
    const all = Evals.LADDER.flatMap(s => s.kinds);
    assert.deepStrictEqual([...all].sort(), Object.keys(Evals.KINDS).sort());
    assert.strictEqual(new Set(all).size, all.length);
    assert.deepStrictEqual(Evals.LADDER[0].kinds, ['read.word']);
});

test('a new run draws only warped words, and with the ladder off every family comes up', () => {
    const run = Evals.createRun({ seed: 5, lives: 999 });
    const seen = new Set();
    for (let j = 0; j < 12; j++) { seen.add(run.current.kind); run.submit([], 60); }   // wrong answers: it learns little, takes nothing
    assert.deepStrictEqual([...seen], ['read.word']);
    const off = Evals.createRun({ seed: 5, ladder: 0, overtake: 999, lives: 999 });
    const families = new Set();
    for (let j = 0; j < 30; j++) { families.add(off.current.family); off.submit(off.current.answer, 60); }
    assert.strictEqual(families.size, Evals.ORDER.length);
});

test('the rotation grows 1, 2, 4, 6, 10 as it takes kinds over, and a takeover says what it opened', () => {
    const learn = Evals.newLearn();
    assert.deepStrictEqual(Evals.rotation(learn), ['read.word']);
    const sizes = [Evals.rotation(learn).length];
    // Take the first kind of what is in rotation, four times.
    for (let step = 0; step < 4; step++) {
        Evals.kindOf(learn, Evals.rotation(learn)[0]).taken = true;
        sizes.push(Evals.rotation(learn).length);
    }
    assert.deepStrictEqual(sizes, [1, 2, 4, 6, 10]);
    assert.strictEqual(Evals.openKinds(learn).length, Object.keys(Evals.KINDS).length);
    // In a run: the takeover's result names the step it opened, and the next captcha is one of them.
    const { order } = play(l => takenCount(l) >= 1);
    assert.deepStrictEqual(order, ['read.word']);
    const fresh = Evals.newLearn();
    const run = Evals.createRun({ seed: 3, learn: fresh, lives: 999 });
    let r;
    for (let j = 0; j < 60 && !(r && r.takeover); j++) r = run.submit(run.current.answer, Evals.par(run.current) * 0.9);
    assert.strictEqual(r.takeover, 'read.word');
    assert.deepStrictEqual(r.unlocked, Evals.LADDER[1].kinds);
    assert.deepStrictEqual(run.unlocks, Evals.LADDER[1].kinds);
    assert.ok(Evals.LADDER[1].kinds.includes(run.current.kind));
});

test('the first kind goes quickly, and kinds in a wider rotation take far more play to lose', () => {
    const first = play(l => takenCount(l) >= 1);
    assert.ok(first.n >= 6 && first.n <= 16, `warped words taken after ${first.n} captchas`);
    const later = play(l => takenCount(l) >= 4);
    assert.strictEqual(later.order.length, 4);
    // Captchas played between takeovers grow: each step takes longer than the first kind did.
    assert.ok(later.n > first.n * 8, `four takeovers took ${later.n} captchas, the first ${first.n}`);
    // Off the ladder's fast steps, a kind is still watched about 30 to 45 times before it goes.
    const plain = later.order.filter(k => !Evals.LADDER[0].kinds.includes(k) && !Evals.LADDER[1].kinds.includes(k));
    for (const k of plain) assert.ok(later.tookAt[k] >= 28 && later.tookAt[k] <= 50, `${k} taken after ${later.tookAt[k]} watched`);
});

test('what is open comes from the kinds taken, so a save needs nothing new and learning on a locked kind waits', () => {
    const learn = Evals.newLearn();
    Evals.kindOf(learn, 'pick.scene').m = 0.5;   // learned off the ladder (an older save)
    assert.deepStrictEqual(Evals.rotation(learn), ['read.word']);
    assert.ok(Evals.blockedMap(learn)['pick.scene']);
    assert.strictEqual(learn.kinds['pick.scene'].m, 0.5);
    assert.ok(!Evals.blockedMap(learn, { ...Evals.EVALS, ladder: 0 })['pick.scene']);
});
