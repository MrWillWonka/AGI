'use strict';
// Packet Snare 8: round 3's fixes (Freeze's clock, walls that go down, retraced wires, decoys the boss smashes, lasers
// with a reach) and the rule-breaking mechanics (flicks: Parry and Slash, Packet Spoofing; Garbage Collection, Race
// Condition, Hijack, Collusion). Snare 9's boss fight (parry and slash) is tested in packet-snare-9.test.js.
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

test('Freeze Frame stops the field\'s clock: nothing comes due or piles up while it holds (Focus at half speed)', () => {
    const s = still({ freeze: 1, freezeSeconds: 3, antivirus: [1], idleDrain: 1, focus: 30 });
    s.usePower('freeze');
    run(s, 2.5);
    assert.equal(s.time, 0, 'the field\'s clock stood still');
    assert.equal(s.antivirus.length, 0, 'the Antivirus due at 1 s hasn\'t booted');
    assert.ok(Math.abs(s.focus - 28.75) < 0.05, 'Focus ran at half speed');
    run(s, 1.6);
    assert.equal(s.antivirus.length, 1, 'it boots once the field moves again');
});

test('a Firewall section worn to nothing frees its slot', () => {
    const s = still({ firewalls: 1, zoneHp: 0.5, antivirus: [0], avOn: 99 });
    s.placeZone(6, 4);
    run(s, 0.05);
    Object.assign(s.antivirus[0], { x: 3, y: 4, vx: 2, vy: 0 });
    run(s, 2);
    assert.equal(s.stats.fwLost, 1);
    assert.equal(s.walls.length, 0);
    assert.ok(s.placeZone(2, 2), 'a new section can go down');
});

test('saved sections come back inside the field', () => {
    const s = still({ firewalls: 1, autoTools: 0, layout: { zones: [[0.99, 0.01]] } });   // the old hand-placed mode
    const f = s.walls[0];
    assert.ok(f.x + f.hw <= s.w + 1e-9 && f.y - f.hh >= -1e-9, 'kept inside');
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

test('a flick that misses something it went near is flagged; three flags set off an IDS alert that boots the boss', () => {
    const s = still({ spoof: 1, boss: 2, bossAt: 1e9, bossCatch: 1e9 });
    for (const y of [1, 3, 5]) packet(s, 'corrupt', 2.5, y + 0.6);
    flickLine(s, 1, 1, 4, 1);
    assert.equal(s.flags, 1);
    assert.ok(!s.boss);
    flickLine(s, 6, 2, 9, 2);
    assert.equal(s.flags, 1, 'a flick through empty field is just a stroke');
    flickLine(s, 1, 3, 4, 3);
    flickLine(s, 1, 5, 4, 5);
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

// Snare 18.4 (the owner's call): two loops round a stunned Antivirus turn it, and it vacuums up packets near it for you.
test('Hijack: two loops round a stunned Antivirus turn it, and it vacuums up packets for you', () => {
    const s = still({ hijack: 1, antivirus: [0], hijackSeconds: 6 });
    run(s, 0.05);
    Object.assign(s.antivirus[0], { x: 5, y: 3.5, vx: 0, vy: 0, stunned: s.time + 2 });
    circle(s, 5, 3.5, 0.9);
    assert.equal(s.stats.hijacked, 0, 'one loop is not enough');
    assert.ok(s.takeEvents().some(e => e.type === 'hijackLoop' && e.n === 1 && e.of === 2));
    circle(s, 5, 3.5, 0.9);
    assert.equal(s.stats.hijacked, 1, 'the second turns it');
    packet(s, 'good', 6.2, 3.5);
    run(s, 2);
    assert.equal(s.stats.caught, 1, 'it pulled in the packet near it');
    run(s, 5);
    assert.ok(!s.antivirus[0].ally, 'and turned back when its time was up');
});

test('Hijack: a stun lasts long enough to loop it, whatever stunned it', () => {
    const s = still({ hijack: 1, antivirus: [0] });
    run(s, 0.05);
    Object.assign(s.antivirus[0], { stunned: s.time + 0.5 });
    run(s, 1);
    assert.ok(s.antivirus[0].stunned > s.time, 'still stunned after the half second its stun had');
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
