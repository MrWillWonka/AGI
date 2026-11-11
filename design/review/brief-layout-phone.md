# Brief: layout on phones (round 11, layout only)

The owner asked for a round on **layout alone**: how Packet Snare's screens fit and read on phones and desktops, upright
and sideways. Not pacing, difficulty, mechanics or wording, unless the wording's length breaks the layout. The owner's
direction (2026-11-11): **save space on phones** and **don't worry about the desktop HUD's size**.

**Your screens:** phone upright 360 × 640 and 390 × 727, phone sideways 640 × 360 and 844 × 390, all touch
(`isMobile: true, hasTouch: true` in a Playwright context; the kit's `launch({ phone: true })` is 390 × 727 only, so make
your own contexts for the others).

**Start from the layout report** (`tools/review/layout.js`): every moment at every size, screenshotted, with measured
problems (scroll, offscreen, covered, overlap, clipped, small targets under 32 px, text under 11 px, cards that hide their
button or need scrolling, and the field's share of the screen) and a comparison with the base build. Open its PNGs for
your sizes. Treat its counts as leads, not verdicts: "small" counts every control under 32 px, many fine; judge which
matter to a thumb.

**Then play on the frozen build** for what a screenshot can't show: the tutorial's zoom out, a run's HUD while you play
(does your thumb cover what you need?), turning the phone mid-run (resize the viewport between upright and sideways),
the boss fight's bar and the stun ring, the end card's lines, the tree's pan and its docked popup, Look out cards with
two demos (sector 3, sector 5's boss). Canvas labels (pops, the UPDATING label, the walkthrough prompt) can only be
judged by eye.

**For each screen size** say what takes space that the player doesn't need there, and what needs space it doesn't get.
Prefer fixes that save space on phones (the owner's call), and say for each fix whether it would also change the other
phone shapes or desktop.
