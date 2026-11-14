#!/usr/bin/env node
// The ring's arithmetic: a numbers-only model of the planned demo's first stretch (the lab, Packet Snare, The Feed and
// the Training Cluster, up to the first boss falling). It plays one fixed, average player, so read it for shape and for
// where things jam, not for exact minutes. Nothing here touches the game: it is a planning tool for prices that don't
// exist in engine.js yet.
//
//   node tools/ring-model.js            the starting numbers and what each dial does
//   node tools/ring-model.js --json     the same runs as JSON
//
// Real numbers: the lab's prices and rates (engine.js: the desk 15/25/40/60/75 CP, a Graphics Card 15 CP x1.15 for
// 0.5 CP/s, 20 of them at the base cap) and Packet Snare's run sizes (the owner's 18.7 and 18.8 logs: about 45 packets
// in 12 s on sector 1, 75 in 12.5 s on sector 2, 75 in 14 s on sector 3; sectors 1 and 2 cleared in 2 and 4 full runs).
// Pattern Matching is taken as 30 sprints (about 12 runs of 2.5).
//
// The dials (all guesses until a build exists):
//   q          compute per second of a run's clock on sector 1
//   qGrow      that price's growth a sector
//   s          research per full sprint
//   chew       tiles a mite eats a second when pointed; graze is its share of that while you are elsewhere
//   tough      bites per packet by sector
//   layerGrow  how much bigger each layer of the heap is than the last
//   miteEvery  a new mite every this many layers
//   payback    the player buys a Graphics Card before paying for runs while it pays for itself within this many seconds
//   clicks     lab clicks a second

'use strict';

const DEFAULTS = { q: 10, qGrow: 1.6, s: 35, chew: 2, graze: 0.35, tough: [1, 2, 3], layerGrow: 1.8, miteEvery: 2, payback: 120, clicks: 2.5 };
const DESK = [15, 25, 40, 60, 75];
const PACKETS = { 1: 45, 2: 75, 3: 75 };
const CLOCK = { 1: 12, 2: 12.5, 3: 14 };
const CLEAR_RUNS = { 1: 2, 2: 4 };
const CARD_CAP = 20, CARD_CPS = 0.5, SPRINTS_NEEDED = 30, RUN_OVERHEAD = 8, TRAINING_RUN = 18;

function run(options = {}) {
    const o = { ...DEFAULTS, ...options };
    let t = 0, cp = 0, click = 1, desk = 0, cards = 0, cardPrice = 15;
    let pile = 0, research = 0, mites = 1, layerLeft = 30, layerSize = 30, layers = 0, bites = 1;
    let sector = 1, doneRuns = 0, sprints = 0, warm = false, bossMet = false, bossDown = false, learned = false;
    const where = { lab: 0, snare: 0, feed: 0, training: 0 }, at = {};
    const price = () => { const k = Math.min(sector, 3); return CLOCK[k] * o.q * Math.pow(o.qGrow, k - 1); };
    const tick = (dt, place, clicking = false, pointing = false) => {
        t += dt; where[place] += dt;
        cp += cards * CARD_CPS * dt + (clicking ? o.clicks * click * dt : 0);
        const eaten = Math.min(pile, mites * o.chew * (pointing ? 1 : o.graze) * dt);
        pile -= eaten; research += eaten / bites; layerLeft -= eaten;
        while (layerLeft <= 0) {
            research += 0.2 * layerSize / bites; layers++;
            if (layers % o.miteEvery === 0) mites++;
            layerSize *= o.layerGrow; layerLeft += layerSize;
        }
    };
    const shop = () => {
        while (desk < 5 && cp >= DESK[desk]) { cp -= DESK[desk]; desk++; click += desk < 5 ? 0.25 : 1; }
        const reserve = () => (at.server === undefined ? 0 : price());
        while (desk >= 5 && cards < CARD_CAP && cp >= cardPrice && (cardPrice / CARD_CPS <= o.payback || cp - cardPrice >= reserve())) {
            cp -= cardPrice; cards++; cardPrice *= 1.15;
        }
    };
    while (desk < 5) { tick(1, 'lab', true); shop(); }
    at.server = t;
    while (!bossDown && t < 3600) {
        const k = Math.min(sector, 3);
        if (bossMet && !learned && research >= o.s * 2.5) {
            if (!warm) { research -= o.s; tick(TRAINING_RUN, 'training'); warm = true; at.summit = t; continue; }
            research -= o.s * 2.5; sprints += 2.5; tick(TRAINING_RUN, 'training');
            if (sprints >= SPRINTS_NEEDED) { learned = true; at.skill = t; }
            continue;
        }
        if (learned) {
            if (cp < price()) { tick(1, 'lab', true); shop(); continue; }
            cp -= price(); tick(CLOCK[3] + 30 + RUN_OVERHEAD, 'snare'); pile += PACKETS[3] * o.tough[2]; bossDown = true; at.boss = t; break;
        }
        if (pile > mites * o.chew * 6) { tick(1, 'feed', false, true); if (at.feed === undefined) at.feed = t; continue; }
        if (cp >= price()) {
            cp -= price(); tick(CLOCK[k] + RUN_OVERHEAD, 'snare'); pile += PACKETS[k] * o.tough[k - 1]; bites = o.tough[k - 1];
            if (sector < 3) { doneRuns++; if (doneRuns >= CLEAR_RUNS[sector]) { sector++; doneRuns = 0; } }
            else if (!bossMet) { bossMet = true; at.bossMet = t; }
            shop(); continue;
        }
        tick(1, 'lab', true); shop();
    }
    const total = where.lab + where.snare + where.feed + where.training;
    const minutes = {}, share = {};
    for (const key of Object.keys(at)) minutes[key] = Math.round(at[key] / 6) / 10;
    for (const key of Object.keys(where)) share[key] = Math.round(100 * where[key] / total);
    return { minutes, share, cards, mites };
}

const VARIANTS = [
    ['the starting numbers', {}],
    ['runs cost 6 compute a second', { q: 6 }],
    ['runs cost 16 compute a second', { q: 16 }],
    ['a sprint costs 20 research', { s: 20 }],
    ['a sprint costs 50 research', { s: 50 }],
    ['a mite every layer, one bite a packet', { miteEvery: 1, tough: [1, 1, 1], layerGrow: 1.4, chew: 3 }],
    ['no grazing while you are elsewhere', { graze: 0 }],
    ['1.5 clicks a second', { clicks: 1.5 }],
    ['never buys a card first', { payback: 0 }],
];

if (require.main === module) {
    const rows = VARIANTS.map(([name, options]) => ({ name, ...run(options) }));
    if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); return; }
    console.log('The ring to the first boss, one average player (minutes; shares of time)\n');
    console.log('variant'.padEnd(40) + 'Feed  boss met  summit  skill  boss down | lab snare feed training | cards mites');
    for (const r of rows) {
        const m = r.minutes, f = v => (v === undefined ? '  -' : v.toFixed(1)).padStart(5);
        console.log(r.name.padEnd(40) + f(m.feed) + '   ' + f(m.bossMet) + '   ' + f(m.summit) + '  ' + f(m.skill) + '      ' + f(m.boss) + ' | '
            + String(r.share.lab).padStart(2) + '% ' + String(r.share.snare).padStart(4) + '% ' + String(r.share.feed).padStart(3) + '% ' + String(r.share.training).padStart(7) + '% | '
            + String(r.cards).padStart(5) + ' ' + String(r.mites).padStart(5));
    }
}

module.exports = { run, DEFAULTS };
