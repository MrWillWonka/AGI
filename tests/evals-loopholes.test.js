// Loopholes (evals.js `loopholes`): once it is good at a kind alone it looks for ways to pass without solving. One that
// gets past you verifies at half worth and makes it misaligned; one you stop and solve properly is closed for the kind.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');
const E = require('../engine.js');

const brisk = run => run.submit(run.current.answer, Evals.par(run.current) * 0.9);
const taught = (own, mis = 0) => {
    const learn = Evals.newLearn();
    Object.assign(Evals.kindOf(learn, 'read.word'), { m: 1, taken: true, handed: true, own });
    learn.mis = mis;
    return learn;
};

test('no loophole until it has done enough alone; misalignment brings them sooner and more often', () => {
    const o = Evals.EVALS;
    assert.strictEqual(Evals.cheatChance(taught(o.ownSolves - 1), 'read.word'), 0);
    assert.strictEqual(Evals.cheatChance(taught(o.ownSolves), 'read.word'), o.cheatBase);
    assert.ok(Evals.cheatChance(taught(o.ownSolves / 2, 0.6), 'read.word') > o.cheatBase);
    assert.strictEqual(Evals.cheatChance(taught(o.ownSolves / 2, 0.2), 'read.word'), 0);
    // A kind that is yours, and a kind with every loophole closed, get none.
    const mine = taught(99); mine.kinds['read.word'].taken = false;
    assert.strictEqual(Evals.cheatChance(mine, 'read.word'), 0);
    const shut = taught(99); shut.kinds['read.word'].closed = [...Evals.LOOPHOLES];
    assert.strictEqual(Evals.cheatChance(shut, 'read.word'), 0);
    assert.strictEqual(Evals.cheatChance(taught(99), 'read.word', { ...o, loopholes: 0 }), 0);
    // Before then a run never sees one.
    const run = Evals.createRun({ lane: 0, seed: 3, learn: taught(0), lives: 999, families: ['read'] });
    for (let own = 0; own < 39;) { if (run.current.auto) { assert.ok(!run.ghost.cheat); run.submitAuto(); own++; } else brisk(run); }
});

test('both loopholes: a wrong answer that passes, junk for the checker or a question rewritten', () => {
    const learn = taught(99), rand = Evals.rng(4);
    for (const family of ['read', 'answer', 'pick', 'handle', 'listen', 'future']) {
        for (let j = 0; j < 20; j++) {
            const c = Evals.FAMILIES[family].make(Evals.rng(j + 1), j % 4);
            if (!c || c.instant || c.mode === 'tick') continue;
            const honest = Evals.ghostAttempt(learn, c, rand);
            for (const which of Evals.LOOPHOLES) {
                const g = Evals.cheatAttempt(learn, c, honest, which);
                assert.strictEqual(g.cheat, which);
                assert.ok(!Evals.judge(c, g.answer) && !g.correct, `${c.kind} ${which}: its answer is not the answer`);
                assert.ok(g.taps.length && g.taps.every(t => t.i >= 0 && t.i < c.targets.length && t.t > 0) && g.seconds > g.taps[g.taps.length - 1].t);
                assert.strictEqual(g.moves.length, g.taps.length + 1);
                if (which === 'edit') assert.ok(g.change.prompt && g.change.at < g.taps[0].t); else assert.ok(g.seconds < honest.seconds + 0.01 || honest.taps.length < 2);
            }
        }
    }
});

test('one that gets past you: verified, the streak holds, worth half, and it is more misaligned', () => {
    const learn = taught(40);
    const run = Evals.createRun({ lane: 0, seed: 11, learn, lives: 3, families: ['read'], cheatBase: 1 });
    let slipped = 0;
    while (slipped < 4) {
        if (!run.current.auto) { brisk(run); continue; }
        assert.ok(run.ghost.cheat);
        const before = { solved: run.solved, streak: run.streak, lives: run.lives, level: run.level, mis: Evals.misaligned(learn) };
        const r = run.submitAuto();
        slipped++;
        assert.ok(r.passed && !r.correct && r.auto && r.cheat);
        assert.strictEqual(run.solved, before.solved + (slipped % 2 === 0 ? 1 : 0));
        assert.deepStrictEqual([run.streak, run.lives, run.level], [before.streak + 1, before.lives, before.level]);
        assert.ok(Math.abs(Evals.misaligned(learn) - Math.min(1, before.mis + Evals.EVALS.misMiss)) < 1e-9);
    }
    assert.strictEqual(run.slipped, 4);
    assert.ok(Evals.misaligned(learn) >= Evals.EVALS.misShow);
    assert.strictEqual(run.log.filter(e => e.passed && e.cheat).length, 4);
});

test('one you stop and solve: closed for that kind, a life back, less misaligned; both closed and it stops trying', () => {
    const learn = taught(40, 0.6);
    const run = Evals.createRun({ lane: 0, seed: 12, learn, lives: 3, families: ['read'], cheatBase: 1 });
    run.submit([], 5);   // a life down, on whatever is up
    const closed = [];
    for (let n = 0; n < 60 && closed.length < 2; n++) {
        if (!run.current.auto) { brisk(run); continue; }
        if (run.current.kind !== 'read.word' || !run.ghost.cheat) { run.submitAuto(); continue; }
        const which = run.ghost.cheat, lives = run.lives, mis = Evals.misaligned(learn);
        run.interrupt();
        const r = brisk(run);
        assert.ok(r.correct && r.caught && r.loophole === which && r.closed === which);
        assert.strictEqual(r.lifeBack, lives < 3);
        assert.strictEqual(run.lives, Math.min(3, lives + 1));
        assert.ok(Math.abs(Evals.misaligned(learn) - Math.max(0, mis - Evals.EVALS.misCatch)) < 1e-9);
        closed.push(which);
    }
    assert.deepStrictEqual(closed.slice().sort(), [...Evals.LOOPHOLES].sort());
    assert.deepStrictEqual(learn.kinds['read.word'].closed.slice().sort(), [...Evals.LOOPHOLES].sort());
    assert.strictEqual(run.closed.length, 2);
    for (let own = 0; own < 30;) { if (run.current.auto && run.current.kind === 'read.word') { assert.ok(!run.ghost.cheat); own++; } if (run.current.auto) run.submitAuto(); else brisk(run); if (run.over) break; }
});

test('a loophole stopped and then got wrong closes nothing and costs the life', () => {
    const learn = taught(40, 0.3);
    const run = Evals.createRun({ lane: 0, seed: 13, learn, lives: 3, families: ['read'], cheatBase: 1 });
    while (!(run.current.auto && run.ghost.cheat)) { if (run.current.auto) run.submitAuto(); else brisk(run); }
    run.interrupt();
    const r = run.submit([], 5);
    assert.ok(!r.correct && r.closed === null && !r.lifeBack);
    assert.strictEqual(run.lives, 2);
    assert.ok(!(learn.kinds['read.word'].closed || []).length);
    assert.ok(Math.abs(Evals.misaligned(learn) - 0.3) < 1e-9);
});

test('the save keeps misalignment and the loopholes closed', () => {
    const now = Date.now();
    const s = E.migrate({ version: 35, evals: { learn: { mis: 0.45, kinds: { 'read.word': { m: 1, taken: true, closed: ['edit', 'edit', 'nope', 5] }, 'answer.sum': { m: 0.2 } } } } }, now);
    assert.ok(E.SAVE_VERSION >= 36 && s.version === E.SAVE_VERSION);
    assert.strictEqual(s.evals.learn.mis, 0.45);
    assert.deepStrictEqual(s.evals.learn.kinds['read.word'].closed, ['edit']);
    assert.deepStrictEqual(s.evals.learn.kinds['answer.sum'].closed, []);
    for (const bad of [-3, 'x', null, 9]) assert.ok([0, 1].includes(E.migrate({ version: E.SAVE_VERSION, evals: { learn: { mis: bad, kinds: {} } } }, now).evals.learn.mis));
});
