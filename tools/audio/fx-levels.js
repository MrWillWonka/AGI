// tools/audio/fx-levels.js — level a track's single effects and sprint-meter parts against Classic's.
//   node tools/audio/fx-levels.js <style> [names…]      (default names: the power-up moments)
// Each effect is rendered alone (music off) in Classic and in the track, three plays each so its variations average
// out, and measured (FFmpeg, integrated loudness). Prints what to multiply `trims.fx.<name>` by so the track's effect
// is as loud as Classic's. Then each of the track's four meter parts, held for four seconds, against the mean of
// Classic's four: what to multiply `trims.charge[i]` by. It changes nothing.
'use strict';
const path = require('path');
const fs = require('fs');
const R = require('./render.js');

const POWER = ['system', 'smash', 'windup', 'crunch', 'flow', 'freeze', 'release', 'viral'];
(async () => {
    const [style, ...rest] = process.argv.slice(2);
    if (!style) { console.error('usage: node tools/audio/fx-levels.js <style> [names…]'); process.exit(1); }
    const names = rest.length ? rest : POWER;
    const dir = path.resolve('review-out/audio/fx-levels');
    const s = await R.open();
    const lin = db => Math.pow(10, db / 20);
    const one = async (st, spec, tag) => {
        const file = path.join(dir, `${st}-${tag}.wav`);
        const r = await R.render(s, { seed: 3, style: st, sound: 0.5, music: 0, ...spec }, file);
        fs.unlinkSync(file);
        if (r.faults.length) console.log('   FAULT', st, tag, r.faults[0]);
        return r.lufs;
    };
    console.log(`Effects (${style} against classic):`);
    for (const n of names) {
        const spec = { seconds: 9, events: [[0.2, 'play', n], [3.2, 'play', n], [6.2, 'play', n]] };
        const a = await one('classic', spec, n), b = await one(style, spec, n);
        console.log(`  ${n.padEnd(12)} classic ${String(a).padStart(7)}  ${style} ${String(b).padStart(7)}  → trims.fx.${n} × ${Number.isFinite(a - b) ? lin(a - b).toFixed(2) : '?'}`);
    }
    console.log(`Meter parts (${style}; target: the mean of classic's four):`);
    const meter = (st, vi) => one(st, { seconds: 5, meterVoice: vi, sprints: [{ from: 0.3, to: 4.3, level: 1, silent: true }], events: [] }, 'meter' + vi);
    let target = 0;
    for (let i = 0; i < 4; i++) target += (await meter('classic', i)) / 4;
    for (let i = 0; i < 4; i++) { const v = await meter(style, i); console.log(`  part ${i}  ${String(v).padStart(7)} LUFS (target ${target.toFixed(2)})  → trims.charge[${i}] × ${lin(target - v).toFixed(2)}`); }
    await R.close(s);
})().catch(e => { console.error(e); process.exit(1); });
