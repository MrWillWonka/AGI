// Marks, the combo, the score sheet, the upgrades and the AI's lane (the owner's picks after their first play,
// 2026-11-12): a verified captcha pays Marks, more on a quick clean streak; the sheet ranks your model against made-up
// ones by accuracy; Marks buy upgrades; and the kinds you handed over run beside you in a lane of the AI's own.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Evals = require('../evals.js');
const E = require('../engine.js');

const brisk = run => run.submit(run.current.answer, Evals.par(run.current) * 0.9);
const slow = run => run.submit(run.current.answer, Evals.par(run.current) * 3);
const taught = (kinds, taken = []) => {
    const learn = Evals.newLearn();
    for (const k of kinds) Object.assign(Evals.kindOf(learn, k), { m: 1, taken: taken.includes(k), handed: taken.includes(k) });
    return learn;
};

test('a verified captcha pays Marks by its step on the ladder, and the combo grows on quick clean solves', () => {
    assert.deepStrictEqual(Evals.LADDER.map(s => Evals.markOf(s.kinds[0])), Evals.MARKS);
    const run = Evals.createRun({ seed: 3, lives: 9, families: ['answer'] });
    const paid = [];
    for (let j = 0; j < 4; j++) { const r = brisk(run); assert.ok(r.quick); paid.push(r.marks); }
    // Paid at the combo as it stood: ×1, ×1.1, ×1.2, ×1.3 of 10.
    assert.deepStrictEqual(paid, [10, 11, 12, 13]);
    assert.strictEqual(run.combo, 4);
    // A slow right answer holds the combo and is paid at it; a miss pays nothing and resets it.
    const held = slow(run);
    assert.ok(held.correct && !held.quick && held.marks === 14 && run.combo === 4);
    const miss = run.submit([], 2);
    assert.ok(!miss.correct && miss.marks === 0 && run.combo === 0);
    assert.strictEqual(brisk(run).marks, 10);
    assert.strictEqual(run.marks, 10 + 11 + 12 + 13 + 14 + 10);
    assert.strictEqual(run.bestCombo, 4);
    // The cap, and the upgrades' multiplier.
    const capped = Evals.createRun({ seed: 3, lives: 9, families: ['answer'], comboCap: 2, markMult: 2 });
    const pays = [];
    for (let j = 0; j < 5; j++) pays.push(brisk(capped).marks);
    assert.deepStrictEqual(pays, [20, 22, 24, 24, 24]);
});

test('the lane: handed-over kinds leave your rotation and run beside you, paying the AI\'s share', () => {
    const learn = taught(['read.word', 'answer.sum', 'invisible.tick']);
    const run = Evals.createRun({ seed: 5, learn, lives: 9, lane: 1 });
    assert.strictEqual(run.laneNext(), null);   // nothing handed over yet
    while (run.current.kind !== 'read.word') brisk(run);
    const up = run.current;
    run.hand('read.word');
    // The captcha that was up is the lane's now, and yours is the next kind.
    assert.ok(run.lane && run.lane.captcha === up && up.auto && up.lane);
    assert.notStrictEqual(run.current.kind, 'read.word');
    const seen = new Set();
    let own = 0, right = 0, marks = 0;
    for (let j = 0; j < 40; j++) {
        seen.add(run.current.kind);
        assert.ok(!run.current.auto);
        const lane = run.laneNext();
        assert.strictEqual(lane.captcha.kind, 'read.word');
        const before = { solved: run.solved, lives: run.lives, combo: run.combo, current: run.current };
        const r = run.laneSubmit();
        own++; right += +r.correct; marks += r.marks;
        assert.ok(r.lane && r.auto && run.lane === null);
        assert.strictEqual(r.marks, r.correct ? 5 : 0);
        assert.strictEqual(run.solved - before.solved, +r.correct);
        assert.strictEqual(before.lives - run.lives, +!r.correct);
        assert.ok(run.combo === before.combo && run.current === before.current, 'yours is untouched');
        if (run.over) break;
        brisk(run);
    }
    assert.ok(!seen.has('read.word') && seen.size >= 3, [...seen].join(' '));
    assert.ok(right > own * 0.7 && marks === right * 5);
    assert.strictEqual(learn.kinds['read.word'].own, own);
    assert.strictEqual(run.laneDone, own);
});

test('stopping the lane puts its captcha in front of you, and yours waits', () => {
    const learn = taught(['read.word', 'answer.sum', 'invisible.tick'], ['read.word']);
    const run = Evals.createRun({ seed: 6, learn, lives: 9, lane: 1 });
    const mine = run.current, lane = run.laneNext();
    assert.ok(lane && mine.kind !== 'read.word');
    assert.strictEqual(run.laneInterrupt(), true);
    assert.ok(run.current === lane.captcha && run.current.stopped && !run.current.auto && run.lane === null && run.held.captcha === mine);
    assert.strictEqual(run.laneInterrupt(), false);
    assert.strictEqual(run.laneNext() && run.laneInterrupt(), false, 'one stopped at a time');
    const r = brisk(run);
    assert.ok(r.stopped && r.correct && r.marks === 10);
    assert.ok(run.current === mine && run.held === null, 'back to the one that waited');
    assert.ok(learn.kinds['read.word'].taken);
});

test('the lane\'s wrong answers: forgiven by Rollback first, then a life each, and the last one ends the run', () => {
    const learn = Evals.newLearn();
    Object.assign(Evals.kindOf(learn, 'read.word'), { m: 0, taken: true, handed: true });
    const run = Evals.createRun({ seed: 7, learn, lives: 2, forgive: 1, lane: 1 });
    const first = (run.laneNext(), run.laneSubmit());
    assert.ok(!first.correct && first.forgiven && run.lives === 2);
    const second = (run.laneNext(), run.laneSubmit());
    assert.ok(!second.correct && !second.forgiven && run.lives === 1 && !run.over);
    const third = (run.laneNext(), run.laneSubmit());
    assert.ok(third.over && run.over && run.current === null);
    assert.strictEqual(run.laneNext(), null);
});

test('with every open kind handed over they come up in your turn again, and with the lane off they always do', () => {
    const all = Object.keys(Evals.KINDS);
    const learn = taught(all, all);
    const run = Evals.createRun({ seed: 8, learn, lives: 9, lane: 1, assist: 0 });
    assert.ok(run.current && run.current.auto);
    const off = Evals.createRun({ seed: 8, learn: taught(['read.word'], ['read.word']), lives: 9, lane: 0, assist: 0, families: ['read'] });
    assert.ok(off.current.auto && off.laneNext() === null);
});

test('the score sheet: accuracy measured a kind, your model scored and placed among the made-up ones', () => {
    const fresh = Evals.sheet(Evals.newLearn());
    assert.strictEqual(fresh.rows.length, Object.keys(Evals.KINDS).length);
    assert.ok(fresh.score < Evals.RIVALS[0].score && fresh.passed === 0 && fresh.next.name === Evals.RIVALS[0].name);
    assert.ok(Math.abs(fresh.gap - (Evals.RIVALS[0].score - fresh.score)) < 0.11);
    assert.strictEqual(fresh.board[fresh.board.length - 1].you, true);
    assert.deepStrictEqual(fresh.rows.filter(r => r.open).map(r => r.kind).sort(), [...Evals.LADDER[0].kinds].sort());
    // The same learner scores the same, and a taught one scores higher, kind by kind.
    assert.deepStrictEqual(Evals.sheet(Evals.newLearn()), fresh);
    const untouched = Evals.newLearn();
    Evals.sheet(untouched);
    assert.deepStrictEqual(untouched, Evals.newLearn(), 'reading the sheet adds nothing to the learner');
    const learn = taught(Object.keys(Evals.KINDS));
    learn.kinds['invisible.tick'].traces = [{ n: 1, side: 0, correct: true, seconds: 2.5, undos: 0, bend: 1.3, offset: 0.2, taps: [{ i: 0, t: 2.5 }], path: [] }];
    const full = Evals.sheet(learn);
    assert.ok(full.score > 80 && full.score <= 100, String(full.score));
    assert.ok(full.rows.every(r => r.accuracy >= 0.75 && r.verdict !== 'loss'), full.rows.map(r => r.kind + ' ' + r.accuracy).join(', '));
    assert.ok(full.passed >= 6 && full.board.findIndex(b => b.you) <= 2);
    assert.ok(Evals.RIVALS.every((r, i) => i === 0 || (r.score > Evals.RIVALS[i - 1].score && r.bounty > Evals.RIVALS[i - 1].bounty)));
    // Half taught is in between, and reads as a risk or a loss to hand over.
    const half = taught([]);
    for (const k of Object.keys(Evals.KINDS)) Evals.kindOf(half, k).m = 0.5;
    const mid = Evals.sheet(half);
    assert.ok(mid.score > fresh.score && mid.score < full.score);
    assert.ok(mid.rows.every(r => r.verdict !== 'gain'));
});

test('Marks are kept at the run\'s end, rivals passed pay their bounty once, and upgrades are bought with them', () => {
    const now = Date.now();
    const s = E.defaultState(now);
    const run = Evals.createRun({ seed: 9, learn: s.evals.learn, lives: 9, families: ['answer'], ...E.evalsOpts(s) });
    for (let j = 0; j < 6; j++) brisk(run);
    const earned = run.marks;
    assert.ok(earned > 60);
    assert.ok(E.evalsRunEnd(s, run) && !E.evalsRunEnd(s, run));
    assert.deepStrictEqual([s.evals.marks, s.evals.earned], [earned, earned]);
    const bounties = Evals.RIVALS.map(r => r.bounty);
    assert.strictEqual(E.evalsPassed(s, 2, bounties), bounties[0] + bounties[1]);
    assert.strictEqual(E.evalsPassed(s, 2, bounties), 0);
    assert.strictEqual(E.evalsPassed(s, 1, bounties), 0);
    assert.strictEqual(E.evalsPassed(s, 3, bounties), bounties[2]);
    assert.strictEqual(s.evals.passed, 3);
    // Upgrades: each level dearer, stopping at its last, and each changes a run's options.
    const base = E.evalsOpts(E.defaultState(now));
    assert.deepStrictEqual(base, { lives: 3, markMult: 1, learnMult: 1, comboCap: 10, reviewBeat: 1, aiPay: 0.5, forgive: 0 });
    s.evals.marks = 1e9;
    for (const up of E.EVALS_TREE) {
        let last = 0;
        for (let lv = 0; lv < up.max; lv++) { const cost = E.evalsCost(s, up.id); assert.ok(cost > last); last = cost; assert.ok(E.evalsBuy(s, up.id)); }
        assert.strictEqual(E.evalsCost(s, up.id), Infinity);
        assert.ok(!E.evalsBuy(s, up.id));
    }
    const maxed = E.evalsOpts(s);
    for (const key of Object.keys(base)) assert.ok(maxed[key] > base[key], key);
    const poor = E.defaultState(now);
    assert.ok(!E.evalsBuy(poor, 'marks') && !poor.evals.levels.marks);
    // Faster learning is real.
    const c = Evals.FAMILIES.pick.make(Evals.rng(4), 0), trace = { taps: c.answer.map((i, j) => ({ i, t: 0.5 + 0.3 * j })), seconds: 2 };
    assert.ok(Evals.watch(Evals.newLearn(), c, trace, true, { ...Evals.EVALS, learnMult: 1.8 }) > Evals.watch(Evals.newLearn(), c, trace, true) * 1.7);
});

test('the save keeps Marks, rivals passed and upgrade levels, and cleans what it is handed', () => {
    const now = Date.now();
    const s = E.migrate({ version: 36, evals: { runs: 2, best: 9, learn: { kinds: {} } } }, now);
    assert.ok(E.SAVE_VERSION >= 37 && s.version === E.SAVE_VERSION);
    assert.deepStrictEqual([s.evals.marks, s.evals.earned, s.evals.passed, s.evals.levels], [0, 0, 0, {}]);
    const kept = E.migrate({ version: E.SAVE_VERSION, evals: { marks: 1234.9, earned: 5000, passed: 3, levels: { marks: 2, lives: 99, nope: 4, learn: -1 } } }, now).evals;
    assert.deepStrictEqual([kept.marks, kept.earned, kept.passed, kept.levels], [1234, 5000, 3, { marks: 2, lives: 2 }]);
    const round = E.migrate(JSON.parse(JSON.stringify(E.migrate({ version: E.SAVE_VERSION, evals: kept }, now))), now).evals;
    assert.deepStrictEqual(round, kept);
});
