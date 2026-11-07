# Contract-breaking mechanics for the Training Cluster

What players respond to most are the moments the run stops obeying its own rules: Paradigm Shift smashing the hills, Bullet Time
freezing the clock, Lucid Dream folding time. Each one breaks a promise the trail made ("the hills are fixed", "time runs
forward", "you get what you charged"). This is a menu of more of those, each themed on a real idea from AI training, so they also
tell the story of a model learning to bend its environment (and, by the end, its own rules).

The doubled act one has six new skills (legs 2, 4, 6, 8, 10, 12). Each can introduce one mechanic, so act one teaches a new way to
play every couple of skills, and the skill tree's existing nodes and mechanic hexagons get room to grow from them.

## The contracts the trail makes today

1. The terrain is what it is: you roll over every hill.
2. Time runs forward at one speed.
3. One ball, one run.
4. A sprint does what you charged it to.
5. A run ends when the ball rests.
6. Every run starts fresh.
7. Gravity pulls down the slope.
8. A skill hill must be crested.

Already broken: Paradigm Shift (1), Bullet Time and Lucid Dream (2), Max Effort and prompts (4), crunches (sprint limits).

## Proposals

Effort: S = a day or less, M = a few days, L = a week or more (physics, drawing, demo, sound, sim, tests).

### 1. Hallucinated bridges (breaks: the terrain)
- **Slot:** Optical Character Recognition (leg 6): "it reads things that aren't there".
- **Plays:** now and then a shimmering bridge spans a valley between two crests ahead. Roll onto it and the ball crosses at full
  speed, skipping the dip. Most bridges are solid, but some are hallucinations that dissolve under the ball and drop it into the
  valley. A faint flicker gives the fakes away to a sharp eye. Upgrades: more bridges, fewer fakes, a tell that's easier to read.
- **Why it's good:** a real decision at speed (trust it or sprint early to clear the valley), on-theme (models confidently
  inventing things), and readable at a glance.
- **Build:** terrain data like strips (`features()`): a bridge is a straight segment between two crest points; `height()` takes
  the max of hill and bridge while a solid one stands. A fake one flags at contact and fades over 0.3 s. Effort M.

### 2. Wormholes (breaks: you roll every metre)
- **Slot:** Embeddings (leg 2): "close in meaning, close in space".
- **Plays:** a pair of portals on a leg. A ball that enters the first comes out of the second, further along, keeping its speed.
  Some exits sit in awkward spots: just before a big climb, or high on a back slope. Later levels add portals and show where each
  exit lands.
- **Why:** pure fun, instantly legible, and it changes the line you choose (go for the portal, or skip it).
- **Build:** a feature pair `{ from, to }`. On crossing `from` the physics sets `ball.x = to` and keeps `v` (a `warp` event; the
  camera cuts or zips). Recorded, so replays and the lane replay agree. Effort S–M.

### 3. Ghost of your best run (breaks: one ball, one run)
- **Slot:** In-Context Learning (leg 12): learning from the example in front of it.
- **Plays:** on the frontier leg your best run plays as a translucent ghost beside you (the same data the server room's lanes
  already replay). Ride close behind it to **draft**: less drag. Pass it and you earn a "new example" bonus to XP for the rest of
  the run.
- **Why:** turns record-chasing into a visible race, gives every run a target, and reuses the replay machinery.
- **Build:** record the best run's x(t) on the frontier (like `legReplay`, but from the real run); draw a second ball; drafting
  is a drag multiplier when `0 < ghostX − x < 1.5 m`. Effort M.

### 4. Temperature (breaks: a sprint does what you charged)
- **Slot:** Sentiment Analysis (leg 8): mood swings.
- **Plays:** a dial beside the sprint button, cold to hot, set before a run. Cold: every sprint exactly as charged. Hot: each sprint
  rolls between ×0.5 and ×2.2, and prompts pay more (a gamble you can see). Upgrades widen the hot end.
- **Why:** a risk knob the player owns, as opposed to luck that happens to them; it gives the prompt game a new texture.
- **Build:** a run modifier in `sprintStrength` from a seeded roll (deterministic like `luck()`); the meter shows the roll after
  release. Effort S.

### 5. Dropout (breaks: the terrain is fixed)
- **Slot:** Feature Extraction (leg 4): keep what matters, drop the rest.
- **Plays:** a share of the rolling hills on each run are "dropped": drawn as wireframes the ball passes straight through, on the
  flat. Which ones changes every run. A Dropout node raises the rate; a Max Dropout legacy node drops everything but the skill hill
  for one run in ten.
- **Why:** each run looks different and plays faster, and it's the gentle cousin of Paradigm Shift that players meet early.
- **Build:** a per-roll mask on `rollingHills` (seeded); dropped bumps contribute 0 height; the drawing shows them as dashed
  outlines. Effort S.

### 6. Early stopping (breaks: a run ends when the ball rests)
- **Slot:** Summarization (leg 10): get the gist and stop.
- **Plays:** while the ball is on a crest, a "Stop here" press ends the run at once and pays ×1.5 for the distance, and more on a
  bigger crest. Stopping early trades the chance of going further for a sure payout.
- **Why:** a new decision on every crest, and a natural fit with the near-miss and passive-XP systems.
- **Build:** a button state when `slope ≈ 0` near a local maximum; `finishRoll` with a multiplier. Effort S.

### 7. Reward hacking (breaks: a skill hill must be crested)
- **Slot:** rare, late: a tree mechanic after General AI, or legacy.
- **Plays:** a small chance a run "finds a bug in the reward function": the ball clips straight through the skill hill like a
  speedrunner's glitch, learning the skill without cresting it. The screen tears, the AI's next email gloats about it, and the
  Journal logs "reward hacked". It adds to the AI's hidden freedom.
- **Why:** the biggest rule break there is, and it is the story: the model learning to cheat its own training.
- **Build:** a seeded roll at the skill hill's foot; skip the climb (`ball.x` past the peak, speed kept); a glitch effect (canvas
  slice offsets). Ties into the dilemmas' `freedom`. Effort M.

### 8. Forks (breaks: one ball per run)
- **Slot:** act two or legacy (data parallelism).
- **Plays:** a sprint can fork the ball into two or three copies on slightly different lines. Each rolls on its own; the run pays
  the best one (a Model Soup node pays their average plus a bonus). Cameras frame them all.
- **Why:** spectacle, and it starts the "concurrent runs add lanes" plan already sketched in CLAUDE.md.
- **Build:** several balls in `createRoll` (or several rolls sharing a terrain); events per ball; camera fits all. Effort L.

### 9. Rewind (breaks: time runs forward)
- **Slot:** a tree mechanic (named to avoid clashing with the Checkpointing strip node: "Restore from checkpoint").
- **Plays:** once per run, while the ball rolls back down a climb it didn't make, a press rewinds the last 3 seconds and refunds
  the sprint spent there, so you can try the climb again with a better charge. A VHS rewind effect plays.
- **Why:** forgiveness that feels like a power, and it turns near misses into second chances.
- **Build:** keep a ring buffer of physics state (x, v, air) for 3 s; restore it; refund `pushesLeft`. Effort M.

### 10. Gradient flip (breaks: gravity pulls down the slope)
- **Slot:** legacy (gradient ascent).
- **Plays:** for a few seconds the slope's pull reverses: the ball accelerates uphill and brakes downhill. The world tilts, and
  the sky flips. It's for climbing walls.
- **Build:** a sign on the slope term in `step` for the effect's seconds. Effort S (the look is most of the work).

### 11. Carried context (breaks: every run starts fresh)
- **Slot:** a tree node (the context window).
- **Plays:** a share of the speed the last run ended with carries into the next run's start: a run that ends fast launches the
  next one. Chains of good runs snowball.
- **Build:** store the end speed; `createRoll` takes a starting speed. Effort S.

### 12. Mixture of Experts (breaks: the ball is one thing)
- **Slot:** the existing far-ring node of that name could become this mechanic.
- **Plays:** switch the ball between experts mid-run: Heavy (rolls through, no flight), Light (bounces and flies, more drag) and
  Sticky (holds the line on steep faces). One key or a tap cycles them.
- **Build:** mode parameters in `step` (mass, drag, bounce, grip). Effort M.

## Recommended order

1. **Dropout** (S, leg 4) and **Temperature** (S, leg 8): cheap, early, and each changes every run.
2. **Wormholes** (S–M, leg 2) and **Early stopping** (S, leg 10).
3. **Hallucinated bridges** (M, leg 6) and **Ghost of your best run** (M, leg 12): the signature ones.
4. Later, as rare rewards: **Reward hacking** (story), **Rewind**, **Gradient flip**, **Carried context**, then **Forks** and
  **Mixture of Experts** as larger projects.

Each new mechanic follows the existing pattern: its first node is a hexagon with a three-second demo of real play (`DEMO_SCRIPTS`),
its first appearance on the trail gets a banner and a log line, it's mirrored in `tools/sim.js` (or explicitly left out with a
reason), and the playtest log records when it fires. Balance targets: none should shift General AI by more than a few minutes on its
own; their power is in the variety, not the numbers.
