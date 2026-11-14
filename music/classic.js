// music/classic.js — the Classic track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/classic/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).classic = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;


    return {
        // The key its sound effects are moved into (they are written in A minor pentatonic): A minor pentatonic, as written.
        key: null,
        // What it does to any effect it doesn't write itself.
        profile: null,
        // The plain voice of its simple sounds.
        simpleVoice: { type: 'square', oct: 0, cutoff: 1800, len: 1, gain: 0.55 },
        // Levels, all measured (re-measure when the track or its sounds change: tools/audio). `sfx` and `simple`: its
        // effects against Classic's. `charge`: the sprint meter's parts (arpeggio, hops, acid, gated chord, thrust), after
        // `base`. `snare`: each Packet Snare effect against this track's own effects.
        trims: {
            sfx: 1, simple: 2.33,
            base: 1.76, baseSimple: 1.93,
            charge: [1.92, 2.8, 4.11, 11.53, 2.78], chargeSimple: [0.26, 1.07, 3.03, 7.25, 2.41],
            snare: { snareCatch: 1.81, snareSpoil: 1.55, snareSnap: 0.95, snareLaser: 1.49, snareChain: 3.39, snareSweep: 2.47, snareCharge: 2.21, snareBoss: 1.02, snareHit: 2.24, 'snarePlace:wall': 0.87, 'snarePlace:decoy': 2.35, 'snarePlace:turret': 2.05, 'snarePlace:tower': 0.58, snareRemove: 2.07, 'snarePower:freeze': 0.5, 'snarePower:purge': 1.64, snareZap: 1.73, snareDecoy: 1.54, snareQuarantine: 1.17, snareStun: 1.27, snareCore: 0.5, snareBossDown: 0.58, snareParry: 2.4, snareSlash: 3.13, snareSpoof: 2.66, snareGarbage: 1.56, snareRace: 2.67, snareHijack: 2.07, snareTaken: 4.32, snareFlag: 2.14, snareIds: 1.23, snareRebuild: 1.43, snareHerdStun: 2.09 },
            snareSimple: { snareCatch: 1.06, snareSpoil: 1.02, snareSnap: 1.52, snareLaser: 3.42, snareChain: 2.01, snareSweep: 2.69, snareCharge: 1.41, snareBoss: 1.24, snareHit: 1.04, 'snarePlace:wall': 1.34, 'snarePlace:decoy': 1.32, 'snarePlace:turret': 1.37, 'snarePlace:tower': 1.36, snareRemove: 1.25, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.26, snareZap: 1.55, snareDecoy: 1.54, snareQuarantine: 1.2, snareStun: 1.15, snareCore: 0.76, snareBossDown: 0.61, snareParry: 2.67, snareSlash: 1.75, snareSpoof: 2.08, snareGarbage: 1.36, snareRace: 2.55, snareHijack: 2.1, snareTaken: 4.09, snareFlag: 1.75, snareIds: 2, snareRebuild: 1.57, snareHerdStun: 1.43 }
        },

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Classic: the original techno: a pulse bass on the song's line, off-beat hats, a clap, 16th hats; dub
        // chords (a filtered saw stab with its echo a dotted 8th later), a filtered square lead with a delay
        // throw, and an arpeggio of the chord when it's flying.
        style: {
            cutoff: k => 900 + 9000 * k * k, drive: 0,
            beat: 0.659, tones: 1.97,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 0.987, tones: 2.455 }, simpleVoice: 'triangle',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.5 * kg);
                const b = c.bassOn && bassAt(c.song, s, ch);
                if (b) synth(t, b, len * 2.2, 0.22, 'sawtooth', 220 + 1600 * k);
                if (L.off > 0.02 && c.drums && s % 4 === 2) hat(t, (0.08 + 0.06 * k) * L.off);
                if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) clap(t, 0.16 * L.clap);
                if (L.sixteenth > 0.02 && c.drums && s % 2 === 1) hat(t, 0.05 * L.sixteenth, 0.025);
                if (L.pad > 0.02 && c.song.comp.includes(s)) for (const n of ch.v) {
                    synth(t, n, len * 1.6, 0.02 * L.pad, 'sawtooth', 700 + 1500 * k, 2);
                    synth(t + 3 * len, n, len * 1.4, 0.008 * L.pad, 'sawtooth', 600 + 900 * k, 2);
                }
                // The arpeggio starts a step later each bar, so the figure turns over a four-bar phrase.
                if (L.arp > 0.02) synth(t, ch.v[(s + 2 * (c.bar % 4)) % ch.v.length] + 12, len * 0.9, 0.04 * L.arp, 'square', 1200 + 2000 * L.arp);
                if (c.mel) {
                    const d = len * c.mel.len * 0.92;
                    synth(t, c.mel.n, d, 0.05 * c.melGain, 'square', 1800 + 1500 * k, 2);
                    synth(t + 3 * len, c.mel.n, d, 0.015 * c.melGain, 'square', 1100, 2);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.025, 'square', 1500, 2);
                }
            },
            // The end of every eighth bar: a clap roll building into the next phrase.
            fill(t, s, k, len, L, c) {
                clap(t, 0.08 + 0.03 * (s - 12));
                if (s === 15) synth(t, c.next.root + 24, len, 0.06, 'square', 2400);
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        songs: {
            lab: [
                {   // Night Survey: dub chords on the off-beats, a long-breathed line.
                    lvl: 0.91, scale: AEOL, chords: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Dm7', 'Cmaj7'],
                    bass: 'r..r..o.r..r.f..', comp: [2, 10],
                    melA: "5 - 1' - 7 5 - 3 | 4 3 1 - - - . . | 3 - 5 - 6 5 3 1 | 2 - 3 - 7, - - .",
                    melB: "1' - - 7 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - 5 6 - 1' - | 7 - 6 - 5 - 3 - | 5 - - 3 5 - 7 - | 1' - 7 - 5 - 3 - | 4 - 5 - 7 - 2' - | 1' - 7 - 5 - - -"
                },
                {   // Uptime: i – VI – III – VII, wide and hopeful, chords late in the bar.
                    lvl: 1.01, scale: AEOL, chords: ['Am7', 'Fmaj9', 'C6', 'Gsus2', 'Am7', 'Fmaj9', 'Dm7', 'E7'],
                    bass: 'r...r.f.r...o...', comp: [6, 14],
                    melA: "3' - 2' - 1' - 5 - | 6 - 1' - 5 - 3 - | 5 - 3 - 1' - 3' - | 2' - - - 5 - - .",
                    melB: "1 - 3 - 5 - 1' - | 7 - 6 - 5 - - . | 5 - 3 - 5 - 1' - | 2' - 1' - 2' - - . | 3' - 2' - 1' - 5 - | 6 - - 5 6 - 3' - | 2' - 1' - 6 - 4 - | #7, - - - 2 - - ."
                }
            ],
            server: [
                {   // Overclock: a rolling bass, a riff, harmonic minor's E7 at the turn.
                    lvl: 0.85, scale: AEOL, chords: ['Am7', 'Am7', 'Dm7', 'Dm7', 'Fmaj7', 'G', 'Esus4', 'E7'],
                    bass: 'r.rr.or.r.rr.o.f', comp: [3, 6, 14],
                    melA: "1' . 1' 7 . 5 . 3 | 4 3 . 1 . . 5, . | 4 . 4 3 . 1 . 6, | 2 - - - 7, - - .",
                    melB: "5 . 5 . 6 5 3 1 | 2 . 3 . 1 - - . | 4 . 4 . 5 4 3 1 | 6, . 1 . 3 - - . | 3 . 5 . 1' . 7 5 | 7 - 6 - 5 - 2 - | 1 - 2 - 4 - 2 - | #7, - - - 2 - - -"
                },
                {   // Packet Storm: the Andalusian cadence (Am – G – F – E) under a 16th-note hook.
                    lvl: 0.82, scale: AEOL, chords: ['Am', 'G', 'Fmaj7', 'E7', 'Am', 'G', 'Dm9', 'E7'],
                    bass: 'r.o.r.o.r.o.f.o.', comp: [2, 7, 10],
                    melA: "1' 7 1' 5 . 1' 7 5 | 7 5 7 2 . 7 5 2 | 6 5 6 1 . 6 5 3 | #7, 2 #7, 2 3 2 #7, .",
                    melB: "5 - - - 1' - 3' - | 2' - 1' - 7 - - . | 1' - 7 - 6 - 3 - | #7 - - - 2' - - . | 5 - 1' - 2'+3' 2'+1' - - | 7 - 5 - 2 - 5 - | 4 - 6 - 1' - 2' - | #7 - 2' - #7 - . ."
                }
            ],
            snare: [
                {   // Packet Sniffer: dub techno gone quiet: Am9 and Dm9 hanging on an unresolved Esus4, one muted stab a bar.
                    lvl: 1.62, rest: 1.40, slvl: 0.82, srest: 1.34, scale: AEOL, chords: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7', 'Dm9', 'Dm9', 'Esus4', 'Esus4'],
                    bass: 'r..r......r.....', comp: [10], kick: 'x.........x.....', hush: 0.45, tick: '..o..x..o.o..x..', cut: 0.75,
                    melA: "5, . . 1 . . 3 . | 1 - - - . . . . | 5 . . . 1' . . . | 5 - - - . . . .",
                    melB: "1 . 1 . 3 . 5 . | 7 - - - 5 . 3 . | 1 . 1 . 3 . 5 . | 1' - - - 5 - - - | 6 . 4 . 3 . 1 . | 3 - - - 5 - - - | 5 . 4 . 5 . 1' . | 2' - - - 1' - - -"
                },
                {   // Dead Drop: i – v – VI – VII held on sus chords, a bass that steps and stops.
                    lvl: 1.37, rest: 1.36, slvl: 0.85, srest: 1.30, scale: AEOL, chords: ['Am7', 'Am7', 'Em7', 'Em7', 'Fmaj7', 'Fmaj7', 'Gsus4', 'Gsus4'],
                    bass: 'r..r..r.....r...', comp: [6], kick: 'x......x........', hush: 0.45, tick: 'o..x..o...o..x..', cut: 0.75,
                    melA: ". . 3 . . . 1 . | 5, - - - . . . . | . . 5 . . . 4 . | 5 - - - . . . .",
                    melB: "1 . . 3 . . 5 . | 3 - - - 1 - - - | 5 . . 7 . . 2' . | 7 - - - 5 - - - | 6 . . 1' . . 3' . | 1' - - - 5 - - - | 4 . . 5 . . 1' . | 4 - - - 5 - - -"
                }
            ]
        },

        // ---- Sound effects written for this track (anything else plays the shared one through `profile`) --------
        sounds: {
            // Dub techno, quiet: muted saw plucks, filtered square blips, sub thumps, a delay throw.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'sawtooth', dur: 0.07, gain: 0.06, cutoff: 900 + 250 * i, q: 7, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.04, gain: 0.035, at: lastAt(f) }); noise({ dur: 0.015, gain: 0.04, f0: 6000, q: 3 }); },
            snareSpoil: () => { T(52, { to: 45, type: 'sawtooth', dur: 0.28, gain: 0.05, cutoff: 700, q: 4, detune: -20 }); T(53, { to: 46, type: 'sawtooth', dur: 0.28, gain: 0.04, cutoff: 700, q: 4 }); noise({ dur: 0.12, gain: 0.07, f0: 300, type: 'lowpass' }); },
            snareSnap: () => { noise({ dur: 0.03, gain: 0.12, f0: 7000, q: 2 }); noise({ dur: 0.08, gain: 0.05, f0: 1800, f1: 600, q: 5, at: 0.02 }); T(45, { type: 'sine', dur: 0.1, gain: 0.14 }); },
            snareLaser: () => { T(100, { to: 81, type: 'sine', dur: 0.06, gain: 0.045 }); T(88, { type: 'square', dur: 0.025, gain: 0.015, cutoff: 5000 }); },
            snareChain: () => [81, 84, 88].forEach((n, i) => { noise({ dur: 0.02, gain: 0.05, f0: 4000 + 2000 * i, q: 8, at: i * S() / 4 }); T(n, { type: 'square', dur: 0.03, gain: 0.015, cutoff: 4000, at: i * S() / 4 }); }),
            snareSweep: () => { [0, 2].forEach(k => stab([64, 69], { at: k * S(), dur: 0.14, gain: 0.05, cutoff: 1400, q: 6 })); noise({ dur: 0.5, gain: 0.06, f0: 600, f1: 3000, q: 2, attack: 0.4 }); },
            snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => blip(n, { at: i * S() / 2, gain: 0.04 + 0.01 * i, cutoff: 1500 + 800 * i, dur: 0.05 })); T(45, { to: 57, type: 'sawtooth', dur: 0.45, gain: 0.045, cutoff: 1200, q: 8, attack: 0.3 }); },
            snareBoss: () => { sub(33, 30, 0.18, 0.32); sub(33, 30, 0.15, 0.22, 2 * S()); stab([45, 52, 57], { gain: 0.04, dur: 0.4, cutoff: 700, echo: 0.35 }); },
            snareHit: () => { T(57, { type: 'square', dur: 0.12, gain: 0.04, cutoff: 1600 }); tone({ f0: NOTE(mapNote(degShift(57, varDeg()))) * 2.76, dur: 0.1, type: 'sine', gain: 0.025, raw: true }); noise({ dur: 0.04, gain: 0.08, f0: 3000, q: 6 }); },
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
        }
    };
};
