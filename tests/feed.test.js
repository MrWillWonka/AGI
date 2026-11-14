// The Feed (feed.js): the heap, tiles, layers, mites, pointing, chewing and grazing. Build 1 of design/ring-build.md.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const Model = require('../tools/ring-model.js');

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const kinds = s => s.tiles.filter(Boolean).reduce((m, t) => { m[t.k] = (m[t.k] || 0) + 1; return m; }, {});
const all = s => s.tiles.map((t, i) => (t && !t.e ? i : -1)).filter(i => i >= 0);
// Plays until nothing can be eaten, pointing at everything in turn. Returns the research paid and every event.
function eatAll(s, opts, pointing = true) {
    let research = 0; const events = [];
    for (let n = 0; n < 20000 && Feed.left(s) > 0; n++) {
        if (pointing && !s.line.length) Feed.point(s, all(s), opts);
        const r = Feed.step(s, 0.1, opts);
        research += r.research; events.push(...r.events);
    }
    return { research, events };
}

test('the dials start at the ring model\'s numbers', () => {
    const d = Model.DEFAULTS, f = Feed.FEED;
    assert.equal(f.chew, d.chew);
    assert.equal(f.graze, d.graze);
    assert.deepEqual(f.tough, d.tough);
    assert.equal(f.layerGrow, d.layerGrow);
    assert.equal(f.miteFirst, d.miteFirst);
    assert.equal(f.miteEvery, d.miteEvery);
    assert.equal(f.layerFirst, 30);
});

test('a new Feed is one mite on an empty first layer, and says nothing until data arrives', () => {
    const s = Feed.newFeed({ seed: 3 });
    assert.equal(s.mites, 1);
    assert.equal(s.size, 30);
    assert.equal(Feed.left(s), 0);
    assert.deepEqual(Feed.step(s, 5), { research: 0, events: [] });
    const g = Feed.grid(s);
    assert.ok(g.cols * g.rows >= g.size && g.cols * (g.rows - 1) < g.size);
});

test('the first heap: 40 packets fill the first layer of 30 and 10 wait for the next', () => {
    for (const seed of SEEDS) {
        const s = Feed.newFeed({ seed });
        const r = Feed.deliver(s, { sector: 1, packets: 40, gold: 0 });
        assert.equal(r.added, 30);
        assert.equal(s.free, 0);
        assert.equal(Feed.waiting(s), 10);
        assert.equal(Feed.left(s), 30);
        const k = kinds(s);
        assert.equal(k.fragment, 1, `seed ${seed}: the first layer hides one fragment`);
        assert.equal(k.plain, 29, `seed ${seed}: sector 1 brings nothing unreadable`);
        assert.ok(s.tiles.every(t => t.s === 0 && t.b === 1), 'face down, one bite each');
    }
});

test('the same seed lays the same heap; another seed lays another', () => {
    const lay = seed => { const s = Feed.newFeed({ seed }); Feed.deliver(s, { sector: 2, packets: 30, gold: 5 }); return JSON.stringify(s.tiles); };
    assert.equal(lay(7), lay(7));
    assert.notEqual(lay(7), lay(8));
});

test('pointing: the swarm eats your line in order, a tile a bite on sector 1, two bites a second a mite', () => {
    const s = Feed.newFeed({ seed: 5 });
    Feed.deliver(s, { sector: 1, packets: 30, gold: 0 });
    const line = Feed.point(s, [{ c: 4, r: 0 }, 9, 2, { c: 0, r: 3 }]);
    assert.deepEqual(line, [4, 9, 2, 18]);
    const r = Feed.step(s, 1);
    assert.deepEqual(r.events.filter(e => e.type === 'eat').map(e => e.cell), [4, 9]);
    assert.equal(Feed.step(s, 1).events.filter(e => e.type === 'eat').length, 2);
    assert.equal(s.line.length, 0);
    assert.equal(s.stats.eaten, 4);
});

test('a line ignores cells off the heap, empty slots, eaten tiles and repeats, and holds at most lineMax tiles', () => {
    const s = Feed.newFeed({ seed: 5 });
    Feed.deliver(s, { sector: 1, packets: 12, gold: 0 });
    const empty = s.tiles.findIndex(t => !t), full = all(s);
    assert.deepEqual(Feed.point(s, [-1, 99, 2.5, { c: 9, r: 9 }, empty, full[0], full[0], full[1]]), [full[0], full[1]]);
    Feed.step(s, 0.5);
    assert.deepEqual(Feed.point(s, [full[0], full[2]]), [full[2]], 'an eaten tile is not pointed at again');
    const t = Feed.newFeed({ seed: 5 });
    Feed.deliver(t, { sector: 1, packets: 30, gold: 0 });
    assert.equal(Feed.point(t, all(t)).length, Feed.FEED.lineMax);
});

test('grazing: with no line the swarm eats at about a third of the speed, lowest slot first', () => {
    const s = Feed.newFeed({ seed: 9 });
    Feed.deliver(s, { sector: 1, packets: 30, gold: 0 });
    let eaten = [];
    for (let i = 0; i < 100; i++) eaten.push(...Feed.step(s, 0.1).events.filter(e => e.type === 'eat').map(e => e.cell));
    assert.equal(eaten.length, 7, '10 s × 2 × 0.35');
    assert.deepEqual(eaten, [0, 1, 2, 3, 4, 5, 6]);
});

test('research is whole numbers, and what a step returns is what its events paid', () => {
    for (const seed of SEEDS.slice(0, 10)) {
        const s = Feed.newFeed({ seed });
        Feed.deliver(s, { sector: 3, packets: 200, gold: 20 });
        const { research, events } = eatAll(s);
        assert.ok(Number.isInteger(research));
        assert.equal(research, events.filter(e => e.type === 'eat' || e.type === 'layer').reduce((n, e) => n + e.pay, 0));
        assert.equal(research, s.stats.research);
    }
});

test('a cleared layer pays a lump, the next is 1.8 times bigger, and the first and every second after it add a mite', () => {
    const s = Feed.newFeed({ seed: 2 });
    Feed.deliver(s, { sector: 1, packets: 300, gold: 0 });
    const { events } = eatAll(s);
    const layers = events.filter(e => e.type === 'layer');
    assert.deepEqual(layers.map(e => e.pay), [6, 11, 19], '0.2 of 30, 54 and 97 slots');
    assert.deepEqual(layers.map(e => e.mite), [true, false, true]);
    assert.equal(s.mites, 3);
    assert.equal(s.layers, 3);
    assert.equal(s.size, 175);
    assert.deepEqual([0, 1, 2, 3].map(n => Feed.layerSize(n)), [30, 54, 97, 175]);
});

test('a new layer waits for you: a step that clears a layer eats nothing on the next', () => {
    const s = Feed.newFeed({ seed: 2 });
    Feed.deliver(s, { sector: 1, packets: 80, gold: 0 });
    Feed.point(s, all(s));
    let r;
    for (let i = 0; i < 400 && s.layers === 0; i++) { Feed.point(s, all(s)); r = Feed.step(s, 30); }
    assert.equal(r.events[r.events.length - 1].type, 'layer');
    assert.equal(s.stats.eaten, 30);
    assert.equal(s.line.length, 0, 'the old line went with the old layer');
});

test('the heap runs out: "empty" comes once, and again only after more data has come and gone', () => {
    const s = Feed.newFeed({ seed: 4 });
    Feed.deliver(s, { sector: 1, packets: 10, gold: 0 });
    const first = eatAll(s).events.filter(e => e.type === 'empty');
    assert.equal(first.length, 1);
    assert.deepEqual(Feed.step(s, 10), { research: 0, events: [] });
    assert.equal(s.bite, 0, 'no bites saved up while there is nothing to eat');
    Feed.deliver(s, { sector: 1, packets: 5, gold: 0 });
    assert.equal(eatAll(s).events.filter(e => e.type === 'empty').length, 1);
    assert.equal(s.layers, 0, 'half a layer is not a layer');
});

test('deeper data is tougher: two bites a tile from sector 2, three from sector 3, one more a sector after', () => {
    assert.deepEqual([1, 2, 3, 4, 6].map(k => Feed.bitesFor(k)), [1, 2, 3, 4, 6]);
    const s = Feed.newFeed({ seed: 6 });
    Feed.deliver(s, { sector: 3, packets: 30, gold: 0 });
    const first = Feed.left(s);
    Feed.point(s, all(s));
    const r = Feed.step(s, 3);
    assert.equal(r.events.filter(e => e.type === 'bite').length, 4);
    assert.equal(r.events.filter(e => e.type === 'eat').length, 2);
    assert.equal(Feed.left(s), first - 2);
});

test('gold packets arrive as veins: lines of touching tiles that pay more and show their neighbours when eaten', () => {
    for (const seed of SEEDS) {
        const s = Feed.newFeed({ seed });
        Feed.deliver(s, { sector: 1, packets: 30, gold: 5 });
        const veins = s.tiles.map((t, i) => (t.k === 'vein' ? i : -1)).filter(i => i >= 0);
        assert.equal(veins.length, 5, `seed ${seed}`);
        const near = (a, b) => { const p = Feed.cellOf(s, a), q = Feed.cellOf(s, b); return Math.max(Math.abs(p.c - q.c), Math.abs(p.r - q.r)) === 1; };
        const lone = veins.filter(a => !veins.some(b => near(a, b)));
        assert.ok(lone.length <= 1, `seed ${seed}: veins lie together`);
        const start = veins.find(a => veins.some(b => near(a, b)));
        Feed.point(s, [start]);
        const r = Feed.step(s, 0.5);
        assert.equal(r.events[0].pay, Feed.KINDS.vein.pay);
        const shown = r.events.find(e => e.type === 'reveal');
        assert.ok(shown && shown.cells.every(i => s.tiles[i].k === 'vein' && s.tiles[i].s === 1 && near(i, start)), `seed ${seed}`);
    }
});

test('one fragment hides in each layer until the parcel set is whole, then no more', () => {
    for (const seed of SEEDS.slice(0, 12)) {
        const s = Feed.newFeed({ seed });
        Feed.deliver(s, { sector: 1, packets: 2000, gold: 0 });
        const { events } = eatAll(s);
        const found = events.filter(e => e.type === 'fragment');
        assert.deepEqual(found.map(e => e.piece), [0, 1, 2, 3], `seed ${seed}`);
        assert.deepEqual(found.map(e => e.complete), [false, false, false, true]);
        assert.deepEqual(s.fragments.parcel, [0, 1, 2, 3]);
        const layerOf = found.map(e => events.slice(0, events.indexOf(e)).filter(x => x.type === 'layer').length);
        assert.deepEqual(layerOf, [0, 1, 2, 3], `seed ${seed}: one a layer`);
        assert.ok(s.layers >= 5 && !s.tiles.some(t => t && t.k === 'fragment'));
    }
});

test('numbers come from sector 2 and pictures from sector 4, about a tenth each', () => {
    const count = sector => { const s = Feed.newFeed({ seed: 11, layerFirst: 4000, layerMax: 4000 }); Feed.deliver(s, { sector, packets: 4000, gold: 0 }); return kinds(s); };
    assert.equal(count(1).numbers, undefined);
    assert.equal(count(1).pictures, undefined);
    assert.ok(Math.abs(count(2).numbers - 400) < 80);
    assert.equal(count(3).pictures, undefined);
    assert.ok(Math.abs(count(4).numbers - 400) < 80 && Math.abs(count(4).pictures - 400) < 80);
    assert.deepEqual(Feed.LOCKED, ['numbers', 'pictures']);
    assert.deepEqual(Feed.LOCKED.map(k => Feed.KINDS[k].skill), ['Embeddings', 'Edge Detection']);
});

test('unreadable tiles can\'t be eaten, show themselves when pointed at, and never hold a layer up', () => {
    const s = Feed.newFeed({ seed: 13 });
    Feed.deliver(s, { sector: 2, packets: 30, gold: 0 });
    const locked = s.tiles.map((t, i) => (t.k === 'numbers' ? i : -1)).filter(i => i >= 0);
    assert.ok(locked.length > 0);
    assert.equal(Feed.left(s), 30 - locked.length);
    Feed.point(s, [locked[0]]);
    const r = Feed.step(s, 1);
    assert.deepEqual(r.events[0], { type: 'locked', cell: locked[0], kind: 'numbers', skill: 'Embeddings' });
    assert.equal(s.tiles[locked[0]].e, 0);
    assert.deepEqual(Feed.point(s, [locked[0]]), [], 'once seen, it is not pointed at again');
    const { events } = eatAll(s);
    const layer = events.find(e => e.type === 'layer');
    assert.deepEqual(layer.locked, { numbers: locked.length });
    assert.deepEqual(s.locked, [{ kind: 'numbers', sector: 2, n: locked.length }]);
    assert.equal(s.stats.eaten, 30 - locked.length);
});

test('learning the skill brings the tiles left behind back to the heap, readable', () => {
    const s = Feed.newFeed({ seed: 13 });
    Feed.deliver(s, { sector: 2, packets: 30, gold: 0 });
    eatAll(s);
    const kept = s.locked[0].n;
    assert.deepEqual(Feed.readableFor(['Pattern Matching']), []);
    assert.deepEqual(Feed.readableFor(['Pattern Matching', 'Embeddings']), ['numbers']);
    const r = Feed.setReadable(s, Feed.readableFor(['Pattern Matching', 'Embeddings']));
    assert.equal(r.returned, kept);
    assert.deepEqual(s.locked, []);
    assert.equal(Feed.left(s), kept);
    assert.ok(s.tiles.filter(Boolean).every(t => t.k === 'numbers' && t.b === 2));
    const { research } = eatAll(s);
    assert.equal(research, kept * Feed.KINDS.numbers.pay);
    // Tiles of a readable kind already on the layer open up too.
    const t = Feed.newFeed({ seed: 13 });
    Feed.deliver(t, { sector: 2, packets: 30, gold: 0 });
    Feed.setReadable(t, ['numbers']);
    assert.equal(Feed.left(t), 30);
});

test('a saved heap carries on exactly: the state is plain data, the generator\'s place included', () => {
    const play = (s, n) => { const out = []; for (let i = 0; i < n; i++) { if (i % 7 === 0) Feed.point(s, all(s).reverse()); out.push(Feed.step(s, 0.25)); if (i % 40 === 5) out.push(Feed.deliver(s, { sector: 2, packets: 60, gold: 6 })); } return out; };
    const a = Feed.newFeed({ seed: 21 });
    Feed.deliver(a, { sector: 2, packets: 50, gold: 4 });
    play(a, 30);
    const b = JSON.parse(JSON.stringify(a));
    assert.deepEqual(b, a);
    assert.deepEqual(play(b, 200), play(a, 200));
    assert.deepEqual(b, a);
});

test('the mites at work: one tile each, your line first', () => {
    const s = Feed.newFeed({ seed: 2 });
    Feed.deliver(s, { sector: 1, packets: 30, gold: 0 });
    s.mites = 3;
    assert.deepEqual(Feed.working(s), [0, 1, 2]);
    Feed.point(s, [20, 12]);
    assert.deepEqual(Feed.working(s), [20, 12, 0]);
});

test('odd loads are safe: nothing, negatives, more gold than packets', () => {
    const s = Feed.newFeed({ seed: 1 });
    assert.equal(Feed.deliver(s, { sector: 1, packets: 0 }).added, 0);
    assert.equal(Feed.deliver(s, { sector: 1, packets: -5, gold: 3 }).added, 0);
    assert.equal(Feed.deliver(s, {}).added, 0);
    assert.equal(Feed.deliver(s, { sector: 0, packets: 6.9, gold: 99 }).added, 6);
    assert.equal(kinds(s).vein, 6);
    assert.deepEqual(Feed.step(s, -1), { research: 0, events: [] });
    assert.deepEqual(Feed.step(s, NaN), { research: 0, events: [] });
});
