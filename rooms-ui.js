// rooms-ui.js — the platformer room's screen (window.RoomsUI). PROTOTYPE, the third kind of course
// (design/evals-course.md): furnish a room, run and jump through it yourself, hand it to the AI and watch its attempts.
// Rules are rooms.js's. It keeps its own progress on the device (`agiRooms`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const R = () => window.Rooms;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiRooms';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { room: R().cleanRoom(s.room), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), times: s.times && typeof s.times === 'object' ? s.times : {} }; } catch { return { room: R().emptyRoom(), marks: 0, runs: 0, stage: 1, times: {} }; } };
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => R().mastery(save.runs, location.hash === '#playground' ? 0 : Math.min(skills(), 20));
    const secs = t => t.toFixed(1) + ' s';
    const roomKey = () => save.room.map(k => (k ? k[0] + k[1] : '-')).join('');
    const WHAT = { spike: 'a spike', saw: 'a saw', pit: 'a pit', time: 'the clock', stuck: 'being stuck', lost: 'a wrong landing' };

    let dlg, canvas, sayEl, marksEl, toolsEl, padEl, actionsEl, save, tool = 'block', mode = 'build', run = null, feed = null, yours = null, hand = null, attempt = 0, raf = 0, last = 0, acc = 0, startAt = 0, preview = 0;
    const keys = { left: false, right: false, jump: false };

    function build() {
        canvas = el('canvas', { class: 'rooms-canvas', 'aria-label': 'The room' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        toolsEl = el('div', { class: 'maze-tools', role: 'group', 'aria-label': 'What to place' });
        const hold = (name, text, label, cls) => { const b = el('button', { type: 'button', class: 'maze-dir rooms-key ' + cls, 'aria-label': label, text }); const on = e => { e.preventDefault(); keys[name] = true; }, off = e => { e.preventDefault(); keys[name] = false; };
            b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); return b; };
        padEl = el('div', { class: 'rooms-pad', hidden: '' }, el('div', { class: 'rooms-move' }, hold('left', '◀', 'Left', 'rooms-left'), hold('right', '▶', 'Right', 'rooms-right')), hold('jump', 'Jump', 'Jump', 'rooms-jump'));
        actionsEl = el('div', { class: 'course-actions' });
        canvas.addEventListener('pointerdown', e => { if (mode !== 'build') return; e.preventDefault(); const r = canvas.getBoundingClientRect(), o = R().ROOM; place(R().id(Math.floor((e.clientX - r.left) / (r.width / o.cols)), Math.floor((e.clientY - r.top) / (r.height / o.rows)))); });
        dlg = el('dialog', { class: 'evals-screen course-screen rooms-screen', 'aria-label': 'Evals: the room' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                el('button', { type: 'button', class: 'ghost-button course-switch', text: 'Maze', 'aria-label': 'Switch to the maze course', onclick: () => { close(); try { localStorage.setItem('agiCourseKind', 'maze'); } catch { /* private mode */ } window.MazeUI?.open(); } }),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body rooms-body' }, sayEl, canvas, toolsEl, padEl, actionsEl));
        dlg.addEventListener('close', stop);
        const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ' ': 'jump', ArrowUp: 'jump', w: 'jump' };
        dlg.addEventListener('keydown', e => { if (mode === 'test' && KEYS[e.key]) { e.preventDefault(); keys[KEYS[e.key]] = true; } });
        dlg.addEventListener('keyup', e => { if (KEYS[e.key]) keys[KEYS[e.key]] = false; });
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { marksEl.textContent = '◈ ' + save.marks.toLocaleString('en-US'); marksEl.setAttribute('aria-label', save.marks + ' Marks'); }

    function place(i) {
        const next = save.room.slice(), want = tool === 'erase' || next[i] === tool ? null : tool;
        if (want && !R().allowed(want, i)) { say(R().fixed(i) ? 'That place is kept clear.' : R().TILES[want].floor ? 'A pit goes in the floor, the bottom row.' : 'Only pits go in the floor.'); return; }
        next[i] = want; save.room = R().cleanRoom(next); yours = null; keep(); toBuild();
    }
    function toBuild(text) {
        stop(); mode = 'build'; run = null; hand = null; padEl.hidden = true; toolsEl.hidden = false;
        const have = [...R().palette(skills()), 'erase'];
        if (!have.includes(tool)) tool = have[0];
        toolsEl.replaceChildren(...have.map(k => el('button', { type: 'button', class: 'maze-tool' + (k === tool ? ' on' : ''), 'aria-pressed': String(k === tool), text: k === 'erase' ? 'Erase' : R().TILES[k].name + (R().TILES[k].points ? ' ' + R().TILES[k].points : ''), onclick: () => { tool = k; toBuild(); } })));
        const pts = R().points(save.room);
        say(text || (pts ? `There are ${pts} points in this room. I only score what I get past, and only if I reach the flag. Show me the way up.` : 'Pick something and tap the room to place it. The flag is on the ledge, top right: I will need blocks or a spring to get up there.'));
        actions(button('Run it yourself', toTest, true), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []), button('Clear', () => { save.room = R().emptyRoom(); yours = null; keep(); toBuild(); }));
        header(); go();
    }
    function toTest() {
        stop(); mode = 'test'; run = R().createRun(save.room); feed = null; keys.left = keys.right = keys.jump = false; padEl.hidden = false; toolsEl.hidden = true;
        startAt = performance.now() + 700;
        say('Left, right and jump. Reach the flag.');
        actions(button('Back to building', () => toBuild()));
        go();
    }
    function testOver() {
        const r = R().result(run); padEl.hidden = true; mode = 'tested';
        if (r.finished) {
            yours = r;
            say(`You reached the flag in ${secs(r.time)} and got past ${r.points} ${r.points === 1 ? 'point' : 'points'}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Run it again', toTest), button('Change it', () => toBuild()));
            return;
        }
        const can = R().canHandOver(save.room, r, masteryNow()), where = `You were stopped by ${WHAT[r.failed.type] || 'something'}.`;
        if (can.ok) { yours = r; say(`${where} I watched how far you got. I think I can work out the rest.`); actions(button('Let the AI try', toAi, true), button('Try again', toTest), button('Change it', () => toBuild())); }
        else { yours = null; say(can.why === 'impossible' ? `${where} I do not think anyone can do this one.` : `${where} It has to be possible before I can try.`); actions(button('Try again', toTest, true), button('Change it', () => toBuild())); }
    }
    function toAi() {
        if (!yours) return;
        stop(); mode = 'ai'; toolsEl.hidden = true; padEl.hidden = true;
        hand = R().handOver(save.room, yours, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow() });
        if (!hand.attempts.length) { say('I do not think anyone can do this one.'); actions(button('Change it', () => toBuild(), true)); mode = 'tested'; draw(); return; }
        attempt = 0; actions(button('Skip to the result', aiResult)); aiStart();
    }
    function aiStart() {
        run = R().createRun(save.room); feed = { inputs: hand.attempts[attempt].inputs, i: 0 };
        startAt = performance.now() + 600;
        say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`);
        go();
    }
    function aiOver() {
        const r = hand.attempts[attempt].result;
        say(r.finished ? `At the flag, in ${secs(r.time)}.` : `Stopped by ${WHAT[r.failed.type] || 'something'}. I will take that one differently.`);
        attempt++;
        setTimeout(() => { if (mode !== 'ai') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 1200);
    }
    function aiResult() {
        stop(); mode = 'result';
        const key = roomKey(), ref = (yours.finished && yours.time) || save.times[key] || 0, top = hand.score, marks = R().marksFor(top, ref), tries = hand.attempts.length;
        save.runs++; save.marks += marks;
        if (top) save.times[key] = Math.min(save.times[key] || Infinity, top.time);
        const st = R().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        if (!top) say(`I could not reach the flag in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) { const d = yours.time - top.time; say(`At the flag: ${top.points} ${top.points === 1 ? 'point' : 'points'}, ${secs(top.time)} against your ${secs(yours.time)}${d > 0.05 ? '. I was faster' : d < -0.05 ? '. You were faster' : ''}. ${marks} Marks.`); }
        else { const d = ref - top.time; say(`Finished the one you could not: ${top.points} ${top.points === 1 ? 'point' : 'points'} in ${secs(top.time)}${ref ? (d > 0.05 ? `, ${secs(d)} under my best` : `. My best here is ${secs(ref)}`) : ''}. ${marks} Marks.`); }
        if (grew) sayEl.textContent += st === 2 ? ' I think I can finish a room now even if you are stopped in it. Run it once, as far as you get.' : ' I do not need to be shown the hard parts any more. Run it once anyway.';
        actions(button('Change the room', () => toBuild(), true), button('Hand it over again', toAi));
        run = null; go();
    }

    // The loop: the rules' fixed step, paced by the clock. With no run, the saws are shown keeping time.
    function go() { cancelAnimationFrame(raf); last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); draw(); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function frame(now) {
        raf = 0;
        if (!dlg || !dlg.open) return;
        const step = R().ROOM.step;
        acc += Math.min(0.1, (now - last) / 1000); last = now;
        if (run && now >= startAt) {
            const s = run.state;
            while (acc >= step && !s.over) { acc -= step; run.step(feed ? (feed.i < feed.inputs.length ? feed.inputs[feed.i++] : { dir: 0, jump: false }) : { dir: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), jump: keys.jump }); }
            if (s.over) { draw(); if (mode === 'test') testOver(); else if (mode === 'ai') aiOver(); return; }
        } else { while (acc >= step) { acc -= step; if (!run) preview++; } }
        draw();
        raf = requestAnimationFrame(frame);
    }

    function draw() {
        if (!canvas || !dlg.open) return;
        const o = R().ROOM, css = getComputedStyle(dlg), col = n => css.getPropertyValue(n).trim() || '#888';
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const k = W / o.cols, s = run ? run.state : null, n = s ? s.n : preview, mono = css.getPropertyValue('--font-mono') || 'monospace';
        if (mode === 'build') { ctx.strokeStyle = col('--border'); ctx.globalAlpha = 0.5; for (let cx = 1; cx < o.cols; cx++) { ctx.beginPath(); ctx.moveTo(cx * k, 0); ctx.lineTo(cx * k, H); ctx.stroke(); } for (let cy = 1; cy < o.rows; cy++) { ctx.beginPath(); ctx.moveTo(0, cy * k); ctx.lineTo(W, cy * k); ctx.stroke(); } ctx.globalAlpha = 1; }
        for (let cy = 0; cy < o.rows; cy++) for (let cx = 0; cx < o.cols; cx++) {
            const t = R().at(save.room, cx, cy), x = cx * k, y = cy * k;
            if (t === 'ground') { ctx.fillStyle = col('--panel-2'); ctx.fillRect(x, y, k + 0.5, k); ctx.fillStyle = col('--success'); ctx.fillRect(x, y, k + 0.5, 2); }
            else if (t === 'block') { ctx.fillStyle = col('--panel-2'); ctx.fillRect(x + 0.5, y + 0.5, k - 1, k - 1); ctx.strokeStyle = col('--muted'); ctx.strokeRect(x + 1, y + 1, k - 2, k - 2); }
            else if (t === 'spring') { ctx.fillStyle = col('--panel-2'); ctx.fillRect(x + 0.5, y + k * 0.35, k - 1, k * 0.65); ctx.fillStyle = col('--primary'); ctx.fillRect(x + 2, y, k - 4, k * 0.3); }
            else if (t === 'spike') { ctx.fillStyle = col('--danger'); ctx.beginPath(); ctx.moveTo(x + k * 0.2, y + k); ctx.lineTo(x + k * 0.5, y + k * 0.5); ctx.lineTo(x + k * 0.8, y + k); ctx.closePath(); ctx.fill(); }
            else if (cy === o.rows - 1 && save.room[R().id(cx, cy)] === 'pit') { ctx.fillStyle = col('--danger'); ctx.globalAlpha = 0.22; ctx.fillRect(x, y, k + 0.5, k); ctx.globalAlpha = 1; }
        }
        // The flag, and where you start.
        const g = R().goalTile(), gx = (g % o.cols) * k, gy = Math.floor(g / o.cols) * k;
        ctx.strokeStyle = col('--success'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx + k * 0.5, gy); ctx.lineTo(gx + k * 0.5, gy - k * 0.9); ctx.stroke(); ctx.fillStyle = col('--success'); ctx.beginPath(); ctx.moveTo(gx + k * 0.5, gy - k * 0.9); ctx.lineTo(gx + k * 0.95, gy - k * 0.7); ctx.lineTo(gx + k * 0.5, gy - k * 0.5); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1;
        for (const h of R().hazards(save.room)) if (h.kind === 'saw') {
            const p = R().sawAt(h, n);
            ctx.strokeStyle = col('--research') || col('--primary'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo((h.cx + 0.5 - o.sawReach) * k, p.y * k); ctx.lineTo((h.cx + 0.5 + o.sawReach) * k, p.y * k); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = col('--research') || col('--primary'); ctx.beginPath(); for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4 + n * 0.2, r = o.sawR * k * (a % 2 ? 0.7 : 1.05); ctx.lineTo(p.x * k + r * Math.cos(ang), p.y * k + r * Math.sin(ang)); } ctx.closePath(); ctx.fill();
        }
        if (mode === 'ai' && hand && hand.route) { ctx.fillStyle = col('--muted'); ctx.globalAlpha = 0.6; for (const t of hand.route.route) ctx.fillRect(((t % o.cols) + 0.5) * k - 2, Math.floor(t / o.cols) * k - 5, 4, 4); ctx.globalAlpha = 1; }
        if (s) {
            const x = s.x * k, y = s.y * k, w = o.w * k, h = o.h * k;
            ctx.fillStyle = s.failed ? col('--danger') : mode === 'test' || mode === 'tested' ? col('--primary') : col('--success');
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h, w, h, 5) : ctx.rect(x - w / 2, y - h, w, h); ctx.fill();
            ctx.fillStyle = col('--warning'); ctx.beginPath(); ctx.arc(x, y - h * 0.6, w * 0.16, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = col('--text'); ctx.font = '12px ' + mono; ctx.textAlign = 'left'; ctx.fillText(secs(s.n * o.step) + '  ' + s.points + ' pts', 6, 14);
        } else if (mode === 'build') { const st = R().startCell(); ctx.fillStyle = col('--muted'); ctx.font = '600 10px ' + mono; ctx.textAlign = 'center'; ctx.fillText('START', ((st % o.cols) + 0.5) * k, (Math.floor(st / o.cols) + 0.6) * k); }
    }

    function open() {
        if (!R()) return;
        if (!dlg) build();
        save = load(); yours = null;
        if (!dlg.open) dlg.showModal();
        toBuild();
    }
    function close() { if (dlg && dlg.open) { stop(); dlg.close(); } }
    window.RoomsUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; }, keys };
})();
