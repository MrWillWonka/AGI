// evals.js — Evals, the third bay's minigame (design/evals.md, design/evals-plan.md): a run is a streak of captchas,
// each harder than the last, on a few lives, and the AI learns each kind by watching you solve it.
// Built so far: the run, one family, **Pick** (tap every square that holds the thing named), in three kinds (a plain
// thing, a scene, "every square without"), and **the learner** (stage 2): per kind it keeps how well it has learned
// (`m`, 0 to 1), a few traces of your own solves and how often you get one wrong. Its attempt at a captcha (`ghostAttempt`) is your
// play, played back: your order, your rhythm, your mistakes and your take-backs, with noise that shrinks as `m` rises,
// slower than you at first and faster in the end, and never perfect. When it has been right and done before you often
// enough (`overtake`), it **takes the kind over**: the kind leaves your runs.
// A captcha is plain data: the screen (evals-ui.js) shows it and hands back an answer and a trace of how you solved it.
// Each family has `make(rand, level, o, taken)` and `judge(captcha, answer)`.
// Pure and deterministic: no DOM, no clock, no Math.random (a seeded generator). Loaded in the browser as
// window.Evals and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Evals = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The base numbers, in one place. A run takes overrides of any of them. The learner's are first guesses, to tune on
    // the owner's first log.
    const EVALS = {
        lives: 3,          // misses a run allows
        comboFrom: 2,      // Pick: scenes of two things (a duck in a top hat) from this level
        withoutFrom: 5,    // Pick: "every square without …" from this level
        bigFrom: 7,        // Pick: a 4 × 4 grid from this level
        // The learner.
        // The owner's calls on the first play (2026-11-11): 8 solves to lose a kind was "WAY too quick, it should feel
        // bad for a good while and it should still make mistakes every now and then. Much more time copying and
        // mimicking the player and their quirks", and its speed went too fast from faster to "I can't keep up". So a
        // clean player keeps a kind about 40 solves, in three phases by how much it has learned (`PHASES`): bad, then a
        // long stretch mimicking you at about your own pace, then edging ahead to the same top speed as before.
        learnSolves: 46,   // clean solves it must watch to learn a kind fully (a brisk one counts 1.3: about 35 of those)
        learnWrong: 0.25,  // a wrong answer teaches it this share of a clean one (and its mistakes)
        learnSlow: 0.6,    // a right but slow solve teaches this share; a quick one 1.3 (`learnQuick`)
        learnQuick: 1.3,
        // A brisk solve: this many seconds, plus `parScan` a square to look over and `parCell` a right square to tap.
        // (The owner's second play: 8 s on a 4 × 4 scene counted as slow against a par of 3.4 s, so it learned less.)
        parBase: 2, parScan: 0.2, parCell: 0.5,
        traces: 10,        // solves of yours it keeps per kind
        ghostTap: 0.3,     // before it has seen you solve one, the chance it taps any square
        ghostSlip: 0.1,    // it never stops slipping: this often it gets one square wrong, however much it has learned
        undoMax: 0.6,      // at most this often it copies your habit of tapping a square and taking it back
        // Taking a kind over is earned over many captchas: +1 each time it is right and done before you (or right
        // when you were wrong), -1 each time it isn't, never under 0. At `overtake` the kind is its.
        overtake: 8,
    };
    // The three phases, by how much it has learned (`m`): [m, its pace against yours, how surely it knows a square
    // (0 a guess, 1 certain)]. Bad to 0.3; mimicking you, at about your pace and often wrong, to 0.7; then ahead.
    // Its pace passes yours at about 0.68 and takes the last third of the learning to reach its top speed, a steady
    // climb (the owner: it went too fast from "it's faster" to "I can't keep up").
    const PHASES = [[0, 2.4, 0], [0.3, 1.5, 0.25], [0.6, 1.1, 0.72], [0.7, 0.9625, 0.9], [1, 0.55, 1]];
    const phase = (m, col) => {
        for (let j = 1; j < PHASES.length; j++) {
            const a = PHASES[j - 1], b = PHASES[j];
            if (m <= b[0]) return a[col] + (b[col] - a[col]) * (m - a[0]) / (b[0] - a[0]);
        }
        return PHASES[PHASES.length - 1][col];
    };
    // Your pace before it has seen you play: seconds to the first tap, between taps, and from the last tap to Verify.
    const PACE = { first: 1.4, gap: 0.7, verify: 0.9 };

    // Mulberry32: small, fast, seeded (as packet-snare.js).
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const int = (rand, n) => Math.floor(rand() * n);
    const pick = (rand, list) => list[int(rand, list.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    function shuffle(rand, list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = int(rand, i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    const median = (list, fallback) => {
        if (!list.length) return fallback;
        const a = list.slice().sort((x, y) => x - y);
        return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    };

    // Pick's pictures are emoji (the owner's call: all kinds of things, the wilder the better, and no art to make).
    // A checked list: single code points from old emoji sets that every phone and Windows draws, each with a name that
    // can't be argued with. `a` is its article.
    const THINGS = [
        ['🌵', 'cactus', 'a'], ['🐙', 'octopus', 'an'], ['🍌', 'banana', 'a'], ['🚀', 'rocket', 'a'],
        ['🐌', 'snail', 'a'], ['🍕', 'slice of pizza', 'a'], ['🎺', 'trumpet', 'a'], ['🧀', 'wedge of cheese', 'a'],
        ['🌋', 'volcano', 'a'], ['🐸', 'frog', 'a'], ['🍄', 'mushroom', 'a'], ['🎈', 'balloon', 'a'],
        ['🚲', 'bicycle', 'a'], ['🚌', 'bus', 'a'], ['🔑', 'key', 'a'], ['👻', 'ghost', 'a'],
        ['🤖', 'robot', 'a'], ['🐝', 'bee', 'a'], ['🌙', 'moon', 'a'], ['🍩', 'doughnut', 'a'],
        ['🎻', 'violin', 'a'], ['🐢', 'turtle', 'a'], ['🍉', 'watermelon', 'a'], ['🚜', 'tractor', 'a'],
        ['🐳', 'whale', 'a'], ['🌭', 'hot dog', 'a'], ['🐧', 'penguin', 'a'], ['🎃', 'pumpkin', 'a'],
    ].map(([glyph, name, a]) => ({ glyph, name, a }));
    // Things worn on top of another thing, for scenes: "a frog in a top hat". Each differs from the others in shape
    // and colour at a square's size (a graduation cap read as a second top hat).
    const HATS = [
        ['🎩', 'in a top hat'], ['👑', 'wearing a crown'], ['🎀', 'with a bow'], ['🌸', 'wearing a flower'],
    ].map(([glyph, phrase]) => ({ glyph, phrase }));

    // The kinds of captcha, in the order a run meets them, with the name a takeover is announced by.
    const KINDS = {
        'pick.thing': { family: 'pick', name: 'plain picture grids' },
        'pick.scene': { family: 'pick', name: 'picture grids with scenes' },
        'pick.without': { family: 'pick', name: '"every square without" grids' },
    };

    const sameCell = (c, t) => c.thing === t.thing && (c.hat || '') === (t.hat || '');
    // The squares a Pick captcha's own cells say are right. `make` stores this as `answer`; tests recompute it.
    function pickTargets(c) {
        const out = [];
        c.cells.forEach((cell, i) => { if (sameCell(cell, c.target) !== !!c.without) out.push(i); });
        return out;
    }

    const FAMILIES = {
        // Pick: a grid of squares, each a thing (and in a scene maybe a hat on it). Tap every square that holds the
        // target, or every square that doesn't. There is always at least one right square and one wrong one, and no
        // square is arguable: a scene is the target or it isn't. The level picks the kind (a plain thing, a scene from
        // `comboFrom`, "without" some of the time from `withoutFrom`); a kind the AI has taken over (`taken`) gives way
        // to the next one it hasn't, harder first. Returns null when it has taken them all.
        pick: {
            make(rand, level, o = EVALS, taken = null) {
                const side = level >= o.bigFrom ? 4 : 3;
                const n = side * side;
                let kind = level >= o.withoutFrom && rand() < 0.4 ? 'pick.without' : level >= o.comboFrom ? 'pick.scene' : 'pick.thing';
                const roll2 = rand();
                if (taken && taken[kind]) {
                    const order = ['pick.thing', 'pick.scene', 'pick.without'];
                    const from = order.indexOf(kind);
                    kind = [...order.slice(from + 1), ...order.slice(0, from).reverse()].find(k => !taken[k]) || null;
                    if (!kind) return null;
                }
                const without = kind === 'pick.without';
                // "Without" asks about a scene once scenes have come up, a plain thing before.
                const combo = kind === 'pick.scene' || (without && (level >= o.comboFrom || roll2 < 0.5));
                const things = shuffle(rand, THINGS);
                const hats = shuffle(rand, HATS);
                const target = { thing: things[0].glyph, hat: combo ? hats[0].glyph : '' };
                // How many squares hold the target: 2–4 on a small grid, more on a big one.
                const want = 2 + int(rand, side === 4 ? 4 : 3);
                const cells = [];
                for (let i = 0; i < want; i++) cells.push({ thing: target.thing, hat: target.hat });
                // The rest: near misses first in a scene (the right thing with no hat or the wrong hat, the right hat
                // on the wrong thing), then anything else.
                const others = things.slice(1, 1 + 3 + Math.min(4, level));
                while (cells.length < n) {
                    let cell;
                    const roll = rand();
                    if (combo && roll < 0.25) cell = { thing: target.thing, hat: rand() < 0.5 ? '' : hats[1].glyph };
                    else if (combo && roll < 0.5) cell = { thing: pick(rand, others).glyph, hat: target.hat };
                    else cell = { thing: pick(rand, others).glyph, hat: combo && rand() < 0.3 ? pick(rand, hats).glyph : '' };
                    if (!sameCell(cell, target)) cells.push(cell);
                }
                const thing = things[0];
                const scene = combo ? `${thing.a} ${thing.name} ${hats[0].phrase}` : `${thing.a} ${thing.name}`;
                const c = {
                    family: 'pick', kind, level, side, target, without, scene,
                    prompt: without ? `Tap every square without ${scene}.` : `Tap every square with ${scene}.`,
                    cells: shuffle(rand, cells),
                };
                c.answer = pickTargets(c);
                return c;
            },
            // The answer is the set of squares tapped: every right one and no wrong one, in any order.
            judge(c, answer) {
                if (!Array.isArray(answer)) return false;
                const got = [...new Set(answer)].sort((a, b) => a - b);
                return got.length === c.answer.length && got.every((v, i) => v === c.answer[i]);
            },
        },
    };

    // The families a run draws from, in order.
    const ORDER = ['pick'];

    // ---- The learner ----
    // What the AI has learned, kept in the save (engine.js `state.evals.learn`): per kind `m` (0 to 1), `solves` it has
    // watched, `ahead` (its score toward taking the kind over: see `overtake`), `taken`, `wrongs` (how many of those solves
    // you got wrong) and `traces`, your last few solves.
    const newLearn = () => ({ kinds: {} });
    function kindOf(learn, kind) {
        if (!learn.kinds[kind]) learn.kinds[kind] = { m: 0, solves: 0, ahead: 0, taken: false, wrongs: 0, traces: [] };
        return learn.kinds[kind];
    }
    const takenMap = learn => {
        const out = {};
        for (const k of Object.keys(learn.kinds)) if (learn.kinds[k].taken) out[k] = true;
        return out;
    };
    // How often you get a captcha of this kind wrong, pulled toward never until it has seen a few.
    const errorRate = k => k.wrongs / (k.solves + 4);
    // A brisk solve of this captcha, in seconds.
    const par = (c, o = EVALS) => o.parBase + o.parScan * c.cells.length + o.parCell * c.answer.length;

    // A trace is how you solved one captcha: `taps` ([{ i, t }]: the squares left picked at Verify, in the order you
    // first tapped them, `t` seconds after it showed), `seconds` to Verify, `side`, `correct`, and `undos` (squares you
    // tapped and took back). Bounded and cleaned here, whatever the screen (or an old save) hands in.
    function cleanTrace(t, side) {
        const n = side * side;
        const taps = [];
        for (const tap of Array.isArray(t?.taps) ? t.taps.slice(0, 40) : []) {
            const i = Math.floor(+tap?.i), at = +tap?.t;
            if (Number.isInteger(i) && i >= 0 && i < n && at >= 0 && at < 600) taps.push({ i, t: Math.round(at * 100) / 100 });
        }
        taps.sort((a, b) => a.t - b.t);
        const last = taps.length ? taps[taps.length - 1].t : 0;
        return { side, correct: !!t?.correct, seconds: clamp(+t?.seconds || 0, last, 600), undos: clamp(Math.floor(+t?.undos || 0), 0, 20), taps };
    }

    // It watches you answer `c`: it learns (more from a right, quick solve), keeps the trace and counts your mistakes.
    // Returns how much it learned.
    function watch(learn, c, trace, correct, o = EVALS) {
        const k = kindOf(learn, c.kind);
        const t = cleanTrace({ ...trace, correct }, c.side);
        k.solves++;
        if (!correct) k.wrongs++;
        k.traces.push(t);
        while (k.traces.length > o.traces) k.traces.shift();
        let share = o.learnWrong;
        if (correct) {
            // From `learnQuick` at par or better down to `learnSlow` at three times par.
            const slow = clamp((t.seconds / par(c, o) - 1) / 2, 0, 1);
            share = lerp(o.learnQuick, o.learnSlow, slow);
        }
        const gain = Math.min(1 - k.m, share / o.learnSolves);
        k.m += gain;
        return gain;
    }

    // Your habits on a kind, read from your traces: your pace (the middle of it as `first`, `gap`, `verify`, and every
    // pause you made as `firsts`, `gaps`, `verifies`, so it can play your rhythm and not an average), how often you tap a
    // square and take it back (`undo`, a solve), and where on the grid you tend to start and go next (`rank(i, side)`:
    // the average place in your tapping order of the squares near there, lower is sooner).
    function habits(k) {
        const first = [], gaps = [], verify = [];
        const spots = [];   // { x, y, r }: a tap's place on the grid (0 to 1) and its place in the order (0 to 1)
        for (const t of k.traces) {
            if (!t.taps.length) continue;
            first.push(t.taps[0].t);
            for (let j = 1; j < t.taps.length; j++) gaps.push(t.taps[j].t - t.taps[j - 1].t);
            verify.push(t.seconds - t.taps[t.taps.length - 1].t);
            t.taps.forEach((tap, j) => spots.push({
                x: (tap.i % t.side + 0.5) / t.side, y: (Math.floor(tap.i / t.side) + 0.5) / t.side,
                r: t.taps.length > 1 ? j / (t.taps.length - 1) : 0,
            }));
        }
        const rank = (i, side) => {
            if (!spots.length) return 0.5;
            const x = (i % side + 0.5) / side, y = (Math.floor(i / side) + 0.5) / side;
            let sum = 0, weight = 0;
            for (const s of spots) {
                const w = 1 / (0.02 + (s.x - x) ** 2 + (s.y - y) ** 2);
                sum += w * s.r;
                weight += w;
            }
            return sum / weight;
        };
        const undo = k.traces.length ? k.traces.filter(t => t.undos > 0).length / k.traces.length : 0;
        return { first: median(first, PACE.first), gap: median(gaps, PACE.gap), verify: median(verify, PACE.verify),
            firsts: first, gaps, verifies: verify, undo, rank, seen: spots.length > 0 };
    }

    // Its attempt at `c`, decided when the captcha shows: which squares it taps and when, and when it presses Verify.
    // **It copies before it understands** (the owner's second play: over a 42-captcha run it "didn't seem to copy me
    // or improve": it guessed each square alone, so on a 4 × 4 grid it looked random until it had nearly finished
    // learning, and nothing it did looked like the player). For each square it either knows the answer (more often as
    // it learns: `PHASES`' third column) or does what you did on your last one of these: the same places on the grid,
    // in your order. So from your second solve on it is recognisably you, and wrong because the pictures have moved;
    // as it learns, more of its squares are right. Its pace follows `PHASES`; it slips on one square now and then,
    // and as often again as you get one of these wrong. `off` is how many squares its answer was wrong by.
    function ghostAttempt(learn, c, rand, o = EVALS) {
        const k = kindOf(learn, c.kind);
        const m = k.m, h = habits(k);
        const right = new Set(c.answer);
        const know = phase(m, 2);
        // Where you tapped last time, on this grid (a 3 × 3 trace is stretched onto a 4 × 4 grid and back), and when.
        const last = k.traces.length ? k.traces[k.traces.length - 1] : null;
        const copied = new Map();
        const onto = (v, from) => Math.min(c.side - 1, Math.floor((v + 0.5) / from * c.side));
        if (last) last.taps.forEach((tap, j) => {
            const i = onto(Math.floor(tap.i / last.side), last.side) * c.side + onto(tap.i % last.side, last.side);
            if (!copied.has(i)) copied.set(i, j / Math.max(1, last.taps.length - 1));
        });
        let chosen = [];
        for (let i = 0; i < c.cells.length; i++) {
            const r = rand(), guess = rand();
            const tap = r < know ? right.has(i) : last ? copied.has(i) : guess < o.ghostTap;
            if (tap) chosen.push(i);
        }
        // Its own slips never stop, and yours come on top as it learns you.
        const slip = rand() < o.ghostSlip + (1 - o.ghostSlip) * errorRate(k) * m, where = int(rand, c.cells.length);
        if (slip) chosen = chosen.includes(where) ? chosen.filter(i => i !== where) : [...chosen, where];
        // Your order from the first solve it watched: a square you tapped last time keeps its place in that order, any
        // other goes where you tend to go on the grid. A little noise, fading as it learns.
        const key = new Map(chosen.map(i => [i, (h.seen ? (copied.has(i) && know < 1 ? lerp(copied.get(i), h.rank(i, c.side), know) : h.rank(i, c.side)) : rand()) + rand() * 0.1 * (1 - m)]));
        chosen.sort((a, b) => key.get(a) - key.get(b));
        const pace = phase(m, 1);
        const wobble = () => 1 + (rand() - 0.5) * 0.5 * (1 - m);
        // Your rhythm: each pause is one you really made (more so as it learns), not the middle of them all.
        const beat = (list, mid) => { const r = rand(), s = rand(); return (list.length && s < m ? list[Math.floor(r * list.length)] : mid) * pace * wobble(); };
        const r2 = n => Math.round(n * 100) / 100;
        let t = beat(h.firsts, h.first);
        const taps = [];
        // Your habit of tapping a square and taking it back: as often as you do, it taps a wrong square on the way
        // and takes it back a moment later (`off`).
        const wrongs = c.cells.map((_, i) => i).filter(i => !chosen.includes(i));
        const feint = rand() < Math.min(o.undoMax, h.undo) * m && wrongs.length ? { at: int(rand, chosen.length + 1), i: wrongs[int(rand, wrongs.length)] } : null;
        const undo = () => { const gap = beat(h.gaps, h.gap); taps.push({ i: feint.i, t: r2(t), off: r2(t + gap * 0.7) }); t += gap * 1.4; };
        chosen.forEach((i, j) => {
            if (feint && feint.at === j) undo();
            taps.push({ i, t: r2(t) });
            t += beat(h.gaps, h.gap);
        });
        if (feint && feint.at === chosen.length) undo();
        const lastTap = taps.length ? Math.max(...taps.map(tap => tap.off ?? tap.t)) : t;
        const seconds = r2(lastTap + beat(h.verifies, h.verify));
        let off = 0;
        for (let i = 0; i < c.cells.length; i++) if (chosen.includes(i) !== right.has(i)) off++;
        return { taps, seconds, answer: chosen.slice().sort((a, b) => a - b), correct: FAMILIES[c.family].judge(c, chosen), off, m };
    }

    // A run. opts: { seed, learn, ...any EVALS override }. `current` is the captcha up and `ghost` the AI's attempt at
    // it; `submit(answer, seconds, trace)` judges your answer, lets it watch, moves on and returns what happened. A
    // right answer raises the level; a miss costs a life and the next captcha stays at the same level. The run is over
    // when the lives are gone, or when the AI has taken over every kind there is (`exhausted`).
    function createRun(opts = {}) {
        const o = Object.assign({}, EVALS, opts);
        const rand = rng(o.seed ?? 1);
        // Its attempts draw from their own stream, so what it does never changes which captchas come up.
        const ghostRand = rng((o.seed ?? 1) ^ 0x9E3779B9);
        const learn = o.learn || newLearn();
        const run = {
            opts: o, learn, lives: o.lives, level: 0, solved: 0, missed: 0, streak: 0, bestStreak: 0, over: false, exhausted: false,
            current: null, ghost: null, takeovers: [],
            // One line per captcha answered: what it was, whether you and it were right and how long each took.
            log: [],
        };
        const next = () => {
            const family = ORDER[run.log.length % ORDER.length];
            run.current = FAMILIES[family].make(rand, run.level, o, takenMap(learn));
            if (!run.current) { run.over = true; run.exhausted = true; run.ghost = null; return; }
            run.ghost = ghostAttempt(learn, run.current, ghostRand, o);
        };
        run.submit = function (answer, seconds = 0, trace = null) {
            if (run.over || !run.current) return null;
            const c = run.current, ghost = run.ghost;
            seconds = Math.max(0, +seconds || 0);
            const correct = FAMILIES[c.family].judge(c, answer);
            // It was ahead if it was right and either done before you or you were wrong.
            const ahead = ghost.correct && (!correct || ghost.seconds < seconds);
            const k = kindOf(learn, c.kind);
            const learned = watch(learn, c, trace || { taps: (Array.isArray(answer) ? answer : []).map((i, j) => ({ i, t: seconds * (j + 1) / (answer.length + 1) })), seconds }, correct, o);
            k.ahead = Math.max(0, k.ahead + (ahead ? 1 : -1));
            let takeover = null;
            if (k.ahead >= o.overtake && !k.taken) {
                k.taken = true;
                takeover = c.kind;
                run.takeovers.push(c.kind);
            }
            run.log.push({ family: c.family, kind: c.kind, level: c.level, correct, seconds, ghost: ghost.correct, ghostSeconds: ghost.seconds, ghostOff: ghost.off, m: k.m });
            if (correct) {
                run.solved++;
                run.streak++;
                run.bestStreak = Math.max(run.bestStreak, run.streak);
                run.level++;
            } else {
                run.missed++;
                run.streak = 0;
                run.lives--;
            }
            const result = { correct, answer: c.answer.slice(), captcha: c, ghost, ahead, learned, takeover, lives: run.lives };
            if (run.lives <= 0) { run.over = true; run.current = null; run.ghost = null; } else next();
            result.over = run.over;
            result.exhausted = run.exhausted;
            return result;
        };
        next();
        return run;
    }

    return { EVALS, PACE, PHASES, phase, FAMILIES, KINDS, ORDER, THINGS, HATS, rng, createRun, pickTargets, newLearn, kindOf, takenMap, watch, habits, ghostAttempt, cleanTrace, errorRate, par };
});
