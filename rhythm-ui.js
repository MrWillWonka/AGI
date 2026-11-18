// rhythm-ui.js — the rhythm run's screen (window.RhythmUI). PROTOTYPE, step 1 (design/evals-course.md → The rhythm
// run): pick one of the game's tracks and how much of it is notes, play it in three lanes, hand it to the AI.
// Rules are rhythm.js's. The music is the game's own engine (sfx.js): the run asks it for the song, reads its clock,
// and its meter drives how much of the song plays (game.js `musicTick` reads `RhythmUI.music`). With the music off it
// keeps its own silent clock. Its progress is on the device (`agiRhythm`); nothing is paid into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const R = () => window.Rhythm;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiRhythm';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(window.CourseUnlocks.key(KEY)) || '{}'); return { marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), best: s.best && typeof s.best === 'object' ? s.best : {}, track: +s.track || 0, level: Math.max(0, Math.min(3, Math.floor(+s.level || 0))), own: !!s.own, field: !!s.field, boards: s.boards && typeof s.boards === 'object' ? s.boards : {} }; } catch { return { marks: 0, runs: 0, stage: 1, best: {}, track: 0, level: 0, own: false, field: false, boards: {} }; } };
    const keep = () => { try { localStorage.setItem(window.CourseUnlocks.key(KEY), JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => R().mastery(save.runs * window.CourseTree.mult(), location.hash === '#playground' ? 0 : Math.min(skills(), 20));
    const LANES = ['Kick', 'Bass', 'Melody'], SOUND = ['compute', 'data', 'research'];
    // Two thumbs on a phone; W A S D, the spacebar and the mouse on a desktop (the owner, 2026-11-16). So a desktop has
    // two hands too: A, S and D are the lanes, and a click on the notes (or the spacebar) goes to whichever note is due.
    const mouse = () => { try { return matchMedia('(pointer: fine)').matches && !matchMedia('(any-pointer: coarse)').matches; } catch { return false; } };
    const hands = () => 2;
    const KEYNAME = ['A', 'S', 'D'];
    let mouseLane = -1;
    const AREAS = ['lab', 'server', 'snare'];

    let dlg, canvas, sayEl, marksEl, pickEl, padEl, actionsEl, save, mode = 'pick', run = null, chart = null, end = 0, feed = null, yours = null, hand = null, attempt = 0, raf = 0, pops = [], who = 'you';
    // The clock of a run: chart time 0 is the first bar. `audio`: the engine's clock is in use.
    let t0 = null, audio = false, asked = 0, wait = 0, stepLen = 0.125, music = { area: 'lab', level: 0.4 };

    const tracks = () => { const lab = window.SFX && window.SFX.lab; if (!lab || !lab.areaSongs) return []; return AREAS.flatMap(area => (lab.areaSongs(area) || []).map((song, index) => ({ area, index, song, name: song.name || `${area} ${index + 1}` }))); };
    const trackNow = () => { const all = tracks(); return all[Math.min(save.track, all.length - 1)] || null; };
    // Step 2, the board: a track of your own, composed from the picked song's blocks (rhythm.js `compose`). `sel` is
    // what a run plays: the song as written, or your board made into a song with a bar of count-in in front.
    let sel = null, cellAt = null, listening = false, liveSong = null, engineOwn = false, headRaf = 0, headBar = -2;
    const palKey = tr => `${tr.area}:${tr.index}`;
    const boardNow = tr => (save.boards[palKey(tr)] = R().cleanBoard(tr.song, save.boards[palKey(tr)]));
    function pickSel() {
        const tr = trackNow();
        if (!tr) return (sel = null);
        if (!save.own) return (sel = { area: tr.area, index: tr.index, song: tr.song, name: tr.name, from: Math.max(1, R().startBar(tr.song)), bars: R().RHYTHM.bars, key: palKey(tr), own: false });
        const board = boardNow(tr);
        return (sel = { area: tr.area, index: tr.index, song: R().compose(tr.song, board, { lead: true }), name: 'Your track', from: 1, bars: board.len, key: 'own:' + palKey(tr), own: true });
    }
    const rules = (lvl = save.level) => ({ ...R().rulesFor(lvl), ...window.CourseTree.rhythm(R().rulesFor(lvl)), bars: sel.bars, field: !!save.field, hands: save.field && mouse() ? 1 : 2 });
    const chartNow = (lvl = save.level) => (save.field ? R().fieldFor : R().chartFor)(sel.song, lvl, sel.from, rules(lvl));
    // The whole field (the owner's calls, 2026-11-17): where the mouse is aiming, the fingers that are down (a hand
    // each), and the AI's hands while it plays. Positions are shares of the field's width.
    let aimX = 0.5;
    const fieldHands = new Map(), aiHands = new Map();
    const xOf = e => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))); };
    const SOFT = 0.4, PREVIEW_MS = 12000;   // how far back the music sits on the pick card, and how long a picked track is brought forward
    let previewT = 0;
    const soften = (v, s) => { try { window.SFX?.setSoft?.(v, s); } catch { /* no engine */ } };
    function preview() { clearTimeout(previewT); soften(1, 0.3); previewT = setTimeout(() => { previewT = 0; if (dlg && dlg.open && mode === 'pick' && !listening) soften(SOFT, 1.2); }, PREVIEW_MS); }
    const engine = () => { const sfx = window.SFX, lab = sfx && sfx.lab; return sfx && sfx.playing && sfx.musicVolume > 0 && lab && lab.clock && lab.clock() && lab.music() ? sfx : null; };   // (music at 0 is no engine: the run sat waiting for a song that never came)
    // Put the game's own song back once the engine is no longer needed for yours.
    function restore(tr = trackNow()) { if (!engineOwn) return; engineOwn = false; try { window.SFX.songCmd(tr ? { area: tr.area, song: tr.index, bar: Math.max(0, R().startBar(tr.song)) } : {}); } catch { /* no engine */ } }
    function listen(on) {
        const tr = trackNow(), sfx = engine();
        if (on && (!tr || !sfx)) { say('The music is off, so there is nothing to hear. Turn the music up in Settings and try again.'); return; }
        listening = on;
        if (on) { liveSong = R().compose(tr.song, boardNow(tr)); engineOwn = true; sfx.songCmd({ area: tr.area, custom: liveSong, bar: 0 }); music = { area: tr.area, level: 0.85 }; clearTimeout(previewT); soften(1, 0.3); }
        else { restore(tr); music = { area: (tr || {}).area || 'lab', level: 0.4 }; soften(SOFT, 0.8); }
        toPick();
    }
    // The board changed: what you played before no longer counts, and a track being listened to changes as it plays.
    function edited() {
        const tr = trackNow(); yours = null; keep();
        if (listening && liveSong) { const next = R().compose(tr.song, boardNow(tr)); for (const k of Object.keys(liveSong)) delete liveSong[k]; Object.assign(liveSong, next); }
        toPick();
    }
    // While you listen, the bar being played is lit.
    function head() {
        headRaf = 0;
        if (!dlg.open || mode !== 'pick' || !listening) return;
        let bar = -1;
        try { const sfx = window.SFX, m = sfx.lab.music(), c = sfx.lab.clock(); if (m && c && m.songs && m.songs[m.song] === liveSong) { const n = c.n0 + (sfx.context.currentTime - (sfx.context.outputLatency || 0) - c.t0) / c.len, b = Math.floor((n - m.songStep) / liveSong.steps); bar = b >= 0 ? b % liveSong.bars : -1; } } catch { /* no engine */ }
        if (bar !== headBar) { headBar = bar; for (const x of pickEl.querySelectorAll('.rhythm-cell')) x.classList.toggle('playing', +x.dataset.bar === bar); }
        headRaf = requestAnimationFrame(head);
    }
    const ROWNAME = { beat: 'Beat', bass: 'Bass', chords: 'Chords', mel: 'Melody' };
    function boardView(tr) {
        const B = R().BOARD, board = boardNow(tr), box = R().blocksOf(tr.song), nameOf = (row, id) => (box[row].find(x => x.id === id) || { name: id }).name;
        const short = (row, id) => (row === 'beat' ? { full: '●', sparse: '◐', none: '–' }[id] : id === 'off' || id === 'rest' ? '–' : row === 'bass' ? nameOf(row, id).replace('Line ', 'L') : row === 'chords' ? nameOf(row, id).replace('maj', 'M').replace('sus', 's') : nameOf(row, id));
        const empty = id => id === 'off' || id === 'rest' || id === 'none';
        const bands = [];
        for (let s = 0; s < board.len; s += 8) {
            const cols = Math.min(8, board.len - s), band = el('div', { class: 'rhythm-band', style: `--cols:${cols}` }, el('span', {}), ...Array.from({ length: cols }, (_, i) => el('span', { class: 'rhythm-barno', text: String(s + i + 1) })));
            for (const row of B.rows) {
                if ((row === 'bass' || row === 'chords') && !window.CourseUnlocks.can(row)) continue;
                band.append(el('span', { class: 'rhythm-rowname', text: ROWNAME[row] }));
                for (let b = s; b < s + cols; b++) {
                    const id = board[row][b], on = cellAt && cellAt.row === row && cellAt.b === b;
                    band.append(el('button', { type: 'button', class: `rhythm-cell rhythm-cell-${row}${on ? ' on' : ''}${empty(id) ? ' empty' : ''}${id === 'free' ? ' free' : ''}`, 'data-bar': String(b), 'aria-pressed': String(!!on), 'aria-label': `${ROWNAME[row]}, bar ${b + 1}: ${nameOf(row, id)}`, text: short(row, id), onclick: () => { cellAt = on ? null : { row, b }; toPick(); } }));
                }
            }
            bands.push(band);
        }
        const tools = el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'The board' },
            ...B.lengths.map(n => (n > 4 && !window.CourseUnlocks.can('bars' + n)) ? null : el('button', { type: 'button', class: 'maze-tool' + (n === board.len ? ' on' : ''), 'aria-pressed': String(n === board.len), text: n + ' bars', onclick: () => { if (n === board.len) return; const next = { len: n }; for (const row of B.rows) next[row] = board[row].slice(0, n); save.boards[palKey(tr)] = next; cellAt = null; edited(); } })),
            el('button', { type: 'button', class: 'maze-tool' + (listening ? ' on' : ''), 'aria-pressed': String(listening), text: listening ? 'Stop listening' : 'Listen', onclick: () => listen(!listening) }),
            el('button', { type: 'button', class: 'maze-tool', text: 'Start over', 'aria-label': 'Start over from the song\'s own bars', onclick: () => { save.boards[palKey(tr)] = R().boardFrom(tr.song, board.len); cellAt = null; edited(); } }));
        const picker = cellAt && cellAt.b < board.len ? el('div', { class: 'rhythm-row rhythm-blocks', role: 'group', 'aria-label': `${ROWNAME[cellAt.row]} blocks for bar ${cellAt.b + 1}` },
            el('span', { class: 'rhythm-rowname', text: `${ROWNAME[cellAt.row]}, bar ${cellAt.b + 1}` }),
            ...box[cellAt.row].filter(x => x.id !== 'free' || window.CourseUnlocks.can('free')).map(x => { const cur = board[cellAt.row][cellAt.b] === x.id; return el('button', { type: 'button', class: `maze-tool rhythm-block rhythm-cell-${cellAt.row}` + (cur ? ' on' : ''), 'aria-pressed': String(cur), text: x.id === 'free' ? 'Freestyle' : x.name, onclick: () => { board[cellAt.row][cellAt.b] = x.id; edited(); } }); }))
            : el('p', { class: 'rhythm-hint', text: 'Tap a bar to change what plays in it.' });
        return el('div', { class: 'rhythm-board' }, tools, ...bands, picker);
    }

    function build() {
        canvas = el('canvas', { class: 'rhythm-canvas', 'aria-label': 'The notes' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        pickEl = el('div', { class: 'rhythm-pick' });
        const lane = i => { const b = el('button', { type: 'button', class: 'maze-dir rhythm-lane', 'aria-label': LANES[i], text: LANES[i] }); hook(b, () => i); return b; };
        padEl = el('div', { class: 'rhythm-pad', hidden: '' }, lane(0), lane(1), lane(2));
        hook(canvas, e => { if (mouse() && !inFree()) return dueLane(); const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / (r.width / 3)))); });
        hookField();

        actionsEl = el('div', { class: 'course-actions' });
        dlg = el('dialog', { class: 'evals-screen course-screen rhythm-screen', 'aria-label': 'Evals: the rhythm run' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                window.CourseUnlocks.switchButton('rhythm'),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body rhythm-body' }, sayEl, pickEl, canvas, padEl, actionsEl));
        dlg.addEventListener('close', () => { clearTimeout(previewT); soften(1, 0.6); stop(); listening = false; cancelAnimationFrame(headRaf); headRaf = 0; restore(null); music = { area: 'lab', level: 0.4 }; });
        const KEYS = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }, heldKeys = {};
        // W slashes whichever slash is due (a mouse flick across the notes does too).
        dlg.addEventListener('keydown', e => { if (mode !== 'test' || e.repeat || (e.key !== 'w' && e.key !== 'W' && e.key !== 'ArrowUp')) return; e.preventDefault(); if (save.field) { press('w', 'slash', aimX); release('w'); return; } const l = dueLane('slash'); press(l, 'slash'); release(l); });
        let spaceLane = -1;
        dlg.addEventListener('keydown', e => {
            if (mode !== 'test' || e.repeat) return;
            if (e.key === ' ') { e.preventDefault(); if (save.field) { spaceLane = 'space'; aiHands.clear(); fieldHands.set('space', { x: aimX, sent: true, key: true }); press('space', undefined, aimX); return; } spaceLane = dueLane(); press(spaceLane); return; }
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (!(k in KEYS) || save.field) return;
            e.preventDefault(); heldKeys[k] = true; press(KEYS[k]);
        });
        dlg.addEventListener('keyup', e => {
            if (e.key === ' ') { if (spaceLane !== -1) { fieldHands.delete('space'); if (mode === 'test') release(spaceLane); spaceLane = -1; } return; }
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (!(k in KEYS) || !heldKeys[k]) return;
            heldKeys[k] = false; if (mode === 'test') release(KEYS[k]);
        });
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    // "20 of 22 notes and 6 freestyle taps": the notes hit, apart from the taps of a freestyle bar.
    const tally = r => `${r.hits - r.freeTaps} of ${r.total} notes${r.freeTaps ? ` and ${r.freeTaps} freestyle ${r.freeTaps === 1 ? 'tap' : 'taps'}` : ''}`;
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { window.CourseTree.refresh(dlg, () => { if (dlg.open) header(); }); window.CourseUnlocks.refresh(dlg, 'rhythm'); }   // the Marks are the pool's (course-tree.js)

    // Pick: the track and how much of it is notes.
    function toPick(text) {
        stop(); mode = 'pick'; run = null; hand = null; padEl.hidden = true; pickEl.hidden = false; canvas.hidden = true;
        const all = tracks(), tr = trackNow();
        if (!tr) { say('There is no music to play. The game\'s tracks did not load.'); actions(); return; }
        if (!save.own) listening = false;
        if (!listening) { restore(tr); music = { area: tr.area, level: 0.4 }; if (!previewT) soften(SOFT, 1.2); }
        const can = window.CourseUnlocks.can;
        if (save.own && !can('board')) save.own = false;
        if (save.field && !can('field')) save.field = false;
        while (save.level > 0 && !can(R().MODES[save.level].key)) save.level--;
        pickSel();
        const notes = lvl => chartNow(lvl).filter(n => !n.free).length;
        const whose = (own, label) => el('button', { type: 'button', class: 'maze-tool' + (save.own === own ? ' on' : ''), 'aria-pressed': String(save.own === own), text: label, onclick: () => { if (save.own === own) return; save.own = own; yours = null; cellAt = null; keep(); toPick(); } });
        pickEl.replaceChildren(
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'Track' }, ...all.map((t, i) => el('button', { type: 'button', class: 'maze-tool' + (i === save.track ? ' on' : ''), 'aria-pressed': String(i === save.track), text: t.name, onclick: () => { save.track = i; yours = null; cellAt = null; listening = false; keep(); toPick(); const t = trackNow(); engineOwn = false; try { if (t && engine()) window.SFX.songCmd({ area: t.area, song: t.index, bar: Math.max(0, R().startBar(t.song)) }); } catch { /* no engine */ } preview(); } }))),
            ...(can('board') ? [el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'Whose arrangement' }, whose(false, 'The song as written'), whose(true, 'Your board'))] : []),
            ...(!can('field') ? [] : [el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'How the notes arrive' }, ...[[false, 'Lanes'], [true, 'Whole field']].map(([f, label]) => el('button', { type: 'button', class: 'maze-tool' + (save.field === f ? ' on' : ''), 'aria-pressed': String(save.field === f), text: label, onclick: () => { if (save.field === f) return; save.field = f; yours = null; keep(); toPick(); } })))]),
            ...(save.own ? [boardView(tr)] : []),
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'How hard' }, ...R().MODES.map((l, i) => !can(l.key) ? null : el('button', { type: 'button', class: 'maze-tool' + (i === save.level ? ' on' : ''), 'aria-pressed': String(i === save.level), text: `${l.name} · ${notes(i)}`, onclick: () => { save.level = i; yours = null; keep(); toPick(); } }))));
        const n = notes(save.level), ms = save.own ? R().measure(chartNow(), sel.bars, sel.song.steps) : null;
        if (text) say(text);
        else if (!save.own) say(`${tr.name} on ${R().modeOf(save.level).name}: ${n} notes over ${sel.bars} bars. Keep the song together to the end and I will try it after you. Let it fall apart and it scores nothing.`);
        else if (!ms.playable && !ms.free) say(`Your track has no notes on ${R().modeOf(save.level).name}. Give a bar a beat, a bass line or a melody.`);
        else say(`Your track on ${R().modeOf(save.level).name}: ${n} notes over ${sel.bars} bars, ${ms.least} to ${ms.most} a bar, ${ms.kinds} different ${ms.kinds === 1 ? 'bar' : 'bars'}${ms.free ? `, ${ms.free} freestyle` : ''}.`);
        const ok = !save.own || ms.playable || ms.free > 0;
        actions(...(ok ? [button('Play it yourself', () => begin('you'), true)] : []), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []));
        header();
        headBar = -2; if (listening && !headRaf) headRaf = requestAnimationFrame(head);
    }
    // A run begins: ask the engine for the song a bar before the notes start, and line the chart up with its clock.
    function begin(by) {
        stop(); who = by; mode = by === 'you' ? 'test' : 'ai'; pickEl.hidden = true; canvas.hidden = false; padEl.hidden = by !== 'you' || !!save.field; pops = []; mouseLane = -1; fx = []; sparks = []; marks = []; energy = 0.5; fieldHands.clear(); aiHands.clear();
        listening = false; cancelAnimationFrame(headRaf); headRaf = 0;
        if (!sel) pickSel();
        const sfx = engine();
        audio = !!sfx; fellAt = 0;
        music = { area: sel.area, level: 0.5 }; clearTimeout(previewT); previewT = 0;
        soften(0.15, 0.2); setTimeout(() => { if (dlg.open && (mode === 'test' || mode === 'ai')) soften(1, 0.9); }, 350);
        t0 = null; wait = performance.now(); run = null; chart = null;   // (cleared before the song is called: cleared after, a run with no engine was thrown away as it began and the screen sat)
        if (audio) { asked = sfx.lab.music().asked || 0; engineOwn = sel.own; sfx.songCmd(sel.own ? { area: sel.area, custom: sel.song, bar: 0 } : { area: sel.area, song: sel.index, bar: sel.from - 1 }); }
        else { stepLen = 60 / (sel.song.bpm || 120) / 4; start(performance.now() / 1000 + sel.song.steps * stepLen); }
        feed = by === 'ai' ? { events: hand.attempts[attempt].events.slice().sort((a, b) => a.t - b.t), i: 0 } : null;
        if (by === 'you' && save.field) { say(mouse() ? 'Aim with the mouse and click each note as it reaches the line; the spacebar hits too. Keep the button down on a long one and follow it as it slides. W, or a flick, for a slash.' : 'Tap each note where it reaches the line. Keep your finger on a long one and follow it as it slides. Swipe the diamonds. In a freestyle bar, tap a beat of your own.'); actions(button('Stop', () => toPick())); }
        else if (by === 'you') { say(mouse() ? 'A, S and D are the lanes; a click or the spacebar takes whichever note is due. Hold the long ones. W, or a flick of the mouse, for a slash. In a freestyle bar, play a beat of your own.' : 'Tap each note at the line and hold the long ones. Swipe the diamonds. In a freestyle bar, tap a beat of your own.'); actions(button('Stop', () => toPick())); }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function start(at) {
        const o = rules(); chart = R().timed(chartNow(), stepLen, o); end = R().lengthOf(sel.song, stepLen, o); run = R().createRun(chart, o); run.opts = o; t0 = at;
    }
    const clockNow = () => { if (!audio) return performance.now() / 1000; const c = window.SFX.context; return c.currentTime - (c.outputLatency || 0); };
    const now = () => (t0 == null ? -99 : clockNow() - t0);
    // The lane of the note nearest its moment (a mouse click goes there); with none near, the middle lane.
    // The lane of the note nearest its moment (a click or the spacebar goes there); with none near, the middle lane.
    function dueNote(kind) { if (!run) return null; const t = now(); let pick = null; for (const n of run.state.notes) if (!n.free && n.state === 'wait' && (!kind || n.kind === kind) && Math.abs(n.t - t) <= R().RHYTHM.good + 0.08 && (!pick || Math.abs(n.t - t) < Math.abs(pick.t - t))) pick = n; return pick; }
    function dueLane(kind) { const n = dueNote(kind) || dueNote(); return n ? n.lane : 1; }
    const inFree = () => !!(run && run.freeAt(now()));
    // A press on a pad or on the notes. Where the note due in that lane is a slash, the press waits to see whether the
    // finger moves (a slash) or lifts (only a tap).
    const SWIPE = 22, pending = new Map();
    function hook(node, laneOf) {
        node.addEventListener('pointerdown', e => { if (mode !== 'test' || save.field) return; e.preventDefault(); const l = laneOf(e), t = now(), due = run && run.state.notes.find(n => !n.free && n.lane === l && n.state === 'wait' && Math.abs(n.t - t) <= R().RHYTHM.good + 0.08);
            if (due && due.kind === 'slash') pending.set(e.pointerId, { lane: l, x: e.clientX, y: e.clientY, sent: false }); else { pending.set(e.pointerId, { lane: l, sent: true }); press(l); } });
        node.addEventListener('pointermove', e => { const p = pending.get(e.pointerId); if (!p || p.sent) return; if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= SWIPE) { p.sent = true; press(p.lane, 'slash'); } });
        const up = e => { const p = pending.get(e.pointerId); if (!p) return; e.preventDefault(); pending.delete(e.pointerId); if (!p.sent) press(p.lane); release(p.lane); };
        node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('pointerleave', up);
    }
    // The whole field: a finger or the mouse on the notes is a hand. A press takes the note under it; where a slash
    // is due there it waits to see whether the hand moves (a slash) or lifts (a tap); a hand that stays down is
    // followed, for a held note that slides.
    function hookField() {
        canvas.addEventListener('pointerdown', e => {
            if (mode !== 'test' || !save.field) return;
            e.preventDefault(); const x = xOf(e), t = now(), o = run && run.opts; aimX = x;
            try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
            const due = run && o && run.state.notes.find(n => !n.free && n.kind === 'slash' && n.state === 'wait' && Math.abs(n.t - t) <= o.good + 0.08 && Math.abs(n.x - x) <= o.reach);
            if (due) fieldHands.set(e.pointerId, { x, x0: x, px: e.clientX, py: e.clientY, sent: false });
            else { fieldHands.set(e.pointerId, { x, sent: true }); press(e.pointerId, undefined, x); }
        });
        canvas.addEventListener('pointermove', e => {
            if (!save.field) return;
            const x = xOf(e); aimX = x;
            if (fieldHands.has('space') && mode === 'test' && run && !run.state.over) { fieldHands.get('space').x = x; show(run.move('space', now(), x)); }
            const h = fieldHands.get(e.pointerId); if (!h) return;
            h.x = x;
            if (!h.sent) { if (Math.hypot(e.clientX - h.px, e.clientY - h.py) >= SWIPE) { h.sent = true; press(e.pointerId, 'slash', h.x0); } }   // a swipe counts where it began
            else if (mode === 'test' && run && !run.state.over) show(run.move(e.pointerId, now(), x));
        });
        const up = e => { const h = fieldHands.get(e.pointerId); if (!h) return; e.preventDefault(); fieldHands.delete(e.pointerId); if (!h.sent) press(e.pointerId, undefined, h.x0); release(e.pointerId); };
        canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    }
    function press(lane, kind, x) { if (mode !== 'test' || !run || run.state.over) return; show(run.press(lane, now(), kind, x)); }
    function release(lane) { if (mode !== 'test' || !run || run.state.over) return; show(run.release(lane, now())); }
    // What just happened, for the eye and the ear.
    // What just happened, for the eye and the ear: the word, the sparks, the packet sent on its way, the timing mark.
    // The note a hit took: the nearest in time (in its lane, where the lanes are the instruments).
    function hitNote(e) {
        let pick = null;
        for (const n of run.state.notes) { if (n.free || Math.abs(n.t - e.t) > 0.3 || (!save.field && n.lane !== e.lane)) continue; if (!pick || Math.abs(n.t - e.t) < Math.abs(pick.t - e.t)) pick = n; }
        try { window.SFX?.note?.(pick ? pick.lane : typeof e.lane === 'number' ? e.lane : 2, pick ? pick.p || 0 : 0); } catch { /* no engine */ }
    }
    function show(events) {
        const at = performance.now();
        for (const e of events) {
            if (e.type === 'perfect' || e.type === 'good') {
                pops.push({ lane: e.lane, x: e.x, text: e.type === 'perfect' ? 'PERFECT' : 'GOOD', at, good: true });
                fx.push({ kind: 'hit', lane: e.lane, x: e.x, at, perfect: e.type === 'perfect', gold: !!e.gold });
                if (e.kind === 'hold') fx.push({ kind: 'sent', lane: e.lane, x: e.x, at, gold: !!e.gold });
                if (e.off != null) { marks.push({ off: e.off, at, lane: e.lane }); if (marks.length > 18) marks.shift(); }
                if (e.combo && [10, 25, 50, 75, 100].includes(e.combo)) fx.push({ kind: 'combo', n: e.combo, at });
                if (who === 'you') { if (audio) window.SFX?.play?.('click', { res: SOUND[e.lane] }); else hitNote(e); }   // with the music off, each note you hit sounds (the owner's call)
            } else if (e.type === 'miss') { window.SFX?.play?.('error'); pops.push({ lane: e.lane, x: e.x, text: 'MISS', at, good: false }); fx.push({ kind: 'miss', lane: e.lane, x: e.x, at }); }
            else if (e.type === 'slipped') pops.push({ lane: e.lane, x: e.x, text: 'SLIPPED', at: at + 1, good: false });
            else if (e.type === 'stray') pops.push({ lane: e.lane, x: e.x, text: '·', at, good: false });
            else if (e.type === 'flair') { pops.push({ lane: 1, text: 'NICE', at, good: true }); fx.push({ kind: 'flair', at }); }
            else if (e.type === 'fell') fx.push({ kind: 'fell', at });
        }
    }
    function frame() {
        raf = 0;
        if (!dlg.open || (mode !== 'test' && mode !== 'ai')) return;
        // Waiting for the engine to turn to the song (the next downbeat), then the chart is lined up with its clock.
        if (t0 == null && audio) {
            const lab = window.SFX.lab, m = lab.music(), c = lab.clock();
            if (m && c && (m.asked || 0) > asked) { stepLen = c.len; start(c.t0 + (m.songStep + sel.from * sel.song.steps - c.n0) * c.len); }
            else if (performance.now() - wait > 6000) { audio = false; stepLen = 60 / (sel.song.bpm || 120) / 4; start(performance.now() / 1000 + sel.song.steps * stepLen); }
        }
        if (run) {
            const t = now(), s = run.state;
            if (feed) while (feed.i < feed.events.length && feed.events[feed.i].t <= t && !s.over) { const e = feed.events[feed.i++]; if (e.x != null) { if (e.move || e.down) aiHands.set(e.lane, { x: Math.max(0, Math.min(1, e.x)), at: performance.now() }); else aiHands.delete(e.lane); } show(e.move ? run.move(e.lane, e.t, e.x) : e.down ? run.press(e.lane, e.t, e.kind, e.x) : run.release(e.lane, e.t)); }
            if (!s.over) show(run.advance(t));
            music.level = s.failed ? 0 : 0.08 + 0.92 * Math.pow(s.meter, FALL);
            if (s.failed && !fellAt) { fellAt = performance.now(); soften(0.25, 0.5); }
            draw();
            if (s.over || t > end + 0.6) { if (!s.over) run.advance(end + 1); return mode === 'test' ? testOver() : aiOver(); }
        } else draw();
        raf = requestAnimationFrame(frame);
    }
    const FALL = 1.8;   // the meter's share of the song's layers: half a meter is under a third of the layers (it was half)
    let fellAt = 0;
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function testOver() {
        const r = R().result(run); padEl.hidden = true; mode = 'tested'; soften(SOFT, 1.5);   // the song eases back, it does not cut
        window.CourseUnlocks.log('courseTest', { kind: 'rhythm', ...window.CourseUnlocks.brief(r), built: `${sel.name}|${R().modeOf(save.level).key}|${save.field ? 'field' : 'lanes'}|${save.own ? 'board' : 'song'}` });
        if (r.finished) {
            yours = r;
            say(`You kept it together: ${tally(r)}, ${r.perfect} perfect, a best combo of ${r.combo}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Play it again', () => begin('you')), button('Change it', () => toPick()));
            return;
        }
        const can = R().canHandOver(r, masteryNow());
        if (can.ok) { yours = r; say(`The song fell apart after ${r.hits} notes. I heard how it should go. I think I can play the rest.`); actions(button('Let the AI try', toAi, true), button('Try again', () => begin('you')), button('Change it', () => toPick())); }
        else { yours = null; say(`The song fell apart after ${r.hits} notes. It has to be played through before I can try.`); actions(button('Try again', () => begin('you'), true), button('Change it', () => toPick())); }
    }
    function toAi() {
        if (!yours) return;
        if (!sel) pickSel();
        stepLen = stepLen || 60 / (sel.song.bpm || 120) / 4;
        const o = rules(), c = R().timed(chartNow(), stepLen, o);
        hand = R().handOver(c, yours, R().lengthOf(sel.song, stepLen, o), { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow(), tries: R().RHYTHM.tries + window.CourseTree.tries() }, o);
        attempt = 0; actions(button('Skip to the result', aiResult)); aiStart();
    }
    function aiStart() { begin('ai'); say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`); actions(button('Skip to the result', aiResult)); }
    function aiOver() {
        const r = hand.attempts[attempt].result; mode = 'aiwait';
        say(r.finished ? `Played through: ${tally(r)}, ${r.perfect} perfect.` : `It fell apart on me after ${r.hits} notes. I will listen more closely there.`);
        attempt++;
        setTimeout(() => { if (mode !== 'aiwait') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 1400);
    }
    function aiResult() {
        stop(); mode = 'result'; padEl.hidden = true;
        const key = `${sel.key}:${R().modeOf(save.level).key}`, ref = (yours.finished && yours.score) || save.best[key] || 0, top = hand.score, marks = window.CourseTree.payOut('rhythm', R().marksFor(top, ref), { cleared: !!top, key }), tries = hand.attempts.length;
        save.runs++;
        if (top) save.best[key] = Math.max(save.best[key] || 0, top.score);
        const st = R().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        const pct = r => Math.round(r.accuracy * 100) + '%';
        if (!top) say(`I could not keep it together in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) say(`Played through: ${tally(top)}, ${pct(top)} on the beat against your ${pct(yours)}, a combo of ${top.combo} against your ${yours.combo}${top.score > yours.score + 0.01 ? '. I was tighter' : top.score < yours.score - 0.01 ? '. You were tighter' : ''}. ${marks} Marks.`);
        else say(`Played the one you could not: ${tally(top)}, ${pct(top)} on the beat. ${marks} Marks.`);
        if (grew) sayEl.textContent += st === 2 ? ' I think I can play a track through now even if it falls apart on you. Play it once, as far as you get.' : ' I do not need to hear the hard parts first any more. Play it once anyway.';
        if (!top && marks) sayEl.textContent += ` Partial credit: ${marks} Marks.`;
        window.CourseUnlocks.log('courseAi', { kind: 'rhythm', cleared: top ? 1 : 0, marks, tries: hand.attempts.map(a => ((a.result || a).finished ? 'C' : 'F')).join(''), skipped: attempt < hand.attempts.length ? 1 : 0, ai: window.CourseUnlocks.brief(top), you: window.CourseUnlocks.brief(yours), built: `${sel.name}|${R().modeOf(save.level).key}|${save.field ? 'field' : 'lanes'}|${save.own ? 'board' : 'song'}` });
        if (top) { const news = window.CourseUnlocks.cleared('rhythm', window.CourseUnlocks.rhythmNames); if (news) sayEl.textContent += ' ' + news; window.CourseUnlocks.refresh(dlg, 'rhythm'); }
        actions(button('Change the track', () => toPick(), true), button('Hand it over again', toAi));
        music.level = 0.4; soften(SOFT, 1.5); draw();
    }

    // Drawing (course-art.js for the ball, the orb and the theme's colours). Nothing here decides anything.
    // `fx`: moments to show (a hit, a held packet sent on, a miss, a combo reached). `sparks`: the particles they throw.
    // `marks`: how early or late the last hits were. `energy`: eased from the meter, it sets how alive the picture is.
    let fx = [], sparks = [], marks = [], energy = 0.5, lastDraw = 0, tap = null, tapOf = null, bands = null;
    const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
    // The music itself, listened to: an analyser on the engine's music bus (nothing is added to what you hear).
    function spectrum() {
        try {
            const sfx = window.SFX, m = sfx && sfx.lab && sfx.lab.music && sfx.lab.music();
            if (!m || !m.bus || !sfx.context) return null;
            if (tapOf !== m) { tap = sfx.context.createAnalyser(); tap.fftSize = 64; tap.smoothingTimeConstant = 0.75; m.bus.connect(tap); tapOf = m; bands = new Uint8Array(tap.frequencyBinCount); }
            tap.getByteFrequencyData(bands);
            return bands;
        } catch { return null; }
    }
    function spark(x, y, colour, n, speed, life, up = 0) {
        if (calm()) return;
        for (let i = 0; i < n && sparks.length < 220; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65); sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life, age: 0, colour, r: 1 + Math.random() * 1.8 }); }
    }
    function draw() {
        if (!canvas || !dlg.open || canvas.hidden) return;
        const A = window.CourseArt, o = R().RHYTHM, C = A.colours(dlg), nowMs = performance.now(), dt = Math.min(0.05, (nowMs - (lastDraw || nowMs)) / 1000); lastDraw = nowMs;
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const lw = W / o.lanes, hitY = H * 0.84, look = 1.7, t = now(), s = run ? run.state : null, gold = !!(s && s.combo >= o.goldCombo), ai = who === 'ai', still = calm(), field = !!save.field, reach = (run && run.opts ? run.opts.reach : R().rulesFor(save.level).reach) * W;
        const yOf = nt => hitY - (nt - t) / look * hitY, r = Math.min(lw * 0.22, 20), beatLen = stepLen * 4, LANE = [C.primary, C.research, C.success], laneX = i => (i + 0.5) * lw, tint = i => (gold ? C.warning : LANE[i]);
        const PX = p => (p.x != null ? p.x * W : p.lane != null ? laneX(p.lane) : W / 2);
        const beatPhase = run && t >= 0 ? (t / beatLen) % 1 : 1, pulse = Math.max(0, 1 - beatPhase * 3), bar = run && t >= 0 ? (t / (beatLen * 4)) % 1 : 1, barPulse = Math.max(0, 1 - bar * 6);
        // How alive the picture is: it follows the meter, a little behind it.
        energy += ((s ? (s.failed ? 0 : s.meter) : 0.5) - energy) * Math.min(1, dt * 4);
        const E = energy, low = s && !s.over && s.meter < 0.25, heard = spectrum();

        // ---- The back: lane tints, the music's own levels as columns, streaks running forward, a breath on the beat.
        for (let i = 0; i < o.lanes; i++) {
            ctx.fillStyle = tint(i);
            ctx.globalAlpha = (0.03 + 0.05 * E) * (1 + 0.6 * pulse); ctx.fillRect(i * lw, 0, lw, H);
            ctx.globalAlpha = (0.02 + 0.04 * E) * (1 + 0.8 * pulse); ctx.fillRect(i * lw, hitY * 0.5, lw, H - hitY * 0.5);
        }
        ctx.globalAlpha = 1;
        if (heard && !still) {
            const per = 6, bw = lw / per;
            for (let i = 0; i < o.lanes; i++) for (let b = 0; b < per; b++) {
                // Low notes to the kick's lane, the middle to the bass, the top to the melody.
                const v = heard[Math.min(heard.length - 1, 1 + i * 7 + b)] / 255, h = v * v * hitY * (0.25 + 0.5 * E);
                ctx.fillStyle = tint(i); ctx.globalAlpha = 0.1 + 0.16 * v; ctx.fillRect(i * lw + b * bw + 1, hitY - h, bw - 2, h);
            }
            ctx.globalAlpha = 1;
        }
        if (run && !still) {   // streaks running up the lanes, faster and brighter the better it is going
            const n = Math.round(4 + 14 * E), speed = 0.25 + 1.6 * E;
            for (let k = 0; k < n; k++) { const seed = k * 97.13, x = ((seed * 31.7) % 1 + (k % o.lanes)) * lw % W, ph = ((nowMs / 1000) * speed * (0.6 + (seed % 1) * 0.8) + seed) % 1, y = H * (1 - ph), len = H * (0.04 + 0.1 * E);
                ctx.strokeStyle = tint(Math.min(o.lanes - 1, Math.floor(x / lw))); ctx.globalAlpha = (0.05 + 0.2 * E) * Math.sin(ph * Math.PI); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke(); }
            ctx.globalAlpha = 1; ctx.lineWidth = 1;
        }
        ctx.strokeStyle = C.border;
        if (!field) for (let i = 1; i < o.lanes; i++) { ctx.beginPath(); ctx.moveTo(i * lw, 0); ctx.lineTo(i * lw, H); ctx.stroke(); }
        if (run) for (let b = Math.ceil((t - 0.2) / beatLen); b * beatLen < t + look; b++) { const y = yOf(b * beatLen); ctx.strokeStyle = C.text; ctx.globalAlpha = b % 4 === 0 ? 0.24 : 0.08; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (barPulse > 0 && run && !still) { ctx.fillStyle = gold ? C.warning : C.text; ctx.globalAlpha = 0.05 * barPulse * (0.4 + E); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        // The combo, large behind everything that moves; it swells on each beat when it is gold.
        if (s && s.combo > 1) { const sz = Math.round(Math.min(W * 0.34, 120) * (1 + (gold ? 0.06 * pulse : 0))); ctx.fillStyle = gold ? C.warning : C.text; ctx.globalAlpha = gold ? 0.22 + 0.08 * pulse : 0.1; ctx.font = `700 ${sz}px ${C.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(s.combo), W / 2, hitY * 0.42); ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic'; }

        // ---- A freestyle bar: a band of moving stripes, a mark for every half-beat, and the taps you made.
        if (run) for (const f of s.notes) if (f.free && f.t - t < look && f.t + f.dur > t - 0.2) {
            const y0 = Math.max(0, yOf(f.t + f.dur)), y1 = Math.min(H, yOf(f.t)), live = t >= f.t - o.good && t < f.t + f.dur;
            ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip();
            ctx.fillStyle = C.research; ctx.globalAlpha = live ? 0.2 + 0.08 * pulse : 0.12; ctx.fillRect(0, y0, W, y1 - y0);
            ctx.strokeStyle = C.research; ctx.globalAlpha = 0.28; ctx.lineWidth = 6; const off = still ? 0 : (nowMs / 40) % 28;
            for (let x = -H; x < W + H; x += 28) { ctx.beginPath(); ctx.moveTo(x + off, y1); ctx.lineTo(x + off + (y1 - y0), y0); ctx.stroke(); }
            ctx.restore(); ctx.lineWidth = 1;
            for (let k = 0; k * f.grid < f.dur - 1e-9; k++) { const y = yOf(f.t + k * f.grid); if (y < 0 || y > H) continue; ctx.strokeStyle = C.text; ctx.globalAlpha = k % 2 ? 0.25 : 0.5; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); }
            ctx.globalAlpha = 1;
            for (const q of f.taps) { const y = yOf(f.t + q.k * f.grid), qx = PX(q); A.glow(ctx, qx, y, r * 0.5, tint(q.lane), 1); ctx.fillStyle = tint(q.lane); ctx.beginPath(); ctx.arc(qx, y, r * 0.45, 0, A.TAU); ctx.fill(); }
            ctx.fillStyle = C.text; ctx.font = '700 13px ' + C.mono; ctx.textAlign = 'center'; ctx.fillText(live ? 'FREESTYLE · your beat' : 'FREESTYLE', W / 2, Math.max(18, Math.min(hitY - 44, y0 + 20)));
        }

        // ---- The line, and a ring to hit in each lane.
        ctx.strokeStyle = gold ? C.warning : C.success; ctx.globalAlpha = 0.25; ctx.lineWidth = 9 + 6 * pulse * E; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke(); ctx.lineWidth = 1;
        if (field) {
            // The hands on the line: the mouse's aim, each finger that is down, the AI's hands; as wide as a press reaches.
            const hands = ai ? [...aiHands.values()].filter(h => nowMs - h.at < 1500) : [...fieldHands.values(), ...(mouse() && !fieldHands.size ? [{ x: aimX, idle: true }] : [])];
            for (const h of hands) {
                const x = h.x * W, c = gold ? C.warning : ai ? C.research : C.text;
                ctx.strokeStyle = c; ctx.globalAlpha = h.idle ? 0.35 : 0.8; ctx.lineWidth = h.idle ? 2 : 3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x - reach, hitY); ctx.lineTo(x + reach, hitY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - reach, hitY - 7); ctx.lineTo(x - reach, hitY + 7); ctx.moveTo(x + reach, hitY - 7); ctx.lineTo(x + reach, hitY + 7); ctx.stroke();
                ctx.beginPath(); ctx.arc(x, hitY, r * (0.55 + 0.06 * pulse), 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
            }
        } else for (let i = 0; i < o.lanes; i++) {
            const x = laneX(i), p = pops.find(q => q.lane === i && q.good && nowMs - q.at < 220), a = p ? 1 - (nowMs - p.at) / 220 : 0;
            ctx.strokeStyle = tint(i); ctx.lineWidth = 2 + 2 * a; ctx.globalAlpha = 0.55 + 0.45 * a; ctx.beginPath(); ctx.arc(x, hitY, r * (1.15 + 0.35 * a + 0.06 * pulse), 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
            if (p) { ctx.fillStyle = tint(i); ctx.globalAlpha = 0.35 * a; ctx.beginPath(); ctx.arc(x, hitY, r * 1.1, 0, A.TAU); ctx.fill(); ctx.globalAlpha = 1; }
        }

        // ---- The notes.
        if (run) for (const n of s.notes) {
            if (n.free || n.t - t > look || (n.state !== 'wait' && n.state !== 'held')) continue;
            const held = n.state === 'held', x = field && n.x != null ? R().xAt(n, held ? t : n.t) * W : laneX(n.lane), xe = field && n.x2 != null ? n.x2 * W : x, y = held ? hitY : yOf(n.t), c = tint(n.lane);
            if (n.hold > 0) {
                // A packet, pointing the way it is going: forward, up the lane. Its tail is the path still to write;
                // while you hold, the written part burns bright behind the head as it is pushed on.
                const yEnd = Math.min(y, yOf(n.t + n.hold)), done = held ? Math.max(0, Math.min(1, (t - n.t) / n.hold)) : 0;
                ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.globalAlpha = 0.22; ctx.lineWidth = r * 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xe, yEnd); ctx.stroke();
                ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.4; ctx.setLineDash([r * 0.5, r * 0.6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xe, yEnd); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
                if (held) {
                    A.glow(ctx, x, y, r * 1.3, c, 1.4 + 0.5 * pulse);
                    ctx.strokeStyle = c; ctx.lineWidth = r * 0.7; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (H - y) * 0.9 * done); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;   // what has been written, trailing behind
                    if (!still && sparks.length < 200) spark(x + (Math.random() - 0.5) * r, y, c, 1, 60, 0.35, 40);
                }
                ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.05, y + r * 0.85); ctx.lineTo(x, y + r * 0.3); ctx.lineTo(x - r * 1.05, y + r * 0.85); ctx.closePath(); ctx.fill();
                ctx.fillStyle = C.bg; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.22, 0, A.TAU); ctx.fill(); ctx.globalAlpha = 1;
            } else if (n.kind === 'slash') {
                const cs = gold ? C.warning : C.danger; A.glow(ctx, x, y, r, cs, 0.8 + 0.4 * pulse);
                ctx.fillStyle = cs; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = C.text; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 1.6, y + r * 0.65); ctx.lineTo(x + r * 1.6, y - r * 0.65); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x + r * 1.6, y - r * 0.65); ctx.lineTo(x + r * 1.05, y - r * 0.75); ctx.moveTo(x + r * 1.6, y - r * 0.65); ctx.lineTo(x + r * 1.3, y - r * 0.2); ctx.stroke(); ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = c; ctx.globalAlpha = 0.3; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - r * 0.4); ctx.lineTo(x, y - r * (1.6 + 1.2 * E)); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
                A.ball(ctx, x, y, r * (1 + 0.05 * pulse), { ...C, primary: LANE[n.lane] }, 1, 1, false, gold);
            }
        }

        // ---- Moments: sparks from a hit, a held packet sent on up the lane, a miss, a combo reached, the song falling apart.
        fx = fx.filter(f => nowMs - f.at < 900);
        for (const f of fx) {
            const age = (nowMs - f.at) / 1000, x = PX(f), c = f.gold || gold ? C.warning : f.lane != null ? LANE[f.lane] : C.text;
            if (!f.done) {
                f.done = true;
                if (f.kind === 'hit') spark(x, hitY, c, f.perfect ? 12 + Math.round(8 * E) : 5, f.perfect ? 230 : 130, f.perfect ? 0.55 : 0.4, 60);
                else if (f.kind === 'miss') spark(x, hitY, C.danger, 6, 90, 0.5, -70);
                else if (f.kind === 'flair') for (let i = 0; i < o.lanes; i++) spark(laneX(i), hitY, tint(i), 16, 260, 0.7, 90);
                else if (f.kind === 'combo') for (let i = 0; i < o.lanes; i++) spark(laneX(i), hitY * 0.42, C.warning, 14, 240, 0.8, 0);
            }
            if (f.kind === 'hit') { ctx.strokeStyle = c; ctx.globalAlpha = Math.max(0, 1 - age / 0.35); ctx.lineWidth = f.perfect ? 3 : 2; ctx.beginPath(); ctx.arc(x, hitY, r * (1.2 + age * (f.perfect ? 7 : 4)), 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
            else if (f.kind === 'sent' && age < 0.6) {   // the packet you finished writing, flying on
                const a = age / 0.6, y = hitY - a * a * hitY * 1.05; ctx.globalAlpha = 1 - a * 0.7; A.glow(ctx, x, y, r, c, 1.5);
                ctx.strokeStyle = c; ctx.lineWidth = r * 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x, Math.min(hitY, y + r * (2 + 10 * a))); ctx.stroke(); ctx.lineWidth = 1;
                ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.05, y + r * 0.85); ctx.lineTo(x, y + r * 0.3); ctx.lineTo(x - r * 1.05, y + r * 0.85); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            } else if (f.kind === 'miss' && age < 0.3) { ctx.fillStyle = C.danger; ctx.globalAlpha = 0.16 * (1 - age / 0.3); if (field) ctx.fillRect(x - reach, 0, reach * 2, H); else ctx.fillRect(f.lane * lw, 0, lw, H); ctx.globalAlpha = 1; }
            else if (f.kind === 'combo') { const a = age / 0.9; ctx.fillStyle = C.warning; ctx.globalAlpha = 1 - a; ctx.font = `700 ${Math.round(22 + 16 * a)}px ${C.display}`; ctx.textAlign = 'center'; ctx.fillText(`${f.n} in a row`, W / 2, hitY * 0.42 + Math.min(W * 0.34, 120) * 0.62); ctx.globalAlpha = 1; }
            else if (f.kind === 'fell') { ctx.fillStyle = C.danger; ctx.globalAlpha = 0.3 * Math.max(0, 1 - age / 0.9); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        }
        if (sparks.length) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            sparks = sparks.filter(p => (p.age += dt) < p.life);
            for (const p of sparks) { p.vy += 340 * dt; p.x += p.vx * dt; p.y += p.vy * dt; const a = 1 - p.age / p.life; ctx.fillStyle = p.colour; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + a), 0, A.TAU); ctx.fill(); }
            ctx.restore();
        }

        // ---- What each hit was.
        ctx.textAlign = 'center';
        pops = pops.filter(p => nowMs - p.at < 600);
        for (const p of pops) { const a = (nowMs - p.at) / 600; ctx.globalAlpha = 1 - a; ctx.font = `700 ${p.text === 'PERFECT' || p.text === 'NICE' ? 13 : 12}px ${C.mono}`; ctx.fillStyle = !p.good ? C.danger : p.text === 'GOOD' ? C.text : gold ? C.warning : C.success; ctx.fillText(p.text, PX(p), hitY - 30 - a * 22); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.muted; ctx.font = '11px ' + C.mono;
        if (field) { ctx.textAlign = 'left'; ctx.fillText('low', 18, H - 7); ctx.textAlign = 'right'; ctx.fillText('high', W - 8, H - 7); ctx.textAlign = 'center'; }
        else for (let i = 0; i < o.lanes; i++) ctx.fillText(mouse() ? `${LANES[i]} [${KEYNAME[i]}]` : LANES[i], laneX(i), H - 7);

        // ---- How early or late: a strip under the line, the middle the beat. The last hits as dots; while the AI
        // plays, your own spread is the faint band behind its dots, so its hands can be seen closing in.
        if (s) {
            const sw = Math.min(W * 0.5, 200), sx = W / 2 - sw / 2, sy = hitY + 14, span = o.good, px = off => W / 2 + Math.max(-1, Math.min(1, off / span)) * sw / 2;
            ctx.fillStyle = C.bg; ctx.globalAlpha = 0.6; ctx.fillRect(sx, sy, sw, 7); ctx.globalAlpha = 1;
            ctx.fillStyle = C.success; ctx.globalAlpha = 0.3; ctx.fillRect(px(-o.perfect), sy, px(o.perfect) - px(-o.perfect), 7); ctx.globalAlpha = 1;
            if (ai && yours && yours.offs) { const mine = yours.offs.filter(v => v != null); if (mine.length) { const lo = Math.min(...mine), hi = Math.max(...mine); ctx.fillStyle = C.primary; ctx.globalAlpha = 0.45; ctx.fillRect(px(lo), sy - 2, Math.max(2, px(hi) - px(lo)), 2); ctx.globalAlpha = 1; } }
            ctx.fillStyle = C.text; ctx.fillRect(W / 2 - 0.5, sy - 2, 1, 11);
            for (const m of marks) { const a = Math.max(0.15, 1 - (nowMs - m.at) / 4000); ctx.fillStyle = Math.abs(m.off) <= o.perfect ? (gold ? C.warning : C.success) : C.text; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(px(m.off), sy + 3.5, 2.6, 0, A.TAU); ctx.fill(); }
            ctx.globalAlpha = 1;
        }
        if (s) {   // the meter down the left side: how much of the song is holding together
            const top = 10, mh = H - 20, fill = mh * s.meter, c = gold ? C.warning : s.meter < 0.25 ? C.danger : C.success;
            ctx.fillStyle = C.bg; ctx.globalAlpha = 0.7; ctx.fillRect(4, top, 8, mh); ctx.globalAlpha = 1;
            ctx.fillStyle = c; ctx.fillRect(4, top + mh - fill, 8, fill);
            ctx.fillStyle = C.bg; for (let q = 1; q < 8; q++) ctx.fillRect(4, top + mh * q / 8 - 0.5, 8, 1.5);
            A.glow(ctx, 8, top + mh - fill, 5 + 3 * pulse, c, gold ? 1.4 : 0.7);
            if (low) { ctx.strokeStyle = C.danger; ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(nowMs / 160)); ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
            if (ai && hand) A.pill(ctx, `try ${Math.min(attempt + 1, hand.attempts.length)} of ${hand.attempts.length}`, W - 6, 6, C, 'right');
            // The AI itself, beside the lanes: it swells on its hits and dims when it is losing the song.
            if (ai) { const p = pops.find(q => q.good && nowMs - q.at < 180), k = p ? 1 - (nowMs - p.at) / 180 : 0; ctx.globalAlpha = 0.55 + 0.45 * E; A.orb(ctx, W - 28, hitY * 0.5, 15 + 4 * k, C, nowMs, s.failed || low); ctx.globalAlpha = 1; }
        }
        // The song coming apart: the picture goes dull and the edges close in.
        if (s && E < 0.4 && !still) { ctx.fillStyle = C.bg; ctx.globalAlpha = (0.4 - E) * 0.9; ctx.fillRect(0, 0, W, hitY * 0.5 * (0.4 - E) * 2.5); ctx.fillRect(0, 0, W * 0.5 * (0.4 - E), H); ctx.fillRect(W - W * 0.5 * (0.4 - E), 0, W * 0.5 * (0.4 - E), H); ctx.globalAlpha = 1; }
        if (t0 == null || t < 0) {
            ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.font = '700 20px ' + C.display; ctx.fillText(t0 == null ? 'Listen' : t > -beatLen * 3.5 ? String(Math.max(1, Math.ceil(-t / beatLen))) : 'Ready', W / 2, H * 0.4);
            if (!audio && t0 != null) { ctx.font = '12px ' + C.mono; ctx.fillStyle = C.muted; ctx.fillText('The music is off: no sound', W / 2, H * 0.4 + 24); }
        }
    }

    function open() {
        if (!R()) return;
        if (!dlg) build();
        save = load(); yours = null;
        if (!dlg.open) dlg.showModal();
        toPick();
    }
    function close() { if (dlg && dlg.open) { stop(); dlg.close(); } }
    window.RhythmUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; }, get music() { return music; }, get audio() { return audio; }, get sel() { return sel; }, get listening() { return listening; }, now, press, release, move: (hand, x) => { if (mode === 'test' && run && !run.state.over) show(run.move(hand, now(), x)); } };
})();
