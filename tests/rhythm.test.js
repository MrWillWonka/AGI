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

// ---- The modes (the owner, 2026-11-16): Easy, Medium, Hard, Extreme, mixing the instruments ----
const modeChart = m => R.timed(R.chartFor(SONG, m), STEP);
const kinds = c => ({ notes: c.filter(n => !n.free).length, holds: c.filter(n => n.kind === 'hold').length, slashes: c.filter(n => n.kind === 'slash').length, free: c.filter(n => n.free).length,
    chords: c.filter((n, i) => !n.free && c.some((m, j) => j > i && !m.free && m.t === n.t)).length, lanes: new Set(c.filter(n => !n.free).map(n => n.lane)).size });
// Every note on its beat, held ones held, slashes slashed, and in a freestyle bar a varied beat of its own.
const playAll = (c, off = 0) => c.flatMap(n => (n.free
    ? [0, 1, 3, 4, 6].flatMap((k, i) => [{ t: n.t + k * n.grid + off, lane: i % 2, down: true }, { t: n.t + k * n.grid + off + 0.04, lane: i % 2, down: false }])
    : [{ t: n.t + off, lane: n.lane, down: true, kind: n.kind === 'slash' ? 'slash' : undefined }, { t: n.t + off + (n.hold > 0 ? n.hold : 0.05), lane: n.lane, down: false }]));

test('rhythm modes: each is busier than the last; Easy is single notes, freestyle and a few holds; Extreme has it all', () => {
    const [easy, medium, hard, extreme] = [0, 1, 2, 3].map(m => kinds(modeChart(m)));
    assert.ok(easy.notes < medium.notes && medium.notes < hard.notes && hard.notes <= extreme.notes, JSON.stringify({ easy, medium, hard, extreme }));
    assert.equal(easy.chords, 0);
    assert.equal(easy.slashes, 0);
    assert.equal(easy.free, 2);
    assert.ok(easy.holds >= 1 && easy.holds < extreme.holds, 'some holds, fewer than there are');
    assert.ok(easy.lanes >= 2, 'the instruments are mixed, not one lane');
    assert.ok(medium.chords >= 1 && medium.slashes === 0);
    assert.ok(hard.slashes >= 1 && extreme.slashes > hard.slashes);
    assert.ok(extreme.chords >= hard.chords && extreme.free >= 1 && extreme.holds >= 1);
    assert.deepEqual(R.MODES.map(m => m.name), ['Easy', 'Medium', 'Hard', 'Extreme']);
    assert.ok(R.rulesFor(0).meterMiss < R.rulesFor(3).meterMiss, 'a miss costs less on Easy');
    for (const m of [0, 1, 2, 3]) { const c = R.chartFor(SONG, m).filter(n => !n.free); for (const n of c) assert.ok(c.filter(x => x.step <= n.step && (x.len > 0 ? x.step + x.len > n.step : x.step === n.step)).length <= 2, 'two thumbs'); }
});

test('rhythm modes: every mode can be played clean, and the notes of a freestyle bar are yours', () => {
    for (const m of [0, 1, 2, 3]) {
        const c = modeChart(m), r = R.simulate(c, playAll(c), END, R.rulesFor(m));
        assert.equal(r.finished, true, R.MODES[m].name);
        assert.equal(r.miss, 0, R.MODES[m].name + ' misses');
        assert.equal(r.good, 0, R.MODES[m].name + ' is all perfect');
        assert.equal(r.freeTaps, 5 * c.filter(n => n.free).length);
        assert.equal(r.flairs, c.filter(n => n.free).length, 'a varied bar has flair');
    }
});

test('rhythm freestyle: on the beat counts, off it does not (and costs nothing); the same tap over and over has no flair; silence is a miss', () => {
    const c = modeChart(0), f = c.find(n => n.free), run = R.createRun(c, R.rulesFor(0));
    run.advance(f.t - 0.3);
    const before = { ...run.state, notes: null };
    run.press(0, f.t + 0.01); run.release(0, f.t + 0.05);
    assert.equal(run.state.freeTaps, 1);
    run.press(0, f.t + f.grid * 1.5); run.release(0, f.t + f.grid * 1.5 + 0.04);   // between two half-beats
    assert.equal(run.state.freeTaps, 1);
    assert.equal(run.state.stray, before.stray, 'a loose tap in a freestyle is no stray');
    assert.equal(run.state.miss, before.miss);
    const dull = R.createRun(c, R.rulesFor(0)); dull.advance(f.t - 0.3);
    const m0 = dull.state.miss;
    for (let k = 0; k < 6; k++) { dull.press(1, f.t + k * f.grid); dull.release(1, f.t + k * f.grid + 0.03); }
    dull.advance(f.t + f.dur + 0.01);
    assert.equal(dull.state.freeTaps, 6);
    assert.equal(dull.state.flairs, 0, 'one lane at one spacing is boring');
    assert.equal(dull.state.miss, m0);
    const silent = R.createRun(c, R.rulesFor(0)); silent.advance(f.t - 0.3); const m1 = silent.state.miss; silent.advance(f.t + f.dur + 0.01);
    assert.equal(silent.state.miss - m1 >= 1, true);
});

test('rhythm slashes: slashed on the beat is perfect, tapped is good at best', () => {
    const c = modeChart(3), n = c.find(x => x.kind === 'slash'), i = c.indexOf(n);
    const a = R.createRun(c); a.advance(n.t - 0.16); a.press(n.lane, n.t, 'slash');
    assert.equal(a.state.notes[i].state, 'perfect');
    const b = R.createRun(c); b.advance(n.t - 0.16); b.press(n.lane, n.t);
    assert.equal(b.state.notes[i].state, 'good');
});

test('rhythm modes: the AI plays freestyle bars and slashes too, better with practice; Easy is kinder to a beginner than Extreme', () => {
    const rate = (m, runs) => { const c = modeChart(m), you = R.simulate(c, playAll(c, 0.09), END, R.rulesFor(m)); let fin = 0, taps = 0, flairs = 0; for (let s = 1; s <= 100; s++) { const h = R.handOver(c, you, END, { seed: s * 613, mastery: R.mastery(runs) }, R.rulesFor(m)); if (h.score) { fin++; taps += h.score.freeTaps; flairs += h.score.flairs; } } return { fin, taps: taps / Math.max(1, fin), flairs: flairs / Math.max(1, fin), you: you.finished }; };
    const easyNew = rate(0, 0), extremeNew = rate(3, 0), extremeOld = rate(3, 40);
    assert.ok(easyNew.you && extremeNew.you);
    assert.ok(easyNew.fin >= extremeNew.fin && easyNew.fin >= 90, JSON.stringify({ easyNew, extremeNew }));
    assert.ok(extremeOld.fin >= 98 && extremeOld.taps > extremeNew.taps && extremeOld.flairs > extremeNew.flairs, JSON.stringify({ extremeNew, extremeOld }));
});
