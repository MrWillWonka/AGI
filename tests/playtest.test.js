const test = require('node:test');
const assert = require('node:assert');
const P = require('../playtest.js');

function memory(limit = Infinity) {
    const data = {};
    return { data, get: k => data[k] ?? null, set: (k, v) => (v.length > limit ? false : (data[k] = v, true)) };
}

test('playtest: events carry play time, survive a reload, and clicks are tallied between samples', () => {
    const store = memory();
    const a = P.create(store);
    a.event(12.34, 'sprint', { ch: 0.9 });
    a.count('compute'); a.count('compute'); a.count('collect');
    assert.deepStrictEqual(a.takeCounts(), { compute: 2, collect: 1 });
    assert.strictEqual(a.takeCounts(), undefined);
    a.flush();
    const b = P.create(store);
    assert.strictEqual(b.events.length, 1);
    assert.strictEqual(b.events[0].t, 12.3);
    assert.strictEqual(b.events[0].e, 'sprint');
    assert.strictEqual(b.events[0].ch, 0.9);
});

test('playtest: switched off records nothing, and the switch is remembered', () => {
    const store = memory();
    const a = P.create(store);
    a.setEnabled(false);
    a.event(1, 'run');
    a.count('compute');
    assert.strictEqual(a.events.length, 0);
    assert.strictEqual(a.takeCounts(), undefined);
    assert.strictEqual(P.create(store).enabled, false);
});

test('playtest: the log keeps the newest events when it is full or storage refuses it', () => {
    const a = P.create(memory());
    for (let i = 0; i < P.MAX_EVENTS + 10; i++) a.event(i, 'sprint');
    assert.strictEqual(a.events.length, P.MAX_EVENTS);
    assert.strictEqual(a.events[0].t, 10);

    const tight = memory(4000);
    const b = P.create(tight);
    for (let i = 0; i < 200; i++) b.event(i, 'sprint', { ch: 0.5 });
    b.flush();
    assert.ok(tight.data.agiPlaytest, 'saved after dropping the older half');
    assert.ok(JSON.parse(tight.data.agiPlaytest).dropped > 0);
});

test('playtest: the report summarizes skills, runs, sprints and time by screen, then lists every event', () => {
    const a = P.create(memory());
    a.event(0, 'session');
    a.event(0, 'view', { v: 'lab' });
    a.event(60, 'view', { v: 'bay:training' });
    a.event(61, 'sprint', { ch: 1, cap: 1, first: true });
    a.event(70, 'sprint', { ch: 0.6, cap: 0.6, k: 'clean' });
    a.event(80, 'run', { sprints: 2, dur: 19 });
    a.event(81, 'skill', { n: 1, name: 'Pattern Matching', runs: 1 });
    a.event(120, 'sample');
    const text = a.report({ save: 'v13' });
    assert.match(text, /save: v13/);
    assert.match(text, /Pattern Matching\s+1\.4 min\s+run 1/);
    assert.match(text, /Runs: 1 \(0 rolled back\), 2\.0 sprints/);
    assert.match(text, /50% at 95%\+ charge, 50% with the meter capped by income, 50% hit a prompt/);
    assert.match(text, /lab\s+1\.0 min\s+50%/);
    assert.match(text, /bay:training\s+1\.0 min\s+50%/);
    assert.strictEqual(text.split('\n').filter(l => l.startsWith('{')).length, 8);
});
