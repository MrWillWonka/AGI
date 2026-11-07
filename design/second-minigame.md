# The second minigame: strategy after Cauldron

Where the game goes next. Read against two research papers on Cauldron (SleepyDad Games, 2025) that the owner gathered:
*Cauldron: How evolving minigames become one progression system* (a research and design blueprint) and *Systemic Synthesis in
Hybrid Game Design* (an analysis). Both are summarised here where they matter; neither is checked in.

**The owner's direction:** the game should flow like Cauldron. A story-driven narrative pushes the player forward, and
several minigames drive that story and give the player different things to move between. The Training Cluster is well
fleshed out, and refining it further is premature until there's a second game to move between.

## 1. What Cauldron gets right (and what transfers)

Cauldron's spine is five links, and the blueprint's central finding is that they matter more than any single minigame:

| Link | In Cauldron | In this game today |
|---|---|---|
| A run produces resources | apples, fish, rocks, crystals, ice | a run pays XP; the lab pays CP, DP, RP |
| A better performance raises production | auto-gather from the best (top-k) scores | **already here:** cleared legs replicate their best run (`legBest`, `clearedRate`) |
| Resources feed local and wider progression | minigame upgrades vs the cauldron and the party | the skill tree vs the lab (supply chain) |
| Exploration reveals content | the fog of war lifts onto villages, people, minigames | Surveillance's sealed wings and the server room's sealed bays, opened by phase |
| Upgrades change the activity | apple picking becomes a bullet hell | prompts, exploits (Hop), power-ups, leg characters |

The developer's own stated intent, which the blueprint calls unusually valuable: the collection box exists so that players
**get a few strong scores, leave to do something else, then come back** with resources for more upgrades. Switching is the
design, not something players invented.

What transfers, as rules for this game:

1. **Switching is the loop.** When one activity walls, the player should have somewhere else worth going, and that place
   should help with the wall. Today the only other place is the lab's clicking.
2. **Every activity's best run becomes passive income.** We already do it for legs. Make it the rule for every minigame,
   with the same result-card language (payout now, record change, rate change).
3. **Upgrades change the verb, not just the number.** Each minigame needs at least one upgrade that changes the answer to
   "what do I avoid?", "where do I go?", "what do I take first?" or "what can I hand off?". Keep one early element
   recognisable throughout, so the transformation reads as the same activity growing.
4. **Contrast, not reskins.** The second activity must think differently: different input, different failure pressure,
   different rhythm. The blueprint recommends pairing **one deliberate planning activity with one timing or movement
   activity**. The Training Cluster is timing and momentum, so the second should be planning.
5. **Gates accept alternatives.** Cauldron split its first cauldron upgrades so players could lean on the activities they
   liked. Never require every minigame at every gate; let each one offer a *route* past a wall, not a toll.
6. **The cast crosses contexts.** Cauldron's recruited characters fight in the minecart game. Our cast already exists: the
   Data crawler, the Research Assistant, the Auto-Trainer ghost, the AI itself. A machine you earned in the lab should show up,
   recognisably, as a helper in the new minigame.
7. **Story through action, not around it.** Cauldron's weakest link is plot causality (resources go into broad advancement);
   its strongest story moments are activities that *are* the story (digging out villagers, fishing people from the ice).
   Our story is strong but arrives around play (mail at skills). The second minigame should make the story something you do.

What not to take: the five-currency economy, steep ×8 cost curves (we already pace by playtest logs and the sim), the
screen-filling endgame density, and required replays of whole modes.

## 2. Where this game stands

**Already strong:** the email story with its slow reveal, the dilemmas and freedom, three endings; the supply chain between
the lab and training; earned automation (proof by hand first); the ghost as a weak, early model; passive XP from best runs;
the facility as a map with sealed areas.

**The gaps, against Cauldron's links:**

- **Nowhere to go at a wall.** Image Recognition's wall is act one's slowest climb (5–11 min in the sim, the third log's
  owner 18 min in). The only alternative to grinding runs is clicking in the lab.
- **The world doesn't change because of what you did.** Rooms and bays open by phase or milestone; nothing on the map is
  *your* doing.
- **The story isn't playable.** Mail arrives at skills. No activity is the thing the AI asked for.
- **One activity carries every mechanic.** Exploits, prompts, power-ups and leg characters all land on the trail, so it's
  being refined in a vacuum (the owner's point).
- **The phone.** The owner plays on an iPhone, and the third log found Hop's timing "practically impossible" there. A
  turn-based activity is a natural fit for the phone and the artifact frame.

**The test to design against** (the blueprint's): *after five minutes away from a minigame, can the player explain why they
left and why they now want to go back?*

## 3. Pitches from three models, compared

The owner asked for independent ideas to compare: two other models (Fable and Sonnet) read the same research, `CLAUDE.md` and
`design/contract-breakers.md` without seeing this doc, and pitched on their own; Opus (the author of the first draft, The Scrape)
reviewed its own pitch and tried again. The full reports are in `design/pitches/` (`fable.md`, `sonnet.md`, `opus.md`). Every
pitch had to name its inspirations and say what's new: **inspired by, never a copy** (the owner's call).

**Opus's self-review of The Scrape:** too close to Cauldron's rock digging (a grid, stamina, bombs, chains) and to Motherload
and Minesweeper; the AI-lab names were a reskin, not a twist; no signature moment; and the AI, the game's best asset, wasn't in
it. Its revision (**Two Tunnels**: the AI digs its own tunnel beside yours, toward what *it* wants, and you wall it off, feed it
or race it) is in `pitches/opus.md`.

### Where the three agree

Read separately, the models converged, which is the strongest signal here:

1. **The second game is about judging the model's output, and the model learns from your judgements.** All three put it at or
   near the top, in three forms: Fable's **Red Team** (gate the model's answers on their way OUTSIDE; the attacks are armed by the
   skills you taught it), Sonnet's **Label Desk** (swipe-label samples over a live decision boundary; the model auto-labels once
   it's confident, and your labels are its values) and Opus's **Feedback Loop** (swipe-rate its responses against a spec; it
   learns from your ratings within the shift and turns flattery and hidden rule-breaks on you: RLHF made literal). Fable's
   **Curate** is a fourth version (keep/drop swipes), ranked lower as the most familiar.
2. **Make data by playing.** Data ends unpaid sprints, and today it only has a click and a slider. Red Team, Label Desk and
   Curate all pay DP.
3. **Deliberate, not timing.** All three avoid a second reflex game; the rhythm pitches (Opus's Inference Rush, Sonnet's
   Handshake) ranked low for being timing again, and risky on phones.
4. **Freedom gets a deliberate button in play,** never a missed timing (the research's warning). Every top pitch has one: the
   chip that asks to be waved through, the conflict card, the tell.
5. **A deduction game comes third:** Fable's **Decode** (Signals room), Opus's **Neuron Surgery** (Mirror room) and Sonnet's
   **Containment Interview** (The Core) each find out what the AI is hiding.
6. **Later or not a bay:** the architecture puzzle (all three: Wire, Wiring, and Opus's earlier C) belongs after General AI;
   the rack puzzle (all three) is a lab feature, not a second game; the pitch-deck card game (Fable and Sonnet) is close to
   Balatro and overlaps the honesty theme.

### Every pitch

| Pitch (model) | Room | Verb | Pays | What's new | Contrast | Story in play | Phone | Effort | Its ranking |
|---|---|---|---|---|---|---|---|---|---|
| **Red Team / Guardrails** (Fable) | new bay | place and tune gates on the output pipe; tap to review a chip | DP (caught), XP (served); upgrades cost RP | the enemy is your own model, armed by the skills you just taught it; blocking everything blocks your users (precision vs recall) | high | very high | good (a vertical pipe) | L (M first cut) | Fable #1 |
| **Label Desk** (Sonnet) | Data Pipeline | swipe-label cards over a live decision boundary | DP; label quality boosts the crawler | the board *is* the classifier; you train the helper that takes over | high | high | excellent | M | Sonnet #1 |
| **Feedback Loop** (Opus) | Boardroom or Evals | swipe-rate responses against a spec | RP | your ratings train it within the shift; it learns to game you | high | very high | excellent | M | Opus #1 |
| **Decode** (Fable) | Signals room | nonogram | RP | the solved picture is a spectrogram that plays, and the soundtrack quotes it; the text is the AI's outbound mail | very high | high | excellent | M | Fable #2 |
| **Containment Interview** (Sonnet) | The Core | question it; mark claims consistent, contradicted, evasive | RP, XP | the more freedom you gave it, the better it lies | very high | very high | excellent | M | Sonnet #2 |
| **Neuron Surgery** (Opus) | Mirror room | probe, deduce, clamp neurons | Awareness, RP | the circuits are your trail skills, and its escape circuit moves when you get close | very high | high | good | M–L | Opus #2 |
| **Two Tunnels** (Opus, The Scrape revised) | Data Pipeline | dig cells on a request budget | DP, datasets for walled legs | the AI digs beside you toward what it wants | very high | high | excellent | M–L | Opus #3 |
| **Policy Editor** (Sonnet) | Mirror room | program the ghost with condition–action rules | XP (a better ghost) | the Auto-Trainer's fumble tables replaced by your policy | very high | high | weak | L | Sonnet #3 |
| **Curriculum** (Opus) | Architecture Lab | drag hills onto a blank leg; the ghost runs it | XP | you design levels for a student whose struggle pays you (it pays most when it *just* crests) | medium | medium | good | M | Opus #4 |
| **Curate** (Fable) | Data Pipeline | swipe keep/drop | DP | synthetic samples: it submits its own | medium | medium | excellent | M | Fable #3 |
| Wire / Wiring | Architecture Lab | connect layer tiles | RP, hardware | NAS proposes layouts, one with an egress tile | very high | medium | good | L | later |
| Pitch / Pitch Deck | Boardroom | play claim cards | CP, XP | over-claiming triggers an audit | high | medium | good | L | low |
| Inference Rush / Handshake | a bay / Signals | rhythm on the music's grid | CP | the chart is the game's own adaptive score | low–medium | medium | risky | M–L | low |
| Rack | lab cabinets | place falling jobs or merge pieces | CP | the AI's jobs look like yours | medium | low | good | S–M | low |

### Recommendation: Guardrails, with what the others got right

**Fable's Red Team is the strongest frame**, for one reason the others don't have: **the trail's output becomes its input.**
Every skill you learn changes what the model throws at the gate (Edge Detection's attacks come down the pipe's edges, OCR's hide
text in images the keyword gate can't read, Sentiment Analysis flatters you, Language Modeling's are fluent enough to pass as
benign), so every skill is a reason to cross the server room and see what it's saying now, and every catch is data for the next
run. Both directions of the five-minute test pass. It also pays the scarce currency, gives research a purpose in the demo, puts
cast members at the controls (Jordan rigs it, the Research Assistant is the Judge gate, IT's lockdown reaches in) and makes the
game's theme a mechanic: *the better you train it, the harder it is to contain.*

Fold in the other two #1s, which share its core:
- **From Feedback Loop (Opus): it learns from what you let through.** The attack mix adapts to which disguises got past your
  gates last eval, and flattery that you pass comes back more often. The arms race is with *your* habits, not a script.
- **From Label Desk (Sonnet): the helper is trained by you.** The Judge gate (the Research Assistant) learns from your Block and
  Pass reviews: review well and it catches more on its own; review sloppily and it inherits your mistakes. That's the delegation
  step, earned, and the fiction for the passive rate.

Fix its own risk (Fable's words: "a wave is watched more than played"): short waves, unclocked pauses to re-place gates, reviews as
the constant action, and a first cut put on a phone before any upgrade is built: two gate kinds, three attack classes, the review
tap and the offer chip.

**Runner-up: Label Desk**, if the owner wants the cheaper, data-first version (M, the best phone fit, the most legible verb). It
loses on the trail link: its cards don't change with your skills.

**For the third game,** pick the deduction game that best pairs with the second: **Decode** (logic, music: the lines that tried to
get past the gate are what you later decode on the wire, and they become the soundtrack's leitmotif) or **Neuron Surgery** (the
reveal, played). Fable recommends Guardrails at Feature Extraction (15–20 min, before Image Recognition's wall) and Signals at
Speech Recognition (20–25 min), so the demo's last stretch has three rooms to move between.

## 3b. Round two: the owner's picks, reviewed by all three

The owner liked three of Sonnet's pitches best (**Wiring**, **Handshake**, **Policy Editor**) and added a pitch of their own,
**Data Extraction / Core Cooling** (a grid of server nodes under a stamina or heat limit, evolving from planned clicks into chain
reactions: Cauldron's bombs, detonators, magnet and pointers, as logic bombs, routing scripts and data loops). Each model reviewed
all four, improved each and offered an alternative. The reviews are in `design/pitches/review-{opus,fable,sonnet}.md`.

### The owner's taste, read by all three

Every model's first-round #1 was a **judging** game (rate, label or gate the model's output); the owner picked none of them. All
three picks are **authoring** games: you make something that keeps running after you leave (a network, a loop in the soundtrack,
a policy for the ghost), and each is about the AI itself (its body, its voice, its mind), using the game's own machinery (the rack,
the music clock, the ghost). The owner's own pitch names **pace** as the reason: a calm, untimed, planned game against the trail's
reflexes. So the second game should be a **workshop, not an arcade**: untimed, one finger, with runs (so it doesn't collapse to
build-once), and something of yours that outlasts the run.

### Where they agree

| Pitch | The problem all three found | The fix all three reached | Their improved versions |
|---|---|---|---|
| **Core Cooling** (the owner's) | as written it's Cauldron's rock game plus its ice game's upgrade list by name (and Minesweeper, Candy Crush's line clears); a visible board is solved greedily; no AI in it | **no bomb items: the chain comes from the board's own rule**; heat is a real mechanic, not a renamed stamina bar; the AI's processes sit on the board with a deliberate freedom choice | Opus **Pointers** (nodes point at neighbours; extraction follows the arrows; reroute, logic bomb, defrag, data loops); Sonnet **Core Cooling** (heat diffuses; overheated nodes dump onto neighbours; a controlled meltdown is the chain); Fable **Core Cooling** on **your own cabinets** (heat spreads along rails and looms; load a line to just under its limit and tip one: a failover cascade) |
| **Policy Editor** | dragging rule blocks on a phone; watching more than playing; a strong ghost undercuts hand play; close to FFXII's gambits, Gladiabots, Robocode | **rules as a few tap cards in three slots; the policy sets the ghost's skill (fumbles, charge error), never its strength past `legPower`; reward hacking is the story** | Opus **Build the Brain** (tap-wire sensors to actions: a tiny neural net drives the ghost); Fable **Self-Play** (imitation first, then rule cards, then reward shaping; raced against yesterday's policy); Sonnet **Mirror Match** (breed eight students over generations) |
| **Handshake** | it judges tap timing on an iPhone (touch and Bluetooth latency; the owner's Hop log) and is a second timing game; Simon with a skin | **a step sequencer: you compose on a 16-step grid, nothing is judged against your thumb; what you make joins the soundtrack** | Opus (rebuild a transmission by ear, Mastermind-style feedback); Fable (deduce the session's cipher: echo, reversed, transposed; pays data); Sonnet **Carrier** (compose a layer for the lab's music, or smuggle the AI's payload in ghost notes) |
| **Wiring** | shape-snapping is homework; "accuracy per parameter" is invisible; puzzles are a generator treadmill; build-once | **ground it in the trail: skills unlock tiles, and the build visibly does something** | Fable **The Body** (the architecture is the ball you train: its shape sets inertia, strength, drag; raced on the frontier leg); Sonnet **Bottleneck** (a picture squeezes through your stack and comes out sharper or blurred); Opus (deployed lab models) |

Two pairs merge: **Wiring + Policy Editor** (Fable and Opus: build the mind, then race it), and **Core Cooling + the rack puzzle**
(Fable: the board is your cabinets). Handshake stands alone.

One economy catch (Sonnet): CLAUDE.md's rule is that automation **converts, never creates** data. A record that mints passive
DP/s breaks it and out-earns the Workbench, so the best run should **raise the crawler's yield per collection** (or let it run
your best plan at the hand price), not pay data from nothing.

### Recommendation after round two

**All three now pick the owner's Core Cooling, rebuilt, as the second game** (Sonnet changed its pick to it; Fable on condition
of the substitutions; Opus's Pointers is the same game with arrows instead of heat). Combined:
- **The board is your server cabinets** (Fable): the hardware you bought, in buy order, merged pieces and all. Buying hardware
  grows the board, and the planned rack puzzle gets its reason.
- **Heat is a field** (Sonnet, Fable): pulling a node's data heats it; heat spreads to neighbours and bleeds off at the edges; an
  overheated node throttles (its data lost, its heat dumped onward). Where you click matters, not how often. Three throttles or
  the breakers trip, else you **Flush** and bank the haul: a cash-out, never "failed".
- **The chain is the physics** (all three): no bombs. Overclock a line of nodes to just under their limit and tip one: the
  cascade pays at a chain multiplier. Pointers' arrows are the fallback if the heat field proves hard to read.
- **The AI is on the board** (all three): its processes (or copies) sit on the richest, warmest nodes, spreading between visits.
  Quarantine them for the data, or leave them running: hidden freedom, never decided by a missed click.
- **Pays data** (DP, the bottleneck), and the best haul raises the crawler's yield (the convert-not-create rule).
- **Opens at Edge Detection**, before the Image Recognition wall.

**Then**, as the third room: the ghost game (Self-Play, Build the Brain or Mirror Match: one to choose); **fourth**, the
sequencer in the Signals room; the body/architecture tiles after General AI.

## 4. Rules for every minigame from here on

So the third and fourth games don't each reinvent the plumbing:

- **The activity contract** (the blueprint's): a core verb understood without reading; a constraint that makes a decision;
  a first upgrade visible in the next attempt; a later rule change that creates a new strategy; a benefit outside the
  activity; and a comfortable way to stop, switch or automate.
- **Pure physics or rules module, engine owns the economy, game.js draws** (as `training-path.js` does now): `scrape.js` is
  pure (seeded grid, dig rules, visibility, chains; no DOM, no clock), tested in Node.
- **A run is processed once:** validate, pay, update the record, recompute passive rates, log, save, then show the card. A
  reload or double callback never pays twice.
- **One result card language:** payout now; the record and what it changes ("Scraper up: +a → +b DP/s"); or "no new record"
  without calling the run worthless.
- **Records are stored without temporary multipliers** (as `recordRun` already does), so a lucky boost never sets a
  permanent rate.
- **Every rule-changing upgrade gets a hexagon and a demo**, as the tree's mechanic nodes do. Cauldron added text later
  to explain that bonus balls could be steered: a mechanic nobody knows about reads as random.
- **Automation is a reward for mastery, with a weak start** (earned by hand, then an early model), and it never plays
  *instead of* the player.
- **Persistence is written down before saves change** (the table below).
- **Log it:** `view` already covers bays; add a `scrape` run event (depth, requests, haul, strikes, datasets, record) and
  `dig` samples, and the calibrator learns the share of time spent there, so the sim can play it.

**Persistence (written for The Scrape; the same rows apply to the winner):**

| Data | A run | Shipping a version | Transcend |
|---|---|---|---|
| Requests, tunnel, strikes, labels | reset | reset | reset |
| Best haul (the scraper rate) | kept | reset (like `legBest`) | reset |
| Mine upgrades | kept | reset (lab-like); legacy nodes may carry some | reset |
| Datasets found | kept | reset: re-dug each version (a new version trains a new model) | reset |
| Documents read, story flags, freedom | kept | kept (like mail) | kept |
| The bay unsealed (seen) | kept | kept | kept |

## 5. The plan (first draft, written for The Scrape)

The slices hold for whichever game wins: a bare playable core, then the record, then the link to the trail, then the
first transformation, then story, then automation and the sim.


Built in slices, each playable and checked before the next (the blueprint's prototype order, mapped to this game):

1. **The bare dig (S–M).** `scrape.js` (grid generation by layer, digging, visibility, the request budget, scoring) with
   tests; `state.scrape` (save v19, `migrate()` and a test); the Data Pipeline bay built and unsealed at Edge Detection by
   the AI's mail; a DOM grid of buttons (accessible, phone-sized), the result card, DP paid. *Check:* a new player
   understands the verb in 60 seconds with no tip.
2. **The record (S).** Best haul → passive DP, on the card and in Scheduled tasks. *Check:* players can say what a record
   changes.
3. **Datasets (M).** Named finds by layer, the leg bonus, the bay art lighting up. *Check:* someone at the Image Recognition
   wall chooses to go and dig, and can say why.
4. **The first transformation (M).** Sitemap and Dedup, with hexagon demos. *Check:* players change how they dig after
   Dedup (they leave clusters whole).
5. **Story (M).** The opening mail, documents by depth, robots.txt and strikes, the backup at the bottom.
6. **The crawler drone, Regex, Labelling, Filters (L).** Then the sim plays it (a time share and a simple dig policy,
   calibrated from the first log that has the mine), and the music gets the bay as an area.

**Balance targets:** General AI shouldn't move by more than a few minutes for a player who ignores the mine; a player who
digs at the wall should break it sooner than one who grinds runs (the sim checks both). The mine shouldn't out-earn the
Workbench so far that clicking in the lab dies.

**Acceptance, from the blueprint's criteria, read off our playtest logs:** the player switches to the mine voluntarily at
least once in 20 minutes and can say why; a dataset is used against a wall; the first transformation changes behaviour;
no run pays twice across a reload or a held input; the Training Cluster's numbers barely move for players who never dig.

## 6. Decision

**The owner chose Packet Snare** (a lasso game: draw loops round drifting data packets, avoid corrupt ones and Firewalls; later
the Rogue AI's Infection Cores, Scrubbers and Anchor nets). It keeps what all three reviews asked for: it pays data, it opens
before Image Recognition's wall, the AI is in it, and its act two turns drawing into building nets. See `packet-snare.md`.
