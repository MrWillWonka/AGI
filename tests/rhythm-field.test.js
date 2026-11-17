// The rhythm run on the whole field (rhythm.js; design/evals-course.md → the whole field): notes land anywhere across
// the line, by pitch; a press takes the note within reach; a held note slides and the hand follows.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../rhythm.js');

// A song shaped as the music engine builds one: a kick on the beats, a bass on the root and the fifth, a melody that
// climbs and ends on a long note.
const MEL = Array.from({ length: 16 }, (_, s) => (s === 0 ? { deg: 0, len: 2 } : s === 4 ? { deg: 2, len: 2 } : s === 8 ? { deg: 4, len: 6 } : null));
const SONG = { steps: 16, bars: 10, bpm: 120, kit: { kick: 'x...x...x...x...' }, bass: '..r.......f.....', bassBy: { A: '..r.......f.....' }, mel: { A: MEL },
    form: [{ name: 'A', bars: 10, start: 0, mel: 'A', bass: 'A', drums: 'full', bassOn: true }] };
const STEP = 60 / 120 / 4, EXTREME = 3;
const rules = (mode, extra = {}) => ({ ...R.rulesFor(mode), field: true, ...extra });
const chart = (mode, extra) => R.timed(R.fieldFor(SONG, mode, 0, rules(mode, extra)), STEP, rules(mode, extra));
const END = R.lengthOf(SONG, STEP);
// A tap in each freestyle bar, and every note pressed on its beat, `dx` off across the field; a held one followed as it slides (or not).
const play = (c, dx = 0, follow = true) => c.flatMap((n, i) => (n.free ? [{ t: n.t, lane: 'f' + i, down: true, x: 0.5 }, { t: n.t + 0.02, lane: 'f' + i, down: false }] : [{ t: n.t, lane: 'h' + i, down: true, x: n.x + dx },
    ...(n.hold > 0 && follow ? Array.from({ length: Math.floor(n.hold / 0.05) }, (_, k) => ({ t: n.t + (k + 1) * 0.05, lane: 'h' + i, move: true, x: R.xAt(n, n.t + (k + 1) * 0.05) + dx })) : []),
    { t: n.t + (n.hold > 0 ? n.hold : 0.05), lane: 'h' + i, down: false }]));

test('field: low notes land to the left and high notes to the right', () => {
    const o = rules(EXTREME), notes = R.fieldFor(SONG, EXTREME, 0, o).filter(n => !n.free);
    assert.ok(notes.length > 20);
    for (const n of notes) assert.ok(n.x >= 0.05 && n.x <= 0.95 && n.x2 >= 0.05 && n.x2 <= 0.95, 'on the field');
    const of = lane => notes.filter(n => n.lane === lane);
    assert.ok(of(0).every(n => n.x === o.kickX), 'the kick far left');
    assert.ok(Math.max(...of(0).map(n => n.x)) < Math.min(...of(1).map(n => n.x)), 'the bass right of the kick');
    assert.ok(Math.max(...of(1).map(n => n.x)) < Math.min(...of(2).map(n => n.x)), 'the melody right of the bass');
    const mel = of(2), low = mel.find(n => n.p === 0), mid = mel.find(n => n.p === 2), high = mel.find(n => n.p === 4);
    assert.ok(low.x < mid.x && mid.x < high.x, 'a higher melody note is further right');
    const root = of(1).find(n => n.p === 0), fifth = of(1).find(n => n.p === 4);
    assert.ok(root.x < fifth.x, 'and so is a higher bass note');
    assert.ok(mel.filter(n => n.len > 0).some(n => n.x2 !== n.x), 'a held note slides');
    assert.ok(mel.filter(n => n.len > 0).every(n => Math.abs(n.x2 - n.x) <= o.slide + 1e-9), 'but not far');
    assert.ok(R.chartFor(SONG, EXTREME, 0, R.rulesFor(EXTREME)).every(n => n.x == null), 'lanes have no positions');
});

test('field: a press takes the note within reach of it, and nothing further away', () => {
    for (let mode = 0; mode < R.MODES.length; mode++) {
        const o = rules(mode), c = chart(mode);
        const clean = R.simulate(c, play(c), END, o), near = R.simulate(c, play(c, o.reach * 0.9), END, o);
        assert.ok(clean.finished && clean.miss === 0 && clean.hits - clean.freeTaps === clean.total, R.MODES[mode].name + ': played where the notes are');
        assert.strictEqual(near.hits - near.freeTaps, near.total, 'just inside reach still takes every note');
        const run = R.createRun(c, o), first = c.find(n => !n.free && n.lane === 0), out = run.press('a', first.t, undefined, first.x + o.reach * 1.2);
        assert.ok(out.some(e => e.type === 'stray') && !out.some(e => e.type === 'perfect' || e.type === 'good'), 'outside reach takes nothing');
        assert.ok(run.press('a', first.t, undefined, first.x + o.reach * 0.5).some(e => e.type === 'perfect'), 'and the note is still there to take');
    }
    assert.ok(R.MODES.every((m, i) => i === 0 || m.reach < R.MODES[i - 1].reach), 'a harder mode asks for a closer press');
});

test('field: a held note has to be followed as it slides', () => {
    const o = rules(1), c = chart(1);
    assert.ok(c.some(n => n.hold > 0), 'the chart has held notes');
    const followed = R.simulate(c, play(c), END, o);
    assert.strictEqual(followed.miss, 0);
    // One note that slides further than a still hand reaches: a hand left where it landed loses it.
    const far = { ...rules(1), slide: 0.4, slip: 0.5 }, wide = R.timed(R.fieldFor(SONG, 1, 0, far), STEP, far), one = wide.find(n => n.hold > 0 && Math.abs(n.x2 - n.x) > far.reach * far.slip);
    assert.ok(one, 'a note slides further than a still hand reaches');
    const run = R.createRun(wide, far);
    run.advance(one.t - 0.01);
    run.state.notes.forEach(n => { if (!n.free && n.t < one.t - 1e-9) n.state = 'perfect'; });
    const held = run.press('a', one.t, undefined, one.x);
    assert.ok(held.some(e => e.type === 'hold'));
    const later = [];
    for (let q = one.t + 0.05; q < one.t + one.hold * 0.95; q += 0.05) later.push(...run.advance(q));   // (time passes a frame at a time)
    assert.ok(later.some(e => e.type === 'slipped'), 'the hold is dropped when the hand is left behind');
    assert.strictEqual(run.state.notes.find(n => n.t === one.t && n.lane === one.lane).state, 'miss');
});

test('field: with one hand nothing is two at once and nothing is out of the hand\'s reach in time', () => {
    const o = rules(EXTREME, { hands: 1 }), notes = R.fieldFor(SONG, EXTREME, 0, o).filter(n => !n.free), two = R.fieldFor(SONG, EXTREME, 0, rules(EXTREME)).filter(n => !n.free);
    assert.ok(notes.length >= 8 && notes.length < two.length, 'fewer notes than two hands get');
    for (let i = 1; i < notes.length; i++) {
        const a = notes[i - 1], b = notes[i];
        assert.ok(b.step >= a.step + Math.max(0, a.len), 'one thing at a time');
        assert.ok(Math.abs(b.x - a.x2) <= o.travel * Math.max(1, b.step - (a.step + Math.max(0, a.len))) + 1e-9, 'the hand can get there');
    }
    const c = R.timed(notes, STEP, o), res = R.simulate(c, play(c), END, o);
    assert.ok(res.finished && res.miss === 0);
});

test('field: the AI aims badly at first and closes in, and a master plays it through', () => {
    const o = rules(2), c = chart(2), mine = R.simulate(c, play(c), END, o);
    const hits = m => { let n = 0; for (let k = 0; k < 12; k++) n += R.simulate(c, R.aiEvents(c, mine, { seed: 100 + k, mastery: m }, o).events, END, o).hits; return n; };
    assert.ok(hits(1) > hits(0.2), 'more with mastery');
    const master = R.handOver(c, mine, END, { seed: 5, mastery: 1 }, o);
    assert.ok(master.score && master.score.finished && master.score.miss === 0, 'a master misses nothing');
    assert.ok(master.attempts[0].events.some(e => e.move), 'it follows held notes');
    assert.deepStrictEqual(R.handOver(c, mine, END, { seed: 5, mastery: 0.5 }, o).attempts[0].events, R.handOver(c, mine, END, { seed: 5, mastery: 0.5 }, o).attempts[0].events, 'the same seed is the same attempt');
});

test('field: a tap of your own in a freestyle bar is in the third of the field it landed in', () => {
    const o = rules(0), c = chart(0), f = c.find(n => n.free), run = R.createRun(c, o);
    run.state.notes.forEach(n => { if (!n.free && n.t < f.t) n.state = 'perfect'; });
    run.advance(f.t);
    for (const [k, x] of [[0, 0.1], [1, 0.5], [3, 0.9], [4, 0.5]]) { const ev = run.press('p', f.t + k * f.grid, undefined, x); assert.ok(ev.some(e => e.free && Math.abs(e.x - x) < 1e-9), 'tap ' + k); run.release('p', f.t + k * f.grid + 0.02); }
    assert.deepStrictEqual(run.state.notes.find(n => n.free && n.t === f.t).taps.map(q => q.lane), [0, 1, 2, 1]);
    assert.ok(run.advance(f.t + f.dur + 0.01).some(e => e.type === 'flair'), 'variety across the field is still flair');
});
