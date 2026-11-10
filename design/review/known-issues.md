# Packet Snare: known issues

Reviewers read this before playing. For each **open** issue, say whether it's still there (and only add to it if you see
something new about it); for each **fixed: verify**, say whether the fix holds. Then spend your time on what isn't here.
Tag every issue in your review: `[new]`, `[known K#]` or `[regression]`. Issues the owner has ruled on are in
`settled.md`; questions waiting on the owner are in `decisions.md` (don't argue them in your top issues).

Update this file with every fix batch (move fixed ones to *fixed: verify*, drop them after a review confirms them).

## Open
- **K5 The boss's two loops are hard to read:** LOOP 1/2 is easy to miss mid-fight, and a loop that fails doesn't say why
  (touched it, too late, missed it) (rounds 7–10; round 10: looping a boss that's already stunned says LOOPS ARE FOR THE
  BOSS · HOLD STILL TO CATCH mid-fight).
- **K6 A maxed field is cluttered:** 1,400 small packets, helpers, lasers and labels; the player's own bubble is hard to
  find (rounds 7–9).
- **K7 Grabbing a mine with a quick bubble often misses** (round 7; round 10: mines now sit on a ring away from the boss,
  but the boss walks onto them and pops the grab bubble, `pop:boss` 5 times in the owner's sector-11 runs).
- **K11 [regression of F16] The bay bar's crumbs print over each other on sideways phones** (844 × 390, 740 × 360) now
  that Signal and Upgrades share the row, and at 1280 px the crumb truncates to "packet_sna…" when Go deeper shows: the
  HUD's slot and the crumbs split the bar's spare room (round 10: verify, screens, early, late).
- **K12 Debug Boss now does nothing on a boss sector** since 17.5: it sets `bossAt`, but the boss waits for `bossArrive`
  (round 10).
- **K13 Focus isn't paused in the boss fight:** a wire the boss snaps still costs Focus while the HUD shows ❚❚ and BOSS
  INCOMING says FOCUS PAUSED; most fights end on Focus with 5–20 s on the fight clock (early: 10 of 12, late: 5 of 8)
  (round 10).
- **K14 The boss's Look out card describes the pre-17.5 boss** (eats the packets near it; nothing on half Focus, the
  swallow, the 30 s clock, escaping or the burst), its reach ring is drawn in the empty arena, and the mines card's demo
  shows the old mine and nothing on throwing it as a puck (round 10). *The copy pass (merged 2026-11-10): the card's words
  are one line now ("Loop it twice to stun it, then slash through it.", the owner's call: the demo teaches the rest), so
  what's left is the boss and mines demos, which should show the 17.5–17.7 fight.*
- **K15 A bank shot without Ricochet says BANK SHOT ×1 · −3** but adds no damage (`mineBank` is Ricochet's alone), while a
  bounce risks a dud (9/12 hit against 12/12 straight) (round 10).
- **K16 The fight's readouts:** the 30 s clock has no number until its last 10 s; the boss's health shows three times
  (HUD, bar, label) and SLASH −1 · n left sits on its label; an escape's end card is titled "Focus spent" and can blame a
  garbled bubble (round 10).
- **K17 Sector 11's nets do nothing in the fight** (the field is swallowed, so a net has nothing to wipe: 0 netted in
  every fight), and the mine shield (up 41% of sector 11's fight) glances every slash after a parry without saying so
  (round 10).
- **K18 The desktop tree can pan an unbought root out of view** (Packet Stream above the frame after buying Sanitizer;
  the view is remembered), and boss nodes (Kernel Panic, Root Access) are sold from sector 3, before any boss (round 10).
- **K19 Sector 12's goal (843K) is a wall** against a sector-11 build's 60–138K haul (round 10).
- **K20 Screens, smaller:** the HUD is small and far from the field at 1920 and 4K; a sideways Look out card shows a line
  or two before Start covers it; at 360 × 640 a tree popup can clip its effect line; an UPDATING label clips at the
  field's edge (round 10).

## Fixed: verify
- **F16 (K9, round 10: holds, but see K11) The Signal chip took a row of its own:** the HUD and the Signal chip live in the bay's bar, so the field gains
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
