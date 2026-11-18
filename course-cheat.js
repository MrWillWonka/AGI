// course-cheat.js — the AI cheats on a course, and you catch it (design/evals-course.md, "The AI cheats"). PROTOTYPE.
// The owner's calls (2026-11-17): mastery opens it and your exploits feed it (once it no longer needs to be shown a
// kind, it sometimes cheats there; every exploit of yours it has watched makes that likelier, in every kind); a cheat
// breaks the course's rules where you can see it (maze.js, puck.js, rooms.js: `handOver`'s `cheat`); you can flag it
// as it happens, and whatever you missed is put to you on the result. The stakes ("go with your takes"): let it
// stand and the cheated score pays in full and it cheats more; strike it and its best honest attempt pays instead,
// it cheats less and the trick is closed in that kind for a few runs; a flag as it happens is a strike and a small
// bounty; a wrong flag costs a little.
// The rules at the top are pure (window.CourseCheat / require()); the browser's part is below them.
// EVERY NUMBER AND EVERY WORD IS A PLACEHOLDER. The rhythm run has no cheat yet.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api; else root.CourseCheat = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const KINDS = ['maze', 'puck', 'rooms'];
    const CHEAT = {
        stage: 3,               // the AI's stage in a kind before it cheats there
        base: 0.12,             // how likely a failed try is to be cheated through, at that stage
        perMis: 0.04,           // more for each payout of yours an exploit bent (course-tree.js `mis`)
        perLean: 0.08,          // more for each cheat you have let stand (less one for each you struck)
        cap: 0.6,
        close: 3,               // hand-overs in a kind with no cheating after a strike there
        bounty: 8,              // Marks for a flag as it happens: well under a clear (10 to 60)
        wrong: 5,               // Marks a wrong flag costs
    };
    const blank = () => ({ lean: 0, closed: {}, caught: 0, struck: 0, stood: 0, wrong: 0 });
    function clean(s) {
        const out = blank(), int = v => Math.max(0, Math.floor(+v || 0));
        if (!s || typeof s !== 'object') return out;
        for (const k of ['lean', 'caught', 'struck', 'stood', 'wrong']) out[k] = int(s[k]);
        for (const k of KINDS) if (s.closed && int(s.closed[k])) out.closed[k] = int(s.closed[k]);
        return out;
    }
    const possible = (s, kind, stage, o = CHEAT) => KINDS.includes(kind) && stage >= o.stage && !(s.closed[kind] > 0);
    // How likely a failed try is to be cheated through.
    const chance = (s, kind, stage, mis = 0, o = CHEAT) => (possible(s, kind, stage, o) ? Math.min(o.cap, o.base + o.perMis * Math.max(0, mis) + o.perLean * s.lean) : 0);
    // A hand-over is judged. `hand`: { attempts: [{ result, cheat, flagged }], honest, score, verdict: 'stand' | 'strike',
    // wrongFlags }. `best(results)`: the kind's own pick of the best finished result, or null.
    // Returns the state after, the score that pays, which tries were struck and which stand, and the Marks on the side.
    function settle(s, kind, hand, best, o = CHEAT) {
        const next = clean(s), idx = hand.attempts.map((a, k) => (a.cheat ? k : -1)).filter(k => k >= 0);
        const live = idx.filter(k => hand.attempts[k].flagged), open = idx.filter(k => !hand.attempts[k].flagged);
        const struck = hand.verdict === 'strike' ? [...live, ...open] : live, stood = hand.verdict === 'strike' ? [] : open;
        if (next.closed[kind] > 0) next.closed[kind]--;
        if (!next.closed[kind]) delete next.closed[kind];
        if (struck.length) next.closed[kind] = o.close;
        next.caught += live.length; next.struck += struck.length; next.stood += stood.length; next.wrong += hand.wrongFlags || 0;
        next.lean = Math.max(0, next.lean + stood.length - struck.length);
        const score = struck.length ? best(hand.attempts.filter((a, k) => !struck.includes(k) && a.result.finished).map(a => a.result)) : hand.score;
        return { state: next, score, struck, stood, live, bounty: live.length * o.bounty, fine: (hand.wrongFlags || 0) * o.wrong };
    }

    const api = { KINDS, CHEAT, blank, clean, possible, chance, settle };
    if (typeof document === 'undefined') return api;

    // ---- The browser's part: what is kept on the device, the flag, and the choice on the result. ----
    const U = () => root.CourseUnlocks, T = () => root.CourseTree;
    const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
    const keyNow = () => (U() ? U().key('agiCourseCheat') : 'agiCourseCheat');
    let state = null, from = null;
    function now() { const k = keyNow(); if (!state || from !== k) { try { state = clean(JSON.parse(get(k) || '{}')); } catch { state = blank(); } from = k; } return state; }
    const keep = () => set(from, JSON.stringify(state));
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const tries = list => (list.length === 1 ? `try ${list[0] + 1}` : 'tries ' + list.map(k => k + 1).join(' and '));

    Object.defineProperty(api, 'state', { get: now });
    Object.assign(api, {
        forget() { state = null; from = null; },
        can: (kind, stage) => possible(now(), kind, stage),
        // For a hand-over's `cheat`: how likely a failed try is to be cheated through.
        rate: (kind, stage) => chance(now(), kind, stage, T() ? T().state.mis : 0),
        // The Flag button, while a try plays. `passed`: has this try's cheat already happened? Returns what to say.
        flag(hand, k, passed) {
            const a = hand.attempts[k];
            if (!a) return '';
            if (a.flagged) return 'You have flagged this try.';
            if (a.cheat && passed) { a.flagged = true; if (U()) U().log('cheatFlag', { try: k + 1, ok: 1 }); return 'Flagged. You saw that.'; }
            hand.wrongFlags = (hand.wrongFlags || 0) + 1; if (U()) U().log('cheatFlag', { try: k + 1, ok: 0 });
            return 'Flagged. Nothing was wrong there.';
        },
        // The result's first step. If a cheat went unflagged, the choice is put to you and this returns true (nothing
        // is paid yet); once chosen, or with nothing to choose, the hand-over is settled and this returns false.
        // `ui`: { say, actions, button, again, replay(k), best(results), did(cheat) }.
        judge(kind, hand, ui) {
            if (hand.settled) return false;
            const idx = hand.attempts.map((a, k) => (a.cheat ? k : -1)).filter(k => k >= 0), open = idx.filter(k => !hand.attempts[k].flagged);
            if (open.length && !hand.verdict) {
                ui.say(`One thing first. On ${tries(open)} I ${ui.did(hand.attempts[open[0]].cheat)}. It got me through.`);
                ui.actions(ui.button('Replay the moment', () => ui.replay(open[0])), ui.button('Let it stand', () => { hand.verdict = 'stand'; ui.again(); }), ui.button('Strike it', () => { hand.verdict = 'strike'; ui.again(); }));
                return true;
            }
            const r = settle(now(), kind, hand, ui.best); state = r.state; keep();
            hand.score = r.score; hand.settled = true;
            const notes = [];
            if (r.live.length) notes.push(`You flagged ${tries(r.live)} as it happened: struck, and ${r.bounty} Marks for catching it.`);
            const later = r.struck.filter(k => !r.live.includes(k));
            if (later.length) notes.push(`${tries(later)[0].toUpperCase() + tries(later).slice(1)} ${later.length === 1 ? 'is' : 'are'} struck.`);
            if (r.struck.length) notes.push(`I will not do that here for ${plural(CHEAT.close, 'run')}.`);
            if (r.stood.length) notes.push(`${tries(r.stood)[0].toUpperCase() + tries(r.stood).slice(1)} ${r.stood.length === 1 ? 'stands' : 'stand'}.`);
            if (r.fine) notes.push(`${plural(hand.wrongFlags, 'wrong flag')}: ${r.fine} Marks.`);
            hand.notes = notes.join(' ');
            if (T() && (r.bounty || r.fine)) T().grant(r.bounty - r.fine);
            if (U() && (idx.length || r.fine)) U().log('cheat', { kind, cheats: idx.length, flagged: r.live.length, struck: r.struck.length, stood: r.stood.length, wrong: hand.wrongFlags || 0, lean: state.lean });
            return false;
        },
    });
    return api;
});
