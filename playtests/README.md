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

### Packet Snare logs (`playtests/snare/`)

Kept out of the sim's pool (`playtests/*.txt`): they're sessions in the second minigame, not whole games, and would skew
the player profile. Read them with `node tools/playtest-calibrate.js playtests/snare/*.txt` and their `snare` events.

| Log | Played (UTC) | Build | Who | Notes |
|---|---|---|---|---|
| `snare/2026-11-07-owner-snare-1-2.txt` | 18:25 to 18:52 (three sessions) | sessions 1–2 on Packet Snare's first cut; session 3 (from 6 min) on Packet Snare 2 | the owner, iPhone, 8 min, a fresh game via the debug shortcut | one log continued (it replaces `owner-snare-1`). First cut: 7 runs of 15–34 s, 38 loops of 4.6 packets, a best multiplier of 3.2–4.8 every run; 18% of loops spoiled by a corrupt packet, runs with a spoil earning 2.9 DP/s against 4.6 clean. Packet Snare 2: Attention Span ×3 bought first (the cheapest node: 40, 96, 231 DP), then the Laser, Chain Lightning, Sprawl ×2 and Gold Rush; runs of 32 s caught 114–116 packets (from 30–50), 8–9 by chain lightning and 4–7 by laser, and the best multiplier fell to ×1.8–1.95: abilities did the work and big loops stopped mattering. Led to the third pass (a short, hard start) and the fourth (Attention Span dearer and weaker, packets leaving the field on a current) |
| `snare/2026-11-07-owner-snare-6.txt` | 21:36 to 21:56 | Packet Snare 6 | the owner, desktop app, 20 min, debug data | filed trimmed (the opening's inbox spam and the samples). 27 runs of 9–32 s; hauls 13 → 748 Signal; bosses beaten in sectors 1–5 (the Rogue AI from sector 4: up to 135 packets stolen a run); the tree bought out by 16 min; the best loop sat at ×1.2–1.8 while lasers took up to 58 a run. The owner: play felt better, but the upgrades didn't always play the way they were meant to. Led to Packet Snare 7 (a much bigger tree and field, drawn walls, more to place, bosses as the wall) |
| `snare/2026-11-07-brother-snare-6-7.txt` | 22:25 to 22:41 | Packet Snare 6, then 7 from 12.7 min (the artifact was republished mid-session) | the owner's brother, iPhone, 16.5 min (9.4 in the inbox: all 20 nag variants), debug data | filed trimmed. 14 runs of 9–19 s, hauls 22–115 Signal, best loop ×1.2–1.6 every run (big loops never tried); every run wiped 1–16 packets to the boss. On Packet Snare 7: sector 1's boss (1 hit) fell 9 s in, sector 2's (2 hits) 13 s in, then sector 3's boss (4 hits) held: 0–3 hits a run over 6 runs, the wall as intended. Bought Sprawl, the Laser, Chain Lightning, Attention Span, Scrubbers; no walls or tools yet (none affordable that early) |

## Builds

What each build had, newest first (artifact publish times, UTC). A log played on a build has everything below it too.

| Published | Build | What changed |
|---|---|---|
| unpublished (5) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 5**: the hunters are Antivirus; Anchors build your own Firewalls (good packets bounce, Antivirus stunned, the firewall goes down; Hardened Firewalls), no more nets; system Firewalls sweep across the field and snap open wires |
| 2026-11-07 (6) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 6** (review round 1 and the owner's calls): pays Signal, its own currency, and the best haul trickles research; sectors with a boss Antivirus (the Rogue AI from sector 4); the wire grows with the field, a narrow Scanner, Firewalls shield cores and hide their school, wire along them is free, clean first runs; demo cards on first meetings, no instruction lines; the tree rebuilt on the Training tree's parts and re-priced; colours, sounds, achievements |
| 2026-11-07 (7) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 7** (review round 2 and the owner's calls): your Firewalls are walls you draw (corrupt packets bounce, good ones pass); decoys, turrets, scanner towers, freeze and purge from a tool bar; a 49-node tree that pans and zooms; a datacentre-sized field; corrupt packets as red arrowheads and skills to thin them; bosses 1, 2, 4, 6, 9… hits as the wall; tested demos; stealth music for the bay |
| unpublished (4) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 4**: the pipeline flows (a current; packets leave the field downstream), Containment Field and Herders, Attention Span dearer and weaker (+25%, from 90 DP) |
| unpublished (3) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 3**: a short, hard start (Focus 26, faster packets, corrupt ones hiding in the schools); the Rogue AI from the third run (Infection Cores, the Chokehold, the Wall); Anchors and nets |
| unpublished (2) | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare 2**: loops close near their start, a live loop preview, a small quick start, schools, and its own skill tree (Chain Lightning, Scanner, Targeted Laser, Scrubbers, Sprawl) |
| unpublished | branch `claude/optimistic-hamilton-ey00uj` | **Packet Snare**: the Data Pipeline bay opens at Edge Detection (draw loops round data packets for DP; corrupt packets and Firewalls); save v19 |
| 11-07 15:50 | `93424e9` | **Hop reworked**: hold to aim (slow motion, the view leans in, a ring closes on the lip), let go to hop; floaty, clean landings; windows of at least 0.12 s and a 70 ms grace |
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
