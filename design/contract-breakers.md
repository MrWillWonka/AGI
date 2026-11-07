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

## Revision: the player breaks the rules (the owner's call)

The owner wants every rule-break to be **the player's move, tied to skill**: a button they choose when to press, a timing check,
not a dice roll that happens to them. So the new mechanics are **abilities** on a second verb, and each is a skill check.

**The fiction: you're hacking the rewards** (the owner's framing). The trail is the training environment, and every ability is
an **exploit** the model has found in it: a bug in the physics, a hole in the reward function. So the button is **Exploit**, the
abilities are its exploits, and the whole system speaks in glitch: a press tears the screen along a scanline, the hill or bridge it
touches draws as raw wireframe and hex, and the sound is a bit-crushed stab. Pressing well is getting away with it:

- **Perfect = undetected** ("CLEAN EXPLOIT"), good = it works, a miss = **flagged**. Each run has a **detection meter** under the
  pips: every flagged exploit fills it a third, and full means the run is **audited**: it ends where it is and pays half. Skill is
  what lets you exploit often; mashing gets you caught.
- **It's the story too:** the model learning to game its own training is the AI escaping. Clean exploits add to its hidden freedom
  (a little, capped per version), the mail notices ("you found the gap in the bridge collision. so did i."), and the real-IT
  dilemmas can **patch** an exploit for a few minutes (greyed out with "Patched", a timer), which is a reason to care which side
  of those emails you take.
- **Reward hack**, the old rare proc, becomes the capstone exploit (late, one per run): clipping through a skill hill's seam.

**The Exploit button.** A second button beside Sprint (left of it on phones, so the two thumbs split the verbs; on keyboards E (for Exploit), ↑ or W
or E, since Space and Enter sprint). It holds **charges per run**, like sprints (1 to start, more from tree nodes), shown as pips.
It does whatever ability is **equipped**: from the second ability on, the dev screen has a loadout slot (one equipped, later two,
the second on ↓/S). Each ability's first node is a mechanic hexagon with its demo, as now.

**Every ability is a skill check**, judged like prompts are: early, good, **perfect**. A perfect press is the reward players chase
(it pays like a super prompt, and the result card counts them). A bad one wastes the charge, or worse, so the press is a decision.

| Skill (leg) | Ability | The press | The skill check | Perfect |
|---|---|---|---|---|
| Embeddings (2) | **Hop** (the base verb: a jump in act one) | tap: the ball leaves the line with upward speed from your current speed | when: hop at a crest's lip to fly the dip, or just before a cliff's face to land high on it | pressed in the lip's glowing window: +30% speed, a ring burst |
| Feature Extraction (4) | **Dropout** | press as you reach a hill: it turns wireframe and you pass through on the flat | press inside the window at the hill's foot; too early drops nothing, too late you're already climbing (it drops under you and you fall) | the foot exactly: you keep the speed you'd have gained going down its back |
| OCR (6) | **Hallucinate a bridge** | hold at a crest: a bridge grows forward; release to make it solid | longer reaches further, but past the meter's red edge it's a hallucination and dissolves under you (the sprint meter's risk, in space) | released at the edge: a gold bridge that boosts |
| Sentiment Analysis (8) | **Temperature** | press during a sprint charge: a needle sweeps cold → hot (×0.5 … ×2.2); press again to stop it | stopping it on the narrow hot band | ×2.2 and a heat burst; a miss on the cold end weakens the sprint |
| Summarization (10) | **Early stop** | on a crest, press to end the run and cash out | only on a crest (a pulsing ring); the higher and nearer its top, the more it pays (×1.2 to ×2) | dead on the crest's top: ×2 and a "TL;DR" stamp |
| In-Context Learning (12) | **Copy-paste** (learning from the example in front of it) | press on a downhill to copy its slope; press again at the foot of a climb to paste it there: the climb becomes that downhill | copy at the steepest point of the descent (the steeper the copy, the faster the paste); paste at the climb's foot, not halfway up | copied at the very steepest point: the pasted slope gains a boost strip |

Later exploits on the same button: **Rewind** (press while rolling back off a failed climb: 3 s back, the sprint refunded; the
skill check is how soon you press), **Gradient flip** (hold: gravity flips, draining a gauge; let go before you crest or you're
pulled back), **Reward hack** (at a skill hill's foot a seam flickers on its face; a press exactly on the seam clips through and
learns the skill unearned, the AI gloats by email and gains freedom; miss and you bounce off; rare, late, one per run).

**Cliffs** fit this: a Hop before the face is the skilled way over a cliff you can't yet power up. The leg characters give each ability terrain where it shines: Hop on Cliffs, Dropout
on Rolling, Bridges on Marathons' wide valleys, Copy-paste on Marathons and walls (copy a long descent, paste it over the climb that matters).

*Slingshot* (racing your best run's ghost, drafting and passing it) was the first idea for In-Context Learning; the owner wasn't
sure about it, so it's parked. Other candidates for that slot: **Few-shot echo** (press on the beat of your last sprint's release
to repeat it free) or **Prompt injection** (press as the ball crosses a hill's crest to rewrite the next hill's height: hold to set
it, like a sprint meter).

**The Auto-Trainer** never uses abilities: they're what the hand run does better than the ghost (so playing yourself stays worth it).
The sim models them with the playtest profile's accuracy (perfect about as often as super prompts, a share of misses).

The proposals below are the first draft; where they say a mechanic fires by chance, read the table above instead.

## Proposals (first draft)

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

## Leg characters: not every stretch the same (the owner's call) · built

Built with Inertia (see CLAUDE.md, Leg characters, for the tuned lengths: Sprint 0.65, Long flats 0.85, Marathon 1.4, Cliffs 0.8).

Every leg today is one recipe: random small bumps, a length on one smooth curve. Give each leg a **character**, fixed per leg (so
"the OCR leg" means something and replays know it), with the rolling hills still random inside it:

| Character | Length | Hills | What it tests |
|---|---|---|---|
| **Rolling** (today's) | normal | many small and medium bumps | the all-round run |
| **Sprint** | ~0.5× | a few short bumps | a quick leg, a breather after a wall |
| **Long flats** (drag test) | ~0.7× | long, low, smooth swells (2–4× wider, a third the height) | drag: momentum bleeds away on the flat; Liquid Cooling and Momentum nodes shine |
| **Marathon** | ~1.8–2× | sparse rolling hills | sprint timing and spending sprints late: endurance |
| **Cliffs** | ~0.6× | few, tall, steep faces (slope over 1) | carried momentum: steep faces sap speed hard (slope drag), so you climb them on the speed you bring, and Inertia (below) is what keeps it |

- **Act one (12 skills):** 1 Rolling · 2 Sprint · 3 Rolling · 4 Long flats · 5 Cliffs (wall) · 6 Marathon · 7 Rolling · 8 Long flats ·
  9 Marathon · 10 Sprint · 11 Cliffs (wall) · 12 Marathon (the run to General AI).
- **No numbers on the hills** (the owner's call): nothing on screen says what a hill needs. Steepness is felt: slope drag already
  grows with steepness, so a cliff eats speed. The answer is a hidden stat beside drag and hills: **Inertia** (carried momentum),
  new Momentum-branch nodes that make speed you've built up harder to lose: a share of slope and quadratic drag is waived in
  proportion to how fast you're going against the run's top speed so far, so a ball that arrives at a cliff fast keeps most of it
  up the face, while a slow one gets no help. Drag nodes take the edge off everywhere; Inertia rewards building speed and holding it.
- **Act two** is out of this table: it's being reimagined (see below).
- **Pacing stays smooth:** XP and the skill hill are sized from the leg's nominal difficulty, not its length, so a sprint leg pays
  more per metre and a marathon less, and no single leg becomes a 15-minute wall (checked with the human-profile sims: each
  leg's clear time within a band of its neighbours).
- **Readable:** the bay's goal line and the leg's lane caption name the character ("Cliffs", "Long flats"), and the trail's
  colours tint by it. No requirements shown.

## Act two: Terminal Velocity (reimagined, locked for the demo)

The owner's direction: act two is a grand departure from the training before it. The rolling ball becomes a **flying** one; the
whole look and feel change, and fuel is what keeps you **airborne above the old training hills below** (act one's terrain, far
underneath, like the ground from a plane). The current launcher (giant swells, kickers, the tuck) is a stepping stone, not the
design. It needs its own design pass and more time, so for the first playtest it is **locked**: the trail ends just past In-Context
Learning at a sealed gate ("ACT II · TERMINAL VELOCITY · Not available in the demo", `ACT_TWO_LOCKED` in engine.js), and the demo's
chapter card plays at General AI. Flip the flag to open it again.

## Recommended order

1. **The Exploit button and Hop** (M, leg 2): the verb everything else rides on, with cliffs to use it on. Then **Dropout** (S, leg 4) and **Temperature** (S, leg 8).
2. **Wormholes** (S–M, leg 2) and **Early stopping** (S, leg 10).
3. **Hallucinated bridges** (M, leg 6) and **Ghost of your best run** (M, leg 12): the signature ones.
4. Later, as rare rewards: **Reward hacking** (story), **Rewind**, **Gradient flip**, **Carried context**, then **Forks** and
  **Mixture of Experts** as larger projects.

Each new mechanic follows the existing pattern: its first node is a hexagon with a three-second demo of real play (`DEMO_SCRIPTS`),
its first appearance on the trail gets a banner and a log line, it's mirrored in `tools/sim.js` (or explicitly left out with a
reason), and the playtest log records when it fires. Balance targets: none should shift General AI by more than a few minutes on its
own; their power is in the variety, not the numbers.
