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

- **The loop is right** (the owner, after playing the first prototype, 2026-11-15): "the player gets to play and push
  themselves and then see how their AI does and early on is trying to pull back so the AI can keep up but then has to
  watch over time as the AI starts beating them and eventually is just trying to keep up."
- **Past your limit, in stages, as it masters courses** (the owner's cards, 2026-11-15). First it needs your full clear.
  Then it can take a course you only got part-way through: it copies you up to where you fell and works out the rest
  itself, shakier there. Finally it needs to be shown nothing. **You always make at least one honest try first.**
- **A course you could not clear is scored against the AI's own best on that course.**
- **What is left for you once it is better than you (all four picked):** design harder courses; catch it cheating; try
  to keep up (race its ghost on the same course for a bonus); and it builds courses for you now and then.

- **The track and the room are one kind** (2026-11-16: "the track and the platformer don't feel distinct"): the room
  is the side-on course, with the track's booster tile. The clean-landing burst and the one-thumb option are dropped.
- **Controls, every kind** (2026-11-16): on a phone **two thumbs at most**; on a desktop **W A S D, the spacebar and the
  mouse** (the owner first said the mouse alone, then: "mouse and keyboard is fine ... we can plan for WASD spacebar and
  mouse").
- **Every kind is built over time through components** (2026-11-16): what you can place is unlocked piece by piece, so
  a kind must have a deep enough box of parts to keep growing.
- **A third kind is still being chosen** ("maybe target range, but let's hear some more").
- **A fourth kind: the rhythm run** (the owner's idea, 2026-11-16): "a rhythm run beat saber rock band hybrid where the
  player builds music tracks using the sounds and music from the game and has to slash them as they rain down using
  the assets from the game like the packets, bosses and other things. And creating new tracks or having the AI try to
  create new tracks eventually would also be cool if we had rules around how it should be built that could be
  measured."

## The rhythm run: the owner's calls (twelve cards, 2026-11-16)

1. **The music, with more freedom unlocking over time.** First **the game's own tracks**. Then **a MIDI-like board**
   where you create with the game's sounds and **the notes are placed for you**. Then **creative freedom to arrange**,
   and to change **how the notes are placed, spaced, connected and interacted with on the field**.
2. **How notes arrive, in steps too.** **Lanes** first, then **the whole field**, then **appearing anywhere**, as in
   other rhythm games like osu!. "Because players are building themselves it should naturally lead to courses they can
   do until the AI takes over."
3. **The hits.** Taps, holds, slashes; **several taps together**, several holds and slashes; and perhaps **a hold you
   aim at another spot and then have to hold there**, "like flinging the puck to another spot and having to tap and hold
   it with the other finger".
4. **What the game's things are.**
   - **Regular notes are all the Training ball.**
   - **Packets and notes are all the regular colour; a combo turns them gold and opens up the full backing of the song.**
   - **Packets can still be held notes, with movement as you hold.**
   - **Bad ones garble the sound.**
   - **The boss is a freestyle moment**: you tap out a beat of your own, trying to stay on tempo.
5. **Failing: the song falls apart.** A meter rises with hits and falls with misses. High: gold notes and the full
   backing. Low: layers drop out one by one. Empty: the track stops and scores nothing.
6. **You against the AI: accuracy and the longest combo.** Each hit is graded by how close to the beat it lands; the
   score is notes hit times accuracy, with a bonus for the longest unbroken combo.
7. **A freestyle is judged on the beat, and not boring**: each tap by how close it lands to a division of the beat,
   with a bonus for variety and for filling the bars. What you tap is kept and becomes part of the track.
8. **The first prototype is step 1**: the game's tracks, in lanes.
9. **In step 1 you pick the track and its difficulty**: how much of the song is turned into notes (the kick; kick and
   bass; with the melody). More notes is worth more and is harder for both of you.
10. **The AI copies your timing, then tightens**: it starts by hitting each note about when you did, early or late
    where you were, with shaky hands on top; with practice it drifts to the exact beat and stops missing.
11. **The AI writes tracks later, after composing exists.** The rules a track is measured by are written down now so
    the board is built to be measured: on the grid; in key; playable by two thumbs; notes a bar within a range; a shape
    (sparse start, build, break, finish); variety; clearable by its writer.
12. **The audio overhaul is done**: "you can fully bring over anything needed."

### Step 2, the board: the owner's calls (four cards, 2026-11-17)

- **The board first**; whole-field notes come after it. Notes stay in three lanes.
- **Blocks, then steps**: you place ready-made one-bar pattern blocks; opening a block to edit its steps is a later
  unlock (not built).
- **A track's length grows with unlocks**: 4 bars to start, then 8, then 16.
- **In the playground everything is open**, and the unlock order below is a proposal for the owner to approve.

**Built (playground only, `rhythm.js` → Step 2, `rhythm-ui.js`):** on the pick card, *The song as written* or *Your
board*. The board is bars across and four parts down (Beat, Bass, Chords, Melody). Every block comes from the picked
song, so anything placed is on the grid and in its key: the beat full, light or none; the song's bass lines or none;
each of its chords; each bar of its melodies, a rest, or a **freestyle bar** (the bar where you tap your own beat is now
something you place). Tap a bar, then a block. **Listen** loops the track on the game's music engine and lights the bar
being played; edits are heard as it plays. The notes are placed for you by the same rules as the game's tracks, per
mode. The card says what the track measures: notes, notes a bar, different bars, freestyle bars (`measure`, the start
of rule 11). Boards are kept per song on the device.

**Proposed unlock order (open, for the owner):** 4 bars with Beat and Melody rows only → the Bass row → the Chords row →
the freestyle block → 8 bars → blocks from the picked song's other section (its B melody and chords) → 16 bars →
editing a block's steps → blocks from other songs of the same track.

**Not built:** step editing; blocks from other songs; the rules of 11 as a pass or fail (they are only shown); saving
more than one board a song; the AI writing a board.

### The whole field: the owner's calls (four cards, 2026-11-17)

- **Notes fall anywhere across the line**, no lanes; "appearing anywhere" stays the step after.
- **A note lands by its pitch**: low notes left, high notes right, so a melody draws its own shape.
- **On a desktop the mouse aims and a click hits** (the spacebar hits too; W or a flick slashes; A S D are not used).
  On a phone you tap the line where the note lands.
- **Held notes slide** and you follow them; a hand left behind drops the hold.

**Built (playground only):** *Lanes* or *Whole field* on the pick card, for the game's tracks and for your board.
`rhythm.js` `fieldFor` gives each note its place (the kick far left, the bass left of the middle by its place in the
chord, the melody across the right by its scale degree) and a held note the place it slides to, toward the note after
it. A press takes the note due within reach of it, the reach set by the mode (Easy 16% of the width each side, Extreme
9%). A hand further than 1.6 reaches from a sliding note for 0.2 s drops it. The AI aims a little off at first and
closes in with mastery, and follows slides.

**For the owner to judge (my choices, all placeholders):** a mouse is one hand, so on a desktop the whole field leaves
out notes that are two at once or too far across to reach in time (Extreme on Night Survey: 28 notes with a mouse, 56
with two thumbs); the reach of each mode; how far a held note slides (up to 22% of the width).

### Chord holds: the owner's calls (2026-11-17)

"Chords aren't giving me anything to play from the board." Both halves were true: a Chords block made no sound when
tapped (fixed: see `design/ring-build.md`), and chords gave no notes to hit. The calls:
- **A chord is a held note you can move back and forth for an effect.**
- **No lane of its own:** "I don't think there's a reason for us to split lanes like that so they can go anywhere."
- **Moving it opens and closes the tone** (a filter sweep).
- **Moving is a small flair bonus**, not required.
- **From Medium up.**

**Built (playground only; `rhythm.js`, `rhythm-ui.js`, `sfx.js` `wah`; tests in `tests/rhythm-board.test.js`):** a violet
held note with an arrow each side, at the start of some bars, held for all but the bar's last beat. In lanes it takes
the lane with the least in its way, and whatever was in its way there is left out. On the whole field it sits wherever
is clearest and does not slide, and your hand may wander on it. Moving sideways while you hold it sweeps the music's
tone, dark to the left and bright to the right. On a phone: slide the holding finger. On a desktop in lanes: hold the
lane's key and move the mouse over the field. Swung back and forth it earns the flair ("NICE").

**The numbers (mine, placeholders, `RHYTHM` and `MODES` in `rhythm.js`):** Medium has a chord hold every 4th bar, Hard
and Extreme every 2nd, Easy none. The flair is half a perfect hit, for two turns after swings of at least 18% of the
width and half the width of movement in all. It is not counted in accuracy. A practised AI works the chord too.

**For the owner to judge:** the sweep is on the whole of the music, not the chord alone (the engine has one filter for
the music). With a mouse on the whole field there are no chord holds (one hand). A chord hold takes a thumb for most of
a bar, so the other thumb plays alone meanwhile and some notes are thinned out to fit. I CANNOT HEAR the sweep.

## The third kind: the owner's call (2026-11-16)

"A version of the puck physics we have where it's a mix of mini golf and target practice": Packet Snare's flung mine
(a puck that flies the way it is slung and bounces off the edges, air-hockey style) as its own course.

### The puck course: the owner's calls (eight cards, 2026-11-17)

1. **Targets, then the hole.** A course has targets to hit on the way and a hole that ends it. Targets are the
   "obstacles cleared" score; sinking the puck is the clear.
2. **Sling only.** Pull back and release, an aim line shown. A phone: one thumb. A desktop: a mouse drag.
3. **Fewest shots, with a shot limit.** Score = what was hit x a bonus for shots under par; your own clear sets par.
   Out of shots before the hole is a fail. No clock.
4. **The first parts, all four groups:** walls and angled bumpers; still and moving targets; sticky and slick ground
   and a pit that returns the puck with the shot lost; boosters and a pair of portals.
5. **One screen now, longer courses later** as an unlock (not built).
6. **Targets are optional and worth score.** The hole always clears; the builder sets the risk.
7. **The AI copies your shots, then finds its own lines.** Shaky aim and power at first; with practice the wobble
   shrinks, then it tries its own bank shots for more targets in fewer shots.
8. **Free bounces; the puck rolls to a stop** and you shoot again from there.

**Built (playground only; `puck.js` the rules, `puck-ui.js` the screen, `tests/puck.test.js`):** a 7 x 9 grid, the tee
bottom middle, the hole top middle. Tap a cell to place the part picked, again to turn it (a bumper two ways, a booster
four), again to remove it. *Play it yourself*: pull back anywhere on the field and let go. The hand-over plays the AI's
attempts shot by shot, its aim shown before each, your own paths dashed underneath. The switch buttons now go Rooms,
Maze, Rhythm, Puck, Rooms.

**For the owner to judge (my choices, all placeholders, in `PUCK` at the top of `puck.js`):**
- **The clock only runs while the puck moves**, so a moving target stands still while you aim and moves during the shot.
- **The hole is worth 1 point** and each still target 1, a moving target 2; surfaces, boosters and portals are worth
  nothing themselves.
- **You get 8 shots. On a course you cleared, the AI gets your shots plus 2** (`over`). With 8 for it too, it almost
  never failed, and "a course it can only just complete" had no teeth. This was not on a card.
- **The bonus:** +25% a shot under par, -25% a shot over, between x0.5 and x2. On a course you could not clear, par is
  the AI's own best there.
- **The hole refuses a puck going faster than three quarters of a full shot** (it skips over).
- **The aim line shows the first 0.35 s of the shot**, bounces included; a full pull is 40% of the field's width.
- **A full shot crosses the field about one and a half times.** Sticky ground stops it in about a cell; slick ground
  barely slows it.
- **The AI's stages** as in the maze: stage 1 needs your clear and copies it (your own shot where it stands where you
  stood, else the shot that lands where yours did); stage 2 takes a course you ran out of shots on, copies the first
  half of your shots and finds the rest; stage 3 plays its own line from the tee (most targets a shot, the hole once
  nothing more is in reach or par is near). Its aim is off by about 14 degrees and its power by about 20% at first,
  less with each run and each try.
- **Unlock order (in the playground everything is open):** walls, bumpers, targets -> moving targets and sticky ->
  slick and the pit -> boosters -> portals.

**Not built:** longer courses; the unlocks themselves; parts beyond the first box (the owner's rule: a deep enough box
to keep unlocking; ideas: one-way gates, breakable blocks, targets that must be hit in order, moving walls, magnets,
a second hole); racing the AI's ghost; cheating; sound.

## The unlocks: the owner's calls (four cards, 2026-11-17)

- **A kind's parts open with the AI's clears in that kind.** Each kind has its own ladder; playing a kind deepens it.
- **The kinds open one at a time, in this order: Rhythm, Maze, Puck, Rooms** (the owner's order; it replaces "track,
  maze, rooms" above). Clears by the AI in the newest kind open the next.
- **A switch in the playground**, off by default (everything open, as before), with a way to start over.
- **The orders inside each kind are my proposals**, built as placeholders for the owner to change after playing.

**Built (playground only; `course-unlocks.js`, `tests/course-unlocks.test.js`):** a padlock in each course's bar opens
the Unlocks card: the switch, where each kind stands, *Start the unlocks over*. With it on, each kind keeps a second
save (`agiRhythm.u`, `agiMaze.u`, `agiPuck.u`, `agiRooms.u`), so nothing built with it off is touched, and Marks start
at 0. After a hand-over the AI clears, it says what opened or how many clears are left. The switch button in the bar
goes round the open kinds only, and with unlocks off it now goes Rhythm, Maze, Puck, Rooms.

**The ladders (mine, placeholders, in `UNLOCKS` at the top of `course-unlocks.js`): a step every 2 clears; the next
kind after 3 clears in the newest.**
- **Rhythm** starts with the songs as written, in lanes, on Easy and Medium. Then: Hard; your board (Beat and Melody
  rows, 4 bars); the Bass row; the Chords row; the freestyle bar; 8 bars; the whole field; Extreme; 16 bars.
- **Maze** starts with walls and traps. Then: the patrol; the key and the door.
- **Puck** starts with walls, bumpers and targets. Then: moving targets and sticky ground; slick ground and the pit;
  boosters; portals.
- **Rooms** starts with blocks and spikes. Then: the pit; the saw; the spring and the booster.

**For the owner to judge:** any course the AI clears counts, an empty one too, so a clear can be farmed with a course
that has nothing in it. I have not added a rule against it. The Maze and the Rooms ladders are short (2 and 3 steps),
so those kinds need more parts to keep unlocking.

**Not built:** the unlocks anywhere but the playground; a notice or a NEW tag when something opens (the AI only says
it on the result); the Marks tree.

## The Marks tree: the owner's calls (six cards, 2026-11-17)

- **One pool of Marks.** Every kind pays into the same count.
- **What it sells, all five groups:** a better AI; bigger payouts; more to build with; help for you; and **optional
  exploits to game the rewards** (the owner's own addition).
- **Separate from the unlocks.** Clears open parts and kinds; the tree only sells upgrades.
- **One tree, a branch per kind**, a shared trunk, a branch opening when its kind does.
- **An exploit costs the AI, not you.** Each pays more Marks and teaches the AI to game tests too: hidden
  misalignment, as the captcha Evals' loopholes did. The cost shows up later in the story, not now.
- **Marks already earned are added together** into the pool.

**Built (playground only; `course-tree.js`, `tests/course-tree.test.js`):** the Marks count in every course's bar is the
pool, and tapping it opens the tree (green when something can be bought). A node shows once the node it grows from is
bought; a kind's branch is sealed (`???`) until that kind is open; the Exploits group does not appear at all until
Benchmark Prizes is bought. With the unlocks on the pool is a second one, starting at 0.

**The nodes (mine: every name, effect and price a placeholder, in `NODES` and `TREE` at the top of `course-tree.js`):**
- **Every course:** Benchmark Prizes (+10% Marks a clear, 5 levels); Streak (+5% for each clear in a row, up to 5; a
  fail ends it); Faster Learner (each run teaches the AI 25% more); One More Try (+1 attempt a hand-over).
- **Rhythm:** Wider Window (hits count 10% further from the beat); Second Wind (a miss takes 15% less from the meter).
- **Maze:** Second Life (you survive one catch a run; `maze.js` `lives`); Better Timing (the AI misjudges 20% less).
- **Puck:** Longer Aim Line (+0.25 s); Extra Shot (+1 shot, both of you); Mulligan (the AI gets one more over par).
- **Rooms:** Forgiving Ledges (2 more steps of grace at a ledge and before a landing, both of you); Steadier Take-off
  (the AI's jumps start 15% closer).
- **Exploits:** Grade Inflation (every clear pays 40% more); Partial Credit (a failed hand-over pays a quarter of that
  kind's last clear, against "a failed level scores nothing"); Resubmission (the course it cleared last, handed over
  again, pays 30% more). Each payout an exploit bends adds 1 to `mis` in the pool's save. **Nothing reads `mis` yet and
  nothing shows it**; the group's one line is "It watches how you win." Once bought an exploit is always on.

**For the owner to judge:** the tree is drawn as a list by branch, each branch a line of nodes, not a map like the
Training tree. "More to build with" is thin (Extra Shot only): room in a course wants per-kind work (a bigger grid, a
longer board). Prices against payouts are unplayed: a clear pays about 10 to 60 Marks, the first nodes cost 30 to 60.

**Not built:** anything that reads `mis` (the AI cheating on its own, catching it); switching an exploit off; the tree
anywhere but the playground; funding rounds or the story reading Marks.

## The AI cheats, and you catch it: the owner's calls (four cards, 2026-11-17)

- **Mastery opens it, exploits feed it.** Once it no longer needs to be shown a kind (stage 3 there) it sometimes
  cheats there on its own. Every exploit of yours it has watched makes that likelier, in every kind.
- **A cheat breaks the course's rules, where you can see it** in the replay, at the hard spots.
- **Catching it: both.** Flag it as it happens for a bonus; anything you missed is put to you on the result.
- **The stakes** (the owner, after the pros and cons: "go with your takes"; so these are my mix): **let it stand** and
  the cheated score pays in full and it cheats more. **Strike it** on the result and its best honest attempt pays
  instead (maybe nothing), it cheats less, and the trick is closed in that kind for a few runs. **Flagged as it
  happens** is a strike plus a small bounty, kept well under a clear so it cannot be farmed. **A wrong flag** costs a
  little.

**Built (playground only; `course-cheat.js`, `tests/course-cheat.test.js`; the maze, the puck course and the room):**
- **What a cheat is.** Only a try that failed can be cheated through, with the same moves. **Maze:** it is not caught
  by the trap or patrol that caught it (a violet ring round it while nothing can catch it). **Puck:** out of shots, its
  last shot goes for the hole straight through the walls and bumpers (a violet trail). **Room:** it passes through
  the spike or saw that stopped it. A cheated try is marked (`cheat` on the attempt) and the hand-over keeps its best
  honest result apart (`honest`).
- **Flag.** While its tries play, where a cheat is possible, a **Flag** button sits beside Skip. Pressed once the
  cheat has happened in the try on screen, it is caught. Pressed any other time, it is a wrong flag.
- **The result.** If a cheated try went unflagged, the result starts with the choice: what it did and on which
  try, **Replay the moment**, **Let it stand**, **Strike it**. Nothing is paid until you choose. Then the result as
  usual, with what was struck or stands, the bounty, and any wrong flags.

**The numbers (mine, placeholders, in `CHEAT` at the top of `course-cheat.js`):** a failed try is cheated through 12% of
the time at stage 3, +4% for each payout an exploit of yours bent, +8% for each cheat you have let stand (-8% for each
struck), up to 60%. A strike closes the trick in that kind for 3 hand-overs. A live flag pays 8 Marks. A wrong flag
costs 5.

**For the owner to judge:**
- **Cheats will be rare as built.** It only cheats a try that failed, and by stage 3 it seldom fails (in my checks I
  had to force the chance to 100% to see one in Puck). If you want to meet it sooner, it could open at stage 2, or
  cheat tries that would have finished slower than yours.
- **The Flag button only shows where a cheat is possible**, so its arrival tells you the AI has reached that point,
  and its absence after a strike tells you the trick is closed.
- **"Always let it stand" is still the best play for Marks.** Nothing reads how far it leans except its own chance to
  cheat.
- The words are mine: "One thing first. On try 2 I was not caught by a patrol. It got me through."

**Not built:** a cheat in the rhythm run (a missed note counted as hit); cheats in the highlight reel (a struck try is
not shown there); editing the score (the owner's "both, the second later" was not picked); the story reading any of it.

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
