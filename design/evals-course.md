# Evals: the obstacle course (the owner's design, 2026-11-15)

**This replaces the captcha Evals and `design/evals-redesign.md`** (the owner: "Scratch what we have"). The idea is the
owner's husband's. What is written under "The owner's calls" is decided; everything under "Proposed" is mine and open.

## The owner's calls

- **You build an obstacle course for the AI.** You start by building a level from the obstacles you are given, and
  **test it yourself** to show it can be done. Then you **give it to the AI to attempt**.
- **Score:** higher for every obstacle cleared, and for a fast clear. **A failed level scores nothing.** So the goal is
  fast clears with as many obstacles as possible: a course the AI can only just complete.
- **Skills give more obstacle types and abilities** to use in the course.
- **The AI's attempt uses both** what it has trained and how you ran the course, and **over time it gets better and
  better and starts beating you**, with better timing, skill and reactions. **You can watch it iterate on its runs.**
- **Three kinds of course, as progressively harder phases:** a side-on track (Training's physics), then a top-down grid
  maze, then platformer rooms.
- **The trick questions** from the captcha Evals may stay as another phase.
- **A cleared course pays its own currency, spent on a tree.** This is where the player can lean into upgrade trees,
  exploits, or catching the AI cheating.

## Proposed (open, for the owner)

- **The loop of one course.** Build (place obstacles on a short course, within a budget) → Test (you run it; it must
  be cleared once before it can be handed over, and your time is the par) → Hand over (the AI runs it, a few attempts
  shown one after another, each a little better than the last) → Score (obstacles cleared × a speed bonus if it
  finishes; nothing if it never does).
- **The tension.** Every obstacle you add is worth more and risks the whole score. The AI's ability is something you
  have to read: it grows with Training and with each course it has run.
- **The AI iterating.** Attempt 1 copies your test run badly; each later attempt keeps what worked and fixes the place
  it failed. Early on it needs several tries and stays slower than you; later it clears first try and under your par.
  The owner's earlier rule "it is never faster than you while it learns" would hold for the early phase only.
- **Cheating.** On some attempts it skips an obstacle (Training's Hop already exists) or clips a corner. Caught on the
  replay, you choose: let the score stand, or strike it and patch the course. That choice, not your attention, is what
  the story reads.
- **Phase 1 first: the side-on track.** It reuses `training-path.js` (trail geometry and the fixed-step ball
  simulation, already tested). Obstacles for a first cut: a hill, a gap, a wall to jump. Phases 2 and 3 and the trick
  questions are designed after phase 1 has been played.
- **What a phase is.** To be decided: a phase opens with a Packet Snare boss (as captcha steps did), or with the tree.

## What this changes elsewhere (open)

- **Funding rounds** were built today on the captcha score sheet (a rival passed is room for hardware). With a
  currency and a tree instead of a score sheet, funding rounds need a new source, or the rivals move to course scores.
- **The Evals agent job** ("checks handed-over kinds for you") needs rewriting for courses.
- **`design/ring.md`** still describes Evals as captchas.
- **The captcha Evals is still in the game** as the Evals app until the course is playable; whether it is hidden
  meanwhile is not decided. Nothing has been deleted.
