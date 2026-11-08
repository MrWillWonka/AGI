'use strict';
// Packet Snare's bubbles (a prototype behind a setting): hold still and a bubble grows; let go and it catches.
// Loops then only stun, quarantine, hijack, clear mines and collect garbage.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y, vx = 0, vy = 0) => s.packets.push({ id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 });
const hold = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s.step(1 / 60); };
function drawSquare(s, cx, cy, r) {
    const pts = [[cx - r, cy - r - 0.3], [cx - r, cy + r], [cx + r, cy + r], [cx + r, cy - r], [cx - r - 0.5, cy - r]];
    for (const [x, y] of pts) {
        const last = s.wire[s.wire.length - 1];
        if (!last) { s.addPoint(x, y); continue; }
        const n = Math.ceil(Math.hypot(x - last.x, y - last.y) / 0.2);
        const a = { ...last };
        for (let i = 1; i <= n; i++) s.addPoint(a.x + (x - a.x) * i / n, a.y + (y - a.y) * i / n);
    }
}

test('bubbles: hold still and a bubble grows, slowly then faster; let go and it catches what is inside', () => {
    const s = still();
    for (let i = 0; i < 5; i++) packet(s, 'good', 6 + (i - 2) * 0.3, 4);
    s.addPoint(6, 4);
    hold(s, 0.1);
    assert.ok(!s.bubble.growing, 'not before the delay');
    hold(s, 0.6);
    const early = s.bubble.r;
    hold(s, 0.6);
    const mid = s.bubble.r;
    assert.ok(mid - early > early * 0.5, 'growing faster');
    assert.ok(s.preview()?.bubble && s.preview().good.length === 5, 'the preview shows what it would catch');
    s.liftPen();
    assert.equal(s.stats.caught, 5);
    assert.equal(s.stats.bubbles, 1);
    assert.equal(s.packets.length, 0);
    assert.ok(!s.bubble && !s.wire.length);
});

test('bubbles: a bigger bubble pays a bigger multiplier, and red inside spoils it', () => {
    const size = secs => {
        const s = still();
        packet(s, 'good', 6, 4);
        s.addPoint(6, 4);
        hold(s, 0.18 + secs);
        s.liftPen();
        return s.stats.bestMult;
    };
    assert.ok(size(2.8) > size(1) * 1.3, 'a longer hold pays more');
    const r = still();
    packet(r, 'good', 6, 4);
    packet(r, 'corrupt', 6.3, 4);
    r.addPoint(6, 4);
    hold(r, 1.5);
    r.liftPen();
    assert.equal(r.stats.caught, 0);
    assert.equal(r.stats.corrupted, 1);
});

test('bubbles: a pen that moves before the delay draws a wire; a tap grows nothing', () => {
    const s = still();
    s.addPoint(3, 3);
    s.addPoint(4, 3);
    hold(s, 0.5);
    assert.ok(!s.bubble, 'a wire after all');
    s.liftPen();
    const t = still();
    packet(t, 'good', 6, 4);
    t.addPoint(6, 4);
    hold(t, 0.05);
    t.liftPen();
    assert.equal(t.stats.caught, 0);
    assert.equal(t.stats.bubbles, 0);
});

test('bubbles: loops no longer catch packets, but still stun the boss', () => {
    const s = still();
    for (let i = 0; i < 4; i++) packet(s, 'good', 6 + i * 0.2, 4);
    drawSquare(s, 6.3, 4, 1.5);
    s.liftPen();
    assert.equal(s.stats.caught, 0, 'a loop catches nothing');
    assert.ok(s.takeEvents().some(e => e.type === 'loopOnly'));
    const b = still({ boss: 1, bossAt: 0, bossCatch: 0 });
    hold(b, 0.2);
    assert.ok(b.boss, 'the boss is up');
    b.boss.x = 6; b.boss.y = 4; b.boss.target = { x: 6, y: 4 };
    b.boss.next = b.time + 100;
    drawSquare(b, 6, 4, b.boss.r * 2.2);
    b.liftPen();
    assert.ok(b.boss.stunned > b.time, 'stunned by the loop');
});

test('bubbles: an Antivirus that touches a growing bubble pops it', () => {
    const s = still();
    s.addPoint(6, 4);
    hold(s, 1.5);
    const r = s.bubble.r;
    s.antivirus.push({ id: s.nextId++, x: 6 + r + 0.3, y: 4, vx: 0, vy: 0, r: P.AV_R, on: true, stunned: 0, hp: 3, phase: 0 });
    hold(s, 1);
    assert.equal(s.stats.snaps, 1, 'popped');
    assert.ok(!s.bubble);
});
