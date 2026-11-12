// Evals (evals.js): the learner, the ghost's attempts and taking a kind over. Stage 2 of design/evals-plan.md.
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

// A player for the tests: taps the right squares in reading order at a steady pace, wrong `sloppy` of the time.
function play(run, { first = 1.2, gap = 0.6, verify = 0.8, sloppy = 0, rand = Evals.rng(77), reverse = false } = {}) {
    const c = run.current;
    let picks = c.answer.slice();
    if (reverse) picks.reverse();
    if (rand() < sloppy) picks = picks.slice(1);
    const taps = picks.map((i, j) => ({ i, t: first + gap * j }));
    const seconds = first + gap * Math.max(0, picks.length - 1) + verify;
    return run.submit(picks, seconds, { taps, seconds });
}
const attempts = (learn, kind, n = 300) => {
    const rand = Evals.rng(5), grand = Evals.rng(9);
    const level = kind === 'pick.thing' ? 0 : kind === 'pick.scene' ? 3 : 6;
    const out = [];
    while (out.length < n) {
        const c = Evals.FAMILIES.pick.make(rand, level);
        if (c.kind === kind) out.push({ c, g: Evals.ghostAttempt(learn, c, grand) });
    }
    return out;
};
const rightShare = list => list.filter(x => x.g.correct).length / list.length;
const meanSeconds = list => list.reduce((s, x) => s + x.g.seconds, 0) / list.length;

test('knowing nothing, its attempts are nearly always wrong and slow; having learned a kind, right and quick', () => {
    const none = Evals.newLearn();
    const cold = attempts(none, 'pick.thing');
    assert.ok(rightShare(cold) < 0.05, `cold: ${rightShare(cold)}`);
    const learn = Evals.newLearn();
    Object.assign(Evals.kindOf(learn, 'pick.thing'), { m: 1, solves: 10, wrongs: 0 });
    const warm = attempts(learn, 'pick.thing');
    // Learned, it is right most of the time and still slips now and then (the owner's call).
    assert.ok(rightShare(warm) > 0.82 && rightShare(warm) < 0.96, `warm: ${rightShare(warm)}`);
    assert.ok(meanSeconds(warm) < meanSeconds(cold) / 3);
    // Half way, in between.
    Evals.kindOf(learn, 'pick.thing').m = 0.5;
    const mid = rightShare(attempts(learn, 'pick.thing'));
    assert.ok(mid > rightShare(cold) && mid < rightShare(warm), `mid: ${mid}`);
    // An attempt's own answer is what it tapped, and it never names a square off the grid.
    for (const { c, g } of [...cold, ...warm]) {
        assert.deepEqual(g.taps.filter(t => t.off === undefined).map(t => t.i).sort((a, b) => a - b), g.answer);
        assert.ok(g.taps.every(t => t.i >= 0 && t.i < c.cells.length && t.t > 0));
        assert.ok(g.taps.every(t => g.seconds >= (t.off ?? t.t)));
        assert.equal(g.correct, Evals.FAMILIES.pick.judge(c, g.answer));
    }
});

test('it learns only by watching, more from a clean quick solve than a slow one, least from a wrong one', () => {
    const c = Evals.FAMILIES.pick.make(Evals.rng(4), 0);
    const trace = seconds => ({ taps: c.answer.map((i, j) => ({ i, t: 0.5 + 0.3 * j })), seconds });
    const gain = (seconds, correct) => Evals.watch(Evals.newLearn(), c, trace(seconds), correct);
    const quick = gain(Evals.par(c) * 0.8, true), slow = gain(Evals.par(c) * 4, true), wrong = gain(Evals.par(c), false);
    assert.ok(quick > slow && slow > wrong && wrong > 0);
    assert.ok(Math.abs(quick - Evals.EVALS.learnQuick / Evals.EVALS.learnSolves) < 1e-9);
    // It never passes 1, and it keeps only the last few traces.
    const learn = Evals.newLearn();
    let last = 0;
    for (let i = 0; i < 40; i++) {
        Evals.watch(learn, c, trace(2), true);
        const m = learn.kinds['pick.thing'].m;
        assert.ok(m >= last && m <= 1);
        last = m;
    }
    assert.equal(last, 1);
    assert.equal(learn.kinds['pick.thing'].traces.length, Evals.EVALS.traces);
    assert.equal(learn.kinds['pick.thing'].solves, 40);
    // Another kind is untouched.
    assert.equal(learn.kinds['pick.scene'], undefined);
});

test('it copies your pace and your order', () => {
    const fast = Evals.newLearn(), slow = Evals.newLearn(), back = Evals.newLearn();
    const teach = (learn, opts) => {
        const run = Evals.createRun({ families: ['pick'], seed: 21, learn, comboFrom: 99, withoutFrom: 99, overtake: 999 });
        for (let i = 0; i < 12; i++) play(run, opts);
    };
    teach(fast, { first: 0.6, gap: 0.3, verify: 0.4 });
    teach(slow, { first: 2.4, gap: 1.2, verify: 1.6 });
    teach(back, { first: 0.6, gap: 0.3, verify: 0.4, reverse: true });
    for (const learn of [fast, slow, back]) learn.kinds['pick.thing'].m = 1;
    assert.ok(meanSeconds(attempts(slow, 'pick.thing')) > meanSeconds(attempts(fast, 'pick.thing')) * 2.5);
    // Taught top-left to bottom-right, its taps mostly climb the grid; taught the other way, they mostly fall.
    const rising = learn => {
        let up = 0, pairs = 0;
        for (const { g } of attempts(learn, 'pick.thing')) for (let j = 1; j < g.taps.length; j++) { pairs++; if (g.taps[j].i > g.taps[j - 1].i) up++; }
        return up / pairs;
    };
    assert.ok(rising(fast) > 0.8, `forward: ${rising(fast)}`);
    assert.ok(rising(back) < 0.2, `backward: ${rising(back)}`);
});

test('it copies before it understands: knowing little, it taps where you tapped on your last one, in your order', () => {
    const learn = Evals.newLearn();
    const k = Evals.kindOf(learn, 'pick.thing');
    k.traces.push({ side: 3, correct: true, seconds: 4, undos: 0, taps: [{ i: 8, t: 1 }, { i: 4, t: 1.6 }, { i: 0, t: 2.2 }] });
    k.solves = 1;
    k.m = 0.03;
    const list = attempts(learn, 'pick.thing');
    // Nearly every attempt is your three squares, bottom-right to top-left, whatever the pictures are.
    const same = list.filter(x => x.g.taps.map(t => t.i).join() === '8,4,0').length / list.length;
    assert.ok(same > 0.6, `same as you: ${same}`);
    assert.ok(rightShare(list) < 0.1);
    // `off` counts the squares its answer was wrong by, and it shrinks as it learns.
    for (const { c, g } of list) {
        const right = new Set(c.answer);
        assert.equal(g.off, c.cells.filter((_, i) => g.answer.includes(i) !== right.has(i)).length);
        assert.equal(g.off === 0, g.correct);
    }
    const meanOff = m => { k.m = m; const a = attempts(learn, 'pick.thing'); return a.reduce((s, x) => s + x.g.off, 0) / a.length; };
    const offs = [0.05, 0.3, 0.6, 0.8, 1].map(meanOff);
    for (let j = 1; j < offs.length; j++) assert.ok(offs[j] < offs[j - 1], `off by ${offs}`);
    assert.ok(offs[0] > 3 && offs[4] < 0.3, `off by ${offs}`);
    // On a bigger grid it taps the same places, stretched: your corner is still its corner.
    k.m = 0.03;
    const rand = Evals.rng(3), grand = Evals.rng(4);
    let corners = 0;
    for (let n = 0; n < 100; n++) { const c = Evals.FAMILIES.pick.make(rand, 9, { ...Evals.EVALS, comboFrom: 99, withoutFrom: 99 }); assert.equal(c.side, 4); if (Evals.ghostAttempt(learn, c, grand).answer.includes(15)) corners++; }
    assert.ok(corners > 80, `corner: ${corners}`);
});

test('it copies your mistakes: taught sloppily, it stays wrong more often', () => {
    const clean = Evals.newLearn(), sloppy = Evals.newLearn();
    for (const [learn, rate] of [[clean, 0], [sloppy, 0.5]]) {
        for (let seed = 1; seed <= 6; seed++) {
            const run = Evals.createRun({ families: ['pick'], seed, learn, lives: 999, comboFrom: 99, withoutFrom: 99, overtake: 999 });
            const rand = Evals.rng(seed + 50);
            for (let i = 0; i < 10; i++) play(run, { sloppy: rate, rand });
        }
        learn.kinds['pick.thing'].m = 1;
    }
    assert.ok(Evals.errorRate(sloppy.kinds['pick.thing']) > Evals.errorRate(clean.kinds['pick.thing']));
    const sloppyRight = rightShare(attempts(sloppy, 'pick.thing')), cleanRight = rightShare(attempts(clean, 'pick.thing'));
    assert.ok(sloppyRight < cleanRight - 0.2, `sloppy ${sloppyRight}, clean ${cleanRight}`);
    // And about as often as you were: half its teacher's answers were wrong, so it is no better than half right, and
    // not far worse either.
    assert.ok(sloppyRight > 0.35 && sloppyRight < 0.7, `sloppy ${sloppyRight}`);
});

test('a run: it takes a kind over once it is right and first several times running, and the kind leaves the run', () => {
    const learn = Evals.newLearn();
    let took = null, runs = 0;
    while (!took && runs < 80) {
        runs++;
        const run = Evals.createRun({ families: ['pick'], seed: runs, learn });
        for (let i = 0; i < 2 && !took; i++) {
            assert.equal(run.current.kind, 'pick.thing');
            const r = play(run);
            if (r.takeover) took = r;
        }
    }
    assert.ok(took, 'never took over');
    // A clean, steady player keeps a kind for about 40 solves (the owner's call).
    const watched = learn.kinds['pick.thing'].solves;
    assert.ok(watched >= 30 && watched <= 55, `took over after ${watched} solves`);
    assert.equal(took.takeover, 'pick.thing');
    assert.ok(learn.kinds['pick.thing'].taken);
    assert.ok(learn.kinds['pick.thing'].m > 0.9, 'it took over before it had learned much');
    // From now on a run never shows that kind, even at the levels that used to.
    for (let seed = 1; seed <= 20; seed++) {
        const run = Evals.createRun({ families: ['pick'], seed, learn, overtake: 999 });
        for (let i = 0; i < 6; i++) { assert.notEqual(run.current.kind, 'pick.thing'); play(run); }
    }
});

test('not ahead, no takeover: a wrong or slower attempt sets it back one, never under none', () => {
    const learn = Evals.newLearn();
    Object.assign(Evals.kindOf(learn, 'pick.thing'), { m: 1, ahead: Evals.EVALS.overtake - 1 });
    const run = Evals.createRun({ families: ['pick'], seed: 2, learn });
    // You answer in no time at all, so it can't have been first.
    const r = run.submit(run.current.answer, 0.01, { taps: run.current.answer.map((i, j) => ({ i, t: 0.001 * j })), seconds: 0.01 });
    assert.ok(r.correct && !r.ahead && !r.takeover);
    assert.equal(learn.kinds['pick.thing'].ahead, Evals.EVALS.overtake - 2);
    learn.kinds['pick.thing'].ahead = 0;
    const c = run.current;
    run.submit(c.answer, 0.01, { taps: c.answer.map((i, j) => ({ i, t: 0.001 * j })), seconds: 0.01 });
    assert.equal(learn.kinds['pick.thing'].ahead, 0);
});

test('three phases: bad for a good while, then at about your pace and often wrong, then ahead', () => {
    const at = m => { const learn = Evals.newLearn(); Object.assign(Evals.kindOf(learn, 'pick.thing'), { m, solves: 10 }); const a = attempts(learn, 'pick.thing'); return { right: rightShare(a), seconds: meanSeconds(a) }; };
    const yours = Evals.PACE.first + Evals.PACE.gap * 2 + Evals.PACE.verify;   // about what three squares take you
    const bad = at(0.25), mimic = at(0.6), late = at(0.85), done = at(1);
    assert.ok(bad.right < 0.1, `bad: ${bad.right}`);
    assert.ok(mimic.right > 0.15 && mimic.right < 0.6, `mimic: ${mimic.right}`);
    assert.ok(Math.abs(mimic.seconds / yours - 1.15) < 0.25, `mimic pace: ${mimic.seconds / yours}`);
    assert.ok(late.right > 0.7 && late.seconds < mimic.seconds);
    assert.ok(done.seconds < late.seconds && done.seconds / yours < 0.7);
    // Its pace only ever quickens, and never jumps: no step between neighbouring amounts learned is over 6%.
    for (let m = 0.02; m <= 1.0001; m += 0.02) {
        const a = Evals.phase(m - 0.02, 1), b = Evals.phase(m, 1);
        assert.ok(b <= a && a / b < 1.06, `pace step at ${m.toFixed(2)}: ${a} to ${b}`);
    }
});

test('it copies your habit of tapping a square and taking it back', () => {
    const feints = undos => {
        const learn = Evals.newLearn();
        const run = Evals.createRun({ families: ['pick'], seed: 3, learn, lives: 999, comboFrom: 99, withoutFrom: 99, overtake: 999 });
        for (let i = 0; i < 10; i++) { const c = run.current; run.submit(c.answer, 3, { taps: c.answer.map((x, j) => ({ i: x, t: 1 + 0.5 * j })), seconds: 3, undos }); }
        learn.kinds['pick.thing'].m = 1;
        const list = attempts(learn, 'pick.thing');
        for (const { c, g } of list) for (const t of g.taps.filter(t => t.off !== undefined)) {
            assert.ok(t.off > t.t && !g.answer.includes(t.i) && t.i < c.cells.length);
        }
        return list.filter(x => x.g.taps.some(t => t.off !== undefined)).length / list.length;
    };
    assert.equal(feints(0), 0);
    const often = feints(1);
    assert.ok(often > 0.4 && often <= Evals.EVALS.undoMax + 0.08, `feints: ${often}`);
});

test('when it has taken every kind, there is nothing left to run', () => {
    const learn = Evals.newLearn();
    for (const kind of Object.keys(Evals.KINDS)) Evals.kindOf(learn, kind).taken = true;
    const run = Evals.createRun({ families: ['pick'], seed: 1, learn });
    assert.ok(run.over && run.exhausted);
    assert.equal(run.current, null);
    assert.equal(run.submit([0]), null);
    // With one kind left, every captcha is that kind.
    learn.kinds['pick.without'].taken = false;
    const left = Evals.createRun({ families: ['pick'], seed: 1, learn, overtake: 999 });
    for (let i = 0; i < 12; i++) { assert.equal(left.current.kind, 'pick.without'); play(left); }
});

test('what it does never changes which captchas come up, and a trace is cleaned whatever is handed in', () => {
    const seq = learn => {
        const run = Evals.createRun({ families: ['pick'], seed: 8, learn, overtake: 999 });
        const out = [];
        for (let i = 0; i < 6; i++) { out.push(run.current.prompt); run.submit(run.current.answer, 2); }
        return out.join('|');
    };
    const taught = Evals.newLearn();
    Evals.kindOf(taught, 'pick.thing').m = 1;
    assert.equal(seq(Evals.newLearn()), seq(taught));
    const t = Evals.cleanTrace({ taps: [{ i: 99, t: 1 }, { i: 2, t: -1 }, { i: 3, t: 2 }, { i: 1, t: 1 }, null, { i: 'x', t: 1 }], seconds: 'soon', path: [10, 5, 5, 'x', 1, 1, 20, 9000, 5, 30, 7, 8] }, 9, 3);
    assert.deepEqual(t.taps, [{ i: 1, t: 1 }, { i: 3, t: 2 }]);
    assert.equal(t.seconds, 2);
    assert.deepEqual(t.path, [10, 5, 5, 30, 7, 8]);
    assert.equal(Evals.cleanTrace(null, 9, 3).taps.length, 0);
});
