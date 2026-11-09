# Packet Snare: known issues

Reviewers read this before playing. For each **open** issue, say whether it's still there (and only add to it if you see
something new about it); for each **fixed: verify**, say whether the fix holds. Then spend your time on what isn't here.
Tag every issue in your review: `[new]`, `[known K#]` or `[regression]`. Issues the owner has ruled on are in
`settled.md`; questions waiting on the owner are in `decisions.md` (don't argue them in your top issues).

Update this file with every fix batch (move fixed ones to *fixed: verify*, drop them after a review confirms them).

## Open
- **K3 Sideways phone page scrolls 9 px** (report rule check).
- **K5 The boss's two loops are hard to read:** LOOP 1/2 is easy to miss mid-fight, and a loop that fails doesn't say why
  (touched it, too late, missed it) (rounds 7–9).
- **K6 A maxed field is cluttered:** 1,400 small packets, helpers, lasers and labels; the player's own bubble is hard to
  find (rounds 7–9).
- **K7 Grabbing a mine with a quick bubble often misses** (the bubble starts small, the mine sits by the boss) (round 7).
- **K8 Look out cards are running text:** the boss's steps inline, no list (round 9).
- **K9 The Signal chip takes a row of its own** above the field on phone and desktop (round 9).
- **K10 The phone tree popup can cover its own "now → after" line** behind the buy button (round 7).

## Fixed: verify
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
