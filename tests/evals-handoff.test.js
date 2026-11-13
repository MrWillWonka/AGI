// Handing over (evals.js `handoff`): the AI never takes a kind. You hand one to it and take it back when you choose;
// its captchas still come up in your run, it answers them alone, and a wrong answer of its costs a life.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');
const E = require('../engine.js');

const brisk = run => run.submit(run.current.answer, Evals.par(run.current) * 0.9);

test('it never takes a kind by itself, however long you play, and is never faster than you while it learns', () => {
    const learn = Evals.newLearn();
    let fastest = Infinity;
    for (let seed = 1; seed <= 6; seed++) {
        const run = Evals.createRun({ seed, learn, lives: 999 });
        for (let j = 0; j < 40; j++) {
            const mine = Evals.par(run.current) * 0.9;
            // Its attempt is built from your own rhythm at a pace of 1 or more: against your own steady time it can
            // wobble a little under, never far.
            if (learn.kinds['read.word']?.solves >= 3) fastest = Math.min(fastest, run.ghost.seconds / mine);
            const r = brisk(run);
            assert.strictEqual(r.takeover, null);
            assert.strictEqual(run.current.kind, 'read.word');
        }
    }
    assert.deepStrictEqual(Evals.takenMap(learn), {});
    assert.strictEqual(learn.kinds['read.word'].m, 1);
    assert.ok(fastest > 0.75, `its quickest attempt was ${fastest.toFixed(2)} of your time`);
});

test('handing a kind over opens the ladder\'s next step, and the captcha up becomes its own', () => {
    const learn = Evals.newLearn();
    const run = Evals.createRun({ seed: 2, learn, lives: 999 });
    for (let j = 0; j < 8; j++) brisk(run);
    assert.ok(!run.current.auto);
    const opened = run.hand('read.word');
    assert.deepStrictEqual(opened, Evals.LADDER[1].kinds);
    assert.deepStrictEqual(run.hands, ['read.word']);
    assert.ok(run.current.auto && run.current.kind === 'read.word');
    assert.deepStrictEqual(Evals.rotation(learn).sort(), [...Evals.LADDER[1].kinds].sort());
    // Handing it over again does nothing.
    assert.deepStrictEqual(run.hand('read.word'), []);
    // A handed-over kind still comes up, as its own, among the ones you prove.
    const seen = { auto: new Set(), mine: new Set() };
    for (let j = 0; j < 30 && !run.over; j++) {
        (run.current.auto ? seen.auto : seen.mine).add(run.current.kind);
        if (run.current.auto) run.submitAuto(); else brisk(run);
    }
    assert.deepStrictEqual([...seen.auto], ['read.word']);
    assert.ok(seen.mine.has('answer.sum'));
});

test('its own answers: right counts as solved, wrong costs a life, and it learns nothing from them', () => {
    // Handed over knowing nothing: it is wrong nearly every time, and the run is soon over.
    const raw = Evals.newLearn();
    const lost = Evals.createRun({ seed: 4, learn: raw });
    lost.hand('read.word');
    let n = 0;
    while (!lost.over && n < 40) { if (lost.current.auto) { const r = lost.submitAuto(); assert.strictEqual(r.auto, true); } else lost.submit([], 5); n++; }
    assert.ok(lost.over && lost.lives === 0 && n <= 8, `over after ${n}`);
    // Taught fully first: it is right most of the time, each right one solved, and what it knows does not move.
    const learn = Evals.newLearn();
    Evals.kindOf(learn, 'read.word').m = 1;
    const run = Evals.createRun({ seed: 5, learn, lives: 999, families: ['read'] });
    run.hand('read.word');
    let right = 0;
    // (Struck-through words, which handing over opened, are still yours: solved here and not counted.)
    for (let own = 0; own < 60;) {
        if (!run.current.auto) { brisk(run); continue; }
        const before = run.solved, r = run.submitAuto();
        own++; right += +r.correct;
        assert.strictEqual(run.solved - before, +r.correct);
    }
    assert.ok(right >= 45 && right < 60, `right ${right} of 60`);
    assert.strictEqual(learn.kinds['read.word'].m, 1);
    assert.strictEqual(learn.kinds['read.word'].solves, 0);
    assert.strictEqual(learn.kinds['read.word'].own, 60);
    assert.strictEqual(run.lives, 999 - (60 - right));
    assert.strictEqual(run.log.filter(e => e.auto).length, 60);
});

test('on its own it gets faster with every captcha it does, down to its top pace, with the same mistakes', () => {
    const mean = own => {
        const learn = Evals.newLearn(), k = Evals.kindOf(learn, 'answer.sum');
        Object.assign(k, { m: 1, taken: true, handed: true, own });
        const rand = Evals.rng(7);
        let seconds = 0, right = 0;
        for (let j = 0; j < 300; j++) {
            const c = Evals.FAMILIES.answer.make(Evals.rng(j + 1), 0);
            const g = Evals.ghostAttempt(learn, c, rand);
            seconds += g.seconds; right += +g.correct;
        }
        return { seconds: seconds / 300, right: right / 300 };
    };
    const at0 = mean(0), at20 = mean(20), at40 = mean(40), at400 = mean(400);
    assert.ok(at20.seconds < at0.seconds * 0.85 && at40.seconds < at20.seconds * 0.85, `${at0.seconds.toFixed(2)} → ${at20.seconds.toFixed(2)} → ${at40.seconds.toFixed(2)}`);
    assert.ok(Math.abs(at40.seconds / at0.seconds - Evals.EVALS.ownPace) < 0.06);
    assert.ok(Math.abs(at400.seconds - at40.seconds) < 0.05, 'no faster past its top pace');
    assert.ok(Math.abs(at0.right - at40.right) < 0.06, 'as right as it was');
});

test('taking a kind back: yours again, it watches again, and nothing the ladder opened closes', () => {
    const learn = Evals.newLearn();
    const run = Evals.createRun({ seed: 6, learn, lives: 999, families: ['read'] });
    for (let j = 0; j < 3; j++) brisk(run);
    run.hand('read.word');
    run.submitAuto();
    while (!run.current.auto) brisk(run);   // past any struck-through word, to a warped one
    const open = Evals.openKinds(learn).length, m = learn.kinds['read.word'].m;
    run.takeBack('read.word');
    assert.ok(!run.current.auto && !learn.kinds['read.word'].taken && learn.kinds['read.word'].handed);
    assert.strictEqual(Evals.openKinds(learn).length, open);
    assert.strictEqual(run.current.kind, 'read.word');
    brisk(run);
    assert.ok(learn.kinds['read.word'].m > m);
    while (run.current.kind !== 'read.word') brisk(run);
    assert.strictEqual(run.submitAuto(), null);
});

test('the save keeps handed and own, and a kind taken in an older save counts as handed', () => {
    const now = Date.now();
    const s = E.migrate({ version: 34, evals: { learn: { kinds: { 'read.word': { m: 0.8, solves: 12, taken: true }, 'answer.sum': { m: 0.2, solves: 3, own: 7.9, handed: true } } } } }, now);
    assert.ok(E.SAVE_VERSION >= 35 && s.version === E.SAVE_VERSION);
    assert.deepStrictEqual([s.evals.learn.kinds['read.word'].taken, s.evals.learn.kinds['read.word'].handed, s.evals.learn.kinds['read.word'].own], [true, true, 0]);
    assert.deepStrictEqual([s.evals.learn.kinds['answer.sum'].taken, s.evals.learn.kinds['answer.sum'].handed, s.evals.learn.kinds['answer.sum'].own], [false, true, 7]);
    assert.strictEqual(Evals.openKinds(s.evals.learn).length, 6);
    const junk = E.migrate({ version: E.SAVE_VERSION, evals: { learn: { kinds: { 'read.word': { own: -4, handed: 'yes' } } } } }, now).evals.learn.kinds['read.word'];
    assert.deepStrictEqual([junk.own, junk.handed], [0, false]);
});

test('reviewing: stopping its captcha makes that one yours, shows whether you caught a mistake, and it learns from your fix', () => {
    const learn = Evals.newLearn();
    Evals.kindOf(learn, 'read.word').m = 0.3;
    const run = Evals.createRun({ seed: 9, learn, lives: 999, families: ['read'] });
    run.hand('read.word');
    let caught = 0, right = 0, stops = 0;
    while (stops < 30) {
        if (!run.current.auto) { brisk(run); continue; }
        const would = run.ghost.correct, own = learn.kinds['read.word'].own, m = learn.kinds['read.word'].m, lives = run.lives;
        assert.strictEqual(run.interrupt(), true);
        assert.ok(!run.current.auto && run.current.stopped && run.current.kind === 'read.word');
        assert.strictEqual(run.submitAuto(), null);
        assert.strictEqual(run.interrupt(), false);
        const r = brisk(run);
        stops++; caught += +r.caught; right += +!r.caught;
        assert.ok(r.stopped && r.correct && r.caught === !would);
        // Your answer is the one that counts: no life lost whatever it was about to do, and it learned from watching.
        assert.strictEqual(run.lives, lives);
        assert.strictEqual(learn.kinds['read.word'].own, own);
        assert.ok(learn.kinds['read.word'].m >= m);
    }
    assert.ok(learn.kinds['read.word'].taken, 'the kind stays handed over');
    assert.ok(caught > 0 && right > 0, `caught ${caught}, it was right ${right}`);
    assert.deepStrictEqual([run.stops, run.catches], [30, caught]);
    assert.strictEqual(run.log.filter(e => e.stopped).length, 30);
    // A captcha of your own can't be stopped.
    while (run.current.auto) run.submitAuto();
    assert.strictEqual(run.interrupt(), false);
});
