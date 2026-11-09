# Playtests that help the review rounds most

The bot that measures pacing is fitted to the owner's own play (`tools/review/calibrate-snare.js`). It has one 10-minute
phone session so far, so the late game and desktop play are guesses. Ten to fifteen minutes each:

1. **Desktop, from the start** (sectors 1–6): a fresh Packet Snare (debug → Reset Packet Snare), mouse.
2. **Phone, the middle** (sectors 6–10): debug → Go to sector 6 → **Playtest from this sector** (loads the build a
   player has there), then play on.
3. **The boss, either screen**: Go to sector 5 → Playtest from this sector, a few attempts (the log now records why
   each loop or bubble failed).

Then Settings → Playtest log → copy, and paste it into the session. Claude files it in `playtests/snare/` and runs
`node tools/review/calibrate-snare.js playtests/snare/*.txt` (and `--screen desktop` for desktop logs).
