// rhythm.js — Evals' rhythm run (design/evals-course.md → The rhythm run; the owner's calls, 2026-11-16).
// PROTOTYPE, step 1: one of the game's own tracks, in lanes. The notes are taken from the song itself (its kick, its
// bass, its melody: a lane each) and mixed by how hard you ask for: Easy is mostly single notes and freestyle bars
// with a few held notes; Extreme is everything the song has, with slashes, held notes, two at once and freestyle.
// You play it, then the AI does. A meter rises with hits and falls with misses: high, the notes turn gold and the
// song's full backing plays; low, the song falls apart; empty, the run is over and scores nothing.
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
        // Playable by the hands there are (the owner: two thumbs on a phone; W A S D, the spacebar and the mouse on a
        // desktop): `hands` things can be down at once, a held note counting as one for as long as it is held.
        // At a clash the melody is kept, then the kick, then the bass.
        hands: 2, oneGap: 2, keep: [2, 0, 1],
        holdFrom: 4,            // a melody note this many steps long or more is a held note
        // Forgiving (the owner, 2026-11-16: "we need to be a bit more forgiving"): seconds from the beat.
        perfect: 0.07, good: 0.15, miss: 0.2,
        holdSlack: 0.25,        // a hold may be let go this long before its end
        meterStart: 0.6, meterPerfect: 0.045, meterGood: 0.03, meterMiss: 0.07, meterStray: 0.012,
        goldCombo: 8,           // a combo this long turns the notes gold
        comboBonus: 0.5,        // the longest combo adds up to this share of the score (all of it for a full combo)
        // Freestyle (the owner's boss moment): a bar with no notes where you tap a beat of your own. A tap counts when
        // it lands near a half-beat (`freeDiv` steps), up to `freeCap` a bar; a bar left silent is one miss; a bar with
        // some variety (two lanes, more than one spacing, at least `flairTaps` taps) earns `flair` extra.
        freeDiv: 2, freeCap: 8, freeNear: 0.32, flairTaps: 4, flair: 2,
        // The AI: how far off the beat its hands are at first (seconds, one standard deviation) and how often it
        // misses outright, both less with mastery and halved at a note each time it has got it wrong; how often it
        // taps a slash instead of slashing it; and the stages past your limit, as on the other courses.
        sigma: 0.07, sigmaFloor: 0.006, missRate: 0.14, slashSlip: 0.5, tries: 3, masteryRuns: 6, stage2: 0.35, stage3: 0.75, unseen: 2,
        marks: 2.5, bonusMin: 0.5, bonusMax: 2,   // Marks a hit (before the comparison with you)
    };
    // How much of the song is notes when the instruments are taken one by one (the first cut; kept for the mixing below).
    const LEVELS = [{ name: 'Kick', lanes: [0] }, { name: 'Kick and bass', lanes: [0, 1] }, { name: 'With the melody', lanes: [0, 1, 2] }];
    // The modes (the owner, 2026-11-16: "easy medium and hard instead of bass kick and lead"; "the extreme version would
    // be everything together"). `perBar`: the most notes a bar; `apart`: the least steps between two moments with a note;
    // `chords`: bars' worth of two-at-once allowed; `holds`: the share of held notes kept; `slash`: the share of single
    // notes that are slashes; `free`: which bars are freestyle; `miss`: what a miss costs the meter.
    const MODES = [
        { key: 'easy', name: 'Easy', perBar: 5, apart: 4, chords: 0, holds: 0.5, slash: 0, free: [3, 7], miss: 0.045 },
        { key: 'medium', name: 'Medium', perBar: 8, apart: 2, chords: 1, holds: 1, slash: 0, free: [7], miss: 0.06 },
        { key: 'hard', name: 'Hard', perBar: 11, apart: 2, chords: 2, holds: 1, slash: 0.25, free: [7], miss: 0.075 },
        { key: 'extreme', name: 'Extreme', perBar: 99, apart: 1, chords: 99, holds: 1, slash: 0.4, free: [7], miss: 0.09 },
    ];
    const modeOf = m => MODES[Math.max(0, Math.min(MODES.length - 1, m | 0))];
    // The rules a mode is played by: the table above with the mode's cost of a miss.
    const rulesFor = (m, o = RHYTHM) => ({ ...o, meterMiss: modeOf(m).miss });
    const mastery = (runs, skills = 0, o = RHYTHM) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);
    const stage = (m, o = RHYTHM) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);

    // A song as the music engine builds it (sfx.js `buildSong`): steps a bar, a drum kit of patterns, a bass pattern
    // and a melody for each section of its form. Which section a bar is in:
    const sectionAt = (song, bar) => song.form.find(s => bar >= s.start && bar < s.start + s.bars) || song.form[song.form.length - 1];
    // The first bar of the first section with a melody: where a run of the song starts.
    const startBar = song => { const s = song.form.find(x => x.mel && x.drums && x.drums !== 'none'); return s ? s.start : (song.form.find(x => x.mel) || song.form[0]).start; };
    // The notes of `bars` bars of a song from `from`, at a level (0: the kick; 1: and the bass; 2: and the melody).
    // Each: { step (from the chart's start), lane, len (steps held; 0: a tap) }. In time order.
    function chartFrom(song, level, from = startBar(song), o = RHYTHM, hands = o.hands) {
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
        return playable(notes, hands, o).sort((a, b) => a.step - b.step || a.lane - b.lane);
    }
    // Thin a chart to what `hands` hands can play: never more down at once than there are hands.
    function playable(notes, hands, o = RHYTHM) {
        const rank = n => o.keep.indexOf(n.lane), out = [], ends = [];
        let lastStep = -99;
        for (const n of notes.slice().sort((a, b) => a.step - b.step || rank(a) - rank(b))) {
            const busy = ends.filter(e => e > n.step).length + out.filter(m => m.step === n.step && m.len === 0).length;
            if (busy >= hands) continue;
            if (hands < 2 && n.step - lastStep < o.oneGap) continue;
            out.push(n); lastStep = n.step;
            if (n.len > 0) ends.push(n.step + n.len);
        }
        return out;
    }
    // A mode's chart: the song's instruments mixed (the owner: "we can mix parts between the instruments to change the
    // difficulty"). From everything the song has, a bar keeps its weightiest notes (the beats, the melody) up to the
    // mode's count and spacing; some single notes become slashes; the mode's freestyle bars have no notes at all.
    // Notes: { step, lane, len, kind: 'tap' | 'hold' | 'slash' }. Freestyle: { step, len, free: true }.
    function chartFor(song, mode, from = startBar(song), o = RHYTHM) {
        const M = modeOf(mode), steps = song.steps, all = chartFrom(song, 2, from, o, 9), out = [];
        const weight = n => (n.lane === 2 ? (n.len > 0 ? 5 : 3) : n.lane === 0 ? 2 : 1) + (n.step % 4 === 0 ? 3 : n.step % 2 === 0 ? 1 : 0);
        let holdSeen = 0, chords = 0;
        for (let b = 0; b < o.bars; b++) {
            if (M.free.includes(b)) { out.push({ step: b * steps, len: steps, free: true }); continue; }
            const bar = all.filter(n => n.step >= b * steps && n.step < (b + 1) * steps).sort((x, y) => weight(y) - weight(x) || x.step - y.step), picked = [];
            let chordBudget = M.chords >= 99 ? 99 : (chords += M.chords, Math.floor(chords));
            for (const n of bar) {
                if (picked.length >= M.perBar) break;
                let len = n.len;
                if (len > 0 && Math.floor(++holdSeen * M.holds) === Math.floor((holdSeen - 1) * M.holds)) len = 0;   // only this share of the held notes stay held
                const same = picked.filter(p => p.step === n.step).length;
                if (same) { if (same >= 2 || chordBudget < 1) continue; }
                else if (picked.some(p => Math.abs(p.step - n.step) < M.apart)) continue;
                if (same) { chordBudget--; chords = Math.max(0, chords - 1); }
                picked.push({ step: n.step, lane: n.lane, len });
            }
            out.push(...picked);
        }
        const notes = playable(out.filter(n => !n.free), o.hands, o).sort((a, b) => a.step - b.step || a.lane - b.lane);
        let singles = 0;
        for (const n of notes) {
            n.kind = n.len > 0 ? 'hold' : 'tap';
            if (n.kind === 'tap' && M.slash > 0 && !notes.some(m => m !== n && m.step === n.step) && Math.floor(++singles * M.slash) > Math.floor((singles - 1) * M.slash)) n.kind = 'slash';
        }
        return [...notes, ...out.filter(n => n.free)].sort((a, b) => a.step - b.step || (a.free ? -1 : b.free ? 1 : a.lane - b.lane));
    }
    // A chart in seconds for a step length: notes { t, lane, hold (0: not held), kind }, freestyle { t, dur, grid, free }.
    const timed = (notes, stepLen, o = RHYTHM) => notes.map(n => (n.free ? { t: n.step * stepLen, dur: n.len * stepLen, grid: o.freeDiv * stepLen, free: true, lane: -1, hold: 0 } : { t: n.step * stepLen, lane: n.lane, hold: n.len * stepLen, kind: n.kind || (n.len > 0 ? 'hold' : 'tap') }));
    const lengthOf = (song, stepLen, o = RHYTHM) => o.bars * song.steps * stepLen;

    // A run of a timed chart. `press(lane, t, kind)` and `release(lane, t)` as the fingers go down and up (`kind`
    // 'slash' for a swipe), `advance(t)` as time passes. Each returns what happened, for the screen to show.
    function createRun(chart, o = RHYTHM) {
        const s = { meter: o.meterStart, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, stray: 0, acc: 0, freeTaps: 0, flairs: 0, over: false, failed: false, finished: false, t: 0, failT: null,
            notes: chart.map(n => (n.free ? { ...n, state: 'free', taps: [], done: false } : { ...n, state: 'wait', off: null })), holding: {} };
        const out = [], frees = s.notes.filter(n => n.free);
        const bump = d => { s.meter = Math.max(0, Math.min(1, s.meter + d)); if (s.meter <= 0 && !s.over) { s.over = true; s.failed = true; s.failT = s.t; out.push({ type: 'fell', t: s.t }); } };
        const credit = (grade, lane, t, off, extra) => { s[grade]++; s.combo++; s.best = Math.max(s.best, s.combo); s.acc += grade === 'perfect' ? 1 : 0.6; bump(grade === 'perfect' ? o.meterPerfect : o.meterGood); out.push({ type: grade, lane, t, off, combo: s.combo, gold: s.combo >= o.goldCombo, ...extra }); };
        const hit = (n, grade, off) => { n.state = grade; n.off = off; credit(grade, n.lane, n.t, off, { kind: n.kind }); };
        const lose = (n, lane, t) => { if (n) n.state = 'miss'; s.miss++; s.combo = 0; out.push({ type: 'miss', lane, t }); bump(-o.meterMiss); };
        const take = () => out.splice(0, out.length);
        const freeAt = t => frees.find(f => !f.done && t >= f.t - o.good && t < f.t + f.dur - 1e-9);
        function advance(t) {
            if (s.over) return take();
            s.t = t;
            for (const n of s.notes) {
                if (n.t - t > o.miss) break;
                if (n.free) {
                    if (!n.done && t >= n.t + n.dur) {
                        n.done = true;
                        if (!n.taps.length) lose(null, 1, n.t + n.dur);   // a freestyle bar left silent
                        else { const lanes = new Set(n.taps.map(x => x.lane)).size, gaps = new Set(n.taps.slice(1).map((x, i) => x.k - n.taps[i].k)).size; if (n.taps.length >= o.flairTaps && lanes >= 2 && gaps >= 2) { s.acc += o.flair; s.flairs++; out.push({ type: 'flair', t: n.t + n.dur, taps: n.taps.length }); } }
                    }
                } else if (n.state === 'wait' && t - n.t > o.good) lose(n, n.lane, n.t);
                else if (n.state === 'held' && t >= n.t + n.hold - 1e-9) { hit(n, n.grade, n.off); delete s.holding[n.lane]; }
                if (s.over) return take();
            }
            if (!s.over && s.notes.every(n => (n.free ? n.done : n.state !== 'wait' && n.state !== 'held'))) { s.over = true; s.finished = true; out.push({ type: 'end', t }); }
            return take();
        }
        function press(lane, t, kind) {
            if (s.over) return take();
            advance(t);
            if (s.over) return take();
            let pick = null;
            for (const n of s.notes) if (!n.free && n.lane === lane && n.state === 'wait' && Math.abs(n.t - t) <= o.good && (!pick || Math.abs(n.t - t) < Math.abs(pick.t - t))) pick = n;
            if (!pick) {
                const f = freeAt(t);
                if (f) {   // a tap of your own: it counts when it lands near a half-beat nobody has used in this lane
                    const k = Math.max(0, Math.round((t - f.t) / f.grid)), off = t - (f.t + k * f.grid);
                    // (Near means within a third of the gap between half-beats: at a quick tempo the usual window would take anything.)
                    const near = Math.min(o.good, f.grid * o.freeNear), tight = Math.min(o.perfect, f.grid * o.freeNear / 2);
                    if (Math.abs(off) <= near && f.taps.length < o.freeCap && k * f.grid < f.dur - 1e-9 && !f.taps.some(x => x.k === k && x.lane === lane)) { f.taps.push({ k, lane }); f.taps.sort((a, b) => a.k - b.k); s.freeTaps++; credit(Math.abs(off) <= tight ? 'perfect' : 'good', lane, f.t + k * f.grid, off, { free: true }); }
                    else out.push({ type: 'loose', lane, t });
                    return take();
                }
                s.stray++; out.push({ type: 'stray', lane, t }); bump(-o.meterStray); return take();
            }
            const off = t - pick.t;
            // A slash note wants a slash: tapped, it is good at best.
            const grade = Math.abs(off) <= o.perfect && (pick.kind !== 'slash' || kind === 'slash') ? 'perfect' : 'good';
            if (pick.hold > 0) { pick.state = 'held'; pick.grade = grade; pick.off = off; s.holding[lane] = pick; out.push({ type: 'hold', lane, t: pick.t, off }); }
            else hit(pick, grade, off);
            return take();
        }
        function release(lane, t) {
            if (s.over) return take();
            const n = s.holding[lane];
            if (n) { delete s.holding[lane]; if (t >= n.t + n.hold - o.holdSlack) hit(n, n.grade, n.off); else { n.off = null; lose(n, n.lane, n.t); } }
            advance(t);
            return take();
        }
        return { state: s, press, release, advance, freeAt };
    }
    // What a run came to. `score`: the hits by how well, with the longest combo's bonus; nothing if the song fell apart.
    function result(run, o = RHYTHM) {
        const s = run.state, notes = s.notes.filter(n => !n.free), total = notes.length, hits = s.perfect + s.good, accuracy = hits ? (s.acc - o.flair * s.flairs) / hits : 0;
        const score = s.failed || !(total + s.freeTaps) ? 0 : s.acc * (1 + o.comboBonus * Math.min(1, s.best / Math.max(1, total)));
        return { finished: s.finished, failed: s.failed, failT: s.failT, total, hits, perfect: s.perfect, good: s.good, miss: s.miss, stray: s.stray, combo: s.best, accuracy, score, meter: s.meter, freeTaps: s.freeTaps, flairs: s.flairs,
            offs: s.notes.map(n => (!n.free && (n.state === 'perfect' || n.state === 'good') ? n.off : null)) };
    }
    // The whole run from a list of events ({ t, lane, down, kind }), in time order; `end`: when the track is over.
    function simulate(chart, events, end, o = RHYTHM) {
        const run = createRun(chart, o);
        for (const e of events.slice().sort((a, b) => a.t - b.t)) { if (run.state.over) break; if (e.down) run.press(e.lane, e.t, e.kind); else run.release(e.lane, e.t); }
        if (!run.state.over) run.advance(end + o.miss + 0.01);
        return result(run, o);
    }

    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const bell = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

    // One attempt by the AI (the owner: it copies your timing, then tightens). For each note: it presses about when
    // you did (early or late as you were, less so with mastery), with shaky hands on top, or misses it outright; a
    // slash it may only tap. In a freestyle bar it taps a beat of its own: sparse and on one lane at first, fuller
    // and more varied with mastery. `yours.offs[i]`: how far off you were on note i (null: you did not hit it).
    function aiEvents(chart, yours, a, o = RHYTHM) {
        const r = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), events = [];
        chart.forEach((n, i) => {
            if (n.free) {
                const slots = Math.max(1, Math.round(n.dur / n.grid)), want = Math.max(1, Math.round(Math.min(o.freeCap, slots) * (0.35 + 0.65 * m))), lanes = 1 + Math.floor(m * 2.99), used = new Set();
                for (let c = 0, guard = 0; c < want && guard < 60; guard++) { const k = Math.floor(r() * slots); if (used.has(k)) continue; used.add(k); c++; const lane = lanes > 1 ? Math.floor(r() * lanes) : 0, t = n.t + k * n.grid + (o.sigma * (1 - m) + o.sigmaFloor) * bell(r); events.push({ t, lane, down: true }, { t: t + 0.05, lane, down: false }); }
                return;
            }
            const shown = yours && yours.offs && yours.offs[i] != null, scale = (1 - m) * (shown ? 1 : a.unseen || 1) * 0.5 ** ((a.fixes && a.fixes[i]) || 0);
            if (r() < o.missRate * scale) return;
            const off = (shown ? yours.offs[i] : 0) * (1 - m) + (o.sigma * scale + o.sigmaFloor) * bell(r);
            const kind = n.kind === 'slash' && r() >= o.slashSlip * scale ? 'slash' : undefined;
            events.push({ t: n.t + off, lane: n.lane, down: true, kind });
            events.push({ t: n.t + off + (n.hold > 0 ? n.hold + 0.02 : 0.06), lane: n.lane, down: false });
        });
        return { events };
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
            res.offs.forEach((off, i) => { if (!chart[i].free && (off == null || Math.abs(off) > o.perfect)) fixes[i] = (fixes[i] || 0) + 1; });
            if (res.finished) { if (!top || res.score > top.score) top = res; if (k >= 1) break; }
        }
        return { attempts, score: top };
    }
    // What it pays: Marks for what it hit, times how its score compares with yours (or its own best there).
    function marksFor(res, refScore, o = RHYTHM) {
        if (!res || !res.finished || res.failed) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, refScore > 0 ? res.score / refScore : 1));
        return Math.round(res.hits * o.marks * bonus);
    }

    return { RHYTHM, LEVELS, MODES, modeOf, rulesFor, mastery, stage, sectionAt, startBar, chartFrom, chartFor, playable, timed, lengthOf, createRun, result, simulate, aiEvents, canHandOver, handOver, marksFor, rng };
});
