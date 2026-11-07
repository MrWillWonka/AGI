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
        maxGood: 340,               // …up to this many (a datacentre's field would hold a thousand: crowded, and slow)
        corruptShare: 0.35,         // corrupt packets per good one
        corruptLure: 0.6,           // how strongly corrupt packets swim toward the nearest school (they hide in the crowd)
        goldChance: 0.04,           // a new good packet is gold this often (worth GOLD_VALUE)
        antivirus: [5],             // seconds into the run each Antivirus boots
        avSpeed: 1,                 // × their speeds (Obfuscation slows them)
        // System Firewalls: a line across the whole field, sweeping from one side to the other after a warning; any open
        // wire it crosses snaps.
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
        // Things you place with a tap: decoys (corrupt packets and idle Antivirus go to them; an Antivirus that reaches
        // one breaks it), turrets (each takes the richest good packet in reach every `turretEvery` s; Purifier rounds
        // also wipe a corrupt one) and scanner towers (a beam turning round each tags what it passes).
        decoys: 0,
        decoyLure: 4,
        turrets: 0,
        turretRange: 1.7,
        turretEvery: 2.6,
        turretPurge: 0,
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
        // The boss Antivirus: it boots `bossAt` s in, or once `bossCatch` packets are caught (0 = none this run). Bigger,
        // it hunts the wire like the others; a tight loop round it (no bigger than `bossLoop` × the field) takes a hit off
        // it, and at 0 it's beaten (the sector is cleared). Your Firewalls stun it as they stun the others.
        boss: 0,                    // its hits (0 = no boss)
        bossAt: 16,
        bossCatch: 18,
        bossLoop: 0.12,
        bossSpeed: 1,               // × an Antivirus's roaming speed
        bossCharge: 5,              // seconds between its charges at the pen
        bossStun: 1.5,              // seconds it reels after each hit
        bossMinions: 0              // Antivirus it boots each time it's hit (later sectors)
    };
    const GOLD_VALUE = 5;
    const TAG_VALUE = 2;
    const TAG_SECONDS = 1.5;   // the default `tagSeconds`
    const LOCK_SECONDS = 0.6;       // a laser holds its brackets on the target this long before it fires
    const PACKET_R = 0.3;
    const AV_R = 0.45;
    const BOSS_R = 0.8;
    const BOSS_WARN = 0.7, BOSS_DASH = 0.45, BOSS_DASH_SPEED = 5;   // a charge: its warning, its dash and its speed

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
        const maxWire = o.maxWire * grow;
        const drawDrain = o.drawDrain / grow;
        const s = {
            w, h, opts: o, closeR,
            time: 0,
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
            frozenUntil: 0,
            rogueAt: o.rogue ? o.rogueFirst : Infinity,
            boss: null,             // the boss Antivirus once it boots: { x, y, vx, vy, r, hp, maxHp, stunned, hunting }
            bossDone: false,
            stats: { catches: 0, caught: 0, gold: 0, units: 0, bestCatch: 0, bestMult: 0, corrupted: 0, snaps: 0, empty: 0, chained: 0, lasered: 0, scrubbed: 0, tagged: 0,
                stolen: 0, cores: 0, quarantined: 0, walls: 0, bounces: 0, stuns: 0, fwLost: 0, sweeps: 0, escaped: 0, bossHits: 0, bosses: 0, wiped: 0, turreted: 0, purged: 0, decoysLost: 0, freezes: 0 },
            acc: 0,
            nextId: 1
        };
        for (let i = 0; i < o.scanner; i++) s.beams.push(i * Math.PI * 2 / o.scanner);
        // What you placed last run stays placed (as far as this run's slots go).
        const L0 = o.layout || {};
        for (const [u1, v1, u2, v2] of (L0.walls || []).slice(0, o.firewalls)) s.walls.push({ id: s.nextId++, a: { x: u1 * w, y: v1 * h }, b: { x: u2 * w, y: v2 * h }, hits: 0 });
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
            s.packets.push({ id: s.nextId++, kind, x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, v, r: PACKET_R, age: 0, school, tag: 0 });
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
        function bossStep(dt) {
            if (!o.boss || s.bossDone) return;
            if (!s.boss) {
                if (s.time < o.bossAt && s.stats.caught < o.bossCatch) return;
                const c = Math.floor(rand() * 4);
                const x = c % 2 ? w - BOSS_R : BOSS_R, y = c < 2 ? BOSS_R : h - BOSS_R;
                s.boss = { x, y, vx: 0, vy: 0, r: BOSS_R, hp: o.boss, maxHp: o.boss, stunned: 0, hunting: false, immune: null, charge: null, chargeAt: s.time + 3 };
                s.events.push({ type: 'boss', x, y, hp: o.boss });
                return;
            }
            const b = s.boss;
            if (b.stunned > s.time) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.vx *= 1 - Math.min(1, 3 * dt);
                b.vy *= 1 - Math.min(1, 3 * dt);
                bounce(b);
                b.hunting = false;
                return;
            }
            // It roams to the nearest school and wipes the data it touches; every few seconds, while you draw, it locks
            // on to the pen (a warning) and charges it. Loop it while it roams or reels.
            if (b.charge) {
                b.charge.t += dt;
                if (b.charge.t < BOSS_WARN) { b.vx *= 0.8; b.vy *= 0.8; }
                else if (b.charge.t < BOSS_WARN + BOSS_DASH) { b.vx = b.charge.dx * BOSS_DASH_SPEED * o.avSpeed; b.vy = b.charge.dy * BOSS_DASH_SPEED * o.avSpeed; }
                else { b.charge = null; b.chargeAt = s.time + o.bossCharge; }
                b.hunting = !!b.charge;
            } else {
                if (s.drawing && s.wire.length > 1 && s.time >= (b.chargeAt ?? 0)) {
                    const head = s.wire[s.wire.length - 1];
                    const L = Math.hypot(head.x - b.x, head.y - b.y) || 1;
                    b.charge = { t: 0, dx: (head.x - b.x) / L, dy: (head.y - b.y) / L };
                    s.events.push({ type: 'bossCharge', x: b.x, y: b.y });
                }
                let best = null, bd = Infinity;
                for (const p of [...s.decoys, ...s.packets]) {
                    if (p.kind === 'corrupt') continue;
                    const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2 * (p.kind ? 1 : 0.5);
                    if (d < bd) { bd = d; best = p; }
                }
                const target = best || { x: w / 2, y: h / 2 };
                const speed = o.avPatrol * o.bossSpeed * o.avSpeed;
                const ang = Math.atan2(target.y - b.y, target.x - b.x);
                const k = Math.min(1, o.avTurn * 0.6 * dt);
                b.vx += (Math.cos(ang) * speed - b.vx) * k;
                b.vy += (Math.sin(ang) * speed - b.vy) * k;
                b.hunting = false;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            const wiped = s.packets.filter(p => p.kind !== 'corrupt' && Math.hypot(p.x - b.x, p.y - b.y) < b.r);
            if (wiped.length) {
                s.stats.wiped += wiped.length;
                s.events.push({ type: 'wiped', x: b.x, y: b.y, packets: wiped.map(p => ({ x: p.x, y: p.y, kind: p.kind })) });
                remove(wiped);
            }
            bounce(b);
            if (s.wire.length > 1) {
                for (let i = 1; i < s.wire.length; i++) {
                    if (segDist(b, s.wire[i - 1], s.wire[i]) < b.r) { snap(b); s.focus = Math.max(0, s.focus - o.snapPenalty * 0.5); break; }
                }
            }
            // Your Firewalls stun it too, once per approach, like the others (it shrugs the stun off sooner).
            stunOnWalls(b, o.avStun * 0.6, true);
        }
        // A tight loop round the boss takes a hit off it.
        function bossLooped(poly, area) {
            const b = s.boss;
            if (!b || area > o.bossLoop * fieldArea || !pointInPolygon(b, poly)) return false;
            b.hp--;
            s.stats.bossHits++;
            for (let i = 0; i < o.bossMinions && b.hp > 0; i++) bootAntivirus();
            b.stunned = s.time + o.bossStun;
            const ang = rand() * Math.PI * 2;
            b.vx = Math.cos(ang) * 3;
            b.vy = Math.sin(ang) * 3;
            if (b.hp <= 0) {
                s.stats.bosses++;
                s.bossDone = true;
                s.boss = null;
                s.events.push({ type: 'bossDown', x: b.x, y: b.y });
            } else {
                s.events.push({ type: 'bossHit', x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp });
            }
            return true;
        }

        function bootAntivirus() {
            // From a corner, so it never lands on the pen.
            const c = Math.floor(rand() * 4);
            const x = c % 2 ? w - AV_R : AV_R;
            const y = c < 2 ? AV_R : h - AV_R;
            const ang = Math.atan2(h / 2 - y, w / 2 - x);
            const v = o.avPatrol * o.avSpeed;
            s.antivirus.push({ id: s.nextId++, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: AV_R, hunting: false, stunned: 0 });
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
                const kc = Math.min(1, o.corruptLure * dt);
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
                    if (p.kind !== 'corrupt') continue;
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
            s.events.push({ type: 'snap', x: fw.x, y: fw.y, wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
            s.cooldown = o.snapCooldown;
            s.focus = Math.max(0, s.focus - o.snapPenalty);
            s.stats.snaps++;
        }

        const valueOf = p => (p.kind === 'gold' ? GOLD_VALUE : 1) * (p.tag > s.time ? o.tagValue : 1);

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
            // The richest packets not already locked: gold first, then tagged, then anything good.
            const taken = new Set(s.locks.map(l => l.id));
            const pool = s.packets.filter(p => p.kind !== 'corrupt' && !taken.has(p.id))
                .sort((a, b) => valueOf(b) - valueOf(a) || a.id - b.id);
            for (let i = 0; i < o.emitters && i < pool.length; i++) {
                // Emitters sit along the bottom edge, spread out.
                const from = { x: w * (i + 1) / (o.emitters + 1), y: h };
                s.locks.push({ id: pool[i].id, t: 0, from });
            }
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
                    if (d <= a1 - a0 + 1e-9) {
                        if (!(p.tag > s.time)) s.stats.tagged++;
                        p.tag = s.time + o.tagSeconds;
                    }
                }
            }
        }

        // ---- The Rogue AI -----------------------------------------------------------------------------
        const shortSide = Math.min(w, h);
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
            if (s.over || s.walls.length >= o.firewalls) return null;
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
                s.frozenUntil = s.time + o.freezeSeconds;
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
        const frozen = () => s.time < s.frozenUntil;
        // A corrupt packet that would cross one of your Firewalls this step bounces off it (good ones pass).
        function bounceOffWalls(p, px, py) {
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
            if (down) { s.stats.fwLost++; wallsNow = wallsUp(); }
            s.events.push({ type: 'stun', x: v.x, y: v.y, down, boss: isBoss, a: { x: f.a.x, y: f.a.y }, b: { x: f.b.x, y: f.b.y } });
        }
        // Turrets take the richest good packet in reach on their beat; Purifier rounds wipe a corrupt one too.
        function turretStep() {
            for (const t of s.turrets) {
                if (s.time < t.at) continue;
                t.at = s.time + o.turretEvery;
                const near = s.packets.filter(p => Math.hypot(p.x - t.x, p.y - t.y) <= o.turretRange);
                const good = near.filter(p => p.kind !== 'corrupt').sort((a, b) => valueOf(b) - valueOf(a) || a.id - b.id)[0];
                if (good) {
                    const units = valueOf(good);
                    s.stats.turreted++;
                    s.stats.caught++;
                    s.stats.units += units;
                    if (good.kind === 'gold') s.stats.gold++;
                    s.events.push({ type: 'laser', x: good.x, y: good.y, from: { x: t.x, y: t.y }, units, kind: good.kind, turret: true });
                    remove([good]);
                }
                const bad = o.turretPurge ? near.find(p => p.kind === 'corrupt') : null;
                if (bad) {
                    s.stats.purged++;
                    s.events.push({ type: 'zap', x: bad.x, y: bad.y, from: { x: t.x, y: t.y } });
                    remove([bad]);
                }
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
                    if (d <= a1 - a0 + 1e-9) {
                        if (!(p.tag > s.time)) s.stats.tagged++;
                        p.tag = s.time + o.tagSeconds;
                    }
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
            s.herders.forEach((hd, i) => {
                const st = strays[i];
                let tx = g.x, ty = g.y;
                if (st && st.d > 0.8) {
                    tx = st.p.x + (st.p.x - g.x) / st.d * 0.9;
                    ty = st.p.y + (st.p.y - g.y) / st.d * 0.9;
                }
                hd.target = st ? st.p.id : null;
                const ang = Math.atan2(ty - hd.y, tx - hd.x);
                const k = Math.min(1, 4 * dt);
                hd.vx += (Math.cos(ang) * o.herdSpeed - hd.vx) * k;
                hd.vy += (Math.sin(ang) * o.herdSpeed - hd.vy) * k;
                hd.x = Math.max(0.2, Math.min(w - 0.2, hd.x + hd.vx * dt));
                hd.y = Math.max(0.2, Math.min(h - 0.2, hd.y + hd.vy * dt));
            });
            // Packets near a herder turn: good ones toward the gather point, corrupt ones away from it.
            const kp = Math.min(1, o.herdPull * dt);
            for (const p of s.packets) {
                if (!s.herders.some(hd => Math.hypot(hd.x - p.x, hd.y - p.y) <= o.herdRadius)) continue;
                let ang = Math.atan2(g.y - p.y, g.x - p.x);
                if (p.kind === 'corrupt') ang += Math.PI;
                p.vx += (Math.cos(ang) * p.v - p.vx) * kp;
                p.vy += (Math.sin(ang) * p.v - p.vy) * kp;
                const vl = Math.hypot(p.vx, p.vy) || 1;
                p.vx = p.vx / vl * p.v;
                p.vy = p.vy / vl * p.v;
            }
        }

        function stepOnce(dt) {
            s.time += dt;
            if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
            wallsNow = wallsUp();
            // Frozen: nothing on the field moves and Focus holds; only your pen works.
            if (frozen()) return;
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
            bossStep(dt);
            sweepStep(dt);
            while (avDue.length && s.time >= avDue[0]) { avDue.shift(); bootAntivirus(); }
            for (const f of s.antivirus) {
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
                // The open wire first; failing that, your nearest decoy (it goes for decoys, not your Firewalls).
                const wireTarget = s.wire.length > 1 ? nearestWire(f.x, f.y) : null;
                const decoy = !wireTarget && s.decoys.length ? s.decoys.reduce((b, a) => (!b || (a.x - f.x) ** 2 + (a.y - f.y) ** 2 < (b.x - f.x) ** 2 + (b.y - f.y) ** 2 ? a : b), null) : null;
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
                stunOnWalls(f, o.avStun);
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
                walls: s.walls.filter(f => f.hits < o.fwHits).map(f => [r3(f.a.x / w), r3(f.a.y / h), r3(f.b.x / w), r3(f.b.y / h)]),
                decoys: s.decoys.map(d => [r3(d.x / w), r3(d.y / h)]),
                turrets: s.turrets.map(t => [r3(t.x / w), r3(t.y / h)]),
                towers: s.towers.map(t => [r3(t.x / w), r3(t.y / h)])
            };
        }

        // What a loop would catch: the packets inside, how many are corrupt beyond what the scrubbers forgive, its
        // multiplier and its worth. Used to close a loop and, on the open wire, for the live preview.
        function judge(poly) {
            const area = polygonArea(poly);
            const inside = s.packets.filter(p => pointInPolygon(p, poly));
            const corrupt = inside.filter(p => p.kind === 'corrupt');
            const good = inside.filter(p => p.kind !== 'corrupt');
            const spoiled = corrupt.length > o.scrubbers;
            const mult = areaMult(area, o, fieldArea);
            const value = good.reduce((a, p) => a + valueOf(p), 0);
            return { area, inside, corrupt, good, spoiled, mult, value, units: spoiled ? 0 : value * mult };
        }

        // Close a loop: everything inside is snared, or spoiled if anything corrupt (past the scrubbers) is in there.
        function close(poly) {
            const j = judge(poly);
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
                        s.events.push({ type: 'quarantine', x: c.x, y: c.y, r: c.r, units, poly });
                    }
                }
            }
            if (bossLooped(poly, j.area)) quarantined = true;
            if (!j.inside.length) {
                if (quarantined) return;
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area: j.area });
                return;
            }
            if (j.spoiled) {
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
                const outside = s.packets.filter(p => p.kind !== 'corrupt' && !j.inside.includes(p));
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
            }
            const chainValue = chained.reduce((a, c) => a + valueOf(c.packet), 0);
            const units = (j.value + chainValue) * j.mult;
            const gold = j.good.filter(p => p.kind === 'gold').length + chained.filter(c => c.packet.kind === 'gold').length;
            remove([...j.inside, ...chained.map(c => c.packet)]);
            const count = j.good.length + chained.length;
            s.stats.catches++;
            s.stats.caught += count;
            s.stats.gold += gold;
            s.stats.chained += chained.length;
            s.stats.scrubbed += j.corrupt.length;
            s.stats.units += units;
            s.stats.bestCatch = Math.max(s.stats.bestCatch, units);
            s.stats.bestMult = Math.max(s.stats.bestMult, j.mult);
            // Second Wind: a big loop gives Focus back.
            if (o.focusBack && j.mult >= 2) s.focus = Math.min(s.maxFocus, s.focus + o.focusBack);
            s.events.push({ type: 'catch', x: at.x, y: at.y, poly, area: j.area, count, gold, mult: j.mult, units, packets: j.inside,
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
            if (!s.drawing) {
                s.drawing = true;
                s.leftStart = false;
                s.wire = [p];
                return true;
            }
            const last = s.wire[s.wire.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < o.minGap) return true;
            // The new segment against every earlier one but its neighbour: the newest crossing closes the loop.
            for (let i = s.wire.length - 3; i >= 0; i--) {
                const q = segIntersect(last, p, s.wire[i], s.wire[i + 1]);
                if (q) {
                    close([q, ...s.wire.slice(i + 1)]);
                    // Keep drawing from here: one scribble can snare loop after loop.
                    s.wire = s.over ? [] : [p];
                    return true;
                }
            }
            s.wire.push(p);
            const start = s.wire[0];
            const fromStart = Math.hypot(x - start.x, y - start.y);
            if (fromStart > closeR * 1.5) s.leftStart = true;
            // Back near the start: the loop snaps shut.
            if (s.leftStart && fromStart <= closeR) {
                const poly = openLoop();
                if (poly) {
                    close(poly);
                    s.wire = s.over ? [] : [p];
                    return true;
                }
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
            const start = s.wire[0], head = s.wire[s.wire.length - 1];
            if (start && s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6) {
                const poly = openLoop();
                if (poly) {
                    close(poly);
                    s.wire = [];
                    s.drawing = false;
                    return;
                }
            }
            if (s.wire.length > 1) s.events.push({ type: 'release', wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
            s.leftStart = false;
        }

        // The live preview of the open wire: what closing it now would catch, and whether the pen is near enough to
        // the start to close it.
        function preview() {
            const poly = openLoop();
            if (!poly) return null;
            const j = judge(poly);
            const head = s.wire[s.wire.length - 1], start = s.wire[0];
            return { ...j, near: s.leftStart && Math.hypot(head.x - start.x, head.y - start.y) <= closeR * 1.6 };
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

        return Object.assign(s, { step, addPoint, liftPen, stop, takeEvents, preview, valueOf, placeWall, placeAt, removeAt, usePower, wallsUp, frozen, layoutOf });
    }

    return { STEP, FIELD_AREA, SNARE, GOLD_VALUE, TAG_VALUE, TAG_SECONDS, LOCK_SECONDS, PACKET_R, AV_R, BOSS_R, BOSS_WARN, createSnare, segIntersect, pointInPolygon, polygonArea, wireLength, areaMult, rng };
});
