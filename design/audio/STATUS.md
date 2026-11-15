# Audio overhaul: status

Branch `claude/audio-overhaul` (a worktree), from `0bffe20` on `claude/ring-build-1`. The brief is the owner's
"IncrementAI — full audio overhaul" plan (2026-11-14), with the owner's later calls below. Nothing is published.

## The owner's calls (2026-11-14, after the plan)

- **Income keeps its rate; the music keeps its grid.** Held jobs pay 4.1333 times a second on the game's clock at
  every tempo. Click sounds stay pitched and on the song's grid, at the song's own subdivision, so in a slower or
  faster song they don't line up one for one with the repeats. (This replaces the plan's immediate unpitched tick.)
- **Tempos by feel.** Exact alignment with the income interval is not needed. A compatible tempo (93, 62, 165.33:
  124 × ¾, ½, 4/3) is used where it costs nothing.
- **One listening checkpoint** after Classic and Soft, before Dark, Ominous and Retro.
- **Deliverables:** a few minutes of Classic and Soft for the checkpoint; 60–90 s per theme plus short interaction and
  transition clips for the Carbon review; original PCM kept locally for measurements; the 15–20 minute fatigue check
  is the owner playing the game (no long renders).
- **Tools:** FFmpeg is the meter (installed, 9.0.2). GPT-6 Astra reviews the code; Gemini 4 Carbon and RoEx Mix Check
  Studio get clips the owner uploads by hand. Nothing is sent out from here.

## Done

| Milestone | What | Evidence |
|---|---|---|
| 0 Baseline | Worktree; every caller of the audio engine inventoried; the old music measured | `design/audio/baseline-survey.json` (60 renders at `ae…`: the commit after milestone 2, musically the old engine) |
| 1 Time separation | `E.holdClock` in engine.js times held jobs; `SFX.holdDelay` is gone; `SFX.held(res)` plays the held figure on the music's grid; the tab-return burst is fixed (the scheduler skips missed steps) | `tests/hold-clock.test.js` (9 tests); `node tools/audio/live-check.js` (13 payments in a 3,050 ms hold in nine audio states) |
| 2 Audition tools | `SFXBuild(env)` builds the engine on an OfflineAudioContext; `tools/audio/` renders timelines of game events and measures them with FFmpeg; audio faults are reported, never swallowed | `node tools/audio/render.js run --style soft`; `node tools/audio/survey.js <label>` |
| 3a Themes as files | Each track's songs, instruments and effects live in `music/<theme>.js`, built by sfx.js | 25 renders identical to the baseline (0.00 LU), 70 renders with no fault |

| 3b The music system | Tempo per track and song; forms and playlists as data (`form` on a song: sections with their melody, chords, bass, drum mask, lift, entry points); layers per track (`layers`); swing and triplets; sends (reverb from a generated impulse, a feedback delay) and stereo; voices with held envelopes, FM and pulse widths (`note`); a music/effects mixer with ducking under big moments and a limiter; voices counted, decoration dropped first; a song that can't be built is reported and left out; changing track fades out and restarts on a beat; area changes on a beat in slow songs | The five old tracks on the new engine: music within 0.2 LU of the baseline, effects within 0.07, 70 renders with no fault, stress peaks under -1.2 dBTP |
| 4a Classic and Soft | Rewritten on it (music/classic.js, music/soft.js): Classic 124 BPM straight dub (real delay line, held bass, vibrato lead, its own layer order and forms, B progressions, three fills); Soft 93 BPM with swing (FM electric piano, kalimba with an inharmonic pluck, two-step kick that arrives last, rim, shakers, a room), its own forms, a borrowed chord in Morning Lab | `node tools/audio/calibrate.js classic` (and `soft`): every song within 0.4 LU of -34; survey `m4b`: 28 renders, no fault |

| 4b Dark, Ominous, Retro | Dark 130 BPM (the tones pump on the kick, acid lines per song, club forms with a breakdown and a drop); Ominous 62 BPM (a drone, a 3.2 s hall, a bell and a knock that land irregularly, drums only at the peak, triplets); Retro 144 BPM (pulse widths, a walking triangle bass, a breakbeat, the last chorus up a tone) | `calibrate.js`: all 30 songs within 0.4 dB of each other; 70 renders, no fault |
| 4c Effects | The eight power-up effects written for Dark, Soft and Ominous (Retro's seven); four sprint-meter parts each; levelled against Classic's (`fx-levels.js`); a pitch policy (effects fit the sounding chord, except Dark, Ominous and the sounds meant to rub) | `fx-levels.js`: within about 1 dB |
| 5 Checks | `tests/audio.test.js`: the real scheduler on a stand-in AudioContext (drum masks, stall, held figure, tap wait, a hundred switches, validation); taps never wait longer than at 124 BPM; coverage matrix | `node --test`: 597 tests; `design/audio/coverage.md` |
| 6 Review package | `design/audio/REVIEW-PACKAGE.md`; `node tools/audio/package.js` → `review-out/audio/package/` (26 clips, manifest, metrics) | 30 songs −34.38 to −33.58 LUFS; stress peaks ≤ −4.21 dBTP over 20 runs; no bad sample; no fault |

The owner continued past checkpoint 1 ("Yes, carry on") before reporting on the clips: Classic and Soft are still
unheard by anyone, like the other three.

## Commands

```bash
node --test                                   # 583 tests, about 3 s
node tools/audio/live-check.js                # the game in headless Chromium: holds pay the same in every audio state
node tools/audio/render.js run --style soft   # one timeline to review-out/audio/*.wav, with its measurements
node tools/audio/survey.js <label> [--quick]  # everything, measured: review-out/audio/<label>/survey.json
node tools/audio/measure.js file.wav          # LUFS, true peak, range, crest, mono
node tools/audio/calibrate.js <style>         # what a track's gain, beat and song levels should be
```

Presets: `song`, `build`, `hold`, `run`, `stress`, `effects` (tools/audio/presets.js).

## Found on the way

- At the default sliders the music measures about **-32 to -35 LUFS** integrated, far below the plan's suggested
  -18. Raising it 15 dB would change how loud the game is for everyone; the target is the owner's call (open).
- By FFmpeg's integrated loudness, Dark and Ominous sit about 2 dB above Classic, Soft and Retro. The old trims
  matched them by a different method (peak 100 ms of 17 effects, two intensities).
- With the hold on the game's clock, a held job's sound trails its number pop by a fixed part of an 8th note (it
  used to be the reward that moved to the beat). Expected from the separation; say if it reads as lag.

## Next (superseded: see below)

After the checkpoint: Classic and Soft effects and sprint-meter parts, then Dark, Ominous and Retro (music, effects),
then the production pass (levels against the agreed target, phone translation, simple mode, performance) and the
review package.

## The variety pass (the owner's first listen, 2026-11-14)

The owner's verdict on the album: the themes are distinct from each other, but inside a theme the six songs sound too
alike, with similar running times and predictable phrasing. Liked as they are, and left untouched: **Uptime, Overclock,
Morning Lab, Vigil, Lights Out, Pixel Desk, Hide and Seek**. The other 23 were rewritten.

- **Why they sounded alike (code facts):** every song of a theme shared one tempo, one drum pattern, one lead, bass and
  chord voice and one home note; nearly every progression was eight bars and every section four or eight; forms were
  the same shape (Soft had four songs of exactly 124 s).
- **What a song can now set:** `bpm`, `swing`, `steps` (meter: 3/4, 6/8, 7/8, 5/4, a 12-step shuffle), `kit` (its own
  kick, snare and hat patterns), `lead` and other part voices the theme offers, another home on the theme's notes, and
  phrases of any length. The engine counts bars by the song's `steps`; nothing else about the clocks changed.
- **The spread now** (`design/audio/coverage.md`): each theme has at least five different pulses, two or more meters,
  three or more lead voices, phrases of 3, 5, 6 or 7 bars, and running times from under a minute to two or three
  (Classic 0:56–2:39, Dark 1:01–2:24, Soft 1:06–2:53, Ominous 0:57–3:17, Retro 0:45–1:30). `tests/audio.test.js` holds
  every theme to it.
- **Not known:** whether any of it sounds good. The new voices and songs were written and measured, not heard.

### The owner's second listen (2026-11-14)

"Retro is a complete do over as it's really grating on the ears, and soft should be more soft and smooth, same songs
changing as last time." Read as: the same songs change (Pixel Desk, Hide and Seek and Morning Lab stay as they are).

- **Retro's four, done over.** What was harsh, from the code: Save Point's triangle played an octave up and reached E7;
  Boss Rush hammered 16ths at 176 on two detuned raw squares; every pulse was unfiltered. Now a song can be `mellow`
  (pulses through a 2.2 kHz filter, quieter hats, snare and arpeggio, no echo voice); the triangle lead plays at the
  written octave; the detuned pair is gone and a filtered square (`soft`) replaces it; tempos came down (96, 152, 132,
  108); the tunes sit in the middle register and move in 8ths.
- **Soft's five, softened.** Slower (88, 100, 104; Tiptoe and Hushed Channel as they were); no four-on-the-floor kick
  and no clave of rims; the plucked guitar is replaced by keys that swell in (`warm`); the flute lost its breath noise
  and speaks slower, at the written octave; the glass bell came down an octave with a gentler strike; Glide Path's tune
  is hummed (`hum`); the electric piano lead is rounder.
- Still not heard by its author.

### The owner's third listen (2026-11-14)

"Both retro and soft are way too punchy, soft and smooth should be very silky and buttery while retro just needs to be
way more understated." Then: "soft and smooth should try to have no attacks or drums, it should all be done through
harmonies and things and easy moving notes. Very dreamlike without the harsh bells and mallets, more orchestral."
Applied to both themes whole, the liked songs included (their notes are untouched; their sound follows the theme).

- **Soft is an orchestra with no drums.** Its `step` plays no kick, hat, rim, tick or fill, and nothing struck or
  plucked: a string section holds each chord through the bar and overlaps the next, upper strings breathe in on the
  comp steps, a low string holds the bass, and the tune is sung legato (every note swells in over up to 0.18 s) by
  strings (Morning Lab), a flute, a horn, a hum, a clarinet or a choir. A longer hall (2.8 s). The songs' kits, hushed
  kicks and ticks are gone from the data. The Beat slider and the beat-while-training rule do nothing in this track.
  Its simple version still has a kick: not changed, open.
- **Soft's effects follow** (the owner's yes): every tone swells in (12 ms for the shortest, 20–50 ms otherwise) and
  lasts at least a tenth of a second; the marimba's and bell's strike partials are gone; noise is 3 dB quieter, capped
  at 3.5 kHz and eased in. Power-up effects re-measured against Classic's (within 0.4 dB after re-trimming crunch and
  viral); the Packet Snare effects' trims and the simple sounds were not re-measured.
- **Retro is understated.** Every pulse goes through a filter (3 kHz, 2 kHz in the mellow songs) and speaks 6 ms
  slower; the kick is half as loud and starts lower (130 Hz, was 220); snare and hats sit at 0.6 (0.45 mellow); the
  arpeggio stays in 8ths; fills are a third as loud; the master filter tops out at 7.7 kHz (was 14). Boss Rush is 138
  (152), Turbo 120 (132). Measured: the drums are 14 dB under the tones (9 before), peaks 3–6 dB lower, and the track
  is left about 1.5 dB under the others on purpose.
- Still not heard by its author.

## Open questions for the owner

1. The loudness target at default sliders (see above).

## Where it stands

The implementation is through milestone 6. What is left is not code: the owner's listening, the independent code
review (GPT-6 Astra), the listening review (Gemini 4 Carbon) and RoEx Mix Check Studio on the clips, then revisions
from what they find. Open decisions and untested cases are in `REVIEW-PACKAGE.md`, section 5. Not merged, not published.
