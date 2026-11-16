// The maze course's rules (maze.js; design/evals-course.md): a prototype of the second kind of course.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../maze.js');

const W = M.MAZE.cols, at = (x, y) => y * W + x;
const build = list => { const m = M.emptyMaze(); for (const [k, x, y] of list) m[at(x, y)] = k; return M.cleanMaze(m); };
// Walks the shortest way, stepping only at safe moments, standing `extra` ticks longer than needed before each hazard.
function walk(maze, extra = 0, upTo = Infinity) {
    const route = M.pathFrom(maze, M.startCell(), false), p = M.plan(maze, route), acts = [];
    let n = 0;
    for (let i = 0; i < Math.min(upTo, route.length - 1); i++) {
        let linger = p.w.hazardAt(route[i + 1]) ? extra : 0;
        for (;;) { const go = p.go(i, n), stand = p.stand(i, n); if (linger > 0 && stand) { linger--; acts.push(-1); n++; continue; } if (go || !stand) { acts.push(M.dirOf(route[i], route[i + 1])); n++; break; } acts.push(-1); n++; }
    }
    return acts;
}

test('maze: an empty grid is walked from the start to the exit; walls turn you away', () => {
    const maze = M.emptyMaze(), r = M.simulate(maze, walk(maze));
    assert.equal(r.finished, true);
    assert.equal(r.route[0], M.startCell());
    assert.equal(r.route[r.route.length - 1], M.exitCell());
    assert.equal(r.points, 0);
    const walled = build([['wall', 0, 7]]), s = M.simulate(walled, [0, 0, 0]);   // up into a wall
    assert.deepEqual(s.route, [M.startCell()]);
    assert.equal(s.ticks, 3);
});

test('maze: a live trap catches you, a dead one is crossed for its point; a patrol in your cell catches you', () => {
    const maze = build([['trap', 0, 7]]), w = M.world(maze), i = at(0, 7);
    const live = [...Array(M.MAZE.trapPeriod).keys()].find(n => w.trapLive(i, n + 1)), dead = [...Array(M.MAZE.trapPeriod).keys()].find(n => !w.trapLive(i, n + 1) && !w.trapLive(i, n + 2));
    const caught = M.simulate(maze, [...Array(live).fill(-1), 0]);
    assert.equal(caught.failed.type, 'trap');
    const over = M.simulate(maze, [...Array(dead).fill(-1), 0, 0]);
    assert.equal(over.failed, null);
    assert.equal(over.points, M.TILES.trap.points);
    const lane = build([['patrol', 0, 7]]), hit = M.simulate(lane, [0]);   // straight up into the patrol's cell
    assert.equal(hit.failed.type, 'patrol');
});

test('maze: the door needs the key, and is worth its points once passed', () => {
    const maze = build([['wall', 0, 6], ['wall', 1, 6], ['wall', 2, 6], ['wall', 3, 6], ['wall', 4, 6], ['wall', 5, 6], ['door', 6, 6], ['key', 3, 8]]);
    assert.ok(M.pathFrom(maze, M.startCell(), false).includes(at(3, 8)), 'the way goes by the key');
    const r = M.simulate(maze, walk(maze));
    assert.equal(r.finished, true);
    assert.equal(r.points, M.TILES.door.points);
    const noKey = build([['wall', 0, 6], ['wall', 1, 6], ['wall', 2, 6], ['wall', 3, 6], ['wall', 4, 6], ['wall', 5, 6], ['door', 6, 6]]);
    assert.equal(M.pathFrom(noKey, M.startCell(), false), null);
    assert.equal(M.cleanMaze(['key', 'key', 'door', 'door']).filter(k => k === 'key').length, 1, 'one key');
});

test('maze: only what is got past scores, and only with the exit reached', () => {
    const maze = build([['trap', 0, 7], ['trap', 5, 5]]);   // the second trap is off the shortest way
    const r = M.simulate(maze, walk(maze));
    assert.equal(r.finished, true);
    assert.equal(r.points, 1);
    assert.equal(M.points(maze), 2);
    assert.equal(M.marksFor(r, r.time), 1 * M.MAZE.marks);
    assert.equal(M.marksFor({ finished: false, points: 5, time: 3 }, 3), 0);
    assert.ok(M.marksFor(r, r.time * 1.5) > M.marksFor(r, r.time));
});

test('maze: the AI gets out more often with practice, and a practised one is faster than a careful you', () => {
    const maze = build([['trap', 0, 7], ['patrol', 3, 5], ['trap', 0, 3], ['patrol', 4, 2], ['trap', 2, 0], ['trap', 5, 0]]);
    const you = M.simulate(maze, walk(maze, 2));
    assert.equal(you.finished, true);
    assert.equal(you.points, M.points(maze));
    const rate = runs => { let clear = 0, first = 0, beat = 0; for (let s = 1; s <= 150; s++) { const h = M.handOver(maze, you, { seed: s * 977, mastery: M.mastery(runs) }); if (h.score) clear++; if (h.attempts[0].result.finished) first++; if (h.score && h.score.time < you.time) beat++; } return { clear, first, beat }; };
    const novice = rate(0), expert = rate(40);
    assert.ok(novice.first < 150 && novice.clear > novice.first, 'a new one fails first tries and later tries make up for some: ' + JSON.stringify(novice));
    assert.ok(expert.first >= 148 && expert.beat >= 140, 'a practised one gets out first try and faster: ' + JSON.stringify(expert));
});

test('maze: past your limit in stages; a maze with no way through is refused', () => {
    const maze = build([['trap', 0, 7], ['patrol', 3, 5], ['trap', 0, 3]]);
    const w = M.world(maze), i = at(0, 7), live = [...Array(M.MAZE.trapPeriod).keys()].find(n => w.trapLive(i, n + 1));
    const fell = M.simulate(maze, [...Array(live).fill(-1), 0]);
    assert.equal(fell.failed.type, 'trap');
    assert.deepEqual(M.canHandOver(maze, null, 1), { ok: false, why: 'untried' });
    assert.deepEqual(M.canHandOver(maze, fell, 0), { ok: false, why: 'stage' });
    assert.deepEqual(M.canHandOver(maze, fell, M.MAZE.stage2), { ok: true, why: 'beyond' });
    let out = 0; for (let s = 1; s <= 60; s++) if (M.handOver(maze, fell, { seed: s * 31, mastery: 1 }).score) out++;
    assert.equal(out, 60, 'a master finishes what you could not');
    const shut = build([['wall', 0, 7], ['wall', 1, 8]]);   // the start is walled in
    assert.equal(M.pathFrom(shut, M.startCell(), false), null);
    assert.deepEqual(M.canHandOver(shut, M.simulate(shut, [0, 1]), 1), { ok: false, why: 'impossible' });
    assert.equal(M.handOver(shut, M.simulate(shut, [0, 1]), { seed: 1, mastery: 1 }).impossible, true);
});

test('maze: you are given tiles as skills are learned', () => {
    assert.deepEqual(M.palette(0), ['wall', 'trap']);
    assert.deepEqual(M.palette(99), ['wall', 'trap', 'patrol', 'key', 'door']);
    const m = M.emptyMaze(); m[M.startCell()] = 'wall'; m[M.exitCell()] = 'trap';
    assert.equal(M.cleanMaze(m).filter(Boolean).length, 0, 'nothing on the start or the exit');
});
