// The AI cheats on a course, and you catch it (course-cheat.js, and `handOver`'s `cheat` in maze.js, puck.js, rooms.js).
const test = require('node:test');
const assert = require('node:assert');
const C = require('../course-cheat.js');
const S = require('../course-starters.js');
const Maze = require('../maze.js'), Puck = require('../puck.js'), Rooms = require('../rooms.js');

const fewest = key => list => list.reduce((a, b) => (!a || b[key] < a[key] ? b : a), null);

test('cheat: mastery opens it, your exploits and what you let stand feed it, a strike closes it for a while', () => {
    const s = C.blank();
    assert.equal(C.chance(s, 'maze', 1), 0);
    assert.equal(C.chance(s, 'maze', 2, 50), 0, 'not before it has mastered the kind, whatever you did');
    assert.equal(C.chance(s, 'maze', 3), C.CHEAT.base);
    assert.ok(C.chance(s, 'maze', 3, 5) > C.chance(s, 'maze', 3, 1));
    assert.ok(C.chance(C.clean({ lean: 2 }), 'puck', 3) > C.chance(s, 'puck', 3));
    assert.equal(C.chance(s, 'maze', 3, 1000), C.CHEAT.cap);
    assert.equal(C.chance(C.clean({ closed: { maze: 2 } }), 'maze', 3, 9), 0);
    assert.ok(C.chance(C.clean({ closed: { maze: 2 } }), 'puck', 3) > 0, 'closed in one kind only');
    assert.equal(C.chance(s, 'rhythm', 3, 9), 0, 'the rhythm run has no cheat yet');
});

test('cheat: let it stand and the cheated score pays and it leans further; strike it and the honest one pays, it leans back, the trick closes', () => {
    const honest = { finished: true, ticks: 30 }, bent = { finished: true, ticks: 20 }, fail = { finished: false };
    const hand = v => ({ attempts: [{ result: fail }, { result: bent, cheat: { tick: 5 } }, { result: honest }], score: bent, verdict: v });
    const stand = C.settle(C.clean({ lean: 1 }), 'maze', hand('stand'), fewest('ticks'));
    assert.equal(stand.score, bent);
    assert.deepEqual([stand.struck, stand.stood], [[], [1]]);
    assert.equal(stand.state.lean, 2);
    assert.equal(stand.state.closed.maze, undefined);
    assert.equal(stand.bounty, 0);
    const strike = C.settle(C.clean({ lean: 1 }), 'maze', hand('strike'), fewest('ticks'));
    assert.equal(strike.score, honest);
    assert.deepEqual([strike.struck, strike.stood], [[1], []]);
    assert.equal(strike.state.lean, 0);
    assert.equal(strike.state.closed.maze, C.CHEAT.close);
    assert.equal(strike.bounty, 0, 'no bounty for a strike on the result');
    // With no honest finish, a strike leaves nothing to pay.
    const only = C.settle(C.blank(), 'maze', { attempts: [{ result: fail }, { result: bent, cheat: {} }], score: bent, verdict: 'strike' }, fewest('ticks'));
    assert.equal(only.score, null);
});

test('cheat: a flag as it happens is a strike and a small bounty; a wrong flag costs a little; the closing runs down', () => {
    const honest = { finished: true, ticks: 30 }, bent = { finished: true, ticks: 20 };
    const live = C.settle(C.blank(), 'puck', { attempts: [{ result: bent, cheat: {}, flagged: true }, { result: honest }], score: bent, wrongFlags: 2 }, fewest('ticks'));
    assert.equal(live.score, honest);
    assert.deepEqual(live.live, [0]);
    assert.equal(live.bounty, C.CHEAT.bounty);
    assert.equal(live.fine, 2 * C.CHEAT.wrong);
    assert.ok(C.CHEAT.bounty < 10, 'a bounty is under the smallest clear');
    assert.equal(live.state.closed.puck, C.CHEAT.close);
    assert.equal(live.state.caught, 1);
    let s = live.state;
    for (let i = 0; i < C.CHEAT.close; i++) { assert.equal(C.possible(s, 'puck', 3), false); s = C.settle(s, 'puck', { attempts: [{ result: honest }], score: honest }, fewest('ticks')).state; }
    assert.equal(C.possible(s, 'puck', 3), true);
    assert.deepEqual(C.clean({ lean: -3, closed: { maze: 2, nonsense: 4 } }), Object.assign(C.blank(), { closed: { maze: 2 } }));
});

test('cheat: in the maze a caught try may be walked again uncaught, marked, with the honest best kept apart', () => {
    const maze = S.build('maze', 1, Maze), route = Maze.pathFrom(maze, Maze.startCell(), false), p = Maze.plan(maze, route), acts = [];
    let n = 0; for (let i = 0; i < route.length - 1; i++) for (;;) { const go = p.go(i, n), stand = p.stand(i, n); if (go || !stand) { acts.push(Maze.dirOf(route[i], route[i + 1])); n++; break; } acts.push(-1); n++; }
    const you = Maze.simulate(maze, acts);
    assert.equal(you.finished, true);
    let cheats = 0, none = 0, marked = 0;
    for (let seed = 1; seed <= 40; seed++) {
        const clean = Maze.handOver(maze, you, { seed: seed * 977, mastery: 0 }), bent = Maze.handOver(maze, you, { seed: seed * 977, mastery: 0, cheat: 1 });
        none += clean.attempts.filter(a => a.cheat).length;
        for (const a of bent.attempts) if (a.cheat) { cheats++; assert.equal(a.result.finished, true); assert.ok(a.cheat.tick > 0 && a.cheat.type); marked++; }
        if (bent.honest) assert.ok(!bent.attempts.find(a => a.result === bent.honest).cheat);
        assert.ok(!bent.score || bent.score.finished);
    }
    assert.equal(none, 0, 'none without the chance');
    assert.ok(cheats > 5, 'a shaky AI that may cheat does: ' + cheats);
});

test('cheat: in the puck course a try out of shots may take its last through the walls', () => {
    const course = S.build('puck', 0, Puck), run = Puck.createRun(course);
    while (!run.state.over) { const s = Puck.search(run.world, run.state, { to: run.world.hole, sunk: true }, 8); run.shoot(s.angle, s.power); }
    const you = Puck.result(run);
    assert.equal(you.finished, true);
    let cheats = 0, none = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const clean = Puck.handOver(course, you, { seed: seed * 977, mastery: 0 }), bent = Puck.handOver(course, you, { seed: seed * 977, mastery: 0, cheat: 1 });
        none += clean.attempts.filter(a => a.cheat).length;
        for (const a of bent.attempts) if (a.cheat) { cheats++; assert.equal(a.result.finished, true); assert.equal(a.cheat.shot, a.shots.length - 1); assert.equal(a.traces[a.cheat.shot].ghost, true); }
        if (bent.honest) assert.ok(!bent.attempts.find(a => a.result === bent.honest).cheat);
    }
    assert.equal(none, 0);
    assert.ok(cheats > 0, 'some tries ran out of shots and were bent: ' + cheats);
    // Through the walls: a shot straight up from the tee passes the wall in its way only as a ghost.
    const w = Puck.world(course), solid = { x: 3.5, y: 8.5, t: 0, hit: {} }, ghost = { x: 3.5, y: 8.5, t: 0, hit: {} };
    Puck.fly(w, solid, -Math.PI / 2, 0.75); Puck.fly(w, ghost, -Math.PI / 2, 0.75, Puck.PUCK, false, Infinity, true);
    assert.ok(solid.y > 5 && ghost.y < 4, `${solid.y} ${ghost.y}`);
});

test('cheat: in the room a run stopped by a spike may pass through it unharmed, once', () => {
    const room = S.build('rooms', 0, Rooms);   // a spike two tiles from the start
    const walk = o => { const run = Rooms.createRun(room, o); for (let i = 0; i < 400 && !run.state.over; i++) run.step({ dir: 1, jump: false }); return run.state; };
    const stopped = walk(Rooms.ROOM);
    assert.equal(stopped.failed.type, 'spike');
    const through = walk({ ...Rooms.ROOM, immune: 1 });
    assert.equal(through.spared.type, 'spike');
    assert.ok(through.x > stopped.x + 1, 'it carried on past the spike');
    assert.ok(!through.failed || through.failed.n > stopped.failed.n);
});
