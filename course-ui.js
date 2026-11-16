// course-ui.js — the obstacle course's screen (window.CourseUI). PROTOTYPE, phase 1 (design/evals-course.md): build a
// course, run it yourself, hand it to the AI and watch its attempts. Rules are course.js's; nothing here decides anything.
// The prototype keeps its own progress on the device (`agiCourse`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const C = () => window.Course;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiCourse';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { course: C().cleanCourse(s.course), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), best: Math.max(0, Math.floor(+s.best || 0)) }; } catch { return { course: C().emptyCourse(), marks: 0, runs: 0, best: 0 }; } };
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const secs = t => t.toFixed(1) + ' s';
    const NAME = k => C().OBSTACLES[k].name;
    const SHORT = { gap: 'Gap', wall: 'Wall', spikes: 'Spikes', boost: 'Boost' };

    let dlg, canvas, ctx, sayEl, marksEl, slotsEl, actionsEl, padEl, save, mode = 'build', run = null, feed = null, yours = null, hand = null, attempt = 0, raf = 0, last = 0, acc = 0, pops = [], startAt = 0;

    function build() {
        canvas = el('canvas', { class: 'course-canvas', 'aria-label': 'The course' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        slotsEl = el('div', { class: 'course-slots', role: 'group', 'aria-label': 'What is in each place on the course' });
        actionsEl = el('div', { class: 'course-actions' });
        padEl = el('button', { type: 'button', class: 'course-pad', text: 'Jump', hidden: '' });
        const press = e => { e.preventDefault(); if (mode === 'test' && run && performance.now() >= startAt) run.down(); };
        const lift = e => { e.preventDefault(); if (mode === 'test' && run) run.up(); };
        for (const n of [padEl, canvas]) { n.addEventListener('pointerdown', press); n.addEventListener('pointerup', lift); n.addEventListener('pointercancel', lift); n.addEventListener('pointerleave', lift); }
        dlg = el('dialog', { class: 'evals-screen course-screen', 'aria-label': 'Evals: the course' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }), marksEl,
                el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body' }, sayEl, canvas, slotsEl, padEl, actionsEl));
        dlg.addEventListener('close', stop);
        dlg.addEventListener('keydown', e => { if (e.code !== 'Space' || mode !== 'test' || e.repeat) return; e.preventDefault(); if (run && performance.now() >= startAt) run.down(); });
        dlg.addEventListener('keyup', e => { if (e.code !== 'Space' || mode !== 'test') return; e.preventDefault(); if (run) run.up(); });
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { marksEl.textContent = '◈ ' + save.marks.toLocaleString('en-US'); marksEl.setAttribute('aria-label', save.marks + ' Marks'); }

    // Build: a button a place; a tap goes round what you have.
    function toBuild(text) {
        stop(); mode = 'build'; run = null; hand = null; padEl.hidden = true; slotsEl.hidden = false;
        const have = [null, ...C().palette(skills())];
        slotsEl.replaceChildren(...save.course.map((k, i) => el('button', { type: 'button', class: 'course-slot' + (k ? ' has ' + k : ''), 'aria-label': `Place ${i + 1}: ${k ? NAME(k) : 'empty'}. Tap to change.`,
            onclick: () => { save.course[i] = have[(have.indexOf(save.course[i]) + 1) % have.length]; yours = null; keep(); toBuild(); } }, el('span', { class: 'course-slot-n', text: String(i + 1) }), el('span', { class: 'course-slot-k', text: k ? SHORT[k] : '+' }))));
        const pts = C().points(save.course);
        say(text || (pts ? `This course is worth ${pts} ${pts === 1 ? 'point' : 'points'} if I finish it. Show me it can be done.` : 'Tap a place to put something in my way. The more I get past, the more it is worth. If I fail, it is worth nothing.'));
        actions(button('Test it yourself', toTest, true), ...(yours ? [button('Hand it to the AI', toAi)] : []), button('Clear', () => { save.course = C().emptyCourse(); yours = null; keep(); toBuild(); }));
        header(); draw();
    }
    // Test: you run it. A clear is what the AI is given.
    function toTest() {
        stop(); mode = 'test'; run = C().createRun(save.course); feed = null; pops = []; padEl.hidden = false; slotsEl.hidden = true;
        startAt = performance.now() + 900;
        say('Tap to hop. Hold, then let go, for a higher jump.');
        actions(button('Back to building', () => toBuild()));
        go();
    }
    function testOver() {
        const r = C().result(save.course, run); padEl.hidden = true;
        if (r.finished) {
            yours = { presses: r.presses, time: r.time };
            say(`You cleared it in ${secs(r.time)}${r.perfects ? `, with ${r.perfects} clean ${r.perfects === 1 ? 'landing' : 'landings'}` : ''}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Run it again', toTest), button('Change it', () => toBuild()));
        } else {
            say(`You fell at the ${NAME(r.failed.kind).toLowerCase()} in place ${r.failed.slot + 1}. It has to be possible before I can try.`);
            actions(button('Try again', toTest, true), button('Change it', () => toBuild()));
        }
        mode = 'tested';
    }
    // The AI: its attempts are worked out at the hand-over, then shown one after another.
    function toAi() {
        if (!yours) return;
        stop(); mode = 'ai'; slotsEl.hidden = true; padEl.hidden = true;
        hand = C().handOver(save.course, yours.presses, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: C().mastery(save.runs, Math.min(skills(), 20)) });
        attempt = 0;
        actions(button('Skip to the result', aiResult));
        if (!hand.attempts.length) return aiResult();
        aiStart();
    }
    function aiStart() {
        const a = hand.attempts[attempt];
        run = C().createRun(save.course); pops = [];
        feed = { list: a.presses.slice().sort((x, y) => x.t - y.t), i: 0, release: -1 };
        startAt = performance.now() + 700;
        say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`);
        go();
    }
    function aiOver() {
        const r = hand.attempts[attempt].result;
        say(r.finished ? `Cleared, in ${secs(r.time)}.` : `I fell at the ${NAME(r.failed.kind).toLowerCase()} in place ${r.failed.slot + 1}. I will time that one differently.`);
        attempt++;
        setTimeout(() => { if (mode !== 'ai') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 1300);
    }
    function aiResult() {
        stop(); mode = 'result';
        const top = hand.score, marks = C().marksFor(save.course, top, yours.time), tries = hand.attempts.length, pts = C().points(save.course);
        save.runs++; save.marks += marks; save.best = Math.max(save.best, marks); keep(); header();
        if (!top) say(`I could not finish it in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored. A course I can only just finish is the one worth building.`);
        else {
            const d = yours.time - top.time;
            say(`Finished: ${pts} ${pts === 1 ? 'point' : 'points'}, ${secs(top.time)} against your ${secs(yours.time)}${d > 0.05 ? '. I was faster' : d < -0.05 ? '. You were faster' : ''}. ${marks} Marks.`);
        }
        actions(button('Change the course', () => toBuild(), true), button('Hand it over again', toAi), button('Watch again', () => { mode = 'ai'; attempt = 0; save.runs--; save.marks -= marks; keep(); aiStartReplay(marks); }));
        run = null; draw();
    }
    // Watch again: the same attempts, nothing paid twice.
    function aiStartReplay(marks) { const again = aiResult; attempt = 0; actions(button('Skip to the result', () => again())); aiStart(); }

    // The loop: the rules' fixed step, paced by the clock.
    function go() { cancelAnimationFrame(raf); last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); draw(); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function frame(now) {
        raf = 0;
        if (!dlg.open || !run) return;
        const step = C().COURSE.step, s = run.state;
        if (now >= startAt) {
            acc += Math.min(0.1, (now - last) / 1000);
            while (acc >= step && !s.over) {
                acc -= step;
                if (feed) {
                    if (feed.release >= 0 && s.t >= feed.release) { run.up(); feed.release = -1; }
                    while (feed.i < feed.list.length && s.t >= feed.list[feed.i].t && feed.release < 0) { const p = feed.list[feed.i++]; run.down(); feed.release = p.t + p.hold; if (p.hold <= 0) { run.up(); feed.release = -1; } }
                }
                const seen = s.events.length;
                run.step();
                for (const e of s.events.slice(seen)) if (e.type === 'perfect') pops.push({ x: e.x, t: now, text: 'CLEAN' }); else if (e.type === 'boost') pops.push({ x: e.x, t: now, text: 'BOOST' });
            }
        }
        last = now;
        draw(now);
        if (s.over) { if (mode === 'test') testOver(); else if (mode === 'ai') aiOver(); return; }
        raf = requestAnimationFrame(frame);
    }

    function draw(now = performance.now()) {
        if (!canvas || !dlg.open) return;
        const o = C().COURSE, css = getComputedStyle(dlg), col = n => css.getPropertyValue(n).trim() || '#888';
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const total = C().length(), running = !!run, s = running ? run.state : null;
        const view = running ? Math.min(total, Math.max(14, W / 26)) : total, k = W / view;
        const cam = running ? Math.max(0, Math.min(total - view, s.x - view * 0.28)) : 0, gy = H * 0.72;
        const X = x => (x - cam) * k, Y = y => gy - y * k;
        const haz = C().layout(save.course);
        // The ground, with its holes.
        ctx.fillStyle = col('--panel-2') || '#16262b'; ctx.fillRect(0, gy, W, H - gy);
        ctx.strokeStyle = col('--success'); ctx.lineWidth = 2; ctx.beginPath();
        let from = 0;
        for (const h of haz.filter(h => h.type === 'hole')) { ctx.moveTo(X(from), gy); ctx.lineTo(X(h.x0), gy); from = h.x1; ctx.clearRect(X(h.x0), gy - 1, (h.x1 - h.x0) * k, H - gy + 1); }
        ctx.moveTo(X(from), gy); ctx.lineTo(X(total), gy); ctx.stroke();
        for (const h of haz) {
            if (h.type === 'hole') { ctx.fillStyle = col('--danger'); ctx.globalAlpha = 0.22; ctx.fillRect(X(h.x0), gy, (h.x1 - h.x0) * k, H - gy); ctx.globalAlpha = 1; }
            else if (h.type === 'wall') { ctx.fillStyle = col('--warning'); ctx.fillRect(X(h.x0), Y(h.h), Math.max(3, (h.x1 - h.x0) * k), h.h * k); }
            else { ctx.fillStyle = col('--primary'); for (let i = 0; i < 3; i++) { const x = X(h.x0 + (h.x1 - h.x0) * (i + 0.5) / 3); ctx.beginPath(); ctx.moveTo(x - 4, gy - 2); ctx.lineTo(x + 3, gy - 7); ctx.lineTo(x - 4, gy - 12); ctx.closePath(); ctx.fill(); } }
        }
        // The place numbers and the finish.
        ctx.fillStyle = col('--muted'); ctx.font = '11px ' + (css.getPropertyValue('--font-mono') || 'monospace'); ctx.textAlign = 'center';
        for (let i = 0; i < o.slots; i++) ctx.fillText(String(i + 1), X(o.lead + (i + 0.5) * o.slot), gy + 16);
        ctx.strokeStyle = col('--text'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(total - 0.3), gy); ctx.lineTo(X(total - 0.3), gy - 2.2 * k); ctx.stroke(); ctx.setLineDash([]);
        // Where you jumped, under the AI's run.
        if (mode === 'ai' && yours && run) { ctx.fillStyle = col('--muted'); for (const p of yours.presses) { const x = X(xAt(p.t + p.hold)); ctx.fillRect(x - 1, gy + 2, 2, 6); } }
        if (s) {
            const r = Math.max(5, 0.38 * k), x = X(s.x), y = Y(s.y) - r;
            if (s.charging >= 0) { ctx.strokeStyle = col('--warning'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, (s.t - s.charging) / o.holdMax)); ctx.stroke(); }
            ctx.fillStyle = s.failed ? col('--danger') : mode === 'test' ? col('--primary') : col('--success'); ctx.beginPath(); ctx.arc(x, s.failed ? Math.min(H - r, y + 14) : y, r, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = col('--warning'); ctx.beginPath(); ctx.arc(x, s.failed ? Math.min(H - r, y + 14) : y, r * 0.3, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = col('--text'); ctx.textAlign = 'left'; ctx.font = '12px ' + (css.getPropertyValue('--font-mono') || 'monospace');
            ctx.fillText(secs(s.t) + (yours && mode === 'ai' ? '  yours ' + secs(yours.time) : ''), 8, 16);
            if (now < startAt) { ctx.textAlign = 'center'; ctx.font = '600 18px ' + (css.getPropertyValue('--font-display') || 'sans-serif'); ctx.fillText('Ready', W / 2, H * 0.3); }
        }
        ctx.textAlign = 'center'; ctx.font = '600 12px ' + (css.getPropertyValue('--font-mono') || 'monospace');
        pops = pops.filter(p => now - p.t < 900);
        for (const p of pops) { ctx.globalAlpha = 1 - (now - p.t) / 900; ctx.fillStyle = col('--success'); ctx.fillText(p.text, X(p.x), gy - 2.4 * k - (now - p.t) / 40); ctx.globalAlpha = 1; }
    }
    // Roughly where the runner is at a time (for the marks of your jumps): the ground pace is close enough.
    const xAt = t => t * C().COURSE.speed;

    function open() {
        if (!C()) return;
        if (!dlg) build();
        save = load(); yours = null;
        if (!dlg.open) dlg.showModal();
        toBuild();
    }
    function close() { if (dlg && dlg.open) { stop(); dlg.close(); } }
    window.CourseUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; } };
})();
