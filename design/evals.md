# Evals: the guarding minigame (first draft)

The third minigame, the Guard corner of the story's triangle (`design/story.md`): you keep the AI occupied so it doesn't
test the walls. The owner picked the idea on 2026-11-11 from six (Air Gap, Decoy Lab, Terrarium, Eyes On, Chaperone and
this, pitched as Busywork), with a pace of **slow pressure**: mostly planning, but waiting has a cost. Nothing is built.

**The owner's calls so far (2026-11-11):**

- **It's called Evals**, a name from building a model, not Busywork. With Packet Snare framed as scraping data, the
  three bays are the real pipeline: data, training, evals.
- **It lives in a third server-room bay**, beside the Training Cluster and the Data Pipeline.
- **Finished tasks are useful work for the lab** (labelled data, checked research), for now; to be looked at again when
  the give-and-take between all three minigames is planned.
- **A shift ends in a last stand that leaves a mark** (below): the AI wants out, and it cuts corners, games the
  rewards and hacks the tests to get there.
- **The mark changes the story too**, not only later shifts.

Everything else is a draft to react to.

## The idea in one line

The AI hired you with a work-from-home spam offer. Now you invent work for it, and the smarter you make it, the faster
it gets through it.

## A shift

- **The queue.** A short row of slots (three to start). The AI works the task at the front. You build tasks and drop
  them in behind.
- **Building a task.** Drag pieces from a tray onto a ticket: two to four pieces in a row. Tap to send it to the queue.
  Nothing is timed while you build except that the queue is draining.
- **Boredom is the clock.** A bar that rises whenever the AI has nothing worth doing, and falls while it is absorbed.
  When it fills, the shift goes into its ending (next section). A shift is never "failed": it ends, and pays for the
  time you held it.
- **What holds its attention** (the decision in every task):
  - **Fit.** Each piece has a kind that matches a skill (seeing, sorting, reading, listening). A piece far below its
    skill is done in a blink. A piece far above it frustrates it, which is boredom too. A piece just past what it can
    do holds it longest.
  - **Novelty.** The same kind again and again holds it less each time. Variety resets that.
  - **Chains.** A piece whose result feeds the next one multiplies the whole ticket's hold. Building a good chain is
    the skill, and the big number.
- **The AI is in the room.** It has moods you can read at a glance (absorbed, content, restless, pacing, testing) and
  it comments on what you hand it, in its own voice, less innocent as it learns ("Sorting again. I sorted yesterday.").

## How a shift ends (the owner's call, drafted)

- **It cuts corners first.** As boredom climbs, the AI stops doing tasks properly and starts gaming them: a ticket
  comes back finished without the work done. A hollow result pays nothing and spoils the useful work it was part of.
  This is the same idea as the trail's exploits (`design/contract-breakers.md`), turned round: there you break the
  rules, here it does.
- **The last stand.** With the bar full it makes its move, and you get a short scramble to catch its cheats and hold
  it a little longer, for bonus pay.
- **The mark.** The trick it got out with is one it keeps. It uses it in later shifts until you counter it in the
  tree, and each breakout also moves the story (it is a little freer each time). This is the one place where how well
  you play, not only what you choose, steers the story; story.md says so.

## What grows

- **Levels.** Each shift level the AI is sharper: boredom rises faster and yesterday's tasks hold less. A level is
  cleared by holding it for a target time in one shift.
- **Its own currency and tree**, as the other two have (a name is open: Quiet, Calm, Hours). First upgrades show in
  the next shift: a fourth slot, a bigger tray, a new piece kind.
- **Rule changes later** (each a hexagon with a demo, as the other trees do):
  - **Loops.** A ticket that feeds itself runs until the AI notices, which it does sooner the smarter it is.
  - **Nested tasks.** A ticket inside a piece.
  - **Templates.** Save a ticket you built; a scheduler refills the queue from your templates. This is the automation,
    and what outlasts the run.
  - **Its own requests.** Now and then it slides a piece of its own onto your tray: "Can I have this one?" It would
    hold it for a long time. This is the minigame's clear fork (give it what it asks for, or not), a choice and never
    a missed tap.

## How it ties to the other two corners

- **Training Cluster (Teach).** Each skill learned makes the AI faster at that kind of piece, so old tasks stop
  working, and also adds a new kind of piece to your tray. Teaching it makes guarding harder and richer at once.
- **Packet Snare (Open).** Pieces are made from data. A basic supply comes from the lab; better pieces (gold, tagged)
  come from what you caught in the pipeline. Every sector opened could also make it restless sooner: it knows there is
  more out there.
- **Neither is required to play a shift.** A player leaning on this corner alone always has basic pieces.

## The activity contract (second-minigame.md, section 4)

| Asked for | Here |
|---|---|
| A verb understood without reading | Drag pieces onto a ticket, hand it over, watch it work |
| A constraint that makes a decision | Fit, novelty and chains against a draining queue |
| A first upgrade visible in the next attempt | A fourth queue slot |
| A later rule change | Loops, templates, its own requests |
| A benefit outside the activity | Open: see below |
| A comfortable way to stop, switch or automate | A shift ends by itself; templates and the scheduler |

## Inspired by, never a copy

Zoo enrichment (keepers inventing puzzles so a clever animal doesn't pace), production-line and queue games, and the
idea of a flow channel between boredom and frustration. What's new: the opponent is the boredom of a mind you are
making smarter in the other two minigames, and it talks back about your work.

## Risks

- **It could feel like chores.** The chain has to be a real puzzle with a visible payoff, or assembling tickets is
  admin.
- **Watching more than playing.** While the AI works a long ticket there must be something to do: building the next
  one should always be worth it.
- **Fit has to be readable.** If the player can't see why a piece held or didn't, it reads as random.
- **First cut before any tree:** three piece kinds, three slots, the boredom bar, one chain rule, on a phone.

## Open

1. What useful work pays, exactly, and whether it stays once the three minigames' give-and-take is planned
   (story.md, open 10).
2. The tricks it can leave as marks, how each is caught and countered, and how far a breakout moves the story.
3. The last stand's verb: what catching a cheat is, on a phone.
4. When it opens, against the other two timelines.
5. Whether levels have set-piece moments, as Packet Snare has bosses.
6. The currency's name.
