// feed.js — The Feed, the ring's calm minigame (design/ring.md → The Feed; design/ring-build.md, Build 1): the
// packets Packet Snare catches fall into a box and turn to sand, a swarm of mites (the AI) eats the pile from the
// outside in, and what it eats pays research. No clock, no enemy, no failed run. (The owner's design, 2026-11-13,
// replacing a grid of face-down tiles and a drawn line: sand art, eaten like sand, the swarm drawn to your finger.)
//
// **The box** is `w` × `h` cells. A packet is `grains` grains of sand. Grains pour in at the top, fall, and slide off
// each other into a pile (one cell down, else one down and across). What doesn't fit yet waits in `backlog` and
// pours as room is made. Each delivery is a band of its own colour (`band`), so the pile lies in strata.
//
// **Sand** (a cell's `kind`):
//   plain      letters, which the model reads from the start: the bulk of the pile
//   vein       gold packets: pays more, and pours in together, so it lies in a seam
//   fragment   a piece of a message (one set so far, the parcel spam): one grain a layer until the set is whole
//   numbers    data the model has no skill for yet (Embeddings)       \  slow to eat and pays nothing until the
//   pictures   the same (Edge Detection)                              /  skill is learned; then it is good sand
//   garbled    bad packets: a garbled catch's packets, and a share of what a popped bubble or snapped loop held.
//              Slow to eat, pays nothing, ever: it is only in the way
// Deeper sectors bring tougher data: a grain takes `tough` bites by the sector it came from, and slow sand `slow`
// times that.
//
// **The swarm** is `mites` mites, each with a place in the box. Left alone a mite goes to the nearest grain on the
// pile's surface and eats it, so the pile is eaten from the outside in, at `graze` of full speed. **The one verb is
// lead:** while you hold a point (`point(state, { x, y })`) every mite heads for it at full speed, eating whatever
// sand is in its way and then the sand nearest the point. So you lead them into a seam, or away from bad sand that
// would waste their time.
//
// **Hunger** (the owner's call, replacing layers, which made no sense in sand): a meter fills as the swarm eats paying
// sand. Full (`layerSize(n)` packets' worth: 30, then ×1.8 each time), the swarm splits: a new mite for good, and a
// lump of research. `layers` counts the splits, `fed` what has gone into the meter since the last (see `hunger`).
//
// Pure and deterministic: no DOM, no clock, no Math.random (the generator's position is in the state, so a saved pile
// carries on exactly). The state is plain data, ready for the save. Loaded in the browser as window.Feed and in Node
// (tests) via require(). The dials start at tools/ring-model.js's values and a test holds the two in step.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Feed = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The base numbers, in one place. Every call takes overrides of any of them (but not of the box's size).
    const FEED = {
        w: 128, h: 224,     // the box, in cells: tall, for an upright phone; fine sand (the owner's call)
        grains: 16,         // grains of sand a packet makes
        chew: 2,            // packets' worth of bites a second a mite, when led (the model's `chew`)
        graze: 0.25,        // the share of that when left alone (the owner's call; the model's `graze`)
        tough: [1, 2, 3],   // bites a grain takes, by the sector it came from (the model's `tough`); +1 a sector past the list
        slow: 4,            // slow sand (garbled, or a kind with no skill yet) takes this many times the bites
        popped: 0.5,        // the share of a popped bubble's or snapped loop's packets that arrive garbled
        layerFirst: 30,     // packets' worth of paying sand in the first layer
        layerGrow: 1.8,     // each layer is this much bigger than the last (the model's `layerGrow`)
        miteFirst: 1,       // the first new mite comes with this layer (the owner's call: the first; the model's `miteFirst`)
        miteEvery: 1,       // and another every this many after it: every split (the owner's call; the model's `miteEvery`)
        layerPay: 0.2,      // a layer's lump of research, as a share of its packets
        pour: 8,            // packets a second through the spout: slow enough that the pile sheds it and no column backs up
        spout: 12,          // the spout's half-width, in cells
        fall: 80,           // cells a second a grain falls
        speed: 90,          // cells a second a mite moves
        near: 8,            // a led mite this close to the point eats the sand nearest the point
        lamp: 7,            // a mite shows what the sand within this many cells of it really is (gold, fragments)
        stick: 0.92,        // how likely the next grain poured is the same sort as the last: sorts lie in patches
        bands: 6,           // colours of strata before they repeat
        fragFrom: 2,        // a layer's fragment is one of its first plain packets: this many in at the least,
        fragSpread: 10      // and up to this many more
    };
    const STEP = 0.05;      // the rules' own time step, in seconds

    // Kinds by their number in a cell (0 is empty), what a packet of each pays when eaten, and the skill a kind waits for.
    const KIND_IDS = [null, 'plain', 'vein', 'fragment', 'numbers', 'pictures', 'garbled'];
    const KINDS = {
        plain: { id: 1, pay: 1 },
        vein: { id: 2, pay: 3 },
        fragment: { id: 3, pay: 2 },
        numbers: { id: 4, pay: 2, skill: 'Embeddings', from: 2, share: 0.1 },
        pictures: { id: 5, pay: 2, skill: 'Edge Detection', from: 4, share: 0.1 },
        garbled: { id: 6, pay: 0, bad: true }
    };
    // The kinds that wait for a skill, in the order their skills are learned. `from`: the first sector that brings them.
    const LOCKED = Object.keys(KINDS).filter(k => KINDS[k].skill);
    // Fragment sets. The words live with the mail (engine.js); the rules only count the pieces.
    const FRAGMENTS = { parcel: { pieces: 4 } };
    const FRAGMENT_ORDER = ['parcel'];

    const opt = opts => (opts ? { ...FEED, ...opts, w: FEED.w, h: FEED.h } : FEED);
    const layerSize = (n, opts) => { const o = opt(opts); return Math.round(o.layerFirst * Math.pow(o.layerGrow, Math.min(Math.max(0, n), 60))); };
    const bitesFor = (sector, opts) => {
        const t = opt(opts).tough, k = Math.max(1, Math.floor(sector) || 1);
        return k <= t.length ? t[k - 1] : t[t.length - 1] + (k - t.length);
    };
    // A cell is one number: its kind, its band of colour, whether a mite has seen what it is, and the bites it has left.
    // Gold and fragments look like plain sand until a mite's lamp has been near them (the owner's call: buried finds).
    const kindOf = v => v & 7, bandOf = v => (v >> 3) & 7, seenOf = v => (v >> 6) & 1, hpOf = v => v >> 7;
    const cell = (kind, band, hp, seen = 1) => kind | (band << 3) | ((seen ? 1 : 0) << 6) | (Math.min(255, hp) << 7);
    const HIDDEN = [2, 3];   // vein, fragment

    // Mulberry32 (as packet-snare.js and evals.js), stepped from a position kept in the state.
    function rand(state) {
        const a = state.rs = (state.rs + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    const readable = (state, kind) => !KINDS[kind].skill || state.readable.includes(kind);
    // Sand that pays nothing and takes `slow` times the bites: garbled, or a kind the model has no skill for.
    const slowSand = (state, kind) => !!KINDS[kind].bad || !readable(state, kind);
    // The box in the save: runs of the same cell, as text (`value` or `value*count`, in base 36), about a tenth the size
    // of the list. A Feed's state turns its cells into that when it is saved (`toJSON`), and `clean` reads it back.
    function pack(cells) {
        const out = [];
        for (let i = 0; i < cells.length;) {
            let n = 1;
            while (i + n < cells.length && cells[i + n] === cells[i]) n++;
            out.push(cells[i].toString(36) + (n > 1 ? '*' + n.toString(36) : ''));
            i += n;
        }
        return out.join(',');
    }
    function unpack(text, size) {
        const cells = [];
        for (const run of String(text).split(',')) {
            const [v, n] = run.split('*'), value = parseInt(v, 36), count = n === undefined ? 1 : parseInt(n, 36);
            if (!Number.isInteger(value) || !Number.isInteger(count) || count < 1 || cells.length + count > size) return null;
            for (let k = 0; k < count; k++) cells.push(value);
        }
        return cells.length === size ? cells : null;
    }
    const saveable = state => Object.defineProperty(state, 'toJSON', { value() { return { ...this, cells: pack(this.cells) }; }, enumerable: false });
    const mitePlace = (state, n) => ({ x: FEED.w / 2 + ((n * 7) % 11 - 5) * 2 + 0.5, y: 1.5, b: 0, t: -1 });

    function startLayer(state, o) {
        state.fed = 0;
        state.plain = 0;
        state.fragAt = Math.round((o.fragFrom + rand(state) * o.fragSpread) * o.grains);
        state.fragPlaced = false;
    }

    // A new, empty Feed: one mite, an empty box.
    function newFeed(opts = {}) {
        const o = opt(opts);
        const state = {
            rs: (opts.seed ?? 1) >>> 0, w: FEED.w, h: FEED.h, cells: new Array(FEED.w * FEED.h).fill(0), grains: 0, rest: true, tick: 0,
            mites: 1, swarm: [], aim: null, layers: 0, fed: 0, owed: 0, plain: 0, fragAt: 0, fragPlaced: false, fragNext: 0, fragments: {},
            backlog: [], last: 0, band: 0, spout: 0, pourAcc: 0, fallAcc: 0, readable: [], dry: false,
            stats: { delivered: 0, eaten: 0, cleaned: 0, research: 0, veins: 0 }
        };
        state.swarm.push(mitePlace(state, 0));
        startLayer(state, o);
        return saveable(state);
    }

    // Grains still waiting to pour, and everything there is left to eat.
    const waiting = state => state.backlog.reduce((n, e) => n + e.n + e.gold + e.bad, 0);
    const left = state => state.grains + waiting(state);
    // The share of the box's cells that hold sand.
    const fill = state => state.grains / (state.w * state.h);

    // A run's packets arrive: { sector, packets, gold, garbled, popped }. `packets` are the good ones caught (`gold` of
    // them gold); `garbled` the packets of garbled catches; `popped` what popped bubbles and snapped loops held, of
    // which a share arrives garbled. They pour in over the next seconds.
    function deliver(state, load, opts) {
        const o = opt(opts), out = { research: 0, events: [], added: 0 };
        const whole = v => Math.max(0, Math.floor(v) || 0);
        const packets = whole(load?.packets), gold = Math.min(packets, whole(load?.gold));
        const bad = whole(load?.garbled) + Math.round(whole(load?.popped) * o.popped);
        if (!packets && !bad) return out;
        state.band = (state.band + 1) % o.bands;
        state.backlog.push({ sector: Math.max(1, whole(load.sector) || 1), n: (packets - gold) * o.grains, gold: gold * o.grains, bad: bad * o.grains, band: state.band });
        state.stats.delivered += packets + bad;
        state.dry = false;
        out.added = (packets + bad) * o.grains;
        return out;
    }

    // Lead the swarm: a point in the box, in cells ({ x, y }), while you hold it; null when you let go.
    function point(state, aim) {
        const ok = aim && typeof aim.x === 'number' && typeof aim.y === 'number' && Number.isFinite(aim.x) && Number.isFinite(aim.y);
        state.aim = ok ? { x: Math.max(0, Math.min(state.w - 0.01, aim.x)), y: Math.max(0, Math.min(state.h - 0.01, aim.y)) } : null;
        return state.aim;
    }

    // The next grain through the spout: which sort (plain data, gold, bad) and what it is.
    function nextGrain(state, o) {
        const e = state.backlog[0], total = e.n + e.gold + e.bad;
        const has = [0, e.n, e.gold, e.bad];
        let sort = state.last;
        if (!has[sort] || rand(state) >= o.stick) {
            let r = rand(state) * total;
            sort = r < e.bad ? 3 : (r -= e.bad) < e.gold ? 2 : 1;
        }
        state.last = sort;
        let kind = 'plain';
        if (sort === 3) { e.bad--; kind = 'garbled'; }
        else if (sort === 2) { e.gold--; kind = 'vein'; }
        else {
            e.n--;
            const set = FRAGMENT_ORDER.find(id => state.fragNext < FRAGMENTS[id].pieces);
            if (e.kind) kind = e.kind;
            else if (set && !state.fragPlaced && ++state.plain >= state.fragAt) { state.fragPlaced = true; state.fragNext++; kind = 'fragment'; }
            else {
                const roll = rand(state);
                let edge = 0;
                for (const k of LOCKED) {
                    if (e.sector < KINDS[k].from) continue;
                    edge += KINDS[k].share;
                    if (roll < edge) { kind = k; break; }
                }
            }
        }
        const v = cell(KINDS[kind].id, e.band, bitesFor(e.sector, o) * (slowSand(state, kind) ? o.slow : 1), !HIDDEN.includes(KINDS[kind].id));
        if (e.n + e.gold + e.bad <= 0) { state.backlog.shift(); state.last = 0; }
        return v;
    }

    function pour(state, o, dt) {
        if (!state.backlog.length) { state.pourAcc = 0; return; }
        state.pourAcc += o.pour * o.grains * dt;
        const mid = state.w >> 1;
        while (state.pourAcc >= 1 && state.backlog.length) {
            // The spout wanders a cell at a time, so grains poured together land together: seams and patches.
            state.spout = Math.max(-o.spout, Math.min(o.spout, state.spout + Math.round(rand(state) * 2 - 1)));
            // The cell under the spout, or one beside it while that one is still falling clear.
            const x = [0, 1, -1, 2, -2, 3, -3].map(d => mid + state.spout + d).find(c => !state.cells[c]);
            if (x === undefined) { state.pourAcc = Math.min(state.pourAcc, 1); break; }   // the box is full to the spout: wait
            state.cells[x] = nextGrain(state, o);
            state.grains++; state.rest = false; state.pourAcc -= 1;
        }
    }

    // One pass of falling: every grain with room under it drops a cell, else slides down and across.
    function fallPass(state) {
        const { w, h, cells } = state;
        let moved = false;
        state.tick++;
        for (let y = h - 2; y >= 0; y--) {
            const row = y * w, flip = (state.tick + y) & 1;
            for (let n = 0; n < w; n++) {
                const x = flip ? w - 1 - n : n, i = row + x, v = cells[i];
                if (!v) continue;
                const below = i + w;
                let to = -1;
                if (!cells[below]) to = below;
                else {
                    const first = (x + state.tick) & 1 ? -1 : 1;
                    for (const d of [first, -first]) {
                        const nx = x + d;
                        if (nx >= 0 && nx < w && !cells[below + d] && !cells[i + d]) { to = below + d; break; }
                    }
                }
                if (to >= 0) { cells[to] = v; cells[i] = 0; moved = true; }
            }
        }
        return moved;
    }

    // The grain on the pile's surface nearest a point: one with an empty cell beside it (or at the box's top).
    function nearestSurface(state, px, py) {
        const { w, h, cells } = state;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i]) continue;
            const x = i % w, y = (i - x) / w;
            if (y < h - 1 && !cells[i + w]) continue;   // still falling: not part of the pile yet
            if (!(y === 0 || !cells[i - w] || (x > 0 && !cells[i - 1]) || (x < w - 1 && !cells[i + 1]) || (y < h - 1 && !cells[i + w]))) continue;
            const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }
    // The grain nearest a point within `r` cells of it, or −1.
    function nearestWithin(state, px, py, r) {
        const { w, h, cells } = state;
        let best = -1, bestD = r * r;
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(h - 1, Math.floor(py + r)); y++) {
            for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(w - 1, Math.floor(px + r)); x++) {
                if (!cells[y * w + x]) continue;
                const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
                if (d <= bestD) { bestD = d; best = y * w + x; }
            }
        }
        return best;
    }

    function eat(state, o, i, out) {
        const { w } = state, v = state.cells[i], kind = KIND_IDS[kindOf(v)], x = i % w, y = (i - x) / w;
        state.cells[i] = 0; state.grains--; state.rest = false;
        const pays = !slowSand(state, kind);
        if (pays) {
            state.stats.eaten++;
            state.owed += KINDS[kind].pay / o.grains;
            state.fed++;
            if (kind === 'vein') state.stats.veins++;
        } else state.stats.cleaned++;
        out.events.push({ type: 'eat', x, y, kind, pays });
        if (kind === 'fragment') {
            const set = FRAGMENT_ORDER[0], found = state.fragments[set] || (state.fragments[set] = []);
            if (found.length < FRAGMENTS[set].pieces) {
                found.push(found.length);
                out.events.push({ type: 'fragment', set, piece: found.length - 1, found: found.length, of: FRAGMENTS[set].pieces, complete: found.length >= FRAGMENTS[set].pieces });
            }
        }
        const need = layerSize(state.layers, o) * o.grains;
        if (state.fed >= need) {
            const over = state.fed - need, pay = Math.max(1, Math.round(o.layerPay * layerSize(state.layers, o)));
            state.layers++;
            const mite = state.layers >= o.miteFirst && (state.layers - o.miteFirst) % o.miteEvery === 0;
            if (mite) { state.swarm.push(mitePlace(state, state.mites)); state.mites++; }
            state.owed += pay;
            out.events.push({ type: 'layer', layer: state.layers, pay, mite, mites: state.mites });
            startLayer(state, o);
            state.fed = over;
        }
    }

    // One mite for one step: head for the point you hold (or the nearest sand on the surface), biting what is in the way.
    function mite(state, o, m, dt, out) {
        const led = !!state.aim, { w, h, cells } = state;
        m.b = Math.min(m.b + o.chew * o.grains * (led ? 1 : o.graze) * dt, 2);
        let gx, gy, food = -1;
        if (led) {
            gx = state.aim.x; gy = state.aim.y;
            if ((m.x - gx) * (m.x - gx) + (m.y - gy) * (m.y - gy) <= o.near * o.near) food = nearestWithin(state, gx, gy, o.near);
        } else {
            if (m.t < 0 || !cells[m.t]) m.t = state.grains ? nearestSurface(state, m.x, m.y) : -1;
            food = m.t;
            if (food < 0) { gx = w / 2 + ((state.swarm.indexOf(m) * 7) % 11 - 5) * 2; gy = 2; }
        }
        if (food >= 0) { gx = food % w + 0.5; gy = Math.floor(food / w) + 0.5; }
        const here = Math.floor(m.y) * w + Math.floor(m.x);
        if (food === here && cells[here]) {
            while (m.b >= 1 && cells[here]) { m.b -= 1; const v = cells[here], hp = hpOf(v) - 1; if (hp > 0) cells[here] = cell(kindOf(v), bandOf(v), hp, seenOf(v)); else eat(state, o, here, out); }
            return;
        }
        const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
        if (d < 0.05) { if (food < 0) m.b = Math.min(m.b, 1); return; }
        const go = Math.min(d, o.speed * dt), nx = Math.max(0.01, Math.min(w - 0.01, m.x + dx / d * go)), ny = Math.max(0.01, Math.min(h - 0.01, m.y + dy / d * go));
        // The cell it would step into; when the step stays in its own cell, the next one toward the goal.
        let ci = Math.floor(ny) * w + Math.floor(nx);
        const own = Math.floor(m.y) * w + Math.floor(m.x);
        if (ci === own && d > go) {
            const px = Math.max(0, Math.min(w - 1, Math.floor(m.x + dx / d))), py = Math.max(0, Math.min(h - 1, Math.floor(m.y + dy / d)));
            if (cells[py * w + px]) ci = py * w + px;
        }
        if (cells[ci] && ci !== own) {
            // Sand in the way: bite it, and move in once it is gone.
            while (m.b >= 1 && cells[ci]) {
                m.b -= 1;
                const v = cells[ci], hp = hpOf(v) - 1;
                if (hp > 0) cells[ci] = cell(kindOf(v), bandOf(v), hp, seenOf(v));
                else eat(state, o, ci, out);
            }
            return;
        }
        m.x = nx; m.y = ny;
        if (food < 0) m.b = Math.min(m.b, 1);   // nothing to bite on the way: no bites saved up
    }

    // A mite's lamp: hidden sand lying within `lamp` cells of it shows what it is, for good (sand still falling past doesn't).
    function lamp(state, o, m, out) {
        const { w, h, cells } = state, r = o.lamp, r2 = r * r;
        for (let y = Math.max(0, Math.floor(m.y - r)); y <= Math.min(h - 1, Math.floor(m.y + r)); y++) {
            for (let x = Math.max(0, Math.floor(m.x - r)); x <= Math.min(w - 1, Math.floor(m.x + r)); x++) {
                const i = y * w + x, v = cells[i];
                if (!v || seenOf(v) || (y < h - 1 && !cells[i + w]) || (x + 0.5 - m.x) * (x + 0.5 - m.x) + (y + 0.5 - m.y) * (y + 0.5 - m.y) > r2) continue;
                cells[i] = v | 64;
                out.events.push({ type: 'found', x, y, kind: KIND_IDS[kindOf(v)] });
            }
        }
    }

    // `dt` seconds pass. Returns { research, events }: research earned (whole numbers) and what the screen should show.
    function step(state, dt, opts) {
        const o = opt(opts), out = { research: 0, events: [] };
        if (!(dt > 0) || !Number.isFinite(dt)) return out;
        const steps = Math.min(6000, Math.max(1, Math.round(dt / STEP))), each = dt / steps;
        for (let n = 0; n < steps; n++) {
            // Pouring and falling take turns, a cell's fall at a time, so the spout is clear for the next grains.
            state.fallAcc += o.fall * each;
            const passes = Math.floor(state.fallAcc);
            state.fallAcc -= passes;
            if (!passes) pour(state, o, each);
            let moved = false;
            for (let k = 0; k < passes; k++) {
                pour(state, o, each / passes);
                if (!state.rest) moved = fallPass(state) || moved;
            }
            if (passes && !moved && !state.backlog.length) state.rest = true;
            if (state.grains) {
                // Fine sand: a mite may finish several grains in a step, so its step is cut into as many moves.
                const moves = Math.max(1, Math.ceil(o.chew * o.grains * (state.aim ? 1 : o.graze) * each));
                for (const m of state.swarm) { for (let k = 0; k < moves; k++) mite(state, o, m, each / moves, out); lamp(state, o, m, out); }
            }
            else if (!state.backlog.length) {
                for (const m of state.swarm) { m.b = 0; m.t = -1; }
                if (!state.dry && state.stats.delivered > 0) { state.dry = true; out.events.push({ type: 'empty' }); }
            }
        }
        const whole = Math.floor(state.owed + 1e-9);
        if (whole > 0) { state.owed -= whole; state.stats.research += whole; out.research = whole; }
        return out;
    }

    // The kinds the model can read now (from the skills learned). Their sand in the pile turns good: quick to eat, paying.
    function setReadable(state, kinds, opts) {
        const o = opt(opts), out = { research: 0, events: [], turned: 0 };
        const next = LOCKED.filter(k => (kinds || []).includes(k));
        const fresh = next.filter(k => !state.readable.includes(k)).map(k => KINDS[k].id);
        state.readable = next;
        if (fresh.length) {
            for (let i = 0; i < state.cells.length; i++) {
                const v = state.cells[i];
                if (v && fresh.includes(kindOf(v))) { state.cells[i] = cell(kindOf(v), bandOf(v), Math.max(1, Math.ceil(hpOf(v) / o.slow)), seenOf(v)); out.turned++; }
            }
        }
        return out;
    }
    // The readable kinds for a list of learned skill names.
    const readableFor = skills => LOCKED.filter(k => (skills || []).includes(KINDS[k].skill));

    // The hunger meter: paying grains eaten since the last split, the grains a split needs, and the share of the way there.
    function hunger(state, opts) {
        const o = opt(opts), need = layerSize(state.layers, o) * o.grains;
        return { fed: state.fed, need, share: Math.min(1, state.fed / need), splits: state.layers };
    }

    // How many grains of each kind lie in the box.
    function census(state) {
        const out = {};
        for (const v of state.cells) if (v) { const k = KIND_IDS[kindOf(v)]; out[k] = (out[k] || 0) + 1; }
        return out;
    }

    // A saved Feed, cleaned whatever the save holds: counts whole and in range, every cell a real grain, a mite for
    // every mite. A box of the wrong size (an older save's grid of tiles, or junk) is emptied; what was earned stays.
    function clean(raw, opts = {}) {
        const o = opt(opts);
        const whole = (v, cap) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, Math.floor(v)) : 0);
        const real = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
        const state = newFeed(opts);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
        state.layers = whole(raw.layers, 200);
        state.mites = Math.max(1, Math.min(whole(raw.mites, 999), 1 + state.layers));
        const pieces = FRAGMENT_ORDER.reduce((n, id) => n + FRAGMENTS[id].pieces, 0);
        state.fragNext = whole(raw.fragNext, pieces);
        for (const id of FRAGMENT_ORDER) {
            const found = Math.min(FRAGMENTS[id].pieces, Array.isArray(raw.fragments?.[id]) ? raw.fragments[id].length : 0);
            if (found) state.fragments[id] = Array.from({ length: found }, (_, n) => n);
        }
        state.readable = LOCKED.filter(k => Array.isArray(raw.readable) && raw.readable.includes(k));
        for (const key of Object.keys(state.stats)) state.stats[key] = whole(raw.stats?.[key], 1e15);
        const box = raw.w === FEED.w && raw.h === FEED.h ? (typeof raw.cells === 'string' ? unpack(raw.cells, FEED.w * FEED.h) : raw.cells) : null;
        const sized = Array.isArray(box) && box.length === FEED.w * FEED.h;
        if (sized) {
            state.grains = 0;
            state.cells = box.map(v => {
                if (!Number.isInteger(v) || v <= 0 || !KIND_IDS[kindOf(v)] || hpOf(v) < 1 || hpOf(v) > 255) return 0;
                state.grains++;
                return v;
            });
            state.backlog = (Array.isArray(raw.backlog) ? raw.backlog.slice(0, 200) : []).map(e => {
                const entry = { sector: Math.max(1, whole(e?.sector, 99)), n: whole(e?.n, 1e8), gold: whole(e?.gold, 1e8), bad: whole(e?.bad, 1e8), band: whole(e?.band, 7) };
                if (LOCKED.includes(e?.kind)) entry.kind = e.kind;
                return entry.n + entry.gold + entry.bad > 0 ? entry : null;
            }).filter(Boolean);
            state.rs = whole(raw.rs, 0xFFFFFFFF) >>> 0 || state.rs;
            state.tick = whole(raw.tick, 1e15);
            state.fed = whole(raw.fed, 1e9);
            state.owed = real(raw.owed, 0, 1e6, 0);
            state.plain = whole(raw.plain, 1e9);
            state.fragAt = whole(raw.fragAt, 1e9) || state.fragAt;
            state.fragPlaced = raw.fragPlaced === true;
            state.last = whole(raw.last, 3);
            state.band = whole(raw.band, 7);
            state.spout = Number.isInteger(raw.spout) && Math.abs(raw.spout) <= o.spout ? raw.spout : 0;
            state.pourAcc = real(raw.pourAcc, 0, 1e4, 0);
            state.fallAcc = real(raw.fallAcc, 0, 1e4, 0);
            state.dry = raw.dry === true;
            // At rest only if the save says so and no grain hangs over an empty cell.
            state.rest = raw.rest === true && !state.cells.some((v, i) => v && i + FEED.w < state.cells.length && !state.cells[i + FEED.w]);
            const aim = raw.aim;
            state.aim = null;
            if (aim) point(state, aim);
        }
        state.swarm = Array.from({ length: state.mites }, (_, n) => {
            const m = sized && Array.isArray(raw.swarm) ? raw.swarm[n] : null, d = mitePlace(state, n);
            return { x: real(m?.x, 0, FEED.w - 0.01, d.x), y: real(m?.y, 0, FEED.h - 0.01, d.y), b: real(m?.b, 0, 4, 0), t: Number.isInteger(m?.t) && m.t >= -1 && m.t < FEED.w * FEED.h ? m.t : -1 };
        });
        return state;
    }

    return { FEED, KINDS, KIND_IDS, LOCKED, FRAGMENTS, STEP, newFeed, clean, deliver, point, step, setReadable, readableFor,
        pack, unpack, left, waiting, fill, census, hunger, layerSize, bitesFor, kindOf, bandOf, seenOf, hpOf };
});
