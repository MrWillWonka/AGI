// The ring's money story: the desk costs money, which comes by a call from M0M and transfers you may decline.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');

const game = () => { E.setRing(true); const s = E.defaultState(Date.now()); s.intro['mailAccepted:welcome'] = true; return s; };
const up = () => E.UPGRADES.find(u => u.id === 'keyboard');
test.afterEach(() => E.setRing(false));

test('the ring: the desk costs money, not compute, and compute alone buys none of it', () => {
    const s = game();
    s.res.cp = 1e6;
    assert.deepEqual(E.upgradeCost(up(), 0), { cash: E.DESK_PRICES[0] });
    assert.equal(E.formatCost(E.upgradeCost(up(), 0)), `$${E.DESK_PRICES[0]}`);
    assert.equal(E.canAfford(s, E.upgradeCost(up(), 0)), false);
    assert.equal(E.buy(s, 'keyboard').ok, false);
    // No loan to start: each part is bought with compute sold.
    assert.equal(E.fundStep(Object.assign(s, { stats: { ...s.stats, runCp: 1e6 } })), null, 'no call for the desk');
    s.stats.clicks = 30; E.evaluate(s);
    for (let i = 0; i < E.RING_DESK; i++) { assert.equal(E.sellCompute(s, E.DESK_PRICES[i] * E.RING_CP_PER_DOLLAR), E.DESK_PRICES[i]); assert.equal(E.buy(s, 'keyboard').ok, true, `part ${i + 1}`); assert.equal(E.deskCash(s), 0); }
    assert.equal(E.deskDone(s), true);
});

test('the ring: M0M calls when Graphics Cards go on sale (desk built, a Feed session played); then only Mom writes, and her money still comes', () => {
    const s = game();
    s.stats.runCp = 1e5;
    assert.equal(E.fundStep(s), null, 'nothing for compute alone');
    s.levels.keyboard = E.RING_DESK; s.stats.cashSold = E.DESK_PRICES.reduce((a, b) => a + b, 0);
    assert.equal(E.ringCardsOpen(s), false);
    assert.equal(E.fundStep(s), null, 'nor for the desk alone');
    s.feed.stats.sessions = 1;
    assert.equal(E.ringCardsOpen(s), true);
    assert.equal(E.fundStep(s), 'call');
    s.intro['ring:call'] = true;
    assert.equal(E.fundStep(s), 'offer:m0m');
    assert.equal(E.fundDecide(s, 'm0m', true), true);
    assert.equal(E.fundDecide(s, 'm0m', false), false, 'decided once');
    assert.equal(E.deskCash(s), E.RING_DEPOSIT);
    assert.ok(E.upgradeCost(E.UPGRADE_BY_ID.cpu, 0).cash <= E.RING_DEPOSIT, 'it buys the first card');
    assert.equal(E.fundStep(s), 'mail:mom', 'no mail from Dad, no other offer'); s.intro['mail:mom'] = true;
    assert.ok(E.MAIL.find(m => m.id === 'mom').body.some(p => /went through/.test(p)), 'she thinks it already arrived');
    assert.equal(E.fundStep(s), 'deposit:mom', 'her transfer arrives with no question: something is off');
    E.fundDecide(s, 'mom', true);
    assert.equal(E.deskCash(s), 2 * E.RING_DEPOSIT);
    assert.equal(E.fundStep(s), null);
});

test('the ring: M0M declined, Mom\'s own transfer is offered next; taken, that is the end of it', () => {
    const s = game();
    s.stats.runCp = E.RING_CALL_CP; s.intro['ring:call'] = true;
    E.fundDecide(s, 'm0m', false);
    assert.equal(E.fundStep(s), 'mail:mom', 'no mail or offer from Dad'); s.intro['mail:mom'] = true;
    assert.equal(E.fundStep(s), 'offer:mom');
    E.fundDecide(s, 'mom', true);
    assert.equal(E.fundStep(s), null);
    assert.equal(E.deskCash(s), E.RING_DEPOSIT);
});

test('the ring: both declined, nothing more is given; the desk is bought by selling compute', () => {
    const s = game();
    s.stats.runCp = E.RING_CALL_CP; s.intro['ring:call'] = true;
    E.fundDecide(s, 'm0m', false);
    s.intro['mail:mom'] = true;
    assert.equal(E.fundStep(s), 'offer:mom'); E.fundDecide(s, 'mom', false);
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.fundStep(s), null, 'no pay day');
    s.stats.clicks = 40; s.stats.runCp = 40; E.evaluate(s);
    s.res.cp = E.DESK_PRICES[0] * E.RING_CP_PER_DOLLAR;
    assert.equal(E.sellCompute(s, s.res.cp), E.DESK_PRICES[0]);
    assert.equal(E.buy(s, 'keyboard').ok, true);
    assert.equal(E.deskCash(s), 0);
    assert.equal(!!s.intro['mail:dad'], false);
});

test('the ring off: the desk costs compute as ever, and no money story', () => {
    E.setRing(false);
    const s = E.defaultState(Date.now()); s.intro['mailAccepted:welcome'] = true; s.stats.runCp = 1000;
    assert.ok(E.upgradeCost(up(), 0).cp > 0);
    assert.equal(E.fundStep(s), null);
    assert.equal(E.MAIL.find(m => m.id === 'dad').when(s), false);
});

test('the ring: Packet Snare trickles no research of its own, even with Research open (The Feed makes it)', () => {
    const s = game();
    s.snare.best = 300; s.snare.runs = 20; s.unlocked['action:research'] = true;
    assert.equal(E.derive(s).snareRp, 0);
    const before = s.res.rp;
    for (let i = 0; i < 300; i++) E.tick(s, 0.1);
    assert.equal(s.res.rp, before);
    E.setRing(false);
    assert.ok(E.derive(s).snareRp > 0, 'the old game keeps its trickle');
});

test('the ring: compute is sold for money in whole dollars, and Graphics Cards cost money', () => {
    const s = game();
    s.res.cp = 2007;
    assert.equal(E.sellCompute(s, 1e9), 200);
    assert.deepEqual([s.res.cp, E.deskCash(s)], [7, 200]);
    assert.equal(E.sellCompute(s, 9), 0, 'under a dollar is not sold');
    const card = E.UPGRADE_BY_ID.cpu, first = E.upgradeCost(card, 0);
    assert.deepEqual(Object.keys(first), ['cash']);
    assert.equal(first.cash, E.RING_CARD_PRICE);
    assert.equal(E.upgradeCost(card, 10).cash, Math.round(E.RING_CARD_PRICE * Math.pow(E.RING_CARD_GROWTH, 10)));
    assert.equal(E.feedOpen(s), false, 'The Feed waits for its mark'); s.intro['ring:feed'] = true; assert.equal(E.feedOpen(s), true);
    s.levels.cpu = 3;
    assert.equal(E.deskCash(s), 200 - [0, 1, 2].reduce((n, l) => n + E.upgradeCost(card, l).cash, 0));
    // An older ring save's cards are paid for; the old game still sells nothing and prices cards in compute.
    const old = E.migrate({ ...JSON.parse(E.serialize(game())), levels: { cpu: 5 }, stats: { clicks: 9 } }, Date.now());
    assert.equal(E.deskCash(old), 0);
    assert.ok(old.stats.cashSold > 0);
    assert.ok(E.SAVE_VERSION >= 43);
    E.setRing(false);
    assert.ok(E.upgradeCost(card, 0).cp > 0);
    assert.equal(E.sellCompute(E.defaultState(Date.now()), 500), 0);
    E.setRing(true);
});

test('the ring: the phone has a graphics card in it and the tower comes with one, free and unpriced', () => {
    const s = game();
    assert.equal(E.ringFreeCards(s), 0, 'nothing runs before the Lab is opened');
    assert.equal(E.derive(s).cpPerSec, 0);
    s.intro['ring:labOpened'] = true;
    assert.equal(E.ringFreeCards(s), 1);
    const one = E.derive(s).cpPerSec;
    assert.ok(one > 0, 'the phone makes compute on its own');
    s.stats.clicks = 30; E.evaluate(s); s.stats.cashSold = E.DESK_PRICES[0];
    assert.equal(E.buy(s, 'keyboard').ok, true);
    assert.equal(E.ringFreeCards(s), 2);
    assert.equal(E.derive(s).cpPerSec, 2 * one);
    assert.equal(s.levels.cpu || 0, 0, 'no card was bought');
    assert.equal(E.deskCash(s), 0, 'and none is charged for');
    assert.equal(E.upgradeCost(E.UPGRADE_BY_ID.cpu, 0).cash, E.RING_CARD_PRICE, 'the first one bought is still the first price');
    E.setRing(false);
    assert.equal(E.ringFreeCards(s), 0);
});
