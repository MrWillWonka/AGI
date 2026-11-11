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

test('the twelve hits pay the next sector\'s goal between them, more each hit; half on a replay', () => {
    const st = E.defaultState(Date.now());
    st.snare.sector = 5;
    const pool = E.snareMeltPool(4);
    assert.equal(pool, E.snareGoal(5));
    const one = E.snareMeltPay(st, 4, false, 0, 1), last = E.snareMeltPay(st, 4, false, 11, 12);
    assert.ok(last > 10 * one, 'the last hit pays far more than the first');
    let paid = 0;
    for (let k = 0; k < 12; k++) paid += E.snareMeltPay(st, 4, false, k, k + 1);
    assert.ok(Math.abs(paid - pool) <= 12, 'all twelve: the pool');
    assert.ok(Math.abs(E.snareMeltPay(st, 4, true, 0, 12) - pool / 2) <= 1, 'a replay: half');
});
