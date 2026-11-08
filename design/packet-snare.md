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
