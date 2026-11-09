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
const TARGETS = JSON.parse(fs.readFileSync(path.join(root, 'design', 'review', 'targets.json'), 'utf8'));
const runsTarget = k => TARGETS.runsPerSector[k] || (E.isSnareBossSector(k - 1) ? TARGETS.runsPerSector.boss : TARGETS.runsPerSector.later);
const OVERHEAD = 12;
// Bots are worse than people at the boss's loops (the owner beat the first boss on the first try, this bot does 0–4 damage a
// run), so after BOSS_TRIES failed runs the boss counts as beaten (`assisted` in the report): judge the boss by hand.
const BOSS_TRIES = Number(arg('boss-tries', 2));   // s of cards, tree and reading after each run (the owner's log: 590 s of wall time for 362 s of runs)

// The field in px each screen gives the bay (measured in Chromium: 390 × 727 upright phone, 1280 × 800 desktop).
const SCREENS = { phone: { cw: 374, ch: 430, close: 36 }, desktop: { cw: 1248, ch: 528, close: 26 } };
const PPU = 20, FLICK = 48;

// The owner's numbers (tools/review/calibrate-snare.js writes design/review/owner-profile.json from their logs; the
// phone log of 2026-11-09, build 15.5, until then) and the bot's pace fitted to them (tools/review/human.json).
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const OWNER = readJson(path.join(root, 'design', 'review', 'owner-profile.json'))
    || { build: '15.5', runs: [1, 6, 6, 3, 1, 1], minute: [0.15, 2.65, 5.7, 7.5, 8.6, 9.6], catchesPerRun: 6.3, packetsPerCatch: 7.1, spoilShare: 2 / 113 };
const PACE = { ...HUMAN, ...(readJson(path.join(__dirname, 'human.json')) || {}) };
delete PACE.from;

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

function campaign(seed, scr, { pace = PACE, minutes = MINUTES } = {}) {
    let rs = seed * 9301 + 49297;
    const rand = () => (rs = (rs * 233280 + 49297) % 2147483647) / 2147483647;
    const s = E.defaultState(1);
    s.unlocked['module:snare'] = true;
    const sectors = [], runs = [], scenarios = {};
    let clock = 0, sectorRuns = 0, bossFails = 0, treeDone = null;
    while (clock < minutes * 60) {
        const k = s.snare.sector;
        if (!scenarios[k + 1]) scenarios[k + 1] = { levels: Object.fromEntries(E.SNARE_TREE.filter(u => E.level(s, u.id)).map(u => [u.id, E.level(s, u.id)])), signal: Math.round(s.snare.signal), runs: s.snare.runs, minute: +(clock / 60).toFixed(1) };
        const o = E.snareOpts(s, k);
        const run = P.createSnare({ ...o, ...field(o, scr), seed: Math.floor(rand() * 1e9) });
        const bot = createBot(run, { ...pace, rand });
        let haul = 0, cleared = false, t = 0, mine = 0, helped = 0;
        while (!run.over && t < 300) {
            t += 1 / 60;
            bot.step(1 / 60);
            run.step(1 / 60);
            for (const e of run.takeEvents()) {
                if (e.type === 'catch' || e.type === 'laser' || e.type === 'quarantine' || e.type === 'taken') {
                    const pay = E.snareCatch(s, e.units, k);
                    haul += pay;
                    // the player's bubbles (and what they set off: chains, echoes, splits) against what helpers took
                    if (e.type === 'catch' || e.type === 'quarantine') mine += pay; else helped += pay;
                }
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
        runs.push({ sector: k + 1, secs: +t.toFixed(1), haul, mine, helped, bubbles: st.bubbles || 0, bossHp: o.boss || 0, catches: st.catches, caught: st.caught, spoiled: st.corrupted, popped: st.snaps, cleaned: st.cleaned, bounced: st.bounced || 0,
            reds: run.packets.filter(p => p.kind === 'corrupt').length, packets: run.packets.length, boss: o.boss || 0, bossDamage: st.bossDamage, cleared });
        if (cleared) { sectors.push({ sector: k + 1, runs: sectorRuns, minute: +(clock / 60).toFixed(2), signalPerRun: Math.round(haul), assisted }); sectorRuns = 0; }
        // buy (the tree's reveals first)
        E.evaluate(s);
        let bought = 0;
        for (let n = 0; n < 40; n++) {
            const c = E.SNARE_TREE.filter(u => E.isUpgradeVisible(s, u) && !E.isMaxed(s, u) && E.canAfford(s, E.upgradeCost(u, E.level(s, u.id))))
                .sort((a, b) => rank(a.id) - rank(b.id) || E.upgradeCost(a, E.level(s, a.id)).signal - E.upgradeCost(b, E.level(s, b.id)).signal)[0];
            if (!c || !E.buy(s, c.id).ok) break;
            bought++;
            E.evaluate(s);
        }
        runs[runs.length - 1].bought = bought;
        if (!treeDone && E.SNARE_TREE.every(u => u.endless || E.isMaxed(s, u))) treeDone = +(clock / 60).toFixed(1);
    }
    return { sectors, runs, treeDone, scenarios, nodes: E.SNARE_TREE.filter(u => E.level(s, u.id)).length };
}

function main() {
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
say(`nodes owned at the end: ${all.map(c => c.nodes).join('/')}; runs played: ${all.map(c => c.runs.length).join('/')}`);
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
if (require.main === module) main();
module.exports = { field, campaign, SCREENS, OWNER };
