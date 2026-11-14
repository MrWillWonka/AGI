// Retro: its sound effects. A copy from sfx.js, taken 2026-11-14; reference only.
// Effects not listed here play Classic's (../classic/sound-effects.js, SOUNDS) through this track's profile.
// The engine (tone, noise, the grid, variations, groups, the sprint meter): ../shared/sound-engine.js.

// ---- Key and scale: KEYS (sfx.js lines 183-183) ----
retro: { root: 60, set: [0, 2, 4, 7, 9] }               // C major pentatonic: C D E G A

// ---- Profile for every shared effect: PROFILES (sfx.js lines 232-234) ----
// Retro: raw square waves (a triangle for the low end), short, with chip-style stepped slides.
retro: { wave: (t, f) => (f < 200 ? 'triangle' : 'square'), raw: true, gain: 0.45, len: 0.75, steps: true,
    noise: n => ({ ...n, dur: n.dur * 0.6 }) }

// ---- Simple sounds' voice: SIMPLE_VOICE (sfx.js lines 983-983) ----
retro: { type: 'square', oct: 0, len: 0.8, gain: 0.35 }

// ---- Sprint meter levels (arpeggio, hops, acid, gated chord, thrust): CHARGE_TRIM (sfx.js lines 1127-1127) ----
retro: [1.56, 2.63, 5.75, 9.7, 6.08],

// ---- Sprint meter levels, simple sounds (sfx.js lines 1132-1132) ----
's:retro': [1.11, 0.47, 0.63, 3.89, 3.98]

// ---- Packet Snare levels: SNARE_TRIM (sfx.js lines 515-515) ----
retro: { snareCatch: 0.71, snareSpoil: 0.91, snareSnap: 0.7, snareLaser: 1.48, snareChain: 1.31, snareSweep: 2.33, snareCharge: 1.37, snareBoss: 0.99, snareHit: 0.82, 'snarePlace:wall': 0.55, 'snarePlace:decoy': 2.77, 'snarePlace:turret': 2.03, 'snarePlace:tower': 0.49, snareRemove: 1.73, 'snarePower:freeze': 0.46, 'snarePower:purge': 0.91, snareZap: 1.3, snareDecoy: 1.01, snareQuarantine: 0.63, snareStun: 0.76, snareCore: 0.53, snareBossDown: 0.44, snareParry: 1.66, snareSlash: 0.92, snareSpoof: 1.93, snareGarbage: 0.54, snareRace: 3.43, snareHijack: 1.04, snareTaken: 3.23, snareFlag: 2.19, snareIds: 0.68, snareRebuild: 0.85, snareHerdStun: 1.53 },

// ---- Packet Snare levels, simple sounds (sfx.js lines 520-520) ----
's:retro': { snareCatch: 1.06, snareSpoil: 1.05, snareSnap: 1.5, snareLaser: 2.02, snareChain: 1.68, snareSweep: 2.71, snareCharge: 1.43, snareBoss: 1.21, snareHit: 1.06, 'snarePlace:wall': 1.37, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.38, 'snarePlace:tower': 1.35, snareRemove: 1.25, 'snarePower:freeze': 0.95, 'snarePower:purge': 1.28, snareZap: 1.65, snareDecoy: 1.53, snareQuarantine: 1.22, snareStun: 1.18, snareCore: 0.73, snareBossDown: 0.62, snareParry: 2.43, snareSlash: 1.78, snareSpoof: 2.11, snareGarbage: 1.34, snareRace: 2.58, snareHijack: 2.17, snareTaken: 4.03, snareFlag: 1.76, snareIds: 1.97, snareRebuild: 1.57, snareHerdStun: 1.43 }

// ---- Instruments for its effects (sfx.js lines 485-488) ----
// Retro: an 8-bit console: square pulses, a triangle bass, noise drums, stepped slides (C major pentatonic).
const sq = (n, o = {}) => T(n, { type: 'square', dur: 0.07, gain: 0.03, ...o });
const tri = (n, o = {}) => T(n, { type: 'triangle', dur: 0.12, gain: 0.08, ...o });
const chipNoise = (dur, gain, at = 0) => noise({ dur, gain, f0: 6000, type: 'highpass', at });

// ---- Effects written again for Retro: TRACK_SOUNDS.retro (sfx.js lines 870-953) ----
retro: {
    // Compute a triangle blip with a noise tick, data a two-step square, research a square jumping up the scale.
    click: ({ res = 'cp' }) => {
        const n = clickNote(res);
        if (res === 'cp') { tri(n, { dur: 0.07, gain: 0.09 }); sq(n + 24, { dur: 0.02, gain: 0.025 }); chipNoise(0.012, 0.04); }
        else if (res === 'rp') { sq(n, { dur: 0.035, gain: 0.048 }); sq(degShift(n, 2), { dur: 0.05, gain: 0.048, at: 0.035 }); }
        else { sq(n, { dur: 0.03, gain: phone(0.032) }); sq(n + 12, { dur: 0.04, gain: phone(0.027), at: 0.03 }); }
    },
    buy: ({ panel = 'hardware', big }) => {
        const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
        const figs = [[76, 81], [81, 88], [72, 76, 79], [81, 84, 88]];
        const f = figs[vary('buy:retro:' + inst, figs.length)].map(n => n + Math.min(0, o));
        if (inst === 0) seq(f, 0.06, { type: 'square', dur: 0.08, gain: 0.03 });
        else if (inst === 1) seq([...f, ...f.map(n => n + 12)], S() / 4, { type: 'square', dur: 0.04, gain: 0.025 });
        else { seq(f, S() / 2, { type: 'square', dur: 0.06, gain: 0.025 }); tri(f[0] - 24, { dur: 0.2 }); }
        if (big) { seq([69, 72, 76, 81, 84, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.025, at: S() * 2 }); chipNoise(0.08, 0.05, S() * 2); }
    },
    claim: () => [0, 1, 2].forEach(k => { sq(81, { at: k * 0.12, dur: 0.04 }); sq(88, { at: k * 0.12 + 0.04, dur: 0.07 }); }),
    error: () => seq([69, 68], 0.12, { type: 'square', dur: 0.11, gain: 0.03 }),
    ui: () => sq(93, { dur: 0.02, gain: 0.035 }),
    sprint: ({ charge = 1 }) => { chipNoise(0.08 + 0.1 * charge, 0.05 + 0.08 * charge); T(57, { to: 69 + Math.round(12 * charge), type: 'square', dur: 0.15, gain: 0.03, steps: true }); },
    clean: () => seq([76, 81, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.03 }),
    perfect: () => seq([69, 72, 76, 81, 84, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }),
    system: () => { seq([69, 72, 76, 81, 84, 88, 93, 96], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }); chipNoise(0.3, 0.04); },
    summit: () => { seq([69, 69, 76, 81, 0, 81, 88], S(), { type: 'square', dur: 0.1, gain: 0.032 }); seq([45, 45, 52, 57, 0, 57, 64], S(), { type: 'triangle', dur: 0.12, gain: 0.08 }); },
    achievement: () => seq([72, 76, 79, 84], S() / 2, { type: 'square', dur: 0.07, gain: 0.03 }),
    land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); chipNoise(0.06 + 0.08 * k, 0.04 + 0.08 * k); tri(45, { to: 33, dur: 0.12 + 0.1 * k, gain: 0.08 + 0.12 * k, steps: true }); },
    launch: () => T(64, { to: 81, type: 'square', dur: 0.2, gain: 0.028, steps: true }),
    runEnd: ({ good }) => good ? seq([81, 88], S() / 2, { type: 'square', dur: 0.08, gain: 0.03 }) : seq([64, 60, 57], S() / 2, { type: 'square', dur: 0.1, gain: 0.028 }),
    record: () => seq([81, 84, 88, 93], S() / 2, { type: 'square', dur: 0.06, gain: 0.03 }),
    nearMiss: () => seq([76, 74, 76, 74], 0.06, { type: 'square', dur: 0.05, gain: 0.025 }),
    breakthrough: () => { chipNoise(0.3, 0.12); seq([57, 64, 69, 76, 81, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.03 }); tri(33, { dur: 0.4, gain: 0.15 }); },
    phase: () => { seq([57, 60, 64, 69, 72, 76, 81, 84, 88, 93], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }); tri(45, { dur: 0.8, gain: 0.1, at: S() * 2.5 }); },
    ship: () => { seq([69, 0, 69, 76, 81, 0, 88], S() / 2, { type: 'square', dur: 0.1, gain: 0.032 }); seq([45, 0, 45, 52, 57, 0, 64], S() / 2, { type: 'triangle', dur: 0.12, gain: 0.08 }); },
    // Packet Snare, an 8-bit stealth game: triangle pockets low, chip ticks, a two-tone alarm, stepped slides.
    snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => tri(n - 12, { dur: 0.05, gain: 0.09, at: i * S() / 2 })); sq(f[f.length - 1] + 24, { dur: 0.025, gain: 0.02, at: lastAt(f) }); },
    snareSpoil: () => { T(52, { to: 40, type: 'square', dur: 0.25, gain: 0.025, steps: true }); chipNoise(0.12, 0.05); },
    snareSnap: () => { chipNoise(0.04, 0.08); tri(45, { dur: 0.08, gain: 0.11 }); },
    snareLaser: () => T(100, { to: 84, type: 'square', dur: 0.05, gain: 0.02, steps: true }),
    snareChain: () => [93, 96, 100].forEach((n, i) => { chipNoise(0.015, 0.035, i * S() / 4); sq(n, { dur: 0.02, gain: 0.015, at: i * S() / 4 }); }),
    snareSweep: () => seq([76, 69, 76, 69], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }),
    snareCharge: () => { T(57, { to: 81, type: 'square', dur: 0.4, gain: 0.025, steps: true }); chipNoise(0.03, 0.04, 3 * S()); },
    snareBoss: () => { tri(33, { dur: 0.15, gain: 0.2 }); tri(33, { dur: 0.12, gain: 0.14, at: 2 * S() }); seq([45, 46], S(), { type: 'square', dur: 0.1, gain: 0.022 }); },
    snareHit: () => { chipNoise(0.05, 0.07); sq(57, { dur: 0.06, gain: 0.03 }); tri(45, { dur: 0.08, gain: 0.08 }); },
    snarePlace: ({ kind = 'wall' }) => {
        if (kind === 'decoy') { sq(76, { dur: 0.04, gain: 0.025 }); sq(76, { dur: 0.04, gain: 0.012, at: 3 * S() }); }
        else if (kind === 'turret') { sq(64, { dur: 0.03, gain: 0.025 }); sq(69, { dur: 0.03, gain: 0.025, at: S() / 4 }); chipNoise(0.015, 0.04, S() / 2); }
        else if (kind === 'tower') { seq([57, 64, 69], S() / 4, { type: 'square', dur: 0.04, gain: 0.022 }); tri(45, { dur: 0.15, gain: 0.1 }); }
        else { tri(45, { dur: 0.08, gain: 0.13 }); chipNoise(0.02, 0.04); }
    },
    snareRemove: () => seq([69, 64], S() / 4, { type: 'square', dur: 0.03, gain: 0.024 }),
    snarePower: ({ kind = 'freeze' }) => {
        if (kind === 'purge') { chipNoise(0.25, 0.08); seq([88, 84, 81, 76, 72, 69], S() / 4, { type: 'square', dur: 0.04, gain: 0.02, at: S() }); }
        else { T(93, { to: 69, type: 'square', dur: 0.6, gain: 0.02, steps: true }); chipNoise(0.3, 0.04); tri(45, { dur: 0.5, gain: 0.08 }); }
    },
    snareZap: () => { T(84, { to: 64, type: 'square', dur: 0.05, gain: 0.024, steps: true }); chipNoise(0.02, 0.04); },
    snareDecoy: () => { chipNoise(0.08, 0.06); seq([81, 76], S() / 2, { type: 'square', dur: 0.04, gain: 0.022 }); },
    snareQuarantine: ({ partner = false }) => {
        chipNoise(0.015, 0.05); chipNoise(0.015, 0.05, S() / 4); tri(45, { dur: 0.08, gain: 0.12, at: S() / 4 });
        if (partner) seq([64, 67, 72], S() / 2, { type: 'square', dur: 0.06, gain: 0.022, at: S() / 2 });
        else { seq([69, 57], S() / 2, { type: 'square', dur: 0.06, gain: 0.026, at: S() / 2 }); tri(45, { dur: 0.1, gain: 0.1, at: S() }); }
    },
    snareStun: ({ down = false }) => {
        tri(52, { dur: 0.06, gain: 0.1 }); chipNoise(0.03, 0.05); seq([88, 84, 88], S() / 4, { type: 'square', dur: 0.025, gain: 0.014, at: S() / 2 });
        if (down) { chipNoise(0.08, 0.09, S() / 4); T(58, { to: 46, type: 'square', dur: 0.15, gain: 0.022, steps: true, at: S() / 4 }); }
    },
    snareCore: () => { tri(33, { dur: 0.5, gain: 0.12, attack: 0.2 }); sq(58, { dur: 0.3, gain: 0.012, attack: 0.15 }); sq(82, { dur: 0.03, gain: 0.012, at: 2 * S() }); },
    snareBossDown: () => {
        seq([64, 69, 72, 76], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }); seq([45, 0, 52, 57], S() / 2, { type: 'triangle', dur: 0.06, gain: 0.08 });
        sq(81, { dur: 0.12, gain: 0.032, at: 2 * S() }); sq(79, { dur: 0.06, gain: 0.03, at: 3 * S() }); sq(81, { dur: 0.5, gain: 0.032, at: 4 * S() }); sq(88, { dur: 0.4, gain: 0.02, at: 4 * S() });
        tri(45, { dur: 0.5, gain: 0.1, at: 4 * S() }); chipNoise(0.1, 0.06, 4 * S());
    },
    snareParry: () => { chipNoise(0.02, 0.07); T(81, { to: 93, type: 'square', dur: 0.05, gain: 0.025, steps: true }); sq(100, { dur: 0.03, gain: 0.012, at: S() / 2 }); },
    snareSlash: () => { chipNoise(0.05, 0.09); sq(93, { dur: 0.02, gain: 0.015 }); tri(57, { dur: 0.05, gain: 0.08, at: S() / 2 }); },
    snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.022, steps: true }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.025, gain: 0.018, at: S() / 2 }); sq(69, { dur: 0.06, gain: 0.022, at: 1.5 * S() }); },
    snareGarbage: () => { chipNoise(0.12, 0.08); tri(45, { to: 33, dur: 0.12, gain: 0.1, steps: true }); seq([76, 81], S() / 4, { type: 'square', dur: 0.04, gain: 0.022, at: 2 * S() }); },
    snareRace: ({ step = 0 }) => sq(raceNote(step), { dur: 0.025, gain: 0.016 }),
    snareHijack: () => { seq([64, 69, 76, 88], S() / 4, { type: 'square', dur: 0.03, gain: 0.02 }); tri(57, { dur: 0.08, gain: 0.08, at: S() }); },
    snareTaken: () => { sq(79, { dur: 0.02, gain: 0.014 }); sq(84, { dur: 0.02, gain: 0.012, at: 0.025 }); },
    snareFlag: ({ flags = 1, limit = 3 }) => { sq(70, { dur: 0.04, gain: 0.022 }); sq(69, { dur: 0.05, gain: 0.02, at: S() / 2 }); if (flags >= limit - 1) sq(70, { dur: 0.03, gain: 0.018, at: S() }); },
    snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }); chipNoise(0.05, 0.07); tri(45, { dur: 0.15, gain: 0.1 }); },
    snareRebuild: () => { [0, 1, 2, 3].forEach(i => chipNoise(0.012, 0.04, i * S() / 4)); tri(45, { dur: 0.08, gain: 0.1, at: S() }); sq(69, { dur: 0.04, gain: 0.022, at: S() }); },
    snareHerdStun: () => { T(72, { to: 48, type: 'square', dur: 0.25, gain: 0.02, steps: true }); chipNoise(0.02, 0.03); }
}
