// The Feed's sessions (design/ring.md → The Feed's sessions; the owner's cards, 2026-11-14): sand is stockpiled by
// sector with a cap, nothing eats outside a session, a session plays one stockpile and ends on hunger or when the sand
// is gone, and research and fragments are what it leaves.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const E = require('../engine.js');

const fresh = () => Feed.sessions(Feed.newFeed({ seed: 7 }));
const run = (s, seconds, lead) => { const all = { research: 0, events: [] }; for (let t = 0; t < seconds * 10 && (s.session || t === 0); t++) { if (s.session && s.session.offer) Feed.pickCard(s, 0); if (lead && s.session) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); } const o = Feed.step(s, 0.1); all.research += o.research; all.events.push(...o.events); } return all; };
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
    Feed.deliver(s, { sector: 1, packets: 5, garbled: 200 });
    assert.deepEqual(Feed.step(s, 30), { research: 0, events: [] });
    assert.equal(Feed.startSession(s, 2), false, 'nothing stockpiled there');
    assert.equal(Feed.startSession(s, 1), true);
    assert.equal(Feed.startSession(s, 1), false, 'one at a time');
    assert.deepEqual([s.stock[1], s.session.sector, s.mites, s.life], [undefined, 1, 1, 1]);
    // Garbled sand does not feed them: left on a pile of it the bar runs out and the session ends on hunger.
    const out = run(s, 400, false);
    const over = out.events.find(e => e.type === 'over');
    assert.ok(over && over.why === 'hunger', 'it starved');
    assert.ok(over.time >= Feed.FEED.hungerTime && over.time < 400);
    assert.deepEqual([s.session, s.grains, s.mites, s.layers], [null, 0, 1, 0], 'the box is cleared and the swarm is one mite again');
    assert.equal(s.lastSession.why, 'hunger');
    assert.equal(s.stats.research, out.research, 'what it ate is kept');
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

// Cards (the owner's cards, 2026-11-14): a split in a session offers three, the session waits, the pick lasts the session.
const toOffer = s => { for (let t = 0; t < 4000 && s.session && !s.session.offer; t++) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); Feed.step(s, 0.1); } return s.session && s.session.offer; };
test('a split offers three different cards and the session waits until one is picked', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) Feed.deliver(s, { sector: 1, packets: 100 });
    Feed.startSession(s, 1);
    const offer = toOffer(s);
    assert.ok(offer, 'a split offered cards');
    assert.equal(offer.length, 3);
    assert.equal(new Set(offer).size, 3);
    assert.ok(offer.every(id => Feed.CARDS[id]));
    const life = s.life, grains = s.grains, time = s.session.time;
    assert.deepEqual(Feed.step(s, 30), { research: 0, events: [] });
    assert.deepEqual([s.life, s.grains, s.session.time], [life, grains, time], 'nothing moves while you choose');
    assert.equal(Feed.pickCard(s, 7), null, 'not a card of the offer');
    const back = Feed.clean(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back.session, s.session, 'a save keeps the offer');
    const out = Feed.pickCard(s, 1);
    assert.deepEqual(out.events, [{ type: 'card', card: offer[1], level: 1 }]);
    assert.deepEqual([s.session.cards, s.session.offer, s.session.picks], [{ [offer[1]]: 1 }, null, 0]);
    Feed.step(s, 1);
    assert.ok(s.session.time > time, 'and it carries on');
});

test('a card does what it says, stacks, and is gone with the session', () => {
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 60 });
    Feed.startSession(s, 1);
    assert.equal(Feed.cardMult(s, 'pay'), 1);
    s.session.cards = { pay: 2, hunger: 1, chew: 1, speed: 1 };
    assert.ok(Math.abs(Feed.cardMult(s, 'pay') - 1.44) < 1e-9);
    // Slow burn: the bar drains a quarter slower.
    const drain = cards => { const t = fresh(); Feed.deliver(t, { sector: 1, garbled: 200 }); Feed.startSession(t, 1); t.session.cards = cards; Feed.step(t, 5); return 1 - t.life; };
    assert.ok(Math.abs(drain({ hunger: 1 }) / drain({}) - 0.8) < 0.01);
    // Rich grain: the same sand pays more.
    const pay = cards => { const t = fresh(); Feed.deliver(t, { sector: 1, packets: 20 }); Feed.startSession(t, 1); t.session.cards = cards; let r = 0; for (let i = 0; i < 4000 && t.session; i++) { if (t.session.offer) Feed.pickCard(t, 0); let top = -1; for (let j = 0; j < t.cells.length; j++) if (t.cells[j]) { top = j; break; } if (top >= 0) Feed.point(t, { x: top % t.w + 0.5, y: Math.floor(top / t.w) + 0.5 }); r += Feed.step(t, 0.1).research; } return r; };
    assert.ok(pay({ pay: 3 }) > pay({}) * 1.5);
    const r = Feed.endSession(s, 'left');
    assert.equal(r.cards, 5);
    Feed.deliver(s, { sector: 1, packets: 60 });
    Feed.startSession(s, 1);
    assert.deepEqual(s.session.cards, {}, 'the next session starts with none');
    const junk = Feed.clean({ ...JSON.parse(JSON.stringify(s)), session: { sector: 1, cards: { pay: -3, zap: 9, chew: 2.7 }, offer: ['zap', 'pay', 'pay', 7], picks: 'x' } });
    assert.deepEqual([junk.session.cards, junk.session.offer, junk.session.picks], [{ chew: 2 }, ['pay'], 1]);
});
