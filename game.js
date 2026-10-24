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
            ui.actions[action.id] = { action, button, gain, cost };
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
            case 'path.learned': return `${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned`;
            case 'path.cost': return `Push: ${E.formatCost(E.pushCost(state))}`;
            case 'path.power': return `Strength ${d.pushPower.toFixed(1)}`;
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
            research: `+${E.format(d.rpPerResearch)} RP`, improve: `+${E.IMPROVE_GAIN} Int` };
        for (const { action, button, gain, cost } of Object.values(ui.actions)) {
            const price = E.actionCost(state, action);
            setHidden(button, !!action.unlock && !state.unlocked[action.unlock]);
            setDisabled(button, !E.canAfford(state, price));
            setText(gain, gains[action.id]);
            setText(cost, E.formatCost(price));
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

        const pathPanel = $('pathPanel');
        const pathWasHidden = pathPanel.hidden;
        setHidden(pathPanel, !state.unlocked['module:path']);
        if (pathWasHidden && !pathPanel.hidden) startPathLoop();
        if (path.stateRef !== state) startPathLoop();
    }

    // ---- Training Path ---------------------------------------------------

    // The physics lives in training-path.js. This section draws the trail, takes pushes and
    // reports crested hills to the engine. It only simulates while the panel is on screen.
    const T = window.TrainingPath;
    const path = {
        sim: null,
        stateRef: null,
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,
        visible: false,
        frame: 0,
        last: 0,
        cam: null,          // smoothed { left, right, top } in world units
        glow: null,         // { hill, age }: the hill just learned, briefly lit up
        pushFlash: 0,
        colors: {}
    };
    const PAD_X = 16;
    const PAD_Y = 28;
    const BALL = 7;

    // The sim follows the state: a new run, import or reset restarts the ball in the learned valley.
    function pathSim() {
        const outOfSync = path.sim && path.sim.valley !== state.path.learned && path.sim.atRest;
        if (!path.sim || path.stateRef !== state || outOfSync) {
            path.sim = T.createSim(state.path.learned);
            path.stateRef = state;
            path.cam = null;
        }
        return path.sim;
    }

    function buildPath() {
        const canvas = $('pathCanvas');
        path.canvas = canvas;
        path.ctx = canvas.getContext('2d');
        const css = getComputedStyle(document.documentElement);
        for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'muted', 'border', 'text']) {
            path.colors[name] = css.getPropertyValue('--' + name).trim();
        }

        new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1;
            path.width = canvas.clientWidth;
            path.height = Math.round(Math.min(260, Math.max(170, path.width * 0.4)));
            canvas.style.height = path.height + 'px';
            canvas.width = Math.round(path.width * dpr);
            canvas.height = Math.round(path.height * dpr);
            path.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawPath();
        }).observe(canvas);

        new IntersectionObserver(([entry]) => {
            path.visible = entry.isIntersecting;
            if (path.visible) startPathLoop();
        }).observe(canvas);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) startPathLoop(); });

        canvas.addEventListener('pointerdown', e => { if (e.button === 0) pushBall(); });
        canvas.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            pushBall();
        });
        $('pushButton').addEventListener('click', pushBall);
    }

    function pushBall(auto) {
        const sim = pathSim();
        if (sim.ball.cooldown > 0) return false;
        if (!E.payPush(state)) {
            if (!auto) setText($('pathStatus'), `Each push costs ${E.formatCost(E.pushCost(state))}.`);
            return false;
        }
        sim.push(E.derive(state, debugRates).pushPower);
        path.pushFlash = 0.35;
        setText($('pathStatus'), '');
        render();
        startPathLoop();
        return true;
    }

    // Auto-Trainer: level 1 pushes when the ball has stopped; level 2 also pushes as it swings forward.
    function autoTrain(sim) {
        const lvl = E.level(state, 'autoTrainer');
        if (!lvl || sim.ball.cooldown > 0) return;
        if (sim.atRest || (lvl >= 2 && sim.ball.v > 0.05)) pushBall(true);
    }

    function startPathLoop() {
        if (path.frame || !path.canvas || $('pathPanel').hidden) return;
        path.last = performance.now();
        path.frame = requestAnimationFrame(pathFrame);
    }

    function pathFrame(now) {
        path.frame = 0;
        const dt = Math.min(0.1, (now - path.last) / 1000);
        path.last = now;
        const sim = pathSim();
        const running = path.visible && !document.hidden;
        if (running) {
            autoTrain(sim);
            for (const ev of sim.step(dt)) {
                if (ev.type === 'crest') learnedHill(ev.hill);
            }
        }
        if (path.glow && (path.glow.age += dt) > 2) path.glow = null;
        path.pushFlash = Math.max(0, path.pushFlash - dt);
        drawPath(dt);
        setDisabled($('pushButton'), sim.ball.cooldown > 0 || !E.canAfford(state, E.pushCost(state)));
        // Keep animating while anything moves or the camera is still easing; the Auto-Trainer keeps it alive too.
        const moving = !sim.atRest || path.glow || path.pushFlash || E.level(state, 'autoTrainer') || cameraEasing();
        if (running && moving) path.frame = requestAnimationFrame(pathFrame);
    }

    function learnedHill(i) {
        const skill = E.learnSkill(state, i);
        if (!skill) return;
        const grants = Object.entries(skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
        path.glow = { hill: i, age: 0 };
        log(`Learned ${skill.name}: ${skill.effect} (${grants}).`, 'special');
        toast('Skill learned', skill.name);
        afterChange();
    }

    // Camera target: the whole journey so far, plus the next hill and a glimpse of the one after.
    function cameraTarget() {
        const learned = state.path.learned;
        const next = T.hill(learned);
        const after = T.hill(learned + 1);
        return { left: -0.25 * T.hill(0).halfWidth - 0.1, right: after.peak, top: next.height * 1.35 };
    }

    function cameraEasing() {
        const t = cameraTarget();
        const c = path.cam;
        return !c || Math.abs(c.right - t.right) / t.right > 0.002 || Math.abs(c.top - t.top) / t.top > 0.002;
    }

    function drawPath(dt = 0) {
        const { ctx, width: w, height: h, colors: c } = path;
        if (!ctx || !w || !state) return;
        const sim = pathSim();
        const target = cameraTarget();
        if (!path.cam) path.cam = { ...target };
        // Ease the zoom so a newly learned skill visibly pulls the camera out.
        const k = Math.min(1, dt * 2.5);
        for (const key of ['left', 'right', 'top']) path.cam[key] += (target[key] - path.cam[key]) * k;
        const cam = path.cam;
        const X = x => PAD_X + (x - cam.left) / (cam.right - cam.left) * (w - PAD_X * 2);
        const Y = y => h - PAD_Y - y / cam.top * (h - PAD_Y * 1.6);
        const learned = state.path.learned;

        ctx.clearRect(0, 0, w, h);

        // Trail: learned ground solid, the hill being learned bright, the far hill fading into fog.
        const samples = Math.min(1200, Math.max(300, Math.round(w * 1.5)));
        const pts = [];
        for (let i = 0; i <= samples; i++) {
            const x = cam.left + (cam.right - cam.left) * i / samples;
            pts.push([X(x), Y(T.height(x)), x]);
        }
        const fog = ctx.createLinearGradient(X(T.hill(learned).end), 0, X(cam.right), 0);
        fog.addColorStop(0, hexAlpha(c.secondary, 0.4));
        fog.addColorStop(1, hexAlpha(c.secondary, 0));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], h);
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.lineTo(pts[pts.length - 1][0], h);
        ctx.closePath();
        ctx.fillStyle = fog;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        const segment = (from, to, color) => {
            ctx.beginPath();
            let started = false;
            for (const [px, py, x] of pts) {
                if (x < from || x > to) continue;
                started ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                started = true;
            }
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        const current = T.hill(learned);
        segment(cam.left, current.start, c.success);
        segment(current.start, current.end, c.warning);
        segment(current.end, cam.right, hexAlpha(c.muted, 0.6));
        if (path.glow) {
            const g = T.hill(path.glow.hill);
            ctx.save();
            ctx.lineWidth = 6;
            ctx.shadowColor = c.success;
            ctx.shadowBlur = 16;
            ctx.globalAlpha = 1 - path.glow.age / 2;
            segment(g.start, g.end, c.success);
            ctx.restore();
        }

        // Learned skills: a marker on each crest, names for the most recent ones.
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < learned; i++) {
            const hl = T.hill(i);
            const px = X(hl.peak);
            const py = Y(hl.height);
            ctx.fillStyle = c.success;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
            if (i >= learned - 2 && X(T.hill(i).end) - X(T.hill(i).start) > 50) {
                ctx.fillStyle = hexAlpha(c.success, 0.8);
                ctx.fillText(E.skillAt(i).name, px, py - 8);
            }
        }

        // The hill being learned: its name and how far up it you have got.
        const best = Math.round(sim.ball.best * 100);
        ctx.fillStyle = c.warning;
        ctx.font = 'bold 12px system-ui, sans-serif';
        const labelX = Math.min(w - 70, Math.max(70, X(current.peak)));
        ctx.fillText(E.skillAt(learned).name, labelX, Math.max(14, Y(current.height) - 22));
        if (best > 0) {
            ctx.font = '11px ui-monospace, Consolas, monospace';
            ctx.fillText(`best ${best}%`, labelX, Math.max(27, Y(current.height) - 9));
            // Mark the highest point reached on the slope.
            const reachX = reachPoint(current, sim.ball.best);
            ctx.strokeStyle = hexAlpha(c.warning, 0.7);
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(X(reachX), Y(T.height(reachX)));
            ctx.lineTo(X(reachX), h - PAD_Y + 6);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = hexAlpha(c.muted, 0.9);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText('?', X(T.hill(learned + 1).peak), Math.max(14, Y(T.hill(learned + 1).height) - 8));

        // Ball. Its ring says when to push: green while rolling forward, red while rolling back.
        const bx = X(sim.ball.x);
        const by = Y(T.height(sim.ball.x)) - BALL;
        const forward = sim.ball.v > 0.05;
        const back = sim.ball.v < -0.05;
        if (path.pushFlash > 0) {
            ctx.fillStyle = hexAlpha(c.warning, path.pushFlash);
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 10 * (0.35 - path.pushFlash) / 0.35 + 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.arc(bx, by, BALL, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = forward ? c.success : back ? c.danger : c.primary;
        ctx.stroke();

        ctx.textAlign = 'left';
    }

    // x on the front slope of hill h where the height is `fraction` of its peak.
    function reachPoint(h, fraction) {
        // height = H·cos²(π/2 · u), u = (x - peak)/halfWidth, u ∈ [-1, 0] on the front slope.
        const u = -(2 / Math.PI) * Math.acos(Math.sqrt(Math.min(1, fraction)));
        return h.peak + u * h.halfWidth;
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
        buildPath();
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
            // Learn the next skill instantly (the ball jumps ahead once it is at rest).
            learnSkill() {
                learnedHill(state.path.learned);
                startPathLoop();
            },
            pathSim: () => {
                const sim = pathSim();
                return { valley: sim.valley, x: sim.ball.x, v: sim.ball.v, atRest: sim.atRest, best: sim.ball.best };
            },
            simulate(seconds) {
                E.tick(state, seconds, debugRates);
                afterChange();
            },
            log
        }
    };
})();
