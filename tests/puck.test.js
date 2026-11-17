// The puck course's rules (puck.js; design/evals-course.md): a prototype of the third kind of course.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../puck.js');

const W = P.PUCK.cols, at = (x, y) => y * W + x, UP = -Math.PI / 2;
const build = list => { const c = P.emptyCourse(); for (const [k, x, y] of list) c[at(x, y)] = k; return P.cleanCourse(c); };
const pos = (x, y, hit = {}) => ({ x, y, t: 0, hit });
// A steady hand playing its own line: the search's shot each time, with no error.
function steady(course) { const run = P.createRun(course); while (!run.state.over) { const s = P.search(run.world, run.state, null, P.PUCK.limit); run.shoot(s.angle, s.power); } return P.result(run); }

test('puck: a shot slows to a stop, a harder one goes further, and the same shot is the same shot', () => {
    const w = P.world(P.emptyCourse()), soft = pos(3.5, 8.5), hard = pos(3.5, 8.5), again = pos(3.5, 8.5);
    P.fly(w, soft, UP, 0.2); P.fly(w, hard, UP, 0.4); P.fly(w, again, UP, 0.4);
    assert.ok(soft.y < 8.5 && hard.y < soft.y, `${soft.y} ${hard.y}`);
    assert.ok(Math.abs(soft.x - 3.5) < 1e-9, 'straight up stays straight');
    assert.deepEqual([again.x, again.y, again.t], [hard.x, hard.y, hard.t]);
});

test('puck: it bounces off the edges, walls and bumpers, and never ends inside a wall or outside the field', () => {
    const empty = P.world(P.emptyCourse()), p = pos(3.5, 4.5), f = P.fly(empty, p, 0, 1, P.PUCK, true);   // right, off the edge, back
    assert.ok(f.events.some(e => e.type === 'bounce'));
    assert.ok(p.x < 6.5 && Math.abs(p.y - 4.5) < 1e-9);
    const walled = build([['wall', 3, 5]]), q = pos(3.5, 8.5); P.fly(P.world(walled), q, UP, 1);
    assert.ok(q.y > 6, 'a wall in the way sends it back: ' + q.y);
    // A / bumper turns a puck going up to the right.
    const bump = build([['bumper0', 3, 5]]), b = pos(3.5, 8.5); P.fly(P.world(bump), b, UP, 0.6);
    assert.ok(b.x > 4 && b.y > 5, `${b.x} ${b.y}`);
    const maze = build([['wall', 1, 2], ['wall', 2, 2], ['bumper1', 5, 3], ['wall', 4, 6], ['bumper0', 1, 6], ['wall', 6, 4]]), w = P.world(maze), r = P.PUCK.r - 1e-6;
    for (let a = 0; a < 48; a++) {
        const s = pos(3.5, 8.5), g = P.fly(w, s, a * Math.PI / 24, 1, P.PUCK, true);
        for (const [x, y] of g.frames) { assert.ok(x >= r && x <= W - r && y >= r && y <= P.PUCK.rows - r, 'in the field'); assert.notEqual(w.kinds[Math.floor(y) * W + Math.floor(x)], 'wall', 'not in a wall'); }
    }
});

test('puck: sticky ground stops it sooner and slick ground lets it run', () => {
    const run = c => { const p = pos(3.5, 8.5); P.fly(P.world(c), p, UP, 0.5); return 8.5 - p.y; };
    const plain = run(P.emptyCourse()), sand = run(build([['sand', 3, 7], ['sand', 3, 6]])), ice = run(build([['ice', 3, 7], ['ice', 3, 6]]));
    assert.ok(sand < plain && plain < ice, `${sand} ${plain} ${ice}`);
});

test('puck: the hole takes a puck that reaches it, a clear scores the hole, and a target on the way scores too', () => {
    const empty = P.emptyCourse(), one = steady(empty);
    assert.equal(one.finished, true);
    assert.equal(one.shots, 1);
    assert.equal(one.points, P.HOLE_POINTS);
    assert.equal(P.points(empty), 1);
    const course = build([['target', 3, 4]]), r = P.simulate(course, [{ angle: UP, power: 0.9 }]);
    assert.equal(r.finished, true);
    assert.equal(r.points, 2);
    assert.equal(P.points(course), 2);
    // Too fast and it skips over the hole.
    const fast = pos(3.5, 1.5), f = P.fly(P.world(empty), fast, UP, 1, P.PUCK, false, 15);
    assert.equal(f.sunk, false);
    assert.ok(fast.y < 0.5, 'past it');
});

test('puck: out of shots before the hole scores nothing, whatever was hit', () => {
    const course = build([['target', 5, 8]]), weak = Array.from({ length: P.PUCK.limit }, () => ({ angle: 0, power: 0.14 }));
    const run = P.createRun(course); for (const s of weak) run.shoot(s.angle, s.power);
    assert.equal(run.state.over, true);
    assert.equal(run.state.failed.type, 'shots');
    assert.ok(run.state.hit.t61, 'it did hit the target');
    assert.equal(P.result(run).points, 0);
    assert.equal(P.marksFor(P.result(run), 3), 0);
    assert.equal(run.shoot(UP, 1), null, 'no shot after the run is over');
});

test('puck: a pit gives the puck back where the shot was taken, with the shot spent', () => {
    const course = build([['pit', 3, 6]]), run = P.createRun(course), tr = run.shoot(UP, 0.6);
    assert.equal(tr.pit, true);
    assert.deepEqual([run.state.x, run.state.y], [3.5, 8.5]);
    assert.equal(run.state.shots, 1);
});

test('puck: a booster pushes the way it faces, and a pair of portals carries the puck across', () => {
    const push = turn => { const p = pos(3.5, 8.5); P.fly(P.world(build([['booster' + turn, 3, 7]])), p, UP, 0.3); return p; };
    const up = push(0), right = push(1), plain = pos(3.5, 8.5); P.fly(P.world(P.emptyCourse()), plain, UP, 0.3);
    assert.ok(up.y < plain.y, 'further with a booster behind it');
    assert.ok(right.x > 3.6, 'pushed aside');
    const two = build([['portal', 3, 6], ['portal', 0, 2]]), p = pos(3.5, 8.5), f = P.fly(P.world(two), p, UP, 0.5, P.PUCK, true);
    assert.ok(f.events.some(e => e.type === 'portal'));
    assert.ok(p.x < 1 && p.y < 2, `${p.x} ${p.y}`);
    const lone = build([['portal', 3, 6]]), q = pos(3.5, 8.5); P.fly(P.world(lone), q, UP, 0.5);
    assert.ok(Math.abs(q.x - 3.5) < 1e-9, 'one portal alone does nothing');
    assert.equal(P.cleanCourse(['portal', 'portal', 'portal']).filter(Boolean).length, 2, 'two portals');
});

test('puck: a moving target only moves while the puck does, and is worth more', () => {
    const course = build([['mover', 1, 4]]), w = P.world(course), m = w.movers[0];
    assert.equal(w.moverX(m, 0), 1.5);
    assert.ok(w.moverX(m, 120) > 1.5);
    assert.ok(m.a === 0.5 && m.b === 6.5);
    const run = P.createRun(course); run.shoot(UP, 0.14);
    const t = run.state.t; assert.ok(t > 0);
    assert.equal(run.state.t, t, 'the clock stands between shots');
    assert.equal(P.points(course), 1 + P.TILES.mover.points);
});

test('puck: marks are points, more for each shot under par and less for each over', () => {
    const res = { finished: true, points: 3, shots: 3 };
    assert.equal(P.marksFor(res, 3), 30);
    assert.ok(P.marksFor(res, 5) > 30 && P.marksFor(res, 2) < 30);
    assert.equal(P.marksFor({ finished: true, points: 3, shots: 1 }, 20), 3 * P.PUCK.marks * P.PUCK.bonusMax);
});

test('puck: the AI clears more often with practice, and a practised one matches your clear', () => {
    const course = build([['wall', 2, 4], ['wall', 3, 4], ['wall', 4, 4], ['target', 5, 6], ['target', 6, 2]]);
    const you = steady(course);
    assert.equal(you.finished, true);
    const rate = runs => { let clear = 0, first = 0, par = 0; for (let s = 1; s <= 12; s++) { const h = P.handOver(course, you, { seed: s * 977, mastery: P.mastery(runs) }); if (h.score) clear++; if (h.attempts[0].result.finished) first++; if (h.score && h.score.shots <= you.shots && h.score.points >= you.points) par++; } return { clear, first, par }; };
    const novice = rate(0), expert = rate(40);
    assert.ok(novice.first < expert.first, 'a new one fails more first tries: ' + JSON.stringify({ novice, expert }));
    assert.ok(expert.first >= 11 && expert.par >= 10, 'a practised one clears first try, as well as you did: ' + JSON.stringify(expert));
});

test('puck: past your limit in stages; a course no one can clear is refused', () => {
    const course = build([['wall', 2, 4], ['wall', 3, 4], ['wall', 4, 4]]);
    const weak = P.simulate(course, Array.from({ length: P.PUCK.limit }, () => ({ angle: 0, power: 0.14 })));
    assert.equal(weak.finished, false);
    assert.deepEqual(P.canHandOver(course, null, 1), { ok: false, why: 'untried' });
    assert.deepEqual(P.canHandOver(course, weak, 0), { ok: false, why: 'stage' });
    assert.deepEqual(P.canHandOver(course, weak, P.PUCK.stage2), { ok: true, why: 'beyond' });
    let out = 0; for (let s = 1; s <= 12; s++) if (P.handOver(course, weak, { seed: s * 31, mastery: 1 }).score) out++;
    assert.equal(out, 12, 'a master finishes what you could not');
    const shut = build([['wall', 2, 0], ['wall', 4, 0], ['wall', 2, 1], ['wall', 3, 1], ['wall', 4, 1]]);   // the hole is walled in
    const tried = P.simulate(shut, Array.from({ length: P.PUCK.limit }, () => ({ angle: UP, power: 0.5 })));
    assert.deepEqual(P.canHandOver(shut, tried, 1), { ok: false, why: 'impossible' });
    assert.equal(P.handOver(shut, tried, { seed: 1, mastery: 1 }).impossible, true);
});

test('puck: you are given parts as skills are learned; nothing goes on the tee or the hole; parts that turn keep their turn', () => {
    assert.deepEqual(P.palette(0), ['wall', 'bumper', 'target']);
    assert.deepEqual(P.palette(99), P.ORDER);
    const c = P.emptyCourse(); c[P.teeCell()] = 'wall'; c[P.holeCell()] = 'target'; c[10] = 'booster3'; c[11] = 'bumper'; c[12] = 'nonsense';
    const clean = P.cleanCourse(c);
    assert.equal(clean.filter(Boolean).length, 2);
    assert.equal(clean[10], 'booster3');
    assert.equal(clean[11], 'bumper0');
    assert.equal(P.tileOf('booster', 5), 'booster1');
    assert.equal(P.kindOf('bumper1'), 'bumper');
});
