'use strict';
// Every Packet Snare demo shows what it's for: played through once, it ends with its payoff (round 2 of the review found
// four that didn't: a boss loop too big to count, a core loop too big for a Chokehold, a pen that closed after its
// packets had gone, herders that herded nothing).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const D = require('../snare-demos.js');
const E = require('../engine.js');

for (const kind of Object.keys(D.DEMOS)) {
    test(`the ${kind} demo shows its payoff`, () => {
        const sim = D.start(P, kind);
        for (let t = 0; t < D.periodOf(sim.kind); t += 1 / 60) D.step(sim, 1 / 60);
        assert.ok(D.shows(sim), `${kind}: ${D.DEMOS[kind].text}`);
    });
}

test('every mechanic node in the tree has a demo', () => {
    for (const up of E.SNARE_TREE.filter(u => u.mechanic)) assert.ok(D.DEMOS[up.mechanic], `${up.id} (${up.mechanic})`);
});
