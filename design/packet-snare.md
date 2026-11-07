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

## Next slices

1. **Playtest the second pass:** does closing feel easy, does the preview make big loops a decision, is the first run
   short enough, do the abilities change how you play? Tune `SNARE` and the tree's prices from the log.
2. **The record links to the lab:** the best haul raises the Data crawler's yield per collection (the rule: automation
   converts, never creates).
4. **Active defense:** slash through a Firewall with a quick stroke before it breaks your net.
5. **The best net as passive income** between visits, and the Rogue AI's story beats (leaving a core alone as a deliberate
   freedom choice, never a missed loop).
6. **The sim** plays it (a time share and a simple loop policy, from the first log with `snare` events).
