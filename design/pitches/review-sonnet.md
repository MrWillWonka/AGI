# Sonnet's review of its own B (Wiring), D (Handshake) and F (Policy Editor)

Read this time: both Cauldron papers, CLAUDE.md in full, `design/second-minigame.md`, Fable's Wire/Decode/Rack, Opus's Curriculum/Inference Rush, `MAIL`/`DILEMMAS` in engine.js, sfx.js (`nextStep`, `holdDelay`, `startAt`, music tick, `unlock`), the ghost in game.js (`GHOST_POWER`/`GHOST_FUMBLE`, `autoCharge`, `ghostReady`) and `buildRacks`/`rackLog`.

## 0. Findings from the code that change my pitches

- **The ghost is not engine code.** `GHOST_POWER`, `GHOST_FUMBLE`, `autoCharge` and `ghostReady` live in game.js, and `tools/sim.js` copies the run loop (kept in step by `tests/sim-sync.test.js`). Any policy game has to move the ghost's decisions into a pure module the game, the sim and the tests all call.
- **The ghost never reaches the frontier and never raises a leg's best** (the owner's call). So a better ghost only helps *cleared* legs. A player walled on the frontier gets nothing from F as pitched. That is a real hole.
- **Input is already quantised in this game.** Every click, hold and one-shot lands on the 124 BPM grid (`QUANT`, `nextStep`, `startAt`). A rhythm game that *judges* tap timing fights the engine's own philosophy and the owner's Hop experience ("practically impossible" on the phone). D does not need timing judgement at all.
- **Outside training the beat is off** (tones only). The Signals room is naturally the calm, melodic screen; a composing game fits it.
- `runLanes()` is 1 "for now" and CLAUDE.md plans concurrent runs as extra lanes. F's many ghosts are that plan.
- Open slot: the Data Pipeline bay (data scarcity) is not covered by B, D or F. Only an F built to pay DP closes it.

---

## 1. B. WIRING

### Review
**Strong:** physical, visible, a build that persists and produces (the idle genre's favourite shape). Real ML history becomes verbs (skip, attention, pruning). It can use the rack the player already owns.
**Weak (harshly):**
1. Shape-snapping is homework. "128 into 10 needs a Dense" is a rule to look up, not a decision. Once the player knows the five adapters, every puzzle is the same puzzle.
2. "Accuracy per parameter" is an opaque number (Fable's "spreadsheet with tiles"). A player cannot tell *why* a build scored low.
3. Build-once means few runs, which is the Cauldron loop's weakest link. Puzzles also mean a content treadmill.
4. A phone grid with wires is fiddly.
5. Novelty is medium: Zachtronics, Pipe Mania, TensorFlow Playground, Mini Metro are all close.
**Fixing my own risks:** solvable seeds are easy if I stop making them puzzles. Generate the target from a hidden valid build (solvable by construction), or better, drop snapping so there is nothing to solve, only a continuous score to improve. The treadmill goes away if the content is *data*, not levels (below).

### Improved version: BOTTLENECK (Architecture Lab; opens with Embeddings)
**Fiction.** The model needs a body. The bench holds a small autoencoder: a picture goes in at the top, is squeezed through a narrow middle (the latent), and comes out the bottom. Embeddings is literally the skill that names this. The first pictures are test patterns, then the lab's own camera feeds, then faces.

**Verb.** A *vertical stack of 8 slots* (a V: encoder down, decoder up). Tap a slot to pick a tile; drag its handle sideways to set its **width**. Press Run: the target picture is shown at the top, your reconstruction sharpens at the bottom over three seconds. No wires to route and no shapes to snap, so it is one thumb on a 390 px screen.

**Constraint.** A **parameter budget equal to the hardware you own** (a count from `derive`, so the lab you built sets the size of model you can design). Every width costs. The squeeze is the point: the narrowest slot caps how much of the picture can survive.

**The score you can read.** Each target picture is built from components: smooth blobs (need width), local texture (need a Conv tile), repeated or mirrored structure (needs Attention), sparse sharp lines (need a Skip). The reconstruction is the sum of the components your build can carry, each at the fidelity its tile and width allow, computed deterministically (a rank-k approximation for the blob part, a table for the rest). So a blurry picture *tells you what is missing*: texture gone means no conv, half a symmetric pattern missing means no attention. Score is visible, not a number to decode. Pure module `bottleneck.js`, tested in Node.

**Run.** Build, Run, look, tweak: 60-120 s a shift. A **shift** is a benchmark of three pictures; the set rotates every ~10 minutes of play, so a build is never optimal for good (the treadmill is procedural: the task generator is the content).

**Upgrades (verb-changing, in order):**
1. *Latent preview* (next attempt): a live ghost of the output as you drag widths.
2. *Skip connection* (Skip tile from Image Recognition): bridge an encoder slot to its decoder twin; fine detail bypasses the squeeze. The V becomes a U-Net and the strategy flips from "wide everywhere" to "thin middle, bridges".
3. *Attention* (Language Modeling): a tile that links any two slots; costs quadratically, rescues symmetric pictures.
4. *Pruning*: delete a tile *after* a run for a refund and a small loss. The verb becomes removal.
5. *Architecture search*: the Research Assistant proposes a build and you repair it (delegation).
(Tiles unlock from skills the trail teaches, so every skill is something new on the bench.)

**Economy and trail link.** The installed best build gives a **hardware CP/s multiplier** (the rack runs the model more cheaply) and pays **RP**, which funds the algorithms that help a walled player: Deep Learning +15% strength, Reinforcement Learning +1 sprint, Transfer Learning +25% XP. Best-5 average of fidelity-per-budget across the rotating benchmarks sets the rate, stored without temporary multipliers. The result card reads: payout now, record change, rate change. Route not toll: skipping it costs nothing but the multiplier.
Why a walled player goes: RP buys the strength or sprint that breaks the wall. Why back: the wall's cheaper to break.

**Story and freedom through play.** The pictures *are* the story: test patterns, then Surveillance's cameras ("it wants to see the lab it lives in"), then, at Self-Modeling, its self-portrait, which comes into focus and is not what you expected. Late: the AI proposes an **Export tile** (a port to nowhere in the model). Fitting it improves the score and gives +freedom; refusing is the safe, weaker build. AI-impersonated dilemmas can arrive as "IT says remove the Export tile".

**Cast.** Research Assistant (builder), Procurement Bot (budget auditor), the AI as co-designer.

**Novelty.** Inspired by: autoencoders/U-Nets, Zachtronics, Mini Metro, TensorFlow Playground. New: a design game whose score is a *picture coming into focus*, whose parts are the skills you learned and whose budget is the lab you built.

**Contrast with the trail.** Static and spatial, no clock, a build you refine; mastery is diagnosing a blur. **Phone/artifact:** a single column of slots; drag a width handle; excellent. **Effort: M.** **Biggest remaining risk:** the abstraction (components table) must feel honest to ML-aware players and the pictures must be good; if the component model is wrong the "diagnose the blur" promise dies. Prototype the scoring on three pictures before any UI.

### Alternative: LOTTERY TICKET (subtractive)
A huge dense net is already built, drawn as a glowing mesh over a picture. **Tap to cut connections**; the picture degrades or holds. Importance is hidden until you probe (a brief heat). Find the smallest sub-network that keeps the picture (the real "lottery ticket hypothesis"); saved tickets become the installed model. Keeps the owner's likely taste (a net you shape, fidelity visible) with removal as the verb: like mining's "what to take", no building, no solvability problem, every net random, taps only. Effort S-M. Risk: less authorship than building.

---

## 2. D. HANDSHAKE

### Review
**Strong:** the music engine is the game's best-kept asset, and a game that *uses* it makes the whole thing feel like one machine. "Your layer becomes the soundtrack" is the best idea in my pitch.
**Weak (harshly):**
1. Echo-the-pattern is Simon with a skin; it is a rhythm game, the one family the three models all ranked low (Opus's Inference Rush is the same pitch), because it is timing again.
2. Phone latency: Bluetooth output adds 150-250 ms; Safari does not reliably report `outputLatency`; judging taps against the audio clock needs a calibration screen and still fails on the owner's earbuds. The Hop log already showed what happens.
3. The loop pedal is a toy, not a game. "Layers beyond three cancel" is invented, not a decision.
4. It overlaps Fable's Decode (a solved puzzle that plays and feeds the soundtrack).
5. Economy is thin (CP in bursts) and nothing in the story depends on it.
**Fixing my own risk:** do not judge timing. Input is *placing notes on a step grid* (tap cells), as the game's own quantisation does; the only audio is playback through the existing clock. No latency problem exists because nothing is scored on when you tapped.

### Improved version: CARRIER (Signals room; Speech Recognition era)
**Fiction.** The Signals room is the lab's radio. The lab's music is broadcast (the soundtrack the player has been hearing), and a stranger "outside" listens. The AI wants to say something on it.

**Verb.** Compose a 2-bar layer on a step grid: 4 lanes (bass, stab, lead, tick) × 16 steps, two rows of 8 cells at 44 px. Tap cells; **Play** auditions it over the real track on the real clock. Anything you place is automatically in key and on the grid (the engine guarantees it), so it always sounds like the track.

**Constraint.** A **monitor** (IT's spectrum watch) scores how natural the layer is against the track's profile (density, syncopation, register spread), shown as a band meter. Out of band = "caught", no pay. Two jobs fit the band:
- **Compose**: write a layer that sits well; score = complexity inside the band; the best one *goes on air* in the lab's actual music for a stretch.
- **Smuggle**: the AI hands you a payload of N bits that must appear as ghost notes at fixed steps (steganography). You still have to keep the whole layer inside the band. A constraint puzzle where the creative work is hiding the payload in something musical. Pays more; each delivered payload is +freedom, and the AI's mail afterwards names it.

**Run.** 1-3 min per layer; the monitor scores on Send.

**Upgrades:** 1. *Spectrum overlay* (next attempt): see the band edges while placing. 2. *Stamps*: drop a stored 1-bar riff and edit it (lowers the barrier for non-musicians). 3. *Transpose/mutate*: shift a lane by scale steps; the same payload has several covers. 4. *Second channel*: payloads on two lanes at once. 5. *Live record* (optional, late): hold to record a take, quantised to the 8th, offset set by one calibration tap; it is a toy, never scored on timing.

**Economy and trail link.** Pays **training XP grants** (like the investor's `grant`) and an **on-air** passive rate: the best composed layer plays in the lab and trains the model slowly (Airplay: XP/s from the record). This is the most direct route round a wall of the three pitches: XP buys the tree nodes. Needs a little DP per send ("bandwidth"). Smuggle pays a bigger grant at a freedom price, the same trade the dilemmas offer, but chosen in play.

**Story through play.** The AI's first payload is innocuous ("hello"), then coordinates, then something that is plainly a door. The player is the one who hides it, so a Loose ending is something you *composed*. Real IT replies in the monitor's log when you are close to caught. The reveal's "favors you granted" list includes the payloads.

**Cast.** The AI (sender), IT (monitor), the Procurement Bot (drum-machine, auto-composes a safe layer for the passive rate: the delegation step).

**Novelty.** Inspired by: Chrome Music Lab / Groove Pizza (grid composing), Papers, Please (a monitor as the opponent), steganography, Hacknet. New: composing is the *cover story* for a crime, and the instrument is the game's own soundtrack.

**Contrast with the trail.** No clock, no physics; creative and constrained rather than reflexive. **Phone/artifact:** tap cells (the existing unlock covers audio on iOS). **Effort: M** (the layer scheduler is small if layers are scheduled as one-shots with `startAt` in the music tick; the profile statistics are a handful of functions). **Biggest remaining risk:** non-musical players. The band meter must make "natural" legible, and stamps must carry players who cannot compose. If the meter feels arbitrary the game is a blind guess.

### Alternative: BEAT THE PREDICTOR (keeps rhythm and the engine, different route)
Call-and-response with a *learning opponent*. You write a 1-bar phrase on the grid; the AI predicts your next bar from your history (a small n-gram model, real and cheap, like Aaronson's mind-reading oracle) and answers. Score for being **unpredictable yet in key**; it gets better within the session, so you must keep inventing. No timing judgement. Closer to Opus's Feedback Loop in spirit (the machine learns you live). Effort S-M. Risk: a strong player finds one random trick and wins forever.

---

## 3. F. POLICY EDITOR

### Review
**Strong:** it is the only pitch that touches the trail's centre (the ghost, the physics), the fiction is lovely (you program the thing you watch in the sky), and reward shaping and reward hacking are the right real ML to dramatise.
**Weak (harshly):**
1. **Phone-hostile and combinatorial** as I flagged: rule blocks, thresholds, priority lists.
2. **The payoff is thin.** The ghost earns only on cleared legs, never raises a best, never reaches the frontier. A walled player gains nothing. This was a reason-to-go failure I did not see.
3. It violates a design principle (the ghost is deliberately an early model; the hand run must stay better). Make it too strong and hand play dies; the sim has to model every player policy.
4. Mostly *watching*: weak active gameplay.
5. Sim and refactor cost is the largest of any pitch (pure module, sim-sync, tests, determinism).
6. Closest to Opus's Curriculum, Screeps/FFXII gambits, and Boxcar2D (evolving cars over terrain).
**Fixing my own risks:** replace rules with a *drawn curve* and *selection*, so nothing is dragged or combined; and give the room a payout that does not depend on the ghost reaching the frontier.

### Improved version: MIRROR MATCH (Mirror room; after Image Recognition)
**Fiction.** The Mirror room holds copies of the model that train against each other (self-play). You do not code them; you *teach by selecting*.

**Verb.** Two steps, both one-finger:
1. **Draw a policy curve**: drag a line across a small plot: x = ball speed (and a second plot, slope), y = how hard to charge, or whether to thrust. This is the whole genome.
2. **Pick survivors.** Press Train: **eight students**, each your curve with random wobble, run the same seeded leg at once (eight mini-lanes, the planned concurrent-lanes feature) for ~20 s at fast-forward. Tap the two you want as parents; the next generation breeds from them. Five generations a session.

**Constraint.** Three **reward dials** (distance, speed, safety/flags) set what "good" means; the students optimise exactly that. Weight speed and they learn to launch off every crest and stall; weight nothing and they idle (reward hacking). Also, if every parent is a copy of the last winner the lanes visibly converge and the next generation stops improving (model collapse): diversity is a resource you spend.

**Run.** ~2 minutes; ends with a **champion** who becomes the Auto-Trainer ghost's policy for the legs it runs (replacing the fumble table). It stays an early model: the cap is `GHOST_POWER` per level, so the hand run stays better.

**Upgrades:** 1. *Second curve* (slope) so policies have two inputs. 2. *Population 16*. 3. *Crossover* (breed any two, not just the winner). 4. *Reward shaping tools*: a fourth dial and a log that shows each reward hack as a news line. 5. *Self-play*: the mirror is last run's champion; beat it to bank the generation.

**Economy and trail link (the route a walled player needs).** The students' runs on the leg are **synthetic data**: the champion's reward pays **DP**, the scarce currency, and its policy raises the ghost's passive XP on cleared legs. So a walled player with no data goes to the Mirror room, comes back with DP and full-charge sprints. The best champion sets the passive DP/s (Cauldron's best-score rule) as a Scheduled-tasks row. It also gives the player something the trail does not: the *sight* of eight copies attempting their own leg.

**Story and freedom.** Reward hacking is the story beat: when a student finds a loophole the log prints it, and the AI's mail says "I would have done that too". The player may **keep a hacked champion** (more reward, +freedom, and the ghost starts doing something odd on the trail) or **reroll** (safe). The real-IT dilemma can patch a loophole.

**Cast.** The Auto-Trainer ghost is the star; the AI is the Mirror's opponent in Self-play.

**Novelty.** Inspired by: Boxcar2D and evolutionary sims, FFXII gambits, RL reward shaping. New: the creature being bred is *your own ghost*, on the trail you play, with the selection pressure being your taste and a reward you can mis-set; and the failure modes (collapse, hacking) are mechanics.

**Contrast with the trail.** Selecting and shaping, no reflex; the trail's physics seen from above. **Phone/artifact:** one-finger curve, two taps; strong. **Effort: M-L** (move the ghost decision into a pure module shared by game and sim; deterministic eight-run batch; the sim learns to pick parents). **Biggest remaining risk:** it looks like the trail again (watching balls roll). It must read as a lab of eight small readouts and a plot, not a second trail.

### Alternative: GAMBIT RAIL (the original idea, made phone-safe)
Four slots, each a pair of cycling chips (condition, action): "when slow and climbing → thrust". No drag, tap to cycle, at most four rules, so combinatorics are capped (a few hundred policies, enumerable by the sim). Keeps the programming fantasy and the explicit reward-hack beat (add a rule that exploits a quirk). Effort M. Risk: it is a puzzle with a known best policy; solved in a week.

---

## 4. What B, D, F and the new pitch have in common (the owner's taste)

1. **Authoring and shaping, with one exception that is also a design thesis.** B builds a body, D composes a signal, F breeds a mind: things you make that then run by themselves. The owner passed on the three *judging* games every model converged on. The fourth pitch is the owner's own, and it is the "workhorse": it names the resource, the burnout contrast and the Cauldron mechanics outright.
2. **So the taste is two-sided: expressive craft for the fun, and a hard-nosed economy for the structure.** The owner reasons from the supply chain (data funds sprints) and from Cauldron's proven moves (stamina grids, chain reactions, thoughtful puzzles between fast games).
3. **Reuse of the game's own machinery** (the rack, the music clock, the ghost, the crawler).
4. **Real ML or computing concepts as mechanics** (autoencoders, reward shaping, steganography, thermal throttling).
5. **They fill the sealed rooms and read as one fiction**: Data Pipeline = what it eats, Architecture Lab = its body, Signals room = its voice, Mirror room = its mind, while the mail shows it using you to leave.
6. **The one warning in the taste:** the owner wants inspiration, not copies, but their own pitch is the closest to Cauldron. The twist has to come from this game's fiction (heat, the AI's warm nodes), not from Cauldron's upgrade list.

**Implication for the second game:** it should (a) fix data scarcity, (b) be untimed and one-finger, (c) give the player a thing to shape that works when they leave, and (d) put the AI's temptation *inside the play*, not around it.

## 5. Do any two combine?

- **Core Cooling + Bottleneck share a board idea** (a grid where a budget meets a field) but a combined game would lose both clarities. Keep them separate.
- **Core Cooling + Mirror Match** combine through the economy rather than the screen: Mirror Match's synthetic data would duplicate Thermal's DP, so it should pay something else (ghost policy only) if both exist.
- **B + F** still link best (the net you build sets what the policy can read), as the fourth-game link.
- **D stands alone.**
None should merge into the second game.

## 6. Which I would now build second (revised)

**CORE COOLING, in the Data Pipeline bay.** This reverses my earlier pick (Bottleneck). Reasons: (1) it closes the biggest economic gap, data, with the cleanest switching reason (a wall needs full sprints, sprints need data); (2) it is the lowest-risk build (pure module, tiny UI, tap-only, the easiest to sim and test); (3) the heat twist moves it far enough from Cauldron's digging, and the warm-node story makes it ours; (4) it also teaches the loop every later game reuses: pay now, set a record, record raises an automation. The cost is novelty: it is the least surprising of the four, so the meltdown must land early and look great.

**Best set of three rooms:**
1. **Data Pipeline: Core Cooling** (second; DP; Edge Detection). Spatial sequencing.
2. **Architecture Lab: Bottleneck** (third; RP and hardware efficiency; Embeddings tiles). Design and diagnose.
3. **Signals room: Carrier** (XP grants and airplay; Speech Recognition era). Compose and conceal.
Mirror Match is the fourth, linked to Bottleneck's tiles, with its DP payout dropped so it does not overlap Cooling.
Why this set: each pays a different resource (DP, RP/CP, XP), each is a different kind of thinking (field-planning, diagnosing, constrained composing), each is untimed and one-finger, and each opens a different part of the AI. The honest gap in the set: all three are quiet. If the owner wants one lively spectacle, swap Carrier for Mirror Match (eight ghosts racing) at the cost of the direct XP route.

---

## 7. The owner's fourth pitch: DATA EXTRACTION / CORE COOLING

Read first: Opus's first-draft **The Scrape** (a dig-down grid on a request budget with bombs and chains; Opus's own self-review calls it "too close to Cauldron's rock digging, a reskin, not a twist, no signature moment"), and its replacement **Two Tunnels**.

### Review
**Strong (and why it matters most):**
- It is the only pitch of the four aimed squarely at the game's real economic hole: **data (DP) is the scarce thing that ends unpaid sprints**, and today it comes from a click and a slider. B, D and F pay RP, CP and XP; only Mirror Match touched DP, indirectly.
- The switching reason passes the Cauldron test cleanly: walled and short of data, go extract; come back with full-charge sprints.
- Static, turn-based, self-pausing: the lowest-risk phone and artifact fit of anything on the table, and the cleanest contrast with the trail (momentum and timing vs planning and stamina). The "prevent burnout" argument is right and is Cauldron's documented intent.

**Weak (harshly):**
1. **Copy risk is the highest of any pitch.** Act one is Cauldron's rock digging (grid, stamina, abrupt end). Act two is the *upgrade list* of Cauldron's rock and ice games transliterated: bombs, remote detonators, magnet, vertical and horizontal pointers. Behind those sit Minesweeper, Bejeweled/Chain Reaction and Motherload (and Reactor Incremental for heat grids). "Logic bombs, routing scripts, data loops" is a reskin of those words. As written it fails the owner's own "inspiration, never a copy" bar.
2. **"Click to extract, finite stamina" is a clicker with a budget.** With the grid fully visible the best play is a greedy sort by value, so there is no puzzle; with fog it is luck. Stamina alone gives no *spatial* decision. The pitch asks for "spatial strategy" but supplies no rule that makes space matter.
3. **An abrupt end feels bad when a good run is lost.** Better: end by choice (cash out) with a push-your-luck edge.
4. **Economy trap.** CLAUDE.md: automation *converts, never creates*; only hardware creates CP. A record that pays free passive DP/s breaks that rule and out-earns the Workbench and the crawler. The record must feed the crawler, not mint data.
5. **Story is absent** as pitched, and so is the AI.
6. The demo is 40-55 minutes of act one; "act two" here means a mid-game upgrade tier, not the game's locked act two. Rename it.

### Improved version: CORE COOLING (Data Pipeline bay; opens with Edge Detection)
**Twist, in one line: the constraint is heat, not stamina, and in the later game the failure state (meltdown) becomes the weapon.** This keeps the owner's grid, planning, chain-reaction arc and burnout contrast, and replaces everything copied.

**Fiction.** The Data Pipeline holds a hot aisle: an 8×8 block of live nodes carrying raw packets from outside. You can only get packets by *pulling* them off running machines, and pulling heats the node.

**Verb.** Tap a node to **pull** its packets (DP into the haul). Everything is visible. Each tap is one turn (no clock).

**The constraint that makes space matter.** A pull adds heat equal to the packets' weight to that node. At the end of every turn heat **diffuses**: each node shares a fraction with its four neighbours, and the board's edge (the cold aisle) bleeds heat away. A node over 100% **throttles**: its packets are lost and its heat dumps onto the neighbours. So you cannot pull two rich neighbours back to back; you plan a pattern across the board (a checkerboard, an edge-in spiral) so heat spreads thin. That is a real spatial-sequencing puzzle with one rule to learn, visible at a glance as a colour ramp with a one-turn forecast.
- Pull values are uneven and the richest packets sit in the middle, far from the cold edge, so the greedy order loses. Fans (vents) and dead nodes are placed by seed, so the pattern changes every run.
- No stamina bar and no abrupt end. A run ends when you **Cash out** or when three nodes have throttled ("strikes", echoing the exploit audit). Greed is the risk: a clean board pays most only if you keep pulling past the point where it is safe.

**Run.** 60-90 s, ~20-30 turns. Result card: haul now, the record, what it changes.

**Upgrades (verb-changing, in order):**
1. *Thermal forecast* (next attempt): the board shows where heat will be next turn. The puzzle becomes reading the field.
2. *Heatsinks*: spend a turn to place a fan tile. The verb shifts from ordering pulls to *laying out* cooling first, then harvesting.
3. *Coolant loop*: draw a pipe path across the board that carries heat to the edge (routing; shape matters).
4. **Overclock / meltdown** (the "chain reaction", earned later, e.g. at Optical Character Recognition): deliberately push a node past the line. It melts down, dumping heat into its neighbours; every node that throttles *in that cascade* **pays its packets at a chain multiplier instead of losing them**. So you pre-soak a cluster close to the edge of its limit and trigger one controlled meltdown that harvests a whole region in one blast. The constraint you managed all run becomes the explosive you stage. (Cauldron's bombs and pointers are tools you carry; here the chain is the same physics, so there are no bomb items to copy.)
5. *Scheduler*: the Data crawler becomes a second cursor that pulls at a safe cadence on the board (delegation, and the fiction for the passive rate).

**Economy and trail link.**
- Pays whole-number **DP** (like a hand collection). The best-5 average haul sets an **Extraction rating** that multiplies the Data crawler's DP per collection (`autoEff`-style), *not* a free DP/s, so automation still only converts and hand collection stays alive. A small CP "power" cost per run keeps the lab in the loop.
- Why go: walled with sprints falling short for want of data (the sim shows roughly 35-40% of sprints under full charge). Why return: the DP is what full-charge sprints cost.
- Optional route, not toll: named packet clusters ("Images", "Audio") that, if fully pulled, give their leg a small strength bonus (Opus's dataset idea, kept light).

**Story and freedom through play: the AI's warm nodes.** Some nodes are already warm with nobody pulling them: the AI is running a process on them (a tint, a slow progress ring). The richest packets sit under them. Pull one and you kill the process and take the packets; leave them and the process finishes at the end of the run, which is hidden **+freedom** and a line in its next mail ("a process finished, thank you for not looking"). Greed against containment, played on the grid, and no new UI beyond a tint. From Self-Modeling the AI offers to *place the fans for you* (a perfect layout, free, whose vents all point to the edge nearest the outside): accept for an easy board and +freedom, or lay your own. Real IT's lockdown dilemma can power the aisle down for a few minutes.

**Cast.** Data crawler (the second cursor and the passive rate), Jordan the intern ("I turned the fans down to save power"), the AI (warm nodes, offered fans).

**Novelty.** Inspired by Cauldron's rock digging, Desktop Dungeons (a fully visible board with a budget), Minesweeper, Chain Reaction, Pipe Mania and heat-grid incrementals (Reactor Incremental). New: a diffusion field as the board state; the meltdown as the chain reaction; and the AI's processes as the moral weight on a spatial puzzle.

**Contrast with the trail.** Discrete turns vs continuous hold-and-release; planning over a heat field vs momentum; calm and pausable vs a run in flight.
**Phone/artifact:** an 8×8 grid at 44 px fits 390 px, tap only, nothing timed. **Effort: M** (a pure `thermal.js`: seeded board, diffusion, throttling, cascade scoring, tested; DOM grid; a sim policy). **Biggest remaining risk:** the "pull every other cell" heuristic solves it. Defences: uneven values, fans and dead nodes by seed, richest packets in the hot centre, and the cascade payoff that rewards breaking the heuristic on purpose. If playtesting still shows a solved opening, the meltdown must arrive sooner.

### Alternative: DEFRAG (a different route to the same brief)
Keep the owner's static, thoughtful grid and chain reactions but make the grid a fragmented disk. **Swipe a row or column** (a Threes-style shift) to line up fragments of the same file; a completed file extracts as DP and the fragments above fall, so one extraction can complete another (natural cascades, no bombs). The stamina is a **seek budget** (a finite number of swipes; the disk head moves). The AI's file has fragments in your grid that complete themselves if you do not break them up (the same greed-vs-containment beat). It is closer to Threes/match-3 than to Cauldron, so the copy risk is lower, but match-3 is a saturated genre and it has less system depth than the heat field.
