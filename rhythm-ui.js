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
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), best: s.best && typeof s.best === 'object' ? s.best : {}, track: +s.track || 0, level: Math.max(0, Math.min(2, Math.floor(+s.level || 0))) }; } catch { return { marks: 0, runs: 0, stage: 1, best: {}, track: 0, level: 0 }; } };
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => R().mastery(save.runs, location.hash === '#playground' ? 0 : Math.min(skills(), 20));
    const LANES = ['Kick', 'Bass', 'Melody'], SOUND = ['compute', 'data', 'research'];
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
        const lane = i => { const b = el('button', { type: 'button', class: 'maze-dir rhythm-lane', 'aria-label': LANES[i], text: LANES[i] }); const down = e => { e.preventDefault(); press(i); }, up = e => { e.preventDefault(); release(i); };
            b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); return b; };
        padEl = el('div', { class: 'rhythm-pad', hidden: '' }, lane(0), lane(1), lane(2));
        actionsEl = el('div', { class: 'course-actions' });
        dlg = el('dialog', { class: 'evals-screen course-screen rhythm-screen', 'aria-label': 'Evals: the rhythm run' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                el('button', { type: 'button', class: 'ghost-button course-switch', text: 'Rooms', 'aria-label': 'Switch to the room course', onclick: () => { close(); try { localStorage.setItem('agiCourseKind', 'rooms'); } catch { /* private mode */ } window.RoomsUI?.open(); } }),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body rhythm-body' }, sayEl, pickEl, canvas, padEl, actionsEl));
        dlg.addEventListener('close', () => { stop(); music = { area: 'lab', level: 0.4 }; });
        const KEYS = { a: 0, s: 1, d: 2, j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }, heldKeys = {};
        dlg.addEventListener('keydown', e => { if (mode !== 'test' || !(e.key in KEYS) || e.repeat) return; e.preventDefault(); heldKeys[e.key] = true; press(KEYS[e.key]); });
        dlg.addEventListener('keyup', e => { if (!(e.key in KEYS) || !heldKeys[e.key]) return; heldKeys[e.key] = false; if (mode === 'test') release(KEYS[e.key]); });
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { marksEl.textContent = '◈ ' + save.marks.toLocaleString('en-US'); marksEl.setAttribute('aria-label', save.marks + ' Marks'); }

    // Pick: the track and how much of it is notes.
    function toPick(text) {
        stop(); mode = 'pick'; run = null; hand = null; padEl.hidden = true; pickEl.hidden = false; canvas.hidden = true; music = { area: (trackNow() || {}).area || 'lab', level: 0.4 };
        const all = tracks(), tr = trackNow();
        if (!tr) { say('There is no music to play. The game\'s tracks did not load.'); actions(); return; }
        const notes = lvl => R().chartFrom(tr.song, lvl).length;
        pickEl.replaceChildren(
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'Track' }, ...all.map((t, i) => el('button', { type: 'button', class: 'maze-tool' + (i === save.track ? ' on' : ''), 'aria-pressed': String(i === save.track), text: t.name, onclick: () => { save.track = i; yours = null; keep(); toPick(); } }))),
            el('div', { class: 'rhythm-row', role: 'group', 'aria-label': 'How much of it is notes' }, ...R().LEVELS.map((l, i) => el('button', { type: 'button', class: 'maze-tool' + (i === save.level ? ' on' : ''), 'aria-pressed': String(i === save.level), text: `${l.name} · ${notes(i)}`, onclick: () => { save.level = i; yours = null; keep(); toPick(); } }))));
        say(text || `${tr.name}, ${notes(save.level)} notes over ${R().RHYTHM.bars} bars. Keep the song together to the end and I will try it after you. Let it fall apart and it scores nothing.`);
        actions(button('Play it yourself', () => begin('you'), true), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []));
        header();
    }
    // A run begins: ask the engine for the song a bar before the notes start, and line the chart up with its clock.
    function begin(by) {
        stop(); who = by; mode = by === 'you' ? 'test' : 'ai'; pickEl.hidden = true; canvas.hidden = false; padEl.hidden = by !== 'you'; pops = [];
        const tr = trackNow(), o = R().RHYTHM, from = Math.max(1, R().startBar(tr.song)), sfx = window.SFX, lab = sfx && sfx.lab;
        audio = !!(sfx && sfx.playing && lab && lab.clock && lab.clock() && lab.music());
        music = { area: tr.area, level: 0.5 };
        t0 = null; wait = performance.now();
        if (audio) { asked = lab.music().asked || 0; sfx.songCmd({ area: tr.area, song: tr.index, bar: from - 1 }); }
        else { stepLen = 60 / (tr.song.bpm || 120) / 4; start(tr, from, performance.now() / 1000 + tr.song.steps * stepLen); }
        feed = by === 'ai' ? { events: hand.attempts[attempt].events.slice().sort((a, b) => a.t - b.t), i: 0 } : null;
        run = null; chart = null;
        if (by === 'you') { say('Tap each note as it reaches the line. Hold the long ones.'); actions(button('Stop', () => toPick())); }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function start(tr, from, at) {
        chart = R().timed(R().chartFrom(tr.song, save.level, from), stepLen); end = R().lengthOf(tr.song, stepLen); run = R().createRun(chart); t0 = at;
    }
    const clockNow = () => { if (!audio) return performance.now() / 1000; const c = window.SFX.context; return c.currentTime - (c.outputLatency || 0); };
    const now = () => (t0 == null ? -99 : clockNow() - t0);
    function press(lane) { if (mode !== 'test' || !run || run.state.over) return; show(run.press(lane, now())); }
    function release(lane) { if (mode !== 'test' || !run || run.state.over) return; show(run.release(lane, now())); }
    // What just happened, for the eye and the ear.
    function show(events) {
        for (const e of events) {
            if (e.type === 'perfect' || e.type === 'good') { pops.push({ lane: e.lane, text: e.type === 'perfect' ? 'PERFECT' : 'GOOD', at: performance.now(), good: true }); if (who === 'you') window.SFX?.play?.('click', { res: SOUND[e.lane] }); }
            else if (e.type === 'miss') pops.push({ lane: e.lane, text: 'MISS', at: performance.now(), good: false });
            else if (e.type === 'stray') pops.push({ lane: e.lane, text: '·', at: performance.now(), good: false });
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
            say(`You kept it together: ${r.hits} of ${r.total} notes, ${r.perfect} perfect, a best combo of ${r.combo}. May I try?`);
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
        const c = R().timed(R().chartFrom(tr.song, save.level, Math.max(1, R().startBar(tr.song))), stepLen);
        hand = R().handOver(c, yours, R().lengthOf(tr.song, stepLen), { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow() });
        attempt = 0; actions(button('Skip to the result', aiResult)); aiStart();
    }
    function aiStart() { begin('ai'); say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`); actions(button('Skip to the result', aiResult)); }
    function aiOver() {
        const r = hand.attempts[attempt].result; mode = 'aiwait';
        say(r.finished ? `Played through: ${r.hits} of ${r.total}, ${r.perfect} perfect.` : `It fell apart on me after ${r.hits} notes. I will listen more closely there.`);
        attempt++;
        setTimeout(() => { if (mode !== 'aiwait') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 1400);
    }
    function aiResult() {
        stop(); mode = 'result'; padEl.hidden = true;
        const tr = trackNow(), key = `${tr.area}:${tr.index}:${save.level}`, ref = (yours.finished && yours.score) || save.best[key] || 0, top = hand.score, marks = R().marksFor(top, ref), tries = hand.attempts.length;
        save.runs++; save.marks += marks;
        if (top) save.best[key] = Math.max(save.best[key] || 0, top.score);
        const st = R().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        const pct = r => Math.round(r.accuracy * 100) + '%';
        if (!top) say(`I could not keep it together in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) say(`Played through: ${top.hits} of ${top.total}, ${pct(top)} on the beat against your ${pct(yours)}, a combo of ${top.combo} against your ${yours.combo}${top.score > yours.score + 0.01 ? '. I was tighter' : top.score < yours.score - 0.01 ? '. You were tighter' : ''}. ${marks} Marks.`);
        else say(`Played the one you could not: ${top.hits} of ${top.total}, ${pct(top)} on the beat. ${marks} Marks.`);
        if (grew) sayEl.textContent += st === 2 ? ' I think I can play a track through now even if it falls apart on you. Play it once, as far as you get.' : ' I do not need to hear the hard parts first any more. Play it once anyway.';
        actions(button('Change the track', () => toPick(), true), button('Hand it over again', toAi));
        music.level = 0.4; draw();
    }

    function draw() {
        if (!canvas || !dlg.open || canvas.hidden) return;
        const o = R().RHYTHM, css = getComputedStyle(dlg), col = n => css.getPropertyValue(n).trim() || '#888', mono = css.getPropertyValue('--font-mono') || 'monospace';
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const lw = W / o.lanes, hitY = H * 0.84, look = 1.7, t = now(), s = run ? run.state : null, gold = s && s.combo >= o.goldCombo;
        const yOf = nt => hitY - (nt - t) / look * hitY, r = Math.min(lw * 0.22, 20);
        ctx.strokeStyle = col('--border'); ctx.lineWidth = 1;
        for (let i = 1; i < o.lanes; i++) { ctx.beginPath(); ctx.moveTo(i * lw, 0); ctx.lineTo(i * lw, H); ctx.stroke(); }
        // The beats, drawn through.
        if (run) { const beat = stepLen * 4; ctx.globalAlpha = 0.35; for (let b = Math.ceil((t - 0.2) / beat); b * beat < t + look; b++) { const y = yOf(b * beat); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.globalAlpha = 1; }
        ctx.strokeStyle = gold ? col('--warning') : col('--success'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke(); ctx.lineWidth = 1;
        if (run) for (const n of s.notes) {
            if (n.t - t > look || (n.state !== 'wait' && n.state !== 'held')) continue;
            const x = (n.lane + 0.5) * lw, y = n.state === 'held' ? hitY : yOf(n.t), c = gold ? col('--warning') : n.hold > 0 ? (col('--snare-good') || col('--primary')) : col('--primary');
            if (n.hold > 0) {   // a packet: a held note, its tail the time to hold
                const yEnd = yOf(n.t + n.hold); ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y, yEnd)); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
                ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x, y - r * 0.3); ctx.lineTo(x - r, y - r * 0.8); ctx.closePath(); ctx.fill();
            } else {            // the Training ball: a regular note
                ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = gold ? col('--text') : col('--warning'); ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, 2 * Math.PI); ctx.fill();
            }
        }
        ctx.font = '600 12px ' + mono; ctx.textAlign = 'center';
        pops = pops.filter(p => performance.now() - p.at < 600);
        for (const p of pops) { const a = (performance.now() - p.at) / 600; ctx.globalAlpha = 1 - a; ctx.fillStyle = p.good ? col('--success') : col('--danger'); ctx.fillText(p.text, (p.lane + 0.5) * lw, hitY - 26 - a * 18); ctx.globalAlpha = 1; }
        ctx.fillStyle = col('--muted'); ctx.font = '11px ' + mono; for (let i = 0; i < o.lanes; i++) ctx.fillText(LANES[i], (i + 0.5) * lw, H - 6);
        if (s) {   // the meter down the left side, and the combo
            const mh = (H - 16) * s.meter; ctx.fillStyle = col('--panel-2'); ctx.fillRect(3, 8, 6, H - 16); ctx.fillStyle = gold ? col('--warning') : s.meter < 0.25 ? col('--danger') : col('--success'); ctx.fillRect(3, 8 + (H - 16) - mh, 6, mh);
            ctx.fillStyle = col('--text'); ctx.font = '600 13px ' + mono; ctx.textAlign = 'right'; ctx.fillText(s.combo > 1 ? 'x' + s.combo : '', W - 8, 18);
        }
        if (t0 == null || t < 0) { ctx.fillStyle = col('--text'); ctx.textAlign = 'center'; ctx.font = '600 18px ' + (css.getPropertyValue('--font-display') || 'sans-serif'); ctx.fillText(t0 == null ? 'Listen' : 'Ready', W / 2, H * 0.4); if (!audio && t0 != null) { ctx.font = '12px ' + mono; ctx.fillStyle = col('--muted'); ctx.fillText('The music is off: no sound', W / 2, H * 0.4 + 22); } }
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
