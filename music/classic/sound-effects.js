// Classic: its sound effects. A copy from sfx.js, taken 2026-11-14; reference only.
// Classic is the set every effect was designed in: SOUNDS below is the whole list.
// The engine (tone, noise, the grid, variations, groups, the sprint meter): ../shared/sound-engine.js.

// ---- Key and scale: KEYS (sfx.js lines 179-179) ----
classic: null,                                          // A minor pentatonic, as written

// ---- Profile: PROFILES (none: Classic is as written) (sfx.js lines 222-222) ----
classic: null,

// ---- Simple sounds' voice: SIMPLE_VOICE (sfx.js lines 979-979) ----
classic: { type: 'square', oct: 0, cutoff: 1800, len: 1, gain: 0.55 },

// ---- Sprint meter levels (arpeggio, hops, acid, gated chord, thrust): CHARGE_TRIM (sfx.js lines 1123-1123) ----
classic: [1.92, 2.8, 4.11, 11.53, 2.78],

// ---- Sprint meter levels, simple sounds (sfx.js lines 1128-1128) ----
's:classic': [0.26, 1.07, 3.03, 7.25, 2.41],

// ---- Packet Snare levels: SNARE_TRIM (sfx.js lines 511-511) ----
classic: { snareCatch: 1.81, snareSpoil: 1.55, snareSnap: 0.95, snareLaser: 1.49, snareChain: 3.39, snareSweep: 2.47, snareCharge: 2.21, snareBoss: 1.02, snareHit: 2.24, 'snarePlace:wall': 0.87, 'snarePlace:decoy': 2.35, 'snarePlace:turret': 2.05, 'snarePlace:tower': 0.58, snareRemove: 2.07, 'snarePower:freeze': 0.5, 'snarePower:purge': 1.64, snareZap: 1.73, snareDecoy: 1.54, snareQuarantine: 1.17, snareStun: 1.27, snareCore: 0.5, snareBossDown: 0.58, snareParry: 2.4, snareSlash: 3.13, snareSpoof: 2.66, snareGarbage: 1.56, snareRace: 2.67, snareHijack: 2.07, snareTaken: 4.32, snareFlag: 2.14, snareIds: 1.23, snareRebuild: 1.43, snareHerdStun: 2.09 },

// ---- Packet Snare levels, simple sounds (sfx.js lines 516-516) ----
's:classic': { snareCatch: 1.06, snareSpoil: 1.02, snareSnap: 1.52, snareLaser: 3.42, snareChain: 2.01, snareSweep: 2.69, snareCharge: 1.41, snareBoss: 1.24, snareHit: 1.04, 'snarePlace:wall': 1.34, 'snarePlace:decoy': 1.32, 'snarePlace:turret': 1.37, 'snarePlace:tower': 1.36, snareRemove: 1.25, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.26, snareZap: 1.55, snareDecoy: 1.54, snareQuarantine: 1.2, snareStun: 1.15, snareCore: 0.76, snareBossDown: 0.61, snareParry: 2.67, snareSlash: 1.75, snareSpoof: 2.08, snareGarbage: 1.36, snareRace: 2.55, snareHijack: 2.1, snareTaken: 4.09, snareFlag: 1.75, snareIds: 2, snareRebuild: 1.57, snareHerdStun: 1.43 },

// ---- House voices and the click figures (sfx.js lines 238-255) ----
// A filtered note: the house voice (a short blip through a lowpass, techno-style).
const blip = (note, opts) => tone({ f0: NOTE(note), dur: 0.09, type: 'square', gain: 0.07, cutoff: 2600, ...opts });
const arp = (notes, step, opts = {}) => notes.forEach((n, i) => blip(n, { ...opts, at: (opts.at || 0) + i * step }));
// A techno delay throw: the same figure again a dotted 8th later, quieter.
const echo = (fn, gain = 0.4) => { fn(1); fn(gain, 3 * S()); };
const stab = (notes, opts) => notes.forEach(n => tone({ f0: NOTE(n), dur: 0.22, type: 'sawtooth', gain: 0.05, cutoff: 1800, q: 4, detune: 7, ...opts }));
const sub = (from, to, dur, gain, at = 0) => tone({ f0: NOTE(from), f1: NOTE(to), dur, type: 'sine', gain, at });
// The bar's position picks a click's note, so taps and holds play a figure that sits on the beat.
// Each job has its own instrument in every track, so they never sound alike: compute round, in the middle
// register with a short tick (it took data's old sound, the owner's call; an octave lower it sat under the
// tracks' basses and couldn't be heard), data bright and short, research high and bell-like.
// Phone speakers push the upper mids, where data's square blip sits: it's quieter and darker there.
const PHONE = !!window.matchMedia?.('(pointer: coarse)').matches;
const CLICK_NOTES = {
    cp: [69, 64, 67, 64, 72, 64, 67, 62],       // compute: round, round A4
    dp: [81, 76, 79, 76, 84, 76, 79, 74],       // data: a bright figure an octave up
    rp: [88, 84, 86, 81, 91, 84, 86, 79]        // research: up high, bell-like
};

// ---- Buy sounds by panel: BUY_SETS (sfx.js lines 265-310) ----
const bell = (n, o = {}) => { tone({ f0: NOTE(n), dur: 0.35, type: 'sine', gain: 0.06, ...o }); tone({ f0: NOTE(n + 19), dur: 0.12, type: 'sine', gain: 0.015, ...o }); };
const pluck = (n, o = {}) => tone({ f0: NOTE(n), dur: 0.18, type: 'sawtooth', gain: 0.04, cutoff: 2200, q: 3, ...o });
const run = (fn, notes, step, g = 1, at = 0) => notes.forEach((n, i) => fn(n, { at: at + i * step, gain: (fn === bell ? 0.06 : fn === pluck ? 0.04 : 0.07) * g }));
// Every panel in its own colour of the track: hardware square blips with a sub (the sound the owner liked),
// software (data) quick high triangles like a terminal, research bells, consciousness a soft pad, the skill
// tree saw plucks, legacy a wide chord.
const BUY_SETS = {
    hardware: [
        g => run(blip, [69, 72, 76, 81], S() / 2, g),
        g => run(blip, [64, 69, 72, 76], S() / 2, g),
        g => run(blip, [57, 64, 69, 76], S() / 2, g),
        g => run(blip, [69, 76, 72, 81], S() / 2, g)
    ],
    software: [
        g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [81, 84, 88, 93], S() / 4, g),
        g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [88, 84, 81, 88], S() / 4, g),
        g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [76, 81, 79, 84, 88], S() / 4, g)
    ],
    algorithms: [
        g => run(bell, [69, 76, 81], S(), g),
        g => run(bell, [72, 79, 84], S(), g),
        g => run(bell, [64, 69, 76, 81], S() / 2, g)
    ],
    consciousness: [
        g => [57, 64, 69, 72].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 })),
        g => [55, 62, 67, 71].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 })),
        g => [60, 64, 67, 72].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 }))
    ],
    training: [
        g => run(pluck, [57, 64, 69, 72], S() / 2, g),
        g => run(pluck, [64, 69, 72, 76], S() / 2, g),
        g => run(pluck, [60, 67, 72, 76], S() / 2, g),
        g => run(pluck, [57, 62, 64, 69], S() / 2, g)
    ],
    // Packet Snare's tree: glassy triangle runs going up, in the packets' register.
    snare: [
        g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [72, 76, 81, 88], S() / 2, g),
        g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [76, 79, 84, 91], S() / 2, g),
        g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [69, 76, 79, 88], S() / 2, g)
    ],
    legacy: [
        g => { stab([57, 64, 69, 72, 76], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(33, 33, 0.8, 0.2 * g); },
        g => { stab([55, 62, 67, 71, 74], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(31, 31, 0.8, 0.2 * g); },
        g => { stab([53, 60, 64, 69, 72], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(29, 29, 0.8, 0.2 * g); }
    ]
};

// ---- Every effect as designed: SOUNDS (the other tracks fall back to these, through their profile) (sfx.js lines 312-458) ----
// A click's note: where it falls in the bar picks it from the job's figure.
function clickNote(res) {
    const notes = CLICK_NOTES[res] || CLICK_NOTES.cp;
    const i = clock ? Math.floor(Math.round(stepAt(startAt ?? ctx.currentTime + base)) / 2) % 8 : 0;
    return notes[(i + 8) % 8];
}

const SOUNDS = {
    // Workbench jobs: a note on the bar's current 8th (a hold lands on the 8ths: see holdDelay). Compute a
    // round triangle, data the square blip, research a sine with its octave.
    click: ({ res = 'cp' } = {}) => {
        const n = clickNote(res);
        if (res === 'cp') { tone({ f0: NOTE(n), dur: 0.12, type: 'triangle', gain: 0.13, cutoff: 1600 }); tone({ f0: NOTE(n + 24), dur: 0.03, type: 'sine', gain: 0.05 }); noise({ dur: 0.012, gain: 0.04, f0: 3500, q: 2 }); }
        else if (res === 'rp') { tone({ f0: NOTE(n), dur: 0.16, type: 'sine', gain: 0.09 }); tone({ f0: NOTE(n + 12), dur: 0.06, type: 'sine', gain: 0.03 }); }
        else blip(n, { gain: 0.06 * (PHONE ? 0.55 : 1), dur: 0.07, cutoff: PHONE ? 1800 : 2600 });
    },
    // Buying: each panel has its own sound, in a few variations that never repeat back to back; a big buy
    // (several at once, a one-time upgrade, a tool growing) adds a sub and a top note.
    buy: ({ panel = 'hardware', big = false } = {}) => {
        const set = BUY_SETS[panel] || BUY_SETS.hardware;
        const i = vary('buy:' + panel, set.length);
        set[i](big ? 1.15 : 1);
        if (big) { sub(45, 45, 0.3, 0.12); blip(93, { gain: 0.035, at: 3 * S() / 2 + S() * 0.5, dur: 0.16 }); }
    },
    buyBig: (o = {}) => SOUNDS.buy({ ...o, big: true }),
    // Packet Snare's own: the shared versions (each track writes its own in TRACK_SOUNDS; a track that didn't
    // would hear these through its profile). Stealthy and short, out of the training sounds' way: a catch is a
    // run of muted plucks low down (longer the bigger the loop's multiplier), not a prompt's bright blips; a
    // snap a static crack and a dull thud, not the near miss's slow bend.
    snareCatch: ({ mult = 1 } = {}) => {
        const notes = [57, 60, 62, 64, 67, 69].slice(0, 2 + Math.min(4, Math.round((mult - 1) * 1.5)));
        notes.forEach((n, i) => tone({ f0: NOTE(n), dur: 0.07, type: 'triangle', gain: 0.09, cutoff: 1100 + 250 * i, at: i * S() / 2 }));
        tone({ f0: NOTE(notes[notes.length - 1] + 24), dur: 0.04, type: 'sine', gain: 0.03, at: (notes.length - 1) * S() / 2 });
    },
    snareSpoil: () => { tone({ f0: NOTE(52), f1: NOTE(45), dur: 0.28, type: 'sawtooth', gain: 0.05, cutoff: 700, detune: -20 }); tone({ f0: NOTE(53), f1: NOTE(46), dur: 0.28, type: 'sawtooth', gain: 0.04, cutoff: 700 }); noise({ dur: 0.12, gain: 0.07, f0: 300, type: 'lowpass' }); },
    snareSnap: () => { noise({ dur: 0.03, gain: 0.12, f0: 7000, q: 2 }); noise({ dur: 0.08, gain: 0.05, f0: 1800, f1: 600, q: 5, at: 0.02 }); tone({ f0: NOTE(45), dur: 0.1, type: 'sine', gain: 0.12 }); },
    snareLaser: () => tone({ f0: NOTE(100), f1: NOTE(81), dur: 0.06, type: 'sine', gain: 0.045 }),
    snareChain: () => [81, 84, 88].forEach((n, i) => { noise({ dur: 0.02, gain: 0.05, f0: 4000 + 2000 * i, q: 8, at: i * S() / 4 }); tone({ f0: NOTE(n), dur: 0.03, type: 'square', gain: 0.015, cutoff: 4000, at: i * S() / 4 }); }),
    snareSweep: () => { [0, 2].forEach(k => stab([64, 69], { at: k * S(), dur: 0.14, gain: 0.045, cutoff: 1400, q: 6 })); noise({ dur: 0.5, gain: 0.06, f0: 600, f1: 3000, q: 2, attack: 0.4 }); },
    snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => blip(n, { at: i * S() / 2, gain: 0.04 + 0.01 * i, cutoff: 1500 + 800 * i, dur: 0.05 })); tone({ f0: NOTE(45), f1: NOTE(57), dur: 0.45, type: 'sawtooth', gain: 0.04, cutoff: 1200, q: 8, attack: 0.3 }); },
    snareBoss: () => { sub(33, 30, 0.18, 0.3); sub(33, 30, 0.15, 0.2, 2 * S()); stab([45, 52, 57], { gain: 0.035, dur: 0.4, cutoff: 700 }); },
    snareHit: () => { tone({ f0: NOTE(57), dur: 0.12, type: 'square', gain: 0.04, cutoff: 1600 }); tone({ f0: NOTE(57) * 2.76, dur: 0.1, type: 'sine', gain: 0.025, raw: true }); noise({ dur: 0.04, gain: 0.08, f0: 3000, q: 6 }); },
    snarePlace: ({ kind = 'wall' } = {}) => {
        if (kind === 'decoy') blip(76, { gain: 0.045, dur: 0.08, cutoff: 2000, echo: 0.4 });
        else if (kind === 'turret') { [0, 1].forEach(i => noise({ dur: 0.015, gain: 0.06, f0: 3500, q: 5, at: i * S() / 4 })); blip(64, { at: S() / 2, gain: 0.055, dur: 0.07, cutoff: 1800 }); }
        else if (kind === 'tower') { sub(45, 45, 0.2, 0.12); blip(69, { gain: 0.04, dur: 0.1 }); blip(76, { gain: 0.04, dur: 0.12, at: S() / 2 }); }
        else { tone({ f0: NOTE(45), dur: 0.12, type: 'triangle', gain: 0.14 }); noise({ dur: 0.05, gain: 0.05, f0: 900, q: 2 }); blip(69, { gain: 0.035, dur: 0.05, cutoff: 1500, at: S() / 2 }); }
    },
    snareRemove: () => { tone({ f0: NOTE(72), f1: NOTE(64), dur: 0.07, type: 'square', gain: 0.04, cutoff: 1600 }); noise({ dur: 0.015, gain: 0.04, f0: 5000, q: 3 }); },
    snarePower: ({ kind = 'freeze' } = {}) => kind === 'purge'
        ? (noise({ dur: 4 * S(), gain: 0.1, f0: 500, f1: 7000, q: 1.2, attack: 3.5 * S() }), stab([57, 64, 69, 76], { gain: 0.035, dur: 0.35, cutoff: 2400, at: 4 * S() }))
        : (tone({ f0: NOTE(93), f1: NOTE(81), dur: 0.6, type: 'sine', gain: 0.05 }), noise({ dur: 0.7, gain: 0.08, f0: 5000, f1: 300, type: 'lowpass' }), sub(45, 33, 0.6, 0.12)),
    snareZap: () => { tone({ f0: NOTE(88), f1: NOTE(64), dur: 0.05, type: 'square', gain: 0.035, cutoff: 3000 }); noise({ dur: 0.04, gain: 0.05, f0: 6000, type: 'highpass' }); },
    snareDecoy: () => { noise({ dur: 0.08, gain: 0.07, f0: 6000, type: 'highpass' }); tone({ f0: NOTE(84), dur: 0.08, type: 'triangle', gain: 0.045 }); tone({ f0: NOTE(76), dur: 0.1, type: 'triangle', gain: 0.04, at: S() / 2 }); },
    // The second wave: the Rogue AI's cores, Firewalls stunning Antivirus, the flicks against the boss, the IDS.
    snareQuarantine: ({ partner = false } = {}) => {
        noise({ dur: 0.02, gain: 0.08, f0: 5200, q: 6 }); noise({ dur: 0.025, gain: 0.08, f0: 3600, q: 6, at: S() / 4 });
        tone({ f0: NOTE(45), dur: 0.1, type: 'triangle', gain: 0.13, at: S() / 4 });
        if (partner) [64, 67, 72].forEach((n, i) => tone({ f0: NOTE(n), dur: 0.2, type: 'triangle', gain: 0.05, cutoff: 1600, detune: -8, at: (1 + i) * S() / 2 }));
        else { blip(69, { gain: 0.05, dur: 0.07, cutoff: 1800, at: S() / 2 }); blip(57, { gain: 0.055, dur: 0.14, cutoff: 1200, at: S() }); }
    },
    snareStun: ({ down = false } = {}) => {
        noise({ dur: 0.05, gain: 0.08, f0: 1200, q: 3 }); tone({ f0: NOTE(52), dur: 0.08, type: 'triangle', gain: 0.12 });
        [88, 84, 88].forEach((n, i) => tone({ f0: NOTE(n), dur: 0.05, type: 'sine', gain: 0.022, at: (1 + i) * S() / 2 }));
        if (down) { noise({ dur: 0.05, gain: 0.12, f0: 4500, type: 'highpass', at: S() / 4 }); noise({ dur: 0.12, gain: 0.06, f0: 2500, f1: 600, q: 4, at: S() / 4 }); tone({ f0: NOTE(46), dur: 0.16, type: 'square', gain: 0.035, cutoff: 900, at: S() / 4 }); }
    },
    snareCore: () => { tone({ f0: NOTE(45), dur: 0.7, type: 'sine', gain: 0.1, attack: 0.3 }); tone({ f0: NOTE(58), dur: 0.6, type: 'triangle', gain: 0.03, cutoff: 900, detune: -15, attack: 0.3 }); blip(82, { gain: 0.02, dur: 0.08, cutoff: 3000, at: 2 * S(), echo: 0.4 }); },
    snareBossDown: () => {
        sub(33, 33, 0.3, 0.25); stab([57, 64, 69], { gain: 0.045, dur: 0.25, cutoff: 2000 });
        [76, 79, 81].forEach((n, i) => blip(n, { gain: 0.055, dur: 0.08, cutoff: 3200, at: (1 + i) * S() }));
        stab([60, 67, 72, 76], { gain: 0.045, dur: 0.8, cutoff: 2800, at: 4 * S() }); tone({ f0: NOTE(88), dur: 0.9, type: 'sine', gain: 0.06, at: 4 * S() }); sub(33, 33, 0.9, 0.22, 4 * S());
        noise({ dur: 0.7, gain: 0.07, f0: 7000, f1: 2000, type: 'highpass', at: 4 * S() });
    },
    snareParry: () => { noise({ dur: 0.05, gain: 0.1, f0: 6500, q: 12 }); tone({ f0: NOTE(81), f1: NOTE(93), dur: 0.06, type: 'square', gain: 0.035, cutoff: 5000 }); tone({ f0: NOTE(81) * 2.76, dur: 0.25, type: 'sine', gain: 0.018, raw: true }); },
    snareSlash: () => { noise({ dur: 0.1, gain: 0.12, f0: 1500, f1: 9000, q: 3, attack: 0.06 }); tone({ f0: NOTE(64), dur: 0.08, type: 'sawtooth', gain: 0.035, cutoff: 2000, at: S() / 2 }); },
    snareSpoof: () => {
        tone({ f0: NOTE(52), f1: NOTE(76), dur: 0.12, type: 'square', gain: 0.035, cutoff: 3000 });
        [76, 75, 76].forEach((n, i) => blip(n, { gain: 0.03, dur: 0.03, cutoff: 4000, at: S() / 2 + i * S() / 4 }));
        tone({ f0: NOTE(69), dur: 0.1, type: 'triangle', gain: 0.05, at: 1.5 * S() });
    },
    snareGarbage: () => { noise({ dur: 0.15, gain: 0.12, f0: 3000, f1: 200, type: 'lowpass' }); tone({ f0: NOTE(45), f1: NOTE(40), dur: 0.14, type: 'square', gain: 0.04, cutoff: 900 }); tone({ f0: NOTE(76), f1: NOTE(81), dur: 0.1, type: 'sine', gain: 0.05, at: 2 * S() }); },
    snareRace: ({ step = 0 } = {}) => { tone({ f0: NOTE(raceNote(step)), dur: 0.045, type: 'triangle', gain: 0.05, cutoff: 3000 }); noise({ dur: 0.01, gain: 0.025, f0: 7000, q: 4 }); },
    snareHijack: () => { tone({ f0: NOTE(76), f1: NOTE(88), dur: 0.05, type: 'sine', gain: 0.045 }); tone({ f0: NOTE(76), f1: NOTE(88), dur: 0.05, type: 'sine', gain: 0.04, at: S() / 2 }); tone({ f0: NOTE(57), dur: 0.1, type: 'triangle', gain: 0.07, at: S() }); },
    snareTaken: () => tone({ f0: NOTE(79), f1: NOTE(84), dur: 0.04, type: 'triangle', gain: 0.035, cutoff: 4000 }),
    snareFlag: ({ flags = 1, limit = 3 } = {}) => {
        const k = Math.min(1, flags / Math.max(1, limit));
        blip(70, { gain: 0.045, dur: 0.05, cutoff: 1400 + 1600 * k }); blip(69, { gain: 0.04, dur: 0.06, cutoff: 1400 + 1600 * k, at: S() / 2 });
        if (flags >= limit - 1) blip(70, { gain: 0.035, dur: 0.04, cutoff: 3000, at: S() });
    },
    snareIds: () => { [76, 70, 76, 70, 76, 70].forEach((n, i) => blip(n, { gain: 0.045, dur: 0.05, cutoff: 3000, at: i * S() / 2 })); sub(33, 33, 0.15, 0.2); noise({ dur: 0.35, gain: 0.05, f0: 2000, f1: 5000, q: 3 }); },
    snareRebuild: () => { [0, 1, 2, 3].forEach(i => noise({ dur: 0.015, gain: 0.05, f0: 1200 + 600 * i, q: 3, at: i * S() / 4 })); tone({ f0: NOTE(45), dur: 0.1, type: 'triangle', gain: 0.11, at: S() }); blip(64, { gain: 0.035, dur: 0.06, cutoff: 1600, at: S() }); },
    snareHerdStun: () => { tone({ f0: NOTE(72), f1: NOTE(52), dur: 0.22, type: 'square', gain: 0.035, cutoff: 1200 }); noise({ dur: 0.03, gain: 0.04, f0: 6000, type: 'highpass' }); },
    // An investor's reward claimed: a bright figure, varied.
    claim: () => [
        () => arp([76, 81, 84, 88, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
        () => arp([81, 88, 84, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
        () => arp([72, 76, 79, 84, 88], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 })
    ][vary('claim', 3)](),
    error: () => tone({ f0: NOTE(64), f1: NOTE(57), dur: 0.12, type: 'square', gain: 0.045, cutoff: 1800 }),
    // A sprint: a filter riser as strong as the charge, and a sub drop to A.
    sprint: ({ charge = 1 } = {}) => {
        noise({ dur: 0.25 + 0.25 * charge, gain: 0.12 + 0.2 * charge, f0: 300, f1: 1800 + 2000 * charge, q: 0.8 });
        sub(45, 33, 0.2, 0.28 * charge);
    },
    clean: () => echo((g, at = 0) => { blip(88, { gain: 0.08 * g, at }); blip(93, { gain: 0.06 * g, at: at + S() / 2, dur: 0.14 }); }),
    perfect: () => echo((g, at = 0) => arp([81, 84, 88, 93], S() / 2, { gain: 0.07 * g, at }), 0.35),
    system: () => {
        echo((g, at = 0) => arp([69, 72, 76, 79, 81, 84, 88, 91, 93], S() / 2, { gain: 0.06 * g, at }), 0.3);
        noise({ dur: 0.8, gain: 0.08, f0: 4000, f1: 9000, type: 'highpass' });
    },
    breakthrough: () => {
        sub(33, 21, 0.6, 0.45);
        noise({ dur: 0.5, gain: 0.25, f0: 200, f1: 3000, q: 0.6 });
        stab([57, 64, 69, 72], { at: S(), gain: 0.06, dur: 0.35, cutoff: 2600 });
    },
    smash: () => { noise({ dur: 0.9, gain: 0.4, f0: 1200, f1: 120, q: 0.5, type: 'lowpass' }); sub(33, 21, 0.8, 0.5); stab([45, 52, 57], { gain: 0.07, dur: 0.5, cutoff: 900 }); },
    windup: () => tone({ f0: NOTE(45), f1: NOTE(69), dur: 0.6, type: 'sawtooth', gain: 0.05, attack: 0.3, cutoff: 3000 }),
    // Act two: off a crest (a riser up a fifth), and back down (a sub thump, harder the harder it lands).
    launch: () => { noise({ dur: 0.35, gain: 0.15, f0: 400, f1: 2400, q: 1.2 }); tone({ f0: NOTE(69), f1: NOTE(76), dur: 0.2, type: 'triangle', gain: 0.04 }); },
    land: ({ impact = 3 } = {}) => {
        const k = Math.min(1, impact / 15);
        sub(45, 33, 0.15 + 0.2 * k, 0.12 + 0.35 * k);
        noise({ dur: 0.2 + 0.2 * k, gain: 0.06 + 0.15 * k, f0: 500, f1: 150, type: 'lowpass' });
    },
    // Learning a skill: stabs on the 16ths, Am, Am, G, then Am held with a high E.
    summit: () => {
        const s = S();
        stab([57, 64, 69, 72], { gain: 0.06 });
        stab([57, 64, 69, 72], { gain: 0.05, at: s });
        stab([55, 62, 67, 71], { gain: 0.06, at: 3 * s });
        stab([57, 64, 69, 72, 76], { gain: 0.05, at: 4 * s, dur: 1.1, cutoff: 3200 });
        tone({ f0: NOTE(88), dur: 1.1, type: 'sine', gain: 0.08, at: 4 * s });
        sub(33, 33, 1, 0.25, 4 * s);
    },
    nearMiss: () => tone({ f0: NOTE(76), f1: NOTE(74), dur: 0.6, type: 'triangle', gain: 0.08 }),
    runEnd: ({ good = false } = {}) => good ? arp([76, 81], S(), { gain: 0.07 }) : tone({ f0: NOTE(72), f1: NOTE(69), dur: 0.3, type: 'triangle', gain: 0.08, cutoff: 1500 }),
    record: () => arp([81, 84, 88, 93], S(), { gain: 0.06 }),
    crunch: () => { noise({ dur: 0.4, gain: 0.15, f0: 900, f1: 300 }); stab([45, 52], { type: 'square', gain: 0.07, cutoff: 1200, q: 8 }); },
    flow: () => [57, 64, 69, 72].forEach((n, i) => tone({ f0: NOTE(n), dur: 1.2, type: 'sine', gain: 0.07, at: i * S(), attack: 0.1 })),
    freeze: () => tone({ f0: NOTE(93), f1: NOTE(45), dur: 0.7, type: 'sine', gain: 0.15 }),
    release: () => { noise({ dur: 0.6, gain: 0.3, f0: 200, f1: 5000, q: 0.5 }); sub(33, 21, 0.6, 0.45); stab([57, 64, 69], { gain: 0.06 }); },
    viral: () => arp([69, 72, 76, 79, 81, 84], S() / 2, { gain: 0.06 }),
    achievement: () => arp([76, 81, 84, 88], S(), { gain: 0.07 }),
    phase: () => { arp([57, 64, 69, 72, 76, 81, 84, 88], S() / 2, { gain: 0.06 }); stab([57, 64, 69], { gain: 0.04, at: 4 * S(), dur: 1.2 }); sub(33, 33, 1.4, 0.2); },
    ship: () => { arp([57, 64, 69, 76, 81], S(), { type: 'sawtooth', gain: 0.05, cutoff: 2200 }); sub(33, 33, 1.6, 0.25); },
    ui: () => noise({ dur: 0.025, gain: 0.05, f0: 9000, type: 'highpass' })
};

// ---- Packet Snare's effects in Classic: TRACK_SOUNDS.classic (sfx.js lines 540-596) ----
classic: {
    // Dub techno, quiet: muted saw plucks, filtered square blips, sub thumps, a delay throw.
    snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'sawtooth', dur: 0.07, gain: 0.06, cutoff: 900 + 250 * i, q: 7, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.04, gain: 0.035, at: lastAt(f) }); noise({ dur: 0.015, gain: 0.04, f0: 6000, q: 3 }); },
    snareSpoil: () => { T(52, { to: 45, type: 'sawtooth', dur: 0.28, gain: 0.05, cutoff: 700, q: 4, detune: -20 }); T(53, { to: 46, type: 'sawtooth', dur: 0.28, gain: 0.04, cutoff: 700, q: 4 }); noise({ dur: 0.12, gain: 0.07, f0: 300, type: 'lowpass' }); },
    snareSnap: () => { noise({ dur: 0.03, gain: 0.12, f0: 7000, q: 2 }); noise({ dur: 0.08, gain: 0.05, f0: 1800, f1: 600, q: 5, at: 0.02 }); T(45, { type: 'sine', dur: 0.1, gain: 0.14 }); },
    snareLaser: () => { T(100, { to: 81, type: 'sine', dur: 0.06, gain: 0.045 }); T(88, { type: 'square', dur: 0.025, gain: 0.015, cutoff: 5000 }); },
    snareChain: () => [81, 84, 88].forEach((n, i) => { noise({ dur: 0.02, gain: 0.05, f0: 4000 + 2000 * i, q: 8, at: i * S() / 4 }); T(n, { type: 'square', dur: 0.03, gain: 0.015, cutoff: 4000, at: i * S() / 4 }); }),
    snareSweep: () => { [0, 2].forEach(k => stab([64, 69], { at: k * S(), dur: 0.14, gain: 0.05, cutoff: 1400, q: 6 })); noise({ dur: 0.5, gain: 0.06, f0: 600, f1: 3000, q: 2, attack: 0.4 }); },
    snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => blip(n, { at: i * S() / 2, gain: 0.04 + 0.01 * i, cutoff: 1500 + 800 * i, dur: 0.05 })); T(45, { to: 57, type: 'sawtooth', dur: 0.45, gain: 0.045, cutoff: 1200, q: 8, attack: 0.3 }); },
    snareBoss: () => { sub(33, 30, 0.18, 0.32); sub(33, 30, 0.15, 0.22, 2 * S()); stab([45, 52, 57], { gain: 0.04, dur: 0.4, cutoff: 700, echo: 0.35 }); },
    snareHit: () => { T(57, { type: 'square', dur: 0.12, gain: 0.04, cutoff: 1600 }); tone({ f0: NOTE(mapNote(degShift(57, varDeg))) * 2.76, dur: 0.1, type: 'sine', gain: 0.025, raw: true }); noise({ dur: 0.04, gain: 0.08, f0: 3000, q: 6 }); },
    snarePlace: ({ kind = 'wall' }) => {
        if (kind === 'decoy') blip(76, { gain: 0.045, dur: 0.08, cutoff: 2000, echo: 0.4 });
        else if (kind === 'turret') { [0, 1].forEach(i => noise({ dur: 0.015, gain: 0.06, f0: 3500, q: 5, at: i * S() / 4 })); blip(64, { at: S() / 2, gain: 0.055, dur: 0.07, cutoff: 1800 }); }
        else if (kind === 'tower') { sub(45, 45, 0.2, 0.12); blip(69, { gain: 0.04, dur: 0.1 }); blip(76, { gain: 0.04, dur: 0.12, at: S() / 2 }); }
        else { T(45, { type: 'triangle', dur: 0.12, gain: 0.14 }); noise({ dur: 0.05, gain: 0.05, f0: 900, q: 2 }); blip(69, { gain: 0.035, dur: 0.05, cutoff: 1500, at: S() / 2 }); }
    },
    snareRemove: () => { T(72, { to: 64, type: 'square', dur: 0.07, gain: 0.04, cutoff: 1600 }); noise({ dur: 0.015, gain: 0.04, f0: 5000, q: 3 }); },
    snarePower: ({ kind = 'freeze' }) => {
        if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.1, f0: 500, f1: 7000, q: 1.2, attack: 3.5 * S() }); stab([57, 64, 69, 76], { gain: 0.035, dur: 0.35, cutoff: 2400, at: 4 * S(), echo: 0.3 }); }
        else { T(93, { to: 81, type: 'sine', dur: 0.6, gain: 0.05 }); noise({ dur: 0.7, gain: 0.08, f0: 5000, f1: 300, type: 'lowpass' }); sub(45, 33, 0.6, 0.12); }
    },
    snareZap: () => { T(88, { to: 64, type: 'square', dur: 0.05, gain: 0.035, cutoff: 3000 }); noise({ dur: 0.04, gain: 0.05, f0: 6000, type: 'highpass' }); },
    snareDecoy: () => { noise({ dur: 0.08, gain: 0.07, f0: 6000, type: 'highpass' }); T(84, { type: 'triangle', dur: 0.08, gain: 0.045 }); T(76, { type: 'triangle', dur: 0.1, gain: 0.04, at: S() / 2 }); },
    snareQuarantine: ({ partner = false }) => {
        noise({ dur: 0.02, gain: 0.08, f0: 5200, q: 6 }); noise({ dur: 0.025, gain: 0.08, f0: 3600, q: 6, at: S() / 4 }); T(45, { type: 'triangle', dur: 0.1, gain: 0.13, at: S() / 4 });
        if (partner) { seq([64, 67, 72], S() / 2, { type: 'sawtooth', dur: 0.2, gain: 0.03, cutoff: 1100, q: 3, detune: -8, at: S() / 2 }); T(76, { type: 'sine', dur: 0.3, gain: 0.025, at: 2 * S(), echo: 0.4 }); }
        else { blip(69, { gain: 0.05, dur: 0.07, cutoff: 1800, at: S() / 2 }); blip(57, { gain: 0.055, dur: 0.14, cutoff: 1200, at: S() }); sub(33, 33, 0.12, 0.12, S()); }
    },
    snareStun: ({ down = false }) => {
        noise({ dur: 0.05, gain: 0.08, f0: 1200, q: 3 }); T(52, { type: 'triangle', dur: 0.08, gain: 0.12 });
        seq([88, 84, 88], S() / 2, { type: 'sine', dur: 0.05, gain: 0.022, at: S() / 2 });
        if (down) { noise({ dur: 0.05, gain: 0.12, f0: 4500, type: 'highpass', at: S() / 4 }); noise({ dur: 0.12, gain: 0.06, f0: 2500, f1: 600, q: 4, at: S() / 4 }); T(46, { type: 'square', dur: 0.16, gain: 0.035, cutoff: 900, at: S() / 4 }); }
    },
    snareCore: () => { T(45, { type: 'sine', dur: 0.7, gain: 0.1, attack: 0.3 }); T(58, { type: 'sawtooth', dur: 0.6, gain: 0.02, cutoff: 800, q: 4, detune: -15, attack: 0.3 }); blip(82, { gain: 0.02, dur: 0.08, cutoff: 3000, at: 2 * S(), echo: 0.4 }); },
    snareBossDown: () => {
        sub(33, 33, 0.3, 0.25); stab([57, 64, 69], { gain: 0.045, dur: 0.25, cutoff: 2000 });
        seq([76, 79, 81], S(), { type: 'square', dur: 0.08, gain: 0.055, cutoff: 3200, at: S() });
        stab([60, 67, 72, 76], { gain: 0.045, dur: 0.8, cutoff: 2800, at: 4 * S(), echo: 0.3 }); T(88, { type: 'sine', dur: 0.9, gain: 0.06, at: 4 * S() }); sub(33, 33, 0.9, 0.22, 4 * S());
        noise({ dur: 0.7, gain: 0.07, f0: 7000, f1: 2000, type: 'highpass', at: 4 * S() });
    },
    snareParry: () => { noise({ dur: 0.05, gain: 0.1, f0: 6500, q: 12 }); T(81, { to: 93, type: 'square', dur: 0.06, gain: 0.035, cutoff: 5000 }); ping(81, 2.76, { dur: 0.25, gain: 0.018 }); },
    snareSlash: () => { noise({ dur: 0.1, gain: 0.12, f0: 1500, f1: 9000, q: 3, attack: 0.06 }); T(64, { type: 'sawtooth', dur: 0.08, gain: 0.035, cutoff: 2000, q: 5, at: S() / 2 }); },
    snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.035, cutoff: 3000 }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.03, gain: 0.025, cutoff: 4000, at: S() / 2 }); T(69, { type: 'triangle', dur: 0.1, gain: 0.05, at: 1.5 * S(), echo: 0.35 }); },
    snareGarbage: () => { noise({ dur: 0.15, gain: 0.12, f0: 3000, f1: 200, type: 'lowpass' }); T(45, { to: 40, type: 'square', dur: 0.14, gain: 0.04, cutoff: 900 }); T(76, { to: 81, type: 'sine', dur: 0.1, gain: 0.05, at: 2 * S() }); },
    snareRace: ({ step = 0 }) => { T(raceNote(step), { type: 'triangle', dur: 0.045, gain: 0.05, cutoff: 3000 }); noise({ dur: 0.01, gain: 0.025, f0: 7000, q: 4 }); },
    snareHijack: () => { T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.045 }); T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.04, at: S() / 2 }); blip(57, { gain: 0.05, dur: 0.1, cutoff: 1400, at: S() }); },
    snareTaken: () => T(79, { to: 84, type: 'triangle', dur: 0.04, gain: 0.035, cutoff: 4000 }),
    snareFlag: ({ flags = 1, limit = 3 }) => {
        const k = Math.min(1, flags / Math.max(1, limit));
        blip(70, { gain: 0.045, dur: 0.05, cutoff: 1400 + 1600 * k }); blip(69, { gain: 0.04, dur: 0.06, cutoff: 1400 + 1600 * k, at: S() / 2 });
        if (flags >= limit - 1) blip(70, { gain: 0.035, dur: 0.04, cutoff: 3000, at: S() });
    },
    snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.045, cutoff: 3000 }); sub(33, 33, 0.15, 0.2); noise({ dur: 0.35, gain: 0.05, f0: 2000, f1: 5000, q: 3 }); },
    snareRebuild: () => { [0, 1, 2, 3].forEach(i => noise({ dur: 0.015, gain: 0.05, f0: 1200 + 600 * i, q: 3, at: i * S() / 4 })); T(45, { type: 'triangle', dur: 0.1, gain: 0.11, at: S() }); blip(64, { gain: 0.035, dur: 0.06, cutoff: 1600, at: S() }); },
    snareHerdStun: () => { T(72, { to: 52, type: 'square', dur: 0.22, gain: 0.035, cutoff: 1200 }); noise({ dur: 0.03, gain: 0.04, f0: 6000, type: 'highpass' }); }
},
