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

| Log | Who | Notes |
|---|---|---|
| `2026-11-07-owner.txt` | the owner, desktop, 43 min, v1.0 to Reasoning | ~11.9K CP added by debug at 7 min; a 6 min pause on the server room |
