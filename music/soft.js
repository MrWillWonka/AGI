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
            fx: {system: 0.82, smash: 1.3, windup: 0.69, crunch: 0.93, flow: 1.38, freeze: 1.32, release: 0.99, viral: 0.76},      // single effects against Classic's (tools/audio/fx-levels.js)
            charge: [1.7, 2.33, 3.04, 2.71, 3.05], chargeSimple: [0.17, 0.72, 6.12, 5.25, 3.8],
            snare: { snareCatch: 1.37, snareSpoil: 0.6, snareSnap: 1.16, snareLaser: 1.77, snareChain: 1.77, snareSweep: 1.59, snareCharge: 2.67, snareBoss: 0.97, snareHit: 1.22, 'snarePlace:wall': 0.74, 'snarePlace:decoy': 1.59, 'snarePlace:turret': 2.01, 'snarePlace:tower': 0.96, snareRemove: 1.53, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.39, snareZap: 2, snareDecoy: 1.72, snareQuarantine: 0.85, snareStun: 0.8, snareCore: 0.54, snareBossDown: 0.71, snareParry: 1.43, snareSlash: 2.27, snareSpoof: 1.68, snareGarbage: 1.11, snareRace: 3.14, snareHijack: 1.27, snareTaken: 4.12, snareFlag: 2.3, snareIds: 1.11, snareRebuild: 0.76, snareHerdStun: 1.57 },
            snareSimple: { snareCatch: 0.98, snareSpoil: 0.9, snareSnap: 1.65, snareLaser: 1.94, snareChain: 1.69, snareSweep: 2.5, snareCharge: 1.25, snareBoss: 1.36, snareHit: 0.9, 'snarePlace:wall': 1.19, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.25, 'snarePlace:tower': 1.29, snareRemove: 1.19, 'snarePower:freeze': 1.03, 'snarePower:purge': 1.37, snareZap: 1.66, snareDecoy: 1.55, snareQuarantine: 1.13, snareStun: 1.17, snareCore: 0.88, snareBossDown: 0.68, snareParry: 2.45, snareSlash: 1.62, snareSpoof: 1.78, snareGarbage: 1.62, snareRace: 2.59, snareHijack: 2.15, snareTaken: 4.06, snareFlag: 1.66, snareIds: 1.92, snareRebuild: 1.56, snareHerdStun: 1.38 }
        },

        // The sprint meter's parts (one is picked per charge; each plays the chord the music is on, on the grid): the
        // chord strummed upward in sines, a kalimba hopping octaves, a mallet walking up the chord and back, the chord
        // rung softly.
        meter: [
            { raw: true, type: 'sine', gain: 0.04, dur: 0.3, q: 1, cutoff: () => 5000, notes: (l, n, ch) => [ch.v[n % ch.v.length] + 24] },
            { raw: true, type: 'sine', gain: 0.04, dur: 0.22, q: 1, cutoff: () => 5000, notes: (l, n, ch) => [ch.root + 36 + (n % 2 ? 12 : 0)] },
            { raw: true, type: 'triangle', gain: 0.034, dur: 0.2, q: 1, cutoff: l => 1200 + 3000 * l, notes: (l, n, ch) => { const v = ch.v, m = 2 * v.length - 2 || 1, i = n % m; return [v[i < v.length ? i : m - i] + 24]; } },
            { raw: true, type: 'sine', gain: 0.014, dur: 0.25, q: 1, cutoff: () => 5000, notes: (l, n, ch) => ch.v.map(x => x + 24) }
        ],

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
                // A song may bring its own drum patterns (`kit`), chords (`compVoice`) and lead (`lead`).
                const K = c.kit, N = c.steps;
                if (song.kick) { const kg = kickLevel(c, s, K ? K.kick : s === 0 || s === 7 || s === 10); if (kg) kick(ts, 0.3 * kg, 105, 46, 0.24); }
                else if (K) { if (c.drums && L.kick > 0.02 && K.kick && (s === 0 || !c.sparse)) kick(ts, (s === 0 ? 0.32 : 0.26) * K.kick * L.kick, 105, 46, 0.24); }
                else if (c.drums && L.kick > 0.02 && (s === 0 || (!c.sparse && (s === 7 || s === 10)))) kick(ts, (s === 0 ? 0.32 : 0.24) * L.kick, 105, 46, 0.24);
                if (c.drums && !c.sparse && K) {
                    if (K.hat >= 1 && L.off > 0.02) perc(ts, (K.hat === 2 ? 0.034 : 0.026) * L.off, { f: 6500, q: 1.2, len: K.hat === 2 ? 0.1 : 0.06, attack: 0.012, pan: 0.3 });
                    else if (K.hat && L.sixteenth > 0.02) perc(ts, 0.013 * L.sixteenth, { f: 7000, q: 1.2, len: 0.04, attack: 0.008, pan: 0.3 });
                    if (K.snare && L.clap > 0.02) {
                        perc(ts, 0.03 * K.snare * L.clap, { f: 1500, q: 5, len: 0.04, attack: 0.004, rev: 0.45, pan: -0.2 });
                        note(ts, 81, 0.03, 0.008 * K.snare * L.clap, { raw: true, type: 'sine', part: 'beat', pan: -0.2 });
                    }
                } else if (c.drums && !c.sparse) {
                    if (L.off > 0.02 && s % 2 === 0) perc(ts, (s % 4 === 2 ? 0.03 : 0.018) * L.off, { f: 6500, q: 1.2, len: 0.06, attack: 0.012, pan: 0.3 });
                    if (L.sixteenth > 0.02 && s % 2 === 1) perc(ts, 0.012 * L.sixteenth, { f: 7000, q: 1.2, len: 0.04, attack: 0.008, pan: 0.3 });
                    // The rim: a narrow knock of noise with a short pitched click in it, on 2 and 4.
                    if (L.clap > 0.02 && (s === 4 || s === 12)) {
                        perc(ts, 0.05 * L.clap, { f: 1800, q: 7, len: 0.035, rev: 0.35, pan: -0.2 });
                        note(ts, 81, 0.03, 0.02 * L.clap, { raw: true, type: 'sine', part: 'beat', pan: -0.2 });
                    }
                }
                if (L.pad > 0.02 && s === 0) pad(t, ch.v, len * N, 0.017 * L.pad, 'triangle', 1100 + 500 * k, { rev: 0.45 });
                const b = c.bassOn && L.bass > 0.02 && bassAt(song, s, ch);
                if (b) note(ts, b, len * 2.6, 0.17 * L.bass, { type: 'triangle', cutoff: 420 + 600 * k, q: 0.8, sus: 0.7, dec: 0.12, rel: 0.09, attack: 0.012 });
                // The electric piano on the song's comp steps: harder on the off-beats, and harder as the run speeds up.
                if (L.keys > 0.02 && c.comp.includes(s) && song.compVoice === 'guitar') {
                    // A nylon guitar: the chord strummed low to high, each string a soft pluck.
                    ch.v.forEach((n, i) => note(ts + i * 0.022, n, len * 2.6, 0.03 * L.keys, { type: 'triangle', cutoff: 900 + 1100 * k, q: 1.5, env: 2.2, envTime: 0.05, attack: 0.003, rev: 0.3, pan: -0.15 + i * 0.1 }));
                } else if (L.keys > 0.02 && c.comp.includes(s) && song.compVoice === 'warm') {
                    // Warm keys: the chord as sines that swell in and fade, nothing struck.
                    ch.v.forEach((n, i) => note(ts + i * 0.03, n + 12, len * 5, 0.02 * L.keys, { type: 'sine', attack: 0.06, sus: 0.6, dec: 0.5, rel: 0.6, rev: 0.45, pan: (i - 1.5) * 0.25 }));
                } else if (L.keys > 0.02 && c.comp.includes(s) && song.compVoice !== 'none') {
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
                if (c.mel && song.lead === 'flute') {         // a breath, then a sine that swells and wavers on its long notes
                    const d = len * c.mel.len * 0.98;
                    note(c.mel.t, c.mel.n, d * 1.05, 0.06 * c.melGain, { type: 'sine', attack: Math.min(0.1, d * 0.35), sus: 0.85, dec: 0.2, rel: 0.25, vib: c.mel.len >= 3 ? { rate: 4.6, depth: 7, delay: 0.3 } : null, rev: 0.45, dly: 0.12, pan: 0.1 });
                    note(c.mel.t, c.mel.n + 12, d, 0.006 * c.melGain, { type: 'sine', attack: 0.08, sus: 0.7, dec: 0.2, rel: 0.2, rev: 0.45, low: true });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.024 * c.harmGain * c.melGain, { type: 'sine', attack: 0.06, sus: 0.85, dec: 0.15, rel: 0.12, rev: 0.4, pan: -0.25, low: true });
                } else if (c.mel && song.lead === 'ep') {     // the electric piano takes the tune: round, with a bark on the beats
                    const d = Math.max(0.5, len * c.mel.len * 1.1), vel = s % 4 === 0 ? 1 : 0.8;
                    note(c.mel.t, c.mel.n, d, 0.06 * vel * c.melGain, { type: 'sine', fm: { ratio: 1, index: 0.7 + 0.5 * vel * (0.5 + k), decay: 0.3, sus: 0.1 }, attack: 0.008, sus: 0.35, dec: 0.45, rel: 0.35, rev: 0.35, dly: 0.2, pan: 0.1 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.03 * c.harmGain * c.melGain, { type: 'sine', fm: { ratio: 1, index: 0.6, decay: 0.2, sus: 0.1 }, sus: 0.35, dec: 0.45, rel: 0.35, rev: 0.35, pan: -0.25, low: true });
                } else if (c.mel && song.lead === 'guitar') { // a nylon string: a triangle through a filter that closes
                    const d = Math.max(0.35, len * c.mel.len * 1.1);
                    note(c.mel.t, c.mel.n, d, 0.085 * c.melGain, { type: 'triangle', cutoff: 1300 + 1500 * k, q: 1.5, env: 2.5, envTime: 0.06, attack: 0.003, rev: 0.3, dly: 0.1, pan: 0.15 });
                    perc(c.mel.t, 0.008 * c.melGain, { f: 2200, q: 2, len: 0.01, part: 'tones', pan: 0.15 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.04 * c.harmGain * c.melGain, { type: 'triangle', cutoff: 1500, q: 1.5, env: 2, envTime: 0.06, rev: 0.3, pan: -0.25, low: true });
                } else if (c.mel && song.lead === 'glass') {  // a small soft bell: a sine with a faint shimmer at the strike
                    const d = Math.min(1.1, Math.max(0.45, len * c.mel.len * 1.2));
                    note(c.mel.t, c.mel.n, d, 0.06 * c.melGain, { type: 'sine', fm: { ratio: 4, index: 0.35, decay: 0.08, sus: 0.02 }, attack: 0.006, rev: 0.5, dly: 0.25, pan: s % 4 >= 2 ? 0.25 : -0.1 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.025 * c.harmGain * c.melGain, { type: 'sine', rev: 0.5, pan: -0.3, low: true });
                } else if (c.mel && song.lead === 'hum') {    // a hummed line: a sine with a triangle an octave under it, slow in, joined up
                    const d = len * c.mel.len * 1.15;
                    note(c.mel.t, c.mel.n, d, 0.05 * c.melGain, { type: 'sine', attack: Math.min(0.12, d * 0.35), sus: 0.85, dec: 0.2, rel: 0.3, vib: c.mel.len >= 4 ? { rate: 4.2, depth: 6, delay: 0.35 } : null, rev: 0.45, pan: 0.1 });
                    note(c.mel.t, c.mel.n - 12, d, 0.022 * c.melGain, { type: 'triangle', cutoff: 700, attack: Math.min(0.14, d * 0.35), sus: 0.85, dec: 0.2, rel: 0.3, rev: 0.4, pan: -0.1 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.024 * c.harmGain * c.melGain, { type: 'sine', attack: 0.1, sus: 0.85, dec: 0.2, rel: 0.3, rev: 0.45, pan: -0.3, low: true });
                } else if (c.mel) {
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
                {   // Window Seat: a slow waltz in C at 88, straight: the bass on one, warm keys swelling on two, a soft
                    // flute for the tune and almost no drums. Eight bars, then six that wander and come home.
                    name: 'Window Seat', lvl: 1.21, bpm: 88, steps: 12, swing: 0, scale: ION, tonic: 3, oct: -1, lead: 'flute', compVoice: 'warm',
                    kit: { kick: 'x...........', snare: '............', hat: '....o...o...' },
                    chords: { A: ['Cmaj7', 'Em7', 'Fmaj7', 'G6', 'Am7', 'Fmaj7', 'G7sus4', 'Cmaj7'], B: ['Am7', 'Em7', 'Fmaj7', 'Cmaj7', 'Dm7', 'G6'] },
                    bass: { A: 'r...........', B: 'r.......t...' }, comp: [4],
                    mel: {
                        A: "3 - - 5 - - | 7 - - 5 - 3 | 6 - 5 - 4 - | 2 - - - - . | 1 - 3 - 5 - | 6 - - 1' - - | 5 - 4 - 2 - | 5 - - - - .",
                        B: "1' - - 5 - 6 | 5 - - 3 - - | 4 - 6 - 1' - | 7 - - 5 - - | 6 - 4 - 2 - | 2 - - - 5 -"
                    },
                    form: [['A', 8], ['A', 8, { harm: true }], ['B', 6, { chords: 'B' }], ['A', 8], ['still', 4, { mel: null, chords: 'B', from: 2, drums: 'none', fill: false, lift: -0.15 }],
                        ['B', 6, { chords: 'B' }], ['A', 8, { lift: 0.06 }], ['out', 4, { mel: null, from: 4, drums: 'sparse', fill: false }]]
                }
            ],
            server: [
                {   // Gentle Climb: 100 and straight, unhurried: a kick on one and the "and" of three, a rim once a bar, a
                    // round electric piano carrying the tune over minor ninths; the longest song here.
                    name: 'Gentle Climb', lvl: 0.93, bpm: 100, swing: 0, scale: AEOL, lead: 'ep', compVoice: 'warm', chords: ['Am9', 'Fmaj7', 'Cadd9', 'G6', 'Dm9', 'Fmaj7', 'Cadd9', 'Esus4'],
                    kit: { kick: 'x.........x.....', snare: '............o...', hat: '..o...o...o...o.' },
                    bass: 'r......r..f.....', comp: [3, 10],
                    mel: {
                        A: "5 - 3 - 2 - 3 - | 1 - - - 3 - 5 - | 4 - 3 - 2 - 5, - | 2 - - - 7, - - .",
                        B: "1' - 7 - 5 - 3 - | 5 - - - 3 - 1 - | 2 - 3 - 5 - 7 - | 5 - - - 2' - - - | 1' - - - 6 - 4 - | 3 - 5 - 1' - 7 - | 5 - 3 - 2 - 1 - | 2 - - - - - . ."
                    },
                    form: [['intro', 4, { mel: null, drums: 'sparse' }], ['A', 8], ['A', 8, { harm: true }], ['B', 8], ['break', 4, { mel: 'A', melGain: 0.7, drums: 'none', bassOn: false, fill: false }],
                        ['build', 4, { mel: 'A', melGain: 0.85, drums: 'sparse', entry: false }], ['B', 8, { lift: 0.08 }], ['A', 8], ['B', 8], ['A', 8, { harm: true, lift: 0.1 }], ['out', 4, { mel: null, fill: false }]]
                },
                {   // Glide Path: a slow bossa at 104 in A Dorian: the kick's sway, three quiet rims, soft shakers, warm keys
                    // and a hummed tune over a two-chord vamp. Short.
                    name: 'Glide Path', lvl: 0.83, bpm: 104, swing: 0, scale: DOR, lead: 'hum', compVoice: 'warm',
                    kit: { kick: 'x..x....x..x....', snare: '...o..o.....o...', hat: 'o.o.o.o.o.o.o.o.' },
                    chords: { A: ['Am7', 'D9', 'Am7', 'D9'], B: ['Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Am7', 'Esus4'] },
                    bass: 'r..r....f..f....', comp: [0, 10],
                    mel: {
                        A: "5 - 7 - 1' - 7 5 | 6 - 5 - 4 - 1 - | 5 - 7 - 2' - 1' 7 | 6 - - - 4 - - .",
                        B: "1' - - 7 5 - 3 - | 4 - 6 - 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - - 3' - - - | 3' - 1' - 7 - 5 - | 4' - - - 2' - 7 - | 1' - 5 - 3 - 1 - | 2 - - - 4 - - -"
                    },
                    form: [['A', 4], ['A', 4], ['B', 8, { chords: 'B' }], ['A', 4, { harm: true }], ['vamp', 4, { mel: null, fill: false }], ['B', 8, { chords: 'B', lift: 0.06 }], ['A', 4]]
                }
            ],
            snare: [
                {   // Tiptoe: a shuffle at 84, every second 16th late by a third: a little glass bell stepping down a chord
                    // a bar, the bass on one and three.
                    name: 'Tiptoe', lvl: 1.07, rest: 1.32, slvl: 0.85, srest: 1.31, bpm: 84, swing: 0.33, scale: AEOL, lead: 'glass', chords: ['Am9', 'Gsus2', 'Fmaj7', 'Esus4'],
                    bass: 'r.......f.......', comp: [6, 14], kick: 'x.......o.......', hush: 0.5, tick: '...o...x...o..o.', cut: 0.8,
                    mel: {
                        A: "5 . 3 . 1 . . . | 4 . 2 . 7, . . . | 3 . 1 . 6, . . . | 2 - - - . . 5, .",
                        B: "1 . 3 . 5 . 7 . | 4 - - - 2 - - - | 6 . 5 . 3 . 1 . | 2 - - - 5, - - - | 1' . 7 . 5 . 3 . | 4 - - - 7, - - - | 3 . 5 . 6 . 1' . | 7 - - - 5 - - -"
                    },
                    form: [['in', 2, { mel: null }], ['A', 4], ['A', 4], ['B', 8], ['wait', 2, { mel: null, bassOn: false, fill: false }], ['A', 4], ['B', 8], ['A', 4, { harm: true }]]
                },
                {   // Hushed Channel: a lullaby at 80 in F Lydian: no chords struck, only the pad, and the electric piano
                    // alone in five-bar phrases over a Gsus4 that never lands.
                    name: 'Hushed Channel', lvl: 1.05, rest: 1.26, slvl: 0.85, srest: 1.31, bpm: 80, swing: 0, scale: LYD, tonic: 8, oct: -1, lead: 'ep', compVoice: 'none',
                    chords: { A: ['Fmaj7', 'Fmaj7', 'Em7', 'Dm9', 'Gsus4'], B: ['Am7', 'Fmaj7', 'Dm9', 'Em7', 'Gsus4'] },
                    bass: 'r.....r.........', comp: [10], kick: 'x.....x.........', hush: 0.5, tick: '.o...o...o...x..', cut: 0.8,
                    mel: {
                        A: "5 - - - 3 - - - | 7 - - - - - 5 - | 4 - - - 2 - - - | 6 - - - 3 - 1 - | 2 - - - - - . .",
                        B: "3 - 5 - 7 - - - | 7 - - - 5 - 3 - | 6 - - - 3 - - - | 2 - 4 - 7 - - - | 6 - - - 5 - - ."
                    },
                    form: [['A', 5], ['B', 5, { chords: 'B' }], ['wait', 2, { mel: null, bassOn: false, fill: false }], ['A', 5, { harm: true }], ['B', 5, { chords: 'B' }]]
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
            snareHerdStun: () => { T(72, { to: 52, type: 'sine', dur: 0.28, gain: 0.05 }); noise({ dur: 0.04, gain: 0.03, f0: 5000, type: 'highpass' }); },
            // The power-up moments, in this track's mallets, bells and pad: they still land, warmly.
            system: () => { [69, 72, 76, 79, 81, 84, 88, 91, 93].forEach((n, i) => softBell(n, { at: i * S() / 2, gain: 0.035, dur: 0.6 })); padChord([57, 64, 69, 72], { at: S() * 2, dur: 1.6 }); },
            smash: () => { T(40, { to: 28, type: 'sine', dur: 0.7, gain: 0.35 }); noise({ dur: 0.7, gain: 0.14, f0: 900, f1: 120, type: 'lowpass' }); padChord([45, 52, 57, 64], { dur: 1.4, gain: 0.035, at: 0.05 }); marimba(45, { gain: 0.1 }); },
            windup: () => { noise({ dur: 0.6, gain: 0.06, f0: 300, f1: 1800, type: 'lowpass', attack: 0.5 }); [57, 60, 64, 69].forEach((n, i) => T(n, { type: 'sine', dur: 0.5, gain: 0.03, at: i * 0.12, attack: 0.05 })); },
            crunch: () => { [57, 60, 64].forEach((n, i) => marimba(n, { at: i * S() / 4, gain: 0.07 })); noise({ dur: 0.3, gain: 0.07, f0: 800, f1: 400, type: 'lowpass' }); },
            flow: () => { padChord([57, 64, 69, 72, 76], { dur: 2.2, gain: 0.03 }); [81, 84, 88].forEach((n, i) => softBell(n, { at: i * S() * 2, gain: 0.03 })); },
            freeze: () => { T(93, { to: 57, type: 'sine', dur: 0.9, gain: 0.08 }); softBell(93, { gain: 0.04 }); noise({ dur: 0.8, gain: 0.04, f0: 4000, f1: 300, type: 'lowpass' }); },
            release: () => { noise({ dur: 0.6, gain: 0.14, f0: 300, f1: 3500, type: 'lowpass', attack: 0.3 }); T(45, { to: 33, type: 'sine', dur: 0.6, gain: 0.3, at: 0.3 }); padChord([57, 64, 69, 76], { at: 0.3, dur: 1.4, gain: 0.035 }); softBell(88, { at: 0.3, gain: 0.05 }); },
            viral: () => [69, 72, 76, 79, 81, 84].forEach((n, i) => marimba(n, { at: i * S() / 2, gain: 0.055 }))
        }
    };
};
