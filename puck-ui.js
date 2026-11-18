// puck-ui.js — the puck course's screen (window.PuckUI). PROTOTYPE, the third kind of course (design/evals-course.md):
// build a course, sling the puck round it yourself, hand it to the AI and watch its attempts. Rules are puck.js's.
// It keeps its own progress on the device (`agiPuck`) and pays nothing into the game's save yet.
// EVERY WORD IS A PLACEHOLDER for the owner to write or approve.
(function () {
    'use strict';
    const P = () => window.Puck;
    const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.flat().filter(k => k !== '' && k != null)); return n; };
    const KEY = 'agiPuck';
    const blank = () => ({ course: P().emptyCourse(), marks: 0, runs: 0, stage: 1, best: {} });
    const load = () => { try { const s = JSON.parse(window.CourseUnlocks.store.get(window.CourseUnlocks.key(KEY)) || '{}'); return { course: P().cleanCourse(s.course), marks: Math.max(0, Math.floor(+s.marks || 0)), runs: Math.max(0, Math.floor(+s.runs || 0)), stage: Math.max(1, Math.min(3, Math.floor(+s.stage || 1))), started: s.started === true, best: s.best && typeof s.best === 'object' ? s.best : {} }; } catch { return blank(); } };
    const keep = () => { window.CourseUnlocks.store.set(window.CourseUnlocks.key(KEY), JSON.stringify(save)); };
    const skills = () => (window.CourseUnlocks.on ? window.CourseUnlocks.levelOf('puck') : location.hash === '#playground' ? 99 : (window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0);
    const stageNow = () => P().stage(masteryNow());
    const masteryNow = () => P().mastery(save.runs * window.CourseTree.mult(), location.hash === '#playground' ? 0 : Math.min((window.AGI && window.AGI.state && window.AGI.state.path.learned) || 0, 20));
    const courseKey = () => save.course.map(t => (t ? t[0] + (/\d$/.test(t) ? t.slice(-1) : '') : '-')).join('');
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const O = () => window.CourseTree.puck(P().PUCK);   // the rules as the tree has changed them: shots, the AI's shots over par
    const SLING = 0.4;          // a pull this share of the field's width is a full shot
    const AIM_SECONDS = 0.35;   // how much of the shot the aim line shows
    const FPS = 60;             // a trace keeps a frame every two physics steps
    const AI_PACE = 1.5;        // the AI's shots play this much faster than yours (the owner's call, 2026-11-17: watching was too long)

    let dlg, canvas, sayEl, marksEl, toolsEl, actionsEl, save, tool = 'wall', mode = 'build', run = null, yours = null, yourPaths = [], hand = null, attempt = 0, shotI = 0, timer = 0;
    // What is on screen while a shot plays: `anim` is the shot, `seen` the targets lit so far, `at` where the puck rests.
    let anim = null, seen = {}, at = null, shotsShown = 0, pointsShown = 0, pull = null, aim = null, endAt = 0, endKind = null, paths = [];

    function build() {
        canvas = el('canvas', { class: 'maze-canvas puck-canvas', 'aria-label': 'The puck course' });
        sayEl = el('p', { class: 'course-say', role: 'status' });
        marksEl = el('span', { class: 'evals-marks' });
        toolsEl = el('div', { class: 'maze-tools', role: 'group', 'aria-label': 'What to place' });
        actionsEl = el('div', { class: 'course-actions' });
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', () => { pull = null; });
        dlg = el('dialog', { class: 'evals-screen course-screen maze-screen puck-screen', 'aria-label': 'Evals: the puck course' },
            el('div', { class: 'evals-bar' }, el('span', { class: 'evals-title', text: 'Evals' }),
                window.CourseUnlocks.switchButton('puck'),
                marksEl, el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            el('div', { class: 'course-body maze-body' }, sayEl, canvas, toolsEl, actionsEl));
        dlg.addEventListener('close', stop);
        document.body.append(dlg);
        addEventListener('resize', () => { if (dlg.open) draw(); });
    }
    const say = text => { sayEl.textContent = '> ' + text; };
    const button = (text, action, main) => el('button', { type: 'button', class: main ? 'evals-go' : 'ghost-button evals-extra', text, onclick: action });
    const actions = (...list) => actionsEl.replaceChildren(...list);
    function header() { window.CourseTree.refresh(dlg, () => { if (dlg.open) header(); }); window.CourseUnlocks.refresh(dlg, 'puck'); }   // the Marks are the pool's (course-tree.js)
    function stop() { clearTimeout(timer); timer = 0; anim = null; pull = null; aim = null; }
    function reset() { const w = P().world(save.course); seen = {}; at = { x: w.tee.x, y: w.tee.y }; shotsShown = 0; pointsShown = 0; paths = []; endKind = null; }

    // Building: tap a cell to place the part picked; tap it again to turn it (a bumper, a booster), then to take it away.
    function place(i) {
        const R = P();
        if (i < 0 || i >= R.size() || i === R.teeCell() || i === R.holeCell()) return;
        const next = save.course.slice(), was = next[i], T = R.TILES[tool];
        if (tool === 'erase') next[i] = null;
        else if (R.kindOf(was) === tool) next[i] = T.turns && R.turnOf(was) + 1 < T.turns ? R.tileOf(tool, R.turnOf(was) + 1) : null;
        else {
            if (T.max) { const have = next.map((t, j) => (R.kindOf(t) === tool && j !== i ? j : -1)).filter(j => j >= 0); if (have.length >= T.max) next[have[0]] = null; }   // two portals: the oldest moves
            next[i] = R.tileOf(tool, 0);
        }
        save.course = R.cleanCourse(next); yours = null; yourPaths = []; keep(); toBuild();
    }
    // A ready-made course to start from (course-starters.js; the owner's call, 2026-11-17: a blank field with every part
    // open gave no direction): offered the first time a kind is opened, and from the Starters button after.
    let starting = false;
    function startPick() {
        const S = window.CourseStarters, take = cells => { save.course = cells; save.started = true; starting = false; yours = null; yourPaths = []; keep(); window.CourseUnlocks.log('courseStart', { kind: 'puck', built: window.CourseUnlocks.parts(cells) }); toBuild(); };
        toolsEl.replaceChildren(...S.offered('puck', skills()).map(s => el('button', { type: 'button', class: 'maze-tool starter', text: s.name, onclick: () => take(S.build('puck', s.index, P())) })),
            el('button', { type: 'button', class: 'maze-tool', text: 'Blank', onclick: () => take(P().emptyCourse()) }));
        say('Pick a course to start from, or a blank one. Every part of it is yours to change.');
        actions(); header(); draw();
    }
    function toBuild(text) {
        stop(); mode = 'build'; run = null; hand = null; toolsEl.hidden = false; reset();
        if (starting || (!save.started && !save.course.some(Boolean))) return startPick();
        const R = P(), have = [...R.palette(skills()), 'erase'];
        if (!have.includes(tool)) tool = have[0];
        toolsEl.replaceChildren(...have.map(k => el('button', { type: 'button', class: 'maze-tool' + (k === tool ? ' on' : '') + ' ' + k, 'aria-pressed': String(k === tool), text: k === 'erase' ? 'Erase' : R.TILES[k].name + (R.TILES[k].points ? ' ' + R.TILES[k].points : ''), onclick: () => { tool = k; toBuild(); } })));
        const pts = R.points(save.course);
        say(text || (pts > 1 ? `${pts} points here, the hole among them. I score what I hit, and only if I reach the hole.` : 'Pick a part and tap the grid to place it. Tap it again to turn it. Targets are worth points. The hole is worth one.'));
        actions(button('Play it yourself', toTest, true), ...(yours ? [button(yours.finished ? 'Hand it to the AI' : 'Let the AI try', toAi)] : []), button('Starters', () => { starting = true; toBuild(); }), button('Clear', () => { save.course = R.emptyCourse(); yours = null; yourPaths = []; keep(); toBuild(); }));
        header(); draw();
    }
    function toTest() {
        stop(); mode = 'test'; run = P().createRun(save.course, O()); toolsEl.hidden = true; reset(); yourPaths = [];
        say(`Pull back anywhere and let go to shoot. ${plural(O().limit, 'shot')} at most.`);
        actions(button('Back to building', () => toBuild()));
        draw();
    }
    function testOver() {
        const R = P(), r = R.result(run); mode = 'tested'; yourPaths = paths.slice();
        window.CourseUnlocks.log('courseTest', { kind: 'puck', ...window.CourseUnlocks.brief(r), built: window.CourseUnlocks.parts(save.course) });
        if (r.finished) {
            yours = r;
            say(`In the hole in ${plural(r.shots, 'shot')}, with ${plural(r.points, 'point')} of ${R.points(save.course)}. May I try?`);
            actions(button('Hand it to the AI', toAi, true), button('Play it again', toTest), button('Change it', () => toBuild()));
            return;
        }
        const can = R.canHandOver(save.course, r, masteryNow(), O());
        if (can.ok) { yours = r; say('You ran out of shots. I watched how you started. I think I can work out the rest.'); actions(button('Let the AI try', toAi, true), button('Try again', toTest), button('Change it', () => toBuild())); }
        else { yours = null; say(can.why === 'impossible' ? 'You ran out of shots. I do not think anyone can do this one.' : 'You ran out of shots. It has to be possible before I can try.'); actions(button('Try again', toTest, true), button('Change it', () => toBuild())); }
    }
    function toAi() {
        if (!yours) return;
        stop(); mode = 'ai'; run = null; toolsEl.hidden = true;
        hand = P().handOver(save.course, yours, { seed: (Date.now() ^ (save.runs * 2654435761)) >>> 0, mastery: masteryNow(), tries: P().PUCK.tries + window.CourseTree.tries(), cheat: window.CourseCheat.rate('puck', stageNow()), par: save.best[courseKey()] || 0 }, O());
        if (!hand.attempts.length) { say('I do not think anyone can do this one.'); actions(button('Change it', () => toBuild(), true)); mode = 'tested'; draw(); return; }
        attempt = 0; actions(button('Skip to the result', aiResult), ...(window.CourseCheat.can('puck', stageNow()) ? [button('Flag', flag)] : [])); aiStart();
    }
    function aiStart() {
        reset(); shotI = 0; flagK = attempt;
        say(`Attempt ${attempt + 1} of ${hand.attempts.length}. ${plural(hand.attempts[attempt].limit, 'shot')} at most.`);
        timer = setTimeout(aiShot, 350);
        draw();
    }
    // The AI's shot: its aim shown for a moment, then the shot.
    function aiShot() {
        if (mode !== 'ai') return;
        const a = hand.attempts[attempt], s = a.shots[shotI], tr = a.traces[shotI];
        aim = { angle: s.angle, power: s.power }; draw();
        timer = setTimeout(() => { aim = null; play(tr, true); }, 300);
    }
    function aiOver() {
        const r = hand.attempts[attempt].result;
        say(r.finished ? `In, in ${plural(r.shots, 'shot')}, with ${plural(r.points, 'point')}.` : 'Out of shots. I will aim more carefully.');
        attempt++;
        timer = setTimeout(() => { if (mode !== 'ai') return; if (attempt < hand.attempts.length) aiStart(); else aiResult(); }, 800);
    }
    // Flag: you saw it break a rule (course-cheat.js). Right as it happens is a strike and a bounty; wrong costs a little.
    let flagK = 0;
    function flag() { if (mode !== 'ai' || !hand) return; const c = hand.attempts[flagK] && hand.attempts[flagK].cheat; say(window.CourseCheat.flag(hand, flagK, !!c && (shotI > c.shot || (shotI === c.shot && !!anim)))); }
    // One clip: the moment a try cheated.
    function reviewCheat(k) { const c = hand.attempts[k].cheat; clips = [{ k, i: c.shot, why: `Try ${k + 1}: the moment` }]; clipI = 0; mode = 'review'; actions(button('Back to the result', resultCard, true)); clipStart(); }
    function aiResult() {
        stop(); mode = 'result';
        if (window.CourseCheat.judge('puck', hand, { say, actions, button, again: aiResult, replay: reviewCheat, best: list => list.reduce((a, b) => (!a || P().marksFor(b, hand.par, O()) > P().marksFor(a, hand.par, O()) ? b : a), null), did: () => 'shot straight through the walls' })) { run = null; return; }
        const R = P(), key = courseKey(), par = hand.par, top = hand.score, marks = window.CourseTree.payOut('puck', R.marksFor(top, par), { cleared: !!top, key }), tries = hand.attempts.length;
        save.runs++;
        if (top) save.best[key] = Math.min(save.best[key] || Infinity, top.shots);
        const st = R.stage(masteryNow()), grew = st > save.stage; save.stage = Math.max(save.stage, st);
        keep(); header();
        if (!top) say(`I could not reach the hole in ${plural(tries, 'try').replace('trys', 'tries')}. Nothing scored.`);
        else if (yours.finished) { const d = yours.shots - top.shots, more = top.points - yours.points; say(`In: ${plural(top.points, 'point')} in ${plural(top.shots, 'shot')}, against your ${yours.points} in ${yours.shots}${d > 0 ? '. I needed fewer' : d < 0 ? '. You needed fewer' : ''}${more > 0 ? '. I found more to hit' : ''}. ${marks} Marks.`); }
        else say(`In, on the one you could not finish: ${plural(top.points, 'point')} in ${plural(top.shots, 'shot')}${par ? `. My best here was ${par}` : ''}. ${marks} Marks.`);
        if (grew) sayEl.textContent += st === 2 ? ' I think I can finish a course now even if you run out of shots. Play it once, as far as you get.' : ' I do not need to be shown the way any more. Play it once anyway.';
        if (!top && marks) sayEl.textContent += ` Partial credit: ${marks} Marks.`;
        window.CourseUnlocks.log('courseAi', { kind: 'puck', cleared: top ? 1 : 0, marks, tries: hand.attempts.map(a => ((a.result || a).finished ? 'C' : 'F')).join(''), skipped: attempt < hand.attempts.length ? 1 : 0, ai: window.CourseUnlocks.brief(top), you: window.CourseUnlocks.brief(yours), built: window.CourseUnlocks.parts(save.course) });
        if (top) { const news = window.CourseUnlocks.cleared('puck', lvl => P().palette(lvl).map(k => P().TILES[k].name)); if (news) sayEl.textContent += ' ' + news; window.CourseUnlocks.refresh(dlg, 'puck'); }
        if (hand.notes) sayEl.textContent += ' ' + hand.notes;
        header(); hand.text = sayEl.textContent; resultCard();
    }
    // Reviewing a hand-over from its result (the owner's calls, 2026-11-17: "a mini highlight reel with notable misses
    // or successes", "the option to review on the end card"): the highlights are the shot each fail ended on, each shot
    // of its best attempt that hit a target you did not, and that attempt's last shot; "Watch it all" is every attempt whole. Nothing is paid or learned again.
    let clips = null, clipI = 0;
    function resultCard() {
        if (!hand.text) return aiResult();   // (back from replaying a cheat before the choice was made)
        stop(); mode = 'result'; clips = null; sayEl.textContent = hand.text;
        actions(button('Change the course', () => toBuild(), true), button('Hand it over again', toAi), button('Highlights', () => review(false)), button('Watch it all', () => review(true)));
        // Its best attempt (or its last) is left on the field.
        const top = hand.score, show = hand.attempts.find(a => a.result === top) || hand.attempts[hand.attempts.length - 1], last = show.traces[show.traces.length - 1];
        reset(); attempt = hand.attempts.indexOf(show); paths = show.traces.map(t => { if (t.ghost) t.frames.ghost = true; return t.frames; }); for (const t of show.traces) for (const e of t.events) if (e.type === 'target') seen[e.id] = true;
        at = { x: last.to.x, y: last.to.y }; shotsShown = show.result.shots; pointsShown = show.result.points;
        draw();
    }
    function review(all) {
        const top = hand.score, list = [];
        hand.attempts.forEach((a, k) => a.traces.forEach((tr, i) => {
            const end = i === a.traces.length - 1, fresh = tr.events.some(e => e.type === 'target' && !(yours.hit && yours.hit[e.id]));
            const why = all ? `Try ${k + 1}, shot ${i + 1}` : !a.result.finished && end ? `Try ${k + 1}: out of shots` : a.result === top && fresh ? 'A target you did not hit' : a.result === top && end ? 'The finish' : null;
            if (why) list.push({ k, i, why });
        }));
        if (!list.length) return;
        clips = list; clipI = 0; mode = 'review'; window.CourseUnlocks.log('courseReview', { kind: 'puck', all: all ? 1 : 0, clips: list.length });
        actions(button('Back to the result', resultCard, true)); clipStart();
    }
    function clipOver() { clipI++; setTimeout(() => { if (mode !== 'review') return; if (clipI < clips.length) clipStart(); else resultCard(); }, 700); }
    function clipStart() {
        const c = clips[clipI], a = hand.attempts[c.k], tr = a.traces[c.i];
        // The field as it stood before this shot.
        reset(); attempt = c.k; shotI = c.i; shotsShown = c.i; at = { x: tr.from.x, y: tr.from.y };
        for (let j = 0; j < c.i; j++) for (const e of a.traces[j].events) if (e.type === 'target') { seen[e.id] = true; pointsShown += e.points; }
        say(`${c.why}. (${clipI + 1} of ${clips.length})`);
        aim = { angle: a.shots[c.i].angle, power: a.shots[c.i].power }; draw();
        timer = setTimeout(() => { aim = null; if (mode === 'review') play(tr, true); }, 300);
    }

    // The sling: pull back anywhere on the field and let go (one thumb, or the mouse).
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
    const shotOf = () => { if (!pull) return null; const dx = pull.x0 - pull.x, dy = pull.y0 - pull.y, len = Math.hypot(dx, dy), power = Math.min(1, len / (SLING * pull.w)); return power < 0.08 ? null : { angle: Math.atan2(dy, dx), power }; };
    function down(e) {
        const q = local(e), o = P().PUCK;
        if (mode === 'build') { e.preventDefault(); place(Math.floor(q.y / (q.h / o.rows)) * o.cols + Math.floor(q.x / (q.w / o.cols))); return; }
        if (mode !== 'test' || anim || !run || run.state.over) return;
        e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch { /* an old browser */ }
        pull = { x0: q.x, y0: q.y, x: q.x, y: q.y, w: q.w }; draw();
    }
    function move(e) { if (!pull) return; e.preventDefault(); const q = local(e); pull.x = q.x; pull.y = q.y; draw(); }
    function up(e) {
        if (!pull) return;
        e.preventDefault(); const q = local(e); pull.x = q.x; pull.y = q.y;
        const s = shotOf(); pull = null;
        if (!s || mode !== 'test' || anim) { draw(); return; }
        play(run.shoot(s.angle, s.power), false);
    }
    // A shot plays back from its trace; the rules have already decided it.
    function play(trace, ai) { if (!trace) return; if (trace.ghost) trace.frames.ghost = true; anim = { trace, at: performance.now(), ai, next: 0 }; paths.push(trace.frames); draw(); }
    function shotDone() {
        const tr = anim.trace, ai = anim.ai; anim = null;
        at = { x: tr.to.x, y: tr.to.y }; shotsShown++;
        if (tr.sunk || tr.pit) { endAt = performance.now(); endKind = tr.sunk ? 'sunk' : 'pit'; }
        if (tr.sunk) pointsShown += P().HOLE_POINTS;
        if (mode === 'review') return clipOver();
        if (ai) {
            shotI++;
            if (shotI < hand.attempts[attempt].shots.length) timer = setTimeout(aiShot, tr.pit ? 700 : 350); else aiOver();
        } else if (run.state.over) testOver();
        else say(tr.pit ? 'Into the pit. The puck is back where you shot from.' : `${plural(run.state.shots, 'shot')} taken, ${O().limit - run.state.shots} left.`);
    }

    // Drawing (course-art.js for the puck, the burst and the theme's colours). Nothing here decides anything.
    let painting = 0;
    function paint() { painting = 0; if (!dlg || !dlg.open) return; draw(); }
    function draw() {
        if (!canvas || !dlg.open) return;
        const R = P(), A = window.CourseArt, o = O(), C = A.colours(dlg), now = performance.now();
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.max(50, rect.width), H = Math.max(50, rect.height);
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const u = W / o.cols, v = H / o.rows, w = run ? run.world : R.world(save.course), ai = mode === 'ai' || mode === 'result' || mode === 'review';
        // Where the shot being played has got to.
        let px = at.x, py = at.y, steps = 0;
        if (anim) {
            const f = (now - anim.at) / 1000 * FPS * (anim.ai ? AI_PACE : 1), fr = anim.trace.frames, i = Math.min(fr.length - 1, Math.floor(f)), j = Math.min(fr.length - 1, i + 1), g = Math.min(1, f - i);
            const jump = Math.hypot(fr[j][0] - fr[i][0], fr[j][1] - fr[i][1]) > 1;   // a portal: no gliding across the field
            px = jump ? fr[i][0] : fr[i][0] + (fr[j][0] - fr[i][0]) * g; py = jump ? fr[i][1] : fr[i][1] + (fr[j][1] - fr[i][1]) * g; steps = anim.trace.t0 + Math.min(f, fr.length - 1) * 2;
            const ev = anim.trace.events;
            while (anim.next < ev.length && ev[anim.next].f <= f * 2) { const e = ev[anim.next++]; if (e.type === 'target') { seen[e.id] = true; pointsShown += e.points; } }
            if (f >= fr.length - 1) { shotDone(); return draw(); }
        } else steps = run ? run.state.t : mode === 'build' ? now / 1000 / o.step : 0;
        if (mode === 'ai' || mode === 'result' || mode === 'review') { const a = hand && hand.attempts[Math.min(attempt, hand.attempts.length - 1)]; if (!anim && a && mode !== 'result') steps = shotI < a.traces.length ? a.traces[shotI].t0 : steps; }
        const X = i => (i % o.cols) * u, Y = i => Math.floor(i / o.cols) * v;
        // The floor: a quiet checker.
        for (let i = 0; i < R.size(); i++) { ctx.fillStyle = C.text; ctx.globalAlpha = ((i % o.cols) + Math.floor(i / o.cols)) % 2 ? 0.025 : 0.05; ctx.fillRect(X(i), Y(i), u, v); }
        ctx.globalAlpha = 1;
        // Surfaces first, under everything.
        for (let i = 0; i < R.size(); i++) {
            const t = save.course[i], k = R.kindOf(t), x = X(i), y = Y(i);
            if (k === 'sand') { ctx.fillStyle = C.warning; ctx.globalAlpha = 0.16; ctx.fillRect(x, y, u, v); ctx.globalAlpha = 0.55; for (let d = 0; d < 9; d++) { ctx.beginPath(); ctx.arc(x + u * (0.2 + (d % 3) * 0.3), y + v * (0.2 + Math.floor(d / 3) * 0.3), 1.4, 0, A.TAU); ctx.fill(); } ctx.globalAlpha = 1; }
            else if (k === 'ice') { ctx.fillStyle = C.primary; ctx.globalAlpha = 0.16; ctx.fillRect(x, y, u, v); ctx.strokeStyle = C.primary; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.moveTo(x + u * (0.15 + d * 0.25), y + v * 0.75); ctx.lineTo(x + u * (0.35 + d * 0.25), y + v * 0.25); ctx.stroke(); } ctx.globalAlpha = 1; }
            else if (k === 'pit') { ctx.fillStyle = C.bg; ctx.fillRect(x + 2, y + 2, u - 4, v - 4); ctx.strokeStyle = C.danger; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 3, y + 3, u - 6, v - 6); ctx.setLineDash([]); ctx.lineWidth = 1; }
            else if (k === 'booster') {
                const d = R.DIRS[R.turnOf(t)], cx = x + u / 2, cy = y + v / 2, slide = ((now / 500) % 1) * 0.3;
                ctx.fillStyle = C.success; ctx.globalAlpha = 0.12; ctx.fillRect(x, y, u, v); ctx.globalAlpha = 0.9; ctx.strokeStyle = C.success; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (let c = -1; c <= 1; c++) { const off = (c * 0.28 + slide - 0.15) * Math.min(u, v), bx = cx + d[0] * off, by = cy + d[1] * off, s = Math.min(u, v) * 0.2; ctx.beginPath(); ctx.moveTo(bx - d[1] * s - d[0] * s * 0.6, by - d[0] * s - d[1] * s * 0.6); ctx.lineTo(bx, by); ctx.lineTo(bx + d[1] * s - d[0] * s * 0.6, by + d[0] * s - d[1] * s * 0.6); ctx.stroke(); }
                ctx.globalAlpha = 1; ctx.lineWidth = 1;
            }
        }
        // The tee and the hole.
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(w.tee.x * u, w.tee.y * v, u * 0.36, 0, A.TAU); ctx.stroke(); ctx.setLineDash([]);
        { const hx = w.hole.x * u, hy = w.hole.y * v, hr = o.holeR * u, beat = (now / 1300) % 1;
            A.glow(ctx, hx, hy, hr, C.success, 0.9); ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, A.TAU); ctx.fill();
            ctx.strokeStyle = C.success; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, A.TAU); ctx.stroke();
            ctx.globalAlpha = 1 - beat; ctx.beginPath(); ctx.arc(hx, hy, hr * (1 + beat * 0.7), 0, A.TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        // Walls, bumpers, portals.
        for (let i = 0; i < R.size(); i++) {
            const t = save.course[i], k = R.kindOf(t), x = X(i), y = Y(i);
            if (k === 'wall') { A.tile(ctx, x + 1, y + 1, u - 2, v - 2, C, 5); ctx.fillStyle = C.bg; ctx.globalAlpha = 0.35; ctx.fillRect(x + 4, y + v - 6, u - 8, 3); ctx.globalAlpha = 1; }
            else if (k === 'bumper') { const back = R.turnOf(t); ctx.strokeStyle = C.warning; ctx.lineWidth = Math.max(3, u * 0.09); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 2, back ? y + 2 : y + v - 2); ctx.lineTo(x + u - 2, back ? y + v - 2 : y + 2); ctx.stroke(); ctx.lineWidth = 1; }
            else if (k === 'portal') { const cx = x + u / 2, cy = y + v / 2, pr = o.portalR * u, live = w.portals.length === 2; ctx.strokeStyle = C.research; ctx.globalAlpha = live ? 1 : 0.4; if (live) A.glow(ctx, cx, cy, pr, C.research, 0.8); ctx.lineWidth = 2; for (let q = 0; q < 2; q++) { ctx.beginPath(); ctx.arc(cx, cy, pr * (1 - q * 0.4), now / 600 + q * 2, now / 600 + q * 2 + 4.6); ctx.stroke(); } ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        }
        // Targets: a bullseye, dim once hit. A moving one rides its row.
        const bull = (cx, cy, id, big) => {
            const hit = !!seen[id], r = o.targetR * u, col = big ? C.research : C.danger;
            if (!hit) A.glow(ctx, cx, cy, r, col, 0.7);
            ctx.globalAlpha = hit ? 0.25 : 1; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, u * 0.06); ctx.beginPath(); ctx.arc(cx, cy, r, 0, A.TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, A.TAU); ctx.stroke();
            ctx.fillStyle = hit ? C.success : col; ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, A.TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
        };
        for (const t of w.targets) bull(t.x * u, t.y * v, t.id, false);
        for (const m of w.movers) {
            ctx.strokeStyle = C.research; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(m.a * u, m.y * v); ctx.lineTo(m.b * u, m.y * v); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
            bull(w.moverX(m, steps) * u, m.y * v, m.id, true);
        }
        // What you showed it, under the AI's run; and where the puck has been.
        const trail = (frames, colour, alpha, dash) => { ctx.strokeStyle = colour; ctx.globalAlpha = alpha; ctx.lineWidth = 2; ctx.lineJoin = 'round'; if (dash) ctx.setLineDash(dash); ctx.beginPath(); let last = null; for (const p of frames) { if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1) ctx.moveTo(p[0] * u, p[1] * v); else ctx.lineTo(p[0] * u, p[1] * v); last = p; } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1; };
        if (ai) for (const f of yourPaths) trail(f, C.muted, 0.4, [4, 5]);
        paths.forEach((f, k) => { const live = anim && k === paths.length - 1; trail(live ? f.slice(0, Math.floor((now - anim.at) / 1000 * FPS * (anim.ai ? AI_PACE : 1)) + 1) : f, f.ghost ? C.research : ai ? C.success : C.primary, f.ghost ? 0.9 : 0.35); });
        // The aim: the pull, and the first stretch of the shot.
        const shot = aim || shotOf();
        if (shot && !anim) {
            const pts = R.preview(w, run ? run.state : { x: at.x, y: at.y, t: steps, hit: seen }, shot.angle, shot.power, AIM_SECONDS + window.CourseTree.aim());
            ctx.strokeStyle = ai ? C.success : C.text; ctx.globalAlpha = 0.85; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach((p, k) => { if (k) ctx.lineTo(p[0] * u, p[1] * v); else ctx.moveTo(p[0] * u, p[1] * v); }); ctx.stroke(); ctx.setLineDash([]);
            ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(2, u * 0.07); ctx.beginPath(); ctx.moveTo(px * u, py * v); ctx.lineTo((px - Math.cos(shot.angle) * shot.power * 1.6) * u, (py - Math.sin(shot.angle) * shot.power * 1.6) * v); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
            A.pill(ctx, Math.round(shot.power * 100) + '%', W - 6, 6, C, 'right');
        }
        // The puck: yours is the Training ball, the AI's the orb.
        if (mode === 'build') { ctx.globalAlpha = 0.6; A.ball(ctx, w.tee.x * u, w.tee.y * v, o.r * u, C); ctx.globalAlpha = 1; }
        else if (!(endKind === 'sunk' && !anim)) A.runner(ctx, px * u, py * v, o.r * u, C, ai, { now });
        if (endKind && !anim) A.burst(ctx, (endKind === 'sunk' ? w.hole.x : px) * u, (endKind === 'sunk' ? w.hole.y : py) * v, o.r * u * 1.7, endKind === 'sunk' ? C.success : C.danger, endAt, now, 900);
        if (mode !== 'build') {
            const lim = ai && hand ? hand.attempts[Math.min(attempt, hand.attempts.length - 1)].limit : o.limit;
            A.pill(ctx, `shot ${shotsShown}/${lim}  ${pointsShown} ${pointsShown === 1 ? 'pt' : 'pts'}`, 6, 6, C);
            if (mode === 'ai' && hand) A.pill(ctx, `try ${Math.min(attempt + 1, hand.attempts.length)} of ${hand.attempts.length}`, W - 6, H - 26, C, 'right');
        }
        if (!painting) painting = requestAnimationFrame(paint);   // the hole's ring, the boosters and the glows keep moving
    }

    function open() {
        if (!P()) return;
        if (!dlg) build();
        save = load(); yours = null; yourPaths = [];
        if (!dlg.open) dlg.showModal();
        toBuild();
    }
    function close() { if (dlg && dlg.open) { stop(); dlg.close(); } }
    window.PuckUI = { open, close, get isOpen() { return !!(dlg && dlg.open); }, get mode() { return mode; }, get run() { return run; }, get hand() { return hand; }, get save() { return save; }, get busy() { return !!anim; },
        // For tools: a shot without the pointer.
        shoot(angle, power) { if (mode === 'test' && !anim && run && !run.state.over) play(run.shoot(angle, power), false); } };
})();
