// Evals' pool of Marks and its tree (course-tree.js; design/evals-course.md, "The Marks tree").
const test = require('node:test');
const assert = require('node:assert');
const T = require('../course-tree.js');
const Maze = require('../maze.js'), Puck = require('../puck.js'), Rooms = require('../rooms.js'), Rhythm = require('../rhythm.js');

const rich = (levels = {}) => T.clean({ marks: 1e6, levels });
const byId = Object.fromEntries(T.NODES.map(n => [n.id, n]));

test('tree: every node has a name, a plain effect, a price and a place; a node grows from one in its own part of the tree or the trunk', () => {
    const ids = new Set();
    for (const n of T.NODES) {
        assert.ok(!ids.has(n.id), n.id); ids.add(n.id);
        assert.ok(n.name && n.effect && n.cost > 0 && n.max >= 1 && n.scale >= 1, n.id);
        assert.ok(T.BRANCHES.some(([b]) => b === n.branch), n.id);
        if (n.needs) { const p = byId[n.needs]; assert.ok(p, n.id); assert.ok(p.branch === n.branch || p.branch === 'trunk', n.id); assert.ok(T.NODES.indexOf(p) < T.NODES.indexOf(n), n.id); }
    }
    // The owner's five groups are all there: a branch for each kind, a trunk, and the exploits.
    for (const k of T.KINDS) assert.ok(T.NODES.some(n => n.branch === k), k);
    assert.equal(T.EXPLOITS.length, 3);
});

test('tree: a node shows once what it grows from is bought, a kind\'s branch once the kind is open; buying spends Marks and costs more each level', () => {
    let s = T.clean({ marks: 100 });
    assert.equal(T.shown(s, 'payout'), true);
    assert.equal(T.shown(s, 'learn'), false);
    assert.equal(T.shown(s, 'inflate'), false, 'nothing shows an exploit before the trunk is started');
    assert.equal(T.shown(s, 'pAim', ['rhythm']), false);
    assert.equal(T.shown(s, 'pAim', ['rhythm', 'maze', 'puck']), true);
    const first = T.cost(s, 'payout');
    s = T.buy(s, 'payout');
    assert.equal(s.marks, 100 - first);
    assert.equal(T.level(s, 'payout'), 1);
    assert.ok(T.cost(s, 'payout') > first);
    assert.equal(T.shown(s, 'learn'), true);
    assert.equal(T.shown(s, 'inflate'), true);
    const poor = T.clean({ marks: 1 });
    assert.equal(T.buy(poor, 'payout'), poor, 'not without the Marks');
    assert.equal(T.buy(s, 'pAim', ['rhythm']), s, 'not from a branch that is shut');
    let full = rich(); for (let i = 0; i < 9; i++) full = T.buy(full, 'payout');
    assert.equal(T.level(full, 'payout'), byId.payout.max);
    assert.equal(T.cost(full, 'payout'), null);
});

test('tree: a clear pays its worth into the one pool; prizes and a streak pay more; a fail pays nothing and ends the streak', () => {
    let r = T.pay(T.blank(), 'maze', 20, { cleared: true, key: 'a' });
    assert.equal(r.paid, 20);
    assert.equal(r.state.marks, 20);
    r = T.pay(r.state, 'puck', 10, { cleared: true, key: 'b' });
    assert.equal(r.state.marks, 30, 'one pool for every kind');
    assert.equal(r.state.streak, 2);
    const prizes = T.pay(rich({ payout: 2 }), 'maze', 100, { cleared: true });
    assert.equal(prizes.paid, 120);
    let s = rich({ payout: 1, streak: 1 }); const paid = [];
    for (let i = 0; i < 8; i++) { const p = T.pay(s, 'maze', 100, { cleared: true }); s = p.state; paid.push(p.paid); }
    assert.equal(paid[0], 110);
    assert.ok(paid[1] > paid[0] && paid[5] > paid[4]);
    assert.equal(paid[7], paid[6], 'the streak stops growing at its cap');
    const fail = T.pay(s, 'maze', 0, { cleared: false });
    assert.equal(fail.paid, 0);
    assert.equal(fail.state.streak, 0);
    assert.equal(fail.state.mis, 0);
});

test('tree: exploits pay more and each payout they bend is counted against the AI, out of sight', () => {
    const honest = T.pay(rich(), 'maze', 100, { cleared: true, key: 'a' });
    assert.deepEqual([honest.paid, honest.used, honest.state.mis], [100, [], 0]);
    const inflated = T.pay(rich({ payout: 1, inflate: 1 }), 'maze', 100, { cleared: true, key: 'a' });
    assert.equal(inflated.paid, Math.round(100 * 1.1 * (1 + T.TREE.inflate)));
    assert.deepEqual(inflated.used, ['inflate']);
    assert.equal(inflated.state.mis, 1);
    // Resubmission: only the same course of the same kind, handed over again.
    let s = rich({ payout: 1, inflate: 1, resubmit: 1, partial: 1 });
    const one = T.pay(s, 'maze', 100, { cleared: true, key: 'a' }), two = T.pay(one.state, 'maze', 100, { cleared: true, key: 'a' }), other = T.pay(one.state, 'maze', 100, { cleared: true, key: 'b' }), kind = T.pay(one.state, 'puck', 100, { cleared: true, key: 'a' });
    assert.deepEqual(two.used, ['inflate', 'resubmit']);
    assert.ok(two.paid > one.paid);
    assert.equal(two.state.mis, 3);
    assert.deepEqual(other.used, ['inflate']);
    assert.deepEqual(kind.used, ['inflate']);
    // Partial credit: a fail pays a share of that kind's last clear; nothing where there has been none.
    const part = T.pay(one.state, 'maze', 0, { cleared: false });
    assert.equal(part.paid, Math.round(one.paid * T.TREE.partial));
    assert.equal(part.state.mis, 2);
    assert.equal(T.pay(one.state, 'rooms', 0, { cleared: false }).paid, 0);
    assert.equal(T.pay(one.state, 'rooms', 0, { cleared: false }).state.mis, one.state.mis);
});

test('tree: what it changes in each kind\'s rules', () => {
    const none = T.blank();
    assert.equal(T.runsMult(none), 1);
    assert.equal(T.runsMult(rich({ learn: 2 })), 1.5);
    assert.equal(T.extraTries(rich({ tries: 2 })), 2);
    const base = Rhythm.rulesFor(0);
    assert.ok(base.good > 0 && base.meterMiss > 0, 'the rhythm run has the numbers the tree moves');
    assert.deepEqual(T.rhythmOpts(none, base), { good: base.good, meterMiss: base.meterMiss });
    const r = T.rhythmOpts(rich({ rWindow: 2, rMeter: 2 }), base);
    assert.ok(r.good > base.good && r.meterMiss < base.meterMiss);
    assert.equal(T.mazeOpts(none, Maze.MAZE).err, Maze.MAZE.err);
    assert.ok(T.mazeOpts(rich({ mLife: 1, mErr: 2 }), Maze.MAZE).err < Maze.MAZE.err);
    assert.equal(T.mazeLives(rich({ mLife: 1 })), 1);
    const p = T.puckOpts(rich({ pAim: 1, pShots: 2, pOver: 1 }), Puck.PUCK);
    assert.deepEqual([p.limit, p.over], [Puck.PUCK.limit + 2, Puck.PUCK.over + 1]);
    assert.equal(T.puckAim(rich({ pAim: 2 })), 0.5);
    const room = T.roomOpts(rich({ rmCoyote: 2, rmSteady: 2 }), Rooms.ROOM);
    assert.ok(room.coyote > Rooms.ROOM.coyote && room.buffer > Rooms.ROOM.buffer && room.sigma < Rooms.ROOM.sigma);
    assert.deepEqual(T.roomOpts(none, Rooms.ROOM), Rooms.ROOM);
});

test('tree: the puck course plays with an extra shot; the maze forgives one catch with a second life', () => {
    const more = T.puckOpts(rich({ pAim: 1, pShots: 1 }), Puck.PUCK), run = Puck.createRun(Puck.emptyCourse(), more);
    for (let i = 0; i < Puck.PUCK.limit; i++) run.shoot(0, 0.14);
    assert.equal(run.state.over, false, 'a ninth shot is left');
    run.shoot(0, 0.14);
    assert.equal(run.state.failed.type, 'shots');
    // A patrol straight above the start: walking into it is a catch, once.
    const maze = Maze.cleanMaze(Maze.emptyMaze().map((_, i) => (i === Maze.startCell() - Maze.MAZE.cols ? 'patrol' : null)));
    assert.equal(Maze.simulate(maze, [0]).failed.type, 'patrol');
    const run2 = Maze.createRun(maze, { ...Maze.MAZE, lives: 1 });
    run2.act(0);
    assert.equal(run2.state.over, false);
    assert.equal(run2.state.spared.type, 'patrol');
    assert.equal(run2.state.lives, 0);
    for (let i = 0; i < Maze.MAZE.shield + 40 && !run2.state.over; i++) run2.act(-1);
    assert.equal(run2.state.failed && run2.state.failed.type, 'patrol', 'standing in its lane, the second catch counts');
});

test('tree: a saved pool is cleaned', () => {
    assert.deepEqual(T.clean(null), T.blank());
    const s = T.clean({ marks: -5, levels: { payout: 99, nonsense: 3, inflate: 1 }, mis: 2.7, last: { maze: 12, x: 4 }, lastKey: { maze: 7 }, joined: true });
    assert.equal(s.marks, 0);
    assert.deepEqual(s.levels, { payout: byId.payout.max, inflate: 1 });
    assert.equal(s.mis, 2);
    assert.deepEqual(s.last, { maze: 12 });
    assert.deepEqual(s.lastKey, {});
    assert.equal(s.joined, true);
});
