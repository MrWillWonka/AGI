# Evals: build plan for the first playable version

Written 2026-11-11. The design is `design/evals.md`; the story it serves is `design/story.md`. The owner's scope for
this version: **every captcha family, thin, with the ghost hand and being overtaken**, so the whole arc can be felt
before any family is deepened. Nothing here is started. Work begins only on the owner's go-ahead, stage by stage, with
a report after each stage and no publish until the owner says so (the working rules in `design/review/handoff.md`).

## What "done" is for this version

On a phone, from a debug button, a player can:

1. Start a run and solve a streak of captchas drawn from all seven families plus a few trick questions.
2. Watch a ghost hand attempt each one beside them, badly at first and better with every solve it watches.
3. See it finish one kind before them, reliably, and take that kind over: the kind leaves their runs.
4. Lose their last life, see a result card, and start again with what the AI learned kept.

## Out of this version (designed later, each needs the owner's calls first)

- The AI's cheats, the last stand, and marks that move the story.
- Its currency, tree and upgrades.
- When the bay opens in the real game, its mail, its look out cards and its place on the facility map.
- Captcha walls in Packet Snare, the Training skills gating which kinds it can learn, and what a taken-over kind pays
  the lab. (This version has stand-ins: every kind learnable, a takeover pays nothing.)
- The 30 ordered trick questions and the shuffled pool (this version has about six, to prove the format).
- Its own sounds and music; a pacing bot and review tooling beyond a smoke test.

## How it fits the code

Follow Packet Snare's split (`CLAUDE.md` → Layout; `design/second-minigame.md` section 4):

| Piece | Where | Notes |
|---|---|---|
| Rules | new `evals.js` | Pure, like `packet-snare.js`: UMD, no DOM, no clock, a seeded generator. Makes captchas, judges answers, runs lives and the streak, and holds the learner. Tested in Node. |
| Economy and save | `engine.js` | `state.evals` (what the AI has learned per kind, kinds taken over, records, runs). `SAVE_VERSION` 33 → 34, `migrate()` extended, a test. A run is processed once. |
| Screen | `game.js`, `index.html`, `styles.css` | A third bay panel beside the Training Cluster and the Data Pipeline. Captchas are built from page elements (buttons, grids, text), not drawn on a canvas: they are forms by nature, and emoji render best as text. The ghost hand is an overlay on top. |
| Debug | `debug-panel.js` via `AGI.debug` | Open Evals (on any save), Reset Evals, set what the AI has learned for a kind, jump to a family. `#evals` in the address opens straight into it, as `#snare` does. |
| Log | `playtest.js` hooks | An `evals` event per run: kinds met, solved, missed, seconds each, the ghost's score per kind, takeovers. |
| Tests | `tests/evals*.test.js` | Below. |

## The learner (the heart of it)

- **Per kind, one number from 0 to 1:** how well it has learned that kind. Each solve it watches adds to it; a clean,
  quick solve adds more (the owner's call: both how many and how well).
- **The ghost's attempt is your own play, played back.** The rules module records a short trace of each of your solves
  (where you started, the order you tapped, your timing, what you got wrong), a bounded handful per kind. The ghost's
  attempt on a new captcha of that kind is built from those traces, with error that shrinks as its number rises. So it
  shows your habits and your mistakes without any separate system for them.
- **Overtaking:** when its attempts on a kind are right and faster than yours for a set number in a row, it takes the
  kind over. First numbers are guesses to tune on the owner's first log.
- **Determinism:** seeded, so tests and playtest logs can replay a run.

## The first variants (one or two per family)

| Family | Variants in this version |
|---|---|
| Read | A twisted word with a letter tray; the same, struck through |
| Answer | A sum; a sum in words |
| Pick | Every square with a named emoji scene, 3 by 3; squares that refill |
| Handle | Slide the piece into the gap; tap in the shown order |
| Listen | A beep pattern, shown as pulses and played, tapped back |
| Invisible | The tick box, passed by being humanly imperfect |
| Future | Where does the ball land; what changed |
| Trick questions | About six, written fresh, in a fixed order |

## Stages

**Status (2026-11-11):** the owner gave the go-ahead; work is on the branch `claude/evals-first-cut`. **Stage 1 is
built**: `evals.js` (the run, three lives, the Pick family with emoji scenes, "without" and a 4 by 4 grid as it
climbs), `tests/evals.test.js`, and `evals-ui.js`, a full-screen dialog opened from the debug panel's Evals section or
with `#evals` in the address. It keeps nothing in the save yet (the best run is per device). Checked in a browser at
phone size upright and sideways.

**Stage 2 is built** (2026-11-11): the learner and the ghost hand.

- **Kinds.** Pick is three kinds the AI learns apart: plain picture grids, grids with scenes, and "every square
  without" grids. A kind it has taken over gives way to the next it hasn't; with none left a run can't start
  ("Verified automatically").
- **The learner** (`evals.js`): per kind, how well it has learned (0 to 1), how many solves it watched, how many of
  those you got wrong, and your last six solves as traces. A clean quick solve teaches 1.3 of 8, a slow one 0.6, a
  wrong one 0.25. A steady clean player lost a kind after about 8 watched solves, 2 to 4 runs (now 40: below).
- **Its attempt** is decided when the captcha shows: knowing nothing it guesses each square, in no order, at 2.4 times
  your pace; learned, it taps in your order at 0.55 of your pace, and slips on one square as often as you get one of
  these wrong. (Retuned after the owner's first play: below.)
- **Taking over:** right and done before you (or right when you were wrong) often enough (three times running at
  first; a score of 8 since the retune).
- **On screen** (`evals-ui.js`): a second cursor that wanders less as it learns, a ring in the corner of each square
  it taps, and a line for it above the grid ("It got it right first, in 1.8 s."). With reduced motion there is no
  cursor, only the rings and the line. A takeover shows a card and the run goes on.
- **Saved:** `state.evals` (save v34: runs, best, what it learned). A new version starts it again, like the rest of a
  version's play; that is the default, not a decision (story.md, open 9).
- **Debug:** Teach it (+25% every kind), Reset Evals.
- **Tests:** `tests/evals-learner.test.js`, `tests/evals-save.test.js`.

**To watch in the owner's first play:** whether seeing its rings gives the answer away once it is good (they show
which squares it tapped while you are still solving); whether three times running is the right bar; whether its speed
at the end feels like being overtaken or like a cheat. **Stop here for the owner's review before stage 3.**

**After the owner's first play (2026-11-11).** Their words: the rings didn't matter (it was too fast to use them) and
they couldn't tell it was right; taking over was "WAY too quick, it should feel bad for a good while and it should
still make mistakes every now and then. Much more time copying and mimicking the player and their quirks"; and the
speed "definitely felt overtaken but it went very fast from oh it's faster to AHH it's so fast I can't keep up". Their
picks: **about 40 solves to lose a kind**, and **the same top speed, reached slowly**. Built:

- **Three phases** by how much it has learned (`PHASES` in `evals.js`): bad to 0.3 (2.4 down to 1.5 times your pace,
  nearly always wrong); mimicking you to about 0.7 (around your pace, wrong more often than right); then ahead, its pace
  passing yours at about 0.68 and climbing steadily to 0.55 over the last third.
- **40 clean solves to learn a kind fully** (8 before), ten traces kept (six).
- **Never perfect:** it slips on a square one captcha in ten however much it has learned, with your own mistakes on top.
- **More of you:** each pause it makes is one you really made (your rhythm, not the middle of it), and it copies your
  habit of tapping a square and taking it back (its ring appears on a wrong square and goes again).
- **Taking over is a score, not a streak:** +1 each time it is right and first, -1 each time it isn't, a kind is its
  at 8. Measured with a steady clean player: 32 to 43 watched solves a kind, 5 to 20 runs depending on how far a run
  gets.
- **Its tag reads AI ✓ or AI ✕** when it answers, and its line says "Right, in 2.1 s." or "Wrong, in 4.0 s."

Each ends with something the owner can play or read, and a short report.

1. **Skeleton.** `evals.js` with a run (lives, streak, a queue of captchas), one family (Pick), the judge, and tests.
   The bay panel, opened from debug only. No ghost yet. *Check: a run can be played start to end on a phone.*
2. **The ghost hand.** The learner, trace recording, the ghost's playback overlay, overtaking and takeover, saved in
   `state.evals` (save v34). *Check: the owner watches it go from flailing to finishing first on Pick. This is the
   stage that says whether the idea works; stop and review here before building breadth.*
3. **Breadth.** The other six families' first variants, each a small module inside `evals.js` with the same four
   parts: make, show, judge, and what the ghost does with it. Order: Handle, Read, Answer, Future, Listen, Invisible
   (the movement-judged one last, since it leans hardest on the trace).
4. **Trick questions.** The format (a fixed order, restart the stretch on a miss) and about six written ones.
5. **The run around it.** A start card, a result card in the game's card language, the difficulty ramp across
   families, the playtest log event, debug tools, `#evals`.
6. **Review pass.** A smoke test in the review kit (a bot that solves each family), screenshots on phone, sideways and
   desktop, reduced motion, no page scroll, no console errors. Then the owner's first playtest log.

## Tests

- Every generated captcha has exactly the answers the judge accepts, for many seeds, per variant.
- A solver bot passes every variant; a random tapper fails them.
- The learner: its number only rises with watched solves, clean solves raise it more, and its error shrinks as it
  rises.
- Overtaking happens after enough clean solves and not before; a taken-over kind no longer appears in a run.
- The tick box fails a perfectly straight, instant trace and passes a wobbly one.
- Each trick question has a reachable answer.
- Save: a v33 save migrates to v34 with an empty `evals`; junk in `evals` is sanitised.
- A run is paid and recorded once, whatever is called twice.

## Risks to watch

- **Emoji differ by device** (and a few are missing on older phones). Pick scenes must stay unambiguous on the owner's
  iPhone and on Windows; keep to a checked list.
- **The ghost over page elements.** Its cursor must land on the right buttons at every screen size and when the phone
  turns. Positions are stored as shares of the captcha's box, never pixels.
- **Fair captchas.** A picture grid with an arguable square is the classic complaint. Generated scenes must have no
  borderline cases unless a trick question is making the joke on purpose.
- **Access.** Nothing may need hearing or colour alone; targets at least 44 px; reduced motion respected.
- **Size.** Seven engines is about the size of the first Packet Snare build. Stage 2's review is the cheap place to
  change course.
- **`game.js` is 13,500 lines.** Evals' screen code should live in its own file if that can be done without a build
  step, as `debug-panel.js` and `snare-demos.js` do.

## The owner's calls needed before starting

1. Go-ahead to build, and whether it goes on this branch or a new one.
2. Lives per run (the draft says a few; three is the obvious start).
3. Whether a takeover should pay the lab anything in this version, or wait for the loop planning. The game's rule
   that automation converts and never creates applies to whatever it pays.
