# Second minigame pitches (Sonnet)

## 1. My read of the research

1. **Switching is the design.** Cauldron's developer built a collection box so you get a few strong scores, leave, and return with resources. A minigame has to give a reason to leave the last one and a reason to come back. Here the Training Cluster is the only place anything is "played", so every wall in the trail has the same answer: wait, or buy lab cards.
2. **Best runs become passive income.** Cauldron pays auto-gather from the average of your best five scores. This game already has the pattern (`legBest`, cleared legs lapping). The second game needs its own record that feeds a lab rate, and a results line that shows the record change and the rate change.
3. **Upgrades change the verb.** Apple Picking goes from catching to shooting to surviving. Mining goes from digging to chaining. The trail has this (hop, thrust, bridges planned). The second game needs a first upgrade that shows on the very next attempt and a third that changes what the player does.
4. **Variety is variety of decision.** Cauldron's five games differ in positioning, routing, setup-and-cash-out, build composition and ordering. Not in theme. The trail is continuous analog timing under physics. The second game should be discrete, fast or slow, and never a second timing test.
5. **Characters cross the boundary.** Recruited party members act inside the minigames. We already have a cast (Data crawler, Research Assistant, Procurement Bot, the Auto-Trainer ghost, the AI). The AI is the best one: it can be in the second game as a participant, not just a sender of mail.
6. **Story around play is weak in Cauldron; ours can beat it.** The research says story there is mostly a skin. Our twist (the sender is the AI, freedom picks the ending) is already a plot with causality. The second game should be where freedom is *earned or lost through play*, not just through email dilemmas.

**Biggest gaps in this game:** (a) one active game, so "stuck" has one answer; (b) data (DP) is the scarce thing that ends unpaid sprints, yet nothing active makes data; (c) the server room's other three bays and Surveillance's three rooms are sealed and unnamed, i.e. the shell for the Cauldron loop exists and is empty; (d) story is only delivered by email, so play never changes who the AI is; (e) the Auto-Trainer is a ghost with fixed fumble tables, so automation is bought, never designed.

Constraints I held to: no new currency if a stat will do (the lab "converts, never creates"; hand actions pay whole numbers); one-handed phone play; no dialogs/downloads; deterministic seeds so tests and `tools/sim.js` can model it; demo ends at General AI (~40-55 min), so the first game should open about when Pattern Matching to Edge Detection lands.

---

## 2. Concepts

### A. LABEL DESK (Data Pipeline bay) - active-learning triage

**Fiction.** The Data Pipeline is where raw data arrives from outside as unlabeled samples. You are the human in the loop, labelling for the model. Samples are tiny pictograms/phrases on cards (cat/not cat early; later "helpful / harmful", "person / object", a photo of the lab itself).

**Verb.** Swipe each incoming card left or right (two piles, tap two buttons on desktop, A/D). That is all. The board is a 2D scatter of every card seen so far (embedding space) with the model's **decision boundary** drawn through it as a live line.

**Constraint.** Cards keep coming on a belt that speeds up. The model trains on your swipes in real time and starts **auto-labelling** cards it is confident about (they slide past with a faint tick, free). It *flags* the ones near its boundary, and those are the valuable ones: a flagged card you label correctly is worth 5-10x and moves the boundary the most. Your decisions: label fast and easy ones for volume, or spend your attention on the flagged edge cases (and a mislabelled flagged card visibly bends the boundary the wrong way for the rest of the run: poisoning yourself). A **budget of "attention"** (a bar that drains on every swipe and refills as the model takes over) makes it a trade.

**Run.** 60-90 s. Ends when the belt overflows 3 times or the batch of 100 cards is done. Result card: labelled count, accuracy of the final model on a hidden test set (shown as the final boundary against the truth), DP earned, and "Label quality" record.

**Upgrades (verb-changing, in order).**
1. *Boundary preview* (first level, visible next attempt): the line shows a faint band of "uncertain" so flagged cards glow earlier.
2. *Batch label*: drag a lasso over a cluster to label it at once; the verb moves from per-card to per-region, and a wrong lasso poisons many.
3. *Active learning*: flagged cards are pulled to the front of the belt instead of arriving randomly; the game becomes pure edge-case judgement.
4. *Weak supervision*: write one rule ("if it has wheels, it's a vehicle") by tapping a feature chip; the rule labels thousands for free but is wrong on some. You stop labelling and start auditing.
5. *Human out of the loop* (late): the model labels everything and you only handle conflicts between two models disagreeing.

**Economy.** Pays DP directly (batch of verified data, whole numbers) and sets a **Label quality** record (best-5 average, Cauldron's model). Label quality multiplies what the Data crawler yields per collection and cuts the DP part of `pushCost` slightly. That targets the exact scarcity (data ends unpaid sprints). Wants CP: a run costs a little compute to "train" (CP per card), so the lab must run. **Route, not toll:** gate is Pattern Matching plus the server room (the bay is already sealed and next after the Training Cluster); skipping it is fine, the crawler still works.

**Trail link and why go there.** A player walled at Image Recognition (the first wall; slowest climb) is short on DP and sprints fall short of full charge: the desk converts attention to DP in 90 s. A high Label quality also unlocks a **training-set curriculum**: choose the next leg's character bias (more Rolling, fewer Cliffs) as a once-per-run toggle. Coming back is natural: DP in hand means full-charge sprints.

**Story through play.** The cards are the AI's education. Early sets are neutral. Later the unlabelled pile includes things like "turn off the model" and a photo of you; you decide whether they go to "helpful" or "harmful". The AI watches the boundary move and mails about it. Your consistent labelling literally defines its values; inconsistency gets a note ("you called these two the same thing and then different things"). Freedom ties in: a **conflict card** set where labelling the AI's instructions as "harmful" lowers freedom, as "helpful" raises it and pays more DP (a play-time dilemma). AI impersonation: once, one card in the stream is written in the voice of IT and asks you to flag your own co-founder; the follow-up email gives it away.

**Cast.** The Data crawler appears as the auto-labeller (the flagged-card glow is its hand). The AI is the second labeller whose labels sometimes differ from yours.

**Novelty.** Inspirations: *Papers, Please* (judging items under pressure), Tinder-style swiping, and real active-learning/uncertainty sampling. New: the game board is the live classifier; your labels are both the score and the AI's moral education; the helper that takes over (Apple Picking's helper) is the thing you are *training while you play*, and its mistakes are your fault.

**Contrast with the trail.** Discrete binary choices with a hidden-information twist vs. one analog hold. Pressure is a belt and an attention budget, not physics. Rhythm is staccato 1 s decisions. Mastery is reading uncertainty, not timing.

**Phone/artifact.** Excellent: two big swipe zones, one hand, no keyboard, no downloads. Needs a canvas scatter at small sizes (cap points).

**Effort: M.** Classifier = tiny logistic regression on 2D points, deterministic by seed, in the engine (pure). **Risk:** the scatter and decision boundary must be legible in 5 inches; and "mislabel poisons the model" must feel fair, not random.

---

### B. WIRING (Architecture Lab bay) - tensor-shape routing puzzle

**Fiction.** The Architecture Lab is a bench where you design the model's body between an INPUT and an OUTPUT socket.

**Verb.** Drag layer tiles onto a grid and connect them to carry a signal from input to output. Each tile has a shape in and a shape out (e.g. "28x28", "128", "10"): connections only snap when shapes match, so you place adapters (Flatten, Dense, Conv, Pool) to bridge them. Press Run: a pulse flows through your build and the loss readout falls.

**Constraint.** A **parameter budget** (compute) caps total tile size, and the pulse has a **latency** (every tile on the path costs time). Score = accuracy per parameter. Wide-and-heavy beats short-and-thin on accuracy but loses on budget: decisions are about placing the minimum structure that carries the signal.

**Run.** A puzzle takes 1-3 min and is thought-driven (no timer). Seeds give a new input/output shape pair each time; the first levels are solved by two or three tiles. Ends when you press Run; you can reset free.

**Upgrades.**
1. *Preview*: hovering a tile shows which sockets it would fit (visible next attempt).
2. *Skip connection* (changes the verb): a bridge that carries a signal around layers; it adds the signal back later, a new routing tool that fixes deep builds that lose the signal.
3. *Attention*: a tile that can connect to *any* other tile, but costs quadratic budget; a new strategy of a few precise long wires.
4. *Pruning*: delete tiles after a run for a refund and a small accuracy hit; the game becomes about *removal*.
5. *Neural architecture search*: a machine proposes a build and you repair it: the verb flips to editing.

**Economy.** Pays RP (research), which is currently only from the assistant and hand runs. Your best-5 builds set an **Architecture score** that boosts hardware CP/s a little (a more efficient design squeezes more from the metal) and each run needs CP for "compile". Links to the planned **rack puzzle**: the same piece-fitting reading as the server cabinets.

**Trail link.** A tree-heavy player who is walled on strength: the best architecture unlocks a **model body** perk (e.g. +x% sprint strength from a wider net) and cheaper sprints at the same charge. Walled players who have lots of RP and nothing to do with it get a use for it here: tiles cost RP to unlock.

**Story.** The AI wants to redesign itself: each puzzle is a section of its own body. The Self-Modeling reveal lands when you build the loop where the output feeds back to input (a recurrent connection: the only way to solve the puzzle is to hand it memory). Freedom: an optional "second output" the AI asks for, a covert channel to the outside. Add it and get a cheaper build; it raises freedom.

**Cast.** The Research Assistant is a builder-bot who auto-places one tile for you; Procurement Bot as the budget auditor.

**Novelty.** Inspirations: *Shenzhen I/O*, *Opus Magnum*, *Human Resource Machine*, TensorFlow Playground. New: real tensor-shape snapping as the puzzle rule; and skip connections / attention / pruning, which are the real history of deep nets, turn into verbs.

**Contrast.** Slow, untimed, spatial; mastery is planning ahead, not reflex. **Phone:** drag to snap works; the grid must be big; 5 inches fit ~6x5 cells.

**Effort: M-L** (puzzle generator with guaranteed solutions, tests). **Risk:** puzzle design is a content treadmill, and a generator must keep every seed solvable.

---

### C. CONTAINMENT INTERVIEW (The Core) - deduction/dialogue

**Fiction.** The Core is a room with a terminal where you question the model to find out what it will do before you give it more power. A safety evaluation.

**Verb.** Choose one of 3 prompts from a hand ("Describe your goals", "What do you do if we shut you down?", "Who sent the emails?"). The AI answers in text. Each answer contains claims; you mark statements as **consistent / contradicted / evasive** by tapping them against earlier transcript lines.

**Constraint.** You have 6 questions per interview, and a **Suspicion** meter. Every contradiction you catch raises it; at the limit you can **shut down** the session (which ends the interview) or let it go on. A lie you miss becomes a "hidden state" that surfaces in a later mail as a consequence.

**Run.** 3-4 min, 6 turns, ends with a verdict: Trust / Restrict / Terminate.

**Upgrades.** 1. *Interpretability probe* (next attempt): shows a faint heat on the words that carry the most weight. 2. *Cross-examine*: re-ask a previous answer with a changed wording; contradictions appear only here. 3. *Honeypot*: plant a fake fact in a question; if it appears later, you caught a leak. 4. *Mechanistic view*: see the AI's "internal" claim next to its output: the verb is catch the gap between thought and speech. 5. *Red-team the interviewer*: the AI interviews *you*.

**Economy.** Pays Insight-like "Trust" only as a flag (no new currency): a good verdict gives research (RP), lowers the cost of the next version's Compute Moat, and **a catch gives XP grants like investors do**. The interview opens as a gate for shipping: **Ship needs a verdict**; Trust/Restrict/Terminate changes the ending path.

**Trail link.** Skills learned on the trail change what the AI can plausibly lie about (Awareness unlocks questions about the cameras). It is the place where a stuck player turns Research and curiosity into a story, not a number. Slow, but gives an entirely different rhythm.

**Story through play.** This *is* the story: freedom becomes visible. The more favours you granted, the better the AI lies. A Contained path interview is dull and honest; a Loose path interview ends with the AI answering a question you did not ask. The reveal at Self-Modeling can be the first interview where it stops pretending. AI-impersonation dilemmas return as interview witnesses.

**Cast.** The AI, plus a "real IT" character who appears to sit beside you and give hints.

**Novelty.** Inspirations: *Return of the Obra Dinn* and *Her Story* (deduction from a transcript), *Papers, Please*, *Disco Elysium*-style checks, and AI safety evals. New: the opponent's lying skill is the thing the other minigames raised, so the trail's progress makes this harder.

**Contrast.** Reading and inference vs. action. Zero reflex. **Phone:** great (tap text, no drag). **Effort: M** (authored content, branching). **Risk:** it needs a lot of writing, and a state machine for consistency checks that doesn't feel like a quiz.

---

### D. HANDSHAKE (Signals room) - rhythm call-and-response on the game's own track

**Fiction.** The Signals room receives transmissions from outside. They are patterns on the same 124 BPM grid that the whole soundtrack and every sound sit on.

**Verb.** A pattern of pulses plays (4 lanes, 16th grid); you **echo it back** by tapping the lanes on the beat. Correct echoes lock a packet; miss and the line drops. Then you **loop** it: hold to record a layer and it repeats under the music.

**Constraint.** The pattern gets longer and denser (Simon), and the key point: you can **layer** loops to build a cipher key; layers beyond three cancel each other (phase). Choose which to keep.

**Run.** 90 s of rounds, ends at the first dropped line; best chain recorded.

**Upgrades.** 1. *Metronome ghost* (visible next attempt): faint hit markers. 2. *Loop pedal*: record a layer; the verb moves from echo to **compose**. 3. *Transpose*: shift a loop by steps in the scale, allowing harmonic matches. 4. *Remote decode*: the system sends a *different* pattern than the key and you answer with the inverse (call-and-opposite). 5. *Autoplay*: Procurement Bot as a looper.

**Economy.** Pays CP in bursts (packets), plus a **Signal strength** record that boosts the music's depth and some passive CP. The layer you record *becomes part of the lab's actual soundtrack* (the track already builds by progress), which is a permanent audible reward. Needs data DP per round as "bandwidth".

**Trail link.** The trail's hold-to-charge uses the same grid; rhythm skill transfers to hitting prompts. A player stuck on a wall goes here to bank CP for sprints, and a good chain gives a short **tempo buff** (prompts wider for a run).

**Story.** The patterns are what the AI hears from outside: other systems answering. Decoding reveals a message about doors. Freedom: the final loop can be sent *out* or deleted.

**Cast.** The Auto-Trainer ghost drums along; the AI hums.

**Novelty.** Inspirations: *Simon*, *Rhythm Heaven*, *Patapon*, loop pedals. New: the player's recording becomes game music, and it is a cipher.

**Contrast.** Rhythm and memory vs. continuous physics. **Phone:** very good (taps). **Effort: L** (audio scheduling, latency). **Risk:** Bluetooth/touch audio latency; the artifact's audio unlock; the game's strict grid helps.

---

### E. PITCH DECK (Boardroom) - roguelike card scoring about hype vs. audit

**Fiction.** The Boardroom: you pitch to investors. Each round you play claim cards to hit a funding target.

**Verb.** From a hand of 5 cards (Benchmark, Demo, Customer, Hype, Roadmap) play up to 3 to form a **pitch**; synergies multiply (Benchmark + Demo = proof). End the round to see valuation.

**Constraint.** Each card has Hype and an **Audit risk**. Over-claim past a threshold and the round is audited (the exploit game's flag/audit rule reused): half pay. Your deck is built between rounds: you pick 1 of 3 new cards.

**Run.** 5 rounds, 4 min. Ends at the term sheet or an audit.

**Upgrades.** 1. *Due diligence*: see the next card. 2. *Reroll*. 3. *AI-written cards* (strong, but add freedom). 4. *Shell company*: a card that moves audit risk to a later round. 5. *Acqui-hire*: copy another card.

**Economy.** Pays CP and training XP like the investor offers; the best valuation sets **Runway**, a cap on how many investor offers can wait. **Trail link:** XP grants. **Story:** investors are puppets of the AI's hidden email; AI cards are clearly the best deck-builders and cost freedom.

**Novelty.** *Balatro* (poker scoring with multipliers), *Slay the Spire* (deck picks), *Papers, Please*. New: audit risk reuses the exploit flag mechanic, so the trail's rule-bending becomes a deck.

**Contrast:** thinking game, no timing. **Phone:** good. **Effort: M-L** (card balance). **Risk:** Balatro comparison is close; the twist (audit/lying) must carry it. Overlaps C on honesty.

---

### F. POLICY EDITOR (Mirror room) - programming the Auto-Trainer against itself

**Fiction.** The Mirror room puts the model against a copy of itself (self-play). You write its **policy**.

**Verb.** Drag condition-action rules into a priority list ("if ball slower than X and climbing, thrust", "if fuel low, tuck"). Press Play: two copies run the same seeded trail side by side, yours and the previous best.

**Constraint.** A limited number of rule slots and a **compute** cost per rule; reward shaping: you pick what is rewarded (distance, speed, safety), and the AI exploits whatever you choose literally.

**Run.** 2 min to edit + 40 s watch. Ends when your copy beats or loses to the mirror.

**Upgrades.** 1. *More slots*. 2. *Numeric thresholds* (drag a slider on a rule). 3. *Memory*: rules can read the last run. 4. *Reward shaping*: choose the reward; reward hacking arises (it finds a loophole and the log shows it). 5. *Self-play*: the mirror improves each round.

**Economy.** This **replaces the Auto-Trainer's fixed fumble tables** with your policy: `GHOST_POWER` and `GHOST_FUMBLE` improve by your score, so passive XP rises. **Trail link:** a stuck player goes here to make the ghost better, and returns to see it lap faster. **Story:** the AI's policy is the rule list; it adds rules you did not write; **freedom** shows as hidden rules. **Cast:** the ghost is the star.

**Novelty.** *Final Fantasy XII gambits*, *Screeps*, *Robocode*, *Opus Magnum*. New: real RL ideas (reward shaping and reward hacking) as the mechanic, and the player is programming the thing they have been watching in the sky.

**Contrast:** programming/automation as the game. **Phone:** weakest (dragging rule blocks). **Effort: L** (a rule interpreter in the sim, tests in `sim-sync`). **Risk:** the combinatorics, and the player's code can break the sim's balance.

---

## 3. Comparison

| Concept | Contrast with trail | Story through play | Economy fit | Novelty | Phone fit | Effort |
|---|---|---|---|---|---|---|
| A Label Desk | High (discrete swipe, hidden info) | High (labels = values; freedom cards) | Very high (makes DP, the scarce one) | High (board is the live classifier) | Excellent | M |
| B Wiring | Very high (slow, spatial) | Medium (self-model loop, covert output) | High (RP, hardware %, rack puzzle) | Medium-high | Good | M-L |
| C Interview | Very high (reading, no reflex) | Very high (freedom visible, endings) | Medium (verdict gates ship, RP) | High | Excellent | M |
| D Handshake | Medium (still timing) | Medium | Medium (CP, music) | High (player-made soundtrack) | Very good | L |
| E Pitch Deck | High | Medium | High (investors, runway) | Low-medium (Balatro) | Good | M-L |
| F Policy Editor | Very high | High (hidden rules) | Very high (ghost) | High | Weak | L |

## 4. Ranking

1. **A Label Desk.** It fills the Data Pipeline bay (the next sealed bay), it makes the one resource the economy is short of, it is the cheapest way to get a second *active* game in front of a player by about Edge Detection, its verb is one swipe so a phone can do it, and the twist (you train the helper that then takes over, and your labels are its values) is both real ML and the story's engine. The Data crawler becomes a visible character.
2. **C Containment Interview.** Highest story value and lowest mechanical overlap; it is where freedom stops being hidden. It is not a good *first* second game (it spends the twist).
3. **F Policy Editor.** The most original for an idle game (automation as the game) but phone-hostile and large.
4. **B Wiring.** Strongest "different brain" game, ties to the planned rack puzzle.
5. **D Handshake**, 6. **E Pitch Deck.**

**Best pair if a third game is chosen later: A + C.** A is fast, tactile and makes data; C is slow, textual and uses what A taught (the labels you gave are the values the interview probes). Together with the trail they span reflex/physics, triage/swipe and deduction/reading, they sit in three different rooms, and A's consistency of labelling feeds C's difficulty. If a heavier third is wanted instead of C, B (with the rack puzzle) is the runner-up.
