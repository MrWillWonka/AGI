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
- **K14 The boss's demo shows the old fight** (round 10; the card's words are one line since the copy pass, the owner's
  call: the demo teaches the rest): it should show the 17.5 fight, the boss coming at half Focus, the swallow and the 30 s
  clock. The mines demo was redone in 17.8 (F21).
- **K17 Sector 11's nets do nothing in the fight** (the field is swallowed, so a net has nothing to wipe: 0 netted in
  every fight) (round 10; the owner: after the next log).
- **K19 Sector 12's goal (843K) is a wall** against a sector-11 build's 60–138K haul (round 10).
- **K20 Screens, smaller:** the HUD is small and far from the field at 1920 and 4K; a sideways Look out card shows a line
  or two before Start covers it; at 360 × 640 a tree popup can clip its effect line; an UPDATING label clips at the
  field's edge (round 10).
- **K21 Colour-blind readability** (a simulated check in the copy and colour pass, 2026-11-10): for red-green colour
  blindness, unreadable red and gold amber come out close in every theme (CIEDE2000 about 11–20), threats and your amber
  things too, and Night's violet tag edge nearly vanishes on blue packets (3–8). The owner's call: shape cues, not new
  colours (a mark on unreadable packets, a thicker tag edge, a distinct gold outline), in `drawSnarePackets` with its
  batching kept; ask the owner with cards which cues. Scheduled after round 10's fixes.

## Fixed: verify
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
