'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// A field with nothing moving and no Firewalls, packets placed by hand.
function still(over = {}) {
    const s = P.createSnare({ seed: 7, good: 0, corrupt: 0, firewalls: [], idleDrain: 0, drawBase: 0, drawDrain: 0, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => s.packets.push({ id: s.nextId++, kind, x, y, vx: 0, vy: 0, r: P.PACKET_R, age: 0 });
// Draw a square loop round (cx, cy) with half-side r, crossing back over the start to close it.
function drawSquare(s, cx, cy, r) {
    const pts = [[cx - r, cy - r - 0.3], [cx - r, cy + r], [cx + r, cy + r], [cx + r, cy - r], [cx - r - 0.5, cy - r]];
    for (const [x, y] of pts) {
        // in short steps, as a pointer would
        const last = s.wire[s.wire.length - 1];
        if (!last) { s.addPoint(x, y); continue; }
        const n = Math.ceil(Math.hypot(x - last.x, y - last.y) / 0.2);
        const a = { ...last };
        for (let i = 1; i <= n; i++) s.addPoint(a.x + (x - a.x) * i / n, a.y + (y - a.y) * i / n);
    }
}

test('geometry: segments cross, points fall inside polygons, areas are absolute', () => {
    assert.deepEqual(P.segIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }), { x: 1, y: 1 });
    assert.equal(P.segIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null, 'parallel');
    const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    assert.ok(P.pointInPolygon({ x: 2, y: 2 }, sq));
    assert.ok(!P.pointInPolygon({ x: 5, y: 2 }, sq));
    assert.equal(P.polygonArea(sq), 16);
    assert.equal(P.polygonArea([...sq].reverse()), 16);
});

test('a run is deterministic from its seed', () => {
    const a = P.createSnare({ seed: 42, w: 16, h: 10 });
    const b = P.createSnare({ seed: 42, w: 16, h: 10 });
    for (let i = 0; i < 300; i++) { a.step(1 / 30); b.step(1 / 30); }
    assert.deepEqual(a.packets.map(p => [p.x, p.y, p.kind]), b.packets.map(p => [p.x, p.y, p.kind]));
    assert.deepEqual(a.firewalls.map(f => [f.x, f.y]), b.firewalls.map(f => [f.x, f.y]));
    const c = P.createSnare({ seed: 43, w: 16, h: 10 });
    assert.notDeepEqual(a.packets.slice(0, 3).map(p => p.x), c.packets.slice(0, 3).map(p => p.x));
});

test('packets stay on the field and the field fills to its size', () => {
    const s = P.createSnare({ seed: 3, w: 10, h: 16 });
    assert.ok(s.packets.length >= P.SNARE.good + P.SNARE.corrupt - 1);
    for (let i = 0; i < 600; i++) s.step(1 / 60);
    for (const p of s.packets) assert.ok(p.x >= 0 && p.x <= s.w && p.y >= 0 && p.y <= s.h);
});

test('a wire that crosses itself closes a loop and snares what is inside, at the area multiplier', () => {
    const s = still();
    packet(s, 'good', 5, 5);
    packet(s, 'good', 5.5, 4.5);
    packet(s, 'good', 12, 8);   // outside
    drawSquare(s, 5, 5, 1.5);
    const ev = s.takeEvents().filter(e => e.type === 'catch');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].count, 2);
    assert.ok(Math.abs(ev[0].mult - P.areaMult(ev[0].area)) < 1e-9);
    assert.ok(ev[0].area > 8 && ev[0].area < 10.5, `about a 3 × 3 square (${ev[0].area})`);
    assert.equal(s.packets.length, 1, 'the snared packets leave the field');
    assert.equal(s.stats.caught, 2);
});

test('bigger loops pay a bigger multiplier, up to the cap', () => {
    assert.ok(P.areaMult(30) > P.areaMult(10));
    assert.equal(P.areaMult(1e6), P.SNARE.maxMult);
    assert.equal(P.areaMult(0), 1);
});

test('a corrupt packet in the loop spoils the whole catch and costs Focus', () => {
    const s = still();
    packet(s, 'good', 5, 5);
    packet(s, 'corrupt', 5.4, 5.2);
    const before = s.focus;
    drawSquare(s, 5, 5, 1.5);
    const ev = s.takeEvents();
    assert.ok(!ev.some(e => e.type === 'catch'));
    assert.ok(ev.some(e => e.type === 'corrupt'));
    assert.equal(s.stats.caught, 0);
    assert.equal(s.focus, before - P.SNARE.corruptPenalty);
});

test('gold packets are worth several', () => {
    const s = still();
    packet(s, 'gold', 5, 5);
    drawSquare(s, 5, 5, 1.5);
    const c = s.takeEvents().find(e => e.type === 'catch');
    assert.equal(c.units, P.GOLD_VALUE * c.mult);
});

test('a Firewall that touches the wire snaps it, costs Focus and stops the pen for a moment', () => {
    const s = still({ firewalls: [0] });
    s.step(1 / 60);
    const f = s.firewalls[0];
    f.x = 5; f.y = 5; f.vx = 0; f.vy = 0;
    s.addPoint(3, 5);
    s.addPoint(4, 5);
    s.addPoint(5.2, 5);
    s.step(1 / 60);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'snap'));
    assert.equal(s.wire.length, 0);
    assert.ok(s.cooldown > 0);
    assert.equal(s.addPoint(1, 1), false, 'no drawing during the cooldown');
    assert.equal(s.stats.snaps, 1);
});

test('Firewalls hunt the wire', () => {
    const s = still({ firewalls: [0] });
    s.step(1 / 60);
    const f = s.firewalls[0];
    f.x = 1; f.y = 1;
    s.addPoint(8, 6);
    s.addPoint(8.5, 6);
    const d0 = Math.hypot(f.x - 8, f.y - 6);
    for (let i = 0; i < 30; i++) s.step(1 / 60);
    assert.ok(f.hunting);
    assert.ok(Math.hypot(f.x - 8, f.y - 6) < d0 - 0.4, 'closer after half a second');
});

test('a longer wire burns Focus faster, and an empty Focus ends the run', () => {
    const drained = len => {
        const s = P.createSnare({ seed: 1, good: 0, corrupt: 0, firewalls: [] });
        s.packets = [];
        s.addPoint(0.5, 0.5);
        for (let x = 0.5; x <= 0.5 + len; x += 0.1) s.addPoint(x, 0.5);
        const f0 = s.focus;
        for (let i = 0; i < 4; i++) s.step(0.25);   // step() takes at most a quarter second at a time
        return f0 - s.focus;
    };
    assert.ok(drained(8) > drained(2) + 2);
    const s = P.createSnare({ seed: 1, firewalls: [] });
    for (let i = 0; i < 1000 && !s.over; i++) s.step(0.25);
    assert.ok(s.over, 'an idle run still ends');
    assert.ok(s.takeEvents().some(e => e.type === 'end'));
    assert.equal(s.addPoint(3, 3), false);
});

test('the wire trails: past its length it drops its tail', () => {
    const s = still({ maxWire: 5 });
    for (let x = 0.2; x < 12; x += 0.1) s.addPoint(x, 1);
    assert.ok(P.wireLength(s.wire) <= 5 + 0.2);
});

test('one scribble can snare loop after loop', () => {
    const s = still();
    packet(s, 'good', 4, 4);
    packet(s, 'good', 10, 4);
    drawSquare(s, 4, 4, 1.2);
    assert.ok(s.drawing, 'the pen is still down after a catch');
    drawSquare(s, 10, 4, 1.2);
    assert.equal(s.stats.catches, 2);
});

// ---- The economy (engine.js) ----

test('snared data pays whole numbers at a hand collection per packet, times the multiplier', () => {
    const s = E.defaultState(NOW);
    const per = E.snarePacketDp(s);
    assert.equal(per, Math.max(1, E.derive(s).dpPerCollect));
    const dp = E.snareCatch(s, 2.7);
    assert.equal(dp, Math.round(2.7 * per));
    assert.ok(Number.isInteger(s.res.dp));
    assert.equal(s.stats.runDp, dp, 'counts as data earned this version');
    assert.equal(s.snare.dp, dp);
});

test('a run\'s haul sets the version\'s record', () => {
    const s = E.defaultState(NOW);
    assert.deepEqual(E.finishSnare(s, 50), { record: false, first: true, prev: 0 });
    assert.equal(E.finishSnare(s, 40).record, false);
    assert.equal(E.finishSnare(s, 80).record, true);
    assert.equal(s.snare.best, 80);
    assert.equal(s.snare.runs, 3);
});

test('the Data Pipeline opens with Edge Detection once the server room is open', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    s.path.learned = E.SKILL_INDEX['Edge Detection'];
    E.evaluate(s);
    assert.ok(!s.unlocked['module:snare']);
    s.path.learned++;
    E.evaluate(s);
    assert.ok(s.unlocked['module:snare']);
});

test('saves before v19 get an empty snare record; a save keeps it', () => {
    const old = E.migrate({ version: 18 }, NOW);
    assert.deepEqual(old.snare, { best: 0, runs: 0, dp: 0 });
    const s = E.defaultState(NOW);
    s.snare = { best: 120, runs: 4, dp: 300 };
    const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
    assert.deepEqual(back.snare, s.snare);
    assert.deepEqual(E.migrate({ version: 19, snare: { best: 'x', runs: -3 } }, NOW).snare, { best: 0, runs: 0, dp: 0 });
});
