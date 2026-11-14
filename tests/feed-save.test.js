// The Feed in the save (engine.js `state.feed`, save v38) and the ring's switch (`E.setRing`). Build 1 of
// design/ring-build.md.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const Feed = require('../feed.js');
const NOW = 1_700_000_000_000;
const all = f => f.tiles.map((t, i) => (t && !t.e ? i : -1)).filter(i => i >= 0);

test('the ring\'s switch is off unless it is turned on, and turns off again', () => {
    assert.equal(E.isRing(), false);
    E.setRing(true);
    assert.equal(E.isRing(), true);
    E.setRing(0);
    assert.equal(E.isRing(), false);
});

test('a new game and a save from before The Feed both start it empty: one mite, a first layer of 30', () => {
    const s = E.defaultState(NOW);
    assert.equal(s.feed.mites, 1);
    assert.equal(s.feed.size, 30);
    assert.equal(s.feed.layers, 0);
    assert.equal(Feed.left(s.feed), 0);
    const old = E.migrate({ version: 37, res: { cp: 5, rp: 12 } }, NOW);
    assert.equal(old.version, E.SAVE_VERSION);
    assert.ok(E.SAVE_VERSION >= 38);
    assert.deepEqual(old.feed, s.feed);
    assert.equal(old.res.rp, 12);
});

test('what The Feed earns goes to research, in whole numbers', () => {
    const s = E.defaultState(NOW);
    assert.equal(s.res.rp, 0);
    assert.equal(E.feedDeliver(s, { sector: 1, packets: 40, gold: 0 }).added, 30);
    E.feedPoint(s, all(s.feed));
    const out = E.feedStep(s, 1);
    assert.equal(out.research, 2);
    assert.equal(s.res.rp, 2);
    let paid = 2;
    for (let i = 0; i < 400 && s.feed.layers === 0; i++) { E.feedPoint(s, all(s.feed)); paid += E.feedStep(s, 0.5).research; }
    assert.equal(s.feed.layers, 1);
    assert.equal(s.feed.mites, 2, 'the first layer cleared gives the first new mite');
    assert.equal(s.res.rp, paid);
    assert.equal(paid, 29 * 1 + 2 + 6, '29 letters, a fragment and the layer\'s lump');
    assert.ok(Number.isInteger(s.res.rp));
});

test('a heap half eaten comes back from a save exactly, and plays on the same', () => {
    const a = E.defaultState(NOW);
    E.feedDeliver(a, { sector: 2, packets: 70, gold: 6 });
    E.feedPoint(a, all(a.feed).slice(3));
    E.feedStep(a, 4.3);
    const b = E.migrate(JSON.parse(JSON.stringify(a)), NOW);
    assert.deepEqual(b.feed, a.feed);
    assert.equal(b.res.rp, a.res.rp);
    const play = s => { const out = []; for (let i = 0; i < 300; i++) { if (i % 9 === 0) E.feedPoint(s, all(s.feed)); out.push(E.feedStep(s, 0.2)); if (i === 150) out.push(E.feedDeliver(s, { sector: 3, packets: 90, gold: 9 })); } return out; };
    assert.deepEqual(play(b), play(a));
    assert.deepEqual(b.feed, a.feed);
    assert.equal(b.res.rp, a.res.rp);
});

test('the kinds the model can read follow its skills: numbers with Embeddings, pictures with Edge Detection', () => {
    const at = name => ({ path: { learned: E.SKILLS.findIndex(k => k.name === name) + 1 } });
    assert.deepEqual(E.feedReadable({ path: { learned: 0 } }), []);
    assert.deepEqual(E.feedReadable(at('Pattern Matching')), []);
    assert.deepEqual(E.feedReadable(at('Embeddings')), ['numbers']);
    assert.deepEqual(E.feedReadable(at('Edge Detection')), ['numbers', 'pictures']);
    // Learning the skill brings the tiles left behind back, on the next step.
    const s = E.defaultState(NOW);
    E.feedDeliver(s, { sector: 2, packets: 30, gold: 0 });
    for (let i = 0; i < 400 && s.feed.layers === 0; i++) { E.feedPoint(s, all(s.feed)); E.feedStep(s, 0.5); }
    const kept = s.feed.locked.reduce((n, e) => n + e.n, 0);
    assert.ok(kept > 0);
    assert.equal(Feed.left(s.feed), 0);
    s.path.learned = at('Embeddings').path.learned;
    E.feedStep(s, 0.01);
    assert.deepEqual(s.feed.readable, ['numbers']);
    assert.deepEqual(s.feed.locked, []);
    assert.equal(Feed.left(s.feed), kept);
});

test('junk in the save is cleaned', () => {
    const fresh = E.defaultState(NOW).feed;
    for (const bad of [null, 5, 'x', [], true]) assert.deepEqual(E.migrate({ version: E.SAVE_VERSION, feed: bad }, NOW).feed, fresh);
    const junk = {
        rs: -4, layers: 2.9, mites: 5000, bite: 1e9, dry: 'yes', size: 7, cols: -1, free: 99,
        tiles: [{ k: 'plain', b: 1, q: 1, s: 0, e: 0 }],   // the wrong size for layer 2: dropped
        line: [0, 0, 'x'], backlog: [{ sector: -2, n: 5.7, gold: 'x' }, { n: 0 }, null, { sector: 3, n: 4, gold: 2, kind: 'pictures' }, { sector: 2, n: 1, kind: 'spoons' }],
        locked: [{ kind: 'numbers', sector: 2, n: 3 }, { kind: 'plain', sector: 1, n: 9 }, { kind: 'numbers', n: -1 }],
        readable: ['pictures', 'plain', 7], fragNext: 99, fragments: { parcel: [0, 0, 9, 'a', 2], other: [1] },
        stats: { delivered: 12.5, eaten: -1, research: 1e300, extra: 4 },
    };
    const f = E.migrate({ version: E.SAVE_VERSION, feed: junk }, NOW).feed;
    assert.equal(f.layers, 2);
    assert.equal(f.mites, 3, 'never more mites than the layers cleared could have given');
    assert.equal(f.bite, 0);
    assert.equal(f.dry, false);
    assert.equal(f.size, Feed.layerSize(2));
    assert.equal(f.tiles.length, f.size);
    assert.ok(f.tiles.every(t => t === null));
    assert.equal(f.free, f.size);
    assert.deepEqual(f.line, []);
    assert.deepEqual(f.backlog, [{ sector: 1, n: 5, gold: 0 }, { sector: 3, n: 4, gold: 0, kind: 'pictures' }, { sector: 2, n: 1, gold: 0 }]);
    assert.deepEqual(f.locked, [{ kind: 'numbers', sector: 2, n: 3 }]);
    assert.deepEqual(f.readable, ['pictures']);
    assert.equal(f.fragNext, 4);
    assert.deepEqual(f.fragments, { parcel: [0, 2] });
    assert.deepEqual(f.stats, { delivered: 12, eaten: 0, research: 1e15, veins: 0 });
    // It still plays.
    assert.ok(Feed.deliver(f, { sector: 1, packets: 10, gold: 0 }).added > 0);
});

test('bad tiles in a tray of the right size are dropped one by one, and the rest kept', () => {
    const s = E.defaultState(NOW);
    E.feedDeliver(s, { sector: 1, packets: 30, gold: 4 });
    const raw = JSON.parse(JSON.stringify(s));
    const frag = raw.feed.tiles.findIndex(t => t.k === 'fragment');
    const spare = raw.feed.tiles.map((t, i) => i).filter(i => i !== frag);
    raw.feed.tiles[spare[0]] = { k: 'spoons', b: 1 };
    raw.feed.tiles[spare[1]] = 'x';
    raw.feed.tiles[spare[2]] = { k: 'plain', b: -5, q: 1e9, s: 7, e: 0 };
    raw.feed.tiles[frag] = { k: 'fragment', set: 'nope', piece: 0, b: 1, q: 1 };
    raw.feed.line = [spare[0], spare[2], spare[2], 999, spare[3]];
    const f = E.migrate(raw, NOW).feed;
    assert.equal(f.tiles[spare[0]], null);
    assert.equal(f.tiles[spare[1]], null);
    assert.equal(f.tiles[frag], null);
    assert.deepEqual(f.tiles[spare[2]], { k: 'plain', b: 1, q: 99, s: 1, e: 0 });
    assert.equal(f.free, 3);
    assert.deepEqual(f.line, [spare[2], spare[3]]);
    assert.equal(Feed.left(f), 27);
});
