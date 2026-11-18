// The AI's tears and the Packet Snare agent that tends them (engine.js; design/ring.md, "The AI's tears").
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const NOW = 1e12;
const ringOn = fn => { E.setRing(true); try { fn(); } finally { E.setRing(false); } };
const boss = () => { for (let k = 0; k < 40; k++) if (E.isSnareBossSector(k)) return k; throw new Error('no boss sector'); };
const stock = (s, sector) => (E.feedStock(s).find(e => e.sector === sector) || { total: 0 }).total;

test('tears: beating a boss opens one on its sector; it pulls your best winning run into that stockpile every ten minutes', () => {
    ringOn(() => {
        const s = E.defaultState(NOW), k = boss(), d = E.derive(s);
        assert.deepEqual(E.tearList(s), []);
        assert.equal(E.tearWin(s, k + 1 === k ? k : (E.isSnareBossSector(k + 1) ? k + 2 : k + 1), 90), null, 'a goal sector has no tear');
        const t = E.tearWin(s, k, 120);
        assert.deepEqual([t.first, t.opened, t.size], [true, true, 120]);
        assert.deepEqual(E.tearList(s), [k]);
        assert.ok(Math.abs(E.tearRate(s, k) * E.TEAR_SECONDS - 120) < 1e-9);
        s.snare.sector = k + 1;
        const before = stock(s, k + 1);
        let pulled = 0; for (let i = 0; i < E.TEAR_SECONDS; i++) for (const e of E.tearsTick(s, 1)) { assert.equal(e.sector, k); pulled += e.packets; }
        assert.ok(pulled >= 115 && pulled <= 120, 'about the best run in ten minutes: ' + pulled);
        assert.ok(stock(s, k + 1) > before, 'into that sector\'s stockpile');
        void d;
    });
    const off = E.defaultState(NOW); assert.equal(E.tearWin(off, boss(), 50), null, 'only under the ring');
});

test('tears: a boss beaten again makes its tear bigger; fought again it is shut, and it comes back as it was if you lose', () => {
    ringOn(() => {
        const s = E.defaultState(NOW), k = boss();
        E.tearWin(s, k, 100);
        const rate = E.tearRate(s, k);
        E.tearFight(s, k);
        assert.equal(E.tearRate(s, k), 0, 'shut for the fight');
        assert.deepEqual(E.tearsTick(s, 600), []);
        E.tearFight(s, null);
        assert.equal(E.tearRate(s, k), rate, 'lost: back at its old size');
        E.tearFight(s, k);
        const again = E.tearWin(s, k, 60);   // a worse run still wins
        assert.deepEqual([again.first, again.opened], [false, false]);
        assert.equal(again.size, 100 * (1 + E.TEAR_GROW));
        assert.equal(s.snare.tearShut, null);
        assert.equal(E.tearWin(s, k, 300).size, 300 * (1 + 2 * E.TEAR_GROW), 'a better winning run counts too');
        E.tearFight(s, k + 50); assert.equal(s.snare.tearShut, null, 'a sector with no tear shuts nothing');
    });
});

test('tears: an agent in Packet Snare makes every tear pull half as much again; the place opens with the first tear', () => {
    ringOn(() => {
        const s = E.defaultState(NOW), k = boss();
        s.snare.sector = k + 1;
        assert.ok(E.agentCount(s) >= 1);
        assert.equal(E.agentPlaceOpen(s, 'snare'), false);
        assert.equal(E.assignAgent(s, 0, 'snare'), false);
        E.tearWin(s, k, 200);
        const alone = E.tearRate(s, k);
        assert.equal(E.assignAgent(s, 0, 'snare'), true);
        assert.ok(Math.abs(E.tearRate(s, k) - alone * (1 + E.AGENT_SNARE_PULL)) < 1e-9);
    });
});

test('tears: they come back from a save, cleaned', () => {
    ringOn(() => {
        const s = E.defaultState(NOW), k = boss();
        E.tearWin(s, k, 140); E.tearWin(s, k, 90); E.tearFight(s, k); E.tearsTick(s, 3);
        const back = E.migrate(JSON.parse(JSON.stringify(s)), NOW);
        assert.equal(back.version, E.SAVE_VERSION);
        assert.deepEqual(back.snare.tears, s.snare.tears);
        assert.equal(back.snare.tearShut, k);
        assert.deepEqual(E.migrate({ version: 46 }, NOW).snare.tears, {});
        assert.deepEqual(E.cleanTears({ 2: { best: 50, wins: 2, acc: 1.5 }, x: { best: 9, wins: 1 }, 5: { best: 9, wins: 0 }, 400: { best: 9, wins: 1 }, 7: 'no' }), { 2: { best: 50, wins: 2, acc: 1.5 } });
    });
});