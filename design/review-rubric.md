# Packet Snare review rubric

Seven categories, each scored 1–10 (whole or half points) by playing the build, not by reading about it. Each category
lists what to measure and how; a score must cite what was observed (numbers, screenshots, moments).

**Two scores per category** (from round 9): **Early** (the first twenty minutes: sectors 1–5, the first boss) and
**Late** (after it: later sectors and bosses, the late tree, a full field). A round's score in a category is the mean of
its Early and Late averages, and both are reported, so gains in the early game aren't hidden by the late one.

**For every category you score, also give the one change that would raise it by a point** (one line, concrete).

**Side by side** (when a round serves the previous build too): for every category, say whether this build is better, the
same or worse than the previous one, and why. A change of a point between rounds is within the noise of different
reviewers; a reviewer who played both and says *better* is the stronger signal.

**Anchors for this game:** `design/review/anchors.md` describes what a 6 and an 8 look like in each category.

**Anchors, for every category:** 10 = best in class, as good as the best-loved games of its kind; 9 = excellent, hard to
fault; 8 = strong and polished, only small nitpicks; 7 = good with a few clear problems; 6 = decent but problems a player
would notice and mind; 5 = mixed, as much wrong as right; 4 = significant problems; 3 = poor; 2 = barely works; 1 = broken.

## 1. Gameplay (the moment-to-moment loop)

- **Decisions per run:** count real choices in a run (where to bubble, how long to hold, when to let go with red nearby,
  when to go deeper). A strong loop asks one every few seconds, with a clear trade-off (bigger bubble vs. red risk).
- **Control fidelity:** does the bubble appear, follow and catch exactly as intended on desktop (mouse) and phone (touch)?
  Note any input that did the wrong thing (a flick read as a bubble, a pop you didn't expect), and how often.
- **Fairness of failure:** when a catch spoils, a bubble pops or Focus runs out, could you see why and have avoided it?
- **Depth over time:** do new mechanics (Antivirus, scans, the boss, mines, the Rogue AI, tree powers) change *how* you
  play, or only add numbers? Count mechanics that changed a decision.
- **Skill expression:** does a skilled player clearly beat a careless one (haul, sectors cleared)?

## 2. Clarity of mechanics

- **Self-evidence:** for each element on the field (good / gold / red packets, Focus, the goal, the multiplier, the bubble's
  growth, Scrubbers, Antivirus, scans, the boss and its charge, mines, cores, tools), could a new player tell what it does
  within its first appearance? Score the share that are clear.
- **Feedback:** does every outcome (catch, spoil, pop, scrub, goal, stun, grab, throw, split, supernova) say what happened
  and why, on the field, readably, at the moment it happens?
- **Numbers you can act on:** do the tree's node texts and "now → after" lines say concretely what changes? Find any that
  are vague, wrong, or don't match what happens when bought.
- **Consistency:** do words, colours and shapes mean one thing throughout (cards, tree, HUD, field)?

## 3. Pacing

- **Time to first success:** measure seconds from Start to the first catch and to clearing sector 1.
- **Cadence:** how many runs (and minutes) between sectors 1→5? Between new mechanics or meaningful buys? Note any stretch
  of more than ~3 runs with nothing new, and any spike where too much arrives at once.
- **Economy:** after each early run, how many runs until the next node worth buying? Is there always something to aim for?
- **Walls:** where does progress stall (a boss, a goal), how long, and is the way past it discoverable?
- **Run length:** is a run's length (Focus) right for the content in it? Does going deeper feel earned?

## 4. Design (systems and interface)

- **Upgrade tree:** do branches have clear identities; do buys feel impactful; are there dead, redundant or confusing nodes?
- **Systems coherence:** do the mechanics fit one fantasy (catching data, beating the antivirus) and support each other?
- **Interface layout:** HUD, cards, the tree and its popups, on desktop 1280 × 800 and phone 390 × 727: is everything
  reachable, unobstructed and where you'd look for it? Count layout problems (overlaps, clipped text, off-screen controls).
- **Controls mapping:** right-click bubble / left-click line on desktop, hold vs. swipe on touch: natural or confusing?

## 5. Visuals

- **Readability:** at both screen sizes, can you tell good, gold and red packets apart at a glance, even on a dense field?
- **Hierarchy:** do threats and important events stand out over decoration? Does a busy late field (max tree) stay legible?
- **Effects:** do catches, spoils, chains, splits and the boss fight look good and land with weight without clutter?
- **Polish:** consistent style, no visual bugs (flicker, text clipped, overlapping labels), smooth frame rate (measure FPS
  on a max-tree field with `requestAnimationFrame` timing).

## 6. Tutorials and onboarding

- **First minute:** from the first card, does a new player know what to do and do it successfully without outside help?
- **Introductions:** is each hazard and mechanic introduced before (or as) it matters, by showing rather than telling? Are
  demos clear? Does any tip interrupt at a bad moment?
- **Retention of teaching:** after the tips, can you name what each thing does? List what you had to work out yourself and
  whether that was fun discovery or confusion.
- **Desktop vs phone:** is the right control taught on each (right-click vs. hold)?

## 7. Engagement

- **Pull:** after each run, did you want another? Note the moments the pull was strongest and weakest.
- **Reward feel:** do catches, chains, sector clears and buys feel rewarding (sound and visual juice, numbers going up)?
- **Goals:** are there always visible short-term (this run), mid-term (next node, next sector) and long-term (boss, branch
  capstone) goals?
- **Variety:** do sectors and runs feel different from each other, or samey?
- **Session shape:** would you come back to it tomorrow? Why or why not?
