// The rhythm run's rules (rhythm.js; design/evals-course.md → The rhythm run): a prototype of step 1, a game track in lanes.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../rhythm.js');

const o = R.RHYTHM;
// A song shaped as the music engine builds one: 16 steps a bar, a kick on the beats, a bass on 1 and 3, a melody of
// short notes and one long one, a two-bar intro without a melody.
const SONG = { steps: 16, bars: 12, kit: { kick: 'x...x...x...x...' }, bass: 'r.......f.......', bassBy: { A: 'r.......f.......' },
    mel: { A: Array.from({ length: 16 }, (_, s) => (s === 2 ? { deg: 0, len: 2 } : s === 6 ? { deg: 2, len: 2 } : s === 8 ? { deg: 4, len: 8 } : null)) },
    form: [{ name: 'in', bars: 2, start: 0, mel: null, bass: 'A', drums: 'full', bassOn: true }, { name: 'A', bars: 10, start: 2, mel: 'A', bass: 'A', drums: 'full', bassOn: true }] };
const STEP = 60 / 120 / 4;
const chart = level => R.timed(R.chartFrom(SONG, level), STEP);
const END = R.lengthOf(SONG, STEP);
// Every note played `off` seconds from its beat, holds held to the end.
const play = (c, off = 0) => c.flatMap(n => [{ t: n.t + off, lane: n.lane, down: true }, { t: n.t + off + (n.hold > 0 ? n.hold : 0.05), lane: n.lane, down: false }]);

test('rhythm: the notes come from the song, a lane an instrument, more of it at each level', () => {
    assert.equal(R.startBar(SONG), 2, 'a run starts where the melody does');
    const kick = R.chartFrom(SONG, 0), bass = R.chartFrom(SONG, 1), all = R.chartFrom(SONG, 2);
    assert.equal(kick.length, 4 * o.bars);
    assert.ok(kick.every(n => n.lane === 0 && n.step % 4 === 0 && n.len === 0));
    assert.equal(bass.filter(n => n.lane === 1).length, 2 * o.bars);
    assert.equal(all.filter(n => n.lane === 2).length, 3 * o.bars);
    assert.equal(all.filter(n => n.lane === 2 && n.len > 0).length, o.bars, 'the long melody note is a held one');
    assert.ok(all.length > bass.length && bass.length > kick.length);
    for (let i = 1; i < all.length; i++) assert.ok(all[i].step >= all[i - 1].step, 'in time order');
});

test('rhythm: on the beat is perfect, a little off is good, far off or not at all is a miss', () => {
    const c = chart(0);
    const clean = R.simulate(c, play(c), END);
    assert.equal(clean.finished, true);
    assert.equal(clean.perfect, c.length);
    assert.equal(clean.combo, c.length);
    assert.equal(clean.accuracy, 1);
    const late = R.simulate(c, play(c, 0.08), END);
    assert.equal(late.good, c.length);
    assert.ok(late.score < clean.score && late.accuracy < 1);
    const none = R.simulate(c, [], END);
    assert.equal(none.failed, true, 'the song falls apart');
    assert.equal(none.score, 0);
    assert.equal(R.marksFor(none, 10), 0);
});

test('rhythm: a held note must be held; mashing where there is no note costs the meter', () => {
    const c = chart(2), hold = c.find(n => n.hold > 0);
    const full = R.createRun(c); full.press(hold.lane, hold.t); full.release(hold.lane, hold.t + hold.hold);
    assert.equal(full.state.perfect, 1);
    const early = R.createRun(c); early.press(hold.lane, hold.t); early.release(hold.lane, hold.t + hold.hold / 2);
    assert.equal(early.state.miss >= 1, true);
    assert.equal(early.state.perfect, 0);
    const mash = R.createRun(chart(0)); const before = mash.state.meter;
    mash.press(1, 0.2); mash.press(2, 0.21);
    assert.equal(mash.state.stray, 2);
    assert.ok(mash.state.meter < before);
});

test('rhythm: the meter rises with hits (gold at a combo), and empties with misses, ending the run', () => {
    const c = chart(0), run = R.createRun(c);
    let gold = false;
    for (const n of c.slice(0, o.goldCombo)) for (const e of run.press(n.lane, n.t)) if (e.gold) gold = true;
    assert.equal(gold, true);
    assert.ok(run.state.meter > o.meterStart);
    const idle = R.createRun(c); idle.advance(END);
    assert.equal(idle.state.failed, true);
    assert.ok(idle.state.miss >= Math.ceil(o.meterStart / o.meterMiss));
    assert.ok(idle.state.miss < c.length, 'it stops when the meter is empty, not at the end');
});

test('rhythm: the AI copies your timing, tightens with practice, and a practised one outscores a sloppy you', () => {
    const c = chart(2), you = R.simulate(c, play(c, 0.07), END);
    assert.equal(you.finished, true);
    const rate = runs => { let fin = 0, beat = 0, acc = 0, off = 0, n = 0; for (let s = 1; s <= 120; s++) { const h = R.handOver(c, you, END, { seed: s * 977, mastery: R.mastery(runs) }); if (h.score) { fin++; acc += h.score.accuracy; if (h.score.score > you.score) beat++; } const first = h.attempts[0].result; for (const x of first.offs) if (x != null) { off += x; n++; } } return { fin, beat, acc: acc / Math.max(1, fin), lean: off / Math.max(1, n) }; };
    const novice = rate(0), expert = rate(40);
    assert.ok(novice.lean > 0.03, 'a new one is late where you were late: ' + novice.lean.toFixed(3));
    assert.ok(Math.abs(expert.lean) < 0.01, 'a practised one is on the beat: ' + expert.lean.toFixed(3));
    assert.ok(expert.acc > novice.acc && expert.fin >= 118 && expert.beat >= 115, JSON.stringify({ novice, expert }));
    assert.ok(novice.fin < 120 || novice.beat < 60, 'a new one does not simply win: ' + JSON.stringify(novice));
});

test('rhythm: later tries are steadier on the notes it got wrong; past your limit comes in stages', () => {
    const c = chart(2), you = R.simulate(c, play(c, 0.02), END);
    let first = 0, last = 0;
    for (let s = 1; s <= 80; s++) { const h = R.handOver(c, you, END, { seed: s * 131, mastery: 0.2, tries: 3 }); first += h.attempts[0].result.perfect; last += h.attempts[h.attempts.length - 1].result.perfect; }
    assert.ok(last > first, 'more perfect hits on the last try than the first: ' + last + ' against ' + first);
    const fell = R.simulate(c, [], END);
    assert.deepEqual(R.canHandOver(null, 1), { ok: false, why: 'untried' });
    assert.deepEqual(R.canHandOver(fell, 0), { ok: false, why: 'stage' });
    assert.deepEqual(R.canHandOver(fell, o.stage2), { ok: true, why: 'beyond' });
    let fin = 0; for (let s = 1; s <= 40; s++) if (R.handOver(c, fell, END, { seed: s * 7, mastery: 1 }).score) fin++;
    assert.equal(fin, 40, 'a master plays a track you could not');
    const res = R.handOver(c, you, END, { seed: 3, mastery: 1 }).score;
    assert.equal(R.marksFor(res, 0), Math.round(res.hits * o.marks));
    assert.ok(R.marksFor(res, res.score / 2) > R.marksFor(res, res.score));
});

test('rhythm: a chart never asks for more than two thumbs, and for a mouse never more than one thing at a time', () => {
    const down = notes => { let most = 0; for (const n of notes) most = Math.max(most, notes.filter(m => m !== n && m.step <= n.step && (m.len > 0 ? m.step + m.len > n.step : m.step === n.step)).length + 1); return most; };
    const raw = R.chartFrom(SONG, 2, undefined, undefined, 9), two = R.chartFrom(SONG, 2), one = R.chartFrom(SONG, 2, undefined, undefined, 1);
    assert.equal(down(raw), 3, 'the song itself has the kick, the bass and the melody together');
    assert.equal(down(two), 2);
    assert.equal(down(one), 1);
    assert.ok(raw.length > two.length && two.length > one.length);
    for (let i = 1; i < one.length; i++) assert.ok(one[i].step - one[i - 1].step >= o.oneGap);
    assert.ok(two.filter(n => n.lane === 2).length >= raw.filter(n => n.lane === 2).length - 1, 'the melody is what is kept');
    assert.ok(one.some(n => n.len > 0) && one.some(n => n.lane === 0), 'a mouse still gets held notes and the kick');
});
