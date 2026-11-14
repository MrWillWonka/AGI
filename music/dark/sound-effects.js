// Dark: its sound effects. A copy from sfx.js, taken 2026-11-14; reference only.
// Effects not listed here play Classic's (../classic/sound-effects.js, SOUNDS) through this track's profile.
// The engine (tone, noise, the grid, variations, groups, the sprint meter): ../shared/sound-engine.js.

// ---- Key and scale: KEYS (sfx.js lines 180-180) ----
dark: { root: 52, set: [0, 1, 3, 7, 8] },               // E Phrygian: E F G B C

// ---- Profile for every shared effect: PROFILES (sfx.js lines 223-225) ----
// Dark: saws an octave down through a drive, a closed filter.
dark: { wave: t => ({ triangle: 'sawtooth', sine: 'triangle', square: 'sawtooth' })[t] || t, oct: -1, cut: 0.7, lp: 2400, gain: 0.8, drive: true,
    noise: n => ({ ...n, gain: n.gain * 1.1, f0: n.f0 * 0.8, f1: n.f1 * 0.8 }) },

// ---- Simple sounds' voice: SIMPLE_VOICE (sfx.js lines 980-980) ----
dark: { type: 'sawtooth', oct: 0, cutoff: 2200, len: 1, gain: 0.5 },

// ---- Sprint meter levels (arpeggio, hops, acid, gated chord, thrust): CHARGE_TRIM (sfx.js lines 1124-1124) ----
dark: [2.31, 4.21, 8.55, 9.11, 5.43],

// ---- Sprint meter levels, simple sounds (sfx.js lines 1129-1129) ----
's:dark': [2.02, 2.06, 11.3, 16, 6.39],

// ---- Packet Snare levels: SNARE_TRIM (sfx.js lines 512-512) ----
dark: { snareCatch: 1.39, snareSpoil: 0.68, snareSnap: 0.86, snareLaser: 1.55, snareChain: 5.41, snareSweep: 1.21, snareCharge: 0.48, snareBoss: 0.67, snareHit: 2.11, 'snarePlace:wall': 0.54, 'snarePlace:decoy': 3.05, 'snarePlace:turret': 2.13, 'snarePlace:tower': 0.77, snareRemove: 1.4, 'snarePower:freeze': 0.41, 'snarePower:purge': 1.05, snareZap: 1.79, snareDecoy: 1.88, snareQuarantine: 0.69, snareStun: 0.63, snareCore: 0.55, snareBossDown: 0.48, snareParry: 1.82, snareSlash: 2.08, snareSpoof: 1.98, snareGarbage: 0.48, snareRace: 3.8, snareHijack: 2.12, snareTaken: 3.14, snareFlag: 1.81, snareIds: 0.77, snareRebuild: 0.71, snareHerdStun: 1.79 },

// ---- Packet Snare levels, simple sounds (sfx.js lines 517-517) ----
's:dark': { snareCatch: 0.98, snareSpoil: 1.03, snareSnap: 2.08, snareLaser: 2.2, snareChain: 1.82, snareSweep: 2.46, snareCharge: 1.31, snareBoss: 1.43, snareHit: 0.98, 'snarePlace:wall': 1.3, 'snarePlace:decoy': 1.29, 'snarePlace:turret': 1.26, 'snarePlace:tower': 1.32, snareRemove: 1.23, 'snarePower:freeze': 1.06, 'snarePower:purge': 1.35, snareZap: 1.63, snareDecoy: 1.5, snareQuarantine: 1.12, snareStun: 1.28, snareCore: 0.82, snareBossDown: 0.69, snareParry: 2.48, snareSlash: 1.66, snareSpoof: 1.97, snareGarbage: 1.87, snareRace: 2.53, snareHijack: 2.02, snareTaken: 3.88, snareFlag: 1.77, snareIds: 1.94, snareRebuild: 1.51, snareHerdStun: 1.38 },

// ---- Instruments for its effects (sfx.js lines 471-473) ----
// Dark: industrial: distorted saws, metal hits, sub drops, flat seconds (E Phrygian).
const metal = (gain = 0.05, at = 0, f = 3200) => noise({ dur: 0.04, gain, f0: f, q: 9, at });
const saw = (n, o = {}) => T(n, { type: 'sawtooth', dur: 0.12, gain: 0.05, cutoff: 1500, q: 6, drive: true, ...o });

// ---- Effects written again for Dark: TRACK_SOUNDS.dark (sfx.js lines 597-689) ----
dark: {
    // Compute a short saw with a tick, data a metal tick on a thin square, research a detuned triangle ping.
    click: ({ res = 'cp' }) => {
        const n = clickNote(res);
        if (res === 'cp') { saw(n, { dur: 0.07, gain: 0.08, cutoff: 2400, q: 3 }); T(n + 24, { type: 'sine', dur: 0.035, gain: 0.1 }); noise({ dur: 0.012, gain: 0.08, f0: 3500, q: 2 }); }
        else if (res === 'rp') { T(n - 12, { type: 'triangle', dur: 0.2, gain: 0.05, detune: -20, drive: true }); T(n + 12, { type: 'sine', dur: 0.12, gain: 0.03 }); }
        else { T(n + 12, { type: 'square', dur: 0.04, gain: phone(0.05), cutoff: 6000 }); metal(phone(0.08), 0, 5200); }
    },
    buy: ({ panel = 'hardware', big }) => {
        const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
        const figs = [[57, 58, 57], [57, 64, 58], [64, 58, 57], [57, 57, 64]];
        const f = figs[vary('buy:dark:' + inst, figs.length)].map(n => n + o);
        if (inst === 0) seq(f, S() / 2, { type: 'sawtooth', dur: 0.12, gain: 0.05, cutoff: 1600, q: 5, drive: true });
        else if (inst === 1) { seq(f.map(n => n + 12), S() / 4, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 5000 }); metal(0.05, 0, 5200); }
        else seq(f, S(), { type: 'triangle', dur: 0.3, gain: 0.06, detune: -20, drive: true });
        if (big) { T(33, { to: 21, dur: 0.5, gain: 0.3 }); noise({ dur: 0.5, gain: 0.1, f0: 3000, f1: 700, type: 'highpass', at: S() * 2 }); }
    },
    claim: () => { seq([57, 64, 69], S() / 2, { type: 'sawtooth', dur: 0.15, gain: 0.05, cutoff: 2200, drive: true }); metal(0.06, S() * 1.5, 4500); },
    error: () => { T(64, { type: 'square', dur: 0.18, gain: 0.04, cutoff: 3000 }); T(65, { type: 'square', dur: 0.18, gain: 0.035, cutoff: 3000 }); },
    ui: () => metal(0.035, 0, 6000),
    sprint: ({ charge = 1 }) => { noise({ dur: 0.2 + 0.25 * charge, gain: 0.1 + 0.2 * charge, f0: 400, f1: 2500 + 2000 * charge, q: 2 }); T(33, { to: 21, dur: 0.25, gain: 0.3 * charge, drive: true }); },
    clean: () => { saw(81, { type: 'square', dur: 0.06, gain: 0.04, cutoff: 4000 }); metal(0.05, S() / 2, 5000); saw(88, { type: 'square', dur: 0.08, gain: 0.03, cutoff: 4000, at: S() / 2 }); },
    perfect: () => { seq([82, 81, 76, 69], S() / 2, { type: 'sawtooth', dur: 0.1, gain: 0.045, cutoff: 3000, drive: true }); metal(0.06, 0, 4000); },
    summit: () => {
        [45, 52, 57, 58].forEach(n => saw(n, { dur: 1.1, gain: 0.04, cutoff: 1400, detune: 8 }));
        T(33, { to: 21, dur: 1, gain: 0.35 });
        noise({ dur: 1, gain: 0.12, f0: 6000, f1: 1500, type: 'highpass' });
        [0, 3].forEach(k => metal(0.06, k * S(), 4200));
    },
    achievement: () => { [0, 2].forEach(k => [57, 64, 69].forEach(n => saw(n, { dur: 0.16, gain: 0.035, at: k * S(), cutoff: 2000 }))); },
    land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(40, { to: 28, dur: 0.2 + 0.25 * k, gain: 0.15 + 0.35 * k, drive: true }); noise({ dur: 0.25, gain: 0.08 + 0.15 * k, f0: 900, f1: 200, type: 'lowpass' }); },
    launch: () => { noise({ dur: 0.3, gain: 0.14, f0: 600, f1: 3500, q: 3 }); saw(57, { to: 64, dur: 0.2, gain: 0.035 }); },
    runEnd: ({ good }) => good ? seq([57, 64], S(), { type: 'sawtooth', dur: 0.2, gain: 0.04, cutoff: 1800, drive: true }) : saw(58, { to: 57, dur: 0.35, gain: 0.04, cutoff: 900 }),
    record: () => { seq([57, 64, 69, 76], S() / 2, { type: 'sawtooth', dur: 0.12, gain: 0.04, cutoff: 2600, drive: true }); metal(0.05, S() * 2, 4500); },
    nearMiss: () => saw(64, { to: 58, dur: 0.7, gain: 0.04, cutoff: 900 }),
    breakthrough: () => { T(33, { to: 18, dur: 0.7, gain: 0.45, drive: true }); noise({ dur: 0.5, gain: 0.25, f0: 300, f1: 4000, q: 1 }); [45, 52, 58].forEach(n => saw(n, { dur: 0.5, gain: 0.04, at: S() })); },
    phase: () => { seq([45, 52, 57, 58, 64, 69, 70, 76], S() / 2, { type: 'sawtooth', dur: 0.14, gain: 0.04, cutoff: 2400, drive: true }); T(33, { dur: 1.4, gain: 0.25 }); },
    ship: () => { [45, 52, 57].forEach(n => saw(n, { dur: 1.6, gain: 0.04, cutoff: 1200, attack: 0.05 })); T(33, { to: 21, dur: 1.6, gain: 0.3 }); [0, 2, 4].forEach(k => metal(0.06, k * S(), 3600)); },
    // Packet Snare, held back: driven saws muted low, metal ticks, sub thumps, the flat second for alarms.
    snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => saw(n, { dur: 0.06, gain: 0.05, cutoff: 700 + 220 * i, q: 8, at: i * S() / 2 })); metal(0.05, lastAt(f), 6500); },
    snareSpoil: () => { saw(52, { to: 45, dur: 0.3, gain: 0.05, cutoff: 600, q: 3 }); saw(53, { to: 46, dur: 0.3, gain: 0.04, cutoff: 600, q: 3 }); noise({ dur: 0.15, gain: 0.08, f0: 350, type: 'lowpass' }); },
    snareSnap: () => { metal(0.1, 0, 7000); T(33, { dur: 0.12, gain: 0.22, drive: true }); noise({ dur: 0.06, gain: 0.05, f0: 1200, q: 4, at: 0.02 }); },
    snareLaser: () => T(100, { to: 76, type: 'square', dur: 0.05, gain: 0.03, cutoff: 5000, drive: true }),
    snareChain: () => [0, 1, 2].forEach(i => metal(0.05, i * S() / 4, 4000 + 1500 * i)),
    snareSweep: () => { [0, 2].forEach(k => { saw(57, { dur: 0.12, gain: 0.05, cutoff: 1600, at: k * S() }); saw(58, { dur: 0.12, gain: 0.04, cutoff: 1600, at: k * S() }); }); noise({ dur: 0.5, gain: 0.06, f0: 800, f1: 4000, q: 3, attack: 0.4 }); },
    snareCharge: () => { seq([57, 58, 64, 69], S() / 2, { type: 'sawtooth', dur: 0.06, gain: 0.045, cutoff: 1500, q: 6, drive: true }); T(33, { to: 45, dur: 0.45, gain: 0.2, drive: true, attack: 0.3 }); },
    snareBoss: () => { T(33, { to: 28, dur: 0.2, gain: 0.35, drive: true }); T(33, { to: 28, dur: 0.16, gain: 0.24, drive: true, at: 2 * S() }); metal(0.05, 0, 2500); [45, 46].forEach(n => saw(n, { dur: 0.4, gain: 0.03, cutoff: 700 })); },
    snareHit: () => { metal(0.1, 0, 3000); saw(45, { dur: 0.12, gain: 0.05, cutoff: 1200 }); },
    snarePlace: ({ kind = 'wall' }) => {
        if (kind === 'decoy') { T(76, { type: 'square', dur: 0.06, gain: 0.03, cutoff: 3000 }); T(76, { type: 'square', dur: 0.06, gain: 0.012, cutoff: 2000, at: 3 * S() }); }
        else if (kind === 'turret') { metal(0.05, 0, 5000); metal(0.05, S() / 4, 5000); saw(64, { dur: 0.06, gain: 0.045, at: S() / 2 }); }
        else if (kind === 'tower') { T(33, { dur: 0.25, gain: 0.2 }); saw(57, { dur: 0.12, gain: 0.04 }); saw(64, { dur: 0.12, gain: 0.04, at: S() / 2 }); }
        else { T(40, { dur: 0.12, gain: 0.2, drive: true }); metal(0.045, S() / 2, 4000); }
    },
    snareRemove: () => { saw(64, { to: 57, dur: 0.08, gain: 0.045, cutoff: 1400 }); metal(0.03, 0, 6000); },
    snarePower: ({ kind = 'freeze' }) => {
        if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.12, f0: 600, f1: 8000, q: 2, attack: 3.5 * S() }); [45, 52, 57].forEach(n => saw(n, { dur: 0.4, gain: 0.035, cutoff: 2000, at: 4 * S() })); metal(0.06, 4 * S(), 3500); }
        else { noise({ dur: 0.8, gain: 0.1, f0: 4000, f1: 200, type: 'lowpass' }); T(33, { to: 24, dur: 0.8, gain: 0.25, drive: true }); saw(81, { to: 69, dur: 0.6, gain: 0.025, cutoff: 1200 }); }
    },
    snareZap: () => { saw(88, { to: 64, type: 'square', dur: 0.05, gain: 0.03, cutoff: 4000 }); metal(0.05, 0, 7000); },
    snareDecoy: () => { metal(0.07, 0, 6500); metal(0.05, S() / 4, 5000); saw(76, { to: 70, dur: 0.15, gain: 0.03, cutoff: 2000 }); },
    snareQuarantine: ({ partner = false }) => {
        metal(0.08, 0, 6000); metal(0.08, S() / 4, 4200); T(33, { dur: 0.12, gain: 0.24, drive: true, at: S() / 4 });
        if (partner) seq([57, 64, 67], S() / 2, { type: 'sawtooth', dur: 0.18, gain: 0.035, cutoff: 1100, q: 3, detune: -10, at: S() / 2 });
        else { saw(64, { dur: 0.06, gain: 0.045, cutoff: 1800, at: S() / 2 }); saw(57, { dur: 0.14, gain: 0.05, cutoff: 1200, at: S() }); }
    },
    snareStun: ({ down = false }) => {
        T(40, { dur: 0.1, gain: 0.2, drive: true }); metal(0.06, 0, 2600); saw(81, { to: 76, type: 'square', dur: 0.08, gain: 0.02, cutoff: 3000, at: S() / 2 });
        if (down) { noise({ dur: 0.06, gain: 0.14, f0: 5000, type: 'highpass', at: S() / 4 }); metal(0.08, S() / 4, 1800); saw(46, { dur: 0.2, gain: 0.04, cutoff: 800, at: S() / 4 }); }
    },
    snareCore: () => { T(33, { dur: 0.8, gain: 0.18, attack: 0.35, drive: true }); saw(46, { dur: 0.7, gain: 0.025, cutoff: 600, attack: 0.3, detune: -12 }); metal(0.03, 2 * S(), 7000); },
    snareBossDown: () => {
        T(33, { to: 21, dur: 0.5, gain: 0.35, drive: true }); [45, 52, 57].forEach(n => saw(n, { dur: 0.3, gain: 0.04, cutoff: 1800 }));
        seq([64, 69, 76], S(), { type: 'sawtooth', dur: 0.12, gain: 0.045, cutoff: 2600, drive: true, at: S() });
        [57, 64, 69, 76].forEach(n => saw(n, { dur: 0.8, gain: 0.035, cutoff: 2200, detune: 8, at: 4 * S() })); T(33, { dur: 0.8, gain: 0.25, at: 4 * S() });
        [0, 4].forEach(k => metal(0.07, k * S(), 4500)); noise({ dur: 0.8, gain: 0.1, f0: 6000, f1: 1500, type: 'highpass', at: 4 * S() });
    },
    snareParry: () => { metal(0.12, 0, 7500); saw(81, { to: 93, type: 'square', dur: 0.06, gain: 0.03, cutoff: 6000 }); ping(81, 2.76, { dur: 0.25, gain: 0.02 }); },
    snareSlash: () => { noise({ dur: 0.09, gain: 0.14, f0: 2000, f1: 10000, q: 4, attack: 0.06 }); metal(0.06, S() / 2, 3000); saw(45, { dur: 0.08, gain: 0.04, cutoff: 900, at: S() / 2 }); },
    snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.03, cutoff: 3500, drive: true }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.03, gain: 0.025, cutoff: 4000, at: S() / 2 }); saw(69, { dur: 0.1, gain: 0.035, at: 1.5 * S() }); },
    snareGarbage: () => { noise({ dur: 0.18, gain: 0.14, f0: 3000, f1: 150, type: 'lowpass' }); T(40, { to: 33, dur: 0.15, gain: 0.2, drive: true }); metal(0.05, S() / 4, 2000); saw(76, { to: 81, type: 'square', dur: 0.08, gain: 0.03, cutoff: 3000, at: 2 * S() }); },
    snareRace: ({ step = 0 }) => { T(raceNote(step), { type: 'square', dur: 0.035, gain: 0.02, cutoff: 3500 }); metal(0.025, 0, 6500); },
    snareHijack: () => { seq([64, 69, 76], S() / 4, { type: 'square', dur: 0.04, gain: 0.03, cutoff: 4000, drive: true }); metal(0.05, 3 * S() / 4, 5500); saw(57, { dur: 0.1, gain: 0.035, at: S() }); },
    snareTaken: () => T(76, { to: 81, type: 'square', dur: 0.035, gain: 0.025, cutoff: 4000 }),
    snareFlag: ({ flags = 1, limit = 3 }) => {
        const k = Math.min(1, flags / Math.max(1, limit));
        saw(70, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 1600 + 2000 * k }); saw(69, { type: 'square', dur: 0.06, gain: 0.03, cutoff: 1600 + 2000 * k, at: S() / 2 });
        if (flags >= limit - 1) metal(0.05, S(), 4000);
    },
    snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 3000, drive: true }); T(33, { dur: 0.15, gain: 0.25, drive: true }); metal(0.07, 0, 3000); metal(0.07, 1.5 * S(), 3000); },
    snareRebuild: () => { [0, 1, 2, 3].forEach(i => metal(0.04, i * S() / 4, 1500 + 700 * i)); T(40, { dur: 0.1, gain: 0.18, drive: true, at: S() }); saw(64, { dur: 0.06, gain: 0.035, cutoff: 1800, at: S() }); },
    snareHerdStun: () => { saw(72, { to: 52, dur: 0.22, gain: 0.035, cutoff: 1400 }); metal(0.04, 0, 6000); }
},
