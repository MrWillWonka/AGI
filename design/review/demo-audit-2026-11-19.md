# Demo audit, 2026-11-19

The Path to AGI as a playable demo: the plain playtest link (Playtest 1, save v47), branch `claude/ring-build-1` at
e8bfe17. Corrected 2026-11-20 (see the next section); five small fixes followed. Page with screenshots: `review-out/demo-audit/index.html`.

## Correction, 2026-11-20

The first version of this audit counted things a regular player would not meet, and leaned on a log the owner says
was a mistake. Each finding was traced again in the code. A finding now stands only if a player on the plain link
could reach it.

| Finding in the first version | Evidence it had | Verdict |
|---|---|---|
| The stockpile-full "Show me" lands on a home screen with no Feed icon | A screenshot, which shows a different line (the sector pick) | **Withdrawn.** The Feed's icon and that line are set by the same flag (`game.js` `feedFromRun`, `engine.js` `feedOpen`); the state came from my debug jumps |
| "What next" names The Feed before it exists | Reviewer's report | **Withdrawn.** The code names The Feed only when it is open with a stockpile waiting |
| "Show me" leads nowhere (the owner's own note) | The owner's note | **Real, found in code, fixed.** A second "Show me" (after "Last tip", or a replayed line) went home and said nothing, because the pointing line is said once per save |
| "What next" names Parcel before Parcel is on the screen | Screenshot at 59 compute | **Real, fixed.** Under 100 compute the line said "and Parcel will buy it" |
| The stockpile line never names The Feed | Code | **Real, fixed** |
| The Journal's milestone reads the old game's recipe | Code | **Real, fixed** (Packet Snare and Training) |
| "Loops closed 0" on a bubble run | Screenshot | **Real, fixed** (reads "Catches") |
| An unanswered bubble held the AI's queue for five minutes | A reviewer agent that left a bubble up | **Testing artifact.** Lines wait until tapped, by design; a person taps them |
| Packet Snare opened with a live field and no start card | Screenshot | **By design.** The card waits for the AI's two lines about the stream; the shot caught the wait |
| "No packets captured" over "+40 Signal", "Goal 0/40" | A run ended by a debug command | **Testing artifact** |
| "+39 Signal" beside "Goal 38/40" | Reviewer | **Real, small.** Signal is rounded per catch, the goal once (`engine.js` `snareCatch`). Not changed: it touches pay |
| "No packets captured" with "+1 Signal" | A scripted run | **Unproven.** Every paying catch pays at least 1; I could not tie it to regular play |
| Two Upgrades buttons, the run price rising unexplained | Screenshots | **Real** (stand as quick fixes) |
| The Lab is one button for half an hour; 63% of the time in the Lab | The owner's log, and an agent holding the button 75 s | **Withdrawn.** The log was a mistake, and an agent grinding is not a player's pace |
| Pacing misses the 65-minute line | The owner's log, two agents, the pacing bot | **Unmeasured.** No human run at an intended pace exists yet |
| The Feed clears with a blind zig-zag | A scripted sweep | **Unproven** |
| Phone Packet Snare is 894 px on an 844 px screen, small targets | An emulated phone | **Unproven** until seen on the owner's phone |
| No ending; the old card shows at General AI | Debug jump, and the code | **Stands** as known unbuilt work (Build 4), not a discovery |
| Research has no use before Training | Code and the AI's own line | **Stands** as a design note; how long that lasts is unmeasured |
| Achievements and stats name systems not in the demo; "Garage · later"; "tap" on a desktop | Screens and code | **Stands** (copy, the owner's to decide) |

Fixed in the game on 2026-11-20 (tests 726 of 728 pass, 2 skipped; checked in a browser): the Journal's two ring
milestones, the stockpile line, the early "What next", the second "Show me", and the "Loops closed" row. Both changed
lines are placeholders for the owner to approve: "…I have put The Feed on your home screen." and "The Lab, I think.
Each tap is a little more compute."

## Score: 6.5 out of 10 (corrected from 6.0)

Between decent and good. The opening, the AI's voice and the first Packet Snare run are good; nothing is broken.

- **Range: 6 to 7.** The AI's guidance moves from 5 to about 6.5 now that most of its breaks were artifacts or are
  fixed. Lab and pacing scores below are not trusted (see the correction) and are left as first written.
- **What still holds it under 7:** the demo has no ending yet (Build 4), and nobody has measured a real run against
  the finish line (`design/ring.md`: a stranger, alone, on a phone, from the spam to an ending in about 65 minutes).

Why not 5: nothing is broken. No console errors anywhere, saves hold through reloads, and the look and the writing
are a clear step above the genre's average.

### By place and category

| Place | Gameplay | Clarity | Pacing | Design | Visuals | Tutorials | Engagement | Avg | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| Opening: mail, home, the AI | 6.5 | 7 | 7.5 | 7.5 | 7.5 | 6.5 | 7.5 | **7.1** | High |
| Lab and Parcel | 4.5 | 5.5 | 4.5 | 5 | 6.5 | 5.5 | 4.5 | **5.1** | High |
| Packet Snare | 6.5 | 6 | 5.5 | 6.5 | 7.5 | 6.5 | 6.5 | **6.4** | Medium (bot-played) |
| The Feed | 5.5 | 5 | 6 | 6 | 7 | 5.5 | 6 | **5.9** | Medium |
| Training | 7 | 6.5 | 5.5 | 7 | 7 | 6.5 | 7 | **6.6** | Low (debug jumps) |
| Evals | 6 | 5 | 4.5 | 6 | 6 | 5 | 6 | **5.5** | Low (debug jumps) |
| **Average** | 6.0 | 5.8 | 5.6 | 6.3 | 6.9 | 5.9 | 6.3 | **6.1** | |

Packet Snare is in line with its own review rounds (round 10: early 5 to 7.5, late 5.5 to 7).

### The demo as a whole

| Category | Score | Note |
|---|---|---|
| Stability and saves | 9 | No errors, no lost progress, reload in about 2.5 s |
| Story and copy | 6.5 | Opening 7.5 to 8; later lines are placeholders and old-game copy leaks in |
| First five minutes | 6.5 | Strong hook; the offer mail's reply button is below the fold |
| Ring cohesion (places pay each other) | 6 | Hand-offs are clear when they fire; Research has no use for the first 30 min |
| Phone fit | 5.5 | Foot controls are good; Packet Snare overflows the screen and its tree is too small |
| The AI's guidance | 5 | Four separate breaks (below) |
| Ending and completeness | 3 | The four endings are not built; the card shown is the old game's |

### Three reviewers

| | Overall | Highest | Lowest |
|---|---|---|---|
| Me (full lap by script, late checks by debug jumps) | 6 | Opening 7.1, stability 9 | Ending 3, Lab 5.1 |
| Phone, first time (390 x 844 touch, 34 min) | 6 | Stability 9, writing 8, mail 8 | Lab 4, Journal 4, clarity 4.5 |
| Desktop, first time (1280 x 800, 32 min) | 6 | Stability 8.5, mail 7.5, look 7.5, writing 7.5 | Lab 4.5, clarity 5.5, desktop interface 5.5 |

## When things happen (minutes)

Not a measure of pace. The owner's Playtest 1 log is removed (the Lab time in it was a mistake). What is left are two
agents and a script, none of which plays like a person.

| Beat | Phone reviewer (agent) | Desktop reviewer (agent) | Scripted lap |
|---|---|---|---|
| Lab opens | 3.1 | | 1 |
| Parcel | 4.6 | | 3 |
| Packet Snare | 8.2 | | 5 |
| Sector 1 cleared | 16 | 22 | 8.6 |
| The Feed | 22.1 | 23 | 10 |
| Training | not reached in 34 | not reached in 32 | debug |

Target: an ending at about 65 minutes (45 to 75). Whether the demo meets it is unmeasured.

The pacing bot (phone field, three seeds, 60 minutes): sector 1 took 8 runs, sector 2 took 23, sector 3's boss 2,
sector 4 took 25. The bot catches about half what the owner does per catch, so these are a floor on skill, not a
verdict. Numbers only: nothing was tuned.

## What is good (keep)

- The brother's mail and the junk mail around it: funny, short, and it sets the family up.
- The AI's voice. Both reviewers quoted its lines back.
- The monitor fixing the cracked screen: the best payoff in the first ten minutes.
- Parcel's one-tap buying, and the first Packet Snare run ending just short of its goal.
- The boss's demo before the fight, and the message scraps in The Feed.
- Training once you are there: the strongest single place.
- Saves: everything comes back after a reload.

## What costs the most (corrected)

1. **No ending.** Known and planned (Build 4). At General AI the old card shows ("End of the demo · Contained").
2. **Pacing is unmeasured.** There is no human run at an intended pace to hold against the 65-minute line.
3. **Packet Snare's result card.** Signal and the goal can differ by one ("+39" beside "38/40"); two Upgrades buttons
   show at once; a run's price rises (100, 130, 150, 203) with nothing said.
4. **Research has no use until Training.** A design note; how long a player waits is unmeasured.
5. **Old-game copy.** Achievements and stats name systems that are not in the demo; Parcel's "Garage · later" tabs;
   "tap" on a desktop.
6. **To check on a real phone:** Packet Snare's page height and the tree's small targets (seen only in emulation).

Withdrawn or fixed: the AI's four guidance breaks, the Lab as "one button for half an hour", and the Journal's
milestone. See the correction at the top.


## Recommendations, ranked by points gained for the effort

Gains are my estimates of the overall score. Each names what it lifts.

### Quick fixes (hours each)

| # | Fix | Lifts | Gain |
|---|---|---|---|
| Q1 | Done 2026-11-20: "What next" no longer names Parcel before it is on the screen (The Feed was never named early) | Clarity, tutorials | done |
| Q2 | Done 2026-11-20: a second "Show me" says its line again; the stockpile line names The Feed. The "no Feed icon" case is withdrawn | Tutorials, ring cohesion | done |
| Q3 | Withdrawn: lines wait until tapped, by design. An owner's call if a line should ever time out | Tutorials | |
| Q4 | Withdrawn: the start card waits for the AI's two lines, by design | | |
| Q5 | Result card: one headline from the same number as the haul; Goal and Signal agree; no Loops row before loops; one Upgrades button; say why a run ended and that the price rose | Clarity | 0.07 |
| Q6 | Phone Packet Snare: fit 844 px with no page scroll; tree controls at least 44 px; no node off the edge | Phone fit | 0.05 |
| Q7 | Offer mail: the reply button in view without scrolling (desktop and phone) | First five minutes | 0.03 |
| Q8 | Old copy (the Journal milestone done 2026-11-20): achievements and stats for systems not in the demo, "Garage · later" tabs, the window title, "tap" on a desktop, the build string | Story and copy | 0.03 |
| Q9 | The AI's bubble and notices stay off what they point at (Parcel's fourth item, the Snare field, the result card, Mail icon, the Lab title, BANK) | Visuals, clarity | 0.03 |
| Q10 | Mom's thread: her mail before or with her money; the second $100 gets a line | Story | 0.02 |
| Q11 | The Feed: one line each for garbled sand and "Split 36%"; no empty tank as "Carry on"; the card pick with time left; Start session clear of the foot strip at 800 px | Clarity | 0.03 |
| Q12 | Later screens: the dock off the agent roster's buttons, the Research card's cut text, Training's install bar over its label, Evals' lock icon explained | Clarity, visuals | 0.02 |
| Q13 | "Last tip" survives a reload ("Show me" again: done 2026-11-20); the home AI log shows recent lines | Tutorials | 0.02 |

### Build-sized work

| # | Work | Lifts | Gain |
|---|---|---|---|
| B1 | Build 4: the story mail and the four endings, replacing the old card | Ending 3 to 7, engagement, story | 0.6 |
| B2 | Measure pacing first: one human run at an intended pace against the owner's targets (below); tune only after | Pacing, engagement | 0.4 |
| B3 | The Lab: the layout pass (the owner's note). "A second decision" rested on the withdrawn Lab evidence | Gameplay, engagement | 0.3 |
| B4 | The Feed asks more of the player in its first sessions | Gameplay | 0.2 |
| B5 | Research gets a use or a stated goal before Training opens | Design, ring cohesion | 0.15 |
| B6 | Desktop layout: the Lab's 560 px column, the empty home screen, the taskbar's label | Visuals | 0.15 |
| B7 | Evals' first screen: more than one course open, or a reason for the locks | Clarity | 0.1 |
| B8 | Build 5: a stranger on a phone, start to an ending | Confidence in all of the above | |

From 6.5: B1 and a measured, tuned pace reach about 7.5. B3 and B4 on top reach about 8.

### The owner's calls

1. What ends the demo until Build 4 is built: an honest "end of this playtest" card, the old card, or nothing.
2. Pacing targets for the ring (for example The Feed by 12 minutes, Training by 25, Evals by 45, an ending by 65),
   before any numbers are proposed.
3. Which batch goes first.
4. Whether desktop is a first-class target for the demo or phone only.
5. Story copy for Build 4 (the owner's to write or approve).

### Against settled calls (not counted in the top issues)

- Both reviewers asked for names on Packet Snare's tree nodes. Settled: no node names in the tree.

## The owner's own playtest notes, checked

Found in code and fixed on 2026-11-20: "show me" leading nowhere (a second press said nothing). Already fixed on
2026-11-19: "Spend it in Training" sending you to the Lab. Seen by the reviewers too: mail needing a scroll, the Lab's
layout. Not confirmed (the reviewers' cases were artifacts of how they played): tutorials arriving late, messages out
of order. Not checkable here: the music crackle (no audio in the audit) and the bubble's speed by feel.

## Limits

- No audio was heard.
- Phone feel and fun are estimates from a touch-emulated browser, not a hand.
- My lap was scripted, so its times are a floor, not a pace.
- The first version took debug jumps, scripted play and agent behaviour as findings; see the correction at the top.
- The owner's Playtest 1 log is not used as evidence of time spent.
- Reviewers played Packet Snare and The Feed partly by script and reached sector 2 only; Training, the boss, Evals,
  the funding round and the agents were checked by debug jumps.
- Items marked as a reviewer's observation were not reproduced by me.

## Method

`node --test` (727 tests); a scripted full lap on desktop from a fresh save; late spot checks by debug jumps on desktop
and phone; every app on the playground link checked for scroll, off-screen controls, small text and small targets; the
pacing tool on the phone field; the owner's two inbox logs; two independent first-time reviewers with no code or docs.
Rubric: `design/review-rubric.md` and `anchors.md`.
