'use strict';
// Packet Snare 15: bubbles are the way to catch (the owner's call). A bubble let go quarantines a core, grabs a mine,
// hijacks a stunned Antivirus and collects garbage; Split and Supernova replace the figure eight and the star; a full
// bubble held still is Race Condition; Bigger Buffers and Steady Hand size and speed it; a grabbed mine flicked at the boss;
// new threats wait for the pen to lift; a wire loop only circles the boss.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y, vx = 0, vy = 0) => {
    const p = { id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };
// Hold a bubble at (x, y) for `secs`, then let go (unless `keep`).
function bubble(s, x, y, secs, keep = false) {
    s.setPen('bubble');
    s.addPoint(x, y);
    for (let i = 0; i < secs * 60; i++) { s.addPoint(x, y); s.step(1 / 60); }
    if (!keep) { s.liftPen(); s.setPen(null); }
}
function flickLine(s, x0, y0, x1, y1) {
    s.setPen('wire');
    for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); }
    s.liftPen();
    s.setPen(null);
}
function circle(s, cx, cy, r) {
    s.setPen('wire');
    const n = Math.max(24, Math.ceil(2 * Math.PI * r / 0.12));
    for (let i = 0; i <= n + 2; i++) s.addPoint(cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * r);
    s.liftPen();
    s.setPen(null);
}

test('a bubble let go catches what is inside; a wire loop catches nothing (it only circles the boss)', () => {
    const s = still();
    packet(s, 'good', 6, 4); packet(s, 'good', 6.3, 4.2);
    bubble(s, 6.1, 4.1, 1);
    assert.equal(s.stats.caught, 2);
    const w = still();
    packet(w, 'good', 6, 4);
    circle(w, 6, 4, 1.2);
    assert.equal(w.stats.caught, 0);
    assert.ok(w.takeEvents().some(e => e.type === 'loopOnly'), 'it says what loops are for');
});

test('the game always plays bubbles, with Bigger Buffers and Steady Hand sizing and speeding them', () => {
    const s = E.defaultState(Date.now());
    assert.equal(E.snareOpts(s).bubble, 1);
    s.levels.snareLongWire = 1; s.levels.snareSteady = 1;
    const o = E.snareOpts(s);
    assert.equal(o.bubbleSize, 0.25);
    assert.equal(o.bubbleGrow, 0.25);
    const big = still({ bubbleSize: 0.25 }), plain = still();
    bubble(big, 6, 4, 3, true); bubble(plain, 6, 4, 3, true);
    assert.ok(Math.abs(big.bubble.r / plain.bubble.r - 1.25) < 0.01, 'a full one 25% bigger');
    const quick = still({ bubbleGrow: 0.25 }), slow = still();
    bubble(quick, 6, 4, 1.5, true); bubble(slow, 6, 4, 1.5, true);
    assert.ok(quick.bubble.r > slow.bubble.r, 'it grows faster');
});

test('Split: a full bubble let go forks; the halves catch a moment later at multiplied multipliers; red spoils only its half, free', () => {
    const s = still({ fork: 1, bubbleTime: 1, maxMult: 50 });
    packet(s, 'good', 6, 4);
    // a ring of packets just outside the bubble, so either half finds some
    for (let i = 0; i < 16; i++) packet(s, 'good', 6 + Math.cos(i * Math.PI / 8) * 4.2, 4 + Math.sin(i * Math.PI / 8) * 3.3);
    bubble(s, 6, 4, 1.2);
    assert.equal(s.splits.length, 2, 'two halves');
    const caught = s.stats.caught;
    run(s, 0.6);
    assert.ok(s.stats.forks >= 1 && s.stats.caught > caught, 'they caught');
    const ev = s.takeEvents().filter(e => e.type === 'catch' && e.split);
    assert.ok(ev.length >= 1 && ev.every(e => e.mult > 1), 'at the first bubble\'s multiplier times their own');
    // level 2: three
    const t = still({ fork: 2, bubbleTime: 1 });
    packet(t, 'good', 6, 4);
    bubble(t, 6, 4, 1.2);
    assert.equal(t.splits.length, 3);
    // a half with red in it spoils alone, and costs no Focus
    const r = still({ fork: 1, bubbleTime: 1, seed: 3 });
    packet(r, 'good', 6, 4);
    bubble(r, 6, 4, 1.2);
    const focus = r.focus;
    for (const k of r.splits) { packet(r, 'good', k.x, k.y); packet(r, 'corrupt', k.x + 0.1, k.y); }
    run(r, 0.6);
    assert.equal(r.stats.forks, 0);
    assert.equal(r.focus, focus, 'no Focus lost');
    assert.equal(r.stats.corrupted, 0);
    // not full: no split
    const u = still({ fork: 1, bubbleTime: 2.5 });
    packet(u, 'good', 6, 4);
    bubble(u, 6, 4, 0.8);
    assert.equal(u.splits.length, 0);
});

test('Supernova: a bubble let go while frozen bursts wider, catches ×starMult and deletes red', () => {
    const s = still({ freeze: 1, star: 1 });
    packet(s, 'good', 6, 4); packet(s, 'corrupt', 6.3, 4); packet(s, 'good', 7.2, 4);
    s.usePower('freeze');
    bubble(s, 6, 4, 0.9);
    assert.equal(s.stats.stars, 1);
    assert.equal(s.stats.corrupted, 0, 'never spoils');
    assert.ok(!s.packets.some(p => p.kind === 'corrupt'), 'the red one is gone');
    assert.equal(s.stats.caught, 2, 'the burst reaches past the bubble');
    const thawed = still({ star: 1 });
    packet(thawed, 'good', 6, 4); packet(thawed, 'corrupt', 6.3, 4);
    bubble(thawed, 6, 4, 0.9);
    assert.equal(thawed.stats.stars, 0, 'only while frozen');
    assert.equal(thawed.stats.corrupted, 1);
});

test('Race Condition: a full bubble held still grows its multiplier; moving it starts again', () => {
    const s = still({ race: 1, raceRate: 0.5, raceMax: 1, bubbleTime: 0.5 });
    packet(s, 'good', 6, 4);
    bubble(s, 6, 4, 2, true);
    assert.ok(s.bubble.bonus > 0.5, `grew to ${s.bubble.bonus}`);
    // moved: the count starts again
    s.addPoint(8, 4);
    run(s, 0.05);
    assert.ok(s.bubble.bonus < 0.1);
    for (let i = 0; i < 90; i++) { s.addPoint(8, 4); s.step(1 / 60); }
    s.liftPen();
    assert.ok(s.stats.raced >= 1);
    const plain = still({ bubbleTime: 0.5 });
    bubble(plain, 6, 4, 2, true);
    assert.ok(!(plain.bubble.bonus > 0), 'without the node it stays put');
});

test('a bubble quarantines a core, hijacks a stunned Antivirus and collects garbage', () => {
    const s = still({ rogue: 1, rogueFirst: 0.05, rogueEvery: 99 });
    run(s, 0.1);
    const c = s.cores[0];
    bubble(s, c.x, c.y, 0.6);
    assert.equal(s.stats.quarantined, 1);
    const h = still({ hijack: 1, antivirus: [0] });
    run(h, 0.05);
    const f = h.antivirus[0];
    Object.assign(f, { x: 6, y: 4, vx: 0, vy: 0, stunned: h.time + 5 });
    bubble(h, 6, 4, 0.6);
    assert.equal(h.stats.hijacked, 1);
    const g = still({ gc: 1 });
    packet(g, 'corrupt', 6, 4); packet(g, 'corrupt', 6.2, 4.1);
    bubble(g, 6.1, 4, 0.6);
    assert.equal(g.stats.collected, 2);
});

test('boss mines: a bubble grabs one (no shield, no nets); a flick from it at the boss throws it through the guard', () => {
    const s = still({ boss: 20, bossAt: 0, bossMines: 2, mineEvery: 99 });
    run(s, 0.05);
    Object.assign(s.boss, { x: 3, y: 4, vx: 0, vy: 0, chargeAt: 99, charge: null, mineAt: 99 });
    s.mines.push({ id: 900, x: 8, y: 4 }, { id: 901, x: 8, y: 6.5 }, { id: 902, x: 9.5, y: 2 });
    run(s, 0.05);
    assert.ok(s.boss.shielded, 'shielded while two stand');
    bubble(s, 8, 4, 0.5);
    assert.equal(s.held.length, 1);
    assert.equal(s.mines.length, 2);
    // flick from the held mine toward the boss (it needn't reach it); the guard is up and two mines still shield it
    Object.assign(s.boss, { x: 3, y: 4, vx: 0, vy: 0, stunned: 0 });
    const hp = s.boss.hp;
    flickLine(s, 8, 4, 6.4, 4);
    assert.equal(s.stats.mineThrows, 1);
    assert.equal(s.boss.hp, hp - P.SNARE.mineThrow, 'a big hit, through the guard and the shield');
    assert.ok(s.boss.stunned > s.time, 'it reels');
    assert.equal(s.held.length, 0);
    // not thrown in time, it goes live again
    const t = still({ boss: 20, bossAt: 0, bossMines: 1, mineEvery: 99, mineHold: 1 });
    run(t, 0.05);
    Object.assign(t.boss, { x: 3, y: 4, vx: 0, vy: 0, chargeAt: 99, charge: null, mineAt: 99 });
    t.mines = [{ id: 900, x: 8, y: 4 }];
    bubble(t, 8, 4, 0.5);
    assert.equal(t.mines.length, 0);
    run(t, 1.2);
    assert.equal(t.held.length, 0);
    assert.equal(t.mines.length, 1, 'live again');
    // Defuse at its last level grabs the nearest other too
    const d = still({ boss: 20, bossAt: 0, bossMines: 2, mineEvery: 99, defuseChain: 1 });
    run(d, 0.05);
    Object.assign(d.boss, { x: 2, y: 2, vx: 0, vy: 0, chargeAt: 99, charge: null, mineAt: 99 });
    d.mines = [{ id: 900, x: 8, y: 4 }, { id: 901, x: 10, y: 6 }];
    bubble(d, 8, 4, 0.5);
    assert.equal(d.held.length, 2);
});

test('two loops round the boss still stun it', () => {
    const s = still({ boss: 9, bossAt: 0 });
    run(s, 0.05);
    Object.assign(s.boss, { x: 6, y: 4, vx: 0, vy: 0, chargeAt: 99, charge: null });
    circle(s, 6, 4, 2);
    circle(s, 6, 4, 2);
    assert.equal(s.stats.loopStuns, 1);
});

test('new threats wait for the pen to lift (a tip card never lands mid-bubble), up to threatWait', () => {
    const s = still({ antivirus: [0.3] });
    bubble(s, 6, 4, 1.2, true);
    assert.equal(s.antivirus.length, 0, 'not while the bubble is held');
    s.liftPen();
    run(s, 0.05);
    assert.equal(s.antivirus.length, 1, 'right after the release');
    const long = still({ antivirus: [0.3], threatWait: 1 });
    bubble(long, 6, 4, 1.6, true);
    assert.equal(long.antivirus.length, 1, 'a pen held past threatWait doesn\'t hold it off for ever');
    const scan = still({ sweepFirst: 0.3, sweepEvery: 99 });
    bubble(scan, 6, 4, 1, true);
    assert.equal(scan.stats.sweeps, 0);
});


test('Bandwidth: a full bubble pays more (its cap was never reached by a bubble; the owner\'s call after the review rounds)', () => {
    const catchAt = fullMult => {
        const s = still({ fullMult, bubbleTime: 0.5 });
        for (let i = 0; i < 6; i++) packet(s, 'good', 6 + (i % 3) * 0.3, 4 + Math.floor(i / 3) * 0.3);
        bubble(s, 6.3, 4.15, 0.8);
        return s.takeEvents().find(e => e.type === 'catch');
    };
    const plain = catchAt(0), wide = catchAt(0.25);
    assert.ok(plain && wide, 'both caught');
    assert.ok(Math.abs(wide.mult / plain.mult - 1.25) < 0.01, `×1.25 on a full bubble (${plain.mult} → ${wide.mult})`);
    const s = E.defaultState(Date.now());
    s.levels.snareBandwidth = 2;
    assert.equal(E.snareOpts(s).fullMult, 0.5);
});
