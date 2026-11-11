# Brief: layout on desktops and tablets (round 11, layout only)

The owner asked for a round on **layout alone**: how Packet Snare's screens fit and read on phones and desktops, upright
and sideways. Not pacing, difficulty, mechanics or wording, unless the wording's length breaks the layout. The owner's
direction (2026-11-11): **save space on phones** and **don't worry about the desktop HUD's size** (it was called small and
far from the field at 1920 and 4K; leave that, and don't spend top issues on it).

**Your screens:** desktop 1280 × 800 and 1920 × 1080 (a mouse: `launch()` in the kit), tablet upright 768 × 1024 and
sideways 1024 × 768 (touch: `isMobile: true, hasTouch: true` in your own Playwright context). Also try a narrow desktop
window (900 × 700) and a short one (1280 × 600), where layouts usually break.

**Start from the layout report** (`tools/review/layout.js`): every moment at every size, screenshotted, with measured
problems (scroll, offscreen, covered, overlap, clipped, small targets under 32 px on touch, text under 11 px, cards that
hide their button or need scrolling, and the field's share of the screen) and a comparison with the base build. Open its
PNGs for your sizes. Treat its counts as leads, not verdicts.

**Then play on the frozen build** for what a screenshot can't show: the field's size and aspect against the window (wasted
margins, letterboxing), where the eye has to travel between the field, the bay's bar and cards, the tree's framing and its
popup docked to the right, the boss fight's bar, Look out cards with two demos (sector 3, sector 5's boss), the end
card's lines, and a window resized mid-run. Canvas labels (pops, the walkthrough prompt) can only be judged by eye.

**For each screen size** say what wastes space and what's cramped, with a concrete fix, and whether the fix would also
change the phone layouts (the owner wants phones to save space; a desktop fix mustn't cost them room).
