// tools/audio/survey.js — render and measure everything, keep the numbers, and keep only a short listening set.
//   node tools/audio/survey.js <label> [--styles classic,soft] [--seconds 128] [--keep] [--quick]
// For each track: its six songs through their form (everything in: a fast run late in the game), then the lab with
// jobs held, a training run, and the stress timeline; the same in simple sounds for one song. Writes
//   review-out/audio/<label>/survey.json    every measurement (FFmpeg: LUFS, true peak, range, crest, mono)
//   review-out/audio/<label>/listen/*.wav   one training run and one lab clip per track, 16-bit, for ears
// Full renders are deleted once measured unless --keep. --quick renders 40 s of each song instead of the whole form.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./render.js');
const M = require('./measure.js');

(async () => {
    const args = process.argv.slice(2);
    const label = args[0] && !args[0].startsWith('--') ? args[0] : 'survey';
    const flag = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
    const dir = path.resolve('review-out/audio', label);
    const keep = !!flag('keep'), seconds = Number(flag('seconds')) || (flag('quick') ? 40 : 128);
    fs.mkdirSync(path.join(dir, 'listen'), { recursive: true });
    const s = await R.open();
    const styles = flag('styles') ? String(flag('styles')).split(',') : await s.page.evaluate(() => window.SFX.MUSIC_STYLES);
    const rows = [];
    const t0 = Date.now();
    const one = async (name, spec, listen) => {
        const file = path.join(dir, name + '.wav');
        const r = await R.render(s, spec, file);
        const row = { name, style: spec.style, simple: !!spec.simple, seconds: spec.seconds, lufs: r.lufs, truePeak: r.truePeak, lra: r.lra, crest: r.crest, mono: r.mono,
            bad: r.bad, faults: r.faults, errors: r.errors, song: r.song };
        rows.push(row);
        if (listen) M.convert(file, path.join(dir, 'listen', name + '.wav'));
        if (!keep) fs.unlinkSync(file);
        const flagged = r.bad || r.faults.length || r.errors.length || r.truePeak > -1;
        console.log(`${flagged ? '!!' : '  '} ${name.padEnd(34)} ${String(r.lufs).padStart(7)} LUFS  ${String(r.truePeak).padStart(7)} dBTP  crest ${r.crest}${r.faults.length ? '  FAULTS ' + r.faults.slice(0, 2).join('; ') : ''}`);
        return row;
    };
    // Every effect and its variants, so each one is played (and can fault) in every track.
    const fx = [];
    for (const n of await s.page.evaluate(() => window.SFX.sounds)) {
        if (n === 'click') for (const res of ['cp', 'dp', 'rp']) fx.push(['click', { res }]);
        else if (n === 'buy') for (const panel of ['hardware', 'software', 'algorithms', 'consciousness', 'training', 'legacy', 'snare']) fx.push(['buy', { panel }]);
        else if (n === 'buyBig') fx.push(['buyBig', { panel: 'hardware' }]);
        else if (n === 'snarePlace') for (const kind of ['wall', 'decoy', 'turret', 'tower']) fx.push([n, { kind }]);
        else if (n === 'snarePower') for (const kind of ['freeze', 'purge']) fx.push([n, { kind }]);
        else if (n === 'snareQuarantine') fx.push([n], [n, { partner: true }]);
        else if (n === 'snareStun') fx.push([n], [n, { down: true }]);
        else if (n === 'snareCatch') fx.push([n, { mult: 1 }], [n, { mult: 3.5 }]);
        else if (n === 'runEnd') fx.push([n], [n, { good: true }]);
        else if (n === 'land') fx.push([n, { impact: 3 }], [n, { impact: 15 }]);
        else fx.push([n]);
    }
    for (const style of styles) {
        await one(`${style}-effects`, R.PRESETS.effects({ style, names: fx }));
        await one(`${style}-simple-effects`, R.PRESETS.effects({ style, names: fx, simple: true }));
        for (const area of ['lab', 'server', 'snare']) for (const song of [1, 2])
            await one(`${style}-${area}-${song}`, R.PRESETS.song({ style, area, song, seconds }));
        await one(`${style}-build`, R.PRESETS.build({ style }));
        await one(`${style}-lab-held`, R.PRESETS.hold({ style }), true);
        await one(`${style}-run`, R.PRESETS.run({ style }), true);
        await one(`${style}-stress`, R.PRESETS.stress({ style }));
        await one(`${style}-simple-server-1`, R.PRESETS.song({ style, area: 'server', song: 1, seconds: Math.min(seconds, 64), simple: true }));
        await one(`${style}-simple-run`, R.PRESETS.run({ style, simple: true }));
    }
    await R.close(s);
    const head = (() => { try { return require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return null; } })();
    fs.writeFileSync(path.join(dir, 'survey.json'), JSON.stringify({ label, commit: head, date: new Date().toISOString(), settings: { sound: 0.5, music: 0.35, sampleRate: 48000 }, rows }, null, 1));
    const bad = rows.filter(r => r.bad || r.faults.length || r.errors.length);
    console.log(`${rows.length} renders in ${Math.round((Date.now() - t0) / 1000)} s → ${path.join(dir, 'survey.json')}${bad.length ? `; ${bad.length} with faults` : ''}`);
    process.exit(bad.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(1); });
