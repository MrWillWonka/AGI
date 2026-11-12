// evals-ui.js — Evals' screen (design/evals-plan.md, stage 1): shows a run from evals.js and hands back answers.
// For now it is a full-screen dialog opened from the debug panel (AGI.debug.openEvals) or with #evals in the address;
// it becomes the server room's third bay later. It builds its own elements, keeps nothing in the save (the best run is
// per device in localStorage), and knows no rules: what a captcha is and whether an answer is right live in evals.js.
(function () {
    'use strict';
    const BEST_KEY = 'agiEvalsBest';
    const RIGHT_MS = 650, WRONG_MS = 1500;
    let dlg = null, stage = null, livesEl = null, solvedEl = null;
    let run = null, picked = new Set(), shownAt = 0, timer = 0, locked = false;

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
    const best = () => { try { return Math.max(0, Math.floor(+localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; } };
    const setBest = n => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* storage refused: the run still plays */ } };
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function build() {
        livesEl = el('span', { class: 'evals-lives' });
        solvedEl = el('span', { class: 'evals-solved' });
        stage = el('div', { class: 'evals-stage' });
        dlg = el('dialog', { class: 'evals-screen', 'aria-label': 'Evals' },
            el('div', { class: 'evals-bar' },
                el('span', { class: 'evals-title', text: 'Evals' }), livesEl, solvedEl,
                el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            stage);
        dlg.addEventListener('close', () => { clearTimeout(timer); run = null; });
        dlg.addEventListener('keydown', e => {
            if (e.key === 'Enter' && run && !run.over && !locked && !e.target.closest('.evals-cell, .evals-close')) { e.preventDefault(); verify(); }
        });
        document.body.append(dlg);
    }

    function hud() {
        const total = run ? run.opts.lives : window.Evals.EVALS.lives;
        const left = run ? Math.max(0, run.lives) : total;
        livesEl.textContent = '●'.repeat(left) + '○'.repeat(total - left);
        livesEl.setAttribute('aria-label', plural(left, 'life').replace('lifes', 'lives') + ' left');
        solvedEl.textContent = `Solved ${run ? run.solved : 0}`;
    }

    function card(title, lines, button, action) {
        stage.replaceChildren(el('div', { class: 'evals-card' },
            el('h2', { class: 'evals-card-title', text: title }),
            ...lines.map(text => el('p', { text })),
            el('button', { type: 'button', class: 'evals-go', text: button, onclick: action })));
        stage.querySelector('.evals-go').focus();
    }

    function startCard() {
        run = null;
        hud();
        const lines = ['Prove you are human. Each one is harder than the last.', `You have ${plural(window.Evals.EVALS.lives, 'life').replace('lifes', 'lives')}.`];
        if (best() > 0) lines.push(`Your best run: ${best()} solved.`);
        card('Verification required', lines, 'Start', start);
    }

    function endCard() {
        const solved = run.solved, was = best();
        if (solved > was) setBest(solved);
        const lines = [`You solved ${solved}.`, solved > was ? 'That is your best run.' : `Your best run: ${was} solved.`];
        hud();
        card('Verification failed', lines, 'Try again', start);
    }

    function start() {
        run = window.Evals.createRun({ seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 });
        show();
    }

    const NAMES = () => {
        const m = new Map();
        for (const t of window.Evals.THINGS) m.set(t.glyph, `${t.a} ${t.name}`);
        for (const h of window.Evals.HATS) m.set(h.glyph, h.phrase);
        return m;
    };
    let names = null;

    // The captcha up, as a grid of squares to tap and a Verify button.
    function show() {
        clearTimeout(timer);
        locked = false;
        picked = new Set();
        hud();
        const c = run.current;
        names = names || NAMES();
        const [before, after] = c.prompt.split(c.scene);
        const grid = el('div', { class: 'evals-grid', role: 'group', 'aria-label': c.prompt, style: `--side: ${c.side}` });
        c.cells.forEach((cell, i) => {
            const label = names.get(cell.thing) + (cell.hat ? ' ' + names.get(cell.hat) : '');
            const b = el('button', { type: 'button', class: 'evals-cell' + (cell.hat ? ' hatted' : ''), 'aria-pressed': 'false', 'aria-label': label, 'data-i': i },
                el('span', { class: 'evals-thing', 'aria-hidden': 'true', text: cell.thing }),
                cell.hat ? el('span', { class: 'evals-hat', 'aria-hidden': 'true', text: cell.hat }) : '',
                el('span', { class: 'evals-mark', 'aria-hidden': 'true' }));
            b.addEventListener('click', () => toggle(i, b));
            grid.append(b);
        });
        stage.replaceChildren(el('div', { class: 'evals-captcha' },
            el('p', { class: 'evals-prompt' }, before, el('strong', { text: c.scene }), after),
            grid,
            el('div', { class: 'evals-foot' },
                el('span', { class: 'evals-status', role: 'status' }),
                el('button', { type: 'button', class: 'evals-go evals-verify', text: 'Verify', onclick: verify }))));
        shownAt = performance.now();
    }

    function toggle(i, b) {
        if (locked) return;
        if (picked.has(i)) picked.delete(i); else picked.add(i);
        b.setAttribute('aria-pressed', picked.has(i) ? 'true' : 'false');
    }

    function verify() {
        if (!run || run.over || locked) return;
        locked = true;
        const mine = [...picked];
        const r = run.submit(mine, (performance.now() - shownAt) / 1000);
        const status = stage.querySelector('.evals-status');
        const captcha = stage.querySelector('.evals-captcha');
        stage.querySelector('.evals-verify').disabled = true;
        // Show what was right, by mark and not by colour alone: ✓ on every right square, ✕ on a wrong tap.
        for (const b of stage.querySelectorAll('.evals-cell')) {
            const i = +b.dataset.i, right = r.answer.includes(i);
            b.disabled = true;
            if (right) { b.classList.add('right'); b.querySelector('.evals-mark').textContent = '✓'; }
            else if (picked.has(i)) { b.classList.add('wrong'); b.querySelector('.evals-mark').textContent = '✕'; }
        }
        captcha.classList.add(r.correct ? 'passed' : 'failed');
        status.textContent = r.correct ? 'Verified.' : r.over ? 'Not quite. No lives left.' : `Not quite. ${plural(r.lives, 'life').replace('lifes', 'lives')} left.`;
        hud();
        timer = setTimeout(() => { if (!run) return; if (run.over) endCard(); else show(); }, r.correct ? RIGHT_MS : WRONG_MS);
    }

    function open() {
        if (!window.Evals) return;
        if (!dlg) build();
        if (!dlg.open) dlg.showModal();
        startCard();
    }
    function close() { if (dlg && dlg.open) dlg.close(); }

    // For the review kit and tests in a browser: the run in play, and the screen's controls.
    window.EvalsUI = { open, close, start, get run() { return run; } };
    // #evals opens straight into it, after the game's own opening has had its turn.
    if (location.hash === '#evals') window.addEventListener('load', () => setTimeout(open, 600));
})();
