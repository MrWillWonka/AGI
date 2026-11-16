// The obstacle course's rules (course.js; design/evals-course.md): a prototype of phase 1, the side-on track.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../course.js');

const course = (...kinds) => C.cleanCourse(kinds);

test('course: an empty track is run to the end; an obstacle met with no jump is a failure there', () => {
    const r = C.simulate(C.emptyCourse(), []);
    assert.equal(r.finished, true);
    assert.equal(r.points, 0);
    for (const kind of ['gap', 'wall', 'spikes']) {
        const f = C.simulate(course(null, kind), []);
        assert.equal(f.finished, false);
        assert.equal(f.failed.slot, 1);
        assert.equal(f.failed.kind, kind);
    }
    assert.equal(C.simulate(course('boost'), []).finished, true, 'a booster is no obstacle');
});

test('course: every obstacle can be cleared, and the cleanest line clears a mixed course for all its points', () => {
    for (const kind of ['gap', 'wall', 'spikes']) assert.ok(C.bestPresses(course(null, kind)), kind);
    assert.ok(C.bestPresses(course('wall')), 'a wall in the first place');
    const c = course('gap', null, 'wall', null, 'spikes', null, 'gap', null), best = C.bestPresses(c), r = C.simulate(c, best);
    assert.equal(r.finished, true);
    assert.deepEqual(r.cleared, [0, 2, 4, 6]);
    assert.equal(r.points, C.points(c));
    assert.equal(C.points(c), 1 + 2 + 2 + 1);
});

test('course: a wall needs a charged jump; a tap hits it', () => {
    const c = course(null, 'wall'), best = C.bestPresses(c);
    assert.ok(best[0].hold > 0.1);
    assert.equal(C.simulate(c, [{ t: best[0].t + best[0].hold, hold: 0 }]).finished, false);
});

test('course: the same presses always give the same run, and a run played live records the presses that replay it', () => {
    const c = course('gap', null, 'gap'), best = C.bestPresses(c);
    assert.deepEqual(C.simulate(c, best), C.simulate(c, best));
    const run = C.createRun(c), s = run.state; let i = 0;
    for (let n = 0; n < 5000 && !s.over; n++) { if (i < best.length && s.t >= best[i].t) { run.down(); run.up(); i++; } run.step(); }
    const live = C.result(c, run);
    assert.equal(live.finished, true);
    assert.equal(C.simulate(c, live.presses).finished, true);
});

test('course: a press in the air is acted on at touchdown', () => {
    const c = course('spikes'), best = C.bestPresses(c);
    assert.ok(best.length >= 2);
    const early = best.map((p, i) => (i === 1 ? { t: p.t - 0.05, hold: 0 } : p));   // the second hop pressed before landing
    assert.equal(C.simulate(c, early).finished, true);
});

test('course: a clean landing and a booster are both faster', () => {
    const plain = C.simulate(C.emptyCourse(), []).time;
    assert.ok(C.simulate(course('boost'), []).time < plain);
    const c = course(null, 'gap'), best = C.bestPresses(c), clean = C.simulate(c, best), late = C.simulate(c, best.map(p => ({ t: p.t + 0.15, hold: p.hold })));
    assert.equal(late.finished, true);
    assert.ok(clean.perfects >= 1 && late.perfects === 0);
    assert.ok(clean.time < late.time);
});

test('course: a failed hand-over scores nothing; a cleared one pays its points, more the faster it is than you', () => {
    const c = course('gap', null, 'wall');
    assert.equal(C.marksFor(c, null, 8), 0);
    assert.equal(C.marksFor(c, { finished: false, time: 3 }, 8), 0);
    const even = C.marksFor(c, { finished: true, time: 8 }, 8);
    assert.equal(even, C.points(c) * C.COURSE.marks);
    assert.ok(C.marksFor(c, { finished: true, time: 7 }, 8) > even);
    assert.ok(C.marksFor(c, { finished: true, time: 9 }, 8) < even);
});

test('course: the AI gets better with practice, later tries clear what the first did not, and with mastery it beats a sloppy run of yours', () => {
    const c = course('gap', null, 'wall', null, 'spikes', null, 'gap', null), best = C.bestPresses(c);
    let you = null, yourRun = null;
    for (const off of [0.1, 0.08, 0.06, 0.04, 0.02]) { you = best.map(p => ({ t: p.t + off, hold: p.hold })); yourRun = C.simulate(c, you); if (yourRun.finished) break; }
    assert.equal(yourRun.finished, true);
    const rate = runs => { let clear = 0, first = 0, beat = 0; for (let s = 1; s <= 150; s++) { const h = C.handOver(c, you, { seed: s * 977, mastery: C.mastery(runs) }); if (h.score) clear++; if (h.attempts[0].result.finished) first++; if (h.score && h.score.time <= yourRun.time) beat++; } return { clear, first, beat }; };
    const novice = rate(0), expert = rate(40);
    assert.ok(novice.clear > novice.first, 'later tries clear what the first did not');
    assert.ok(expert.clear > novice.clear && expert.clear >= 145, 'an expert clears nearly every time: ' + expert.clear + ' of 150 against ' + novice.clear);
    assert.ok(expert.beat >= 140, 'and is at least as fast as you: ' + expert.beat);
    assert.ok(C.mastery(0) === 0 && C.mastery(40) > 0.99);
});

test('course: you are given obstacles as skills are learned', () => {
    assert.deepEqual(C.palette(0), ['gap']);
    assert.deepEqual(C.palette(99), ['gap', 'wall', 'spikes', 'boost']);
    assert.deepEqual(C.cleanCourse(['gap', 'moon', 3]).slice(0, 3), ['gap', null, null]);
});
