// tools/snare-boss.js — Packet Snare's boss wall, measured: the tools' bot (tools/snare-bot.js: it parries the boss's
// charge after a 0.3 s reaction, slashes it while it reels, grabs its mines with a bubble and throws them, and otherwise
// holds bubbles on clean clusters), played on
// each sector with a few tree builds, three seeds each. Prints health taken / health and ✓ when all three seeds beat it
// (~ when some did). It never uses walls, powers or the other exploits, so it's a floor.
//   node tools/snare-boss.js            (the default builds)
//   SECTORS=1-8 CAP=320 node tools/snare-boss.js   (sectors 1–8 on a phone-sized field)
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '..', 'packet-snare.js'));
const E = require(path.join(__dirname, '..', 'engine.js'));
const { createBot } = require(path.join(__dirname, 'snare-bot.js'));

const CAP = Number(process.env.CAP || 1600);   // units²: a desktop's canvas at 20 px a unit (a phone's is about 320)

function play(sector, levels = {}, seed = 7) {
    const st = E.defaultState(1);
    st.snare.sector = sector;
    st.snare.runs = 30;   // a player on a boss sector has played a while: every hazard due is in
    Object.assign(st.levels, levels);
    const o = E.snareOpts(st, sector);
    // The field as a 1280 × 800 screen shows it (game.js snareField: at least 20 px a unit; a capped field is denser).
    const area = Math.min(o.area, CAP), w = Math.sqrt(area * 2.2), h = area / w;
    const scale = Math.min(1280 / w, 700 / h);
    const density = o.area > area ? Math.min(P.SNARE.densityCap, o.density * o.area / area) : o.density;
    const s = P.createSnare({ ...o, w, h, density, maxGood: Math.max(o.maxGood, Math.round(density * area)), flickLength: 64 / scale, closeRadius: 36 / scale / Math.sqrt(area), seed });
    const bot = createBot(s);
    let t = 0, signal = 0;
    while (!s.over && t < 600) {
        const dt = 1 / 60;
        t += dt;
        bot.step(dt);
        s.step(dt);
        for (const e of s.takeEvents()) if (e.units) signal += e.units * E.snareSectorPay(sector);
    }
    return { need: o.boss, hits: s.stats.bossDamage, done: s.bossDone, signal: Math.round(signal), parries: s.stats.parries, secs: Math.round(s.time) };
}

const FOCUS = { snareSeed: 1, snareFocus: 9, snarePacketStream: 2, snareBandwidth: 2, snareLongWire: 1, snareSteady: 2 };
const BUILDS = [
    ['a first run', {}],
    ['Attention Span 3', { snareSeed: 1, snareFocus: 3 }],
    ['the Focus branch', FOCUS],
    ['Focus + Ghost Protocol', { ...FOCUS, snareFirewalls: 1, snareDecoys: 1, snareHijack: 1, snareGhost: 3 }],
    ['Focus + a datacentre', { ...FOCUS, snareSprawl: 9 }],
    ['Focus + Root Access 3', { ...FOCUS, snareGc: 1, snareParry: 3 }],
    ['Focus + Root Access 3, Kernel Panic', { ...FOCUS, snareGc: 1, snareParry: 3, snareKernelPanic: 2 }],
    ['… + Riposte (the parry)', { ...FOCUS, snareGc: 1, snareParry: 3, snareKernelPanic: 2, snareRiposte: 1 }],
    ['… + Blue Screen', { ...FOCUS, snareGc: 1, snareParry: 3, snareKernelPanic: 2, snareRiposte: 1, snareLaser: 1, snareBlueScreen: 1 }]
];
// Only boss sectors (every fifth): the others are cleared by a goal of packets.
const [lo, hi] = (process.env.SECTORS || '1-25').split('-').map(Number);
for (const [name, lv] of BUILDS) {
    const cells = [];
    for (let k = lo - 1; k <= hi - 1; k++) {
        if (!E.isSnareBossSector(k)) continue;
        const r = [1, 2, 3].map(seed => play(k, lv, seed));
        cells.push(`s${k + 1}(${r[0].need}):${r.map(x => x.hits).join('/')}${r.every(x => x.done) ? '✓' : r.some(x => x.done) ? '~' : ''}`);
    }
    console.log(name.padEnd(30), cells.join('  '));
}
