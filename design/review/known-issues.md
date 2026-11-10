# Packet Snare: known issues

Reviewers read this before playing. For each **open** issue, say whether it's still there (and only add to it if you see
something new about it); for each **fixed: verify**, say whether the fix holds. Then spend your time on what isn't here.
Tag every issue in your review: `[new]`, `[known K#]` or `[regression]`. Issues the owner has ruled on are in
`settled.md`; questions waiting on the owner are in `decisions.md` (don't argue them in your top issues).

Update this file with every fix batch (move fixed ones to *fixed: verify*, drop them after a review confirms them).

## Open
- **K5 The boss's two loops are hard to read:** LOOP 1/2 is easy to miss mid-fight, and a loop that fails doesn't say why
  (touched it, too late, missed it) (rounds 7–9).
- **K6 A maxed field is cluttered:** 1,400 small packets, helpers, lasers and labels; the player's own bubble is hard to
  find (rounds 7–9).
- **K7 Grabbing a mine with a quick bubble often misses** (the bubble starts small, the mine sits by the boss) (round 7).

## Fixed: verify
- **F17 (K10) The phone tree popup covered its own "now → after" line:** the line and the buy button share a footer pinned
  to the popup's foot, and a docked popup takes up to half the tree (was 42%). Checked: every visible node at sectors 3
  and 9 on 360, 390 and 430 px phones, 0 of 36 popups with the line hidden (16 of 36 before).
- **F16 (K9) The Signal chip took a row of its own:** the HUD and the Signal chip live in the bay's bar, so the field gains
  38 px on every screen; the bar keeps its height when a run starts; on phones mid-run the bar is the HUD's row. Checked
  at 360 to 3840 px wide with banks of 0 to 987.6B: one row, no overlap (a 360 px phone with a 987.6B bank wraps
  Upgrades to a second row).
- **F15 (K8) Look out cards were running text:** the boss's steps (and the mines': grab, then throw) are a numbered list
  with the note after.
- **F14 (K3) The sideways phone page scrolled 9 px:** the field's height there was 4 px too tall (and the HUD's row is
  gone). 0 px at 844 × 390, 932 × 430 and 740 × 360; the report's rule passes.
- **F13 (K11) Red didn't matter early:** red is 30% of sector 2 tapering to 5% by sector 10, the red nodes cut it, and the
  Cleaner Bot (now the Decoder Bot; later, the one bot for red) takes about a second a packet (D13).
- **F12 Runs that never ended** (the Snare 16 log: 110 s, 2.06M Signal, half the tree in a minute): a run earns back at
  most the Focus it started with; NO MORE FOCUS BACK THIS RUN when it's spent.
- **F10 The boss could be ignored** (the owner's phone log: they gathered on its far side): it now eats the packets in a
  growing reach, packets near it flee and schools break up while it stands; a stun stops it.
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
