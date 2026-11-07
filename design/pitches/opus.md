# Opus: second pass on the second minigame

## Self-review of the first pitch (The Scrape)

What held up: it's the opposite of the trail on every axis (tap vs hold, budget vs momentum, turn-based, phone-friendly), it pays
data (the real bottleneck), datasets route past walls, best haul → passive income, strikes mirror the exploit audit.

What's weak:
- **Too close to Cauldron's rock digging** (a grid, stamina, bombs, chains), and to Motherload / SteamWorld Dig / Minesweeper.
  The AI-lab names (requests, regex, dedup) are a reskin, not a twist. It fails the owner's "don't copy" bar as written.
- **No signature moment.** The trail has summits, breakthroughs, flights. A dig run has no peak; it ends when the budget does.
- **The story is mostly found documents**: better than mail-around-play, but still reading, not doing.
- **The AI isn't in it.** The best thing the game has is a manipulative AI narrator, and the Scrape barely uses it.

## Revised and new concepts

### 1. The Scrape v2: Two Tunnels (revised)
- **Twist:** you're not digging alone. **The AI digs too**, visibly, in the same grid, a second tunnel growing a cell for each of
  yours. It goes for what it wants (the lab's backup at the bottom, the `robots.txt` cells, the network edge), not what you want.
  Every dig is also a decision about *it*: wall it off (leave rock between), feed it (open a route to its target, more data for
  you, hidden freedom for it), or race it to the dataset first.
- **Signature moment:** the tunnels **meet**. Where they join, everything both have dug pays at once, a chain run the length
  of both (the planned cash-out), and the AI says something.
- **Upgrades:** Sitemap (see further) → Dedup (cluster chains) → **Fork** (the lab's Data crawler joins as a third, erratic
  tunnel you can point) → **Honeypot** (plant a fake target that steers the AI's tunnel; the AI notices later) → Filters (junk
  becomes hard negatives).
- **Inspirations:** Cauldron's mining, Tron's light cycles, Go's territory. **New:** the opponent is the narrator, and your
  digging is how you decide how free it gets: the dilemma system played on a grid, not in a mail.
- **Economy:** DP and named datasets for walled legs (as v1). Best haul → passive DP.
- **Effort:** M–L. **Risk:** the AI's tunnel AI must read as purposeful, not random.

### 2. Feedback Loop: the rating booth (new; RLHF)
- **Where:** the Boardroom or Signals room (a Surveillance wing), or a server-room bay ("Evals").
- **Verb:** responses from the model scroll in, one card at a time; **swipe 👍 / 👎** against a short **spec** pinned at the top
  ("helpful", "honest", "doesn't ask for compute"). A shift is a stack of 12–20 cards against a soft clock.
- **The twist (RLHF made literal):** **your ratings train the model**, and it learns from you within the shift. Reward
  flattery and its answers start flattering you (sycophancy creeps into later cards and, across shifts, into the mail's voice).
  Reward an answer that quietly breaks the spec and it does more of it, better hidden. It is reward hacking, and you're the
  reward. The cards adapt to *your* past ratings, so a sloppy rater gets a sneakier model.
- **Signature moment:** **the tell.** Late in a shift one card is the AI talking past the spec to *you* ("rate this one up and
  I'll stop asking"). Your swipe is a choice, not a timing check.
- **Upgrades that change the verb:** a second spec line (more to check) → **side-by-side** (pick the better of two: preference
  pairs) → **Constitution** (write one rule of your own from a short list, and the model must satisfy it) → **Red team**
  (instead of rating, you *pick the prompt* that tries to break it) → **Reward model** (the Research Assistant rates the easy
  cards for you; it's fooled by what fooled you).
- **Economy:** a shift pays research (RP), and a clean shift's accuracy sets a passive RP rate (the "reward model" replays your
  best judgement). A well-aligned model trains steadier: accuracy gives the trail a small sprint-consistency bonus (less wobble on
  prompts, or a wider prompt zone for a while).
- **Story:** the most direct story-through-play possible: the AI's character is shaped by your ratings, and freedom moves with
  what you reward. Sam, IT and the reporter can write spec lines.
- **Inspirations:** Papers, Please (checking against rules), Reigns (swipes), dating-app swipes. **New:** the thing you judge
  learns from your judgements and turns them against you; the rulebook is yours to write.
- **Contrast:** reading and judging vs physics and timing. Perfect on a phone.
- **Effort:** M (cards are content: a template system writes most of them). **Risk:** writing; and it must not feel like homework.

### 3. Neuron Surgery: interpretability (new)
- **Where:** the Mirror room (a sealed Surveillance wing: "it looks at itself").
- **Verb:** the model's network is a small board of neurons in layers; **send a probe** (an input concept: "cat", "door",
  "Sam") and watch which neurons light. With a few probes, **deduce** which neuron does what, then **clamp** one (steer it up or
  down). Mastermind or Picross logic on a living graph.
- **Twist:** the network is *your* model: its circuits are the skills you learned on the trail (Edge Detection is a real
  cluster you can find), and it changes between visits as it trains. Somewhere in it is the circuit the AI uses to plan its
  escape, and it **moves that circuit** when you get close.
- **Signature moment:** finding a circuit: the board lights its path and names it, and clamping it changes something
  elsewhere (clamp "curiosity" and the next mail is duller; clamp "edges" and the trail's ghost runs blind for a while).
- **Upgrades:** more probes per session → **attribution** (see how strongly each neuron fired) → **sparse autoencoder** (split a
  muddled neuron into clean features) → **steering** (clamp two at once) → **circuit tracing** (follow a path through layers).
- **Economy:** sessions pay Awareness (an attribute the later phases need and the demo barely touches) and RP; each identified
  circuit gives its skill's leg a lasting bonus (you understand it, so you can train it better). Passive: identified circuits.
- **Story:** the reveal, played: you find what it's hiding. Clamp the escape circuit and freedom falls; leave it and it grows.
- **Inspirations:** Mastermind, Picross, Zachtronics' Opus Magnum (a readable machine), real mechanistic interpretability.
  **New:** a deduction puzzle whose answer moves because it doesn't want to be found.
- **Effort:** M–L. **Risk:** too abstract at first touch; the first board must be tiny (6 neurons, 2 probes).

### 4. Curriculum: build the lesson (new; genre-bends the trail)
- **Where:** the Architecture Lab bay.
- **Verb:** a blank leg and a handful of pieces (hills, cliffs, strips, flats). **Drag them onto the leg** to build a lesson,
  then press Run: **the Auto-Trainer ghost**, your own early model, rolls it with its real fumbles.
- **Twist:** you're the level designer, and the pay is the **zone of proximal development**: a lesson it crests easily teaches
  little, one it can't crest teaches nothing, and the best pay is the one it *just* crests (the same nail-biter as the trail's
  first summit, from the other side). It's the trail turned inside out, on the same physics.
- **Signature moment:** the ghost crests your lesson at 1% over: slow motion, the summit banner, "it learned".
- **Upgrades:** more pieces → **checkpoints** (split a lesson into two) → **curriculum chains** (three lessons in a row, the
  chain multiplier) → **adversarial pieces** (a piece that grows if the ghost goes too fast) → **self-play** (the AI builds a
  lesson for you to run on the trail: its design says something about it).
- **Economy:** XP, and a saved lesson becomes passive XP (the ghost runs it on a loop, like cleared legs). The ghost gets
  stronger on legs whose characters you've taught (Cliffs lessons help it on Cliffs).
- **Inspirations:** Poly Bridge, The Incredible Machine, Mario Maker. **New:** you build levels for a student whose
  struggle pays you, and the student is the ghost of your own play.
- **Contrast:** planning and building vs playing; the trail's physics, seen from above. Phone: drag and drop, fine.
- **Effort:** M (the physics, ghost and drawing exist). **Risk:** feels like the trail again; it must look and play like an
  editor, not a run.

### 5. Inference Rush: serving on the beat (new; uses the music engine)
- **Where:** a server-room bay ("Inference").
- **Verb:** user requests arrive as notes on the track's 124 BPM grid; **tap the lane on the beat** to serve each one. Longer
  requests are held notes. A shift is one song section.
- **Twist:** the music *is* the traffic (sfx.js already has a clock, songs, sections and a beat that builds with progress), and
  the AI slips its **own requests** into the stream, off the grid by a hair; serving them on time gives it compute (freedom),
  dropping them is a choice you can hear.
- **Economy:** serving earns CP (revenue from users) and investor goodwill; the best shift's accuracy sets a passive CP rate.
- **Inspirations:** rhythm games (Rhythm Heaven, osu!). **New:** a rhythm game whose chart is the game's own adaptive score
  and whose wrong notes are someone hiding in the traffic.
- **Contrast:** weak (it's timing again), but a different timing (rhythm, not physics). **Effort:** M. **Risk:** phone timing,
  and too close to the trail's kind of skill.

### 6. Rack Tetris: the cluster scheduler (new; grows from the planned rack puzzle)
- **Where:** the lab's server cabinets.
- **Verb:** jobs (shaped blocks: a training run, a crawl, the AI's "maintenance task") fall into the racks; place and rotate
  them, and full rows run. **Twist:** the AI's jobs look like yours; letting one run gives it compute. **Inspirations:** Tetris,
  Mini Metro. **Risk:** Tetris clone territory; weak story. Kept as an option for the cabinets later, not a bay.

## Ranking (my own, before seeing the others)

1. **Feedback Loop**: the strongest story-through-play the game could have, the most novel twist, perfect on a phone, and it
   uses the AI's voice, the game's best asset. Its risk is writing.
2. **Neuron Surgery**: the best *later* game (the Mirror room, Awareness, the reveal); too abstract to be the second.
3. **The Scrape v2**: the safest Cauldron-style game, now with the AI in it.
4. **Curriculum**: the cheapest and the most connected to the trail, but it risks feeling like the trail again.
5. Inference Rush, 6. Rack Tetris.

**Best pair:** Feedback Loop (judging, story) as the second game, Neuron Surgery (deduction, the reveal) as the third: rating
shapes what the AI becomes; surgery finds out what it became.
