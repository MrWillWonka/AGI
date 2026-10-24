// loss-landscape.js — the Loss Landscape puzzle module: a pure, deterministic physics sim.
// Balls (gradients) ride a 1-D loss curve like beads on a wire and settle in a minimum.
// No DOM, no clock, no Math.random: everything comes from the seed, so runs replay exactly.
// Loaded in the browser as window.LossLandscape and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.LossLandscape = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STEP = 1 / 120;          // fixed physics step (seconds)
    const SAMPLES = 512;           // resolution for min/max search and drawing
    const RELIEF = 0.6;            // world height of the curve relative to its width
    const GRAVITY = 10;
    const FRICTION = 3;          // velocity damping per second
    const NOISE = 0.02;            // SGD jitter: random velocity kick per sqrt(second)
    const MAX_SPEED = 4;
    const SETTLE_SPEED = 0.015;
    const SETTLE_SECONDS = 0.25;
    const MAX_SECONDS = 20;        // safety net: a ball always settles eventually
    const GLOBAL_TOLERANCE = 0.03; // a ball within this loss of the global minimum has converged

    // mulberry32: tiny, fast, good enough for gameplay.
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

    // A landscape is a sum of sine waves on a shallow bowl: several local minima, one global.
    // Loss is normalized to [0, 1], where 0 is the global minimum.
    function createLandscape(seed) {
        const r = rng(seed);
        const waves = Array.from({ length: 4 }, (_, i) => ({
            amp: (0.5 + r()) / (i + 1),
            freq: 1.5 + i * 1.7 + r() * 1.5,
            phase: r() * Math.PI * 2
        }));
        const center = 0.25 + r() * 0.5;
        const bowl = 2.5 + r() * 2;

        const raw = x => waves.reduce((sum, w) => sum + w.amp * Math.sin(2 * Math.PI * w.freq * x + w.phase), 0)
            + bowl * (x - center) * (x - center);
        const rawSlope = x => waves.reduce((sum, w) => sum + w.amp * 2 * Math.PI * w.freq * Math.cos(2 * Math.PI * w.freq * x + w.phase), 0)
            + 2 * bowl * (x - center);

        let min = Infinity;
        let max = -Infinity;
        let minX = 0;
        for (let i = 0; i <= SAMPLES * 4; i++) {
            const x = i / (SAMPLES * 4);
            const y = raw(x);
            if (y < min) { min = y; minX = x; }
            if (y > max) max = y;
        }
        const range = max - min;

        const loss = x => Math.max(0, (raw(clamp(x)) - min) / range);
        const slope = x => rawSlope(clamp(x)) / range;
        const profile = Float32Array.from({ length: SAMPLES + 1 }, (_, i) => loss(i / SAMPLES));
        return { seed, loss, slope, profile, globalMinX: minX };
    }

    function clamp(x) {
        return x < 0 ? 0 : x > 1 ? 1 : x;
    }

    // The sim owns the balls on one landscape. step() advances by fixed steps and returns settle events.
    function createSim(landscape, seed) {
        const random = rng(seed ?? landscape.seed + 1);
        let nextId = 1;
        let carry = 0;
        const balls = [];

        function drop(x, vx = 0) {
            const ball = { id: nextId++, x: clamp(x), vx: Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx)), age: 0, steps: 0, still: 0, trail: [] };
            balls.push(ball);
            return ball;
        }

        function stepOnce(events) {
            for (let i = balls.length - 1; i >= 0; i--) {
                const b = balls[i];
                // Bead on a wire: acceleration along x from gravity on the slope y = RELIEF * loss(x).
                const dy = RELIEF * landscape.slope(b.x);
                const ax = -GRAVITY * dy / (1 + dy * dy);
                b.vx += ax * STEP + NOISE * (random() - 0.5) * Math.sqrt(STEP);
                b.vx *= 1 - FRICTION * STEP;
                b.x += b.vx * STEP;
                if (b.x < 0 || b.x > 1) {
                    b.x = clamp(b.x);
                    b.vx = -b.vx * 0.4;
                }
                b.age += STEP;
                b.steps++;
                b.still = Math.abs(b.vx) < SETTLE_SPEED ? b.still + STEP : 0;
                if (b.steps % 6 === 0) {
                    b.trail.push(b.x);
                    if (b.trail.length > 24) b.trail.shift();
                }
                if (b.still >= SETTLE_SECONDS || b.age >= MAX_SECONDS) {
                    balls.splice(i, 1);
                    const loss = landscape.loss(b.x);
                    events.push({ id: b.id, x: b.x, loss, converged: loss <= GLOBAL_TOLERANCE });
                }
            }
        }

        // Advance by `seconds` of real time using fixed steps; leftover time carries to the next call.
        function step(seconds) {
            const events = [];
            carry = Math.min(carry + seconds, 0.25);
            while (carry >= STEP) {
                stepOnce(events);
                carry -= STEP;
            }
            return events;
        }

        return { landscape, balls, drop, step };
    }

    return { STEP, RELIEF, GLOBAL_TOLERANCE, rng, createLandscape, createSim };
});
