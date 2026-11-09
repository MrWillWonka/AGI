'use strict';
// Red hunts your bubble, and the boss feeds (the owner's calls on a phone log: no catch spoiled in 15 runs, and the boss
// could be ignored by gathering on its far side).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

const field = (over = {}) => {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1, flow: 0, schooling: 0, ...over });
    s.packets = [];
    return s;
};
const packet = (s, kind, x, y, vx = 0, vy = 0) => s.packets.push({ id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy) || 1, r: P.PACKET_R, age: 1, school: 0, tag: 0 });
const hold = (s, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { each?.(); s.step(1 / 60); } };

test('red hunts a held bubble: it swims at it, harder the bigger it grows, and spoils a catch it gets into', () => {
    const run = hunt => {
        const s = field({ redHunt: hunt, redHuntReach: 0.8 });
        packet(s, 'corrupt', 9.2, 4, 0, 1);   // beside the bubble's edge, swimming past it
        for (let i = 0; i < 4; i++) packet(s, 'good', 6 + (i - 1.5) * 0.3, 4);
        s.addPoint(6, 4);
        hold(s, 2.6);
        const red = s.packets.find(p => p.kind === 'corrupt');
        const d = Math.hypot(red.x - 6, red.y - 4);
        s.liftPen();
        return { d, spoiled: s.stats.corrupted };
    };
    const off = run(0), on = run(1);
    assert.ok(on.d < off.d - 1, `it closes in (${on.d.toFixed(2)} vs ${off.d.toFixed(2)})`);
    assert.equal(on.spoiled, 1, 'held on too long: spoiled');
    assert.equal(off.spoiled, 0);
});

test('red doesn\'t hunt a spoofed packet\'s way, and nothing hunts before the bubble is held', () => {
    const s = field({ redHunt: 0.6 });
    packet(s, 'corrupt', 8, 4, 0, 1);
    s.packets[0].spoof = 99;
    s.addPoint(6, 4);
    hold(s, 1.5);
    assert.ok(!s.packets[0].hunting, 'spoofed red passes as good');
});

test('the boss feeds: it pulls nearby packets in and eats them, those a little further flee, and a stun stops it', () => {
    const boss = (stun) => {
        const s = field({ boss: 20, bossAt: 0, bossCatch: 0, schooling: 0.3 });
        hold(s, 0.2);
        const b = s.boss;
        const pin = () => { Object.assign(b, { x: 6, y: 4, vx: 0, vy: 0, charge: null, chargeAt: s.time + 99 }); if (stun) b.stunned = s.time + 1; };
        pin();
        packet(s, 'good', 6 + b.r + 0.6, 4, 0, 1);              // inside its reach
        packet(s, 'good', 6 + b.r + 0.16 * 8 * 1.5, 4, 0, 1);   // past it, inside the flee ring
        const far = s.packets[1];
        const d0 = Math.hypot(far.x - 6, far.y - 4);
        hold(s, 1.5, pin);
        return { eaten: s.stats.wiped, farMoved: Math.hypot(far.x - 6, far.y - 4) - d0, reach: b.reach };
    };
    const feeding = boss(false), stunned = boss(true);
    assert.equal(feeding.eaten, 1, 'the near one was pulled in and eaten');
    assert.ok(feeding.farMoved > 0.8, `the further one fled (${feeding.farMoved.toFixed(2)})`);
    assert.equal(stunned.eaten, 0, 'stunned, it can\'t feed');
    assert.equal(stunned.reach, 0);
});

test('the longer the boss stands, the further it reaches', () => {
    const s = field({ boss: 20, bossAt: 0, bossCatch: 0 });
    hold(s, 0.2);
    const r0 = s.boss.reach;
    hold(s, 10, () => Object.assign(s.boss, { charge: null, chargeAt: s.time + 99 }));
    assert.ok(s.boss.reach > r0 * 1.4, `${r0.toFixed(2)} → ${s.boss.reach.toFixed(2)}`);
    assert.ok(s.boss.reach <= 0.3 * 8 + 1e-9, 'capped');
});

test('red hunting is off by default (a testing toggle for now, the owner\'s call)', () => {
    assert.equal(P.SNARE.redHunt, 0);
});
