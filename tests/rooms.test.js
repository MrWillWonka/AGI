// The platformer room's rules (rooms.js; design/evals-course.md): a prototype of the third kind of course.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../rooms.js');

const o = R.ROOM;
const build = list => { const r = R.emptyRoom(); for (const [k, x, y] of list) r[R.id(x, y)] = k; return R.cleanRoom(r); };
const floor = x => R.id(x, o.rows - 1);
// A run of the planner's route by the shared controller with steady hands, standing `pause` steps on every tile.
function person(room, pause = 30) {
    const cache = new Map(), route = R.pathFrom(room, floor(0), cache);
    if (!route) return null;
    const dwell = {}; for (const t of route) dwell[t] = pause;
    return R.aiInputs(room, { route, shown: route.length - 1 }, dwell, { seed: 1, mastery: 0, cache }, { ...o, sigma: 0, err: 0 }).result;
}
const STAIRS = [['block', 7, 4], ['block', 8, 4]];

test('rooms: the runner walks, is stopped by the wall, and a jump clears two tiles but not three', () => {
    const room = R.emptyRoom(), run = R.createRun(room), s = run.state;
    for (let i = 0; i < 60; i++) run.step({ dir: -1, jump: false });
    assert.ok(s.x >= o.w / 2 && s.x < 0.4, 'the left wall holds it');
    for (let i = 0; i < 60; i++) run.step({ dir: 1, jump: false });
    assert.ok(Math.abs(s.x - (0.3005 + 5)) < 0.1 && s.ground && s.y === o.rows - 1);
    let top = s.y; run.step({ dir: 0, jump: true }); for (let i = 0; i < 80; i++) { run.step({ dir: 0, jump: false }); top = Math.min(top, s.y); }
    const rise = o.rows - 1 - top;
    assert.ok(rise > 2 && rise < 3, 'a jump rises ' + rise.toFixed(2) + ' tiles');
    assert.ok(s.ground && s.y === o.rows - 1);
});

test('rooms: an empty room cannot be finished (the flag is up on the ledge); blocks or a spring make a way', () => {
    assert.equal(R.pathFrom(R.emptyRoom(), floor(0)), null);
    assert.ok(R.pathFrom(build(STAIRS), floor(0)));
    assert.ok(R.pathFrom(build([['spring', 9, 5]]), floor(0)));
    const r = person(build(STAIRS));
    assert.equal(r.finished, true);
    assert.equal(r.points, 0);
});

test('rooms: spikes, pits and saws stop you; got past with the flag reached, they score', () => {
    const spike = build([['spike', 3, 5]]), walk = Array(80).fill({ dir: 1, jump: false });
    assert.equal(R.simulate(spike, walk).failed.type, 'spike');
    assert.equal(R.simulate(build([['pit', 3, 6]]), [...walk, ...walk]).failed.type, 'pit');
    const saw = R.simulate(build([['saw', 4, 5]]), Array(600).fill({ dir: 0, jump: false }).map((x, i) => (i > 20 && i < 70 ? { dir: 1, jump: false } : x)));
    assert.equal(saw.failed && saw.failed.type, 'saw', 'standing in a saw\'s path');
    const room = build([['spike', 3, 5], ['pit', 5, 6], ...STAIRS]), r = person(room);
    assert.equal(r.finished, true);
    assert.equal(r.points, 2);
    assert.equal(R.points(room), 2);
    assert.equal(R.marksFor(r, r.time), 2 * o.marks);
    assert.equal(R.marksFor({ finished: false, points: 4, time: 3 }, 3), 0);
});

test('rooms: tiles go only where they may; pits in the floor, the start and the flag kept clear', () => {
    assert.equal(R.allowed('pit', floor(4)), true);
    assert.equal(R.allowed('pit', R.id(4, 3)), false);
    assert.equal(R.allowed('block', floor(4)), false);
    assert.equal(R.allowed('block', R.startCell()), false);
    assert.equal(R.allowed('spike', R.goalTile() - o.cols), false);
    assert.deepEqual(R.palette(0), ['block', 'spike']);
    assert.deepEqual(R.palette(99), ['block', 'spike', 'pit', 'saw', 'spring', 'boost']);
});

test('rooms: the same inputs always give the same run', () => {
    const room = build([['spike', 3, 5], ...STAIRS]), you = person(room);
    const a = R.handOver(room, you, { seed: 42, mastery: 0.3 }), b = R.handOver(room, you, { seed: 42, mastery: 0.3 });
    assert.deepEqual(a.attempts.map(t => t.result), b.attempts.map(t => t.result));
    assert.deepEqual(R.simulate(room, a.attempts[0].inputs), a.attempts[0].result);
});

test('rooms: the AI reaches the flag more often with practice, and a practised one is faster than you', () => {
    const room = build([['spike', 3, 5], ['block', 6, 5], ['spike', 5, 5], ['block', 7, 4], ['block', 8, 4], ['block', 9, 3]]), you = person(room);
    assert.equal(you.finished, true);
    const rate = runs => { let clear = 0, first = 0, beat = 0; for (let s = 1; s <= 100; s++) { const h = R.handOver(room, you, { seed: s * 977, mastery: R.mastery(runs) }); if (h.score) clear++; if (h.attempts[0].result.finished) first++; if (h.score && h.score.time < you.time) beat++; } return { clear, first, beat }; };
    const novice = rate(0), expert = rate(40);
    assert.ok(novice.first < 80 && novice.clear > novice.first, 'a new one fails first tries and later tries make up for some: ' + JSON.stringify(novice));
    assert.ok(expert.first >= 98 && expert.beat >= 95, 'a practised one gets there first try and faster: ' + JSON.stringify(expert));
});

test('rooms: past your limit in stages; a room with no way up is refused', () => {
    const room = build([['spike', 3, 5], ...STAIRS]);
    const fell = R.simulate(room, Array(80).fill({ dir: 1, jump: false }));
    assert.equal(fell.failed.type, 'spike');
    assert.deepEqual(R.canHandOver(room, null, 1), { ok: false, why: 'untried' });
    assert.deepEqual(R.canHandOver(room, fell, 0), { ok: false, why: 'stage' });
    assert.deepEqual(R.canHandOver(room, fell, o.stage2), { ok: true, why: 'beyond' });
    let up = 0; for (let s = 1; s <= 40; s++) if (R.handOver(room, fell, { seed: s * 31, mastery: 1 }).score) up++;
    assert.equal(up, 40, 'a master finishes what you could not');
    const none = R.emptyRoom(), tried = R.simulate(none, Array(80).fill({ dir: 1, jump: false }));
    assert.deepEqual(R.canHandOver(none, tried, 1), { ok: false, why: 'impossible' });
    assert.equal(R.handOver(none, tried, { seed: 1, mastery: 1 }).impossible, true);
});

test('rooms: a booster makes the same walk quicker, scores nothing, and a room with one can still be handed over', () => {
    const walk = Array(120).fill({ dir: 1, jump: false });
    const plain = R.createRun(R.emptyRoom()), fast = R.createRun(build([['boost', 2, 5]]));
    for (const i of walk) { plain.step(i); fast.step(i); }
    assert.ok(fast.state.x > plain.state.x + 1 || fast.state.x > 11, 'further in the same time: ' + fast.state.x.toFixed(2) + ' against ' + plain.state.x.toFixed(2));
    assert.equal(R.points(build([['boost', 2, 5]])), 0);
    const room = build([['boost', 2, 5], ['spike', 5, 5], ...STAIRS]), you = person(room);
    assert.equal(you.finished, true);
    let up = 0; for (let s = 1; s <= 40; s++) if (R.handOver(room, you, { seed: s * 17, mastery: 1 }).score) up++;
    assert.ok(up >= 38, 'a master reaches the flag through a booster: ' + up + ' of 40');
});
