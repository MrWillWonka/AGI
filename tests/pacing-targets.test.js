'use strict';
// Packet Snare's early pacing against its targets (design/review/targets.json): a person-paced bot's campaign
// (tools/review/pacing.js) on a phone's field, five seeds. Sectors 2–4 must each take a number of runs in their target
// range (median of the seeds), or stay no worse than a known miss the owner hasn't ruled on yet, so an economy change that breaks the early game fails like a bug. Sector 1 and the later
// sectors are reported by `node tools/review/pacing.js`, not tested: sector 1 is a coin flip for a bot, and the later
// targets are still the owner's to settle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Packet Snare: sectors 2–4 take their target runs for a person-paced player (design/review/targets.json)', () => {
    const argv = process.argv;
    process.argv = [argv[0], 'pacing.js', '--minutes', '11'];
    const { campaign, SCREENS } = require('../tools/review/pacing.js');
    process.argv = argv;
    const targets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'design', 'review', 'targets.json'), 'utf8'));
    const runs = [1, 2, 3, 4, 5].map(seed => campaign(seed, SCREENS.phone, { minutes: 13 }));
    for (const k of [2, 3, 4]) {
        const per = runs.map(c => c.sectors.find(x => x.sector === k)?.runs ?? 99).sort((a, b) => a - b);
        const m = per[2];
        const [lo, hi] = targets.runsPerSector[k];
        // a known miss (targets.json `knownMisses`, waiting on the owner) may stay where it was, never get worse: a ratchet
        const known = targets.knownMisses?.[k];
        if (known && !(m >= lo && m <= hi)) {
            assert.ok(m <= known.atMost, `sector ${k}: median ${m} runs (seeds ${per.join('/')}), worse than the known miss of ${known.atMost}`);
            continue;
        }
        assert.ok(m >= lo && m <= hi, `sector ${k}: median ${m} runs (seeds ${per.join('/')}), target ${lo}–${hi}`);
    }
});
