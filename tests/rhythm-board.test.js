// The rhythm run's board (rhythm.js, step 2; design/evals-course.md): a track composed from one song's blocks, played
// by the real music engine. The engine runs in Node against a stand-in AudioContext, as in tests/audio.test.js.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const R = require('../rhythm.js');

const THEMES = ['classic', 'dark', 'soft', 'ominous', 'retro'], AREAS = ['lab', 'server', 'snare'];
const root = path.join(__dirname, '..');

// A stand-in AudioContext: nodes that remember what they were connected to, sources that log their start.
function fakeContext() {
    const param = (v = 0) => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; } });
    const node = (kind, extra = {}) => Object.assign({ kind, outs: [], connect(to) { this.outs.push(to); return to; }, disconnect() {} }, extra);
    const ctx = { currentTime: 0, sampleRate: 48000, state: 'running', log: [], destination: node('dest') };
    const source = (kind, extra) => { const o = node(kind, { start(t) { o.t = t; o.made = ctx.currentTime; ctx.log.push(o); }, stop(t) { o.end = t; }, ...extra }); return o; };
    Object.assign(ctx, {
        createGain: () => node('gain', { gain: param(1) }),
        createOscillator: () => source('osc', { frequency: param(440), detune: param(0), type: 'sine', setPeriodicWave() {} }),
        createBufferSource: () => source('noise', { buffer: null, loop: false }),
        createBiquadFilter: () => node('filter', { frequency: param(), Q: param(), type: '' }),
        createWaveShaper: () => node('shaper', { curve: null }),
        createDynamicsCompressor: () => node('comp', { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
        createStereoPanner: () => node('pan', { pan: param() }),
        createConvolver: () => node('conv', { buffer: null }),
        createDelay: () => node('delay', { delayTime: param() }),
        createBuffer: (ch, n, sr) => ({ sampleRate: sr, length: n, getChannelData: () => new Float32Array(8) }),
        createPeriodicWave: () => ({})
    });
    return ctx;
}
// Does a node's output reach `target`? (A voice reaches its part, an effect the effects' bus.)

global.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
global.document = { addEventListener() {}, hidden: false };
if (typeof navigator === 'undefined') global.navigator = {};
for (const f of [...THEMES.map(t => `music/${t}.js`), 'sfx.js']) { const p = path.join(root, f); delete require.cache[require.resolve(p)]; require(p); }
const win = global.window;
const seeded = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function engine(style, area) {
    const ctx = fakeContext(), faults = [];
    const sfx = win.SFXBuild({ ctx, offline: true, random: seeded(7), phone: false, onError: (where, e) => faults.push(where + ': ' + (e && e.message)) });
    sfx.setVolume(0.5); sfx.setMusicStyle(style); sfx.setSimple(false); sfx.setArea(area); sfx.setDepth(1); sfx.setTraining(true); sfx.setMusic(0.35); sfx.musicState(1, null);
    const run = seconds => { const end = ctx.currentTime + seconds; while (ctx.currentTime < end - 1e-9) { ctx.currentTime += 0.025; sfx.musicState(1, null); sfx.tick(); } };
    return { sfx, ctx, faults, run };
}
const every = fn => { for (const th of THEMES) { for (const area of AREAS) { const e = engine(th, area); e.sfx.lab.areaSongs(area).forEach((song, i) => fn(e, song, `${th} ${area} ${i}`, area)); } } };

test('board: every song gives a box of parts, and its own bars are a board made only of them', () => {
    every((e, song, name) => {
        const box = R.blocksOf(song);
        assert.deepStrictEqual(box.beat.map(x => x.id), ['full', 'sparse', 'none']);
        assert.ok(box.chords.length >= 2, name + ': chords to choose from');
        assert.ok(box.mel.length >= 4, name + ': rest, freestyle and at least two melody bars');
        assert.ok(box.bass.length >= 2, name + ': a bass line and none');
        for (const row of R.BOARD.rows) assert.strictEqual(new Set(box[row].map(x => x.id)).size, box[row].length, name + ': ' + row + ' ids are different');
        for (const len of R.BOARD.lengths) {
            const b = R.boardFrom(song, len);
            assert.strictEqual(b.len, len);
            for (const row of R.BOARD.rows) { assert.strictEqual(b[row].length, len); for (const id of b[row]) assert.ok(box[row].some(x => x.id === id), `${name}: ${row} "${id}" is in the box`); }
            assert.deepStrictEqual(R.cleanBoard(song, b), b, name + ': a sound board is left as it is');
        }
    });
});

test('board: a broken board is mended, a cell at a time, from the song\'s own bars', () => {
    every((e, song, name) => {
        const base = R.boardFrom(song, 8), bad = R.cleanBoard(song, { len: 8, beat: ['nope'], bass: null, chords: ['x:99', base.chords[1]], mel: ['free'] });
        assert.strictEqual(bad.beat[0], base.beat[0], name);
        assert.deepStrictEqual(bad.bass, base.bass);
        assert.strictEqual(bad.chords[0], base.chords[0]);
        assert.strictEqual(bad.mel[0], 'free', 'a good cell is kept');
        assert.strictEqual(R.cleanBoard(song, { len: 5 }).len, R.BOARD.length, 'a length that is not offered');
    });
});

test('board: what you compose is a song of one-bar sections, and the chart is made from it', () => {
    every((e, song, name) => {
        const board = R.boardFrom(song, 4), box = R.blocksOf(song), tune = box.mel.find(x => x.id !== 'rest' && x.id !== 'free').id;
        board.beat = ['full', 'full', 'none', 'full']; board.bass[1] = 'off'; board.mel = [tune, 'rest', tune, 'free'];
        const made = R.compose(song, board, { lead: true }), o = { ...R.RHYTHM, bars: 4 };
        assert.strictEqual(made.bars, 5, 'a bar of count-in and four of yours');
        assert.strictEqual(made.steps, song.steps); assert.strictEqual(made.bpm, song.bpm);
        assert.deepStrictEqual(made.free, [3]);
        assert.ok(made.form.every((s, i) => s.bars === 1 && s.start === i && made.prog[s.chords] && made.bassBy[s.bass] && (s.mel == null || made.mel[s.mel].length === song.steps)), name);
        assert.strictEqual(made.form[0].mel, null, 'no melody in the count-in');
        const all = R.chartFrom(made, 2, 1, o, 9), bar = b => all.filter(n => Math.floor(n.step / song.steps) === b);
        assert.strictEqual(bar(1).filter(n => n.lane === 1).length, 0, name + ': no bass where it was taken out');
        assert.strictEqual(bar(1).filter(n => n.lane === 2).length, 0, 'no melody in a rest');
        assert.strictEqual(bar(2).filter(n => n.lane === 0).length, 0, 'no kick where the beat was taken out');
        assert.ok(bar(0).some(n => n.lane === 2) && bar(2).some(n => n.lane === 2), 'the melody block plays where it was put');
        assert.deepStrictEqual(bar(0).filter(n => n.lane === 2).map(n => n.step), bar(2).filter(n => n.lane === 2).map(n => n.step - 2 * song.steps), 'the same block is the same notes');
        for (const n of all) assert.ok(n.step + Math.max(0, n.len) <= 4 * song.steps, 'nothing runs past the end');
        for (let m = 0; m < R.MODES.length; m++) {
            const c = R.chartFor(made, m, 1, o);
            assert.deepStrictEqual(c.filter(n => n.free).map(n => n.step / song.steps), [3], 'the freestyle bar is the one you placed, in every mode');
            assert.ok(!c.some(n => !n.free && Math.floor(n.step / song.steps) === 3), 'and it has no notes');
        }
        const ms = R.measure(R.chartFor(made, 1, 1, o), 4, song.steps);
        assert.strictEqual(ms.perBar.length, 4); assert.strictEqual(ms.free, 1); assert.strictEqual(ms.total, ms.perBar.reduce((a, b) => a + b, 0));
        assert.ok(ms.most >= ms.least && ms.kinds >= 2 && ms.playable);
    });
});

test('board: the engine plays a composed song, in every track, with no fault, and it loops', () => {
    every((e, song, name, area) => {
        const board = R.boardFrom(song, 4), box = R.blocksOf(song);
        // Every block of the box somewhere on the board, in an order the song never had.
        for (const row of R.BOARD.rows) board[row] = board[row].map((_, b) => box[row][(b * 3 + 1) % box[row].length].id);
        const made = R.compose(song, board);
        e.run(1);
        const asked = e.sfx.lab.music().asked || 0, before = e.ctx.log.length;
        e.sfx.songCmd({ area, custom: made, bar: 0 });
        const barLen = song.steps * 60 / (song.bpm || 124) / 4;
        e.run(barLen * 11);
        const m = e.sfx.lab.music();
        assert.deepStrictEqual(e.faults, [], name);
        assert.strictEqual((m.asked || 0), asked + 1, name + ': the engine turned to it');
        assert.strictEqual(m.songs[m.song], made, name + ': and is still on it after two times through');
        assert.ok(e.ctx.log.length > before + 20, name + ': it made sound');
        e.sfx.songCmd({ area, song: 0, bar: 0 });
        e.run(barLen * 2);
        assert.notStrictEqual(e.sfx.lab.music().songs[0], made, name + ': the area\'s songs come back when asked');
        assert.deepStrictEqual(e.faults, [], name);
    });
});

test('the board: a stretch of it, and one block alone, are songs of their own (for hearing a bar, a block, or part of a track)', () => {
    every((e, song, name) => {
        const board = R.boardFrom(song, 8), whole = R.compose(song, board);
        const part = R.excerpt(song, board, 2, 5);
        assert.equal(part.bars, 3, name);
        assert.deepEqual(part.form.map(s => s.start), [0, 1, 2], name);
        assert.deepEqual(part.form.map(s => [s.mel, s.chords, s.bass, s.drums, s.bassOn]), whole.form.slice(2, 5).map(s => [s.mel, s.chords, s.bass, s.drums, s.bassOn]), name + ': the same bars as the whole track');
        for (const s of part.form) { assert.ok(part.prog[s.chords], name); assert.ok(part.bassBy[s.bass], name); if (s.mel) assert.ok(part.mel[s.mel], name); }
        assert.equal(R.excerpt(song, board, 0, 8).bars, 8, name);
        assert.equal(R.excerpt(song, board, 7, 99).bars, 1, name + ': kept inside the board');
        assert.equal(R.excerpt(song, board, 5, 2).bars, 1, name + ': never empty');
        // One row alone: the others are silent in that bar.
        const mel = R.excerpt(song, board, 0, 1, 'mel').form[0], beat = R.excerpt(song, board, 0, 1, 'beat').form[0], bass = R.excerpt(song, board, 0, 1, 'bass').form[0];
        assert.deepEqual([mel.drums, mel.bassOn], ['none', false], name);
        assert.deepEqual([beat.mel, beat.bassOn, beat.drums], [null, false, whole.form[0].drums], name);
        assert.deepEqual([bass.mel, bass.drums], [null, 'none'], name);
        assert.equal(R.cleanBoard(song, board).beat[0], board.beat[0], name + ': the board itself is untouched');
    });
});