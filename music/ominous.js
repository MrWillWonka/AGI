// music/ominous.js — the Ominous track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/ominous/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).ominous = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { pump, note, perc, harmNote, MIXO, LYD, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Ominous: tolling bells with an inharmonic partial, knocks, reversed swells, drones (C, b2, tritone).
    const toll = (n, o = {}) => {
        T(n, { type: 'sine', dur: 1.6, gain: 0.06, ...o });
        tone({ f0: NOTE(mapNote(degShift(n, varDeg()))) * 2.76, dur: 0.6, type: 'sine', gain: (o.gain ?? 0.06) * 0.25, at: o.at, raw: true });
    };
    const knock = (n, o = {}) => { T(n, { type: 'triangle', dur: 0.09, gain: 0.07, cutoff: 900, ...o }); noise({ dur: 0.05, gain: 0.03, f0: 700, q: 3, at: o.at }); };
    const swellUp = (dur, gain) => noise({ dur, gain, f0: 300, f1: 2400, type: 'lowpass', attack: dur * 0.85 });

    // A harmonic minor's notes heard from other homes: from F (a major third, a raised second and fourth) and from D
    // (a minor third and a raised fourth: the travelling scale).
    const LYD2 = [0, 3, 4, 6, 7, 9, 11], UKR = [0, 2, 3, 6, 7, 9, 10];
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
            fx: {system: 1.22, smash: 0.82, windup: 1.03, crunch: 0.99, flow: 2.14, freeze: 1.55, release: 0.85, viral: 1.06},      // single effects against Classic's (tools/audio/fx-levels.js)
            charge: [1, 2.16, 2.01, 2.79, 1.34], chargeSimple: [0.22, 0.83, 2.38, 3.32, 2.11],
            snare: { snareCatch: 1.58, snareSpoil: 2.14, snareSnap: 1.86, snareLaser: 1.64, snareChain: 8.85, snareSweep: 1.39, snareCharge: 3.01, snareBoss: 0.88, snareHit: 1.27, 'snarePlace:wall': 0.96, 'snarePlace:decoy': 1.96, 'snarePlace:turret': 1.81, 'snarePlace:tower': 0.79, snareRemove: 1.54, 'snarePower:freeze': 0.86, 'snarePower:purge': 1.22, snareZap: 2.3, snareDecoy: 1.59, snareQuarantine: 1.14, snareStun: 1.32, snareCore: 0.9, snareBossDown: 0.59, snareParry: 1.87, snareSlash: 2.19, snareSpoof: 2.8, snareGarbage: 1.74, snareRace: 2.48, snareHijack: 2.64, snareTaken: 4.04, snareFlag: 2.27, snareIds: 0.93, snareRebuild: 1.79, snareHerdStun: 2.1 },
            snareSimple: { snareCatch: 0.9, snareSpoil: 1.06, snareSnap: 2.48, snareLaser: 2.17, snareChain: 1.8, snareSweep: 2.25, snareCharge: 1.23, snareBoss: 2.28, snareHit: 0.88, 'snarePlace:wall': 1.16, 'snarePlace:decoy': 1.24, 'snarePlace:turret': 1.14, 'snarePlace:tower': 1.18, snareRemove: 1.09, 'snarePower:freeze': 1.18, 'snarePower:purge': 1.4, snareZap: 1.68, snareDecoy: 1.49, snareQuarantine: 1.04, snareStun: 1.38, snareCore: 1.44, snareBossDown: 0.83, snareParry: 2.41, snareSlash: 1.53, snareSpoof: 1.71, snareGarbage: 2.25, snareRace: 2.47, snareHijack: 2.06, snareTaken: 3.91, snareFlag: 1.53, snareIds: 1.8, snareRebuild: 1.4, snareHerdStun: 1.27 }
        },

        // The sprint meter's parts (one is picked per charge; each plays the chord the music is on, on the grid): one
        // chord tone tolling, the root with a flicker of the flat second, a slow climb through the chord, a bare fifth.
        meter: [
            { raw: true, type: 'sine', gain: 0.05, dur: 0.45, q: 1, cutoff: () => 3000, notes: (l, n, ch) => [ch.bell + 12] },
            { raw: true, type: 'triangle', gain: 0.04, dur: 0.3, q: 1, cutoff: l => 700 + 1800 * l, notes: (l, n, ch) => [ch.root + 24 + (n % 4 === 3 ? 1 : 0)] },
            { raw: true, type: 'triangle', gain: 0.035, dur: 0.35, q: 1, cutoff: l => 600 + 1600 * l, notes: (l, n, ch) => [ch.v[(n >> 1) % ch.v.length] + 12] },
            { raw: true, type: 'sine', gain: 0.016, dur: 0.4, q: 1, cutoff: () => 2500, notes: (l, n, ch) => [ch.root + 24, ch.root + 31] }
        ],
        pitch: 'key',       // the flat second and the tritone are this track's sound: effects keep them against any chord

        // ---- Instruments: the drums and voices, and how they play a song step by step --------------------------
        // Ominous: 62 BPM in C harmonic minor, leaning on the flat second. Almost no drums: a drone on the chord's
        // root (two saws that drift apart as the run speeds up, a fifth joining at the peak), strings that take a
        // second to arrive, and a hall three seconds long behind them. In front of that, dry and close: a knock
        // that never lands in the same place twice, and a clock. A bell tolls a chord tone when it chooses to (some
        // bars not at all), more often as things build, on every beat at the peak. The tune comes early and alone:
        // a triangle a little flat, swelling in, with a faint bell an octave over it. The kick is saved for the
        // peak, and then the clock ticks in threes against it.
        // Its click figure plays the track's 16ths: four notes a second while a job is held, one a repeat.
        style: {
            bpm: 62, simpleKick: 4,
            cutoff: k => 600 + 4200 * k * k, drive: 0, gain: 0.66, shift: 3,    // C, with its flat second
            beat: 0.745, tones: 2.145,   // drums about 4 dB under the tones, measured: here they are kept back for the peaks
            simpleMix: { gain: 1, beat: 1.378, tones: 1.951 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            space: { reverb: { seconds: 3.2, damp: 2600, level: 0.5, pre: 0.03 }, delay: { steps: 6, feedback: 0.35, cutoff: 1200, level: 0.3, pan: 0.3 }, width: 1 },
            layers: { bass: -1, pad: -1, mel: 0.14, off: 0.3, knock: 0.34, harm: 0.5, kick: 0.6, clap: 0.7, sixteenth: 0.78, arp: 0.86 },
            fillAt: 0.5,
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song;
                // Drums are for the peak: a deep kick on 1 (and 3 once it is fully in), a far clap on 3. A stealth
                // song has its own heartbeat instead.
                // A song may bring its own drum patterns (`kit`: they come in with the clock, well before the track's
                // kick would), a string ostinato on its bass line (`march`) or the same line plucked (`roll`), footsteps
                // (`creep`), a rocking arpeggio (`rock`) and a lead (`lead`, or `leads` bar by bar).
                const K = c.kit, N = c.steps, Lk = Math.max(L.kick, L.off);
                if (song.kick) { const kg = kickLevel(c, s, K ? K.kick : s % 4 === 0); if (kg) kick(t, 0.55 * kg, 110, 32, 0.6); }
                else if (K) {
                    if (c.drums && K.kick && Lk > 0.02 && (s === 0 || !c.sparse)) kick(t, 0.5 * K.kick * Lk, 110, 36, 0.45);
                    if (c.drums && !c.sparse && K.snare && Lk > 0.02) clap(t, 0.07 * K.snare * Lk, { f: 1100, rev: 0.8 });
                    if (c.drums && !c.sparse && K.hat && L.off > 0.02) hat(t, (K.hat === 0.5 ? 0.016 : 0.028) * L.off, 0.02, { pan: 0.4 });
                }
                else if (c.drums && L.kick > 0.02 && (s === 0 || (!c.sparse && s === 8 && L.kick > 0.6))) kick(t, 0.55 * L.kick, 110, 32, 0.6);
                if (!K && c.drums && !c.sparse && L.clap > 0.02 && s === 8) clap(t, 0.07 * L.clap, { f: 1100, rev: 0.8 });
                // The drone: two saws on the root, drifting further apart with speed; a fifth above at the peak.
                if (c.bassOn && s === 0) {
                    const w = 4 + 10 * k;
                    for (const dt of [-w, w]) note(t, ch.root, len * N, 0.085, { type: 'sawtooth', cutoff: 150 + 280 * k, q: 1, detune: dt, attack: 0.5, sus: 0.9, dec: 0.4, rel: 0.7 });
                    if (L.arp > 0.02) note(t, ch.root + 7, len * N, 0.04 * L.arp, { type: 'sawtooth', cutoff: 220 + 300 * k, attack: 0.8, sus: 0.9, dec: 0.4, rel: 0.7, low: true });
                }
                // Strings: the chord an octave down in detuned saws, a slow filter, a second to arrive, far back.
                // Low strings marching on the song's bass line, short bows.
                const mb = song.march && c.bassOn && bassAt(song, s, ch);
                if (mb) note(t, mb + 12, len * 1.3, (s % 4 === 0 ? 0.06 : 0.045) * (0.5 + 0.5 * L.off), { type: 'sawtooth', cutoff: 420 + 800 * k, q: 1.5, env: 1.6, envTime: 0.07, attack: 0.012, rev: 0.4, pan: -0.25 });
                // Wheels (`roll`): the song's bass line plucked low and round, the first of each beat a little heavier.
                const rb = song.roll && c.bassOn && bassAt(song, s, ch);
                if (rb) note(t, rb + 12, len * 1.8, (s % (song.pulse || 4) === 0 ? 0.075 : 0.052) * (0.7 + 0.3 * L.off), { type: 'triangle', cutoff: 340 + 520 * k, q: 1, env: 1.2, envTime: 0.06, attack: 0.006, rev: 0.3, pan: -0.1 });
                // Footsteps (`creep`: a character a step, the semitones above the chord's root): short, low and damped.
                const cr = song.creep && c.bassOn ? song.creep[c.section.chords] || song.creep.A : null, cs = cr && cr[s];
                if (cs && cs !== '.') note(t, ch.root + 12 + parseInt(cs, 16), len * 2.2, 0.085, { type: 'triangle', cutoff: 280 + 320 * k, q: 1, attack: 0.008, rev: 0.2 });
                // A rocking figure up and down the chord on the 8ths, like water against a hull (in every section, or
                // in the ones a song lists).
                if ((song.rock === true || (Array.isArray(song.rock) && song.rock.includes(c.sec))) && c.bassOn && s % 2 === 0 && L.mel > 0.02) {
                    const v = ch.v, n = v[[0, 1, 2, 1, 2, 1][(s / 2) % 6] % v.length];
                    note(t, n, len * 2.4, 0.028 * L.mel, { type: 'triangle', cutoff: 800 + 500 * k, attack: 0.015, sus: 0.5, dec: 0.2, rel: 0.25, rev: 0.55, pan: 0.25 });
                }
                if (L.pad > 0.02 && s === 0) ch.v.forEach((n, i) => note(t, n - 12, len * N, 0.011 * L.pad,
                    { type: 'sawtooth', cutoff: 420 + 650 * k, q: 0.7, detune: i % 2 ? 8 : -8, attack: 1.2, sus: 0.85, dec: 0.5, rel: 1.2, pan: (i - 1) * 0.3, rev: 0.5 }));
                // The bell: a chord tone with a clang in it (an inharmonic partial), somewhere in the bar, or not this
                // bar; every bar as things build, every beat at the peak.
                const at = [0, 6, 10][c.pick(3, 11)];
                const tolls = L.sixteenth > 0.5 ? s % 4 === 0 : s === at && (L.off > 0.6 || c.pick(3, 12) !== 0);
                if (tolls && !song.kick && !K && song.lead !== 'bell') {
                    const g = (L.sixteenth > 0.5 ? 0.022 : 0.04) * (0.5 + 0.5 * L.pad);
                    note(t, ch.bell, 2.6, g, { type: 'sine', fm: { ratio: 2.76, index: 1.4, decay: 0.5, sus: 0.04 }, attack: 0.003, rev: 0.7, dly: 0.25, pan: 0.2 });
                    note(t, ch.bell + 19, 1, g * 0.2, { type: 'sine', rev: 0.7, pan: 0.2 });
                } else if (song.kick && L.pad > 0.02 && s === 0 && c.barIn % 2 === 0) note(t, ch.bell, 2.6, 0.03 * L.pad, { type: 'sine', fm: { ratio: 2.76, index: 1, decay: 0.5, sus: 0.04 }, rev: 0.8 });
                // In front, dry: a knock (never the same place twice running, some bars none), and the clock.
                if (L.knock > 0.02 && c.drums && s === [3, 7, 11, 14][c.pick(4, 13)] && c.pick(3, 14) !== 2) {
                    const pan = c.pick(2, 15) ? 0.35 : -0.35;
                    perc(t, 0.06 * L.knock, { type: 'lowpass', f: 700, q: 3, len: 0.05, pan });
                    note(t, 45, 0.07, 0.05 * L.knock, { type: 'triangle', cutoff: 900, part: 'beat', raw: true, pan });
                }
                if (c.drums && !c.sparse && !K) {
                    if (L.sixteenth > 0.5) { if (s % 4 === 0) for (let i = 0; i < 3; i++) hat(t + c.trip(i), (i ? 0.014 : 0.022) * L.sixteenth, 0.015, { pan: 0.4 }); }
                    else if (L.off > 0.02 && s % 4 === 2) hat(t, 0.03 * L.off, 0.02, { pan: 0.4 });
                }
                // The lead: the song's, or bar by bar where a song says who speaks (`leads`, by melody: a character a
                // bar: b the bell, c the choir, p the plucked string, t the triangle), so one voice can ask and another answer.
                const lm = song.leads && song.leads[c.section.mel];
                const lead = lm ? { b: 'bell', c: 'choir', p: 'pizz' }[lm[(c.barIn + c.section.from) % lm.length]] : song.lead;
                if (c.mel && lead === 'bell') {          // the tune tolled: each note a bell left to ring
                    const d = Math.max(2.6, len * c.mel.len);
                    note(c.mel.t, c.mel.n, d, 0.055 * c.melGain, { type: 'sine', fm: { ratio: 2.76, index: 1.5, decay: 0.55, sus: 0.04 }, attack: 0.003, rev: 0.7, dly: 0.3, pan: 0.15 });
                    note(c.mel.t, c.mel.n + 19, 1.1, 0.01 * c.melGain, { type: 'sine', rev: 0.7, pan: 0.15 });
                    note(c.mel.t, c.mel.n - 12, 1.6, 0.02 * c.melGain, { type: 'sine', attack: 0.004, rev: 0.6 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.022 * c.harmGain * c.melGain, { type: 'sine', fm: { ratio: 2.76, index: 1, decay: 0.5, sus: 0.04 }, rev: 0.7, pan: -0.3, low: true });
                } else if (c.mel && lead === 'choir') {  // voices: saws an octave apart behind a closed filter, slow to speak
                    const d = len * c.mel.len * 1.04;
                    for (const [dn, dt] of [[0, -11], [0, 11], [-12, 4]]) note(c.mel.t, c.mel.n + dn, d, 0.024 * c.melGain, { type: 'sawtooth', detune: dt, cutoff: 900 + 500 * k, q: 2.5, attack: Math.min(0.22, d * 0.35), sus: 0.85, dec: 0.25, rel: 0.5,
                        vib: { rate: 4.6, depth: 12, delay: 0.35 }, rev: 0.65, pan: dt > 0 ? 0.3 : -0.3 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.02 * c.harmGain * c.melGain, { type: 'sawtooth', cutoff: 800, q: 2, attack: 0.2, sus: 0.85, dec: 0.25, rel: 0.5, rev: 0.65, low: true });
                } else if (c.mel && lead === 'pizz') {   // a low string plucked and damped: short, dark and close; a held note is left a little longer
                    const d = Math.min(1.3, Math.max(0.26, len * c.mel.len * 0.8));
                    note(c.mel.t, c.mel.n, d, 0.085 * c.melGain, { type: 'triangle', cutoff: 520 + 520 * k, q: 1.2, env: 1.4, envTime: 0.05, attack: 0.004, rev: 0.35, pan: -0.15 });
                    note(c.mel.t, c.mel.n - 12, d * 0.8, 0.03 * c.melGain, { type: 'sine', attack: 0.004, rev: 0.25 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.035 * c.harmGain * c.melGain, { type: 'triangle', cutoff: 480, attack: 0.004, rev: 0.35, pan: 0.3, low: true });
                } else if (c.mel) {
                    const d = len * c.mel.len * 1.02;
                    note(c.mel.t, c.mel.n, d, 0.05 * c.melGain, { type: 'triangle', cutoff: 1400, detune: -10, attack: Math.min(0.12, d * 0.3), sus: 0.75, dec: 0.2, rel: 0.4,
                        vib: c.mel.len >= 4 ? { rate: 4.2, depth: 14, delay: 0.3 } : null, rev: 0.6, dly: 0.35, pan: -0.1 });
                    note(c.mel.t, c.mel.n + 12, Math.min(d, 1.2), 0.007 * c.melGain, { type: 'sine', rev: 0.7 });
                    if (c.mel.harm && c.harmGain > 0.02) note(c.mel.t, c.mel.harm, d, 0.025 * c.harmGain * c.melGain,
                        { type: 'triangle', cutoff: 1100, detune: 10, attack: 0.1, sus: 0.75, dec: 0.2, rel: 0.4, rev: 0.6, pan: 0.3, low: true });
                }
            },
            // A reversed swell rising into the next section. No drum fill.
            fill(t, s, k, len) {
                if (s === 12) riser(t, len * 4, 0.09, { from: 200, to: 2400, rev: 0.6 });
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        // Slow and through-composed: small cells that don't resolve, whole bars of nothing, sections with no drums
        // at all. A bar is nearly four seconds here, so a chord is a place. `lvl` trims a song's pitched voices so
        // every song measures the same; a stealth song's `rest` lifts its tones while its drums are hushed.
        songs: {
            lab: [
                {   // Vigil: a four-note cell around the flat second, a bar of silence after each; B climbs and comes
                    // down through a diminished chord.
                    name: 'Vigil', lvl: 0.91, scale: HARM, oct: -1, comp: [0],
                    chords: { A: ['Am', 'Am', 'Bb', 'Bb', 'Dm', 'Dm', 'E7', 'E7'], B: ['Am', 'Fmaj7', 'Dm', 'Bdim', 'Am', 'Bb', 'E7sus4', 'E7'] },
                    mel: {
                        A: "1 - 3 - b2 - 1 - | . . . . . . . . | b2 - 4 - 3 - b2 - | . . . . . . . . | 4 - 6 - 5 - 4 - | . . . . 6 - 5 - | 7 - 2' - 4' - 2' - | 5 - - - . . . .",
                        B: "5 - - - 3' - - - | 3' - - 1' - - 6 - | 6 - - - 4 - - - | 4 - 2 - 6, - - - | 1 - - - . . . . | b2 - - - 4 - - - | 5 - - - 1' - - 2' | 7 - - - . . . ."
                    },
                    form: [['drone', 4, { mel: null, drums: 'none' }], ['A', 8, { drums: 'none' }], ['A', 8, { drums: 'sparse' }], ['B', 8, { chords: 'B' }],
                        ['still', 4, { mel: null, chords: 'B', from: 4, drums: 'none', lift: -0.2, fill: false }], ['A', 8, { harm: true }], ['out', 4, { mel: null, drums: 'none', fill: false }]]
                },
                {   // Static: someone turning a dial to see what comes through. 72 BPM, heard from F with a raised second
                    // and fourth (the same notes, a strange bright home). A bell asks: a figure that starts off the beat,
                    // climbs the chord and hangs; a low triangle tries an answer, each time on another chord; seven bars
                    // that end in the air. Then five bars of tinkering: one cell tried on four chords (the fourth a wrong
                    // turn, D flat), the bell closing on the raised fourth. The second time a figure rocks under it.
                    name: 'Static', lvl: 0.845, slvl: 0.91, bpm: 72, scale: LYD2, tonic: 8, oct: -1, lead: 'bell', leads: { A: 'btbtbtb', B: 'ttttb' }, rock: ['B2'], comp: [0],
                    chords: { A: ['Fmaj7', 'E', 'Fmaj7', 'G#dim7', 'Dm', 'Dbmaj7', 'E'], B: ['Dm', 'Fmaj7', 'Bdim', 'Dbmaj7', 'E'] },
                    mel: {
                        A: ". 1 3 5 7 - - - | . 7, 2 4 - - - . | . 1 3 5 1' - - - | . 2 4 6 - - - . | 3 - 6 - 1' - - - | . 1 2 5 - - - - | 2 - 4 - - - - .",
                        B: "3 6 1' 6 - 3 6 - | 3 5 7 5 - 3 7 - | 4 6 1' 6 - 4 1' - | 2 5 b6 5 - 2 1' - | 7, - 2 - 4 - - -"
                    },
                    form: [['dial', 2, { mel: null, drums: 'none', fill: false }], ['A', 7, { drums: 'none' }], ['B', 5, { chords: 'B', drums: 'sparse' }], ['A2', 7, { mel: 'A', harm: true }],
                        ['still', 2, { mel: null, drums: 'none', bassOn: false, fill: false, lift: -0.2 }], ['B2', 5, { mel: 'B', chords: 'B', lift: 0.08 }], ['A3', 7, { mel: 'A', drums: 'sparse' }],
                        ['out', 3, { mel: null, from: 4, drums: 'none', fill: false }]]
                }
            ],
            server: [
                {   // Descent: a march at 92: low strings bowing 8ths, a kick that limps, a clock on every 8th and voices
                    // over the oldest descent there is (Am – G – F – E). Four bars at a time; a minute and a half.
                    name: 'Descent', lvl: 0.895, slvl: 0.951, bpm: 92, scale: HARM, oct: -1, lead: 'choir', march: true, comp: [0],
                    kit: { kick: 'x.......x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
                    chords: { A: ['Am', 'G', 'F', 'E'], B: ['Dm', 'Dm', 'Am', 'Am', 'Bb', 'E7'] }, bass: 'r.r.r.r.f.f.r.r.',
                    mel: {
                        A: "1' - - 5 - - 3 - | 2 - - 5 - - 2 - | 1 - - 4 - - 6 - | 5 - - 7 - - 2' -",
                        B: "4 - - - 6 - 1' - | 2' - 1' - 6 - 4 - | 3 - - - 5 - 1' - | 3' - 1' - 5 - 3 - | b2 - - - 4 - 6 - | 5 - - - 7 - - -"
                    },
                    form: [['A', 4, { drums: 'sparse' }], ['A', 4], ['B', 6, { chords: 'B' }], ['A', 4, { harm: true, lift: 0.08 }], ['A', 4], ['void', 2, { mel: null, drums: 'none', fill: false, lift: -0.2 }],
                        ['B', 6, { chords: 'B' }], ['A', 4], ['out', 1, { mel: null, drums: 'none', fill: false }]]
                },
                {   // Undertow: a night crossing, carried. 6/8, 53 to the dotted quarter, heard from D with a raised fourth.
                    // Wheels under everything: the bass plucked root, fifth, octave on every 8th, a light clock on top.
                    // The tune is one long arc a section: six bars that climb to the octave and a step past it and hand
                    // on with a rising pickup, then eight that go higher and push through a three-against-two bar. The
                    // rocking figure joins from the middle, and the last verse arrives a tone up.
                    name: 'Undertow', lvl: 0.867, slvl: 0.893, bpm: 80, steps: 12, pulse: 6, scale: UKR, tonic: 5, oct: -1, roll: true, rock: ['B', 'A3', 'B2', 'A4'], comp: [0],
                    kit: { kick: 'x.....o.....', snare: '............', hat: 'x.o.o.x.o.o.' },
                    chords: { A: ['Dm', 'Dm', 'F', 'Am', 'E7', 'E7'], B: ['F', 'F', 'Am', 'Am', 'Bm7b5', 'Bm7b5', 'E7sus4', 'E7'] },
                    bass: { A: 'r.f.o.r.f.o.', B: 'r.t.o.r.t.o.' },
                    mel: {
                        A: "1 - - 3 - 5 | 1' - - 5 - - | 7 - - 5 - 7 | 2' - - 7 - - | 1' - - 6 - 4 | 2 - - 4 - 6",
                        B: "3 - - 5 - 7 | 1' - - 7 - 5 | 5 - - 7 - 2' | 2' - - - 7 - | 3' - - 1' - 6 | 5 - - 6 - 1' | 2' - - 1' - 6 | 4 - 6 - 2' -"
                    },
                    form: [['off', 2, { mel: null, drums: 'sparse', fill: false }], ['A', 6, { drums: 'sparse' }], ['A2', 6, { mel: 'A' }], ['B', 8, { chords: 'B' }], ['A3', 6, { mel: 'A', harm: true, lift: 0.06 }],
                        ['coast', 2, { mel: null, drums: 'none', fill: false, lift: -0.15 }], ['B2', 8, { mel: 'B', chords: 'B', lift: 0.08 }], ['A4', 6, { mel: 'A', harm: true, up: 2, lift: 0.1 }],
                        ['out', 2, { mel: null, up: 2, drums: 'sparse', fill: false }]]
                }
            ],
            snare: [
                {   // Crawlspace: on hands and knees, in five. 80 BPM, A Phrygian, suspended chords that never settle. A low
                    // string plucked and damped: three notes, then nothing; three more from somewhere else in the bar. Under
                    // it footsteps: the root, the semitone above it, the root, and a long wait. A heartbeat on one and four.
                    // Five bars, then four that reach up, come back down and stop on the half-diminished chord.
                    name: 'Crawlspace', lvl: 0.906, rest: 1.19, slvl: 0.943, srest: 1.19, bpm: 80, steps: 20, scale: PHRY, oct: -1, lead: 'pizz', comp: [0],
                    chords: { A: ['Asus4', 'Asus4', 'Bbmaj7', 'Gm', 'Em7b5'], B: ['Dm', 'Bbmaj7', 'Asus4', 'Em7b5'] },
                    creep: { A: '0.....1.0...........', B: '0...........1.0.....' },
                    kick: 'xo..........xo......', hush: 0.6, tick: '....o...x.......o...', cut: 0.8,
                    mel: {
                        A: "5, . 1 . 4 - . . . . | . . . . . . 1 2 1 . | 6, . 2 . 4 - . . . . | . . . . . . 2 3 4 . | 5 - - - . . . . . .",
                        B: ". . 4 . 6 . 1' - . . | . . . . . . . 6 4 2 | 1 - - - . . . . 5, . | 7, . 2 . 5 - - - . ."
                    },
                    form: [['A', 5], ['B', 4, { chords: 'B' }], ['wait', 1, { mel: null, fill: false }], ['A2', 5, { mel: 'A', harm: true }], ['B2', 4, { mel: 'B', chords: 'B' }]]
                },
                {   // Lights Out: Am – F – Dm – E, the line stepping down and stopping to listen.
                    name: 'Lights Out', lvl: 0.89, rest: 1.22, slvl: 0.93, srest: 1.24, scale: HARM, oct: -1, chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Bb', 'E7'], comp: [0],
                    kick: 'x.o.....x.o.....', hush: 0.6, tick: '..x...o...x...o.', cut: 0.8,
                    mel: {
                        A: "5 - - - . . 3 . | 1 - - - . . . . | 4 - - - . . . . | 2 - - - . . . .",
                        B: "1 - - - - - . . | 1 - - - 3 - - - | 4 - - - 6 - - - | 5 - - - 7, - - - | 3 - - - 5 - - - | 6 - - - 1' - - - | b2' - - - 6 - - - | 7 - - - - - . ."
                    },
                    form: [['A', 4], ['B', 8], ['wait', 2, { mel: null, fill: false }], ['A', 4], ['B', 8], ['A', 4, { harm: true }]]
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
            snareHerdStun: () => { T(72, { to: 48, type: 'triangle', dur: 0.35, gain: 0.04, cutoff: 1200, detune: -12 }); noise({ dur: 0.05, gain: 0.03, f0: 4000, q: 4 }); },
            // The power-up moments, in this track's tolls, knocks and swells.
            system: () => { [45, 57, 69].forEach((n, i) => toll(n, { at: i * S() * 2, gain: 0.05 })); [81, 82, 88].forEach((n, i) => T(n, { type: 'sine', dur: 1.2, gain: 0.025, at: (6 + i) * S(), detune: -12, echo: 0.4 })); },
            smash: () => { swellUp(0.35, 0.2); T(33, { to: 16, dur: 1.6, gain: 0.5, at: 0.3 }); noise({ dur: 1.4, gain: 0.3, f0: 900, f1: 60, type: 'lowpass', at: 0.3 }); toll(33, { at: 0.3, gain: 0.08 }); },
            windup: () => { swellUp(0.6, 0.12); T(45, { to: 46, type: 'sawtooth', dur: 0.6, gain: 0.03, cutoff: 700, attack: 0.4 }); },
            crunch: () => { knock(45, { gain: 0.14 }); knock(46, { gain: 0.1, at: S() }); knock(45, { gain: 0.12, at: 2 * S() }); T(33, { dur: 0.6, gain: 0.15 }); },
            flow: () => { [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 2.6, gain: 0.035, attack: 0.6, cutoff: 1100, detune: -10 })); toll(69, { at: 4 * S(), gain: 0.03 }); },
            freeze: () => { T(84, { to: 36, type: 'sine', dur: 1.4, gain: 0.1, detune: -12 }); toll(84, { gain: 0.04 }); noise({ dur: 1.2, gain: 0.05, f0: 3000, f1: 100, type: 'lowpass' }); },
            release: () => { swellUp(0.5, 0.22); T(33, { to: 21, dur: 1.2, gain: 0.45, at: 0.45 }); toll(45, { at: 0.45, gain: 0.08 }); [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 1.2, gain: 0.03, at: 0.45, cutoff: 1500 })); },
            viral: () => [69, 72, 76].forEach((n, i) => toll(n, { at: i * S(), gain: 0.035 }))
        }
    };
};
