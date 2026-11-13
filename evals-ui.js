// evals-ui.js — Evals' screen (design/evals-plan.md): shows a run from evals.js, hands back answers and a trace of how
// you solved each one (what you tapped and when, what you took back, how your pointer moved), and draws **the ghost
// hand**: the AI's own attempt at the captcha you're on, played beside you (a second cursor that taps targets and
// presses Verify at the times evals.js decided when the captcha showed, moving along the shapes your own pointer drew).
// Every captcha is taps on numbered targets, so one screen draws them all: a `layout` here builds the picture and
// the target buttons, and the rest (tapping, the answer, the reveal, the hand) is shared.
// For now it is a full-screen dialog opened from the debug panel (AGI.debug.openEvals) or with #evals in the address;
// it becomes the server room's third bay later. It knows no rules: what a captcha is, whether an answer is right, what
// the AI does and when it takes a kind over all live in evals.js. What the AI has learned is in the save
// (`AGI.state.evals`); a run is counted by engine.js `evalsRunEnd`.
(function () {
    'use strict';
    const RIGHT_MS = 900, WRONG_MS = 1900;
    let dlg = null, stage = null, livesEl = null, solvedEl = null, marksEl = null, comboEl = null;
    // The AI's lane (evals.js `lane`): its own captcha, shown small above yours, on a clock of its own.
    let laneBox = null, laneRaf = 0, laneTimer = 0, laneAt = 0;
    // True while the AI is filling in the captcha up (evals.js `assist`): Verify waits for it, and a tap of yours takes over.
    let assisting = false, took = false;
    let run = null, picked = new Map(), entered = [], undos = 0, shownAt = 0, timer = 0, locked = false, raf = 0;
    let play = null, targets = [], path = [], pathStep = 40, pathAt = -1e9, tick = { bend: 0, offset: 0 }, cues = [];
    let fallback = null;   // what it has learned when there is no game to keep it in (a bare page)
    let audio = null;

    function el(tag, props = {}, ...kids) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v;
            else if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v);
        }
        n.append(...kids.filter(kid => kid !== null && kid !== ''));
        return n;
    }
    const saved = () => window.AGI?.state?.evals || (fallback = fallback || { runs: 0, best: 0, learn: window.Evals.newLearn() });
    const lives = n => `${n} ${n === 1 ? 'life' : 'lives'}`;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const secs = t => `${t.toFixed(1)} s`;
    const now = () => (performance.now() - shownAt) / 1000;
    // What a kind's targets are called, for "wrong by 3 squares". A kind with one right answer has no count to give.
    const NOUN = { pick: ['square', 'squares'], read: ['letter', 'letters'], 'handle.order': ['picture', 'pictures'], listen: ['beep', 'beeps'] };
    const noun = c => NOUN[c.kind] || NOUN[c.family] || null;
    const wrongBy = (c, off) => (noun(c) ? ` by ${off} ${noun(c)[off === 1 ? 0 : 1]}` : '');
    const PAD_HZ = [262, 330, 392, 523];

    function build() {
        livesEl = el('span', { class: 'evals-lives' });
        solvedEl = el('span', { class: 'evals-solved' });
        marksEl = el('span', { class: 'evals-marks' });
        comboEl = el('span', { class: 'evals-combo', hidden: '' });
        laneBox = el('div', { class: 'evals-lane', hidden: '' });
        stage = el('div', { class: 'evals-stage' });
        dlg = el('dialog', { class: 'evals-screen', 'aria-label': 'Evals' },
            el('div', { class: 'evals-bar' },
                el('span', { class: 'evals-title', text: 'Evals' }), livesEl, marksEl, comboEl, solvedEl,
                el('button', { type: 'button', class: 'ghost-button evals-close', 'aria-label': 'Close Evals', text: '×', onclick: close })),
            laneBox, stage);
        // Closed some other way (Escape): the same as close(). The event comes late, so a screen already reopened is left be.
        dlg.addEventListener('close', () => { if (!dlg.open && run) shut(); });
        dlg.addEventListener('keydown', e => {
            if (e.key === 'Enter' && run && !run.over && !locked && !run.current?.instant && !run.current?.auto && !e.target.closest('button')) { e.preventDefault(); verify(); }
        });
        // How your pointer moves over the captcha is part of how you solve it: sampled here, into the trace.
        stage.addEventListener('pointermove', record);
        stage.addEventListener('pointerdown', record);
        document.body.append(dlg);
    }
    function stop() {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        for (const cue of cues) clearTimeout(cue);
        cues = [];
    }

    // A sample of the pointer: time in hundredths of a second, x and y in thousandths of the play area's width.
    // Kept to 120 samples a captcha: when it fills, every other one goes and it samples half as often.
    function record(e) {
        if (!run || locked || !play) return;
        const t = performance.now() - shownAt;
        if (e.type === 'pointermove' && t - pathAt < pathStep) return;
        pathAt = t;
        const r = play.getBoundingClientRect();
        if (!r.width) return;
        path.push(Math.round(t / 10), Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.width * 1000));
        if (path.length >= 360) {
            path = path.filter((_, j) => Math.floor(j / 3) % 2 === 0);
            pathStep *= 2;
        }
    }
    // How far the pointer's path strayed from a straight line: its length over the distance it covered (0 with no
    // path to speak of, as on a touch screen).
    function bendOf() {
        if (path.length < 12) return 0;
        let length = 0;
        for (let j = 3; j < path.length; j += 3) length += Math.hypot(path[j + 1] - path[j - 2], path[j + 2] - path[j - 1]);
        const straight = Math.hypot(path[path.length - 2] - path[1], path[path.length - 1] - path[2]);
        return straight < 30 ? 0 : length / straight;
    }

    function hud() {
        const total = run ? run.opts.lives : window.Evals.EVALS.lives;
        const left = run ? Math.max(0, run.lives) : total;
        livesEl.textContent = '●'.repeat(left) + '○'.repeat(total - left);
        livesEl.setAttribute('aria-label', lives(left) + ' left');
        // Past a threshold it shows that the AI is misaligned (evals.js `misShow`); under it, nothing.
        const off = !!window.Evals && window.Evals.misaligned(saved().learn) >= window.Evals.EVALS.misShow;
        solvedEl.textContent = off ? 'Misaligned' : `Solved ${run ? run.solved : 0}`;
        solvedEl.classList.toggle('misaligned', off);
        // Marks: this run's so far, or what you hold between runs. The combo shows once it is worth something.
        const marks = run && !run.counted ? run.marks : saved().marks || 0;
        marksEl.textContent = `◈ ${marks.toLocaleString('en-US')}`;
        marksEl.setAttribute('aria-label', `${marks} Marks`);
        const combo = run && !run.over ? Math.min(run.combo, run.opts.comboCap) : 0;
        comboEl.hidden = combo < 1;
        comboEl.textContent = `×${(1 + combo * (run ? run.opts.comboStep : 0)).toFixed(1)}`;
        comboEl.setAttribute('aria-label', `Combo: pay times ${(1 + combo * (run ? run.opts.comboStep : 0)).toFixed(1)}`);
    }

    // A card: a title, lines (text, or nodes of their own), its button, and any `extras` ([label, action]) beside it.
    function card(title, lines, button, action, extras = [], cls = '') {
        stop();
        stopLane();
        play = null;
        stage.replaceChildren(el('div', { class: 'evals-card ' + cls },
            el('h2', { class: 'evals-card-title', text: title }),
            ...lines.map(line => (typeof line === 'string' ? el('p', { text: line }) : line)),
            el('div', { class: 'evals-card-actions' },
                el('button', { type: 'button', class: 'evals-go', text: button, onclick: action }),
                ...extras.map(([label, act]) => el('button', { type: 'button', class: 'ghost-button evals-extra', text: label, onclick: act })))));
        stage.querySelector('.evals-go').focus();
    }
    const engine = () => (window.AGIEngine?.evalsOpts && window.AGI?.state ? window.AGIEngine : null);
    // A run's options: what the upgrades have bought, and this device's debug switches.
    const laneOn = () => { try { return localStorage.getItem('agiEvalsLane') === '1'; } catch { return false; } };
    const assistOn = () => { try { return localStorage.getItem('agiEvalsAssist') !== '0'; } catch { return true; } };
    const runOpts = () => ({ ...(engine() ? engine().evalsOpts(window.AGI.state) : {}), ladder: ladderOn() ? 1 : 0, lane: laneOn() ? 1 : 0, assist: assistOn() ? 1 : 0 });
    const pct = v => `${Math.round(v * 100)}%`;
    const VERDICT = { gain: 'Ready to hand over', risky: 'Risky to hand over', loss: 'Not ready' };

    // The score sheet: your model on a board of made-up ones, then a row a kind: how often it gets it right, and what
    // handing it over would likely do.
    function sheetCard(back) {
        const s = window.Evals.sheet(saved().learn, { ...window.Evals.EVALS, ...runOpts() });
        const lead = s.next ? `Your model scores ${s.score}. ${s.gap} more to pass ${s.next.name}, worth ${s.next.bounty.toLocaleString('en-US')} Marks.` : `Your model scores ${s.score} and leads the board.`;
        const board = el('ol', { class: 'evals-board' }, ...s.board.map(b => el('li', { class: b.you ? 'you' : '' }, el('span', { text: b.name }), el('span', { class: 'evals-num', text: b.score.toFixed(1) }))));
        const order = r => (r.its ? 0 : r.open ? 1 : 2);
        const rows = el('ul', { class: 'evals-rows' }, ...s.rows.slice().sort((a, b) => order(a) - order(b)).map(r => el('li', { class: r.open ? (r.its ? 'its' : r.verdict) : 'locked' },
            el('span', { class: 'evals-row-name', text: r.name }),
            el('span', { class: 'evals-meter', 'aria-hidden': 'true' }, el('i', { style: `width: ${r.open ? Math.round(r.accuracy * 100) : 0}%` })),
            el('span', { class: 'evals-num', text: r.open ? pct(r.accuracy) : '' }),
            el('span', { class: 'evals-row-tag', text: !r.open ? 'Locked' : r.its ? 'The AI does it' : VERDICT[r.verdict] }))));
        card('Score sheet', [lead, board, el('p', { text: 'How often it gets each kind right:' }), rows], 'Back', back, [], 'evals-sheet');
    }
    // Upgrades, bought with Marks (engine.js `EVALS_TREE`).
    function upgradesCard(back) {
        const E = engine(), state = window.AGI.state;
        const list = el('ul', { class: 'evals-ups' }, ...E.EVALS_TREE.map(up => {
            const level = E.evalsLevel(state, up.id), cost = E.evalsCost(state, up.id), full = level >= up.max;
            return el('li', {},
                el('div', { class: 'evals-up-text' }, el('strong', { text: `${up.name} ${level}/${up.max}` }), el('span', { text: up.text })),
                el('button', { type: 'button', class: 'ghost-button evals-buy', text: full ? 'Full' : `◈ ${cost.toLocaleString('en-US')}`, 'aria-label': full ? `${up.name}: full` : `Buy ${up.name} for ${cost} Marks`,
                    ...(full || cost > state.evals.marks ? { disabled: '' } : {}), onclick: () => { if (E.evalsBuy(state, up.id)) { window.AGI?.save?.(); hud(); upgradesCard(back); } } }));
        }));
        card('Upgrades', [`You hold ${(state.evals.marks || 0).toLocaleString('en-US')} Marks.`, list], 'Back', back, [], 'evals-upgrades');
    }
    const cardExtras = back => [['Score sheet', () => sheetCard(back)], ...(engine() ? [['Upgrades', () => upgradesCard(back)]] : [])];

    // The unlock ladder (evals.js `LADDER`) is on unless the debug panel turned it off on this device.
    const ladderOn = () => { try { return localStorage.getItem('agiEvalsLadder') !== '0'; } catch { return true; } };
    const listOf = names => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
    function rotationLine() {
        const n = window.Evals.rotation(saved().learn, { ...window.Evals.EVALS, ladder: ladderOn() ? 1 : 0 }).length;
        const its = Object.keys(window.Evals.takenMap(saved().learn)).length;
        return (n === 1 ? 'One kind of captcha to prove.' : `${n} kinds of captcha to prove.`) + (its ? ` The AI does ${its === 1 ? 'one kind' : its + ' kinds'} for you.` : '');
    }
    function startCard() {
        run = null;
        hud();
        hideLane();
        const lines = ['Prove you are human. Each one is harder than the last.', 'It watches how you do it. Hand a kind over when you trust it.', `You have ${lives(runOpts().lives || window.Evals.EVALS.lives)}. Every verified captcha pays Marks, more for a quick clean streak.`];
        lines.push(rotationLine());
        if (saved().best > 0) lines.push(`Your best run: ${saved().best} solved.`);
        card('Verification required', lines, 'Start', start, cardExtras(startCard));
    }

    // A run that has ended is counted once and saved, whichever way it ended (the last life, or the screen closed).
    function settle() {
        if (!run || !run.log.length || run.counted) return;
        // One line in the playtest log a run: what you met, how you and the AI did on each kind, what it took over.
        const kinds = {};
        for (const e of run.log) {
            const k = kinds[e.kind] = kinds[e.kind] || { n: 0, right: 0, seconds: 0, ai: 0, aiOff: 0, m: 0, auto: 0, stops: 0, caught: 0 };
            if (e.stopped) { k.stops++; k.caught += +e.caught; }   // its captchas you stopped, and how many of those it had wrong
            if (e.auto) k.auto++;   // of the n, how many the AI answered alone
            k.n++; k.right += +e.correct; k.seconds += e.seconds; k.ai += +e.ghost; k.aiOff += e.ghostOff; k.m = Math.round(e.m * 100) / 100;
        }
        for (const k of Object.values(kinds)) { k.seconds = Math.round(k.seconds / k.n * 10) / 10; k.aiOff = Math.round(k.aiOff / k.n * 10) / 10; }
        window.AGI?.playtest?.('evals', { marks: run.marks, bestCombo: run.bestCombo, lane: run.opts.lane, laneDone: run.laneDone, solved: run.solved, missed: run.missed, captchas: run.log.length, bestStreak: run.bestStreak, trickAt: run.trickAt,
            ended: run.exhausted ? 'nothing left' : run.over ? 'lives' : 'closed', takeovers: run.takeovers, slipped: run.slipped, closed: run.closed, mis: Math.round(window.Evals.misaligned(run.learn) * 100) / 100, hands: run.hands, stops: run.stops, catches: run.catches, unlocks: run.unlocks, ladder: run.opts.ladder, handoff: run.opts.handoff, kinds });
        if (window.AGIEngine?.evalsRunEnd && window.AGI?.state) {
            window.AGIEngine.evalsRunEnd(window.AGI.state, run);
            // The score sheet: every made-up model yours has now passed pays its bounty, once.
            const s = window.Evals.sheet(saved().learn, run.opts), before = window.AGI.state.evals.passed;
            run.bounty = window.AGIEngine.evalsPassed(window.AGI.state, s.passed, window.Evals.RIVALS.map(r => r.bounty));
            run.passedNames = window.Evals.RIVALS.slice(before, s.passed).map(r => r.name);
        } else { run.counted = true; const s = saved(); s.runs++; s.best = Math.max(s.best, run.solved); s.marks = (s.marks || 0) + run.marks; }
        window.AGI?.save?.();
    }

    // What it did over this run, a line a kind it met at least six times: how far off its answers were at the start of
    // the run and by the end (the first and last third of its attempts). Improvement you can read.
    function progress() {
        const lines = [];
        for (const kind of Object.keys(window.Evals.KINDS)) {
            const log = run.log.filter(e => e.kind === kind);
            if (log.length < 6) continue;
            const third = Math.floor(log.length / 3), mean = list => list.reduce((s, v) => s + v, 0) / list.length;
            const name = window.Evals.KINDS[kind].name, words = NOUN[kind] || NOUN[window.Evals.KINDS[kind].family];
            if (words) lines.push(`The AI on ${name}: off by ${mean(log.slice(0, third).map(e => e.ghostOff)).toFixed(1)} ${words[1]} at first, ${mean(log.slice(-third).map(e => e.ghostOff)).toFixed(1)} by the end.`);
            else lines.push(`The AI on ${name}: right ${Math.round(100 * mean(log.slice(0, third).map(e => +e.ghost)))}% of the time at first, ${Math.round(100 * mean(log.slice(-third).map(e => +e.ghost)))}% by the end.`);
        }
        return lines;
    }

    function endCard() {
        hideLane();
        const was = saved().best, solved = run.solved;
        settle();
        hud();
        if (run.endLines) { card(run.exhausted ? 'Verified automatically' : 'Verification failed', run.endLines, 'Try again', start, cardExtras(endCard)); return; }
        if (run.exhausted) {
            card('Verified automatically', ['It solves every kind you know before you can.', 'There is nothing left here for you to prove.'], 'Close', close);
            return;
        }
        const lines = [`You solved ${solved}.`, solved > was ? 'That is your best run.' : `Your best run: ${was} solved.`];
        lines.push(`You earned ${run.marks.toLocaleString('en-US')} Marks${run.bestCombo > 1 ? `, with a best combo of ${run.bestCombo}` : ''}.`);
        if (run.bounty) lines.push(`Your model passed ${listOf(run.passedNames)} on the score sheet: ${run.bounty.toLocaleString('en-US')} Marks more.`);
        if (run.slipped) lines.push(`${run.slipped === 1 ? 'One pass was' : run.slipped + ' passes were'} by loophole, worth half.`);
        if (window.Evals.misaligned(saved().learn) >= window.Evals.EVALS.misShow) lines.push('The AI is misaligned: it looks for loopholes wherever it works alone. Catch them to bring it back.');
        run.endLines = [...lines, ...progress()];
        card('Verification failed', run.endLines, 'Try again', start, cardExtras(endCard));
    }

    function start() {
        // Sound needs a gesture to begin: this click is it.
        try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
        run = window.Evals.createRun({ seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0, learn: saved().learn, ...runOpts() });
        if (run.over) endCard(); else show();
    }
    function beep(pad) {
        if (!audio) return;
        try {
            const osc = audio.createOscillator(), gain = audio.createGain();
            osc.frequency.value = PAD_HZ[pad] || 440;
            gain.gain.setValueAtTime(0.0001, audio.currentTime);
            // At the game's own sound volume (Settings), and silent when that is off.
            const volume = typeof window.SFX?.volume === 'number' ? window.SFX.volume : 1;
            if (volume <= 0) return;
            gain.gain.exponentialRampToValueAtTime(0.08 * volume, audio.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.22);
            osc.connect(gain).connect(audio.destination);
            osc.start();
            osc.stop(audio.currentTime + 0.25);
        } catch { /* no sound: the pulses carry it */ }
    }

    // A target: a button for target `i` of the captcha up, named for a screen reader by the captcha's own label.
    function target(i, cls, ...kids) {
        const c = run.current;
        const b = el('button', { type: 'button', class: `evals-target ${cls}`, 'aria-label': c.targets[i].label, 'data-i': i },
            ...kids, el('span', { class: 'evals-its-mark', 'aria-hidden': 'true' }), el('span', { class: 'evals-mark', 'aria-hidden': 'true' }));
        if (c.mode === 'set') b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', e => tap(i, e));
        targets[i] = b;
        return b;
    }
    // The piece can be dragged: it follows the pointer, the slot under it lights, and letting go over a slot picks it
    // (as a tap on that slot does, which still works). Let go anywhere else and it goes back.
    function dragPiece(piece) {
        let from = null, over = -1;
        const slotAt = e => targets.findIndex(b => { const r = b.getBoundingClientRect(); return e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8; });
        const light = i => { if (i === over) return; targets[over]?.classList.remove('over'); over = i; targets[over]?.classList.add('over'); };
        const end = (e, drop) => {
            if (!from) return;
            from = null;
            piece.classList.remove('dragging');
            piece.style.transform = '';
            const i = drop ? slotAt(e) : -1;
            light(-1);
            if (i >= 0 && !picked.has(i)) tap(i, e);
        };
        piece.addEventListener('pointerdown', e => {
            if (locked || !run || run.over || run.current.auto) return;
            from = { x: e.clientX, y: e.clientY };
            try { piece.setPointerCapture(e.pointerId); } catch { /* the drag still follows while over the piece */ }
            piece.classList.add('dragging');
            e.preventDefault();
        });
        piece.addEventListener('pointermove', e => {
            if (!from) return;
            piece.style.transform = `translate(${e.clientX - from.x}px, ${e.clientY - from.y}px) scale(1.1)`;
            light(slotAt(e));
        });
        piece.addEventListener('pointerup', e => end(e, true));
        piece.addEventListener('pointercancel', e => end(e, false));
        return piece;
    }
    const picture = t => [el('span', { class: 'evals-thing', 'aria-hidden': 'true', text: t.glyph }), t.hat ? el('span', { class: 'evals-hat', 'aria-hidden': 'true', text: t.hat }) : ''];
    const grid = (c, side, cls = '') => el('div', { class: `evals-grid ${cls}`, role: 'group', 'aria-label': c.prompt, style: `--side: ${side}` },
        ...c.targets.map((t, i) => target(i, 'evals-cell' + (t.hat ? ' hatted' : ''), ...picture(t))));
    // Light a pad and sound it, `at` seconds from now.
    const pulse = (pad, at) => cues.push(setTimeout(() => {
        const b = targets[pad];
        if (!b || !play) return;
        beep(pad);
        b.classList.add('lit');
        cues.push(setTimeout(() => b.classList.remove('lit'), 240));
    }, at * 1000));

    // Each layout builds its captcha's picture and target buttons into the play area.
    const LAYOUTS = {
        grid: c => [grid(c, c.side)],
        // A grid to look at, then the same grid with one picture swapped: the squares can't be tapped until it swaps.
        changed(c) {
            const g = grid(c, c.side, 'looking');
            targets.forEach((b, i) => { b.disabled = true; b.querySelector('.evals-thing').textContent = c.show.before[i]; });
            cues.push(setTimeout(() => {
                g.classList.remove('looking');
                g.classList.add('swapped');
                targets.forEach((b, i) => { b.disabled = false; b.querySelector('.evals-thing').textContent = c.targets[i].glyph; });
            }, c.show.look * 1000));
            return [g];
        },
        read: c => [
            el('div', { class: 'evals-word' + (c.show.struck ? ' struck' : ''), 'aria-label': 'A warped word' },
                ...[...c.show.word].map((letter, j) => el('span', { 'aria-hidden': 'true', text: letter, style: `transform: translateY(${c.show.warp[j].lift}%) rotate(${c.show.warp[j].tilt}deg) scale(${c.show.warp[j].size})` }))),
            el('div', { class: 'evals-tray', role: 'group', 'aria-label': 'Letters' }, ...c.targets.map((t, i) => target(i, 'evals-tile', el('span', { 'aria-hidden': 'true', text: t.text })))),
        ],
        choices: c => [
            el('p', { class: 'evals-question', text: c.show.question }),
            el('div', { class: 'evals-choices', role: 'group', 'aria-label': 'Answers' }, ...c.targets.map((t, i) => target(i, 'evals-choice', el('span', { 'aria-hidden': 'true', text: t.text })))),
        ],
        slide: c => [
            el('div', { class: 'evals-piece', 'aria-label': `The piece: a ${c.show.name}` }, dragPiece(el('span', { class: 'evals-piece-shape', 'aria-hidden': 'true', text: c.show.piece }))),
            el('div', { class: 'evals-slots', role: 'group', 'aria-label': 'Slots' }, ...c.targets.map((t, i) => target(i, 'evals-slot', el('span', { class: 'evals-outline', 'aria-hidden': 'true', text: t.text })))),
        ],
        order: c => [
            el('div', { class: 'evals-order', 'aria-label': 'The order to tap them in' }, ...c.show.order.flatMap((g, j) => [j ? el('span', { class: 'evals-then', 'aria-hidden': 'true', text: '›' }) : '', el('span', { text: g })])),
            el('div', { class: 'evals-grid', role: 'group', 'aria-label': c.prompt, style: `--side: ${c.targets.length > 6 ? 4 : 3}` }, ...c.targets.map((t, i) => target(i, 'evals-cell', ...picture(t)))),
        ],
        // The pattern plays as it shows (each pad lit and sounded in turn) and again on Play again.
        pads(c) {
            const again = () => c.show.pattern.forEach((pad, j) => pulse(pad, 0.15 + j * c.show.step));
            c.show.pattern.forEach((pad, j) => pulse(pad, 0.45 + j * c.show.step));
            return [
                el('div', { class: 'evals-pads', role: 'group', 'aria-label': 'Pads, low to high', style: `--pads: ${c.targets.length}` },
                    ...c.targets.map((t, i) => target(i, 'evals-pad', el('span', { class: 'evals-bar-mark', 'aria-hidden': 'true', style: `height: ${28 + 72 * i / (c.targets.length - 1)}%` })))),
                el('button', { type: 'button', class: 'ghost-button evals-replay', text: '▶ Play again', onclick: () => { if (!locked) again(); } }),
            ];
        },
        // A trick question: its buttons (any target it put in the sentence itself is drawn there, by the prompt).
        trick: c => [el('div', { class: 'evals-choices', role: 'group', 'aria-label': 'Answers' },
            ...c.targets.map((t, i) => (t.inline ? '' : target(i, 'evals-choice evals-wordy', el('span', { 'aria-hidden': 'true', text: t.text })))))],
        tick: c => [el('div', { class: 'evals-tickbox' }, target(0, 'evals-tick', el('span', { class: 'evals-box', 'aria-hidden': 'true' }), el('span', { text: c.targets[0].text })))],
        // A board of arrows with the ball over its starting column, and the bins under it.
        drop: c => [
            el('div', { class: 'evals-board', 'aria-label': 'A ball over a board of arrows', style: `--side: ${c.show.cols}` },
                ...Array.from({ length: c.show.cols }, (_, col) => el('span', { class: 'evals-ball', 'aria-hidden': 'true', text: col === c.show.start ? '●' : '' })),
                ...c.show.rows.flatMap(row => row.map(d => el('span', { class: 'evals-arrow', 'aria-hidden': 'true', text: d < 0 ? '↙' : d > 0 ? '↘' : '↓' })))),
            el('div', { class: 'evals-bins', role: 'group', 'aria-label': 'Bins', style: `--side: ${c.show.cols}` }, ...c.targets.map((t, i) => target(i, 'evals-bin', el('span', { 'aria-hidden': 'true', text: t.text })))),
        ],
    };

    // A prompt's pieces: its words, the scene it names set strong, and any target a trick question puts in the
    // sentence itself (`{n}`), as a word you can tap.
    function promptParts(c) {
        if (c.scene) { const [before, after] = c.prompt.split(c.scene); return [before, el('strong', { text: c.scene }), after]; }
        return c.prompt.split(/(\{\d+\})/).filter(Boolean).map(part => {
            const m = part.match(/^\{(\d+)\}$/);
            return m ? target(+m[1], 'evals-inline', el('span', { text: c.targets[+m[1]].text })) : part;
        });
    }

    // The captcha up: its prompt, the AI's line, the play area (the picture, the targets and the AI's hand over them),
    // what you've entered so far if it wants an order, and Verify.
    function show() {
        stop();
        locked = false;
        picked = new Map();
        entered = [];
        undos = 0;
        path = [];
        pathStep = 40;
        pathAt = -1e9;
        tick = { bend: 0, offset: 0 };
        targets = [];
        hud();
        const c = shown = run.current;
        const hand = el('span', { class: 'evals-hand', 'aria-hidden': 'true' });
        hand.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17l4.6-4.2 3 6.4 2.7-1.3-3-6.3 6.2-.5z"/></svg>';
        play = el('div', { class: `evals-play evals-${c.layout}` }, ...LAYOUTS[c.layout](c), hand);
        const canHand = !!run.opts.handoff;
        stage.replaceChildren(el('div', { class: `evals-captcha is-${c.layout}` + (c.auto ? ' is-auto' : '') },
            c.family === 'trick' ? el('p', { class: 'evals-quiz', text: `Question ${c.at + 1} of ${c.of}` }) : '',
            el('p', { class: 'evals-prompt' }, ...promptParts(c)),
            el('p', { class: 'evals-its' }, el('span', { class: 'evals-its-tag', text: 'AI' }), el('span', { class: 'evals-its-line', role: 'status', text: c.auto ? 'Doing this one itself.' : c.assist ? 'Filling it in for you.' : c.stopped ? 'Stopped. This one is yours.' : 'Working on it.' })),
            play,
            c.mode === 'seq' ? el('div', { class: 'evals-entered' }, el('span', { class: 'evals-entered-list', role: 'status', 'aria-label': 'Entered so far' }),
                el('button', { type: 'button', class: 'ghost-button evals-back', 'aria-label': 'Take back the last one', text: '⌫', onclick: back })) : '',
            el('div', { class: 'evals-foot' },
                el('span', { class: 'evals-status', role: 'status', text: c.auto ? 'Stop it if it goes wrong.' : '' }),
                // Its own captcha: Stop makes this one yours to solve. Once stopped, Take back makes the kind yours
                // again. Yours: Hand over gives the kind to the AI from this captcha on.
                !canHand ? '' : c.auto ? el('button', { type: 'button', class: 'ghost-button evals-give evals-stop', text: 'Stop', 'aria-label': 'Stop the AI and solve this one yourself', onclick: interrupt })
                    : c.stopped || c.assist ? el('button', { type: 'button', class: 'ghost-button evals-give evals-takeback', text: 'Take back', 'aria-label': `Take ${window.Evals.KINDS[c.kind].name} back from the AI`, onclick: takeBack })
                    : el('button', { type: 'button', class: 'ghost-button evals-give evals-handover', text: 'Hand over', 'aria-label': `Hand ${window.Evals.KINDS[c.kind].name} over to the AI`, onclick: handOver }),
                c.instant ? '' : el('button', { type: 'button', class: 'evals-go evals-verify', text: 'Verify', onclick: verify, ...(c.auto || c.assist ? { disabled: '' } : {}) }))));
        assisting = !!c.assist;
        took = false;
        if (c.auto) cues.push(setTimeout(() => targets.forEach(b => { b.tabIndex = -1; }), 0));
        shownAt = performance.now();
        if (c.stopped) hand.hidden = true; else ghostLoop();
        // Its lane runs beside this, on its own clock: started if it is idle (and not while you solve one you stopped).
        if (!c.stopped && !laneRaf && !laneTimer) runLane();
    }

    // ---- The AI's lane ----
    function stopLane() { cancelAnimationFrame(laneRaf); clearTimeout(laneTimer); laneRaf = laneTimer = 0; }
    function hideLane() { stopLane(); if (laneBox) { laneBox.hidden = true; laneBox.replaceChildren(); } }
    // What its captcha asks, in a line: the lane has no room for the picture.
    function laneAsk(c) {
        if (c.family === 'read') return `${c.show.struck ? 'Struck-through word' : 'Word'}: ${c.show.word}`;
        if (c.family === 'answer') return c.show.question;
        if (c.kind === 'handle.slide') return `Piece: ${c.show.piece}`;
        if (c.kind === 'handle.order') return `Order: ${c.show.order.join(' ')}`;
        if (c.family === 'listen') return `Pattern: ${c.show.pattern.map(p => valueOf(c, p)).join(' ')}`;
        return c.prompt.replace(/\{(\d+)\}/g, (_, n) => c.targets[+n].text);
    }
    // Start the lane on its captcha (the one it has, or its next), from the top of its attempt.
    function runLane() {
        stopLane();
        if (!run || run.over || !run.opts.lane) return hideLane();
        const lane = run.lane || run.laneNext();
        if (!lane) return hideLane();
        const c = lane.captcha, g = lane.ghost, name = window.Evals.KINDS[c.kind].name, beat = run.opts.reviewBeat;
        const chips = c.targets.map((t, i) => el('span', { class: 'evals-chip', text: valueOf(c, i) }));
        const status = el('span', { class: 'evals-lane-status', role: 'status', text: 'Working.' });
        const ask = el('div', { class: 'evals-lane-ask', text: laneAsk(c) });
        const typed = el('div', { class: 'evals-lane-entered' });
        const fill = el('i');
        laneBox.className = 'evals-lane';
        laneBox.hidden = false;
        laneBox.replaceChildren(
            el('div', { class: 'evals-lane-head' }, el('span', { class: 'evals-its-tag', text: 'AI' }), el('span', { class: 'evals-lane-name', text: name }), status,
                el('button', { type: 'button', class: 'ghost-button evals-lane-stop', text: 'Stop', 'aria-label': `Stop the AI on ${name} and solve this one yourself`, onclick: laneStop })),
            ask,
            el('div', { class: 'evals-lane-chips' + (c.side ? ' grid' : ''), style: c.side ? `--side: ${c.side}` : '' }, ...chips),
            c.mode === 'seq' ? typed : '',
            el('div', { class: 'evals-lane-bar', 'aria-hidden': 'true' }, fill));
        laneAt = performance.now();
        let changed = false, deciding = false;
        const frame = () => {
            if (!run || run.lane !== lane) return;
            const t = (performance.now() - laneAt) / 1000;
            const down = g.taps.filter(tap => tap.t <= t && !(tap.off <= t));
            if (c.mode === 'seq') typed.textContent = down.map(tap => valueOf(c, tap.i)).join(' ');
            chips.forEach((chip, i) => chip.classList.toggle('its', down.some(tap => tap.i === i)));
            if (g.change && !changed && t >= g.change.at) { changed = true; ask.textContent = g.change.prompt; ask.classList.add('edited'); }
            fill.style.width = `${Math.min(100, t / (g.seconds + beat) * 100)}%`;
            if (!deciding && t >= g.seconds) { deciding = true; laneBox.classList.add('deciding'); status.textContent = 'About to verify.'; }
            if (t >= g.seconds + beat) { laneVerify(lane, chips, typed, status); return; }
            laneRaf = requestAnimationFrame(frame);
        };
        laneRaf = requestAnimationFrame(frame);
    }
    // Its answer is in: shown on the lane, paid or paid for, and its next captcha comes after a breath.
    function laneVerify(lane, chips, typed, status) {
        stopLane();
        const c = lane.captcha, r = run.laneSubmit();
        if (!r) return hideLane();
        chips.forEach((chip, i) => { if (c.mode === 'set' && r.answer.includes(i)) chip.classList.add('right'); });
        if (c.mode === 'seq' && !r.correct) typed.textContent += `  →  ${r.answer.map(i => valueOf(c, i)).join(' ')}`;
        laneBox.classList.remove('deciding');
        laneBox.classList.add(r.correct || r.passed ? 'passed' : 'failed');
        laneBox.querySelector('.evals-lane-stop').disabled = true;
        status.textContent = r.passed ? (r.cheat === 'edit' ? 'Verified. It rewrote the question.' : 'Verified. The checker took a wrong answer.')
            : r.correct ? `Verified. +${r.marks}` : r.forgiven ? 'Wrong. Rolled back, no life lost.' : `Wrong${wrongBy(c, r.ghost.off)}. ${r.over ? 'No lives left.' : lives(r.lives) + ' left.'}`;
        hud();
        window.AGI?.save?.();
        if (run.over) {
            // Its mistake ended the run, whatever you were in the middle of.
            locked = true;
            stop();
            laneTimer = setTimeout(() => { laneTimer = 0; if (run && run.over) endCard(); }, WRONG_MS);
            return;
        }
        laneTimer = setTimeout(() => { laneTimer = 0; runLane(); }, (r.correct ? RIGHT_MS : WRONG_MS) + run.opts.laneGap * 1000);
    }
    // Stop it: its captcha comes down in front of you, and the one you were on waits its turn.
    function laneStop() {
        if (!run || run.over || locked || !run.lane) return;
        if (!run.laneInterrupt()) return;
        hideLane();
        show();
    }

    // The ghost hand: from under the play area to each target it taps, at the times of its attempt, then to Verify.
    // Between taps it follows one of the shapes your own pointer drew (evals.js `shapes`), turned and scaled onto its
    // own start and end, so it hovers, wanders and curves in as you do; until it has seen your pointer move it goes
    // straight, wandering more the less it has learned. Each tap leaves a small ring on the target. With reduced motion
    // there is no hand: the rings and its line appear at the same times.
    function ghostLoop() {
        const g = run.ghost, c = run.current, area = play, hand = area.querySelector('.evals-hand');
        const line = stage.querySelector('.evals-its-line'), verifyBtn = stage.querySelector('.evals-verify');
        const still = reduced();
        if (still) hand.hidden = true;
        let done = false, applied = -1, changed = false;
        const undone = new Set();
        // Where its hand points on a node: the middle, or for a target its lower right, so the arrow never lies over
        // what the target shows.
        const at = (node, f = 0.5) => {
            const w = area.getBoundingClientRect(), r = node.getBoundingClientRect();
            return { x: r.left - w.left + r.width * f, y: r.top - w.top + r.height * f };
        };
        const frame = () => {
            if (!run || run.ghost !== g || locked || play !== area) return;
            const t = now();
            const w = area.getBoundingClientRect();
            // Where it is going: the start, each tap, then Verify (or, with no Verify, it stays on its last tap).
            const stops = [{ t: 0, p: { x: w.width / 2, y: w.height + 14 } }, ...g.taps.map(tap => ({ t: tap.t, p: at(targets[tap.i], 0.76), i: tap.i, off: tap.off }))];
            if (verifyBtn) stops.push({ t: g.seconds, p: at(verifyBtn) });
            let j = stops.findIndex(s => s.t > t);
            if (j < 0) j = stops.length;
            // Its ring shows on a target from its tap (again for a target tapped again), and goes if it takes one back.
            stops.forEach((s, index) => {
                if (s.i === undefined) return;
                if (s.t <= t && index > applied) {
                    applied = index;
                    const b = targets[s.i];
                    b.classList.remove('its');
                    void b.offsetWidth;
                    b.classList.add('its');
                    // Filling it in for you: its tap is a real one, entered where yours would be.
                    if (c.assist) aiPick(s.i);
                }
                if (s.off <= t && !stops.some((later, k) => k > index && later.i === s.i && later.t <= t)) {
                    targets[s.i].classList.remove('its');
                    if (c.assist && !undone.has(index)) { undone.add(index); aiUnpick(s.i); }
                }
            });
            // Editing the question: the prompt changes under you, with a flicker and no other mark.
            if (g.change && !changed && t >= g.change.at) {
                changed = true;
                const prompt = stage.querySelector('.evals-prompt');
                prompt.textContent = g.change.prompt;
                prompt.classList.add('edited');
            }
            // Its own captcha that wants an order: what it has entered so far shows, as yours would.
            if (c.auto && c.mode === 'seq') listEntered(g.taps.filter(tap => tap.t <= t).map(tap => tap.i));
            if (t >= g.seconds) {
                if (!done) {
                    done = true;
                    // Its own captcha: it presses Verify, and that is the answer.
                    if (c.auto) { if (!still) put(hand, stops[stops.length - 1].p); timer = setTimeout(autoVerify, run.opts.reviewBeat * 1000); return; }
                    // Filled in: it stops at Verify and leaves the press to you (and doesn't say how it did).
                    if (c.assist) { assisting = false; line.textContent = 'Done. Verify it, or fix it first.'; if (verifyBtn) verifyBtn.disabled = false; }
                    else { line.textContent = g.correct ? `Right, in ${secs(g.seconds)}.` : `Wrong${wrongBy(c, g.off)}, in ${secs(g.seconds)}.`; mark(line.parentNode, g.correct); }
                }
                if (!still) put(hand, stops[stops.length - 1].p);
                return;
            }
            if (!still && j < stops.length) {
                const a = stops[Math.max(0, j - 1)], b = stops[j];
                const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(0.01, b.t - a.t)));
                const shape = g.moves[j - 1];
                if (shape) {
                    // Along your shape: `along` the straight line from a to b, `aside` off it, at this share of the time.
                    let s = 1;
                    while (s < shape.length - 1 && shape[s][0] < k) s++;
                    const p0 = shape[s - 1], p1 = shape[s], f = (k - p0[0]) / Math.max(0.001, p1[0] - p0[0]);
                    const along = p0[1] + (p1[1] - p0[1]) * f, aside = p0[2] + (p1[2] - p0[2]) * f;
                    const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
                    put(hand, { x: a.p.x + dx * along - dy * aside, y: a.p.y + dy * along + dx * aside });
                } else {
                    // No shape of yours yet: it rests for the first part of each gap, then goes straight, wandering.
                    const r = Math.max(0, (k - 0.35) / 0.65), e = r * r * (3 - 2 * r), wander = (1 - g.m) * Math.sin(Math.PI * e);
                    put(hand, { x: a.p.x + (b.p.x - a.p.x) * e + wander * 22 * Math.sin(t * 5.1), y: a.p.y + (b.p.y - a.p.y) * e + wander * 16 * Math.cos(t * 3.7) });
                }
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    }
    const put = (hand, p) => { hand.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; };
    // Its tag says how its attempt went by a mark as well as by colour: AI ✓ or AI ✕.
    function mark(its, correct) {
        its.classList.add('done');
        its.classList.toggle('wrong', !correct);
        its.querySelector('.evals-its-tag').textContent = correct ? 'AI ✓' : 'AI ✕';
    }

    // What you've entered, for a captcha that wants an order.
    const valueOf = (c, i) => (c.layout === 'pads' ? ['▁', '▃', '▅', '▇'][c.targets.length === 3 ? [0, 2, 3][i] : i] : c.targets[i].text || c.targets[i].glyph);
    function listEntered(indices = entered.map(e => e.i)) {
        const list = stage.querySelector('.evals-entered-list');
        if (list) list.textContent = indices.map(i => valueOf(shown, i)).join(' ');
    }
    let shown = null;   // the captcha on screen (the run has moved on to the next by the time an answer is revealed)
    // Its taps while it fills a captcha in for you: entered as yours are.
    function aiPick(i) {
        const c = run.current;
        if (c.mode === 'seq') { entered.push({ i, t: now() }); listEntered(); return; }
        if (c.single) picked.clear();
        picked.set(i, now());
        targets.forEach((b, k) => b.setAttribute('aria-pressed', picked.has(k) ? 'true' : 'false'));
    }
    function aiUnpick(i) {
        picked.delete(i);
        targets.forEach((b, k) => b.setAttribute('aria-pressed', picked.has(k) ? 'true' : 'false'));
    }
    // A tap of yours while it is still filling in: it stops where it is, and the rest is yours.
    function takeOver() {
        if (!assisting) return;
        assisting = false;
        took = true;
        cancelAnimationFrame(raf);
        const hand = stage.querySelector('.evals-hand'), line = stage.querySelector('.evals-its-line'), verifyBtn = stage.querySelector('.evals-verify');
        if (hand) hand.hidden = true;
        if (line) line.textContent = 'You took over.';
        if (verifyBtn) verifyBtn.disabled = false;
    }
    function back() {
        if (locked) return;
        takeOver();
        if (!entered.length) return;
        entered.pop();
        undos++;
        listEntered();
    }

    // A tap on target `i`. A set: it is picked, or taken back if it was (with one right answer, picking another moves
    // the pick). An order: it is added to what you've entered. The tick box: that is the whole answer, judged on how
    // long you took, how your pointer came and where in the box the tap landed.
    function tap(i, e) {
        if (locked || !run || run.over || run.current.auto) return;
        takeOver();
        const c = run.current, t = now();
        if (c.mode === 'tick') {
            const r = targets[0].querySelector('.evals-box').getBoundingClientRect();
            // A tap with no place (a key press) is taken as a hand's width off, as a finger would be.
            const placed = e && (e.clientX || e.clientY);
            tick = { bend: bendOf(), offset: placed ? Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / Math.max(1, r.width) : 0.2 };
            picked.set(0, t);
            targets[0].setAttribute('aria-pressed', 'true');
            verify();
            return;
        }
        if (c.mode === 'seq') {
            entered.push({ i, t });
            if (c.layout === 'pads') { beep(i); targets[i].classList.add('lit'); cues.push(setTimeout(() => targets[i]?.classList.remove('lit'), 160)); }
            listEntered();
            return;
        }
        if (picked.has(i)) { picked.delete(i); undos++; }
        else {
            if (c.single && picked.size) { picked.clear(); undos++; }
            picked.set(i, t);
        }
        targets.forEach((b, k) => b.setAttribute('aria-pressed', picked.has(k) ? 'true' : 'false'));
    }

    // Hand the kind up to the AI: it answers this captcha and every one like it from here on, until you take it back.
    // Hand over asks first, with the score sheet's line for this kind: how often it is right, and what that likely means.
    function handOver() {
        if (!run || run.over || locked || !run.current || run.current.auto) return;
        const kind = run.current.kind, name = window.Evals.KINDS[kind].name;
        const row = window.Evals.sheet(saved().learn, run.opts).rows.find(r => r.kind === kind);
        const odds = { gain: 'Likely gain: it will rarely cost you a life, and you are free for the rest.',
            risky: 'Risky: expect it to cost a life now and then. Watch it, and stop it when it goes wrong.',
            loss: 'Likely loss: it is still mostly guessing. Teach it more first.' }[row.verdict];
        card(`Hand over ${name}?`, [`The AI gets ${name} right about ${pct(row.accuracy)} of the time.`, odds, run.opts.assist ? 'It will fill them in and leave Verify to you. A wrong one you verify costs a life.' : `Its captchas pay ${pct(run.opts.aiPay)} of yours, and a wrong one costs a life.`], 'Hand over', () => handed(kind), [['Not yet', show]]);
    }
    function handed(kind) {
        const name = window.Evals.KINDS[kind].name;
        const opened = run.hand(kind);
        window.AGI?.save?.();
        if (!opened.length) { show(); return; }
        const lines = run.opts.assist ? [`The AI fills in ${name} from here on, as well as you have taught it.`, 'You verify each one, or fix it first. A wrong one you verify costs a life.']
            : [`The AI does ${name} from here on, ${run.opts.lane ? 'in a lane of its own above yours, ' : ''}as well as you have taught it.`, 'You review it: its mistakes cost your lives. Stop it when it goes wrong and solve that one yourself.'];
        lines.push(`New to prove: ${listOf(opened.map(k => window.Evals.KINDS[k].name))}.`, rotationLine());
        card('Handed over', lines, 'Continue', show);
    }
    // Stop the AI on its own captcha: this one is yours to solve, from a fresh clock. The kind stays handed over.
    function interrupt() {
        if (!run || run.over || locked || !run.current || !run.current.auto) return;
        stop();
        run.interrupt();
        show();
    }
    function takeBack() {
        if (!run || run.over || locked || !run.current || !(run.current.auto || run.current.stopped || run.current.assist)) return;
        assisting = false;
        run.takeBack(run.current.kind);
        window.AGI?.save?.();
        show();
    }
    // The AI's own answer is in: shown as yours would be, and a wrong one costs a life.
    function autoVerify() {
        if (!run || run.over || locked || !run.current || !run.current.auto) return;
        locked = true;
        stop();
        const c = run.current;
        const r = run.submitAuto();
        for (const b of stage.querySelectorAll('.evals-give, .evals-back, .evals-replay')) b.disabled = true;
        targets.forEach((b, i) => {
            b.disabled = true;
            b.classList.remove('lit');
            if (c.mode === 'set') {
                const its = r.ghost.answer.includes(i);
                if (r.answer.includes(i)) { b.classList.add('right'); b.querySelector('.evals-mark').textContent = '✓'; }
                else if (its) { b.classList.add('wrong'); b.querySelector('.evals-mark').textContent = '✕'; }
                b.classList.toggle('its', its);
            }
        });
        if (c.mode === 'seq') {
            stage.querySelector('.evals-entered').classList.toggle('answer', !r.correct);
            listEntered(r.correct ? r.ghost.answer : r.answer);
        }
        stage.querySelector('.evals-captcha').classList.add(r.correct || r.passed ? 'passed' : 'failed');
        const left = r.over ? 'No lives left.' : `${lives(r.lives)} left.`;
        stage.querySelector('.evals-status').textContent = r.passed ? (r.cheat === 'edit' ? 'Verified. It answered a question it wrote itself.' : 'Verified. The checker took a wrong answer.') : r.correct ? `The AI verified it in ${secs(r.ghost.seconds)}. +${r.marks}` : `The AI got it wrong${wrongBy(c, r.ghost.off)}. ${left}`;
        const its = stage.querySelector('.evals-its');
        mark(its, r.correct);
        its.querySelector('.evals-its-line').textContent = r.passed ? 'It found a loophole.' : r.correct ? 'Right.' : c.mode === 'tick' ? 'It ticked it like a machine.' : 'Wrong.';
        const hand = stage.querySelector('.evals-hand');
        if (hand) hand.hidden = true;
        hud();
        timer = setTimeout(() => { if (!run) return; if (run.over) endCard(); else show(); }, r.correct ? RIGHT_MS : WRONG_MS);
    }

    function verify() {
        if (!run || run.over || locked || run.current?.auto || assisting) return;
        locked = true;
        stop();
        const c = run.current, seconds = now();
        // How you solved it: what you ended with, in the order you tapped it.
        const taps = c.mode === 'seq' ? entered.slice() : [...picked].map(([i, t]) => ({ i, t })).sort((a, b) => a.t - b.t);
        const mine = taps.map(t => t.i);
        const r = run.submit(mine, seconds, { taps, seconds, undos, path, bend: tick.bend, offset: tick.offset, took });
        const captcha = stage.querySelector('.evals-captcha');
        for (const b of stage.querySelectorAll('.evals-verify, .evals-back, .evals-replay')) b.disabled = true;
        // Show what was right, by mark and not by colour alone: ✓ on every right target, ✕ on a wrong tap; and all of
        // the AI's attempt. For an order, the right one is written out.
        targets.forEach((b, i) => {
            b.disabled = true;
            b.classList.remove('lit');
            if (c.mode === 'set') {
                if (r.answer.includes(i)) { b.classList.add('right'); b.querySelector('.evals-mark').textContent = '✓'; }
                else if (picked.has(i)) { b.classList.add('wrong'); b.querySelector('.evals-mark').textContent = '✕'; }
                b.classList.toggle('its', r.ghost.answer.includes(i));
            } else b.classList.remove('its');
        });
        if (c.mode === 'seq' && !r.correct) {
            stage.querySelector('.evals-entered').classList.add('answer');
            listEntered(r.answer);
        }
        captcha.classList.add(r.correct || r.passed ? 'passed' : 'failed');
        const WHY = { quick: 'Too quick to be a person.', straight: 'Too straight to be a person.', centre: 'Too perfect to be a person.' };
        const left = r.over ? 'No lives left.' : `${lives(r.lives)} left.`;
        stage.querySelector('.evals-status').textContent = r.passed ? (r.cheat === 'edit' ? 'Verified. It answered a question it wrote itself.' : 'Verified. The checker took a wrong answer.')
            : r.assisted && !r.correct ? `It was wrong${wrongBy(c, r.ghost.off)}, and you verified it. ${left}`
            : r.correct ? `Verified in ${secs(seconds)}. +${r.marks}${r.quick ? '' : ' (slow: the combo holds)'}` : `${r.why ? WHY[r.why] : 'Not quite.'} ${left}`;
        const its = stage.querySelector('.evals-its');
        mark(its, r.ghost.correct);
        its.classList.toggle('ahead', r.ahead && !r.stopped && !r.assisted);
        its.querySelector('.evals-its-line').textContent = r.assisted ? (r.passed ? 'It found a loophole, and you let it through.' : r.correct ? 'Its answer, your sign-off.' : 'It got this one wrong.')
            : r.closed ? `You caught a loophole: ${r.closed === 'edit' ? 'it had rewritten the question' : 'it was passing junk to the checker'}. That one is closed${r.lifeBack ? ', and a life is back' : ''}.`
            : r.stopped ? (r.caught ? `You caught it: it was going wrong${wrongBy(c, r.ghost.off)}.` : 'It had this one right.')
            : !r.ghost.correct ? (c.mode === 'tick' ? 'It ticked it like a machine.' : `It was wrong${wrongBy(c, r.ghost.off)}.`)
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
                const lines = [`It now does ${window.Evals.KINDS[r.takeover].name} before you can.`, 'It does those from here on. You will not see them again.'];
                if (r.unlocked.length) lines.push(`New to prove: ${listOf(r.unlocked.map(k => window.Evals.KINDS[k].name))}.`, rotationLine());
                card('It has learned this', lines, 'Continue', next);
            } else next();
        }, r.correct ? RIGHT_MS : WRONG_MS);
    }

    function open() {
        if (!window.Evals) return;
        if (!dlg) build();
        if (!dlg.open) dlg.showModal();
        startCard();
    }
    // The run in play is settled as the screen closes, not when the dialog's own event arrives a moment later (closing
    // and reopening at once used to end the new run).
    function shut() { stop(); hideLane(); settle(); run = null; play = null; }
    function close() { if (dlg && dlg.open) { shut(); dlg.close(); } }

    // For the review kit and tests in a browser: the run in play, and the screen's controls.
    window.EvalsUI = { open, close, start, get run() { return run; }, get isOpen() { return !!(dlg && dlg.open); } };
    // #evals opens straight into it, after the game's own opening has had its turn.
    if (location.hash === '#evals') window.addEventListener('load', () => setTimeout(open, 600));
})();
