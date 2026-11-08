'use strict';
// Packet Snare 13: tools place themselves and powers are pickups (the owner's call: "freeze and purge can be a tap or
// click to grab and the rest spawns so the process is automated over time").
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 16, h: 10, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => s.packets.push({ id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 });
const run = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s.step(1 / 60); };

test('tools place themselves where they help, up to their level, and move on when their time is up', () => {
    const s = still({ firewalls: 1, decoys: 1, towers: 1 });
    for (let i = 0; i < 8; i++) packet(s, 'good', 12 + (i % 3) * 0.3, 6 + Math.floor(i / 3) * 0.3);
    for (let i = 0; i < 3; i++) packet(s, 'corrupt', 3 + i * 0.3, 3);
    run(s, 5);
    assert.equal(s.walls.length, 1, 'a section');
    assert.ok(Math.abs(s.walls[0].x - 12.3) < 3 && Math.abs(s.walls[0].y - 6.2) < 3, 'where the good packets gather');
    assert.equal(s.decoys.length, 1, 'a decoy');
    assert.ok(Math.hypot(s.decoys[0].x - 3.3, s.decoys[0].y - 3) < 3, 'near the red packets');
    assert.equal(s.towers.length, 1, 'a tower by the school');
    run(s, 10);
    assert.ok(s.walls.length <= 1 && s.decoys.length <= 1 && s.towers.length <= 1, 'never more than the level');
    const first = s.decoys[0];
    run(s, 12);
    assert.ok(!s.decoys.includes(first), 'it moved on');
    assert.ok(s.stats.spawned >= 4);
});

test('nothing spawns without the node, and the old hand-placed layout is ignored', () => {
    const s = still({ layout: { zones: [[0.5, 0.5]], decoys: [[0.3, 0.3]], turrets: [], towers: [] }, firewalls: 0 });
    for (let i = 0; i < 6; i++) packet(s, 'good', 8, 5);
    run(s, 8);
    assert.equal(s.walls.length + s.decoys.length + s.turrets.length + s.towers.length, 0);
});

test('a turret arrives within reach of a hunting Antivirus', () => {
    const s = still({ turrets: 1 });
    s.antivirus.push({ id: s.nextId++, x: 3, y: 3, vx: 0, vy: 0, r: P.AV_R, on: true, stunned: 0, hp: 3, phase: 0 });
    for (let i = 0; i < 90; i++) { s.antivirus[0].x = 3; s.antivirus[0].y = 3; s.step(1 / 60); }
    run(s, 3);
    assert.equal(s.turrets.length, 1);
    assert.ok(Math.hypot(s.turrets[0].x - 3, s.turrets[0].y - 3) <= 1.7 + 0.01, 'in its reach');
});

test('freeze and purge drift in as pickups; a tap grabs one and it fires', () => {
    const s = still({ freeze: 1, purge: 1 });
    for (let i = 0; i < 4; i++) packet(s, 'corrupt', 5 + i * 0.4, 5);
    run(s, 4.5);
    const fz = s.pickups.find(pk => pk.kind === 'freeze');
    assert.ok(fz, 'a freeze pickup');
    assert.equal(s.grab(fz.x + 3, fz.y + 3), null, 'a tap elsewhere grabs nothing');
    assert.equal(s.grab(fz.x + 0.3, fz.y), 'freeze');
    assert.ok(s.frozen(), 'frozen');
    run(s, 6.5);   // the freeze stops the field's clock (the purge pickup's timer included) for its 3 s
    const pg = s.pickups.find(pk => pk.kind === 'purge');
    assert.ok(pg, 'a purge pickup, near the red packets');
    assert.ok(Math.hypot(pg.x - 5.6, pg.y - 5) < 3);
    s.grab(pg.x, pg.y);
    assert.equal(s.packets.filter(p => p.kind === 'corrupt').length, 0, 'purged');
    assert.equal(s.stats.pickups, 2);
});

test('a pickup left alone goes, and a higher level brings them sooner', () => {
    const s = still({ freeze: 1 });
    run(s, 4.5);
    assert.equal(s.pickups.length, 1);
    run(s, 8);
    assert.ok(!s.pickups.some(pk => pk.born < 5), 'the first went unclaimed');
    const count = lv => { const t = still({ freeze: lv, seed: 11 }); let n = 0; for (let i = 0; i < 60 * 120; i++) { t.step(1 / 60); for (const e of t.takeEvents()) if (e.type === 'pickupHere') n++; } return n; };
    assert.ok(count(3) > count(1) * 1.4, 'more often at level 3');
});
