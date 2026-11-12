// Evals (evals.js): the run and the Pick family. Stage 1 of design/evals-plan.md.
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const LEVELS = [0, 1, 2, 3, 5, 6, 7, 9, 12];

test('every Pick captcha has at least one right square and one wrong one, and its answer matches its own cells', () => {
    for (const seed of SEEDS) {
        for (const level of LEVELS) {
            const c = Evals.FAMILIES.pick.make(Evals.rng(seed * 31 + level), level);
            assert.equal(c.cells.length, c.side * c.side);
            assert.deepEqual(c.answer, Evals.pickTargets(c));
            assert.ok(c.answer.length >= 1, `seed ${seed} level ${level}: nothing to tap`);
            assert.ok(c.answer.length < c.cells.length, `seed ${seed} level ${level}: every square is right`);
            assert.ok(c.prompt.includes(c.scene));
        }
    }
});

test('Pick grows with the level: plain things, then scenes, then "without", then a bigger grid', () => {
    const kinds = level => new Set(SEEDS.map(s => Evals.FAMILIES.pick.make(Evals.rng(s), level).kind));
    assert.deepEqual([...kinds(0)], ['pick.thing']);
    assert.ok(!kinds(Evals.EVALS.comboFrom).has('pick.thing'));
    assert.ok(!kinds(Evals.EVALS.withoutFrom - 1).has('pick.without'));
    assert.ok(kinds(Evals.EVALS.withoutFrom).has('pick.without'));
    assert.equal(Evals.FAMILIES.pick.make(Evals.rng(1), Evals.EVALS.bigFrom - 1).side, 3);
    assert.equal(Evals.FAMILIES.pick.make(Evals.rng(1), Evals.EVALS.bigFrom).side, 4);
    // A plain thing never wears a hat; a scene's target always does.
    for (const s of SEEDS) {
        assert.ok(Evals.FAMILIES.pick.make(Evals.rng(s), 0).cells.every(cell => !cell.hat));
        assert.ok(Evals.FAMILIES.pick.make(Evals.rng(s), Evals.EVALS.comboFrom).target.hat);
    }
});

test('the judge takes the right squares in any order and nothing else', () => {
    const c = Evals.FAMILIES.pick.make(Evals.rng(7), 3);
    const judge = a => Evals.FAMILIES.pick.judge(c, a);
    assert.ok(judge(c.answer));
    assert.ok(judge(c.answer.slice().reverse()));
    assert.ok(judge([...c.answer, c.answer[0]]), 'a square tapped twice counts once');
    assert.ok(!judge(c.answer.slice(1)), 'one missing');
    const wrong = c.cells.findIndex((_, i) => !c.answer.includes(i));
    assert.ok(!judge([...c.answer, wrong]), 'one too many');
    assert.ok(!judge([]));
    assert.ok(!judge(null));
});

test('the names on the pictures are all different, so a prompt can only mean one thing', () => {
    assert.equal(new Set(Evals.THINGS.map(t => t.name)).size, Evals.THINGS.length);
    assert.equal(new Set(Evals.THINGS.map(t => t.glyph)).size, Evals.THINGS.length);
    assert.equal(new Set(Evals.HATS.map(h => h.glyph)).size, Evals.HATS.length);
    const all = new Set([...Evals.THINGS, ...Evals.HATS].map(x => x.glyph));
    assert.equal(all.size, Evals.THINGS.length + Evals.HATS.length, 'no picture is both a thing and a hat');
});

test('a run: right answers raise the level, a miss costs a life, and it ends when the lives are gone', () => {
    const run = Evals.createRun({ ladder: 0, handoff: 0, families: ['pick'], seed: 3 });
    assert.equal(run.lives, Evals.EVALS.lives);
    for (let i = 0; i < 5; i++) {
        const r = run.submit(run.current.answer, 2);
        assert.ok(r.correct);
        assert.equal(run.current.level, i + 1);
    }
    assert.equal(run.solved, 5);
    assert.equal(run.streak, 5);
    let r;
    for (let i = 0; i < Evals.EVALS.lives; i++) {
        assert.ok(!run.over);
        const level = run.current.level;
        r = run.submit([], 1);
        assert.ok(!r.correct);
        assert.deepEqual(r.answer, r.captcha.answer, 'a miss says what was right');
        if (!run.over) assert.equal(run.current.level, level, 'the next one stays at the same level');
    }
    assert.ok(r.over);
    assert.ok(run.over);
    assert.equal(run.current, null);
    assert.equal(run.streak, 0);
    assert.equal(run.bestStreak, 5);
    assert.equal(run.submit([0]), null, 'nothing is judged after the end');
    assert.equal(run.log.length, 5 + Evals.EVALS.lives);
});

test('a solver passes every captcha and a random tapper runs out of lives quickly', () => {
    const solver = Evals.createRun({ ladder: 0, handoff: 0, families: ['pick'], seed: 11 });
    for (let i = 0; i < 60; i++) assert.ok(solver.submit(solver.current.answer).correct);
    assert.equal(solver.lives, Evals.EVALS.lives);
    let solved = 0;
    for (const seed of SEEDS.slice(0, 50)) {
        const run = Evals.createRun({ ladder: 0, handoff: 0, families: ['pick'], seed });
        const rand = Evals.rng(seed + 999);
        while (!run.over) run.submit(run.current.cells.map((_, i) => i).filter(() => rand() < 0.4));
        solved += run.solved;
    }
    assert.ok(solved / 50 < 0.5, `random taps solved ${solved / 50} a run`);
});

test('a seed plays the same run twice, and different seeds differ', () => {
    const play = seed => {
        const run = Evals.createRun({ ladder: 0, handoff: 0, families: ['pick'], seed });
        const out = [];
        for (let i = 0; i < 8; i++) { out.push(JSON.stringify(run.current)); run.submit(run.current.answer); }
        return out.join('|');
    };
    assert.equal(play(5), play(5));
    assert.notEqual(play(5), play(6));
});
