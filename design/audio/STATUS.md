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

## Commands

```bash
node --test                                   # 583 tests, about 3 s
node tools/audio/live-check.js                # the game in headless Chromium: holds pay the same in every audio state
node tools/audio/render.js run --style soft   # one timeline to review-out/audio/*.wav, with its measurements
node tools/audio/survey.js <label> [--quick]  # everything, measured: review-out/audio/<label>/survey.json
node tools/audio/measure.js file.wav          # LUFS, true peak, range, crest, mono
```

Presets: `song`, `build`, `hold`, `run`, `stress`, `effects` (tools/audio/presets.js).

## Found on the way

- At the default sliders the music measures about **-32 to -35 LUFS** integrated, far below the plan's suggested
  -18. Raising it 15 dB would change how loud the game is for everyone; the target is the owner's call (open).
- By FFmpeg's integrated loudness, Dark and Ominous sit about 2 dB above Classic, Soft and Retro. The old trims
  matched them by a different method (peak 100 ms of 17 effects, two intensities).
- With the hold on the game's clock, a held job's sound trails its number pop by a fixed part of an 8th note (it
  used to be the reward that moved to the beat). Expected from the separation; say if it reads as lag.

## Next

3b. The music system: tempo per track and song, forms and playlists as data, layer policy per track, swing and
triplet placement, sends (delay, reverb), stereo, a music/effects mixer with a limiter, envelopes with sustain,
voice accounting. Then Classic and Soft rewritten on it, and the listening checkpoint.

## Open questions for the owner

1. The loudness target at default sliders (see above).
