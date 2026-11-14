// Soft: its six songs. A copy from sfx.js, taken 2026-11-14; reference only (the game plays sfx.js).
// Notation: ../shared/notation.js. Notes on the writing: notes.txt.
//   lab: Morning Lab, Window Seat
//   server: Gentle Climb, Glide Path
//   snare: Tiptoe, Hushed Channel

// ---- SONGS.soft (sfx.js lines 1584-1627) ----
soft: {
    lab: [
        {   // Morning Lab: major sevenths, a Rhodes on the off-beats, a kalimba line.
            lvl: 0.87, scale: ION, tonic: 3, oct: -1, chords: ['Cmaj7', 'Am7', 'Fmaj7', 'G6', 'Cmaj7', 'Em7', 'Fmaj7', 'Gsus4'],
            bass: 'r......f..r.....', comp: [6, 14],
            melA: "3 - 5 - 7 - 5 - | 6 - - - 5 - 3 - | 4 - 6 - 1' - 6 - | 5 - - - 2 - - .",
            melB: "1' - - - 7 - 5 - | 6 - - - 1' - 3' - | 2' - - - 1' - 6 - | 7 - - - 5 - - - | 3 - 5 - 1' - 7 - | 5 - - - 7 - 3' - | 2' - 1' - 6 - 4 - | 5 - - - - - . ."
        },
        {   // Window Seat: IV – V – iii – vi, unhurried.
            lvl: 0.83, scale: ION, tonic: 3, oct: -1, chords: ['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', 'G', 'Cmaj7', 'Cmaj7'],
            bass: 'r.....f...r...o.', comp: [3, 10],
            melA: "3 - 4 - 6 - 3 - | 2 - - - 7, - 5, - | 7, - 2 - 3 - 5 - | 6 - - - 3 - - .",
            melB: "6 - 5 - 3 - 1 - | 2 - - - 4 - 7, - | 5 - 3 - 2 - 7, - | 1 - - - 3 - 5 - | 6 - - - 4 - 2 - | 7, - 2 - 4 - 5 - | 3 - 2 - 1 - 7, - | 1 - - - - - . ."
        }
    ],
    server: [
        {   // Gentle Climb: minor ninths, the bass on 1, the and of 2 and 3.
            lvl: 0.91, scale: AEOL, chords: ['Am9', 'Fmaj7', 'Cadd9', 'G6', 'Dm9', 'Fmaj7', 'Cadd9', 'Esus4'],
            bass: 'r......r..f.....', comp: [4, 12],
            melA: "5 - 3 - 2 - 3 - | 1 - - - 3 - 5 - | 4 - 3 - 2 - 5, - | 2 - - - 7, - - .",
            melB: "1' - 7 - 5 - 3 - | 5 - - - 3 - 1 - | 2 - 3 - 5 - 7 - | 5 - - - 2' - - - | 1' - - - 6 - 4 - | 3 - 5 - 1' - 7 - | 5 - 3 - 2 - 1 - | 2 - - - - - . ."
        },
        {   // Glide Path: Dorian (the bright sixth), a funky Rhodes on every off-beat.
            lvl: 0.77, scale: DOR, chords: ['Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Am7', 'Esus4'],
            bass: 'r..r..f.r..r..o.', comp: [2, 6, 10, 14],
            melA: "5 - 7 - 1' - 7 5 | 6 - 5 - 4 - 1 - | 5 - 7 - 2' - 1' 7 | 6 - - - 4 - - .",
            melB: "1' - - 7 5 - 3 - | 4 - 6 - 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - - 3' - - - | 3' - 1' - 7 - 5 - | 4' - - - 2' - 7 - | 1' - 5 - 3 - 1 - | 2 - - - 4 - - -"
        }
    ],
    snare: [
        {   // Tiptoe: minor ninths and sus chords, a mallet whispering low, the bass on one and the and of three.
            lvl: 1.14, rest: 1.32, slvl: 0.85, srest: 1.31, scale: AEOL, chords: ['Am9', 'Am9', 'Gsus2', 'Gsus2', 'Fmaj7', 'Fmaj7', 'Esus4', 'Esus4'],
            bass: 'r.......f.......', comp: [6, 14], kick: 'x.......x.......', hush: 0.5, tick: '...o...x...o..o.', cut: 0.8,
            melA: "5 . . . 3 . . . | 1 - - - . . . . | 2 . . . 1 . . . | 5, - - - . . . .",
            melB: "1 . 3 . 5 . 7 . | 5 - - - 3 - - - | 4 . 5 . 2 . 1 . | 2 - - - . . . . | 6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 5 . 4 . 2 . 1 . | 2 - - - 1 - - -"
        },
        {   // Hushed Channel: F major sevenths drifting to a Gsus4 that never lands, a kalimba line kept low.
            lvl: 1.27, rest: 1.26, slvl: 0.85, srest: 1.31, scale: ION, tonic: 3, oct: -1, chords: ['Fmaj7', 'Fmaj7', 'Dm9', 'Dm9', 'Am7', 'Am7', 'Gsus4', 'Gsus4'],
            bass: 'r.....r.........', comp: [10], kick: 'x.....x.........', hush: 0.5, tick: '.o...o...o...x..', cut: 0.8,
            melA: "3 . . . . . 1 . | 6, - - - . . . . | 2 . . . 1 . . . | 2 - - - . . . .",
            melB: "6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 4 . 3 . 2 . 6, . | 1 - - - . . . . | 3 . 5 . 6 . 1' . | 5 - - - 3 - - - | 5 . 4 . 2 . 1 . | 2 - - - 5 - - -"
        }
    ]
},
