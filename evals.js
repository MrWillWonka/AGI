// evals.js — Evals, the third bay's minigame (design/evals.md, design/evals-plan.md): a run is a streak of captchas,
// each harder than the last, on a few lives. This is stage 1 of the plan: the run and one family, **Pick** (tap every
// square that holds the thing named). The ghost hand (the AI learning from your solves) is stage 2; the other
// families follow.
// A captcha is plain data: the screen (evals-ui.js) shows it and hands back an answer, and `judge` says whether it's
// right. Each family has `make(rand, level)` and `judge(captcha, answer)`.
// Pure and deterministic: no DOM, no clock, no Math.random (a seeded generator). Loaded in the browser as
// window.Evals and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Evals = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The base numbers, in one place. A run takes overrides of any of them.
    const EVALS = {
        lives: 3,          // misses a run allows
        comboFrom: 2,      // Pick: scenes of two things (a duck in a top hat) from this level
        withoutFrom: 5,    // Pick: "every square without …" from this level
        bigFrom: 7,        // Pick: a 4 × 4 grid from this level
    };

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
    function shuffle(rand, list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = int(rand, i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

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

    const sameCell = (c, t) => c.thing === t.thing && (c.hat || '') === (t.hat || '');
    // The squares a Pick captcha's own cells say are right. `make` stores this as `answer`; tests recompute it.
    function pickTargets(c) {
        const out = [];
        c.cells.forEach((cell, i) => { if (sameCell(cell, c.target) !== !!c.without) out.push(i); });
        return out;
    }

    const FAMILIES = {
        // Pick: a grid of squares, each a thing (and from `comboFrom` maybe a hat on it). Tap every square that holds
        // the target, or from `withoutFrom` every square that doesn't. There is always at least one right square and
        // one wrong one, and no square is arguable: a scene is the target or it isn't.
        pick: {
            make(rand, level, o = EVALS) {
                const side = level >= o.bigFrom ? 4 : 3;
                const n = side * side;
                const combo = level >= o.comboFrom;
                const without = level >= o.withoutFrom && rand() < 0.4;
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
                    family: 'pick', kind: without ? 'pick.without' : combo ? 'pick.scene' : 'pick.thing',
                    level, side, target, without, scene,
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

    // The families a run draws from, in order. Stage 1 has one.
    const ORDER = ['pick'];

    // A run. opts: { seed, ...any EVALS override }. `current` is the captcha up; `submit(answer, seconds)` judges it,
    // moves on and returns what happened. A right answer raises the level; a miss costs a life and the next captcha
    // stays at the same level. The run is over when the lives are gone.
    function createRun(opts = {}) {
        const o = Object.assign({}, EVALS, opts);
        const rand = rng(o.seed ?? 1);
        const run = {
            opts: o, lives: o.lives, level: 0, solved: 0, missed: 0, streak: 0, bestStreak: 0, over: false,
            current: null,
            // One line per captcha answered: what it was, whether it was right and how long it took. The ghost hand
            // will learn from these.
            log: [],
        };
        const next = () => {
            const family = ORDER[run.log.length % ORDER.length];
            run.current = FAMILIES[family].make(rand, run.level, o);
        };
        run.submit = function (answer, seconds = 0) {
            if (run.over || !run.current) return null;
            const c = run.current;
            const correct = FAMILIES[c.family].judge(c, answer);
            run.log.push({ family: c.family, kind: c.kind, level: c.level, correct, seconds: Math.max(0, +seconds || 0) });
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
            const result = { correct, answer: c.answer.slice(), captcha: c, lives: run.lives, over: run.lives <= 0 };
            if (run.lives <= 0) { run.over = true; run.current = null; } else next();
            return result;
        };
        next();
        return run;
    }

    return { EVALS, FAMILIES, ORDER, THINGS, HATS, rng, createRun, pickTargets };
});
