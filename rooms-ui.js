// rooms-ui.js — the platformer room's screen (window.RoomsUI). PROTOTYPE, the third kind of course
// (design/evals-course.md): furnish a room, run and jump through it yourself, hand it to the AI and watch its attempts.
// Rules are rooms.js's. It keeps its own progress on the device (`agiRooms`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const R = () => window.Rooms;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiRooms';
    const load = () => { try { const s = JSON.parse(localStorage.getItem(window.CourseUnlocks.key(KEY)) || '{}'); return { room: R().cleanRoom(s.room), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), times: s.times && typeof s.times === 'object' ? s.times : {} }; } catch { return { room: R().emptyRoom(), marks: 0, runs: 0, stage: 1, times: {} }; } };
    const keep = () => { try { localStorage.setItem(window.CourseUnlocks.key(KEY), JSON.stringify(save)); } catch { /* private mode */ } };
    const skills = () => (window.CourseUnlocks.on ? window.CourseUnlocks.levelOf('rooms') : location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const O = () => window.CourseTree.room(R().ROOM);   // the rules as the tree has changed them: grace at a ledge, the AI's take-off
    const masteryNow = () => R().mastery(save.runs * window.CourseTree.mult(), location.hash === '#playground' ? 0 : Math.min(skills(), 20));
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
                window.CourseUnlocks.switchButton('rooms'),
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
    function header() { window.CourseTree.refresh(dlg, () => { if (dlg.open) header(); }); window.CourseUnlocks.refresh(dlg, 'rooms'); }   // the Marks are the pool's (course-tree.js)

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
        stop(); mode = 'test'; run = R().createRun(save.room, O()); feed = null; keys.left = keys.right = keys.jump = false; padEl.hidden = false; toolsEl.hidden = true;
        startAt = performance.now() + 700;
        say('Left, right and jump. Reach the flag.');
        actions(button('Back to building', () => toBuild()));
        go();
    }
    function testOver() {
        const r = R().result(run); padEl.hidden = true; mode = 'tested';
        window.CourseUnlocks.log('courseTest', { kind: 'rooms', ...window.CourseUnlocks.brief(r), built: window.CourseUnlocks.parts(save.room) });
        if (r.finished) {
            yours = r;
            say(`You reached the flag in ${secs(r.time)} and got past ${r.points} ${r.points === 1 ? 'point' : 'points'}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Run it again', toTest), button('Change it', () => toBuild()));
            return;
        }
        const can = R().canHandOver(save.room, r, masteryNow(), O()), where = `You were stopped by ${WHAT[r.failed.type] || 'something'}.`;
        if (can.ok) { yours = r; say(`${where} I watched how far you got. I think I can work out the rest.`); actions(button('Let the AI try', toAi, true), button('Try again', toTest), button('Change it', () => toBuild())); }
        else { yours = null; say(can.why === 'impossible' ? `${where} I do not think anyone can do this one.` : `${where} It has to be possible before I can try.`); actions(button('Try again', toTest, true), button('Change it', () => toBuild())); }
    }
    function toAi() {
        if (!yours) return;
        stop(); mode = 'ai'; toolsEl.hidden = true; padEl.hidden = true;
        hand = R().handOver(save.room, yours, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow(), tries: R().ROOM.tries + window.CourseTree.tries() }, O());
        if (!hand.attempts.length) { say('I do not think anyone can do this one.'); actions(button('Change it', () => toBuild(), true)); mode = 'tested'; draw(); return; }
        attempt = 0; actions(button('Skip to the result', aiResult)); aiStart();
    }
    function aiStart() {
        run = R().createRun(save.room, O()); feed = { inputs: hand.attempts[attempt].inputs, i: 0 };
        startAt = performance.now() + 350;
        say(`Attempt ${attempt + 1} of ${hand.attempts.length}.`);
        go();
    }
    function aiOver() {
        const r = hand.attempts[attempt].result;
        say(r.finished ? `At the flag, in ${secs(r.time)}.` : `Stopped by ${WHAT[r.failed.type] || 'something'}. I will take that one differently.`);
        attempt++;
        setTimeout(() => { if (mode !== 'ai') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 750);
    }
    function aiResult() {
        stop(); mode = 'result';
        const key = roomKey(), ref = (yours.finished && yours.time) || save.times[key] || 0, top = hand.score, marks = window.CourseTree.payOut('rooms', R().marksFor(top, ref), { cleared: !!top, key }), tries = hand.attempts.length;
        save.runs++;
        if (top) save.times[key] = Math.min(save.times[key] || Infinity, top.time);
        const st = R().stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        if (!top) say(`I could not reach the flag in ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing scored.`);
        else if (yours.finished) { const d = yours.time - top.time; say(`At the flag: ${top.points} ${top.points === 1 ? 'point' : 'points'}, ${secs(top.time)} against your ${secs(yours.time)}${d > 0.05 ? '. I was faster' : d < -0.05 ? '. You were faster' : ''}. ${marks} Marks.`); }
        else { const d = ref - top.time; say(`Finished the one you could not: ${top.points} ${top.points === 1 ? 'point' : 'points'} in ${secs(top.time)}${ref ? (d > 0.05 ? `, ${secs(d)} under my best` : `. My best here is ${secs(ref)}`) : ''}. ${marks} Marks.`); }
        if (grew) sayEl.textContent += st === 2 ? ' I think I can finish a room now even if you are stopped in it. Run it once, as far as you get.' : ' I do not need to be shown the hard parts any more. Run it once anyway.';
        if (!top && marks) sayEl.textContent += ` Partial credit: ${marks} Marks.`;
        window.CourseUnlocks.log('courseAi', { kind: 'rooms', cleared: top ? 1 : 0, marks, tries: hand.attempts.map(a => ((a.result || a).finished ? 'C' : 'F')).join(''), skipped: attempt < hand.attempts.length ? 1 : 0, ai: window.CourseUnlocks.brief(top), you: window.CourseUnlocks.brief(yours), built: window.CourseUnlocks.parts(save.room) });
        if (top) { const news = window.CourseUnlocks.cleared('rooms', lvl => R().palette(lvl).map(k => R().TILES[k].name)); if (news) sayEl.textContent += ' ' + news; window.CourseUnlocks.refresh(dlg, 'rooms'); }
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
        acc += Math.min(0.1, (now - last) / 1000) * (mode === 'ai' ? 1.5 : 1); last = now;   // the AI's attempts play at 1.5x (the owner's call, 2026-11-17: watching was too long)
        if (run && now >= startAt) {
            const s = run.state;
            while (acc >= step && !s.over) { acc -= step; run.step(feed ? (feed.i < feed.inputs.length ? feed.inputs[feed.i++] : { dir: 0, jump: false }) : { dir: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), jump: keys.jump }); }
            if (s.over) { draw(); if (mode === 'test') testOver(); else if (mode === 'ai') aiOver(); return; }
        } else { while (acc >= step) { acc -= step; if (!run) preview++; } }
        draw();
        raf = requestAnimationFrame(frame);
    }

    // Drawing (course-art.js for the runner, the burst and the theme's colours). Nothing here decides anything.
    let trail = [], trailRun = null, endAt = 0, endRun = null;
    function draw() {
        if (!canvas || !dlg.open) return;
        const A = window.CourseArt, o = R().ROOM, C = A.colours(dlg), now = performance.now();
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const k = W / o.cols, s = run ? run.state : null, n = s ? s.n : preview, ai = mode === 'ai' || (mode === 'result' && !!s);
        // The back wall: faint dots at the tile corners, a little brighter while building.
        ctx.fillStyle = C.text; ctx.globalAlpha = mode === 'build' ? 0.16 : 0.07;
        for (let cy = 1; cy < o.rows; cy++) for (let cx = 1; cx < o.cols; cx++) ctx.fillRect(cx * k - 1, cy * k - 1, 2, 2);
        ctx.globalAlpha = 1;
        for (let cy = 0; cy < o.rows; cy++) for (let cx = 0; cx < o.cols; cx++) {
            const t = R().at(save.room, cx, cy), x = cx * k, y = cy * k, raw = save.room[R().id(cx, cy)];
            if (t === 'ground') {
                ctx.fillStyle = C.panel; ctx.fillRect(x, y, k + 0.5, k);
                ctx.strokeStyle = C.border; ctx.globalAlpha = 0.6; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(x + k * (0.15 + i * 0.3), y + k); ctx.lineTo(x + k * (0.45 + i * 0.3), y + k * 0.35); } ctx.stroke(); ctx.globalAlpha = 1;
                ctx.fillStyle = C.success; ctx.fillRect(x, y, k + 0.5, 2); ctx.globalAlpha = 0.18; ctx.fillRect(x, y + 2, k + 0.5, 4); ctx.globalAlpha = 1;
            } else if (t === 'block') A.tile(ctx, x, y, k, k, C, Math.max(2, k * 0.12));
            else if (t === 'spring') {
                A.tile(ctx, x, y + k * 0.45, k, k * 0.55, C, 3);
                ctx.strokeStyle = C.primary; ctx.lineWidth = Math.max(1.5, k * 0.07); ctx.beginPath(); for (let i = 0; i <= 4; i++) { const px = x + k * (0.22 + (i % 2) * 0.56), py = y + k * (0.45 - i * 0.075); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); ctx.lineWidth = 1;
                ctx.fillStyle = C.primary; ctx.fillRect(x + k * 0.1, y + k * 0.04, k * 0.8, Math.max(3, k * 0.12));
            } else if (t === 'boost') {
                const ph = (now / 260) % 1;
                for (let a = 0; a < 3; a++) { const bx = x + k * (0.12 + ((a + ph) % 3) * 0.28); ctx.fillStyle = C.primary; ctx.globalAlpha = 0.35 + 0.55 * (((a + ph) % 3) / 3); ctx.beginPath(); ctx.moveTo(bx, y + k - 2); ctx.lineTo(bx + k * 0.2, y + k * 0.72); ctx.lineTo(bx, y + k * 0.46); ctx.lineTo(bx + k * 0.08, y + k * 0.72); ctx.closePath(); ctx.fill(); }
                ctx.globalAlpha = 1;
            } else if (t === 'spike') {
                for (let i = 0; i < 3; i++) { const sx = x + k * (0.2 + i * 0.2); ctx.fillStyle = C.danger; ctx.beginPath(); ctx.moveTo(sx, y + k); ctx.lineTo(sx + k * 0.1, y + k * 0.5); ctx.lineTo(sx + k * 0.2, y + k); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.text; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(sx + k * 0.07, y + k * 0.66); ctx.lineTo(sx + k * 0.1, y + k * 0.5); ctx.lineTo(sx + k * 0.13, y + k * 0.66); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
            } else if (cy === o.rows - 1 && raw === 'pit') {
                ctx.fillStyle = C.bg; ctx.fillRect(x, y, k + 0.5, k);
                for (let i = 0; i < 4; i++) { ctx.fillStyle = C.danger; ctx.globalAlpha = 0.07 + 0.07 * i; ctx.fillRect(x, y + k * (i / 4), k + 0.5, k / 4); }
                ctx.globalAlpha = 1;
            }
        }
        // The flag on its ledge, with a slow beacon.
        const g = R().goalTile(), gx = (g % o.cols) * k, gy = Math.floor(g / o.cols) * k, wave = Math.sin(now / 300) * k * 0.06;
        ctx.strokeStyle = C.success; ctx.globalAlpha = 0.5 * (1 - ((now / 1400) % 1)); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(gx + k * 0.5, gy, k * (0.3 + 0.5 * ((now / 1400) % 1)), k * 0.12, 0, 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(gx + k * 0.5, gy); ctx.lineTo(gx + k * 0.5, gy - k * 0.95); ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = C.success; ctx.beginPath(); ctx.moveTo(gx + k * 0.5, gy - k * 0.95); ctx.quadraticCurveTo(gx + k * 0.75, gy - k * 0.9 + wave, gx + k, gy - k * 0.72 + wave); ctx.quadraticCurveTo(gx + k * 0.75, gy - k * 0.62 + wave, gx + k * 0.5, gy - k * 0.5); ctx.closePath(); ctx.fill();
        // Saws: a rail, and a toothed wheel turning on it.
        for (const h of R().hazards(save.room)) if (h.kind === 'saw') {
            const p = R().sawAt(h, n), px = p.x * k, py = p.y * k, rr = o.sawR * k;
            ctx.strokeStyle = C.research; ctx.globalAlpha = 0.45; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo((h.cx + 0.5 - o.sawReach) * k, py); ctx.lineTo((h.cx + 0.5 + o.sawReach) * k, py); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
            A.glow(ctx, px, py, rr, C.research, 0.7);
            ctx.fillStyle = C.research; ctx.beginPath(); for (let a = 0; a < 16; a++) { const ang = a * Math.PI / 8 + n * 0.22, r2 = rr * (a % 2 ? 0.72 : 1.12); ctx.lineTo(px + r2 * Math.cos(ang), py + r2 * Math.sin(ang)); } ctx.closePath(); ctx.fill();
            ctx.fillStyle = C.bg2; ctx.beginPath(); ctx.arc(px, py, rr * 0.32, 0, A.TAU); ctx.fill();
        }
        // The way the AI was given, as a dotted line over the tiles' tops.
        if (ai && hand && hand.route) { ctx.strokeStyle = C.muted; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 5]); ctx.beginPath(); hand.route.route.forEach((t, i) => { const px = ((t % o.cols) + 0.5) * k, py = Math.floor(t / o.cols) * k - 3; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        if (s) {
            if (trailRun !== run) { trailRun = run; trail = []; }
            if (!s.over && (!trail.length || Math.hypot(trail[trail.length - 1].x - s.x, trail[trail.length - 1].y - s.y) > 0.12)) { trail.push({ x: s.x, y: s.y }); if (trail.length > 14) trail.shift(); }
            if (s.over && endRun !== run) { endRun = run; endAt = now; }
            const body = ai ? C.success : C.primary, rr = o.h * k * 0.5, x = s.x * k, y = s.y * k - rr;
            trail.forEach((p, i) => { ctx.fillStyle = body; ctx.globalAlpha = 0.05 + 0.25 * (i / trail.length); ctx.beginPath(); ctx.arc(p.x * k, p.y * k - rr, rr * (0.25 + 0.5 * (i / trail.length)), 0, A.TAU); ctx.fill(); });
            ctx.globalAlpha = 1;
            if (s.n <= s.boost) { ctx.strokeStyle = C.primary; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - rr * (1.4 + i * 0.5), y - rr * 0.5 + i * rr * 0.5); ctx.lineTo(x - rr * (2.2 + i * 0.5), y - rr * 0.5 + i * rr * 0.5); ctx.stroke(); } ctx.lineWidth = 1; ctx.globalAlpha = 1; }
            const stretch = Math.max(-0.22, Math.min(0.22, -s.vy / 45));
            A.runner(ctx, x, y, rr, C, ai, { now, dead: !!s.failed, sx: 1 - stretch * (s.ground ? 0 : 1), sy: 1 + stretch * (s.ground ? 0 : 1) });
            if (s.failed && endRun === run) A.burst(ctx, x, y, rr * 1.4, C.danger, endAt, now);
            if (s.finished && endRun === run) A.burst(ctx, x, y, rr * 1.6, C.success, endAt, now, 900);
            A.pill(ctx, `${secs(s.n * o.step)}  ${s.points} ${s.points === 1 ? 'pt' : 'pts'}`, 6, 6, C);
            if (ai && hand) A.pill(ctx, `try ${Math.min(attempt + 1, hand.attempts.length)} of ${hand.attempts.length}`, W - 6, 6, C, 'right');
        } else if (mode === 'build') { const st = R().startCell(), sx = ((st % o.cols) + 0.5) * k, sy = (Math.floor(st / o.cols) + 1) * k - o.h * k * 0.5; ctx.globalAlpha = 0.55; A.ball(ctx, sx, sy, o.h * k * 0.5, C); ctx.globalAlpha = 1; }
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
