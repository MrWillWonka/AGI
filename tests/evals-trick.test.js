// Evals (evals.js): the trick questions. Stage 4 of design/evals-plan.md.
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');

const trace = (c, seconds = 3) => ({ taps: c.answer.map((i, j) => ({ i, t: 1 + 0.4 * j })), seconds, bend: 1.2, offset: 0.3 });
// A run of trick questions only, with something behind it so every question can be asked.
const quizRun = (opts = {}) => Evals.createRun({ ladder: 0, seed: 6, families: ['trick'], overtake: 999, ...opts });
const withHistory = () => {
    const run = Evals.createRun({ ladder: 0, seed: 6, families: ['answer', 'trick'], overtake: 999 });
    run.submit(run.current.answer, 3, trace(run.current));
    return run;
};

test('every trick question is well formed and its own answer is right', () => {
    const ids = new Set();
    const run = { lives: 2, log: [{ ghost: true }] };
    Evals.QUIZ.forEach((q, at) => {
        const c = Evals.FAMILIES.trick.make(Evals.rng(1), at, Evals.EVALS, null, run);
        assert.equal(c.id, q.id);
        assert.equal(c.at, at);
        assert.equal(c.of, Evals.QUIZ.length);
        ids.add(c.id);
        assert.match(c.prompt, /[.?]$/);
        assert.ok(c.targets.length >= 2 && c.targets.every(t => t.text && t.label), c.id);
        assert.ok(c.answer.every(i => i >= 0 && i < c.targets.length), c.id);
        assert.ok(Evals.judge(c, c.answer), `${c.id}: its own answer is judged wrong`);
        // Every other single answer is wrong, so no question has two right answers.
        if (c.single) c.targets.forEach((_, i) => assert.equal(Evals.judge(c, [i]), i === c.answer[0], `${c.id}: target ${i}`));
        // A target named in the sentence is one of the question's targets, and only named there.
        for (const m of c.prompt.matchAll(/\{(\d+)\}/g)) assert.ok(c.targets[+m[1]].inline, c.id);
        assert.equal(c.targets.filter(t => t.inline).length, [...c.prompt.matchAll(/\{(\d+)\}/g)].length, c.id);
    });
    assert.equal(ids.size, Evals.QUIZ.length);
    assert.ok(Evals.QUIZ.length >= 6);
});

test('the answers are the fair ones', () => {
    const ask = (id, run = { lives: 3, log: [{ ghost: false }] }) => Evals.FAMILIES.trick.make(Evals.rng(1), Evals.QUIZ.findIndex(q => q.id === id), Evals.EVALS, null, run);
    const said = c => c.answer.map(i => c.targets[i].text);
    // "four" is the one number with as many letters as it says.
    const letters = ask('letters');
    assert.deepEqual(said(letters), ['four']);
    assert.deepEqual(letters.targets.map(t => t.text).filter(w => ({ three: 3, four: 4, five: 5, six: 6 })[w] === w.length), ['four']);
    // The word is in the sentence, not on a button.
    const word = ask('word');
    assert.deepEqual(said(word), ['human']);
    assert.ok(word.targets[word.answer[0]].inline && word.targets.filter(t => !t.inline).every(t => t.text !== 'human'));
    // Tap nothing: any tap is wrong, even the button that says Verify.
    const nothing = ask('nothing');
    assert.deepEqual(nothing.answer, []);
    nothing.targets.forEach((_, i) => assert.ok(!Evals.judge(nothing, [i])));
    assert.deepEqual(said(ask('alphabet')), ['AI', 'Evals', 'Human', 'Verify']);
    // The third word of "Tap the third word of this sentence."
    const third = ask('third');
    assert.equal(third.prompt.split(' ')[2], said(third)[0]);
    // The page's own state: your lives, and what the AI did last.
    for (const lives of [1, 2, 3]) assert.deepEqual(said(ask('lives', { lives, log: [] })), [String(lives)]);
    assert.deepEqual(said(ask('watched', { lives: 3, log: [{ ghost: true }] })), ['Yes']);
    assert.deepEqual(said(ask('watched', { lives: 3, log: [{ ghost: true }, { ghost: false }] })), ['No']);
});

test('a question that can\'t be asked yet is passed over for the next', () => {
    // With nothing behind the run, "was its last answer right?" has no answer: the first question comes instead.
    const watched = Evals.QUIZ.findIndex(q => q.id === 'watched');
    assert.equal(Evals.FAMILIES.trick.make(Evals.rng(1), watched, Evals.EVALS, null, { lives: 3, log: [] }).id, Evals.QUIZ[(watched + 1) % Evals.QUIZ.length].id);
    assert.equal(Evals.FAMILIES.trick.make(Evals.rng(1), Evals.QUIZ.findIndex(q => q.id === 'lives'), Evals.EVALS, null, null).id, 'third');
});

test('a fixed order: each right answer brings the next, and a miss sends the run back to the first', () => {
    const run = withHistory();
    const order = [];
    while (order.length < Evals.QUIZ.length) {
        if (run.current.family === 'trick') { order.push(run.current.id); assert.equal(run.current.at, order.length - 1); }
        assert.ok(run.submit(run.current.answer, 3, trace(run.current)).correct);
    }
    assert.deepEqual(order, Evals.QUIZ.map(q => q.id));
    assert.equal(run.trickAt, Evals.QUIZ.length);
    // Round again from the first; then a miss on the third sends it back to the first.
    const again = quizRun();
    assert.equal(again.current.id, 'letters');
    again.submit(again.current.answer, 3, trace(again.current));
    again.submit(again.current.answer, 3, trace(again.current));
    assert.equal(again.current.id, 'nothing');
    const miss = again.submit([0], 3, { taps: [{ i: 0, t: 1 }], seconds: 3 });
    assert.ok(!miss.correct);
    assert.equal(again.lives, Evals.EVALS.lives - 1);
    assert.equal(again.current.id, 'letters');
});

test('"how many lives" follows the run: miss one and the answer changes', () => {
    const run = quizRun();
    const at = Evals.QUIZ.findIndex(q => q.id === 'lives');
    run.trickAt = at;
    run.submit([], 3, { taps: [], seconds: 3 });   // whatever is up, wrong: a life gone, back to the first
    run.trickAt = at;
    run.submit(run.current.answer, 3, trace(run.current));
    const c = Evals.FAMILIES.trick.make(Evals.rng(1), at, Evals.EVALS, null, run);
    assert.deepEqual(c.answer.map(i => c.targets[i].text), [String(Evals.EVALS.lives - 1)]);
});

test('the AI learns them like any other kind, and can take them over', () => {
    const learn = Evals.newLearn();
    const run = Evals.createRun({ ladder: 0, seed: 2, families: ['trick'], learn, overtake: 999, lives: 999 });
    for (let i = 0; i < 30; i++) run.submit(run.current.answer, 3, trace(run.current));
    const k = learn.kinds['trick.question'];
    assert.ok(k.m > 0.5 && k.solves === 30);
    const share = m => {
        k.m = m;
        const rand = Evals.rng(3);
        let right = 0;
        for (let n = 0; n < 280; n++) {
            const c = Evals.FAMILIES.trick.make(Evals.rng(1), n % Evals.QUIZ.length, Evals.EVALS, null, { lives: 3, log: [{ ghost: true }] });
            const g = Evals.ghostAttempt(learn, c, rand);
            assert.ok(g.taps.every(t => t.i >= 0 && t.i < c.targets.length));
            right += g.correct;
        }
        return right / 280;
    };
    assert.ok(share(0.05) < 0.5, `knowing little: ${share(0.05)}`);
    assert.ok(share(1) > 0.8, `learned: ${share(1)}`);
    k.taken = true;
    assert.ok(Evals.createRun({ ladder: 0, seed: 2, families: ['trick'], learn }).exhausted);
});
