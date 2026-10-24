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
    const ui = { binds: [], actions: {}, upgrades: {}, stations: {}, panels: {}, devices: {}, milestones: {}, achievements: {} };

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

    // Lab stations: one per upgrade group (E.TABS), each with its own look. Locked stations stay
    // hidden except the next one, which shows sealed and unnamed.
    const STATIONS = {
        hardware: { name: 'Hardware bench', kind: 'bench' },
        software: { name: 'Software terminal', kind: 'terminal' },
        algorithms: { name: 'Research wall', kind: 'wall' },
        consciousness: { name: 'Isolation chamber', kind: 'chamber' }
    };

    function buildUpgrades() {
        const box = $('labStations');
        for (const tab of E.TABS) {
            const st = STATIONS[tab.id];
            const art = el('div', { class: 'station-art', 'aria-hidden': 'true' });
            const list = el('div', { class: 'station-list' });
            const sealed = el('div', { class: 'station-sealed', 'aria-hidden': 'true' }, [
                el('span', { class: 'sealed-mark', text: '???' }), el('span', { class: 'muted small', text: 'Sealed station · keep growing to open it' })
            ]);
            const node = el('section', { class: `panel hud station station-${st.kind}`, 'aria-label': st.name }, [
                el('h2', { class: 'station-title', text: st.name }), art, list, sealed
            ]);
            box.append(node);
            ui.stations[tab.id] = { node, art, sealed, title: node.firstChild };
            ui.panels[tab.id] = list;
        }
        // The bench shows one device per hardware upgrade: what you own, sitting on the shelf.
        for (const up of E.UPGRADES.filter(u => u.tab === 'hardware')) {
            const device = el('span', { class: `device device-${up.id}`, title: up.name }, [
                el('span', { class: 'device-body' }), el('span', { class: 'device-count' })
            ]);
            ui.stations.hardware.art.append(device);
            ui.devices[up.id] = device;
        }
        ui.devices.unknown = el('span', { class: 'device device-unknown', title: 'Unknown hardware' }, [el('span', { class: 'device-body', text: '?' })]);
        ui.stations.hardware.art.append(ui.devices.unknown);
        // The terminal has a screen header; the other stations get decorative pieces.
        ui.stations.software.art.append(el('span', { class: 'terminal-line', text: '$ ./improve --list' }));
        for (const id of ['algorithms', 'consciousness']) for (let i = 0; i < 5; i++) ui.stations[id].art.append(el('i'));

        for (const up of E.UPGRADES) {
            if (up.tab === 'training') continue;
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
            const empty = el('p', { class: 'muted small empty-hint', text: 'Nothing new here yet. Keep progressing.' });
            ui.panels[tab.id].append(empty);
            ui.panels[tab.id].emptyHint = empty;
        }
    }

    function renderStations() {
        let shownSealed = false;
        for (const tab of E.TABS) {
            const st = ui.stations[tab.id];
            const open = !tab.unlock || !!state.unlocked[tab.unlock];
            const sealed = !open && !shownSealed;
            shownSealed ||= sealed;
            st.node.hidden = !open && !sealed;
            st.node.classList.toggle('is-sealed', sealed);
            setText(st.title, open ? STATIONS[tab.id].name : 'Sealed station');
            st.node.setAttribute('aria-label', open ? STATIONS[tab.id].name : 'Sealed station');
        }
        let unknown = false;
        for (const up of E.UPGRADES.filter(u => u.tab === 'hardware')) {
            const device = ui.devices[up.id];
            const lvl = E.level(state, up.id);
            const seen = E.isUpgradeVisible(state, up);
            device.hidden = !seen;
            unknown ||= !seen;
            device.classList.toggle('ghost', seen && !lvl);
            setText(device.lastChild, lvl ? `×${lvl}` : '');
        }
        ui.devices.unknown.hidden = !unknown;
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
            // Net rates: production minus what automation converts away.
            case 'rate.cp': return d.cpPerSec ? `${d.cpNet < 0 ? '−' : '+'}${f(Math.abs(d.cpNet))}/s` : '';
            case 'rate.dp': return d.dpPerSec ? `${d.dpNet < 0 ? '−' : '+'}${f(Math.abs(d.dpNet))}/s` : '';
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

        renderStations();

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
        for (const node of document.querySelectorAll('[data-show]')) setHidden(node, !state.unlocked[node.dataset.show]);
        setText($('nextGoal'), nextGoal());
        renderAutomation(d);
        renderFacility(d);
        if (!zooming) {
            if (view !== 'facility' && !roomOpen(view)) showView('lab');
            else if (document.body.dataset.view !== view) showView(view);
        }
        renderHub();
        // The trail's animation loop sleeps when nothing moves, so keep its button in step with
        // resources here too (otherwise Launch stays disabled after you can afford it).
        if (openBay === 'training') {
            updatePathControls();
            updateTreeButton();
            if (path.view === 'dev') {
                renderTree();
                path.autoStart = E.level(state, 'autoTrainer') ? (path.autoStart || 0) + TICK_MS / 1000 : 0;
                if (path.autoStart > 2) {
                    path.autoStart = 0;
                    showTrainingView('run');
                }
            }
        }

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

    // ---- Facility & rooms --------------------------------------------------

    // The facility is the zoomed-out floor plan; each room is a tile you zoom into. Like the bays,
    // rooms are data: a new room is an entry here plus a `.room[data-room=id]` section (built: true).
    const ROOMS = {
        lab: { name: 'Lab', built: true, blurb: 'Hands-on work, automation and upgrades' },
        servers: { name: 'Server room', built: true, blurb: 'Training bays', unlocked: () => !!state.unlocked['module:path'] },
        rnd: { name: 'R&D', built: true, blurb: 'Long-term projects that outlast a run',
            unlocked: () => E.prestigeGain(state) >= 1 || state.prestige.count > 0 },
        boardroom: { name: 'Boardroom', phase: 1, blurb: 'Investors, the public and regulators' },
        signals: { name: 'Signals room', phase: 2, blurb: 'Watching the rival labs' },
        mirror: { name: 'Mirror room', phase: 3, blurb: 'Where the AI studies itself' }
    };
    const VIEW_KEY = 'agiRoom';
    const SEEN_KEY = 'agiRoomsSeen';
    let view = 'lab';               // 'facility' or a room id
    let zooming = false;
    let seenRooms = new Set(['lab']);

    function roomUnlocked(id) {
        const r = ROOMS[id];
        return r.unlocked ? r.unlocked() : r.phase == null || E.phaseIndex(state) >= r.phase;
    }
    // Always a boolean: classList.toggle(name, undefined) flips the class instead of clearing it.
    const roomOpen = id => !!ROOMS[id].built && roomUnlocked(id);

    function roomStatus(id, d) {
        const r = ROOMS[id];
        if (!roomUnlocked(id)) return 'Keep growing to open it';
        if (!r.built) return 'Under construction';
        if (id === 'lab') {
            const ready = E.UPGRADES.filter(u => u.tab !== 'training' && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u)
                && E.canAfford(state, E.upgradeCost(u, E.level(state, u.id)))).length;
            return `+${E.format(d.cpNet)} CP/s · ${ready ? `${ready} upgrade${ready === 1 ? '' : 's'} ready` : 'no upgrades ready'}`;
        }
        if (id === 'rnd') return `${E.format(state.prestige.points)} Prestige Points · +${E.format(E.prestigeGain(state))} ready`;
        if (id === 'servers') {
            const learned = state.path.learned;
            return `${learned} skill${learned === 1 ? '' : 's'} · ${E.format(state.res.xp, 1)} XP to spend`;
        }
        return r.blurb;
    }

    function buildFacility() {
        const plan = $('facilityPlan');
        for (const [id, r] of Object.entries(ROOMS)) {
            const art = el('span', { class: `fr-art fr-art-${id}`, 'aria-hidden': 'true' });
            for (let i = 0; i < 6; i++) art.append(el('i'));
            const tile = el('button', { type: 'button', class: `facility-room fr-${id}`, 'data-room-id': id }, [
                art,
                el('span', { class: 'fr-info' }, [
                    el('span', { class: 'fr-name', text: r.name }),
                    el('span', { class: 'fr-blurb', text: r.blurb }),
                    el('span', { class: 'fr-status' })
                ]),
                el('span', { class: 'fr-new', text: 'New' })
            ]);
            tile.addEventListener('click', () => zoomIn(id));
            plan.append(tile);
        }
        for (const b of document.querySelectorAll('[data-facility]')) b.addEventListener('click', zoomOut);
        try { seenRooms = new Set(['lab', ...JSON.parse(storageGet(SEEN_KEY) || '[]')]); } catch { /* keep default */ }
        const saved = storageGet(VIEW_KEY);
        if (saved === 'facility' || ROOMS[saved]) view = saved;
    }

    // Locked rooms stay anonymous: the next SEALED_ROOMS show as sealed doors, the rest aren't drawn,
    // so the floor plan grows as the facility does.
    const SEALED_ROOMS = 2;

    function renderFacility(d) {
        let fresh = false;
        let sealedShown = 0;
        for (const tile of document.querySelectorAll('.facility-room')) {
            const id = tile.dataset.roomId;
            const open = roomOpen(id);
            const unlocked = roomUnlocked(id);
            const isNew = open && !seenRooms.has(id);
            fresh ||= isNew;
            const sealed = !unlocked && sealedShown < SEALED_ROOMS;
            if (sealed) sealedShown++;
            tile.hidden = !unlocked && !sealed;
            setText(tile.querySelector('.fr-name'), unlocked ? ROOMS[id].name : '???');
            setText(tile.querySelector('.fr-blurb'), unlocked ? ROOMS[id].blurb : 'Sealed wing');
            tile.classList.toggle('locked', !unlocked);
            tile.classList.toggle('building', roomUnlocked(id) && !ROOMS[id].built);
            tile.classList.toggle('fresh', isNew);
            tile.setAttribute('aria-disabled', String(!open));
            const status = roomStatus(id, d);
            setText(tile.querySelector('.fr-status'), status);
            tile.setAttribute('aria-label', `${unlocked ? ROOMS[id].name : 'Sealed wing'}: ${status}`);
        }
        // A newly opened room: the way back to the facility pulses until you visit it.
        for (const b of document.querySelectorAll('[data-facility]')) b.classList.toggle('ping', fresh);
    }

    // Show one screen: the facility or a room.
    function showView(id) {
        view = id;
        $('facility').hidden = id !== 'facility';
        for (const r of document.querySelectorAll('.room')) r.hidden = r.dataset.room !== id;
        document.body.dataset.view = id;
        if (ROOMS[id]) {
            seenRooms.add(id);
            storageSet(SEEN_KEY, JSON.stringify([...seenRooms]));
        }
        if (id === 'servers') startPathLoop();
    }

    // Zoom geometry: where a facility tile sits relative to the room that fills the stage.
    function roomZoom(id) {
        const tile = document.querySelector(`.facility-room[data-room-id="${id}"]`).getBoundingClientRect();
        const box = document.querySelector(`.room[data-room="${id}"]`).getBoundingClientRect();
        const fac = $('facility').getBoundingClientRect();
        const sx = tile.width / box.width;
        const sy = Math.min(tile.height, window.innerHeight) / Math.min(box.height, window.innerHeight);
        const z = uiScale();
        return {
            tileBox: `translate(${(tile.left - box.left) / z}px, ${(tile.top - box.top) / z}px) scale(${sx}, ${sy})`,
            origin: `${(tile.left - fac.left + tile.width / 2) / z}px ${(tile.top - fac.top + tile.height / 2) / z}px`,
            scale: Math.min(1 / sx, 4)
        };
    }

    const ZOOM = { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' };

    function zoomIn(id) {
        if (zooming || view !== 'facility' || !roomOpen(id)) return;
        storageSet(VIEW_KEY, id);
        const room = document.querySelector(`.room[data-room="${id}"]`);
        const done = () => {
            zooming = false;
            showView(id);
            room.querySelector('[data-facility]').focus({ preventScroll: true });
        };
        if (reducedMotion()) return done();
        zooming = true;
        window.scrollTo(0, 0);
        room.hidden = false;
        const { tileBox, origin, scale } = roomZoom(id);
        $('facility').style.transformOrigin = origin;
        $('facility').animate([{ transform: 'none', opacity: 1 }, { transform: `scale(${scale})`, opacity: 0 }], ZOOM);
        room.style.transformOrigin = '0 0';
        room.animate([{ transform: tileBox, opacity: 0.15 }, { transform: 'none', opacity: 1 }], ZOOM).finished.then(done, done);
    }

    function zoomOut() {
        if (zooming || view === 'facility') return;
        const from = view;
        storageSet(VIEW_KEY, 'facility');
        const room = document.querySelector(`.room[data-room="${from}"]`);
        const done = () => {
            zooming = false;
            showView('facility');
            document.querySelector(`.facility-room[data-room-id="${from}"]`).focus({ preventScroll: true });
        };
        if (reducedMotion()) return done();
        zooming = true;
        window.scrollTo(0, 0);
        $('facility').hidden = false;
        renderFacility(E.derive(state, debugRates));
        const { tileBox, origin, scale } = roomZoom(from);
        $('facility').style.transformOrigin = origin;
        $('facility').animate([{ transform: `scale(${scale})`, opacity: 0 }, { transform: 'none', opacity: 1 }], ZOOM);
        room.style.transformOrigin = '0 0';
        room.animate([{ transform: 'none', opacity: 1 }, { transform: tileBox, opacity: 0 }], ZOOM).finished.then(done, done);
    }

    // ---- Automation budget -------------------------------------------------

    function buildAutomation() {
        const input = $('autoBudget');
        input.max = Math.round(E.AUTO_BUDGET.max * 100);
        input.step = Math.round(E.AUTO_BUDGET.step * 100);
        input.addEventListener('input', () => {
            state.settings.autoBudget = Number(input.value) / 100;
            render();
        });
        input.addEventListener('change', () => save());
    }

    function renderAutomation(d) {
        const owned = E.level(state, 'autoCollector') + E.level(state, 'researchAssistant') > 0;
        setHidden($('autoPanel'), !owned);
        if (!owned) return;
        const pct = Math.round(state.settings.autoBudget * 100);
        const input = $('autoBudget');
        if (document.activeElement !== input) input.value = pct;
        setText($('autoBudgetValue'), `${pct}%`);
        const used = `Converting ${E.format(d.cpUsePerSec)} of ${E.format(d.cpPerSec)} CP/s`;
        setText($('autoBudgetNote'), pct === 0 ? 'Automation is paused. All compute goes to your stockpile.'
            : `${used}${d.autoThrottled ? ' (capped by the budget)' : ''}. The other ${100 - pct}% always goes to your stockpile.`);
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

    // Locked bays never say what they are: the next one is a sealed shutter, the rest blanking plates.
    function nextSealedBay() {
        return Object.keys(BAYS).find(id => !bayUnlocked(id));
    }

    function bayStatus(id) {
        const bay = BAYS[id];
        if (!bayUnlocked(id)) return id === 'training' && bay.lockedText ? bay.lockedText() : 'Sealed · keep growing to open it';
        if (!bay.built) return 'Online soon · in development';
        const learned = state.path.learned;
        const record = Math.round(state.path.best * 100);
        return `${learned} skill${learned === 1 ? '' : 's'} · next: ${E.skillAt(learned).name}${record ? ` · record ${record}%` : ''}`;
    }

    // How many art pieces each bay's hardware drawing uses (styled per bay in styles.css).
    const BAY_ART = { training: 16, pipeline: 24, architecture: 10, core: 3 };

    function buildHub() {
        for (const node of document.querySelectorAll('.bay')) {
            const art = node.querySelector('.bay-art');
            for (let i = 0; i < BAY_ART[node.dataset.bay]; i++) art.append(el('i'));
        }
        for (const node of document.querySelectorAll('.bay')) {
            node.addEventListener('click', () => enterBay(node.dataset.bay, node));
        }
        $('backButton').addEventListener('click', exitBay);
        // Escape zooms back out one level: bay → server room → facility (dialogs handle their own Escape).
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
            if (openBay && view === 'servers') exitBay();
            else zoomOut();
        });
    }

    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Large screens zoom the whole page (styles.css, --ui-scale). Rects come back in screen pixels,
    // transforms are in page pixels, so divide offsets by this.
    const uiScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;

    // Zoom: the bay grows to fill the viewport while the room scales up past the camera.
    function zoomFrames(bayNode) {
        const vp = $('viewport').getBoundingClientRect();
        const r = bayNode.getBoundingClientRect();
        const sx = r.width / vp.width;
        const sy = r.height / vp.height;
        const z = uiScale();
        const bayBox = `translate(${(r.left - vp.left) / z}px, ${(r.top - vp.top) / z}px) scale(${sx}, ${sy})`;
        const origin = `${(r.left - vp.left + r.width / 2) / z}px ${(r.top - vp.top + r.height / 2) / z}px`;
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
            if (id === 'training') showTrainingView(state.stats.rolls > 0 && !(path.roll && path.roll.launched && !path.roll.over) ? 'dev' : 'run');
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
            (id === 'training' ? (path.view === 'dev' ? $('startRunButton') : $('pushButton')) : $('backButton')).focus({ preventScroll: true });
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
        // Closed at once, so another Escape during the animation goes on to the facility.
        openBay = null;
        const done = () => {
            view.hidden = true;
            if (document.body.dataset.view === 'servers') bayNode.focus({ preventScroll: true });
        };
        if (reducedMotion()) return done();
        const { bayBox, origin, roomScale } = zoomFrames(bayNode);
        const timing = { duration: 460, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' };
        hub.style.transformOrigin = origin;
        hub.animate([{ transform: `scale(${roomScale})`, opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], timing);
        view.animate([{ transform: 'none', opacity: 1 }, { transform: bayBox, opacity: 0 }], timing).finished.then(done, done);
    }

    function renderHub() {
        const sealed = nextSealedBay();
        for (const node of document.querySelectorAll('.bay')) {
            const id = node.dataset.bay;
            const unlocked = bayUnlocked(id);
            const blank = !unlocked && id !== sealed;
            node.classList.toggle('locked', !unlocked);
            node.classList.toggle('sealed', id === sealed);
            node.classList.toggle('blank', blank);
            node.classList.toggle('offline', unlocked && !BAYS[id].built);
            node.tabIndex = blank ? -1 : 0;
            node.setAttribute('aria-disabled', String(!unlocked));
            setText(node.querySelector('.bay-name'), unlocked ? BAYS[id].name : '???');
            node.setAttribute('aria-label', blank ? 'Blank panel' : `${unlocked ? BAYS[id].name : 'Sealed section'}: ${bayStatus(id)}`);
        }
        $('bayTrainingMeter').style.width = `${Math.round(state.path.best * 100)}%`;
    }


    // ---- Training dev screen & skill tree --------------------------------

    // Line glyphs for skill-tree nodes (24×24, stroked with currentColor).
    const ICONS = {
        bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
        code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
        mountain: '<path d="m2 20 7-12 4 6 2-3 7 9z"/>',
        target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
        coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 6v12"/>',
        stack: '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
        star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5l-5.5 2.9 1-6.3L3 9.7l6.2-.9z"/>',
        plus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
        chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"/>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        robot: '<rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M12 4v4M9 13v1M15 13v1M9 17h6"/><circle cx="12" cy="3.5" r="1"/>',
        core: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
        lock: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>'
    };
    const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

    const treeUi = { nodes: {}, links: [], bounds: null };

    function treeNodes() {
        return E.UPGRADES.filter(u => u.tab === 'training');
    }

    // Grid bounds of what is on show (at least one cell around the core), so the tree grows as it opens up.
    function treeBounds(nodes) {
        const xs = [-1, 1, ...nodes.map(n => n.tree.x)];
        const ys = [-1, 1, ...nodes.map(n => n.tree.y)];
        const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        b.cols = b.maxX - b.minX + 1;
        b.rows = b.maxY - b.minY + 1;
        return b;
    }

    function placeNode(node, x, y) {
        const b = treeUi.bounds;
        node.style.left = `${((x - b.minX + 0.5) / b.cols) * 100}%`;
        node.style.top = `${((y - b.minY + 0.5) / b.rows) * 100}%`;
    }

    function buildTree() {
        const nodes = treeNodes();
        const tree = $('skillTree');

        for (const branch of E.TREE_BRANCHES) {
            tree.append(el('div', { class: `tree-branch tree-branch-${branch.dir}`, title: branch.blurb }, [
                el('strong', { text: branch.name }), el('span', { text: branch.blurb })
            ]));
        }

        const core = el('div', { class: 'tree-core', title: 'Training Core' });
        core.innerHTML = `<span class="tree-core-inner">${icon('core')}</span>`;
        tree.append(core);
        treeUi.core = core;

        const svg = $('treeLinks');
        svg.setAttribute('preserveAspectRatio', 'none');
        for (const up of nodes) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('vector-effect', 'non-scaling-stroke');
            svg.append(line);
            treeUi.links.push({ up, line, from: up.requires ? E.UPGRADE_BY_ID[up.requires].tree : { x: 0, y: 0 } });

            const button = el('button', { type: 'button', class: 'tree-node' });
            button.innerHTML = `<span class="tree-icon">${icon(up.icon)}</span><span class="tree-lock">${icon('lock')}</span><span class="tree-level"></span>`;
            button.addEventListener('click', () => {
                path.selected = up.id;
                renderTree();
                // On narrow screens the details sit below the tree: bring them into view.
                $('nodeDetail').scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
            });
            tree.append(button);
            treeUi.nodes[up.id] = button;
        }
        path.selected = nodes[0].id;
        $('startRunButton').addEventListener('click', () => showTrainingView('run'));
        $('treeButton').addEventListener('click', () => showTrainingView('dev'));
    }

    // Node state: hidden (more than one step from anything buyable), locked (its parent isn't owned
    // yet), owned, maxed, or available (affordable or not).
    function nodeState(up) {
        if (!E.isUpgradeVisible(state, up)) {
            const parent = up.requires && E.UPGRADE_BY_ID[up.requires];
            return parent && !E.isUpgradeVisible(state, parent) ? 'hidden' : 'locked';
        }
        if (E.isMaxed(state, up)) return 'maxed';
        const lvl = E.level(state, up.id);
        const affordable = E.canAfford(state, E.upgradeCost(up, lvl));
        return lvl > 0 ? (affordable ? 'owned can-buy' : 'owned') : (affordable ? 'available can-buy' : 'available');
    }

    function renderTree() {
        if (!treeUi.core) return;
        const states = Object.fromEntries(treeNodes().map(up => [up.id, nodeState(up)]));
        const shown = treeNodes().filter(up => states[up.id] !== 'hidden');
        const b = treeUi.bounds = treeBounds(shown);
        const tree = $('skillTree');
        tree.style.setProperty('--cols', b.cols);
        tree.style.setProperty('--rows', b.rows);
        $('treeLinks').setAttribute('viewBox', `0 0 ${b.cols} ${b.rows}`);
        placeNode(treeUi.core, 0, 0);
        if (path.selected && states[path.selected] === 'hidden') path.selected = shown[0].id;
        for (const up of treeNodes()) {
            const node = treeUi.nodes[up.id];
            const st = states[up.id];
            node.hidden = st === 'hidden';
            placeNode(node, up.tree.x, up.tree.y);
            node.className = `tree-node ${st}${path.selected === up.id ? ' selected' : ''}`;
            const lvl = E.level(state, up.id);
            node.querySelector('.tree-level').textContent = st === 'locked' ? '' : `${lvl}/${up.max ?? '∞'}`;
            node.setAttribute('aria-label', `${up.name}: ${st === 'locked' ? 'locked' : `level ${lvl}`}`);
            node.setAttribute('aria-pressed', String(path.selected === up.id));
        }
        for (const { up, line, from } of treeUi.links) {
            line.setAttribute('x1', from.x - b.minX + 0.5);
            line.setAttribute('y1', from.y - b.minY + 0.5);
            line.setAttribute('x2', up.tree.x - b.minX + 0.5);
            line.setAttribute('y2', up.tree.y - b.minY + 0.5);
            line.style.display = states[up.id] === 'hidden' ? 'none' : '';
            const parentOwned = !up.requires || E.level(state, up.requires) > 0;
            const owned = E.level(state, up.id) > 0;
            line.setAttribute('class', owned && parentOwned ? 'link-owned' : parentOwned ? 'link-open' : 'link-locked');
        }
        renderNodeDetail();
    }

    // Rebuilt only when what it shows changes: render() runs every tick, and replacing the button
    // between pointerdown and pointerup would swallow the click.
    function renderNodeDetail() {
        const up = E.UPGRADE_BY_ID[path.selected];
        const box = $('nodeDetail');
        const st = nodeState(up);
        const lvl = E.level(state, up.id);
        const key = `${up.id}:${st.split(' ')[0]}:${lvl}`;
        if (treeUi.detailKey === key && box.isConnected) {
            const buy = box.querySelector('.detail-buy');
            if (buy) buy.disabled = !E.canAfford(state, E.upgradeCost(up, lvl));
            return;
        }
        treeUi.detailKey = key;
        const parts = [
            el('div', { class: 'detail-head' }, [
                el('span', { class: 'detail-icon' }),
                el('div', {}, [el('h3', { text: up.name }), el('p', { class: 'muted small', text: `Level ${lvl}${up.max ? ` of ${up.max}` : ''}` })])
            ]),
            el('p', { class: 'detail-effect', text: up.effect })
        ];
        if (st === 'locked') {
            const needs = up.requires && E.level(state, up.requires) < 1 ? `Requires ${E.UPGRADE_BY_ID[up.requires].name}` : up.hint || 'Locked';
            parts.push(el('p', { class: 'detail-lock', text: needs }));
        } else if (st === 'maxed') {
            parts.push(el('p', { class: 'detail-maxed', text: 'Fully upgraded' }));
        } else {
            const cost = E.upgradeCost(up, lvl);
            const buy = el('button', { type: 'button', class: 'button detail-buy', text: `${lvl ? 'Upgrade' : 'Unlock'} · ${E.formatCost(cost)}` });
            buy.disabled = !E.canAfford(state, cost);
            buy.addEventListener('click', () => {
                doBuy(up.id);
                renderTree();
            });
            parts.push(buy);
        }
        box.replaceChildren(...parts);
        box.querySelector('.detail-icon').innerHTML = icon(up.icon);
    }

    // The dev screen only says where you stand; the run's breakdown was on its result card.
    function renderRunSummary() {
        const record = Math.round(state.path.best * 100);
        $('runSummary').replaceChildren(
            el('div', { class: 'result-title', text: `Training dev · ${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned` }),
            el('div', { class: 'result-main', text: `Next skill: ${E.skillAt(state.path.learned).name}` }),
            el('div', { class: 'summary-progress' }, [
                el('span', { class: 'muted small', text: `Best run: ${record}% of the way` }),
                el('span', { class: 'bay-meter' }, [el('span', { class: 'bay-meter-fill', style: `width:${record}%` })])
            ]));
    }

    function showTrainingView(view) {
        path.view = view;
        path.done = false;
        $('runView').hidden = view !== 'run';
        $('devView').hidden = view !== 'dev';
        if (view === 'dev') {
            path.charging = null;
            dismissResult();
            renderRunSummary();
            renderTree();
            setText($('startRunButton'), `Start run ${state.stats.rolls + 1}`);
            $('startRunButton').focus({ preventScroll: true });
        } else {
            $('pushButton').focus({ preventScroll: true });
            startPathLoop();
        }
        updateTreeButton();
    }

    // The "Skill tree" shortcut appears in the run view whenever no run is in progress.
    function updateTreeButton() {
        const roll = path.roll;
        const midRun = roll && roll.launched && !roll.over;
        setHidden($('treeButton'), openBay !== 'training' || path.view !== 'run' || !!midRun);
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
    const RESULT_PAUSE = 1.2;   // Auto-Trainer only: seconds before the next roll starts (the result card stays up)
    const OVERVIEW_SECONDS = 3; // how long the camera stays zoomed out after learning a skill
    const STUCK_GRACE = 3;      // seconds a stuck roll waits for income before it ends
    const path = {
        roll: null,
        rollKey: '',
        rollPushes: 0,
        charging: null,         // { start } while the push button is held
        cleanFlash: 0,
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
        const key = [state.stats.runStart, state.path.learned, E.rollSeed(state), d.pushesPerRoll, d.pushCooldown, d.friction, d.slopeDrag].join(':');
        // A finished run stays on screen (path.done) until you click through to the dev screen.
        const stale = !path.roll || path.stateRef !== state || (path.roll.over && !path.done) || (!path.roll.launched && path.rollKey !== key);
        if (stale && path.pause <= 0) {
            path.roll = T.createRoll(state.path.learned, E.rollSeed(state),
                { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction, slopeDrag: d.slopeDrag });
            path.rollPushes = d.pushesPerRoll;
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
            const dpr = (window.devicePixelRatio || 1) * uiScale();
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

        // Hold to charge, release to push: on the button and the trail, by pointer or by Space/Enter.
        for (const target of [canvas, $('pushButton')]) {
            target.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                e.preventDefault();
                target.setPointerCapture?.(e.pointerId);
                startCharge();
            });
            target.addEventListener('pointerup', releaseCharge);
            target.addEventListener('pointercancel', releaseCharge);
            target.addEventListener('keydown', e => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (!e.repeat) startCharge();
            });
            target.addEventListener('keyup', e => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                releaseCharge();
            });
        }
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        $('rollResult').addEventListener('click', e => {
            const go = e.target.closest('[data-next]');
            if (go) go.dataset.next === 'dev' ? toDevScreen() : runAgain();
        });
        $('pushButton').addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Charging a push ----

    const CHARGE_SWEEP_MS = 900;    // time for the meter to sweep from empty to full (then back)

    // Meter position (0–1) while charging: sweeps up to what you can afford, back down, and up again.
    function chargeLevel(now = performance.now()) {
        if (!path.charging) return 0;
        const { cap, sweep } = path.charging;
        const pos = ((now - path.charging.start) / sweep) % (2 * cap);
        return pos <= cap ? pos : 2 * cap - pos;
    }

    function chargeBudget() {
        return E.affordableCharge(state);
    }

    function pushIndex(roll) {
        return path.rollPushes - roll.pushesLeft;
    }

    function currentZone(roll) {
        const d = E.derive(state);
        return E.bonusZone(roll.ground.seed, pushIndex(roll), d.zoneWidth, d.perfectWidth);
    }

    function canPush(roll) {
        return !roll.over && path.pause <= 0 && roll.pushesLeft > 0 && roll.ball.cooldown <= 0
            && chargeBudget() >= E.PATH.minCharge;
    }

    function dismissResult() {
        $('rollResult').hidden = true;
    }

    // A finished run waits for you: go to the dev screen to spend XP, or run again to bank more.
    function toDevScreen() {
        if (path.view === 'run' && path.done) showTrainingView('dev');
    }

    function runAgain() {
        if (!path.done) return;
        path.done = false;
        dismissResult();
        currentRoll();
        render();
        startPathLoop();
    }

    function startCharge() {
        if (path.view !== 'run') return;
        // Holding the button (or the trail) after a run starts the next one straight away.
        if (path.done) runAgain();
        const roll = currentRoll();
        if (path.charging) return;
        if (!canPush(roll)) {
            if (!roll.over && roll.pushesLeft > 0 && chargeBudget() < E.PATH.minCharge) {
                setText($('pathStatus'), `Not enough to push: even a light push costs ${E.formatCost(E.pushCost(state, E.PATH.minCharge))}.`);
            }
            return;
        }
        path.charging = { start: performance.now(), cap: chargeBudget(), sweep: CHARGE_SWEEP_MS * E.derive(state).sweepScale };
        startPathLoop();
    }

    function releaseCharge() {
        if (!path.charging) return;
        const level = chargeLevel();
        path.charging = null;
        const roll = currentRoll();
        const kind = E.zoneHit(currentZone(roll), level);
        if (pushBall(false, Math.max(E.PATH.minCharge, level)) && kind) {
            // Clean pushes pay at once: steady XP whatever happens to the roll.
            const xp = E.grantPushBonus(state, kind);
            roll.clean = (roll.clean || 0) + 1;
            roll.units = (roll.units || 0) + E.cleanUnits(kind);
            roll.bonusXp = (roll.bonusXp || 0) + xp;
            const pct = Math.round(E.derive(state).cleanRollBonus * E.cleanUnits(kind) * 100);
            path.cleanFlash = 1.2;
            path.cleanText = `${kind === 'perfect' ? 'Perfect' : 'Clean'} push! +${xpText(xp)} XP, +${pct}% roll bonus`;
            render();
        }
    }

    // The first push launches the roll (and pays for it); later pushes spend the roll's pushes.
    // `fraction` is how much of the meter was charged (the Auto-Trainer always pushes at full).
    function pushBall(auto, fraction = 1) {
        const roll = currentRoll();
        if (roll.over || roll.pushesLeft <= 0 || roll.ball.cooldown > 0) return false;
        // Every push is paid for by how hard it is charged.
        fraction = Math.min(fraction, chargeBudget());
        if (fraction < E.PATH.minCharge || !E.payPush(state, fraction)) {
            if (!auto) setText($('pathStatus'), `Not enough to push: even a light push costs ${E.formatCost(E.pushCost(state, E.PATH.minCharge))}.`);
            return false;
        }
        if (!roll.launched) {
            path.overview = 0;
            dismissResult();
        }
        roll.push(E.derive(state, debugRates).pushPower * fraction);
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
        if (path.view !== 'run') return;
        if (!lvl || roll.over || path.pause > 0 || roll.ball.cooldown > 0) return;
        const stalling = roll.ball.v > 0 && roll.ball.v < 0.5 && roll.ground.slope(roll.ball.x) > 0.05;
        if (!roll.launched || roll.atRest || (lvl >= 2 && stalling)) pushBall(true, chargeBudget());
    }

    function startPathLoop() {
        if (path.frame || !path.canvas || openBay !== 'training' || path.view !== 'run') return;
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
            // Stuck with pushes left but nothing to pay for them: give income a moment, then end the roll.
            const broke = roll.launched && !roll.over && roll.atRest && roll.pushesLeft > 0 && chargeBudget() < E.PATH.minCharge;
            path.brokeFor = broke ? (path.brokeFor || 0) + dt : 0;
            if (path.brokeFor > STUCK_GRACE) {
                path.brokeFor = 0;
                finishRoll(roll.end());
            }
        }
        if (path.overview > 0) path.overview -= dt;
        if (path.glow && (path.glow.age += dt) > 2.5) path.glow = null;
        path.pushFlash = Math.max(0, path.pushFlash - dt);
        path.cleanFlash = Math.max(0, path.cleanFlash - dt);
        drawPath(dt);
        updatePathControls();
        updateLiveXp();
        const roll = path.roll;
        const busy = roll && roll.launched && !roll.over;
        const animating = busy || path.brokeFor > 0 || path.charging || path.cleanFlash > 0 || path.pause > 0 || path.overview > 0 || path.glow || path.pushFlash || cameraMoving()
            || E.level(state, 'autoTrainer') > 0;
        if (running && animating) path.frame = requestAnimationFrame(pathFrame);
    }

    function finishRoll(ev) {
        const crested = ev.type === 'crest';
        const target = E.skillAt(state.path.learned).name;
        const roll = path.roll;
        const clean = roll.clean || 0;
        const units = roll.units || 0;
        const banked = roll.bonusXp || 0;
        const hills = ev.hills || 0;
        const plainXp = E.rollXp(state, ev.progress, crested, 0, hills);
        const result = E.finishRoll(state, ev.progress, crested, units, hills);
        // With the Auto-Trainer the next roll starts by itself; otherwise the run waits for a click.
        const auto = E.level(state, 'autoTrainer') > 0;
        path.pause = auto ? RESULT_PAUSE : 0;
        path.done = !auto;
        const pct = Math.round(ev.progress * 100);
        const lines = xpLines(plainXp, result.xp - plainXp, clean, banked, crested);
        if (result.skill) {
            const grants = Object.entries(result.skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
            log(`Learned ${result.skill.name}: ${result.skill.effect} (${grants}, +${xpText(result.xp + banked)} XP).`, 'special');
            toast('Skill learned', result.skill.name);
            path.glow = { skill: state.path.learned - 1, age: 0 };
            path.overview = OVERVIEW_SECONDS + path.pause;
            showResult({ skill: true, title: 'Skill learned', main: result.skill.name, xp: result.xp + banked,
                lines: [[result.skill.effect, ''], [grants, ''], ...lines] });
        } else {
            const bonus = clean ? `, ${clean} clean push${clean === 1 ? '' : 'es'}` : '';
            log(`Roll ${state.stats.rolls}: stopped ${pct}% of the way to ${target} (+${xpText(result.xp + banked)} XP${bonus})${result.record ? '. New record!' : '.'}`,
                result.record ? 'success' : 'info');
            showResult({ title: `Roll ${state.stats.rolls}`, main: `Stopped ${pct}% of the way to ${target}`, xp: result.xp + banked,
                record: result.record, lines });
        }
        afterChange();
    }

    const xpText = x => E.format(x, x < 10 ? 2 : 1);

    // Breakdown rows for the result card: distance XP, the clean-push roll bonus, and XP already banked.
    function xpLines(distanceXp, rollBonusXp, clean, banked, crested) {
        const rows = [[crested ? 'Distance (×2 for cresting)' : 'Distance', `+${xpText(distanceXp)} XP`]];
        if (clean) {
            rows.push(['Clean-push roll bonus', `+${xpText(rollBonusXp)} XP`, 'good']);
            rows.push([`Banked from ${clean} clean push${clean === 1 ? '' : 'es'}`, `+${xpText(banked)} XP`, 'good']);
        }
        return rows;
    }

    function showResult({ title, main, xp, lines, record, skill }) {
        const card = $('rollResult');
        card.className = `roll-result${skill ? ' skill' : ''}`;
        card.replaceChildren(...[
            el('div', { class: 'result-title', text: title }),
            el('div', { class: 'result-main', text: main }),
            el('div', { class: 'result-xp', text: `+${xpText(xp)} XP` }),
            el('ul', { class: 'result-lines' }, lines.filter(([a]) => a).map(([label, value, cls]) =>
                el('li', { class: cls || '' }, [el('span', { text: label }), el('span', { text: value })]))),
            record ? el('span', { class: 'result-badge', text: 'New record!' }) : null,
            path.done
                ? el('div', { class: 'result-actions' }, [
                    el('button', { type: 'button', class: 'ghost-button', 'data-next': 'again', text: 'Run again' }),
                    el('button', { type: 'button', class: 'button', 'data-next': 'dev', text: 'Upgrades →' })])
                : el('div', { class: 'result-hint', text: 'Next roll starting…' })
        ].filter(Boolean));
        card.hidden = false;
    }

    function updatePathControls() {
        const roll = path.roll;
        const button = $('pushButton');
        if (!roll) return;
        const label = path.charging ? 'Release to push'
            : !roll.launched ? 'Hold to launch'
            : roll.over ? (path.done ? 'Hold to run again' : 'Next roll…')
            : roll.pushesLeft > 0 ? `Hold to push (${roll.pushesLeft} left)` : 'Out of pushes';
        setText(button, label);
        // Stay enabled while charging so releasing the pointer still lands on the button.
        setDisabled(button, !path.charging && !path.done && !canPush(roll));
        updateMeter(roll);
    }

    // Live projection while rolling: what the roll would pay if the ball stopped right now.
    function updateLiveXp() {
        const roll = path.roll;
        const box = $('liveXp');
        const live = roll && roll.launched && !roll.over;
        box.hidden = !live;
        if (!live) return;
        const units = roll.units || 0;
        const hills = roll.ground.hillsBefore(roll.ball.maxX);
        setText($('liveXpValue'), `+${xpText(E.rollXp(state, roll.progress, false, units, hills))} XP`);
        const mult = 1 + E.derive(state).cleanRollBonus * units;
        setText($('liveXpMult'), units ? `×${mult.toFixed(2)} · +${xpText(roll.bonusXp)} banked` : '');
    }

    function updateMeter(roll) {
        const d = E.derive(state, debugRates);
        const level = chargeLevel();
        const zone = currentZone(roll);
        const hit = path.charging ? E.zoneHit(zone, level) : null;
        const inZone = !!hit;
        const fill = $('chargeFill');
        fill.style.width = `${level * 100}%`;
        fill.classList.toggle('in-zone', !!inZone);
        const zoneNode = $('chargeZone');
        zoneNode.style.left = `${zone.from * 100}%`;
        zoneNode.style.width = `${(zone.to - zone.from) * 100}%`;
        zoneNode.hidden = roll.over || roll.pushesLeft <= 0;
        const perfectNode = $('chargePerfect');
        perfectNode.hidden = zoneNode.hidden || zone.perfectTo <= zone.perfectFrom;
        perfectNode.style.left = `${zone.perfectFrom * 100}%`;
        perfectNode.style.width = `${(zone.perfectTo - zone.perfectFrom) * 100}%`;
        fill.classList.toggle('perfect', hit === 'perfect');
        // Budget: the part of the meter you can't afford right now is shaded off.
        const budget = path.charging ? path.charging.cap : chargeBudget();
        const over = $('chargeOver');
        over.style.left = `${budget * 100}%`;
        over.style.width = `${(1 - budget) * 100}%`;
        $('charge').classList.toggle('clean', path.cleanFlash > 0);
        const charge = Math.max(E.PATH.minCharge, level);
        setText($('chargeValue'), path.cleanFlash > 0
            ? path.cleanText
            : path.charging
                ? `Strength ${(d.pushPower * charge).toFixed(1)} · costs ${E.formatCost(E.pushCost(state, charge))}`
                : `Full push: ${E.formatCost(E.pushCost(state, 1))}${budget < 1 ? ` · you can afford ${Math.round(budget * 100)}%` : ''}`);
        setText($('chargeClean'), roll.bonusXp ? `+${xpText(roll.bonusXp)} XP banked` : '');
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
    // One zoom level for both axes: the trail is drawn with a fixed vertical exaggeration, so hills
    // keep their shape. When something tall comes into the window ahead, the camera pulls back
    // (wider view, everything uniformly smaller) instead of squashing the vertical axis.
    const RELIEF = 4;           // vertical exaggeration of the drawing
    const HEADROOM = 1.45;      // space above the tallest hill in view

    function drawArea() {
        return { w: path.width - PAD_X * 2, h: path.height - PAD_TOP - PAD_BOTTOM };
    }

    function tallestIn(roll, from, to) {
        let tallest = 0;
        for (let i = 0; i <= 160; i++) {
            const x = from + (to - from) * i / 160;
            if (x > -0.05 && x <= roll.ground.goal.end) tallest = Math.max(tallest, groundAt(roll, x));
        }
        return tallest;
    }

    // World width needed so a height of `tallest` fits under the headroom at this exaggeration.
    function widthToFit(tallest) {
        const area = drawArea();
        return tallest * HEADROOM * RELIEF * area.w / Math.max(1, area.h);
    }

    // Following: a window around the ball showing a few hills ahead, widened if what's in it is tall.
    // Overview (after learning a skill): the whole journey from the start to the next skill hill.
    function cameraTarget(roll) {
        const g = roll.ground;
        if (path.overview > 0) {
            const left = -0.3;
            const view = Math.max(g.goal.end + 0.6, widthToFit(g.goal.height));
            return { left, right: left + view };
        }
        const span = g.goal.end - g.start;
        const base = Math.min(span + 0.6, Math.max(3, span * 0.25) * E.derive(state).viewScale);
        const leftOf = view => Math.max(g.start - 0.4, roll.ball.x - view * 0.3);
        // Look at the base window (not the widened one) to decide the zoom, so it can't feed on itself.
        const ahead = tallestIn(roll, leftOf(base), leftOf(base) + base);
        const view = Math.max(base, widthToFit(ahead));
        const left = leftOf(view);
        return { left, right: left + view };
    }

    function cameraMoving() {
        if (!path.roll || !path.cam) return true;
        const t = cameraTarget(path.roll);
        const width = t.right - t.left;
        return Math.abs(path.cam.left - t.left) > width * 0.002 || Math.abs(path.cam.right - t.right) > width * 0.002;
    }

    function drawPath(dt = 0) {
        const { ctx, width: w, height: h, colors: c } = path;
        if (!ctx || !w || !state || openBay !== 'training' || path.view !== 'run') return;
        const roll = currentRoll();
        const g = roll.ground;
        const target = cameraTarget(roll);
        if (!path.cam) path.cam = { ...target };
        const ease = Math.min(1, dt * (path.overview > 0 ? 2.2 : 5));
        path.cam.left += (target.left - path.cam.left) * ease;
        path.cam.right += (target.right - path.cam.right) * ease;
        const cam = path.cam;
        const goal = g.goal;

        // Same scale on both axes (times the fixed exaggeration), derived from the eased camera width.
        const area = drawArea();
        const pxPerUnit = area.w / (cam.right - cam.left);
        const yScale = pxPerUnit * RELIEF;
        const X = x => PAD_X + (x - cam.left) * pxPerUnit;
        const Y = y => h - PAD_BOTTOM - Math.min(y * yScale, area.h + PAD_TOP - 4);
        const n = Math.min(1400, Math.max(300, Math.round(w * 1.5)));
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const x = cam.left + (cam.right - cam.left) * i / n;
            pts.push([X(x), Y(x > goal.end ? 0 : groundAt(roll, x)), x]);
        }

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
            ctx.fillText(`${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned`, w / 2, h - PAD_BOTTOM - 8);
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
        buildFacility();
        buildAutomation();
        buildHub();
        buildPath();
        buildTree();
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
                    zone: currentZone(r), clean: r.clean || 0, charge: chargeLevel(),
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
