// tools/review/pacing.js — Packet Snare's pacing in a minute, no browser: a campaign played at a person's pace from a new
// save, buying as a person does, reported against the owner's own log.
//   node tools/review/pacing.js [--screen phone|desktop] [--seeds 1,2,3] [--minutes 20] [--json out.json] [--scenarios out.json]
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
const OVERHEAD = 12;
// Bots are worse than people at the boss's loops (the owner beat the first boss on the first try, this bot does 0–4 damage a
// run), so after BOSS_TRIES failed runs the boss counts as beaten (`assisted` in the report): judge the boss by hand.
const BOSS_TRIES = Number(arg('boss-tries', 2));   // s of cards, tree and reading after each run (the owner's log: 590 s of wall time for 362 s of runs)

// The field in px each screen gives the bay (measured in Chromium: 390 × 727 upright phone, 1280 × 800 desktop).
const SCREENS = { phone: { cw: 374, ch: 430, close: 36 }, desktop: { cw: 1248, ch: 528, close: 26 } };
const PPU = 20, FLICK = 48;

// The owner's phone log (2026-11-09, build 15.5): runs to clear each sector and the play minute it fell.
const OWNER = { build: '15.5', runs: [1, 6, 6, 3, 1, 1], minute: [0.15, 2.65, 5.7, 7.5, 8.6, 9.6], catchesPerRun: 6.3, packetsPerCatch: 7.1, spoilShare: 2 / 113 };

// Buys like the owner did (Attention Span and the field first, then the red-packet helpers, more packets, gold, the
// abilities), the first affordable in this order, else the cheapest.
const ORDER = ['snareFocus', 'snareSprawl', 'snareCleanerBot', 'snarePacketStream', 'snareScrubbers', 'snareGold', 'snareChecksumTowers', 'snareContain',
    'snareBandwidth', 'snareBouncerBot', 'snareSchools', 'snareChain', 'snareEscortBot', 'snareKernelPanic', 'snareLongWire', 'snareOverflow', 'snareSteady',
    'snareFirehose', 'snareMotherLode', 'snareParry', 'snareRiposte', 'snareJammer', 'snareChainStorm', 'snareBroadband'];
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
    out.packetR = B.packetR * Math.max(0.55, Math.min(1, Math.sqrt(0.3 / dens)));
    return out;
}

function campaign(seed, scr) {
    let rs = seed * 9301 + 49297;
    const rand = () => (rs = (rs * 233280 + 49297) % 2147483647) / 2147483647;
    const s = E.defaultState(1);
    s.unlocked['module:snare'] = true;
    const sectors = [], runs = [], scenarios = {};
    let clock = 0, sectorRuns = 0, bossFails = 0;
    while (clock < MINUTES * 60) {
        const k = s.snare.sector;
        if (!scenarios[k + 1]) scenarios[k + 1] = { levels: Object.fromEntries(E.SNARE_TREE.filter(u => E.level(s, u.id)).map(u => [u.id, E.level(s, u.id)])), signal: Math.round(s.snare.signal), runs: s.snare.runs, minute: +(clock / 60).toFixed(1) };
        const o = E.snareOpts(s, k);
        const run = P.createSnare({ ...o, ...field(o, scr), seed: Math.floor(rand() * 1e9) });
        const bot = createBot(run, { ...HUMAN, rand });
        let haul = 0, cleared = false, t = 0;
        while (!run.over && t < 300) {
            t += 1 / 60;
            bot.step(1 / 60);
            run.step(1 / 60);
            for (const e of run.takeEvents()) {
                if (e.type === 'catch' || e.type === 'laser' || e.type === 'quarantine' || e.type === 'taken') haul += E.snareCatch(s, e.units, k);
                // a cleared sector: the run gathers on there (a person rarely pressed Go deeper in the log)
                if ((e.type === 'goal' || e.type === 'bossDown') && !cleared) {
                    cleared = true;
                    haul += e.type === 'bossDown' ? E.snareBossDown(s, k) : E.snareGoalMet(s, k);
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
        runs.push({ sector: k + 1, secs: +t.toFixed(1), haul, catches: st.catches, caught: st.caught, spoiled: st.corrupted, popped: st.snaps, cleaned: st.cleaned, bounced: st.bounced || 0,
            reds: run.packets.filter(p => p.kind === 'corrupt').length, packets: run.packets.length, boss: o.boss || 0, bossDamage: st.bossDamage, cleared });
        if (cleared) { sectors.push({ sector: k + 1, runs: sectorRuns, minute: +(clock / 60).toFixed(2), signalPerRun: Math.round(haul), assisted }); sectorRuns = 0; }
        // buy (the tree's reveals first)
        E.evaluate(s);
        for (let n = 0; n < 40; n++) {
            const c = E.SNARE_TREE.filter(u => E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && E.canAfford(s, E.upgradeCost(u, E.level(s, u.id))))
                .sort((a, b) => rank(a.id) - rank(b.id) || E.upgradeCost(a, E.level(s, a.id)).signal - E.upgradeCost(b, E.level(s, b.id)).signal)[0];
            if (!c || !E.buy(s, c.id).ok) break;
            E.evaluate(s);
        }
    }
    return { sectors, runs, scenarios, nodes: E.SNARE_TREE.filter(u => E.level(s, u.id)).length };
}

const scr = SCREENS[SCREEN];
const all = SEEDS.map(seed => campaign(seed, scr));
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : NaN; };
const lines = [];
const say = x => lines.push(x);
say(`# Packet Snare pacing · ${E.BUILD.split('·')[0].trim()} · ${SCREEN} · seeds ${SEEDS.join(',')} · ${MINUTES} min`);
// how the human bot plays its first runs against the owner's (the calibration check)
const early = all.flatMap(c => c.runs.filter(r => r.sector <= 3));
const cpr = early.reduce((a, r) => a + r.catches, 0) / early.length, ppc = early.reduce((a, r) => a + r.caught, 0) / Math.max(1, early.reduce((a, r) => a + r.catches, 0));
const spoil = early.reduce((a, r) => a + r.spoiled, 0) / Math.max(1, early.reduce((a, r) => a + r.catches, 0));
say(`calibration (sectors 1–3, bot vs the owner's log): catches/run ${cpr.toFixed(1)} vs ${OWNER.catchesPerRun} · packets/catch ${ppc.toFixed(1)} vs ${OWNER.packetsPerCatch} · spoiled ${(spoil * 100).toFixed(1)}% vs ${(OWNER.spoilShare * 100).toFixed(1)}%`);
say('');
say('| sector | goal | runs to clear (median, seeds) | owner 15.5 | cleared at min | owner min | Signal on the clearing run | red on field at run end | spoiled/run | helpers cleaned/run |');
say('|---|---|---|---|---|---|---|---|---|---|');
const maxSector = Math.max(...all.map(c => c.sectors.length)) + 1;
for (let k = 1; k <= maxSector; k++) {
    const per = all.map(c => c.sectors.find(x => x.sector === k));
    const done = per.filter(Boolean);
    const rr = all.flatMap(c => c.runs.filter(r => r.sector === k));
    const goal = E.isSnareBossSector(k - 1) ? `boss ${E.snareBossHealth(k - 1)}` : E.snareGoal(k - 1).toLocaleString('en-US');
    say(`| ${k} | ${goal}${done.some(x => x.assisted) ? ' (assisted)' : ''} | ${done.length ? med(done.map(x => x.runs)) : '—'} (${per.map(x => (x ? x.runs : '✗')).join('/')}) | ${OWNER.runs[k - 1] ?? ''} | ${done.length ? med(done.map(x => x.minute)) : '—'} | ${OWNER.minute[k - 1] ?? ''} | ${done.length ? med(done.map(x => x.signalPerRun)).toLocaleString('en-US') : '—'} | ${rr.length ? med(rr.map(r => r.reds)) : ''} | ${rr.length ? (rr.reduce((a, r) => a + r.spoiled, 0) / rr.length).toFixed(2) : ''} | ${rr.length ? (rr.reduce((a, r) => a + r.cleaned, 0) / rr.length).toFixed(1) : ''} |`);
}
say('');
say(`nodes owned at the end: ${all.map(c => c.nodes).join('/')}; runs played: ${all.map(c => c.runs.length).join('/')}`);
console.log(lines.join('\n'));
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ build: E.BUILD, screen: SCREEN, seeds: SEEDS, campaigns: all.map(c => ({ sectors: c.sectors, runs: c.runs })) }, null, 1));
if (arg('scenarios')) fs.writeFileSync(arg('scenarios'), JSON.stringify(all[0].scenarios, null, 1));
module.exports = { field, campaign };
