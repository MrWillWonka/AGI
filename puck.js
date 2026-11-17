// puck.js — Evals' third kind of course (design/evals-course.md, "The puck course"): mini golf crossed with target
// practice, from Packet Snare's flung mine. PROTOTYPE.
// You put parts on a grid, sling the puck from the tee (bottom middle) to the hole (top middle) yourself, hitting
// targets on the way, then the AI plays it. A shot is an angle and a power; the puck bounces as often as it likes and
// the shot ends when drag stops it. The clock only runs while the puck is moving, so moving targets wait for a shot.
// Pure and deterministic: no DOM, no clock, no Math.random. window.Puck / require(). EVERY NUMBER IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Puck = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PUCK = {
        cols: 7, rows: 9,       // one screen; longer courses are a later unlock (the owner's call), not built
        step: 1 / 120,          // seconds a physics step
        r: 0.22,                // the puck's radius, in cells
        speed: 12,              // a full sling, cells a second
        maxSpeed: 14,
        minPower: 0.12,
        drag: 1.0, sand: 4.5, ice: 0.12,    // speed lost a second (exponential), by what is under the puck
        rest: 0.85,             // speed kept through a bounce
        stop: 0.3,              // slower than this and the shot is over
        shotSeconds: 10,        // a shot is over by then whatever keeps it moving
        boost: 9,               // a booster's push, cells a second squared
        holeR: 0.34, holeSpeed: 9,          // the hole takes a puck this close, unless it is going faster than this
        targetR: 0.3, moverPace: 1.5,       // a moving target's speed along its row, cells a second
        portalR: 0.3,
        limit: 8,               // shots a run may take
        over: 2,                // the AI's own limit on a course you cleared: your shots and this many more
        // The AI: how far off its aim (radians) and power (a share) are at first, less with mastery and with each try.
        aimErr: 0.5, powErr: 0.4, tryGain: 0.6, tries: 4, masteryRuns: 6, stage2: 0.35, stage3: 0.75, near: 0.15,
        angles: 36, powers: [0.25, 0.42, 0.6, 0.8, 1],
        marks: 10, perShot: 0.25, bonusMin: 0.5, bonusMax: 2,
    };
    // What can go in a cell. `points`: what hitting it is worth. `needs`: skills learned before you are given it.
    // `turns`: how many ways round it can face (the tile is then written 'bumper1', 'booster3').
    const TILES = {
        wall: { name: 'Wall', points: 0, needs: 0 },
        bumper: { name: 'Bumper', points: 0, needs: 0, turns: 2 },
        target: { name: 'Target', points: 1, needs: 0 },
        mover: { name: 'Moving target', points: 2, needs: 1 },
        sand: { name: 'Sticky', points: 0, needs: 1 },
        ice: { name: 'Slick', points: 0, needs: 2 },
        pit: { name: 'Pit', points: 0, needs: 2 },
        booster: { name: 'Booster', points: 0, needs: 3, turns: 4 },
        portal: { name: 'Portal', points: 0, needs: 4, max: 2 },
    };
    const ORDER = ['wall', 'bumper', 'target', 'mover', 'sand', 'ice', 'pit', 'booster', 'portal'];
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left
    const HOLE_POINTS = 1;
    const palette = skills => ORDER.filter(k => TILES[k].needs <= skills);
    const kindOf = t => (typeof t === 'string' ? t.replace(/\d$/, '') : null);
    const turnOf = t => (typeof t === 'string' && /\d$/.test(t) ? +t.slice(-1) : 0);
    const tileOf = (kind, turn = 0) => (TILES[kind] && TILES[kind].turns ? kind + (((turn % TILES[kind].turns) + TILES[kind].turns) % TILES[kind].turns) : kind);
    const size = (o = PUCK) => o.cols * o.rows;
    const teeCell = (o = PUCK) => (o.rows - 1) * o.cols + Math.floor(o.cols / 2);
    const holeCell = (o = PUCK) => Math.floor(o.cols / 2);
    const centre = (i, o = PUCK) => ({ x: (i % o.cols) + 0.5, y: Math.floor(i / o.cols) + 0.5 });
    const emptyCourse = (o = PUCK) => Array.from({ length: size(o) }, () => null);
    function cleanCourse(c, o = PUCK) {
        const count = {};
        return Array.from({ length: size(o) }, (_, i) => {
            const t = Array.isArray(c) ? c[i] : null, k = kindOf(t);
            if (!TILES[k] || i === teeCell(o) || i === holeCell(o)) return null;
            count[k] = (count[k] || 0) + 1;
            return TILES[k].max && count[k] > TILES[k].max ? null : tileOf(k, turnOf(t));
        });
    }
    // Everything a perfect run could score: the hole, and every target.
    const points = course => course.reduce((n, t) => n + (t ? TILES[kindOf(t)].points : 0), HOLE_POINTS);
    const mastery = (runs, skills = 0, o = PUCK) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);
    const stage = (m, o = PUCK) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    // The course's solid edges and moving parts, worked out once.
    function world(course, o = PUCK) {
        const W = o.cols, H = o.rows, kinds = course.map(kindOf), solid = i => kinds[i] === 'wall';
        const segs = course.map(() => []), targets = [], movers = [], portals = [];
        course.forEach((t, i) => {
            const k = kinds[i], x = i % W, y = Math.floor(i / W);
            if (k === 'wall') {
                // A wall's four edges, but not one it shares with another wall (the puck never reaches it).
                if (y === 0 || !solid(i - W)) segs[i].push([x, y, x + 1, y]);
                if (y === H - 1 || !solid(i + W)) segs[i].push([x, y + 1, x + 1, y + 1]);
                if (x === 0 || !solid(i - 1)) segs[i].push([x, y, x, y + 1]);
                if (x === W - 1 || !solid(i + 1)) segs[i].push([x + 1, y, x + 1, y + 1]);
            } else if (k === 'bumper') segs[i].push(turnOf(t) ? [x, y, x + 1, y + 1] : [x, y + 1, x + 1, y]);   // 0 is /, 1 is \
            else if (k === 'target') targets.push({ id: 't' + i, cell: i, x: x + 0.5, y: y + 0.5, points: TILES.target.points });
            else if (k === 'portal') portals.push({ cell: i, x: x + 0.5, y: y + 0.5 });
            else if (k === 'mover') {
                // A moving target slides along its row between whatever is solid, as the maze's patrol walks its lane.
                const open = c => { const q = kinds[y * W + c]; return q !== 'wall' && q !== 'bumper'; };
                let a = x, b = x;
                while (a > 0 && open(a - 1)) a--;
                while (b < W - 1 && open(b + 1)) b++;
                movers.push({ id: 'm' + i, cell: i, y: y + 0.5, a: a + 0.5, b: b + 0.5, x0: x + 0.5, points: TILES.mover.points });
            }
        });
        // Each cell's nearby edges: its own and its eight neighbours'.
        const near = course.map((_, i) => {
            const x = i % W, y = Math.floor(i / W), out = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < W && cy < H) out.push(...segs[cy * W + cx]); }
            return out;
        });
        const moverX = (m, steps) => { const len = m.b - m.a; if (len <= 0) return m.a; const s = (steps * o.step * o.moverPace + (m.x0 - m.a)) % (2 * len); return m.a + (s <= len ? s : 2 * len - s); };
        return { course, kinds, near, targets, movers, portals: portals.length === 2 ? portals : [], moverX, tee: centre(teeCell(o), o), hole: centre(holeCell(o), o) };
    }

    // One shot, from a position `p` ({ x, y, t: steps so far, hit: {} }, changed in place). `rec`: keep the path.
    // Returns how it ended: { sunk, pit, gained, frames, events }.
    function fly(w, p, angle, power, o = PUCK, rec = false, maxSteps = Infinity) {
        const W = o.cols, H = o.rows, r = o.r, dt = o.step, pw = Math.max(o.minPower, Math.min(1, power));
        let x = p.x, y = p.y, vx = Math.cos(angle) * o.speed * pw, vy = Math.sin(angle) * o.speed * pw, cool = false, gained = 0, sunk = false, pit = false, n = 0;
        const from = { x, y }, frames = rec ? [[x, y]] : null, events = rec ? [] : null, cap = Math.min(maxSteps, Math.round(o.shotSeconds / dt));
        const note = (type, more) => { if (rec) events.push(Object.assign({ type, f: n, x, y }, more)); };
        // A puck that starts inside a portal does not go through it until it has left.
        for (const q of w.portals) if (Math.hypot(x - q.x, y - q.y) < o.portalR) cool = true;
        while (n < cap) {
            n++; p.t++;
            const ci = Math.max(0, Math.min(H - 1, Math.floor(y))) * W + Math.max(0, Math.min(W - 1, Math.floor(x))), kind = w.kinds[ci];
            let onBoost = false;
            if (kind === 'booster') { const d = DIRS[turnOf(w.course[ci])]; vx += d[0] * o.boost * dt; vy += d[1] * o.boost * dt; onBoost = true; }
            const k = Math.exp(-(kind === 'sand' ? o.sand : kind === 'ice' ? o.ice : o.drag) * dt);
            vx *= k; vy *= k;
            let sp = Math.hypot(vx, vy);
            if (sp > o.maxSpeed) { vx *= o.maxSpeed / sp; vy *= o.maxSpeed / sp; sp = o.maxSpeed; }
            x += vx * dt; y += vy * dt;
            // The field's edges, then the course's.
            let bounced = false;
            if (x < r) { x = r; if (vx < 0) { vx = -vx * o.rest; bounced = true; } }
            if (x > W - r) { x = W - r; if (vx > 0) { vx = -vx * o.rest; bounced = true; } }
            if (y < r) { y = r; if (vy < 0) { vy = -vy * o.rest; bounced = true; } }
            if (y > H - r) { y = H - r; if (vy > 0) { vy = -vy * o.rest; bounced = true; } }
            const cj = Math.max(0, Math.min(H - 1, Math.floor(y))) * W + Math.max(0, Math.min(W - 1, Math.floor(x)));
            for (const s of w.near[cj]) {
                const ex = s[2] - s[0], ey = s[3] - s[1], u = Math.max(0, Math.min(1, ((x - s[0]) * ex + (y - s[1]) * ey) / (ex * ex + ey * ey)));
                const qx = s[0] + ex * u, qy = s[1] + ey * u; let nx = x - qx, ny = y - qy; const d = Math.hypot(nx, ny);
                if (d >= r) continue;
                if (d > 1e-9) { nx /= d; ny /= d; } else { const l = Math.hypot(ex, ey); nx = -ey / l; ny = ex / l; }
                x = qx + nx * r; y = qy + ny * r;
                const vn = vx * nx + vy * ny;
                if (vn < 0) { vx -= (1 + o.rest) * vn * nx; vy -= (1 + o.rest) * vn * ny; bounced = true; }
            }
            if (bounced) note('bounce');
            // Portals: in one, out of the other, keeping its speed.
            if (w.portals.length) {
                const inA = Math.hypot(x - w.portals[0].x, y - w.portals[0].y) < o.portalR, inB = Math.hypot(x - w.portals[1].x, y - w.portals[1].y) < o.portalR;
                if (!inA && !inB) cool = false;
                else if (!cool) { const a = w.portals[inA ? 0 : 1], b = w.portals[inA ? 1 : 0]; note('portal'); x = b.x + (x - a.x); y = b.y + (y - a.y); cool = true; note('portal'); }
            }
            for (const t of w.targets) if (!p.hit[t.id] && Math.hypot(x - t.x, y - t.y) < r + o.targetR) { p.hit[t.id] = true; gained += t.points; note('target', { id: t.id, points: t.points }); }
            for (const m of w.movers) if (!p.hit[m.id] && Math.hypot(x - w.moverX(m, p.t), y - m.y) < r + o.targetR) { p.hit[m.id] = true; gained += m.points; note('target', { id: m.id, points: m.points }); }
            if (rec && n % 2 === 0) frames.push([x, y]);
            const here = w.kinds[Math.max(0, Math.min(H - 1, Math.floor(y))) * W + Math.max(0, Math.min(W - 1, Math.floor(x)))];
            if (here === 'pit') { pit = true; note('pit'); break; }
            sp = Math.hypot(vx, vy);
            if (Math.hypot(x - w.hole.x, y - w.hole.y) < o.holeR && sp < o.holeSpeed) { sunk = true; x = w.hole.x; y = w.hole.y; note('sunk'); break; }
            if (sp < o.stop && !onBoost) break;
        }
        if (rec && (frames.length === 0 || frames[frames.length - 1][0] !== x || frames[frames.length - 1][1] !== y)) frames.push([x, y]);
        // A pit gives the puck back where the shot was taken from.
        if (pit) { p.x = from.x; p.y = from.y; } else { p.x = x; p.y = y; }
        return { sunk, pit, gained, steps: n, frames, events };
    }

    // A run: `shoot(angle, power)` once a shot. A run that is out of shots before the hole scores nothing.
    function createRun(course, o = PUCK) {
        const w = world(course, o);
        const s = { x: w.tee.x, y: w.tee.y, t: 0, hit: {}, shots: 0, points: 0, over: false, finished: false, failed: null, log: [] };
        function shoot(angle, power) {
            if (s.over) return null;
            const from = { x: s.x, y: s.y }, t0 = s.t, f = fly(w, s, angle, power, o, true);
            s.shots++; s.points += f.gained;
            s.log.push({ angle, power: Math.max(o.minPower, Math.min(1, power)), from, to: { x: s.x, y: s.y }, gained: f.gained, sunk: f.sunk, pit: f.pit });
            if (f.sunk) { s.over = true; s.finished = true; s.points += HOLE_POINTS; }
            else if (s.shots >= o.limit) { s.over = true; s.failed = { type: 'shots', shot: s.shots }; }
            return { t0, frames: f.frames, events: f.events, sunk: f.sunk, pit: f.pit, gained: f.gained, from, to: { x: s.x, y: s.y } };
        }
        return { state: s, world: w, shoot };
    }
    const result = run => { const s = run.state; return { finished: s.finished, failed: s.failed, shots: s.shots, points: s.finished ? s.points : 0, hit: Object.assign({}, s.hit), log: s.log.map(l => Object.assign({}, l)) }; };
    function simulate(course, shots, o = PUCK) {
        const run = createRun(course, o);
        for (let i = 0; i < shots.length && !run.state.over; i++) run.shoot(shots[i].angle, shots[i].power);
        return result(run);
    }
    // The first part of a shot's path, for the aim line.
    function preview(w, s, angle, power, seconds, o = PUCK) {
        const p = { x: s.x, y: s.y, t: s.t, hit: Object.assign({}, s.hit) };
        return fly(w, p, angle, power, o, true, Math.round(seconds / o.step)).frames;
    }

    // The AI's choice of shot from where it is. `follow`: land where you landed ({ to, sunk }). Else its own line:
    // the most targets this shot, and the hole once nothing more is in reach or the shots are running out.
    function search(w, s, goal, par, o = PUCK) {
        const total = w.targets.length + w.movers.length, got = Object.keys(s.hit).length, late = s.shots + 1 >= Math.min(par, o.limit);
        const value = (angle, power) => {
            const p = { x: s.x, y: s.y, t: s.t, hit: Object.assign({}, s.hit) }, f = fly(w, p, angle, power, o);
            if (f.pit) return -100;
            const hits = Object.keys(p.hit).length - got, toHole = Math.hypot(p.x - w.hole.x, p.y - w.hole.y);
            if (goal) return f.sunk ? (goal.sunk ? 1000 : 400) : -10 * Math.hypot(p.x - goal.to.x, p.y - goal.to.y) + 2 * f.gained;
            if (f.sunk) return got + hits >= total || late ? 1000 + 30 * f.gained : 5 + 30 * f.gained;
            return 30 * f.gained - toHole;
        };
        let top = null;
        const tryOne = (angle, power) => { const v = value(angle, power); if (!top || v > top.v) top = { angle, power, v }; };
        for (let a = 0; a < o.angles; a++) for (const pw of o.powers) tryOne(a * 2 * Math.PI / o.angles - Math.PI, pw);
        const c = top, da = 2 * Math.PI / o.angles;
        for (const fa of [-0.5, -0.25, 0, 0.25, 0.5]) for (const fp of [-0.07, 0, 0.07]) if (fa || fp) tryOne(c.angle + fa * da, Math.max(o.minPower, Math.min(1, c.power + fp)));
        return top;
    }
    // How many of your shots the AI is shown: all of a clear; the first half of a run that ran out of shots.
    const shownShots = yours => (yours.finished ? yours.log.length : Math.floor(yours.log.length / 2));
    // One attempt by the AI. Stages 1 and 2 copy your shots (your own shot where it stands where you stood, else the
    // shot that lands where yours did) and then, past what you showed, find their own; stage 3 finds its own from the tee.
    function aiShots(course, yours, a, o = PUCK) {
        const lim = yours.finished ? Math.min(o.limit, yours.shots + o.over) : o.limit, run = createRun(course, lim === o.limit ? o : Object.assign({}, o, { limit: lim })), s = run.state, rand = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), st = stage(m, o);
        const scale = (1 - m) * o.tryGain ** (a.attempt || 0), gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.87, shown = shownShots(yours), par = yours.finished ? yours.shots : o.limit, shots = [], traces = [];
        while (!s.over) {
            const i = s.shots, mine = st < 3 && i < shown ? yours.log[i] : null;
            let pick;
            if (mine && Math.hypot(mine.from.x - s.x, mine.from.y - s.y) < o.near) pick = { angle: mine.angle, power: mine.power };
            else pick = search(run.world, s, mine ? { to: mine.to, sunk: mine.sunk } : null, Math.min(par, lim), o);
            const shot = { angle: pick.angle + gauss() * o.aimErr * scale, power: Math.max(o.minPower, Math.min(1, pick.power * (1 + gauss() * o.powErr * scale))), own: !mine };
            shots.push(shot); traces.push(run.shoot(shot.angle, shot.power));
        }
        return { shots, traces, limit: lim, result: result(run) };
    }
    // Can anyone clear it? A steady hand playing its own line, with no error.
    function clearable(course, o = PUCK) {
        const run = createRun(course, o), s = run.state;
        while (!s.over) { const pick = search(run.world, s, null, o.limit, o); run.shoot(pick.angle, pick.power); }
        return s.finished;
    }
    function canHandOver(course, yours, m, o = PUCK) {
        if (!yours || !yours.log.length) return { ok: false, why: 'untried' };
        if (yours.finished) return { ok: true, why: 'cleared' };
        if (stage(m, o) < 2) return { ok: false, why: 'stage' };
        return clearable(course, o) ? { ok: true, why: 'beyond' } : { ok: false, why: 'impossible' };
    }
    // What it pays: Marks for the points it got, times a bonus for each shot under par (a cut for each over).
    function marksFor(res, par, o = PUCK) {
        if (!res || !res.finished) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, 1 + o.perShot * ((par > 0 ? par : res.shots) - res.shots)));
        return Math.round(res.points * o.marks * bonus);
    }
    // The hand-over: up to `tries` attempts, each steadier than the last. The score is the attempt that pays most.
    function handOver(course, yours, a, o = PUCK) {
        const can = canHandOver(course, yours, a.mastery || 0, o);
        if (!can.ok) return { attempts: [], score: null, impossible: can.why === 'impossible', why: can.why };
        const par = yours.finished ? yours.shots : a.par || 0, attempts = [];
        let top = null;
        for (let k = 0; k < (a.tries || o.tries); k++) {
            const at = aiShots(course, yours, { seed: (a.seed + k * 7919) >>> 0, mastery: a.mastery, attempt: k }, o);
            attempts.push(at);
            if (at.result.finished) { if (!top || marksFor(at.result, par, o) > marksFor(top, par, o)) top = at.result; if (k >= 1) break; }
        }
        return { attempts, score: top, par };
    }

    return { PUCK, TILES, ORDER, DIRS, HOLE_POINTS, palette, kindOf, turnOf, tileOf, size, teeCell, holeCell, centre, emptyCourse, cleanCourse, points, mastery, stage, rng, world, fly, createRun, result, simulate, preview, search, shownShots, aiShots, clearable, canHandOver, marksFor, handOver };
});
