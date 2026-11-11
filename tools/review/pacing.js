// tools/review/pacing.js — Packet Snare's pacing in a minute, no browser: a campaign played at a person's pace from a new
// save, buying as a person does, reported against the owner's own log.
//   node tools/review/pacing.js [--screen phone|desktop] [--seeds 1,2,3] [--minutes 20] [--json out.json] [--scenarios out.json]
//     [--until-sector n] [--until-tree] [--run-cap 120] [--step 60] [--no-cache] [--workers n]
// Fast by default (the owner's call): each seed is its own process, as many at once as the machine has cores; results are
// cached in review-out/.cache by the contents of the files a campaign depends on (the engine, the rules, the bot, this
// file) and its settings, so a report after a change that didn't touch them reuses them; a campaign can stop once it's
// answered (--until-sector n: once sector n is cleared; --until-tree: once the tree is bought out); a run still going after
// --run-cap s of play is ended there (late runs on full fields ran to 300 s and were most of the time; the report counts
// them); --step sets the simulation's steps a second (packet-snare.js `simStep`, tools only; the game runs 60).
// The player is tools/snare-bot.js's HUMAN profile (calibrated against the owner's phone log of 2026-11-09, see OWNER
// below: the check at the top of the report says how close it plays); the field is the size the game gives that screen
// (game.js `snareField`: capped at SNARE_PPU px a unit, the packets a bigger field would hold packed in); each run is
// followed by OVERHEAD seconds of cards and tree, as in the log. `--scenarios` writes the build the campaign had when it
// reached each sector, for tools/review/kit.js `scenario()` (a realistic tree for the reviewers, not a maxed one).
'use strict';
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const P = require(path.join(root, 'packet-snare.js'));
const E = require(path.join(root, 'engine.js'));
const { createBot, HUMAN } = require(path.join(root, 'tools', 'snare-bot.js'));

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SCREEN = arg('screen', 'phone');
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const MINUTES = Number(arg('minutes', 20));
const TARGETS = JSON.parse(fs.readFileSync(path.join(root, 'design', 'review', 'targets.json'), 'utf8'));
const runsTarget = k => TARGETS.runsPerSector[k] || (E.isSnareBossSector(k - 1) ? TARGETS.runsPerSector.boss : TARGETS.runsPerSector.later);
const OVERHEAD = 12;
const RUN_CAP = Number(arg('run-cap', 120));
const STEPS = Number(arg('step', 60));
const UNTIL_SECTOR = Number(arg('until-sector', 0));
const UNTIL_TREE = process.argv.includes('--until-tree');
// Bots are worse than people at the boss's loops (the owner beat the first boss on the first try, this bot does 0–4 damage a
// run), so after BOSS_TRIES failed runs the boss counts as beaten (`assisted` in the report): judge the boss by hand.
const BOSS_TRIES = Number(arg('boss-tries', 2));   // s of cards, tree and reading after each run (the owner's log: 590 s of wall time for 362 s of runs)

// The field in px each screen gives the bay (measured in Chromium: 390 × 727 upright phone, 1280 × 800 desktop).
const SCREENS = { phone: { cw: 374, ch: 430, close: 36 }, desktop: { cw: 1248, ch: 528, close: 26 } };
const PPU = 20, FLICK = 48;

// The owner's numbers (tools/review/calibrate-snare.js writes design/review/owner-profile.json from their logs; the
// phone log of 2026-11-09, build 15.5, until then) and the bot's pace fitted to them (tools/review/human.json).
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// a desktop campaign uses the desktop fit when there is one
const DESK = SCREEN === 'desktop';
const OWNER = (DESK && readJson(path.join(root, 'design', 'review', 'owner-profile-desktop.json'))) || readJson(path.join(root, 'design', 'review', 'owner-profile.json'))
    || { build: '15.5', runs: [1, 6, 6, 3, 1, 1], minute: [0.15, 2.65, 5.7, 7.5, 8.6, 9.6], catchesPerRun: 6.3, packetsPerCatch: 7.1, spoilShare: 2 / 113 };
const PACE = { ...HUMAN, ...((DESK && readJson(path.join(__dirname, 'human-desktop.json'))) || readJson(path.join(__dirname, 'human.json')) || {}) };
delete PACE.from;

// Buys like a person does: the cheapest affordable node on this list (the seed, the four roots coming back to over time,
// the Decoder Bot, gold, the abilities; a tie goes to the earlier one), else the cheapest off it. The first affordable in
// list order sank everything into Attention Span's nine levels before the first Sanitizer.
const ORDER = ['snareSeed', 'snareFocus', 'snareSprawl', 'snareSanitizer', 'snarePacketStream', 'snareCleanerBot', 'snareGold', 'snareContain',
    'snareBandwidth', 'snareSchools', 'snareChain', 'snareKernelPanic', 'snareLongWire', 'snareSteady', 'snareGoldPlate', 'snareParry',
    'snareRiposte', 'snareChainStorm', 'snareTowers'];
const rank = id => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };

function field(o, scr) {
    const B = P.SNARE;
    const aspect = Math.min(3.5, Math.max(0.5, scr.cw / scr.ch));
    const cap = Math.max(P.FIELD_AREA, scr.cw * scr.ch / PPU ** 2);
    const a = Math.min(o.area, cap), w = Math.sqrt(a * aspect), h = a / w, scale = Math.min(scr.cw / w, scr.ch / h);
    const out = { w, h, flickLength: FLICK / scale, closeRadius: scr.close * ((o.closeRadius ?? B.closeRadius) / B.closeRadius) / scale / Math.sqrt(a) };
    const want = o.density * o.area / a, dcap = Math.min(B.densityCap, B.maxOnScreen / a), dens = Math.min(dcap, want);
    if (o.area > a || want > dcap) { out.density = dens; out.maxGood = Math.max(o.maxGood, Math.round(dens * a)); }
    if (want > dcap) out.respawn = (o.respawn ?? B.respawn) / Math.min(4, want / dcap);
    if (want / dcap > 4 && B.overflowGold) out.goldChance = (o.goldChance ?? B.goldChance) + B.overflowGold * Math.log2(want / dcap / 4);   // past the cap: gold (18.7's log)
    out.packetR = B.packetR * Math.max(0.55, Math.min(1, Math.sqrt(0.3 / dens)));
    return out;
}

function campaign(seed, scr, { pace = PACE, minutes = MINUTES, runCap = RUN_CAP, steps = STEPS, untilSector = UNTIL_SECTOR, untilTree = UNTIL_TREE } = {}) {
    if (typeof scr === 'string') scr = SCREENS[scr];
    const dt = 1 / steps;
    let rs = seed * 9301 + 49297;
    const rand = () => (rs = (rs * 233280 + 49297) % 2147483647) / 2147483647;
    const s = E.defaultState(1);
    s.unlocked['module:snare'] = true;
    const sectors = [], runs = [], scenarios = {};
    let clock = 0, sectorRuns = 0, bossFails = 0, treeDone = null;
    while (clock < minutes * 60) {
        const k = s.snare.sector;
        if (!scenarios[k + 1]) scenarios[k + 1] = { levels: Object.fromEntries(E.SNARE_TREE.filter(u => E.level(s, u.id)).map(u => [u.id, E.level(s, u.id)])), signal: Math.round(s.snare.signal), runs: s.snare.runs, minute: +(clock / 60).toFixed(1) };
        const o = scr.close === SCREENS.desktop.close ? E.snareDesktop(E.snareOpts(s, k)) : E.snareOpts(s, k);   // a mouse's harder field, as the game
        if (o.boss) s.intro["snare:intro:boss"] = true;   // a boss sector: the boss is met (its nodes come into the tree, Snare 18.3)
        const run = P.createSnare({ ...o, ...field(o, scr), seed: Math.floor(rand() * 1e9), simStep: dt });
        const bot = createBot(run, { ...pace, rand });
        let haul = 0, cleared = false, t = 0, mine = 0, helped = 0, meltPool = 0;
        while (!run.over && t < runCap) {
            t += dt;
            bot.step(dt);
            run.step(dt);
            for (const e of run.takeEvents()) {
                // Snare 18.4: Chain Lightning's hops are paid as they land (`chainHop`), the player's own
                if (e.type === 'catch' || e.type === 'laser' || e.type === 'quarantine' || e.type === 'taken' || e.type === 'chainHop') {
                    const pay = E.snareCatch(s, e.units, k);
                    haul += pay;
                    // the player's bubbles (and what they set off: chains, echoes, splits) against what helpers took
                    if (e.type === 'catch' || e.type === 'quarantine' || e.type === 'chainHop') mine += pay; else helped += pay;
                }
                // Snare 18.3: a melting boss's hits pay a set amount (the game pays them the same way)
                if (e.type === 'meltHit') { const pay = E.snareMeltPay(s, meltPool, e.from, e.to, e.of); haul += pay; mine += pay; }
                // a cleared sector: the run gathers on there (a person rarely pressed Go deeper in the log)
                if ((e.type === 'goal' || e.type === 'bossDown') && !cleared) {
                    cleared = true;
                    haul += e.type === 'bossDown' ? E.snareBossDown(s, k) : E.snareGoalMet(s, k);
                    meltPool = haul;   // the meltdown doubles what the run had earned (18.7's log, the owner's call)
                }
            }
        }
        let assisted = false;
        if (o.boss && !cleared && ++bossFails >= BOSS_TRIES) { haul += E.snareBossDown(s, k); cleared = assisted = true; }
        if (cleared) bossFails = 0;
        E.finishSnare(s, haul, run.layoutOf(), run.stats);
        clock += t + OVERHEAD;
        sectorRuns++;
        const st = run.stats;
        runs.push({ sector: k + 1, secs: +t.toFixed(1), capped: !run.over, haul, mine, helped, bubbles: st.bubbles || 0, bossHp: o.boss || 0, catches: st.catches, caught: st.caught, spoiled: st.corrupted, popped: st.snaps, cleaned: st.cleaned, bounced: st.bounced || 0,
            reds: run.packets.filter(p => p.kind === 'corrupt').length, packets: run.packets.length, boss: o.boss || 0, bossDamage: st.bossDamage, cleared });
        if (cleared) { sectors.push({ sector: k + 1, runs: sectorRuns, minute: +(clock / 60).toFixed(2), signalPerRun: Math.round(haul), assisted }); sectorRuns = 0; }
        // buy (the tree's reveals first)
        E.evaluate(s);
        let bought = 0;
        for (let n = 0; n < 40; n++) {
            const c = E.SNARE_TREE.filter(u => E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && E.canAfford(s, E.upgradeCost(u, E.level(s, u.id))))
                .sort((a, b) => (rank(a.id) === 99) - (rank(b.id) === 99) || E.upgradeCost(a, E.level(s, a.id)).signal - E.upgradeCost(b, E.level(s, b.id)).signal || rank(a.id) - rank(b.id))[0];
            if (!c || !E.buy(s, c.id).ok) break;
            bought++;
            E.evaluate(s);
        }
        runs[runs.length - 1].bought = bought;
        if (!treeDone && E.SNARE_TREE.every(u => u.endless || E.isMaxed(s, u))) treeDone = +(clock / 60).toFixed(1);
        if ((untilSector && s.snare.sector >= untilSector) || (untilTree && treeDone)) break;
    }
    return { sectors, runs, treeDone, scenarios, nodes: E.SNARE_TREE.filter(u => E.level(s, u.id)).length };
}

// Campaigns in parallel, cached. A job: { seed, screen, minutes, pace, runCap, steps, untilSector, untilTree, engineDir }.
const crypto = require('crypto');
const os = require('os');
const CACHE = path.join(root, 'review-out', '.cache');
function cacheKey(job) {
    const dir = job.engineDir || root;
    const h = crypto.createHash('sha1');
    for (const f of ['engine.js', 'packet-snare.js', path.join('tools', 'snare-bot.js'), path.join('tools', 'review', 'pacing.js')]) h.update(fs.readFileSync(path.join(dir, f)));
    h.update(JSON.stringify(job));
    return h.digest('hex').slice(0, 20);
}
function runCampaigns(jobs, { cache = !process.argv.includes('--no-cache'), workers = Number(arg('workers', os.cpus().length)) } = {}) {
    const { spawn } = require('child_process');
    const out = new Array(jobs.length);
    let next = 0;
    const one = i => new Promise(res => {
        const job = jobs[i], key = cacheKey(job), file = path.join(CACHE, key + '.json');
        if (cache && fs.existsSync(file)) { out[i] = JSON.parse(fs.readFileSync(file, 'utf8')); return res(); }
        const p = spawn(process.execPath, [path.join(job.engineDir || root, 'tools', 'review', 'pacing.js'), '--worker', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        p.stdout.on('data', d => { buf += d; });
        p.on('close', () => {
            out[i] = JSON.parse(buf);
            if (cache) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, buf); }
            res();
        });
    });
    const lane = async () => { while (next < jobs.length) await one(next++); };
    return Promise.all(Array.from({ length: Math.max(1, Math.min(workers, jobs.length)) }, lane)).then(() => out);
}
// a worker: one campaign, its result as JSON on stdout
if (process.argv.includes('--worker')) {
    const job = JSON.parse(arg('worker'));
    process.stdout.write(JSON.stringify(campaign(job.seed, job.screen, job)));
}
const jobOf = seed => ({ seed, screen: SCREEN, minutes: MINUTES, pace: PACE, runCap: RUN_CAP, steps: STEPS, untilSector: UNTIL_SECTOR, untilTree: UNTIL_TREE });

async function main() {
const all = await runCampaigns(SEEDS.map(jobOf));
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : NaN; };
const lines = [];
const say = x => lines.push(x);
say(`# Packet Snare pacing · ${E.BUILD.split('·')[0].trim()} · ${SCREEN} · seeds ${SEEDS.join(',')} · ${MINUTES} min`);
// how the human bot plays its first runs against the owner's (the calibration check)
const early = all.flatMap(c => c.runs.filter(r => r.sector <= 3));
const cpr = early.reduce((a, r) => a + r.catches, 0) / early.length, ppc = early.reduce((a, r) => a + r.caught, 0) / Math.max(1, early.reduce((a, r) => a + r.catches, 0));
const spoil = early.reduce((a, r) => a + r.spoiled, 0) / Math.max(1, early.reduce((a, r) => a + r.catches, 0));
say(`calibration (sectors 1–3, bot vs the owner's log${OWNER.build ? ` (${String(OWNER.build).split('·')[0].trim()})` : ''}): catches/run ${cpr.toFixed(1)} vs ${OWNER.catchesPerRun} · packets/catch ${ppc.toFixed(1)} vs ${OWNER.packetsPerCatch} · spoiled ${(spoil * 100).toFixed(1)}% vs ${(OWNER.spoilShare * 100).toFixed(1)}%`);
say('');
say('| sector | goal | runs to clear (median, seeds) | target | owner 15.5 | cleared at min | owner min | Signal on the clearing run | yours / helpers\' | red at run end | spoiled/run | boss damage/run |');
say('|---|---|---|---|---|---|---|---|---|---|---|---|');
const maxSector = Math.max(...all.map(c => c.sectors.length)) + 1;
const checks = [];
for (let k = 1; k <= maxSector; k++) {
    const per = all.map(c => c.sectors.find(x => x.sector === k));
    const done = per.filter(Boolean);
    const rr = all.flatMap(c => c.runs.filter(r => r.sector === k));
    const goal = E.isSnareBossSector(k - 1) ? `boss ${E.snareBossHealth(k - 1)}` : E.snareGoal(k - 1).toLocaleString('en-US');
    const [lo, hi] = runsTarget(k), m = done.length ? med(done.map(x => x.runs)) : NaN;
    const ok = done.length === per.length && m >= lo && m <= hi;
    if (done.length) checks.push({ k, ok });
    const share = rr.reduce((a, r) => a + r.mine, 0) / Math.max(1, rr.reduce((a, r) => a + r.mine + r.helped, 0));
    const bossDmg = E.isSnareBossSector(k - 1) && rr.length ? `${(rr.reduce((a, r) => a + r.bossDamage, 0) / rr.length).toFixed(1)} of ${E.snareBossHealth(k - 1)}` : '';
    say(`| ${k} | ${goal}${done.some(x => x.assisted) ? ' (assisted)' : ''} | ${done.length ? m : '—'} (${per.map(x => (x ? x.runs : '✗')).join('/')}) | ${lo}–${hi} ${done.length ? (ok ? '✓' : '✗') : ''} | ${OWNER.runs[k - 1] ?? ''} | ${done.length ? med(done.map(x => x.minute)) : '—'} | ${OWNER.minute[k - 1] ?? ''} | ${done.length ? med(done.map(x => x.signalPerRun)).toLocaleString('en-US') : '—'} | ${rr.length ? `${Math.round(share * 100)}% / ${Math.round((1 - share) * 100)}%` : ''} | ${rr.length ? med(rr.map(r => r.reds)) : ''} | ${rr.length ? (rr.reduce((a, r) => a + r.spoiled, 0) / rr.length).toFixed(2) : ''} | ${bossDmg} |`);
}
say('');
const capped = all.flatMap(c => c.runs).filter(r => r.capped).length;
say(`nodes owned at the end: ${all.map(c => c.nodes).join('/')}; runs played: ${all.map(c => c.runs.length).join('/')}${capped ? `; ${capped} run${capped === 1 ? '' : 's'} still going at the ${RUN_CAP} s cap (ended there)` : ''}`);
// the rest of the targets (design/review/targets.json, ${TARGETS.status})
const s5 = all.map(c => c.sectors.find(x => x.sector === 5)?.minute).filter(x => x !== undefined);
const t5 = TARGETS.minutesToSector5, m5 = med(s5);
const trees = all.map(c => c.treeDone);
const allRuns = all.flatMap(c => c.runs);
const bps = allRuns.reduce((a, r) => a + r.bubbles, 0) / allRuns.reduce((a, r) => a + r.secs, 0);
const before10 = allRuns.filter(r => r.sector < 10), hshare = before10.reduce((a, r) => a + r.helped, 0) / Math.max(1, before10.reduce((a, r) => a + r.helped + r.mine, 0));
const idle = allRuns.filter(r => !r.bought).length / allRuns.length;
const line = (name, ok, text) => { checks.push({ name, ok }); say(`- ${ok ? '✓' : '✗'} ${name}: ${text}`); };
say('');
say(`**Targets** (${TARGETS.status}; design/review/targets.json):`);
line('sector 5 reached', s5.length && m5 >= t5[0] && m5 <= t5[1], `minute ${s5.length ? m5 : '—'} (target ${t5[0]}–${t5[1]})`);
line('tree not finished too soon', trees.every(x => x === null || x >= TARGETS.treeDoneMinuteAtLeast), `finished at ${trees.map(x => x ?? 'not yet').join('/')} min (target ≥ ${TARGETS.treeDoneMinuteAtLeast} or not in ${MINUTES})`);
line('the player catches most of it', hshare <= TARGETS.helperShareOfHaulAtMost.before10, `helpers took ${Math.round(hshare * 100)}% of the haul before sector 10 (target ≤ ${Math.round(TARGETS.helperShareOfHaulAtMost.before10 * 100)}%)`);
line('the player keeps deciding', bps >= TARGETS.bubblesPerSecondAtLeast, `${bps.toFixed(2)} bubbles a second of run (target ≥ ${TARGETS.bubblesPerSecondAtLeast})`);
say(`- runs that bought nothing after them: ${Math.round(idle * 100)}%`);
say(`- sectors on target: ${checks.filter(c => c.k && c.ok).length} of ${checks.filter(c => c.k).length}`);
console.log(lines.join('\n'));
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ build: E.BUILD, screen: SCREEN, seeds: SEEDS, campaigns: all.map(c => ({ sectors: c.sectors, runs: c.runs })) }, null, 1));
if (arg('scenarios')) fs.writeFileSync(arg('scenarios'), JSON.stringify(all[0].scenarios, null, 1));
}
if (require.main === module && !process.argv.includes('--worker')) main();
module.exports = { field, campaign, runCampaigns, jobOf, SCREENS, OWNER, PACE };
