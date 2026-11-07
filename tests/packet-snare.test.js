'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// A field with nothing moving and no Firewalls, packets placed by hand.
function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, firewalls: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, ...over });
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
    assert.ok(s.packets.length >= Math.round(P.SNARE.density * 160), 'a good packet per … of field, and corrupt ones');
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
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    assert.ok(f.hunting);
    assert.ok(Math.hypot(f.x - 8, f.y - 6) < d0 - 0.8, 'closer after a second');
});

test('a longer wire burns Focus faster, and an empty Focus ends the run', () => {
    const drained = len => {
        const s = P.createSnare({ seed: 1, density: 0, firewalls: [] });
        s.packets = [];
        s.addPoint(0.5, 0.5);
        for (let x = 0.5; x <= 0.5 + len; x += 0.1) s.addPoint(x, 0.5);
        const f0 = s.focus;
        for (let i = 0; i < 4; i++) s.step(0.25);   // step() takes at most a quarter second at a time
        return f0 - s.focus;
    };
    assert.ok(drained(8) > drained(2) + 1.5);
    const s = P.createSnare({ seed: 1, firewalls: [] });
    for (let i = 0; i < 1000 && !s.over; i++) s.step(0.25);
    assert.ok(s.over, 'an idle run still ends');
    assert.ok(s.takeEvents().some(e => e.type === 'end'));
    assert.equal(s.addPoint(3, 3), false);
});

test('the wire trails: past its length it drops its tail', () => {
    const s = still({ maxWire: 5, w: 16, h: 10 });
    for (let x = 0.2; x < 12; x += 0.1) s.addPoint(x, 1);
    assert.ok(P.wireLength(s.wire) <= 5 + 0.2);
});

test('one scribble can snare loop after loop', () => {
    const s = still({ w: 16, h: 10 });
    packet(s, 'good', 4, 4);
    packet(s, 'good', 10, 4);
    drawSquare(s, 4, 4, 1.2);
    assert.ok(s.drawing, 'the pen is still down after a catch');
    drawSquare(s, 10, 4, 1.2);
    assert.equal(s.stats.catches, 2);
});

// ---- Closing, the preview, and the skill tree's abilities ----

// Draw an open loop: a circle of radius r from angle 0 round to `turn` (in turns), as a pointer would.
function arc(s, cx, cy, r, turn) {
    for (let a = 0; a <= turn * Math.PI * 2 + 1e-9; a += 0.08) s.addPoint(cx + r * Math.cos(a), cy + r * Math.sin(a));
}

test('coming back near the start closes the loop without crossing it', () => {
    const s = still();
    packet(s, 'good', 5, 3.3);
    arc(s, 5, 3.3, 1.6, 0.93);      // stops short of the start, within the closing radius
    const c = s.takeEvents().find(e => e.type === 'catch');
    assert.ok(c, 'closed');
    assert.equal(c.count, 1);
});

test('the pen near its start at the beginning of a wire does not close a loop', () => {
    const s = still();
    packet(s, 'good', 5, 3.3);
    s.addPoint(5, 3.3);
    for (let i = 1; i < 6; i++) s.addPoint(5 + 0.11 * i, 3.3);
    assert.ok(!s.takeEvents().some(e => e.type === 'catch' || e.type === 'empty'));
    assert.ok(s.drawing);
});

test('lifting the pen near the start closes the loop; far away it lets the wire go', () => {
    const s = still();
    packet(s, 'good', 5, 3.3);
    arc(s, 5, 3.3, 1.6, 0.9);
    assert.ok(!s.takeEvents().some(e => e.type === 'catch'), 'still open');
    s.liftPen();
    assert.ok(s.takeEvents().some(e => e.type === 'catch'), 'closed on lift');
    packet(s, 'good', 5, 3.3);
    arc(s, 5, 3.3, 1.6, 0.5);
    s.liftPen();
    const ev = s.takeEvents();
    assert.ok(!ev.some(e => e.type === 'catch') && ev.some(e => e.type === 'release'));
});

test('the preview says what the open loop would catch, its multiplier, and a spoiling corrupt packet', () => {
    const s = still();
    packet(s, 'good', 5, 3.3);
    packet(s, 'gold', 5.3, 3.4);
    arc(s, 5, 3.3, 1.6, 0.6);
    const p = s.preview();
    assert.equal(p.good.length, 2);
    assert.equal(p.value, 1 + P.GOLD_VALUE);
    assert.ok(p.mult > 1);
    assert.ok(!p.spoiled && !p.near);
    packet(s, 'corrupt', 4.8, 3.1);
    assert.ok(s.preview().spoiled);
    arc(s, 5, 3.3, 1.6, 0.6);   // not a real continuation, but the head is far from the start either way
});

test('schools: packets of a school stay together; without schooling they drift apart', () => {
    const spread = schooling => {
        const s = P.createSnare({ seed: 11, w: 30, h: 30, density: 0.05, corruptShare: 0, firewalls: [], schooling, idleDrain: 0 });
        for (let i = 0; i < 300; i++) s.step(1 / 30);
        const bySchool = {};
        for (const p of s.packets) (bySchool[p.school] ||= []).push(p);
        let sum = 0, n = 0;
        for (const g of Object.values(bySchool)) {
            if (g.length < 2) continue;
            const cx = g.reduce((a, p) => a + p.x, 0) / g.length, cy = g.reduce((a, p) => a + p.y, 0) / g.length;
            for (const p of g) { sum += Math.hypot(p.x - cx, p.y - cy); n++; }
        }
        return sum / n;
    };
    assert.ok(spread(1) < spread(0) * 0.6, `${spread(1)} vs ${spread(0)}`);
});

test('Chain Lightning arcs from a catch to good packets nearby outside the loop, never corrupt ones', () => {
    const s = still({ chain: 2, chainRange: 2 });
    packet(s, 'good', 5, 3.3);
    packet(s, 'good', 7.3, 3.3);     // outside the loop, 2.3 from the caught one... too far
    packet(s, 'good', 6.8, 3.3);     // 1.8: in range
    packet(s, 'corrupt', 6.6, 3.6);  // in range, but corrupt
    arc(s, 5, 3.3, 1.2, 0.95);
    const c = s.takeEvents().find(e => e.type === 'catch');
    assert.equal(c.chained.length, 2 - 1 + 0, 'one in range');
    assert.equal(c.count, 2);
    assert.ok(s.packets.some(p => p.kind === 'corrupt'), 'the corrupt one is left');
});

test('the scanner tags the packets it sweeps, and a tagged packet is worth more', () => {
    const s = still({ scanner: 1, scannerSpeed: 6 });
    packet(s, 'good', 8, 3.3);
    for (let i = 0; i < 70; i++) s.step(1 / 60);
    const p = s.packets[0];
    assert.ok(p.tag > s.time, 'tagged');
    assert.equal(s.valueOf(p), P.TAG_VALUE);
    assert.ok(s.stats.tagged >= 1);
});

test('a targeted laser locks onto the richest packet and takes it', () => {
    const s = still({ laser: 1 });
    packet(s, 'good', 2, 2);
    packet(s, 'gold', 8, 5);
    for (let i = 0; i < 60 * (0.6 + P.LOCK_SECONDS + 0.1); i++) s.step(1 / 60);
    const shot = s.takeEvents().find(e => e.type === 'laser');
    assert.ok(shot, 'fired');
    assert.equal(shot.kind, 'gold');
    assert.equal(shot.units, P.GOLD_VALUE);
    assert.equal(s.stats.lasered, 1);
});

test('scrubbers forgive a corrupt packet in a loop; one more spoils it', () => {
    const s = still({ scrubbers: 1 });
    packet(s, 'good', 5, 3.3);
    packet(s, 'corrupt', 5.4, 3.2);
    arc(s, 5, 3.3, 1.6, 0.95);
    const c = s.takeEvents().find(e => e.type === 'catch');
    assert.ok(c && c.scrubbed === 1 && c.count === 1);
    s.liftPen();
    packet(s, 'good', 5, 3.3);
    packet(s, 'corrupt', 5.4, 3.2);
    packet(s, 'corrupt', 4.6, 3.4);
    arc(s, 5, 3.3, 1.6, 0.95);
    assert.ok(s.takeEvents().some(e => e.type === 'corrupt'));
});

test('a bigger field takes a bigger loop for the same multiplier', () => {
    assert.ok(P.areaMult(10, P.SNARE, 70) > P.areaMult(10, P.SNARE, 300));
    assert.ok(Math.abs(P.areaMult(10, P.SNARE, 70) - P.areaMult(10 * 300 / 70, P.SNARE, 300)) < 1e-9);
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

test('a first run is small and quick; the tree grows the field, Focus and abilities', () => {
    const s = E.defaultState(NOW);
    const o = E.snareOpts(s);
    assert.equal(o.area, 70);
    assert.equal(o.focus, 40);
    assert.deepEqual(o.firewalls, [9]);
    assert.equal(o.chain + o.scanner + o.laser + o.scrubbers, 0, 'no abilities yet');
    s.levels.snareSprawl = 2;
    s.levels.snareFocus = 1;
    s.levels.snareChain = 1;
    s.levels.snareLaser = 2;
    const g = E.snareOpts(s);
    assert.ok(g.area > 170 && g.area < 190, 'two levels of Sprawl: ×1.6²');
    assert.equal(g.firewalls.length, 2, 'a second Firewall with the sprawl');
    assert.equal(g.focus, 54);
    assert.equal(g.chain, 2);
    assert.ok(g.laser > 0 && g.laser < 4, 'faster with its second level');
    // and a run built from them is bigger, with lasers firing
    const run = P.createSnare({ ...g, seed: 3 });
    assert.ok(run.packets.length > 25);
    for (let i = 0; i < 60 * 8; i++) run.step(1 / 60);
    assert.ok(run.stats.lasered > 0);
});

test('Packet Snare\'s tree opens with the bay, grows node by node, and is bought with data', () => {
    const s = E.defaultState(NOW);
    E.evaluate(s);
    assert.ok(!E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareSprawl));
    s.unlocked['module:snare'] = true;
    E.evaluate(s);
    assert.ok(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareSprawl), 'the first ring shows');
    assert.ok(!E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareGold), 'its children wait');
    s.res.dp = 1000;
    assert.ok(E.buy(s, 'snareSprawl').ok);
    assert.equal(s.res.dp, 1000 - 60);
    E.evaluate(s);
    assert.ok(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareGold));
    for (const up of E.SNARE_TREE) {
        assert.ok(up.cost.dp > 0 && !up.cost.cp && !up.cost.xp, `${up.id} costs data`);
        if (up.requires) assert.equal(E.UPGRADE_BY_ID[up.requires].tab, 'snare', `${up.id} grows inside the tree`);
    }
});
