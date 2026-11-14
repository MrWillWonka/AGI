// Ominous: its six songs. A copy from sfx.js, taken 2026-11-14; reference only (the game plays sfx.js).
// Notation: ../shared/notation.js. Notes on the writing: notes.txt.
//   lab: Vigil, Static
//   server: Descent, Undertow
//   snare: Crawlspace, Lights Out

// ---- SONGS.ominous (sfx.js lines 1628-1667) ----
ominous: {
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
