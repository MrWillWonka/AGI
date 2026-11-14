# Audio overhaul: review package

For the independent code review, then the listening review. Branch `claude/audio-overhaul`; baseline `0bffe20`
(`claude/ring-build-1`). Nothing here has been listened to by its author: it was written and checked by a model that
cannot hear. Every claim below is a measurement, a test or a code fact, and says which.

## 1. What to review

| Item | Where |
|---|---|
| Full diff against the baseline | `git diff 0bffe20..claude/audio-overhaul` (also `review-out/audio/package/overhaul.diff`) |
| The engine | `sfx.js` (one factory, `build(env)`; the game's is `window.SFX`, tools build `window.SFXBuild({ ctx, offline })`) |
| The five tracks | `music/classic.js`, `dark.js`, `soft.js`, `ominous.js`, `retro.js` (key, profile, levels, meter, instruments, songs, effects) |
| Gameplay timing | `engine.js` `holdClock`; `game.js` `holdable` and `doAction` (the only callers) |
| Tests | `tests/hold-clock.test.js` (9), `tests/audio.test.js` (12): `node --test` |
| Tools | `tools/audio/` (render, survey, calibrate, fx-levels, coverage, package, live-check, measure) |
| Coverage | `design/audio/coverage.md` (30 songs with dispositions, 56 effects × 5 tracks, melody notes for review) |
| Audio | `review-out/audio/package/` (`listen/`, `compare/`, `manifest.json`, `metrics.json`); not in git |
| Status and the owner's calls | `design/audio/STATUS.md` |

## 2. Architecture

**Two clocks.** The game times held jobs with `E.holdClock(startMs)` in engine.js: repeat *k* is due at the press plus
*k* × 241.935 ms (4.1333 a second), anchored to the press, one repeat per callback at most (a stall skips repeats, it
never pays a burst). `holdable` in game.js runs it on `performance.now()` and `setTimeout`. Nothing in it reads the
audio: the only audio call is `SFX.held(null)` on release. `SFX.holdDelay` is gone.

**The bridge.** The game tells the audio what happened, never the reverse: `play(name, opts)`, `held(res)` with each
repeat it pays, `musicState(intensity, mode)`, `setArea`, `setDepth`, `setTraining`, `charge(level)`, `swell()`.

**Clicks keep the music's grid (the owner's call, replacing the brief's immediate unpitched tick).** A tap's sound
waits for the track's grid: the coarsest division no longer than a 16th at 124 BPM (`tapMul`), so no tap waits more
than 121 ms in any track. While a job is held, `held` keeps a part alive that plays the job's click figure on the
track's own subdivision (`holdDiv`, default the division nearest an 8th at 124): 4.13 notes a second in Classic and
Ominous, 4.33 in Dark, 3.10 in Soft, 4.80 in Retro. It is accompaniment, not a ledger: it needn't be a note a repeat.
It schedules at most 80 ms ahead and stops on release or 400 ms after the last repeat, so nothing plays on.

**Music transport.** One clock (`clock`: step *n* at `t0 + (n − n0) × len`), a 16th at the current song's tempo.
`music.bpm` comes from the song or the track. A new song's tempo starts on its first beat with no glide (`music.jump`);
flow and bullet time glide the step length about a bar each way; neither touches the game. Changing track fades the
old one (60 ms) and starts the new one on a beat at its own tempo (`setMusicStyle` → `stopMusic`; the game's next
`musicState` starts it): never two grooves at once. Changing room switches song on the next bar, or the next beat when
a bar is longer than two seconds, and remembers an entry point to come back to. After a stall or a hidden tab the
scheduler skips the steps it missed instead of scheduling them.

**Songs are data.** `buildSong` turns a definition into progressions (voiced), bass and comp patterns, melodies of any
whole number of bars (with triplets), and a form: sections with their melody, chords, drum mask (`full`, `sparse`,
`none`), bass on or off, lift, key change, entry points and fills. A song that fails validation is reported with its
track, area, number and name, and left out; the others play. Playlists are the arrays' real length.

**Layers.** Progress and speed give one number; each track maps it to its own parts at its own thresholds (`layers`),
each fading over a band. The harmony line has a continuous gain and avoids semitones against the chord (`harmNote`).

**Voices.** `note(t, n, dur, gain, o)`: waveform or pulse width, filter and filter envelope, attack then either a
pluck or a held note (`sus`, `dec`, `rel`), FM, vibrato, glide, pan, sends. `perc`, `kick`, `hat`, `clap`, `pad`,
`riser`. Every source is counted; a voice marked `low` is dropped while more than 120 are sounding (70 on phones).

**Mixer.** Effects → `master` → a gentle compressor; music → `out` → `duck` (a set dip under eight big moments);
both → a limiter (threshold −1.5 dB, ratio 20, 2 ms attack, its make-up gain removed after it) → speakers. Each track
has one reverb (a generated impulse) and one delay line per bus, reached through sends. Dark's tones pump on its kick.

**Pitch policy.** Effects are written in A minor pentatonic and moved into the track's key. While music plays, a note a
semitone from a tone of the sounding chord takes that tone (`fit`), except in Dark and Ominous (`pitch: 'key'`: the
rub is their sound) and for the sounds meant to rub (`TENSE`). The sprint meter plays the chord itself.

**Faults.** A sound or a step that throws is caught, counted and reported (`SFX.faults`; the console for the first
three, or all with `window.AGI_AUDIO_DEBUG`); tools collect every one. No empty catches remain in the scheduler or `play`.

## 3. Commands

```bash
node --test                                    # 597 tests, about 4 s
node tools/audio/live-check.js                 # the game in headless Chromium: holds pay the same in nine audio states
node tools/audio/survey.js <label>             # every song and standard moment, rendered and measured
node tools/audio/calibrate.js <style>          # a track's gain, beat balance and song levels
node tools/audio/fx-levels.js <style>          # its single effects and meter parts against Classic's
node tools/audio/coverage.js                   # design/audio/coverage.md
node tools/audio/package.js                    # review-out/audio/package (clips, manifest, metrics)
node tools/audio/render.js run --style soft    # one timeline; presets: song, build, hold, run, stress, effects
```

Needs Playwright with Chromium (as the review tools) and FFmpeg (`winget install --id Gyan.FFmpeg`). Renders are the
production engine on an `OfflineAudioContext`, its schedulers stepped every 21.3 ms of render time.

## 4. Results (commit in `metrics.json`)

**Gameplay invariance (tests, blocking).** A 60 s hold pays 248 repeats and a 10 min hold 2,480; callbacks up to 30 ms
late change nothing; a 2 s stall pays one repeat when it ends and skips the rest; the same trace is identical in every
audio configuration because the clock takes no audio input (asserted on the source too). In the browser a 3,050 ms
hold paid 13 (the press and 12 repeats) with sound and music on, all sound off, music off, simple sounds, and in each
of the five tracks. Not tested: flow, freeze and crunch against a hold in the live game (they are only set in the run
view, where no job can be held; the clock ignores them by construction).

**Scheduling and lifecycle (tests).** No drum of any kind in a section with no drums, in every section of all 30
songs; simple sounds too. After a 45 s stall, one tick schedules less than 0.6 s worth of notes and none in the past.
The held figure is evenly on the grid at each track's rate and nothing is struck more than 150 ms after release. A tap
waits at most 121.5 ms in any track. A hundred track and room changes leave the music running at the right tempo.
Not tested in a real browser: tab hide and show, audio interruptions, memory and CPU over time.

**Levels (FFmpeg, default sliders).** All 30 songs sit between −34.38 and −33.58 LUFS integrated through their forms:
the level the game had before (the baseline's music was −32 to −35). Drums 2 dB under the tones in Classic, Dark and
Retro, about 3.5 in Soft and 4 in Ominous (a choice). Stress timeline, four seeds per track: hottest true peak
−4.21 dBTP, no NaN, infinity or clipped sample. New effects within about 1 dB of Classic's same effect; meter parts
within about 1 dB of the mean of Classic's four. Two renders of one timeline differ by rounding only (about 130 dB
under the peak), not bit for bit.

**Coverage.** 30 of 30 songs have a new form and a recorded disposition; 5 of 5 tracks have their own tempo, layer
order, space and instruments; Dark, Soft, Ominous and Retro each write all eight power-up effects (Retro already had
one) and four meter parts. See `coverage.md` for what is still shared on purpose.

## 5. Not done, not tested, known issues

- **Nobody has listened.** Groove, tune, fatigue and whether five tracks at five tempos feel like one game are open.
- **The loudness target is open.** The game sits at about −34 LUFS at default sliders; the brief suggested −18.
  One number (`MUSIC_MAKEUP`, with the effects' `master`) moves it once the owner chooses.
- **Browsers:** everything was run in headless Chromium on Windows. Firefox, Safari and iOS are untested. To check
  one: open the game, Settings → Track, hold a Workbench job in each track, change rooms; `SFX.faults` in the console
  should stay at 0. The limiter and the convolver are the nodes most likely to differ.
- **Phones:** the long reverb (Ominous, 3.2 s) and the electric piano's two oscillators a note are the costliest
  parts; voice caps exist but real-device CPU is unmeasured. Phone speakers: the low subs are unchanged.
- **Hold lag:** with the reward no longer moved to the beat, a held job's sound trails its number pop by a fixed part
  of a beat for that hold.
- **Simple sounds** keep one plain version of each song (kick, bass, a held tone, the melody) at each track's tempo;
  their levels were not re-calibrated (they measure −32 to −35.5 LUFS).
- **Sound effects other than the power-ups** are the old ones in each track; Packet Snare's are unchanged. Their trims
  were measured before the overhaul.
- **The melody review list** in `coverage.md` (55 notes) has not been acted on: most are ninths and passing tones.
- **Offline against live:** not compared by recording a live context. The offline path runs the same functions; the
  differences are the timer (render time against `setInterval`) and clean-up of faded nodes (kept until the render ends).
- `music/<theme>/notes.txt` and `music/opportunities.txt` describe the tracks before the overhaul.

## 6. For the listening review (Carbon)

Send `listen/` first, labelled as in `manifest.json`, then `compare/` (the same training run before and after at one
loudness: comparison copies, gained, not production level). Give the code and this file only after a first response.
The brief's question for the reviewer is in the owner's plan, section 9.
