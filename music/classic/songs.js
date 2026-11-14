// Classic: its six songs. A copy from sfx.js, taken 2026-11-14; reference only (the game plays sfx.js).
// Notation: ../shared/notation.js. Notes on the writing: notes.txt.
//   lab: Night Survey, Uptime
//   server: Overclock, Packet Storm
//   snare: Packet Sniffer, Dead Drop

// ---- SONGS.classic (sfx.js lines 1500-1543) ----
classic: {
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
