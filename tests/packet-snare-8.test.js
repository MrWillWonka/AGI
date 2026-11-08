'use strict';
// Packet Snare 8: round 3's fixes (Freeze's clock, walls that go down, retraced wires, decoys the boss smashes, lasers
// with a reach) and the rule-breaking mechanics (flicks: Parry and Slash, Packet Spoofing; Garbage Collection, Race
// Condition, Hijack, Collusion), the boss growing with the sector, and the screen's cap on the field (`worth`).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 10, h: 7, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y, vx = 0, vy = 0) => {
    const p = { id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };
// A circle drawn point by point (closing at its start), optionally keeping the pen down.
function circle(s, cx, cy, r, lift = true) {
    const n = Math.max(24, Math.ceil(2 * Math.PI * r / 0.12));
    for (let i = 0; i <= n + 2; i++) s.addPoint(cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * r);
    if (lift) s.liftPen();
}
// A flick: a straight stroke drawn in a few frames.
function flickLine(s, x0, y0, x1, y1) {
    for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); }
    s.liftPen();
}

test('Freeze Frame stops the field\'s clock: nothing comes due or piles up while it holds', () => {
    const s = still({ freeze: 1, freezeSeconds: 3, antivirus: [1], idleDrain: 1, focus: 30 });
    s.usePower('freeze');
    run(s, 2.5);
    assert.equal(s.time, 0, 'the field\'s clock stood still');
    assert.equal(s.antivirus.length, 0, 'the Antivirus due at 1 s hasn\'t booted');
    assert.equal(s.focus, 30, 'Focus held');
    run(s, 1.6);
    assert.equal(s.antivirus.length, 1, 'it boots once the field moves again');
});

test('no boss hits while the field is frozen', () => {
    const s = still({ boss: 3, bossAt: 0, freeze: 1, w: 12, h: 12 });
    run(s, 0.1);
    Object.assign(s.boss, { x: 5, y: 3.5, vx: 0, vy: 0, chargeAt: 1e9 });
    s.usePower('freeze');
    circle(s, 5, 3.5, 1.3);
    assert.equal(s.stats.bossHits, 0);
    run(s, 3.5);
    Object.assign(s.boss, { x: 5, y: 3.5, vx: 0, vy: 0, chargeAt: 1e9 });
    circle(s, 5, 3.5, 1.3);
    assert.equal(s.stats.bossHits, 1, 'after it thaws, a loop hits');
});

test('the boss grows with the sector: a hit needs the loop round all of it', () => {
    const s = still({ boss: 3, bossAt: 0, bossR: 1.4, w: 12, h: 12 });   // a field big enough for a boss this size (it's capped at 13% of the shorter side)
    run(s, 0.1);
    Object.assign(s.boss, { x: 5, y: 3.5, vx: 0, vy: 0, chargeAt: 1e9 });
    circle(s, 5, 3.5, 0.9);
    assert.equal(s.stats.bossHits, 0, 'a loop smaller than it misses');
    Object.assign(s.boss, { x: 5, y: 3.5, vx: 0, vy: 0, stunned: 0, chargeAt: 1e9 });
    circle(s, 5, 3.5, 1.9);
    assert.equal(s.stats.bossHits, 1, 'a loop round all of it hits');
});

test('a Firewall that goes down frees its slot', () => {
    const s = still({ firewalls: 1, fwHits: 1, antivirus: [0] });
    s.placeWall({ x: 5, y: 0.5 }, { x: 5, y: 5 });
    run(s, 0.05);
    Object.assign(s.antivirus[0], { x: 4.4, y: 3, vx: 2, vy: 0 });
    run(s, 0.5);
    assert.equal(s.stats.fwLost, 1);
    assert.equal(s.walls.length, 0);
    assert.ok(s.placeWall({ x: 2, y: 1 }, { x: 2, y: 4 }), 'a new wall can go down');
});

test('saved walls are trimmed to the new field\'s longest', () => {
    const s = still({ firewalls: 1, wallLength: 2, layout: { walls: [[0.1, 0.5, 0.9, 0.5]] } });
    const f = s.walls[0];
    assert.ok(Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) <= 2 * Math.sqrt(70 / P.FIELD_AREA) + 1e-9);
});

test('a wire that only goes out and back along itself starts again at the start', () => {
    const s = still();
    for (let x = 1; x <= 6; x += 0.15) s.addPoint(x, 3);
    for (let x = 6; x >= 1; x -= 0.15) s.addPoint(x, 3.01);
    assert.ok(s.wire[0].x < 2.5 && s.wire.length < 12, `the wire restarted near the start (${s.wire.length} points)`);
});

test('the boss smashes a decoy it sits on', () => {
    const s = still({ boss: 3, bossAt: 0, decoys: 1, bossSmash: 2 });
    s.placeAt('decoy', 5, 3.5);
    run(s, 0.05);
    for (let i = 0; i < 150; i++) { Object.assign(s.boss, { x: 5, y: 3.5, vx: 0, vy: 0, chargeAt: 1e9 }); s.step(1 / 60); }
    assert.equal(s.decoys.length, 0);
    assert.equal(s.stats.decoysLost, 1);
});

test('lasers reach only part of the field; more sides reach more', () => {
    const one = still({ laser: 0.5, laserReach: 0.4 });
    packet(one, 'gold', 5, 0.5);
    run(one, 2);
    assert.equal(one.stats.lasered, 0, 'a packet by the top edge is out of the bottom emitter\'s reach');
    const two = still({ laser: 0.5, laserReach: 0.4, laserSides: 2 });
    packet(two, 'gold', 5, 0.5);
    run(two, 2);
    assert.equal(two.stats.lasered, 1, 'the top emitter takes it');
    assert.equal(two.emitterSpots().length, 2);
});

test('an Antivirus that touches a herder stuns it', () => {
    const s = still({ herders: 1, antivirus: [0] });
    run(s, 0.05);
    const hd = s.herders[0];
    Object.assign(s.antivirus[0], { x: hd.x, y: hd.y, vx: 0, vy: 0 });
    run(s, 0.05);
    assert.ok(hd.stunned > s.time);
    assert.equal(s.stats.herdStuns, 1);
});

test('a flick that hits nothing is flagged; three flags set off an IDS alert that boots the boss', () => {
    const s = still({ spoof: 1, boss: 2, bossAt: 1e9, bossCatch: 1e9 });
    flickLine(s, 1, 1, 4, 1);
    assert.equal(s.flags, 1);
    assert.ok(!s.boss);
    flickLine(s, 1, 2, 4, 2);
    flickLine(s, 1, 3, 4, 3);
    assert.equal(s.stats.ids, 1);
    assert.ok(s.boss && s.boss.enraged, 'the boss booted early, enraged');
    const slow = still({ spoof: 1 });
    for (let i = 0; i <= 30; i++) { slow.addPoint(1 + i * 0.1, 1); slow.step(1 / 60); }
    slow.liftPen();
    assert.equal(slow.flags, 0, 'a slow stroke is a wire, not a flick');
});

test('Packet Spoofing: a flick through corrupt packets makes them good, worth ×2, for a while', () => {
    const s = still({ spoof: 1 });
    const c = packet(s, 'corrupt', 3, 3);
    packet(s, 'good', 3.3, 3.3);
    flickLine(s, 2, 3, 5, 3);
    assert.equal(s.stats.spoofed, 1);
    assert.equal(s.valueOf(c), 2);
    circle(s, 3.15, 3.15, 0.9);
    assert.equal(s.stats.catches, 1, 'the spoofed packet doesn\'t spoil the loop');
    assert.equal(s.stats.corrupted, 0);
});

test('Parry: a flick across the boss\'s charge while it warns lands a hit; Slash: one through it while it reels', () => {
    const s = still({ parry: 1, boss: 4, bossAt: 0 });
    run(s, 0.05);
    Object.assign(s.boss, { x: 2, y: 3.5, vx: 0, vy: 0, chargeAt: 0 });
    s.addPoint(6, 1);
    s.addPoint(6, 1.2);
    s.step(1 / 60);
    assert.ok(s.boss.charge, 'it locked on');
    s.liftPen();
    flickLine(s, 4, 1, 4, 6);
    assert.equal(s.stats.parries, 1);
    assert.equal(s.boss.hp, 3);
    const b = s.boss;
    flickLine(s, b.x - 1.5, b.y, b.x + 1.5, b.y);
    assert.equal(s.stats.slashes, 1, 'a slash while it reels');
    assert.equal(s.boss.hp, 2);
    flickLine(s, s.boss.x - 1.5, s.boss.y, s.boss.x + 1.5, s.boss.y);
    assert.equal(s.stats.slashes, 1, 'but not a second slash on the stun from a slash');
});

test('Garbage Collection: a loop of only corrupt packets deletes them and gives Focus back', () => {
    const s = still({ gc: 1, focus: 40 });
    s.focus = 20;
    packet(s, 'corrupt', 5, 3.5);
    packet(s, 'corrupt', 5.3, 3.2);
    circle(s, 5.1, 3.4, 1);
    assert.equal(s.stats.collected, 2);
    assert.equal(s.stats.corrupted, 0);
    assert.ok(s.focus > 20);
});

test('Race Condition: a loop held open grows its multiplier and takes what swims in', () => {
    const plain = still();
    packet(plain, 'good', 5, 3.5);
    circle(plain, 5, 3.5, 1);
    const s = still({ race: 1, raceRate: 0.5 });
    packet(s, 'good', 5, 3.5);
    packet(s, 'good', 3, 3.5, 1, 0);
    circle(s, 5, 3.5, 1, false);
    assert.ok(s.race, 'the loop is held open');
    run(s, 2);
    s.liftPen();
    assert.ok(!s.race);
    assert.equal(s.stats.caught, 2, 'it took the packet that swam in');
    assert.ok(s.stats.bestMult > plain.stats.bestMult * 1.5, 'its multiplier grew');
    const bad = still({ race: 1 });
    packet(bad, 'good', 5, 3.5);
    packet(bad, 'corrupt', 3, 3.5, 1, 0);
    circle(bad, 5, 3.5, 1, false);
    run(bad, 2.5);
    assert.equal(bad.stats.corrupted, 1, 'a corrupt packet getting in spoils it');
});

test('Hijack: a loop round a stunned Antivirus turns it, and it takes packets for you', () => {
    const s = still({ hijack: 1, antivirus: [0], hijackSeconds: 6 });
    run(s, 0.05);
    Object.assign(s.antivirus[0], { x: 5, y: 3.5, vx: 0, vy: 0, stunned: s.time + 2 });
    circle(s, 5, 3.5, 0.9);
    assert.equal(s.stats.hijacked, 1);
    packet(s, 'good', 7, 3.5);
    run(s, 3);
    assert.equal(s.stats.caught, 1, 'it took the packet');
    run(s, 4);
    assert.ok(!s.antivirus[0].ally, 'and turned back when its time was up');
});

test('Collusion: a quarantined core may turn partner, collecting for you until an Antivirus breaks it', () => {
    const s = still({ rogue: 1, rogueFirst: 0, rogueEvery: 99, rogueGrow: 0.2, collude: 1, antivirus: [] });
    run(s, 0.05);
    Object.assign(s.cores[0], { x: 5, y: 3.5 });
    circle(s, 5, 3.5, 0.75);
    assert.equal(s.stats.partners, 1);
    packet(s, 'good', 5.9, 3.5);
    run(s, 1.2);
    assert.equal(s.stats.partnered, 1);
});

test('the field\'s worth: a packet on a field the screen capped is worth the difference', () => {
    const s = still({ worth: 2.5 });
    const p = packet(s, 'good', 5, 3);
    assert.equal(s.valueOf(p), 2.5);
});
