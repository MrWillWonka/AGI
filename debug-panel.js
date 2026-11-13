// debug-panel.js — developer tools. Hidden: opened by a long press (or three taps) on the title, ?debug or #debug in
// the URL, or the ` (backtick) key; remembered per device. The panel's × (or three more taps) closes it.
(function () {
    'use strict';

    const FLAG_KEY = 'agiDebug';
    const E = window.AGIEngine;
    let panel = null;

    function flag(value) {
        try {
            if (value === undefined) return localStorage.getItem(FLAG_KEY) === '1';
            localStorage.setItem(FLAG_KEY, value ? '1' : '0');
        } catch { /* storage unavailable */ }
        return false;
    }

    function button(label, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost-button';
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    // A collapsible section (the owner's call: quick to get to what you need); which are open is remembered per device.
    const OPEN_KEY = 'agiDebugOpen';
    let openSet = null;
    function openSections() {
        if (openSet) return openSet;
        try { openSet = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || 'null') || ['Packet Snare', 'Jump ahead']); } catch { openSet = new Set(['Packet Snare', 'Jump ahead']); }
        return openSet;
    }
    function section(title, ...children) {
        const s = document.createElement('details');
        s.className = 'debug-section';
        s.open = openSections().has(title);
        const h = document.createElement('summary');
        h.textContent = title;
        const body = document.createElement('div');
        body.className = 'debug-row';
        body.append(...children);
        s.append(h, body);
        s.addEventListener('toggle', () => {
            if (s.open) openSet.add(title); else openSet.delete(title);
            try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet])); } catch { /* storage unavailable */ }
        });
        return s;
    }
    // A labelled group inside a section (a small heading over its own row).
    function group(title, ...children) {
        const g = document.createElement('div');
        g.className = 'debug-group';
        const h = document.createElement('h4');
        h.textContent = title;
        const row = document.createElement('div');
        row.className = 'debug-row';
        row.append(...children);
        g.append(h, row);
        return g;
    }

    function amountInput(value, step) {
        const i = document.createElement('input');
        i.type = 'number';
        i.value = value;
        i.step = step || 'any';
        i.min = 0;
        return i;
    }

    function build() {
        const AGI = window.AGI;
        panel = document.createElement('aside');
        panel.className = 'debug-panel';
        panel.setAttribute('aria-label', 'Debug panel');

        const header = document.createElement('header');
        const title = document.createElement('strong');
        title.textContent = 'Debug';
        const minimize = button('–', () => panel.classList.toggle('minimized'));
        minimize.title = 'Minimize';
        const close = button('×', () => toggle(false));
        close.title = 'Close';
        header.append(title, minimize, close);

        const body = document.createElement('div');
        body.className = 'debug-body';

        const resAmount = amountInput(1000);
        const resButtons = Object.entries(E.RESOURCES).map(([k, r]) =>
            button(`+${r.short}`, () => AGI.debug.add('res.' + k, Number(resAmount.value) || 0)));

        const attrAmount = amountInput(5);
        const attrButtons = Object.entries(E.ATTRIBUTES).map(([k, a]) =>
            button(`+${a.name.slice(0, 3)}`, () => AGI.debug.add('attr.' + k, Number(attrAmount.value) || 0)));

        const rateInputs = ['cp', 'dp', 'rp', 'xp'].map(k => {
            const label = document.createElement('label');
            const input = amountInput(AGI.debug.rates[k], 0.5);
            input.addEventListener('change', () => { AGI.debug.rates[k] = Math.max(0, Number(input.value) || 0); });
            label.append(`${E.RESOURCES[k].short} ×`, input);
            return label;
        });

        // Per second: a flat amount of each resource added every second of game time (0 = off).
        const incomeInputs = Object.entries(E.RESOURCES).map(([k, r]) => {
            const label = document.createElement('label');
            const input = amountInput(AGI.debug.income[k] || 0);
            input.addEventListener('input', () => { AGI.debug.income[k] = Math.max(0, Number(input.value) || 0); });
            label.append(`${r.short}/s`, input);
            return label;
        });

        const simAmount = amountInput(3600, 60);
        const stateView = document.createElement('pre');

        // Game speed: economy ticks and training physics run this many times faster.
        const speedButtons = [1, 2, 5, 20].map(x => {
            const b = button(`${x}×`, () => {
                AGI.debug.setSpeed(x);
                speedButtons.forEach(o => o.classList.toggle('active', o === b));
            });
            if (x === AGI.debug.speed) b.classList.add('active');
            return b;
        });

        // What's playing: the area, which of its two songs, the section and the bar in it.
        const songLabel = document.createElement('span');
        songLabel.className = 'debug-song';
        const phaseButtons = E.PHASES.slice(1).map((p, i) => button(`Reach ${p.name}`, () => AGI.debug.reachPhase(i + 1)));

        // The sector to jump to (1-based on screen, as the game shows it).
        const sectorAmount = amountInput(4, 1);
        sectorAmount.min = 1;
        // A reset that wipes one game's progress: red, like Start over.
        const dangerButton = (label, fn) => { const b = button(label, fn); b.classList.add('danger'); return b; };
        const startOver = button('Start over (back to the inbox)', AGI.debug.startOver);
        startOver.classList.add('danger');
        const top = document.createElement('div');
        top.className = 'debug-row debug-top';
        top.append(startOver, button('Save now', AGI.save));

        // Ordered by how often they're used (the owner's call): starting over and Packet Snare first, then jumping
        // ahead, training, resources and time, then the rest; each section folds away.
        body.append(
            top,
            section('Packet Snare', button('Open Packet Snare', () => { AGI.debug.openSnare(); toggle(false); }),
                button('Boss now / clear sector', () => AGI.debug.snareBoss()), button('Max snare tree', () => AGI.debug.snareMax()),
                group('Go to sector', sectorAmount, button('Go', () => AGI.debug.snareSector(Math.max(1, Math.floor(Number(sectorAmount.value) || 1)) - 1))),
                // a focused playtest: the sector with the build a person has there (tools/review/scenarios.json), threats
                // before it met, marked in the playtest log (`preset`)
                button('Playtest from this sector', () => { AGI.debug.snarePreset(Math.max(1, Math.floor(Number(sectorAmount.value) || 1))); toggle(false); }),
                dangerButton('Reset Packet Snare (sector 1, no Signal)', () => AGI.debug.resetSnare())),
            section('Evals', button('Open Evals', () => { toggle(false); AGI.debug.openEvals(); }),
                button('Teach it (+25% every kind)', () => AGI.debug.evalsTeach(0.25)),
                // kinds unlock as it takes kinds over; off, every kind is in from the start (takes effect on the next run)
                (() => { const label = () => `Unlock ladder: ${AGI.debug.evalsLadder() ? 'on' : 'off (every kind)'}`; const b = button(label(), () => { AGI.debug.evalsLadder(!AGI.debug.evalsLadder()); b.textContent = label(); }); return b; })(),
                button('Loopholes now (kinds it holds)', () => AGI.debug.evalsLoopholes()),
                button('+1,000 Marks', () => AGI.debug.evalsMarks(1000)),
                (() => { const label = () => `AI's lane (dropped): ${AGI.debug.evalsLane() ? 'on' : 'off'}`; const b = button(label(), () => { AGI.debug.evalsLane(!AGI.debug.evalsLane()); b.textContent = label(); }); return b; })(),
                (() => { const label = () => `It fills in, you verify: ${AGI.debug.evalsAssist() ? 'on' : 'off (it verifies itself)'}`; const b = button(label(), () => { AGI.debug.evalsAssist(!AGI.debug.evalsAssist()); b.textContent = label(); }); return b; })(),
                dangerButton('Reset Evals (nothing learned)', () => AGI.debug.resetEvals())),
            section('Jump ahead', button('Learn next skill', AGI.debug.learnSkill), ...phaseButtons,
                button('Unlock everything', AGI.debug.unlockAll)),
            section('Training', button('Finish run', AGI.debug.finishRun), button('Test summit', () => AGI.debug.testSummit()),
                button('Test near miss', () => AGI.debug.testNailBiter()), button('Fling the ball', () => AGI.debug.fling()), button('Max skill tree', AGI.debug.maxTree),
                button('Toggle Auto-Trainer', AGI.debug.toggleAutoTrainer), button('Reset tree view', AGI.debug.resetTreeView),
                dangerButton('Reset Training Cluster (warm-up, no XP)', () => AGI.debug.resetTraining()),
                group('Power-ups', ...[['breakthrough', 'Breakthrough'], ['maxEffort', 'Max Effort'], ['crunch', 'Crunch'], ['flow', 'Flow'], ['viral', 'Viral'],
                    ['system', 'System prompt'], ['superBreakthrough', 'Paradigm Shift'], ['superCrunch', 'Bullet Time'], ['superFlow', 'Lucid Dream']]
                    .map(([k, label]) => button(label, () => AGI.debug.luck(k))))),
            section('Resources', group('Add', resAmount, ...resButtons), group('Attributes', attrAmount, ...attrButtons),
                group('Per second', ...incomeInputs), group('Rate multipliers', ...rateInputs)),
            section('Time', group('Game speed', ...speedButtons),
                group('Simulate', simAmount, button('Simulate seconds', () => AGI.debug.simulate(Number(simAmount.value) || 0)))),
            section('Lab', button('Fill investor offers', AGI.debug.fillOffers), button('Finish offers', AGI.debug.finishOffers),
                button('Clear offers', AGI.debug.clearOffers), button('Meet automation gates', AGI.debug.meetAutomation),
                button('+10 every hardware', () => AGI.debug.addHardware(10)), button('+1 every lab upgrade', AGI.debug.buyLabUpgrades),
                button('Lab log line', () => AGI.debug.labLog())),
            section('Server room', button('+50 laps per cleared leg', () => AGI.debug.addLaps(50)), button('Record 90%', () => AGI.debug.setRecord(0.9)),
                button('Reset room visits', AGI.debug.resetVisits)),
            section('Versions', button('Add a version (+10 Insight)', AGI.debug.addVersion), button('Ship next version now', AGI.debug.shipVersion),
                button('Max legacy nodes', AGI.debug.maxLegacy), button('Open challenges', AGI.debug.openChallenges),
                button('Beat the running challenge', AGI.debug.beatChallenge), button('Ready to transcend', AGI.debug.readyTranscend)),
            section('Music', songLabel, button('Next song', AGI.debug.nextSong), button('Next section', AGI.debug.nextSection)),
            section('State', stateView)
        );
        panel.append(header, body);
        document.body.append(panel);

        setInterval(() => {
            if (!panel.hidden && !panel.classList.contains('minimized')) {
                stateView.textContent = JSON.stringify(AGI.state, null, 1);
                const sg = AGI.debug.song;
                songLabel.textContent = sg ? `${sg.area} song ${sg.song} · ${sg.section} bar ${sg.bar}` : 'music off';
            }
        }, 500);
    }

    function toggle(show) {
        if (!panel) build();
        panel.hidden = !show;
        flag(show);
    }


    document.addEventListener('DOMContentLoaded', () => {
        // Hidden (the owner's call: no icon in the top bar): three taps on the title in a row, each within half a second
        // of the last, open and close it, on a phone too (pointerup: iOS sends no click to a plain heading).
        const brand = document.querySelector('.topbar .brand');
        let taps = [];
        // A long press on the title (the owner's call, 2026-11-11: on a phone the title is just the logo, too small to
        // triple-tap easily): held still for LONG_PRESS ms, it opens or closes the panel. The press's own lift doesn't
        // count as a tap. iOS's callout and text selection are kept off the title (styles.css, .brand).
        const LONG_PRESS = 900;
        let hold = null, held = false;
        const cancelHold = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
        brand?.addEventListener('pointerdown', e => {
            if (e.button > 0) return;
            cancelHold();
            held = false;
            hold = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
                hold = null;
                held = true;
                taps = [];
                navigator.vibrate?.(15);
                toggle(!panel || panel.hidden);
            }, LONG_PRESS) };
        });
        brand?.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) cancelHold(); });
        for (const t of ['pointercancel', 'pointerleave']) brand?.addEventListener(t, cancelHold);
        brand?.addEventListener('contextmenu', e => e.preventDefault());
        brand?.addEventListener('pointerup', e => {
            cancelHold();
            if (held) { held = false; return; }
            if (e.button > 0) return;
            const now = performance.now();
            taps = taps.filter(t => now - t < 500 * (taps.length + 1)).concat(now);
            if (taps.length >= 3 && taps[taps.length - 1] - taps[taps.length - 3] < 1000) {
                taps = [];
                toggle(!panel || panel.hidden);
            }
        });

        // ?debug only reaches a standalone page; inside an artifact only a #hash passes through.
        if (new URLSearchParams(location.search).has('debug') || location.hash === '#debug' || flag()) toggle(true);

        document.addEventListener('keydown', e => {
            if (e.key === '`' && !e.target.closest('input, textarea')) toggle(!panel || panel.hidden);
        });
    });
})();
