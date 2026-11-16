// rhythm.js — Evals' rhythm run (design/evals-course.md → The rhythm run; the owner's twelve calls, 2026-11-16).
// PROTOTYPE, step 1: one of the game's own tracks, in lanes. The notes are taken from the song itself, a lane an
// instrument (the kick, the bass, the melody); you pick how much of the song is turned into notes. You play it,
// then the AI does. A meter rises with hits and falls with misses: high, the notes turn gold and the song's full
// backing plays; low, the song falls apart; empty, the run is over and scores nothing.
// Pure and deterministic: no DOM, no clock, no audio, no Math.random. Times are seconds from the chart's first bar.
// window.Rhythm / require(). EVERY NUMBER IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Rhythm = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const RHYTHM = {
        lanes: 3,               // kick, bass, melody
        bars: 8,                // a run's length
        gap: 2,                 // the least steps between two notes in one lane (closer ones are thinned out)
        holdFrom: 4,            // a melody note this many steps long or more is a held note
        perfect: 0.05, good: 0.11, miss: 0.16,   // seconds from the beat: inside `perfect`, inside `good`, and when a note is gone
        holdSlack: 0.14,        // a hold may be let go this long before its end
        meterStart: 0.5, meterPerfect: 0.045, meterGood: 0.028, meterMiss: 0.1, meterStray: 0.03,
        goldCombo: 8,           // a combo this long turns the notes gold
        comboBonus: 0.5,        // the longest combo adds up to this share of the score (all of it for a full combo)
        // The AI: how far off the beat its hands are at first (seconds, one standard deviation) and how often it
        // misses outright, both less with mastery and halved at a note each time it has missed it; how much of your
        // own earliness or lateness it copies; and the stages past your limit, as on the other courses.
        sigma: 0.06, sigmaFloor: 0.006, missRate: 0.14, tries: 3, masteryRuns: 6, stage2: 0.35, stage3: 0.75, unseen: 2,
        marks: 2.5, bonusMin: 0.5, bonusMax: 2,   // Marks a note (before the comparison with you)
    };
    const LEVELS = [{ name: 'Kick', lanes: [0], needs: 0 }, { name: 'Kick and bass', lanes: [0, 1], needs: 0 }, { name: 'With the melody', lanes: [0, 1, 2], needs: 0 }];
    const mastery = (runs, skills = 0, o = RHYTHM) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);
    const stage = (m, o = RHYTHM) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);

    // A song as the music engine builds it (sfx.js `buildSong`): steps a bar, a drum kit of patterns, a bass pattern
    // and a melody for each section of its form. Which section a bar is in:
    const sectionAt = (song, bar) => song.form.find(s => bar >= s.start && bar < s.start + s.bars) || song.form[song.form.length - 1];
    // The first bar of the first section with a melody: where a run of the song starts.
    const startBar = song => { const s = song.form.find(x => x.mel && x.drums && x.drums !== 'none'); return s ? s.start : (song.form.find(x => x.mel) || song.form[0]).start; };
    // The notes of `bars` bars of a song from `from`, at a level (0: the kick; 1: and the bass; 2: and the melody).
    // Each: { step (from the chart's start), lane, len (steps held; 0: a tap) }. In time order.
    function chartFrom(song, level, from = startBar(song), o = RHYTHM) {
        const lanes = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))].lanes, steps = song.steps, notes = [], last = {};
        const add = (step, lane, len) => { if (last[lane] != null && step - last[lane] < o.gap) return; last[lane] = step + Math.max(0, len); notes.push({ step, lane, len }); };
        for (let b = 0; b < o.bars; b++) {
            const bar = (from + b) % song.bars, sec = sectionAt(song, bar), at = b * steps;
            for (let s = 0; s < steps; s++) {
                if (lanes.includes(0) && sec.drums && sec.drums !== 'none') { const k = song.kit && song.kit.kick ? song.kit.kick[s % song.kit.kick.length] : (s % 4 ? '.' : 'x'); if (k && k !== '.') add(at + s, 0, 0); }
                if (lanes.includes(1) && sec.bassOn !== false) { const pat = (song.bassBy && song.bassBy[sec.bass]) || song.bass || ''; const c = pat[(((bar - sec.start) * steps + s) % Math.max(1, pat.length))]; if (c && c !== '.' && c !== '-') add(at + s, 1, 0); }
                if (lanes.includes(2) && sec.mel && song.mel[sec.mel]) { const mel = song.mel[sec.mel], n = mel[((bar - sec.start) * steps + s) % mel.length]; if (n) { const len = Math.min(n.len || 1, o.bars * steps - (at + s)); add(at + s, 2, len >= o.holdFrom ? len - 1 : 0); } }
            }
        }
        return notes.sort((a, b) => a.step - b.step || a.lane - b.lane);
    }
    // A chart in seconds for a step length: { t, lane, hold (seconds; 0: a tap) }, and how long the run lasts.
    const timed = (notes, stepLen) => notes.map(n => ({ t: n.step * stepLen, lane: n.lane, hold: n.len * stepLen }));
    const lengthOf = (song, stepLen, o = RHYTHM) => o.bars * song.steps * stepLen;

    // A run of a timed chart. `press(lane, t)` and `release(lane, t)` as the fingers go down and up, `advance(t)` as
    // time passes (notes nobody hit become misses). Each returns what happened, for the screen to show.
    function createRun(chart, o = RHYTHM) {
        const s = { meter: o.meterStart, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, stray: 0, acc: 0, over: false, failed: false, finished: false, t: 0, failT: null,
            notes: chart.map(n => ({ ...n, state: 'wait', off: null })), holding: {}, next: 0 };
        const out = [];
        const bump = d => { s.meter = Math.max(0, Math.min(1, s.meter + d)); if (s.meter <= 0 && !s.over) { s.over = true; s.failed = true; s.failT = s.t; out.push({ type: 'fell', t: s.t }); } };
        const hit = (n, grade, off) => { n.state = grade; n.off = off; s[grade]++; s.combo++; s.best = Math.max(s.best, s.combo); s.acc += grade === 'perfect' ? 1 : 0.6; bump(grade === 'perfect' ? o.meterPerfect : o.meterGood); out.push({ type: grade, lane: n.lane, t: n.t, off, combo: s.combo, gold: s.combo >= o.goldCombo }); };
        const lose = n => { n.state = 'miss'; s.miss++; s.combo = 0; out.push({ type: 'miss', lane: n.lane, t: n.t }); bump(-o.meterMiss); };
        const take = () => out.splice(0, out.length);
        function advance(t) {
            if (s.over) return take();
            s.t = t;
            for (const n of s.notes) {
                if (n.t - t > o.miss) break;
                if (n.state === 'wait' && t - n.t > o.good) lose(n);
                else if (n.state === 'held' && t >= n.t + n.hold - 1e-9) { hit(n, n.grade, n.off); delete s.holding[n.lane]; }
                if (s.over) return take();
            }
            if (!s.over && s.notes.every(n => n.state !== 'wait' && n.state !== 'held')) { s.over = true; s.finished = true; out.push({ type: 'end', t }); }
            return take();
        }
        function press(lane, t) {
            if (s.over) return take();
            advance(t);
            if (s.over) return take();
            let pick = null;
            for (const n of s.notes) if (n.lane === lane && n.state === 'wait' && Math.abs(n.t - t) <= o.good && (!pick || Math.abs(n.t - t) < Math.abs(pick.t - t))) pick = n;
            if (!pick) { s.stray++; out.push({ type: 'stray', lane, t }); bump(-o.meterStray); return take(); }
            const off = t - pick.t, grade = Math.abs(off) <= o.perfect ? 'perfect' : 'good';
            if (pick.hold > 0) { pick.state = 'held'; pick.grade = grade; pick.off = off; s.holding[lane] = pick; out.push({ type: 'hold', lane, t: pick.t, off }); }
            else hit(pick, grade, off);
            return take();
        }
        function release(lane, t) {
            if (s.over) return take();
            const n = s.holding[lane];
            if (n) { delete s.holding[lane]; if (t >= n.t + n.hold - o.holdSlack) hit(n, n.grade, n.off); else { n.off = null; lose(n); } }
            advance(t);
            return take();
        }
        return { state: s, press, release, advance };
    }
    // What a run came to. `score`: the notes hit by how well, with the longest combo's bonus; nothing if the song fell apart.
    function result(run, o = RHYTHM) {
        const s = run.state, total = s.notes.length, hits = s.perfect + s.good, accuracy = hits ? s.acc / hits : 0;
        const score = s.failed || !total ? 0 : s.acc * (1 + o.comboBonus * (s.best / total));
        return { finished: s.finished, failed: s.failed, failT: s.failT, total, hits, perfect: s.perfect, good: s.good, miss: s.miss, stray: s.stray, combo: s.best, accuracy, score, meter: s.meter,
            offs: s.notes.map(n => (n.state === 'perfect' || n.state === 'good' ? n.off : null)) };
    }
    // The whole run from a list of events ({ t, lane, down }), in time order; `end`: when the track is over.
    function simulate(chart, events, end, o = RHYTHM) {
        const run = createRun(chart, o);
        for (const e of events.slice().sort((a, b) => a.t - b.t)) { if (run.state.over) break; if (e.down) run.press(e.lane, e.t); else run.release(e.lane, e.t); }
        if (!run.state.over) run.advance(end + o.miss + 0.01);
        return result(run, o);
    }

    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const bell = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

    // One attempt by the AI (the owner: it copies your timing, then tightens). For each note: it presses about when
    // you did (early or late as you were, less so with mastery), with shaky hands on top, or misses it outright.
    // `yours.offs[i]`: how far off you were on note i (null: you did not hit it, so it was never shown).
    function aiEvents(chart, yours, a, o = RHYTHM) {
        const r = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), events = [], missed = [];
        chart.forEach((n, i) => {
            const shown = yours && yours.offs && yours.offs[i] != null, scale = (1 - m) * (shown ? 1 : a.unseen || 1) * 0.5 ** ((a.fixes && a.fixes[i]) || 0);
            if (r() < o.missRate * scale) { missed.push(i); return; }
            const off = (shown ? yours.offs[i] : 0) * (1 - m) + (o.sigma * scale + o.sigmaFloor) * bell(r);
            events.push({ t: n.t + off, lane: n.lane, down: true });
            events.push({ t: n.t + off + (n.hold > 0 ? n.hold + 0.02 : 0.06), lane: n.lane, down: false });
        });
        return { events, missed };
    }
    function canHandOver(yours, m, o = RHYTHM) {
        if (!yours) return { ok: false, why: 'untried' };
        if (yours.finished) return { ok: true, why: 'cleared' };
        return stage(m, o) >= 2 ? { ok: true, why: 'beyond' } : { ok: false, why: 'stage' };
    }
    // The hand-over: up to `tries` attempts, each steadier on the notes it got wrong. The score is its best finish.
    function handOver(chart, yours, end, a, o = RHYTHM) {
        const fixes = {}, attempts = [], unseen = stage(a.mastery || 0, o) >= 3 ? 1 : o.unseen;
        let top = null;
        for (let k = 0; k < (a.tries || o.tries); k++) {
            const t = aiEvents(chart, yours, { seed: (a.seed + k * 7919) >>> 0, mastery: a.mastery, fixes, unseen }, o), res = simulate(chart, t.events, end, o);
            attempts.push({ events: t.events, result: res });
            res.offs.forEach((off, i) => { if (off == null || Math.abs(off) > o.perfect) fixes[i] = (fixes[i] || 0) + 1; });
            if (res.finished) { if (!top || res.score > top.score) top = res; if (k >= 1) break; }
        }
        return { attempts, score: top };
    }
    // What it pays: Marks for the notes it hit, times how its score compares with yours (or its own best there).
    function marksFor(res, refScore, o = RHYTHM) {
        if (!res || !res.finished || res.failed) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, refScore > 0 ? res.score / refScore : 1));
        return Math.round(res.hits * o.marks * bonus);
    }

    return { RHYTHM, LEVELS, mastery, stage, sectionAt, startBar, chartFrom, timed, lengthOf, createRun, result, simulate, aiEvents, canHandOver, handOver, marksFor, rng };
});
