# Audio coverage

Written by `node tools/audio/coverage.js` from the engine and the theme files. Do not edit by hand.

## Tracks

| Track | BPM | Swing | Held-job notes a second | Effects' pitch | Layer order (first to last) | Space |
|---|---|---|---|---|---|---|
| Classic | 124 | straight | 4.13 | fitted to the chord | **kick**, **bass**, pad, mel, off, clap, sixteenth, harm, arp | reverb 1.3 s, delay 3 steps, width 0.8 |
| Dark | 130 | straight | 4.33 | the track's key (tension kept) | **kick**, **bass**, pad, off, clap, sixteenth, mel, arp, harm | reverb 0.5 s, delay 3 steps, width 0.5 |
| Soft | 93 | 20% of a 16th | 3.10 | fitted to the chord | **keys**, **pad**, bass, mel, off, kick, harm, clap, sixteenth, arp | reverb 2.8 s, delay 4 steps, width 1 |
| Ominous | 62 | straight | 4.13 | the track's key (tension kept) | **bass**, **pad**, mel, off, knock, harm, kick, clap, sixteenth, arp | reverb 3.2 s, delay 6 steps, width 1 |
| Retro | 144 | straight | 4.80 | fitted to the chord | **mel**, **bass**, **kick**, pad, off, clap, harm, sixteenth, arp | width 0.6 |

Bold layers are always in. Income is 4.13 repeats a second in every track (engine.js `holdClock`).

## Songs (30)

| Track | Area | Song | Tempo | Meter | Lead | Bars | Length | Form (bars; n = no drums, s = sparse) | What the overhaul did |
|---|---|---|---|---|---|---|---|---|---|
| Classic | lab | Night Survey | 104 | 4/4 | glass, own kit | 38 | 1:28 | in 2 · A 7 · B 5 · A2 7 · still 3n · B2 5 · A3 7 · out 2s | Variety pass: rewritten as slow dub in D Dorian, half-time, glass-bell lead, phrases of 6 and 5 bars |
| Classic | lab | Uptime | 124 | 4/4 | the track's | 50 | 1:37 | intro 2s · A 8 · A 8 · B 8 · break 4n · A 8 · B 8 · out 4 | Kept (the owner likes it) |
| Classic | server | Overclock | 124 | 4/4 | the track's | 54 | 1:45 | intro 4 · A 8 · B 8 · A 8 · break 4n · build 4s · B 8 · A 8 · out 2 | Kept (the owner likes it) |
| Classic | server | Packet Storm | 128 | 4/4 | sing, own kit | 62 | 1:56 | intro 4s · A 8 · A2 8 · B 8 · A 8 · bridge 6s · B 8 · B2 8↑2 · out 4↑2 | Variety pass: rewritten as electro in E Phrygian, broken kick, plucked 16th riff, 4- and 6-bar phrases |
| Classic | snare | Packet Sniffer | 75 | 6/8 | pluck, own kit | 35 | 0:56 | in 2 · A 6 · B 6 · A 6 · wait 3 · B 6 · A 6 | Variety pass: rewritten in 6/8, muted plucks, 6-bar phrases |
| Classic | snare | Dead Drop | 124 | 7/8 | pad, own kit | 38 | 1:04 | A 4 · A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 · A 4 | Variety pass: rewritten in 7/8, a soft lead, a chord a bar |
| Dark | lab | Foundry | 112 | 4/4 | bell, own kit | 37 | 1:19 | ask 5 · ask 5 · tinker 6 · ask 5 · hum 3n · tinker 6 · ask 5 · out 2s | Variety pass: rewritten half-time in D minor: reese bass, struck-metal lead, no acid line |
| Dark | lab | Rust | 104 | 7/8 | siren, own kit | 40 | 1:21 | trial 4s · A 7 · B 5 · A 7 · void 2n · B 5 · A 7 · out 3s | Variety pass: rewritten nearly beatless: drone bass, a sliding voice, phrases of 5 and 7 bars |
| Dark | server | Warehouse | 140 | 4/4 | the track's | 84 | 2:24 | intro 8s · groove 8 · A 8 · A 8 · break 8n · build 4s · drop 16 · B 8 · A 8 · out 8s | Variety pass: melodies and acid line kept; faster; a club form with a 16-bar drop |
| Dark | server | Pressure | 126 | 12/8 | glow, own kit | 44 | 1:24 | ignition 4s · cruise 4 · A 4 · A 4 · B 6 · A 4 · coast 2n · B 6 · A 4↑2 · A 4↑2 · out 2↑2 | Variety pass: rewritten as a 12-step shuffle: square stabs in 3-bar phrases, a triplet acid line |
| Dark | snare | Black Box | 108 | 4/4 | bell, own kit | 35 | 1:18 | in 2 · A 6 · B 6 · wait 3 · A 6 · B 6 · A 6 | Variety pass: rewritten slower, struck metal in 6-bar phrases |
| Dark | snare | Tripwire | 100 | 5/4 | stab, own kit | 20 | 1:00 | A 4 · B 3 · wait 2 · A 4 · B 3 · A 4 | Variety pass: rewritten fast in G Dorian, broken kick, square stabs |
| Soft | lab | Morning Lab | 92 | 4/4 | oboe | 42 | 1:50 | in 2 · A 8 · B 6 · A2 8 · still 2 · B2 6 · A3 8 · out 2 | Reimagined: 72, violins in long notes, the choir from the middle eight, a cello inside the last verse |
| Soft | lab | Window Seat | 104 | 5/4 | flute | 41 | 1:58 | A 8 · B 6 · A2 8 · still 3 · B 6 · A 8 · out 2 | Third listen: a slow waltz, no drums, strings and a flute |
| Soft | server | Gentle Climb | 76 | 4/4 | horn | 52 | 2:44 | intro 4 · A 8 · A2 8 · B 8 · still 4 · B2 8 · A3 8 · out 4 | Reimagined: 76, the chord rolling in 8ths, a horn climbing, the choir on the high tune; the long one |
| Soft | server | Glide Path | NaN | 16 steps | oo | 48 | 2:00 | intro 4 · A 8 · B 8 · A2 8 · B2 8 · B3 8↑2 · out 4 | Reimagined: 60, voices carry the tune over a held bass, 4- and 6-bar phrases |
| Soft | snare | Tiptoe | 66 | 3/4 | clarinet | 32 | 1:27 | in 2 · A 4 · A2 4 · B 8 · wait 2 · A3 4 · B2 8 | Reimagined: in three at 66, a clarinet asks and a flute answers over a cello |
| Soft | snare | Hushed Channel | 80 | 4/4 | choir | 22 | 1:06 | A 5 · B 5 · wait 2 · A 5 · B 5 | Third listen: a lullaby in F Lydian, 5-bar phrases, held strings and a choir |
| Ominous | lab | Vigil | 62 | 4/4 | the track's | 44 | 2:50 | drone 4n · A 8n · A 8s · B 8 · still 4n · A 8 · out 4n | Kept (the owner likes it) |
| Ominous | lab | Static | 72 | 4/4 | bell | 38 | 2:07 | dial 2n · A 7n · B 5s · A2 7 · still 2n · B2 5 · A3 7s · out 3n | Variety pass: rewritten with no pulse, heard from E (Phrygian dominant), the tune tolled on a bell, phrases of 7 and 5 bars |
| Ominous | server | Descent | 92 | 4/4 | choir, own kit | 35 | 1:31 | A 4s · A 4 · B 6 · A 4 · A 4 · void 2n · B 6 · A 4 · out 1n | Variety pass: rewritten as a march: bowed low strings, a limping kick, voices, 4- and 6-bar phrases |
| Ominous | server | Undertow | 53 | 6/8 | the track's, own kit | 46 | 1:44 | off 2s · A 6s · A2 6 · B 8 · A3 6 · coast 2n · B2 8 · A4 6↑2 · out 2s↑2 | Variety pass: rewritten in 6/8 over a rocking arpeggio, phrases of 6 and 8 bars |
| Ominous | snare | Crawlspace | 80 | 5/4 | pizz | 19 | 1:11 | A 5 · B 4 · wait 1 · A2 5 · B2 4 | Variety pass: rewritten for a music box, faster, 5-bar phrases |
| Ominous | snare | Lights Out | 62 | 4/4 | the track's | 30 | 1:56 | A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 | Kept (the owner likes it) |
| Retro | lab | Pixel Desk | 144 | 4/4 | the track's | 54 | 1:30 | intro 4 · A 8 · A 8 · B 8 · A 8 · B 8 · A 8↑2 · turn 2 | Kept (the owner likes it) |
| Retro | lab | Save Point | 100 | 3/4 | tri, own kit | 28 | 0:50 | A 10 · B 6 · A 10 · turn 2 | Done over twice: a lullaby in three, the triangle low and plain, no kick; a short loop |
| Retro | server | Boss Rush | 132 | 4/4 | soft, own kit | 62 | 1:53 | intro 4 · A 8 · A 8 · B 6 · A 8 · road 4s · B 6 · A 8↑2 · A 8↑2 · out 2↑2 | Done over twice: D Dorian, a riff in 8ths on a filtered square in the middle register, 4- and 6-bar phrases |
| Retro | server | Turbo | 120 swung | 4/4 | the track's | 40 | 1:20 | intro 2 · A 8 · B 6 · A 8 · B 6 · A 8↑2 · out 2↑2 | Done over twice: an easy shuffle in G Mixolydian, the top filtered off; three short laps |
| Retro | snare | Sneaking Mission | 108 | 5/4 | soft, own kit | 32 | 1:29 | in 2 · A 4 · B 4 · A 4 · wait 2 · B 4 · A 4 · B 4 · A 4 | Done over twice: 5/4 (3 + 3 + 2 + 2), a filtered square, never high |
| Retro | snare | Hide and Seek | 144 | 4/4 | the track's | 44 | 1:13 | A 8 · B 8 · wait 4 · A 8 · B 8 · A 8 | Kept (the owner likes it) |

## Effects (56 names)

"own": written for the track. "shared": Classic's notes through the track's profile (an intended reuse where listed below). Simple sounds have one plain version of every effect in every track.

| Effect | Classic | Dark | Soft | Ominous | Retro |
|---|---|---|---|---|---|
| click | the design | own | own | own | own |
| buy | the design | own | own | own | own |
| buyBig | the design | own | own | own | own |
| snareCatch | own | own | own | own | own |
| snareSpoil | own | own | own | own | own |
| snareSnap | own | own | own | own | own |
| snareLaser | own | own | own | own | own |
| snareChain | own | own | own | own | own |
| snareSweep | own | own | own | own | own |
| snareCharge | own | own | own | own | own |
| snareBoss | own | own | own | own | own |
| snareHit | own | own | own | own | own |
| snarePlace | own | own | own | own | own |
| snareRemove | own | own | own | own | own |
| snarePower | own | own | own | own | own |
| snareZap | own | own | own | own | own |
| snareDecoy | own | own | own | own | own |
| snareQuarantine | own | own | own | own | own |
| snareStun | own | own | own | own | own |
| snareCore | own | own | own | own | own |
| snareBossDown | own | own | own | own | own |
| snareParry | own | own | own | own | own |
| snareSlash | own | own | own | own | own |
| snareSpoof | own | own | own | own | own |
| snareGarbage | own | own | own | own | own |
| snareRace | own | own | own | own | own |
| snareHijack | own | own | own | own | own |
| snareTaken | own | own | own | own | own |
| snareFlag | own | own | own | own | own |
| snareIds | own | own | own | own | own |
| snareRebuild | own | own | own | own | own |
| snareHerdStun | own | own | own | own | own |
| claim | the design | own | own | own | own |
| error | the design | own | own | own | own |
| sprint | the design | own | own | own | own |
| clean | the design | own | own | own | own |
| perfect | the design | own | own | own | own |
| system | the design | own | own | own | own |
| breakthrough | the design | own | own | own | own |
| smash | the design | own | own | own | own |
| windup | the design | own | own | own | own |
| launch | the design | own | own | own | own |
| land | the design | own | own | own | own |
| summit | the design | own | own | own | own |
| nearMiss | the design | own | own | own | own |
| runEnd | the design | own | own | own | own |
| record | the design | own | own | own | own |
| crunch | the design | own | own | own | own |
| flow | the design | own | own | own | own |
| freeze | the design | own | own | own | own |
| release | the design | own | own | own | own |
| viral | the design | own | own | own | own |
| achievement | the design | own | own | own | own |
| phase | the design | own | own | own | own |
| ship | the design | own | own | own | own |
| ui | the design | own | own | own | own |

Sprint meter: Classic plays the four shared parts; Dark, Soft, Ominous, Retro have four parts of their own each.

### Intended reuse

- Dark: none: every effect is its own.
- Soft: none: every effect is its own.
- Ominous: none: every effect is its own.
- Retro: none: every effect is its own.

## Melody notes for review

A note an 8th or longer that starts on a beat a semitone away from a tone of its chord (and isn't one). Some are meant (Dark's and Ominous's flat seconds); none is changed automatically.

- Classic, Uptime (lab), melody A bar 1 beat 2: over Am7
- Classic, Uptime (lab), melody A bar 3 beat 1: over Dm7
- Classic, Uptime (lab), melody B bar 5 beat 2: over Am7
- Classic, Uptime (lab), melody B bar 7 beat 1: over Dm7
- Classic, Overclock (server), melody A bar 4 beat 1: over Dm7
- Classic, Overclock (server), melody A bar 4 beat 3: over E7
- Dark, Warehouse (server), melody A bar 1 beat 4: over Am
- Dark, Warehouse (server), melody A bar 3 beat 1: over F
- Dark, Warehouse (server), melody B bar 1 beat 3: over Am
- Dark, Warehouse (server), melody B bar 2 beat 4: over Am
- Dark, Warehouse (server), melody B bar 5 beat 2: over Am
- Dark, Warehouse (server), melody B bar 5 beat 4: over Am
- Dark, Warehouse (server), melody B bar 7 beat 2: over F
- Ominous, Vigil (lab), melody A bar 1 beat 3: over Am
- Ominous, Vigil (lab), melody A bar 5 beat 3: over Dm
- Ominous, Vigil (lab), melody A bar 6 beat 4: over Dm
- Retro, Pixel Desk (lab), melody A bar 4 beat 2: over F
- Retro, Pixel Desk (lab), melody A bar 3 beat 1: over F
- Retro, Pixel Desk (lab), melody B bar 5 beat 2: over C
