// tools/snare-boss.js — Packet Snare's boss wall, measured: a bot that rings the boss (a loop round all of it, no bigger
// than its loop allows, fed a point a frame, leading it a little) and otherwise loops clean clusters, played on each
// sector with a few tree builds, three seeds each. Prints hits landed / hits needed and ✓ when all three seeds beat it
// (~ when some did). It never parries, slashes or uses walls, so it's a floor: a player with the exploits does better.
//   node tools/snare-boss.js            (the default builds)
//   SECTORS=1-8 CAP=320 node tools/snare-boss.js   (sectors 1–8 on a phone-sized field)
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '..', 'packet-snare.js'));
const E = require(path.join(__dirname, '..', 'engine.js'));

const CAP = Number(process.env.CAP || 1600);   // units²: a desktop's canvas at 20 px a unit (a phone's is about 320)

function play(sector, levels = {}, seed = 7) {
    const st = E.defaultState(1);
    st.snare.sector = sector;
    st.snare.runs = 5;
    Object.assign(st.levels, levels);
    const o = E.snareOpts(st, sector);
    // The field as a 1280 × 800 screen shows it (game.js snareField: at least 20 px a unit, packets worth the difference).
    const area = Math.min(o.area, CAP), w = Math.sqrt(area * 2.2);
    const s = P.createSnare({ ...o, w, h: area / w, worth: o.area / area, seed });
    // A plan is a ring of angles round a centre that can follow a target as it's drawn (a person tracks the boss).
    let plan = [], follow = null, wait = 0, t = 0, signal = 0;
    const ring = (cx, cy, rad, target = null) => {
        const n = Math.max(18, Math.ceil(2 * Math.PI * rad / 0.15));
        follow = target ? { target, dx: cx - target.x, dy: cy - target.y } : null;
        plan = [];
        for (let i = 0; i <= n + 2; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; plan.push([Math.cos(a) * rad, Math.sin(a) * rad, cx, cy]); }
    };
    while (!s.over && t < 600) {
        const dt = 1 / 60;
        t += dt;
        // two points a frame: a loop round the boss in about a third of a second
        for (let k = 0; k < 2 && plan.length; k++) {
            const [ox, oy, cx, cy] = plan.shift();
            const c = follow && s.boss === follow.target ? { x: follow.target.x + follow.dx, y: follow.target.y + follow.dy } : { x: cx, y: cy };
            s.addPoint(c.x + ox, c.y + oy);
            if (!plan.length) s.liftPen();
        }
        if (!plan.length && s.cooldown <= 0 && (wait -= dt) <= 0) {
            const b = s.boss;
            if (b) {
                wait = 0.15;
                ring(b.x, b.y, Math.min(o.bossLoop * 0.95, 1.35) * b.r, b);
            } else if (!s.bossDone) {
                wait = 1.2;
                let best = 0, target = null;
                for (const p of s.packets) {
                    if (p.kind === 'corrupt') continue;
                    const near = s.packets.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 1.7);
                    if (near.some(q => q.kind === 'corrupt')) continue;
                    if (near.length > best) { best = near.length; target = p; }
                }
                if (target) ring(target.x + target.vx * 0.3, target.y + target.vy * 0.3, Math.max(1.3, s.closeR));
            } else break;
        }
        s.step(dt);
        for (const e of s.takeEvents()) if (e.units) signal += e.units * E.snareSectorPay(sector);
    }
    return { need: o.boss, hits: s.stats.bossHits, done: s.bossDone, signal: Math.round(signal) };
}

const FOCUS = { snareFocus: 3, snareBandwidth: 2, snareLongWire: 2, snareDeepFocus: 2, snareSteady: 2 };
const BUILDS = [
    ['a first run', {}],
    ['Attention Span 3', { snareFocus: 3 }],
    ['the Focus branch', FOCUS],
    ['Focus + Obfuscation + Ghost', { ...FOCUS, snareChain: 1, snareFirewalls: 1, snareLongWalls: 1, snareHardened: 1, snareObfuscation: 2, snareGhost: 2 }],
    ['Focus + a datacentre', { ...FOCUS, snareSprawl: 3, snareMegasprawl: 3, snareHyperscale: 3 }]
];
const [lo, hi] = (process.env.SECTORS || '1-8').split('-').map(Number);
for (const [name, lv] of BUILDS) {
    const cells = [];
    for (let k = lo - 1; k <= hi - 1; k++) {
        const r = [1, 2, 3].map(seed => play(k, lv, seed));
        cells.push(`s${k + 1}(${r[0].need}):${r.map(x => x.hits).join('/')}${r.every(x => x.done) ? '✓' : r.some(x => x.done) ? '~' : ''}`);
    }
    console.log(name.padEnd(30), cells.join('  '));
}
