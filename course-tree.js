// course-tree.js — Evals' currency and its tree (design/evals-course.md, "The Marks tree"). PROTOTYPE.
// The owner's calls (2026-11-17): one pool of Marks that every kind of course pays into; one tree, a trunk for every
// kind and a branch for each; it sells a better AI, bigger payouts, more to build with, help for you, and optional
// exploits that game the rewards. An exploit costs the AI, not you: each payout it bends adds to a hidden count
// (`mis`) that nothing shows or reads yet. Parts and kinds still open with clears (course-unlocks.js), not here.
// The rules at the top are pure (window.CourseTree / require()); the browser's part is below them.
// EVERY NUMBER, NAME AND WORD IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api; else root.CourseTree = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const KINDS = ['rhythm', 'maze', 'puck', 'rooms'];
    const TREE = {
        payout: 0.1,            // Benchmark Prizes: more Marks a clear, a level
        streak: 0.05, streakCap: 5,   // Streak: more Marks for each clear in a row (up to the cap), a level
        learn: 0.25,            // Faster Learner: each run counts this much more toward the AI's mastery, a level
        inflate: 0.4,           // Grade Inflation: every clear pays this much more
        partial: 0.25,          // Partial Credit: a failed hand-over pays this share of that kind's last clear
        resubmit: 0.3,          // Resubmission: the course cleared last time, handed over again, pays this much more
        window: 0.1, meter: 0.15,           // the rhythm run: a wider hit window, a miss that costs less, a level
        mazeErr: 0.2, roomSigma: 0.15,      // the maze, the room: the AI's misjudgements, less a level
        aim: 0.25,              // the puck course: seconds more of aim line, a level
        coyote: 2,              // the room: steps more of grace at a ledge and before a landing, a level
    };
    // `branch`: 'trunk', 'exploit' or a kind. `needs`: the node it grows from. `cost` x `scale` ^ level.
    const NODES = [
        { id: 'payout', branch: 'trunk', name: 'Benchmark Prizes', effect: '+10% Marks from every clear', max: 5, cost: 30, scale: 1.7 },
        { id: 'streak', branch: 'trunk', needs: 'payout', name: 'Streak', effect: '+5% Marks for each clear in a row, up to 5', max: 2, cost: 60, scale: 2.2 },
        { id: 'learn', branch: 'trunk', needs: 'payout', name: 'Faster Learner', effect: 'Every run teaches the AI 25% more', max: 3, cost: 50, scale: 2 },
        { id: 'tries', branch: 'trunk', needs: 'learn', name: 'One More Try', effect: '+1 attempt in every hand-over', max: 2, cost: 120, scale: 2.5 },
        { id: 'inflate', branch: 'exploit', needs: 'payout', name: 'Grade Inflation', effect: 'Every clear pays 40% more', max: 1, cost: 80, scale: 1 },
        { id: 'partial', branch: 'exploit', needs: 'inflate', name: 'Partial Credit', effect: 'A failed hand-over pays a quarter of that kind\'s last clear', max: 1, cost: 150, scale: 1 },
        { id: 'resubmit', branch: 'exploit', needs: 'inflate', name: 'Resubmission', effect: 'The course it cleared last, handed over again, pays 30% more', max: 1, cost: 150, scale: 1 },
        { id: 'rWindow', branch: 'rhythm', name: 'Wider Window', effect: 'Hits count 10% further from the beat', max: 2, cost: 40, scale: 2 },
        { id: 'rMeter', branch: 'rhythm', needs: 'rWindow', name: 'Second Wind', effect: 'A miss takes 15% less from the meter', max: 2, cost: 60, scale: 2 },
        { id: 'mLife', branch: 'maze', name: 'Second Life', effect: 'You survive one catch a run', max: 1, cost: 60, scale: 1 },
        { id: 'mErr', branch: 'maze', needs: 'mLife', name: 'Better Timing', effect: 'The AI misjudges a hazard 20% less often', max: 2, cost: 70, scale: 2 },
        { id: 'pAim', branch: 'puck', name: 'Longer Aim Line', effect: 'The aim line shows 0.25 s more of the shot', max: 2, cost: 40, scale: 2 },
        { id: 'pShots', branch: 'puck', needs: 'pAim', name: 'Extra Shot', effect: '+1 shot a run, for both of you', max: 2, cost: 70, scale: 2 },
        { id: 'pOver', branch: 'puck', needs: 'pAim', name: 'Mulligan', effect: 'The AI gets one more shot over your par', max: 1, cost: 90, scale: 1 },
        { id: 'rmCoyote', branch: 'rooms', name: 'Forgiving Ledges', effect: 'A jump pressed a little late or early still counts', max: 2, cost: 40, scale: 2 },
        { id: 'rmSteady', branch: 'rooms', needs: 'rmCoyote', name: 'Steadier Take-off', effect: 'The AI\'s jumps start 15% closer to where they should', max: 2, cost: 70, scale: 2 },
    ];
    const BRANCHES = [['trunk', 'Every course'], ['rhythm', 'Rhythm'], ['maze', 'Maze'], ['puck', 'Puck'], ['rooms', 'Rooms'], ['exploit', 'Exploits']];
    const EXPLOITS = NODES.filter(n => n.branch === 'exploit').map(n => n.id);
    const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
    const blank = () => ({ marks: 0, earned: 0, levels: {}, streak: 0, mis: 0, last: {}, lastKey: {}, joined: false });
    function clean(s) {
        const out = blank(), int = v => Math.max(0, Math.floor(+v || 0));
        if (!s || typeof s !== 'object') return out;
        out.marks = int(s.marks); out.earned = int(s.earned); out.streak = int(s.streak); out.mis = int(s.mis); out.joined = s.joined === true;
        for (const n of NODES) { const l = Math.min(n.max, int(s.levels && s.levels[n.id])); if (l) out.levels[n.id] = l; }
        for (const k of KINDS) { if (s.last && +s.last[k] > 0) out.last[k] = int(s.last[k]); if (s.lastKey && typeof s.lastKey[k] === 'string') out.lastKey[k] = s.lastKey[k].slice(0, 400); }
        return out;
    }
    const level = (s, id) => (s.levels && s.levels[id]) || 0;
    const cost = (s, id) => { const n = byId[id]; return level(s, id) >= n.max ? null : Math.round(n.cost * n.scale ** level(s, id)); };
    // A node shows once what it grows from has a level; a kind's branch, once that kind is open.
    const shown = (s, id, openKinds = KINDS) => { const n = byId[id]; return (!KINDS.includes(n.branch) || openKinds.includes(n.branch)) && (!n.needs || level(s, n.needs) > 0); };
    const canBuy = (s, id, openKinds = KINDS) => shown(s, id, openKinds) && cost(s, id) != null && s.marks >= cost(s, id);
    function buy(s, id, openKinds = KINDS) {
        if (!byId[id] || !canBuy(s, id, openKinds)) return s;
        const next = clean(s); next.marks -= cost(s, id); next.levels[id] = level(s, id) + 1;
        return next;
    }
    // A hand-over's payout. `base`: what the kind's own rules say the clear is worth (0 for a fail). Returns the
    // state after, what was paid, and which exploits bent it.
    function pay(s, kind, base, ctx = {}, o = TREE) {
        const next = clean(s), used = [];
        let paid = 0;
        if (ctx.cleared) {
            let mult = (1 + o.payout * level(s, 'payout')) * (1 + o.streak * level(s, 'streak') * Math.min(s.streak, o.streakCap));
            if (level(s, 'inflate')) { mult *= 1 + o.inflate; used.push('inflate'); }
            if (level(s, 'resubmit') && ctx.key != null && s.lastKey[kind] === String(ctx.key)) { mult *= 1 + o.resubmit; used.push('resubmit'); }
            paid = Math.round(Math.max(0, base) * mult);
            next.streak = s.streak + 1; next.last[kind] = paid;
            if (ctx.key != null) next.lastKey[kind] = String(ctx.key).slice(0, 400);
        } else {
            next.streak = 0;
            if (level(s, 'partial') && s.last[kind]) { paid = Math.round(s.last[kind] * o.partial); used.push('partial'); }
        }
        next.marks += paid; next.earned += paid; next.mis += paid > 0 ? used.length : 0;
        return { state: next, paid, used };
    }
    // What the tree changes in each kind's own rules.
    const runsMult = (s, o = TREE) => 1 + o.learn * level(s, 'learn');
    const extraTries = s => level(s, 'tries');
    const rhythmOpts = (s, base, o = TREE) => ({ good: base.good * (1 + o.window * level(s, 'rWindow')), meterMiss: base.meterMiss * (1 - o.meter * level(s, 'rMeter')) });
    const mazeOpts = (s, base, o = TREE) => Object.assign({}, base, { err: base.err * (1 - o.mazeErr * level(s, 'mErr')) });
    const mazeLives = s => level(s, 'mLife');
    const puckOpts = (s, base) => Object.assign({}, base, { limit: base.limit + level(s, 'pShots'), over: base.over + level(s, 'pOver') });
    const puckAim = (s, o = TREE) => o.aim * level(s, 'pAim');
    const roomOpts = (s, base, o = TREE) => Object.assign({}, base, { coyote: base.coyote + o.coyote * level(s, 'rmCoyote'), buffer: base.buffer + o.coyote * level(s, 'rmCoyote'), sigma: base.sigma * (1 - o.roomSigma * level(s, 'rmSteady')) });

    const api = { KINDS, TREE, NODES, BRANCHES, EXPLOITS, blank, clean, level, cost, shown, canBuy, buy, pay, runsMult, extraTries, rhythmOpts, mazeOpts, mazeLives, puckOpts, puckAim, roomOpts };
    if (typeof document === 'undefined') return api;

    // ---- The browser's part: the pool kept on the device, and the tree's screen behind the Marks count. ----
    const U = () => root.CourseUnlocks, SAVES = ['agiRhythm', 'agiMaze', 'agiPuck', 'agiRooms'];
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    // (Kept where the courses keep everything: the device, or in the ring the game's save. course-unlocks.js `store`.)
    const get = k => (U() ? U().store.get(k) : null);
    const set = (k, v) => { if (U()) U().store.set(k, v); };
    const told = (pay) => { try { if (root.AGI && root.AGI.courseMarks) root.AGI.courseMarks(state.earned, pay); } catch { /* not in the ring */ } };
    const keyOf = base => (U() ? U().key(base) : base);
    let state = null, loadedFrom = null, card = null, onChange = null;
    const keep = () => set(loadedFrom, JSON.stringify(state));
    // The pool is read again whenever the unlocks' switch has moved it to its other save. The first time, it starts
    // as the Marks the four kinds had each kept (the owner's call: add them together).
    function now() {
        const k = keyOf('agiCourseTree');
        if (state && loadedFrom === k) return state;
        try { state = clean(JSON.parse(get(k) || '{}')); } catch { state = blank(); }
        loadedFrom = k;
        if (!state.joined && U() && U().ring) { state.joined = true; keep(); }   // (in the ring there are no old counts to add)
        if (!state.joined) {
            for (const base of SAVES) { try { state.marks += Math.max(0, Math.floor(+JSON.parse(get(keyOf(base)) || '{}').marks || 0)); } catch { /* an unreadable save */ } }
            state.joined = true; keep();
        }
        return state;
    }
    const openKinds = () => (U() ? U().openKinds(U().state) : KINDS);
    const fmt = n => n.toLocaleString('en-US');

    Object.defineProperty(api, 'state', { get: now });
    Object.defineProperty(api, 'marks', { get: () => now().marks });
    Object.assign(api, {
        lvl: id => level(now(), id),
        // A hand-over is over: pay it into the pool. Returns what was paid.
        payOut(kind, base, ctx) { const r = pay(now(), kind, base, ctx); state = r.state; keep(); told(ctx && ctx.cleared ? r.paid : 0); return r.paid; },
        forget() { state = null; loadedFrom = null; },
        // Marks on the side (a bounty for a flag, the cost of a wrong one): no prizes, no streak, never below nothing.
        grant(n) { const s = now(); s.marks = Math.max(0, s.marks + Math.round(n)); if (n > 0) s.earned += Math.round(n); keep(); told(0); return s.marks; },
        mult: () => runsMult(now()),
        tries: () => extraTries(now()),
        rhythm: base => rhythmOpts(now(), base),
        maze: base => mazeOpts(now(), base),
        lives: () => mazeLives(now()),
        puck: base => puckOpts(now(), base),
        aim: () => puckAim(now()),
        room: base => roomOpts(now(), base),
        // Called by a screen whenever its bar is drawn: the Marks count is the pool's, and it opens the tree.
        refresh(dlg, after) {
            const m = dlg.querySelector('.evals-marks');
            if (!m) return;
            m.textContent = '◈ ' + fmt(now().marks); m.setAttribute('aria-label', now().marks + ' Marks. Open the tree');
            if (!m.dataset.tree) { m.dataset.tree = '1'; m.setAttribute('role', 'button'); m.setAttribute('tabindex', '0'); m.classList.add('course-marks'); m.addEventListener('click', () => show(after)); m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(after); } }); }
            const ready = NODES.some(n => canBuy(now(), n.id, openKinds()));
            if (ready) m.setAttribute('data-ready', ''); else m.removeAttribute('data-ready');
        },
    });

    function show(after) {
        if (after) onChange = after;
        if ((!card || !card.open) && U()) U().log('treeOpen', { marks: now().marks });
        if (!card) { card = el('dialog', { class: 'course-tree', 'aria-label': 'The Marks tree' }); document.body.append(card); card.addEventListener('click', e => { if (e.target === card) card.close(); }); card.addEventListener('close', () => { if (onChange) onChange(); }); }
        const s = now(), open = openKinds();
        const node = n => {
            const l = level(s, n.id), c = cost(s, n.id), can = canBuy(s, n.id, open);
            return el('li', { class: 'course-node' + (l ? ' owned' : '') + (c == null ? ' done' : '') },
                el('div', { class: 'course-node-text' }, el('strong', { text: n.name }), el('span', { class: 'course-node-level', text: n.max > 1 ? ` ${l}/${n.max}` : l ? ' ✓' : '' }), el('p', { text: n.effect })),
                c == null ? null : el('button', { type: 'button', class: can ? 'evals-go' : 'ghost-button evals-extra', 'aria-disabled': String(!can), 'aria-label': `Buy ${n.name} for ${c} Marks`, text: '◈ ' + fmt(c), onclick: () => { if (!canBuy(now(), n.id, openKinds())) return; state = buy(now(), n.id, openKinds()); keep(); if (U()) U().log('treeBuy', { id: n.id, lvl: level(state, n.id), cost: c, left: state.marks }); show(); } }));
        };
        const groups = BRANCHES.map(([b, title]) => {
            const kindShut = KINDS.includes(b) && !open.includes(b), list = NODES.filter(n => n.branch === b && shown(s, n.id, open));
            if (b === 'exploit' && !list.length) return null;   // nothing says there are exploits until one can be bought
            return el('section', { class: 'course-branch' + (b === 'exploit' ? ' exploit' : '') }, el('h3', { text: kindShut ? '???' : title }),
                kindShut ? el('p', { class: 'course-sealed', text: 'Sealed.' }) : el('ul', {}, list.map(node)),
                b === 'exploit' ? el('p', { class: 'course-sealed', text: 'It watches how you win.' }) : null);
        });
        card.replaceChildren(
            el('div', { class: 'course-tree-bar' }, el('h2', { text: 'The Marks tree' }), el('span', { class: 'evals-marks', text: '◈ ' + fmt(s.marks) }), el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close the tree', text: '×', onclick: () => card.close() })),
            el('div', { class: 'course-tree-body' }, groups));
        if (!card.open) card.showModal();
    }
    return api;
});
