// debug-panel.js — developer tools. Enabled with ?debug in the URL (remembered) or by pressing ` (backtick).
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

    function section(title, ...children) {
        const s = document.createElement('section');
        const h = document.createElement('h4');
        h.textContent = title;
        const body = document.createElement('div');
        body.className = 'debug-row';
        body.append(...children);
        s.append(h, body);
        return s;
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

        const rateInputs = Object.keys(E.RESOURCES).map(k => {
            const label = document.createElement('label');
            const input = amountInput(AGI.debug.rates[k], 0.5);
            input.addEventListener('change', () => { AGI.debug.rates[k] = Math.max(0, Number(input.value) || 0); });
            label.append(`${E.RESOURCES[k].short} ×`, input);
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

        const phaseButtons = E.PHASES.slice(1).map((p, i) => button(`Reach ${p.name}`, () => AGI.debug.reachPhase(i + 1)));

        body.append(
            section('Resources', resAmount, ...resButtons),
            section('Attributes', attrAmount, ...attrButtons),
            section('Rate multipliers', ...rateInputs),
            section('Time', simAmount, button('Simulate seconds', () => AGI.debug.simulate(Number(simAmount.value) || 0))),
            section('Game speed', ...speedButtons),
            section('Progress', button('Learn next skill', AGI.debug.learnSkill), ...phaseButtons,
                button('Unlock everything', AGI.debug.unlockAll), button('Add a Transcend', AGI.debug.addTranscend)),
            section('Training', button('Finish run', AGI.debug.finishRun), button('Test summit', () => AGI.debug.testSummit()),
                button('Test near miss', () => AGI.debug.testNailBiter()), button('Max skill tree', AGI.debug.maxTree),
                button('Toggle Auto-Trainer', AGI.debug.toggleAutoTrainer), button('Reset tree view', AGI.debug.resetTreeView)),
            section('Save', button('Save now', AGI.save), button('Start over', AGI.debug.startOver)),
            section('State', stateView)
        );
        panel.append(header, body);
        document.body.append(panel);

        makeDraggable(panel, header);
        setInterval(() => {
            if (!panel.hidden && !panel.classList.contains('minimized')) {
                stateView.textContent = JSON.stringify(AGI.state, null, 1);
            }
        }, 500);
    }

    function makeDraggable(target, handle) {
        let start = null;
        handle.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            const rect = target.getBoundingClientRect();
            start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', e => {
            if (!start) return;
            const x = Math.min(window.innerWidth - 60, Math.max(0, e.clientX - start.x));
            const y = Math.min(window.innerHeight - 30, Math.max(0, e.clientY - start.y));
            Object.assign(target.style, { left: x + 'px', top: y + 'px', right: 'auto' });
        });
        handle.addEventListener('pointerup', () => { start = null; });
    }

    function toggle(show) {
        if (!panel) build();
        panel.hidden = !show;
        flag(show);
        document.getElementById('debugToggle').hidden = false;
    }

    document.addEventListener('DOMContentLoaded', () => {
        const toggleButton = document.getElementById('debugToggle');
        toggleButton.addEventListener('click', () => toggle(!panel || panel.hidden));

        if (new URLSearchParams(location.search).has('debug') || flag()) toggle(true);

        document.addEventListener('keydown', e => {
            if (e.key === '`' && !e.target.closest('input, textarea')) toggle(!panel || panel.hidden);
        });
    });
})();
