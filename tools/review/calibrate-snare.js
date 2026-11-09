// tools/review/calibrate-snare.js <log.txt> [more logs…] — fit the person-paced bot to the owner's Packet Snare logs.
// Reads each log's `snare` events (a run each), `snareGoal`/`snareBoss` (a sector cleared) and the build line, and writes:
//   design/review/owner-profile.json  the owner's numbers: runs and play minutes to clear each sector, catches a run,
//                                     packets a catch, the share of catches spoiled (sectors 1–3), the log and its build
//   tools/review/human.json           the bot's pace (hold, gap, aim, carelessness) that plays closest to them, found by
//                                     a grid search over short campaigns on the log's screen (phone if touch)
// tools/review/pacing.js reads both (falling back to tools/snare-bot.js's HUMAN). Logs from the bubble catch only
// (Snare 15 on; an older log's wire catch plays differently). The fit is to the build the log was played on: a newer
// build's tree changes how fast a person climbs, so judge the fit by catches a run and packets a catch, not sector times.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const logs = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^(phone|desktop)$/.test(a));
// --screen phone|desktop: fit to the logs played on that kind of screen only (each log's header says touch or not); one
// profile a screen, owner-profile.json (phone) and owner-profile-desktop.json, human.json and human-desktop.json
const SCREEN_ARG = process.argv.includes('--screen') ? process.argv[process.argv.indexOf('--screen') + 1] : null;
if (!logs.length) { console.error('usage: calibrate-snare.js <log.txt> [more logs…]'); process.exit(1); }

const profile = { logs: [], runs: [], minute: [], catchesPerRun: 0, packetsPerCatch: 0, spoilShare: 0, touch: false };
let early = [];
for (const file of logs) {
    const text = fs.readFileSync(file, 'utf8');
    const touch = /touch/.test(/^screen: (.*)$/m.exec(text)?.[1] || '');
    if (SCREEN_ARG && (SCREEN_ARG === 'phone') !== touch) continue;
    const build = /^build: (.*)$/m.exec(text)?.[1] || '?';
    profile.touch ||= /touch/.test(/^screen: (.*)$/m.exec(text)?.[1] || '');
    profile.logs.push({ file: path.relative(root, path.resolve(file)), build });
    const ev = text.split('\n').filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const snares = ev.filter(e => e.e === 'snare');
    early = early.concat(snares.filter(e => e.sector <= 3));
    // runs to clear each sector: the runs started on it until one cleared it
    let count = 0;
    for (const e of snares) {
        count++;
        if (e.goalDone || ev.some(x => x.e === 'snareBoss' && x.sector === e.sector && x.t <= e.t + 1 && x.t >= e.t - (e.secs || 60) - 1)) {
            const k = e.sector - 1;
            if (profile.runs[k] === undefined) {
                profile.runs[k] = count;
                const clear = ev.find(x => (x.e === 'snareGoal' || x.e === 'snareBoss') && x.sector === e.sector);
                profile.minute[k] = +((clear?.t ?? e.t) / 60).toFixed(2);
            }
            count = 0;
        }
    }
}
const catches = early.reduce((a, e) => a + (e.catches || 0), 0);
profile.catchesPerRun = +(catches / Math.max(1, early.length)).toFixed(1);
profile.packetsPerCatch = +(early.reduce((a, e) => a + (e.caught || 0), 0) / Math.max(1, catches)).toFixed(1);
profile.spoilShare = +(early.reduce((a, e) => a + (e.corrupted || 0), 0) / Math.max(1, catches)).toFixed(3);
profile.build = profile.logs.map(l => l.build).join(' | ');
const desk = SCREEN_ARG === 'desktop';
if (!profile.logs.length) { console.error(`no ${SCREEN_ARG} logs among them`); process.exit(1); }
fs.writeFileSync(path.join(root, 'design', 'review', desk ? 'owner-profile-desktop.json' : 'owner-profile.json'), JSON.stringify(profile, null, 1) + '\n');
console.log(`owner: runs per sector ${profile.runs.join('/')}, minutes ${profile.minute.join('/')}, ${profile.catchesPerRun} catches a run, ${profile.packetsPerCatch} packets a catch, ${(profile.spoilShare * 100).toFixed(1)}% spoiled (${early.length} early runs)`);

// The fit: short campaigns (9 minutes, two seeds) for each pace, scored by how far their catches a run and packets a
// catch (sectors 1–3) are from the owner's, and their runs to clear sectors 1–3.
const { runCampaigns, SCREENS } = require('./pacing.js');
const bot = require(path.join(root, 'tools', 'snare-bot.js'));
const screen = desk ? 'desktop' : profile.touch ? 'phone' : 'desktop';
(async () => {
// two stages, each one batch across the cores, every campaign stopping once sector 3 is cleared (all the fit looks at):
// hold × gap first (aim and carelessness middling), then aim × carelessness around the best hold and gap
const score = (pace, res) => {
    const runs = res.flatMap(c => c.runs.filter(r => r.sector <= 3));
    const c = runs.reduce((a, r) => a + r.catches, 0);
    const cpr = c / Math.max(1, runs.length), ppc = runs.reduce((a, r) => a + r.caught, 0) / Math.max(1, c);
    const spoil = runs.reduce((a, r) => a + r.spoiled, 0) / Math.max(1, c);
    const clears = [1, 2, 3].map(k => res.map(x => x.sectors.find(s => s.sector === k)?.runs ?? 12).reduce((a, b) => a + b, 0) / res.length);
    const err = ((cpr - profile.catchesPerRun) / profile.catchesPerRun) ** 2 + ((ppc - profile.packetsPerCatch) / profile.packetsPerCatch) ** 2
        + 4 * (spoil - profile.spoilShare) ** 2 + clears.reduce((a, r, i) => a + (profile.runs[i] ? ((r - profile.runs[i]) / Math.max(2, profile.runs[i])) ** 2 : 0), 0) / 3;
    return { err, pace, cpr, ppc, spoil, clears };
};
const stage = async paces => {
    const jobs = paces.flatMap(pace => [1, 2].map(seed => ({ seed, screen, minutes: 9, pace, runCap: 120, steps: 60, untilSector: 3, untilTree: false })));
    const results = await runCampaigns(jobs);
    return paces.map((pace, i) => score(pace, [results[i * 2], results[i * 2 + 1]])).sort((a, b) => a.err - b.err)[0];
};
const first = await stage([1.4, 1.8, 2.2, 2.6].flatMap(hold => [0.2, 0.35, 0.55].map(gap => ({ ...bot.HUMAN, hold, gap, aim: 0.25, careless: 0.1 }))));
const best = await stage([0.1, 0.25, 0.45].flatMap(aim => [0.1, 0.25].map(careless => ({ ...first.pace, aim, careless }))));
const out = { from: profile.logs.map(l => l.file), react: best.pace.react, slashEvery: best.pace.slashEvery, hold: best.pace.hold, gap: best.pace.gap, aim: best.pace.aim, careless: best.pace.careless };
fs.writeFileSync(path.join(__dirname, desk ? 'human-desktop.json' : 'human.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`bot: hold ${out.hold} s, gap ${out.gap} s, aim ${out.aim}, careless ${out.careless} → ${best.cpr.toFixed(1)} catches a run, ${best.ppc.toFixed(1)} packets a catch, ${(best.spoil * 100).toFixed(1)}% spoiled, runs to clear 1–3 ${best.clears.map(x => x.toFixed(1)).join('/')} (fit error ${best.err.toFixed(3)})`);
})();
