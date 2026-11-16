// maze-ui.js — the maze course's screen (window.MazeUI). PROTOTYPE, the second kind of course (design/evals-course.md):
// build a maze, walk it yourself, hand it to the AI and watch its attempts. Rules are maze.js's.
// It keeps its own progress on the device (`agiMaze`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const M = () => window.Maze;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiMaze';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { maze: M().cleanMaze(s.maze), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), times: s.times && typeof s.times === 'object' ? s.times : {} }; } catch { return { maze: M().emptyMaze(), marks: 0, runs: 0, stage: 1, times: {} }; } };
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => M().mastery(save.runs, location.hash === '#playground' ? 0 : Math.min(skills(), 20));
    const secs = t => t.toFixed(1) + ' s';
    const mazeKey = () => save.maze.map(k => (k ? k[0] : '-')).join('');
    const WHAT = { trap: 'a trap', patrol: 'a patrol', time: 'the clock' };

    let dlg, canvas, sayEl, marksEl, toolsEl, padEl, actionsEl, save, tool = 'wall', mode = 'build', run = null, feed = null, yours = null, hand = null, attempt = 0, timer = 0, held = -1, preview = 0, startAt = 0;

    function build() {
        canvas = el('canvas', { class: 'maze-canvas', 'aria-label': 'The maze' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        toolsEl = el('div', { class: 'maze-tools', role: 'group', 'aria-label': 'What to place' });
        const dir = (d, text, label) => { const b = el('button', { type: 'button', class: 'maze-dir maze-dir-' + d, 'aria-label': label, text }); const on = e => { e.preventDefault(); held = d; }, off = e => { e.preventDefault(); if (held === d) held = -1; };
            b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); return b; };
        padEl = el('div', { class: 'maze-pad', hidden: '' }, dir(0, '▲', 'Up'), dir(3, '◀', 'Left'), dir(1, '▶', 'Right'), dir(2, '▼', 'Down'));
        actionsEl = el('div', { class: 'course-actions' });
        canvas.addEventListener('pointerdown', e => { if (mode !== 'build') return; e.preventDefault(); const r = canvas.getBoundingClientRect(), o = M().MAZE, x = Math.floor((e.clientX - r.left) / (r.width / o.cols)), y = Math.floor((e.clientY - r.top) / (r.height / o.rows)); place(y * o.cols + x); });
        dlg = el('dialog', { class: 'evals-screen course-screen maze-screen', 'aria-label': 'Evals: the maze' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                el('button', { type: 'button', class: 'ghost-button course-switch', text: 'Track', 'aria-label': 'Switch to the track course', onclick: () => { close(); try { localStorage.setItem('agiCourseKind', 'track'); } catch { /* private mode */ } window.CourseUI?.open(); } }),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body maze-body' }, sayEl, canvas, toolsEl, padEl, actionsEl));
        dlg.addEventListener('close', stop);
        const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
        dlg.addEventListener('keydown', e => { if (mode === 'test' && e.key in KEYS) { e.preventDefault(); held = KEYS[e.key]; } });
        dlg.addEventListener('keyup', e => { if (mode === 'test' && KEYS[e.key] === held) held = -1; });
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { marksEl.textContent = '◈ ' + save.marks.toLocaleString('en-US'); marksEl.setAttribute('aria-label', save.marks + ' Marks'); }

    function place(i) {
        const o = M().MAZE;
        if (i < 0 || i >= M().size() || i === M().startCell() || i === M().exitCell()) return;
        const next = save.maze.slice(); next[i] = tool === 'erase' || next[i] === tool ? null : tool;
        if (next[i] && M().TILES[next[i]].max) next.forEach((k, j) => { if (j !== i && k === next[i]) next[j] = null; });   // one key, one door: the old one moves
        save.maze = M().cleanMaze(next); yours = null; keep(); toBuild();
    }
    function toBuild(text) {
        stop(); mode = 'build'; run = null; hand = null; padEl.hidden = true; toolsEl.hidden = false; held = -1;
        const have = [...M().palette(skills()), 'erase'];
        if (!have.includes(tool)) tool = have[0];
        toolsEl.replaceChildren(...have.map(k => el('button', { type: 'button', class: 'maze-tool' + (k === tool ? ' on' : '') + ' ' + k, 'aria-pressed': String(k === tool), text: k === 'erase' ? 'Erase' : M().TILES[k].name + (M().TILES[k].points ? ' ' + M().TILES[k].points : ''), onclick: () => { tool = k; toBuild(); } })));
        const pts = M().points(save.maze);
        say(text || (pts ? `There are ${pts} points in this maze. I only score what I get past, and only if I reach the exit. Show me the way.` : 'Pick something and tap the grid to place it. Traps and patrols are worth points if I get past them. Walls decide the way.'));
        actions(button('Walk it yourself', toTest, true), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []), button('Clear', () => { save.maze = M().emptyMaze(); yours = null; keep(); toBuild(); }));
        header(); tick();
    }
    function toTest() {
        stop(); mode = 'test'; run = M().createRun(save.maze); feed = null; held = -1; padEl.hidden = false; toolsEl.hidden = true;
        startAt = performance.now() + 700;
        say('Hold a direction to walk. Let go to stand still.');
        actions(button('Back to building', () => toBuild()));
        tick();
    }
    function testOver() {
        const r = M().result(run); padEl.hidden = true; held = -1; mode = 'tested';
        if (r.finished) {
            yours = r;
            say(`You reached the exit in ${secs(r.time)} and got past ${r.points} ${r.points === 1 ? 'point' : 'points'}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Walk it again', toTest), button('Change it', () => toBuild()));
            return;
        }
        const can = M().canHandOver(save.maze, r, masteryNow()), where = `You were caught by ${WHAT[r.failed.type]}.`;
        if (can.ok) { yours = r; say(`${where} I watched how far you got. I think I can work out the rest.`); actions(button('Let the AI try', toAi, true), button('Try again', toTest), button('Change it', () => toBuild())); }
        else { yours = null; say(can.why === 'impossible' ? `${where} I do not think anyone can do this one.` : `${where} It has to be possible before I can try.`); actions(button('Try again', toTest, true), button('Change it', () => toBuild())); }
    }
    function toAi() {
        if (!yours) return;
        stop(); mode = 'ai'; toolsEl.hidden = true; padEl.hidden = true;
        hand = M().handOver(save.maze, yours, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow() });
        if (!hand.attempts.length) { say('I do not think anyone can do this one.'); actions(button('Change it', () => toBuild(), true)); mode = 'tested'; draw(); return; }
        attempt = 0; actions(button('Skip to the result', aiResult)); aiStart();
    }
    function aiStart() {
        run = M().createRun(save.maze); feed = { acts: hand.attempts[attempt].acts, i: 0 };
        startAt = performance.now() + 600;
        say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`);
        tick();
    }
    function aiOver() {
        const r = hand.attempts[attempt].result;
        say(r.finished ? `Out, in ${secs(r.time)}.` : `Caught by ${WHAT[r.failed.type]}. I will wait for a better moment there.`);
        attempt++;
        setTimeout(() => { if (mode !== 'ai') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 1200);
    }
    function aiResult() {
        stop(); mode = 'result';
        const key = mazeKey(), ref = (yours.finished && yours.time) || save.times[key] || 0, top = hand.score, marks = M().marksFor(top, ref), tries = hand.attempts.length;
        save.runs++; save.marks += marks;
        if (top) save.times[key] = Math.min(save.times[key] || Infinity, top.time);
        const st = M().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        if (!top) say(`I could not get out in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) { const d = yours.time - top.time; say(`Out: ${top.points} ${top.points === 1 ? 'point' : 'points'}, ${secs(top.time)} against your ${secs(yours.time)}${d > 0.05 ? '. I was faster' : d < -0.05 ? '. You were faster' : ''}. ${marks} Marks.`); }
        else { const d = ref - top.time; say(`Out of the one you could not finish: ${top.points} ${top.points === 1 ? 'point' : 'points'} in ${secs(top.time)}${ref ? (d > 0.05 ? `, ${secs(d)} under my best` : `. My best here is ${secs(ref)}`) : ''}. ${marks} Marks.`); }
        if (grew) sayEl.textContent += st === 2 ? ' I think I can finish a maze now even if you are caught in it. Walk it once, as far as you get.' : ' I do not need to be shown the hard parts any more. Walk it once anyway.';
        actions(button('Change the maze', () => toBuild(), true), button('Hand it over again', toAi));
        run = null; tick();
    }

    // The clock: one rules tick every MAZE.tick seconds. In build and result the hazards are shown keeping time.
    function stop() { clearTimeout(timer); timer = 0; }
    function tick() {
        stop();
        if (!dlg || !dlg.open) return;
        const o = M().MAZE;
        if (run && !run.state.over && performance.now() >= startAt) {
            run.act(feed ? (feed.i < feed.acts.length ? feed.acts[feed.i++] : -1) : held);
            if (run.state.over) { draw(); if (mode === 'test') testOver(); else if (mode === 'ai') aiOver(); return; }
        } else if (!run) preview++;
        draw();
        timer = setTimeout(tick, o.tick * 1000);
    }

    function draw() {
        if (!canvas || !dlg.open) return;
        const o = M().MAZE, css = getComputedStyle(dlg), col = n => css.getPropertyValue(n).trim() || '#888';
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const cw = W / o.cols, ch = H / o.rows, s = run ? run.state : null, n = s ? s.n : preview, w = run ? run.world : M().world(save.maze);
        const X = i => (i % o.cols) * cw, Y = i => Math.floor(i / o.cols) * ch, mono = css.getPropertyValue('--font-mono') || 'monospace';
        ctx.strokeStyle = col('--border'); ctx.lineWidth = 1;
        for (let i = 0; i < M().size(); i++) {
            const x = X(i), y = Y(i), k = save.maze[i];
            ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
            if (k === 'wall') { ctx.fillStyle = col('--panel-2'); ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2); ctx.fillStyle = col('--muted'); ctx.globalAlpha = 0.25; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2); ctx.globalAlpha = 1; }
            else if (k === 'trap') { const live = w.trapLive(i, n); ctx.fillStyle = col('--danger'); ctx.globalAlpha = live ? 0.85 : 0.15; ctx.fillRect(x + 4, y + 4, cw - 8, ch - 8); ctx.globalAlpha = 1; if (!live) { ctx.strokeStyle = col('--danger'); ctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9); ctx.strokeStyle = col('--border'); } }
            else if (k === 'key' && !(s && s.key)) { ctx.fillStyle = col('--warning'); ctx.beginPath(); ctx.arc(x + cw * 0.4, y + ch * 0.5, Math.min(cw, ch) * 0.16, 0, 2 * Math.PI); ctx.fill(); ctx.fillRect(x + cw * 0.5, y + ch * 0.46, cw * 0.28, ch * 0.08); }
            else if (k === 'door') { ctx.fillStyle = col('--warning'); ctx.globalAlpha = s && s.key ? 0.25 : 0.9; ctx.fillRect(x + 2, y + ch * 0.3, cw - 4, ch * 0.4); ctx.globalAlpha = 1; }
            else if (k === 'patrol') { const p = w.patrols.find(q => q.cell === i); ctx.strokeStyle = col('--research') || col('--primary'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(p.a * cw + cw / 2, y + ch / 2); ctx.lineTo(p.b * cw + cw / 2, y + ch / 2); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = col('--border'); }
        }
        const label = (i, text, c) => { ctx.fillStyle = c; ctx.font = '600 11px ' + mono; ctx.textAlign = 'center'; ctx.fillText(text, X(i) + cw / 2, Y(i) + ch / 2 + 4); };
        label(M().startCell(), 'START', col('--muted')); label(M().exitCell(), 'EXIT', col('--success'));
        // What you showed it, under the AI's run.
        if (mode === 'ai' && yours) { ctx.strokeStyle = col('--muted'); ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.beginPath(); yours.route.forEach((c, k) => { const px = X(c) + cw / 2, py = Y(c) + ch / 2; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        for (const p of w.patrols) { const c = w.patrolCell(p, n); ctx.fillStyle = col('--research') || col('--primary'); ctx.beginPath(); ctx.arc(X(c) + cw / 2, Y(c) + ch / 2, Math.min(cw, ch) * 0.3, 0, 2 * Math.PI); ctx.fill(); }
        if (s) {
            const r = Math.min(cw, ch) * 0.3, x = X(s.cell) + cw / 2, y = Y(s.cell) + ch / 2;
            ctx.fillStyle = s.failed ? col('--danger') : mode === 'test' || mode === 'tested' ? col('--primary') : col('--success'); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = col('--warning'); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 2 * Math.PI); ctx.fill();
            ctx.fillStyle = col('--text'); ctx.font = '12px ' + mono; ctx.textAlign = 'left'; ctx.fillText(secs(s.n * o.tick) + '  ' + s.points + ' pts', 6, 14);
        }
    }

    function open() {
        if (!M()) return;
        if (!dlg) build();
        save = load(); yours = null;
        if (!dlg.open) dlg.showModal();
        toBuild();
    }
    function close() { if (dlg && dlg.open) { stop(); dlg.close(); } }
    window.MazeUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; }, hold(d) { held = d; } };
})();
