'use strict';
// Packet Snare 12 (the owner's brother scribbled back and forth: tiny loops caught at no risk, and flicks turned every red
// packet good): a loop must be at least about the closing ring's size, and spoofing flicks are capped and wait between.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => {
    const p = { id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};

test('a scribble back and forth catches nothing: its slivers are too small to close', () => {
    const s = still();
    for (let i = 0; i < 12; i++) packet(s, 'good', 4 + (i % 4) * 0.3, 3.6 + Math.floor(i / 4) * 0.3);
    // a zigzag scribble over the packets, back and forth with a little drift, crossing itself often
    s.addPoint(3.6, 3.5);
    for (let k = 0; k < 14; k++) {
        const y = 3.5 + k * 0.08;
        s.addPoint(5.4, y + 0.04);
        s.addPoint(3.6, y + 0.08);
    }
    s.liftPen();
    assert.equal(s.stats.catches, 0, `no catch from a scribble (${s.stats.catches})`);
    // a real loop round them still catches
    const t = still();
    for (let i = 0; i < 4; i++) packet(t, 'good', 4.2 + i * 0.2, 4);
    const n = 40;
    for (let i = 0; i <= n + 2; i++) t.addPoint(4.5 + Math.cos(i / n * Math.PI * 2) * 1.2, 4 + Math.sin(i / n * Math.PI * 2) * 1.2);
    t.liftPen();
    assert.equal(t.stats.catches, 1);
});

test('a spoofing flick takes at most a few red packets, and the next waits a moment', () => {
    const s = still({ spoof: 1 });
    for (let i = 0; i < 8; i++) packet(s, 'corrupt', 3 + i * 0.4, 4);
    const flick = () => { for (let i = 0; i <= 8; i++) { s.addPoint(2.6 + i * 0.45, 4); if (i % 3 === 0) s.step(1 / 60); } s.liftPen(); };
    flick();
    assert.equal(s.stats.spoofed, P.SNARE.spoofCap, 'capped');
    flick();
    assert.equal(s.stats.spoofed, P.SNARE.spoofCap, 'the next flick at once spoofs nothing');
    assert.equal(s.stats.flags, 0, 'and isn\'t flagged for it');
    for (let i = 0; i < 60 * P.SNARE.spoofCooldown; i++) s.step(1 / 60);
    flick();
    assert.ok(s.stats.spoofed > P.SNARE.spoofCap, 'after the wait it spoofs again');
});

test('a loop moments after the last pays half and doesn\'t count toward the goal, lifted between or not', () => {
    const s = still({ goal: 50 });
    const ringAt = (cx, cy) => {
        for (let i = 0; i < 4; i++) packet(s, 'good', cx - 0.3 + i * 0.2, cy);
        const n = 40;
        for (let i = 0; i <= n + 2; i++) s.addPoint(cx + Math.cos(i / n * Math.PI * 2) * 1.1, cy + Math.sin(i / n * Math.PI * 2) * 1.1);
        s.liftPen();
    };
    ringAt(3, 3);
    const first = s.takeEvents().find(e => e.type === 'catch');
    ringAt(8, 3);   // straight after, a new stroke
    const second = s.takeEvents().find(e => e.type === 'catch');
    assert.ok(!first.hasty && second.hasty, 'the second is rushed');
    assert.equal(s.goalSkip, second.count, 'and doesn\'t count toward the goal');
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    ringAt(3, 6);
    assert.ok(!s.takeEvents().find(e => e.type === 'catch').hasty, 'after a breath it counts again');
});

test('the boss takes two loops to stun (Snare 12.7), and the count starts again if they\'re too far apart', () => {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 12, h: 8, boss: 20, bossAt: 0, bossCatch: 0 });
    s.packets = [];
    for (let i = 0; i < 12; i++) s.step(1 / 60);
    const b = s.boss;
    const pin = () => Object.assign(b, { x: 6, y: 4, vx: 0, vy: 0, charge: null, chargeAt: s.time + 99 });
    const loop = () => {
        pin();
        const r = b.r + 1, n = 60;
        for (let i = 0; i <= n + 2; i++) s.addPoint(6 + Math.cos(i / n * Math.PI * 2) * r, 4 + Math.sin(i / n * Math.PI * 2) * r);
        s.liftPen();
    };
    loop();
    assert.ok(!(b.stunned > s.time) && b.loops === 1, 'one loop: not yet');
    for (let i = 0; i < 60 * 6; i++) { pin(); s.step(1 / 60); }
    loop();
    assert.ok(!(b.stunned > s.time) && b.loops === 1, 'too long after the first (5 s, round 4 of the review): the count started again');
    loop();
    assert.ok(b.stunned > s.time, 'two in a row: stunned');
    assert.equal(s.stats.loopStuns, 1);
});

test('Rogue AI cores spawn far enough from the edges to loop round (Snare 12.8)', () => {
    const s = P.createSnare({ seed: 3, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 22, h: 14, rogue: 3, rogueEvery: 0.5, rogueLife: 99 });
    s.packets = [];
    // good packets hugging every edge, where cores used to land
    for (let i = 0; i < 40; i++) {
        const side = i % 4, u = (i * 0.37) % 1;
        const [x, y] = side === 0 ? [0.3, u * 14] : side === 1 ? [21.7, u * 14] : side === 2 ? [u * 22, 0.3] : [u * 22, 13.7];
        s.packets.push({ id: s.nextId++, kind: 'good', x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 });
    }
    for (let i = 0; i < 60 * 5; i++) s.step(1 / 60);
    assert.ok(s.cores.length >= 6, 'cores spawned');
    const m = Math.max(1.5 * s.closeR, 0.12 * 14);
    for (const c of s.cores) assert.ok(c.x >= m - 1e-9 && c.x <= 22 - m + 1e-9 && c.y >= m - 1e-9 && c.y <= 14 - m + 1e-9, `core at ${c.x.toFixed(2)}, ${c.y.toFixed(2)} keeps ${m.toFixed(2)} from the edges`);
});
