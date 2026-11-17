// What Evals' courses give you over time (course-unlocks.js; design/evals-course.md, "The unlocks").
const test = require('node:test');
const assert = require('node:assert');
const U = require('../course-unlocks.js');
const Maze = require('../maze.js'), Puck = require('../puck.js'), Rooms = require('../rooms.js'), Rhythm = require('../rhythm.js');

const on = clears => U.clean({ on: true, clears });
const clear = (s, kind, n) => { for (let i = 0; i < n; i++) s = U.record(s, kind).state; return s; };

test('unlocks: off, everything is open and a clear changes nothing', () => {
    const s = U.blank();
    assert.deepEqual(U.openKinds(s), U.ORDER);
    for (const k of U.ORDER) assert.equal(U.level(s, k), 99);
    assert.equal(U.has(s, 'field'), true);
    assert.equal(U.record(s, 'maze').state, s);
    assert.equal(U.toNextStep(s, 'maze'), null);
});

test('unlocks: on, the kinds open one at a time in the owner\'s order, by the AI\'s clears in the newest', () => {
    assert.deepEqual(U.ORDER, ['rhythm', 'maze', 'puck', 'rooms']);
    let s = on({});
    assert.deepEqual(U.openKinds(s), ['rhythm']);
    assert.equal(U.toNextKind(s, 'rhythm'), U.UNLOCKS.nextKind);
    s = clear(s, 'rhythm', U.UNLOCKS.nextKind - 1);
    assert.deepEqual(U.openKinds(s), ['rhythm']);
    const r = U.record(s, 'rhythm');
    assert.equal(r.opened, 'maze');
    s = r.state;
    assert.deepEqual(U.openKinds(s), ['rhythm', 'maze']);
    assert.equal(U.toNextKind(s, 'rhythm'), null);
    // Clears in an older kind do not open the kind after the newest.
    s = clear(s, 'rhythm', 10);
    assert.deepEqual(U.openKinds(s), ['rhythm', 'maze']);
    s = clear(s, 'maze', U.UNLOCKS.nextKind);
    s = clear(s, 'puck', U.UNLOCKS.nextKind);
    assert.deepEqual(U.openKinds(s), U.ORDER);
    assert.equal(U.record(s, 'rooms').opened, null);
});

test('unlocks: a kind\'s parts open a step every few clears, up to the end of its ladder', () => {
    let s = on({ rhythm: 3, maze: 3 });
    assert.equal(U.level(s, 'puck'), 0);
    assert.deepEqual(Puck.palette(U.level(s, 'puck')), ['wall', 'bumper', 'target']);
    assert.equal(U.toNextStep(s, 'puck'), U.UNLOCKS.every);
    const r = clear(s, 'puck', U.UNLOCKS.every);
    assert.equal(U.level(r, 'puck'), 1);
    assert.deepEqual(Puck.palette(U.level(r, 'puck')), ['wall', 'bumper', 'target', 'mover', 'sand']);
    s = clear(s, 'puck', 100);
    assert.equal(U.level(s, 'puck'), U.UNLOCKS.steps.puck);
    assert.equal(U.toNextStep(s, 'puck'), null);
});

test('unlocks: every ladder ends with everything the kind has', () => {
    assert.deepEqual(Maze.palette(U.UNLOCKS.steps.maze), Maze.ORDER);
    assert.deepEqual(Puck.palette(U.UNLOCKS.steps.puck), Puck.ORDER);
    assert.deepEqual(Rooms.palette(U.UNLOCKS.steps.rooms), Rooms.ORDER);
    assert.equal(U.UNLOCKS.steps.rhythm, U.UNLOCKS.rhythm.length);
    // And no step is empty: each one gives a part.
    for (const [R, kind] of [[Maze, 'maze'], [Puck, 'puck'], [Rooms, 'rooms']]) for (let l = 1; l <= U.UNLOCKS.steps[kind]; l++) assert.ok(R.palette(l).length > R.palette(l - 1).length, `${kind} step ${l}`);
});

test('unlocks: the rhythm run starts with the songs as written in lanes on Easy and Medium, and opens the rest in order', () => {
    let s = on({});
    for (const id of ['hard', 'board', 'bass', 'chords', 'free', 'bars8', 'field', 'extreme', 'bars16']) assert.equal(U.has(s, id), false, id);
    assert.equal(U.has(s, 'easy'), true);
    assert.equal(U.has(s, 'medium'), true);
    const order = U.UNLOCKS.rhythm.map(x => x.id);
    order.forEach((id, i) => { s = clear(s, 'rhythm', U.UNLOCKS.every); assert.equal(U.has(s, id), true, id); if (order[i + 1]) assert.equal(U.has(s, order[i + 1]), false, order[i + 1]); });
    // The steps name things the rhythm run has.
    for (const m of Rhythm.MODES) assert.ok(['easy', 'medium'].includes(m.key) || order.includes(m.key), m.key);
    for (const n of Rhythm.BOARD.lengths) assert.ok(n === Rhythm.BOARD.length || order.includes('bars' + n), 'bars' + n);
});

test('unlocks: the switch button goes round the open kinds only', () => {
    assert.equal(U.after(on({}), 'rhythm'), null);
    const two = on({ rhythm: 3 });
    assert.equal(U.after(two, 'rhythm'), 'maze');
    assert.equal(U.after(two, 'maze'), 'rhythm');
    assert.equal(U.after(two, 'rooms'), 'rhythm', 'from a kind that is shut, back to the first');
    const off = U.blank();
    assert.deepEqual(U.ORDER.map(k => U.after(off, k)), ['maze', 'puck', 'rooms', 'rhythm']);
});

test('unlocks: a saved state is cleaned', () => {
    assert.deepEqual(U.clean(null), U.blank());
    assert.deepEqual(U.clean({ on: 'yes', clears: { maze: -4, puck: 2.9, nonsense: 5 } }), { on: false, clears: { rhythm: 0, maze: 0, puck: 2, rooms: 0 } });
});
