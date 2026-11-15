// music/soft.js — the Soft track: its songs, its instruments and its sound effects.
// Loaded before sfx.js, which builds it: `h` is the engine's toolkit (the voices, the note helpers, the scales).
// How a song is written: sfx.js, "Songs". What every track shares, and the notes on this one: music/README.txt and
// music/soft/notes.txt.
(window.SFXThemes = window.SFXThemes || {}).soft = function (h) {
    'use strict';
    // eslint-disable-next-line no-unused-vars
    const { pump, note, perc, harmNote, MIXO, LYD, tone, noise: noise0, NOTE, T: T0, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, varDeg, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION } = h;

    // Its effects match its music: nothing struck. Every tone swells in (a short one in 12 ms, the rest in 20 or
    // more) and is never shorter than a tenth of a second; noise is quieter, darker and eased in. The two voices the
    // effects are written in keep their old names: `marimba` is a round low sine with a breath of its octave,
    // `softBell` a sine that swells and rings with a soft triangle over it. F major pentatonic.
    const T = (n, o = {}) => T0(n, { attack: (o.dur ?? 0.2) < 0.08 ? 0.012 : 0.02, ...o, dur: Math.max(0.1, o.dur ?? 0.2) });
    const noise = (o = {}) => noise0({ ...o, attack: Math.max(0.03, o.attack ?? 0), gain: (o.gain ?? 0.05) * 0.7, f0: Math.min(3500, o.f0 ?? 3000), ...(o.f1 ? { f1: Math.min(3500, o.f1) } : null), dur: Math.max(0.08, o.dur ?? 0.1) });
    const marimba = (n, o = {}) => { T(n, { type: 'sine', gain: 0.07, attack: 0.025, ...o, dur: Math.max(0.3, o.dur ?? 0.3) }); T(n + 12, { type: 'sine', dur: 0.2, gain: (o.gain ?? 0.07) * 0.12, attack: 0.03, at: o.at }); };
    const softBell = (n, o = {}) => { T(n, { type: 'sine', dur: 0.7, gain: 0.05, attack: 0.04, ...o }); T(n + 12, { type: 'triangle', dur: Math.min(0.5, o.dur ?? 0.5), gain: (o.gain ?? 0.05) * 0.15, attack: 0.05, cutoff: 2400, at: o.at }); };
    const padChord = (notes, o = {}) => notes.forEach(n => T(n, { type: 'triangle', dur: 1.4, gain: 0.025, attack: 0.15, cutoff: 1800, ...o }));

    return {
        // The key its sound effects are moved into (they are written in A minor pentatonic): F major pentatonic: F G A C D.
        key: { root: 53, set: [0, 2, 4, 7, 9] },
        // What it does to any effect it doesn't write itself.
        profile: { wave: t => (t === 'square' || t === 'sawtooth' ? 'triangle' : t), cut: 0.55, lp: 1800, gain: 0.85, len: 1.25, attack: 0.025,
            noise: n => ({ ...n, gain: n.gain * 0.7 }) },
        // The plain voice of its simple sounds.
        simpleVoice: { type: 'sine', oct: 0, len: 1.4, gain: 1, attack: 0.02 },
        // Levels, all measured (re-measure when the track or its sounds change: tools/audio). `sfx` and `simple`: its
        // effects against Classic's. `charge`: the sprint meter's parts (arpeggio, hops, acid, gated chord, thrust), after
        // `base`. `snare`: each Packet Snare effect against this track's own effects.
        trims: {
            sfx: 1.21, simple: 1.56,
            base: 1.48, baseSimple: 1.22,
            fx: {system: 0.82, smash: 1.3, windup: 0.69, crunch: 0.78, flow: 1.38, freeze: 1.32, release: 0.99, viral: 0.68},      // single effects against Classic's (tools/audio/fx-levels.js)
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

        // ---- Instruments: the voices, and how they play a song step by step ------------------------------------
        // Soft: a small orchestra in a long hall, and a dream: no drums, and nothing struck or plucked. Every note
        // swells in and lets go slowly. The chord is a string section (two detuned saws a note behind a low filter,
        // spread left to right) that holds each bar and overlaps the next; a low string holds the bass; a high note shimmers over it late on. The tune is sung legato by
        // one of: the strings, a flute, a horn, a clarinet, an oboe, a choir or a hum (`lead` on the song; `leadIn` gives a section its own), with a quiet
        // line under it when a section asks for harmony. Each song mixes its own textures over that (`choir`, `flow`, `pulse`,
        // `inner`, `pedal`, `answer`, `compVoice: 'swell'`: see the step), so no two are built alike. The section ends on a held note leading into the next.
        // Its click figure plays the track's 8ths (322 ms: about three notes a second while a job is held).
        style: {
            bpm: 93, swing: 0.2,
            cutoff: k => 1100 + 3200 * k * k, drive: 0, gain: 0.915, shift: 5,     // D minor / F major
            beat: 1.53, tones: 1.487,   // it has no drums: `beat` is kept for the mixer only
            simpleMix: { gain: 1, beat: 0.997, tones: 2.032 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            space: { reverb: { seconds: 2.8, damp: 3000, level: 0.5, pre: 0.02 }, delay: { steps: 4, feedback: 0.2, cutoff: 1500, level: 0.15, pan: -0.2 }, width: 1 },
            layers: { keys: -1, pad: -1, bass: 0.06, mel: 0.2, off: 0.38, kick: 0.46, harm: 0.5, clap: 0.58, sixteenth: 0.7, arp: 0.8 },
            fillAt: 0.42,
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song, ts = t + c.sw, N = c.steps, bar = len * N;
                // A song says which of its sections a texture plays in (a list of section names), or true for all.
                // `spotted`: textures a stealth song adds only once you are spotted (it has no drums to bring in), faded in by `sp`.
                const sp = Math.max(0, Math.min(1, (c.spot - 0.15) / 0.6));
                const has = key => (song.spotted && song.spotted.includes(key) ? sp > 0 : Array.isArray(song[key]) ? song[key].includes(c.sec) : !!song[key]);
                // `shiver`: the strings trembling, the chord re-bowed on every step, each stroke eased in and run into the
                // next: nerves, with nothing struck (the owner's call: going quiet when spotted was wrong).
                if (has('shiver')) ch.v.forEach((n, i) =>
                    note(ts, n, len * 1.35, 0.0075 * sp * (s % 2 ? 0.75 : 1), { type: 'sawtooth', cutoff: 850 + 250 * k, q: 0.5, detune: i % 2 ? 6 : -6, attack: 0.045, sus: 0.7, dec: 0.08, rel: 0.13, rev: 0.4, pan: (i - 1.5) * 0.3 }));
                // `heart`: the low strings swelling twice on each beat, a pulse under everything.
                if (s % 4 === 0 && has('heart')) [[0, 0.055], [1.4, 0.034]].forEach(([at, g]) =>
                    note(ts + at * len, ch.v[0] - 12, len * 1.5, g * sp, { type: 'triangle', cutoff: 240, q: 0.5, attack: 0.06, sus: 0.7, dec: 0.12, rel: 0.25, rev: 0.25 }));
                // The string section: the chord through the whole bar, swelling in, overlapping the bar before.
                if (L.pad > 0.02 && s === 0 && !has('stringsOut')) ch.v.forEach((n, i) => {
                    const pan = (i - 1.5) * 0.3, o = { type: 'sawtooth', cutoff: 650 + 450 * k, q: 0.5, attack: Math.min(0.9, bar * 0.35), sus: 0.9, dec: 0.4, rel: 1.2, rev: 0.6 };
                    note(t, n, bar * 1.02, 0.0085 * L.pad, { ...o, detune: -6, pan });
                    note(t, n, bar * 1.02, 0.0085 * L.pad, { ...o, detune: 7, pan: -pan, low: true });
                });
                // `choir`: voices on the chord an octave up, "ah", slower in than the strings.
                if (s === 0 && has('choir')) ch.v.forEach((n, i) => [-8, 8].forEach((dt, j) =>
                    note(t, n + 12, bar * 1.05, 0.0075, { type: 'triangle', detune: dt, cutoff: 1000, q: 0.5, attack: Math.min(1.4, bar * 0.45), sus: 0.9, dec: 0.4, rel: 1.5, rev: 0.7, pan: (i - 1.5) * 0.3 * (j ? -1 : 1), low: j > 0 })));
                // `flow`: the chord rolling up and back in 8ths, every note eased in and left to ring.
                if (s % 2 === 0 && has('flow')) {
                    const v = ch.v, m = 2 * v.length - 2 || 1, i = (s / 2) % m, n = v[i < v.length ? i : m - i] + 12;
                    note(ts, n, len * 5, 0.021, { type: 'sine', attack: 0.05, sus: 0.5, dec: 0.5, rel: 0.8, rev: 0.5, dly: 0.15, pan: i % 2 ? 0.4 : -0.4 });
                    note(ts, n, len * 3, 0.006, { type: 'triangle', cutoff: 1200, attack: 0.06, sus: 0.4, dec: 0.4, rel: 0.5, rev: 0.5, pan: i % 2 ? 0.4 : -0.4, low: true });
                }
                // `pulse`: the upper strings re-bowed on every beat, each stroke eased in and run into the next: motion
                // without anything struck.
                if (s % 4 === 0 && has('pulse')) ch.v.forEach((n, i) =>
                    note(ts, n + 12, len * 4.6, 0.0085, { type: 'triangle', cutoff: 1500, q: 0.5, attack: 0.09, sus: 0.6, dec: 0.25, rel: 0.5, rev: 0.45, pan: (i - 1.5) * 0.3 }));
                // `inner`: a cello moving inside the chord, its third for half the bar and its fifth for the rest.
                if ((s === 0 || s === N / 2) && has('inner'))
                    note(t, ch.v[s === 0 ? 1 : 2 % ch.v.length], bar * 0.55, 0.034, { type: 'triangle', cutoff: 650, q: 0.5, attack: 0.2, sus: 0.85, dec: 0.3, rel: 0.7, rev: 0.45, pan: -0.25 });
                // The low strings hold the bass (`pedal`: through the whole bar, slower in).
                const b = c.bassOn && L.bass > 0.02 && bassAt(song, s, ch);
                if (b) note(ts, b, song.pedal ? bar * 1.02 : len * 5, 0.15 * L.bass, { type: 'triangle', cutoff: 300 + 300 * k, q: 0.6, attack: song.pedal ? 0.35 : 0.1, sus: 0.85, dec: 0.3, rel: song.pedal ? 1 : 0.6, rev: 0.3 });
                // Upper strings breathing in on the song's comp steps (only where a song asks: `compVoice: 'swell'`).
                if (L.keys > 0.02 && c.comp.includes(s) && song.compVoice === 'swell')
                    ch.v.forEach((n, i) => note(ts + i * 0.04, n + 12, len * 6, 0.009 * L.keys, { type: 'sine', attack: 0.35, sus: 0.7, dec: 0.5, rel: 1.1, rev: 0.85, pan: (i - 1.5) * 0.25 }));
                // A high note held over two bars, late on.
                if (L.arp > 0.02 && s === 0 && c.bar % 2 === 0)
                    note(t, ch.v[ch.v.length - 1] + 24, bar * 2, 0.007 * L.arp, { type: 'sine', attack: bar * 0.5, sus: 0.9, dec: 0.3, rel: 1.2, rev: 0.7, pan: 0.3, low: true });
                // The tune, legato: each note swells in and overlaps the next. `answer`: a second voice takes every
                // other pair of bars.
                if (c.mel) {
                    // High notes sit further off (the owner's call: the high tune was too present): from the C above
                    // middle C upward a note is quieter, slower in and more in the hall, down to 0.4 an octave up.
                    // `low` (a spotted texture): once spotted the tune drops an octave to a cello.
                    const low = sp > 0.5 && has('low') && c.mel.n - 12 >= 43;
                    const d = Math.max(len * c.mel.len * 1.3, 0.6), at = c.mel.t, n = c.mel.n - (low ? 12 : 0);
                    const far = Math.max(0, Math.min(1, (n + 5 - 72) / 12)), g = c.melGain * (1 - 0.6 * far);
                    const env = { attack: Math.min(0.18 + 0.1 * far, d * 0.4), sus: 0.9, dec: 0.25, rel: 0.5 + 0.3 * far, rev: 0.55 + 0.35 * far };
                    const vib = c.mel.len >= 3 ? { rate: 4.8, depth: 8, delay: 0.3 } : null;
                    const lead = low ? 'cello' : (song.leadIn && song.leadIn[c.sec]) || (song.answer && c.barIn % 4 >= 2 ? song.answer : song.lead) || 'strings';
                    if (lead === 'cello') {
                        note(at, n, d, 0.075 * g, { type: 'triangle', cutoff: 700 + 200 * k, q: 0.5, ...env, attack: Math.min(0.22, d * 0.4), vib, pan: -0.2 });
                        note(at, n, d, 0.008 * g, { type: 'sawtooth', cutoff: 900, q: 0.5, ...env, attack: Math.min(0.22, d * 0.4), pan: -0.2, low: true });
                    } else if (lead === 'flute') {
                        note(at, n, d, 0.034 * g, { type: 'sine', ...env, rev: Math.max(env.rev, 0.8), vib, pan: 0.1 });      // the flute: well back in the hall, no octave over it
                    } else if (lead === 'horn') {
                        note(at, n, d, 0.07 * g, { type: 'triangle', cutoff: 800 + 300 * k, q: 0.5, ...env, pan: -0.1 });
                        note(at, n, d, 0.02 * g, { type: 'sine', ...env, vib, pan: -0.1 });
                    } else if (lead === 'clarinet') {
                        note(at, n, d, 0.03 * g, { type: 'square', cutoff: 950, q: 0.5, ...env, vib, pan: -0.2 });
                    } else if (lead === 'oboe') {     // thin and a little nasal: a saw through a narrow, ringing filter over a sine
                        note(at, n, d, 0.013 * g, { type: 'sawtooth', cutoff: 1500, q: 3, ...env, vib, pan: -0.15 });
                        note(at, n, d, 0.03 * g, { type: 'sine', ...env, vib, pan: -0.15 });
                    } else if (lead === 'choir') {
                        [-9, 0, 9].forEach((dt, i) => note(at, n, d, 0.027 * g, { type: 'triangle', detune: dt, cutoff: 1100, q: 0.5, ...env, attack: Math.min(0.24, d * 0.4), vib, pan: (i - 1) * 0.35, low: i > 0 }));
                    } else if (lead === 'oo') {       // voices singing "oo": sines a few cents apart, an octave under them faintly
                        [-6, 6].forEach((dt, i) => note(at, n, d, 0.034 * g, { type: 'sine', detune: dt, ...env, attack: Math.min(0.3, d * 0.4), rel: 0.8, vib, pan: i ? 0.3 : -0.3 }));
                        note(at, n - 12, d, 0.016 * g, { type: 'sine', ...env, attack: Math.min(0.3, d * 0.4), rel: 0.8, low: true });
                    } else if (lead === 'hum') {
                        note(at, n, d, 0.05 * g, { type: 'sine', ...env, vib, pan: 0.1 });
                        note(at, n - 12, d, 0.022 * g, { type: 'triangle', cutoff: 700, ...env, pan: -0.1 });
                    } else {
                        note(at, n, d, 0.02 * g, { type: 'sawtooth', detune: -7, cutoff: 1400 + 500 * k, q: 0.5, ...env, vib, pan: 0.2 });
                        note(at, n, d, 0.02 * g, { type: 'sawtooth', detune: 7, cutoff: 1400 + 500 * k, q: 0.5, ...env, vib, pan: -0.05 });
                    }
                    if (c.mel.harm && c.harmGain > 0.02) note(at, c.mel.harm, d, 0.022 * c.harmGain * g, { type: 'sine', ...env, pan: -0.3, low: true });
                }
            },
            // The end of a section: the next chord's top note, swelling in over the last beat.
            fill(t, s, k, len, L, c) {
                if (s === 12) note(t + c.sw, c.next.v[c.next.v.length - 1] + 12, len * 5, 0.02, { type: 'sine', attack: len * 3, sus: 0.9, dec: 0.2, rel: 0.6, rev: 0.6 });
            }
        },

        // ---- Songs: two for the lab, two for the server room, two for Packet Snare -----------------------------
        // Each has its own form, with room to breathe. `lvl` trims a song's pitched voices so every song measures
        // the same; a stealth song's `rest` lifts its tones while its drums are hushed.
        songs: {
            lab: [
                {   // Morning Lab: curious, an experiment. C Lydian at 92, straight: an oboe asks a question that climbs
                    // and hangs (two bars, each starting off the beat), a flute tries an answer; the middle six bars
                    // tinker in 8ths over a rolling chord and take a wrong turn through A flat before finding the
                    // raised fourth an octave up. A cello joins the second time, the choir the second experiment.
                    name: 'Morning Lab', lvl: 1.047, bpm: 92, swing: 0, scale: LYD, tonic: 3, oct: -1, lead: 'oboe', answer: 'flute',
                    flow: ['B', 'B2'], choir: ['B2', 'out'], inner: ['A2', 'A3'],
                    chords: { A: ['Cmaj7', 'D/C', 'Cmaj7', 'Bm7', 'Am9', 'D', 'Em7', 'Dsus4'], B: ['Am9', 'Abmaj7', 'Cmaj7', 'Bm7', 'Em7', 'D'] },
                    bass: { A: 'r...............', B: 'r.......f.......' },
                    mel: {
                        A: ". 1 2 3 5 - - - | . 2 3 4 6 - - - | 7 - 5 3 - 4 5 - | 4 - - - - - . . | . 6, 1 3 5 - 7 - | . 2 4 6 2' - - - | 3' - 2' 7 - 5 7 - | 6 - - - - - . .",
                        B: "3 5 3 5 7 - 5 - | 5 - 1' - b3' - - - | 3' - 1' 7 5 - 3 - | 4 - 6 - 2' - - - | 7 - 5 7 2' - 3' - | 4' - - - - - . ."
                    },
                    form: [['in', 2, { mel: null, fill: false }], ['A', 8], ['B', 6, { chords: 'B' }], ['A2', 8, { mel: 'A', harm: true }], ['still', 2, { mel: null, bassOn: false, fill: false, lift: -0.15 }],
                        ['B2', 6, { mel: 'B', chords: 'B', lift: 0.08 }], ['A3', 8, { mel: 'A', lift: 0.06 }], ['out', 2, { mel: null, fill: false }]]
                },
                {   // Window Seat: curious, in five (3 + 2) at 104, E Dorian: a flute turns one small figure over, a
                    // little higher each time, with the upper strings breathing in on the fourth beat; six bars in
                    // the violins that open on a borrowed C major, as if looking out at something new.
                    name: 'Window Seat', lvl: 0.93, bpm: 104, steps: 20, swing: 0, scale: DOR, tonic: 7, oct: -1, lead: 'flute', leadIn: { B: 'strings' }, compVoice: 'swell',
                    inner: ['A2'], chords: { A: ['Em9', 'A', 'Em9', 'Gmaj7', 'Cmaj7', 'Bm7', 'A', 'Bsus4'], B: ['Cmaj7', 'D', 'Bm7', 'Em9', 'Cmaj7', 'Bsus4'] },
                    bass: 'r...........f.......', comp: [12],
                    mel: {
                        A: "5 - 3 5 7 - 2' - - - | 1' - 6 - 4 - 6 - - . | 5 - 3 5 7 - 3' - - - | 2' - 7 - 5 - - - . . | 3 - 5 - 1' - 5 - - - | 2 - 4 - 7 - 4 - - - | 6 - 1' - 4' - 3' - 1' - | 2' - - - - - - - . .",
                        B: "5 - - 3 1' - - - 7 - | 4 - - 2 7 - - - 4' - | 2' - - 7 4 - - - 2 - | 3 - 5 - 7 - 2' - - - | 3' - - 1' 5 - - - 3 - | 2 - - - 5 - - - . ."
                    },
                    form: [['A', 8], ['B', 6, { chords: 'B' }], ['A2', 8, { mel: 'A', harm: true }], ['still', 3, { mel: null, chords: 'B', from: 3, fill: false, lift: -0.15 }],
                        ['B', 6, { chords: 'B' }], ['A', 8, { lift: 0.06 }], ['out', 2, { mel: null, from: 6, fill: false }]]
                }
            ],
            server: [
                {   // Gentle Climb: 76, and the one that moves: the chord rolls up and back in 8ths the whole way, a horn
                    // climbs over it a phrase at a time, and the choir opens up on the high tune. The longest song here.
                    name: 'Gentle Climb', lvl: 1.113, bpm: 76, swing: 0, scale: AEOL, lead: 'horn', chords: ['Am9', 'Fmaj7', 'Cadd9', 'G6', 'Dm9', 'Fmaj7', 'Cadd9', 'Esus4'],
                    flow: ['intro', 'A', 'A2', 'B', 'B2', 'A3'], choir: ['B', 'B2', 'out'],
                    bass: 'r...............',
                    mel: {
                        A: "1 - - - 3 - 5 - | 6 - - - - - 3 - | 5 - - - 7 - - - | 2' - - - - - - .",
                        B: "3' - - - 1' - - - | 1' - - - 6 - - - | 7 - - - 5 - - - | 5 - - - 4 - 2 - | 4 - - - 6 - 1' - | 3' - - - - - 1' - | 4' - - - 3' - - - | 2' - - - - - - ."
                    },
                    form: [['intro', 4, { mel: null, fill: false }], ['A', 8], ['A2', 8, { mel: 'A', harm: true }], ['B', 8], ['still', 4, { mel: null, bassOn: false, fill: false, lift: -0.15 }],
                        ['B2', 8, { mel: 'B', lift: 0.08 }], ['A3', 8, { mel: 'A', harm: true }], ['out', 4, { mel: null, fill: false }]]
                },
                {   // Glide Path: the open road at 96, in G: the strings re-bowed softly on every beat (`pulse`: the wheels),
                    // a bass that walks root to fifth, voices ("oo") singing long arcs with a pickup into each bar;
                    // the chorus goes to the violins with the choir, and the last one lifts a tone.
                    name: 'Glide Path', lvl: 0.807, bpm: 96, swing: 0, scale: ION, tonic: 10, oct: -1, lead: 'oo', leadIn: { B2: 'strings', B3: 'strings' },
                    pulse: ['A', 'B', 'A2', 'B2', 'B3'], choir: ['B2', 'B3', 'out'], inner: ['A2'],
                    chords: { A: ['Gadd9', 'Gadd9', 'Em7', 'Cadd9', 'Gadd9', 'D', 'Em7', 'Cadd9'], B: ['Cadd9', 'D', 'Em7', 'Bm7', 'Cadd9', 'D', 'F', 'Dsus4'] },
                    bass: 'r.......f.......',
                    mel: {
                        A: "3 - - - 5 - 3 2 | 1 - - - - - 2 3 | 5 - - - 3 - 2 1 | 1 - - - - - 5, 1 | 3 - - - 5 - 6 5 | 6 - - 5 - - 2 - | 3 - - - 5 - 6 - | 5 - - - - - . .",
                        B: "6 - - - 5 - 2 - | 7 - - - 6 - 5 - | 1' - - - 6 - 5 - | 7 - - - - - 5 6 | 1' - - - 6 - 5 - | 2' - - - 7 - 6 - | 1' - - - 4 - 2 - | 2 - - - - - . ."
                    },
                    form: [['intro', 4, { mel: null, fill: false }], ['A', 8], ['B', 8, { chords: 'B' }], ['A2', 8, { mel: 'A', harm: true }], ['B2', 8, { mel: 'B', chords: 'B', lift: 0.08 }],
                        ['B3', 8, { mel: 'B', chords: 'B', up: 2, lift: 0.1 }], ['out', 4, { mel: null, fill: false }]]
                }
            ],
            snare: [
                {   // Tiptoe: in three at 66: a clarinet asks for two bars and a flute answers for two, a cello turning
                    // under them, the bass only holding.
                    name: 'Tiptoe', lvl: 0.65, rest: 1, slvl: 0.85, srest: 1.31, bpm: 66, steps: 12, swing: 0, scale: AEOL, lead: 'clarinet', answer: 'flute', pedal: true, spotted: ['heart', 'low'],
                    inner: ['A', 'A2', 'A3', 'B', 'B2'], chords: ['Am9', 'Fmaj7', 'Dm9', 'Esus4'],
                    bass: 'r...........', cut: 0.8,
                    mel: {
                        A: "1 - - 3 - - | 5 - - - - . | 6 - - 4 - - | 2 - - - - .",
                        B: "3 - 5 - 7 - | 6 - - - - - | 4 - 6 - 1' - | 2' - - 5 - - | 3' - - 1' - - | 1' - - 6 - - | 6 - 4 - 3 - | 2 - - - - ."
                    },
                    form: [['in', 2, { mel: null, fill: false }], ['A', 4], ['A2', 4, { mel: 'A', harm: true }], ['B', 8], ['wait', 2, { mel: null, bassOn: false, fill: false }], ['A3', 4, { mel: 'A' }], ['B2', 8, { mel: 'B' }]]
                },
                {   // Hushed Channel: a lullaby at 80 in F Lydian: only the held strings, and a choir alone in five-bar
                    // phrases over a Gsus4 that never lands.
                    name: 'Hushed Channel', lvl: 0.749, rest: 0.98, slvl: 0.85, srest: 1.31, bpm: 80, swing: 0, scale: LYD, tonic: 8, oct: -1, lead: 'choir', compVoice: 'none', inner: true, spotted: ['heart', 'low'],
                    chords: { A: ['Fmaj7', 'Fmaj7', 'Em7', 'Dm9', 'Gsus4'], B: ['Am7', 'Fmaj7', 'Dm9', 'Em7', 'Gsus4'] },
                    bass: 'r.....r.........', comp: [10], cut: 0.8,
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
            // Compute a round low tone, data a short high sine, research a swelling one.
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
            // Packet Snare, secretive: muted triangles and sines that ease in, a sine heartbeat, a warm pad.
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
            // The power-up moments, in this track's swelling tones and pad: they still land, warmly.
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
