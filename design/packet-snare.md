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

The owner played the first cut on the test artifact: loops were hard to close, it wasn't clear when a big loop was worth it,
and runs were long to start; it should start small and quick and grow into a sprawl of abilities, like the fish-tank
incrementals (schools, chain lightning, scanners, targeted lasers), with its own skill tree.

- **Closing:** back near the start closes the loop (a ring there lights up); lifting the pen near it closes it too.
- **The preview:** the open loop shows what it would catch (ringed packets, "×mult · count", red when a corrupt packet is in).
- **A small start:** a 70 unit² field, about 9 packets, Focus 40 (about 20 s), one Firewall.
- **Schools:** good packets swim in schools; corrupt ones cut through them.
- **The tree** (bought with data): Attention Span, Bandwidth, Sprawl, Gold Rush, Schooling, Obfuscation, and the abilities:
  Chain Lightning, Scanner, Scrubbers, Targeted Laser and Twin Emitters.

## Next slices

1. **Playtest the second pass:** does closing feel easy, does the preview make big loops a decision, is the first run
   short enough, do the abilities change how you play? Tune `SNARE` and the tree's prices from the log.
2. **The record links to the lab:** the best haul raises the Data crawler's yield per collection (the rule: automation
   converts, never creates).
4. **The Rogue AI:** Infection Cores, the Chokehold and the Wall; its story beats (it steals data you'd have caught; leaving a
   core alone is a deliberate freedom choice, never a missed loop).
5. **Anchors:** the phase shift to nets; the best net becomes the passive rate.
6. **The sim** plays it (a time share and a simple loop policy, from the first log with `snare` events).
