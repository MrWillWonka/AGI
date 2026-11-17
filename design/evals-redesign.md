# Evals redesign: a proposal (2026-11-15)

**SUPERSEDED the same day by `design/evals-course.md`** (the owner: "Scratch what we have"; Evals becomes an obstacle
course you build for the AI). Kept for its diagnosis of the captcha version only.

Nothing here is decided. The owner asked for a redesign in parallel with a shell-and-words pass and a play-through
review ("the evals needs a lot of work to match the rest of the game"); the framing **"you teach, the AI is tested"**
is the owner's call. Numbers and copy are placeholders. Written from the design files and the code, not from play.

## 1. What Evals is for in the ring

- **Verb:** show it how, hand it over, check its work.
- **In:** a step of captcha kinds from each different boss beaten (`evalsSteps`).
- **Out:** a funding round for each rival passed, which is room in Parcel; Marks stay local.
- **Minute 17:** the Lab is full and the next sector costs more compute, so the first round is the way forward.
- **Minute 60:** a later boss has opened a new step of kinds, the next rivals are in reach, and loopholes have started.

## 2. Diagnosis: why it does not feel like the other apps

- **The AI is never actually tested.** The score (`sheet`, `accuracy` in `evals.js`) is worked out silently from what
  the learner knows. It rises by you solving captchas; no moment exists where the AI sits a test and a result comes back.
- **Handing over has lost its reason under the ring.** It used to open the next kinds; bosses do that now. It does not
  move the score. The central act of the framing has no payoff.
- **A run has no arc.** It is an endless streak until three lives go. Packet Snare has a clock, a goal, a boss and a
  risky big catch; The Feed has hunger, a split and a card. Evals has no goal inside a run, no peak, no reason to stop.
- **The skill is thin and the tension is slow.** Solving is tapping numbered targets. Checking is waiting for the hand
  to finish, then Verify.
- **Learning barely shows.** It lives in the ghost hand's wobble and a text line. Nothing ticks up per kind as you teach.
- **Loopholes read skill, not choice.** A loophole you fail to notice counts as "let through"; `ring.md` says paths are
  read from choices, never from how well you play.
- **Shell and words belong to the old game** (the first step of this was built on 2026-11-15: status bar, orb, the
  start and end cards' words).

## 3. Three directions

### A. The Sitting (small: a rework of the existing code)

A run becomes one benchmark sitting against the next rival on the board: a short clock, a fixed paper, and a results
reveal where your model's bar climbs the board.

- **Start:** a card names the rival to beat, the kinds on the paper and which are yours or the AI's.
- **Middle:** about 12 items on a clock of about 75 seconds. Your kinds you solve while the ghost copies; a per-kind
  "taught" meter ticks after each. Handed-over kinds it fills in and you verify, as today.
- **End:** results. Only kinds handed over count on the sheet; a rival passed is a funding round.
- **Skill:** speed and accuracy on your items, and judging when a kind is ready to hand over. Handing over is the bet:
  it banks that kind's accuracy into the published score, and from then on its mistakes are on you.
- **Loopholes:** a caught one raises a two-button choice, let it stand or close it; only that choice moves the path.
- **Pay:** Marks per item, the rival's bounty, the round. The seven upgrades regrouped into three short branches
  (Teach, Check, Publish) with one new node (extra time).
- **Reuses** almost everything; throws away the endless streak, the old words and the unused lane.
- **Risk:** it is still mostly solving captchas; checking stays a wait.

### B. Lesson, then Exam: you mark the paper (medium)

A run is two halves. In the lesson you solve against a clock while it watches. In the exam it answers alone, and its
finished answers come to you one at a time as a pile to mark, pass or send back, at thumb speed.

- **Lesson:** about 45 seconds, about 8 items, with the ghost and the taught meters.
- **Exam:** about 10 items. Each appears already filled in after a half-second replay of its taps; you tap Pass or Send
  back with a few seconds each. Sent-back items come to you to solve at the end, and it learns from them.
- **End:** the published score is what passed and was right; a wrong answer you passed counts against it.
- **Skill:** fast reading of someone else's answer, a different skill from solving. The risky big catch is passing
  quickly on trust to keep a marking combo.
- **Handing over** is putting a kind on the exam paper: no menu. **Loopholes** show in the pile as junk the checker has
  stamped, or a prompt that no longer matches; Send back opens the same let-stand or close choice.
- **An agent in Evals** pre-marks the easy ones and leaves the doubtful papers and every loophole to you.
- **Reuses** the kinds, the learner, the ghost, the loopholes, Marks and rivals; adds a run phase and a marking view;
  drops live waiting on the hand and Stop / Take back.
- **Risk:** the owner earlier asked that the AI "still go through the motions of filling things out"; here that is a
  short replay. Some kinds are hard to judge at a glance and need a "what was asked" strip.

### C. The Proctor (large)

You mostly watch. The AI sits the test live and you catch slips and cheats as they happen by tapping the wrong tap
before it submits. Highest risk: closest to watching with nothing to care about, strains "never faster than you while
learning", and tapping small moving marks on a phone is hard.

## 4. Recommendation

**B, built in two slices, with A as the first slice.** A fixes the framing, the arc and the missing payoff cheaply,
and every piece of it is kept by B. B then replaces the weakest part, the waiting, with a real second verb.

- **Slice 1 (A):** a sitting with a clock, a paper and a rival target; taught meters per kind; the score counts only
  kinds handed over; a results reveal with the funding round on it; the loophole choice; the AI's lines through the orb.
- **Left out of slice 1:** the marking pile, new kinds, the tree's shape, the agent's job, sounds and mail.
- **Slice 2:** the exam pile, then the agent, then the tree.

## 5. Decisions for the owner

1. What ends a run? A clock (recommended) / three lives, as now / a fixed paper with no clock.
2. What counts on the score sheet? Only kinds handed over (recommended) / everything it has learned, as now.
3. How do you check its work? A pile you pass or send back (recommended, slice 2) / it fills in live and you press
   Verify, as now / watch it live and tap its mistakes.
4. A caught loophole: you choose let it stand or close it, and only that moves your path (recommended) / as now.
5. A mistake you let through costs: points off this sitting's score (recommended) / seconds / a life, as now.
6. Marks and the seven upgrades: keep, regrouped and renamed, plus one or two (recommended) / freeze / a new tree.
7. An agent in Evals: marks the easy ones, leaves loopholes to you (recommended) / checks everything, less accurately /
   wait until slice 2 is played.
8. The AI's voice in Evals: through the orb, one line an item at most (recommended) / only on the cards.

## 6. Open risks

- **Time to the first funding round is unmeasured.** By arithmetic from the sheet's formula, three taught kinds give
  about 27 points, enough for the first two rivals (12 and 20) after roughly 20 to 30 solves. Not played.
- **The demo cannot reach all eight rivals.** Four bosses open four of the five ladder steps (11 of 14 kinds); the score
  is a mean over all 14, so it tops out near 70: about six rounds.
- **Counting only handed-over kinds changes that pace** and needs a quick model before building.
- **Loopholes start only after 40 solo answers of a kind** (`ownSolves`), so they may never appear in an hour's demo
  without retuning.
- **Marking at a glance** for the grid, ball-drop and what-changed kinds needs a phone mock-up before committing to B.
- **`ring.md` still says "Evals: keep, as it is; Marks frozen".** A redesign overrides those lines; that needs the
  owner's say.
