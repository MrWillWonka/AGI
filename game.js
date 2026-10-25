// game.js — DOM layer: renders state from AGIEngine, wires input, runs the loop, persists saves.
window.AGI = (function () {
    'use strict';

    const E = window.AGIEngine;
    const SAVE_KEY = 'agiGame';
    const TICK_MS = 100;
    const AUTOSAVE_MS = 30000;
    const HOLD_REPEAT_MS = 400;       // holding a job repeats it at 2.5 clicks a second (a comfort option, not a turbo)
    const LOG_LIMIT = 60;

    let state;
    let lastTick = Date.now();
    let lastSave = Date.now();
    const debugRates = { cp: 1, dp: 1, rp: 1, xp: 1 };
    let debugSpeed = 1;         // debug: game speed (economy ticks and training physics)
    const ui = { binds: [], actions: {}, upgrades: {}, stations: {}, panels: {}, milestones: {}, achievements: {} };

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
        if (node.hidden === hidden) return;
        // Something new in the lab: remember where everything is first, so it can make room smoothly.
        if (!hidden && revealReady && node.closest?.('#labRoom') && view === 'lab') makeRoom();
        node.hidden = hidden;
        if (!hidden) revealIn(node);
    }

    // Making room (FLIP): when something appears in the lab, what's already there slides and resizes
    // from where it was to its new place (moving and pushing inward, never scaling its text), and only
    // then does the new section boot in. Snapshot before the change; play on the next frame.
    let roomBefore = null;
    let freshReveals = [];
    const MAKE_ROOM_MS = 750;
    function labMovers() {
        const room = $('labRoom');
        return [...room.querySelectorAll(':scope > .panel, .lab-stations > .station, .supply-cell, #actions > .action-button, .task')].filter(n => !n.hidden);
    }
    function makeRoom() {
        if (roomBefore || reducedMotion() || !revealReady) return;
        roomBefore = new Map(labMovers().map(n => [n, n.getBoundingClientRect()]));
        requestAnimationFrame(playMakeRoom);
    }
    function playMakeRoom() {
        const before = roomBefore;
        roomBefore = null;
        const fresh = freshReveals;
        freshReveals = [];
        if (!before) return;
        const z = uiScale();
        let moved = 0;
        for (const [n, r] of before) {
            if (n.hidden || !n.isConnected) continue;
            const q = n.getBoundingClientRect();
            const dx = (r.left - q.left) / z;
            const dy = (r.top - q.top) / z;
            const dw = Math.abs(r.width - q.width);
            const dh = Math.abs(r.height - q.height);
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && dw < 1 && dh < 1) continue;
            moved++;
            const size = (w, h) => (dw >= 1 || dh >= 1 ? { width: `${w / z}px`, height: `${h / z}px` } : {});
            n.animate([{ transform: `translate(${dx}px, ${dy}px)`, ...size(r.width, r.height) }, { transform: 'none', ...size(q.width, q.height) }],
                { duration: MAKE_ROOM_MS, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' });
        }
        // The new section waits (invisible) until the others have made room.
        if (moved) for (const n of fresh) n.style.animationDelay = `${MAKE_ROOM_MS + 80}ms`;
    }

    // New sections don't just pop in: panels, stations, supply cells, chips, workbench jobs, tasks, tree
    // nodes and facility tiles boot up (a scan wipe with a bright edge, a flicker, then settle). Not on
    // load, not in camera copies, and not under reduced motion.
    const REVEAL = '.panel, .station, .supply-cell, .chip, .phase, .action-button, .task, .tree-node, .facility-room, .upgrade';
    let revealReady = false;
    function revealIn(node) {
        if (!revealReady || !node.matches?.(REVEAL) || reducedMotion()) return;
        node.classList.remove('reveal-in');
        node.style.animationDelay = '';
        void node.offsetWidth;
        node.classList.add('reveal-in');
        if (roomBefore) freshReveals.push(node);
        const done = e => {
            if (e.target !== node || e.animationName !== 'reveal-boot') return;
            node.classList.remove('reveal-in');
            node.style.animationDelay = '';
            node.removeEventListener('animationend', done);
        };
        node.addEventListener('animationend', done);
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

    // Notifications are callouts, not pings: only things worth stopping for (an achievement, a skill learned
    // while you're elsewhere, a new room, a phase, a shipped version). Routine events go to the log.
    const TOAST_KINDS = {
        achievement: { icon: '★', ms: 5500 },
        skill: { icon: '◆', ms: 5500 },
        room: { icon: '⌂', ms: 6000 },
        phase: { icon: '▲', ms: 7500 },
        version: { icon: '⬢', ms: 7000 }
    };
    function toast(title, message, kind = 'achievement') {
        const k = TOAST_KINDS[kind] || TOAST_KINDS.achievement;
        const box = el('div', { class: `toast toast-${kind}`, role: 'status' }, [
            el('i', { class: 'toast-icon', text: k.icon, 'aria-hidden': 'true' }),
            el('div', { class: 'toast-text' }, [el('strong', { text: title }), el('span', { text: message })])
        ]);
        $('toasts').append(box);
        // At most three at a time (oldest first out).
        while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove();
        requestAnimationFrame(() => box.classList.add('show'));
        setTimeout(() => {
            box.classList.remove('show');
            setTimeout(() => box.remove(), 400);
        }, k.ms);
    }

    function floatGain(anchor, text) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // Rects are screen pixels; the page may be zoomed on large screens (uiScale), so convert.
        const rect = anchor.getBoundingClientRect();
        const z = uiScale();
        const pop = el('div', { class: 'float-gain', text });
        pop.style.left = `${(rect.left + rect.width / 2) / z + (Math.random() * 40 - 20)}px`;
        pop.style.top = `${(rect.top + window.scrollY) / z}px`;
        document.body.append(pop);
        pop.addEventListener('animationend', () => pop.remove());
    }

    // ---- Click effects in the server cabinets ---------------------------
    // Working the Workbench shows up in the cabinets, and only there: compute clicks make random pieces
    // spark, data clicks send glowing signals along the overhead tray and down a rack's wiring, research
    // clicks make pieces flash violet. More of them the faster you click, and bigger the more a click is
    // worth. (Nothing else on the page lights up.)
    const clickRate = { cp: [], dp: [], rp: [] };
    let cabinetFx = 0;          // live effect elements, capped so fast clicking can't flood the page

    function clickGlow(res, gained) {
        const times = clickRate[res];
        if (!times) return;
        const now = performance.now();
        times.push(now);
        while (times.length && now - times[0] > 1500) times.shift();
        if (reducedMotion() || view !== 'lab') return;
        const art = $('cabinetArt');
        const pieces = [...art.querySelectorAll('.hw')];
        if (!pieces.length || $('cabinetPanel').hidden) return;
        const rate = times.length / 1.5;                                  // clicks per second
        const worth = Math.log10(Math.max(1, gained));                    // 0 for 1, 1 for 10, 2 for 100…
        // Very sparse until clicking moves real volume: about 1 click in 15 early on, every click only
        // around 100k a second by hand; several effects at once only far beyond that.
        const volume = rate * gained;
        if (Math.random() > Math.min(1, 0.03 * Math.pow(1 + volume, 0.3))) return;
        const n = Math.max(1, Math.min(4, Math.floor(Math.log10(1 + volume) / 2)));
        const pick = () => pieces[Math.floor(Math.random() * pieces.length)];
        if (res === 'cp') for (let i = 0; i < n; i++) sparkPiece(pick(), worth);
        if (res === 'dp') for (let i = 0; i < Math.min(3, n); i++) signal(art, pick(), worth);
        if (res === 'rp') for (let i = 0; i < n; i++) flashPiece(pick(), worth);
    }

    // Compute: a piece crackles, sparks flying off it (more and further for valuable clicks).
    function sparkPiece(piece, worth) {
        if (cabinetFx > 80) return;
        piece.animate([{ filter: 'brightness(2.6) drop-shadow(0 0 6px #ffe08a)' }, { filter: 'brightness(1)' }], { duration: 260 + 60 * worth, easing: 'ease-out' });
        const rack = piece.parentElement;
        const x = piece.offsetLeft + piece.offsetWidth * Math.random();
        const y = piece.offsetTop + piece.offsetHeight * Math.random();
        for (let i = 0; i < 2 + Math.round(worth * 2); i++) {
            const dot = el('span', { class: 'cab-spark' });
            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;
            rack.append(dot);
            cabinetFx++;
            const a = Math.random() * Math.PI * 2;
            const dist = 6 + Math.random() * (8 + 6 * worth);
            dot.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(0.3)`, opacity: 0 }],
                { duration: 300 + Math.random() * 250, easing: 'ease-out' }).finished.then(() => { dot.remove(); cabinetFx--; }, () => { dot.remove(); cabinetFx--; });
        }
    }

    // Data: a glowing signal runs along the overhead tray to a rack, then down its cable loom to a piece.
    function signal(art, piece, worth) {
        if (cabinetFx > 80) return;
        const rack = piece.parentElement;
        const dot = el('span', { class: 'cab-signal' });
        dot.style.setProperty('--size', `${4 + Math.min(4, worth * 1.5)}px`);
        art.append(dot);
        cabinetFx++;
        const trayY = 5;
        const side = Math.random() < 0.5 ? rack.offsetLeft + 2 : rack.offsetLeft + rack.offsetWidth - 2;
        // Every waypoint stays inside the visible strip, so a signal never stretches the scroll area.
        const startX = art.scrollLeft + (Math.random() < 0.5 ? 8 : art.clientWidth - 8);
        const endY = rack.offsetTop + piece.offsetTop + piece.offsetHeight / 2;
        const endX = rack.offsetLeft + piece.offsetLeft + piece.offsetWidth / 2;
        const at = (x, y) => `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        dot.animate([
            { transform: at(startX, trayY), opacity: 0 },
            { transform: at((startX + side) / 2, trayY), opacity: 1, offset: 0.2 },
            { transform: at(side, trayY), offset: 0.45 },
            { transform: at(side, endY), offset: 0.8 },
            { transform: at(endX, endY), opacity: 1, offset: 0.95 },
            { transform: at(endX, endY), opacity: 0 }
        ], { duration: 900 + Math.random() * 300, easing: 'linear' }).finished.then(() => {
            dot.remove();
            cabinetFx--;
            piece.animate([{ filter: 'brightness(2) drop-shadow(0 0 6px #6fb3ff)' }, { filter: 'brightness(1)' }], { duration: 400, easing: 'ease-out' });
        }, () => { dot.remove(); cabinetFx--; });
    }

    // Research: a piece lights up violet, brighter for valuable clicks.
    function flashPiece(piece, worth) {
        const glow = Math.min(1, 0.5 + worth * 0.25);
        piece.animate([
            { filter: 'brightness(1)', boxShadow: 'none' },
            { filter: `brightness(${1.6 + glow}) hue-rotate(40deg)`, boxShadow: `0 0 ${8 + 10 * glow}px rgba(199, 146, 234, ${0.6 + 0.4 * glow}), inset 0 0 8px rgba(199, 146, 234, 0.8)`, offset: 0.25 },
            { filter: 'brightness(1)', boxShadow: 'none' }
        ], { duration: 650, easing: 'ease-out' });
    }

    // ---- Hold-to-repeat buttons -----------------------------------------

    // Fires `fn` on click (mouse, touch or keyboard) and repeats it while the pointer is held down.
    // Fires on press (no wait), then repeats at HOLD_REPEAT_MS while held; the pointer's own click is
    // ignored, so a tap counts once. Keyboard activation only sends a click, so it still works.
    function holdable(button, fn) {
        let repeat = null;

        const stop = () => {
            clearInterval(repeat);
            repeat = null;
            button.classList.remove('held');
        };

        button.addEventListener('pointerdown', e => {
            if (e.button !== 0 || button.disabled) return;
            fn();
            button.classList.add('held');
            repeat = setInterval(() => {
                if (button.disabled) return stop();
                fn();
            }, HOLD_REPEAT_MS);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => button.addEventListener(t, stop));
        button.addEventListener('click', e => {
            if (e.detail === 0) fn();     // keyboard (Enter/Space); pointer presses already fired on pointerdown
        });
        button.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Build static UI ------------------------------------------------

    function buildActions() {
        const box = $('actions');
        for (const action of E.ACTIONS) {
            const gain = el('span', { class: 'action-gain' });
            const cost = el('span', { class: 'action-cost' });
            // Jobs that can be automated keep a line for it (blank until it means something), so the card
            // never changes height; the rest have none.
            const auto = el('span', { class: `action-auto${AUTOMATES[action.id] ? '' : ' none'}` });
            const button = el('button', { type: 'button', class: 'button action-button' }, [
                el('span', { class: 'action-name', text: action.name }), gain, cost, auto
            ]);
            holdable(button, () => doAction(action.id, button));
            box.append(button);
            ui.actions[action.id] = { action, button, gain, cost, auto };
        }
    }

    // Which machine automates each workbench job (engine AUTOMATION gates it).
    const AUTOMATES = { compute: 'cpu', collect: 'autoCollector', research: 'researchAssistant' };

    // Under each job: what's doing it for you, once something is. No tips about how to get there (tutorials
    // and story will carry that later).
    function automationText(actionId) {
        const id = AUTOMATES[actionId];
        if (!id) return '';
        const lvl = E.level(state, id);
        return lvl ? `Automated · ${E.UPGRADE_BY_ID[id].name} ×${lvl}` : '';
    }

    // Lab stations: one per upgrade group (E.TABS), each with its own look, in a reserved slot (its
    // place in E.TABS), so opening one never moves another. Locked stations aren't drawn at all.
    const STATIONS = {
        hardware: { name: 'Hardware bench', kind: 'bench' },
        software: { name: 'Software terminal', kind: 'terminal' },
        algorithms: { name: 'Research wall', kind: 'wall' },
        consciousness: { name: 'Isolation chamber', kind: 'chamber' }
    };

    // A card's live line: what one unit makes now (all multipliers in), what they all make, and the next
    // doubling; for click upgrades, what a click is worth.
    function yieldText(up, lvl, d) {
        const f = E.format;
        if (up.cps) {
            const r = d.hardwareRates[up.id];
            const next = r.nextDoubling ? ` · ×2 at ${r.nextDoubling}` : '';
            return `+${f(r.each)} CP/s each${next}`;
        }
        // What the next level would make it, for the one number this card changes.
        const after = key => {
            if (E.isMaxed(state, up)) return '';
            const next = E.derive({ ...state, levels: { ...state.levels, [up.id]: lvl + 1 } }, debugRates)[key];
            return next > d[key] * 1.0001 ? ` → ${f(next, key === 'hardwareMult' || key.endsWith('PerSec') ? 2 : 1)}` : '';
        };
        switch (up.shows) {
            case 'click': {
                const next = up.id === 'keyboard' ? E.nextClickTool(lvl) : null;
                // The desk adds a quarter CP per item, and Shell Scripts add a share of CP/s, so keep two
                // decimals whenever whole numbers would hide the change ("14 → 14").
                const now = d.clickPower;
                const nxt = E.isMaxed(state, up) ? null : E.derive({ ...state, levels: { ...state.levels, [up.id]: lvl + 1 } }, debugRates).clickPower;
                const fine = (now < 10 && now % 1) || (nxt !== null && nxt < 1000 && Math.floor(nxt) === Math.floor(now));
                const c = x => f(x, fine ? 2 : undefined);
                const later = nxt === null ? '' : ` → ${c(nxt)}`;
                const then = !next ? '' : next.from === lvl + 1 ? ` · then ${next.name}` : ` · ${next.name} at level ${next.from + 1}`;
                return `Click: ${c(now)}${later} CP${then}`;
            }
            case 'collect': return `Collect: ${f(d.dpPerCollect)}${after('dpPerCollect')} DP`;
            case 'research': return `Research: ${f(d.rpPerResearch)}${after('rpPerResearch')} RP`;
            case 'hardwareMult': return `Hardware ×${f(d.hardwareMult, 2)}${after('hardwareMult')}`;
            case 'autoCollect': return `Crawler: ${f(d.collectsPerSec, 2)}${after('collectsPerSec')} collections/s`;
            case 'autoResearch': return `Assistant: ${f(d.researchPerSec, 2)}${after('researchPerSec')} research/s`;
        }
        // Attribute upgrades: where those attributes stand now.
        return Object.keys(up.grants).map(k => `${E.ATTRIBUTES[k].short} ${f(state.attr[k], 1)}`).join(' · ');
    }

    // A finished card: an "Installed ✓" stamp with a green flash, then it folds away (the cards below slide
    // up smoothly), and render() keeps it hidden from then on.
    function retireCard(id) {
        const item = ui.upgrades[id];
        if (!item || item.retiring) return;
        item.retiring = true;
        const card = item.card;
        if (reducedMotion()) {
            item.retiring = false;
            return render();
        }
        card.classList.add('completing');
        // The stamp gets a full second on a card tall enough to show it, then the card folds away.
        const h = Math.max(card.offsetHeight, 56);
        const fold = card.animate([
            { minHeight: `${h}px`, maxHeight: `${h}px`, opacity: 1, offset: 0 },
            { minHeight: `${h}px`, maxHeight: `${h}px`, opacity: 1, offset: 0.62 },
            { minHeight: '0px', maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', borderBottomWidth: '0px', offset: 1 }
        ], { duration: 1800, easing: 'ease-in-out' });
        const done = () => {
            item.retiring = false;
            card.classList.remove('completing');
            render();
        };
        fold.finished.then(done, done);
    }

    function buildUpgrades() {
        const box = $('labStations');
        E.TABS.forEach((tab, slot) => {
            const st = STATIONS[tab.id];
            const art = el('div', { class: 'station-art', 'aria-hidden': 'true' });
            const list = el('div', { class: 'station-list' });
            // "▾ N more": how many cards sit below the fold; clicking scrolls to them.
            const more = el('button', { type: 'button', class: 'station-more', text: '▾ more below', hidden: true });
            more.addEventListener('click', () => list.scrollBy({ top: list.clientHeight * 0.8, behavior: reducedMotion() ? 'auto' : 'smooth' }));
            const node = el('section', { class: `panel hud station station-${st.kind}`, 'aria-label': st.name, 'data-slot': slot, 'data-tab': tab.id, hidden: true }, [
                el('h2', { class: 'station-title', text: st.name }), art, list, more
            ]);
            box.append(node);
            ui.stations[tab.id] = { node, art, list, more, order: '' };
            ui.panels[tab.id] = list;
        });
        // The terminal has a screen header; the other stations get decorative pieces.
        ui.stations.software.art.append(el('span', { class: 'terminal-line', text: '$ ./improve --list' }));
        for (const id of ['algorithms', 'consciousness']) for (let i = 0; i < 5; i++) ui.stations[id].art.append(el('i'));

        for (const up of E.UPGRADES) {
            if (up.tab === 'training') continue;
            const levelBadge = el('span', { class: 'badge' });
            // Live numbers (hardware output, click value) so descriptions never need updating.
            const yieldLine = up.cps || up.shows || up.grants ? el('p', { class: 'upgrade-yield' }) : null;
            const button = el('button', { type: 'button', class: 'button upgrade-button' });
            button.addEventListener('click', () => doBuy(up.id));
            // Hardware: the piece you're buying, as it will sit in the server cabinets.
            const part = HW_PIECES[up.id];
            const side = part ? el('div', { class: 'upgrade-side' }, [
                el('div', { class: 'upgrade-part', 'aria-hidden': 'true', title: `In the cabinets: ${part.steps[0][0]} bought in a row merge into a ${part.steps[0][1]}×${part.steps[0][2]} ${part.names[1]}` }, [
                    el('span', { class: `hw hw-${up.id} t1`, style: `--w:${part.steps[0][1]};--h:${part.steps[0][2]}` }, [el('i'), el('b')])
                ]),
                button
            ]) : button;
            const nameNode = el('span', { text: up.name });
            // Lab cards keep to the numbers: no flavour lines here (the skill tree keeps them).
            const card = el('article', { class: 'upgrade', hidden: true, 'data-id': up.id }, [
                el('div', { class: 'upgrade-info' }, [
                    el('h3', {}, [nameNode, document.createTextNode(' '), levelBadge]),
                    // Hardware's live line says what it makes, so it needs no description.
                    up.cps ? null : el('p', { class: 'muted small', text: up.effect }),
                    yieldLine
                ]),
                side
            ]);
            ui.panels[up.tab].append(card);
            ui.upgrades[up.id] = { up, card, button, levelBadge, yieldLine, nameNode };
        }
        for (const tab of E.TABS) {
            const empty = el('p', { class: 'muted small empty-hint' });
            ui.panels[tab.id].append(empty);
            ui.panels[tab.id].emptyHint = empty;
        }
    }

    function renderStations() {
        // Open stations share the floor: with two open, each takes half the width (a new one opening
        // reflows them once). Slots stay in E.TABS order, so a station never jumps ahead of another.
        const open = E.TABS.filter(t => !t.unlock || state.unlocked[t.unlock]).length;
        const box = $('labStations');
        if (box.dataset.open !== String(open)) {
            box.dataset.open = open;
            box.style.setProperty('--open-stations', Math.max(1, open));
            box.style.setProperty('--open-stations-mid', Math.max(1, Math.min(2, open)));
        }
        for (const tab of E.TABS) {
            const st = ui.stations[tab.id];
            setHidden(st.node, !!tab.unlock && !state.unlocked[tab.unlock]);
            // Cards in the order they were revealed (state.unlocked keeps insertion order, and saves keep
            // it too), so a new upgrade always lands at the end and nothing you know moves.
            const ids = Object.keys(state.unlocked).filter(k => k.startsWith('up:')).map(k => k.slice(3))
                .filter(id => ui.upgrades[id] && ui.upgrades[id].up.tab === tab.id);
            const order = ids.join(',');
            if (order !== st.order) {
                const known = new Set(st.order ? st.order.split(',') : []);
                for (const id of ids) {
                    const { card } = ui.upgrades[id];
                    st.list.insertBefore(card, st.list.emptyHint || null);
                    // Arrivals while you're here get a brief highlight (not on load).
                    if (st.order !== '' && !known.has(id)) {
                        card.classList.add('fresh');
                        card.addEventListener('animationend', () => card.classList.remove('fresh'), { once: true });
                    }
                }
                st.order = order;
            }
            const l = st.list;
            const overflowing = l.scrollHeight - l.scrollTop - l.clientHeight > 8;
            setHidden(st.more, !overflowing);
            if (overflowing) {
                const bottom = l.getBoundingClientRect().bottom;
                const below = [...l.querySelectorAll('.upgrade:not([hidden])')].filter(c => c.getBoundingClientRect().bottom > bottom + 1).length;
                setText(st.more, below ? `▾ ${below} more` : '▾ more below');
            }
        }
        renderCabinets();
    }

    // Server cabinets: the hardware you own, racked in the order you bought it, all kinds mixed together
    // like a real server room. Every kind starts as a small 1×1 square; a few of them touching in a line
    // merge into a medium piece, a horizontal or vertical bar (the count differs by kind), and a few
    // mediums touching in a line merge into a large one, wider first (racks are 7 cells wide, so pieces
    // combine across before they stack up). `steps`: [how many of the size below, width, height].
    // Pieces fill racks of 7 × 8 cells from the bottom, first fit across every rack, so small pieces
    // drop into earlier gaps. This mix of merged and unmerged parts is the starting point for a later
    // rack-configuration puzzle (rearranging pieces to merge them or build shapes for bonuses).
    const HW_PIECES = {
        cpu: { steps: [[3, 3, 1], [2, 6, 1], [2, 6, 2]], names: ['CPU', 'CPU board', 'CPU shelf', 'CPU bank'] },
        server: { steps: [[2, 2, 1], [3, 6, 1], [2, 6, 2]], names: ['Server', 'Server pair', 'Server row', 'Server rack'] },
        quantum: { steps: [[2, 1, 2], [3, 3, 2], [2, 6, 2]], names: ['Qubit cell', 'Quantum core', 'Cryostat', 'Quantum array'] },
        neural: { steps: [[3, 1, 3], [2, 2, 3], [3, 6, 3]], names: ['Neural tile', 'Neural column', 'Neural block', 'Neural wall'] },
        datacenter: { steps: [[5, 5, 1], [2, 5, 2], [2, 5, 4]], names: ['Datacenter pod', 'Datacenter hall', 'Datacenter wing', 'Datacenter campus'] },
        optical: { steps: [[4, 4, 1], [3, 4, 3], [2, 4, 6]], names: ['Optical cell', 'Optical rail', 'Optical bench', 'Light field'] }
    };
    const RACK = { cols: 7, rows: 8 };
    const MAX_RACKS = 24;
    const RACK_LOG_KEY = 'agiRackLog';   // screen state: every hardware level, in the order it was bought
    let cabinetKey = null;      // null: not drawn yet
    let cabinetPieces = new Set();

    const pieceUnits = (id, tier) => HW_PIECES[id].steps.slice(0, tier).reduce((a, st) => a * st[0], 1);

    // The buy log, reconciled with what you own (a reset or an old save trims it or adds what's missing).
    function rackLog() {
        let log = [];
        try { log = JSON.parse(storageGet(RACK_LOG_KEY) || '[]'); } catch { /* start fresh */ }
        if (!Array.isArray(log)) log = [];
        const want = Object.fromEntries(Object.keys(HW_PIECES).map(id => [id, E.level(state, id)]));
        const seen = {};
        log = log.filter(id => want[id] != null && (seen[id] = (seen[id] || 0) + 1) <= want[id]);
        for (const id of Object.keys(HW_PIECES)) for (let i = seen[id] || 0; i < want[id]; i++) log.push(id);
        return log;
    }

    // Racks from the buy log, replayed in order. Each new piece is a small square in the next free spot,
    // left to right from the bottom, so the racks build up in the order you buy. Pieces merge only by
    // direct contact: the right number of the same kind and size touching in one straight line, exactly
    // the merged piece's shape (`steps`), like 3 CPUs side by side → a 3×1 board. A piece at the end of
    // a row and one starting the next row don't touch, so they don't merge. Vertical pieces (quantum,
    // neural) rarely form on their own: lining them up is left to the player (the planned rack puzzle).
    function buildRacks(log) {
        const racks = [];
        const newRack = () => {
            const r = { grid: Array.from({ length: RACK.rows }, () => Array(RACK.cols).fill(null)), pieces: [] };
            racks.push(r);
            return r;
        };
        const inside = (x, y) => x >= 0 && y >= 0 && x < RACK.cols && y < RACK.rows;
        const at = (r, x, y) => (inside(x, y) ? r.grid[y][x] : null);
        const put = (r, p) => {
            for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) r.grid[j][i] = p;
            r.pieces.push(p);
        };
        const take = (r, p) => {
            for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) r.grid[j][i] = null;
            r.pieces.splice(r.pieces.indexOf(p), 1);
        };
        // Merge `p` with neighbours in a straight line that tile the next size exactly; returns the new piece.
        function merge(r, p) {
            const step = HW_PIECES[p.id].steps[p.tier];
            if (!step) return null;
            const [n, W, H] = step;
            const across = H === p.h && W === n * p.w;
            if (!across && !(W === p.w && H === n * p.h)) return null;
            for (let i = 0; i < n; i++) {
                const sx = across ? p.x - i * p.w : p.x;
                const sy = across ? p.y : p.y - i * p.h;
                const line = [];
                for (let j = 0; j < n; j++) {
                    const x = across ? sx + j * p.w : sx;
                    const y = across ? sy : sy + j * p.h;
                    const q = at(r, x, y);
                    if (!q || q.id !== p.id || q.tier !== p.tier || q.x !== x || q.y !== y) break;
                    line.push(q);
                }
                if (line.length < n) continue;
                for (const q of line) take(r, q);
                const big = { id: p.id, tier: p.tier + 1, x: sx, y: sy, w: W, h: H };
                put(r, big);
                return big;
            }
            return null;
        }
        for (const id of log) {
            const p = { id, tier: 0, w: 1, h: 1 };
            let rack = null;
            // The next free spot, left to right from the bottom.
            for (const r of racks) {
                if (rack) break;
                for (let y = 0; y < RACK.rows && !rack; y++) {
                    const x = r.grid[y].indexOf(null);
                    if (x >= 0) {
                        Object.assign(p, { x, y });
                        rack = r;
                    }
                }
            }
            if (!rack) {
                rack = newRack();
                Object.assign(p, { x: 0, y: 0 });
            }
            put(rack, p);
            let cur = p;
            while ((cur = merge(rack, cur))) { /* a merge can complete the next size up */ }
        }
        for (const r of racks) for (const p of r.pieces) Object.assign(p, { units: pieceUnits(p.id, p.tier), name: HW_PIECES[p.id].names[p.tier] });
        return racks;
    }

    function renderCabinets() {
        const log = rackLog();
        const key = log.join(',');
        if (key === cabinetKey) return;
        const first = cabinetKey === null;
        cabinetKey = key;
        storageSet(RACK_LOG_KEY, JSON.stringify(log));
        const racks = buildRacks(log);
        setHidden($('cabinetPanel'), !racks.length);
        // New or merged pieces (not on load) pop in; merges flash.
        const seen = new Set();
        const art = $('cabinetArt');
        // Each rack's cable looms grow with how full it is.
        const fill = r => r.pieces.reduce((a, p) => a + p.w * p.h, 0) / (RACK.cols * RACK.rows);
        art.replaceChildren(...racks.slice(0, MAX_RACKS).map((r, k) => el('div', { class: 'rack-block', style: `--fill:${fill(r).toFixed(2)}` }, r.pieces.map(p => {
            const tag = `${k}:${p.id}:${p.tier}:${p.x}:${p.y}`;
            seen.add(tag);
            const fresh = !first && !cabinetPieces.has(tag);
            return el('span', {
                class: `hw hw-${p.id} t${p.tier}${fresh ? (p.tier ? ' merged' : ' fresh') : ''}`,
                style: `--x:${p.x};--y:${p.y};--w:${p.w};--h:${p.h}`,
                title: `${p.name}${p.units > 1 ? ` (${p.units} × ${E.UPGRADE_BY_ID[p.id].name})` : ''}`
            }, [el('i'), el('b')]);
        }))));
        cabinetPieces = seen;
        if (racks.length > MAX_RACKS) art.append(el('span', { class: 'cabinet-more', text: `+${racks.length - MAX_RACKS} more racks` }));
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
            clickGlow(result.resource, result.gained);
        }
        if (result.msg) log(result.msg, 'success');
        afterChange();
    }

    function doBuy(id) {
        const result = E.buy(state, id);
        log(result.msg, result.ok ? 'success' : 'warning');
        if (result.ok) {
            const up = E.UPGRADE_BY_ID[id];
            if (up.tab !== 'training') termLog(`installed ${E.upgradeName(state, up)} (level ${E.level(state, id)})`);
            if (up.tab !== 'training' && E.isMaxed(state, up)) retireCard(id);
            afterChange();
        }
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

    // Ship the next version: the run starts over for Insight (kept, with legacy nodes and achievements).
    async function doPrestige() {
        const gain = E.prestigeGain(state);
        if (gain < 1) return;
        const next = E.nextVersion(state, gain);
        const name = E.versionName(next.major, next.minor);
        const { ok } = await openDialog({
            title: `Ship ${name} for ${gain} Insight?`,
            message: `This run's resources, attributes, skills and upgrades reset. You keep Insight (+10% production each, and it buys legacy nodes in the skill tree), legacy nodes and achievements.${next.isMajor ? '' : ' A bigger jump in Insight would make it a major version.'}`,
            okLabel: `Ship ${name}`
        });
        if (ok) shipVersion(false);
    }

    function shipVersion(force) {
        const result = E.prestige(state, Date.now());
        if (!result.ok && !force) return;
        state = result.ok ? result.state : state;
        path.roll = null;
        resetView();
        log(`Shipped ${result.version}! +${result.gain} Insight. All production is now ×${E.derive(state).mult.toFixed(2)}. Spend Insight on legacy nodes in the skill tree.`, 'special');
        toast(`${result.version} shipped`, `+${result.gain} Insight`, 'version');
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

    // After a reset: no open bay, no finished run on screen, fresh room visits and tree view.
    function resetView() {
        syncSettings();
        if (openBay) {
            openBay = null;
            $('moduleView').hidden = true;
            $('hub').hidden = false;
        }
        Object.assign(path, { roll: null, done: false, pause: 0, overview: 0, glow: null, summit: null, particles: [], tension: 0, focus: null, timeScale: 1, fx: freshFx() });
        path.view = 'run';
        dismissResult();
        seenRooms = new Set(['lab']);
        storageSet(SEEN_KEY, '[]');
        storageSet(TREE_CAM_KEY, '');
        Object.assign(treeCam, { x: 0, y: 0, z: 1 });
        $('skillTree').style.transform = '';
        cabinetKey = null;
        Object.assign(lab, { cp: [], dp: [], rp: [], xp: [], hand: [], lastRunCp: null, lastCollects: null, lastResearch: null, lastXp: null, lines: [] });
        storageSet(RACK_LOG_KEY, '[]');
        path.queued = null;
        ui.termLines.replaceChildren();
        for (const st of Object.values(ui.stations)) st.order = '';
        projectSlots = projectSlots.map(() => null);
        projectsKey = '';
        path.startLeg = null;
        showView('lab');
    }

    // ---- Loop & rendering -----------------------------------------------

    function afterChange() {
        announce(E.evaluate(state));
        render();
    }

    function announce(changes) {
        for (const r of changes.reveals || []) {
            log(`${r.name}: ${r.intro}`, 'special');
        }
        for (const m of changes.milestones) {
            log(`Milestone reached: ${m.name}`, 'special');
            if (m.callout) toast(m.callout[0], m.callout[1], 'room');
        }
        for (const a of changes.achievements) {
            log(`Achievement unlocked: ${a.name}`, 'special');
            if (!a.quiet) toast(`Achievement · ${a.name}`, a.desc, 'achievement');
        }
        if (changes.phase) {
            log(`Phase transition! You have reached ${changes.phase.name}.`, 'special');
            toast(`${changes.phase.name} reached`, 'A new phase for your AI', 'phase');
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
            E.tick(state, dt * debugSpeed, debugRates);
            sampleLab(dt * debugSpeed);
            advanceTasks(dt * debugSpeed);
        }
        afterChange();
        if (state.settings.autosave && now - lastSave >= AUTOSAVE_MS) save();
    }

    // ---- Lab life: output sparklines and the terminal's job log ----

    const SPARK_POINTS = 90;       // 45 s of history at one sample every 0.5 s
    const HAND_SAMPLES = 6;        // the supply numbers add what your clicks made over the last 3 s
    const lab = { cp: [], dp: [], rp: [], xp: [], hand: [], sampleT: 0, lastRunCp: null, lastCollects: null, lastResearch: null, lastXp: null, lines: [] };
    const pushSample = (series, v) => {
        series.push(v);
        if (series.length > SPARK_POINTS) series.shift();
    };

    function sampleLab(dt) {
        const d = E.derive(state, debugRates);
        lab.sampleT += dt;
        if (lab.sampleT < 0.5) return;
        // Output per second over the last half second, clicks included, so the lines move as you work.
        const span = lab.sampleT;
        lab.sampleT = 0;
        const runCp = state.stats.runCp;
        const collects = state.stats.collects;
        const research = state.stats.researchManual;
        if (lab.lastRunCp != null && runCp >= lab.lastRunCp) {
            pushSample(lab.cp, (runCp - lab.lastRunCp) / span);
            const handDp = Math.max(0, collects - lab.lastCollects) * d.dpPerCollect / span;
            const handRp = Math.max(0, research - lab.lastResearch) * d.rpPerResearch / span;
            pushSample(lab.dp, handDp + d.dpPerSec);
            pushSample(lab.rp, handRp + d.rpPerSec);
            // XP: what was earned (spending it in the tree isn't a drop in output).
            pushSample(lab.xp, Math.max(0, state.res.xp - lab.lastXp) / span);
            lab.hand.push({ cp: Math.max(0, (runCp - lab.lastRunCp) / span - d.cpPerSec), dp: handDp, rp: handRp });
            if (lab.hand.length > HAND_SAMPLES) lab.hand.shift();
        }
        lab.lastRunCp = runCp;
        lab.lastCollects = collects;
        lab.lastResearch = research;
        lab.lastXp = state.res.xp;
        if (view === 'lab') drawSparks();
    }

    function drawSpark(canvas, data, color) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(2, (window.devicePixelRatio || 1) * uiScale());
        if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
        if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (data.length < 2) return;
        const top = Math.max(...data) * 1.15 || 1;
        const x = i => (i / (SPARK_POINTS - 1)) * w + (SPARK_POINTS - data.length) * (w / (SPARK_POINTS - 1));
        const y = v => h - 2 - (v / top) * (h - 6);
        ctx.beginPath();
        data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineTo(x(data.length - 1), h);
        ctx.lineTo(x(0), h);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(color, 0.12);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x(data.length - 1), y(data[data.length - 1]), 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Output by hand per second, averaged over the last few samples (0 once you stop clicking).
    function handRate(key) {
        if (!lab.hand.length) return 0;
        return lab.hand.reduce((sum, h) => sum + h[key], 0) / HAND_SAMPLES;
    }

    function drawSparks() {
        drawSpark($('sparkCp'), lab.cp, path.colors.success || '#63e0ab');
        drawSpark($('sparkDp'), lab.dp, path.colors.primary || '#6fb3d9');
        drawSpark($('sparkRp'), lab.rp, '#c792ea');
        drawSpark($('sparkXp'), lab.xp, path.colors.warning || '#ffb547');
    }

    // The software terminal prints what the lab's automation and installs are doing (last few lines).
    function termLog(text) {
        lab.lines.push(text);
        if (lab.lines.length > 4) lab.lines.shift();
        render();
        const box = ui.termLines;
        if (box) box.replaceChildren(...lab.lines.map((t, i) => el('span', { class: `terminal-out${i === lab.lines.length - 1 ? ' fresh' : ''}`, text: `> ${t}` })));
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
            case 'rate.xp': return d.xpPerSec ? `+${f(d.xpPerSec, d.xpPerSec < 0.1 ? 2 : undefined)}/s` : '';
            // Clicks count too: passive net output plus what you made by hand in the last few seconds.
            case 'supply.cp': return `${f(d.cpNet + handRate('cp'))} CP/s`;
            case 'supply.dp': return `${f(d.dpNet + handRate('dp'))} DP/s`;
            case 'supply.rp': return `${f(d.rpPerSec + handRate('rp'))} RP/s`;
            case 'supply.xp': {
                const recent = lab.xp.slice(-20);
                return `${f(recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : d.xpPerSec, 1)} XP/s`;
            }
            case 'supply.rates': {
                const cp = f(d.cpNet + handRate('cp'));
                return state.unlocked['seen:dp'] ? `${cp} CP · ${f(d.dpNet + handRate('dp'))} DP /s` : `${cp} CP/s`;
            }
            case 'supply.cleared': {
                const b = E.clearedCpBonus(state);
                return b ? `+${E.format(b * 100, 1)}% training` : '';
            }
            case 'goal.lab': return goalFor('lab');
            case 'goal.servers': return goalFor('servers');
            case 'goal.bay': return goalFor('bay');
            case 'goal.rnd': return goalFor('rnd');
            case 'goal.facility': return goalFor('facility');
            case 'stats.playClock': {
                const t = Math.floor(state.stats.playTime);
                return [t / 3600, (t % 3600) / 60, t % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
            }
            case 'rate.rp': return d.rpPerSec ? `+${f(d.rpPerSec)}/s` : '';
            case 'attr.intelligence': return f(state.attr.intelligence, 1);
            case 'attr.creativity': return f(state.attr.creativity, 1);
            case 'attr.awareness': return f(state.attr.awareness, 1);
            case 'mult': return `×${d.mult.toFixed(2)}`;
            case 'phase.name': return E.PHASES[E.phaseIndex(state)].name;
            case 'phase.next': {
                const idx = E.phaseIndex(state);
                const next = E.PHASES[idx + 1];
                if (!next) return 'You have reached the final phase. Ship the next version to grow stronger.';
                const reqs = Object.entries(next.req).map(([k, v]) => `${E.ATTRIBUTES[k].short} ${f(Math.min(state.attr[k], v), 1)}/${v}`);
                return `Next: ${next.name} (${reqs.join(' · ')})`;
            }
            case 'prestige.points': return f(state.prestige.points);
            case 'prestige.gain': return f(E.prestigeGain(state));
            case 'prestige.count': return f(state.prestige.count);
            case 'prestige.version': return E.currentVersion(state);
            case 'prestige.next': {
                const v = E.nextVersion(state);
                return E.versionName(v.major, v.minor);
            }
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

        const gains = { compute: `+${E.format(d.clickPower, d.clickPower < 10 && d.clickPower % 1 ? 2 : undefined)} CP`, collect: `+${E.format(d.dpPerCollect)} DP`,
            research: `+${E.format(d.rpPerResearch)} RP`, improve: `+${E.IMPROVE_GAIN} Int` };
        for (const { action, button, gain, cost, auto } of Object.values(ui.actions)) {
            const autoText = automationText(action.id);
            setText(auto, autoText);
            if (auto.title !== autoText) auto.title = autoText;
            auto.classList.toggle('done', !!(AUTOMATES[action.id] && E.level(state, AUTOMATES[action.id])));
            const price = E.actionCost(state, action);
            setHidden(button, !!action.unlock && !state.unlocked[action.unlock]);
            setDisabled(button, !E.canAfford(state, price));
            setText(gain, gains[action.id]);
            setText(cost, Object.keys(price).length ? E.formatCost(price) : '');
        }

        renderStations();

        const visibleCount = {};
        for (const { up, card, button, levelBadge, yieldLine, nameNode } of Object.values(ui.upgrades)) {
            // Finished one-time upgrades retire: a short "installed" animation, then the card folds away.
            const visible = E.isUpgradeVisible(state, up) && (!E.isMaxed(state, up) || !!ui.upgrades[up.id].retiring);
            setHidden(card, !visible);
            if (!visible) continue;
            visibleCount[up.tab] = (visibleCount[up.tab] || 0) + 1;
            const lvl = E.level(state, up.id);
            const maxed = E.isMaxed(state, up);
            if (yieldLine) setText(yieldLine, yieldText(up, lvl, d));
            setText(nameNode, E.upgradeName(state, up));
            setText(levelBadge, up.max === 1 ? '' : `Lv ${lvl}`);
            card.classList.toggle('owned', maxed);
            if (maxed) {
                setText(button, 'Installed ✓');
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
        // Training XP joins the supply line once cleared stretches make it on their own.
        setHidden(document.querySelector('.cell-xp'), !(d.xpPerSec > 0));
        renderTasks(d);
        renderProjects();
        layoutLab();
        renderFacility(d);
        renderMinimap();
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
                renderLegPicker();
                path.autoStart = E.autoTrainerLevel(state) ? (path.autoStart || 0) + TICK_MS / 1000 : 0;
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

    // Each screen's bar names its own next unlock (never what a sealed thing is).
    const phaseReqs = phase => Object.entries(phase.req).filter(([k, v]) => state.attr[k] < v)
        .map(([k, v]) => `${E.ATTRIBUTES[k].short} ${E.format(state.attr[k], 1)}/${v}`).join(', ');

    function goalFor(place) {
        if (place === 'lab') {
            const m = E.MILESTONES.find(x => !state.unlocked[x.key]);
            return m ? `Next: ${m.desc}` : '';
        }
        if (place === 'servers') {
            const id = nextSealedBay();
            if (!id || BAYS[id].phase == null) return '';
            const phase = E.PHASES[BAYS[id].phase];
            return `Sealed bay opens at ${phase.name} · ${phaseReqs(phase)}`;
        }
        if (place === 'bay') {
            const k = E.skillAt(state.path.learned);
            return `Next skill: ${k.name} · best run ${Math.round(state.path.best * 100)}%`;
        }
        if (place === 'rnd') {
            const gain = E.prestigeGain(state);
            return gain >= 1 ? `Ship the next version for +${E.format(gain)} Insight` : `Shipping needs ${E.PRESTIGE_MIN_INTELLIGENCE} Intelligence`;
        }
        if (place === 'facility') {
            const id = Object.keys(ROOMS).find(r => !roomUnlocked(r));
            if (!id) return '';
            if (id === 'servers') return `A sealed wing opens once you collect data · ${Math.min(10, state.stats.collects)}/10`;
            if (id === 'rnd') return `A sealed wing opens at ${E.PRESTIGE_MIN_INTELLIGENCE} Intelligence · ${E.format(state.attr.intelligence, 1)}/${E.PRESTIGE_MIN_INTELLIGENCE}`;
            const phase = E.PHASES[ROOMS[id].phase];
            return `A sealed wing opens at ${phase.name} · ${phaseReqs(phase)}`;
        }
        return '';
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
        if (id === 'rnd') return `Model ${E.currentVersion(state)} · ${E.format(state.prestige.points)} Insight · +${E.format(E.prestigeGain(state))} ready`;
        if (id === 'servers') {
            const learned = state.path.learned;
            return `${learned} skill${learned === 1 ? '' : 's'} · ${E.format(state.res.xp, 1)} XP to spend`;
        }
        return r.blurb;
    }

    // Security cameras: an open room's tile shows a live, scaled-down copy of the room itself, so
    // whatever unlocks, expands or runs in there is visible from the facility. `fit` scales the whole
    // view into the tile (contain); 'width' fills the width and crops the bottom, like a wall camera.
    const CAMERAS = {
        lab: { source: () => $('labRoom'), fit: 'width' },
        servers: { source: () => $('hub'), fit: 'contain', feedClass: 'viewport' },
        rnd: { source: () => $('rndRoom'), fit: 'width' }
    };
    const CAMERA_MS = 1000;
    let cameraTimer = 0;

    function snapshot(source) {
        const copy = source.cloneNode(true);
        copy.hidden = false;
        copy.removeAttribute('id');
        copy.classList.remove('room');
        copy.removeAttribute('data-room');
        // Inert and anonymous: no duplicate ids, nothing focusable, nothing the game would find and update.
        for (const n of copy.querySelectorAll('[id], [data-facility], [data-bind], [data-next]')) {
            n.removeAttribute('id');
            n.removeAttribute('data-facility');
            n.removeAttribute('data-bind');
            n.removeAttribute('data-next');
        }
        for (const n of copy.querySelectorAll('.room-bar')) n.remove();
        // One-off entrance animations would replay on every refresh.
        for (const n of copy.querySelectorAll('.fresh, .reveal-in')) n.classList.remove('fresh', 'reveal-in');
        return copy;
    }

    function refreshCameras() {
        requestAnimationFrame(drawLanes);
        const stageWidth = $('stage').clientWidth || 1200;
        for (const [id, cam] of Object.entries(CAMERAS)) {
            const tile = $('facilityPlan').querySelector(`[data-room-id="${id}"]`);
            const screen = tile.querySelector('.fr-cam');
            const live = roomOpen(id);
            screen.hidden = !live;
            tile.querySelector('.fr-art').hidden = live;
            if (!live) continue;
            const feed = screen.querySelector('.fr-feed');
            const width = Math.max(900, stageWidth);
            feed.className = `fr-feed ${cam.feedClass || ''}`;
            feed.style.width = `${width}px`;
            feed.replaceChildren(snapshot(cam.source()));
            const w = screen.clientWidth;
            const h = screen.clientHeight;
            if (!w || !h) continue;
            const scale = cam.fit === 'contain' ? Math.min(w / width, h / feed.offsetHeight) : w / width;
            const left = (w - width * scale) / 2;
            feed.style.transform = `translate(${left}px, 0) scale(${scale})`;
        }
    }

    // The rack's lanes animate (cleared stretches crawl) while the rack or its camera is on screen.
    let laneTimer = 0;
    function setLaneTimer(on) {
        clearInterval(laneTimer);
        laneTimer = on ? setInterval(drawLanes, 50) : 0;
        if (on) requestAnimationFrame(drawLanes);
    }

    // Cameras run only while the facility is on screen.
    function setCameras(on) {
        clearInterval(cameraTimer);
        cameraTimer = 0;
        if (!on) return;
        refreshCameras();
        cameraTimer = setInterval(refreshCameras, CAMERA_MS);
    }

    function buildFacility() {
        const plan = $('facilityPlan');
        for (const [id, r] of Object.entries(ROOMS)) {
            const art = el('span', { class: `fr-art fr-art-${id}`, 'aria-hidden': 'true' });
            for (let i = 0; i < 6; i++) art.append(el('i'));
            const camLabel = `CAM ${String(Object.keys(ROOMS).indexOf(id) + 1).padStart(2, '0')}`;
            const cam = CAMERAS[id]
                ? el('span', { class: 'fr-cam', 'aria-hidden': 'true', hidden: true }, [
                    el('span', { class: 'fr-feed' }),
                    el('span', { class: 'fr-cam-label', text: camLabel })])
                : null;
            const tile = el('button', { type: 'button', class: `facility-room fr-${id}`, 'data-room-id': id }, [
                art, cam,
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
        // The die: pins round the edge.
        for (const side of ['top', 'bottom', 'left', 'right']) plan.append(el('span', { class: `die-pins ${side}`, 'aria-hidden': 'true' }));
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
            setHidden(tile, !unlocked && !sealed);
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
        setCameras(id === 'facility');
        setLaneTimer(id === 'facility' || id === 'servers');
        for (const r of document.querySelectorAll('.room')) r.hidden = r.dataset.room !== id;
        document.body.dataset.view = id;
        if (ROOMS[id]) {
            seenRooms.add(id);
            storageSet(SEEN_KEY, JSON.stringify([...seenRooms]));
        }
        if (id === 'servers') startPathLoop();
        if (state) renderMinimap();
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
        refreshCameras();
        const { tileBox, origin, scale } = roomZoom(from);
        $('facility').style.transformOrigin = origin;
        $('facility').animate([{ transform: `scale(${scale})`, opacity: 0 }, { transform: 'none', opacity: 1 }], ZOOM);
        room.style.transformOrigin = '0 0';
        room.animate([{ transform: 'none', opacity: 1 }, { transform: tileBox, opacity: 0 }], ZOOM).finished.then(done, done);
    }

    // ---- Jumping and the minimap ---------------------------------------------

    // Where you are: 'facility', a room id, or 'bay:<id>'.
    const currentPlace = () => (openBay && view === 'servers' ? `bay:${openBay}` : view);

    function closeBayNow() {
        if (!openBay) return;
        openBay = null;
        $('moduleView').hidden = true;
        $('hub').hidden = false;
    }

    // Go straight to any area (a quick fade instead of zooming through the rooms in between).
    function jumpTo(target) {
        if (zooming || target === currentPlace()) return;
        const bay = target.startsWith('bay:') ? target.slice(4) : null;
        const room = bay ? 'servers' : target;
        if (room !== 'facility' && !roomOpen(room)) return;
        if (bay && !(bayUnlocked(bay) && BAYS[bay].built)) return;
        storageSet(VIEW_KEY, room);
        const go = () => {
            closeBayNow();
            showView(room);
            if (bay) enterBay(bay, $('bays').querySelector(`.bay[data-bay="${bay}"]`));
            renderMinimap();
        };
        if (reducedMotion()) return go();
        zooming = true;
        $('stage').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140 }).finished.then(() => {
            zooming = false;
            go();
            $('stage').animate([{ opacity: 0, transform: 'scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
        });
    }

    // The minimap is a microchip: each open room a block wired to the centre, the server room's bays
    // sub-blocks, and the next sealed areas dim outlines. More areas, more blocks, traces and pins. The chip
    // itself (its body, edge and pins) and the title are the way back to Surveillance.
    const MINIMAP_HUB = { x: 60, y: 59 };
    const MINIMAP = {
        lab: { x: 24, y: 44, w: 20, h: 30, label: 'LAB' },
        servers: { x: 74, y: 44, w: 22, h: 52, label: 'SRV' },
        rnd: { x: 24, y: 78, w: 46, h: 18, label: 'R&D' },
        boardroom: { x: 24, y: 22, w: 22, h: 16, label: 'BRD' },
        signals: { x: 50, y: 22, w: 20, h: 16, label: 'SIG' },
        mirror: { x: 74, y: 22, w: 22, h: 16, label: 'MIR' }
    };
    let minimapKey = '';

    function renderMinimap() {
        const nav = $('minimap');
        const show = !!state.unlocked['module:path'];
        nav.hidden = !show;
        document.body.classList.toggle('has-minimap', show);
        if (!show) return;
        const sealedShown = new Set([...$('facilityPlan').querySelectorAll('.facility-room.locked:not([hidden])')].map(t => t.dataset.roomId));
        const areas = Object.keys(ROOMS).filter(id => MINIMAP[id] && (roomUnlocked(id) || sealedShown.has(id)));
        const bays = Object.keys(BAYS).filter(id => bayUnlocked(id) || id === nextSealedBay());
        const here = currentPlace();
        const key = [areas, bays, here].join('|');
        if (key === minimapKey) return;
        minimapKey = key;
        const open = id => roomOpen(id);
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '13 13 94 94');   // cropped into the pins, so the chip fills its holder
        const add = (tag, attrs, parent = svg) => {
            const n = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
            parent.append(n);
            return n;
        };
        // The chip body (pins and die) is one target: Surveillance. Hovering it lights the whole chip.
        const body = add('g', { class: `mm-body${here === 'facility' ? ' here' : ''}`, 'data-target': 'facility', role: 'button', tabindex: 0, 'aria-label': 'Surveillance' });
        add('title', {}, body).textContent = 'Surveillance';
        const pins = 3 + areas.filter(open).length + bays.filter(bayUnlocked).length;
        for (let i = 0; i < pins; i++) {
            const t = 22 + (i + 0.5) * (76 / pins);
            add('rect', { class: 'mm-pin', x: t - 1.2, y: 10, width: 2.4, height: 8 }, body);
            add('rect', { class: 'mm-pin', x: t - 1.2, y: 102, width: 2.4, height: 8 }, body);
            add('rect', { class: 'mm-pin', x: 10, y: t - 1.2, width: 8, height: 2.4 }, body);
            add('rect', { class: 'mm-pin', x: 102, y: t - 1.2, width: 8, height: 2.4 }, body);
        }
        add('rect', { class: 'mm-die', x: 18, y: 18, width: 84, height: 84, rx: 4 }, body);
        // Traces from a via at the centre to every open area.
        const cx = MINIMAP_HUB.x;
        const cy = MINIMAP_HUB.y;
        add('circle', { class: 'mm-via', cx, cy, r: 1.8 });
        for (const id of areas.filter(a => open(a))) {
            const b = MINIMAP[id];
            add('path', { class: 'mm-trace', d: `M${cx} ${cy} H${b.x + b.w / 2} V${b.y + b.h / 2}` });
        }
        const block = (target, b, cls, label, title) => {
            const g = add('g', { class: `mm-block ${cls}${here === target ? ' here' : ''}`, 'data-target': target, tabindex: cls.includes('sealed') ? -1 : 0, role: 'button', 'aria-label': title });
            add('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.5 }, g);
            if (label) add('text', { x: b.x + b.w / 2, y: b.y + (b.h < 14 ? b.h / 2 + 1.6 : 7), 'text-anchor': 'middle' }, g).textContent = label;
            add('title', {}, g).textContent = title;
        };
        for (const id of areas) {
            const b = MINIMAP[id];
            if (open(id)) block(id, b, 'room', b.label, ROOMS[id].name);
            else block(id, b, roomUnlocked(id) ? 'room building' : 'room sealed', '?', roomUnlocked(id) ? `${ROOMS[id].name} (being built)` : 'Sealed');
        }
        // The server room's bays, as cells inside its block.
        if (open('servers')) {
            const sb = MINIMAP.servers;
            bays.forEach((id, i) => {
                const cell = { x: sb.x + 3, y: sb.y + 11 + i * 10, w: sb.w - 6, h: 8 };
                const live = bayUnlocked(id) && BAYS[id].built;
                block(`bay:${id}`, cell, live ? 'bay' : 'bay sealed', '', live ? BAYS[id].name : 'Sealed');
            });
        }
        $('minimapChip').replaceChildren(svg, el('span', { class: 'mm-label', text: `You are in: ${placeName(here)}` }));
    }

    // A place as a path segment: "Training Cluster" → training_cluster.
    const crumbName = name => name.toLowerCase().replace(/&/g, '_and_').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    function placeName(place) {
        if (place.startsWith('bay:')) return BAYS[place.slice(4)].name;
        return place === 'facility' ? 'Surveillance' : ROOMS[place].name;
    }

    function buildMinimap() {
        const nav = $('minimap');
        const go = e => {
            const g = e.target.closest('.mm-block, .mm-body');
            if (g && !g.classList.contains('sealed') && !g.classList.contains('building')) jumpTo(g.dataset.target);
        };
        nav.addEventListener('click', go);
        nav.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go(e);
            }
        });
        for (const b of document.querySelectorAll('[data-jump]')) b.addEventListener('click', () => jumpTo(b.dataset.jump));
    }

    // ---- Investor projects (lab) -------------------------------------------

    // Rows are rebuilt only when the offers change (render runs every tick, and rebuilding a button
    // mid-click would swallow the click); progress and timers update in place.
    let projectsKey = '';
    let projectSlots = Array(E.PROJECTS.maxOffers).fill(null);   // offer id per slot (null = free)

    function renderProjects() {
        const list = $('projectList');
        const p = state.projects;
        const t = state.stats.playTime;
        const left = secs => (secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${Math.ceil(secs)} s`);
        // Active boosts by stat (older saves may still hold compute, data, XP or sprint boosts).
        const BOOST_NAMES = { rp: 'research', cp: 'compute', dp: 'data', xp: 'XP', push: 'sprints' };
        setText($('boosts'), p.boosts.map(b => `+${Math.round((b.mult - 1) * 100)}% ${BOOST_NAMES[b.stat] || b.stat} · ${left(b.until - t)}`).join('  ·  '));
        // Fixed slots: an offer keeps its slot until it's claimed or expires; new ones take the first free
        // slot. Nothing shuffles up when one goes, so the Claim you were aiming for stays put.
        const ids = new Set(p.offers.map(o => o.id));
        projectSlots = projectSlots.map(id => (ids.has(id) ? id : null));
        for (const o of p.offers) {
            if (projectSlots.includes(o.id)) continue;
            const free = projectSlots.indexOf(null);
            if (free >= 0) projectSlots[free] = o.id;
        }
        const slotOffer = id => p.offers.find(o => o.id === id);
        const key = projectSlots.map(id => (id == null ? '-' : `${id}:${E.projectProgress(state, slotOffer(id)) >= slotOffer(id).target}`)).join(',');
        if (key !== projectsKey) {
            projectsKey = key;
            list.replaceChildren(...projectSlots.map(id => {
                const o = id == null ? null : slotOffer(id);
                if (!o) return el('li', { class: 'offer open', text: 'Line open' });
                const done = E.projectProgress(state, o) >= o.target;
                const claim = el('button', { type: 'button', class: 'button project-claim', text: 'Claim', disabled: !done });
                claim.addEventListener('click', () => {
                    const r = E.claimProject(state, o.id);
                    log(r.msg, r.ok ? 'success' : 'warning');
                    if (r.ok) {
                        termLog(`project paid out: ${E.PROJECT_REWARDS[o.reward].text}`);
                    }
                    afterChange();
                });
                const drop = el('button', { type: 'button', class: 'project-drop', 'aria-label': 'Ignore this project', text: '×' });
                drop.addEventListener('click', () => {
                    E.dismissProject(state, o.id);
                    afterChange();
                });
                const task = E.PROJECT_TASKS[o.task].text(o.target);
                const reward = E.PROJECT_REWARDS[o.reward].text;
                return el('li', { class: `offer${done ? ' done' : ''}`, 'data-id': o.id, title: `${task}. Reward: ${reward}` }, [
                    el('span', { class: 'project-reward', text: reward }),
                    el('span', { class: 'project-task', text: task }),
                    el('span', { class: 'project-bar' }, [el('span', { class: 'project-fill' })]),
                    el('span', { class: 'project-time' }),
                    claim, drop
                ]);
            }));
        }
        for (const o of p.offers) {
            const row = list.querySelector(`[data-id="${o.id}"]`);
            if (!row) continue;
            const prog = E.projectProgress(state, o);
            row.querySelector('.project-fill').style.width = `${(prog / o.target) * 100}%`;
            setText(row.querySelector('.project-time'), `${E.format(Math.min(prog, o.target))}/${E.format(o.target)} · ${left(o.deadline - t)}`);
        }
    }

    // ---- Scheduled tasks ----------------------------------------------------
    // Every automation is a scheduled task with its own switch; the converters (crawler, research) also
    // get a slider: the share of each second's compute dedicated to them (engine taskShares). Shares
    // never add up to more than 100%, so the part a slider can't reach is hatched. Cleared legs lapping
    // on the rack are listed too (they need no compute).
    const TASK_UPGRADES = { autoCollector: 'autoCollector', researchAssistant: 'researchAssistant', autoTrainer: 'autoTrainer' };
    const taskUi = {};

    // Each task shows a bar filling at the rate it earns (one fill = one collection, one research, one
    // lap of a cleared leg). Cleared legs are listed one per skill, named after it.
    const taskProgress = { autoCollector: 0, researchAssistant: 0 };
    const bar = () => el('span', { class: 'task-bar' }, [el('span', { class: 'task-fill' })]);

    function buildTasks() {
        const list = $('taskList');
        for (const t of E.TASKS) {
            const toggle = el('button', { type: 'button', class: 'task-toggle', role: 'switch', 'aria-label': `${t.name}: on or off` });
            toggle.addEventListener('click', () => {
                E.setTaskOn(state, t.id, !E.taskOn(state, t.id));
                afterChange();
                save();
                if (t.id === 'autoTrainer') startPathLoop();
            });
            let slider = null;
            if (t.budget) {
                slider = el('input', { type: 'range', class: 'task-slider', min: 0, max: 100, step: Math.round(E.AUTO_BUDGET.step * 100), 'aria-label': `${t.name}: dedicated compute` });
                slider.addEventListener('input', () => {
                    slider.value = Math.round(E.setTaskShare(state, t.id, Number(slider.value) / 100) * 100);
                    render();
                });
                slider.addEventListener('change', () => save());
            }
            const rate = el('span', { class: 'task-rate' });
            const share = el('span', { class: 'task-share' });
            const progress = t.budget ? bar() : null;
            const row = el('li', { class: `task task-${t.id}`, hidden: true }, [
                el('div', { class: 'task-head' }, [el('span', { class: 'task-name', text: t.name }), toggle]),
                rate,
                progress,
                slider ? el('div', { class: 'task-budget' }, [slider, share]) : null
            ].filter(Boolean));
            list.append(row);
            taskUi[t.id] = { row, toggle, slider, rate, share, fill: progress?.firstChild };
        }
        taskUi.skills = [];
        // The log lives at the foot of the same panel (installs, payouts).
        ui.termLines = el('span', { class: 'terminal-log' });
        $('taskPanel').append(el('div', { class: 'task-log', hidden: true }, [el('span', { class: 'task-log-title', text: 'Log' }), ui.termLines]));
    }

    // One row per learned skill: its cleared leg laps on its own, adding compute and XP.
    function skillTaskRow(k) {
        const fill = el('span', { class: 'task-fill' });
        const rate = el('span', { class: 'task-rate' });
        const row = el('li', { class: 'task task-skill' }, [
            el('div', { class: 'task-head' }, [el('span', { class: 'task-name', text: E.skillAt(k).name }), el('span', { class: 'task-always', text: `leg ${k + 1}` })]),
            rate,
            el('span', { class: 'task-bar' }, [fill])
        ]);
        $('taskList').append(row);
        return { row, fill, rate };
    }

    // Advance the job bars (called every tick with the game time that passed).
    function advanceTasks(dt) {
        const d = E.derive(state, debugRates);
        taskProgress.autoCollector = (taskProgress.autoCollector + d.collectsPerSec * dt) % 1;
        taskProgress.researchAssistant = (taskProgress.researchAssistant + d.researchPerSec * dt) % 1;
    }

    function renderTasks(d) {
        const f = E.format;
        const owned = id => E.level(state, TASK_UPGRADES[id]) > 0;
        const learned = state.path.learned;
        const logged = lab.lines.length > 0 && !!state.unlocked['seen:dp'];
        const any = E.TASKS.some(t => owned(t.id)) || learned > 0;
        setHidden($('taskPanel'), !any);
        if (!any) return;
        setHidden($('taskPanel').querySelector('.task-log'), !logged);
        const shares = E.taskShares(state);
        let dedicated = 0;
        for (const t of E.TASKS) {
            const u = taskUi[t.id];
            const was = !u.row.hidden;
            setHidden(u.row, !owned(t.id));
            if (!owned(t.id)) continue;
            // A new automation draws its connection from the card that bought it.
            if (!was && revealReady && ui.upgrades[t.id] && !ui.upgrades[t.id].card.hidden) connect(ui.upgrades[t.id].card, u.row);
            const on = E.taskOn(state, t.id);
            u.row.classList.toggle('off', !on);
            u.toggle.setAttribute('aria-checked', String(on));
            setText(u.toggle, on ? 'On' : 'Off');
            if (t.id === 'autoCollector') setText(u.rate, on ? `${f(d.collectsPerSec, 2)}/s → +${f(d.dpPerSec)} DP/s` : 'Paused');
            if (t.id === 'researchAssistant') setText(u.rate, on ? `${f(d.researchPerSec, 2)}/s → +${f(d.rpPerSec)} RP/s` : 'Paused');
            if (t.id === 'autoTrainer') setText(u.rate, on ? `Level ${E.level(state, 'autoTrainer')} · ${E.level(state, 'autoTrainer') >= 2 ? 'starts runs and times its sprints' : 'starts runs and sprints when stalled'}` : 'Paused');
            if (u.fill) u.fill.style.width = `${(on ? taskProgress[t.id] : 0) * 100}%`;
            if (!u.slider) continue;
            const pct = Math.round((state.tasks[t.id].share ?? 0) * 100);
            const others = Math.round(E.TASKS.filter(o => o.budget && o.id !== t.id && E.taskOn(state, o.id) && owned(o.id))
                .reduce((a, o) => a + shares[o.id], 0) * 100);
            if (document.activeElement !== u.slider) u.slider.value = pct;
            u.slider.disabled = !on;
            u.slider.style.setProperty('--reach', `${100 - others}%`);
            u.slider.style.setProperty('--pct', `${u.slider.value}%`);
            const task = d.tasks[t.id];
            dedicated += on ? shares[t.id] : 0;
            setText(u.share, on ? `${pct}% · ${f(task.cp)} CP/s${task.speed < 1 ? ' · capped' : ''}` : `${pct}%`);
            u.share.classList.toggle('capped', on && task.speed < 1);
        }
        setText($('taskTotal'), dedicated ? `${Math.round(dedicated * 100)}% of compute` : '');
        // Skill rows: added as skills are learned (in order), removed if the run resets.
        while (taskUi.skills.length > learned) taskUi.skills.pop().row.remove();
        // One new skill gets its reveal and connection; a burst (a load, a debug jump) just appears.
        const single = learned - taskUi.skills.length === 1;
        while (taskUi.skills.length < learned) {
            const k = taskUi.skills.length;
            const r = skillTaskRow(k);
            taskUi.skills.push(r);
            if (revealReady && single) {
                revealIn(r.row);
                connect(document.querySelector('.cell-cp'), r.row);
            }
        }
        for (let k = 0; k < learned; k++) {
            const r = taskUi.skills[k];
            const laps = state.path.auto[k] || 0;
            const cp = E.PATH.clearedCp + Math.min(E.PATH.lapCpMax, E.PATH.lapCp * laps);
            setText(r.rate, `lap ${Math.floor(laps)} · +${(cp * 100).toFixed(1)}% CP · +${f(E.stretchXpAt(k) * E.PATH.clearedRate, 2)} XP/s`);
            r.fill.style.width = `${(laps % 1) * 100}%`;
        }
    }

    // Connections: when something new starts working for you, a glowing signal line draws from what
    // started it to its task, behind the panels, then fades.
    function connect(from, to) {
        if (reducedMotion() || !from || !to || view !== 'lab') return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const room = $('labRoom');
            const z = uiScale();
            const box = room.getBoundingClientRect();
            const a = from.getBoundingClientRect();
            const b = to.getBoundingClientRect();
            if (!a.width || !b.width) return;
            const pt = (x, y) => [(x - box.left) / z, (y - box.top) / z];
            const [sx, sy] = pt(a.right, a.top + a.height / 2);
            const [tx, ty] = pt(b.left, b.top + b.height / 2);
            const back = tx < sx;
            const [x1, y1] = back ? pt(a.left, a.top + a.height / 2) : [sx, sy];
            const [x2, y2] = back ? pt(b.right, b.top + b.height / 2) : [tx, ty];
            const mid = (x1 + x2) / 2;
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'signal-line');
            svg.setAttribute('width', box.width / z);
            svg.setAttribute('height', box.height / z);
            const d = `M${x1} ${y1} H${mid} V${y2} H${x2}`;
            for (const cls of ['signal-glow', 'signal-core', 'signal-pulse']) {
                const path = document.createElementNS(NS, 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', cls);
                svg.append(path);
            }
            // A node at each end, so it reads as a wire from one thing to the other.
            for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
                const dot = document.createElementNS(NS, 'circle');
                dot.setAttribute('cx', cx);
                dot.setAttribute('cy', cy);
                dot.setAttribute('r', 4);
                dot.setAttribute('class', 'signal-end');
                svg.append(dot);
            }
            room.append(svg);
            const len = svg.querySelector('path').getTotalLength();
            for (const path of svg.querySelectorAll('.signal-glow, .signal-core')) {
                path.style.strokeDasharray = `${len}`;
                path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: 'ease-in-out', fill: 'both' });
            }
            const pulse = svg.querySelector('.signal-pulse');
            pulse.style.strokeDasharray = `24 ${len}`;
            pulse.animate([{ strokeDashoffset: 24 }, { strokeDashoffset: -len }], { duration: 900, delay: 700, iterations: 3, easing: 'ease-in' });
            setTimeout(() => {
                to.classList.add('task-linked');
                setTimeout(() => to.classList.remove('task-linked'), 1600);
            }, 900);
            svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 5200 }).finished.then(() => svg.remove(), () => svg.remove());
        }));
    }

    // ---- Lab layout -------------------------------------------------------------
    // The lab is one grid of named areas, laid out from what is open (so open things share the floor):
    // wide screens put the workbench, the stations and the scheduled tasks side by side over one screen,
    // with the Isolation chamber under the software terminal, investor projects under the research wall,
    // and the cabinets (from the left edge) and the log (beside the minimap) along the bottom. Desktop
    // stacks them in fixed-height rows. Rebuilt only when what's open or the screen tier changes.
    let labLayoutKey = '';
    const WIDE = window.matchMedia('(min-width: 1800px)');
    const DESKTOP = window.matchMedia('(min-width: 961px)');

    function layoutLab() {
        const shown = id => !$(id).hidden;
        const tab = id => !ui.stations[id].node.hidden;
        const has = { sw: tab('software'), rs: tab('algorithms'), cs: tab('consciousness'), proj: shown('projectPanel'), tasks: shown('taskPanel') };
        const tier = WIDE.matches ? 'wide' : DESKTOP.matches ? 'desktop' : 'narrow';
        const key = `${tier}:${Object.values(has).map(Number).join('')}`;
        if (key === labLayoutKey) return;
        labLayoutKey = key;
        const room = $('labRoom');
        // Panels make room smoothly when the grid changes (makeRoom), instead of jumping.
        if (room.style.gridTemplateAreas) makeRoom();
        room.dataset.tier = tier;
        if (tier === 'narrow') {
            room.style.gridTemplateAreas = room.style.gridTemplateColumns = room.style.gridTemplateRows = '';
            return;
        }
        const q = rows => rows.map(r => `"${r.join(' ')}"`).join(' ');
        if (tier === 'wide') {
            // Columns: each [top, bottom].
            const cols = [['bench', 'bench'], ['hw', 'hw']];
            if (has.sw) cols.push(['sw', has.cs ? 'cs' : 'sw']);
            if (has.rs || has.proj) cols.push([has.rs ? 'rs' : 'proj', has.proj ? 'proj' : 'rs']);
            if (has.tasks) cols.push(['tasks', 'tasks']);
            const n = cols.length;
            const bottom = cols.map(() => 'cab');
            const split = cols.some(c => c[0] !== c[1]);
            room.style.gridTemplateColumns = cols.map(c => (c[0] === 'bench' || c[0] === 'tasks' ? 'minmax(260px, 300px)' : 'minmax(0, 1fr)')).join(' ');
            room.style.gridTemplateRows = `auto var(--supply-h) minmax(0, 1.5fr) ${split ? 'minmax(0, 1fr)' : '0px'} var(--bottom-h)`;
            room.style.gridTemplateAreas = q([cols.map(() => 'bar'), cols.map(() => 'supply'), cols.map(c => c[0]), cols.map(c => c[1]), bottom]);
            return;
        }
        // Desktop: the workbench and hardware side by side at the same height, then tasks beside the research
        // wall (projects under it) and the Isolation chamber, then cabinets from the left edge and the log.
        const third = has.sw ? 'sw' : 'hw';
        const rows = [['bar', 'bar', 'bar'], ['supply', 'supply', 'supply'], ['bench', 'hw', third]];
        const sizes = ['auto', 'var(--supply-h)', 'var(--station-row)'];
        if (has.rs || has.proj || has.tasks || has.cs) {
            const left = has.tasks ? 'tasks' : '.';
            const mid = has.rs ? 'rs' : has.proj ? 'proj' : '.';
            rows.push([left, mid, has.cs ? 'cs' : '.']);
            sizes.push('var(--station-row-2)');
            if (has.rs && has.proj) {
                rows.push([left, 'proj', has.cs ? 'cs' : '.']);
                sizes.push('var(--projects-h)');
            }
        }
        rows.push(['cab', 'cab', 'cab']);
        sizes.push('auto');
        room.style.gridTemplateColumns = 'minmax(250px, 290px) minmax(0, 1fr) minmax(0, 1fr)';
        room.style.gridTemplateRows = sizes.join(' ');
        room.style.gridTemplateAreas = q(rows);
    }

    // ---- Server room hub ---------------------------------------------------

    // Bays in the server room. Each is a training module; only the Training Cluster is built so far.
    const BAYS = {
        training: { name: 'Training Cluster', built: true, unlocked: () => !!state.unlocked['module:path'],
            lockedText: () => 'Locked · collect data to power it up' },
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
    // Lanes on the Training Cluster, drawn by drawLanes():
    // - lane 0 (three blade columns) is the current stretch;
    // - then one lane (two columns) per cleared stretch, newest first, up to MAX_CLEARED_LANES: that
    //   section now trains itself, slowly, and its ball crawls along it (E.derive().xpPerSec).
    // Concurrent runs (planned) will add live lanes the same way.
    const MAX_CLEARED_LANES = 6;
    let hoverLane = null;       // cleared lane under the pointer on the rack (shows "Replay")
    const clearedLanes = () => Math.min(state.path.learned, MAX_CLEARED_LANES);

    // Clicking a cleared lane opens the bay set to replay from that leg; the rest of the bay opens the frontier.
    function buildTrainingArt() {
        const art = $('bay-training').querySelector('.bay-art');
        const cleared = clearedLanes();
        // In the order you went through them: cleared legs oldest first, then the frontier you're on.
        art.replaceChildren();
        for (let i = cleared; i >= 1; i--) {
            const k = state.path.learned - i;
            art.append(el('canvas', { class: 'lane cleared', 'data-lane': i, 'data-leg': k, title: `Replay from ${E.skillAt(k).name}` }));
        }
        art.append(el('canvas', { class: 'lane', 'data-lane': 0, title: 'The frontier: your next skill' }));
        for (let i = 0; i < BAY_ART.training - 3 - 2 * cleared; i++) art.append(el('i'));
        art.dataset.cleared = cleared;
        art.dataset.learned = state.path.learned;
    }

    function buildHub() {
        for (const node of $('bays').querySelectorAll('.bay')) {
            if (node.dataset.bay === 'training') continue;
            const art = node.querySelector('.bay-art');
            for (let i = 0; i < BAY_ART[node.dataset.bay]; i++) art.append(el('i'));
        }
        for (const node of $('bays').querySelectorAll('.bay')) {
            node.addEventListener('click', e => {
                if (node.dataset.bay === 'training' && !openBay && bayUnlocked('training')) {
                    hoverLane = null;
                    const lane = e.target.closest('canvas.lane');
                    setStartLeg(lane && lane.dataset.leg != null ? Number(lane.dataset.leg) : null);
                }
                enterBay(node.dataset.bay, node);
            });
        }
        // Cleared lanes say what clicking them does while the pointer is on them.
        const art = $('bay-training').querySelector('.bay-art');
        art.addEventListener('pointerover', e => {
            const lane = e.target.closest('canvas.lane.cleared');
            hoverLane = lane ? Number(lane.dataset.lane) : null;
        });
        art.addEventListener('pointerleave', () => { hoverLane = null; });
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
        setText($('moduleTitle'), crumbName(bay.name));
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
        const bayNode = $('bays').querySelector(`.bay[data-bay="${openBay}"]`);
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
        if (Number($('bay-training').querySelector('.bay-art').dataset.learned) !== state.path.learned) buildTrainingArt();
        const sealed = nextSealedBay();
        for (const node of $('bays').querySelectorAll('.bay')) {
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
        lock: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
        dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
        flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.2 3 2.5 3-1-3 0-6 0-8z"/>',
        wave: '<path d="M2 9c3-4 5-4 8 0s5 4 8 0M2 15c3-4 5-4 8 0s5 4 8 0"/>',
        spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'
    };
    const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

    const treeUi = { nodes: {}, links: [], bounds: null };

    function treeNodes() {
        return E.UPGRADES.filter(u => u.tab === 'training');
    }

    // Fixed cells around the centre: a node's place never changes, so new unlocks appear where they
    // are without moving anything (or the view). The cell size comes from CSS (--cell).
    const treeCell = () => parseFloat(getComputedStyle($('treeViewport')).getPropertyValue('--cell')) || 112;

    function placeNode(node, x, y) {
        const cell = treeCell();
        node.style.left = `${x * cell}px`;
        node.style.top = `${y * cell}px`;
    }

    function buildTree() {
        const nodes = treeNodes();
        const tree = $('skillTree');

        // Compass labels sit on the view's edges, not in the tree, so they stay put while you pan.
        for (const branch of E.TREE_BRANCHES) {
            $('treeViewport').append(el('div', { class: `tree-branch tree-branch-${branch.dir}`, title: branch.blurb }, [
                el('strong', { text: branch.name }), el('span', { text: branch.blurb })
            ]));
        }

        treeUi.built = true;

        const svg = $('treeLinks');
        for (const up of nodes) {
            if (up.requires) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('vector-effect', 'non-scaling-stroke');
                svg.append(line);
                treeUi.links.push({ up, line, from: E.UPGRADE_BY_ID[up.requires].tree });
            }

            const button = el('button', { type: 'button', class: `tree-node${up.requires ? '' : ' seed'}` });
            button.innerHTML = `<span class="tree-icon">${icon(up.icon)}</span><span class="tree-lock">${icon('lock')}</span><span class="tree-level"></span>`;
            button.addEventListener('click', () => {
                path.selected = up.id;
                treeUi.popup = true;
                renderTree();
            });
            tree.append(button);
            treeUi.nodes[up.id] = button;
        }
        path.selected = 'initialWeights';
        $('startRunButton').addEventListener('click', () => showTrainingView('run'));
        $('treeButton').addEventListener('click', () => showTrainingView('dev'));
        $('legSelect').addEventListener('change', e => setStartLeg(e.target.value === '' ? null : Number(e.target.value)));
        $('legTagClear').addEventListener('click', () => setStartLeg(null));
    }

    // ---- Skill tree camera: drag to pan, wheel / pinch / buttons to zoom ----

    const treeCam = { x: 0, y: 0, z: 1, pointers: new Map(), drag: null, moved: false };
    const TREE_ZOOM = { min: 0.5, max: 2.5, step: 1.25 };

    // The view (pan and zoom) is remembered between visits and sessions.
    const TREE_CAM_KEY = 'agiTreeCam';
    let treeCamSave = 0;

    function applyTreeCam() {
        $('skillTree').style.transform = `translate(${treeCam.x}px, ${treeCam.y}px) scale(${treeCam.z})`;
        placeNodePopup();
        clearTimeout(treeCamSave);
        treeCamSave = setTimeout(() => storageSet(TREE_CAM_KEY, JSON.stringify({ x: treeCam.x, y: treeCam.y, z: treeCam.z })), 300);
    }

    function restoreTreeCam() {
        try {
            const v = JSON.parse(storageGet(TREE_CAM_KEY) || 'null');
            if (v && [v.x, v.y, v.z].every(Number.isFinite)) {
                Object.assign(treeCam, { x: v.x, y: v.y, z: Math.min(TREE_ZOOM.max, Math.max(TREE_ZOOM.min, v.z)) });
            }
        } catch { /* keep the default view */ }
        $('skillTree').style.transform = `translate(${treeCam.x}px, ${treeCam.y}px) scale(${treeCam.z})`;
    }

    // Zoom to `z`, keeping the point (px, py) of the viewport (page pixels) still.
    function zoomTreeAt(z, px, py) {
        const tree = $('skillTree');
        z = Math.min(TREE_ZOOM.max, Math.max(TREE_ZOOM.min, z));
        const bx = tree.offsetLeft;
        const by = tree.offsetTop;
        const wx = (px - bx - treeCam.x) / treeCam.z;
        const wy = (py - by - treeCam.y) / treeCam.z;
        treeCam.z = z;
        treeCam.x = px - bx - wx * z;
        treeCam.y = py - by - wy * z;
        applyTreeCam();
    }

    function resetTreeCam() {
        Object.assign(treeCam, { x: 0, y: 0, z: 1 });
        applyTreeCam();
    }

    // Pointer position inside the viewport, in page pixels (the page may be zoomed on large screens).
    function treePoint(e) {
        const r = $('treeViewport').getBoundingClientRect();
        const z = uiScale();
        return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
    }

    function buildTreeCamera() {
        const vp = $('treeViewport');
        restoreTreeCam();
        const centre = () => ({ x: vp.clientWidth / 2, y: vp.clientHeight / 2 });
        for (const b of vp.querySelectorAll('[data-zoom]')) {
            b.addEventListener('click', () => {
                const c = centre();
                if (b.dataset.zoom === 'reset') resetTreeCam();
                else zoomTreeAt(treeCam.z * (b.dataset.zoom === 'in' ? TREE_ZOOM.step : 1 / TREE_ZOOM.step), c.x, c.y);
            });
        }
        vp.addEventListener('wheel', e => {
            e.preventDefault();
            const p = treePoint(e);
            zoomTreeAt(treeCam.z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        }, { passive: false });
        vp.addEventListener('pointerdown', e => {
            if (e.target.closest('.tree-zoom') || (e.pointerType === 'mouse' && e.button !== 0)) return;
            treeCam.pointers.set(e.pointerId, treePoint(e));
            treeCam.moved = false;
            treeCam.drag = { x: treeCam.x, y: treeCam.y, start: treePoint(e) };
            if (treeCam.pointers.size === 2) {
                const [a, b] = [...treeCam.pointers.values()];
                treeCam.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: treeCam.z };
            }
        });
        vp.addEventListener('pointermove', e => {
            if (!treeCam.pointers.has(e.pointerId)) return;
            const p = treePoint(e);
            treeCam.pointers.set(e.pointerId, p);
            if (treeCam.pointers.size === 2 && treeCam.pinch) {
                const [a, b] = [...treeCam.pointers.values()];
                treeCam.moved = true;
                zoomTreeAt(treeCam.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / treeCam.pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
                return;
            }
            const d = treeCam.drag;
            if (!d) return;
            const dx = p.x - d.start.x;
            const dy = p.y - d.start.y;
            // A small wobble is still a click; past a few pixels it is a drag.
            if (!treeCam.moved && Math.hypot(dx, dy) < 5) return;
            if (!treeCam.moved) vp.setPointerCapture(e.pointerId);
            treeCam.moved = true;
            vp.classList.add('dragging');
            treeCam.x = d.x + dx;
            treeCam.y = d.y + dy;
            applyTreeCam();
        });
        const end = e => {
            treeCam.pointers.delete(e.pointerId);
            if (treeCam.pointers.size < 2) treeCam.pinch = null;
            if (!treeCam.pointers.size) {
                treeCam.drag = null;
                vp.classList.remove('dragging');
            }
        };
        vp.addEventListener('pointerup', end);
        vp.addEventListener('pointercancel', end);
        // A drag that ends on a node must not select it.
        vp.addEventListener('click', e => {
            if (treeCam.moved) {
                e.stopPropagation();
                e.preventDefault();
                treeCam.moved = false;
            }
        }, true);
        // A plain click on empty space closes the node popup.
        vp.addEventListener('click', e => {
            if (!e.target.closest('.tree-node, .node-detail, .tree-zoom, .dev-actions')) {
                treeUi.popup = false;
                placeNodePopup();
            }
        });
        vp.addEventListener('dblclick', e => { if (!e.target.closest('.tree-node, .tree-zoom')) resetTreeCam(); });
    }

    // Node state: hidden (more than one step from anything buyable), locked (its parent isn't owned
    // yet), owned, maxed, or available (affordable or not).
    function nodeState(up) {
        // Legacy nodes don't exist, not even as locks, until the first new version ships.
        if (up.legacy && !state.prestige.count && !E.level(state, up.id)) return 'hidden';
        if (!E.isUpgradeVisible(state, up)) {
            // Secrets never preview; the rest show as an unknown lock one step past what you can buy.
            const parent = up.requires && E.UPGRADE_BY_ID[up.requires];
            return up.secret || (parent && !E.isUpgradeVisible(state, parent)) ? 'hidden' : 'locked';
        }
        if (E.isMaxed(state, up)) return 'maxed';
        const lvl = E.level(state, up.id);
        const affordable = E.canAfford(state, E.upgradeCost(up, lvl));
        return lvl > 0 ? (affordable ? 'owned can-buy' : 'owned') : (affordable ? 'available can-buy' : 'available');
    }

    function renderTree() {
        if (!treeUi.built) return;
        const states = Object.fromEntries(treeNodes().map(up => [up.id, nodeState(up)]));
        const shown = treeNodes().filter(up => states[up.id] !== 'hidden');
        const cell = treeCell();
        if (path.selected && states[path.selected] === 'hidden') path.selected = shown[0].id;
        for (const up of treeNodes()) {
            const node = treeUi.nodes[up.id];
            const st = states[up.id];
            setHidden(node, st === 'hidden');
            placeNode(node, up.tree.x, up.tree.y);
            node.className = `tree-node ${st}${up.requires ? '' : ' seed'}${up.legacy ? ' legacy' : ''}${path.selected === up.id ? ' selected' : ''}`;
            const lvl = E.level(state, up.id);
            node.querySelector('.tree-level').textContent = st === 'locked' ? '' : `${lvl}/${up.max ?? '∞'}`;
            node.setAttribute('aria-label', st === 'locked' ? 'Unknown research, locked' : `${up.name}: level ${lvl}`);
            node.setAttribute('aria-pressed', String(path.selected === up.id));
        }
        for (const { up, line, from } of treeUi.links) {
            line.setAttribute('x1', from.x * cell);
            line.setAttribute('y1', from.y * cell);
            line.setAttribute('x2', up.tree.x * cell);
            line.setAttribute('y2', up.tree.y * cell);
            line.style.display = states[up.id] === 'hidden' ? 'none' : '';
            const parentOwned = !up.requires || E.level(state, up.requires) > 0;
            const owned = E.level(state, up.id) > 0;
            line.setAttribute('class', owned && parentOwned ? 'link-owned' : parentOwned ? 'link-open' : 'link-locked');
        }
        renderNodeDetail();
        placeNodePopup();
    }

    // The selected node's info and buy button pop up beside it, flipping sides near the edge.
    function placeNodePopup() {
        const box = $('nodeDetail');
        const node = treeUi.nodes[path.selected];
        const show = !!treeUi.popup && node && !node.hidden;
        box.hidden = !show;
        if (!show) return;
        const z = uiScale();
        const vp = $('treeViewport').getBoundingClientRect();
        const r = node.getBoundingClientRect();
        const w = box.offsetWidth || 240;
        const h = box.offsetHeight || 160;
        const vw = vp.width / z;
        const vh = vp.height / z;
        let left = (r.right - vp.left) / z + 12;
        if (left + w > vw - 8) left = (r.left - vp.left) / z - w - 12;
        left = Math.max(8, Math.min(vw - w - 8, left));
        const top = Math.max(8, Math.min(vh - h - 8, (r.top - vp.top) / z + r.height / z / 2 - h / 2));
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
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
        // Locked nodes keep their secret: no name or effect until the node they grow from is owned.
        const unknown = st === 'locked';
        const parts = [
            el('button', { type: 'button', class: 'detail-close', 'aria-label': 'Close', text: '×' }),
            el('div', { class: 'detail-head' }, [
                el('span', { class: 'detail-icon' }),
                el('div', {}, [el('h3', { text: unknown ? '???' : up.name }),
                    el('p', { class: 'muted small', text: unknown ? 'Unknown research' : `Level ${lvl}${up.max ? ` of ${up.max}` : ''}${up.legacy ? ' · legacy, kept for good' : ''}` })])
            ]),
            el('p', { class: 'detail-effect', text: unknown ? 'Something is out here. Unlock what it grows from to find out what.' : up.effect }),
            unknown || !up.flavor ? null : el('p', { class: 'detail-flavor', text: up.flavor })
        ].filter(Boolean);
        if (unknown) {
            const needs = up.requires && E.level(state, up.requires) < 1 ? `Grows from ${E.UPGRADE_BY_ID[up.requires].name}` : up.hint || 'Locked';
            parts.push(el('p', { class: 'detail-lock', text: needs }));
        } else if (st === 'maxed') {
            parts.push(el('p', { class: 'detail-maxed', text: 'Fully upgraded' }));
        } else {
            const cost = E.upgradeCost(up, lvl);
            const buy = el('button', { type: 'button', class: 'button detail-buy', text: `${lvl ? 'Upgrade' : 'Unlock'} · ${E.formatCost(cost)}` });
            buy.disabled = !E.canAfford(state, cost);
            // Multi-level nodes keep the popup open (with the next level's price under the pointer) so
            // you can buy again; it closes after the last level. The rebuild detaches this button, so the
            // click must not bubble on to the "empty space closes it" handler.
            buy.addEventListener('click', e => {
                e.stopPropagation();
                doBuy(up.id);
                if (E.isMaxed(state, up)) treeUi.popup = false;
                renderTree();
                if (treeUi.popup) box.querySelector('.detail-buy')?.focus({ preventScroll: true });
            });
            parts.push(buy);
        }
        box.replaceChildren(...parts);
        box.querySelector('.detail-close').addEventListener('click', () => {
            treeUi.popup = false;
            placeNodePopup();
        });
        box.querySelector('.detail-icon').innerHTML = icon(unknown ? 'lock' : up.icon);
    }

    function showTrainingView(view) {
        path.view = view;
        path.done = false;
        $('runView').hidden = view !== 'run';
        $('devView').hidden = view !== 'dev';
        if (view === 'dev') {
            path.charging = null;
            dismissResult();
            renderTree();
            renderLegPicker();
            setText($('startRunButton'), startLeg() < state.path.learned ? 'Start replay' : `Start run ${state.stats.rolls + 1}`);
            $('startRunButton').focus({ preventScroll: true });
        } else {
            $('pushButton').focus({ preventScroll: true });
            startPathLoop();
        }
        updateTreeButton();
        updateLegTag();
    }

    // Start at: the frontier, or any cleared leg (a replay rolls on through every later leg). Rebuilt
    // only when the number of legs changes, so an open dropdown isn't replaced under the pointer.
    let legPickerKey = '';
    function renderLegPicker() {
        const learned = state.path.learned;
        setHidden($('legPick'), learned === 0);
        const select = $('legSelect');
        if (legPickerKey !== String(learned)) {
            legPickerKey = String(learned);
            // Leg 1 first, through to the frontier you're on.
            select.replaceChildren(
                ...Array.from({ length: learned }, (_, k) => el('option', { value: k, text: `Leg ${k + 1}: ${E.skillAt(k).name} ✓` })),
                el('option', { value: '', text: `Leg ${learned + 1}: ${E.skillAt(learned).name} (frontier)` }));
        }
        const want = startLeg() < learned ? String(startLeg()) : '';
        if (select.value !== want) select.value = want;
    }

    // On the run view: which leg this run starts on, while it isn't the frontier.
    function updateLegTag() {
        const k = startLeg();
        const replay = k < state.path.learned;
        setHidden($('legTag'), !replay);
        if (replay) setText($('legTagText'), `Replay from ${E.skillAt(k).name} → frontier`);
        if (path.view === 'dev') setText($('startRunButton'), replay ? 'Start replay' : `Start run ${state.stats.rolls + 1}`);
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

    // ---- Luck effects (power-ups) ----
    // Breakthrough: the ball glows, shakes and draws in sparks for a moment (the run holds still, and you
    // can charge your next sprint meanwhile), then takes off with a shockwave and a golden streak; a super
    // one (Paradigm Shift) also shatters the hills ahead. Crunch: free sprints for a few seconds, with a
    // fiery aura and a countdown ring; a super one (Bullet Time) freezes time instead, and every sprint
    // banks its power until it all lands at once. Max Effort: your next sprint goes all out (gold meter).
    // Flow: the ball lifts off the line and coasts, bobbing, while calm lights drift past and the trail
    // swells to a slow beat; a super flow (Lucid Dream) shrinks the hills beneath it. Viral: reactions
    // pour off the ball and the result card gets a rainbow edge.
    const WINDUP_SECONDS = 0.8;
    const BOOST_SECONDS = 1.3;
    const FLOW_BPM = 66;
    function freshFx() {
        return { windup: null, boost: 0, trail: [], shocks: [], sparks: [], shake: 0, crunch: 0, crunchMax: 0, maxEffort: false, reactions: [],
            flowMax: 0, lift: 0, lights: [], freeze: 0, freezeMax: 0, bank: 0, banked: 0, debris: [] };
    }
    const crunching = () => path.fx.crunch > 0;
    // Bullet Time: the run is frozen and sprints bank their power.
    const frozen = () => path.fx.freeze > 0;
    const flowing = () => !!path.roll && !path.roll.over && path.roll.flowing > 0;
    const LUCID = '#b48cff';

    // A big luck banner: pops in at the top of the trail, in the luck's colour.
    function luckBanner(title, sub, tone) {
        path.legFlash = { age: 0, text: title, sub, tone, big: true };
    }
    const RESULT_PAUSE = 1.2;   // Auto-Trainer only: seconds before the next roll starts (the result card stays up)
    const OVERVIEW_SECONDS = 3; // how long the camera stays zoomed out after learning a skill
    const STUCK_GRACE = 3;      // seconds a stuck roll waits for income before it ends
    const path = {
        roll: null,
        startLeg: null,         // replay from this cleared leg (stretch index); null = the frontier
        timeScale: 1,           // < 1 in slow motion
        tension: 0,             // 0–1: how far the camera has pushed in on a nail-biter
        focus: null,            // the hill of the current nail-biter
        summit: null,           // { age, name } while celebrating a crest
        particles: [],          // confetti, in world units
        rollKey: '',
        rollPushes: 0,
        charging: null,         // { start } while the push button is held
        queued: null,           // a sprint released during a wind-up or cooldown: fires as soon as it can
        cleanFlash: 0,
        fx: freshFx(),          // luck effects: breakthrough wind-up, crunch, flow, viral burst
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
    // The leg the next run starts on: a cleared leg picked on the rack or the dev screen, else the frontier.
    function startLeg() {
        const k = path.startLeg;
        return k != null && k >= 0 && k < state.path.learned ? k : state.path.learned;
    }

    // The leg the ball is on now (pushes cost what they cost there), or where the next run starts.
    function ballLeg() {
        const roll = path.roll;
        return roll && path.stateRef === state ? Math.min(roll.leg, state.path.learned) : startLeg();
    }

    function setStartLeg(k) {
        path.startLeg = k != null && k < state.path.learned ? k : null;
        const roll = path.roll;
        // A run waiting at the start line is rebuilt on the chosen leg; one in flight finishes first.
        if (roll && !roll.launched && !path.done) currentRoll();
        renderLegPicker();
        updateLegTag();
    }

    function currentRoll() {
        const d = E.derive(state, debugRates);
        const first = startLeg();
        const key = [state.stats.runStart, state.path.learned, first, E.rollSeed(state), d.pushesPerRoll, d.pushCooldown, d.friction, d.hillScale].join(':');
        // A finished run stays on screen (path.done) until you click through to the dev screen.
        const stale = !path.roll || path.stateRef !== state || (path.roll.over && !path.done) || (!path.roll.launched && path.rollKey !== key);
        if (stale && path.pause <= 0) {
            // A run from a cleared leg rolls on through every later leg up to the frontier.
            path.roll = T.createRoll(first, E.rollSeed(state),
                { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction, hillScale: d.hillScale, rollOut: true, last: state.path.learned,
                    holdOpen: crunching });
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

        // The trail fills the bay: the canvas takes its wrap's size (CSS gives the wrap the free space).
        new ResizeObserver(() => {
            const dpr = (window.devicePixelRatio || 1) * uiScale();
            const wrap = canvas.parentElement;
            path.width = wrap.clientWidth;
            path.height = Math.max(220, wrap.clientHeight);
            canvas.style.height = path.height + 'px';
            canvas.width = Math.round(path.width * dpr);
            canvas.height = Math.round(path.height * dpr);
            path.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawPath();
        }).observe(canvas.parentElement);

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

    const CHARGE_SWEEP_MS = 1250;    // time for the meter to sweep from empty to full (then back)

    // Meter position (0–1) while charging: sweeps up to what you can afford, back down, and up again.
    function chargeLevel(now = performance.now()) {
        if (!path.charging) return 0;
        const { cap, sweep } = path.charging;
        const pos = ((now - path.charging.start) / sweep) % (2 * cap);
        return pos <= cap ? pos : 2 * cap - pos;
    }

    function chargeBudget() {
        return E.affordableCharge(state, ballLeg());
    }

    function pushIndex(roll) {
        return path.rollPushes - roll.pushesLeft;
    }

    function currentZone(roll) {
        const d = E.derive(state);
        return E.bonusZone(roll.ground.seed, pushIndex(roll), d.zoneWidth, d.perfectWidth, d.systemWidth, d.zoneBias);
    }

    // Whether you can charge a sprint: also during a breakthrough's wind-up and the cooldown (the release
    // then waits for its moment). During a crunch or Bullet Time sprints are free.
    function canPush(roll) {
        if (roll.over || roll.crested || path.pause > 0) return false;
        if (crunching() || frozen()) return true;
        return roll.pushesLeft > 0 && chargeBudget() >= E.PATH.minCharge;
    }

    // Whether a sprint can fire right now (no wind-up or cooldown in the way).
    function readyToFire(roll) {
        return canPush(roll) && !path.fx.windup && roll.ball.cooldown <= 0;
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
                setText($('pathStatus'), `Not enough to sprint: even a light training sprint costs ${E.formatCost(E.pushCost(state, E.PATH.minCharge, ballLeg()))}.`);
            }
            return;
        }
        // Max Effort: no charging needed, the sprint goes all out the moment you press.
        if (path.fx.maxEffort) {
            sprint(roll, 1, true);
            return;
        }
        path.charging = { start: performance.now(), cap: crunching() || frozen() ? 1 : chargeBudget(), sweep: CHARGE_SWEEP_MS * E.derive(state).sweepScale };
        startPathLoop();
    }

    function releaseCharge() {
        if (!path.charging) return;
        const level = chargeLevel();
        path.charging = null;
        sprint(currentRoll(), level, false);
    }

    const PROMPT_NAMES = { clean: 'Clean prompt', perfect: 'Super prompt', system: 'System prompt' };

    // A manual sprint released at `level` of the meter: judged against the zone now, then fired, banked
    // (Bullet Time) or, during a wind-up or cooldown, queued to fire the moment it can.
    function sprint(roll, level, effort) {
        const kind = effort ? 'perfect' : path.fx.forceKind || E.zoneHit(currentZone(roll), level);
        path.fx.forceKind = null;
        if (frozen()) {
            bankSprint(roll, level, kind);
            return;
        }
        if (!readyToFire(roll)) {
            if (canPush(roll)) path.queued = { level, kind, effort };
            return;
        }
        fireSprint(roll, level, kind, effort);
    }

    function fireSprint(roll, level, kind, effort) {
        const leg = ballLeg();
        const pushed = pushBall(false, effort ? 1 : Math.max(E.PATH.minCharge, level), kind, effort);
        if (pushed && effort) {
            path.fx.maxEffort = false;
            burst(path.colors.warning, 30);
        }
        if (pushed && kind) promptBonus(roll, kind, leg);
    }

    // Clean, super and system prompts pay at once: steady XP whatever happens to the roll.
    function promptBonus(roll, kind, leg) {
        const xp = E.grantPushBonus(state, kind, leg);
        roll.clean = (roll.clean || 0) + 1;
        roll.units = (roll.units || 0) + E.cleanUnits(kind, state);
        roll.bonusXp = (roll.bonusXp || 0) + xp;
        const pct = Math.round(E.derive(state).cleanRollBonus * E.cleanUnits(kind, state) * 100);
        path.cleanFlash = 1.2;
        path.cleanText = `${PROMPT_NAMES[kind]}! +${xpText(xp)} XP, +${pct}% run bonus`;
        if (kind === 'system') {
            luckBanner('SYSTEM PROMPT!', `Worth ${E.PATH.systemMult} clean prompts`, 'accent');
            burst('#ffffff', 40);
        }
        render();
    }

    // Bullet Time: the sprint's power goes into the bank (free), to land all at once when time restarts.
    function bankSprint(roll, level, kind) {
        const strength = E.sprintStrength(state, Math.max(E.PATH.minCharge, level), kind);
        path.fx.bank += strength * strength;
        path.fx.banked++;
        burst(path.colors.primary, 10);
        if (kind) promptBonus(roll, kind, ballLeg());
    }

    // Time restarts: everything banked lands in one go.
    function releaseBank(roll) {
        const fx = path.fx;
        fx.freeze = 0;
        if (fx.bank > 0 && roll.boost(Math.sqrt(fx.bank))) {
            fx.boost = BOOST_SECONDS;
            fx.shocks.push({ age: 0 }, { age: -0.1 }, { age: -0.2 });
            burst(path.colors.primary, 40);
            jolt();
            luckBanner(`×${fx.banked} RELEASED`, 'Every banked sprint at once', 'primary');
        }
        fx.bank = 0;
        fx.banked = 0;
    }

    function jolt() {
        if (reducedMotion()) return;
        path.canvas.classList.remove('jolt');
        void path.canvas.offsetWidth;
        path.canvas.classList.add('jolt');
    }

    // The first push launches the roll (and pays for it); later pushes spend the roll's pushes.
    // `fraction` is how much of the meter was charged (the Auto-Trainer always pushes at full).
    // `kind` ('clean' / 'perfect' / 'system') makes the sprint hit harder, and so does `effort` (Max
    // Effort); any sprint can be a breakthrough, and set off a crunch, Max Effort or a flow (luck).
    function pushBall(auto, fraction = 1, kind = null, effort = false) {
        const roll = currentRoll();
        const free = crunching();
        if (roll.over || roll.crested || path.fx.windup || (!free && roll.pushesLeft <= 0) || roll.ball.cooldown > 0) return false;
        // Every push is paid for by how hard it is charged (a crunch's are free).
        const leg = ballLeg();
        if (!free) {
            fraction = Math.min(fraction, chargeBudget());
            if (fraction < E.PATH.minCharge || !E.payPush(state, fraction, leg)) {
                if (!auto) setText($('pathStatus'), `Not enough to sprint: even a light training sprint costs ${E.formatCost(E.pushCost(state, E.PATH.minCharge, leg))}.`);
                return false;
            }
        }
        if (!roll.launched) {
            path.overview = 0;
            dismissResult();
        }
        const index = pushIndex(roll) + (roll.freePushes || 0);
        const seed = roll.ground.seed;
        const d = E.derive(state);
        const forced = path.fx.forceLuck;
        path.fx.forceLuck = null;
        const breakthrough = forced === 'breakthrough' || forced === 'superBreakthrough' || E.breakthroughHit(state, seed, index);
        const superBreak = breakthrough && (forced === 'superBreakthrough' || E.superHit(state, 'breakthrough', seed, index));
        const strength = E.sprintStrength(state, fraction, kind, breakthrough, effort);
        if (free) roll.freePushes = (roll.freePushes || 0) + 1;
        // The sprint lands now; on screen a breakthrough holds the run still for its wind-up first (you can
        // charge the next sprint meanwhile), off screen it just goes.
        roll.push(strength, free);
        if (breakthrough) {
            roll.breakthroughs = (roll.breakthroughs || 0) + 1;
            if (path.visible && !reducedMotion()) path.fx.windup = { age: 0, super: superBreak };
            else launchBreakthrough(roll, superBreak);
        }
        // Rarer luck rolls only on paid sprints: a crunch can't chain itself.
        if (!free && (d.crunchSeconds || forced === 'crunch' || forced === 'superCrunch') && (forced === 'crunch' || forced === 'superCrunch' || E.crunchHit(state, seed, index))) {
            roll.crunches = (roll.crunches || 0) + 1;
            const seconds = Math.max(3, d.crunchSeconds);
            if (forced === 'superCrunch' || E.superHit(state, 'crunch', seed, index)) {
                path.fx.freeze = path.fx.freezeMax = seconds;
                luckBanner('BULLET TIME', `Time stops for ${seconds} s. Every sprint banks its power`, 'primary');
            } else {
                path.fx.crunch = path.fx.crunchMax = seconds;
                luckBanner('CRUNCH TIME!', `Free sprints for ${seconds} s, no waiting`, 'danger');
            }
        }
        if (!auto && !effort && !path.fx.maxEffort && (forced === 'maxEffort' || E.maxEffortHit(state, seed, index))) {
            path.fx.maxEffort = true;
            luckBanner('MAX EFFORT', 'Your next sprint goes all out: full strength, a super prompt', 'warning');
        }
        if (!roll.flowing && (forced === 'flow' || forced === 'superFlow' || E.flowHit(state, seed, index))) {
            const superFlow = forced === 'superFlow' || E.superHit(state, 'flow', seed, index);
            startFlow(roll, superFlow);
        }
        path.pushFlash = 0.35;
        setText($('pathStatus'), '');
        render();
        startPathLoop();
        return true;
    }

    // The wind-up is over: the sprint takes off with a shockwave, a golden streak and a jolt. A super
    // breakthrough (Paradigm Shift) also shatters the rolling hills ahead.
    function launchBreakthrough(roll, superBreak) {
        path.fx.windup = null;
        path.fx.boost = BOOST_SECONDS;
        path.fx.shake = 0.3;
        jolt();
        path.fx.shocks.push({ age: 0 }, { age: -0.12 });
        burst(path.colors.warning, 34);
        if (superBreak) {
            const g = roll.ground;
            const leg = g.legAt(roll.ball.x);
            const hills = roll.smash(Math.max(4, 0.3 * g.legLength(leg)));
            shatter(hills);
            path.fx.shocks.push({ age: -0.24 }, { age: -0.36 });
            luckBanner('PARADIGM SHIFT!', `×${E.derive(state).critMult.toFixed(2)} and ${hills.length} hill${hills.length === 1 ? '' : 's'} shattered`, 'warning');
        } else {
            luckBanner('BREAKTHROUGH!', `×${E.derive(state).critMult.toFixed(2)} sprint strength`, 'warning');
        }
        render();
    }

    // Chunks of rock flying off each shattered hill (world position, screen-space velocity).
    function shatter(hills) {
        if (reducedMotion()) return;
        for (const b of hills) {
            for (let i = 0; i < 14; i++) {
                const along = b.start + (b.end - b.start) * Math.random();
                path.fx.debris.push({ wx: along, wy: (b.base ?? b.height) * Math.random(), x: 0, y: 0, vx: (Math.random() - 0.5) * 160,
                    vy: -(80 + Math.random() * 220), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14, age: -Math.random() * 0.15,
                    life: 0.9 + Math.random() * 0.6, size: 3 + Math.random() * 5 });
            }
        }
    }

    // A flow: the ball lifts off the line and coasts (a super flow, Lucid Dream, also shrinks the hills).
    function startFlow(roll, superFlow) {
        const d = E.derive(state);
        const seconds = Math.max(3, d.flowSeconds);
        roll.coast(seconds, d.flowSpeed * d.pushPower, superFlow ? 0.25 : 0);
        roll.flows = (roll.flows || 0) + 1;
        path.fx.flowMax = seconds;
        path.fx.superFlow = superFlow;
        luckBanner(superFlow ? 'LUCID DREAM' : 'FLOW STATE', superFlow ? 'The hills shrink beneath you' : `Coasting for ${seconds} s`, superFlow ? LUCID : 'secondary');
    }

    // Sparks flying out of the ball (screen space, relative to it), in `color`.
    function burst(color, n) {
        if (reducedMotion()) return;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 60 + Math.random() * 140;
            path.fx.sparks.push({ x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, age: 0, life: 0.5 + Math.random() * 0.5, color });
        }
    }

    function ageFx(dt) {
        const fx = path.fx;
        fx.boost = Math.max(0, fx.boost - dt);
        fx.shake = Math.max(0, fx.shake - dt);
        for (const sh of fx.shocks) sh.age += dt;
        fx.shocks = fx.shocks.filter(sh => sh.age < 0.9);
        for (const p of fx.sparks) {
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += (p.fall === false ? -40 : 260) * dt;   // flames rise, sparks fall
        }
        fx.sparks = fx.sparks.filter(p => p.age < p.life);
        for (const p of fx.reactions) {
            p.age += dt;
            if (p.age < 0) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 30 * dt;
        }
        fx.reactions = fx.reactions.filter(p => p.age < p.life);
        for (const p of fx.debris) {
            p.age += dt;
            if (p.age < 0) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 420 * dt;
            p.rot += p.spin * dt;
        }
        fx.debris = fx.debris.filter(p => p.age < p.life);
        // Flow: the ball eases off the line and back, and calm lights drift up through the view.
        const flow = flowing();
        fx.lift += ((flow ? 1 : 0) - fx.lift) * Math.min(1, dt * 3);
        if (fx.lift < 0.01 && !flow) fx.lift = 0;
        if (flow && !reducedMotion() && Math.random() < dt * 9) {
            fx.lights.push({ x: Math.random(), y: 0.55 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.02, vy: -(0.04 + Math.random() * 0.05),
                r: 6 + Math.random() * 22, age: 0, life: 2.5 + Math.random() * 2, hue: Math.random() < 0.5 ? 'secondary' : fx.superFlow ? LUCID : 'primary' });
        }
        for (const l of fx.lights) {
            l.age += dt;
            l.x += l.vx * dt;
            l.y += l.vy * dt;
        }
        fx.lights = fx.lights.filter(l => l.age < l.life);
        // The golden streak remembers where the boosted ball has been.
        const roll = path.roll;
        if (fx.boost > 0 && roll) fx.trail.push({ x: roll.ball.x, age: 0 });
        for (const t of fx.trail) t.age += dt;
        fx.trail = fx.trail.filter(t => t.age < 0.6);
    }

    const fxBusy = () => {
        const fx = path.fx;
        return !!(fx.windup || fx.boost || fx.shocks.length || fx.sparks.length || fx.reactions.length || fx.trail.length || fx.crunch || fx.maxEffort
            || fx.freeze || fx.lift || fx.lights.length || fx.debris.length || flowing());
    };

    // Under the ball: the breakthrough glow and the sparks it draws in, the golden streak behind a
    // boosted ball, and the crunch's fiery aura with its countdown.
    function drawLuckUnder(ctx, roll, bx, by, X, Y, wind) {
        const fx = path.fx;
        const c = path.colors;
        const t = performance.now() / 1000;
        if (fx.trail.length > 1) {
            ctx.save();
            ctx.lineCap = 'round';
            for (let i = 1; i < fx.trail.length; i++) {
                const a = fx.trail[i - 1];
                const b = fx.trail[i];
                ctx.strokeStyle = hexAlpha(c.warning, 0.75 * (1 - b.age / 0.6));
                ctx.lineWidth = 2 + 9 * (1 - b.age / 0.6);
                ctx.shadowColor = c.warning;
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.moveTo(X(a.x), Y(groundAt(roll, a.x)));
                ctx.lineTo(X(b.x), Y(groundAt(roll, b.x)));
                ctx.stroke();
            }
            ctx.restore();
        }
        if (wind) {
            // Charging: a swelling glow and sparks spiralling in.
            const r = BALL * (2.5 + 4 * wind) * (1 + 0.08 * Math.sin(t * 40));
            const g = ctx.createRadialGradient(bx, by, BALL * 0.5, bx, by, r);
            g.addColorStop(0, hexAlpha(c.warning, 0.95));
            g.addColorStop(0.45, hexAlpha(c.warning, 0.35 + 0.3 * wind));
            g.addColorStop(1, hexAlpha(c.warning, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = hexAlpha(c.warning, 0.9);
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 10; i++) {
                const a = i * 0.628 + t * 6;
                const d = (BALL + 46) * (1 - ((t * 1.8 + i * 0.1) % 1)) + BALL;
                ctx.beginPath();
                ctx.moveTo(bx + Math.cos(a) * d, by + Math.sin(a) * d);
                ctx.lineTo(bx + Math.cos(a) * (d - 7), by + Math.sin(a) * (d - 7));
                ctx.stroke();
            }
        }
        if (crunching()) {
            // Crunch: a flickering fiery aura and a ring that runs down with the time left.
            const flick = 0.85 + 0.15 * Math.sin(t * 31) * Math.sin(t * 17);
            const r = BALL * 7 * flick;
            const g = ctx.createRadialGradient(bx, by - 4, BALL * 0.6, bx, by - 6, r);
            g.addColorStop(0, hexAlpha('#fff3c4', 0.9));
            g.addColorStop(0.25, hexAlpha(c.warning, 0.75));
            g.addColorStop(0.6, hexAlpha(c.danger, 0.35));
            g.addColorStop(1, hexAlpha(c.danger, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by - 6, r, 0, Math.PI * 2);
            ctx.fill();
            // Flames licking up off the ball.
            if (!reducedMotion()) for (let i = 0; i < 3; i++) {
                fx.sparks.push({ x: (Math.random() - 0.5) * 16, y: -2, vx: (Math.random() - 0.5) * 50, vy: -80 - Math.random() * 90, age: 0, life: 0.35 + Math.random() * 0.3,
                    color: [c.danger, c.warning, '#fff3c4'][i], fall: false, size: 3 + Math.random() * 3 });
            }
            ctx.strokeStyle = c.danger;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (fx.crunch / fx.crunchMax));
            ctx.stroke();
        }
    }

    // Over the ball: the flow halo, shockwaves, sparks and viral reactions.
    function drawLuckOver(ctx, bx, by, wind) {
        const fx = path.fx;
        const c = path.colors;
        const t = performance.now() / 1000;
        if (frozen()) {
            // Bullet Time: a ring that fills as power is banked, and the time left as a thin arc.
            const k = Math.min(1, Math.sqrt(fx.bank) / Math.max(1, 3 * E.derive(state).pushPower));
            ctx.save();
            ctx.shadowColor = c.primary;
            ctx.shadowBlur = 10 + 20 * k;
            ctx.strokeStyle = c.primary;
            ctx.lineWidth = 3 + 4 * k;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 10 + 10 * k, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = c.text;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 26 + 10 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (fx.freeze / fx.freezeMax));
            ctx.stroke();
            if (fx.banked) {
                ctx.shadowBlur = 0;
                ctx.fillStyle = c.text;
                ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`BANKED ×${fx.banked}`, bx, by - BALL - 44 - 10 * k);
            }
            ctx.restore();
        }
        if (fx.maxEffort) {
            ctx.save();
            ctx.strokeStyle = c.warning;
            ctx.shadowColor = c.warning;
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.lineDashOffset = -t * 30;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 7 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 14 + Math.sin(t * 4 + 1) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        for (const sh of fx.shocks) {
            if (sh.age < 0) continue;
            const k = sh.age / 0.9;
            ctx.strokeStyle = hexAlpha(c.warning, 0.9 * (1 - k));
            ctx.lineWidth = 4 * (1 - k) + 1;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 140 * Math.sqrt(k), 0, Math.PI * 2);
            ctx.stroke();
        }
        if (wind > 0.6) {
            ctx.fillStyle = hexAlpha('#ffffff', (wind - 0.6) * 2);
            ctx.beginPath();
            ctx.arc(bx, by, BALL, 0, Math.PI * 2);
            ctx.fill();
        }
        for (const p of fx.sparks) {
            const k = 1 - p.age / p.life;
            const size = (p.size || 3) * (p.fall === false ? k : 1);
            ctx.fillStyle = hexAlpha(p.color, k);
            ctx.beginPath();
            ctx.arc(bx + p.x, by + p.y, size / 2 + 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.textAlign = 'center';
        for (const p of fx.reactions) {
            if (p.age < 0) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, p.age * 4, (p.life - p.age) / 0.5));
            ctx.font = `700 ${p.size}px system-ui, sans-serif`;
            ctx.fillStyle = p.color;
            ctx.fillText(p.glyph, bx + p.x, by + p.y);
        }
        ctx.globalAlpha = 1;
    }

    // Auto-Trainer: level 1 launches rolls and pushes when the ball stops; level 2 also
    // rescues the ball as it stalls on a slope.
    function autoTrain(roll) {
        const lvl = E.autoTrainerLevel(state);
        if (path.view !== 'run') return;
        if (!lvl || roll.over || path.pause > 0 || roll.ball.cooldown > 0 || path.fx.windup || frozen()) return;
        const stalling = roll.ball.v > 0 && roll.ball.v < 0.5 && roll.ground.slope(roll.ball.x) > 0.05;
        if (!roll.launched || roll.atRest || (lvl >= 2 && stalling)) pushBall(true, chargeBudget());
    }

    // A run keeps rolling when you step away (to the rack, the lab or the facility) as long as the page
    // is open: one in flight finishes, and the Auto-Trainer keeps starting new ones. Nothing runs offline.
    function runsInBackground() {
        const roll = path.roll;
        return !!roll && path.stateRef === state && path.view === 'run'
            && ((roll.launched && !roll.over) || E.autoTrainerLevel(state) > 0);
    }

    function startPathLoop() {
        if (path.frame || !path.canvas || path.view !== 'run') return;
        if (openBay !== 'training' && !runsInBackground()) return;
        path.last = performance.now();
        path.frame = requestAnimationFrame(pathFrame);
    }

    function pathFrame(now) {
        path.frame = 0;
        const dt = Math.min(0.1, (now - path.last) / 1000) * debugSpeed;
        path.last = now;
        const running = !document.hidden && (path.visible || runsInBackground());
        updateDrama(dt);
        if (running) {
            if (path.pause > 0) path.pause -= dt;
            const roll = currentRoll();
            autoTrain(roll);
            // Slow motion only matters on screen; in the background the run keeps real time. A wind-up and
            // Bullet Time hold the run still.
            const fx = path.fx;
            const sim = fx.windup || frozen() ? 0 : path.visible ? dt * path.timeScale : dt;
            // The wait between sprints keeps counting while a wind-up holds the run still.
            if (fx.windup) roll.ball.cooldown = Math.max(0, roll.ball.cooldown - dt);
            if (fx.windup && (fx.windup.age += dt) >= WINDUP_SECONDS) launchBreakthrough(roll, fx.windup.super);
            if (fx.crunch > 0) fx.crunch = Math.max(0, fx.crunch - sim);
            if (frozen() && (fx.freeze = Math.max(0, fx.freeze - dt)) === 0) releaseBank(roll);
            // A sprint released during the wind-up or cooldown fires the moment it can.
            if (path.queued && readyToFire(roll)) {
                const q = path.queued;
                path.queued = null;
                fireSprint(roll, q.level, q.kind, q.effort);
            } else if (path.queued && !canPush(roll)) {
                path.queued = null;
            }
            for (const ev of roll.step(sim)) {
                if (ev.type === 'clear') clearLeg(ev);
                else if (ev.type === 'crest' && !roll.over) celebrateSummit();
                else finishRoll(ev);
            }
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
        if (path.legFlash && (path.legFlash.age += dt) > LEG_FLASH_SECONDS * (path.legFlash.big ? 1.3 : 1)) path.legFlash = null;
        ageFx(dt);
        drawPath(dt);
        drawLanes();
        updatePathControls();
        updateLiveXp();
        const roll = path.roll;
        const busy = roll && roll.launched && !roll.over;
        const animating = busy || path.legFlash || fxBusy() || path.summit || path.particles.length || path.tension > 0.01 || path.brokeFor > 0 || path.charging || path.cleanFlash > 0 || path.pause > 0 || path.overview > 0 || path.glow || path.pushFlash || cameraMoving()
            || E.autoTrainerLevel(state) > 0;
        if (running && animating) path.frame = requestAnimationFrame(pathFrame);
    }

    // ---- Drama: nail-biters and summits ----

    const SUMMIT_SECONDS = 2.6;     // the summit banner and confetti
    const LEG_FLASH_SECONDS = 2.2;  // "<skill> cleared" on a replay
    const SUMMIT_SLOWMO = 1.1;      // slow motion right after cresting

    // A nail-biter: the ball is climbing near the top of a big hill (the skill hill, or a large rolling
    // one) with about as much energy as it needs to get over. Returns that hill, or null.
    function nailBiter(roll) {
        if (!roll || !roll.launched || roll.over || roll.crested || roll.ball.v <= 0) return null;
        const g = roll.ground;
        const x = roll.ball.x;
        const hill = g.bumps.find(b => x >= b.start && x < b.peak);
        // Only big hills: the skill hill, or a rolling hill at least 60% of its height.
        if (!hill || (hill.skill === null && hill.height < 0.6 * g.goal.height)) return null;
        // Once it starts, it lasts until the ball crests or turns back on this hill.
        if (path.focus === hill && path.tension > 0) return hill;
        // Rare on purpose: not again for a while after the last one.
        if (performance.now() < (path.dramaQuiet || 0)) return null;
        // Within 5% of the top, with almost exactly the energy it needs: a real coin flip.
        if (g.height(x) < 0.95 * hill.height) return null;
        const need = T.GRAVITY * (hill.height - g.height(x));
        if (need <= 0) return null;
        const ratio = 0.5 * roll.ball.v * roll.ball.v / need;
        return ratio > 0.6 && ratio < 1.5 ? hill : null;
    }

    // Eases time (slow motion), tension (camera push-in, vignette) and the summit celebration.
    function updateDrama(dt) {
        const celebrating = path.summit && path.summit.age < SUMMIT_SLOWMO;
        // The push-in holds through the summit, then eases back out slowly.
        const focus = path.visible ? (celebrating ? path.roll.ground.goal : nailBiter(path.roll)) : null;
        if (focus) {
            path.focus = focus;
            path.dramaQuiet = performance.now() + 8000;
        }
        path.tension += ((focus ? 1 : 0) - path.tension) * Math.min(1, dt * (focus ? 9 : 1.5));
        if (path.tension < 0.01 && !focus) {
            path.tension = 0;
            path.focus = null;
        }
        const target = celebrating ? 0.35 : focus ? 0.3 : 1;
        path.timeScale += (target - path.timeScale) * Math.min(1, dt * (target < path.timeScale ? 10 : 3));
        if (path.summit && (path.summit.age += dt) > SUMMIT_SECONDS) path.summit = null;
        for (const p of path.particles) {
            p.age += dt;
            p.y += p.vy * dt;
            p.x += Math.sin(p.age * p.sway + p.phase) * 40 * dt;
            p.rot += p.spin * dt;
        }
        path.particles = path.particles.filter(p => p.y < path.height + 10);
    }

    // Over the top of the skill hill: banner and confetti, then the ball rolls down the far side and
    // the skill is announced when the roll ends (finishRoll).
    function celebrateSummit() {
        path.summit = { age: 0, name: E.skillAt(state.path.learned).name };
        // Confetti rains down across the whole trail (screen pixels, staggered starts above the top).
        const colors = [path.colors.success, path.colors.warning, path.colors.accent, path.colors.primary, '#c792ea'];
        const count = Math.round(Math.min(220, Math.max(80, path.width / 6)));
        for (let i = 0; i < count; i++) {
            path.particles.push({
                x: Math.random() * path.width, y: -10 - Math.random() * path.height * 0.9,
                vy: 70 + Math.random() * 90, sway: 2 + Math.random() * 3, phase: Math.random() * 6.3,
                rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 10,
                color: colors[i % colors.length], age: 0
            });
        }
    }

    // A replay crossed a cleared leg's skill hill: flat XP at once, and the ball rolls on.
    function clearLeg(ev) {
        const roll = path.roll;
        // The chain: each cleared hill crossed raises the multiplier on everything after it.
        const xp = E.clearLeg(state, ev.skill, roll.legs || 0);
        roll.legs = (roll.legs || 0) + 1;
        roll.legXp = (roll.legXp || 0) + xp;
        path.legFlash = { age: 0, text: `${E.skillAt(ev.skill).name} cleared · +${xpText(xp)} XP · chain ×${E.chainMult(roll.legs)}`, tone: 'success' };
        render();
    }

    function finishRoll(ev) {
        const crested = ev.type === 'crest' || !!ev.crested;
        const roll = path.roll;
        // Crunches, Bullet Time, Max Effort and queued sprints end with the run.
        path.fx.crunch = 0;
        path.fx.freeze = 0;
        path.fx.bank = 0;
        path.fx.banked = 0;
        path.fx.maxEffort = false;
        path.queued = null;
        const leg = ev.leg ?? state.path.learned;
        const replay = roll.ground.stretch < state.path.learned;
        const target = E.skillAt(leg).name;
        const clean = roll.clean || 0;
        const units = roll.units || 0;
        const banked = (roll.bonusXp || 0) + (roll.legXp || 0);
        const legs = roll.legs || 0;
        const metres = ev.metres || 0;
        // Luck: a run can go viral, multiplying its distance XP.
        const viral = metres > 0 && (path.fx.forceViral || E.windfallHit(state, roll.ground.seed));
        path.fx.forceViral = false;
        const plainXp = E.rollXp(state, ev.progress, crested, 0, metres, leg);
        const result = E.finishRoll(state, ev.progress, crested, units, metres, leg, viral, legs);
        // With the Auto-Trainer the next roll starts by itself; otherwise the run waits for a click.
        const auto = E.autoTrainerLevel(state) > 0;
        path.pause = auto ? RESULT_PAUSE : 0;
        path.done = !auto;
        const pct = Math.round(ev.progress * 100);
        const viralMult = viral ? E.derive(state).windfallMult : 1;
        const runMult = viralMult * E.chainMult(legs);
        const lines = xpLines(plainXp * runMult, result.xp - plainXp * runMult, clean, roll.bonusXp || 0, crested);
        if (legs) lines.unshift([`Chain ×${E.chainMult(legs)} on the distance`, '', 'good']);
        if (viral) {
            lines.unshift([`Went viral! ×${viralMult.toFixed(2)} run XP`, '', 'good']);
            goViral(viralMult);
        }
        if (roll.breakthroughs) lines.push([`${roll.breakthroughs} breakthrough${roll.breakthroughs === 1 ? '' : 's'}`, '', 'good']);
        if (roll.flows) lines.push([`${roll.flows} flow${roll.flows === 1 ? '' : 's'}`, '', 'good']);
        if (legs) lines.unshift([`${legs} cleared leg${legs === 1 ? '' : 's'} crossed`, `+${xpText(roll.legXp)} XP`, 'good']);
        if (result.skill) {
            const grants = Object.entries(result.skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
            log(`Learned ${result.skill.name}: ${result.skill.effect} (${grants}, +${xpText(result.xp + banked)} XP). ${result.skill.flavor}`, 'special');
            // The result card announces it on screen; the toast is for when you're elsewhere.
            if (!(currentPlace() === 'bay:training' && path.view === 'run')) toast(`Skill learned · ${result.skill.name}`, result.skill.effect, 'skill');
            path.glow = { skill: state.path.learned - 1, age: 0 };
            path.overview = OVERVIEW_SECONDS + path.pause;
            showResult({ skill: true, title: 'Skill learned', main: result.skill.name, flavor: result.skill.flavor, xp: result.xp + banked,
                lines: [[result.skill.effect, ''], [grants, ''], ...lines] });
        } else {
            const bonus = clean ? `, ${clean} prompt${clean === 1 ? '' : 's'}` : '';
            const crossed = legs ? `crossed ${legs} cleared leg${legs === 1 ? '' : 's'}, then ` : '';
            const where = ev.rolledBack ? 'Rolled back to the start' : `${legs ? 'Then stopped' : 'Stopped'} ${pct}% of the way to ${target}`;
            log(`${replay ? 'Replay' : 'Run'} ${state.stats.rolls}: ${crossed}stopped ${pct}% of the way to ${target} (+${xpText(result.xp + banked)} XP${bonus})${result.record ? '. New record!' : '.'}`,
                result.record ? 'success' : 'info');
            showResult({ title: replay ? `Replay from ${E.skillAt(roll.ground.stretch).name}` : `Run ${state.stats.rolls}`,
                main: legs ? `Crossed ${legs} cleared leg${legs === 1 ? '' : 's'}. ${where}` : where, xp: result.xp + banked,
                record: result.record, lines });
        }
        afterChange();
    }

    const xpText = x => E.format(x, x < 10 ? 2 : 1);

    // Viral run: reactions pour off the ball and the result card gets the viral treatment.
    function goViral(mult) {
        path.fx.viral = mult;
        luckBanner('WENT VIRAL!', `×${mult.toFixed(2)} XP for this run`, 'accent');
        if (reducedMotion()) return;
        const glyphs = ['♥', '↑', '#', '★', '♥', '↻'];
        for (let i = 0; i < 46; i++) {
            path.fx.reactions.push({ x: (Math.random() - 0.5) * 60, y: 0, vx: (Math.random() - 0.5) * 70, vy: -(70 + Math.random() * 130),
                age: -Math.random() * 0.9, life: 1.6 + Math.random(), glyph: glyphs[i % glyphs.length], size: 12 + Math.random() * 12,
                color: ['#ff7ab6', '#c792ea', '#6fb3d9', '#ffb547'][i % 4] });
        }
    }

    // Breakdown rows for the result card: distance XP, the clean-push roll bonus, and XP already banked.
    function xpLines(distanceXp, rollBonusXp, clean, banked, crested) {
        const rows = [[crested ? 'Distance (×2 for cresting)' : 'Distance', `+${xpText(distanceXp)} XP`]];
        if (clean) {
            rows.push(['Prompt run bonus', `+${xpText(rollBonusXp)} XP`, 'good']);
            rows.push([`Banked from ${clean} prompt${clean === 1 ? '' : 's'}`, `+${xpText(banked)} XP`, 'good']);
        }
        return rows;
    }

    function showResult({ title, main, flavor, xp, lines, record, skill }) {
        const card = $('rollResult');
        card.className = `roll-result${skill ? ' skill' : ''}${path.fx.viral ? ' viral' : ''}`;
        if (path.fx.viral) card.dataset.viral = `VIRAL ×${path.fx.viral.toFixed(2)}`;
        path.fx.viral = null;
        card.replaceChildren(...[
            el('div', { class: 'result-title', text: title }),
            el('div', { class: 'result-main', text: main }),
            el('div', { class: 'result-xp', text: `+${xpText(xp)} XP` }),
            el('ul', { class: 'result-lines' }, lines.filter(([a]) => a).map(([label, value, cls]) =>
                el('li', { class: cls || '' }, [el('span', { text: label }), el('span', { text: value })]))),
            flavor ? el('p', { class: 'result-flavor', text: flavor }) : null,
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
        // One message at a time: charging always reads "Release to sprint" (a release during the wait just
        // queues), and the wait itself counts down on the button.
        const label = path.charging ? (frozen() ? 'Release to bank' : 'Release to sprint')
            : path.queued ? `Sprint queued · ${Math.max(0, roll.ball.cooldown).toFixed(1)} s`
            : path.fx.windup ? 'Breakthrough… (charge now)'
            : frozen() ? `BULLET TIME! Bank sprints (${path.fx.freeze.toFixed(1)} s)`
            : path.fx.maxEffort && !roll.over && !roll.crested ? 'MAX EFFORT: press to go all out'
            : crunching() && !roll.over && !roll.crested ? `CRUNCH! Sprint free (${path.fx.crunch.toFixed(1)} s)`
            : flowing() ? `Flowing… (${path.roll.flowing.toFixed(1)} s)`
            : !roll.launched ? 'Hold to launch'
            : roll.over ? (path.done ? 'Hold to run again' : 'Next run…')
            : roll.crested ? 'Summit!'
            : roll.pushesLeft > 0 && roll.ball.cooldown > 0 ? `Next sprint in ${roll.ball.cooldown.toFixed(1)} s`
            : roll.pushesLeft > 0 ? `Hold to sprint (${roll.pushesLeft} left)` : 'Out of sprints';
        setText(button, label);
        // Stay enabled while charging so releasing the pointer still lands on the button.
        setDisabled(button, !path.charging && !path.done && !canPush(roll));
        button.classList.toggle('crunch', crunching());
        button.classList.toggle('frozen', frozen());
        button.classList.toggle('effort', !!path.fx.maxEffort);
        $('charge').classList.toggle('effort', !!path.fx.maxEffort);
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
        const leg = Math.min(roll.leg, state.path.learned);
        const metres = roll.progress * roll.ground.legLength(leg);
        const chain = roll.legs || 0;
        setText($('liveXpValue'), `+${xpText(E.rollXp(state, roll.progress, false, units, metres, leg) * E.chainMult(chain) + (roll.legXp || 0))} XP`);
        const mult = 1 + E.derive(state).cleanRollBonus * units;
        const parts = [];
        if (chain) parts.push(`chain ×${E.chainMult(chain)}`);
        if (units) parts.push(`×${mult.toFixed(2)} · +${xpText(roll.bonusXp)} banked`);
        setText($('liveXpMult'), parts.join(' · '));
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
        const systemNode = $('chargeSystem');
        systemNode.hidden = perfectNode.hidden || zone.systemTo <= zone.systemFrom;
        systemNode.style.left = `${zone.systemFrom * 100}%`;
        systemNode.style.width = `${Math.max(0.4, (zone.systemTo - zone.systemFrom) * 100)}%`;
        fill.classList.toggle('perfect', hit === 'perfect' || hit === 'system');
        fill.classList.toggle('system', hit === 'system');
        // Budget: the part of the meter you can't afford right now is shaded off.
        const budget = path.charging ? path.charging.cap : chargeBudget();
        const over = $('chargeOver');
        over.style.left = `${budget * 100}%`;
        over.style.width = `${(1 - budget) * 100}%`;
        $('charge').classList.toggle('clean', path.cleanFlash > 0);
        const charge = Math.max(E.PATH.minCharge, level);
        const zoneBoost = kind => (kind === 'system' ? d.systemPower : kind === 'perfect' ? d.perfectPower : d.cleanPower);
        const free = crunching() || frozen();
        setText($('chargeValue'), path.cleanFlash > 0
            ? path.cleanText
            : path.charging
                ? `Strength ${E.sprintStrength(state, charge, hit).toFixed(1)}${hit && zoneBoost(hit) > 1 ? ` (${PROMPT_NAMES[hit].toLowerCase()} ×${zoneBoost(hit).toFixed(2)})` : ''} · ${free ? 'free' : `costs ${E.formatCost(E.pushCost(state, charge, ballLeg()))}`}`
                : frozen() ? 'Bullet Time: sprints are free and bank their power'
                : path.fx.maxEffort ? `Max Effort: full strength ×${d.maxEffortMult.toFixed(2)}, a super prompt`
                : crunching() ? 'Crunch: every sprint is free, and no waiting'
                : `Full sprint: ${E.formatCost(E.pushCost(state, 1, ballLeg()))}${budget < 1 ? ` · you can afford ${Math.round(budget * 100)}%` : ''}`);
        setText($('chargeClean'), roll.bonusXp ? `+${xpText(roll.bonusXp)} XP banked` : '');
    }

    // Ground height anywhere: the live roll's terrain on the current stretch; earlier stretches show
    // only their (fixed) skill hills, since their rolling hills were different every roll.
    function groundAt(roll, x) {
        // Flat behind the start line (a ball that rolls back there ends the run), except in the
        // overview after a skill, which shows the whole journey so far.
        if (x < roll.ground.start && path.overview <= 0) return 0;
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
    const RELIEF_BASE = 4;      // vertical exaggeration of the drawing on a wide canvas
    // Taller canvases exaggerate more, so the hills use the height instead of leaving empty sky.
    let RELIEF = RELIEF_BASE;
    const HEADROOM = 1.45;      // space above the tallest hill in view

    function drawArea() {
        const a = { w: path.width - PAD_X * 2, h: path.height - PAD_TOP - PAD_BOTTOM };
        RELIEF = RELIEF_BASE * Math.max(1, (a.h / Math.max(1, a.w)) / 0.25);
        return a;
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
        // The window is sized to the leg the ball is on, so a replay frames each leg like a normal run.
        const leg = g.legAt(roll.ball.x);
        const span = T.skillHill(leg).end - g.legStart(leg);
        const base = Math.min(span + 0.6, Math.max(3, span * 0.25));
        const leftOf = view => Math.max(g.start - 0.4, roll.ball.x - view * 0.3);
        // Look at the base window (not the widened one) to decide the zoom, so it can't feed on itself.
        const ahead = tallestIn(roll, leftOf(base), leftOf(base) + base);
        // Hysteresis: zoom out at once when something tall needs it, but only zoom back in once the view
        // could be 30% tighter, so it doesn't keep breathing in and out over every bump.
        let view = Math.max(base, widthToFit(ahead));
        const held = path.camView;
        if (held && held.roll === roll && view <= held.width && view > held.width / 1.3) view = held.width;
        else path.camView = { roll, width: view };
        const left = leftOf(view);
        if (!(path.tension > 0) || !path.focus) return { left, right: left + view, bottom: 0 };
        // Nail-biter: push in on the ball and the crest, lifting the view so both stay in frame.
        const area = drawArea();
        const close = Math.min(view, Math.max(1.2, path.focus.halfWidth * 1.6));
        const closeLeft = roll.ball.x - close * 0.45;
        const visibleH = area.h * close / (area.w * RELIEF);
        const closeBottom = Math.max(0, roll.ground.height(roll.ball.x) - visibleH * 0.35);
        const t = path.tension;
        const l = left + (closeLeft - left) * t;
        return { left: l, right: l + view + (close - view) * t, bottom: closeBottom * t };
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
        const ease = Math.min(1, dt * (path.overview > 0 ? 2.2 : path.tension > 0.05 ? 8 : 5));
        path.cam.left += (target.left - path.cam.left) * ease;
        path.cam.right += (target.right - path.cam.right) * ease;
        path.cam.bottom = (path.cam.bottom || 0) + ((target.bottom || 0) - (path.cam.bottom || 0)) * ease;
        const cam = path.cam;
        const goal = g.goal;

        // Same scale on both axes (times the fixed exaggeration), derived from the eased camera width.
        const area = drawArea();
        const pxPerUnit = area.w / (cam.right - cam.left);
        const yScale = pxPerUnit * RELIEF;
        const X = x => PAD_X + (x - cam.left) * pxPerUnit;
        const Y = y => h - PAD_BOTTOM - Math.min((y - cam.bottom) * yScale, area.h + PAD_TOP - 4);
        const n = Math.min(1400, Math.max(300, Math.round(w * 1.5)));
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const x = cam.left + (cam.right - cam.left) * i / n;
            pts.push([X(x), Y(x > goal.end ? 0 : groundAt(roll, x)), x]);
        }

        ctx.clearRect(0, 0, w, h);
        // Flow: calm lights drift up behind everything, and the whole trail swells gently to a slow beat
        // around the ball (a soft thump, then a long ease back).
        const fx = path.fx;
        const t = performance.now() / 1000;
        const beat = fx.lift > 0 && !reducedMotion() ? Math.exp(-((t * FLOW_BPM / 60) % 1) * 5) : 0;
        for (const l of fx.lights) {
            const a = Math.min(1, l.age / 0.8, (l.life - l.age) / 1.2) * 0.45 * (0.8 + 0.4 * beat);
            const g = ctx.createRadialGradient(l.x * w, l.y * h, 0, l.x * w, l.y * h, l.r);
            g.addColorStop(0, hexAlpha(c[l.hue] || l.hue, a));
            g.addColorStop(1, hexAlpha(c[l.hue] || l.hue, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(l.x * w, l.y * h, l.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.save();
        if (beat) {
            const pulse = 1 + 0.035 * fx.lift * beat;
            const cx = X(roll.ball.x);
            const cy = Y(groundAt(roll, roll.ball.x));
            ctx.translate(cx, cy);
            ctx.scale(pulse, pulse);
            ctx.translate(-cx, -cy);
        }
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
        for (let j = 0; j < g.last; j++) {
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

        // Record flag: the furthest any roll has reached on the frontier leg.
        if (state.path.best > 0) {
            const fs = g.legStart(g.last);
            const fx = fs + state.path.best * (goal.peak - fs);
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

        // Skill hill label, kept on screen as an arrow when the hill is still ahead of the view. On a replay
        // it names the hill of the leg the ball is on (✓ when already learned).
        const legNow = roll.leg;
        const hillNow = T.skillHill(legNow);
        const cleared = legNow < state.path.learned;
        const skillName = E.skillAt(legNow).name + (cleared ? ' ✓' : '');
        const tone = cleared ? c.success : c.warning;
        ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
        ctx.fillStyle = tone;
        if (X(hillNow.peak) <= w - PAD_X) {
            // A cleared hill in view is already named by its marker.
            if (!cleared) ctx.fillText(skillName, Math.min(w - 70, Math.max(70, X(hillNow.peak))), Math.max(16, Y(hillNow.height) - 34));
        } else {
            const ahead = hillNow.start - roll.ball.x;
            ctx.textAlign = 'right';
            ctx.fillText(`${skillName} →`, w - PAD_X, 16);
            ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = hexAlpha(tone, 0.75);
            ctx.fillText(`${ahead.toFixed(1)} m ahead`, w - PAD_X, 30);
        }

        // Debris from shattered hills (Paradigm Shift).
        for (const p of fx.debris) {
            if (p.age < 0) continue;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
            ctx.translate(X(p.wx) + p.x, Y(p.wy) + p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = hexAlpha(c.secondary, 0.9);
            ctx.strokeStyle = c.warning;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-p.size, -p.size * 0.4);
            ctx.lineTo(p.size * 0.6, -p.size * 0.7);
            ctx.lineTo(p.size * 0.8, p.size * 0.5);
            ctx.lineTo(-p.size * 0.5, p.size * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Ball, riding on the line (centred on it, like a bead on a wire). Ring: green while rolling
        // forward, red while rolling back. In flow it floats above the line with a slow bob.
        // A winding-up breakthrough shakes harder and harder until it goes.
        const wind = fx.windup ? Math.min(1, fx.windup.age / WINDUP_SECONDS) : 0;
        const jitter = wind ? (1.5 + 4 * wind) : 0;
        const lift = fx.lift * (28 + (reducedMotion() ? 0 : 5 * Math.sin(t * 2.4)));
        const gx = X(roll.ball.x);
        const gy = Y(groundAt(roll, roll.ball.x));
        const bx = gx + (jitter ? (Math.random() - 0.5) * jitter : 0);
        const by = gy - lift + (jitter ? (Math.random() - 0.5) * jitter : 0);
        if (lift > 1) {
            // Its shadow stays on the line.
            ctx.fillStyle = hexAlpha('#000000', 0.35 * fx.lift);
            ctx.beginPath();
            ctx.ellipse(gx, gy + 2, BALL * (1.4 - 0.3 * fx.lift), BALL * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.shadowColor = c.secondary;
            ctx.shadowBlur = 24;
            ctx.fillStyle = hexAlpha(c.secondary, 0.25 * fx.lift);
            ctx.beginPath();
            ctx.arc(bx, by, BALL * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            if (fx.superFlow && beat > 0.6) {
                ctx.strokeStyle = hexAlpha(LUCID, 0.5 * beat);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(gx, gy, 30 + 60 * (1 - beat), 8 + 16 * (1 - beat), 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        drawLuckUnder(ctx, roll, bx, by, X, Y, wind);
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
        ctx.strokeStyle = wind ? c.warning : crunching() ? c.danger : roll.ball.v > 0.05 ? c.success : roll.ball.v < -0.05 ? c.danger : c.primary;
        ctx.stroke();
        drawLuckOver(ctx, bx, by, wind);
        ctx.restore();

        // Bullet Time: the world goes cold and still.
        if (frozen()) {
            const a = Math.min(1, (fx.freezeMax - fx.freeze) * 4, fx.freeze * 4);
            ctx.fillStyle = `rgba(120, 170, 255, ${0.13 * a})`;
            ctx.fillRect(0, 0, w, h);
            const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
            vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vg.addColorStop(1, `rgba(10, 30, 70, ${0.5 * a})`);
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, w, h);
        }

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
        if (state.path.best > 0 && !cleared) {
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

        // Confetti, falling across the whole trail.
        for (const p of path.particles) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.max(0, Math.min(1, (path.height + 10 - p.y) / 60));
            ctx.fillStyle = p.color;
            ctx.fillRect(-2, -3.5, 4, 7);
            ctx.restore();
        }

        // Nail-biter: darken the edges and ask the question.
        if (path.tension > 0.01 && !path.summit) {
            const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
            vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vg.addColorStop(1, `rgba(0, 0, 0, ${0.55 * path.tension})`);
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, w, h);
            ctx.textAlign = 'center';
            ctx.font = '700 15px "Chakra Petch", system-ui, sans-serif';
            ctx.fillStyle = hexAlpha(c.warning, path.tension);
            const f = path.focus;
            ctx.fillText(f && f.skill !== null
                ? (f.skill < state.path.learned ? `Clear ${E.skillAt(f.skill).name}?` : `Will it learn ${E.skillAt(f.skill).name}?`)
                : 'Come on…', w / 2, 66);
        }

        // Summit banner: pops in, holds, fades.
        // A cleared leg crossed on a replay: a quick line under the top of the trail.
        if (path.legFlash && path.legFlash.big) {
            // Luck banner: pops in large with its subtitle, holds, fades.
            const f = path.legFlash;
            const a = f.age;
            const life = LEG_FLASH_SECONDS * 1.3;
            const pop = a < 0.18 ? 0.5 + 3.4 * a : a < 0.3 ? 1.11 - 0.9 * (a - 0.18) : 1;
            const tone = c[f.tone] || f.tone || c.warning;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, a / 0.1, (life - a) / 0.5));
            ctx.translate(w / 2, Math.max(78, h * 0.2));
            ctx.scale(pop, pop);
            ctx.textAlign = 'center';
            ctx.shadowColor = tone;
            ctx.shadowBlur = 22;
            ctx.fillStyle = tone;
            ctx.font = '800 30px "Chakra Petch", system-ui, sans-serif';
            ctx.fillText(f.text, 0, 0);
            ctx.shadowBlur = 8;
            ctx.fillStyle = c.text;
            ctx.font = '600 13px "Chakra Petch", system-ui, sans-serif';
            if (f.sub) ctx.fillText(f.sub, 0, 22);
            ctx.restore();
        } else if (path.legFlash) {
            const a = path.legFlash.age;
            ctx.save();
            ctx.globalAlpha = Math.min(1, a / 0.15, (LEG_FLASH_SECONDS - a) / 0.5);
            ctx.textAlign = 'center';
            ctx.font = '700 15px "Chakra Petch", system-ui, sans-serif';
            const tone = c[path.legFlash.tone || 'success'];
            ctx.shadowColor = tone;
            ctx.shadowBlur = 12;
            ctx.fillStyle = tone;
            ctx.fillText(path.legFlash.text, w / 2, Math.max(84, h * 0.22) - 6 * Math.min(1, a / 0.3));
            ctx.restore();
        }

        if (path.summit) {
            const a = path.summit.age;
            const pop = a < 0.25 ? 0.6 + 1.6 * a : 1;
            ctx.save();
            ctx.globalAlpha = Math.min(1, (SUMMIT_SECONDS - a) / 0.6);
            ctx.translate(w / 2, h * 0.32);
            ctx.scale(pop, pop);
            ctx.textAlign = 'center';
            ctx.shadowColor = c.success;
            ctx.shadowBlur = 24;
            ctx.fillStyle = c.success;
            ctx.font = '700 30px "Chakra Petch", system-ui, sans-serif';
            ctx.fillText('SUMMIT!', 0, 0);
            ctx.shadowBlur = 0;
            ctx.fillStyle = c.text;
            ctx.font = '600 13px "Chakra Petch", system-ui, sans-serif';
            ctx.fillText(path.summit.name, 0, 22);
            ctx.restore();
        }
    }

    // The rack's lanes (and their copies in the facility camera). Before automation a lane is a static
    // graph of the whole stretch with your best run marked; with the Auto-Trainer it goes live and
    // follows the ball. Drawn every frame the run loop runs, and after each camera refresh.
    function drawLanes() {
        // The static graph needs a stretch to draw even before the bay has been opened.
        const roll = path.roll || (state.unlocked['module:path'] ? currentRoll() : null);
        const c = path.colors;
        const live = E.autoTrainerLevel(state) > 0;
        for (const canvas of document.querySelectorAll('canvas.lane')) {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (!w || !h) continue;
            const dpr = Math.min(2, (window.devicePixelRatio || 1) * uiScale());
            if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
            if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const lane = Number(canvas.dataset.lane);
            if (lane > 0) {
                drawClearedLane(ctx, w, h, state.path.learned - lane, lane);
                continue;
            }
            if (!roll) continue;
            // Live: a window of trail around the ball. Monitor: the stretch, checkpoint to skill hill.
            const g = roll.ground;
            // The monitor always shows the frontier leg, even while a replay runs earlier legs.
            const fs = g.legStart(g.last);
            const span = live ? 3 : g.goal.end - fs;
            const from = live ? roll.ball.x - span * 0.4 : fs;
            const samples = live ? 32 : 120;
            // Monitor mode shows only what runs have seen: up to the furthest point reached on this
            // stretch (the record, or the run in progress). The rest is unknown, scaled to what's known.
            const onFrontier = roll.launched && g.legAt(roll.ball.maxX) === g.last;
            const seenFrac = live ? 1 : Math.max(state.path.best, onFrontier ? g.progressIn(g.last, roll.ball.maxX) : 0);
            const seenX = live ? from + span : fs + seenFrac * (g.goal.peak - fs);
            const seenPx = Math.min(w, ((seenX - from) / span) * w);
            const seenIdx = Math.min(samples, Math.floor((seenPx / w) * samples));
            let top = 0.05;
            for (let i = 0; i <= samples; i++) {
                const x = from + (i / samples) * span;
                if (x <= seenX) top = Math.max(top, roll.ground.height(x));
            }
            const y = hgt => h - 6 - Math.min(1.15, hgt / top) * (h - 16);
            const pts = [];
            for (let i = 0; i <= samples; i++) pts.push([(i / samples) * w, y(roll.ground.height(from + (i / samples) * span))]);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, seenPx, h);
            ctx.clip();
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (const [px, py] of pts) ctx.lineTo(px, py);
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fillStyle = hexAlpha(c.success, live ? 0.18 : 0.08);
            ctx.fill();
            ctx.strokeStyle = live || reducedMotion() ? c.success : hexAlpha(c.success, 0.35);
            ctx.lineWidth = 1;
            ctx.beginPath();
            pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
            ctx.stroke();
            ctx.restore();
            if (!live) {
                // The unseen rest: a dotted floor and a question mark.
                ctx.strokeStyle = hexAlpha(c.muted, 0.35);
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.moveTo(seenPx, h - 6);
                ctx.lineTo(w, h - 6);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = hexAlpha(c.muted, 0.5);
                ctx.textAlign = 'center';
                ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
                if (w - seenPx > 18) ctx.fillText(seenFrac > 0 ? '?' : 'NO DATA', (seenPx + w) / 2, h / 2 + 4);
            }
            if (!live && !reducedMotion() && seenIdx >= 2) {
                // Monitor mode: a scan sweeps what's been seen, with a fading trail and a bright head on the line.
                const scan = ((performance.now() / 1000) / LANE_SCAN_SECONDS) % 1;
                const head = scan * seenIdx;
                const tail = Math.max(3, seenIdx * 0.3);
                ctx.lineWidth = 1.6;
                ctx.shadowColor = c.success;
                ctx.shadowBlur = 6;
                for (let i = Math.max(1, Math.floor(head - tail)); i <= Math.min(seenIdx, Math.ceil(head)); i++) {
                    const alpha = Math.max(0, 1 - (head - i) / tail);
                    ctx.strokeStyle = hexAlpha(c.success, alpha);
                    ctx.beginPath();
                    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
                    ctx.lineTo(pts[i][0], pts[i][1]);
                    ctx.stroke();
                }
                const hi = Math.min(seenIdx, Math.floor(head));
                const f = head - hi;
                const next = Math.min(seenIdx, hi + 1);
                const hx = pts[hi][0] + (pts[next][0] - pts[hi][0]) * f;
                const hy = pts[hi][1] + (pts[next][1] - pts[hi][1]) * f;
                ctx.fillStyle = c.text;
                ctx.beginPath();
                ctx.arc(hx, hy, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // Faint vertical scan line.
                ctx.fillStyle = hexAlpha(c.success, 0.12);
                ctx.fillRect(hx - 1, 0, 2, h);
            }
            if (live) {
                const by = y(roll.ground.height(roll.ball.x));
                ctx.fillStyle = c.accent;
                ctx.beginPath();
                ctx.arc(0.4 * w, by, 2.6, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Best run so far: a marker line at that point of the stretch.
                const bestX = fs + state.path.best * (g.goal.peak - fs);
                const mx = ((bestX - from) / span) * w;
                ctx.strokeStyle = hexAlpha(c.accent, 0.8);
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(mx, 4);
                ctx.lineTo(mx, h);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Progress along the stretch: live, or the best run.
            ctx.fillStyle = hexAlpha(c.warning, 0.8);
            ctx.fillRect(0, h - 2, w * (live ? roll.progress : state.path.best), 2);
        }
    }

    const LANE_SCAN_SECONDS = 4;   // one sweep of the monitor across the stretch (before automation)

    // A cleared stretch training itself: its whole terrain, with a ball crawling along it on a loop.
    const clearedTerrains = new Map();
    function drawClearedLane(ctx, w, h, k, lane) {
        if (k < 0) return;
        if (!clearedTerrains.has(k)) clearedTerrains.set(k, T.terrain(k, 9973 * (k + 1)));
        const g = clearedTerrains.get(k);
        const c = path.colors;
        const from = g.start;
        const span = g.goal.end + 0.3 - from;
        const samples = 90;
        let top = 0.05;
        for (let i = 0; i <= samples; i++) top = Math.max(top, g.height(from + (i / samples) * span));
        const y = hgt => h - 5 - (hgt / top) * (h - 14);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i <= samples; i++) ctx.lineTo((i / samples) * w, y(g.height(from + (i / samples) * span)));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(c.primary, 0.16);
        ctx.fill();
        ctx.strokeStyle = hexAlpha(c.primary, 0.85);
        ctx.lineWidth = 1;
        ctx.stroke();
        // Very slow: the engine's automated laps (one every 40 s or so, longer for later stretches),
        // eased between ticks. Each lap adds a little compute.
        const laps = (state.path.auto[k] || 0) + Math.min(0.2, (Date.now() - lastTick) / 1000) * debugSpeed / E.clearedPeriod(k);
        const t = laps % 1;
        const bx = from + t * span;
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.arc(t * w, y(g.height(bx)), 2.2, 0, Math.PI * 2);
        ctx.fill();
        if (lane === hoverLane && ctx.canvas.closest('#bays')) {
            ctx.fillStyle = 'rgba(3, 12, 10, 0.72)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = c.success;
            ctx.textAlign = 'center';
            ctx.font = `700 ${Math.max(9, Math.min(12, w / 6))}px "Chakra Petch", system-ui, sans-serif`;
            ctx.fillText('▶ REPLAY', w / 2, h / 2 - 2);
            ctx.font = `500 ${Math.max(8, Math.min(10, w / 8))}px "JetBrains Mono", ui-monospace, monospace`;
            ctx.fillText(`leg ${k + 1}`, w / 2, h / 2 + 11);
        }
    }

    function hexAlpha(hex, alpha) {
        const n = parseInt(hex.replace('#', ''), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    // ---- Init -----------------------------------------------------------

    function init() {
        // Full-height screens subtract the top bar, whose height changes as chips appear (page pixels).
        const topbar = document.querySelector('.topbar');
        new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)).observe(topbar);
        buildActions();
        buildUpgrades();
        buildChecklists();
        buildBindings();
        buildSettings();
        buildJournal();
        buildFacility();
        buildMinimap();
        buildTasks();
        WIDE.addEventListener('change', () => render());
        DESKTOP.addEventListener('change', () => render());
        buildHub();
        buildPath();
        buildTree();
        buildTreeCamera();
        load();
        syncSettings();
        E.evaluate(state); // silently restore unlocks implied by the loaded state
        render();
        lastTick = Date.now();
        setInterval(tick, TICK_MS);
        setTimeout(() => { revealReady = true; }, 1200);
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
                // Insight lives with the version (spendable and lifetime).
                if (key === 'insight') {
                    state.prestige.points += amount;
                    state.prestige.total += amount;
                } else {
                    state[group][key] += amount;
                }
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
                Object.assign(path, { roll: null, done: false });
                dismissResult();
                path.overview = OVERVIEW_SECONDS;
                afterChange();
                startPathLoop();
            },
            // Learn skills until the given phase is reached (attributes topped up if skills aren't enough).
            reachPhase(index) {
                const phase = E.PHASES[index];
                for (let i = 0; i < 40 && E.phaseIndex(state) < index; i++) E.learnSkill(state, state.path.learned);
                for (const [k, v] of Object.entries(phase.req)) state.attr[k] = Math.max(state.attr[k], v);
                Object.assign(path, { roll: null, done: false });
                dismissResult();
                afterChange();
            },
            // Buy every Training node to its max (XP-priced ones; the Auto-Trainer is separate).
            maxTree() {
                for (const up of E.UPGRADES.filter(u => u.tab === 'training' && u.cost.xp)) state.levels[up.id] = up.max;
                path.roll = null;
                afterChange();
            },
            toggleAutoTrainer() {
                const on = !E.autoTrainerLevel(state);
                state.prestige.levels.autoTrainer = on ? 2 : 0;
                E.setTaskOn(state, 'autoTrainer', true);
                state.unlocked['up:autoTrainer'] = true;
                afterChange();
                startPathLoop();
            },
            // Count one new version without resetting (opens R&D and the legacy nodes), with some Insight.
            addVersion() {
                state.prestige.count++;
                state.prestige.minor++;
                state.prestige.points += 10;
                state.prestige.total += 10;
                afterChange();
            },
            // Ship the next version for real, even below the requirement (at least 1 Insight).
            shipVersion() {
                state.attr.intelligence = Math.max(state.attr.intelligence, E.PRESTIGE_MIN_INTELLIGENCE);
                state.stats.runCp = Math.max(state.stats.runCp, 1e5);
                shipVersion(true);
            },
            // Every legacy node to its max (Flow State, the supers, the Auto-Trainer…).
            maxLegacy() {
                state.prestige.count = Math.max(1, state.prestige.count);
                for (const up of E.UPGRADES.filter(u => u.legacy)) state.prestige.levels[up.id] = up.max;
                path.roll = null;
                afterChange();
            },
            // Power-ups on demand. Breakthroughs (and Paradigm Shift) and system prompts take your next sprint;
            // the rest start now: a crunch, Bullet Time, Max Effort, a flow (or Lucid Dream) on the ball in
            // flight (else on your next sprint), and a viral run at the next run's end.
            luck(kind) {
                const roll = currentRoll();
                const d = E.derive(state);
                const seconds = Math.max(3, d.crunchSeconds);
                if (kind === 'crunch') {
                    path.fx.crunch = path.fx.crunchMax = seconds;
                    luckBanner('CRUNCH TIME!', `Free sprints for ${seconds} s, no waiting`, 'danger');
                } else if (kind === 'superCrunch') {
                    path.fx.freeze = path.fx.freezeMax = seconds;
                    luckBanner('BULLET TIME', `Time stops for ${seconds} s. Every sprint banks its power`, 'primary');
                } else if (kind === 'maxEffort') {
                    path.fx.maxEffort = true;
                    luckBanner('MAX EFFORT', 'Your next sprint goes all out: full strength, a super prompt', 'warning');
                } else if (kind === 'flow' || kind === 'superFlow') {
                    if (roll.launched && !roll.over && !roll.crested) startFlow(roll, kind === 'superFlow');
                    else {
                        path.fx.forceLuck = kind;
                        luckBanner('FLOW NEXT', 'Your next sprint starts a flow', 'secondary');
                    }
                } else if (kind === 'viral') {
                    path.fx.forceViral = true;
                    luckBanner('VIRAL NEXT', 'This run will go viral when it ends', 'accent');
                } else if (kind === 'system') {
                    path.fx.forceKind = 'system';
                    luckBanner('SYSTEM PROMPT NEXT', 'Your next release counts as a system prompt', 'accent');
                } else {
                    path.fx.forceLuck = kind;
                    luckBanner(kind === 'superBreakthrough' ? 'PARADIGM SHIFT NEXT' : 'BREAKTHROUGH NEXT', 'Your next sprint', 'warning');
                }
                startPathLoop();
            },
            // ---- Lab ----
            // Investor offers: fill every free slot now, finish them all, or clear them.
            fillOffers() {
                state.unlocked['module:path'] = state.unlocked['action:research'] = true;
                while (state.projects.offers.length < E.PROJECTS.maxOffers && E.makeOffer(state)) { /* fill */ }
                afterChange();
            },
            finishOffers() {
                for (const o of state.projects.offers) o.start -= o.target;
                afterChange();
            },
            clearOffers() {
                state.projects.offers = [];
                state.projects.boosts = [];
                afterChange();
            },
            // Do every workbench job's "by hand" requirement for automation at once.
            meetAutomation() {
                for (const g of Object.values(E.AUTOMATION)) state.stats[g.stat] = Math.max(state.stats[g.stat] || 0, g.need);
                E.evaluate(state);
                afterChange();
            },
            // +`n` levels of every hardware tier (opens the tiers too), to watch cabinets fill and merge.
            addHardware(n = 10) {
                for (const up of E.UPGRADES.filter(u => u.cps)) {
                    state.levels[up.id] = E.level(state, up.id) + n;
                    state.unlocked['up:' + up.id] = true;
                }
                afterChange();
            },
            // Buy one level of every visible lab upgrade you can't yet afford, for free.
            buyLabUpgrades() {
                for (const up of E.UPGRADES.filter(u => u.tab !== 'training' && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u))) {
                    state.levels[up.id] = E.level(state, up.id) + 1;
                    for (const [k, v] of Object.entries(up.grants || {})) state.attr[k] += v;
                }
                afterChange();
            },
            labLog: text => termLog(text || `test line ${Date.now() % 1000}`),
            // ---- Server room ----
            // Automated laps on every cleared leg (their compute bonus), and the frontier record.
            addLaps(n = 50) {
                for (let k = 0; k < state.path.learned; k++) state.path.auto[k] = (state.path.auto[k] || 0) + n;
                afterChange();
            },
            setRecord(best = 0.9) {
                state.path.best = Math.min(1, Math.max(0, best));
                afterChange();
            },
            // Forget which rooms you've visited (the ⌂ link pulses again) and the cabinets' order.
            resetVisits() {
                storageSet(SEEN_KEY, '[]');
                storageSet(RACK_LOG_KEY, '[]');
                seenRooms = new Set([view]);
                cabinetKey = null;
                afterChange();
            },
            // End the run in progress where the ball is.
            finishRun() {
                const r = path.roll;
                if (r && r.launched && !r.over) finishRoll(r.end());
            },
            // Put the ball on the skill hill's climb with just enough speed (found by simulating a copy of
            // the run, since slopes change the energy needed): a nail-biter, then a summit. Below 1 it falls short.
            testSummit(margin = 1.02) {
                if (openBay === 'training' && path.view !== 'run') showTrainingView('run');
                if (path.done) runAgain();
                const r = currentRoll();
                const d = E.derive(state, debugRates);
                const opts = { pushes: 1, cooldown: 1, friction: d.friction, hillScale: d.hillScale, last: r.ground.last };
                const h = r.ground.goal;
                const x = h.peak - h.halfWidth * 0.7;
                const crests = v => {
                    const t = T.createRoll(r.ground.stretch, r.ground.seed, opts);
                    t.push(0.001);
                    Object.assign(t.ball, { x, v, maxX: x });
                    for (let i = 0; i < 600 && !t.over; i++) if (t.step(0.05).some(e => e.type === 'crest')) return true;
                    return false;
                };
                let lo = 0;
                let hi = 1;
                while (!crests(hi) && hi < 1e4) hi *= 2;
                for (let i = 0; i < 30; i++) {
                    const mid = (lo + hi) / 2;
                    if (crests(mid)) hi = mid; else lo = mid;
                }
                if (!r.launched) r.push(0.001);
                r.ball.x = x;
                r.ball.maxX = Math.max(r.ball.maxX, x);
                r.ball.v = hi * margin;
                startPathLoop();
            },
            // The same, just short: it should nearly make it, stall and roll back.
            testNailBiter() {
                this.testSummit(0.97);
            },
            setSpeed(x) {
                debugSpeed = Math.max(0.1, Math.min(50, Number(x) || 1));
                startPathLoop();
            },
            get speed() { return debugSpeed; },
            resetTreeView: () => resetTreeCam(),
            roll: () => {
                const r = currentRoll();
                return { stretch: r.ground.stretch, x: r.ball.x, v: r.ball.v, launched: r.launched, over: r.over,
                    pushesLeft: r.pushesLeft, cooldown: r.ball.cooldown, atRest: r.atRest, progress: r.progress,
                    zone: currentZone(r), clean: r.clean || 0, charge: chargeLevel(),
                    slope: r.ground.slope(r.ball.x), crested: r.crested, tension: path.tension, timeScale: path.timeScale,
                    summit: !!path.summit, particles: path.particles.length, cam: path.cam && { ...path.cam } };
            },
            // Put the ball somewhere with some speed (testing the camera and slow motion).
            setBall(x, v) {
                const r = currentRoll();
                r.ball.x = x;
                r.ball.v = v;
                r.ball.maxX = Math.max(r.ball.maxX, x);
                startPathLoop();
            },
            simulate(seconds) {
                E.tick(state, seconds, debugRates);
                afterChange();
            },
            log
        }
    };
})();
