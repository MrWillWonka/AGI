// music/ominous.js — the Ominous track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/ominous/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).ominous = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Ominous: tolling bells with an inharmonic partial, knocks, reversed swells, drones (C, b2, tritone).
    const toll = (n, o = {}) => {
        T(n, { type: 'sine', dur: 1.6, gain: 0.06, ...o });
        tone({ f0: NOTE(mapNote(degShift(n, varDeg()))) * 2.76, dur: 0.6, type: 'sine', gain: (o.gain ?? 0.06) * 0.25, at: o.at, raw: true });
    };
    const knock = (n, o = {}) => { T(n, { type: 'triangle', dur: 0.09, gain: 0.07, cutoff: 900, ...o }); noise({ dur: 0.05, gain: 0.03, f0: 700, q: 3, at: o.at }); };
    const swellUp = (dur, gain) => noise({ dur, gain, f0: 300, f1: 2400, type: 'lowpass', attack: dur * 0.85 });

    return {
        // The key its sound effects are moved into (they are written in A minor pentatonic): C with its flat second and tritone: C Db Eb F# G.
        key: { root: 60, set: [0, 1, 3, 6, 7] },
        // What it does to any effect it doesn't write itself.
        profile: { wave: t => (t === 'square' ? 'triangle' : t), oct: -1, cut: 0.45, lp: 1600, gain: 0.9, len: 1.7, attack: 0.02, detune: -14, echo: 0.3,
            noise: n => ({ ...n, dur: n.dur * 1.4, f0: n.f0 * 0.6, f1: n.f1 * 0.6 }) },
        // The plain voice of its simple sounds.
        simpleVoice: { type: 'sine', oct: -12, len: 1.8, gain: 1, attack: 0.02 },
        // Levels, all measured (re-measure when the track or its sounds change: tools/audio). `sfx` and `simple`: its
        // effects against Classic's. `charge`: the sprint meter's parts (arpeggio, hops, acid, gated chord, thrust), after
        // `base`. `snare`: each Packet Snare effect against this track's own effects.
        trims: {
            sfx: 0.81, simple: 1.37,
            base: 1.66, baseSimple: 1.29,
            charge: [0.74, 2.46, 4.37, 7.33, 1.34], chargeSimple: [0.22, 0.83, 2.38, 3.32, 2.11],
            snare: { snareCatch: 1.58, snareSpoil: 2.14, snareSnap: 1.86, snareLaser: 1.64, snareChain: 8.85, snareSweep: 1.39, snareCharge: 3.01, snareBoss: 0.88, snareHit: 1.27, 'snarePlace:wall': 0.96, 'snarePlace:decoy': 1.96, 'snarePlace:turret': 1.81, 'snarePlace:tower': 0.79, snareRemove: 1.54, 'snarePower:freeze': 0.86, 'snarePower:purge': 1.22, snareZap: 2.3, snareDecoy: 1.59, snareQuarantine: 1.14, snareStun: 1.32, snareCore: 0.9, snareBossDown: 0.59, snareParry: 1.87, snareSlash: 2.19, snareSpoof: 2.8, snareGarbage: 1.74, snareRace: 2.48, snareHijack: 2.64, snareTaken: 4.04, snareFlag: 2.27, snareIds: 0.93, snareRebuild: 1.79, snareHerdStun: 2.1 },
            snareSimple: { snareCatch: 0.9, snareSpoil: 1.06, snareSnap: 2.48, snareLaser: 2.17, snareChain: 1.8, snareSweep: 2.25, snareCharge: 1.23, snareBoss: 2.28, snareHit: 0.88, 'snarePlace:wall': 1.16, 'snarePlace:decoy': 1.24, 'snarePlace:turret': 1.14, 'snarePlace:tower': 1.18, snareRemove: 1.09, 'snarePower:freeze': 1.18, 'snarePower:purge': 1.4, snareZap: 1.68, snareDecoy: 1.49, snareQuarantine: 1.04, snareStun: 1.38, snareCore: 1.44, snareBossDown: 0.83, snareParry: 2.41, snareSlash: 1.53, snareSpoof: 1.71, snareGarbage: 2.25, snareRace: 2.47, snareHijack: 2.06, snareTaken: 3.91, snareFlag: 1.53, snareIds: 1.8, snareRebuild: 1.4, snareHerdStun: 1.27 }
        },

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Ominous: a half-time feel on the same grid: a deep kick on 1 and 3, a sub drone on the chord's root, a
        // bell tolling a chord tone every other bar, a clock ticking, a low string pad, and a slow lead (a
        // triangle swelling in, with a faint bell an octave up).
        style: {
            cutoff: k => 500 + 3500 * k * k, drive: 0, gain: 1.42, shift: 3,    // C, with its flat second
            beat: 0.598, tones: 2.145,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 1.378, tones: 1.951 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s === 0 || s === 8);
                if (kg) kick(t, 0.55 * kg, 110, 32, 0.6);
                if (c.bassOn && s === 0) synth(t, ch.root, len * 16, 0.13, 'sawtooth', 160 + 260 * k);
                if (L.pad > 0.02 && s === 0 && c.bar % 2 === 0) { synth(t, ch.bell, len * 12, 0.05 * L.pad, 'sine', 4000); synth(t, ch.bell + 19, len * 6, 0.012 * L.pad, 'sine', 4000); }
                if (L.off > 0.02 && s === 0 && c.song.comp.includes(0)) pad(t, ch.v.map(n => n - 12), len * 16, 0.016 * L.off, 'triangle', 900);
                if (L.off > 0.02 && c.drums && s % 4 === 2) hat(t, 0.035 * L.off, 0.02);
                if (L.clap > 0.02 && c.drums && s === 12) clap(t, 0.08 * L.clap);
                if (L.sixteenth > 0.02 && c.drums && s % 2 === 1) hat(t, 0.02 * L.sixteenth, 0.015);
                if (L.arp > 0.02 && s % 4 === 0) synth(t, ch.v[(s / 4) % ch.v.length] + 12, len * 3.5, 0.03 * L.arp, 'triangle', 1400);
                if (c.mel) {
                    const d = len * c.mel.len * 1.05;
                    synth(t, c.mel.n, d, 0.05 * c.melGain, 'triangle', 1300, 1, 0, -10, Math.min(0.08, d * 0.3));
                    synth(t, c.mel.n + 12, Math.min(d, 0.8), 0.008 * c.melGain, 'sine', 4000, 1);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.025, 'triangle', 1100, 1, 0, 10, 0.06);
                }
            },
            // A reversed swell rising into the next phrase.
            fill(t, s, k, len) {
                if (s === 12) riser(t, len * 4, 0.1);
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        songs: {
            lab: [
                {   // Vigil: harmonic minor, half notes, the flat second and E7's flat ninth.
                    lvl: 0.88, scale: HARM, oct: -1, chords: ['Am', 'Am', 'Bb', 'Bb', 'Dm', 'Dm', 'E7', 'E7'], comp: [0],
                    melA: "1 - - - 3 - - - | 5 - - - - - 3 - | b2 - - - 4 - - - | 6 - - - - - . .",
                    melB: "5 - - - 6 - 5 - | 3 - - - 1 - - - | 4 - - - b2 - 4 - | 6 - - - 5 - 4 - | 4 - - - 6 - 1' - | 1' - - - 6 - 3 - | 7, - - - 2 - 4 - | 3 - - - 2 - 7, -"
                },
                {   // Static: a motif that keeps falling back to the flat second.
                    lvl: 0.95, scale: HARM, oct: -1, chords: ['Am', 'Dm', 'Am', 'Bb', 'Am', 'Dm', 'F', 'E'], comp: [0],
                    melA: "3' - - - 2' - 1' - | 1' - - - 6 - - - | 5 - - - 7, - 1 - | b2 - - - - - . .",
                    melB: "1 - - - 5 - - - | 6 - - - 4 - - - | 3 - - - 2 - 1 - | 4 - - - b2 - - - | 5 - - - 1' - - - | 6' - - - 4' - - - | 3' - - - 1' - 6 - | 7 - - - - - . ."
                }
            ],
            server: [
                {   // Descent: A against B flat, then down through F to E.
                    lvl: 0.91, scale: HARM, oct: -1, chords: ['Am', 'Bb', 'Am', 'Bb', 'Fmaj7', 'Dm', 'Bb', 'E7'], comp: [0],
                    melA: "1' - - - b2' - - - | 1' - - - 6 - - - | 1' - - - b2' - 3' - | b2' - - - - - . .",
                    melB: "5 - - - 1' - - - | b2' - - - 4' - - - | 3' - - - 1' - 5 - | 4 - - - 6 - - - | 5 - - - 3 - 1 - | 6, - - - 1 - - - | 4 - - - 6 - 1' - | 7 - - - 6 - 5 -"
                },
                {   // Undertow: a dotted figure climbing the chord, and back.
                    lvl: 0.95, scale: HARM, oct: -1, chords: ['Am', 'Am', 'Bb', 'C', 'Am', 'Am', 'Bb', 'E7'], comp: [0],
                    melA: "1 . . 3 . . 5 . | 6 . . 5 . . 3 . | b2 . . 4 . . 6 . | 5 . . 3 . . 1 .",
                    melB: "5 - - - - - 6 5 | 3 - - - 1 - - - | 4 - - - 6 - b2' - | 1' - - - 5 - - - | 1' - - - - - b2' 1' | 3 - - - 5 - - - | 4 - - - b2 - 4 - | 7, - - - 2 - - -"
                }
            ],
            snare: [
                {   // Crawlspace: a heartbeat for a kick, A against B flat, the bell far off.
                    lvl: 0.93, rest: 1.14, slvl: 0.96, srest: 1.14, scale: HARM, oct: -1, chords: ['Am', 'Bb', 'Am', 'Bb', 'Dm', 'Bb', 'E', 'E'], comp: [0],
                    kick: 'x.o.....x.o.....', hush: 0.6, tick: 'x.......o.......', cut: 0.8,
                    melA: "1 - - - . . . . | b2 - - - . . . . | 5 - - - . . . . | 4 - - - . . . .",
                    melB: "5 - - - 3 - - - | 4 - - - b2 - - - | 1 - - - 3 - 5 - | 4 - - - - - . . | 6 - - - 4 - - - | 4 - - - b2 - - - | 7, - - - 2 - - - | 5 - - - - - . ."
                },
                {   // Lights Out: Am – F – Dm – E, the line stepping down and stopping to listen.
                    lvl: 0.89, rest: 1.22, slvl: 0.93, srest: 1.24, scale: HARM, oct: -1, chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Bb', 'E7'], comp: [0],
                    kick: 'x..o............', hush: 0.6, tick: '....x.......o...', cut: 0.8,
                    melA: "5 - - - . . 3 . | 1 - - - . . . . | 4 - - - . . . . | 2 - - - . . . .",
                    melB: "1 - - - - - . . | 1 - - - 3 - - - | 4 - - - 6 - - - | 5 - - - 7, - - - | 3 - - - 5 - - - | 6 - - - 1' - - - | b2' - - - 6 - - - | 7 - - - - - . ."
                }
            ]
        },

        // ---- Sound effects written for this track (anything else plays the shared one through `profile`) --------
        sounds: {
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
        }
    };
};
