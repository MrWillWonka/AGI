# Packet Snare: known issues

Reviewers read this before playing. For each **open** issue, say whether it's still there (and only add to it if you see
something new about it); for each **fixed: verify**, say whether the fix holds. Then spend your time on what isn't here.
Tag every issue in your review: `[new]`, `[known K#]` or `[regression]`. Issues the owner has ruled on are in
`settled.md`; questions waiting on the owner are in `decisions.md` (don't argue them in your top issues).

Update this file with every fix batch (move fixed ones to *fixed: verify*, drop them after a review confirms them).

## Open
- **K6 A maxed field is cluttered:** 1,400 small packets, helpers, lasers and labels; the player's own bubble is hard to
  find (rounds 7–9).
- **K17 Sector 11's nets do nothing in the fight** (the field is swallowed, so a net has nothing to wipe: 0 netted in
  every fight) (round 10; the owner: after the next log).
- **K20 Screens, smaller:** the HUD is small and far from the field at 1920 and 4K; a sideways Look out card shows a line
  or two before Start covers it; at 360 × 640 a tree popup can clip its effect line; an UPDATING label clips at the
  field's edge (round 10).

## Fixed: verify
- **F30 (K22) Demos were too short to read** (the owner, 2026-11-10: longer, a beat before and after, bubbles a bit
  bigger round packets): every demo now opens on 0.8 s of its field as set up with nothing happening (the before), and
  holds at least 1.2 s after its payoff lands (the after); each demo's length is measured from when its payoff lands
  (4.0–5.0 s, was 3.2 for all). Bubbles meant to go round packets are held about half a second longer, so they end up
  plainly round them (Lasso, Unreadable, Chain, Scrubbers, Freeze, Supernova, Floodgate's three, Pulse, Backpressure,
  Infinite Loop, Collector). The mines and Defuse demos show their mines in the before. Under reduced motion a demo
  shows a still of its after. A test holds every demo to the before and after.
- **F29 (K7) Grabbing a mine with a quick bubble often missed, and the boss popped the grab bubble:** the owner's call
  (Snare 18.1): **a loop drawn round a mine disables it** (a bubble no longer takes one), and **a disabled mine is
  flung like a slingshot**: press on it, pull back away from where it should go, let go. The further the pull, the
  faster it flies (full speed at a fifth of the field's shorter side), and while it's pulled a band and a dashed aim
  line show where it will fly, bounces included (solid to the boss when it would hit). The mine's 5 s clock holds while
  it's pulled; a pull too short says `> pull back further`. No wire is drawn while pulling, so nothing can snap it.
  Until the first fling, `> pull back · let go` and a pull-back gesture show on a disabled mine. The bot (`snare-boss.js`)
  does the same damage as before (same sectors fall). Check it on a phone: the loop round a mine, then the pull.
- **F28 (K5) The boss's two loops were hard to read:** LOOP n/2 shows large over the boss until the 3.5 s window to
  loop it again runs out, with a ring draining round it, and in the middle of the fight's health bar; a loop after the
  window says `> too slow · back to loop 1/2`, and a loop round a boss that's already stunned says
  `> it's stunned · slash it` (it said LOOPS ARE FOR THE BOSS mid-fight).
- **F27 (K19) Sector 12's goal (843K) was a wall:** the goal curve (×2.45 a sector) took a step on boss sectors too, so
  every sector after a boss asked ×6 the one before; boss sectors now take none: 9 asks 23K, 10 57K, 12 140K, 13 344K.
  The bot clears a sector every 8–10 minutes from 9 to 15 (it took 42–45 runs on 12). Check sectors 9 and 12 by hand.
- **F26 (K14) The boss's demo showed the old fight:** it plays the 17.5 fight (BOSS INCOMING, the swallow, two loops,
  the stun, slashes) with the fight's overlay (the warning, the health bar and its clock) drawn over it.
- **F25 (K21) Colour-blind readability:** shape cues, always on: unreadable packets a hollow eye, gold a light rim, a tag
  a dotted edge that meets at the tip; checked in all five themes with simulated deuteranopia and protanopia.
- **F24 (K18) The desktop tree panned an unbought root out of view:** a pan for a new node keeps every unbought root in
  frame (zooming out if they don't fit), and a remembered view that hides one is corrected when the tree opens; Kernel
  Panic (and Root Access and Riposte after it) waits for the frontier to reach the first boss's sector.
- **F23 (K16) The fight's readouts:** the clock's seconds sit on the health bar's right the whole fight ("27 s LEFT");
  the boss's health shows once (the bar: not in the HUD's row, not under the boss, not on SLASH pops); an escape's end
  card is headed BOSS ESCAPED, says the health it left with, and no longer blames a garbled bubble.
- **F22 (K15) A bank shot without Ricochet said BANK SHOT ×1:** it says MINE HIT unless the bounces added damage.
- **F21 (K14, in part) The mines demo showed a mine sat against the boss:** a mine out in the arena, grabbed with a
  bubble and thrown as a puck that banks off the bottom edge into the boss; no reach ring is drawn in the fight (the
  cards are one line, the copy pass).
- **F20 (K13) Focus drained in the "paused" fight:** while the boss comes and fights, a snap or a spoil costs 2 s of the
  fight clock (−2 s CLOCK under the fight bar) and Focus holds; a parry breaks the mine shield while the boss reels (SHIELD DOWN).
- **F19 (K12) Debug Boss now** brings the boss in now (its warning starts at once).
- **F18 (K11) The bay bar's crumbs overlapped on sideways phones:** in Packet Snare's bay the crumbs keep their width and
  the HUD's slot takes the rest; checked at 360 to 1920 px wide, between runs, in a run and with Go deeper up.
- **F16 (K9, round 10: holds; its regression is F18) The Signal chip took a row of its own:** the HUD and the Signal chip live in the bay's bar, so the field gains
  38 px on every screen; the bar keeps its height when a run starts; on phones mid-run the bar is the HUD's row. Checked
  at 360 to 3840 px wide with banks of 0 to 987.6B: one row, no overlap (a 360 px phone with a 987.6B bank wraps
  Upgrades to a second row).
- **F11 Red didn't feel dangerous** (no spoil in 15 runs): red can hunt a held bubble, a testing toggle (off by default).
- **F7 (K1) Late-game snowball:** sector pay +15% a sector (was +25%), sector 6's goal 1,300 with later goals ×2.25 from
  it, nodes on ring 4 and out ×1.75 (the drones' and turrets' first levels and the nodes on the way kept). The pacing
  sweep: sectors 6–12 take 5, 5, 5, 6, 1 (boss), 7 runs; the tree is bought out at 35–38 minutes (was 25–28).
- **F8 (K2) Sector 3's goal 185** (was 200): a median 8 runs for the person-paced bot (was 9–10); kept above the 2–7
  target on purpose (`targets.json` known miss, at most 10).
- **F9 (K4) The tree's branch names sit in a frame round the view**, outside the nodes, and level pills keep about 10 px
  on screen at any zoom; Fit leaves the frame out and zooms out to 0.3, so a grown tree fits 1280 × 800 (D8).
- **F1 Sideways cards** float their demos beside the words (round 9).
- **F2 An empty end card says why** (spoiled, popped, or how to bubble) (round 9).
- **F3 Helper labels (CLEANED, SHOVED) stay off the boss** (round 9).
- **F4 The tree reframes when a phone turns** (round 9).
- **F5 The boss's look out card shows after switching Start at** from a replay to the frontier (found by the report).
- **F6 A full field holds about 50 fps** (it was 27, from the Bouncer bots).
