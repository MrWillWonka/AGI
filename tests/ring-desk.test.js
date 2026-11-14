// The ring's desk (engine.js, under `setRing`): four things, the lab without Collect Data and Research, Packet Snare
// first, training sealed. Build 1 of design/ring-build.md. With the ring off, nothing here changes.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const NOW = 1_700_000_000_000;
const ring = fn => { E.setRing(true); try { fn(); } finally { E.setRing(false); } };
const keys = changes => changes.milestones.map(m => m.key);
const keyboard = E.UPGRADES.find(u => u.id === 'keyboard');
const cpu = E.UPGRADES.find(u => u.id === 'cpu');

test('the desk is four things under the ring and five without it', () => {
    assert.equal(E.deskLevels(), 5);
    ring(() => assert.equal(E.deskLevels(), 4));
    const s = E.defaultState(NOW);
    s.levels.keyboard = 4;
    assert.equal(E.deskDone(s), false);
    ring(() => assert.equal(E.deskDone(s), true));
});

test('under the ring the desk stops at the monitor: the server waits for the first boss', () => ring(() => {
    const s = E.defaultState(NOW);
    assert.equal(E.capacity(s, keyboard), 4);
    s.levels.keyboard = 4;
    assert.equal(E.atCapacity(s, keyboard), true);
}));

test('the finished desk puts Packet Snare online, and not before', () => ring(() => {
    const s = E.defaultState(NOW);
    s.levels.keyboard = 3;
    assert.ok(!keys(E.evaluate(s)).includes('module:snare'));
    assert.ok(!s.unlocked['module:snare']);
    s.levels.keyboard = 4;
    const changes = E.evaluate(s);
    assert.ok(keys(changes).includes('module:snare'));
    assert.deepEqual(changes.milestones.find(m => m.key === 'module:snare').ringCallout[0], 'System');
}));

test('under the ring the lab never offers Collect Data or Research, and training stays sealed', () => ring(() => {
    const s = E.defaultState(NOW);
    // Everything that opens them in today's game.
    Object.assign(s.stats, { collects: 60, runCp: 5000, runDp: 500, skilledSprints: 200, researchDone: 3, rolls: 9 });
    s.res.dp = 300; s.res.cp = 5000; s.levels.keyboard = 4; s.levels.cpu = 20;
    E.evaluate(s);
    for (const key of ['action:collect', 'action:research', 'module:path']) assert.ok(!s.unlocked[key], key);
    assert.ok(s.unlocked['module:snare']);
}));

test('hardware can be bought once the four-thing desk is done and you have computed by hand', () => ring(() => {
    const s = E.defaultState(NOW);
    s.stats.clicks = 40; s.levels.keyboard = 3;
    assert.equal(cpu.unlock(s), false);
    s.levels.keyboard = 4;
    assert.equal(cpu.unlock(s), true);
}));

test('research shows on the supply line once The Feed has paid any', () => ring(() => {
    const s = E.defaultState(NOW);
    assert.ok(!E.evaluate(s).reveals.some(r => r.key === 'seen:rp'));
    s.res.rp = 2;
    assert.ok(E.evaluate(s).reveals.some(r => r.key === 'seen:rp'));
    assert.ok(!s.unlocked['action:research']);
}));

test('with the ring off the old gates stand: the desk is five, and the hand actions open as they did', () => {
    const s = E.defaultState(NOW);
    assert.ok(E.capacity(s, keyboard) > 4);
    s.stats.clicks = 40; s.levels.keyboard = 4;
    assert.equal(cpu.unlock(s), false);
    s.levels.keyboard = 5;
    assert.equal(cpu.unlock(s), true);
    s.res.dp = 5;
    E.evaluate(s);
    assert.ok(s.unlocked['action:collect']);
    assert.ok(!E.evaluate(s).reveals.some(r => r.key === 'seen:rp'));
});
