// The Feed's tanks, corruption, frenzy, caches, bolder cards and the squad (the owner's calls, 2026-11-16): a session opens on
// its sector's tank full to the stockpile's level and what is left stays; garbled sand spreads in a session; keeping the
// swarm eating heats it into a frenzy; buried caches crack for research and a card; you choose which mites come.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');
const E = require('../engine.js');

const fresh = () => Feed.sessions(Feed.newFeed({ seed: 21 }));
const tank = (load, opts) => { const s = fresh(); Feed.deliver(s, load); Feed.deliver(s, load); Feed.deliver(s, load); Feed.startSession(s, load.sector || 1, opts); return s; };
const count = (s, kind) => s.cells.filter(v => Feed.kindOf(v) === kind).length;
// Lead the swarm to the highest good grain (the way a player works a full tank from the top).
const lead = s => { for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && Feed.kindOf(s.cells[i]) !== 6) { Feed.point(s, { x: i % s.w + 0.5, y: Math.floor(i / s.w) + 0.5 }); return; } Feed.point(s, null); };
const play = (s, seconds, how = 'lead') => { const ev = []; for (let t = 0; t < seconds * 10 && s.session && !s.session.wait; t++) { if (s.session.offer) Feed.pickCard(s, 0); if (how === 'lead') lead(s); else Feed.point(s, null); ev.push(...Feed.step(s, 0.1).events); } return ev; };

test('what is left in a tank stays for next time, garbled sand and all, and counts against the stockpile', () => {
    const s = tank({ sector: 2, packets: 100, gold: 10, garbled: 20 });
    play(s, 4);
    const r = Feed.endSession(s, 'left');
    const back = Feed.stockOf(s, 2);
    assert.ok(back > 100 && back === r.left, `${back} packets stay`);
    assert.ok(s.stock[2].bad >= 15, 'the garbled sand stayed');
    // The next session opens on what was left.
    Feed.startSession(s, 2);
    assert.ok(Math.abs(s.grains / Feed.FEED.grains - back) < 1, 'the tank is as it was left');
    // While a session holds the tank, a run's packets only fill what the tank has room for.
    const cap = Feed.stockCap(s, 2), out = Feed.deliver(s, { sector: 2, packets: 100 });   // (a run no better than the others: the cap stays)
    assert.ok(out.held <= cap && Math.abs(out.held - cap) <= 2, `held ${out.held} of ${cap}`);
});

test('corruption: in a session garbled sand turns good sand garbled; a scrubber wards the sand round it; never outside a session', () => {
    const load = { sector: 2, packets: 150, gold: 10, garbled: 40 };
    const idle = s => { const ev = []; for (let t = 0; t < 1200; t++) ev.push(...Feed.step(s, 0.1, { chew: 0, hungerTime: 1e6 }).events); return ev; };
    const a = tank(load), bad0 = count(a, 6);
    const ev = idle(a);
    assert.ok(count(a, 6) > bad0 * 1.06, `garbled ${bad0} → ${count(a, 6)}`);
    assert.ok(ev.some(e => e.type === 'corrupt' && e.n > 0 && e.pts.length));
    assert.equal(a.session.corrupted, count(a, 6) - bad0);
    // A scrubber parked in the tank: nothing turns within its ward, while the same spot without one does turn.
    const turned = squad => {
        const t = tank(load, { squad }), m = t.swarm[0], x = (t.x0 + t.x1) / 2, y = t.h - 30;
        const was = t.cells.map(v => Feed.kindOf(v));
        for (let n = 0; n < 1600; n++) { for (const q of t.swarm) { q.x = x; q.y = y; } Feed.step(t, 0.1, { chew: 0, speed: 0, hungerTime: 1e6 }); }
        let near = 0; t.cells.forEach((v, i) => { if (Feed.kindOf(v) === 6 && was[i] !== 6 && Math.hypot(i % t.w + 0.5 - x, Math.floor(i / t.w) + 0.5 - y) <= Feed.FEED.ward) near++; });
        return near;
    };
    assert.ok(turned(['grazer']) > 0, 'without a scrubber some turns there');
    assert.equal(turned(['scrubber']), 0, 'with one, none');
    // Outside a session nothing turns.
    const s = fresh(); Feed.deliver(s, load);
    assert.deepEqual(Feed.step(s, 30), { research: 0, events: [] });
});

test('a scrubber decodes garbled sand into good sand, which then pays', () => {
    const s = tank({ sector: 2, packets: 40, garbled: 60 }, { squad: ['scrubber'] });
    const bad0 = count(s, 6);
    const ev = play(s, 20, 'graze');
    assert.ok(ev.some(e => e.type === 'decode'), 'it decoded');
    assert.ok(s.stats.decoded > 50 && count(s, 6) < bad0, `decoded ${s.stats.decoded}`);
});

test('the frenzy: led onto good sand the swarm heats up tier by tier; left to graze it cools; tiers pay more', () => {
    const s = tank({ sector: 1, packets: 400, gold: 20 });
    const ev = play(s, 18);
    const tiers = ev.filter(e => e.type === 'frenzy');
    assert.ok(tiers.some(e => e.tier >= 2), `it reached tier ${Math.max(0, ...tiers.map(e => e.tier))}`);
    const hot = s.session.tier;
    play(s, 12, 'graze');
    assert.ok(s.session.tier < hot, 'grazing cools it');
    // A tier's pay: +25% each.
    s.session.tier = 2;
    const two = Feed.tierOf(s);
    assert.equal(two, 2);
    // Adrenaline builds it twice as fast.
    const heat = cards => { const t = tank({ sector: 1, packets: 400 }); Object.assign(t.session.cards, cards); play(t, 3); return t.session.heat; };
    assert.ok(heat({ adrenaline: 1 }) > heat({}) * 1.5);
});

test('a tapped point builds the frenzy on dirty sand too (the bar at 0.3, the owner\'s call)', () => {
    const s = tank({ sector: 2, packets: 400, gold: 25, garbled: 40 });
    let peak = 0;
    for (let t = 0; t < 600 && s.session && !s.session.wait; t++) {
        if (s.session.offer) Feed.pickCard(s, 0);
        if (t % 25 === 0) { for (let i = 0; i < s.cells.length; i++) if (s.cells[i] && Feed.kindOf(s.cells[i]) !== 6) { Feed.mark(s, { x: i % s.w + 0.5, y: Math.floor(i / s.w) + 0.5 }); break; } }
        Feed.step(s, 0.1);
        if (s.session) peak = Math.max(peak, s.session.tier || 0);
    }
    assert.ok(peak >= 1, `peak tier ${peak}`);
});

test('buried caches: hidden knots deep in the tank that crack whole for research and a free card', () => {
    const s = tank({ sector: 1, packets: 200 });
    const knots = count(s, 7);
    assert.ok(knots > 20, `cache grains: ${knots}`);
    assert.ok(s.cells.every(v => Feed.kindOf(v) !== 7 || !Feed.seenOf(v)), 'hidden');
    // They lie low: below the upper part of the sand.
    let top = s.h; s.cells.forEach((v, i) => { if (v) top = Math.min(top, Math.floor(i / s.w)); });
    s.cells.forEach((v, i) => { if (Feed.kindOf(v) === 7) assert.ok(Math.floor(i / s.w) >= top + (s.h - top) * 0.4 - Feed.FEED.cacheR); });
    const ev = play(s, 240);
    const cracks = ev.filter(e => e.type === 'cache');
    assert.ok(cracks.length >= 1 && cracks.every(e => e.pay > 0 && e.grains >= Feed.FEED.cacheBits), 'cracked whole');
    assert.equal(cracks.length, s.stats.caches);
    assert.ok(ev.filter(e => e.type === 'offer').length >= cracks.length, 'each gave a card');
});

test('eating a tank bare pays a lump once; the result says how much was cleared', () => {
    const s = tank({ sector: 1, packets: 30 });
    const ev = play(s, 120);
    const clear = ev.filter(e => e.type === 'tankClear'), over = ev.find(e => e.type === 'over');
    assert.equal(clear.length, 1);
    assert.ok(clear[0].pay > 0);
    assert.equal(over.why, 'empty');
    assert.deepEqual([over.cleared, over.left], [100, 0]);
});

test('bolder cards: every offer holds a tool or a combo while one can be offered; trade-offs give and take', () => {
    const s = tank({ sector: 1, packets: 400 });
    let offers = 0;
    for (let t = 0; t < 3000 && s.session && offers < 6; t++) {
        lead(s);
        const ev = Feed.step(s, 0.1).events;
        if (s.session && s.session.offer) { offers++; assert.ok(s.session.offer.some(id => Feed.CARDS[id].rare), s.session.offer.join()); Feed.pickCard(s, 1); }
        if (ev.some(e => e.type === 'over')) break;
    }
    assert.ok(offers >= 3);
    const t = tank({ sector: 1, packets: 100 });
    t.session.cards = { glutton: 1 };
    assert.ok(Feed.cardMult(t, 'chew') > 1.5 && Feed.cardMult(t, 'hungerTime') < 1);
    const before = t.mites; t.session.offer = ['brood']; t.session.picks = 1; Feed.pickCard(t, 0);
    assert.equal(t.mites, before + 2, 'brood: two more mites now');
});

test('the squad: mites come in the squad\'s order; kinds open as the game goes on; a save keeps the squad', () => {
    const s = tank({ sector: 1, packets: 100 }, { squad: ['prospector', 'driller'] });
    assert.deepEqual(s.swarm.map(m => Feed.miteKindOf(m.c)), ['prospector', 'driller']);
    assert.deepEqual(Feed.clean(JSON.parse(JSON.stringify(s))).squad, ['prospector', 'driller']);
    assert.deepEqual(Feed.setSquad(s, ['zap', 'grazer', 'grazer', 'scrubber', 'chomper'], {}), ['grazer', 'scrubber'], 'two kinds, no repeats, no junk');
    // A driller makes short work of tough sand.
    const eat = squad => { const t = tank({ sector: 4, packets: 150 }, { squad }); const from = t.grains; play(t, 6); return from - t.grains; };
    assert.ok(eat(['driller']) > eat(['grazer']) * 1.5);
    // The game opens kinds: a grazer at first; more with the second sector, a skill and the bosses.
    E.setRing(true);
    try {
        const g = E.defaultState(Date.now());
        assert.deepEqual(E.feedMiteKinds(g), ['grazer']);
        assert.equal(E.feedSquadSlots(g), 2);
        g.snare.sector = 1;
        assert.deepEqual(E.feedMiteKinds(g), ['grazer'], 'the scrubber waits for the first boss (the owner\'s call), not sector 2');
        g.path.learned = E.SKILL_INDEX['Pattern Matching'] + 1; g.snare.bosses = 1;
        assert.deepEqual(E.feedMiteKinds(g), ['grazer', 'prospector', 'scrubber', 'driller']);
        assert.equal(E.feedSquadSlots(g), 3);
        assert.deepEqual(E.feedSquad(g, ['chomper', 'driller']), ['driller'], 'a kind not open yet is left out');
        E.feedDeliver(g, { sector: 1, packets: 40 });
        assert.equal(E.feedStart(g, 1), true);
        assert.ok(g.feed.swarm.every(m => Feed.miteKindOf(m.c) === 'driller'));
        assert.equal(E.SAVE_VERSION, 45);
        assert.deepEqual(E.migrate(JSON.parse(JSON.stringify(g)), Date.now()).feed.squad, ['driller']);
    } finally { E.setRing(false); }
});

test('the first sessions come in stages: splits and mites, then cards, then the frenzy and the caches', () => {
    const s = fresh();
    const session = () => { Feed.deliver(s, { sector: 1, packets: 400 }); Feed.startSession(s, 1, { staged: true }); const ev = play(s, 70); const r = Feed.endSession(s, 'left'); return { ev, r }; };
    // Session 1: a split adds a mite, but offers no card; no frenzy; no cache lies in the tank.
    Feed.deliver(s, { sector: 1, packets: 400 }); Feed.startSession(s, 1, { staged: true });
    assert.equal(s.session.stage, 1);
    assert.equal(count(s, 7), 0, 'no caches');
    const one = play(s, 70);
    assert.ok(one.some(e => e.type === 'layer') && s.mites > 2, 'it split');
    assert.equal(one.some(e => e.type === 'offer' || e.type === 'frenzy'), false);
    assert.equal(Feed.endSession(s, 'left').stage, 1);
    // Session 2: cards, still no frenzy or caches.
    Feed.deliver(s, { sector: 1, packets: 400 }); Feed.startSession(s, 1, { staged: true });
    assert.equal(s.session.stage, 2);
    assert.equal(count(s, 7), 0);
    const two = play(s, 70);
    assert.ok(two.some(e => e.type === 'offer'));
    assert.equal(two.some(e => e.type === 'frenzy'), false);
    Feed.endSession(s, 'left');
    // Session 3 on: everything.
    const three = session();
    assert.equal(three.r.stage, 3);
    assert.ok(three.ev.some(e => e.type === 'frenzy'));
    Feed.deliver(s, { sector: 1, packets: 400 }); Feed.startSession(s, 1, { staged: true });
    assert.ok(count(s, 7) > 0, 'caches');
    // A session that never reached a split doesn't count; a save keeps the count; without `staged`, everything.
    const t = fresh(); Feed.deliver(t, { sector: 1, packets: 100 }); Feed.startSession(t, 1, { staged: true }); play(t, 2); Feed.endSession(t, 'left');
    assert.equal(Feed.stageOf(t), 1);
    assert.equal(Feed.clean(JSON.parse(JSON.stringify(s))).played, s.played);
    Feed.deliver(t, { sector: 1, packets: 100 }); Feed.startSession(t, 1);
    assert.equal(t.session.stage, 3);
    // A save from before the stages that has played sessions has seen everything.
    const old = JSON.parse(JSON.stringify(fresh())); delete old.played; old.stats.sessions = 4;
    assert.equal(Feed.stageOf(Feed.clean(old)), 3);
    // The game stages a new player's sessions; the playground has everything.
    E.setRing(true);
    try {
        const g = E.defaultState(Date.now());
        E.feedDeliver(g, { sector: 1, packets: 60 });
        E.feedStart(g, 1);
        assert.equal(g.feed.session.stage, 1);
    } finally { E.setRing(false); }
});

test('a tank in play saves and loads exactly, and plays on the same', () => {
    const s = tank({ sector: 2, packets: 200, gold: 20, garbled: 30 }, { squad: ['scrubber', 'grazer'] });
    play(s, 6);
    const back = Feed.clean(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(s)));
    lead(s); lead(back);
    assert.deepEqual(Feed.step(back, 3), Feed.step(s, 3));
});
