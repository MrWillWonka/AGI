'use strict';
// Snare 18.2: a walkthrough's slow motion (the owner's call: 0.15 of speed, a ghost showing the gesture) slows the field
// but not your pen, so a bubble grows and a flick times as they always do; and the boss's mines sit further out.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

const field = (over = {}) => P.createSnare({ seed: 4, density: 0, antivirus: [], idleDrain: 1, respawn: 1e9, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, focus: 30, ...over });

test('slow motion slows the field and its clocks, not the pen', () => {
    const s = field(), t = field();
    s.packets = [{ id: 900, kind: 'good', x: 2, y: 4, vx: 1, vy: 0, v: 1, r: P.PACKET_R, age: 1, school: 0, tag: 0 }];
    t.packets = [{ ...s.packets[0] }];
    s.setSlow(0.15);
    // a bubble held at the same spot for the same real second on both
    for (const r of [s, t]) { r.setPen('bubble'); r.addPoint(8, 4); }
    for (let i = 0; i < 60; i++) { s.addPoint(8, 4); t.addPoint(8, 4); s.step(1 / 60); t.step(1 / 60); }
    assert.ok(Math.abs(s.bubble.r - t.bubble.r) < 1e-9, 'the bubble grew just as much');
    assert.ok(Math.abs(s.real - t.real) < 1e-9, 'the pen\'s clock ran at full speed');
    assert.ok(Math.abs(s.time - 0.15 * t.time) < 1e-6, 'the field\'s clock ran at 0.15');
    assert.ok(Math.abs((s.packets[0].x - 2) - 0.15 * (t.packets[0].x - 2)) < 1e-6, 'packets swam 0.15 as far');
    assert.ok(Math.abs((30 - s.focus) - 0.15 * (30 - t.focus)) < 1e-6, 'Focus drained 0.15 as much');
    s.setSlow(1);
    const at = s.time;
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    assert.ok(Math.abs(s.time - at - 1) < 1e-6, 'back to full speed');
});

test('the boss lays its mines out at 0.42 of the field\'s shorter side', () => {
    assert.equal(P.SNARE.mineSpread, 0.42);
    const s = P.createSnare({ seed: 9, density: 0, antivirus: [], idleDrain: 0, sweepFirst: Infinity, w: 30, h: 20, boss: 60, bossAt: 0, bossMines: 2, mineEvery: 1 });
    for (let i = 0; i < 3 * 60 && s.mines.length < 2; i++) s.step(1 / 60);
    for (let i = 0; i < 3; i++) Object.assign(s.boss, { vx: 0, vy: 0 });
    assert.equal(s.mines.length, 2);
    for (const m of s.mines) assert.ok(Math.hypot(m.x - s.boss.x, m.y - s.boss.y) > 0.3 * 20, 'well clear of the boss');
});

test('a drawn loop\'s catch says so; a bubble\'s doesn\'t (the phone\'s walkthrough of the two)', () => {
    const s = P.createSnare({ seed: 2, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, loopCatch: 1 });
    s.packets = [5.6, 6, 6.4].map((x, i) => ({ id: 900 + i, kind: 'good', x, y: 4, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 }));
    const n = 40;
    for (let i = 0; i <= n + 3; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; s.addPoint(6 + Math.cos(a) * 1.4, 4 + Math.sin(a) * 1.4); s.step(1 / 60); }
    s.liftPen();
    const drawn = s.takeEvents().find(e => e.type === 'catch');
    assert.ok(drawn && drawn.drawn === true);
    s.packets.push({ id: 950, kind: 'good', x: 3, y: 4, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 });
    s.setPen('bubble'); s.addPoint(3, 4);
    for (let i = 0; i < 60; i++) { s.addPoint(3, 4); s.step(1 / 60); }
    s.liftPen();
    const held = s.takeEvents().find(e => e.type === 'catch');
    assert.ok(held && held.drawn === false);
});
