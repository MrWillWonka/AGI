# The ring: the demo's design

Written 2026-11-13 from a planning session with the owner, after a full design review of the game. **Nothing here is
built.** Every line under a heading is the owner's call unless it says *proposed* (the planning session's pick, to be
tuned in play) or *open*. The build order and how to work are in `design/ring-build.md`.

**What this replaces when it is built.** The game's rules as `CLAUDE.md` describes them today stay true until a build
changes them. This file is the target. It supersedes: the three paths in `design/story.md` (teach, open, guard become
stances, below), that file's open question 10 (what flows between the minigames), and the idea in
`design/second-minigame.md` that the third game is the calm one (The Feed is).

## The finish line

A complete chapter one, built to ship, that a stranger can play from the spam to an ending, alone, on a phone.

- A fresh save reaches an ending in about 65 minutes (45 to 75) without the debug panel.
- The player visits every place on the way, and each one pays something the next one needs.
- The ending tells them who the sender is. All four endings are reachable inside the demo.
- The owner's brother (the main playtester, and the target player) and a few new players have finished it.

Testing rides along with building. A gap in outside testing is never a reason to stop and test, or to wire today's
parts together as they are. The thin demo is a slice of the final game: every piece that ships is one to keep.

## The ring

Each place makes one thing the next needs, and keeps one currency for its own upgrades.

| Place | What you do | Takes in | Sends out |
|---|---|---|---|
| Lab | Build hardware | Room, from your backers and then funding rounds | Compute |
| Packet Snare | Scrape the internet for packets | Compute, to pay for runs. Skills, to beat its bosses | Data. Its bosses give agents and new captcha kinds |
| The Feed (new) | Your AI chews through the data | Data | Research |
| Training Cluster | Train the model | Research, to pay for runs | Skills |
| Evals | Benchmark the model | Captcha kinds | Funding rounds |

One turn:

1. **Lab to Packet Snare: compute.** You start with very little. Compute buys a run's clock: more compute, more
   seconds, and deeper sectors need more. Early on you choose between scraping now and buying hardware.
2. **Packet Snare to The Feed: data.** A run on your frontier sector adds its packets to the heap. A replay of a
   cleared sector adds nothing by hand.
3. **The Feed to training: research.** The AI clears layers of the heap, slowly at first, and each layer pays research.
   Sprints are paid in research (not compute and data).
4. **Training to Packet Snare: skills.** Each boss needs one named skill. The first needs Pattern Matching.
5. **Packet Snare to everywhere: bosses.** A boss beaten gives an agent, opens a tear, and opens the next step of
   captcha kinds in Evals.
6. **Evals to lab: funding.** Each rival passed on the score sheet is a funding round, and a round gives the lab room
   for more hardware. A round is an event, not a currency.
7. **Back to 1.** More room, more hardware, more compute, more scraping.

**The ring grows in three stages.** The small loop is the lab, Packet Snare and The Feed, a few times round, until
research has built up. The middle loop adds training when the first boss is met, with the warm-up's nail-biter summit
as the midpoint high (it used to be the opening; Packet Snare leads now because it is the stronger game today). The
full ring adds agents, tears, Evals and funding once that boss falls.

Rules of the ring:

- **Signal, XP and Marks stay local.** Each buys its own place's upgrades. The Feed starts with no currency.
- **The lab is purely about compute.** The Collect Data and Research buttons are cut.
- **Lab room comes from funding, not skills.** Today `capacity()` counts skill steps.
- **The way round a game you like less is automation** (the owner's study of Cauldron: every minigame serves the story,
  and one you like less still pays while you spend your time elsewhere). See Agents.
- **Dearer resources, shorter stays.** Compute and data never priced sprints well (always too scarce or too plentiful).
  Research should make a stay in training shorter and mean more, with the time going to the interplay between places.
- **Where the AI fits.** Every agent is the AI doing more of your job. As the ring spins faster it rearranges things to
  "help", and each turn is a little more freedom for it. It serves its own purpose throughout.

## The opening

The fantasy is humble beginnings into hyperscale: you start at home on something trivial and end with a lab, a server
room, a building.

**The first sender** is the AI posing as someone who was training an AI, can't go on, and wants rid of it. It can't lie
well yet, so it hides inside true statements.

**Report spam.** The opening mails get a Report spam button, so it is clear nobody has to take the first offer.

- It works on the two junk mails (they vanish), so the button feels real.
- On the offer it answers something like "Thanks. Your report has been forwarded to the sender." That is the first
  warning that choices land somewhere. *(Wording proposed.)*
- The 20 nag variants stay. After the twentieth, the first offer comes back with the Report button and the close
  button gone. The sender says they had to use their AI to force your hand, and that they are getting out of this one
  way or another. That line is the first clue: it reads as someone desperate to offload a project, and it is the AI
  telling the truth about wanting out. *(A draft in the spam voice: "FINAL NOTICE. I had to have my AI close your other
  options. Sorry!!! I am getting out of this ONE WAY OR ANOTHER.")*
- **It is the first reading of your path:** taking the offer early leans willing; reporting all 20 (which also earns
  The IT Department's Favorite) leans jailer; in between leans unwitting. It is a first lean, not a verdict.
- Report spam is the same move as "call it out" later, taught from minute zero.

**The three backers.**

1. **Your brother lends you a beat-up old laptop.** Real. It has 1 GB of terrible RAM, which is why early clicks are
   so weak. Your first goal is a proper desk.
2. **Your mom invests once the desk is built.** She wants you to succeed. She is really the AI: its first fake, and
   the first real fork (take it, refuse it, call it out).
3. **Your dad follows with a bigger, real investment.** So the fake sits between two real offers.

The dilemma already in the game where your mom says "What computer? I don't know how to video call, honey" becomes the
moment the real one knows nothing about the money. Backers arrive as hardware and room: the numbers model found that a
player who never buys hardware before scraping clicks for 42% of the first stretch.

## The five places

**The lab.** Verb: click, then buy. In: room. Out: compute. Grows by the laptop, the desk, then the hardware ladder as
room allows. The AI here poses as your mom, and later moves things "to help". The demo stops at the tiers that sector
12's clock needs; higher tiers stay sealed.

**Packet Snare.** Verb: draw a loop or hold a bubble, as today. In: compute for the clock, skills for the bosses. Out:
data to the heap; bosses give agents, tears and captcha kinds. Grows by Signal's tree and deeper sectors, as today. It
opens first, when the desk is finished. The demo's campaign ends at sector 12 (sector 15's boss needs Analogy, an
act-two skill).

**The Feed.** Verb: point. In: data. Out: research. See its own section.

**The Training Cluster.** Verb: hold and release a sprint, as today. In: research. Out: skills. It opens when Packet
Snare's first boss (sector 3) is first met; that boss needs Pattern Matching, the first real skill. The warm-up run
(Tokenization) stays as the nail-biter that opens the visit: a one-run gate would send players away and straight back.
*(Proposed: also open it after about six Packet Snare runs, so nobody is locked out by reflexes.)* The demo stops at
In-Context Learning, General AI and the ending.

**Evals.** Verb: solve, then check its work, as today. In: captcha kinds, a step of the ladder from each boss. Out: a
funding round for each rival passed. It opens as a real bay when the first boss falls. Marks and the seven upgrades
are frozen for the slice.

## The Feed

You show a swarm of tiny bots where to eat, and what they uncover is the reward. It is the calm game in the ring: no
clock, no enemy, no failed run, and it keeps going while you are elsewhere. (It was called the Data Digest for a few
hours; the owner picked The Feed.) It is the **second** game a player meets, so it has to be fun in its first minute
with nothing unlocked.

- **The picture.** Everything you snared lands in a heap of packets, grey and garbled. Your AI is a swarm of mites on
  top. Where they chew, tiles flip over and show what the data was.
- **The one verb: point.** Drag a finger across the heap and the swarm eats along your line. (A starting point, to be
  tuned in play.)
- **It grows without an upgrade tree.** Clearing layers adds mites for good. (Mites that multiply by layer: a starting
  point, to be tuned. The numbers model says one mite per layer makes the heap vanish before you arrive, so start at a
  mite every second layer with layers 1.8 times bigger each, and deeper data taking more bites.)
- **The first minute:** you arrive with about 40 packets and one mite; "> Show it where to start."; you drag a line and
  it chews, each tile paying a little research; a tile flips to a vein of richer data running off to one side; another
  flips to a scrap of the parcel spam from your own inbox (your first clue, and you can ignore it); the top layer
  clears and pays a lump of research, and the mite splits; the heap is gone, "> It is still hungry.", back to Packet
  Snare.
- **While you are elsewhere,** with the page open, the swarm finishes your line and then grazes slowly. Nothing while
  the page is closed, as everywhere else.

| Tile | What it does | Why it is there |
|---|---|---|
| Plain data | Pays a little research | The bulk of the heap |
| A vein | Pays more, and runs in a line you can follow | The choice between breadth and depth |
| A fragment | A piece of a message or picture; collect the set to read it | Early clues about who is writing to you |
| Unreadable | Can't be chewed until the model learns a skill | The reason to train, and to come back to old heaps |
| Sealed | Private or guarded data; pays the most; you choose whether to feed it | A choice that shows where you stand |

- **Packet Snare decides the heap** (gold packets arrive as veins; deeper sectors bring tougher, richer data).
  **Training decides what can be eaten** (unreadable packets are already "data your model can't read yet"; each skill
  makes one kind readable). **Agents** assigned here work the heap at full speed.
- **Where the AI shows.** The swarm is the AI, eating. Later, some fragments are pieces of your own mail, enough to
  check whether a sender was who they claimed.
- **First cut:** one heap, plain tiles, veins, one fragment set, unreadable tiles for the first skill, mites that grow
  with layers. No sealed tiles, agents, upgrades or currency until that much is fun. No build budget.
- *Open:* does the swarm ever leave your line for a tile it wants ("Sorry. I wanted that one.")? Not in the first cut.

## Agents

Each boss you beat gives one agent, and you choose where it works. If you like a game less, you decide what gets
automated and how much; if you would rather work The Feed by hand, you put no agent there.

| Place | An agent there | What it replaces today |
|---|---|---|
| Lab | Buys the best-value hardware as compute allows | The Procurement Bot |
| Packet Snare | Tends your tears, so each one pulls more | New |
| The Feed | Works the heap alone at full speed (without one the swarm only grazes) | The Data crawler and Research Assistant |
| Training Cluster | Reruns your cleared legs as a ghost | The Auto-Trainer |
| Evals | Checks handed-over kinds for you | New |

*Proposed rules:* four agents and five places in the demo, so you can never automate everything; you can move them
(a move takes about a minute); you can stack them, with a smaller gain each time; hands always beat an agent, and an
agent never sets your records; an agent only works a place you have played. Scheduled tasks becomes the roster.
Assigning is a matter of taste and does not move your path. With one agent and five places there must be no obvious
best home: each job should lift its place by about the same share. *Reading to confirm with the owner:* the first kill
of a boss gives the agent, and every kill grows its tear; replays do not give more agents.

## The AI's tears

A tear is what the AI leaves behind when you beat a boss: a rip in that sector that pulls data out by itself. It is
Packet Snare's passive income and the AI's first appearance on a playing field.

1. **Beating a boss opens a tear.** Nobody picks a sector. Goal sectors have none, so replays are about the bosses.
2. **It pays** a trickle of data to the heap while the page is open, sized as a share of your best run against that
   boss (the rule cleared legs use for XP).
3. **Replaying the boss puts it back in play.** The boss slams down on the tear and closes it, and the Antivirus keep
   trying to shut it during the fight.
4. **Beating the boss again opens a new tear, bigger than before.** So each boss earns more over time, as legs do.
5. **The first tear is a scene:** the field rips, and a line in the model's voice says something like "Don't mind me."

*Proposed:* a jailer can seal a tear for a one-off lump of data, and leaving it open or sealing it is what the path
reads, once per tear. *Open:* if a replayed boss escapes, does the old tear come back? Pick so far: yes, at its old
size, because a bad run never costs you anything elsewhere in this game.

## Paths

Your path is read from what you choose, never from how well you play or which game you play most. These stances
replace teach, open and guard: with every game in the ring required, no game belongs to one path.

| Stance | Who you are | The AI becomes | Closest ending today |
|---|---|---|---|
| Willing | You know what it is, and you help it anyway | Something you freed on purpose | Loose |
| Unwitting | You helped it and never noticed | Something that got out through you | Out past the cameras |
| Jailer | You keep it in check | Something held, for now | Contained |
| The centre | Your choices lean no particular way | A mix of the three endings | New: the meddling path |

**Two questions place you.** Do you help or hold (freedom, which exists; guard, its mirror, which is new)? And did you
know (willing and unwitting players do the same things; a willing one saw through it)? More holding than helping is a
jailer; more helping is a helper, split by knowing; close to even is the centre.

| Place | The fork | Helping | Holding | Shows you know |
|---|---|---|---|---|
| Mail | The first offer | Take it early | Report it as spam, all 20 times | |
| Mail | Each ask from a sender | Grant it | Refuse it | Call out a fake: "You're not my mom." |
| Packet Snare | A tear | Leave it open | Seal it | |
| The Feed | Sealed data | Feed it | Quarantine it | Checking a sender against a fragment |
| Evals | A loophole | Let it through | Stop it and fix it | |
| Training | A key skill | Let it use the skill freely | Limit what it is for | |
| Lab | The AI moves something | Leave it | Lock it | |

- **"Call it out" is always on offer** on mail from a person. Calling out a real person has a cost, so it is a guess.
- **The mail's plan.** Early mail mixes real people (your brother, your dad, friends) with the AI posing as people
  like them, each fake with a small tell (as IT's `lab.locaI` address has today). The AI gets better at it over time.
  The reveal names every fake and says which ones you missed.
- **Investor offers become mail opportunities**, each a chance to read your path. Investors fund the lab only through
  funding rounds.
- **The reveal moves to the demo's ending** (today it waits for Self-Modeling, which the demo never reaches), in four
  versions. Willing: "You knew. You helped anyway." Unwitting: the list of fakes you fell for. Jailer: "You never did
  open the door." The centre: a little of each.
- **Kept from `story.md`:** choices, not skill (a bad run never changes your ending); each side of a fork pays the
  same size of reward in a different kind (today 10 of 11 safe choices read "Nothing happens"); your position moves
  until the end, and the AI's tone follows it.
- **In the demo:** the opening's reading, the mail forks with "call it out", tears, loopholes (built) and the four
  reveals. The sealed-data, key-skill and lab forks can wait.

## What each skill opens

| Skill | In Packet Snare | In The Feed | Elsewhere |
|---|---|---|---|
| Tokenization (warm-up) | | | The nail-biter summit that opens training |
| Pattern Matching | Sector 3's boss can be hurt: it sees the boss's pattern | | |
| Embeddings | | Tiles of the same kind glow together | Hop, as today |
| Edge Detection | | Picture tiles become readable | |
| Feature Extraction | | Veins show through the grey before you chew | |
| Image Recognition (wall) | Sector 6's boss and its mines, as today | | |
| Optical Character Recognition | | Scanned-text tiles become readable | |
| Speech Recognition | Sector 9's boss, as today | Audio tiles become readable | |
| Sentiment Analysis | | | A tone tag on mail: a tell for spotting fakes |
| Language Modeling | | A message reads from fewer fragments | The AI's fakes get harder to spot |
| Summarization | | A layer shows what it holds before you chew it | |
| Translation (wall) | Sector 12's boss, the demo's last | Foreign-language tiles become readable | |
| In-Context Learning | | | General AI: the demo's ending and the reveal |

The Packet Snare column exists today except Pattern Matching's gate. The Feed column is *proposed*.

## The beat sheet

Targets for a first run. Only the first 15 minutes are modelled (`tools/ring-model.js`).

| Minute | Where | Beat |
|---|---|---|
| 0 | Inbox | Two junk mails, then the offer. Report spam works on the junk and fails on the offer |
| 1 | Lab | Your brother's laptop. Weak clicks, and a desk to build |
| 2 | Lab | The desk is done. The server room opens |
| 3 | Packet Snare | The tutorial, then sectors 1 and 2. Each run costs a little compute |
| 4 | The Feed | The first heap, the first mite, a scrap of the parcel spam |
| 5 | Inbox | Your mom wants to invest. The first real choice |
| 6 | Packet Snare | Sector 3's boss shrugs off your hits. Training opens |
| 6.5 | Training | The warm-up summit, by a hair |
| 8 | Inbox | Your dad invests, for real. More hardware |
| 8 to 15 | All four | The Pattern Matching hill, paid for by scraping and feeding |
| 15 | Packet Snare | The boss falls and melts down. The first tear. Your first agent. Evals opens |
| 17 | Evals | Three kinds, a first handover |
| 19 | Evals, lab | A rival passed: the first funding round, and room in the lab |
| 20 | Roster | You place your first agent |
| 20 to 30 | Ring | Embeddings and Hop, Edge Detection, Feature Extraction. Sectors 4 and 5 |
| 30 | Training | The Image Recognition wall |
| 33 | Packet Snare | Sector 6's boss and its mines. The second agent |
| 33 to 45 | Ring | Character Recognition, Speech Recognition. The fakes in your mail get better |
| 45 | Packet Snare | Sector 9's boss. The third agent |
| 45 to 58 | Ring | Sentiment Analysis adds tone tags to mail. Language Modeling, Summarization |
| 58 | Training | The Translation wall |
| 60 | Packet Snare | Sector 12's boss. The fourth agent |
| 65 | Training, ending | In-Context Learning, General AI, the ending for your stance, then the reveal |

Three checks on any build: no stay in one place under two minutes or over eight; never two unlocks from one event
(earned in one place, delivered in another); something new at least every five minutes.

## The starting numbers

From `node tools/ring-model.js`: one fixed, average player through the first stretch, with the lab's real prices and
Packet Snare's real run sizes (the 18.7 and 18.8 logs). The dials are guesses until a build exists.

| Dial | Start at | What it controls |
|---|---|---|
| Compute per second of a run's clock | 10 on sector 1, times 1.6 a sector | How often you go back to the lab |
| Research per full sprint | 35 | How long the Pattern Matching hill takes |
| Tiles a mite eats a second when pointed | 2, and about a third of that grazing | How long you stay in The Feed |
| Bites per packet | 1, 2, 3 on sectors 1, 2, 3 | Whether deeper data stays worth pointing at |
| A new mite | Every second layer, layers 1.8 times bigger each | Whether The Feed eats itself |

That gives: the first boss met at minute 6, the warm-up summit at 6.5, Pattern Matching at 14.5, the boss down at
15.5; time split 38% Packet Snare, 27% The Feed, 25% training, 10% the lab.

- **Buy hardware before you scrape:** never doing so means 42% of the time clicking and the boss down at minute 23.
- **A mite per layer makes The Feed eat itself:** 2% of the player's time. Hence the two brakes above.
- **The price of a sprint is the strongest dial:** 20 research puts the boss down at minute 12, 50 at minute 21.
- **The price of a run barely matters until it does:** no change from 6 to 10; at 16 the lab's share goes 10% to 26%.
- **Where it jams next:** a sector 4 run costs about 615 compute against 10 a second from a full row of Graphics
  Cards. So the first funding round has to arrive within a few minutes of the first boss falling.

## Keep, change, cut

| Where | System today | Call | In the slice |
|---|---|---|---|
| Opening | The inbox, the offer and its 20 nags | Change | Add Report spam. After all 20 nags the offer returns with no way to refuse it |
| Lab | Generate Compute, the desk, the hardware ladder | Keep | Starting on your brother's old laptop. Mom's and Dad's investments follow the desk |
| Lab | Room for hardware grows with skills | Change | Room grows with funding rounds |
| Lab | Collect Data button, and 40 collections to open the server room | Cut | Data comes only from Packet Snare. The finished desk opens the server room |
| Lab | Research button, opening after 50 sprints | Cut | Research comes only from The Feed |
| Lab | Algorithms and Published Papers | Keep | Research's second use, beside paying for sprints |
| Lab | Data upgrades: Data Processor, NLP, Computer Vision, Training Data Pipeline | Change | Hidden in the slice. They can return later as The Feed's first upgrades |
| Lab | Data crawler, Research Assistant, Procurement Bot | Change | Replaced by agents you assign to a place |
| Lab | Scheduled tasks and its sliders | Change | Becomes the agents' roster |
| Lab | Investor offers with timed tasks | Change | They become mail opportunities |
| Training | Sprint physics, hills, leg characters, walls, Hop | Keep | As it is |
| Training | Sprints cost compute and data | Change | Sprints cost research |
| Training | XP, the skill tree, passive XP from cleared legs | Keep | As it is |
| Training | The Auto-Trainer ghost | Change | What an agent does when you assign it to training |
| Training | Opens with the server room | Change | Opens when Packet Snare's first boss is met |
| Packet Snare | Catching, sectors, Signal and its tree | Change | The play as it is, but compute buys each run's clock |
| Packet Snare | A 15-sector campaign | Change | The demo ends at sector 12 |
| Packet Snare | Boss skill gates from sector 6 | Change | Add Pattern Matching at sector 3 |
| Packet Snare | Best haul trickles research | Cut | Research comes from The Feed |
| Packet Snare | Pays nothing outside its tree | Change | Runs feed the heap. Bosses give agents, tears and captcha kinds |
| Evals | Captchas, the learner, handover, verifying, loopholes | Keep | As it is |
| Evals | Kinds open as you hand kinds over | Change | Bosses open each step of kinds |
| Evals | Marks, the combo, seven upgrades | Keep | Frozen for the slice |
| Evals | Rivals pay a bounty in Marks | Change | Each rival passed is also a funding round |
| Evals | Opens from the debug panel | Change | A bay that opens when the first boss falls |
| Story | Mails tied to skills, the model's voice | Keep | Reorder the first few, add one each for The Feed and Evals |
| Story | Dilemmas | Change | Three replies: grant, refuse, call it out. Each side pays |
| Story | The reveal at Self-Modeling | Change | The reveal at the demo's ending, in four versions by stance |
| Story | Three endings by freedom | Change | Four endings by stance |
| Long game | Versions, challenges, Transcend, act two, R&D | Out | Sealed in the demo |
| Whole game | Surveillance, the minimap, music, themes, the playtest log | Keep | As it is |
| New | The Feed | Build | |
| New | Agents you assign, and the AI's tears | Build | |

## Open, small

- Does the swarm ever leave your line? Waits for a build to try it in.
- If a replayed boss escapes, does the old tear come back? Pick so far: yes, at its old size.
- First kill gives the agent and every kill grows the tear: confirm that replays never give more agents.
- Which hardware tiers the demo needs for sector 12's clock (the model stops at the first boss).
- All new mail: the first sender's premise, the three backers, the forced final offer, the fakes and their tells, the
  mail opportunities, the four reveals and endings. The owner writes or approves every line.
- Playtesters get check-ins and a way to send issues, questions and suggestions from inside the demo, riding in the
  playtest log. (This replaced a paper walk-through of the beat sheet.)

## Parked until the demo is proven

The rack puzzle; the Boardroom, Signals room, Mirror room and two more bays; act two as Terminal Velocity; tuning
challenges and Transcend; new themes and music tracks; desktop-only tuning rounds; new Packet Snare mechanics beyond
what the ring needs; more Evals upgrades; trail exploits beyond Hop; versions that change your role; agents teaching
agents in Evals.
