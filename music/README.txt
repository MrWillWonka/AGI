MUSIC AND SOUND EFFECTS, by theme
=================================
This folder is the source: the game loads music/<theme>.js (index.html), and sfx.js, the engine, builds each
track from it. There are no audio files. Everything is synthesised in the browser with Web Audio, so a "track"
is data (songs) plus code (instruments), and a "sound effect" is a few lines of code.

WHAT IS HERE
  classic.js  dark.js  soft.js  ominous.js  retro.js
                        one live file per theme: its key, profile and levels, its instruments (style), its six
                        songs and the sound effects written for it
  <theme>/notes.txt     what went into the track and its effects (written against the tracks as they were on
                        2026-11-14, before the overhaul)
  opportunities.txt     where the tracks and effects could go next (the same date)
  ../sfx.js             the engine: how a song is written ("Songs"), the voices, the grid, the mixer
  ../tools/audio/       renders and measurements (FFmpeg); ../design/audio/STATUS.md is the overhaul's status

THE SONGS
  Theme     Lab                        Server room                 Packet Snare
  Classic   Night Survey, Uptime       Overclock, Packet Storm     Packet Sniffer, Dead Drop
  Dark      Foundry, Rust              Warehouse, Pressure         Black Box, Tripwire
  Soft      Morning Lab, Window Seat   Gentle Climb, Glide Path    Tiptoe, Hushed Channel
  Ominous   Vigil, Static              Descent, Undertow           Crawlspace, Lights Out
  Retro     Pixel Desk, Save Point     Boss Rush, Turbo            Sneaking Mission, Hide and Seek

WHAT EVERY TRACK SHARES (the considerations behind all five)
  One clock    124 BPM, 4/4, sixteen steps a bar. The music schedules on it and every sound effect waits for
               its next 16th (big stingers and held clicks the next 8th), so nothing is ever out of time.
               Holding a job repeats on the 8ths: 242 ms, 4.13 clicks a second, which is part of the
               game's pacing.
  One key each Songs and effects are all written in A and moved into the track's key, so every effect is in
               the track's key. Effects use five-note scales, which keeps them safe most of the time.
               They follow the scale, not the chord: only the sprint meter reads the chord the music is
               on. So an effect can still rub against a chord (in Classic, a G against the G sharp of
               E7 at the end of Uptime, Overclock and Packet Storm; in Soft, an F against the E of Am7).
               Whether that matters depends on the chord, the register and how long the note lasts.
  A song       An eight-bar chord progression, a bass pattern, the chords' rhythm, a four-bar melody (A) and
               an eight-bar one (B), and a level trim.
  The form     Eight bars a section: intro, A, B, A, a breakdown, B, A with a harmony a third below, out.
               The breakdown is drums out for its first six bars: kick, clap, hats, shakers, rim and
               the stealth tick (the hats used to play through it; fixed in sfx.js on 2026-11-14). Two minutes, then the area's other song. Changing rooms changes song on the
               next downbeat; coming back picks the song up at the section it left.
  It builds    Progress through the game and the run's speed add up to how many parts play, each fading in:
               kick and bass always, then chords, off-beat hats, the melody, a clap, 16th hats, the harmony,
               the arpeggio. A new game in the lab is a kick and a bass; the owner wanted it to start very
               simple and leave room for runs to grow it.
  The beat     Plays only while training (the owner's call). Everywhere else the music is its tones.
  Mood         One filter over the whole mix opens with speed. A crunch distorts it, flow and bullet time
               slow and muffle it, a breakthrough is a swell into a crash.
  Stealth      Packet Snare's songs are each track gone quiet: a hushed kick of their own, a clock tick, a
               half-closed filter, sus chords that don't resolve, until you're spotted and the beat drops in.
  Simple mode  Every song stripped to a kick, a bass on 1 and 3, one held chord tone and the melody; every
               effect a one-to-three-note figure.
  Variation    No effect plays the same way twice running: each play moves the figure by 0, +1, -1 or +2
               scale degrees and recolours its noise. Buys have three or four figures per panel.
  Jobs         Compute, data and research each have their own instrument in every track.
  Panels       Buying sounds different per panel, in every track.
  Levels       Every track and its effects were matched to Classic with a K-weighted loudness meter (close to
               how LUFS meters hear), within about 1 dB. In every track the drums sit 2 dB under the tones.
               Clicks clear the music by 6 dB or more in their own frequency bands.
  Output       Sound effects and music meet in one gentle compressor (threshold -18 dB, ratio 6). Everything
               is mono and dry: there is no stereo, no reverb and no real delay (echoes are written as
               repeated notes).
  Phones       Data's click is quieter and darker on touch screens; Dark's rumble is filtered up so small
               speakers can play it; iOS's silent switch and interruptions are handled.
