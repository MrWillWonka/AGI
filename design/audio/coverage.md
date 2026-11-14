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

| Track | Area | Song | BPM | Bars | Length | Form (bars; n = no drums, s = sparse) | What the overhaul did |
|---|---|---|---|---|---|---|---|
| Classic | lab | Night Survey | 124 | 56 | 1:48 | intro 4s · A 8 · B 8 · A 8 · dub 4n · dub 4s · B 8 · A 8 · out 4s | A kept and given an answering phrase; new B progression and melody; new form |
| Classic | lab | Uptime | 124 | 50 | 1:37 | intro 2s · A 8 · A 8 · B 8 · break 4n · A 8 · B 8 · out 4 | Melodies kept; A now turns through G6, only B takes the E7; new form |
| Classic | server | Overclock | 124 | 54 | 1:45 | intro 4 · A 8 · B 8 · A 8 · break 4n · build 4s · B 8 · A 8 · out 2 | Riff kept with a 16th pick-up; new B progression and melody; new form |
| Classic | server | Packet Storm | 124 | 56 | 1:48 | intro 2s · A 8 · B 8 · A 8 · break 4n · break 4s · A 8 · B 8 · A 4 · out 2 | Hook kept; new B progression and melody (with 16ths); new form |
| Classic | snare | Packet Sniffer | 124 | 48 | 1:33 | in 4 · A 8 · B 8 · A 8 · wait 4 · B 8 · A 8 | Kept; new stealth form |
| Classic | snare | Dead Drop | 124 | 44 | 1:25 | A 8 · B 8 · wait 4 · A 8 · B 8 · A 8 | Kept; new stealth form |
| Dark | lab | Foundry | 130 | 56 | 1:43 | intro 8s · A 8 · A 8 · B 8 · A 8 · strip 4n · A 8 · out 4s | New riff on the flat second (A) and a held line over a pedal (B); club form |
| Dark | lab | Rust | 130 | 44 | 1:21 | intro 4s · A 8 · B 8 · strip 4n · A 8 · B 8 · out 4s | Melodies kept (a slow lab line); new form with a strip-down |
| Dark | server | Warehouse | 130 | 60 | 1:51 | intro 8s · A 8 · A 8 · break 4n · build 4s · drop 8 · B 8 · A 8 · out 4s | Riff kept; its own acid line; breakdown, build and drop |
| Dark | server | Pressure | 130 | 40 | 1:14 | intro 4 · A 8 · B 8 · strip 2n · A 8 · B 8 · out 2 | Riffs kept; its own acid line; new form |
| Dark | snare | Black Box | 130 | 48 | 1:29 | in 4 · A 8 · B 8 · A 8 · wait 4 · B 8 · A 8 | Kept; new stealth form |
| Dark | snare | Tripwire | 130 | 44 | 1:21 | A 8 · B 8 · wait 4 · A 8 · B 8 · A 8 | Kept; new stealth form |
| Soft | lab | Morning Lab | 93 | 52 | 2:14 | intro 4n · A 8 · B 8 · A 8 · breathe 4n · B 8 · A 8 · out 4s | New syncopated A (8 bars); new B through the relative minor and a borrowed iv; new form |
| Soft | lab | Window Seat | 93 | 48 | 2:04 | A 8 · A 8 · B 8 · still 4n · A 8 · B 8 · out 4s | Melodies kept; starts on the tune; a drumless middle; new form |
| Soft | server | Gentle Climb | 93 | 48 | 2:04 | intro 2n · A 8 · B 8 · A 8 · break 4n · B 8 · A 8 · out 2 | Melodies kept; new form |
| Soft | server | Glide Path | 93 | 48 | 2:04 | A 8 · B 8 · A 8 · vamp 4s · B 8 · A 8 · out 4 | Melodies kept; a two-chord vamp; new form |
| Soft | snare | Tiptoe | 93 | 48 | 2:04 | in 4 · A 8 · B 8 · A 8 · wait 4 · B 8 · A 8 | Kept; new stealth form |
| Soft | snare | Hushed Channel | 93 | 44 | 1:54 | A 8 · B 8 · wait 4 · A 8 · B 8 · A 8 | Kept; new stealth form |
| Ominous | lab | Vigil | 62 | 44 | 2:50 | drone 4n · A 8n · A 8s · B 8 · still 4n · A 8 · out 4n | Rewritten for 62 BPM: a four-note cell with bars of silence; new B through a diminished chord |
| Ominous | lab | Static | 62 | 38 | 2:27 | A 8n · B 8s · void 2n · A 8 · B 8 · out 4n | Rewritten for 62 BPM around the fall to the flat second; a two-bar void |
| Ominous | server | Descent | 62 | 50 | 3:14 | intro 4s · A 8 · B 8 · A 8 · void 4n · B 8 · A 8 · out 2n | New A with a pulse to it; B kept; new form |
| Ominous | server | Undertow | 62 | 46 | 2:58 | A 8s · A 8 · B 8 · hold 4n · A 8 · B 8 · out 2n | A kept; B rewritten with triplets; new form |
| Ominous | snare | Crawlspace | 62 | 28 | 1:48 | in 2 · A 4 · B 8 · wait 2 · A 4 · B 8 | Kept, slower; heartbeat re-set for 62 BPM; short through-form |
| Ominous | snare | Lights Out | 62 | 30 | 1:56 | A 4 · B 8 · wait 2 · A 4 · B 8 · A 4 | Kept, slower; short through-form |
| Retro | lab | Pixel Desk | 144 | 54 | 1:30 | intro 4 · A 8 · A 8 · B 8 · A 8 · B 8 · A 8↑2 · turn 2 | Melodies kept; a walking bass; last chorus up a tone |
| Retro | lab | Save Point | 144 | 44 | 1:13 | A 8 · B 8 · A 8 · bridge 4s · B 8 · A 8 | Melodies kept; starts on the tune; a bridge |
| Retro | server | Boss Rush | 144 | 48 | 1:20 | intro 2 · A 8 · B 8 · A 8 · break 4n · B 8 · A 8↑2 · out 2 | Melodies kept; breakbeat and galloping bass; last chorus up a tone |
| Retro | server | Turbo | 144 | 44 | 1:13 | intro 4 · A 8 · B 8 · A 8 · B 8 · A 8↑2 | Melodies kept; breakbeat; last lap up a tone |
| Retro | snare | Sneaking Mission | 144 | 48 | 1:20 | in 4 · A 8 · B 8 · A 8 · wait 4 · B 8 · A 8 | Kept; new stealth form |
| Retro | snare | Hide and Seek | 144 | 44 | 1:13 | A 8 · B 8 · wait 4 · A 8 · B 8 · A 8 | Kept; new stealth form |

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

- Classic, Night Survey (lab), melody A bar 4 beat 1: over Fmaj7
- Classic, Uptime (lab), melody A bar 1 beat 2: over Am7
- Classic, Uptime (lab), melody A bar 3 beat 1: over Dm7
- Classic, Uptime (lab), melody B bar 5 beat 2: over Am7
- Classic, Uptime (lab), melody B bar 7 beat 1: over Dm7
- Classic, Overclock (server), melody A bar 4 beat 1: over Dm7
- Classic, Overclock (server), melody A bar 4 beat 3: over E7
- Classic, Packet Storm (server), melody A bar 4 beat 3: over E7
- Dark, Foundry (lab), melody A bar 4 beat 4: over Am
- Dark, Foundry (lab), melody B bar 1 beat 4: over Am
- Dark, Foundry (lab), melody B bar 7 beat 4: over Am
- Dark, Rust (lab), melody B bar 7 beat 4: over F
- Dark, Rust (lab), melody B bar 8 beat 3: over Bb
- Dark, Warehouse (server), melody A bar 1 beat 4: over Am
- Dark, Warehouse (server), melody A bar 3 beat 1: over F
- Dark, Warehouse (server), melody B bar 1 beat 3: over Am
- Dark, Warehouse (server), melody B bar 2 beat 4: over Am
- Dark, Warehouse (server), melody B bar 5 beat 2: over Am
- Dark, Warehouse (server), melody B bar 5 beat 4: over Am
- Dark, Warehouse (server), melody B bar 7 beat 2: over F
- Dark, Black Box (snare), melody B bar 1 beat 3: over Am
- Dark, Black Box (snare), melody B bar 6 beat 3: over Am
- Soft, Window Seat (lab), melody A bar 1 beat 1: over Dm7
- Soft, Window Seat (lab), melody A bar 1 beat 4: over Dm7
- Soft, Gentle Climb (server), melody A bar 3 beat 3: over Cadd9
- Soft, Gentle Climb (server), melody A bar 1 beat 3: over Dm9
- Soft, Gentle Climb (server), melody B bar 3 beat 1: over Cadd9
- Soft, Gentle Climb (server), melody B bar 7 beat 3: over Cadd9
- Soft, Glide Path (server), melody A bar 3 beat 3: over Am7
- Soft, Glide Path (server), melody A bar 2 beat 1: over G
- Soft, Glide Path (server), melody B bar 3 beat 1: over Am7
- Ominous, Vigil (lab), melody A bar 1 beat 3: over Am
- Ominous, Vigil (lab), melody A bar 5 beat 3: over Dm
- Ominous, Vigil (lab), melody A bar 6 beat 4: over Dm
- Ominous, Static (lab), melody A bar 1 beat 2: over Am
- Ominous, Static (lab), melody A bar 5 beat 2: over Am
- Ominous, Static (lab), melody B bar 3 beat 2: over Am
- Ominous, Descent (server), melody A bar 1 beat 3: over Am
- Ominous, Descent (server), melody A bar 3 beat 3: over Am
- Ominous, Descent (server), melody B bar 7 beat 4: over Bb
- Ominous, Descent (server), melody B bar 8 beat 3: over E7
- Ominous, Undertow (server), melody A bar 2 beat 1: over Am
- Ominous, Undertow (server), melody A bar 4 beat 4: over E7
- Ominous, Undertow (server), melody B bar 1 beat 4: over Am
- Ominous, Undertow (server), melody B bar 5 beat 4: over Am
- Retro, Pixel Desk (lab), melody A bar 4 beat 2: over F
- Retro, Pixel Desk (lab), melody A bar 3 beat 1: over F
- Retro, Pixel Desk (lab), melody B bar 5 beat 2: over C
- Retro, Boss Rush (server), melody A bar 2 beat 4: over F
- Retro, Boss Rush (server), melody B bar 2 beat 3: over F
- Retro, Turbo (server), melody A bar 3 beat 1: over F
- Retro, Turbo (server), melody A bar 3 beat 2: over F
- Retro, Turbo (server), melody A bar 3 beat 4: over F
- Retro, Turbo (server), melody A bar 4 beat 1: over G
- Retro, Turbo (server), melody B bar 5 beat 4: over Am
