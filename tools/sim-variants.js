// Runs the balance sim as several human players measured from real playtest logs, so balance is checked against a
// spread of real players rather than one bot: each log's own player, the pooled mean and the pooled median
// (tools/playtest-calibrate.js), and the old default bot for comparison.
// Usage: node tools/sim-variants.js [profile.json] [--seeds 1,2,3,42] [--minutes 90] [--maxskill 15] [--jobs 4]
//   profile.json: `node tools/playtest-calibrate.js playtests/*.txt --json > playtests/profile.json` (the default).
// Prints, per variant: Pattern Matching (run and minute), General AI and the second act-two skill (Planning) (median and range over the seeds),
// and the share of sprints short of a full charge for lack of income.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : fallback; };
const profileFile = argv.find(a => a.endsWith('.json')) || path.join(__dirname, '..', 'playtests', 'profile.json');
const SEEDS = opt('seeds', '1,2,3,42').split(',').map(Number);
const MINUTES = opt('minutes', '90');
const E = require(path.join(__dirname, '..', 'engine.js'));
// The skill after General AI's first act-two skill (Planning: it was 'skill 8' when act two began at leg 7).
const S8 = E.ACT_TWO_LEG + 1;
const MAXSKILL = opt('maxskill', String(S8 + 1));
const JOBS = +opt('jobs', '4');

const prof = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
const variants = [{ name: 'old bot', knobs: { PROFILE: 'none' } }];
if (prof.sim) variants.push({ name: 'human mean', knobs: prof.sim });
if (prof.simMedian && (prof.logs || []).length > 1) variants.push({ name: 'human median', knobs: prof.simMedian });
for (const l of prof.logs || []) if ((prof.logs || []).length > 1) variants.push({ name: path.basename(l.file, path.extname(l.file)), knobs: l.sim });

function runSim(knobs, seed) {
    return new Promise(resolve => {
        const env = { ...process.env, MINUTES, MAXSKILL };
        for (const [k, v] of Object.entries(knobs)) if (v != null) env[k] = String(v);
        const p = spawn(process.execPath, [path.join(__dirname, 'sim.js'), path.join(__dirname, '..'), String(seed)], { env });
        let out = '';
        p.stdout.on('data', d => { out += d; });
        p.on('close', () => {
            const skill = n => { const m = out.match(new RegExp(`skill\\s+${n}\\s+.*?([0-9.]+) min\\s+run (\\d+)`)); return m ? { min: +m[1], run: +m[2] } : null; };
            const general = out.match(/General AI at ([0-9.]+) min/);
            const short = out.match(/sprints \d+ \((\d+)% below full charge\)/);
            resolve({ pm: skill(1), s8: skill(S8), general: general ? +general[1] : null, short: short ? +short[1] : null });
        });
    });
}

async function main() {
    const jobs = [];
    for (const v of variants) for (const seed of SEEDS) jobs.push({ v, seed });
    const results = new Map();
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const j = jobs[next++];
            const r = await runSim(j.v.knobs, j.seed);
            if (!results.has(j.v.name)) results.set(j.v.name, []);
            results.get(j.v.name).push(r);
            process.stderr.write('.');
        }
    };
    await Promise.all(Array.from({ length: JOBS }, worker));
    process.stderr.write('\n');
    const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
    const span = a => { const b = a.filter(x => x != null); return b.length ? `${Math.min(...b).toFixed(1)}–${Math.max(...b).toFixed(1)}` : 'never'; };
    console.log(`seeds ${SEEDS.join(',')} · ${MINUTES} min · profile ${path.relative(process.cwd(), profileFile)}`);
    for (const v of variants) {
        const rs = results.get(v.name);
        const knobs = v.knobs.PROFILE === 'none' ? 'CLICKS=3 LABSHARE=0.2 IDLE=0 CLEAN=0.5 PAUSE=2' : Object.entries(v.knobs).map(([k, x]) => `${k}=${x}`).join(' ');
        console.log(`\n${v.name}  (${knobs})`);
        console.log(`  Pattern Matching  run ${med(rs.map(r => r.pm?.run))}, ${med(rs.map(r => r.pm?.min))?.toFixed(1)} min (${span(rs.map(r => r.pm?.min))})`);
        console.log(`  General AI        ${med(rs.map(r => r.general))?.toFixed(1) ?? 'never'} min (${span(rs.map(r => r.general))})`);
        console.log(`  skill ${String(S8).padEnd(12)}${med(rs.map(r => r.s8?.min))?.toFixed(1) ?? 'never'} min (${span(rs.map(r => r.s8?.min))})`);
        console.log(`  sprints short     ${med(rs.map(r => r.short))}% (${span(rs.map(r => r.short))})`);
    }
    // Real players, to read the variants against (minutes from the first click, as the sim counts).
    for (const l of prof.logs || []) {
        const sk = n => l.skills.find(s => s.n === n);
        const pm = sk(2), ga = (l.phases || []).find(p => p.name === 'General AI');
        console.log(`\nreal: ${path.basename(l.file)}  Pattern Matching run ${pm?.runs ?? '–'}, ${pm?.fromStart ?? '–'} min; General AI ${ga ? (ga.min - l.openingSeconds / 60).toFixed(1) : '–'} min${l.debugJumps.length ? '  (debug resources added)' : ''}`);
    }
}
main();
