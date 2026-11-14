# Audio coverage

Written by `node tools/audio/coverage.js` from the engine and the theme files. Do not edit by hand.

## Tracks

| Track | BPM | Swing | Held-job notes a second | Effects' pitch | Layer order (first to last) | Space |
|---|---|---|---|---|---|---|
| Classic | 124 | straight | 4.13 | fitted to the chord | **kick**, **bass**, pad, mel, off, clap, sixteenth, harm, arp | reverb 1.3 s, delay 3 steps, width 0.8 |
| Dark | 130 | straight | 4.33 | the track's key (tension kept) | **kick**, **bass**, pad, off, clap, sixteenth, mel, arp, harm | reverb 0.5 s, delay 3 steps, width 0.5 |
| Soft | 93 | 20% of a 16th | 3.10 | fitted to the chord | **keys**, **pad**, bass, mel, off, kick, harm, clap, sixteenth, arp | reverb 1.2 s, delay 4 steps, width 1 |
| Ominous | 62 | straight | 4.13 | the track's key (tension kept) | **bass**, **pad**, mel, off, knock, harm, kick, clap, sixteenth, arp | reverb 3.2 s, delay 6 steps, width 1 |
| Retro | 144 | straight | 4.80 | fitted to the chord | **mel**, **bass**, **kick**, pad, off, clap, harm, sixteenth, arp | width 0.6 |

Bold layers are always in. Income is 4.13 repeats a second in every track (engine.js `holdClock`).

## Songs (30)

| Track | Area | Song | Tempo | Meter | Lead | Bars | Length | Form (bars; n = no drums, s = sparse) | What the overhaul did |
|---|---|---|---|---|---|---|---|---|---|
| Classic | lab | Night Survey | 98 | 4/4 | glass, own kit | 65 | 2:39 | intro 6n · A 6s · A 6 · B 5 · A 6 · drift 5n · B 5 · A 6 · B 5 · A 6 · A 6s · out 3n | Variety pass: rewritten as slow dub in D Dorian, half-time, glass-bell lead, phrases of 6 and 5 bars |
| Classic | lab | Uptime | 124 | 4/4 | the track's | 50 | 1:37 | intro 2s · A 8 · A 8 · B 8 · break 4n · A 8 · B 8 · out 4 | Kept (the owner likes it) |
| Classic | server | Overclock | 124 | 4/4 | the track's | 54 | 1:45 | intro 4 · A 8 · B 8 · A 8 · break 4n · build 4s · B 8 · A 8 · out 2 | Kept (the owner likes it) |
| Classic | server | Packet Storm | 136 | 4/4 | pluck, own kit | 41 | 1:12 | A 4 · A 4 · B 6 · A 4 · A 4 · break 3n · B 6 · A 4 · A 4 · out 2 | Variety pass: rewritten as electro in E Phrygian, broken kick, plucked 16th riff, 4- and 6-bar phrases |
| Classic | snare | Packet Sniffer | 75 | 6/8 | pluck, own kit | 35 | 0:56 | in 2 · A 6 · B 6 · A 6 · wait 3 · B 6 · A 6 | Variety pass: rewritten in 6/8, muted plucks, 6-bar phrases |
| Classic | snare | Dead Drop | 124 | 7/8 | pad, own kit | 38 | 1:04 | A 4 · A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 · A 4 | Variety pass: rewritten in 7/8, a soft lead, a chord a bar |
| Dark | lab | Foundry | 100 | 4/4 | bell, own kit | 50 | 2:00 | intro 4s · A 4 · A 4 · B 6 · A 4 · strip 2n · B 6 · A 4 · A 4 · B 6 · A 4 · out 2s | Variety pass: rewritten half-time in D minor: reese bass, struck-metal lead, no acid line |
| Dark | lab | Rust | 76 | 4/4 | siren, own kit | 42 | 2:13 | A 5n · A 5s · B 7 · A 5 · void 3n · B 7 · A 5 · A 5n | Variety pass: rewritten nearly beatless: drone bass, a sliding voice, phrases of 5 and 7 bars |
| Dark | server | Warehouse | 140 | 4/4 | the track's | 84 | 2:24 | intro 8s · groove 8 · A 8 · A 8 · break 8n · build 4s · drop 16 · B 8 · A 8 · out 8s | Variety pass: melodies and acid line kept; faster; a club form with a 16-bar drop |
| Dark | server | Pressure | 126 | 12/8 | stab, own kit | 38 | 1:12 | intro 3 · A 3 · A 3 · A 3 · B 4 · A 3 · A 3 · strip 2n · B 4 · A 3 · A 3 · A 3 · out 1 | Variety pass: rewritten as a 12-step shuffle: square stabs in 3-bar phrases, a triplet acid line |
| Dark | snare | Black Box | 108 | 4/4 | bell, own kit | 35 | 1:18 | in 2 · A 6 · B 6 · wait 3 · A 6 · B 6 · A 6 | Variety pass: rewritten slower, struck metal in 6-bar phrases |
| Dark | snare | Tripwire | 150 | 4/4 | stab, own kit | 38 | 1:01 | A 4 · A 4 · B 8 · wait 2 · A 4 · A 4 · B 8 · A 4 | Variety pass: rewritten fast in G Dorian, broken kick, square stabs |
| Soft | lab | Morning Lab | 93 swung | 4/4 | the track's | 52 | 2:14 | intro 4n · A 8 · B 8 · A 8 · breathe 4n · B 8 · A 8 · out 4s | Kept (the owner likes it) |
| Soft | lab | Window Seat | 104 | 3/4 | flute, own kit | 52 | 1:30 | A 8 · A 8 · B 6 · A 8 · still 4n · B 6 · A 8 · out 4s | Variety pass: rewritten as a waltz: flute lead, guitar on two and three |
| Soft | server | Gentle Climb | 116 | 4/4 | ep, own kit | 72 | 2:29 | intro 4s · A 8 · A 8 · B 8 · break 4n · build 4s · B 8 · A 8 · B 8 · A 8 · out 4 | Variety pass: melodies kept; soft house, straight, the electric piano leads; the long one |
| Soft | server | Glide Path | 120 | 4/4 | guitar, own kit | 36 | 1:12 | A 4 · A 4 · B 8 · A 4 · vamp 4 · B 8 · A 4 | Variety pass: melodies kept; a bossa on the clave, nylon guitar; short |
| Soft | snare | Tiptoe | 84 swung | 4/4 | glass | 36 | 1:43 | in 2 · A 4 · A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 | Variety pass: rewritten as a slow shuffle, glass bell, a chord a bar |
| Soft | snare | Hushed Channel | 80 | 4/4 | ep | 22 | 1:06 | A 5 · B 5 · wait 2 · A 5 · B 5 | Variety pass: rewritten as a lullaby in F Lydian, 5-bar phrases, no struck chords |
| Ominous | lab | Vigil | 62 | 4/4 | the track's | 44 | 2:50 | drone 4n · A 8n · A 8s · B 8 · still 4n · A 8 · out 4n | Kept (the owner likes it) |
| Ominous | lab | Static | 50 | 4/4 | bell | 41 | 3:17 | A 7n · B 5n · void 2n · A 7s · B 5 · A 7 · B 5s · out 3n | Variety pass: rewritten with no pulse, heard from E (Phrygian dominant), the tune tolled on a bell, phrases of 7 and 5 bars |
| Ominous | server | Descent | 92 | 4/4 | choir, own kit | 35 | 1:31 | A 4s · A 4 · B 6 · A 4 · A 4 · void 2n · B 6 · A 4 · out 1n | Variety pass: rewritten as a march: bowed low strings, a limping kick, voices, 4- and 6-bar phrases |
| Ominous | server | Undertow | 46 | 6/8 | the track's, own kit | 51 | 2:13 | A 6s · A 6 · B 8 · hold 3n · A 6 · A 6 · B 8 · A 6 · out 2n | Variety pass: rewritten in 6/8 over a rocking arpeggio, phrases of 6 and 8 bars |
| Ominous | snare | Crawlspace | 88 | 4/4 | box | 21 | 0:57 | A 5 · B 5 · wait 1 · A 5 · B 5 | Variety pass: rewritten for a music box, faster, 5-bar phrases |
| Ominous | snare | Lights Out | 62 | 4/4 | the track's | 30 | 1:56 | A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 | Kept (the owner likes it) |
| Retro | lab | Pixel Desk | 144 | 4/4 | the track's | 54 | 1:30 | intro 4 · A 8 · A 8 · B 8 · A 8 · B 8 · A 8↑2 · turn 2 | Kept (the owner likes it) |
| Retro | lab | Save Point | 100 | 3/4 | tri, own kit | 24 | 0:43 | A 8 · B 6 · A 8 · turn 2 | Variety pass: rewritten as a lullaby in three, triangle lead, no kick; a short loop |
| Retro | server | Boss Rush | 176 | 4/4 | fat | 72 | 1:38 | intro 2 · A 4 · A 4 · B 6 · A 4 · A 4 · break 4n · B 6 · A 4 · A 4 · B 6 · A 4 · A 4↑2 · A 4↑2 · B 6↑2 · A 4↑2 · out 2 | Variety pass: rewritten faster in D Dorian, a hammered 16th riff on two squares, 4- and 6-bar phrases; the long one |
| Retro | server | Turbo | 152 swung | 4/4 | the track's | 33 | 0:52 | intro 1 · A 4 · A 4 · B 4 · A 4 · B 4 · A 4↑2 · B 4↑2 · A 4↑2 | Variety pass: rewritten as a shuffle in G Mixolydian with a boogie bass; three short laps |
| Retro | snare | Sneaking Mission | 116 | 5/4 | the track's, own kit | 32 | 1:23 | in 2 · A 4 · B 4 · A 4 · wait 2 · B 4 · A 4 · B 4 · A 4 | Variety pass: rewritten in 5/4 (3 + 3 + 2 + 2) |
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
- Dark, Foundry (lab), melody A bar 2 beat 3: over Dm
- Dark, Foundry (lab), melody B bar 1 beat 4: over Gm
- Dark, Foundry (lab), melody B bar 3 beat 4: over Dm
- Dark, Warehouse (server), melody A bar 1 beat 4: over Am
- Dark, Warehouse (server), melody A bar 3 beat 1: over F
- Dark, Warehouse (server), melody B bar 1 beat 3: over Am
- Dark, Warehouse (server), melody B bar 2 beat 4: over Am
- Dark, Warehouse (server), melody B bar 5 beat 2: over Am
- Dark, Warehouse (server), melody B bar 5 beat 4: over Am
- Dark, Warehouse (server), melody B bar 7 beat 2: over F
- Soft, Gentle Climb (server), melody A bar 3 beat 3: over Cadd9
- Soft, Gentle Climb (server), melody A bar 1 beat 3: over Dm9
- Soft, Gentle Climb (server), melody B bar 3 beat 1: over Cadd9
- Soft, Gentle Climb (server), melody B bar 7 beat 3: over Cadd9
- Soft, Glide Path (server), melody A bar 3 beat 3: over Am7
- Soft, Glide Path (server), melody B bar 3 beat 1: over Am7
- Ominous, Vigil (lab), melody A bar 1 beat 3: over Am
- Ominous, Vigil (lab), melody A bar 5 beat 3: over Dm
- Ominous, Vigil (lab), melody A bar 6 beat 4: over Dm
- Ominous, Static (lab), melody A bar 1 beat 4: over E
- Retro, Pixel Desk (lab), melody A bar 4 beat 2: over F
- Retro, Pixel Desk (lab), melody A bar 3 beat 1: over F
- Retro, Pixel Desk (lab), melody B bar 5 beat 2: over C
