// The ring, Build 2: Packet Snare's first boss needs Pattern Matching; the server it sends you for is bought with
// money and opens the Training Cluster, where a sprint costs research.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');

const up = () => E.UPGRADES.find(u => u.id === 'keyboard');
const online = () => {
    E.setRing(true);
    const s = E.defaultState(Date.now());
    Object.assign(s.intro, { 'mailAccepted:welcome': true, 'ring:call': true, 'fund:m0m': true });
    s.stats.clicks = 40; s.stats.runCp = 40;
    E.evaluate(s);
    for (let i = 0; i < E.RING_DESK; i++) assert.equal(E.buy(s, 'keyboard').ok, true);
    E.evaluate(s);
    return s;
};
test.afterEach(() => E.setRing(false));

test('the ring: the first boss is gated on Pattern Matching, and only under the ring', () => {
    const s = online();
    const boss = E.SNARE_FIRST_BOSS;
    assert.equal(E.isSnareBossSector(boss), true);
    assert.equal(E.snareGateSkill(s, boss), 'Pattern Matching');
    assert.equal(E.snareGateSkill(s, boss - 1), null, 'goal sectors have no gate');
    s.path.learned = E.SKILL_INDEX['Pattern Matching'] + 1;
    assert.equal(E.snareGateSkill(s, boss), null, 'learned: the gate is open');
    E.setRing(false);
    s.path.learned = 0;
    assert.equal(E.snareGateSkill(s, boss), null, 'the old game has no gate there');
});

test('the ring: the finished desk has no card until the server is offered; the server costs money and opens training', () => {
    const s = online();
    assert.equal(E.isUpgradeVisible(s, up()), false, 'desk built: no card');
    assert.equal(E.capacity(s, up()), E.RING_DESK);
    assert.equal(!!s.unlocked['module:path'], false, 'training is sealed');
    s.intro['ring:server'] = true;
    assert.equal(E.isUpgradeVisible(s, up()), true);
    assert.equal(E.upgradeName(s, up()), 'Server');
    assert.deepEqual(E.upgradeCost(up(), E.RING_DESK), { cash: E.RING_SERVER_PRICE });
    // M0M's money went on the desk: short, so a deposit comes (after Mom's own, which is still owed).
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.buy(s, 'keyboard').ok, false);
    s.intro['mail:mom'] = true; E.fundDecide(s, 'mom', true);
    assert.equal(E.deskCash(s), E.RING_DEPOSIT, 'Mom\'s real transfer covers the server');
    assert.equal(E.fundStep(s), null, 'no deposit needed');
    assert.equal(E.buy(s, 'keyboard').ok, true);
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.isUpgradeVisible(s, up()), false, 'bought: the card goes again');
    const changes = E.evaluate(s);
    assert.equal(!!s.unlocked['module:path'], true, 'the Training Cluster opens');
    assert.equal(changes.milestones.find(m => m.key === 'module:path').ringCallout[1], 'Training Cluster has been added to your home screen.');
});

test('the ring: short of the server\'s price, a deposit comes once', () => {
    const s = online();
    s.intro['mail:mom'] = true; E.fundDecide(s, 'mom', false);   // (as if her transfer never came)
    s.intro['ring:server'] = true;
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.fundStep(s), 'deposit:server');
    E.fundDecide(s, 'server', true);
    assert.equal(E.deskCash(s), E.RING_SERVER_PRICE);
    assert.equal(E.fundStep(s), null);
    assert.equal(E.buy(s, 'keyboard').ok, true);
    assert.equal(E.fundStep(s), null, 'none after it is bought');
});

test('the ring: a sprint costs research, on the old shape by charge; the old game still charges compute and data', () => {
    const s = online();
    s.intro['ring:server'] = true; s.intro['fund:server'] = true;
    E.buy(s, 'keyboard'); E.evaluate(s);
    assert.deepEqual(E.pushCost(s, 1), { rp: E.RING_SPRINT_RP });
    assert.deepEqual(Object.keys(E.pushCost(s, 0.5)), ['rp']);
    assert.ok(E.pushCost(s, 0.5).rp < E.RING_SPRINT_RP);
    s.res.cp = 1e6; s.res.rp = 0;
    assert.equal(E.payPush(s, 1), false, 'compute does not pay for a sprint');
    s.res.rp = E.RING_SPRINT_RP;
    assert.equal(E.payPush(s, 1), true);
    assert.equal(s.res.rp, 0);
    assert.equal(s.res.cp, 1e6);
    E.setRing(false);
    assert.deepEqual(Object.keys(E.pushCost(s, 1)).sort(), ['cp', 'dp']);
});
