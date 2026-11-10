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
        while (sim.clock < sim.period) D.step(sim, 1 / 60);
        assert.ok(D.shows(sim), `${kind}: ${D.DEMOS[kind].text}`);
    });
}

// K22 (the owner's call): a beat before the action (nothing happens in the first LEAD s) and a beat after the payoff
// (TAIL s or more left on the loop once it lands).
test('every demo opens on a still beat and holds its payoff for a beat after', () => {
    for (const kind of Object.keys(D.DEMOS)) {
        const sim = D.start(P, kind);
        let quiet = true, at = null;
        while (sim.clock < sim.period) {
            const ev = D.step(sim, 1 / 60);
            if (sim.clock < D.LEAD - 1e-9 && ev.length) quiet = false;
            if (at == null && sim.t >= 0 && D.shows(sim)) at = sim.clock;
        }
        assert.ok(quiet, `${kind}: something happened in its first ${D.LEAD} s`);
        assert.ok(at != null && at >= D.LEAD - 1e-9, `${kind}: its payoff landed in the still beat`);
        assert.ok(sim.period - at >= D.TAIL - 0.02, `${kind}: only ${(sim.period - at).toFixed(2)} s after its payoff`);
    }
});

test('every mechanic node in the tree has a demo', () => {
    for (const up of E.SNARE_TREE.filter(u => u.mechanic)) assert.ok(D.DEMOS[up.mechanic], `${up.id} (${up.mechanic})`);
});
