// The Feed in the save (engine.js `state.feed`, save v38) and the ring's switch (`E.setRing`). Build 1 of
// design/ring-build.md.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const Feed = require('../feed.js');
const NOW = 1_700_000_000_000;
const { w: W, h: H, grains: G } = Feed.FEED;
const skillsTo = name => E.SKILLS.findIndex(k => k.name === name) + 1;
// Leads the swarm at the lowest grain until the pile is gone. Returns the research paid.
function eatAll(s) {
    let paid = 0;
    for (let i = 0; i < 20000 && Feed.left(s.feed) > 0; i++) {
        const at = s.feed.cells.findLastIndex(v => v);
        E.feedPoint(s, at < 0 ? null : { x: at % W + 0.5, y: Math.floor(at / W) + 0.5 });
        paid += E.feedStep(s, 0.1).research;
    }
    E.feedPoint(s, null);
    return paid;
}

test('the ring\'s switch is off unless it is turned on, and turns off again', () => {
    assert.equal(E.isRing(), false);
    E.setRing(true);
    assert.equal(E.isRing(), true);
    E.setRing(0);
    assert.equal(E.isRing(), false);
});

test('a new game and a save from before The Feed both start it empty: one mite over an empty box', () => {
    const s = E.defaultState(NOW);
    assert.equal(s.feed.mites, 1);
    assert.equal(s.feed.layers, 0);
    assert.equal(s.feed.cells.length, W * H);
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
    assert.equal(E.feedDeliver(s, { sector: 1, packets: 40, gold: 0 }).added, 40 * G);
    const paid = eatAll(s);
    assert.equal(s.feed.layers, 1);
    assert.equal(s.feed.mites, 2, 'the first layer digested gives the first new mite');
    assert.equal(s.res.rp, paid);
    assert.equal(paid, Math.floor((40 * G - 1 + 2) / G + 6), 'letter grains and a fragment at a grain\'s share each, and the layer\'s lump');
    assert.ok(Number.isInteger(s.res.rp));
});

test('a pile half eaten comes back from a save exactly, and plays on the same', () => {
    const a = E.defaultState(NOW);
    E.feedDeliver(a, { sector: 2, packets: 70, gold: 6, garbled: 5 });
    E.feedPoint(a, { x: 30.5, y: H - 1.5 });
    E.feedStep(a, 9.3);
    const b = E.migrate(JSON.parse(JSON.stringify(a)), NOW);
    assert.deepEqual(b.feed, a.feed);
    assert.equal(b.res.rp, a.res.rp);
    const play = s => { const out = []; for (let i = 0; i < 300; i++) { if (i % 60 === 40) E.feedPoint(s, null); if (i % 60 === 0) E.feedPoint(s, { x: 20 + i % 25, y: H - 3 }); out.push(E.feedStep(s, 0.2)); if (i === 150) out.push(E.feedDeliver(s, { sector: 3, packets: 90, gold: 9, popped: 6 })); } return out; };
    assert.deepEqual(play(b), play(a));
    assert.deepEqual(b.feed, a.feed);
    assert.equal(b.res.rp, a.res.rp);
});

test('the kinds the model can read follow its skills: numbers with Embeddings, pictures with Edge Detection', () => {
    const at = name => ({ path: { learned: skillsTo(name) } });
    assert.deepEqual(E.feedReadable({ path: { learned: 0 } }), []);
    assert.deepEqual(E.feedReadable(at('Pattern Matching')), []);
    assert.deepEqual(E.feedReadable(at('Embeddings')), ['numbers']);
    assert.deepEqual(E.feedReadable(at('Edge Detection')), ['numbers', 'pictures']);
    // Learning the skill turns that sand good on the next step: quick to eat, and it pays.
    const s = E.defaultState(NOW);
    E.feedDeliver(s, { sector: 2, packets: 80, gold: 0 });
    Feed.step(s.feed, 15, { chew: 0 });
    const slow = v => v && Feed.KIND_IDS[Feed.kindOf(v)] === 'numbers';
    assert.ok(s.feed.cells.filter(slow).length > 20);
    assert.ok(s.feed.cells.filter(slow).every(v => Feed.hpOf(v) === 2 * Feed.FEED.slow));
    s.path.learned = skillsTo('Embeddings');
    E.feedStep(s, 0.01);
    assert.deepEqual(s.feed.readable, ['numbers']);
    assert.ok(s.feed.cells.filter(slow).every(v => Feed.hpOf(v) <= 2));
    eatAll(s);
    assert.equal(s.feed.stats.cleaned, 0);
});

test('junk in the save is cleaned', () => {
    const fresh = E.defaultState(NOW).feed;
    for (const bad of [null, 5, 'x', [], true]) assert.deepEqual(E.migrate({ version: E.SAVE_VERSION, feed: bad }, NOW).feed, fresh);
    // A box of the wrong size (the first cut's grid of tiles, say): emptied, with what was earned kept.
    const old = { rs: 9, layers: 2.9, mites: 5000, size: 97, cols: 10, tiles: [{ k: 'plain', b: 1 }], line: [0], backlog: [{ sector: 1, n: 5, gold: 0 }],
        readable: ['pictures', 'plain', 7], fragNext: 99, fragments: { parcel: [0, 0, 9, 'a', 2], other: [1] }, stats: { delivered: 12.5, eaten: -1, research: 1e300, extra: 4 } };
    const f = E.migrate({ version: E.SAVE_VERSION, feed: old }, NOW).feed;
    assert.equal(f.layers, 2);
    assert.equal(f.mites, 3, 'never more mites than the layers digested could have given');
    assert.equal(f.swarm.length, 3);
    assert.equal(f.grains, 0);
    assert.ok(f.cells.length === W * H && f.cells.every(v => v === 0));
    assert.deepEqual(f.backlog, []);
    assert.deepEqual(f.readable, ['pictures']);
    assert.equal(f.fragNext, 4);
    assert.deepEqual(f.fragments, { parcel: [0, 1, 2, 3] });
    assert.deepEqual(f.stats, { delivered: 12, eaten: 0, cleaned: 0, research: 1e15, veins: 0 });
    assert.equal(f.tiles, undefined);
    // It still plays.
    assert.ok(Feed.deliver(f, { sector: 1, packets: 10, gold: 0 }).added > 0);
    assert.ok(Feed.step(f, 5).events.length >= 0);
});

test('bad cells, mites and counts in a box of the right size are cleaned one by one, and the rest kept', () => {
    const s = E.defaultState(NOW);
    E.feedDeliver(s, { sector: 1, packets: 30, gold: 4 });
    Feed.step(s.feed, 6, { chew: 0 });
    const raw = JSON.parse(JSON.stringify(s));
    raw.feed.cells = Feed.unpack(raw.feed.cells, W * H);
    const full = raw.feed.cells.map((v, i) => (v ? i : -1)).filter(i => i >= 0);
    raw.feed.cells[full[0]] = -3;
    raw.feed.cells[full[1]] = 'x';
    raw.feed.cells[full[2]] = 7;          // no such kind
    raw.feed.cells[full[3]] = 1;          // a grain with no bites left
    raw.feed.cells[0] = 1.5;
    const under = full.find(i => i >= W * 4 && raw.feed.cells[i - W] > 7 && !full.slice(0, 4).includes(i) && !full.slice(0, 4).includes(i - W));
    raw.feed.cells[under] = 0;            // a hole under a grain
    raw.feed.swarm = [{ x: -9, y: 'no', b: 99, t: 1e9 }, { x: 3, y: 3 }];
    raw.feed.backlog = [{ sector: -2, n: 5.7, gold: 'x', bad: 2, band: 99 }, { n: 0 }, null, { sector: 3, n: 4, kind: 'pictures' }, { sector: 2, n: 1, kind: 'spoons' }];
    raw.feed.aim = { x: 1e9, y: 4 };
    raw.feed.owed = -1; raw.feed.fed = 2.5; raw.feed.pourAcc = 'x'; raw.feed.spout = 400; raw.feed.rest = true;
    const f = E.migrate(raw, NOW).feed;
    for (const i of [0, full[0], full[1], full[2], full[3]]) assert.equal(f.cells[i], 0);
    assert.equal(f.grains, 30 * G - 5);
    assert.equal(f.grains, f.cells.filter(Boolean).length);
    assert.equal(f.swarm.length, 1);
    assert.deepEqual(f.swarm[0], { ...Feed.newFeed().swarm[0] });
    assert.deepEqual(f.backlog, [{ sector: 1, n: 5, gold: 0, bad: 2, band: 7 }, { sector: 3, n: 4, gold: 0, bad: 0, band: 0, kind: 'pictures' }, { sector: 2, n: 1, gold: 0, bad: 0, band: 0 }]);
    assert.deepEqual(f.aim, { x: W - 0.01, y: 4 });
    assert.deepEqual([f.owed, f.fed, f.pourAcc, f.spout], [0, 2, 0, 0]);
    assert.equal(f.rest, false, 'a grain hangs over the hole, so it is not at rest');
});
