// tools/audio/render.js — render the game's audio to WAV files, offline, with the game's own engine.
//   node tools/audio/render.js <preset> [--style classic] [--area lab] [--song 1] [--seconds 60] [--seed 1]
//                              [--simple] [--out review-out/audio] [--name x]
//   node tools/audio/render.js timeline.json [--out dir]          a timeline of your own (see page.js)
//   const R = require('./render.js'); const s = await R.open(); const r = await R.render(s, spec, 'out.wav'); await R.close(s);
// Presets (presets.js): song (one song at a set intensity), build (intensity rising, the layers coming in),
// hold (jobs held and tapped over the lab's music), run (a training run: sprints, prompts, a summit),
// stress (everything at once), effects (every effect of a track in turn, music off).
// Needs Playwright with Chromium (as tools/review/kit.js) and, for the numbers, FFmpeg (measure.js).
// Renders are 48 kHz 32-bit float WAV: exactly what the engine produced, clipping and all. Outputs go to review-out/
// (git-ignored). The same seed and timeline give the same file.
'use strict';
const fs = require('fs');
const path = require('path');
const { ensureServer } = require('../review/serve.js');
const M = require('./measure.js');
const PRESETS = require('./presets.js');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
    throw new Error('Playwright is not installed here. From the repo: npm install --no-save playwright, then npx playwright install chromium');
}

async function open() {
    const srv = await ensureServer(process.env.AUDIO_URL || 'http://localhost:8151/');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    const files = {};
    await page.exposeFunction('__audioChunk', (name, b64, first) => {
        if (first) { fs.mkdirSync(path.dirname(name), { recursive: true }); files[name] = fs.openSync(name, 'w'); }
        fs.writeSync(files[name], Buffer.from(b64, 'base64'));
    });
    await page.goto(new URL('tools/audio/page.html', srv.url).href);
    await page.waitForFunction(() => typeof window.renderTimeline === 'function' && typeof window.SFXBuild === 'function');
    return { srv, browser, page, errors, files };
}
async function close(s) { await s.browser.close(); s.srv.close?.(); }

// Render one timeline to `file`; the result carries the engine's own report and FFmpeg's numbers.
async function render(s, spec, file, { measure = true } = {}) {
    file = path.resolve(file);
    const r = await s.page.evaluate(([sp, f]) => window.renderTimeline(sp, f), [spec, file]);
    if (s.files[file] != null) { fs.closeSync(s.files[file]); delete s.files[file]; }
    r.file = file;
    r.errors = s.errors.splice(0);
    if (measure && M.ffmpeg()) Object.assign(r, M.measure(file));
    return r;
}

module.exports = { open, close, render, PRESETS };

if (require.main === module) (async () => {
    const args = process.argv.slice(2), opt = {};
    const pos = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; }
        else pos.push(args[i]);
    }
    const what = pos[0] || 'song';
    for (const k of ['seconds', 'seed', 'song', 'intensity', 'depth']) if (opt[k] != null) opt[k] = Number(opt[k]);
    const spec = what.endsWith('.json') ? JSON.parse(fs.readFileSync(what, 'utf8')) : PRESETS[what]?.(opt);
    if (!spec) { console.error('No such preset: ' + what + '. Presets: ' + Object.keys(PRESETS).join(', ')); process.exit(1); }
    const out = opt.out || 'review-out/audio';
    const name = opt.name || [path.basename(what, '.json'), spec.style, spec.area, spec.simple ? 'simple' : ''].filter(Boolean).join('-');
    const s = await open();
    const r = await render(s, spec, path.join(out, name + '.wav'));
    await close(s);
    console.log(JSON.stringify(r, null, 1));
    if (r.faults.length || r.errors.length || r.bad) process.exit(2);
})().catch(e => { console.error(e); process.exit(1); });
