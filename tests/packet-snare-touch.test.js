'use strict';
// Snare 17.5, phone fix (the owner's call: "make both drawn and held circles on mobile work"): on a touch screen a finger held still
// grows a bubble, and a circle drawn round packets catches them when it closes (`loopCatch`), however slowly it's drawn;
// a mouse keeps its split (the right button holds a bubble, a left-button loop is for the boss).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, loopCatch: 1, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => {
    const p = { id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};
// A finger (no pen kind) drawing a circle at `secs` a turn, a step each point.
function drawCircle(s, cx, cy, r, secs) {
    const n = Math.round(secs * 60);
    for (let i = 0; i <= n + 4; i++) {
        const a = -Math.PI / 2 + i / n * Math.PI * 2;
        s.addPoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        s.step(1 / 60);
    }
    s.liftPen();
}

test('the game turns drawn loops on for touch and off for a mouse', () => {
    const st = E.defaultState(Date.now());
    assert.equal(E.snareOpts(st).loopCatch, 1);
    assert.equal(E.snareDesktop(E.snareOpts(st)).loopCatch, 0);
});

test('a circle drawn slowly with a finger catches what it closes round (no bubble on the way)', () => {
    for (const secs of [0.6, 1.5, 3]) {
        const s = still();
        packet(s, 'good', 6, 4); packet(s, 'good', 6.3, 4.2); packet(s, 'good', 5.8, 3.8);
        const ev = [];
        const n = Math.round(secs * 60);
        for (let i = 0; i <= n + 4; i++) {
            const a = -Math.PI / 2 + i / n * Math.PI * 2;
            s.addPoint(6 + Math.cos(a) * 1.6, 4 + Math.sin(a) * 1.6);
            s.step(1 / 60);
            ev.push(...s.takeEvents());
        }
        s.liftPen();
        ev.push(...s.takeEvents());
        assert.ok(!ev.some(e => e.type === 'bubbleStart'), `no bubble while drawing (${secs} s a turn)`);
        assert.equal(s.stats.caught, 3, `the loop caught them (${secs} s a turn)`);
        assert.ok(!ev.some(e => e.type === 'loopOnly'));
    }
});

test('a finger held still still grows a bubble at once, and a little wobble does not stop it', () => {
    const s = still();
    packet(s, 'good', 6, 4);
    s.addPoint(6, 4);
    let started = null;
    for (let i = 0; i < 60; i++) {
        s.addPoint(6 + 0.03 * Math.sin(i), 4 + 0.03 * Math.cos(i * 1.3));    // a thumb's tremor
        s.step(1 / 60);
        if (started == null && s.takeEvents().some(e => e.type === 'bubbleStart')) started = i / 60;
    }
    assert.ok(started != null && started < 0.3, `committed at ${started}`);
    s.liftPen();
    assert.equal(s.stats.caught, 1);
});

test('a finger that slides a little and stops becomes a bubble where it stopped', () => {
    const s = still();
    s.addPoint(6, 4);
    // slides 0.9 units over 0.25 s (short of the slop, 1.2 × the ring's 0.83), then holds
    for (let i = 1; i <= 15; i++) { s.addPoint(6 + 0.06 * i, 4); s.step(1 / 60); }
    assert.ok(s.bubble && !s.bubble.growing, 'not while it slides');
    for (let i = 0; i < 30; i++) { s.addPoint(6.9, 4); s.step(1 / 60); }
    assert.ok(s.bubble?.growing, 'once it is still');
});

test('drawn loops pay the scribble tax and do not clear mines (a bubble grabs those)', () => {
    const s = still();
    packet(s, 'good', 6, 4);
    drawCircle(s, 6, 4, 1.6, 0.8);
    assert.equal(s.stats.caught, 1);
    packet(s, 'good', 6, 4);
    s.step(1 / 60);
    const before = s.stats.units;
    drawCircle(s, 6, 4, 1.6, 0.25);     // straight after: rushed
    const ev = s.takeEvents();
    assert.ok(s.stats.units > before);
    assert.ok(ev.some(e => e.type === 'catch' && e.hasty) || s.stats.hasty > 0 || ev.some(e => /RUSH/i.test(e.text || '')), 'rushed');
});

test('without loopCatch (a mouse) a drawn loop still only circles the boss', () => {
    const s = still({ loopCatch: 0 });
    packet(s, 'good', 6, 4);
    s.setPen('wire');
    drawCircle(s, 6, 4, 1.6, 0.8);
    assert.equal(s.stats.caught, 0);
});
