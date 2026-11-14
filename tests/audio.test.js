// The audio engine (sfx.js) and the five tracks (music/<theme>.js), run in Node against a stand-in AudioContext:
// the real scheduler, the real songs and instruments, with every note it would have played written to a log.
// What a note sounds like is not tested here (tools/audio renders and measures that); what gets scheduled, when,
// and through which part, is.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const THEMES = ['classic', 'dark', 'soft', 'ominous', 'retro'];
const root = path.join(__dirname, '..');

// ---- A stand-in AudioContext: nodes that remember what they were connected to, sources that log their start ----
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
function reaches(n, target, seen = new Set()) {
    if (n === target) return true;
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return (n.outs || []).some(o => reaches(o, target, seen));
}

// The page's globals, as sfx.js and the theme files expect them.
function loadEngine() {
    global.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
    global.document = { addEventListener() {}, hidden: false };
    if (typeof navigator === 'undefined') global.navigator = {};
    for (const f of [...THEMES.map(t => `music/${t}.js`), 'sfx.js']) { const p = path.join(root, f); delete require.cache[require.resolve(p)]; require(p); }
    return global.window;
}
const win = loadEngine();
const seeded = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// An engine on a fresh stand-in context, the music started in `style` and `area`, everything in (a fast run, late).
function engine(style, { area = 'server', intensity = 1, depth = 1, training = true, music = 0.35, simple = false } = {}) {
    const ctx = fakeContext(), faults = [];
    const sfx = win.SFXBuild({ ctx, offline: true, random: seeded(7), phone: false, onError: (where, e) => faults.push(where + ': ' + (e && e.message)) });
    sfx.setVolume(0.5); sfx.setMusicStyle(style); sfx.setSimple(simple); sfx.setArea(area); sfx.setDepth(depth); sfx.setTraining(training); sfx.setMusic(music);
    if (music > 0) sfx.musicState(intensity, null);
    const run = (seconds, each) => { const end = ctx.currentTime + seconds; while (ctx.currentTime < end - 1e-9) { ctx.currentTime += 0.025; sfx.musicState(intensity, null); sfx.tick(); if (each) each(); } };
    return { sfx, ctx, faults, run };
}

test('the five tracks build with no fault: thirty songs, each with a name, a form and somewhere to come back in', () => {
    assert.deepStrictEqual(win.SFX.faults.count, 0, win.SFX.faults.last || '');
    const cat = win.SFX.catalog;
    assert.deepStrictEqual(Object.keys(cat).sort(), [...THEMES].sort());
    let songs = 0;
    for (const th of THEMES) for (const area of ['lab', 'server', 'snare']) {
        const list = cat[th].songs[area];
        assert.strictEqual(list.length, 2, `${th} ${area}`);
        for (const s of list) {
            songs++;
            assert.ok(s.name, `${th} ${area}: a song has no name`);
            assert.ok(s.bars > 0 && s.sections.length >= 3, `${s.name}: a form`);
            assert.ok(s.sections[0].entry, `${s.name}: its first section is an entry`);
            assert.strictEqual(s.sections.reduce((a, x) => a + x.bars, 0), s.bars);
            assert.ok(s.seconds >= 35 && s.seconds <= 260, `${s.name}: ${s.seconds} s`);
            for (const x of s.sections) {
                assert.ok(['full', 'sparse', 'none'].includes(x.drums));
                if (x.mel != null) assert.ok(s.melodies[x.mel] > 0, `${s.name} ${x.name}: melody ${x.mel}`);
                assert.ok(s.progressions[x.chords], `${s.name} ${x.name}: chords ${x.chords}`);
            }
        }
    }
    assert.strictEqual(songs, 30);
});

test('each track is its own: a tempo, a layer order, a space, and forms that differ from song to song', () => {
    const cat = win.SFX.catalog;
    assert.deepStrictEqual(THEMES.map(t => cat[t].bpm), [124, 130, 93, 62, 144]);
    assert.ok(cat.soft.swing > 0, 'Soft swings');
    for (const th of THEMES) {
        assert.ok(cat[th].layers, th + ' sets its own layers');
        assert.ok(cat[th].space, th + ' sets its own space');
    }
    // The order the parts arrive in differs between tracks.
    const order = th => Object.entries(cat[th].layers).sort((a, b) => a[1] - b[1]).map(x => x[0]).join(' ');
    assert.strictEqual(new Set(THEMES.map(order)).size, 5);
    // No two songs in the game share a form, and no track uses the old eight-section one.
    const forms = [];
    for (const th of THEMES) for (const list of Object.values(cat[th].songs)) for (const s of list) forms.push(s.sections.map(x => `${x.name}:${x.bars}:${x.drums}`).join(','));
    assert.ok(new Set(forms).size >= 20, `${new Set(forms).size} different forms among 30 songs`);
    for (const th of THEMES) { const mine = Object.values(cat[th].songs).flat().map(s => s.sections.map(x => `${x.name}:${x.bars}:${x.drums}`).join(',')); assert.strictEqual(new Set(mine).size, 6, th + ': its six songs have six forms'); }
    assert.ok(!forms.some(f => f.startsWith('intro:8:full,A:8:full,B:8:full,A:8:full,break:4:none')), 'the old shared form is gone');
    // Dark and Ominous keep their tension against any chord; the others fit effects to the chord.
    assert.deepStrictEqual(THEMES.map(t => cat[t].pitch), ['chord', 'key', 'chord', 'key', 'chord']);
    // Every track but Classic has its own meter parts and its own power-up effects.
    for (const th of THEMES.filter(t => t !== 'classic')) {
        assert.strictEqual(cat[th].meter, 4, th + ' meter parts');
        for (const fx of ['smash', 'windup', 'crunch', 'flow', 'freeze', 'release', 'viral', 'system']) assert.ok(cat[th].own.includes(fx), `${th} writes its own ${fx}`);
    }
});

test('a track\'s six songs are not one song six times: tempos, meters, lengths, phrase lengths and leads differ', () => {
    const cat = win.SFX.catalog;
    for (const th of THEMES) {
        const songs = ['lab', 'server', 'snare'].flatMap(a => cat[th].songs[a]);
        const kinds = k => new Set(songs.map(k)).size;
        assert.ok(kinds(x => x.bpm + '/' + x.steps + '/' + x.swing) >= 5, th + ': at least five different pulses (tempo, meter, swing)');
        assert.ok(kinds(x => x.steps) >= 2, th + ': more than one meter');
        assert.ok(kinds(x => x.lead) >= 3, th + ': at least three lead voices');
        const secs = songs.map(x => x.seconds).sort((a, b) => a - b);
        assert.ok(secs[5] >= 2 * secs[0], `${th}: the longest song is at least twice the shortest (${secs.join(', ')} s)`);
        for (let i = 1; i < 6; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(songs[i].seconds - songs[j].seconds) >= 4 || songs[i].bpm !== songs[j].bpm, `${th}: ${songs[i].name} and ${songs[j].name} run the same length at the same tempo`);
        // Phrases: not every tune and progression is four or eight bars.
        const odd = songs.filter(x => [...Object.values(x.melodies), ...Object.values(x.progressions).map(p => p.length)].some(n => n % 4));
        assert.ok(odd.length >= 2, th + ': at least two songs with a phrase that is not four or eight bars');
    }
});

test('a song in another meter keeps its bar: melodies, bass and drum patterns are checked against its steps', () => {
    const { buildSong, scales } = win.SFX.lab;
    const base = { scale: scales.AEOL, chords: ['Am', 'F'], form: [['A', 4]] };
    const w = buildSong({ ...base, steps: 12, bass: 'r.......f...', mel: { A: '1 - 3 - 5 - | 4 - - - - .' }, kit: { kick: 'x.....x.....' } });
    assert.strictEqual(w.steps, 12);
    assert.strictEqual(w.mel.A.length, 24);
    assert.throws(() => buildSong({ ...base, steps: 12, mel: { A: '1 - 3 - 5 - 3 -' } }), /whole bars of 12/);
    assert.throws(() => buildSong({ ...base, steps: 12, mel: { A: '1 - 3 - 5 -' }, bass: 'r.......r.......' }), /12 characters/);
    assert.throws(() => buildSong({ ...base, mel: { A: '1 - 3 - 5 - 3 -' }, kit: { kick: 'x...' } }), /pattern kick/);
    assert.throws(() => buildSong({ ...base, steps: 13, mel: { A: '1 -' } }), /steps a bar/);
});

test('melodies: whole bars, triplets, and a useful error', () => {
    const { parseMelody } = win.SFX.lab;
    const m = parseMelody("1 - 3 - 5 - 3 - | 1/3/5 - - 2+3 4 . .");
    assert.strictEqual(m.length, 32);
    assert.deepStrictEqual([m[0].deg, m[0].len, m[4].deg, m[8].deg], [0, 4, 2, 4]);
    // The triplet: three notes across a quarter (four steps), each a third of it, starting a third of the way on.
    assert.deepStrictEqual([m[16].off, m[17].off, m[18].off].map(x => +x.toFixed(3)), [0, 0.333, 0.667]);
    // The last of them is held on by the two '-' after it.
    assert.deepStrictEqual([+m[16].len.toFixed(3), +m[18].len.toFixed(3)], [1.333, 5.333]);
    assert.strictEqual(m[19], null);
    assert.deepStrictEqual([m[24].deg, m[25].deg], [1, 2]);       // two 16ths
    assert.throws(() => parseMelody('1 - 3'), /not whole bars/);
    assert.throws(() => parseMelody('1 9 3 4 5 6 7 1'), /note 9/);
});

test('a song that cannot be built says which part is wrong', () => {
    const { buildSong, scales } = win.SFX.lab;
    const ok = { scale: scales.AEOL, chords: ['Am', 'F'], mel: { A: "1 - - - 3 - - - | 5 - - - 3 - - -" }, form: [['A', 4]] };
    assert.strictEqual(buildSong(ok).bars, 4);
    assert.throws(() => buildSong({ ...ok, chords: ['Am', 'Hx'] }), /chord Hx/);
    assert.throws(() => buildSong({ ...ok, form: [['A', 4, { mel: 'Z' }]] }), /section A: no melody "Z"/);
    assert.throws(() => buildSong({ ...ok, form: [['A', 4, { chords: 'B' }]] }), /section A: no chords "B"/);
    assert.throws(() => buildSong({ ...ok, bass: 'r.r.' }), /bass A: 16 characters/);
    assert.throws(() => buildSong({ ...ok, form: [['A', 4, { drums: 'loud' }]] }), /drums "loud"/);
    assert.throws(() => buildSong({ ...ok, mel: { A: '1 - 3' } }), /melody A: melody of 6 steps/);
});

test('the harmony line never sits a semitone off the chord', () => {
    const { harmNote, melNote, parseChord, scales } = win.SFX.lab;
    const song = { scale: scales.ION, tonic: 3, oct: 0 };
    // A flat over F minor 6 in C major (Soft's Morning Lab): the scale's third below is F, a chord tone.
    const fm6 = parseChord('Fm6');
    const tones = ch => ch.iv.map(x => (ch.pc + x) % 12);
    const pc = n => ((n - 57) % 12 + 12) % 12;
    for (const ch of ['Cmaj7', 'Fm6', 'E7', 'Bdim', 'G7sus4', 'Am9'].map(parseChord)) for (let deg = 0; deg < 14; deg++) {
        const e = { deg, acc: 0 }, h = harmNote(song, e, ch), top = melNote(song, e);
        assert.ok(h < top, 'below the melody');
        const rub = !tones(ch).includes(pc(h)) && tones(ch).some(p => [1, 11].includes((pc(h) - p + 12) % 12));
        assert.ok(!rub, `${ch.name} degree ${deg}: harmony ${h} rubs`);
    }
    assert.ok(fm6);
});

test('a section with no drums has none: no kick, hat, clap, shaker, rim or fill, in every song of every track', () => {
    for (const th of THEMES) for (const area of ['lab', 'server', 'snare']) for (const idx of [0, 1]) {
        const e = engine(th, { area });
        if (idx) e.sfx.songCmd('song');
        const cat = win.SFX.catalog[th].songs[area][idx];
        const beat = () => e.sfx.lab.music().parts.beat;
        let checked = 0, last = null, mark = 0, since = 0;
        e.run(cat.seconds + 6, () => {
            const now = e.sfx.song;
            if (!now || now.song !== idx + 1) return;
            // Notes are scheduled a little ahead, so only judge well inside a section.
            const key = now.index;
            if (key !== last) { last = key; since = e.ctx.currentTime; mark = e.ctx.log.length; return; }
            if (e.ctx.currentTime - since < 0.4) { mark = e.ctx.log.length; return; }
            const sec = cat.sections[key];
            if (sec.drums === 'none') {
                const end = since + sec.bars * cat.steps * (60 / cat.bpm / 4) - 0.4;
                for (const n of e.ctx.log.slice(mark)) if (n.t < end && reaches(n, beat())) assert.fail(`${th} ${cat.name}, section ${sec.name}: a drum at ${n.t.toFixed(2)} s`);
                checked++;
            }
            mark = e.ctx.log.length;
        });
        assert.deepStrictEqual(e.faults, [], `${th} ${cat.name}`);
        if (cat.sections.some(x => x.drums === 'none')) assert.ok(checked > 0, `${th} ${cat.name}: its drumless section was reached`);
    }
});

test('simple sounds honour the drum mask too, and play every song without a fault', () => {
    for (const th of THEMES) {
        const e = engine(th, { simple: true, area: 'lab' });
        e.run(70);
        assert.deepStrictEqual(e.faults, [], th);
        assert.ok(e.ctx.log.length > 50, th + ' simple plays');
    }
});

test('back from a stall the music picks up from now: no burst of the notes it missed', () => {
    for (const th of THEMES) {
        const e = engine(th);
        e.run(6);
        const per = e.ctx.log.length / 6;                    // notes a second in normal running
        e.ctx.currentTime += 45;                             // the tab was hidden, or the page hung
        const before = e.ctx.log.length;
        e.sfx.tick();
        const burst = e.ctx.log.slice(before);
        assert.ok(burst.length < per * 0.6 + 12, `${th}: ${burst.length} notes in one tick after a stall (normally ${per.toFixed(0)} a second)`);
        for (const n of burst) assert.ok(n.t > e.ctx.currentTime - 0.35, `${th}: a note scheduled in the past (${(n.t - e.ctx.currentTime).toFixed(2)} s)`);
        e.run(3);
        assert.deepStrictEqual(e.faults, [], th);
    }
});

test('a held job plays its figure on the track\'s grid, at the track\'s own rate, and stops with the hold', () => {
    const E = require('../engine.js');
    // The figure's grid is the division of the playing song's 16th nearest an 8th at 124 BPM (a track may set its own).
    const expect = {};
    for (const th of THEMES) {
        const c = win.SFX.catalog[th], step = 60 / c.songs.lab[0].bpm / 4;
        expect[th] = 1 / ((c.holdDiv || 2 * Math.pow(2, Math.round(Math.log2(0.121 / step)))) * step);
    }
    for (const th of THEMES) {
        const e = engine(th, { area: 'lab', training: false });
        e.run(2);
        const master = e.sfx.lab.master();
        const clicks = () => e.ctx.log.filter(n => n.kind === 'osc' && reaches(n, master));
        const from = e.ctx.currentTime;
        e.sfx.play('click', { res: 'cp', q: 1 });            // the press
        // The game pays a repeat every hold interval for eight seconds, whatever the track's tempo.
        let next = from + E.HOLD_INTERVAL_MS / 1000, paid = 0;
        e.run(8, () => { while (e.ctx.currentTime >= next) { e.sfx.held('cp'); paid++; next += E.HOLD_INTERVAL_MS / 1000; } });
        const release = e.ctx.currentTime;
        e.sfx.held(null);
        const starts = [...new Set(clicks().filter(n => n.t > from + 0.5 && n.t <= release).map(n => n.t.toFixed(4)))].map(Number).sort((a, b) => a - b);
        const rate = (starts.length - 1) / (starts[starts.length - 1] - starts[0]);
        assert.ok(Math.abs(rate - expect[th]) < 0.12, `${th}: ${rate.toFixed(2)} notes a second, its grid gives ${expect[th].toFixed(2)}`);
        assert.strictEqual(paid, Math.floor(8000 / E.HOLD_INTERVAL_MS + 1e-9), th + ': the game paid at its own rate');
        // Evenly on the grid: every gap is the same.
        const gaps = starts.slice(1).map((t, i) => t - starts[i]);
        assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.002, th + ': the figure keeps the grid');
        // After the release nothing new is struck beyond the look-ahead.
        const before = e.ctx.log.length;
        e.run(1.5);
        const late = e.ctx.log.slice(before).filter(n => n.kind === 'osc' && reaches(n, master));   // (the first drum builds the shared noise buffer through the effects' bus: not a note)
        assert.strictEqual(late.length, 0, th + ': notes scheduled after the release: ' + late.map(n => n.kind + '@' + (n.t - release).toFixed(3) + ' made ' + (n.made - release).toFixed(3)).join(' '));
        assert.ok(Math.max(...clicks().map(n => n.t)) <= release + 0.15, th + ': the last note is within 150 ms of the release');
    }
});

test('a tap never waits longer for the grid than it did at 124 BPM, in any track', () => {
    for (const th of THEMES) {
        const e = engine(th, { area: 'lab', training: false });
        const master = e.sfx.lab.master();
        let worst = 0;
        for (let i = 0; i < 40; i++) {
            e.run(0.3 + (i % 7) * 0.031);
            const before = e.ctx.log.length, now = e.ctx.currentTime;
            e.sfx.play('click', { res: 'dp', q: 1 });
            const mine = e.ctx.log.slice(before).filter(n => reaches(n, master));
            assert.ok(mine.length > 0, th + ': a click plays');
            worst = Math.max(worst, Math.min(...mine.map(n => n.t)) - now);
        }
        assert.ok(worst <= 0.1215 + 1e-6, `${th}: a tap waited ${(worst * 1000).toFixed(0)} ms`);
    }
});

test('changing track and room a hundred times leaves the music running at the right tempo, with no fault', () => {
    const e = engine('classic');
    const cat = win.SFX.catalog;
    for (let i = 0; i < 100; i++) {
        const th = THEMES[(i * 3 + 1) % 5], area = ['lab', 'server', 'snare'][i % 3];
        e.sfx.setMusicStyle(th);
        e.sfx.setArea(area);
        e.run(0.4 + (i % 5) * 0.3);
        const now = e.sfx.song;
        assert.ok(now, `music is playing after switch ${i}`);
        assert.strictEqual(now.bpm, cat[th].songs[area][now.song - 1].bpm, `switch ${i}: ${th} plays its song's tempo`);
    }
    assert.deepStrictEqual(e.faults, []);
});

test('the music never times the game, and the game never reads the music\'s clock', () => {
    const fs = require('node:fs');
    const sfx = fs.readFileSync(path.join(root, 'sfx.js'), 'utf8');
    assert.ok(!/holdClock\(|HOLD_INTERVAL|HOLD_RATE/.test(sfx), 'the audio engine knows nothing of the hold rate');
    const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
    for (const bad of ['SFX.context', 'SFX.tick', 'SFX?.context', 'holdDelay', 'SFX.lab']) assert.ok(!game.includes(bad), 'game.js uses ' + bad);
    for (const th of THEMES) assert.ok(!/AGI\b|E\.hold|localStorage/.test(fs.readFileSync(path.join(root, 'music', th + '.js'), 'utf8')), th + '.js touches the game');
});
