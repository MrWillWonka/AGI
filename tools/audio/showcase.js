// tools/audio/showcase.js — short clips for showing the tracks to someone: a reference clip of each, and all five in a row.
//   node tools/audio/showcase.js [--out review-out/audio/showcase] [--each 15] [--part 8] [--lufs -18]
// Writes
//   reference/<n>-<track>.wav    `each` seconds of each track: its first server-room song from the top of its tune,
//                                everything in (a fast run late in the game)
//   five-themes.wav              `part` seconds of each in turn, Classic first and Retro last, a short gap between
// These are for listening, not measuring: each clip is gained to one loudness (`lufs`, default -18; the game itself
// plays about 16 dB quieter at its default sliders) with short fades at its ends. 16-bit, 48 kHz.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('./render.js');
const M = require('./measure.js');

const ORDER = ['classic', 'dark', 'soft', 'ominous', 'retro'];
(async () => {
    const args = process.argv.slice(2);
    const flag = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
    const out = path.resolve(flag('out', 'review-out/audio/showcase')), each = Number(flag('each', 15)), part = Number(flag('part', 8)), target = Number(flag('lufs', -18));
    fs.mkdirSync(path.join(out, 'reference'), { recursive: true });
    fs.mkdirSync(path.join(out, 'tmp'), { recursive: true });
    const ff = a => spawnSync(M.ffmpeg(), ['-hide_banner', '-nostats', '-y', ...a], { encoding: 'utf8' });
    const s = await R.open();
    const cat = await s.page.evaluate(() => window.SFX.catalog);
    const rows = [], parts = [];
    for (const [i, style] of ORDER.entries()) {
        const song = cat[style].songs.server[0];
        // From the top of the tune: the first section with a melody and the full kit.
        const sec = song.sections.find(x => x.mel != null && x.drums === 'full') || song.sections[0];
        const bar = song.steps * (60 / song.bpm / 4), from = 0.6 + sec.start * bar;
        const raw = path.join(out, 'tmp', style + '.wav');
        await R.render(s, R.PRESETS.song({ style, area: 'server', song: 1, seconds: from + each + 2 }), raw, { measure: false });
        const cut = (dst, secs) => {
            const lufs = M.measure(raw, { from, to: from + secs }).lufs;
            let gain = target - lufs;
            const make = g => ff(['-ss', String(from), '-t', String(secs), '-i', raw, '-af', `volume=${g.toFixed(2)}dB,afade=t=in:d=0.03,afade=t=out:st=${(secs - 0.35).toFixed(2)}:d=0.35`, '-c:a', 'pcm_s16le', dst]);
            make(gain);
            let m = M.measure(dst);
            // Never clipped: back off instead (a few passes: a clipped first try hides how far over it was).
            for (let k = 0; k < 5 && m.truePeak > -1; k++) { gain -= m.truePeak + 1.2; make(gain); m = M.measure(dst); }
            return { gainDb: +gain.toFixed(2), lufs: m.lufs, truePeak: m.truePeak };
        };
        const ref = path.join(out, 'reference', `${i + 1}-${style}.wav`);
        rows.push({ file: `reference/${i + 1}-${style}.wav`, track: style, song: song.name, bpm: song.bpm, from: sec.name, seconds: each, ...cut(ref, each) });
        const p = path.join(out, 'tmp', `part-${style}.wav`);
        cut(p, part);
        parts.push(p);
        console.log(`${(i + 1 + '-' + style).padEnd(12)} ${song.name.padEnd(12)} ${song.bpm} BPM  ${rows[rows.length - 1].lufs} LUFS  ${rows[rows.length - 1].truePeak} dBTP`);
    }
    await R.close(s);
    // The five in a row, a third of a second of silence between them.
    const list = path.join(out, 'tmp', 'list.txt'), gap = path.join(out, 'tmp', 'gap.wav');
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.35', '-c:a', 'pcm_s16le', gap]);
    fs.writeFileSync(list, parts.map((p, i) => (i ? `file '${gap.replace(/\\/g, '/')}'\n` : '') + `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    const five = path.join(out, 'five-themes.wav');
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', five]);
    const m = M.measure(five);
    const secs = +(fs.statSync(five).size / (48000 * 4)).toFixed(1);
    fs.rmSync(path.join(out, 'tmp'), { recursive: true, force: true });
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), note: `Listening copies: each clip gained to about ${target} LUFS, short fades; the game plays quieter. Each is the track's first server-room song from the top of its tune, everything in.`,
        reference: rows, showcase: { file: 'five-themes.wav', order: ORDER, secondsEach: part, seconds: secs, lufs: m.lufs, truePeak: m.truePeak } }, null, 1));
    console.log(`five-themes.wav  ${secs} s  ${m.lufs} LUFS  ${m.truePeak} dBTP  (${ORDER.join(', ')})`);
})().catch(e => { console.error(e); process.exit(1); });
