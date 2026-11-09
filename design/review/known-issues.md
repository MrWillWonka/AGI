# Packet Snare: known issues

Reviewers read this before playing. For each **open** issue, say whether it's still there (and only add to it if you see
something new about it); for each **fixed: verify**, say whether the fix holds. Then spend your time on what isn't here.
Tag every issue in your review: `[new]`, `[known K#]` or `[regression]`. Issues the owner has ruled on are in
`settled.md`; questions waiting on the owner are in `decisions.md` (don't argue them in your top issues).

Update this file with every fix batch (move fixed ones to *fixed: verify*, drop them after a review confirms them).

## Open
- **K1 Late-game snowball.** Pacing campaign: sectors 7–12 each fall in 1–3 runs, Signal into the millions, every node
  bought by about minute 25 (`tools/review/pacing.js`). Waiting on the owner (D2).
- **K2 Sector 3 slower than the owner's log.** About 10 runs for a person-paced bot fitted to the owner, against their 6
  on 15.5 (`targets.json` known miss). Waiting on the owner (D1).
- **K3 Sideways phone page scrolls 9 px** (report rule check).
- **K4 The tree at 1280 × 800 opens small, Fit can clip a row, branch names collide with nodes** (rounds 7–9).
- **K5 The boss's two loops are hard to read:** LOOP 1/2 is easy to miss mid-fight, and a loop that fails doesn't say why
  (touched it, too late, missed it) (rounds 7–9).
- **K6 A maxed field is cluttered:** 1,400 small packets, helpers, lasers and labels; the player's own bubble is hard to
  find (rounds 7–9).
- **K7 Grabbing a mine with a quick bubble often misses** (the bubble starts small, the mine sits by the boss) (round 7).
- **K8 Look out cards are running text:** the boss's steps inline, no list (round 9).
- **K9 The Signal chip takes a row of its own** above the field on phone and desktop (round 9).
- **K10 The phone tree popup can cover its own "now → after" line** behind the buy button (round 7).

## Fixed: verify
- **F1 Sideways cards** float their demos beside the words (round 9).
- **F2 An empty end card says why** (spoiled, popped, or how to bubble) (round 9).
- **F3 Helper labels (CLEANED, SHOVED) stay off the boss** (round 9).
- **F4 The tree reframes when a phone turns** (round 9).
- **F5 The boss's look out card shows after switching Start at** from a replay to the frontier (found by the report).
- **F6 A full field holds about 50 fps** (it was 27, from the Bouncer bots).
