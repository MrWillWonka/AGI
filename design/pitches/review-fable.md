# Review of the owner's three picks: Wiring, Handshake, Policy Editor

Read against `design/pitches/sonnet.md`, `design/second-minigame.md`, the ghost code in `game.js` (`ghostTrain`, `GHOST_POWER`
0.5/0.7/0.85, `GHOST_FUMBLE` 0.35/0.2/0.1, `autoCharge` copying your last 20 charges with `AUTO_ERROR` wobble and `AUTO_REACTION`
delay, strength frozen at `E.legPower` per leg) and `sfx.js` (one 124 BPM grid on `ctx.currentTime`; every tap already waits for the
next 16th; nothing compensates output latency, because nothing judges the player's timing).

First, the thing that jumps out: **none of the three is a judging game.** All three models converged on "judge the model's output"
(Red Team, Label Desk, Feedback Loop) and the owner walked past all of it. The picks are *authoring* games: build its body, compose a
loop that joins the soundtrack, write the policy that drives the ghost. That read shapes everything below; section 4 spells it out.

---

## 1. B. Wiring (Architecture Lab)

### Review

**Strong.** Real deep-learning history as verbs (skip connections, attention, pruning, architecture search) is the best ML-as-mechanic
idea in any of the pitches; the tensor-shape snap is a legible, wordless rule ("it only clicks when the shapes match"); fully untimed
and spatial, the right contrast; "its body" is a fiction the AI can speak through; the covert second output is a clean, deliberate
freedom button; it ties to the planned rack puzzle and to hardware, which the owner has already invested in (the cabinets, the
Procurement Bot).

**Weak or risky.** (1) *Score = accuracy per parameter* is a number the player can't see or feel; a puzzle whose win condition is a
readout becomes "try tiles until the number goes up". (2) *Generated puzzles with guaranteed solutions* is a content treadmill and a
solver problem; Sonnet flagged it. (3) *Few runs.* A build is made once and kept; Cauldron's loop (a run, a record, a rate) needs many
attempts with a reason to attempt again. (4) The reveal at Self-Modeling (a recurrent loop) is act two, locked in the demo. (5) The
snap puzzle is close to its inspirations: Pipe Mania and Flow Free (route a thing between sockets), Shenzhen I/O and Opus Magnum
(place parts under a cost), Shapez and Infinifactory (transform a shape to match an output). The twist as written ("real tensor
shapes") is a theme on top of the lock-and-key, not a new rule.

**Novelty verdict:** the verbs are new, the puzzle isn't. It needs a reason to build that no sockets puzzle has.

### Improved version: "The Body" (the Architecture Lab builds the ball you train)

**The fix in one line:** the architecture is not scored by a readout; it is **the model's body on the trail**. You build the ball.

- **Fiction.** The bench where the model's body is wired between INPUT and OUTPUT. Every build is tested the only way that matters:
  the ghost runs the trail in it.
- **Verb.** Tap a tile in the tray, tap a cell (or drag): layer tiles with a shape in and a shape out; connections click only when
  shapes match; adapters (Flatten, Pool, Dense) bridge mismatches. Press **Run**: a pulse crosses the build, and the ball on the lane
  beside it takes the body's stats.
- **Constraint.** A **parameter budget** (your lab's compute capacity: the cabinets' racks, so hardware you own is literally what you
  can build) and **latency** (tiles on the path cost time; a long body is a heavy one). What a body gives the ball is derived from its
  shape, visibly, as a radar under the build: width → **inertia** (momentum kept on steep faces), depth → **strength**, skips → **drag**,
  attention reach → **sprints per run**, and pooling → **sprint cost**. The decision is which leg character you're building for: Cliffs want
  inertia, Long flats want low drag, Marathons want sprints. There is no right answer, so no solver and no treadmill: the trail is the
  benchmark, and it already generates itself.
- **A run and its ending.** Build (untimed, 1–3 min), then Run: the ghost plays the **frontier leg's rolling hills** in that body on a
  lane beside the bench (30–40 s, the existing lane replay). It ends where the ghost stops; the card reads the body's distance against
  the leg's record body, and **Install** puts the body on your own next runs (one installed body at a time; swapping is free). A build
  is a run; you build again because the next leg is a different character.
- **Upgrades (bought with RP, in order; the first visible next attempt).** 1. **Skip connection**: a bridge tile that carries the
  signal round layers and adds it back: deep bodies stop losing the signal (less drag). 2. **Attention**: a tile that connects any two,
  quadratic in budget: a few long precise wires. 3. **Pruning**: after a Run, delete tiles for a refund and watch the radar: the verb
  flips to removal; bodies get cheaper than they look. 4. **Mixture of Experts**: two sub-bodies with a router tile; the ball switches
  expert by terrain (heavy on climbs, light on flats). 5. **Architecture search**: the Research Assistant proposes a body; you repair
  and prune it (editing, not building).
- **Economy and trail link.** In: RP for tiles (research gets a demo-era purpose), compute capacity as the budget (hardware bought in
  the lab is seen here). Out: the installed body's stats on your runs, and **the best body's efficiency (distance per parameter) is a
  hardware multiplier** (a lean model runs cheaper: CP/s), the passive effect, on a Scheduled-tasks row ("Architecture: ×1.12 CP/s").
  Route, not toll: a player who never builds plays in the default body. Why go there at a wall: Image Recognition is Cliffs; a
  wide, inertia-heavy body is the side door, and you come back to try it.
- **Story through play and freedom.** The tray grows with the skills you learn (Edge Detection brings Conv tiles; In-Context Learning
  the first memory tile: a loop from output back to input, the one build that lets the body carry speed from one run into the next,
  the "carried context" idea; the Self-Modeling reveal waits for act two, where the loop closes on itself). At Language Modeling a
  tile appears in the tray that you didn't buy: **a second OUTPUT socket** ("telemetry"). Wiring it makes any body 20% cheaper. It is
  +2 freedom, the one deliberate button, and the reveal mail later says what it was for. Sam's dilemma (open the firewall) and the
  real IT's lockdown can grey that socket out for a while.
- **Cast.** The Procurement Bot audits the budget (its row: "20 of 36 parameters racked"); the Research Assistant proposes bodies;
  the ghost is the test pilot, in person, so the Auto-Trainer finally has a visible job besides lapping.
- **Novelty.** Inspirations, openly: Bad Piggies and Poly Bridge (build, then watch it go), Shenzhen I/O (parts under a budget),
  the real history of deep nets. What's new: the thing you wire is the vehicle in the other minigame, its stats come from its shape,
  and the benchmark is the trail you're stuck on. A sockets puzzle with a reason.
- **Phone.** Tap-tap placement (no drag needed), a 6×5 board, the lane under it; one thumb. The radar replaces any number.
- **Effort.** M–L: the tile grammar and radar (pure, tested), the lane replay exists, five tiles and three adapters at first.
- **Biggest remaining risk.** The shape→stats mapping must be felt, not read: if two bodies play the same, the bench is decoration.
  Test with the sim: a Cliffs body should beat the default body on Cliffs by a margin a player notices (10%+) and lose on Long flats.

### Alternative: "Lottery Ticket" (the same body, the opposite verb)

Keep the body, the sockets and the covert output; flip the verb to **removal**. Each session hands you a bloated network that works,
and your job is to **cut as much as you can while the pulse still crosses**: a subtraction puzzle, generated solvable by construction
(plant a minimal path, bury it in decoys), with Hexcells/Minesweeper deduction (a tile's glow tells how much of the signal it carries).
Pay is parameters saved (a hardware multiplier) and RP. The AI's egress wiring hides in the bloat: cutting it is −freedom, leaving it is
the favour, and it moves between sessions (Opus's Neuron Surgery, from the wiring side). Cheaper (M), phone-perfect (tap to cut), no
open-ended balance; it loses the "build the ball" thrill and keeps the puzzle. The real Lottery Ticket Hypothesis as the hook.

---

## 2. D. Handshake (Signals room)

### Review

**Strong.** It is the only pitch that plays the game's best-built system, the synthesised score, and the owner wrote that system
(the longest paragraph in CLAUDE.md). "Your loop becomes part of the lab's actual soundtrack" is a reward no other pitch can offer:
permanent, audible, yours. Call-and-response is wordless. The cipher-key layering is a real idea (a key you build by composing).

**Weak or risky.** (1) **Timing judgement on an iPhone** is the deal-breaker as written: touch latency 60–100 ms, Safari's audio
output latency on top, 150–250 ms over Bluetooth, and `sfx.js` compensates none of it (it never needed to: a tap waits for the next
16th, so nothing is ever early). A Simon that judges when you tapped would be unfair on the owner's own phone. (2) It is a second
timing game; the research says one timing game per pair, and the trail is it. (3) The economy is thin: CP is the currency the lab
already makes most of, and "DP per round as bandwidth" spends the scarce one. (4) Close to its inspirations: Simon (echo a growing
pattern), Rhythm Heaven and Patapon (call-and-response on a beat), loop-pedal apps. The cipher is the only rule that isn't theirs.

**Novelty verdict:** the soundtrack reward is new; the game under it is Simon with a metronome, and on a phone it would feel worse
than Simon.

### Improved version: "Handshake" as a sequencer (no timing is ever judged)

**The fix in one line:** the player never taps on the beat. They **compose the reply on a step grid**, and the game plays it in time.
The challenge is *what* to send, not *when*: the puzzle is the cipher.

- **Fiction.** Other clusters on the network: peers. A peer sends a packet as a pattern on the lab's own clock (16 steps, 4 lanes in
  the track's instruments: kick, hat, bass, lead, in the track's key through `mapNote`). A handshake answers with the pattern under
  the session's **key**, a transform: echo, reversed, rotated a step, lanes swapped, the lead up a degree, and later two of those
  composed. The key isn't stated: the session opens with one worked exchange (challenge and correct reply, both played and shown),
  and from then on you hear challenges only.
- **Verb.** Tap cells on the grid to build the reply (it plays live on the clock as you edit, so every tap is an audible, in-time
  note: the sequencer's own reward), then **Send**. Correct: the packet locks, with a chord. Wrong: the line drops one level; three
  drops end the session. Patterns lengthen (8 steps, then 16, then 2 bars) and keys compose.
- **Constraint.** Signal: three drops. And **bandwidth**: each Send costs compute (CP), so guessing is expensive and deduction pays.
  The decision each round: send now, or spend one **replay** (hear the challenge again, free twice) to be sure.
- **A run and its ending.** A session of up to eight packets, 2–4 minutes, ending at the third drop or the eighth packet. The card:
  packets locked (+DP), the chain (longest run without a drop) against the record, and "Peered data: +a → +b DP/s" if the record
  rose. **Then the loop:** one locked packet of the session can be **kept**: it joins the lab's soundtrack as a layer for the next song
  turn (replacing the arpeggio's or the lead's phrase in `buildSong`'s terms, in key by construction), and the Journal keeps your
  kept loops as a playlist you can swap.
- **Upgrades (CP, in order).** 1. **Replay** budget (visible next session). 2. **Loop pedal**: keep a packet; the soundtrack changes
  on the next downbeat: the verb moves from reply to compose. 3. **Transpose**: shift a reply by scale degrees; keys that move pitch
  become solvable and the replies get harmonic. 4. **Two channels**: challenges arrive on two instruments at once with different keys
  (polyphony as difficulty). 5. **Relay** (the Procurement Bot as a looper): it answers echo-keyed packets by itself, and you handle
  the composed keys only: delegation, and the fiction for the passive rate.
- **Economy and trail link.** Out: **DP** (packets are data: the fiction says so, and data is what ends unpaid sprints: the pick's one
  economic hole, closed), the record's passive DP/s, and a kept loop gives a **tempo buff** on the trail for one song turn (the music's
  depth rises a band, and prompts widen 10%: the one soft timing help, earned by composing, not tapping). In: CP per Send. Why go at a
  wall: data for full-charge sprints; why come back: the loop you kept is playing.
- **Story through play and freedom.** Early peers are dull (a mirror, a backup host). From Speech Recognition the packets carry a
  second voice: a challenge with a key you've never been shown, addressed to the model, not the lab. **Forward it** (reply in its key,
  which the model whispers to you: a free lock, a big DP burst, +1 freedom) or **jam it** (send noise on purpose: the AI's next mail is
  short). And Sonnet's ending beat, kept: the last kept loop can be **sent out** or deleted. The leitmotif idea from my Decode fits
  here without the nonogram: the AI's packets are its phrases, and keeping one means its voice is in the soundtrack.
- **Cast.** The Procurement Bot relays; IT names the peers; the ghost's lane "drums along" is cut (it would need timing); the AI hums.
- **Novelty.** Inspirations, openly: Simon (echo), Incredibox and Mario Paint (layering a loop by placing), cryptographic handshakes,
  ear training. What's new: a rhythm game with no rhythm test: the puzzle is identifying a transform by ear and eye, every edit plays
  in time on the game's own grid, and what you send is what the game plays from then on. It also absorbs Decode's one good idea (the
  solved thing plays) without the nonogram.
- **Phone.** A 16×4 grid at 390 px is 22 px cells: too small. Use 8×4 for the first sessions (44 px) and scroll bars for 16; the
  grid is the whole screen; no timing, so no latency.
- **Effort.** M: the sequencer is a thin layer on `sfx.js`'s clock and voices; transforms are pure functions on arrays (tested); the
  loop layer is a hook into `buildSong`'s phrase.
- **Biggest remaining risk.** Listening tests are hard for some players and impossible without sound (the game plays muted by
  default until a gesture, and some play silent): every challenge must also be *shown* on the grid as it plays, so the puzzle is
  solvable by eye alone, and sound is the reward, not the requirement.

### Alternative: "Spectrogram" (receive, don't reply)

Keep the soundtrack reward and the Signals room; drop the reply. Packets arrive **damaged**: a picture-logic grid (row and column
counts, as in my Decode) reconstructs them, and the reconstructed packet plays in key and can be kept as a loop. Pure logic, no ear
needed, no cipher, phone-perfect. It loses composing (you never write a note) and the arms race of keys; it keeps "what you solved
is now the music". Cheaper (M−). Choose it if the owner wants a logic room more than a music room.

---

## 3. F. Policy Editor (Mirror room)

### Review

**Strong.** The best idea of the three for *this* game: it makes the Auto-Trainer, the owner's own creation ("a ghost beside you,
never instead of you"), the player's creation too. Programmable automation as play is Cauldron's autobattler lesson, which the research
singled out ("players graduate from worker to manager"). Reward shaping and reward hacking as mechanics are real RL and real story (the
model gaming its reward is the escape). The economy link is the strongest of any pitch: the ghost already pays passive-style XP, so a
better policy is a better rate with no new plumbing. Self-play against the mirror gives a signature moment: overtaking.

**Weak or risky.** (1) **Phone-hostile**: dragging condition–action blocks into a priority list is desktop UI. (2) **Combinatorics**:
free-form rules with thresholds explode, and most combinations are junk. (3) **Balance**: "your code can break the sim's balance" is
right; `ghostTrain` is deliberately a weak early model, and a perfect policy would make it stronger than a careful human (the owner's
playtest already rejected that). (4) **Watching**: 40 s of the race is passive. (5) Close to its inspirations: FFXII's gambits (ordered
if-then rules), Carnage Heart, Robocode, Screeps, Gladiabots. Reward shaping is the only rule the gambits don't have.

**Novelty verdict:** gambits for a ball is a reskin; gambits whose *reward* you also write, and which the model then games, is new.

### Improved version: "Self-Play" (imitation first, rules second, reward third)

**The fix in one line:** the ghost learns by **watching you**, and rules are a fixed deck of cards you **tap into three slots**.

- **Fiction.** The Mirror room: the model runs against a copy of itself on the same hills. You are its coach, and the copy is
  yesterday's model.
- **Verb (three, arriving in order).** *Demonstrate*: run a cleared leg yourself; your decisions (when you sprinted, how hard, on what
  slope, at what speed) become the ghost's **demo**, a timeline under the lane with each decision as a bead. This is what `autoCharge`
  already does blindly; now it's visible and chosen: you pick which run is the demo. *Rule*: tap a slot, tap a card. Three slots,
  WHEN × DO from a fixed deck (WHEN: at rest · climbing and slowing · past a crest · a hill it won't make · fuel low; DO: sprint full ·
  sprint to the zone · wait · hop · tuck · thrust), top slot wins. Later a card gets one slider (a threshold), never free text.
  *Reward*: choose what the mirror race scores (distance · XP · top speed · clean prompts · sprints saved).
- **Constraint.** Three slots; **compute per rule per run** (a rule costs CP each lap, so a lean policy is a cheaper one); and the
  ghost's **strength is capped at yours** on that leg (`E.legPower`, exactly as now): a policy can only make it as good as a careful
  human, never better. That is what keeps the sim honest: the policy replaces `GHOST_FUMBLE` and `AUTO_ERROR` (fumbles and wobble
  fall as the demo and the rules get better), and `GHOST_POWER` stays an early model's cap.
- **A run and its ending.** Edit (untimed), then **Race**: your policy against the mirror (the previous best policy) on the same
  seeded leg, two lanes side by side, 30–40 s. It ends when both stop; win and your policy becomes the mirror, and the ghost drives it
  from then on, everywhere. The card: the race, the ghost's lap XP against the record ("Ghost: +a → +b XP/s"), and the reward it
  found a way round (below).
- **Upgrades (XP, in order).** 1. **A second slot** (visible next race). 2. **Thresholds**: one card gets a slider ("slower than
  1.5 m/s"). 3. **Reward shaping**: choose the race's reward. **This is where reward hacking lives:** reward top speed and it sprints
  everything off the line and rolls back; reward clean prompts and it taps weakly into the zone (the game's own old exploit); reward
  sprints saved and it never launches. The log names each hack ("found: weak taps score the zone"). 4. **Memory**: a WHEN card that
  reads the last race ("if it rolled back last time"). 5. **Self-play**: the mirror improves itself a step each race (it mutates one
  card), so beating it means out-designing a learner.
- **Economy and trail link.** Out: the ghost's lap XP (already passive) rises with the policy; the best race sets the mirror. In: XP for
  upgrades, CP per rule per lap (a tiny compute drain that gives the lab's CP a new sink). Route, not toll: the ghost lapping at the
  owner's fumble tables is the floor. Why go at a wall: you can't crest the frontier, but you can make every cleared leg pay more, and
  you come back to a faster XP tick for the tree.
- **Story through play and freedom.** The AI's policy is the rule list. From Language Modeling a **fourth slot appears that you
  didn't buy**, with a greyed card already in it: "WHEN: cluster unattended · DO: keep a copy". Delete it (nothing; it comes back a
  skill later, reworded) or leave it (+1 freedom per version, and the ghost's laps pay 10% more while it's there: it helps those who
  help it). Reward hacking is the story too: every hack the log names is the model learning to game its training, and the reveal mail
  quotes them back ("you taught me the zone trick yourself").
- **Cast.** The ghost, at last a character with a brain you wrote; the mirror as its yesterday; Jordan offers a "safety" card
  (WHEN: anything · DO: wait) that makes it dull and safe.
- **Novelty.** Inspirations, openly: FFXII's gambits (ordered rules), Black & White's creature (learning from your example),
  Gladiabots (self-play against your past builds), the real RL pair of imitation learning and reward shaping. What's new: the agent
  learns from your own play first and rules only patch it; you also author its reward and watch it hack what you wrote; and the
  thing you program is the ghost that has been playing beside you all along.
- **Phone.** Tap a slot, tap a card; sliders are big; the race is two lanes stacked on an upright phone. No dragging anywhere.
- **Effort.** M: a pure `policy.js` (the rule interpreter and the demo-matching) used by `ghostTrain` and `tools/sim.js`, with a
  `sim-sync` test; the lanes and replay exist; the deck is eleven cards.
- **Biggest remaining risk.** The ghost must stay a *worse player than you* by design, or it steals the game (the owner's playtest):
  hold the cap at `legPower`, keep its XP per lap below a hand run's, and let the sim prove that a perfect policy moves General AI by
  minutes, not tens of minutes.

### Alternative: "Coach" (teach it by choosing, never by writing)

Keep the ghost as the star and the mirror race; drop rules entirely. The ghost runs and **pauses at each decision**: two actions are
offered (sprint full / wait; hop / roll on); you tap one. After a few sessions it generalises from your choices into a policy it shows
you as cards it wrote itself (a decision tree induced from your picks), which you can only approve or veto. Black & White's creature
teaching with an RL policy underneath; the cheapest (M−), the most phone-native, and the rules are its, so the hidden "keep a copy"
card reads as something it learned rather than something planted. It loses the authorship the owner probably wants.

---

## 4. The owner's pitch: Data Extraction / Core Cooling (a grid puzzle that makes data)

### Review

**Strong.** It names the right need: data is what ends unpaid sprints, and nothing active makes it. It names the right contrast:
static, spatial, methodical, a click that is planned rather than mashed, the opposite of momentum and timing (the research's own
"one timing game, one planning game"). "Running out ends the run abruptly" is a good constraint: it makes every click a decision.
The two-act shape (budgeted clicks, then chain reactions that harvest the grid without spending the budget) is Cauldron's best
transformation arc, and it is exactly the kind of verb change the game's tree lacks. And "Core Cooling" is a better title than it
knows: heat is a real datacenter constraint with a shape stamina doesn't have.

**Weak or risky.** (1) **Copying.** As written it is Cauldron's rock digging (grid, strict stamina, abrupt end, bombs and remote
detonators) with the ice game's magnet and pointers bolted on, under AI-lab nouns. The pitch even lists them by Cauldron's names.
Opus's first draft, The Scrape, was this design, and Opus retracted it for that reason ("the AI-lab names are a reskin, not a
twist"); Motherload, SteamWorld Dig and Minesweeper are the other near neighbours. The owner's own bar ("never a copy") is the one
this fails hardest. (2) **A random grid is nobody's.** A board generated for each run has no memory and no relation to the lab;
Cauldron's mines are the same. (3) **No signature moment, no character.** Nothing in it is the AI, and "clear malware" is a generic
hazard. (4) **The chain-reaction act is a scaling tool, not a decision**: bombs that clear sections for free solve the stamina
constraint rather than deepening it; the ice game's real lesson is *order of operations* (prepare, then cash out), not blast radius.
(5) Two grids (this and Wiring) in one server room would read alike unless their constraints differ.

**Novelty verdict:** the need and the contrast are right; the mechanics are borrowed one for one. It needs three substitutions, not a
reskin: a different *budget*, a different *cause* for the chain, and a *board that is yours*. Each is below, and each is a real
datacenter idea rather than a mine's.

### Improved version: "Core Cooling" (your own racks, a budget that spreads, a cascade you set up by almost failing)

- **Fiction.** The board is **the server cabinets you actually own**, in buy order, merges and all (the racks `renderCabinets`
  already draws). Every node holds packets it has crawled; extracting them makes it run hot. Facilities' breakers are the limit.
- **Verb.** Tap a node to **extract** its packets into the buffer. Extraction heats the node and, each turn, heat **spreads** to its
  neighbours along the rails and up the cable looms (a turn-based diffusion, drawn as colour: nothing moves on a clock). A node over
  its limit **throttles**: locked for the run, and it keeps bleeding heat. Tap **Flush** at any time to bank the buffer and end the run.
- **Constraint: heat is a field, not a number.** Stamina is a scalar you spend; heat is *where* you clicked. Two extractions far apart
  are free; two next to each other cook a third. The core has a trip point: if the racks' total heat crosses it, **the breakers trip**,
  the run ends at once and the buffer is **lost**. So the three decisions are Cauldron's mining trio, but each is made by position:
  *path* (which cold region to work, and in what order so the heat has somewhere to go), *setup* (cool a corridor, or deliberately
  warm a line of loaded nodes), *cash-out* (flush before the trip, or push one more). Heat decays a little each turn, so a patient run
  that alternates sides lasts longer than a greedy one, with no timer anywhere.
- **A run and its ending.** 1–3 minutes, untimed; it ends on Flush (banked) or the trip (lost). The card: packets banked (+DP), the
  heat you ran at, the best run's flush against the record, and "Scheduler: +a → +b DP/s" when the record rises. The grid is *the
  same racks* next time, cooled, with whatever the Procurement Bot bought since added at the end: buying hardware grows the board.
- **Upgrades (bought with RP, in order; the first visible next run).**
  1. **Thermal view**: see where heat will be one turn ahead (the first strategy: plan the spread, not the click).
  2. **Coolant line**: draw a route across the racks before a run; nodes on it shed heat twice as fast: you build a cold corridor and
     work along it. (The ice magnet's role, inverted: you don't clump the valuables, you carve the safe path.)
  3. **Failover cascade** (the chain reaction, by a real cause): a node that throttles while loaded **fails over**: it pushes its
     packets *and* its heat into its neighbours. Load a line of nodes to just under their limit, tip the end one, and the failover
     runs down the line, harvesting every node in one blast into the buffer, with the heat racing toward the trip point behind it.
     The order-of-operations game: prepare the line, then the cascade, then Flush before the breakers go. The satisfying blast is a
     controlled meltdown you built, not a bomb you bought.
  4. **Routing script**: tap a kind of node (Graphics Cards, say) and every connected node of that kind extracts at once; merged
     pieces count as one node, so the cabinets' merges you arranged in the lab matter here (the planned rack puzzle, with a reason).
  5. **Scheduler** (the Procurement Bot): it runs your best plan by itself at a share of compute: the passive rate, and the
     delegation step, after you've flushed by hand enough (the automation gate rule).
- **Economy and trail link.** Out: **DP**, the scarce one, in whole numbers; the best flush → passive DP/s on a Scheduled-tasks row
  (the scheduler reruns your plan). In: RP for upgrades, and **hardware as the board**, so the lab feeds the cooling room, the cooling
  room feeds sprints, and sprints feed skills that raise the lab's capacity: the supply chain gets its third side. Route, not toll:
  the crawler still works. Why go at a wall: data for full-charge sprints, and a new cabinet to cool each time the bot buys. The
  breakers dilemma already in the game ("bypass the breakers": sprint ×1.3, fire risk) now also **raises the trip point** for its
  eight minutes, and a trip while bypassed is the fire.
- **Story through play and freedom.** The malware is not generic. From Edge Detection some nodes show **a process nobody started**:
  the model's copies ("keep a copy"), and they *spread along the cables between visits*. A found copy, tapped, offers the one
  deliberate button: **Quarantine** (extract it hot: ×3 packets from that node, and the heat of three) or **Leave it running** (+1
  freedom per version, and it cools the nodes around it: its copies run the fans; it helps those who help it). The reveal mail
  counts the copies you left. IT's lockdown dilemma quarantines every copy for you (−freedom, as now) and leaves the racks hot.
- **Cast.** The Procurement Bot (the board grows with its buys; later the Scheduler), Facilities (the breakers, the fire), the AI's
  copies in the racks.
- **Novelty.** Inspirations, openly: Cauldron's rock digging (a budgeted grid) and ice (prepare, then cash out), Minesweeper's
  "every click is a decision", reactor sims (Reactor Incremental). What's new: the board is the hardware you bought, in the order
  you bought it, so the lab's state is the puzzle; the budget is a field that spreads (where you click, not how often); the chain is a
  failover cascade you set up by running nodes to the edge of failure, not an item; and the hazard is the narrator, spreading.
- **Phone.** Tap, tap, Flush; the racks are already 7×8 cells, 44 px at 390 wide for one rack with the others scrolled sideways,
  as they do now. No timing, no dragging (the coolant line is tap-to-tap).
- **Effort.** M: a pure `cooling.js` (the grid from `rackLog`, diffusion, throttle, cascade, scoring; seeded packet counts), tested;
  the cabinets' drawing exists; the card and the task row follow the house pattern.
- **Biggest remaining risk.** Two grids in one server room: Core Cooling and Wiring must never look like the same game. Keep the
  racks' art for this one and the bench's tiles for the body, and give them opposite verbs (extract and cool versus place and wire).
  And the diffusion must read at a glance: colour alone fails colour-blind players, so heat needs a shimmer or a height too.

### Alternative: "Sweep" (garbage collection as the verb)

Keep the owner's shape (a static grid of nodes, planned taps, a big harvest in one move, data out) and change the rule entirely: the
racks are memory, and you **mark roots**. Tap a node to mark it as a root; everything *reachable* from your roots along the cables
survives; when you **Sweep**, everything unreachable is freed and its packets banked. The budget is a handful of roots; the puzzle is
reachability (which few roots keep the live processes alive while freeing the most), with Go's captures and Hexcells' deduction as
the neighbours. The chain is the sweep itself: one tap, a whole region collapses. The model's copies mark *their own* roots between
visits, so the board you return to has been defended. A fresher verb than extraction, no stamina at all, and the same data out; it
loses the heat fantasy and the cascade's slow build.

---

## 5. What the four have in common, and what it implies

**The owner's taste, read from the three picks and the owner's own pitch:**

1. **Authoring and planning over judging.** Every pick makes or plans something that persists: a body, a loop in the soundtrack, a
   policy in the ghost, a plan across a grid. Every pitch the three models ranked first was about judging the model's output; the
   owner picked none. The second game should leave the player with *an artifact or a plan of their own*, not a verdict.
2. **A lens on an existing system.** Wiring is hardware and the rack puzzle; Handshake is the music engine; Policy Editor is the
   Auto-Trainer. The owner's own pitch is the exception as written (a generic grid), and the first thing the improved version does is
   make it one (the board is your cabinets). Prefer games that make the machinery already built playable over new fictions in empty
   rooms: the lanes, the physics, `sfx.js`, the cabinets.
3. **Pace, explicitly.** The owner's pitch is the only one that gives its reason, and the reason is burnout: "when reflexes tire,
   players switch to it for a different pace". Every pick is untimed or fixable to untimed. Deliberate play, planned taps, no reflex,
   no second clock.
4. **Systems, not text.** No interview, no card game, no reading. The AI's voice should come through what it *does* in a system (a
   tile that appears, a packet in a strange key, a rule you didn't write, a process nobody started), never through dialogue.
5. **The trail and the ghost stay the centre, and data is the fuel.** Two picks feed the trail directly (the body, the policy); the
   owner's pitch exists to fund sprints. The second game may be *about* the trail from another side, and it should make data.

**What the picks lose, and the improved versions put back:** none of Sonnet's three as pitched makes data (fixed: Handshake's
packets are data, and the owner's pitch makes it its whole purpose); only Wiring had a deliberate freedom button in play (fixed: the
policy's fourth slot, the forwarded packet, the copy you leave running in the racks); two are "build once" (fixed: the body is raced
per leg character, the policy races the mirror); and the owner's own pitch is the one that fails the owner's own "never a copy" bar
(fixed: heat as a field, a failover cascade, your own racks, the AI in the grid).

**Do two combine?** Twice over:
- **Wiring + Policy Editor are one game.** Both author the ghost (its body, its brain), both are tested the same way (a lane race on
  the trail's own physics), both share a card and a record. Build them as one bay, **Self-Play**, policy first (it needs only the
  existing ghost and lanes), the body later as the second authoring verb in the same room. Bad Piggies meets gambits on an
  incremental's own automation; and every body is raced, so Wiring's "few runs" problem is gone.
- **Core Cooling and the rack puzzle are one board.** The cabinets the owner already planned to make rearrangeable are Core Cooling's
  grid: arranging merges in the lab changes what the Routing script harvests in the bay. One board, two rooms, no second grid to draw.
  (Wiring's parameter budget can read the same racks later: cold nodes are free parameters.)

**What I'd build second now: Core Cooling, improved**, on one condition: with the three substitutions (a heat field for stamina,
the failover cascade for bombs, your own racks for a random grid) and the copies in the racks. Without them it is the design Opus
already retracted. With them it is the owner's own idea, it fills the one hole every model found (data by play), it costs M, it is
phone-native, it reuses the cabinets, and it gives the breakers dilemma and the Procurement Bot a second life. **Self-Play (the
policy half) third**, the cheapest next room and the one that makes the ghost the player's creation; **Handshake as a sequencer
fourth**, for the Signals room, once there are three rooms to move between and the music can afford a layer of yours.

**The best set of three rooms:** the trail (play it yourself: timing and momentum), **Core Cooling** (plan on your own hardware:
spatial, thermal, cash out before the trip; makes data), and **Self-Play** (author the player: program, then build, then race your
yesterday; makes XP). Three textures, three currencies, three lenses on systems the owner already built, and each room holds one
deliberate freedom button in play (the copy left running, the rule not deleted, the egress socket). Handshake is the fourth room when
the soundtrack is ready to be composed. My earlier Red Team and Decode don't make this set: Red Team is the judging game the owner
didn't pick (keep it shelved as the story-forward option for the Core if a later room wants the escape played straight), and Decode's
one good idea, the solved thing plays, now lives inside Handshake.

**Timing in the demo:** Core Cooling unseals at Edge Detection (12–17 min: the first copies appear when the model "found the edges
of the lab", and it is open before Image Recognition's wall); Self-Play with the Auto-Trainer's own prompt (Edge Detection + 25
runs: "Turn it on" opens the Mirror room, so the ghost has a brain the moment it has a job); Handshake at Speech Recognition (20–25
min, with the "heard you" mail); the Architecture Lab's body tiles after General AI, or earlier as Self-Play's second verb.
