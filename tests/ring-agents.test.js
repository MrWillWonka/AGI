// The ring, Build 3: agents. One for each different boss beaten, put to work in the Lab, The Feed or Training.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');

const withAgents = n => {
    E.setRing(true);
    const s = E.defaultState(Date.now());
    s.snare.sector = E.SNARE_FIRST_BOSS + 1 + E.SNARE_BOSS_EVERY * (n - 1);
    return s;
};
test.afterEach(() => E.setRing(false));

test('agents: one for each different boss beaten, none in the old game, and a replay gives none', () => {
    const s = withAgents(1);
    assert.equal(E.agentCount(s), 1);
    E.snareBossDown(s, E.SNARE_FIRST_BOSS);   // the first boss again
    assert.equal(E.agentCount(s), 1);
    assert.equal(E.agentCount(withAgents(3)), 3);
    E.setRing(false);
    assert.equal(E.agentCount(s), 0);
});

test('agents: assigned only to an open place, only if you have them; a save keeps where they work', () => {
    const s = withAgents(1);
    assert.equal(E.assignAgent(s, 0, 'training'), false, 'Training is not open yet');
    assert.equal(E.assignAgent(s, 1, 'lab'), false, 'there is no second agent');
    assert.equal(E.assignAgent(s, 0, 'nowhere'), false);
    assert.equal(E.assignAgent(s, 0, 'lab'), true);
    assert.equal(E.agentsAt(s, 'lab'), 1);
    const back = E.migrate(JSON.parse(JSON.stringify(s)), Date.now());
    assert.deepEqual(back.agents.at, ['lab']);
    assert.equal(E.assignAgent(s, 0, null), true);
    assert.equal(E.agentsAt(s, 'lab'), 0);
    assert.deepEqual(E.cleanAgents({ at: ['moon', 'feed', 7], fund: -5, feed: 'x' }), { at: [null, 'feed', null], fund: 0, owed: 0, feed: null });
});

test('agents: a second one in a place adds half as much', () => {
    assert.equal(E.agentPower(0), 0);
    assert.equal(E.agentPower(1), 1);
    assert.equal(E.agentPower(2), 1.5);
    assert.equal(E.agentPower(3), 1.75);
});

test('agents: the Lab agent saves a share of compute and buys hardware with it; moved away, the rest comes back', () => {
    const s = withAgents(1);
    Object.assign(s.intro, { 'mailAccepted:welcome': true, 'ring:labOpened': true, 'ring:call': true, 'fundNo:m0m': true });
    s.stats.clicks = 40; s.stats.runCp = 40; s.stats.cashSold = E.DESK_PRICES.reduce((a, b) => a + b, 0);
    E.evaluate(s);
    for (let i = 0; i < E.RING_DESK; i++) assert.equal(E.buy(s, 'keyboard').ok, true);   // the desk is built, so Graphics Cards are on sale
    E.evaluate(s);
    assert.ok(E.agentLabPick(s), 'there is something to buy');
    E.assignAgent(s, 0, 'lab');
    s.res.cp = 0;
    const own = E.level(s, 'cpu');
    let bought = 0, made = 0;
    for (let t = 0; t < 3000; t++) { const before = s.res.cp, d = E.derive(s).cpPerSec; bought += E.tick(s, 1).filter(id => id === 'cpu').length; made += d; }
    assert.ok(bought >= 1, 'it bought a card');
    assert.equal(E.level(s, 'cpu'), own + bought);
    assert.ok(s.res.cp > made * 0.5, 'it leaves most of the compute alone');
    assert.ok(E.deskCash(s) >= 0);
    const held = s.res.cp + s.agents.fund;
    E.assignAgent(s, 0, null); E.tick(s, 0.001);
    assert.equal(s.agents.fund, 0);
    assert.ok(Math.abs(s.res.cp - held) < 1, 'the fund comes back as compute');
});

test('agents: the Feed agent works a stockpile down for research, and stops for your own session', () => {
    const s = withAgents(1);
    s.intro['ring:feed'] = true;
    E.feedDeliver(s, { sector: 1, packets: 60, gold: 6 });
    const stock = () => E.feedStock(s).reduce((n, e) => n + e.total, 0);
    const had = stock();
    assert.ok(had > 0);
    assert.equal(E.assignAgent(s, 0, 'feed'), true);
    const rp = s.res.rp;
    let fed = null;
    for (let t = 0; t < 200 && !fed; t++) fed = (E.tick(s, 1).agents || []).find(e => e.type === 'fed') || null;
    assert.ok(fed, 'it finished the stockpile');
    assert.equal(stock(), 0);
    assert.equal(fed.packets, had);
    assert.equal(s.res.rp - rp, fed.research);
    assert.ok(fed.research > 0 && fed.research < had, 'well under a packet of research a packet');
    // With a session of yours running it waits.
    E.feedDeliver(s, { sector: 1, packets: 40, gold: 0 });
    E.feedStart(s, 1);
    assert.ok(s.feed.session);
    const before = s.res.rp, job = JSON.stringify(s.agents.feed);
    E.agentsTick(s, 30, E.derive(s));
    assert.equal(s.res.rp, before);
    assert.equal(JSON.stringify(s.agents.feed), job);
});

test('agents: one in Training doubles what cleared hills train by themselves', () => {
    const s = withAgents(1);
    s.unlocked['module:path'] = true;
    s.path.learned = 2; s.path.legBest = [5, 9];
    const base = E.derive(s).xpPerSec;
    assert.ok(base > 0);
    assert.equal(E.assignAgent(s, 0, 'training'), true);
    assert.ok(Math.abs(E.derive(s).xpPerSec - base * (1 + E.AGENT_TRAIN_XP)) < 1e-9);
});
