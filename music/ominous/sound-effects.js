// Ominous: its sound effects. A copy from sfx.js, taken 2026-11-14; reference only.
// Effects not listed here play Classic's (../classic/sound-effects.js, SOUNDS) through this track's profile.
// The engine (tone, noise, the grid, variations, groups, the sprint meter): ../shared/sound-engine.js.

// ---- Key and scale: KEYS (sfx.js lines 182-182) ----
ominous: { root: 60, set: [0, 1, 3, 6, 7] },            // C with its flat second and tritone: C Db Eb F# G

// ---- Profile for every shared effect: PROFILES (sfx.js lines 229-231) ----
// Ominous: an octave down, slow swells with a long tail and a detuned shadow, each answered by an echo.
ominous: { wave: t => (t === 'square' ? 'triangle' : t), oct: -1, cut: 0.45, lp: 1600, gain: 0.9, len: 1.7, attack: 0.02, detune: -14, echo: 0.3,
    noise: n => ({ ...n, dur: n.dur * 1.4, f0: n.f0 * 0.6, f1: n.f1 * 0.6 }) },

// ---- Simple sounds' voice: SIMPLE_VOICE (sfx.js lines 982-982) ----
ominous: { type: 'sine', oct: -12, len: 1.8, gain: 1, attack: 0.02 },

// ---- Sprint meter levels (arpeggio, hops, acid, gated chord, thrust): CHARGE_TRIM (sfx.js lines 1126-1126) ----
ominous: [0.74, 2.46, 4.37, 7.33, 1.34],

// ---- Sprint meter levels, simple sounds (sfx.js lines 1131-1131) ----
's:ominous': [0.22, 0.83, 2.38, 3.32, 2.11],

// ---- Packet Snare levels: SNARE_TRIM (sfx.js lines 514-514) ----
ominous: { snareCatch: 1.58, snareSpoil: 2.14, snareSnap: 1.86, snareLaser: 1.64, snareChain: 8.85, snareSweep: 1.39, snareCharge: 3.01, snareBoss: 0.88, snareHit: 1.27, 'snarePlace:wall': 0.96, 'snarePlace:decoy': 1.96, 'snarePlace:turret': 1.81, 'snarePlace:tower': 0.79, snareRemove: 1.54, 'snarePower:freeze': 0.86, 'snarePower:purge': 1.22, snareZap: 2.3, snareDecoy: 1.59, snareQuarantine: 1.14, snareStun: 1.32, snareCore: 0.9, snareBossDown: 0.59, snareParry: 1.87, snareSlash: 2.19, snareSpoof: 2.8, snareGarbage: 1.74, snareRace: 2.48, snareHijack: 2.64, snareTaken: 4.04, snareFlag: 2.27, snareIds: 0.93, snareRebuild: 1.79, snareHerdStun: 2.1 },

// ---- Packet Snare levels, simple sounds (sfx.js lines 519-519) ----
's:ominous': { snareCatch: 0.9, snareSpoil: 1.06, snareSnap: 2.48, snareLaser: 2.17, snareChain: 1.8, snareSweep: 2.25, snareCharge: 1.23, snareBoss: 2.28, snareHit: 0.88, 'snarePlace:wall': 1.16, 'snarePlace:decoy': 1.24, 'snarePlace:turret': 1.14, 'snarePlace:tower': 1.18, snareRemove: 1.09, 'snarePower:freeze': 1.18, 'snarePower:purge': 1.4, snareZap: 1.68, snareDecoy: 1.49, snareQuarantine: 1.04, snareStun: 1.38, snareCore: 1.44, snareBossDown: 0.83, snareParry: 2.41, snareSlash: 1.53, snareSpoof: 1.71, snareGarbage: 2.25, snareRace: 2.47, snareHijack: 2.06, snareTaken: 3.91, snareFlag: 1.53, snareIds: 1.8, snareRebuild: 1.4, snareHerdStun: 1.27 },

// ---- Instruments for its effects (sfx.js lines 478-484) ----
// Ominous: tolling bells with an inharmonic partial, knocks, reversed swells, drones (C, b2, tritone).
const toll = (n, o = {}) => {
    T(n, { type: 'sine', dur: 1.6, gain: 0.06, ...o });
    tone({ f0: NOTE(mapNote(degShift(n, varDeg))) * 2.76, dur: 0.6, type: 'sine', gain: (o.gain ?? 0.06) * 0.25, at: o.at, raw: true });
};
const knock = (n, o = {}) => { T(n, { type: 'triangle', dur: 0.09, gain: 0.07, cutoff: 900, ...o }); noise({ dur: 0.05, gain: 0.03, f0: 700, q: 3, at: o.at }); };
const swellUp = (dur, gain) => noise({ dur, gain, f0: 300, f1: 2400, type: 'lowpass', attack: dur * 0.85 });

// ---- Effects written again for Ominous: TRACK_SOUNDS.ominous (sfx.js lines 777-869) ----
ominous: {
    // Compute a knock, data a ghostly ping with its echo, research a short toll.
    click: ({ res = 'cp' }) => {
        const n = clickNote(res);
        if (res === 'cp') { knock(n, { gain: 0.18, cutoff: 1900 }); T(n + 24, { type: 'sine', dur: 0.04, gain: 0.045 }); }
        else if (res === 'rp') toll(n - 12, { gain: 0.065, dur: 0.7 });
        else T(n, { type: 'sine', dur: 0.22, gain: phone(0.052), detune: -15, echo: 0.4 });
    },
    buy: ({ panel = 'hardware', big }) => {
        const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
        const figs = [[45, 52], [45, 48], [52, 45], [48, 45]];
        const f = figs[vary('buy:ominous:' + inst, figs.length)].map(n => n + o + 12);
        if (inst === 0) f.forEach((n, i) => toll(n, { at: i * S() * 2, gain: 0.06 }));
        else if (inst === 1) f.forEach((n, i) => T(n + 24, { type: 'sine', dur: 0.9, gain: 0.025, at: i * S(), detune: -12, echo: 0.35 }));
        else f.forEach((n, i) => T(n, { type: 'triangle', dur: 1, gain: 0.04, attack: 0.15, detune: i ? 12 : -12, cutoff: 1400, at: i * S() }));
        if (big) { swellUp(0.5, 0.12); T(33, { to: 24, dur: 1.2, gain: 0.3, at: 0.45 }); }
    },
    claim: () => [81, 76, 69].forEach((n, i) => toll(n, { at: i * S(), gain: 0.04 })),
    error: () => { T(64, { type: 'sawtooth', dur: 0.3, gain: 0.03, cutoff: 1500 }); T(65, { type: 'sawtooth', dur: 0.3, gain: 0.03, cutoff: 1500 }); },
    ui: () => noise({ dur: 0.025, gain: 0.06, f0: 4000, q: 8 }),
    sprint: ({ charge = 1 }) => { swellUp(0.3 + 0.2 * charge, 0.08 + 0.15 * charge); T(33, { to: 26, dur: 0.6, gain: 0.25 * charge, at: 0.25 + 0.17 * charge }); },
    clean: () => T(76, { type: 'sine', dur: 0.9, gain: 0.04, echo: 0.4 }),
    perfect: () => { toll(69, { gain: 0.05 }); toll(76, { gain: 0.04, at: S() }); },
    summit: () => {
        toll(45, { gain: 0.09 });
        [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 2.4, gain: 0.03, attack: 0.4, cutoff: 1200, detune: -10 }));
        toll(81, { at: 4 * S(), gain: 0.04 });
        T(33, { dur: 2, gain: 0.2, attack: 0.3 });
    },
    achievement: () => { toll(69, { gain: 0.05 }); toll(64, { gain: 0.05, at: 2 * S() }); },
    land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(45, { to: 33, dur: 0.5 + 0.4 * k, gain: 0.15 + 0.25 * k }); noise({ dur: 0.6 + 0.4 * k, gain: 0.05 + 0.1 * k, f0: 400, f1: 80, type: 'lowpass' }); },
    launch: () => { swellUp(0.35, 0.1); T(64, { to: 69, type: 'sine', dur: 0.4, gain: 0.03, detune: -12 }); },
    runEnd: ({ good }) => good ? toll(76, { gain: 0.05 }) : T(60, { to: 57, type: 'sine', dur: 0.8, gain: 0.05, detune: -10 }),
    record: () => [69, 72, 76].forEach((n, i) => toll(n, { at: i * S(), gain: 0.04 })),
    nearMiss: () => T(64, { to: 62, type: 'sawtooth', dur: 0.9, gain: 0.03, cutoff: 700 }),
    breakthrough: () => { swellUp(0.5, 0.2); T(33, { to: 21, dur: 1.2, gain: 0.45, at: 0.45 }); [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 1.2, gain: 0.035, at: 0.45, cutoff: 1500 })); },
    phase: () => { toll(45, { gain: 0.08 }); toll(57, { at: 2 * S(), gain: 0.06 }); toll(69, { at: 4 * S(), gain: 0.05 }); T(33, { dur: 2.2, gain: 0.2, attack: 0.3 }); },
    ship: () => { [0, 2, 4].forEach(k => toll(45 + k * 6, { at: k * S(), gain: 0.06 })); T(33, { dur: 2.4, gain: 0.22, attack: 0.4 }); },
    // Packet Snare, creeping: muffled detuned triangles, knocks, a bell's warning down to the flat second,
    // a deep heartbeat with a toll, reversed swells.
    snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'triangle', dur: 0.08, gain: 0.065, cutoff: 800, detune: -12, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.3, gain: 0.014, detune: -15, at: lastAt(f) }); },
    snareSpoil: () => { T(52, { to: 45, type: 'sawtooth', dur: 0.45, gain: 0.03, cutoff: 500 }); T(53, { to: 46, type: 'sawtooth', dur: 0.45, gain: 0.03, cutoff: 500 }); noise({ dur: 0.4, gain: 0.05, f0: 300, f1: 80, type: 'lowpass' }); },
    snareSnap: () => { noise({ dur: 0.03, gain: 0.08, f0: 4500, q: 6 }); knock(45, { gain: 0.1, cutoff: 600 }); },
    snareLaser: () => T(96, { to: 76, type: 'sine', dur: 0.1, gain: 0.035, detune: -15 }),
    snareChain: () => [0, 1, 2].forEach(i => noise({ dur: 0.03, gain: 0.05, f0: 3000 + 1200 * i, q: 10, at: i * S() / 4 })),
    snareSweep: () => { toll(64, { gain: 0.05, dur: 0.8 }); toll(58, { gain: 0.045, dur: 0.8, at: 2 * S() }); },
    snareCharge: () => { swellUp(4 * S(), 0.08); seq([57, 58, 60, 63], S() / 2, { type: 'triangle', dur: 0.1, gain: 0.045, cutoff: 1200, detune: -10 }); },
    snareBoss: () => { T(33, { to: 28, dur: 0.25, gain: 0.32 }); T(33, { to: 28, dur: 0.2, gain: 0.22, at: 2 * S() }); toll(45, { gain: 0.05, dur: 1.2 }); },
    snareHit: () => { toll(57, { gain: 0.05, dur: 0.4 }); knock(52, { gain: 0.06 }); },
    snarePlace: ({ kind = 'wall' }) => {
        if (kind === 'decoy') T(76, { type: 'sine', dur: 0.3, gain: 0.035, detune: -15, echo: 0.4 });
        else if (kind === 'turret') { knock(64, { gain: 0.06 }); knock(64, { gain: 0.05, at: S() / 2 }); }
        else if (kind === 'tower') { toll(57, { gain: 0.045, dur: 0.9 }); T(33, { dur: 0.5, gain: 0.1, attack: 0.1 }); }
        else { knock(45, { gain: 0.11, cutoff: 700 }); T(33, { dur: 0.25, gain: 0.12 }); }
    },
    snareRemove: () => T(64, { to: 57, type: 'triangle', dur: 0.2, gain: 0.045, cutoff: 900, detune: -10 }),
    snarePower: ({ kind = 'freeze' }) => {
        if (kind === 'purge') { swellUp(4 * S(), 0.14); toll(69, { gain: 0.05, at: 4 * S() }); toll(76, { gain: 0.04, at: 5 * S() }); }
        else { T(93, { to: 69, type: 'sine', dur: 1, gain: 0.035, detune: -15 }); noise({ dur: 1, gain: 0.07, f0: 2500, f1: 100, type: 'lowpass' }); T(33, { dur: 1, gain: 0.15, attack: 0.2 }); }
    },
    snareZap: () => { T(81, { to: 64, type: 'triangle', dur: 0.08, gain: 0.04, cutoff: 2000 }); noise({ dur: 0.04, gain: 0.04, f0: 5000, q: 4 }); },
    snareDecoy: () => { noise({ dur: 0.12, gain: 0.05, f0: 6000, type: 'highpass' }); T(82, { type: 'sine', dur: 0.4, gain: 0.025, detune: -15 }); T(76, { type: 'sine', dur: 0.4, gain: 0.025, detune: -15, at: S() }); },
    snareQuarantine: ({ partner = false }) => {
        noise({ dur: 0.03, gain: 0.07, f0: 4000, q: 8 }); knock(45, { gain: 0.1, cutoff: 700, at: S() / 4 });
        if (partner) { toll(64, { gain: 0.035, dur: 0.9, at: S() / 2 }); T(67, { type: 'triangle', dur: 0.6, gain: 0.03, cutoff: 900, detune: -15, at: S() }); }
        else { knock(57, { gain: 0.07, at: S() / 2 }); toll(45, { gain: 0.045, dur: 0.8, at: S() }); }
    },
    snareStun: ({ down = false }) => {
        knock(52, { gain: 0.1 }); T(88, { type: 'sine', dur: 0.25, gain: 0.015, detune: -15, at: S() / 2 }); T(82, { type: 'sine', dur: 0.25, gain: 0.012, detune: -15, at: S() });
        if (down) { noise({ dur: 0.06, gain: 0.07, f0: 3000, q: 5, at: S() / 4 }); toll(46, { gain: 0.04, dur: 0.6, at: S() / 4 }); }
    },
    snareCore: () => { swellUp(4 * S(), 0.05); T(33, { dur: 1, gain: 0.15, attack: 0.4 }); toll(58, { gain: 0.025, dur: 1.2, at: 4 * S() }); },
    snareBossDown: () => {
        T(33, { to: 28, dur: 0.4, gain: 0.3 }); toll(57, { gain: 0.05, dur: 1 });
        seq([64, 67, 69], S(), { type: 'triangle', dur: 0.2, gain: 0.05, cutoff: 1400, detune: -10, at: S() });
        toll(69, { gain: 0.06, dur: 1.4, at: 4 * S() }); [45, 52, 57].forEach(n => T(n, { type: 'triangle', dur: 1.2, gain: 0.035, cutoff: 900, attack: 0.05, at: 4 * S() })); T(33, { dur: 1, gain: 0.22, at: 4 * S() });
    },
    snareParry: () => { noise({ dur: 0.04, gain: 0.09, f0: 6000, q: 12 }); toll(81, { gain: 0.03, dur: 0.5 }); T(76, { to: 88, type: 'triangle', dur: 0.06, gain: 0.03, cutoff: 3000 }); },
    snareSlash: () => { noise({ dur: 0.12, gain: 0.1, f0: 1200, f1: 7000, q: 3, attack: 0.08 }); knock(45, { gain: 0.07, at: S() / 2 }); },
    snareSpoof: () => { T(52, { to: 76, type: 'triangle', dur: 0.15, gain: 0.04, cutoff: 2000, detune: -15 }); seq([76, 75, 76], S() / 4, { type: 'sine', dur: 0.04, gain: 0.025, detune: -15, at: S() / 2 }); T(69, { type: 'sine', dur: 0.3, gain: 0.03, detune: -15, at: 1.5 * S() }); },
    snareGarbage: () => { noise({ dur: 0.25, gain: 0.08, f0: 2000, f1: 100, type: 'lowpass' }); knock(40, { gain: 0.1, cutoff: 500 }); T(76, { to: 81, type: 'sine', dur: 0.2, gain: 0.03, detune: -15, at: 2 * S() }); },
    snareRace: ({ step = 0 }) => knock(raceNote(step), { gain: 0.035, cutoff: 1600 }),
    snareHijack: () => { T(64, { to: 76, type: 'triangle', dur: 0.12, gain: 0.04, cutoff: 1800, detune: -10 }); T(76, { to: 88, type: 'sine', dur: 0.08, gain: 0.025, at: S() / 2 }); knock(57, { gain: 0.06, at: S() }); },
    snareTaken: () => T(79, { to: 84, type: 'sine', dur: 0.06, gain: 0.025, detune: -15 }),
    snareFlag: ({ flags = 1, limit = 3 }) => {
        const k = Math.min(1, flags / Math.max(1, limit));
        T(70, { type: 'triangle', dur: 0.1, gain: 0.045, cutoff: 1000 + 1500 * k, detune: -10 }); T(69, { type: 'triangle', dur: 0.12, gain: 0.04, cutoff: 1000 + 1500 * k, detune: -10, at: S() / 2 });
        if (flags >= limit - 1) knock(70, { gain: 0.04, at: S() });
    },
    snareIds: () => { toll(70, { gain: 0.04, dur: 0.6 }); seq([76, 70, 76, 70], S(), { type: 'triangle', dur: 0.12, gain: 0.045, cutoff: 1800 }); T(33, { dur: 0.2, gain: 0.2 }); },
    snareRebuild: () => { [45, 52, 57, 64].forEach((n, i) => knock(n, { gain: 0.05, at: i * S() / 4 })); T(69, { type: 'sine', dur: 0.3, gain: 0.025, detune: -15, at: S() }); },
    snareHerdStun: () => { T(72, { to: 48, type: 'triangle', dur: 0.35, gain: 0.04, cutoff: 1200, detune: -12 }); noise({ dur: 0.05, gain: 0.03, f0: 4000, q: 4 }); }
},
