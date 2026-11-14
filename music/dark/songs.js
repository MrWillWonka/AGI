// Dark: its six songs. A copy from sfx.js, taken 2026-11-14; reference only (the game plays sfx.js).
// Notation: ../shared/notation.js. Notes on the writing: notes.txt.
//   lab: Foundry, Rust
//   server: Warehouse, Pressure
//   snare: Black Box, Tripwire

// ---- SONGS.dark (sfx.js lines 1544-1583) ----
dark: {
    lab: [
        {   // Foundry: Phrygian (the flat second), a low pad, the acid line held back.
            lvl: 1.05, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Am', 'Dm', 'Dm', 'Bb', 'C'], comp: [0], acid: 0.45,
            melA: "1' - - - 2' - 1' - | 5 - - - . . 7 6 | 6 - 4 - 2 - - . | 1 - - - . . . .",
            melB: "1 . 1 . 2 1 . 5, | 1 . 1 . 3 2 1 . | 2 . 2 . 4 2 . 6, | 1 - - - 5, - 7, - | 4 . 4 . 6 4 . 1 | 4 . 3 . 2 - 1 - | 2 - 4 - 6 - 4 - | 3 - 5 - 7 - 5 -"
        },
        {   // Rust: a slow descent, i – vii – VI – vii.
            lvl: 0.86, scale: PHRY, chords: ['Am', 'Gm', 'F', 'Gm', 'Am', 'Bb', 'F', 'Bb'], comp: [0], acid: 0.35,
            melA: "5 - - - 3 - 1 - | 2 - - - 4 - 7, - | 1 - - - 3 - 6, - | 2 - 4 - 6 - 4 -",
            melB: "1' - - 7 1' - 5 - | 4' - - 2' 7 - - - | 6 - - 5 6 - 1' - | 7 - 6 - 4 - 2 - | 5 - - - 1' - 3' - | 2' - - - 6 - 4 - | 3' - 1' - 7 - 5 - | 4 - 2 - 1 - - -"
        }
    ],
    server: [
        {   // Warehouse: the acid line at full tilt, a hoover riff over it.
            lvl: 0.84, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Bb', 'Am', 'Am', 'F', 'Gm'], comp: [0],
            melA: "1' . . 1' . . 2' . | 1' . . 7 . . 5 . | 2' . . 2' . . 4' . | 3' . . 2' . . 6 .",
            melB: "5 - - - 6 - 5 - | 1' - - - 7 - 6 - | 4 - - - 6 - 4 - | 2 - - - - - . . | 5 - 6 - 1' - 2' - | 1' - 7 - 5 - - - | 6 - 5 - 3 - 1 - | 2 - 4 - 7 - - -"
        },
        {   // Pressure: a low hoover stabbing on the 16ths, stabs on the off-beats.
            lvl: 0.77, scale: PHRY, chords: ['Am', 'Bb', 'Am', 'Gm', 'Am', 'Bb', 'Dm', 'Bb'], comp: [0, 3, 11], oct: -1,
            melA: "1 . 1 . . 5 . 1 | 2 . 2 . . 4 . 6, | 1 . 1 . . 5 . 3 | 2 . 7, . . 4 . 2",
            melB: "5 . 5 6 5 . 3 1 | 2 . 2 4 2 . 6, . | 5 . 5 6 5 . 1' . | 7 . 6 . 4 . 2 . | 1' . 1' 2' 1' . 5 . | 4' . 2' . 6 . 4 . | 6 . 4 . 3 . 1 . | 2 - - - 6, - - -"
        }
    ],
    snare: [
        {   // Black Box: the warehouse held back: the acid line low and closed, the kick a pulse, the flat second waiting.
            lvl: 0.91, rest: 2.01, slvl: 0.80, srest: 1.39, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Bb', 'Am', 'Am', 'Gm', 'Gm'], comp: [0], acid: 0.3, rumble: 0.6,
            kick: 'x.......x.......', hush: 0.5, tick: 'x.o.x.o.x.o.x.oo', cut: 0.7,
            melA: "1 - - - . . . . | . . 5, - 1 - - . | 4 - - - . . 2 . | 2 - - - . . . .",
            melB: "1 . 1 . 2 . 1 . | 5, - - - . . . . | 4 . 4 . 6 . 4 . | 2 - - - . . . . | 1 . 3 . 5 . 3 . | 1 - - - 2 - 1 - | 7, . 2 . 4 . 2 . | 7, - - - 5, - - -"
        },
        {   // Tripwire: A against B flat, a hoover creeping up the D minor, never home.
            lvl: 0.89, rest: 2.20, slvl: 0.82, srest: 1.32, scale: PHRY, chords: ['Am', 'Bb', 'Am', 'Bb', 'Dm', 'C', 'Dm', 'Bb'], comp: [0], acid: 0.25, rumble: 0.5,
            kick: 'x.........x.....', hush: 0.5, tick: '..x...x...x..xx.', cut: 0.7,
            melA: "1 . . . . . 3 . | 4 - - - . . . . | 1 . . 4 . . . . | 2 - - - . . . .",
            melB: "1 - - - 5, - - - | 2 - - - 4 - - - | 1 . 1 . 3 . 5 . | 4 - - - 2 - - - | 4 . 6 . 1' . 6 . | 5 - - - 3 - - - | 4 . 1 . 6, . 4 . | 4 - - - - - . ."
        }
    ]
},
