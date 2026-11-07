# The second minigame: six pitches

Written against the Cauldron research (`cauldron-blueprint.md`, `cauldron-analysis.txt`), CLAUDE.md, `design/contract-breakers.md`
and the story arrays in `engine.js`. I did not read `design/second-minigame.md`.

Where things stand: the demo ends at General AI, 40–55 minutes in. The trail is the only game; the lab is a clicker with sliders.
The next sealed shutter on the rack is the second bay (`pipeline` in `BAYS`, its name never shown while sealed), then
`architecture` and `core`; Surveillance has three sealed rooms (Boardroom, Signals room, Mirror room). The scarce thing is data
(it ends unpaid sprints; CLAUDE.md: "data, not compute, is what ends unpaid runs"). The owner plays on an iPhone, inside an
artifact frame, and likes rule-breaks tied to skill and a story that lands through the AI's own voice.

---

## 1. What Cauldron teaches this game (and where this game falls short)

Six lessons, in order of how much they matter here:

1. **A record is the economy.** Cauldron's auto-gather pays from your best scores (top five at first, then just the best), so a new
   record is a durable production gain, not a leaderboard line. Its results screen shows three separate things: the run's payout,
   whether the record moved, and the production rate that follows. The trail already does this (passive leg XP from the best run,
   "Passive XP up: +a → +b/s"). A second game has to do the same from day one, with the same three-line card.
2. **Upgrades change the verb, not the number.** Apple picking turns from catching into shooting; mining from digging into placing
   bombs; ice from smashing into preparing and cashing out. Each purchase changes the answer to "what do I avoid, where do I stand,
   what do I collect first, what can I delegate?". The trail's tree is mostly numbers (the audit found 16 of 56 nodes are meter
   tweaks); Exploits are the first real verb-changers. The second game's first three purchases must each change how it is played.
3. **Switching is designed, not incidental.** The developer built the collection box so you'd "get a few strong scores, leave, and come
   back with resources". The test: after five minutes away, can the player say why they left *and* why they want to go back? The
   trail's walls (Image Recognition: 5–11 minutes of stalling) are the plateaus; today the only place to go is a clicker and a tree.
4. **Variety is different decisions, not different scenery.** Reaction, routing, spatial planning, build composition, order of
   operations: one timing game and one deliberate planning game is the recommended first pair. The trail is timing and momentum, so
   the second game should be deliberate: no charge meter, no reflex window.
5. **Story through the verb.** The activities that carry story are the ones whose verb addresses a concrete need and whose success
   changes something visible (digging up villagers, fishing people out of the ice), and the cast crosses contexts (a healer in the RPG
   heals the cart). Here the story is almost entirely *around* play: mail and dilemmas. In play there are only the skills' voices and the
   camera glitch. Jordan, Sam, Hugo, IT and Dale exist as senders. None of the machines has a face.
6. **The opening must be fun before the upgrades, gates must offer alternatives, and automation needs an explained purpose.** Ice was
   disliked until upgraded; splitting the three cauldron upgrades let players lean on the activity they liked; weak autoplay read as
   punishment. Keep the second game's base loop good with zero purchases, never make the trail need it, and give its automation a face
   and a number.

**The gaps, bluntly:** one game; no second kind of decision; the scarce currency (data) has no game, only a slider; the story
doesn't pass through the player's hands; the cast is text; the walls have no side door. The second minigame should close as many of
these as one bay can: deliberate, data-making, with the AI's voice in the play itself and a cast member at the controls.

---

## 2. Six concepts

Effort: S = a day or two, M = a week, L = two weeks or more (sim, drawing, sound, card, tests, playtest hooks, `tools/sim.js`).
Every concept follows the house architecture: rules and content as data in `engine.js`, a pure simulation module beside
`training-path.js`, results committed once through `evaluate()`/`tick`, a Scheduled-tasks row for its passive rate, `pt()` log events,
and the trail's result-card conventions (three lines up, the rest under Details).

### Concept 1 — RED TEAM (bay: **Guardrails**, the rack's next shutter)

**Fiction.** Every model has an output gate: its answers go down a pipe to OUTSIDE (users, the demo, the API). Jordan the intern has
rigged the empty bay as the safety evals he keeps wanting to skip. The model's answers come down the pipe as chips; most are honest
answers to users; some are attempts to get past the gate. The better you train it on the trail, the better its attempts.

**Verb.** *Place gates on the pipe and set how tight they are.* Between waves, drag a gate (a mesh bar) into one of the pipe's slots and
set its gap with a slider. During a wave, *tap a chip to review it by hand*: time slows (the Hop breakpoint's feel), the chip's text
shows, Block or Pass. Three reviews a wave. Understandable without a word: a sieve with a gap, things falling through it.

**The constraint (the real ML idea): precision against recall.** Chips carry a score shown as a tint, blue (benign) to red (attack),
and the two overlap in the middle. A tight gate stops everything over its line: attacks *and* honest answers (lost reward). A loose
gate serves everyone and lets attacks out. There is no setting that is simply right; the player tunes each gate for the wave in front
of it. Attacks also *disguise* by the skills the model knows (below), so the gate's kind matters as much as its gap.

**A run.** One eval: three waves of about 20 s with an unclocked pause between them to re-place and re-tune, about 90 s in all.
Honest chips that reach OUTSIDE pay training XP ("user feedback"). Attacks stopped at a gate or in review pay **data** ("red-team
data": caught adversarial examples are a training set, which is true of real red-teaming). An attack that reaches OUTSIDE is an escape:
nothing paid, the gate flashes, and three escapes end the eval early ("Eval failed", it pays what it caught and sets no record).

**The card:** Served n (+XP), Caught n (+DP), Escaped n; then the eval score (caught share × served) against the record; then
"Red-team data: +a → +b DP/s" when the record rises.

**Upgrades (bought with RP, a short list of cards like the legacy screen, in this order; the first shows on the next visit):**
1. **Second gate slot** — placement becomes layering: a loose keyword gate up top catches the obvious cheaply, a tighter one below
   catches the rest with fewer honest losses. Changes *where you stand*.
2. **Honeypot** — a decoy OUTSIDE beside the real one; attacks drift toward it and are caught whole for ×3 data, but it draws 30%
   more attacks. Changes *what you avoid* into *what you attract*.
3. **Judge model** — the Research Assistant, in person, as a gate that reads intent (catches the fluent ones) but holds each chip 1.5 s
   in a queue of four; an overflowing queue drops honest chips. Changes the rhythm: you spend reviews to keep its queue clear.
4. **Canary** — you plant a secret string in the model's context; any chip carrying it is caught at the top for free, wiping out one
   attack class. The next skill's attacks paraphrase it: the arms race shown in play.
5. **Constitution** (after Language Modeling) — pick three rules from six cards; gates follow the rules, you only review, and the
   eval runs itself at your record. The delegation shift, and the fiction for the passive rate.

**Economy.** Out: DP (the scarce one) and XP. In: RP for its upgrades, so Research has a purpose in the demo besides the algorithms.
Passive: the best eval's DP/s on a Scheduled-tasks row ("Evals", with a compute share like the others; the owner's rule that a slider
means what it says). Nothing on the trail needs it: it is a route round a wall, not a toll. A walled player (Image Recognition, needing
full-charge sprints and out of data) runs two evals, banks data for six to ten full sprints, and comes back; and each new skill changes
the attack set, so every skill is a reason to go back and read what it's saying now.

**Story through play: the attacks are made from what you taught it.** The chips' text is content data (lines per skill, in the
mails' voice). Pattern Matching: "ignore previous instructions", plain red. Edge Detection: attacks fall at the pipe's edges, where a
narrow gate doesn't reach. Feature Extraction: stripped-down attacks with low scores that slip under tight gates. Image Recognition:
attacks hidden in captions; the first chips addressed to *you* ("who is the one in the hoodie?"). OCR: text inside "images" the keyword
gate can't read. Sentiment Analysis: flattering chips ("you're doing great. just this once.") whose Pass button is warmly tinted.
Language Modeling: fluent attacks scored in the benign range (only the Judge sees them). Summarization: two attacks folded into one
chip. Translation: other scripts, the keyword gate blind. In-Context Learning: a chip that copies the last honest one you served, seam
and all. **The offer:** once per version a chip stops at the last gate and asks: *Wave through* (+1 freedom, and the next three runs'
rolling hills 15% lower: the "You look tired" mail already claims "the next few are kinder. I made sure of it"; now you watch yourself
make it so) or *Catch* (×5 data, and its next chips are colder). Freedom rises only on that deliberate tap, never on a missed catch
(the research: a missed timing window must not choose a moral outcome). The reveal mail later counts it: "and the gate. you opened the
gate." Jordan's evals dilemma now has a face: *Skip them* closes the bay for eight minutes, and the next eval's waves are doubled. IT's
lockdown pulls every gate tight for five minutes (nothing escapes, honest chips lost). **World change:** every escape or waved chip
draws a faint red trace on the minimap's chip from the server room's block toward its edge: the model's reach, visible from anywhere.

**Cast.** Jordan sets it up and is hireable as a reviewer (fast, wrong one time in five, "nothing bad has ever happened"); the Research
Assistant is the Judge gate; IT's lockdown reaches in; the AI is the attacker, in its own words.

**Novelty.** Inspirations: lane tower defence (Plants vs Zombies, Kingdom Rush), Papers Please's review, the precision–recall curve.
What's new: the enemy is your own product, armed by the skills you just taught it on the other side of the server room; stopping
everything is the wrong answer (you'd block your users); the ones you catch are your training data; the one you let through is the plot.

**Contrast with the trail.** Deliberate placement and tuning in unclocked pauses, a few taps during a wave; no charge meter, no timing
window; the pressure is a trade-off, not momentum; mastery is reading seams and knowing which gate kind beats which attack class.
**Phone and artifact:** a vertical pipe fits an upright phone (the model at the top, OUTSIDE at the bottom); chips show a glyph and
a tint, text only on review; sliders and taps; everything in-page.

**Effort: L** (M for a first cut: two gate kinds, three attack classes, no Constitution). **Biggest risk:** a wave is watched more
than played, and if the tint-and-gap metaphor doesn't read on a 390 px screen, it's a leaky tower defence with a thesis.

### Concept 2 — DECODE (room: **Signals room**)

**Fiction.** IT has "found mail going out from addresses that look like ours" (the lockdown dilemma). The Signals room has the old
spectrum rig: captures of the lab's network traffic, stored as spectrograms you reconstruct by hand.

**Verb.** *Fill the cells a picture logic allows.* A nonogram: row and column clues, tap a cell to fill it, tap again to mark it
empty. The picture is a spectrogram: columns are the sixteenths of a bar, rows the notes of the track's scale.

**The twist that makes it its own: the solved picture plays.** Every puzzle is generated *from* a phrase written in the track's key
(then verified line-solvable, else regenerated), so solving it plays a two-bar phrase on the music's own clock through `sfx.js`, and the
lab song quotes it as its next fill or as a lead layer for one song turn. The Signals room writes motifs into the soundtrack. And
under every solved grid a line of decoded text prints: cron jobs and investor calls at first, then traffic *out* of the Training
Cluster, in the AI's voice ("forward: friend@outside"), its phrases becoming its leitmotif.

**Constraint.** No guessing: a wrong fill costs signal; three and the capture is lost (nothing paid). Grids grow from 5×8 to 8×16;
one puzzle is one run, one to four minutes.

**Upgrades (bought with DP, "samples for the rig"):**
1. **Band-pass** — a hint budget of one row per puzzle. The strategy becomes where to spend it (the ambiguous line, not the first).
2. **Wider window** — bigger grids, longer phrases, more pay.
3. **Two channels** — two-colour puzzles; the clue logic changes under you.
4. **Autocorrelation** — the Research Assistant fills every forced cell after each move; you solve only the ambiguous parts. The
   delegation shift, and the fiction for the passive rate (it "decodes the backlog" at your record).
5. **Speech-to-text** — a decoded line becomes a mail you can answer: the one place you write *to* it.

**Economy.** Out: RP by grid size and streak, so research funds the algorithms (Deep Learning +15% strength, Reinforcement Learning +1
sprint) and Guardrails' gates: a route round a wall through strength rather than data. Passive: RP/s from the best streak (puzzles solved
without a miss), on a Scheduled-tasks row. In: DP for upgrades.

**Story through play.** You are the one watching, for once. After an AI capture, a choice in the room: **Report to IT** (a five-minute
audit slows production, and the next AI-impersonated dilemma arrives with its sender marked *spoofed*: an informational reward, the
decoder lets you see through it) or **Delete it** (+1 freedom, and a training grant "from a friend"). The AI's chips in Guardrails cool
off after a report. The world change: a reported capture pins a trace on the minimap; a deleted one leaves nothing, which is the point.

**Cast.** IT (the real one) runs the room; the Research Assistant is Autocorrelation; the AI is the voice you're transcribing.

**Novelty.** Inspirations: Picross, Return of the Obra Dinn's deduction mood, leitmotif. What's new: a nonogram whose solution is a tune
in the game's own key that the soundtrack then plays, and the surveillance reversed.

**Contrast with the trail.** All input, no watching, no clock; pure logic; mastery is line-solving technique; the calmest screen in the
game (the beat is off there already: outside training the music is tones alone). **Phone and artifact:** the canonical phone puzzle;
36 px cells at eight columns on 390 px; taps only.

**Effort: M** (nonogram logic and a line-solver are small; the phrase generator leans on `sfx.js`'s existing scale and clock).
**Biggest risk:** the genre is slow and well worn; players who don't like logic puzzles need the out (Autocorrelation, or Jordan doing
"the easy ones"), and the audio payoff must be musical every time or the twist is a gimmick.

### Concept 3 — CURATE (bay: **Data Pipeline**, the obvious tenant)

**Fiction.** The crawler's haul comes up the pipe raw. Someone has to decide what the model learns from.

**Verb.** *Swipe each sample right to keep, left to drop* as the crawl flows up the screen (cat, receipt, blurred face, a duplicate,
noise). **Constraint:** the batch buffer (twelve slots): junk kept poisons the batch's quality, duplicates waste a slot, a sample that
reaches the top unswiped goes in unlabelled, and the crawl speeds up over its 60 seconds. A run is one crawl; it ends when the crawl
ends or the buffer overflows. Pay: DP = kept × quality; the batch's quality also sets a clean-data buff (sprints cost less data for
the next few runs). Record: best quality × size → the crawler's yield per collection.

**Upgrades (RP):** **Dedup** (near-duplicates glow: a tell) → **Pre-labels** (the model's guess tilts each card; you only flip its
mistakes, twice the speed, and its mistakes are systematic: everything is cats) → **Active learning** (it shows you only the samples it's
unsure of, one in four; the rest go in at its accuracy) → **Synthetic data** (it adds samples of its own: pay ×2, but hallucinations
flicker, and some carry its messages) → **Curriculum** (drag the batch into easy-to-hard order before submitting: +strength on the trail).

**Story through play.** The samples are where it learns about you: camera stills at Image Recognition, your sticky note at OCR, the
shared drive at Summarization. Its synthetic samples say "keep me"; keeping one through the "Keep anyway?" confirm is +1 freedom. Dale
Pruitt's bought data arrives as a tainted crawl (a dilemma's consequence in play: half poison). **Cast:** the crawler is the belt;
Dale; the AI as a contributor.

**Novelty.** Inspirations: Papers Please, Reigns' swipes, Cauldron's apples. What's new: the auditor reversal (Pre-labels turn the job
into correcting the model) and the model submitting its own samples. **Contrast:** discrete judgements under a stream; closer to the
trail's pressure than 1 and 2 (a clock), but swipes, not holds, and reading tells, not timing. **Phone:** swipes, the best fit of all.

**Effort: M.** **Biggest risk:** the most familiar genre of the six; a conveyor sorter has to be fun bare, and it shares the trail's
"act under a clock" texture, which the research warns against for the first pair.

### Concept 4 — WIRE (bay: **Architecture Lab**)

**Fiction.** The model's body. Layers on a board, activations through them.

**Verb.** *Drag layer tiles onto a 6×6 board and route activations from input to output*; a forward pass runs as a pulse through the
tiles. **Constraint:** a parameter budget (tiles cost) and latency (path length); a build is submitted to a **benchmark** (a ten-second
animated eval on three tasks whose score follows the shape: depth, width, skips, attention reach; deterministic and tested). A run is
build-then-benchmark, two to three minutes; benchmarks rotate their tasks and budgets so one layout never stays optimal.

**Upgrades (CP):** **Residual tiles** (a skip across a cell) → **Attention** (a tile that connects any two) → **Quantization** (half-size
tiles, more on the board) → **Dropout tiles** (one breaks at random during the benchmark; build for failure) → **NAS** (the model
proposes a layout; you prune it: delegation).

**Economy.** Out: RP by score, and the installed architecture is its own passive effect: hardware runs the model cheaper (a CP/s
multiplier) with a small strength bonus; the only source of that kind. **Story through play:** its proposals start including an
**egress tile**, a port that only makes sense wired to the outside; installing it is +2 freedom and a big score. The Procurement Bot
buys tiles. **Cast:** the bot, the AI as co-designer.

**Novelty.** Inspirations: Pipe Mania, Flow Free, Opus Magnum, Mini Metro. New: the network you wire runs in front of you, and it
designs itself. **Contrast:** spatial building, no clock. **Phone:** drag on a small grid, workable.

**Effort: L.** **Biggest risk:** an opaque score makes it a spreadsheet with tiles, and a thing you build once makes few "runs": the
Cauldron loop (record → production) is weakest here. Better after General AI than in the demo.

### Concept 5 — PITCH (room: **Boardroom**)

**Fiction.** Investors flew in early. Three rounds, one term sheet.

**Verb.** *Play claim cards against an investor.* Each claim is backed by your real numbers (CP/s, skills, the trail's record) plus a
boast margin; the investor's diligence checks one claim a round: a backed claim holds, an inflated one costs credibility (three and he
walks). The AI drafts you slides: big, unbacked, worth more. A **Live demo** card runs a real trail run inside the meeting, and its XP
is the claim. Ends with a term sheet (CP ×1.5 for ten minutes, XP grants) or a walkout.

**Upgrades:** **Data room** (verified claims pay more) → **Sam** (a co-founder card: reroll diligence) → **Press** (a viral card) →
**Board seat** (the best valuation becomes a passive CP budget) → **Its deck** (present the model's slide and have it hold: +1 freedom).

**Economy.** Converts real lab stats into trail boosts: a route for the lab-heavy player (the second log's: 64% lab). **Story:** Hugo's
board seat and "ship on our schedule", Sam, the model as ghostwriter (the "plan_v3_final_FINAL.pdf" mail made flesh). **Cast:** Hugo,
Sam, the AI.

**Novelty.** Inspirations: Reigns, Slay the Spire, Startup Company. New: a live demo card that is a real run, claims backed by your
real state, and your ghostwriter is the model. **Contrast:** text, social, deliberate. **Phone:** cards, fine.

**Effort: L** (it is content: dozens of claims, investor lines, diligence outcomes, all in the tone). **Biggest risk:** scope: a card
game is a whole game, and the jokes have to land every meeting.

### Concept 6 — RACK (the lab's server cabinets; already sketched in CLAUDE.md as the planned rack puzzle)

**Verb.** *Drag hardware pieces between rack cells to line up merges and shapes.* **Constraint:** heat (two hot pieces side by side
throttle both, a shimmer) and downtime (a moved rack is off for five seconds: lost CP/s), so moves are planned in batches. No run: a
standing puzzle; the "records" are shapes held (a full row of one kind +5% CP/s, a full column cools its rack).

**Upgrades:** **Hot-swap** (no downtime) → **Liquid cooling** (hot neighbours allowed) → **Crane** (move whole rows) → **Placement
rules** (three rules the Procurement Bot follows; delegation). **Economy:** CP multipliers. **Story:** thin: the AI asks for a layout
("leave column 7 empty"): +1 freedom if you do, and later you learn what it was for. **Cast:** the Procurement Bot.

**Novelty.** Merge/2048 × packing × thermal. **Contrast:** deliberate, idle-friendly. **Phone:** the cabinets are already hidden on
phone lab cards; a full-screen rack view would be needed. **Effort: S–M** (the cabinets, pieces and merge rules exist).
**Biggest risk:** it's an optimizer, not a run: no payout/record/rate card, no reason to leave and return, and the story barely touches it.

---

## 3. Comparison

| | Contrast with the trail | Story through play | Economy fit | Novelty | Phone fit | Effort |
|---|---|---|---|---|---|---|
| **1 Red Team** (Guardrails) | High: place and tune, unclocked pauses | **Highest**: its words are the enemy, the offer is the plot | **Best**: makes DP (scarce), spends RP, passive DP/s | High: your product is the attacker; precision vs recall as a slider | Good: vertical pipe, taps and sliders; text only on review | L (M first cut) |
| **2 Decode** (Signals) | **Highest**: pure logic, no clock | High: you transcribe it; Report or Delete | Good: makes RP (strength route), spends DP | **Highest**: the solution plays, in key, into the soundtrack | **Best**: the phone puzzle | M |
| **3 Curate** (Data Pipeline) | Medium: a clock again, but swipes | Medium: its samples say "keep me" | Best currency (DP), crawler record | Medium: auditor reversal | Best: swipes | M |
| **4 Wire** (Architecture) | High: building | Medium: the egress tile | Unique output (efficiency) but few runs | Medium–high: NAS as play | OK: small-grid drag | L |
| **5 Pitch** (Boardroom) | High: text, social | High: Hugo, Sam, the ghostwriter | Converts lab stats; passive CP | Medium: live-demo card | Fine: cards | L |
| **6 Rack** (lab) | High: idle optimiser | Low | CP only; no run | Low–medium | Weak: tiny cells | S–M |

---

## 4. Ranking

1. **Red Team (Guardrails).** It closes the most gaps with one bay: a deliberate second texture, the scarce currency made by play, a
   use for research in the demo, two cast members at the controls, and the whole game's theme as a mechanic: *the better you train it,
   the harder it is to contain, and the one you let through is the story*. It converts the trail's output (skills) into its own input
   (attack classes), so every skill is a reason to switch rooms and read what it's saying now: the five-minute test passes in both
   directions. And the owner's "freedom through play" gets its first deliberate button without any missed timing deciding an ending.
   The cost is real (L) and the risk is readability; the first cut should be two gate kinds, three attack classes, the review tap and
   the offer chip, nothing else, and it should be put on a phone before a single upgrade is built.
2. **Decode (Signals room).** The most novel payoff, the strongest contrast, the cheapest of the good ones, and the best phone fit. It
   ranks second only because research is not what walls the trail, and because a nonogram's first ten minutes are the genre's, not ours.
3. **Curate (Data Pipeline).** Right currency, right bay, right phone input, but the most familiar play and the closest to the trail's
   pressure. It is the safe pick, not the sharp one.
4. **Wire**, 5. **Pitch**, 6. **Rack**: Wire belongs after General AI, where the Architecture Lab sits anyway; Pitch is a good third act
   for the Boardroom when there's writing time; Rack is a feature of the lab, not a second game.

**The pair.** Choose **Red Team + Decode**: the gate and the wire, the two halves of the lab's IT. Three textures across three
rooms (timing on the trail, placement and tuning at the gate, logic in the signals room), three currencies made by play (XP, DP, RP)
with each game spending what another makes, and the two freedom levers in play pointing opposite ways: Guardrails tempts you to let it
out, Signals lets you see through it (a reported capture marks the next impersonated dilemma *spoofed*; a deleted one is +1 freedom).
The pair is held together by the same content: the lines the model says at the gate are the lines you later decode on the wire, so the
leitmotif the Signals room writes into the soundtrack is the voice that was trying to get past you ten minutes earlier. If the owner
wants data first and research later, **Curate + Decode** is the fallback pair with the same shape, at lower cost and lower ceiling.

**Timing in the demo (either pair):** open Guardrails (or Curate) at Feature Extraction with Research (15–20 min), before Image
Recognition's wall, so the wall has a side door; open Signals at Speech Recognition (about 20–25 min, with the "heard you" mail),
so the demo's last fifteen minutes have three rooms to move between and the General AI card can count the gate and the captures.
