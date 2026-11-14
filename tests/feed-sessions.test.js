// The Feed's sessions (design/ring.md → The Feed's sessions; the owner's cards, 2026-11-14): sand is stockpiled by
// sector with a cap, nothing eats outside a session, a session plays one stockpile and ends on hunger or when the sand
// is gone, and research and fragments are what it leaves.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const E = require('../engine.js');

const fresh = () => Feed.sessions(Feed.newFeed({ seed: 7 }));
const run = (s, seconds, lead) => { const all = { research: 0, events: [] }; for (let t = 0; t < seconds * 10 && (s.session || t === 0); t++) { if (s.session && s.session.offer) Feed.pickCard(s, 0); if (lead && s.session) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && !Feed.airOf(s.cells[i])) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); } const o = Feed.step(s, 0.1); all.research += o.research; all.events.push(...o.events); } return all; };
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
const toOffer = s => { for (let t = 0; t < 4000 && s.session && !s.session.offer; t++) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && !Feed.airOf(s.cells[i])) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); Feed.step(s, 0.1); } return s.session && s.session.offer; };
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
    const pay = cards => { const t = fresh(); Feed.deliver(t, { sector: 1, packets: 20 }); Feed.startSession(t, 1); t.session.cards = cards; let r = 0; for (let i = 0; i < 4000 && t.session; i++) { if (t.session.offer) Feed.pickCard(t, 0); let top = -1; for (let j = 0; j < t.cells.length; j++) if (t.cells[j] && !Feed.airOf(t.cells[j])) { top = j; break; } if (top >= 0) Feed.point(t, { x: top % t.w + 0.5, y: Math.floor(top / t.w) + 0.5 }); r += Feed.step(t, 0.1).research; } return r; };
    assert.ok(pay({ pay: 3 }) > pay({}) * 1.5);
    const r = Feed.endSession(s, 'left');
    assert.equal(r.cards, 5);
    Feed.deliver(s, { sector: 1, packets: 60 });
    Feed.startSession(s, 1);
    assert.deepEqual(s.session.cards, {}, 'the next session starts with none');
    const junk = Feed.clean({ ...JSON.parse(JSON.stringify(s)), session: { sector: 1, cards: { pay: -3, zap: 9, chew: 2.7 }, offer: ['zap', 'pay', 'pay', 7], picks: 'x' } });
    assert.deepEqual([junk.session.cards, junk.session.offer, junk.session.picks], [{ chew: 2 }, ['pay'], 1]);
});

// Tools and combos (the owner's cards, 2026-11-14): rare cards that work on their own; two tools merge into a combo.
const session = (load, cards) => { const s = fresh(); for (let i = 0; i < 3; i++) Feed.deliver(s, load); Feed.startSession(s, load.sector || 1); Object.assign(s.session.cards, cards); return s; };
const play = (s, seconds, lead = true) => { const ev = []; for (let t = 0; t < seconds * 10 && s.session; t++) { if (s.session.offer) Feed.pickCard(s, 0); if (lead) { let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && !Feed.airOf(s.cells[i])) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); } ev.push(...Feed.step(s, 0.1).events); } return ev; };
const mean = (s, kind, axis) => { let n = 0, sum = 0; s.cells.forEach((v, i) => { if (Feed.kindOf(v) === kind) { n++; sum += axis === 'x' ? i % s.w : Math.floor(i / s.w); } }); return n ? sum / n : null; };

test('tool cards are rare, and a combo is offered only once you hold both its tools', () => {
    const s = session({ sector: 1, packets: 100 }, {});
    const offers = [];
    for (let t = 0; t < 6000 && s.session && offers.length < 3; t++) { if (s.session.offer) { offers.push(s.session.offer); Feed.pickCard(s, 0); } let top = -1; for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && !Feed.airOf(s.cells[i])) { top = i; break; } if (top >= 0) Feed.point(s, { x: top % s.w + 0.5, y: Math.floor(top / s.w) + 0.5 }); Feed.step(s, 0.1, { cardRare: 1 }); }
    assert.ok(offers.length >= 2);
    assert.ok(offers[0].every(id => Feed.CARDS[id].tool), 'with the rare chance at 1, every card is a tool');
    assert.ok(offers.flat().every(id => !Feed.CARDS[id].combo || Feed.CARDS[id].combo.every(t => s.session.cards[t] || s.session.cards[id])), 'no combo before its tools');
    // Taking a combo uses its two tools up, every copy; it is one card, made once, and the tools can be picked again.
    const m = session({ sector: 1, packets: 60 }, { scanner: 2, pulse: 1, chew: 1 });
    assert.equal(Feed.toolLevel(m, 'scanner'), 2);
    m.session.offer = ['sonar']; m.session.picks = 1;
    const out = Feed.pickCard(m, 0);
    assert.deepEqual(out.events, [{ type: 'card', card: 'sonar', level: 1, merged: ['scanner', 'pulse'] }]);
    assert.deepEqual(m.session.cards, { chew: 1, sonar: 1 });
    assert.deepEqual([Feed.toolLevel(m, 'scanner'), Feed.toolLevel(m, 'pulse')], [0, 0]);
    Object.assign(m.session.cards, { scanner: 1, pulse: 1, arc: 1 });
    const rare = new Set();
    for (let n = 0; n < 60; n++) { m.session.picks = 1; m.session.offer = null; Feed.step(m, 0.05, { cardRare: 1 }); for (const id of m.session.offer || []) rare.add(id); m.session.offer = null; m.session.picks = 0; }
    assert.ok(!rare.has('sonar'), 'the same combo is not made twice');
    assert.ok(rare.has('storm') && rare.has('tracer'), 'the tools picked again go into other recipes');
    assert.ok(!rare.has('defrag') && !rare.has('magnet'), 'and never a recipe you lack a tool for');
});

test('each tool does its job on its own', () => {
    // Scanner: after a sweep no settled gold is hidden.
    const hidden = s => s.cells.filter((v, i) => Feed.kindOf(v) === 2 && !Feed.seenOf(v) && (i + s.w >= s.cells.length || s.cells[i + s.w])).length;
    const a = session({ sector: 1, packets: 100, gold: 30 }, {}), b = session({ sector: 1, packets: 100, gold: 30 }, { scanner: 1 });
    play(a, 16, false); play(b, 16, false);
    assert.ok(hidden(a) > 20 && hidden(b) < hidden(a) / 4, `scanned ${hidden(b)} against ${hidden(a)}`);
    // Pulse: bursts that eat.
    const p = play(session({ sector: 1, packets: 100 }, { pulse: 1 }), 20).filter(e => e.type === 'pulse');
    assert.ok(p.length >= 2 && p.some(e => e.eaten > 5));
    // Arc: sparks between mites once there are two; the Storm adds bursts.
    const arcs = play(session({ sector: 1, packets: 100 }, { arc: 1 }), 90).filter(e => e.type === 'arc');
    assert.ok(arcs.length > 0, 'arcs fire between mites');
    // Sorter bots and the algo-rhythm, on copies of one settled pile: gold drifts right and garbled left; garbled sinks
    // (rows count down the box).
    const pile = fresh(); Feed.deliver(pile, { sector: 1, packets: 50, gold: 20, garbled: 30 }); Feed.startSession(pile, 1); play(pile, 13, false);
    assert.equal(Feed.waiting(pile), 0);
    const after = cards => { const s = Feed.clean(JSON.parse(JSON.stringify(pile))); Object.assign(s.session.cards, cards); play(s, 10, false); return s; };
    const plain = after({}), sorted = after({ sorter: 2 }), shaken = after({ rhythm: 1 });
    const gap = s => mean(s, 2, 'x') - mean(s, 6, 'x');
    assert.ok(gap(sorted) > gap(plain) + 10, `sorted ${gap(sorted).toFixed(1)} against ${gap(plain).toFixed(1)}`);
    assert.equal(sorted.session.bots.length, 2);
    assert.ok(mean(shaken, 6, 'y') > mean(plain, 6, 'y') + 2, `sunk ${mean(shaken, 6, 'y').toFixed(1)} against ${mean(plain, 6, 'y').toFixed(1)}`);
    const sand = s => s.grains + s.stats.eaten + s.stats.cleaned;
    assert.equal(sand(sorted), sand(plain), 'sorting moves sand, it never makes or loses any');
});

test('each combo is an effect of its own', () => {
    const pile = fresh(); Feed.deliver(pile, { sector: 1, packets: 50, gold: 20, garbled: 40 }); Feed.startSession(pile, 1); play(pile, 14, false);
    const copy = cards => { const s = Feed.clean(JSON.parse(JSON.stringify(pile))); Object.assign(s.session.cards, cards); return s; };
    const count = (s, kind) => s.cells.filter(v => Feed.kindOf(v) === kind).length;
    const spread = (s, at) => { let n = 0, sum = 0; s.cells.forEach((v, i) => { if (Feed.kindOf(v) === 2) { n++; sum += Math.hypot(i % s.w + 0.5 - at.x, Math.floor(i / s.w) + 0.5 - at.y); } }); return sum / n; };
    // Sonar: a ring from the point you hold shows the sand it crosses, then gold is drawn in toward it.
    const at = { x: pile.w / 2, y: pile.h - 6 };
    const so = copy({ sonar: 1 }), plain = copy({});
    Feed.point(so, at); Feed.point(plain, at);
    const ev = []; for (let n = 0; n < 90; n++) { ev.push(...Feed.step(so, 0.1).events); Feed.step(plain, 0.1); }
    const rings = ev.filter(e => e.type === 'sonar');
    assert.ok(rings.length >= 1 && rings[0].pulled > 0, 'a ring went out and drew gold in');
    // Storm: bolts from the mites run through the sand and eat it.
    const bolts = play(copy({ storm: 1 }), 8, false).filter(e => e.type === 'bolt');
    assert.ok(bolts.length >= 2 && bolts.some(b => b.eaten > 5 && b.pts.length > 2));
    // Defrag: clumped garbled sand becomes plain sand; none is made or lost.
    const de = copy({ defrag: 1 }), was = [count(de, 6), count(de, 1), de.grains];
    const fixed = []; for (let n = 0; n < 100; n++) fixed.push(...Feed.step(de, 0.1, { chew: 0 }).events.filter(e => e.type === 'defrag'));
    assert.ok(fixed.length && count(de, 6) < was[0] * 0.7, `garbled ${count(de, 6)} of ${was[0]}`);
    assert.ok(de.grains >= was[2] - 3, "it rewrites sand, it does not eat it");
    // Tracer: sparks from the mites take gold at a distance.
    const tr = copy({ tracer: 1 }), no = copy({});
    const sparks = []; for (let n = 0; n < 60; n++) { sparks.push(...Feed.step(tr, 0.1, { chew: 0 }).events.filter(e => e.type === 'arc')); Feed.step(no, 0.1, { chew: 0 }); }
    assert.ok(sparks.length && sparks.every(e => e.gold) && count(tr, 2) < count(no, 2));
    // Resonance: on each beat a small pulse at every mite, much smaller than a Pulse's.
    const re = play(copy({ resonance: 1 }), 7, false);
    const beats = re.filter(e => e.type === 'shake'), small = re.filter(e => e.type === 'pulse');
    assert.ok(beats.length >= 3 && small.length >= beats.length && small.every(e => e.r < Feed.FEED.pulseR / 2) && beats.some(e => e.eaten > 0));
    // Sifter: gold the beam crosses rises (rows count down the box, so its mean row falls).
    const si = copy({ sifter: 1 }), sn = copy({});
    for (let n = 0; n < 90; n++) { Feed.step(si, 0.1, { chew: 0 }); Feed.step(sn, 0.1, { chew: 0 }); }
    assert.ok(mean(si, 2, 'y') < mean(sn, 2, 'y') - 1.5, `gold at row ${mean(si, 2, 'y').toFixed(1)} against ${mean(sn, 2, 'y').toFixed(1)}`);
    assert.equal(count(si, 2), count(sn, 2));
    // Demolition bots: a charge goes off in the garbled sand.
    const dm = copy({ demolition: 1 }), dn = copy({});
    const blasts = []; for (let n = 0; n < 90; n++) { blasts.push(...Feed.step(dm, 0.1, { chew: 0 }).events.filter(e => e.type === 'pulse')); Feed.step(dn, 0.1, { chew: 0 }); }
    assert.ok(blasts.length >= 2 && dm.session.dbot && count(dm, 6) < count(dn, 6) - 20, `garbled ${count(dm, 6)} against ${count(dn, 6)}`);
    // Relay bots: a chain through the bots eats along its legs.
    const rl = copy({ relay: 1 });
    const legs = []; for (let n = 0; n < 70; n++) legs.push(...Feed.step(rl, 0.1, { chew: 0 }).events.filter(e => e.type === 'arc'));
    assert.ok(legs.length >= 2 && legs.every(e => e.from === 'relay' && e.eaten <= Feed.FEED.relayMax) && legs.some(e => e.eaten > 0) && rl.session.rbots.length === Feed.FEED.relayBots);
    // Drum line: each beat a row of sparks; soft sand is collected, hard sand worn down.
    const dr = copy({ drum: 1 }), hpSum = s => s.cells.reduce((n, v) => n + (Feed.kindOf(v) === 6 ? Feed.hpOf(v) : 0), 0), hp0 = hpSum(dr), g0 = dr.grains;
    const drums = []; for (let n = 0; n < 70; n++) drums.push(...Feed.step(dr, 0.1, { chew: 0 }).events.filter(e => e.type === 'drum'));
    assert.ok(drums.length >= 3 && drums.every(e => e.hits.length > 0 && e.hits.length <= Feed.FEED.drumSparks));
    assert.ok(drums.some(e => e.eaten > 0) && dr.grains < g0, 'soft sand is collected');
    assert.ok(hpSum(dr) < hp0, 'and garbled sand is worn down');
    // Magnet: gold gathers toward the point you hold.
    const ma = copy({ magnet: 1 }), mb = copy({});
    const goal = { x: 20, y: pile.h - 3 };
    Feed.point(ma, goal); Feed.point(mb, goal);
    for (let n = 0; n < 80; n++) { Feed.step(ma, 0.1, { chew: 0 }); Feed.step(mb, 0.1, { chew: 0 }); }
    assert.ok(spread(ma, goal) < spread(mb, goal) - 4, `gold ${spread(ma, goal).toFixed(1)} against ${spread(mb, goal).toFixed(1)} from the point`);
});

test('a save keeps the tools going exactly', () => {
    const s = session({ sector: 1, packets: 100, gold: 20, garbled: 30 }, { scanner: 1, pulse: 1, arc: 1, sorter: 1, rhythm: 1, sonar: 1, storm: 1, defrag: 1, tracer: 1, magnet: 1, resonance: 1, sifter: 1, demolition: 1, relay: 1, drum: 1 });
    play(s, 7.5);
    const back = Feed.clean(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(s)));
    assert.deepEqual(Feed.step(back, 5), Feed.step(s, 5));
});

// The swarm's own mind (the owner's cards, 2026-11-14): mites roam round the point and meander to it, each with a character.
test('led mites keep to their own spots round the point; Focus draws them in; the rare mega mite eats in pairs', () => {
    const spread = cards => {
        const s = fresh(); Feed.deliver(s, { sector: 1, packets: 120 }); Feed.startSession(s, 1); Object.assign(s.session.cards, cards);
        for (let n = 0; n < 150; n++) Feed.step(s, 0.1, { chew: 0 });
        s.mites = 4; while (s.swarm.length < 4) s.swarm.push({ x: 100 + s.swarm.length * 10, y: 300, b: 0, t: -1, c: Feed.CHARACTERS[s.swarm.length], a: 0, ox: 0, oy: 0, rt: 0 });
        const at = { x: s.w / 2, y: s.h - 60 }; let sum = 0, n = 0;
        for (let t = 0; t < 200; t++) { Feed.point(s, at); Feed.step(s, 0.1, { chew: 0, hungerTime: 1e6 }); if (t > 60) for (const m of s.swarm) { sum += Math.hypot(m.x - at.x, m.y - at.y); n++; } }
        return sum / n;
    };
    const loose = spread({}), tight = spread({ focus: 4 });
    assert.ok(loose > 12, `they roam: ${loose.toFixed(1)} cells from the point on average`);
    assert.ok(tight < loose * 0.6, `Focus draws them in: ${tight.toFixed(1)} against ${loose.toFixed(1)}`);
    assert.deepEqual(Feed.CARDS.focus, { stat: 'roam', by: 0.7 });
    // Characters: a new mite's is one of the four, or now and then a mega mite.
    const s = fresh(); for (let i = 0; i < 3; i++) Feed.deliver(s, { sector: 1, packets: 400 }); Feed.startSession(s, 1);
    for (let t = 0; t < 3000 && s.session && s.mites < 5; t++) { if (s.session.offer) Feed.pickCard(s, 0); Feed.step(s, 0.1, { megaChance: 0.5, layerFirst: 4, hungerTime: 1e6 }); }
    assert.ok(s.swarm.length >= 4 && s.swarm.every(m => m.c === 'mega' || Feed.CHARACTERS.includes(m.c)));
    assert.ok(s.swarm.some(m => m.c === 'mega'), 'a mega mite came');
    assert.deepEqual(Feed.clean(JSON.parse(JSON.stringify(s))).swarm, JSON.parse(JSON.stringify(s.swarm)), 'a save keeps who they are');
});

test("characters: the tidy go for garbled sand and the gold-hungry for gold they can see; the rest head for good sand (and still eat what is in their way)", () => {
    const eats = c => {
        const s = fresh(); Feed.deliver(s, { sector: 1, packets: 60, gold: 20, garbled: 60 }); Feed.startSession(s, 1);
        for (let n = 0; n < 160; n++) Feed.step(s, 0.1, { chew: 0, hungerTime: 1e6 });
        for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) s.cells[i] |= 64;   // everything seen
        s.swarm[0].c = c;
        // The point is held on top of the pile, so nothing is eaten only because it was in the way.
        const top = () => { const x = s.w / 2 | 0; for (let y = 0; y < s.h; y++) if (s.cells[y * s.w + x]) return { x: x + 0.5, y: y - 0.5 }; return null; };
        const kinds = {};
        for (let t = 0; t < 250; t++) { Feed.point(s, top()); for (const e of Feed.step(s, 0.1, { miteFirst: 99, hungerTime: 1e6, roam: 0, wobble: 0, near: 50 }).events) if (e.type === 'eat') kinds[e.kind] = (kinds[e.kind] || 0) + 1; }
        const all = Object.values(kinds).reduce((n, v) => n + v, 0) || 1;
        return { gold: (kinds.vein || 0) / all, bad: (kinds.garbled || 0) / all };
    };
    const gold = eats('gold'), tidy = eats('tidy'), loner = eats('loner');
    assert.ok(gold.gold > loner.gold * 1.5, `gold-hungry ${gold.gold.toFixed(2)} gold against ${loner.gold.toFixed(2)}`);
    assert.ok(tidy.bad > loner.bad + 0.1, `tidy ${tidy.bad.toFixed(2)} garbled, loner ${loner.bad.toFixed(2)}`);
});
