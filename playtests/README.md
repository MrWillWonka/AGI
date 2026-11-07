# Playtest logs

Real players' logs (Journal → Settings → **Playtest log**, copied and saved here as a `.txt`). They set up the balance
sim, so balance is checked against how people actually play rather than a bot's guess.

```bash
node tools/playtest-calibrate.js playtests/*.txt
```

That prints what each log measured: time split, clicks a second, prompt and full-charge rates, the pause between runs, the
skill timeline, and debug jumps. To save the pooled profile the sim reads by default:

```bash
node tools/playtest-calibrate.js playtests/*.txt --json > playtests/profile.json
```

The profile pools the logs as their mean (`sim`) and median (`simMedian`), each log weighted the same. To run the sim as
each player, the pooled ones and the old bot, over several seeds:

```bash
node tools/sim-variants.js --seeds 1,2,3,42 --minutes 70 --maxskill 8
```

Add every new log and regenerate the profile; the more players, the better the spread. Logs with debug jumps (flagged)
still count for behaviour, but their banks and timings after the jump aren't the player's own.

**Read every log against the build it was played on.** Features land fast, so a log from the morning says nothing
about a mechanic added that afternoon (and a complaint in it may already be fixed). From 2026-11-07 15:02 UTC each log
carries its build (`build:` in the header and in the session events, from `E.BUILD` in engine.js, bumped with every
publish), and the calibrator prints it. Older logs are placed below by when they began.

| Log | Played (UTC) | Build | Who | Notes |
|---|---|---|---|---|
| `2026-11-07-owner.txt` | 11-06 23:59 to 11-07 00:42 | before the playtest fixes (save v16, about commit `6622041`) | the owner, desktop, 43 min, v1.0 to Reasoning | six-skill act one; ~11.9K CP added by debug at 7 min; a 6 min pause on the server room |
| `2026-11-07-owner-2.txt` | 01:55 to 02:15 | after the earned server-room gate (save v17, about `570fa76`) | the owner, desktop, 20 min, a fresh game to Edge Detection | no debug; six-skill act one; 70% of the time in the lab, 2.75 clicks/s, prompts only 23% |
| `2026-11-07-owner-3-4.txt` | 14:33 to 15:33 (four sessions) | sessions 1–2 (to 22 min) on leg characters (`2b8eafe`, 14:32); session 3 (22–35 min, from 15:03) on Hop + the lab badge (`0f83076`, 15:02); session 4 (from 15:17) on the build stamp (15:08) | the owner, iPhone, 52 min, a fresh game to General AI (37.1 min) | no debug; the third log continued (the same game, so one file: it replaces `owner-3`). Hop used 17 times from 22 min: 6 clean, 4 good, 7 flagged; the owner found the timing practically impossible (on a phone the window was 4–12 px and 25–135 ms), which the 15:50 build reworks. The sim as this player reaches General AI at 49–58 min (real 37): it neither replays legs nor hops, and its lab share is 58% |

## Builds

What each build had, newest first (artifact publish times, UTC). A log played on a build has everything below it too.

| Published | Build | What changed |
|---|---|---|
| 11-07 15:50 | this build | **Hop reworked**: hold to aim (slow motion, the view leans in, a ring closes on the lip), let go to hop; floaty, clean landings; windows of at least 0.12 s and a 70 ms grace |
| 11-07 15:08 | `2bbdfe2` | Playtest logs carry their build (`E.BUILD`) |
| 11-07 15:02 | `0f83076` | Exploits: the Exploit button and **Hop**; the run card's Lab button only with news, with a count badge |
| 11-07 14:32 | `2b8eafe` | Server Cluster and the Training Data Pipeline wait for Pattern Matching |
| 11-07 14:29 | `f4abec2` | **Leg characters** (Rolling, Sprint, Long flats, Marathon, Cliffs) and **Inertia** |
| 11-07 04:49 | `3ec94f1` | Camera language: four moves, no zoom pumping near skill hills |
| 11-07 04:00–04:23 | `cad36c6`–`bee34e8` | Twenty spam variants in the opening, The IT Department's Favorite; achievement toasts back |
| 11-07 03:58 | `67986a7` | Demo: act two locked behind a gate; the demo ends at General AI |
| 11-07 03:52 | `0a18c33` | **Act one doubled** to twelve real skills (save v18) |
| 11-07 02:30–03:22 | `82db610`–`4561e19` | Playtest 2 fixes: fair breakthroughs, free task sliders, lab nudges, tips with pun buttons, leg lanes replay runs |
| 11-07 01:33 | `d3f05a7` | Server room gate counts CP and DP earned |
| 11-07 00:01–01:25 | `dfcad77`–`16186d5` | Notifications in place, the opening inbox, dilemmas (save v16), the Auto-Trainer ghost and endings (save v17), round E |
