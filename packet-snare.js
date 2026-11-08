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
        focus: 26,                  // the run's budget: a first run is short (about 10 s of drawing), hard and quick
        idleDrain: 1.0,             // Focus per second, always: an idle run still ends
        drawBase: 1.6,              // extra per second while the pen is down
        drawDrain: 0.5,             // and per second per unit of wire held (÷ √ of the field's growth, so a loop the same share
                                    // of any field costs the same): long wires burn faster; wire along your Firewalls is free
        maxWire: 36,                // units on the starting field (× √ of the field's growth): past this the tail drops
        minGap: 0.1,                // the wire records a point every this far
        closeRadius: 0.085,         // × √area: bring the pen back this close to the start and the loop closes
        areaUnit: 0.22,             // × area: a catch's multiplier is 1 + loop area / (areaUnit × field area)…
        maxMult: 4,                 // …up to this (Bandwidth raises it)
        corruptPenalty: 6,          // Focus lost when a corrupt packet spoils a catch
        snapPenalty: 4,             // Focus lost when an Antivirus or a Firewall snaps the wire
        snapCooldown: 1.0,          // seconds before you can draw again after a snap
        respawn: 1.2,               // seconds before a caught packet's replacement swims in
        density: 0.13,              // good packets per unit² of field…
        maxGood: 340,               // …up to this many (Firehose and Floodgate raise it)
        corruptShare: 0.35,         // corrupt packets per good one
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
        focusBack: 0,               // Second Wind: Focus a loop at ×2 or more gives back
        laser: 0,                   // Targeted Laser: seconds between shots (0 = none)
        emitters: 1,                // packets each shot takes
        scrubbers: 0,               // corrupt packets a loop forgives
        // The Rogue AI: Infection Cores, one every `rogueEvery` s from `rogueFirst` (0 = no Rogue AI this run).
        rogue: 0,
        rogueFirst: 4,
        rogueEvery: 9,
        rogueGrow: 0.9,             // units per second the circle grows…
        rogueMax: 0.32,             // …to this share of the field's shorter side
        rogueLife: 11,              // seconds before a core burns out on its own
        chokeArea: 0.08,            // × field area: a loop round a core no bigger than this quarantines it
        // Your Firewalls: up to `firewalls` walls, each drawn as a straight line up to `wallLength` units long (× √ of
        // the field's growth). Corrupt packets bounce off them, good ones pass; an Antivirus or the boss that hits one is
        // stunned and the wall takes a hit (down after `fwHits`); a core's circle can't take a packet through one.
        firewalls: 0,
        wallLength: 4,
        wallMinLength: 0.8,
        fwHits: 1,
        wallRebuild: 0,             // Great Wall: seconds before a wall that went down builds itself again (0: never)
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
        // Everything you placed, carried over from the last run as shares of the field.
        layout: { walls: [], decoys: [], turrets: [], towers: [] },
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
        bossAt: 16,
        bossCatch: 18,
        bossSpeed: 1,               // × an Antivirus's roaming speed
        bossCharge: 5,              // seconds between its charges
        bossWarn: 1.6,              // seconds its warning line shows before it dashes (the parry window; 1.1 was too
                                    // short to read and hit on a phone)
        bossStun: 1.6,              // seconds it reels after a parry (the slash window)
        bossMinions: 0,             // Antivirus it boots each time it's parried (later sectors), at most `minionCap` alive
        minionCap: 2,
        bossR: 0.8,                 // its size: it grows sector by sector
        bossSmash: 2,               // seconds it sits on a decoy before smashing it
        bossEdge: 0.18,             // × the shorter side: how far its edge keeps from the field's
        slashDamage: 1,             // health a slash takes off
        parryDamage: 0,             // health a parry takes off (Riposte)
        slashGap: 0.12,             // seconds between slashes (one flick, one slash)
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
        flickTime: 0.45,            // (0.35 missed real thumbs)
        flickLength: 1.2,
        flagLimit: 3,               // flags and an IDS alert: the boss boots now, enraged (or another Antivirus)
        flagNear: 1.2,              // units: how near a flick must pass to something it could hit to be flagged
        // Garbage Collection: a loop of nothing but corrupt packets deletes them and gives `gcFocus` Focus each.
        gc: 0,
        gcFocus: 1.5,
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
        // Fork Bomb: a figure eight (one stroke, two loops either side of the point where it crosses itself, or of where
        // it started) pays both lobes at their multipliers multiplied, up to `forkMax` × the cap; a red packet in either
        // spoils both. The first lobe waits up to `forkTime` s for the second (it's judged when that closes).
        fork: 0,
        forkMax: 1.5,
        forkTime: 4,                // seconds the first lobe waits for its second
        // Star: drawn while the field is frozen, a five-pointed star (a closed stroke crossing itself five times) catches
        // everything good inside its outline at ×`starMult` on top of the multiplier and deletes the corrupt packets there.
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
        maxOnScreen: 1400,
        // Packets' size (units): game.js shrinks them as a capped field fills (the owner's call, Snare 10: smaller, more
        // of them, coming back sooner), never under 0.55 of this.
        packetR: 0.3,
        // ---- The branch capstones (Snare 10; pure upgrades, the owner's call) -----------------------------------
        // Infinite Loop: a loop you close catches again `echoDelay` s later, whatever good has swum inside (red stays).
        echo: 0,
        echoDelay: 1,
        // Packet Storm: every `stormEvery` s (the first at `stormFirst`) a school of `stormSize` gold packets swims in.
        storm: 0,
        stormFirst: 6,
        stormEvery: 15,
        stormSize: 10,
        // Blue Screen: every `crashEvery`th slash on a boss crashes it: ×`crashMult` damage.
        crash: 0,
        crashEvery: 3,
        crashMult: 3,
        // Zero Trust: a corrupt packet that bounces off your Firewall comes back good.
        zeroTrust: 0,
        // Floodgate (Snare 10.1, an outside review's idea): `surgeEvery` clean catches in a row (no spoil or snap
        // between) set off a surge, 6 + 6 a level packets swimming in at once, then `surgeCooldown` s before the next.
        surge: 0,
        surgeEvery: 3,
        surgeCooldown: 6,
        // Defuse's last level: a loop that clears one of the boss's mines clears the nearest other one too (its earlier
        // levels slow the nets: `netTime`, engine.js snareOpts).
        defuseChain: 0
    };
    const GOLD_VALUE = 5;
    const TAG_VALUE = 2;
    const TAG_SECONDS = 1.5;   // the default `tagSeconds`
    const LOCK_SECONDS = 0.6;       // a laser holds its brackets on the target this long before it fires
    const PACKET_R = 0.3;
    const AV_R = 0.45;
    const BOSS_R = 0.8;
    const BOSS_WARN = 1.1, BOSS_DASH = 0.45, BOSS_DASH_SPEED = 5;   // a charge: its warning (the default), its dash and its speed
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
    const areaMult = (area, o = SNARE, fieldArea = o.area) => Math.min(o.maxMult, 1 + area / (o.areaUnit * fieldArea));

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
        const shortSide = Math.min(w, h);
        const maxWire = o.maxWire * grow;
        const drawDrain = o.drawDrain / grow;
        const s = {
            w, h, opts: o, closeR,
            echoes: [],             // Infinite Loop: loops waiting to catch again ({ poly, at, mult })
            streak: 0,              // clean catches in a row (Floodgate's surge)
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
            walls: [],              // your Firewalls: { id, a, b, hits }
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
            fork: null,             // Fork Bomb: a figure eight's first lobe, waiting for its second { q, poly, t, at }
            handCaught: 0,          // packets caught by hand (loops): what boots the boss early
            rogueAt: o.rogue ? o.rogueFirst : Infinity,
            boss: null,             // the boss Antivirus once it boots: { x, y, vx, vy, r, hp, maxHp, stunned, charge, shielded }
            bossDone: false,
            stats: { catches: 0, echoes: 0, storms: 0, surges: 0, crashes: 0, converted: 0, caught: 0, gold: 0, units: 0, bestCatch: 0, bestMult: 0, corrupted: 0, snaps: 0, empty: 0, chained: 0, lasered: 0, scrubbed: 0, tagged: 0,
                stolen: 0, cores: 0, quarantined: 0, bounces: 0, stuns: 0, fwLost: 0, sweeps: 0, escaped: 0, bossHits: 0, bosses: 0, wiped: 0, turreted: 0, purged: 0, decoysLost: 0, freezes: 0,
                herdStuns: 0, flags: 0, ids: 0, parries: 0, slashes: 0, spoofed: 0, collected: 0, raced: 0, hijacked: 0, partners: 0, partnered: 0,
                bossDamage: 0, avDown: 0, glanced: 0, mines: 0, minesCleared: 0, netted: 0, escalations: 0, forks: 0, stars: 0 },
            acc: 0,
            nextId: 1
        };
        for (let i = 0; i < o.scanner; i++) s.beams.push(i * Math.PI * 2 / o.scanner);
        // What you placed last run stays placed (as far as this run's slots go).
        const L0 = o.layout || {};
        // Walls are trimmed again to this field's longest (a field of another shape stretches them).
        for (const [u1, v1, u2, v2] of (L0.walls || []).slice(0, o.firewalls)) {
            const a = { x: u1 * w, y: v1 * h };
            let b = { x: u2 * w, y: v2 * h };
            const L = Math.hypot(b.x - a.x, b.y - a.y), max = o.wallLength * grow;
            if (L < o.wallMinLength) continue;
            if (L > max) b = { x: a.x + (b.x - a.x) * max / L, y: a.y + (b.y - a.y) * max / L };
            s.walls.push({ id: s.nextId++, a, b, hits: 0 });
        }
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
        const corruptTarget = Math.max(1, Math.round(goodTarget * o.corruptShare));
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

        // ---- The boss Antivirus --------------------------------------------------------------------------
        // `enraged`: an IDS alert booted it early, faster and charging sooner.
        // Its size grows with the field (to the ¾ power: a big field's boss stays a big target on screen) and with the
        // sector (engine.js), never past 13% of the field's shorter side (a phone's field is small).
        // It keeps to the middle: `edge` clear of every side, so it can be fought most of the time (it used to spend
        // its time along the edges, wiping the packets that swam in).
        const bossEdge = r => Math.min(r + o.bossEdge * shortSide, shortSide * 0.45);
        function keepCentral(b) {
            const e = bossEdge(b.r);
            if (b.x < e) { b.x = e; b.vx = Math.abs(b.vx); }
            if (b.x > w - e) { b.x = w - e; b.vx = -Math.abs(b.vx); }
            if (b.y < e) { b.y = e; b.vy = Math.abs(b.vy); }
            if (b.y > h - e) { b.y = h - e; b.vy = -Math.abs(b.vy); }
        }
        function bootBoss(enraged) {
            const r = Math.min(o.bossR * Math.pow(grow, 0.75), 0.13 * shortSide);
            // In from the middle of an edge, moving in.
            const side = Math.floor(rand() * 4), e = bossEdge(r);
            const x = side === 0 ? e : side === 1 ? w - e : w / 2, y = side === 2 ? e : side === 3 ? h - e : h / 2;
            s.boss = { x, y, vx: 0, vy: 0, r, hp: o.boss, maxHp: o.boss, stunned: 0, immune: null, charge: null, chargeAt: s.time + (enraged ? 1 : 2.5),
                enraged, smash: null, slashAt: -1, shielded: false, mineAt: s.time + 1.5 };
            s.events.push({ type: 'boss', x, y, hp: o.boss, enraged });
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
        const fullReach = b => Math.max(BOSS_DASH_SPEED * BOSS_DASH * o.avSpeed, 0.33 * shortSide) + b.r;
        // How far it can go from (x, y) along (dx, dy) before leaving the field.
        const room = (x, y, dx, dy) => Math.min(dx > 0 ? (w - x) / dx : dx < 0 ? -x / dx : Infinity, dy > 0 ? (h - y) / dy : dy < 0 ? -y / dy : Infinity);
        // The line it shows (and dashes along) stays on the field: never past an edge.
        const chargeReach = b => (b.charge?.len ?? fullReach(b));
        function bossStep(dt) {
            if (!o.boss || s.bossDone) return;
            if (!s.boss) {
                if (s.time < o.bossAt && s.handCaught < o.bossCatch) return;
                bootBoss(false);
                return;
            }
            const b = s.boss;
            mineStep(b, dt);
            b.shielded = s.mines.length > 0;
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
                else { b.charge = null; b.chargeAt = s.time + o.bossCharge * (b.enraged ? 0.6 : 1); }
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
                    const len = Math.max(b.r + 0.5, Math.min(fullReach(b), room(b.x, b.y, dx, dy) - 0.2));
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
            keepCentral(b);
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
            if (s.wire.length > 1 && !flicking) {
                for (let i = 1; i < s.wire.length; i++) {
                    // Its snap costs half again what an Antivirus's does.
                    if (segDist(b, s.wire[i - 1], s.wire[i]) < b.r) { snap(b); s.focus = Math.max(0, s.focus - o.snapPenalty * 0.5); break; }
                }
            }
            // Your Firewalls stun it too, once per approach, like the others (it shrugs the stun off sooner): a slash window.
            stunOnWalls(b, o.avStun * 0.6, true);
        }
        // Health off the boss (a slash, a parry with Riposte, a ram). Returns whether it landed.
        function damageBoss(b, dmg, how) {
            if (b.shielded) {
                s.stats.glanced++;
                s.events.push({ type: 'bossBlock', x: b.x, y: b.y, reason: 'shield', how });
                return false;
            }
            if (!(dmg > 0)) return true;
            b.hp = Math.max(0, b.hp - dmg);
            s.stats.bossHits++;
            s.stats.bossDamage += dmg;
            if (b.hp <= 0) {
                s.stats.bosses++;
                s.bossDone = true;
                s.boss = null;
                // Its mines and nets go down with it.
                for (const m of s.mines) s.events.push({ type: 'mineDown', x: m.x, y: m.y, boss: true });
                s.mines = [];
                s.links = [];
                s.events.push({ type: 'bossDown', x: b.x, y: b.y });
            } else {
                s.events.push({ type: 'bossHit', x: b.x, y: b.y, r: b.r, hp: b.hp, maxHp: b.maxHp, how, dmg });
            }
            return true;
        }
        // A parry: the charge broken, the boss reeling (the slash window); later sectors' bosses boot Antivirus when it happens.
        function parryBoss(b) {
            const { dx, dy } = b.charge;
            b.charge = null;
            b.stunned = s.time + o.bossStun;
            b.chargeAt = s.time + o.bossStun + o.bossCharge * 0.6;
            b.vx = -dx * 3;
            b.vy = -dy * 3;
            s.stats.parries++;
            const minions = s.antivirus.filter(f => f.minion && !f.ally).length;
            for (let i = 0; i < o.bossMinions && minions + i < o.minionCap; i++) { bootAntivirus(); s.antivirus[s.antivirus.length - 1].minion = true; }
            s.events.push({ type: 'parry', x: b.x, y: b.y });
            damageBoss(b, o.parryDamage, 'parry');
        }

        // ---- The boss's mines and nets -----------------------------------------------------------------
        // It lays them round itself, inside the middle; mines near enough link up (a net growing between them); a
        // finished net wipes the good data along it, and a ring of three finished nets the data inside it too.
        function layMines(b, n) {
            const e = Math.max(1, o.bossEdge * shortSide * 0.6);
            const spread = o.netRange * shortSide * 0.55;
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
            return true;
        }

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
            settleFork();
            s.events.push({ type: 'snap', x: fw.x, y: fw.y, wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
            s.cooldown = o.snapCooldown;
            s.focus = Math.max(0, s.focus - o.snapPenalty);
            s.stats.snaps++;
            s.streak = 0;
        }

        const spoofed = p => p.kind === 'corrupt' && p.spoof > s.time;
        const isGood = p => p.kind !== 'corrupt' || spoofed(p);
        const valueOf = p => (p.kind === 'gold' ? o.goldValue : 1) * (p.tag > s.time ? o.tagValue : 1) * (spoofed(p) ? o.spoofValue : 1);

        // Taken packets leave the field; a school refills from an edge once enough are gone, corrupt ones one by one.
        function remove(list) {
            s.packets = s.packets.filter(p => !list.includes(p));
            for (const p of list) {
                if (p.kind === 'corrupt') pendingCorrupt.push(s.time + o.respawn * (0.6 + rand() * 0.8));
            }
            if (refillAt === Infinity) refillAt = s.time + o.respawn;
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
        const shielded = (core, p) => wallsNow.some(f => segIntersect(core, p, f.a, f.b));
        function spawnCore() {
            // Where the data is: next to a random good packet (the schools draw it), kept off the edges.
            const goods = s.packets.filter(p => p.kind !== 'corrupt');
            const near = goods.length ? goods[Math.floor(rand() * goods.length)] : { x: w / 2, y: h / 2 };
            const ang = rand() * Math.PI * 2;
            const at = { x: Math.max(1, Math.min(w - 1, near.x + Math.cos(ang))), y: Math.max(1, Math.min(h - 1, near.y + Math.sin(ang))) };
            s.cores.push({ id: s.nextId++, x: at.x, y: at.y, r: 0, age: 0, stole: 0 });
            s.stats.cores++;
            s.events.push({ type: 'core', x: at.x, y: at.y });
        }
        function rogueStep(dt) {
            if (!o.rogue) return;
            if (s.time >= s.rogueAt) {
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
        const wallsUp = () => s.walls.filter(f => f.hits < o.fwHits);
        // What the wire costs: its length, less the stretches drawn along your Firewalls (wire you already built).
        const ALONG = 0.35;
        function segCost(a, b) {
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            return wallsNow.some(f => segDist(a, f.a, f.b) < ALONG && segDist(b, f.a, f.b) < ALONG) ? 0 : L;
        }
        function wireCost(pts) {
            let L = 0;
            for (let i = 1; i < pts.length; i++) L += segCost(pts[i - 1], pts[i]);
            return L;
        }
        // Draw a wall from a to b (trimmed to the longest a wall may be). Returns the wall, or null (too short, no slot).
        function placeWall(a, b) {
            if (s.over || s.walls.length + s.rebuild.length >= o.firewalls) return null;
            a = inField(a.x, a.y);
            b = inField(b.x, b.y);
            let L = Math.hypot(b.x - a.x, b.y - a.y);
            if (L < o.wallMinLength) return null;
            const max = o.wallLength * grow;
            if (L > max) { b = { x: a.x + (b.x - a.x) * max / L, y: a.y + (b.y - a.y) * max / L }; L = max; }
            const wl = { id: s.nextId++, a, b, hits: 0 };
            s.walls.push(wl);
            wallsNow = wallsUp();
            s.events.push({ type: 'place', kind: 'wall', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            return wl;
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
            const d = it => (kind === 'wall' ? segDist(at, it.a, it.b) : Math.hypot(it.x - x, it.y - y));
            const hit = s[list].filter(it => d(it) <= reach).sort((a, b) => d(a) - d(b))[0];
            if (!hit) return false;
            s[list] = s[list].filter(it => it !== hit);
            if (kind === 'wall') wallsNow = wallsUp();
            s.events.push({ type: 'remove', kind, x, y });
            return true;
        }
        // Use a power (a charge a run).
        function usePower(kind) {
            if (s.over || !(s.charges[kind] > 0)) return false;
            s.charges[kind]--;
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
        const frozen = () => s.frozenLeft > 0;
        // A corrupt packet that would cross one of your Firewalls this step bounces off it (good ones pass).
        function bounceOffWalls(p, px, py) {
            if (spoofed(p)) return;   // a spoofed packet passes as good
            for (const f of wallsNow) {
                if (!segIntersect({ x: px, y: py }, p, f.a, f.b)) continue;
                const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, L = Math.hypot(dx, dy) || 1;
                const nx = -dy / L, ny = dx / L;
                const vn = p.vx * nx + p.vy * ny;
                p.vx -= 2 * vn * nx;
                p.vy -= 2 * vn * ny;
                p.x = px;
                p.y = py;
                s.stats.bounces++;
                // Zero Trust: verified at the wall, it comes back good.
                if (o.zeroTrust) {
                    p.kind = 'good';
                    s.stats.converted++;
                    s.events.push({ type: 'convert', x: p.x, y: p.y });
                }
                return;
            }
        }
        // An Antivirus (or the boss) that runs into one of your Firewalls is stunned, once per approach: knocked clear and
        // immune to the lines it's touching until it's away from them; the wall takes a hit (down at `fwHits`).
        function stunOnWalls(v, seconds, isBoss = false) {
            if (!wallsNow.length || v.stunned > s.time) return;
            const clear = v.r * 2.5;
            if (v.immune) v.immune = v.immune.filter(id => { const f = wallsNow.find(f => f.id === id); return f && segDist(v, f.a, f.b) <= clear; });
            const f = wallsNow.find(f => !v.immune?.includes(f.id) && segDist(v, f.a, f.b) < v.r);
            if (!f) return;
            v.immune = wallsNow.filter(g => segDist(v, g.a, g.b) <= clear).map(g => g.id);
            v.stunned = s.time + seconds;
            const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, L = Math.hypot(dx, dy) || 1;
            let nx = -dy / L, ny = dx / L;
            if ((v.x - f.a.x) * nx + (v.y - f.a.y) * ny < 0) { nx = -nx; ny = -ny; }
            v.vx = nx * 4;   // drifts about 1.3 units off the line as it stops: clear of it
            v.vy = ny * 4;
            if (v.charge) v.charge = null;
            f.hits++;
            s.stats.stuns++;
            const down = f.hits >= o.fwHits;
            // A wall that goes down leaves the field and frees its slot.
            if (down) {
                s.stats.fwLost++;
                s.walls = s.walls.filter(g => g !== f);
                wallsNow = wallsUp();
                // Great Wall: it builds itself again (its slot held for it meanwhile).
                if (o.wallRebuild) s.rebuild.push({ a: f.a, b: f.b, at: s.time + o.wallRebuild });
            }
            s.events.push({ type: 'stun', x: v.x, y: v.y, down, boss: isBoss, a: { x: f.a.x, y: f.a.y }, b: { x: f.b.x, y: f.b.y } });
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
            if (s.time >= sweepAt) {
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
            r.t += dt;
            r.bonus = Math.min(o.raceMax, o.raceRate * r.t);
            const bad = s.packets.filter(p => p.kind === 'corrupt' && !spoofed(p) && pointInPolygon(p, r.poly)).length;
            if (bad > o.scrubbers) settleRace();
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
            if (boss) {
                const through = segDist(boss, a, b) < boss.r;
                near = segDist(boss, a, b) < boss.r + o.flagNear;
                const rammer = ally.find(f => Math.hypot(f.x - a.x, f.y - a.y) < f.r + 0.7);
                if (rammer && through) {
                    // Privilege Escalation: the hijacked Antivirus rams it (no minions), and is spent.
                    s.antivirus = s.antivirus.filter(f => f !== rammer);
                    s.stats.escalations++;
                    s.events.push({ type: 'escalate', x: boss.x, y: boss.y, from: { x: rammer.x, y: rammer.y } });
                    if (damageBoss(boss, o.escalateDamage, 'ram')) boss.stunned = Math.max(boss.stunned, s.time + o.bossStun * 0.6);
                    hit = true;
                } else if (boss.charge && boss.charge.t < boss.charge.warn) {
                    // A parry: across its warning line, through the boss, or a flick that comes within reach of the line
                    // (forgiving: it's a quick gesture on a moving target, often a thumb).
                    const L = chargeReach(boss);
                    const end = { x: boss.x + boss.charge.dx * L, y: boss.y + boss.charge.dy * L };
                    const reach = Math.max(0.5, 0.04 * shortSide);
                    const close = segDist(a, boss, end) < reach || segDist(b, boss, end) < reach || segDist({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, boss, end) < reach;
                    if (segIntersect(a, b, boss, end) || segDist(boss, a, b) < boss.r * 1.4 || close) {
                        s.events.push({ type: 'parryFlick', a, b });
                        parryBoss(boss);
                        hit = true;
                    } else if (segDist(a, boss, end) < o.flagNear || segDist(b, boss, end) < o.flagNear) near = true;
                } else if (through && boss.stunned > s.time) {
                    // A slash: through it while it reels (a parry or one of your Firewalls), a flick at a time.
                    if (s.real - boss.slashAt >= o.slashGap) {
                        boss.slashAt = s.real;
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
                    // Its guard is up: parry its charge first.
                    s.events.push({ type: 'bossBlock', x: boss.x, y: boss.y, reason: 'guard' });
                }
            }
            if (o.spoof) {
                const cut = s.packets.filter(p => p.kind === 'corrupt' && !spoofed(p) && segDist(p, a, b) < p.r + 0.15);
                if (cut.length) {
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
            wallsNow = wallsUp();
            if (s.fork && s.real - s.fork.t > o.forkTime) settleFork();
            // A first lobe closed at the start with the pen held still turns into a Race Condition loop instead.
            if (s.fork && o.race && s.drawing && s.penAt && s.real - s.fork.t >= 0.35 && Math.hypot(s.penAt.x - s.fork.at.x, s.penAt.y - s.fork.at.y) <= closeR * 1.6) {
                s.race = { poly: s.fork.poly, at: s.fork.at, t: 0, bonus: 0 };
                s.events.push({ type: 'raceStart', x: centroid(s.fork.poly).x, y: centroid(s.fork.poly).y, poly: s.fork.poly });
                s.fork = null;
            }
            // Frozen: the field's clock stops (nothing moves, nothing comes due, tags hold, Focus holds); only your pen works.
            if (frozen()) { s.frozenLeft = Math.max(0, s.frozenLeft - dt); return; }
            s.time += dt;
            raceStep(dt);
            flock(dt);
            const out = [];
            for (const p of s.packets) {
                const px = p.x, py = p.y;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (wallsNow.length && p.kind === 'corrupt') bounceOffWalls(p, px, py);
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
            scannerStep(dt);
            towerStep(dt);
            turretStep();
            laserStep(dt);
            rogueStep(dt);
            partnerStep(dt);
            for (const r of s.rebuild.filter(r => s.time >= r.at)) {
                s.walls.push({ id: s.nextId++, a: r.a, b: r.b, hits: 0 });
                s.events.push({ type: 'rebuilt', x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 });
            }
            s.rebuild = s.rebuild.filter(r => s.time < r.at);
            bossStep(dt);
            sweepStep(dt);
            while (avDue.length && s.time >= avDue[0]) { avDue.shift(); bootAntivirus(); }
            for (const f of s.antivirus) {
                // Hijacked: it works for you until its time is up, then reboots (stunned a moment) and turns back.
                if (f.ally) {
                    if (f.ally > s.time) { allyStep(f, dt); continue; }
                    f.ally = 0;
                    f.stunned = s.time + 1;
                    s.events.push({ type: 'hijackEnd', x: f.x, y: f.y });
                }
                // Its shift: `avOn` s hunting, `avOff` s updating (harmless and slow: a safe window).
                if (o.avOff > 0 && s.time >= f.shift) {
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
                stunOnWalls(f, o.avStun);
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
                s.events.push({ type: 'catch', echo: true, x: at.x, y: at.y, poly: e.poly, area: polygonArea(e.poly), count: got.length, gold, mult: e.mult, units, packets: got, chained: [], scrubbed: 0 });
            }
            // Packet Storm: a school of gold swims in.
            if (s.time >= s.stormAt) {
                s.stormAt = s.time + o.stormEvery;
                const before = s.packets.length;
                school(o.stormSize, true);
                for (const p of s.packets.slice(before)) p.kind = 'gold';
                s.stats.storms++;
                s.events.push({ type: 'storm', count: o.stormSize });
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
            const drain = o.idleDrain + (s.drawing ? o.drawBase + drawDrain * wireCost(s.wire) : 0);
            s.focus = Math.max(0, s.focus - drain * dt);
            if (s.focus <= 0) end();
        }

        function end() {
            if (s.over) return;
            settleRace();
            settleFork();
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
                // A wall Great Wall is rebuilding counts as standing (it holds its slot).
                walls: [...s.walls.filter(f => f.hits < o.fwHits), ...s.rebuild].map(f => [r3(f.a.x / w), r3(f.a.y / h), r3(f.b.x / w), r3(f.b.y / h)]),
                decoys: s.decoys.map(d => [r3(d.x / w), r3(d.y / h)]),
                turrets: s.turrets.map(t => [r3(t.x / w), r3(t.y / h)]),
                towers: s.towers.map(t => [r3(t.x / w), r3(t.y / h)])
            };
        }

        // What a loop would catch: the packets inside, how many are corrupt beyond what the scrubbers forgive, its
        // multiplier and its worth. Used to close a loop and, on the open wire, for the live preview.
        function judge(poly, bonus = 0) {
            const area = polygonArea(poly);
            const inside = s.packets.filter(p => pointInPolygon(p, poly));
            const corrupt = inside.filter(p => !isGood(p));
            const good = inside.filter(isGood);
            // Garbage Collection: a loop of nothing but corrupt packets is collected, not spoiled.
            const garbage = !!o.gc && !good.length && corrupt.length > 0;
            const spoiled = !garbage && corrupt.length > o.scrubbers;
            const mult = areaMult(area, o, fieldArea) * (1 + bonus);
            const value = good.reduce((a, p) => a + valueOf(p), 0);
            return { area, inside, corrupt, good, spoiled, garbage, mult, value, units: spoiled ? 0 : value * mult };
        }

        // Close a loop: a core, a mine or a stunned Antivirus inside is dealt with at once; the packets are snared,
        // or spoiled if anything corrupt (past the scrubbers) is in there. `held`: the pen is still down (it closed by
        // crossing or coming back to the start), so Race Condition can hold the loop open. `cross`: the point it closed
        // at with the pen down (the crossing, or the start), where Fork Bomb's second lobe must come back through.
        // Returns 'fork' when the loop waits as a first lobe.
        function close(poly, held = false, cross = null) {
            const j = judge(poly);
            // Fork Bomb: the second lobe of a figure eight passes through the first's crossing, on the other side of it.
            const f = s.fork, reach = closeR * 1.6;
            const second = !!(f && poly.some(v => Math.hypot(v.x - f.q.x, v.y - f.q.y) <= reach) && !pointInPolygon(centroid(poly), f.poly));
            if (f && !second) settleFork();
            const at = centroid(poly);
            s.leftStart = false;
            // The Chokehold: a tight loop round a core quarantines it; what it stole comes back, half of it, as a bonus.
            let quarantined = false;
            if (s.cores.length && j.area <= o.chokeArea * fieldArea) {
                const caught = s.cores.filter(c => pointInPolygon(c, poly));
                if (caught.length) {
                    quarantined = true;
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
                }
            }
            if (clearMines(poly)) quarantined = true;
            // Hijack: a loop round a stunned Antivirus turns it.
            if (o.hijack) {
                for (const f of s.antivirus) {
                    if (f.ally || !(f.stunned > s.time) || !pointInPolygon(f, poly)) continue;
                    f.ally = s.time + o.hijackSeconds;
                    f.stunned = 0;
                    s.stats.hijacked++;
                    s.events.push({ type: 'hijack', x: f.x, y: f.y });
                    quarantined = true;
                }
            }
            if (!j.inside.length) {
                if (second) settleFork();
                if (quarantined) return;
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area: j.area });
                return;
            }
            if (second) { payFork(poly, j); return; }
            // Fork Bomb: a clean loop closed with the pen down waits for its second lobe (both are judged when it closes).
            if (o.fork && cross && !j.spoiled && !j.garbage && j.good.length) {
                s.fork = { q: { x: cross.x, y: cross.y }, poly, t: s.real, at: s.penAt || cross };
                s.events.push({ type: 'forkLobe', x: at.x, y: at.y, poly, mult: j.mult });
                return 'fork';
            }
            // Race Condition: a clean loop closed with the pen still down stays open while the pen holds still.
            if (o.race && held && !o.fork && !j.spoiled && !j.garbage && j.good.length) {
                s.race = { poly, at: s.penAt, t: 0, bonus: 0 };
                s.events.push({ type: 'raceStart', x: at.x, y: at.y, poly });
                return;
            }
            payLoop(poly, 0, j);
        }

        // Fork Bomb: the waiting first lobe paid on its own (no second came, or the second didn't close through it).
        function settleFork() {
            const f = s.fork;
            if (!f) return;
            s.fork = null;
            payLoop(f.poly, 0);
        }
        // Both lobes: their multipliers multiplied (up to `forkMax` × the cap); a red packet in either spoils both.
        function payFork(poly, jB) {
            const f = s.fork;
            s.fork = null;
            const jA = judge(f.poly);
            const inside = [...new Set([...jA.inside, ...jB.inside])];
            if (jA.spoiled || jB.spoiled || jB.garbage) {
                payLoop(poly, 0, { ...jB, inside, corrupt: [...jA.corrupt, ...jB.corrupt], spoiled: true, garbage: false });
                return;
            }
            const good = [...new Set([...jA.good, ...jB.good])];
            const mult = Math.min(o.maxMult * o.forkMax, jA.mult * jB.mult);
            const value = good.reduce((a, p) => a + valueOf(p), 0);
            s.stats.forks++;
            payLoop(poly, 0, { ...jB, area: jA.area + jB.area, inside, good, corrupt: [...jA.corrupt, ...jB.corrupt], mult, value, units: value * mult, fork: { a: f.poly, mults: [jA.mult, jB.mult] } });
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
                const back = o.gcFocus * j.corrupt.length;
                s.focus = Math.min(s.maxFocus, s.focus + back);
                s.stats.collected += j.corrupt.length;
                s.events.push({ type: 'garbage', x: at.x, y: at.y, poly, count: j.corrupt.length, focus: back, packets: j.inside.map(p => ({ x: p.x, y: p.y })) });
                remove(j.corrupt);
                return;
            }
            if (j.spoiled) {
                s.streak = 0;
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
                for (const c of cands.slice(0, o.chain)) chained.push({ packet: c.q, from: { x: c.from.x, y: c.from.y } });
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
                    const add = next.slice(0, o.chain);
                    for (const c of add) chained.push({ packet: c.q, from: { x: c.from.x, y: c.from.y } });
                    front = add.map(c => c.q);
                }
            }
            const chainValue = chained.reduce((a, c) => a + valueOf(c.packet), 0);
            const units = (j.value + chainValue) * j.mult;
            const gold = j.good.filter(p => p.kind === 'gold').length + chained.filter(c => c.packet.kind === 'gold').length;
            remove([...j.inside, ...chained.map(c => c.packet)]);
            const count = j.good.length + chained.length;
            s.stats.catches++;
            s.stats.caught += count;
            s.handCaught += count;
            s.stats.gold += gold;
            s.stats.chained += chained.length;
            s.stats.scrubbed += j.corrupt.length;
            s.stats.units += units;
            s.stats.bestCatch = Math.max(s.stats.bestCatch, units);
            s.stats.bestMult = Math.max(s.stats.bestMult, j.mult);
            // Floodgate: clean catches in a row set off a surge of packets.
            if (o.surge && ++s.streak >= o.surgeEvery && s.time >= s.surgeAt) {
                s.streak = 0;
                s.surgeAt = s.time + o.surgeCooldown;
                let left = 6 + 6 * o.surge;
                while (left > 0) { const n = Math.min(left, Math.max(3, o.schoolSize)); school(n, true); left -= n; }
                s.stats.surges++;
                s.events.push({ type: 'surge', count: 6 + 6 * o.surge });
            }
            // Infinite Loop: the loop catches again in a moment.
            if (o.echo) s.echoes.push({ poly: poly.map(q => ({ x: q.x, y: q.y })), at: s.time + o.echoDelay, mult: j.mult });
            // Second Wind: a big loop gives Focus back.
            if (o.focusBack && j.mult >= 2) s.focus = Math.min(s.maxFocus, s.focus + o.focusBack);
            s.events.push({ type: 'catch', x: at.x, y: at.y, poly, area: j.area, count, gold, mult: j.mult, units, packets: j.inside, race: bonus, fork: j.fork || null, star: j.star || null,
                chained: chained.map(c => ({ x: c.packet.x, y: c.packet.y, from: c.from, kind: c.packet.kind })), scrubbed: j.corrupt.length });
        }

        // The loop the open wire would make if it closed now (back to where it started), or null while it's too
        // small to count.
        function openLoop() {
            if (s.wire.length < 4) return null;
            if (wireLength(s.wire) < 3 * closeR) return null;
            const poly = s.wire.slice();
            return polygonArea(poly) >= 0.5 * closeR * closeR ? poly : null;
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
                s.leftStart = false;
                s.wire = [p];
                s.stroke = { t0: s.real, pts: [p] };
                return true;
            }
            const last = s.wire[s.wire.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < o.minGap) return true;
            if (s.stroke && s.stroke.pts.length < 400) s.stroke.pts.push(p);
            // A star while the field is frozen: crossings don't close loops (the whole stroke is judged when it's back
            // at its start).
            const starring = o.star && frozen();
            // The new segment against every earlier one but its neighbour: the newest crossing closes the loop.
            for (let i = s.wire.length - 3; i >= 0 && !starring; i--) {
                const q = segIntersect(last, p, s.wire[i], s.wire[i + 1]);
                if (q) {
                    s.stroke = null;
                    const kept = s.wire.slice(0, i + 1);
                    const r = close([q, ...s.wire.slice(i + 1)], true, q);
                    // Keep drawing from here: one scribble can snare loop after loop. A figure eight's first lobe keeps the
                    // wire up to the crossing, so the second lobe can close through it.
                    s.wire = s.over ? [] : r === 'fork' ? [...kept, q, p] : [p];
                    if (r !== 'fork') s.leftStart = false;
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
                if (poly && starring && isStar(poly)) payStar(poly);
                else if (poly) close(poly, true, start);
                s.wire = s.over ? [] : [p];
                s.leftStart = false;
                return true;
            }
            // A wire past its length drops its tail (and its start moves with it), but never the crossing a figure eight's
            // first lobe waits on.
            let L = wireCost(s.wire);
            while (L > maxWire && s.wire.length > 2 && !(s.fork && s.wire[0] === s.fork.q)) {
                L -= segCost(s.wire[0], s.wire[1]);
                s.wire.shift();
            }
            return true;
        }

        // The pen lifts: near the start the loop closes, else an open wire is let go.
        function liftPen() {
            if (s.race) settleRace();
            const start = s.wire[0], head = s.wire[s.wire.length - 1];
            const isFlick = !s.over && flick();
            s.stroke = null;
            if (!isFlick && start && s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6) {
                const poly = openLoop();
                if (poly) {
                    if (o.star && frozen() && isStar(poly)) payStar(poly);
                    else close(poly);
                    s.wire = [];
                    s.drawing = false;
                    s.leftStart = false;
                    return;
                }
            }
            settleFork();
            if (!isFlick && s.wire.length > 1) s.events.push({ type: 'release', wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
        }
        // The pen is taken away (a card came up mid-stroke): the open wire is dropped without being judged (no loop, no
        // flick, no flag); a held Race Condition loop stays held, and a figure eight's first lobe is paid.
        function cancelPen() {
            settleFork();
            s.wire = [];
            s.stroke = null;
            s.drawing = false;
            s.leftStart = false;
        }

        // ---- Star: a five-pointed star drawn while the field is frozen ---------------------------------------
        // A closed stroke that crosses itself at least five times, with at least four sharp points.
        function isStar(pts) {
            if (pts.length < 10) return false;
            let crossings = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                for (let j = i + 2; j < pts.length - 1; j++) {
                    if (i === 0 && j === pts.length - 2) continue;
                    if (segIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) crossings++;
                }
            }
            if (crossings < 5) return false;
            // Sharp points: the heading turns more than 100° within about half a unit.
            let points = 0, lastAt = -Infinity, run = 0;
            for (let i = 1; i < pts.length - 1; i++) {
                run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                const back = pts[Math.max(0, i - 3)], fwd = pts[Math.min(pts.length - 1, i + 3)];
                const a1 = Math.atan2(pts[i].y - back.y, pts[i].x - back.x), a2 = Math.atan2(fwd.y - pts[i].y, fwd.x - pts[i].x);
                let d = Math.abs(a2 - a1) % (Math.PI * 2);
                if (d > Math.PI) d = Math.PI * 2 - d;
                if (d > 100 * Math.PI / 180 && run - lastAt > 0.6) { points++; lastAt = run; }
            }
            return points >= 4;
        }
        function hull(pts) {
            const ps = pts.map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
            const cr = (o2, a, b) => (a.x - o2.x) * (b.y - o2.y) - (a.y - o2.y) * (b.x - o2.x);
            const lo = [], up = [];
            for (const p of ps) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
            for (const p of ps.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
            return lo.slice(0, -1).concat(up.slice(0, -1));
        }
        // Everything inside the star's outline: the good packets caught at ×`starMult` on top of the multiplier, the
        // corrupt ones deleted (a star never spoils), mines inside cleared.
        function payStar(stroke) {
            const poly = hull(stroke);
            clearMines(poly);
            const j = judge(poly);
            if (j.corrupt.length) {
                s.stats.scrubbed += j.corrupt.length;
                remove(j.corrupt);
            }
            s.stats.stars++;
            s.events.push({ type: 'star', stroke, poly, x: centroid(poly).x, y: centroid(poly).y });
            if (!j.good.length) return;
            const mult = j.mult * o.starMult;
            payLoop(poly, 0, { ...j, inside: j.good, corrupt: [], spoiled: false, garbage: false, mult, units: j.value * mult, star: true });
        }

        // The live preview of the open wire: what closing it now would catch, and whether the pen is near enough to
        // the start to close it.
        function preview() {
            const poly = openLoop();
            if (!poly) return null;
            const j = judge(poly);
            const head = s.wire[s.wire.length - 1], start = s.wire[0];
            // The risk: corrupt packets just outside it (they can swim in before it closes).
            let risk = 0;
            for (const p of s.packets) {
                if (spoofed(p) || p.kind !== 'corrupt' || j.inside.includes(p)) continue;
                for (let i = 1; i < poly.length; i++) if (segDist(p, poly[i - 1], poly[i]) < 1) { risk++; break; }
            }
            return { ...j, risk, scrub: Math.min(j.corrupt.length, o.scrubbers), near: s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6 };
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

        return Object.assign(s, { step, addPoint, liftPen, cancelPen, stop, netsDone, netAreas, chargeReach, isStar, takeEvents, preview, valueOf, isGood, placeWall, placeAt, removeAt, usePower, wallsUp, frozen, layoutOf, emitterSpots });
    }

    return { STEP, FIELD_AREA, SNARE, GOLD_VALUE, TAG_VALUE, TAG_SECONDS, LOCK_SECONDS, PACKET_R, AV_R, BOSS_R, BOSS_WARN, BOSS_DASH, BOSS_DASH_SPEED, MINE_R, createSnare, segIntersect, pointInPolygon, polygonArea, wireLength, areaMult, rng };
});
