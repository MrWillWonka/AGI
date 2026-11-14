// Retro: its six songs. A copy from sfx.js, taken 2026-11-14; reference only (the game plays sfx.js).
// Notation: ../shared/notation.js. Notes on the writing: notes.txt.
//   lab: Pixel Desk, Save Point
//   server: Boss Rush, Turbo
//   snare: Sneaking Mission, Hide and Seek

// ---- SONGS.retro (sfx.js lines 1668-1707) ----
retro: {
    lab: [
        {   // Pixel Desk: I – V – vi – IV, a square lead with its echo channel.
            lvl: 0.89, scale: ION, tonic: 3, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
            melA: "1 - 3 - 5 - 3 - | 2 - 5, - 7, - 2 - | 3 - 1 - 6, - 1 - | 4 - 3 - 2 - - .",
            melB: "5 - 5 - 6 - 5 - | 4 - 2 - 7, - 5, - | 1 - 3 - 6 - 5 - | 4 - 6 - 1' - - - | 1' - 7 - 5 - 3 - | 2 - 4 - 7 - 5 - | 6 - 4 - 1 - 4 - | 5 - - - 7, - 2 -"
        },
        {   // Save Point: IV – I – V – vi, gentle.
            lvl: 0.91, scale: ION, tonic: 3, chords: ['F', 'C', 'G', 'Am', 'F', 'C', 'Dm', 'G'],
            melA: "6 - 5 - 4 - 1 - | 3 - 2 - 1 - 5, - | 7, - 2 - 5 - 4 - | 3 - - - 2 - - .",
            melB: "1' - 6 - 4 - 6 - | 5 - 3 - 1 - 3 - | 2 - 7, - 2 - 4 - | 3 - 6 - 1' - - - | 1' - 6 - 5 - 4 - | 3 - 5 - 1' - 5 - | 4 - 6 - 2' - 1' - | 7 - - - 5 - - -"
        }
    ],
    server: [
        {   // Boss Rush: A minor, a 16th-note riff, the chords arpeggiated.
            lvl: 0.87, scale: AEOL, chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'E5'],
            melA: "1 1 5 1' . 7 5 3 | 1 1 6 1' . 6 5 3 | 7, 7, 2 5 . 4 2 7, | 5, 5, 7, 2 . 5 2 7,",
            melB: "1' - 7 - 1' - 3' - | 1' - 6 - 5 - 3 - | 2' - 1' - 7 - 5 - | 7 - 5 - 2 - - - | 1' - 5 - 1' - 3' - | 1' - 3' - 6 - 1' - | 4' - 3' - 2' - 6 - | 5 - - - 7 - 2' -"
        },
        {   // Turbo: Dorian's raised sixth over D, a race to the finish.
            lvl: 0.89, scale: AEOL, chords: ['Am', 'Am', 'C', 'D', 'Am', 'Am', 'F', 'G'],
            melA: "1' . 1' . 5 . 7 1' | . 1' 7 5 . 3 5 . | 5 . 5 . 3 . 5 1' | #6 . 5 . 4 - - .",
            melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 3' . 1' . 5 . 3 . | #6 . 4 . 1' . #6 . | 5 . 1' . 3' . 2' . | 1' . 7 . 5 - - . | 6 . 1' . 3' . 1' . | 2' . 7 . 5 . 2' ."
        }
    ],
    snare: [
        {   // Sneaking Mission: an 8-bit infiltration: a triangle bass tiptoeing, a pulse creeping up the A minor.
            lvl: 1.39, rest: 1.29, slvl: 0.91, srest: 1.27, scale: AEOL, chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'Esus4'],
            bass: 'r...f...r...f.o.', walk: true, kick: 'x.......x.......', hush: 0.5, tick: '..x...x...x...x.', cut: 0.85,
            melA: "1 . 1 . . . 3 . | 5, . . . . . . . | 6 . 6 . . . 1' . | 5 - - - . . . .",
            melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 6 . 1' . 3' . 1' . | 2' - - - 7 - - - | 1' . 1' . 7 . 5 . | 3 . 5 . 1' - - - | 6 . 4 . 6 . 1' . | 2' - - - 1' - - -"
        },
        {   // Hide and Seek: A minor seen from C, sus chords that never land, a pulse peeking out and back.
            lvl: 1.44, rest: 1.51, slvl: 0.85, srest: 1.29, scale: ION, tonic: 3, chords: ['Am', 'Am', 'Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gsus4', 'Gsus4'],
            bass: 'r.....r...o.....', walk: true, kick: 'x.....x.........', hush: 0.5, tick: 'o...x...o...x.o.', cut: 0.85,
            melA: "6, . . 1 . . . . | 2 - - - . . . . | 6, . . 1 . . . . | 2 - - - 5, . . .",
            melB: "3 . 1 . 6, . 1 . | 3 - - - 2 - - - | 1 . 3 . 5 . 3 . | 6, - - - . . . . | 4 . 6 . 1' . 6 . | 4 - - - 2 - - - | 1 . 2 . 5 . 2 . | 1 - - - 5, - - -"
        }
    ]
}
