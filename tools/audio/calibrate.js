// tools/audio/calibrate.js — measure a track's music and say what its level numbers should be.
//   node tools/audio/calibrate.js <style> [--target -34] [--seconds 60] [--simple]
// Renders each of the track's songs three times (the whole mix, the beat alone, the tones alone: everything in, as on
// a fast run late in the game) and prints, from FFmpeg's integrated loudness:
//   lvl    per song, so every song's tones measure the same
//   beat   so the drums sit 2 dB under the tones (the project's balance)
//   gain   so the track's mix sits at the target (default: the level the game had before the overhaul, -34 LUFS)
// It changes nothing: copy the numbers into music/<style>.js and run it again (two passes settle it).
'use strict';
const path = require('path');
const fs = require('fs');
const R = require('./render.js');

(async () => {
    const args = process.argv.slice(2), style = args[0];
    const flag = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
    const target = Number(flag('target', -34)), seconds = Number(flag('seconds', 60)), simple = !!flag('simple', false);
    if (!style) { console.error('usage: node tools/audio/calibrate.js <style> [--target -34] [--seconds 60] [--simple]'); process.exit(1); }
    const dir = path.resolve('review-out/audio/calibrate');
    const s = await R.open();
    const rows = [];
    for (const area of ['lab', 'server', 'snare']) for (const song of [1, 2]) {
        const row = { area, song };
        for (const [k, mix] of [['full', { beat: 1, tones: 1 }], ['beat', { beat: 1, tones: 0 }], ['tones', { beat: 0, tones: 1 }]]) {
            const file = path.join(dir, `${style}-${area}-${song}-${k}.wav`);
            const r = await R.render(s, { ...R.PRESETS.song({ style, area, song, seconds, simple }), musicMix: mix }, file);
            row[k] = r.lufs; row.name = r.song && r.song.name; row.peak = Math.max(row.peak ?? -99, r.truePeak);
            if (r.faults.length) row.faults = r.faults;
            fs.unlinkSync(file);
        }
        rows.push(row);
        console.log(`${(row.name || area + ' ' + song).padEnd(18)} full ${String(row.full).padStart(7)}  beat ${String(row.beat).padStart(7)}  tones ${String(row.tones).padStart(7)}  peak ${row.peak}${row.faults ? '  FAULTS ' + row.faults[0] : ''}`);
    }
    await R.close(s);
    const mean = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
    const lin = db => Math.pow(10, db / 20);
    const tones = mean('tones'), beat = mean('beat'), full = mean('full');
    console.log(`\nMeans: full ${full.toFixed(2)}, beat ${beat.toFixed(2)}, tones ${tones.toFixed(2)} LUFS (beat is ${(beat - tones).toFixed(2)} dB against the tones; the balance asks for -2).`);
    console.log(`Multiply these by:`);
    console.log(`  ${simple ? 'simpleMix.beat' : 'beat'} × ${lin(tones - 2 - beat).toFixed(3)}`);
    console.log(`  ${simple ? 'simpleMix.gain' : 'gain'} × ${lin(target - full).toFixed(3)}   (to sit at ${target} LUFS; after changing beat, measure again)`);
    for (const r of rows) console.log(`  ${simple ? 'slvl' : 'lvl'} of ${(r.name || r.area + ' ' + r.song).padEnd(18)} × ${lin(tones - r.tones).toFixed(3)}`);
})().catch(e => { console.error(e); process.exit(1); });
