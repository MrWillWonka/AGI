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
    // The demo pass (K22, the owner's call, 2026-11-10: demos were too short to read): every demo opens on `LEAD` s of
    // its field as set up, nothing happening yet (the before), plays its script (at least `PERIOD` s, or its own
    // `period`), and holds `TAIL` s or more after its payoff lands (the after). A sim's script time `t` starts at
    // -LEAD; `clock` counts from 0 to the demo's `period`, measured once per demo from when its payoff lands.
    const PERIOD = 3.2, LEAD = 0.8, TAIL = 1.2;
    // A ring of points round (cx, cy), starting at its top and going a little past it, so the loop closes.
    const ring = (cx, cy, rx, ry, n = 28, turns = 1) => Array.from({ length: n * turns + 3 }, (_, i) => [cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * rx, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * ry]);

    // Points along a straight line (a flick).
    const line = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);
    // Each demo: options for the run, packets [kind, x, y, vx, vy], bubbles held and let go (`bubbles`: [down s, up s, x,
    // y]; Snare 15, the way to catch), a wire [from s, to s, points] (loops round the boss), flicks (`strokes`), taps or walls or
    // powers, Firewall sections dropped (`zones`: [at s, x, y]) at times, things pinned in place (`hold`), and `expect`, what
    // the run must show by its end.
    const DEMOS = {
        lasso: { text: 'Hold still and a bubble grows. Let go to catch what\'s inside.', opts: {},
            packets: [['good', 2.6, 1.2], ['good', 3.1, 1.5], ['good', 2.7, 1.8], ['good', 4.9, 0.7], ['corrupt', 5, 2.2]],
            bubbles: [[0.3, 2.1, 2.8, 1.5]], expect: r => r.stats.catches >= 1 },
        // Red packets (Snare 15: sector 1 has one to meet): one inside spoils the whole catch.
        spoil: { text: 'One unreadable packet garbles the whole catch.', opts: {},
            packets: [['good', 2.7, 1.3], ['good', 3.2, 1.5], ['corrupt', 2.9, 1.7], ['good', 5, 0.7]],
            bubbles: [[0.3, 2.1, 2.95, 1.5]], expect: r => r.stats.corrupted >= 1 },
        // Snare 18.4: the bolt leaves the catch and jumps packet to packet along the line, one at a time.
        chain: { text: 'Each catch sends out a bolt that jumps from packet to packet.', opts: { chain: 8, chainEvery: 0.09 },
            packets: [['good', 1.4, 1.3], ['good', 1.7, 1.6], ['good', 1.2, 1.7], ['good', 2.6, 1.3], ['good', 3.3, 1.7], ['good', 4, 1.2], ['good', 4.7, 1.6], ['good', 5.4, 1.2]],
            bubbles: [[0.3, 1.9, 1.45, 1.5]], expect: r => r.stats.chained >= 5 },
        scrubbers: { text: 'A bubble forgives one unreadable packet.', opts: { scrubbers: 1 },
            packets: [['good', 2.7, 1.2], ['good', 3.3, 1.3], ['corrupt', 3, 1.6], ['good', 2.8, 1.9], ['good', 3.3, 1.9]],
            bubbles: [[0.3, 2.2, 3, 1.55]], expect: r => r.stats.scrubbed >= 1 && r.stats.catches >= 1 },
        scanner: { text: 'Packets the beam passes are worth ×2 for a moment.', opts: { scanner: 1, scannerSpeed: 2.2 },
            packets: [['good', 1, 0.6], ['good', 4.6, 0.7], ['good', 1.5, 2.2], ['good', 4.2, 2.1], ['good', 3.6, 0.5], ['good', 2.2, 1.2]],
            expect: r => r.stats.tagged >= 3 },
        laser: { text: 'A laser takes the richest packet by itself.', opts: { laser: 0.9 },
            packets: [['good', 1.2, 0.7], ['gold', 4.4, 1.0], ['good', 2.6, 1.6], ['good', 3.6, 2.0], ['good', 5.1, 0.6]],
            expect: r => r.stats.lasered >= 2 },
        contain: { text: 'The edges turn good packets back, while unreadable ones leave.', opts: { contain: 1, flow: true },
            packets: [['good', 4.6, 0.8, 1.5, 0.2], ['good', 4.9, 1.6, 1.4, -0.1], ['corrupt', 4.7, 2.2, 1.4, 0.1], ['good', 4.2, 1.3, 1.6, 0]],
            expect: r => r.packets.filter(p => p.kind !== 'corrupt').length === 3 && !r.packets.some(p => p.kind === 'corrupt') },
        herders: { text: 'Drones herd strays together and shoo the unreadable ones away.', opts: { herders: 2, herdSpeed: 3.5, herdPull: 4 },
            packets: [['good', 0.6, 0.5, -0.6, 0], ['good', 5.4, 2.3, 0.6, 0], ['good', 0.7, 2.3, -0.5, 0.2], ['good', 5.3, 0.5, 0.5, -0.2], ['corrupt', 3, 1.5, 0.4, 0]],
            expect: (r, sim) => spread(r) < sim.spread0 * 0.8 },
        firewall: { text: 'Unreadable packets can\'t get into a Firewall, so you can bubble safely inside it.', opts: { firewalls: 1, zoneSize: 2 },
            packets: [['good', 1.6, 1.3, 1.2, 0], ['corrupt', 1.4, 1.6, 1.2, 0], ['good', 1.2, 1.1, 1.2, 0]],
            zones: [[0.15, 3.6, 1.4]], expect: r => r.stats.bounces >= 1 && r.packets.some(p => p.kind === 'good' && p.x > 2.8) },
        decoy: { text: 'Unreadable packets and Antivirus go to Decoys.', opts: { decoys: 1, corruptLure: 5 },
            packets: [['corrupt', 1.5, 1.4, 0, 0.8], ['corrupt', 1.2, 0.6, 0, -0.8], ['good', 3, 2.3]],
            taps: [[0.2, 'decoy', 5, 1.4]], expect: (r, sim) => r.packets.filter(p => p.kind === 'corrupt').every(p => p.x > 2.6) },
        turret: { text: 'Turrets shoot Antivirus and unreadable packets in reach.', opts: { turrets: 1, turretEvery: 0.45, antivirus: [0.3], avPatrol: 0.8 },
            packets: [['corrupt', 2.5, 1.0], ['corrupt', 3.5, 1.9], ['good', 3.1, 0.8], ['good', 5.4, 2.4]],
            taps: [[0.2, 'turret', 3, 1.4]], tick: (r, sim) => { const f = r.antivirus[0]; if (f && sim.t < 0.6) Object.assign(f, { x: 4.4, y: 1.4, vx: -0.6, vy: 0 }); },
            expect: r => r.stats.purged >= 2 && r.stats.turreted >= 3 },
        tower: { text: 'Scanner Towers tag the packets that pass them.', opts: { towers: 1, towerSpeed: 3 },
            packets: [['good', 2.2, 1.0], ['good', 3.8, 1.9], ['good', 3.6, 0.7], ['good', 2.4, 2.1]],
            taps: [[0.2, 'tower', 3, 1.4]], expect: r => r.stats.tagged >= 3 },
        freeze: { text: 'Freeze the field, and grow your bubble while nothing moves.', opts: { freeze: 1, freezeSeconds: 2 },
            packets: [['good', 2.6, 1.2, 1.8, 0], ['good', 3, 1.6, 1.8, 0.3], ['good', 2.8, 1.9, 1.8, -0.2]],
            powers: [[0.3, 'freeze']], bubbles: [[0.4, 2.2, 2.8, 1.55]], expect: r => r.stats.freezes === 1 && r.stats.catches >= 1 },
        purge: { text: 'Purge wipes every unreadable packet off the field.', opts: { purge: 1 },
            packets: [['corrupt', 1.2, 0.8], ['corrupt', 3, 1.5], ['corrupt', 4.6, 2.1], ['good', 2.2, 2.0], ['good', 4, 0.8]],
            powers: [[0.9, 'purge']], expect: r => r.stats.purged >= 3 },
        antivirus: { text: 'It hunts your bubble and pops it.', opts: { antivirus: [0], avPatrol: 2, threatWait: 0 },
            packets: [['good', 3, 1.4], ['good', 3.4, 1.6]], bubbles: [[0.4, 3.1, 3.2, 1.5]], expect: r => r.stats.snaps >= 1 },
        sweep: { text: 'Its edge flashes, then it sweeps the field and pops bubbles.', opts: { sweepFirst: 0.4, sweepEvery: 99, sweepWarn: 0.7, sweepTime: 1.6, threatWait: 0 },
            packets: [['good', 3, 1.4]], bubbles: [[0.2, 3.1, 3, 1.4]], expect: r => r.stats.snaps >= 1 },
        // The boss fight: loop round it to stun it (the wire mustn't touch it), then flick through it while it reels.
        // The boss (K14, round 10: the demo showed the pre-17.5 boss): it comes in, swallows the field and its fight clock
        // starts; two loops round it stun it, then slashes take its health. `fight`: game.js draws the fight's overlay
        // (the warning, the health bar and its clock) over this demo.
        boss: { text: 'It swallows the field. Loop it twice, then slash it before the clock runs out.', fight: true,
            opts: { boss: 4, bossArrive: 1, bossIncoming: 0.55, bossFight: 30, bossSwallow: 1, bossFocus: 0, bossCharge: 99 },
            packets: [['good', 3.6, 0.7], ['good', 4.3, 1.9], ['good', 4.9, 1.0], ['gold', 4.4, 0.6], ['good', 0.6, 2.2], ['good', 3.4, 2.2]],
            wire: [0.85, 1.75, ring(2, 1.4, 0.85, 0.85, 32, 2)],
            strokes: [[2.0, 2.07, line(1.2, 0.3, 2.8, 2.5, 6)], [2.45, 2.52, line(2.8, 0.3, 1.2, 2.5, 6)]],
            tick: (r, sim) => { if (r.boss) { Object.assign(r.boss, { x: 2, y: 1.4, vx: 0, vy: 0 }); if (!(r.boss.stunned > r.time)) { r.boss.chargeAt = r.time + 99; r.boss.charge = null; } } },
            expect: r => (r.stats.swallowed || 0) > 0 && r.stats.loopStuns >= 1 && r.stats.bossDamage >= 2 && !!r.fight },
        // Riposte: the parry, a flick across its charge line, a stun from range.
        parry: { text: 'Flick across its charge line to parry it, then slash it.', opts: { boss: 4, bossAt: 0, parry: 1 },
            packets: [['good', 5.4, 1.4]],
            strokes: [[0.75, 0.82, line(2.6, 0.3, 2.6, 2.5, 6)], [1.25, 1.32, line(1.2, 0.3, 1.2, 2.5, 6)], [1.7, 1.77, line(0.4, 0.6, 2.0, 2.2, 6)]],
            tick: (r, sim) => { if (r.boss) { if (!sim.armed) { sim.armed = true; r.boss.chargeAt = r.time + 0.3; } Object.assign(r.boss, { x: 1.2, y: 1.4, vx: 0, vy: 0 }); } },
            expect: r => r.stats.parries >= 1 && r.stats.bossDamage >= 2 },
        // Its mines (Snare 18.1, K7, the owner's call: loop round a mine to disable it, pull it back and let go to fling it):
        // a mine out in the arena, looped, then pulled back like a slingshot; it flies, banks off the bottom edge into the
        // boss. 4.6 s: the armed mine first, the boss reeling after.
        mines: { text: 'Loop a mine, pull it back and let go, and it banks off the edge into the boss.', opts: { boss: 9, bossAt: 0, bossMines: 2, netTime: 9, netRange: 1, mineHold: 9 },
            packets: [['good', 4.6, 0.6], ['good', 5.2, 2.2], ['good', 4.9, 1.6]],
            setup: r => { r.step(1 / 60); Object.assign(r.boss, { x: 1.0, y: 1.0, vx: 0, vy: 0, chargeAt: 99, mineAt: 99 }); r.mines = [{ id: 900, x: 3.2, y: 1.0 }, { id: 901, x: 5.3, y: 0.5 }]; r.links = [{ a: 900, b: 901, t: 0 }]; },
            tick: r => { if (r.boss) Object.assign(r.boss, { x: 1.0, y: 1.0, vx: 0, vy: 0, chargeAt: 99 }); },
            // the loop round it (0.2–1.0 s), then the pull back away from where it should go (1.4–2.1 s), let go
            strokes: [[0.2, 1.0, ring(3.2, 1.0, 0.45, 0.45).slice(0, 26)], [1.4, 2.1, line(3.2, 1.0, 3.2 + 0.36, 1.0 - 0.59, 10)]],
            expect: r => r.stats.minesGrabbed >= 1 && r.stats.mineThrows >= 1 && r.stats.mineHits >= 1 && r.stats.mineBounces >= 1 },
        // Split (Fork Bomb): a full bubble let go forks into smaller ones round it, which catch a moment later.
        fork: { text: 'Let go of a full bubble, and it splits so the halves catch too.', opts: { fork: 1, bubbleTime: 1 },
            packets: [['good', 3, 1.4], ['good', 3.2, 1.6], ...Array.from({ length: 12 }, (_, i) => ['good', 3 + Math.cos(i * Math.PI / 6) * 1.65, 1.4 + Math.sin(i * Math.PI / 6) * 1.2])],
            bubbles: [[0.2, 1.5, 3, 1.4]], expect: r => r.stats.forks >= 1 },
        // Supernova (Starburst): a bubble let go while the field is frozen bursts wider, ×2, red deleted.
        star: { text: 'Let go while frozen for a supernova that pays ×2 and deletes unreadable packets.', opts: { freeze: 1, freezeSeconds: 3, star: 1 },
            packets: [['good', 3, 1.4], ['good', 2.6, 1.7], ['corrupt', 3.3, 1.2], ['good', 3.4, 1.8], ['good', 2.7, 1.1]],
            powers: [[0.2, 'freeze']], bubbles: [[0.3, 2.1, 3, 1.45]], expect: r => r.stats.stars >= 1 && r.stats.caught >= 3 },
        // Privilege Escalation: flick from your hijacked Antivirus into the boss.
        escalate: { text: 'Flick from your hijacked Antivirus into the boss to ram it.', opts: { boss: 9, bossAt: 0, hijack: 1, escalate: 1, antivirus: [0] },
            packets: [['good', 5.5, 2.5]],
            tick: (r, sim) => {
                const f = r.antivirus[0];
                if (f && !f.ally) Object.assign(f, { ally: r.time + 8, x: 1.2, y: 1.4, vx: 0, vy: 0 });
                else if (f && sim.t < 0.9) Object.assign(f, { x: 1.2, y: 1.4, vx: 0, vy: 0 });
                if (r.boss) Object.assign(r.boss, { x: 4.2, y: 1.4, vx: 0, vy: 0, chargeAt: 99, charge: null });
            },
            strokes: [[0.9, 0.97, line(1.2, 1.4, 4.6, 1.4, 6)]], expect: r => r.stats.escalations >= 1 },
        // Floodgate: three clean catches in a row, and a surge of packets swims in.
        surge: { text: 'Three clean catches in a row bring a surge of packets.', opts: { surge: 1, flow: true, flowSpread: 0.2, schoolSize: 4 },
            packets: [['good', 1.2, 1.2], ['good', 1.4, 1.5], ['good', 3, 1.2], ['good', 3.2, 1.5], ['good', 4.8, 1.2], ['good', 5, 1.5]],
            bubbles: [[0.2, 0.95, 1.3, 1.35], [1.15, 1.9, 3.1, 1.35], [2.1, 2.85, 4.9, 1.35]],
            expect: r => r.stats.surges >= 1 },
        // Defuse at its last level: grab one mine and the nearest other comes too.
        defuse: { text: 'Loop a mine, and its neighbour is disabled too. Nets link slower.', opts: { boss: 4, bossAt: 0, bossMines: 2, defuseChain: 1, netTime: 5 },
            packets: [['good', 5.5, 2.5]],
            setup: r => { r.step(1 / 60); Object.assign(r.boss, { x: 0.8, y: 1.4, vx: 0, vy: 0, chargeAt: 99, mineAt: 99 }); r.mines = [{ id: 900, x: 2.6, y: 1.4 }, { id: 901, x: 4.6, y: 1.4 }]; r.links = [{ a: 900, b: 901, t: 0 }]; },
            tick: r => { if (r.boss) Object.assign(r.boss, { x: 0.8, y: 1.4, vx: 0, vy: 0, chargeAt: 99 }); },
            strokes: [[0.3, 1.1, ring(4.6, 1.4, 0.45, 0.45).slice(0, 26)]], expect: r => r.stats.minesGrabbed >= 2 },
        // Snare 10.3: Firehose's pulse, Clean Sweep, Quarantine Relay, Backpressure.
        pulse: { text: 'A clean catch brings a pulse of new packets swimming in.', opts: { pulse: 2, flow: true, flowSpread: 0.2, schoolSize: 4 },
            packets: [['good', 2.8, 1.3], ['good', 3.2, 1.6], ['good', 2.9, 1.7]],
            bubbles: [[0.3, 1.9, 3, 1.5]], expect: r => r.stats.pulses >= 1 && r.packets.length >= 4 },
        // Backpressure (reworked after the 18.7 log): the good packets just outside the catch's edge are caught too, red there left.
        backpressure: { text: 'A catch also takes the good packets just outside its edge.', opts: { backpressure: 1, backReach: 0.12 },   // the demo's small field: a ring wide enough to see
            packets: [['good', 2.8, 1.4], ['good', 3.1, 1.6], ['good', 3.8, 1.5], ['good', 2.1, 1.65], ['corrupt', 2.95, 2.35], ['good', 4.9, 0.7]],
            bubbles: [[0.3, 1.3, 2.95, 1.5]], expect: r => r.stats.edgeCaught >= 2 && r.packets.some(p => p.kind === 'corrupt') },
        // The branch capstones (Snare 10).
        echo: { text: 'Each bubble catches again a second later.', opts: { echo: 1, echoDelay: 0.9 },
            packets: [['good', 2.8, 1.3], ['good', 3.2, 1.6], ['good', 0.4, 1.5, 0.9, 0], ['good', 0.2, 1.3, 0.95, 0]],
            bubbles: [[0.2, 1.5, 3, 1.45]], expect: r => r.stats.echoes >= 1 },
        storm: { text: 'Every so often, a school of gold swims in.', opts: { storm: 1, stormFirst: 0.4, stormSize: 8, flow: true, flowSpread: 0.2 },
            packets: [['good', 3, 1.4]], expect: r => r.stats.storms >= 1 && r.packets.filter(p => p.kind === 'gold').length >= 6 },
        crash: { text: 'Every third slash crashes it for triple damage.', opts: { boss: 20, bossAt: 0, crash: 1 },
            packets: [['good', 5.5, 2.5]], hold: { boss: [3, 1.4] },
            strokes: [[0.4, 0.47, line(2.2, 0.4, 3.8, 2.4, 6)], [0.9, 0.97, line(3.8, 0.4, 2.2, 2.4, 6)], [1.4, 1.47, line(2.2, 1.4, 3.8, 1.4, 6)]],
            expect: r => r.stats.crashes >= 1 },
        // Snare 11: the bots and the Firewall sections' later tricks.
        cleaner: { text: 'A Decoder Bot rides an unreadable packet until it\'s readable.', opts: { cleanBots: 1, botSpeed: 6, cleanTime: 0.5, cleanRest: 0.1 },
            packets: [['corrupt', 4.6, 0.8], ['corrupt', 1.4, 2.1], ['good', 3, 1.4], ['good', 2.2, 0.9]],
            expect: r => r.stats.cleaned >= 2 },
        spoofer: { text: 'A Spoofer Bot turns unreadable packets good and worth ×2.', opts: { spoofBots: 1, botSpeed: 4, botEvery: 1.2 },
            packets: [['corrupt', 4.6, 0.8], ['corrupt', 1.4, 2.1], ['good', 3, 1.4]],
            expect: r => r.stats.botSpoofed >= 2 },
        // Snare 14: a drone that nets small clusters of good packets for you.
        collector: { text: 'A drone nets small clusters of good packets for you.', opts: { collectBots: 1, botSpeed: 4, collectEvery: 1 },
            packets: [['good', 4.2, 0.9], ['good', 4.5, 1.1], ['good', 4.4, 0.7], ['good', 1.5, 2.2], ['good', 1.3, 2.0]],
            expect: r => r.stats.botCollected >= 4 },
        goldPlate: { text: 'Decoder Bots turn regular packets gold.', opts: { cleanBots: 1, goldPlate: 2, goldEvery: 1.6, botSpeed: 3 },
            packets: [['good', 3, 1.2], ['good', 3.4, 1.6], ['good', 2.6, 1.7]],
            expect: r => r.stats.gilded >= 2 },
        pen: { text: 'Good packets that come into a Firewall can\'t get out.', opts: { firewalls: 1, pen: 1, zoneSize: 2 },
            packets: [['good', 1.2, 1.3, 1.3, 0], ['good', 1.0, 1.6, 1.3, 0], ['good', 0.6, 1.4, 1.3, 0]],
            zones: [[0.1, 3.4, 1.4]], expect: r => r.packets.filter(p => p.x > 2.3 && p.x < 4.5).length >= 3 },
        autoZone: { text: 'Free Firewalls place themselves where packets gather.', opts: { firewalls: 1, autoZone: 1, autoZoneEvery: 0.6, zoneSize: 2 },
            packets: [['good', 4.3, 1.6], ['good', 4.5, 1.8], ['good', 4.4, 1.5], ['good', 4.6, 1.7], ['good', 1.2, 0.8]],
            expect: r => r.stats.autoZones >= 1 && r.walls.some(z => Math.abs(z.x - 4.45) < 1) },
        spoof: { text: 'Flick through unreadable packets, and they count as good and worth ×2.', opts: { spoof: 1 },
            packets: [['corrupt', 2.2, 1.3], ['corrupt', 3, 1.45], ['corrupt', 3.8, 1.6], ['good', 1, 0.5]], wire: [0.6, 0.75, line(1.6, 1.2, 4.4, 1.7, 6)],
            expect: r => r.stats.spoofed >= 2 },
        race: { text: 'Hold a full bubble still, and its multiplier keeps growing.', opts: { race: 1, raceRate: 0.6, bubbleTime: 0.8 },
            packets: [['good', 2.9, 1.4], ['good', 3.1, 1.6], ['good', 1, 1.5, 0.6, 0], ['good', 0.6, 1.3, 0.6, 0]],
            bubbles: [[0.2, 2.9, 3, 1.45]], expect: r => r.stats.raced >= 1 && r.stats.caught >= 3 },
        // Snare 18.4: two loops round a stunned Antivirus turn it, and it vacuums up the packets near it.
        hijack: { text: 'Loop round a stunned Antivirus twice, and it vacuums up packets for you.', opts: { hijack: 1, antivirus: [0], hijackPull: 0.45 },
            packets: [['good', 1.9, 0.7], ['good', 4.2, 2.1], ['gold', 4.1, 0.7], ['good', 1.9, 2.1], ['good', 0.6, 1.4], ['good', 5.4, 1.4]],
            strokes: [[0.2, 0.9, ring(3, 1.4, 0.6, 0.6).slice(0, 26)], [1.1, 1.8, ring(3, 1.4, 0.6, 0.6).slice(0, 26)]],
            tick: (r, sim) => { const f = r.antivirus[0]; if (f && !f.ally) Object.assign(f, { x: 3, y: 1.4, vx: 0, vy: 0, stunned: Math.max(f.stunned || 0, r.time + 1) }); },
            expect: r => r.stats.hijacked >= 1 && r.stats.caught >= 2 },
        collude: { text: 'A quarantined core may turn partner and collect for you.', opts: { rogue: 1, rogueFirst: 0.1, rogueEvery: 99, rogueGrow: 0.25, collude: 1 },
            packets: [['good', 0.7, 0.6], ['good', 5.3, 2.2], ['good', 2.2, 1.0], ['good', 3.8, 1.9], ['good', 3.7, 0.8]],
            bubbles: [[0.8, 1.9, 3, 1.4]], hold: { core: [3, 1.4] },
            expect: r => r.stats.partners >= 1 && r.stats.partnered >= 1 },
        rogue: { text: 'Let a bubble go over a core to quarantine it.', opts: { rogue: 1, rogueFirst: 0.1, rogueEvery: 99, rogueGrow: 0.25 },
            packets: [['good', 0.7, 0.6], ['good', 5.3, 2.2]], bubbles: [[0.8, 1.9, 3, 1.4]], hold: { core: [3, 1.4] },
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
            respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, flow: false, schooling: 0, focus: 100, bubble: 1, ...S.opts });
        run.packets = [];
        for (const [k, x, y, vx = 0, vy = 0] of S.packets) {
            run.packets.push({ id: run.nextId++, kind: k, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 });
        }
        S.setup?.(run);
        const sim = { kind, run, t: -LEAD, clock: 0, fed: 0, acts: 0, spread0: spread(run), period: 0 };
        sim.period = periods[kind] ??= measure(P, kind);
        return sim;
    }
    // A demo's length: the before, then its script, at least `PERIOD` s (or its own `period`) and `TAIL` s past the
    // moment its payoff lands (played once, headless, and remembered).
    const periods = {};
    function measure(P, kind) {
        const S = DEMOS[kind];
        periods[kind] = Infinity;   // `start` inside measures nothing
        const sim = start(P, kind);
        let at = null;
        for (let i = 0; i < 12 * 60 && at == null; i++) { step(sim, 1 / 60); if (sim.t >= 0 && S.expect(sim.run, sim)) at = sim.t; }
        return LEAD + Math.max(S.period || PERIOD, (at ?? PERIOD) + TAIL);
    }

    // Step a demo: feed the scripted wire, taps, walls and powers, pin what it holds, and return the run's events.
    function step(sim, dt) {
        const S = DEMOS[sim.kind];
        const r = sim.run;
        sim.t += dt;
        sim.clock += dt;
        // the before: the field as set up, still
        if (sim.t < 0) return [];
        // Bubbles: the pen goes down at (x, y), holds still, and lets go.
        for (const [i, [t0, t1, x, y]] of (S.bubbles || []).entries()) {
            sim.held = sim.held || [];
            if (sim.held[i] === 2 || sim.t < t0) continue;
            if (!sim.held[i]) { r.setPen('bubble'); sim.held[i] = 1; }
            if (sim.t >= t1) { r.liftPen(); r.setPen(null); sim.held[i] = 2; } else r.addPoint(x, y);
        }
        if (S.wire) {
            // [from s, to s, points, lift at s (default: as soon as it's drawn)]
            const [t0, t1, pts, liftAt = 0] = S.wire;
            if (!sim.fed && sim.t >= t0) r.setPen('wire');
            const upto = Math.min(pts.length, Math.floor((sim.t - t0) / (t1 - t0) * pts.length));
            while (sim.fed < upto) r.addPoint(...pts[sim.fed++]);
            // Lifted once (a later stroke draws on its own).
            if (sim.fed >= pts.length && r.drawing && sim.t >= liftAt && !sim.lifted) { r.liftPen(); sim.lifted = true; }
            if (sim.fed >= pts.length && !r.drawing) sim.lifted = true;
        }
        // Several strokes, one after another (flicks): each [from s, to s, points], lifted when drawn.
        for (const [i, [t0, t1, pts]] of (S.strokes || []).entries()) {
            sim.fedAt = sim.fedAt || [];
            const done = sim.fedAt[i] || 0;
            if (done >= pts.length + 1 || sim.t < t0) continue;
            const upto = Math.min(pts.length, Math.ceil((sim.t - t0) / (t1 - t0) * pts.length));
            if (!done) r.setPen('wire');
            for (let k = done; k < upto; k++) r.addPoint(...pts[k]);
            sim.fedAt[i] = upto;
            if (upto >= pts.length) { r.liftPen(); sim.fedAt[i] = pts.length + 1; }
        }
        const acts = [...(S.taps || []).map(a => ['tap', ...a]), ...(S.zones || []).map(a => ['zone', ...a]), ...(S.powers || []).map(a => ['power', ...a])]
            .sort((a, b) => a[1] - b[1]);
        while (sim.acts < acts.length && sim.t >= acts[sim.acts][1]) {
            const [type, , a, b, c] = acts[sim.acts++];
            if (type === 'tap') r.placeAt(a, b, c);
            else if (type === 'zone') r.placeZone(a, b);
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

    return { DEMOS, FIELD, PERIOD, LEAD, TAIL, start, step, shows };
});
