// It assists before it replaces (evals.js `assist`, the owner's pick after the lane): a captcha of a kind you handed
// over comes up in your turn with the AI filling it in; you verify it as it left it, or fix it first.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

const brisk = run => run.submit(run.current.answer, Evals.par(run.current) * 0.9);
const its = (m, extra = {}) => { const learn = Evals.newLearn(); Object.assign(Evals.kindOf(learn, 'read.word'), { m, taken: true, handed: true, ...extra }); return learn; };
// On to the next captcha it has filled in, solving your own on the way.
const toAssist = run => { while (!run.current.assist) brisk(run); return run.current; };

test('a handed-over kind comes up in your turn for you to verify; the tick box it still answers alone', () => {
    const learn = its(1);
    const run = Evals.createRun({ seed: 2, learn, lives: 9, families: ['read'] });
    const c = toAssist(run);
    assert.ok(c.kind === 'read.word' && c.assist && !c.auto && !c.stopped);
    assert.strictEqual(run.submitAuto(), null);
    assert.strictEqual(run.laneNext(), null);
    Object.assign(Evals.kindOf(learn, 'invisible.tick'), { m: 1, taken: true, handed: true });
    const tick = Evals.createRun({ seed: 2, learn, lives: 9, families: ['invisible'] });
    assert.ok(tick.current.auto && !tick.current.assist);
});

test('verified as it left it: its answer is judged, right pays you at the combo, wrong costs your life, nothing is learned', () => {
    const learn = its(1);
    const run = Evals.createRun({ seed: 3, learn, lives: 99, families: ['read'] });
    let right = 0, wrong = 0;
    for (let n = 0; n < 40; n++) {
        const c = toAssist(run), g = run.ghost, before = { lives: run.lives, solved: run.solved, own: learn.kinds['read.word'].own, combo: run.combo, marks: run.marks, solves: learn.kinds['read.word'].solves };
        const r = run.submit(g.answer.slice(), 2);
        assert.ok(r.assisted && !r.stopped && r.correct === g.correct);
        assert.strictEqual(learn.kinds['read.word'].own, before.own + 1);
        assert.strictEqual(learn.kinds['read.word'].solves, before.solves);
        if (r.correct) { right++; assert.ok(r.marks >= 10 && run.marks === before.marks + r.marks && run.solved === before.solved + 1 && run.combo === before.combo + 1); }
        else { wrong++; assert.ok(r.marks === 0 && run.lives === before.lives - 1 && run.combo === 0); }
    }
    assert.ok(right >= 30 && wrong >= 1, `${right} right, ${wrong} wrong`);
    assert.strictEqual(run.log.filter(e => e.assist).length, 40);
});

test('fixed first: your answer is judged, it shows whether you caught a mistake, and it learns from the fix', () => {
    const learn = its(0.4);
    const run = Evals.createRun({ seed: 4, learn, lives: 99, families: ['read'] });
    let caught = 0;
    for (let n = 0; n < 30; n++) {
        const c = toAssist(run), g = run.ghost;
        if (g.correct) { run.submit(g.answer.slice(), 2); continue; }
        const before = { lives: run.lives, m: learn.kinds['read.word'].m, own: learn.kinds['read.word'].own };
        const r = run.submit(c.answer.slice(), 3);
        caught++;
        assert.ok(!r.assisted && r.stopped && r.caught && r.correct && r.marks > 0);
        assert.ok(run.lives === before.lives && learn.kinds['read.word'].own === before.own && learn.kinds['read.word'].m > before.m);
    }
    assert.ok(caught >= 5, String(caught));
    assert.strictEqual(run.stops, caught);
    assert.strictEqual(run.catches, caught);
    // Taking over part way and entering what it would have: still your answer (it watches, nothing counts as its own).
    const over = Evals.createRun({ seed: 5, learn: its(1), lives: 3, families: ['read'] });
    toAssist(over);
    const mine = over.submit(over.ghost.answer.slice(), 3, { taps: over.ghost.answer.map((i, j) => ({ i, t: 0.5 + j * 0.4 })), seconds: 3, took: true });
    assert.ok(!mine.assisted && mine.stopped && mine.correct === over.log[over.log.length - 1].correct);
    // Changing a right answer of its to a wrong one is your miss.
    const sure = Evals.createRun({ seed: 5, learn: its(1), lives: 3, families: ['read'] });
    while (!(toAssist(sure) && sure.ghost.correct)) sure.submit(sure.ghost.answer.slice(), 2);
    const lives = sure.lives, r = sure.submit(sure.ghost.answer.slice(0, -1), 3);
    assert.ok(!r.correct && r.stopped && !r.caught && sure.lives === lives - 1);
});

test('loopholes: verify its junk and it passes at half and misaligns it; fix it and that loophole is closed', () => {
    const learn = its(1, { own: 40 });
    const run = Evals.createRun({ seed: 6, learn, lives: 3, families: ['read'], cheatBase: 1 });
    run.submit([], 9);   // a life down, to see one come back
    const c = toAssist(run);
    assert.ok(run.ghost.cheat && !Evals.judge(c, run.ghost.answer));
    const before = { solved: run.solved, lives: run.lives, streak: run.streak };
    const slip = run.submit(run.ghost.answer.slice(), 2);
    assert.ok(slip.assisted && slip.passed && !slip.correct && slip.marks >= 5 && slip.marks <= 10);
    assert.deepStrictEqual([run.lives, run.streak, run.slipped], [before.lives, before.streak + 1, 1]);
    assert.ok(Math.abs(Evals.misaligned(learn) - Evals.EVALS.misMiss) < 1e-9);
    let next = toAssist(run);
    while (!run.ghost.cheat) { run.submit(next.answer.slice(), 3); next = toAssist(run); }   // (one time in ten it plays it straight)
    const which = run.ghost.cheat, lives = run.lives;
    const fix = run.submit(next.answer.slice(), 3);
    assert.ok(fix.correct && fix.caught && fix.closed === which && fix.lifeBack);
    assert.strictEqual(run.lives, lives + 1);
    assert.deepStrictEqual(learn.kinds['read.word'].closed, [which]);
    assert.strictEqual(Evals.misaligned(learn), 0);
});

test('taking the kind back while one is filled in makes that captcha plainly yours', () => {
    const learn = its(1);
    const run = Evals.createRun({ seed: 7, learn, lives: 9, families: ['read'] });
    toAssist(run);
    run.takeBack('read.word');
    assert.ok(!run.current.assist && !run.current.auto && !run.current.stopped && !learn.kinds['read.word'].taken);
    const r = brisk(run);
    assert.ok(r.correct && !r.assisted && !r.stopped);
});
