// game.js — DOM layer: renders state from AGIEngine, wires input, runs the loop, persists saves.
window.AGI = (function () {
    'use strict';

    const E = window.AGIEngine;
    const SAVE_KEY = 'agiGame';
    const TICK_MS = 100;
    const AUTOSAVE_MS = 30000;
    const HOLD_DELAY_MS = 400;
    const HOLD_REPEAT_MS = 100;
    const LOG_LIMIT = 60;

    let state;
    let lastTick = Date.now();
    let lastSave = Date.now();
    const debugRates = { cp: 1, dp: 1, rp: 1 };
    const ui = { binds: [], actions: {}, upgrades: {}, tabs: {}, panels: {}, milestones: {}, achievements: {} };
    let activeTab = 'hardware';

    // ---- Storage --------------------------------------------------------

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch { return false; }
    }

    function save(manual) {
        state.lastSaved = Date.now();
        lastSave = state.lastSaved;
        const ok = storageSet(SAVE_KEY, E.serialize(state));
        if (manual) log(ok ? 'Game saved.' : 'Could not save: browser storage is unavailable.', ok ? 'success' : 'warning');
    }

    function load() {
        const now = Date.now();
        const json = storageGet(SAVE_KEY);
        if (!json) {
            state = E.defaultState(now);
            log('Welcome. Click Generate Compute to begin.', 'special');
            return;
        }
        const loaded = E.deserialize(json, now);
        if (!loaded) {
            state = E.defaultState(now);
            log('Your save could not be read, so a new game was started.', 'warning');
            return;
        }
        state = loaded;
        log('Game loaded.', 'success');
        reportOffline(E.applyOffline(state, now, debugRates));
    }

    function reportOffline(seconds) {
        if (seconds < 60) return;
        log(`Welcome back! Your systems ran for ${E.formatDuration(seconds)} while you were away.`, 'special');
    }

    // ---- Small DOM helpers ----------------------------------------------

    const $ = id => document.getElementById(id);

    function el(tag, props, children) {
        const node = document.createElement(tag);
        if (props) {
            for (const [k, v] of Object.entries(props)) {
                if (k === 'class') node.className = v;
                else if (k === 'text') node.textContent = v;
                else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') node.setAttribute(k, v);
                else node[k] = v;
            }
        }
        (children || []).forEach(c => c && node.append(c));
        return node;
    }

    function setText(node, text) {
        if (node.textContent !== text) node.textContent = text;
    }

    function setHidden(node, hidden) {
        if (node.hidden !== hidden) node.hidden = hidden;
    }

    function setDisabled(node, disabled) {
        if (node.disabled !== disabled) node.disabled = disabled;
    }

    // ---- Log & toasts ---------------------------------------------------

    function log(message, type) {
        const list = $('gameLog');
        if (!list) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        list.prepend(el('li', { class: `log-entry log-${type || 'info'}` }, [
            el('time', { text: time }), document.createTextNode(' ' + message)
        ]));
        while (list.children.length > LOG_LIMIT) list.lastChild.remove();
    }

    function toast(title, message) {
        const box = el('div', { class: 'toast', role: 'status' }, [el('strong', { text: title }), el('span', { text: message })]);
        $('toasts').append(box);
        requestAnimationFrame(() => box.classList.add('show'));
        setTimeout(() => {
            box.classList.remove('show');
            setTimeout(() => box.remove(), 300);
        }, 4500);
    }

    function floatGain(anchor, text) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = anchor.getBoundingClientRect();
        const pop = el('div', { class: 'float-gain', text });
        pop.style.left = `${rect.left + rect.width / 2 + (Math.random() * 40 - 20)}px`;
        pop.style.top = `${rect.top + window.scrollY}px`;
        document.body.append(pop);
        pop.addEventListener('animationend', () => pop.remove());
    }

    // ---- Hold-to-repeat buttons -----------------------------------------

    // Fires `fn` on click (mouse, touch or keyboard) and repeats it while the pointer is held down.
    function holdable(button, fn) {
        let delay = null;
        let repeat = null;
        let repeated = false;

        const stop = () => {
            clearTimeout(delay);
            clearInterval(repeat);
            delay = repeat = null;
            button.classList.remove('held');
        };

        button.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            repeated = false;
            delay = setTimeout(() => {
                button.classList.add('held');
                repeat = setInterval(() => {
                    if (button.disabled) return stop();
                    repeated = true;
                    fn();
                }, HOLD_REPEAT_MS);
            }, HOLD_DELAY_MS);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => button.addEventListener(t, stop));
        button.addEventListener('click', () => {
            if (repeated) { repeated = false; return; }
            fn();
        });
        button.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Build static UI ------------------------------------------------

    function buildActions() {
        const box = $('actions');
        for (const action of E.ACTIONS) {
            const gain = el('span', { class: 'action-gain' });
            const cost = el('span', { class: 'action-cost', text: E.formatCost(action.cost) });
            const button = el('button', { type: 'button', class: 'button action-button' }, [
                el('span', { class: 'action-name', text: action.name }), gain, cost
            ]);
            holdable(button, () => doAction(action.id, button));
            box.append(button);
            ui.actions[action.id] = { action, button, gain };
        }
    }

    function buildUpgrades() {
        const tabs = $('upgradeTabs');
        const panels = $('upgradePanels');
        for (const tab of E.TABS) {
            const tabButton = el('button', {
                type: 'button', class: 'tab', id: `tab-${tab.id}`, role: 'tab',
                'aria-controls': `panel-${tab.id}`, text: tab.name
            });
            tabButton.addEventListener('click', () => selectTab(tab.id));
            tabs.append(tabButton);
            const panel = el('div', { class: 'tab-panel', id: `panel-${tab.id}`, role: 'tabpanel', 'aria-labelledby': `tab-${tab.id}` });
            panels.append(panel);
            ui.tabs[tab.id] = tabButton;
            ui.panels[tab.id] = panel;
        }
        tabs.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const visible = E.TABS.filter(t => !ui.tabs[t.id].hidden).map(t => t.id);
            const i = visible.indexOf(activeTab);
            const next = visible[(i + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
            selectTab(next);
            ui.tabs[next].focus();
        });

        for (const up of E.UPGRADES) {
            const levelBadge = el('span', { class: 'badge' });
            const button = el('button', { type: 'button', class: 'button upgrade-button' });
            button.addEventListener('click', () => doBuy(up.id));
            const card = el('article', { class: 'upgrade', hidden: true }, [
                el('div', { class: 'upgrade-info' }, [
                    el('h3', {}, [document.createTextNode(up.name + ' '), levelBadge]),
                    el('p', { class: 'muted small', text: up.effect })
                ]),
                button
            ]);
            ui.panels[up.tab].append(card);
            ui.upgrades[up.id] = { up, card, button, levelBadge };
        }
        for (const tab of E.TABS) {
            const empty = el('p', { class: 'muted small empty-hint', text: 'Keep progressing to discover upgrades here.' });
            ui.panels[tab.id].append(empty);
            ui.panels[tab.id].emptyHint = empty;
        }
        selectTab(activeTab);
    }

    function buildChecklists() {
        for (const m of E.MILESTONES) {
            const item = el('li', {}, [el('strong', { text: m.name }), el('span', { class: 'muted small', text: m.desc })]);
            $('milestones').append(item);
            ui.milestones[m.key] = item;
        }
        for (const a of E.ACHIEVEMENTS) {
            const item = el('li', {}, [el('strong', { text: a.name }), el('span', { class: 'muted small', text: a.desc })]);
            $('achievements').append(item);
            ui.achievements[a.id] = item;
        }
    }

    function buildBindings() {
        ui.binds = [...document.querySelectorAll('[data-bind]')].map(node => ({ node, key: node.dataset.bind }));
    }

    function buildSettings() {
        const autosave = $('settingAutosave');
        const offline = $('settingOffline');
        autosave.addEventListener('change', () => { state.settings.autosave = autosave.checked; save(); });
        offline.addEventListener('change', () => { state.settings.offline = offline.checked; save(); });
        $('saveButton').addEventListener('click', () => save(true));
        $('exportButton').addEventListener('click', exportSave);
        $('importButton').addEventListener('click', importSave);
        $('resetButton').addEventListener('click', hardReset);
        $('prestigeButton').addEventListener('click', doPrestige);
    }

    function syncSettings() {
        $('settingAutosave').checked = state.settings.autosave;
        $('settingOffline').checked = state.settings.offline;
    }

    function selectTab(id) {
        activeTab = id;
        for (const tab of E.TABS) {
            const selected = tab.id === id;
            ui.tabs[tab.id].setAttribute('aria-selected', String(selected));
            ui.tabs[tab.id].tabIndex = selected ? 0 : -1;
            ui.panels[tab.id].hidden = !selected;
        }
    }

    // ---- Player commands ------------------------------------------------

    function doAction(id, button) {
        const result = E.act(state, id, debugRates);
        if (!result.ok) return;
        if (result.gained != null) {
            floatGain(button, `+${E.format(result.gained)} ${E.RESOURCES[result.resource].short}`);
        }
        if (result.msg) log(result.msg, 'success');
        afterChange();
    }

    function doBuy(id) {
        const result = E.buy(state, id);
        log(result.msg, result.ok ? 'success' : 'warning');
        if (result.ok) afterChange();
    }

    // In-page replacement for confirm()/prompt(), which embedded and sandboxed hosts often block.
    // Resolves with { ok, value }. `onOk` runs inside the click handler (needed for clipboard access).
    function openDialog({ title, message, text, readonly = false, okLabel = 'OK', cancelLabel = 'Cancel', danger = false, onOk }) {
        const dialog = $('dialog');
        const area = $('dialogText');
        const ok = $('dialogOk');
        setText($('dialogTitle'), title);
        setText($('dialogMessage'), message);
        area.hidden = text === undefined;
        area.value = text ?? '';
        area.readOnly = readonly;
        setText(ok, okLabel);
        ok.classList.toggle('button-danger', danger);
        setText($('dialogCancel'), cancelLabel);
        dialog.returnValue = '';
        return new Promise(resolve => {
            const handleOk = () => onOk?.(area);
            ok.addEventListener('click', handleOk);
            dialog.addEventListener('close', () => {
                ok.removeEventListener('click', handleOk);
                resolve({ ok: dialog.returnValue === 'ok', value: area.value });
            }, { once: true });
            dialog.showModal();
            if (!area.hidden) {
                area.focus();
                if (readonly) area.select();
            }
        });
    }

    async function doPrestige() {
        const gain = E.prestigeGain(state);
        if (gain < 1) return;
        const { ok } = await openDialog({
            title: `Transcend for ${gain} Prestige Point${gain === 1 ? '' : 's'}?`,
            message: "This run's resources, attributes and upgrades reset. Achievements and Prestige Points are kept.",
            okLabel: 'Transcend'
        });
        if (!ok) return;
        const result = E.prestige(state, Date.now());
        if (!result.ok) return;
        state = result.state;
        resetView();
        log(`Transcended! +${result.gain} Prestige Points. All production is now ×${E.derive(state).mult.toFixed(2)}.`, 'special');
        toast('Transcended', `+${result.gain} Prestige Points`);
        afterChange();
        save();
    }

    function exportSave() {
        save();
        const code = btoa(E.serialize(state));
        openDialog({
            title: 'Export save',
            message: 'Copy this code to back up your game or continue it in another browser.',
            text: code,
            readonly: true,
            okLabel: 'Copy code',
            cancelLabel: 'Close',
            onOk: area => {
                area.select();
                navigator.clipboard?.writeText(code).then(
                    () => log('Save code copied to your clipboard.', 'success'),
                    () => log('Copy was blocked. Select the code and copy it manually.', 'warning')
                );
            }
        });
    }

    async function importSave() {
        const { ok, value } = await openDialog({
            title: 'Import save',
            message: 'Paste a save code. This replaces your current game.',
            text: '',
            okLabel: 'Import'
        });
        if (!ok || !value.trim()) return;
        let imported = null;
        try { imported = E.deserialize(atob(value.trim()), Date.now()); } catch { /* invalid base64 */ }
        if (!imported) {
            log('That save code is not valid. Check that you pasted the whole code.', 'warning');
            return;
        }
        state = imported;
        resetView();
        save();
        log('Save imported.', 'success');
        afterChange();
    }

    async function hardReset() {
        const { ok } = await openDialog({
            title: 'Erase all progress?',
            message: 'This deletes everything, including Prestige Points and achievements. It cannot be undone.',
            okLabel: 'Erase everything',
            danger: true
        });
        if (!ok) return;
        state = E.defaultState(Date.now());
        resetView();
        save();
        log('Game reset.', 'warning');
        afterChange();
    }

    function resetView() {
        syncSettings();
        selectTab('hardware');
    }

    // ---- Loop & rendering -----------------------------------------------

    function afterChange() {
        announce(E.evaluate(state));
        render();
    }

    function announce(changes) {
        for (const m of changes.milestones) {
            log(`Milestone reached: ${m.name}`, 'special');
        }
        for (const up of changes.upgrades) {
            log(`New upgrade available: ${up.name}`, 'info');
        }
        for (const a of changes.achievements) {
            log(`Achievement unlocked: ${a.name}`, 'special');
            toast('Achievement unlocked', a.name);
        }
        if (changes.phase) {
            log(`Phase transition! You have reached ${changes.phase.name}.`, 'special');
            toast('Phase up!', changes.phase.name);
        }
    }

    function tick() {
        const now = Date.now();
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        // Long gaps (sleep, frozen tab) count as offline time and obey the offline setting/cap.
        if (dt > 60) {
            const seconds = state.settings.offline ? Math.min(dt, E.MAX_OFFLINE_SECONDS) : 0;
            E.tick(state, seconds, debugRates);
            reportOffline(seconds);
        } else {
            E.tick(state, dt, debugRates);
        }
        afterChange();
        if (state.settings.autosave && now - lastSave >= AUTOSAVE_MS) save();
    }

    function bindValue(key, d) {
        const f = E.format;
        switch (key) {
            case 'res.cp': return f(state.res.cp);
            case 'res.dp': return f(state.res.dp);
            case 'res.rp': return f(state.res.rp);
            case 'rate.cp': return d.cpPerSec ? `+${f(d.cpPerSec)}/s` : '';
            case 'rate.dp': return d.dpPerSec ? `+${f(d.dpPerSec)}/s` : '';
            case 'rate.rp': return d.rpPerSec ? `+${f(d.rpPerSec)}/s` : '';
            case 'attr.intelligence': return f(state.attr.intelligence, 1);
            case 'attr.creativity': return f(state.attr.creativity, 1);
            case 'attr.awareness': return f(state.attr.awareness, 1);
            case 'mult': return `×${d.mult.toFixed(2)}`;
            case 'phase.name': return E.PHASES[E.phaseIndex(state)].name;
            case 'phase.next': {
                const idx = E.phaseIndex(state);
                const next = E.PHASES[idx + 1];
                if (!next) return 'You have reached the final phase. Transcend to grow stronger.';
                const reqs = Object.entries(next.req).map(([k, v]) => `${E.ATTRIBUTES[k].short} ${f(Math.min(state.attr[k], v), 1)}/${v}`);
                return `Next: ${next.name} (${reqs.join(' · ')})`;
            }
            case 'prestige.points': return f(state.prestige.points);
            case 'prestige.gain': return f(E.prestigeGain(state));
            case 'prestige.count': return f(state.prestige.count);
            case 'achievements.count': return `${Object.keys(state.achievements).length}/${E.ACHIEVEMENTS.length}`;
            case 'stats.runTime': return E.formatDuration((Date.now() - state.stats.runStart) / 1000);
            case 'stats.playTime': return E.formatDuration(state.stats.playTime);
            case 'stats.runCp': return f(state.stats.runCp);
            case 'stats.lifetimeCp': return f(state.stats.lifetimeCp);
            case 'stats.clicks': return f(state.stats.clicks);
            case 'loss.epoch': return `Landscape ${state.loss.epoch + 1}`;
            case 'loss.balls': return `${loss.sim ? loss.sim.balls.length : 0}/${E.LOSS.maxBalls} in flight`;
            case 'loss.cost': return `${E.formatCost(E.LOSS.dropCost)} per gradient`;
        }
        return '';
    }

    function render() {
        const d = E.derive(state, debugRates);

        for (const b of ui.binds) setText(b.node, bindValue(b.key, d));

        const pct = Math.round(E.phaseProgress(state) * 100);
        const bar = $('phaseBar');
        bar.setAttribute('aria-valuenow', pct);
        bar.firstElementChild.style.width = pct + '%';

        const gains = { compute: `+${E.format(d.clickPower)} CP`, collect: `+${E.format(d.dpPerCollect)} DP`,
            research: `+${E.format(d.rpPerResearch)} RP`, train: `+${E.format(d.trainGain)} Int`, improve: `+${E.IMPROVE_GAIN} Int` };
        for (const { action, button, gain } of Object.values(ui.actions)) {
            setHidden(button, !!action.unlock && !state.unlocked[action.unlock]);
            setDisabled(button, !E.canAfford(state, action.cost));
            setText(gain, gains[action.id]);
        }

        for (const tab of E.TABS) {
            setHidden(ui.tabs[tab.id], !!tab.unlock && !state.unlocked[tab.unlock]);
        }
        if (ui.tabs[activeTab].hidden) selectTab('hardware');

        const visibleCount = {};
        for (const { up, card, button, levelBadge } of Object.values(ui.upgrades)) {
            const visible = E.isUpgradeVisible(state, up);
            setHidden(card, !visible);
            if (!visible) continue;
            visibleCount[up.tab] = (visibleCount[up.tab] || 0) + 1;
            const lvl = E.level(state, up.id);
            const maxed = E.isMaxed(state, up);
            setText(levelBadge, up.max === 1 ? (maxed ? 'Owned' : '') : `Lv ${lvl}`);
            card.classList.toggle('owned', maxed);
            if (maxed) {
                setText(button, 'Owned');
                setDisabled(button, true);
            } else {
                const cost = E.upgradeCost(up, lvl);
                setText(button, E.formatCost(cost));
                setDisabled(button, !E.canAfford(state, cost));
            }
        }
        for (const tab of E.TABS) setHidden(ui.panels[tab.id].emptyHint, !!visibleCount[tab.id]);

        for (const [key, item] of Object.entries(ui.milestones)) item.classList.toggle('done', !!state.unlocked[key]);
        for (const [id, item] of Object.entries(ui.achievements)) item.classList.toggle('done', !!state.achievements[id]);

        setDisabled($('prestigeButton'), E.prestigeGain(state) < 1);

        const lossPanel = $('lossPanel');
        const lossWasHidden = lossPanel.hidden;
        setHidden(lossPanel, !state.unlocked['module:loss']);
        if (lossWasHidden && !lossPanel.hidden) startLossLoop();
    }

    // ---- Loss Landscape module -------------------------------------------

    // The physics lives in loss-landscape.js; this section draws it, takes input and reports
    // settled balls to the engine. It only simulates while the panel is on screen.
    const loss = {
        sim: null,
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,
        visible: false,
        frame: 0,
        last: 0,
        aimX: 0.5,
        hover: false,
        drag: null,
        best: null,
        floats: [],
        colors: {}
    };
    const FLING = 5;       // drag distance (fraction of width) → initial velocity
    const PAD = 14;

    function lossSim() {
        const seed = E.lossSeed(state);
        // A new landscape (new epoch, run or save) takes over once the old one's balls have settled.
        if (!loss.sim || (loss.sim.landscape.seed !== seed && loss.sim.balls.length === 0)) {
            loss.sim = window.LossLandscape.createSim(window.LossLandscape.createLandscape(seed));
            loss.best = null;
        }
        return loss.sim;
    }

    function buildLoss() {
        const canvas = $('lossCanvas');
        loss.canvas = canvas;
        loss.ctx = canvas.getContext('2d');
        const css = getComputedStyle(document.documentElement);
        for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'muted', 'border', 'text']) {
            loss.colors[name] = css.getPropertyValue('--' + name).trim();
        }

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            loss.width = canvas.clientWidth;
            loss.height = Math.round(Math.min(280, Math.max(180, loss.width * 0.42)));
            canvas.style.height = loss.height + 'px';
            canvas.width = Math.round(loss.width * dpr);
            canvas.height = Math.round(loss.height * dpr);
            loss.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawLoss();
        };
        new ResizeObserver(resize).observe(canvas);

        new IntersectionObserver(([entry]) => {
            loss.visible = entry.isIntersecting;
            if (loss.visible) startLossLoop();
        }).observe(canvas);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) startLossLoop(); });

        const toX = e => {
            const rect = canvas.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - rect.left - PAD) / (rect.width - PAD * 2)));
        };
        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            canvas.setPointerCapture(e.pointerId);
            loss.drag = { x0: toX(e), x: toX(e) };
            loss.aimX = loss.drag.x0;
            startLossLoop();
        });
        canvas.addEventListener('pointermove', e => {
            loss.hover = true;
            if (loss.drag) loss.drag.x = toX(e);
            else loss.aimX = toX(e);
            startLossLoop();
        });
        canvas.addEventListener('pointerup', () => {
            if (!loss.drag) return;
            const { x0, x } = loss.drag;
            loss.drag = null;
            dropGradient(x0, (x - x0) * FLING);
        });
        canvas.addEventListener('pointercancel', () => { loss.drag = null; });
        canvas.addEventListener('pointerleave', () => { loss.hover = false; startLossLoop(); });
        canvas.addEventListener('keydown', e => {
            const step = e.shiftKey ? 0.1 : 0.02;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                loss.aimX = Math.min(1, Math.max(0, loss.aimX + (e.key === 'ArrowLeft' ? -step : step)));
                loss.hover = true;
            } else if (e.key === 'Enter' || e.key === ' ') {
                dropGradient(loss.aimX, 0);
            } else {
                return;
            }
            e.preventDefault();
            startLossLoop();
        });
        canvas.addEventListener('blur', () => { loss.hover = false; startLossLoop(); });
    }

    function dropGradient(x, vx) {
        const sim = lossSim();
        if (sim.balls.length >= E.LOSS.maxBalls) {
            setText($('lossStatus'), `Up to ${E.LOSS.maxBalls} gradients at a time. Wait for one to settle.`);
            return;
        }
        if (!E.payLossDrop(state)) {
            setText($('lossStatus'), `Each gradient costs ${E.formatCost(E.LOSS.dropCost)}.`);
            return;
        }
        sim.drop(x, vx);
        setText($('lossStatus'), '');
        render();
        startLossLoop();
    }

    function startLossLoop() {
        if (loss.frame || !loss.canvas || $('lossPanel').hidden) return;
        loss.last = performance.now();
        loss.frame = requestAnimationFrame(lossFrame);
    }

    function lossFrame(now) {
        loss.frame = 0;
        const dt = Math.min(0.1, (now - loss.last) / 1000);
        loss.last = now;
        const sim = lossSim();
        const running = loss.visible && !document.hidden;
        if (running) {
            for (const ev of sim.step(dt)) settleGradient(sim, ev);
        }
        loss.floats = loss.floats.filter(f => (f.age += dt) < 1.4);
        drawLoss();
        // Keep animating while something moves; otherwise stop until the next input.
        if (running && (sim.balls.length || loss.floats.length || loss.drag)) {
            loss.frame = requestAnimationFrame(lossFrame);
        }
    }

    function settleGradient(sim, ev) {
        const gain = E.settleLoss(state, ev.loss, ev.converged);
        if (loss.best === null || ev.loss < loss.best) loss.best = ev.loss;
        loss.floats.push({ x: ev.x, value: sim.landscape.loss(ev.x), text: `+${gain.toFixed(2)} Int`, converged: ev.converged, age: 0 });
        if (ev.converged) {
            log(`Converged at the global minimum (loss ${ev.loss.toFixed(3)}): +${gain.toFixed(2)} Intelligence. A new landscape awaits.`, 'special');
        }
        afterChange();
    }

    function drawLoss() {
        const { ctx, width: w, height: h, colors: c } = loss;
        if (!ctx || !w) return;
        const sim = lossSim();
        const land = sim.landscape;
        const X = x => PAD + x * (w - PAD * 2);
        // Loss 0 sits at the bottom of the canvas, loss 1 at the top.
        const Y = v => h - PAD - v * (h - PAD * 2);

        ctx.clearRect(0, 0, w, h);

        // Loss gridlines, the way a training curve is read.
        ctx.font = '11px ui-monospace, Consolas, monospace';
        ctx.textBaseline = 'bottom';
        for (const v of [0.25, 0.5, 0.75]) {
            ctx.strokeStyle = c.border;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD, Y(v));
            ctx.lineTo(w - PAD, Y(v));
            ctx.stroke();
            ctx.fillStyle = c.muted;
            ctx.fillText(`loss ${v}`, PAD + 2, Y(v) - 2);
        }

        // Terrain
        const pts = land.profile;
        ctx.beginPath();
        ctx.moveTo(X(0), h);
        pts.forEach((v, i) => ctx.lineTo(X(i / (pts.length - 1)), Y(v)));
        ctx.lineTo(X(1), h);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, PAD, 0, h);
        fill.addColorStop(0, hexAlpha(c.secondary, 0.45));
        fill.addColorStop(1, hexAlpha(c.primary, 0.08));
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        pts.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i / (pts.length - 1)), Y(v)));
        ctx.strokeStyle = c.secondary;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Best loss reached on this landscape
        if (loss.best !== null) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = c.success;
            ctx.beginPath();
            ctx.moveTo(PAD, Y(loss.best));
            ctx.lineTo(w - PAD, Y(loss.best));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = c.success;
            ctx.textAlign = 'right';
            ctx.fillText(`best ${loss.best.toFixed(3)}`, w - PAD - 2, Y(loss.best) - 2);
            ctx.textAlign = 'left';
        }

        // Aim guide and fling arrow
        if (loss.hover || loss.drag) {
            const ax = loss.drag ? loss.drag.x0 : loss.aimX;
            const av = land.loss(ax);
            ctx.strokeStyle = hexAlpha(c.text, 0.25);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(X(ax), PAD);
            ctx.lineTo(X(ax), Y(av));
            ctx.stroke();
            ctx.fillStyle = hexAlpha(c.warning, 0.4);
            ctx.beginPath();
            ctx.arc(X(ax), Y(av) - 6, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = c.text;
            ctx.textAlign = X(ax) > w / 2 ? 'right' : 'left';
            ctx.fillText(`loss ${av.toFixed(3)}`, X(ax) + (X(ax) > w / 2 ? -8 : 8), Y(av) - 14);
            ctx.textAlign = 'left';
            if (loss.drag && Math.abs(loss.drag.x - loss.drag.x0) > 0.01) {
                const y = Y(av) - 6;
                const x2 = X(loss.drag.x);
                ctx.strokeStyle = c.warning;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(ax), y);
                ctx.lineTo(x2, y);
                const dir = Math.sign(x2 - X(ax));
                ctx.lineTo(x2 - dir * 6, y - 4);
                ctx.moveTo(x2, y);
                ctx.lineTo(x2 - dir * 6, y + 4);
                ctx.stroke();
            }
        }

        // Balls with trails
        for (const b of sim.balls) {
            ctx.strokeStyle = hexAlpha(c.warning, 0.35);
            ctx.lineWidth = 2;
            ctx.beginPath();
            b.trail.forEach((x, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x), Y(land.loss(x)) - 6));
            ctx.stroke();
            ctx.fillStyle = c.warning;
            ctx.beginPath();
            ctx.arc(X(b.x), Y(land.loss(b.x)) - 6, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rewards floating up from where balls settled
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px system-ui, sans-serif';
        for (const f of loss.floats) {
            ctx.globalAlpha = Math.max(0, 1 - f.age / 1.4);
            ctx.fillStyle = f.converged ? c.accent : c.success;
            ctx.fillText(f.converged ? `${f.text} · converged!` : f.text, X(f.x), Y(f.value) - 16 - f.age * 24);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
    }

    function hexAlpha(hex, alpha) {
        const n = parseInt(hex.replace('#', ''), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    // ---- Init -----------------------------------------------------------

    function init() {
        buildActions();
        buildUpgrades();
        buildChecklists();
        buildBindings();
        buildSettings();
        buildLoss();
        load();
        syncSettings();
        E.evaluate(state); // silently restore unlocks implied by the loaded state
        render();
        lastTick = Date.now();
        setInterval(tick, TICK_MS);
        // Save whenever the page is hidden or closed; beforeunload is unreliable on mobile.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && state.settings.autosave) save();
        });
        window.addEventListener('pagehide', () => { if (state.settings.autosave) save(); });
    }

    document.addEventListener('DOMContentLoaded', init);

    // Hooks for debug-panel.js and the browser console.
    return {
        get state() { return state; },
        save: () => save(true),
        debug: {
            rates: debugRates,
            add(path, amount) {
                const [group, key] = path.split('.');
                state[group][key] += amount;
                afterChange();
            },
            unlockAll() {
                E.MILESTONES.forEach(m => { state.unlocked[m.key] = true; });
                E.UPGRADES.forEach(u => { state.unlocked['up:' + u.id] = true; });
                afterChange();
            },
            simulate(seconds) {
                E.tick(state, seconds, debugRates);
                afterChange();
            },
            log
        }
    };
})();
