// tools/audio/package.js — the review package's audio and numbers.
//   node tools/audio/package.js [--out review-out/audio/package]
// Writes, for the five tracks:
//   listen/<track>-1-training-run.wav      60 s: sprints, prompts, a breakthrough, a summit (production level)
//   listen/<track>-2-lab-jobs-held.wav     60 s: the lab, jobs tapped and held, buys (no beat outside training)
//   listen/<track>-3-everything-at-once.wav 32 s: the overlap stress (a held job, buys, a milestone, a power-up, a room change)
//   listen/all-4-changing-track-and-room.wav  the five tracks and three rooms in turn: the transitions
//   compare/<track>-run-new.wav and -old.wav  the same training run before and after, both at one loudness (the
//                                          comparison copies: gained, never used for measurements)
//   manifest.json     every clip: what it is, track, tempo, seed, commit, settings, loudness, true peak
//   metrics.json      the survey of every song, four seeds of the stress timeline per track, determinism, voices
// The "old" clips come from review-out/audio/baseline/listen (node tools/audio/survey.js baseline, run on the
// baseline commit); without them the comparison is skipped and says so.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const R = require('./render.js');
const M = require('./measure.js');

(async () => {
    const args = process.argv.slice(2), oi = args.indexOf('--out');
    const out = path.resolve(oi >= 0 ? args[oi + 1] : 'review-out/audio/package');
    for (const d of ['listen', 'compare', 'tmp']) fs.mkdirSync(path.join(out, d), { recursive: true });
    const commit = (() => { try { return require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return null; } })();
    const s = await R.open();
    const cat = await s.page.evaluate(() => window.SFX.catalog);
    const styles = Object.keys(cat);
    const clips = [], metrics = { commit, date: new Date().toISOString(), settings: { sound: 0.5, music: 0.35, sampleRate: 48000, bits: 16 }, stress: [], determinism: [], voices: {}, songs: [] };
    const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const tmp = n => path.join(out, 'tmp', n + '.wav');
    const keep = async (name, spec, what, extra = {}) => {
        const r = await R.render(s, spec, tmp(name));
        const dst = path.join(out, 'listen', name + '.wav');
        M.convert(tmp(name), dst);
        clips.push({ file: 'listen/' + name + '.wav', what, track: spec.style, bpm: cat[spec.style].bpm, seed: spec.seed, seconds: spec.seconds, level: 'production', lufs: r.lufs, truePeak: r.truePeak, faults: r.faults.length, ...extra });
        console.log(`${name.padEnd(36)} ${String(r.lufs).padStart(7)} LUFS ${String(r.truePeak).padStart(7)} dBTP${r.faults.length ? '  FAULTS ' + r.faults[0] : ''}`);
        return r;
    };
    for (const style of styles) {
        const run = await keep(`${style}-1-training-run`, R.PRESETS.run({ style }), 'A training run: sprints, prompts, a breakthrough, a summit');
        await keep(`${style}-2-lab-jobs-held`, R.PRESETS.hold({ style }), 'The lab: jobs tapped and held, buys; no beat outside training');
        await keep(`${style}-3-everything-at-once`, R.PRESETS.stress({ style }), 'Overlap: a held job, buys, a milestone, a power-up and a change of room on a fast run');
        // The same run before the overhaul, both at one loudness.
        const old = path.resolve('review-out/audio/baseline/listen', `${style}-run.wav`);
        if (fs.existsSync(old)) {
            const o = M.measure(old), n = { lufs: run.lufs, truePeak: run.truePeak };
            const target = Math.min(-20, o.lufs + (-1.5 - o.truePeak), n.lufs + (-1.5 - n.truePeak));
            M.convert(old, path.join(out, 'compare', `${style}-run-old.wav`), { gain: +(target - o.lufs).toFixed(2) });
            M.convert(tmp(`${style}-1-training-run`), path.join(out, 'compare', `${style}-run-new.wav`), { gain: +(target - n.lufs).toFixed(2) });
            for (const [k, src] of [['old', o], ['new', n]]) {
                const m = M.measure(path.join(out, 'compare', `${style}-run-${k}.wav`));
                clips.push({ file: `compare/${style}-run-${k}.wav`, what: `The training run ${k === 'old' ? 'before' : 'after'} the overhaul, loudness-matched for comparison`, track: style, level: 'matched', gainDb: +(target - src.lufs).toFixed(2), lufs: m.lufs, truePeak: m.truePeak });
            }
        } else console.log(`   (no baseline clip for ${style}: comparison skipped)`);
        // Peaks under stress, four seeds.
        for (const seed of [1, 2, 3, 4]) {
            const r = await R.render(s, R.PRESETS.stress({ style, seed }), tmp('stress'));
            metrics.stress.push({ style, seed, lufs: r.lufs, truePeak: r.truePeak, bad: r.bad, nans: r.nans, infs: r.infs, faults: r.faults });
        }
        // The same timeline twice gives the same file.
        const a = await R.render(s, R.PRESETS.run({ style, seconds: 20 }), tmp('det-a'), { measure: false }), b = await R.render(s, R.PRESETS.run({ style, seconds: 20 }), tmp('det-b'), { measure: false });
        // Chromium's offline renderer is not bit-exact from run to run (rounding in its own nodes): the same means the
        // largest difference between the two files is far below hearing (-100 dB under the peak or less).
        const fl = f => { const buf = fs.readFileSync(f); return new Float32Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) >> 2); };
        const x = fl(a.file), y = fl(b.file);
        let diff = 0, peak = 1e-9;
        for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); if (d > diff) diff = d; if (Math.abs(x[i]) > peak) peak = Math.abs(x[i]); }
        const under = diff ? +(20 * Math.log10(diff / peak)).toFixed(1) : -Infinity;
        metrics.determinism.push({ style, identical: sha(a.file) === sha(b.file), largestDifferenceDbUnderPeak: under, same: under < -100 });
    }
    const order = ['classic', 'soft', 'ominous', 'retro', 'dark'].filter(x => styles.includes(x)), ev = [];
    order.forEach((st, i) => { if (i) ev.push([i * 14, 'setMusicStyle', st]); ev.push([i * 14 + 5, 'setArea', 'lab'], [i * 14 + 10, 'setArea', 'server']); });
    await keep('all-4-changing-track-and-room', { ...R.PRESETS.song({ style: order[0], area: 'server', seconds: order.length * 14 + 4, intensity: 0.7, depth: 0.7 }), events: ev },
        `Transitions: ${order.join(', ')} in turn (a new track every 14 s), each going to the lab and back to the server room`);
    // Every song, measured through its form.
    for (const style of styles) for (const area of Object.keys(cat[style].songs)) for (const [i, song] of cat[style].songs[area].entries()) {
        const r = await R.render(s, R.PRESETS.song({ style, area, song: i + 1, seconds: Math.min(song.seconds + 4, 200) }), tmp('song'));
        metrics.songs.push({ style, area, name: song.name, bpm: song.bpm, bars: song.bars, seconds: song.seconds, lufs: r.lufs, truePeak: r.truePeak, crest: r.crest, mono: r.mono, faults: r.faults });
    }
    await R.close(s);
    fs.rmSync(path.join(out, 'tmp'), { recursive: true, force: true });
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ commit, made: metrics.date, settings: 'default sliders (Sound 50%, Music 35%), 48 kHz, 16-bit WAV, offline renders of the production engine', clips }, null, 1));
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 1));
    const lufs = metrics.songs.map(x => x.lufs), hot = Math.max(...metrics.stress.map(x => x.truePeak));
    console.log(`\n${clips.length} clips. Songs: ${metrics.songs.length}, ${Math.min(...lufs)} to ${Math.max(...lufs)} LUFS. Stress (${metrics.stress.length} runs): hottest true peak ${hot} dBTP, bad samples ${metrics.stress.reduce((a, x) => a + x.bad + x.nans + x.infs, 0)}.`
        + ` Deterministic: ${metrics.determinism.every(x => x.same) ? 'yes' : 'NO ' + JSON.stringify(metrics.determinism)}. Faults: ${metrics.songs.concat(metrics.stress).reduce((a, x) => a + x.faults.length, 0)}.`);
})().catch(e => { console.error(e); process.exit(1); });
