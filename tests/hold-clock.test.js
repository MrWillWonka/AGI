// Held jobs repeat on the game's own clock (the audio overhaul): income never depends on the music's tempo,
// on sound being on, or on an audio context existing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');

// One hold played against a list of callback times (ms from the press): how many repeats it paid.
function play(times, start = 1000) {
    const h = E.holdClock(start);
    let paid = 0;
    for (const t of times) paid += h.take(start + t);
    return { paid, skipped: h.skipped };
}
// Timer callbacks as the game makes them: each waits for the next deadline, and arrives `late(i)` ms after it.
function timers(seconds, late = () => 0, start = 1000) {
    const h = E.holdClock(start);
    let now = start, paid = 0, i = 0;
    const end = start + seconds * 1000;
    for (;;) {
        now += h.wait(now) + late(i++);
        if (now > end + 1e-6) break;
        paid += h.take(now);
    }
    return { paid, skipped: h.skipped };
}
// A seeded generator, so the irregular cases repeat.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('the hold rate is the comfort rate, exactly: an 8th note at 124 BPM', () => {
    assert.strictEqual(E.HOLD_RATE, 124 * 2 / 60);
    assert.ok(Math.abs(E.HOLD_INTERVAL_MS - 241.93548387) < 1e-6);
});

test('a 60-second hold pays 248 repeats and a 10-minute hold 2,480 (the press itself is counted apart)', () => {
    // Repeat k is due at k × the interval after the press; one due exactly at the end of the hold counts.
    assert.strictEqual(timers(60).paid, 248);
    assert.strictEqual(timers(600).paid, 2480);
    assert.strictEqual(timers(60).skipped, 0);
});

test('nothing is paid before the first interval, and one repeat at it', () => {
    assert.deepStrictEqual(play([0, 100, 241.9]).paid, 0);
    assert.deepStrictEqual(play([0, 100, 241.94]).paid, 1);
});

test('late timers never add up to drift: the count follows the press, not the callbacks', () => {
    const r = rng(7);
    // Every callback 0 to 30 ms late (a busy page): still 248 in a minute, where chaining from each callback
    // would have lost about 15. (Held a tenth of a second past the minute: the repeat due exactly at the
    // release arrives late, after it.)
    assert.strictEqual(timers(60.1, () => r() * 30).paid, 248);
    assert.strictEqual(timers(600.1, () => r() * 30).paid, 2480);
});

test('a stall skips the repeats it covered: no burst of income afterwards', () => {
    // A two-second freeze in the middle of a ten-second hold.
    const h = E.holdClock(0);
    let paid = 0, now = 0;
    while (now < 4000) { now += h.wait(now); paid += h.take(now); }
    const before = paid;
    now += 2000;                                   // the page hangs
    assert.strictEqual(h.take(now), 1, 'one repeat when it comes back');
    assert.strictEqual(h.take(now), 0, 'and not the eight it missed');
    paid++;
    while (now < 10000 - 1e-6) { now += h.wait(now); if (now > 10000 + 1e-6) break; paid += h.take(now); }
    assert.ok(h.skipped >= 7 && h.skipped <= 8, 'skipped ' + h.skipped);
    assert.strictEqual(paid + h.skipped, Math.floor(10000 / E.HOLD_INTERVAL_MS + 1e-9));
    assert.ok(before > 0);
});

test('an early callback pays nothing and waits for the deadline', () => {
    const h = E.holdClock(0);
    assert.strictEqual(h.take(240), 0);
    assert.ok(Math.abs(h.wait(240) - (E.HOLD_INTERVAL_MS - 240)) < 1e-9);
    assert.strictEqual(h.take(242), 1);
    assert.strictEqual(h.take(243), 0);
});

test('rapid press and release: a hold shorter than the interval pays no repeat', () => {
    for (const ms of [10, 80, 150, 241]) assert.strictEqual(timers(ms / 1000).paid, 0, ms + ' ms');
    // Twenty quick holds of 200 ms are twenty presses and no repeats, however they fall.
    let paid = 0;
    for (let i = 0; i < 20; i++) paid += timers(0.2, () => 0, 1000 + i * 230).paid;
    assert.strictEqual(paid, 0);
});

test('the same hold pays the same at every music tempo and in every audio state', () => {
    // The clock takes no tempo, no audio time and no audio state: a trace is a function of the press and the
    // callback times alone. Each "configuration" below is the same trace played again; they must be identical.
    const r0 = rng(42), lates = Array.from({ length: 4000 }, () => r0() * 12);
    const trace = () => timers(300.1, i => lates[i]);
    const base = trace();
    for (const cfg of ['72 BPM', '92 BPM', '100 BPM', '124 BPM', '130 BPM', '144 BPM', 'music muted', 'all sound muted', 'simple sounds', 'no audio context', 'audio suspended'])
        assert.deepStrictEqual(trace(), base, cfg);
    assert.strictEqual(base.paid, 1240);
});

test('the game times held jobs with the engine clock and never asks the audio', () => {
    const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    const a = game.indexOf('function holdable('), b = game.indexOf('// ---- Build static UI', a);
    const hold = game.slice(a, b);
    assert.ok(a > 0 && b > a);
    assert.ok(hold.includes('E.holdClock('), 'holdable uses E.holdClock');
    // The only audio call in it is the release telling the held-job part to stop.
    const calls = hold.match(/SFX\??\.\??\w+/g) || [];
    assert.deepStrictEqual([...new Set(calls.map(c => c.replace(/\?/g, '')))], ['SFX.held']);
    assert.ok(!/holdDelay|AudioContext|currentTime/.test(game.slice(a, b)));
    assert.ok(!/holdDelay/.test(game), 'no holdDelay anywhere in the game');
    const sfx = fs.readFileSync(path.join(__dirname, '..', 'sfx.js'), 'utf8');
    assert.ok(!/holdDelay/.test(sfx), 'the audio engine no longer offers hold timing');
    // And the engine's clock knows nothing of sound.
    const eng = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
    const c = eng.indexOf('function holdClock('), d = eng.indexOf('\n    }\n', c);
    assert.ok(!/SFX|audio|Audio|performance|Date\.now|setTimeout/.test(eng.slice(c, d)));
});
