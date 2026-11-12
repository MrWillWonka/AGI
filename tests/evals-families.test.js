// Evals (evals.js): every family of captcha, the one learner they share, and the pointer shapes it copies.
// Stage 3 of design/evals-plan.md.
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);
const LEVELS = [0, 1, 2, 3, 4, 6, 8, 12];
// The trick questions are written, not generated, and have their own tests (evals-trick.test.js).
const FAMILY_NAMES = Object.keys(Evals.FAMILIES).filter(f => f !== 'trick');
const KIND_NAMES = Object.keys(Evals.KINDS).filter(k => Evals.KINDS[k].family !== 'trick');
// A trace a person might leave: unhurried, a pointer path with a bend in it, a tap off the box's centre.
const human = (c, seconds = 3) => ({ taps: c.answer.map((i, j) => ({ i, t: 1 + 0.4 * j })), seconds, bend: 1.2, offset: 0.3 });
const each = fn => { for (const family of FAMILY_NAMES) for (const seed of SEEDS) for (const level of LEVELS) fn(Evals.FAMILIES[family].make(Evals.rng(seed * 97 + level), level), family, seed, level); };

test('every captcha of every family is well formed, and its own answer is right', () => {
    const kinds = new Set();
    each((c, family, seed, level) => {
        const at = `${family} seed ${seed} level ${level}`;
        kinds.add(c.kind);
        assert.equal(c.family, family, at);
        assert.equal(Evals.KINDS[c.kind].family, family, at);
        assert.ok(['set', 'seq', 'tick'].includes(c.mode), at);
        assert.ok(c.prompt.endsWith('.'), at);
        assert.ok(c.targets.length >= 1 && c.targets.length <= 64, at);
        assert.ok(c.targets.every(t => typeof t.label === 'string' && t.label.length > 0), `${at}: a target with no name`);
        assert.ok(c.answer.length >= 1 && c.answer.every(i => Number.isInteger(i) && i >= 0 && i < c.targets.length), at);
        assert.ok(Evals.judge(c, c.answer, human(c)), `${at}: its own answer is judged wrong`);
        assert.ok(!Evals.judge(c, [], human(c)), at);
        assert.equal(Evals.offBy(c, c.answer), 0, at);
        if (c.single) assert.equal(c.answer.length, 1, at);
        if (c.mode === 'seq') assert.deepEqual(c.answer.map(i => c.targets[i].v), c.want, at);
        if (c.mode === 'set' && c.targets.length > 1) assert.ok(c.answer.length < c.targets.length, `${at}: every target is right`);
        if (c.side) assert.equal(c.targets.length, c.side * c.side, at);
        assert.ok(Evals.par(c) > 0, at);
    });
    assert.deepEqual([...kinds].sort(), KIND_NAMES.slice().sort(), 'a kind no family ever makes');
});

test('a wrong answer is judged wrong in every mode', () => {
    each((c, family) => {
        if (c.mode === 'set') {
            const wrong = c.targets.findIndex((_, i) => !c.answer.includes(i));
            if (wrong >= 0) {
                assert.ok(!Evals.judge(c, c.single ? [wrong] : [...c.answer, wrong]), family);
                assert.ok(Evals.offBy(c, c.single ? [wrong] : [...c.answer, wrong]) >= 1, family);
            }
        } else if (c.mode === 'seq') {
            assert.ok(!Evals.judge(c, c.answer.slice(0, -1)), family);
            assert.ok(!Evals.judge(c, [...c.answer, c.answer[0]]), family);
            const swapped = c.answer.slice().reverse();
            if (swapped.map(i => c.targets[i].v).join() !== c.want.join()) assert.ok(!Evals.judge(c, swapped), family);
            assert.equal(Evals.offBy(c, c.answer.slice(0, -1)), 1, family);
        }
    });
});

test('Read: the tray holds the word and letters it lacks, and either of two like tiles will do', () => {
    for (const seed of SEEDS) for (const level of LEVELS) {
        const c = Evals.FAMILIES.read.make(Evals.rng(seed + level * 7), level);
        const tiles = c.targets.map(t => t.v);
        assert.ok(Evals.WORDS.includes(c.show.word));
        for (const l of new Set(c.show.word)) assert.ok(tiles.filter(t => t === l).length >= [...c.show.word].filter(x => x === l).length);
        assert.ok(tiles.filter(t => !c.show.word.includes(t)).length >= 3, 'no spare letters');
        assert.equal(c.show.warp.length, c.show.word.length);
        assert.equal(c.show.struck, c.kind === 'read.struck');
        // The same word spelt with the other tile of a repeated letter is right too.
        const twin = c.answer.map(i => tiles.lastIndexOf(tiles[i]));
        assert.ok(Evals.judge(c, twin));
    }
    assert.ok(Evals.WORDS.every(w => /^[a-z]{5,6}$/.test(w)));
    assert.equal(new Set(Evals.WORDS).size, Evals.WORDS.length);
});

test('Answer: the sum is right, the four answers differ, none is negative', () => {
    for (const seed of SEEDS) for (const level of LEVELS) {
        const c = Evals.FAMILIES.answer.make(Evals.rng(seed * 3 + level), level);
        const values = c.targets.map(t => t.v);
        assert.equal(new Set(values).size, values.length);
        assert.ok(values.every(v => v >= 0));
        const right = values[c.answer[0]];
        if (c.kind === 'answer.sum') {
            const [, a, op, b] = c.show.question.match(/^(\d+) ([+−]) (\d+) = \?$/);
            assert.equal(right, op === '+' ? +a + +b : +a - +b);
        } else assert.match(c.show.question, /^What is [a-z]+ (plus|minus) [a-z]+\?$/);
    }
});

test('Handle: one slot fits the piece, and the pictures to tap in order are all different', () => {
    for (const seed of SEEDS) for (const level of LEVELS) {
        const c = Evals.FAMILIES.handle.make(Evals.rng(seed * 5 + level), level);
        const values = c.targets.map(t => t.v);
        assert.equal(new Set(values).size, values.length, 'two targets alike');
        if (c.kind === 'handle.slide') assert.equal(values[c.answer[0]], c.show.piece);
        else { assert.deepEqual(c.show.order, c.want); assert.ok(c.targets.length > c.want.length); }
    }
    assert.equal(new Set(Evals.SHAPES.map(s => s.glyph)).size, Evals.SHAPES.length);
});

test('Listen: a pattern on its pads that is never one pad over and over', () => {
    for (const seed of SEEDS) for (const level of LEVELS) {
        const c = Evals.FAMILIES.listen.make(Evals.rng(seed * 11 + level), level);
        assert.ok(c.show.pattern.every(p => p >= 0 && p < c.targets.length));
        assert.ok(new Set(c.show.pattern).size > 1);
        assert.ok(c.wait > 0 && c.show.step > 0.3);
        assert.deepEqual(c.want, c.show.pattern);
    }
});

test('Future: the ball lands where the arrows send it, and exactly one square changes', () => {
    for (const seed of SEEDS) for (const level of LEVELS) {
        const c = Evals.FAMILIES.future.make(Evals.rng(seed * 13 + level), level);
        if (c.kind === 'future.drop') {
            let col = c.show.start;
            for (const row of c.show.rows) { assert.equal(row.length, c.show.cols); col = Math.max(0, Math.min(c.show.cols - 1, col + row[col])); }
            assert.deepEqual(c.answer, [col]);
            assert.equal(c.targets.length, c.show.cols);
        } else {
            const changed = c.targets.map((t, i) => (t.glyph !== c.show.before[i] ? i : -1)).filter(i => i >= 0);
            assert.deepEqual(changed, c.answer);
            assert.ok(c.wait >= 1.2);
        }
    }
});

test('the tick box: too quick, too straight or too dead-centre is a robot', () => {
    const c = Evals.FAMILIES.invisible.make(Evals.rng(1), 0);
    const ok = { seconds: 1.4, bend: 1.2, offset: 0.2 };
    assert.equal(Evals.tickVerdict(ok), null);
    assert.equal(Evals.tickVerdict({ ...ok, seconds: 0.3 }), 'quick');
    assert.equal(Evals.tickVerdict({ ...ok, bend: 1.001 }), 'straight');
    assert.equal(Evals.tickVerdict({ ...ok, offset: 0.01 }), 'centre');
    // A touch screen has no path: nothing to be too straight.
    assert.equal(Evals.tickVerdict({ ...ok, bend: 0 }), null);
    assert.ok(Evals.judge(c, [0], ok));
    assert.ok(!Evals.judge(c, [0], { ...ok, seconds: 0.1 }));
    assert.ok(!Evals.judge(c, [], ok));
    const run = Evals.createRun({ seed: 1, families: ['invisible'] });
    assert.equal(run.submit([0], 0.2, { taps: [{ i: 0, t: 0.2 }], bend: 1.2, offset: 0.2 }).why, 'quick');
    assert.equal(run.submit([0], 1.5, { taps: [{ i: 0, t: 1.5 }], bend: 1.2, offset: 0.2 }).why, null);
});

test('a run goes round the families in order, each getting harder with its own solves, and skips what the AI has taken', () => {
    const run = Evals.createRun({ seed: 9, overtake: 999 });
    const seen = [];
    for (let i = 0; i < 28; i++) {
        const c = run.current;
        seen.push(c.family);
        assert.equal(c.level, Math.floor(i / Evals.ORDER.length), `${c.family} level`);
        assert.ok(run.submit(c.answer, 3, human(c)).correct, c.kind);
    }
    assert.deepEqual(seen.slice(0, Evals.ORDER.length * 2), [...Evals.ORDER, ...Evals.ORDER]);
    // With a whole family taken, the run passes over it; with everything taken, there is no run.
    const learn = Evals.newLearn();
    for (const kind of Object.keys(Evals.KINDS)) if (Evals.KINDS[kind].family !== 'answer') Evals.kindOf(learn, kind).taken = true;
    const only = Evals.createRun({ seed: 2, learn, overtake: 999 });
    for (let i = 0; i < 10; i++) { assert.equal(only.current.family, 'answer'); only.submit(only.current.answer, 3, human(only.current)); }
    Evals.kindOf(learn, 'answer.sum').taken = Evals.kindOf(learn, 'answer.words').taken = true;
    assert.ok(Evals.createRun({ seed: 2, learn }).exhausted);
});

test('one learner for every kind: it goes from mostly wrong to mostly right, and its attempt is always playable', () => {
    for (const kind of KIND_NAMES) {
        const family = Evals.KINDS[kind].family;
        const share = m => {
            const learn = Evals.newLearn();
            // It has watched you: a few solves of this kind in the bank.
            const teach = Evals.createRun({ seed: 3, learn, families: [family], overtake: 999, lives: 999 });
            for (let i = 0; i < 40; i++) teach.submit(teach.current.answer, 3, human(teach.current));
            if (!learn.kinds[kind]) return null;
            learn.kinds[kind].m = m;
            const rand = Evals.rng(41), grand = Evals.rng(43);
            let n = 0, right = 0, guard = 0;
            while (n < 200 && guard++ < 20000) {
                const c = Evals.FAMILIES[family].make(rand, guard % 9);
                if (c.kind !== kind) continue;
                n++;
                const g = Evals.ghostAttempt(learn, c, grand);
                right += g.correct;
                assert.ok(g.taps.every(t => Number.isInteger(t.i) && t.i >= 0 && t.i < c.targets.length && t.t >= 0), kind);
                assert.ok(g.seconds > 0 && g.taps.every(t => g.seconds >= (t.off ?? t.t)), kind);
                assert.equal(g.moves.length, g.taps.length + 1, kind);
                assert.equal(g.off === 0, g.correct, kind);
                if (c.mode !== 'tick') assert.equal(g.correct, Evals.judge(c, g.answer), kind);
            }
            assert.equal(n, 200, `${kind} never came up`);
            return right / n;
        };
        const cold = share(0.05), warm = share(1);
        // A single choice is right by luck one time in a few; everything else is nearly never right by luck.
        const single = ['answer', 'future'].includes(family) || kind === 'handle.slide';
        assert.ok(cold < (single ? 0.55 : 0.15), `${kind} knowing little: ${cold}`);
        assert.ok(warm > 0.8, `${kind} learned: ${warm}`);
    }
});

test('the tick box: the AI is too perfect until it has learned how you do it', () => {
    const learn = Evals.newLearn();
    const c = Evals.FAMILIES.invisible.make(Evals.rng(1), 0);
    const grand = Evals.rng(5);
    for (let i = 0; i < 50; i++) { const g = Evals.ghostAttempt(learn, c, grand); assert.ok(!g.correct && g.seconds < Evals.EVALS.tickMin, 'it passed having never seen you'); }
    for (let i = 0; i < 5; i++) Evals.watch(learn, c, { taps: [{ i: 0, t: 1.3 }], seconds: 1.3, bend: 1.3, offset: 0.2 }, true);
    learn.kinds['invisible.tick'].m = 1;
    let passed = 0;
    for (let i = 0; i < 200; i++) { const g = Evals.ghostAttempt(learn, c, grand); if (g.correct) { passed++; assert.ok(g.seconds >= Evals.EVALS.tickMin, 'right, but too quick to be a person'); } }
    assert.ok(passed > 160, `passed ${passed} of 200`);
});

test('it copies how your pointer moves: the shapes you drew between taps become the paths of its hand', () => {
    const learn = Evals.newLearn();
    const c = Evals.FAMILIES.pick.make(Evals.rng(4), 0);
    // A solve whose pointer swings wide to one side on the way to each tap, and waits before the first.
    const taps = c.answer.map((i, j) => ({ i, t: 2 + j }));
    const centre = i => [Math.round((i % 3 + 0.5) / 3 * 1000), Math.round((Math.floor(i / 3) + 0.5) / 3 * 1000)];
    const path = [];
    let from = [500, 1100], t0 = 0;
    for (const tap of taps) {
        const to = centre(tap.i);
        for (let s = 0; s <= 10; s++) {
            const f = s / 10, bow = Math.sin(Math.PI * f) * 180;
            const dx = to[0] - from[0], dy = to[1] - from[1], d = Math.hypot(dx, dy) || 1;
            path.push(Math.round((t0 + (tap.t - t0) * f) * 100), Math.round(from[0] + dx * f - dy / d * bow), Math.round(from[1] + dy * f + dx / d * bow));
        }
        from = to;
        t0 = tap.t;
    }
    const seconds = taps[taps.length - 1].t + 1;
    assert.deepEqual(Evals.shapes(Evals.kindOf(learn, c.kind)), []);
    Evals.watch(learn, c, { taps, seconds, path }, true);
    const shapes = Evals.shapes(learn.kinds[c.kind]);
    assert.ok(shapes.length >= taps.length - 1, `shapes: ${shapes.length}`);
    for (const shape of shapes) {
        assert.deepEqual(shape[0], [0, 0, 0]);
        assert.deepEqual(shape[shape.length - 1], [1, 1, 0]);
        assert.ok(shape.length >= 4 && shape.length <= 20);
        assert.ok(shape.every(p => p.length === 3 && p.every(Number.isFinite)));
        // The swing to the side is in the shape, on the same side every time.
        assert.ok(Math.max(...shape.map(p => p[2])) > 0.15, 'the bow is gone');
    }
    const g = Evals.ghostAttempt(learn, c, Evals.rng(8));
    const drawn = shapes.map(shape => JSON.stringify(shape));
    assert.ok(g.moves.every(move => drawn.includes(JSON.stringify(move))));
    // With no path (a touch screen), its hand has no shape to follow and none is made up.
    const touch = Evals.newLearn();
    Evals.watch(touch, c, { taps, seconds }, true);
    assert.ok(Evals.ghostAttempt(touch, c, Evals.rng(8)).moves.every(move => move === null));
    // Only your latest few solves keep their paths.
    for (let i = 0; i < 6; i++) Evals.watch(learn, c, { taps, seconds, path }, true);
    const kept = learn.kinds[c.kind].traces.filter(t => t.path.length > 0).length;
    assert.equal(kept, Evals.EVALS.paths);
});
