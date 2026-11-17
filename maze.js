// maze.js — Evals' second kind of course (design/evals-course.md): a top-down grid maze. PROTOTYPE.
// You put walls and hazards on a grid, walk it yourself from the start (bottom left) to the exit (top right), then the
// AI walks it. Time goes in ticks: each tick the runner steps one cell in the direction held, or stands.
// Hazards keep their own rhythm: a trap is live half the time, a patrol walks its row back and forth.
// Pure and deterministic: no DOM, no clock, no Math.random. window.Maze / require(). EVERY NUMBER IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Maze = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAZE = {
        cols: 7, rows: 9,
        tick: 0.16,             // seconds a tick
        trapPeriod: 8, trapOn: 4,   // a trap: live for trapOn ticks of every trapPeriod
        patrolPace: 2,          // a patrol steps a cell every this many ticks
        horizon: 600,           // ticks a run may last
        shield: 6,              // ticks nothing can catch you after a second life is spent
        // The AI: how often it misjudges a hazard's moment at first (it goes when it should have waited), less with
        // mastery, half as often at a step for each time it has failed there; and how much of your own waiting it copies.
        err: 0.3, tries: 4, masteryRuns: 6, stage2: 0.35, stage3: 0.75, unseen: 2,
        marks: 10, bonusMin: 0.5, bonusMax: 2,
    };
    // What can go in a cell. `points`: what getting past it is worth. `needs`: skills learned before you are given it.
    const TILES = {
        wall: { name: 'Wall', points: 0, needs: 0 },
        trap: { name: 'Trap', points: 1, needs: 0 },
        patrol: { name: 'Patrol', points: 2, needs: 1 },
        key: { name: 'Key', points: 0, needs: 2, max: 1 },
        door: { name: 'Door', points: 2, needs: 2, max: 1 },
    };
    const ORDER = ['wall', 'trap', 'patrol', 'key', 'door'];
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left
    const palette = skills => ORDER.filter(k => TILES[k].needs <= skills);
    const size = (o = MAZE) => o.cols * o.rows;
    const startCell = (o = MAZE) => (o.rows - 1) * o.cols;
    const exitCell = (o = MAZE) => o.cols - 1;
    const emptyMaze = (o = MAZE) => Array.from({ length: size(o) }, () => null);
    function cleanMaze(m, o = MAZE) {
        const count = {};
        return Array.from({ length: size(o) }, (_, i) => { const k = Array.isArray(m) ? m[i] : null; if (!TILES[k] || i === startCell(o) || i === exitCell(o)) return null; count[k] = (count[k] || 0) + 1; return TILES[k].max && count[k] > TILES[k].max ? null : k; });
    }
    const points = maze => maze.reduce((n, k) => n + (k ? TILES[k].points : 0), 0);
    const mastery = (runs, skills = 0, o = MAZE) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);
    const stage = (m, o = MAZE) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);

    // The maze's moving parts, worked out once: each patrol's lane, and helpers that say what is dangerous when.
    function world(maze, o = MAZE) {
        const W = o.cols, patrols = [];
        maze.forEach((k, i) => {
            if (k !== 'patrol') return;
            const y = Math.floor(i / W), x0 = i % W; let a = x0, b = x0;
            const open = x => { const t = maze[y * W + x]; return t !== 'wall' && t !== 'door'; };
            while (a > 0 && open(a - 1)) a--;
            while (b < W - 1 && open(b + 1)) b++;
            patrols.push({ id: patrols.length, cell: i, y, a, b, x0 });
        });
        const patrolX = (p, n) => { const len = p.b - p.a; if (!len) return p.a; const s = (Math.floor(n / o.patrolPace) + (p.x0 - p.a)) % (2 * len); return p.a + (s <= len ? s : 2 * len - s); };
        const patrolCell = (p, n) => p.y * W + patrolX(p, n);
        const trapLive = (i, n) => maze[i] === 'trap' && ((n + (i % W) * 3 + Math.floor(i / W) * 5) % o.trapPeriod) < o.trapOn;
        // Is it deadly to be in `to` at tick n + 1, having been in `from` at tick n?
        const deadly = (from, to, n) => {
            if (trapLive(to, n + 1)) return 'trap';
            for (const p of patrols) { const now = patrolCell(p, n), next = patrolCell(p, n + 1); if (next === to || (now === to && next === from && from !== to)) return 'patrol'; }
            return null;
        };
        const inLane = (p, i) => Math.floor(i / W) === p.y && i % W >= p.a && i % W <= p.b;
        const hazardAt = i => maze[i] === 'trap' || patrols.some(p => inLane(p, i));
        return { patrols, patrolCell, trapLive, deadly, inLane, hazardAt };
    }
    const step = (i, d, o = MAZE) => { const x = (i % o.cols) + DIRS[d][0], y = Math.floor(i / o.cols) + DIRS[d][1]; return x < 0 || y < 0 || x >= o.cols || y >= o.rows ? -1 : y * o.cols + x; };

    // A run: `act(d)` once a tick with the direction held (0 to 3, or -1 to stand).
    function createRun(maze, o = MAZE) {
        const w = world(maze, o);
        const s = { n: 0, lives: o.lives || 0, shield: 0, spared: null, cell: startCell(o), key: false, over: false, finished: false, failed: null, route: [startCell(o)], at: [0], acts: [], done: {}, points: 0, in: {} };
        const clear = (id, pts) => { if (!s.done[id]) { s.done[id] = true; s.points += pts; } };
        function act(d) {
            if (s.over) return;
            const from = s.cell; let to = from;
            if (d >= 0) { const t = step(from, d, o); if (t >= 0 && maze[t] !== 'wall' && (maze[t] !== 'door' || s.key)) to = t; }
            s.acts.push(to === from ? -1 : d);
            // A second life (course-tree.js, yours only): the first catch is survived, and nothing can catch you for a moment.
            let dead = s.shield > 0 ? null : w.deadly(from, to, s.n);
            if (s.shield > 0) s.shield--;
            if (dead && s.lives > 0) { s.lives--; s.shield = o.shield; s.spared = { type: dead, tick: s.n + 1 }; dead = null; }
            s.n++; s.cell = to;
            if (to !== from) { s.route.push(to); s.at.push(s.n); }
            if (dead) { s.over = true; s.failed = { type: dead, cell: to, tick: s.n, step: s.route.length - 1 }; return; }
            if (to !== from) {
                if (maze[from] === 'trap') clear('t' + from, TILES.trap.points);
                if (maze[to] === 'door') clear('d' + to, TILES.door.points);
                if (maze[to] === 'key') s.key = true;
                for (const p of w.patrols) { const was = w.inLane(p, from), is = w.inLane(p, to); if (is) s.in[p.id] = true; if (was && !is && s.in[p.id]) clear('p' + p.id, TILES.patrol.points); }
            }
            if (to === exitCell(o)) { s.over = true; s.finished = true; for (const p of w.patrols) if (s.in[p.id]) clear('p' + p.id, TILES.patrol.points); }
            else if (s.n >= o.horizon) { s.over = true; s.failed = { type: 'time', cell: to, tick: s.n, step: s.route.length - 1 }; }
        }
        return { state: s, world: w, act };
    }
    const result = (run, o = MAZE) => { const s = run.state; return { finished: s.finished, failed: s.failed, ticks: s.n, time: s.n * o.tick, points: s.points, route: s.route.slice(), at: s.at.slice(), acts: s.acts.slice() }; };
    function simulate(maze, acts, o = MAZE) {
        const run = createRun(maze, o);
        for (let i = 0; i < acts.length && !run.state.over; i++) run.act(acts[i]);
        return result(run, o);
    }
    const dirOf = (from, to, o = MAZE) => DIRS.findIndex(([dx, dy]) => (to % o.cols) - (from % o.cols) === dx && Math.floor(to / o.cols) - Math.floor(from / o.cols) === dy);

    // The shortest way from a cell to the exit (walls, and the door without the key, in the way; hazards are not).
    function pathFrom(maze, cell, key, o = MAZE) {
        const start = cell * 2 + (key ? 1 : 0), prev = new Map([[start, -1]]), queue = [start];
        for (let q = 0; q < queue.length; q++) {
            const cur = queue[q], i = cur >> 1, k = cur & 1;
            if (i === exitCell(o)) { const out = []; for (let c = cur; c !== -1; c = prev.get(c)) out.unshift(c >> 1); return out; }
            for (let d = 0; d < 4; d++) {
                const t = step(i, d, o);
                if (t < 0 || maze[t] === 'wall' || (maze[t] === 'door' && !k)) continue;
                const nk = t * 2 + (k || maze[t] === 'key' ? 1 : 0);
                if (!prev.has(nk)) { prev.set(nk, cur); queue.push(nk); }
            }
        }
        return null;
    }
    // For a route (a list of cells, each next to the last): from which (step, tick) can the exit still be reached
    // safely, by standing or stepping on along it. `go(i, n)`: is stepping on from step i at tick n safe now and
    // still a way through?
    function plan(maze, route, o = MAZE) {
        const w = world(maze, o), last = route.length - 1, T = o.horizon, reach = route.map(() => new Uint8Array(T + 2));
        for (let n = T; n >= 0; n--) for (let i = last; i >= 0; i--) {
            if (i === last) { reach[i][n] = 1; continue; }
            const stepOk = !w.deadly(route[i], route[i + 1], n) && reach[i + 1][n + 1], standOk = !w.deadly(route[i], route[i], n) && reach[i][n + 1];
            reach[i][n] = stepOk || standOk ? 1 : 0;
        }
        const go = (i, n) => i < last && !w.deadly(route[i], route[i + 1], n) && !!reach[i + 1][n + 1];
        const stand = (i, n) => !w.deadly(route[i], route[i], n) && !!reach[i][n + 1];
        return { w, reach, go, stand, possible: !!reach[0][0] };
    }
    // The route the AI is given after your run: yours if you finished; else yours up to the step before you fell, and
    // the shortest way on from there. `shown`: how many of its steps you showed it. null: there is no way through.
    function routeFor(maze, yours, o = MAZE) {
        if (yours.finished) return { route: yours.route.slice(), shown: yours.route.length - 1 };
        const kept = yours.route.slice(0, Math.max(1, yours.failed && yours.failed.type !== 'time' ? yours.failed.step : yours.route.length));
        const key = kept.some(c => maze[c] === 'key'), rest = pathFrom(maze, kept[kept.length - 1], key, o);
        return rest ? { route: [...kept, ...rest.slice(1)], shown: kept.length - 1 } : null;
    }
    function canHandOver(maze, yours, m, o = MAZE) {
        if (!yours) return { ok: false, why: 'untried' };
        if (yours.finished) return { ok: true, why: 'cleared' };
        if (stage(m, o) < 2) return { ok: false, why: 'stage' };
        const r = routeFor(maze, yours, o);
        return r && plan(maze, r.route, o).possible ? { ok: true, why: 'beyond' } : { ok: false, why: 'impossible' };
    }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    // One attempt by the AI along a route. It knows the safe moment to step (the plan), stands about where you stood
    // by as much as it has not yet mastered, and at a hazard may misjudge the moment and go when it should have waited.
    function aiActs(maze, r, yourWaits, a, o = MAZE) {
        const p = a.plan || plan(maze, r.route, o), rand = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), acts = [], last = r.route.length - 1;
        let n = 0;
        for (let i = 0; i < last && n < o.horizon; i++) {
            const hazard = p.w.hazardAt(r.route[i + 1]) || p.w.hazardAt(r.route[i]);
            const pErr = hazard ? Math.min(0.9, o.err * (1 - m) * (i >= r.shown ? a.unseen || 1 : 1) * 0.5 ** ((a.fixes && a.fixes[i]) || 0)) : 0;
            // Misjudging (`wrong`): it steps at a bad moment. If now is a bad moment it goes now; if now is a good one
            // it dithers (up to `dither` ticks) until the moment has passed, and goes then.
            let wrong = rand() < pErr, dither = o.trapPeriod, linger = Math.round((1 - m) * ((yourWaits && yourWaits[i]) || 0));
            for (;;) {
                if (n >= o.horizon) break;
                const safeGo = p.go(i, n), canStand = p.stand(i, n);
                if (linger > 0 && canStand) { linger--; acts.push(-1); n++; continue; }
                if (wrong && safeGo && canStand && dither > 0) { dither--; acts.push(-1); n++; continue; }
                if (safeGo || wrong || !canStand) { acts.push(dirOf(r.route[i], r.route[i + 1], o)); n++; break; }
                acts.push(-1); n++;
            }
        }
        return acts;
    }
    // The hand-over: up to `tries` attempts, each learning from the step it failed at. The score is its best finish.
    function handOver(maze, yours, a, o = MAZE) {
        const r = routeFor(maze, yours, o), p = r && plan(maze, r.route, o);
        if (!r || (!p.possible && !yours.finished)) return { attempts: [], score: null, impossible: true };
        const waits = yours.at.map((t, i) => (i ? t - yours.at[i - 1] - 1 : 0)).slice(1), fixes = {}, attempts = [];
        const unseen = stage(a.mastery || 0, o) >= 3 ? 1 : o.unseen;
        let top = null;
        for (let k = 0; k < (a.tries || o.tries); k++) {
            const acts = aiActs(maze, r, waits, { seed: (a.seed + k * 7919) >>> 0, mastery: a.mastery, fixes, unseen, plan: p }, o), res = simulate(maze, acts, o);
            attempts.push({ acts, result: res });
            if (res.finished) { if (!top || res.ticks < top.ticks) top = res; if (k >= 1) break; }
            else if (res.failed) { const at = Math.max(0, res.failed.step - 1); fixes[at] = (fixes[at] || 0) + 1; }
        }
        return { attempts, score: top, route: r };
    }
    // What it pays: Marks for the points it got past, times how its time compares with yours (or its own best).
    function marksFor(res, refTime, o = MAZE) {
        if (!res || !res.finished) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, refTime > 0 ? refTime / res.time : 1));
        return Math.round(res.points * o.marks * bonus);
    }

    return { MAZE, TILES, ORDER, DIRS, palette, size, startCell, exitCell, emptyMaze, cleanMaze, points, mastery, stage, world, step, createRun, result, simulate, dirOf, pathFrom, plan, routeFor, canHandOver, aiActs, handOver, marksFor, rng };
});
