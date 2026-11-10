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
- A boss every third sector from 5 (D18): it comes at half Focus after a warning, swallows the field and stops the Focus
  clock; its fight has its own 30 s clock (beat it: the packets burst back out; run it out: it escapes and the run
  ends). Health 30, 50, 80, 120… Two loops round it within 3.5 s stun it; slashes (quick swipes through it) damage it
  while it reels. In the fight a loop it snaps costs 2 s of the fight clock, not Focus (D19).
- Thrown mines fly as pucks and bounce off the edges; a bounce adds damage only with Ricochet, and the game says MINE
  HIT, not BANK SHOT, when it adds none (D19). A Riposte parry breaks the mine shield while the boss reels (D19).
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

**Copy** (the owner's calls, 2026-11-10: game-design and incremental-game standards, not the Training Cluster's rules)
- Node popups are short rules text, like a card game's: verb first, one level's numbers, no "per level" or "(1 / 2 / 3)" (the level pill and the now → after line carry those). Numbers are bold; packet words take the packets' own theme colours.
- Packet Snare's nodes have no flavour quips.
- Look out cards are one line; the demo teaches the rest, with no caption under it (node popups keep their captions).
- Field callouts come in three tiers: rewards gold and number-first, losses one red word, hints small and in normal case in the text colour.
- No colour words, since themes colour packets differently: bad packets are **unreadable**, never "red"; a Firewall is a Firewall, not a "section". Highlights use theme tokens (`--snare-bad`, `--warning`, `--snare-good`), and no hint uses `--primary` (red in the Red theme).
- Colours across themes (2026-11-10): the Focus bar is the good-packet colour (red when low, clear in every theme); the bubble has its own token, `--snare-bubble` (the progress colour; Soft pink's pink, Void's lavender, Arcade's magenta, where it sat on a packet or tag colour); the scanner beam and towers draw the tag colour they give. Colour-blind shape cues are a separate follow-up.

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
- Red packets are **unreadable data** (the owner's call, 2026-11-09): data the model can't read yet because it isn't
  trained enough; one in a bubble garbles the batch. The drone that turns them is the Decoder Bot. Review the words for
  clarity, not the framing.
- A mouse plays a harder field than a thumb (the owner's call, 2026-11-09): 25% more red, threats 20% faster, the boss's
  warning 0.3 s shorter. Judge desktop and phone difficulty against each other, not the numbers.
