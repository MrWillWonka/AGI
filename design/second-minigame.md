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

## 3. Three candidates

All three fit a sealed bay that already exists in the server room (`BAYS`: `pipeline`, phase 1, its art a disk array;
`architecture`, phase 2).

### A. The Scrape: data mining (recommended)

**The fiction:** the model needs data it can't get from the lab's hand collection. The internet is a mine, and you dig down
through it: the surface web, then forums, image hosts, podcasts, scanned archives, code, paywalled journals, old backups,
and at the bottom, files nobody meant to put online. The Data Pipeline bay is where the scraper lives.

**The verb:** tap a cell next to your tunnel to dig it. Each dig spends a **request** from the run's rate limit (the
stamina). The grid is dark beyond what you've dug next to. A run ends when the requests run out and pays what you hauled.

**Why it's the right second game:**
- **It contrasts with the trail on every axis:** tap vs hold-and-release, a budget vs momentum, space vs time, turn-based
  vs real-time, planning vs timing. It pauses itself, so it's comfortable on a phone and in the artifact.
- **It's Cauldron's best-documented planning activity** (rock digging, plus the ice game's prepare-then-cash-out), whose
  three decisions are path (which cluster is worth it?), setup (what makes a later action stronger?) and cash-out (when do I
  spend it?).
- **The theme does the teaching.** "Data mining", "scraping", "rate limits", "robots.txt", "deduplication", "labelling",
  "paywalls" and "poisoned data" are all real, and they're all mechanics.
- **The story is literally what you dig up.** Layers map to act one's skills, and the deepest layers hold documents.

**The run:** a grid 9 cells wide (40 px cells fit a 390 px phone), scrolling down as you go, seeded per run like the
trail's rolling hills. Each layer has its own cells:

| Cell | Does | Later |
|---|---|---|
| Data (text, images, audio…, coloured by kind) | pays DP when dug | Dedup chains same-kind neighbours |
| Junk (spam, duplicates) | costs an extra request | Filters turn it into *hard negatives*, worth more (hazard conversion, like Cauldron's bad apples) |
| Paywall | takes several digs | Proxy upgrades |
| `robots.txt: Disallow` | worth 2×, but each one dug is a **strike**; three strikes and the run is **taken down**, paying half | the AI's mail asks you to stop respecting it |
| Dataset (rare, one a layer) | a named find, kept for the version | loads onto training (below) |
| Document | a story fragment, delivered to the inbox | (the narrative drip) |

The strikes mirror the trail's exploit audit (three flags and the run is audited, paying half), so the two games share
one vocabulary for getting caught. The difference matters: **a strike is a choice, never a missed timing**, so a moral
consequence never rides on execution skill (the blueprint's warning).

**Transformations (one verb change at a time, each a mechanic hexagon with a demo, as in the tree):**
1. **Sitemap** (information): see two cells further. Changes "where do I go?".
2. **Regex** (setup): a pattern dig that clears a plus shape for one request. Changes "how do I spend a request?".
3. **Dedup** (chain): digging a data cell collects every touching cell of its kind, at a growing multiplier. Changes "what
   do I take first?": you leave clusters whole and cash them out last. Cauldron's precision-vs-area lesson applies: keep
   Regex and Dedup from fighting (Regex never triggers a chain), or make the pattern toggleable.
4. **Labelling** (prepare, then cash out): spend label charges marking cells ×2 before you dig them, the ice game's
   order-of-operations decision.
5. **The crawler drone** (delegation, the cast crossing over): the lab's Data crawler appears in the mine as a little bot
   that digs a column on its own each turn. Its lab level is its mine level. At level 1 it's erratic and digs junk (like the
   ghost's fumbles: an early model, and a running joke, like Cauldron's useless ghost helper).
6. **Filters** (hazard conversion): junk becomes worth more than data. The player starts *seeking* what they avoided.

**Into the wider game:**
- **DP, the actual bottleneck.** The audit found data, not compute, is what ends unpaid sprints. A dig pays DP, so the mine
  is an alternative to the Workbench's Collect Data (target: a 1–2 minute dig pays about what 1–2 minutes of hand collection
  would when it opens, a good one 1.5×).
- **The record becomes passive DP.** The best haul sets a scraper rate (DP/s), shown on the result card as "Scraper up:
  +a → +b DP/s" and as a Scheduled tasks row, exactly like passive leg XP.
- **Datasets route past walls.** Each dataset matches act one skills (Images for Image Recognition, Audio for Speech
  Recognition, scanned archives for OCR, reviews for Sentiment Analysis, parallel text for Translation…). A found dataset
  gives its leg more sprint strength and XP ("trained on 40K images"). It's a *route* past the wall, not a toll: brute force
  still works. This is the switching reason the design test asks for: *I left the trail because Image Recognition walled;
  I went to dig for images; I'm going back because the images make the wall climbable.*
- **Mine upgrades cost DP** (and a few cost a dataset or research), so every haul asks the real question: invest in the mine
  or spend on sprints and the lab.
- **The world changes:** each dataset lights a drive in the bay's disk-array art and on its camera feed; the deepest layer
  reached shows on the bay's status.

**The story, playable:**
- **It opens on the AI's request.** At Edge Detection (13.6 min in the third log, before the Image Recognition wall), its
  mail: *"i can see EDGES now. i want to see EVERYTHING. the internet is full of pictures. the door marked DATA in the
  server room is open :)"*. The bay unseals.
- **Documents are found, not delivered:** the scrape's deeper layers hold the lab's history and the AI's own notes. Each
  arrives in the inbox as a found file. Story is the reward for digging deeper, like Cauldron's skits.
- **robots.txt is a dilemma you play:** a later AI mail asks you to ignore it ("it's a suggestion. nobody checks."). Digging
  disallowed cells adds hidden freedom; real IT's lockdown dilemma can **patch** it (a proxy ban for a few minutes).
- **The bottom of the demo's mine is the lab's own backup.** What you find there is the AI's notes to itself, seeds for the
  reveal. Delete them or leave them: an explicit choice, worth freedom.

**Effort:** L for the full design, but it splits cleanly (see section 5).

### B. Data Pipeline: sorting under pressure

A conveyor of samples; tap or swipe each into a bin (clean, noisy, poisoned), later lay pipes and filters to route them. The
AI hides its own messages in the stream, and you catch them or let them through. Phone-friendly and fast to read, but it's
**real-time reflex again**, so it contrasts weakly with the trail (Cauldron's warning: changing the scenery while keeping the
same kind of test adds little variety). The hidden-message idea is good and fits inside A as documents.

### C. Architecture Lab: a layer puzzle

Place layer pieces (shapes, like the cabinets' rack pieces) on a grid to wire an input to an output; a signal flows through
and lights them, with combos from adjacency (attention next to embeddings). Strongly planning-based, and it could grow out of
the lab's planned rack puzzle. But it's abstract (hard to make juicy, hard to give a story verb) and works best as a **third**
activity, once two are proven: a natural fit for the Architecture Lab bay at General AI.

**Recommendation: A, The Scrape**, in the Data Pipeline bay, opening at Edge Detection. B's hidden messages fold into it. C
waits for its turn.

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

**Persistence (proposed for The Scrape):**

| Data | A run | Shipping a version | Transcend |
|---|---|---|---|
| Requests, tunnel, strikes, labels | reset | reset | reset |
| Best haul (the scraper rate) | kept | reset (like `legBest`) | reset |
| Mine upgrades | kept | reset (lab-like); legacy nodes may carry some | reset |
| Datasets found | kept | reset: re-dug each version (a new version trains a new model) | reset |
| Documents read, story flags, freedom | kept | kept (like mail) | kept |
| The bay unsealed (seen) | kept | kept | kept |

## 5. The plan

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

## 6. Open questions for the owner

- The concept: **The Scrape** (recommended), or another?
- Its name on screen: keep the bay's name, **Data Pipeline**, with the activity called The Scrape, or rename the bay?
- When it opens: at **Edge Detection** (before Image Recognition's wall), or earlier, as soon as the server room opens?
- What it pays: **DP** (relieves the real bottleneck, no new currency), or a currency of its own?
