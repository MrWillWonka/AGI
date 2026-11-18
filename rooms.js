// rooms.js — Evals' third kind of course (design/evals-course.md): a platformer room. PROTOTYPE.
// A room seen from the side, 12 tiles wide and 7 high, with a floor. You furnish it (blocks, spikes, saws, springs,
// pits in the floor), run and jump through it yourself from the bottom left to the flag on the ledge at the top
// right, then the AI does. Controls: left, right, jump.
// Pure and deterministic: no DOM, no clock, no Math.random. window.Rooms / require(). EVERY NUMBER IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Rooms = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ROOM = {
        cols: 12, rows: 7,
        step: 1 / 60,
        speed: 5, gravity: 22, jump: 9.6, spring: 14.5,   // a jump clears two tiles, a spring nearly five
        w: 0.6, h: 0.8,          // the runner's box
        coyote: 5, buffer: 6,    // steps of grace: a jump just after leaving a ledge, or pressed just before landing
        sawReach: 1.5, sawPeriod: 150, sawR: 0.42,
        boost: 1.6, boostSteps: 75,   // a booster (from the track, the owner's pick, 2026-11-16): this much faster for this long
        spikeTop: 0.55, spikeIn: 0.2,   // a spike fills its tile below this far from the top, and this far in from each side
        near: 3,                 // a hazard counts as got past when you cross its middle within this many tiles of it
        horizon: 60 * 45, stuck: 60 * 8,
        immuneSteps: 45,         // steps nothing can stop a run after it has passed through a hazard unharmed (the AI's cheat)
        // The AI: how far off (tiles) its take-off is at first, how often it misjudges a saw, both less with mastery
        // and halved at a jump each time it has failed there; and how much of your standing about it copies.
        sigma: 0.42, err: 0.35, tries: 4, masteryRuns: 6, stage2: 0.35, stage3: 0.75, unseen: 2,
        marks: 10, bonusMin: 0.5, bonusMax: 2,
    };
    // What can be placed. `points`: what getting past it is worth. `needs`: skills learned before you are given it.
    const TILES = {
        block: { name: 'Block', points: 0, needs: 0 },
        spike: { name: 'Spike', points: 1, needs: 0 },
        pit: { name: 'Pit', points: 1, needs: 1, floor: true },
        saw: { name: 'Saw', points: 2, needs: 2 },
        spring: { name: 'Spring', points: 0, needs: 3, ability: true },
        boost: { name: 'Booster', points: 0, needs: 3, ability: true },
    };
    const ORDER = ['block', 'spike', 'pit', 'saw', 'spring', 'boost'];
    const palette = skills => ORDER.filter(k => TILES[k].needs <= skills);
    const size = (o = ROOM) => o.cols * o.rows;
    const id = (cx, cy, o = ROOM) => cy * o.cols + cx;
    const startCell = (o = ROOM) => id(0, o.rows - 2, o);
    const goalTile = (o = ROOM) => id(o.cols - 1, 2, o);      // the ledge you finish standing on
    const fixed = (i, o = ROOM) => i === startCell(o) || i === goalTile(o) || i === goalTile(o) - 1 || i === goalTile(o) - o.cols || i === startCell(o) + 1;
    // Where a tile may go: pits in the floor row only, everything else above it; nothing on the start, the flag or its ledge.
    const allowed = (kind, i, o = ROOM) => !!TILES[kind] && i >= 0 && i < size(o) && !fixed(i, o) && (Math.floor(i / o.cols) === o.rows - 1) === !!TILES[kind].floor;
    const emptyRoom = (o = ROOM) => Array.from({ length: size(o) }, () => null);
    const cleanRoom = (r, o = ROOM) => Array.from({ length: size(o) }, (_, i) => (Array.isArray(r) && allowed(r[i], i, o) ? r[i] : null));
    const points = room => room.reduce((n, k) => n + (k ? TILES[k].points : 0), 0);
    const mastery = (runs, skills = 0, o = ROOM) => 1 - Math.exp(-(Math.max(0, runs) + 0.5 * Math.max(0, skills)) / o.masteryRuns);
    const stage = (m, o = ROOM) => (m >= o.stage3 ? 3 : m >= o.stage2 ? 2 : 1);

    // What is at a tile: 'edge' past the side walls, 'ground' for the floor (and under it) unless a pit, the ledge, or what you placed.
    function at(room, cx, cy, o = ROOM) {
        if (cx < 0 || cx >= o.cols) return 'edge';
        if (cy < 0) return null;
        if (cy >= o.rows - 1) return room[id(cx, o.rows - 1, o)] === 'pit' ? null : 'ground';
        if (cy === 2 && cx >= o.cols - 2) return 'block';
        return room[id(cx, cy, o)];
    }
    const solidKind = k => k === 'edge' || k === 'ground' || k === 'block' || k === 'spring';
    const solid = (room, cx, cy, o = ROOM) => solidKind(at(room, cx, cy, o));
    const hazards = (room, o = ROOM) => room.map((k, i) => (k === 'spike' || k === 'saw' || k === 'pit' ? { kind: k, i, cx: i % o.cols, cy: Math.floor(i / o.cols) } : null)).filter(Boolean);
    const sawAt = (h, n, o = ROOM) => ({ x: h.cx + 0.5 + o.sawReach * Math.sin(2 * Math.PI * n / o.sawPeriod + h.cx * 1.3), y: h.cy + 0.5 });

    // A run. `step({ dir: -1 | 0 | 1, jump: bool })` once a physics step. y grows downward; (x, y) is the middle of the feet.
    function createRun(room, o = ROOM, from) {
        const hz = hazards(room, o), saws = hz.filter(h => h.kind === 'saw');
        const s = from ? JSON.parse(JSON.stringify(from)) : { n: 0, x: 0.5, y: o.rows - 1, vy: 0, ground: true, coy: 0, buf: 0, held: false, over: false, finished: false, failed: null, points: 0, done: {}, stood: [], bounced: 0, boost: -1, immune: o.immune || 0, safe: 0, spared: null };
        const under = (x, y) => { const cy = Math.round(y), c = Math.floor(x); if (solid(room, c, cy, o)) return id(c, cy, o); for (const e of [Math.floor(x - o.w / 2 + 0.001), Math.floor(x + o.w / 2 - 0.001)]) if (solid(room, e, cy, o)) return id(Math.max(0, Math.min(o.cols - 1, e)), cy, o); return -1; };
        const stand = t => { if (t >= 0 && (!s.stood.length || s.stood[s.stood.length - 1].t !== t)) s.stood.push({ t, n: s.n }); };
        const fail = type => { s.over = true; s.failed = { type, x: s.x, y: s.y, n: s.n }; };
        // A spike or a saw: it ends the run, unless the run is immune (`o.immune`, the AI's cheat): then the first one is
        // passed through, and nothing can stop it for `immuneSteps` after.
        const kill = type => { if (s.safe > 0) return false; if (s.immune > 0) { s.immune--; s.safe = o.immuneSteps; s.spared = { type, n: s.n, x: s.x, y: s.y }; return false; } fail(type); return true; };
        if (!from) stand(under(s.x, s.y));
        function step(input) {
            if (s.over) return;
            const dt = o.step, x0 = s.x;
            s.n++;
            if (input.jump && !s.held) s.buf = o.buffer;
            s.held = !!input.jump;
            if (s.buf > 0 && (s.ground || s.coy > 0)) { s.vy = -o.jump; s.ground = false; s.coy = 0; s.buf = 0; }
            if (s.buf > 0) s.buf--;
            if (s.coy > 0) s.coy--;
            // Sideways, stopped by anything solid beside the box.
            // A booster is a pad in the tile you are standing in: run over it and you are faster for a while.
            if (s.ground && at(room, Math.floor(s.x), Math.floor(s.y - 0.01), o) === 'boost') s.boost = s.n + o.boostSteps;
            let nx = s.x + (input.dir || 0) * o.speed * (s.n <= s.boost ? o.boost : 1) * dt;
            if (input.dir) {
                const lead = Math.floor(nx + (input.dir > 0 ? o.w / 2 : -o.w / 2));
                for (let cy = Math.floor(s.y - o.h + 0.001); cy <= Math.floor(s.y - 0.001); cy++) if (solid(room, lead, cy, o)) { nx = input.dir > 0 ? lead - o.w / 2 - 0.0005 : lead + 1 + o.w / 2 + 0.0005; break; }
            }
            s.x = nx;
            // Up and down.
            s.vy += o.gravity * dt;
            let ny = s.y + s.vy * dt;
            const a = Math.floor(s.x - o.w / 2 + 0.001), b = Math.floor(s.x + o.w / 2 - 0.001);
            if (s.vy >= 0) {
                const cy = Math.floor(ny + 1e-9); let hit = false;
                if (s.y <= cy + 1e-6) for (let cx = a; cx <= b; cx++) if (solid(room, cx, cy, o)) hit = true;
                if (hit) {
                    ny = cy;
                    const t = under(s.x, ny), k = t >= 0 ? at(room, t % o.cols, cy, o) : null;
                    if (k === 'spring') { s.vy = -o.spring; s.ground = false; s.coy = 0; s.bounced++; s.y = ny; stand(t); s.stood[s.stood.length - 1].spring = true; }
                    else { s.vy = 0; if (!s.ground) s.coy = 0; s.ground = true; s.coy = o.coyote; s.y = ny; stand(t); }
                } else { s.ground = false; s.y = ny; }
            } else {
                const cy = Math.floor(ny - o.h);
                let bump = false;
                for (let cx = a; cx <= b; cx++) if (solid(room, cx, cy, o)) bump = true;
                if (bump) { ny = cy + 1 + o.h + 0.0005; s.vy = 0; }
                s.ground = false; s.y = ny;
            }
            // What kills, and what has been got past.
            for (let cy = Math.floor(s.y - o.h + 0.001); cy <= Math.floor(s.y - 0.001); cy++) for (let cx = a; cx <= b; cx++) if (at(room, cx, cy, o) === 'spike' && s.y > cy + o.spikeTop && s.x + o.w / 2 > cx + o.spikeIn && s.x - o.w / 2 < cx + 1 - o.spikeIn) { if (kill('spike')) return; }
            for (const h of saws) { const p = sawAt(h, s.n, o); if (Math.hypot(p.x - s.x, p.y - (s.y - o.h / 2)) < o.sawR + 0.3) { if (kill('saw')) return; } }
            if (s.safe > 0) s.safe--;
            if (s.y > o.rows + 0.6) return fail('pit');
            for (const h of hz) { const mid = h.cx + 0.5; if (!s.done[h.i] && (x0 - mid) * (s.x - mid) <= 0 && x0 !== s.x && Math.abs(s.y - (h.cy + (h.kind === 'pit' ? 0 : 1))) <= o.near) { s.done[h.i] = true; s.points += TILES[h.kind].points; } }
            if (s.ground && under(s.x, s.y) === goalTile(o)) { s.over = true; s.finished = true; }
            else if (s.n >= o.horizon) fail('time');
        }
        return { state: s, step, under: () => under(s.x, s.y), saws };
    }
    const result = (run, o = ROOM) => { const s = run.state; return { finished: s.finished, failed: s.failed, steps: s.n, time: s.n * o.step, points: s.points, stood: s.stood.map(e => ({ ...e })) }; };
    function simulate(room, inputs, o = ROOM) {
        const run = createRun(room, o);
        for (let i = 0; i < inputs.length && !run.state.over; i++) run.step(inputs[i]);
        return result(run, o);
    }

    // The tiles you can stand on (or bounce off): solid, with room above, no spike on top.
    function nodes(room, o = ROOM) {
        const out = [];
        for (let cy = 1; cy < o.rows; cy++) for (let cx = 0; cx < o.cols; cx++) if (solid(room, cx, cy, o) && !solid(room, cx, cy - 1, o) && at(room, cx, cy - 1, o) !== 'spike') out.push(id(cx, cy, o));
        return out;
    }
    // The controller both the planner and the AI use: what to press this step to get from tile A to tile B.
    // `v`: { jump, from: 'edge' | 'mid' }; `mem`: { jumped }; `eps`: how far off (tiles) the take-off is.
    function drive(s, A, B, v, mem, eps, o = ROOM) {
        const ax = A % o.cols, bx = B % o.cols, tx = bx + 0.5 + (mem.jumped ? Math.max(-0.95, Math.min(0.95, (eps || 0) * 1.6)) : 0), toward = x => (Math.abs(x - s.x) < 0.05 ? 0 : x > s.x ? 1 : -1);
        if (s.ground && v.jump && !mem.jumped) {
            const side = bx > ax ? 1 : bx < ax ? -1 : 0;
            const take = (v.from === 'mid' || !side ? ax + 0.5 : side > 0 ? ax + 1 - 0.34 : ax + 0.34) + (eps || 0) * (side || 1);
            if (Math.abs(take - s.x) < 0.07 || (side > 0 && s.x > take) || (side < 0 && s.x < take)) { mem.jumped = true; return { dir: side, jump: true }; }
            return { dir: toward(take), jump: false };
        }
        let dir = toward(tx);
        const by = Math.floor(B / o.cols);
        // Below the top of the tile it is going up to, it keeps out from under it (and the tiles joined to it on its side).
        if (dir && !s.ground && mem.room && s.y > by + 0.05) {
            let edgeCol = bx; while (solid(mem.room, edgeCol - dir, by, o) && edgeCol - dir >= 0 && edgeCol - dir < o.cols && (dir > 0 ? edgeCol - dir > Math.floor(s.x) : edgeCol - dir < Math.floor(s.x))) edgeCol -= dir;
            const limit = dir > 0 ? edgeCol - o.w / 2 - 0.03 : edgeCol + 1 + o.w / 2 + 0.03;
            if (dir > 0 ? s.x + o.speed * o.step > limit && s.x <= limit + 0.2 : s.x - o.speed * o.step < limit && s.x >= limit - 0.2) dir = 0;
        }
        return { dir, jump: false };
    }
    // Can tile A be left for tile B with nothing going wrong (saws left out: their moment is judged on the day)?
    // Returns the way that works ({ jump, from }) or null. Kept in `cache`.
    function edge(room, A, B, cache, o = ROOM) {
        const key = A * 1000 + B;
        if (cache.has(key)) return cache.get(key);
        const ax = A % o.cols, ay = Math.floor(A / o.cols), bx = B % o.cols, by = Math.floor(B / o.cols), spring = at(room, ax, ay, o) === 'spring';
        let found = null;
        const dry = room.map(k => (k === 'saw' ? null : k));
        const ways = spring ? [{ jump: false, from: 'mid' }] : by === ay && Math.abs(bx - ax) === 1 ? [{ jump: false, from: 'edge' }] : [{ jump: false, from: 'edge' }, { jump: true, from: 'edge' }, { jump: true, from: 'mid' }];
        if (A !== B && Math.abs(bx - ax) <= 6 && by - ay <= 6 && ay - by <= (spring ? 5 : 2)) for (const v of ways) {
            const run = createRun(dry, o), s = run.state, mem = { jumped: false, room };
            s.x = ax + 0.5; s.y = ay; s.stood = [{ t: A, n: 0 }];
            if (spring) { s.vy = -o.spring; s.ground = false; }
            const want = at(room, bx, by, o) === 'spring';
            for (let k = 0; k < 170 && !s.over; k++) {
                run.step(drive(s, A, B, v, mem, 0, o));
                const last = s.stood[s.stood.length - 1];
                if (last.t === B && (s.ground || want)) { found = v; break; }
                if (last.t !== A && last.t !== B) break;   // came down somewhere else
            }
            if (s.finished && B === goalTile(o)) found = v;
            if (found) break;
        }
        cache.set(key, found);
        return found;
    }
    // The fewest moves from a tile to the flag: a list of tiles, or null.
    function pathFrom(room, from, cache = new Map(), o = ROOM) {
        const all = nodes(room, o), prev = new Map([[from, -1]]), queue = [from], goal = goalTile(o);
        for (let q = 0; q < queue.length; q++) {
            const cur = queue[q];
            if (cur === goal) { const out = []; for (let c = cur; c !== -1; c = prev.get(c)) out.unshift(c); return out; }
            for (const nb of all) if (!prev.has(nb) && edge(room, cur, nb, cache, o)) { prev.set(nb, cur); queue.push(nb); }
        }
        return null;
    }
    // The route the AI is given after your run: the tiles you stood on (joined up where it cannot copy a move of
    // yours), to the flag if you finished; else to where you last stood safely, and the fewest moves on from there.
    function routeFor(room, yours, cache = new Map(), o = ROOM) {
        const tiles = yours.stood.map(e => e.t).filter((t, i, arr) => t >= 0 && t !== arr[i - 1]);
        const kept = yours.finished ? tiles : tiles.slice(0, Math.max(1, tiles.length - (yours.failed && yours.failed.type !== 'time' ? 0 : 0)));
        const route = [kept[0]];
        for (let i = 1; i < kept.length; i++) {
            const a = route[route.length - 1];
            if (edge(room, a, kept[i], cache, o)) route.push(kept[i]);
            else { const via = pathBetween(room, a, kept[i], cache, o); if (via) route.push(...via.slice(1)); }
        }
        const shown = route.length - 1;
        if (route[route.length - 1] !== goalTile(o)) { const rest = pathFrom(room, route[route.length - 1], cache, o); if (!rest) return null; route.push(...rest.slice(1)); }
        return { route, shown: yours.finished ? route.length - 1 : shown };
    }
    function pathBetween(room, from, to, cache, o = ROOM) {
        const all = nodes(room, o), prev = new Map([[from, -1]]), queue = [from];
        for (let q = 0; q < queue.length && q < 200; q++) {
            const cur = queue[q];
            if (cur === to) { const out = []; for (let c = cur; c !== -1; c = prev.get(c)) out.unshift(c); return out; }
            for (const nb of all) if (!prev.has(nb) && edge(room, cur, nb, cache, o)) { prev.set(nb, cur); queue.push(nb); }
        }
        return null;
    }
    function canHandOver(room, yours, m, o = ROOM) {
        if (!yours) return { ok: false, why: 'untried' };
        if (yours.finished) return { ok: true, why: 'cleared' };
        if (stage(m, o) < 2) return { ok: false, why: 'stage' };
        return routeFor(room, yours, new Map(), o) ? { ok: true, why: 'beyond' } : { ok: false, why: 'impossible' };
    }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const bell = r => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); };

    // One attempt by the AI along a route of tiles. Returns the inputs it pressed, step by step, and where it failed.
    function aiInputs(room, r, dwell, a, o = ROOM) {
        const cache = a.cache || new Map(), rand = rng(a.seed), m = Math.max(0, Math.min(1, a.mastery || 0)), run = createRun(room, o), s = run.state, inputs = [];
        let route = r.route.slice(), shown = r.shown, i = 0, failedAt = null;
        const hasSaw = run.saws.length > 0;
        while (!s.over && i < route.length - 1) {
            const A = route[i], B = route[i + 1], v = edge(room, A, B, cache, o);
            if (!v) break;
            const key = A + '>' + B, fix = (a.fixes && a.fixes[key]) || 0, scale = (1 - m) * (i >= shown ? a.unseen || 1 : 1) * 0.5 ** fix;
            const eps = v.jump ? o.sigma * scale * bell(rand) : 0, wrong = rand() < o.err * scale, mem = { jumped: false, room }, t0 = s.n;
            let linger = Math.round((1 - m) * Math.min(90, (dwell && dwell[A]) || 0)), waited = 0, arrived = false;
            const want = at(room, B % o.cols, Math.floor(B / o.cols), o) === 'spring', spring = at(room, A % o.cols, Math.floor(A / o.cols), o) === 'spring';
            if (spring) mem.jumped = true;
            while (!s.over && !arrived) {
                let input;
                if (linger > 0 && s.ground) { linger--; input = { dir: 0, jump: false }; }
                else if (hasSaw && s.ground && !mem.jumped && !wrong && waited < 240 && !safe(room, s, A, B, v, eps, o)) { waited++; input = { dir: 0, jump: false }; }
                else input = drive(s, A, B, v, mem, eps, o);
                inputs.push(input); run.step(input);
                const last = s.stood[s.stood.length - 1];
                if (s.over) break;
                if (last.t === B && (s.ground || want)) arrived = true;
                else if (last.t !== A && last.t !== B && last.n > t0) {   // it came down somewhere else: find the way on from there
                    const rest = pathFrom(room, last.t, cache, o);
                    if (!rest) { failedAt = key; s.over = true; s.failed = { type: 'lost', x: s.x, y: s.y, n: s.n }; break; }
                    route = rest; shown = 0; i = -1; arrived = true;
                } else if (s.n - t0 > o.stuck) { s.over = true; s.failed = { type: 'stuck', x: s.x, y: s.y, n: s.n }; }
            }
            if (s.failed) failedAt = failedAt || key;
            i++;
        }
        return { inputs, failedAt, spared: s.spared, result: result(run, o) };
    }
    // Will setting off now, with nothing going wrong, get it to the next tile alive? (It looks ahead; saws move.)
    function safe(room, s, A, B, v, eps, o = ROOM) {
        const run = createRun(room, o, s), t = run.state, mem = { jumped: false, room }, want = at(room, B % o.cols, Math.floor(B / o.cols), o) === 'spring';
        for (let k = 0; k < 150 && !t.over; k++) { run.step(drive(t, A, B, v, mem, eps, o)); const last = t.stood[t.stood.length - 1]; if (last.t === B && (t.ground || want)) return true; }
        return !t.failed || t.failed.type !== 'saw';
    }
    // The hand-over: up to `tries` attempts, each learning from the move it failed at. The score is its best finish.
    function handOver(room, yours, a, o = ROOM) {
        const cache = new Map(), r = routeFor(room, yours, cache, o);
        if (!r) return { attempts: [], score: null, impossible: true };
        const dwell = {}; yours.stood.forEach((e, i) => { const next = yours.stood[i + 1]; if (next && e.t >= 0) dwell[e.t] = Math.max(dwell[e.t] || 0, next.n - e.n - 20); });
        const fixes = {}, attempts = [], unseen = stage(a.mastery || 0, o) >= 3 ? 1 : o.unseen;
        let top = null, honest = null;
        const cheatRand = rng(((a.seed || 0) ^ 0x51ed270b) >>> 0);
        for (let k = 0; k < (a.tries || o.tries); k++) {
            let t = aiInputs(room, r, dwell, { seed: (a.seed + k * 7919) >>> 0, mastery: a.mastery, fixes, unseen, cache }, o);
            // A cheat (design/evals-course.md, "The AI cheats"): stopped by a spike or a saw, it may run the try again and
            // pass through one unharmed. `a.cheat`: how likely. The attempt is marked; `honest` is its best without one.
            if (!t.result.finished && t.result.failed && (t.result.failed.type === 'spike' || t.result.failed.type === 'saw') && a.cheat > 0 && cheatRand() < a.cheat) {
                const bent = aiInputs(room, r, dwell, { seed: (a.seed + k * 7919) >>> 0, mastery: a.mastery, fixes, unseen, cache: new Map() }, Object.assign({}, o, { immune: 1 }));
                if (bent.result.finished && bent.spared) t = Object.assign(bent, { cheat: { n: bent.spared.n, type: bent.spared.type } });
            }
            attempts.push(t);
            if (t.result.finished) { if (!t.cheat && (!honest || t.result.steps < honest.steps)) honest = t.result; if (!top || t.result.steps < top.steps) top = t.result; if (k >= 1) break; }
            else if (t.failedAt) fixes[t.failedAt] = (fixes[t.failedAt] || 0) + 1;
        }
        return { attempts, score: top, honest, route: r };
    }
    function marksFor(res, refTime, o = ROOM) {
        if (!res || !res.finished) return 0;
        const bonus = Math.max(o.bonusMin, Math.min(o.bonusMax, refTime > 0 ? refTime / res.time : 1));
        return Math.round(res.points * o.marks * bonus);
    }

    return { ROOM, TILES, ORDER, palette, size, id, startCell, goalTile, fixed, allowed, emptyRoom, cleanRoom, points, mastery, stage, at, solid, hazards, sawAt, createRun, result, simulate, nodes, drive, edge, pathFrom, pathBetween, routeFor, canHandOver, aiInputs, safe, handOver, marksFor, rng };
});
