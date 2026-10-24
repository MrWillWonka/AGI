// training-path.js — the Training Path: rolls of a ball over random rolling hills toward skill hills.
// The trail is split into stretches. Stretch k runs from checkpoint k to skill hill k, a big hill
// that teaches skill k. Each roll starts at the checkpoint over freshly generated rolling hills;
// the roll ends when the ball comes to rest or crests the skill hill.
// Pure and deterministic: no DOM, no clock, no Math.random. Terrain comes from (stretch, seed).
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
    const DAMPING = 0.15;       // linear rolling resistance per second
    const DRAG = 0.12;          // quadratic drag: fast balls lose energy disproportionately
    const TRAPPED_DAMPING = 4;  // extra damping once the ball cannot climb out of its dip
    const REST_SPEED = 0.03;
    const REST_SECONDS = 0.5;
    const WALL = 40;            // steepness of the wall behind the very first checkpoint
    const LEAD_IN = 0.5;        // flat run-up after each checkpoint

    // ---- Skill hills (fixed) -----------------------------------------------

    const skillHeight = k => 0.3 * Math.pow(1.3, k);
    const skillHalfWidth = k => 0.55 * Math.pow(1.14, k);
    const stretchLength = k => 4 * Math.pow(1.16, k);   // checkpoint to the foot of skill hill k

    const checkpoints = [0];    // checkpoints[k] = x where stretch k starts
    function checkpoint(k) {
        while (checkpoints.length <= k) {
            const j = checkpoints.length - 1;
            checkpoints.push(checkpoints[j] + stretchLength(j) + 2 * skillHalfWidth(j) + 0.3);
        }
        return checkpoints[k];
    }

    function skillHill(k) {
        const start = checkpoint(k) + stretchLength(k);
        const w = skillHalfWidth(k);
        return { start, peak: start + w, end: start + 2 * w, height: skillHeight(k), halfWidth: w, skill: k };
    }

    // ---- Rolling hills (random per roll) -----------------------------------

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

    // Rolling hills for stretch k: mostly small, sometimes medium, growing toward the skill hill.
    function rollingHills(k, seed) {
        const r = rng(seed);
        const from = checkpoint(k) + LEAD_IN;
        const to = skillHill(k).start - 0.25;
        const big = skillHeight(k);
        const hills = [];
        let x = from;
        while (true) {
            const w = skillHalfWidth(k) * (0.25 + r() * 0.55);
            const gap = 0.1 + r() * 0.5;
            if (x + 2 * w > to) break;
            const along = (x - from) / (to - from);              // 0 near the checkpoint, 1 near the wall
            const roll = r();
            const size = roll < 0.12 ? 0.35 + r() * 0.2 : 0.05 + r() * 0.2;   // occasional medium hill
            const h = big * size * (0.6 + 0.6 * along);
            hills.push({ start: x, peak: x + w, end: x + 2 * w, height: h, halfWidth: w, skill: null });
            x += 2 * w + gap;
        }
        return hills;
    }

    // ---- Terrain for one roll ----------------------------------------------

    // The ground for a roll on stretch k: the previous skill hill behind the checkpoint (or the
    // starting wall), the rolling hills, and skill hill k ahead.
    function terrain(k, seed) {
        const bumps = [];
        if (k > 0) bumps.push(skillHill(k - 1));
        bumps.push(...rollingHills(k, seed), skillHill(k));

        function find(x) {
            let lo = 0;
            let hi = bumps.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                const b = bumps[mid];
                if (x < b.start) hi = mid - 1;
                else if (x > b.end) lo = mid + 1;
                else return b;
            }
            return null;
        }

        function height(x) {
            if (k === 0 && x < 0) return WALL * x * x;
            const b = find(x);
            if (!b) return 0;
            const c = Math.cos((Math.PI / 2) * (x - b.peak) / b.halfWidth);
            return b.height * c * c;
        }

        function slope(x) {
            if (k === 0 && x < 0) return 2 * WALL * x;
            const b = find(x);
            if (!b) return 0;
            const u = (x - b.peak) / b.halfWidth;
            return -b.height * (Math.PI / 2) * Math.sin(Math.PI * u) / b.halfWidth;
        }

        // Peak heights of the nearest hills behind and ahead of x (the ball's way out of a dip).
        function walls(x) {
            let left = k === 0 ? Infinity : 0;
            let right = Infinity;
            for (const b of bumps) {
                if (b.peak <= x) left = b.height;
                else { right = b.height; break; }
            }
            return { left, right };
        }

        const start = checkpoint(k) + 0.2;
        const goal = skillHill(k);
        return {
            walls,
            stretch: k,
            seed,
            bumps,
            height,
            slope,
            start,
            goal,
            // How far along the stretch a position is: 0 at the start, 1 at the skill hill's peak.
            progress: x => Math.max(0, Math.min(1, (x - start) / (goal.peak - start)))
        };
    }

    // ---- One roll -------------------------------------------------------------

    // opts: { pushes: pushes allowed this roll, cooldown: seconds between pushes }
    function createRoll(k, seed, opts) {
        const { pushes, cooldown } = opts;
        const ground = terrain(k, seed);
        const ball = { x: ground.start, v: 0, still: 0, cooldown: 0, maxX: ground.start, trapped: false };
        let pushesLeft = pushes;
        let launched = false;
        let over = false;
        let carry = 0;

        // A push adds a fixed amount of energy (strength = the speed it gives a ball at rest).
        // Pushing against a backward roll spends energy cancelling it first, so timing matters.
        // Returns false if the roll is over, out of pushes, or cooling down.
        function push(strength) {
            if (over || pushesLeft <= 0 || ball.cooldown > 0) return false;
            const e = strength * strength;
            ball.v = ball.v >= 0
                ? Math.sqrt(ball.v * ball.v + e)
                : (ball.v * ball.v > e ? -Math.sqrt(ball.v * ball.v - e) : Math.sqrt(e - ball.v * ball.v));
            ball.still = 0;
            ball.cooldown = cooldown;
            pushesLeft--;
            launched = true;
            return true;
        }

        function stepOnce(events) {
            ball.cooldown = Math.max(0, ball.cooldown - STEP);
            const dy = ground.slope(ball.x);
            ball.v += (-GRAVITY * dy / (1 + dy * dy)) * STEP;
            ball.v -= (DAMPING * ball.v + DRAG * ball.v * Math.abs(ball.v)) * STEP;
            // Momentum while there is somewhere to go; once the ball lacks the energy to clear either
            // neighbouring hill, it is stuck in this dip, so let it settle quickly instead of sloshing.
            const { left, right } = ground.walls(ball.x);
            const energy = 0.5 * ball.v * ball.v + GRAVITY * ground.height(ball.x);
            ball.trapped = energy < GRAVITY * Math.min(left, right);
            if (ball.trapped) ball.v *= 1 - TRAPPED_DAMPING * STEP;
            ball.x += ball.v * STEP;
            ball.maxX = Math.max(ball.maxX, ball.x);

            if (ball.x > ground.goal.peak) {
                over = true;
                events.push({ type: 'crest', skill: k, progress: 1 });
                return;
            }
            const resting = Math.abs(ball.v) < REST_SPEED && Math.abs(dy) < 0.08;
            ball.still = resting ? ball.still + STEP : 0;
            // The roll ends once the ball settles with no pushes left. With pushes left, it waits for you.
            if (launched && pushesLeft === 0 && ball.still >= REST_SECONDS) {
                over = true;
                events.push({ type: 'end', skill: k, progress: ground.progress(ball.maxX) });
            }
        }

        function step(seconds) {
            const events = [];
            carry = Math.min(carry + seconds, 0.25);
            while (carry >= STEP && !over) {
                stepOnce(events);
                carry -= STEP;
            }
            if (over) carry = 0;
            return events;
        }

        return {
            ground,
            ball,
            push,
            step,
            get pushesLeft() { return pushesLeft; },
            get launched() { return launched; },
            get over() { return over; },
            get progress() { return ground.progress(ball.maxX); },
            get atRest() { return ball.still >= REST_SECONDS; },
            // The ball no longer has the energy to clear the next hill: the moment a push matters most.
            get trapped() { return ball.trapped; }
        };
    }

    return {
        STEP, GRAVITY,
        checkpoint, skillHill, skillHeight, rollingHills, terrain, createRoll, rng
    };
});
