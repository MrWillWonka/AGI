// The Feed at the dials the game plays at (the owner's calls, 2026-11-14): faster sand, splits at fixed small counts, two
// mites to start, and carrying a session on to the next stockpile with the swarm, the cards and the hunger bar.
const test = require('node:test');
const assert = require('node:assert');
const Feed = require('../feed.js');

const fresh = () => Feed.sessions(Feed.newFeed({ seed: 11 }));
// Plays until the session waits or ends, leading the swarm to the lowest sand; cards are taken as they come.
function play(s, seconds) {
    const events = [];
    for (let t = 0; t < seconds * 10 && s.session && !s.session.wait; t++) {
        if (s.session.offer) Feed.pickCard(s, 0);
        let at = null; for (let i = s.cells.length - 1; i >= 0; i--) if (s.cells[i]) { at = { x: i % Feed.FEED.w + 0.5, y: Math.floor(i / Feed.FEED.w) + 0.5 }; break; }
        Feed.point(s, at);
        events.push(...Feed.step(s, 0.1).events);
    }
    return events;
}

test('the dials: twice the eating and moving, splits at 15, 23, 34, 51 packets, two mites to start', () => {
    const f = Feed.FEED;
    assert.deepEqual([f.chew, f.speed, f.pour, f.startMites, f.payScale], [4, 360, 16, 2, 0.25]);
    assert.deepEqual([0, 1, 2, 3].map(n => Feed.layerSize(n)), [15, 23, 34, 51]);
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 40 });
    assert.equal(Feed.startSession(s, 1), true);
    assert.equal(s.mites, 2);
    assert.equal(s.swarm.length, 2);
    assert.ok(s.swarm.every(m => Feed.CHARACTERS.includes(m.c)));
});

test('a session splits early: the first split inside 15 seconds on soft sand', () => {
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 200 });
    Feed.startSession(s, 1);
    const events = play(s, 15);
    assert.ok(events.some(e => e.type === 'layer'), 'a split in 15 s');
    assert.ok(s.mites >= 3);
});

test('a pile eaten with other stockpiles waiting: the session waits, and carries on with mites, splits, cards and hunger', () => {
    const s = fresh();
    Feed.deliver(s, { sector: 1, packets: 40 });
    Feed.deliver(s, { sector: 2, packets: 30, gold: 3 });
    Feed.startSession(s, 1);
    const events = play(s, 120);
    assert.ok(s.session && s.session.wait, 'waiting, not over');
    assert.ok(events.some(e => e.type === 'cleared' && e.sector === 1));
    assert.equal(events.some(e => e.type === 'over'), false);
    const before = { mites: s.mites, layers: s.layers, cards: JSON.stringify(s.session.cards), life: s.life, research: s.session.research };
    assert.ok(before.mites > 2 && before.layers >= 1);
    // It waits: no hunger, no eating.
    Feed.step(s, 5);
    assert.equal(s.life, before.life);
    // A save in the wait comes back waiting.
    const back = Feed.clean(JSON.parse(JSON.stringify(Feed.saveable ? Feed.saveable(s) : s)));
    assert.equal(back.session.wait, true);
    assert.equal(Feed.carryOn(s, 1), false, 'nothing left there');
    assert.equal(Feed.carryOn(s, 2), true);
    assert.deepEqual([s.mites, s.layers, JSON.stringify(s.session.cards), s.life, s.session.sector, s.session.piles, s.session.wait], [before.mites, before.layers, before.cards, before.life, 2, 2, false]);
    assert.equal(s.stock[2], undefined);
    // The last pile: the session ends when it is gone (or on hunger), with both piles counted.
    const rest = play(s, 240);
    const over = rest.find(e => e.type === 'over');
    assert.ok(over, 'over');
    assert.equal(over.piles, 2);
    assert.ok(over.research > before.research);
    assert.equal(Feed.carryOn(s, 2), false, 'no session to carry on');
});

test('a stockpile holds three times the average of your best five runs there', () => {
    const s = fresh();
    assert.equal(Feed.FEED.stockTop, 5);
    assert.equal(Feed.deliver(s, { sector: 2, packets: 40 }).cap, 120, 'one run: three of it');
    assert.equal(Feed.deliver(s, { sector: 2, packets: 20 }).cap, 90, 'two runs: three times their average');
    assert.deepEqual(s.tops[2], [40, 20]);
    for (const n of [10, 10, 10, 10]) Feed.deliver(s, { sector: 2, packets: n });
    assert.deepEqual(s.tops[2], [40, 20, 10, 10, 10], 'the best five, best first');
    assert.equal(Feed.stockCap(s, 2), 60, 'never under the least');
    assert.equal(Feed.deliver(s, { sector: 2, packets: 100 }).cap, Math.round(3 * (100 + 40 + 20 + 10 + 10) / 5), 'a better run lifts the average, not the whole target');
    // it survives a save, and a save from before goes by its one best run
    const back = Feed.clean(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back.tops[2], [100, 40, 20, 10, 10]);
    const old = Feed.clean(JSON.parse(JSON.stringify({ ...JSON.parse(JSON.stringify(s)), tops: undefined })));
    assert.equal(Feed.stockCap(old, 2), 300);
});
