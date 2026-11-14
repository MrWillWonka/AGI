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
    assert.equal(E.DESK_PRICES.reduce((a, b) => a + b, 0), E.RING_DEPOSIT, 'one deposit covers the whole desk');
});

test('the ring: taking M0M\'s transfer buys the whole desk; then only Mom writes, and her money still comes', () => {
    const s = game();
    assert.equal(E.fundStep(s), null, 'nothing before the compute is earned');
    s.stats.runCp = E.RING_CALL_CP;
    assert.equal(E.fundStep(s), 'call');
    s.intro['ring:call'] = true;
    assert.equal(E.fundStep(s), 'offer:m0m');
    assert.equal(E.fundDecide(s, 'm0m', true), true);
    assert.equal(E.fundDecide(s, 'm0m', false), false, 'decided once');
    assert.equal(E.deskCash(s), E.RING_DEPOSIT);
    s.stats.clicks = 30; E.evaluate(s);   // the parts show at 15 clicks
    for (let i = 0; i < E.RING_DESK; i++) assert.equal(E.buy(s, 'keyboard').ok, true, `part ${i + 1}`);
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.deskDone(s), true);
    assert.equal(s.res.cp, 0, 'no compute spent');
    assert.equal(E.fundStep(s), 'mail:mom', 'no mail from Dad, no other offer'); s.intro['mail:mom'] = true;
    assert.ok(E.MAIL.find(m => m.id === 'mom').body.some(p => /went through/.test(p)), 'she thinks it already arrived');
    assert.equal(E.fundStep(s), 'deposit:mom', 'her transfer arrives with no question: something is off');
    E.fundDecide(s, 'mom', true);
    assert.equal(E.deskCash(s), E.RING_DEPOSIT);
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

test('the ring: both declined, pay day deposits it with no question', () => {
    const s = game();
    s.stats.runCp = E.RING_CALL_CP; s.intro['ring:call'] = true;
    E.fundDecide(s, 'm0m', false);
    s.intro['mail:mom'] = true;
    assert.equal(E.fundStep(s), 'offer:mom'); E.fundDecide(s, 'mom', false);
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.fundStep(s), 'deposit:payday'); E.fundDecide(s, 'payday', true);
    assert.equal(E.deskCash(s), E.RING_DEPOSIT);
    assert.equal(E.fundStep(s), null);
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
    s.res.cp = 257;
    assert.equal(E.sellCompute(s, 1e9), 25);
    assert.deepEqual([s.res.cp, E.deskCash(s)], [7, 25]);
    assert.equal(E.sellCompute(s, 9), 0, 'under a dollar is not sold');
    const card = E.UPGRADE_BY_ID.cpu, first = E.upgradeCost(card, 0);
    assert.deepEqual(Object.keys(first), ['cash']);
    assert.ok(first.cash >= 1 && E.upgradeCost(card, 10).cash > first.cash);
    s.levels.cpu = 3;
    assert.equal(E.deskCash(s), 25 - [0, 1, 2].reduce((n, l) => n + E.upgradeCost(card, l).cash, 0));
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
