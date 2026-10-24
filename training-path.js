// training-path.js — the Training Path: a ball pushed along an endless trail of hills.
// Each hill is a skill; cresting it learns the skill. Hills grow taller and wider as you go,
// so later skills need momentum built up over several well-timed pushes.
// Pure and deterministic: no DOM, no clock, no randomness. The geometry is a fixed function of
// the hill index, so the same trail exists in every run.
// Loaded in the browser as window.TrainingPath and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.TrainingPath = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STEP = 1 / 120;       // fixed physics step (seconds)
    const GRAVITY = 9.8;
    const DAMPING = 0.35;       // velocity damping per second (air + rolling resistance)
    const REST_SPEED = 0.02;
    const REST_SECONDS = 0.4;
    const WALL = 40;            // steepness of the wall behind the starting valley
    const PUSH_COOLDOWN = 0.8;  // seconds between pushes, so timing beats mashing

    // ---- Geometry -----------------------------------------------------------

    // Hill i: a smooth cos² bump. Valley i is the flat stretch in front of hill i.
    const hillHeight = i => 0.12 * Math.pow(1.32, i);
    const hillHalfWidth = i => 0.6 * Math.pow(1.15, i);
    const valleyLength = i => 0.8 * Math.pow(1.1, i);

    const starts = [0];         // starts[i] = x where valley i begins
    function valleyStart(i) {
        while (starts.length <= i) {
            const k = starts.length - 1;
            starts.push(starts[k] + valleyLength(k) + 2 * hillHalfWidth(k));
        }
        return starts[i];
    }

    function hill(i) {
        const start = valleyStart(i) + valleyLength(i);
        const w = hillHalfWidth(i);
        return { index: i, start, peak: start + w, end: start + 2 * w, height: hillHeight(i), halfWidth: w };
    }

    // Index of the hill whose span contains x, or of the valley x is in (valley i precedes hill i).
    function locate(x) {
        if (x < 0) return { valley: 0, hill: null };
        let i = 0;
        while (valleyStart(i + 1) <= x) i++;
        const h = hill(i);
        return x >= h.start ? { valley: i, hill: h } : { valley: i, hill: null };
    }

    function height(x) {
        if (x < 0) return WALL * x * x;
        const { hill: h } = locate(x);
        if (!h) return 0;
        const c = Math.cos((Math.PI / 2) * (x - h.peak) / h.halfWidth);
        return h.height * c * c;
    }

    function slope(x) {
        if (x < 0) return 2 * WALL * x;
        const { hill: h } = locate(x);
        if (!h) return 0;
        const u = (x - h.peak) / h.halfWidth;
        return -h.height * (Math.PI / 2) * Math.sin(Math.PI * u) / h.halfWidth;
    }

    function valleyCenter(i) {
        return valleyStart(i) + valleyLength(i) / 2;
    }

    // Speed needed at the foot of hill i to crest it with no damping (a lower bound).
    function crestSpeed(i) {
        return Math.sqrt(2 * GRAVITY * hillHeight(i));
    }

    // ---- Simulation ---------------------------------------------------------

    // home: the valley the ball starts resting in (= number of skills learned).
    function createSim(home) {
        const ball = { x: valleyCenter(home), v: 0, still: REST_SECONDS, best: 0, cooldown: 0 };
        let current = home;     // the valley the ball is in now
        let carry = 0;

        // Add speed in the forward direction. Pushing while the ball rolls back brakes it instead.
        // Returns false (and does nothing) while the previous push is still cooling down.
        function push(dv) {
            if (ball.cooldown > 0) return false;
            ball.v += dv;
            ball.still = 0;
            ball.cooldown = PUSH_COOLDOWN;
            return true;
        }

        function stepOnce(events) {
            ball.cooldown = Math.max(0, ball.cooldown - STEP);
            const dy = slope(ball.x);
            ball.v += (-GRAVITY * dy / (1 + dy * dy)) * STEP;
            ball.v *= 1 - DAMPING * STEP;
            ball.x += ball.v * STEP;

            const h = hill(current);
            if (ball.x > h.peak) {
                // Over the top: the ball now belongs to the next valley.
                events.push({ type: 'crest', hill: current });
                current++;
                ball.best = 0;
            } else if (current > 0 && ball.x < hill(current - 1).peak) {
                // Pushed back over the previous hill (only possible with backward forces).
                current--;
                events.push({ type: 'retreat', hill: current });
                ball.best = 0;
            } else if (ball.x > h.start) {
                ball.best = Math.max(ball.best, height(ball.x) / h.height);
            }

            ball.still = Math.abs(ball.v) < REST_SPEED && Math.abs(slope(ball.x)) < 0.05 ? ball.still + STEP : 0;
        }

        function step(seconds) {
            const events = [];
            carry = Math.min(carry + seconds, 0.25);
            while (carry >= STEP) {
                stepOnce(events);
                carry -= STEP;
            }
            return events;
        }

        return {
            ball,
            push,
            step,
            get valley() { return current; },
            get atRest() { return ball.still >= REST_SECONDS; },
            // True while the ball is on the valley floor heading forward: the right moment to push.
            get swingingForward() { return ball.v > 0 && !locate(ball.x).hill; }
        };
    }

    return {
        STEP, GRAVITY, PUSH_COOLDOWN,
        hill, height, slope, locate, valleyStart, valleyCenter, crestSpeed, hillHeight,
        createSim
    };
});
