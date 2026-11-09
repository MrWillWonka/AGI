'use strict';
// Red on the field is dealt with by helpers you buy (the owner's calls on the 15.5 log: the nodes that kept red from
// spawning emptied the field of it by sector 4, and red changing by itself felt disconnected): Cleaner, Bouncer and Escort
// bots, Checksum and Jammer towers. Also the later goals (×2.25 from sector 5).
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

test('a Bouncer bot shoves a red packet out of the school it hides in', () => {
    const s = still({ bounceBots: 1, botSpeed: 4 });
    for (const [dx, dy] of [[0.3, 0], [-0.3, 0], [0, 0.3]]) packet(s, 'good', 6 + dx, 4 + dy);
    const red = packet(s, 'corrupt', 6, 4);
    run(s, 3);
    assert.ok(s.stats.bounced >= 1, 'shoved');
    assert.ok(s.takeEvents().some(e => e.type === 'shoved'));
    assert.ok(Math.hypot(red.x - 6, red.y - 4) > 1, 'out of the school');
});

test('an Escort bot rides the school: red near it turns regular; red far off stays red', () => {
    const s = still({ escortBots: 1, botSpeed: 3, escortTime: 1 });
    for (const [dx, dy] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) packet(s, 'good', 4 + dx, 4 + dy);
    const near = packet(s, 'corrupt', 4.1, 4.1), far = packet(s, 'corrupt', 11, 1);
    run(s, 4);
    assert.equal(near.kind, 'good');
    assert.equal(far.kind, 'corrupt');
});

test('a Checksum tower cleans red within its reach, one every few seconds, and moves to the red', () => {
    const s = still({ checkTowers: 1, checkEvery: 1, towerHop: 99 });
    Object.assign(s.bots[0], { x: 6, y: 4, ready: 0 });
    const a = packet(s, 'corrupt', 6.5, 4), b = packet(s, 'corrupt', 5.5, 4.5), far = packet(s, 'corrupt', 11.5, 0.5);
    run(s, 0.1);
    assert.equal([a, b].filter(p => p.kind === 'good').length, 1, 'one at once');
    run(s, 1.2);
    assert.ok(a.kind === 'good' && b.kind === 'good');
    assert.equal(far.kind, 'corrupt', 'out of reach');
    assert.ok(s.takeEvents().some(e => e.type === 'cleaned' && e.how === 'check' && e.from));
});

test('a Jammer tower halves the speed of Antivirus near it', () => {
    const go = jam => {
        const s = still({ jamTowers: jam, towerHop: 99, antivirus: [0], avPatrol: 1.5 });
        if (jam) Object.assign(s.bots[0], { x: 6, y: 4 });
        s.step(1 / 60);   // the Antivirus boots on the first step
        const f = s.antivirus[0];
        f.updateAt = Infinity; f.offAt = Infinity;
        Object.assign(f, { x: 5, y: 4, vx: 1.5, vy: 0 });
        run(s, 0.5);
        return { d: Math.hypot(f.x - 5, f.y - 4), jammed: f.jammed };
    };
    const slow = go(1), fast = go(0);
    assert.ok(slow.jammed && slow.d < fast.d * 0.7, `${slow.d.toFixed(2)} against ${fast.d.toFixed(2)}`);
});

test('the helpers are bought in the tree: Cleaner Bot at Intrusion\'s root, the others in their branches', () => {
    const s = E.defaultState(Date.now());
    Object.assign(s.levels, { snareCleanerBot: 2, snareBouncerBot: 1, snareEscortBot: 1, snareChecksumTowers: 3, snareJammer: 1 });
    const o = E.snareOpts(s, 3);
    assert.deepEqual([o.cleanBots, o.bounceBots, o.escortBots, o.checkTowers, o.jamTowers], [2, 1, 1, 3, 1]);
    assert.ok(E.UPGRADE_BY_ID.snareCleanerBot.cost.signal <= 50, 'the first helper is the first buy');
});

test('goals: 25, 100, 185, 400, then 1,300 at sector 6 growing ×2.25 a sector (the owner\'s calls on the pacing sweep)', () => {
    assert.deepEqual([0, 1, 2, 3].map(E.snareGoal), [25, 100, 185, 400]);
    assert.equal(E.snareGoal(4), 0, 'sector 5 is a boss');
    assert.equal(E.snareGoal(5), 1300, 'sector 6');
    assert.equal(E.snareGoal(6), 5 * Math.round(1300 * 2.25 / 5));
    assert.equal(E.snareGoal(8), 5 * Math.round(1300 * 2.25 ** 3 / 5));
    assert.equal(E.snareSectorPay(4), 1.6, '+15% a sector');
});

test('a save from before v29 gets its Packet Snare tree refunded (the red nodes reworked, the packet and red nodes folded)', () => {
    const s = E.defaultState(Date.now());
    s.levels.snareCleanerBot = 2; s.levels.snareMegasprawl = 1; s.levels.snareFocus = 1;
    s.snare.signal = 5; s.snare.earned = 900;
    const m = E.migrate(JSON.parse(JSON.stringify({ ...s, version: 28 })));
    assert.equal(m.snare.signal, 900, 'what it earned, to spend again');
    assert.ok(!Object.keys(m.levels).some(id => id.startsWith('snare')), 'every Packet Snare level cleared');
});
