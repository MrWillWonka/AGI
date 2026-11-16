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
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), best: s.best && typeof s.best === 'object' ? s.best : {}, track: +s.track || 0, level: Math.max(0, Math.min(3, Math.floor(+s.level || 0))) }; } catch { return { marks: 0, runs: 0, stage: 1, best: {}, track: 0, level: 0 }; } };
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => R().mastery(save.runs, location.hash === '#playground' ? 0 : Math.min(skills(), 20));
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

    function build() {
        canvas = el('canvas', { class: 'rhythm-canvas', 'aria-label': 'The notes' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        pickEl = el('div', { class: 'rhythm-pick' });
        const lane = i => { const b = el('button', { type: 'button', class: 'maze-dir rhythm-lane', 'aria-label': LANES[i], text: LANES[i] }); hook(b, () => i); return b; };
        padEl = el('div', { class: 'rhythm-pad', hidden: '' }, lane(0), lane(1), lane(2));
        hook(canvas, e => { if (mouse() && !inFree()) return dueLane(); const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(2, Math.floor((e.clientX - r.left) / (r.width / 3)))); });

        actionsEl = el('div', { class: 'course-actions' });
        dlg = el('dialog', { class: 'evals-screen course-screen rhythm-screen', 'aria-label': 'Evals: the rhythm run' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                el('button', { type: 'button', class: 'ghost-button course-switch', text: 'Rooms', 'aria-label': 'Switch to the room course', onclick: () => { close(); try { localStorage.setItem('agiCourseKind', 'rooms'); } catch { /* private mode */ } window.RoomsUI?.open(); } }),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body rhythm-body' }, sayEl, pickEl, canvas, padEl, actionsEl));
        dlg.addEventListener('close', () => { stop(); music = { area: 'lab', level: 0.4 }; });
        const KEYS = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }, heldKeys = {};
        // W slashes whichever slash is due (a mouse flick across the notes does too).
        dlg.addEventListener('keydown', e => { if (mode !== 'test' || e.repeat || (e.key !== 'w' && e.key !== 'W' && e.key !== 'ArrowUp')) return; e.preventDefault(); const l = dueLane('slash'); press(l, 'slash'); release(l); });
        let spaceLane = -1;
        dlg.addEventListener('keydown', e => {
            if (mode !== 'test' || e.repeat) return;
            if (e.key === ' ') { e.preventDefault(); spaceLane = dueLane(); press(spaceLane); return; }
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (!(k in KEYS)) return;
            e.preventDefault(); heldKeys[k] = true; press(KEYS[k]);
        });
        dlg.addEventListener('keyup', e => {
            if (e.key === ' ') { if (spaceLane >= 0) { if (mode === 'test') release(spaceLane); spaceLane = -1; } return; }
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
    function header() { marksEl.textContent = '◈ ' + save.marks.toLocaleString('en-US'); marksEl.setAttribute('aria-label', save.marks + ' Marks'); }

    // Pick: the track and how much of it is notes.
    function toPick(text) {
        stop(); mode = 'pick'; run = null; hand = null; padEl.hidden = true; pickEl.hidden = false; canvas.hidden = true; music = { area: (trackNow() || {}).area || 'lab', level: 0.4 };
        const all = tracks(), tr = trackNow();
        if (!tr) { say('There is no music to play. The game\'s tracks did not load.'); actions(); return; }
        const notes = lvl => R().chartFor(tr.song, lvl).filter(n => !n.free).length;
        pickEl.replaceChildren(
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'Track' }, ...all.map((t, i) => el('button', { type: 'button', class: 'maze-tool' + (i === save.track ? ' on' : ''), 'aria-pressed': String(i === save.track), text: t.name, onclick: () => { save.track = i; yours = null; keep(); toPick(); } }))),
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'How hard' }, ...R().MODES.map((l, i) => el('button', { type: 'button', class: 'maze-tool' + (i === save.level ? ' on' : ''), 'aria-pressed': String(i === save.level), text: `${l.name} · ${notes(i)}`, onclick: () => { save.level = i; yours = null; keep(); toPick(); } }))));
        say(text || `${tr.name} on ${R().modeOf(save.level).name}: ${notes(save.level)} notes over ${R().RHYTHM.bars} bars. Keep the song together to the end and I will try it after you. Let it fall apart and it scores nothing.`);
        actions(button('Play it yourself', () => begin('you'), true), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []));
        header();
    }
    // A run begins: ask the engine for the song a bar before the notes start, and line the chart up with its clock.
    function begin(by) {
        stop(); who = by; mode = by === 'you' ? 'test' : 'ai'; pickEl.hidden = true; canvas.hidden = false; padEl.hidden = by !== 'you'; pops = []; mouseLane = -1; fx = []; sparks = []; marks = []; energy = 0.5;
        const tr = trackNow(), o = R().RHYTHM, from = Math.max(1, R().startBar(tr.song)), sfx = window.SFX, lab = sfx && sfx.lab;
        audio = !!(sfx && sfx.playing && lab && lab.clock && lab.clock() && lab.music());
        music = { area: tr.area, level: 0.5 };
        t0 = null; wait = performance.now();
        if (audio) { asked = lab.music().asked || 0; sfx.songCmd({ area: tr.area, song: tr.index, bar: from - 1 }); }
        else { stepLen = 60 / (tr.song.bpm || 120) / 4; start(tr, from, performance.now() / 1000 + tr.song.steps * stepLen); }
        feed = by === 'ai' ? { events: hand.attempts[attempt].events.slice().sort((a, b) => a.t - b.t), i: 0 } : null;
        run = null; chart = null;
        if (by === 'you') { say(mouse() ? 'A, S and D are the lanes; a click or the spacebar takes whichever note is due. Hold the long ones. W, or a flick of the mouse, for a slash. In a freestyle bar, play a beat of your own.' : 'Tap each note at the line and hold the long ones. Swipe the diamonds. In a freestyle bar, tap a beat of your own.'); actions(button('Stop', () => toPick())); }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function start(tr, from, at) {
        chart = R().timed(R().chartFor(tr.song, save.level, from), stepLen); end = R().lengthOf(tr.song, stepLen); run = R().createRun(chart, R().rulesFor(save.level)); t0 = at;
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
        node.addEventListener('pointerdown', e => { if (mode !== 'test') return; e.preventDefault(); const l = laneOf(e), t = now(), due = run && run.state.notes.find(n => !n.free && n.lane === l && n.state === 'wait' && Math.abs(n.t - t) <= R().RHYTHM.good + 0.08);
            if (due && due.kind === 'slash') pending.set(e.pointerId, { lane: l, x: e.clientX, y: e.clientY, sent: false }); else { pending.set(e.pointerId, { lane: l, sent: true }); press(l); } });
        node.addEventListener('pointermove', e => { const p = pending.get(e.pointerId); if (!p || p.sent) return; if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= SWIPE) { p.sent = true; press(p.lane, 'slash'); } });
        const up = e => { const p = pending.get(e.pointerId); if (!p) return; e.preventDefault(); pending.delete(e.pointerId); if (!p.sent) press(p.lane); release(p.lane); };
        node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('pointerleave', up);
    }
    function press(lane, kind) { if (mode !== 'test' || !run || run.state.over) return; show(run.press(lane, now(), kind)); }
    function release(lane) { if (mode !== 'test' || !run || run.state.over) return; show(run.release(lane, now())); }
    // What just happened, for the eye and the ear.
    // What just happened, for the eye and the ear: the word, the sparks, the packet sent on its way, the timing mark.
    function show(events) {
        const at = performance.now();
        for (const e of events) {
            if (e.type === 'perfect' || e.type === 'good') {
                pops.push({ lane: e.lane, text: e.type === 'perfect' ? 'PERFECT' : 'GOOD', at, good: true });
                fx.push({ kind: 'hit', lane: e.lane, at, perfect: e.type === 'perfect', gold: !!e.gold });
                if (e.kind === 'hold') fx.push({ kind: 'sent', lane: e.lane, at, gold: !!e.gold });
                if (e.off != null) { marks.push({ off: e.off, at, lane: e.lane }); if (marks.length > 18) marks.shift(); }
                if (e.combo && [10, 25, 50, 75, 100].includes(e.combo)) fx.push({ kind: 'combo', n: e.combo, at });
                if (who === 'you') window.SFX?.play?.('click', { res: SOUND[e.lane] });
            } else if (e.type === 'miss') { pops.push({ lane: e.lane, text: 'MISS', at, good: false }); fx.push({ kind: 'miss', lane: e.lane, at }); }
            else if (e.type === 'stray') pops.push({ lane: e.lane, text: '·', at, good: false });
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
            if (m && c && (m.asked || 0) > asked) { const tr = trackNow(), from = Math.max(1, R().startBar(tr.song)); stepLen = c.len; start(tr, from, c.t0 + (m.songStep + from * tr.song.steps - c.n0) * c.len); }
            else if (performance.now() - wait > 6000) { audio = false; const tr = trackNow(); stepLen = 60 / (tr.song.bpm || 120) / 4; start(tr, Math.max(1, R().startBar(tr.song)), performance.now() / 1000 + tr.song.steps * stepLen); }
        }
        if (run) {
            const t = now(), s = run.state;
            if (feed) while (feed.i < feed.events.length && feed.events[feed.i].t <= t && !s.over) { const e = feed.events[feed.i++]; show(e.down ? run.press(e.lane, e.t) : run.release(e.lane, e.t)); }
            if (!s.over) show(run.advance(t));
            music.level = s.failed ? 0 : 0.12 + 0.88 * s.meter;
            draw();
            if (s.over || t > end + 0.6) { if (!s.over) run.advance(end + 1); return mode === 'test' ? testOver() : aiOver(); }
        } else draw();
        raf = requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function testOver() {
        const r = R().result(run); padEl.hidden = true; mode = 'tested';
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
        const tr = trackNow();
        stepLen = stepLen || 60 / (tr.song.bpm || 120) / 4;
        const c = R().timed(R().chartFor(tr.song, save.level, Math.max(1, R().startBar(tr.song))), stepLen);
        hand = R().handOver(c, yours, R().lengthOf(tr.song, stepLen), { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow() }, R().rulesFor(save.level));
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
        const tr = trackNow(), key = `${tr.area}:${tr.index}:${R().modeOf(save.level).key}`, ref = (yours.finished && yours.score) || save.best[key] || 0, top = hand.score, marks = R().marksFor(top, ref), tries = hand.attempts.length;
        save.runs++; save.marks += marks;
        if (top) save.best[key] = Math.max(save.best[key] || 0, top.score);
        const st = R().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        const pct = r => Math.round(r.accuracy * 100) + '%';
        if (!top) say(`I could not keep it together in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) say(`Played through: ${tally(top)}, ${pct(top)} on the beat against your ${pct(yours)}, a combo of ${top.combo} against your ${yours.combo}${top.score > yours.score + 0.01 ? '. I was tighter' : top.score < yours.score - 0.01 ? '. You were tighter' : ''}. ${marks} Marks.`);
        else say(`Played the one you could not: ${tally(top)}, ${pct(top)} on the beat. ${marks} Marks.`);
        if (grew) sayEl.textContent += st === 2 ? ' I think I can play a track through now even if it falls apart on you. Play it once, as far as you get.' : ' I do not need to hear the hard parts first any more. Play it once anyway.';
        actions(button('Change the track', () => toPick(), true), button('Hand it over again', toAi));
        music.level = 0.4; draw();
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
        const lw = W / o.lanes, hitY = H * 0.84, look = 1.7, t = now(), s = run ? run.state : null, gold = !!(s && s.combo >= o.goldCombo), ai = who === 'ai', still = calm();
        const yOf = nt => hitY - (nt - t) / look * hitY, r = Math.min(lw * 0.22, 20), beatLen = stepLen * 4, LANE = [C.primary, C.research, C.success], laneX = i => (i + 0.5) * lw, tint = i => (gold ? C.warning : LANE[i]);
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
        for (let i = 1; i < o.lanes; i++) { ctx.beginPath(); ctx.moveTo(i * lw, 0); ctx.lineTo(i * lw, H); ctx.stroke(); }
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
            for (const q of f.taps) { const y = yOf(f.t + q.k * f.grid); A.glow(ctx, laneX(q.lane), y, r * 0.5, tint(q.lane), 1); ctx.fillStyle = tint(q.lane); ctx.beginPath(); ctx.arc(laneX(q.lane), y, r * 0.45, 0, A.TAU); ctx.fill(); }
            ctx.fillStyle = C.text; ctx.font = '700 13px ' + C.mono; ctx.textAlign = 'center'; ctx.fillText(live ? 'FREESTYLE · your beat' : 'FREESTYLE', W / 2, Math.max(18, Math.min(hitY - 44, y0 + 20)));
        }

        // ---- The line, and a ring to hit in each lane.
        ctx.strokeStyle = gold ? C.warning : C.success; ctx.globalAlpha = 0.25; ctx.lineWidth = 9 + 6 * pulse * E; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke(); ctx.lineWidth = 1;
        for (let i = 0; i < o.lanes; i++) {
            const x = laneX(i), p = pops.find(q => q.lane === i && q.good && nowMs - q.at < 220), a = p ? 1 - (nowMs - p.at) / 220 : 0;
            ctx.strokeStyle = tint(i); ctx.lineWidth = 2 + 2 * a; ctx.globalAlpha = 0.55 + 0.45 * a; ctx.beginPath(); ctx.arc(x, hitY, r * (1.15 + 0.35 * a + 0.06 * pulse), 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
            if (p) { ctx.fillStyle = tint(i); ctx.globalAlpha = 0.35 * a; ctx.beginPath(); ctx.arc(x, hitY, r * 1.1, 0, A.TAU); ctx.fill(); ctx.globalAlpha = 1; }
        }

        // ---- The notes.
        if (run) for (const n of s.notes) {
            if (n.free || n.t - t > look || (n.state !== 'wait' && n.state !== 'held')) continue;
            const x = laneX(n.lane), held = n.state === 'held', y = held ? hitY : yOf(n.t), c = tint(n.lane);
            if (n.hold > 0) {
                // A packet, pointing the way it is going: forward, up the lane. Its tail is the path still to write;
                // while you hold, the written part burns bright behind the head as it is pushed on.
                const yEnd = Math.min(y, yOf(n.t + n.hold)), done = held ? Math.max(0, Math.min(1, (t - n.t) / n.hold)) : 0;
                ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.globalAlpha = 0.22; ctx.lineWidth = r * 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, yEnd); ctx.stroke();
                ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.4; ctx.setLineDash([r * 0.5, r * 0.6]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, yEnd); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
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
            const age = (nowMs - f.at) / 1000, x = f.lane != null ? laneX(f.lane) : W / 2, c = f.gold || gold ? C.warning : f.lane != null ? LANE[f.lane] : C.text;
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
            } else if (f.kind === 'miss' && age < 0.3) { ctx.fillStyle = C.danger; ctx.globalAlpha = 0.16 * (1 - age / 0.3); ctx.fillRect(f.lane * lw, 0, lw, H); ctx.globalAlpha = 1; }
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
        for (const p of pops) { const a = (nowMs - p.at) / 600; ctx.globalAlpha = 1 - a; ctx.font = `700 ${p.text === 'PERFECT' || p.text === 'NICE' ? 13 : 12}px ${C.mono}`; ctx.fillStyle = !p.good ? C.danger : p.text === 'GOOD' ? C.text : gold ? C.warning : C.success; ctx.fillText(p.text, laneX(p.lane), hitY - 30 - a * 22); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.muted; ctx.font = '11px ' + C.mono; for (let i = 0; i < o.lanes; i++) ctx.fillText(mouse() ? `${LANES[i]} [${KEYNAME[i]}]` : LANES[i], laneX(i), H - 7);

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
    window.RhythmUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; }, get music() { return music; }, get audio() { return audio; }, now, press, release };
})();
