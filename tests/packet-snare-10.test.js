'use strict';
// Packet Snare 10.3: Race Condition is a risk (a Full Scan or the boss's dash through the held loop breaks it), Broadband
// brings packets back sooner with your turrets and towers placed, Clean Sweep makes drawing free after a clean loop.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => { s.packets.push({ id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 }); };
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };
// A loop drawn round (cx, cy) and held there, the pen still down (a Race Condition).
function hold(s, cx, cy, r) {
    const n = 40;
    for (let i = 0; i <= n + 2; i++) s.addPoint(cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * r);
}

test('a held Race Condition loop grows while nothing touches it', () => {
    const s = still({ race: 1 });
    packet(s, 'good', 6, 4);
    hold(s, 6, 4, 1.2);
    run(s, 1);
    assert.ok(s.race && s.race.bonus > 0.2, 'it grows');
    assert.equal(s.stats.raceBroken, 0);
});

test('a Full Scan sweeping over a held Race Condition loop breaks it: no catch, the wire snaps', () => {
    const s = still({ race: 1, sweepFirst: 0.2, sweepEvery: 99, sweepWarn: 0.1, sweepTime: 1, threatWait: 0 });
    packet(s, 'good', 6, 4);
    hold(s, 6, 4, 1.2);
    run(s, 1.5);
    assert.equal(s.race, null);
    assert.equal(s.stats.raceBroken, 1);
    assert.equal(s.stats.catches, 0, 'nothing caught');
    assert.ok(s.stats.snaps >= 1, 'the wire snapped');
});

test('the boss dashing through a held Race Condition loop breaks it', () => {
    const s = still({ race: 1, boss: 5, bossAt: 0 });
    packet(s, 'good', 6, 4);
    run(s, 0.05);
    hold(s, 6, 4, 1.4);
    // The boss in the loop, mid-dash.
    Object.assign(s.boss, { x: 6, y: 4, vx: 0, vy: 0, charge: { t: 2, warn: 1, dx: 1, dy: 0, len: 2 } });
    s.step(1 / 60);
    assert.equal(s.stats.raceBroken, 1);
    assert.equal(s.race, null);
});

test('Broadband: caught packets come back sooner for each turret or tower placed', () => {
    const refill = placed => {
        const s = still({ respawn: 2, broadband: 0.25, turrets: 2, towers: 2 });
        for (let i = 0; i < placed; i++) s.turrets.push({ id: s.nextId++, x: 1 + i, y: 1, at: 99 });
        packet(s, 'good', 6, 4);
        const n = 40;
        for (let i = 0; i <= n + 2; i++) s.addPoint(6 + Math.cos(i / n * Math.PI * 2) * 1, 4 + Math.sin(i / n * Math.PI * 2) * 1);
        s.liftPen();
        let t = 0;
        while (s.packets.length === 0 && t < 5) { s.step(1 / 60); t += 1 / 60; }
        return t;
    };
    assert.ok(refill(2) < refill(0) * 0.75, `two turrets refill sooner (${refill(2).toFixed(2)} s against ${refill(0).toFixed(2)} s)`);
});

test('the Snare 10.3 nodes sit in their wedges and the tree keeps its rules', () => {
    const at = id => E.UPGRADE_BY_ID[id].snare;
    assert.deepEqual(at('snareBackpressure'), { x: 3, y: -1 }, 'Backpressure in Flow');
    for (const id of ['snareFloodgate', 'snareBackpressure']) assert.ok(E.UPGRADE_BY_ID[id].mechanic, `${id} is a hexagon`);
});
