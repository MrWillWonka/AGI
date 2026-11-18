// Evals' courses in the ring (the dev link): kept in the save, funding rounds from Marks earned, an agent's job in Evals.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const NOW = 1e12;
const ringOn = fn => { E.setRing(true); E.setCourses(true); try { fn(); } finally { E.setCourses(false); E.setRing(false); } };

test('courses: what the course screens keep is in the save, and comes back cleaned', () => {
    const s = E.defaultState(NOW);
    assert.deepEqual(s.courses, {});
    s.courses.agiMaze = JSON.stringify({ maze: ['wall'], runs: 3 }); s.courses['agiCourseTree'] = '{"marks":40}';
    const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
    assert.equal(back.version, E.SAVE_VERSION);
    assert.deepEqual(back.courses, s.courses);
    assert.deepEqual(E.migrate({ version: 45 }, NOW).courses, {}, 'an older save starts with none');
    assert.deepEqual(E.cleanCourses({ agiMaze: 'ok', 'agiPuck.u': 'ok', evil: 'x', agiRooms: 7, agiRhythm: 'y'.repeat(200001), '__proto__': 'z' }), { agiMaze: 'ok', 'agiPuck.u': 'ok' });
    assert.deepEqual(E.cleanCourses(['a']), {});
});

test('courses: a funding round comes at each milestone of Marks ever earned, each twice as far as the last', () => {
    assert.deepEqual([0, 99, 100, 299, 300, 699, 700, 1500, 3100].map(E.courseRounds), [0, 0, 1, 1, 2, 2, 3, 4, 5]);
    for (let n = 1; n < 10; n++) { assert.equal(E.courseRounds(E.courseRoundAt(n)), n); assert.equal(E.courseRounds(E.courseRoundAt(n) - 1), n - 1); }
    ringOn(() => {
        const s = E.defaultState(NOW);
        s.evals.passed = 4;   // the captcha score sheet counts for nothing where the courses are Evals
        assert.equal(E.fundingRounds(s), 0);
        assert.equal(E.ringRoom(s), E.RING_ROOM);
        E.courseMarks(s, 320, 60);
        assert.equal(E.fundingRounds(s), 2);
        assert.equal(E.ringRoom(s), E.RING_ROOM + 2 * E.RING_ROOM_ROUND);
        assert.equal(s.evals.coursePay, 60);
        E.courseMarks(s, 200, 0);
        assert.equal(s.evals.courseEarned, 320, 'never less than it was');
        assert.equal(s.evals.coursePay, 60, 'a payment that was no clear leaves the last clear as it was');
    });
    // Where the courses are not Evals (the playtest), the score sheet still counts.
    E.setRing(true); try { const s = E.defaultState(NOW); s.evals.passed = 3; s.evals.courseEarned = 5000; assert.equal(E.fundingRounds(s), 3); assert.equal(E.agentPlaceOpen(s, 'evals'), false); } finally { E.setRing(false); }
});

test('courses: an agent in Evals is paid a share of your last cleared course, on a clock, and only once there is one', () => {
    ringOn(() => {
        const s = E.defaultState(NOW), d = E.derive(s);
        s.snare.sector = 3; s.snare.bosses = 1;   // a boss beaten: an agent, and Evals open
        assert.ok(E.agentCount(s) >= 1);
        assert.equal(E.agentPlaceOpen(s, 'evals'), true);
        assert.equal(E.assignAgent(s, 0, 'evals'), true);
        assert.deepEqual(E.agentsTick(s, E.AGENT_EVALS_SECONDS * 3, d).filter(e => e.type === 'evals'), [], 'nothing to run yet');
        E.courseMarks(s, 80, 80);
        const did = E.agentsTick(s, E.AGENT_EVALS_SECONDS * 2 + 1, d).filter(e => e.type === 'evals');
        assert.equal(did.length, 2);
        assert.equal(did[0].marks, Math.round(80 * E.AGENT_EVALS_SHARE));
        assert.equal(E.takeCourseOwed(s), 2 * Math.round(80 * E.AGENT_EVALS_SHARE));
        assert.equal(E.takeCourseOwed(s), 0);
        E.assignAgent(s, 0, null);
        E.agentsTick(s, 1, d);
        assert.equal(s.evals.courseAcc, 0, 'moved away, its clock starts over');
        const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
        assert.equal(back.evals.courseEarned, 80);
        assert.equal(back.evals.coursePay, 80);
    });
});