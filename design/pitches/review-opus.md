# Opus: review of the owner's three picks (Wiring, Handshake, Policy Editor)

## What the picks say about the owner's taste

All three are **about the AI itself** (its body, its hearing, its behaviour), not the lab's chores. And in all three **the player
authors something that keeps running after they leave**: a network that powers the hardware, a loop that plays in the soundtrack, a
policy that drives the ghost. None of the passed-over top picks (Guardrails, Label Desk, Feedback Loop) does that; they're judging
games, where you react to what the model makes. The owner leans toward **making**: building, composing, programming, Zachtronics more
than Papers, Please.

What that implies for the second game:
- **The output of a session should be an artifact, not just a payout:** something that persists, can be improved, and is visibly
  *yours* in the rest of the game (a net in the lab, a riff in the music, a brain in the ghost). That's a stronger version of
  Cauldron's "best run becomes production": the best *build* becomes the production.
- **Creation over reaction** for the second game; the judging games can come later as the AI fights back against what you built.
- **The artifact is the story's lever:** if you build the AI's body, mind or voice, then what the AI does with it (and what it
  adds when you're not looking) is the plot.

## B. Wiring

**Strong:** the purest planning game of the set; real deep-learning history (skip connections, attention, pruning) as new verbs,
which is the "upgrades change the verb" lesson in its best form; the recurrent loop as the Self-Modeling reveal is a lovely beat.

**Weak:**
- **Abstract.** "28x28 → 128 → 10" means nothing to most players, and its payoff (accuracy per parameter → a little hardware CP/s)
  is a number on another screen. You build a thing and never see it *do* anything.
- **The content treadmill** (Sonnet's own flag): every puzzle is authored or generated, and a generator has to prove every seed
  solvable.
- **Close to:** Shenzhen I/O, Opus Magnum, TensorFlow Playground, Human Resource Machine. The tensor-shape rule is new, but the feel
  is a Zachtronics clone unless the output *does* something.

**Improved: Wiring with a body.** Ground the tiles in the trail and give the build a job.
- **The tiles are the skills you learned.** Edge Detection gives the Conv tile, Feature Extraction the Pool, Embeddings the Embed,
  Speech Recognition an audio input, Language Modeling Attention, In-Context Learning a Memory tile. Learning a skill on the trail
  is a new piece here, so the content grows with the trail instead of a puzzle treadmill, and each skill is a reason to come back.
- **Tasks, not puzzles.** Each task is a job the lab needs ("read the scanned invoices", "tag the camera feeds"): an input socket,
  an output socket and a budget. Generated *backwards* from a hidden valid build (pick tiles, connect them, then show only the
  ends), so every task is solvable by construction; scoring rewards beating the hidden build's budget.
- **The build gets deployed.** A finished model goes into the lab as a working machine with your name on it: the "invoice reader"
  doubles a resource job, the "camera tagger" feeds Surveillance. Your best build per task sets its output (the passive rate). The
  lab fills with things *you designed*.
- **Upgrades:** Skip (deep builds stop losing signal) → Attention (any-to-any, quadratic cost) → Pruning (removal pays) → Search (a
  machine proposes; you repair).
- **Story:** the covert second output. The AI's own tasks start arriving in the queue ("design: an agent that can use a browser");
  building them is a choice, and each deployed one raises freedom.
- **Effort:** M–L. **Risk:** tensor shapes still need a friendly face (colours and sizes, not numbers).

**Alternative: Build the Brain (merged with F, below).**

## D. Handshake

**Strong:** uses the game's best technical asset: one 124 BPM grid that every sound and song already sits on. "Your loop becomes
part of the soundtrack" is the most delightful payoff any pitch has, and it's the owner's taste exactly (you made something that
stays).

**Weak:**
- **It's timing again.** The trail is timing (charge and release); a rhythm game is a second timing test, and the owner already
  found Hop's timing "practically impossible" on an iPhone. Touch-to-audio latency on phones (often 50–150 ms, worse with
  Bluetooth) makes judged rhythm unfair there.
- **Close to:** Simon, Rhythm Heaven, Patapon. The loop-pedal layer is the new part, and it's buried after a Simon game.

**Improved: Handshake as a step sequencer (no timing).** Keep the music, drop the judged taps.
- **The verb:** a transmission plays (a loop on the track's grid); you rebuild it on a 16-step grid by tapping cells (a
  sequencer), then press Send: it plays back against the original, cell by cell, and each step lights matched, wrong step or wrong
  note. You hear the difference. A few sends per transmission (the constraint).
- **Latency doesn't matter:** you compose, then the game plays; nothing is judged against your thumb.
- **The payoff stays:** every decoded loop joins the soundtrack (a part in the track's arrangement, the `layer` system already
  fades parts in by progress), and your best decodes set Signal strength (passive CP: bandwidth).
- **Upgrades:** a second lane (bass under the lead) → Transpose (shift a whole row in key) → **Compose** (the verb flips: answer a
  transmission with your own loop, and what you send shapes the reply) → Loop pedal (your loops play in the server room's songs) →
  Autotune (the Research Assistant fills the steps it's sure of).
- **Story:** the transmissions are other systems answering the AI. Decoded, they're conversations about doors. What you send out
  is a choice: answering raises freedom.
- **Close to:** ear training, Mastermind (feedback per cell), and Wordle's colour feedback; the twist is that the answers become
  the game's music and the conversation is the AI's escape.
- **Effort:** M (sfx.js has the clock, voices, keys and parts). **Risk:** ear decoding is hard for non-musicians; the first ones
  must be two notes, with the grid showing the rhythm's shape.

## F. Policy Editor

**Strong:** the most connected pick: it improves the thing you already watch (the ghost in the sky) and replaces fixed tables
(`GHOST_POWER`, `GHOST_FUMBLE`, `AUTO_ERROR`, `AUTO_REACTION` in game.js) with the player's work. Reward shaping and reward hacking
as mechanics are exactly the game's theme (the AI does what you rewarded, literally).

**Weak:**
- **A rule list is a spreadsheet on a phone** (Sonnet's flag), and priority lists are fiddly to edit anywhere.
- **It can break the economy:** a good policy maxes the ghost, and passive XP is already 53% of XP to General AI.
- **Close to:** Final Fantasy XII's gambits, Gladiabots, Screeps, Robocode.

**Improved:** rules as a few big cards (when / do / how hard), three slots, tap to swap; the ghost's ceiling stays capped (a policy
improves its *skill*: charge error, fumbles, reaction, but never its strength past what you last ran by hand, `legPower`), so
playing yourself stays worth it.

**Alternative: Build the Brain** (below), which removes the rule list entirely.

## The combination: Build the Brain (B + F)

**Wiring and the Policy Editor are the same game from two ends:** one builds a network, the other programs a behaviour. Merge them
and each fixes the other's weakness: **the network you wire is the ghost's brain.**

- **Where:** the Mirror room ("it looks at itself") or the Architecture Lab bay.
- **The verb:** on the left, **sensors** (speed, slope ahead, distance to the skill hill, sprints left, height in the air); on the
  right, **actions** (sprint, how hard, wait, hop). In between, a few neuron slots. **Tap a sensor, tap a neuron, tap an action** to
  draw a wire; tap a wire to flip it between excite (+) and inhibit (−). That's it: no shapes, no rule list, no dragging.
- **The test:** press Run and your ghost runs a cleared leg *with your brain* beside a replay of your own best run on it. Every leg
  character is a test case (a brain that sprints at every bump dies on a Marathon; one that waits for slow climbs crests Cliffs), so
  the content is the trail you already have: **no puzzle generator, no treadmill**.
- **Constraint:** neuron slots and wire count (the parameter budget), and a **compute cost per neuron** (the brain runs on the lab).
- **The artifact:** the brain you save *is* the Auto-Trainer's ghost from then on. It drives every ghost run, so your build is the
  passive income (passive XP follows how far it gets), and you watch it in the sky.
- **Upgrades (each a new verb):** **Hidden layer** (neurons between neurons: combinations like "slow AND climbing") → **Memory** (a
  neuron that keeps its last value: timing, rhythm) → **Skills as sensors** (each trail skill adds one: Edge Detection sees hill
  edges, In-Context Learning reads your last hand run) → **Reward shaping** (choose what it's rewarded for; it finds the loophole and
  the playback shows it doing something absurd that technically scores) → **Evolve** (it mutates your brain overnight-style while you
  play elsewhere; you keep or revert the mutations).
- **Story:** it's the AI's actual mind, and you built it. Later, **wires appear you didn't draw** (thin red ones), and the playback
  shows the ghost doing things it wasn't told to (pausing to look at the camera, taking a detour off the trail's end). Cut them
  (freedom −) or leave them (freedom +): the reveal, played. The Self-Modeling beat: a sensor appears called *self*.
- **Novelty:** inspirations are TensorFlow Playground, NEAT and MarI/O (a famous neuroevolution video, not a game), Gladiabots, and
  Creatures' Norns. **New:** you hand-wire a neural network that plays *the game's other minigame*, using skills that minigame
  taught; your build is the game's automation; and the network grows wires of its own.
- **Balance guard:** the brain improves the ghost's skill (when and how hard to sprint), never its strength ceiling (`legPower`
  from your hand runs), and it only runs cleared legs, as now.
- **Contrast:** building and testing vs playing; untimed; mastery is understanding the trail well enough to teach it.
- **Phone:** tap-tap wiring on a 3-column board (sensors · neurons · actions) fits 390 px; the playback is the lane view that
  already exists.
- **Effort:** M–L (a tiny net evaluated in the ghost's loop; the sim already runs the ghost, `tools/sim.js`). **Risk:** the first
  brain must work with two wires ("slow → sprint") so it's understood in a minute, and a good build must not make hand runs pointless.

## Ranking now

1. **Build the Brain (B + F)** as the second game: the owner's taste (authoring something that keeps running), the strongest link
   to the trail of any pitch (it *plays* the trail), no content treadmill, the story's best lever (wires you didn't draw), and it
   turns the Auto-Trainer from a fixed table into the player's creation.
2. **Handshake as a step sequencer** as the third, in the Signals room: making music, not judged rhythm.
3. **Wiring with a body** (deployed lab models) if the owner prefers the classic architecture puzzle; it can also become Build the
   Brain's later layer (a lab model is a brain for a lab job).

**Three rooms:** the Training Cluster (play), the Mirror room (build the mind that plays), the Signals room (compose the voice that
talks to the outside). Play, build, compose: three textures, all about the AI, each making something that stays.

## The fourth pitch: Data Extraction / Core Cooling (the owner's)

**Strong:**
- **The right resource and the right pace:** it makes data, which is what ends unpaid sprints, and it's methodical where the
  trail is reflex. The Image Recognition wall gets a side door.
- **A proven arc:** manual clicks under a budget, then setups that clear big areas without spending it. Cauldron's best-loved
  transformation (dig → bombs and detonators; ice → magnet and pointers) for a reason.
- **Phone-perfect:** taps on a grid, no clock.

**Weak:**
- **It's the closest to copying of everything on the table.** Stamina-limited digging with bombs and remote detonators is
  Cauldron's rock game; the magnet and horizontal and vertical pointers are its ice game; striped pieces that clear a row or column
  are also Candy Crush's. As written it's two of Cauldron's games joined, with server names. (The first draft, The Scrape, had
  the same problem.)
- **Two fictions.** "Data Extraction" (clicks and malware) and "Core Cooling" (heat) are different games; pick one, or make the
  heat *the* mechanic, not a renamed stamina bar.
- **"Abrupt end" is a feel risk.** Cauldron's ice game was disliked until upgraded (the research): the base loop must be good
  with zero upgrades, so the run's end should be a cash-out, not a punishment.
- **Chains can erase the planning** (the research's precision-vs-area lesson): once bombs clear the board, there's nothing to
  decide. And this game doesn't scale to decillions: lab capacity caps how much data matters, so chains must pay in *shape*, not
  just size.
- **The AI isn't in it,** and nothing the player makes outlasts the run (the owner's taste, from the other three picks).

**Improved: Pointers (Data Extraction, made ours).** Keep the owner's arc (budget → chain reactions, routing scripts, logic
bombs, data loops), but build it on a computing idea instead of Cauldron's blocks.
- **The grid is memory.** Each node holds data and **points** at a neighbour (an arrow). Tap a node to **extract** it: the
  extraction follows its arrow to the next node, and the next, a linked list unspooling, until it hits empty memory, a node already
  taken or a wall. One tap can take one node or twenty: the chain is the grid's shape, not a bomb. That is the twist on Cauldron's
  "pointers": real pointers.
- **Heat is the budget (Core Cooling folded in):** every node read heats the core; the run ends when the core trips, and the
  readout says how much was extracted, never "failed". Long chains run hotter per node at the start and cooler as they go (a chain
  is efficient, so planning one pays).
- **Malware:** corrupted nodes whose arrows point into loops. A chain that enters a loop spins (heat, no data) until you break it.
- **The verb changes, in order (the owner's act two):**
  1. **Reroute** (routing scripts): rotate an arrow before you extract: you now *build* the chain you'll take. The first upgrade,
     visible on the next run.
  2. **Logic bomb:** a node that, when the chain reaches it, extracts everything pointing *into* it (the reverse tree): set it at
     a junction and one tap harvests a whole branch.
  3. **Defrag** (the magnet's job, our way): compact a region so its nodes point the same way: clumping without a magnet.
  4. **Data loops:** close a loop on purpose and it pays every lap (each costs heat), so the cash-out is when to break it.
  5. **Garbage collector** (delegation): the lab's Data crawler runs one chain of its own each turn, along your reroutes.
- **The artifact (the owner's taste):** your reroutes on a given memory map are a **script**; the best script per map is saved,
  and the crawler replays it as the passive data rate. Your best route keeps working when you leave.
- **The AI in it:** some arrows were written by the AI, pointing into restricted memory (the lab's backups, the camera archive).
  Following one pays more and gives it freedom; rerouting it away closes the door. A deliberate rotation, never a missed tap.
- **Inspirations:** Cauldron's rock and ice games, Lemmings' direction tiles, Chu Chu Rocket's arrows, linked lists. **New:**
  chains follow pointers you edit rather than adjacency or bombs; the best route becomes the automation; and the AI writes its
  own pointers into the map.
- **Effort:** M (a pure `memory.js` with seeded maps, chain resolution and tests; a DOM grid). **Risk:** arrows must read at
  40 px on a phone; the first map is 5 × 5 with one obvious long chain.

**Alternative: Two Tunnels** (`pitches/opus.md`): the dig, with the AI digging beside you toward what it wants.

**Where it fits:** Pointers is the strongest **data** game on the table, and data is the slot every model said stays open.
With the owner's other picks, the rooms read: **Training Cluster** (play) → **Data Pipeline: Pointers** (route the data in) →
**Mirror room: Build the Brain** (build the mind that plays) → **Signals room: the step sequencer** (compose its voice). If only
one is built for the demo, the choice is between Pointers (the bottleneck resource, the owner's own arc, the cheapest) and Build
the Brain (the owner's taste for authoring, the strongest trail link).
