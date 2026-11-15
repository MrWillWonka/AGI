// music/retro.js — the Retro track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/retro/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).retro = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { pump, note, perc, harmNote, MIXO, LYD, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Retro: an 8-bit console: square pulses, a triangle bass, noise drums, stepped slides (C major pentatonic).
    const sq = (n, o = {}) => T(n, { type: 'square', dur: 0.07, gain: 0.03, ...o });
    const tri = (n, o = {}) => T(n, { type: 'triangle', dur: 0.12, gain: 0.08, ...o });
    const chipNoise = (dur, gain, at = 0) => noise({ dur, gain, f0: 6000, type: 'highpass', at });
    // A `tinker` song's figures on the chord, an 8th a slot: which chord tone (past the top: the bottom ones an octave up), -1 a gap.
    const TINKER = [[0, 2, 1, -1, 2, -1], [0, -1, 1, 2, -1, 1], [-1, 0, 2, -1, 1, 3], [0, 1, 2, 3, -1, -1], [2, -1, 0, -1, 1, -1]];

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
            fx: {smash: 0.86, windup: 0.78, crunch: 0.57, flow: 1.14, freeze: 1.77, release: 0.94, viral: 1.04},      // single effects against Classic's (tools/audio/fx-levels.js)
            charge: [8.92, 8.07, 11.04, 5.43, 6.08], chargeSimple: [1.11, 0.47, 0.63, 3.89, 3.98],
            snare: { snareCatch: 0.71, snareSpoil: 0.91, snareSnap: 0.7, snareLaser: 1.48, snareChain: 1.31, snareSweep: 2.33, snareCharge: 1.37, snareBoss: 0.99, snareHit: 0.82, 'snarePlace:wall': 0.55, 'snarePlace:decoy': 2.77, 'snarePlace:turret': 2.03, 'snarePlace:tower': 0.49, snareRemove: 1.73, 'snarePower:freeze': 0.46, 'snarePower:purge': 0.91, snareZap: 1.3, snareDecoy: 1.01, snareQuarantine: 0.63, snareStun: 0.76, snareCore: 0.53, snareBossDown: 0.44, snareParry: 1.66, snareSlash: 0.92, snareSpoof: 1.93, snareGarbage: 0.54, snareRace: 3.43, snareHijack: 1.04, snareTaken: 3.23, snareFlag: 2.19, snareIds: 0.68, snareRebuild: 0.85, snareHerdStun: 1.53 },
            snareSimple: { snareCatch: 1.06, snareSpoil: 1.05, snareSnap: 1.5, snareLaser: 2.02, snareChain: 1.68, snareSweep: 2.71, snareCharge: 1.43, snareBoss: 1.21, snareHit: 1.06, 'snarePlace:wall': 1.37, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.38, 'snarePlace:tower': 1.35, snareRemove: 1.25, 'snarePower:freeze': 0.95, 'snarePower:purge': 1.28, snareZap: 1.65, snareDecoy: 1.53, snareQuarantine: 1.22, snareStun: 1.18, snareCore: 0.73, snareBossDown: 0.62, snareParry: 2.43, snareSlash: 1.78, snareSpoof: 2.11, snareGarbage: 1.34, snareRace: 2.58, snareHijack: 2.17, snareTaken: 4.03, snareFlag: 1.76, snareIds: 1.97, snareRebuild: 1.57, snareHerdStun: 1.43 }
        },

        // The sprint meter's parts (one is picked per charge; each plays the chord the music is on, on the grid): a
        // fast square arpeggio, octave hops, a trill between two chord tones, a triangle on the root and fifth.
        meter: [
            { raw: true, type: 'square', gain: 0.016, dur: 0.06, q: 1, cutoff: () => 9000, every: 1, notes: (l, n, ch) => [ch.v[n % ch.v.length] + 24] },
            { raw: true, type: 'square', gain: 0.018, dur: 0.08, q: 1, cutoff: () => 9000, notes: (l, n, ch) => [ch.root + 36 + (n % 2 ? 12 : 0)] },
            { raw: true, type: 'square', gain: 0.016, dur: 0.05, q: 1, cutoff: () => 9000, every: 1, notes: (l, n, ch) => [ch.v[0] + 24 + (n % 2 ? ch.v[1] - ch.v[0] : 0)] },
            { raw: true, type: 'triangle', gain: 0.05, dur: 0.1, q: 1, cutoff: () => 9000, notes: (l, n, ch) => [ch.root + 24 + (n % 4 === 2 ? 7 : 0)] }
        ],

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Retro: chiptune at 144 BPM, dry. A console's voices, held to on purpose: a lead on a quarter-width pulse
        // (it wobbles a little on its long notes), an echo channel on a
        // thinner pulse that the fast arpeggio steals when it comes in, the chord as an arpeggio on that thin pulse,
        // a triangle bass that walks a line of its own, and noise for drums: a short kick, a snare, hats that
        // gallop (an 8th and two 16ths). The server-room songs play a breakbeat (kick on 1, the "and" of 2 and
        // the "and" of 3). Nothing is punchy (the owner's call): every note eases in over 25 ms or more and lets go over about a tenth of a second, the pulses are dark, the drums sit far back, and high notes sit further off. The tune is there from the first bar.
        // Its click figure plays the track's 8ths: nearly five notes a second while a job is held.
        style: {
            bpm: 144,
            cutoff: k => 2600 + 3400 * k, drive: 0, gain: 0.69,
            beat: 2, tones: 1.829,   // drums about 6 dB under the tones by loudness: its kick is so short that matching the others' 2 dB made it spike 9 dB over them
            simpleMix: { gain: 1, beat: 1.013, tones: 1.855 }, simpleVoice: 'square',   // the simple version (simpleStep)
            space: { width: 0.6 },      // no room and no delay line: its echo is a voice
            layers: { mel: -1, bass: -1, kick: -1, pad: 0.18, off: 0.3, clap: 0.42, harm: 0.54, sixteenth: 0.62, arp: 0.8 },
            fillAt: 0.3,
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song;
                // A song may bring its own drum patterns (`kit`) and lead (`lead`).
                // `mellow`: the same console with the top taken off: pulses through a filter, softer drums and arpeggio, no echo voice.
                // Understated throughout: every pulse is filtered a little, notes speak a touch slower, the drums sit well back.
                const K = c.kit, M = song.mellow ? 0.3 : 0.4, soft = { cutoff: song.mellow ? 1500 : 2100, q: 0.5, attack: 0.03 };
                // High notes sit further off: from the C above middle C upward a note is quieter, down to half an octave up.
                const far = n => 1 - 0.5 * Math.max(0, Math.min(1, (n - 72) / 12));
                const kg = kickLevel(c, s, K ? K.kick : song.breakbeat ? s === 0 || s === 6 || s === 10 : s % 4 === 0);
                if (kg) kick(t, 0.15 * kg, 90, 48, 0.13);
                if (c.drums && !c.sparse && K) {
                    if (K.snare && L.clap > 0.02) { perc(t, 0.12 * M * K.snare * L.clap, { f: 1800, q: 0.8, len: 0.1 }); perc(t, 0.05 * M * M * K.snare * L.clap, { type: 'highpass', f: 5000, len: 0.07 }); }
                    if (K.hat >= 1 && L.off > 0.02) hat(t, 0.05 * M * L.off, K.hat === 2 ? 0.06 : 0.018, { pan: 0.2 });
                    else if (K.hat && L.sixteenth > 0.02) hat(t, 0.028 * M * L.sixteenth, 0.012, { pan: 0.2 });
                } else if (c.drums && !c.sparse) {
                    if (L.clap > 0.02 && (s === 4 || s === 12)) { perc(t, 0.12 * M * L.clap, { f: 1800, q: 0.8, len: 0.1 }); perc(t, 0.05 * M * M * L.clap, { type: 'highpass', f: 5000, len: 0.07 }); }
                    if (song.breakbeat && L.clap > 0.4 && s === 15 && c.pick(2, 6)) perc(t, 0.05 * M * L.clap, { f: 1800, q: 0.8, len: 0.05 });
                    if (L.sixteenth > 0.02) { if (s % 4 !== 1) hat(t, (s % 4 === 0 ? 0.04 : 0.028) * M * M * L.sixteenth, 0.012, { pan: 0.2 }); }
                    else if (L.off > 0.02 && s % 4 === 2) hat(t, 0.06 * M * L.off, 0.02, { pan: 0.2 });
                }
                // The triangle bass walks the song's line, staccato.
                const b = c.bassOn && bassAt(song, s, ch);
                if (b) note(t, b + 12, len * (song.walk ? 0.9 : 1.5), 0.13 * L.bass, { type: 'triangle', attack: 0.025, sus: 0.9, dec: 0.04, rel: 0.09 });
                // The chord as an arpeggio in 8ths: up on even bars, down on odd ones.
                const every = 2;
                if (song.tinker) {
                    // `tinker`: in place of the steady arpeggio, the thin pulse tries a different little figure on the
                    // chord each bar (the same one whenever that bar comes round), with gaps in it.
                    const f = TINKER[Math.abs(c.pick(TINKER.length, 3)) % TINKER.length], i = s % 2 ? -1 : f[(s / 2) % f.length], v = ch.v;
                    if (L.pad > 0.02 && i >= 0) note(t, i < v.length ? v[i] : v[i - v.length] + 12, len * 1.1, (0.016 + 0.014 * Math.max(L.clap, L.arp)) * M * L.pad,
                        { wave: 'pulse25', cutoff: 1200, q: 0.5, attack: 0.03, sus: 0.8, dec: 0.04, rel: 0.09, pan: -0.5, low: true });
                } else if (L.pad > 0.02 && s % every === 0) {
                    const v = ch.v, i = (s / every) % v.length, idx = c.bar % 2 ? v.length - 1 - i : i;
                    note(t, v[idx], len * 0.8, (0.016 + 0.014 * Math.max(L.clap, L.arp)) * M * L.pad, { wave: 'pulse25', cutoff: song.mellow ? 1200 : 1500, q: 0.5, attack: 0.025, sus: 0.8, dec: 0.04, rel: 0.08, pan: -0.5, low: true });
                }
                if (c.mel && song.answer && c.sec === song.answer.sec && c.barIn % song.answer.every >= song.answer.from) {
                    // `answer`: in that section the last bars of each phrase are answered by the other channel, a dull square, quieter.
                    note(c.mel.t, c.mel.n, len * c.mel.len * 0.9, 0.026 * c.melGain, { type: 'square', cutoff: 1200, q: 0.7, attack: 0.03, sus: 0.85, dec: 0.04, rel: 0.06, pan: -0.3 });
                } else if (c.mel && song.lead === 'tri') {    // the triangle takes the tune, in the middle of the keyboard, easing in
                    const d = len * c.mel.len * 0.95, env = { attack: 0.05, sus: 0.9, dec: 0.04, rel: 0.14 };
                    note(c.mel.t, c.mel.n, d, 0.1 * c.melGain * far(c.mel.n), { type: 'triangle', ...env, vib: c.mel.len >= 3 ? { rate: 4.5, depth: 5, delay: 0.3 } : null, pan: 0.1 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.035 * c.harmGain * c.melGain, { type: 'triangle', ...env, pan: -0.3 });
                } else if (c.mel && song.lead === 'soft') {   // a square with the edge filtered off, a little slower to speak
                    const d = len * c.mel.len * 0.9, env = { attack: 0.035, sus: 0.85, dec: 0.05, rel: 0.12 };
                    note(c.mel.t, c.mel.n, d, 0.034 * c.melGain * far(c.mel.n), { type: 'square', cutoff: 1250, q: 0.5, ...env, vib: c.mel.len >= 4 ? { rate: 5.5, depth: 10, delay: 0.18 } : null, pan: 0.15 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.016 * c.harmGain * c.melGain, { type: 'square', cutoff: 1200, q: 0.7, ...env, pan: -0.3 });
                } else if (c.mel) {
                    const d = len * c.mel.len * 0.85, env = { sus: 0.85, dec: 0.05, rel: 0.1 };      // no blip up into the bar's first note any more: it was a click
                    note(c.mel.t, c.mel.n, d, 0.03 * c.melGain * far(c.mel.n), { wave: 'pulse25', ...env, ...soft,
                        vib: c.mel.len >= 4 ? { rate: 5.5, depth: 8, delay: 0.2 } : null, pan: 0.15 });
                    if (L.arp <= 0.5 && !song.mellow) note(c.mel.t + 3 * len, c.mel.n, d, 0.006 * c.melGain, { wave: 'pulse25', ...env, ...soft, pan: 0.6, low: true });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.014 * c.harmGain * c.melGain, { wave: 'pulse25', ...env, ...soft, pan: -0.3 });
                }
            },
            // The end of a section: a snare roll with a run up the next chord, or four toms falling.
            fill(t, s, k, len, L, c) {
                if (c.pick(2, 8)) {
                    perc(t, 0.02 + 0.005 * (s - 12), { f: 1500, q: 0.8, len: 0.07 });
                    note(t, c.next.v[(s - 12) % c.next.v.length] + 12, len * 0.8, 0.02, { wave: 'pulse25', cutoff: 1600, q: 0.5, attack: 0.025, sus: 0.85, dec: 0.04, rel: 0.08 });
                } else note(t, 57 - 3 * (s - 12), len * 0.9, 0.06, { type: 'triangle', glide: 62 - 3 * (s - 12), glideTime: 0.06, part: 'beat', raw: true });
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        // Game loops: a short way in, the tune, a second tune, and a last chorus a tone higher (`up`) before it
        // comes round again. `breakbeat` gives a song the breakbeat kick. `lvl` trims a song's pitched voices so
        // every song measures the same; a stealth song's `rest` lifts its tones while its drums are hushed.
        songs: {
            lab: [
                {   // Pixel Desk: I – V – vi – IV, and a last chorus up a tone.
                    name: 'Pixel Desk', lvl: 1.14, scale: ION, tonic: 3, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'], bass: 'r...o...f...o...',
                    mel: {
                        A: "1 - 3 - 5 - 3 - | 2 - 5, - 7, - 2 - | 3 - 1 - 6, - 1 - | 4 - 3 - 2 - - .",
                        B: "5 - 5 - 6 - 5 - | 4 - 2 - 7, - 5, - | 1 - 3 - 6 - 5 - | 4 - 6 - 1' - - - | 1' - 7 - 5 - 3 - | 2 - 4 - 7 - 5 - | 6 - 4 - 1 - 4 - | 5 - - - 7, - 2 -"
                    },
                    form: [['intro', 4, { mel: null }], ['A', 8], ['A', 8, { harm: true }], ['B', 8], ['A', 8], ['B', 8], ['A', 8, { up: 2, harm: true, lift: 0.06 }], ['turn', 2, { mel: null }]]
                },
                {   // Save Point: curious, poking at things. F Lydian in three at 100, no kick. Five-bar phrases: the
                    // triangle (middle of the keyboard, easing in) asks for three bars, starting off the beat, climbing and
                    // hanging on the raised fourth; a dull square on the other channel answers for two. Under it the thin
                    // pulse tinkers, a different figure each bar. The middle six bars try 8ths, take a wrong turn through
                    // B flat and find the raised fourth again. Under a minute.
                    name: 'Save Point', lvl: 1.006, slvl: 0.855, bpm: 100, steps: 12, scale: LYD, tonic: 8, oct: -2, lead: 'tri', mellow: true, tinker: true, answer: { sec: 'A', every: 5, from: 3 },
                    kit: { kick: '............', snare: '............', hat: '....o...o...' },
                    chords: { A: ['Fmaj7', 'G/F', 'Fmaj7', 'Em7', 'Am7', 'Fmaj7', 'G/F', 'Dm7', 'Cmaj7', 'G/F'], B: ['Dm7', 'Em7', 'Fmaj7', 'Bbmaj7', 'G/F', 'Cmaj7'] }, bass: 'r.......o...',
                    mel: {
                        A: ". 5 6 1' - - | . 6 2' 4' - - | 3' - - 1' - 7 | 7 - 2' - 4' - | 3' - - - - . | . 6 1' 3' - - | . 7 2' 4' - - | 3' - - 1' - 6 | 2' - 7 - 5 - | 4' - - - - .",
                        B: "6 1' 3' 1' 6 1' | 7 2' 4' 2' 7 2' | 1' 3' 5' 3' 1' - | b4' - - 3' - 1' | 2' - 4' - - - | 7 - 5 - - ."
                    },
                    form: [['A', 10, { fill: false }], ['B', 6, { chords: 'B', fill: false }], ['A', 10, { harm: true, fill: false }], ['turn', 2, { mel: null, fill: false }]]
                }
            ],
            server: [
                {   // Boss Rush: the road between the bosses. An overworld tune at 132 in C, straight: the bass drives in
                    // 8ths down a line that steps from C to D and turns round on a suspended G; a filtered square sings one
                    // long eight-bar arc over it, in the middle of the keyboard. A six-bar climb leads back in each time;
                    // a stretch of open road with only the kick and the bass; the last two choruses a tone up.
                    name: 'Boss Rush', lvl: 0.805, slvl: 0.941, bpm: 132, scale: ION, tonic: 3, oct: -1, lead: 'soft', mellow: true,
                    kit: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
                    chords: { A: ['C', 'G/B', 'Am', 'C/G', 'F', 'C/E', 'Dm7', 'Gsus4'], B: ['F', 'G', 'Em', 'Am', 'Dm7', 'G'] }, bass: 'r.r.o.r.r.r.o.r.',
                    mel: {
                        A: "5, - 1 - 3 - - - | 2 - - 5 - - 7, - | 1 - 3 - 6 - - 5 | 5 - - - 3 - - . | 6, - 1 - 4 - - - | 3 - - 5 - - 1' - | 2' - 1' - 6 - 4 - | 5 - - - 2 - - .",
                        B: "6 - - 1' - - 6 - | 7 - - 2' - - 7 - | 3' - - - 7 - 5 - | 1' - - - 6 - 3 - | 4 - 6 - 1' - 2' - | 2' - - - 5 - 7 -"
                    },
                    form: [['intro', 4, { mel: null }], ['A', 8], ['A', 8, { harm: true }], ['B', 6, { chords: 'B' }], ['A', 8, { lift: 0.06 }], ['road', 4, { mel: null, drums: 'sparse', fill: false, lift: -0.1 }],
                        ['B', 6, { chords: 'B', lift: 0.08 }], ['A', 8, { up: 2, harm: true, lift: 0.1 }], ['A', 8, { up: 2, lift: 0.12 }], ['out', 2, { mel: null, up: 2, fill: false }]]
                },
                {   // Turbo: cruising. An easy shuffle at 120 in G Mixolydian: a walking bass in 8ths, four on the floor,
                    // and a tune in long notes that arcs over eight bars (up to the octave and home). Six bars that climb
                    // to a suspended chord and wait there; three laps, the second fuller, the last a tone up.
                    name: 'Turbo', lvl: 0.81, slvl: 0.916, bpm: 120, swing: 0.3, scale: MIXO, tonic: 10, oct: -1, mellow: true,
                    chords: { A: ['G', 'G', 'F', 'C'], B: ['Em', 'F', 'C', 'G', 'Am', 'D7sus4'] }, bass: 'r.o.f.o.r.o.f.o.',
                    mel: {
                        A: "1 - - 3 5 - - - | 6 - 5 - 3 - 1 - | 7 - - 2 4 - - - | 6 - 4 - 5 - - . | 1 - - 3 5 - - 6 | 1' - - - 6 - 5 - | 4 - - 6 7 - 4 - | 5 - - - 1 - - .",
                        B: "6 - - - 3 - 5 - | 7 - - - 4 - 2 - | 1' - - - 6 - 5 - | 3 - - 5 - - 2 - | 1 - 2 - 4 - 6 - | 5 - - - - - . ."
                    },
                    form: [['intro', 2, { mel: null }], ['A', 8], ['B', 6, { chords: 'B' }], ['A', 8, { harm: true, lift: 0.05 }], ['B', 6, { chords: 'B', lift: 0.08 }],
                        ['A', 8, { up: 2, harm: true, lift: 0.1 }], ['out', 2, { mel: null, up: 2, fill: false }]]
                }
            ],
            snare: [
                {   // Sneaking Mission: five beats to the bar at 108 (3 + 3 + 2 + 2): a triangle bass on the long counts, a
                    // filtered square creeping up the A minor and ducking back, never high.
                    name: 'Sneaking Mission', lvl: 1.503, rest: 0.79, slvl: 0.91, srest: 0.78, bpm: 108, steps: 20, scale: AEOL, lead: 'soft', mellow: true,
                    chords: { A: ['Am', 'Am', 'F', 'G'], B: ['Dm', 'Am', 'F', 'Esus4'] },
                    bass: 'r.....r.....f...o...', walk: true, kick: 'x.....x.....o...o...', hush: 0.5, tick: '..x...x...x...x...x.', cut: 0.85,
                    kit: { kick: 'x.....x.............', snare: '............x...x...', hat: 'x...x...x...x...x...' },
                    mel: {
                        A: "1 . . 1 . . 3 . 5 . | 5, . . . . . . . . . | 6 . . 6 . . 1' . 6 . | 7 - - - . . 2' . 7 .",
                        B: "4 . 6 . 1' . 6 . 4 . | 5 . 3 . 1 . 3 . 5 . | 6 . 4 . 1 . 4 . 6 . | 2 - - - 5 - - - . ."
                    },
                    form: [['in', 2, { mel: null }], ['A', 4], ['B', 4, { chords: 'B' }], ['A', 4], ['wait', 2, { mel: null, fill: false }], ['B', 4, { chords: 'B' }], ['A', 4, { harm: true }], ['B', 4, { chords: 'B' }], ['A', 4]]
                },
                {   // Hide and Seek: A minor seen from C, sus chords that never land, a pulse peeking out and back.
                    name: 'Hide and Seek', lvl: 1.65, rest: 0.77, slvl: 0.85, srest: 0.66, scale: ION, tonic: 3, chords: ['Am', 'Am', 'Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gsus4', 'Gsus4'],
                    bass: 'r.....r...o.....', walk: true, kick: 'x.....x.........', hush: 0.5, tick: 'o...x...o...x.o.', cut: 0.85,
                    mel: {
                        A: "6, . . 1 . . . . | 2 - - - . . . . | 6, . . 1 . . . . | 2 - - - 5, . . .",
                        B: "3 . 1 . 6, . 1 . | 3 - - - 2 - - - | 1 . 3 . 5 . 3 . | 6, - - - . . . . | 4 . 6 . 1' . 6 . | 4 - - - 2 - - - | 1 . 2 . 5 . 2 . | 1 - - - 5, - - -"
                    },
                    form: [['A', 8], ['B', 8], ['wait', 4, { mel: null, fill: false }], ['A', 8], ['B', 8], ['A', 8, { harm: true }]]
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
            snareHerdStun: () => { T(72, { to: 48, type: 'square', dur: 0.25, gain: 0.02, steps: true }); chipNoise(0.02, 0.03); },
            // The power-up moments, on this track's pulses, triangle and noise.
            smash: () => { chipNoise(0.5, 0.16); tri(45, { to: 21, dur: 0.5, gain: 0.18, steps: true }); seq([57, 52, 45, 40], S() / 2, { type: 'square', dur: 0.08, gain: 0.03 }); },
            windup: () => seq([45, 48, 52, 57, 60, 64, 69], 0.08, { type: 'square', dur: 0.07, gain: 0.028 }),
            crunch: () => { chipNoise(0.2, 0.1); seq([45, 45, 52, 45], S() / 2, { type: 'square', dur: 0.06, gain: 0.035 }); },
            flow: () => seq([57, 64, 69, 72, 76, 72, 69, 64], S(), { type: 'triangle', dur: 0.2, gain: 0.07 }),
            freeze: () => { T(93, { to: 45, type: 'square', dur: 0.6, gain: 0.028, steps: true }); chipNoise(0.05, 0.05); },
            release: () => { chipNoise(0.35, 0.14); seq([45, 57, 69, 81], S() / 4, { type: 'square', dur: 0.05, gain: 0.03 }); tri(33, { dur: 0.4, gain: 0.16 }); },
            viral: () => seq([69, 72, 76, 79, 81, 84, 88, 91], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 })
        }
    };
};
