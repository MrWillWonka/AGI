// snare-demos.js — Packet Snare's mechanic demos: three seconds of the real thing (packet-snare.js on a small still
// field, packets placed by hand, a scripted pen, taps and powers) for a tree node's popup and the first-meeting cards.
// Pure (no DOM): game.js draws a demo with the bay's own layers, and tests/snare-demos.test.js plays every one and checks
// that it shows what it's for (`expect`): round 2 of the review found four that didn't.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SnareDemos = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FIELD = { w: 6, h: 2.8 };
    const PERIOD = 3.2;
    // A ring of points round (cx, cy), starting at its top and going a little past it, so the loop closes.
    const ring = (cx, cy, rx, ry, n = 28) => Array.from({ length: n + 3 }, (_, i) => [cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * rx, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * ry]);

    // Points along a straight line (a flick).
    const line = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);

    // Each demo: options for the run, packets [kind, x, y, vx, vy], a wire [from s, to s, points], taps or walls or
    // powers at times, things pinned in place (`hold`), and `expect`, what the run must show by its end.
    const DEMOS = {
        lasso: { text: 'Loop the data; back at the start, it closes', opts: {},
            packets: [['good', 2.6, 1.2], ['good', 3.1, 1.5], ['good', 2.7, 1.8], ['good', 4.9, 0.7], ['corrupt', 5, 2.2]],
            wire: [0.3, 1.6, ring(2.8, 1.5, 0.85, 0.8)], expect: r => r.stats.catches >= 1 },
        chain: { text: 'Each catch arcs to good packets nearby', opts: { chain: 2 },
            packets: [['good', 2, 1.3], ['good', 2.3, 1.6], ['good', 1.8, 1.7], ['good', 3.3, 1.2], ['good', 3.4, 1.9], ['good', 5, 1.4]],
            wire: [0.3, 1.4, ring(2.05, 1.5, 0.75, 0.7)], expect: r => r.stats.chained >= 1 },
        scrubbers: { text: 'A loop forgives a corrupt packet', opts: { scrubbers: 1 },
            packets: [['good', 2.7, 1.2], ['good', 3.3, 1.3], ['corrupt', 3, 1.6], ['good', 2.8, 1.9], ['good', 3.3, 1.9]],
            wire: [0.3, 1.5, ring(3, 1.55, 0.95, 0.85)], expect: r => r.stats.scrubbed >= 1 && r.stats.catches >= 1 },
        scanner: { text: 'Packets the beam passes are worth ×2 for a moment', opts: { scanner: 1, scannerSpeed: 2.2 },
            packets: [['good', 1, 0.6], ['good', 4.6, 0.7], ['good', 1.5, 2.2], ['good', 4.2, 2.1], ['good', 3.6, 0.5], ['good', 2.2, 1.2]],
            expect: r => r.stats.tagged >= 3 },
        laser: { text: 'A laser takes the richest packet by itself', opts: { laser: 0.9 },
            packets: [['good', 1.2, 0.7], ['gold', 4.4, 1.0], ['good', 2.6, 1.6], ['good', 3.6, 2.0], ['good', 5.1, 0.6]],
            expect: r => r.stats.lasered >= 2 },
        contain: { text: 'The edges turn good packets back; corrupt ones leave', opts: { contain: 1, flow: true },
            packets: [['good', 4.6, 0.8, 1.5, 0.2], ['good', 4.9, 1.6, 1.4, -0.1], ['corrupt', 4.7, 2.2, 1.4, 0.1], ['good', 4.2, 1.3, 1.6, 0]],
            expect: r => r.packets.filter(p => p.kind !== 'corrupt').length === 3 && !r.packets.some(p => p.kind === 'corrupt') },
        herders: { text: 'Drones herd strays together and shoo the corrupt ones', opts: { herders: 2, herdSpeed: 3.5, herdPull: 4 },
            packets: [['good', 0.6, 0.5, -0.6, 0], ['good', 5.4, 2.3, 0.6, 0], ['good', 0.7, 2.3, -0.5, 0.2], ['good', 5.3, 0.5, 0.5, -0.2], ['corrupt', 3, 1.5, 0.4, 0]],
            expect: (r, sim) => spread(r) < sim.spread0 * 0.8 },
        firewall: { text: 'Draw a wall: corrupt packets bounce off, good ones pass', opts: { firewalls: 1 },
            packets: [['good', 1.4, 0.9, 1.3, 0], ['corrupt', 1.2, 1.7, 1.3, 0], ['good', 0.8, 2.3, 1.3, 0]],
            walls: [[0.2, [3.2, 0.2], [3.2, 2.6]]], expect: r => r.stats.bounces >= 1 && r.packets.some(p => p.kind === 'good' && p.x > 3.3) },
        decoy: { text: 'Tap to place a decoy: corrupt packets and Antivirus go to it', opts: { decoys: 1, corruptLure: 5 },
            packets: [['corrupt', 1.5, 1.4, 0, 0.8], ['corrupt', 1.2, 0.6, 0, -0.8], ['good', 3, 2.3]],
            taps: [[0.2, 'decoy', 5, 1.4]], expect: (r, sim) => r.packets.filter(p => p.kind === 'corrupt').every(p => p.x > 2.6) },
        turret: { text: 'Tap to place a turret: it picks off packets in reach', opts: { turrets: 1, turretEvery: 0.6 },
            packets: [['good', 2.6, 1.2], ['gold', 3.4, 1.6], ['good', 3.1, 0.8], ['good', 5.4, 2.4]],
            taps: [[0.2, 'turret', 3, 1.4]], expect: r => r.stats.turreted >= 2 },
        tower: { text: 'Tap to place a scanner tower: it tags what passes', opts: { towers: 1, towerSpeed: 3 },
            packets: [['good', 2.2, 1.0], ['good', 3.8, 1.9], ['good', 3.6, 0.7], ['good', 2.4, 2.1]],
            taps: [[0.2, 'tower', 3, 1.4]], expect: r => r.stats.tagged >= 3 },
        freeze: { text: 'Freeze the field: draw your loop while nothing moves', opts: { freeze: 1, freezeSeconds: 2 },
            packets: [['good', 2.6, 1.2, 1.8, 0], ['good', 3, 1.6, 1.8, 0.3], ['good', 2.8, 1.9, 1.8, -0.2]],
            powers: [[0.3, 'freeze']], wire: [0.5, 1.6, ring(2.95, 1.55, 0.75, 0.75)], expect: r => r.stats.freezes === 1 && r.stats.catches >= 1 },
        purge: { text: 'Purge: every corrupt packet wiped off the field', opts: { purge: 1 },
            packets: [['corrupt', 1.2, 0.8], ['corrupt', 3, 1.5], ['corrupt', 4.6, 2.1], ['good', 2.2, 2.0], ['good', 4, 0.8]],
            powers: [[0.9, 'purge']], expect: r => r.stats.purged >= 3 },
        secondWind: { text: 'A big loop gives Focus back', opts: { focusBack: 6 },
            packets: [['good', 2.5, 1.0], ['good', 3.4, 1.9], ['good', 3, 1.4]], setup: r => { r.focus = 50; },
            wire: [0.3, 1.7, ring(3, 1.4, 1.3, 1.15)], expect: r => r.focus > 50 },
        antivirus: { text: 'It hunts the open wire and snaps it', opts: { antivirus: [0], avPatrol: 2 },
            packets: [['good', 3, 1.4], ['good', 3.4, 1.6]], wire: [0.6, 3.0, ring(3.2, 1.5, 1.1, 0.9, 40)], expect: r => r.stats.snaps >= 1 },
        sweep: { text: 'Its edge flashes, then it sweeps: wires snap', opts: { sweepFirst: 0.4, sweepEvery: 99, sweepWarn: 0.7, sweepTime: 1.6 },
            packets: [['good', 3, 1.4]], wire: [0.2, 3.0, ring(3, 1.4, 1.4, 0.9, 40)], expect: r => r.stats.snaps >= 1 },
        boss: { text: 'Loop it tight while it reels to hit it', opts: { boss: 2, bossAt: 0, bossStun: 1.2 },
            packets: [['good', 0.6, 0.5], ['good', 5.4, 2.4]], wire: [0.5, 1.5, ring(3, 1.4, 1.05, 1.05)], hold: { boss: [3, 1.4] },
            expect: r => r.stats.bossHits >= 1 },
        parry: { text: 'Flick across its charge: it turns back on the boss', opts: { boss: 2, bossAt: 0, parry: 1 },
            packets: [['good', 0.6, 0.4], ['good', 5.4, 2.4]], wire: [0.7, 0.85, line(3.2, 0.3, 3.2, 2.5, 6)],
            tick: (r, sim) => { if (r.boss && sim.t < 0.7) Object.assign(r.boss, { x: 1.2, y: 1.4, vx: 0, vy: 0, chargeAt: 0, charge: null }); },
            expect: r => r.stats.parries >= 1 },
        spoof: { text: 'Flick through corrupt packets: they count as good, ×2', opts: { spoof: 1 },
            packets: [['corrupt', 2.2, 1.3], ['corrupt', 3, 1.45], ['corrupt', 3.8, 1.6], ['good', 1, 0.5]], wire: [0.6, 0.75, line(1.6, 1.2, 4.4, 1.7, 6)],
            expect: r => r.stats.spoofed >= 2 },
        gc: { text: 'Loop only corrupt packets: deleted, and Focus back', opts: { gc: 1 }, setup: r => { r.focus = 50; },
            packets: [['corrupt', 2.8, 1.2], ['corrupt', 3.2, 1.6], ['corrupt', 2.9, 1.8], ['good', 5, 0.5]],
            wire: [0.3, 1.5, ring(3, 1.5, 0.8, 0.75)], expect: r => r.stats.collected >= 2 && r.focus > 50 },
        race: { text: 'Close it and hold still: it stays open and grows', opts: { race: 1, raceRate: 0.6 },
            packets: [['good', 2.9, 1.4], ['good', 3.1, 1.6], ['good', 1, 1.5, 1.3, 0], ['good', 0.6, 1.3, 1.3, 0]],
            wire: [0.2, 0.9, ring(3, 1.45, 0.9, 0.85), 2.9], expect: r => r.stats.raced >= 1 && r.stats.caught >= 3 },
        hijack: { text: 'Loop a stunned Antivirus: it works for you', opts: { hijack: 1, antivirus: [0] },
            packets: [['good', 0.8, 0.6], ['good', 5.2, 2.2], ['gold', 4.8, 0.6], ['good', 1.2, 2.3]], wire: [0.4, 1.5, ring(3, 1.4, 0.75, 0.7)],
            tick: (r, sim) => { const f = r.antivirus[0]; if (f && sim.t < 1.5 && !f.ally) Object.assign(f, { x: 3, y: 1.4, vx: 0, vy: 0, stunned: r.time + 1 }); },
            expect: r => r.stats.hijacked >= 1 },
        collude: { text: 'A quarantined core may turn partner and collect for you', opts: { rogue: 1, rogueFirst: 0.1, rogueEvery: 99, rogueGrow: 0.25, collude: 1 },
            packets: [['good', 0.7, 0.6], ['good', 5.3, 2.2], ['good', 2.2, 1.0], ['good', 3.8, 1.9], ['good', 3.7, 0.8]],
            wire: [0.8, 1.9, ring(3, 1.4, 0.55, 0.55)], hold: { core: [3, 1.4] },
            expect: r => r.stats.partners >= 1 && r.stats.partnered >= 1 },
        rogue: { text: 'Loop a core tight to quarantine it', opts: { rogue: 1, rogueFirst: 0.1, rogueEvery: 99, rogueGrow: 0.25 },
            packets: [['good', 0.7, 0.6], ['good', 5.3, 2.2]], wire: [0.8, 1.9, ring(3, 1.4, 0.55, 0.55)], hold: { core: [3, 1.4] },
            expect: r => r.stats.quarantined >= 1 }
    };

    const spread = r => {
        const g = r.packets.filter(p => p.kind !== 'corrupt');
        const cx = g.reduce((a, p) => a + p.x, 0) / g.length, cy = g.reduce((a, p) => a + p.y, 0) / g.length;
        return g.reduce((a, p) => a + Math.hypot(p.x - cx, p.y - cy), 0) / g.length;
    };

    // A fresh demo of `kind` (P: packet-snare.js).
    function start(P, kind) {
        const S = DEMOS[kind];
        const run = P.createSnare({ seed: 11, w: FIELD.w, h: FIELD.h, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0,
            respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, flow: false, schooling: 0, focus: 100, ...S.opts });
        run.packets = [];
        for (const [k, x, y, vx = 0, vy = 0] of S.packets) {
            run.packets.push({ id: run.nextId++, kind: k, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 });
        }
        S.setup?.(run);
        return { kind, run, t: 0, fed: 0, acts: 0, spread0: spread(run) };
    }

    // Step a demo: feed the scripted wire, taps, walls and powers, pin what it holds, and return the run's events.
    function step(sim, dt) {
        const S = DEMOS[sim.kind];
        const r = sim.run;
        sim.t += dt;
        if (S.wire) {
            // [from s, to s, points, lift at s (default: as soon as it's drawn)]
            const [t0, t1, pts, liftAt = 0] = S.wire;
            const upto = Math.min(pts.length, Math.floor((sim.t - t0) / (t1 - t0) * pts.length));
            while (sim.fed < upto) r.addPoint(...pts[sim.fed++]);
            if (sim.fed >= pts.length && r.drawing && sim.t >= liftAt) r.liftPen();
        }
        const acts = [...(S.taps || []).map(a => ['tap', ...a]), ...(S.walls || []).map(a => ['wall', ...a]), ...(S.powers || []).map(a => ['power', ...a])]
            .sort((a, b) => a[1] - b[1]);
        while (sim.acts < acts.length && sim.t >= acts[sim.acts][1]) {
            const [type, , a, b, c] = acts[sim.acts++];
            if (type === 'tap') r.placeAt(a, b, c);
            else if (type === 'wall') r.placeWall({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
            else r.usePower(a);
        }
        S.tick?.(r, sim);
        r.step(dt);
        if (S.hold?.boss && r.boss) Object.assign(r.boss, { x: S.hold.boss[0], y: S.hold.boss[1], vx: 0, vy: 0, stunned: r.time + 1, charge: null });
        if (S.hold?.core) for (const c of r.cores) Object.assign(c, { x: S.hold.core[0], y: S.hold.core[1] });
        return r.takeEvents();
    }

    // Did a demo show what it's for? (Played through once, in the tests.)
    const shows = (sim) => DEMOS[sim.kind].expect(sim.run, sim);

    return { DEMOS, FIELD, PERIOD, start, step, shows };
});
