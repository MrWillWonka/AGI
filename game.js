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
        const ticker = $('ticker');
        if (ticker) {
            ticker.textContent = message;
            ticker.className = `ticker log-${type || 'info'}`;
        }
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

    function buildJournal() {
        const journal = $('journal');
        const tabs = [...$('journalTabs').querySelectorAll('[data-section]')];
        const sections = [...journal.querySelectorAll('section[data-section]')];
        const show = name => {
            for (const t of tabs) {
                const on = t.dataset.section === name;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
            }
            for (const sec of sections) sec.hidden = sec.dataset.section !== name;
        };
        tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.section)));
        show('log');
        $('journalButton').addEventListener('click', () => journal.showModal());
        $('journalClose').addEventListener('click', () => journal.close());
        // Click on the backdrop closes it too.
        journal.addEventListener('click', e => { if (e.target === journal) journal.close(); });
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
            case 'stats.rolls': return f(state.stats.rolls);
            case 'bay.training': return bayStatus('training');
            case 'bay.pipeline': return bayStatus('pipeline');
            case 'bay.architecture': return bayStatus('architecture');
            case 'bay.core': return bayStatus('core');
            case 'path.learned': return `${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned`;
            case 'path.stats': return `Strength ${d.pushPower.toFixed(1)} · ${d.pushesPerRoll} pushes · ${d.pushCooldown.toFixed(1)}s between`;
            case 'res.xp': return f(state.res.xp);
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
            const visible = E.isUpgradeVisible(state, up) && !E.isMaxed(state, up);
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
        setHidden($('transcendPanel'), E.prestigeGain(state) < 1 && state.prestige.count === 0);
        for (const node of document.querySelectorAll('[data-show]')) setHidden(node, !state.unlocked[node.dataset.show]);
        setText($('nextGoal'), nextGoal());
        renderHub();
        // The trail's animation loop sleeps when nothing moves, so keep its button in step with
        // resources here too (otherwise Launch stays disabled after you can afford it).
        if (openBay === 'training') updatePathControls();

        if (openBay === 'training' && !bayUnlocked('training')) exitBay();
        if (path.stateRef !== state) {
            path.pause = 0;
            startPathLoop();
        }
    }

    function nextGoal() {
        const milestone = E.MILESTONES.find(m => !state.unlocked[m.key]);
        if (milestone) return `Next: ${milestone.desc}`;
        const phase = E.PHASES[E.phaseIndex(state) + 1];
        if (!phase) return 'You reached the Singularity. Transcend to go again, stronger.';
        const reqs = Object.entries(phase.req).filter(([k, v]) => state.attr[k] < v)
            .map(([k, v]) => `${E.ATTRIBUTES[k].name} ${E.format(state.attr[k], 1)}/${v}`);
        return `Next: reach ${phase.name} (${reqs.join(', ')})`;
    }

    // ---- Server room hub ---------------------------------------------------

    // Bays in the server room. Each is a training module; only the Training Cluster is built so far.
    const BAYS = {
        training: { name: 'Training Cluster', built: true, unlocked: () => !!state.unlocked['module:path'],
            lockedText: () => 'Locked · earn 50 CP to power it up' },
        pipeline: { name: 'Data Pipeline', phase: 1 },
        architecture: { name: 'Architecture Lab', phase: 2 },
        core: { name: 'The Core', phase: 3 }
    };
    let openBay = null;

    function bayUnlocked(id) {
        const bay = BAYS[id];
        return bay.unlocked ? bay.unlocked() : E.phaseIndex(state) >= bay.phase;
    }

    function bayStatus(id) {
        const bay = BAYS[id];
        if (!bayUnlocked(id)) return bay.lockedText ? bay.lockedText() : `Locked · reach ${E.PHASES[bay.phase].name}`;
        if (!bay.built) return 'Online soon · in development';
        const learned = state.path.learned;
        const record = Math.round(state.path.best * 100);
        return `${learned} skill${learned === 1 ? '' : 's'} · next: ${E.skillAt(learned).name}${record ? ` · record ${record}%` : ''}`;
    }

    function buildHub() {
        for (const node of document.querySelectorAll('.bay')) {
            node.addEventListener('click', () => enterBay(node.dataset.bay, node));
        }
        $('backButton').addEventListener('click', exitBay);
        // Escape zooms back out (unless a dialog is open; dialogs handle their own Escape).
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && openBay && !document.querySelector('dialog[open]')) exitBay();
        });
    }

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Zoom: the bay grows to fill the viewport while the room scales up past the camera.
    function zoomFrames(bayNode) {
        const vp = $('viewport').getBoundingClientRect();
        const r = bayNode.getBoundingClientRect();
        const sx = r.width / vp.width;
        const sy = r.height / vp.height;
        const bayBox = `translate(${r.left - vp.left}px, ${r.top - vp.top}px) scale(${sx}, ${sy})`;
        const origin = `${r.left - vp.left + r.width / 2}px ${r.top - vp.top + r.height / 2}px`;
        return { bayBox, origin, roomScale: Math.min(1 / sx, 1 / sy) };
    }

    function enterBay(id, bayNode) {
        if (!bayUnlocked(id) || openBay) return;
        openBay = id;
        const bay = BAYS[id];
        setText($('moduleTitle'), bay.name);
        for (const m of document.querySelectorAll('.module')) m.hidden = true;
        if (bay.built) {
            document.querySelector(`.module[data-module="${id}"]`).hidden = false;
        } else {
            document.querySelector('.module[data-module="soon"]').hidden = false;
            setText($('soonText'), `The ${bay.name} is being built. It will be the hands-on module for the ${E.PHASES[bay.phase].name} phase.`);
        }
        const hub = $('hub');
        const view = $('moduleView');
        const { bayBox, origin, roomScale } = zoomFrames(bayNode);
        view.hidden = false;
        const done = () => {
            hub.hidden = true;
            (id === 'training' ? $('pushButton') : $('backButton')).focus({ preventScroll: true });
            startPathLoop();
        };
        if (reducedMotion()) return done();
        const timing = { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' };
        hub.style.transformOrigin = origin;
        hub.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${roomScale})`, opacity: 0 }], timing);
        view.style.transformOrigin = '0 0';
        view.animate([{ transform: bayBox, opacity: 0.2 }, { transform: 'none', opacity: 1 }], timing).finished.then(done, done);
    }

    function exitBay() {
        if (!openBay) return;
        const bayNode = document.querySelector(`.bay[data-bay="${openBay}"]`);
        const hub = $('hub');
        const view = $('moduleView');
        hub.hidden = false;
        const done = () => {
            view.hidden = true;
            openBay = null;
            bayNode.focus({ preventScroll: true });
        };
        if (reducedMotion()) return done();
        const { bayBox, origin, roomScale } = zoomFrames(bayNode);
        const timing = { duration: 460, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' };
        hub.style.transformOrigin = origin;
        hub.animate([{ transform: `scale(${roomScale})`, opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], timing);
        view.animate([{ transform: 'none', opacity: 1 }, { transform: bayBox, opacity: 0 }], timing).finished.then(done, done);
    }

    function renderHub() {
        for (const node of document.querySelectorAll('.bay')) {
            const id = node.dataset.bay;
            const unlocked = bayUnlocked(id);
            node.classList.toggle('locked', !unlocked);
            node.classList.toggle('offline', unlocked && !BAYS[id].built);
            node.setAttribute('aria-disabled', String(!unlocked));
            node.setAttribute('aria-label', `${BAYS[id].name}: ${bayStatus(id)}`);
        }
        $('bayTrainingMeter').style.width = `${Math.round(state.path.best * 100)}%`;
    }

    // ---- Training Path ---------------------------------------------------

    // Physics lives in training-path.js; the engine settles each roll (XP, records, skills).
    // This section runs rolls, follows the ball with the camera and draws the trail. It only
    // simulates while the panel is on screen.
    const T = window.TrainingPath;
    const PAD_X = 16;
    const PAD_TOP = 34;
    const PAD_BOTTOM = 26;
    const BALL = 7;
    const RESULT_PAUSE = 1.3;   // seconds to show a finished roll before the next one
    const OVERVIEW_SECONDS = 3; // how long the camera stays zoomed out after learning a skill
    const path = {
        roll: null,
        rollKey: '',
        stateRef: null,
        pause: 0,
        overview: 0,
        glow: null,             // { skill, age }: the skill hill just learned, briefly lit up
        pushFlash: 0,
        cam: null,              // smoothed { left, right }
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,
        visible: false,
        frame: 0,
        last: 0,
        colors: {}
    };

    // The roll waiting at the checkpoint (or in progress). Until launch it is rebuilt whenever
    // the run, stretch, seed or training upgrades change, so what you see is what you launch.
    function currentRoll() {
        const d = E.derive(state, debugRates);
        const key = [state.stats.runStart, state.path.learned, E.rollSeed(state), d.pushesPerRoll, d.pushCooldown].join(':');
        const stale = !path.roll || path.stateRef !== state || path.roll.over || (!path.roll.launched && path.rollKey !== key);
        if (stale && path.pause <= 0) {
            path.roll = T.createRoll(state.path.learned, E.rollSeed(state), { pushes: d.pushesPerRoll, cooldown: d.pushCooldown });
            path.rollKey = key;
            if (path.stateRef !== state) path.cam = null;
            path.stateRef = state;
        }
        return path.roll;
    }

    function buildPath() {
        const canvas = $('pathCanvas');
        path.canvas = canvas;
        path.ctx = canvas.getContext('2d');
        const css = getComputedStyle(document.documentElement);
        for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'muted', 'border', 'text', 'bg']) {
            path.colors[name] = css.getPropertyValue('--' + name).trim();
        }

        new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1;
            path.width = canvas.clientWidth;
            path.height = Math.round(Math.min(340, Math.max(220, path.width * 0.42)));
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
        $('pushButton').addEventListener('click', () => pushBall());
    }

    // The first push launches the roll (and pays for it); later pushes spend the roll's pushes.
    function pushBall(auto) {
        const roll = currentRoll();
        if (roll.over || roll.pushesLeft <= 0 || roll.ball.cooldown > 0) return false;
        if (!roll.launched) {
            if (!E.payRoll(state)) {
                if (!auto) setText($('pathStatus'), `A training roll costs ${E.formatCost(E.rollCost(state))}.`);
                return false;
            }
            path.overview = 0;
        }
        roll.push(E.derive(state, debugRates).pushPower);
        path.pushFlash = 0.35;
        setText($('pathStatus'), '');
        render();
        startPathLoop();
        return true;
    }

    // Auto-Trainer: level 1 launches rolls and pushes when the ball stops; level 2 also
    // rescues the ball as it stalls on a slope.
    function autoTrain(roll) {
        const lvl = E.level(state, 'autoTrainer');
        if (!lvl || roll.over || path.pause > 0 || roll.ball.cooldown > 0) return;
        const stalling = roll.ball.v > 0 && roll.ball.v < 0.5 && roll.ground.slope(roll.ball.x) > 0.05;
        if (!roll.launched || roll.atRest || (lvl >= 2 && stalling)) pushBall(true);
    }

    function startPathLoop() {
        if (path.frame || !path.canvas || openBay !== 'training') return;
        path.last = performance.now();
        path.frame = requestAnimationFrame(pathFrame);
    }

    function pathFrame(now) {
        path.frame = 0;
        const dt = Math.min(0.1, (now - path.last) / 1000);
        path.last = now;
        const running = path.visible && !document.hidden;
        if (running) {
            if (path.pause > 0) path.pause -= dt;
            const roll = currentRoll();
            autoTrain(roll);
            for (const ev of roll.step(dt)) finishRoll(ev);
        }
        if (path.overview > 0) path.overview -= dt;
        if (path.glow && (path.glow.age += dt) > 2.5) path.glow = null;
        path.pushFlash = Math.max(0, path.pushFlash - dt);
        drawPath(dt);
        updatePathControls();
        const roll = path.roll;
        const busy = roll && roll.launched && !roll.over;
        const animating = busy || path.pause > 0 || path.overview > 0 || path.glow || path.pushFlash || cameraMoving()
            || E.level(state, 'autoTrainer') > 0;
        if (running && animating) path.frame = requestAnimationFrame(pathFrame);
    }

    function finishRoll(ev) {
        const crested = ev.type === 'crest';
        const target = E.skillAt(state.path.learned).name;
        const result = E.finishRoll(state, ev.progress, crested);
        path.pause = RESULT_PAUSE;
        if (result.skill) {
            const grants = Object.entries(result.skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
            log(`Learned ${result.skill.name}: ${result.skill.effect} (${grants}, +${E.format(result.xp)} XP).`, 'special');
            toast('Skill learned', result.skill.name);
            path.glow = { skill: state.path.learned - 1, age: 0 };
            path.pause = 0.6;
            path.overview = OVERVIEW_SECONDS + path.pause;
        } else {
            const pct = Math.round(ev.progress * 100);
            log(`Roll ${state.stats.rolls}: ${pct}% of the way to ${target} (+${E.format(result.xp, 1)} XP)${result.record ? '. New record!' : '.'}`,
                result.record ? 'success' : 'info');
        }
        afterChange();
    }

    function updatePathControls() {
        const roll = path.roll;
        const button = $('pushButton');
        if (!roll) return;
        const label = !roll.launched ? `Launch (${E.formatCost(E.rollCost(state))})`
            : roll.over ? 'Next roll…'
            : `Push (${roll.pushesLeft} left)`;
        setText(button, label);
        const blocked = roll.over || path.pause > 0 || roll.pushesLeft <= 0 || roll.ball.cooldown > 0
            || (!roll.launched && !E.canAfford(state, E.rollCost(state)));
        setDisabled(button, blocked);
    }

    // Ground height anywhere: the live roll's terrain on the current stretch; earlier stretches show
    // only their (fixed) skill hills, since their rolling hills were different every roll.
    function groundAt(roll, x) {
        const k = roll.ground.stretch;
        if (x >= (k > 0 ? T.skillHill(k - 1).start : -1)) return roll.ground.height(x);
        if (x < 0) return Math.min(10 * T.skillHeight(0), 40 * x * x);
        for (let j = 0; j < k; j++) {
            const h = T.skillHill(j);
            if (x >= h.start && x <= h.end) {
                const c = Math.cos((Math.PI / 2) * (x - h.peak) / h.halfWidth);
                return h.height * c * c;
            }
        }
        return 0;
    }

    // Following: a window around the ball, sized to show a few hills ahead.
    // Overview (after learning a skill): the whole journey from the start to the next skill hill.
    function cameraTarget(roll) {
        const g = roll.ground;
        if (path.overview > 0) return { left: -0.3, right: g.goal.end + 0.3 };
        const span = g.goal.end - g.start;
        const view = Math.min(span + 0.6, Math.max(3, span * 0.4));
        const left = Math.max(g.start - 0.4, roll.ball.x - view * 0.3);
        return { left, right: left + view };
    }

    function cameraMoving() {
        if (!path.roll || !path.cam) return true;
        const t = cameraTarget(path.roll);
        const width = t.right - t.left;
        return Math.abs(path.cam.left - t.left) > width * 0.002 || Math.abs(path.cam.right - t.right) > width * 0.002
            || Math.abs((path.cam.top || 0) - (path.cam.topTarget || 0)) > (path.cam.topTarget || 1) * 0.01;
    }

    function drawPath(dt = 0) {
        const { ctx, width: w, height: h, colors: c } = path;
        if (!ctx || !w || !state || openBay !== 'training') return;
        const roll = currentRoll();
        const g = roll.ground;
        const target = cameraTarget(roll);
        if (!path.cam) path.cam = { ...target };
        const ease = Math.min(1, dt * (path.overview > 0 ? 2.2 : 5));
        path.cam.left += (target.left - path.cam.left) * ease;
        path.cam.right += (target.right - path.cam.right) * ease;
        const cam = path.cam;
        const goal = g.goal;

        // Sample the ground across the view. The vertical scale fits the tallest thing in view
        // (eased), so rolling hills read clearly and the skill hill dwarfs them when it arrives.
        const n = Math.min(1400, Math.max(300, Math.round(w * 1.5)));
        const samples = [];
        let tallest = goal.height * 0.12;
        for (let i = 0; i <= n; i++) {
            const x = cam.left + (cam.right - cam.left) * i / n;
            const y = x > goal.end ? 0 : groundAt(roll, x);
            if (x > -0.05) tallest = Math.max(tallest, y);
            samples.push([x, y]);
        }
        const topTarget = tallest * 1.45;
        cam.topTarget = topTarget;
        if (!cam.top) cam.top = topTarget;
        cam.top += (topTarget - cam.top) * Math.min(1, dt * 3);
        const top = cam.top;
        const X = x => PAD_X + (x - cam.left) / (cam.right - cam.left) * (w - PAD_X * 2);
        const Y = y => h - PAD_BOTTOM - Math.min(y, top * 1.3) / top * (h - PAD_TOP - PAD_BOTTOM);
        const pts = samples.map(([x, y]) => [X(x), Y(y), x]);

        ctx.clearRect(0, 0, w, h);
        const fill = ctx.createLinearGradient(0, PAD_TOP, 0, h);
        fill.addColorStop(0, hexAlpha(c.secondary, 0.4));
        fill.addColorStop(1, hexAlpha(c.secondary, 0.06));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], h);
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.lineTo(pts[pts.length - 1][0], h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = hexAlpha(c.secondary, 0.35);
        ctx.lineWidth = 1;
        for (let y = h - PAD_BOTTOM - 10; y > PAD_TOP - 40; y -= 11) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();

        const stroke = (from, to, color, width = 2.5) => {
            ctx.beginPath();
            let started = false;
            for (const [px, py, x] of pts) {
                if (x < from || x > to) continue;
                started ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                started = true;
            }
            ctx.lineWidth = width;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        const travelled = roll.launched ? roll.ball.maxX : g.start;
        stroke(-Infinity, Math.min(travelled, goal.start), c.success);
        stroke(travelled, goal.start, hexAlpha(c.text, 0.55));
        stroke(goal.start, goal.end, c.warning, 3);
        stroke(goal.end, Infinity, hexAlpha(c.muted, 0.35));
        if (path.glow) {
            const lh = T.skillHill(path.glow.skill);
            ctx.save();
            ctx.shadowColor = c.success;
            ctx.shadowBlur = 18;
            ctx.globalAlpha = 1 - path.glow.age / 2.5;
            stroke(lh.start, lh.end, c.success, 6);
            ctx.restore();
        }

        // Learned skill hills: a marker and name on each crest that is in view and wide enough.
        ctx.textAlign = 'center';
        ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
        for (let j = 0; j < g.stretch; j++) {
            const sh = T.skillHill(j);
            if (sh.end < cam.left || sh.start > cam.right) continue;
            const px = X(sh.peak);
            const py = Y(sh.height);
            ctx.fillStyle = c.success;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
            if (X(sh.end) - X(sh.start) > 70) ctx.fillText(E.skillAt(j).name, px, py - 8);
        }

        // Record flag: the furthest any roll has reached on this stretch.
        if (state.path.best > 0) {
            const fx = g.start + state.path.best * (goal.peak - g.start);
            if (fx >= cam.left && fx <= cam.right) {
                const fy = Y(groundAt(roll, fx));
                ctx.strokeStyle = c.accent;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(fx), fy);
                ctx.lineTo(X(fx), fy - 22);
                ctx.stroke();
                ctx.fillStyle = c.accent;
                ctx.beginPath();
                ctx.moveTo(X(fx), fy - 22);
                ctx.lineTo(X(fx) + 10, fy - 18);
                ctx.lineTo(X(fx), fy - 14);
                ctx.fill();
            }
        }

        // Summit flag on the skill hill.
        if (X(goal.peak) >= 0 && X(goal.peak) <= w) {
            const px = X(goal.peak);
            const py = Y(goal.height);
            ctx.strokeStyle = c.warning;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px, py - 26);
            ctx.stroke();
            ctx.fillStyle = c.warning;
            ctx.beginPath();
            ctx.moveTo(px, py - 26);
            ctx.lineTo(px + 13, py - 21);
            ctx.lineTo(px, py - 16);
            ctx.fill();
        }

        // Skill hill label, kept on screen as an arrow when the hill is still ahead of the view.
        const skillName = E.skillAt(g.stretch).name;
        ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
        ctx.fillStyle = c.warning;
        if (X(goal.peak) <= w - PAD_X) {
            ctx.fillText(skillName, Math.min(w - 70, Math.max(70, X(goal.peak))), Math.max(16, Y(goal.height) - 34));
        } else {
            const ahead = goal.start - roll.ball.x;
            ctx.textAlign = 'right';
            ctx.fillText(`${skillName} →`, w - PAD_X, 16);
            ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = hexAlpha(c.warning, 0.75);
            ctx.fillText(`${ahead.toFixed(1)} m ahead`, w - PAD_X, 30);
        }

        // Ball. Ring: green while rolling forward, red while rolling back.
        const bx = X(roll.ball.x);
        const by = Y(groundAt(roll, roll.ball.x)) - BALL;
        if (path.pushFlash > 0) {
            ctx.fillStyle = hexAlpha(c.warning, path.pushFlash);
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 4 + 10 * (0.35 - path.pushFlash) / 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.arc(bx, by, BALL, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = roll.ball.v > 0.05 ? c.success : roll.ball.v < -0.05 ? c.danger : c.primary;
        ctx.stroke();

        // HUD: pushes left as pips and the cooldown as a bar under them.
        const pips = roll.pushesLeft;
        ctx.textAlign = 'left';
        for (let i = 0; i < E.derive(state).pushesPerRoll; i++) {
            ctx.beginPath();
            ctx.arc(PAD_X + 6 + i * 16, 14, 5, 0, Math.PI * 2);
            ctx.fillStyle = i < pips ? c.warning : hexAlpha(c.muted, 0.3);
            ctx.fill();
        }
        if (roll.ball.cooldown > 0) {
            const cd = E.derive(state).pushCooldown;
            ctx.fillStyle = hexAlpha(c.warning, 0.8);
            ctx.fillRect(PAD_X, 23, (1 - roll.ball.cooldown / cd) * 60, 3);
        }

        // Progress strip: checkpoint → skill hill, with the ball and the record.
        const sy = h - 9;
        const sx0 = PAD_X;
        const sx1 = w - PAD_X;
        ctx.fillStyle = hexAlpha(c.muted, 0.25);
        ctx.fillRect(sx0, sy - 1.5, sx1 - sx0, 3);
        ctx.fillStyle = c.success;
        ctx.fillRect(sx0, sy - 1.5, (sx1 - sx0) * roll.progress, 3);
        if (state.path.best > 0) {
            ctx.fillStyle = c.accent;
            ctx.fillRect(sx0 + (sx1 - sx0) * state.path.best - 1, sy - 5, 2, 10);
        }
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.arc(sx0 + (sx1 - sx0) * g.progress(roll.ball.x), sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c.warning;
        ctx.fillRect(sx1 - 2, sy - 5, 2, 10);

        if (path.overview > 0) {
            ctx.textAlign = 'center';
            ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
            ctx.fillStyle = hexAlpha(c.success, Math.min(1, path.overview));
            ctx.fillText(`${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned`, w / 2, 18);
        }
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
        buildJournal();
        buildHub();
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
            // Wipe the save and start a brand-new game, no questions asked.
            startOver() {
                state = E.defaultState(Date.now());
                path.roll = null;
                resetView();
                save();
                $('gameLog').replaceChildren();
                log('Started over (debug).', 'warning');
                afterChange();
            },
            // Learn the next skill instantly; the next roll starts at the new checkpoint.
            learnSkill() {
                E.learnSkill(state, state.path.learned);
                path.roll = null;
                path.overview = OVERVIEW_SECONDS;
                afterChange();
                startPathLoop();
            },
            roll: () => {
                const r = currentRoll();
                return { stretch: r.ground.stretch, x: r.ball.x, v: r.ball.v, launched: r.launched, over: r.over,
                    pushesLeft: r.pushesLeft, cooldown: r.ball.cooldown, atRest: r.atRest, progress: r.progress,
                    slope: r.ground.slope(r.ball.x) };
            },
            simulate(seconds) {
                E.tick(state, seconds, debugRates);
                afterChange();
            },
            log
        }
    };
})();
