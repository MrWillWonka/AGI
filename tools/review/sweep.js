// tools/review/sweep.js <sweep.json> — try balance options without touching the game: each variant is a scratch copy of
// the repo with text replacements in engine.js (or another file), played by tools/review/pacing.js's campaigns, all seeds
// of all variants at once across the machine's cores, at 30 steps a second (pacing.js --step: about 1.8× faster, within
// the seeds' noise but about 5% slow on catches, so compare variants with each other, not with the owner's log).
// sweep.json: { "minutes": 45, "seeds": [1,2,3], "screen": "phone", "untilSector": 0, "steps": 30,
//   "variants": { "name": { "engine.js": [["text to find", "replacement"], …] }, "base": {} } }
// Prints a table: runs per sector (median), when the tree was bought out, the sectors on target; then the minute each
// sector was cleared (median).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.join(__dirname, '..', '..');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const work = path.join(os.tmpdir(), 'agi-sweep');
const copy = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        if (['.git', 'review-out', 'playtests', 'node_modules'].includes(e.name)) continue;
        const a = path.join(from, e.name), b = path.join(to, e.name);
        if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); } else fs.copyFileSync(a, b);
    }
};
(async () => {
    const { runCampaigns, PACE } = require('./pacing.js');
    const E = require(path.join(root, 'engine.js'));
    const names = Object.keys(spec.variants);
    const jobs = [];
    for (const name of names) {
        const dir = path.join(work, name.replace(/[^\w.-]/g, '_'));
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        copy(root, dir);
        for (const [file, edits] of Object.entries(spec.variants[name])) {
            let text = fs.readFileSync(path.join(dir, file), 'utf8');
            for (const [find, repl] of edits) {
                if (!text.includes(find)) { console.error(`${name}: "${find}" not found in ${file}`); process.exit(1); }
                text = text.replace(find, repl);
            }
            fs.writeFileSync(path.join(dir, file), text);
        }
        for (const seed of spec.seeds || [1, 2, 3]) jobs.push({ name, job: { seed, screen: spec.screen || 'phone', minutes: spec.minutes || 30, pace: PACE, runCap: spec.runCap || 120, steps: spec.steps || 30, untilSector: spec.untilSector || 0, untilTree: !!spec.untilTree, engineDir: dir } });
    }
    const t0 = Date.now();
    const res = await runCampaigns(jobs.map(j => j.job));
    const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
    const maxK = Math.max(...res.map(c => c.sectors.length));
    console.log(`| variant | ${Array.from({ length: maxK }, (_, i) => `s${i + 1}`).join(' | ')} | tree bought out (min) |`);
    console.log(`|---|${Array.from({ length: maxK }, () => '---|').join('')}---|`);
    for (const name of names) {
        const cs = res.filter((_, i) => jobs[i].name === name);
        const cells = Array.from({ length: maxK }, (_, i) => { const r = cs.map(c => c.sectors.find(x => x.sector === i + 1)?.runs); return r.every(x => x === undefined) ? '—' : `${med(r.filter(x => x !== undefined))}${r.some(x => x === undefined) ? '*' : ''}`; });
        console.log(`| ${name} | ${cells.join(' | ')} | ${cs.map(c => c.treeDone ?? '—').join('/')} |`);
    }
    // and the minute each sector fell (median of the seeds that got there): where the time goes, not just the runs
    console.log(`\n| variant (minute cleared) | ${Array.from({ length: maxK }, (_, i) => `s${i + 1}`).join(' | ')} |`);
    console.log(`|---|${Array.from({ length: maxK }, () => '---|').join('')}`);
    for (const name of names) {
        const cs = res.filter((_, i) => jobs[i].name === name);
        const cells = Array.from({ length: maxK }, (_, i) => { const r = cs.map(c => c.sectors.find(x => x.sector === i + 1)?.minute).filter(x => x !== undefined); return r.length ? `${Math.round(med(r))}` : '—'; });
        console.log(`| ${name} | ${cells.join(' | ')} |`);
    }
    console.log(`\nmedian runs to clear each sector (* not every seed got there); ${jobs.length} campaigns in ${Math.round((Date.now() - t0) / 1000)} s; ${E.BUILD.split('·')[0].trim()}`);
})();
