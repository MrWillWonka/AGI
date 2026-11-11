'use strict';
// Snare 18.3 (the owner on the 18.1 log: after a boss, the Focus top-up and the swallowed packets bursting back made a 13K
// and a 61K run): a beaten boss melts down. It can't fight back; every slash, loop round it or ram is a meltdown hit
// that pays Signal, more each hit, a set amount per boss (the next sector's goal); then it explodes and the run ends.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

const fight = extra => P.createSnare({ seed: 5, w: 14, h: 9, antivirus: [], sweepFirst: Infinity, boss: 4, bossArrive: 0.5, bossIncoming: 2.5, bossFight: 30, bossSwallow: 1, bossFocus: 0, focus: 10, meltdown: 6, ...extra });
const stepFor = (s, secs) => { for (let i = 0; i < Math.round(secs * 60) && !s.over; i++) s.step(1 / 60); };
function slash(s) {
    const b = s.boss;
    s.setPen('wire');
    for (let i = 0; i <= 6; i++) { s.addPoint(b.x - 2 + 4 * i / 6, b.y + 0.2); if (i % 2 === 0) s.step(1 / 60); }
    s.liftPen();
    s.setPen(null);
    stepFor(s, 0.32);   // past the gap between slashes
}
function loopRound(s) {
    const b = s.boss, R = b.r + 1.2, n = 40;
    s.setPen('wire');
    for (let i = 0; i <= n + 3; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; s.addPoint(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R); }
    s.liftPen();
    s.setPen(null);
}
function beaten() {
    const s = fight();
    stepFor(s, 9);
    assert.ok(s.boss && s.fight, 'the fight is on');
    Object.assign(s.boss, { x: 7, y: 4.5, vx: 0, vy: 0, chargeAt: 999, charge: null, stunned: s.time + 99 });
    s.takeEvents();
    for (let i = 0; i < 8 && !s.bossDone; i++) slash(s);
    assert.ok(s.bossDone, 'beaten');
    return s;
}

test('a beaten boss melts down where it stands: no burst of packets, no Focus top-up, Focus holds', () => {
    const s = beaten();
    const ev = s.takeEvents();
    const down = ev.find(e => e.type === 'bossDown');
    assert.ok(down && down.meltdown === 6 && down.focus === 0);
    assert.ok(!ev.some(e => e.type === 'bossBurst'), 'what it swallowed stays gone');
    assert.ok(s.boss?.melt, 'still on the field, melting');
    assert.equal(s.packets.length, 0);
    const f = s.focus;
    stepFor(s, 2);
    assert.ok(Math.abs(s.focus - f) < 1e-9, 'Focus holds while it melts');
});

test('slashes and loops are meltdown hits (a loop is two); all twelve blow it at once, and the run ends after', () => {
    const s = beaten();
    s.takeEvents();
    slash(s);
    loopRound(s);
    const hits = s.takeEvents().filter(e => e.type === 'meltHit');
    assert.deepEqual(hits.map(e => [e.from, e.to]), [[0, 1], [1, 3]]);
    for (let i = 0; i < 20 && s.boss; i++) slash(s);
    const ev = s.takeEvents();
    const boom = ev.find(e => e.type === 'bossExplode');
    assert.ok(boom && boom.hits === 12, 'it blows at the twelfth hit');
    assert.equal(s.boss, null);
    assert.ok(!s.over, 'a beat to see it');
    stepFor(s, 1.6);
    assert.ok(s.over, 'then the run is over');
});

test('left alone it blows when its six seconds are up', () => {
    const s = beaten();
    s.takeEvents();
    stepFor(s, 6.1);
    const boom = s.takeEvents().find(e => e.type === 'bossExplode');
    assert.ok(boom && boom.hits === 0);
});

// After the 18.7 log (the owner: the jackpot paid the next sector's goal, so the sector after each boss fell first try;
// "double your money from the run"): the pool is what the run had earned when the boss was beaten.
test('the hits pay what the run had earned between them, more each hit (all of them double the run)', () => {
    const st = E.defaultState(Date.now());
    const pool = E.snareMeltPool(4000.4);
    assert.equal(pool, 4000);
    const one = E.snareMeltPay(st, pool, 0, 1), last = E.snareMeltPay(st, pool, 11, 12);
    assert.ok(last > 10 * one, 'the last hit pays far more than the first');
    let paid = 0;
    for (let k = 0; k < 12; k++) paid += E.snareMeltPay(st, pool, k, k + 1);
    assert.ok(Math.abs(paid - pool) <= 12, 'all twelve: the pool');
    assert.equal(E.snareMeltPay(st, 0, 0, 12), 0, 'a run that had earned nothing melts for nothing');
});

// The owner on the 18.7 log: a much shorter timer to start (suspense), Kernel Panic adds time (the late game's payout),
// and fewer hits on the first boss.
test('the first boss takes 20 hits in 3 s, each boss 10 more and 0.5 s more, and Kernel Panic adds 1.5 s a level', () => {
    const st = E.defaultState(Date.now());
    const at = k => { const o = E.snareOpts(st, k); return [o.meltHits, o.meltdown]; };
    assert.deepEqual(at(4), [20, 3]);
    assert.deepEqual(at(7), [30, 3.5]);
    assert.deepEqual(at(10), [40, 4]);
    st.levels.snareKernelPanic = 1;
    assert.deepEqual(at(4), [20, 4.5]);
    st.levels.snareKernelPanic = 5;
    assert.deepEqual(at(4), [20, 10.5]);
    assert.equal(E.snareOpts(st, 4).bossStun, E.snareOpts(E.defaultState(1), 4).bossStun + 1, 'its reel stays 1 s, not 1 s a level');
});

test('while it melts, slashes count far faster than in the fight (slash like crazy)', () => {
    const s = beaten();
    s.takeEvents();
    const b = s.boss;
    let hits = 0;
    for (let i = 0; i < 20; i++) {
        s.setPen('wire');
        for (let j = 0; j <= 6; j++) s.addPoint(b.x - 2 + 4 * j / 6, b.y + (i % 2 ? 0.3 : -0.3));
        s.liftPen();
        s.setPen(null);
        for (let j = 0; j < 5; j++) s.step(1 / 60);   // a twelfth of a second between swipes
        hits = s.boss?.melt?.hits ?? hits;
    }
    assert.ok(hits >= 12 || s.stats.meltHits >= 12, `12 swipes in a second and a half all count (got ${s.stats.meltHits})`);
    assert.equal(s.stats.meltOf, 12);
});
