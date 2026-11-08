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

test('turrets are defence: they shoot Antivirus (three hits and it\'s down until it reboots) and red packets, never good ones', () => {
    const s = still({ turrets: 1, turretEvery: 0.5, turretStun: 0.2, avShots: 3, avReboot: 2, antivirus: [0] });
    s.placeAt('turret', 5, 3);
    packet(s, 'good', 5.5, 3);
    packet(s, 'corrupt', 4.5, 3.2);
    packet(s, 'corrupt', 4.6, 2.8);
    packet(s, 'corrupt', 9, 3);
    for (let i = 0; i < 40; i++) s.step(1 / 60);
    assert.equal(s.stats.purged, 1, 'one red packet a shot');
    assert.ok(s.packets.some(p => p.kind === 'good'), 'the good packet is left alone');
    for (let i = 0; i < 40; i++) s.step(1 / 60);
    assert.equal(s.stats.purged, 2);
    assert.ok(s.packets.some(p => p.x === 9), 'the far one is out of reach');
    // an Antivirus walking into reach is shot first, and goes down at its third hit
    const f = s.antivirus[0];
    for (let i = 0; i < 200 && s.stats.avDown === 0; i++) { if (s.antivirus.includes(f)) Object.assign(f, { x: 5.8, y: 3, vx: 0, vy: 0 }); s.step(1 / 60); }
    assert.equal(s.stats.avDown, 1);
    assert.ok(!s.antivirus.includes(f));
    for (let i = 0; i < 150; i++) s.step(1 / 60);
    assert.equal(s.antivirus.length, 1, 'it reboots');
    assert.equal(s.placeAt('turret', 2, 2), null, 'one slot');
    const pur = still({ turrets: 1, turretEvery: 0.5, turretPurge: 1 });
    pur.placeAt('turret', 5, 3);
    packet(pur, 'corrupt', 4.5, 3.2);
    packet(pur, 'corrupt', 4.6, 2.8);
    for (let i = 0; i < 40; i++) pur.step(1 / 60);
    assert.equal(pur.stats.purged, 2, 'Purifier Rounds wipe two a shot');
});

test('scanner towers tag what passes their beam', () => {
    const s = still({ towers: 1, towerSpeed: 3, tagSeconds: 2 });
    s.placeAt('tower', 5, 3);
    packet(s, 'good', 6, 3.5);
    packet(s, 'good', 9.5, 6);
    for (let i = 0; i < 150; i++) s.step(1 / 60);
    assert.ok(s.packets[0].tagCool > 0, 'tagged in reach');
    assert.ok(!(s.packets[1].tagCool > 0), 'not out of reach');
    assert.equal(s.stats.tagged, 1, 'and not tagged again while its tag lasts or cools down');
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

test('a parry on a later sector boots Antivirus, never more than two alive', () => {
    const s = still({ boss: 30, bossAt: 0, bossMinions: 1, w: 12, h: 8 });
    s.step(0.1);
    for (let k = 0; k < 4; k++) {
        Object.assign(s.boss, { x: 6, y: 4, vx: 0, vy: 0, stunned: 0, chargeAt: 0, charge: null });
        s.step(1 / 60);
        const { dx, dy } = s.boss.charge;
        // across the warning line, a little ahead of it
        const mx = 6 + dx * 1.6, my = 4 + dy * 1.6;
        for (let i = 0; i <= 8; i++) s.addPoint(mx - dy * 1.2 + dy * 2.4 * i / 8, my + dx * 1.2 - dx * 2.4 * i / 8);
        s.liftPen();
    }
    assert.equal(s.stats.parries, 4);
    assert.equal(s.antivirus.length, 2, 'the minions are capped at two alive');
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

test('the boss is the wall: 3 health on the first sector, steeply more after, and its bounty is paid by the engine', () => {
    assert.equal(E.snareBossHp(0), 3);
    assert.ok(E.snareBossHp(4) >= 15 && E.snareBossHp(7) >= 30, 'later bosses take far more');
    const s = E.defaultState(NOW);
    const pay = E.snareBossDown(s, 0);
    assert.equal(pay, 6 * E.snareBossHp(0));
    assert.equal(s.snare.signal, pay);
    assert.equal(s.snare.sector, 1);
    const late = E.snareOpts({ ...s, snare: { ...s.snare, sector: E.MINION_SECTOR } });
    assert.ok(late.bossMinions > 0 && late.bossCharge < 5 && late.bossSpeed > 1 && late.bossWarn < 1.6);
    assert.equal(E.snareOpts(s, 0).bossMines, 0, 'no mines on the first sector');
    assert.equal(E.snareOpts(s, E.MINE_SECTOR).bossMines, 2, 'two from the second');
    assert.equal(E.snareOpts(s, E.NET_SECTOR).bossMines, 3, 'a ring of three from the fourth');
    s.levels.snareParry = 2; s.levels.snareRiposte = 1; s.levels.snareKernelPanic = 1;
    const o = E.snareOpts(s, 0);
    assert.equal(o.slashDamage, 3);
    assert.equal(o.parryDamage, 1);
    assert.ok(o.bossStun > E.snareOpts(E.defaultState(NOW), 0).bossStun);
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

test('the tree thins the corrupt packets, fills the field with packets and grows it to a datacentre', () => {
    const s = E.defaultState(NOW);
    const base = E.snareOpts(s);
    for (const id of ['snareChecksums', 'snareErrorCorrection', 'snareSignatures', 'snareInputValidation', 'snareSanitizer', 'snareSpamFilter', 'snareReputation']) s.levels[id] = E.UPGRADE_BY_ID[id].max;
    s.levels.snareSprawl = 3; s.levels.snareMegasprawl = 3; s.levels.snareHyperscale = 3;
    for (const id of ['snareSchools', 'snareFirehose', 'snareBroadband', 'snareTorrent', 'snarePacketStream', 'snareOpenPorts', 'snareLoadBalancer', 'snareMirrorPort', 'snareRateLimit']) s.levels[id] = E.UPGRADE_BY_ID[id].max;
    s.levels.snareFirewalls = 1;
    const o = E.snareOpts(s, E.AV_SECTOR);
    assert.ok(o.corruptShare <= E.snareOpts(E.defaultState(NOW), E.AV_SECTOR).corruptShare * 0.12, 'about a tenth of the corrupt packets');
    assert.ok(o.area > 70 * 60, 'nine Sprawl levels');
    assert.ok(o.density / base.density >= 6, `six times the packets or more (${(o.density / base.density).toFixed(2)})`);
    assert.deepEqual(o.antivirus, E.snareOpts(E.defaultState(NOW), E.AV_SECTOR).antivirus, 'the hazards come from the sector, not the field');
    assert.equal(o.firewalls, 3, 'a slot more for each tool from Megasprawl\'s and Hyperscale\'s last levels');
    assert.equal(o.decoys, 0, 'none for tools you don\'t own');
    assert.ok(E.snareOpts(s, 8).bossR > E.snareOpts(s, 0).bossR * 1.5, 'the boss grows with the sector');
    assert.ok(E.snareOpts(s, 8).bossR < E.snareOpts(s, 0).bossR * 1.7, 'half as fast as it did');
});
