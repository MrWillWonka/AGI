# The Path to AGI

A browser incremental game: build an AI lab from a desk and a spam email, train a model over a trail of hills, and
grow it from a narrow AI into General AI. Vanilla JavaScript, no build step, no dependencies.

- **The lab:** generate compute, collect data and research by hand, then earn the machines that do it for you
  (hardware, the Data crawler, the Research Assistant, the Procurement Bot), each run as a scheduled task with its
  own share of compute.
- **The Training Path:** hold to charge a training sprint, release in the meter's zone for a clean prompt, and drive
  the model as far as it will go over rolling hills. Cresting each skill hill teaches a skill. Legs have characters
  (Sprint, Long flats, Marathon, Cliffs), walls pay big, and **exploits** break the rules: hold Hop to set a
  breakpoint and let go on a hill's lip.
- **The skill tree:** spend training XP on four branches (Power, Precision, Recursion, Momentum).
- **The story** arrives by email, and the sender isn't who it seems. Dilemmas trade risk for reward.
- **Versions:** ship the next version for Insight and legacy upgrades; challenges and Transcend come later.

The current demo ends at General AI, with act two (Terminal Velocity) locked.

## Play

```bash
python3 server.py      # http://localhost:8000 (add --no-browser in headless environments)
```

Any static host works. The game is also played as a claude.ai artifact.

## Develop

```bash
node --test                                   # engine and physics tests
node tools/sim.js . 42 --quiet                # the balance sim, playing like the pooled real player
node tools/playtest-calibrate.js playtests/*.txt
```

Open the debug panel with the terminal icon beside Journal, `#debug`, or the backtick key.

| Path | What's there |
|---|---|
| `engine.js`, `training-path.js` | Game rules and the trail's physics (no DOM, tested in Node) |
| `game.js`, `sfx.js`, `index.html`, `styles.css` | The UI, the synthesised sound and music, the shell and styles |
| `playtest.js`, `playtests/` | The playtest recorder and real players' logs (read each against its build) |
| `tools/` | The balance sim and the log calibrator |
| `design/` | Design notes (exploits, leg characters, act two, the second minigame) |
| `review/` | The latest design-review round's reports (older rounds are in git history) |
| `tests/` | `node:test` suites |

See `CLAUDE.md` for the architecture and every rule behind the numbers.
