// The Feed (feed.js): the box of sand, pouring and falling, the swarm left alone and led, slow sand, layers and mites.
// Build 1 of design/ring-build.md; the owner's sand design of 2026-11-13.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const Model = require('../tools/ring-model.js');
// These tests were written at the sand's first dials and test its mechanics at them. The dials the game plays at now
// (twice the eating and moving, smaller splits, two mites to start: the owner's calls, 2026-11-14) are tested in
// tests/feed-pace.test.js.
Object.assign(Feed.FEED, { chew: 2, layerFirst: 30, layerGrow: 1.8, pour: 8, speed: 180, startMites: 1, payScale: 1 });

const { w: W, h: H, grains: G } = Feed.FEED;
const FAST = { chew: 60, graze: 1, speed: 160 };
// A swarm with no mind of its own: straight to the point, eating what is nearest it (the base rule under the roaming).
const STRAIGHT = { roam: 0, wobble: 0, character: 0 };   // for tests that only care what was eaten, not how long it took
// Steps `seconds` in tenths, gathering what was paid and every event. `lead(state)` gives the point held, if any.
function play(s, seconds, opts, lead) {
    let research = 0; const events = [];
    for (let i = 0; i < Math.round(seconds * 10); i++) {
        if (lead) Feed.point(s, lead(s));
        const r = Feed.step(s, 0.1, opts);
        research += r.research; events.push(...r.events);
    }
    return { research, events };
}
function eatAll(s, opts = FAST, cap = 600) {
    let research = 0; const events = [];
    for (let t = 0; t < cap && Feed.left(s) > 0; t++) { const r = play(s, 1, opts); research += r.research; events.push(...r.events); }
    return { research, events };
}
const kindAt = (s, i) => Feed.KIND_IDS[Feed.kindOf(s.cells[i])];
const surface = (s, i) => { const x = i % W, y = (i - x) / W; return y === 0 || !s.cells[i - W] || (x > 0 && !s.cells[i - 1]) || (x < W - 1 && !s.cells[i + 1]) || (y < H - 1 && !s.cells[i + W]); };
const bottom = s => { for (let i = s.cells.length - 1; i >= 0; i--) if (s.cells[i]) return { x: i % W + 0.5, y: Math.floor(i / W) + 0.5 }; return null; };

test('the dials start at the ring model\'s numbers', () => {
    const d = Model.DEFAULTS, f = Feed.FEED;
    assert.equal(f.chew, d.chew);
    assert.equal(f.graze, d.graze);
    assert.equal(f.graze, 0.25, 'left alone, a quarter speed (the owner\'s call)');
    assert.deepEqual(f.tough, d.tough);
    assert.equal(f.layerGrow, d.layerGrow);
    assert.equal(f.miteFirst, d.miteFirst);
    assert.equal(f.miteEvery, d.miteEvery);
    assert.equal(f.layerFirst, 30);
});

test('a new Feed is one mite over an empty box, and says nothing until data arrives', () => {
    const s = Feed.newFeed({ seed: 3 });
    assert.equal(s.mites, 1);
    assert.equal(s.swarm.length, 1);
    assert.equal(s.cells.length, W * H);
    assert.equal(Feed.left(s), 0);
    assert.deepEqual(Feed.step(s, 5), { research: 0, events: [] });
});

test('data falls as packets from a spout that swings from side to side, and melts into sand half way down', () => {
    const s = Feed.newFeed({ seed: 2 });
    Feed.deliver(s, { sector: 1, packets: 600, gold: 0 });
    const xs = new Set(), spout = new Set();
    let melted = [];
    for (let i = 0; i < 160; i++) {
        const before = new Map(s.drops.map(d => [d, d.y]));
        Feed.step(s, 0.05, { chew: 0 });
        spout.add(Feed.spoutX(s));
        for (const d of s.drops) xs.add(d.x);
        for (const [d, y] of before) if (!s.drops.includes(d)) melted.push({ y, m: d.m });
    }
    assert.ok(Math.max(...spout) - Math.min(...spout) > 120, 'the spout swings wide');
    assert.ok(Math.max(...xs) - Math.min(...xs) > 120, 'and packets fall along its whole swing');
    assert.ok(melted.length > 30);
    // Over an empty floor a packet melts about half way down the box; none reaches the floor whole.
    assert.ok(melted.slice(0, 10).every(d => Math.abs(d.m - H / 2) <= 2 && d.y < H * 0.6), 'they melt half way down');
    // A small delivery is laid narrow, so a first pile is a pile; a big one is laid in a bed across the floor.
    const bed = packets => { const t = Feed.newFeed({ seed: 2 }); Feed.deliver(t, { sector: 1, packets, gold: 0 }); Feed.step(t, 20, { chew: 0 }); assert.equal(t.drops.length, 0); assert.equal(t.grains, packets * G); return t.cells.slice((H - 1) * W).filter(Boolean).length; };
    assert.ok(bed(40) < 170, 'a first pile ' + bed(40) + ' cells wide');
    assert.ok(Feed.spoutX(Feed.newFeed()) === W / 2);
});

test('now and then a grain hops as it lands; with no hop in it, sand only falls', () => {
    const rise = opts => {
        const s = Feed.newFeed({ seed: 4 });
        Feed.deliver(s, { sector: 1, packets: 80, gold: 0 });
        Feed.step(s, 20, opts);
        return { hops: s.stats.hops, s };
    };
    const lively = rise({ chew: 0 }), plain = rise({ chew: 0, hop: 0 });
    // About one landing in eight hops.
    assert.ok(lively.hops > 80 * G / 16 && lively.hops < 80 * G / 4, lively.hops + ' hops');
    assert.equal(plain.hops, 0);
    for (const { s } of [lively, plain]) { Feed.step(s, 6, { chew: 0 }); assert.equal(s.grains, 80 * G); assert.ok(s.cells.every(v => !Feed.airOf(v)), 'everything has landed'); }
});

test('packets pour in as sand, sixteen grains each, and settle into a pile on the floor', () => {
    for (const seed of [1, 2, 3]) {
        const s = Feed.newFeed({ seed });
        assert.equal(Feed.deliver(s, { sector: 1, packets: 40, gold: 4 }).added, 40 * G);
        assert.equal(s.grains, 0, 'nothing is in the box until it pours');
        Feed.step(s, 0.5, { chew: 0 });
        assert.ok(s.drops.length > 0 && Feed.waiting(s) > 0, 'it pours over time');
        Feed.step(s, 25, { chew: 0 });
        assert.equal(s.grains, 40 * G, `seed ${seed}`);
        assert.equal(Feed.waiting(s), 0);
        const c = Feed.census(s);
        assert.deepEqual([c.plain, c.vein, c.fragment], [36 * G - 1, 4 * G, 1], `seed ${seed}`);
        // At rest: every grain sits on the floor or on sand.
        for (let i = 0; i + W < s.cells.length; i++) if (s.cells[i]) assert.ok(s.cells[i + W], `seed ${seed}: a grain hangs in the air`);
        const top = s.cells.findIndex(v => v);
        assert.ok(Math.floor(top / W) > H - 40, `seed ${seed}: a low mound, not a column`);
        assert.equal(s.rest, true);
    }
});

test('the same seed makes the same pile; another seed another', () => {
    const lay = seed => { const s = Feed.newFeed({ seed }); Feed.deliver(s, { sector: 2, packets: 60, gold: 6, garbled: 5 }); Feed.step(s, 8); return JSON.stringify(s); };
    assert.equal(lay(7), lay(7));
    assert.notEqual(lay(7), lay(8));
});

test('left alone, the swarm eats from the outside in: every grain it takes is on the pile\'s surface', () => {
    const s = Feed.newFeed({ seed: 4 });
    Feed.deliver(s, { sector: 1, packets: 60, gold: 0 });
    Feed.step(s, 25, { chew: 0 });
    assert.equal(s.rest, true);
    let eaten = 0;
    for (let i = 0; i < 1500 && eaten < 40; i++) {
        const before = s.cells.slice();
        for (const e of Feed.step(s, Feed.STEP).events) {
            if (e.type !== 'eat') continue;
            const cell = e.y * W + e.x;
            // Near the surface: never more than a few grains of sand over it (sand that slides in over a mite counts).
            let over = 0;
            for (let j = cell - W; j >= 0 && before[j]; j -= W) over++;
            assert.ok(over <= 4, 'bite ' + eaten + ': a grain ' + over + ' deep was eaten');
            eaten++;
        }
    }
    assert.ok(eaten >= 40);
});

test('led, a mite eats two packets a second; left alone, a quarter of that', () => {
    const rate = (lead, mind = STRAIGHT) => {
        const s = Feed.newFeed({ seed: 9 });
        Feed.deliver(s, { sector: 1, packets: 300, gold: 0 });
        Feed.step(s, 12, { chew: 0 });
        const one = { miteFirst: 99, ...mind };   // one mite throughout: no second one joining part way
        play(s, 6, one, lead);   // time to reach the pile
        const from = s.stats.eaten;
        play(s, 20, one, lead);
        return (s.stats.eaten - from) / G / 20;
    };
    const led = rate(bottom), alone = rate(null);
    assert.ok(Math.abs(led - 2) < 0.25, `led: ${led} packets a second`);
    assert.ok(Math.abs(alone - 0.5) < 0.1, `alone: ${alone} packets a second`);
    // With its own mind (the owner's call: strong roaming, and a slower swarm for it) it still eats, well under that.
    const roaming = rate(bottom, {});
    assert.ok(roaming > 0.3 && roaming < led, `roaming: ${roaming} packets a second`);
});

test('the swarm goes where you hold: to a point in empty air it eats nothing, and through sand it eats its way', () => {
    const s = Feed.newFeed({ seed: 6 });
    Feed.deliver(s, { sector: 1, packets: 200, gold: 0 });
    Feed.step(s, 10, { chew: 0 });
    s.mites = 3; s.swarm.push({ x: 10.5, y: 1.5, b: 0, t: -1 }, { x: 50.5, y: 1.5, b: 0, t: -1 });
    const air = { x: 6.5, y: 20.5 };
    play(s, 5, STRAIGHT, () => air);
    assert.equal(s.stats.eaten, 0);
    for (const m of s.swarm) assert.ok(Math.hypot(m.x - air.x, m.y - air.y) < 1, 'every mite came to the point');
    // Now a point on the floor under the pile's middle: they tunnel to it.
    const deep = { x: W / 2 + 0.5, y: H - 0.5 };
    const { events } = play(s, 40, STRAIGHT, () => deep);
    const eats = events.filter(e => e.type === 'eat');
    assert.ok(eats.length > 40);
    assert.ok(eats.some(e => Math.hypot(e.x + 0.5 - deep.x, e.y + 0.5 - deep.y) < 3), 'they ate down to the point');
    for (const m of s.swarm) assert.ok(Math.hypot(m.x - deep.x, m.y - deep.y) < Feed.FEED.near + 2);
    // Let go: the point is forgotten.
    assert.equal(Feed.point(s, null), null);
    assert.equal(s.aim, null);
});

test('a point is kept inside the box, and junk is no point', () => {
    const s = Feed.newFeed({ seed: 1 });
    assert.deepEqual(Feed.point(s, { x: -5, y: 1e9 }), { x: 0, y: H - 0.01 });
    for (const junk of [undefined, 5, 'x', {}, { x: 1 }, { x: NaN, y: 2 }, { x: Infinity, y: 2 }]) assert.equal(Feed.point(s, junk), null);
});

test('research is whole numbers, a grain paying its share of a packet, and nothing is lost between steps', () => {
    for (const seed of [1, 2, 3]) {
        const s = Feed.newFeed({ seed });
        Feed.deliver(s, { sector: 1, packets: 40, gold: 4 });
        const { research, events } = eatAll(s);
        assert.ok(Number.isInteger(research));
        // Letters at 1 a packet, gold at 3, the fragment at 2, a grain's share each; and the first layer's lump of 6.
        const owed = ((36 * G - 1) * 1 + 4 * G * 3 + 1 * 2) / G + 6;
        assert.equal(research, Math.floor(owed));
        assert.ok(Math.abs(s.owed - (owed - Math.floor(owed))) < 1e-6);
        assert.equal(research, s.stats.research);
        assert.equal(events.filter(e => e.type === 'eat').length, 40 * G);
    }
});

test('the hunger meter: full, the swarm splits (a new mite) and a lump is paid; the next needs 1.8 times as much', () => {
    const s = Feed.newFeed({ seed: 2 });
    Feed.deliver(s, { sector: 1, packets: 190, gold: 0 });
    const layers = eatAll(s).events.filter(e => e.type === 'layer');
    assert.deepEqual(layers.map(e => e.pay), [6, 11, 19], '0.2 of 30, 54 and 97 packets');
    assert.deepEqual(layers.map(e => e.mite), [true, true, true]);
    assert.equal(s.mites, 4);
    assert.equal(s.swarm.length, 4, 'a place in the box for every mite');
    assert.deepEqual(Feed.hunger(s), { fed: (190 - 30 - 54 - 97) * G, need: 175 * G, share: 9 / 175, splits: 3, life: 1 });
    assert.deepEqual(Feed.hunger(Feed.newFeed()), { fed: 0, need: 30 * G, share: 0, splits: 0, life: 1 });
    assert.equal(s.layers, 3);
    assert.deepEqual([0, 1, 2, 3].map(n => Feed.layerSize(n)), [30, 54, 97, 175]);
    assert.equal(s.fed, (190 - 30 - 54 - 97) * G, 'what is left over counts toward the next layer');
});

test('the pile runs out: "empty" comes once, and again only after more data has come and gone', () => {
    const s = Feed.newFeed({ seed: 4 });
    Feed.deliver(s, { sector: 1, packets: 10, gold: 0 });
    eatAll(s);
    const first = play(s, 2).events.concat();
    assert.ok(first.length <= 1);
    assert.deepEqual(Feed.step(s, 10), { research: 0, events: [] });
    assert.equal(s.dry, true);
    assert.ok(s.swarm.every(m => m.b === 0), 'no bites saved up while there is nothing to eat');
    Feed.deliver(s, { sector: 1, packets: 5, gold: 0 });
    assert.equal(s.dry, false);
    const again = eatAll(s).events.concat(play(s, 2).events).filter(e => e.type === 'empty');
    assert.equal(again.length, 1);
    assert.equal(s.layers, 0, 'half a layer is not a layer');
});

test('deeper data is tougher: two bites a grain from sector 2, three from sector 3, one more a sector after', () => {
    assert.deepEqual([1, 2, 3, 4, 6].map(k => Feed.bitesFor(k)), [1, 2, 3, 4, 6]);
    for (const [sector, bites] of [[1, 1], [3, 3]]) {
        const s = Feed.newFeed({ seed: 6 });
        Feed.deliver(s, { sector, packets: 30, gold: 0 });
        Feed.step(s, 8, { chew: 0 });
        assert.ok(s.cells.every((v, i) => !v || kindAt(s, i) === 'numbers' || Feed.hpOf(v) === bites));
    }
});

test('gold pours in together: most gold grains lie against another', () => {
    for (const seed of [1, 2, 3]) {
        const s = Feed.newFeed({ seed });
        Feed.deliver(s, { sector: 1, packets: 120, gold: 12 });
        Feed.step(s, 25, { chew: 0 });
        const gold = s.cells.map((v, i) => (v && kindAt(s, i) === 'vein' ? i : -1)).filter(i => i >= 0);
        assert.equal(gold.length, 12 * G);
        const near = gold.filter(i => [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1].some(d => gold.includes(i + d)));
        assert.ok(near.length >= gold.length * 0.75, `seed ${seed}: ${near.length} of ${gold.length} in a seam`);
    }
});

test('one fragment a layer until the parcel set is whole, then no more', () => {
    // Small layers, so six of them fit in a small pile.
    const small = { ...FAST, layerFirst: 6, layerGrow: 1.3, fragFrom: 1, fragSpread: 2, pour: 2 };   // poured slowly, so the swarm keeps up with it
    for (const seed of [1, 2, 3]) {
        const s = Feed.newFeed({ seed, ...small });
        Feed.deliver(s, { sector: 1, packets: 90, gold: 0 });
        const { events } = eatAll(s, small);
        const found = events.filter(e => e.type === 'fragment');
        assert.deepEqual(found.map(e => e.piece), [0, 1, 2, 3], `seed ${seed}`);
        assert.deepEqual(found.map(e => e.complete), [false, false, false, true]);
        assert.deepEqual(s.fragments.parcel, [0, 1, 2, 3]);
        assert.ok(s.layers >= 5);
        assert.equal(events.filter(e => e.type === 'eat' && e.kind === 'fragment').length, 4);
    }
});

test('numbers come from sector 2 and pictures from sector 4, about a tenth each', () => {
    const count = sector => { const s = Feed.newFeed({ seed: 11 }); Feed.deliver(s, { sector, packets: 250, gold: 0 }); Feed.step(s, 30, { chew: 0 }); return Feed.census(s); };
    const one = count(1), two = count(2), four = count(4);
    assert.equal(one.numbers, undefined);
    assert.equal(two.pictures, undefined);
    assert.ok(Math.abs(two.numbers - 25 * G) < 6 * G, `${two.numbers}`);
    assert.ok(Math.abs(four.numbers - 25 * G) < 6 * G && Math.abs(four.pictures - 25 * G) < 6 * G);
    assert.deepEqual(Feed.LOCKED, ['numbers', 'pictures']);
    assert.deepEqual(Feed.LOCKED.map(k => Feed.KINDS[k].skill), ['Embeddings', 'Edge Detection']);
});

test('garbled sand is slow to eat and pays nothing; it comes from garbled catches, and half of what popped bubbles held', () => {
    const s = Feed.newFeed({ seed: 8 });
    assert.equal(Feed.deliver(s, { sector: 1, packets: 0, garbled: 3, popped: 9 }).added, (3 + 5) * G);
    Feed.step(s, 6, { chew: 0 });
    assert.deepEqual(Feed.census(s), { garbled: 8 * G });
    assert.ok(s.cells.every(v => !v || Feed.hpOf(v) === Feed.FEED.slow), 'four times the bites');
    const { research, events } = eatAll(s);
    assert.equal(research, 0);
    assert.equal(s.owed, 0);
    assert.equal(s.stats.cleaned, 8 * G);
    assert.equal(s.stats.eaten, 0);
    assert.equal(s.fed, 0, 'it is no part of a layer');
    assert.ok(events.filter(e => e.type === 'eat').every(e => e.kind === 'garbled' && e.pays === false));
    // The same weight of good sand goes much faster.
    const time = load => { const t = Feed.newFeed({ seed: 8 }); Feed.deliver(t, load); Feed.step(t, 6, { chew: 0 }); let n = 0; while (Feed.left(t) > 0 && n < 4000) { Feed.point(t, bottom(t)); Feed.step(t, 0.1, STRAIGHT); n++; } return n / 10; };
    const good = time({ sector: 1, packets: 8 }), bad = time({ sector: 1, packets: 0, garbled: 8 });
    assert.ok(bad > good * 2.5, `bad ${bad} s, good ${good} s`);
});

test('sand the model has no skill for is slow and pays nothing, until the skill is learned', () => {
    const fresh = () => { const s = Feed.newFeed({ seed: 13 }); Feed.deliver(s, { sector: 2, packets: 100, gold: 0 }); Feed.step(s, 20, { chew: 0 }); return s; };
    const a = fresh(), numbers = Feed.census(a).numbers;
    assert.ok(numbers > 20);
    for (let i = 0; i < a.cells.length; i++) if (a.cells[i]) assert.equal(Feed.hpOf(a.cells[i]), kindAt(a, i) === 'numbers' ? 2 * Feed.FEED.slow : 2);
    const without = eatAll(a);
    assert.equal(a.stats.cleaned, numbers);
    assert.ok(without.events.filter(e => e.kind === 'numbers').every(e => e.pays === false));
    // Learn it first, and the same sand is good: quick, and paid at its own rate.
    const b = fresh();
    assert.deepEqual(Feed.readableFor(['Pattern Matching']), []);
    assert.deepEqual(Feed.readableFor(['Pattern Matching', 'Embeddings']), ['numbers']);
    assert.equal(Feed.setReadable(b, ['numbers']).turned, numbers);
    assert.ok(b.cells.every(v => !v || Feed.hpOf(v) <= 2));
    assert.equal(Feed.setReadable(b, ['numbers']).turned, 0, 'turned once');
    const withIt = eatAll(b);
    assert.equal(b.stats.cleaned, 0);
    assert.ok(withIt.research > without.research + numbers * Feed.KINDS.numbers.pay / G - 2);
    // Sand that pours in after the skill is learned is good from the start.
    Feed.deliver(b, { sector: 2, packets: 50, gold: 0 });
    Feed.step(b, 15, { chew: 0 });
    assert.ok(b.cells.every(v => !v || Feed.hpOf(v) <= 2));
});

test('a full box makes the rest wait at the spout, and not a grain is lost', { skip: !process.env.SLOW && 'SLOW=1 runs it (about 3 s)' }, () => {
    const s = Feed.newFeed({ seed: 5 });
    Feed.deliver(s, { sector: 1, packets: 2500, gold: 100, garbled: 100 });
    Feed.step(s, 200, { chew: 0 });
    assert.ok(Feed.waiting(s) > 0, 'it did not all fit');
    assert.ok(Feed.fill(s) > 0.7 && Feed.fill(s) <= 1);
    assert.equal(s.grains, s.cells.filter(Boolean).length);
    assert.equal(s.grains + Feed.waiting(s), 2600 * G);
    play(s, 30, FAST);
    assert.equal(s.grains + Feed.waiting(s) + s.stats.eaten + s.stats.cleaned, 2600 * G);
});

test('a saved pile carries on exactly: the state is plain data, the generator\'s place included', () => {
    const go = (s, n) => { const out = []; for (let i = 0; i < n; i++) { Feed.point(s, i % 50 < 30 ? { x: 20 + (i % 7), y: H - 8 } : null); out.push(Feed.step(s, 0.25)); if (i % 40 === 5) out.push(Feed.deliver(s, { sector: 2, packets: 60, gold: 6, popped: 4 })); } return out; };
    const a = Feed.newFeed({ seed: 21 });
    Feed.deliver(a, { sector: 2, packets: 50, gold: 4, garbled: 6 });
    go(a, 30);
    const b = Feed.clean(JSON.parse(JSON.stringify(a)));
    assert.deepEqual(b, a);
    assert.deepEqual(go(b, 200), go(a, 200));
    assert.deepEqual(b, a);
});

test('gold and fragments look like plain sand until a mite\'s lamp has been near them; everything else always shows', () => {
    const s = Feed.newFeed({ seed: 3 });
    Feed.deliver(s, { sector: 2, packets: 300, gold: 30, garbled: 20 });
    Feed.step(s, 30, { chew: 0 });
    const hidden = s.cells.map((v, i) => (v && !Feed.seenOf(v) ? i : -1)).filter(i => i >= 0);
    assert.ok(hidden.length > 5 * G, 'much of the gold is still buried');
    assert.ok(hidden.every(i => ['vein', 'fragment'].includes(kindAt(s, i))));
    const m = s.swarm[0], lamp = Feed.FEED.lamp;
    for (const i of hidden) assert.ok(Math.hypot(i % W + 0.5 - m.x, Math.floor(i / W) + 0.5 - m.y) > lamp - 1.5, 'nothing hidden right beside the mite');
    // Lead it down through the pile: it finds gold on the way, and what it found stays found.
    const { events } = play(s, 40, undefined, () => ({ x: W / 2 + 0.5, y: H - 0.5 }));
    const found = events.filter(e => e.type === 'found');
    assert.ok(found.length > 5 && found.every(e => e.kind === 'vein' || e.kind === 'fragment'));
    const gold = () => s.cells.filter(v => v && Feed.seenOf(v) && Feed.KIND_IDS[Feed.kindOf(v)] === 'vein').length;
    const seen = gold();
    Feed.point(s, { x: 4.5, y: 4.5 });
    Feed.step(s, 6, { chew: 0 });
    assert.ok(gold() >= seen, 'still showing with the mite gone');
});

test('the box is saved as runs of text, a fraction of the size, and reads back the same', () => {
    const s = Feed.newFeed({ seed: 5 });
    Feed.deliver(s, { sector: 2, packets: 300, gold: 30, garbled: 20 });
    Feed.step(s, 30);
    const text = JSON.stringify(s), raw = JSON.parse(text);
    assert.equal(typeof raw.cells, 'string');
    assert.ok(text.length < 20000, text.length + ' bytes');
    assert.deepEqual(Feed.unpack(raw.cells, W * H), s.cells);
    assert.deepEqual(Feed.unpack(Feed.pack(s.cells), W * H), s.cells);
    for (const junk of ['', 'zz*-1', '5*zzzzzz', 'x,y', '0*10']) assert.equal(Feed.unpack(junk, W * H), null);
    assert.deepEqual(Feed.clean(raw), s);
    assert.equal(typeof JSON.parse(JSON.stringify(Feed.clean(raw))).cells, 'string', 'a cleaned Feed saves the same way');
});

test('odd loads are safe: nothing, negatives, more gold than packets, junk steps', () => {
    const s = Feed.newFeed({ seed: 1 });
    for (const load of [undefined, {}, { sector: 1, packets: 0 }, { sector: 1, packets: -5, gold: 3 }, { packets: 'x', garbled: NaN }]) assert.equal(Feed.deliver(s, load).added, 0);
    assert.equal(Feed.deliver(s, { sector: 0, packets: 6.9, gold: 99 }).added, 6 * G);
    Feed.step(s, 6, { chew: 0 });
    assert.deepEqual(Feed.census(s), { vein: 6 * G });
    for (const dt of [-1, 0, NaN, Infinity]) assert.deepEqual(Feed.step(s, dt), { research: 0, events: [] });
});
