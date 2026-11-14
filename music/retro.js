// music/retro.js — the Retro track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/retro/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).retro = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { note, perc, harmNote, MIXO, LYD, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Retro: an 8-bit console: square pulses, a triangle bass, noise drums, stepped slides (C major pentatonic).
    const sq = (n, o = {}) => T(n, { type: 'square', dur: 0.07, gain: 0.03, ...o });
    const tri = (n, o = {}) => T(n, { type: 'triangle', dur: 0.12, gain: 0.08, ...o });
    const chipNoise = (dur, gain, at = 0) => noise({ dur, gain, f0: 6000, type: 'highpass', at });

    return {
        // The key its sound effects are moved into (they are written in A minor pentatonic): C major pentatonic: C D E G A.
        key: { root: 60, set: [0, 2, 4, 7, 9] },
        // What it does to any effect it doesn't write itself.
        profile: { wave: (t, f) => (f < 200 ? 'triangle' : 'square'), raw: true, gain: 0.45, len: 0.75, steps: true,
            noise: n => ({ ...n, dur: n.dur * 0.6 }) },
        // The plain voice of its simple sounds.
        simpleVoice: { type: 'square', oct: 0, len: 0.8, gain: 0.35 },
        // Levels, all measured (re-measure when the track or its sounds change: tools/audio). `sfx` and `simple`: its
        // effects against Classic's. `charge`: the sprint meter's parts (arpeggio, hops, acid, gated chord, thrust), after
        // `base`. `snare`: each Packet Snare effect against this track's own effects.
        trims: {
            sfx: 2.1, simple: 4.17,
            base: 0.91, baseSimple: 3.05,
            charge: [1.56, 2.63, 5.75, 9.7, 6.08], chargeSimple: [1.11, 0.47, 0.63, 3.89, 3.98],
            snare: { snareCatch: 0.71, snareSpoil: 0.91, snareSnap: 0.7, snareLaser: 1.48, snareChain: 1.31, snareSweep: 2.33, snareCharge: 1.37, snareBoss: 0.99, snareHit: 0.82, 'snarePlace:wall': 0.55, 'snarePlace:decoy': 2.77, 'snarePlace:turret': 2.03, 'snarePlace:tower': 0.49, snareRemove: 1.73, 'snarePower:freeze': 0.46, 'snarePower:purge': 0.91, snareZap: 1.3, snareDecoy: 1.01, snareQuarantine: 0.63, snareStun: 0.76, snareCore: 0.53, snareBossDown: 0.44, snareParry: 1.66, snareSlash: 0.92, snareSpoof: 1.93, snareGarbage: 0.54, snareRace: 3.43, snareHijack: 1.04, snareTaken: 3.23, snareFlag: 2.19, snareIds: 0.68, snareRebuild: 0.85, snareHerdStun: 1.53 },
            snareSimple: { snareCatch: 1.06, snareSpoil: 1.05, snareSnap: 1.5, snareLaser: 2.02, snareChain: 1.68, snareSweep: 2.71, snareCharge: 1.43, snareBoss: 1.21, snareHit: 1.06, 'snarePlace:wall': 1.37, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.38, 'snarePlace:tower': 1.35, snareRemove: 1.25, 'snarePower:freeze': 0.95, 'snarePower:purge': 1.28, snareZap: 1.65, snareDecoy: 1.53, snareQuarantine: 1.22, snareStun: 1.18, snareCore: 0.73, snareBossDown: 0.62, snareParry: 2.43, snareSlash: 1.78, snareSpoof: 2.11, snareGarbage: 1.34, snareRace: 2.58, snareHijack: 2.17, snareTaken: 4.03, snareFlag: 1.76, snareIds: 1.97, snareRebuild: 1.57, snareHerdStun: 1.43 }
        },

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Retro: chiptune: a short punchy kick, a triangle bass bouncing octaves on the chord's root, noise
        // snares and hats, the chord as a square arpeggio (8ths, 16ths once it's flying), and a square lead with
        // its echo channel (the same line a dotted 8th later, quieter).
        style: {
            cutoff: k => 4000 + 9000 * k, drive: 0, gain: 1.62,
            beat: 0.701, tones: 1.829,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 1.013, tones: 1.855 }, simpleVoice: 'square',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.45 * kg, 220, 50, 0.12);
                // The bass bounces octaves on the 8ths; a song with its own line (`walk`) tiptoes it, staccato.
                if (c.bassOn && c.song.walk) { const b = bassAt(c.song, s, ch); if (b) synth(t, b + 12, len * 0.9, 0.16, 'triangle', 9000); }
                else if (c.bassOn && s % 2 === 0) synth(t, ch.root + 12 + (s % 4 === 2 ? 12 : 0), len * 1.6, 0.14, 'triangle', 9000);
                if (L.off > 0.02 && c.drums && s % 4 === 2) hat(t, 0.07 * L.off, 0.02);
                if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) clap(t, 0.13 * L.clap);
                if (L.sixteenth > 0.02 && c.drums && s % 2 === 1) hat(t, 0.035 * L.sixteenth, 0.012);
                const every = L.arp > 0.5 ? 1 : 2;
                // Up on even bars, down on odd ones.
                if (L.pad > 0.02 && s % every === 0) {
                    const v = ch.v, i = (s / every) % v.length, idx = c.bar % 2 ? v.length - 1 - i : i;
                    synth(t, v[idx], len * 0.8, (0.016 + 0.014 * Math.max(L.clap, L.arp)) * L.pad, 'square', 9000);
                }
                if (c.mel) {
                    const d = len * c.mel.len * 0.85;
                    synth(t, c.mel.n, d, 0.03 * c.melGain, 'square', 9000);
                    synth(t + 3 * len, c.mel.n, d, 0.01 * c.melGain, 'square', 9000);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.016, 'square', 9000);
                }
            },
            // A noise-snare roll and a square run up the next chord into the next phrase.
            fill(t, s, k, len, L, c) {
                clap(t, 0.1 + 0.02 * (s - 12));
                synth(t, c.next.v[(s - 12) % c.next.v.length] + 12, len * 0.8, 0.035, 'square', 9000);
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        songs: {
            lab: [
                {   // Pixel Desk: I – V – vi – IV, a square lead with its echo channel.
                    lvl: 0.89, scale: ION, tonic: 3, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
                    melA: "1 - 3 - 5 - 3 - | 2 - 5, - 7, - 2 - | 3 - 1 - 6, - 1 - | 4 - 3 - 2 - - .",
                    melB: "5 - 5 - 6 - 5 - | 4 - 2 - 7, - 5, - | 1 - 3 - 6 - 5 - | 4 - 6 - 1' - - - | 1' - 7 - 5 - 3 - | 2 - 4 - 7 - 5 - | 6 - 4 - 1 - 4 - | 5 - - - 7, - 2 -"
                },
                {   // Save Point: IV – I – V – vi, gentle.
                    lvl: 0.91, scale: ION, tonic: 3, chords: ['F', 'C', 'G', 'Am', 'F', 'C', 'Dm', 'G'],
                    melA: "6 - 5 - 4 - 1 - | 3 - 2 - 1 - 5, - | 7, - 2 - 5 - 4 - | 3 - - - 2 - - .",
                    melB: "1' - 6 - 4 - 6 - | 5 - 3 - 1 - 3 - | 2 - 7, - 2 - 4 - | 3 - 6 - 1' - - - | 1' - 6 - 5 - 4 - | 3 - 5 - 1' - 5 - | 4 - 6 - 2' - 1' - | 7 - - - 5 - - -"
                }
            ],
            server: [
                {   // Boss Rush: A minor, a 16th-note riff, the chords arpeggiated.
                    lvl: 0.87, scale: AEOL, chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'E5'],
                    melA: "1 1 5 1' . 7 5 3 | 1 1 6 1' . 6 5 3 | 7, 7, 2 5 . 4 2 7, | 5, 5, 7, 2 . 5 2 7,",
                    melB: "1' - 7 - 1' - 3' - | 1' - 6 - 5 - 3 - | 2' - 1' - 7 - 5 - | 7 - 5 - 2 - - - | 1' - 5 - 1' - 3' - | 1' - 3' - 6 - 1' - | 4' - 3' - 2' - 6 - | 5 - - - 7 - 2' -"
                },
                {   // Turbo: Dorian's raised sixth over D, a race to the finish.
                    lvl: 0.89, scale: AEOL, chords: ['Am', 'Am', 'C', 'D', 'Am', 'Am', 'F', 'G'],
                    melA: "1' . 1' . 5 . 7 1' | . 1' 7 5 . 3 5 . | 5 . 5 . 3 . 5 1' | #6 . 5 . 4 - - .",
                    melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 3' . 1' . 5 . 3 . | #6 . 4 . 1' . #6 . | 5 . 1' . 3' . 2' . | 1' . 7 . 5 - - . | 6 . 1' . 3' . 1' . | 2' . 7 . 5 . 2' ."
                }
            ],
            snare: [
                {   // Sneaking Mission: an 8-bit infiltration: a triangle bass tiptoeing, a pulse creeping up the A minor.
                    lvl: 1.39, rest: 1.29, slvl: 0.91, srest: 1.27, scale: AEOL, chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'Esus4'],
                    bass: 'r...f...r...f.o.', walk: true, kick: 'x.......x.......', hush: 0.5, tick: '..x...x...x...x.', cut: 0.85,
                    melA: "1 . 1 . . . 3 . | 5, . . . . . . . | 6 . 6 . . . 1' . | 5 - - - . . . .",
                    melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 6 . 1' . 3' . 1' . | 2' - - - 7 - - - | 1' . 1' . 7 . 5 . | 3 . 5 . 1' - - - | 6 . 4 . 6 . 1' . | 2' - - - 1' - - -"
                },
                {   // Hide and Seek: A minor seen from C, sus chords that never land, a pulse peeking out and back.
                    lvl: 1.44, rest: 1.51, slvl: 0.85, srest: 1.29, scale: ION, tonic: 3, chords: ['Am', 'Am', 'Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gsus4', 'Gsus4'],
                    bass: 'r.....r...o.....', walk: true, kick: 'x.....x.........', hush: 0.5, tick: 'o...x...o...x.o.', cut: 0.85,
                    melA: "6, . . 1 . . . . | 2 - - - . . . . | 6, . . 1 . . . . | 2 - - - 5, . . .",
                    melB: "3 . 1 . 6, . 1 . | 3 - - - 2 - - - | 1 . 3 . 5 . 3 . | 6, - - - . . . . | 4 . 6 . 1' . 6 . | 4 - - - 2 - - - | 1 . 2 . 5 . 2 . | 1 - - - 5, - - -"
                }
            ]
        },

        // ---- Sound effects written for this track (anything else plays the shared one through `profile`) --------
        sounds: {
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
    };
};
