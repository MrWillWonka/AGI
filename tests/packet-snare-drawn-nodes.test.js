'use strict';
// After the owner's 18.7 iPhone log (18 bubbles in 45 runs: on a phone nearly every catch is a drawn loop, `loopCatch`), the
// four nodes that only worked on bubbles work on drawn loops too, and Backpressure is reworked: Race Condition holds a
// closed loop open while the finger stays still, Split forks a loop closed at its MAX, Supernova bursts a loop closed while
// frozen, Steady Hand raises a drawn loop's MAX, and a catch also takes the good packets just outside its edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

// A phone's run: bubbles, and drawn loops that catch.
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
const run = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s.step(1 / 60); };
// A finger drawing a circle round (cx, cy) at `secs` a turn, a step each point; it stops feeding once the loop closes
// (and lifts unless `hold`), so a held loop isn't moved off.
function drawLoop(s, cx, cy, r, { secs = 0.8, hold = false } = {}) {
    const n = Math.round(secs * 60), ev = [];
    for (let i = 0; i <= n + 6; i++) {
        const a = -Math.PI / 2 + i / n * Math.PI * 2;
        s.addPoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        s.step(1 / 60);
        const got = s.takeEvents();
        ev.push(...got);
        if (got.some(e => ['catch', 'raceStart', 'corrupt', 'nova', 'empty'].includes(e.type))) break;
    }
    if (!hold) { s.liftPen(); ev.push(...s.takeEvents()); }
    return ev;
}
const catchOf = ev => ev.find(e => e.type === 'catch');
// A full bubble's multiplier on this field (a drawn loop's MAX before Steady Hand).
function fullBubble(over = {}) {
    const s = still(over);
    const short = Math.min(s.w, s.h);
    const R = Math.min(Math.min(P.SNARE.bubbleMax * short, Math.sqrt(P.SNARE.bubbleShare * s.w * s.h / Math.PI)), Math.sqrt(s.w * s.h / 2 / Math.PI), 0.6 * short);
    return { R, mult: P.areaMult(16 * R * R * Math.sin(Math.PI / 16), s.opts, s.w * s.h) };   // its 32-sided outline
}

test('Race Condition on a drawn loop: closed with the finger still down and held, it stays open and its multiplier climbs', () => {
    const s = still({ race: 1, raceRate: 0.5, raceMax: 1 });
    packet(s, 'good', 6, 4); packet(s, 'good', 6.3, 4.2); packet(s, 'good', 5.8, 3.8);
    const ev = drawLoop(s, 6, 4, 1.6, { hold: true });
    assert.ok(ev.some(e => e.type === 'raceStart'), 'the loop is held open');
    assert.ok(s.race && s.race.drawn, 'a drawn loop is held');
    assert.equal(s.stats.caught, 0, 'nothing paid yet');
    const base = s.race.base;
    run(s, 1.2);
    assert.ok(s.race.bonus > 0.5, `it grew to +${s.race.bonus}`);
    s.liftPen();
    const c = catchOf(s.takeEvents());
    assert.equal(s.stats.caught, 3);
    assert.equal(s.stats.raced, 1);
    assert.ok(c.race > 0.5 && Math.abs(c.mult - base * (1 + c.race)) < 1e-9, `paid ×${c.mult} on ×${base}`);
    assert.ok(c.drawn, 'still a drawn loop\'s catch');
    // without the node it pays at once
    const plain = still();
    packet(plain, 'good', 6, 4);
    drawLoop(plain, 6, 4, 1.6, { hold: true });
    assert.equal(plain.race, null);
    assert.equal(plain.stats.caught, 1);
});

test('Race Condition on a drawn loop: moving pays it out, red getting in spoils it, a scan breaks it, and its cap holds its growth on top', () => {
    const moved = still({ race: 1 });
    packet(moved, 'good', 6, 4);
    drawLoop(moved, 6, 4, 1.6, { hold: true });
    run(moved, 0.6);
    moved.addPoint(10, 1);
    assert.equal(moved.race, null, 'moving off lets go');
    assert.equal(moved.stats.caught, 1);
    // red swimming in garbles it
    const red = still({ race: 1 });
    packet(red, 'good', 6, 4);
    const bad = packet(red, 'corrupt', 9, 4);
    drawLoop(red, 6, 4, 1.6, { hold: true });
    Object.assign(bad, { x: 6.5, y: 4 });
    run(red, 0.1);
    assert.equal(red.race, null);
    assert.equal(red.stats.corrupted, 1);
    // a Full Scan sweeping over it breaks it
    const scan = still({ race: 1, sweepFirst: 0.4, sweepEvery: 99, sweepWarn: 0.1, sweepTime: 1, threatWait: 0 });
    packet(scan, 'good', 6, 4);
    drawLoop(scan, 6, 4, 1.6, { hold: true });
    for (let i = 0; i < 180 && scan.race; i++) scan.step(1 / 60);
    assert.equal(scan.race, null);
    assert.equal(scan.stats.raceBroken, 1);
    assert.equal(scan.stats.caught, 0);
    // a loop past a full bubble's size holds from its MAX
    const big = still({ race: 1, raceRate: 0.5 });
    for (let x = 2; x <= 10; x++) for (let y = 1; y <= 7; y++) packet(big, 'good', x, y);
    drawLoop(big, 6, 4, 3.6, { hold: true, secs: 1.2 });
    const { mult } = fullBubble();
    assert.ok(Math.abs(big.race.base - mult) < 1e-9, `held from its MAX ×${big.race.base}`);
    run(big, 1);
    big.liftPen();
    const c = catchOf(big.takeEvents());
    assert.ok(c.mult > mult * 1.4, `×${c.mult} past the MAX ×${mult}`);
});

test('Split on a drawn loop: closed at its MAX it forks into smaller catches round it; under it, or without the node, it doesn\'t', () => {
    const field = s => { for (let x = 1; x < 24; x += 1) for (let y = 1; y < 16; y += 1) packet(s, 'good', x, y); };
    const s = still({ w: 24, h: 16, fork: 1 });
    field(s);
    const pv = [];
    // the preview while it's drawn says MAX
    const n = 72;
    for (let i = 0; i <= n - 4; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; s.addPoint(12 + Math.cos(a) * 5.6, 8 + Math.sin(a) * 5.6); s.step(1 / 60); }
    pv.push(s.preview());
    assert.ok(pv[0]?.capped, 'it shows ×n MAX');
    const ev = drawLoop(s, 12, 8, 5.6, { secs: 1.2 });
    const c = catchOf(ev);
    assert.ok(c && ev.some(e => e.type === 'split'), 'it split');
    const kids = ev.find(e => e.type === 'split').kids;
    assert.equal(kids.length, 2);
    const { R } = fullBubble({ w: 24, h: 16 });
    assert.ok(kids.every(k => k.r <= R * P.SNARE.splitR + 1e-9), 'each a full bubble\'s kid at most');
    const caught = s.stats.caught;
    run(s, P.SNARE.splitDelay + 0.1);
    assert.ok(s.stats.forks >= 1 && s.stats.caught > caught, 'the kids caught');
    // under the MAX: no split
    const small = still({ w: 24, h: 16, fork: 1 });
    field(small);
    const ev2 = drawLoop(small, 12, 8, 2.5);
    assert.ok(catchOf(ev2) && !ev2.some(e => e.type === 'split'));
    // without the node: no split
    const none = still({ w: 24, h: 16 });
    field(none);
    assert.ok(!drawLoop(none, 12, 8, 5.6, { secs: 1.2 }).some(e => e.type === 'split'));
});

test('Supernova on a drawn loop: closed while frozen, it bursts wider, pays ×starMult and deletes red', () => {
    const s = still({ freeze: 1, star: 1, freezeSeconds: 5 });
    packet(s, 'good', 6, 4); packet(s, 'good', 6.4, 4.3);
    packet(s, 'corrupt', 6, 4.6);                      // inside: it would garble the catch
    packet(s, 'corrupt', 6, 5.9);                      // just outside, inside the burst
    packet(s, 'good', 7.85, 4);                        // just outside, inside the burst
    const far = packet(s, 'good', 11, 7);
    s.usePower('freeze');
    const ev = drawLoop(s, 6, 4, 1.6);
    assert.equal(s.stats.stars, 1);
    assert.equal(s.stats.corrupted, 0, 'never garbles');
    assert.ok(!s.packets.some(p => p.kind === 'corrupt'), 'the red ones are gone');
    assert.equal(s.stats.caught, 3, 'the burst reaches past the loop');
    assert.ok(s.packets.includes(far), 'but not across the field');
    const c = catchOf(ev);
    assert.ok(c.star, 'a supernova\'s catch');
    // its multiplier: the loop's own (capped) × starMult
    const thawed = still();
    packet(thawed, 'good', 6, 4);
    const plain = catchOf(drawLoop(thawed, 6, 4, 1.6));
    assert.ok(Math.abs(c.mult - plain.mult * P.SNARE.starMult) < 0.05, `×${c.mult} against ×${plain.mult}`);
    // not frozen: an ordinary loop, garbled by the red inside
    const warm = still({ star: 1 });
    packet(warm, 'good', 6, 4); packet(warm, 'corrupt', 6, 4.6);
    drawLoop(warm, 6, 4, 1.6);
    assert.equal(warm.stats.stars, 0);
    assert.equal(warm.stats.corrupted, 1);
    // a huge loop's burst grows by a full bubble's at most, not by a third of the field
    const huge = still({ freeze: 1, star: 1, freezeSeconds: 5, w: 24, h: 16 });
    const corner = packet(huge, 'good', 0.5, 0.5);
    packet(huge, 'good', 12, 8);
    huge.usePower('freeze');
    const hev = drawLoop(huge, 12, 8, 6.5, { secs: 1.2 });
    const nova = hev.find(e => e.type === 'nova');
    const { R } = fullBubble({ w: 24, h: 16 });
    assert.ok(nova.r - 6.5 <= R * (P.SNARE.novaRing - 1) + 0.1, `the edge moved out ${nova.r - 6.5}`);
    assert.ok(huge.packets.includes(corner));
});

test('Steady Hand on a drawn loop: its MAX rises 10% a level (a loop under the MAX pays as before)', () => {
    const big = (lv) => {
        const s = still({ drawnCap: 0.1 * lv });
        for (let x = 2; x <= 10; x++) for (let y = 1; y <= 7; y++) packet(s, 'good', x, y);
        return catchOf(drawLoop(s, 6, 4, 3.6, { secs: 1.2 }));
    };
    const [a, b, c] = [big(0), big(1), big(2)];
    const { mult } = fullBubble();
    assert.ok(Math.abs(a.mult - mult) < 1e-9, 'capped at a full bubble\'s');
    assert.ok(Math.abs(b.mult - mult * 1.1) < 1e-9 && Math.abs(c.mult - mult * 1.2) < 1e-9, `×${b.mult}, ×${c.mult}`);
    const small = lv => { const s = still({ drawnCap: 0.1 * lv }); packet(s, 'good', 6, 4); return catchOf(drawLoop(s, 6, 4, 1.6)).mult; };
    assert.equal(small(0), small(2));
    // the node gives it, and bubbles still grow faster
    const st = E.defaultState(Date.now());
    st.levels.snareSteady = 2;
    const o = E.snareOpts(st);
    assert.equal(o.drawnCap, 0.2);
    assert.equal(o.bubbleGrow, 0.5);
    assert.ok(E.UPGRADE_BY_ID.snareSteady.effect.includes('MAX'));
});

test('Backpressure: a drawn loop or a bubble also takes the good packets just outside its edge, at its multiplier, and leaves red there', () => {
    const lay = s => {
        packet(s, 'good', 6, 4); packet(s, 'good', 6.3, 4.2); packet(s, 'good', 5.8, 3.8);
        packet(s, 'good', 6, 6.2);                                      // 0.6 past the edge
        packet(s, 'good', 3.9, 4);                                      // 0.5 past it
        const red = packet(s, 'corrupt', 8.2, 4);                       // 0.6 past it: left alone
        const wider = packet(s, 'good', 6, 1.25);                       // 1.15 past it: the second level only
        const far = packet(s, 'good', 11.5, 7.5);
        return { red, wider, far };
    };
    const s = still({ backpressure: 1 });
    const { red, wider, far } = lay(s);
    const c = catchOf(drawLoop(s, 6, 4, 1.6));
    assert.equal(c.count, 5, 'three inside and two in the ring');
    assert.equal(s.stats.edgeCaught, 2);
    assert.equal(s.stats.corrupted, 0, 'red in the ring garbles nothing');
    assert.ok(s.packets.includes(red) && s.packets.includes(wider) && s.packets.includes(far));
    assert.ok(Math.abs(c.units - c.count * c.mult) < 1e-9, 'the ring pays at the catch\'s multiplier');
    // the second level widens the ring (0.12 of the shorter side, then 0.16)
    const s2 = still({ backpressure: 2 });
    const two = lay(s2);
    drawLoop(s2, 6, 4, 1.6);
    assert.ok(!s2.packets.includes(two.wider) && s2.packets.includes(two.far));
    assert.equal(s2.stats.edgeCaught, 3);
    // without it: just the loop
    const none = still();
    lay(none);
    assert.equal(catchOf(drawLoop(none, 6, 4, 1.6)).count, 3);
    // a bubble too
    const b = still({ backpressure: 1, bubbleTime: 0.5 });
    packet(b, 'good', 6, 4);
    const near = packet(b, 'good', 6, 4 + 0.95 * 2.4);
    b.setPen('bubble');
    for (let i = 0; i < 60; i++) { b.addPoint(6, 4); b.step(1 / 60); }
    const r = b.bubble.r;
    near.y = 4 + r + 0.4;
    b.liftPen();
    b.setPen(null);
    assert.equal(b.stats.caught, 2, `the bubble (r ${r.toFixed(2)}) took the one just past its edge`);
    assert.equal(b.stats.edgeCaught, 1);
    // a garbled catch takes nothing from its ring
    const g = still({ backpressure: 1 });
    packet(g, 'good', 6, 4); packet(g, 'corrupt', 6.2, 4); const ring = packet(g, 'good', 6, 6.1);
    drawLoop(g, 6, 4, 1.6);
    assert.equal(g.stats.corrupted, 1);
    assert.ok(g.packets.includes(ring));
});

test('the five nodes say what they do on a drawn loop too', () => {
    const U = E.UPGRADE_BY_ID;
    assert.match(U.snareRace.effect, /closed loop/);
    assert.match(U.snareFork.effect, /loop at MAX/);
    assert.match(U.snareStar.effect, /catch made while frozen/);
    assert.match(U.snareSteady.effect, /drawn loop/);
    assert.match(U.snareBackpressure.effect, /just outside its edge/);
    assert.ok(!('backSeconds' in P.SNARE) && !('backPull' in P.SNARE), 'the turn-back knobs are gone');
});
