'use strict';
// Red on the field changes (the owner's call on the 15.5 log: the nodes that kept red from spawning emptied the field of it
// by sector 4, so they act on red already swimming): Sanitizer's decay, Checksums' clean catches, Reputation Check's
// vouching schools and Spam Filter's push away from the schools. Also the later goals (×2.25 from sector 5).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, corruptShare: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, flow: 0, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => {
    const p = { id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 0, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };

test('Sanitizer: a red packet turns regular after its decay time', () => {
    const s = still({ redDecay: 2 });
    const red = packet(s, 'corrupt', 6, 4);
    run(s, 1.5);
    assert.equal(red.kind, 'corrupt', 'not yet');
    run(s, 0.7);
    assert.equal(red.kind, 'good', 'turned regular');
    assert.ok(s.takeEvents().some(e => e.type === 'cleaned' && e.how === 'decay'));
    const off = still();
    const stays = packet(off, 'corrupt', 6, 4);
    run(off, 5);
    assert.equal(stays.kind, 'corrupt', 'without it red stays red');
});

test('Checksums: a clean catch cleans the red packets just outside it, nearest first, as many as its level', () => {
    const s = still({ checksum: 1 });
    for (let i = 0; i < 4; i++) packet(s, 'good', 6 + (i % 2) * 0.3, 4 + Math.floor(i / 2) * 0.3);
    const near = packet(s, 'corrupt', 6, 6.2), far = packet(s, 'corrupt', 6, 7.5);
    s.setPen('bubble');
    for (let i = 0; i < 60; i++) { s.addPoint(6.15, 4.15); s.step(1 / 60); }
    s.liftPen(); s.setPen(null);
    s.step(1 / 60);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'catch'), 'a clean catch');
    assert.equal(near.kind, 'good', 'the nearest red beside it cleaned');
    assert.equal(far.kind, 'corrupt', 'only one at level 1');
    assert.ok(ev.some(e => e.type === 'cleaned' && e.how === 'checksum' && e.from));
});

test('Reputation Check: a red packet in a school turns regular after a while there; alone it stays red', () => {
    const s = still({ vouch: 1, vouchTime: 2 });
    const inSchool = packet(s, 'corrupt', 4, 4);
    for (const [dx, dy] of [[0.4, 0], [-0.4, 0], [0, 0.4]]) packet(s, 'good', 4 + dx, 4 + dy);
    const alone = packet(s, 'corrupt', 10, 2);
    run(s, 2.6);
    assert.equal(inSchool.kind, 'good');
    assert.equal(alone.kind, 'corrupt');
});

test('Spam Filter: red packets steer away from the schools instead of toward them', () => {
    const near = lure => {
        const s = still({ corruptLure: lure, packetSpeed: [0.6, 0.6] });
        for (const [dx, dy] of [[0, 0], [0.3, 0], [0, 0.3]]) packet(s, 'good', 6 + dx, 4 + dy);
        const red = packet(s, 'corrupt', 7.5, 4);
        red.vx = 0; red.vy = 0.6; red.v = 0.6;
        run(s, 1.5);
        return Math.hypot(red.x - 6, red.y - 4);
    };
    assert.ok(near(-0.6) > near(0.6) + 0.3, 'pushed away rather than drawn in');
    const s = E.defaultState(Date.now());
    s.levels.snareSpamFilter = 1;
    assert.ok(E.snareOpts(s, 3).corruptLure < 0, 'Spam Filter makes the lure a push');
});

test('goals grow ×2.25 a sector from sector 5 (the owner\'s call on the 15.5 log); the first four stay', () => {
    assert.deepEqual([0, 1, 2, 3].map(E.snareGoal), [25, 100, 200, 400]);
    assert.equal(E.snareGoal(5), 2025, 'sector 6');
    assert.equal(E.snareGoal(6), 5 * Math.round(400 * 2.25 ** 3 / 5));
});

test('a save from before v29 gets its Packet Snare tree refunded (the red nodes reworked, the packet and red nodes folded)', () => {
    const s = E.defaultState(Date.now());
    s.levels.snareSanitizer = 2; s.levels.snareMegasprawl = 1; s.levels.snareFocus = 1;
    s.snare.signal = 5; s.snare.earned = 900;
    const m = E.migrate(JSON.parse(JSON.stringify({ ...s, version: 28 })));
    assert.equal(m.snare.signal, 900, 'what it earned, to spend again');
    assert.ok(!Object.keys(m.levels).some(id => id.startsWith('snare')), 'every Packet Snare level cleared');
});
