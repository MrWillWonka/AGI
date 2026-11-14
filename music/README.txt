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

SIX SONGS, NOT ONE SONG SIX TIMES (the owner's call, 2026-11-14: inside a theme the songs sounded alike)
  Kept as they were: Uptime, Overclock, Morning Lab, Vigil, Lights Out, Pixel Desk, Hide and Seek. The other 23 were
  rewritten so that a theme's songs differ in the things that made them one song: tempo, meter, drum pattern, lead
  voice, home note, phrase length and running time. A song may now set
    bpm, swing     its own tempo and swing (Classic runs 98 to 136, Ominous 50 to 92)
    steps, pulse   16ths in a bar (12: 3/4 or 6/8; 14: 7/8; 20: 5/4; 12 with pulse 3: a shuffle) and in a beat
    kit            its own kick, snare and hat patterns, a character a step ('x', 'o' softer, 'O' an open hat)
    lead           one of the theme's other lead voices; bassVoice, compVoice, reese, march, rock: other parts
    scale, tonic   another home on the theme's own notes (D Dorian, E Phrygian, F Lydian…), so the sound effects,
                   which stay in the theme's key, still fit
  and its progressions and melodies need not be four or eight bars. design/audio/coverage.md lists every song's
  tempo, meter, lead, length and form; tests/audio.test.js holds each theme to the spread.

WHAT EVERY TRACK SHARES
  Its own tempo  Classic 124 BPM, Dark 130, Soft 93 (with swing), Ominous 62, Retro 144, unless a song sets its own.
               The game's income never follows it: held jobs pay 4.13 times a second in every track (engine.js, holdClock).
  The grid     The music schedules on the track's clock, and every sound effect waits for its grid (never longer
               than 121 ms). While a job is held its click figure plays on the track's own subdivision, so it is
               not a note a repeat everywhere (about three a second in Soft, nearly five in Retro).
  One key each Songs and effects are written in A and moved into the track's key. While music plays, an effect's
               note a semitone from the sounding chord moves onto it, except in Dark and Ominous, whose sound is
               the rub, and for sounds that are meant to rub (errors, warnings, near misses).
  A song       Chord progressions, bass lines, melodies and a form: sections that say which of those they play, for
               how many bars, with how much of the drum kit. Each song has its own form.
  It builds    Progress and the run's speed add up to how many parts play; each track brings its parts in in its
               own order (the keys before the kick in Soft, the tune first in Retro, drums last in Ominous).
  The beat     Plays only while training (the owner's call; a policy switch in the engine, not a rule of it).
  Space        Each track has its own room and delay (Retro: none), reached through sends; music and effects are in
               stereo. Everything meets at a limiter.
  Mood         One filter over the music opens with speed. A crunch distorts it, flow and bullet time slow and
               muffle it, a breakthrough is a swell into a crash. The big moments dip the music a little.
  Stealth      Packet Snare's songs are each track gone quiet until you're spotted.
  Simple mode  Every song stripped to a kick, a bass on 1 and 3, one held chord tone and the melody; every
               effect a one-to-three-note figure; no room, no stereo.
  Levels       Measured with FFmpeg (tools/audio): every song within half a dB of the others at the game's level;
               each new effect and meter part within about 1 dB of Classic's.
  Faults       A sound that fails is reported (SFX.faults), never swallowed.
