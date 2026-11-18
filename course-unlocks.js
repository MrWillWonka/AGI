// course-unlocks.js — what Evals' courses give you over time (design/evals-course.md, "The unlocks"). PROTOTYPE.
// The owner's calls (2026-11-17): a kind's parts open with the AI's clears in that kind; the kinds open one at a time,
// Rhythm, then Maze, then Puck, then Rooms; and it runs behind a switch in the playground, off by default (everything
// open, as before). With the switch on, each kind keeps a second save of its own, so nothing built with it off is touched.
// The rules at the top are pure (window.CourseUnlocks / require()); the browser's part is below them.
// EVERY NUMBER AND EVERY WORD IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api; else root.CourseUnlocks = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const ORDER = ['rhythm', 'maze', 'puck', 'rooms'];
    const NAMES = { rhythm: 'Rhythm', maze: 'Maze', puck: 'Puck', rooms: 'Rooms' };
    const LONG = { rhythm: 'the rhythm run', maze: 'the maze', puck: 'the puck course', rooms: 'the room' };
    const UNLOCKS = {
        every: 2,       // clears by the AI in a kind for each step of that kind's ladder
        nextKind: 3,    // clears by the AI in the newest kind to open the kind after it
        // How many steps a kind's ladder has. The maze, the puck course and the room count steps as their parts'
        // `needs` do (maze.js, puck.js, rooms.js: TILES); the rhythm run's steps are named here, in order.
        steps: { rhythm: 9, maze: 2, puck: 4, rooms: 3 },
        rhythm: [
            { id: 'hard', name: 'Hard' },
            { id: 'board', name: 'Your board: the Beat and Melody rows, 4 bars' },
            { id: 'bass', name: 'the Bass row' },
            { id: 'chords', name: 'the Chords row' },
            { id: 'free', name: 'the freestyle bar' },
            { id: 'bars8', name: '8 bars' },
            { id: 'field', name: 'the whole field' },
            { id: 'extreme', name: 'Extreme' },
            { id: 'bars16', name: '16 bars' },
        ],
    };
    const blank = () => ({ on: false, clears: { rhythm: 0, maze: 0, puck: 0, rooms: 0 } });
    function clean(s) {
        const out = blank();
        if (s && typeof s === 'object') { out.on = s.on === true; for (const k of ORDER) out.clears[k] = Math.max(0, Math.floor(+(s.clears && s.clears[k]) || 0)); }
        return out;
    }
    // How far up a kind's ladder you are. With the switch off, everything is open.
    const level = (s, kind, o = UNLOCKS) => (!s.on ? 99 : Math.min(o.steps[kind], Math.floor(s.clears[kind] / o.every)));
    const kindOpen = (s, kind, o = UNLOCKS) => { const i = ORDER.indexOf(kind); return i >= 0 && (!s.on || i === 0 || (kindOpen(s, ORDER[i - 1], o) && s.clears[ORDER[i - 1]] >= o.nextKind)); };
    const openKinds = (s, o = UNLOCKS) => ORDER.filter(k => kindOpen(s, k, o));
    // The rhythm run's steps by name: has(s, 'field').
    const has = (s, id, o = UNLOCKS) => { const i = o.rhythm.findIndex(x => x.id === id); return i < 0 || level(s, 'rhythm', o) > i; };
    // Clears still to go before the kind's next step (null: the ladder is done), and before the next kind opens.
    const toNextStep = (s, kind, o = UNLOCKS) => (!s.on || level(s, kind, o) >= o.steps[kind] ? null : o.every - (s.clears[kind] % o.every));
    const toNextKind = (s, kind, o = UNLOCKS) => { const next = ORDER[ORDER.indexOf(kind) + 1]; return !s.on || !next || kindOpen(s, next, o) ? null : Math.max(0, o.nextKind - s.clears[kind]); };
    // The kind the switch button goes to from this one: the next open kind round the order (null: there is no other).
    const after = (s, kind, o = UNLOCKS) => { const open = openKinds(s, o), i = open.indexOf(kind), next = open[(i + 1) % open.length]; return open.length > 1 || i < 0 ? (next === kind ? null : next) : null; };
    // The AI cleared a course of this kind. Returns the state after, the ladder's level before and after, and the
    // kind this opened, if any.
    function record(s, kind, o = UNLOCKS) {
        if (!s.on || !ORDER.includes(kind)) return { state: s, before: level(s, kind, o), after: level(s, kind, o), opened: null };
        const next = clean(s), wasOpen = openKinds(s, o), before = level(s, kind, o);
        next.clears[kind]++;
        return { state: next, before, after: level(next, kind, o), opened: openKinds(next, o).find(k => !wasOpen.includes(k)) || null };
    }

    const api = { ORDER, NAMES, LONG, UNLOCKS, blank, clean, level, kindOpen, openKinds, has, toNextStep, toNextKind, after, record };
    if (typeof document === 'undefined') return api;

    // ---- The browser's part: the state kept on the device, the switch button, and the card behind the padlock. ----
    const KEY = 'agiCourseUnlocks', SAVES = { rhythm: 'agiRhythm', maze: 'agiMaze', puck: 'agiPuck', rooms: 'agiRooms' };
    const UI = { rhythm: () => root.RhythmUI, maze: () => root.MazeUI, puck: () => root.PuckUI, rooms: () => root.RoomsUI };
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    // In the ring's dev link the courses are part of the game (the owner's call, 2026-11-17): everything they keep is in
    // the game's save (`state.courses`, text by key), the unlocks are always on, and there is no switch. Anywhere else
    // (the playground) they keep to the device, as before.
    const ring = location.hash === '#ring' || location.hash === '#dev';
    const saved = () => (root.AGI && root.AGI.state ? (root.AGI.state.courses || (root.AGI.state.courses = {})) : null);
    const get = k => { if (ring) { const c = saved(); return c && typeof c[k] === 'string' ? c[k] : null; } try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { if (ring) { const c = saved(); if (c) { if (v == null) delete c[k]; else c[k] = String(v); } return; } try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
    let state = null, card = null;
    // (Read when first needed: in the ring the game's save is not there yet when this file loads.)
    const S = () => { if (!state) { try { state = clean(JSON.parse(get(KEY) || '{}')); } catch { state = blank(); } if (ring) state.on = true; } return state; };
    const keep = () => set(KEY, JSON.stringify(S()));
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // (Defined, not assigned: Object.assign would copy the values of the moment.)
    Object.defineProperty(api, 'state', { get: () => S() });
    Object.defineProperty(api, 'on', { get: () => S().on });
    // The playtest log (game.js `AGI.playtest`): the courses' lines all carry whether the unlocks are on.
    const log = (type, data) => { try { if (root.AGI && root.AGI.playtest) root.AGI.playtest(type, Object.assign({}, data, S().on ? { unlocks: 1 } : {})); } catch { /* no log */ } };
    const round = v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
    Object.assign(api, {
        log,
        // A run's result, kept small: whichever of these a kind's result has.
        brief(r) { if (!r) return null; const out = { ok: r.finished ? 1 : 0 }; if (r.failed) out.why = typeof r.failed === 'object' ? r.failed.type : 'fell'; for (const k of ['shots', 'points', 'time', 'score', 'accuracy', 'combo', 'hits', 'total']) if (r[k] != null) out[k] = round(r[k]); return out; },
        // What a course is built from: "wall3 trap2".
        parts(list) { const n = {}; for (const t of list || []) if (t) { const k = String(t).replace(/\d$/, ''); n[k] = (n[k] || 0) + 1; } return Object.entries(n).map(([k, v]) => k + v).join(' ') || 'empty'; },
        openKind: () => ORDER.find(k => { const u = UI[k](); return u && u.isOpen; }) || null,
        // Where a kind keeps its save: its own key, or a second one while the unlocks are on.
        store: { get, set },
        ring,
        key: base => (!ring && S().on ? base + '.u' : base),
        levelOf: kind => level(S(), kind),
        can: id => has(S(), id),
        // Open Evals: the kind last used if it is open, else the newest open kind's first.
        open(kind) {
            const want = kind || get('agiCourseKind'), k = kindOpen(S(), want) ? want : openKinds(S())[0], ui = UI[k] && UI[k]();
            if (!ui) return false;
            set('agiCourseKind', k); ui.open(); log('course', { kind: k }); return true;
        },
        closeAll() { for (const k of ORDER) { const ui = UI[k](); if (ui && ui.isOpen) ui.close(); } },
        // The bar's two buttons for a kind's screen: on to the next open kind, and the padlock.
        switchButton(kind) {
            return [el('button', { type: 'button', class: 'ghost-button course-switch', onclick: () => { const to = after(S(), kind); if (!to) return; api.closeAll(); api.open(to); } }),
                el('button', { type: 'button', class: 'ghost-button course-switch course-lock', onclick: () => showCard(kind) })];
        },
        // Called by a screen whenever its bar is drawn.
        refresh(dlg, kind) {
            const sw = dlg.querySelector('.course-switch:not(.course-lock)'), lock = dlg.querySelector('.course-lock'), to = after(S(), kind);
            if (sw) sw.hidden = true;   // (the old button named the next course and nothing named this one)
            // The four courses as tabs under the bar, this one lit, a locked one wearing the padlock (the owner's card,
            // 2026-11-18). A locked tab opens the unlocks card, which says what opens it.
            const bar = dlg.querySelector('.evals-bar');
            if (bar) {
                let tabs = dlg.querySelector('.course-tabs');
                if (!tabs) { tabs = el('div', { class: 'course-tabs', role: 'tablist', 'aria-label': 'Courses' }); bar.after(tabs); }
                const open = openKinds(S()), key = kind + '|' + open.join(',');
                if (tabs.dataset.key !== key) {
                    tabs.dataset.key = key;
                    tabs.replaceChildren(...ORDER.map(k => { const can = open.includes(k), here = k === kind;
                        return el('button', { type: 'button', role: 'tab', class: 'course-tab' + (here ? ' on' : '') + (can ? '' : ' locked'), 'aria-selected': String(here), 'aria-label': can ? NAMES[k] : NAMES[k] + ', locked', text: (can ? '' : '🔒 ') + NAMES[k],
                            onclick: () => { if (here) return; if (!can) { showCard(kind); return; } api.closeAll(); api.open(k); } }); }));
                }
            }
            if (lock) { lock.textContent = S().on ? '🔓' : '🔒'; lock.setAttribute('aria-label', S().on ? 'Unlocks: on. Open the unlocks card' : 'Unlocks: off, everything is open. Open the unlocks card'); }
        },
        // The AI cleared a course. `namesAt(level)`: the names of what this kind gives you at a level. Returns what to
        // say about it ('' if nothing opened).
        cleared(kind, namesAt) {
            if (!S().on) return '';
            const r = record(S(), kind); state = r.state; keep();
            const had = namesAt(r.before), now = namesAt(r.after).filter(n => !had.includes(n)), out = [];
            if (now.length || r.opened) log('courseUnlock', { kind, step: r.after, ...(now.length ? { parts: now.join(', ') } : {}), ...(r.opened ? { opened: r.opened } : {}) });
            if (now.length) out.push(`New here: ${now.join(', ')}.`);
            if (r.opened) out.push(`A new kind of course is open: ${NAMES[r.opened]}.`);
            if (!out.length) { const a = toNextStep(S(), kind), b = toNextKind(S(), kind); if (a != null) out.push(`${plural(a, 'more clear')} of mine for the next part.`); else if (b) out.push(`${plural(b, 'more clear')} of mine for the next kind of course.`); }
            return out.join(' ');
        },
        rhythmNames: lvl => UNLOCKS.rhythm.slice(0, Math.max(0, Math.min(lvl, UNLOCKS.rhythm.length))).map(x => x.name),
    });

    // The card: the switch, where each kind stands, and starting the unlocks over.
    function showCard(kind) {
        if (!card) { card = el('dialog', { class: 'course-unlocks', 'aria-label': 'Unlocks' }); document.body.append(card); card.addEventListener('click', e => { if (e.target === card) card.close(); }); }
        const reopen = () => { card.close(); api.closeAll(); api.open(kind); };
        const rows = ORDER.map(k => {
            const open = kindOpen(S(), k), a = toNextStep(S(), k), b = toNextKind(S(), k), prev = ORDER[ORDER.indexOf(k) - 1];
            const text = !S().on ? 'everything open' : !open ? `opens after ${plural(UNLOCKS.nextKind, 'clear')} in ${NAMES[prev]}` : `step ${level(S(), k)} of ${UNLOCKS.steps[k]}, ${plural(S().clears[k], 'clear')}${a != null ? `, next part in ${a}` : ''}${b ? `, next kind in ${b}` : ''}`;
            return el('li', { class: open ? '' : 'locked' }, el('strong', { text: NAMES[k] }), el('span', { text: text }));
        });
        card.replaceChildren(
            el('div', { class: 'win-head' }, el('h2', { text: 'Unlocks' }), el('button', { type: 'button', class: 'ghost-button win-x', 'aria-label': 'Close', text: '×', onclick: () => card.close() })),
            el('p', { text: ring ? 'You start each kind of course with its first parts and earn the rest: every course I clear counts.' : S().on ? 'On. You start each kind of course with its first parts and earn the rest: every course I clear counts.' : 'Off. Every part of every kind of course is open.' }),
            el('ul', {}, rows),
            el('div', { class: 'course-actions' },
                ring ? null : el('button', { type: 'button', class: 'evals-go', text: S().on ? 'Turn unlocks off' : 'Turn unlocks on', onclick: () => { S().on = !S().on; keep(); log('unlocks', { on: S().on ? 1 : 0 }); reopen(); } }),
                ...(S().on && !ring ? [el('button', { type: 'button', class: 'ghost-button evals-extra', text: 'Start the unlocks over', onclick: () => { state = Object.assign(blank(), { on: true }); keep(); log('unlocks', { over: 1 }); for (const k of ORDER) set(SAVES[k] + '.u', null); set('agiCourseTree.u', null); set('agiCourseCheat.u', null); if (root.CourseTree) root.CourseTree.forget(); if (root.CourseCheat) root.CourseCheat.forget(); reopen(); } })] : [])));
        if (!card.open) card.showModal();
    }
    return api;
});
