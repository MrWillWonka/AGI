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
    const ROLL_BACK = 0.15;     // rolling back this far behind the start line ends the run (with no sprints left)
    const STALL_SECONDS = 8;    // with no sprints left, a ball that gains no new ground for this long ends its run
    const BUMPER = 0.3;         // with sprints left, the start line bounces the ball back at this share of its speed
    const LEAD_IN = 0.5;        // flat run-up after each checkpoint
    const FREE_COOLDOWN = 0.35; // wait after a free push (a crunch)
    const ROLL_OUT = 0.8;       // with rollOut, how far past the skill hill's foot the ball runs before the roll ends
    const RESHAPE_RATE = 5;     // reshaped hills (smashed, shrunk) settle toward their new height at this rate per second
    // Late legs (a launcher): over a crest faster than the ground can curve away, the ball takes off and flies
    // ballistically; landing bounces it (some speed off the impact) until it sticks to the ground again.
    const AIR_DRAG = 0.012;     // quadratic air drag in flight (much less than rolling)
    const BOUNCE = 0.42;        // share of the impact speed a landing bounces back
    const SKID = 0.82;          // share of the speed along the ground kept through a landing
    const BOUNCE_MIN = 1.2;     // below this bounce-back speed the ball sticks and rolls on
    const LATE_DRAG = 0.45;     // and rolling there keeps more momentum: this share of the quadratic and slope drag (0.25 made act two a burst)
    const AIR_GRAVITY = 1.5;    // gravity in flight, × GRAVITY: arcs come down with weight instead of floating, with some hang time off a kicker (1.9 before kickers)
    const REGRIP = 0.35;        // seconds after landing before it can take off again (no hop-stick-hop over a crest)
    // A flight rises at most this far above the ground it left (half that leg's skill hill, at least 4 m), so it
    // comes back within a couple of seconds whatever boosts it.
    const maxAbove = k => Math.max(4, 0.5 * skillHeight(k));
    const SETTLE_TIME = 0.4;    // seconds before touchdown it starts lining its path up with the slope it lands on
    // A crest throws the ball once the ground curves away faster than 0.6 of a flight's fall: crests pop from act
    // two's first leg (at 1 the sim's player barely flew before leg 10), and the landing planner turns the short
    // hops into clean arcs onto the next down-slope. (Against rolling gravity alone, ~0.5, it hopped constantly.)
    const LAUNCH_GRIP = 0.6;
    // The tuck (act two, Tiny Wings' one verb): while held, the ball is heavier on the ground, so it gains on the
    // way down and loses on the way up. Hold on the descent, let go before the climb.
    const TUCK_GRAVITY = 1.6;
    const KICKERS = 0.85;           // share of act two's swells that are kickers (a lip to launch off)
    const KICK_SLOPE = [0.75, 1];   // a kicker's slope at its lip

    // A hill's height at x: a cos² bump, or on a kicker's face (`up`: the face's width over the back's) a
    // parabola steepening to the lip, then cos² down the back. `H`, `W`: draw an older outline (a smash).
    function bumpAt(b, x, H = b.height, W = b.halfWidth) {
        if (b.up && x < b.peak) {
            const t = Math.max(0, 1 - (b.peak - x) / (W * b.up));
            return H * t * t;
        }
        const c = Math.cos((Math.PI / 2) * (x - b.peak) / W);
        return H * c * c;
    }
    function bumpSlope(b, x) {
        if (b.up && x < b.peak) {
            const face = b.halfWidth * b.up;
            const t = Math.max(0, 1 - (b.peak - x) / face);
            return 2 * b.height * t / face;
        }
        const u = (x - b.peak) / b.halfWidth;
        return -b.height * (Math.PI / 2) * Math.sin(Math.PI * u) / b.halfWidth;
    }

    // ---- Skill hills (fixed) -----------------------------------------------

    // Leg 0 is a warm-up: a short flat run to a small hill most first runs crest with their two sprints, so the
    // first skill (and a summit) comes in the first few runs. Every later leg k is the old leg k − 1 (`j`).
    const TUTORIAL = { length: 2, height: 0.03, halfWidth: 0.45 };
    // Each skill hill is a bigger wall than the last: ×1.25 a leg through act one (so General AI, the first
    // version worth shipping, comes about 30 minutes in), ×1.5 a leg in act two, from where it always was.
    const ACT_ONE_GROWTH = 1.25;
    const skillHeight = k => (k === 0 ? TUTORIAL.height : 0.3 * Math.pow(k < LATE_LEG ? ACT_ONE_GROWTH : 1.5, k - 1));
    // Act two (from leg 7, `LATE_LEG`: the leg after Translation, the skill that reaches General AI) is a
    // launcher: each leg is a handful of huge swells, far wider than the view, and the ball can fly off
    // their crests and bounce (see createRoll). Before that, legs are many small rolling hills. The engine
    // mirrors this as ACT_TWO_LEG (a test keeps them in step).
    const LATE_LEG = 7;           // (skillHalfWidth widens its hills from here too)
    // From act two (LATE_LEG) skill hills are 8× wider, in scale with the giant swells around them.
    const skillHalfWidth = k => (k === 0 ? TUTORIAL.halfWidth : 0.55 * Math.pow(1.14, k - 1) * (k >= LATE_LEG ? 8 : 1));
    // Checkpoint to the foot of skill hill k (after the warm-up): 10, 17, 26, 36, 50, 69, 93, 124, 166 … Gentle early (no wall
    // at the second skill), then much longer each stretch, so the distance itself becomes the challenge
    // and strength (and later launches and bounces) matters more than the hill count.
    // Pattern Matching's leg is 9 m (10 by the formula): with the warm-up skill in hand, it lands about 15 runs in.
    // Act one's legs after Pattern Matching's are a fifth shorter (ACT_ONE_LENGTH), for the same 30 minutes, and
    // act two's first three ease back up to full length (ACT_TWO_EASE): reached 20 minutes sooner, its first leg
    // had become a 15-minute wall.
    const ACT_ONE_LENGTH = 0.8;
    const ACT_TWO_EASE = [0.7, 0.76, 0.88];
    const lengthScale = k => (k < LATE_LEG ? ACT_ONE_LENGTH : ACT_TWO_EASE[k - LATE_LEG] ?? 1);
    const stretchLength = k => (k === 0 ? TUTORIAL.length : k === 1 ? 9 : (10 * Math.pow(1.4, k - 1) + 3 * (k - 1)) * lengthScale(k));

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
    // `hillScale` (< 1 from upgrades) makes them less steep; the random layout stays the same.
    function rollingHills(k, seed, hillScale = 1) {
        if (k === 0) return [];   // the warm-up: nothing between the start and its little hill
        if (k >= LATE_LEG) return swells(k, seed, hillScale);
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
            const h = Math.min(0.65 * skillHeight(k), big * size * (0.6 + 0.6 * along)) * hillScale;
            hills.push({ start: x, peak: x + w, end: x + 2 * w, height: h, halfWidth: w, skill: null });
            x += 2 * w + gap;
        }
        return hills;
    }

    // Late legs: 4–6 giant swells (a few more every three legs), each tens of metres wide and up to half the
    // skill hill's height, with little flat between them: long climbs to build into and crests to fly off.
    function swells(k, seed, hillScale = 1) {
        const r = rng(seed);
        const from = checkpoint(k) + LEAD_IN;
        const to = skillHill(k).start - 0.25;
        const n = 5 + Math.floor(r() * 3) + Math.floor((k - LATE_LEG) / 3);
        const pitch = (to - from) / n;
        const hills = [];
        for (let i = 0; i < n; i++) {
            const w = pitch * (0.24 + r() * 0.12);   // narrow enough to curve away under act two's first speeds
            const along = i / Math.max(1, n - 1);
            // The first is a low ramp: right after the start line, a full swell sent a one-sprint ball
            // straight back over the line (ending the run) before its next sprint was ready.
            const h = Math.min(0.65 * skillHeight(k), skillHeight(k) * (0.35 + r() * 0.3) * (0.75 + 0.4 * along)) * hillScale * (i === 0 ? 0.35 : 1);
            // Most swells are kickers (the rest stay round, for variety): a face that steepens all the way up to
            // a lip at KICK_SLOPE, so a crest throws the ball with real upward speed. Off a round crest it took
            // off near the top, where the slope is about 0, and only skimmed (5% of act two's first leg in the air).
            const kick = r() < KICKERS;
            const slope = KICK_SLOPE[0] + r() * (KICK_SLOPE[1] - KICK_SLOPE[0]);
            const up = kick ? Math.min(pitch - w, Math.max(0.4 * w, 2 * h / slope)) : w;
            const start = from + i * pitch + Math.max(0, pitch - up - w) * r();
            hills.push({ start, peak: start + up, end: start + up + w, height: h, halfWidth: w, up: up / w, skill: null });
        }
        return hills;
    }

    // ---- Terrain features: boost strips and XP tokens ------------------------

    // Something to aim for, so runs differ: boost strips ("data streams") on some hills' backs push a ball
    // rolling forward over them; XP tokens hang in arcs past act two's kicker lips, where flights go.
    // Their own random stream (salted from the leg's seed), so the hills come out exactly as before.
    const STRIP_PUSH = 0.6;      // a strip's push: this share of sqrt(g · the leg's skill hill height) per second
    const TOKEN_REACH = 0.4;     // metres along the trail within which a passing ball takes a token
    function features(k, seed, hills) {
        const strips = [];
        const tokens = [];
        if (k <= 1) return { strips, tokens };   // the warm-up and Pattern Matching's leg keep their tuned pace
        const r = rng((seed ^ 0x51ed27) >>> 0);
        const late = k >= LATE_LEG;
        const push = STRIP_PUSH * Math.sqrt(GRAVITY * skillHeight(k));
        // Act one (from its second leg): about half the legs have a few strips; act two: some swells' backs.
        const stripChance = late ? 0.3 : r() < 0.5 ? 0.25 : 0;
        for (const b of hills) {
            if (r() < stripChance) strips.push({ from: b.peak + 0.15 * b.halfWidth, to: b.end - 0.1 * b.halfWidth, push, leg: k });
            if (!late || !b.up || b.up === 1 || r() > 0.6) continue;
            // An arc of tokens off the lip: a flight's path, give or take.
            const n = 3 + Math.floor(r() * 3);
            const span = b.halfWidth * (0.5 + 0.5 * r());
            const lift = skillHeight(k) * (0.08 + 0.17 * r());
            for (let i = 0; i < n; i++) {
                const f = (i + 1) / (n + 1);
                tokens.push({ x: b.peak + span * f, y: b.height + lift * Math.sin(Math.PI * f) + 0.3, leg: k, taken: false });
            }
        }
        return { strips, tokens };
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
        const strips = [];
        const tokens = [];
        const addLeg = j => {
            const hills = rollingHills(j, legSeed(seed, k, j), hillScale);
            bumps.push(...hills, skillHill(j));
            const f = features(j, legSeed(seed, k, j), hills);
            strips.push(...f.strips);
            tokens.push(...f.tokens);
        };
        for (let j = k; j <= last; j++) addLeg(j);
        let rolling = bumps.filter(b => b.skill === null);
        let goal = skillHill(last);
        function extend() {
            last++;
            addLeg(last);
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
            return b ? bumpAt(b, x) : 0;
        }

        function slope(x) {
            const b = find(x);
            return b ? bumpSlope(b, x) : 0;
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
            strips,
            tokens,
            stripAt: x => strips.find(st => x >= st.from && x <= st.to) || null,
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
    // Power-ups: `coast(seconds, speed, shrink, narrow, warp)` lifts the ball off the line for a while, holding
    // at least `speed` (a flow; `shrink`/`narrow` lower and narrow the hills under and ahead of it, and `warp`
    // condenses time: each step carries the ball `warp` times as far, a super flow), `boost()`
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
        let tuck = false;           // held in act two (see TUCK_GRAVITY); set by the UI each frame
        let launched = false;
        let over = false;
        let crested = false;
        let carry = 0;
        const flow = { left: 0, speed: 0, shrink: 0, narrow: 1, warp: 1 };
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
                        b.start = b.peak - b.halfWidth * (b.up || 1);
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
        // Energy into the ball: along the ground, or in flight along its line (an air sprint keeps a flying
        // ball going, the way the old launcher games let you fire a booster mid-air).
        function addEnergy(e) {
            if (ball.air && ball.v > 0) {
                const sp = Math.hypot(ball.v, ball.air.vy);
                const k = Math.sqrt(sp * sp + e) / sp;
                ball.v *= k;
                ball.air.vy = ball.air.vy * k + 0.25 * Math.sqrt(e);   // and a little lift
                capClimb();
                planLanding();
                return;
            }
            ball.v = ball.v >= 0
                ? Math.sqrt(ball.v * ball.v + e)
                : (ball.v * ball.v > e ? -Math.sqrt(ball.v * ball.v - e) : Math.sqrt(e - ball.v * ball.v));
        }

        function push(strength, free = false) {
            if (over || crested || (!free && pushesLeft <= 0) || ball.cooldown > 0) return false;
            addEnergy(strength * strength);
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
                    b.start = b.peak - b.halfWidth * (b.up || 1);
                    b.end = b.peak + b.halfWidth;
                }
                reshaping = reshaping.filter(b => Math.abs(b.height - b.target) > 1e-4 || Math.abs(b.halfWidth - b.targetW) > 1e-4);
            }
            const dy = ground.slope(ball.x);
            if (flow.left > 0) ball.air = null;         // a flow lifts it off on its own terms
            if (ball.air) {
                flyStep(events);
            } else if (flow.left > 0) {
                // Flowing: off the line, no gravity or drag, at least the flow's speed. A super flow
                // shrinks the hills under and just ahead of the ball as it goes.
                flow.left = Math.max(0, flow.left - STEP);
                ball.v = Math.max(ball.v, flow.speed);
                if (flow.shrink) reshape(ball.x - 0.3, ball.x + 3 + 3 * flow.speed, flow.shrink, flow.narrow);
                ball.trapped = false;
            } else {
                const lateLeg = ground.legAt(ball.x) >= (opts.lateLeg ?? LATE_LEG);
                ball.v += (-GRAVITY * (tuck && lateLeg ? TUCK_GRAVITY : 1) * dy / (1 + dy * dy)) * STEP;
                const late = lateLeg ? LATE_DRAG : 1;
                // Semi-implicit drag: dividing instead of subtracting can't flip the ball's direction at
                // huge speeds (a stacked breakthrough or Bullet Time release reversed it into a roll-back).
                ball.v /= 1 + (friction * (DAMPING + late * DRAG * Math.abs(ball.v)) + late * slopeDrag * Math.abs(dy)) * STEP;
                // Momentum while there is somewhere to go; once the ball lacks the energy to clear either
                // neighbouring hill, it is stuck in this dip, so let it settle quickly instead of sloshing.
                const { left, right } = ground.walls(ball.x);
                const energy = 0.5 * ball.v * ball.v + GRAVITY * ground.height(ball.x);
                ball.trapped = energy < GRAVITY * Math.min(left, right);
                // On a late leg's giant swells, only settle it near the bottom of the valley: mid-slope it's
                // still rolling down a long hill, not sloshing in a dip.
                const settle = ball.trapped && (ground.legAt(ball.x) < (opts.lateLeg ?? LATE_LEG) || Math.abs(dy) < 0.04);
                if (settle) ball.v *= 1 - TRAPPED_DAMPING * STEP;
            }
            // A strip pushes only a ball at its furthest yet: sloshing back and forth over one in a dip, it
            // pumped a spent ball forever (a run that never ended).
            if (!ball.air && flow.left <= 0 && ball.v > 0 && ball.x >= ball.maxX - 0.01) {
                const strip = ground.stripAt(ball.x);
                if (strip) ball.v += strip.push * STEP;
            }
            if (!ball.air) {
                ball.x += ball.v * STEP * (flow.left > 0 ? flow.warp : 1);
                if (flow.left <= 0) takeOff(events);
            }
            // The safety net: no sprints left and no new ground for STALL_SECONDS ends the run, whatever keeps
            // the ball moving.
            ball.stall = ball.x > ball.maxX + 0.01 ? 0 : (ball.stall || 0) + STEP;
            ball.maxX = Math.max(ball.maxX, ball.x);
            // Tokens: taken by a ball passing close enough (its height in flight, the line on the ground).
            for (const tk of ground.tokens) {
                if (tk.taken || Math.abs(tk.x - ball.x) > TOKEN_REACH) continue;
                const h = ball.air ? ball.air.y : ground.height(ball.x);
                if (Math.abs(h - tk.y) <= Math.max(0.45, 0.12 * skillHeight(tk.leg))) {
                    tk.taken = true;
                    events.push({ type: 'token', leg: tk.leg, x: tk.x, y: tk.y });
                }
            }

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
            // With sprints left the start line is a soft bumper: the run never ends with a sprint unspent
            // (a weak launch used to roll back over the start before the wait was up).
            if (launched && ball.v < 0 && ball.x < ground.start - ROLL_BACK && pushesLeft > 0 && !opts.rollBackEnds) {
                ball.x = ground.start - ROLL_BACK;
                ball.v = -ball.v * BUMPER;
                events.push({ type: 'bump' });
            }
            if (launched && ball.v < 0 && ball.x < ground.start - ROLL_BACK) {
                over = true;
                // Rolled back to the start: no progress, but half the furthest distance reached still counts.
                const furthest = ground.progressIn(k, Math.min(ball.maxX, skillHill(k).peak)) * ground.legLength(k);
                events.push({ type: 'end', skill: k, leg: k, progress: 0, metres: 0.5 * furthest, rolledBack: true, hills: ground.hillsBefore(Math.min(ball.maxX, skillHill(k).peak)) });
                return;
            }
            const resting = !ball.air && flow.left <= 0 && Math.abs(ball.v) < REST_SPEED && Math.abs(dy) < 0.08;
            ball.still = resting ? ball.still + STEP : 0;
            // The roll ends once the ball settles with no pushes left. With pushes left, it waits for you.
            if (launched && pushesLeft === 0 && !opts.holdOpen?.() && (ball.still >= REST_SECONDS || (!ball.air && flow.left <= 0 && ball.stall >= STALL_SECONDS))) {
                over = true;
                events.push(stopEvent());
            }
        }

        // On a late leg, the ground curving away faster than the ball can follow (its downward pull at this speed
        // would need more than gravity) throws it into the air, with the climb's upward speed.
        function takeOff(events) {
            if (ball.grip > 0) { ball.grip -= STEP; return; }
            if (ball.v < 0.5 || ground.legAt(ball.x) < (opts.lateLeg ?? LATE_LEG)) return;
            // How fast the slope turns over the last step (not a fixed 2 cm: a fast ball steps clean over a
            // kicker's lip, and launched just past it at a slope of 0). It leaves at the slope it came up.
            const dx = Math.max(0.02, ball.v * STEP);
            const before = ground.slope(ball.x - dx);
            const curve = (ground.slope(ball.x) - before) / dx;
            if (curve * ball.v * ball.v >= -GRAVITY * AIR_GRAVITY * LAUNCH_GRIP) return;
            const slope = Math.max(before, ground.slope(ball.x));
            const y0 = ground.height(ball.x);
            ball.air = { y: y0, vy: slope * ball.v, peak: y0, from: ball.x, ceil: y0 + maxAbove(ground.legAt(ball.x)) };
            capClimb();
            planLanding();
            ball.trapped = false;
            events.push({ type: 'launch', speed: Math.hypot(ball.v, ball.air.vy), x: ball.x });
        }

        // The ceiling: no more upward speed than reaches it (extra speed from a sprint goes into distance).
        function capClimb() {
            const a = ball.air;
            if (!a || a.vy <= 0) return;
            const room = Math.max(0, (a.ceil ?? Infinity) - a.y);
            a.vy = Math.min(a.vy, Math.sqrt(2 * GRAVITY * AIR_GRAVITY * room));
        }

        // Where to come down: the down-slope (the back of a hill) nearest the natural landing, the way Tiny Wings
        // drops you onto the backs of hills. The flight then follows a smooth path (a cubic in x, from where it
        // is and how it's heading to that point, arriving along the slope about 1 m/s into it), so it rejoins the
        // line without slamming or bouncing. Landing on the back of a hill keeps the momentum and reads right; an
        // up-slope face never is. A path must stay over the ground and under the ceiling, and bend no harder
        // than `PULL` (a dive down to a short flare, in flight gravities). Failing every down-slope, a valley
        // floor; failing that, it falls naturally. Planned at take-off, at the top of the arc and after an air
        // sprint.
        const PULL = [-0.5, 5];
        function pathAt(pl, x) {
            const h = pl.x1 - pl.x0;
            const u = Math.min(1, (x - pl.x0) / h);
            if (x >= pl.x1) return { y: pl.y1 + pl.m1 * (x - pl.x1), dy: pl.m1, ddy: 0 };
            const u2 = u * u, u3 = u2 * u;
            const y = (2 * u3 - 3 * u2 + 1) * pl.y0 + (u3 - 2 * u2 + u) * h * pl.m0 + (-2 * u3 + 3 * u2) * pl.y1 + (u3 - u2) * h * pl.m1;
            const dy = ((6 * u2 - 6 * u) * pl.y0 + (3 * u2 - 4 * u + 1) * h * pl.m0 + (-6 * u2 + 6 * u) * pl.y1 + (3 * u2 - 2 * u) * h * pl.m1) / h;
            const ddy = ((12 * u - 6) * pl.y0 + (6 * u - 4) * h * pl.m0 + (6 - 12 * u) * pl.y1 + (6 * u - 2) * h * pl.m1) / (h * h);
            return { y, dy, ddy };
        }
        function planLanding() {
            const a = ball.air;
            if (!a) return;
            a.plan = null;
            if (ball.v <= 0.5) return;
            const G = GRAVITY * AIR_GRAVITY;
            const nat = simulateLanding();
            const v2 = ball.v * ball.v;
            const m0 = a.vy / ball.v;
            let best = null;
            for (let x = ball.x + Math.max(2, 0.3 * ball.v); x <= nat.x + 60; x += 0.5) {
                const s = ground.slope(x);
                const valley = s >= -0.04;
                if (valley && (Math.abs(s) > 0.02 || best && !best.valley)) continue;
                const d = Math.abs(x - nat.x) + (valley ? 40 : 0);
                if (best && d >= best.d) continue;
                const pl = { x0: ball.x, x1: x, y0: a.y, y1: ground.height(x), m0, m1: s - 1 / ball.v };
                let ok = true;
                for (let i = 1; i < 32 && ok; i++) {
                    const xi = ball.x + (x - ball.x) * i / 32;
                    const q = pathAt(pl, xi);
                    const pull = -q.ddy * v2;
                    ok = q.y >= ground.height(xi) - 0.02 && q.y <= (a.ceil ?? Infinity) + 0.01 && pull >= PULL[0] * G && pull <= PULL[1] * G;
                }
                // A kicker's lip is a sharp corner the samples can step over: the path must clear every crest too.
                for (const b of ground.bumps) {
                    if (!ok || b.peak >= x) break;
                    if (b.peak > ball.x) ok = pathAt(pl, b.peak).y >= b.height - 0.02;
                }
                if (ok) best = { d, valley, pl };
            }
            if (best) a.plan = best.pl;
        }

        // In flight: on a planned path, it follows it (drag still slows it); otherwise gravity and a little air
        // drag, and landing bounces off the ground's normal (losing some of the impact and a little speed along
        // the ground), until the bounce is too small and it rolls on.
        function flyStep(events) {
            const a = ball.air;
            if (a.plan) {
                const sp = Math.hypot(ball.v, a.vy);
                ball.v /= 1 + friction * AIR_DRAG * sp * STEP;
                ball.x += ball.v * STEP;
                const q = pathAt(a.plan, ball.x);
                a.y = q.y;
                a.vy = q.dy * ball.v;
            } else {
                a.vy -= GRAVITY * AIR_GRAVITY * STEP;
                const sp = Math.hypot(ball.v, a.vy);
                const drag = 1 + friction * AIR_DRAG * sp * STEP;
                ball.v /= drag;
                a.vy /= drag;
                ball.x += ball.v * STEP;
                a.y += a.vy * STEP;
            }
            if (a.vy <= 0 && !a.apex && !a.plan) {
                a.apex = true;
                planLanding();
            }
            a.peak = Math.max(a.peak, a.y);
            const gh = ground.height(ball.x);
            if (a.y > (a.ceil ?? Infinity)) { a.y = a.ceil; a.vy = Math.min(a.vy, 0); }
            // Coming down: work out where it touches (the hill it's about to meet) and ease its path into that
            // slope over the last moments, so it rejoins the line smoothly instead of slamming into it.
            // (Closing speed is relative to the ground under it: a rising slope comes up to meet it.)
            const closing = ground.slope(ball.x) * ball.v - a.vy;
            if (!a.plan && closing > 0 && a.y > gh) {
                const tau = (a.y - gh) / Math.max(0.5, closing);
                if (tau < SETTLE_TIME) {
                    const want = ground.slope(ball.x + ball.v * tau) * ball.v - 1;   // along the slope, settling gently into it
                    a.vy += (want - a.vy) * Math.min(1, STEP / Math.max(STEP, tau));
                }
            }
            if (a.y > gh) return;
            const s = ground.slope(ball.x);
            const len = Math.hypot(1, s);
            const vn = (-s * ball.v + a.vy) / len;          // into the ground when negative
            const vt = (ball.v + s * a.vy) / len;           // along it
            const impact = Math.max(0, -vn);
            const back = impact * BOUNCE;
            events.push({ type: 'land', impact, x: ball.x, flight: ball.x - a.from, height: a.peak - gh, bounce: back >= BOUNCE_MIN });
            // A bounce that would throw it backwards (slamming into the face of the next swell) sticks instead,
            // carrying its speed up the slope: launchers keep you going forward.
            const t = vt * SKID;
            if (back >= BOUNCE_MIN && (t - back * s) / len > 0) {
                // Bounce: tangent kept (mostly), normal reflected and shrunk.
                ball.v = (t - back * s) / len;
                a.vy = (t * s + back) / len;
                a.y = gh + 1e-4;
                a.peak = gh;
                a.from = ball.x;
                a.plan = null;
                planLanding();
            } else {
                // Stick: roll on with the speed along the ground (as dx/dt).
                ball.air = null;
                ball.grip = REGRIP;
                ball.v = t / len;
            }
        }

        // Where the current flight will come down (same gravity and drag, ignoring sprints), for the camera to
        // frame the landing ahead; null on the ground.
        function landing() {
            if (!ball.air) return null;
            const pl = ball.air.plan;
            if (!pl) return simulateLanding();
            let top = ball.air.y;
            for (let i = 1; i <= 24; i++) top = Math.max(top, pathAt(pl, pl.x0 + (pl.x1 - pl.x0) * i / 24).y);
            return { x: pl.x1, top };
        }

        // The natural landing: the flight carried on with the same gravity and drag, no steering.
        function simulateLanding() {
            let x = ball.x;
            let y = ball.air.y;
            let vx = ball.v;
            let vy = ball.air.vy;
            const dt = STEP * 4;
            let top = y;
            for (let i = 0; i < 1200; i++) {
                vy -= GRAVITY * AIR_GRAVITY * dt;
                const d = 1 + friction * AIR_DRAG * Math.hypot(vx, vy) * dt;
                vx /= d;
                vy /= d;
                x += vx * dt;
                y += vy * dt;
                top = Math.max(top, y);
                if (y <= ground.height(x)) break;
            }
            return { x, top };
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
            if (!(seconds > 0)) return events;   // a NaN frame would poison `carry` for good
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
            addEnergy(strength * strength);
            ball.still = 0;
            launched = true;
            return true;
        }

        // A flow: `seconds` off the line at no less than `speed`; `shrink` (0–1) is a super flow's hill height
        // and `narrow` (0–1) its width: the world shrinks around the ball in both directions.
        function coast(seconds, speed, shrink = 0, narrow = 1, warp = 1) {
            if (over || crested) return false;
            Object.assign(flow, { left: seconds, speed, shrink, narrow: shrink ? narrow : 1, warp: Math.max(1, warp) });
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
            // Throw the ball into the air (the debug fling), under the same ceiling as a take-off.
            fly(vx, vy) {
                if (over) return;
                const y0 = ground.height(ball.x);
                ball.air = { y: y0, vy, peak: y0, from: ball.x, ceil: y0 + maxAbove(ground.legAt(ball.x)) };
                ball.v = vx;
                capClimb();
                planLanding();
                launched = true;
            },
            // Seconds of flow left (0 when the ball is on the line).
            get flowing() { return flow.left; },
            get superFlow() { return flow.left > 0 && (flow.shrink > 0 || flow.warp > 1); },
            get pushesLeft() { return pushesLeft; },
            get tuck() { return tuck; },
            set tuck(v) { tuck = !!v; },
            get launched() { return launched; },
            get over() { return over; },
            // Past the skill hill's peak (rollOut only): rolling down the far side, no more pushes.
            get crested() { return crested; },
            // Where the ball is now: its leg, and how far along it (0–1). Rolling back lowers it.
            get leg() { return ground.legAt(ball.x); },
            get progress() { return ground.progress(ball.x); },
            get atRest() { return ball.still >= REST_SECONDS; },
            // The ball no longer has the energy to clear the next hill: the moment a push matters most.
            get trapped() { return ball.trapped; },
            // In flight (late legs): the ball's height above the ground line's zero, else on the line.
            get airborne() { return !!ball.air; },
            get landing() { return landing(); },
            get height() { return ball.air ? ball.air.y : ground.height(ball.x); }
        };
    }

    return {
        STEP, GRAVITY, BUMPER, lengthScale, TUCK_GRAVITY, features, KICKERS, KICK_SLOPE, bumpAt, bumpSlope,
        LATE_LEG, maxAbove, checkpoint, skillHill, skillHeight, rollingHills, terrain, createRoll, rng
    };
});
