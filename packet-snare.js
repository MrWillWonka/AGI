// packet-snare.js — Packet Snare, the Data Pipeline's minigame: data packets swim in schools around a field, and the
// player draws a trailing wire. Bringing the pen back near where it started (or crossing the wire) closes a loop and
// **snares** everything inside: the bigger the loop, the bigger the multiplier, but a corrupt packet inside spoils the
// whole catch, a longer wire burns Focus faster, and Firewalls hunt the wire and snap it before it closes. The run
// ends when Focus runs out.
// It starts small, short and hard (a little field, a few seconds of Focus, corrupt packets hiding in the schools) and grows
// with its own skill tree (engine.js `snareOpts`): a wider field, more Focus, chain lightning off every catch, a scanner
// sweep that tags packets, targeted lasers that take packets by themselves, scrubbers that forgive a corrupt packet, and
// Anchors: tap to place them and lasers join them into a net that catches by itself.
// From the third run the **Rogue AI** fights for the same field: it drops Infection Cores whose red circles grow and steal
// the data inside. A tight loop round a core quarantines it (the Chokehold); a straight stroke becomes a shield wall
// across the field that no circle can grow past (the Wall).
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
        drawDrain: 0.5,             // and per second per unit of wire held: long wires burn faster
        maxWire: 36,                // units: past this the wire's tail is dropped (it trails behind you)
        minGap: 0.1,                // the wire records a point every this far
        closeRadius: 0.085,         // × √area: bring the pen back this close to the start and the loop closes
        areaUnit: 0.22,             // × area: a catch's multiplier is 1 + loop area / (areaUnit × field area)…
        maxMult: 4,                 // …up to this (Bandwidth raises it)
        corruptPenalty: 6,          // Focus lost when a corrupt packet spoils a catch
        snapPenalty: 4,             // Focus lost when a Firewall snaps the wire
        snapCooldown: 1.0,          // seconds before you can draw again after a snap
        respawn: 1.2,               // seconds before a caught packet's replacement swims in
        density: 0.13,              // good packets per unit² of field
        corruptShare: 0.35,         // corrupt packets per good one
        corruptLure: 0.6,           // how strongly corrupt packets swim toward the nearest school (they hide in the crowd)
        goldChance: 0.04,           // a new good packet is gold this often (worth GOLD_VALUE)
        firewalls: [5],             // seconds into the run each Firewall boots
        firewallSpeed: 1,           // × their speeds (Obfuscation slows them)
        packetSpeed: [0.8, 1.5],    // units per second
        goldSpeed: 2.1,
        schooling: 0.3,             // how strongly good packets swim together (0 = each alone)
        schoolSize: 4,              // packets per school at the start
        firewallPatrol: 1.0,        // drifting while there's no wire
        firewallHunt: 2.4,          // homing on the wire (a moving pointer is much faster)
        firewallTurn: 3.0,          // how quickly it steers (per second)
        chain: 0,                   // Chain Lightning: packets outside a loop each catch arcs to…
        chainRange: 1.6,            // …within this of a snared packet
        scanner: 0,                 // Scanner: beams sweeping from the middle, tagging packets ×TAG_VALUE for TAG_SECONDS
        scannerSpeed: 1.1,          // radians per second
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
        wallSeconds: 8,             // how long a shield wall stands
        maxWalls: 2,
        wallMin: 0.4,               // × the field's shorter side: the shortest stroke that counts as a wall…
        wallStraight: 0.07,         // …and how far (× its length) any point may stray from the straight line
        // Anchors: up to `anchors` placed by tapping; three or more join into a net that pulses to catch the good packets
        // inside, whenever none is corrupt, every `netCooldown` s, at `netPower` of a loop's multiplier.
        anchors: 0,
        netCooldown: 3,
        netPower: 0.6,
        netRepair: 4,               // seconds a net is down after a Firewall breaks it
        layout: []                  // anchors carried over from the last run, as shares of the field [[u, v], …]
    };
    const GOLD_VALUE = 5;
    const TAG_VALUE = 2;
    const TAG_SECONDS = 4;
    const LOCK_SECONDS = 0.6;       // a laser holds its brackets on the target this long before it fires
    const PACKET_R = 0.3;
    const FIREWALL_R = 0.45;

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
            firewalls: [],
            beams: [],              // the scanner's angles
            locks: [],              // targeted lasers: { id, t } brackets closing on a packet
            laserAt: o.laser ? o.laser * 0.6 : Infinity,
            events: [],
            cores: [],              // the Rogue AI's Infection Cores: { id, x, y, r, age, stole }
            walls: [],              // shield walls, across the field: { a, b, until }
            anchors: [],            // { id, x, y }: three or more make a net
            net: { next: 0, brokenUntil: 0, flash: 0 },
            rogueAt: o.rogue ? o.rogueFirst : Infinity,
            penAt: 0,               // when the pen went down (a wall is a quick straight stroke)
            stats: { catches: 0, caught: 0, gold: 0, units: 0, bestCatch: 0, bestMult: 0, corrupted: 0, snaps: 0, empty: 0, chained: 0, lasered: 0, scrubbed: 0, tagged: 0,
                stolen: 0, cores: 0, quarantined: 0, walls: 0, netCaught: 0, netPulses: 0, netBreaks: 0 },
            acc: 0,
            nextId: 1
        };
        for (let i = 0; i < o.scanner; i++) s.beams.push(i * Math.PI * 2 / o.scanner);
        // Anchors carried over from the last run (the net you built stays built).
        for (const [u, v] of (o.layout || []).slice(0, o.anchors)) s.anchors.push({ id: s.nextId++, x: u * w, y: v * h });

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
            if (fromEdge) {
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
            if (fromEdge) {
                const side = Math.floor(rand() * 4);
                const x = side === 0 ? 0.5 : side === 1 ? w - 0.5 : 0.5 + rand() * (w - 1);
                const y = side === 2 ? 0.5 : side === 3 ? h - 0.5 : 0.5 + rand() * (h - 1);
                add('corrupt', x, y, Math.atan2(h / 2 - y, w / 2 - x) + (rand() - 0.5) * 1.6, 0);
            } else {
                add('corrupt', 1 + rand() * (w - 2), 1 + rand() * (h - 2), rand() * Math.PI * 2, 0);
            }
        }

        const goodTarget = Math.max(4, Math.round(o.density * fieldArea));
        const corruptTarget = Math.max(1, Math.round(goodTarget * o.corruptShare));
        for (let left = goodTarget; left > 0;) {
            const n = Math.min(left, Math.max(2, Math.round(o.schoolSize * (0.6 + rand() * 0.8))));
            school(n, false);
            left -= n;
        }
        for (let i = 0; i < corruptTarget; i++) corrupt(false);
        const goodCount = () => s.packets.filter(p => p.kind !== 'corrupt').length;
        const corruptCount = () => s.packets.filter(p => p.kind === 'corrupt').length;
        let refillAt = Infinity;
        const firewallsDue = [...o.firewalls];

        function bootFirewall() {
            // From a corner, so it never lands on the pen.
            const c = Math.floor(rand() * 4);
            const x = c % 2 ? w - FIREWALL_R : FIREWALL_R;
            const y = c < 2 ? FIREWALL_R : h - FIREWALL_R;
            const ang = Math.atan2(h / 2 - y, w / 2 - x);
            const v = o.firewallPatrol * o.firewallSpeed;
            s.firewalls.push({ id: s.nextId++, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: FIREWALL_R, hunting: false });
            s.events.push({ type: 'firewall', x, y });
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
            if (o.corruptLure > 0) {
                const kc = Math.min(1, o.corruptLure * dt);
                for (const p of s.packets) {
                    if (p.kind !== 'corrupt') continue;
                    let best = null, bd = 9;
                    for (const q of s.packets) {
                        if (q.kind === 'corrupt') continue;
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
            for (const p of s.packets) {
                if (p.kind === 'corrupt') continue;
                let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
                for (const q of s.packets) {
                    if (q === p || q.school !== p.school) continue;
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

        const valueOf = p => (p.kind === 'gold' ? GOLD_VALUE : 1) * (p.tag > s.time ? TAG_VALUE : 1);

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
                        p.tag = s.time + TAG_SECONDS;
                    }
                }
            }
        }

        // ---- The Rogue AI -----------------------------------------------------------------------------
        const shortSide = Math.min(w, h);
        // A wall shields a packet from a core when it stands between them.
        const shielded = (core, p) => s.walls.some(wl => segIntersect(core, p, wl.a, wl.b));
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
            s.walls = s.walls.filter(wl => wl.until > s.time);
        }

        // A straight line through the field, edge to edge, along the stroke from a to b.
        function acrossField(a, b) {
            const dx = b.x - a.x, dy = b.y - a.y;
            const ts = [];
            if (Math.abs(dx) > 1e-9) for (const X of [0, w]) ts.push((X - a.x) / dx);
            if (Math.abs(dy) > 1e-9) for (const Y of [0, h]) ts.push((Y - a.y) / dy);
            const pts = ts.map(t => ({ x: a.x + dx * t, y: a.y + dy * t })).filter(p => p.x >= -1e-6 && p.x <= w + 1e-6 && p.y >= -1e-6 && p.y <= h + 1e-6);
            pts.sort((p, q) => (p.x - q.x) * dx + (p.y - q.y) * dy);
            return pts.length >= 2 ? { a: pts[0], b: pts[pts.length - 1] } : null;
        }
        // The stroke just lifted, if it's a wall: long enough and straight.
        function wallFrom(pts) {
            if (!o.rogue || pts.length < 3) return null;
            const a = pts[0], b = pts[pts.length - 1];
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            if (L < o.wallMin * shortSide) return null;
            if (pts.some(p => segDist(p, a, b) > o.wallStraight * L)) return null;
            return acrossField(a, b);
        }

        // ---- Anchors and the net -----------------------------------------------------------------------
        const netPoly = () => (s.anchors.length >= 3 ? s.anchors : null);
        // Tap an empty spot to place an anchor (while any are left); tap an anchor to take it back.
        function tapAt(x, y) {
            if (!o.anchors || s.over) return false;
            const hit = s.anchors.find(a => Math.hypot(a.x - x, a.y - y) <= Math.max(0.5, closeR * 0.8));
            if (hit) {
                s.anchors = s.anchors.filter(a => a !== hit);
                s.events.push({ type: 'anchor', x: hit.x, y: hit.y, removed: true });
                return true;
            }
            if (s.anchors.length >= o.anchors) return false;
            const p = inField(x, y);
            s.anchors.push({ id: s.nextId++, x: p.x, y: p.y });
            s.events.push({ type: 'anchor', x: p.x, y: p.y });
            return true;
        }
        function netStep() {
            const poly = netPoly();
            if (!poly) return;
            // Firewalls break the net's lasers.
            if (s.time >= s.net.brokenUntil) {
                for (const f of s.firewalls) {
                    for (let i = 0; i < poly.length; i++) {
                        if (segDist(f, poly[i], poly[(i + 1) % poly.length]) < f.r) {
                            s.net.brokenUntil = s.time + o.netRepair;
                            s.stats.netBreaks++;
                            s.events.push({ type: 'netBreak', x: f.x, y: f.y });
                            break;
                        }
                    }
                    if (s.time < s.net.brokenUntil) break;
                }
            }
            if (s.time < s.net.brokenUntil || s.time < s.net.next) return;
            const j = judge(poly);
            // It waits for corrupt packets to drift out, and fires when it holds good ones.
            if (j.spoiled || !j.good.length) return;
            const mult = 1 + (j.mult - 1) * o.netPower;
            const units = j.value * mult;
            s.net.next = s.time + o.netCooldown;
            s.net.flash = s.time;
            remove(j.inside);
            s.stats.netPulses++;
            s.stats.netCaught += j.good.length;
            s.stats.caught += j.good.length;
            s.stats.scrubbed += j.corrupt.length;
            s.stats.units += units;
            s.events.push({ type: 'net', poly: poly.map(a => ({ x: a.x, y: a.y })), count: j.good.length, units, mult, packets: j.inside, ...centroid(poly) });
        }

        function stepOnce(dt) {
            s.time += dt;
            if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
            flock(dt);
            for (const p of s.packets) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.age += dt;
                bounce(p);
            }
            scannerStep(dt);
            laserStep(dt);
            rogueStep(dt);
            netStep();
            while (firewallsDue.length && s.time >= firewallsDue[0]) { firewallsDue.shift(); bootFirewall(); }
            for (const f of s.firewalls) {
                // The open wire first; failing that, the net's nearest anchor (slower: it stalks the net).
                const wireTarget = s.wire.length > 1 ? nearestWire(f.x, f.y) : null;
                const net = !wireTarget && netPoly() && s.time >= s.net.brokenUntil ? s.anchors.reduce((b, a) => (!b || (a.x - f.x) ** 2 + (a.y - f.y) ** 2 < (b.x - f.x) ** 2 + (b.y - f.y) ** 2 ? a : b), null) : null;
                const target = wireTarget || net;
                f.hunting = !!wireTarget;
                const speed = (wireTarget ? o.firewallHunt : net ? o.firewallHunt * 0.6 : o.firewallPatrol) * o.firewallSpeed;
                if (target) {
                    const ang = Math.atan2(target.y - f.y, target.x - f.x);
                    const k = Math.min(1, o.firewallTurn * dt);
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
            const drain = o.idleDrain + (s.drawing ? o.drawBase + o.drawDrain * wireLength(s.wire) : 0);
            s.focus = Math.max(0, s.focus - drain * dt);
            if (s.focus <= 0) end();
        }

        function end() {
            if (s.over) return;
            s.over = true;
            s.wire = [];
            s.drawing = false;
            s.locks = [];
            s.events.push({ type: 'end', stats: { ...s.stats }, layout: s.anchors.map(a => [a.x / w, a.y / h]) });
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
            if (s.cores.length && j.area <= o.chokeArea * fieldArea) {
                const caught = s.cores.filter(c => pointInPolygon(c, poly));
                if (caught.length) {
                    s.cores = s.cores.filter(c => !caught.includes(c));
                    for (const c of caught) {
                        const units = 2 + 0.5 * c.stole;
                        s.stats.quarantined++;
                        s.stats.units += units;
                        s.events.push({ type: 'quarantine', x: c.x, y: c.y, r: c.r, units, poly });
                    }
                }
            }
            if (!j.inside.length) {
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
            let L = wireLength(s.wire);
            while (L > o.maxWire && s.wire.length > 2) {
                L -= Math.hypot(s.wire[1].x - s.wire[0].x, s.wire[1].y - s.wire[0].y);
                s.wire.shift();
            }
            return true;
        }

        // The pen lifts: near the start the loop closes, else an open wire is let go.
        function liftPen() {
            const start = s.wire[0], head = s.wire[s.wire.length - 1];
            // The Wall: a long straight stroke stands as a shield across the field.
            const wl = wallFrom(s.wire);
            if (wl) {
                s.walls.push({ ...wl, until: s.time + o.wallSeconds });
                if (s.walls.length > o.maxWalls) s.walls.shift();
                s.stats.walls++;
                s.events.push({ type: 'wall', a: wl.a, b: wl.b });
                s.wire = [];
                s.drawing = false;
                s.leftStart = false;
                return;
            }
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

        return Object.assign(s, { step, addPoint, liftPen, stop, takeEvents, preview, valueOf, tapAt, netPoly });
    }

    return { STEP, FIELD_AREA, SNARE, GOLD_VALUE, TAG_VALUE, TAG_SECONDS, LOCK_SECONDS, PACKET_R, FIREWALL_R, createSnare, segIntersect, pointInPolygon, polygonArea, wireLength, areaMult, rng };
});
