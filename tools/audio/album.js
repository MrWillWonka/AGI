// tools/audio/album.js — every song of every track as a file, and a player page for them (to publish as an artifact).
//   node tools/audio/album.js [--out review-out/audio/album] [--lufs -18]
// Writes
//   audio/<nn>-<track>-<song>.mp4   each of the 30 songs once through its form, everything in (a fast run late in
//                                   the game), AAC 128 kbit/s in MP4 (the format an artifact page can offer to save)
//   audio/<nn>-…-simple.mp4         the same song in Simple sounds (the stripped version: Settings → Simple sounds only)
//   audio/<nn>-…-calm.mp4           a Packet Snare song before you are spotted (a calm field: the hushed kick, the clock)
//                                   both at 64 kbit/s, for reference
//   audio/00-five-themes.mp4        eight seconds of each track in turn (as showcase.js)
//   index.html                      the player: tools/audio/album.html with the track list filled in
//   tracks.json                     the list, with each file's gain, loudness and peak
// Listening copies, not measurements: each is gained toward one loudness (`lufs`, default -18; the game plays about
// 16 dB quieter at its default sliders); a song whose peaks would clip at that gain is limited at about -2 dB.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('./render.js');
const M = require('./measure.js');

const ORDER = ['classic', 'dark', 'soft', 'ominous', 'retro'], AREAS = ['lab', 'server', 'snare'];
const START = 0.55;      // the music's first downbeat is 0.6 s into a render
(async () => {
    const args = process.argv.slice(2);
    const flag = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
    const out = path.resolve(flag('out', 'review-out/audio/album')), target = Number(flag('lufs', -18));
    fs.mkdirSync(path.join(out, 'audio'), { recursive: true });
    fs.mkdirSync(path.join(out, 'tmp'), { recursive: true });
    const ff = a => spawnSync(M.ffmpeg(), ['-hide_banner', '-nostats', '-y', ...a], { encoding: 'utf8' });
    const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // A window of a render, gained and faded, as AAC.
    const encode = (raw, dst, from, secs, fade, rate = '128k') => {
        const m = M.measure(raw, { from, to: from + secs });
        // A song whose peaks would pass -1.5 dB at that gain (Retro's short kick) goes through a limiter there instead
        // of coming out quieter than the rest.
        const gain = target - m.lufs, limit = m.truePeak + gain > -1.5 ? 'alimiter=limit=0.8:attack=2:release=40:level=false,' : '';
        ff(['-ss', String(from), '-t', String(secs), '-i', raw, '-af', `volume=${gain.toFixed(2)}dB,${limit}afade=t=in:d=0.02,afade=t=out:st=${(secs - fade).toFixed(2)}:d=${fade}`,
            '-c:a', 'aac', '-b:a', rate, '-movflags', '+faststart', dst]);
        if (!fs.existsSync(dst)) throw new Error('not written: ' + dst);
        const d = M.measure(dst);
        return { gainDb: +gain.toFixed(2), limited: !!limit, lufs: d.lufs, truePeak: d.truePeak, bytes: fs.statSync(dst).size };
    };
    const s = await R.open();
    const cat = await s.page.evaluate(() => window.SFX.catalog);
    const tracks = [], parts = [];
    let n = 0;
    for (const style of ORDER) for (const area of AREAS) for (const [i, song] of (cat[style].songs[area] || []).entries()) {
        const raw = path.join(out, 'tmp', 'song.wav');
        const r = await R.render(s, R.PRESETS.song({ style, area, song: i + 1, seconds: START + song.seconds + 1 }), raw, { measure: false });
        if (r.faults.length) throw new Error(`${style} ${song.name}: ${r.faults[0]}`);
        const file = `audio/${String(++n).padStart(2, '0')}-${style}-${slug(song.name)}.mp4`;
        const e = encode(raw, path.join(out, file), START, song.seconds, 1.2);
        // The reference versions: Simple sounds, and for Packet Snare the song before detection.
        const alts = [];
        for (const [key, label, o] of [['simple', 'Standard', { simple: true }], ...(area === 'snare' ? [['calm', 'Stealth', { intensity: 0.12 }]] : [])]) {
            const ra = await R.render(s, R.PRESETS.song({ style, area, song: i + 1, seconds: START + song.seconds + 1, ...o }), raw, { measure: false });
            if (ra.faults.length) throw new Error(`${style} ${song.name} (${key}): ${ra.faults[0]}`);
            const f = file.replace('.mp4', `-${key}.mp4`), ea = encode(raw, path.join(out, f), START, song.seconds, 1.2, '64k');
            alts.push({ key, label, file: f, ...ea });
        }
        e.bytes += alts.reduce((a, x) => a + x.bytes, 0);
        const pulse = Math.round(4 * song.bpm / song.tempo);
        tracks.push({ file, theme: style, name: song.name, area, bpm: song.tempo, meter: { '16/4': '4/4', '12/4': '3/4', '12/6': '6/8', '12/3': '12/8', '14/4': '7/8', '20/4': '5/4' }[song.steps + '/' + pulse] || '', seconds: song.seconds, ...e, alts });
        console.log(`${file.padEnd(46)} ${String(song.seconds).padStart(4)} s  ${e.lufs} LUFS  ${e.truePeak} dBTP  ${(e.bytes / 1048576).toFixed(1)} MB`);
        // The sampler: eight seconds of each track's first server-room song, from the top of its tune.
        if (area === 'server' && i === 0) {
            const sec = song.sections.find(x => x.mel != null && x.drums === 'full') || song.sections[0];
            const from = 0.6 + sec.start * song.steps * (60 / song.bpm / 4), p = path.join(out, 'tmp', `part-${style}.mp4`);
            encode(raw, p, from, 8, 0.35);
            parts.push(p);
        }
    }
    await R.close(s);
    const list = path.join(out, 'tmp', 'list.txt'), five = 'audio/00-five-themes.mp4';
    fs.writeFileSync(list, parts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(out, five)]);
    const sampler = { file: five, theme: 'all', name: 'Five themes in 40 seconds', area: 'sampler', bpm: null, seconds: parts.length * 8, bytes: fs.statSync(path.join(out, five)).size };
    fs.rmSync(path.join(out, 'tmp'), { recursive: true, force: true });
    const themes = Object.fromEntries(ORDER.map(k => [k, { bpm: cat[k].bpm, swing: cat[k].swing }]));
    const data = { made: new Date().toISOString().slice(0, 10), themes, sampler, tracks };
    fs.writeFileSync(path.join(out, 'tracks.json'), JSON.stringify(data, null, 1));
    const html = fs.readFileSync(path.join(__dirname, 'album.html'), 'utf8');
    if (html.split('/*ALBUM*/null').length !== 2) throw new Error('album.html: no /*ALBUM*/null to fill');
    fs.writeFileSync(path.join(out, 'index.html'), html.replace('/*ALBUM*/null', () => JSON.stringify(data)));
    const total = tracks.reduce((a, t) => a + t.bytes, sampler.bytes);
    console.log(`${tracks.length} songs, ${Math.round(tracks.reduce((a, t) => a + t.seconds, 0) / 60)} min, ${(total / 1048576).toFixed(1)} MB in ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
