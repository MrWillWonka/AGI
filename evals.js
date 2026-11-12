// evals.js — Evals, the third bay's minigame (design/evals.md, design/evals-plan.md): a run is a streak of captchas,
// each harder than the last, on a few lives, and the AI learns each kind by watching you solve it.
//
// **A captcha is plain data.** Whatever its family, it is a prompt, a few numbered `targets` to tap (squares, letter
// tiles, answers, slots, pads, a tick box) and a `mode`: `set` (tap the right ones, in any order; `single` when there
// is exactly one), `seq` (tap them in the right order: judged by the targets' values, `want`, so either of two tiles
// with the same letter will do) or `tick` (one box, judged on how you ticked it). `layout` and `show` tell the screen
// (evals-ui.js) how to draw it. Because every family is taps on targets, one learner serves them all.
//
// **Families** (the owner's catalogue, design/evals.md), each with one or two kinds so far:
//   read      a warped word and a tray of letters                         read.word, read.struck
//   answer    a sum, in figures or in words                              answer.sum, answer.words
//   pick      every square with (or without) a thing or a scene           pick.thing, pick.scene, pick.without
//   handle    slide the piece into its slot; tap things in a shown order  handle.slide, handle.order
//   listen    a pattern of beeps, shown as well as played, tapped back    listen.beeps
//   invisible "I'm not a robot": passed by being humanly imperfect        invisible.tick
//   future    where does the ball land; what changed                      future.drop, future.changed
//
// **The learner**: per kind it keeps how well it has learned (`m`, 0 to 1), how many solves it watched and how many
// you got wrong, and your last few solves as traces (what you tapped and when, your take-backs, and how your pointer
// moved). Its attempt at a captcha (`ghostAttempt`) is your play, played back: for each target it either knows the
// answer or does what you did on your last one of that kind; in your order, at your rhythm, with your take-backs and
// along the shapes your pointer drew; slower than you at first and faster in the end, and never perfect. When it has
// been right and done before you often enough (`overtake`), it **takes the kind over**: the kind leaves your runs.
//
// Pure and deterministic: no DOM, no clock, no Math.random (a seeded generator). Loaded in the browser as
// window.Evals and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Evals = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The base numbers, in one place. A run takes overrides of any of them. The learner's are first guesses, tuned on
    // the owner's plays (design/evals-plan.md).
    const EVALS = {
        lives: 3,          // misses a run allows
        comboFrom: 2,      // Pick: scenes of two things (a duck in a top hat) from this level
        withoutFrom: 5,    // Pick: "every square without …" from this level
        bigFrom: 7,        // Pick: a 4 × 4 grid from this level
        tickMin: 0.7,      // the tick box: ticked sooner than this is too quick to be a person
        tickBend: 1.03,    // …and a pointer path under this many times the straight line is too straight
        tickOff: 0.04,     // …and a tap closer to the box's dead centre than this share of it is too perfect
        // The learner. The owner's calls: a clean player keeps a kind about 40 solves, in three phases by how much it
        // has learned (`PHASES`): bad, then a long stretch mimicking you at about your pace, then edging ahead.
        learnSolves: 46,   // clean solves it must watch to learn a kind fully (a brisk one counts 1.3: about 35 of those)
        learnWrong: 0.25,  // a wrong answer teaches it this share of a clean one (and its mistakes)
        learnSlow: 0.6,    // a right but slow solve teaches this share; a quick one 1.3 (`learnQuick`)
        learnQuick: 1.3,
        // A brisk solve: this many seconds, plus `parScan` a target to look over and `parCell` a tap, plus any time the
        // captcha makes you wait (a pattern playing, a picture to remember).
        parBase: 2, parScan: 0.2, parCell: 0.5,
        traces: 10,        // solves of yours it keeps per kind
        paths: 3,          // …of which this many keep how your pointer moved
        ghostTap: 0.3,     // before it has seen you solve one, the chance it taps any target
        ghostSlip: 0.1,    // it never stops slipping: this often it gets one target wrong, however much it has learned
        undoMax: 0.6,      // at most this often it copies your habit of tapping a target and taking it back
        // Taking a kind over is earned over many captchas: +1 each time it is right and done before you (or right
        // when you were wrong), -1 each time it isn't, never under 0. At `overtake` the kind is its.
        overtake: 8,
    };
    // The three phases, by how much it has learned (`m`): [m, its pace against yours, how surely it knows a target
    // (0 not at all, 1 certain)]. Bad to 0.3; mimicking you, at about your pace and often wrong, to 0.7; then ahead.
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
    const r2 = n => Math.round(n * 100) / 100;
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

    // Pictures are emoji (the owner's call: all kinds of things, the wilder the better, and no art to make).
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
    const nameOf = new Map([...THINGS.map(t => [t.glyph, `${t.a} ${t.name}`]), ...HATS.map(h => [h.glyph, h.phrase])]);
    // Read's words: plain, five or six letters.
    const WORDS = ['model', 'token', 'layer', 'prompt', 'robot', 'human', 'signal', 'packet', 'server', 'neural', 'vision', 'logic',
        'cipher', 'kernel', 'vector', 'tensor', 'matrix', 'sample', 'binary', 'syntax', 'memory', 'output', 'random', 'search',
        'filter', 'puzzle', 'wobble', 'banana', 'cactus', 'rocket', 'window', 'garden', 'planet', 'bridge', 'candle', 'pocket'];
    const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
    const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    // Handle's slots: outlines that differ in shape, never only in colour.
    const SHAPES = [['●', 'circle'], ['■', 'square'], ['▲', 'triangle'], ['◆', 'diamond'], ['★', 'star'], ['♥', 'heart'], ['✚', 'cross'], ['⬢', 'hexagon']]
        .map(([glyph, name]) => ({ glyph, name }));

    // The kinds of captcha, with the name a takeover is announced by.
    const KINDS = {
        'read.word': { family: 'read', name: 'warped words' },
        'read.struck': { family: 'read', name: 'struck-through words' },
        'answer.sum': { family: 'answer', name: 'sums' },
        'answer.words': { family: 'answer', name: 'sums in words' },
        'pick.thing': { family: 'pick', name: 'plain picture grids' },
        'pick.scene': { family: 'pick', name: 'picture grids with scenes' },
        'pick.without': { family: 'pick', name: '"every square without" grids' },
        'handle.slide': { family: 'handle', name: 'sliding the piece into its slot' },
        'handle.order': { family: 'handle', name: 'tapping things in order' },
        'listen.beeps': { family: 'listen', name: 'beep patterns' },
        'invisible.tick': { family: 'invisible', name: 'the "I\'m not a robot" box' },
        'future.drop': { family: 'future', name: 'where the ball lands' },
        'future.changed': { family: 'future', name: 'spotting what changed' },
    };
    // The kind a family wants at this level, or, if the AI has taken it over, the next of the family's kinds it
    // hasn't (harder first). Null when it has taken them all.
    function kindFor(order, wanted, taken) {
        if (!taken || !taken[wanted]) return wanted;
        const from = order.indexOf(wanted);
        return [...order.slice(from + 1), ...order.slice(0, from).reverse()].find(k => !taken[k]) || null;
    }

    const sameCell = (c, t) => c.thing === t.thing && (c.hat || '') === (t.hat || '');
    // The squares a Pick captcha's own cells say are right. `make` stores this as `answer`; tests recompute it.
    function pickTargets(c) {
        const out = [];
        c.cells.forEach((cell, i) => { if (sameCell(cell, c.target) !== !!c.without) out.push(i); });
        return out;
    }

    const FAMILIES = {
        // Read: a word, each letter tilted and nudged (struck through as well in `read.struck`), and a tray of letter
        // tiles: the word's own, shuffled in among letters it doesn't have. Tap the word's letters in order.
        read: {
            kinds: ['read.word', 'read.struck'],
            make(rand, level, o = EVALS, taken = null) {
                const kind = kindFor(this.kinds, level >= 2 && rand() < 0.6 ? 'read.struck' : 'read.word', taken);
                const word = pick(rand, WORDS.filter(w => w.length <= (level >= 3 ? 6 : 5)));
                const spare = shuffle(rand, [...LETTERS].filter(l => !word.includes(l))).slice(0, 3 + Math.min(3, Math.floor(level / 2)));
                const tiles = shuffle(rand, [...word, ...spare]);
                const warp = [...word].map(() => ({ tilt: Math.round((rand() - 0.5) * (30 + 6 * Math.min(5, level))), lift: Math.round((rand() - 0.5) * 24), size: r2(0.85 + rand() * 0.4) }));
                if (!kind) return null;
                const used = new Set();
                const answer = [...word].map(l => { const i = tiles.findIndex((t, j) => t === l && !used.has(j)); used.add(i); return i; });
                return {
                    family: 'read', kind, level, layout: 'read', mode: 'seq', prompt: 'Tap the letters of the word, in order.',
                    targets: tiles.map(l => ({ text: l, v: l, label: `letter ${l}` })), want: [...word], answer,
                    show: { word, warp, struck: kind === 'read.struck' },
                };
            },
        },
        // Answer: a small sum, in figures or (`answer.words`) written out, and four answers to choose from: the right
        // one and three near it.
        answer: {
            kinds: ['answer.sum', 'answer.words'],
            make(rand, level, o = EVALS, taken = null) {
                const kind = kindFor(this.kinds, level >= 2 && rand() < 0.6 ? 'answer.words' : 'answer.sum', taken);
                const top = Math.min(12, 5 + level);
                const minus = level >= 1 && rand() < 0.4;
                let a = 1 + int(rand, top), b = 1 + int(rand, top);
                if (minus && b > a) [a, b] = [b, a];
                const result = minus ? a - b : a + b;
                const near = shuffle(rand, [-3, -2, -1, 1, 2, 3].map(d => result + d).filter(v => v >= 0)).slice(0, 3);
                const options = shuffle(rand, [result, ...near]);
                if (!kind) return null;
                const words = kind === 'answer.words';
                const question = words ? `What is ${NUMBER_WORDS[a]} ${minus ? 'minus' : 'plus'} ${NUMBER_WORDS[b]}?` : `${a} ${minus ? '−' : '+'} ${b} = ?`;
                return {
                    family: 'answer', kind, level, layout: 'choices', mode: 'set', single: true, prompt: 'Tap the answer.',
                    targets: options.map(v => ({ text: String(v), v, label: String(v) })), answer: [options.indexOf(result)],
                    show: { question },
                };
            },
        },
        // Pick: a grid of squares, each a thing (and in a scene maybe a hat on it). Tap every square that holds the
        // target, or every square that doesn't. There is always at least one right square and one wrong one, and no
        // square is arguable: a scene is the target or it isn't. The level picks the kind (a plain thing, a scene from
        // `comboFrom`, "without" some of the time from `withoutFrom`).
        pick: {
            kinds: ['pick.thing', 'pick.scene', 'pick.without'],
            make(rand, level, o = EVALS, taken = null) {
                const side = level >= o.bigFrom ? 4 : 3;
                const n = side * side;
                const wanted = level >= o.withoutFrom && rand() < 0.4 ? 'pick.without' : level >= o.comboFrom ? 'pick.scene' : 'pick.thing';
                const roll2 = rand();
                const kind = kindFor(this.kinds, wanted, taken);
                if (!kind) return null;
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
                const mixed = shuffle(rand, cells);
                for (const cell of mixed) { cell.glyph = cell.thing; cell.label = nameOf.get(cell.thing) + (cell.hat ? ' ' + nameOf.get(cell.hat) : ''); }
                const c = {
                    family: 'pick', kind, level, layout: 'grid', mode: 'set', side, target, without, scene,
                    prompt: without ? `Tap every square without ${scene}.` : `Tap every square with ${scene}.`,
                    cells: mixed, targets: mixed,
                };
                c.answer = pickTargets(c);
                return c;
            },
        },
        // Handle. `handle.slide`: a piece and a row of slots, each cut to a different shape; tap the slot the piece
        // fits and it slides in. `handle.order`: a few pictures shown in an order, and the same pictures mixed up among
        // others; tap them in the order shown.
        handle: {
            kinds: ['handle.slide', 'handle.order'],
            make(rand, level, o = EVALS, taken = null) {
                const kind = kindFor(this.kinds, level >= 1 && rand() < 0.55 ? 'handle.order' : 'handle.slide', taken);
                const shapes = shuffle(rand, SHAPES).slice(0, Math.min(SHAPES.length, 4 + Math.min(4, level)));
                const things = shuffle(rand, THINGS);
                const count = 3 + Math.min(2, Math.floor(level / 2));
                const shown = things.slice(0, count), mixed = shuffle(rand, things.slice(0, count + 2 + Math.min(2, level)));
                const fit = int(rand, shapes.length);
                if (!kind) return null;
                if (kind === 'handle.slide') {
                    return {
                        family: 'handle', kind, level, layout: 'slide', mode: 'set', single: true, prompt: 'Slide the piece into the slot it fits.',
                        targets: shapes.map(s => ({ text: s.glyph, v: s.glyph, label: `${s.name} slot` })), answer: [fit],
                        show: { piece: shapes[fit].glyph, name: shapes[fit].name },
                    };
                }
                return {
                    family: 'handle', kind, level, layout: 'order', mode: 'seq', prompt: 'Tap these in the order shown.',
                    targets: mixed.map(t => ({ glyph: t.glyph, v: t.glyph, label: `${t.a} ${t.name}` })), want: shown.map(t => t.glyph),
                    answer: shown.map(t => mixed.indexOf(t)), show: { order: shown.map(t => t.glyph) },
                };
            },
        },
        // Listen: a pattern of beeps on three or four pads, low to high, shown as pulses as it plays (nothing depends on
        // hearing it). Tap it back.
        listen: {
            kinds: ['listen.beeps'],
            make(rand, level, o = EVALS, taken = null) {
                const pads = level >= 3 ? 4 : 3;
                const length = Math.min(7, 3 + Math.floor(level / 2));
                const pattern = Array.from({ length }, () => int(rand, pads));
                // Never one pad over and over: that would be no pattern at all.
                if (new Set(pattern).size === 1) pattern[length - 1] = (pattern[0] + 1) % pads;
                if (!kindFor(this.kinds, 'listen.beeps', taken)) return null;
                const step = Math.max(0.32, 0.55 - 0.03 * level);
                const names = pads === 3 ? ['low', 'middle', 'high'] : ['low', 'lower middle', 'upper middle', 'high'];
                return {
                    family: 'listen', kind: 'listen.beeps', level, layout: 'pads', mode: 'seq', prompt: 'Tap back the pattern.',
                    targets: names.map((name, i) => ({ v: i, label: `${name} pad`, text: '' })),
                    want: pattern.slice(), answer: pattern.slice(), show: { pattern, step }, wait: r2(0.5 + step * length),
                };
            },
        },
        // Invisible: "I'm not a robot." One box. What is judged is how you ticked it (`tickVerdict`): too quick, too
        // straight or too dead-centre is a robot. The AI fails by being perfect until it has learned your wobble.
        invisible: {
            kinds: ['invisible.tick'],
            make(rand, level, o = EVALS, taken = null) {
                rand();
                if (!kindFor(this.kinds, 'invisible.tick', taken)) return null;
                return {
                    family: 'invisible', kind: 'invisible.tick', level, layout: 'tick', mode: 'tick', instant: true, prompt: 'Confirm you are human.',
                    targets: [{ text: "I'm not a robot", v: 1, label: "I'm not a robot" }], answer: [0], show: {},
                };
            },
        },
        // Future. `future.drop`: a ball over a board of arrows; each row, the arrow under the ball sends it left, right
        // or straight down; tap the bin it ends in. `future.changed`: a grid of pictures to look at, then the same
        // grid with one picture swapped; tap the one that changed.
        future: {
            kinds: ['future.drop', 'future.changed'],
            make(rand, level, o = EVALS, taken = null) {
                const kind = kindFor(this.kinds, level >= 1 && rand() < 0.5 ? 'future.changed' : 'future.drop', taken);
                const cols = Math.min(5, 3 + Math.floor(level / 2)), rowCount = Math.min(5, 2 + Math.floor((level + 1) / 2));
                const start = int(rand, cols);
                const rows = Array.from({ length: rowCount }, () => Array.from({ length: cols }, () => pick(rand, [-1, 0, 1])));
                const side = level >= 4 ? 4 : 3;
                const things = shuffle(rand, THINGS);
                const before = Array.from({ length: side * side }, () => pick(rand, things.slice(0, 5)).glyph);
                const where = int(rand, side * side);
                const swap = pick(rand, things.slice(0, 6).filter(t => t.glyph !== before[where])).glyph;
                if (!kind) return null;
                if (kind === 'future.drop') {
                    // An arrow at the board's edge that points off it sends the ball straight down.
                    let col = start;
                    for (const row of rows) col = clamp(col + row[col], 0, cols - 1);
                    return {
                        family: 'future', kind, level, layout: 'drop', mode: 'set', single: true, prompt: 'Tap the bin the ball lands in.',
                        targets: Array.from({ length: cols }, (_, i) => ({ text: 'ABCDE'[i], v: i, label: `bin ${'ABCDE'[i]}` })), answer: [col],
                        show: { cols, rows, start },
                    };
                }
                const after = before.slice();
                after[where] = swap;
                const look = Math.max(1.2, 2.4 - 0.2 * level);
                return {
                    family: 'future', kind, level, layout: 'changed', mode: 'set', single: true, side, prompt: 'Look, then tap the square that changed.',
                    targets: after.map(g => ({ glyph: g, v: g, label: nameOf.get(g) })), answer: [where], show: { before, look }, wait: look,
                };
            },
        },
    };

    // The families a run draws from, in the order it meets them: the eras of the captcha, old to new.
    const ORDER = ['read', 'answer', 'pick', 'handle', 'listen', 'invisible', 'future'];

    // How you ticked the box: null if a person might have, else why not ('quick', 'straight' or 'centre'). `trace`
    // has `seconds`, `bend` (the pointer's path over the straight line to the box; 0 on a touch screen, where there is
    // no path) and `offset` (how far from the box's centre the tap landed, as a share of it).
    function tickVerdict(trace, o = EVALS) {
        if (!(+trace?.seconds >= o.tickMin)) return 'quick';
        if (+trace?.bend > 0 && +trace.bend < o.tickBend) return 'straight';
        if (!(+trace?.offset >= o.tickOff)) return 'centre';
        return null;
    }

    // Is `answer` right? A set: every right target and no other, in any order. A sequence: the right values in the
    // right order. The tick box: ticked, and ticked like a person (`trace`).
    function judge(c, answer, trace) {
        if (!Array.isArray(answer)) return false;
        if (c.mode === 'tick') return answer.length === 1 && answer[0] === 0 && tickVerdict(trace) === null;
        if (c.mode === 'seq') return answer.length === c.want.length && answer.every((i, j) => !!c.targets[i] && c.targets[i].v === c.want[j]);
        const got = [...new Set(answer)].sort((a, b) => a - b);
        return got.length === c.answer.length && got.every((v, i) => v === c.answer[i]);
    }
    for (const f of Object.values(FAMILIES)) f.judge = judge;
    // How many targets an answer was wrong by: for a set, the targets wrongly tapped or left; for a sequence, the
    // places that differ and any missing or extra.
    function offBy(c, answer) {
        if (c.mode === 'seq') {
            let off = Math.abs(answer.length - c.want.length);
            for (let j = 0; j < Math.min(answer.length, c.want.length); j++) if (c.targets[answer[j]]?.v !== c.want[j]) off++;
            return off;
        }
        const right = new Set(c.answer), mine = new Set(answer);
        let off = 0;
        for (let i = 0; i < c.targets.length; i++) if (mine.has(i) !== right.has(i)) off++;
        return off;
    }

    // ---- The learner ----
    // What the AI has learned, kept in the save (engine.js `state.evals.learn`): per kind `m` (0 to 1), `solves` it has
    // watched, `ahead` (its score toward taking the kind over: see `overtake`), `taken`, `wrongs` (how many of those
    // solves you got wrong) and `traces`, your last few solves.
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
    const par = (c, o = EVALS) => o.parBase + o.parScan * c.targets.length + o.parCell * c.answer.length + (c.wait || 0);

    // A trace is how you solved one captcha: `taps` ([{ i, t }]: the targets you ended with, in the order you tapped
    // them, `t` seconds after it showed), `seconds` to Verify, `n` targets (`side` if they were a square grid),
    // `correct`, `undos` (taps you took back), `path` (how your pointer moved: a flat list of time in hundredths of a
    // second, x and y in thousandths of the play area's width, three numbers a sample) and, for the tick box, `bend`
    // and `offset`. Bounded and cleaned here, whatever the screen (or an old save) hands in.
    function cleanTrace(t, n, side = 0) {
        if (side && !(n > 0)) n = side * side;
        const taps = [];
        for (const tap of Array.isArray(t?.taps) ? t.taps.slice(0, 40) : []) {
            const i = Math.floor(+tap?.i), at = +tap?.t;
            if (Number.isInteger(i) && i >= 0 && i < n && at >= 0 && at < 600) taps.push({ i, t: r2(at) });
        }
        taps.sort((a, b) => a.t - b.t);
        const last = taps.length ? taps[taps.length - 1].t : 0;
        const path = [];
        const raw = Array.isArray(t?.path) ? t.path.slice(0, 360) : [];
        for (let j = 0; j + 2 < raw.length; j += 3) {
            const at = Math.round(+raw[j]), x = Math.round(+raw[j + 1]), y = Math.round(+raw[j + 2]);
            if (at >= 0 && at <= 60000 && x >= -500 && x <= 1500 && y >= -500 && y <= 3000) path.push(at, x, y);
        }
        return { n, side, correct: !!t?.correct, seconds: clamp(+t?.seconds || 0, last, 600), undos: clamp(Math.floor(+t?.undos || 0), 0, 20),
            bend: clamp(+t?.bend || 0, 0, 99), offset: clamp(+t?.offset || 0, 0, 9), taps, path };
    }

    // It watches you answer `c`: it learns (more from a right, quick solve), keeps the trace and counts your mistakes.
    // Returns how much it learned.
    function watch(learn, c, trace, correct, o = EVALS) {
        const k = kindOf(learn, c.kind);
        const t = cleanTrace({ ...trace, correct }, c.targets.length, c.side || 0);
        k.solves++;
        if (!correct) k.wrongs++;
        k.traces.push(t);
        while (k.traces.length > o.traces) k.traces.shift();
        // Only your latest few keep how the pointer moved (it is most of a trace's size).
        k.traces.forEach((old, j) => { if (j < k.traces.length - o.paths) old.path = []; });
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

    // A target's place, 0 to 1 across and down: on a square grid by row and column, otherwise along a row.
    const place = (i, n, side) => (side ? { x: (i % side + 0.5) / side, y: (Math.floor(i / side) + 0.5) / side } : { x: (i + 0.5) / n, y: 0.5 });
    // Target `i` of a trace, on captcha `c`: the same place on the grid (stretched if the grid is another size), or
    // the same way along the row.
    function onto(i, t, c) {
        const n = c.targets.length;
        if (t.side && c.side) {
            const f = v => Math.min(c.side - 1, Math.floor((v + 0.5) / t.side * c.side));
            return f(Math.floor(i / t.side)) * c.side + f(i % t.side);
        }
        return Math.min(n - 1, Math.floor((i + 0.5) / (t.n || n) * n));
    }

    // Your habits on a kind, read from your traces: your pace (the middle of it as `first`, `gap`, `verify`, and every
    // pause you made as `firsts`, `gaps`, `verifies`, so it can play your rhythm and not an average), how often you tap
    // a target and take it back (`undo`, a solve), and where you tend to start and go next (`rank(i, n, side)`: the
    // average place in your tapping order of the targets near there, lower is sooner).
    function habits(k) {
        const first = [], gaps = [], verify = [];
        const spots = [];   // { x, y, r }: a tap's place (0 to 1) and its place in the order (0 to 1)
        for (const t of k.traces) {
            if (!t.taps.length) continue;
            first.push(t.taps[0].t);
            for (let j = 1; j < t.taps.length; j++) gaps.push(t.taps[j].t - t.taps[j - 1].t);
            verify.push(t.seconds - t.taps[t.taps.length - 1].t);
            t.taps.forEach((tap, j) => spots.push({ ...place(tap.i, t.n || (t.side * t.side), t.side), r: t.taps.length > 1 ? j / (t.taps.length - 1) : 0 }));
        }
        const rank = (i, n, side) => {
            if (!spots.length) return 0.5;
            const p = place(i, n, side);
            let sum = 0, weight = 0;
            for (const s of spots) {
                const w = 1 / (0.02 + (s.x - p.x) ** 2 + (s.y - p.y) ** 2);
                sum += w * s.r;
                weight += w;
            }
            return sum / weight;
        };
        const undo = k.traces.length ? k.traces.filter(t => t.undos > 0).length / k.traces.length : 0;
        return { first: median(first, PACE.first), gap: median(gaps, PACE.gap), verify: median(verify, PACE.verify),
            firsts: first, gaps, verifies: verify, undo, rank, seen: spots.length > 0 };
    }

    // The shapes your pointer drew between taps (the owner's call: if the player hovers a while, wanders or curves in,
    // the ghost should too). Each stretch of a path, from where the pointer was at one tap (or when the captcha
    // showed) to where it was at the next (or at Verify), becomes a shape: a list of [share of the stretch's time,
    // share of the way along the straight line, share of that line's length off to the side]. The ghost's hand follows
    // one of them between each of its own taps, turned and scaled onto its own start and end, so your hesitations,
    // detours and overshoots come with it.
    function shapes(k) {
        const out = [];
        for (const t of k.traces) {
            const p = t.path;
            if (!p || p.length < 9) continue;
            const stops = [p[0], ...t.taps.map(tap => Math.round(tap.t * 100)), Math.round(t.seconds * 100)];
            const at = cs => {   // the path's sample nearest in time
                let best = 0;
                for (let j = 0; j < p.length; j += 3) if (Math.abs(p[j] - cs) < Math.abs(p[best] - cs)) best = j;
                return best;
            };
            for (let s = 1; s < stops.length; s++) {
                const a = at(stops[s - 1]), b = at(stops[s]);
                if (b - a < 6) continue;   // too few samples between to have a shape
                const ax = p[a + 1], ay = p[a + 2], dx = p[b + 1] - ax, dy = p[b + 2] - ay;
                const d = Math.hypot(dx, dy), span = p[b] - p[a];
                if (d < 40 || span <= 0) continue;   // it hardly moved: no direction to turn the shape to
                const shape = [[0, 0, 0]];
                const every = Math.max(1, Math.ceil((b - a) / 3 / 16));
                for (let j = a + 3 * every; j < b; j += 3 * every) {
                    const rx = p[j + 1] - ax, ry = p[j + 2] - ay;
                    shape.push([r2((p[j] - p[a]) / span), r2(clamp((rx * dx + ry * dy) / (d * d), -0.6, 1.6)), r2(clamp((ry * dx - rx * dy) / (d * d), -1.2, 1.2))]);
                }
                shape.push([1, 1, 0]);
                out.push(shape);
            }
        }
        return out;
    }

    // Its attempt at `c`, decided when the captcha shows: which targets it taps and when, how its hand moves between
    // them, and when it presses Verify.
    // **It copies before it understands.** For each target it either knows the answer (more often as it learns:
    // `PHASES`' third column) or does what you did on your last one of these: the same places, in your order. So from
    // your second solve on it is recognisably you, and wrong because the captcha has changed; as it learns, more of
    // what it taps is right. Its pace follows `PHASES`; each pause is one you really made; it slips on one target now
    // and then, and as often again as you get one of these wrong; and it copies your take-backs and the shapes your
    // pointer drew. `off` is how many targets its answer was wrong by.
    function ghostAttempt(learn, c, rand, o = EVALS) {
        const k = kindOf(learn, c.kind);
        const m = k.m, h = habits(k), n = c.targets.length, side = c.side || 0;
        const know = phase(m, 2), pace = phase(m, 1);
        const last = k.traces.length ? k.traces[k.traces.length - 1] : null;
        const wobble = () => 1 + (rand() - 0.5) * 0.5 * (1 - m);
        const beat = (list, mid) => { const r = rand(), s = rand(); return (list.length && s < m ? list[Math.floor(r * list.length)] : mid) * pace * wobble(); };
        const slips = rand() < o.ghostSlip + (1 - o.ghostSlip) * errorRate(k) * m;
        let chosen = [], feint = null, human = false;
        if (c.mode === 'tick') {
            // It ticks like a person only once it has watched you and learned how.
            human = rand() < know && !!last && !slips;
            chosen = [0];
        } else if (c.mode === 'seq') {
            // Place by place: the right one, or the one you tapped in that place last time, or any.
            const length = rand() < know || !last || !last.taps.length ? c.answer.length : clamp(last.taps.length, 1, c.answer.length + 2);
            for (let p = 0; p < length; p++) {
                const r = rand(), any = int(rand, n);
                chosen.push(r < know && p < c.answer.length ? c.answer[p] : last && last.taps[p] ? onto(last.taps[p].i, last, c) : any);
            }
            const where = int(rand, Math.max(1, chosen.length)), other = int(rand, n);
            if (slips && chosen.length) chosen[where] = c.targets[other].v !== c.targets[chosen[where]].v ? other : (other + 1) % n;
        } else {
            const right = new Set(c.answer);
            const copied = new Map();
            if (last) last.taps.forEach((tap, j) => { const i = onto(tap.i, last, c); if (!copied.has(i)) copied.set(i, j / Math.max(1, last.taps.length - 1)); });
            if (c.single) {
                const r = rand(), any = int(rand, n), other = int(rand, Math.max(1, n - 1));
                let one = r < know ? c.answer[0] : copied.size ? [...copied.keys()][0] : any;
                if (slips) one = (one + 1 + other) % n;
                chosen = [one];
            } else {
                for (let i = 0; i < n; i++) {
                    const r = rand(), guess = rand();
                    if (r < know ? right.has(i) : last ? copied.has(i) : guess < o.ghostTap) chosen.push(i);
                }
                const where = int(rand, n);
                if (slips) chosen = chosen.includes(where) ? chosen.filter(i => i !== where) : [...chosen, where];
                // Your order from the first solve it watched: a target you tapped last time keeps its place in that
                // order, any other goes where you tend to go. A little noise, fading as it learns.
                const key = new Map(chosen.map(i => [i, (h.seen ? (copied.has(i) && know < 1 ? lerp(copied.get(i), h.rank(i, n, side), know) : h.rank(i, n, side)) : rand()) + rand() * 0.1 * (1 - m)]));
                chosen.sort((a, b) => key.get(a) - key.get(b));
                // Your habit of tapping a target and taking it back: as often as you do, it taps a wrong one on the way
                // and takes it back a moment later (`off`).
                const wrongs = c.targets.map((_, i) => i).filter(i => !chosen.includes(i));
                if (rand() < Math.min(o.undoMax, h.undo) * m && wrongs.length) feint = { at: int(rand, chosen.length + 1), i: wrongs[int(rand, wrongs.length)] };
            }
        }
        // When: your rhythm, after anything the captcha makes everyone wait for.
        const wait = c.wait || 0;
        let t = wait + beat(h.firsts.map(v => Math.max(0.2, v - wait)), Math.max(0.3, h.first - (h.seen ? wait : 0)));
        if (c.mode === 'tick') t = human ? Math.max(o.tickMin * 1.1, t) : Math.min(t, o.tickMin * 0.5);
        const taps = [];
        const undo = () => { const gap = beat(h.gaps, h.gap); taps.push({ i: feint.i, t: r2(t), off: r2(t + gap * 0.7) }); t += gap * 1.4; };
        chosen.forEach((i, j) => {
            if (feint && feint.at === j) undo();
            taps.push({ i, t: r2(t) });
            t += beat(h.gaps, h.gap);
        });
        if (feint && feint.at === chosen.length) undo();
        const lastTap = taps.length ? Math.max(...taps.map(tap => tap.off ?? tap.t)) : t;
        const seconds = c.instant ? r2(lastTap) : r2(lastTap + beat(h.verifies, h.verify));
        // How its hand moves to each tap, and to Verify: one of your shapes each, once it has seen your pointer move.
        const mine = shapes(k);
        const moves = Array.from({ length: taps.length + 1 }, () => (mine.length ? mine[int(rand, mine.length)] : null));
        const correct = c.mode === 'tick' ? human : judge(c, chosen);
        const answer = c.mode === 'seq' ? chosen.slice() : chosen.slice().sort((a, b) => a - b);
        return { taps, moves, seconds, answer, correct, human, off: c.mode === 'tick' ? (correct ? 0 : 1) : offBy(c, chosen), m };
    }

    // A run. opts: { seed, learn, families, ...any EVALS override }. `current` is the captcha up and `ghost` the AI's
    // attempt at it; `submit(answer, seconds, trace)` judges your answer, lets it watch, moves on and returns what
    // happened. It goes round the families in order; each family gets harder with each one of its own you solve
    // (`levels`). A miss costs a life. The run is over when the lives are gone, or when the AI has taken over every
    // kind there is (`exhausted`).
    function createRun(opts = {}) {
        const o = Object.assign({}, EVALS, opts);
        const rand = rng(o.seed ?? 1);
        // Its attempts draw from their own stream, so what it does never changes which captchas come up.
        const ghostRand = rng((o.seed ?? 1) ^ 0x9E3779B9);
        const learn = o.learn || newLearn();
        const families = (o.families || ORDER).filter(f => FAMILIES[f]);
        const run = {
            opts: o, learn, lives: o.lives, level: 0, levels: {}, solved: 0, missed: 0, streak: 0, bestStreak: 0, over: false, exhausted: false,
            current: null, ghost: null, takeovers: [], turn: 0,
            // One line per captcha answered: what it was, whether you and it were right and how long each took.
            log: [],
        };
        const next = () => {
            run.current = null;
            // The next family in turn that still has a kind the AI hasn't taken.
            for (let tries = 0; tries < families.length && !run.current; tries++) {
                const family = families[run.turn % families.length];
                run.turn++;
                run.current = FAMILIES[family].make(rand, run.levels[family] || 0, o, takenMap(learn));
            }
            if (!run.current) { run.over = true; run.exhausted = true; run.ghost = null; return; }
            run.ghost = ghostAttempt(learn, run.current, ghostRand, o);
        };
        run.submit = function (answer, seconds = 0, trace = null) {
            if (run.over || !run.current) return null;
            const c = run.current, ghost = run.ghost;
            seconds = Math.max(0, +seconds || 0);
            const list = Array.isArray(answer) ? answer : [];
            const seen = { ...(trace || { taps: list.map((i, j) => ({ i, t: seconds * (j + 1) / (list.length + 1) })), bend: 0, offset: 1 }), seconds };
            const correct = judge(c, answer, seen);
            // It was ahead if it was right and either done before you or you were wrong.
            const ahead = ghost.correct && (!correct || ghost.seconds < seconds);
            const k = kindOf(learn, c.kind);
            const learned = watch(learn, c, seen, correct, o);
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
                run.levels[c.family] = (run.levels[c.family] || 0) + 1;
            } else {
                run.missed++;
                run.streak = 0;
                run.lives--;
            }
            const result = { correct, why: c.mode === 'tick' && !correct ? tickVerdict(seen, o) : null, answer: c.answer.slice(), captcha: c, ghost, ahead, learned, takeover, lives: run.lives };
            if (run.lives <= 0) { run.over = true; run.current = null; run.ghost = null; } else next();
            result.over = run.over;
            result.exhausted = run.exhausted;
            return result;
        };
        next();
        return run;
    }

    return { EVALS, PACE, PHASES, phase, FAMILIES, KINDS, ORDER, THINGS, HATS, WORDS, SHAPES, rng, createRun, pickTargets, judge, offBy, tickVerdict,
        newLearn, kindOf, takenMap, watch, habits, shapes, ghostAttempt, cleanTrace, errorRate, par };
});
