// The ring: compute buys a Packet Snare run's clock (engine.js `snareClock`, `snarePayClock`), and a run counts the
// packets The Feed's bad sand is made of. Build 1 of design/ring-build.md.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const Model = require('../tools/ring-model.js');
const PacketSnare = require('../packet-snare.js');
const NOW = 1_700_000_000_000;
// A game that has played its first (free) run, holding `cp` compute.
const game = cp => { const s = E.defaultState(NOW); s.snare.runs = 1; s.res.cp = cp; return s; };
const ring = fn => { E.setRing(true); try { fn(); } finally { E.setRing(false); } };

test('the clock\'s price starts at the ring model\'s numbers', () => {
    assert.equal(E.RING_CLOCK, Model.DEFAULTS.q);
    assert.equal(E.RING_CLOCK_GROWTH, Model.DEFAULTS.qGrow);
});

test('with the ring off every run is free, whatever you hold', () => {
    const s = game(0);
    assert.deepEqual(E.snareClock(s, 4, 12), { free: true, perSecond: 10 * 1.6 ** 4, price: 0, cost: 0, seconds: 12, full: true, ok: true });
    assert.ok(E.snarePayClock(s, 4, 12).free);
    assert.equal(s.res.cp, 0);
});

test('under the ring a run costs 10 compute a second on sector 1, and 1.6 times more each sector', () => ring(() => {
    const s = game(1000);
    assert.deepEqual(E.snareClock(s, 0, 10), { free: false, perSecond: 10, price: 100, cost: 100, seconds: 10, full: true, ok: true });
    assert.equal(E.snareClock(s, 1, 10).price, 160);
    assert.equal(E.snareClock(s, 2, 12.5).price, Math.ceil(12.5 * 25.6));
    const paid = E.snarePayClock(s, 0, 10);
    assert.equal(paid.seconds, 10);
    assert.equal(s.res.cp, 900);
}));

test('short of the price, you play the seconds you can afford, and pay for those', () => ring(() => {
    const s = game(64);
    const c = E.snareClock(s, 0, 10);
    assert.deepEqual([c.seconds, c.cost, c.full, c.ok], [6, 60, false, true]);
    assert.equal(E.snarePayClock(s, 0, 10).seconds, 6);
    assert.equal(s.res.cp, 4);
}));

test('under three seconds\' worth there is no run, and nothing is taken', () => ring(() => {
    const s = game(29);
    assert.equal(E.snareClock(s, 0, 10).ok, false);
    assert.equal(E.snarePayClock(s, 0, 10), null);
    assert.equal(s.res.cp, 29);
    s.res.cp = 30;
    assert.equal(E.snarePayClock(s, 0, 10).seconds, 3);
    assert.equal(s.res.cp, 0);
}));

test('the first run ever is free under the ring too', () => ring(() => {
    const s = E.defaultState(NOW);
    assert.equal(s.snare.runs, 0);
    const c = E.snarePayClock(s, 0, 10);
    assert.deepEqual([c.free, c.seconds, c.cost], [true, 10, 0]);
    assert.equal(s.res.cp, 0);
}));

// A still field with packets placed by hand (as tests/packet-snare-bubble.test.js does).
function still() {
    const s = PacketSnare.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, bubble: 1 });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y) => s.packets.push({ id: s.nextId++, kind, x, y, vx: 0, vy: 0, v: 0, r: PacketSnare.PACKET_R, age: 1, school: 0, tag: 0 });
const hold = (s, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) s.step(1 / 60); };

test('a run counts the packets a garbled catch held, for The Feed\'s bad sand; a clean catch counts none', () => {
    const run = PacketSnare.createSnare({ seed: 3 });
    assert.equal(run.stats.garbledPackets, 0);
    assert.equal(run.stats.poppedPackets, 0);
    const bad = still();
    for (let i = 0; i < 3; i++) packet(bad, 'good', 6 + (i - 1) * 0.3, 4);
    packet(bad, 'corrupt', 6.2, 4.2);
    bad.addPoint(6, 4);
    hold(bad, 1.5);
    bad.liftPen();
    assert.equal(bad.stats.corrupted, 1);
    assert.equal(bad.stats.caught, 0);
    assert.equal(bad.stats.garbledPackets, 4, 'the three good packets and the unreadable one');
    const clean = still();
    for (let i = 0; i < 3; i++) packet(clean, 'good', 6 + (i - 1) * 0.3, 4);
    clean.addPoint(6, 4);
    hold(clean, 1.5);
    clean.liftPen();
    assert.equal(clean.stats.caught, 3);
    assert.equal(clean.stats.garbledPackets, 0);
    assert.equal(clean.stats.poppedPackets, 0);
});
