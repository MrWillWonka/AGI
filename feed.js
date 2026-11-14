// feed.js — The Feed, the ring's calm minigame (design/ring.md → The Feed; design/ring-build.md, Build 1): everything
// Packet Snare catches lands in a heap of face-down tiles, a swarm of mites (the AI) eats where you point, and what
// it uncovers pays research. No clock, no enemy, no failed run.
//
// **The heap is one layer at a time.** A layer is a tray of `size` slots (30, then ×1.8 a layer) on a grid `cols`
// wide. Packets delivered from a run fill its empty slots; what doesn't fit waits in `backlog` for the next layer.
// A layer is cleared when every slot has been filled and nothing the model can read is left on it: that pays a lump
// of research, and the first layer cleared and every second one after it add a mite for good. A layer whose delivered tiles are all eaten but
// whose slots aren't all filled is just empty ("> It is still hungry."): back to Packet Snare.
//
// **Tiles** are face down (`s` 0) until eaten or shown:
//   plain      letters, which the model reads from the start: the bulk of the heap
//   vein       a gold packet: pays more, and lies in a line; eating one shows the vein tiles beside it
//   fragment   a piece of a message (one set so far, the parcel spam): one hides in each layer until the set is whole
//   numbers    unreadable until Embeddings is learned     \  the model can't chew these yet: they don't hold a layer
//   pictures   unreadable until Edge Detection is learned /  up, they wait in `locked` and come back when it can
// Deeper sectors bring tougher data: a tile takes `tough` bites by the sector it came from.
//
// **The one verb is point.** `point(state, cells)` gives the swarm a line of cells to eat, in order, at full speed
// (`chew` bites a second a mite). With no line it grazes on its own at `graze` of that, lowest slot first, so the heap
// goes down slowly while you are elsewhere. A line is at most `lineMax` tiles: to keep full speed you keep pointing.
//
// Pure and deterministic: no DOM, no clock, no Math.random (the generator's position is in the state, so a saved heap
// carries on exactly). The state is plain data, ready for the save. Loaded in the browser as window.Feed and in Node
// (tests) via require(). The dials start at tools/ring-model.js's values and a test holds the two in step.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Feed = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The base numbers, in one place. Every call takes overrides of any of them.
    const FEED = {
        chew: 2,            // bites a second a mite, eating along your line (the model's `chew`)
        graze: 0.35,        // the share of that with no line to follow (the model's `graze`)
        tough: [1, 2, 3],   // bites a tile takes, by the sector it came from (the model's `tough`); +1 a sector past the list
        layerFirst: 30,     // slots in the first layer
        layerGrow: 1.8,     // each layer is this much bigger than the last (the model's `layerGrow`)
        miteFirst: 1,       // the first new mite comes with this layer cleared (the owner's call: the first one; the model's `miteFirst`)
        miteEvery: 2,       // and another every this many layers after it (the model's `miteEvery`)
        layerMax: 600,      // the most slots a layer holds (a guard for the screen and the save; past the first cut's reach)
        layerPay: 0.2,      // a cleared layer's lump of research, as a share of its slots
        lineMax: 12,        // the most tiles a pointed line holds
        veinMax: 6,         // the longest single run of vein tiles
        fragFrom: 2,        // a layer's fragment lies under one of its first plain packets: this many in at the least,
        fragSpread: 10      // and up to this many more
    };

    // What a tile of each kind pays when eaten (whole numbers), and the skill that makes an unreadable kind readable.
    const KINDS = {
        plain: { pay: 1 },
        vein: { pay: 3 },
        fragment: { pay: 2 },
        numbers: { pay: 2, skill: 'Embeddings', from: 2, share: 0.1 },
        pictures: { pay: 2, skill: 'Edge Detection', from: 4, share: 0.1 }
    };
    // The unreadable kinds, in the order their skills are learned. `from`: the first sector whose data holds them.
    const LOCKED = Object.keys(KINDS).filter(k => KINDS[k].skill);
    // Fragment sets. The words live with the mail (engine.js); the rules only count the pieces.
    const FRAGMENTS = { parcel: { pieces: 4 } };
    const FRAGMENT_ORDER = ['parcel'];

    const opt = opts => (opts ? { ...FEED, ...opts } : FEED);
    const layerSize = (n, opts) => { const o = opt(opts); return Math.min(o.layerMax, Math.round(o.layerFirst * Math.pow(o.layerGrow, Math.min(n, 60)))); };
    const bitesFor = (sector, opts) => {
        const t = opt(opts).tough, k = Math.max(1, Math.floor(sector) || 1);
        return k <= t.length ? t[k - 1] : t[t.length - 1] + (k - t.length);
    };
    const colsFor = size => Math.max(1, Math.ceil(Math.sqrt(size)));

    // Mulberry32 (as packet-snare.js and evals.js), stepped from a position kept in the state.
    function rand(state) {
        const a = state.rs = (state.rs + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function startLayer(state, o) {
        state.size = layerSize(state.layers, o);
        state.cols = colsFor(state.size);
        state.tiles = new Array(state.size).fill(null);
        state.free = state.size;
        state.line = [];
        state.plain = 0;
        state.fragAt = o.fragFrom + Math.floor(rand(state) * Math.max(1, Math.min(o.fragSpread, state.size / 3)));
        state.fragPlaced = false;
    }

    // A new, empty Feed: one mite, the first layer's tray, nothing delivered.
    function newFeed(opts = {}) {
        const o = opt(opts);
        const state = {
            rs: (opts.seed ?? 1) >>> 0, layers: 0, mites: 1, bite: 0, dry: false,
            size: 0, cols: 0, tiles: [], free: 0, line: [], plain: 0, fragAt: 0, fragPlaced: false,
            backlog: [], locked: [], readable: [], fragNext: 0, fragments: {},
            stats: { delivered: 0, eaten: 0, research: 0, veins: 0 }
        };
        startLayer(state, o);
        return state;
    }

    const readable = (state, kind) => !KINDS[kind].skill || state.readable.includes(kind);
    // Tiles on the layer the swarm can still eat.
    const left = state => state.tiles.reduce((n, t) => n + (t && !t.e && readable(state, t.k) ? 1 : 0), 0);
    // Packets waiting for a later layer.
    const waiting = state => state.backlog.reduce((n, e) => n + e.n + e.gold, 0);
    const cellOf = (state, i) => ({ c: i % state.cols, r: Math.floor(i / state.cols) });
    const indexOf = (state, c, r) => (c >= 0 && r >= 0 && c < state.cols && r * state.cols + c < state.size ? r * state.cols + c : -1);
    const grid = state => ({ cols: state.cols, rows: Math.ceil(state.size / state.cols), size: state.size });

    function emptySlot(state) {
        let i = Math.floor(rand(state) * state.size);
        for (let n = 0; n < state.size; n++, i = (i + 1) % state.size) if (!state.tiles[i]) return i;
        return -1;
    }
    function put(state, i, tile) { state.tiles[i] = tile; state.free--; }

    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    // Lays up to `n` vein tiles in a line from a random empty slot, turning where it is blocked. Returns how many.
    function layVein(state, o, entry, n) {
        let i = emptySlot(state), d = Math.floor(rand(state) * 8), laid = 0;
        while (i >= 0 && laid < n) {
            put(state, i, { k: 'vein', b: bitesFor(entry.sector, o), q: entry.sector, s: 0, e: 0 });
            laid++;
            const { c, r } = cellOf(state, i);
            let next = -1;
            for (let turn = 0; turn < 8 && next < 0; turn++) {
                const dir = DIRS[(d + turn) % 8], j = indexOf(state, c + dir[0], r + dir[1]);
                if (j >= 0 && !state.tiles[j]) { next = j; d = (d + turn) % 8; }
            }
            i = next;
        }
        return laid;
    }

    // What an ordinary packet turns out to be: this layer's fragment, an unreadable kind, or plain letters.
    function kindOfPacket(state, o, entry) {
        if (entry.kind) return { k: entry.kind };
        const set = FRAGMENT_ORDER.find(id => state.fragNext < FRAGMENTS[id].pieces);
        if (set && !state.fragPlaced && ++state.plain >= state.fragAt) {
            state.fragPlaced = true;
            return { k: 'fragment', set, piece: state.fragNext++ };
        }
        const roll = rand(state);
        let edge = 0;
        for (const k of LOCKED) {
            if (entry.sector < KINDS[k].from) continue;
            edge += KINDS[k].share;
            if (roll < edge) return { k };
        }
        return { k: 'plain' };
    }

    // Moves waiting packets onto the layer's empty slots.
    function fill(state, o) {
        let added = 0;
        while (state.free > 0 && state.backlog.length) {
            const entry = state.backlog[0];
            if (entry.gold > 0) {
                const laid = layVein(state, o, entry, Math.min(entry.gold, o.veinMax));
                entry.gold -= laid; added += laid;
            } else if (entry.n > 0) {
                put(state, emptySlot(state), { ...kindOfPacket(state, o, entry), b: bitesFor(entry.sector, o), q: entry.sector, s: 0, e: 0 });
                entry.n--; added++;
            }
            if (entry.gold <= 0 && entry.n <= 0) state.backlog.shift();
        }
        if (added) state.dry = false;
        return added;
    }

    // After anything changes: clear a finished layer (and the next, if the backlog finishes that too), or say the heap
    // is empty, once.
    function settle(state, o, out) {
        for (let guard = 0; guard < 64; guard++) {
            if (left(state) > 0) return;
            if (state.free > 0) {
                if (!state.dry) { state.dry = true; out.events.push({ type: 'empty' }); }
                return;
            }
            const kept = {};
            for (const t of state.tiles) {
                if (!t || t.e) continue;
                kept[t.k] = (kept[t.k] || 0) + 1;
                const store = state.locked.find(e => e.kind === t.k && e.sector === t.q);
                if (store) store.n++; else state.locked.push({ kind: t.k, sector: t.q, n: 1 });
            }
            const pay = Math.max(1, Math.round(o.layerPay * state.size));
            state.layers++;
            const mite = state.layers >= o.miteFirst && (state.layers - o.miteFirst) % o.miteEvery === 0;
            if (mite) state.mites++;
            state.stats.research += pay; out.research += pay;
            out.events.push({ type: 'layer', layer: state.layers, pay, mite, mites: state.mites, locked: kept });
            startLayer(state, o);
            fill(state, o);
        }
    }

    // A run's packets arrive: { sector, packets, gold } (gold packets become veins). Returns what happened.
    function deliver(state, load, opts) {
        const o = opt(opts), out = { research: 0, events: [], added: 0 };
        const packets = Math.max(0, Math.floor(load.packets) || 0), gold = Math.min(packets, Math.max(0, Math.floor(load.gold) || 0));
        if (!packets) return out;
        state.backlog.push({ sector: Math.max(1, Math.floor(load.sector) || 1), n: packets - gold, gold });
        state.stats.delivered += packets;
        out.added = fill(state, o);
        settle(state, o, out);
        return out;
    }

    // Point the swarm: `cells` is the dragged line as slot indices or { c, r } cells, in order. Returns the line kept.
    function point(state, cells, opts) {
        const o = opt(opts), line = [];
        for (const cell of cells || []) {
            const i = typeof cell === 'number' ? (Number.isInteger(cell) && cell >= 0 && cell < state.size ? cell : -1) : indexOf(state, cell.c, cell.r);
            const t = i >= 0 ? state.tiles[i] : null;
            if (!t || t.e || (t.s && !readable(state, t.k)) || line.includes(i)) continue;
            line.push(i);
            if (line.length >= o.lineMax) break;
        }
        state.line = line;
        return line.slice();
    }

    function eat(state, o, i, out) {
        const t = state.tiles[i], pay = KINDS[t.k].pay;
        t.e = 1; t.s = 1; t.b = 0;
        state.stats.eaten++; state.stats.research += pay; out.research += pay;
        out.events.push({ type: 'eat', cell: i, kind: t.k, pay });
        if (t.k === 'vein') {
            state.stats.veins++;
            const { c, r } = cellOf(state, i), shown = [];
            for (const d of DIRS) {
                const j = indexOf(state, c + d[0], r + d[1]), n = j >= 0 ? state.tiles[j] : null;
                if (n && n.k === 'vein' && !n.s) { n.s = 1; shown.push(j); }
            }
            if (shown.length) out.events.push({ type: 'reveal', cells: shown, kind: 'vein' });
        }
        if (t.k === 'fragment') {
            const found = state.fragments[t.set] || (state.fragments[t.set] = []);
            found.push(t.piece);
            out.events.push({ type: 'fragment', set: t.set, piece: t.piece, found: found.length, of: FRAGMENTS[t.set].pieces, complete: found.length >= FRAGMENTS[t.set].pieces });
        }
    }

    // The tile the swarm bites next: the front of your line, else the lowest slot it can read. −1 when there is none.
    function target(state, out) {
        while (state.line.length) {
            const i = state.line[0], t = state.tiles[i];
            if (t && !t.e && readable(state, t.k)) return i;
            if (t && !t.e && !t.s) { t.s = 1; if (out) out.events.push({ type: 'locked', cell: i, kind: t.k, skill: KINDS[t.k].skill }); }
            state.line.shift();
        }
        return state.tiles.findIndex(t => t && !t.e && readable(state, t.k));
    }

    // `dt` seconds pass. Returns { research, events }: research earned (whole numbers) and what the screen should show.
    function step(state, dt, opts) {
        const o = opt(opts), out = { research: 0, events: [] };
        if (!(dt > 0)) return out;
        const layer = state.layers;
        state.bite += state.mites * o.chew * (state.line.length ? 1 : o.graze) * dt;
        for (let guard = 0; state.bite >= 1 - 1e-9 && guard < 100000; guard++) {
            const i = target(state, out);
            if (i < 0) { state.bite = 0; break; }
            state.bite = Math.max(0, state.bite - 1);
            const t = state.tiles[i];
            if (--t.b > 0) { out.events.push({ type: 'bite', cell: i, left: t.b }); continue; }
            eat(state, o, i, out);
            if (state.line[0] === i) state.line.shift();
            settle(state, o, out);
            // A cleared layer ends the step's eating: the new layer waits for you to point (or for the next step's graze).
            if (state.layers !== layer) { state.bite = Math.min(state.bite, 1); break; }
        }
        if (left(state) === 0) state.bite = 0;
        return out;
    }

    // The kinds the model can read now (from the skills learned). Tiles it had to leave behind come back to the heap.
    function setReadable(state, kinds, opts) {
        const o = opt(opts), out = { research: 0, events: [], returned: 0 };
        state.readable = LOCKED.filter(k => (kinds || []).includes(k));
        const back = state.locked.filter(e => state.readable.includes(e.kind));
        state.locked = state.locked.filter(e => !state.readable.includes(e.kind));
        for (const e of back.reverse()) { state.backlog.unshift({ sector: e.sector, n: e.n, gold: 0, kind: e.kind }); out.returned += e.n; }
        if (left(state) > 0) state.dry = false;
        fill(state, o);
        settle(state, o, out);
        return out;
    }
    // The readable kinds for a list of learned skill names.
    const readableFor = skills => LOCKED.filter(k => (skills || []).includes(KINDS[k].skill));

    // The tiles the mites are on now, one each, for the screen: the front of the line, then the graze order.
    function working(state) {
        const cells = state.line.filter(i => { const t = state.tiles[i]; return t && !t.e && readable(state, t.k); });
        for (let i = 0; cells.length < state.mites && i < state.size; i++) {
            const t = state.tiles[i];
            if (t && !t.e && readable(state, t.k) && !cells.includes(i)) cells.push(i);
        }
        return cells.slice(0, state.mites);
    }

    // A saved Feed, cleaned whatever the save holds: counts whole and in range, every tile a real one, the layer's
    // tray the size its number says (a tray of the wrong size is dropped and the layer starts empty; what was earned
    // stays). Anything that isn't a Feed at all gives a new one.
    function clean(raw, opts = {}) {
        const o = opt(opts);
        const whole = (v, cap) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, Math.floor(v)) : 0);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return newFeed(opts);
        const state = newFeed(opts);
        state.rs = whole(raw.rs, 0xFFFFFFFF) >>> 0 || state.rs;
        state.layers = whole(raw.layers, 200);
        state.mites = Math.max(1, Math.min(whole(raw.mites, 999), 1 + state.layers));
        state.bite = typeof raw.bite === 'number' && raw.bite >= 0 && raw.bite < 10 ? raw.bite : 0;
        state.dry = raw.dry === true;
        const pieces = FRAGMENT_ORDER.reduce((n, id) => n + FRAGMENTS[id].pieces, 0);
        state.fragNext = whole(raw.fragNext, pieces);
        for (const id of FRAGMENT_ORDER) {
            const found = (Array.isArray(raw.fragments?.[id]) ? raw.fragments[id] : []).filter((p, i, a) => Number.isInteger(p) && p >= 0 && p < FRAGMENTS[id].pieces && a.indexOf(p) === i);
            if (found.length) state.fragments[id] = found;
        }
        state.readable = LOCKED.filter(k => Array.isArray(raw.readable) && raw.readable.includes(k));
        const entries = (list, needKind) => (Array.isArray(list) ? list.slice(0, 200) : []).map(e => {
            const kind = LOCKED.includes(e?.kind) ? e.kind : null;
            const out = { sector: Math.max(1, whole(e?.sector, 99)), n: whole(e?.n, 1e7) };
            if (needKind) return kind && out.n ? { kind, sector: out.sector, n: out.n } : null;
            out.gold = kind ? 0 : whole(e?.gold, 1e7);
            if (kind) out.kind = kind;
            return out.n + out.gold > 0 ? out : null;
        }).filter(Boolean);
        state.backlog = entries(raw.backlog, false);
        state.locked = entries(raw.locked, true);
        for (const key of Object.keys(state.stats)) state.stats[key] = whole(raw.stats?.[key], 1e15);
        startLayer(state, o);
        state.rs = whole(raw.rs, 0xFFFFFFFF) >>> 0 || state.rs;   // startLayer drew from it: put it back where the save had it
        if (Array.isArray(raw.tiles) && raw.tiles.length === state.size) {
            raw.tiles.forEach((t, i) => {
                if (!t || typeof t !== 'object' || !KINDS[t.k]) return;
                const e = t.e ? 1 : 0, b = e ? 0 : Math.max(1, whole(t.b, 99));
                const tile = { k: t.k, b, q: Math.max(1, whole(t.q, 99)), s: e || t.s ? 1 : 0, e };
                if (t.k === 'fragment') {
                    if (!FRAGMENTS[t.set] || !Number.isInteger(t.piece) || t.piece < 0 || t.piece >= FRAGMENTS[t.set].pieces) return;
                    tile.set = t.set; tile.piece = t.piece;
                }
                const ordered = t.k === 'fragment' ? { k: tile.k, set: tile.set, piece: tile.piece, b: tile.b, q: tile.q, s: tile.s, e: tile.e } : tile;
                put(state, i, ordered);
            });
            state.plain = whole(raw.plain, 1e7);
            state.fragAt = whole(raw.fragAt, 1e7) || state.fragAt;
            state.fragPlaced = raw.fragPlaced === true;
            state.line = (Array.isArray(raw.line) ? raw.line : []).filter((i, n, a) => Number.isInteger(i) && state.tiles[i] && !state.tiles[i].e && a.indexOf(i) === n).slice(0, o.lineMax);
        }
        return state;
    }

    return { FEED, KINDS, LOCKED, FRAGMENTS, newFeed, clean, deliver, point, step, setReadable, readableFor, working,
        left, waiting, grid, cellOf, indexOf, layerSize, bitesFor };
});
