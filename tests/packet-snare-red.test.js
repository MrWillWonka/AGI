'use strict';
// Red packets (the owner's calls on the Snare 16 log): the early fight, cut at spawn by the red nodes, and the Cleaner
// Bot, the one bot for red, which takes about a second to turn a red packet regular. Also the later goals.
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

test('a Cleaner bot rides a red packet for about a second, a ring filling, then turns it regular', () => {
    const s = still({ cleanBots: 1, botSpeed: 4, cleanTime: 1, cleanRest: 1 });
    const red = packet(s, 'corrupt', 7, 4);
    run(s, 0.6);   // it flies there
    assert.equal(red.kind, 'corrupt', 'not at once');
    run(s, 0.6);
    assert.ok(red.turn > 0.2 && red.kind === 'corrupt', `turning (${red.turn?.toFixed(2)})`);
    run(s, 1);
    assert.equal(red.kind, 'good', 'turned');
    assert.equal(s.stats.cleaned, 1);
    assert.ok(!red.turn, 'the ring cleared');
});

test('a Cleaner bot loses a red packet that\'s caught or spoofed from under it, and the ring clears', () => {
    const s = still({ cleanBots: 1, botSpeed: 4, cleanTime: 2 });
    const red = packet(s, 'corrupt', 7, 4);
    run(s, 1.2);
    assert.ok(red.turn > 0, 'at work');
    red.spoof = s.time + 9;
    run(s, 0.1);
    assert.ok(!red.turn, 'let go');
    assert.equal(s.bots[0].work, null);
});

test('Gold Plating: a Cleaner bot with no red near turns a regular packet gold', () => {
    const s = still({ cleanBots: 1, goldPlate: 1, goldEvery: 0.5 });
    for (let i = 0; i < 5; i++) packet(s, 'good', 6 + i * 0.2, 4);
    run(s, 2);
    assert.ok(s.stats.gilded >= 1 && s.packets.some(p => p.kind === 'gold'));
});

test('goals are Signal by goal sector: 40, 170, 600, 1,500, then growing a goal sector at a time (after the 18.7 log)', () => {
    assert.deepEqual([0, 1, 3, 4].map(E.snareGoal), [40, 170, 600, 1500]);
    assert.equal(E.snareGoal(2), 0, 'sector 3 is a boss');
    assert.equal(E.snareGoal(5), 0, 'and sector 6');
    const G = E.snareGoal(6) / 1500;
    assert.ok(G > 2 && G < 4, 'sector 7 grows from sector 5');
    // boss sectors (3, 6, 9…) take no step of the curve (Snare 18, K19): sector 10 is the third goal sector after 5
    assert.ok(Math.abs(E.snareGoal(9) / (1500 * G ** 3) - 1) < 0.01, 'sector 10');
    for (const k of [6, 9, 12]) assert.ok(E.snareGoal(k) / E.snareGoal(k - (E.isSnareBossSector(k - 1) ? 2 : 1)) < 2.5, `no jump past a boss into sector ${k + 1}`);
    // the goal counts Signal as the haul pays it: the sector's pay and Overclock
    const s = E.defaultState(Date.now());
    s.levels.snareOverclock = 3;
    assert.ok(Math.abs(E.snareOpts(s, 6).goalPay - E.snareSectorPay(6) * E.snareOverclock(s)) < 1e-12);
    assert.ok(Math.abs(E.snareSectorPay(4) - 1.6 * 0.7) < 1e-12, '+15% a sector, every catch ×0.7 (Snare 18.7)');
});

test('a save from before v30 gets its Packet Snare tree refunded (the red nodes back, the Cleaner Bot later)', () => {
    const s = E.defaultState(Date.now());
    s.levels.snareCleanerBot = 2; s.levels.snareMegasprawl = 1; s.levels.snareFocus = 1;
    s.snare.signal = 5; s.snare.earned = 900;
    const m = E.migrate(JSON.parse(JSON.stringify({ ...s, version: 29 })));
    assert.equal(m.snare.signal, 900, 'what it earned, to spend again');
    assert.ok(!Object.keys(m.levels).some(id => id.startsWith('snare')), 'every Packet Snare level cleared');
});
