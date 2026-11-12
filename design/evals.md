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
- **"Run", not "shift".**
- An earlier pick, **slow pressure**, was made for the first draft. Here it becomes the AI creeping up on you; the
  solving itself is hands-on and quick. To confirm with the owner.

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
Every question is written fresh: none of that game's questions, names or look. What's new: your opponent is learning
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
4. The trick-question era: how many, how they're written, how they repeat.
5. Its own currency and tree, and what the first upgrade is.
6. What useful work pays, exactly (story.md, open 10).
7. When it opens, against the other two timelines.
8. Pace: confirm slow pressure still holds, or name the new one.
