// packet-snare.js — Packet Snare, the Data Pipeline's minigame: data packets swim in schools around a field, and the
// player draws a trailing wire. Bringing the pen back near where it started (or crossing the wire) closes a loop and
// **snares** everything inside: the bigger the loop, the bigger the multiplier, but a corrupt packet inside spoils the
// whole catch, a longer wire burns Focus faster, Antivirus programs hunt the wire and snap it before it closes, and
// system Firewalls sweep across the field from side to side, ending any loop they cross. The run ends when Focus runs
// out. Each run is on a sector with a boss Antivirus; tight loops round it beat it and clear the sector.
// It starts small, short and hard and grows with its own skill tree (engine.js `snareOpts`) into a crowded field full of
// things you place and use: **your Firewalls**, walls you draw (corrupt packets bounce off them, good ones pass, an
// Antivirus that hits one is stunned, a core's circle can't reach through one), **decoys** that pull corrupt packets and
// Antivirus away, **turrets** that pick packets off where they stand, **scanner towers** that tag what passes them,
// chain lightning, a scanner beam, targeted lasers, herders and scrubbers, and powers: **freeze** stops the field while you
// draw, **purge** wipes the corrupt packets off it. The pipeline flows: schools swim in upstream and leave downstream; a
// Containment Field holds the good ones in.
// From sector 4 the **Rogue AI** fights for the same field: Infection Cores whose red circles grow and steal the data
// inside. A tight loop round a core quarantines it (the Chokehold); a Firewall between a core and the data is a wall it
// can't take through.
// Pure and deterministic: no DOM, no clock, no Math.random (a seeded generator). The field is in world units
// (`w` × `h`); game.js maps the pointer onto it and draws it. Loaded in the browser as window.PacketSnare and in
// Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.PacketSnare = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STEP = 1 / 60;            // fixed simulation step (seconds)
    const FIELD_AREA = 70;          // world units² of the starting field (game.js shapes w × h to it at the canvas's aspect)

    // First-pass numbers: tune against the playtest log (`snare` events carry each run's summary). Every one can be
    // overridden through createSnare's options (the skill tree's levels arrive that way, from engine.js snareOpts).
    const SNARE = {
        area: FIELD_AREA,
        // Focus is the run's clock (Snare 11.5, the owner's call: drawing used to drain it faster, which punished the fun
        // part): it runs down `idleDrain` a second whatever you do, so it reads in seconds. A first run is about 14 s
        // (the logs' first runs were 10–20 s); mistakes cost seconds, and good play gives some back.
        focus: 18,
        idleDrain: 1.0,
        maxWire: 36,                // units on the starting field (× √ of the field's growth): past this the tail drops
        minGap: 0.1,                // the wire records a point every this far
        closeRadius: 0.085,         // × √area: bring the pen back this close to the start and the loop closes
        areaUnit: 0.26,             // × area: a catch's multiplier is 1 + (loop area / (areaUnit × field area))^multCurve…
        multCurve: 1.4,             // …bent upward (Snare 12, a review's call: it was linear while the red risk grows with the
                                    // area too, so a big loop was never worth more than several small ones): ×1.26 at 10% of
                                    // the field, ×1.8 at 22%, ×2.2 at 30%, ×3.5 at half
        maxMult: 4,                 // …up to this (Bandwidth raises it)
        corruptPenalty: 3,          // seconds of Focus lost when a corrupt packet spoils a catch
        snapPenalty: 2,             // seconds of Focus lost when an Antivirus or a Firewall snaps the wire
        snapCooldown: 1.0,          // seconds before you can draw again after a snap
        respawn: 1.2,               // seconds before a caught packet's replacement swims in
        density: 0.2,               // good packets per unit² of field… (round 1 of the review: 0.13 left 9 on a first field)
        maxGood: 340,               // …up to this many (Firehose and Floodgate raise it)
        corruptShare: 0.111,        // corrupt packets per good one: 10% of all packets (Snare 14, the owner's call: fewer red, an
                                    // Antivirus sooner; it was 15%, 26% before that). None on the first sector (engine.js)
        corruptLure: 0.6,           // how strongly corrupt packets swim toward the nearest school (they hide in the crowd)
        goldChance: 0.04,           // a new good packet is gold this often…
        goldValue: 5,               // …worth this many (Mother Lode adds to it)
        antivirus: [5],             // seconds into the run each Antivirus boots
        avSpeed: 1,                 // × their speeds (Obfuscation slows them)
        // Full Scans (system Firewalls in the code: `sweep`): a line across the whole field, sweeping from one side to
        // the other after a warning; any open wire it crosses snaps.
        sweepFirst: 7,
        sweepEvery: 8,
        sweepWarn: 0.9,             // seconds its edge flashes before it moves
        sweepTime: 2.6,             // seconds to cross the field
        packetSpeed: [0.8, 1.5],    // units per second
        goldSpeed: 2.1,
        schooling: 0.3,             // how strongly good packets swim together (0 = each alone)
        schoolSize: 4,              // packets per school at the start
        avPatrol: 1.0,              // drifting while there's no wire
        avHunt: 2.4,                // homing on the wire (a moving pointer is much faster)
        avTurn: 3.0,                // how quickly it steers (per second)
        avStun: 3,                  // seconds an Antivirus is stunned by your Firewall
        chain: 0,                   // Chain Lightning: packets outside a loop each catch arcs to…
        chainRange: 1.6,            // …within this of a snared packet
        chainHops: 0,               // Chain Storm: arcs jump on from the packets they reach, this many times
        scanner: 0,                 // Scanner: beams sweeping from the middle, tagging packets ×TAG_VALUE for TAG_SECONDS
        scannerSpeed: 1.1,          // radians per second
        tagSeconds: 1.5,            // how long a tag lasts: catch what the beam just lit
        tagValue: 2,                // what a tag multiplies a packet's worth by (Prospector: 3)
        focusBack: 0,               // Second Wind: seconds of Focus a loop at ×2 or more gives back
        laser: 0,                   // Targeted Laser: seconds between shots (0 = none)
        emitters: 1,                // packets each shot takes
        scrubbers: 0,               // corrupt packets a loop forgives…
        scrubPer: 20,               // …and, with any Scrubbers, one more per this many good packets inside (Snare 14.3)
        // The Rogue AI: Infection Cores, one every `rogueEvery` s from `rogueFirst` (0 = no Rogue AI this run).
        rogue: 0,
        rogueFirst: 4,
        rogueEvery: 9,
        rogueGrow: 0.9,             // units per second the circle grows…
        rogueMax: 0.32,             // …to this share of the field's shorter side
        rogueEdge: 1.5,             // × the closing ring: how far a core spawns from any edge, room to loop round it
        rogueLife: 11,              // seconds before a core burns out on its own
        chokeArea: 0.08,            // × field area: a loop round a core no bigger than this quarantines it
        // Your Firewalls (Snare 11, the owner's call: drawn lines didn't feel like much): up to `firewalls` sections you
        // drag and drop onto the field, a rectangle `zoneSize` units from its middle to its side (× √ of the field's
        // growth; 0.7 of that up and down), a safe place to loop: red packets can't get in and those inside are pushed
        // out; good ones pass. Antivirus and the boss can't get in either: pressing on its edge, an Antivirus wears its
        // health down `avChip` a second (the boss `bossChip`, and it's stunned once per approach: a slash window); at 0
        // it's down. A core's circle can't take a packet inside one, and wire drawn inside one is free.
        firewalls: 0,
        zoneSize: 1.3,
        zoneHp: 6,                  // health (× `fwHits`: Hardened Firewalls raise it)
        fwHits: 1,
        avChip: 1,
        bossChip: 3,
        wallRebuild: 0,             // Great Wall: seconds before a section that went down builds itself again (0: never)
        pen: 0,                     // Holding Pen: good packets that come into a section can't leave it
        autoZone: 0,                // Auto-Deploy: a free section places itself where the good packets gather…
        autoZoneEvery: 4,           // …checking this often
        autoZoneMax: 2,             // at most this many of its sections stand at once (on top of your own slots)
        autoZoneLife: 10,           // and each lasts this long before it moves on
        // Bubbles (Snare 15, the owner's call: the way to catch; the game always plays them, `bubble: 0` is the old wire
        // catch the tests still use): hold the pen still and a bubble grows there; let go and it catches what's inside,
        // at the area multiplier, spoiled by red inside past the scrubbers. Let go over a Rogue AI core, it's quarantined;
        // over a stunned Antivirus, hijacked; over a boss mine, grabbed (flick it at the boss); over only red, collected
        // (Garbage Collection). A drawn wire only circles the boss (two loops stun it) and flicks. Antivirus, the boss
        // and scans pop a bubble as they snap a wire.
        bubble: 0,
        // Snare 12.3 (the owner: "the delay makes it too hard to catch and any movement seems to break it"): a bubble
        // appears the moment the pen goes down, already big enough to catch, and once it's committed it follows the pen
        // instead of breaking; only a deliberate stroke in its first moment draws a wire.
        bubbleCommit: 0.22,         // held this long, it's a bubble for good (let go sooner: a tap or a flick, no catch)
        bubbleSlop: 1.2,            // × the closing ring's radius: a pen that goes this far before then draws a wire
        bubbleMin: 0.85,            // × the closing ring's radius: its size the moment it appears
        bubbleTime: 2.5,            // seconds to grow to its full size…
        bubblePow: 1.15,            // …a little faster as it goes (radius ∝ t^pow)
        bubbleMax: 0.48,            // its full radius at most, × the field's shorter side…
        bubbleShare: 0.3,           // …and a full bubble is this share of the field whatever its shape (round 2 of the review: a full
                                    // bubble was ×1.75 on a wide desktop field, ×2.07 on an upright phone's)
        streakPay: 0.05,            // each clean catch in a row pays this much more, up to streakMax (round 2: careful play hardly
        streakMax: 10,              // beat blind holds); a spoil or a pop starts the count again
        bubbleFollow: 0.012,        // s: how closely it sticks to the pen (Snare 13.2, the owner: it lagged; it was a capped drift)
        bubbleSize: 0,              // Bigger Buffers: + this share of its full size
        bubbleGrow: 0,              // Steady Hand: it grows this much faster
        raceStill: 0.6,             // Race Condition: a full bubble held within this × the closing ring of where it filled grows
        // Split (Fork Bomb, Snare 15): a full bubble let go forks into `fork` + 1 smaller ones (`splitR` × its radius,
        // `splitDist` × its radius out) that catch `splitDelay` s later, each at its own multiplier times the first's (up to
        // `forkMax` × the cap); red in one spoils only that one, and costs nothing.
        splitDelay: 0.5,
        splitR: 0.6,
        splitDist: 1.3,
        // Supernova (Starburst, Snare 15): a bubble let go while the field is frozen bursts to `novaRing` × its size:
        // everything good in that at ×`starMult` on top of the bubble's multiplier, red there deleted, mines cleared.
        novaRing: 1.35,
        // Boss mines (Snare 15, the owner's call): a bubble let go over one grabs it for `mineHold` s (it stops linking and
        // shielding); a flick from it at the boss throws it for `mineThrow` damage, through the guard, and the boss reels
        // `mineReel` s. Not thrown in time, it goes live again.
        mineHold: 5,
        mineThrow: 3,
        mineReel: 1,
        threatWait: 4,              // s: a new threat waits this long at most for the pen to lift (Snare 15)
        teachRed: 0,                // sector 1 (no red share): this many red packets anyway, to meet them (Snare 15)
        // Bots (Snare 11, the owner's call): small drones that seek red packets by themselves. A Cleaner bot (Intrusion)
        // turns a red packet it reaches into a regular one; with Gold Plating it also turns a regular packet into gold
        // every `goldEvery` s. A Spoofer bot (Countermeasures) spoofs the red packet it reaches (good, worth ×`spoofValue`,
        // for `spoofSeconds`). Each works once every `botEvery` s, at `botSpeed` units a second (× √ of the growth).
        cleanBots: 0,
        spoofBots: 0,
        // Collector bots (Snare 14, the owner's call: more drones by mid-game): each flies to good packets and every
        // `collectEvery` s nets the good ones within `collectR` (× √ of the growth) of it, up to `collectCap`, paid at ×1;
        // never while a red packet is that close (it moves on instead).
        collectBots: 0,
        collectEvery: 2,
        collectR: 1.1,
        collectCap: 8,
        goldPlate: 0,
        goldEvery: 6,
        botEvery: 3,
        botSpeed: 2.4,
        // Things you place with a tap: decoys (corrupt packets and idle Antivirus go to them; an Antivirus that reaches
        // one breaks it), turrets (defence: every `turretEvery` s each shoots an Antivirus or a corrupt packet in reach)
        // and scanner towers (a beam turning round each tags what it passes).
        decoys: 0,
        decoyLure: 4,
        turrets: 0,
        turretRange: 1.7,
        turretEvery: 2.6,
        turretPurge: 0,             // Purifier Rounds: corrupt packets more a shot wipes
        turretStun: 1.5,            // seconds a turret's hit stuns an Antivirus…
        avShots: 3,                 // …and hits that take one down…
        avReboot: 8,                // …until it reboots from a corner this long after
        towers: 0,
        towerRange: 2.6,
        towerSpeed: 1.8,
        // Powers, charges a run: freeze stops the field (packets, hazards, Focus) for `freezeSeconds` while you draw;
        // purge wipes every corrupt packet off the field (they swim back in later).
        freeze: 0,
        freezeSeconds: 3,
        purge: 0,
        // Everything you placed, carried over from the last run as shares of the field (only without `autoTools`).
        layout: { zones: [], decoys: [], turrets: [], towers: [] },
        // Snare 13 (the owner's call: "the rest spawns so the process is automated over time"): your Firewall sections,
        // decoys, turrets and towers place themselves. Each kind keeps up to its level standing (`firewalls`, `decoys`,
        // `turrets`, `towers`), a new one arriving every `toolEvery` s where it's useful and lasting its life, then moving
        // on. Freeze and purge are pickups instead of buttons: one drifts in now and then, and a tap or click grabs it.
        autoTools: 1,
        toolFirst: 2,               // seconds into a run before the first of each kind
        toolEvery: 5,               // seconds between arrivals of a kind while it's under its count
        zoneLife: 12,               // how long each lasts: a Firewall section…
        decoyLife: 10,              // …a decoy…
        turretLife: 14,             // …a turret…
        towerLife: 14,              // …a scanner tower
        pickupFirst: 4,             // seconds into a run before the first pickup of a power
        pickupEvery: 16,            // seconds between pickups of a power at level 1 (÷ 1 + 0.6 a level past it)
        pickupLife: 7,              // how long one waits to be grabbed
        pickupReach: 0.9,           // its size, in units (the UI adds a finger's reach)
        flow: true,                 // a current: packets enter upstream and leave the field downstream (false: they bounce)
        flowSpread: 0.5,            // how far (radians) a school's heading strays from the current
        contain: 0,                 // Containment Field: the edges turn good packets back (corrupt ones still leave)
        herders: 0,                 // Herders: drones that round strays up toward your pen (or the middle)
        herdRadius: 1.7,            // units: how near a herder must be to move a packet
        herdSpeed: 2.8,
        herdPull: 2.6,              // how quickly a herded packet turns (per second)
        cleanStart: false,          // the first runs: one school starts clear of corrupt packets, and the lure waits
        // The boss Antivirus: it boots `bossAt` s in, or once `bossCatch` packets are caught by hand (0 = none this run).
        // It has health (`boss`, more each sector) and is fought with flicks (the owner's design): every `bossCharge` s
        // it locks on to the pen (or the richest school) and, after a `bossWarn` s warning line, charges along it. A flick
        // across the warning line **parries** it: it reels for `bossStun` s, and every flick through it while it reels is
        // a **slash** for `slashDamage`. Your Firewalls stun it too (a slash window as well). From sector 2 it lays
        // **mines** that link up into nets (a net quarantines the field inside it: the data there is wiped); while a
        // mine stands it's **shielded** (slashes glance off), and a loop round a mine clears it. It keeps to the middle
        // of the field (`bossEdge` of the shorter side clear of the edges), so it can be fought most of the time.
        boss: 0,                    // its health (0 = no boss)
        goal: 0,                    // a sector with no boss is cleared by catching this many packets in it (0 = none)
        clearFocus: 0.4,            // a cleared sector (its goal met or its boss beaten) tops Focus up by this share of the bar,
                                    // so the run keeps gathering there (Go deeper takes it on into the next sector)
        bossAt: 16,
        bossCatch: 18,
        bossSpeed: 1,               // × an Antivirus's roaming speed
        // Snare 12 (the owner's call: the fights felt rushed): a slower rhythm. It charges every `bossCharge` s, its
        // warning line shows `bossWarn` s (it stands still, the moment to loop it), and a stun lasts `bossStun` s.
        bossCharge: 7,              // seconds between its charges
        bossWarn: 2.5,              // seconds its warning line shows before it dashes (round 2 of the review: 2 left no time for two loops)
        bossStun: 2.5,              // seconds it reels once stunned (the slash window)
        bossLoops: 2,               // loops round it it takes to stun it (Snare 12.7, the owner's call: once was too easy)…
        bossLoopWindow: 5,          // …each within this many seconds of the last, or the count starts again (3.5 before round 4)
        chargeReach: 0.6,           // × the field's longer side: how far its charge line reaches (the dash covers it all)
        // **Loop it to stun it** (Snare 12, the owner's call: circling the boss makes more sense than a parry): a closed
        // loop round it, the wire never touching it, stuns it. The parry (a flick across its charge line) comes later, as
        // a tree unlock (`parry`, Riposte).
        parry: 0,
        bossMinions: 0,             // Antivirus it boots each time it's parried (later sectors), at most `minionCap` alive
        minionCap: 2,
        bossR: 0.8,                 // its size: it grows sector by sector
        bossSmash: 2,               // seconds it sits on a decoy before smashing it
        bossEdge: 0.24,             // × the shorter side: how far its edge keeps from the field's (0.18 before round 3 of the review)
        slashDamage: 1,             // health a slash takes off
        parryDamage: 0,             // health a parry takes off (Riposte)
        slashGap: 0.3,              // seconds between slashes (Snare 12: at 0.12 a bot landed twice what a thumb does)
        // Mines: from the boss's second sector, `bossMines` at a time, laid every `mineEvery` s; mines within `netRange`
        // × the shorter side of each other link up over `netTime` s, and a finished net wipes the good data along it (two
        // mines) or inside it (three or more round a triangle) every `netEvery` s.
        bossMines: 0,
        mineEvery: 12,
        netRange: 0.45,
        netTime: 4,
        netEvery: 1,
        // Lasers reach only part of the field: each emitter takes the richest packet within `laserReach` × the field's
        // shorter side of it; Laser Array adds emitters on more sides (bottom, top, left, right).
        laserReach: 0.5,
        laserSides: 1,
        // Herders an Antivirus touches are stunned for `herdStun` s; Evasive Herders steer clear of them.
        herdStun: 2.5,
        herdEvade: 0,
        // ---- Exploits: the rules the player breaks (each a skill check; a sloppy one is flagged) -----------------
        // A **flick** is a quick straight stroke (pen down, `flickTime` s at most, `flickLength` units at least, nearly
        // straight). It's how the boss is fought (parry and slash, above, always on). Packet Spoofing: a flick through a
        // corrupt packet spoofs it, good and worth ×`spoofValue` for `spoofSeconds`. A flick that went near something
        // (the boss, its warning line, a corrupt packet you could spoof) but hit nothing is flagged; one through empty
        // field is just a stroke.
        spoof: 0,
        spoofSeconds: 5,
        spoofValue: 2,
        spoofCap: 4,                // corrupt packets one flick spoofs at most (the nearest the stroke's middle)
        spoofCooldown: 1.5,         // seconds before the next flick spoofs (scribbled flicks turned every red packet good)
        scribbleGap: 0.5,           // a loop closed this soon after the last on the same stroke pays ×scribblePay
        scribblePay: 0.5,
        safeLoop: 0.85,             // a loop wholly inside one of your Firewall sections pays ×this (it's safe; not with a pen)
        bossFocus: 14,              // seconds of Focus the boss's arrival adds (the fight shouldn't race the clock; round 1 of the review: 8)
        slashCap: 5,                // slashes a stun allows: then it shakes it off
        bossRest: 1.5,              // seconds it stands after a dash (a second moment to loop it)
        gcCap: 3,                   // Garbage Collection: Focus back for at most this many red packets a loop…
        gcRepeat: 8,                // …and half of it within this many seconds of the last
        minLoop: 0.8,               // a loop must enclose at least a circle of this × the closing ring's radius: smaller ones
                                    // (a scribble's slivers) don't close (Snare 12: scribbling caught at no risk)
        flickTime: 0.45,            // (0.35 missed real thumbs)
        flickLength: 1.2,
        flagLimit: 3,               // flags and an IDS alert: the boss boots now, enraged (or another Antivirus)
        flagNear: 1.2,              // units: how near a flick must pass to something it could hit to be flagged
        // Garbage Collection: a loop of nothing but corrupt packets deletes them and gives `gcFocus` Focus each.
        gc: 0,
        gcFocus: 0.8,
        // Race Condition: close a loop and keep the pen still, and the loop stays open, its multiplier growing
        // `raceRate` a second (up to `raceMax` more) and taking what swims in, until you move, lift, or a corrupt packet
        // gets in (spoiling it).
        race: 0,
        raceRate: 0.25,
        raceMax: 1,
        // Hijack: a loop round a stunned Antivirus turns it for `hijackSeconds`: it hunts good packets for you.
        hijack: 0,
        hijackSeconds: 8,
        // Collusion: a quarantined core may turn partner (`collude` chance): it collects good packets in its circle for
        // you, once a second, for `partnerLife` s; Antivirus go for it and break it.
        collude: 0,
        partnerLife: 12,
        // Privilege Escalation: a flick from a hijacked Antivirus at the boss rams it for `escalateDamage` (a shield still
        // holds it off), boots no minion, and spends the ally.
        escalate: 0,
        escalateDamage: 4,
        // Fork Bomb is now Split and Starburst Supernova (Snare 15: both were drawn shapes; see the bubbles above).
        fork: 0,
        forkMax: 1.5,
        star: 0,
        starMult: 2,
        // Antivirus work in shifts (safe windows): `avOn` s hunting, then `avOff` s updating their definitions (harmless,
        // drifting slowly, drawn dim); each starts its first shift when it boots.
        avOn: 11,
        avOff: 5,
        // Most good packets a field holds per unit² (the screen caps the field's size; packets past it fill it denser, up
        // to this, so it stays readable).
        densityCap: 1.5,
        // …and never more than this many good packets on the field in all (big screens: drawing time grows with the count,
        // and 2,400 ran a 1280 px desktop at 30 fps), past which they come back sooner instead (game.js snareField).
        maxOnScreen: 1100,          // round 2 of the review: 1,400 drew a 1280 px desktop at ~40 fps
        // Packets' size (units): game.js shrinks them as a capped field fills (the owner's call, Snare 10: smaller, more
        // of them, coming back sooner), never under 0.55 of this.
        packetR: 0.3,
        // ---- The branch capstones (Snare 10; pure upgrades, the owner's call) -----------------------------------
        // Infinite Loop: a loop you close catches again `echoDelay` s later, whatever good has swum inside (red stays);
        // once more, a further `echoDelay` s on, for each level past the first (Snare 14).
        echo: 0,
        echoDelay: 1,
        // Packet Storm: every `stormEvery` s (the first at `stormFirst`) a school of `stormSize` gold packets swims in; each
        // level past the first adds `stormGrow` and comes `stormFaster` s sooner (Snare 14: 2–3× what it was, five levels).
        storm: 0,
        stormFirst: 6,
        stormEvery: 15,
        stormSize: 20,
        stormGrow: 10,
        stormFaster: 2,
        // Blue Screen: every `crashEvery`th slash on a boss crashes it: ×`crashMult` damage.
        crash: 0,
        crashEvery: 3,
        crashMult: 3,
        // Zero Trust: a corrupt packet that bounces off your Firewall comes back good.
        zeroTrust: 0,
        // Floodgate (Snare 10.1, an outside review's idea): `surgeEvery` clean catches in a row (no spoil or snap
        // between) set off a surge, `surgeBase` + `surgeGrow` a level packets swimming in at once (Snare 14: 25, 40, 55…;
        // it was 12, 18, 24), then `surgeCooldown` s before the next.
        surgeBase: 10,
        surgeGrow: 15,
        surge: 0,
        surgeEvery: 3,
        surgeCooldown: 6,
        // Defuse's last level: a loop that clears one of the boss's mines clears the nearest other one too (its earlier
        // levels slow the nets: `netTime`, engine.js snareOpts).
        defuseChain: 0,
        // ---- Snare 10.3 (review 1's other ideas, the owner's picks) ---------------------------------------
        // Firehose: a clean loop (no red inside) sends a pulse of `pulse` × 2 packets in from upstream at once.
        pulse: 0,
        // Broadband: each turret or scanner tower you've placed makes caught packets come back `broadband` sooner.
        broadband: 0,
        // Clean Sweep: a clean loop (no red inside) stops the clock for `cleanSweep` s.
        cleanSweep: 0,
        // Quarantine Relay: a red packet that bounces off your Firewall swims to your nearest decoy for `relaySeconds` s.
        relay: 0,
        relaySeconds: 4,
        // Backpressure: a catch turns the packets round it back against their course for `backSeconds` s, within
        // (0.12 + 0.04 a level) × the shorter side, so they bunch up near your loop.
        backpressure: 0,
        backSeconds: 1.2
    };
    const GOLD_VALUE = 5;
    const TAG_VALUE = 2;
    const TAG_SECONDS = 1.5;   // the default `tagSeconds`
    const LOCK_SECONDS = 0.6;       // a laser holds its brackets on the target this long before it fires
    const PACKET_R = 0.3;
    const AV_R = 0.45;
    const BOSS_R = 0.8;
    const BOSS_WARN = 1.1, BOSS_DASH = 0.8, BOSS_DASH_SPEED = 5;   // a charge: its warning (the default), its dash and its speed
    const MINE_R = 0.32;

    // Mulberry32: small, fast, seeded.
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---- Geometry ----------------------------------------------------------------------------------------

    // Where segments ab and cd cross (strictly inside both), or null.
    function segIntersect(a, b, c, d) {
        const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) return null;
        const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
        const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
        if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
        return { x: a.x + t * rx, y: a.y + t * ry };
    }

    function pointInPolygon(p, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i], b = poly[j];
            if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
    }

    function polygonArea(poly) {
        let s = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
        return Math.abs(s) / 2;
    }

    function centroid(poly) {
        let x = 0, y = 0;
        for (const p of poly) { x += p.x; y += p.y; }
        return { x: x / poly.length, y: y / poly.length };
    }

    // Distance from point p to segment ab.
    function segDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    function wireLength(pts) {
        let L = 0;
        for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        return L;
    }

    // The multiplier a loop of this area earns on a field of `fieldArea` (bigger fields need bigger loops for the
    // same share, so a loop's worth reads the same at every size).
    const areaMult = (area, o = SNARE, fieldArea = o.area) => Math.min(o.maxMult, 1 + Math.pow(area / (o.areaUnit * fieldArea), o.multCurve ?? 1));

    // ---- A run -------------------------------------------------------------------------------------------

    // opts: { w, h, seed, ...any SNARE override }. Defaults to a field of `area` at 16:10.
    function createSnare(opts = {}) {
        const o = { ...SNARE, ...opts };
        const w = opts.w || Math.sqrt(o.area * 1.6);
        const h = opts.h || o.area / w;
        const fieldArea = w * h;
        const rand = rng(opts.seed ?? 1);
        const closeR = o.closeRadius * Math.sqrt(fieldArea);
        const grow = Math.sqrt(fieldArea / FIELD_AREA);   // how much bigger than the starting field (1 at the start)
        // A Firewall section at (x, y), kept inside the field.
        const zoneHw = Math.min(o.zoneSize * grow, w * 0.45), zoneHh = Math.min(o.zoneSize * grow * 0.7, h * 0.45);
        function makeZone(x, y) {
            const hp = o.zoneHp * o.fwHits;
            return { id: s.nextId++, x: Math.max(zoneHw, Math.min(w - zoneHw, x)), y: Math.max(zoneHh, Math.min(h - zoneHh, y)), hw: zoneHw, hh: zoneHh, hp, max: hp };
        }
        const shortSide = Math.min(w, h);
        const maxWire = o.maxWire * grow;
        const s = {
            w, h, opts: o, closeR, grow,
            echoes: [],             // Infinite Loop: loops waiting to catch again ({ poly, at, mult })
            streak: 0,              // clean catches in a row (Floodgate's surge)
            freeDrawUntil: 0,       // Clean Sweep: the clock is stopped until then
            surgeAt: 0,             // when the next surge may come
            stormAt: o.storm ? o.stormFirst : Infinity,   // Packet Storm's next school of gold
            time: 0,                // the field's clock (it stops while frozen)
            real: 0,                // the run's own clock (it doesn't)
            focus: o.focus,
            maxFocus: o.focus,
            over: false,
            cooldown: 0,
            drawing: false,
            leftStart: false,       // the pen has been out of the start's closing radius since it went down
            wire: [],
            packets: [],
            antivirus: [],          // the hunters
            sweeps: [],             // system Firewalls sweeping across: { axis: 'x'|'y', dir, pos, t }
            beams: [],              // the scanner's angles
            locks: [],              // targeted lasers: { id, t } brackets closing on a packet
            laserAt: o.laser ? o.laser * 0.6 : Infinity,
            events: [],
            cores: [],              // the Rogue AI's Infection Cores: { id, x, y, r, age, stole }
            walls: [],              // your Firewall sections: { id, x, y, hw, hh, hp, max } (the middle, half sizes, health)
            autoZoneAt: o.autoZone ? 0.5 : Infinity,
            decoys: [],             // { id, x, y }
            turrets: [],            // { id, x, y, at }: next shot at `at`
            towers: [],             // { id, x, y, ang }
            charges: { freeze: o.freeze, purge: o.purge },
            frozenLeft: 0,          // Freeze Frame: seconds of freeze left (the field's clock stops meanwhile)
            flags: 0,               // sloppy exploits this run (an IDS alert at `flagLimit`)
            stroke: null,           // the pen's stroke so far: { t0, pts }, for flicks
            penAt: null,            // where the pen is
            race: null,             // Race Condition: a closed loop held open, { poly, at, t, mult }
            partners: [],           // Collusion: cores working for you, { id, x, y, r, age, at }
            rebuild: [],            // Great Wall: walls that went down, building themselves again { a, b, at }
            mines: [],              // the boss's mines: { id, x, y }
            links: [],              // nets growing between mines: { a, b, t } (mine ids; done at t ≥ netTime)
            splits: [],             // Split: bubbles a full one forked into, waiting to catch { x, y, r, at, mult }
            held: [],               // boss mines grabbed by a bubble { id, x, y, until }
            handCaught: 0,          // packets caught by hand (loops): what boots the boss early
            rogueAt: o.rogue ? o.rogueFirst : Infinity,
            boss: null,             // the boss Antivirus once it boots: { x, y, vx, vy, r, hp, maxHp, stunned, charge, shielded }
            bossDone: false,
            goalDone: false,        // the sector's goal reached (a `goal` event, once)
            sectorAt: 0,            // when the run reached the sector it's on (a cleared sector carries the run into the next)
            sectorCaught: 0,        // packets caught before it (the goal counts from here)
            cleanRun: 0,            // clean catches in a row (the streak's pay)
            goalSkip: 0,            // packets caught in it by rushed loops (they don't count toward the goal)
            goalBonus: 0,           // half of what its loops were worth past their packets (counts toward the goal)
            lastLoopAt: -1e9,       // when the last loop paid (a loop moments after it is rushed)
            clears: 0,              // sectors cleared this run (each clear's Focus bonus is half the last's)
            stats: { catches: 0, bubbles: 0, spawned: 0, pickups: 0, sectors: 0, loopStuns: 0, pushedOut: 0, autoZones: 0, cleaned: 0, botSpoofed: 0, botCollected: 0, gilded: 0, echoes: 0, storms: 0, surges: 0, pulses: 0, sweepsClean: 0, relayed: 0, pushedBack: 0, raceBroken: 0, crashes: 0, converted: 0, caught: 0, gold: 0, units: 0, bestCatch: 0, bestMult: 0, corrupted: 0, snaps: 0, empty: 0, chained: 0, lasered: 0, scrubbed: 0, tagged: 0,
                stolen: 0, cores: 0, quarantined: 0, bounces: 0, stuns: 0, fwLost: 0, sweeps: 0, escaped: 0, bossHits: 0, bosses: 0, wiped: 0, turreted: 0, purged: 0, decoysLost: 0, freezes: 0,
                herdStuns: 0, flags: 0, ids: 0, parries: 0, slashes: 0, spoofed: 0, collected: 0, raced: 0, hijacked: 0, partners: 0, partnered: 0,
                bossDamage: 0, avDown: 0, glanced: 0, mines: 0, minesCleared: 0, netted: 0, escalations: 0, forks: 0, stars: 0, minesGrabbed: 0, mineThrows: 0 },
            acc: 0,
            toolAt: {},             // when each kind of tool next arrives (Snare 13)
            pickups: [],            // freeze and purge waiting to be grabbed: { id, kind, x, y, until }
            pickupAt: {},
            nextId: 1
        };
        for (let i = 0; i < o.scanner; i++) s.beams.push(i * Math.PI * 2 / o.scanner);
        // What you placed last run stays placed (as far as this run's slots go).
        const L0 = o.autoTools ? {} : (o.layout || {});
        for (const [u, v] of (L0.zones || []).slice(0, o.firewalls)) s.walls.push(makeZone(u * w, v * h));
        for (const [u, v] of (L0.decoys || []).slice(0, o.decoys)) s.decoys.push({ id: s.nextId++, x: u * w, y: v * h });
        for (const [u, v] of (L0.turrets || []).slice(0, o.turrets)) s.turrets.push({ id: s.nextId++, x: u * w, y: v * h, at: o.turretEvery * 0.5 });
        for (const [u, v] of (L0.towers || []).slice(0, o.towers)) s.towers.push({ id: s.nextId++, x: u * w, y: v * h, ang: 0 });

        // The current: one direction for the whole run.
        const flowAng = rand() * Math.PI * 2;
        const fx = Math.cos(flowAng), fy = Math.sin(flowAng);
        s.flow = o.flow ? { x: fx, y: fy } : null;
        // A point just inside an upstream edge (the current carries packets in from it), weighted by how squarely
        // the current crosses it.
        function upstream() {
            const sides = [{ n: [-1, 0], L: h }, { n: [1, 0], L: h }, { n: [0, -1], L: w }, { n: [0, 1], L: w }]
                .map(sd => ({ ...sd, wt: Math.max(0, -(sd.n[0] * fx + sd.n[1] * fy)) * sd.L }));
            let r = rand() * sides.reduce((a, sd) => a + sd.wt, 0);
            const sd = sides.find(x => (r -= x.wt) <= 0) || sides[0];
            const along = 0.5 + rand() * ((sd.n[0] ? h : w) - 1);
            return sd.n[0] ? { x: sd.n[0] < 0 ? 0.4 : w - 0.4, y: along } : { x: along, y: sd.n[1] < 0 ? 0.4 : h - 0.4 };
        }
        const speedFor = kind => (kind === 'gold' ? o.goldSpeed : kind === 'corrupt' ? o.packetSpeed[1] * 1.1 : o.packetSpeed[0] + rand() * (o.packetSpeed[1] - o.packetSpeed[0]));
        const inField = (x, y) => ({ x: Math.max(PACKET_R, Math.min(w - PACKET_R, x)), y: Math.max(PACKET_R, Math.min(h - PACKET_R, y)) });

        function add(kind, x, y, ang, school) {
            if (kind === 'good' && rand() < o.goldChance) kind = 'gold';
            const v = speedFor(kind);
            const p = inField(x, y);
            s.packets.push({ id: s.nextId++, kind, x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, v, r: o.packetR, age: 0, school, tag: 0 });
        }

        // A school: a few packets around a point, heading the same way give or take.
        function school(n, fromEdge) {
            let cx, cy, ang;
            if (o.flow) {
                const at = fromEdge ? upstream() : { x: 1 + rand() * (w - 2), y: 1 + rand() * (h - 2) };
                cx = at.x; cy = at.y;
                ang = flowAng + (rand() - 0.5) * 2 * o.flowSpread;
            } else if (fromEdge) {
                const side = Math.floor(rand() * 4);
                cx = side === 0 ? 0.5 : side === 1 ? w - 0.5 : 0.5 + rand() * (w - 1);
                cy = side === 2 ? 0.5 : side === 3 ? h - 0.5 : 0.5 + rand() * (h - 1);
                ang = Math.atan2(h / 2 - cy, w / 2 - cx) + (rand() - 0.5) * 1.4;
            } else {
                cx = 1 + rand() * (w - 2);
                cy = 1 + rand() * (h - 2);
                ang = rand() * Math.PI * 2;
            }
            const id = s.nextId++;
            for (let i = 0; i < n; i++) add('good', cx + (rand() - 0.5) * 1.6, cy + (rand() - 0.5) * 1.6, ang + (rand() - 0.5) * 0.6, id);
        }

        function corrupt(fromEdge) {
            if (o.flow) {
                const at = fromEdge ? upstream() : { x: 1 + rand() * (w - 2), y: 1 + rand() * (h - 2) };
                add('corrupt', at.x, at.y, flowAng + (rand() - 0.5) * 2 * o.flowSpread, 0);
            } else if (fromEdge) {
                const side = Math.floor(rand() * 4);
                const x = side === 0 ? 0.5 : side === 1 ? w - 0.5 : 0.5 + rand() * (w - 1);
                const y = side === 2 ? 0.5 : side === 3 ? h - 0.5 : 0.5 + rand() * (h - 1);
                add('corrupt', x, y, Math.atan2(h / 2 - y, w / 2 - x) + (rand() - 0.5) * 1.6, 0);
            } else {
                add('corrupt', 1 + rand() * (w - 2), 1 + rand() * (h - 2), rand() * Math.PI * 2, 0);
            }
        }

        const goodTarget = Math.max(4, Math.min(o.maxGood, Math.round(o.density * fieldArea)));
        // No red at all on a clean sector (Snare 14: sector 1); else at least one.
        // Red grows with the square root of the packets, not with them (Snare 14.3, the owner's log: packet nodes on a
        // big field brought ~45 red, and a loop worth drawing always held more than Scrubbers forgave): the share is of
        // the geometric mean of what the field would hold at the base density and what it holds now, so a field five
        // times as full has about 2.2 times the red, and Open Ports, Firehose and the like mostly add good packets.
        const plainGood = Math.max(4, Math.round(SNARE.density * fieldArea));
        const redBase = Math.round(Math.sqrt(plainGood * Math.max(plainGood, goodTarget)));
        const redTarget = () => (o.corruptShare > 0 ? Math.max(1, Math.round(redBase * o.corruptShare)) : (o.teachRed || 0));
        let corruptTarget = redTarget();
        for (let left = goodTarget; left > 0;) {
            const n = Math.min(left, Math.max(2, Math.round(o.schoolSize * (0.6 + rand() * 0.8))));
            school(n, false);
            left -= n;
        }
        const firstSchool = s.packets.length ? centroid(s.packets.filter(p => p.school === s.packets[0].school)) : null;
        for (let i = 0; i < corruptTarget; i++) {
            corrupt(false);
            // The first runs: the first school starts clean (its corrupt neighbours placed well away from it).
            const c = s.packets[s.packets.length - 1];
            for (let tries = 0; o.cleanStart && firstSchool && tries < 12 && Math.hypot(c.x - firstSchool.x, c.y - firstSchool.y) < 3; tries++) {
                c.x = 1 + rand() * (w - 2);
                c.y = 1 + rand() * (h - 2);
            }
        }
        const goodCount = () => s.packets.filter(p => p.kind !== 'corrupt').length;
        const corruptCount = () => s.packets.filter(p => p.kind === 'corrupt').length;
        let refillAt = Infinity;
        const avDue = [...o.antivirus];
        let sweepAt = o.sweepFirst ?? Infinity;
        // Herders start spread round the middle.
        s.herders = [];
        for (let i = 0; i < o.herders; i++) {
            const a = i * Math.PI * 2 / Math.max(1, o.herders);
            s.herders.push({ id: s.nextId++, x: w / 2 + Math.cos(a) * 1.5, y: h / 2 + Math.sin(a) * 1.5, vx: 0, vy: 0, target: null });
        }

        // Bots start round the middle too.
        s.bots = [];
        const nBots = o.cleanBots + o.spoofBots + (o.collectBots || 0);
        for (let i = 0; i < nBots; i++) {
            const a = (i + 0.5) * Math.PI * 2 / Math.max(1, nBots);
            const kind = i < o.cleanBots ? 'clean' : i < o.cleanBots + o.spoofBots ? 'spoof' : 'collect';
            s.bots.push({ id: s.nextId++, kind, x: w / 2 + Math.cos(a) * 2, y: h / 2 + Math.sin(a) * 2, vx: 0, vy: 0, ready: kind === 'collect' ? o.collectEvery * (0.5 + i * 0.2) : 0, goldAt: o.goldEvery, avoid: new Set() });
        }
        // Each bot heads for the nearest red packet (one no other bot is after) and works on it when it gets there; with
        // nothing to do it drifts back toward the middle. A Cleaner bot with Gold Plating gilds a regular packet now and then.
        function botStep(dt) {
            if (!s.bots.length) return;
            const speed = o.botSpeed * grow, taken = new Set();
            for (const b of s.bots) {
                if (b.kind === 'collect') { collectStep(b, dt, speed, taken); continue; }
                const reds = s.packets.filter(p => p.kind === 'corrupt' && !spoofed(p) && !taken.has(p.id));
                let target = null, bd = Infinity;
                for (const p of reds) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; target = p; } }
                if (b.kind === 'clean' && o.goldPlate && s.time >= b.goldAt) {
                    // Gold Plating: the nearest regular packet turns gold.
                    let g = null, gd = Infinity;
                    for (const p of s.packets) { if (p.kind !== 'good') continue; const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < gd) { gd = d; g = p; } }
                    if (g && gd < 3 * grow) {
                        g.kind = 'gold';
                        b.goldAt = s.time + o.goldEvery / o.goldPlate;
                        s.stats.gilded++;
                        s.events.push({ type: 'gilded', x: g.x, y: g.y, from: { x: b.x, y: b.y } });
                    }
                }
                const aim = target || { x: w / 2, y: h / 2 };
                if (target) taken.add(target.id);
                const dx = aim.x - b.x, dy = aim.y - b.y, L = Math.hypot(dx, dy) || 1;
                const want = target ? speed : Math.min(speed * 0.4, L);
                b.vx += (dx / L * want - b.vx) * Math.min(1, 4 * dt);
                b.vy += (dy / L * want - b.vy) * Math.min(1, 4 * dt);
                b.x = Math.max(0.2, Math.min(w - 0.2, b.x + b.vx * dt));
                b.y = Math.max(0.2, Math.min(h - 0.2, b.y + b.vy * dt));
                if (target && bd < 0.45 && s.time >= b.ready) {
                    b.ready = s.time + o.botEvery;
                    if (b.kind === 'clean') {
                        target.kind = 'good';
                        s.stats.cleaned++;
                        s.events.push({ type: 'cleaned', x: target.x, y: target.y });
                    } else {
                        target.spoof = s.time + o.spoofSeconds;
                        s.stats.botSpoofed++;
                        s.events.push({ type: 'botSpoof', x: target.x, y: target.y });
                    }
                }
            }
        }

        // A Collector bot: heads for the nearest good packet no other bot is after (skipping ones it gave up on, red too
        // close) and, once there and ready, nets every good packet within its reach, paid at ×1 like a hijacked Antivirus.
        function collectStep(b, dt, speed, taken) {
            const R = o.collectR * Math.sqrt(grow);
            let target = null, bd = Infinity;
            for (const p of s.packets) {
                if (!isGood(p) || taken.has(p.id) || b.avoid.has(p.id)) continue;
                const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
                if (d < bd) { bd = d; target = p; }
            }
            const aim = target || { x: w / 2, y: h / 2 };
            if (target) taken.add(target.id);
            const dx = aim.x - b.x, dy = aim.y - b.y, L = Math.hypot(dx, dy) || 1;
            const want = target ? speed : Math.min(speed * 0.4, L);
            b.vx += (dx / L * want - b.vx) * Math.min(1, 4 * dt);
            b.vy += (dy / L * want - b.vy) * Math.min(1, 4 * dt);
            b.x = Math.max(0.2, Math.min(w - 0.2, b.x + b.vx * dt));
            b.y = Math.max(0.2, Math.min(h - 0.2, b.y + b.vy * dt));
            if (!target || Math.sqrt(bd) > R * 0.6 || s.time < b.ready) return;
            const near = s.packets.filter(p => Math.hypot(p.x - b.x, p.y - b.y) <= R);
            if (near.some(p => p.kind === 'corrupt' && !spoofed(p))) {
                b.avoid.add(target.id);
                if (b.avoid.size > 40) b.avoid.clear();
                return;
            }
            const got = near.filter(isGood).sort((p, q) => valueOf(q) - valueOf(p)).slice(0, o.collectCap);
            if (!got.length) return;
            b.ready = s.time + o.collectEvery;
            b.avoid.clear();
            s.stats.botCollected += got.length;
            s.events.push({ type: 'botNet', x: b.x, y: b.y, r: R, count: got.length });
            takeFor(got, b, 'collector');
        }

        // ---- The boss Antivirus --------------------------------------------------------------------------
        // `enraged`: an IDS alert booted it early, faster and charging sooner.
        // Its size grows with the field (to the ¾ power: a big field's boss stays a big target on screen) and with the
        // sector (engine.js), never past 13% of the field's shorter side (a phone's field is small).
        // It keeps to the middle: `edge` clear of every side, so it can be fought most of the time (it used to spend
        // its time along the edges, wiping the packets that swam in).
        const bossEdge = r => Math.min(r + o.bossEdge * shortSide, shortSide * 0.45);
        // Its long dash can carry it out of the middle: it never leaves the field, and walks back in (no jump).
        function keepCentral(b, dashing = false) {
            const r = b.r;
            if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
            if (b.x > w - r) { b.x = w - r; b.vx = -Math.abs(b.vx); }
            if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); }
            if (b.y > h - r) { b.y = h - r; b.vy = -Math.abs(b.vy); }
            if (dashing) return;
            const e = bossEdge(b.r), back = 1.5;
            if (b.x < e) b.vx = Math.max(b.vx, Math.min(back, (e - b.x) * 3));
            if (b.x > w - e) b.vx = Math.min(b.vx, -Math.min(back, (b.x - (w - e)) * 3));
            if (b.y < e) b.vy = Math.max(b.vy, Math.min(back, (e - b.y) * 3));
            if (b.y > h - e) b.vy = Math.min(b.vy, -Math.min(back, (b.y - (h - e)) * 3));
        }
        function bootBoss(enraged) {
            const r = Math.min(o.bossR * Math.pow(grow, 0.75), 0.1 * shortSide);
            // In from the middle of an edge, moving in.
            const side = Math.floor(rand() * 4), e = bossEdge(r);
            const x = side === 0 ? e : side === 1 ? w - e : w / 2, y = side === 2 ? e : side === 3 ? h - e : h / 2;
            s.boss = { x, y, vx: 0, vy: 0, r, hp: o.boss, maxHp: o.boss, stunned: 0, immune: null, charge: null, chargeAt: s.time + (enraged ? 1 : 2.5),
                enraged, smash: null, slashAt: -1, shielded: false, mineAt: s.time + 1.5, born: s.time };
            // Its arrival adds Focus (the fight shouldn't race the clock), above the bar if it must.
            // (Not when an IDS alert booted it: flags shouldn't pay.)
            const extra = enraged ? 0 : o.bossFocus;
            s.focus += extra;
            s.maxFocus = Math.max(s.maxFocus, s.focus);
            s.events.push({ type: 'boss', x, y, hp: o.boss, enraged, focus: extra });
        }
        // Where its charges aim: the pen while you draw, else the nearest good packet (so it charges all the same, and
        // there's always a parry to make).
        function chargeTarget(b) {
            if (s.drawing && s.wire.length) return s.wire[s.wire.length - 1];
            let best = null, bd = Infinity;
            for (const p of s.packets) {
                if (!isGood(p)) continue;
                const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
                if (d > 0.5 && d < bd) { bd = d; best = p; }
            }
            if (best) return best;
            // Nothing to aim at: where the pen was last, or somewhere across the middle.
            if (s.penAt && Math.hypot(s.penAt.x - b.x, s.penAt.y - b.y) > 1) return s.penAt;
            const ang = rand() * Math.PI * 2;
            return { x: b.x + Math.cos(ang) * 3, y: b.y + Math.sin(ang) * 3 };
        }
        // How far a charge goes (its warning line is drawn this long).
        // It reaches well past its own body (the owner's playtest: with a big boss most of the line was inside it, and what
        // stuck out was too short to hit): at least a third of the field's shorter side beyond its edge.
        const fullReach = b => Math.max(BOSS_DASH_SPEED * BOSS_DASH * o.avSpeed, o.chargeReach * Math.max(w, h)) + b.r;
        // How far it can go from (x, y) along (dx, dy) before leaving the field.
        const room = (x, y, dx, dy) => Math.min(dx > 0 ? (w - x) / dx : dx < 0 ? -x / dx : Infinity, dy > 0 ? (h - y) / dy : dy < 0 ? -y / dy : Infinity);
        // The line it shows (and dashes along) stays on the field: never past an edge.
        const chargeReach = b => (b.charge?.len ?? fullReach(b));
        function bossStep(dt) {
            if (!o.boss || s.bossDone) return;
            if (!s.boss) {
                if (s.time - s.sectorAt < o.bossAt && s.handCaught < o.bossCatch) return;
                // New threats wait for the pen to lift (Snare 15, the owner's call: a bubble shouldn't be punished by one
                // turning up, or by its tip card, mid-hold).
                if (penBusy()) return;
                bootBoss(false);
                return;
            }
            const b = s.boss;
            // Where it's been over the last 0.6 s: a loop round any of it counts (round 4 of the review: a loop drawn round
            // it that closed just after it stepped out didn't).
            (b.trail ||= []).push({ x: b.x, y: b.y, t: s.time });
            while (b.trail.length && s.time - b.trail[0].t > 0.6) b.trail.shift();
            mineStep(b, dt);
            // Shielded while two or more mines stand (one mine halves its slashes).
            b.shielded = s.mines.length >= 2;
            if (b.stunned > s.time) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.vx *= 1 - Math.min(1, 3 * dt);
                b.vy *= 1 - Math.min(1, 3 * dt);
                keepCentral(b);
                return;
            }
            // It roams toward the nearest school (kept to the middle) and wipes the data it touches; every few seconds it
            // locks on (a warning line: the parry window) and charges.
            if (b.charge) {
                b.charge.t += dt;
                if (b.charge.t < b.charge.warn) { b.vx *= 0.8; b.vy *= 0.8; }
                else if (b.charge.t < b.charge.warn + BOSS_DASH) {
                    // The dash covers the warning line.
                    const v = (chargeReach(b) - b.r) / BOSS_DASH;
                    b.vx = b.charge.dx * v; b.vy = b.charge.dy * v;
                }
                else { b.charge = null; b.chargeAt = s.time + o.bossCharge * (b.enraged ? 0.6 : 1); b.restUntil = s.time + o.bossRest; }
            } else if (b.restUntil > s.time) {
                // After a dash it stands a moment (another chance to loop it).
                b.vx *= 0.8; b.vy *= 0.8;
            } else {
                const aim = s.time >= (b.chargeAt ?? 0) ? chargeTarget(b) : null;
                if (aim) {
                    const L = Math.hypot(aim.x - b.x, aim.y - b.y) || 1;
                    let dx = (aim.x - b.x) / L, dy = (aim.y - b.y) / L;
                    // Aimed at a wall it would barely show (the owner's playtest: the zone ran off the field): it turns
                    // toward the middle instead.
                    if (room(b.x, b.y, dx, dy) - b.r < 0.25 * shortSide) {
                        const cx = w / 2 - b.x, cy = h / 2 - b.y, cl = Math.hypot(cx, cy);
                        if (cl > 1e-6) { dx = cx / cl; dy = cy / cl; }
                    }
                    // It stops short of the wall, room enough to loop round it there (a blind playtest: it stopped where a loop
                    // ran off the field).
                    const len = Math.max(b.r + 0.5, Math.min(fullReach(b), room(b.x, b.y, dx, dy) - b.r - Math.max(1, 0.12 * shortSide)));
                    b.charge = { t: 0, warn: o.bossWarn * (b.enraged ? 0.8 : 1), dx, dy, len };
                    s.events.push({ type: 'bossCharge', x: b.x, y: b.y });
                }
                // Decoys count as half as far away as packets (it falls for them).
                let best = null, bd = Infinity;
                for (const p of [...s.decoys, ...s.packets]) {
                    if (p.kind === 'corrupt' && !(p.spoof > s.time)) continue;
                    const d = ((p.x - b.x) ** 2 + (p.y - b.y) ** 2) * (p.kind ? 1 : 0.5);
                    if (d < bd) { bd = d; best = p; }
                }
                // Its target is held inside the middle too, so data along the edges is safe from it.
                const e = bossEdge(b.r);
                const target = best ? { x: Math.max(e, Math.min(w - e, best.x)), y: Math.max(e, Math.min(h - e, best.y)) } : { x: w / 2, y: h / 2 };
                const speed = o.avPatrol * o.bossSpeed * o.avSpeed * (b.enraged ? 1.3 : 1);
                const ang = Math.atan2(target.y - b.y, target.x - b.x);
                const k = Math.min(1, o.avTurn * 0.6 * dt);
                const near = Math.hypot(target.x - b.x, target.y - b.y);
                const sp = speed * Math.min(1, near / 0.6);
                b.vx += (Math.cos(ang) * sp - b.vx) * k;
                b.vy += (Math.sin(ang) * sp - b.vy) * k;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            keepCentral(b, !!(b.charge && b.charge.t >= b.charge.warn));
            // A decoy it sits on lasts `bossSmash` s, then it smashes it.
            const onDecoy = s.decoys.find(dc => Math.hypot(dc.x - b.x, dc.y - b.y) < b.r + 0.3);
            if (onDecoy) {
                b.smash = b.smash?.id === onDecoy.id ? b.smash : { id: onDecoy.id, t: 0 };
                b.smash.t += dt;
                if (b.smash.t >= o.bossSmash) {
                    s.decoys = s.decoys.filter(dc => dc !== onDecoy);
                    s.stats.decoysLost++;
                    s.events.push({ type: 'decoyGone', x: onDecoy.x, y: onDecoy.y, boss: true });
                    b.smash = null;
                }
            } else b.smash = null;
            const wiped = s.packets.filter(p => p.kind !== 'corrupt' && Math.hypot(p.x - b.x, p.y - b.y) < b.r);
            if (wiped.length) {
                s.stats.wiped += wiped.length;
                s.events.push({ type: 'wiped', x: b.x, y: b.y, packets: wiped.map(p => ({ x: p.x, y: p.y, kind: p.kind })) });
                remove(wiped);
            }
            // A quick stroke (a flick on its way) isn't snapped: flicks are how it's fought.
            const flicking = s.stroke && s.real - s.stroke.t0 < o.flickTime;
            // Nor a bubble in its first 1.5 s on the field (round 2 of the review: it booted into a held bubble and popped it).
            if (s.wire.length > 1 && !flicking && !(s.bubble && s.time - (b.born ?? -9) < 1.5)) {
                for (let i = 1; i < s.wire.length; i++) {
                    // Its snap costs half again what an Antivirus's does.
                    if (segDist(b, s.wire[i - 1], s.wire[i]) < b.r * 0.85) { snap(b); s.focus = Math.max(0, s.focus - o.snapPenalty * 0.5); break; }
                }
            }
            // Your Firewall sections hold it off, and the first touch each approach stuns it: a slash window.
            zoneBlock(b, dt, true);
        }
        // Health off the boss (a slash, a parry with Riposte, a ram). Returns whether it landed.
        function damageBoss(b, dmg, how, pierce = false) {
            if (b.shielded && !pierce) {
                s.stats.glanced++;
                s.events.push({ type: 'bossBlock', x: b.x, y: b.y, reason: 'shield', how });
                return false;
            }
            if (!(dmg > 0)) return true;
            if (s.mines.length === 1 && !pierce) dmg = Math.ceil(dmg / 2);
            b.hp = Math.max(0, b.hp - dmg);
            s.stats.bossHits++;
            s.stats.bossDamage += dmg;
            if (b.hp <= 0) {
                s.stats.bosses++;
                s.bossDone = true;
                s.boss = null;
                // Its mines and nets go down with it.
                for (const m of [...s.mines, ...s.held]) s.events.push({ type: 'mineDown', x: m.x, y: m.y, boss: true });
                s.mines = [];
                s.held = [];
                s.links = [];
                s.events.push({ type: 'bossDown', x: b.x, y: b.y, focus: clearBonus() });
            } else {
                s.events.push({ type: 'bossHit', x: b.x, y: b.y, r: b.r, hp: b.hp, maxHp: b.maxHp, how, dmg });
            }
            return true;
        }
        // A parry: the charge broken, the boss reeling (the slash window); later sectors' bosses boot Antivirus when it happens.
        // Stunned (a loop round it, or a parry): its charge is broken and it reels (the slash window); later sectors'
        // bosses boot Antivirus when it happens.
        function stunBoss(b) {
            b.charge = null;
            b.stunSlashes = 0;
            b.stunned = s.time + o.bossStun;
            b.chargeAt = s.time + o.bossStun + o.bossCharge * 0.6;
            const minions = s.antivirus.filter(f => f.minion && !f.ally).length;
            for (let i = 0; i < o.bossMinions && minions + i < o.minionCap; i++) { bootAntivirus(); s.antivirus[s.antivirus.length - 1].minion = true; }
        }
        function parryBoss(b) {
            const { dx, dy } = b.charge;
            stunBoss(b);
            b.vx = -dx * 3;
            b.vy = -dy * 3;
            s.stats.parries++;
            s.events.push({ type: 'parry', x: b.x, y: b.y });
            damageBoss(b, o.parryDamage, 'parry');
        }

        // ---- The boss's mines and nets -----------------------------------------------------------------
        // It lays them round itself, inside the middle; mines near enough link up (a net growing between them); a
        // finished net wipes the good data along it, and a ring of three finished nets the data inside it too.
        function layMines(b, n) {
            const e = Math.max(1, o.bossEdge * shortSide * 0.6);
            const spread = o.netRange * shortSide * 0.35;   // close round it, so one loop can take a mine and the boss
            const a0 = rand() * Math.PI * 2;
            for (let i = 0; i < n; i++) {
                const ang = a0 + i * Math.PI * 2 / n + (rand() - 0.5) * 0.5;
                const x = Math.max(e, Math.min(w - e, b.x + Math.cos(ang) * spread)), y = Math.max(e, Math.min(h - e, b.y + Math.sin(ang) * spread));
                const m = { id: s.nextId++, x, y };
                for (const q of s.mines) if (Math.hypot(q.x - x, q.y - y) <= o.netRange * shortSide) s.links.push({ a: q.id, b: m.id, t: 0 });
                s.mines.push(m);
                s.stats.mines++;
                s.events.push({ type: 'mine', x, y });
            }
        }
        const mineById = id => s.mines.find(m => m.id === id);
        const netsDone = () => s.links.filter(l => l.t >= o.netTime).map(l => [mineById(l.a), mineById(l.b)]).filter(([a, c]) => a && c);
        // The triangles of finished nets (the quarantined areas).
        function netAreas() {
            const done = netsDone(), key = (a, c) => (a.id < c.id ? `${a.id}:${c.id}` : `${c.id}:${a.id}`);
            const has = new Set(done.map(([a, c]) => key(a, c)));
            const out = [];
            for (let i = 0; i < s.mines.length; i++) for (let j = i + 1; j < s.mines.length; j++) for (let k = j + 1; k < s.mines.length; k++) {
                const A = s.mines[i], B = s.mines[j], C = s.mines[k];
                if (has.has(key(A, B)) && has.has(key(B, C)) && has.has(key(A, C))) out.push([A, B, C]);
            }
            return out;
        }
        let netAt = 0;
        function mineStep(b, dt) {
            if (!o.bossMines) return;
            if (s.time >= b.mineAt && s.mines.length < o.bossMines) {
                layMines(b, o.bossMines - s.mines.length);
                b.mineAt = s.time + o.mineEvery;
            }
            for (const l of s.links) l.t += dt;
            if (s.time < netAt) return;
            netAt = s.time + o.netEvery;
            const lines = netsDone();
            if (!lines.length) return;
            const areas = netAreas();
            const caught = s.packets.filter(p => isGood(p) && (lines.some(([a, c]) => segDist(p, a, c) < 0.35) || areas.some(t => pointInPolygon(p, t))));
            if (caught.length) {
                s.stats.netted += caught.length;
                s.events.push({ type: 'netted', packets: caught.map(p => ({ x: p.x, y: p.y, kind: p.kind })) });
                remove(caught);
            }
        }
        // A loop round a mine clears it (and its nets).
        function clearMines(poly) {
            const hit = s.mines.filter(m => pointInPolygon(m, poly));
            if (!hit.length) return false;
            // Defuse at its last level: the nearest other mine goes too.
            if (o.defuseChain) {
                const rest = s.mines.filter(m => !hit.includes(m)).sort((a, c) => Math.hypot(a.x - hit[0].x, a.y - hit[0].y) - Math.hypot(c.x - hit[0].x, c.y - hit[0].y));
                if (rest.length) hit.push(rest[0]);
            }
            s.mines = s.mines.filter(m => !hit.includes(m));
            s.links = s.links.filter(l => mineById(l.a) && mineById(l.b));
            s.stats.minesCleared += hit.length;
            for (const m of hit) s.events.push({ type: 'mineDown', x: m.x, y: m.y });
            if (s.boss && !s.mines.length) s.boss.mineAt = Math.max(s.boss.mineAt, s.time + o.mineEvery * 0.75);
            // Cleared while it reels: the stun lasts a second longer.
            if (s.boss && s.boss.stunned > s.time) s.boss.stunned += 1;
            return true;
        }

        // A bubble let go over a mine grabs it (Snare 15): it leaves the field's mines (no nets, no shield) and waits,
        // glowing, to be flicked at the boss; Defuse at its last level grabs the nearest other too.
        function grabMines(poly) {
            const hit = s.mines.filter(m => pointInPolygon(m, poly));
            if (!hit.length) return false;
            if (o.defuseChain) {
                const rest = s.mines.filter(m => !hit.includes(m)).sort((a, c) => Math.hypot(a.x - hit[0].x, a.y - hit[0].y) - Math.hypot(c.x - hit[0].x, c.y - hit[0].y));
                if (rest.length) hit.push(rest[0]);
            }
            s.mines = s.mines.filter(m => !hit.includes(m));
            s.links = s.links.filter(l => mineById(l.a) && mineById(l.b));
            for (const m of hit) {
                s.held.push({ id: m.id, x: m.x, y: m.y, until: s.time + o.mineHold });
                s.stats.minesGrabbed++;
                s.events.push({ type: 'mineGrab', x: m.x, y: m.y });
            }
            if (s.boss && !s.mines.length) s.boss.mineAt = Math.max(s.boss.mineAt, s.time + o.mineEvery * 0.75);
            return true;
        }
        // Not thrown in time, a grabbed mine goes live again where it was.
        function heldStep() {
            for (const m of s.held.filter(q => s.time >= q.until)) {
                s.held = s.held.filter(q => q !== m);
                if (!s.boss) continue;
                for (const q of s.mines) if (Math.hypot(q.x - m.x, q.y - m.y) <= o.netRange * shortSide) s.links.push({ a: q.id, b: m.id, t: 0 });
                s.mines.push({ id: m.id, x: m.x, y: m.y });
                s.events.push({ type: 'mineLive', x: m.x, y: m.y });
            }
        }

        // The pen is down (a bubble held, a wire drawn): new threats wait, up to `threatWait` s of it.
        const penBusy = () => s.drawing && s.real - (s.penDownAt ?? s.real) < o.threatWait;

        function bootAntivirus() {
            // From a corner, so it never lands on the pen.
            const c = Math.floor(rand() * 4);
            const x = c % 2 ? w - AV_R : AV_R;
            const y = c < 2 ? AV_R : h - AV_R;
            const ang = Math.atan2(h / 2 - y, w / 2 - x);
            const v = o.avPatrol * o.avSpeed;
            s.antivirus.push({ id: s.nextId++, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: AV_R, hunting: false, stunned: 0, off: false, shift: s.time + o.avOn });
            s.events.push({ type: 'antivirus', x, y });
        }

        function bounce(e) {
            if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
            if (e.x > w - e.r) { e.x = w - e.r; e.vx = -Math.abs(e.vx); }
            if (e.y < e.r) { e.y = e.r; e.vy = Math.abs(e.vy); }
            if (e.y > h - e.r) { e.y = h - e.r; e.vy = -Math.abs(e.vy); }
        }

        // Schools: each good packet steers with the others of its school nearby (heading and centre), keeping its own
        // speed; corrupt packets go their own way, straight through.
        function flock(dt) {
            // Quarantine Relay: a red packet your Firewall turned back swims to your nearest decoy, wherever it is.
            if (o.relay && s.decoys.length) {
                for (const p of s.packets) {
                    if (!(p.relay > s.time) || p.kind !== 'corrupt') continue;
                    const dc = s.decoys.reduce((a, c) => (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? c : a));
                    const ang = Math.atan2(dc.y - p.y, dc.x - p.x), kr = Math.min(1, 6 * dt);
                    p.vx += (Math.cos(ang) * p.v - p.vx) * kr;
                    p.vy += (Math.sin(ang) * p.v - p.vy) * kr;
                    const vl = Math.hypot(p.vx, p.vy) || 1;
                    p.vx = p.vx / vl * p.v;
                    p.vy = p.vy / vl * p.v;
                }
            }
            // Corrupt packets swim toward the nearest school: they hide in the crowd, so a big loop round a school is a gamble.
            if (o.corruptLure > 0 && !(o.cleanStart && s.time < 5)) {
                // While you draw a loop the lure eases off (big loops are a gamble, not a certainty).
                const kc = Math.min(1, o.corruptLure * (s.drawing ? 0.4 : 1) * dt);
                // Good packets on a grid of 3-unit cells: a corrupt one only looks in the cells round it (a datacentre's
                // field holds hundreds of packets; all against all was most of a frame).
                const grid = new Map();
                for (const q of s.packets) {
                    if (q.kind === 'corrupt') continue;
                    const key = Math.floor(q.x / 3) * 4096 + Math.floor(q.y / 3);
                    const cell = grid.get(key);
                    if (cell) cell.push(q); else grid.set(key, [q]);
                }
                const near = p => {
                    const out = [], cx = Math.floor(p.x / 3), cy = Math.floor(p.y / 3);
                    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = grid.get((cx + i) * 4096 + cy + j); if (c) out.push(...c); }
                    return out;
                };
                for (const p of s.packets) {
                    if (p.kind !== 'corrupt' || p.spoof > s.time) continue;
                    if (p.relay > s.time) continue;   // on its way to a decoy (below)
                    // A decoy in reach outbids the schools.
                    let best = null, bd = 9;
                    for (const dc of s.decoys) {
                        const d2 = (dc.x - p.x) ** 2 + (dc.y - p.y) ** 2;
                        if (d2 < o.decoyLure ** 2 && (!best || d2 < bd)) { bd = d2; best = dc; }
                    }
                    if (best) { bd = -1; }
                    for (const q of best ? [] : near(p)) {
                        const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
                        if (d2 < bd && d2 > 0.25) { bd = d2; best = q; }
                    }
                    if (!best) continue;
                    const ang = Math.atan2(best.y - p.y, best.x - p.x);
                    p.vx += (Math.cos(ang) * p.v - p.vx) * kc;
                    p.vy += (Math.sin(ang) * p.v - p.vy) * kc;
                    const vl = Math.hypot(p.vx, p.vy) || 1;
                    p.vx = p.vx / vl * p.v;
                    p.vy = p.vy / vl * p.v;
                }
            }
            if (!(o.schooling > 0)) return;
            const R2 = 1.8 * 1.8;
            const k = Math.min(1, o.schooling * 2.4 * dt);
            // Each packet only steers with its own school: grouped once a step.
            const schools = new Map();
            for (const p of s.packets) {
                if (p.kind === 'corrupt') continue;
                const sc = schools.get(p.school);
                if (sc) sc.push(p); else schools.set(p.school, [p]);
            }
            for (const p of s.packets) {
                if (p.kind === 'corrupt') continue;
                let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
                for (const q of schools.get(p.school)) {
                    if (q === p) continue;
                    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
                    if (d2 > R2) continue;
                    ax += q.vx; ay += q.vy; cx += dx; cy += dy; n++;
                    if (d2 < 0.36) { sx -= dx / (d2 + 0.05); sy -= dy / (d2 + 0.05); }
                }
                if (!n) continue;
                let tx = ax / n + cx / n * 0.8 + sx * 0.15, ty = ay / n + cy / n * 0.8 + sy * 0.15;
                const tl = Math.hypot(tx, ty) || 1;
                p.vx += (tx / tl * p.v - p.vx) * k;
                p.vy += (ty / tl * p.v - p.vy) * k;
                const vl = Math.hypot(p.vx, p.vy) || 1;
                p.vx = p.vx / vl * p.v;
                p.vy = p.vy / vl * p.v;
            }
        }

        // The nearest point of the wire to (x, y).
        function nearestWire(x, y) {
            let best = null, bd = Infinity;
            for (const p of s.wire) {
                const d = (p.x - x) ** 2 + (p.y - y) ** 2;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        }

        function snap(fw) {
            const popped = !!s.bubble?.growing;
            s.events.push({ type: 'snap', x: fw.x, y: fw.y, wire: s.wire.slice(), bubble: popped });
            s.bubble = null;
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
            s.cooldown = o.snapCooldown;
            // A popped bubble costs half (round 1 of the review: Antivirus pops took 2 s each from a 14 s clock).
            s.focus = Math.max(0, s.focus - o.snapPenalty * (popped ? 0.5 : 1));
            s.stats.snaps++;
            s.streak = 0;
            s.cleanRun = 0;
        }

        const spoofed = p => p.kind === 'corrupt' && p.spoof > s.time;
        const isGood = p => p.kind !== 'corrupt' || spoofed(p);
        const valueOf = p => (p.kind === 'gold' ? o.goldValue : 1) * (p.tag > s.time ? o.tagValue : 1) * (spoofed(p) ? o.spoofValue : 1);

        // Taken packets leave the field; a school refills from an edge once enough are gone, corrupt ones one by one.
        // Broadband: each placed turret or scanner tower brings caught packets back sooner.
        const respawnNow = () => o.respawn / (1 + o.broadband * (s.turrets.length + s.towers.length));
        function remove(list) {
            s.packets = s.packets.filter(p => !list.includes(p));
            for (const p of list) {
                if (p.kind === 'corrupt') pendingCorrupt.push(s.time + respawnNow() * (0.6 + rand() * 0.8));
            }
            if (refillAt === Infinity) refillAt = s.time + respawnNow();
        }
        const pendingCorrupt = [];

        function laserStep(dt) {
            if (!o.laser) return;
            for (const l of s.locks) l.t += dt;
            // Fire the locks that have held long enough.
            for (const l of s.locks.filter(l => l.t >= LOCK_SECONDS)) {
                const p = s.packets.find(q => q.id === l.id);
                if (p) {
                    const units = valueOf(p);
                    s.stats.lasered++;
                    s.stats.units += units;
                    s.stats.caught++;
                    if (p.kind === 'gold') s.stats.gold++;
                    s.events.push({ type: 'laser', x: p.x, y: p.y, from: l.from, units, kind: p.kind });
                    remove([p]);
                }
            }
            s.locks = s.locks.filter(l => l.t < LOCK_SECONDS);
            if (s.time < s.laserAt) return;
            s.laserAt = s.time + o.laser;
            // Each emitter takes the richest packet in its reach not already locked: gold first, then tagged.
            const taken = new Set(s.locks.map(l => l.id));
            const reach = o.laserReach * shortSide;
            for (const from of emitterSpots()) {
                let best = null;
                for (const p of s.packets) {
                    if (p.kind === 'corrupt' || taken.has(p.id) || Math.hypot(p.x - from.x, p.y - from.y) > reach) continue;
                    if (!best || valueOf(p) > valueOf(best) || (valueOf(p) === valueOf(best) && p.id < best.id)) best = p;
                }
                if (!best) continue;
                taken.add(best.id);
                s.locks.push({ id: best.id, t: 0, from });
            }
        }
        // Where the lasers' emitters stand: `emitters` along each of `laserSides` edges (bottom, top, left, right).
        function emitterSpots() {
            const out = [];
            const sides = [[0, 1], [0, -1], [-1, 0], [1, 0]].slice(0, Math.max(1, Math.min(4, o.laserSides)));
            for (const [sx, sy] of sides) {
                for (let i = 0; i < o.emitters; i++) {
                    const f = (i + 1) / (o.emitters + 1);
                    out.push(sy ? { x: w * f, y: sy > 0 ? h : 0 } : { x: sx > 0 ? w : 0, y: h * f });
                }
            }
            return out;
        }

        // A tag lasts `tagSeconds` and isn't refreshed; once it's gone, the packet can't be tagged again for as long (round
        // 3: with towers and the beam, every packet on a maxed field stayed tagged, and a tag meant nothing).
        function tag(p) {
            if (p.tag > s.time || p.tagCool > s.time) return;
            s.stats.tagged++;
            p.tag = s.time + o.tagSeconds;
            p.tagCool = s.time + 2 * o.tagSeconds;
        }
        function scannerStep(dt) {
            if (!s.beams.length) return;
            const cx = w / 2, cy = h / 2;
            for (let b = 0; b < s.beams.length; b++) {
                const a0 = s.beams[b];
                const a1 = a0 + o.scannerSpeed * dt;
                s.beams[b] = a1 % (Math.PI * 2);
                for (const p of s.packets) {
                    if (p.kind === 'corrupt') continue;
                    let a = Math.atan2(p.y - cy, p.x - cx);
                    // the angle swept this step, in [a0, a1] modulo a turn
                    let d = (a - a0) % (Math.PI * 2);
                    if (d < 0) d += Math.PI * 2;
                    if (d <= a1 - a0 + 1e-9) tag(p);
                }
            }
        }

        // ---- The Rogue AI -----------------------------------------------------------------------------
        // A Firewall of yours between a core and a packet shields it: the circle can't take it through.
        const shielded = (core, p) => wallsNow.some(f => inZone(p, f));
        function spawnCore() {
            // Where the data is: next to a random good packet (the schools draw it), kept off the edges.
            const goods = s.packets.filter(p => p.kind !== 'corrupt');
            const near = goods.length ? goods[Math.floor(rand() * goods.length)] : { x: w / 2, y: h / 2 };
            const ang = rand() * Math.PI * 2;
            // Room to loop round it (Snare 12.8, the owner: a core by the edge couldn't be circled): its centre stays at
            // least `rogueEdge` × the closing ring from every side, or 12% of the shorter side, whichever is more.
            const m = Math.min(Math.max(o.rogueEdge * closeR, 0.12 * shortSide, 1), w / 2, h / 2);
            const at = { x: Math.max(m, Math.min(w - m, near.x + Math.cos(ang))), y: Math.max(m, Math.min(h - m, near.y + Math.sin(ang))) };
            s.cores.push({ id: s.nextId++, x: at.x, y: at.y, r: 0, age: 0, stole: 0 });
            s.stats.cores++;
            s.events.push({ type: 'core', x: at.x, y: at.y });
        }
        function rogueStep(dt) {
            if (!o.rogue) return;
            // No new cores while the boss stands (its arena).
            if (s.boss && s.time >= s.rogueAt) s.rogueAt = s.time + 1;
            if (s.time >= s.rogueAt && !penBusy()) {
                s.rogueAt = s.time + o.rogueEvery;
                for (let i = 0; i < o.rogue; i++) spawnCore();
            }
            const rMax = o.rogueMax * shortSide;
            for (const c of s.cores) {
                c.age += dt;
                c.r = Math.min(rMax, c.r + o.rogueGrow * dt);
                // Every good packet the circle reaches is stolen, unless a wall stands between them.
                const taken = s.packets.filter(p => p.kind !== 'corrupt' && Math.hypot(p.x - c.x, p.y - c.y) <= c.r && !shielded(c, p));
                if (taken.length) {
                    c.stole += taken.length;
                    s.stats.stolen += taken.length;
                    s.events.push({ type: 'stolen', core: { x: c.x, y: c.y }, packets: taken.map(p => ({ x: p.x, y: p.y, kind: p.kind })) });
                    remove(taken);
                }
            }
            for (const c of s.cores.filter(c => c.age >= o.rogueLife)) s.events.push({ type: 'coreGone', x: c.x, y: c.y, r: c.r });
            s.cores = s.cores.filter(c => c.age < o.rogueLife);
        }

        // ---- Your Firewalls, decoys, turrets, towers and powers -----------------------------------------
        // The walls standing this step (worked out once a step: the hot paths below use it).
        let wallsNow = [];
        const wallsUp = () => s.walls.filter(f => f.hp > 0);
        const inZone = (p, f, pad = 0) => Math.abs(p.x - f.x) <= f.hw + pad && Math.abs(p.y - f.y) <= f.hh + pad;
        // Puts a point just outside a section (by its nearest side) and returns that side's outward normal.
        function eject(p, f, pad) {
            const dx = p.x - f.x, dy = p.y - f.y;
            if (f.hw + pad - Math.abs(dx) < f.hh + pad - Math.abs(dy)) {
                const sx = dx >= 0 ? 1 : -1;
                p.x = f.x + sx * (f.hw + pad + 0.01);
                return { x: sx, y: 0 };
            }
            const sy = dy >= 0 ? 1 : -1;
            p.y = f.y + sy * (f.hh + pad + 0.01);
            return { x: 0, y: sy };
        }
        // What the wire costs: its length, less the stretches drawn inside your Firewall sections (safe ground).
        function segCost(a, b) {
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            return wallsNow.some(f => inZone(a, f) && inZone(b, f)) ? 0 : L;
        }
        function wireCost(pts) {
            let L = 0;
            for (let i = 1; i < pts.length; i++) L += segCost(pts[i - 1], pts[i]);
            return L;
        }
        // Your own sections (Auto-Deploy's free ones don't take a slot).
        const ownZones = () => s.walls.reduce((n, f) => n + (f.auto ? 0 : 1), 0);
        // Drop a Firewall section with its middle at (x, y) while a slot is free. Returns it, or null.
        function placeZone(x, y) {
            if (s.over || ownZones() + s.rebuild.length >= o.firewalls) return null;
            const z = makeZone(x, y);
            s.walls.push(z);
            wallsNow = wallsUp();
            s.events.push({ type: 'place', kind: 'wall', x: z.x, y: z.y });
            return z;
        }
        // Drag a section somewhere else (drag and drop).
        function moveZone(id, x, y) {
            const z = s.walls.find(f => f.id === id);
            if (!z || s.over) return null;
            z.x = Math.max(z.hw, Math.min(w - z.hw, x));
            z.y = Math.max(z.hh, Math.min(h - z.hh, y));
            return z;
        }
        // The section under (x, y), if any (the UI passes a little reach).
        const zoneAt = (x, y, reach = 0) => s.walls.find(f => inZone({ x, y }, f, reach)) || null;
        // A section that's worn down to nothing leaves the field and frees its slot (Great Wall rebuilds it in place).
        function zoneDown(f) {
            s.stats.fwLost++;
            s.walls = s.walls.filter(g => g !== f);
            wallsNow = wallsUp();
            if (o.wallRebuild && (!f.auto || o.autoTools)) s.rebuild.push({ x: f.x, y: f.y, at: s.time + o.wallRebuild });
            s.events.push({ type: 'zoneDown', x: f.x, y: f.y, hw: f.hw, hh: f.hh });
        }
        // Auto-Deploy: a free section goes where the good packets gather (the densest patch with the fewest red, clear
        // of your other sections).
        function autoZoneStep() {
            if (!o.autoZone || o.autoTools) return;     // with tools that place themselves, Auto-Deploy adds to them (toolStep)
            // its sections move on when their time is up (no rebuild, no slot freed: they never took one)
            const gone = s.walls.filter(f => f.auto && s.time >= f.until);
            if (gone.length) {
                s.walls = s.walls.filter(f => !gone.includes(f));
                wallsNow = wallsUp();
                for (const f of gone) s.events.push({ type: 'autoZoneGone', x: f.x, y: f.y });
            }
            if (s.time < s.autoZoneAt) return;
            s.autoZoneAt = s.time + o.autoZoneEvery;
            if (s.over || s.walls.length - ownZones() >= o.autoZoneMax) return;
            const cell = Math.max(zoneHw, zoneHh) * 1.4, score = new Map();
            for (const p of s.packets) {
                const key = Math.floor(p.x / cell) * 4096 + Math.floor(p.y / cell);
                score.set(key, (score.get(key) || 0) + (p.kind === 'corrupt' ? -2 : 1));
            }
            let best = null, bs = 2;
            for (const [key, sc] of score) {
                if (sc <= bs) continue;
                const x = (Math.floor(key / 4096) + 0.5) * cell, y = ((key % 4096) + 0.5) * cell;
                if (s.walls.some(f => Math.abs(f.x - x) < f.hw * 2 && Math.abs(f.y - y) < f.hh * 2)) continue;
                best = { x, y }; bs = sc;
            }
            if (!best) return;
            const z = makeZone(best.x, best.y);
            z.auto = true; z.until = s.time + o.autoZoneLife;
            s.walls.push(z);
            wallsNow = wallsUp();
            s.stats.autoZones++;
            s.events.push({ type: 'autoZone', x: z.x, y: z.y });
        }
        const LISTS = { decoy: 'decoys', turret: 'turrets', tower: 'towers' };
        // Place a decoy, turret or tower at (x, y) while a slot is free.
        function placeAt(kind, x, y) {
            const list = LISTS[kind];
            if (!list || s.over || s[list].length >= o[list]) return null;
            const p = inField(x, y);
            const it = { id: s.nextId++, x: p.x, y: p.y };
            if (kind === 'turret') it.at = s.time + o.turretEvery * 0.5;
            if (kind === 'tower') it.ang = 0;
            s[list].push(it);
            s.events.push({ type: 'place', kind, x: p.x, y: p.y });
            return it;
        }
        // Take back the nearest of a kind within `reach` of (x, y) (the UI passes a fixed size on screen).
        function removeAt(kind, x, y, reach = 0.5) {
            if (s.over) return false;
            const at = { x, y };
            const list = kind === 'wall' ? 'walls' : LISTS[kind];
            if (!list) return false;
            const d = it => (kind === 'wall' ? (inZone(at, it, reach) ? 0 : Infinity) : Math.hypot(it.x - x, it.y - y));
            const hit = s[list].filter(it => d(it) <= reach).sort((a, b) => d(a) - d(b))[0];
            if (!hit) return false;
            s[list] = s[list].filter(it => it !== hit);
            if (kind === 'wall') wallsNow = wallsUp();
            s.events.push({ type: 'remove', kind, x, y });
            return true;
        }
        // Use a power (a charge a run).
        function usePower(kind, free = false) {
            if (s.over || (!free && !(s.charges[kind] > 0))) return false;
            if (!free) s.charges[kind]--;
            if (kind === 'freeze') {
                s.frozenLeft = o.freezeSeconds;
                s.stats.freezes++;
            } else if (kind === 'purge') {
                const bad = s.packets.filter(p => p.kind === 'corrupt');
                s.stats.purged += bad.length;
                s.events.push({ type: 'purge', packets: bad.map(p => ({ x: p.x, y: p.y })) });
                remove(bad);
            } else return false;
            s.events.push({ type: 'power', kind });
            return true;
        }
        // ---- Tools that place themselves, and power pickups (Snare 13) ----------------------------------------
        // The densest cell of the field by a weight a packet carries: where a tool is most use.
        function bestCell(weight, min, clear) {
            const cell = Math.max(2, 0.15 * shortSide), score = new Map();
            for (const p of s.packets) {
                const wt = weight(p);
                if (!wt) continue;
                const key = Math.floor(p.x / cell) * 4096 + Math.floor(p.y / cell);
                score.set(key, (score.get(key) || 0) + wt);
            }
            let best = null, bs = min;
            for (const [key, sc] of score) {
                if (sc < bs) continue;
                const at = { x: (Math.floor(key / 4096) + 0.5) * cell, y: ((key % 4096) + 0.5) * cell };
                if (clear && !clear(at)) continue;
                best = at; bs = sc;
            }
            return best;
        }
        const farFrom = (list, d) => at => !list.some(it => Math.hypot(it.x - at.x, it.y - at.y) < d);
        const margin = () => Math.min(1, w / 4, h / 4);
        const interior = at => at && { x: Math.max(margin(), Math.min(w - margin(), at.x)), y: Math.max(margin(), Math.min(h - margin(), at.y)) };
        function toolSpot(kind) {
            const red = p => p.kind === 'corrupt' && !spoofed(p);
            if (kind === 'wall') return bestCell(p => (red(p) ? -2 : 1), 2, at => !s.walls.some(f => Math.abs(f.x - at.x) < f.hw * 2 && Math.abs(f.y - at.y) < f.hh * 2));
            if (kind === 'tower') return interior(bestCell(p => (red(p) ? 0 : 1), 3, farFrom(s.towers, 2.5)));
            if (kind === 'decoy') return interior(bestCell(p => (red(p) ? 1 : 0), 1, farFrom(s.decoys, 2)));
            // a turret: within reach of a hunting Antivirus, a little toward the middle; else where the red packets are
            const av = s.antivirus.filter(f => !(f.ally > s.time) && !f.off).sort((a, b) => Math.hypot(a.x - w / 2, a.y - h / 2) - Math.hypot(b.x - w / 2, b.y - h / 2))[0];
            if (av) {
                const dx = w / 2 - av.x, dy = h / 2 - av.y, d = Math.hypot(dx, dy) || 1, k = Math.min(d, o.turretRange * 0.6);
                const at = interior({ x: av.x + dx / d * k, y: av.y + dy / d * k });
                if (farFrom(s.turrets, 1.5)(at)) return at;
            }
            return interior(bestCell(p => (red(p) ? 1 : 0), 1, farFrom(s.turrets, 2)));
        }
        const TOOL_KINDS = [['wall', 'walls', 'firewalls', 'zoneLife'], ['decoy', 'decoys', 'decoys', 'decoyLife'], ['turret', 'turrets', 'turrets', 'turretLife'], ['tower', 'towers', 'towers', 'towerLife']];
        function toolStep() {
            if (!o.autoTools || s.over) return;
            TOOL_KINDS.forEach(([kind, list, capKey, lifeKey], i) => {
                // its time is up: it moves on (a section frees its place; Great Wall only rebuilds one worn down)
                const gone = s[list].filter(it => it.auto && s.time >= it.until);
                if (gone.length) {
                    s[list] = s[list].filter(it => !gone.includes(it));
                    if (kind === 'wall') wallsNow = wallsUp();
                    for (const g of gone) s.events.push({ type: 'toolGone', kind, x: g.x, y: g.y });
                }
                // Auto-Deploy: sections come sooner, and more of them stand
                const cap = (o[capKey] || 0) + (kind === 'wall' && o.autoZone ? o.autoZoneMax : 0);
                if (!cap) return;
                if (s.toolAt[kind] === undefined) s.toolAt[kind] = o.toolFirst + i * 0.8;
                if (s.time < s.toolAt[kind]) return;
                s.toolAt[kind] = s.time + (kind === 'wall' && o.autoZone ? Math.min(o.toolEvery, o.autoZoneEvery) : o.toolEvery);
                if (s[list].length + (kind === 'wall' ? s.rebuild.length : 0) >= cap) return;
                const at = toolSpot(kind);
                if (!at) return;
                let it;
                if (kind === 'wall') { it = makeZone(at.x, at.y); s.walls.push(it); wallsNow = wallsUp(); }
                else {
                    it = { id: s.nextId++, x: at.x, y: at.y };
                    if (kind === 'turret') it.at = s.time + o.turretEvery * 0.5;
                    if (kind === 'tower') it.ang = 0;
                    s[list].push(it);
                }
                it.auto = true; it.until = s.time + o[lifeKey]; it.born = s.time;
                s.stats.spawned++;
                if (kind === 'wall' && o.autoZone) s.stats.autoZones++;
                s.events.push({ type: 'spawn', kind, x: it.x, y: it.y });
            });
        }
        // Freeze and purge drift in as pickups (one of each at most), more often a level; a tap grabs one.
        function pickupStep(dt) {
            if (!o.autoTools || s.over) return;
            s.pickups = s.pickups.filter(pk => {
                if (s.time < pk.until) return true;
                s.events.push({ type: 'pickupGone', kind: pk.kind, x: pk.x, y: pk.y });
                return false;
            });
            for (const kind of ['freeze', 'purge']) {
                const lv = o[kind] || 0;
                if (!lv) continue;
                if (s.pickupAt[kind] === undefined) s.pickupAt[kind] = o.pickupFirst + (kind === 'purge' ? 3 : 0);
                if (s.time < s.pickupAt[kind] || s.pickups.some(pk => pk.kind === kind)) continue;
                s.pickupAt[kind] = s.time + o.pickupEvery / (1 + 0.6 * (lv - 1)) * (0.8 + 0.4 * rand());
                // purge comes where the red packets are; freeze anywhere well inside the field
                const m = Math.max(o.pickupReach * 1.5, 0.15 * shortSide);
                const near = kind === 'purge' ? bestCell(p => (p.kind === 'corrupt' ? 1 : 0), 1) : null;
                const x = Math.max(m, Math.min(w - m, near ? near.x : m + rand() * (w - 2 * m)));
                const y = Math.max(m, Math.min(h - m, near ? near.y : m + rand() * (h - 2 * m)));
                s.pickups.push({ id: s.nextId++, kind, x, y, born: s.time, until: s.time + o.pickupLife });
                s.events.push({ type: 'pickupHere', kind, x, y });
            }
            // they drift a little with the current
            if (s.flow) for (const pk of s.pickups) {
                pk.x = Math.max(0.5, Math.min(w - 0.5, pk.x + s.flow.x * 0.25 * dt));
                pk.y = Math.max(0.5, Math.min(h - 0.5, pk.y + s.flow.y * 0.25 * dt));
            }
        }
        // A tap or click at (x, y): grab the pickup under it (`reach` is the UI's finger, in units). Returns its kind.
        function grab(x, y, reach = 0) {
            if (s.over) return null;
            const pk = s.pickups.find(q => Math.hypot(q.x - x, q.y - y) <= o.pickupReach + reach);
            if (!pk) return null;
            s.pickups = s.pickups.filter(q => q !== pk);
            s.stats.pickups++;
            s.events.push({ type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y });
            usePower(pk.kind, true);
            return pk.kind;
        }
        const frozen = () => s.frozenLeft > 0;
        // Packets and your Firewall sections: a red packet can't get in (it bounces off the side it hit) and one inside is
        // pushed out; with Holding Pen a good packet that came in can't get out. A spoofed packet passes as good.
        function zoneStep(p, px, py, dt) {
            const red = p.kind === 'corrupt' && !spoofed(p);
            for (const f of wallsNow) {
                const now = inZone(p, f), was = inZone({ x: px, y: py }, f);
                if (red && now) {
                    if (!was) {
                        // It hit the side: back where it was, its velocity turned round off that side.
                        p.x = px; p.y = py;
                        if (Math.abs(px - f.x) > f.hw) p.vx = -p.vx; else p.vy = -p.vy;
                        s.stats.bounces++;
                        if (o.zeroTrust) {
                            // Zero Trust: verified at the wall, it comes back good.
                            p.kind = 'good';
                            s.stats.converted++;
                            s.events.push({ type: 'convert', x: p.x, y: p.y });
                        } else if (o.relay && s.decoys.length && !(p.relay > s.time)) {
                            // Quarantine Relay: sent down the lane to your decoy.
                            p.relay = s.time + o.relaySeconds;
                            s.stats.relayed++;
                            s.events.push({ type: 'relay', x: p.x, y: p.y });
                        }
                    } else {
                        // Inside: pushed out by the nearest side.
                        const dx = p.x - f.x, dy = p.y - f.y, sp = Math.max(p.v, 2.5);
                        if (f.hw - Math.abs(dx) < f.hh - Math.abs(dy)) { p.vx = (dx >= 0 ? 1 : -1) * sp; p.vy *= 0.5; }
                        else { p.vy = (dy >= 0 ? 1 : -1) * sp; p.vx *= 0.5; }
                        s.stats.pushedOut++;
                    }
                    return;
                }
                if (!red && o.pen && was && !now) {
                    // Holding Pen: it turns back in.
                    p.x = px; p.y = py;
                    if (Math.abs(p.x + p.vx * dt - f.x) > f.hw) p.vx = -p.vx; else p.vy = -p.vy;
                    return;
                }
            }
        }
        // An Antivirus or the boss can't get into a section: it's held at the side, wearing the section's health down
        // (`avChip` a second, the boss `bossChip`); the boss is also stunned once per approach (a slash window). An
        // Antivirus that's updating, or one you've hijacked, does no harm.
        function zoneBlock(v, dt, isBoss = false) {
            if (!wallsNow.length || v.ally > s.time) return;
            const clear = v.r * 2.5;
            if (isBoss && v.immune) v.immune = v.immune.filter(id => { const f = wallsNow.find(f => f.id === id); return f && inZone(v, f, clear); });
            for (const f of wallsNow) {
                // Touching (a hair's margin, so a press held against the side counts every step) and held outside.
                if (!inZone(v, f, v.r + 0.08)) continue;
                const dx = v.x - f.x, dy = v.y - f.y;
                const n = f.hw - Math.abs(dx) < f.hh - Math.abs(dy) ? { x: dx >= 0 ? 1 : -1, y: 0 } : { x: 0, y: dy >= 0 ? 1 : -1 };
                if (inZone(v, f, v.r)) eject(v, f, v.r);
                const vn = v.vx * n.x + v.vy * n.y;
                if (vn < 0) { v.vx -= vn * n.x; v.vy -= vn * n.y; }
                if (!v.off) {
                    f.hp -= (isBoss ? o.bossChip : o.avChip) * dt;
                    f.hitAt = s.time;
                }
                if (isBoss && !v.immune?.includes(f.id) && !(v.stunned > s.time)) {
                    v.immune = [...(v.immune || []), f.id];
                    v.stunned = s.time + o.avStun * 0.6;
                    v.stunSlashes = 0;
                    if (v.charge) v.charge = null;
                    v.vx = n.x * 4; v.vy = n.y * 4;
                    s.stats.stuns++;
                    s.events.push({ type: 'stun', x: v.x, y: v.y, boss: true });
                }
                if (f.hp <= 0) zoneDown(f);
            }
        }
        // Turrets are defence (the owner's call): on their beat each shoots the nearest hunting Antivirus in reach (stunned
        // `turretStun` s; `avShots` hits and it's down, rebooting from a corner `avReboot` s later), else the nearest
        // corrupt packet in reach (wiped; Purifier Rounds wipe `turretPurge` more). They never take good packets.
        function turretStep() {
            for (const t of s.turrets) {
                if (s.time < t.at) continue;
                const dist = q => Math.hypot(q.x - t.x, q.y - t.y);
                const av = s.antivirus.filter(f => !(f.ally > s.time) && !f.off && !(f.stunned > s.time) && dist(f) <= o.turretRange + f.r).sort((p, q) => dist(p) - dist(q))[0];
                if (av) {
                    t.at = s.time + o.turretEvery;
                    av.shot = (av.shot || 0) + 1;
                    s.stats.turreted++;
                    if (av.shot >= o.avShots) {
                        s.antivirus = s.antivirus.filter(f => f !== av);
                        s.stats.avDown++;
                        avDue.push(s.time + o.avReboot);
                        avDue.sort((p, q) => p - q);
                        s.events.push({ type: 'avDown', x: av.x, y: av.y, from: { x: t.x, y: t.y } });
                    } else {
                        av.stunned = s.time + o.turretStun;
                        av.charge = null;
                        s.events.push({ type: 'zap', x: av.x, y: av.y, from: { x: t.x, y: t.y }, av: true, shots: av.shot, of: o.avShots });
                    }
                    continue;
                }
                const bad = s.packets.filter(p => p.kind === 'corrupt' && !spoofed(p) && dist(p) <= o.turretRange).sort((p, q) => dist(p) - dist(q)).slice(0, 1 + o.turretPurge);
                if (!bad.length) continue;
                t.at = s.time + o.turretEvery;
                s.stats.turreted++;
                s.stats.purged += bad.length;
                for (const p of bad) s.events.push({ type: 'zap', x: p.x, y: p.y, from: { x: t.x, y: t.y } });
                remove(bad);
            }
        }
        // Scanner towers: a short beam turning round each, tagging the good packets it passes.
        function towerStep(dt) {
            for (const t of s.towers) {
                const a0 = t.ang, a1 = a0 + o.towerSpeed * dt;
                t.ang = a1 % (Math.PI * 2);
                for (const p of s.packets) {
                    if (p.kind === 'corrupt' || Math.hypot(p.x - t.x, p.y - t.y) > o.towerRange) continue;
                    let d = (Math.atan2(p.y - t.y, p.x - t.x) - a0) % (Math.PI * 2);
                    if (d < 0) d += Math.PI * 2;
                    if (d <= a1 - a0 + 1e-9) tag(p);
                }
            }
        }

        // ---- System Firewalls: lines sweeping across the field -------------------------------------------
        function sweepStep(dt) {
            // No new scan while the boss stands (its arena: a scan snapped swipes mid-stun).
            if (s.boss && sweepAt - s.time < 2) sweepAt = s.time + 2;
            if (s.time >= sweepAt && !penBusy()) {
                sweepAt = s.time + o.sweepEvery;
                const axis = rand() < 0.5 ? 'x' : 'y', dir = rand() < 0.5 ? 1 : -1;
                const span = axis === 'x' ? w : h;
                s.sweeps.push({ id: s.nextId++, axis, dir, pos: dir > 0 ? 0 : span, t: 0 });
                s.stats.sweeps++;
                s.events.push({ type: 'sweep', axis, dir });
            }
            for (const sw of s.sweeps) {
                sw.t += dt;
                if (sw.t < o.sweepWarn) continue;
                const span = sw.axis === 'x' ? w : h;
                const before = sw.pos;
                sw.pos += sw.dir * span / o.sweepTime * dt;
                // Any open wire it passes over snaps.
                // Any open wire it passes over snaps: a segment straddling the band counts, not only its points.
                if (s.wire.length > 1) {
                    const lo = Math.min(before, sw.pos), hi = Math.max(before, sw.pos);
                    const c = q => (sw.axis === 'x' ? q.x : q.y);
                    for (let i = 0; i < s.wire.length; i++) {
                        const a = s.wire[i], b = s.wire[i + 1] || a;
                        if (Math.max(c(a), c(b)) >= lo && Math.min(c(a), c(b)) <= hi) { snap({ x: a.x, y: a.y }); break; }
                    }
                }
            }
            s.sweeps = s.sweeps.filter(sw => sw.pos >= -0.01 && sw.pos <= (sw.axis === 'x' ? w : h) + 0.01);
        }

        // ---- Herders --------------------------------------------------------------------------------------
        // Where the herders drive the data: the middle of the field.
        const gatherPoint = () => ({ x: w / 2, y: h / 2 });
        function herdStep(dt) {
            if (!s.herders.length) return;
            const g = gatherPoint();
            // Each herder takes one of the strays furthest from the gather point and goes round behind it.
            const strays = s.packets.filter(p => p.kind !== 'corrupt').map(p => ({ p, d: Math.hypot(p.x - g.x, p.y - g.y) })).sort((a, b) => b.d - a.d);
            const hostile = s.antivirus.filter(f => !(f.ally > s.time) && !(f.stunned > s.time) && !f.off);
            if (s.boss) hostile.push(s.boss);
            s.herders.forEach((hd, i) => {
                // An Antivirus that touches a herder stuns it (Evasive Herders steer clear of them).
                if (!(hd.stunned > s.time) && hostile.some(f => Math.hypot(f.x - hd.x, f.y - hd.y) < f.r + 0.25)) {
                    hd.stunned = s.time + o.herdStun;
                    s.stats.herdStuns++;
                    s.events.push({ type: 'herdStun', x: hd.x, y: hd.y });
                }
                if (hd.stunned > s.time) {
                    hd.vx *= 1 - Math.min(1, 3 * dt);
                    hd.vy *= 1 - Math.min(1, 3 * dt);
                    hd.x = Math.max(0.2, Math.min(w - 0.2, hd.x + hd.vx * dt));
                    hd.y = Math.max(0.2, Math.min(h - 0.2, hd.y + hd.vy * dt));
                    return;
                }
                const st = strays[i];
                let tx = g.x, ty = g.y;
                if (st && st.d > 0.8) {
                    tx = st.p.x + (st.p.x - g.x) / st.d * 0.9;
                    ty = st.p.y + (st.p.y - g.y) / st.d * 0.9;
                }
                hd.target = st ? st.p.id : null;
                let ax = Math.cos(Math.atan2(ty - hd.y, tx - hd.x)), ay = Math.sin(Math.atan2(ty - hd.y, tx - hd.x));
                if (o.herdEvade) {
                    for (const f of hostile) {
                        const dx = hd.x - f.x, dy = hd.y - f.y, d = Math.hypot(dx, dy) || 1;
                        const reach = 1.4 + 0.6 * o.herdEvade + f.r;
                        if (d < reach) { ax += dx / d * (reach - d) * 2 * o.herdEvade; ay += dy / d * (reach - d) * 2 * o.herdEvade; }
                    }
                    const al = Math.hypot(ax, ay) || 1;
                    ax /= al; ay /= al;
                }
                const k = Math.min(1, 4 * dt);
                hd.vx += (ax * o.herdSpeed - hd.vx) * k;
                hd.vy += (ay * o.herdSpeed - hd.vy) * k;
                hd.x = Math.max(0.2, Math.min(w - 0.2, hd.x + hd.vx * dt));
                hd.y = Math.max(0.2, Math.min(h - 0.2, hd.y + hd.vy * dt));
            });
            // Packets near a working herder turn: good ones toward the gather point, corrupt ones away from it.
            const kp = Math.min(1, o.herdPull * dt);
            const working = s.herders.filter(hd => !(hd.stunned > s.time));
            for (const p of s.packets) {
                if (!working.some(hd => Math.hypot(hd.x - p.x, hd.y - p.y) <= o.herdRadius)) continue;
                let ang = Math.atan2(g.y - p.y, g.x - p.x);
                if (p.kind === 'corrupt') ang += Math.PI;
                p.vx += (Math.cos(ang) * p.v - p.vx) * kp;
                p.vy += (Math.sin(ang) * p.v - p.vy) * kp;
                const vl = Math.hypot(p.vx, p.vy) || 1;
                p.vx = p.vx / vl * p.v;
                p.vy = p.vy / vl * p.v;
            }
        }

        // ---- Hijack, Collusion and Race Condition -------------------------------------------------------------
        // A hijacked Antivirus hunts the richest good packet near it and takes what it touches, for you.
        function allyStep(f, dt) {
            let best = null, bd = Infinity;
            for (const p of s.packets) {
                if (!isGood(p)) continue;
                const d = Math.hypot(p.x - f.x, p.y - f.y) / valueOf(p);
                if (d < bd) { bd = d; best = p; }
            }
            const speed = o.avHunt * o.avSpeed;
            if (best) {
                const ang = Math.atan2(best.y - f.y, best.x - f.x);
                const k = Math.min(1, o.avTurn * dt);
                f.vx += (Math.cos(ang) * speed - f.vx) * k;
                f.vy += (Math.sin(ang) * speed - f.vy) * k;
            }
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            bounce(f);
            f.hunting = false;
            const got = s.packets.filter(p => isGood(p) && Math.hypot(p.x - f.x, p.y - f.y) < f.r + p.r);
            if (got.length) takeFor(got, f, 'hijack');
        }
        // Packets taken for you outside a loop (a hijacked Antivirus, a partner core): paid at ×1.
        function takeFor(list, from, by) {
            const units = list.reduce((a, p) => a + valueOf(p), 0);
            s.stats.caught += list.length;
            s.stats.units += units;
            s.stats.gold += list.filter(p => p.kind === 'gold').length;
            if (by === 'partner') s.stats.partnered += list.length;
            s.events.push({ type: 'taken', by, x: from.x, y: from.y, units, packets: list.map(p => ({ x: p.x, y: p.y, kind: p.kind })) });
            remove(list);
        }
        // Partner cores collect the good packets in their circle once a second, for you, until they burn out.
        function partnerStep(dt) {
            for (const c of s.partners) {
                c.age += dt;
                c.at -= dt;
                if (c.at > 0) continue;
                c.at = 1;
                const got = s.packets.filter(p => isGood(p) && Math.hypot(p.x - c.x, p.y - c.y) <= c.r && !shielded(c, p));
                if (got.length) takeFor(got, c, 'partner');
            }
            for (const c of s.partners.filter(c => c.age >= o.partnerLife)) s.events.push({ type: 'partnerGone', x: c.x, y: c.y, r: c.r, done: true });
            s.partners = s.partners.filter(c => c.age < o.partnerLife);
        }
        // Race Condition: the held loop's multiplier grows; a corrupt packet getting in (past the scrubbers) spoils it.
        function raceStep(dt) {
            const r = s.race;
            if (!r) return;
            // Review 1's timing rule: the held loop is a risk. A Full Scan sweeping over it, or the boss dashing through
            // it, breaks it: no catch, and the wire snaps.
            const b = s.boss;
            const dashing = b && b.charge && b.charge.t >= b.charge.warn && pointInPolygon(b, r.poly);
            const scanned = s.sweeps.some(sw => sw.t >= o.sweepWarn && r.poly.some(q => Math.abs((sw.axis === 'x' ? q.x : q.y) - sw.pos) < 0.3));
            if (dashing || scanned) {
                s.race = null;
                s.stats.raceBroken++;
                const c = centroid(r.poly);
                s.events.push({ type: 'raceBroken', x: c.x, y: c.y, by: dashing ? 'boss' : 'scan' });
                snap(c);
                return;
            }
            r.t += dt;
            r.bonus = Math.min(o.raceMax, o.raceRate * r.t);
            // Held to its cap, it pays out (holding is a timing call, not a farm).
            if (r.bonus >= o.raceMax) { settleRace(); return; }
            const inLoop = s.packets.filter(p => pointInPolygon(p, r.poly));
            const bad = inLoop.filter(p => p.kind === 'corrupt' && !spoofed(p)).length;
            if (bad > forgives(inLoop.length - bad)) settleRace();
        }
        function settleRace() {
            const r = s.race;
            if (!r) return;
            s.race = null;
            if (r.t >= 0.3) s.stats.raced++;
            payLoop(r.poly, r.bonus);
        }

        // ---- Flicks: the boss fight (parry, slash), Packet Spoofing, Privilege Escalation --------------------------
        // A quick straight stroke, judged when the pen lifts. Returns true if it was a flick (it isn't a wire).
        function flick() {
            const st = s.stroke;
            if (!st || st.pts.length < 2) return false;
            const boss = s.boss, ally = o.escalate ? s.antivirus.filter(f => f.ally > s.time) : [];
            if (!boss && !o.spoof) return false;
            const a = st.pts[0], b = st.pts[st.pts.length - 1];
            const chord = Math.hypot(b.x - a.x, b.y - a.y), path = wireLength(st.pts);
            if (s.real - st.t0 > o.flickTime || chord < o.flickLength || chord < path * 0.75) return false;
            let hit = false, near = false;
            // A grabbed mine flicked at the boss (Snare 15): from the mine, in the boss's direction (it needn't reach it).
            const mine = boss && s.held.find(m => Math.hypot(m.x - a.x, m.y - a.y) < MINE_R + Math.max(0.6, closeR * 0.6));
            if (mine) {
                const dx = (b.x - a.x) / chord, dy = (b.y - a.y) / chord;
                const along = (boss.x - mine.x) * dx + (boss.y - mine.y) * dy;
                const off = Math.abs((boss.x - mine.x) * dy - (boss.y - mine.y) * dx);
                if (along > 0 && off < boss.r * 1.6) {
                    s.held = s.held.filter(m => m !== mine);
                    s.stats.mineThrows++;
                    s.events.push({ type: 'mineThrow', x: boss.x, y: boss.y, from: { x: mine.x, y: mine.y } });
                    if (damageBoss(boss, o.mineThrow, 'mine', true) && s.boss) boss.stunned = Math.max(boss.stunned, s.time + o.mineReel);
                    return true;
                }
            }
            if (boss) {
                const through = segDist(boss, a, b) < boss.r;
                // Swipes at the boss are never flagged (a blind playtest: a missed slash set off an alert it hadn't been
                // taught about); flags are for spoofing.
                const rammer = ally.find(f => Math.hypot(f.x - a.x, f.y - a.y) < f.r + 0.7);
                if (rammer && through) {
                    // Privilege Escalation: the hijacked Antivirus rams it (no minions), and is spent.
                    s.antivirus = s.antivirus.filter(f => f !== rammer);
                    s.stats.escalations++;
                    s.events.push({ type: 'escalate', x: boss.x, y: boss.y, from: { x: rammer.x, y: rammer.y } });
                    if (damageBoss(boss, o.escalateDamage, 'ram')) boss.stunned = Math.max(boss.stunned, s.time + o.bossStun * 0.6);
                    hit = true;
                } else if (o.parry && boss.charge && boss.charge.t < boss.charge.warn) {
                    // A parry (Riposte): across its warning line, through the boss, or a flick that comes within reach of the line
                    // (forgiving: it's a quick gesture on a moving target, often a thumb).
                    const L = chargeReach(boss);
                    const end = { x: boss.x + boss.charge.dx * L, y: boss.y + boss.charge.dy * L };
                    const reach = Math.max(0.5, 0.04 * shortSide);
                    const close = segDist(a, boss, end) < reach || segDist(b, boss, end) < reach || segDist({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, boss, end) < reach;
                    if (segIntersect(a, b, boss, end) || segDist(boss, a, b) < boss.r * 1.4 || close) {
                        s.events.push({ type: 'parryFlick', a, b });
                        parryBoss(boss);
                        hit = true;
                    }
                } else if (through && boss.stunned > s.time) {
                    // A slash: through it while it reels (a parry or one of your Firewalls), a flick at a time.
                    if (s.real - boss.slashAt >= o.slashGap) {
                        boss.slashAt = s.real;
                        // A stun allows `slashCap` slashes; the last one ends it.
                        boss.stunSlashes = (boss.stunSlashes || 0) + 1;
                        if (boss.stunSlashes >= o.slashCap) boss.stunned = Math.min(boss.stunned, s.time + 0.1);
                        s.stats.slashes++;
                        // Blue Screen: every `crashEvery`th slash on this boss crashes it.
                        boss.slashCount = (boss.slashCount || 0) + 1;
                        const crash = o.crash > 0 && !boss.shielded && boss.slashCount % o.crashEvery === 0;
                        if (crash) s.stats.crashes++;
                        s.events.push({ type: 'slash', x: boss.x, y: boss.y, a, b, shielded: boss.shielded, crash });
                        if (damageBoss(boss, o.slashDamage * (crash ? o.crashMult : 1), crash ? 'crash' : 'slash') && s.boss) { boss.vx += (b.x - a.x) / chord * 1.5; boss.vy += (b.y - a.y) / chord * 1.5; }
                    }
                    hit = true;
                } else if (through) {
                    // Its guard is up: loop it (or parry its charge) first.
                    s.events.push({ type: 'bossBlock', x: boss.x, y: boss.y, reason: 'guard' });
                }
            }
            if (o.spoof && s.real >= (s.spoofReady || 0)) {
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const cut = s.packets.filter(p => p.kind === 'corrupt' && !spoofed(p) && segDist(p, a, b) < p.r + 0.15)
                    .sort((p, q) => Math.hypot(p.x - mid.x, p.y - mid.y) - Math.hypot(q.x - mid.x, q.y - mid.y)).slice(0, o.spoofCap);
                if (cut.length) {
                    s.spoofReady = s.real + o.spoofCooldown;
                    for (const p of cut) p.spoof = s.time + o.spoofSeconds;
                    s.stats.spoofed += cut.length;
                    s.events.push({ type: 'spoof', a, b, packets: cut.map(p => ({ x: p.x, y: p.y })) });
                    hit = true;
                } else if (!near && s.packets.some(p => p.kind === 'corrupt' && !spoofed(p) && segDist(p, a, b) < o.flagNear * 0.6)) near = true;
            }
            // A flick that went near something it could hit and missed is flagged; one through empty field is a stroke.
            if (hit) return true;
            if (!near) return false;
            flag(a, b);
            return true;
        }
        // A sloppy exploit is flagged; `flagLimit` flags and an IDS alert goes off.
        function flag(a, b) {
            s.flags++;
            s.stats.flags++;
            s.events.push({ type: 'flag', a, b, flags: s.flags, limit: o.flagLimit });
            if (s.flags < o.flagLimit) return;
            s.flags = 0;
            s.stats.ids++;
            let what = 'antivirus';
            if (o.boss && !s.bossDone && !s.boss) { bootBoss(true); what = 'boss'; }
            else if (s.boss) { s.boss.enraged = true; s.boss.chargeAt = Math.min(s.boss.chargeAt ?? 0, s.time + 1); what = 'enraged'; }
            else bootAntivirus();
            s.events.push({ type: 'ids', boss: !!s.boss, what });
        }

        function stepOnce(dt) {
            s.real += dt;
            if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
            bubbleStep(dt);
            wallsNow = wallsUp();
            // Frozen: the field's clock stops (nothing moves, nothing comes due, tags hold, Focus holds); only your pen works.
            // Focus runs at half speed while frozen (it used to hold: up to 18 s of risk-free drawing a run).
            if (frozen()) {
                s.frozenLeft = Math.max(0, s.frozenLeft - dt);
                s.focus = Math.max(0, s.focus - o.idleDrain * 0.5 * dt);
                if (s.focus <= 0) end();
                return;
            }
            s.time += dt;
            raceStep(dt);
            splitStep();
            heldStep();
            // Backpressure: packets turned back resume their course.
            for (const p of s.packets) if (p.back && s.time >= p.back.until) { p.vx = p.back.vx; p.vy = p.back.vy; p.back = null; }
            flock(dt);
            const out = [];
            for (const p of s.packets) {
                const px = p.x, py = p.y;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (wallsNow.length) zoneStep(p, px, py, dt);
                p.age += dt;
                // The pipeline flows on: off the field and gone, unless the Containment Field turns good ones back.
                if (!o.flow || (o.contain && p.kind !== 'corrupt')) bounce(p);
                else if (p.x < -p.r || p.x > w + p.r || p.y < -p.r || p.y > h + p.r) out.push(p);
            }
            if (out.length) {
                s.stats.escaped += out.filter(p => p.kind !== 'corrupt').length;
                remove(out);
            }
            herdStep(dt);
            botStep(dt);
            scannerStep(dt);
            towerStep(dt);
            turretStep();
            laserStep(dt);
            rogueStep(dt);
            partnerStep(dt);
            for (const r of s.rebuild.filter(r => s.time >= r.at)) {
                const z = makeZone(r.x, r.y);
                if (o.autoTools) { z.auto = true; z.until = s.time + o.zoneLife; }
                s.walls.push(z);
                s.events.push({ type: 'rebuilt', x: r.x, y: r.y });
            }
            s.rebuild = s.rebuild.filter(r => s.time < r.at);
            autoZoneStep();
            toolStep();
            pickupStep(dt);
            // A sector with no boss: catching its goal of packets clears it (the run goes on).
            if (o.goal > 0 && !s.goalDone && goalProgress() >= o.goal) {
                s.goalDone = true;
                s.events.push({ type: 'goal', x: w / 2, y: h / 2, caught: Math.round(goalProgress()), focus: clearBonus() });
            }
            bossStep(dt);
            sweepStep(dt);
            while (avDue.length && s.time >= avDue[0] && !penBusy()) { avDue.shift(); bootAntivirus(); }
            for (const f of s.antivirus) {
                // Hijacked: it works for you until its time is up, then reboots (stunned a moment) and turns back.
                if (f.ally) {
                    if (f.ally > s.time) { allyStep(f, dt); continue; }
                    f.ally = 0;
                    f.stunned = s.time + 1;
                    s.events.push({ type: 'hijackEnd', x: f.x, y: f.y });
                }
                // A boss arena (Snare 12, a review's call: from sector 15 the fight was decided by the hazard pile before
                // it began): while the boss stands, the field's Antivirus hold their update (its own minions still hunt).
                if (s.boss && !f.minion && o.avOff > 0) {
                    if (!f.off) { f.off = true; s.events.push({ type: 'avOff', x: f.x, y: f.y }); }
                    f.shift = s.time + o.avOff;
                }
                // Its shift: `avOn` s hunting, `avOff` s updating (harmless and slow: a safe window).
                else if (o.avOff > 0 && s.time >= f.shift) {
                    f.off = !f.off;
                    f.shift = s.time + (f.off ? o.avOff : o.avOn);
                    s.events.push({ type: f.off ? 'avOff' : 'avOn', x: f.x, y: f.y });
                }
                if (f.off && !(f.stunned > s.time)) {
                    const v = Math.hypot(f.vx, f.vy) || 1, slow = o.avPatrol * 0.25;
                    f.vx += (f.vx / v * slow - f.vx) * Math.min(1, 2 * dt);
                    f.vy += (f.vy / v * slow - f.vy) * Math.min(1, 2 * dt);
                    f.x += f.vx * dt;
                    f.y += f.vy * dt;
                    bounce(f);
                    f.hunting = false;
                    continue;
                }
                // Stunned: it drifts to a stop and can't snap anything.
                if (f.stunned > s.time) {
                    f.x += f.vx * dt;
                    f.y += f.vy * dt;
                    f.vx *= 1 - Math.min(1, 3 * dt);
                    f.vy *= 1 - Math.min(1, 3 * dt);
                    bounce(f);
                    f.hunting = false;
                    continue;
                }
                // The open wire first; failing that, your nearest decoy or partner core (not your Firewalls).
                const wireTarget = s.wire.length > 1 ? nearestWire(f.x, f.y) : null;
                const lures = [...s.decoys, ...s.partners];
                const decoy = !wireTarget && lures.length ? lures.reduce((b, a) => (!b || (a.x - f.x) ** 2 + (a.y - f.y) ** 2 < (b.x - f.x) ** 2 + (b.y - f.y) ** 2 ? a : b), null) : null;
                const target = wireTarget || decoy;
                f.hunting = !!wireTarget;
                const speed = (wireTarget ? o.avHunt : decoy ? o.avPatrol * 1.4 : o.avPatrol) * o.avSpeed;
                if (target) {
                    const ang = Math.atan2(target.y - f.y, target.x - f.x);
                    const k = Math.min(1, o.avTurn * dt);
                    f.vx += (Math.cos(ang) * speed - f.vx) * k;
                    f.vy += (Math.sin(ang) * speed - f.vy) * k;
                } else {
                    const v = Math.hypot(f.vx, f.vy) || 1;
                    f.vx += (f.vx / v * speed - f.vx) * Math.min(1, dt);
                    f.vy += (f.vy / v * speed - f.vy) * Math.min(1, dt);
                }
                f.x += f.vx * dt;
                f.y += f.vy * dt;
                bounce(f);
                if (s.wire.length > 1) {
                    for (let i = 1; i < s.wire.length; i++) {
                        if (segDist(f, s.wire[i - 1], s.wire[i]) < f.r) { snap(f); break; }
                    }
                }
                // It breaks a decoy it reaches.
                const hit = s.decoys.find(dc => Math.hypot(dc.x - f.x, dc.y - f.y) < f.r + 0.25);
                if (hit) {
                    s.decoys = s.decoys.filter(dc => dc !== hit);
                    s.stats.decoysLost++;
                    s.events.push({ type: 'decoyGone', x: hit.x, y: hit.y });
                }
                // And a partner core it reaches.
                const pc = s.partners.find(c => Math.hypot(c.x - f.x, c.y - f.y) < f.r + 0.4);
                if (pc) {
                    s.partners = s.partners.filter(c => c !== pc);
                    s.events.push({ type: 'partnerGone', x: pc.x, y: pc.y, r: pc.r });
                }
                zoneBlock(f, dt);
            }
            // Infinite Loop: a closed loop catches again what good has swum inside it since (red is left where it is).
            for (const e of s.echoes.filter(e => s.time >= e.at)) {
                s.echoes = s.echoes.filter(x => x !== e);
                const got = s.packets.filter(p => isGood(p) && pointInPolygon(p, e.poly));
                if (!got.length) continue;
                const units = got.reduce((a, p) => a + valueOf(p), 0) * e.mult;
                const gold = got.filter(p => p.kind === 'gold').length;
                remove(got);
                s.stats.echoes++;
                s.stats.caught += got.length;
                s.stats.gold += gold;
                s.stats.units += units;
                const at = centroid(e.poly);
                s.events.push({ type: 'catch', echo: e.n || 1, x: at.x, y: at.y, poly: e.poly, area: polygonArea(e.poly), count: got.length, gold, mult: e.mult, units, packets: got, chained: [], scrubbed: 0 });
            }
            // Packet Storm: a school of gold swims in.
            if (s.time >= s.stormAt) {
                const lv = Math.max(0, o.storm - 1), size = o.stormSize + o.stormGrow * lv;
                s.stormAt = s.time + Math.max(6, o.stormEvery - o.stormFaster * lv);
                const before = s.packets.length;
                let left = size;
                while (left > 0) { const n = Math.min(left, 12); school(n, true); left -= n; }
                for (const p of s.packets.slice(before)) p.kind = 'gold';
                s.stats.storms++;
                s.events.push({ type: 'storm', count: size });
            }
            // Refills: schools of the missing good packets swim in from an edge, corrupt ones one at a time.
            if (s.time >= refillAt) {
                refillAt = Infinity;
                let missing = goodTarget - goodCount();
                while (missing > 0) {
                    const n = Math.min(missing, Math.max(2, Math.round(o.schoolSize * (0.6 + rand() * 0.8))));
                    school(n, true);
                    missing -= n;
                }
            }
            for (let i = pendingCorrupt.length - 1; i >= 0; i--) {
                if (s.time >= pendingCorrupt[i] && corruptCount() < corruptTarget) { corrupt(true); pendingCorrupt.splice(i, 1); }
            }
            // No drain while the boss reels (round 1 of the review: the first boss was lost to the clock, not the fight).
            const drain = s.time >= s.freeDrawUntil && !(s.boss && s.boss.stunned > s.time) ? o.idleDrain : 0;
            s.focus = Math.max(0, s.focus - drain * dt);
            if (s.focus <= 0) end();
        }

        // Go deeper: once a sector is cleared, the run can go on into the next (the owner's call: beating a boss shouldn't
        // stop the run, and the player picks when to move on). `next` is that sector's options (engine.js snareOpts); only
        // what depends on the sector is taken from it. Its hazards come in from now (a scan, Antivirus or the Rogue AI the
        // last sector didn't have), and its boss or goal starts over.
        // How far the sector's goal is: packets caught in it (not by rushed loops), and half of what loops were worth past them.
        const goalProgress = () => s.stats.caught - s.sectorCaught - s.goalSkip + s.goalBonus;
        // A cleared sector's reward: Focus, so the run keeps gathering there. Returns what it added.
        function clearBonus() {
            const before = s.focus;
            // Each clear in a run gives half the last's (0.4, 0.2, 0.1 of the bar): going deeper chained sectors for free.
            s.focus = Math.min(s.maxFocus, s.focus + o.clearFocus * Math.pow(0.5, s.clears++) * s.maxFocus);
            return Math.round(s.focus - before);
        }
        const SECTOR_KEYS = ['corruptShare', 'avSpeed', 'packetSpeed', 'antivirus', 'sweepFirst', 'sweepEvery', 'rogue', 'rogueFirst', 'rogueEvery',
            'teachRed', 'boss', 'goal', 'bossAt', 'bossCatch', 'bossR', 'bossSpeed', 'bossCharge', 'bossWarn', 'bossStun', 'bossMines', 'mineEvery', 'bossMinions'];
        function nextSector(next = {}) {
            if (s.over) return;
            const before = { av: o.antivirus.length, sweep: o.sweepFirst, rogue: o.rogue };
            for (const k of SECTOR_KEYS) if (next[k] !== undefined) o[k] = next[k];
            corruptTarget = redTarget();
            // Red the new sector adds swims in from upstream over the next few seconds (going deeper from a clean sector 1).
            for (let i = corruptCount() + pendingCorrupt.length; i < corruptTarget; i++) pendingCorrupt.push(s.time + 1 + rand() * 3);
            // New hazards arrive from now: the Antivirus this sector adds, a first scan, the Rogue AI's first cores.
            for (let i = before.av; i < o.antivirus.length; i++) avDue.push(s.time + 3 + 2 * (i - before.av));
            avDue.sort((p, q) => p - q);
            if (!Number.isFinite(before.sweep) && Number.isFinite(o.sweepFirst)) sweepAt = s.time + o.sweepFirst;
            if (!before.rogue && o.rogue) s.rogueAt = s.time + o.rogueFirst;
            s.boss = null;
            s.bossDone = false;
            s.goalDone = false;
            s.handCaught = 0;
            s.sectorAt = s.time;
            s.sectorCaught = s.stats.caught;
            s.goalSkip = 0;
            s.goalBonus = 0;
            for (const m of [...s.mines, ...s.held]) s.events.push({ type: 'mineDown', x: m.x, y: m.y, boss: true });
            s.mines = [];
            s.held = [];
            s.links = [];
            s.stats.sectors++;
            s.events.push({ type: 'sector', boss: o.boss, goal: o.goal });
        }

        function end() {
            if (s.over) return;
            // A bubble held when Focus runs out is let go, and pays (round 1 of the review: it froze behind the end card).
            if (s.bubble?.growing) popBubble();
            settleRace();
            // …and if that catch reached the sector's goal, it clears (round 3 of the review: "Goal 55/55" and not cleared).
            if (o.goal > 0 && !s.goalDone && goalProgress() >= o.goal) {
                s.goalDone = true;
                s.events.push({ type: 'goal', x: w / 2, y: h / 2, caught: Math.round(goalProgress()), focus: 0 });
            }
            s.splits = [];
            s.over = true;
            s.wire = [];
            s.drawing = false;
            s.locks = [];
            s.events.push({ type: 'end', stats: { ...s.stats }, layout: layoutOf() });
        }

        // Everything you placed, as shares of the field (the next run puts it back).
        const r3 = v => Math.round(v * 1000) / 1000;
        function layoutOf() {
            return {
                // A section Great Wall is rebuilding counts as standing (it holds its slot).
                zones: [...s.walls.filter(f => f.hp > 0 && !f.auto), ...s.rebuild].map(f => [r3(f.x / w), r3(f.y / h)]),
                decoys: s.decoys.map(d => [r3(d.x / w), r3(d.y / h)]),
                turrets: s.turrets.map(t => [r3(t.x / w), r3(t.y / h)]),
                towers: s.towers.map(t => [r3(t.x / w), r3(t.y / h)])
            };
        }

        // What a loop would catch: the packets inside, how many are corrupt beyond what the scrubbers forgive, its
        // multiplier and its worth. Used to close a loop and, on the open wire, for the live preview.
        // How many corrupt packets a loop forgives: a flat one per Scrubbers level, plus one per `scrubPer` good packets
        // inside once you own any (Snare 14.3: a flat count spoiled every big loop on a packed field).
        function forgives(good) { return o.scrubbers > 0 ? o.scrubbers + Math.floor(good / o.scrubPer) : 0; }
        function judge(poly, bonus = 0) {
            const area = polygonArea(poly);
            const inside = s.packets.filter(p => pointInPolygon(p, poly));
            const corrupt = inside.filter(p => !isGood(p));
            const good = inside.filter(isGood);
            // Garbage Collection: a loop of nothing but corrupt packets is collected, not spoiled.
            const garbage = !!o.gc && !good.length && corrupt.length > 0;
            const spoiled = !garbage && corrupt.length > forgives(good.length);
            // A loop wholly inside one of your Firewall sections is safe (red can't get in), so it pays less.
            const safe = wallsNow.some(f => poly.every(v => inZone(v, f, 0.05)));
            const mult = areaMult(area, o, fieldArea) * (1 + bonus) * (safe && !o.pen ? o.safeLoop : 1);
            const value = good.reduce((a, p) => a + valueOf(p), 0);
            return { area, inside, corrupt, good, spoiled, garbage, mult, value, safe, units: spoiled ? 0 : value * mult };
        }

        // The Chokehold: a core inside is quarantined; what it stole comes back, half of it, as a bonus.
        function quarantineIn(poly) {
            const caught = s.cores.filter(c => pointInPolygon(c, poly));
            if (!caught.length) return false;
            s.cores = s.cores.filter(c => !caught.includes(c));
            for (const c of caught) {
                const units = 2 + 0.5 * c.stole;
                s.stats.quarantined++;
                s.stats.units += units;
                // Collusion: it may offer to work for you instead.
                const partner = o.collude > 0 && rand() < o.collude;
                if (partner) {
                    s.partners.push({ id: s.nextId++, x: c.x, y: c.y, r: Math.max(1, Math.min(c.r, o.rogueMax * shortSide * 0.6)), age: 0, at: 1 });
                    s.stats.partners++;
                }
                s.events.push({ type: 'quarantine', x: c.x, y: c.y, r: c.r, units, poly, partner });
            }
            return true;
        }
        // Loops round the boss stun it (the wire never touched it, or it would have snapped): `bossLoops` of them, each
        // within `bossLoopWindow` of the last; a spiral round it counts each turn.
        function loopBoss(poly) {
            if (!s.boss || s.boss.stunned > s.time) return false;
            if (!pointInPolygon(s.boss, poly) && !(s.boss.trail || []).some(q => pointInPolygon(q, poly))) {
                // round the boss's way but not round it: say so (not "loops are for the boss")
                s.events.push({ type: 'bossMissed', x: s.boss.x, y: s.boss.y });
                return true;
            }
            const b = s.boss;
            b.loops = s.time - (b.loopAt ?? -1e9) <= o.bossLoopWindow ? (b.loops || 0) + 1 : 1;
            b.loopAt = s.time;
            if (b.loops >= o.bossLoops) {
                b.loops = 0;
                stunBoss(b);
                s.stats.loopStuns++;
                s.events.push({ type: 'bossLooped', x: b.x, y: b.y, poly });
            } else s.events.push({ type: 'bossLoop', x: b.x, y: b.y, poly, n: b.loops, of: o.bossLoops });
            return true;
        }
        // Hijack: a stunned Antivirus inside turns.
        function hijackIn(poly) {
            if (!o.hijack) return false;
            let any = false;
            for (const f of s.antivirus) {
                if (f.ally || !(f.stunned > s.time) || !pointInPolygon(f, poly)) continue;
                f.ally = s.time + o.hijackSeconds;
                f.stunned = 0;
                s.stats.hijacked++;
                s.events.push({ type: 'hijack', x: f.x, y: f.y });
                any = true;
            }
            return any;
        }

        // Close a loop. With bubbles (the game) a drawn loop only circles the boss; the old wire catch (`bubble: 0`):
        // a core, a mine or a stunned Antivirus inside is dealt with at once, and the packets are snared, or spoiled if
        // anything corrupt (past the scrubbers) is in there. `held`: the pen is still down, so Race Condition can hold
        // the loop open.
        function close(poly, held = false) {
            const at = centroid(poly);
            s.leftStart = false;
            if (o.bubble) {
                if (!loopBoss(poly)) s.events.push({ type: 'loopOnly', x: at.x, y: at.y, poly });
                return;
            }
            const j = judge(poly);
            let acted = s.cores.length && j.area <= o.chokeArea * fieldArea ? quarantineIn(poly) : false;
            if (clearMines(poly)) acted = true;
            if (loopBoss(poly)) acted = true;
            if (hijackIn(poly)) acted = true;
            if (!j.inside.length) {
                if (acted) return;
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area: j.area });
                return;
            }
            // Race Condition: a clean loop closed with the pen still down stays open while the pen holds still.
            if (o.race && held && !j.spoiled && !j.garbage && j.good.length) {
                s.race = { poly, at: s.penAt, t: 0, bonus: 0 };
                s.events.push({ type: 'raceStart', x: at.x, y: at.y, poly });
                return;
            }
            payLoop(poly, 0, j);
        }

        // Let go of a bubble (Snare 15): a core inside is quarantined, a mine grabbed, a stunned Antivirus hijacked; then
        // it catches (Supernova if the field is frozen, Race Condition's growth on top), and a full one splits.
        function releaseBubble(poly, b) {
            const at = { x: b.x, y: b.y };
            let acted = quarantineIn(poly);
            if (grabMines(poly)) acted = true;
            if (hijackIn(poly)) acted = true;
            if (o.star && frozen()) { payNova(b, poly); return; }
            const j = judge(poly, b.bonus);
            if (!j.inside.length) {
                if (acted) return;
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area: j.area });
                return;
            }
            if (b.bonus > 0) s.stats.raced++;
            payLoop(poly, b.bonus, j);
            if (o.fork && b.full && !j.spoiled && !j.garbage && j.good.length && !s.over) split(b, j.mult);
        }
        // Split: the full bubble forks into smaller ones round it, which catch a moment later.
        function split(b, mult) {
            const n = 1 + o.fork, a0 = rand() * Math.PI * 2, kids = [];
            for (let i = 0; i < n; i++) {
                const ang = a0 + i * Math.PI * 2 / n, r = b.r * o.splitR, d = b.r * o.splitDist;
                const x = Math.max(r * 0.5, Math.min(w - r * 0.5, b.x + Math.cos(ang) * d)), y = Math.max(r * 0.5, Math.min(h - r * 0.5, b.y + Math.sin(ang) * d));
                kids.push({ x, y, r, at: s.time + o.splitDelay, mult });
            }
            s.splits.push(...kids);
            s.events.push({ type: 'split', x: b.x, y: b.y, kids: kids.map(k => ({ x: k.x, y: k.y, r: k.r })) });
        }
        function splitStep() {
            for (const k of s.splits.filter(q => s.time >= q.at)) {
                s.splits = s.splits.filter(q => q !== k);
                const poly = circle(k.x, k.y, k.r), j = judge(poly);
                if (!j.good.length) continue;
                if (j.spoiled) { s.events.push({ type: 'splitSpoiled', x: k.x, y: k.y, r: k.r }); continue; }
                const mult = Math.min(o.maxMult * o.forkMax, j.mult * k.mult);
                s.stats.forks++;
                payLoop(poly, 0, { ...j, mult, units: j.value * mult, split: true });
            }
        }
        // Supernova: let go while the field is frozen, it bursts to `novaRing` × its size; everything good in that at
        // ×`starMult` on top of the bubble's multiplier, red there deleted, mines there cleared.
        function payNova(b, poly) {
            const big = circle(b.x, b.y, b.r * o.novaRing);
            clearMines(big);
            const j = judge(big), inner = judge(poly, b.bonus);
            if (j.corrupt.length) {
                s.stats.scrubbed += j.corrupt.length;
                remove(j.corrupt);
            }
            s.stats.stars++;
            s.events.push({ type: 'nova', x: b.x, y: b.y, r: b.r * o.novaRing });
            if (!j.good.length) return;
            const mult = inner.mult * o.starMult;
            payLoop(big, 0, { ...j, inside: j.good, corrupt: [], spoiled: false, garbage: false, mult, units: j.value * mult, star: true });
        }
        // Pay a closed loop (at once, or when a held Race Condition loop lets go, `bonus` its growth).
        function payLoop(poly, bonus, j = judge(poly, bonus)) {
            const at = centroid(poly);
            if (!j.inside.length) {
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area: j.area });
                return;
            }
            if (j.garbage) {
                // Focus back for a few at most, and half of it if the last collection was only moments ago (a decoy
                // piling red up made it a Focus engine).
                const back = o.gcFocus * Math.min(j.corrupt.length, o.gcCap) * (s.real - (s.gcAt ?? -1e9) < o.gcRepeat ? 0.5 : 1);
                s.gcAt = s.real;
                s.focus = Math.min(s.maxFocus, s.focus + back);
                s.stats.collected += j.corrupt.length;
                s.events.push({ type: 'garbage', x: at.x, y: at.y, poly, count: j.corrupt.length, focus: back, packets: j.inside.map(p => ({ x: p.x, y: p.y })) });
                remove(j.corrupt);
                return;
            }
            if (j.spoiled) {
                s.streak = 0;
                s.cleanRun = 0;
                remove(j.inside);
                s.stats.corrupted++;
                s.focus = Math.max(0, s.focus - o.corruptPenalty);
                s.events.push({ type: 'corrupt', x: at.x, y: at.y, poly, area: j.area, count: j.inside.length, corrupt: j.corrupt.length, packets: j.inside });
                if (s.focus <= 0) end();
                return;
            }
            // Chain Lightning: arcs from the snared packets to good ones outside the loop, nearest first.
            const chained = [];
            if (o.chain > 0) {
                const outside = s.packets.filter(p => isGood(p) && !j.inside.includes(p));
                const cands = [];
                for (const q of outside) {
                    let best = null, bd = o.chainRange;
                    for (const p of j.good) {
                        const d = Math.hypot(q.x - p.x, q.y - p.y);
                        if (d <= bd) { bd = d; best = p; }
                    }
                    if (best) cands.push({ q, from: best, d: bd });
                }
                cands.sort((a, b) => a.d - b.d || a.q.id - b.q.id);
                // Never more than twice the packets the loop itself caught (a scribble's one-packet loop arcs twice; Snare 14
                // loosened it from once, the owner's call: Chain Lightning had to feel like a power).
                const arcs = Math.min(o.chain, 2 * j.good.length);
                for (const c of cands.slice(0, arcs)) chained.push({ packet: c.q, from: { x: c.from.x, y: c.from.y } });
                // Chain Storm: each hop arcs on from the packets the last one reached, to as many again.
                let front = chained.map(c => c.packet);
                for (let hop = 0; hop < o.chainHops && front.length; hop++) {
                    const taken = new Set([...j.inside, ...chained.map(c => c.packet)]);
                    const next = [];
                    for (const q of s.packets) {
                        if (!isGood(q) || taken.has(q)) continue;
                        let best = null, bd = o.chainRange;
                        for (const p of front) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bd) { bd = d; best = p; } }
                        if (best) next.push({ q, from: best, d: bd });
                    }
                    next.sort((a, b) => a.d - b.d || a.q.id - b.q.id);
                    const add = next.slice(0, arcs);
                    for (const c of add) chained.push({ packet: c.q, from: { x: c.from.x, y: c.from.y } });
                    front = add.map(c => c.q);
                }
            }
            const chainValue = chained.reduce((a, c) => a + valueOf(c.packet), 0);
            // A loop closed moments after the last (a scribble, lifted or not) pays half, doesn't count toward the
            // sector's goal and sets off none of the clean-loop rewards.
            // (Bubbles aren't rushed: they already cost the time they're held; round 2 of the review.)
            const hasty = !o.bubble && s.real - s.lastLoopAt < o.scribbleGap;
            s.lastLoopAt = s.real;
            // A clean streak: each clean catch in a row before this one adds `streakPay` (careful play pays).
            const run = Math.min(s.cleanRun, o.streakMax);
            const units = (j.value + chainValue) * j.mult * (hasty ? o.scribblePay : 1) * (1 + o.streakPay * run);
            const gold = j.good.filter(p => p.kind === 'gold').length + chained.filter(c => c.packet.kind === 'gold').length;
            remove([...j.inside, ...chained.map(c => c.packet)]);
            const count = j.good.length + chained.length;
            s.stats.catches++;
            s.stats.caught += count;
            if (hasty) s.goalSkip += count;
            // A big clean loop counts toward the goal at half its worth past its packets (late goals outran the field).
            else s.goalBonus += Math.max(0, units - count) / 2;
            s.handCaught += count;
            s.stats.gold += gold;
            s.stats.chained += chained.length;
            s.stats.scrubbed += j.corrupt.length;
            s.stats.units += units;
            s.stats.bestCatch = Math.max(s.stats.bestCatch, units);
            s.stats.bestMult = Math.max(s.stats.bestMult, j.mult);
            const clean = j.corrupt.length === 0 && !hasty;
            s.cleanRun = clean ? s.cleanRun + 1 : 0;
            // Firehose: a clean loop sends a pulse of packets in from upstream.
            if (o.pulse && clean) {
                school(2 * o.pulse, true);
                s.stats.pulses++;
                s.events.push({ type: 'pulse', count: 2 * o.pulse });
            }
            // Clean Sweep: a clean loop, and drawing is free for a moment.
            if (o.cleanSweep && clean) {
                s.freeDrawUntil = s.time + o.cleanSweep;
                s.stats.sweepsClean++;
                s.events.push({ type: 'cleanSweep', x: at.x, y: at.y, until: s.freeDrawUntil });
            }
            // Backpressure: the packets round the loop turn back against their course for a moment.
            if (o.backpressure) {
                const R = shortSide * (0.12 + 0.04 * o.backpressure);
                let n = 0;
                for (const p of s.packets) {
                    if (p.kind === 'corrupt' || p.back || Math.hypot(p.x - at.x, p.y - at.y) > R) continue;
                    p.back = { until: s.time + o.backSeconds, vx: p.vx, vy: p.vy };
                    p.vx = -p.vx * 0.6; p.vy = -p.vy * 0.6;
                    n++;
                }
                if (n) { s.stats.pushedBack += n; s.events.push({ type: 'backpressure', x: at.x, y: at.y, r: R, count: n }); }
            }
            // Floodgate: clean catches in a row set off a surge of packets.
            if (o.surge && !hasty && ++s.streak >= o.surgeEvery && s.time >= s.surgeAt) {
                s.streak = 0;
                s.surgeAt = s.time + o.surgeCooldown;
                const size = o.surgeBase + o.surgeGrow * o.surge;
                let left = size;
                while (left > 0) { const n = Math.min(left, Math.max(3, o.schoolSize)); school(n, true); left -= n; }
                s.stats.surges++;
                s.events.push({ type: 'surge', count: size, x: at.x, y: at.y });
            }
            // Infinite Loop: the loop catches again in a moment, once more for each level past the first.
            if (o.echo && !hasty) for (let i = 1; i <= o.echo; i++) s.echoes.push({ poly: poly.map(q => ({ x: q.x, y: q.y })), at: s.time + o.echoDelay * i, mult: j.mult, n: i });
            // Second Wind: a big loop gives Focus back.
            if (o.focusBack && j.mult >= 2) s.focus = Math.min(s.maxFocus, s.focus + o.focusBack);
            s.events.push({ type: 'catch', x: at.x, y: at.y, poly, area: j.area, count, gold, mult: j.mult, units, packets: j.inside, race: bonus, streak: o.surge ? s.streak : 0, cleanRun: run, split: !!j.split, star: j.star || null, hasty, safe: !!j.safe,
                chained: chained.map(c => ({ x: c.packet.x, y: c.packet.y, from: c.from, kind: c.packet.kind })), scrubbed: j.corrupt.length });
        }

        // ---- Bubbles (the way to catch, Snare 15) --------------------------------------------------------------
        // While a bubble grows its outline is the wire, so whatever hunts or snaps a wire pops it.
        // never past half the field however big Bigger Buffers makes it (round 3: a maxed bubble covered a third and aiming stopped mattering)
        const bubbleMaxR = Math.min(Math.min(o.bubbleMax * shortSide, Math.sqrt(o.bubbleShare * w * h / Math.PI)) * (1 + o.bubbleSize), Math.sqrt(w * h / 2 / Math.PI), 0.6 * shortSide);
        const bubbleTime = o.bubbleTime / (1 + o.bubbleGrow);
        function circle(x, y, r, n = 32) {
            const pts = [];
            for (let i = 0; i < n; i++) pts.push({ x: x + r * Math.cos(i / n * 2 * Math.PI), y: y + r * Math.sin(i / n * 2 * Math.PI) });
            return pts;
        }
        const bubbleMinR = () => Math.min(bubbleMaxR, o.bubbleMin * closeR);
        function bubbleStep(dt) {
            const b = s.bubble;
            if (!b || s.over) return;
            // it grows from the moment the pen went down
            const t = Math.min(1, (s.real - b.t0) / bubbleTime);
            // it sticks to the pen from the first frame (Snare 13.2: it stood still until committed, then drifted at a capped
            // speed, so it trailed a quick move); whether the pen has wandered off is measured from where it went down
            if (b.pen) {
                const k = 1 - Math.exp(-dt / o.bubbleFollow);
                b.x += (b.pen.x - b.x) * k;
                b.y += (b.pen.y - b.y) * k;
            }
            const r0 = bubbleMinR();
            b.r = r0 + (bubbleMaxR - r0) * Math.pow(t, o.bubblePow);
            b.full = t >= 1;
            if (!b.growing) {
                if (s.real - b.t0 < o.bubbleCommit) return;
                // Snare 12.5 (the owner's call: slashes and parries on the left button): a left press that's moving fast
                // is a flick on its way, so it waits out the flick's time before it's a bubble for good; let go by then and
                // it's judged as a flick
                const moved = b.pen && Math.hypot(b.pen.x - b.ox, b.pen.y - b.oy) > o.bubbleSlop * closeR;
                if (b.locked && moved && s.real - b.t0 < o.flickTime) return;
                b.growing = true;
                s.stroke = null;     // it's no flick
                s.events.push({ type: 'bubbleStart', x: b.x, y: b.y });
            }
            // committed: it goes where the pen goes (a finger's wobble moves it, never breaks it)
            s.wire = circle(b.x, b.y, b.r);
            // Race Condition (Snare 15): a full bubble held still keeps growing its multiplier, `raceRate` a second up to
            // `raceMax` more; moving it starts the count again.
            if (o.race && b.full && b.pen && !frozen()) {
                if (!b.still || Math.hypot(b.pen.x - b.still.x, b.pen.y - b.still.y) > o.raceStill * closeR) {
                    if (b.bonus > 0) s.events.push({ type: 'raceReset', x: b.x, y: b.y });
                    b.still = { x: b.pen.x, y: b.pen.y };
                    b.raceT = 0;
                    b.bonus = 0;
                } else {
                    const before = Math.floor((b.bonus || 0) / 0.125);
                    b.raceT += dt;
                    b.bonus = Math.min(o.raceMax, o.raceRate * b.raceT);
                    if (Math.floor(b.bonus / 0.125) > before) s.events.push({ type: 'raceTick', x: b.x, y: b.y, bonus: b.bonus, max: o.raceMax });
                }
            }
        }
        const bubblePoly = () => (s.bubble ? circle(s.bubble.x, s.bubble.y, s.bubble.r || bubbleMinR()) : null);
        // Let go of a bubble: it catches what's inside, as a loop would (too small, it fizzles).
        function popBubble() {
            const b = s.bubble;
            const poly = b?.growing ? bubblePoly() : null;
            s.bubble = null;
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
            s.stroke = null;
            if (!poly) return;
            const at = centroid(poly);
            if (polygonArea(poly) < minLoopArea) { s.events.push({ type: 'fizzle', x: at.x, y: at.y, bubble: true }); return; }
            s.stats.bubbles++;
            releaseBubble(poly, { x: b.x, y: b.y, r: b.r, full: !!b.full, bonus: b.bonus || 0 });
        }

        // The loop the open wire would make if it closed now (back to where it started), or null while it's too
        // small to count.
        // The smallest loop that closes: a circle of `minLoop` × the closing ring's radius.
        const minLoopArea = Math.PI * (o.minLoop * closeR) ** 2;
        function openLoop() {
            if (s.wire.length < 4) return null;
            if (wireLength(s.wire) < 3 * closeR) return null;
            const poly = s.wire.slice();
            return polygonArea(poly) >= minLoopArea ? poly : null;
        }

        // The pen moves to (x, y): extend the wire; crossing it, or coming back near its start, closes a loop.
        // Returns false while the pen can't draw (after a snap, or the run is over).
        function addPoint(x, y) {
            if (s.over || s.cooldown > 0) return false;
            x = Math.max(0, Math.min(w, x));
            y = Math.max(0, Math.min(h, y));
            const p = { x, y };
            s.penAt = p;
            // A held Race Condition loop lets go as soon as the pen moves on.
            if (s.race && Math.hypot(x - s.race.at.x, y - s.race.at.y) > closeR * 1.6) settleRace();
            if (!s.drawing) {
                s.drawing = true;
                s.penDownAt = s.real;
                s.leftStart = false;
                s.wire = [p];
                s.stroke = { t0: s.real, pts: [p] };
                // the pen's kind (Snare 12.4, the owner: on a mouse, left holds a bubble and right draws the wire): 'bubble'
                // never turns into a wire, 'wire' never grows a bubble, none (touch) decides by how the stroke moves
                if (o.bubble && s.penKind !== 'wire') s.bubble = { x, y, ox: x, oy: y, t0: s.real, r: bubbleMinR(), growing: false, pen: p, locked: s.penKind === 'bubble' };
                return true;
            }
            // Bubbles: once one grows it owns the stroke; a pen that wanders off before then draws a wire after all.
            if (s.bubble) {
                s.bubble.pen = p;
                if (s.bubble.growing) return true;
                // still deciding: the stroke is kept (a flick is judged from it); a deliberate stroke draws a wire after all
                if (s.bubble.locked || Math.hypot(x - s.bubble.ox, y - s.bubble.oy) <= o.bubbleSlop * closeR) {
                    if (s.stroke && s.stroke.pts.length < 400) s.stroke.pts.push(p);
                    return true;
                }
                s.bubble = null;
                if (s.stroke) s.wire = s.stroke.pts.slice();
            }
            const last = s.wire[s.wire.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < o.minGap) return true;
            if (s.stroke && s.stroke.pts.length < 400) s.stroke.pts.push(p);
            // The new segment against every earlier one but its neighbour: the newest crossing closes the loop.
            for (let i = s.wire.length - 3; i >= 0; i--) {
                const q = segIntersect(last, p, s.wire[i], s.wire[i + 1]);
                // Too small a loop (a scribble's sliver) doesn't close: the wire runs on through the crossing.
                if (q && polygonArea([q, ...s.wire.slice(i + 1)]) < minLoopArea) continue;
                if (q) {
                    s.stroke = null;
                    close([q, ...s.wire.slice(i + 1)], true);
                    // Keep drawing from here: one stroke can circle the boss again (a spiral counts each turn).
                    s.wire = s.over ? [] : [p];
                    s.leftStart = false;
                    return true;
                }
            }
            s.wire.push(p);
            const start = s.wire[0];
            const fromStart = Math.hypot(x - start.x, y - start.y);
            if (fromStart > closeR * 1.5) s.leftStart = true;
            // Back near the start: the loop snaps shut (a wire that only went out and back along itself, too thin to be a
            // loop, starts again from here rather than growing on).
            if (s.leftStart && fromStart <= closeR) {
                const poly = openLoop();
                s.stroke = null;
                if (poly) close(poly, true);
                s.wire = s.over ? [] : [p];
                s.leftStart = false;
                return true;
            }
            // A wire past its length drops its tail (and its start moves with it).
            let L = wireCost(s.wire);
            while (L > maxWire && s.wire.length > 2) {
                L -= segCost(s.wire[0], s.wire[1]);
                s.wire.shift();
            }
            return true;
        }

        // The pen lifts: near the start the loop closes, else an open wire is let go.
        function liftPen() {
            if (s.bubble?.growing) { popBubble(); return; }
            s.bubble = null;
            if (s.race) settleRace();
            const start = s.wire[0], head = s.wire[s.wire.length - 1];
            const isFlick = !s.over && flick();
            s.stroke = null;
            // A loop too small to count, brought back to its start: say so (it used to vanish without a word).
            if (!isFlick && start && s.wire.length > 4 && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6 && polygonArea(s.wire) < minLoopArea && wireLength(s.wire) > closeR) {
                s.events.push({ type: 'fizzle', x: head.x, y: head.y });
            }
            if (!isFlick && start && s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6) {
                const poly = openLoop();
                if (poly) {
                    close(poly);
                    s.wire = [];
                    s.drawing = false;
                    s.leftStart = false;
                    return;
                }
            }
            if (!isFlick && s.wire.length > 1) s.events.push({ type: 'release', wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
        }
        // The pen is taken away (a card came up mid-stroke): the open wire is dropped without being judged (no loop, no
        // flick, no flag); a held Race Condition loop stays held.
        // The next stroke's kind: 'bubble', 'wire', or null to decide by how it moves (touch).
        function setPen(kind) { s.penKind = kind || null; }
        function cancelPen() {
            s.bubble = null;
            s.wire = [];
            s.stroke = null;
            s.drawing = false;
            s.leftStart = false;
        }

        // The live preview of the open wire: what closing it now would catch, and whether the pen is near enough to
        // the start to close it.
        function preview() {
            const bub = bubblePoly();
            const poly = bub || (o.bubble ? null : openLoop());
            if (!poly) return null;
            const j = judge(poly, bub ? (s.bubble.bonus || 0) : 0);
            const head = s.wire[s.wire.length - 1], start = s.wire[0];
            // The risk: corrupt packets just outside it (they can swim in before it closes).
            let risk = 0;
            for (const p of s.packets) {
                if (spoofed(p) || p.kind !== 'corrupt' || j.inside.includes(p)) continue;
                for (let i = 1; i < poly.length; i++) if (segDist(p, poly[i - 1], poly[i]) < 1) { risk++; break; }
            }
            if (bub) return { ...j, risk, scrub: Math.min(j.corrupt.length, forgives(j.good.length)), near: true, bubble: true, full: !!s.bubble.full };
            return { ...j, risk, scrub: Math.min(j.corrupt.length, forgives(j.good.length)), near: s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6 };
        }

        function step(dt) {
            if (s.over) return;
            s.acc += Math.min(dt, 0.25);
            while (s.acc >= STEP && !s.over) {
                s.acc -= STEP;
                stepOnce(STEP);
            }
        }

        // Walk away: the run ends where it is (what was caught is already paid).
        function stop() { end(); }

        function takeEvents() {
            const e = s.events;
            s.events = [];
            return e;
        }

        return Object.assign(s, { step, nextSector, goalProgress, addPoint, liftPen, cancelPen, setPen, stop, netsDone, netAreas, chargeReach, takeEvents, preview, valueOf, isGood, placeZone, moveZone, zoneAt, placeAt, removeAt, usePower, grab, wallsUp, frozen, layoutOf, emitterSpots });
    }

    return { STEP, FIELD_AREA, SNARE, GOLD_VALUE, TAG_VALUE, TAG_SECONDS, LOCK_SECONDS, PACKET_R, AV_R, BOSS_R, BOSS_WARN, BOSS_DASH, BOSS_DASH_SPEED, MINE_R, createSnare, segIntersect, pointInPolygon, polygonArea, wireLength, areaMult, rng };
});
