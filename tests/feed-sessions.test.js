// The Feed's sessions (design/ring.md → The Feed's sessions; the owner's cards, 2026-11-14): sand is stockpiled by
// sector with a cap, nothing eats outside a session, a session plays one stockpile and ends on hunger or when the sand
// is gone, and research and fragments are what it leaves.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const E = require('../engine.js');

const fresh = () => Feed.sessions(Feed.newFeed({ seed: 7 }));
const run = (s, seconds, lead) => { const all = { research: 0, events: [] }; for (let t = 0; t < seconds * 10 && (s.session || t === 0); t++) { if (lead && s.session) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); } const o = Feed.step(s, 0.1); all.research += o.research; all.events.push(...o.events); } return all; };
test.afterEach(() => E.setRing(false));

test('stockpiles: a run goes to its sector, up to three of your best run there; the rest is lost', () => {
    const s = fresh();
    let o = Feed.deliver(s, { sector: 2, packets: 40, gold: 4, garbled: 6 });
    assert.deepEqual([o.stocked, o.lost, o.cap, o.full], [46, 0, 120, false]);
    assert.deepEqual(s.stock[2], { n: 36, gold: 4, bad: 6 });
    assert.equal(s.grains, 0, 'nothing pours outside a session');
    o = Feed.deliver(s, { sector: 2, packets: 40 });
    o = Feed.deliver(s, { sector: 2, packets: 40 });
    assert.deepEqual([o.stocked, o.lost, o.held, o.full], [34, 6, 120, true]);
    assert.equal(Feed.deliver(s, { sector: 2, packets: 30 }).lost, 30, 'a full stockpile takes no more');
    // a better run raises the cap, and another sector has room of its own
    assert.equal(Feed.deliver(s, { sector: 2, packets: 100 }).cap, 300);
    assert.equal(Feed.deliver(s, { sector: 1, packets: 10 }).cap, Feed.FEED.stockMin);
    assert.deepEqual(Feed.stockList(s).map(e => [e.sector, e.total, e.cap]), [[1, 10, 60], [2, 220, 300]]);
    assert.equal(s.stats.lost, 36);
});

test('nothing eats outside a session; a session plays one stockpile and its hunger bar ends it', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) Feed.deliver(s, { sector: 1, packets: 150 });
    assert.deepEqual(Feed.step(s, 30), { research: 0, events: [] });
    assert.equal(Feed.startSession(s, 2), false, 'nothing stockpiled there');
    assert.equal(Feed.startSession(s, 1), true);
    assert.equal(Feed.startSession(s, 1), false, 'one at a time');
    assert.deepEqual([s.stock[1], s.session.sector, s.mites, s.life], [undefined, 1, 1, 1]);
    // Left alone on a big stockpile the swarm grazes too slowly to keep the bar up: the session ends on hunger.
    const out = run(s, 400, false);
    const over = out.events.find(e => e.type === 'over');
    assert.ok(over && over.why === 'hunger', 'it starved');
    assert.ok(over.time >= Feed.FEED.hungerTime && over.time < 400);
    assert.deepEqual([s.session, s.grains, s.mites, s.layers], [null, 0, 1, 0], 'the box is cleared and the swarm is one mite again');
    assert.equal(s.lastSession.why, 'hunger');
    assert.ok(out.research > 0 && s.stats.research === out.research, 'what it ate is kept');
});

test('led, the swarm keeps its hunger up, splits, and the session ends when the sand is gone', () => {
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 60 });
    Feed.startSession(s, 1);
    const out = run(s, 200, true);
    const over = out.events.find(e => e.type === 'over');
    assert.ok(over, 'it ended');
    assert.equal(over.why, 'empty');
    assert.ok(over.layers >= 1 && over.mites === over.layers + 1, 'it split on the way');
    assert.ok(over.research >= 60, 'the stockpile was eaten');
    assert.equal(over.record, true);
    assert.equal(s.record[1], over.layers);
});

test('a deeper sector pays more for the same sand, and ending a session yourself returns what had not poured', () => {
    const pay = sector => { const s = fresh(); Feed.deliver(s, { sector, packets: 20 }); Feed.startSession(s, sector); return run(s, 400, true).research; };
    assert.ok(pay(2) > pay(1) * 1.3, 'sector 2 pays half as much again');
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 2000 });
    Feed.deliver(s, { sector: 1, packets: 2000 });
    Feed.startSession(s, 1);
    Feed.step(s, 5);
    const poured = 4000 - s.backlog.reduce((n, e) => n + e.n + e.gold + e.bad, 0);
    assert.ok(poured > 0 && poured < 4000);
    const r = Feed.endSession(s, 'left');
    assert.equal(r.why, 'left');
    assert.equal(Feed.stockOf(s, 1), 4000 - poured, 'the unpoured sand is back in the stockpile');
});

test('a save keeps the stockpiles and a session in play, exactly; junk is cleaned; an old pile becomes a stockpile', () => {
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 60 });
    Feed.deliver(s, { sector: 3, packets: 25, gold: 5 });
    Feed.startSession(s, 1);
    Feed.step(s, 6);
    const back = Feed.clean(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(s)));
    const a = Feed.step(s, 4), b = Feed.step(back, 4);
    assert.deepEqual(b, a, 'and carries on the same');
    const junk = Feed.clean({ sessioned: true, stock: { 2: { n: -5, gold: 'x', bad: 3 }, zap: { n: 9 } }, best: { 2: 1e99 }, session: { sector: 'no' }, life: 9 });
    assert.deepEqual([junk.stock, junk.session, junk.life, junk.best[2]], [{ 2: { n: 0, gold: 0, bad: 3 } }, null, 1, 1e8]);
    // A pile from before sessions: its box and backlog go into stockpiles, and nothing is in play.
    const old = Feed.newFeed({ seed: 3 });
    Feed.deliver(old, { sector: 2, packets: 50 });
    Feed.step(old, 2);
    Feed.sessions(old);
    assert.equal(old.grains, 0);
    assert.equal(Feed.stockOf(old, 1) + Feed.stockOf(old, 2), 50);
});

test('the ring turns sessions on: runs stockpile, research comes only from a session; the old game\'s Feed is as it was', () => {
    E.setRing(true);
    const s = E.defaultState(Date.now());
    const out = E.feedDeliver(s, { sector: 1, packets: 30 });
    assert.equal(s.feed.sessioned, true);
    assert.equal(out.stocked, 30);
    for (let i = 0; i < 100; i++) E.feedStep(s, 0.5);
    assert.equal(s.res.rp, 0, 'nothing eats outside a session');
    assert.equal(E.feedStart(s, 1), true);
    for (let i = 0; i < 100 && s.feed.session; i++) E.feedStep(s, 0.5);
    assert.ok(s.res.rp > 0, 'a session pays research');
    assert.equal(E.migrate(JSON.parse(JSON.stringify(s)), Date.now()).feed.sessioned, true);
    assert.ok(E.SAVE_VERSION >= 42);
    E.setRing(false);
    const old = E.defaultState(Date.now());
    E.feedDeliver(old, { sector: 1, packets: 30 });
    assert.equal(old.feed.sessioned, false);
    assert.ok(old.feed.backlog.length > 0, 'the old Feed pours as before');
});
