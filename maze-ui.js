// maze-ui.js — the maze course's screen (window.MazeUI). PROTOTYPE, the second kind of course (design/evals-course.md):
// build a maze, walk it yourself, hand it to the AI and watch its attempts. Rules are maze.js's.
// It keeps its own progress on the device (`agiMaze`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const M = () => window.Maze;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiMaze';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(window.CourseUnlocks.key(KEY)) || '{}'); return { maze: M().cleanMaze(s.maze), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), times: s.times && typeof s.times === 'object' ? s.times : {} }; } catch { return { maze: M().emptyMaze(), marks: 0, runs: 0, stage: 1, times: {} }; } };
    const keep = () => { try { localStorage.setItem(window.CourseUnlocks.key(KEY), JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (window.CourseUnlocks.on ? window.CourseUnlocks.levelOf('maze') : location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const masteryNow = () => M().mastery(save.runs * window.CourseTree.mult(), location.hash === '#playground' ? 0 : Math.min(skills(), 20));
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
                window.CourseUnlocks.switchButton('maze'),
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
    function header() { window.CourseTree.refresh(dlg, () => { if (dlg.open) header(); }); window.CourseUnlocks.refresh(dlg, 'maze'); }   // the Marks are the pool's (course-tree.js)

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
        stop(); mode = 'test'; run = M().createRun(save.maze, { ...M().MAZE, lives: window.CourseTree.lives() }); feed = null; held = -1; padEl.hidden = false; toolsEl.hidden = true;
        startAt = performance.now() + 700;
        say('Hold a direction to walk. Let go to stand still.');
        actions(button('Back to building', () => toBuild()));
        tick();
    }
    function testOver() {
        const r = M().result(run), spared = run.state.spared ? ' Your second life was spent.' : ''; padEl.hidden = true; held = -1; mode = 'tested';
        window.CourseUnlocks.log('courseTest', { kind: 'maze', ...window.CourseUnlocks.brief(r), built: window.CourseUnlocks.parts(save.maze) });
        if (r.finished) {
            yours = r;
            say(`You reached the exit in ${secs(r.time)} and got past ${r.points} ${r.points === 1 ? 'point' : 'points'}. May I try?${spared}`);
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
        hand = M().handOver(save.maze, yours, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow(), tries: M().MAZE.tries + window.CourseTree.tries() }, window.CourseTree.maze(M().MAZE));
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
        const key = mazeKey(), ref = (yours.finished && yours.time) || save.times[key] || 0, top = hand.score, marks = window.CourseTree.payOut('maze', M().marksFor(top, ref), { cleared: !!top, key }), tries = hand.attempts.length;
        save.runs++;
        if (top) save.times[key] = Math.min(save.times[key] || Infinity, top.time);
        const st = M().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        if (!top) say(`I could not get out in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) { const d = yours.time - top.time; say(`Out: ${top.points} ${top.points === 1 ? 'point' : 'points'}, ${secs(top.time)} against your ${secs(yours.time)}${d > 0.05 ? '. I was faster' : d < -0.05 ? '. You were faster' : ''}. ${marks} Marks.`); }
        else { const d = ref - top.time; say(`Out of the one you could not finish: ${top.points} ${top.points === 1 ? 'point' : 'points'} in ${secs(top.time)}${ref ? (d > 0.05 ? `, ${secs(d)} under my best` : `. My best here is ${secs(ref)}`) : ''}. ${marks} Marks.`); }
        if (grew) sayEl.textContent += st === 2 ? ' I think I can finish a maze now even if you are caught in it. Walk it once, as far as you get.' : ' I do not need to be shown the hard parts any more. Walk it once anyway.';
        if (!top && marks) sayEl.textContent += ` Partial credit: ${marks} Marks.`;
        window.CourseUnlocks.log('courseAi', { kind: 'maze', cleared: top ? 1 : 0, marks, tries: hand.attempts.map(a => ((a.result || a).finished ? 'C' : 'F')).join(''), skipped: attempt < hand.attempts.length ? 1 : 0, ai: window.CourseUnlocks.brief(top), you: window.CourseUnlocks.brief(yours), built: window.CourseUnlocks.parts(save.maze) });
        if (top) { const news = window.CourseUnlocks.cleared('maze', lvl => M().palette(lvl).map(k => M().TILES[k].name)); if (news) sayEl.textContent += ' ' + news; window.CourseUnlocks.refresh(dlg, 'maze'); }
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

    // Drawing (course-art.js for the runner, the burst and the theme's colours). Nothing here decides anything.
    // The rules move in ticks; the picture glides between them (`tickAt`: when the count last changed).
    let lastN = -1, tickAt = 0, shown = -1, from = -1, movedAt = 0, endAt = 0, endRun = null, painting = 0;
    function paint() { painting = 0; if (!dlg || !dlg.open) return; draw(); }   // draw() asks for the next frame itself
    function draw() {
        if (!canvas || !dlg.open) return;
        if (!painting) painting = requestAnimationFrame(paint);
        const A = window.CourseArt, o = M().MAZE, C = A.colours(dlg), now = performance.now();
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const cw = W / o.cols, ch = H / o.rows, s = run ? run.state : null, n = s ? s.n : preview, w = run ? run.world : M().world(save.maze), ai = mode === 'ai' || (mode === 'result' && !!s);
        if (n !== lastN) { lastN = n; tickAt = now; }
        const frac = s && s.over ? 1 : Math.max(0, Math.min(1, (now - tickAt) / (o.tick * 1000)));
        const X = i => (i % o.cols) * cw, Y = i => Math.floor(i / o.cols) * ch, cx = i => X(i) + cw / 2, cy = i => Y(i) + ch / 2, u = Math.min(cw, ch);
        // The floor: a quiet checker.
        for (let i = 0; i < M().size(); i++) { ctx.fillStyle = C.text; ctx.globalAlpha = ((i % o.cols) + Math.floor(i / o.cols)) % 2 ? 0.025 : 0.05; ctx.fillRect(X(i), Y(i), cw, ch); }
        ctx.globalAlpha = 1;
        // The start and the exit.
        const st = M().startCell(), ex = M().exitCell(), beat = (now / 1300) % 1;
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(cx(st), cy(st), u * 0.36, 0, A.TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.success; ctx.globalAlpha = 0.16; ctx.fillRect(X(ex) + 2, Y(ex) + 2, cw - 4, ch - 4); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.success; ctx.lineWidth = 2; ctx.globalAlpha = 1 - beat; ctx.strokeRect(X(ex) + 2 + u * 0.3 * (1 - beat), Y(ex) + 2 + u * 0.3 * (1 - beat), cw - 4 - u * 0.6 * (1 - beat), ch - 4 - u * 0.6 * (1 - beat)); ctx.globalAlpha = 1;
        ctx.fillStyle = C.success; ctx.font = '700 11px ' + C.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('EXIT', cx(ex), cy(ex));
        ctx.lineWidth = 1;
        for (let i = 0; i < M().size(); i++) {
            const x = X(i), y = Y(i), k = save.maze[i];
            if (k === 'wall') { A.tile(ctx, x + 1, y + 1, cw - 2, ch - 2, C, 5); ctx.fillStyle = C.bg; ctx.globalAlpha = 0.35; ctx.fillRect(x + 4, y + ch - 6, cw - 8, 3); ctx.globalAlpha = 1; }
            else if (k === 'trap') {
                // Live: the spikes are up. About to be: a warning ring. Safe: the plate alone.
                const live = w.trapLive(i, n), soon = !live && (w.trapLive(i, n + 1) || w.trapLive(i, n + 2)), up = live ? 1 : 0;
                ctx.strokeStyle = live ? C.danger : soon ? C.warning : C.border; ctx.lineWidth = live || soon ? 2 : 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x + 5, y + 5, cw - 10, ch - 10, 4); else ctx.rect(x + 5, y + 5, cw - 10, ch - 10); ctx.stroke(); ctx.lineWidth = 1;
                if (live) { ctx.fillStyle = C.danger; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
                for (let a = 0; a < 4; a++) { const px = x + cw * (0.3 + (a % 2) * 0.4), py = y + ch * (0.34 + Math.floor(a / 2) * 0.36), r = u * (0.05 + 0.1 * up); ctx.fillStyle = live ? C.danger : soon ? C.warning : C.muted; ctx.globalAlpha = live ? 1 : soon ? 0.85 : 0.4; ctx.beginPath(); ctx.moveTo(px - r, py + r); ctx.lineTo(px, py - r * (0.6 + up)); ctx.lineTo(px + r, py + r); ctx.closePath(); ctx.fill(); }
                ctx.globalAlpha = 1;
            } else if (k === 'key' && !(s && s.key)) {
                const bob = Math.sin(now / 350 + i) * u * 0.04; A.glow(ctx, cx(i) - u * 0.1, cy(i) + bob, u * 0.16, C.warning, 0.9);
                ctx.strokeStyle = C.warning; ctx.lineWidth = Math.max(2, u * 0.07); ctx.beginPath(); ctx.arc(cx(i) - u * 0.12, cy(i) + bob, u * 0.12, 0, A.TAU); ctx.moveTo(cx(i), cy(i) + bob); ctx.lineTo(cx(i) + u * 0.26, cy(i) + bob); ctx.moveTo(cx(i) + u * 0.18, cy(i) + bob); ctx.lineTo(cx(i) + u * 0.18, cy(i) + bob + u * 0.1); ctx.stroke(); ctx.lineWidth = 1;
            } else if (k === 'door') {
                const open = !!(s && s.key);
                ctx.strokeStyle = C.warning; ctx.globalAlpha = open ? 0.35 : 1; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
                if (!open) for (let b = 1; b <= 3; b++) { ctx.beginPath(); ctx.moveTo(x + cw * b / 4, y + 4); ctx.lineTo(x + cw * b / 4, y + ch - 4); ctx.stroke(); }
                ctx.lineWidth = 1; ctx.globalAlpha = 1;
            }
        }
        // What you showed it, under the AI's run; and where the runner has been.
        if (ai && yours) { ctx.strokeStyle = C.muted; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.beginPath(); yours.route.forEach((c, k) => { if (k) ctx.lineTo(cx(c), cy(c)); else ctx.moveTo(cx(c), cy(c)); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        if (s && s.route.length > 1) { ctx.strokeStyle = ai ? C.success : C.primary; ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(2, u * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); s.route.forEach((c, k) => { if (k) ctx.lineTo(cx(c), cy(c)); else ctx.moveTo(cx(c), cy(c)); }); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        // Patrols: Packet Snare's Antivirus, a ring with four notches, gliding along its row.
        for (const p of w.patrols) {
            const a = w.patrolCell(p, Math.max(0, n - 1)), b = w.patrolCell(p, n), px = cx(a) + (cx(b) - cx(a)) * frac, py = cy(b), r = u * 0.3;
            ctx.strokeStyle = C.bad; ctx.globalAlpha = 0.4; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(p.a * cw + cw / 2, py); ctx.lineTo(p.b * cw + cw / 2, py); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
            A.glow(ctx, px, py, r, C.bad, 0.8);
            ctx.strokeStyle = C.bad; ctx.lineWidth = Math.max(2, u * 0.08); ctx.beginPath(); ctx.arc(px, py, r, 0, A.TAU); ctx.stroke();
            for (let q = 0; q < 4; q++) { const ang = q * Math.PI / 2 + now / 900; ctx.beginPath(); ctx.moveTo(px + Math.cos(ang) * r * 0.55, py + Math.sin(ang) * r * 0.55); ctx.lineTo(px + Math.cos(ang) * r * 1.3, py + Math.sin(ang) * r * 1.3); ctx.stroke(); }
            ctx.lineWidth = 1; ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(px, py, r * 0.25, 0, A.TAU); ctx.fill();
        }
        if (s) {
            if (s.cell !== shown) { from = shown < 0 ? s.cell : shown; shown = s.cell; movedAt = now; }
            if (s.over && endRun !== run) { endRun = run; endAt = now; }
            const g = Math.max(0, Math.min(1, (now - movedAt) / (o.tick * 1000))), ease = g * (2 - g), fromOk = from >= 0 && Math.abs((from % o.cols) - (s.cell % o.cols)) + Math.abs(Math.floor(from / o.cols) - Math.floor(s.cell / o.cols)) === 1;
            const x = fromOk ? cx(from) + (cx(s.cell) - cx(from)) * ease : cx(s.cell), y = fromOk ? cy(from) + (cy(s.cell) - cy(from)) * ease : cy(s.cell), r = u * 0.3;
            A.runner(ctx, x, y, r, C, ai, { now, dead: !!s.failed });
            if (s.key) { ctx.fillStyle = C.warning; ctx.beginPath(); ctx.arc(x + r * 0.9, y - r * 0.9, r * 0.28, 0, A.TAU); ctx.fill(); }
            if (s.failed && endRun === run) A.burst(ctx, x, y, r * 1.4, C.danger, endAt, now);
            if (s.finished && endRun === run) A.burst(ctx, x, y, r * 1.7, C.success, endAt, now, 900);
            A.pill(ctx, `${secs(s.n * o.tick)}  ${s.points} ${s.points === 1 ? 'pt' : 'pts'}`, 6, 6, C);
            if (ai && hand) A.pill(ctx, `try ${Math.min(attempt + 1, hand.attempts.length)} of ${hand.attempts.length}`, W - 6, H - 26, C, 'right');
        } else { shown = -1; ctx.globalAlpha = 0.6; A.ball(ctx, cx(st), cy(st), u * 0.28, C); ctx.globalAlpha = 1; }
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
