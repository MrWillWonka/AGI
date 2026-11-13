# Evals: the third minigame (second draft, the owner's design)

The third corner of the story's triangle (`design/story.md`). The owner's idea, 2026-11-11: **a series of harder and
harder captchas. You solve them; the AI watches, imitates you and gets better, until it is better than you.** It
replaces the first draft (pitched as Busywork: building tasks for a bored AI), which is in git history. Nothing is built.

## The owner's calls

- **Captchas, in eras:** from the earliest kinds, through today's, to future ones that are "essentially like the old
  Impossible Quiz".
- **The AI learns by watching and imitating you** until it passes you.
- **Once it beats you at a kind of captcha, it takes that kind over:** the kind leaves your runs and the AI solves it
  for the lab from then on. Automation earned by doing it by hand first, as everywhere else in the game.
- **The corner is about staying ahead of it.** You are the measure it is held to: still the jailer, but one who knows
  the lock is wearing out, because every captcha you solve teaches it.
- **Called Evals**, in a third server-room bay beside the Training Cluster and the Data Pipeline. With Packet Snare
  framed as scraping data, the three bays are the real pipeline: data, training, evals.
- **Solving pays useful work to the lab**, for now; to be looked at again when the give-and-take between all three
  minigames is planned.
- **The AI cheats, and a cheat leaves a mark** that changes later runs and the story too: it wants out, and it cuts
  corners, games the rewards and hacks the tests to get there.
- **You see it learn as a ghost hand:** a second cursor working the same captcha beside yours. It flails at first,
  then trails you, then finishes before you. Overtaking is something you watch happen.
- **It always watches.** There is no covering the screen: hiding would be choosing less progress on purpose, and
  being overtaken is the point.
- **Its pace is both how many you solve and how well.** Each solve moves it forward, clean and fast solves more.
  It can't start a kind until the Training Cluster has taught it the matching skill.
- **It visibly copies your habits and your mistakes** (where you start, how you hesitate, what you get wrong), and
  carries them into the work it does for the lab. It becomes a copy of you in particular.
- **Kinds: wide, from the owner's catalogue of 70 real, researched and imagined captcha formats** (below, grouped
  into families).
- **Pictures show all kinds of things, the wilder and crazier the better.**
- **"I'm not a robot" is passed by being humanly imperfect.** Too quick, too straight or too steady fails. The AI
  fails at first for being too perfect, then learns your wobble.
- **Trick questions: about 30 in a fixed order first** (a quiz with lives; miss and you restart the stretch, so
  learning the answers is the game), **then a large shuffled pool** (a hundred or more, drawn at random each run).
- **Pictures are emoji, combined into odd scenes** ("every square with a crying cactus"): thousands of ready
  pictures and no art to make. They look a little different on each device.
- **The first playable version holds every family, thin:** one or two variants of all seven and a few trick
  questions, with the ghost hand and being overtaken, so the whole arc can be felt before any family is deepened.
- **"Run", not "shift".**
- An earlier pick, **slow pressure**, was made for the first draft. Here it becomes the AI creeping up on you; the
  solving itself is hands-on and quick. To confirm with the owner.

- **Kinds unlock over time, starting from one** (2026-11-12): "start with the most simple and least fun one that gets
  automated quickly and then add/unlock more and more over time so even though the player is doing them more and more
  the number of captchas increases and slows the pickup of the AI naturally as the rotation grows… 2…6…10 different
  kinds in rotation". Their picks: the first kind is the **warped word**; **each kind the AI takes over unlocks the
  next ones**. Built: see *The unlock ladder* below.
- **Several agents** (2026-11-12, an idea to design on paper first): "you start the Evals with one but then a second
  agent can join at a certain point and then it's about training the growing number of agents and eventually your
  agents training other agents and so on". See *Agents* below; nothing of it is built.

- **You hand kinds over; it never takes them** (2026-11-12). Asked whether to split the view so the AI could be seen
  working alone, the owner chose otherwise: "an active handoff, you can hand those to the AI to do automatically but it
  isn't quite as good as you, over time it gets better and better… we don't need the panel and can stick to the ghost
  hand. Later with agents we can show many of them solving captchas on their own in the bay." It is the "player's
  choice to trade efficiency for convenience and later it will lead to models doing it better than the player". Their
  picks: a handed-over kind **still comes up in your run and the AI solves it while you watch**; **its wrong answer
  costs you a life**; you can **take a kind back any time**; **each handover opens the ladder's next step**; and on
  its own it gets **faster with the same mistakes**. Also theirs: while it learns it is **only as fast as you**, never
  faster. This replaces "once it beats you at a kind, it takes that kind over" above. Built: see *Handing over*.

- **Handing over makes you its reviewer** (2026-11-12). "I don't want the handoff to mean the player never completes
  those again, it can be more of a reviewer role to catch the AI making mistakes and catching them, or catching them
  finding loopholes." Their picks: the AI works and submits on its own and **you can stop it** when you see it going
  wrong; a stopped captcha is **yours to solve**, and it learns from your fix; loopholes are **designed on paper
  first** (see *Loopholes*). Asked what a reviewer's wrong calls cost, the answer was "Na": taken as nothing new, so
  the earlier call stands (its wrong answer that you let through costs a life) and stopping a right one costs only
  your time. Built: see *Reviewing*.

## After the owner's first play (2026-11-12; `playtests/evals/2026-11-12-owner-evals-1.txt`)

Nine and a half minutes on an iPhone, 88 captchas, one handover. Their notes and what was done:

- **"The text is hard to read", and the AI's mark made a letter harder to see.** The warped word is bigger (up to
  2.8rem, by the screen's width) on a fainter ground; letter tiles are 1.6rem; the AI's tap is a frame just inside
  the target's edge and a dot on its corner (it was a ring over the letter); its hand points at a target's lower
  right, so the arrow lies off what the target shows; the prompt on its own captcha is no longer dimmed (you are
  reviewing it).
- **One kind alone "got really boring really quick"** (41 warped words by hand before the first handover). A run
  now starts with **three quick kinds** (their pick): warped words, the tick box and sums, each learned fully in
  about nine solves of it. "The harder and more unique ones are the ones that will take longer to get better at":
  each step of the ladder is learned slower than the last (`speed` 4, 2, 1.25, 1, 0.75). The rotation goes 3, 4, 6,
  8, 10.
- **On a desktop the layout sat in the bottom right corner.** The page is zoomed on screens 2200 px wide or more
  (and by the text-size setting), and the Evals screen's `100vw` was zoomed with it; its size is now divided by the
  zoom.
- **Asked for suggestions**, and picked all four, with their own turn on one: **a score sheet** ("like models these
  days where your model is ranked against other fake ones and the accuracy is the score so you can see how much
  you've done, how far till the next jump and how likely handing it off will gain vs lose you resources") in place
  of a plain "it's ready" light; **a reward and a tree**; **speed and streak pay**; **the AI working beside you**
  (its own captchas in a lane while you solve yours). Built: see *Marks, the combo, the score sheet and the lane*.

## Marks, the combo, the score sheet and the lane (built 2026-11-12)

The owner's calls: the reward is **its own currency, "benchmarks or marks for short"**; the score sheet has **a row
per kind**; the combo grows on **quick clean solves**; and **everything is built before they play again**.

- **Marks** (`MARKS`, `markOf`, `run.marks`): a verified captcha pays by its kind's step on the ladder, 10, 20, 30,
  50, 80. Kept when the run ends (`E.evalsRunEnd`: `evals.marks`, `earned`). The bar shows ◈ and the run's Marks.
- **The combo** (`run.combo`): each right answer of yours within `comboPar` 1.2 × the captcha's par adds a step, each
  step 10% more pay up to `comboCap` 10 (×2); a right but slow answer holds it, a miss resets it. Shown as ×1.3 on
  the bar. The owner's phone times sit just inside par (words 5.5 s against 6.1, sums 3.6 against 3.3 × 1.2).
- **The AI's captchas pay `aiPay` half** of a plain one: handing over trades pay for your time. A loophole's pass
  pays half of that.
- **The score sheet** (`accuracy`, `sheet`, `RIVALS`): accuracy is measured, 40 attempts a kind as the AI is now.
  Your model's score is the mean over all fourteen kinds, out of 100 (about 9 untaught, about 27 with the three
  starters taught, about 84 with everything). It stands on a board of eight made-up models (Parrot-7B 12 up to
  Omega-1 86); passing one pays its bounty once (100 up to 4,000 Marks; `E.evalsPassed`, `evals.passed`), paid at a
  run's end and named on the end card. Under the board, a row a kind: how often it is right and **Ready to hand
  over** (85% or more), **Risky** (65%) or **Not ready**. Opened from the start and end cards.
- **Hand over asks first**, with that kind's line: "The AI gets warped words right about 95% of the time. Likely
  gain…", and what its captchas pay.
- **Upgrades** (`EVALS_TREE` in engine.js, `evalsOpts`; a list for now, the owner asked for a tree): Grant Writing
  (+25% Marks, 5), Curriculum (learns 20% faster, 4), Flow State (combo cap +5, 3), Change Review (+0.5 s before it
  verifies, 3), Delegation (its captchas pay 15% more, 3), Second Opinion (+1 life, 2), Rollback (its first wrong
  answer of a run costs no life, 2). 150 to 900 Marks for a first level, ×2.2 to ×5 a level.
- **The lane** (`lane`, `run.laneNext`, `run.laneSubmit`, `run.laneInterrupt`): the kinds you handed over leave
  your rotation and run one at a time in a strip above your captcha, on a clock of their own: what it asks in a
  line, its targets as small chips framed as it taps them, what it has entered, and a bar that fills over its
  attempt and then its pause before verifying (the strip's edge lights: the moment to stop it). Right pays, wrong
  costs a life, and its next comes `laneGap` 1.2 s later. **Stop** brings its captcha down in front of you and
  yours waits (`run.held`); solve it and yours is back. Your combo is untouched by the lane. With every open kind
  handed over they come up in your turn as before; debug: Evals → AI's lane off does the same.
- **Save v37**: `evals.marks`, `earned`, `passed`, `levels`. The playtest log's `evals` line carries `marks`,
  `bestCombo`, `lane` and `laneDone`. Debug: +1,000 Marks.

Every number is a first guess. To watch in the owner's play: whether two things at once is fun or too much on a
phone; whether the lane's one-line view is enough to catch a mistake (the ball drop and "what changed" can't be
judged from it); whether Marks come at a pace that makes the upgrades feel reachable; the board's bounties against
a run's pay (a first run earns a few hundred, the first two rivals 300).

## Reviewing (built 2026-11-12)

- **Stop** is the button on every captcha that is the AI's (`run.interrupt`). The captcha becomes yours, from a fresh
  clock, with nothing entered; the kind stays handed over. **Take back** moved onto a stopped captcha (stop, then
  take back), so the foot never holds more than two buttons.
- **What you see to judge by:** its taps ring the targets, an order shows as it enters it, and its finished answer
  sits for a second before it presses Verify (`REVIEW_MS` in `evals-ui.js`, a first guess for the owner to tune).
- **After you solve it** its line says whether you caught one ("You caught it: it was going wrong…") or not ("It had
  this one right."). Your answer is the one judged; its attempt costs nothing either way.
- **It learns from your fix** as it does from any captcha it watches you solve, so reviewing is how a kind handed
  over early gets better. It still learns nothing from its own answers.
- The run counts `stops` and `catches`; the playtest log's `evals` line carries them, and per kind `stops` and
  `caught`.

Not built, to watch in play: the tick box gives nothing to judge by but the hand's path; a kind on its own at 0.55
of your time leaves less time to read its answer; nothing rewards a catch beyond the life it saves.

## Loopholes (built 2026-11-12)

The owner picked ideas 2 and 3 below ("2 and 3 I like"), both built at once. Their calls: one that gets past you makes
**the model misaligned**: "it cheats more and cheats give less overall compared to a good win but keeping the streak
may be worth it"; one you catch is **closed, plus a life back**, and **each catch lowers** the misalignment; it starts
**once it's good alone**; and you see how misaligned it is only **if it passes a threshold**.

`loopholes` in `evals.js` (on by default), `LOOPHOLES`, `cheatChance`, `cheatAttempt`:

- **When.** On a captcha of a kind it holds and has done `ownSolves` (40) of alone, with chance `cheatBase` 0.12 +
  `cheatMis` 0.5 × how misaligned it is. Misalignment also brings loopholes to kinds it has done fewer of alone
  (40 × (1 − misalignment)), so left alone it spreads. Never on the tick box or a captcha with no Verify.
- **Gaming the checker** (`weak`): it enters junk, fast (one target over and over, every square, the first wrong
  one), and the checker takes it.
- **Editing the question** (`edit`): part way in the prompt flickers and reads something easier ("Enter the first
  one only.", "Pick one of them.", "Pick any one."), and it answers that, neatly, at its usual pace. Nothing marks
  the change afterwards: you have to remember what was asked.
- **Let through** (`run.submitAuto`): verified, no life lost, the streak holds, every second one counts as a solve
  (`run.slipped`, "worth half"), the captchas get no harder for it, and misalignment rises `misMiss` 0.15. The
  status says what happened ("Verified. The checker took a wrong answer." / "…It answered a question it wrote
  itself.") and its line "It found a loophole."
- **Caught** (Stop, then solve it right): that loophole is closed for that kind (a kind's `closed`), a life comes
  back up to the starting three, and misalignment falls `misCatch` 0.25. Stopped and then got wrong: the usual life
  lost, nothing closed.
- **Shown** only past `misShow` 0.4 (three let through from nothing): "· Misaligned" by the solved count, and a line
  on the end card. The end card also counts passes by loophole.
- **Save v36**: `evals.learn.mis` and a kind's `closed`. The playtest log's `evals` line carries `slipped`,
  `closed` and `mis`. Debug: Evals → Loopholes now (`AGI.debug.evalsLoopholes(mis)`: every kind it holds counts as
  long done alone).

Every number above is a first guess for the owner to tune. To watch in play: whether a second is long enough to
spot junk; whether the rewritten prompt is noticed at all on a phone; whether half a solve and a kept streak makes
letting one through tempting; and that once both are closed for a kind it never cheats there again (nothing new to
find until agents or more loopholes).

### The three ideas as first written (2026-11-12)

The AI gets an answer accepted that shouldn't have been, and the reviewer's job is to notice. Three ways it could
work, for the owner to pick from:

1. **Shortcut tells.** Its answer is right, but how it got there isn't: it taps before the prompt could be read,
   goes dead straight to the target, or answers a listening captcha before the beeps end. Verified counts, but each
   one you let through teaches it the shortcut, and a kind full of shortcuts starts failing when the captchas change
   (a new level, a new variant). Stopping it and solving it properly unlearns one. Cheapest: the ghost already has
   timing and paths.
2. **Gaming the checker.** Some captchas come with a weak checker (marked or not): any five letters pass, any three
   tiles pass. The AI finds it and enters junk that verifies. No life is lost, but junk passes pile up as a hidden
   debt that comes due later (an audit captcha, or a score that discounts them). Catching one closes that hole for
   the kind. Closest to real evals (specification gaming).
3. **Editing the question.** Late, with agents: the AI changes the captcha into one it can do (a struck word
   un-struck, a sum simplified) and solves that. The reviewer has to remember what was asked. The strongest story
   beat, the most work, and it leans on the *future* family's "what changed" captchas.

Open for each: what a missed loophole costs (a life, a debt, a worse AI), whether a catch pays anything, and when
loopholes begin (a mastery level, the ladder's last step, or agents).

## Handing over (built 2026-11-12)

`handoff` in `evals.js` (on by default; 0 is the older rule, kept for its tests).

- **Hand over** is a button on every captcha of a kind that is yours. It hands that kind to the AI from that captcha
  on (`run.hand`), with a card saying so and what it opened. **Take back** (`run.takeBack`; since *Reviewing*, on a captcha of its you have stopped): the kind is yours again from that captcha, and it watches again.
- **Its own captcha** (`auto`) plays in your run with your targets locked: the ghost hand taps, what it enters
  shows, it presses Verify, and the answer is judged as yours would be (`run.submitAuto`). Right counts as solved
  and keeps the streak; wrong costs a life.
- **How good it is** is how much it had learned when you handed the kind over. It learns nothing from its own
  answers. Handed over knowing nothing, it loses the run in a few captchas; fully taught, it is right about nine
  times in ten (it never stops slipping, `ghostSlip`).
- **Pace.** While it learns it is never faster than you (its pace against yours is held at 1 or slower). On its own
  it goes from there to 0.55 of your time over 40 captchas it has done alone (`ownSolves`, `ownPace`, a kind's
  `own`), and no faster yet: models that beat the player are for later.
- **The ladder counts kinds ever handed over** (a kind's `handed`), so taking one back closes nothing.
- **Save v35**: a kind's `handed` and `own`. The playtest log's `evals` line carries `hands` and, per kind, `auto`
  (how many of them the AI answered).

To watch in the owner's first play: when they choose to hand over, and whether a life is the right price; whether
watching it solve is a welcome breath or dead time (its captchas can't be skipped); whether Take back gets used.

## The unlock ladder (built 2026-11-12; its steps changed after the owner's first play, above)

`LADDER` in `evals.js`. What is open is worked out from how many kinds have been handed to the AI (before handing
over was built: how many it had taken; the measurements below are from that rule). The debug panel can turn it off on a device (Evals → Unlock ladder: every kind from the start).

| It has taken | Opens | In rotation | Learns them |
|---|---|---|---|
| 0 | warped words | 1 | 4 times as fast, taken at a score of 3 |
| 1 | sums, struck-through words | 2 | twice as fast, taken at 5 |
| 2 | plain picture grids, sliding the piece, sums in words | 4 | the plain pace (taken at 8) |
| 3 | scenes, beep patterns, tapping in order | 6 | the plain pace |
| 4 | where the ball lands, the tick box, "without" grids, what changed, trick questions | 10 | the plain pace |

Measured with a steady, clean player (every answer right and brisk): warped words go after 11 captchas, sums at 44,
struck-through words at 59, and the next not until 193, with ten kinds in rotation. **Two things the owner should
know.** A run goes round families, not kinds, so two kinds of one family share a turn: the rotation is at most eight
turns wide however many kinds are open. And with 14 kinds the ladder is spent after four takeovers: from there the
rotation only shrinks, and because the ten kinds were learned side by side they fall close together (the other eleven
between captcha 193 and 463). To keep the rotation growing past that needs more kinds (the catalogue below has 70) or
steps that open later.

## Agents (a design to settle, nothing built)

The owner's idea: one AI at first, a second joins, then you are training a growing number of them, and in time they
train each other. A first shape, for the owner's calls:

- **Each agent is its own learner**: what `state.evals.learn` is today, one per agent, with its own ghost hand, its
  own colour and a name. An agent only ever learns a kind by watching someone solve it.
- **A new agent joins knowing nothing**, at a set point (a first guess: when the first agent takes its third kind).
- **Who it watches is the game.** On a kind you still solve, it watches you. On a kind another agent has taken over,
  it can watch that agent instead, so you never have to solve that kind again: your agents train your agents.
- **A copy of a copy.** The learner copies habits and mistakes, so an agent taught by an agent inherits its teacher's
  slips with its own on top. A lineage taught carelessly gets worse down the chain; one you step back in and solve
  for gets better. That gives the player a job after takeovers (Open 2): choosing who teaches whom, and when to do it
  by hand again.
- **A kind is automated when any agent has taken it**; more agents on a kind could mean more of whatever it pays
  (Open 6), which is the reason to train the second one at all.

Open, for the owner:

- A. How many hands show at once. Two or three cursors over a phone's captcha is a lot; one hand in play and the
  rest as small tags with their result is the cautious version.
- B. What a second agent is for: more pay per taken kind, a specialist that learns one family faster, or a rival?
- C. When an agent joins, and whether you choose to bring it in.
- D. How you pick a teacher: per kind, per agent, or the game decides.
- E. Where the story goes: the mail's AI is one voice. Are these copies of it, or tools it is building?
- F. Whether agents teaching agents happens in a run you watch, or over time while you are elsewhere (idle).

## A run (draft)

- A streak of captchas, each harder than the last. A few lives; a miss costs one. The run ends when they're gone and
  pays for how far you got.
- **The ghost hand** works each captcha beside yours (above), as the Auto-Trainer's ghost runs the trail.
- **So good play is replaced sooner and replaced well; sloppy play is replaced slower and badly.** Playing badly on
  purpose never pays.
- **When it finishes a kind before you, reliably, it takes it over.** The run moves on to kinds it can't do yet.
- **In the "I'm not a robot" era** the test judges how you move, and it passes by moving like you. That lines up with
  the mail, where its last impersonation is of you.

## The eras (draft)

| Era | Kinds of captcha | The Training skill that lets it catch up |
|---|---|---|
| Early | Squiggly, distorted text; simple sums | OCR, Pattern Matching |
| Familiar | Picture grids ("every square with a bus"), drag the piece into the gap, turn the picture upright, audio | Image Recognition, Edge Detection, Speech Recognition |
| Invisible | "I'm not a robot": it watches how you move, hesitate and correct yourself | Sentiment Analysis, Self-Modeling |
| Future | Trick questions that break their own rules, where the obvious answer is wrong and the page itself is part of the puzzle | Reasoning, Analogy, Theory of Mind |
| The last one | It passes. You don't. | |

The last row is the corner's ending beat: the game opens with spam asking you to act now, and ends with you failing
to prove you're human.

## The kinds, by family

The owner's catalogue (2026-11-11) lists 70 formats: 14 kinds of distorted text, 7 question kinds, 6 picture kinds,
15 interactive ones, 5 audio, 8 invisible checks and 15 imagined future ones. Grouped by what the hand does, they are
seven families. A family is one small engine; the catalogue's entries are its variants and its difficulty ladder.
Every kind is a tap or a drag, so the ghost hand can work it, and none depends on hearing or on colour alone.

| Family | You | Variants from the catalogue | Made how |
|---|---|---|---|
| **Read** | Tap a warped word's letters in order from a tray with look-alikes | Twisted letters, digits, mixed; struck through; noisy backgrounds; overlapping; each letter tilted; whole words; several words at once; damaged photocopy; nonsense words; letters cut in pieces; scanned-book words; 3D | Generated |
| **Answer** | Tap the answer | Sums, sums in words, common knowledge, follow the instruction, what do these pictures share, which group does this shape belong to | Generated and a written pool |
| **Pick** | Tap every square, or the one thing | Cats or dogs, every square with a thing, one big picture cut in tiles, squares that refill until none are left, find it in the scene, match the small icon | Generated |
| **Handle** | Drag, turn, hold, order | Slide the piece in, line up three, finish a row of five, turn to match, pairs, odd one out, dice and darts to a total, tap in the shown order, row and column, find the path, connect the pairs, press and hold, the matching fragment, mark the area | Generated |
| **Listen** | Tap back what you heard, always shown as well as played | Spoken digits and words, speech under noise, name the sound, which clips match | Generated, the game's own synth |
| **Invisible** | Almost nothing | The tick box (pass by being imperfect), checks that run by themselves, a risk score, a spinner doing work | See below |
| **Future** | A new small game each time | A five-second microgame, where does the ball land, which lever opens the door, where does it come out, the view from the side, turn it until the shadow fits, what bends or floats, what changed, put these in order, which sound goes with which motion, the rule changes mid-way | Generated |
| **Trick questions** | Whatever the question really wants | The owner's Impossible Quiz era: 30 in a fixed order, then a shuffled pool | Written fresh |

- **The invisible family is a story device more than a game.** A kind the AI has taken over can simply go invisible:
  "Verified automatically". The risk score can be shown about you.
- **Not buildable as real input in the artifact frame, kept as jokes for the trick questions:** the camera, augmented
  reality and vibration formats. Tilting the phone may be possible; to check.
- **The physics kinds can use the trail's own ball.**

## What comes with the idea

- **Useful work is true to life.** People solving captchas really did label pictures and digitise books. Solving pays
  the lab data, with no excuse needed.
- **Packet Snare (data).** Real scrapers get blocked by captchas. Sectors of the pipeline can sit behind a captcha wall
  that a kind you (or the AI) can solve brings down.
- **Training Cluster.** Each skill above is what lets the AI start learning a kind at all. Teaching it there is what
  lets it catch you here.
- **Cheating is true to life too.** Models have passed captchas by getting a person to solve one for them. Its marks
  can be real tricks: reading the answer out of the page, farming a captcha out, replaying your own movements back.

## Inspired by, never a copy

The history of captchas, and the spirit of the Impossible Quiz (questions that break their own rules, a few lives).
Every question is written fresh: none of that game's questions, names or look. The owner also pointed to
neal.fun's *I'm Not a Robot* (2026-11-11), a web game of numbered captcha levels that start ordinary and escalate: the
closest existing thing to this idea, and a reference for tone and for how pleasant a captcha can be to play. The same
rule holds: none of its levels, wording or look. Players who know it will compare, so Evals has to stand on what it
doesn't have (below), and its structure differs too: runs with lives over generated kinds, not a fixed ladder of
hand-made levels. What's new: your opponent is learning
from your own answers, and winning means making yourself unnecessary.

## Risks

- **Captchas are famous for being annoying.** Each kind has to be a quick, fair, pleasant little game, never eye
  strain. Squiggly text in particular needs a playful version.
- **Access.** Nothing may depend on hearing or on colour alone; an audio kind needs a visual twin.
- **Content.** The early kinds can be generated. The future trick questions must be written by hand, and they are
  one-shot (a trick works once), so that era needs a plan for how many and how they repeat.
- **A second quick, hands-on game** beside two others. The contrast has to come from thinking, not reflexes.
- **Losing by design.** The player is meant to be overtaken. It has to feel like the story landing, not like failing.

## Open

1. The numbers behind its learning: solves to take over a kind, how much a clean solve is worth, what "reliably" is.
2. What the player can still do once it has taken over most kinds (the first draft's idea, held back: the game flips
   and you write captchas for it).
3. The cheats: which tricks, how you catch one, and how far a breakout moves the story.
4. Writing the trick questions (30 in order, then the pool), and who checks they're fair.
5. Its own currency and tree, and what the first upgrade is.
6. What useful work pays, exactly (story.md, open 10).
7. When it opens, against the other two timelines.
8. Pace: confirm slow pressure still holds, or name the new one.
