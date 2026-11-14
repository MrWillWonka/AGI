// Soft: its sound effects. A copy from sfx.js, taken 2026-11-14; reference only.
// Effects not listed here play Classic's (../classic/sound-effects.js, SOUNDS) through this track's profile.
// The engine (tone, noise, the grid, variations, groups, the sprint meter): ../shared/sound-engine.js.

// ---- Key and scale: KEYS (sfx.js lines 181-181) ----
soft: { root: 53, set: [0, 2, 4, 7, 9] },               // F major pentatonic: F G A C D

// ---- Profile for every shared effect: PROFILES (sfx.js lines 226-228) ----
// Soft: rounded triangles, a slower attack, a darker filter, a little longer.
soft: { wave: t => (t === 'square' || t === 'sawtooth' ? 'triangle' : t), cut: 0.55, lp: 2200, gain: 0.85, len: 1.25, attack: 0.012,
    noise: n => ({ ...n, gain: n.gain * 0.7 }) },

// ---- Simple sounds' voice: SIMPLE_VOICE (sfx.js lines 981-981) ----
soft: { type: 'sine', oct: 0, len: 1.4, gain: 1, attack: 0.008 },

// ---- Sprint meter levels (arpeggio, hops, acid, gated chord, thrust): CHARGE_TRIM (sfx.js lines 1125-1125) ----
soft: [1.72, 2.31, 6.47, 7.14, 3.05],

// ---- Sprint meter levels, simple sounds (sfx.js lines 1130-1130) ----
's:soft': [0.17, 0.72, 6.12, 5.25, 3.8],

// ---- Packet Snare levels: SNARE_TRIM (sfx.js lines 513-513) ----
soft: { snareCatch: 1.37, snareSpoil: 0.6, snareSnap: 1.16, snareLaser: 1.77, snareChain: 1.77, snareSweep: 1.59, snareCharge: 2.67, snareBoss: 0.97, snareHit: 1.22, 'snarePlace:wall': 0.74, 'snarePlace:decoy': 1.59, 'snarePlace:turret': 2.01, 'snarePlace:tower': 0.96, snareRemove: 1.53, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.39, snareZap: 2, snareDecoy: 1.72, snareQuarantine: 0.85, snareStun: 0.8, snareCore: 0.54, snareBossDown: 0.71, snareParry: 1.43, snareSlash: 2.27, snareSpoof: 1.68, snareGarbage: 1.11, snareRace: 3.14, snareHijack: 1.27, snareTaken: 4.12, snareFlag: 2.3, snareIds: 1.11, snareRebuild: 0.76, snareHerdStun: 1.57 },

// ---- Packet Snare levels, simple sounds (sfx.js lines 518-518) ----
's:soft': { snareCatch: 0.98, snareSpoil: 0.9, snareSnap: 1.65, snareLaser: 1.94, snareChain: 1.69, snareSweep: 2.5, snareCharge: 1.25, snareBoss: 1.36, snareHit: 0.9, 'snarePlace:wall': 1.19, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.25, 'snarePlace:tower': 1.29, snareRemove: 1.19, 'snarePower:freeze': 1.03, 'snarePower:purge': 1.37, snareZap: 1.66, snareDecoy: 1.55, snareQuarantine: 1.13, snareStun: 1.17, snareCore: 0.88, snareBossDown: 0.68, snareParry: 2.45, snareSlash: 1.62, snareSpoof: 1.78, snareGarbage: 1.62, snareRace: 2.59, snareHijack: 2.15, snareTaken: 4.06, snareFlag: 1.66, snareIds: 1.92, snareRebuild: 1.56, snareHerdStun: 1.38 },

// ---- Instruments for its effects (sfx.js lines 474-477) ----
// Soft: mallets and bells: a marimba, a kalimba, glassy bells and a warm pad (F major pentatonic).
const marimba = (n, o = {}) => { T(n, { type: 'sine', dur: 0.25, gain: 0.07, ...o }); T(n + 24, { type: 'sine', dur: 0.05, gain: (o.gain ?? 0.07) * 0.22, at: o.at }); };
const softBell = (n, o = {}) => { T(n, { type: 'sine', dur: 0.7, gain: 0.05, attack: 0.008, ...o }); T(n + 12, { type: 'triangle', dur: 0.25, gain: (o.gain ?? 0.05) * 0.25, at: o.at }); };
const padChord = (notes, o = {}) => notes.forEach(n => T(n, { type: 'triangle', dur: 1.4, gain: 0.025, attack: 0.15, cutoff: 1800, ...o }));

// ---- Effects written again for Soft: TRACK_SOUNDS.soft (sfx.js lines 690-776) ----
soft: {
    // Compute a marimba, data a glassy kalimba, research a bell.
    click: ({ res = 'cp' }) => {
        const n = clickNote(res);
        if (res === 'cp') { marimba(n, { gain: 0.06 }); T(n + 24, { type: 'sine', dur: 0.04, gain: 0.03 }); }
        else if (res === 'rp') softBell(n, { gain: 0.045 });
        else { T(n + 12, { type: 'sine', dur: 0.09, gain: phone(0.05) }); T(n + 24, { type: 'sine', dur: 0.03, gain: phone(0.015) }); }
    },
    buy: ({ panel = 'hardware', big }) => {
        const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
        const figs = [[57, 60, 64], [60, 64, 67], [64, 67, 72], [57, 64, 69]];
        const f = figs[vary('buy:soft:' + inst, figs.length)].map(n => n + o);
        if (inst === 0) f.forEach((n, i) => marimba(n, { at: i * S() / 2, gain: 0.06 }));
        else if (inst === 1) f.forEach((n, i) => T(n + 24, { type: 'sine', dur: 0.12, gain: 0.04, at: i * S() / 4 }));
        else f.forEach((n, i) => softBell(n + 12, { at: i * S(), gain: 0.04 }));
        if (big) padChord([57, 64, 69, 72], { at: S() * 2 });
    },
    claim: () => [88, 84, 81, 76].forEach((n, i) => softBell(n, { at: i * S() / 2, gain: 0.04 })),
    error: () => T(64, { to: 60, type: 'sine', dur: 0.28, gain: 0.05 }),
    ui: () => T(93, { type: 'sine', dur: 0.025, gain: 0.025 }),
    sprint: ({ charge = 1 }) => { noise({ dur: 0.3 + 0.3 * charge, gain: 0.05 + 0.1 * charge, f0: 400, f1: 1500, type: 'lowpass', attack: 0.06 }); T(45, { to: 57, type: 'sine', dur: 0.3, gain: 0.14 * charge, attack: 0.03 }); },
    clean: () => { softBell(76, { gain: 0.045 }); softBell(81, { gain: 0.035, at: S() / 2 }); },
    perfect: () => [69, 72, 76, 81, 84].forEach((n, i) => T(n, { type: 'sine', dur: 0.7, gain: 0.04, at: i * S() / 4 })),
    summit: () => { padChord([57, 64, 69, 72], { dur: 1.8 }); [76, 81, 84, 88].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.045 })); T(45, { type: 'sine', dur: 1.6, gain: 0.12, attack: 0.1 }); },
    achievement: () => [81, 88, 93].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })),
    land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(45, { to: 40, type: 'sine', dur: 0.2, gain: 0.08 + 0.2 * k }); noise({ dur: 0.25, gain: 0.04 + 0.08 * k, f0: 500, f1: 200, type: 'lowpass' }); },
    launch: () => { noise({ dur: 0.35, gain: 0.08, f0: 500, f1: 1800, type: 'lowpass', attack: 0.1 }); T(69, { to: 76, type: 'sine', dur: 0.3, gain: 0.04 }); },
    runEnd: ({ good }) => good ? [76, 81].forEach((n, i) => marimba(n, { at: i * S(), gain: 0.06 })) : [64, 60].forEach((n, i) => marimba(n, { at: i * S(), gain: 0.05 })),
    record: () => [81, 84, 88, 93].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })),
    nearMiss: () => T(76, { to: 74, type: 'sine', dur: 0.7, gain: 0.05 }),
    breakthrough: () => { noise({ dur: 0.6, gain: 0.1, f0: 300, f1: 2500, type: 'lowpass', attack: 0.4 }); padChord([57, 64, 69, 76], { at: 0.45, dur: 1.4 }); softBell(88, { at: 0.45, gain: 0.05 }); },
    phase: () => { [57, 64, 69, 72, 76, 81, 84, 88].forEach((n, i) => T(n, { type: 'sine', dur: 0.8, gain: 0.035, at: i * S() / 2 })); padChord([57, 64, 69], { at: 4 * S() }); },
    ship: () => { padChord([57, 64, 69, 72, 76], { dur: 2 }); [69, 76, 81, 88].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })); },
    // Packet Snare, secretive: muted triangles and glassy sines, soft bells, a sine heartbeat, a warm pad.
    snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'triangle', dur: 0.08, gain: 0.07, cutoff: 1000 + 200 * i, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.12, gain: 0.02, at: lastAt(f) }); },
    snareSpoil: () => { T(52, { to: 45, type: 'sine', dur: 0.35, gain: 0.09 }); T(53, { to: 46, type: 'triangle', dur: 0.3, gain: 0.035, cutoff: 600 }); noise({ dur: 0.15, gain: 0.04, f0: 400, type: 'lowpass' }); },
    snareSnap: () => { noise({ dur: 0.04, gain: 0.06, f0: 5000, q: 2 }); T(45, { type: 'sine', dur: 0.12, gain: 0.12 }); T(64, { type: 'triangle', dur: 0.05, gain: 0.03, cutoff: 1500 }); },
    snareLaser: () => T(96, { to: 84, type: 'sine', dur: 0.06, gain: 0.045 }),
    snareChain: () => [88, 91, 93].forEach((n, i) => T(n, { type: 'sine', dur: 0.05, gain: 0.03, at: i * S() / 4 })),
    snareSweep: () => { softBell(69, { gain: 0.05, dur: 0.4 }); softBell(64, { gain: 0.05, dur: 0.4, at: 2 * S() }); noise({ dur: 0.5, gain: 0.04, f0: 500, f1: 2000, type: 'lowpass', attack: 0.35 }); },
    snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => T(n, { type: 'sine', dur: 0.08, gain: 0.035 + 0.008 * i, at: i * S() / 2 })); noise({ dur: 0.45, gain: 0.05, f0: 300, f1: 2400, type: 'lowpass', attack: 0.4 }); },
    snareBoss: () => { T(45, { to: 40, type: 'sine', dur: 0.2, gain: 0.2 }); T(45, { to: 40, type: 'sine', dur: 0.16, gain: 0.14, at: 2 * S() }); padChord([45, 52, 57], { dur: 0.8, gain: 0.03, cutoff: 900 }); },
    snareHit: () => { T(57, { type: 'sine', dur: 0.15, gain: 0.08 }); T(76, { type: 'sine', dur: 0.08, gain: 0.025 }); noise({ dur: 0.03, gain: 0.03, f0: 2500, q: 4 }); },
    snarePlace: ({ kind = 'wall' }) => {
        if (kind === 'decoy') softBell(76, { gain: 0.035, dur: 0.4 });
        else if (kind === 'turret') { T(81, { type: 'sine', dur: 0.03, gain: 0.03 }); T(81, { type: 'sine', dur: 0.03, gain: 0.03, at: S() / 4 }); T(64, { type: 'triangle', dur: 0.15, gain: 0.05, cutoff: 1500, at: S() / 2 }); }
        else if (kind === 'tower') { padChord([57, 64, 69], { dur: 0.6, gain: 0.025 }); softBell(81, { gain: 0.035, at: S() / 2 }); }
        else { T(45, { type: 'sine', dur: 0.15, gain: 0.14 }); T(57, { type: 'triangle', dur: 0.12, gain: 0.045, cutoff: 1200, at: S() / 2 }); }
    },
    snareRemove: () => T(72, { to: 64, type: 'sine', dur: 0.12, gain: 0.05 }),
    snarePower: ({ kind = 'freeze' }) => {
        if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.06, f0: 400, f1: 4000, type: 'lowpass', attack: 3 * S() }); [69, 76, 81, 88].forEach((n, i) => softBell(n, { at: 4 * S() + i * S() / 2, gain: 0.035 })); }
        else { T(93, { to: 81, type: 'sine', dur: 0.8, gain: 0.045 }); noise({ dur: 0.8, gain: 0.06, f0: 3000, f1: 200, type: 'lowpass' }); padChord([57, 64, 72], { dur: 1.2, gain: 0.022, cutoff: 800 }); }
    },
    snareZap: () => { T(84, { to: 72, type: 'sine', dur: 0.06, gain: 0.045 }); noise({ dur: 0.03, gain: 0.03, f0: 6000, type: 'highpass' }); },
    snareDecoy: () => { noise({ dur: 0.08, gain: 0.04, f0: 7000, type: 'highpass' }); T(88, { type: 'sine', dur: 0.1, gain: 0.035 }); T(81, { type: 'sine', dur: 0.12, gain: 0.035, at: S() / 2 }); },
    snareQuarantine: ({ partner = false }) => {
        noise({ dur: 0.025, gain: 0.04, f0: 4000, q: 4 }); noise({ dur: 0.025, gain: 0.04, f0: 3000, q: 4, at: S() / 4 }); marimba(45, { gain: 0.1, at: S() / 4 });
        if (partner) { padChord([60, 64, 67], { dur: 0.7, gain: 0.025, at: S() / 2 }); T(76, { type: 'sine', dur: 0.3, gain: 0.03, at: S() }); }
        else { softBell(69, { gain: 0.04, dur: 0.3, at: S() / 2 }); marimba(57, { gain: 0.08, at: S() }); }
    },
    snareStun: ({ down = false }) => {
        marimba(52, { gain: 0.09 }); T(88, { type: 'sine', dur: 0.08, gain: 0.02, at: S() / 2 }); T(84, { type: 'sine', dur: 0.08, gain: 0.02, at: S() });
        if (down) { noise({ dur: 0.05, gain: 0.05, f0: 5000, type: 'highpass', at: S() / 4 }); T(46, { type: 'triangle', dur: 0.2, gain: 0.05, cutoff: 700, at: S() / 4 }); }
    },
    snareCore: () => { T(45, { type: 'sine', dur: 0.8, gain: 0.1, attack: 0.3 }); T(58, { type: 'sine', dur: 0.6, gain: 0.02, attack: 0.3, detune: -10 }); softBell(82, { gain: 0.015, dur: 0.5, at: 2 * S() }); },
    snareBossDown: () => {
        T(45, { type: 'sine', dur: 0.3, gain: 0.15 }); padChord([57, 64, 69], { dur: 0.5, gain: 0.03 });
        [64, 69, 72].forEach((n, i) => marimba(n, { gain: 0.07, at: (1 + i) * S() }));
        softBell(76, { gain: 0.06, dur: 1, at: 4 * S() }); padChord([60, 64, 67, 72], { dur: 1.2, gain: 0.03, at: 4 * S() }); T(45, { type: 'sine', dur: 0.6, gain: 0.12, at: 4 * S() });
    },
    snareParry: () => { softBell(88, { gain: 0.04, dur: 0.4 }); T(81, { to: 93, type: 'sine', dur: 0.05, gain: 0.03 }); noise({ dur: 0.03, gain: 0.04, f0: 7000, q: 8 }); },
    snareSlash: () => { noise({ dur: 0.1, gain: 0.06, f0: 1500, f1: 8000, q: 3, attack: 0.06 }); T(64, { type: 'sine', dur: 0.12, gain: 0.05, at: S() / 2 }); },
    snareSpoof: () => { T(52, { to: 76, type: 'triangle', dur: 0.12, gain: 0.05, cutoff: 2400 }); seq([76, 75, 76], S() / 4, { type: 'sine', dur: 0.04, gain: 0.03, at: S() / 2 }); marimba(69, { gain: 0.05, at: 1.5 * S() }); },
    snareGarbage: () => { noise({ dur: 0.18, gain: 0.06, f0: 2500, f1: 200, type: 'lowpass' }); T(45, { to: 40, type: 'sine', dur: 0.15, gain: 0.12 }); T(76, { to: 81, type: 'sine', dur: 0.1, gain: 0.045, at: 2 * S() }); },
    snareRace: ({ step = 0 }) => T(raceNote(step) + 12, { type: 'sine', dur: 0.05, gain: 0.03 }),
    snareHijack: () => { T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.04 }); T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.035, at: S() / 2 }); marimba(57, { gain: 0.06, at: S() }); },
    snareTaken: () => T(79, { to: 84, type: 'sine', dur: 0.04, gain: 0.03 }),
    snareFlag: ({ flags = 1, limit = 3 }) => {
        const k = Math.min(1, flags / Math.max(1, limit));
        T(70, { type: 'triangle', dur: 0.07, gain: 0.05, cutoff: 1200 + 1500 * k }); T(69, { type: 'triangle', dur: 0.09, gain: 0.045, cutoff: 1200 + 1500 * k, at: S() / 2 });
        if (flags >= limit - 1) T(82, { type: 'sine', dur: 0.06, gain: 0.025, at: S() });
    },
    snareIds: () => { [76, 70, 76, 70].forEach((n, i) => softBell(n, { gain: 0.045, dur: 0.22, at: i * S() })); T(45, { type: 'sine', dur: 0.15, gain: 0.12 }); },
    snareRebuild: () => { [57, 62, 64, 69].forEach((n, i) => marimba(n, { gain: 0.04 + 0.01 * i, at: i * S() / 4 })); noise({ dur: 0.02, gain: 0.03, f0: 3000, q: 3, at: S() }); },
    snareHerdStun: () => { T(72, { to: 52, type: 'sine', dur: 0.28, gain: 0.05 }); noise({ dur: 0.04, gain: 0.03, f0: 5000, type: 'highpass' }); }
},
