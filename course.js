// course.js — Evals as an obstacle course (design/evals-course.md; the owner's design, 2026-11-15). PROTOTYPE, phase 1:
// a side-on track. You put obstacles in its slots, run it yourself to show it can be done, then the AI runs it.
// A runner goes along the track by itself; the one control is the jump (a tap hops, a hold charges a higher one).
// Pure and deterministic: no DOM, no clock, no Math.random (the AI's unsteady hands come from a seeded generator).
// Loaded in the browser as window.Course and in Node (tests) via require(). EVERY NUMBER IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Course = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const COURSE = {
        step: 1 / 120,      // fixed physics step (seconds)
        slots: 8,           // places for an obstacle
        slot: 5,            // a slot's length (units)
        lead: 5,            // flat run-up before the first slot
        tail: 3,            // flat run-out after the last
        speed: 6,           // the runner's pace on the ground (units a second)
        air: 0.9,           // its pace in the air, times that
        charge: 0.92,       // and while a jump is being charged
        gravity: 18,
        jump: 5.2,          // a tap's upward speed
        jumpMax: 7.6,       // a full charge's
        holdMax: 0.35,      // seconds of holding for a full charge
        gap: 1.6,           // a gap's width
        wallW: 0.4, wallH: 1.3,
        spikeGap: 0.8, spikeLand: 1.6,   // spikes: two short gaps with a ledge between (too far for one tap's hop)
        boostPad: 1, boostLen: 6, boost: 1.4,   // a booster: this much faster for this far
        perfect: 0.35,      // landing within this far past an obstacle's end is a clean landing…
        perfectSpeed: 1.25, perfectTime: 0.5,   // …which is this much faster for this long
        // The AI (phase 1): its hands start this unsteady (seconds, one standard deviation), steadier with mastery,
        // and half as unsteady at an obstacle for each time it has failed there.
        sigma: 0.05, sigmaFloor: 0.004, tries: 4, masteryRuns: 6,
        margin: 0.035,      // it aims this long after the earliest jump that clears (the very earliest is a knife edge)
        // Past your limit, in stages (the owner's cards, 2026-11-15). Stage 1: it needs a run you cleared. Stage 2, from
        // this mastery: it takes a course you fell on, copying you up to there and working the rest out itself, its
        // hands `unseen` times as unsteady at the jumps you never showed it. Stage 3: no unsteadier there than anywhere.
        // You always run a course once yourself first (the owner's call).
        stage2: 0.35, stage3: 0.75, unseen: 2.5,
        marks: 10,          // Marks a point, before the speed bonus
        bonusMin: 0.5, bonusMax: 2,
    };
    // What can go in a slot. `points`: what clearing it is worth. `needs`: skills learned before you are given it.
    const OBSTACLES = {
        gap: { name: 'Gap', points: 1, needs: 0 },
        wall: { name: 'Wall', points: 2, needs: 1 },
        spikes: { name: 'Spikes', points: 2, needs: 2 },
        boost: { name: 'Booster', points: 0, needs: 3, ability: true },
    };
    const ORDER = ['gap', 'wall', 'spikes', 'boost'];
    const palette = skills => ORDER.filter(k => OBSTACLES[k].needs <= skills);
    const emptyCourse = (o = COURSE) => Array.from({ length: o.slots }, () => null);
    const cleanCourse = (c, o = COURSE) => Array.from({ length: o.slots }, (_, i) => (Array.isArray(c) && OBSTACLES[c[i]] ? c[i] : null));
    const length = (o = COURSE) => o.lead + o.slots * o.slot + o.tail;
    const points = course => course.reduce((n, k) => n + (k ? OBSTACLES[k].points : 0), 0);

    // The track's hazards, left to right: holes ({ type: 'hole', x0, x1 }), walls ({ type: 'wall', x0, x1, h }) and
    // booster pads ({ type: 'pad', x0, x1 }), each with its slot and whether it is the last hazard of its obstacle.
    function layout(course, o = COURSE) {
        const out = [];
        course.forEach((kind, i) => {
            const base = o.lead + i * o.slot, c = base + o.slot / 2;
            if (kind === 'gap') out.push({ type: 'hole', slot: i, x0: c - o.gap / 2, x1: c + o.gap / 2, last: true });
            else if (kind === 'wall') out.push({ type: 'wall', slot: i, x0: c - o.wallW / 2, x1: c + o.wallW / 2, h: o.wallH, last: true });
            else if (kind === 'spikes') { const w = o.spikeGap, l = o.spikeLand; out.push({ type: 'hole', slot: i, x0: c - l / 2 - w, x1: c - l / 2, last: false }, { type: 'hole', slot: i, x0: c + l / 2, x1: c + l / 2 + w, last: true }); }
            else if (kind === 'boost') out.push({ type: 'pad', slot: i, x0: base + 0.5, x1: base + 0.5 + o.boostPad, last: true });
        });
        return out;
    }

    // A run: stepped in real time for the player (`down`, `up`, `step`), or fed a list of presses ([{ t, hold }]).
    function createRun(course, o = COURSE) {
        const haz = layout(course, o), end = length(o);
        const s = { t: 0, x: 0, y: 0, vy: 0, air: false, charging: -1, boostEnd: -1, perfectUntil: -1, over: false, finished: false, failed: null,
            cleared: [], perfects: 0, presses: [], events: [], next: 0, jumps: 0, buf: null };
        const speed = () => o.speed * (s.x < s.boostEnd ? o.boost : 1) * (s.t < s.perfectUntil ? o.perfectSpeed : 1) * (s.air ? o.air : s.charging >= 0 ? o.charge : 1);
        // A press in the air is kept and acted on at touchdown (`buf`): pressed and let go in the air it is a hop the
        // moment you land; still held, the charge starts from the landing.
        const leap = held => { const hold = Math.min(o.holdMax, Math.max(0, held)); s.vy = o.jump + (o.jumpMax - o.jump) * (hold / o.holdMax); s.air = true; s.jumps++; s.events.push({ type: 'jump', x: s.x, t: s.t, hold }); };
        function down() {
            if (s.over || s.charging >= 0 || s.buf) return;
            if (s.air) s.buf = { t: s.t, hold: null }; else s.charging = s.t;
        }
        function up() {
            if (s.over) return;
            if (s.buf && s.buf.hold == null) { s.buf.hold = s.t - s.buf.t; s.presses.push({ t: s.buf.t, hold: s.buf.hold }); return; }
            if (s.charging < 0) return;
            const held = s.t - s.charging;
            s.presses.push({ t: s.charging, hold: held });
            s.charging = -1;
            leap(held);
        }
        const fail = h => { s.over = true; s.failed = { slot: h.slot, kind: course[h.slot], type: h.type, x: Math.min(s.x, h.x1), endX: h.x1, t: s.t }; s.events.push({ type: 'fail', slot: h.slot, x: s.x, t: s.t }); };
        function step() {
            if (s.over) return;
            const x0 = s.x;
            s.t += o.step; s.x += speed() * o.step;
            if (s.air) {
                s.vy -= o.gravity * o.step; s.y += s.vy * o.step;
                if (s.y <= 0) {
                    s.y = 0; s.vy = 0; s.air = false;
                    const hole = haz.find(h => h.type === 'hole' && s.x > h.x0 && s.x < h.x1);
                    if (hole) return fail(hole);
                    const past = haz.find(h => h.type !== 'pad' && s.x >= h.x1 && s.x - h.x1 <= o.perfect);
                    if (past) { s.perfectUntil = s.t + o.perfectTime; s.perfects++; s.events.push({ type: 'perfect', slot: past.slot, x: s.x, t: s.t }); }
                    if (s.buf) { const b = s.buf; s.buf = null; if (b.hold == null) s.charging = s.t; else leap(0); }
                }
            } else {
                const hole = haz.find(h => h.type === 'hole' && s.x > h.x0 && s.x < h.x1);
                if (hole) return fail(hole);
                const pad = haz.find(h => h.type === 'pad' && s.x >= h.x0 && x0 < h.x1 && s.boostEnd < h.x0);
                if (pad) { s.boostEnd = pad.x0 + o.boostLen; s.events.push({ type: 'boost', slot: pad.slot, x: s.x, t: s.t }); }
            }
            const wall = haz.find(h => h.type === 'wall' && s.x > h.x0 && x0 < h.x1 && s.y < h.h);
            if (wall) return fail(wall);
            while (s.next < haz.length && s.x >= haz[s.next].x1) { const h = haz[s.next++]; if (h.last && h.type !== 'pad') { s.cleared.push(h.slot); s.events.push({ type: 'clear', slot: h.slot, x: s.x, t: s.t }); } }
            if (s.x >= end) { s.over = true; s.finished = true; }
        }
        return { state: s, haz, end, down, up, step };
    }
    // The whole run from a list of presses. `score` is filled in by `result`.
    function simulate(course, presses, o = COURSE) {
        const run = createRun(course, o), s = run.state, list = presses.map(p => ({ t: p.t, hold: Math.max(0, p.hold) })).sort((a, b) => a.t - b.t);
        let i = 0, release = -1;
        for (let guard = 0; guard < 120 * 120 && !s.over; guard++) {
            if (release >= 0 && s.t >= release) { run.up(); release = -1; }
            while (i < list.length && s.t >= list[i].t && release < 0) { const p = list[i++]; run.down(); release = p.t + p.hold; if (p.hold <= 0) { run.up(); release = -1; } }
            run.step();
        }
        return result(course, run, o);
    }
    function result(course, run, o = COURSE) {
        const s = run.state, pts = s.cleared.reduce((n, slot) => n + OBSTACLES[course[slot]].points, 0);
        return { finished: s.finished, failed: s.failed, time: s.t, cleared: s.cleared.slice(), points: pts, perfects: s.perfects, jumps: s.jumps, presses: s.presses.slice(), events: s.events.slice() };
    }

    // The cleanest way through: for each hazard in turn, the earliest jump (with the least charge) that gets past it,
    // which is the one that lands just beyond it. What the AI's timing moves toward as it masters the track.
    function bestPresses(course, o = COURSE) {
        const presses = [];
        for (let guard = 0; guard < 4 * o.slots; guard++) {
            const r = simulate(course, presses, o);
            if (r.finished || !r.failed) break;
            const f = r.failed;
            let found = null;
            for (let h = 0; h <= 7 && !found; h++) {
                const hold = o.holdMax * h / 7;
                for (let rel = f.t - 1; rel <= f.t + 0.02 && !found; rel += 1 / 120) {
                    if (rel - hold < (presses.length ? presses[presses.length - 1].t + presses[presses.length - 1].hold + 0.05 : 0)) continue;
                    const t = simulate(course, [...presses, { t: rel - hold, hold }], o);
                    if (t.finished || (t.failed && t.failed.x > f.endX)) found = { t: rel - hold, hold };
                }
            }
            if (!found) return null;   // cannot be done
            presses.push(found);
        }
        return simulate(course, presses, o).finished ? presses : null;
    }

    // A seeded generator and a bell-shaped number from it.
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const bell = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

    // How well it knows tracks in general, 0 to 1: from the courses it has run and the skills it has trained.
    const mastery = (runs, skills = 0, o = COURSE) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);

    const stage = (m, o = COURSE) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);
    // Can it be given this course after your run of it? { ok, why }: a cleared run always; a run you fell on from
    // stage 2, if the course can be done at all.
    function canHandOver(course, yourRun, m, o = COURSE) {
        if (!yourRun) return { ok: false, why: 'untried' };
        if (yourRun.finished) return { ok: true, why: 'cleared' };
        if (stage(m, o) < 2) return { ok: false, why: 'stage' };
        return bestPresses(course, o) ? { ok: true, why: 'beyond' } : { ok: false, why: 'impossible' };
    }
    // The AI's presses for one attempt (the owner: "both"): it starts from the jumps of yours that got you past
    // something, moves each toward the cleanest timing by its mastery, and its hands shake. `fixes[i]`: how many times
    // it has already failed at the hazard press i is for (each halves the shake there).
    function aiPresses(course, yours, best, a, o = COURSE) {
        const r = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), used = new Set();
        return best.map((b, i) => {
            const bRel = b.t + b.hold;
            let pick = -1;
            yours.forEach((p, k) => { const d = Math.abs(p.t + p.hold - bRel); if (!used.has(k) && d < 0.6 && (pick < 0 || d < Math.abs(yours[pick].t + yours[pick].hold - bRel))) pick = k; });
            const p = pick >= 0 ? yours[pick] : b;
            if (pick >= 0) used.add(pick);
            const sigma = o.sigma * (1 - m) * (pick < 0 ? a.unseen || 1 : 1) * 0.5 ** ((a.fixes && a.fixes[i]) || 0) + o.sigmaFloor;
            const hold = Math.max(0, Math.min(o.holdMax, p.hold + m * (b.hold - p.hold) + 0.4 * sigma * bell(r)));
            const rel = (p.t + p.hold) + m * (bRel - (p.t + p.hold)) + sigma * bell(r);
            return { t: Math.max(0, rel - hold), hold };
        });
    }
    // What it aims for: the cleanest line, each jump a moment later (the very earliest is a knife edge), by as much
    // of `margin` as still gets through.
    function aimPresses(course, best, o = COURSE) {
        for (const m of [o.margin, o.margin * 0.6, o.margin * 0.3, 0]) { const aim = best.map(p => ({ t: p.t + m, hold: p.hold })); if (simulate(course, aim, o).finished) return aim; }
        return best;
    }
    // Which of the best presses a failure belongs to: the one whose jump comes nearest before it.
    function pressFor(best, failed) {
        let k = 0;
        best.forEach((b, i) => { if (b.t <= failed.t + 0.05) k = i; });
        return k;
    }
    // The hand-over: up to `tries` attempts, each learning from where the last one failed. Returns every attempt
    // ({ presses, result }) and the score: its best finished run, or nothing.
    function handOver(course, yours, a, o = COURSE) {
        // (A course you cleared that the search could not: it works from your own jumps.)
        const shown = simulate(course, yours, o), found = bestPresses(course, o);
        if (!found && !shown.finished) return { attempts: [], score: null, best: null, impossible: true };
        const best = found || shown.presses;
        // What you showed it: the jumps of a run you cleared, or of one you fell on up to the fall.
        yours = shown.finished ? yours : yours.filter(p => p.t + p.hold <= shown.time - 0.05);
        const unseen = stage(a.mastery || 0, o) >= 3 ? 1 : o.unseen;
        const aim = aimPresses(course, best, o), fixes = best.map(() => 0), attempts = [];
        let top = null;
        for (let n = 0; n < (a.tries || o.tries); n++) {
            const presses = aiPresses(course, yours, aim, { seed: (a.seed + n * 7919) >>> 0, mastery: a.mastery, fixes, unseen }, o), res = simulate(course, presses, o);
            attempts.push({ presses, result: res });
            if (res.finished) { if (!top || res.time < top.time) top = res; if (n >= 1) break; }   // a clear, then one more go at a better time
            else if (res.failed) fixes[pressFor(aim, res.failed)]++;
        }
        return { attempts, score: top, best };
    }
    // What a cleared course pays: Marks for its points, times how its time compares with yours (on a course you
    // could not clear, with its own best there: the owner's call; with neither, no bonus either way).
    function marksFor(course, res, yourTime, o = COURSE) {
        if (!res || !res.finished) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, yourTime > 0 ? yourTime / res.time : 1));
        return Math.round(points(course) * o.marks * bonus);
    }

    return { COURSE, OBSTACLES, ORDER, palette, emptyCourse, cleanCourse, length, points, layout, createRun, simulate, result, bestPresses, aimPresses, mastery, stage, canHandOver, aiPresses, pressFor, handOver, marksFor, rng };
});
