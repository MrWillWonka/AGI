'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// A field with nothing moving and no Firewalls, packets placed by hand.
function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => s.packets.push({ id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 0, school: 0, tag: 0 });
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
    assert.deepEqual(a.antivirus.map(f => [f.x, f.y]), b.antivirus.map(f => [f.x, f.y]));
    const c = P.createSnare({ seed: 43, w: 16, h: 10 });
    assert.notDeepEqual(a.packets.slice(0, 3).map(p => p.x), c.packets.slice(0, 3).map(p => p.x));
});

test('packets stay on the field and the field fills to its size', () => {
    const s = P.createSnare({ seed: 3, w: 10, h: 16 });
    assert.ok(s.packets.length >= Math.round(P.SNARE.density * 160), 'a good packet per … of field, and corrupt ones');
    for (let i = 0; i < 600; i++) s.step(1 / 60);
    // (a packet on its way out may be just past the edge, within its own size, until it's gone)
    for (const p of s.packets) assert.ok(p.x >= -p.r && p.x <= s.w + p.r && p.y >= -p.r && p.y <= s.h + p.r);
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

test('an Antivirus that touches the wire snaps it, costs Focus and stops the pen for a moment', () => {
    const s = still({ antivirus: [0] });
    s.step(1 / 60);
    const f = s.antivirus[0];
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

test('Antivirus hunts the wire', () => {
    const s = still({ antivirus: [0] });
    s.step(1 / 60);
    const f = s.antivirus[0];
    f.x = 1; f.y = 1;
    s.addPoint(8, 6);
    s.addPoint(8.5, 6);
    const d0 = Math.hypot(f.x - 8, f.y - 6);
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    assert.ok(f.hunting);
    assert.ok(Math.hypot(f.x - 8, f.y - 6) < d0 - 0.8, 'closer after a second');
});

test('Focus is a clock: drawing, long or short, costs nothing more, and an empty Focus ends the run', () => {
    const drained = len => {
        const s = P.createSnare({ seed: 1, density: 0, antivirus: [] });
        s.packets = [];
        s.addPoint(0.5, 0.5);
        for (let x = 0.5; x <= 0.5 + len; x += 0.1) s.addPoint(x, 0.5);
        const f0 = s.focus;
        for (let i = 0; i < 4; i++) s.step(0.25);   // step() takes at most a quarter second at a time
        return f0 - s.focus;
    };
    assert.ok(Math.abs(drained(8) - drained(0)) < 0.01, 'a long wire costs no more than none');
    assert.ok(Math.abs(drained(0) - P.SNARE.idleDrain) < 0.01, 'a second a second');
    const s = P.createSnare({ seed: 1, antivirus: [] });
    for (let i = 0; i < 1000 && !s.over; i++) s.step(0.25);
    assert.ok(s.over, 'an idle run still ends');
    assert.ok(Math.abs(s.time - P.SNARE.focus / P.SNARE.idleDrain) < 0.3, 'after its Focus in seconds');
    assert.ok(s.takeEvents().some(e => e.type === 'end'));
    assert.equal(s.addPoint(3, 3), false);
});

test('the wire trails: past its length it drops its tail', () => {
    const s = still({ maxWire: 5, w: 16, h: 10 });
    for (let x = 0.2; x < 15; x += 0.1) s.addPoint(x, 1);
    // the length grows with the field: √(160 / 70) of 5 here
    assert.ok(P.wireLength(s.wire) <= 5 * Math.sqrt(160 / P.FIELD_AREA) + 0.2);
    assert.ok(P.wireLength(s.wire) >= 5 * Math.sqrt(160 / P.FIELD_AREA) - 0.3);
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
        const s = P.createSnare({ seed: 11, w: 30, h: 30, density: 0.05, corruptShare: 0, antivirus: [], schooling, idleDrain: 0, flow: false });
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

test('a catch pays Signal in whole numbers, more on later sectors, and no data', () => {
    const s = E.defaultState(NOW);
    const pay = E.snareCatch(s, 2.7);
    assert.equal(pay, 3);
    assert.equal(s.snare.signal, 3);
    assert.equal(s.res.dp, 0, 'the lab makes the data');
    s.snare.sector = 2;
    assert.equal(E.snareCatch(s, 4), Math.round(4 * 1.5));
    assert.equal(E.snareCatch(s, 0.1), 1, 'at least 1');
});

test('the best haul trickles research while Research is open', () => {
    const s = E.defaultState(NOW);
    s.snare.best = 120;
    assert.equal(E.derive(s).snareRp, 0, 'not before Research');
    s.unlocked['action:research'] = true;
    const d = E.derive(s);
    assert.ok(Math.abs(d.snareRp - d.rpPerResearch * 120 / E.SNARE_RP_SIGNAL) < 1e-9);
    const rp = s.res.rp;
    E.tick(s, 10);
    assert.ok(s.res.rp - rp > 9 * d.snareRp, 'paid as you play');
});

test('a sector clears by its goal or, every fifth, its boss; the Rogue AI comes three sectors in', () => {
    const s = E.defaultState(NOW);
    s.snare.runs = 30;
    assert.equal(E.snareOpts(s).boss, 0, 'no boss on the first sector');
    assert.equal(E.snareOpts(s).goal, E.snareGoal(0));
    assert.equal(E.snareOpts(s).rogue, 0);
    for (let k = 0; k < 15; k++) assert.equal(E.isSnareBossSector(k), k === 4 || k === 9 || k === 14, `sector ${k + 1}`);
    for (let k = 0; k < 15; k++) {
        const o = E.snareOpts(s, k);
        assert.ok((o.boss > 0) !== (o.goal > 0), `sector ${k + 1}: a boss or a goal, never both`);
    }
    // A goal pays its packets again at the sector's pay and moves the frontier on; a replay pays half.
    const pay = E.snareGoalMet(s, 0);
    assert.equal(pay, Math.round(E.snareGoal(0) * E.snareSectorPay(0)));
    assert.equal(s.snare.sector, 1);
    assert.equal(s.snare.bosses, 0, 'a goal isn\'t a boss');
    assert.equal(E.snareGoalMet(s, 0), Math.round(0.5 * E.snareGoal(0) * E.snareSectorPay(0)));
    assert.equal(s.snare.sector, 1, 'a replay keeps the frontier');
    while (s.snare.sector < E.ROGUE_SECTOR) {
        if (E.isSnareBossSector(s.snare.sector)) E.snareBossDown(s); else E.snareGoalMet(s);
    }
    assert.equal(s.snare.bosses, 1);
    const o = E.snareOpts(s);
    assert.equal(o.rogue, 1);
    assert.ok(o.avSpeed > 1 && o.corruptShare > P.SNARE.corruptShare, 'later sectors are harder');
    assert.ok(E.snareGoal(7) > E.snareGoal(0) && E.snareBossHealth(9) > E.snareBossHealth(4));
});

test('a run on a sector with no boss emits its goal once its packets are caught', () => {
    const r = P.createSnare({ seed: 3, goal: 3, cleanStart: true });
    r.stats.caught = 2;
    r.step(1 / 60);
    assert.ok(!r.goalDone);
    r.stats.caught = 3;
    r.step(1 / 60);
    r.step(1 / 60);
    assert.equal(r.takeEvents().filter(e => e.type === 'goal').length, 1, 'once');
    assert.ok(r.goalDone && !r.over, 'the run goes on');
    assert.equal(r.boss, null);
});

test('a run\'s haul sets the version\'s record', () => {
    const s = E.defaultState(NOW);
    assert.deepEqual(E.finishSnare(s, 50), { record: false, first: true, prev: 0 });
    assert.equal(E.finishSnare(s, 40).record, false);
    assert.equal(E.finishSnare(s, 80).record, true);
    assert.equal(s.snare.best, 80);
    assert.equal(s.snare.runs, 3);
});

test('the Data Pipeline opens with Edge Detection once the server room is open (or from the start in the playtest)', () => {
    const s = E.defaultState(NOW);
    if (E.SNARE_OPEN_AT_START) {
        E.evaluate(s);
        assert.ok(s.unlocked['module:snare'], 'open from the start');
        return;
    }
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
    assert.deepEqual(old.snare, { best: 0, runs: 0, signal: 0, earned: 0, sector: 0, bosses: 0, bestMult: 0, quarantined: 0, layout: { zones: [], decoys: [], turrets: [], towers: [] } });
    // v19 paid data: its record starts over in Signal
    assert.equal(E.migrate({ version: 19, snare: { best: 400, runs: 3, dp: 900, anchors: [] } }, NOW).snare.best, 0);
    const s = E.defaultState(NOW);
    s.snare = { best: 120, runs: 4, signal: 300, earned: 500, sector: 2, bosses: 2, bestMult: 3.2, quarantined: 1, layout: { zones: [[0.1, 0.1]], decoys: [[0.25, 0.5]], turrets: [[0.75, 0.5]], towers: [[0.5, 0.9]] } };
    const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
    assert.deepEqual(back.snare, s.snare);
    assert.deepEqual(E.migrate({ version: 21, snare: { best: 'x', runs: -3, sector: 'y', layout: { decoys: [[0.5, 2], 'x', [0.1, 0.2]], walls: [[0.1, 0.1, 0.5, 0.1]], zones: 'no' } } }, NOW).snare, { best: 0, runs: 0, signal: 0, earned: 0, sector: 0, bosses: 0, bestMult: 0, quarantined: 0, layout: { zones: [], decoys: [[0.1, 0.2]], turrets: [], towers: [] } }, 'drawn walls are dropped (Snare 11 made Firewalls sections)');
});

test('a first run is small, short and hard; the tree grows the field, Focus and abilities', () => {
    const s = E.defaultState(NOW);
    // snareOpts overrides packet-snare.js's SNARE table: that table is the one place the base numbers live
    const o = { ...P.SNARE, ...E.snareOpts(s) };
    assert.equal(o.area, P.SNARE.area);
    assert.equal(o.focus, 14, 'a first run is about 14 s');
    assert.deepEqual(o.antivirus, [], 'sector 1: only the packets');
    assert.equal(o.sweepFirst, Infinity);
    assert.equal(o.rogue, 0, 'no Rogue AI on the first runs');
    assert.equal(o.chain + o.scanner + o.laser + o.scrubbers + o.firewalls + o.decoys + o.turrets + o.towers + o.freeze + o.purge, 0, 'no abilities yet');
    s.levels.snareSprawl = 2;
    s.levels.snareFocus = 1;
    s.levels.snareChain = 1;
    s.levels.snareLaser = 2;
    const g = { ...P.SNARE, ...E.snareOpts(s) };
    assert.ok(g.area > 120 && g.area < 135, 'two levels of Sprawl: ×1.35²');
    assert.equal(g.antivirus.length, 0, 'still no Antivirus on sector 1');
    s.snare.sector = E.AV_SECTOR;
    s.snare.runs = 30;
    assert.equal(E.snareOpts(s).antivirus.length, 1, 'from its sector (the field\'s size adds none)');
    assert.equal(E.snareOpts(s, E.AV_SECTOR + 4).antivirus.length, 2, 'a second four sectors on');
    s.snare.sector = 0;
    assert.equal(g.focus, 18);
    assert.equal(g.chain, 2);
    assert.ok(g.laser > 0 && g.laser < 4, 'faster with its second level');
    // and a run built from them is bigger, with lasers firing
    const run = P.createSnare({ ...g, seed: 3 });
    assert.ok(run.packets.length > 18, `a bigger field: ${run.packets.length}`);
    for (let i = 0; i < 60 * 8; i++) run.step(1 / 60);
    assert.ok(run.stats.lasered > 0);
});

test('Packet Snare\'s tree opens with the bay, grows node by node, and is bought with Signal', () => {
    const s = E.defaultState(NOW);
    if (!E.SNARE_OPEN_AT_START) {
        E.evaluate(s);
        assert.ok(!E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareSprawl));
    }
    s.unlocked['module:snare'] = true;
    E.evaluate(s);
    assert.ok(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareSprawl), 'the first ring shows');
    assert.ok(!E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareGold), 'its children wait');
    s.snare.signal = 1000;
    assert.ok(E.buy(s, 'snareSprawl').ok);
    assert.equal(s.snare.signal, 1000 - E.UPGRADE_BY_ID.snareSprawl.cost.signal);
    E.evaluate(s);
    assert.ok(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.snareGold));
    for (const up of E.SNARE_TREE) {
        assert.ok(up.cost.signal > 0 && Object.keys(up.cost).length === 1, `${up.id} costs Signal`);
        if (up.requires) assert.equal(E.UPGRADE_BY_ID[up.requires].tab, 'snare', `${up.id} grows inside the tree`);
    }
});

// ---- The Rogue AI ----

function rogueField(over = {}) {
    // a core right away, growing fast, no corrupt packets and no Firewalls
    return still({ rogue: 1, rogueFirst: 0, rogueEvery: 1e9, rogueGrow: 4, rogueLife: 1e9, ...over });
}

test('an Infection Core spawns and its circle steals the good packets it reaches', () => {
    const s = rogueField();
    packet(s, 'good', 5, 3.3);
    s.step(1 / 60);
    const core = s.cores[0];
    assert.ok(core, 'a core');
    core.x = 5.4; core.y = 3.3;
    for (let i = 0; i < 30; i++) s.step(1 / 60);
    assert.equal(s.stats.stolen, 1);
    assert.ok(s.takeEvents().some(e => e.type === 'stolen'));
    assert.equal(s.packets.length, 0);
});

test('the Chokehold: a tight loop round a core quarantines it and pays back half of what it stole', () => {
    const s = rogueField({ rogueGrow: 0 });
    s.step(1 / 60);
    const core = s.cores[0];
    core.x = 5; core.y = 3.3; core.stole = 4;
    arc(s, 5, 3.3, 0.9, 0.95);
    const q = s.takeEvents().find(e => e.type === 'quarantine');
    assert.ok(q, 'quarantined');
    assert.equal(q.units, 2 + 0.5 * 4);
    assert.equal(s.cores.length, 0);
    assert.equal(s.stats.quarantined, 1);
});

test('a loose loop round a core does not quarantine it', () => {
    const s = rogueField({ rogueGrow: 0 });
    s.step(1 / 60);
    const core = s.cores[0];
    core.x = 5; core.y = 3.3;
    arc(s, 5, 3.3, 2.6, 0.95);   // about 21 units²: well past a tight loop on a 70 unit² field
    assert.ok(!s.takeEvents().some(e => e.type === 'quarantine'));
    assert.equal(s.cores.length, 1);
});


test('the lasso never builds a wall: walls come only from the Firewall tool', () => {
    const s = rogueField({ rogueFirst: 1e9, firewalls: 2 });
    for (let x = 2; x <= 8; x += 0.1) s.addPoint(x, 3.3);
    s.liftPen();
    assert.equal(s.walls.length, 0, 'a straight stroke is just a wire');
    assert.ok(!s.takeEvents().some(e => e.type === 'place'));
});

test('corrupt packets swim toward the schools', () => {
    const s = still({ corruptLure: 2 });
    packet(s, 'good', 5, 3.3);
    s.packets.push({ id: s.nextId++, kind: 'corrupt', x: 2.5, y: 3.3, vx: 0, vy: 1, v: 1, r: P.PACKET_R, age: 0, school: 0, tag: 0 });
    for (let i = 0; i < 90; i++) s.step(1 / 60);
    const c = s.packets.find(p => p.kind === 'corrupt');
    assert.ok(c.x > 3.3, `it headed for the school (${c.x})`);
});

// ---- Anchors and nets ----







test('a Chokehold round a core with nothing else inside is not an empty loop', () => {
    const s = still({ rogue: 1, rogueFirst: 0, rogueEvery: 1e9 });
    s.step(1 / 60);
    const c = s.cores[0];
    assert.ok(c);
    c.stole = 0;
    s.packets = [];
    drawSquare(s, c.x, c.y, 0.7);
    const ev = s.takeEvents().map(e => e.type);
    assert.ok(ev.includes('quarantine'));
    assert.ok(!ev.includes('empty'));
    assert.equal(s.stats.empty, 0);
});

test('the wire grows with the field: a loop at the multiplier cap can be drawn on every Sprawl', () => {
    for (let lv = 0; lv <= 3; lv++) {
        const area = 70 * Math.pow(1.6, lv);
        const o = { ...P.SNARE, area };
        // a circle whose area gives the cap: area = (maxMult − 1) × areaUnit × field
        const r = Math.sqrt((o.maxMult - 1) * o.areaUnit * area / Math.PI);
        assert.ok(2 * Math.PI * r < o.maxWire * Math.sqrt(area / P.FIELD_AREA), `Sprawl ${lv}: ×${o.maxMult} is drawable`);
    }
});



test('the boss Antivirus boots on time or on hand catches, and a loop round it does nothing to it', () => {
    const s = still({ boss: 2, bossAt: 0.1 });
    s.step(0.2);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'boss') && s.boss, 'it boots');
    Object.assign(s.boss, { x: 6, y: 3.5, vx: 0, vy: 0, stunned: s.time + 5, charge: null });
    drawSquare(s, 6, 3.5, 1.1);
    s.liftPen();
    assert.equal(s.boss.hp, 2, 'it is fought with flicks now, not loops');
    // or after enough catches by hand
    const u = still({ boss: 1, bossAt: 1e9, bossCatch: 1 });
    packet(u, 'good', 4, 4);
    drawSquare(u, 4, 4, 1);
    u.step(0.1);
    assert.ok(u.boss, 'boots after the catch');
    // a laser's catches don't count
    const v = still({ boss: 1, bossAt: 1e9, bossCatch: 1, laser: 0.2, laserReach: 2 });
    packet(v, 'gold', 5, 6.5);
    for (let i = 0; i < 120; i++) v.step(1 / 60);
    assert.equal(v.stats.lasered, 1);
    assert.ok(!v.boss, 'automated catches don\'t summon it');
});
test('a clean start keeps corrupt packets away from the first school', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const s = P.createSnare({ seed, cleanStart: true, flow: false });
        const first = s.packets.filter(p => p.school === s.packets[0].school);
        const cx = first.reduce((a, p) => a + p.x, 0) / first.length, cy = first.reduce((a, p) => a + p.y, 0) / first.length;
        for (const c of s.packets.filter(p => p.kind === 'corrupt')) assert.ok(Math.hypot(c.x - cx, c.y - cy) >= 2.9, `seed ${seed}`);
    }
});

test('a system Firewall flashes its edge, then sweeps across and snaps an open wire it crosses', () => {
    const s = still({ sweepFirst: 0, sweepEvery: 1e9, sweepWarn: 0.5, sweepTime: 1 });
    s.step(1 / 60);
    assert.equal(s.sweeps.length, 1);
    const sw = s.sweeps[0];
    // a wire across the whole field, both ways, so any sweep crosses it
    for (let x = 0.5; x < s.w - 0.5; x += 0.3) s.addPoint(x, 3.3);
    for (let i = 0; i < 20; i++) s.step(1 / 60);
    assert.equal(s.stats.snaps, 0, 'still warning');
    for (let i = 0; i < 70; i++) s.step(1 / 60);
    assert.equal(s.stats.snaps, 1, `swept (${sw.axis})`);
});


test('the first two runs start with a clean school', () => {
    const s = E.defaultState(NOW);
    assert.equal(E.snareOpts(s).cleanStart, true);
    s.snare.runs = 2;
    assert.equal(E.snareOpts(s).cleanStart, false);
});

// ---- The current, the Containment Field and Herders ----

test('the pipeline flows: packets leave the field downstream and new schools swim in upstream', () => {
    const s = P.createSnare({ seed: 21, antivirus: [], idleDrain: 0, corruptLure: 0 });
    const n0 = s.packets.length;
    for (let i = 0; i < 60 * 20; i++) s.step(1 / 60);
    assert.ok(s.stats.escaped > 0, 'some left');
    assert.ok(s.packets.length >= n0 * 0.6, 'the field refills');
    // the newest arrivals head with the current (into the field from upstream)
    const young = s.packets.filter(p => p.kind !== 'corrupt' && p.age < 1.5);
    assert.ok(young.length > 0);
    for (const p of young) assert.ok((p.vx * s.flow.x + p.vy * s.flow.y) / p.v > 0, 'heading downstream');
});

test('the Containment Field turns good packets back at the edges; corrupt ones still leave', () => {
    const s = P.createSnare({ seed: 21, antivirus: [], idleDrain: 0, contain: 1, corruptLure: 0, schooling: 0 });
    for (let i = 0; i < 60 * 20; i++) s.step(1 / 60);
    assert.equal(s.stats.escaped, 0, 'no good packet escaped');
    for (const p of s.packets) if (p.kind !== 'corrupt') assert.ok(p.x >= 0 && p.x <= s.w && p.y >= 0 && p.y <= s.h);
    const c = P.createSnare({ seed: 21, antivirus: [], idleDrain: 0, contain: 1, corruptLure: 0, density: 0.01, corruptShare: 3 });
    const ids = new Set(c.packets.filter(p => p.kind === 'corrupt').map(p => p.id));
    for (let i = 0; i < 60 * 30; i++) c.step(1 / 60);
    assert.ok([...ids].some(id => !c.packets.some(p => p.id === id)), 'a corrupt one left the field');
});

test('Herders round good packets up toward the middle and shoo corrupt ones away', () => {
    const spread = herders => {
        const s = P.createSnare({ seed: 5, w: 14, h: 14, density: 0.08, corruptShare: 0, antivirus: [], idleDrain: 0, contain: 1, herders, schooling: 0 });
        for (let i = 0; i < 60 * 12; i++) s.step(1 / 60);
        const g = s.packets.filter(p => p.kind !== 'corrupt');
        return g.reduce((a, p) => a + Math.hypot(p.x - 7, p.y - 7), 0) / g.length;
    };
    assert.ok(spread(3) < spread(0) * 0.8, `${spread(3)} vs ${spread(0)}`);
    const s = still({ herders: 1, herdRadius: 3 });
    s.packets.push({ id: s.nextId++, kind: 'corrupt', x: s.w / 2 + 1, y: s.h / 2, vx: 0, vy: 1, v: 1, r: P.PACKET_R, age: 0, school: 0, tag: 0 });
    for (let i = 0; i < 30; i++) s.step(1 / 60);
    const c = s.packets[0];
    assert.ok(c.vx > 0.3, 'turned away from the middle');
});

test('hazards wait for runs played too (Snare 12): a fast climber meets them one at a time', () => {
    const s = E.defaultState(NOW);
    s.snare.runs = 3;
    assert.equal(E.snareOpts(s, E.ROGUE_SECTOR).sweepFirst, Infinity, 'no scans before the 4th run, whatever the sector');
    assert.equal(E.snareOpts(s, E.ROGUE_SECTOR).antivirus.length, 0);
    s.snare.runs = E.SNARE_RUN_FLOORS.sweeps;
    assert.ok(E.snareOpts(s, E.ROGUE_SECTOR).sweepFirst < Infinity, 'scans from the 4th');
    assert.equal(E.snareOpts(s, E.ROGUE_SECTOR).antivirus.length, 0, 'Antivirus wait for the 10th');
    s.snare.runs = E.SNARE_RUN_FLOORS.antivirus;
    assert.ok(E.snareOpts(s, E.ROGUE_SECTOR).antivirus.length >= 1);
    assert.equal(E.snareOpts(s, E.ROGUE_SECTOR).rogue, 0, 'the Rogue AI waits for the 18th');
    s.snare.runs = E.SNARE_RUN_FLOORS.rogue;
    assert.ok(E.snareOpts(s, E.ROGUE_SECTOR).rogue >= 1);
});

test('the hazards arrive one sector at a time: packets, then sweeps, then Antivirus, then the Rogue AI, then minions', () => {
    const s = E.defaultState(NOW);
    s.snare.runs = 30;
    const at = k => { s.snare.sector = k; return E.snareOpts(s); };
    const o0 = at(0);
    assert.ok(o0.sweepFirst === Infinity && o0.antivirus.length === 0 && o0.rogue === 0 && o0.boss === 0 && o0.goal > 0, 'packets and a goal only');
    assert.ok(at(E.SWEEP_SECTOR).sweepFirst < Infinity && at(E.SWEEP_SECTOR).antivirus.length === 0, 'sweeps next');
    assert.ok(at(E.AV_SECTOR).antivirus.length >= 1 && at(E.AV_SECTOR).rogue === 0, 'then Antivirus');
    assert.ok(at(E.ROGUE_SECTOR).rogue >= 1 && at(E.ROGUE_SECTOR).bossMinions === 0, 'then the Rogue AI');
    assert.ok(at(E.FAST_SWEEP_SECTOR).sweepEvery < at(E.ROGUE_SECTOR).sweepEvery, 'then sweeps come twice as often');
    // The boss's own tricks are gates, much later, each with a tougher boss.
    assert.equal(at(E.MINE_SECTOR - 1).bossMines, 0);
    assert.ok(E.MINE_SECTOR > 4 && at(E.MINE_SECTOR).bossMines === 2, 'its mines are a later gate');
    assert.ok(at(E.NET_SECTOR).bossMines === 3 && at(E.MINION_SECTOR).bossMinions >= 1 && at(E.MINION_SECTOR - 1).bossMinions === 0, 'then nets, then minions');
    assert.ok(at(E.MINE_SECTOR).boss > at(E.MINE_SECTOR - 5).boss * 2, 'a gate\'s boss is much tougher');
    assert.deepEqual(E.SNARE_STAGES.map(x => x.sector), [...E.SNARE_STAGES.map(x => x.sector)].sort((a, b) => a - b));
});

test('a cleared sector tops Focus up and the run gathers on there; Go deeper takes it into the next sector', () => {
    const s = E.defaultState(NOW);
    s.snare.sector = 3;
    const r = P.createSnare({ ...E.snareOpts(s, 3), seed: 4 });
    assert.ok(r.opts.goal > 0 && !r.opts.boss);
    r.focus = r.maxFocus * 0.4;
    r.stats.caught = r.opts.goal;
    r.step(1 / 60);
    const goal = r.takeEvents().find(e => e.type === 'goal');
    assert.ok(goal && goal.focus > 0, 'the goal pays Focus');
    assert.ok(Math.abs(r.focus - r.maxFocus * (0.4 + r.opts.clearFocus)) < 1);
    for (let i = 0; i < 60; i++) r.step(1 / 60);
    assert.ok(!r.over && r.goalDone && r.opts.goal > 0, 'it stays on the cleared sector, gathering');
    const f = r.focus;
    r.nextSector(E.snareOpts(s, 4));
    const ev = r.takeEvents().find(e => e.type === 'sector');
    assert.ok(ev && ev.boss > 0, 'on to the boss sector');
    assert.equal(r.focus, f, 'going deeper adds no Focus of its own');
    assert.equal(r.opts.goal, 0);
    assert.equal(r.opts.boss, E.snareBossHealth(4));
    assert.ok(!r.goalDone && !r.bossDone && !r.over, 'the run goes on');
    // The boss boots as it would at the start of a run: bossAt seconds into the sector.
    for (let i = 0; i < 60 * (r.opts.bossAt - 1); i++) r.step(1 / 60);
    assert.equal(r.boss, null, 'not yet');
    for (let i = 0; i < 60 * 2 && !r.boss; i++) r.step(1 / 60);
    assert.ok(r.boss || r.over, 'its boss boots');
    // A sector that brings a new hazard brings it in from now.
    s.snare.runs = 30;
    const t = P.createSnare({ ...E.snareOpts(s, 1), seed: 4, idleDrain: 0 });
    t.nextSector(E.snareOpts(s, E.SWEEP_SECTOR));
    for (let i = 0; i < 60 * 12 && !t.stats.sweeps; i++) t.step(1 / 60);
    assert.ok(t.stats.sweeps >= 1, 'a Full Scan comes');
});
