// evals-ui.js — Evals' screen (design/evals-plan.md): shows a run from evals.js, hands back answers and a trace of how
// you solved each one, and draws **the ghost hand**: the AI's own attempt at the captcha you're on, played beside you
// (a second cursor that taps squares and presses Verify at the times evals.js decided when the captcha showed).
// For now it is a full-screen dialog opened from the debug panel (AGI.debug.openEvals) or with #evals in the address;
// it becomes the server room's third bay later. It builds its own elements and knows no rules: what a captcha is,
// whether an answer is right, what the AI does and when it takes a kind over all live in evals.js. What the AI has
// learned is in the save (`AGI.state.evals`); a run is counted by engine.js `evalsRunEnd`.
(function () {
    'use strict';
    const RIGHT_MS = 900, WRONG_MS = 1700;
    let dlg = null, stage = null, livesEl = null, solvedEl = null;
    let run = null, picked = new Map(), shownAt = 0, timer = 0, locked = false, raf = 0;
    let fallback = null;   // what it has learned when there is no game to keep it in (a bare page)

    function el(tag, props = {}, ...kids) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v;
            else if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v);
        }
        n.append(...kids);
        return n;
    }
    const saved = () => window.AGI?.state?.evals || (fallback = fallback || { runs: 0, best: 0, learn: window.Evals.newLearn() });
    const lives = n => `${n} ${n === 1 ? 'life' : 'lives'}`;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const secs = t => `${t.toFixed(1)} s`;

    function build() {
        livesEl = el('span', { class: 'evals-lives' });
        solvedEl = el('span', { class: 'evals-solved' });
        stage = el('div', { class: 'evals-stage' });
        dlg = el('dialog', { class: 'evals-screen', 'aria-label': 'Evals' },
            el('div', { class: 'evals-bar' },
                el('span', { class: 'evals-title', text: 'Evals' }), livesEl, solvedEl,
                el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            stage);
        dlg.addEventListener('close', () => { clearTimeout(timer); cancelAnimationFrame(raf); settle(); run = null; });
        dlg.addEventListener('keydown', e => {
            if (e.key === 'Enter' && run && !run.over && !locked && !e.target.closest('.evals-cell, .evals-close, .evals-go')) { e.preventDefault(); verify(); }
        });
        document.body.append(dlg);
    }

    function hud() {
        const total = run ? run.opts.lives : window.Evals.EVALS.lives;
        const left = run ? Math.max(0, run.lives) : total;
        livesEl.textContent = '●'.repeat(left) + '○'.repeat(total - left);
        livesEl.setAttribute('aria-label', lives(left) + ' left');
        solvedEl.textContent = `Solved ${run ? run.solved : 0}`;
    }

    function card(title, lines, button, action) {
        cancelAnimationFrame(raf);
        stage.replaceChildren(el('div', { class: 'evals-card' },
            el('h2', { class: 'evals-card-title', text: title }),
            ...lines.map(text => el('p', { text })),
            el('button', { type: 'button', class: 'evals-go', text: button, onclick: action })));
        stage.querySelector('.evals-go').focus();
    }

    function startCard() {
        run = null;
        hud();
        const lines = ['Prove you are human. Each one is harder than the last.', 'It watches how you do it.', `You have ${lives(window.Evals.EVALS.lives)}.`];
        if (saved().best > 0) lines.push(`Your best run: ${saved().best} solved.`);
        card('Verification required', lines, 'Start', start);
    }

    // A run that has ended is counted once and saved, whichever way it ended (the last life, or the screen closed).
    function settle() {
        if (!run || !run.log.length || run.counted) return;
        if (window.AGIEngine?.evalsRunEnd && window.AGI?.state) window.AGIEngine.evalsRunEnd(window.AGI.state, run);
        else { run.counted = true; const s = saved(); s.runs++; s.best = Math.max(s.best, run.solved); }
        window.AGI?.save?.();
    }

    function endCard() {
        const was = saved().best, solved = run.solved;
        settle();
        hud();
        if (run.exhausted) {
            card('Verified automatically', ['It solves every kind you know before you can.', 'There is nothing left here for you to prove.'], 'Close', close);
            return;
        }
        card('Verification failed', [`You solved ${solved}.`, solved > was ? 'That is your best run.' : `Your best run: ${was} solved.`], 'Try again', start);
    }

    function start() {
        run = window.Evals.createRun({ seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0, learn: saved().learn });
        if (run.over) endCard(); else show();
    }

    let names = null;
    const nameOf = glyph => {
        if (!names) {
            names = new Map();
            for (const t of window.Evals.THINGS) names.set(t.glyph, `${t.a} ${t.name}`);
            for (const h of window.Evals.HATS) names.set(h.glyph, h.phrase);
        }
        return names.get(glyph);
    };

    // The captcha up, as a grid of squares to tap and a Verify button, with the AI's line and hand over it.
    function show() {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        locked = false;
        picked = new Map();
        hud();
        const c = run.current;
        const [before, after] = c.prompt.split(c.scene);
        const grid = el('div', { class: 'evals-grid', role: 'group', 'aria-label': c.prompt, style: `--side: ${c.side}` });
        c.cells.forEach((cell, i) => {
            const label = nameOf(cell.thing) + (cell.hat ? ' ' + nameOf(cell.hat) : '');
            const b = el('button', { type: 'button', class: 'evals-cell' + (cell.hat ? ' hatted' : ''), 'aria-pressed': 'false', 'aria-label': label, 'data-i': i },
                el('span', { class: 'evals-thing', 'aria-hidden': 'true', text: cell.thing }),
                cell.hat ? el('span', { class: 'evals-hat', 'aria-hidden': 'true', text: cell.hat }) : '',
                el('span', { class: 'evals-its-mark', 'aria-hidden': 'true' }),
                el('span', { class: 'evals-mark', 'aria-hidden': 'true' }));
            b.addEventListener('click', () => toggle(i, b));
            grid.append(b);
        });
        const hand = el('span', { class: 'evals-hand', 'aria-hidden': 'true' });
        hand.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17l4.6-4.2 3 6.4 2.7-1.3-3-6.3 6.2-.5z"/></svg>';
        stage.replaceChildren(el('div', { class: 'evals-captcha' },
            el('p', { class: 'evals-prompt' }, before, el('strong', { text: c.scene }), after),
            el('p', { class: 'evals-its' }, el('span', { class: 'evals-its-tag', text: 'AI' }), el('span', { class: 'evals-its-line', role: 'status', text: 'Working on it.' })),
            el('div', { class: 'evals-grid-wrap' }, grid, hand),
            el('div', { class: 'evals-foot' },
                el('span', { class: 'evals-status', role: 'status' }),
                el('button', { type: 'button', class: 'evals-go evals-verify', text: 'Verify', onclick: verify }))));
        shownAt = performance.now();
        ghostLoop();
    }

    // The ghost hand: from under the grid to each square it taps, at the times of its attempt, then to Verify. The less
    // it has learned, the more it wanders on the way. Its taps leave a small ring in the square's corner. With reduced
    // motion there is no hand: the rings and its line appear at the same times.
    function ghostLoop() {
        const g = run.ghost, wrap = stage.querySelector('.evals-grid-wrap'), hand = stage.querySelector('.evals-hand');
        const line = stage.querySelector('.evals-its-line'), verifyBtn = stage.querySelector('.evals-verify');
        const cells = [...stage.querySelectorAll('.evals-cell')];
        const still = reduced();
        if (still) hand.hidden = true;
        let done = false;
        const at = node => {
            const w = wrap.getBoundingClientRect(), r = node.getBoundingClientRect();
            return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
        };
        const frame = () => {
            if (!run || run.ghost !== g || locked) return;
            const t = (performance.now() - shownAt) / 1000;
            const w = wrap.getBoundingClientRect();
            // Where it is going: the start, each tap, then Verify.
            const stops = [{ t: 0, p: { x: w.width / 2, y: w.height + 14 } }, ...g.taps.map(tap => ({ t: tap.t, p: at(cells[tap.i]), i: tap.i })), { t: g.seconds, p: at(verifyBtn) }];
            let j = stops.findIndex(s => s.t > t);
            if (j < 0) j = stops.length;
            for (const s of stops) if (s.i !== undefined && s.t <= t) cells[s.i].classList.add('its');
            if (j >= stops.length) {
                if (!done) { done = true; line.textContent = g.correct ? `Done in ${secs(g.seconds)}.` : `Answered in ${secs(g.seconds)}.`; line.parentNode.classList.add('done'); }
                if (!still) place(hand, stops[stops.length - 1].p, 0, t);
                return;
            }
            if (!still) {
                const a = stops[Math.max(0, j - 1)], b = stops[j];
                // It rests on a square for the first part of each gap, then moves.
                const k = Math.max(0, Math.min(1, ((t - a.t) / Math.max(0.01, b.t - a.t) - 0.35) / 0.65));
                const e = k * k * (3 - 2 * k);
                place(hand, { x: a.p.x + (b.p.x - a.p.x) * e, y: a.p.y + (b.p.y - a.p.y) * e }, (1 - g.m) * Math.sin(Math.PI * e), t);
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    }
    function place(hand, p, wander, t) {
        const dx = wander * 22 * Math.sin(t * 5.1), dy = wander * 16 * Math.cos(t * 3.7);
        hand.style.transform = `translate(${(p.x + dx).toFixed(1)}px, ${(p.y + dy).toFixed(1)}px)`;
    }

    function toggle(i, b) {
        if (locked) return;
        if (picked.has(i)) picked.delete(i); else picked.set(i, (performance.now() - shownAt) / 1000);
        b.setAttribute('aria-pressed', picked.has(i) ? 'true' : 'false');
    }

    function verify() {
        if (!run || run.over || locked) return;
        locked = true;
        cancelAnimationFrame(raf);
        const seconds = (performance.now() - shownAt) / 1000;
        // How you solved it: the squares left picked, in the order you tapped them.
        const taps = [...picked].map(([i, t]) => ({ i, t })).sort((a, b) => a.t - b.t);
        const mine = taps.map(t => t.i);
        const r = run.submit(mine, seconds, { taps, seconds });
        const captcha = stage.querySelector('.evals-captcha');
        stage.querySelector('.evals-verify').disabled = true;
        // Show what was right, by mark and not by colour alone: ✓ on every right square, ✕ on a wrong tap. And all of
        // the AI's attempt, as far as it had got or not.
        for (const b of stage.querySelectorAll('.evals-cell')) {
            const i = +b.dataset.i, right = r.answer.includes(i);
            b.disabled = true;
            if (right) { b.classList.add('right'); b.querySelector('.evals-mark').textContent = '✓'; }
            else if (picked.has(i)) { b.classList.add('wrong'); b.querySelector('.evals-mark').textContent = '✕'; }
            b.classList.toggle('its', r.ghost.answer.includes(i));
        }
        captcha.classList.add(r.correct ? 'passed' : 'failed');
        stage.querySelector('.evals-status').textContent = r.correct ? `Verified in ${secs(seconds)}.` : r.over ? 'Not quite. No lives left.' : `Not quite. ${lives(r.lives)} left.`;
        const its = stage.querySelector('.evals-its');
        its.classList.add('done');
        its.classList.toggle('ahead', r.ahead);
        its.querySelector('.evals-its-line').textContent = !r.ghost.correct ? 'It got it wrong.'
            : r.ahead ? `It got it right first, in ${secs(r.ghost.seconds)}.`
            : `It got it right, in ${secs(r.ghost.seconds)}. You were first.`;
        const hand = stage.querySelector('.evals-hand');
        if (hand) hand.hidden = true;
        hud();
        const next = () => { if (!run) return; if (run.over) endCard(); else show(); };
        timer = setTimeout(() => {
            if (!run) return;
            if (r.takeover) {
                window.AGI?.save?.();
                card('It has learned this', [`It now solves ${window.Evals.KINDS[r.takeover].name} before you can.`, 'It does those from here on. You will not see them again.'], 'Continue', next);
            } else next();
        }, r.correct ? RIGHT_MS : WRONG_MS);
    }

    function open() {
        if (!window.Evals) return;
        if (!dlg) build();
        if (!dlg.open) dlg.showModal();
        startCard();
    }
    function close() { if (dlg && dlg.open) dlg.close(); }

    // For the review kit and tests in a browser: the run in play, and the screen's controls.
    window.EvalsUI = { open, close, start, get run() { return run; }, get isOpen() { return !!(dlg && dlg.open); } };
    // #evals opens straight into it, after the game's own opening has had its turn.
    if (location.hash === '#evals') window.addEventListener('load', () => setTimeout(open, 600));
})();
