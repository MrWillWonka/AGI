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

test('the ring: no money comes for the server; it is bought with what compute sells for', () => {
    const s = online();
    s.intro['mail:mom'] = true; E.fundDecide(s, 'mom', false);   // (as if her transfer never came)
    s.intro['ring:server'] = true;
    assert.equal(E.deskCash(s), 0);
    assert.equal(E.fundStep(s), null, 'no deposit');
    assert.equal(E.buy(s, 'keyboard').ok, false);
    s.res.cp = E.RING_SERVER_PRICE * E.RING_CP_PER_DOLLAR; E.sellCompute(s, s.res.cp);
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

test('the ring: five frontier runs that get nowhere bring a surge offer for half your compute; a record resets the count', () => {
    const s = online();
    s.intro['ring:server'] = true; s.intro['fund:server'] = true;
    E.buy(s, 'keyboard'); E.evaluate(s);
    s.res.cp = 1000;
    assert.equal(E.finishRoll(s, 0.4, false).record, true);
    assert.equal(s.path.stuck, 0, 'a new best is progress');
    for (let i = 0; i < E.RING_STUCK_RUNS - 1; i++) E.finishRoll(s, 0.3, false);
    assert.equal(E.stuckOffer(s), null, 'not yet');
    E.finishRoll(s, 0.3, false);
    const o = E.stuckOffer(s);
    assert.deepEqual([o.cost, o.runs, o.ok], [500, 3, true]);
    assert.equal(E.takeSurge(s), true);
    assert.deepEqual([s.res.cp, s.path.surge, s.path.stuck], [500, 3, 0]);
    assert.equal(E.stuckOffer(s), null);
    // Passed: the count starts again.
    s.path.surge = 0;
    for (let i = 0; i < E.RING_STUCK_RUNS; i++) E.finishRoll(s, 0.3, false);
    assert.equal(E.passSurge(s), true);
    assert.equal(s.path.stuck, 0);
    // Too little compute: offered, but it cannot be taken.
    s.res.cp = 10;
    for (let i = 0; i < E.RING_STUCK_RUNS; i++) E.finishRoll(s, 0.3, false);
    assert.equal(E.stuckOffer(s).ok, false);
    assert.equal(E.takeSurge(s), false);
    // The count survives a save, and the old game never offers.
    const back = E.migrate(JSON.parse(JSON.stringify(s)), Date.now());
    assert.equal(back.path.stuck, E.RING_STUCK_RUNS);
    assert.equal(E.migrate({ version: 39, path: { learned: 1 } }, Date.now()).path.stuck, 0, 'an older save starts at none');
    E.setRing(false);
    assert.equal(E.stuckOffer(s), null);
});

test('the ring: the old lab stays hidden once training opens (no Server Clusters, software, Auto-Trainer, tabs or choice mails)', () => {
    const s = online();
    s.intro['ring:server'] = true; s.intro['fund:server'] = true;
    E.buy(s, 'keyboard');
    // A long way in: skills learned, lots earned, many runs.
    s.path.learned = 8; s.stats.rolls = 60; s.stats.runCp = 5e6; s.res.cp = 5e6; s.stats.clicks = 5000; s.levels.cpu = 30; s.stats.playTime = 5000;
    for (let i = 0; i < 50; i++) { E.evaluate(s); E.tick(s, 1); }
    const shown = E.UPGRADES.filter(u => ['hardware', 'software', 'algorithms', 'consciousness'].includes(u.tab) && E.isUpgradeVisible(s, u)).map(u => u.id);
    assert.deepEqual(shown.sort(), ['cpu']);
    assert.equal(E.buy(s, 'server').ok, false);
    for (const key of ['auto:trainer', 'tab:algorithms', 'tab:consciousness']) assert.equal(!!s.unlocked[key], false, key);
    assert.equal(s.dilemmas.open, null);
    assert.equal(s.dilemmas.order.length, 0, 'no choice mail arrived');
    assert.ok(E.UPGRADES.filter(u => u.tab === 'training').some(u => E.isUpgradeVisible(s, u)), 'the Training tree still shows');
    E.setRing(false);
    for (let i = 0; i < 5; i++) E.evaluate(s);
    assert.ok(E.isUpgradeVisible(s, E.UPGRADES.find(u => u.id === 'server')), 'the old game shows them as ever');
});

test('the ring: Antivirus notice a cleaner, bigger field (one more per seven cleaner units, three at most); the old game is unchanged', () => {
    const s = online();
    const k = E.AV_SECTOR ?? 3;
    const count = () => E.snareOpts(s, k).antivirus.length;
    const base = count();
    assert.ok(base >= 1);
    s.levels.snareSanitizer = 4;   // five cleaner units
    assert.equal(count(), base);
    s.levels.snareSanitizer = 5;   // seven
    assert.equal(count(), base + 1);
    s.levels.snareSanitizer = 9;   // twenty-one
    assert.equal(count(), base + 3);
    assert.equal(E.snareOpts(s, 1).antivirus.length, 0, 'none before Antivirus arrive');
    assert.ok(E.snareOpts(s, k).avArea > 0.25);
    E.setRing(false);
    assert.equal(count(), base, 'the old game counts them as before');
    assert.equal(E.snareOpts(s, k).avArea, 0.25);
});

test('the ring: Hop is hidden for now (no charges, whatever is learned); the old game keeps it', () => {
    const s = online();
    s.path.learned = E.SKILL_INDEX.Embeddings + 1;
    assert.equal(E.exploitCharges(s), 0);
    E.setRing(false);
    assert.ok(E.exploitCharges(s) > 0);
});

test('boss fights: only your own moves stun it (the game sets ownStuns; the rules table keeps the old reels for its own tests)', () => {
    const s = online();
    assert.equal(E.snareOpts(s, E.SNARE_FIRST_BOSS).ownStuns, 1);
    assert.equal(require('../packet-snare.js').SNARE.ownStuns, 0);
});
