// music/soft.js — the Soft track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/soft/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).soft = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { pump, note, perc, harmNote, MIXO, LYD, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Soft: mallets and bells: a marimba, a kalimba, glassy bells and a warm pad (F major pentatonic).
    const marimba = (n, o = {}) => { T(n, { type: 'sine', dur: 0.25, gain: 0.07, ...o }); T(n + 24, { type: 'sine', dur: 0.05, gain: (o.gain ?? 0.07) * 0.22, at: o.at }); };
    const softBell = (n, o = {}) => { T(n, { type: 'sine', dur: 0.7, gain: 0.05, attack: 0.008, ...o }); T(n + 12, { type: 'triangle', dur: 0.25, gain: (o.gain ?? 0.05) * 0.25, at: o.at }); };
    const padChord = (notes, o = {}) => notes.forEach(n => T(n, { type: 'triangle', dur: 1.4, gain: 0.025, attack: 0.15, cutoff: 1800, ...o }));

    return {
        // The key its sound effects are moved into (they are written in A minor pentatonic): F major pentatonic: F G A C D.
        key: { root: 53, set: [0, 2, 4, 7, 9] },
        // What it does to any effect it doesn't write itself.
        profile: { wave: t => (t === 'square' || t === 'sawtooth' ? 'triangle' : t), cut: 0.55, lp: 2200, gain: 0.85, len: 1.25, attack: 0.012,
            noise: n => ({ ...n, gain: n.gain * 0.7 }) },
        // The plain voice of its simple sounds.
        simpleVoice: { type: 'sine', oct: 0, len: 1.4, gain: 1, attack: 0.008 },
        // Levels, all measured (re-measure when the track or its sounds change: tools/audio). `sfx` and `simple`: its
        // effects against Classic's. `charge`: the sprint meter's parts (arpeggio, hops, acid, gated chord, thrust), after
        // `base`. `snare`: each Packet Snare effect against this track's own effects.
        trims: {
            sfx: 1.21, simple: 1.56,
            base: 1.48, baseSimple: 1.22,
            charge: [1.72, 2.31, 6.47, 7.14, 3.05], chargeSimple: [0.17, 0.72, 6.12, 5.25, 3.8],
            snare: { snareCatch: 1.37, snareSpoil: 0.6, snareSnap: 1.16, snareLaser: 1.77, snareChain: 1.77, snareSweep: 1.59, snareCharge: 2.67, snareBoss: 0.97, snareHit: 1.22, 'snarePlace:wall': 0.74, 'snarePlace:decoy': 1.59, 'snarePlace:turret': 2.01, 'snarePlace:tower': 0.96, snareRemove: 1.53, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.39, snareZap: 2, snareDecoy: 1.72, snareQuarantine: 0.85, snareStun: 0.8, snareCore: 0.54, snareBossDown: 0.71, snareParry: 1.43, snareSlash: 2.27, snareSpoof: 1.68, snareGarbage: 1.11, snareRace: 3.14, snareHijack: 1.27, snareTaken: 4.12, snareFlag: 2.3, snareIds: 1.11, snareRebuild: 0.76, snareHerdStun: 1.57 },
            snareSimple: { snareCatch: 0.98, snareSpoil: 0.9, snareSnap: 1.65, snareLaser: 1.94, snareChain: 1.69, snareSweep: 2.5, snareCharge: 1.25, snareBoss: 1.36, snareHit: 0.9, 'snarePlace:wall': 1.19, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.25, 'snarePlace:tower': 1.29, snareRemove: 1.19, 'snarePower:freeze': 1.03, 'snarePower:purge': 1.37, snareZap: 1.66, snareDecoy: 1.55, snareQuarantine: 1.13, snareStun: 1.17, snareCore: 0.88, snareBossDown: 0.68, snareParry: 2.45, snareSlash: 1.62, snareSpoof: 1.78, snareGarbage: 1.62, snareRace: 2.59, snareHijack: 2.15, snareTaken: 4.06, snareFlag: 1.66, snareIds: 1.92, snareRebuild: 1.56, snareHerdStun: 1.38 }
        },

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Soft: 93 BPM with a light swing (every second 16th leans late), in F major / D minor. It starts from the
        // keys, not the drums: an electric piano (a sine with a second sine bending its pitch at the strike, so a
        // harder note barks and a soft one is round, each chord rolled a little and spread left to right), a warm
        // pad, a round bass that holds its notes. The tune is a kalimba: a sine with a short inharmonic ring at
        // the pluck and the thumb's tick. Shakers with a soft attack, a rim on the backbeat, and a two-step kick
        // (1, the late 16th before 3, the "and" of 3) that is the last thing in. A short warm room.
        // Its click figure plays the track's 8ths (322 ms: about three notes a second while a job is held).
        style: {
            bpm: 93, swing: 0.2,
            cutoff: k => 900 + 5200 * k * k, drive: 0, gain: 0.85, shift: 5,     // D minor / F major
            beat: 1.53, tones: 1.487,   // drums about 3.5 dB under the tones, measured: this track keeps them softer than the others
            simpleMix: { gain: 1, beat: 0.997, tones: 2.032 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            space: { reverb: { seconds: 1.2, damp: 3600, level: 0.32, pre: 0.012 }, delay: { steps: 4, feedback: 0.2, cutoff: 1800, level: 0.3, pan: -0.2 }, width: 1 },
            layers: { keys: -1, pad: -1, bass: 0.06, mel: 0.2, off: 0.38, kick: 0.46, harm: 0.5, clap: 0.58, sixteenth: 0.7, arp: 0.8 },
            fillAt: 0.42,
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song, ts = t + c.sw;
                // Drums. A stealth song keeps its own hushed kick until you're spotted; otherwise the kick waits for
                // its layer. A sparse section is the kick on 1 alone.
                if (song.kick) { const kg = kickLevel(c, s, s === 0 || s === 7 || s === 10); if (kg) kick(ts, 0.3 * kg, 105, 46, 0.24); }
                else if (c.drums && L.kick > 0.02 && (s === 0 || (!c.sparse && (s === 7 || s === 10)))) kick(ts, (s === 0 ? 0.32 : 0.24) * L.kick, 105, 46, 0.24);
                if (c.drums && !c.sparse) {
                    if (L.off > 0.02 && s % 2 === 0) perc(ts, (s % 4 === 2 ? 0.03 : 0.018) * L.off, { f: 6500, q: 1.2, len: 0.06, attack: 0.012, pan: 0.3 });
                    if (L.sixteenth > 0.02 && s % 2 === 1) perc(ts, 0.012 * L.sixteenth, { f: 7000, q: 1.2, len: 0.04, attack: 0.008, pan: 0.3 });
                    // The rim: a narrow knock of noise with a short pitched click in it, on 2 and 4.
                    if (L.clap > 0.02 && (s === 4 || s === 12)) {
                        perc(ts, 0.05 * L.clap, { f: 1800, q: 7, len: 0.035, rev: 0.35, pan: -0.2 });
                        note(ts, 81, 0.03, 0.02 * L.clap, { raw: true, type: 'sine', part: 'beat', pan: -0.2 });
                    }
                }
                if (L.pad > 0.02 && s === 0) pad(t, ch.v, len * 16, 0.017 * L.pad, 'triangle', 1100 + 500 * k, { rev: 0.45 });
                const b = c.bassOn && L.bass > 0.02 && bassAt(song, s, ch);
                if (b) note(ts, b, len * 2.6, 0.17 * L.bass, { type: 'triangle', cutoff: 420 + 600 * k, q: 0.8, sus: 0.7, dec: 0.12, rel: 0.09, attack: 0.012 });
                // The electric piano on the song's comp steps: harder on the off-beats, and harder as the run speeds up.
                if (L.keys > 0.02 && c.comp.includes(s)) {
                    const vel = s % 4 === 2 ? 1 : 0.8;
                    ch.v.forEach((n, i) => {
                        const at = ts + i * 0.012, pan = (i - 1.5) * 0.22;
                        note(at, n + 12, len * 3.2, 0.021 * vel * L.keys, { type: 'sine', fm: { ratio: 1, index: 1.1 + 1.3 * vel * (0.5 + k), decay: 0.22, sus: 0.12 },
                            attack: 0.004, sus: 0.3, dec: 0.4, rel: 0.3, pan, rev: 0.3, dly: 0.12 });
                        note(at, n + 36, 0.05, 0.004 * vel * L.keys, { type: 'sine', pan, low: true });      // the tine
                    });
                }
                // A mallet arpeggio, rising two bars and falling two, left and right.
                if (L.arp > 0.02 && s % 2 === 0) {
                    const v = ch.v, i = (s / 2) % v.length, n = v[c.bar % 4 >= 2 ? v.length - 1 - i : i] + 24;
                    note(ts, n, len * 1.6, 0.022 * L.arp, { type: 'sine', pan: i % 2 ? 0.5 : -0.5, rev: 0.3, low: true });
                    note(ts, n + 24, 0.04, 0.005 * L.arp, { type: 'sine', low: true });
                }
                // The kalimba: notes on the beat a little harder, every note a little different (the same each time
                // that bar comes round).
                if (c.mel) {
                    const d = Math.min(len * c.mel.len * 1.1, 1.1), vel = (s % 4 === 0 ? 1 : 0.82) * (0.92 + (0.16 * c.pick(8, s)) / 7);
                    note(c.mel.t, c.mel.n, d, 0.058 * vel * c.melGain, { type: 'sine', fm: { ratio: 5.4, index: 0.8 * vel, decay: 0.045, sus: 0.02 }, attack: 0.002, rev: 0.35, dly: 0.22, pan: 0.12 });
                    perc(c.mel.t, 0.012 * vel * c.melGain, { f: 2600, q: 2, len: 0.012, part: 'tones', pan: 0.12 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.03 * c.harmGain * c.melGain,
                        { type: 'sine', fm: { ratio: 5.4, index: 0.5, decay: 0.04, sus: 0.02 }, rev: 0.35, pan: -0.25, low: true });
                }
            },
            // The end of a section: a rim figure (one of two) and the next chord's top note leading in.
            fill(t, s, k, len, L, c) {
                const ts = t + c.sw;
                if (c.pick(2, 5) === 0 ? (s === 12 || s === 14 || s === 15) : (s === 13 || s === 14)) perc(ts, 0.045, { f: 1800, q: 7, len: 0.035, rev: 0.35, pan: -0.2 });
                if (s === 14) note(ts, c.next.v[c.next.v.length - 1] + 12, len * 3, 0.03, { type: 'sine', fm: { ratio: 5.4, index: 0.6, decay: 0.045, sus: 0.02 }, rev: 0.4 });
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        // Each has its own form, with room to breathe. `lvl` trims a song's pitched voices so every song measures
        // the same; a stealth song's `rest` lifts its tones while its drums are hushed.
        songs: {
            lab: [
                {   // Morning Lab: major sevenths, the keys on the off-beats, a kalimba line that leans across the beat.
                    // B goes to the relative minor and comes home through a borrowed chord (F minor: the iv of C).
                    name: 'Morning Lab', lvl: 0.92, scale: ION, tonic: 3, oct: -1,
                    chords: { A: ['Cmaj7', 'Am7', 'Fmaj7', 'G6', 'Cmaj7', 'Em7', 'Fmaj7', 'Gsus4'], B: ['Am7', 'Am7', 'Dm9', 'G7sus4', 'Cmaj7', 'Fmaj7', 'Fm6', 'G6'] },
                    bass: { A: 'r......r..f.....', B: 'r.....f...r..t..' }, comp: { A: [6, 14], B: [6, 11] },
                    mel: {
                        A: "3 - 5 - . 7 - 5 | 6 - - 5 - 3 - . | 4 - 6 - . 1' - 6 | 5 - - - 2 - 3+5 - | 3 - 5 - . 7 - 1' | 7 - - 5 - 3 - . | 6 - 1' - . 6 - 4 | 5 - - - 2 - - .",
                        B: "1' - - 6 - 5 - 3 | 5 - 6 - 1' - - . | 2' - - 1' - 6 - 4 | 5 - 4 - 2 - - . | 3 - 5 - 1' - 7 - | 6 - - 1' - 3' - - | b6 - - 1' - 2' - - | 2' - 7 - 5 - - ."
                    },
                    form: [['intro', 4, { mel: null, drums: 'none' }], ['A', 8], ['B', 8, { chords: 'B' }], ['A', 8, { harm: true }],
                        ['breathe', 4, { mel: null, drums: 'none', bassOn: false, fill: false, lift: -0.2 }], ['B', 8, { chords: 'B' }], ['A', 8], ['out', 4, { mel: null, drums: 'sparse', fill: false }]]
                },
                {   // Window Seat: IV – V – iii – vi, then ii – V – I: unhurried, and it comes to rest. It starts on the tune.
                    name: 'Window Seat', lvl: 0.85, scale: ION, tonic: 3, oct: -1, chords: { A: ['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', 'G', 'Cmaj7', 'Cmaj7'], V: ['Dm7', 'G', 'Cmaj7', 'Cmaj7'] },
                    bass: 'r.....f...r...o.', comp: [3, 10],
                    mel: {
                        A: "3 - 4 - 6 - 3 - | 2 - - - 7, - 5, - | 7, - 2 - 3 - 5 - | 6 - - - 3 - - .",
                        B: "6 - 5 - 3 - 1 - | 2 - - - 4 - 7, - | 5 - 3 - 2 - 7, - | 1 - - - 3 - 5 - | 6 - - - 4 - 2 - | 7, - 2 - 4 - 5 - | 3 - 2 - 1 - 7, - | 1 - - - - - . ."
                    },
                    form: [['A', 8], ['A', 8, { harm: true }], ['B', 8], ['still', 4, { mel: null, chords: 'V', drums: 'none', fill: false, lift: -0.15 }], ['A', 8], ['B', 8], ['out', 4, { mel: null, chords: 'V', drums: 'sparse', fill: false }]]
                }
            ],
            server: [
                {   // Gentle Climb: minor ninths, a syncopated bass; the kick comes in late and stays.
                    name: 'Gentle Climb', lvl: 0.98, scale: AEOL, chords: ['Am9', 'Fmaj7', 'Cadd9', 'G6', 'Dm9', 'Fmaj7', 'Cadd9', 'Esus4'],
                    bass: 'r......r..f.....', comp: [4, 12],
                    mel: {
                        A: "5 - 3 - 2 - 3 - | 1 - - - 3 - 5 - | 4 - 3 - 2 - 5, - | 2 - - - 7, - - .",
                        B: "1' - 7 - 5 - 3 - | 5 - - - 3 - 1 - | 2 - 3 - 5 - 7 - | 5 - - - 2' - - - | 1' - - - 6 - 4 - | 3 - 5 - 1' - 7 - | 5 - 3 - 2 - 1 - | 2 - - - - - . ."
                    },
                    form: [['intro', 2, { mel: null, drums: 'none' }], ['A', 8], ['B', 8], ['A', 8, { harm: true, lift: 0.06 }],
                        ['break', 4, { mel: 'A', melGain: 0.7, drums: 'none', bassOn: false, fill: false }], ['B', 8], ['A', 8], ['out', 2, { mel: null, fill: false }]]
                },
                {   // Glide Path: Dorian (the bright sixth), the keys on every off-beat; a two-chord vamp in the middle.
                    name: 'Glide Path', lvl: 0.73, scale: DOR, chords: { A: ['Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Am7', 'Esus4'], V: ['Am7', 'D9'] },
                    bass: 'r..r..f.r..r..o.', comp: [2, 6, 10, 14],
                    mel: {
                        A: "5 - 7 - 1' - 7 5 | 6 - 5 - 4 - 1 - | 5 - 7 - 2' - 1' 7 | 6 - - - 4 - - .",
                        B: "1' - - 7 5 - 3 - | 4 - 6 - 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - - 3' - - - | 3' - 1' - 7 - 5 - | 4' - - - 2' - 7 - | 1' - 5 - 3 - 1 - | 2 - - - 4 - - -"
                    },
                    form: [['A', 8], ['B', 8], ['A', 8], ['vamp', 4, { mel: null, chords: 'V', drums: 'sparse', fill: false }], ['B', 8, { lift: 0.06 }], ['A', 8, { harm: true }], ['out', 4, { mel: null, chords: 'V', fill: false }]]
                }
            ],
            snare: [
                {   // Tiptoe: minor ninths and sus chords, a mallet whispering low, the bass on one and the and of three.
                    name: 'Tiptoe', lvl: 1.1, rest: 1.32, slvl: 0.85, srest: 1.31, scale: AEOL, chords: ['Am9', 'Am9', 'Gsus2', 'Gsus2', 'Fmaj7', 'Fmaj7', 'Esus4', 'Esus4'],
                    bass: 'r.......f.......', comp: [6, 14], kick: 'x.......x.......', hush: 0.5, tick: '...o...x...o..o.', cut: 0.8,
                    mel: {
                        A: "5 . . . 3 . . . | 1 - - - . . . . | 2 . . . 1 . . . | 5, - - - . . . .",
                        B: "1 . 3 . 5 . 7 . | 5 - - - 3 - - - | 4 . 5 . 2 . 1 . | 2 - - - . . . . | 6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 5 . 4 . 2 . 1 . | 2 - - - 1 - - -"
                    },
                    form: [['in', 4, { mel: null }], ['A', 8], ['B', 8], ['A', 8], ['wait', 4, { mel: null, bassOn: false, fill: false }], ['B', 8], ['A', 8]]
                },
                {   // Hushed Channel: F major sevenths drifting to a Gsus4 that never lands, a kalimba line kept low.
                    name: 'Hushed Channel', lvl: 1.19, rest: 1.26, slvl: 0.85, srest: 1.31, scale: ION, tonic: 3, oct: -1, chords: ['Fmaj7', 'Fmaj7', 'Dm9', 'Dm9', 'Am7', 'Am7', 'Gsus4', 'Gsus4'],
                    bass: 'r.....r.........', comp: [10], kick: 'x.....x.........', hush: 0.5, tick: '.o...o...o...x..', cut: 0.8,
                    mel: {
                        A: "3 . . . . . 1 . | 6, - - - . . . . | 2 . . . 1 . . . | 2 - - - . . . .",
                        B: "6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 4 . 3 . 2 . 6, . | 1 - - - . . . . | 3 . 5 . 6 . 1' . | 5 - - - 3 - - - | 5 . 4 . 2 . 1 . | 2 - - - 5 - - -"
                    },
                    form: [['A', 8], ['B', 8], ['wait', 4, { mel: null, bassOn: false, fill: false }], ['A', 8], ['B', 8], ['A', 8, { harm: true }]]
                }
            ]
        },

        // ---- Sound effects written for this track (anything else plays the shared one through `profile`) --------
        sounds: {
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
        }
    };
};
