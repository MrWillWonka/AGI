# Packet Snare: the second minigame

**The owner's pick** (after three models pitched and reviewed, `second-minigame.md`): a lasso game in the server room's second
bay that makes **data**, the resource that funds sprints. The Training Cluster is momentum, timing and physics; Packet Snare is
drawing and judgement: where to loop, how big, what to leave out.

**Inspirations, named:** Pokémon Ranger's capture styler (circling targets), Qix (enemies that cut your line), Cauldron's
evolving minigames. **What's ours:** the loop's *area* is the multiplier and corrupt data spoils a whole catch (greed against
precision); the Rogue AI fights for the same field; and the game grows from drawing by hand into laying automated nets.

## The owner's design

1. **The core loop, the data lasso.** Packets (glowing geometric nodes) drift and bounce. You draw a trailing wire; when it
   crosses itself it closes and snares everything inside, converting it to lab resources. The larger the area, the higher the
   multiplier, but a longer wire drains Focus faster and takes longer to close, leaving you exposed.
2. **Hazards that interact with the line.** **Corrupt packets** (red): lasso one with good data and the catch is spoiled,
   yielding nothing and burning time, so shapes stay tight. **Firewalls** hunt the cursor and sweep the board; touching the wire
   before it closes snaps it, the data escapes, and you suffer a brief cooldown.
3. **The rivalry, the Rogue AI.** It drops **Infection Cores** whose red circles expand and steal any data inside. Counter-play:
   **the Chokehold** (a tight lasso round a core quarantines it, shattering its circle) and **the Wall** (a straight line its
   circle can't cross, protecting half the board while you harvest it).
4. **The phase shift (act two).** **Scrubbers** forgive one or two corrupt packets in a catch, so you can draw faster and
   sloppier. **Anchors**: tap to place permanent nodes; lasers connect them into geometric nets that catch good data and leave
   gaps for the bad to drift through: from drawing to trap-laying architecture. **Active defense**, late: the nets harvest, and
   your drawing deploys hacks (shield walls against the Rogue AI, slashes through Firewalls before they break a net).

## Built: the first cut (playable)

Everything in part 1 and 2, nothing from 3 and 4 yet. Details in CLAUDE.md ("Packet Snare: the second minigame").

- `packet-snare.js`: the field, packets (good, gold, corrupt), the wire, loop closing by self-crossing, capture, Firewalls
  (boot from the corners and hunt the wire), Focus. Pure, seeded, tested (`tests/packet-snare.test.js`).
- `engine.js`: the bay's milestone at Edge Detection (`module:snare`), the AI's mail (`pipeline`), pay per packet
  (`snareCatch`), the record (`finishSnare`, `state.snare`, save v19).
- `game.js`: the bay (`BAYS.pipeline`), the canvas and the pen (pointer, with coalesced events for smooth lines), the start and
  end cards, catch pops and loop flashes, snapped wires falling apart, sounds, the Journal line and the playtest event (`snare`).

**First-pass numbers** (`SNARE` in packet-snare.js): Focus 100; drain 1.2/s, +1.5/s with the pen down, +0.55/s per unit of
wire; area multiplier 1 + area/12, max ×5; corrupt −10 Focus, snap −5 and 1.2 s; 20 good and 4 corrupt packets on a 160 unit²
field; 5% of new packets gold (×5); Firewalls at 6 s and 32 s. A packet pays one hand collection's data (`dpPerCollect`, about 7
around Edge Detection, where a full sprint costs about 5–6 DP).

## Built: the second pass (the owner's first playtest)

The first log (`playtests/snare/2026-11-07-owner-snare-1.txt`, on the first cut): 7 runs averaging 25 s, a loop every 4.5 s
of 4.6 packets, and a multiplier of 3.2–4.8 at least once every run, so big loops already tempted. The costly mistake was
corruption: 18% of loops spoiled, and a run with a spoil earned about 40% less a second. The preview is the answer (a corrupt
packet inside shows before the loop closes). At 1 DP a packet the first cut paid 4 DP/s; at Edge Detection's 7 DP a
collection that's about 28 DP/s, against about 17 from clicking Collect Data (which also costs compute), so the second
pass's smaller start (fewer packets, shorter runs) brings it back near the lab's hand rate, with the tree to grow it.

The owner played the first cut on the test artifact: loops were hard to close, it wasn't clear when a big loop was worth it,
and runs were long to start; it should start small and quick and grow into a sprawl of abilities, like the fish-tank
incrementals (schools, chain lightning, scanners, targeted lasers), with its own skill tree.

- **Closing:** back near the start closes the loop (a ring there lights up); lifting the pen near it closes it too.
- **The preview:** the open loop shows what it would catch (ringed packets, "×mult · count", red when a corrupt packet is in).
- **A small start:** a 70 unit² field, about 9 packets, Focus 40 (about 20 s), one Firewall.
- **Schools:** good packets swim in schools; corrupt ones cut through them.
- **The tree** (bought with data): Attention Span, Bandwidth, Sprawl, Gold Rush, Schooling, Obfuscation, and the abilities:
  Chain Lightning, Scanner, Scrubbers, Targeted Laser and Twin Emitters.

## Built: the third pass (the owner: "still way too easy, and too much Focus"; add the Rogue AI and Anchors)

- **A short, hard start:** Focus 26 (about 10 s of drawing), faster packets in loose schools of four, a corrupt packet for
  every three that **swims toward the schools** (it hides in the crowd), a bigger loop per multiplier, a Firewall at 5 s.
- **The Rogue AI** (from the third run, with its mail "my share"): Infection Cores drop beside the schools and grow red
  circles that steal what they reach. **The Chokehold**: a tight loop round a core quarantines it (half its haul back).
  **The Wall**: a long straight stroke becomes a shield across the field that no circle can take a packet through.
- **Anchors** (the phase shift, off the Targeted Laser): tap to place 3–5 anchors; three or more make a net of lasers that
  catches by itself whenever it holds good packets and no corrupt one. Firewalls stalk and break nets. The layout carries to
  the next run. **Overclocked Nets** fire faster and pay more.

## Built: the fourth pass (the owner's second log, and "packets should continue off screen")

The second log (Packet Snare 2, `playtests/snare/2026-11-07-owner-snare-1-2.txt`): Attention Span ×3 went first (the
cheapest node), then the Laser, Chain Lightning and Sprawl; runs caught 114–116 packets (from 30–50) and the best
multiplier fell to ×1.8–1.95, so abilities did the work and big loops stopped mattering.

- **The pipeline flows:** each run has a current; schools enter upstream and leave downstream. Data has to be caught as it
  passes, which brings back timing and position.
- **Containment Field** (off Schooling): the edges hold good packets in, corrupt ones still leave.
- **Herders** (off Containment, 1–3): drones round strays up toward your net (or the middle) and shoo corrupt ones away.
- **Attention Span** dearer and weaker: +25% a level from 90 DP ×3 (it was +35% from 40 ×2.4).

## Built: the fifth pass (the owner: "firewalls instead of nets")

- **Antivirus:** the hunters that chase and snap the wire are renamed.
- **Your Firewalls:** anchors join into green laser lines (three or more close a pen). Good packets bounce off them,
  corrupt ones pass; nothing is caught automatically, so you build pens and funnels and lasso the pile yourself. An
  Antivirus that hits one is stunned and the firewall goes down (Hardened Firewalls take more hits). Herders feed the pen.
- **System Firewalls:** a red line sweeps the field from side to side after its edge flashes, snapping any open wire.

## Built: the sixth pass (a two-model review, round 1, and the owner's calls)

Two reviewers (Opus, Fable) scored it: accuracy 7.5, bugs 6, implementation 7, clarity 6.5, consistency 5, polish 6.25.
Fixed: the phone tree, Hardened Firewalls (a stunned Antivirus is knocked clear and needs a new approach), the Chokehold's
empty flash, the preview label, emoji glyphs, input (left button, no tap on a cancelled touch, a 22 px tap reach), pausing
under dialogs, toasts over the field, the old card after a version. The tree now uses the Training tree's nodes, icons,
popup ("now → after"), demos and reveals, priced by its rules; the base numbers live only in packet-snare.js.

The owner's calls:
- **Signal**, its own currency (data was no prize: the lab makes plenty); the best haul trickles research.
- **Sectors and boss Antivirus**: the boss roams to the schools, wipes data and charges the pen; tight loops beat it and
  clear the sector (harder, better paid; a live lane on the server-room tile). The Rogue AI waits for sector 4.
- The wire grows with the field; the Scanner is one narrow beam; your Firewalls shield packets from cores, a closed pen
  hides its school from corrupt packets, and wire along a Firewall is free; the first two runs start clean.
- No instruction lines: demo cards the first time each mechanic turns up.
- Your tools amber, enemies red, the Wall a white hatched shield; its own sounds; music that builds; six achievements.
- The Rogue AI stays as hard as it was (the owner likes the challenge).

## Built: the seventh pass (review round 2, the owner's sixth-build log and calls)

Round 2 scored accuracy 7.5, bugs 5.5, implementation 7.5, clarity 6.75, consistency 7, polish 6.75. The owner's log: the
tree was bought out by 16 minutes, bosses fell easily, lasers did the work. The owner asked for a tree that isn't quick to
finish, a far bigger field with far more to place and manipulate, walls you draw (to keep the bad out and let the good
through) and decoys, fewer red stars (and red packets instead of stars), and bosses that scale into the wall.

- **Your Firewalls are walls you draw** (corrupt packets bounce, good ones pass, they stun Antivirus and the boss and keep
  the Rogue AI's cores off the data). Anchors and pens are gone, and so is the edge-to-edge Wall.
- **A tool bar**: decoys, turrets, scanner towers, freeze and purge, beside the lasso and the wall.
- **A 49-node tree** in four branches reaching four cells out (about 300K Signal and an endless Overclock), panning and
  zooming like the Training tree; nine Sprawl levels to a datacentre-sized field; Checksums and Parity Check thin the
  corrupt packets.
- **Bosses as the wall**: 1, 2, 4, 6, 9, 12, 16, 20 hits, faster, charging more often, booting Antivirus when hit.
- Round 2's fixes (input under cards, saves, the bay bar, Escape, phones, colours, speed: 216 → 33 ms a frame on a
  throttled phone at full build), tested demos, stealth music.

## Next slices

1. **Playtest the second pass:** does closing feel easy, does the preview make big loops a decision, is the first run
   short enough, do the abilities change how you play? Tune `SNARE` and the tree's prices from the log.
2. **Rule-breaking mechanics and power-ups** from review rounds 3 and 4.
3. **Active defense:** slash through an Antivirus with a quick stroke before it reaches your Firewalls.
4. **The Rogue AI's story beats (leaving a core alone as a deliberate
   freedom choice, never a missed loop).
5. **The sim** plays it (built: `SNARE`; next, a better bot) (a time share and a simple loop policy, from the first log with `snare` events).

## Built: the eighth pass (review round 3 and the owner's calls)

Round 3 averaged 7.25 / 6.25 / 7.5 / 6.75 / 7.0 / 7.0 (accuracy, bugs, implementation, visual clarity, consistency, polish). The owner's replies set the direction:

- **Active play first, idle play much later.** The tree's inner rings are verbs (Garbage Collection on the first ring, Packet Spoofing, Parry and Slash, Race Condition, Firewalls, Freeze); lasers, turrets, towers and herders sit further out and cost far more (Turrets 12.5K, Rapid Fire 100K a level).
- **The exploits** (rule-breaking, framed like the trail's Hop): flicks (quick straight strokes) spoof corrupt packets and parry or slash the boss, and a flick that hits nothing is flagged, with an IDS alert at three. Then Garbage Collection, Race Condition (the owner's version: hold the pen still after closing and the multiplier grows), Hijack, and Collusion (the owner's version: a quarantined core may turn partner and collect for you, and Antivirus hunt it). Left out at the owner's call: Buffer Overflow, Backflow, Ctrl+Z, the Seam.
- **Bigger loops, said plainly.** The corrupt lure eases while you draw, and a loop at ×2 or more reads HIGH RISK · HIGH REWARD with the red packets near it.
- **Scale with the screen, lean to readability.** The field is capped at 20 px a unit, and a capped field's packets are worth the difference. Firehose and Floodgate make three times the packets, and Checksums and Error Correction cut red packets to a quarter.
- **Bosses grow** with the sector (and the field), so later ones need bigger loops round all of them. Hazards come from the sector, never the field's size. A slot more per tool at the top of Megasprawl and Hyperscale. Replayable sectors at half the bounty.
- **Kept as they were:** the sector 1 boss, the research cap, no boss damage carried between runs.
- **Herders** are stunned by Antivirus they touch, and Evasive Herders dodge them. Lasers reach only part of the field, and Laser Array adds emitters on more edges. The enemy sweep is now a **Full Scan**.
- **Round 3's fixes:**
  - Core shadows clipped right.
  - Freeze stops the field's clock and allows no boss hits.
  - Walls that go down free their slot, and saved walls are re-trimmed.
  - Retraced wires restart.
  - The decoy weight is fixed, and the boss smashes a decoy it sits on.
  - Tags show as an outline that cools down.
  - Distinct amber or white silhouettes for everything you own, and notched Antivirus.
  - The boss's hits shown as a ring.
  - Pops that stack instead of overlapping.
  - Stat icons shared with the tool bar.
  - A remembered tree camera.
  - Plain-language previews.
  - 15 new sounds.
  - Keys in Settings.
  - First-meeting cards for tools and gestures.
  - Log fields and a build stamp checked by a test.
  - `tools/snare-boss.js`.

## Built: the ninth pass (review round 4 and the owner's calls)

Round 4 averaged 6.75 / 6.0 / 7.5 / 6.5 / 7.5 / 6.75. The owner's replies:

- **The boss is fought with flicks, not loops.** It has health (3 on sector 1, then 4, 7, 10, 15, 20, 27, 35, 44…, `snareBossHp`). Every few seconds it locks on (to the pen, or the nearest school) and shows a red warning line with amber PARRY ticks; a flick across it **parries**: the boss reels (`bossStun` 1.6 s, a countdown ring and SLASH!), and every flick through it while it reels is a **slash** for `slashDamage`. A Firewall's stun is a slash window too. A flick through it with its guard up says GUARD UP. Loops do nothing to it. A quick stroke on its way isn't snapped by it.
- **Mines and nets** (the owner's idea): from sector 2 it lays two mines, from 4 a ring of three, faster from 6, four from 8. Mines near each other grow a net (dashed, filling in from both ends over 4 s); a finished net wipes the data it crosses, and three round a triangle wipe what's inside. While any mine stands the boss is **shielded** (a second dashed hexagon, tethers to its mines; slashes glance off: SHIELDED · loop its mines). A loop round a mine clears it.
- **It keeps to the middle** (`bossEdge`: its edge 18% of the shorter side clear of the field's), and its target is held there too, so data along the edges is safe from it.
- **The tree breaks the wall:** Root Access (slash damage +1 ×3; it was Parry and Slash, now always on), Riposte (a parry deals damage), Kernel Panic (it reels longer), and Privilege Escalation (a flick from your hijacked Antivirus into the boss rams it for 4, 7 at level 2, and spends the ally). `tools/snare-boss.js` with the tools' bot (`tools/snare-bot.js`: parries after 0.3 s, slashes every 0.22 s, loops mines): a first build clears sector 1, Attention Span 3 sectors 2 and 4, the Focus branch to 4, Focus + Root Access 3 to 6, with Riposte and Kernel Panic to 8.
- **Hazards every other sector:** Full Scans from 3, Antivirus from 5 (another every three sectors), the Rogue AI from 7, the boss booting Antivirus when parried from 9 (at most two alive), scans twice as often from 11. The sectors between are the boss's own tricks (mines, nets). The boss grows half as fast (+7.5% a sector). **Antivirus work in shifts** (11 s hunting, 5 s UPDATING: dim, slow and harmless), so there are windows to loop safely.
- **Many more packets, far fewer red ones.** Schooling adds 25%; Packet Burst, Broadband, Multicast (+50% a level) and Torrent join Firehose and Floodgate: about seven times the start at a maxed tree. Signature Database, Heuristics, Blocklist and Sandboxing join Checksums and Error Correction, each level taking 15% off what's left (multiplied): about a tenth of the red packets.
- **No more ×15 phone bonus** (`worth` is gone): a packet is worth the same everywhere. A field the screen caps holds the packets a bigger one would, denser, up to 0.75 a unit² (`densityCap`), so it stays readable. Sprawl's and the packet nodes' previews read "Packets on the field: ×a → ×b (it fills your screen)".
- **New shapes:** **Fork Bomb** (a figure eight: both lobes paid at their multipliers multiplied, up to 1.5 × the cap; red in either spoils both; the first lobe waits 4 s, dashed green, "×? FORK"), **Starburst** (a five-pointed star drawn while frozen: everything inside its outline ×2, ×3 at level 2, red packets there deleted, mines cleared).
- **Turrets are defence** (the owner's call): each shot hits a hunting Antivirus in reach (stunned 1.5 s; three hits and it's down, rebooting from a corner 8 s later), else wipes a red packet (Purifier Rounds: two). They never take good packets.
- **Round 4's fixes:** the closing ring in screen px (36 px, Wide Ring wider); a flick is flagged only if it went near something it could hit; a card mid-stroke drops the pen without judging it (`cancelPen`: Race Condition's first meeting no longer lost); walls being rebuilt stay in the layout; spoofed packets pass your walls; a race counts once held 0.3 s; the IDS card says what it set off; tools and exploits are met in the tree (buying one counts as meeting it), cards in a run are for hazards; the tree's popup is opaque and the tree pans its node clear of it; branch names (Loop, Field, Exploits, Defense); the bay bar's badge sits on its button and the Upgrades slot is kept before the first run; the Full Scan warns with a band, not a field tint; lasers are short bolts; HIGH RISK is a pill of its own, kept when the loop reads CORRUPT; the HUD carries the boss's health and rage; laser and turret catches don't summon the boss; the Journal's Packet Snare line has runs and the best loop.

**9.1, the parry** (the owner: "not long enough or around long enough to parry, not sure I understand how"): the warning lasts 1.6 s (0.9 at the least), its line reaches a third of the field past the boss's edge and never off the field (it turns to the middle when aimed at a wall), drawn as a wide red zone with a countdown, an animated amber swipe across it and SWIPE ACROSS TO PARRY until the first parry. A parry counts across the line, through the boss or near the line; flicks are 48 px within 0.45 s and need only be fairly straight. The boss's first-meeting card spells the gesture out.

**9.2, front-loaded** (the owner: "these need to be mostly front loaded"): Schooling +75% packets, Firehose +60% a level from 250 Signal, Floodgate +50% from 1,200: ×3.5 the packets for about 2K Signal, ×4.5 for 5.6K, ×7.65 at the end. Checksums (from 260) and Error Correction take 28% of the red packets a level: 38% left for about 2.2K Signal, 20% for 14K, 5% at the end. The later nodes are cheaper (3K–7K to start).

**9.2, gates** (the owner: "the boss mechanics like mines should come much later and be used as the gates to push players to go try other games and come back stronger"): the boss's own tricks moved to gate sectors, each with half again the boss's health and "· Gate" on the sector's title: mines from sector 6, nets that close into triangles from 10, Antivirus booted on a parry from 14, four mines laid faster from 18. The field's hazards stay every other sector (Full Scans 3, Antivirus 5, the Rogue AI 7, scans twice as often 9). Open: what from the rest of the game makes you stronger here (today only Signal does).

**9.3** (the owner: "regular field hazards can be one every three and the bosses one every four, skills can also grant power in the packet snare and other buffs based on the name"): the field's hazards at sectors 3, 6, 9 and 12, the boss's gates at 7, 11, 15 and 19 (offset so they never share a sector), and every training skill grants a Packet Snare buff that fits its name (`SNARE_SKILL_BUFFS`), so training is how you come back stronger to a gate.

### 9.5: packets and red packets all through the early tree

The owner: the 9.2 front-loading only repriced the packet and red-packet nodes at the far ends of the Field and Defense branches, so the tree looked the same. Now they sit in between the other nodes, in every branch: each opens with a cheap packet node on its spine (Packet Stream 240, Schooling 100, Open Ports 60, Mirror Port 95) with a red-packet node beside it (Input Validation 300, Spam Filter 280, Sanitizer 180, Checksums 260), the rest of each branch pushed a cell further out (the grid now reaches six cells, 13 × 13), and more in the middle rings (Jumbo Frames, Port Scan, Load Balancer, Reputation Check, Traffic Shaping, Rate Limiter, Bulk Transfer). The inner rings alone (about 9K Signal) give ×6.5 the packets and 14% of the red ones; the whole tree ×11.8 packets and red down to the 5% floor.

## Snare 10: the tree regrown from three reviews

The owner felt the tree's distribution, layout and diversity were still off. Three reviewers (Opus at medium effort, Fable at high, and the session's own model) agreed on:

- **The screen cap made late packet nodes dead.** A phone's field filled at about 330 packets by 5–10K Signal; after that, about 100K Signal of packet and field levels changed nothing on screen.
- **Red packets bottomed out early.** They hit the 5% floor at 19 of the tree's 29 units, so 10 red-packet levels (about 100K Signal) did nothing.
- **A third of the tree was the same two percentages.** The tree broke the house style 13 times: a node repeating its parent's stat, or siblings sharing one.
- **Verbs and automation sat the wrong way round.** Scanner, Herders and Laser were close in, while Freeze, Race, Hijack, Fork Bomb and Starburst were far out.
- **The branches bled into each other, and their names didn't fit their contents.**
- **The boss answer was gated deep and dear.** Riposte cost 16K and Kernel Panic 70K, on one spine.
- **There were no capstones,** and the prices formed a cliff at ring 4.

The owner's calls:
- **Past the cap:** packets draw smaller, the cap goes up, and caught packets respawn faster.
- **Automation** goes at the branch tips.
- **Capstones** are pure upgrades.
- **Size:** a mix of keeping the cheap early pairs and Fable's trim.

The result:
- **73 nodes in four wedges,** with gutters on the diagonals.
- **Every branch opens with a cheap + and − pair.**
- **The four capstones:** Infinite Loop, Packet Storm, Blue Screen and Zero Trust.
- **Hot Swap,** IDS Evasion and Forged Headers are new.
- **The red floor is 3%,** reached at about the tree's last red-packet level.
- **`densityCap` is 1.5**, with `maxOnScreen` 1,400. The total budget was measured: 2,400 packets drew a 1280 px desktop at 30 fps, and 1,400 hold 60. Past the budget, `respawn` divides by the overflow, up to 4×.
- **Save v22 refunds** every level of the old tree.

### 10.1: two outside reviews

Two outside reviews of the 9.5 tree arrived after Snare 10 shipped. Snare 10 had already addressed most of what they raised:
- **Already addressed:** the stat bloat, the dead red levels, the cap killing packet nodes, the expensive automation and the branch themes.
- **The first review's process:** keep the layout and measure first. It was measured on the new tree instead: visible packets on a phone and a desktop, and red share, at 500, 2K, 10K and 100K Signal across several buying styles.
- **Still true after Snare 10:** red packets didn't drop in the first 500 Signal, and most packet nodes were flat +N%.

The owner's picks:
- **Sanitizer becomes the down branch's root** and Garbage Collection moves to ring 3 (review 2: an exploit at the very centre came before the player knew the base rules).
- **Floodgate becomes a combo surge** (review 1: packet nodes should differ by behaviour).
- **Defuse,** an early counter to the boss's mines that helps a little and grows at its last level (review 2's idea; the owner: early, small, stronger late).
- **The branches are renamed** Loops, Flow, Intrusion, Countermeasures (review 1).

Measured, for a cheapest-first buyer:
- **At 500 Signal:** red is 20% of all packets; it was 25.9%.
- **At 2K Signal:** red is 13%; it was 18%.

The `snare` playtest event now records the field as it played, so the next log can check the screen-cap behaviour on a real phone.

### 10.3: the rest of the outside reviews

The owner asked for what was left:
- **Firehose** sends a pulse of packets in after each clean loop (no red inside). It keeps +30% packets, so the early curve stays generous.
- **Broadband** is tied to the automation: each turret or scanner tower you've placed brings caught packets back 6% sooner a level, on top of +20% packets.
- **Race Condition gets review 1's timing rules.** A meter fills under HOLD ×n, and a Full Scan or the boss's dash through the held loop breaks it, so holding stays a risk.
- **Three new mechanics,** each a hexagon with a demo:
  - **Clean Sweep** (Loops): drawing is free of Focus for a moment after a clean loop.
  - **Backpressure** (Flow): a catch turns the packets around it back, so they bunch up for the next loop.
  - **Quarantine Relay** (Countermeasures): red packets your wall turns back swim to your decoy, so a wall and a decoy make a lane.

## Snare 11: Firewall sections, bots, fewer red packets

The owner's calls:
- **Red packets are 15% of all packets at the start, about 10% after the first cheap buys.** They were 26% at the start.
- **Two early bots.** A Cleaner Bot in Intrusion seeks red packets and cleans them into regular ones; Gold Plating, later, has it turn regular packets gold. A Spoofer Bot in Countermeasures spoofs red packets instead.
- **Firewalls weren't felt, so they're no longer lines you draw.** They are sections you drag and drop that start small and grow:
  - They are safe places to loop: red packets can't get in, and those inside are pushed out.
  - Antivirus and the boss are held at the side and wear the section's health down.
  - Later, Holding Pen makes them pens that keep the good packets that wander or are herded in.
  - Late game, Auto-Deploy has the AI place them where the packets gather.

Honeypot folded into Decoys to make room. Save v23 refunds the tree and drops the drawn walls from the saved layout.

### 11.1: a boss every fifth sector

The owner's call: "Let's not introduce a boss until 5 and every 5 after."
- **Bosses:** only on sectors 5, 10, 15… (`isSnareBossSector`, `SNARE_BOSS_EVERY` 5).
- **Goals:** every other sector clears by catching a **goal** of packets in one run (`snareGoal`). It starts at 25 on sector 1 and rises a quarter each sector, rounded to fives: 30, 40, 50, then 75, 95, 120, 150, then 235…
  - The logs set it: first runs catch 10–30 packets and sector 4's runs 45–125.
  - The run goes on after the goal. The sector is paid the goal's packets again at its pay, half on a replay (`E.snareGoalMet`).
  - The start and end cards name what clears the next sector, and the HUD reads Goal n/m, then Cleared ✓.
- **Boss health by boss:** it reads the old every-sector curve three steps a boss, giving 7, 20, 43, 74, 115. The gates' half again makes that 7, 30, 64, 111, 172.
- **Boss bounty:** 10 × its health (it was 6).
- **The gates** sit on boss sectors from the second boss on: mines at 10, nets at 15, booted Antivirus at 20, four mines laid faster at 25.
- **Field hazards** still arrive every three sectors.
- **The boss mails:** "one down" at the first boss, "Ten sectors" at the second.
- **"Deep Packet Inspection"** now counts sectors cleared.
- **`tools/snare-boss.js`** plays only boss sectors:

  | Build | Sector 5 | Sector 10 | Sector 15 | Sector 20 |
  |---|---|---|---|---|
  | A first run | 3–7 of 7 | | | |
  | Attention Span 3 | ✓ | 10–14 of 30 | | |
  | Root Access 3 | ✓ | ✓ | 20–48 of 64 | |
  | Riposte and Kernel Panic | ✓ | ✓ | 28–34 of 64 | |
  | Blue Screen | ✓ | ✓ | 44–50 of 64 | up to 72 of 111 |

### 11.2: a cleared sector carries the run on

The owner's call: "Also don't want the run to end when a boss is beaten so need to rethink this".

A run used to stay on its sector after clearing it. It went on with nothing left to chase until Focus ran out, and the next sector only came with the next run. Now:

- **Into the next sector:** clearing a sector, by its goal or its boss, carries the run on into the next one at once (`nextSector`, `clearSnareSector`).
  - The run takes on the next sector's red share, speeds, hazards, pay, and its goal or boss. A hazard the last sector didn't have comes in from then.
  - The boss's timer and the goal's count start over for the new sector.
  - Focus is topped up by 30% of the bar. A banner names the sector ("SECTOR 5: RELAY · BOSS · +8 FOCUS").
- **When a run ends:** only when Focus runs out. A good run dives several sectors deep, and the next run starts at the frontier.
- **The end card** lists the sectors the run went through: "Sectors 1–5", Ingress → Buffer → Cache → Backbone → Relay. "Boss health taken" shows only for a boss still standing.
- **`tools/sim.js`** advances its runs the same way.

### 11.3: gather on, then go deeper

The owner's call: "After clearing the goal extra focus should let them keep gathering". They picked staying with a Focus bonus over moving on automatically.

- **The bonus:** meeting a sector's goal, or beating its boss, tops Focus up by 40% of the bar ("SECTOR CLEARED +25 · +10 FOCUS").
- **Staying:** the run stays on that sector to keep gathering at its pay.
- **Go deeper:** **Go deeper →** appears in the HUD (key G). It takes the run on into the next sector when the player chooses.
  - The next sector's hazards and its goal or boss start from that moment.
  - Moving on adds no Focus of its own, so the choice is to farm the cleared sector or push on with what's left.
- **If you don't go deeper,** the next run starts on the next sector.
- **`tools/sim.js`'s bot** goes deeper at once.

### 11.4: nothing twice in a row

The owner's call: "there are still nodes one after the other that do the same thing, sprawl and mega sprawl are a good example; we want to avoid this as much as possible, ideally all the time".

**The rule:** a node never shares a theme with the node it grows from, or with a node beside it on the same parent. A theme is what the player reads, not the stat's name:

| Theme | Stats it covers |
|---|---|
| More packets | field size, density, school size, packets back sooner, Broadband, the surge, the pulse |
| Fewer red | cleaners, the lure |
| Gold | gold chance, gold value, Gold Plating, Packet Storm |
| Focus | Focus, drain, Focus back, Clean Sweep |
| The multiplier cap | the cap |
| Boss damage | slashes, parries, Blue Screen, the ram |
| Laser emitters | emitters per edge, lasered edges |

**Eleven breaks fixed:**
- **Flow:** Sprawl → Megasprawl → Hyperscale, Sprawl → Schooling, Hyperscale → Hot Swap → Broadband, and Schooling beside Megasprawl. Flow now alternates its packet nodes with others:

  ```
  Sprawl → Containment → Schooling → Reputation → Firehose
                                                → Backpressure → Floodgate
         → Gold Rush → Megasprawl → Mother Lode → Torrent → Scanner Towers
         → Spam Filter → Hyperscale → Overclock → Hot Swap
                        (after                  → Scanner → Prospector, Broadband, Packet Storm
                         Megasprawl)
  ```
- **Loops:** Steady Hand → Second Wind (Focus twice). Starburst moves to Steady Hand's side, and stays behind Freeze Frame. Second Wind grows from Freeze Frame.
- **Intrusion:**
  - Root Access → Blue Screen (boss damage twice): Blue Screen now grows from Kernel Panic.
  - Twin Emitters and Laser Array were both "more lasers" on one parent: Laser Array now grows from Overcharged Lens.
- **Countermeasures:** Error Correction → Parity Check → Signature Database (red three times). Ghost Protocol now sits between Error Correction and Signature Database. Parity Check grows from Hijack.

**Prices:** a child's first level must still cost more than its parent's last, so some Flow nodes changed price with their new places:

| Node | Before | Now |
|---|---|---|
| Schooling | 100 | 180 |
| Megasprawl | 120 | 260 |
| Reputation Check | 1.1K | 450 |
| Firehose | 250 | 1K |
| Mother Lode | 300 | 1.7K |
| Torrent | 1.1K | 3.5K |
| Floodgate | 2.4K | 5.5K |
| Hot Swap | 4K | 9.5K |
| Scanner | 4.5K | 10K |
| Prospector | 14K | 22K |
| Broadband | 4.2K | 22K |

Elsewhere: Second Wind 2.2K → 5.5K, Overcharged Lens 55K → 20K, Laser Array 12.5K → 45K, Ghost Protocol 2.3K → 4.5K, Parity Check 4.3K → 2.6K, Signature Database 8.7K → 15K.

**Saves:** save v24 refunds the tree and clears its reveals.

### 11.5: Focus is a clock; a smoother pen

The owner's calls: "I don't like that the focus drains faster when drawing … a regular timed drain"; Clean Sweep "lower the add time to 0.5 and 1 after upgrade"; "smooth out the line drawing … allow loops to close a bit closer on desktops"; and a toggle for the closing ring.

**Focus is a clock.** It runs down a second a second whatever you do, so it reads in seconds. Before, drawing burned about two thirds of a run's Focus.

- **Start:** a first run gets 14 s. In the logs, first runs lasted 10–20 s.
- **Penalties:** a spoiled catch costs 3 s, and a snapped wire 2 s.
- **Time back:** Garbage Collection gives 0.8 s per red packet deleted, and Second Wind 1 s a level.
- **Nodes reworked:** Steady Hand and Summarization used to cut the drawing drain. They now add Focus.
- **Clean Sweep:** a clean loop now stops the clock for 0.5 s (1 s at level 2), instead of making drawing free.
- **Measured with the bot, at the same draw share:**

  | Build | Run before | Run now |
  |---|---|---|
  | First run | 8 s | 12.5 s |
  | Attention Span 3 | 15 s | 31 s |
  | The Focus branch | 26 s | 40 s |

- **Unchanged:** `tools/snare-boss.js`'s boss walls.

**The pen:**
- **Smoothing:** a One Euro filter on the pen's screen position. It is steady when the pen moves slowly and barely lags when it moves fast. A quick stroke ends at the real lift point, so flicks keep their length.
- **The wire** is drawn through its midpoints as curves.
- **The closing ring** is 26 px on a desktop (a mouse is precise) and stays 36 px on touch.
- **A new setting** hides the ring.

## Snare 12: loop the boss, a slower ramp, no scribbling (the brother's playtest, three review rounds, a blind playtest)

**The owner's calls**
> "Many things are added at once and very quickly it gets out of hand. My brother resorted to scribbling back and forth because the slash would change the bad packets and incidental circles would capture with little risk. The bosses are better but they feel very rushed … meaningfully challenging but achievable … circling the boss to stun him makes more sense and the parry can come later. Let's have the parry line be much longer and the boss move to match."

They also asked for a few review rounds with a Fable agent, and a blind review by an Opus agent with no context.

**The boss**
- **Loop it to stun it.** The wire must not touch it; there is a 0.85 r grace.
- **The parry comes later,** as Riposte (1,800 Signal, after Kernel Panic).
- **The charge:** the line reaches 0.6 of the field's longer side, and the boss dashes all of it in 0.8 s. It stops short of a wall, leaving room to loop it there, then rests 1.5 s.
- **Timings:** it charges every 7 s, warns for 2 s and stays stunned for 2.5 s.
- **An arena:**
  - It boots 6 s in, or on the first catch.
  - It adds 8 s of Focus, but not when an IDS alert boots it.
  - While it stands, Antivirus hold their update, the Rogue AI lays no cores and no Full Scan starts. Its own minions still hunt.
- **Health:** 10, 30, 64, 90, 130, 175, 230, 300, with no gate multiplier.
- **Slashes:** 5 per stun, at least 0.3 s apart.
- **Shield and mines:**
  - The shield is up only while two or more mines stand; one mine halves slashes.
  - Mines are laid close round it.
  - At sectors 10–14 mines come every 16 s; from sector 15 nets link in 6 s; sector 20 has 2 mines.
  - Clearing a mine during a stun adds 1 s to the stun.
- **Size:** at most 10% of the field's shorter side.
- **Swipes at the boss are never flagged.**

**Pacing**
- **Hazards also wait for runs played:** Full Scans from run 4, Antivirus from run 10, the Rogue AI from run 18.
- **Goals:** 25, 45, 70 and 100, then ×1.4 a sector to sector 9 and ×1.3 after. A loop counts its packets plus half its worth past them.
- **The clear bonus halves** with each clear in a run: 0.4, 0.2, 0.1 of the bar.
- **The field grows more slowly:** Sprawl ×1.35, Megasprawl ×1.5 and Hyperscale ×1.6 a level. Schooling now adds 0.35 density and Packet Stream 0.25.
- **The verbs cost a couple of minutes' income:** 400 to 6K, with every child dearer than its parent's last level.
- **Root Access** grows from Open Ports at 1,100.
- **Red fades 8% a unit,** down to a floor the tree's last unit reaches. The bots work every 3 s.

**Greed against risk**
- **The multiplier bends upward:** 1 + (area / 0.26 of the field)^1.4.

**Scribbling and other low-risk exploits**
- **Tiny loops don't close,** and the game says TOO SMALL TO LOOP.
- **A loop within 0.5 s of the last pays half,** doesn't count toward the goal and sets off no clean-loop rewards.
- **Spoof flicks** take at most 4 red packets, 1.5 s apart.
- **Chain Lightning** never arcs to more packets than the loop caught.
- **A loop inside a Firewall section** pays ×0.85, unless you own Holding Pen.
- **Garbage Collection** gives Focus for at most 3 packets, and halves within 8 s of the last.
- **Freeze** runs Focus at half speed.
- **Race Condition** pays out at its cap.

**The boss tool now** (`runs` = 30)

| Sector | Health | Cleared by |
|---|---|---|
| 5 | 10 | Attention Span 3 |
| 10 | 30 | Root Access 3 and Kernel Panic |
| 15 | 64 | Riposte |
| 20 | 90 | Blue Screen |
| 25 | 130 | Not yet: the next wall |

**Fable's pacing sim, round 3** (phone field, 30 minutes)
- **Times:** the first scan comes at about 2.7 min, Antivirus at about 6 and the Rogue AI at about 11. The sector 10 wall lasts 1.5–2.5 min.
- **Signal per minute:** about ×40 over 30 minutes, against ×300 in 15 before.
- **Its verdict:** the first twelve minutes are in good shape.

**The blind playtest** (an earlier build of Snare 12)
- **Clear:** the first card and its demo.
- **Fixed since or here:** the boss arriving late, stopping by walls, and alerts from flagged swipes; small loops failing with no word; the HUD and the end card counting the goal differently; "(REPLAY)" on a sector cleared mid-run.
- **Kept:** the tip buttons' jokes (the owner's call) and farming a cleared sector (the owner chose Go deeper as a choice).

## Snare 12.1 (a phone log of 11.5)

An iPhone log of 11.5 (79 min of play, Packet Snare only; `playtests/snare/2026-11-08-phone-snare-11-5.txt`), read
against Snare 12. Already answered by 12: red at 1–2% per good packet by sector 10 (12's floor is about five times that
deep in), scribbling with Chain Lightning (31 catches, 30 of them empty, 495 chained; 12 caps the chain at the packets
caught and halves rushed loops), a replay chaining 17 sectors on a full Focus bar each clear (12 halves the clear bonus
per clear), and sector 10's boss holding 18 runs with most runs never reaching it (12's arena boots it 6 s in with
+8 s of Focus). Fixed in 12.1: **Auto-Deploy never placed a section**: it only used a free slot, and your sections carry
over between runs, so none was ever free. Its sections are now free, at most two at once, each standing 10 s.

Open: the verbs a player bought and never used (Fork Bomb, Starburst, Packet Spoofing, Garbage Collection, Privilege
Escalation: about 70K Signal), and two long stretches with no input (24 min before the first run, 10 min on the tree),
which the log now records as `idle`.

## Snare 12.2: bubbles (a prototype)

The owner: "Phone tracing a circle is easier than desktop but I wonder what if we switched to growing AI 'Bubbles' to
capture the packets and then circling was just for stuns or quarantines." Built as a per-device Settings toggle, off by
default, so both can be played on the same build. Hold still and a bubble grows (slowly, then faster, to 0.4 of the
field's shorter side in 3 s); let go to catch at the same area multiplier, spoiled by red inside. Its outline counts as
the wire while it grows, so Antivirus, the boss and Full Scans pop it. A pen that moves first draws a wire, and loops
only stun, quarantine, hijack, clear mines and collect garbage. Holding costs Focus time, so the tension is "hold for
×2, or let go before that red packet drifts in?". Not converted yet (only if bubbles win): the wire nodes (Long Wire,
Steady Hand, Fork Bomb, Race Condition, Starburst, Firewall sections' free wire), the demos and the bot.

### Snare 12.3: bubbles that hold

The owner: "the delay to grow bubbles makes it too hard to catch and any movement seems to break it." The 0.18 s wait
and a start from nothing meant a school had swum off before a bubble was worth anything, and 10 px of wobble turned it
into a wire. Now it appears at once, already able to catch (0.85 × the closing ring), grows to full size in 2.5 s, and
after its first 0.22 s it follows the pen (0.6 of the shorter side a second) rather than breaking. Only a deliberate
stroke in that first moment (past 1.2 × the closing ring) draws a wire, so loops and flicks still work.

### Snare 12.4: left and right click

The owner: "let's split the two between left and right click." With bubbles on and a mouse, the left button holds a
bubble (locked: no swipe turns it into a wire) and the right button draws the wire (loops, flicks and slashes; held
still it grows nothing). Touch, with one kind of press, keeps deciding by how the stroke moves.

### Snare 12.5: slashes on the left

The owner: "let's swap." Slashes, parries and spoof flicks move to the left button with the bubble: a left press
that's moving fast waits out the flick's 0.45 s before it commits to a bubble, and let go by then it's judged as a
flick. A held left press still grows a bubble; the right button is for loops.

### Snare 12.6: bubbles on the right

The owner: "left can just be the slashes and swipes and drawing a quarantine while right click bubbles." With a mouse
the left button is the wire (loops that stun and quarantine, flicks that slash, parry and spoof) and the right button
holds a bubble. Touch is unchanged.

## Snare 12.7: two loops, the last seconds, colours in every theme

The owner: the boss "should have to be circled more than once to be stunned", "the end of a run should have a visual
to help show the timer is ending", and every item's visuals checked across the themes. The boss now takes two loops,
each within 3.5 s of the last (a spiral counts each turn), with two arcs round it showing the count. The last 5 s of
Focus glow red at the field's edge, faster as it empties, with 3-2-1 large over the field and a tick each. A screenshot
pass in all five themes on a maxed tree at a boss sector found good packets beside red ones in Red and Soft pink, and
a tag's edge reading as red in Arcade; Packet Snare now has its own good, bad and tag colours per theme, and bad
packets are bigger with a heavier edge.

## Snare 13: tools that place themselves, powers you grab

The owner, going through every item for chance against active deployment: "Freeze and purge can be a tap or click to
grab and the rest spawns so the process is automated over time". So the pen is for loops and flicks only, and the tool
bar is gone (`autoTools`, on by default; `autoTools: 0` keeps the old hand-placed mode for tests). Firewall sections,
decoys, turrets and scanner towers now arrive by themselves (`toolStep`): one every `toolEvery` 5 s, the first kinds
staggered from `toolFirst` 2 s, as many of each at once as its tree levels allow (Auto-Deploy adds two sections and
brings them sooner). A section lands where the good packets gather, a decoy and a turret by the red ones, a tower on the
current, never on top of another; each stands `zoneLife` 12 s, `decoyLife` 10, `turretLife` and `towerLife` 14, fading
in its last seconds (a ring drains round it). Great Wall rebuilds a spawned section with a fresh life. Freeze and Purge
float in as **pickups** (`pickupStep`): the first at 4 s (Purge 3 s later), then about every `pickupEvery` 16 s,
quicker with more levels, drifting on the current and gone after `pickupLife` 7 s; Purge shows up among the red packets.
A tap or click on one grabs it and fires the power (`grab`, a generous touch reach); it never starts a wire. The saved
layout is ignored in this mode. Tree texts now read "… at once" for the placeables and "one every ~N s" for the powers.

### Snare 13.1: a run takes the phone's screen

The owner's screenshot circled the top bar (title, CP, Intelligence, the phase) and the bay's bar (Upgrades, Signal):
"These sections can also be completely hidden or super condensed during a run so the space on mobile goes almost
entirely to the run space". On phones, upright and sideways, both fold away while a run is in play (`body.snare-live`),
the frame's padding tightens, and the HUD's single row (Focus, the goal, the haul) gains a ❚❚ button that opens the
upgrades, pausing the run. The bars come back on the end card, in the tree and when you leave the bay, so the way out
is always one tap away. At 390 × 727 the field grew from 470 to 667 px tall; at 844 × 390 from 245 to 330.

### Snare 13.2: bubbles without lag

The owner: "there is a slight delay for movement on the bubble". Three delays stacked: the bubble stood still until it
was committed (0.22 s), then chased the pen at a capped speed (0.6 of the field's shorter side a second), and the pen's
smoothing filter (meant for wires) ran under it too. Now it sticks to the pen from its first frame (`bubbleFollow`
0.012 s), the slop and flick checks measure from where the pen went down, and bubbles take the raw pen position. In
the browser a 900 px/s drag leaves it about 1 px behind.

## Snare 14: harder early, bots by mid-game, powers that feel like powers

The owner's log of 13.2 (a fresh run from the reset to sector 13: 55.6K Signal in about 17 minutes of play): "much
better feel later on, but I wanted more bots roaming around by the time I got to where I stopped, and early game it
wasn't as harrowing for a while, so lighten up on the red packets in favour of another Antivirus; too much space between
the beginning and the other automations; a lot more power behind the fun things like Chain Lightning". The log showed
three drones at the end (Cleaner ×2, Spoofer ×1), the first Antivirus on sector 7 (held by the 10-runs floor), and Chain
Lightning arcing 22–48 packets a run against 300–700 caught. Asked four questions, the owner chose:

- **Threats:** red packets on sector 2 at 10% (none on sector 1), Antivirus on sector 3, Full Scans on sector 5; the
  runs-played floors for scans and Antivirus are gone (the Rogue AI keeps its own).
- **The bot gap, both ways:** every drone and turret's first level is 4,000 Signal or less (Herders 3.5K, Targeted Laser
  3.8K, Scanner Towers 4K, Turrets 4K), their parent chains flattened to keep the rule that a node's first level costs
  more than its parent's last (Long Wire and Torrent one level, Overflow 2K, Decoys 2.5K over two levels; Turrets moved
  in front of Hijack). Cleaner Bot and Spoofer Bot give four drones each, and a new **Collector Bot** (2.6K off Garbage
  Collection, three drones) flies to good packets and nets small clusters every 2 s, never with red that close.
- **Powers, bigger and more levels, louder:** Chain Lightning 5 arcs a level over five levels (and a loop may arc to
  twice the packets it caught), Chain Storm five levels, Floodgate 25 + 15 a level over five, Packet Storm 20 gold over
  five levels (10 more, 2 s sooner each), Infinite Loop three (an echo a second further on per level), the laser five
  (2.5 s down to 0.6 s). Chains of 6 or more say ⚡ CHAIN ×n and big ones flash the field; surges and storms, which
  passed unseen, get banners, a flash and a shake; arcs are thicker and glow. One test shot: a maxed chain took 81.

Save v26 refunds the tree (its prices and shape changed).

### Snare 14.3: a packed field stays catchable

The owner's next log (14.2, a phone, bubbles, 18 minutes to sector 12): "several things increase the size and number of
packets but that brings in enough reds that ruin the catch, because players can only ignore 2 or so and the scrubbers
aren't enough". The last runs had 432 and then 700 packets on the field, and catches fell to 2 and then 1 a run. Red was
a share of every packet, so each packet node added red too, and Scrubbers forgave a flat 1–2 per loop. Measured on that
build (every node the log bought, sector 12, the phone's 751-unit² field): 44 red, and a full bubble spoiled 41% of the
time. The owner chose both fixes: red now grows with the square root of the packets (the share is of the geometric mean
of what the field holds at the base density and what it holds now), and owning Scrubbers also forgives one more corrupt
packet per 20 good ones inside. On the same build: 15 red, a full bubble spoiled 1% of the time with Scrubbers 2 and
54% without, so red still matters and Scrubbers answer it. Early sectors are unchanged (about 2 red at sector 3).

## Snare 15: bubbles are the way to catch

The owner, after playing the bubble prototype: "I want to move forward with the bubbles, so we need to adjust all the skills
to align with the change; make sure all references and mechanics are aligned", plus two calls: sector 1 has one red packet
to teach red, and tips and new threats wait until a bubble is let go, so a tip card never costs a held bubble. Asked how
each loop-only mechanic should become a bubble one, the owner chose:

- **The wire stays for the boss**: two loops round it still stun it, and flicks still slash, parry, spoof and ram. Every
  other loop job is the bubble's: let go over a Rogue AI core to quarantine it, over a stunned Antivirus to hijack it, over
  only red for Garbage Collection.
- **Boss mines are bubbled, then flicked**: a bubble let go over a mine grabs it (it stops linking and shielding) for 5 s;
  a flick from it at the boss throws it for 3 damage through the guard and the shield, and the boss reels 1 s. Not thrown
  in time, it goes live again. Defuse at its last level grabs the nearest other too.
- **Fork Bomb → Split**: a full bubble let go forks into two smaller ones (three at level 2) that catch half a second later
  at their own multiplier times the first's; red in one spoils only that one, at no Focus cost.
- **Starburst → Supernova**: a bubble let go while the field is frozen bursts 35% wider: everything good in it ×2 (×3 at 2)
  on top of the bubble's multiplier, red there deleted, mines cleared.
- **The wire-only stats became bubble stats**: Long Wire is Bigger Buffers (full bubbles 25% bigger), Steady Hand's loops
  closing sooner is bubbles growing 25% faster, and Race Condition is a full bubble held still, its multiplier climbing
  until you let go (moving it starts the count again).

Every demo plays bubbles; the first card and a red-packet tip teach them. New threats (Antivirus, Full Scans, Rogue AI
cores, the boss) wait for the pen to lift, for at most 4 s of holding. The tools' bot plays bubbles too: it beats the boss
line about a sector later than the loop bot did, since holding a bubble catches less per second of Focus than a quick
loop; real players with the tree's Focus nodes are well clear of it. Save v27 refunds the tree.

## Review rounds (Snare 15.1 onward)

Three blind reviewers a round (Fable, Opus, Sonnet) play the build and score it against `design/review-rubric.md`.
Round 1 (Snare 15): gameplay 6.3, clarity 6.2, pacing 5.5, design 6.7, visuals 6.8, tutorials 6.3, engagement 6.2. Their
shared complaints and what 15.1 did about them:

- **Sector 1 was nearly empty** (9 packets, many drifting off): density 0.13 → 0.2 (16 on a first field), Focus 14 → 18 s,
  the first goals 20 / 35 / 55 / 80.
- **Antivirus pops took 2 s each from a 14 s clock, unannounced**: a popped bubble costs 1 s; a hunting Antivirus closing on
  your bubble draws a dashed red line and a !.
- **The first boss was lost to the clock**: its arrival adds 14 s (8), Focus doesn't drain while it reels, and the end card
  names what helps (Attention Span, Kernel Panic, Root Access). The boss tip is three numbered steps.
- **Tips at bad moments** (the red tip a second after Start, tips over a catch's pop, three in 8 s): tips wait 1 s after a
  catch and 3 s after the last one closed; the red packet's waits for your first catch.
- **Tree text that didn't match** (Checksums "28%" did 15%, previews that rounded to no change or showed none on sector 1,
  Overclock "of undefined"): the red-packet nodes say 8% / 15% a unit, previews read a sector with red to one decimal,
  endless nodes say so, and a buy button says what's still needed.
- **Desktop**: a still left-click hold grows a bubble (the right button always does); toasts in the bay sit at the foot of
  the screen; the field dims under cards; a bubble held at the end is let go and pays; red packets keep their size and wear
  a halo on a full field; a bubble's rings stop at 40 good packets; at most 8 laser numbers at once.
