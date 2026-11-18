// The ready-made starter courses (course-starters.js): each is built from parts its step of the ladder gives, keeps
// every part it lists, and can be cleared.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../course-starters.js');
const Maze = require('../maze.js'), Puck = require('../puck.js'), Rooms = require('../rooms.js');
const RULES = { maze: Maze, puck: Puck, rooms: Rooms };
const kindOf = t => String(t).replace(/\d$/, '');

test('starters: three to pick from in each kind, the first from the parts you start with, each within its step\'s parts', () => {
    for (const [kind, R] of Object.entries(RULES)) {
        const list = S.STARTERS[kind];
        assert.equal(list.length, 3, kind);
        assert.equal(list[0].needs, 0, kind);
        list.forEach((s, i) => {
            const cells = S.build(kind, i, R), placed = cells.filter(Boolean);
            assert.equal(placed.length, s.parts.length, `${kind} "${s.name}": every part it lists is kept (none on a fixed tile, none over a limit)`);
            const have = R.palette(s.needs);
            for (const t of placed) assert.ok(have.includes(kindOf(t)), `${kind} "${s.name}": ${t} at step ${s.needs}`);
            assert.ok(R.points(cells) >= 2, `${kind} "${s.name}" has something to score`);
        });
        assert.deepEqual(S.offered(kind, 0).map(s => s.index), [0], kind);
        assert.equal(S.offered(kind, 99).length, 3, kind);
    }
    assert.equal(S.build('maze', 7, Maze), null);
});

test('starters: every maze can be walked', () => {
    S.STARTERS.maze.forEach((s, i) => {
        const maze = S.build('maze', i, Maze), route = Maze.pathFrom(maze, Maze.startCell(), false);
        assert.ok(route, `"${s.name}" has a way through`);
        assert.ok(Maze.plan(maze, route).possible, `"${s.name}" can be timed`);
    });
});

test('starters: every puck course can be cleared by a steady hand, and at least one target is in reach of it', () => {
    S.STARTERS.puck.forEach((s, i) => {
        const course = S.build('puck', i, Puck), run = Puck.createRun(course);
        while (!run.state.over) { const pick = Puck.search(run.world, run.state, null, Puck.PUCK.limit); run.shoot(pick.angle, pick.power); }
        const r = Puck.result(run);
        assert.equal(r.finished, true, `"${s.name}"`);
        assert.ok(r.points >= 2, `"${s.name}": ${r.points} points`);
    });
});

test('starters: every room has a way to the flag', () => {
    S.STARTERS.rooms.forEach((s, i) => {
        const room = S.build('rooms', i, Rooms), start = Rooms.id(0, Rooms.ROOM.rows - 1);
        assert.ok(Rooms.pathFrom(room, start), `"${s.name}"`);
    });
});
