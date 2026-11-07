'use strict';
// Packet Snare 7's placeables and powers: your drawn Firewalls, decoys, turrets, scanner towers, freeze and purge.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;
function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y, vx = 0, vy = 0) => s.packets.push({ id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 });
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

test('your Firewalls are walls you draw: corrupt packets bounce off them, good ones pass', () => {
    const s = still({ firewalls: 2, w: 10, h: 7 });
    assert.ok(s.placeWall({ x: 5, y: 0.5 }, { x: 5, y: 6.5 }), 'a wall goes down');
    assert.equal(s.placeWall({ x: 1, y: 1 }, { x: 1.2, y: 1 }), null, 'too short to count');
    packet(s, 'good', 4, 3, 1, 0);
    packet(s, 'corrupt', 4, 4, 1, 0);
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    assert.ok(s.packets.find(p => p.kind === 'good').x > 5, 'the good packet went through');
    assert.ok(s.packets.find(p => p.kind === 'corrupt').x < 5, 'the corrupt one bounced back');
    const t = still({ firewalls: 1, wallLength: 3 });
    const wl = t.placeWall({ x: 1, y: 1 }, { x: 9, y: 1 });
    assert.ok(Math.abs(Math.hypot(wl.b.x - wl.a.x, wl.b.y - wl.a.y) - 3 * Math.sqrt(t.w * t.h / P.FIELD_AREA)) < 1e-9, 'trimmed to its longest');
    assert.equal(t.placeWall({ x: 1, y: 3 }, { x: 4, y: 3 }), null, 'no slot left');
    assert.ok(t.removeAt('wall', 2, 1.1, 0.3), 'a tap on it takes it back');
    assert.equal(t.walls.length, 0);
});

test('a wall stuns an Antivirus once per approach and takes a hit; at its last hit it goes down', () => {
    const s = still({ firewalls: 1, antivirus: [0], fwHits: 2, avStun: 3 });
    s.placeWall({ x: 5, y: 0.5 }, { x: 5, y: 6.1 });
    s.step(1 / 60);
    const v = s.antivirus[0];
    Object.assign(v, { x: 5.2, y: 3.3, vx: 0, vy: 0 });
    // a wire to hunt, beyond the wall, keeps it coming back
    const stuns = [];
    let farthest = 0;
    for (let t = 0; t < 14; t += 1 / 60) {
        s.step(1 / 60);
        for (const e of s.takeEvents()) if (e.type === 'stun') stuns.push({ t, far: farthest, down: e.down });
        farthest = Math.max(farthest, Math.abs(v.x - 5));
        if (!s.drawing && t > 0.5) { s.addPoint(2, 3.3); s.addPoint(2.2, 3.4); }
    }
    assert.ok(stuns.length >= 2, 'it comes back for another try');
    assert.ok(stuns[1].t - stuns[0].t > 3.3, 'not the moment its stun ends');
    assert.ok(stuns[1].far > 0.45 * 2.5, 'only after it got clear of the line');
    assert.ok(stuns[1].down && s.wallsUp().length === 0, 'two hits and the wall is down');
    const t = still({ firewalls: 1, antivirus: [0], avStun: 5 });
    t.placeWall({ x: 5, y: 0.5 }, { x: 5, y: 6.1 });
    t.step(1 / 60);
    Object.assign(t.antivirus[0], { x: 5.1, y: 3.3, vx: 0, vy: 0 });
    t.step(1 / 60);
    t.addPoint(4.5, 3.3); t.addPoint(5.6, 3.3);
    t.step(1 / 60);
    assert.equal(t.stats.snaps, 0, 'stunned, it can\'t snap the wire');
});

test('wire drawn along your Firewalls is free', () => {
    const s = still({ firewalls: 1, drawBase: 0, drawDrain: 1, w: 10, h: 7 });
    s.placeWall({ x: 2, y: 2 }, { x: 8, y: 2 });
    for (let x = 2.5; x < 6; x += 0.1) s.addPoint(x, 2.1);
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    assert.ok(s.maxFocus - s.focus < 0.2);
    const t = still({ firewalls: 1, drawBase: 0, drawDrain: 1, w: 10, h: 7 });
    t.placeWall({ x: 2, y: 2 }, { x: 8, y: 2 });
    for (let x = 2.5; x < 6; x += 0.1) t.addPoint(x, 4);
    for (let i = 0; i < 60; i++) t.step(1 / 60);
    assert.ok(t.maxFocus - t.focus > 2);
});

test('your Firewalls shield packets from a core', () => {
    const s = still({ firewalls: 1, rogue: 1, rogueFirst: 0, rogueEvery: 1e9, rogueGrow: 50, w: 10, h: 7 });
    s.placeWall({ x: 5, y: 0.2 }, { x: 5, y: 6.8 });
    packet(s, 'good', 6, 3.5);
    s.step(1 / 60);
    Object.assign(s.cores[0], { x: 4, y: 3.5 });
    for (let i = 0; i < 30; i++) s.step(1 / 60);
    assert.equal(s.stats.stolen, 0);
});

test('decoys draw corrupt packets and idle Antivirus, and an Antivirus breaks the one it reaches', () => {
    const s = still({ decoys: 1, corruptLure: 5, antivirus: [0], w: 10, h: 7 });
    s.placeAt('decoy', 8, 3.5);
    packet(s, 'corrupt', 5.5, 3.5, 0, 1);
    s.step(0.2);
    assert.ok(s.packets[0].vx > 0.3, 'swims for the decoy');
    for (let i = 0; i < 60 * 15 && s.decoys.length; i++) s.step(1 / 60);
    assert.equal(s.decoys.length, 0, 'the Antivirus went for it and broke it');
    assert.equal(s.stats.decoysLost, 1);
});

test('turrets pick off good packets in reach; Purifier rounds wipe a corrupt one too', () => {
    const s = still({ turrets: 1, turretEvery: 0.5, turretPurge: 1 });
    s.placeAt('turret', 5, 3);
    packet(s, 'good', 5.5, 3);
    packet(s, 'corrupt', 4.5, 3);
    packet(s, 'good', 9, 3);
    for (let i = 0; i < 40; i++) s.step(1 / 60);
    assert.equal(s.stats.turreted, 1);
    assert.equal(s.stats.purged, 1);
    assert.equal(s.packets.length, 1, 'the far one is out of reach');
    assert.equal(s.placeAt('turret', 2, 2), null, 'one slot');
});

test('scanner towers tag what passes their beam', () => {
    const s = still({ towers: 1, towerSpeed: 3, tagSeconds: 2 });
    s.placeAt('tower', 5, 3);
    packet(s, 'good', 6, 3.5);
    packet(s, 'good', 9.5, 6);
    for (let i = 0; i < 150; i++) s.step(1 / 60);
    assert.ok(s.packets[0].tag > s.time, 'tagged in reach');
    assert.ok(!(s.packets[1].tag > s.time), 'not out of reach');
});

test('freeze stops the field and Focus while you draw; purge wipes the corrupt packets', () => {
    const s = still({ freeze: 1, purge: 1, freezeSeconds: 2, idleDrain: 1 });
    packet(s, 'good', 3, 3, 1, 0);
    packet(s, 'corrupt', 6, 3);
    assert.ok(s.usePower('freeze'));
    const f0 = s.focus;
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    assert.equal(s.packets[0].x, 3, 'nothing moves');
    assert.equal(s.focus, f0, 'Focus holds');
    assert.ok(!s.usePower('freeze'), 'one charge');
    assert.ok(s.usePower('purge'));
    assert.equal(s.packets.filter(p => p.kind === 'corrupt').length, 0);
    assert.equal(s.stats.purged, 1);
});

test('what you place carries over to the next run, as far as its slots go', () => {
    const s = still({ firewalls: 2, decoys: 1, turrets: 1, towers: 1 });
    s.placeWall({ x: 2, y: 2 }, { x: 6, y: 2 });
    s.placeAt('decoy', 3, 4); s.placeAt('turret', 5, 4); s.placeAt('tower', 7, 3);
    s.stop();
    const end = s.takeEvents().find(e => e.type === 'end');
    const next = still({ firewalls: 2, decoys: 1, turrets: 1, towers: 0, layout: end.layout });
    assert.equal(next.walls.length, 1);
    assert.equal(next.decoys.length, 1);
    assert.equal(next.turrets.length, 1);
    assert.equal(next.towers.length, 0);
    const st = E.defaultState(NOW);
    E.finishSnare(st, 10, end.layout);
    assert.equal(st.snare.layout.walls.length, 1);
    assert.deepEqual(E.snareOpts(st).layout, st.snare.layout);
});

test('the boss boots Antivirus when it is hit (later sectors)', () => {
    const s = still({ boss: 3, bossAt: 0, bossMinions: 1 });
    s.step(0.1);
    Object.assign(s.boss, { x: 6, y: 3.5, vx: 0, vy: 0, stunned: 99 });
    drawSquare(s, 6, 3.5, 1.1);
    s.liftPen();
    assert.equal(s.boss.hp, 2);
    assert.equal(s.antivirus.length, 1);
});

test('a sweep snaps a fast stroke whose segment straddles its line', () => {
    const s = still({ sweepFirst: 0, sweepEvery: 1e9, sweepWarn: 0, sweepTime: 2 });
    s.step(1 / 60);
    const sw = s.sweeps[0];
    const mid = (sw.axis === 'x' ? s.w : s.h) / 2;
    // two points far either side of the middle, joined by one long segment
    if (sw.axis === 'x') { s.addPoint(mid - 3, 2); s.addPoint(mid + 3, 2.5); } else { s.addPoint(2, mid - 2.5); s.addPoint(2.5, mid + 2.5); }
    for (let i = 0; i < 120 && !s.stats.snaps; i++) s.step(1 / 60);
    assert.equal(s.stats.snaps, 1);
});

test('the boss is the wall: one hit on the first sector, steeply more after, and its bounty is paid by the engine', () => {
    assert.equal(E.snareBossHits(0), 1);
    assert.ok(E.snareBossHits(4) >= 8 && E.snareBossHits(7) >= 18, 'later bosses take far more');
    const s = E.defaultState(NOW);
    const pay = E.snareBossDown(s, 0);
    assert.equal(pay, 10 * E.snareBossHits(0));
    assert.equal(s.snare.signal, pay);
    assert.equal(s.snare.sector, 1);
    const late = E.snareOpts({ ...s, snare: { ...s.snare, sector: 5 } });
    assert.ok(late.bossMinions > 0 && late.bossCharge < 5 && late.bossSpeed > 1);
});

test('the research trickle is capped, and Overclock raises every catch', () => {
    const s = E.defaultState(NOW);
    s.unlocked['action:research'] = true;
    s.snare.best = 10_000;
    const d = E.derive(s);
    assert.ok(Math.abs(d.snareRp - d.rpPerResearch * E.SNARE_RP_CAP / E.SNARE_RP_SIGNAL) < 1e-9);
    s.levels.snareOverclock = 3;
    assert.equal(E.snareCatch(s, 10), 13);
});

test('the tree thins the corrupt packets and grows the field to a datacentre', () => {
    const s = E.defaultState(NOW);
    const base = E.snareOpts(s);
    s.levels.snareChecksums = 3;
    s.levels.snareSprawl = 3; s.levels.snareMegasprawl = 3; s.levels.snareHyperscale = 3;
    const o = E.snareOpts(s);
    assert.ok(o.corruptShare < base.corruptShare * 0.5);
    assert.ok(o.area > 70 * 60, 'nine Sprawl levels');
    assert.ok(o.antivirus.length >= 5, 'and the hazards grow with it');
});
