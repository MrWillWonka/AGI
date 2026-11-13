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

**After the owner's second play (2026-11-11).** Their words: "the AI didn't seem to copy me or improve during the
runs". Their save showed why: one run of 42 solves, nearly all on 4 by 4 grids. The AI guessed each square alone, so
on sixteen squares it looked random until it had almost finished learning; nothing it did looked like the player; it
was improving, but only "wrong" or "right" showed; and 8 s on a 4 by 4 scene counted as a slow solve, so it learned
less from each. Built:

- **It copies before it understands.** For each square it either knows the answer (more often as it learns) or does
  what you did on your last one of that kind: the same places on the grid, in your order, stretched if the grid is a
  different size. From your second solve it is recognisably you, and wrong because the pictures have moved.
- **How wrong it was shows.** Its line reads "Wrong by 5 squares, in 6.2 s." and the number falls as it learns
  (measured on a 3 by 3 grid: about 4 squares off knowing nothing, under 0.3 fully learned).
- **The end card says what it did over the run**, a line a kind it met six times or more: "The AI on picture grids
  with scenes: off by 4.7 squares at first, 1.3 by the end."
- **A brisk solve allows for the grid:** 2 s, plus 0.2 s a square to look over and 0.5 s a right square to tap.
- `learnSolves` 46, so a steady clean player still keeps a kind 34 to 41 watched solves.

**After the owner's third play (2026-11-11).** "I think I saw it, we can continue to make it better", and their call on
what next: no text and no flash for the copying, but **more of the player's movement**: "the player hovers for a
while or clicks and unclicks etc. if the player moves their mouse a certain way I want the ghost to do those things
too"; then straight on to the six families without stopping. Built:

- **It copies how your pointer moves.** The screen samples your pointer over the captcha (at most 120 samples, kept on
  your last three solves of a kind). `shapes` in `evals.js` cuts each path into the stretches between your taps and
  keeps each as a shape: how far along the straight line and how far off to the side you were at each moment. The
  ghost's hand follows one of your shapes between each of its own taps, turned and scaled to fit, so your hovering,
  your detours and your overshoots come with it. On a touch screen there is no path between taps, so it goes straight.
- **Take-backs** were already copied (above); in a sum or a slot, changing your pick counts as one.

**Stage 3 is built** (2026-11-11): the other six families, thin.

- **Every captcha is taps on numbered targets**, in one of three modes: a set (the right ones, any order; `single`
  when there is one), an order (judged by what the targets say, so either of two tiles with the same letter will do)
  or the tick box. So one learner, one trace, one ghost hand and one screen serve every family; a family is a `make`
  in `evals.js` and a layout in `evals-ui.js`.
- **The kinds** (13): Read: a warped word, a struck-through word. Answer: a sum, a sum in words. Pick: a thing, a
  scene, "without". Handle: slide the piece into the slot it fits, tap pictures in a shown order. Listen: a beep
  pattern on three or four pads, lit as it plays and sounded. Invisible: the tick box. Future: where the ball lands on
  a board of arrows, and which square changed.
- **The tick box** is passed by being a person: 0.7 s or more before you tick, a pointer path at least 3% longer than
  the straight line (not judged on a touch screen, which has no path) and a tap at least 4% of the box off its dead
  centre. The reason shows when you fail ("Too quick to be a person."). The AI is too quick and too perfect until it
  has watched you and learned how; its line reads "It ticked it like a machine."
- **A run goes round the seven families in era order**, and each family gets harder with each of its own you solve.
  A family whose kinds the AI has all taken is passed over.
- **Its line names what it missed by** where that means something: squares, letters, pictures, beeps. For a captcha
  with one right answer it says only right or wrong, and the end card gives its share right at first and by the end.
- **Fixed on the way:** closing the screen and opening it again at once ended the new run (the dialog's close event
  arrived late).
- **Tests:** `tests/evals-families.test.js` (every family well formed over 120 seeds and 8 levels, each family's own
  rules, the tick box, the run's order, the learner on all 13 kinds, the pointer shapes).
- **Checked in a browser** at phone size upright (18 captchas through every family, no scrolling, every target 44 px
  or more, no errors) and sideways (the first nine, all in view).

**Not done, and worth knowing** (as of stage 3): the picture of the hand following a mouse path was tested as rules,
not watched on screen; nothing has been played on the owner's iPhone.

**Stages 4 and 5 are built** (2026-11-11): the trick questions and the run around it.

- **Seven trick questions** (`QUIZ` in `evals.js`), written fresh and about this page, this run and the AI beside
  you: how many letters are in the answer to this question; tap the word "human" (it is in the sentence, not on a
  button); do not tap any of these, press Verify (one of the buttons says Verify); tap Verify, Evals, AI and Human in
  alphabetical order; how many lives do you have left; tap the third word of this sentence; the AI is watching you,
  was its last answer right. Each has one answer that is fair once you see it (tested: no question has two).
- **A fixed order.** They are the eighth family in a run's round. Each right answer brings the next; a miss costs a
  life and sends the run back to the first, so learning the answers is the game. A question that can't be asked yet
  (the AI has no last answer) is passed over. "Question 3 of 7" shows over the prompt.
- **The page is part of the puzzle:** a prompt can hold a target in its own sentence (`{n}`), drawn as a word like any
  other until it is picked; two questions read the run itself (your lives, the AI's last result).
- **The AI learns them as one kind** (`trick.question`), like any other, and can take them over.
- **The playtest log** gets a line a run (`evals`): solved, missed, how it ended, takeovers, and per kind how many
  you met, how many you and the AI got right, your seconds, how far off it was and how much it had learned.
- **The beeps follow the game's sound volume** (Settings), and are silent when it is off.
- **Tests:** `tests/evals-trick.test.js`.
- **Checked in a browser:** all seven answered in order at phone size, the word in the sentence picked and marked,
  the log line written.

**Left for the full version** (the owner's plan): about 30 questions in order, then a shuffled pool of a hundred or
more; a trick question a round is slow going (seven take 56 captchas), so the stretch probably wants to come as a
block of its own once there are more. **Stage 6** (a smoke test in the review kit, screenshots, the owner's first
playtest log) is next, and then the owner's calls on everything stage 1 left out (design/evals.md, Open).

**Stage 6's smoke test is built** (2026-11-11): `node tools/review/evals.js [out dir]` plays Evals in a real browser
at phone, sideways and desktop size (three rounds of every family with real taps and mouse moves, then a lost run),
and one round on a phone with reduced motion. It checks: every captcha solved, every family met, each captcha in view
with no scrolling and every target 44 px or more, the pointer's path recorded and the ghost given shapes (mouse), no
hand with reduced motion, the run counted once, saved and logged, no console errors; a screenshot of each kind goes to
`review-out/evals`. All 28 checks pass. It found two things on a sideways phone, both fixed: the letter tiles were
42 px (now 44), and the AI's hand, which starts under the play area, could make the page scroll (clipped at the
captcha's edge). **Still to come:** the owner's first playtest log on their iPhone.

**The unlock ladder is built** (2026-11-12, the owner's calls; design/evals.md → The unlock ladder): a run starts
with warped words alone, which the AI learns four times as fast and takes at a score of 3, and each kind it takes over
opens the ladder's next step (`LADDER`, `openKinds`, `blockedMap`, `rotation`, `paceOf` in `evals.js`; the
`ladder` option, on by default). A takeover's result lists what it opened (`unlocked`, `run.unlocks`), its card says
"New to prove: …" and how many kinds are in, and so does the start card. The playtest log's `evals` line carries
`unlocks` and `ladder`. Debug: Evals → Unlock ladder (per device, `localStorage['agiEvalsLadder']`,
`AGI.debug.evalsLadder`). Nothing new in the save. Tests: `tests/evals-ladder.test.js`; the older tests run with the
ladder off; the smoke test plays the ladder on a phone to the first takeover. Several agents are a design on paper
only (design/evals.md → Agents).

**Handing over is built** (2026-11-12, the owner's calls; design/evals.md → Handing over): the AI never takes a kind.
Hand over and Take back are buttons on the captcha; a handed-over kind still comes up and the AI answers it alone in
your run, a wrong answer costing a life; each handover opens the ladder's next step; while it learns it is never
faster than you, and on its own it gets faster with the same mistakes. `handoff`, `ownSolves`, `ownPace`,
`handOver`, `takeBack`, `run.hand`, `run.takeBack`, `run.submitAuto` in `evals.js`; save v35 (`handed`, `own`).
Tests: `tests/evals-handoff.test.js`; the older tests and the ladder's run with `handoff: 0`. The smoke test hands
warped words over on a phone, watches the AI answer one, and takes them back.

**Reviewing is built** (2026-11-12, the owner's calls; design/evals.md → Reviewing): Stop on the AI's own captcha
makes that one yours to solve (`run.interrupt`, `stopped`, `caught`, `run.stops`, `run.catches`), it learns from your
fix, and Take back sits on a stopped captcha. Its finished answer waits a second before Verify (`REVIEW_MS`).
Loopholes are three ideas on paper (design/evals.md → Loopholes), waiting on the owner's pick.

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
