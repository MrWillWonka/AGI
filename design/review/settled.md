# Packet Snare: the owner's settled calls

**One source of truth** (the owner's call): when the owner answers a question card, this file is updated in the same
commit as the change; a call still being tried is marked *(trial)* until the owner confirms it after playing.

Reviewers: these were decided by the game's owner after earlier review rounds. **Score what you see, including these**,
but put any suggestion that goes against one of them in a separate section of your review, *Against settled calls*,
not in your top issues. Your top issues should be things the owner hasn't ruled on.

**The run**
- A first run is a small field (about 15 packets) with 10 s of Focus, its goal 25 (confirmed again after the review rounds). Focus drains at 1 s a second whatever you do.
- A popped bubble costs no Focus (a snapped wire and a spoiled catch do). A bubble still held when Focus runs out is lost.
- Desktop: the right mouse button holds a bubble, the left draws a line (for the boss). Touch: hold still for a bubble.
- A full bubble is 20% of the field; a full one pays about ×2.

**Sectors and goals**
- Sectors 1–4 ask for 25, 100, 185 and 400 packets in one run; sector 6 asks 1,300 and each goal after grows ×2.25.
- A catch pays +15% Signal a sector. Nodes on ring 4 and out cost ×1.75 their old price (the drones' and turrets' first
  levels and the nodes on the way to them excepted, at 4,000 or less), so the tree lasts about 40 minutes.
- The tree's branch names sit in a frame round the view, outside the nodes; level pills about 10 px.
- A boss every fifth sector. Two loops round it within 3.5 s stun it; slashes (quick swipes through it) damage it while
  it reels. The first boss has 15 health *(trial)*.
- A cleared sector tops Focus up and the run carries on there; Go deeper is the player's choice.

**Threats and teaching**
- Sector 1 shows one red packet to meet; red from sector 2, Antivirus from 3, Full Scans from 6, the Rogue AI from 9.
- Every threat is met on a Look out card with a demo before the run that brings it, never mid-run in normal play.
- Red packets are dealt with by helpers you buy (Cleaner, Bouncer and Escort bots, Checksum and Jammer towers), not by
  nodes that stop red spawning.

**Interface**
- The tree's nodes have no names on them (icons; the popup names them). The up branch is called Bubbles.
- Achievement toasts show in the bay, the tree included (swipe or click them away).
- The packet and red-packet nodes are folded into a few early nodes with many levels.
- The HUD shows only Focus and the goal (or the boss's health); everything else pops on the field where it happens.
- Effects are never capped or dropped for speed.
- Toasts can be swiped or clicked away.

**Not bugs (the review build)**
- The review build opens straight into Packet Snare: an achievement for a training skill and unread mail on arrival are
  side effects of that skip.
- `AGI.debug` jumps can bring threat tips mid-run; use `K.scenario(page, k)` instead, which meets them first as a player
  would have. Don't report what only a debug jump causes.

**Process**
- `known-issues.md` lists what's open and what's fixed and waiting to be verified; `decisions.md` is the queue of
  questions for the owner (asked as question cards at each check-in, nothing built on one until it's answered).
- After every batch of fixes: `node tools/review/report.js` (tests, pacing against targets, rule checks, screenshots).
  A reviewer round only when the owner asks for one: a quick verification (`brief-verify.md`, about ten minutes) after a
  fix batch, a full round (early, late, screens; side by side with the last round's build) as a checkpoint.
- Pacing targets live in `design/review/targets.json` (*proposed* until the owner confirms them); a target missed and
  waiting on the owner goes in its `knownMisses`, which the tests hold from getting worse.
