// music/classic.js — the Classic track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/classic/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).classic = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { pump, note, perc, harmNote, MIXO, LYD, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;


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
        // Classic: dub techno at 124 BPM, straight. A kick with a little grit, a saw bass that holds its notes and
        // leaves room, off-beat hats and a clap, and the signature: chord stabs through a filter that snaps shut,
        // answered by a real delay line a dotted 8th later that keeps answering as it fades. A square lead with a
        // touch of vibrato on its long notes, a quiet pad breathing under it, a narrow-pulse arpeggio flying
        // left and right when the run does. Its room is small; its echoes are the space.
        // The parts arrive in this track's own order (`layers`): the stabs first, then the tune, then the hats.
        style: {
            bpm: 124,
            cutoff: k => 900 + 9000 * k * k, drive: 0, gain: 0.57,
            beat: 0.984, tones: 1.97,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 0.987, tones: 2.455 }, simpleVoice: 'triangle',   // the simple version (simpleStep)
            space: { delay: { steps: 3, feedback: 0.4, cutoff: 2200, level: 0.55, pan: 0.2 }, reverb: { seconds: 1.3, damp: 4200, level: 0.25 }, width: 0.8 },
            layers: { kick: -1, bass: -1, pad: 0.08, mel: 0.3, off: 0.34, clap: 0.5, sixteenth: 0.64, harm: 0.72, arp: 0.82 },
            fillAt: 0.3,
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song;
                // Drums. A sparse section is the kick alone; a section with none has none (hats included).
                // A song may bring its own drum patterns (`kit`), bass (`bassVoice`), chords (`compVoice`) and lead (`lead`).
                const K = c.kit;
                const kg = kickLevel(c, s, K ? K.kick : s % 4 === 0);
                if (kg) kick(t, 0.5 * kg, 150, 45, 0.28, { drive: 0.12 });
                if (c.drums && !c.sparse && K) {
                    if (K.hat === 2 && L.off > 0.02) hat(t, (0.055 + 0.04 * k) * L.off, 0.2, { pan: 0.25, rev: 0.15 });
                    else if (K.hat === 1 && L.off > 0.02) hat(t, (0.07 + 0.05 * k) * L.off, 0.06, { pan: 0.25, rev: 0.12 });
                    else if (K.hat && L.sixteenth > 0.02) hat(t, 0.045 * L.sixteenth, 0.025, { pan: -0.3 });
                    if (K.snare && L.clap > 0.02) clap(t, 0.15 * K.snare * L.clap, { rev: 0.3, pan: -0.05 });
                } else if (c.drums && !c.sparse) {
                    // A ghost kick into the next phrase, some of the times a phrase ends.
                    if (!song.kick && c.last && s === c.steps - 2 && c.pick(3, 1) === 0) kick(t, 0.22, 140, 50, 0.16);
                    if (L.off > 0.02 && s % 4 === 2) hat(t, (0.07 + 0.05 * k) * L.off * (s === 10 ? 1.15 : 1), 0.07, { pan: 0.25, rev: 0.12 });
                    if (L.clap > 0.02 && (s === 4 || s === 12)) clap(t, 0.15 * L.clap, { rev: 0.3, pan: -0.05 });
                    if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.05 * L.sixteenth * [0.6, 1, 0.75, 1][(s >> 1) % 4], 0.025, { pan: -0.3 });
                }
                // The bass: the song's line, leaning on the beats, each note held and let go.
                const b = c.bassOn && bassAt(song, s, ch);
                if (b && song.bassVoice === 'sub') {         // a sub that holds, with a soft octave over it
                    note(t, b, len * 3.6, 0.13 * L.bass, { type: 'sine', attack: 0.012, sus: 0.8, dec: 0.12, rel: 0.12 });
                    note(t, b + 12, len * 2.4, 0.03 * L.bass, { type: 'triangle', cutoff: 500 + 600 * k, sus: 0.5, dec: 0.1, rel: 0.08 });
                } else if (b && song.bassVoice === 'pluck') note(t, b, len * 0.9, 0.2 * L.bass, { type: 'square', cutoff: 260 + 1700 * k, q: 6, env: 2.4, envTime: 0.06 });
                else if (b) note(t, b, len * 1.9, (s % 4 === 0 ? 0.2 : 0.155) * L.bass, { type: 'sawtooth', cutoff: 200 + 1500 * k, q: 4, env: 1.2, envTime: 0.09, sus: 0.55, dec: 0.07, rel: 0.04 });
                // Dub chords: detuned saws through a filter that snaps shut, spread a little, into the delay.
                if (L.pad > 0.02 && c.comp.includes(s) && song.compVoice === 'pad') ch.v.forEach((n, i) => note(t, n, len * (c.steps - s) * 0.96, 0.008 * L.pad,
                    { type: 'sawtooth', detune: i % 2 ? 6 : -6, cutoff: 520 + 900 * k, q: 0.8, attack: 0.3, sus: 0.85, dec: 0.3, rel: 0.5, rev: 0.45, pan: (i - 1.5) * 0.25 }));
                else if (L.pad > 0.02 && c.comp.includes(s)) ch.v.forEach((n, i) => note(t, n, len * 1.5, 0.021 * L.pad,
                    { type: 'sawtooth', detune: i % 2 ? 7 : -7, cutoff: 650 + 1500 * k, q: 2.5, env: 1.6, envTime: 0.12, dly: 0.6, rev: 0.25, pan: (i - 1.5) * 0.18 }));
                // A pad breathing under it: the chord's outer notes every other bar, slow in, far back.
                if (L.pad > 0.3 && s === 0 && c.barIn % 2 === 0 && !song.kick) pad(t, [ch.v[0], ch.v[ch.v.length - 1]], len * 30, 0.008 * L.pad, 'triangle', 900 + 600 * k, { rev: 0.5, pan: -0.2 });
                // The arpeggio starts a step later each bar, so the figure turns over a four-bar phrase.
                if (L.arp > 0.02) note(t, ch.v[(s + 2 * (c.bar % 4)) % ch.v.length] + 12, len * 0.9, 0.035 * L.arp,
                    { wave: 'pulse25', cutoff: 1200 + 2000 * L.arp, q: 2, pan: s % 2 ? 0.45 : -0.45, dly: 0.25, low: true });
                if (c.mel && song.lead === 'glass') {         // a glass bell that rings on into the delay
                    const d = Math.max(0.5, len * c.mel.len);
                    note(c.mel.t, c.mel.n, d, 0.055 * c.melGain, { type: 'sine', fm: { ratio: 3.5, index: 1.3, decay: 0.3, sus: 0.05 }, attack: 0.004, sus: 0.3, dec: 0.5, rel: 0.6, dly: 0.6, rev: 0.4, pan: -0.1 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.026 * c.harmGain * c.melGain, { type: 'sine', sus: 0.3, dec: 0.5, rel: 0.6, rev: 0.4, pan: 0.3, low: true });
                } else if (c.mel && song.lead === 'pluck') {  // a muted saw pluck, each note shut by its filter
                    const d = Math.min(len * c.mel.len * 0.92, len * 1.8);
                    note(c.mel.t, c.mel.n, d, 0.065 * c.melGain, { type: 'sawtooth', cutoff: 800 + 1900 * k, q: 6, env: 3, envTime: 0.07, dly: 0.35, rev: 0.1, pan: s % 4 >= 2 ? 0.2 : -0.2 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.03 * c.harmGain * c.melGain, { type: 'sawtooth', cutoff: 1200, q: 4, env: 2, envTime: 0.07, pan: 0.35, low: true });
                } else if (c.mel && song.lead === 'pad') {    // two soft triangles swelling in
                    const d = len * c.mel.len * 1.05;
                    for (const dt of [-9, 9]) note(c.mel.t, c.mel.n, d, 0.034 * c.melGain, { type: 'triangle', detune: dt, cutoff: 1900, attack: Math.min(0.12, d * 0.3), sus: 0.8, dec: 0.2, rel: 0.35, rev: 0.45, dly: 0.25, pan: dt > 0 ? 0.2 : -0.2,
                        vib: c.mel.len >= 4 ? { rate: 4.6, depth: 8, delay: 0.25 } : null });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.022 * c.harmGain * c.melGain, { type: 'triangle', cutoff: 1400, attack: 0.1, sus: 0.8, dec: 0.2, rel: 0.35, rev: 0.4, pan: 0.35, low: true });
                } else if (c.mel) {
                    const d = len * c.mel.len * 0.92, long = c.mel.len >= 4;
                    note(c.mel.t, c.mel.n, d, 0.05 * c.melGain, { type: 'square', cutoff: 1700 + 1500 * k, q: 2, sus: 0.6, dec: 0.1, rel: 0.06, dly: 0.45, rev: 0.15,
                        vib: long ? { rate: 5.2, depth: 9, delay: 0.18 } : null });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.024 * c.harmGain * c.melGain, { type: 'triangle', cutoff: 1500, sus: 0.6, dec: 0.1, rel: 0.06, pan: 0.3, rev: 0.2, low: true });
                }
            },
            // The end of a section: one of three ways in (the same one each time that bar comes round): a clap roll,
            // hats rushing across with a clap, or kicks; then a note thrown into the delay.
            fill(t, s, k, len, L, c) {
                const kind = c.pick(3, 9);
                if (kind === 0) clap(t, 0.08 + 0.03 * (s - 12), { rev: 0.3 });
                else if (kind === 1) { hat(t, 0.05 + 0.015 * (s - 12), 0.03, { pan: (s - 13.5) * 0.3 }); if (s === 14) clap(t, 0.12, { rev: 0.35 }); }
                else if (s % 2 === 0) kick(t, 0.24 + 0.05 * (s - 12), 120, 45, 0.18);
                if (s === 15) note(t, c.next.root + 24, len, 0.05, { type: 'square', cutoff: 2400, dly: 0.5 });
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        // Each has its own form. Lab songs are steadier and more melodic; server-room songs drive harder; Packet
        // Snare's are the track gone stealthy until you're spotted. `lvl` trims a song's pitched voices so every
        // song measures the same; a stealth song's `rest` lifts its tones while its drums are hushed.
        songs: {
            lab: [
                {   // Night Survey: slow dub in D Dorian at 98, half-time: a sub, held chords, a glass bell with long echoes.
                    // Phrases of six bars and five; it takes its time (two and a half minutes) and never lands.
                    name: 'Night Survey', lvl: 0.99, bpm: 98, scale: DOR, tonic: 5, oct: -1, lead: 'glass', bassVoice: 'sub', compVoice: 'pad',
                    kit: { kick: 'x.......o.x.....', snare: '........x.......', hat: '..x...x...x...xo' },
                    chords: { A: ['Dm9', 'Dm9', 'Am7', 'Am7', 'Fmaj7', 'G6'], B: ['Fmaj7', 'Em7', 'Dm9', 'Cmaj7', 'G6'] },
                    bass: { A: 'r.........r...f.', B: 'r.....r.....f...' }, comp: { A: [0], B: [0, 10] },
                    mel: {
                        A: "5 - - - 7 - 1' - | 2' - - - - - 1' 7 | 5 - - - - - 4 5 | 2 - - - - - . . | 3 - - - 5 - 7 - | 6 - - - 4 - - .",
                        B: "1' - - 7 5 - 3 - | 2 - - - 4 - 6 - | 5 - - - 3 - 1 - | 2 - 4 - 7, - - - | 6, - - - 2 - - ."
                    },
                    form: [['intro', 6, { mel: null, drums: 'none' }], ['A', 6, { drums: 'sparse' }], ['A', 6], ['B', 5, { chords: 'B' }], ['A', 6, { harm: true }],
                        ['drift', 5, { mel: null, chords: 'B', drums: 'none', bassOn: false, lift: -0.15, fill: false }], ['B', 5, { chords: 'B' }], ['A', 6], ['B', 5, { chords: 'B', harm: true }],
                        ['A', 6], ['A', 6, { melGain: 0.7, drums: 'sparse', fill: false }], ['out', 3, { mel: null, drums: 'none', fill: false }]]
                },
                {   // Uptime: i – VI – III – VII, wide and hopeful, chords late in the bar. A turns back through G; only B
                    // takes the E7 home, so the dominant is an event.
                    name: 'Uptime', lvl: 1.01, scale: AEOL,
                    chords: { A: ['Am7', 'Fmaj9', 'C6', 'Gsus2', 'Am7', 'Fmaj9', 'Dm7', 'G6'], B: ['Am7', 'Fmaj9', 'C6', 'Gsus2', 'Am7', 'Fmaj9', 'Dm7', 'E7'] },
                    bass: 'r...r.f.r...o...', comp: [6, 14],
                    mel: {
                        A: "3' - 2' - 1' - 5 - | 6 - 1' - 5 - 3 - | 5 - 3 - 1' - 3' - | 2' - - - 5 - - .",
                        B: "1 - 3 - 5 - 1' - | 7 - 6 - 5 - - . | 5 - 3 - 5 - 1' - | 2' - 1' - 2' - - . | 3' - 2' - 1' - 5 - | 6 - - 5 6 - 3' - | 2' - 1' - 6 - 4 - | #7, - - - 2 - - ."
                    },
                    form: [['intro', 2, { mel: null, drums: 'sparse' }], ['A', 8], ['A', 8, { harm: true }], ['B', 8, { chords: 'B' }],
                        ['break', 4, { mel: 'A', melGain: 0.6, drums: 'none', bassOn: false, fill: false }], ['A', 8], ['B', 8, { chords: 'B' }], ['out', 4, { mel: null }]]
                }
            ],
            server: [
                {   // Overclock: a rolling bass and a riff with its answer; B lifts to F and G before the turn through E7.
                    name: 'Overclock', lvl: 0.91, scale: AEOL,
                    chords: { A: ['Am7', 'Am7', 'Dm7', 'Dm7', 'Fmaj7', 'G', 'Esus4', 'E7'], B: ['Fmaj7', 'Fmaj7', 'G', 'G', 'Am7', 'Am7', 'Esus4', 'E7'] },
                    bass: { A: 'r.rr.or.r.rr.o.f', B: 'r.r..or.r..r.of.' }, comp: { A: [3, 6, 14], B: [3, 10, 14] },
                    mel: {
                        A: "1' . 1' 7 . 5 . 3 | 4 3 . 1 . . 5,+7, 1+2 | 4 . 4 3 . 1 . 6, | 2 - - - 7, - - .",
                        B: "6 . 6 . 1' 6 5 3 | 5 . 3 . 5 - - 6+7 | 7 . 7 . 2' 7 4 2 | 4 . 2 . 4 - - 5+7 | 1' . 1' . 3' 1' 7 5 | 7 - 5 - 3 - 1 - | 2 - 1 - 2 - 5 - | #7, - - - 2 - 4 -"
                    },
                    form: [['intro', 4, { mel: null }], ['A', 8], ['B', 8, { chords: 'B' }], ['A', 8, { harm: true }],
                        ['break', 4, { mel: 'A', melGain: 0.6, drums: 'none', bassOn: false, fill: false }], ['build', 4, { mel: null, drums: 'sparse', from: 4, entry: false }],
                        ['B', 8, { chords: 'B', lift: 0.1 }], ['A', 8], ['out', 2, { mel: null, fill: false }]]
                },
                {   // Packet Storm: electro at 136 in E Phrygian: a broken kick, a plucked riff in 16ths over a four-bar loop;
                    // B opens into six bars of long notes. Short and hard: it starts on the riff and is over in 70 seconds.
                    name: 'Packet Storm', lvl: 1.78, bpm: 136, scale: PHRY, tonic: 7, oct: -1, lead: 'pluck', bassVoice: 'pluck',
                    kit: { kick: 'x.....x...x.....', snare: '....x.......x..o', hat: 'x.x.x.xOx.x.x.xO' },
                    chords: { A: ['Em', 'Em', 'F', 'Dm'], B: ['Am', 'G', 'F', 'Em', 'Dm', 'F'] },
                    bass: { A: 'r.rr.rr.r.rr.ro.', B: 'r..r..r.r..r..f.' }, comp: { A: [3, 11], B: [3, 10] },
                    mel: {
                        A: "1'+1' 7+1' . 5 1'+1' 7+1' . 3 | 1'+1' 7+1' . 5 7 - 5 - | 2'+2' 1'+2' . 6 2'+2' 1'+2' . 4 | 7+7 6+7 . 4 6 - 4 -",
                        B: "4 - - - 6 - 1' - | 7 - - - 5 - 3 - | 2 - - - 4 - 6 - | 5 - - - 3 - 1 - | 7, - - 2 4 - 2 - | 2 - 4 - 6 - 2' -"
                    },
                    form: [['A', 4], ['A', 4], ['B', 6, { chords: 'B' }], ['A', 4, { harm: true, lift: 0.08 }], ['A', 4],
                        ['break', 3, { mel: null, drums: 'none', bassOn: false, fill: false }], ['B', 6, { chords: 'B', lift: 0.1 }], ['A', 4], ['A', 4, { harm: true }], ['out', 2, { mel: null, fill: false }]]
                }
            ],
            snare: [
                {   // Packet Sniffer: 6/8 at 75 to the dotted quarter: a rocking pulse, muted plucks in six-bar phrases over
                    // Am9 and an Esus4 that never resolves. Under a minute.
                    name: 'Packet Sniffer', lvl: 1.87, rest: 1.40, slvl: 0.82, srest: 1.34, bpm: 112, steps: 12, pulse: 6, scale: AEOL, lead: 'pluck',
                    chords: ['Am9', 'Fmaj7', 'Dm9', 'Am9', 'Fmaj7', 'Esus4'],
                    bass: 'r.....f.....', comp: [6], kick: 'x.....o.....', hush: 0.45, tick: '..o..x..o..x', cut: 0.75,
                    kit: { kick: 'x.........o.', snare: '......x.....', hat: 'x.ox.ox.ox.o' },
                    mel: {
                        A: "5, . 1 . 3 . | 1 - - - . . | 4 . 3 . 6, . | 5, - - - . . | 1 . 3 . 5 . | 4 - - - 2 .",
                        B: "1 . 3 5 . 7 | 6 - - 5 3 . | 4 . 6 1' . 6 | 5 - - 3 1 . | 6 . 5 3 . 1 | 2 - - - 5, -"
                    },
                    form: [['in', 2, { mel: null }], ['A', 6], ['B', 6], ['A', 6], ['wait', 3, { mel: null, bassOn: false, fill: false }], ['B', 6], ['A', 6, { harm: true }]]
                },
                {   // Dead Drop: 7/8 (2 + 2 + 3), a limp in the step: a soft lead over i – v – VI – VII, a chord a bar,
                    // the bass stepping and stopping.
                    name: 'Dead Drop', lvl: 0.92, rest: 1.36, slvl: 0.85, srest: 1.30, steps: 14, scale: AEOL, lead: 'pad', bassVoice: 'sub',
                    chords: ['Am7', 'Em7', 'Fmaj7', 'Gsus4'],
                    bass: 'r.......r...f.', comp: [8], kick: 'x.......o.....', hush: 0.45, tick: '..x...x....x..', cut: 0.75,
                    kit: { kick: 'x.......x.....', snare: '....x.....x...', hat: '..x...x...x.x.' },
                    mel: {
                        A: "3 - - . 1 - . | 5, - - - - . . | 3 - - . 5 - . | 4 - - - - . .",
                        B: "1 . 3 . 5 - - | 7 . 5 . 2 - - | 6 . 1' . 3' - - | 4' - - - 4 - . | 5 . 3 . 1 - - | 2 . 5 . 7 - - | 1' . 6 . 4 - - | 4 - - - - . ."
                    },
                    form: [['A', 4], ['A', 4], ['B', 8], ['wait', 2, { mel: null, bassOn: false, fill: false }], ['A', 4], ['B', 8], ['A', 4, { harm: true }], ['A', 4]]
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
