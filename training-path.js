// training-path.js — the Training Path: rolls of a ball over random rolling hills toward skill hills.
// The trail is split into stretches (legs). Stretch k runs from checkpoint k to skill hill k, a big hill
// that teaches skill k. Each roll starts at a checkpoint over freshly generated rolling hills and runs
// on through every later leg up to the last one asked for (a replay of cleared legs carries on toward the
// frontier), and with `onward` on past it (the caller extends the terrain a leg at a time); the roll ends
// when the ball comes to rest.
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
    const SLOPE_DRAG = 0.5;     // extra friction in proportion to steepness: steep hills sap more speed
    const REST_SPEED = 0.03;
    const REST_SECONDS = 0.5;
    const ROLL_BACK = 0.15;     // rolling back this far behind the start line ends the run
    const LEAD_IN = 0.5;        // flat run-up after each checkpoint
    const FREE_COOLDOWN = 0.35; // wait after a free push (a crunch)
    const ROLL_OUT = 0.8;       // with rollOut, how far past the skill hill's foot the ball runs before the roll ends
    const RESHAPE_RATE = 5;     // reshaped hills (smashed, shrunk) settle toward their new height at this rate per second

    // ---- Skill hills (fixed) -----------------------------------------------

    const skillHeight = k => 0.3 * Math.pow(1.5, k);   // each skill hill is a bigger wall than the last
    const skillHalfWidth = k => 0.55 * Math.pow(1.14, k);
    // Checkpoint to the foot of skill hill k: 10, 17, 26, 36, 50, 69, 93, 124, 166 … Gentle early (no wall
    // at the second skill), then much longer each stretch, so the distance itself becomes the challenge
    // and strength (and later launches and bounces) matters more than the hill count.
    const stretchLength = k => 10 * Math.pow(1.4, k) + 3 * k;

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

    // Later legs grow in distance and scale, not in hill count: about 10 rolling hills on the first leg and
    // only 1.5 more per leg after (22 by leg 8), so each leg's hills and the flats between them get wider and
    // the hills taller with it (`legScale`: 1 on the first leg, about 1.8 by leg 2, 2.7 by leg 5, 3.8 by 8).
    // Distance, momentum and (later) launches matter more than counting bumps.
    const hillCount = k => 10 + 1.5 * k;
    function legScale(k) {
        const natural = 2 * 0.525 * skillHalfWidth(k) + 0.35;      // average hill + gap at the old density
        const wanted = (stretchLength(k) - LEAD_IN - 0.25) / hillCount(k);
        return Math.max(1, wanted / natural);
    }

    // Rolling hills for stretch k: mostly small, sometimes medium, growing toward the skill hill.
    // `hillScale` (< 1 from upgrades) makes them less steep; the random layout stays the same.
    function rollingHills(k, seed, hillScale = 1) {
        const r = rng(seed);
        const from = checkpoint(k) + LEAD_IN;
        const to = skillHill(k).start - 0.25;
        const scale = legScale(k);
        const big = skillHeight(k) * Math.sqrt(scale);
        const hills = [];
        let x = from;
        while (true) {
            const w = skillHalfWidth(k) * (0.25 + r() * 0.55) * scale;
            const gap = (0.1 + r() * 0.5) * scale;
            if (x + 2 * w > to) break;
            const along = (x - from) / (to - from);              // 0 near the checkpoint, 1 near the wall
            const roll = r();
            const size = roll < 0.12 ? 0.35 + r() * 0.2 : 0.05 + r() * 0.2;   // occasional medium hill
            const h = Math.min(0.65 * skillHeight(k), big * size * (0.6 + 0.6 * along)) * hillScale;
            hills.push({ start: x, peak: x + w, end: x + 2 * w, height: h, halfWidth: w, skill: null });
            x += 2 * w + gap;
        }
        return hills;
    }

    // ---- Terrain for one roll ----------------------------------------------

    // Rolling hills for leg j of a run that starts on leg k: the first leg uses the roll's seed, later legs
    // derive their own from it, so a single-leg roll is unchanged and every leg differs.
    const legSeed = (seed, k, j) => (j === k ? seed : (seed + Math.imul(j - k, 0x9E3779B1)) >>> 0);

    // The ground for a roll from stretch k through stretch `last` (default k): flat at the start, then
    // each leg's rolling hills and skill hill. Nothing behind the start line: a ball that rolls back to it
    // ends the run.
    // `extend()` adds the next leg past the last one (a run that crests its last skill hill rolls on).
    function terrain(k, seed, hillScale = 1, last = k) {
        last = Math.max(k, last);
        const bumps = [];
        for (let j = k; j <= last; j++) bumps.push(...rollingHills(j, legSeed(seed, k, j), hillScale), skillHill(j));
        let rolling = bumps.filter(b => b.skill === null);
        let goal = skillHill(last);
        function extend() {
            last++;
            bumps.push(...rollingHills(last, legSeed(seed, k, last), hillScale), skillHill(last));
            rolling = bumps.filter(b => b.skill === null);
            goal = skillHill(last);
        }

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
            const b = find(x);
            if (!b) return 0;
            const c = Math.cos((Math.PI / 2) * (x - b.peak) / b.halfWidth);
            return b.height * c * c;
        }

        function slope(x) {
            const b = find(x);
            if (!b) return 0;
            const u = (x - b.peak) / b.halfWidth;
            return -b.height * (Math.PI / 2) * Math.sin(Math.PI * u) / b.halfWidth;
        }

        // Peak heights of the nearest hills behind and ahead of x (the ball's way out of a dip).
        function walls(x) {
            let left = 0;
            let right = Infinity;
            for (const b of bumps) {
                if (b.peak <= x) left = b.height;
                else { right = b.height; break; }
            }
            return { left, right };
        }

        const start = checkpoint(k) + 0.2;
        // Each leg starts at its checkpoint (the run's own start line on the first) and ends at its peak.
        const legStart = j => (j === k ? start : checkpoint(j) + 0.2);
        // The leg a position belongs to: the one whose skill hill is next ahead.
        function legAt(x) {
            for (let j = k; j < last; j++) if (x <= skillHill(j).peak) return j;
            return last;
        }
        // A leg's length in metres: its start to its skill hill's peak (distance XP is paid per metre).
        const legLength = j => skillHill(j).peak - legStart(j);
        const progressIn = (j, x) => Math.max(0, Math.min(1, (x - legStart(j)) / legLength(j)));
        return {
            walls,
            // Rolling hills on x's leg whose peak lies at or before x (how many the ball has got over there).
            hillsBefore: x => {
                const j = legAt(x);
                const from = legStart(j);
                return rolling.filter(b => b.peak >= from && b.peak <= x).length;
            },
            stretch: k,
            get last() { return last; },
            get goal() { return goal; },
            extend,
            seed,
            bumps,
            height,
            slope,
            start,
            legAt,
            legStart,
            legLength,
            // How far along its leg a position is: 0 at the leg's start, 1 at its skill hill's peak.
            progress: x => progressIn(legAt(x), x),
            progressIn
        };
    }

    // ---- One roll -------------------------------------------------------------

    // opts: { pushes, cooldown, friction?, slopeDrag?, hillScale?, rollOut?, last? } — friction and
    // slopeDrag scale rolling resistance and slope friction (1 = normal); hillScale lowers the rolling
    // hills; `last` (default k) is the final leg. Cresting an earlier leg's skill hill emits 'clear' and
    // the ball rolls on. Cresting the last one emits 'crest'; with rollOut the roll goes on down the far
    // side and ends with an 'end' event marked `crested` (so the UI can celebrate first), otherwise
    // 'crest' ends it. 'end' events carry the `leg` the ball stopped on and the `progress` along it.
    // With `onward`, cresting the last skill hill emits 'crest' and the ball rolls on: the caller learns the
    // skill and calls `extend()` to lay the next leg ahead (a run is never cut short at a skill hill).
    // `holdOpen()`, if given, keeps a resting ball's roll open while it returns true (a crunch: free pushes).
    // Power-ups: `coast(seconds, speed, shrink)` lifts the ball off the line for a while, holding at least
    // `speed` (a flow; with `shrink`, a super flow lowers the rolling hills under and ahead of it), `boost()`
    // adds energy whatever the cooldown (banked sprints), and `smash(reach)` breaks the rolling hills ahead.
    function createRoll(k, seed, opts) {
        const { pushes, cooldown } = opts;
        const friction = opts.friction ?? 1;
        const slopeDrag = SLOPE_DRAG * (opts.slopeDrag ?? 1);
        const ground = terrain(k, seed, opts.hillScale ?? 1, opts.last ?? k);
        let nextClear = k;          // the next earlier-leg skill hill still to crest
        let crestedGoal = -1;       // with onward: the last skill hill already announced
        const ball = { x: ground.start, v: 0, still: 0, cooldown: 0, maxX: ground.start, trapped: false };
        let pushesLeft = pushes;
        let launched = false;
        let over = false;
        let crested = false;
        let carry = 0;
        const flow = { left: 0, speed: 0, shrink: 0, narrow: 1 };
        // Reshaped hills ease toward their target height (the drawing follows the physics).
        let reshaping = [];

        // `wide` (0–1) also narrows them about their peak; `instant` skips the easing (a smash: the drawing
        // shows the hill breaking apart instead).
        function reshape(from, to, factor, wide = 1, instant = false) {
            const hit = [];
            for (const b of ground.bumps) {
                if (b.skill !== null || b.peak < from || b.peak > to) continue;
                if (b.base == null) b.base = b.height;
                if (b.baseW == null) b.baseW = b.halfWidth;
                const target = b.base * factor;
                const targetW = b.baseW * wide;
                if (b.target == null || target < b.target || targetW < b.targetW) {
                    b.target = Math.min(target, b.target ?? Infinity);
                    b.targetW = Math.min(targetW, b.targetW ?? Infinity);
                    hit.push(b);
                    if (instant) {
                        b.height = b.target;
                        b.halfWidth = b.targetW;
                        b.start = b.peak - b.halfWidth;
                        b.end = b.peak + b.halfWidth;
                    } else if (!reshaping.includes(b)) reshaping.push(b);
                }
            }
            return hit;
        }

        // A push adds a fixed amount of energy (strength = the speed it gives a ball at rest).
        // Pushing against a backward roll spends energy cancelling it first, so timing matters.
        // Returns false if the roll is over, out of pushes, or cooling down.
        // `free` (a crunch): doesn't use up a push and barely waits, so it works even with none left.
        function push(strength, free = false) {
            if (over || crested || (!free && pushesLeft <= 0) || ball.cooldown > 0) return false;
            const e = strength * strength;
            ball.v = ball.v >= 0
                ? Math.sqrt(ball.v * ball.v + e)
                : (ball.v * ball.v > e ? -Math.sqrt(ball.v * ball.v - e) : Math.sqrt(e - ball.v * ball.v));
            ball.still = 0;
            ball.cooldown = free ? Math.min(cooldown, FREE_COOLDOWN) : cooldown;
            if (!free) pushesLeft--;
            launched = true;
            return true;
        }

        function stepOnce(events) {
            ball.cooldown = Math.max(0, ball.cooldown - STEP);
            if (reshaping.length) {
                const k = Math.min(1, RESHAPE_RATE * STEP);
                for (const b of reshaping) {
                    b.height += (b.target - b.height) * k;
                    b.halfWidth += (b.targetW - b.halfWidth) * k;
                    b.start = b.peak - b.halfWidth;
                    b.end = b.peak + b.halfWidth;
                }
                reshaping = reshaping.filter(b => Math.abs(b.height - b.target) > 1e-4 || Math.abs(b.halfWidth - b.targetW) > 1e-4);
            }
            const dy = ground.slope(ball.x);
            if (flow.left > 0) {
                // Flowing: off the line, no gravity or drag, at least the flow's speed. A super flow
                // shrinks the hills under and just ahead of the ball as it goes.
                flow.left = Math.max(0, flow.left - STEP);
                ball.v = Math.max(ball.v, flow.speed);
                if (flow.shrink) reshape(ball.x - 0.3, ball.x + 3 + 3 * flow.speed, flow.shrink, flow.narrow);
                ball.trapped = false;
            } else {
                ball.v += (-GRAVITY * dy / (1 + dy * dy)) * STEP;
                ball.v -= (friction * (DAMPING * ball.v + DRAG * ball.v * Math.abs(ball.v)) + slopeDrag * Math.abs(dy) * ball.v) * STEP;
                // Momentum while there is somewhere to go; once the ball lacks the energy to clear either
                // neighbouring hill, it is stuck in this dip, so let it settle quickly instead of sloshing.
                const { left, right } = ground.walls(ball.x);
                const energy = 0.5 * ball.v * ball.v + GRAVITY * ground.height(ball.x);
                ball.trapped = energy < GRAVITY * Math.min(left, right);
                if (ball.trapped) ball.v *= 1 - TRAPPED_DAMPING * STEP;
            }
            ball.x += ball.v * STEP;
            ball.maxX = Math.max(ball.maxX, ball.x);

            const last = ground.last;
            while (nextClear < last && ball.x > skillHill(nextClear).peak) {
                events.push({ type: 'clear', skill: nextClear, hills: ground.hillsBefore(skillHill(nextClear).peak) });
                nextClear++;
            }
            if (opts.onward && crestedGoal < last && ball.x > ground.goal.peak) {
                crestedGoal = last;
                nextClear = last + 1;
                events.push({ type: 'crest', onward: true, skill: last, leg: last, progress: 1, metres: ground.legLength(last), hills: ground.hillsBefore(ground.goal.peak) });
            } else if (!opts.onward && !crested && ball.x > ground.goal.peak) {
                events.push({ type: 'crest', skill: last, leg: last, progress: 1, metres: ground.legLength(last), hills: ground.hillsBefore(ground.goal.peak) });
                if (!opts.rollOut) {
                    over = true;
                    return;
                }
                crested = true;
            }
            if (crested) {
                // Down the far side and out onto the flat, then done.
                if (ball.x > ground.goal.end + ROLL_OUT || (ball.x > ground.goal.end && Math.abs(ball.v) < 0.25)) {
                    over = true;
                    events.push({ type: 'end', skill: ground.last, leg: ground.last, progress: 1, metres: ground.legLength(last), crested: true, hills: ground.hillsBefore(ground.goal.peak) });
                }
                return;
            }
            if (launched && ball.v < 0 && ball.x < ground.start - ROLL_BACK) {
                over = true;
                // Rolled back to the start: no progress, but half the furthest distance reached still counts.
                const furthest = ground.progressIn(k, Math.min(ball.maxX, skillHill(k).peak)) * ground.legLength(k);
                events.push({ type: 'end', skill: k, leg: k, progress: 0, metres: 0.5 * furthest, rolledBack: true, hills: ground.hillsBefore(Math.min(ball.maxX, skillHill(k).peak)) });
                return;
            }
            const resting = flow.left <= 0 && Math.abs(ball.v) < REST_SPEED && Math.abs(dy) < 0.08;
            ball.still = resting ? ball.still + STEP : 0;
            // The roll ends once the ball settles with no pushes left. With pushes left, it waits for you.
            if (launched && pushesLeft === 0 && !opts.holdOpen?.() && ball.still >= REST_SECONDS) {
                over = true;
                events.push(stopEvent());
            }
        }

        // Where a roll that stops here ends: its leg, how far along it (fraction and metres), and the rolling
        // hills got over there.
        function stopEvent() {
            const leg = ground.legAt(ball.x);
            const progress = ground.progress(ball.x);
            return { type: 'end', skill: leg, leg, progress, metres: progress * ground.legLength(leg), hills: ground.hillsBefore(Math.min(ball.maxX, skillHill(leg).peak)) };
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

        // End the roll where it is (e.g. the ball is stuck and no push is affordable).
        function end() {
            if (over) return null;
            over = true;
            return crested
                ? { type: 'end', skill: ground.last, leg: ground.last, progress: 1, metres: ground.legLength(ground.last), crested: true, hills: ground.hillsBefore(ground.goal.peak) }
                : stopEvent();
        }

        // Banked sprints (a super crunch) land all at once, whatever the cooldown; no push is used.
        function boost(strength) {
            if (over || crested || !(strength > 0)) return false;
            const e = strength * strength;
            ball.v = ball.v >= 0 ? Math.sqrt(ball.v * ball.v + e) : (ball.v * ball.v > e ? -Math.sqrt(ball.v * ball.v - e) : Math.sqrt(e - ball.v * ball.v));
            ball.still = 0;
            launched = true;
            return true;
        }

        // A flow: `seconds` off the line at no less than `speed`; `shrink` (0–1) is a super flow's hill height
        // and `narrow` (0–1) its width: the world shrinks around the ball in both directions.
        function coast(seconds, speed, shrink = 0, narrow = 1) {
            if (over || crested) return false;
            Object.assign(flow, { left: seconds, speed, shrink, narrow: shrink ? narrow : 1 });
            ball.still = 0;
            launched = true;
            return true;
        }

        // A super breakthrough: the rolling hills in the next `reach` metres crumble flat. Returns them.
        function smash(reach) {
            if (over || crested) return [];
            return reshape(ball.x, ball.x + reach, 0, 1, true);
        }

        return {
            ground,
            ball,
            push,
            boost,
            coast,
            smash,
            step,
            end,
            // Lay the next leg past the last one (after an onward crest).
            extend: () => ground.extend(),
            // Seconds of flow left (0 when the ball is on the line).
            get flowing() { return flow.left; },
            get superFlow() { return flow.left > 0 && flow.shrink > 0; },
            get pushesLeft() { return pushesLeft; },
            get launched() { return launched; },
            get over() { return over; },
            // Past the skill hill's peak (rollOut only): rolling down the far side, no more pushes.
            get crested() { return crested; },
            // Where the ball is now: its leg, and how far along it (0–1). Rolling back lowers it.
            get leg() { return ground.legAt(ball.x); },
            get progress() { return ground.progress(ball.x); },
            get atRest() { return ball.still >= REST_SECONDS; },
            // The ball no longer has the energy to clear the next hill: the moment a push matters most.
            get trapped() { return ball.trapped; }
        };
    }

    return {
        STEP, GRAVITY,
        checkpoint, skillHill, skillHeight, legScale, rollingHills, terrain, createRoll, rng
    };
});
