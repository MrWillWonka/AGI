// tools/audio/measure.js — loudness and peaks of a WAV, measured with FFmpeg (EBU R128 / ITU BS.1770).
//   node tools/audio/measure.js file.wav [more.wav …]
//   const { measure, ffmpeg } = require('./measure.js');  measure('x.wav') → { lufs, truePeak, lra, peak, rms, crest, mono }
// lufs: integrated loudness. truePeak: dBTP, estimated by oversampling (good to a few tenths of a dB). peak, rms: dBFS
// of the samples. crest: peak − rms, dB. mono: how much the level changes when left and right are summed (dB; 0 for
// a mono mix, very negative when the sides cancel). A window: measure(file, { from, to }) in seconds.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// FFmpeg: on the PATH, or where winget links it (a shell opened before the install doesn't have the PATH yet).
function ffmpeg() {
    const tries = ['ffmpeg', process.env.FFMPEG, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')].filter(Boolean);
    for (const f of tries) { const r = spawnSync(f, ['-version'], { encoding: 'utf8' }); if (r.status === 0) return f; }
    return null;
}
const FF = ffmpeg();

function run(args) {
    const r = spawnSync(FF, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
    return (r.stderr || '') + (r.stdout || '');
}
const num = (re, text) => { const m = re.exec(text); return m ? Number(m[1]) : NaN; };

function measure(file, { from, to } = {}) {
    if (!FF) throw new Error('FFmpeg not found (winget install --id Gyan.FFmpeg, or set FFMPEG to its path)');
    if (!fs.existsSync(file)) throw new Error('no such file: ' + file);
    const win = [...(from != null ? ['-ss', String(from)] : []), ...(to != null ? ['-to', String(to)] : [])];
    const ln = run([...win, '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
    const st = run([...win, '-i', file, '-af', 'astats=measure_perchannel=none', '-f', 'null', '-']);
    const mid = run([...win, '-i', file, '-af', 'pan=mono|c0=0.5*c0+0.5*c1,astats=measure_perchannel=none', '-f', 'null', '-']);
    const rms = num(/RMS level dB:\s*(-?[\d.]+|-inf)/, st), peak = num(/Peak level dB:\s*(-?[\d.]+|-inf)/, st);
    const midRms = num(/RMS level dB:\s*(-?[\d.]+|-inf)/, mid);
    return {
        lufs: num(/"input_i"\s*:\s*"(-?[\d.]+|-inf)"/, ln), truePeak: num(/"input_tp"\s*:\s*"(-?[\d.]+|-inf)"/, ln),
        lra: num(/"input_lra"\s*:\s*"(-?[\d.]+)"/, ln), peak, rms, crest: +(peak - rms).toFixed(2),
        mono: +(midRms - rms).toFixed(2),
        nans: num(/Number of NaNs:\s*(\d+)/, st) || 0, infs: num(/Number of Infs:\s*(\d+)/, st) || 0
    };
}

// A file for listening or sharing: 16-bit WAV, FLAC or Opus by the extension, optionally gained (dB) or cut to a window.
function convert(src, dst, { gain = 0, from, to } = {}) {
    const win = [...(from != null ? ['-ss', String(from)] : []), ...(to != null ? ['-to', String(to)] : [])];
    const codec = /\.wav$/i.test(dst) ? ['-c:a', 'pcm_s16le'] : /\.flac$/i.test(dst) ? ['-c:a', 'flac'] : /\.(opus|ogg)$/i.test(dst) ? ['-c:a', 'libopus', '-b:a', '96k'] : [];
    run(['-y', ...win, '-i', src, ...(gain ? ['-af', `volume=${gain}dB`] : []), ...codec, dst]);
    return fs.existsSync(dst);
}

module.exports = { measure, convert, ffmpeg: () => FF };

if (require.main === module) {
    for (const f of process.argv.slice(2)) console.log(f, JSON.stringify(measure(f)));
}
