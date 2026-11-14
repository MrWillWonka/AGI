// feed.js — The Feed, the ring's calm minigame (design/ring.md → The Feed; design/ring-build.md, Build 1): the
// packets Packet Snare catches fall into a box and turn to sand, a swarm of mites (the AI) eats the pile from the
// outside in, and what it eats pays research. No clock, no enemy, no failed run. (The owner's design, 2026-11-13,
// replacing a grid of face-down tiles and a drawn line: sand art, eaten like sand, the swarm drawn to your finger.)
//
// **The box** is `w` × `h` cells. A packet is `grains` grains of sand. Data comes in as packets (`drops`): they fall
// from a spout that sweeps back and forth across the top, so the sand is laid in layers, and half way down to the pile
// under it a packet melts into its grains (the owner's design). Grains fall and slide off each other into a pile (one
// cell down, else one down and across), and now and then one hops as it lands: a little static in it. What doesn't fit
// yet waits in `backlog`. Each delivery is a band of its own colour (`band`), so the pile lies in strata.
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
// **Sessions** (the owner's cards, 2026-11-14; on when `sessions(state)` has been called, as the ring does). What
// Packet Snare catches is **stockpiled by the sector it came from** (`stock`), each stockpile holding `stockRuns`
// of your best run there (`stockMin` at the least); what doesn't fit is lost. Nothing eats outside a session. A
// **session** starts on one sector's stockpile (`startSession`): an empty box, one mite, that sand poured in. A
// **hunger bar** (`life`, 1 to 0) drains over `hungerTime` seconds and eating paying sand refills it (the whole bar
// for `hungerFill` of the layer's worth, so it gets harder to keep up as layers grow); a split fills it. When it
// empties, or the sand is gone, the session is over (`over` event): the box is cleared and the swarm is one mite
// again. Research and fragments are kept. A deeper sector's sand is tougher (`tough`) and pays more (`sectorPay`).
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
        w: 256, h: 448,     // the box, in cells: tall, for an upright phone; finer sand (the owner's call, 2026-11-14: grains half the size, so
                            // every length below is in these smaller cells and a packet makes four times the grains)
        grains: 64,         // grains of sand a packet makes
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
        sweep: 92,          // how far the spout swings either side of the middle at the most, in cells
        sweepMin: 12,       // its swing over an empty box,
        sweepGrow: 0.3,     // and what the square root of the grains there are adds to it
        sweepTime: 7,       // seconds for one swing there and back
        spout: 4,           // how far a packet may leave the spout off its line, in cells
        drop: 140,          // cells a second a packet falls
        melt: 0.5,          // a packet melts into sand this share of the way down to the pile under it
        puff: 6,            // how far its grains scatter as it melts, in cells
        hop: 8,             // one landing grain in this many hops (and one in eight of those hops high)
        full: 0.8,          // the spout waits while this share of the box is sand
        // The swarm's own mind (the owner's call, 2026-11-14: mites roam round the point and meander to it; each has a
        // character). All three at 0 is a swarm that goes straight to the point and eats what is nearest it.
        roam: 40,           // how far from the point you hold a mite picks its own spot to work, in cells (the owner's pick: strong)
        wobble: 0.9,        // how far off the straight line it swings on its way there, in radians
        character: 1,       // 1: each mite follows its character's priorities (`CHARACTERS`)
        megaChance: 0.08,
        // A tapped point (the owner's call, 2026-11-14): it stays until you tap elsewhere, and the swarm works loosely
        // round it; holding or dragging pulls them tight, at full pace.
        tapRate: 0.6,       // the share of a led mite's eating a mite at a tapped point does (left alone: `graze`)
        tapRoam: 1.5,       // and how much wider it roams round a tapped point than round a held one
        toughFeed: 0.7,     // tough sand feeds the hunger bar this much more a bite past the first (the owner's call: a little worse than soft sand)   // the chance a new mite at a split is a mega mite, which takes sand two grains at a time
        gravity: 4,         // a falling grain speeds up: a cell a pass at first, up to this many (the owner's call: so sand reads as falling)
        slump: 4,           // a resting grain on a slope steeper than one in two rolls a cell down it, one pass in this many: heaps settle shallower and slide
        fall: 120,          // cells a second a grain falls
        speed: 180,         // cells a second a mite moves
        near: 16,           // a led mite this close to the point eats the sand nearest the point
        lamp: 14,           // a mite shows what the sand within this many cells of it really is (gold, fragments)
        stick: 0.92,        // how likely the next grain poured is the same sort as the last: sorts lie in patches
        bands: 6,           // colours of strata before they repeat
        fragFrom: 2,        // a layer's fragment is one of its first plain packets: this many in at the least,
        fragSpread: 10,     // and up to this many more
        stockRuns: 3,       // sessions: a sector's stockpile holds this many of your best run there (the owner's call),
        stockMin: 60,       // and this many packets at the least
        hungerTime: 25,     // seconds a full hunger bar takes to empty
        hungerFill: 0.6,    // eating this share of the layer's worth of paying sand refills the whole bar
        sectorPay: 0.5,     // a packet from sector k pays 1 + this × (k − 1) times as much
        cardChoices: 3,     // cards offered at a split, to pick one (the owner's call: the session waits while you choose)
        cardRare: 0.12,     // the chance each offered card is a rare one, when there are rare ones to offer
        // The tools (rare cards; all work on their own). A level past the first makes each come round sooner: ÷ (1 + `toolFaster` a level).
        toolFaster: 0.5,
        scanEvery: 12,      // scanner: seconds between sweeps,
        scanSpeed: 140,     // and cells a second the beam crosses the box
        pulseEvery: 8,      // pulse: seconds between bursts,
        pulseR: 8,          // its radius in cells,
        pulseGrow: 2,       // and what a level adds to it
        arcEvery: 3,        // arc: seconds between sparks,
        arcReach: 60,       // how far apart two mites may be, in cells,
        arcGrow: 16,        // and what a level adds to it
        sortRate: 480,      // sorter bots: grains a second each bot carries toward its kind's side (a bot a level),
        sortHop: 28,        // and how many cells it carries one, at the most
        shakeEvery: 2,      // algo-rhythm: seconds between beats,
        shakeMoves: 1200,   // and garbled grains a beat that sink a cell, a level
        // The combos: each its own effect (the owner's call, 2026-11-14: a new thing, not the two tools made stronger).
        sonarEvery: 7,      // Sonar: seconds between rings,
        sonarR: 52,         // how far a ring spreads from the point you hold, in cells,
        sonarSpeed: 90,     // cells a second it spreads,
        sonarPull: 32,      // and how many cells it draws each valuable grain back in
        stormEvery: 3,      // Storm: seconds between strikes,
        stormLen: 112,      // grains a mite's bolt runs through,
        stormForks: 2,      // and bolts a mite sends
        defragEvery: 2,     // Defrag: seconds between passes,
        defragPack: 6,      // a garbled grain with this many garbled neighbours (of eight) is in a clump,
        defragMax: 320,     // and this many clumped grains a pass are rewritten into good sand
        tracerEvery: 1.5,   // Tracer: seconds between sparks,
        tracerReach: 52,    // how far from a mite a spark finds gold, in cells,
        tracerEat: 16,      // and the gold grains a spark takes
        magnetRate: 640,    // Magnet: gold grains a second drawn toward the point you hold,
        magnetHop: 28,      // and how many cells each is drawn, at the most
        resoEvery: 2,       // Resonance: seconds between beats,
        resoR: 3.2,         // and the small circle round each mite a beat eats, in cells (the owner's call: much smaller than a pulse)
        siftEvery: 4,       // Sifter: seconds between sweeps (every other beat),
        siftRise: 10,       // and how many cells each gold grain the beam crosses is shaken up
        demoEvery: 4,       // Demolition bots: seconds between charges,
        demoR: 8,           // and the circle a charge blows away, in cells
        relayEvery: 3,      // Relay bots: seconds between chains,
        relayBots: 2,       // the bots that hover over the pile,
        relayMax: 120,      // and the grains a spark eats on one leg of the chain, at the most
        drumEvery: 2,       // Drum line: seconds between beats,
        drumSparks: 30,     // sparks in the row,
        drumHit: 2          // and the bites each takes out of the grain it lands on: a grain with no more left is collected
    };
    // Cards (the owner's cards, 2026-11-14): a split in a session offers `cardChoices` of these and you pick one; it
    // lasts the session and stacks. `stat` is the dial it multiplies (`pay` is research per grain), `by` the multiplier
    // a copy. `rare` cards (the tools and machines, to come) turn up at `cardRare`. Numbers are placeholders.
    const CARDS = {
        chew: { stat: 'chew', by: 1.25 },
        hunger: { stat: 'hungerTime', by: 1.25 },
        speed: { stat: 'speed', by: 1.3 },
        pay: { stat: 'pay', by: 1.2 },
        focus: { stat: 'roam', by: 0.7 },      // the swarm tracks the point more tightly: less roaming, a straighter way there
        // Tools (the owner's cards): rare, they work on their own, and a copy makes one stronger.
        scanner: { rare: true, tool: true },   // a beam crosses the box and shows what the sand is (gold, fragments)
        pulse: { rare: true, tool: true },     // a burst at the point you hold (else a mite) eats every grain in a circle
        arc: { rare: true, tool: true },       // sparks between mites near each other eat the sand along the line
        sorter: { rare: true, tool: true },    // bots move gold toward one wall and garbled sand toward the other: like with like
        rhythm: { rare: true, tool: true },    // the box shakes on a beat: the dense garbled sand sinks, the rest rises
        // Combos (the owner's call, from a picture of recipes): hold both tools and the combo may be offered; taking it
        // merges the two into one tool that does both jobs harder, with a twist of its own.
        sonar: { rare: true, combo: ['scanner', 'pulse'] },    // a ring spreads from your finger, shows the sand it crosses, then draws the valuable sand back in
        storm: { rare: true, combo: ['pulse', 'arc'] },        // chain lightning: each mite sends bolts out through the sand round it
        defrag: { rare: true, combo: ['sorter', 'rhythm'] },   // garbled sand packed in a clump is rewritten into good sand
        tracer: { rare: true, combo: ['scanner', 'arc'] },     // sparks jump from each mite to gold in reach and take it
        magnet: { rare: true, combo: ['scanner', 'sorter'] },  // gold is drawn toward the point you hold
        resonance: { rare: true, combo: ['pulse', 'rhythm'] }, // each beat sets off a small pulse at every mite at once
        sifter: { rare: true, combo: ['scanner', 'rhythm'] },  // the beam sweeps on the beat and shakes the gold it crosses up toward the surface
        demolition: { rare: true, combo: ['pulse', 'sorter'] },// bots fly to the biggest clumps of garbled sand and blow them away
        relay: { rare: true, combo: ['arc', 'sorter'] },       // sparks jump mite to bot to mite across the pile
        drum: { rare: true, combo: ['arc', 'rhythm'] }         // each beat a row of sparks drops on the pile: top and bottom layers are worn down, soft sand collected
    };
    const CARD_IDS = Object.keys(CARDS);
    // Mites' characters (the owner's picks). A new mite's is drawn at random; `mega` is rare (`megaChance`).
    //   gold: goes for gold it can see · tidy: goes for garbled sand, which the others leave · loner: works away from
    //   the rest · follower: keeps beside another mite · mega: no priority, takes two grains at a bite.
    // Later the AI is to sway what they go for and how far they obey (design/ring.md): `goalFor` and `liked` are where.
    const CHARACTERS = ['gold', 'tidy', 'loner', 'follower'];
    const COMBOS = CARD_IDS.filter(id => CARDS[id].combo);
    // A tool's level this session: its copies. (A combo uses its two tools up; it is a thing of its own.)
    const toolLevel = (state, id) => state.session?.cards?.[id] || 0;
    // May this card be offered now? A combo only once you hold both its tools (or already hold it).
    const offerable = (state, id) => { const k = CARDS[id], c = state.session?.cards || {}; return !k.combo || (!c[id] && k.combo.every(t => c[t] > 0)); };   // one copy of a combo, made once (the owner's calls)
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
    // `air`: the grain has not landed since it melted out of its packet (it may hop when it does).
    const kindOf = v => v & 7, bandOf = v => (v >> 3) & 7, seenOf = v => (v >> 6) & 1, airOf = v => (v >> 7) & 1, hpOf = v => (v >> 8) & 255;
    // A falling grain's speed is kept above those bits (0 to 7; `fallPass`): how long it has been falling.
    const velOf = v => (v >> 16) & 7, still = v => v & 0xFFFF;
    const cell = (kind, band, hp, seen = 1, air = 0) => kind | (band << 3) | ((seen ? 1 : 0) << 6) | ((air ? 1 : 0) << 7) | (Math.min(255, hp) << 8);
    const AIR = 128;
    // The highest row that may hold sand, remembered between passes so falling skips the empty box above it (not part
    // of the state: unknown is row 0, and anything that puts a grain higher says so with `raise`).
    const TOP = new WeakMap();
    const raise = (state, y) => { if (y < (TOP.get(state) ?? 0)) TOP.set(state, y); };
    // A whole number from a cell's place and the pass it is, the same every time: for hops and scatter, with no generator.
    const hash = (a, b) => { let x = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
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
    const mitePlace = (state, n) => ({ x: FEED.w / 2 + ((n * 7) % 11 - 5) * 4 + 0.5, y: 2.5, b: 0, t: -1, c: CHARACTERS[n % CHARACTERS.length], a: n * 1.7, ox: 0, oy: 0, rt: 0 });

    function startLayer(state, o) {
        state.fed = 0;
        state.plain = 0;
        state.fragAt = Math.round(o.fragFrom + rand(state) * o.fragSpread);
        state.fragPlaced = false;
    }

    // A new, empty Feed: one mite, an empty box.
    function newFeed(opts = {}) {
        const o = opt(opts);
        const state = {
            rs: (opts.seed ?? 1) >>> 0, w: FEED.w, h: FEED.h, cells: new Array(FEED.w * FEED.h).fill(0), grains: 0, rest: true, tick: 0,
            mites: 1, swarm: [], aim: null, spot: null, layers: 0, fed: 0, owed: 0, plain: 0, fragAt: 0, fragPlaced: false, fragNext: 0, fragments: {},
            backlog: [], drops: [], last: 0, band: 0, sweepAt: 0, pourAcc: 0, fallAcc: 0, readable: [], dry: false,
            // Sessions: stockpiles and best runs by sector, the session in play (or null), the hunger bar, the last one's result.
            sessioned: false, stock: {}, best: {}, record: {}, session: null, life: 1, lastSession: null,
            stats: { delivered: 0, eaten: 0, cleaned: 0, research: 0, veins: 0, hops: 0, sessions: 0, lost: 0 }
        };
        state.swarm.push(mitePlace(state, 0));
        startLayer(state, o);
        return saveable(state);
    }

    // Grains still waiting to pour, and everything there is left to eat.
    const waiting = state => state.backlog.reduce((n, e) => n + e.n + e.gold + e.bad, 0) * FEED.grains + state.drops.reduce((n, d) => n + d.n, 0);
    const left = state => state.grains + waiting(state);
    // The share of the box's cells that hold sand.
    const fill = state => state.grains / (state.w * state.h);

    // A run's packets arrive: { sector, packets, gold, garbled, popped }. `packets` are the good ones caught (`gold` of
    // them gold); `garbled` the packets of garbled catches; `popped` what popped bubbles and snapped loops held, of
    // which a share arrives garbled. They pour in over the next seconds.
    // ---- sessions ---------------------------------------------------------------------------------------------------
    const stockOf = (state, sector) => { const e = state.stock[sector]; return e ? e.n + e.gold + e.bad : 0; };
    const stockCap = (state, sector, opts) => { const o = opt(opts); return Math.max(o.stockMin, o.stockRuns * (state.best[sector] || 0)); };
    const cardMult = (state, stat) => { let m = 1; const c = state.session?.cards; if (c) for (const id of CARD_IDS) if (CARDS[id].stat === stat && c[id]) m *= Math.pow(CARDS[id].by, c[id]); return m; };
    const payMult = (state, o) => (state.session ? (1 + o.sectorPay * (state.session.sector - 1)) * cardMult(state, 'pay') : 1);
    // The dials as this session's cards have them.
    const withCards = (state, o) => { const c = state.session?.cards; if (!c || !Object.keys(c).length) return o; const out = { ...o }; for (const stat of ['chew', 'hungerTime', 'speed', 'roam']) out[stat] = o[stat] * cardMult(state, stat); out.wobble = o.wobble * cardMult(state, 'roam'); return out; };
    // Offer cards: `cardChoices` different ones, each slot a rare one at `cardRare` when there are any left to offer.
    function offerCards(state, o, out) {
        const s = state.session, pool = { common: CARD_IDS.filter(id => !CARDS[id].rare), rare: CARD_IDS.filter(id => CARDS[id].rare && offerable(state, id)) }, offer = [];
        for (let n = 0; n < o.cardChoices; n++) {
            const from = pool.rare.length && (rand(state) < o.cardRare || !pool.common.length) ? pool.rare : pool.common;
            if (!from.length) break;
            offer.push(from.splice(Math.floor(rand(state) * from.length), 1)[0]);
        }
        s.offer = offer.length ? offer : null;
        if (s.offer) out.events.push({ type: 'offer', cards: [...s.offer] }); else s.picks = 0;
    }
    // Take card `n` of the offer. The session carries on (or offers again, when splits came together).
    function pickCard(state, n, opts) {
        const o = opt(opts), s = state.session, id = s?.offer?.[n], out = { research: 0, events: [] };
        if (!id) return null;
        s.cards[id] = (s.cards[id] || 0) + 1; s.offer = null; s.picks = Math.max(0, (s.picks || 0) - 1);
        // A combo uses its two tools up (every copy of them); either can be picked again later, for itself or another recipe.
        let merged = null;
        if (CARDS[id].combo) { s.cards[id] = 1; merged = CARDS[id].combo.filter(t => s.cards[t] > 0); for (const t of merged) delete s.cards[t]; if (!merged.length) merged = null; }
        out.events.push(merged ? { type: 'card', card: id, level: s.cards[id], merged } : { type: 'card', card: id, level: s.cards[id] });
        if (s.picks > 0) offerCards(state, o, out);
        return out;
    }
    // ---- the tools ----------------------------------------------------------------------------------------------------
    const settled = (state, i) => i + state.w >= state.cells.length || !!state.cells[i + state.w];
    const every = (base, level, o) => base / (1 + o.toolFaster * (level - 1));
    // Eat every grain within `r` cells of a point, whatever it is (garbled sand is cleared too).
    function burst(state, o, x, y, r, out) {
        const { w, h, cells } = state; let n = 0;
        for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(h - 1, Math.floor(y + r)); cy++) for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(w - 1, Math.floor(x + r)); cx++) {
            const i = cy * w + cx; if (cells[i] && (cx + 0.5 - x) * (cx + 0.5 - x) + (cy + 0.5 - y) * (cy + 0.5 - y) <= r * r) { eat(state, o, i, out); n++; }
        }
        out.events.push({ type: 'pulse', x, y, r, eaten: n });
        return n;
    }
    // The session's tools for one step of `dt` seconds. `s.tt` holds each one's clock, `s.beam` the scanner's beam
    // (a column, or −1), `s.bots` where the sorter bots are.
    function tools(state, o, dt, out) {
        const s = state.session, { w, h, cells } = state, tt = s.tt || (s.tt = {});
        const due = (key, level, base) => { tt[key] = (tt[key] || 0) + dt; const t = every(base, level, o); if (tt[key] < t) return false; tt[key] -= t; return true; };
        const scan = toolLevel(state, 'scanner', o), pulse = toolLevel(state, 'pulse', o), arc = toolLevel(state, 'arc', o), sort = toolLevel(state, 'sorter', o), shake = toolLevel(state, 'rhythm', o);
        if (scan) {
            if (!(s.beam >= 0) && due('scan', scan, o.scanEvery)) s.beam = 0;
            if (s.beam >= 0) {
                const to = Math.min(w, s.beam + o.scanSpeed * dt);
                for (let x = Math.floor(s.beam); x < Math.ceil(to) && x < w; x++) for (let y = 0; y < h; y++) {
                    const i = y * w + x, v = cells[i];
                    if (!v || seenOf(v) || !settled(state, i)) continue;
                    cells[i] = v | 64;
                    const kind = KIND_IDS[kindOf(v)]; if (kind === 'vein' || kind === 'fragment') out.events.push({ type: 'found', x, y, kind });
                }
                s.beam = to >= w ? -1 : to;
            }
        }
        if (pulse && state.grains && due('pulse', pulse, o.pulseEvery)) {
            const at = state.aim || state.spot || state.swarm[Math.floor(rand(state) * state.swarm.length)];
            burst(state, o, at.x, at.y, o.pulseR + o.pulseGrow * (pulse - 1), out);
        }
        if (arc && state.swarm.length > 1 && state.grains && due('arc', arc, o.arcEvery)) {
            const reach = o.arcReach + o.arcGrow * (arc - 1);
            for (let n = 0; n + 1 < state.swarm.length; n++) {
                const a = state.swarm[n], b = state.swarm[n + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len > reach) continue;
                let eaten = 0;
                for (let k = 0, steps = Math.max(1, Math.ceil(len * 2)); k <= steps; k++) {
                    const x = Math.floor(a.x + (b.x - a.x) * k / steps), y = Math.floor(a.y + (b.y - a.y) * k / steps), i = y * w + x;
                    if (x >= 0 && x < w && y >= 0 && y < h && cells[i]) { eat(state, o, i, out); eaten++; }
                }
                out.events.push({ type: 'arc', x1: a.x, y1: a.y, x2: b.x, y2: b.y, eaten });
            }
        }
        if (sort && state.grains) {
            if (!Array.isArray(s.bots)) s.bots = [];
            while (s.bots.length < sort) s.bots.push({ x: w / 2, y: h - 1 });
            s.bots.length = sort;
            tt.sort = (tt.sort || 0) + o.sortRate * dt;
            const moves = Math.floor(tt.sort); tt.sort -= moves;
            for (const bot of s.bots) for (let m = 0; m < moves; m++) {
                // Gold a cell toward the right wall, garbled a cell toward the left, past sand of another kind.
                // (looked for from a random cell on, a quarter of the box at the most)
                for (let tries = 0, from = Math.floor(rand(state) * cells.length), span = cells.length >> 2; tries < span; tries++) {
                    const i = (from + tries) % cells.length, v = cells[i], k = kindOf(v);
                    const dir = k === KINDS.vein.id ? 1 : k === KINDS.garbled.id ? -1 : 0, x = i % w;
                    if (!dir || x + dir < 0 || x + dir >= w) continue;
                    if (!settled(state, i)) continue;
                    let at = i, hops = 0;
                    for (; hops < o.sortHop; hops++) { const cx = at % w, j = at + dir, u = cells[j]; if (cx + dir < 0 || cx + dir >= w || !u || kindOf(u) === k || !settled(state, j)) break; cells[at] = u; cells[j] = v; at = j; }
                    if (!hops) continue;
                    bot.x = at % w + 0.5; bot.y = Math.floor(at / w) + 0.5;
                    break;
                }
            }
        } else if (s.bots && s.bots.length) s.bots = [];
        if (shake && state.grains && due('shake', 1, o.shakeEvery)) {
            let sunk = 0;
            // From a random cell back up the box, so a grain sinks one cell a beat.
            for (let n = 0, want = o.shakeMoves * shake, from = Math.floor(rand(state) * (cells.length - w)), span = cells.length - w; n < span && sunk < want; n++) {
                const i = (from - n + span) % span, v = cells[i], u = cells[i + w];
                if (kindOf(v) !== KINDS.garbled.id || !u || kindOf(u) === KINDS.garbled.id || !settled(state, i + w)) continue;
                cells[i] = u; cells[i + w] = v; sunk++;
            }
            out.events.push({ type: 'shake', sunk });
        }
        // ---- the combos ----
        const c = s.cards, valuable = k => k === KINDS.vein.id || k === KINDS.fragment.id;
        // Sonar: a ring spreads from the point you hold (else a mite), showing the sand it crosses; at its full
        // reach it draws the gold and fragments inside back toward its middle.
        if (c.sonar) {
            if (!s.ring && state.grains && due('sonar', 1, o.sonarEvery)) { const at = state.aim || state.spot || state.swarm[Math.floor(rand(state) * state.swarm.length)]; s.ring = { x: at.x, y: at.y, r: 0 }; }
            if (s.ring) {
                const g = s.ring, r0 = g.r, r1 = Math.min(o.sonarR, g.r + o.sonarSpeed * dt), list = [];
                for (let y = Math.max(0, Math.floor(g.y - r1)); y <= Math.min(h - 1, Math.floor(g.y + r1)); y++) for (let x = Math.max(0, Math.floor(g.x - r1)); x <= Math.min(w - 1, Math.floor(g.x + r1)); x++) {
                    const i = y * w + x, v = cells[i]; if (!v) continue;
                    const d = Math.hypot(x + 0.5 - g.x, y + 0.5 - g.y); if (d > r1) continue;
                    if (d >= r0 && !seenOf(v) && settled(state, i)) { cells[i] = v | 64; if (valuable(kindOf(v))) out.events.push({ type: 'found', x, y, kind: KIND_IDS[kindOf(v)] }); }
                    if (r1 >= o.sonarR && valuable(kindOf(v)) && settled(state, i)) list.push([d, i]);
                }
                g.r = r1;
                if (r1 >= o.sonarR) {
                    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                    let pulled = 0; for (const [, i] of list) if (carry(state, i, g.x, g.y, o.sonarPull) !== i) pulled++;
                    out.events.push({ type: 'sonar', x: g.x, y: g.y, r: o.sonarR, pulled });
                    s.ring = null;
                }
            }
        } else if (s.ring) s.ring = null;
        // Storm: chain lightning. Each mite sends bolts out through the sand round it, grain to touching grain.
        if (c.storm && state.grains && due('storm', 1, o.stormEvery)) {
            for (const m of state.swarm) for (let f = 0; f < o.stormForks; f++) {
                let at = nearestWithin(state, m.x, m.y, 16); if (at < 0) continue;
                const pts = [[m.x, m.y]]; let eaten = 0;
                for (let n = 0; n < o.stormLen && at >= 0; n++) {
                    const x = at % w, y = (at - x) / w; pts.push([x + 0.5, y + 0.5]);
                    eat(state, o, at, out); eaten++;
                    // On to a touching grain, picked at random.
                    let next = -1, seen = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && nx < w && ny >= 0 && ny < h && cells[ny * w + nx] && rand(state) * ++seen < 1) next = ny * w + nx; }
                    at = next;
                }
                out.events.push({ type: 'bolt', pts: pts.filter((p, n) => n % 3 === 0 || n === pts.length - 1), eaten });
            }
        }
        // Defrag: garbled grains packed in a clump are rewritten into plain, paying sand.
        if (c.defrag && state.grains && due('defrag', 1, o.defragEvery)) {
            const bad = KINDS.garbled.id, fix = [];
            for (let n = 0, from = Math.floor(rand(state) * cells.length); n < cells.length && fix.length < o.defragMax; n++) {
                const i = (from + n) % cells.length; if (kindOf(cells[i]) !== bad) continue;
                const x = i % w, y = (i - x) / w; let near = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && nx < w && ny >= 0 && ny < h && kindOf(cells[ny * w + nx]) === bad) near++; }
                if (near >= o.defragPack) fix.push(i);
            }
            for (const i of fix) cells[i] = cell(KINDS.plain.id, bandOf(cells[i]), Math.max(1, Math.ceil(hpOf(cells[i]) / o.slow)), 1, airOf(cells[i]));
            if (fix.length) out.events.push({ type: 'defrag', fixed: fix.length, x: fix[0] % w + 0.5, y: Math.floor(fix[0] / w) + 0.5 });
        }
        // Tracer: a spark from each mite to the gold nearest it, which it takes.
        if (c.tracer && state.grains && due('tracer', 1, o.tracerEvery)) {
            for (const m of state.swarm) {
                const r = o.tracerReach, found = [];
                for (let y = Math.max(0, Math.floor(m.y - r)); y <= Math.min(h - 1, Math.floor(m.y + r)); y++) for (let x = Math.max(0, Math.floor(m.x - r)); x <= Math.min(w - 1, Math.floor(m.x + r)); x++) {
                    const i = y * w + x; if (kindOf(cells[i]) !== KINDS.vein.id) continue;
                    const d = Math.hypot(x + 0.5 - m.x, y + 0.5 - m.y); if (d <= r) found.push([d, i]);
                }
                if (!found.length) continue;
                found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                const first = found[0][1], take = found.slice(0, o.tracerEat);
                for (const [, i] of take) if (cells[i]) eat(state, o, i, out);
                out.events.push({ type: 'arc', x1: m.x, y1: m.y, x2: first % w + 0.5, y2: Math.floor(first / w) + 0.5, eaten: take.length, gold: true });
            }
        }
        // Resonance: on each beat a small burst at every mite, the swarm eating in time.
        if (c.resonance && state.grains && due('reso', 1, o.resoEvery)) {
            // (at the sand nearest each mite: a mite stands just off the pile, and the circle is small)
            let eaten = 0; for (const m of state.swarm) { const i = nearestWithin(state, m.x, m.y, 12); eaten += i < 0 ? 0 : burst(state, o, i % w + 0.5, Math.floor(i / w) + 0.5, o.resoR, out); }
            out.events.push({ type: 'shake', sunk: 0, eaten });
        }
        // Sifter: the beam sweeps on the beat, showing the sand, and every gold grain it crosses is shaken up to
        // `siftRise` cells through the sand above it.
        if (c.sifter) {
            if (!(s.sift >= 0) && state.grains && due('sift', 1, o.siftEvery)) { s.sift = 0; out.events.push({ type: 'shake', sunk: 0 }); }
            if (s.sift >= 0) {
                const to = Math.min(w, s.sift + o.scanSpeed * dt); let rose = 0;
                for (let x = Math.floor(s.sift); x < Math.ceil(to) && x < w; x++) for (let y = 0; y < h; y++) {
                    let i = y * w + x; const v = cells[i];
                    if (!v || !settled(state, i)) continue;
                    if (!seenOf(v)) cells[i] = v | 64;
                    if (kindOf(v) !== KINDS.vein.id) continue;
                    for (let n = 0; n < o.siftRise && i >= w; n++) { const u = cells[i - w]; if (!u || kindOf(u) === KINDS.vein.id || !settled(state, i - w)) break; cells[i] = u; cells[i - w] = v | 64; i -= w; rose++; }
                }
                s.sift = to >= w ? -1 : to;
                if (rose) out.sifted = (out.sifted || 0) + rose;
            }
        } else if (s.sift >= 0) s.sift = -1;
        // Demolition bots: a bot flies to a clump of garbled sand (else any garbled grain) and blows a circle of it away.
        if (c.demolition) {
            if (state.grains && due('demo', 1, o.demoEvery)) {
                const bad = KINDS.garbled.id; let best = -1, bestN = -1;
                for (let n = 0, from = Math.floor(rand(state) * cells.length), found = 0; n < cells.length && found < 40; n++) {
                    const i = (from + n) % cells.length; if (kindOf(cells[i]) !== bad) continue;
                    const x = i % w, y = (i - x) / w; let near = 0; found++;
                    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < w && ny >= 0 && ny < h && kindOf(cells[ny * w + nx]) === bad) near++; }
                    if (near > bestN) { bestN = near; best = i; }
                }
                if (best >= 0) { const x = best % w + 0.5, y = Math.floor(best / w) + 0.5; s.dbot = { x, y }; burst(state, o, x, y, o.demoR, out); }
            }
        } else if (s.dbot) s.dbot = null;
        // Relay bots: bots hover on the pile and a spark runs mite, bot, mite, bot… eating along every leg.
        if (c.relay) {
            if (state.grains && due('relay', 1, o.relayEvery)) {
                s.rbots = [];
                for (let b = 0; b < o.relayBots; b++) for (let n = 0, from = Math.floor(rand(state) * cells.length); n < cells.length; n++) { const i = (from + n) % cells.length; if (cells[i] && settled(state, i)) { s.rbots.push({ x: i % w + 0.5, y: Math.floor(i / w) + 0.5 }); break; } }
                const chain = [];
                for (let n = 0; n < Math.max(state.swarm.length, s.rbots.length); n++) { if (state.swarm[n]) chain.push(state.swarm[n]); if (s.rbots[n]) chain.push(s.rbots[n]); }
                for (let n = 0; n + 1 < chain.length; n++) { const a = chain[n], b = chain[n + 1]; out.events.push({ type: 'arc', x1: a.x, y1: a.y, x2: b.x, y2: b.y, eaten: lineEat(state, o, a, b, o.relayMax, out), from: 'relay' }); }
            }
        } else if (s.rbots && s.rbots.length) s.rbots = [];
        // Drum line (the owner's design): each beat a row of sparks drops on the pile. Each wears the top grain of its
        // column and the one on the floor under it by `drumHit` bites: soft sand is collected, hard sand is left easier.
        if (c.drum && state.grains && due('drum', 1, o.drumEvery)) {
            const cols = []; for (let x = 0; x < w; x++) if (cells[(h - 1) * w + x]) cols.push(x);
            const hits = []; let eaten = 0;
            const strike = i => { const v = cells[i]; if (!v) return; const hp = hpOf(v) - o.drumHit; if (hp > 0) cells[i] = cell(kindOf(v), bandOf(v), hp, seenOf(v), airOf(v)); else { eat(state, o, i, out); eaten++; } };
            for (let n = 0; n < o.drumSparks && cols.length; n++) {
                const x = cols.splice(Math.floor(rand(state) * cols.length), 1)[0];
                let top = 0; while (top < h - 1 && (!cells[top * w + x] || !settled(state, top * w + x))) top++;
                strike(top * w + x); if (top < h - 1) strike((h - 1) * w + x);
                hits.push([x + 0.5, top + 0.5]);
            }
            out.events.push({ type: 'drum', hits, eaten }, { type: 'shake', sunk: 0 });
        }
        // Magnet: gold is drawn through the pile toward the point you hold (else the first mite).
        if (c.magnet && state.grains) {
            const to = state.aim || state.spot || state.swarm[0];
            tt.magnet = (tt.magnet || 0) + o.magnetRate * dt;
            const moves = Math.floor(tt.magnet); tt.magnet -= moves;
            for (let m = 0; m < moves; m++) for (let tries = 0, from = Math.floor(rand(state) * cells.length), span = cells.length >> 2; tries < span; tries++) {
                const i = (from + tries) % cells.length;
                if (kindOf(cells[i]) !== KINDS.vein.id || !settled(state, i)) continue;
                if (carry(state, i, to.x, to.y, o.magnetHop) !== i) break;
            }
        }
    }
    // Eat the sand along the line from `a` to `b`, `max` grains at the most. Returns how many.
    function lineEat(state, o, a, b, max, out) {
        const { w, h, cells } = state, len = Math.hypot(b.x - a.x, b.y - a.y); let eaten = 0;
        for (let k = 0, steps = Math.max(1, Math.ceil(len * 2)); k <= steps && eaten < max; k++) {
            const x = Math.floor(a.x + (b.x - a.x) * k / steps), y = Math.floor(a.y + (b.y - a.y) * k / steps), i = y * w + x;
            if (x >= 0 && x < w && y >= 0 && y < h && cells[i]) { eat(state, o, i, out); eaten++; }
        }
        return eaten;
    }
    // Carry the grain at `i` up to `hops` cells toward a point, through settled sand of other kinds (it changes
    // places with each grain on the way; never into empty space). Returns where it ends up.
    function carry(state, i, tx, ty, hops) {
        const { w, h, cells } = state, v = cells[i], k = kindOf(v);
        let at = i;
        for (let n = 0; n < hops; n++) {
            const x = at % w, y = (at - x) / w, dx = tx - (x + 0.5), dy = ty - (y + 0.5);
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
            const sx = Math.abs(dx) >= 1 ? Math.sign(dx) : 0, sy = Math.abs(dy) >= 1 ? Math.sign(dy) : 0;
            // The longer way first, then the other.
            const ways = Math.abs(dx) >= Math.abs(dy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
            let moved = false;
            for (const [mx, my] of ways) {
                if (!mx && !my) continue;
                const nx = x + mx, ny = y + my; if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const j = ny * w + nx, u = cells[j];
                if (!u || kindOf(u) === k || !settled(state, j)) continue;
                cells[at] = u; cells[j] = v; at = j; moved = true; break;
            }
            if (!moved) break;
        }
        return at;
    }
    // An empty box and a swarm of one: how every session starts, and what is left when one ends.
    function clearBox(state, o) {
        state.cells.fill(0); state.grains = 0; state.drops = []; state.backlog = []; state.rest = true; state.dry = false;
        state.mites = 1; state.swarm = [mitePlace(state, 0)]; state.layers = 0; state.aim = null; state.spot = null; state.last = 0; state.sweepAt = 0; state.pourAcc = 0;
        startLayer(state, o);
    }
    // Turn sessions on. A pile from before they existed goes into the stockpiles (its box as plain sector-1 packets).
    function sessions(state, opts) {
        if (state.sessioned) return state;
        const o = opt(opts);
        state.sessioned = true;
        const add = (sector, n, gold, bad) => { const e = state.stock[sector] || (state.stock[sector] = { n: 0, gold: 0, bad: 0 }); e.n += n; e.gold += gold; e.bad += bad; };
        for (const e of state.backlog) add(e.sector, e.n, e.gold, e.bad);
        const boxed = Math.floor((state.grains + state.drops.reduce((n, d) => n + d.n, 0)) / o.grains);
        if (boxed > 0) add(1, boxed, 0, 0);
        for (const k of Object.keys(state.stock)) state.best[k] = Math.max(state.best[k] || 0, Math.ceil(stockOf(state, k) / o.stockRuns));
        clearBox(state, o);
        state.session = null; state.life = 1;
        return state;
    }
    // Every stockpile with sand in it, and every sector you have a best run on: for the screen's list.
    function stockList(state, opts) {
        const keys = [...new Set([...Object.keys(state.stock), ...Object.keys(state.best)])].map(Number).filter(k => k >= 1).sort((a, b) => a - b);
        return keys.map(sector => { const e = state.stock[sector] || { n: 0, gold: 0, bad: 0 }, total = e.n + e.gold + e.bad, cap = stockCap(state, sector, opts);
            return { sector, n: e.n, gold: e.gold, bad: e.bad, total, cap, full: total >= cap, best: state.best[sector] || 0, record: state.record[sector] || 0 }; });
    }
    // A run's packets go to their sector's stockpile, as far as it has room. `lost`: what didn't fit.
    function stockpile(state, sector, packets, gold, bad, o, out) {
        state.best[sector] = Math.max(state.best[sector] || 0, packets);
        const total = packets + bad, cap = stockCap(state, sector, o), have = stockOf(state, sector);
        const take = Math.max(0, Math.min(cap - have, total)), share = total ? take / total : 0;
        const addBad = Math.min(bad, Math.round(bad * share)), addGood = take - addBad, addGold = Math.min(addGood, Math.round(gold * share));
        if (take > 0) { const e = state.stock[sector] || (state.stock[sector] = { n: 0, gold: 0, bad: 0 }); e.n += addGood - addGold; e.gold += addGold; e.bad += addBad; }
        state.stats.delivered += take; state.stats.lost += total - take;
        Object.assign(out, { added: take * o.grains, stocked: take, lost: total - take, sector, held: have + take, cap, full: have + take >= cap });
        return out;
    }
    // Start a session on a sector's stockpile. False when sessions are off, one is in play, or there is nothing there.
    function startSession(state, sector, opts) {
        const o = opt(opts), k = Math.floor(sector) || 0, e = state.stock[k];
        if (!state.sessioned || state.session || !e || e.n + e.gold + e.bad <= 0) return false;
        clearBox(state, o);
        state.band = (state.band + 1) % o.bands;
        state.backlog.push({ sector: k, n: e.n, gold: e.gold, bad: e.bad, band: state.band });
        delete state.stock[k];
        state.session = { sector: k, research: 0, time: 0, packets: e.n + e.gold + e.bad, cards: {}, offer: null, picks: 0, tt: {}, beam: -1, ring: null, bots: [], sift: -1, dbot: null, rbots: [] };
        state.life = 1; state.lastSession = null; state.stats.sessions++;
        state.swarm[0].c = CHARACTERS[Math.floor(rand(state) * CHARACTERS.length)];   // the first mite is anyone (the owner's call: it was always the gold-hungry)
        return true;
    }
    // The session is over (`why`: 'hunger', 'empty', or 'left' when you end it yourself). Sand not yet poured goes back
    // to its stockpile; sand in the box is gone.
    function endSession(state, why, opts, out) {
        const o = opt(opts), s = state.session;
        if (!s) return null;
        for (const e of state.backlog) { const t = state.stock[e.sector] || (state.stock[e.sector] = { n: 0, gold: 0, bad: 0 }); t.n += e.n; t.gold += e.gold; t.bad += e.bad; }
        const result = { type: 'over', why, sector: s.sector, layers: state.layers, mites: state.mites, research: s.research, time: Math.round(s.time), cards: Object.values(s.cards || {}).reduce((n, v) => n + v, 0), record: state.layers > (state.record[s.sector] || 0) };
        if (result.record) state.record[s.sector] = state.layers;
        clearBox(state, o);
        state.session = null; state.life = 1; state.lastSession = { ...result };
        if (out) out.events.push(result);
        return result;
    }

    function deliver(state, load, opts) {
        const o = opt(opts), out = { research: 0, events: [], added: 0 };
        const whole = v => Math.max(0, Math.floor(v) || 0);
        const packets = whole(load?.packets), gold = Math.min(packets, whole(load?.gold));
        const bad = whole(load?.garbled) + Math.round(whole(load?.popped) * o.popped);
        if (!packets && !bad) return out;
        if (state.sessioned) return stockpile(state, Math.max(1, whole(load.sector) || 1), packets, gold, bad, o, out);
        state.band = (state.band + 1) % o.bands;
        state.backlog.push({ sector: Math.max(1, whole(load.sector) || 1), n: packets - gold, gold, bad, band: state.band });
        state.stats.delivered += packets + bad;
        state.dry = false;
        out.added = (packets + bad) * o.grains;
        return out;
    }

    // Lead the swarm: a point in the box, in cells ({ x, y }), while you hold it; null when you let go.
    // A tapped point: it stays (`spot`) until another is set or it is cleared with null.
    function mark(state, p) {
        const ok = p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y);
        state.spot = ok ? { x: Math.max(0, Math.min(state.w - 0.01, p.x)), y: Math.max(0, Math.min(state.h - 0.01, p.y)) } : null;
        return state.spot;
    }
    function point(state, aim) {
        const ok = aim && typeof aim.x === 'number' && typeof aim.y === 'number' && Number.isFinite(aim.x) && Number.isFinite(aim.y);
        state.aim = ok ? { x: Math.max(0, Math.min(state.w - 0.01, aim.x)), y: Math.max(0, Math.min(state.h - 0.01, aim.y)) } : null;
        return state.aim;
    }

    // Where the spout is: it swings from side to side while it pours.
    function spoutX(state, opts) {
        const o = opt(opts), t = state.sweepAt / o.sweepTime, tri = 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
        // A small pile is laid narrow and a big one wide: the swing grows with the sand there is (in the box and to come).
        const swing = Math.min(o.sweep, o.sweepMin + Math.sqrt(state.grains + waiting(state)) * o.sweepGrow);
        return Math.max(2, Math.min(state.w - 3, Math.round(state.w / 2 + swing * tri)));
    }
    // The next packet through the spout: which sort (plain data, gold, bad) and what it is.
    function nextPacket(state, o) {
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
        const packet = { k: KINDS[kind].id, band: e.band, hp: bitesFor(e.sector, o) * (slowSand(state, kind) ? o.slow : 1), q: e.sector };
        if (e.n + e.gold + e.bad <= 0) { state.backlog.shift(); state.last = 0; }
        return packet;
    }

    function pour(state, o, dt) {
        if (!state.backlog.length) { state.pourAcc = 0; return; }
        state.sweepAt += dt;
        state.pourAcc += o.pour * dt;
        while (state.pourAcc >= 1 && state.backlog.length) {
            // The box is nearly full: wait.
            if (state.grains + state.drops.length * o.grains > o.full * state.w * state.h) { state.pourAcc = Math.min(state.pourAcc, 1); break; }
            const x = Math.max(0, Math.min(state.w - 1, spoutX(state, o) + Math.round((rand(state) * 2 - 1) * o.spout)));
            // It melts a share of the way down to the sand under it (or to the floor).
            let top = 0;
            while (top < state.h && !state.cells[top * state.w + x]) top++;
            state.drops.push({ x, y: 0, m: Math.round(top * o.melt), n: o.grains, ...nextPacket(state, o) });
            state.rest = false; state.pourAcc -= 1;
        }
    }
    // Packets fall; at their melting line (or on meeting sand) they turn to grains, scattered a little round them.
    function dropStep(state, o, dt) {
        const { w, h, cells } = state;
        for (let n = state.drops.length - 1; n >= 0; n--) {
            const d = state.drops[n];
            d.y += o.drop * dt;
            const row = Math.min(h - 1, Math.floor(d.y));
            if (d.y < d.m && row < h - 1 && !cells[(row + 1) * w + d.x]) continue;
            for (let g = d.n - 1; g >= 0; g--) {
                const j = hash(d.x * 131 + g, state.tick + row);
                const x = Math.max(0, Math.min(w - 1, d.x + (j % (o.puff * 2 + 1)) - o.puff));
                let y = Math.max(0, Math.min(h - 1, row - ((j >>> 8) % (o.puff * 2 + 1))));
                while (y > 0 && cells[y * w + x]) y--;
                if (cells[y * w + x]) continue;   // no room in that column yet: this grain waits
                // A fragment's packet is one fragment grain and plain sand round it.
                const kind = d.k === 3 && g > 0 ? 1 : d.k;
                cells[y * w + x] = cell(kind, d.band, kind === 1 && d.k === 3 ? bitesFor(d.q, o) : d.hp, !HIDDEN.includes(kind), 1);
                state.grains++; d.n--; raise(state, y);
            }
            state.rest = false;
            if (d.n <= 0) state.drops.splice(n, 1);
            else d.y = Math.min(d.y, h - 1);
        }
    }

    // One pass of falling: every grain with room under it drops a cell, else slides down and across.
    function fallPass(state, o) {
        const { w, h, cells } = state;
        let moved = false;
        state.tick++;
        for (let x = 0, i = (h - 1) * w; x < w; x++, i++) if (cells[i] & AIR) moved = land(state, o, i, x, h - 1) || moved;
        const from = TOP.get(state) ?? 0; let seen = h - 1;
        TOP.set(state, h - 1);
        for (let y = h - 2; y >= from; y--) {
            const row = y * w, flip = (state.tick + y) & 1;
            for (let n = 0; n < w; n++) {
                const x = flip ? w - 1 - n : n, i = row + x, v = cells[i];
                if (!v) continue;
                seen = y;
                const below = i + w;
                if (!cells[below]) {
                    // Falling: a cell, then faster the longer it has fallen, as far as there is room.
                    const vel = velOf(v), reach = Math.min(o.gravity, 1 + (vel >> 1));
                    let to = below;
                    for (let k = 1; k < reach && to + w < cells.length && !cells[to + w]; k++) to += w;
                    cells[to] = still(v) | (Math.min(7, vel + 1) << 16); cells[i] = 0; moved = true;
                    continue;
                }
                let to = -1;
                const first = (x + state.tick) & 1 ? -1 : 1;
                for (const d of [first, -first]) {
                    const nx = x + d;
                    if (nx >= 0 && nx < w && !cells[below + d] && !cells[i + d]) { to = below + d; break; }
                }
                // Slumping: at rest on a ledge with a drop two cells across, it rolls a cell that way (now and then, so a
                // heap slides rather than snaps). One waiting its turn still counts as movement: the pile is not at rest.
                if (to < 0 && o.slump > 0 && !(v & AIR)) {
                    for (const d of [first, -first]) {
                        const nx = x + 2 * d;
                        if (nx < 0 || nx >= w || cells[i + d] || !cells[below + d] || cells[i + 2 * d] || cells[below + 2 * d]) continue;
                        if (hash(i, state.tick) % o.slump === 0) to = i + d; else moved = true;
                        break;
                    }
                }
                if (to >= 0) { cells[to] = still(v); cells[i] = 0; moved = true; }
                else if (v & AIR) moved = land(state, o, i, x, y) || moved;
                else if (v > 0xFFFF) cells[i] = still(v);
            }
        }
        raise(state, seen);
        return moved;
    }
    // A grain lands for the first time since it melted. One in `hop` jumps: up and across a few cells (now and then a
    // lot), to fall again. It hops once: it is no longer in the air after.
    function land(state, o, i, x, y) {
        const { w, cells } = state, v = still(cells[i]) & ~AIR, j = hash(i, state.tick);
        cells[i] = v;
        if (!(o.hop > 0) || j % o.hop) return false;
        const high = (j >>> 4) % 8 === 0, up = high ? 14 + (j >>> 8) % 12 : 4 + (j >>> 8) % 6, across = ((j >>> 12) & 1 ? 1 : -1) * (2 + (j >>> 14) % (high ? 10 : 6));
        const nx = x + across, ny = y - up;
        if (nx < 0 || nx >= w || ny < 0 || cells[ny * w + nx]) return false;
        cells[ny * w + nx] = v; cells[i] = 0; raise(state, ny);
        state.stats.hops++;
        return true;
    }

    // The grain on the pile's surface nearest a point: one with an empty cell beside it (or at the box's top).
    function nearestSurface(state, px, py) {
        const { w, h, cells } = state;
        const surface = (i, x, y) => !(y < h - 1 && !cells[i + w]) && (y === 0 || !cells[i - w] || (x > 0 && !cells[i - 1]) || (x < w - 1 && !cells[i + 1]));
        // Near first: any surface grain within `r` cells is nearer than everything outside the square round it.
        for (const r of [12, 40]) {
            let best = -1, bestD = r * r;
            for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(h - 1, Math.floor(py + r)); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(w - 1, Math.floor(px + r)); x++) {
                const i = y * w + x; if (!cells[i]) continue;
                const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
                if (d < bestD && surface(i, x, y)) { bestD = d; best = i; }
            }
            if (best >= 0) return best;
        }
        let best = -1, bestD = Infinity;
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i]) continue;
            const x = i % w, y = (i - x) / w;
            if (!surface(i, x, y)) continue;
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
            state.owed += KINDS[kind].pay / o.grains * payMult(state, o);
            state.fed++;
            // Eating feeds the hunger bar: the whole bar for `hungerFill` of this layer's worth.
            if (state.session) state.life = Math.min(1, state.life + (1 + o.toughFeed * (bitesFor(state.session.sector, o) - 1)) / (o.hungerFill * layerSize(state.layers, o) * o.grains));
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
            const over = state.fed - need, pay = Math.max(1, Math.round(o.layerPay * layerSize(state.layers, o) * payMult(state, o)));
            state.layers++;
            if (state.session) { state.life = 1; state.session.picks = (state.session.picks || 0) + 1; }   // a split fills the hunger bar and offers cards (`step`)
            const mite = state.layers >= o.miteFirst && (state.layers - o.miteFirst) % o.miteEvery === 0;
            if (mite) { const m = mitePlace(state, state.mites); m.c = rand(state) < o.megaChance ? 'mega' : CHARACTERS[Math.floor(rand(state) * CHARACTERS.length)]; state.swarm.push(m); state.mites++; }
            state.owed += pay;
            out.events.push({ type: 'layer', layer: state.layers, pay, mite, mites: state.mites });
            startLayer(state, o);
            state.fed = over;
        }
    }

    // One mite for one step: head for the point you hold (or the nearest sand on the surface), biting what is in the way.
    // The grain nearest a point within `r` cells that `want(cell)` accepts, or −1.
    function nearestWhere(state, px, py, r, want) {
        const { w, h, cells } = state;
        let best = -1, bestD = r * r;
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(h - 1, Math.floor(py + r)); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(w - 1, Math.floor(px + r)); x++) {
            const v = cells[y * w + x]; if (!v || !want(v)) continue;
            const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
            if (d <= bestD) { bestD = d; best = y * w + x; }
        }
        return best;
    }
    const GOLD = v => kindOf(v) === 2 && seenOf(v) === 1, BAD = v => kindOf(v) === 6, GOOD = v => kindOf(v) !== 6;
    // What a mite would rather eat near a point: gold it can see for the gold-hungry, garbled sand for the tidy, and
    // anything but garbled for the rest; failing that, whatever is nearest.
    function liked(state, o, m, x, y, r) {
        if (o.character) { const i = nearestWhere(state, x, y, r, m.c === 'gold' ? GOLD : m.c === 'tidy' ? BAD : GOOD); if (i >= 0) return i; }
        return nearestWithin(state, x, y, r);
    }
    // Where a led mite is heading: its own spot within `roam` cells of the point you hold, picked afresh every second or
    // two. A loner's is pushed away from the rest of the swarm; a follower's is beside the mite before it.
    function goalFor(state, o, m, dt) {
        const aim = state.aim || state.spot, loose = state.aim ? 1 : o.tapRoam, { w, h, swarm } = state;
        if (!(o.roam > 0)) return aim;
        m.rt = (m.rt || 0) - dt;
        if (m.rt <= 0) { const ang = rand(state) * Math.PI * 2, r = Math.sqrt(rand(state)) * o.roam * loose; m.ox = Math.cos(ang) * r; m.oy = Math.sin(ang) * r * 0.5; m.rt = 1 + rand(state) * 1.5; }
        let x = aim.x + m.ox, y = aim.y + m.oy;
        if (o.character && swarm.length > 1) {
            if (m.c === 'loner') {
                let cx = 0, cy = 0; for (const q of swarm) if (q !== m) { cx += q.x; cy += q.y; }
                cx /= swarm.length - 1; cy /= swarm.length - 1;
                const d = Math.hypot(m.x - cx, m.y - cy) || 1;
                x += (m.x - cx) / d * o.roam * 0.8; y += (m.y - cy) / d * o.roam * 0.3;
            } else if (m.c === 'follower') {
                const n = swarm.indexOf(m), lead = swarm[(n + swarm.length - 1) % swarm.length];
                x = lead.x + m.ox * 0.25; y = lead.y + m.oy * 0.25;
            }
        }
        return { x: Math.max(0.5, Math.min(w - 0.5, x)), y: Math.max(0.5, Math.min(h - 0.5, y)) };
    }
    // A mite takes the grain at `i`; a mega mite takes one beside it too.
    function take(state, o, m, i, out) {
        const x = i % state.w + 0.5, y = Math.floor(i / state.w) + 0.5;
        eat(state, o, i, out);
        if (m.c === 'mega') { const j = nearestWithin(state, x, y, 1.6); if (j >= 0) eat(state, o, j, out); }
    }
    function mite(state, o, m, dt, out) {
        const pt = state.aim || state.spot, led = !!pt, { w, h, cells } = state;
        m.b = Math.min(m.b + o.chew * o.grains * (state.aim ? 1 : state.spot ? o.tapRate : o.graze) * dt, o.grains / 8);   // bites saved up while it moves: an eighth of a packet's worth, whatever the grain's size
        let gx, gy, food = -1;
        if (led) {
            const g = goalFor(state, o, m, dt);
            gx = g.x; gy = g.y;
            if ((m.x - gx) * (m.x - gx) + (m.y - gy) * (m.y - gy) <= o.near * o.near) {
                food = liked(state, o, m, gx, gy, o.near);
                // Nothing to eat at its own spot: back to the point itself.
                if (food < 0 && g !== pt) { gx = pt.x; gy = pt.y; if ((m.x - gx) * (m.x - gx) + (m.y - gy) * (m.y - gy) <= o.near * o.near) food = liked(state, o, m, gx, gy, o.near); }
            } else if (o.character && o.roam > 0 && (m.c === 'gold' || m.c === 'tidy')) {
                // On its way: it stops for what it likes best, when that is right beside it.
                food = nearestWhere(state, m.x, m.y, o.lamp / 2, m.c === 'gold' ? GOLD : BAD);
            }
        } else {
            if (m.t < 0 || !cells[m.t]) m.t = state.grains ? nearestSurface(state, m.x, m.y) : -1;
            food = m.t;
            if (food < 0) { gx = w / 2 + ((state.swarm.indexOf(m) * 7) % 11 - 5) * 4; gy = 3; }
        }
        if (food >= 0) { gx = food % w + 0.5; gy = Math.floor(food / w) + 0.5; }
        const here = Math.floor(m.y) * w + Math.floor(m.x);
        if (food === here && cells[here]) {
            while (m.b >= 1 && cells[here]) { m.b -= 1; const v = cells[here], hp = hpOf(v) - 1; if (hp > 0) cells[here] = cell(kindOf(v), bandOf(v), hp, seenOf(v)); else take(state, o, m, here, out); }
            return;
        }
        let dx = gx - m.x, dy = gy - m.y;
        const d = Math.hypot(dx, dy);
        // Meandering: led and still a way off, it swings from side to side of the straight line, each mite on its own beat.
        if (led && o.wobble > 0 && d > o.near) { m.a = ((m.a || 0) + dt * (2.2 + (state.swarm.indexOf(m) % 5) * 0.5)) % (Math.PI * 2); const t = Math.sin(m.a) * o.wobble, cs = Math.cos(t), sn = Math.sin(t), rx = dx * cs - dy * sn; dy = dx * sn + dy * cs; dx = rx; }
        if (d < 0.05) { if (food < 0) m.b = Math.min(m.b, o.grains / 16); return; }
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
                else take(state, o, m, ci, out);
            }
            return;
        }
        m.x = nx; m.y = ny;
        if (food < 0) m.b = Math.min(m.b, o.grains / 16);   // nothing to bite on the way: no bites saved up
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
        const base = opt(opts), out = { research: 0, events: [] };
        if (!(dt > 0) || !Number.isFinite(dt)) return out;
        if (state.sessioned && !state.session) return out;   // nothing eats outside a session
        if (state.session?.offer) return out;                // the session waits while you choose a card
        const o = withCards(state, base);
        const steps = Math.min(6000, Math.max(1, Math.round(dt / STEP))), each = dt / steps;
        let ended = null, done = 0;
        for (let n = 0; n < steps; n++) {
            done++;
                    state.fallAcc += o.fall * each;
            const passes = Math.floor(state.fallAcc);
            state.fallAcc -= passes;
            pour(state, o, each);
            if (state.drops.length) dropStep(state, o, each);
            let moved = false;
            for (let k = 0; k < passes; k++) if (!state.rest) moved = fallPass(state, o) || moved;
            if (passes && !moved && !state.backlog.length && !state.drops.length) state.rest = true;
            if (state.grains) {
                // Fine sand: a mite may finish several grains in a step, so its step is cut into as many moves.
                // (Eight moves a bite it may take: in fine sand a mite spends most moves reaching the next grain, and several
                // mites go for the same one; measured against the coarser sand's eating rates. Never more than 96 a step.)
                const moves = Math.min(96, Math.max(1, Math.ceil(o.chew * o.grains * (state.aim ? 1 : state.spot ? o.tapRate : o.graze) * each)) * 8);
                for (const m of state.swarm) { for (let k = 0; k < moves; k++) mite(state, o, m, each / moves, out); lamp(state, o, m, out); }
            }
            else if (!state.backlog.length && !state.drops.length) {
                for (const m of state.swarm) { m.b = 0; m.t = -1; }
                if (state.session) { ended = 'empty'; break; }
                if (!state.dry && state.stats.delivered > 0) { state.dry = true; out.events.push({ type: 'empty' }); }
            }
            if (state.session) {
                tools(state, o, each, out);
                if (state.session.picks > 0) { offerCards(state, base, out); if (state.session.offer) break; }
                state.life -= each / o.hungerTime;
                if (state.life <= 0) { state.life = 0; ended = 'hunger'; break; }
            }
        }
        const whole = Math.floor(state.owed + 1e-9);
        if (whole > 0) { state.owed -= whole; state.stats.research += whole; out.research = whole; }
        if (state.session) { state.session.research += out.research; state.session.time += each * done; }
        if (ended) endSession(state, ended, opts, out);
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
        return { fed: state.fed, need, share: Math.min(1, state.fed / need), splits: state.layers, life: state.session ? Math.max(0, Math.min(1, state.life)) : 1 };
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
                if (!Number.isInteger(v) || v <= 0 || v > 0x7FFFF || !KIND_IDS[kindOf(v)] || hpOf(v) < 1) return 0;
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
            state.sweepAt = real(raw.sweepAt, 0, 1e9, 0);
            state.drops = (Array.isArray(raw.drops) ? raw.drops.slice(0, 400) : []).map(d => {
                if (!d || !Number.isInteger(d.x) || d.x < 0 || d.x >= FEED.w || !KIND_IDS[d.k]) return null;
                const n = whole(d.n, o.grains), hp = whole(d.hp, 255);
                return n && hp ? { x: d.x, y: real(d.y, 0, FEED.h, 0), m: whole(d.m, FEED.h), n, k: d.k, band: whole(d.band, 7), hp, q: Math.max(1, whole(d.q, 99)) } : null;
            }).filter(Boolean);
            state.pourAcc = real(raw.pourAcc, 0, 1e4, 0);
            state.fallAcc = real(raw.fallAcc, 0, 1e4, 0);
            state.dry = raw.dry === true;
            // At rest only if the save says so and no grain hangs over an empty cell.
            state.rest = raw.rest === true && !state.cells.some((v, i) => v && i + FEED.w < state.cells.length && !state.cells[i + FEED.w]);
            const aim = raw.aim;
            state.aim = null;
            if (aim) point(state, aim);
            if (raw.spot) mark(state, raw.spot);
        }
        // Sessions: the stockpiles, best runs and records by sector; the session in play only with its box.
        if (raw.sessioned === true) {
            state.sessioned = true;
            const bySector = (src, read) => { const dst = {}; if (src && typeof src === 'object') for (const key of Object.keys(src).slice(0, 200)) { const k = whole(Number(key), 99); const v = k ? read(src[key]) : null; if (v) dst[k] = v; } return dst; };
            state.stock = bySector(raw.stock, e => { const v = { n: whole(e?.n, 1e8), gold: whole(e?.gold, 1e8), bad: whole(e?.bad, 1e8) }; return v.n + v.gold + v.bad > 0 ? v : null; });
            state.best = bySector(raw.best, v => whole(v, 1e8) || null);
            state.record = bySector(raw.record, v => whole(v, 200) || null);
            const sess = raw.session, sector = whole(sess?.sector, 99);
            if (sized && sess && sector) {
                const cards = {}; for (const id of CARD_IDS) { const n = whole(sess.cards?.[id], 200); if (n) cards[id] = n; }
                const offer = Array.isArray(sess.offer) ? [...new Set(sess.offer.filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARDS, id)))].slice(0, o.cardChoices) : [];
                state.session = { sector, research: whole(sess.research, 1e12), time: real(sess.time, 0, 1e7, 0), packets: whole(sess.packets, 1e8), cards, offer: offer.length ? offer : null, picks: offer.length ? Math.max(1, whole(sess.picks, 200)) : whole(sess.picks, 200) };
                // The tools' clocks, the scanner's beam and the sorter bots.
                const tt = {}; for (const key of ['scan', 'pulse', 'arc', 'sort', 'shake', 'sonar', 'storm', 'defrag', 'tracer', 'magnet', 'reso', 'sift', 'demo', 'relay', 'drum']) { if (typeof sess.tt?.[key] === 'number') tt[key] = real(sess.tt[key], 0, 1e4, 0); }
                state.session.tt = tt; state.session.beam = real(sess.beam, 0, FEED.w, -1);
                const ring = sess.ring; state.session.ring = ring && typeof ring === 'object' ? { x: real(ring.x, 0, FEED.w, FEED.w / 2), y: real(ring.y, 0, FEED.h, FEED.h - 1), r: real(ring.r, 0, 1e3, 0) } : null;
                const spot = b => ({ x: real(b?.x, 0, FEED.w, FEED.w / 2), y: real(b?.y, 0, FEED.h, FEED.h - 1) });
                state.session.sift = real(sess.sift, 0, FEED.w, -1);
                state.session.dbot = sess.dbot && typeof sess.dbot === 'object' ? spot(sess.dbot) : null;
                state.session.rbots = (Array.isArray(sess.rbots) ? sess.rbots.slice(0, 20) : []).map(spot);
                state.session.bots = (Array.isArray(sess.bots) ? sess.bots.slice(0, 50) : []).map(b => ({ x: real(b?.x, 0, FEED.w, FEED.w / 2), y: real(b?.y, 0, FEED.h, FEED.h - 1) }));
                state.life = real(raw.life, 0, 1, 1);
            } else { clearBox(state, o); state.life = 1; }
            const last = raw.lastSession;
            if (last && whole(last.sector, 99)) state.lastSession = { type: 'over', why: ['hunger', 'empty', 'left'].includes(last.why) ? last.why : 'hunger', sector: whole(last.sector, 99), layers: whole(last.layers, 200), mites: Math.max(1, whole(last.mites, 999)), research: whole(last.research, 1e12), time: whole(last.time, 1e7), cards: whole(last.cards, 1e4), record: last.record === true };
        }
        state.swarm = Array.from({ length: state.mites }, (_, n) => {
            const m = sized && Array.isArray(raw.swarm) ? raw.swarm[n] : null, d = mitePlace(state, n);
            return { x: real(m?.x, 0, FEED.w - 0.01, d.x), y: real(m?.y, 0, FEED.h - 0.01, d.y), b: real(m?.b, 0, 64, 0), t: Number.isInteger(m?.t) && m.t >= -1 && m.t < FEED.w * FEED.h ? m.t : -1,
                c: m?.c === 'mega' || CHARACTERS.includes(m?.c) ? m.c : d.c, a: real(m?.a, 0, 7, d.a % (Math.PI * 2)), ox: real(m?.ox, -1e3, 1e3, 0), oy: real(m?.oy, -1e3, 1e3, 0), rt: real(m?.rt, -1, 10, 0) };
        });
        return state;
    }

    return { FEED, KINDS, KIND_IDS, LOCKED, FRAGMENTS, STEP, newFeed, clean, deliver, point, mark, step, setReadable, readableFor,
        sessions, startSession, endSession, stockList, stockOf, stockCap, CARDS, COMBOS, CHARACTERS, pickCard, cardMult, toolLevel,
        pack, unpack, spoutX, left, waiting, fill, census, hunger, layerSize, bitesFor, kindOf, bandOf, seenOf, airOf, hpOf };
});
