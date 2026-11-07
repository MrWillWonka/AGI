// packet-snare.js — Packet Snare, the Data Pipeline's minigame: data packets drift and bounce around a field, and the
// player draws a trailing wire. When the wire crosses itself it closes a loop and **snares** everything inside: the
// bigger the loop, the bigger the multiplier, but a corrupt packet inside spoils the whole catch, a longer wire burns
// Focus faster, and Firewalls hunt the wire and snap it before it closes. The run ends when Focus runs out.
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
    const FIELD_AREA = 160;         // world units² (game.js picks w × h to this area at the canvas's aspect)

    // First-pass numbers: tune against the first playtest log (`snare` events carry each run's summary).
    const SNARE = {
        focus: 100,                 // the run's budget
        idleDrain: 1.2,             // Focus per second, always: an idle run still ends (about 80 s)
        drawBase: 1.5,              // extra per second while the pen is down
        drawDrain: 0.55,            // and per second per unit of wire held: long wires burn faster
        maxWire: 36,                // units: past this the wire's tail is dropped (it trails behind you)
        minGap: 0.12,               // the wire records a point every this far
        areaUnit: 12,               // a catch's multiplier is 1 + area / areaUnit…
        maxMult: 5,                 // …up to this
        corruptPenalty: 10,         // Focus lost when a corrupt packet spoils a catch
        snapPenalty: 5,             // Focus lost when a Firewall snaps the wire
        snapCooldown: 1.2,          // seconds before you can draw again after a snap
        respawn: 1.4,               // seconds before a caught packet's replacement drifts in
        good: 20,                   // packets on a field of FIELD_AREA (scaled by the field's area)
        corrupt: 4,
        goldChance: 0.05,           // a new good packet is gold this often (worth GOLD_VALUE)
        firewalls: [6, 32],         // seconds into the run each Firewall boots
        packetSpeed: [0.7, 1.5],    // units per second
        goldSpeed: 2.1,
        firewallPatrol: 1.1,        // drifting while there's no wire
        firewallHunt: 2.3,          // homing on the wire (a moving pointer is much faster)
        firewallTurn: 3.2           // how quickly it steers (per second)
    };
    const GOLD_VALUE = 5;
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

    // The multiplier a loop of this area earns.
    const areaMult = (area, o = SNARE) => Math.min(o.maxMult, 1 + area / o.areaUnit);

    // ---- A run -------------------------------------------------------------------------------------------

    // opts: { w, h, seed, ...any SNARE override }. Defaults to a FIELD_AREA field at 16:10.
    function createSnare(opts = {}) {
        const o = { ...SNARE, ...opts };
        const w = opts.w || Math.sqrt(FIELD_AREA * 1.6);
        const h = opts.h || FIELD_AREA / w;
        const rand = rng(opts.seed ?? 1);
        const scale = (w * h) / FIELD_AREA;
        const s = {
            w, h, opts: o,
            time: 0,
            focus: o.focus,
            maxFocus: o.focus,
            over: false,
            cooldown: 0,
            drawing: false,
            wire: [],
            packets: [],
            firewalls: [],
            events: [],
            stats: { catches: 0, caught: 0, gold: 0, units: 0, bestCatch: 0, bestMult: 0, corrupted: 0, snaps: 0, empty: 0 },
            acc: 0,
            nextId: 1
        };

        function speedFor(kind) {
            if (kind === 'gold') return o.goldSpeed;
            return o.packetSpeed[0] + rand() * (o.packetSpeed[1] - o.packetSpeed[0]);
        }

        // A packet anywhere (the opening field) or drifting in from an edge (a replacement).
        function spawn(kind, fromEdge) {
            if (kind === 'good' && rand() < o.goldChance) kind = 'gold';
            let x, y, ang;
            if (fromEdge) {
                const side = Math.floor(rand() * 4);
                x = side === 0 ? PACKET_R : side === 1 ? w - PACKET_R : PACKET_R + rand() * (w - 2 * PACKET_R);
                y = side === 2 ? PACKET_R : side === 3 ? h - PACKET_R : PACKET_R + rand() * (h - 2 * PACKET_R);
                // heading into the field, give or take
                ang = Math.atan2(h / 2 - y, w / 2 - x) + (rand() - 0.5) * 1.6;
            } else {
                x = PACKET_R + rand() * (w - 2 * PACKET_R);
                y = PACKET_R + rand() * (h - 2 * PACKET_R);
                ang = rand() * Math.PI * 2;
            }
            const v = speedFor(kind);
            s.packets.push({ id: s.nextId++, kind, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: PACKET_R, age: 0 });
        }

        const goodCount = Math.max(4, Math.round(o.good * scale));
        const corruptCount = Math.max(1, Math.round(o.corrupt * scale));
        for (let i = 0; i < goodCount; i++) spawn('good', false);
        for (let i = 0; i < corruptCount; i++) spawn('corrupt', false);
        const pending = [];      // { kind, at }: replacements on their way
        const firewallsDue = [...o.firewalls];

        function bootFirewall() {
            // From a corner, so it never lands on the pen.
            const c = Math.floor(rand() * 4);
            const x = c % 2 ? w - FIREWALL_R : FIREWALL_R;
            const y = c < 2 ? FIREWALL_R : h - FIREWALL_R;
            const ang = Math.atan2(h / 2 - y, w / 2 - x);
            s.firewalls.push({ id: s.nextId++, x, y, vx: Math.cos(ang) * o.firewallPatrol, vy: Math.sin(ang) * o.firewallPatrol, r: FIREWALL_R, hunting: false });
            s.events.push({ type: 'firewall', x, y });
        }

        function bounce(e) {
            if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
            if (e.x > w - e.r) { e.x = w - e.r; e.vx = -Math.abs(e.vx); }
            if (e.y < e.r) { e.y = e.r; e.vy = Math.abs(e.vy); }
            if (e.y > h - e.r) { e.y = h - e.r; e.vy = -Math.abs(e.vy); }
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
            s.cooldown = o.snapCooldown;
            s.focus = Math.max(0, s.focus - o.snapPenalty);
            s.stats.snaps++;
        }

        function stepOnce(dt) {
            s.time += dt;
            if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
            for (const p of s.packets) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.age += dt;
                bounce(p);
            }
            while (firewallsDue.length && s.time >= firewallsDue[0]) { firewallsDue.shift(); bootFirewall(); }
            for (const f of s.firewalls) {
                const target = s.wire.length > 1 ? nearestWire(f.x, f.y) : null;
                f.hunting = !!target;
                const speed = target ? o.firewallHunt : o.firewallPatrol;
                if (target) {
                    const ang = Math.atan2(target.y - f.y, target.x - f.x);
                    const k = Math.min(1, o.firewallTurn * dt);
                    f.vx += (Math.cos(ang) * speed - f.vx) * k;
                    f.vy += (Math.sin(ang) * speed - f.vy) * k;
                } else {
                    // Back to patrol speed, keeping its heading.
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
            for (let i = pending.length - 1; i >= 0; i--) {
                if (s.time >= pending[i].at) { spawn(pending[i].kind, true); pending.splice(i, 1); }
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
            s.events.push({ type: 'end', stats: { ...s.stats } });
        }

        // Close a loop: everything inside is snared, or spoiled if anything corrupt is in there.
        function close(poly) {
            const area = polygonArea(poly);
            const inside = s.packets.filter(p => pointInPolygon(p, poly));
            const at = centroid(poly);
            if (!inside.length) {
                s.stats.empty++;
                s.events.push({ type: 'empty', x: at.x, y: at.y, poly, area });
                return;
            }
            for (const p of inside) pending.push({ kind: p.kind === 'gold' ? 'good' : p.kind, at: s.time + o.respawn * (0.6 + rand() * 0.8) });
            s.packets = s.packets.filter(p => !inside.includes(p));
            const corrupt = inside.filter(p => p.kind === 'corrupt').length;
            if (corrupt) {
                s.stats.corrupted++;
                s.focus = Math.max(0, s.focus - o.corruptPenalty);
                s.events.push({ type: 'corrupt', x: at.x, y: at.y, poly, area, count: inside.length, corrupt, packets: inside });
                if (s.focus <= 0) end();
                return;
            }
            const gold = inside.filter(p => p.kind === 'gold').length;
            const value = inside.length + gold * (GOLD_VALUE - 1);
            const mult = areaMult(area, o);
            const units = value * mult;
            s.stats.catches++;
            s.stats.caught += inside.length;
            s.stats.gold += gold;
            s.stats.units += units;
            s.stats.bestCatch = Math.max(s.stats.bestCatch, units);
            s.stats.bestMult = Math.max(s.stats.bestMult, mult);
            s.events.push({ type: 'catch', x: at.x, y: at.y, poly, area, count: inside.length, gold, mult, units, packets: inside });
        }

        // The pen moves to (x, y): extend the wire, and close a loop if it crosses itself. Returns false while
        // the pen can't draw (after a snap, or the run is over).
        function addPoint(x, y) {
            if (s.over || s.cooldown > 0) return false;
            x = Math.max(0, Math.min(w, x));
            y = Math.max(0, Math.min(h, y));
            const p = { x, y };
            if (!s.drawing) {
                s.drawing = true;
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
            // A wire past its length drops its tail.
            let L = wireLength(s.wire);
            while (L > o.maxWire && s.wire.length > 2) {
                L -= Math.hypot(s.wire[1].x - s.wire[0].x, s.wire[1].y - s.wire[0].y);
                s.wire.shift();
            }
            return true;
        }

        // The pen lifts: an open wire is let go.
        function liftPen() {
            if (s.wire.length > 1) s.events.push({ type: 'release', wire: s.wire.slice() });
            s.wire = [];
            s.drawing = false;
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

        return Object.assign(s, { step, addPoint, liftPen, stop, takeEvents });
    }

    return { STEP, FIELD_AREA, SNARE, GOLD_VALUE, PACKET_R, FIREWALL_R, createSnare, segIntersect, pointInPolygon, polygonArea, wireLength, areaMult, rng };
});
