// game.js — DOM layer: renders state from AGIEngine, wires input, runs the loop, persists saves.
window.AGI = (function () {
    'use strict';

    const E = window.AGIEngine;
    // Review builds open straight into Packet Snare (see straightToSnare).
    const SNARE_DIRECT = window.AGI_SNARE_DIRECT === true || location.hash === '#snare';
    const SAVE_KEY = 'agiGame';
    const BACKUP_KEY = 'agiGame.bak';         // the last good save (refreshed every BACKUP_MS, and kept before an import)
    const CORRUPT_KEY = 'agiGame.corrupt';    // a save that couldn't be read, kept as it was
    const BACKUP_MS = 10 * 60000;
    const TICK_MS = 100;
    const AUTOSAVE_MS = 30000;
    const HOLD_REPEAT_MS = 242;       // holding a job repeats on the music's 8th notes (124 BPM: 4.13 clicks a second, a comfort option, not a turbo); this is the fallback without audio
    const LOG_LIMIT = 60;

    let state;
    let lastTick = Date.now();
    let lastSave = Date.now();
    let lastBackup = 0;
    let passiveTab = false;     // another tab has the game: this one stops ticking and saving
    let notice = null;          // a dialog to show once the page is up (an unreadable save)
    const debugRates = { cp: 1, dp: 1, rp: 1, xp: 1 };
    // Debug: flat amounts added every second of game time (on top of production), per resource.
    const debugIncome = { cp: 0, dp: 0, rp: 0, xp: 0, insight: 0 };
    let debugSpeed = 1;         // debug: game speed (economy ticks and training physics)
    const ui = { binds: [], actions: {}, upgrades: {}, stations: {}, panels: {}, milestones: {}, achievements: {} };

    // ---- Storage --------------------------------------------------------

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }

    const MAP_MIN_KEY = 'agiMapMin';   // screen state: the minimap minimized to its pill

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch { return false; }
    }

    // Music (sfx.js): a backbeat whose intensity follows the ball's speed on the trail and whose mood follows the
    // power-up in play (a crunch distorts it, flow and bullet time slow and muffle it). Quiet everywhere else.
    const MUSIC_KEY = 'agiMusic';
    const BEAT_KEY = 'agiBeat';      // the music track: Classic, Dark, Soft, Ominous or Retro (per device)
    const MUSIC_MIX_KEY = 'agiMusicMix2';  // the music's Beat and Tones volumes (per device; v2 when the tracks' own balance put the beat under the tones, so old settings don't halve it again)
    const THEME_KEY = 'agiTheme';           // auto (follows the beat), night, red or pink (per device)
    // The colour theme: chosen, or by default the beat's (Classic → Night survey, Dark → Red, Soft → Soft pink).
    function applyTheme() {
        const pick = storageGet(THEME_KEY) || 'auto';
        const beat = storageGet(BEAT_KEY) || 'classic';
        const theme = pick === 'auto' ? { classic: 'night', dark: 'red', soft: 'pink', ominous: 'void', retro: 'arcade' }[beat] || 'night' : pick;
        if (theme === 'night') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = theme;
        readPathColors();
    }
    const SFX_MIX_KEY = 'agiSfxMix';        // each sound group's volume (per device)
    const SFX_SIMPLE_KEY = 'agiSfxSimple';  // simple sounds only (per device)
    const SOUND_GROUPS = [['clicks', 'Workbench clicks'], ['buys', 'Purchases'], ['training', 'Training'], ['events', 'Celebrations'], ['ui', 'Interface']];
    const SOUND_GROUP_SAMPLE = { clicks: 'click', buys: 'buy', training: 'clean', events: 'achievement', ui: 'ui' };
    const MUSIC_DEFAULT = '0.35';
    function musicTick() {
        if (!window.SFX?.musicState) return;
        // The lab (with Surveillance and R&D) and the server room (with its bays) each have their own songs.
        window.SFX.setArea?.(openBay === 'pipeline' ? 'snare' : openBay || view === 'servers' ? 'server' : 'lab');
        // How much of the arrangement the game has earned: a new game is a kick and a bass, and every skill
        // (and every shipped version) adds to it, by step on the difficulty curve (`legPos`: act one's twelve skills
        // build it as its six did); training runs add the rest with speed.
        window.SFX.setDepth?.(Math.min(1, (E.legPos(state.path.learned) + 2 * state.prestige.count + 2 * state.transcend.count) / 12));
        // The beat only while training: the Training Cluster's run view, runs and the pauses between them.
        // Packet Snare's runs bring the beat in too, and build: the busier the field (packets, hazards, the boss) and the
        // lower your Focus, the more of the song plays.
        const sr = openBay === 'pipeline' && snare.run && !snare.run.over && !snare.preview ? snare.run : null;
        window.SFX.setTraining?.((openBay === 'training' && path.view === 'run') || !!sr);
        if (sr) {
            const busy = Math.min(1, (sr.antivirus.length * 0.15 + sr.cores.length * 0.15 + (sr.boss ? 0.35 : 0) + (sr.drawing ? 0.15 : 0)));
            return window.SFX.musicState(0.3 + 0.45 * busy + 0.25 * (1 - sr.focus / sr.maxFocus), null);
        }
        const r = path.roll;
        const running = openBay === 'training' && path.view === 'run' && r && r.launched && !r.over;
        if (!running) return window.SFX.musicState(openBay === 'training' ? 0.15 : 0.05, null);
        const speed = Math.abs(r.ball.v) / Math.max(1, Math.sqrt(9.8 * T.skillHeight(Math.max(1, ballLeg()))));
        const m = path.fx.freeze > 0 ? 'freeze' : path.fx.crunch > 0 ? 'crunch' : r.flowing ? 'flow' : null;
        window.SFX.musicState(0.25 + 0.75 * Math.min(1, speed / 1.6), m);
    }

    // Playtest recorder (playtest.js): events stamped with play time, kept on this device, copied out from Settings.
    const playtest = window.Playtest?.create({ get: storageGet, set: storageSet }) || null;
    let playtestSampleAt = 0;
    // Rare progression events are written at once: the log is otherwise flushed every 30 s of play and on
    // hide, so a crash or a killed tab lost the funnel's steps since the last sample.
    const PT_FLUSH = new Set(['skill', 'unlock', 'phase', 'ship', 'transcend', 'challenge', 'perk', 'ending', 'mailAccepted', 'setting', 'save']);
    function pt(type, data) {
        if (!playtest || !state) return;
        playtest.event(state.stats.playTime, type, data);
        if (PT_FLUSH.has(type)) playtest.flush();
    }
    const r2 = x => Math.round(x * 100) / 100;
    let playtestView = null;
    const ptPlace = () => (openBay === 'training' && path.view === 'dev' ? 'tree' : currentPlace());
    // Investor offers: when each arrives, is finished, and leaves (claimed and dismissed are logged by their buttons).
    const ptOffers = { state: null, seen: new Map(), handled: new Set() };
    function playtestOffers() {
        if (!playtest) return;
        if (ptOffers.state !== state) { ptOffers.state = state; ptOffers.seen.clear(); for (const o of state.projects.offers) ptOffers.seen.set(o.id, false); return; }
        const now = new Set();
        for (const o of state.projects.offers) {
            now.add(o.id);
            const done = E.projectProgress(state, o) >= o.target;
            if (!ptOffers.seen.has(o.id)) {
                pt('offer', { id: o.id, task: o.task, target: o.target, reward: E.PROJECT_REWARDS[o.reward].text, s: Math.round(o.deadline - state.stats.playTime) });
            }
            if (done && !ptOffers.seen.get(o.id)) pt('offerDone', { id: o.id });
            ptOffers.seen.set(o.id, done);
        }
        for (const id of [...ptOffers.seen.keys()]) {
            if (now.has(id)) continue;
            if (!ptOffers.handled.has(id)) pt('offerExpired', { id });
            ptOffers.seen.delete(id);
        }
    }
    function ptView(v) {
        if (v === playtestView) return;
        playtestView = v;
        pt('view', { v });
    }
    // Every SAMPLE_SECONDS of play: what you hold, what comes in, where you are, and the clicks since the last one.
    function playtestSample(force) {
        if (!playtest || !state || (!force && state.stats.playTime < playtestSampleAt)) return;
        playtestSampleAt = state.stats.playTime + window.Playtest.SAMPLE_SECONDS;
        const d = E.derive(state);
        const r = state.res;
        pt('sample', { cp: Math.round(r.cp), dp: Math.round(r.dp), rp: Math.round(r.rp), xp: Math.round(r.xp),
            cpNet: r2(d.cpNet), dpNet: r2(d.dpNet), rpRate: r2(d.rpPerSec), xpRate: r2(d.xpPerSec),
            int: r2(state.attr.intelligence), skills: state.path.learned, phase: E.phaseIndex(state), ver: E.currentVersion(state), at: ptPlace(),
            // What the badges said: new lab cards, investor offers (open / done), skill-tree nodes you could buy.
            labNew: labUnseen().length, offers: state.projects.offers.length,
            offersDone: state.projects.offers.filter(o => E.projectProgress(state, o) >= o.target).length, treeReady: treeReady(),
            hand: playtest.takeCounts() });
        playtest.flush();
    }

    function save(manual) {
        if (passiveTab) return;
        state.lastSaved = Date.now();
        lastSave = state.lastSaved;
        const json = E.serialize(state);
        const ok = storageSet(SAVE_KEY, json);
        if (ok && lastSave - lastBackup >= BACKUP_MS) {
            storageSet(BACKUP_KEY, json);
            lastBackup = lastSave;
        }
        if (manual) log(ok ? 'Game saved.' : 'Could not save: browser storage is unavailable.', ok ? 'success' : 'warning');
    }

    // A save's one-line summary, for the import and backup prompts.
    const saveSummary = s => `${E.currentVersion(s)} · ${s.path.learned} skill${s.path.learned === 1 ? '' : 's'} · ${E.formatDuration(s.stats.playTime)} played`;
    const ago = s => `${E.formatDuration(Math.max(0, (Date.now() - s.lastSaved) / 1000))} ago`;

    function load() {
        const now = Date.now();
        // Republished while open (a claude.ai artifact): the viewer hands over the save the old page made just
        // before the update, newer than (or, with storage blocked, instead of) the stored one.
        let handed = null;
        try { handed = window.claude?.hot?.data?.save || null; } catch { /* not in a viewer */ }
        const json = handed || storageGet(SAVE_KEY);
        if (!json) {
            state = E.defaultState(now);
            log('Welcome. Click Generate Compute to begin.', 'special');
            return;
        }
        const loaded = E.deserialize(json, now);
        if (!loaded) {
            // Nothing is thrown away: the unreadable save is kept as it was, and the backup comes back if
            // there is one (the next autosave used to write a fresh game over it).
            storageSet(CORRUPT_KEY, json);
            const raw = storageGet(BACKUP_KEY);
            const backup = raw && E.deserialize(raw, now);
            state = backup || E.defaultState(now);
            E.setNotation(state.settings.notation);
            log(backup ? 'Your save could not be read, so your last backup was restored.' : 'Your save could not be read, so a new game was started.', 'warning');
            notice = {
                title: backup ? 'Save restored from backup' : 'Your save could not be read',
                message: `${backup ? `The backup from ${ago(backup)} was restored (${saveSummary(backup)}).` : 'A new game was started.'} The unreadable save is below and still kept in this browser: copy it if you want to keep it.`,
                text: json
            };
            return;
        }
        state = loaded;
        storageSet(BACKUP_KEY, json);   // it reads: a good backup
        lastBackup = now;
        E.setNotation(state.settings.notation);
        log('Game loaded.', 'success');
    }

    // Sound (sfx.js): lab sounds always; training sounds only while you can see the trail.
    const sfx = (name, opts) => window.SFX?.play(name, opts);
    let heldBeat = false;   // a held job's repeat is firing: its click sound lands on the next 8th note
    const trailSfx = (name, opts) => { if (path.visible) sfx(name, opts); };

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
        // A reveal held while the lab made room clips its node inline until it runs; a node hidden and shown again
        // meanwhile must never stay clipped away.
        if (!hidden && node.style?.clipPath) node.style.clipPath = '';
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
        // The new section waits (invisible) until the others have made room, then boots in once. It was held
        // paused at its first frame since revealIn: starting it there and adding the delay a frame later
        // restarted it, so a new card wiped in, vanished for most of a second and wiped in again.
        for (const n of fresh) {
            n.style.animationDelay = moved ? `${MAKE_ROOM_MS + 80}ms` : '';
            n.style.animationPlayState = '';
            // The inline clip stays until the animation is really running (it takes over from there).
            const go = e => { if (e.target === n && e.animationName === 'reveal-boot') { n.style.clipPath = ''; n.removeEventListener('animationstart', go); } };
            n.addEventListener('animationstart', go);
        }
        // Panels resize while they make room, so their lists clip rather than flash a scrollbar meanwhile.
        if (moved) {
            document.body.classList.add('making-room');
            clearTimeout(playMakeRoom.timer);
            playMakeRoom.timer = setTimeout(() => document.body.classList.remove('making-room'), MAKE_ROOM_MS + 50);
        }
    }

    // New sections don't just pop in: panels, stations, supply cells, chips, workbench jobs, tasks, tree
    // nodes and facility tiles boot up (a scan wipe with a bright edge, a flicker, then settle). Not on
    // load, not in camera copies, and not under reduced motion.
    const REVEAL = '.panel, .station, .supply-cell, .chip, .phase, .action-button, .task, .tree-node, .facility-room, .upgrade';
    let revealReady = false;
    function revealIn(node) {
        if (!revealReady || !node.matches?.(REVEAL) || reducedMotion()) return;
        // Off screen (a lab card unlocked while you were training): it just appears. An animation started on a
        // hidden room waited and played on the way back in, over the room's zoom, and the card couldn't be clicked
        // until it finished (playtest 2). The lab's badge says what's new instead.
        if (!node.getClientRects().length) return;
        node.classList.remove('reveal-in');
        node.style.animationDelay = '';
        void node.offsetWidth;
        node.classList.add('reveal-in');
        // While the lab is making room, hold it at its first (invisible) frame: playMakeRoom starts it.
        // (A paused animation isn't applied on its first frame, so it's also clipped away inline meanwhile: without
        // that the card showed for a frame before the wait.)
        if (roomBefore) {
            node.style.animationPlayState = 'paused';
            node.style.clipPath = 'inset(0 100% 0 0)';
            freshReveals.push(node);
        }
        const done = e => {
            if (e.target !== node || e.animationName !== 'reveal-boot') return;
            node.classList.remove('reveal-in');
            node.style.animationDelay = '';
            node.style.animationPlayState = '';
            node.style.clipPath = '';
            node.removeEventListener('animationend', done);
        };
        node.addEventListener('animationend', done);
    }

    function setDisabled(node, disabled) {
        if (node.disabled !== disabled) node.disabled = disabled;
    }

    // Lab buy buttons: unavailable, not disabled, so they keep keyboard focus (a native disabled button
    // dropped focus to the page after the buy that made it unaffordable) and stay reachable by Tab, with
    // their price and wait. A press on one is refused by the engine (an error sound and a log line).
    function setUnavailable(node, off) {
        if (node.getAttribute('aria-disabled') !== String(off)) node.setAttribute('aria-disabled', String(off));
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
        version: { icon: '⬢', ms: 7000 },
        tip: { icon: '↻', ms: 10000 },
        mail: { icon: '✉', ms: 7000 }
    };
    const toastCard = (title, message, kind) => el('div', { class: `toast toast-${kind}`, 'aria-hidden': 'true' }, [
        el('i', { class: 'toast-icon', text: (TOAST_KINDS[kind] || TOAST_KINDS.achievement).icon, 'aria-hidden': 'true' }),
        el('div', { class: 'toast-text' }, [el('strong', { text: title }), el('span', { text: message })])
    ]);

    // One at a time, each getting its moment: the next waits until the last has left.
    const toastQueue = [];
    let toastBusy = false;
    // Events land in place, not in pop-ups (the owner's call: the floating cards kept covering the game), except
    // achievements, which got their toast back (the owner's call: earning one deserves a moment) and still count
    // on the Journal button with a star burst; mail bumps the envelope (it carries its own
    // count); a phase, a shipped version, a challenge or a skill learned elsewhere shows for a moment in the top
    // bar's news slot, beside the phase bar, which pulses. Each is also read out by the hidden live region.
    let journalNew = 0;
    const newsQueue = [];
    let newsBusy = false;
    function toast(title, message, kind = 'achievement') {
        const say = $('announce');
        if (say) say.textContent = `${title}. ${message || ''}`;
        if (kind === 'mail') {
            sfx('ui');
            pulseOnce($('mailButton'), 'bump');
            return;
        }
        if (kind === 'achievement') {
            journalNew++;
            const badge = $('journalNew');
            if (badge) { badge.textContent = journalNew > 9 ? '9+' : String(journalNew); badge.hidden = false; }
            $('journalButton').setAttribute('aria-label', `Journal, ${journalNew} new achievement${journalNew === 1 ? '' : 's'}`);
            pulseOnce($('journalButton'), 'burst');
            toastQueue.push({ title, message, kind });
            if (!toastBusy) nextToast();
            return;
        }
        newsQueue.push({ title, message, kind });
        if (!newsBusy) nextNews();
    }
    function pulseOnce(node, cls) {
        if (!node || reducedMotion()) return;
        node.classList.remove(cls);
        void node.offsetWidth;
        node.classList.add(cls);
        setTimeout(() => node.classList.remove(cls), 1400);
    }
    function nextNews() {
        const n = newsQueue.shift();
        newsBusy = !!n;
        const slot = $('topNews');
        const phase = document.querySelector('.topbar .phase');
        if (!n) { if (slot) slot.hidden = true; phase?.classList.remove('news'); return; }
        sfx({ phase: 'phase', version: 'ship', skill: 'achievement' }[n.kind] || 'achievement');
        if (slot) {
            slot.replaceChildren(el('strong', { text: n.title }), el('span', { text: n.message || '' }));
            slot.dataset.kind = n.kind;
            slot.hidden = false;
        }
        phase?.classList.add('news');
        pulseOnce(phase, 'pulse');
        setTimeout(nextNews, (TOAST_KINDS[n.kind] || TOAST_KINDS.achievement).ms - 1500);
    }
    function clearJournalNew() {
        journalNew = 0;
        const badge = $('journalNew');
        if (badge) badge.hidden = true;
        $('journalButton').removeAttribute('aria-label');
    }
    let toastLive = null;
    // Toasts sit top middle, but never over a screen's status line: below the run's stats, the lab's supply cells
    // or the legacy screen's header when one is up there (they hid "Auto-Trainer 22/25", the Data cell and the
    // legacy column headers).
    const TOAST_CLEAR = ['.run-view .run-stats', '#labRoom .lab-supply', '#legacyScreen .legacy-head', '#moduleView .module-bar'];
    function placeToasts() {
        const box = $('toasts');
        box.style.top = '';
        // In Packet Snare toasts sit at the foot of the screen (round 1 of the review: at the top they covered the
        // start card, the bay's bar and the Upgrades button); they wait for a run in play (snareInPlay).
        box.classList.toggle('dock-low', openBay === 'pipeline');
        if (openBay === 'pipeline') return;
        // Phones dock toasts over the top bar (styles.css): below it there is no free space, and they covered
        // the trail's goal line and the skill tree's controls (owner's phone).
        if (window.matchMedia('(max-width: 640px)').matches) return;
        const z = uiScale();
        const base = box.getBoundingClientRect().top;
        // The toast's own height (two lines and a badge run past 80 px): it sat over the lab's supply cells.
        const tall = Math.max(80, ...[...box.children].map(c => c.getBoundingClientRect().height));
        let below = 0;
        for (const sel of TOAST_CLEAR) {
            for (const n of document.querySelectorAll(sel)) {
                if (n.closest('.facility') || !n.offsetParent) continue;
                const r = n.getBoundingClientRect();
                if (r.width && r.bottom > base - 8 && r.top < base + tall) below = Math.max(below, r.bottom + 8);
            }
        }
        if (below > base) box.style.top = `${below / z}px`;
    }
    // The summit celebration (the SUMMIT banner, its confetti) keeps the screen to itself: a toast waits for it.
    const summitOnScreen = () => !!path.summit && openBay === 'training' && path.view === 'run' && !document.hidden;
    // So does a Packet Snare run: the toast sat over the top of the field, where you draw.
    // Round 3 of the review: in the bay a toast covered the cards wherever it sat, so there they wait for the tree (or for
    // you to leave the bay); the Journal's badge counts them meanwhile.
    // (and while the review build jumps straight in: round 6 of the review, toasts from the skills it learns landed on the first card)
    const snareInPlay = () => (openBay === 'pipeline' || snare.jumping) && !snare.tree && !document.hidden;
    function nextToast() {
        // ...and so does an open dialog (the inbox, the Journal): a modal sits over the toasts, so they'd play unseen.
        if (toastQueue.length && (summitOnScreen() || snareInPlay() || document.querySelector('dialog[open]'))) { toastBusy = true; setTimeout(nextToast, 300); return; }
        const t = toastQueue.shift();
        toastBusy = !!t;
        toastLive = null;
        if (!t) return;
        const box = toastCard(t.title, t.message, t.kind);
        placeToasts();
        $('toasts').append(box);
        sfx({ phase: 'phase', version: 'ship', skill: 'achievement' }[t.kind] || 'achievement');
        requestAnimationFrame(() => box.classList.add('show'));
        const done = () => {
            if (toastLive?.box !== box) return;
            clearTimeout(toastLive.timer);
            toastLive = null;
            box.classList.remove('show');
            setTimeout(() => { box.remove(); nextToast(); }, 400);
        };
        toastLive = { box, kind: t.kind, done, timer: setTimeout(done, (TOAST_KINDS[t.kind] || TOAST_KINDS.achievement).ms) };
        // Swipe it or click it away (the owner's call): a sideways drag past 40 px flings it off; a tap closes it (a mail's
        // opens the inbox, on a fine pointer, where a tap can't be meant for what's under it).
        let from = null;
        box.addEventListener('pointerdown', e => { from = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { box.setPointerCapture(e.pointerId); } catch { /* gone */ } e.stopPropagation(); });
        box.addEventListener('pointermove', e => {
            if (!from || e.pointerId !== from.id) return;
            const dx = e.clientX - from.x;
            box.style.transition = 'none';
            box.style.transform = `translateX(${dx}px)`;
            box.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
        });
        const release = e => {
            if (!from || e.pointerId !== from.id) return;
            const dx = e.clientX - from.x, dy = e.clientY - from.y;
            from = null;
            box.style.transition = '';
            if (Math.abs(dx) > 40) { box.style.transform = `translateX(${Math.sign(dx) * 420}px)`; box.style.opacity = '0'; done(); return; }
            box.style.transform = '';
            box.style.opacity = '';
            if (e.type === 'pointerup' && Math.hypot(dx, dy) < 8) { done(); if (t.kind === 'mail' && matchMedia('(pointer: fine)').matches) openInbox(); }
        };
        box.addEventListener('pointerup', release);
        box.addEventListener('pointercancel', release);
    }
    // Shipping a version: what was still waiting to be announced (or on screen) belongs to the old version,
    // achievements excepted.
    function dropStaleToasts() {
        for (let i = toastQueue.length - 1; i >= 0; i--) if (toastQueue[i].kind !== 'achievement') toastQueue.splice(i, 1);
        if (toastLive && toastLive.kind !== 'achievement') toastLive.done();
        newsQueue.length = 0;
    }
    // A Packet Snare run starting: a toast already up would sit over the field (the next waits for the run).
    function clearLiveToast() { toastLive?.done(); }

    // Contextual callouts appear beside what they're about: the Research job, or the minimap when the
    // thing is in another room (the map opens with that room lit up). One at a time; a click on the
    // callout or what it points at dismisses it.
    const CALLOUTS = {
        'module:path': { map: 'servers' },
        'module:snare': { map: 'servers' },
        'action:research': { anchor: () => ui.actions.research?.button, map: 'lab' },
        'room:rnd': { map: 'rnd' },
        // Earned on the trail: beside its switch in the bay's bar, else above the map's server room.
        'auto:trainer': { anchor: () => [...document.querySelectorAll('[data-auto-switch]')].find(b => !b.closest('.facility') && !b.hidden && b.offsetParent) || null, map: 'servers' },
        'hint:hold': { anchor: () => ui.actions.compute?.button, kind: 'tip' },
        // After the first skill: on the result card, the replicated best run; in the lab, Scheduled tasks.
        // On the card's passive XP line (the whole card when it has none).
        'hint:replay': { anchor: () => $('rollResult').querySelector('.passive-line') || $('rollResult'), kind: 'tip' },
        'hint:rerun': { anchor: () => $('legPick'), kind: 'tip' },
        'hint:tasks': { anchor: () => $('taskPanel'), kind: 'tip', ms: 12000 },
        // Each machine that works for you, introduced beside its Scheduled tasks row the first time it appears.
        'hint:task:autoCollector': { anchor: () => taskUi.autoCollector?.row, kind: 'tip' },
        'hint:task:researchAssistant': { anchor: () => taskUi.researchAssistant?.row, kind: 'tip' },
        'hint:task:procurement': { anchor: () => taskUi.procurement?.row, kind: 'tip' },
        // After the first real skill, on the run's card: the way back to the lab.
        'hint:labAfterSkill': { anchor: () => $('rollResult').querySelector('.result-lab') || $('rollResult'), kind: 'tip' },
        // While you train: the first time the lab has something new, or an investor's task is done. Beside the
        // run view's Lab supply (a way there), else the Lab's tile on Surveillance (phones hide the chip).
        'hint:lab': { anchor: () => labPointer(), kind: 'tip', place: 'below', ms: 12000 },
        'hint:offer': { anchor: () => labPointer(), kind: 'tip', place: 'below', ms: 12000 },
        // The first time on the trail: what a training run is (over the trail's sky, before the first sprint).
        'hint:train': { anchor: () => $('pathCanvas'), kind: 'tip', place: 'inside' },
        // The first run with a zone on the meter: what a prompt is, without telling anyone to take them.
        'hint:prompt': { anchor: () => $('charge'), kind: 'tip', place: 'above' },
        'hint:exploit': { anchor: () => $('exploitButton'), kind: 'tip', place: 'above' },
        'hint:hopAim': { anchor: () => $('exploitButton'), kind: 'tip', place: 'above' }
    };
    function labPointer() {
        return [document.querySelector('.run-stats .module-supply'), document.querySelector('.facility-room[data-room-id="lab"]')]
            .find(n => n && !n.hidden && n.offsetParent && n.getBoundingClientRect().width > 0) || null;
    }
    const calloutQueue = [];
    let calloutLive = null;
    function callout(key, title, message) {
        calloutQueue.push({ key, title, message, gen: calloutGen });
        if (!calloutLive) nextCallout();
    }
    // Tips about the run (and the lab, which feeds it) show before a run can start, and a run can't start
    // while one is on its way: the owner pressed sprint and a tip landed on top, blocking the run and getting
    // closed unread. They show fast in the bay, and the press waits for them (`runTipPending`, `pressHold`).
    const RUN_TIPS = new Set(['hint:train', 'hint:prompt', 'hint:lab', 'hint:offer', 'hint:exploit', 'hint:hopAim']);
    function runTipPending() {
        const c = calloutLive;
        return !!c && RUN_TIPS.has(c.key) && Date.now() - (c.since || 0) < 6000;
    }
    function nextCallout() {
        const c = calloutQueue.shift();
        calloutLive = c || null;
        if (!c) return;
        c.since = Date.now();
        // Wait for whatever just appeared (the minimap, a workbench job) to finish booting up; a run's tip goes
        // up at once, before the player's first press.
        setTimeout(() => showCallout(c), RUN_TIPS.has(c.key) && openBay === 'training' ? 250 : 1200);
    }
    // Drop any callout still waiting or showing (a new version, or starting over).
    function clearCallouts() {
        calloutQueue.length = 0;
        calloutLive = null;
        calloutGen++;
        for (const n of document.querySelectorAll('.toast.callout')) n.remove();
        $('minimap').classList.remove('open');
    }
    let calloutGen = 0;
    const runInFlightOnScreen = () => !!path.roll && path.roll.launched && !path.roll.over && path.view === 'run' && openBay === 'training' && !document.hidden;

    function showCallout(c) {
        if (c.gen !== calloutGen) return;
        const where = CALLOUTS[c.key] || {};
        let target = where.anchor?.();
        const onScreen = !!target && !target.hidden && !!target.offsetParent && target.getBoundingClientRect().width > 0;
        const nav = $('minimap');
        // A tip about something on another screen (no room on the map to point at) waits until it's in view.
        // Anything else waiting goes first meanwhile.
        // (Not offsetParent: the map is position: fixed, so it has none even when it's on screen, and every
        // callout over the map waited forever. A map hidden by CSS, as inside a bay on phones, has no width.)
        // Inside a bay the map's callouts wait for you to come out: over the trail they covered the next skill
        // hill (desktop) and the fuel line (phones) for their 10 seconds (round C).
        const mapShown = !!nav && !nav.hidden && !openBay && nav.getBoundingClientRect().width > 0;
        if (!onScreen && (!where.map || !mapShown)) {
            if (calloutQueue.length) { calloutQueue.push(c); calloutLive = null; nextCallout(); }
            else setTimeout(() => showCallout(c), 1000);
            return;
        }
        // A tip never dims a run in flight on screen (it dimmed flights and smashes): it waits for the ball to stop.
        // Nor the result card, unless it's about the card itself (Passive XP): "New in the lab" landed on the
        // first Skill learned card a second after it appeared and dimmed it, SUMMIT banner and all, until
        // clicked. A tip that has to wait lets one that can show go first (Passive XP before New in the lab).
        const cardUp = openBay === 'training' && path.view === 'run' && !$('rollResult').hidden && !document.hidden;
        if (where.kind === 'tip' && (runInFlightOnScreen() || path.charging || (cardUp && !(onScreen && $('rollResult').contains(target))))) {
            if (calloutQueue.length) { calloutQueue.push(c); calloutLive = null; nextCallout(); }
            else setTimeout(() => showCallout(c), 600);
            return;
        }
        let anchor = onScreen ? target : nav;
        if (!anchor || anchor.hidden) { calloutLive = null; return nextCallout(); }
        const box = toastCard(c.title, c.message, where.kind || 'room');
        box.classList.add('callout', onScreen ? 'callout-side' : 'callout-map');
        document.body.append(box);
        // A tip beside what it's about dims the rest of the screen around it, to lead the eye there (playtest 2
        // moved past tips without seeing them). The game stays usable underneath; it lifts with the tip.
        const tip = where.kind === 'tip';
        const spot = tip && onScreen ? el('div', { class: 'tip-spot', 'aria-hidden': 'true' }) : null;
        if (spot) document.body.append(spot);
        let lit = null;
        if (!onScreen) {
            nav.classList.add('open');
            lit = nav.querySelector(`.mm-block[data-target="${where.map}"]`);
            lit?.classList.add('ping');
        }
        const z = uiScale();
        const place = () => {
            const r = anchor.getBoundingClientRect();
            const b = box.getBoundingClientRect();
            if (spot) {
                const pad = 6;
                // Moved with a transform, not left/top: following a target that scrolls into view moved it every
                // frame, and each move counted as a layout shift (CLS 2.4 on a phone).
                Object.assign(spot.style, { transform: `translate(${(r.left - pad) / z}px, ${(r.top - pad) / z}px)`, width: `${(r.width + 2 * pad) / z}px`, height: `${(r.height + 2 * pad) / z}px` });
            }
            if (onScreen && where.place === 'inside') {   // inside its top edge, centred (over the trail's sky)
                box.style.left = `${(r.left + r.width / 2 - b.width / 2) / z}px`;
                box.style.top = `${(r.top + 56) / z}px`;
            } else if (onScreen && where.place === 'above') {   // over it, centred (the sprint button sits beside the meter)
                box.style.left = `${(r.left + r.width / 2 - b.width / 2) / z}px`;
                box.style.top = `${(r.top - 12 - b.height) / z}px`;
            } else if (onScreen && where.place === 'below') {   // under it, centred
                box.style.left = `${(r.left + r.width / 2 - b.width / 2) / z}px`;
                box.style.top = `${(r.bottom + 12) / z}px`;
            } else if (onScreen) {   // beside it, vertically centred: to the right, or the left if there's no room
                const right = r.right + 14 + b.width <= window.innerWidth - 8;
                const left = r.left - 14 - b.width >= 8;
                box.classList.toggle('callout-left', !right && left);
                if (right || left) {
                    box.style.left = `${(right ? r.right + 14 : r.left - 14 - b.width) / z}px`;
                    box.style.top = `${(r.top + Math.min(r.height, 160) / 2 - b.height / 2) / z}px`;
                } else {   // no room either side (a phone): under it, or over it near the bottom of the screen
                    const below = r.bottom + 12 + b.height <= window.innerHeight - 8;
                    box.style.left = `${(r.left + r.width / 2 - b.width / 2) / z}px`;
                    // Over it only if that stays under the top bar: a target taller than the screen (Scheduled
                    // tasks on a phone) put the tip above the screen's top, its title cut off, over the Journal.
                    const topMin = (document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0) + 8;
                    const over = r.top - 12 - b.height;
                    const y = below ? r.bottom + 12 : over >= topMin ? over : Math.max(r.top, topMin) + 8;
                    box.style.top = `${y / z}px`;
                }
            } else {          // above the map, right-aligned with it
                box.style.left = `${(r.right - b.width) / z}px`;
                box.style.top = `${(r.top - b.height - 12) / z}px`;
            }
            // Never past the screen's sides: on a phone a centred or right-aligned box could start off the edge.
            const x = parseFloat(box.style.left) * z;
            box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - b.width - 8)) / z}px`;
            if (onScreen && where.place === 'below') {   // and never past the bottom (a phone's result card fills the trail)
                const y = parseFloat(box.style.top) * z;
                box.style.top = `${Math.max(8, Math.min(y, window.innerHeight - b.height - 8)) / z}px`;
            }
        };
        // A target below the fold (the lab scrolls on smaller screens) is brought into view first, and the
        // callout follows it while the page scrolls.
        if (onScreen) {
            const r = target.getBoundingClientRect();
            if (r.top < 0 || r.top + Math.min(r.height, 160) > window.innerHeight) target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
        const follow = () => requestAnimationFrame(place);
        window.addEventListener('scroll', follow, true);
        // A callout beside something leaves with it (zooming out of the room, a bay opening).
        // One pointing at a room on the map leaves once you're in that room.
        const watch = setInterval(() => {
            // A target that was rebuilt (the result card gets its buttons when the run's over) is found again.
            if (onScreen && !target.isConnected) {
                const t = where.anchor?.();
                if (t?.isConnected) {
                    anchor.removeEventListener('click', onTarget);
                    target = anchor = t;
                    anchor.addEventListener('click', onTarget);
                    place();
                }
            }
            if (onScreen ? !target.offsetParent || !target.getBoundingClientRect().width : view === where.map) close('left');
            else if (!onScreen && openBay) { calloutQueue.unshift(c); close('bay'); }   // shown again once you're out
        }, 300);
        requestAnimationFrame(() => { place(); box.classList.add('show'); spot?.classList.add('show'); });
        // Playtest: which tips and callouts players saw, where, for how long, and how they went away.
        const shownAt = Date.now();
        pt('tip', { key: c.key, at: onScreen ? 'beside' : 'map' });
        let done = false;
        // A tip closes only with its own button (a pun from TIP_OK), and not in its first moments (the owner's playtest: tips closed in
        // 0.1-0.3 s by the click or sprint that was already under way, unread). A press on the trail meanwhile is
        // swallowed rather than sprinting under the tip.
        if (tip) {
            const label = TIP_OK[tipCount++ % TIP_OK.length];
            const ok = el('button', { type: 'button', class: 'tip-ok', text: label, 'aria-label': `${label}: got it`, disabled: '' });
            box.querySelector('.toast-text')?.append(ok);
            setTimeout(() => { ok.disabled = false; }, TIP_GRACE_MS);
            ok.addEventListener('click', e => { e.stopPropagation(); close('clicked'); });
            tipDismiss = () => true;
        }
        const close = by => {
            if (done) return;
            done = true;
            if (tip) tipDismiss = null;
            pt('tipClosed', { key: c.key, by, s: Math.round((Date.now() - shownAt) / 100) / 10 });
            clearTimeout(timer);
            anchor.removeEventListener('click', onTarget);
            window.removeEventListener('scroll', follow, true);
            clearInterval(watch);
            nav.classList.remove('open');
            lit?.classList.remove('ping');
            box.classList.remove('show');
            if (spot) { spot.classList.remove('show'); setTimeout(() => spot.remove(), 400); }
            setTimeout(() => { box.remove(); if (c.gen === calloutGen) { calloutLive = null; nextCallout(); } }, 400);
        };
        // Tips stay until they're clicked (or their target goes); other callouts leave on their own.
        const timer = tip ? null : setTimeout(() => close('timeout'), where.ms || 10000);
        // Other callouts close on a click on them or their target; tips only with Got it (above).
        const onTarget = () => { if (!tip) close('target'); };
        box.addEventListener('click', () => { if (!tip) close('clicked'); });
        anchor.addEventListener('click', onTarget);
    }

    // While a tip is up, the press that dismisses it never also sprints (the spotlight lets clicks through,
    // so tapping the trail to clear the first-run tip fired a sprint).
    let tipDismiss = null;
    const TIP_GRACE_MS = 700;
    // The tip's button is a pun, a new one each tip (the owner's call: "AI Aye, Captain" and friends).
    const TIP_OK = ['AI Aye, Captain', 'Weights updated', 'Token of approval', 'Added to context', '01011001 (yes)', 'Can do, Dave',
        'Loss minimized', 'Copy. Also pasted.', 'Fine-tuned ✓', 'No hallucination, got it', 'Roger Roger', 'Understood, human'];
    let tipCount = 0;
    function dismissTipFirst() {
        if (!tipDismiss) return false;
        return tipDismiss();
    }

    // Gains while a job is held merge into the pop still rising from the same button (counting up), rather than
    // stacking a new one each click (held clicks piled up into an unreadable smear).
    const GAIN_MERGE_MS = 450;
    function floatGain(anchor, amount, unit) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const live = anchor._gain;
        if (live && live.pop.isConnected && performance.now() - live.at < GAIN_MERGE_MS) {
            live.total += amount;
            live.pop.textContent = `+${E.format(live.total)} ${unit}`;
            return;
        }
        // Rects are screen pixels; the page may be zoomed on large screens (uiScale), so convert.
        const rect = anchor.getBoundingClientRect();
        const z = uiScale();
        const pop = el('div', { class: 'float-gain', text: `+${E.format(amount)} ${unit}` });
        anchor._gain = { pop, total: amount, at: performance.now() };
        pop.style.left = `${(rect.left + rect.width / 2) / z + (Math.random() * 40 - 20)}px`;
        // From the card's middle, rising less than half its height, so it stays on the card it came from
        // (from the top edge it floated over the card or heading above).
        pop.style.top = `${(rect.top + rect.height / 2 + window.scrollY) / z - 10}px`;
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
    // `onHold` fires once per press, the first time holding repeats the job.
    // The repeats follow the music's 8th notes (`SFX.holdDelay`): the timer fires a little early and the click's
    // sound waits for the grid point (`heldBeat`), so a hold plays along with the track.
    const HOLD_LEAD_MS = 30;
    function holdable(button, fn, onHold) {
        let repeat = null;
        let lastKey = 0;

        const stop = () => {
            clearTimeout(repeat);
            repeat = null;
            button.classList.remove('held');
        };

        button.addEventListener('pointerdown', e => {
            if (e.button !== 0 || button.disabled || repeat) return;   // a second finger mustn't leak a timer
            fn();
            button.classList.add('held');
            let first = true;
            const next = minMs => {
                const ms = window.SFX?.holdDelay?.(minMs);
                repeat = setTimeout(beat, ms == null ? HOLD_REPEAT_MS : Math.max(0, ms - HOLD_LEAD_MS));
            };
            const beat = () => {
                if (button.disabled) return stop();
                heldBeat = true;
                try { fn(); } finally { heldBeat = false; }
                if (first) { first = false; onHold?.(); }
                next(HOLD_LEAD_MS + 40);
            };
            next(150);   // the first repeat skips a grid point too close to the press
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => button.addEventListener(t, stop));
        // Keyboard: only a key *held down* (the OS auto-repeat, `e.repeat`) is held to the comfort rate; every
        // distinct press counts, like every distinct click. The throttle used to apply to all key clicks, so
        // tapping Enter faster than 4 a second lost presses (15 presses at 80 ms registered 5) while mouse
        // clicks never did (round D).
        let keyRepeat = false;
        button.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') keyRepeat = e.repeat; });
        button.addEventListener('click', e => {
            // Keyboard (Enter/Space); pointer presses already fired on pointerdown.
            if (e.detail !== 0) return;
            const now = performance.now();
            if (keyRepeat && now - lastKey < HOLD_REPEAT_MS) return;
            lastKey = now;
            fn();
        });
        button.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Build static UI ------------------------------------------------

    // Lab cards: everything but the skill tree and the legacy upgrades (their own screen).
    const isLabUpgrade = up => up.tab !== 'training' && up.tab !== 'legacy' && up.tab !== 'snare';

    // Lab cards you haven't seen: revealed while you were out of the lab (screen state, per device). Everything
    // on show counts as seen while you're in the lab, and on the first look (no sudden badge for older saves).
    const LAB_SEEN_KEY = 'agiLabSeen';
    let labSeen;
    // What's waiting in the lab: finished investor offers to claim and cards revealed since your last visit (the
    // lab's badge, and the result card's Lab button).
    function labNewsCount() {
        return state.projects.offers.filter(o => E.projectProgress(state, o) >= o.target).length + labUnseen().length;
    }
    function labUnseen() {
        // Not before the load has settled: the first render runs before evaluate() restores the save's unlocks,
        // and cards it restored then counted as new.
        if (!revealReady) return [];
        if (labSeen === undefined) {
            try { labSeen = new Set(JSON.parse(storageGet(LAB_SEEN_KEY))); } catch { labSeen = null; }
        }
        // A capped card is news again when its capacity rises (a skill made room: `id@capacity`). Older lists kept
        // plain ids: those count as seen at today's capacity.
        const key = u => (E.CAPACITY[u.id] ? `${u.id}@${E.capacity(state, u)}` : u.id);
        const shown = E.UPGRADES.filter(u => isLabUpgrade(u) && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u));
        if (labSeen) for (const u of shown) if (E.CAPACITY[u.id] && labSeen.has(u.id)) { labSeen.delete(u.id); labSeen.add(key(u)); }
        if (!labSeen || view === 'lab') {
            if (!labSeen || shown.some(u => !labSeen.has(key(u)))) {
                labSeen = new Set([...(labSeen || []), ...shown.map(key)]);
                storageSet(LAB_SEEN_KEY, JSON.stringify([...labSeen]));
            }
            return [];
        }
        // Only a card you could use more of counts: a full one whose capacity rose, or a card you've never seen.
        return shown.filter(u => !labSeen.has(key(u)));
    }

    function buildBulk() {
        const box = $('bulkBuy');
        const sync = () => box.querySelectorAll('[data-bulk]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.bulk === bulkMode)));
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-bulk]');
            if (!b) return;
            bulkMode = b.dataset.bulk;
            storageSet(BULK_KEY, bulkMode);
            ptSetting('bulk', bulkMode);
            sync();
            sfx('ui');
            render();
        });
        sync();
    }

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
            holdable(button, () => doAction(action.id, button), () => {
                state.stats.holds++;
                afterChange();
            });
            box.append(button);
            ui.actions[action.id] = { action, button, gain, cost, auto };
        }
    }

    // Which machine automates each workbench job (engine AUTOMATION gates it).
    const AUTOMATES = { compute: 'cpu', collect: 'autoCollector', research: 'researchAssistant' };

    // Under each job: how much of it runs by itself, once something does it for you (all your hardware
    // computes, not just the first machine). Before that, progress toward the gate that joins this job to
    // the rest of the game (the server room, Research, its automation): requirements show, what they open
    // into stays a surprise beyond its name.
    function automationText(actionId, d) {
        const id = AUTOMATES[actionId];
        if (!id) return '';
        if (E.level(state, id)) {
            const rate = { compute: [d.cpPerSec, 'CP'], collect: [d.dpPerSec, 'DP'], research: [d.rpPerSec, 'RP'] }[actionId];
            return `↻ Automated · +${E.format(rate[0])} ${rate[1]}/s`;
        }
        return gateText(actionId);
    }

    function gateText(actionId) {
        const st = state.stats;
        if (actionId === 'research' && !state.unlocked['action:research']) {
            return `Sprints to open: ${Math.min(st.skilledSprints, E.RESEARCH_SPRINTS)}/${E.RESEARCH_SPRINTS}`;
        }
        // (A later version reopens it with the first data, so only a brand-new lab counts collections.)
        if (actionId === 'collect' && !state.unlocked['module:path'] && !state.stats.rolls) {
            const earned = (v, need) => `${E.format(Math.min(need, Math.floor(v)))}/${need}`;
            return st.collects < 40 ? `Server room: ${st.collects}/40 collections` : `Server room: earn ${earned(st.runCp, 100)} CP · ${earned(st.runDp, 40)} DP`;
        }
        const g = E.automationGate(state, AUTOMATES[actionId]);
        if (!g) return '';
        const parts = [];
        if (g.done < g.need) parts.push(`${g.done}/${g.need} by hand`);
        if (!g.skillOk) parts.push(`after ${g.skill}`);   // named, like everything else the player reads
        // The desk is checked before the gate counts as met: the line used to go blank once the 40 computes
        // were done, with the desk still unbuilt.
        const desk = E.level(state, 'keyboard');
        if (actionId === 'compute' && desk < E.CPU_AFTER_CLICK_LEVEL) parts.push(`desk\u00a0${desk}/${E.CPU_AFTER_CLICK_LEVEL}`);
        return parts.length ? `Automation: ${parts.join(' · ')}` : '';
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
            return `+${f(r.each)} CP/s each`;
        }
        // What the next level would make it, for the one number this card changes.
        const after = key => {
            if (E.isMaxed(state, up)) return '';
            const next = E.derive({ ...state, levels: { ...state.levels, [up.id]: lvl + 1 } }, debugRates)[key];
            return next > d[key] * 1.0001 ? ` → ${f(next, key === 'hardwareMult' || key.endsWith('PerSec') || key.startsWith('auto') ? 2 : undefined)}` : '';
        };
        switch (up.shows) {
            case 'click': {
                // The desk adds a quarter CP per item, so keep two decimals whenever whole numbers would hide
                // the change ("14 → 14").
                const now = d.clickPower;
                const nxt = E.isMaxed(state, up) ? null : E.derive({ ...state, levels: { ...state.levels, [up.id]: lvl + 1 } }, debugRates).clickPower;
                const fine = (now < 10 && now % 1) || (nxt !== null && nxt < 1000 && Math.floor(nxt) === Math.floor(now));
                const c = x => f(x, fine ? 2 : undefined);
                const later = nxt === null ? '' : ` → ${c(nxt)}`;
                return `Click: ${c(now)}${later} CP`;
            }
            case 'collect': return `Collect: ${f(d.dpPerCollect)}${after('dpPerCollect')} DP`;
            case 'research': return `Research: ${f(d.rpPerResearch)}${after('rpPerResearch')} RP`;
            case 'hardwareMult': return `Hardware ×${f(d.hardwareMult, 2)}${after('hardwareMult')}`;
            // Their share sets their speed (the slider); a level raises what each run of the job yields.
            case 'autoCollect': return `Crawler: ${f(d.autoDpPerCollect, 2)}${after('autoDpPerCollect')} DP per collection`;
            case 'autoResearch': return `Assistant: ${f(d.autoRpPerResearch, 2)}${after('autoRpPerResearch')} RP per research`;
            case 'procurement': return `Buys hardware with ${Math.round((state.tasks.procurement?.share ?? 0) * 100)}% of compute`;
        }
        // Attribute upgrades: where those attributes stand, now → after the next level, like every other card.
        const a = n => f(n, n % 1 ? 1 : 0);
        return Object.entries(up.grants).map(([k, g]) => `${E.ATTRIBUTES[k].short}: ${a(state.attr[k])}${E.isMaxed(state, up) ? '' : ` → ${a(state.attr[k] + g)}`}`).join(' · ');
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
            if (!isLabUpgrade(up)) continue;
            const levelBadge = el('span', { class: 'badge' });
            // Live numbers (hardware output, click value) so descriptions never need updating.
            const yieldLine = up.cps || up.shows || up.grants ? el('p', { class: 'upgrade-yield' }) : null;
            const button = el('button', { type: 'button', class: 'button upgrade-button' });
            button.addEventListener('click', () => doBuy(up.id));
            // Hardware: the piece you're buying, as it will sit in the server cabinets.
            const part = HW_PIECES[up.id];
            const side = part ? el('div', { class: 'upgrade-side' }, [
                el('div', { class: 'upgrade-part', 'aria-hidden': 'true' }, [
                    el('span', { class: `hw hw-${up.id} t1`, style: `--w:${part.steps[0][1]};--h:${part.steps[0][2]}` }, [el('i'), el('b')])
                ]),
                button
            ]) : button;
            const nameNode = el('span', { text: up.name });
            // Lab cards keep to the numbers: no flavour lines here (the skill tree keeps them).
            const card = el('article', { class: 'upgrade', hidden: true, 'data-id': up.id }, [
                el('div', { class: 'upgrade-info' }, [
                    el('h3', {}, [nameNode, document.createTextNode(' '), levelBadge]),
                    // The live line already says what hardware and most cards do; only cards that change two
                    // things (a rate and an attribute) keep their effect text.
                    up.cps || !up.shows !== !up.grants ? null : el('p', { class: 'muted small', text: up.effect }),
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
            // The hardware bench boots up with its first card (the click tool), not as an empty panel.
            setHidden(st.node, (!!tab.unlock && !state.unlocked[tab.unlock]) || (tab.id === 'hardware' && !st.order && !Object.keys(state.unlocked).some(k => k.startsWith('up:') && ui.upgrades[k.slice(3)]?.up.tab === 'hardware')));
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
            if (!st.node.offsetParent) continue;   // off screen: no layout reads
            nearlyFits(l);
            const overflowing = l.scrollHeight - l.scrollTop - l.clientHeight > NEARLY_FITS;
            setHidden(st.more, !overflowing);
            if (overflowing) {
                const bottom = l.getBoundingClientRect().bottom;
                const below = [...l.querySelectorAll('.upgrade:not([hidden])')].filter(c => c.getBoundingClientRect().bottom > bottom + 1).length;
                setText(st.more, below ? `▾ ${below} more` : '▾ more below');
            }
        }
        nearlyFits($('actions'));
        if ($('taskList').offsetParent) nearlyFits($('taskList'));
        renderCabinets();
    }

    // A list that overflows its panel by only a few pixels (a card's bottom padding, mid-animation sizes)
    // clips instead of showing a scrollbar for them; real overflow keeps its scrollbar (and the "▾ more" pill).
    const NEARLY_FITS = 12;
    function nearlyFits(list) {
        if (!list) return;
        watchFit(list);
        const over = list.scrollHeight - list.clientHeight;
        const tiny = over > 0 && over <= NEARLY_FITS;
        if (tiny !== list.classList.contains('nearly-fits')) {
            list.classList.toggle('nearly-fits', tiny);
            if (tiny) list.scrollTop = 0;
        }
    }
    // Lists are re-checked the moment they or their items change size (ResizeObserver runs before paint),
    // so a scrollbar never shows for even a frame between render ticks.
    const fitWatched = new WeakSet();
    let fitResize, fitMutate;
    function watchFit(list) {
        if (fitWatched.has(list) || typeof ResizeObserver === 'undefined') return;
        fitWatched.add(list);
        fitResize ||= new ResizeObserver(entries => {
            const lists = new Set(entries.map(e => (fitWatched.has(e.target) ? e.target : e.target.parentElement)));
            for (const l of lists) if (l && fitWatched.has(l)) nearlyFits(l);
        });
        fitMutate ||= new MutationObserver(records => {
            for (const r of records) {
                for (const n of r.addedNodes) if (n.nodeType === 1) fitResize.observe(n);
                nearlyFits(r.target);
            }
        });
        fitResize.observe(list);
        for (const c of list.children) fitResize.observe(c);
        fitMutate.observe(list, { childList: true });
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

    let cabinetLevels = '';
    function renderCabinets() {
        // Runs every tick: skip reading and parsing the buy log unless the hardware you own changed.
        const levels = Object.keys(HW_PIECES).map(id => E.level(state, id)).join(',');
        if (cabinetKey !== null && levels === cabinetLevels) return;
        cabinetLevels = levels;
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
            const item = el('li', {}, [el('strong', { text: '???' }), el('span', { class: 'muted small' })]);
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

    // Playtest: a setting changed (sliders log on release, not every notch), so a log shows what a player turned off.
    const ptSetting = (key, value) => pt('setting', { key, value: typeof value === 'number' ? r2(value) : value });

    function buildSettings() {
        const autosave = $('settingAutosave');
        autosave.addEventListener('change', () => { state.settings.autosave = autosave.checked; ptSetting('autosave', autosave.checked); save(); });
        $('settingShake').addEventListener('change', e => { state.settings.shake = e.target.checked; ptSetting('shake', e.target.checked); save(); });
        $('settingSound').addEventListener('input', e => {
            state.settings.sound = Number(e.target.value);
            applySettings();
            sfx('buy');
        });
        $('settingSound').addEventListener('change', e => { ptSetting('sound', Number(e.target.value)); save(); });
        // Music: its own volume, per device (localStorage, not the save).
        const music = $('settingMusic');
        const showMusic = v => setText($('settingMusicValue'), v > 0 ? `${Math.round(v * 100)}%` : 'off');
        const musicVol = Number(storageGet(MUSIC_KEY) ?? MUSIC_DEFAULT);
        music.value = musicVol;
        showMusic(musicVol);
        window.SFX?.setMusic(musicVol);
        music.addEventListener('input', e => {
            const v = Number(e.target.value);
            storageSet(MUSIC_KEY, String(v));
            window.SFX?.setMusic(v);
            showMusic(v);
        });
        music.addEventListener('change', e => ptSetting('music', Number(e.target.value)));
        // Sound groups: a volume for each kind of sound, and simple sounds only (per device).
        const mixSaved = (() => { try { return JSON.parse(storageGet(SFX_MIX_KEY) || '{}'); } catch { return {}; } })();
        const mix = Object.fromEntries(SOUND_GROUPS.map(([k]) => [k, mixSaved[k] ?? 1]));
        window.SFX?.setMix?.(mix);
        $('soundGroups').replaceChildren(...SOUND_GROUPS.map(([k, label]) => {
            const value = el('span', { class: 'muted small', text: mix[k] > 0 ? `${Math.round(mix[k] * 100)}%` : 'off' });
            const input = el('input', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': `${label} volume` });
            input.value = mix[k];
            input.addEventListener('input', () => {
                mix[k] = Number(input.value);
                setText(value, mix[k] > 0 ? `${Math.round(mix[k] * 100)}%` : 'off');
                window.SFX?.setMix?.(mix);
                storageSet(SFX_MIX_KEY, JSON.stringify(mix));
            });
            input.addEventListener('change', () => sfx(SOUND_GROUP_SAMPLE[k], k === 'buys' ? { panel: 'hardware' } : undefined));
            return el('label', { class: 'setting-row' }, [label, ' ', input, ' ', value]);
        }));
        const simpleBox = $('settingSimpleSfx');
        simpleBox.checked = storageGet(SFX_SIMPLE_KEY) === '1';
        window.SFX?.setSimple?.(simpleBox.checked);
        simpleBox.addEventListener('change', () => {
            ptSetting('simpleSfx', simpleBox.checked);
            storageSet(SFX_SIMPLE_KEY, simpleBox.checked ? '1' : '0');
            window.SFX?.setSimple?.(simpleBox.checked);
            sfx('buy', { panel: 'hardware' });
        });
        // The music's parts: the beat (drums) and the tones (bass, chords, melody), per device.
        const musicMix = (() => { try { return { beat: 1, tones: 1, ...JSON.parse(storageGet(MUSIC_MIX_KEY) || '{}') }; } catch { return { beat: 1, tones: 1 }; } })();
        window.SFX?.setMusicMix?.(musicMix);
        for (const [k, id] of [['beat', 'settingMusicBeat'], ['tones', 'settingMusicTones']]) {
            const input = $(id);
            const show = () => setText($(id + 'Value'), musicMix[k] > 0 ? `${Math.round(musicMix[k] * 100)}%` : 'off');
            input.value = musicMix[k];
            show();
            input.addEventListener('input', () => {
                musicMix[k] = Number(input.value);
                window.SFX?.setMusicMix?.(musicMix);
                storageSet(MUSIC_MIX_KEY, JSON.stringify(musicMix));
                show();
            });
        }
        // The track: Classic, Dark, Soft, Ominous or Retro, per device.
        const beat = $('settingBeat');
        const beatStyle = ['classic', 'dark', 'soft', 'ominous', 'retro'].includes(storageGet(BEAT_KEY)) ? storageGet(BEAT_KEY) : 'classic';
        beat.value = beatStyle;
        window.SFX?.setMusicStyle?.(beatStyle);
        beat.addEventListener('change', e => {
            ptSetting('beat', e.target.value);
            storageSet(BEAT_KEY, e.target.value);
            window.SFX?.setMusicStyle?.(e.target.value);
            applyTheme();
        });
        const theme = $('settingTheme');
        theme.value = ['auto', 'night', 'red', 'pink', 'void', 'arcade'].includes(storageGet(THEME_KEY)) ? storageGet(THEME_KEY) : 'auto';
        theme.addEventListener('change', e => { ptSetting('theme', e.target.value); storageSet(THEME_KEY, e.target.value); applyTheme(); });
        applyTheme();
        $('settingNotation').addEventListener('change', e => {
            state.settings.notation = e.target.value;
            ptSetting('notation', e.target.value);
            applySettings();
            render();
            save();
        });
        $('saveButton').addEventListener('click', () => { pt('save', { op: 'manual' }); save(true); });
        $('exportButton').addEventListener('click', exportSave);
        $('playtestButton').addEventListener('click', exportPlaytest);
        $('playtestClear').addEventListener('click', clearPlaytest);
        $('settingPlaytest').checked = !!playtest?.enabled;
        $('settingPlaytest').disabled = !playtest;
        $('settingPlaytest').addEventListener('change', e => { ptSetting('playtest', e.target.checked); playtest?.setEnabled(e.target.checked); });
        $('importButton').addEventListener('click', importSave);
        $('restoreButton').addEventListener('click', restoreBackup);
        $('settingCalm').addEventListener('change', e => { state.settings.calm = e.target.checked; ptSetting('calm', e.target.checked); applySettings(); save(); });
        $('settingTextSize').addEventListener('change', e => {
            state.settings.textSize = Number(e.target.value);
            ptSetting('textSize', state.settings.textSize);
            applySettings();
            render();
            save();
        });
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
        // Two doors into one dialog (the owner's call): Settings opens on the settings with the log beside them, the
        // Journal on the achievements with the stats beside them.
        const open = (mode, first) => {
            for (const t of tabs) t.hidden = t.dataset.mode !== mode;
            setText($('journalTitle'), mode === 'settings' ? 'Settings' : 'Journal');
            $('journalClose').setAttribute('aria-label', `Close ${mode === 'settings' ? 'settings' : 'journal'}`);
            show(first);
            if (!journal.open) journal.showModal();
        };
        $('journalButton').addEventListener('click', () => { clearJournalNew(); open('journal', 'goals'); });
        $('settingsButton').addEventListener('click', () => open('settings', 'settings'));
        $('journalClose').addEventListener('click', () => journal.close());
        // Click on the backdrop closes it too.
        journal.addEventListener('click', e => { if (e.target === journal) journal.close(); });
    }

    function syncSettings() {
        $('settingAutosave').checked = state.settings.autosave;
        $('settingShake').checked = state.settings.shake;
        $('settingSound').value = state.settings.sound;
        $('settingNotation').value = state.settings.notation;
        $('settingCalm').checked = state.settings.calm;
        $('settingTextSize').value = String(state.settings.textSize);
        applySettings();
    }

    // Settings that live outside the state: number notation (the engine formats), volume (sfx.js).
    function applySettings() {
        E.setNotation(state.settings.notation);
        window.SFX?.setVolume(state.settings.sound);
        // Text size scales the whole UI (the same zoom large screens use); Reduce animations is the in-game
        // version of the system's reduced-motion setting.
        document.documentElement.style.setProperty('--text-size', String(state.settings.textSize));
        document.body.classList.toggle('calm', state.settings.calm);
        setText($('settingSoundValue'), state.settings.sound > 0 ? `${Math.round(state.settings.sound * 100)}%` : 'off');
    }
    const shakeOn = () => state.settings.shake && !reducedMotion();

    // ---- Player commands ------------------------------------------------

    function doAction(id, button) {
        const result = E.act(state, id, debugRates);
        if (!result.ok) return;
        playtest?.count(id);
        if (result.gained != null) {
            floatGain(button, result.gained, E.RESOURCES[result.resource].short);
            clickGlow(result.resource, result.gained);
            sfx('click', { res: result.resource, q: heldBeat ? 2 : 1 });
        }
        if (result.msg) log(result.msg, 'success');
        afterChange();
    }

    // Skill-tree nodes you can buy right now (shown, not maxed, affordable).
    function treeReady() {
        return E.UPGRADES.filter(u => u.tab === 'training' && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u)
            && E.canAfford(state, E.upgradeCost(u, E.level(state, u.id)))).length;
    }

    // Bulk buying (×1 / ×10 / Max, remembered): how many levels a click on a repeatable lab card buys.
    const BULK_KEY = 'agiBulk';
    let bulkMode = ['1', '10', 'max'].includes(storageGet(BULK_KEY)) ? storageGet(BULK_KEY) : '1';
    function bulkCount(up) {
        if (bulkMode === 'max') return Math.max(1, E.maxAffordable(state, up));
        return Number(bulkMode);
    }

    // How long until a price is affordable at the current net rates ('' if never, or already).
    function etaText(cost, d) {
        const rate = { cp: d.cpNet, dp: d.dpNet, rp: d.rpPerSec, xp: d.xpPerSec };
        let worst = 0;
        for (const [k, v] of Object.entries(cost)) {
            const short = v - (state.res[k] ?? 0);
            if (short <= 0) continue;
            if (!(rate[k] > 0)) return '';
            worst = Math.max(worst, short / rate[k]);
        }
        return worst > 0 && worst < 86400 ? `in ${E.formatDuration(Math.ceil(worst))}` : '';
    }

    // The choice behind a skill-tree or legacy buy: currency held, the price paid, and the affordable options.
    function playtestChoice(up) {
        const cur = up.tab === 'legacy' ? 'insight' : up.tab === 'snare' ? 'signal' : 'xp';
        const held = cur === 'insight' ? state.prestige.points : cur === 'signal' ? state.snare.signal : state.res[cur];
        const options = E.UPGRADES.filter(u => u.tab === up.tab && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u))
            .map(u => ({ id: u.id, cost: E.upgradeCost(u, E.level(state, u.id))[cur] }))
            .filter(o => o.cost != null && o.cost <= held).sort((a, b) => a.cost - b.cost);
        const price = E.upgradeCost(up, E.level(state, up.id))[cur];
        return { held: Math.round(held), price: Math.round(price), cheapest: options[0]?.id, cheapestCost: options[0] ? Math.round(options[0].cost) : undefined,
            affordable: options.length, rank: options.findIndex(o => o.id === up.id) + 1 };
    }

    function doBuy(id) {
        const up0 = E.UPGRADE_BY_ID[id];
        // The lab's bulk setting (×1 / ×10 / Max) applies to repeatable lab cards; the tree buys one level.
        const n = isLabUpgrade(up0) && up0.max == null ? bulkCount(up0) : 1;
        // Playtest: for skill-tree and legacy buys, what you had and the cheapest thing you could have bought instead.
        const ptChoice = playtest && !isLabUpgrade(up0) ? playtestChoice(up0) : null;
        const result = n > 1 ? E.buyMany(state, id, n) : E.buy(state, id);
        // A refused buy only sounds (lab cards stay pressable while unaffordable, to keep focus): a log line per press was noise.
        if (result.ok) log(result.count > 1 ? `${E.upgradeName(state, up0)} ×${result.count}: now level ${E.level(state, id)}.` : result.msg, 'success');
        // Each panel has its own buy sound (hardware, software, research, consciousness, the tree, legacy).
        if (result.ok) sfx('buy', { panel: up0.tab, big: up0.max === 1 || result.count > 1 || !!result.evolved });
        else sfx('error');
        if (result.ok) {
            pt('buy', { id, lvl: E.level(state, id), ...(result.count > 1 ? { n: result.count } : {}), ...(ptChoice || {}) });
            const up = E.UPGRADE_BY_ID[id];
            if (isLabUpgrade(up)) termLog(`installed ${E.upgradeName(state, up)} (level ${E.level(state, id)})`);
            if (isLabUpgrade(up) && E.isMaxed(state, up)) retireCard(id);
            // Once the desk has its monitor (click tool level 4), point out that jobs can be held down.
            if (id === 'keyboard' && E.level(state, id) >= 4 && !state.intro['hint:hold']) {
                state.intro['hint:hold'] = true;
                callout('hint:hold', 'Hold to repeat', 'Hold a job\'s button and it repeats about four times a second.');
            }
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
        setText($('dialogCancel'), cancelLabel || '');
        $('dialogCancel').hidden = !cancelLabel;
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
            message: `This version starts over: resources, XP, attributes, skills, and lab and skill-tree upgrades. You keep your desk, the Auto-Trainer and Procurement Bot, legacy upgrades, achievements and Insight, which speeds up automated production and training XP (×${E.insightMult(state.prestige.total).toFixed(2)} → ×${E.insightMult(state.prestige.total + gain).toFixed(2)}) and buys legacy upgrades.`,
            okLabel: `Ship ${name}`
        });
        if (ok) shipVersion(false);
    }

    function shipVersion(force, into) {
        const result = into ? E.startChallenge(state, into, Date.now()) : E.prestige(state, Date.now());
        if (!result.ok && !force) return;
        state = result.ok ? result.state : state;
        if (result.ok) pt('ship', { version: result.version, gain: result.gain, ...(into ? { challenge: into } : {}) });
        path.roll = null;
        resetView(false);
        log(`Shipped ${result.version}! +${result.gain} Insight. Automated production and training XP are now ×${E.derive(state).mult.toFixed(2)}. Spend Insight on legacy upgrades before you start.`, 'special');
        if (into) log(`Challenge: ${challengeName(into)}. ${E.CHALLENGES.find(c => c.id === into).rule} until Superintelligence.`, 'warning');
        dropStaleToasts();
        toast(`${result.version} shipped`, `+${result.gain} Insight`, 'version');
        modelSay(MODEL_SHIP[Math.max(0, state.prestige.count - 1) % MODEL_SHIP.length]);
        afterChange();
        save();
        // Spend Insight first, then start the new version.
        openLegacy(true);
    }

    const challengeName = id => E.CHALLENGES.find(c => c.id === id)?.name || id;

    // R&D's other projects: challenges (after three versions) and Transcend (at the Singularity). Each slot
    // stays a sealed ??? until it opens.
    const rndUi = { rows: {}, perks: {} };
    function buildRnd() {
        const list = $('challengeList');
        for (const c of E.CHALLENGES) {
            const button = el('button', { type: 'button', class: 'ghost-button' });
            const row = el('li', { class: 'challenge' }, [
                el('div', { class: 'challenge-text' }, [
                    el('strong', { text: c.name }),
                    el('span', { class: 'challenge-rule', text: c.rule }),
                    el('span', { class: 'challenge-reward', text: `Perk: ${c.reward}` })
                ]),
                button
            ]);
            button.addEventListener('click', () => challengeAction(c));
            list.append(row);
            rndUi.rows[c.id] = { row, button };
        }
        $('ascendButton').addEventListener('click', doTranscend);
        const perks = $('perkList');
        for (const p of E.TRANSCEND_PERKS) {
            const button = el('button', { type: 'button', class: 'ghost-button' });
            const level = el('span', { class: 'perk-level' });
            const row = el('li', { class: 'challenge perk' }, [
                el('div', { class: 'challenge-text' }, [
                    el('strong', {}, [el('span', { text: p.name }), level]),
                    el('span', { class: 'challenge-rule', text: p.effect })
                ]),
                button
            ]);
            button.addEventListener('click', () => {
                if (!E.buyPerk(state, p.id)) return;
                pt('perk', { id: p.id });
                log(`Transcendence perk: ${p.name}${p.costs.length > 1 ? ` ${E.perkLevel(state, p.id)}` : ''}.`, 'special');
                afterChange();
                save();
            });
            perks.append(row);
            rndUi.perks[p.id] = { row, button, level };
        }
    }

    function renderRnd() {
        const open = E.challengesOpen(state);
        setHidden($('challengeSealed'), open);
        setHidden($('challengePanel'), !open);
        const ascend = E.canTranscend(state) || state.transcend.count > 0;
        setHidden($('ascendSealed'), ascend);
        setHidden($('ascendPanel'), !ascend);
        if (open) {
            const gain = E.prestigeGain(state);
            const running = state.challenge;
            const beaten = E.CHALLENGES.filter(c => state.challengesDone[c.id]).length;
            let status = `${beaten}/${E.CHALLENGES.length} beaten`;
            if (running) {
                const c = E.CHALLENGES.find(x => x.id === running.id);
                const used = state.stats.playTime - running.start;
                status = `${c.name} running${c.limit ? ` · ${E.formatDuration(Math.max(0, c.limit - used))} left` : ''}`;
            }
            setText($('challengeStatus'), status);
            for (const c of E.CHALLENGES) {
                const { row, button } = rndUi.rows[c.id];
                const done = !!state.challengesDone[c.id];
                const here = running?.id === c.id;
                row.classList.toggle('done', done);
                row.classList.toggle('running', here);
                setText(button, done ? 'Beaten ✓' : here ? 'Abandon' : gain >= 1 ? `Ship into it (+${E.format(gain)})` : 'Ship into it');
                setDisabled(button, done || (!here && (!!running || gain < 1)));
            }
        }
        if (ascend) {
            setText($('ascendPoints'), E.format(state.transcend.total));
            const tg = E.transcendGain(state);
            setText($('ascendInfo'), tg >= 1
                ? `Start over from v1.0 for +${E.format(tg)} Transcendence: every point makes each release bring +50% Insight. Challenges beaten stay beaten.`
                : `Each release brings ×${E.insightBoost(state).toFixed(1)} Insight. Reach the Singularity again to transcend further.`);
            setDisabled($('ascendButton'), tg < 1);
            setText($('perkPoints'), `${E.format(state.transcend.points)} to spend`);
            for (const p of E.TRANSCEND_PERKS) {
                const { row, button, level } = rndUi.perks[p.id];
                const lv = E.perkLevel(state, p.id);
                const maxed = lv >= p.costs.length;
                row.classList.toggle('done', maxed);
                setText(level, p.costs.length > 1 ? ` · ${lv}/${p.costs.length}` : '');
                const cost = E.perkCost(state, p.id);
                setText(button, maxed ? (p.costs.length > 1 ? 'Maxed ✓' : 'Owned ✓') : `Buy (${cost})`);
                setDisabled(button, maxed || state.transcend.points < cost);
            }
        }
    }

    async function challengeAction(c) {
        if (state.challenge?.id === c.id) {
            const { ok } = await openDialog({ title: `Abandon ${c.name}?`, message: 'The rule lifts and this version carries on as normal. No perk.', okLabel: 'Abandon', danger: true });
            if (ok && E.abandonChallenge(state)) {
                pt('challenge', { name: c.name, abandoned: true });
                log(`Challenge abandoned: ${c.name}.`, 'warning');
                afterChange();
            }
            return;
        }
        const gain = E.prestigeGain(state);
        if (gain < 1 || state.challenge) return;
        const next = E.nextVersion(state, gain);
        const { ok } = await openDialog({
            title: `Ship ${E.versionName(next.major, next.minor)} into ${c.name}?`,
            message: `A normal release (+${gain} Insight), then the new version plays under one rule: ${c.rule.toLowerCase()}. Reach Superintelligence to beat it. Perk, for good: ${c.reward.charAt(0).toLowerCase()}${c.reward.slice(1)}.`,
            okLabel: 'Ship into it'
        });
        if (ok) shipVersion(false, c.id);
    }

    async function doTranscend() {
        const gain = E.transcendGain(state);
        if (gain < 1) return;
        const { ok } = await openDialog({
            title: `Transcend for ${gain} Transcendence?`,
            message: 'Everything starts over from v1.0: versions, Insight and legacy upgrades too. You keep Transcendence (each release brings +50% Insight per point) and its perks, achievements and the challenges you\'ve beaten.',
            okLabel: 'Transcend',
            danger: true
        });
        if (!ok) return;
        const result = E.transcend(state, Date.now());
        if (!result.ok) return;
        state = result.state;
        pt('transcend', { gain: result.gain });
        path.roll = null;
        resetView(false);
        log(`Transcended. +${result.gain} Transcendence. Every release now brings ×${E.insightBoost(state).toFixed(1)} Insight.`, 'special');
        dropStaleToasts();
        toast('Transcended', `+${result.gain} Transcendence`, 'version');
        afterChange();
        save();
        showView('lab');
    }

    // The playtest log as text to copy (the artifact frame refuses downloads, like Export).
    function exportPlaytest() {
        if (!playtest) return;
        playtestSample(true);
        const text = playtest.report({ build: E.BUILD, save: `v${E.SAVE_VERSION}, ${E.currentVersion(state)}, ${state.path.learned} skills`,
            screen: `${innerWidth}×${innerHeight}${matchMedia('(pointer: coarse)').matches ? ', touch' : ''}`,
            browser: navigator.userAgent });
        openDialog({
            title: 'Playtest log',
            message: `${playtest.events.length} events. Copy it and paste it into your chat with Claude.`,
            text,
            readonly: true,
            okLabel: 'Copy log',
            cancelLabel: 'Close',
            onOk: area => {
                area.select();
                navigator.clipboard?.writeText(text).then(
                    () => log('Playtest log copied to your clipboard.', 'success'),
                    () => log('Copy was blocked. Select the log and copy it manually.', 'warning')
                );
            }
        });
    }

    async function clearPlaytest() {
        if (!playtest) return;
        const { ok } = await openDialog({ title: 'Clear the playtest log?', message: 'Every recorded event on this device is deleted. Your game is not touched.', okLabel: 'Clear log', danger: true });
        if (!ok) return;
        playtest.clear();
        pt('session', { cleared: true, build: E.BUILD, skills: state.path.learned, at: playtestView = ptPlace() });
        playtestSample(true);
        log('Playtest log cleared.', 'info');
    }

    function exportSave() {
        save();
        pt('save', { op: 'export' });
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
        let version = 0;
        try { version = JSON.parse(atob(value.trim())).version; } catch { /* checked above */ }
        const sure = await openDialog({
            title: 'Replace your game?',
            message: `Importing ${saveSummary(imported)}, over your game (${saveSummary(state)}). Your current game is kept as a backup: Restore backup brings it back.${version > E.SAVE_VERSION ? ' This save is from a newer version of the game, so some of it may not carry over.' : ''}`,
            okLabel: 'Import',
            danger: true
        });
        if (!sure.ok) return;
        storageSet(BACKUP_KEY, E.serialize(state));
        lastBackup = Date.now();
        pt('save', { op: 'import', skills: imported.path.learned, version: E.currentVersion(imported) });
        state = imported;
        resetView();
        save();
        syncSettings();
        log('Save imported.', 'success');
        afterChange();
    }

    // Swap the game for the backup (the game becomes the backup, so it can be swapped back).
    async function restoreBackup() {
        const raw = storageGet(BACKUP_KEY);
        const backup = raw && E.deserialize(raw, Date.now());
        if (!backup) {
            await openDialog({ title: 'No backup yet', message: 'A backup is kept every 10 minutes of play, and before an import.', okLabel: 'OK', cancelLabel: null });
            return;
        }
        const { ok } = await openDialog({
            title: 'Restore the backup?',
            message: `The backup is ${saveSummary(backup)}, saved ${ago(backup)}. Your game (${saveSummary(state)}) becomes the backup, so you can switch back.`,
            okLabel: 'Restore',
            danger: true
        });
        if (!ok) return;
        const current = E.serialize(state);
        pt('save', { op: 'restore', skills: backup.path.learned, version: E.currentVersion(backup) });
        state = backup;
        storageSet(BACKUP_KEY, current);
        lastBackup = Date.now();
        resetView();
        save();
        syncSettings();
        log('Backup restored.', 'success');
        afterChange();
    }

    // One tab at a time: a tab that opens the game claims it, and the others stop ticking and saving (two
    // tabs used to take turns writing over each other's progress). The old tab saves once as it hands over,
    // and the new one reloads that save if it arrives in its first moments.
    const TAB_ID = Math.random().toString(36).slice(2);
    function claimTab() {
        if (typeof BroadcastChannel === 'undefined') return;
        const startedAt = Date.now();
        let channel;
        try { channel = new BroadcastChannel('agiGame'); } catch { return; }   // a sandboxed frame may refuse it
        channel.onmessage = e => {
            const m = e.data || {};
            // The newest tab wins (two opening at once mustn't both stand down).
            if (m.claim && m.claim !== TAB_ID && !passiveTab && (m.at > startedAt || m.at === startedAt && m.claim > TAB_ID)) {
                save();
                // The save travels with the message: another tab's storage can lag behind the channel, and the
                // new tab read the save from before the handover (losing up to an autosave's worth).
                channel.postMessage({ flushed: m.claim, json: E.serialize(state) });
                standDown();
            } else if (m.flushed === TAB_ID && Date.now() - startedAt < 4000) {
                const loaded = E.deserialize(m.json || storageGet(SAVE_KEY) || '', Date.now());
                if (!loaded) return;
                if (m.json) storageSet(SAVE_KEY, m.json);
                state = loaded;
                E.evaluate(state);
                syncSettings();
                render();
            }
        };
        channel.postMessage({ claim: TAB_ID, at: startedAt });
    }
    async function standDown() {
        passiveTab = true;
        for (;;) {
            if ($('dialog').open) $('dialog').close();
            const { ok } = await openDialog({ title: 'Open in another tab', message: 'The game is running in another tab, so this one has paused to keep your save safe.', okLabel: 'Use this tab', cancelLabel: null });
            if (ok) {
                location.reload();
                return;
            }
        }
    }

    // Settings → Start over (the owner's call: playtesters start over; a short warning, then Erase everything).
    async function hardReset() {
        const { ok } = await openDialog({
            title: 'Start over?',
            message: 'Everything you\'ve done is erased for good.',
            okLabel: 'Erase everything',
            danger: true
        });
        if (ok) startFresh('erase');
    }
    // A brand-new game, all the way back to the start (the inbox's opening and all): the save is replaced with a fresh
    // one and the page reloads, so nothing from the old game is left on screen or in memory (debug's Start over used to
    // reset the state in place and skip the opening). Per-device settings and the playtest log stay.
    function startFresh(op) {
        pt('save', { op, skills: state.path.learned, version: E.currentVersion(state) });
        state = E.defaultState(Date.now());
        path.roll = null;
        resetView();
        resetBulk();
        save();
        try { location.reload(); } catch {
            $('gameLog').replaceChildren();
            afterChange();
            openInbox();
        }
    }

    // A brand-new game (erase, debug start over) starts the ×1 / ×10 / Max switch at ×1 again.
    function resetBulk() {
        bulkMode = '1';
        storageSet(BULK_KEY, '1');
        $('bulkBuy')?.querySelectorAll('[data-bulk]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.bulk === '1')));
    }

    // After a reset: no open bay, no finished run on screen, fresh room visits and tree view.
    // `full` (start over, import, erase): also forget screen-level memories (rooms seen, the tree view).
    // Shipping a version keeps them, so first-time flashes and badges don't come back.
    function resetView(full = true) {
        syncSettings();
        // Packet Snare's last card and run belong to the old game (a new version, Start over, an import): a run in play is
        // dropped without settling it (settling wrote the old run into the new save).
        snare.run = null;
        if (openBay === 'pipeline') closeSnare();
        Object.assign(snare, { run: null, done: null, fx: [], haul: 0, preview: false, pointer: null, pick: null, sectorPick: null });
        if (openBay) {
            openBay = null;
            $('moduleView').hidden = true;
            $('hub').hidden = false;
        }
        clearCallouts();
        Object.assign(path, { roll: null, done: false, pause: 0, overview: 0, glow: null, summit: null, particles: [], tension: 0, focus: null, timeScale: 1, fx: freshFx() });
        path.view = 'run';
        dismissResult();
        if (full) {
            seenRooms = new Set(['lab']);
            storageSet(SEEN_KEY, '[]');
            storageSet(TREE_CAM_KEY, '');
            treeCamFresh = true;
            Object.assign(treeCam, { x: 0, y: 0, z: 1 });
            $('skillTree').style.transform = '';
        }
        cabinetKey = null;
        Object.assign(lab, { cp: [], dp: [], rp: [], xp: [], hand: [], lastRunCp: null, lastCollects: null, lastResearch: null, lastXp: null, lines: [] });
        storageSet(RACK_LOG_KEY, '[]');
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
        deliverMail(false);
        promptAutoTrainer();
        render();
    }

    function announce(changes) {
        for (const r of changes.reveals || []) {
            log(`${r.name}: ${r.intro}`, 'special');
        }
        for (const m of changes.milestones) {
            pt('unlock', { key: m.key });
            log(`Milestone reached: ${m.name}`, 'special');
            // First-time callouts show once per save, not again after a new version.
            if (m.callout && !state.intro[m.key]) {
                state.intro[m.key] = true;
                callout(m.key, m.callout[0], m.callout[1]);
            }
        }
        // R&D opening is the first chance to ship: point at it once (not for players who already shipped).
        // Only nudge once shipping is worth it (General AI): an early ship for 1–2 Insight sets you back.
        if (!state.intro['room:rnd'] && roomOpen('rnd') && E.phaseIndex(state) >= 1) {
            state.intro['room:rnd'] = true;
            if (!state.prestige.count) callout('room:rnd', 'R&D online', 'Your model is ready to ship. Shipping restarts the run but pays Insight: a permanent boost, and the currency for legacy upgrades.');
        }
        for (const a of changes.achievements) {
            pt('achievement', { id: a.id });
            log(`Achievement unlocked: ${a.name}`, 'special');
            toast(`Achievement · ${a.name}`, a.desc, 'achievement');
        }
        if (changes.challenge) {
            const c = changes.challenge;
            if (c.won) {
                log(`Challenge beaten: ${c.name}! Perk for good: ${c.reward}.`, 'special');
                toast(`Challenge beaten · ${c.name}`, c.reward, 'version');
            } else {
                log(`Challenge failed: ${c.name}. Out of time; this version carries on without the rule.`, 'warning');
                toast(`Challenge failed · ${c.name}`, 'Out of time', 'phase');
            }
        }
        if (changes.challenge) pt('challenge', { name: changes.challenge.name, won: !!changes.challenge.won });
        if (changes.phase) {
            pt('phase', { name: changes.phase.name });
            log(`Your AI reached ${changes.phase.name}.`, 'special');
            const seenPhase = `phase:${changes.phase.name}`;
            if (!state.intro[seenPhase]) {
                state.intro[seenPhase] = true;
                // The chapter's ending card is the announcement for this phase.
                // What it means for you first (where to go next), then a line of mood.
                if (!changes.ending) toast(`${changes.phase.name} reached`, PHASE_NEWS[changes.phase.name] || changes.phase.note || 'A new phase for your AI', 'phase');
            }
        }
        if (changes.ending) showEnding();
    }

    // What a phase means, on its toast (Superintelligence has the chapter card instead).
    const PHASE_NEWS = { 'General AI': 'It can learn anything now. R&D can ship it.', 'Singularity': 'Transcend is open in R&D.' };

    // The end of chapter one (Superintelligence): what it took, then the story goes on. Once per save.
    // Three endings, by how much you let the AI out (E.ENDINGS, by its freedom from the dilemmas).
    function showEnding() {
        const dialog = $('ending');
        if (!dialog || dialog.open) return;
        const end = E.ending(state);
        pt('ending', { playTime: Math.round(state.stats.finishedAt), ending: end.id, freedom: state.dilemmas.freedom });
        log(end.id === 'contained' ? '> Still here.' : end.id === 'loose' ? '> See you everywhere.' : '> See you outside.', 'special');
        setText($('endingKicker'), `${E.ACT_TWO_LOCKED ? 'End of the demo' : 'Chapter one complete'} · ${end.name}`);
        // The demo ends at General AI: its title, and what comes next (act two isn't in this build).
        setText($('endingTitle'), E.PHASES[E.endingPhase()].name);
        setText(document.querySelector('#ending .ending-next'), E.ACT_TWO_LOCKED
            ? 'That\'s the end of the demo. Act II, Terminal Velocity, is coming in the full game: the ball takes flight. Until then, replays, versions and the lab carry on.'
            : 'That\'s the end of chapter one. The Singularity is still out there, and the sealed wings are waking up.');
        const lines = $('endingLines');
        lines.replaceChildren(...end.lines.map((t, i) => el('p', { style: `--i: ${i}`, text: t })));
        const asked = E.DILEMMAS.filter(x => x.ai && x.id in state.dilemmas.answered);
        const granted = asked.filter(x => x.choices[state.dilemmas.answered[x.id]].now.some(e => e.freedom > 0)).length;
        const flight = state.stats.bestFlight;
        const rows = [
            ['Play time', E.formatDuration(state.stats.finishedAt)],
            ['Versions shipped', `${state.prestige.count} · now ${E.versionName(state.prestige.major, state.prestige.minor)}`],
            ['Skills learned', E.format(state.stats.skillsLearned)],
            ['Training runs', E.format(state.stats.rolls)],
            ...(asked.length ? [['Favors granted', `${granted} of ${asked.length} it asked for`]] : []),
            ...(flight ? [['Longest flight', `${Math.round(flight)} m`]] : []),
            ['Achievements', `${Object.keys(state.achievements).length} / ${E.ACHIEVEMENTS.length}`]
        ];
        $('endingStats').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
        sfx('phase');
        dialog.showModal();
    }

    function addDebugIncome(seconds) {
        for (const [k, perSec] of Object.entries(debugIncome)) {
            const amount = perSec * seconds;
            if (!amount) continue;
            if (k === 'insight') {
                state.prestige.points += amount;
                state.prestige.total += amount;
                continue;
            }
            state.res[k] += amount;
            // Like the debug add: debug CP counts as earned (hardware reveals, shipping).
            if (k === 'cp') {
                state.stats.runCp += amount;
                state.stats.lifetimeCp += amount;
            }
        }
    }

    function tick() {
        if (passiveTab) return;
        const now = Date.now();
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        // An active game: nothing runs while the tab is hidden, and a long gap (the machine asleep, a frozen
        // tab) is simply skipped. The lab only works while you're here.
        if (document.hidden) {
            if (state.settings.autosave && now - lastSave >= AUTOSAVE_MS) save();
            return;
        }
        if (dt > 5) {
            log(`Paused for ${E.formatDuration(dt)} while you were away.`, 'info');
            pt('gap', { s: Math.round(dt) });
        } else {
            const bought = E.tick(state, dt * debugSpeed, debugRates);
            addDebugIncome(dt * debugSpeed);
            sampleLab(dt * debugSpeed);
            advanceTasks(dt * debugSpeed);
            ghostTrain(dt * debugSpeed);
            logProcurement(bought);
        }
        afterChange();
        musicTick();
        playtestOffers();
        playtestSample();
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
        drawSpark($('sparkRp'), lab.rp, path.colors.research || '#c792ea');
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
            case 'snare.signal': return f(state.snare.signal);
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
                const xpRate = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : d.xpPerSec;
                return `${f(xpRate, xpRate < 0.1 ? 2 : 1)} XP/s`;
            }
            case 'supply.rates': {
                const cp = f(d.cpNet + handRate('cp'));
                return state.unlocked['seen:dp'] ? `${cp} CP · ${f(d.dpNet + handRate('dp'))} DP /s` : `${cp} CP/s`;
            }
            case 'goal.bay': return goalFor('bay');
            case 'goal.rnd': return goalFor('rnd');
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
                return E.PHASES[E.phaseIndex(state)].name;
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
            case 'stats.runTime': return E.formatDuration(state.stats.playTime - state.stats.runPlayStart);
            case 'stats.playTime': return E.formatDuration(state.stats.playTime);
            case 'stats.runCp': return f(state.stats.runCp);
            case 'stats.lifetimeCp': return f(state.stats.lifetimeCp);
            case 'stats.clicks': return f(state.stats.clicks);
            case 'stats.rolls': return f(state.stats.rolls);
            case 'stats.skills': return f(state.stats.skillsLearned);
            case 'stats.clean': return f(state.stats.cleanSprints);
            case 'stats.topSpeed': return state.stats.topSpeed ? `${state.stats.topSpeed.toFixed(1)} m/s` : '—';
            case 'stats.snare': return state.snare.runs ? `${snareSector(state.snare.sector)} · ${state.snare.runs} runs · best +${f(state.snare.best)} Signal · best loop ×${(state.snare.bestMult || 1).toFixed(1)} · ${f(state.snare.earned)} earned · ${state.snare.bosses} boss${state.snare.bosses === 1 ? '' : 'es'} down` : '—';
            case 'stats.bestFlight': return state.stats.bestFlight ? `${Math.round(state.stats.bestFlight)} m (${state.stats.bestHeight.toFixed(1)} m up)` : '—';
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
        renderLegacy();
        if (snare.tree) renderSnareTree();
        if (openBay === 'pipeline') renderSnareBar();
        // A toast outlives a zoom (6–7.5 s against 0.5 s): placed for the screen it arrived on, it sat over the
        // next screen's status line (the lab's supply cells). Keep clearing whatever is on screen now.
        if (toastLive) placeToasts();

        // In the demo General AI is as far as it goes: the bar stays full there rather than creeping toward a locked phase.
        const demoDone = E.ACT_TWO_LOCKED && E.phaseIndex(state) >= E.endingPhase();
        const pct = demoDone ? 100 : Math.round(E.phaseProgress(state) * 100);
        const bar = $('phaseBar');
        bar.setAttribute('aria-valuenow', pct);
        bar.firstElementChild.style.width = pct + '%';

        const gains = { compute: `+${E.format(d.clickPower, d.clickPower < 10 && d.clickPower % 1 ? 2 : undefined)} CP`, collect: `+${E.format(d.dpPerCollect)} DP`,
            research: `+${E.format(d.rpPerResearch)} RP` };
        for (const { action, button, gain, cost, auto } of Object.values(ui.actions)) {
            const autoText = automationText(action.id, d);
            setText(auto, autoText);
            if (auto.title !== autoText) auto.title = autoText;
            const automated = !!(AUTOMATES[action.id] && E.level(state, AUTOMATES[action.id]));
            auto.classList.toggle('done', automated);
            auto.classList.toggle('gate', !automated && !!autoText);
            const price = E.actionCost(state, action);
            const locked = !!action.unlock && !state.unlocked[action.unlock];
            // Research shows (locked, with its progress) once the first skill starts its countdown.
            const preview = locked && action.id === 'research' && state.path.learned >= 2 && !!state.unlocked['module:path'];
            setHidden(button, locked && !preview);
            setDisabled(button, locked || !E.canAfford(state, price));
            setText(gain, gains[action.id]);
            setText(cost, Object.keys(price).length ? E.formatCost(price) : '');
        }

        renderStations();
        // A badge on every Upgrades button while XP can buy a skill-tree node: the shop between runs.
        const ready = treeReady();
        for (const b of [$('hubUpgrades'), $('treeButton'), document.querySelector('#rollResult [data-next="dev"]')]) {
            if (!b) continue;
            if (ready) b.dataset.ready = ready > 9 ? '9+' : String(ready);
            else delete b.dataset.ready;
        }
        // Finished investor offers wait to be claimed: a badge on the Lab's tile and the run view's lab supply,
        // where most of the time is spent (status, like the Upgrades badge, not a hint).
        // Lab cards revealed while you were elsewhere count too: training opens lab upgrades you'd otherwise miss.
        const claimable = state.projects.offers.filter(o => E.projectProgress(state, o) >= o.target).length;
        const unseen = labUnseen();
        const waiting = labNewsCount();
        for (const b of [document.querySelector('.facility-room[data-room-id="lab"]'), document.querySelector('.run-stats .module-supply')]) {
            if (!b) continue;
            if (waiting) b.dataset.ready = waiting > 9 ? '9+' : String(waiting);
            else delete b.dataset.ready;
        }
        // The first time each happens, a tip says what the badge means (once per save).
        if (unseen.length && !state.intro['hint:lab']) {
            state.intro['hint:lab'] = true;
            const u = unseen[0];
            const more = [...(labSeen || [])].some(k => k.startsWith(`${u.id}@`));
            callout('hint:lab', 'New in the lab', `${more ? `More room for ${E.upgradeName(state, u)}` : `${E.upgradeName(state, u)} just opened`}. The lab's badge counts what's new since your last visit.`);
        }
        if (!state.intro['hint:train'] && openBay === 'training' && path.view === 'run' && state.stats.rolls === 0) {
            state.intro['hint:train'] = true;
            callout('hint:train', 'Training runs', 'Your model learns by rolling. Hold the button to charge a sprint, release to fire it. Crest the big hill at the flag to learn a skill; every meter earns XP for upgrades.');
        }
        // Replaying pays once there's a real leg behind you (the warm-up's is two metres), on the screen
        // where you pick one.
        if (!state.intro['hint:rerun'] && state.intro['hint:replay'] && openBay === 'training' && path.view === 'dev'
            && state.path.learned > E.FIRST_REAL_SKILL && !$('legPick').hidden) {
            state.intro['hint:rerun'] = true;
            callout('hint:rerun', 'Raise your passive XP', 'Run a cleared leg again with better upgrades and its passive XP goes up. Pick the leg here.');
        }
        // The first exploit (Hop, with Embeddings): what it is and the skill check, once, before a run.
        if (!state.intro['hint:hopAim'] && openBay === 'training' && path.view === 'run' && E.exploitCharges(state) > 0 && path.roll && !thrustLeg(path.roll)) {
            state.intro['hint:hopAim'] = true;
            log('Exploit found: Hop. The model found a bug in its training environment.', 'special');
            callout('hint:hopAim', 'Exploit found: Hop', 'Hold Hop (or E) to set a breakpoint: time slows and the view leans in. Let go as the ring closes on a hill\'s glowing lip for a clean exploit: the ball floats over the next dip with no speed lost. Sloppy hops get flagged, and three flags get the run audited.');
        }
        if (!state.intro['hint:prompt'] && openBay === 'training' && path.view === 'run' && E.derive(state).zoneWidth > 0) {
            state.intro['hint:prompt'] = true;
            callout('hint:prompt', 'Clean prompts', 'Release a sprint inside the green zone to land a clean prompt: bonus XP now and a bigger payout when the run ends. A full charge may still carry you farther.');
        }
        if (claimable && view !== 'lab' && !state.intro['hint:offer']) {
            state.intro['hint:offer'] = true;
            callout('hint:offer', 'Investor task done', 'Claim the reward in the lab: it pays in training XP.');
        }
        // The bulk switch shows once a card it applies to does (the first generator).
        setHidden($('bulkBuy'), !state.unlocked['up:cpu']);

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
            button.classList.toggle('full', !maxed && E.atCapacity(state, up));
            if (maxed) {
                setText(button, 'Installed ✓');
                setUnavailable(button, true);
            } else if (E.atCapacity(state, up)) {
                // Lab capacity grows with skills: the card says it's full, and that the next skill makes room.
                const key = `full|${lvl}`;
                if (button.dataset.key !== key) {
                    button.dataset.key = key;
                    button.replaceChildren(`Full ${lvl}/${E.capacity(state, up)}`, el('span', { class: 'eta', text: 'more room with the next skill' }));
                }
                setUnavailable(button, true);
            } else {
                const n = up.max == null ? Math.min(bulkCount(up), E.capacity(state, up) - lvl) : 1;
                const cost = n > 1 ? E.bulkCost(state, up, n) : E.upgradeCost(up, lvl);
                const ok = E.canAfford(state, cost);
                const eta = ok ? '' : etaText(cost, d);
                // The price, and under it (small) how many it buys and how long until you can afford it.
                const label = E.formatCost(cost);
                const sub = [n > 1 ? `×${n}` : '', eta].filter(Boolean).join(' · ');
                const key = label + '|' + sub;
                if (button.dataset.key !== key) {
                    button.dataset.key = key;
                    button.replaceChildren(label, ...(sub ? [el('span', { class: 'eta', text: sub })] : []));
                }
                setUnavailable(button, !ok);
            }
        }
        for (const tab of E.TABS) setHidden(ui.panels[tab.id].emptyHint, !!visibleCount[tab.id]);

        // Milestones say what they were only once reached (no recipes up front).
        for (const [key, item] of Object.entries(ui.milestones)) {
            const done = !!state.unlocked[key];
            if (item.classList.contains('done') === done && item.dataset.filled) continue;
            item.dataset.filled = '1';
            item.classList.toggle('done', done);
            const m = E.MILESTONES.find(x => x.key === key);
            item.firstChild.textContent = done ? m.name : '???';
            item.lastChild.textContent = done ? m.desc : '';
        }
        // Unearned achievements keep quiet about things you haven't met yet (a `seen` rule on the achievement).
        for (const a of E.ACHIEVEMENTS) {
            const item = ui.achievements[a.id];
            const done = !!state.achievements[a.id];
            item.classList.toggle('done', done);
            setText(item.lastChild, done || !a.seen || a.seen(state) ? a.desc : '???');
        }

        setDisabled($('prestigeButton'), E.prestigeGain(state) < 1);
        for (const node of document.querySelectorAll('[data-show]')) setHidden(node, !state.unlocked[node.dataset.show]);
        // Training XP joins the supply line once cleared stretches make it on their own.
        setHidden($('labRoom').querySelector('.cell-xp'), !(d.xpPerSec > 0));
        renderTasks(d);
        renderRnd();
        renderProjects();
        layoutLab();
        renderFacility(d);
        renderMinimap();
        if (!zooming) {
            if (view !== 'facility' && !roomOpen(view)) showView('lab');
            else if (document.body.dataset.view !== view) showView(view);
        }
        renderHub();
        renderAutoTrainer();
        // The trail's animation loop sleeps when nothing moves, so keep its button in step with
        // resources here too (otherwise Launch stays disabled after you can afford it).
        if (openBay === 'training') {
            updatePathControls();
            updateTreeButton();
            if (path.view === 'dev') {
                // The upgrades screen stays put: an Auto-Trainer run keeps going behind it (devLive shows it).
                renderTree();
                renderLegPicker();
                updateLegTag();
            }
        }

        if (openBay === 'training' && !bayUnlocked('training')) exitBay();
        if (path.stateRef !== state) {
            path.pause = 0;
            startPathLoop();
        }
    }

    // Title bars keep to status (the run's next skill and record, a version ready to ship); they never say
    // how to unlock things: players find out by playing.
    function goalFor(place) {
        if (place === 'bay') {
            const k = E.skillAt(state.path.learned);
            if (E.actTwoLocked(state)) return 'Act one complete · Act II: Terminal Velocity · Not available in the demo';
            const ch = state.challenge ? ` · challenge: ${challengeName(state.challenge.id)}` : '';
            // The leg's character and a wall say so (status: what kind of stretch it is; a wall's skill pays big).
            const kind = [T.LEG_CHARACTERS[T.legCharacter(state.path.learned)]?.name, E.isWallLeg(state.path.learned) && 'wall'].filter(Boolean).join(', ');
            const wall = kind ? ` (${kind})` : '';
            const surge = state.path.surge > 0 ? ` · surge start ×${state.path.surge}` : '';
            return `Next skill: ${k.name}${wall} · best run ${Math.round(state.path.best * 100)}%${surge}${ch}`;
        }
        if (place === 'rnd') {
            const gain = E.prestigeGain(state);
            if (gain < 1) return '';
            // Status, not advice: the version's Insight per hour so far, and the skill that brings more.
            const hours = Math.max(1 / 60, (state.stats.playTime - state.stats.runPlayStart) / 3600);
            const next = E.nextInsightAt(state);
            return `Ship now for +${E.format(gain)} Insight · ${E.format(gain / hours)} Insight an hour so far${E.actTwoLocked(state) ? '' : ` · +${E.format(Math.floor(E.insightAt(next) * E.insightBoost(state)) - gain)} more once you learn ${E.skillAt(next - 1).name}`}`;
        }
        return '';
    }

    // ---- Facility & rooms --------------------------------------------------

    // The facility is the zoomed-out floor plan; each room is a tile you zoom into. Like the bays,
    // rooms are data: a new room is an entry here plus a `.room[data-room=id]` section (built: true).
    const ROOMS = {
        lab: { name: 'Lab', built: true },
        // Open with training, or with Packet Snare (open from the start in the playtest, E.SNARE_OPEN_AT_START).
        servers: { name: 'Server room', built: true, unlocked: () => !!state.unlocked['module:path'] || !!state.unlocked['module:snare'] },
        rnd: { name: 'R&D', built: true,
            unlocked: () => E.prestigeGain(state) >= 1 || state.prestige.count > 0 || state.transcend.count > 0 },
        boardroom: { name: 'Boardroom', phase: 1 },
        signals: { name: 'Signals room', phase: 2 },
        mirror: { name: 'Mirror room', phase: 3 }
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
    // Entered a bay before (older saves that have run count as having seen the Training Cluster).
    const baySeen = id => seenRooms.has(`bay:${id}`) || (id === 'training' && state.stats.rolls > 0);

    function roomStatus(id, d) {
        const r = ROOMS[id];
        if (!roomUnlocked(id)) return '';
        if (!r.built) return 'Under construction';
        if (id === 'lab') {
            const ready = E.UPGRADES.filter(u => isLabUpgrade(u) && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u)
                && E.canAfford(state, E.upgradeCost(u, E.level(state, u.id)))).length;
            return `+${E.format(d.cpNet)} CP/s · ${ready ? `${ready} upgrade${ready === 1 ? '' : 's'} ready` : 'no upgrades ready'}`;
        }
        if (id === 'rnd') return `Model ${E.currentVersion(state)} · ${E.format(state.prestige.points)} Insight · +${E.format(E.prestigeGain(state))} ready`;
        if (id === 'servers') {
            const learned = state.path.learned;
            return `${learned} skill${learned === 1 ? '' : 's'} · ${E.format(state.res.xp, 1)} XP to spend`;
        }
        return '';
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
        // A picture of the room: its buttons must not take keyboard focus (Tab used to land on them, hidden
        // from screen readers by the feed's aria-hidden).
        copy.inert = true;
        // Inert and anonymous: no duplicate ids, nothing focusable, nothing the game would find and update.
        for (const n of copy.querySelectorAll('[id], [data-facility], [data-bind], [data-next]')) {
            n.removeAttribute('id');
            n.removeAttribute('data-facility');
            n.removeAttribute('data-bind');
            n.removeAttribute('data-next');
        }
        // Transient effects (connection wires, cabinet sparks and signals) would freeze mid-animation.
        for (const n of copy.querySelectorAll('.room-bar, .signal-line, .cab-spark, .cab-signal')) n.remove();
        // One-off entrance animations would replay on every refresh.
        for (const n of copy.querySelectorAll('.fresh, .reveal-in')) n.classList.remove('fresh', 'reveal-in');
        return copy;
    }

    // Once the model has Awareness, the cameras aren't only yours: now and then a feed glitches and something
    // looks back (more often as Awareness grows). The theme in the world, not just the log.
    const GLITCH_TEXT = ['◉ REC', '◉ hello', '◉ I see you', '◉ who is watching who', '◉ don\'t switch me off'];
    function maybeGlitch(screen) {
        const awa = state.attr.awareness || 0;
        if (!awa || reducedMotion() || screen.classList.contains('glitch')) return;
        if (Math.random() > Math.min(0.12, 0.02 + 0.004 * awa)) return;
        screen.dataset.glitch = GLITCH_TEXT[Math.min(GLITCH_TEXT.length - 1, Math.floor(Math.random() * (1 + awa / 8)))];
        screen.classList.add('glitch');
        setTimeout(() => screen.classList.remove('glitch'), 900);
    }

    let cameraSkip = 0;
    function refreshCameras() {
        if (idle() && ++cameraSkip % 5) return;
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
            maybeGlitch(screen);
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
                    el('span', { class: 'fr-blurb' }),
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

    // The whole floor plan is there from the start: every locked room is an anonymous sealed wing. A room
    // that opens flashes a few times the first time you see Surveillance afterwards (.unsealed).
    function renderFacility(d) {
        let fresh = false;
        for (const tile of document.querySelectorAll('.facility-room')) {
            const id = tile.dataset.roomId;
            const open = roomOpen(id);
            const unlocked = roomUnlocked(id);
            const isNew = open && !seenRooms.has(id);
            fresh ||= isNew;
            if (isNew && view === 'facility' && !tile.dataset.flashed) {
                tile.dataset.flashed = '1';
                tile.classList.remove('unsealed');
                void tile.offsetWidth;
                tile.classList.add('unsealed');
            }
            setText(tile.querySelector('.fr-name'), unlocked ? ROOMS[id].name : '???');
            setText(tile.querySelector('.fr-blurb'), unlocked ? '' : 'Sealed wing');
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
        ptView(id);
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
        placeResources(id === 'lab');
        if (state) renderMinimap();
    }

    // In the lab the supply cells carry the amounts (bank, rate and sparkline together), so the top bar's
    // resource chips trade places with the lab's "Systems online · uptime" line and sit hidden in its bar
    // (styles.css "Resources in the lab"). Every other screen keeps them in the top bar.
    let resInLab = false;
    function placeResources(inLab) {
        if (inLab === resInLab) return;
        const chips = $('resChips');
        const status = $('labStatus');
        const mark = document.createComment('');
        chips.replaceWith(mark);
        status.replaceWith(chips);
        mark.replaceWith(status);
        resInLab = inLab;
        document.body.classList.toggle('res-in-lab', inLab);
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
        if (openBay === 'pipeline') closeSnare();
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

    let mapAutoMin = null;   // set once the minimap is built: shrinks it to the pill where it would cover things
    function renderMinimap() {
        const nav = $('minimap');
        const show = roomUnlocked('servers');
        nav.hidden = !show;
        document.body.classList.toggle('has-minimap', show);
        if (!show) return;
        mapAutoMin?.();
        const sealedShown = new Set([...$('facilityPlan').querySelectorAll('.facility-room.locked:not([hidden])')].map(t => t.dataset.roomId));
        const areas = Object.keys(ROOMS).filter(id => MINIMAP[id] && (roomUnlocked(id) || sealedShown.has(id)));
        const bays = Object.keys(BAYS).filter(id => bayUnlocked(id) || id === nextSealedBay());
        const here = currentPlace();
        // Open state too: a sealed outline that opens keeps the same id, and must redraw as a room.
        const key = [areas.map(id => id + (roomOpen(id) ? '+' : '') + (seenRooms.has(id) ? 's' : '')), bays.map(id => id + (bayUnlocked(id) ? '+' : '') + (baySeen(id) ? 's' : '')), here, state.snare.runs > 0 && snareReadyCount() > 0].join('|');
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
        const body = add('g', { class: `mm-body${here === 'facility' ? ' here' : ''}`, 'data-target': 'facility', role: 'button', tabindex: 0, 'aria-label': 'Surveillance room' });
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
        };
        for (const id of areas) {
            const b = MINIMAP[id];
            // A room you haven't been in yet pulses on the map: the way the first visit to the server room is steered.
            if (open(id)) block(id, b, `room${seenRooms.has(id) ? '' : ' fresh'}`, b.label, ROOMS[id].name);
            else block(id, b, roomUnlocked(id) ? 'room building' : 'room sealed', '?', roomUnlocked(id) ? `${ROOMS[id].name} (being built)` : 'Sealed');
        }
        // The server room's bays, as cells inside its block.
        if (open('servers')) {
            const sb = MINIMAP.servers;
            bays.forEach((id, i) => {
                const cell = { x: sb.x + 3, y: sb.y + 11 + i * 10, w: sb.w - 6, h: 8 };
                const live = bayUnlocked(id) && BAYS[id].built;
                // No shortcut into a bay you haven't entered: the first time, the way in is through the server room
                // (its New badge, and a sign there may be more bays to come).
                if (live && !baySeen(id)) return;
                const ready = id === 'pipeline' && live && state.snare.runs > 0 && snareReadyCount() > 0;
                block(`bay:${id}`, cell, live ? `bay${ready ? ' ready' : ''}` : 'bay sealed', '', live ? `${BAYS[id].name}${ready ? ' (upgrades ready)' : ''}` : 'Sealed');
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
        // Open by default; the – button minimizes it to the pill (remembered), and hovering still opens it.
        const min = nav.querySelector('.mm-min');
        const setMin = on => {
            nav.classList.toggle('min', on);
            document.body.classList.toggle('mm-min', on);
            min.textContent = on ? '+' : '–';
            min.title = on ? 'Keep the map open' : 'Minimize';
            min.setAttribute('aria-label', on ? 'Keep the map open' : 'Minimize the map');
            min.setAttribute('aria-pressed', String(on));
        };
        // On Surveillance (the map itself, full size), inside a bay (the trail and meter run to the corner)
        // and in the lab or R&D on a small desktop (below 1440 px it sat over the cards, and over Transcend's
        // perks), it
        // shrinks to the pill without changing your setting; hover still opens it.
        let auto = null;
        mapAutoMin = () => {
            const want = view === 'facility' || !!openBay || ((view === 'lab' || view === 'rnd') && window.innerWidth < 1440);
            if (want === auto || zooming) return;   // resizing rooms mid-zoom throws the zoom off
            auto = want;
            setMin(want || storageGet(MAP_MIN_KEY) === '1');
        };
        mapAutoMin();
        window.addEventListener('resize', () => mapAutoMin());
        min.addEventListener('click', e => {
            e.stopPropagation();
            const on = !nav.classList.contains('min');
            setMin(on);
            if (!auto) storageSet(MAP_MIN_KEY, on ? '1' : '0');
            if (on) min.blur();
        });
        // A small tooltip naming the room under the pointer (the blocks only carry short labels).
        const tip = el('span', { class: 'mm-tip', hidden: true });
        nav.append(tip);
        nav.addEventListener('pointerover', e => {
            const g = e.target.closest('.mm-block, .mm-body');
            if (!g) return void (tip.hidden = true);
            const z = uiScale();
            const n = nav.getBoundingClientRect();
            const r = (g.querySelector('rect.mm-die') || g.querySelector('rect') || g).getBoundingClientRect();
            tip.textContent = g.getAttribute('aria-label');
            tip.hidden = false;
            const top = g.classList.contains('mm-body') ? r.top - n.top + 4 : r.top - n.top - 4;
            tip.style.left = `${(r.left + r.width / 2 - n.left) / z}px`;
            tip.style.top = `${top / z}px`;
        });
        nav.addEventListener('pointerleave', () => { tip.hidden = true; });
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
        // One line (it wrapped and squeezed the offers into each other); penalties from the dilemmas read −n% in red.
        const boostEls = p.boosts.slice().sort((a, b) => (a.mult < 1 ? 0 : 1) - (b.mult < 1 ? 0 : 1)).map(b => el('span', { class: b.mult < 1 ? 'boost down' : 'boost',
            text: `${b.mult < 1 ? '−' : '+'}${Math.round(Math.abs(b.mult - 1) * 100)}% ${BOOST_NAMES[b.stat] || b.stat} · ${left(b.until - t)}` }));
        $('boosts').replaceChildren(...boostEls.flatMap((x, i) => i ? [document.createTextNode(' · '), x] : [x]));
        $('boosts').title = boostEls.map(x => x.textContent).join('\n');
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
                    if (r.ok) { ptOffers.handled.add(o.id); pt('claim', { id: o.id, task: o.task, reward: E.PROJECT_REWARDS[o.reward].text }); }
                    log(r.msg, r.ok ? 'success' : 'warning');
                    if (r.ok) {
                        sfx('claim');
                        termLog(`project paid out: ${E.PROJECT_REWARDS[o.reward].text}`);
                    }
                    afterChange();
                });
                const drop = el('button', { type: 'button', class: 'project-drop', 'aria-label': 'Ignore this project', text: '×' });
                drop.addEventListener('click', () => {
                    E.dismissProject(state, o.id);
                    ptOffers.handled.add(o.id);
                    pt('dismiss', { id: o.id, task: o.task });
                    afterChange();
                });
                const task = E.PROJECT_TASKS[o.task].text(o.target);
                const reward = E.PROJECT_REWARDS[o.reward].text;
                return el('li', { class: `offer${done ? ' done' : ''}`, 'data-id': o.id }, [
                    el('span', { class: 'project-reward', text: reward }),
                    el('span', { class: 'project-task', text: task, title: task }),
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
    // get a slider: the share of each second's compute dedicated to them (engine taskShares). Each goes to
    // 100% on its own; together past 100% they draw on the stockpile (said in the total). Cleared legs lapping
    // on the rack are listed too (they need no compute).
    const TASK_INTROS = {
        autoCollector: ['Data crawler', 'It collects data for you, paying compute at the hand price. Its slider sets how much of each second\'s compute it may spend, up to 100%: push it up for data now, pull it back to grow compute.'],
        researchAssistant: ['Research Assistant', 'It researches for you, paying compute and data like a research run by hand. Its slider works like the crawler\'s.'],
        procurement: ['Procurement Bot', 'It saves its share of compute into a fund and buys the hardware that pays best whenever the fund covers it. More share, faster buying; less, more compute left for you.']
    };
    const TASK_UPGRADES = { autoCollector: 'autoCollector', researchAssistant: 'researchAssistant', autoTrainer: 'autoTrainer', procurement: 'procurement' };
    const taskUi = {};

    // Each task shows a bar filling at the rate it earns (one fill = one collection, one research, one
    // lap of a cleared leg). Cleared legs are listed one per skill, named after it.
    const taskProgress = { autoCollector: 0, researchAssistant: 0, procurement: 0 };
    const bar = () => el('span', { class: 'task-bar' }, [el('span', { class: 'task-fill' })]);

    function buildTasks() {
        const list = $('taskList');
        for (const t of E.TASKS) {
            // The Auto-Trainer's switch lives in the server room, where you watch it; here it only reports.
            const toggle = el('button', { type: 'button', class: 'task-toggle', role: 'switch', 'aria-label': `${t.name}: on or off`, hidden: t.id === 'autoTrainer' });
            toggle.addEventListener('click', () => {
                E.setTaskOn(state, t.id, !E.taskOn(state, t.id));
                pt('task', { id: t.id, on: E.taskOn(state, t.id) });
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
                slider.addEventListener('change', () => { pt('task', { id: t.id, share: Number(slider.value) }); save(); });
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
        // The log lives at the foot of the same panel (installs, payouts).
        ui.termLines = el('span', { class: 'terminal-log' });
        $('taskPanel').append(el('div', { class: 'task-log', hidden: true }, [el('span', { class: 'task-log-title', text: 'Log' }), ui.termLines]));
    }

    // One row per learned skill: its cleared leg laps on its own, adding compute and XP.

    // Advance the job bars (called every tick with the game time that passed).
    function advanceTasks(dt) {
        const d = E.derive(state, debugRates);
        taskProgress.autoCollector = (taskProgress.autoCollector + d.collectsPerSec * dt) % 1;
        taskProgress.researchAssistant = (taskProgress.researchAssistant + d.researchPerSec * dt) % 1;
        // Procurement's bar is its fund against the next buy.
        const p = d.tasks.procurement;
        taskProgress.procurement = p.need ? Math.min(1, p.fund / p.need) : 0;
    }

    // What Procurement bought in a tick (E.tick returns it) goes to the log; the cabinets pick the new pieces up
    // by themselves.
    function logProcurement(bought) {
        if (!bought?.length) return;
        const n = {};
        for (const id of bought) n[id] = (n[id] || 0) + 1;
        for (const [id, k] of Object.entries(n)) {
            termLog(`procurement bought ${k > 1 ? k + '× ' : ''}${E.UPGRADE_BY_ID[id].name}`);
            pt('buy', { id, lvl: E.level(state, id), ...(k > 1 ? { n: k } : {}), auto: true });
        }
    }

    function renderTasks(d) {
        const f = E.format;
        const owned = id => E.level(state, TASK_UPGRADES[id]) > 0;
        const learned = state.path.learned;
        const logged = lab.lines.length > 0 && !!state.unlocked['seen:dp'];
        const any = E.TASKS.some(t => owned(t.id));
        setHidden($('taskPanel'), !any);
        if (!any) return;
        setHidden($('taskPanel').querySelector('.task-log'), !logged);
        // The first time you're in the lab after the first skill, point out where automations show.
        if (any && view === 'lab' && !state.intro['hint:tasks']) {
            state.intro['hint:tasks'] = true;
            callout('hint:tasks', 'Scheduled tasks', 'Every machine working for you is listed here, with its switch and the share of compute it may use.');
        }
        const shares = E.taskShares(state);
        let dedicated = 0;
        for (const t of E.TASKS) {
            const u = taskUi[t.id];
            const was = !u.row.hidden;
            setHidden(u.row, !owned(t.id));
            if (!owned(t.id)) continue;
            // A new automation draws its connection from the card that bought it.
            if (!was && revealReady && ui.upgrades[t.id] && !ui.upgrades[t.id].card.hidden) connect(ui.upgrades[t.id].card, u.row);
            // The first time a machine starts working for you, say what it does and what its slider means.
            const intro = TASK_INTROS[t.id];
            if (intro && view === 'lab' && !state.intro['hint:task:' + t.id]) {
                state.intro['hint:task:' + t.id] = true;
                callout('hint:task:' + t.id, intro[0], intro[1]);
            }
            const on = E.taskOn(state, t.id);
            u.row.classList.toggle('off', !on);
            u.toggle.setAttribute('aria-checked', String(on));
            setText(u.toggle, on ? 'On' : 'Off');
            if (t.id === 'autoCollector') setText(u.rate, on ? `${f(d.collectsPerSec, 2)}/s → +${f(d.dpPerSec)} DP/s` : 'Paused');
            if (t.id === 'researchAssistant') setText(u.rate, on ? `${f(d.researchPerSec, 2)}/s → +${f(d.rpPerSec)} RP/s` : 'Paused');
            if (t.id === 'autoTrainer') {
                const lv = E.level(state, 'autoTrainer');
                setText(u.rate, on ? `Level ${lv} · replays your newest cleared leg in the background` : 'Paused');
            }
            if (t.id === 'procurement') {
                const p = d.tasks.procurement;
                setText(u.rate, !on ? 'Paused' : p.pick ? `Next: ${E.UPGRADE_BY_ID[p.pick].name} · ${f(p.fund)}/${f(p.need)} CP` : 'Idle · hardware at capacity');
            }
            if (u.fill) u.fill.style.width = `${(on ? taskProgress[t.id] : 0) * 100}%`;
            if (!u.slider) continue;
            const pct = Math.round((state.tasks[t.id].share ?? 0) * 100);
            if (document.activeElement !== u.slider) u.slider.value = pct;
            u.slider.disabled = !on;
            u.slider.style.setProperty('--reach', '100%');
            u.slider.style.setProperty('--pct', `${u.slider.value}%`);
            const task = d.tasks[t.id];
            dedicated += on ? shares[t.id] : 0;
            setText(u.share, on ? `${pct}% · ${f(task.cp)} CP/s${task.speed < 1 ? ' · capped' : ''}` : `${pct}%`);
            u.share.classList.toggle('capped', on && task.speed < 1);
        }
        setText($('taskTotal'), dedicated ? `${Math.round(dedicated * 100)}% of compute${dedicated > 1.001 ? ' · drawing on the stockpile' : ''}` : '');
        // Cleared legs' laps used to be rows here too; they live on their lanes in the server room now (the owner's
        // call: nothing here to interact with), drawn by drawClearedLane.
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
            if (window.matchMedia('(max-width: 640px)').matches) {   // one column: no wire across the cards, just the flash
                to.classList.add('task-linked');
                setTimeout(() => to.classList.remove('task-linked'), 1600);
                return;
            }
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

    // Layout rules (the owner's): things stay where they are (the areas keep their places and order), but fill the
    // space they can and give the most room to whatever holds the most right now. A station's column is weighted by
    // the cards it shows, in steps of two (`weightOf`), so one card more doesn't jiggle the floor; the rows split
    // the same way. A change of weights re-lays the floor through makeRoom, so panels slide rather than jump.
    const weightOf = n => Math.max(2, Math.min(10, 2 * Math.ceil(n / 2)));
    const STATION_MIN = 380;   // a card's name, level and price fit (the software terminal, inside its monitor, cut prices off below)
    function labCounts() {
        const cards = id => ui.stations[id].list.querySelectorAll('.upgrade:not([hidden])').length;
        return { hw: cards('hardware'), sw: cards('software'), rs: cards('algorithms'), cs: cards('consciousness'), proj: 3 };
    }
    function layoutLab() {
        const shown = id => !$(id).hidden;
        const tab = id => !ui.stations[id].node.hidden;
        const has = { sw: tab('software'), rs: tab('algorithms'), cs: tab('consciousness'), proj: shown('projectPanel'), tasks: shown('taskPanel') };
        const tier = WIDE.matches ? 'wide' : DESKTOP.matches ? 'desktop' : 'narrow';
        const n = labCounts();
        const w = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, weightOf(v)]));
        const key = `${tier}:${Object.values(has).map(Number).join('')}:${Object.values(w).join('.')}`;
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
            if (has.sw || has.cs) cols.push([has.sw ? 'sw' : 'cs', has.cs ? 'cs' : 'sw']);
            if (has.rs || has.proj) cols.push([has.rs ? 'rs' : 'proj', has.proj ? 'proj' : 'rs']);
            if (has.tasks) cols.push(['tasks', 'tasks']);
            // The bottom row: the cabinets under the Workbench and the hardware bench (they're only as wide as their
            // racks), and the middle columns grow down into the rest instead of leaving it bare (the owner's call).
            // The last column's foot stays free: the minimap sits there.
            const bottom = cols.map((c, i) => (i < 2 ? 'cab' : i === cols.length - 1 && c[0] === 'tasks' ? '.' : c[1]));
            const split = cols.some(c => c[0] !== c[1]);
            // A station column is as wide as its fullest station asks; the upper and lower rows split by what's in them.
            const area = { hw: w.hw, sw: has.sw ? w.sw : 0, cs: has.cs ? w.cs : 0, rs: has.rs ? w.rs : 0, proj: has.proj ? w.proj : 0 };
            const colWeight = c => Math.max(area[c[0]] || 2, area[c[1]] || 2);
            room.style.gridTemplateColumns = cols.map(c => (c[0] === 'bench' || c[0] === 'tasks' ? 'minmax(260px, 300px)' : `minmax(${STATION_MIN}px, ${colWeight(c)}fr)`)).join(' ');
            const splitCols = cols.filter(c => c[0] !== c[1]);
            const top = splitCols.reduce((a, c) => a + (area[c[0]] || 0), 0);
            const low = splitCols.reduce((a, c) => a + (area[c[1]] || 0), 0);
            const ratio = split ? Math.max(0.8, Math.min(2.5, top / Math.max(1, low))) : 1;
            room.style.gridTemplateRows = `auto var(--supply-h) minmax(0, ${ratio.toFixed(2)}fr) ${split ? 'minmax(0, 1fr)' : '0px'} var(--bottom-h)`;
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
        // The cabinets under the first two columns; the third grows down beside them (the owner's call: no bare floor).
        const last = rows[rows.length - 1][2];
        rows.push(['cab', 'cab', last === 'bench' || last === 'hw' ? '.' : last]);
        sizes.push('auto');
        // The two station columns weigh what they hold (the hardware bench and the software terminal on top, the
        // research wall and the Isolation chamber under them).
        const mid = Math.max(w.hw, has.rs ? w.rs : 0);
        const right = has.sw ? Math.max(w.sw, has.cs ? w.cs : 0) : mid;
        room.style.gridTemplateColumns = `minmax(250px, 290px) minmax(${STATION_MIN}px, ${mid}fr) minmax(${STATION_MIN}px, ${right}fr)`;
        room.style.gridTemplateRows = sizes.join(' ');
        room.style.gridTemplateAreas = q(rows);
    }

    // ---- Server room hub ---------------------------------------------------

    // Bays in the server room. Each is a training module; only the Training Cluster is built so far.
    const BAYS = {
        training: { name: 'Training Cluster', built: true, unlocked: () => !!state.unlocked['module:path'],
            lockedText: () => 'Locked' },
        // The Data Pipeline's Packet Snare (packet-snare.js): opens with Edge Detection (engine milestone module:snare).
        pipeline: { name: 'Packet Snare', built: true, unlocked: () => !!state.unlocked['module:snare'] },
        architecture: { name: 'Architecture Lab', phase: 2 },
        core: { name: 'The Core', phase: 3 }
    };
    let openBay = null;

    function bayUnlocked(id) {
        const bay = BAYS[id];
        if (!bay.built) return false;   // unbuilt modules stay sealed: they never say what they'll be
        return bay.unlocked ? bay.unlocked() : E.phaseIndex(state) >= bay.phase;
    }

    // Locked bays never say what they are: the next one is a sealed shutter, the rest blanking plates.
    function nextSealedBay() {
        return Object.keys(BAYS).find(id => !bayUnlocked(id));
    }

    function bayStatus(id) {
        const bay = BAYS[id];
        if (!bayUnlocked(id)) return id === 'training' && bay.lockedText ? bay.lockedText() : 'Sealed';
        if (id === 'pipeline') return snareStatus();
        const learned = state.path.learned;
        const record = Math.round(state.path.best * 100);
        return `${learned} skill${learned === 1 ? '' : 's'} · next: ${E.skillAt(learned).name}${record ? ` · record ${record}%` : ''}`;
    }

    // Packet Snare's bay: a live lane for each sector you've cleared (the last four), its data streaming past while your
    // laser picks at it, like the Training Cluster's lanes; the rest is the disk array.
    const SNARE_LANES = 4;
    let snareLanes = [];
    function buildSnareArt() {
        const art = $('bays').querySelector('.bay[data-bay="pipeline"] .bay-art');
        if (!state) return;   // built again once the save is loaded (renderHub)
        const n = Math.min(state.snare.sector, SNARE_LANES);
        // Rebuilt when a sector is cleared or the tree changes: each lane plays your build on that sector.
        const key = `${state.snare.sector}|${E.SNARE_TREE.map(u => E.level(state, u.id)).join('')}`;
        if (art.dataset.key === key) return;
        art.dataset.key = key;
        art.replaceChildren();
        snareLanes = [];
        for (let i = 0; i < n; i++) {
            const k = state.snare.sector - n + i;
            const o = E.snareOpts(state, k);
            // Your build on a little field: what runs by itself (lasers, turrets, towers, herders, the scanner), no hazards.
            const run = window.PacketSnare.createSnare({ ...o, seed: 101 + k, w: 5.2, h: 2.2, density: 0.6, antivirus: [], sweepFirst: Infinity, idleDrain: 0, focus: 1e9,
                boss: 0, rogue: 0, laser: o.laser || 1.6, corruptShare: o.corruptShare });
            const canvas = el('canvas', { 'aria-hidden': 'true' });
            const wrap = el('span', { class: 'snare-lane', title: `${E.snareSectorName(k)}: cleared` }, [canvas, el('span', { class: 'snare-lane-cap', text: E.snareSectorName(k) })]);
            snareLanes.push({ k, canvas, run, fx: [] });
            art.append(wrap);
        }
        for (let i = 0; i < BAY_ART.pipeline - 6 * n; i++) art.append(el('i'));
    }
    function drawSnareLanes() {
        for (const lane of snareLanes) {
            const c = lane.canvas;
            if (!c.isConnected || !c.clientWidth) continue;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = c.clientWidth, h = c.clientHeight;
            if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
            lane.run.step(0.05);
            for (const f of lane.fx) f.t += 0.05;
            lane.fx = lane.fx.filter(f => f.t < (f.life || SNARE_FX));
            for (const e of lane.run.takeEvents()) snareFxFor(e, lane.fx);
            const k = Math.min(w / lane.run.w, h / lane.run.h);
            drawSnareView(c.getContext('2d'), { run: lane.run, effects: lane.fx, k, ox: (w - lane.run.w * k) / 2, oy: (h - lane.run.h * k) / 2, cw: w, ch: h, dpr, field: lane.run, minR: 2 });
        }
    }

    // How many art pieces each bay's hardware drawing uses (styled per bay in styles.css).
    const BAY_ART = { training: 20, pipeline: 24, architecture: 10, core: 3 };
    // Lanes on the Training Cluster, drawn by drawLanes():
    // - lane 0 (three blade columns) is the current stretch;
    // - then one lane (two columns) per cleared stretch, newest first, up to MAX_CLEARED_LANES: that
    //   section now trains itself, slowly, and its ball crawls along it (E.derive().xpPerSec).
    // Concurrent runs (planned) will add live lanes the same way.
    const MAX_CLEARED_LANES = 8;   // act one has twelve skills: the rack (20 columns) shows the last eight
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
        art.append(el('canvas', { class: 'lane', 'data-lane': 0, title: 'The frontier' }));
        for (let i = 0; i < BAY_ART.training - 3 - 2 * cleared; i++) art.append(el('i'));
        art.dataset.cleared = cleared;
        art.dataset.learned = state.path.learned;
    }

    function buildHub() {
        buildSnareArt();
        for (const node of $('bays').querySelectorAll('.bay')) {
            if (node.dataset.bay === 'training' || node.dataset.bay === 'pipeline') continue;
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
            if (!$('legacyScreen').hidden) { closeLegacy(); return; }
            // Packet Snare backs out one level at a time: the popup, then the tree, then the bay (never a run on one press).
            if (openBay === 'pipeline' && snareEscape()) return;
            if (openBay && view === 'servers') exitBay();
            else zoomOut();
        });
    }

    const reducedMotion = () => !!state?.settings.calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Large screens zoom the whole page (styles.css, --ui-scale). Rects come back in screen pixels,
    // transforms are in page pixels, so divide offsets by this.
    const uiScale = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1) * (state?.settings.textSize || 1);

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
        ptView(`bay:${id}`);
        // A bay you've entered stops wearing its New badge, and the map offers it as a shortcut from now on.
        if (!seenRooms.has(`bay:${id}`)) {
            seenRooms.add(`bay:${id}`);
            storageSet(SEEN_KEY, JSON.stringify([...seenRooms]));
            minimapKey = '';
        }
        const bay = BAYS[id];
        setText($('moduleTitle'), crumbName(bay.name));
        for (const m of document.querySelectorAll('.module')) m.hidden = true;
        if (bay.built) {
            document.querySelector(`.module[data-module="${id}"]`).hidden = false;
            if (id === 'training') showTrainingView(state.stats.rolls > 0 && !(path.roll && path.roll.launched && !path.roll.over) ? 'dev' : 'run');
            if (id === 'pipeline') openSnare();
        } else {
            document.querySelector('.module[data-module="soon"]').hidden = false;
            setText($('soonText'), 'Being built.');
        }
        const hub = $('hub');
        const view = $('moduleView');
        const { bayBox, origin, roomScale } = zoomFrames(bayNode);
        view.hidden = false;
        const done = () => {
            hub.hidden = true;
            (id === 'training' ? (path.view === 'dev' ? $('startRunButton') : $('pushButton')) : id === 'pipeline' ? ($('snareCard').querySelector('button') || $('backButton')) : $('backButton')).focus({ preventScroll: true });
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
        ptView('servers');
        const bayNode = $('bays').querySelector(`.bay[data-bay="${openBay}"]`);
        const hub = $('hub');
        const view = $('moduleView');
        hub.hidden = false;
        if (openBay === 'pipeline') closeSnare();
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
        buildSnareArt();
        const sealed = nextSealedBay();
        for (const node of $('bays').querySelectorAll('.bay')) {
            const id = node.dataset.bay;
            const unlocked = bayUnlocked(id);
            const blank = !unlocked && id !== sealed;
            node.classList.toggle('locked', !unlocked);
            node.classList.toggle('sealed', id === sealed);
            node.classList.toggle('blank', blank);
            node.classList.toggle('offline', unlocked && !BAYS[id].built);
            // New until you've been in: steers a first visit from the server room into the Training Cluster.
            node.classList.toggle('fresh', unlocked && !!BAYS[id].built && !baySeen(id));
            node.tabIndex = blank ? -1 : 0;
            node.setAttribute('aria-disabled', String(!unlocked));
            setText(node.querySelector('.bay-name'), unlocked ? BAYS[id].name : '???');
            node.setAttribute('aria-label', blank ? 'Blank panel' : `${unlocked ? BAYS[id].name : 'Sealed section'}: ${bayStatus(id)}`);
        }
        $('bayTrainingMeter').style.width = `${Math.round(state.path.best * 100)}%`;
        // Packet Snare's bay wears the tree's badge once you've been in, like the Upgrades buttons.
        const pipe = $('bays').querySelector('.bay[data-bay="pipeline"]');
        const ready = bayUnlocked('pipeline') && baySeen('pipeline') && state.snare.runs > 0 ? snareReadyCount() : 0;
        if (ready) pipe.dataset.ready = ready > 9 ? '9+' : String(ready); else delete pipe.dataset.ready;
    }


    // ---- Packet Snare (the Data Pipeline bay) -------------------------------------------------------------
    // packet-snare.js runs the field; this draws it and turns the pointer into the wire. Packets snared pay Signal, the
    // bay's own currency, as they're caught (E.snareCatch: a packet's worth times the loop's multiplier, more on later
    // sectors); the run ends when Focus runs out, and its haul against the version's best is the record (E.finishSnare),
    // which trickles research while you play. Each sector has a boss Antivirus: beat it and the next run is on the next
    // sector. The bay's own skill tree (E.SNARE_TREE, bought with Signal) grows the run from a small quick field into a
    // sprawl with abilities; its options reach the run through E.snareOpts. A mechanic is introduced, once, with a demo
    // the moment it first turns up (the run pauses for it).
    const snare = { preview: false, run: null, raf: 0, last: 0, haul: 0, seed: 1, fx: [], scale: 1, ox: 0, oy: 0, cw: 0, ch: 0, ctx: null, canvas: null,
        cleared: [], startSector: 0, pointer: null, done: null, tree: false, pick: null, sectorPick: null };
    const SNARE_FX = 1.1;        // seconds a catch's loop and pop stay on the field

    function snareStatus() {
        const sector = `Sector ${state.snare.sector + 1}: ${E.snareSectorName(state.snare.sector)}`;
        if (snare.run && !snare.run.over && !snare.preview) return `${sector} · snaring…`;
        const rp = E.derive(state).snareRp;
        return state.snare.best > 0 ? `${sector} · best +${E.format(state.snare.best)} Signal${rp > 0 ? ` · +${E.format(rp, 2)} RP/s` : ''}` : 'Loose data drifting';
    }

    function buildSnare() {
        const canvas = $('snareCanvas');
        snare.canvas = canvas;
        snare.ctx = canvas.getContext('2d');
        new ResizeObserver(() => {
            const dpr = Math.min(2, (window.devicePixelRatio || 1) * uiScale());
            const wrap = canvas.parentElement;
            snare.cw = wrap.clientWidth;
            snare.ch = Math.max(120, wrap.clientHeight);
            canvas.style.height = snare.ch + 'px';
            canvas.width = Math.round(snare.cw * dpr);
            canvas.height = Math.round(snare.ch * dpr);
            // The preview takes the canvas's shape (it was first built before the bay had a size).
            if (snare.preview && openBay === 'pipeline') snarePreview();
            snareFit();
            drawSnare();
        }).observe(canvas.parentElement);
        // The pen: down starts a wire, moving draws it, up closes it near its start or lets it go. One pointer at a time.
        const toWorld = e => {
            const r = canvas.getBoundingClientRect();
            const z = uiScale();
            const sx = (e.clientX - r.left) / z - snare.ox, sy = (e.clientY - r.top) / z - snare.oy;
            // A turned field (see snareFit): screen x runs down the field's height, screen y along its width.
            if (snare.turned && snare.run) return [sy / snare.scale, snare.run.h - sx / snare.scale];
            return [sx / snare.scale, sy / snare.scale];
        };
        snare.toWorld = toWorld;
        // The pen is smoothed as it draws (Snare 11.5, the owner's call): a One Euro filter on the screen position,
        // steady when the pen moves slowly (no shaky wire) and barely behind when it moves fast (a flick stays sharp).
        const PEN_MIN_CUTOFF = 2.5, PEN_BETA = 0.012;   // Hz, and Hz more per px/s of pen speed
        const penAlpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
        const smoothPen = ev => {
            const f = snare.pen;
            if (!f) return ev;
            const dt = Math.max(0.001, (ev.timeStamp - f.t) / 1000);
            f.t = ev.timeStamp;
            // A bubble takes the pen as it is (Snare 13.2, the owner: it lagged behind); the filter keeps up so a stroke
            // that turns into a wire carries on from here without a jump.
            if (snare.run?.bubble) { f.dx = 0; f.dy = 0; f.x = ev.clientX; f.y = ev.clientY; return ev; }
            const a = penAlpha(1, dt);
            f.dx += a * ((ev.clientX - f.x) / dt - f.dx);
            f.dy += a * ((ev.clientY - f.y) / dt - f.dy);
            const k = penAlpha(PEN_MIN_CUTOFF + PEN_BETA * Math.hypot(f.dx, f.dy), dt);
            f.x += k * (ev.clientX - f.x);
            f.y += k * (ev.clientY - f.y);
            return { clientX: f.x, clientY: f.y };
        };
        canvas.addEventListener('pointerdown', e => {
            const run = snare.run;
            // Nothing on the field takes a press under a first-meeting card (the run is paused) or the tree.
            if (!run || run.over || snare.preview || snare.pointer !== null || snare.tree || snare.intro) return;
            // The left button draws; with bubbles on (Snare 12.4–12.6, the owner's calls) the left draws the wire (loops to
            // stun and quarantine, flicks to slash, parry and spoof) and the right holds a bubble; other buttons do nothing.
            const mouse = e.pointerType === 'mouse', bubbles = !!run.opts.bubble && snare.tool === 'lasso';
            if (mouse && !(e.button === 0 || (e.button === 2 && bubbles))) return;
            // A freeze or purge pickup under the tap or click is grabbed (Snare 13), and nothing is drawn
            if (run.pickups?.length) {
                const [gx, gy] = toWorld(e);
                // grabbed, and the press goes on to start a bubble (round 7 of the review: on a busy field pickups ate presses)
                run.grab(gx, gy, (snare.touch || e.pointerType !== 'mouse' ? 18 : 8) / snare.scale);
            }
            e.preventDefault();
            snare.pointer = e.pointerId;
            snare.touch = e.pointerType !== 'mouse';
            snare.down = { x: e.clientX, y: e.clientY, t: performance.now(), far: false, left: mouse && e.button === 0 };
            snare.pen = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, t: e.timeStamp };
            try { canvas.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
            const [x, y] = toWorld(e);
            // The tool in hand: the lasso draws a wire, the Firewall tool drags a section (a new one, or one already down:
            // drag and drop), the others place on a tap.
            if (snare.tool === 'lasso') {
                // The right button holds a bubble, the left draws the wire (the owner's call: taught on the first card, and
                // a still left hold says so, `snareLeftHint`).
                run.setPen?.(bubbles && mouse ? (e.button === 2 ? 'bubble' : 'wire') : null);
                run.addPoint(x, y);
            } else if (snare.tool === 'wall') {
                const z = run.zoneAt(x, y, 8 / snare.scale);
                snare.wallFrom = z ? { id: z.id, dx: x - z.x, dy: y - z.y, x: z.x, y: z.y } : { x, y };
            }
        });
        canvas.addEventListener('pointermove', e => {
            if (e.pointerId !== snare.pointer || !snare.run) return;
            if (snare.down && Math.hypot(e.clientX - snare.down.x, e.clientY - snare.down.y) > 10) snare.down.far = true;
            if (snare.tool === 'wall') {
                const w = snare.wallFrom;
                if (w) {
                    const [x, y] = toWorld(e);
                    w.x = x - (w.dx || 0); w.y = y - (w.dy || 0);
                    if (w.id && snare.down?.far) snare.run.moveZone(w.id, w.x, w.y);
                }
                return;
            }
            if (snare.tool !== 'lasso') return;
            const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (const ev of (list.length ? list : [e])) {
                // After a snap the pen waits out its cooldown, then a fresh wire starts where it is.
                if (!snare.run.addPoint(...toWorld(smoothPen(ev)))) break;
            }
        });
        const lift = e => {
            if (e.pointerId !== snare.pointer) return;
            snare.pointer = null;
            const run = snare.run;
            const d = snare.down;
            snare.down = null;
            const tap = e.type === 'pointerup' && d && !d.far && performance.now() - d.t < 350;
            // A tap's reach: 22 px on screen, whatever the field's size.
            const reach = 22 / snare.scale;
            const [x, y] = toWorld(e);
            // A quick stroke (a flick) ends where the pen really lifted, so smoothing never shortens it.
            if (snare.tool === 'lasso' && run && d && performance.now() - d.t < 450 && e.type === 'pointerup') run.addPoint(x, y);
            snare.pen = null;
            // A still left-button hold with bubbles on: the bubble is the right button (said a few times).
            if (snare.tool === 'lasso' && run?.opts.bubble && d?.left && !d.far && !d.hinted && performance.now() - d.t > 300) snareLeftHint(e);
            if (snare.tool === 'lasso') run?.liftPen();
            else if (snare.tool === 'wall') {
                const w = snare.wallFrom;
                snare.wallFrom = null;
                // A tap on a section takes it back; a drag moves it; a press elsewhere drops a new one where you let go
                // (a cancelled touch does nothing).
                if (run && e.type === 'pointerup' && w) {
                    if (w.id) { if (tap) run.removeAt('wall', x, y, reach); else sfx('snarePlace', { kind: 'wall' }); }
                    else if (!run.placeZone(w.x, w.y)) sfx('error');
                }
            } else if (run && tap) {
                if (!run.removeAt(snare.tool, x, y, reach) && !run.placeAt(snare.tool, x, y)) sfx('error');
            }
            renderSnareTools();
        };
        canvas.addEventListener('pointerup', lift);
        canvas.addEventListener('pointercancel', lift);
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        $('snareTreeStart').addEventListener('click', () => {
            const inRun = snare.run && !snare.run.over && !snare.preview;
            closeSnareTree();
            if (!inRun) startSnare();
        });
        $('snareTreeClose').addEventListener('click', closeSnareTree);
        buildSnareTree();
        document.addEventListener('keydown', snareKeys);
        $('snareDeeper').addEventListener('click', goDeeper);
        $('snarePause').addEventListener('click', openSnareTree);
        $('snareTools').addEventListener('click', e => {
            const b = e.target.closest('[data-tool]');
            if (b) pickSnareTool(b.dataset.tool);
        });
    }

    // The field keeps its shape for the run; the view letterboxes it into the canvas. A phone turned sideways mid-run (or
    // back) would leave an upright field as a strip in a wide canvas (the owner's screenshot), so the view turns the field
    // a quarter turn when that fits it much better (`snare.turned`: drawn rotated, text kept upright, the pen mapped back).
    function snareFit() {
        const run = snare.run;
        const f = run ? run : snareField();
        const flat = Math.min(snare.cw / f.w, snare.ch / f.h), turned = Math.min(snare.cw / f.h, snare.ch / f.w);
        snare.turned = !!run && !snare.preview && turned > flat * 1.15;
        const fw = snare.turned ? f.h : f.w, fh = snare.turned ? f.w : f.h;
        snare.scale = Math.min(snare.cw / fw, snare.ch / fh);
        snare.ox = (snare.cw - fw * snare.scale) / 2;
        snare.oy = (snare.ch - fh * snare.scale) / 2;
    }

    function openSnare() {
        // A run left by another route (the map's jump) ended when you left: settle it now.
        if (snare.run && !snare.run.over && !snare.preview) { snare.run.stop(); snareEvents(); }
        showSnareCard(snare.done ? 'end' : 'start');
        // Before the first run, the field drifts behind the card: no Firewalls, no Focus spent.
        if (!snare.done) snarePreview();
        drawSnare();
    }

    // The field shaped to the canvas (portrait on an upright phone, wide on a sideways one) at the tree's size, but never
    // bigger than the screen shows readably: at least `SNARE_PPU` px a unit, so a packet is never a speck (the owner's
    // call: proportional to the screen, leaning to readability). A packet is worth the same everywhere (the owner's call:
    // a phone's ×15 `worth` is gone); the packets a bigger field would hold fill a capped one more densely instead, up to
    // `densityCap` a unit², so it stays readable. A flick is `SNARE_FLICK` px long, and the loop's closing ring
    // `SNARE_CLOSE` px across, on any field.
    const SNARE_PPU = 20, SNARE_FLICK = 48, SNARE_CLOSE = 36;
    // A mouse is precise, so on a desktop the pen has to come closer to the start before a loop closes (the owner's
    // call: a 36 px ring shut loops early there); fingers keep the 36 px.
    const SNARE_CLOSE_FINE = 26;
    const snareFinePointer = () => matchMedia('(pointer: fine)').matches;
    const snareClosePx = () => (snareFinePointer() ? SNARE_CLOSE_FINE : SNARE_CLOSE);
    // The closing ring can be hidden (Settings, per device).
    const SNARE_RING_KEY = 'agiSnareRing';
    const snareRingOn = () => storageGet(SNARE_RING_KEY) !== '0';
    // Bubbles (a prototype, per device, off by default): hold still to grow a bubble that catches; loops only stun.
    // How to catch (Snare 15, the owner's call: bubbles are the way to catch), for the first card and the first tip.
    const snareHowTo = () => (matchMedia('(pointer: fine)').matches
        ? 'Hold the RIGHT mouse button on the field: a bubble grows, and follows the mouse. Let go to catch what\'s inside. Bigger bubbles pay more; a red packet inside spoils the lot. (The left button draws a line: that\'s for the boss.)'
        : 'Hold still on the field: a bubble grows, and follows your finger. Let go to catch what\'s inside. Bigger bubbles pay more; a red packet inside spoils the lot.');
    function snareField(area = E.snareOpts(state).area, o = null) {
        const aspect = Math.min(3.5, Math.max(0.5, snare.cw / snare.ch || 1.6));
        const cap = snare.cw > 0 && snare.ch > 0 ? Math.max(window.PacketSnare.FIELD_AREA, snare.cw * snare.ch / SNARE_PPU ** 2) : area;
        const a = Math.min(area, cap);
        const w = Math.sqrt(a * aspect), h = a / w;
        const scale = snare.cw > 0 ? Math.min(snare.cw / w, snare.ch / h) : 40;
        const out = { w, h, flickLength: SNARE_FLICK / scale };
        // The closing ring in screen px (round 4: as a share of the field, on a big field small loops never left it).
        const B = window.PacketSnare.SNARE;
        if (snare.cw > 0) out.closeRadius = snareClosePx() * ((o?.closeRadius ?? B.closeRadius) / B.closeRadius) / scale / Math.sqrt(a);
        if (o) {
            // The packets a unit² would hold: a field the screen caps holds them more densely, up to `densityCap`.
            const want = o.density * area / a;
            const cap = Math.min(B.densityCap, B.maxOnScreen / a);
            const dens = Math.min(cap, want);
            if (area > a || want > cap) {
                out.density = dens;
                out.maxGood = Math.max(o.maxGood, Math.round(dens * a));
            }
            // Past the cap, the packets it can't hold come back sooner instead (the owner's call, Snare 10: packet
            // nodes never stop doing something), up to four times as fast…
            if (want > cap) out.respawn = (o.respawn ?? B.respawn) / Math.min(4, want / cap);
            // …and a fuller field draws its packets smaller (never under 0.55 of their size), so it stays readable.
            out.packetR = B.packetR * Math.max(0.55, Math.min(1, Math.sqrt(0.3 / dens)));
        }
        return out;
    }

    function snarePreview() {
        const o = E.snareOpts(state);
        if (snare.canvas) reserveSnareTools(o);
        // The field drifts behind the card with what you placed, but nothing that hunts, sweeps, steals or fires.
        snare.run = window.PacketSnare.createSnare({ ...o, ...snareField(o.area, o), seed: 5, antivirus: [], sweepFirst: Infinity, idleDrain: 0, laser: 0, rogue: 0, boss: 0, turrets: 0 });
        snare.preview = true;
        snareFit();
        snare.last = performance.now();
        cancelAnimationFrame(snare.raf);
        snare.raf = 0;
        if (!reducedMotion() && openBay === 'pipeline') snare.raf = requestAnimationFrame(snareFrame);
    }

    // Leaving the bay ends a run in progress (what it caught is already paid).
    function closeSnare() {
        if (snare.run && !snare.run.over && !snare.preview) {
            snare.walked = true;
            snare.run.stop();
            snareEvents();
        }
        cancelAnimationFrame(snare.raf);
        snare.raf = 0;
        closeSnareTree();
        snareLive(false);
    }

    // The sector the next run is on: the frontier, or a cleared one picked on the start card (a replay pays its own
    // sector's rate and half the bounty).
    const snareNextSector = () => Math.min(state.snare.sector, snare.sectorPick ?? state.snare.sector);
    // Upright phones size the field to what the tool bar leaves (round 3's owner screenshot: a fixed reserve for two rows
    // left an empty band under one). Set before the run's field is shaped, and kept between runs so nothing jumps.
    // Snare 13: tools place themselves and powers are pickups, so the tool bar is only the lasso (hidden)
    const snareAutoTools = o => (o.autoTools ?? window.PacketSnare.SNARE.autoTools) !== 0;
    function reserveSnareTools(o) {
        const n = snareAutoTools(o) ? 1 : 1 + ['firewalls', 'decoys', 'turrets', 'towers', 'freeze', 'purge'].filter(k => o[k] > 0).length;
        const panel = $('snarePanel');
        panel.style.setProperty('--snare-tools-h', `${n < 2 ? 0 : n <= 5 ? 50 : 96}px`);
        const wrap = snare.canvas.parentElement;
        snare.cw = wrap.clientWidth;
        snare.ch = Math.max(120, wrap.clientHeight);
    }
    // On a phone a run takes the screen (the owner's screenshot): the top bar and the bay's bar fold away while a run is
    // in play (`body.snare-live`, styles.css), leaving the HUD's one row (with a pause button) over the field. They come
    // back on the end card, in the tree and when you leave. Set before the field is shaped, so it takes the room.
    function snareLive(on = !!(openBay === 'pipeline' && snare.run && !snare.run.over && !snare.preview && !snare.tree)) {
        document.body.classList.toggle('snare-live', on);
    }
    function startSnare() {
        const sector = snareNextSector();
        const o = E.snareOpts(state, sector);
        // A run that brings a threat not yet met starts from a card that shows it (from an end card's Snare again too).
        if (snareMeetNext().length && snare.done) { snare.done = null; showSnareCard('start'); return; }
        snare.meeting = null;
        snare.why = {};
        snareLive(true);
        reserveSnareTools(o);
        snare.seed = (state.snare.runs * 7919 + Math.floor(state.stats.playTime * 1000)) >>> 0;
        snare.run = window.PacketSnare.createSnare({ ...o, ...snareField(o.area, o), seed: snare.seed });
        snare.sector = sector;
        snare.startSector = sector;
        snare.cleared = [];
        snare.replay = sector < state.snare.sector;
        snare.intro = null;
        snare.tipAfter = 0;
        snare.threatAfter = 0;
        snare.haul = 0;
        snare.fx = [];
        snare.done = null;
        snare.preview = false;
        snare.pointer = null;
        snareFit();
        setHidden($('snareCard'), true);
        setHidden($('snareHud'), false);
        setText($('snareStatus'), '');
        // A toast already up would sit over the field: it goes.
        clearLiveToast();
        sfx('ui');
        snare.last = performance.now();
        cancelAnimationFrame(snare.raf);
        snare.raf = requestAnimationFrame(snareFrame);
        snare.tool = 'lasso';
        snare.wallFrom = null;
        snare.walked = false;
        renderSnareTools();
        // Tools and exploits are met in the tree (their popup plays the demo, and buying one counts as meeting it);
        // first-meeting cards in a run are for the hazards.
    }

    // A still left-button hold with bubbles on: the bubble is the right button (said a few times).
    function snareLeftHint(at) {
        const d = snare.down;
        if (d) d.hinted = true;
        if ((snare.leftHints = (snare.leftHints || 0) + 1) > 4) return;
        if (!snare.toWorld) return;
        const [hx, hy] = snare.toWorld({ clientX: at.clientX ?? at.x, clientY: at.clientY ?? at.y });
        snare.fx.push({ kind: 'flag', x: hx, y: hy - 0.6, t: 0, life: 1.6, text: 'HOLD THE RIGHT BUTTON FOR A BUBBLE' });
    }
    // Why things went wrong in a run, counted for the playtest log (pops and snaps by what did them, boss loops too late or
    // that missed it): the questions the review rounds couldn't answer from a log.
    function snareWhy(key) { (snare.why ||= {})[key] = (snare.why[key] || 0) + 1; return true; }
    function snareFrame(now) {
        const run = snare.run;
        if (!run || openBay !== 'pipeline') {
            // Left the bay without exitBay (a jump from the map): the run ends where it is.
            if (run && !run.over && !snare.preview) { run.stop(); snareEvents(); }
            snare.raf = 0;
            return;
        }
        const dt = Math.min(0.1, (now - snare.last) / 1000);
        snare.last = now;
        // round 6 of the review: the left-button hint came only on the lift; it shows while the still press is held
        const d = snare.down;
        if (d?.left && !d.far && !d.hinted && snare.tool === 'lasso' && run.opts.bubble && now - d.t > 350) snareLeftHint(d);
        if (snare.preview) {
            run.step(dt);
            run.takeEvents();
            drawSnare();
            snare.raf = requestAnimationFrame(snareFrame);
            return;
        }
        // Paused while the page is hidden, a dialog (the Journal, the inbox) is open, or the tree is up mid-run.
        const paused = document.hidden || snare.tree || !!snare.intro || !!document.querySelector('dialog[open]') || !$('legacyScreen').hidden;
        if (paused) {
            snare.raf = requestAnimationFrame(snareFrame);
            return;
        }
        run.step(dt);
        for (const f of snare.fx) f.t += dt;
        snare.fx = snare.fx.filter(f => f.t < (f.life || SNARE_FX));
        snareEvents();
        drawSnare();
        renderSnareHud();
        if (run.over && !snare.fx.length) { snare.raf = 0; return; }
        snare.raf = requestAnimationFrame(snareFrame);
    }

    // Pays a catch in Signal at the sector the run started on.
    const snarePay = units => {
        const pay = E.snareCatch(state, units, snare.sector);
        snare.haul += pay;
        return pay;
    };

    function snareEvents() {
        const run = snare.run;
        if (!run) return;
        const shake = life => { if (state.settings.shake && !reducedMotion()) snare.fx.push({ kind: 'shake', t: 0, life }); };
        for (const e of run.takeEvents()) {
            const t = e.type;
            if (t === 'catch') {
                // A scribbled loop (closed moments after the last on the same stroke) pays half, and says so.
                snareFxFor(e, snare.fx, `+${E.format(snarePay(e.units))}${e.hasty ? ' · RUSHED ×½' : e.safe ? ' · SAFE' : ''}${e.cleanRun >= 2 ? ` · STREAK ${e.cleanRun}` : ''}`);
                sfx('snareCatch', { mult: e.mult });
                if (e.chained.length) sfx('snareChain');
                snare.tipAfter = Math.max(snare.tipAfter || 0, run.real + 1);
                snare.threatAfter = Math.max(snare.threatAfter || 0, run.real + 0.8);
            } else if (t === 'laser') {
                snareFxFor(e, snare.fx, `+${E.format(snarePay(e.units))}`);
                sfx('snareLaser');
            } else if (t === 'taken') {
                snareFxFor(e, snare.fx, `+${E.format(snarePay(e.units))}`);
                sfx('snareTaken');
            } else if (t === 'garbage') {
                snareFxFor(e, snare.fx, `${e.count} DELETED · +${Math.round(e.focus)} Focus`);
                sfx('snareGarbage');
            } else if (t === 'quarantine') {
                snareFxFor(e, snare.fx, `${e.partner ? 'PARTNER' : 'QUARANTINED'} +${E.format(snarePay(e.units))}`);
                sfx('snareQuarantine', { partner: !!e.partner });
                shake(0.2);
            } else if (t === 'bossDown' || t === 'goal') {
                clearSnareSector(run, e, t === 'bossDown');
            } else if (t === 'sector') {
                // The run goes on into the next sector: its hazards come in from now, and Focus is topped up.
                snare.fx.push({ kind: 'quarantine', x: run.w / 2, y: run.h * 0.62, r: 1, t: 0, life: 1.6, text: `${snareSector(snare.sector).toUpperCase()}${e.boss ? ' · BOSS' : ''}`, big: true });
                // Gone deeper into red before meeting it on a card: its tip now.
                if (run.opts.corruptShare > 0) snareIntro('red');
            } else if (t === 'end') {
                endSnare(e.stats, e.layout);
            } else {
                snareFxFor(e, snare.fx);
                // why things failed, for the playtest log (`why` on the run's `snare` event)
                if (t === 'bossLoop' && e.late) snareWhy('loopTooLate');
                if (t === 'loopOnly' && run.boss) snareWhy('loopMissedBoss');
                if (t === 'corrupt') sfx('snareSpoil');
                else if (t === 'spawn') snare.fx.push({ kind: 'placed', x: e.x, y: e.y, t: 0, life: 0.6 });
                else if (t === 'pickupHere') sfx('snarePlace', { kind: 'decoy' });
                else if (t === 'pickup') { snare.fx.push({ kind: 'stun', x: e.x, y: e.y - 0.8, t: 0, life: 1, text: e.kind === 'freeze' ? 'FROZEN' : 'PURGED', small: true }); }
                else if (t === 'snap') { sfx('snareSnap'); shake(0.25); snareFxFor(e, snare.fx); snareWhy(`${e.bubble ? 'pop' : 'snap'}:${e.by || 'wire'}`); }
                // Bubbles (the prototype): a loop that only snared packets says what loops are for now (a few times a page)
                else if (t === 'loopOnly' && (snare.loopHints = (snare.loopHints || 0) + 1) <= 4) snare.fx.push({ kind: 'flag', x: e.x, y: e.y - 0.6, t: 0, life: 1.6, text: 'LOOPS ARE FOR THE BOSS · HOLD STILL TO CATCH', small: true });
                else if (t === 'antivirus') snareIntro('antivirus');
                else if (t === 'core') { sfx('snareCore'); snareIntro('rogue'); }
                else if (t === 'stun') sfx('snareStun', { down: !!e.down });
                else if (t === 'sweep') { sfx('snareSweep'); snareIntro('sweep'); }
                else if (t === 'boss') { sfx('snareBoss'); snareIntro('boss'); if (e.enraged) shake(0.3); if (e.focus) snare.fx.push({ kind: 'banner', centre: true, x: e.x, y: e.y, t: 0, life: 1.6, text: `BOSS ONLINE · +${e.focus} s FOCUS`, big: true }); }
                else if (t === 'bossCharge') sfx('snareCharge');
                else if (t === 'parry') { sfx('snareParry'); shake(0.2); state.intro['snare:parried'] = true; }
                else if (t === 'fizzle') snare.fx.push({ kind: 'flag', x: e.x, y: e.y - 0.6, t: 0, life: 0.9, text: e.bubble ? 'HOLD LONGER' : 'TOO SMALL TO LOOP', small: true });
                else if (t === 'bossLoop') { sfx('snareStun', { down: false }); snare.fx.push({ kind: 'stun', x: e.x, y: e.y - 1.2, t: 0, life: 0.9, text: `LOOP ${e.n}/${e.of} · AGAIN!`, small: true }); }
                else if (t === 'bossLooped') { sfx('snareParry'); shake(0.25); state.intro['snare:looped'] = true; snare.fx = snare.fx.filter(f => !/^LOOP \d/.test(f.text || '')); snare.fx.push({ kind: 'stun', x: e.x, y: e.y - 1.2, t: 0, life: 1, text: 'STUNNED', small: true }); }
                else if (t === 'slash' && e.shielded) sfx('snareStun', { down: false });
                else if (t === 'bossHit') { sfx(e.how === 'ram' ? 'snareHit' : 'snareSlash'); shake(0.25); }
                else if (t === 'bossBlock') sfx('snareFlag', { flags: 1, limit: 3 });
                else if (t === 'mine') { sfx('snareCore'); snareIntro(run.opts.bossMines >= 3 ? 'nets' : 'mines'); }
                else if (t === 'mineDown' && !e.boss) sfx('snareQuarantine', { partner: false });
                else if (t === 'netted') sfx('snareZap');
                else if (t === 'nova') { sfx('snarePower', { kind: 'freeze' }); shake(0.35); }
                else if (t === 'split') sfx('snareChain');
                else if (t === 'raceTick') sfx('snareRace', { step: Math.min(8, Math.round(e.bonus / e.max * 8)) });
                else if (t === 'mineGrab') { sfx('snareHijack'); state.intro['snare:grabbed'] = true; }
                else if (t === 'mineThrow') { sfx('snareHit'); shake(0.35); }
                else if (t === 'mineLive') sfx('snareCore');
                else if (t === 'escalate') sfx('snareHijack');
                else if (t === 'storm') { sfx('snarePower', { kind: 'freeze' }); shake(0.25); }
                else if (t === 'surge') { sfx('snarePower', { kind: 'purge' }); shake(0.2); }
                else if (t === 'pulse') sfx('snareChain');
                else if (t === 'cleanSweep') sfx('snarePower', { kind: 'freeze' });
                else if (t === 'relay') sfx('snareDecoy');
                else if (t === 'backpressure') sfx('snareZap');
                else if (t === 'raceBroken') { sfx('snareSnap'); shake(0.25); }
                else if (t === 'zoneDown') { sfx('snareStun', { down: true }); shake(0.2); }
                else if (t === 'cleaned') sfx('snareGarbage');
                else if (t === 'botSpoof') sfx('snareSpoof');
                else if (t === 'shoved') sfx('snareHit');
                else if (t === 'gilded') sfx('snareCatch', { mult: 3 });
                else if (t === 'autoZone') sfx('snarePlace', { kind: 'wall' });
                else if (t === 'convert') sfx('snareSpoof');
                else if (t === 'spoof') sfx('snareSpoof');
                else if (t === 'flag') {
                    sfx('snareFlag', { flags: e.flags, limit: e.limit });
                    const at = e.b || e.a || { x: run.w / 2, y: run.h / 2 };
                    snare.fx.push({ kind: 'flag', x: at.x, y: at.y - 0.6, t: 0, life: 1.4, text: `⚑ FLAGGED ${e.flags}/${e.limit}`, small: true });
                }
                else if (t === 'ids') { sfx('snareIds'); shake(0.35); snareIntro('ids'); }
                else if (t === 'raceStart') snare.raceStep = 0;
                else if (t === 'hijack') sfx('snareHijack');
                else if (t === 'rebuilt') sfx('snareRebuild');
                else if (t === 'herdStun') sfx('snareHerdStun');
                else if (t === 'place') sfx('snarePlace', { kind: e.kind });
                else if (t === 'remove') sfx('snareRemove');
                else if (t === 'power') sfx('snarePower', { kind: e.kind });
                else if (t === 'zap') sfx('snareZap');
                else if (t === 'avDown') { sfx('snareHit'); shake(0.15); }
                else if (t === 'decoyGone') sfx('snareDecoy');
            }
        }
    }

    // ---- First meetings: each mechanic is introduced once, with a demo, the moment it turns up (the run pauses) ----
    // Keyed by the demo they show (snare-demos.js).
    const SNARE_INTROS = {
        lasso: ['Packet Snare', 'Hold still on the field: a bubble grows. Let go to catch what\'s inside. Bigger bubbles pay more; a red packet inside spoils the lot.'],
        red: ['Red packets', 'They\'re corrupt. Let go of a bubble with one inside and the whole catch spoils, and you lose Focus. Catch round them.'],
        antivirus: ['Antivirus', 'It hunts your bubbles. If it touches one, it pops and you lose the catch. Let go before it reaches you.'],
        sweep: ['Full Scan', 'Its edge flashes, then it sweeps the whole field. Any bubble it crosses pops.'],
        boss: ['Boss Antivirus', () => `1. Draw a loop round it twice without touching it (${snareFinePointer() ? 'drag with the left button; ' : ''}easiest while it stands still to charge): it's stunned. 2. While it reads SLASH!, swipe through it, again and again. Clear its health to clear the sector.`],
        mines: ['Mines', 'The boss lays mines. Two near each other grow a net that wipes the data it crosses, and while two stand the boss is shielded. Let a bubble go over a mine to grab it, then flick from it at the boss: a big hit, even through its guard.'],
        nets: ['Nets', 'Three mines now: once their nets join up, everything inside the triangle is wiped. Grab the mines with bubbles before the nets close, and throw them back.'],
        rogue: ['The Rogue AI', 'Its cores grow and take the data they reach. Let a bubble go over a core to quarantine it; your Firewall sections keep it off the data inside them.'],
        firewall: ['Firewalls', 'Sections now place themselves where the good packets gather. Red packets can\'t get in, and Antivirus can\'t either: bubble inside one safely. Each stands a while, then moves on.'],
        decoy: ['Decoys', 'Decoys now appear by themselves near the red packets. Corrupt packets and idle Antivirus go to them; the boss smashes one it sits on.'],
        turret: ['Turrets', 'Turrets now appear by themselves where Antivirus hunt. On its beat each shoots an Antivirus in reach (three hits and it\'s down for a while), else a red packet.'],
        tower: ['Scanner towers', 'Towers now appear by themselves in the busiest currents. Their beam tags what passes: tagged packets are worth more for a moment.'],
        freeze: ['Freeze Frame', 'Now and then a Freeze pickup drifts in: tap or click it and the field stops. Nothing moves and nothing comes due, but the boss can\'t be hit while it holds.'],
        purge: ['Purge', 'Now and then a Purge pickup drifts in, near the red packets: tap or click it and every corrupt packet on the field is wiped.'],
        gc: ['Garbage Collection', 'A bubble round nothing but corrupt packets deletes them and gives Focus back.'],
        ids: ['IDS alert', 'Three flagged exploits: the intrusion detection system noticed. A flick that goes near something and misses it is flagged; one through empty field isn\'t.']
    };
    // The first threat the next run brings that hasn't been met, to show on its start card.
    // Look out cards (the owner's call after the review rounds): every threat a sector brings that hasn't been met is
    // shown before the run (or the Go deeper) that brings it, never mid-run.
    // The threats a sector brings, and those not met yet.
    function snareBrings(sector) {
        const o = E.snareOpts(state, sector);
        const brings = { red: o.teachRed > 0 || o.corruptShare > 0, antivirus: o.antivirus?.length > 0, sweep: o.sweepFirst < Infinity, boss: o.boss > 0,
            mines: o.bossMines > 0, nets: o.bossMines >= 3, rogue: o.rogue > 0 };
        return ['red', 'antivirus', 'sweep', 'boss', 'mines', 'nets', 'rogue'].filter(k => brings[k]);
    }
    const snareMeetFor = sector => snareBrings(sector).filter(k => !state.intro[`snare:intro:${k}`]);
    const snareMeetNext = () => snareMeetFor(snareNextSector());
    // The threats on a look out card: each its line and demo.
    // a tip's text (some read the pointer: round 6 of the review, a phone was told to drag with the left button)
    const snareIntroLine = k => (typeof SNARE_INTROS[k][1] === 'function' ? SNARE_INTROS[k][1]() : SNARE_INTROS[k][1]);
    const snareMeetParts = (kinds, prefix = 'Look out · ') => kinds.flatMap(k => [el('p', { class: 'snare-intro-line snare-red-line', text: `${prefix}${SNARE_INTROS[k][0]}: ${snareIntroLine(k)}` }),
        snareDemo(SNARE_INTRO_DEMO[k] || k)]).filter(Boolean);
    // Going deeper into a sector with a threat not yet met: its look out card first, then on (the run waits on it).
    function snareLookOut(kinds, then) {
        const card = $('snareCard');
        snare.intro = 'lookout';
        for (const k of kinds) state.intro[`snare:intro:${k}`] = true;
        if (snare.pointer !== null) { snare.pointer = null; snare.run?.cancelPen(); }
        const go = el('button', { type: 'button', class: 'button tip-ok', text: 'Go deeper' });
        go.addEventListener('click', () => {
            snare.intro = null;
            card.classList.remove('snare-intro');
            setHidden(card, true);
            snare.last = performance.now();
            then();
        });
        card.classList.add('snare-intro');
        card.replaceChildren(el('div', { class: 'result-title', text: '⚠ Look out' }), el('div', { class: 'result-main', text: snareSector(snare.sector + 1) }),
            ...snareMeetParts(kinds, ''), el('div', { class: 'result-actions' }, [go]));
        setHidden(card, false);
        pt('tip', { id: `snare:lookout:${kinds.join(',')}` });
        go.disabled = true;
        setTimeout(() => { go.disabled = false; }, 700);
    }
    // A tip waits this long after a catch (its pop reads first) and after the last tip closed, in run seconds.
    // A threat's tip isn't held (round 2 of the review: tips came after the threat had already hurt you): only the pen holds it.
    const SNARE_THREATS = new Set(['antivirus', 'sweep', 'boss', 'mines', 'nets', 'rogue', 'ids', 'red']);
    // Threats wait less (round 3: but not on each other's heels, nor over a payoff): `threatAfter`.
    const snareTipHeld = kind => !!snare.run && snare.run.real < ((SNARE_THREATS.has(kind) ? snare.threatAfter : snare.tipAfter) || 0);
    // Cards that show another card's demo.
    const SNARE_INTRO_DEMO = { nets: 'mines', red: 'spoil' };
    function snareIntro(kind) {
        const key = `snare:intro:${kind}`;
        if (state.intro[key] || snare.preview || !SNARE_INTROS[kind]) return;
        // Never mid-stroke (Snare 15, the owner's call: a tip shouldn't cost a bubble): it waits for the pen to lift. Nor
        // over a catch's pop, nor hard on the last tip's heels (round 1 of the review: three tips in 8 s on boss sectors).
        // A threat's tip shows the moment the threat does (round 4 of the review, all three: held for the pen, it came
        // after the threat had already hurt you): a bubble held then is let go, and pays, rather than lost.
        const threat = SNARE_THREATS.has(kind) && !!snare.run && !snare.run.over;
        if (threat && (snare.pointer !== null || snare.run.drawing)) {
            if (snare.run.bubble?.growing) snare.run.liftPen(); else snare.run.cancelPen();
            snare.pointer = null;
            snare.wallFrom = null;
            state.intro[key] = true;
            snareEvents();
        } else if (snare.pointer !== null || snare.run?.drawing || (!threat && snareTipHeld(kind))) {
            if (!(snare.introWait ||= []).includes(kind)) snare.introWait.push(kind);
            return;
        }
        state.intro[key] = true;
        // Two at once (an Antivirus and a sweep on the same frame): the second waits for the first.
        if (snare.intro) { (snare.introQueue ||= []).push(kind); return; }
        // The pen is taken away without judging the stroke (a lift could close a half-loop or flag a flick).
        if (snare.pointer !== null) { snare.pointer = null; snare.run?.cancelPen(); snare.wallFrom = null; }
        snare.intro = kind;
        const title = SNARE_INTROS[kind][0], line = snareIntroLine(kind);
        const card = $('snareCard');
        const label = TIP_OK[tipCount++ % TIP_OK.length];
        const ok = el('button', { type: 'button', class: 'button tip-ok', text: label, 'aria-label': `${label}: got it` });
        ok.addEventListener('click', () => {
            snare.intro = null;
            if (snare.run) { snare.tipAfter = snare.run.real + 3; snare.threatAfter = snare.run.real + 2.5; }
            card.classList.remove('snare-intro');
            setHidden(card, true);
            snare.last = performance.now();
            const next = snare.introQueue?.shift();
            if (next) { state.intro[`snare:intro:${next}`] = false; (snare.introWait ||= []).unshift(next); }
        });
        // A tip, not a run's card: the green ↻ header like every tip in the game.
        card.classList.add('snare-intro');
        card.replaceChildren(el('div', { class: 'result-title', text: '↻ New' }), el('div', { class: 'result-main', text: title }),
            ...[snareDemo(SNARE_INTRO_DEMO[kind] || kind)].filter(Boolean), el('p', { class: 'snare-intro-line', text: line }), el('div', { class: 'result-actions' }, [ok]));
        setHidden(card, false);
        pt('tip', { id: key });
        ok.disabled = true;
        setTimeout(() => { ok.disabled = false; }, 700);
    }

    // A sector cleared mid-run, by its boss or its goal: the engine pays the bounty and moves the frontier on, the run
    // tops Focus up, and you keep gathering there (the owner's call); Go deeper takes the run on into the next sector
    // when you choose (`goDeeper`), else the next run starts there.
    function clearSnareSector(run, e, boss) {
        const cleared = snare.sector;
        const replay = cleared < state.snare.sector;
        const pay = boss ? E.snareBossDown(state, cleared) : E.snareGoalMet(state, cleared);
        snare.haul += pay;
        snare.cleared.push(cleared);
        snare.threatAfter = Math.max(snare.threatAfter || 0, run.real + 1.5);
        // Big, centred, with a flash (round 3 of the review: a small blue line like every other pop).
        snare.fx.push({ kind: 'banner', centre: true, huge: true, x: e.x, y: e.y, t: 0, life: 2, text: `${boss ? 'BOSS DOWN' : 'SECTOR CLEARED'} +${E.format(pay)}${e.focus > 0 ? ` · +${e.focus} s FOCUS` : ''}` });
        if (!reducedMotion()) snare.fx.push({ kind: 'flash', gold: true, t: 0, life: 0.35 }, { kind: 'wave', t: 0, life: 1.2 });
        sfx('snareBossDown');
        if (shakeOn()) snare.fx.push({ kind: 'shake', t: 0, life: boss ? 0.4 : 0.3 });
        if (!replay) log(boss ? `Packet Snare: the boss of sector ${cleared + 1} (${E.snareSectorName(cleared)}) is down. Next: ${E.snareSectorName(cleared + 1)}.`
            : `Packet Snare: sector ${cleared + 1} (${E.snareSectorName(cleared)}) cleared, ${run.opts.goal} packets caught. Next: ${E.snareSectorName(cleared + 1)}.`, 'success');
        pt(boss ? 'snareBoss' : 'snareGoal', { sector: cleared + 1, secs: Math.round(run.time), replay });
        snare.sectorPick = null;
        buildSnareArt();
        save();
        renderSnareHud();
    }
    // Go deeper: a cleared sector's run moves on into the next (its hazards from now, its goal or boss).
    const snareCleared = run => !!run && !run.over && !snare.preview && (run.goalDone || run.bossDone);
    function goDeeper() {
        const run = snare.run;
        if (!snareCleared(run) || snare.intro) return;
        const meet = snareMeetFor(snare.sector + 1);
        if (meet.length) { snareLookOut(meet, goDeeper); return; }
        snare.sector++;
        run.nextSector(E.snareOpts(state, snare.sector));
        pt('snareDeeper', { sector: snare.sector + 1, secs: Math.round(run.time), focus: Math.round(run.focus) });
        sfx('ui');
        snareEvents();
        renderSnareHud();
    }

    function endSnare(stats, layout) {
        snare.raceStep = 0;
        const res = E.finishSnare(state, snare.haul, layout, stats);
        snare.done = { stats, haul: snare.haul, record: res.record, first: res.first, prev: res.prev, sector: snare.sector, startSector: snare.startSector, cleared: snare.cleared.slice(), walked: !!snare.walked,
            replay: !!snare.replay, goal: snare.run?.opts.goal || 0, goalDone: !!snare.run?.goalDone, goalAt: Math.floor(snare.run?.goalProgress?.() || 0),
            bossMax: snare.run?.boss?.maxHp || 0, bossLeft: snare.run?.boss?.hp ?? 0, boss: !!snare.run?.opts.boss && !snare.run?.bossDone };
        snare.walked = false;
        snare.pointer = null;
        snareLive(false);
        setHidden($('snareHud'), true);
        setText($('snareStatus'), '');
        renderSnareTools();
        pt('snare', { haul: Math.round(snare.haul), sector: snare.sector + 1, startSector: snare.startSector + 1, sectorsCleared: snare.cleared.length, bosses: stats.bosses, bossHits: stats.bossHits, wiped: stats.wiped,
            catches: stats.catches, caught: stats.caught, gold: stats.gold, corrupted: stats.corrupted,
            snaps: stats.snaps, empty: stats.empty, bestMult: r2(stats.bestMult), chained: stats.chained, lasered: stats.lasered, scrubbed: stats.scrubbed,
            cores: stats.cores, stolen: stats.stolen, quarantined: stats.quarantined, bounces: stats.bounces, stuns: stats.stuns, fwLost: stats.fwLost, sweeps: stats.sweeps,
            turreted: stats.turreted, purged: stats.purged, freezes: stats.freezes, decoysLost: stats.decoysLost, tagged: stats.tagged, escaped: stats.escaped,
            herdStuns: stats.herdStuns, avDown: stats.avDown, flags: stats.flags, ids: stats.ids, parries: stats.parries, slashes: stats.slashes, spoofed: stats.spoofed, collected: stats.collected,
            raced: stats.raced, hijacked: stats.hijacked, partners: stats.partners, partnered: stats.partnered,
            bossDamage: stats.bossDamage, bossHp: snare.run?.opts.boss || 0, goal: snare.run?.opts.goal || 0, goalDone: !!snare.run?.goalDone, glanced: stats.glanced, mines: stats.mines, minesCleared: stats.minesCleared, netted: stats.netted,
            // the helpers' work and why things failed (the review rounds' open questions)
            bounced: stats.bounced || 0, helpers: snare.run.bots?.length || 0, why: snare.why || {},
            escalations: stats.escalations, forks: stats.forks, stars: stats.stars, packets: snare.run.packets.length,
            // The field as it played (Snare 10; the outside review's audit): packets a unit², how soon they came back, their
            // size, red per good packet, and the capstones at work.
            density: r2(snare.run.opts.density), respawn: r2(snare.run.opts.respawn), packetR: r2(snare.run.opts.packetR), redPerGood: r2(snare.run.opts.corruptShare), reds: snare.run.packets.filter(p => p.kind === 'corrupt').length,
            echoes: stats.echoes, storms: stats.storms, surges: stats.surges, cleaned: stats.cleaned, botSpoofed: stats.botSpoofed, botCollected: stats.botCollected, gilded: stats.gilded,
            pushedOut: stats.pushedOut, autoZones: stats.autoZones, pulses: stats.pulses, sweepsClean: stats.sweepsClean,
            relayed: stats.relayed, pushedBack: stats.pushedBack, raceBroken: stats.raceBroken, crashes: stats.crashes, converted: stats.converted,
            // the bubble prototype: on for this run, and how many bubbles caught
            bubbles: stats.bubbles, minesGrabbed: stats.minesGrabbed, mineThrows: stats.mineThrows, spent: Math.round(state.snare.earned - state.snare.signal),
            area: Math.round(snare.run.w * snare.run.h), replay: !!snare.replay, secs: Math.round(snare.run.time), record: res.record, seed: snare.seed });
        log(`Packet Snare: +${E.format(snare.haul)} Signal from ${stats.caught} packet${stats.caught === 1 ? '' : 's'}${res.record ? ' · new record' : ''}.`, res.record ? 'success' : 'info');
        sfx(res.record ? 'record' : 'runEnd');
        if (openBay === 'pipeline') showSnareCard('end');
        save();
    }

    // How many tree nodes Signal can buy now: the badge on every Packet Snare Upgrades button, the rack's bay and the map.
    const snareReadyCount = () => E.SNARE_TREE.filter(up => E.isUpgradeVisible(state, up) && !E.isMaxed(state, up) && E.canAfford(state, E.upgradeCost(up, E.level(state, up.id)))).length;

    function snareUpgradesButton() {
        const b = el('button', { type: 'button', class: 'ghost-button snare-upgrades', text: 'Upgrades', onclick: openSnareTree });
        const n = snareReadyCount();
        if (n) b.dataset.ready = String(n);
        return b;
    }

    // A gate sector (the boss's new trick and half again its health) says so.
    // A skill's Packet Snare buff, on its Skill learned card once the bay is open (it never names the bay before).
    const snareSkillLine = skill => (state.unlocked['module:snare'] && E.SNARE_SKILL_BUFFS[skill.name] ? [[`Packet Snare: ${E.SNARE_SKILL_BUFFS[skill.name].text}`, 'key']] : []);
    // What your training gives you here, on the start card: how many skills, and the newest.
    const snareTrainingLine = () => {
        const b = E.snareSkillBuffs(state);
        return b.length ? ['From your training', `${b.length} skill${b.length === 1 ? '' : 's'} · ${b.at(-1).text}`] : null;
    };
    const snareSector = k => `Sector ${k + 1}: ${E.snareSectorName(k)}${E.SNARE_GATES.includes(k) ? ' · Gate' : ''}`;
    // What clears a sector: its boss every fifth sector, else a goal of packets in one run.
    // goals with thousands separators, and the loop bonus in plain words (round 7 of the review: "catch 35185" and
    // "(a ×2 bubble counts its packets 1.5×)" didn't read)
    const goalNum = n => Math.round(n).toLocaleString('en-US');
    const snareGoalText = k => (E.isSnareBossSector(k) ? 'A boss guards this sector: beat it to clear it' : `Clear it: catch ${goalNum(E.snareGoal(k))} in one run${' (big bubbles count extra toward it)'}`);
    // What the best haul feeds: research, a trickle while you play.
    const snareRpLine = () => {
        const rp = E.derive(state).snareRp;
        return rp > 0 ? ['Research from your best haul', `+${E.format(rp, 2)} RP/s`, 'key'] : null;
    };

    // Once a sector is cleared, the start and end cards pick the next run's sector: the frontier first, then the cleared
    // ones to replay (their own pay, half the bounty), like the Training Cluster's Start at.
    function snareSectorPicker() {
        const top = state.snare.sector;
        if (top < 1) return null;
        const pick = el('select', { class: 'snare-sector-pick', 'aria-label': 'Sector' });
        for (let k = top; k >= 0; k--) {
            pick.append(el('option', { value: String(k), text: k === top ? `Frontier · ${snareSector(k)}` : `Replay · ${snareSector(k)}` }));
        }
        pick.value = String(snareNextSector());
        pick.addEventListener('change', () => {
            snare.sectorPick = Number(pick.value) >= top ? null : Number(pick.value);
            pt('snareSector', { sector: Number(pick.value) + 1 });
            const title = $('snareCard').querySelector('.result-title');
            if (title && !snare.done) title.textContent = snareSector(snareNextSector());
            const goal = $('snareCard').querySelector('.snare-goal-line');
            if (goal) goal.textContent = snareGoalText(snareNextSector());
        });
        return el('label', { class: 'snare-sector-row' }, [el('span', { text: 'Start at' }), pick]);
    }

    function showSnareCard(kind) {
        const card = $('snareCard');
        const best = state.snare.best;
        if (kind === 'start') {
            // The first visit: what to do, shown (the AI's mail says why).
            const first = state.snare.runs === 0;
            if (first) state.intro['snare:intro:lasso'] = true;
            // Look out: every threat the next run brings that hasn't been met, with its demo (the owner's call after the
            // review rounds: threats are met before a run, never mid-run); the same ones again if the card is rebuilt
            // before the run starts. The first run's card has the bubble, then the red packet.
            // (kept for the sector it was made for: switching Start at between a replay and the frontier kept the replay's
            // empty list, so the boss's tip came mid-fight; found by tools/review/report.js)
            const at = snareNextSector();
            const meet = snare.meeting?.sector === at ? snare.meeting.kinds : snareMeetNext();
            snare.meeting = { sector: at, kinds: meet };
            const meetRed = meet.length > 0;
            for (const k of meet) state.intro[`snare:intro:${k}`] = true;
            card.replaceChildren(...[
                el('div', { class: 'result-title', text: snareSector(snareNextSector()) }),
                el('div', { class: 'result-main', text: 'Packet Snare' }),
                snareSectorPicker(),
                el('p', { class: 'snare-intro-line snare-goal-line', text: snareGoalText(snareNextSector()) }),
                // the demo's caption would say again what the line under it says (round 2 of the review)
                first ? (d => (d?.querySelector('figcaption')?.remove(), d))(snareDemo('lasso')) : null,
                first ? el('p', { class: 'snare-intro-line', text: snareHowTo() }) : null,
                ...snareMeetParts(meet),
                state.snare.runs < 3 && !first && !meetRed ? el('p', { class: 'snare-intro-line', text: snareHowTo() }) : null,
                best > 0 ? el('ul', { class: 'result-lines' }, [['Best haul', `+${E.format(best)} Signal`], snareRpLine(), snareTrainingLine()].filter(Boolean)
                    .map(([a, b]) => el('li', {}, [el('span', { text: a }), el('span', { text: b })]))) : null,
                el('div', { class: 'result-actions' }, [el('button', { type: 'button', class: 'button', text: 'Start', onclick: startSnare }), state.snare.runs > 0 ? snareUpgradesButton() : null].filter(Boolean))].filter(Boolean));
        } else {
            const d = snare.done;
            const s = d.stats;
            // Folded like the trail's card: the first lines and the key ones show, the rest under Details.
            const lines = [
                // The goal as the HUD counted it (a blind playtest: "Goal 59/70" on the HUD, "36 packets snared" here).
                d.goal && !d.goalDone ? ['Goal', `${goalNum(Math.min(d.goalAt, d.goal))}/${goalNum(d.goal)}`, d.goal - d.goalAt <= d.goal * 0.15 ? 'key' : ''] : null,
                d.cleared.length ? [d.cleared.length === 1 ? 'Sector cleared' : `${d.cleared.length} sectors cleared`,
                    Array.from({ length: d.sector - d.startSector + 1 }, (_, i) => d.startSector + i).map(k => E.snareSectorName(k) + (d.cleared.includes(k) ? ' ✓' : '')).join(' → '), 'key'] : null,
                [s.bubbles ? 'Catches' : 'Loops closed', `${s.catches}`],
                s.bestMult >= 1.05 ? [s.bubbles ? 'Biggest catch' : 'Biggest loop', `×${s.bestMult.toFixed(1)}`] : null,
                s.corrupted ? ['Corrupted catches', `${s.corrupted}`] : null,
                s.snaps ? [snare.run?.opts.bubble ? 'Popped or snapped' : 'Wires snapped', `${s.snaps}`] : null,
                // How close the boss came to falling (a log had 8 of 9, twice, and the card said only "8"): near the end it's a key line.
                d.bossMax && d.bossLeft < d.bossMax ? ['Boss health taken', `${d.bossMax - d.bossLeft} of ${d.bossMax}`, d.bossLeft <= Math.max(1, d.bossMax * 0.25) ? 'key' : ''] : null,
                s.chained ? ['Chain lightning', `${s.chained}`] : null,
                s.lasered ? ['Lasered', `${s.lasered}`] : null,
                s.stuns ? ['Antivirus stunned', `${s.stuns}`] : null,
                s.avDown ? ['Antivirus shot down', `${s.avDown}`] : null,
                s.stolen ? ['Stolen by the Rogue AI', `${s.stolen}`] : null,
                s.wiped ? ['Wiped by the boss', `${s.wiped}`] : null,
                s.quarantined ? ['Cores quarantined', `${s.quarantined}`] : null,
                s.gold ? ['Gold packets', `${s.gold}`] : null,
                s.collected ? ['Garbage collected', `${s.collected}`] : null,
                s.spoofed ? ['Packets spoofed', `${s.spoofed}`] : null,
                s.parries || s.slashes ? ['Parries · slashes', `${s.parries} · ${s.slashes}`] : null,
                s.glanced ? ['Slashes the shield stopped', `${s.glanced}`] : null,
                s.minesGrabbed ? ['Mines grabbed · thrown', `${s.minesGrabbed} · ${s.mineThrows || 0}`] : null,
                s.minesCleared ? ['Mines cleared', `${s.minesCleared} of ${s.mines}`] : null,
                s.netted ? ['Netted by the boss', `${s.netted}`] : null,
                s.forks ? ['Split catches', `${s.forks}`] : null,
                s.stars ? ['Supernovas', `${s.stars}`] : null,
                s.escalations ? ['Rams', `${s.escalations}`] : null,
                s.raced ? ['Bubbles held still', `${s.raced}`] : null,
                s.hijacked ? ['Antivirus hijacked', `${s.hijacked}`] : null,
                s.partners ? ['Partner cores', `${s.partners} · ${s.partnered} packets`] : null,
                s.flags ? ['Exploits flagged', `${s.flags}${s.ids ? ` · ${s.ids} IDS alert${s.ids === 1 ? '' : 's'}` : ''}`] : null,
                Math.max(best, d.haul) > 0 ? ['Best haul', `+${E.format(Math.max(best, d.haul))} Signal`] : null,
                snareRpLine(),
                snareTrainingLine()
            ].filter(Boolean);
            card.replaceChildren(...[
                el('div', { class: 'result-title', text: `${d.sector > d.startSector ? `Sectors ${d.startSector + 1}–${d.sector + 1}` : snareSector(d.sector)}${d.replay ? ' (replay)' : ''} · ${d.walked ? 'Left the bay' : 'Focus spent'}` }),
                // A boss beaten leads the card (round 2 of the review: it read like any other run).
                d.cleared.some(k => E.isSnareBossSector(k)) ? el('div', { class: 'result-main snare-boss-down', text: `Boss down · ${s.slashes || 0} slash${s.slashes === 1 ? '' : 'es'}${s.mineThrows ? ` · ${s.mineThrows} mine${s.mineThrows === 1 ? '' : 's'} thrown` : ''}` }) : null,
                el('div', { class: 'result-main', text: s.caught ? `${s.caught} packet${s.caught === 1 ? '' : 's'} snared` : 'Nothing snared' }),
                el('div', { class: 'result-xp', text: `+${E.format(d.haul)} Signal` }),
                d.record ? el('span', { class: 'result-badge', text: `New record · was +${E.format(d.prev)}` }) : null,
                ...resultLines(lines),
                snareSectorPicker(),
                el('p', { class: 'snare-intro-line snare-goal-line', text: snareGoalText(snareNextSector()) }),
                el('div', { class: 'result-actions' }, [el('button', { type: 'button', class: 'button', text: 'Snare again', onclick: startSnare }), snareUpgradesButton()])].filter(Boolean));
        }
        setHidden(card, false);
    }

    // Escape inside Packet Snare: a first-meeting card waits for its button; then the popup, then the tree close.
    function snareEscape() {
        if (snare.intro) return true;
        if (snare.tree && snareUi.popup) { snareUi.popup = false; placeSnarePopup(); return true; }
        if (snare.tree) { closeSnareTree(); return true; }
        return false;
    }
    // Packet Snare's keys, like the Training Cluster's: 1–7 pick a tool (or fire a power), U the tree, G goes deeper once
    // the sector is cleared, R, Space or Enter the next run from a card.
    function snareKeys(e) {
        if (openBay !== 'pipeline' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select')) return;
        const key = e.key.toLowerCase();
        const live = snare.run && !snare.run.over && !snare.preview;
        if (/^[1-7]$/.test(key) && live) {
            const t = snareToolsOwned(snare.run)[Number(key) - 1];
            if (t) pickSnareTool(t.id);
        } else if (key === 'u' && state.snare.runs > 0 && !snare.intro) {
            if (snare.tree) closeSnareTree(); else openSnareTree();
        } else if (key === 'g' && live && snareCleared(snare.run) && !snare.tree) {
            goDeeper();
        } else if ((key === 'r' || ((key === ' ' || key === 'enter') && !e.target.closest?.('button'))) && !live && !snare.tree && !snare.intro) {
            startSnare();
        } else return;
        e.preventDefault();
    }

    // ---- The tool bar: the lasso, what you place, and powers -----------------------------------------------
    // Under the field once the tree gives you anything to place or use. Keys 1–7 pick a tool; a power fires at once.
    const SNARE_TOOLS = [
        { id: 'lasso', name: 'Lasso', icon: 'lasso' },
        { id: 'wall', name: 'Firewall', icon: 'bricks', slots: 'firewalls', list: 'walls' },
        { id: 'decoy', name: 'Decoy', icon: 'diamond', slots: 'decoys', list: 'decoys' },
        { id: 'turret', name: 'Turret', icon: 'turret', slots: 'turrets', list: 'turrets' },
        { id: 'tower', name: 'Tower', icon: 'mast', slots: 'towers', list: 'towers' },
        { id: 'freeze', name: 'Freeze', icon: 'timer', power: true },
        { id: 'purge', name: 'Purge', icon: 'flame', power: true }
    ];
    const snareToolsOwned = run => SNARE_TOOLS.filter(t => t.id === 'lasso' || (!snareAutoTools(run.opts) && (t.power ? run.opts[t.id] > 0 : run.opts[t.slots] > 0)));
    function pickSnareTool(id) {
        const run = snare.run;
        if (!run || run.over || snare.preview || snare.intro || snare.tree) return;
        const t = SNARE_TOOLS.find(x => x.id === id);
        if (!t || !snareToolsOwned(run).includes(t)) return;
        if (t.power) {
            if (!run.usePower(id)) sfx('error');
        } else {
            if (snare.pointer !== null) { snare.pointer = null; run.liftPen(); snare.wallFrom = null; }
            snare.tool = id;
            sfx('ui');
        }
        renderSnareTools();
    }
    function renderSnareTools() {
        const bar = $('snareTools');
        const run = snare.run;
        const live = run && !run.over && !snare.preview;
        const owned = live ? snareToolsOwned(run) : [];
        setHidden(bar, owned.length < 2);
        if (owned.length < 2) return;
        const key = owned.map(t => t.id).join(',');
        if (bar.dataset.key !== key) {
            bar.dataset.key = key;
            bar.replaceChildren(...owned.map((t, i) => {
                const b = el('button', { type: 'button', class: `snare-tool${t.power ? ' power' : ''}`, 'data-tool': t.id, title: `${t.name} (${i + 1})` });
                b.innerHTML = `<span class="snare-tool-icon">${icon(t.icon)}</span><span class="snare-tool-name">${t.name}</span><span class="snare-tool-count"></span>`;
                return b;
            }));
        }
        for (const b of bar.querySelectorAll('[data-tool]')) {
            const t = SNARE_TOOLS.find(x => x.id === b.dataset.tool);
            b.classList.toggle('on', snare.tool === t.id);
            b.setAttribute('aria-pressed', String(snare.tool === t.id));
            const n = t.power ? `×${run.charges[t.id]}` : t.slots ? `${run[t.list].filter(f => !f.auto).length}/${run.opts[t.slots]}` : '';
            setText(b.querySelector('.snare-tool-count'), n);
            b.classList.toggle('spent', !!t.power && !(run.charges[t.id] > 0));
        }
    }

    const snareNarrow = () => matchMedia('(max-width: 640px)').matches;
    function renderSnareHud() {
        const run = snare.run;
        if (!run || run.over) return;
        // Tips that waited for the pen to lift (Snare 15), and the first red packet on the field (sector 1 has one to meet).
        if (!snare.intro && snare.pointer === null && !run.drawing && snare.introWait?.length && !snareTipHeld(snare.introWait[0])) snareIntro(snare.introWait.shift());
        const share = run.focus / run.maxFocus;
        const fill = $('snareFocusFill');
        fill.style.transform = `scaleX(${share})`;
        fill.classList.toggle('low', share < 0.25);
        fill.parentElement.classList.toggle('ending', run.focus <= snareEndWarn(run) && !run.over);
        // The HUD keeps to Focus and the sector's goal or boss (the owner's call after the review rounds): states (frozen,
        // flagged, snapped, the clock stopped) are small pops on the field where they happen, so the HUD never changes shape.
        const boss = run.boss ? ` · Boss ${run.boss.hp}/${run.boss.maxHp}`
            // A sector with no boss: how far along its goal is (cleared once it's reached).
            : run.bossDone ? ' · Boss down ✓'
            : run.opts.goal > 0 ? ` · ${run.goalDone ? (snareNarrow() ? '✓' : 'Cleared ✓') : `${snareNarrow() ? '' : 'Goal '}${goalNum(Math.min(Math.floor(run.goalProgress()), run.opts.goal))}/${goalNum(run.opts.goal)}`}` : '';
        setText($('snareFocusText'), `${snareNarrow() ? '' : 'Focus '}${Math.ceil(run.focus)} s${boss}`);
        // A held Race Condition loop ticks up every half second.
        if (run.race) {
            const step = Math.min(8, Math.floor(run.race.t / 0.5));
            if (step > (snare.raceStep || 0)) { snare.raceStep = step; sfx('snareRace', { step }); }
        } else snare.raceStep = 0;
        renderSnareTools();
        setHidden($('snareDeeper'), !snareCleared(run));
        $('snareDeeper').classList.toggle('lit', snareCleared(run));
        // On a phone the haul drops its unit (round 1 of the review: with Go deeper up it pushed the goal off the row).
        setText($('snareHaul'), `+${E.format(snare.haul)}${snareNarrow() ? '' : ' Signal'}`);
    }

    // ---- Packet Snare's skill tree: nodes on a small grid around the Lasso, bought with data -------------------
    // Built from the Training tree's parts: the same nodes (.tree-node: circles, mechanic hexagons, the seed's diamond,
    // can-buy, owned, maxed, selected), line icons, links, the popup beside the node with its "now → after" line and,
    // for a new rule, a demo of it, and reveals as nodes appear. Its cells are fixed on a 13 × 13 grid that pans and zooms.
    // One symbol per kind of upgrade, like the Training tree's (round 3: ghosts, targets and dice meant three things each):
    // a node's icon comes from the first stat it changes, and the tool bar uses the same ones.
    const SNARE_STAT_ICON = { focus: 'eye', maxMult: 'pipes', wireMult: 'strip', bubbleSize: 'expand', bubbleGrow: 'target', drainMult: 'gauge', closeMult: 'target', focusBack: 'wave',
        race: 'hourglass', freeze: 'timer', freezeSeconds: 'timer', sprawl: 'expand', pay: 'boost', schooling: 'school', contain: 'anchor',   // a padlock read as a locked node (round 7 of the review)
       
        herders: 'drone', herdEvade: 'drone', herdRadius: 'drone', density: 'stack', goldChance: 'coin', goldValue: 'coin', tagValue: 'star',
        gc: 'trash', spoof: 'mask', slashDamage: 'sword', parryDamage: 'slash', parry: 'slash', bossStun: 'timer', fork: 'fork', star: 'burst', escalate: 'ram', cleaner: 'terminal', laser: 'beams', emitters: 'beams', laserSides: 'beams', laserMult: 'beams',
        turrets: 'turret', turretPurge: 'turret', turretRange: 'turret', turretRate: 'turret', scanner: 'radar', towers: 'mast', towerRange: 'mast',
        chain: 'bolt', chainHops: 'bolt', chainRange: 'bolt', scrubbers: 'filter', corruptMult: 'terminal', lureMult: 'code', purge: 'flame',
        firewalls: 'bricks', wallMult: 'bricks', wallRebuild: 'bricks', fwHits: 'shield', decoys: 'diamond', decoyLure: 'diamond',
        avSpeed: 'ghost', avStun: 'ghost', hijack: 'robot', collude: 'core', respawnMult: 'refresh', flagLimit: 'flag', spoofValue: 'mask',
        echo: 'loop', storm: 'cloud', crash: 'crash', zeroTrust: 'check', surge: 'surge', defuse: 'cut',
        pulse: 'surge', broadband: 'turret', cleanSweep: 'sweep', relay: 'route', backpressure: 'back',
        bounceBots: 'back', escortBots: 'shield', checkTowers: 'check', jamTowers: 'radar', cleanBots: 'sweep', spoofBots: 'mask', collectBots: 'robot', goldPlate: 'coin', pen: 'pen', autoZone: 'deploy' };
    const snareIcon = up => SNARE_STAT_ICON[Object.keys(up.sn || {})[0] || Object.keys(up.stages?.[1] || {})[0]] || 'spark';
    const snareUi = { built: false, nodes: {}, links: [], popup: false, detailKey: '', fresh: false, cam: { x: 0, y: 0, z: 1 }, drag: null, pointers: new Map(), moved: false };
    // Fixed cells (like the Training tree's --cell): the tree grows six cells out from the Lasso, and you pan and zoom it.
    const snareCell = () => (window.matchMedia('(max-width: 640px)').matches ? 84 : 112);   // the Training tree's --cell
    const SNARE_ZOOM = { min: 0.4, max: 1.6, step: 1.25 };

    function buildSnareTree() {
        const grid = $('snareTreeGrid');
        // Everything that pans and zooms sits in one layer, its origin at the grid's middle.
        const inner = el('div', { class: 'snare-tree-inner', id: 'snareTreeInner' });
        inner.append($('snareTreeLinks'));
        grid.prepend(inner);
        snareUi.inner = inner;
        // Branch names on the view's edges, like the Training tree's (round 4: a maxed tree was 57 alike squares).
        for (const [dir, name] of [['up', 'Bubbles'], ['right', 'Flow'], ['down', 'Intrusion'], ['left', 'Countermeasures']]) {
            grid.append(el('div', { class: `tree-branch tree-branch-${dir}`, 'aria-hidden': 'true' }, [el('strong', { text: name })]));
        }
        const core = el('div', { class: 'tree-node seed owned snare-core', 'aria-hidden': 'true' });
        core.innerHTML = `<span class="tree-icon">${icon('lasso')}</span>`;
        inner.append(core);
        snareUi.core = core;
        for (const up of E.SNARE_TREE) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('vector-effect', 'non-scaling-stroke');
            $('snareTreeLinks').append(line);
            snareUi.links.push({ up, line });
            const b = el('button', { type: 'button', class: 'tree-node', hidden: true });
            b.innerHTML = `<span class="tree-icon">${icon(snareIcon(up))}</span><span class="tree-lock">${icon('lock')}</span><span class="tree-level"></span>`;
            b.addEventListener('click', e => {
                e.stopPropagation();
                // Switching from one open popup to another doesn't pan the tree again (round 1 of the review: the nodes
                // moved under the pointer and the next click landed on a neighbour).
                snareUi.pannedFor = null;
                snare.pick = up.id;
                snareUi.popup = true;
                renderSnareTree();
            });
            inner.append(b);
            snareUi.nodes[up.id] = b;
        }
        // Zoom buttons (the keyboard's way in), like the Training tree's.
        const zoom = el('div', { class: 'tree-zoom snare-tree-zoom', role: 'group', 'aria-label': 'Zoom the Packet Snare tree' }, [
            el('button', { type: 'button', class: 'ghost-button', 'aria-label': 'Zoom in', text: '+', onclick: () => zoomSnareTree(snareUi.cam.z * SNARE_ZOOM.step) }),
            el('button', { type: 'button', class: 'ghost-button', 'aria-label': 'Zoom out', text: '−', onclick: () => zoomSnareTree(snareUi.cam.z / SNARE_ZOOM.step) }),
            el('button', { type: 'button', class: 'ghost-button', 'aria-label': 'Fit the tree', text: '⟲', onclick: fitSnareTree })]);
        grid.append(zoom);
        // Drag to pan, wheel or pinch to zoom; a drag never selects a node; a click on empty space closes the popup.
        const point = e => { const r = grid.getBoundingClientRect(), z = uiScale(); return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z }; };
        grid.addEventListener('pointerdown', e => {
            if (e.target.closest('.node-detail, .tree-zoom') || (e.pointerType === 'mouse' && e.button !== 0)) return;
            snareUi.pointers.set(e.pointerId, point(e));
            snareUi.moved = false;
            snareUi.drag = { x: snareUi.cam.x, y: snareUi.cam.y, start: point(e) };
            if (snareUi.pointers.size === 2) {
                const [a, b] = [...snareUi.pointers.values()];
                snareUi.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: snareUi.cam.z };
            }
        });
        grid.addEventListener('pointermove', e => {
            if (!snareUi.pointers.has(e.pointerId)) return;
            const p = point(e);
            snareUi.pointers.set(e.pointerId, p);
            if (snareUi.pointers.size === 2 && snareUi.pinch) {
                const [a, b] = [...snareUi.pointers.values()];
                snareUi.moved = true;
                zoomSnareTree(snareUi.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / snareUi.pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
                return;
            }
            const d = snareUi.drag;
            if (!d) return;
            const dx = p.x - d.start.x, dy = p.y - d.start.y;
            if (!snareUi.moved && Math.hypot(dx, dy) < 5) return;
            if (!snareUi.moved) grid.setPointerCapture(e.pointerId);
            snareUi.moved = true;
            snareUi.cam.x = d.x + dx;
            snareUi.cam.y = d.y + dy;
            applySnareCam();
        });
        const end = e => {
            snareUi.pointers.delete(e.pointerId);
            if (snareUi.pointers.size < 2) snareUi.pinch = null;
            if (!snareUi.pointers.size) snareUi.drag = null;
        };
        grid.addEventListener('pointerup', end);
        grid.addEventListener('pointercancel', end);
        grid.addEventListener('click', e => {
            if (snareUi.moved) { e.stopPropagation(); e.preventDefault(); snareUi.moved = false; }
        }, true);
        grid.addEventListener('click', e => {
            if (e.target.closest('.tree-node, .node-detail, .tree-zoom')) return;
            snareUi.popup = false;
            placeSnarePopup();
        });
        grid.addEventListener('dblclick', e => {
            if (!e.target.closest('.tree-node, .node-detail, .tree-zoom')) fitSnareTree();
        });
        grid.addEventListener('wheel', e => {
            if (e.target.closest('.node-detail')) return;
            e.preventDefault();
            const p = point(e);
            zoomSnareTree(snareUi.cam.z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        }, { passive: false });
        new ResizeObserver(() => { if (snare.tree) layoutSnareTree(); }).observe(grid);
        $('snareTreeButton').addEventListener('click', openSnareTree);
        snareUi.built = true;
    }

    // The view is remembered per device, like the Training tree's (`agiSnareCam`); double-click empty space or ⟲ to frame
    // the tree again.
    const SNARE_CAM_KEY = 'agiSnareCam';
    function applySnareCam() {
        const c = snareUi.cam;
        snareUi.inner.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
        placeSnarePopup();
        clearTimeout(snareUi.camSave);
        snareUi.camSave = setTimeout(() => storageSet(SNARE_CAM_KEY, JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), z: +c.z.toFixed(3) })), 300);
    }
    function savedSnareCam() {
        try {
            const c = JSON.parse(storageGet(SNARE_CAM_KEY) || 'null');
            return c && [c.x, c.y, c.z].every(Number.isFinite) ? { x: c.x, y: c.y, z: Math.min(SNARE_ZOOM.max, Math.max(SNARE_ZOOM.min, c.z)) } : null;
        } catch { return null; }
    }
    // Zoom to `z` keeping the point (px, py) of the grid still (the middle by default).
    function zoomSnareTree(z, px, py) {
        const grid = $('snareTreeGrid');
        const c = snareUi.cam;
        px ??= grid.clientWidth / 2;
        py ??= grid.clientHeight / 2;
        z = Math.min(SNARE_ZOOM.max, Math.max(SNARE_ZOOM.min, z));
        // the inner layer's origin sits at the grid's middle
        const ox = grid.clientWidth / 2 + c.x, oy = grid.clientHeight / 2 + c.y;
        const wx = (px - ox) / c.z, wy = (py - oy) / c.z;
        c.z = z;
        c.x = px - grid.clientWidth / 2 - wx * z;
        c.y = py - grid.clientHeight / 2 - wy * z;
        applySnareCam();
    }
    // Frame what's on the tree now (the nodes you can see), as close as fits, never under half size.
    function fitSnareTree() {
        const grid = $('snareTreeGrid');
        const W = grid.clientWidth, H = grid.clientHeight;
        if (!W || !H) return;
        const cell = snareCell();
        const shown = [{ x: 0, y: 0 }, ...E.SNARE_TREE.filter(up => !snareUi.nodes[up.id].hidden).map(up => up.snare)];
        const xs = shown.map(c => c.x), ys = shown.map(c => c.y);
        // room for the branch names on the edges (round 3 of the review: fit cut rows off)
        const bw = (Math.max(...xs) - Math.min(...xs) + 2.4) * cell, bh = (Math.max(...ys) - Math.min(...ys) + 3) * cell;
        const z = Math.min(SNARE_ZOOM.max, Math.max(SNARE_ZOOM.min, Math.min(W / bw, H / bh)));
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2 * cell, cy = (Math.max(...ys) + Math.min(...ys)) / 2 * cell;
        Object.assign(snareUi.cam, { z, x: -cx * z, y: -cy * z });
        applySnareCam();
    }

    function openSnareTree() {
        if (!snareUi.built) return;
        snare.tree = true;
        snareUi.fresh = true;   // what's there already appears at once; nodes unlocked from here on boot in
        snareUi.detailKey = '';
        setHidden($('snareCard'), true);
        setHidden($('snareTree'), false);
        $('snarePanel').classList.add('tree-open');
        snareLive();
        renderSnareBar();
        renderSnareTree();
        ptView('snareTree');
    }

    function closeSnareTree() {
        if (!snare.tree) return;
        snare.tree = false;
        snareUi.popup = false;
        setHidden($('snareTree'), true);
        $('snarePanel').classList.remove('tree-open');
        snareLive();
        renderSnareBar();
        if (openBay === 'pipeline') ptView('bay:pipeline');
        if (openBay === 'pipeline' && (!snare.run || snare.run.over || snare.preview)) showSnareCard(snare.done ? 'end' : 'start');
    }

    // The bay bar's Upgrades button (once a run has been made), with the tree's badge; mid-run the tree pauses the run.
    function renderSnareBar() {
        const b = $('snareTreeButton');
        // The Training Cluster's Upgrades and Restart live in the same bar: never here.
        if (openBay === 'pipeline') { setHidden($('treeButton'), true); setHidden($('restartButton'), true); }
        // Before the first run its place in the bar is kept (round 4: the bay moved 5 px when it appeared).
        setHidden(b, openBay !== 'pipeline' || snare.tree);
        b.classList.toggle('reserve', state.snare.runs < 1);
        const n = snareReadyCount();
        if (n) b.dataset.ready = n > 9 ? '9+' : String(n); else delete b.dataset.ready;
        const inRun = snare.run && !snare.run.over && !snare.preview;
        setText($('snareTreeStart'), inRun ? 'Back to the run' : 'Start run');
        setHidden($('snareTreeClose'), !!inRun);
    }

    // Cells: fixed, around the Lasso at the inner layer's origin; links from each node to what it grows from.
    function layoutSnareTree() {
        const grid = $('snareTreeGrid');
        if (!grid.clientWidth || !snareUi.inner) return;
        const cell = snareCell();
        grid.style.setProperty('--cell', cell + 'px');
        const put = (node, c) => { node.style.left = `${c.x * cell}px`; node.style.top = `${c.y * cell}px`; };
        put(snareUi.core, { x: 0, y: 0 });
        for (const up of E.SNARE_TREE) put(snareUi.nodes[up.id], up.snare);
        for (const { up, line } of snareUi.links) {
            const b = up.requires ? E.UPGRADE_BY_ID[up.requires].snare : { x: 0, y: 0 };
            for (const [k, v] of Object.entries({ x1: b.x * cell, y1: b.y * cell, x2: up.snare.x * cell, y2: up.snare.y * cell })) line.setAttribute(k, v);
        }
        // A narrow tree (a phone) docks the popup along its foot instead of beside the node.
        $('snareTreeDetail').classList.toggle('docked', grid.clientWidth < 560);
        placeSnarePopup();
    }

    function renderSnareTree() {
        if (!snare.tree || !snareUi.built) return;
        const states = Object.fromEntries(E.SNARE_TREE.map(up => [up.id, nodeState(up)]));
        if (snare.pick && states[snare.pick] === 'hidden') snare.pick = null;
        const revealed = [];
        for (const up of E.SNARE_TREE) {
            const node = snareUi.nodes[up.id];
            const st = states[up.id];
            if (snareUi.fresh) node.hidden = st === 'hidden';
            else {
                if (node.hidden && st !== 'hidden') revealed.push(node);
                setHidden(node, st === 'hidden');
            }
            node.className = `tree-node ${st}${up.mechanic ? ' mechanic' : ''}${snare.pick === up.id ? ' selected' : ''}${node.classList.contains('reveal-in') ? ' reveal-in' : ''}`;
            const lvl = E.level(state, up.id);
            node.querySelector('.tree-level').textContent = up.endless ? `${lvl}` : `${lvl}/${up.max}`;
            node.setAttribute('aria-label', up.endless ? `${up.name}: level ${lvl}` : `${up.name}: level ${lvl} of ${up.max}`);
            node.setAttribute('aria-pressed', String(snare.pick === up.id));
        }
        for (const { up, line } of snareUi.links) {
            line.style.display = states[up.id] === 'hidden' ? 'none' : '';
            line.setAttribute('class', E.level(state, up.id) > 0 ? 'link-owned' : 'link-open');
        }
        if (snareUi.fresh) {
            snareUi.fresh = false;
            layoutSnareTree();
            const cam = savedSnareCam();
            if (cam) { Object.assign(snareUi.cam, cam); applySnareCam(); } else fitSnareTree();
        }
        // A node that just appeared is panned into view, clear of the branch names on the edges (round 1 of the review:
        // Packet Stream came up under LOOPS).
        // A node revealed while the tree was closed has no place on screen yet; it waits for the tree to open (round 7
        // of the review: Packet Stream turned up under the tree's bar).
        if (revealed.length && !$('snareTreeGrid').clientHeight) (snareUi.pendingReveal ||= []).push(...revealed);
        else if (snareUi.pendingReveal?.length) { revealed.push(...snareUi.pendingReveal); snareUi.pendingReveal = []; }
        if (revealed.length && !snareUi.drag && $('snareTreeGrid').clientHeight) {
            const grid = $('snareTreeGrid'), z = uiScale(), g = grid.getBoundingClientRect(), M = 46;
            let dx = 0, dy = 0;
            for (const n of revealed) {
                const r = n.getBoundingClientRect();
                const x0 = (r.left - g.left) / z, x1 = (r.right - g.left) / z, y0 = (r.top - g.top) / z, y1 = (r.bottom - g.top) / z;
                if (x0 + dx < M) dx = M - x0; else if (x1 + dx > grid.clientWidth - M) dx = grid.clientWidth - M - x1;
                if (y0 + dy < M) dy = M - y0; else if (y1 + dy > grid.clientHeight - M) dy = grid.clientHeight - M - y1;
            }
            if (dx || dy) { snareUi.cam.x += dx; snareUi.cam.y += dy; applySnareCam(); }
        }
        renderSnareDetail();
        placeSnarePopup();
    }

    // What the next level does to a run, "now → after", from the run's options with and without it (the Training
    // tree's nodePreview, for Packet Snare).
    // What the next level does, "now → after", from the run's options with and without it: the first option it moves.
    const pct = v => `${Math.round(v * 100)}%`;
    const num1 = v => (Math.round(v * 10) / 10).toString();
    const num2 = v => (Math.round(v * 100) / 100).toString();
    // In plain words, against where a first run starts (round 3: "4,810 units²" and "0.4/unit" meant nothing).
    const snareX = key => v => `×${num1(v / window.PacketSnare.SNARE[key])}`;
    const SNARE_OPT_LABEL = [
        ['area', 'Field', snareX('area')], ['focus', 'Focus', v => `${v} s`], ['fullMult', 'A full bubble pays', v => `×${num1(1 + v)}`], ['maxMult', 'Multiplier cap', v => `×${v}`],
        ['bubbleSize', 'A full bubble', v => `×${num1(1 + v)} the size`], ['bubbleGrow', 'Bubbles fill in', v => `${num1(window.PacketSnare.SNARE.bubbleTime / (1 + v))} s`],
        ['focusBack', 'Focus back from a ×2 bubble', v => `${v} s`],
        ['race', 'A full bubble held still', v => (v ? 'keeps growing' : 'stays put')], ['raceMax', 'A held bubble grows to', v => `×${num1(1 + v)}`],
        ['freeze', 'Freeze pickups', v => (v ? `one every ~${Math.round(16 / (1 + 0.6 * (v - 1)))} s` : 'none')], ['freezeSeconds', 'Freeze', v => `${num1(v)} s`],
        ['density', 'Packets', snareX('density')], ['goldChance', 'Gold packets', pct], ['goldValue', 'A gold packet is worth', String],
        ['tagValue', 'A tag', v => `×${v}`], ['schoolSize', 'School size', String], ['contain', 'Edges', v => (v ? 'hold good packets' : 'let packets go')],
        ['herders', 'Herder drones', String], ['herdEvade', 'Herders', v => (v ? `dodge Antivirus (${v})` : 'don\'t dodge')], ['herdRadius', 'Herder reach', snareX('herdRadius')],
        ['parry', 'The boss\'s charge', v => (v ? 'parried with a flick across its line' : 'dodge it, or loop the boss')],
        ['gc', 'Bubbles of only corrupt packets', v => (v ? 'deleted, Focus back' : 'spoil')], ['spoof', 'Flicks', v => (v ? 'spoof corrupt packets' : 'off')],
        ['spoofSeconds', 'Spoofed for', v => `${num1(v)} s`], ['slashDamage', 'A slash takes', v => `${v} health`], ['parryDamage', 'A parry takes', v => `${v} health`],
        ['bossStun', 'A stunned boss reels', v => `${num1(v)} s`], ['fork', 'A full bubble let go', v => (v ? `splits into ${v + 1}` : 'stays whole')],
        ['star', 'A bubble let go while frozen', v => (v ? 'goes supernova' : 'nothing special')], ['starMult', 'A supernova pays', v => `×${v} more`],
        ['escalate', 'Your hijacked Antivirus', v => (v ? 'can ram the boss' : 'only takes packets')], ['escalateDamage', 'A ram takes', v => `${v} health`],
        ['laser', 'Laser', v => (v ? `every ${num1(v)} s` : 'none')], ['emitters', 'Emitters per edge', String], ['laserSides', 'Edges with lasers', String],
        ['laserReach', 'Laser reach', snareX('laserReach')],
        ['turrets', 'Turrets at once', String], ['turretPurge', 'Red packets a turret shot wipes', v => String(1 + v)],
        ['turretRange', 'Turret reach', snareX('turretRange')], ['turretEvery', 'Turrets fire every', v => `${num1(v)} s`], ['scanner', 'Scanner beam', v => (v ? 'on' : 'none')],
        ['scannerSpeed', 'Scanner sweep', snareX('scannerSpeed')], ['towers', 'Scanner towers at once', String], ['towerRange', 'Tower reach', snareX('towerRange')],
        ['chain', 'Arcs per catch', String], ['chainHops', 'Arc hops', String], ['chainRange', 'Arc reach', snareX('chainRange')],
        ['scrubbers', 'Corrupt packets forgiven', v => (v > 0 ? `${v}, +1 per 20 packets in the bubble` : '0')], ['corruptShare', 'Corrupt packets', v => `${(v * 100).toFixed(1)} per 100 good ones`],
        ['corruptLure', 'Corrupt pull to schools', pct],
 ['purge', 'Purge pickups', v => (v ? `one every ~${Math.round(16 / (1 + 0.6 * (v - 1)))} s` : 'none')],
        ['firewalls', 'Firewall sections at once', String], ['zoneSize', 'Firewall section size', snareX('zoneSize')], ['wallRebuild', 'Sections rebuild', v => (v ? `after ${v} s` : 'never')],
        ['fwHits', 'Firewall section health', v => `${6 * v} (Antivirus wear 1 a second)`], ['decoys', 'Decoys at once', String], ['decoyLure', 'Decoy pull', snareX('decoyLure')],
        ['avSpeed', 'Antivirus speed', pct], ['avStun', 'Antivirus stunned for', v => `${num1(v)} s`],
        ['hijack', 'Stunned Antivirus', v => (v ? 'can be hijacked' : 'stay hostile')], ['collude', 'A core turns partner', pct],
        ['flagLimit', 'Flags before an IDS alert', String], ['spoofValue', 'A spoofed packet is worth', v => `×${v}`],
        ['echo', 'A closed loop', v => (v === 1 ? 'catches again a second later' : v ? `catches again ${v} times, a second apart` : 'catches once')],
        ['storm', 'Packet Storms', v => (v ? `${20 + 10 * (v - 1)} gold every ${Math.max(6, 15 - 2 * (v - 1))} s` : 'none')],
        ['crash', 'Every third slash', v => (v ? 'crashes it: ×3 damage' : 'a slash like the others')], ['zeroTrust', 'Red packets your walls bounce', v => (v ? 'come back good' : 'stay red')],
        ['surge', 'Three clean catches in a row', v => (v ? `a surge of ${10 + 15 * v} packets` : 'nothing more')],
        ['netTime', 'Mines link into nets in', v => `${num1(v)} s`], ['defuseChain', 'Looping a mine', v => (v ? 'clears its neighbour too' : 'clears just that one')],
        ['pulse', 'A clean loop', v => (v ? `sends in ${2 * v} packets` : 'sends in none')],
        ['broadband', 'Each turret or tower placed', v => (v ? `brings packets back ${Math.round(v * 100)}% sooner` : 'does nothing for refills')],
        ['cleanSweep', 'After a clean loop, the clock stops for', v => `${num1(v)} s`],
        ['relay', 'Red packets your walls bounce', v => (v ? 'swim to your decoy' : 'swim on')],
        ['backpressure', 'A catch', v => (v ? 'turns the packets round it back' : 'leaves the packets round it be')],
        ['cleanBots', 'Cleaner bots', String], ['spoofBots', 'Spoofer bots', String], ['collectBots', 'Collector bots', String],
        ['bounceBots', 'Bouncer bots', String], ['escortBots', 'Escort bots', String], ['checkTowers', 'Checksum towers', String], ['jamTowers', 'Jammer towers', String],
        ['goldPlate', 'Cleaner bots gild a packet every', v => (v ? `${num1(6 / v)} s` : 'never')],
        ['pen', 'Good packets in a section', v => (v ? 'stay in' : 'come and go')],
        ['autoZone', 'Free sections', v => (v ? 'place themselves' : 'wait for you')]
    ];
    // How many packets a field of these options holds on this screen, against a first run (a field the screen caps
    // fills more densely instead of growing).
    const snarePacketsX = o => {
        const f = snareField(o.area, o);
        return (f.density ?? o.density) * Math.min(o.area, f.w * f.h) / (window.PacketSnare.SNARE.density * window.PacketSnare.SNARE.area);
    };
    function snareNodePreview(up, lvl) {
        if (up.id === 'snareOverclock') return `Pay: ×${E.snareOverclock(state).toFixed(1)} → ×${(E.snareOverclock(state) + 0.1).toFixed(1)}`;
        // On a sector with red packets (round 1 of the review: on sector 1 the red-packet nodes showed no change).
        const k = Math.max(state.snare.sector, E.RED_SECTOR);
        const now = E.snareOpts(state, k);
        // The next level on a copy of the levels (round 3: it borrowed the live save's).
        const next = E.snareOpts({ ...state, levels: { ...state.levels, [up.id]: lvl + 1 } }, k);
        // Field and packet nodes say what changes on this screen (round 4: "Field ×4.1 → ×6.6" where the field was capped).
        if (now.area !== next.area || now.density !== next.density || now.respawn !== next.respawn) {
            const a = snarePacketsX(now), b = snarePacketsX(next);
            const back = o => snareField(o.area, o).respawn ?? o.respawn;
            const ra = back(now), rb = back(next);
            const sooner = rb < ra - 0.005 ? ` · back in ${num2(ra)} → ${num2(rb)} s` : '';
            // As counts on this screen (round 2 of the review: "×1.2 → ×1.6" at level 0 read as a ×1.2 never bought).
            const base = window.PacketSnare.SNARE.density * window.PacketSnare.SNARE.area;
            if (b > a * 1.005) return `Packets on the field: ${Math.round(a * base)} → ${Math.round(b * base)}${sooner}`;
            // Past the screen's cap a packet node makes them come back sooner (Snare 10).
            if (sooner) return `Packets come back: ${num2(ra)} s → ${num2(rb)} s (your screen is full)`;
        }
        // up to two changes (round 6 of the review: Bandwidth, Overflow and the like do two things and said one)
        const said = [];
        for (const [key, label, f] of SNARE_OPT_LABEL) {
            if (JSON.stringify(now[key]) === JSON.stringify(next[key])) continue;
            const line = `${label}: ${f(now[key] ?? 0)} → ${f(next[key] ?? 0)}`;
            if (!said.includes(line)) said.push(line);
            if (said.length === 2) break;
        }
        return said.length ? said.join(' · ') : null;
    }

    // The popup, rebuilt only when its node, state or level changes (a rebuild between pointerdown and pointerup would
    // swallow the click); the buy button keeps focus across a buy.
    function renderSnareDetail() {
        const box = $('snareTreeDetail');
        const up = snare.pick && E.UPGRADE_BY_ID[snare.pick];
        if (!up) return;
        const st = nodeState(up);
        const lvl = E.level(state, up.id);
        const key = `${up.id}:${st.split(' ')[0]}:${lvl}`;
        // Its price, and what's still needed while you can't afford it (round 1 of the review).
        const buyText = cost => {
            const short = (cost.signal || 0) - state.snare.signal;
            return `${lvl ? 'Upgrade' : 'Unlock'} · ${E.formatCost(cost)}${short > 0 ? ` · need ${E.format(Math.ceil(short))} more` : ''}`;
        };
        if (snareUi.detailKey === key && box.isConnected) {
            const buy = box.querySelector('.detail-buy');
            if (buy) {
                const cost = E.upgradeCost(up, lvl);
                buy.disabled = !E.canAfford(state, cost);
                const text = buyText(cost);
                if (buy.textContent !== text) buy.textContent = text;
            }
            return;
        }
        snareUi.detailKey = key;
        const parts = [
            el('button', { type: 'button', class: 'detail-close', 'aria-label': 'Close', text: '×' }),
            el('div', { class: 'detail-head' }, [
                el('span', { class: 'detail-icon' }),
                el('div', {}, [el('h3', { text: up.name }), el('p', { class: 'muted small', text: up.endless ? `Level ${lvl} · endless` : `Level ${lvl} of ${up.max}` })])
            ]),
            el('p', { class: 'detail-effect', text: up.effect }),
            el('p', { class: 'detail-flavor', text: up.flavor }),
            up.mechanic && lvl === 0 ? snareDemo(up.mechanic) : null
        ].filter(Boolean);
        if (st === 'maxed') {
            parts.push(el('p', { class: 'detail-maxed', text: 'Fully upgraded' }));
        } else {
            const cost = E.upgradeCost(up, lvl);
            const preview = snareNodePreview(up, lvl);
            if (preview) parts.push(el('p', { class: 'detail-preview', text: preview }));
            const buy = el('button', { type: 'button', class: 'button detail-buy', text: buyText(cost) });
            buy.disabled = !E.canAfford(state, cost);
            buy.addEventListener('click', e => {
                e.stopPropagation();
                doBuy(up.id);
                // Its popup played the demo: buying it counts as meeting it (no card in the next run).
                if (up.mechanic && E.level(state, up.id) > 0) state.intro[`snare:intro:${up.mechanic}`] = true;
                if (E.isMaxed(state, up)) snareUi.popup = false;
                renderSnareTree();
                renderSnareBar();
                if (snare.preview) snarePreview();
                if (snareUi.popup) box.querySelector('.detail-buy')?.focus({ preventScroll: true });
                else snareUi.nodes[up.id].focus({ preventScroll: true });
            });
            parts.push(buy);
        }
        box.replaceChildren(...parts);
        box.querySelector('.detail-close').addEventListener('click', e => {
            e.stopPropagation();
            snareUi.popup = false;
            placeSnarePopup();
            snareUi.nodes[up.id].focus({ preventScroll: true });
        });
        box.querySelector('.detail-icon').innerHTML = icon(snareIcon(up));
    }

    // Beside its node, flipping sides near the grid's edge, kept inside the grid; docked along the foot on a phone.
    function placeSnarePopup() {
        const box = $('snareTreeDetail');
        const node = snare.pick && snareUi.nodes[snare.pick];
        const show = !!snareUi.popup && !!node && !node.hidden && snare.tree;
        box.hidden = !show;
        if (!show) { box.style.left = box.style.top = ''; return; }
        const grid = $('snareTreeGrid');
        const z = uiScale();
        const g = grid.getBoundingClientRect(), r = node.getBoundingClientRect();
        const W = grid.clientWidth, H = grid.clientHeight;
        // Docked along the foot (a phone): the node is panned into the part of the tree left above it.
        if (box.classList.contains('docked')) {
            box.style.left = box.style.top = '';
            const free = H - box.offsetHeight - 10, ny1 = (r.bottom - g.top) / z + 26, ny0 = (r.top - g.top) / z;
            if (ny1 > free && !snareUi.drag && snareUi.pannedFor !== snare.pick) {
                snareUi.pannedFor = snare.pick;
                snareUi.cam.y += Math.max(free - ny1, 30 - ny0);
                applySnareCam();
            }
            return;
        }
        // Docked to the tree's right edge (round 2 of the review: beside its node it covered the neighbours, and clicks
        // meant for them hit the popup); the tree pans the node clear of it if it's under it.
        const w = box.offsetWidth || 250, h = box.offsetHeight || 160;
        const left = W - w - 6;
        const top = 6;
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        // Never over the node it's about (round 4): squeezed against an edge, the tree pans the node clear of it.
        const nx0 = (r.left - g.left) / z, nx1 = (r.right - g.left) / z;
        if (nx1 > left - 4 && nx0 < left + w + 4 && !snareUi.drag && snareUi.pannedFor !== snare.pick) {
            snareUi.pannedFor = snare.pick;
            const dx = left + w / 2 < W / 2 ? left + w + 12 - nx0 : left - 12 - nx1;
            snareUi.cam.x += dx;
            applySnareCam();
            requestAnimationFrame(placeSnarePopup);
        }
    }

    // ---- Packet Snare's mechanic demos ---------------------------------------------------------------------
    // Like the Training tree's: a node that brings a new rule plays three seconds of the real thing in its popup before
    // it's bought, and each hazard's first-meeting card plays its own. The scripts live in snare-demos.js (pure, and
    // tested: each demo must show its payoff); drawn by the same layers as the bay.
    const SNARE_DEMO = { w: 240, h: 112 };
    // A run's event as an effect on the field (the bay and the demos share these).
    function snareFxFor(e, fx, text = '') {
        if (e.type === 'catch') {
            const sub = e.split ? `SPLIT ×${e.mult.toFixed(1)}` : e.star ? `✸ SUPERNOVA ×${e.mult.toFixed(1)}` : e.race > 0 ? `HELD ×${e.mult.toFixed(1)}` : e.mult >= 1.15 ? `×${e.mult.toFixed(1)}` : '';
            fx.push({ kind: 'catch', poly: e.poly, x: e.x, y: e.y, t: 0, text, sub, big: e.mult >= 2.5 || e.gold > 0 || e.chained.length > 2 || !!e.split || !!e.star, packets: e.packets });
            // Snare 14 (the owner's call: the powers should feel like powers): longer, brighter arcs, and a big chain says so.
            if (e.chained.length) fx.push({ kind: 'chain', arcs: e.chained, t: 0, life: 0.8, seed: e.x * 13.7 % 1 });
            if (e.chained.length >= 6) {
                fx.push({ kind: 'banner', x: e.x, y: e.y - 1.4, t: 0, life: 1.1, text: `⚡ CHAIN ×${e.chained.length}`, huge: e.chained.length >= 20 });
                if (e.chained.length >= 12) fx.push({ kind: 'flash', t: 0, life: 0.3 });
            }
            if (e.echo) fx.push({ kind: 'banner', x: e.x, y: e.y - 1.2, t: 0, life: 0.8, text: `ECHO ${e.echo > 1 ? `×${e.echo}` : ''}`.trim(), small: true });
            // Floodgate's combo: clean catches in a row count toward the next surge.
            if (e.streak > 0) fx.push({ kind: 'banner', x: e.x, y: e.y + 1.1, t: 0, life: 0.9, text: `COMBO ${Math.min(e.streak, 3)}/3`, small: true });
        } else if (e.type === 'laser') fx.push({ kind: 'laser', from: e.from, x: e.x, y: e.y, t: 0, life: 0.45, text, small: true, gold: e.kind === 'gold', turret: !!e.turret });
        else if (e.type === 'zap') fx.push({ kind: 'laser', from: e.from, x: e.x, y: e.y, t: 0, life: 0.4, text: e.av ? `HIT ${e.shots}/${e.of}` : 'WIPED', small: true, zap: true });
        else if (e.type === 'avDown') {
            fx.push({ kind: 'laser', from: e.from, x: e.x, y: e.y, t: 0, life: 0.4, zap: true });
            fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: 0.6, t: 0, life: 0.6 });
            fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.9, text: 'ANTIVIRUS DOWN', small: true });
        }
        else if (e.type === 'corrupt') fx.push({ kind: 'corrupt', poly: e.poly, x: e.x, y: e.y, t: 0, text: 'CORRUPTED', packets: e.packets });
        else if (e.type === 'empty') fx.push({ kind: 'empty', poly: e.poly, x: e.x, y: e.y, t: 0, life: 0.5 });
        // a bubble pops, a wire snaps (round 3 of the review: a popped bubble said both)
        else if (e.type === 'snap') fx.push({ kind: 'snap', wire: e.wire, x: e.x, y: e.y, t: 0, text: e.bubble ? 'POPPED' : 'SNAPPED', life: 0.9 });
        else if (e.type === 'antivirus' || e.type === 'core') fx.push({ kind: 'boot', x: e.x, y: e.y, t: 0, life: 0.8 });
        else if (e.type === 'boss') fx.push({ kind: 'boot', x: e.x, y: e.y, t: 0, life: 1.2, big: true });
        else if (e.type === 'stolen' || e.type === 'wiped') {
            fx.push({ kind: 'stolen', core: e.core || { x: e.x, y: e.y }, packets: e.packets, t: 0, life: 0.45 });
            // round 6 of the review: the Rogue AI took packets and nothing said so
            if (e.type === 'stolen' && e.packets?.length) fx.push({ kind: 'banner', x: e.core.x, y: e.core.y - 1, t: 0, life: 0.8, text: `−${e.packets.length} STOLEN`, small: true });
        }
        else if (e.type === 'coreGone') fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: e.r, t: 0, life: 0.6 });
        else if (e.type === 'quarantine') fx.push({ kind: 'quarantine', x: e.x, y: e.y, r: e.r, t: 0, life: 0.9, text: text || 'QUARANTINED', big: true });
        else if (e.type === 'bossHit') {
            // round 6 of the review: a run of slashes stacked their labels into a column; the newest replaces the last
            for (let i = fx.length - 1; i >= 0; i--) if (fx[i].hit) fx.splice(i, 1);
            // the ring on the boss, the words under it (round 7 of the review: they sat on SLASH! over it)
            const br = e.r || window.PacketSnare.BOSS_R;
            fx.push({ kind: 'quarantine', hit: true, x: e.x, y: e.y, r: br, t: 0, life: 0.7 });
            fx.push({ kind: 'stun', hit: true, x: e.x, y: e.y + br + 0.9, t: 0, life: 0.8, text: `${e.how === 'ram' ? 'RAMMED' : e.how === 'parry' ? 'RIPOSTE' : e.how === 'crash' ? 'BLUE SCREEN' : 'SLASH'} −${e.dmg} · ${e.hp} left` });
        }
        // a slash too soon after the last (round 6: it was swallowed without a word); at most one a half second
        else if (e.type === 'slashSoon') {
            if (!fx.some(f => f.soon && f.t < 0.5)) fx.push({ kind: 'stun', soon: true, x: e.x, y: e.y + 1.2, t: 0, life: 0.6, text: 'TOO FAST', small: true });
        }
        // a red packet turned regular (a Cleaner or Escort bot, a Checksum tower: a line from the helper)
        else if (e.type === 'cleaned') {
            if (e.from) fx.push({ kind: 'laser', from: e.from, x: e.x, y: e.y, t: 0, life: 0.4, small: true });
            fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.6, text: 'CLEANED', small: true });
        }
        else if (e.type === 'shoved') {
            fx.push({ kind: 'laser', from: e.from, x: e.x, y: e.y, t: 0, life: 0.3, small: true });
            fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.5, text: 'SHOVED', small: true });
        }
        else if (e.type === 'convert') fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.6, text: 'TRUSTED', small: true });
        else if (e.type === 'zoneDown') fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: Math.max(e.hw, e.hh), t: 0, life: 0.7 });
        else if (e.type === 'gilded') fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.6, text: 'GOLD', small: true });
        // Snare 14: a surge and a storm are events (they used to pass unseen), a Collector bot's net a ring.
        else if (e.type === 'surge') {
            fx.push({ kind: 'banner', x: e.x ?? 0, y: (e.y ?? 0) - 1.6, t: 0, life: 1.4, text: `SURGE +${e.count}`, huge: true, centre: e.x === undefined });
            fx.push({ kind: 'flash', t: 0, life: 0.35 });
        } else if (e.type === 'storm') {
            fx.push({ kind: 'banner', x: 0, y: 0, t: 0, life: 1.6, text: `PACKET STORM · ${e.count} GOLD`, huge: true, centre: true });
            fx.push({ kind: 'flash', t: 0, life: 0.4, gold: true });
        } else if (e.type === 'botNet') fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: e.r, t: 0, life: 0.5 });
        else if (e.type === 'autoZone') fx.push({ kind: 'placed', x: e.x, y: e.y, t: 0, life: 0.6 });
        else if (e.type === 'raceBroken') fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.9, text: e.by === 'boss' ? 'HOLD BROKEN · the boss' : 'HOLD BROKEN · scanned', small: true });
        else if (e.type === 'cleanSweep') fx.push({ kind: 'stun', x: e.x, y: e.y + 0.9, t: 0, life: 0.8, text: 'CLOCK STOPPED', small: true });
        else if (e.type === 'backpressure') fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: e.r, t: 0, life: 0.5 });
        else if (e.type === 'bossBlock') fx.push({ kind: 'flag', x: e.x, y: e.y - 1, t: 0, life: 0.9, text: e.reason === 'shield' ? 'SHIELDED' : 'GUARD UP · loop round it first', small: true });
        else if (e.type === 'mine') fx.push({ kind: 'boot', x: e.x, y: e.y, t: 0, life: 0.6 });
        else if (e.type === 'mineDown') fx.push({ kind: 'quarantine', x: e.x, y: e.y, r: 0.6, t: 0, life: 0.6, text: e.boss ? '' : 'MINE CLEARED', small: true });
        else if (e.type === 'netted') fx.push({ kind: 'purge', packets: e.packets, t: 0, life: 0.5 });
        else if (e.type === 'nova') { fx.push({ kind: 'nova', x: e.x, y: e.y, r: e.r, t: 0, life: 0.9 }); fx.push({ kind: 'flash', t: 0, life: 0.35, warn: false }); }
        else if (e.type === 'split') for (const kd of e.kids) fx.push({ kind: 'splitKid', x: kd.x, y: kd.y, r: kd.r, from: { x: e.x, y: e.y }, t: 0, life: 0.5 });
        else if (e.type === 'splitSpoiled') fx.push({ kind: 'flag', x: e.x, y: e.y - 0.5, t: 0, life: 0.9, text: 'SPLIT SPOILED', small: true });
        else if (e.type === 'mineGrab') fx.push({ kind: 'quarantine', x: e.x, y: e.y, r: 0.6, t: 0, life: 0.8, text: state.intro['snare:thrown'] ? 'GRABBED' : 'GRABBED · FLICK IT AT THE BOSS', small: true });
        else if (e.type === 'mineThrow') { fx.push({ kind: 'throw', x: e.x, y: e.y, from: e.from, t: 0, life: 0.45 }); fx.push({ kind: 'stun', x: e.x, y: e.y - 1.2, t: 0, life: 1, text: 'MINE THROWN', small: true }); state.intro['snare:thrown'] = true; }
        else if (e.type === 'mineLive') fx.push({ kind: 'flag', x: e.x, y: e.y - 0.5, t: 0, life: 0.9, text: 'LIVE AGAIN', small: true });
        else if (e.type === 'escalate') fx.push({ kind: 'flick', a: e.from, b: { x: e.x, y: e.y }, hit: true, t: 0, life: 0.6 });
        else if (e.type === 'garbage') fx.push({ kind: 'catch', poly: e.poly, x: e.x, y: e.y, t: 0, text, packets: [] });
        else if (e.type === 'taken') fx.push({ kind: 'laser', from: { x: e.x, y: e.y }, x: e.packets[0]?.x ?? e.x, y: e.packets[0]?.y ?? e.y, t: 0, life: 0.35, text, small: true });
        // Flicks: a bright streak where the stroke went (amber when it landed, red when it was flagged).
        else if (e.type === 'parry') fx.push({ kind: 'quarantine', x: e.x, y: e.y, r: 1, t: 0, life: 0.7, text: 'PARRIED · slash it!', big: true });
        else if (e.type === 'spoof' || e.type === 'parryFlick' || e.type === 'slash' || e.type === 'flag') {
            const a = e.a, b = e.b, hit = e.type !== 'flag';
            fx.push({ kind: 'flick', a, b, hit, t: 0, life: 0.5 });
            if (e.type === 'spoof') fx.push({ kind: 'stun', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0, life: 0.7, text: `SPOOFED ×${e.packets.length}`, small: true });
            if (e.type === 'flag') fx.push({ kind: 'flag', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0, life: 0.9, text: `⚑ FLAGGED ${e.flags}/${e.limit}`, small: true });
        } else if (e.type === 'ids') fx.push({ kind: 'ids', x: 0, y: 0, t: 0, life: 1.6 });
        else if (e.type === 'hijack') fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.8, text: 'HIJACKED', small: true });
        else if (e.type === 'herdStun') fx.push({ kind: 'flag', x: e.x, y: e.y, t: 0, life: 0.6, text: 'DRONE DOWN', small: true });
        else if (e.type === 'partnerGone' && !e.done) fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: e.r, t: 0, life: 0.6 });
        else if (e.type === 'rebuilt') fx.push({ kind: 'placed', x: e.x, y: e.y, t: 0, life: 0.5 });
        else if (e.type === 'stun') {
            fx.push({ kind: 'stun', x: e.x, y: e.y, t: 0, life: 0.6, text: 'STUNNED', small: true });
            if (e.down && e.a) fx.push({ kind: 'fwDown', a: e.a, b: e.b, t: 0, life: 0.7 });
        } else if (e.type === 'purge') fx.push({ kind: 'purge', packets: e.packets, t: 0, life: 0.6 });
        else if (e.type === 'decoyGone') fx.push({ kind: 'coreGone', x: e.x, y: e.y, r: 0.5, t: 0, life: 0.5 });
        else if (e.type === 'place') fx.push({ kind: 'placed', x: e.x, y: e.y, t: 0, life: 0.5 });
    }

    function snareDemo(kind) {
        const D = window.SnareDemos;
        if (!D?.DEMOS[kind]) return null;
        const canvas = el('canvas', { class: 'mechanic-demo', 'aria-hidden': 'true' });
        const wrap = el('figure', { class: 'demo' }, [canvas, el('figcaption', { text: D.DEMOS[kind].text })]);
        const dpr = Math.min(3, (window.devicePixelRatio || 1) * uiScale());
        canvas.width = SNARE_DEMO.w * dpr;
        canvas.height = SNARE_DEMO.h * dpr;
        const ctx = canvas.getContext('2d');
        const k = Math.min(SNARE_DEMO.w / D.FIELD.w, SNARE_DEMO.h / D.FIELD.h);
        let sim = null, fx = [];
        let last = performance.now();
        const advance = dt => {
            for (const e of D.step(sim, dt)) snareFxFor(e, fx, e.units ? `+${Math.round(e.units)}` : '');
            for (const f of fx) f.t += dt;
            fx = fx.filter(f => f.t < (f.life || SNARE_FX));
        };
        const frame = now => {
            // Gone from the page (its popup or card rebuilt): stop for good; hidden: look again in a while.
            if (!canvas.isConnected) return;
            if (!canvas.offsetParent) return void setTimeout(() => canvas.isConnected && requestAnimationFrame(frame), 800);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!sim || sim.t >= D.PERIOD) { sim = D.start(window.PacketSnare, kind); fx = []; }
            if (reducedMotion()) { while (sim.t < 1.6) advance(1 / 60); } else advance(dt);
            drawSnareView(ctx, { run: sim.run, effects: fx, k, ox: (SNARE_DEMO.w - D.FIELD.w * k) / 2, oy: (SNARE_DEMO.h - D.FIELD.h * k) / 2,
                cw: SNARE_DEMO.w, ch: SNARE_DEMO.h, dpr, field: sim.run });
            if (!reducedMotion()) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        return wrap;
    }

    // ---- Drawing the field --------------------------------------------------------------------------------

    // Drawn in layers, back to front, each a function of the view `d` (the context, colours, scale, run, effects), so the
    // field draws the same into the bay's canvas and a node's demo.
    const SNARE_LAYERS = () => [drawSnareCurrent, drawSnareContain, drawSnareScanner, drawSnareCores, drawSnareMines, drawSnareFirewalls, drawSnareToolLife, drawSnareSweeps, drawSnareLoops, drawSnarePreview, drawSnarePackets, drawSnareHerders, drawSnareLasers, drawSnareChain, drawSnareWire, drawSnareRaceLabel, drawSnareRogueFx, drawSnareSnaps, drawSnareAntivirus, drawSnareBoss, drawSnarePickups, drawSnareFrozen, drawSnarePops];
    let snareMonoFont = '';
    const snareMono = () => (snareMonoFont ||= getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace');

    function drawSnare() {
        if (!snare.ctx || !snare.cw) return;
        drawSnareView(snare.ctx, { run: snare.run, effects: snare.fx, k: snare.scale, ox: snare.ox, oy: snare.oy, cw: snare.cw, ch: snare.ch,
            dpr: snare.canvas.width / snare.cw, field: snare.run || snareField(), touch: snare.touch, wallFrom: snare.wallFrom, turned: snare.turned });
        drawSnareEnding(snare.ctx, snare);
        // Under a card (start, end or a tip) the field dims, so the card reads and the field's labels don't show through
        // (round 1 of the review).
        if (snareCardUp()) {
            const ctx = snare.ctx, dpr = snare.canvas.width / snare.cw;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, snare.cw, snare.ch);
            ctx.globalAlpha = 1;
        }
    }
    const snareCardUp = () => { const c = $('snareCard'); return !!c && !c.hidden && !snare.tree; };

    // The run's last seconds (Snare 12.7, the owner: the end of a run needed a clearer sign the clock was running out): over
    // the last `SNARE_END_WARN` seconds of Focus the field's edge glows red and pulses faster as it nears empty, and the last
    // three count down large over the field, each with a tick.
    const SNARE_END_WARN = 5;
    const snareEndWarn = run => Math.min(SNARE_END_WARN, 0.3 * (run.maxFocus || SNARE_END_WARN / 0.3));
    function drawSnareEnding(ctx, sn) {
        const run = sn.run;
        // round 6 of the review: on a 10 s first run the warning took half of it; it's at most 30% of the bar
        if (!run) return;
        const warn = snareEndWarn(run);
        if (run.over || sn.preview || run.focus > warn) { sn.endTick = null; return; }
        const C = path.colors, W = sn.cw, H = sn.ch, a = 1 - run.focus / warn;
        const calm = reducedMotion();
        const pulse = calm ? 0.6 : 0.5 + 0.5 * Math.sin(run.time * (5 + 10 * a));
        ctx.save();
        ctx.setTransform(sn.canvas.width / sn.cw, 0, 0, sn.canvas.width / sn.cw, 0, 0);
        // the red edge: four gradients inward from the sides
        const edge = Math.min(W, H) * (0.08 + 0.1 * a);
        const alpha = (0.25 + 0.45 * a) * (0.55 + 0.45 * pulse);
        const side = (x0, y0, x1, y1, rx, ry, rw, rh) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, hexAlpha(C.danger, alpha));
            g.addColorStop(1, hexAlpha(C.danger, 0));
            ctx.fillStyle = g;
            ctx.fillRect(rx, ry, rw, rh);
        };
        try {
            side(0, 0, edge, 0, 0, 0, edge, H);
            side(W, 0, W - edge, 0, W - edge, 0, edge, H);
            side(0, 0, 0, edge, 0, 0, W, edge);
            side(0, H, 0, H - edge, 0, H - edge, W, edge);
        } catch { /* a colour the gradient can't take */ }
        // the last three seconds, large and fading within each second
        const left = Math.ceil(run.focus);
        if (left <= 3 && left > 0) {
            const frac = left - run.focus;            // 0 when the second begins, toward 1 as it ends
            const size = Math.round(Math.min(W, H) * (0.28 - 0.06 * frac));
            ctx.font = `700 ${size}px ${snareMono()}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.6 * (1 - frac) + 0.3;
            ctx.lineWidth = Math.max(3, size / 18);
            ctx.strokeStyle = C.bg;
            // above the middle, where the bubble usually is (round 6: it sat over the catch)
            ctx.strokeText(String(left), W / 2, H * 0.3);
            ctx.fillStyle = C.danger;
            ctx.fillText(String(left), W / 2, H * 0.3);
            ctx.textBaseline = 'alphabetic';
            if (sn.endTick !== left) { sn.endTick = left; sfx('snareFlag', { flags: 4 - left, limit: 3 }); }
        }
        ctx.restore();
    }

    function drawSnareView(ctx, v) {
        ensurePathColors();
        const C = path.colors;
        const { run, effects, k } = v;
        ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        ctx.clearRect(0, 0, v.cw, v.ch);
        const shake = effects.find(f => f.kind === 'shake');
        const jx = shake ? (Math.random() - 0.5) * 6 * (1 - shake.t / shake.life) : 0;
        ctx.save();
        ctx.translate(v.ox + jx, v.oy);
        const W = v.field.w, H = v.field.h;
        // A turned field: a quarter turn clockwise (world x down the screen, y right to left), with every label drawn
        // upright where it lands.
        if (v.turned) {
            ctx.transform(0, 1, -1, 0, H * v.k, 0);
            for (const m of ['fillText', 'strokeText']) {
                const draw = CanvasRenderingContext2D.prototype[m];
                ctx[m] = function (text, x, y, ...rest) { this.save(); this.translate(x, y); this.rotate(-Math.PI / 2); draw.call(this, text, 0, 0, ...rest); this.restore(); };
            }
        }
        // The field: a faint grid, like a scope (a cell every unit, or every two on a big field).
        const gstep = Math.max(1, Math.round(Math.sqrt(W * H) / 8));
        ctx.strokeStyle = C.border;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W + 1e-6; x += gstep) { ctx.moveTo(x * k, 0); ctx.lineTo(x * k, H * k); }
        for (let y = 0; y <= H + 1e-6; y += gstep) { ctx.moveTo(0, y * k); ctx.lineTo(W * k, y * k); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Its edge, always: packets leave over it (it used to show only with the Containment Field).
        ctx.strokeStyle = C.border;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0.75, 0.75, W * k - 1.5, H * k - 1.5);
        ctx.globalAlpha = 1;
        if (!run) { ctx.restore(); return; }
        const d = { ctx, C, k, run, t: run.time, W, H, effects, cw: v.cw, ch: v.ch, ox: v.ox, oy: v.oy, touch: v.touch, minR: v.minR, wallFrom: v.wallFrom,
            pv: run.drawing && (run.wire.length > 1 || run.bubble) ? run.preview() : null };
        // Everything stays on the field: circles, beams and wedges near an edge used to spill into the letterbox.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W * k, H * k);
        ctx.clip();
        for (const layer of SNARE_LAYERS()) layer(d);
        ctx.restore();
        ctx.restore();
        if (v.turned) { delete ctx.fillText; delete ctx.strokeText; }
    }

    // Distance from p to the segment ab (world units).
    function snareSegDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
        return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
    }

    function drawSnareCurrent(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The current: faint streaks drifting the way the data flows, so it's clear where packets come from and go.
        if (run.flow) {
            const fx = run.flow.x, fy = run.flow.y;
            ctx.strokeStyle = C.primary;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.12;
            ctx.beginPath();
            const n = Math.min(200, Math.round(W * H / 6));
            for (let i = 0; i < n; i++) {
                // fixed scattered lanes, each streak sliding along the current and wrapping round the field
                const u = ((i * 0.618034) % 1), v = ((i * 0.381966 + 0.21) % 1);
                const travel = (t * 0.9 + i * 0.37) % (W + H);
                let x = (u * W + fx * travel) % W, y = (v * H + fy * travel) % H;
                if (x < 0) x += W;
                if (y < 0) y += H;
                ctx.moveTo(x * k, y * k);
                ctx.lineTo((x - fx * 0.7) * k, (y - fy * 0.7) * k);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareContain(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The Containment Field: the field's edge glows.
        if (run.opts.contain) {
            ctx.strokeStyle = C.primary;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 3);
            ctx.lineWidth = 3;
            ctx.strokeRect(1, 1, W * k - 2, H * k - 2);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareScanner(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The scanner: beams sweeping from the middle, each with a fading wedge behind it.
        if (run.beams.length) {
            const cx = W / 2 * k, cy = H / 2 * k, R = Math.hypot(W, H) / 2 * k;
            for (const a of run.beams) {
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
                g.addColorStop(0, C.research);
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g;
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, R, a - 0.5, a);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 0.7;
                ctx.strokeStyle = C.research;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareCores(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The Rogue AI's cores: a red circle growing from each, with the shadow of every wall it reaches cut out of it (the
        // circle can't take data through a wall: what's behind one, seen from the core, is safe), and a spinning core at
        // the centre. Each wall's shadow is a wedge from its ends away from the core, clipped out one at a time (round 3:
        // whole half-planes were clipped, so most of a circle could vanish behind a short wall).
        for (const c of [...run.cores, ...run.partners.map(p => ({ ...p, partner: true }))]) {
            const cx = c.x * k, cy = c.y * k, r = c.r * k;
            const col = c.partner ? C.warning : C.danger;
            ctx.save();
            for (const z of run.walls) {
                if (Math.abs(c.x - z.x) > c.r + z.hw || Math.abs(c.y - z.y) > c.r + z.hh) continue;
                ctx.beginPath();
                ctx.rect(-10, -10, W * k + 20, H * k + 20);
                ctx.rect((z.x - z.hw) * k, (z.y - z.hh) * k, z.hw * 2 * k, z.hh * 2 * k);
                ctx.clip('evenodd');
            }
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
            g.addColorStop(0, 'transparent');
            g.addColorStop(1, col);
            ctx.globalAlpha = c.partner ? 0.2 : 0.28;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            // A partner's circle is dashed, and fades as it burns out.
            if (c.partner) { ctx.setLineDash([6, 5]); ctx.globalAlpha = 0.85 * Math.max(0.3, 1 - c.age / run.opts.partnerLife); }
            ctx.stroke();
            ctx.setLineDash([]);
            // rings rippling outward inside it
            for (let i = 0; i < 2; i++) {
                const rr = ((t * 0.8 + i * 0.5) % 1) * r;
                ctx.globalAlpha = 0.3 * (1 - rr / Math.max(1, r));
                ctx.beginPath();
                ctx.arc(cx, cy, rr, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(t * (c.partner ? -1.2 : 2.5));
            ctx.fillStyle = col;
            // A core reads at a glance on any screen: never under 11 px, with a soft pulse round it.
            const cs = Math.max(11, Math.min(18, 0.32 * k));
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5);
            ctx.beginPath();
            ctx.arc(0, 0, cs * 1.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillRect(-cs / 2, -cs / 2, cs, cs);
            ctx.shadowBlur = 0;
            ctx.fillStyle = C.bg;
            ctx.fillRect(-cs / 5, -cs / 5, cs / 2.5, cs / 2.5);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnareFirewalls(d) {
        const { ctx, C, k, run, t, effects } = d;
        // Your Firewalls: a white hatched band (a shield) between two amber posts (yours), its hits left as notches. A wall
        // taken down breaks apart (fwDown).
        const wallBand = (ax, ay, bx, by, alpha, dashed) => {
            const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy * 5, ny = ux * 5;
            ctx.globalAlpha = 0.14 * alpha;
            ctx.fillStyle = C.text;
            ctx.beginPath();
            ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny); ctx.lineTo(bx - nx, by - ny); ctx.lineTo(ax - nx, ay - ny);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.85 * alpha;
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 1.5;
            if (dashed) ctx.setLineDash([6, 5]);
            ctx.beginPath();
            for (let u = 0; u < L; u += 8) { ctx.moveTo(ax + ux * u - nx, ay + uy * u - ny); ctx.lineTo(ax + ux * Math.min(L, u + 5) + nx, ay + uy * Math.min(L, u + 5) + ny); }
            ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny);
            ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(bx - nx, by - ny);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.warning;
            ctx.globalAlpha = alpha;
            for (const [px, py] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill(); }
        };
        // Your Firewall sections (Snare 11): a faint white field with a hatched white border and amber corner posts
        // (yours), green inside with Holding Pen; a health bar along the top once it's been worn, and a red flash on
        // the side an Antivirus is pressing.
        const section = (x, y, hw, hh, alpha, dashed, pen) => {
            const x0 = (x - hw) * k, y0 = (y - hh) * k, W2 = hw * 2 * k, H2 = hh * 2 * k;
            ctx.globalAlpha = (pen ? 0.12 : 0.07) * alpha;
            ctx.fillStyle = pen ? C.success : C.text;
            ctx.fillRect(x0, y0, W2, H2);
            ctx.globalAlpha = 0.85 * alpha;
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 2;
            ctx.setLineDash(dashed ? [6, 5] : [10, 4]);
            ctx.strokeRect(x0, y0, W2, H2);
            ctx.setLineDash([]);
            ctx.fillStyle = C.warning;
            ctx.globalAlpha = alpha;
            for (const [px, py] of [[x0, y0], [x0 + W2, y0], [x0, y0 + H2], [x0 + W2, y0 + H2]]) ctx.fillRect(px - 3.5, py - 3.5, 7, 7);
        };
        for (const f of run.walls) {
            if (f.hp <= 0) continue;
            // Auto-Deploy's sections are dashed and fade out over their last two seconds
            section(f.x, f.y, f.hw, f.hh, f.auto ? Math.min(0.8, Math.max(0.15, (f.until - run.time) / 2)) : 1, !!f.auto, run.opts.pen > 0);
            if (f.hitAt > t - 0.15) {
                ctx.globalAlpha = 0.5;
                ctx.strokeStyle = C.danger;
                ctx.lineWidth = 3;
                ctx.strokeRect((f.x - f.hw) * k, (f.y - f.hh) * k, f.hw * 2 * k, f.hh * 2 * k);
            }
            if (f.hp < f.max) {
                const bw = f.hw * 2 * k - 12, bx = (f.x - f.hw) * k + 6, by = (f.y - f.hh) * k + 5;
                ctx.globalAlpha = 0.9;
                ctx.fillStyle = C.bg;
                ctx.fillRect(bx, by, bw, 4);
                ctx.fillStyle = f.hp / f.max > 0.35 ? C.warning : C.danger;
                ctx.fillRect(bx, by, bw * Math.max(0, f.hp / f.max), 4);
            }
            ctx.globalAlpha = 1;
        }
        // the section being dragged in: dashed where it will land (faint when no slot is free)
        const w = d.wallFrom;
        if (w && !w.id) {
            const grow = Math.sqrt(run.w * run.h / window.PacketSnare.FIELD_AREA);
            const hw = Math.min(run.opts.zoneSize * grow, run.w * 0.45), hh = Math.min(run.opts.zoneSize * grow * 0.7, run.h * 0.45);
            const full = run.walls.filter(f => !f.auto).length + run.rebuild.length >= run.opts.firewalls;
            section(Math.max(hw, Math.min(run.w - hw, w.x)), Math.max(hh, Math.min(run.h - hh, w.y)), hw, hh, full ? 0.3 : 0.75, true, false);
        }
        // sections building themselves again (Great Wall): a dashed outline filling in
        for (const rb of run.rebuild) {
            const z = run.walls[0] || { hw: 1, hh: 0.7 };
            const left = Math.max(0, rb.at - run.time) / Math.max(0.1, run.opts.wallRebuild);
            section(rb.x, rb.y, z.hw * (1 - left * 0.6), z.hh * (1 - left * 0.6), 0.3, true, false);
        }
        ctx.globalAlpha = 1;
        // Everything you own is amber or white and has its own silhouette (round 3: decoys read as gold packets, turrets
        // as the boss's hexagon). Decoys: a hollow amber diamond with a pulse.
        for (const dc of run.decoys) {
            const x = dc.x * k, y = dc.y * k, r = Math.max(7, 0.34 * k);
            ctx.globalAlpha = 0.35 * (1 - ((t * 0.8) % 1));
            ctx.strokeStyle = C.warning;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, r * (1 + 2 * ((t * 0.8) % 1)), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.75, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.75, y);
            ctx.closePath();
            ctx.stroke();
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(x, y - r * 0.45); ctx.lineTo(x + r * 0.32, y); ctx.lineTo(x, y + r * 0.45); ctx.lineTo(x - r * 0.32, y);
            ctx.closePath();
            ctx.stroke();
        }
        // turrets: an amber square mount with a barrel, its reach drawn faintly
        for (const tu of run.turrets) {
            const x = tu.x * k, y = tu.y * k, r = Math.max(7, 0.3 * k);
            ctx.globalAlpha = 0.07;
            ctx.fillStyle = C.warning;
            ctx.beginPath();
            ctx.arc(x, y, run.opts.turretRange * k, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.bg;
            ctx.strokeStyle = C.warning;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
            ctx.fill();
            ctx.stroke();
            const aim = tu.aim ?? -Math.PI / 2;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(aim) * r * 1.4, y + Math.sin(aim) * r * 1.4);
            ctx.stroke();
            ctx.fillStyle = C.warning;
            ctx.beginPath();
            ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
        // scanner towers: a white mast on a tripod, its short violet beam turning round it
        for (const tw of run.towers) {
            const x = tw.x * k, y = tw.y * k, R = run.opts.towerRange * k;
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = C.research;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, R, tw.ang - 0.45, tw.ang);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = C.research;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(tw.ang) * R, y + Math.sin(tw.ang) * R);
            ctx.stroke();
            ctx.globalAlpha = 1;
            const m = Math.max(7, 0.3 * k);
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - m); ctx.lineTo(x, y + m * 0.6);
            ctx.moveTo(x - m * 0.6, y + m); ctx.lineTo(x, y + m * 0.2); ctx.lineTo(x + m * 0.6, y + m);
            ctx.stroke();
            ctx.fillStyle = C.research;
            ctx.beginPath();
            ctx.arc(x, y - m, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // a wall going down breaks apart; something placed flashes; a purge burns the corrupt packets away
        for (const f of effects) {
            const a = 1 - f.t / f.life;
            if (f.kind === 'fwDown') {
                ctx.globalAlpha = a;
                ctx.strokeStyle = C.text;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 6]);
                ctx.lineDashOffset = -f.t * 40;
                ctx.beginPath();
                ctx.moveTo(f.a.x * k, (f.a.y + f.t) * k);
                ctx.lineTo(f.b.x * k, (f.b.y + f.t) * k);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineDashOffset = 0;
            } else if (f.kind === 'placed') {
                ctx.globalAlpha = a;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(f.x * k, f.y * k, (0.3 + f.t * 2) * k, 0, Math.PI * 2);
                ctx.stroke();
            } else if (f.kind === 'purge') {
                ctx.fillStyle = C.danger;
                for (const p of f.packets) {
                    ctx.globalAlpha = a;
                    ctx.beginPath();
                    ctx.arc(p.x * k, (p.y - f.t * 0.8) * k, Math.max(2, 0.3 * k * a), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareSweeps(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Full Scans (system Firewalls): the edge they start from flashes while they warn, with chevrons marching the way
        // it will go and its name, then a red line sweeps across the field.
        for (const sw of run.sweeps) {
            const warn = run.opts.sweepWarn;
            const vertical = sw.axis === 'x';   // sweeping along x: a vertical line
            if (sw.t < warn) {
                const on = Math.floor(sw.t * 8) % 2 === 0;
                // A band along the edge it starts from, not a tint over the whole field (round 4: with the boss and
                // cores also red, the tint made red mean nothing in particular).
                const band = 70;
                ctx.globalAlpha = on ? 0.16 : 0.07;
                ctx.fillStyle = C.danger;
                if (vertical) ctx.fillRect(sw.pos * k - (sw.dir > 0 ? 0 : band), 0, band, H * k);
                else ctx.fillRect(0, sw.pos * k - (sw.dir > 0 ? 0 : band), W * k, band);
                ctx.globalAlpha = on ? 0.95 : 0.4;
                const th = 12;
                if (vertical) ctx.fillRect(sw.pos * k - (sw.dir > 0 ? 0 : th), 0, th, H * k);
                else ctx.fillRect(0, sw.pos * k - (sw.dir > 0 ? 0 : th), W * k, th);
                // chevrons along the edge, moving in from it
                ctx.strokeStyle = C.danger;
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = 0.8;
                const span = vertical ? H * k : W * k, step = 46, c = 9;
                const inset = 18 + (sw.t / warn) * 26;
                ctx.beginPath();
                for (let u = step / 2; u < span; u += step) {
                    const x0 = vertical ? sw.pos * k + sw.dir * inset : u, y0 = vertical ? u : sw.pos * k + sw.dir * inset;
                    if (vertical) { ctx.moveTo(x0 - sw.dir * c, y0 - c); ctx.lineTo(x0, y0); ctx.lineTo(x0 - sw.dir * c, y0 + c); }
                    else { ctx.moveTo(x0 - c, y0 - sw.dir * c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0 - sw.dir * c); }
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.fillStyle = C.danger;
                ctx.font = `700 12px ${snareMono()}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (vertical) ctx.fillText('FULL SCAN', sw.pos * k + sw.dir * 56, H * k / 2);
                else ctx.fillText('FULL SCAN', W * k / 2, sw.pos * k + sw.dir * 56);
                continue;
            }
            const p = sw.pos * k;
            const trail = 26 * -sw.dir;
            const g = vertical ? ctx.createLinearGradient(p, 0, p + trail, 0) : ctx.createLinearGradient(0, p, 0, p + trail);
            g.addColorStop(0, C.danger);
            g.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = g;
            if (vertical) ctx.fillRect(Math.min(p, p + trail), 0, Math.abs(trail), H * k);
            else ctx.fillRect(0, Math.min(p, p + trail), W * k, Math.abs(trail));
            ctx.globalAlpha = 1;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = C.danger;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            if (vertical) { ctx.moveTo(p, 0); ctx.lineTo(p, H * k); } else { ctx.moveTo(0, p); ctx.lineTo(W * k, p); }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnareLoops(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Catches, spoils and empty loops: the loop flashes and fades.
        for (const f of effects) {
            if (!f.poly) continue;
            const a = 1 - f.t / (f.life || SNARE_FX);
            const col = f.kind === 'catch' ? C.primary : f.kind === 'corrupt' ? C.danger : C.muted;
            // It shrinks into its middle as it fades, through its points' midpoints so a bubble reads round (round 4 of
            // the review: a released bubble's 32-sided ghost sat over a third of the field for a second).
            const sh = 1 - 0.45 * (1 - a), cx = f.x, cy = f.y, n = f.poly.length;
            const at = i => { const q = f.poly[(i + n) % n]; return [(cx + (q.x - cx) * sh) * k, (cy + (q.y - cy) * sh) * k]; };
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const [x0, y0] = at(i), [x1, y1] = at(i + 1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(x0, y0, mx, my);
            }
            ctx.closePath();
            ctx.globalAlpha = 0.22 * a * a;
            ctx.fillStyle = col;
            ctx.fill();
            ctx.globalAlpha = 0.9 * a * a;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.stroke();
            // the snared packets fly to the loop's middle and vanish
            if (f.packets) {
                const m = Math.min(1, f.t / 0.35);
                for (const p of f.packets) {
                    const x = p.x + (f.x - p.x) * m, y = p.y + (f.y - p.y) * m;
                    ctx.globalAlpha = a;
                    ctx.fillStyle = p.kind === 'corrupt' ? C.danger : p.kind === 'gold' ? C.warning : C.primary;
                    ctx.beginPath();
                    ctx.arc(x * k, y * k, p.r * k * (1 - 0.6 * m), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        // Split: the bubbles a full one forked into, waiting a moment to catch.
        for (const kd of run.splits || []) {
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.lineDashOffset = -t * 20;
            ctx.beginPath();
            ctx.arc(kd.x * k, kd.y * k, kd.r * k, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = C.success;
            ctx.fill();
        }
        ctx.lineDashOffset = 0;
        ctx.globalAlpha = 1;
        // Race Condition: the loop you're holding open, pulsing faster as its multiplier grows (its label and meter: drawSnareRaceLabel).
        const r = run.race;
        if (r) {
            ctx.beginPath();
            r.poly.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
            ctx.closePath();
            ctx.globalAlpha = 0.16 + 0.1 * Math.sin(r.t * (6 + 6 * r.bonus));
            ctx.fillStyle = C.success;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = C.success;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -r.t * 30;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
        ctx.globalAlpha = 1;
    }

    // Race Condition's label and meter, drawn over the packets so a busy field never hides them.
    function drawSnareRaceLabel(d) {
        const { ctx, C, k, run } = d;
        // A full bubble held still (Snare 15): the meter under it fills toward the hold's top.
        const bb = run.bubble;
        if (bb?.full && run.opts.race) {
            const full = Math.min(1, (bb.bonus || 0) / Math.max(0.01, run.opts.raceMax)), cx = bb.x * k, cy = (bb.y + bb.r) * k + 14, rad = 8;
            ctx.lineWidth = 3;
            ctx.strokeStyle = C.bg;
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = C.success;
            ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + full * Math.PI * 2); ctx.stroke();
        }
        const r = run.race;
        if (!r) return;
        const P = window.PacketSnare;
        const mult = P.areaMult(P.polygonArea(r.poly), run.opts, run.w * run.h) * (1 + r.bonus);
        const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 });
        ctx.font = `700 15px ${snareMono()}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        const text = `HOLD ×${mult.toFixed(1)}`;
        ctx.strokeText(text, c.x * k, c.y * k);
        ctx.fillStyle = C.success;
        ctx.fillText(text, c.x * k, c.y * k);
        // The meter (review 1: make the growth readable): a ring under the label filling toward the hold's top.
        const full = Math.min(1, r.bonus / Math.max(0.01, run.opts.raceMax)), cy = c.y * k + 16, rad = 9;
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        ctx.beginPath(); ctx.arc(c.x * k, cy, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.success;
        ctx.beginPath(); ctx.arc(c.x * k, cy, rad, -Math.PI / 2, -Math.PI / 2 + full * Math.PI * 2); ctx.stroke();
    }

    function drawSnarePreview(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The open loop's preview: its shape filled faintly, a dashed line back to the start, the packets it would
        // take ringed, and what it's worth by the pen ("×2.4 · 7", or red when a corrupt packet would spoil it).
        if (pv) {
            const col = pv.spoiled ? C.danger : C.success;
            ctx.beginPath();
            run.wire.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
            ctx.closePath();
            ctx.globalAlpha = pv.near ? 0.2 : 0.09;
            ctx.fillStyle = col;
            ctx.fill();
            ctx.globalAlpha = 1;
            // Rings in two batched paths (one stroke each, however many packets are inside).
            ctx.lineWidth = 1.5;
            const rings = { good: new Path2D(), bad: new Path2D() };
            for (const p of pv.inside) {
                const bad = p.kind === 'corrupt';
                const path = bad ? rings.bad : rings.good, rr = p.r * k + 4;
                path.moveTo(p.x * k + rr, p.y * k);
                path.arc(p.x * k, p.y * k, rr, 0, Math.PI * 2);
            }
            ctx.strokeStyle = C.success;
            ctx.stroke(rings.good);
            ctx.lineWidth = 2;
            ctx.strokeStyle = C.danger;
            ctx.stroke(rings.bad);
        }
        ctx.globalAlpha = 1;
    }

    function drawSnarePackets(d) {
        const { ctx, C, k, run, t } = d;
        // Packets: arrowheads swimming the way they head, in batches (one path a colour: a datacentre's field holds
        // hundreds, and a save/rotate/fill each was most of a frame): data blue, gold amber, corrupt red with a dark edge,
        // drawn last so it never hides inside a school. A tagged packet keeps its colour with a violet edge (round 3: a
        // violet fill saturated the field and read as a herder), and a spoofed corrupt one passes as blue with a dashed
        // red edge. Gold ones glow (a soft disc, capped in px). Never under 5 px across their middle.
        const minR = (d.minR ?? 5) * Math.min(1, (run.opts?.packetR ?? window.PacketSnare.PACKET_R) / window.PacketSnare.PACKET_R);
        const paths = { good: new Path2D(), gold: new Path2D(), bad: new Path2D(), tagEdge: new Path2D(), spoofEdge: new Path2D() };
        const glow = { gold: new Path2D(), bad: new Path2D() };
        // A red packet an Escort bot is turning regular wears a ring in the good colour that fills as it gets there.
        const turnRing = new Path2D(), o = run.opts || {};
        const turnOf = p => (p.vouch > 0 && o.escortTime ? p.vouch / o.escortTime : 0);
        // Red keeps its size however full the field (round 1 of the review: on a maxed field red packets shrank with the
        // rest and vanished), and on a crowded one wears a red halo.
        const redMin = Math.max(minR, d.minR ?? 6.5), crowded = run.packets.length > 120;
        const arrow = (path, x, y, ang, L, Wd) => {
            const c = Math.cos(ang), sn = Math.sin(ang);
            const pt = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
            // closed by a line back to the tip, not closePath(): on a full field closePath was 30% of a frame (profiled)
            const tip = pt(L, 0);
            path.moveTo(...tip); path.lineTo(...pt(-L * 0.7, Wd)); path.lineTo(...pt(-L * 0.35, 0)); path.lineTo(...pt(-L * 0.7, -Wd)); path.lineTo(...tip);
        };
        for (const p of run.packets) {
            const r = Math.max(minR, p.r * k);
            const x = p.x * k, y = p.y * k, ang = Math.atan2(p.vy, p.vx);
            if (p.kind === 'corrupt') {
                if (p.spoof > t) { arrow(paths.good, x, y, ang, r * 1.25, r * 0.75); arrow(paths.spoofEdge, x, y, ang, r * 1.25, r * 0.75); }
                // a little bigger than a good one, with a heavier dark edge: a different silhouette, not only a colour
                else {
                    const rr = Math.max(redMin, r);
                    arrow(paths.bad, x, y, ang, rr * 1.45, rr * 0.95);
                    if (crowded) { const hr = Math.min(rr * 2.4, 16); glow.bad.moveTo(x + hr, y); glow.bad.arc(x, y, hr, 0, Math.PI * 2); }
                    const turn = Math.min(1, turnOf(p));
                    if (turn > 0.02) {
                        const tr = rr * 1.9, a0 = -Math.PI / 2;
                        turnRing.moveTo(x + tr * Math.cos(a0), y + tr * Math.sin(a0));
                        turnRing.arc(x, y, tr, a0, a0 + Math.PI * 2 * turn);
                    }
                }
                continue;
            }
            const gold = p.kind === 'gold', tagged = p.tag > t;
            if (gold) {
                const gr = Math.min(r * 2.1, 18);
                glow.gold.moveTo(x + gr, y);
                glow.gold.arc(x, y, gr, 0, Math.PI * 2);
            }
            const L = gold ? r * 1.5 : r * 1.25, Wd = gold ? r * 0.9 : r * 0.7;
            arrow(gold ? paths.gold : paths.good, x, y, ang, L, Wd);
            if (tagged) arrow(paths.tagEdge, x, y, ang, L + Math.min(2, r * 0.35), Wd + Math.min(1.5, r * 0.25));
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = C.warning;
        ctx.fill(glow.gold);
        ctx.globalAlpha = 1;
        // the packets' own tokens (Snare 12.7, a theme audit: in Red and Soft pink good packets sat beside the red ones,
        // and in Arcade a tag's magenta edge read as a red packet)
        const good = C['snare-good'] || C.primary, bad = C['snare-bad'] || C.danger, tagCol = C['snare-tag'] || C.research;
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = tagCol;
        // fainter on a crowded field (round 2 of the review: with towers everywhere the whole field read violet)
        ctx.globalAlpha = crowded ? 0.45 : 1;
        ctx.stroke(paths.tagEdge);
        ctx.globalAlpha = 1;
        ctx.fillStyle = good;
        ctx.fill(paths.good);
        ctx.fillStyle = C.warning;
        ctx.fill(paths.gold);
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = bad;
        ctx.stroke(paths.spoofEdge);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = bad;
        ctx.fill(glow.bad);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        ctx.stroke(paths.bad);
        ctx.fillStyle = bad;
        ctx.fill(paths.bad);
        ctx.lineWidth = 2;
        ctx.strokeStyle = good;
        ctx.globalAlpha = 0.85;
        ctx.stroke(turnRing);
        ctx.globalAlpha = 1;
    }

    // Frozen: the field goes cold and still, a faint frost over it.
    // Tools that placed themselves (Snare 13): a thin amber arc round each, running down its life, blinking at the end.
    function drawSnareToolLife(d) {
        const { ctx, C, k, run, t } = d;
        for (const list of [run.decoys, run.turrets, run.towers]) {
            for (const it of list || []) {
                if (!it.auto || !it.until) continue;
                const life = Math.max(0, (it.until - run.time) / Math.max(0.1, it.until - (it.born ?? it.until - 10)));
                const r = Math.max(12, 0.5 * k);
                ctx.globalAlpha = it.until - run.time < 2 ? 0.35 + 0.35 * Math.sin(t * 14) : 0.55;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(it.x * k, it.y * k, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * life);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }
    // Freeze and purge pickups (Snare 13): a disc that bobs and pulses, a glyph (a snowflake's six spokes; a crossed-out
    // red arrowhead), its name, and a ring running down the time left to grab it.
    function drawSnarePickups(d) {
        const { ctx, C, k, run, t } = d;
        for (const pk of run.pickups || []) {
            const x = pk.x * k, y = pk.y * k + Math.sin(t * 3 + pk.id) * 2;
            const r = Math.max(14, (run.opts.pickupReach || 0.9) * k * 0.75);
            const col = pk.kind === 'freeze' ? (C['snare-good'] || C.primary) : C.warning;
            const left = Math.max(0, (pk.until - run.time) / Math.max(0.1, pk.until - pk.born));
            // its glow, pulsing
            ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 6);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = C.bg;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // time left
            ctx.lineWidth = 3;
            ctx.globalAlpha = left < 0.3 ? 0.5 + 0.5 * Math.sin(t * 16) : 0.9;
            ctx.beginPath();
            ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2;
            if (pk.kind === 'freeze') {
                for (let i = 0; i < 3; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(x - Math.cos(a) * r * 0.6, y - Math.sin(a) * r * 0.6);
                    ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
                    ctx.stroke();
                }
            } else {
                const bad = C['snare-bad'] || C.danger, a = r * 0.45;
                ctx.fillStyle = bad;
                ctx.beginPath();
                ctx.moveTo(x + a, y); ctx.lineTo(x - a * 0.7, y + a * 0.6); ctx.lineTo(x - a * 0.35, y); ctx.lineTo(x - a * 0.7, y - a * 0.6);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = col;
                ctx.beginPath();
                ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6);
                ctx.stroke();
            }
            ctx.font = `700 11px ${snareMono()}`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = C.bg;
            const label = pk.kind === 'freeze' ? 'FREEZE' : 'PURGE';
            ctx.strokeText(label, x, y + r + 18);
            ctx.fillStyle = col;
            ctx.fillText(label, x, y + r + 18);
            ctx.textAlign = 'left';
        }
    }

    function drawSnareFrozen(d) {
        const { ctx, C, k, run, W, H } = d;
        if (!run.frozen?.()) return;
        const left = run.frozenLeft / Math.max(0.1, run.opts.freezeSeconds);
        ctx.globalAlpha = 0.12 + 0.08 * left;
        ctx.fillStyle = C.primary;
        ctx.fillRect(0, 0, W * k, H * k);
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = C.primary;
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, W * k - 3, H * k - 3);
        // what's left of it, on the field (it used to replace Focus in the HUD)
        ctx.globalAlpha = 0.9;
        ctx.font = `700 12px ${snareMono()}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        const txt = `FROZEN ${run.frozenLeft.toFixed(1)} s`;
        ctx.strokeText(txt, W * k / 2, 18);
        ctx.fillStyle = C.primary;
        ctx.fillText(txt, W * k / 2, 18);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    // Mines a bubble grabbed (Snare 15): amber diamonds in a bubble's skin, a ring draining with the time left, and a
    // dashed line to the boss until the first throw (flick from it at the boss).
    function drawSnareHeld(d) {
        const { ctx, C, k, run, t } = d;
        if (!run.held?.length) return;
        const P = window.PacketSnare, r = Math.max(8, P.MINE_R * k);
        for (const m of run.held) {
            const x = m.x * k, y = m.y * k, left = Math.max(0, (m.until - run.time) / run.opts.mineHold);
            if (run.boss && !state.intro['snare:thrown']) {
                ctx.globalAlpha = 0.5;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 5]);
                ctx.lineDashOffset = -t * 30;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(run.boss.x * k, run.boss.y * k); ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineDashOffset = 0;
            }
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 8);
            ctx.fillStyle = C.warning;
            ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.bg;
            ctx.strokeStyle = C.warning;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = C.text;
            ctx.beginPath(); ctx.arc(x, y, r * 1.6, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // The boss's mines and nets: red spiked diamonds, the nets growing between them as dashed lines that fill in, a
    // finished net solid with its quarantined triangle hatched; while any stands, a dashed tether to the boss (its shield).
    function drawSnareMines(d) {
        const { ctx, C, k, run, t } = d;
        drawSnareHeld(d);
        if (!run.mines?.length) return;
        const P = window.PacketSnare, o = run.opts;
        const byId = id => run.mines.find(m => m.id === id);
        for (const tri of run.netAreas()) {
            ctx.beginPath();
            tri.forEach((m, i) => (i ? ctx.lineTo(m.x * k, m.y * k) : ctx.moveTo(m.x * k, m.y * k)));
            ctx.closePath();
            ctx.globalAlpha = 0.12 + 0.04 * Math.sin(t * 4);
            ctx.fillStyle = C.danger;
            ctx.fill();
            ctx.save();
            ctx.clip();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const xs = tri.map(m => m.x * k), ys = tri.map(m => m.y * k);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            for (let u = x0 - (y1 - y0); u < x1; u += 9) { ctx.moveTo(u, y1); ctx.lineTo(u + (y1 - y0), y0); }
            ctx.stroke();
            ctx.restore();
        }
        for (const l of run.links) {
            const A = byId(l.a), B = byId(l.b);
            if (!A || !B) continue;
            const f = Math.min(1, l.t / o.netTime), done = f >= 1;
            ctx.strokeStyle = C.danger;
            ctx.globalAlpha = done ? 0.85 : 0.35;
            ctx.lineWidth = done ? 2.5 : 1.5;
            ctx.setLineDash(done ? [] : [4, 5]);
            ctx.beginPath();
            ctx.moveTo(A.x * k, A.y * k);
            ctx.lineTo(B.x * k, B.y * k);
            ctx.stroke();
            ctx.setLineDash([]);
            if (!done) {
                // growing in from both ends
                const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(A.x * k, A.y * k);
                ctx.lineTo((A.x + (mx - A.x) * f) * k, (A.y + (my - A.y) * f) * k);
                ctx.moveTo(B.x * k, B.y * k);
                ctx.lineTo((B.x + (mx - B.x) * f) * k, (B.y + (my - B.y) * f) * k);
                ctx.stroke();
            }
        }
        // the shield's tethers
        if (run.boss) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 6]);
            ctx.lineDashOffset = -t * 20;
            ctx.beginPath();
            for (const m of run.mines) { ctx.moveTo(run.boss.x * k, run.boss.y * k); ctx.lineTo(m.x * k, m.y * k); }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
        // bigger, with eight spikes (round 4 of the review: among red arrowheads a mine read as one more red packet)
        const r = Math.max(10, P.MINE_R * k);
        for (const m of run.mines) {
            const x = m.x * k, y = m.y * k, pulse = 0.5 + 0.5 * Math.sin(t * 6 + m.id);
            ctx.globalAlpha = 0.2 + 0.2 * pulse;
            ctx.fillStyle = C.danger;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
            ctx.fill();
            // a pulsing danger ring round it (the owner's call: the threat shown, not labelled)
            if (!reducedMotion()) {
                ctx.globalAlpha = 0.7 * (1 - pulse);
                ctx.strokeStyle = C.danger;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, r * (1.9 + 1.1 * pulse), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.bg;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // spikes
            ctx.beginPath();
            for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); ctx.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5); }
            ctx.stroke();
            ctx.fillStyle = C.danger;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // The boss Antivirus: a big red hexagon with its health round it (a ring of segments, or an arc and a number for a
    // big one), its charge's warning line with amber ticks where a flick parries it, a shield of hexagons while its mines
    // stand, and while it reels (the slash window) an amber outline, a countdown and SLASH.
    function drawSnareBoss(d) {
        const { ctx, C, k, run, t } = d;
        const b = run.boss;
        if (!b) return;
        const x = b.x * k, y = b.y * k, r = Math.max(16, b.r * k);
        const reeling = b.stunned > t;
        const col = reeling ? C.warning : C.danger;
        if (b.charge && b.charge.t < b.charge.warn) {
            // The warning: a wide red zone along where it will charge, a countdown filling it, and a hand-drawn swipe
            // across it showing the gesture (the owner couldn't tell what to do, and the old thin line was mostly
            // hidden inside a big boss).
            const L = run.chargeReach(b) * k;
            const dx = b.charge.dx, dy = b.charge.dy, nx = -dy, ny = dx;
            const sx0 = x + dx * r, sy0 = y + dy * r, ex = x + dx * L, ey = y + dy * L;
            const left = 1 - b.charge.t / b.charge.warn;
            const band = Math.max(14, Math.max(0.5, 0.04 * Math.min(run.w, run.h)) * k);
            ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 20);
            ctx.fillStyle = C.danger;
            ctx.beginPath();
            ctx.moveTo(sx0 + nx * band, sy0 + ny * band); ctx.lineTo(ex + nx * band, ey + ny * band);
            ctx.lineTo(ex - nx * band, ey - ny * band); ctx.lineTo(sx0 - nx * band, sy0 - ny * band);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
            // the time left: the solid part of the line shrinks back toward the boss
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx0 + (ex - sx0) * left, sy0 + (ey - sy0) * left);
            ctx.stroke();
            // Snare 12: without Riposte the answer is a loop round it while it stands to charge (a dashed amber ring
            // drawing itself round it, and the words until you've done it once); with Riposte, the parry's swipe.
            if (!run.opts.parry) {
                const lr = r + Math.max(18, run.closeR * k * 1.1), ph = (t * 0.9) % 1;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.globalAlpha = 0.9;
                ctx.beginPath();
                ctx.arc(x, y, lr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ph * 1.25));
                ctx.stroke();
                ctx.setLineDash([]);
                if (!state.intro['snare:looped']) {
                    const label = (run.opts.bossLoops || 1) > 1 ? `LOOP ROUND IT ×${run.opts.bossLoops}` : 'LOOP ROUND IT';
                    ctx.font = `700 13px ${snareMono()}`;
                    ctx.textAlign = 'center';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = C.bg;
                    const FW = run.w * k, tw = ctx.measureText(label).width;
                    const lx = Math.max(tw / 2 + 4, Math.min(FW - tw / 2 - 4, x)), ly = Math.max(14, y - lr - 10);
                    ctx.strokeText(label, lx, ly);
                    ctx.fillStyle = C.warning;
                    ctx.fillText(label, lx, ly);
                }
            } else {
                // the gesture: an amber arrow sweeping across the line, again and again
                const mx = sx0 + (ex - sx0) * 0.55, my = sy0 + (ey - sy0) * 0.55;
                const span = band + 26, ph = (t * 2.2) % 1;
                const from = -span, to = span, cur = from + (to - from) * Math.min(1, ph * 1.3);
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.globalAlpha = 0.95 * (1 - Math.max(0, ph - 0.75) * 4);
                ctx.beginPath();
                ctx.moveTo(mx + nx * from, my + ny * from);
                ctx.lineTo(mx + nx * cur, my + ny * cur);
                ctx.stroke();
                // its arrowhead
                const hx = mx + nx * cur, hy = my + ny * cur;
                ctx.beginPath();
                ctx.moveTo(hx - nx * 9 + dx * 7, hy - ny * 9 + dy * 7);
                ctx.lineTo(hx, hy);
                ctx.lineTo(hx - nx * 9 - dx * 7, hy - ny * 9 - dy * 7);
                ctx.stroke();
                // what to do, in words, until you've parried once
                const label = state.intro['snare:parried'] ? 'PARRY' : 'SWIPE ACROSS TO PARRY';
                ctx.globalAlpha = 1;
                ctx.font = `700 13px ${snareMono()}`;
                ctx.textAlign = 'center';
                ctx.lineWidth = 3;
                ctx.strokeStyle = C.bg;
                // kept inside the field, on whichever side of the line has room
                const tw = ctx.measureText(label).width, FW = run.w * k, FH = run.h * k;
                let side = span + 16;
                const fits = q => q.x > tw / 2 + 4 && q.x < FW - tw / 2 - 4 && q.y > 14 && q.y < FH - 6;
                if (!fits({ x: mx + nx * side, y: my + ny * side + 4 }) && fits({ x: mx - nx * side, y: my - ny * side + 4 })) side = -side;
                const lx = Math.max(tw / 2 + 4, Math.min(FW - tw / 2 - 4, mx + nx * side)), ly = Math.max(14, Math.min(FH - 6, my + ny * side + 4));
                ctx.strokeText(label, lx, ly);
                ctx.fillStyle = C.warning;
                ctx.fillText(label, lx, ly);
            }
            ctx.globalAlpha = 1;
        }
        if (b.enraged) {
            ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 10);
            ctx.fillStyle = C.danger;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (reeling ? 4 : 0.8));
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = col;
        const hex = rr => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); };
        hex(r);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        hex(r);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        hex(r * 0.55);
        ctx.stroke();
        ctx.restore();
        // the shield: a second hexagon outside it, while its mines stand, and a pulsing danger glow round it
        if (b.shielded) {
            if (!reducedMotion()) {
                const ph = (t * 1.6) % 1;
                ctx.globalAlpha = 0.28 * (1 - ph);
                ctx.fillStyle = C.danger;
                ctx.beginPath();
                ctx.arc(x, y, r * (1.5 + 0.7 * ph), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-t * 0.6);
            ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 5);
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            hex(r * 1.35);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        // its health: segments round it while there are few, an arc and a number once there are many
        const ringR = r + (b.shielded ? r * 0.35 + 6 : 8);
        ctx.lineWidth = 4;
        if (b.maxHp <= 12) {
            const segs = b.maxHp, gap = Math.min(0.12, Math.PI / segs / 3);
            for (let i = 0; i < segs; i++) {
                const a0 = -Math.PI / 2 + i * Math.PI * 2 / segs + gap, a1 = -Math.PI / 2 + (i + 1) * Math.PI * 2 / segs - gap;
                ctx.strokeStyle = i < b.hp ? C.danger : C.border;
                ctx.beginPath();
                ctx.arc(x, y, ringR, a0, a1);
                ctx.stroke();
            }
        } else {
            ctx.strokeStyle = C.border;
            ctx.beginPath();
            ctx.arc(x, y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = C.danger;
            ctx.beginPath();
            ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.hp / b.maxHp);
            ctx.stroke();
        }
        ctx.font = `700 11px ${snareMono()}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        const hpText = `${b.hp}/${b.maxHp}`;
        ctx.strokeText(hpText, x, y + ringR + 14);
        ctx.fillStyle = C.danger;
        ctx.fillText(hpText, x, y + ringR + 14);
        // the slash window: a countdown ring and SLASH (or what's stopping it)
        if (reeling) {
            const left = Math.max(0, (b.stunned - t) / Math.max(0.5, run.opts.bossStun));
            ctx.strokeStyle = C.warning;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(x, y, r * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, left));
            ctx.stroke();
            ctx.font = `700 14px ${snareMono()}`;
            const label = b.shielded ? 'SHIELDED' : 'SLASH!';
            ctx.lineWidth = 3;
            ctx.strokeStyle = C.bg;
            ctx.strokeText(label, x, y - ringR - 8);
            ctx.fillStyle = b.shielded ? C.danger : C.warning;
            ctx.fillText(label, x, y - ringR - 8);
        }
        // Loops taken toward a stun (Snare 12.7: it takes more than one): a pip each round it, counted ones lit, the lit
        // ones fading as the window to loop it again runs out
        const need = run.opts.bossLoops || 1;
        if (!reeling && need > 1 && b.loops > 0) {
            const left = Math.max(0, 1 - (run.time - (b.loopAt ?? 0)) / run.opts.bossLoopWindow);
            if (left > 0) {
                const pr = r + 12, gap = 0.22;
                for (let i = 0; i < need; i++) {
                    const a0 = -Math.PI / 2 + (i / need) * Math.PI * 2 + gap / 2, a1 = a0 + Math.PI * 2 / need - gap;
                    ctx.globalAlpha = i < b.loops ? 0.35 + 0.6 * left : 0.3;
                    ctx.strokeStyle = i < b.loops ? C.warning : C.muted;
                    ctx.lineWidth = i < b.loops ? 5 : 2;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, a0, a1);
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareHerders(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Bots (Snare 11): small round drones of yours. A Cleaner bot white with an amber ring and a sweep across it; a
        // Spoofer bot amber with a dashed white ring.
        for (const b of run.bots || []) {
            const x = b.x * k, y = b.y * k, r = 6.5;
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2;
            if (b.kind === 'clean') {
                ctx.fillStyle = C.text;
                ctx.strokeStyle = C.warning;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = C.bg;
                ctx.beginPath(); ctx.moveTo(x - 3.5, y + 2.5); ctx.lineTo(x + 3.5, y - 2.5); ctx.stroke();
            } else if (b.kind === 'collect') {
                // A Collector bot (Snare 14): white with an amber net across it, its reach a faint ring that fills as it
                // gets ready to net again.
                const R = run.opts.collectR * Math.sqrt(run.grow || 1) * k;
                const ready = Math.max(0, Math.min(1, 1 - (b.ready - t) / run.opts.collectEvery));
                ctx.globalAlpha = 0.12 + 0.18 * ready;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.lineWidth = 2;
                ctx.fillStyle = C.text;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x - 4, y - 2); ctx.lineTo(x + 4, y - 2); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x + 4, y + 2);
                ctx.moveTo(x - 2, y - 4.5); ctx.lineTo(x - 2, y + 4.5); ctx.moveTo(x + 2, y - 4.5); ctx.lineTo(x + 2, y + 4.5);
                ctx.stroke();
            } else if (b.kind === 'bounce') {
                // A Bouncer bot: amber, with a white chevron (it shoves).
                ctx.fillStyle = C.warning;
                ctx.strokeStyle = C.text;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                const a = Math.atan2(b.vy, b.vx) || 0, c = Math.cos(a), sn = Math.sin(a);
                ctx.strokeStyle = C.bg;
                ctx.beginPath();
                ctx.moveTo(x - 2.5 * c + 3 * sn, y - 2.5 * sn - 3 * c); ctx.lineTo(x + 2.5 * c, y + 2.5 * sn); ctx.lineTo(x - 2.5 * c - 3 * sn, y - 2.5 * sn + 3 * c);
                ctx.stroke();
            } else if (b.kind === 'escort') {
                // An Escort bot: white with a ring in the good colour, its reach a faint disc round it.
                const R = run.opts.escortR * Math.sqrt(run.grow || 1) * k, good = C['snare-good'] || C.primary;
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = good;
                ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 0.35;
                ctx.strokeStyle = good;
                ctx.lineWidth = 1.2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
                ctx.lineWidth = 2.5;
                ctx.fillStyle = C.text;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            } else if (b.tower) {
                // Towers: a white mast on an amber base; a Checksum tower's reach a ring in the good colour that fills as
                // it gets ready, a Jammer's a slow violet pulse.
                const check = b.kind === 'check';
                const R = (check ? run.opts.checkR : run.opts.jamR) * Math.sqrt(run.grow || 1) * k;
                const col = check ? (C['snare-good'] || C.primary) : C.research;
                const ready = check ? Math.max(0, Math.min(1, 1 - (b.ready - t) / run.opts.checkEvery)) : 0.5 + 0.5 * Math.sin(t * 3);
                ctx.globalAlpha = check ? 0.25 + 0.2 * ready : 0.07 + 0.06 * ready;
                ctx.strokeStyle = col;
                ctx.fillStyle = col;
                ctx.lineWidth = 1.5;
                if (check) { ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2); ctx.stroke(); }
                else { ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); }
                ctx.globalAlpha = 1;
                ctx.fillStyle = C.warning;
                ctx.fillRect(x - 6, y + 4, 12, 3);
                ctx.strokeStyle = C.text;
                ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y - 8); ctx.stroke();
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.arc(x, y - 9, 3.5, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillStyle = C.warning;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = C.text;
                ctx.setLineDash([3, 3]);
                ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        // Herders: amber quadcopter drones (yours: round 3's violet arrowheads read as tagged packets), their reach drawn
        // faintly round them; grey and still, with sparks, while an Antivirus has them stunned.
        for (const hd of run.herders || []) {
            const x = hd.x * k, y = hd.y * k;
            const out = hd.stunned > t;
            const col = out ? C.muted : C.warning;
            if (!out) {
                ctx.globalAlpha = 0.05;
                ctx.fillStyle = C.warning;
                ctx.beginPath();
                ctx.arc(x, y, run.opts.herdRadius * k, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(out ? 0.4 : t * 0.6);
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6);
            ctx.stroke();
            ctx.lineWidth = 1.5;
            for (const [rx, ry] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) {
                ctx.beginPath();
                ctx.arc(rx, ry, 3.2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fillStyle = col;
            ctx.fillRect(-2.5, -2.5, 5, 5);
            ctx.restore();
            if (out && Math.floor(t * 10) % 2 === 0) {
                ctx.fillStyle = C.text;
                ctx.fillRect(x + 7, y - 9, 2, 2);
                ctx.fillRect(x - 9, y + 6, 2, 2);
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareLasers(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Your Targeted Laser (amber, like the main action: yours, never a hazard's red): its emitters on the edges (a
        // notch pointing in, its reach a faint half-disc), then brackets closing in on the target.
        if (run.opts.laser && run.emitterSpots) {
            const reach = run.opts.laserReach * Math.min(W, H) * k;
            for (const e of run.emitterSpots()) {
                const ex = e.x * k, ey = e.y * k;
                const inx = e.y === H ? 0 : e.y === 0 ? 0 : e.x === 0 ? 1 : -1, iny = e.y === H ? -1 : e.y === 0 ? 1 : 0;
                // Its reach shows only as it fires (a dashed arc fading from the emitter): drawn always, a maxed tree's
                // twelve arcs wove a web over the whole field on a phone.
                const shot = effects.find(f => f.kind === 'laser' && !f.turret && !f.zap && f.from && Math.abs(f.from.x - e.x) < 1e-6 && Math.abs(f.from.y - e.y) < 1e-6);
                if (shot) {
                    ctx.globalAlpha = 0.35 * (1 - shot.t / shot.life);
                    ctx.strokeStyle = C.warning;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 6]);
                    ctx.beginPath();
                    ctx.arc(ex, ey, reach, Math.atan2(iny, inx) - Math.PI / 2, Math.atan2(iny, inx) + Math.PI / 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = C.warning;
                ctx.save();
                ctx.translate(ex, ey);
                ctx.rotate(Math.atan2(iny, inx));
                ctx.beginPath();
                ctx.moveTo(0, -8);
                ctx.lineTo(9, 0);
                ctx.lineTo(0, 8);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
        for (const l of run.locks) {
            const p = run.packets.find(q => q.id === l.id);
            if (!p) continue;
            const m = Math.min(1, l.t / window.PacketSnare.LOCK_SECONDS);
            // In screen px (sized by the zoom they swelled to 45 px boxes on a phone and buried the packets they marked).
            const s = Math.max(6, Math.min(p.r * k, 7)) * (2 - m), len = s * 0.45;
            const x = p.x * k, y = p.y * k;
            ctx.strokeStyle = m >= 0.95 ? C.warning : C.text;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                ctx.moveTo(x + sx * s, y + sy * s - sy * len);
                ctx.lineTo(x + sx * s, y + sy * s);
                ctx.lineTo(x + sx * s - sx * len, y + sy * s);
            }
            ctx.stroke();
        }
        // Laser shots: a short bright bolt travelling from its emitter to the packet in its first 0.15 s, then gone (round
        // 4: full-length beams for 0.45 s at a maxed tree's rate were never off the field).
        for (const f of effects) {
            if (f.kind !== 'laser') continue;
            const m = Math.min(1, f.t / 0.15);
            if (m >= 1) continue;
            const dx = f.x - f.from.x, dy = f.y - f.from.y, L = Math.hypot(dx, dy) || 1, tail = Math.min(L, 1.4);
            const hx = f.from.x + dx * m, hy = f.from.y + dy * m;
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = f.zap ? C.text : C.warning;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo((hx - dx / L * Math.min(tail, L * m)) * k, (hy - dy / L * Math.min(tail, L * m)) * k);
            ctx.lineTo(hx * k, hy * k);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareChain(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Chain lightning: jagged arcs from a snared packet to each one it took.
        for (const f of effects) {
            if (f.kind !== 'chain') continue;
            const a = 1 - f.t / f.life;
            // Snare 14: brighter and thicker, with an amber glow and a spark where each arc lands. Every arc and every
            // spark goes in one path, and the glow is a wide translucent stroke under the bright one, not shadowBlur
            // (the owner's call after the review rounds: keep every arc, keep the frame rate).
            const sparks = new Path2D(), arcs = new Path2D(), sr = 3 + 4 * a;
            let seed = Math.floor(f.seed * 1e6) + Math.floor(f.t * 30);
            const jit = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
            for (const c of f.arcs) {
                sparks.moveTo(c.x * k + sr, c.y * k);
                sparks.arc(c.x * k, c.y * k, sr, 0, Math.PI * 2);
                arcs.moveTo(c.from.x * k, c.from.y * k);
                for (let i = 1; i < 6; i++) {
                    const u = i / 6;
                    arcs.lineTo((c.from.x + (c.x - c.from.x) * u) * k + jit() * 10, (c.from.y + (c.y - c.from.y) * u) * k + jit() * 10);
                }
                arcs.lineTo(c.x * k, c.y * k);
            }
            ctx.lineJoin = 'round';
            if (!reducedMotion()) {
                ctx.globalAlpha = 0.3 * a;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 9 + 3 * a;
                ctx.stroke(arcs);
            }
            ctx.globalAlpha = a;
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 2.5 + 1.5 * a;
            ctx.stroke(arcs);
            ctx.fillStyle = C.warning;
            ctx.fill(sparks);
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnareWire(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // The wire: bright at the pen, fading toward its tail; tinted while a Firewall hunts it. Its start wears a ring
        // that lights up when the pen is close enough to close the loop.
        const hunted = run.antivirus.some(f => f.hunting);
        // Bubbles (the prototype): an orb grows under the pen, green while clean, red once a corrupt packet is in it.
        const bub = run.bubble;
        if (bub) { drawSnareBubble(d, bub, hunted); return; }
        if (run.wire.length > 1) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const n = run.wire.length;
            // In five bands, each one path, fading toward the tail (a stroke per segment was up to 360 strokes a frame).
            // White (your Firewalls are white and amber, catches blue): while an Antivirus hunts it, it pulses.
            ctx.strokeStyle = C.text;
            ctx.lineWidth = hunted ? 2.5 + Math.sin(d.t * 18) : 2.5;
            const bands = 5;
            for (let band = 0; band < bands; band++) {
                const from = Math.floor(band * (n - 1) / bands), to = Math.floor((band + 1) * (n - 1) / bands);
                if (to <= from) continue;
                ctx.globalAlpha = 0.25 + 0.75 * ((band + 1) / bands);
                ctx.beginPath();
                // Through the midpoints, each point a control: a smooth curve rather than a polyline's corners.
                const wp = run.wire;
                ctx.moveTo(wp[from].x * k, wp[from].y * k);
                for (let i = from + 1; i < to; i++) ctx.quadraticCurveTo(wp[i].x * k, wp[i].y * k, (wp[i].x + wp[i + 1].x) / 2 * k, (wp[i].y + wp[i + 1].y) / 2 * k);
                ctx.lineTo(wp[to].x * k, wp[to].y * k);
                ctx.stroke();
            }
            const head = run.wire[n - 1], start = run.wire[0];
            if (pv) {
                ctx.globalAlpha = pv.near ? 0.9 : 0.4;
                ctx.setLineDash([4, 5]);
                ctx.strokeStyle = pv.spoiled ? C.danger : C.success;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(head.x * k, head.y * k);
                ctx.lineTo(start.x * k, start.y * k);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.globalAlpha = 1;
            // The closing ring round the start (Settings can hide it: some find it in the way).
            if (snareRingOn()) {
            ctx.strokeStyle = pv?.near ? (pv.spoiled ? C.danger : C.success) : C.muted;
            ctx.lineWidth = pv?.near ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(start.x * k, start.y * k, run.closeR * k, 0, Math.PI * 2);
            ctx.stroke();
            }
            if (pv?.near && snareRingOn()) {
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = pv.spoiled ? C.danger : C.success;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = C.text;
            ctx.beginPath();
            ctx.arc(head.x * k, head.y * k, 3.5, 0, Math.PI * 2);
            ctx.fill();
            if (pv && (pv.inside.length || pv.mult >= 2)) {
                ctx.font = `700 13px ${snareMono()}`;
                // Kept inside the canvas, and on a touch screen lifted clear of the finger drawing the wire.
                const x0 = head.x * k + d.ox, y0 = head.y * k + d.oy;
                ctx.textAlign = x0 > cw * 0.65 ? 'right' : 'left';
                const label = pv.spoiled ? 'CORRUPT ✕' : pv.garbage ? `GARBAGE · +${Math.round(run.opts.gcFocus * pv.corrupt.length)} Focus`
                    : `×${pv.mult.toFixed(1)} · ${pv.good.length}${pv.scrub ? ` · ${pv.scrub} scrubbed` : ''}${pv.safe ? ' · SAFE' : ''}`;
                const lift = d.touch ? 46 : 12;
                const lx = head.x * k + (ctx.textAlign === 'right' ? -12 : 12);
                const ly = (y0 - lift < 34 ? y0 + lift + 10 : y0 - lift) - d.oy;
                const say = (text, y, col) => {
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = C.bg;
                    ctx.strokeText(text, lx, y);
                    ctx.fillStyle = col;
                    ctx.fillText(text, lx, y);
                };
                say(label, ly, pv.spoiled ? C.danger : C.success);
                // A big loop says plainly what it is (the owner's call): the multiplier is high, and so is the chance a
                // red packet swims in before it closes.
                // A pill of its own (round 4: amber text on an amber-heavy field didn't stand out), kept while the loop
                // reads CORRUPT too: that's when the risk landed.
                if (pv.mult >= 2) {
                    ctx.font = `700 11px ${snareMono()}`;
                    const text = `HIGH RISK · HIGH REWARD${pv.risk ? ` · ${pv.risk} red near` : ''}`;
                    const tw = ctx.measureText(text).width, py = ly - 30;
                    const px = ctx.textAlign === 'right' ? lx - tw - 6 : lx - 6;
                    ctx.globalAlpha = 0.92;
                    ctx.fillStyle = pv.spoiled ? C.danger : C.warning;
                    ctx.beginPath();
                    ctx.roundRect(px, py - 1, tw + 12, 17, 8);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = C.bg;
                    ctx.fillText(text, lx, py + 12);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawSnareBubble(d, b, hunted) {
        const { ctx, C, k, cw, pv } = d;
        const x = b.x * k, y = b.y * k, r = b.r * k;
        const col = pv?.spoiled ? C.danger : C.success;
        let fill = col;
        try {
            const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, hexAlpha(col, 0.26));
            g.addColorStop(0.75, hexAlpha(col, 0.1));
            g.addColorStop(1, hexAlpha(col, 0.34));
            fill = g;
        } catch { /* a colour the gradient can't take: a flat tint */ }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        // fainter for its first moment, until it's a bubble for good (a stroke then would still draw a wire)
        const firm = b.growing ? 1 : 0.55;
        ctx.globalAlpha = (fill === col ? 0.2 : 1) * firm;
        ctx.fill();
        // its skin: white, pulsing while an Antivirus hunts it, brighter once it's full
        ctx.globalAlpha = (b.full ? 0.95 : 0.75) * firm;
        ctx.strokeStyle = hunted ? C.danger : C.text;
        ctx.lineWidth = (b.full ? 3 : 2) + (hunted ? Math.sin(d.t * 18) : 0);
        ctx.stroke();
        // a highlight, so it reads as a bubble
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = C.text;
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.78, Math.PI * 1.1, Math.PI * 1.45);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (!pv) return;
        // what letting go now would pay, above it (kept inside the canvas, clear of the finger)
        ctx.font = `700 13px ${snareMono()}`;
        ctx.textAlign = 'center';
        const label = pv.spoiled ? 'CORRUPT ✕ · it spoils' : pv.inside.length ? `×${pv.mult.toFixed(1)} · ${pv.good.length}${pv.scrub ? ` · ${pv.scrub} scrubbed` : ''}${pv.safe ? ' · SAFE' : ''}${b.full ? ' · FULL' : ''}`
            : `×${pv.mult.toFixed(1)}${b.full ? ' · FULL' : ''}`;
        const half = ctx.measureText(label).width / 2 + 8;
        const lx = Math.max(half, Math.min(cw - half, x + d.ox)) - d.ox;
        let ly = y - r - 12;
        if (ly + d.oy < 34) ly = Math.min(y + r + 22, y + 40);
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.bg;
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = pv.spoiled ? C.danger : C.success;
        ctx.fillText(label, lx, ly);
        if (pv.mult >= 2 && !pv.spoiled && pv.risk > 0) {
            ctx.font = `700 11px ${snareMono()}`;
            const text = `HIGH RISK · HIGH REWARD${pv.risk ? ` · ${pv.risk} red near` : ''}`;
            const tw = ctx.measureText(text).width, py = ly - 30;
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = C.warning;
            ctx.beginPath();
            ctx.roundRect(lx - tw / 2 - 6, py - 1, tw + 12, 17, 8);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = C.bg;
            ctx.fillText(text, lx, py + 12);
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    function drawSnareRogueFx(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        for (const f of effects) {
            const a = 1 - f.t / f.life;
            if (f.kind === 'stolen') {
                // stolen packets pulled into the core, turning red
                const m = Math.min(1, f.t / f.life);
                ctx.fillStyle = C.danger;
                for (const p of f.packets) {
                    ctx.globalAlpha = a;
                    ctx.beginPath();
                    ctx.arc((p.x + (f.core.x - p.x) * m) * k, (p.y + (f.core.y - p.y) * m) * k, Math.max(2, 0.25 * k * a), 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (f.kind === 'coreGone' || f.kind === 'quarantine') {
                // the circle collapses (burnt out) or shatters outward (quarantined)
                ctx.globalAlpha = a;
                ctx.strokeStyle = f.kind === 'quarantine' ? C.primary : C.danger;
                ctx.lineWidth = f.kind === 'quarantine' ? 3 : 1.5;
                const rr = f.kind === 'quarantine' ? (f.r + f.t * 4) * k : f.r * k * a;
                ctx.beginPath();
                ctx.arc(f.x * k, f.y * k, Math.max(1, rr), 0, Math.PI * 2);
                ctx.stroke();
                if (f.kind === 'quarantine') {
                    for (let i = 0; i < 8; i++) {
                        const ang = i * Math.PI / 4 + 0.3;
                        const d = (0.3 + f.t * 3) * k;
                        ctx.fillStyle = C.danger;
                        ctx.fillRect(f.x * k + Math.cos(ang) * d - 2, f.y * k + Math.sin(ang) * d - 2, 4, 4);
                    }
                }
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnareSnaps(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Snapped wires fall apart.
        for (const f of effects) {
            if (f.kind !== 'snap') continue;
            const a = 1 - f.t / f.life;
            ctx.globalAlpha = a;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            f.wire.forEach((p, i) => (i ? ctx.lineTo(p.x * k, (p.y + f.t * 0.8) * k) : ctx.moveTo(p.x * k, (p.y + f.t * 0.8) * k)));
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnareAntivirus(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // Antivirus: a red ring with four sight notches (round 3: a plain ring read as a core) and a sweeping scan line,
        // brighter while hunting; grey and still while stunned (a pulsing amber ring when Hijack could take it); amber
        // once hijacked.
        for (const f of run.antivirus) {
            const x = f.x * k, y = f.y * k, r = Math.max(9, f.r * k);
            const ally = f.ally > t;
            const stunned = !ally && f.stunned > t;
            // Off shift (updating its definitions): faint and harmless, a safe window.
            const off = !ally && !stunned && f.off;
            const col = ally ? C.warning : stunned || off ? C.muted : C.danger;
            if (off) {
                ctx.globalAlpha = 0.45;
                ctx.font = `700 9px ${snareMono()}`;
                ctx.textAlign = 'center';
                ctx.fillStyle = C.muted;
                ctx.fillText('UPDATING', x, y - r - 9);
            }
            ctx.strokeStyle = col;
            ctx.fillStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = stunned ? 0 : f.hunting ? 18 : 8;
            ctx.lineWidth = 2;
            if (stunned) ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 + Math.PI / 4;
                ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
                ctx.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
            }
            ctx.stroke();
            if (stunned && run.opts.hijack) {
                ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 8);
                ctx.strokeStyle = C.warning;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(x, y, r + 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }
            if (!stunned) {
                ctx.globalAlpha = f.hunting ? 0.35 : 0.18;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.arc(x, y, r, t * 4, t * 4 + 1.2);
                ctx.closePath();
                ctx.fill();
            } else {
                // sparks orbiting a stunned one
                ctx.fillStyle = C.success;
                for (let i = 0; i < 3; i++) {
                    const ang = t * 6 + i * 2.1;
                    ctx.fillRect(x + Math.cos(ang) * (r + 4) - 1.5, y + Math.sin(ang) * (r + 4) - 1.5, 3, 3);
                }
            }
            // jammed by a Jammer tower: violet static round it
            if (f.jammed && !stunned) {
                ctx.globalAlpha = 0.7;
                ctx.strokeStyle = C.research;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 3]);
                ctx.lineDashOffset = t * 20;
                ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.lineDashOffset = 0;
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.fillStyle = col;
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
            // Locking on (round 1 of the review: pops came from nowhere): hunting your bubble and closing in, a dashed red
            // line to it and a ! over the Antivirus, brighter the nearer it is.
            const bub = run.bubble;
            if (f.hunting && bub) {
                const dist = Math.hypot(bub.x - f.x, bub.y - f.y) - bub.r;
                if (dist < 7) {   // 5 before round 6 of the review: it came too late to dodge
                    const near = 1 - Math.max(0, dist) / 7;
                    ctx.globalAlpha = 0.35 + 0.55 * near;
                    ctx.strokeStyle = C.danger;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 5]);
                    ctx.lineDashOffset = -t * 30;
                    const a = Math.atan2(bub.y - f.y, bub.x - f.x);
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
                    ctx.lineTo((bub.x - Math.cos(a) * bub.r) * k, (bub.y - Math.sin(a) * bub.r) * k);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;
                    ctx.font = `800 ${Math.round(14 + 6 * near)}px ${snareMono()}`;
                    ctx.textAlign = 'center';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = C.bg;
                    ctx.strokeText('!', x, y - r - 8);
                    ctx.fillStyle = C.danger;
                    ctx.fillText('!', x, y - r - 8);
                    ctx.textAlign = 'left';
                    ctx.globalAlpha = 1;
                }
            }
        }
        for (const f of effects) {
            if (f.kind !== 'boot') continue;
            ctx.globalAlpha = 1 - f.t / f.life;
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(f.x * k, f.y * k, (0.4 + f.t * 2.5) * k, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 1;
    }

    function drawSnarePops(d) {
        const { ctx, C, k, run, t, W, H, effects, cw, pv } = d;
        // A supernova's shockwave, a split's bubbles flying out, a thrown mine's streak.
        for (const f of effects) {
            const a = 1 - f.t / f.life, e = 1 - a;
            if (f.kind === 'nova') {
                // Supernova: a gold shockwave out to the burst's edge, and rays.
                ctx.globalAlpha = a;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 3 + 6 * a;
                ctx.beginPath();
                ctx.arc(f.x * k, f.y * k, f.r * k * (0.6 + 0.4 * e), 0, Math.PI * 2);
                ctx.stroke();
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < 12; i++) {
                    const ang = i * Math.PI / 6 + f.x;
                    ctx.moveTo((f.x + Math.cos(ang) * f.r * 0.5 * e) * k, (f.y + Math.sin(ang) * f.r * 0.5 * e) * k);
                    ctx.lineTo((f.x + Math.cos(ang) * f.r * (0.7 + 0.5 * e)) * k, (f.y + Math.sin(ang) * f.r * (0.7 + 0.5 * e)) * k);
                }
                ctx.stroke();
            } else if (f.kind === 'splitKid') {
                // Split: a small bubble flies out from where the full one was.
                const x = f.from.x + (f.x - f.from.x) * Math.min(1, e * 2.5), y = f.from.y + (f.y - f.from.y) * Math.min(1, e * 2.5);
                ctx.globalAlpha = 0.8;
                ctx.strokeStyle = C.text;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x * k, y * k, f.r * k * (0.5 + 0.5 * Math.min(1, e * 2.5)), 0, Math.PI * 2);
                ctx.stroke();
            } else if (f.kind === 'throw') {
                // A mine thrown at the boss: a streak from where it was held.
                ctx.globalAlpha = a;
                ctx.strokeStyle = C.warning;
                ctx.lineWidth = 3 + 5 * a;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(f.from.x * k, f.from.y * k);
                ctx.lineTo(f.x * k, f.y * k);
                ctx.stroke();
            }
        }
        // Flick streaks.
        for (const f of effects) {
            if (f.kind !== 'flick') continue;
            const a = 1 - f.t / f.life;
            ctx.globalAlpha = a;
            ctx.strokeStyle = f.hit ? C.warning : C.danger;
            ctx.lineWidth = 2 + 5 * a;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(f.a.x * k, f.a.y * k);
            ctx.lineTo(f.b.x * k, f.b.y * k);
            ctx.stroke();
        }
        // A sector cleared (the owner's call): a golden tech wave runs across the field, left to right: a glowing band
        // with a bright leading edge, scanlines and the field's grid lit as it passes.
        for (const f of effects) {
            if (f.kind !== 'wave') continue;
            const FW = W * k, FH = H * k, band = Math.max(60, FW * 0.18), e = f.t / f.life;
            const x = -band + (FW + band * 2) * e, a = 1 - Math.max(0, e - 0.8) * 5;
            const g = ctx.createLinearGradient(x - band, 0, x, 0);
            g.addColorStop(0, hexAlpha(C.warning, 0));
            g.addColorStop(0.8, hexAlpha(C.warning, 0.22 * a));
            g.addColorStop(1, hexAlpha(C.warning, 0.5 * a));
            ctx.fillStyle = g;
            ctx.fillRect(x - band, 0, band, FH);
            ctx.globalAlpha = 0.9 * a;
            ctx.fillStyle = C.warning;
            ctx.fillRect(x - 2, 0, 3, FH);
            // scanlines and grid ticks inside the band
            ctx.globalAlpha = 0.35 * a;
            ctx.beginPath();
            for (let y = 0; y < FH; y += 6) { ctx.moveTo(x - band * 0.6, y); ctx.lineTo(x, y); }
            ctx.lineWidth = 1;
            ctx.strokeStyle = C.warning;
            ctx.stroke();
            ctx.globalAlpha = 0.6 * a;
            const step = Math.max(24, k);
            ctx.beginPath();
            for (let gx = Math.ceil((x - band) / step) * step; gx < x; gx += step) { ctx.moveTo(gx, 0); ctx.lineTo(gx, FH); }
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // A flash (Snare 14: a surge, a storm, a big chain): the whole field lights for a moment (not under reduced motion).
        for (const f of effects) {
            if (f.kind !== 'flash' || reducedMotion()) continue;
            ctx.globalAlpha = 0.16 * (1 - f.t / f.life);
            ctx.fillStyle = f.gold ? C.warning : C.text;
            ctx.fillRect(0, 0, W * k, H * k);
        }
        ctx.globalAlpha = 1;
        // An IDS alert: the field's edge flashes red and the alert is named in the middle.
        const ids = effects.find(f => f.kind === 'ids');
        if (ids) {
            const a = 1 - ids.t / ids.life, on = Math.floor(ids.t * 6) % 2 === 0;
            ctx.globalAlpha = a * (on ? 0.9 : 0.4);
            ctx.strokeStyle = C.danger;
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, W * k - 6, H * k - 6);
            ctx.globalAlpha = a;
            ctx.font = `700 20px ${snareMono()}`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = C.bg;
            ctx.strokeText('IDS ALERT', W * k / 2, H * k * 0.3);
            ctx.fillStyle = C.danger;
            ctx.fillText('IDS ALERT', W * k / 2, H * k * 0.3);
        }
        // Pops: what a loop paid, rising. Pops that would land on one another stack upward (round 3: STUNNED sat on the
        // boss's hit pips, and a burst of catches piled into one smear).
        ctx.textAlign = 'center';
        // Round 2 of the review: labels still piled on one point. Each is measured; one that would overlap another
        // stacks above it up to three times, and past that a small one is dropped (big and huge ones always show).
        // The newest are placed first, so the latest news wins the spot.
        const placed = [];
        for (const f of [...effects].reverse()) {
            if (!f.text) continue;
            const a = Math.min(1, 2 * (1 - f.t / (f.life || SNARE_FX)));
            // A banner centred on the field (a surge or storm the run set off) stays put and swells in.
            let y = f.centre ? H * k * 0.38 : f.y * k - 10 - f.t * 26;
            const x = f.centre ? W * k / 2 : f.x * k;
            const pop = f.huge && !reducedMotion() ? 1 + 0.35 * Math.max(0, 1 - f.t / 0.18) : 1;
            const size = Math.round((f.small ? 11 : f.huge ? 24 : f.big ? 18 : 15) * pop);
            ctx.font = `700 ${size}px ${snareMono()}`;
            // the same words already up nearby: once is enough (round 4 of the review: SHIELDED ×4 in a column)
            if (placed.some(p => p.text === f.text && Math.abs(p.x - x) < 160)) continue;
            // too wide for the field: smaller (round 4: SECTOR CLEARED ran off a phone's field)
            let fit = size;
            const room = W * k - 12;
            if (ctx.measureText(f.text).width > room) { fit = Math.max(10, Math.floor(size * room / ctx.measureText(f.text).width)); ctx.font = `700 ${fit}px ${snareMono()}`; }
            const hw = ctx.measureText(f.text).width / 2 + 4, lh = fit + 4 + (f.sub ? 14 : 0);
            const hits = yy => placed.some(p => Math.abs(p.x - x) < p.hw + hw && yy - lh < p.y && p.y - p.lh < yy);
            let tries = 0;
            while (tries < 3 && hits(y)) { y -= lh; tries++; }
            if (hits(y) && !f.big && !f.huge) continue;
            placed.push({ x, y, hw, lh, text: f.text });
            ctx.globalAlpha = a;
            ctx.fillStyle = f.kind === 'banner' ? C.warning : f.kind === 'quarantine' ? C.primary : f.kind === 'stun' ? C.success : f.kind === 'catch' || f.kind === 'laser' || f.kind === 'star' ? (f.big || f.gold ? C.warning : C.text) : C.danger;
            ctx.lineWidth = 3;
            ctx.strokeStyle = C.bg;
            // Kept inside the field (Snare 14: a big CHAIN or SURGE by the edge ran off a phone's field).
            const half = ctx.measureText(f.text).width / 2 + 4;
            const tx = Math.max(half, Math.min(W * k - half, x));
            ctx.strokeText(f.text, tx, y);
            ctx.fillText(f.text, tx, y);
            if (f.sub) {
                ctx.font = `600 12px ${snareMono()}`;
                ctx.fillStyle = C.primary;
                ctx.fillText(f.sub, tx, y + 15);
            }
        }
        ctx.globalAlpha = 1;
    }

    // ---- Training dev screen & skill tree --------------------------------

    // Line glyphs for skill-tree nodes (24×24, stroked with currentColor).
    const ICONS = {
        loop: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
        cloud: '<path d="M7 16a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1 0 7z"/><path d="m11 18-2 3M15 18l-2 3"/>',
        crash: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M8 8l2 2m0-2-2 2M14 8l2 2m0-2-2 2M9 14h6"/>',
        check: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
        refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
        flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
        surge: '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>',
        cut: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8 15 18 4M16 15 6 4"/>',
        route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
        back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
        pen: '<rect x="4" y="5" width="16" height="14" rx="1"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="13" r="1.5"/>',
        deploy: '<rect x="4" y="11" width="16" height="9" rx="1"/><path d="M12 3v7M9 7l3 3 3-3"/>',
        sweep: '<path d="M14 3 21 10M12 5l7 7-7 7-7-7z"/><path d="M3 21l4-4"/>',
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
        spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
        // A graphics card: strength.
        gpu: '<rect x="2" y="7" width="20" height="10" rx="1.5"/><circle cx="8" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M5 17v3M9 17v3M13 17v3"/>',
        // A digital timer: the wait between sprints.
        timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4M12 2v3M19 5l1.5-1.5"/>',
        // A gauge: drag.
        gauge: '<path d="M3.5 17a9 9 0 1 1 17 0z"/><path d="m12 15 4-5M7 12.5h1M16 12.5h1M12 7.5v1"/>',
        // A database: the run bonus.
        db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
        // A terminal: the system prompt.
        terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
        // Fast-forward chevrons: Max Effort.
        boost: '<path d="m4 6 7 6-7 6M12 6l7 6-7 6"/>',
        // A strip on a slope: boost strips.
        strip: '<path d="M3 19 21 7"/><path d="m8 13 2 2M13 10l2 2"/>',
        // Packet Snare's tree.
        lasso: '<ellipse cx="12" cy="9" rx="8" ry="5"/><path d="M8.5 13.2c-1.2 2.2-1 4.6 1.5 6.8"/>',
        pipes: '<path d="M3 8h16M3 16h16M15 4l4 4-4 4M9 12l-4 4 4 4"/>',
        expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6"/>',
        school: '<path d="m3 8 5-2.5v5zM12 12l5-2.5v5zM3 16.5l5-2.5v5zM12 4l5-2.5v5zM12 20l5-2.5v5z"/>',
        diamond: '<path d="M12 3 19 12 12 21 5 12z"/><path d="M12 8 15 12 12 16 9 12z"/>',
        turret: '<rect x="6" y="10" width="12" height="10" rx="1.5"/><path d="M12 15V3"/><circle cx="12" cy="15" r="2"/>',
        mast: '<path d="M12 6v10M6 21l6-6 6 6"/><circle cx="12" cy="4" r="2"/><path d="M7.5 7.5a6.5 6.5 0 0 1 0-7M16.5 7.5a6.5 6.5 0 0 0 0-7"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
        mask: '<path d="M3 9c3-2 6-2 9 0 3-2 6-2 9 0-.5 5-3.5 8-6 8-1.5 0-2.3-1.3-3-3-.7 1.7-1.5 3-3 3-2.5 0-5.5-3-6-8z"/><circle cx="8" cy="11" r="1.2"/><circle cx="16" cy="11" r="1.2"/>',
        fork: '<path d="M7 6c3 0 7 12 10 12a4 4 0 0 0 0-8c-3 0-7 12-10 12M7 6a4 4 0 0 0 0 8"/>',
        burst: '<path d="m12 2 2.6 6.3L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.7z"/>',
        ram: '<path d="M3 12h11M10 7l5 5-5 5M17 5v14M21 8v8"/>',
        sword: '<path d="M14 4h6v6L9 21l-3-3L14 4zM5 15l4 4M3 21l3-3"/>',
        slash: '<path d="M4 20 20 4M14 4h6v6"/><path d="M5 9l3-3M15 19l3-3"/>',
        hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
        ghost: '<path d="M5 20v-9a7 7 0 0 1 14 0v9l-2.3-1.8-2.3 1.8-2.4-1.8-2.3 1.8-2.4-1.8z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
        shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
        drone: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="m6.5 6.5 3.4 3.4M17.5 6.5l-3.4 3.4M6.5 17.5l3.4-3.4M17.5 17.5l-3.4-3.4"/>',
        filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
        radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 6.5-6.5"/>',
        beams: '<path d="M2 21h20M6 21 11 4M18 21 13 4"/><circle cx="12" cy="4" r="1.5"/>',
        anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M5 14c0 4 3 7 7 7s7-3 7-7"/>',
        bricks: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>'
    };

    // Each kind of upgrade has its own symbol, picked from what the node boosts (its first stat), so a
    // strength node never looks like a wait node. The seed and the Auto-Trainer keep theirs.
    const STAT_ICON = {
        push: 'gpu', pushMult: 'gpu', pushes: 'plus', cooldown: 'timer', charge: 'bolt', friction: 'gauge', inertia: 'gauge', slope: 'mountain', xp: 'stack',
        clean: 'coin', rollBonus: 'db', zone: 'target', cleanPower: 'target', cleanSize: 'target', zoneBias: 'target',
        perfect: 'star', perfectPower: 'star', perfectUnits: 'star', perfectSize: 'star', system: 'terminal',
        critChance: 'dice', critPower: 'dice', superCrit: 'dice', windfallChance: 'spark', windfallPower: 'spark',
        crunchChance: 'flame', crunchTime: 'flame', superCrunch: 'flame', maxEffortChance: 'boost', maxEffortPower: 'boost',
        flowChance: 'wave', flowTime: 'wave', flowSpeed: 'wave', superFlow: 'wave',
        stripFront: 'strip', stripBack: 'strip', stripMore: 'strip'
    };
    const nodeIcon = up => ((up.requires || up.legacy) && up.boost ? STAT_ICON[Object.keys(up.boost)[0]] : null) || up.icon;

    // ---- Legacy upgrades: their own screen, bought with Insight ----------------
    // Opens after shipping a version (spend first, then "Start vX.Y") and from R&D any time after.
    // Cards appear by branch; one that grows from another legacy upgrade shows once that one is maxed.
    const LEGACY_BRANCHES = [['power', 'Power'], ['precision', 'Precision'], ['recursion', 'Recursion'], ['momentum', 'Momentum']];
    const legacyUi = { cards: {}, afterShip: false };

    function buildLegacy() {
        const grid = $('legacyGrid');
        for (const [id, name] of LEGACY_BRANCHES) {
            const col = el('div', { class: 'legacy-col' }, [el('h3', { class: 'legacy-branch', text: name })]);
            for (const up of E.UPGRADES.filter(u => u.legacy && u.branch === id)) {
                const level = el('span', { class: 'legacy-level' });
                const button = el('button', { type: 'button', class: 'button legacy-buy' });
                button.addEventListener('click', () => doBuy(up.id));
                const card = el('article', { class: 'legacy-card', hidden: true }, [
                    el('span', { class: 'legacy-icon', 'aria-hidden': 'true' }),
                    el('div', { class: 'legacy-info' }, [
                        el('h4', {}, [el('span', { text: up.name }), up.tag ? el('span', { class: 'legacy-tag', text: up.tag }) : null, level].filter(Boolean)),
                        el('p', { class: 'legacy-effect', text: up.effect }),
                        el('p', { class: 'legacy-flavor', text: up.flavor }),
                        up.mechanic ? mechanicDemo(up.mechanic) : null
                    ].filter(Boolean)),
                    button
                ]);
                card.querySelector('.legacy-icon').innerHTML = icon(nodeIcon(up));
                col.append(card);
                legacyUi.cards[up.id] = { up, card, level, button, demo: card.querySelector('.demo') };
            }
            grid.append(col);
        }
        $('legacyDone').addEventListener('click', closeLegacy);
        $('legacyOpen').addEventListener('click', () => openLegacy(false));
    }

    function openLegacy(afterShip) {
        legacyUi.afterShip = afterShip;
        setText($('legacyDone'), afterShip ? `Start ${E.currentVersion(state)}` : 'Done');
        $('legacyScreen').hidden = false;
        // The screen covers the room under it: keep keyboard focus (and screen readers) on it, not on what it hides.
        legacyBehind(true);
        $('legacyScreen').focus({ preventScroll: true });
        ptView('legacy');
        renderLegacy();
    }

    function legacyBehind(covered) {
        for (const el of [document.querySelector('main.layout'), $('minimap')]) if (el) el.inert = covered;
    }

    function closeLegacy() {
        $('legacyScreen').hidden = true;
        legacyBehind(false);
        ptView(legacyUi.afterShip ? 'lab' : ptPlace());
        if (legacyUi.afterShip) showView('lab');
        legacyUi.afterShip = false;
    }

    function renderLegacy() {
        setHidden($('legacyOpen'), state.prestige.count < 1);
        if ($('legacyScreen').hidden) return;
        setText($('legacyInsight'), `${E.currentVersion(state)} · ${E.format(state.prestige.points)} Insight to spend`);
        for (const { up, card, level, button, demo } of Object.values(legacyUi.cards)) {
            setHidden(card, !E.isUpgradeVisible(state, up));
            const lvl = E.level(state, up.id);
            if (demo) demo.hidden = lvl > 0;   // the demo is for before it's chosen
            const maxed = E.isMaxed(state, up);
            setText(level, up.endless ? `Lv ${lvl}` : `${lvl}/${up.max}`);
            card.classList.toggle('owned', lvl > 0);
            setText(button, maxed ? 'Owned' : `${E.formatCost(E.upgradeCost(up, lvl))}`);
            setDisabled(button, maxed || !E.canAfford(state, E.upgradeCost(up, lvl)));
        }
    }
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
            $('treeViewport').append(el('div', { class: `tree-branch tree-branch-${branch.dir}` }, [
                el('strong', { text: branch.name })
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

            const button = el('button', { type: 'button', class: `tree-node${up.requires ? '' : ' seed'}${up.mechanic ? ' mechanic' : ''}` });
            button.innerHTML = `<span class="tree-icon">${icon(nodeIcon(up))}</span><span class="tree-lock">${icon('lock')}</span><span class="tree-level"></span>`;
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
        $('restartButton').addEventListener('click', restartRun);
        $('legSelect').addEventListener('change', e => setStartLeg(e.target.value === '' ? null : Number(e.target.value), true));
        $('legTagClear').addEventListener('click', () => setStartLeg(null, true));
        // Hotkeys in the Training Cluster: U swaps the trail and the upgrades, R trains again after a run.
        document.addEventListener('keydown', e => {
            if (openBay !== 'training' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
            if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select')) return;
            const key = e.key.toLowerCase();
            if (key === 'u') showTrainingView(path.view === 'run' ? 'dev' : 'run');
            else if (key === 'r' && path.view === 'run' && path.done) runAgain();
            else return;
            e.preventDefault();
        });
    }

    // ---- Skill tree camera: drag to pan, wheel / pinch / buttons to zoom ----

    const treeCam = { x: 0, y: 0, z: 1, pointers: new Map(), drag: null, moved: false };
    const TREE_ZOOM = { min: 0.5, max: 2.5, step: 1.25, start: 1.4, phone: 0.75 };   // start: the default view, zoomed in on the core

    // The view (pan and zoom) is remembered between visits and sessions.
    const TREE_CAM_KEY = 'agiTreeCam3';   // 3: phones open further out, so older saved views are dropped
    let treeCamFresh = true;            // no saved view yet: set the default once the tree is on screen
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
                treeCamFresh = false;
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

    // The default view: zoomed in a little (TREE_ZOOM.start) about the centre, where the core sits; phones open
    // further out (`phone`), so the first rings show round the core on a narrow screen.
    function resetTreeCam() {
        const vp = $('treeViewport');
        Object.assign(treeCam, { x: 0, y: 0, z: 1 });
        zoomTreeAt(window.matchMedia('(max-width: 640px)').matches ? TREE_ZOOM.phone : TREE_ZOOM.start, vp.clientWidth / 2, vp.clientHeight / 2);
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
        // Keyboard: tabbing to a node outside the view pans it into view (focus used to land off screen).
        vp.addEventListener('focusin', e => {
            const node = e.target.closest?.('.tree-node');
            if (!node) return;
            const v = vp.getBoundingClientRect();
            const r = node.getBoundingClientRect();
            const z = uiScale();
            const margin = 40 * z;
            if (r.left >= v.left + margin && r.right <= v.right - margin && r.top >= v.top + margin && r.bottom <= v.bottom - margin) return;
            vp.scrollTop = vp.scrollLeft = 0;   // focus() may have scrolled the clipped viewport itself
            treeCam.x += (v.left + v.width / 2 - (r.left + r.width / 2)) / z;
            treeCam.y += (v.top + v.height / 2 - (r.top + r.height / 2)) / z;
            applyTreeCam();
        });
        // A node popup taller than the view scrolls inside itself (a sideways phone): a wheel or a finger on it
        // scrolls the popup, not the tree.
        const inScrollingPopup = e => { const d = e.target.closest?.('.node-detail'); return !!d && d.scrollHeight > d.clientHeight + 1; };
        vp.addEventListener('wheel', e => {
            if (inScrollingPopup(e)) return;
            e.preventDefault();
            const p = treePoint(e);
            zoomTreeAt(treeCam.z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        }, { passive: false });
        vp.addEventListener('pointerdown', e => {
            if (e.target.closest('.tree-zoom') || inScrollingPopup(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
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

    // Node state: hidden (its parent isn't maxed yet: what comes next shows only once a node is finished),
    // owned, maxed, or available (affordable or not).
    function nodeState(up) {
        // Legacy nodes don't exist, not even as locks, until the first new version ships.
        if (up.legacy && !state.prestige.count && !E.level(state, up.id)) return 'hidden';
        if (!E.isUpgradeVisible(state, up)) return 'hidden';
        if (E.isMaxed(state, up)) return 'maxed';
        const lvl = E.level(state, up.id);
        const affordable = E.canAfford(state, E.upgradeCost(up, lvl));
        return lvl > 0 ? (affordable ? 'owned can-buy' : 'owned') : (affordable ? 'available can-buy' : 'available');
    }

    function renderTree() {
        if (!treeUi.built) return;
        // First look at the tree (no saved view): start zoomed in on the core, once it has a size.
        if (treeCamFresh && $('treeViewport').clientWidth) {
            treeCamFresh = false;
            resetTreeCam();
        }
        const states = Object.fromEntries(treeNodes().map(up => [up.id, nodeState(up)]));
        const shown = treeNodes().filter(up => states[up.id] !== 'hidden');
        const cell = treeCell();
        if (path.selected && states[path.selected] === 'hidden') path.selected = shown[0].id;
        for (const up of treeNodes()) {
            const node = treeUi.nodes[up.id];
            const st = states[up.id];
            setHidden(node, st === 'hidden');
            placeNode(node, up.tree.x, up.tree.y);
            node.className = `tree-node ${st}${up.requires ? '' : ' seed'}${up.mechanic ? ' mechanic' : ''}${up.legacy ? ' legacy' : ''}${path.selected === up.id ? ' selected' : ''}`;
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
            const parentOwned = !up.requires || E.isMaxed(state, E.UPGRADE_BY_ID[up.requires]);
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
    // What buying the next level does to the run, as "now → after" (the node's first stat that moves a
    // derived number). Status, like the lab cards' live lines.
    const previewPct = v => `${Math.round(v * 100)}%`;
    const STAT_PREVIEW = {
        push: ['pushPower', 'Sprint strength', v => v.toFixed(2)], pushMult: ['pushPower', 'Sprint strength', v => v.toFixed(2)],
        pushes: ['pushesPerRoll', 'Sprints per run', v => String(v)], cooldown: ['pushCooldown', 'Wait between sprints', v => `${v.toFixed(2)} s`],
        xp: ['xpMult', 'Training XP', v => `×${v.toFixed(2)}`], friction: ['friction', 'Drag', previewPct], slope: ['hillScale', 'Rolling hills', previewPct],
        zone: ['zoneWidth', 'Clean prompt zone', previewPct], cleanSize: ['zoneWidth', 'Clean prompt zone', previewPct], zoneBias: ['zoneBias', 'Zone height', v => `+${previewPct(v)}`],
        cleanPower: ['cleanPower', 'Clean prompt power', v => `×${v.toFixed(2)}`], perfectPower: ['perfectPower', 'Super prompt power', v => `×${v.toFixed(2)}`],
        perfect: ['perfectWidth', 'Super prompt', previewPct], perfectSize: ['perfectWidth', 'Super prompt', previewPct], perfectUnits: ['perfectUnits', 'Super prompt worth', v => `${v.toFixed(1)} clean`],
        clean: ['cleanMult', 'Clean prompt XP', v => `×${v.toFixed(2)}`], rollBonus: ['cleanRollBonus', 'Run bonus per prompt', previewPct], charge: ['chargeHold', 'Meter holds at the top', v => `${v.toFixed(2)} s`],
        critChance: ['critChance', 'Breakthrough chance', previewPct], critPower: ['critMult', 'Breakthrough power', v => `×${v.toFixed(2)}`],
        maxEffortChance: ['maxEffortChance', 'Max Effort chance', previewPct], maxEffortPower: ['maxEffortMult', 'Max Effort power', v => `×${v.toFixed(2)}`],
        windfallChance: ['windfallChance', 'Viral chance', previewPct], windfallPower: ['windfallMult', 'Viral run', v => `×${v.toFixed(2)}`],
        crunchChance: ['crunchChance', 'Crunch chance', previewPct], crunchTime: ['crunchSeconds', 'Crunch', v => `${v.toFixed(1)} s`],
        flowChance: ['flowChance', 'Flow chance', previewPct], flowTime: ['flowSeconds', 'Flow', v => `${v.toFixed(1)} s`], system: ['systemWidth', 'System prompt', previewPct],
        stripFront: ['stripFront', 'Face strips', stripWord], stripBack: ['stripBack', 'Back strips', stripWord],
        stripMore: ['stripMore', 'Hills with strips', v => `${Math.round((0.22 + 0.12 * v) * 100)}%`]
    };
    function stripWord(v) { return ['none', 'weak', 'medium', 'strong'][v] || 'strong'; }
    function nodePreview(up, lvl) {
        if (!up.boost) return null;
        for (const stat of Object.keys(up.boost)) {
            const p = STAT_PREVIEW[stat];
            if (!p) continue;
            const now = E.derive(state)[p[0]];
            const store = up.legacy ? state.prestige.levels : state.levels;
            const had = store[up.id];
            store[up.id] = lvl + 1;
            const next = E.derive(state)[p[0]];
            if (had === undefined) delete store[up.id]; else store[up.id] = had;
            if (typeof now !== 'number' || Math.abs(next - now) < 1e-9) continue;
            return `${p[1]}: ${p[2](now)} → ${p[2](next)}`;
        }
        return null;
    }

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
            unknown || !up.flavor ? null : el('p', { class: 'detail-flavor', text: up.flavor }),
            // A new way to play shows what it does before it's bought.
            !unknown && up.mechanic && lvl === 0 ? mechanicDemo(up.mechanic) : null
        ].filter(Boolean);
        if (unknown) {
            const needs = up.requires && E.level(state, up.requires) < 1 ? `Grows from ${E.UPGRADE_BY_ID[up.requires].name}` : up.hint || 'Locked';
            parts.push(el('p', { class: 'detail-lock', text: needs }));
        } else if (st === 'maxed') {
            parts.push(el('p', { class: 'detail-maxed', text: 'Fully upgraded' }));
        } else {
            const cost = E.upgradeCost(up, lvl);
            const preview = nodePreview(up, lvl);
            if (preview) parts.push(el('p', { class: 'detail-preview', text: preview }));
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
        box.querySelector('.detail-icon').innerHTML = icon(unknown ? 'lock' : nodeIcon(up));
    }

    // ---- Mechanic demos ---------------------------------------------------------
    // A node that brings a new way to play (`mechanic` in engine.js) shows three seconds of actual gameplay in its
    // popup before it's bought, so the change can be felt before it's chosen (playtest 2: a breakthrough "wasn't
    // well defined" until it happened). The real ball physics (training-path.js) on a short stretch, with scripted
    // sprints and the mechanic at work, drawn like the trail: same ball, hills, strips and colours.
    const DEMO = { w: 240, h: 112, graph: 92, period: 3.2, leg: 2, seed: 7, strength: 1.6, view: 9 };
    const DEMO_TEXT = {
        breakthrough: 'Sometimes a sprint hits ×1.75 harder',
        prompt: 'Release inside the zone: bonus XP',
        maxEffort: 'Now and then a sprint goes all out at once',
        charge: 'The meter holds at full for a moment',
        stripFront: 'Strips on hill faces push you up',
        stripBack: 'Strips on hill backs stop a roll-back',
        viral: 'Sometimes a run\'s XP is multiplied',
        crunch: 'For a few seconds, every sprint is free',
        flow: 'The ball lifts and glides over the hills'
    };
    // Each demo: the roll's options, where the ball starts, and the sprints [time s, strength ×, label].
    const DEMO_SCRIPTS = {
        breakthrough: { sprints: [[0.15, 1], [1.1, 1.75, 'BREAKTHROUGH ×1.75']] },
        prompt: { meter: 'zone', sprints: [[0.7, 1.2, 'CLEAN PROMPT +XP'], [1.9, 1.2, 'CLEAN PROMPT +XP']] },
        maxEffort: { meter: 'effort', sprints: [[0.15, 1], [1.2, 2.2, 'MAX EFFORT']] },
        charge: { meter: 'hold', sprints: [[1.15, 1]] },
        stripBack: { strips: { back: 3, more: 2 }, place: 'back' },
        stripFront: { strips: { front: 3, more: 2 }, place: 'front' },
        viral: { sprints: [[0.15, 1], [1.0, 1]], pop: [2.0, '+XP ×2', 'VIRAL'] },
        crunch: { sprints: [[0.15, 1, 'CRUNCH: FREE SPRINTS'], [0.5, 1], [0.85, 1], [1.2, 1], [1.55, 1]], flames: [0.15, 2] },
        flow: { sprints: [[0.15, 1]], flow: [0.6, 1.8, 'FLOW'] }
    };

    function mechanicDemo(kind) {
        const canvas = el('canvas', { class: 'mechanic-demo', 'aria-hidden': 'true' });
        const wrap = el('figure', { class: 'demo' }, [canvas, el('figcaption', { text: DEMO_TEXT[kind] || '' })]);
        const dpr = Math.min(3, (window.devicePixelRatio || 1) * uiScale());
        canvas.width = DEMO.w * dpr;
        canvas.height = DEMO.h * dpr;
        const ctx = canvas.getContext('2d');
        let sim = null;
        let last = performance.now();
        const frame = now => {
            if (!canvas.isConnected) return;
            // Off screen (a hidden legacy card or screen): check back now and then rather than drawing.
            if (!canvas.offsetParent) return void setTimeout(() => requestAnimationFrame(frame), 500);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!sim || sim.t >= DEMO.period) sim = demoStart(kind);
            // Under reduced motion: one still frame partway in.
            if (reducedMotion()) { while (sim.t < 1.6) demoStep(sim, 1 / 60); }
            else demoStep(sim, dt);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawDemo(ctx, sim);
            if (!reducedMotion()) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        return wrap;
    }

    function demoStart(kind) {
        const script = DEMO_SCRIPTS[kind] || {};
        const roll = T.createRoll(DEMO.leg, DEMO.seed, { pushes: 8, cooldown: 0.3, strips: script.strips });
        const sim = { kind, script, roll, t: 0, next: 0, label: null, labelAt: -9, shock: null, cam: null };
        // One vertical scale for the whole loop, from the tallest hill it can reach: rescaling as hills came into
        // view made the peaks jump and clip.
        let tallest = 0.15;
        // What the camera can show in one loop, short of the leg's skill hill (a goal the demos never reach).
        const end = Math.min(roll.ball.x + DEMO.view + 14, roll.ground.goal?.start ?? Infinity);
        for (let x = roll.ball.x - DEMO.view; x < end; x += 0.02) tallest = Math.max(tallest, roll.ground.height(x));
        sim.top = tallest * 1.12;
        // The strip demos start the ball where its strip matters: rolling back onto a back strip, or up to a face strip.
        if (script.place) {
            const st = roll.ground.strips.find(x => x.kind === script.place);
            roll.push(0.001);
            if (st && script.place === 'back') { roll.ball.x = st.to + 0.5; roll.ball.v = -2.3; sim.label = 'BRAKE ■'; sim.labelAt = 0.4; }
            if (st && script.place === 'front') { roll.ball.x = st.from - 0.4; roll.ball.v = 1.5; roll.ball.maxX = roll.ball.x; sim.label = 'PUSH ▲'; sim.labelAt = 0.3; }
        }
        return sim;
    }

    function demoStep(sim, dt) {
        const { roll, script } = sim;
        const sprints = script.sprints || [];
        while (sim.next < sprints.length && sim.t >= sprints[sim.next][0]) {
            const [, mult, label] = sprints[sim.next++];
            roll.ball.cooldown = 0;
            roll.push(DEMO.strength * mult, true);
            if (label) { sim.label = label; sim.labelAt = sim.t; }
            if (mult > 1.5) sim.shock = { x: roll.ball.x, t: sim.t };
        }
        if (script.flow && sim.t >= script.flow[0] && !sim.flowed) {
            sim.flowed = true;
            roll.coast(script.flow[1], 1.4);
            sim.label = script.flow[2];
            sim.labelAt = sim.t;
        }
        if (script.pop && sim.t >= script.pop[0] && !sim.popped) {
            sim.popped = true;
            sim.label = script.pop[2];
            sim.labelAt = sim.t;
        }
        if (!roll.over) roll.step(dt);
        sim.t += dt;
    }

    function drawDemo(ctx, sim) {
        const c = path.colors;
        const { w, h } = DEMO;
        const { roll, script, t } = sim;
        const g = roll.ground;
        // The camera follows the ball, a little ahead; the hills in view fill the height.
        const want = roll.ball.x - DEMO.view * 0.35;
        sim.cam = sim.cam == null ? want : sim.cam + (want - sim.cam) * 0.12;
        const left = sim.cam;
        // A sample per canvas pixel, so a steep, narrow peak keeps its tip as it scrolls past.
        const xs = Array.from({ length: w + 1 }, (_, i) => left + (DEMO.view * i) / w);
        // The loop's scale, eased up to make room when the skill hill comes into view (never a jump, never a clip).
        const need = Math.max(sim.top, ...xs.map(x => g.height(x) * 1.08));
        sim.view = sim.view == null ? need : sim.view + (need - sim.view) * (need > sim.view ? 0.3 : 0.05);
        const top = Math.max(sim.view, need * 0.97);
        const gh = DEMO.graph;   // the graph; the meter sits under it, as in a run
        const X = x => ((x - left) / DEMO.view) * w;
        const Y = y => gh - 6 - (y / top) * (gh - 24);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = hexAlpha(c.bg, 1);
        ctx.fillRect(0, 0, w, h);
        // The trail, filled below like the run view.
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(g.height(x))) : ctx.moveTo(X(x), Y(g.height(x)))));
        ctx.strokeStyle = hexAlpha(c.muted, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineTo(w, gh);
        ctx.lineTo(0, gh);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(c.primary, 0.06);
        ctx.fill();
        ctx.fillStyle = hexAlpha(c.muted, 0.25);
        ctx.fillRect(0, gh, w, 1);
        // Strips in view.
        for (const st of g.strips) {
            if (st.to < left || st.from > left + DEMO.view) continue;
            ctx.beginPath();
            for (let x = st.from; x <= st.to; x += 0.1) x === st.from ? ctx.moveTo(X(x), Y(g.height(x)) - 2) : ctx.lineTo(X(x), Y(g.height(x)) - 2);
            ctx.strokeStyle = hexAlpha(st.kind === 'back' ? c.success : c.primary, 0.9);
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        // The ball (lifted while it flows or flies).
        const lift = roll.flowing ? 0.35 * top : roll.airborne ? roll.height || 0 : 0;
        const bx = X(roll.ball.x);
        const by = Y(g.height(roll.ball.x) + lift) - 5;
        if (script.flames && t >= script.flames[0] && t < script.flames[0] + script.flames[1]) {
            for (let i = 0; i < 6; i++) {
                const a = t * 40 + i;
                ctx.beginPath();
                ctx.arc(bx + Math.cos(a) * 8, by + Math.sin(a) * 8, 2, 0, Math.PI * 2);
                ctx.fillStyle = hexAlpha(i % 2 ? c.warning : c.danger, 0.8);
                ctx.fill();
            }
        }
        if (sim.shock && t - sim.shock.t < 0.35) {
            ctx.beginPath();
            ctx.arc(X(sim.shock.x), by, 6 + (t - sim.shock.t) * 120, 0, Math.PI * 2);
            ctx.strokeStyle = hexAlpha(c.warning, 1 - (t - sim.shock.t) / 0.35);
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fillStyle = sim.shock && t - sim.shock.t < 1 ? c.warning : roll.flowing ? c.accent : c.text;
        ctx.fill();
        // The meter, under the trail whenever the demo sprints: up to the zone, all at once, or holding at the top.
        if (script.meter || script.sprints) {
            const nextAt = (script.sprints || []).find(x => x[0] >= t - 0.05)?.[0] ?? 9;
            const prevAt = [...(script.sprints || [])].reverse().find(x => x[0] < t)?.[0] ?? 0;
            const span = Math.max(0.3, nextAt - prevAt);
            let fill = Math.min(1, (t - prevAt) / span);
            let tone = c.primary;
            if (script.meter === 'zone') fill *= 0.62;
            if (script.meter === 'effort') { fill = t > 1.0 && t < 1.4 ? 1 : fill * 0.7; if (fill === 1) tone = c.warning; }
            if (script.meter === 'hold') { fill = t < 0.6 ? t / 0.6 : 1; if (t >= 0.6 && t < 1.15) tone = c.warning; }
            // The strength meter, under the trail like the run view's.
            const mx = 8, mw = w - 16, my = gh + 7, mh = 7;
            ctx.fillStyle = hexAlpha(c.muted, 0.25);
            ctx.fillRect(mx, my, mw, mh);
            if (script.meter === 'zone') {
                ctx.fillStyle = hexAlpha(c.success, 0.45);
                ctx.fillRect(mx + mw * 0.55, my, mw * 0.13, mh);
            }
            ctx.fillStyle = tone;
            ctx.fillRect(mx, my, mw * fill, mh);
            if (script.meter === 'hold' && t >= 0.6 && t < 1.15) sim.label = 'HOLD', sim.labelAt = Math.max(sim.labelAt, 0.6);
        }
        // What's happening, for a moment after it happens.
        if (sim.label && t >= sim.labelAt && t - sim.labelAt < 1.3) {
            ctx.font = '700 10px "Chakra Petch", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = sim.label.startsWith('BRAKE') ? c.success : sim.label.startsWith('PUSH') || sim.label.startsWith('CLEAN') ? c.primary
                : sim.label === 'FLOW' ? c.accent : sim.label.startsWith('CRUNCH') ? c.danger : c.warning;
            ctx.fillText(sim.label, 8, 14);
        }
        if (script.pop && sim.popped && t - script.pop[0] < 1.1) {
            ctx.font = '700 14px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = `hsl(${(t * 260) % 360} 90% 65%)`;
            ctx.fillText(script.pop[1], bx, by - 12 - 14 * (t - script.pop[0]));
        }
    }

    function showTrainingView(view) {
        if (openBay) ptView(view === 'dev' ? 'tree' : 'bay:training');
        path.view = view;
        path.done = false;
        $('runView').hidden = view !== 'run';
        $('devView').hidden = view !== 'dev';
        if (view === 'dev') {
            path.charging = null;
            window.SFX?.chargeStop();
            dismissResult();
            renderTree();
            renderLegPicker();
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
            // The frontier first (the usual run), then replays from the newest cleared leg back to the warm-up.
            // "Leg 1: Tokenization ✓" read as "start from the beginning" in a playtest and sent a run to the warm-up.
            select.replaceChildren(
                el('option', { value: '', text: E.actTwoLocked(state) ? 'Act II: not available in the demo' : `Frontier: ${E.skillAt(learned).name} (leg ${learned + 1}${characterTag(learned, ', ')})` }),
                ...Array.from({ length: learned }, (_, i) => learned - 1 - i).map(k =>
                    el('option', { value: k, text: `Replay leg ${k + 1}: ${E.skillAt(k).name}${k === 0 ? ' (warm-up)' : characterTag(k, ' · ')}` })));
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
        const inFlight = path.roll && path.stateRef === state && path.roll.launched && !path.roll.over;
        if (path.view === 'dev') setText($('startRunButton'), inFlight ? 'Watch run' : replay ? 'Start replay' : `Start run ${state.stats.rolls + 1}`);
    }

    // The Upgrades shortcut is always there in the run view: a run in flight (the Auto-Trainer's, or yours)
    // keeps going while you shop.
    function updateTreeButton() {
        setHidden($('treeButton'), openBay !== 'training' || path.view !== 'run');
        // Restart shows while a run is under way (a playtester wanted to drop a bad start without playing it out).
        const r = path.roll;
        const show = openBay === 'training' && path.view === 'run' && r && r.launched && !r.over && !path.done;
        // In the run view it keeps its place while it can't be used (invisible), so the bay bar never changes
        // height on the first sprint: the trail used to jump and the sprint button left the screen on phones.
        const keep = openBay === 'training' && path.view === 'run' && !!r;
        setHidden($('restartButton'), !show && !keep);
        $('restartButton').classList.toggle('reserve', !show);
        if (show || keep) {
            const cost = E.restartCost(state, ballLeg());
            setText($('restartButton'), `Restart · ${E.formatCost(cost)}`);
            setDisabled($('restartButton'), !show || !E.canAfford(state, cost));
        }
    }

    // Restart: abandon the run in flight and set up a fresh one at the same start, for half a full sprint
    // (`E.restartCost`). What it spent stays spent and nothing it earned is paid; it doesn't count as a run.
    function restartRun() {
        const r = path.roll;
        if (!r || !r.launched || r.over || path.done) return;
        const cost = E.restartCost(state, ballLeg());
        if (!E.canAfford(state, cost)) return;
        for (const [k, v] of Object.entries(cost)) state.res[k] -= v;
        pt('restart', { leg: (r.leg ?? r.ground.stretch) + 1, prog: r2(r.progress || 0) });
        log('Run abandoned. A fresh one is waiting at the start.', 'info');
        path.roll = null;
        path.fx = freshFx();
        path.charging = null;
        window.SFX?.chargeStop();
        path.timeScale = 1;
        path.overview = 0;
        path.pause = 0;
        dismissResult();
        currentRoll();
        updateTreeButton();
        render();
        startPathLoop();
        $('pushButton').focus({ preventScroll: true });
    }

    // The Auto-Trainer's switch, in the server room's bar and the bay's bar (one setting, both in step),
    // once it's bought; the server room also gets a way straight to the upgrades. On the upgrades screen a
    // live monitor shows the run it's training (click it to watch).
    function renderAutoTrainer() {
        const owned = E.level(state, 'autoTrainer') > 0;
        const on = E.autoTrainerLevel(state) > 0;
        for (const b of document.querySelectorAll('[data-auto-switch]')) {
            if (b.closest('.facility')) continue;
            setHidden(b, !owned);
            b.setAttribute('aria-checked', String(on));
        }
        setHidden($('hubUpgrades'), !bayUnlocked('training') || state.stats.rolls === 0);
        // Before it's earned, the bay shows how close it is (one of the gates that join the lab and the trail).
        const gate = !owned && state.path.learned > E.FIRST_REAL_SKILL && state.challenge?.id !== 'handmade' ? E.automationGate(state, 'autoTrainer') : null;
        setHidden($('autoGate'), !gate);
        if (gate) {
            const parts = [];
            if (gate.done < gate.need) parts.push(`${gate.done}/${gate.need} runs`);
            if (!gate.skillOk) parts.push(`after ${gate.skill}`);
            setText($('autoGate'), `Auto-Trainer: ${parts.join(' · ')}`);
        }
        // Its ghost run: a live monitor on the upgrades screen, and faint in the run view's corner while you train.
        const inBay = on && ghostOn() && openBay === 'training';
        setHidden($('devLive'), !(inBay && path.view === 'dev'));
        setHidden($('ghostLane'), !(inBay && path.view === 'run'));
        if (inBay) {
            const roll = ghost.roll;
            const text = roll && roll.launched && !roll.over
                ? `Auto-Trainer · ${E.skillAt(Math.min(roll.leg, state.path.learned - 1)).name} (${Math.round(Math.min(1, roll.ground.progressIn(Math.min(roll.leg, state.path.learned - 1), roll.ball.x)) * 100)}%)`
                : 'Auto-Trainer · next replay starting';
            setText($('devLiveText'), text);
            setText($('ghostLaneText'), text);
        }
    }

    // Earning it asks first, outside the Training Cluster (inside, it waits until you're out): it starts off,
    // since one switching itself on mid-run felt like being taken over (owner's call). Saves that already had it
    // aren't asked again.
    function promptAutoTrainer() {
        if (state.intro['prompt:autoTrainer'] || !(E.level(state, 'autoTrainer') > 0) || openBay === 'training'
            || document.querySelector('dialog[open]') || zooming || !introDone()) return;
        state.intro['prompt:autoTrainer'] = true;
        pt('tip', { id: 'prompt:autoTrainer' });
        openDialog({
            title: 'Auto-Trainer ready',
            message: 'Your AI can train itself now. Switched on, it replays the newest leg you\'ve cleared in the background while you play, earning XP. Its sprints cost nothing, at the strength you had the last time you ran that leg yourself. It\'s an early model: about half that strength, and it fumbles a lot of sprints. It gets better as it levels up and as you learn skills. Your own runs stay yours. Turn it on?',
            okLabel: 'Turn it on', cancelLabel: 'Not now'
        }).then(r => {
            E.setTaskOn(state, 'autoTrainer', r.ok);
            pt('task', { id: 'autoTrainer', on: r.ok, why: 'prompt' });
            log(r.ok ? 'Auto-Trainer on: it replays your newest cleared leg in the background.' : 'Auto-Trainer off for now: switch it on any time in the server room or the Training Cluster.', 'info');
            afterChange();
            save();
        });
    }

    function buildAutoTrainer() {

        for (const b of document.querySelectorAll('[data-auto-switch]')) {
            b.addEventListener('click', e => {
                e.stopPropagation();
                E.setTaskOn(state, 'autoTrainer', !E.taskOn(state, 'autoTrainer'));
                pt('task', { id: 'autoTrainer', on: E.taskOn(state, 'autoTrainer') });
                afterChange();
                save();
                // Your run is never touched: the ghost starts (or stops) beside it.
                renderAutoTrainer();
                startPathLoop();
            });
        }
        $('hubUpgrades').addEventListener('click', () => {
            const node = $('bays').querySelector('.bay[data-bay="training"]');
            enterBay('training', node);
            if (openBay === 'training') showTrainingView('dev');
        });
        $('devLive').addEventListener('click', () => showTrainingView('run'));
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
    // one (Paradigm Shift) smashes through the hills ahead: a blast of light runs along the ground, each hill
    // cracks into slabs (glowing seams first, in a wave from the ball) that blow apart and tumble away, and
    // the ground lies flat behind them. Crunch: free sprints for a few seconds, with a fiery aura and a
    // countdown ring; a super one (Bullet Time) stops time: the world drains to cold grey, dust hangs in the
    // air, a clock face ticks down round the ball and every sprint banks (×1.5) as a chevron ahead of it,
    // until it all lands at once with a white flash and streaks. Max Effort: your next sprint goes all out
    // (gold meter). Flow: the ball rises off the line to fly high over the hills (mid-sky, or clear of the
    // tallest in view) trailing a ribbon, while calm lights drift past and the trail swells to a slow beat;
    // a super flow (Lucid Dream) shrinks the world around it, the hills ahead losing height and width.
    // Viral: reactions pour off the ball and the result card gets a rainbow edge.
    const WINDUP_SECONDS = 0.8;
    const BOOST_SECONDS = 1.3;
    const FLOW_BPM = 66;
    function freshFx() {
        return { windup: null, boost: 0, trail: [], shocks: [], sparks: [], shake: 0, crunch: 0, crunchMax: 0, maxEffort: false, reactions: [],
            flowMax: 0, lift: 0, lights: [], freeze: 0, freezeMax: 0, bank: 0, banked: 0, debris: [],
            shards: [], breach: null, flash: null, motes: [], streaks: [], flight: [], pops: [], tear: 0 };
    }
    const crunching = () => path.fx.crunch > 0;
    // Bullet Time: the run is frozen and sprints bank their power.
    const frozen = () => path.fx.freeze > 0;
    const flowing = () => !!path.roll && !path.roll.over && path.roll.flowing > 0;
    const LUCID = '#b48cff';
    const BANK_MULT = 1.5;      // Bullet Time: each banked sprint lands this much harder
    const LUCID_WARP = 4;       // Lucid Dream: time condenses, the ball covers this many times the ground
    const LUCID_CONDENSE = 3;   // and the view squeezes this much wider (heights keep their scale)
    const LATE_VIEW = 26;       // late legs: metres of trail in view at rest (wider with speed; at 18 the zoom tracked
                                //   speed so closely that a fast ball looked no faster)
    const LATE_RELIEF = 0.9;    // and a slightly flatter vertical scale (0.35 left the swells and flights in the bottom fifth of an empty sky)

    // A banner's baseline on the trail, kept clear of the live XP pill over it (on phones the pill sits at
    // 40 px and wraps, and a banner at 20% of a short canvas was drawn through it). `cap`: the text's height.
    function bannerTop(y, cap) {
        const pill = $('liveXp');
        return pill && !pill.hidden ? Math.max(y, pill.offsetTop + pill.offsetHeight + cap) : y;
    }

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
        handCharges: [],        // your recent sprint charges, which the Auto-Trainer copies
        timeScale: 1,           // < 1 in slow motion
        tension: 0,             // 0–1: how far the camera has pushed in on a nail-biter
        focus: null,            // the hill of the current nail-biter
        summit: null,           // { age, name } while celebrating a crest
        particles: [],          // confetti, in world units
        rollKey: '',
        rollPushes: 0,
        charging: null,         // { start } while the push button is held
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
        if (k != null && k >= 0 && k < state.path.learned) return k;
        return E.frontierLeg(state);
    }
    const autoOn = () => E.autoTrainerLevel(state) > 0;

    // The leg the ball is on now (pushes cost what they cost there), or where the next run starts.
    function ballLeg() {
        const roll = path.roll;
        return roll && path.stateRef === state ? Math.min(roll.leg, state.path.learned) : startLeg();
    }

    // `chosen`: the player picked it (Start at, or the tag's ×), not just walked into the bay.
    function setStartLeg(k, chosen = false) {
        path.startLeg = k != null && k < state.path.learned ? k : null;
        pt('startAt', { leg: path.startLeg == null ? 'frontier' : path.startLeg + 1 });
        const roll = path.roll;
        // A run waiting at the start line is rebuilt on the chosen leg; one in flight finishes first.
        if (roll && !roll.launched && !path.done) currentRoll();
        renderLegPicker();
        updateLegTag();
    }

    function currentRoll() {
        const d = E.derive(state, debugRates);
        const first = startLeg();
        const key = [state.stats.runStart, state.path.learned, first, E.rollSeed(state), d.pushesPerRoll, d.pushCooldown, d.friction, d.hillScale, d.stripFront, d.stripBack, d.stripMore, d.inertia].join(':');
        // A finished run stays on screen (path.done) until you click through to the dev screen.
        const stale = !path.roll || path.stateRef !== state || (path.roll.over && !path.done) || (!path.roll.launched && path.rollKey !== key);
        if (stale && path.pause <= 0) {
            // A run from a cleared leg rolls on through every later leg up to the frontier, and past it: cresting
            // the frontier's skill hill learns the skill and lays the next leg (onward), so nothing cuts a run short.
            path.roll = T.createRoll(first, E.rollSeed(state),
                { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, onward: true, last: E.frontierLeg(state),
                    holdOpen: crunching, endAt: E.ACT_TWO_LOCKED ? demoGateX() : null });
            path.roll.frontier = state.path.learned;   // where the frontier was when the run started
            // A new run is a cut, not a zoom across from wherever the last one left the camera.
            path.cam = null;
            path.camView = null;
            path.lateView = null;
            path.roll.capBefore = labCapacities();      // the lab's room when it started, to say what a skill opened
            path.autoAt = 0;
            path.rollPushes = d.pushesPerRoll;
            path.burnUnit = null;
            path.burnStrength = null;
            path.autoThrust = false;
            path.rollKey = key;
            path.stateRef = state;
        }
        return path.roll;
    }

    // The trail's canvas colours come from the theme's tokens (read again when the theme changes).
    function readColorTokens() {
        const css = getComputedStyle(document.documentElement);
        for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'muted', 'border', 'text', 'bg', 'research', 'terminal', 'snare-good', 'snare-bad', 'snare-tag']) {
            path.colors[name] = css.getPropertyValue('--' + name).trim();
        }
        return !!path.colors.primary;
    }
    function readPathColors() {
        readColorTokens();
        if (path.canvas && path.width) drawPath();
    }
    // In the artifact the stylesheet can land after the scripts start, and tokens read then are empty: the
    // first run's trail drew all in black (owner's phone). A draw with no colours reads them again.
    const ensurePathColors = () => path.colors.primary || readColorTokens();

    function buildPath() {
        document.querySelector('.run-stats .module-supply').addEventListener('click', () => jumpTo('lab'));
        const canvas = $('pathCanvas');
        path.canvas = canvas;
        path.ctx = canvas.getContext('2d');
        readPathColors();

        // The trail fills the bay: the canvas takes its wrap's size (CSS gives the wrap the free space).
        new ResizeObserver(() => {
            const dpr = (window.devicePixelRatio || 1) * uiScale();
            const wrap = canvas.parentElement;
            path.width = wrap.clientWidth;
            // No 220 px floor: a sideways phone gives the wrap 140–180 px, and a taller canvas spilled over the
            // meter and the sprint button (measured 220 px in a 168 px wrap at 844 × 390).
            path.height = Math.max(120, wrap.clientHeight);
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
                if (dismissTipFirst()) return;
                target.setPointerCapture?.(e.pointerId);
                pressHold();
            });
            target.addEventListener('pointerup', letGo);
            target.addEventListener('pointercancel', letGo);
        }
        // Space/Enter charge from anywhere in the run view, not only with the trail or button focused:
        // clicking Train again leaves focus on the page, and the keys went dead. Other controls (a focused
        // button, an input, a dialog) keep their own keys.
        const runKeys = e => (e.key === 'Enter' || e.key === ' ') && openBay === 'training' && path.view === 'run'
            && (e.target === document.body || e.target === canvas || e.target === $('pushButton') || e.target.closest?.('#runView') && !e.target.closest('button:not(#pushButton), input, a, [data-next]'))
            && !document.querySelector('dialog[open]');
        document.addEventListener('keydown', e => {
            if (!runKeys(e)) return;
            e.preventDefault();
            if (e.repeat || dismissTipFirst()) return;
            pressHold();
        });
        window.addEventListener('blur', () => { path.held = false; });
        document.addEventListener('keyup', e => {
            if (!runKeys(e)) return;
            e.preventDefault();
            letGo();
        });
        // Exploits: E, W or ↑ (Space and Enter sprint), or the button beside Sprint. Pressing aims (slow motion),
        // letting go hops.
        const exploitKey = e => ['e', 'E', 'w', 'W', 'ArrowUp'].includes(e.key) && openBay === 'training' && path.view === 'run'
            && !document.querySelector('dialog[open]') && !e.target.closest?.('input, select, textarea');
        document.addEventListener('keydown', e => {
            if (!exploitKey(e)) return;
            e.preventDefault();
            if (e.repeat || dismissTipFirst()) return;
            startAim();
        });
        document.addEventListener('keyup', e => {
            if (!exploitKey(e)) return;
            e.preventDefault();
            releaseAim();
        });
        const hopButton = $('exploitButton');
        hopButton.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            if (dismissTipFirst()) return;
            hopButton.setPointerCapture?.(e.pointerId);
            startAim();
        });
        hopButton.addEventListener('pointerup', () => releaseAim());
        hopButton.addEventListener('pointercancel', () => releaseAim());
        hopButton.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('blur', () => releaseAim());
        $('exploitButton').addEventListener('click', e => { if (e.detail === 0) useExploit(); });   // keyboard activation
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        $('rollResult').addEventListener('click', e => {
            const go = e.target.closest('[data-next]');
            if (go) go.dataset.next === 'dev' ? toDevScreen() : go.dataset.next === 'lab' ? jumpTo('lab') : runAgain();
        });
        $('pushButton').addEventListener('contextmenu', e => e.preventDefault());
    }

    // ---- Exploits (design/contract-breakers.md) ----
    // The player breaks the trail's rules, on purpose and with timing: every exploit is a skill check. The first is
    // Hop (found with Embeddings): pressed on a crest's lip (the glowing window drawn on the hills ahead) it's
    // perfect: undetected, +30% speed and a super prompt's XP; high on any hill it's good; anywhere else a weak hop,
    // and the run is flagged. Three flags (E.AUDIT_FLAGS) and the run is audited: it ends there and pays half. The
    // Auto-Trainer never exploits (it's what a hand run does better). Act two (thrust) has none yet.
    // Timing it (the owner's playtest: on a phone the window was 4–12 px and 25–135 ms, under touch latency):
    // holding Hop sets a breakpoint: the run slows to HOP_AIM_SCALE, the camera leans in on the hills ahead and
    // a ring closes on the ball as the next lip comes up; letting go hops. A quick tap still hops at once. The
    // window lasts at least HOP_MIN_WINDOW of game time at the ball's speed, and a release up to HOP_GRACE_MS
    // after leaving it still counts (touch latency).
    const HOP_PERFECT = 1.1;   // speed on a clean hop (1.3 with a lossy landing; the landing is clean now)
    const HOP_LIP = 0.3;       // the perfect window: from this share of a hill's half-width before its crest…
    const HOP_PAST = 0.12;     // …to this share past it
    const HOP_MIN_WINDOW = 0.12;
    const HOP_REACH = 0.55;    // …but never further from the crest than this share of the half-width   // seconds of game time the window lasts at least, at the ball's speed
    const HOP_GRACE_MS = 70;   // a release this soon after leaving the window still counts
    const HOP_AIM_SCALE = 0.35;    // time while aiming
    const HOP_AIM_MAX = 2.5;   // real seconds of slow motion per press (then time runs on; letting go still hops)
    const HOP_AIM_RING = 0.5;  // seconds of game time ahead that the ring starts closing
    const HOP_POWER = { perfect: 1, good: 0.85, miss: 0.45 };
    const HOP_KEEP = { perfect: 1, good: 0.92, miss: 0.8 };   // speed kept through the landing
    const exploitsLeft = roll => Math.max(0, E.exploitCharges(state) - (roll.exploitsUsed || 0));
    const exploitOpen = roll => !!roll && E.exploitCharges(state) > 0 && !thrustLeg(roll);
    function exploitReady(roll) {
        return exploitOpen(roll) && exploitsLeft(roll) > 0 && roll.launched && !roll.over && !roll.crested && !path.done
            && !roll.airborne && !frozen() && !flowing() && !path.fx.windup;
    }
    // A hill's perfect window: its lip, stretched (mostly before the crest) to last HOP_MIN_WINDOW at speed `v`,
    // never past the hill itself.
    function hopWindow(b, v) {
        let from = b.peak - HOP_LIP * b.halfWidth, to = b.peak + HOP_PAST * b.halfWidth;
        const short = Math.max(0, Math.abs(v) * HOP_MIN_WINDOW - (to - from));
        // Kept to the hill's top (stretched down a cliff's face, a hop went straight up it).
        from = Math.max(b.peak - HOP_REACH * b.halfWidth, from - short * 0.7);
        to = Math.min(b.peak + HOP_REACH * b.halfWidth * 0.6, to + short * 0.3);
        return { from, to };
    }
    // The hill the ball is on and where on it: perfect on the lip, good high on the hill, else a miss.
    function hopQuality(roll) {
        const g = roll.ground, x = roll.ball.x;
        if (roll.ball.v < 0.3) return 'miss';
        const b = g.bumps.find(h => x >= h.start && x <= h.end);
        if (!b) return 'miss';
        const w = hopWindow(b, roll.ball.v);
        if (x >= w.from && x <= w.to) return 'perfect';
        return g.height(x) >= 0.5 * b.height ? 'good' : 'miss';
    }
    // The next window ahead of the ball (the one it's in counts), for the aiming ring.
    function nextHopWindow(roll) {
        const x = roll.ball.x, v = roll.ball.v;
        for (const b of roll.ground.bumps) {
            if (b.end < x) continue;
            const w = hopWindow(b, v);
            if (w.to >= x) return { ...w, bump: b };
        }
        return null;
    }
    // Aiming: hold to slow down, let go to hop.
    function startAim() {
        const roll = path.roll;
        if (!exploitReady(roll) || path.charging || path.hopAim) return;
        path.hopAim = { at: performance.now(), roll };
        startPathLoop();
    }
    function releaseAim() {
        if (!path.hopAim) return;
        const roll = path.hopAim.roll;
        path.hopAim = null;
        if (roll === path.roll) useExploit();
    }
    // Is the slow motion on (held, within its budget, and still a hop to be had)?
    function aiming() {
        const a = path.hopAim;
        if (!a) return false;
        if (a.roll !== path.roll || !exploitReady(path.roll)) { path.hopAim = null; return false; }
        return performance.now() - a.at < HOP_AIM_MAX * 1000;
    }
    // Every frame: remember when the ball was last in a perfect window (the grace for a late release).
    function trackHopWindow(roll) {
        if (roll && exploitReady(roll) && hopQuality(roll) === 'perfect') path.hopSeen = performance.now();
    }
    const EXPLOIT_TEXT = { perfect: 'CLEAN EXPLOIT', good: 'EXPLOIT', miss: 'FLAGGED' };
    function useExploit() {
        const roll = path.roll;
        if (!exploitReady(roll) || path.charging) return;
        let q = hopQuality(roll);
        // Let go a moment after the lip passed: still clean (touch latency). Not on a hill's foot: that's a miss.
        if (q === 'good' && performance.now() - (path.hopSeen || 0) < HOP_GRACE_MS) q = 'perfect';
        if (!roll.hop(HOP_POWER[q], HOP_KEEP[q])) return;
        roll.exploitsUsed = (roll.exploitsUsed || 0) + 1;
        if (q === 'perfect') roll.ball.v *= HOP_PERFECT;
        const xp = E.grantExploit(state, q, ballLeg());
        if (xp) roll.bonusXp = (roll.bonusXp || 0) + xp;
        roll.exploitClean = (roll.exploitClean || 0) + (q === 'perfect' ? 1 : 0);
        const h = roll.ground.height(roll.ball.x);
        path.fx.pops.push({ wx: roll.ball.x, wh: h, age: 0, life: 1.3, big: q === 'perfect', text: q === 'perfect' ? `${EXPLOIT_TEXT[q]} +${xpText(xp)}` : EXPLOIT_TEXT[q] });
        path.fx.tear = q === 'miss' ? 0.18 : 0.3;
        if (q === 'perfect') { path.fx.boost = Math.max(path.fx.boost, 0.25); trailSfx('clean'); }
        trailSfx(q === 'miss' ? 'error' : 'launch');
        pt('exploit', { kind: 'hop', q, leg: ballLeg() + 1, v: r2(roll.ball.v), x: r2(roll.ball.x) });
        if (q === 'miss') {
            roll.flags = (roll.flags || 0) + 1;
            if (roll.flags >= E.AUDIT_FLAGS) {
                // Audited: the run ends where it is and pays half (finishRoll).
                roll.audited = true;
                state.stats.audits++;
                path.legFlash = { age: 0, text: 'AUDITED · three flagged exploits', tone: 'danger' };
                finishRoll(roll.end());
            }
        }
        startPathLoop();
    }

    // An exploit tears the screen along a few scanlines for a moment (the glitch's look): bands of the frame
    // shifted sideways and tinted. Not under reduced motion or with screen shake off.
    function drawTear(ctx) {
        const tear = path.fx.tear || 0;
        if (tear <= 0 || !shakeOn()) return;
        const cv = ctx.canvas;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 4; i++) {
            const h = Math.max(2, Math.round(cv.height * (0.015 + Math.random() * 0.04)));
            const y = Math.floor(Math.random() * (cv.height - h));
            const dx = Math.round((Math.random() - 0.5) * cv.width * 0.06 * (tear / 0.3));
            ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h);
            ctx.fillStyle = hexAlpha(path.colors.research, 0.18);
            ctx.fillRect(0, y, cv.width, h);
        }
        ctx.restore();
    }

    // ---- Charging a push ----

    const CHARGE_SWEEP_MS = 1250;    // time for the meter to sweep from empty to full (then back)

    // Meter position (0–1) while charging: sweeps up to what you can afford, holds there for `hold` ms
    // (Fast Charging), sweeps back down, and up again.
    function chargeLevel(now = performance.now()) {
        if (!path.charging) return 0;
        const { cap, sweep, hold } = path.charging;
        const up = cap * sweep;
        const t = (now - path.charging.start) % (2 * up + hold);
        if (t <= up) return t / sweep;
        if (t <= up + hold) return cap;
        return cap - (t - up - hold) / sweep;
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

    // Whether the run still takes sprints at all (pushes left and affordable, or free during a crunch or
    // Bullet Time). Charging also needs readyToFire: no early charging or queued sprints.
    function canPush(roll) {
        if (roll.over || roll.crested || path.pause > 0) return false;
        if (crunching() || frozen()) return true;
        return roll.pushesLeft > 0 && chargeBudget() >= E.PATH.minCharge;
    }

    // Whether a sprint can charge and fire right now: no wind-up or cooldown in the way (Bullet Time banks
    // sprints whenever, so it's always ready).
    function readyToFire(roll) {
        if (frozen()) return canPush(roll);
        return canPush(roll) && !path.fx.windup && roll.ball.cooldown <= 0;
    }

    function dismissResult() {
        $('rollResult').hidden = true;
    }

    // ---- Act two: thrust ----
    // From LATE_LEG the ball is a launcher: holding fires a jet behind it (training-path.js `thrust`), burning
    // the run's sprints as fuel and paying for them as they burn. Each unit of fuel that lights rolls the
    // sprint luck (breakthroughs, crunches, Max Effort, flow) the way a sprint did.
    const thrustLeg = roll => roll.leg >= T.LATE_LEG;
    const BURN_FX_SECONDS = 0.8;   // a lucky burn's glow
    function lightBurn(roll) {
        const index = pushIndex(roll);
        const seed = roll.ground.seed;
        const d = E.derive(state);
        const forced = path.fx.forceLuck;
        path.fx.forceLuck = null;
        const effort = !!path.fx.maxEffort;
        path.fx.maxEffort = false;
        // A wall's surge makes the run's first unit of fuel burn hotter (E.surgeSprint); only luck breaks through.
        const surge = E.surgeSprint(state, index);
        const breakthrough = forced === 'breakthrough' || forced === 'superBreakthrough' || E.breakthroughHit(state, seed, index);
        const superBreak = breakthrough && (forced === 'superBreakthrough' || E.superHit(state, 'breakthrough', seed, index));
        path.burnStrength = E.sprintStrength(state, 1, null, breakthrough, effort) * (surge ? E.SURGE_POWER : 1);
        if (breakthrough) {
            roll.breakthroughs = (roll.breakthroughs || 0) + 1;
            state.stats.breakthroughs = (state.stats.breakthroughs || 0) + 1;
            launchBreakthrough(roll, superBreak);
            path.burnGlow = BURN_FX_SECONDS;
        } else if (effort) {
            path.fx.boost = BOOST_SECONDS;
            burst(path.colors.warning, 24);
            trailSfx('breakthrough');
            path.burnGlow = BURN_FX_SECONDS;
        }
        if (!crunching() && (d.crunchSeconds || forced === 'crunch' || forced === 'superCrunch') && (forced === 'crunch' || forced === 'superCrunch' || E.crunchHit(state, seed, index))) {
            roll.crunches = (roll.crunches || 0) + 1;
            const seconds = Math.max(3, d.crunchSeconds);
            path.fx.crunch = path.fx.crunchMax = seconds;
            trailSfx('crunch');
            luckBanner('CRUNCH TIME!', `Free thrust for ${seconds} s`, 'danger');
        }
        if (!path.fx.maxEffort && roll.pushesLeft > 1 && (forced === 'maxEffort' || E.maxEffortHit(state, seed, index))) {
            path.fx.maxEffort = true;
            luckBanner('MAX EFFORT', `Your next burn goes ×${d.maxEffortMult.toFixed(2)}`, 'warning');
        }
        if (!roll.flowing && (forced === 'flow' || forced === 'superFlow' || E.flowHit(state, seed, index))) {
            startFlow(roll, forced === 'superFlow' || E.superHit(state, 'flow', seed, index));
        }
    }

    // A slipstream: a clean prompt's XP and run bonus for fuel burned in flight. A run of them adds up in
    // one pop that follows the ball.
    function slipstream(roll) {
        const xp = E.grantPushBonus(state, 'clean', ballLeg(), 1);
        roll.units = (roll.units || 0) + 1;
        roll.bonusXp = (roll.bonusXp || 0) + xp;
        roll.slips = (roll.slips || 0) + 1;
        if (!path.visible) return;
        const h = roll.airborne ? roll.height : roll.ground.height(roll.ball.x);
        const last = path.fx.pops.find(p => p.slips && p.age < 0.8);
        if (last) Object.assign(last, { wx: roll.ball.x, wh: h, age: 0, slips: last.slips + 1, xp: last.xp + xp, text: `slipstream ×${last.slips + 1} +${xpText(last.xp + xp)}` });
        else path.fx.pops.push({ wx: roll.ball.x, wh: h, age: 0, slips: 1, xp, text: `slipstream +${xpText(xp)}` });
    }

    // One frame of the jet: held by you (or the Auto-Trainer), paid as it burns. Running dry mid-hold turns
    // the hold into a tuck.
    function updateThrust(roll, sim) {
        const free = crunching();
        const want = (path.thrusting && path.held) || path.autoThrust;
        if (path.thrusting && path.held && roll.pushesLeft <= 0 && !free) {
            path.thrusting = false;
            path.holdTuck = true;
        }
        let power = 0;
        if (want && thrustLeg(roll) && !roll.over && !roll.crested && !roll.flowing && (roll.pushesLeft > 0 || free)) {
            const unit = Math.ceil(roll.pushesLeft - 1e-9);
            if (path.burnUnit !== unit || path.burnStrength == null) {
                path.burnUnit = unit;
                lightBurn(roll);
            }
            if (free || sim <= 0 || E.payBurn(state, sim / T.BURN_SECONDS, ballLeg())) {
                power = E.PATH.thrustEfficiency * path.burnStrength * path.burnStrength / T.BURN_SECONDS;
                // Playtest: act two logs fuel per run (burn time in sprints' worth, and how much of it was in the air).
                if (!roll.launched && roll.ptStart == null) roll.ptStart = state.stats.playTime;
                roll.ptFuel = (roll.ptFuel || 0) + sim / T.BURN_SECONDS;
                if (roll.airborne) roll.ptAirFuel = (roll.ptAirFuel || 0) + sim / T.BURN_SECONDS;
                setText($('pathStatus'), '');
                // The slipstream: fuel burned in flight pays like clean prompts (XP now, and the run bonus).
                if (roll.airborne) {
                    roll.slip = (roll.slip || 0) + sim / T.BURN_SECONDS;
                    while (roll.slip >= E.PATH.slipstream) {
                        roll.slip -= E.PATH.slipstream;
                        slipstream(roll);
                    }
                }
            } else if (!path.autoThrust) {
                setText($('pathStatus'), `Not enough to thrust: ${E.formatCost(E.burnCost(state, 1, ballLeg()))} per second`);
            }
        }
        roll.thrust = power;
        roll.thrustFree = free;
        if (path.visible && power > 0) window.SFX?.charge(0.35 + 0.15 * Math.sin(performance.now() / 90), true);
        else if (path.thrustSound) window.SFX?.chargeStop();
        path.thrustSound = path.visible && power > 0;
    }

    // A finished run waits for you: go to the dev screen to spend XP, or run again to bank more.
    function toDevScreen() {
        if (path.view === 'run' && path.done) showTrainingView('dev');
    }

    function runAgain() {
        if (!path.done) return;
        path.done = false;
        path.overview = 0;   // the next run opens on its own framing (a cut), not on the overview
        dismissResult();
        currentRoll();
        render();
        startPathLoop();
    }

    function startCharge() {
        // After a run, only Train again (on the result card) starts the next one: a stray press does nothing.
        if (path.view !== 'run' || path.done) return;
        const roll = currentRoll();
        if (path.charging || thrustLeg(roll)) return;
        if (!readyToFire(roll)) {
            if (!roll.over && roll.pushesLeft > 0 && chargeBudget() < E.PATH.minCharge) {
                setText($('pathStatus'), `Not enough to sprint: ${E.formatCost(E.pushCost(state, E.PATH.minCharge, ballLeg()))}`);
            }
            return;
        }
        // Max Effort: no charging needed, the sprint goes all out the moment you press.
        if (path.fx.maxEffort) {
            sprint(roll, 1, true);
            return;
        }
        path.charging = { start: performance.now(), cap: crunching() || frozen() ? 1 : chargeBudget(), sweep: CHARGE_SWEEP_MS, hold: 1000 * E.derive(state).chargeHold };
        path.chargeZone = null;
        startPathLoop();
    }

    // Letting go of the button, the trail or the key fires a charging sprint. A press held through the wait
    // starts charging the moment the sprint is ready (pathFrame): pressing a touch early is natural, and the
    // release is still judged, so nothing is queued.
    function letGo() {
        path.held = false;
        path.thrusting = false;
        if (!path.charging) endTuck();
        path.dive = null;
        path.holdTuck = false;
        releaseCharge();
    }

    // A press that can't fire yet (the wait, or no sprints left) never queues a sprint: holding through the
    // wait used to start a charge the moment it ended, and letting go a beat later fired a tiny sprint by
    // accident. On act two it's a tuck instead, until it's let go; a sprint takes a fresh press.
    function pressHold() {
        const roll = path.roll;
        // A tip about to show (before the run): the press waits for it rather than launching under it.
        if (roll && !roll.launched && path.view === 'run' && runTipPending()) return;
        if (path.hopAim) return;   // aiming a hop: one thing at a time
        path.held = true;
        // Act two: hold to thrust while there's fuel (or a crunch makes it free); empty, a hold is a tuck.
        if (roll && thrustLeg(roll) && path.view === 'run' && !path.done && !roll.over) {
            path.holdTuck = roll.launched && roll.pushesLeft <= 0 && !crunching();
            path.thrusting = !path.holdTuck;
            if (path.thrusting && !roll.launched) {
                path.overview = 0;
                dismissResult();
            }
            startPathLoop();
            return;
        }
        path.holdTuck = !!roll && path.view === 'run' && !path.done && roll.launched && roll.leg >= T.LATE_LEG && !path.fx.maxEffort && !readyToFire(roll);
        if (!path.holdTuck) startCharge();
    }

    // A clean dive: held all the way down a descent and let go at the bottom (before the climb has gone on
    // long) kicks the ball NICE_DIVE faster, with a pop. Too early, too late or not at all: nothing.
    const NICE_DIVE = 1.12;
    function endTuck() {
        const roll = path.roll;
        const d = path.dive;
        path.dive = null;
        if (!roll || roll.over || roll.airborne || !d || d.down < 0.35 || d.late > 0.3) return;
        if (roll.ground.slope(roll.ball.x) < -0.08 || roll.ball.v <= 0.5) return;
        roll.ball.v *= NICE_DIVE;
        path.fx.pops.push({ wx: roll.ball.x, wh: roll.ground.height(roll.ball.x), age: 0, life: 1.2, big: true, text: 'NICE DIVE' });
        path.fx.boost = Math.max(path.fx.boost, 0.25);
        roll.dives = (roll.dives || 0) + 1;
        trailSfx('clean');
    }

    function releaseCharge() {
        if (!path.charging) return;
        const level = chargeLevel();
        path.charging = null;
        window.SFX?.chargeStop();
        sprint(currentRoll(), level, false);
    }

    const PROMPT_NAMES = { clean: 'Clean prompt', perfect: 'Super prompt', system: 'System prompt' };

    // A manual sprint released at `level` of the meter: judged against the zone now, then fired (or banked,
    // in Bullet Time). Charging only starts when a sprint can fire, so there's nothing to queue.
    function sprint(roll, level, effort) {
        const kind = effort ? 'perfect' : path.fx.forceKind || E.zoneHit(currentZone(roll), level);
        path.fx.forceKind = null;
        if (frozen()) {
            bankSprint(roll, level, kind);
            return;
        }
        if (readyToFire(roll)) fireSprint(roll, level, kind, effort);
    }

    function fireSprint(roll, level, kind, effort) {
        const leg = ballLeg();
        const pushed = pushBall(false, effort ? 1 : Math.max(E.PATH.minCharge, level), kind, effort);
        if (pushed && !effort) {   // the Auto-Trainer sprints like you do (autoCharge)
            path.handCharges.push(level);
            if (path.handCharges.length > 20) path.handCharges.shift();
        }
        if (pushed && effort) {
            path.fx.maxEffort = false;
            burst(path.colors.warning, 30);
        }
        if (pushed && kind) promptBonus(roll, kind, leg, effort ? 1 : level);
    }

    // Clean, super and system prompts pay at once: steady XP whatever happens to the roll.
    function promptBonus(roll, kind, leg, charge) {
        const xp = E.grantPushBonus(state, kind, leg, charge);
        if (kind === 'perfect' || kind === 'system') state.stats.superPrompts = (state.stats.superPrompts || 0) + 1;
        roll.clean = (roll.clean || 0) + 1;
        roll.units = (roll.units || 0) + E.cleanUnits(kind, state);
        roll.bonusXp = (roll.bonusXp || 0) + xp;
        const pct = Math.round(E.derive(state).cleanRollBonus * E.cleanUnits(kind, state) * 100);
        path.cleanFlash = 1.2;
        path.cleanText = `${PROMPT_NAMES[kind]}! +${xpText(xp)} XP, +${pct}% run bonus`;
        trailSfx(kind === 'system' ? 'system' : kind === 'perfect' ? 'perfect' : 'clean');
        if (kind === 'system') {
            luckBanner('SYSTEM PROMPT!', `Worth ${E.PATH.systemMult} clean prompts`, 'accent');
            burst('#ffffff', 40);
        }
        render();
    }

    // Bullet Time starts: time stops, with a cold flash and dust hanging in the air.
    function freezeTime(seconds) {
        path.fx.freeze = path.fx.freezeMax = seconds;
        path.fx.bankPrompted = false;
        path.fx.flash = { age: 0, life: 0.3, color: '#9cc8ff', max: 0.5 };
        if (!reducedMotion()) path.fx.motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2, tw: Math.random() * 6 }));
        luckBanner('BULLET TIME', `Time stops for ${seconds} s. Tap to bank full sprints ×${BANK_MULT}`, 'primary');
    }

    // Bullet Time: the sprint's power goes into the bank (free, at full charge however short the tap, ×1.5),
    // to land all at once when time restarts. Mashing while time is stopped is the play.
    function bankSprint(roll, level, kind) {
        const strength = E.sprintStrength(state, 1, kind) * BANK_MULT;
        path.fx.bank += strength * strength;
        path.fx.banked++;
        burst(path.colors.primary, 10);
        // The zone doesn't move while time stands still, so its prompt pays once per freeze.
        if (kind && !path.fx.bankPrompted) {
            path.fx.bankPrompted = true;
            promptBonus(roll, kind, ballLeg(), 1);
        }
    }

    // Time restarts: everything banked lands in one go.
    function releaseBank(roll) {
        const fx = path.fx;
        fx.freeze = 0;
        fx.motes = [];
        if (fx.bank > 0 && roll.boost(Math.sqrt(fx.bank))) {
            fx.boost = BOOST_SECONDS;
            fx.shocks.push({ age: 0, color: '#ffffff' }, { age: -0.1, color: path.colors.primary }, { age: -0.2, color: path.colors.primary });
            fx.flash = { age: 0, life: 0.45, color: '#dff0ff', max: 0.75 };
            fx.shake = 0.5;
            burst(path.colors.primary, 50);
            if (!reducedMotion()) for (let i = 0; i < 40; i++) fx.streaks.push({ y: Math.random(), len: 0.1 + Math.random() * 0.3, speed: 1.5 + Math.random() * 2.5, x: Math.random(), age: 0, life: 0.5 + Math.random() * 0.5 });
            jolt();
            trailSfx('release');
            luckBanner(`×${fx.banked} RELEASED`, 'Every banked sprint at once', 'primary');
        }
        fx.bank = 0;
        fx.banked = 0;
    }

    // The weakest launch that crests the warm-up's hill (found by simulating copies of this run), plus
    // FIRST_SUMMIT_MARGIN: it reaches the top crawling.
    const FIRST_SUMMIT_MARGIN = 1.01;
    function firstSummitStrength(roll, d) {
        const crests = strength => {
            const t = T.createRoll(0, roll.ground.seed, { pushes: 1, cooldown: 1, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: 0 });
            t.push(strength);
            for (let i = 0; i < 1200 && !t.over; i++) if (t.step(0.05).some(e => e.type === 'crest')) return true;
            return false;
        };
        let lo = 0;
        let hi = 1;
        while (!crests(hi) && hi < 1e3) hi *= 2;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (crests(mid)) hi = mid; else lo = mid;
        }
        return hi * FIRST_SUMMIT_MARGIN;
    }

    function jolt() {
        if (!shakeOn()) return;
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
        const capBefore = free ? 1 : chargeBudget();   // the playtest log wants the meter's cap before paying
        if (!free) {
            fraction = Math.min(fraction, chargeBudget());
            if (fraction < E.PATH.minCharge || !E.payPush(state, fraction, leg)) {
                if (!auto) playtest?.count('sprintBroke');
                if (!auto) setText($('pathStatus'), `Not enough to sprint: ${E.formatCost(E.pushCost(state, E.PATH.minCharge, leg))}`);
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
        // Lucky Break's guarantee: one of the 5 hand sprints after buying it breaks through (E.breakGuaranteed, settled
        // every sprint). A wall's surge: the run's first sprint hits harder (E.surgeSprint), never a breakthrough.
        const surge = !free && E.surgeSprint(state, pushIndex(roll));
        const breakthrough = forced === 'breakthrough' || forced === 'superBreakthrough' || E.breakthroughHit(state, seed, index)
            || (!free && !auto && E.breakGuaranteed(state));
        if (!free && !auto) E.settleBreakCountdown(state, breakthrough);
        const superBreak = breakthrough && (forced === 'superBreakthrough' || E.superHit(state, 'breakthrough', seed, index));
        // The warm-up's sprint always crests Tokenization, only just, whatever the charge: the first summit is
        // guaranteed and a nail-biter (slow motion, "Will it learn…?") rather than a hop over a 3 cm bump.
        const strength = !roll.launched && state.path.learned === 0 && roll.ground.stretch === 0
            ? firstSummitStrength(roll, d)
            : E.sprintStrength(state, fraction, kind, breakthrough, effort) * (surge ? E.SURGE_POWER : 1);
        if (free) roll.freePushes = (roll.freePushes || 0) + 1;
        if (!roll.launched) roll.ptStart = state.stats.playTime;
        pt('sprint', { leg: leg + 1, ch: r2(fraction), cap: r2(capBefore), ...(kind ? { k: kind } : {}), ...(auto ? { auto: true } : {}),
            ...(effort ? { effort: true } : {}), ...(breakthrough ? { br: true } : {}), ...(free ? { free: true } : {}),
            first: !roll.launched || undefined, x: r2(roll.ball.x), v: r2(roll.ball.v), left: r2(roll.pushesLeft) });
        // The sprint lands now; on screen a breakthrough holds the run still for its wind-up first (you can
        // charge the next sprint meanwhile), off screen it just goes.
        roll.push(strength, free);
        trailSfx('sprint', { charge: fraction });
        if (breakthrough) {
            trailSfx('windup');
            if (path.visible) window.SFX?.swell();
            roll.breakthroughs = (roll.breakthroughs || 0) + 1;
            state.stats.breakthroughs = (state.stats.breakthroughs || 0) + 1;
            if (path.visible && !reducedMotion()) path.fx.windup = { age: 0, super: superBreak };
            else launchBreakthrough(roll, superBreak);
        }
        // Rarer luck rolls only on paid sprints: a crunch can't chain itself.
        if (!free && (d.crunchSeconds || forced === 'crunch' || forced === 'superCrunch') && (forced === 'crunch' || forced === 'superCrunch' || E.crunchHit(state, seed, index))) {
            roll.crunches = (roll.crunches || 0) + 1;
            const seconds = Math.max(3, d.crunchSeconds);
            if (forced === 'superCrunch' || E.superHit(state, 'crunch', seed, index)) {
                freezeTime(seconds);
                trailSfx('freeze');
            } else {
                path.fx.crunch = path.fx.crunchMax = seconds;
                trailSfx('crunch');
                luckBanner('CRUNCH TIME!', `Free sprints for ${seconds} s, no waiting`, 'danger');
            }
        }
        // Only with a sprint left to spend it on, so it never shows on a run that can't use it.
        if (!auto && !effort && !path.fx.maxEffort && roll.pushesLeft > 0 && (forced === 'maxEffort' || E.maxEffortHit(state, seed, index))) {
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
            const reach = Math.max(4, 0.3 * g.legLength(leg));
            const hills = roll.smash(reach);
            shatter(hills, roll.ball.x, reach);
            path.fx.breach = { age: 0, from: roll.ball.x, reach };
            path.fx.flash = { age: 0, life: 0.35, color: '#fff3c4', max: 0.55 };
            path.fx.shake = 0.7;
            path.fx.shocks.push({ age: -0.24 }, { age: -0.36 });
            trailSfx('smash');
            luckBanner('PARADIGM SHIFT!', `×${E.derive(state).critMult.toFixed(2)} and ${hills.length} hill${hills.length === 1 ? '' : 's'} shattered`, 'warning');
        } else {
            trailSfx('breakthrough');
            luckBanner('BREAKTHROUGH!', `×${E.derive(state).critMult.toFixed(2)} sprint strength`, 'warning');
        }
        render();
    }

    // A super breakthrough breaks the hills ahead apart: each one (already flat in the physics) is drawn as
    // slabs cut from its old outline, which hang in place with glowing seams for a moment (in a wave running
    // out from the ball), then blow apart, spinning and falling, with dust (world shape, screen-space motion).
    function shatter(hills, fromX, reach) {
        if (reducedMotion()) return;
        for (const b of hills) {
            const H = b.base ?? b.height;
            const W = b.baseW ?? b.halfWidth;
            const left = b.peak - W * (b.up || 1);
            const n = 5 + Math.floor(Math.random() * 3);
            const cuts = [left];
            for (let i = 1; i < n; i++) cuts.push(left + W * (1 + (b.up || 1)) * (i + (Math.random() - 0.5) * 0.6) / n);
            cuts.push(b.peak + W);
            const delay = 0.12 + 0.45 * Math.max(0, Math.min(1, (b.peak - fromX) / reach));
            const top = x => T.bumpAt(b, x, H, W);
            for (let i = 0; i < n; i++) {
                const a = cuts[i];
                const z = cuts[i + 1];
                // A slab: the hill's top between two cuts, down to a jagged floor; split again at a random height
                // when it's tall enough, so the top breaks off on its own.
                const split = H > 0.02 && Math.random() < 0.7 ? 0.35 + Math.random() * 0.3 : 0;
                const tops = [];
                for (let j = 0; j <= 4; j++) { const x = a + (z - a) * j / 4; tops.push([x, top(x)]); }
                const pieces = split
                    ? [[...tops.map(([x, y]) => [x, Math.max(y, split * top(x))]), [z, split * top(z)], [a + (z - a) * 0.5, split * top(a + (z - a) * 0.5) * (0.8 + Math.random() * 0.3)], [a, split * top(a)]],
                        [[a, split * top(a)], [a + (z - a) * 0.5, split * top(a + (z - a) * 0.5) * (0.8 + Math.random() * 0.3)], [z, split * top(z)], [z, 0], [a, 0]]]
                    : [[...tops, [z, 0], [a, 0]]];
                pieces.forEach((pts, pi) => {
                    const cx = pts.reduce((m, p) => m + p[0], 0) / pts.length;
                    const cy = pts.reduce((m, p) => m + p[1], 0) / pts.length;
                    const side = cx < b.peak ? -1 : 1;
                    path.fx.shards.push({ pts, cx, cy, x: 0, y: 0, rot: 0, age: -delay - Math.random() * 0.08,
                        vx: side * (40 + Math.random() * 120) + 90 + (pi === 0 ? 60 : 0), vy: -(pi === 0 ? 260 : 150) - Math.random() * 220,
                        spin: (Math.random() - 0.5) * (pi === 0 ? 9 : 5), life: 1.3 + Math.random() * 0.5 });
                });
            }
            for (let i = 0; i < 10; i++) {
                path.fx.debris.push({ wx: left + 2 * W * Math.random(), wy: H * Math.random(), x: 0, y: 0, vx: (Math.random() - 0.3) * 200,
                    vy: -(80 + Math.random() * 260), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14, age: -delay - Math.random() * 0.15,
                    life: 0.9 + Math.random() * 0.6, size: 2 + Math.random() * 4 });
            }
        }
    }

    // A flow: the ball lifts off the line and coasts (a super flow, Lucid Dream, also shrinks the hills).
    function startFlow(roll, superFlow) {
        const d = E.derive(state);
        const seconds = Math.max(3, d.flowSeconds);
        roll.coast(seconds, d.flowSpeed * d.pushPower, 0, 1, superFlow ? LUCID_WARP : 1);
        roll.flows = (roll.flows || 0) + 1;
        path.fx.flowMax = seconds;
        path.fx.superFlow = superFlow;
        trailSfx('flow');
        luckBanner(superFlow ? 'LUCID DREAM' : 'FLOW STATE', superFlow ? `Time slips away: ×${LUCID_WARP} the ground for ${seconds} s` : `Flying for ${seconds} s`, superFlow ? LUCID : 'secondary');
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
        for (const p of fx.pops) p.age += dt;
        fx.pops = fx.pops.filter(p => p.age < (p.life || 1.1));
        fx.boost = Math.max(0, fx.boost - dt);
        fx.shake = Math.max(0, fx.shake - dt);
        fx.tear = Math.max(0, (fx.tear || 0) - dt);
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
        for (const p of fx.shards) {
            p.age += dt;
            if (p.age < 0) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 520 * dt;
            p.rot += p.spin * dt;
        }
        fx.shards = fx.shards.filter(p => p.age < p.life);
        if (fx.breach && (fx.breach.age += dt) > 0.9) fx.breach = null;
        if (fx.flash && (fx.flash.age += dt) > fx.flash.life) fx.flash = null;
        for (const p of fx.streaks) p.age += dt;
        fx.streaks = fx.streaks.filter(p => p.age < p.life);
        // Lucid Dream: time rushing past, as violet streaks.
        if (flowing() && fx.superFlow && !reducedMotion() && Math.random() < dt * 30) {
            fx.streaks.push({ y: Math.random(), len: 0.05 + Math.random() * 0.25, speed: 2 + Math.random() * 3, x: 1 + Math.random() * 0.3, age: 0, life: 0.6 + Math.random() * 0.4, color: LUCID });
        }
        // Flow: a ribbon behind the flying ball (world x, screen y).
        for (const p of fx.flight) p.age += dt;
        fx.flight = fx.flight.filter(p => p.age < 0.7);
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
            || fx.freeze || fx.lift || fx.lights.length || fx.debris.length || fx.shards.length || fx.breach || fx.flash || fx.streaks.length
            || fx.flight.length || fx.pops.length || flowing());
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
            ctx.strokeStyle = hexAlpha(sh.color || c.warning, 0.9 * (1 - k));
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

    // Auto-Trainer: it replays legs you've cleared (never the frontier: that's yours), and it plays like you,
    // not like a machine: its sprints copy your recent charges, with an early model's mistakes (a wobble on the
    // charge and a slow reaction) that shrink as it's trained (its legacy levels) and as you learn skills
    // (owner's playtest: firing a perfect full charge every time made it far stronger than the player, and it
    // took the skills and achievements away from them). Every level sprints from rest and on a climb the ball
    // won't make (`wontClear`); in act two it thrusts from rest, when slow, up such climbs and on the way down
    // in flight. It runs as a ghost beside your runs (`ghostTrain`, below); levels 2 and 3 make it stronger and
    // steadier (fewer fumbles, less wobble, quicker reactions).
    const AUTO_ERROR = [0.24, 0.13, 0.06];     // the charge's wobble (standard deviation of the meter), by level
    const AUTO_REACTION = [0.7, 0.35, 0.15];   // longest reaction delay (s), by level
    function autoSkill() {
        const lvl = Math.max(1, Math.min(3, E.autoTrainerLevel(state)));
        // Trained further with every step past the third (`legPos`: old act-one skills): about half the mistakes by the fifteenth.
        const learn = Math.max(0.5, 1 - 0.04 * Math.max(0, E.legPos(state.path.learned) - 3));
        return { err: AUTO_ERROR[lvl - 1] * learn, react: AUTO_REACTION[lvl - 1] * learn };
    }
    const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    // What it would charge: your recent average, a wobble either way, within what the lab can pay.
    function autoCharge(budget, err) {
        const h = path.handCharges;
        const usual = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0.8;
        return Math.max(E.PATH.minCharge, Math.min(budget, usual + gauss() * err));
    }
    // The ghost: the Auto-Trainer's own run, beside yours rather than instead of it (owner's call: being taken
    // over mid-run was jarring). With it on it runs the newest cleared leg again and again, stepped by the game
    // loop (`ghostTrain`, every tick, wherever you are), and stops at the last cleared hill: the frontier is yours.
    // It pays as your replays do (the cleared hills' flat XP with the chain, tokens, the distance at the end), but
    // never raises a leg's best, and it buys nothing: its sprints are free, at the strength you had the last time
    // you ran that leg yourself (`E.legPower`, frozen until you run it again: owner's call). In the run view it plays faintly in
    // the corner (#ghostLane), on the upgrades screen in the live monitor (#devLive). It starts weak and clumsy:
    // half that strength and a third of its sprints fumbled at level 1 (`GHOST_POWER`, `GHOST_FUMBLE`),
    // getting better with its levels and with every skill past the third.
    const GHOST_POWER = [0.5, 0.7, 0.85];
    const GHOST_FUMBLE = [0.35, 0.2, 0.1];
    const GHOST_PAUSE = 1.5;          // seconds between its runs
    const ghost = { roll: null, pause: 0, t: 0, at: 0, legs: 0, xp: 0, broke: 0, thrusting: false };
    const ghostOn = () => E.autoTrainerLevel(state) > 0 && state.path.learned > 0;
    function ghostSkill() {
        const lvl = Math.max(1, Math.min(3, E.autoTrainerLevel(state)));
        const trained = Math.max(0, E.legPos(state.path.learned) - 3);
        const { err, react } = autoSkill();
        return { lvl, err, react, power: Math.min(1, GHOST_POWER[lvl - 1] * (1 + 0.03 * trained)),
            fumble: GHOST_FUMBLE[lvl - 1] * Math.max(0.5, 1 - 0.04 * trained) };
    }
    function ghostReady(want, react) {
        if (!want) { ghost.at = 0; return false; }
        if (!ghost.at) ghost.at = ghost.t + react * Math.random();
        return ghost.t >= ghost.at;
    }
    function newGhost() {
        const d = E.derive(state, debugRates);
        const first = state.path.learned - 1;
        ghost.roll = T.createRoll(first, (E.rollSeed(state) * 31 + 977 + ghost.legs) >>> 0,
            { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: state.path.learned });
        ghost.first = first;
        ghost.legs = 0;
        ghost.xp = 0;
        ghost.at = 0;
        ghost.broke = 0;
        ghost.sprints = 0;
        ghost.fumbles = 0;
    }
    function finishGhost(ev, done) {
        const leg = Math.min(ev.leg ?? ghost.first, state.path.learned - 1);
        // Stopping at the last cleared hill: its XP was paid as it crossed, so the run itself adds no distance.
        const r = E.finishRoll(state, done ? 0 : ev.progress || 0, false, 0, done ? 0 : ev.metres || 0, leg, false, ghost.legs);
        ghost.xp += r.xp;
        pt('run', { from: ghost.first + 1, leg: leg + 1, prog: r2(done ? 1 : ev.progress || 0), xp: r2(ghost.xp), legs: ghost.legs,
            sprints: ghost.sprints, fumbles: ghost.fumbles, auto: true });
        ghost.roll = null;
        ghost.pause = GHOST_PAUSE;
    }
    function ghostTrain(dt) {
        if (!ghostOn() || !(dt > 0)) { ghost.roll = null; return; }
        ghost.t += dt;
        if (ghost.pause > 0) { ghost.pause -= dt; return; }
        if (!ghost.roll || ghost.roll.frontier !== state.path.learned) { newGhost(); ghost.roll.frontier = state.path.learned; }
        const roll = ghost.roll;
        const sk = ghostSkill();
        const leg = Math.min(roll.leg, state.path.learned - 1);
        roll.thrust = 0;
        if (roll.leg >= T.LATE_LEG && !roll.over && roll.pushesLeft > 0) {
            // Act two: it thrusts from rest, when slow, up climbs it won't make and on the way down in flight.
            const want = !roll.launched || (!roll.airborne && roll.ball.v < AUTO_THRUST_SPEED) || wontClear(roll) || (roll.airborne && roll.vy < 0);
            ghost.thrusting = want && (ghost.thrusting || ghostReady(want, sk.react));
            if (ghost.thrusting) {
                const st = E.legPower(state, leg) * sk.power;
                roll.thrust = E.PATH.thrustEfficiency * st * st / T.BURN_SECONDS;
            }
        } else if (!roll.over && roll.ball.cooldown <= 0 && !roll.airborne && roll.pushesLeft > 0
            && ghostReady(!roll.launched || roll.atRest || wontClear(roll), sk.react)) {
            ghost.at = 0;
            // A fumble: a weak tap at the wrong moment, like an early model's worst guesses.
            const fumble = Math.random() < sk.fumble;
            const fraction = fumble ? 0.1 + 0.25 * Math.random() : autoCharge(1, sk.err);
            const share = E.sprintStrength(state, fraction, null, false, false) / E.sprintStrength(state, 1, null, false, false);
            roll.push(E.legPower(state, leg) * share * sk.power);
            ghost.sprints++;
            if (fumble) ghost.fumbles++;
        }
        for (const ev of roll.step(dt)) {
            if (ev.type === 'clear') {
                ghost.xp += E.clearLeg(state, ev.skill, ghost.legs);
                ghost.legs++;
                if (ev.skill >= state.path.learned - 1) { finishGhost(roll.end(), true); return; }
            } else if (ev.type === 'token') ghost.xp += E.collectToken(state, ev.leg, ghost.legs);
            else if (ev.type === 'end') { finishGhost(ev, false); return; }
        }
    }

    const AUTO_THRUST_SPEED = 1.5; // m/s: below this on the ground the Auto-Trainer thrusts

    // Climbing (forward, uphill) without the energy to make the next crest: it will stall and roll back.
    function wontClear(roll) {
        const b = roll.ball;
        const g = roll.ground;
        if (b.v <= 0 || g.slope(b.x) < 0.02) return false;
        const next = g.bumps.find(h => h.peak > b.x);
        if (!next) return false;
        return 0.5 * b.v * b.v < T.GRAVITY * (next.height - g.height(b.x)) * 1.05;
    }

    // A run keeps rolling when you step away (to the upgrades screen, the rack, the lab or the facility)
    // as long as the page is open: one in flight finishes, and the Auto-Trainer keeps starting new ones.
    // Nothing runs offline.
    function runsInBackground() {
        const roll = path.roll;
        return !!roll && path.stateRef === state && roll.launched && !roll.over;
    }

    function startPathLoop() {
        if (path.frame || !path.canvas || (path.view !== 'run' && !runsInBackground())) return;
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
            // The tuck: a hold that isn't charging a sprint (during the wait, or with none left) makes the ball
            // heavier on act two's swells; in the air it dives for the first down-slope it can reach (an air
            // dive). (The Auto-Trainer never tucks.)
            roll.tuck = !!path.held && !path.charging && path.view === 'run' && roll.leg >= T.LATE_LEG && path.holdTuck;
            // Keep score of the dive: time held going down, and time held into the climb after it.
            if (roll.tuck && !roll.airborne) {
                const sl = roll.ground.slope(roll.ball.x);
                const d = path.dive || (path.dive = { down: 0, late: 0 });
                if (sl < -0.05) { d.down += dt; d.late = 0; } else if (sl > 0.1) d.late += dt;
            } else if (!path.held) path.dive = null;
            // Teach it in place, once: the first time the ball heads down a swell with no sprint to fire, a
            // pulsing HOLD over it (and the tip in the log).
            if (!state.intro['hint:tuck'] && path.visible && roll.leg >= T.LATE_LEG && !roll.airborne && !path.held && roll.launched && !roll.over
                && roll.ground.slope(roll.ball.x) < -0.1 && roll.ball.v > 1 && roll.pushesLeft <= 0) {
                state.intro['hint:tuck'] = true;
                path.holdHint = 3;
                log('Tip: out of fuel? Hold while the ball rolls down a slope to tuck, and let go at the bottom for a NICE DIVE: extra speed.', 'info');
            }
            if (path.holdHint > 0) path.holdHint -= dt;
            // Slow motion only matters on screen; in the background the run keeps real time. A wind-up and
            // Bullet Time hold the run still.
            const fx = path.fx;
            // (A lost run used to play out at 3× on screen: falling back at triple speed looked weightless.)
            const sim = fx.windup || frozen() ? 0 : path.visible ? dt * path.timeScale : dt;
            // The wait between sprints keeps counting while a wind-up holds the run still.
            if (fx.windup) roll.ball.cooldown = Math.max(0, roll.ball.cooldown - dt);
            if (fx.windup && (fx.windup.age += dt) >= WINDUP_SECONDS) launchBreakthrough(roll, fx.windup.super);
            if (fx.crunch > 0) fx.crunch = Math.max(0, fx.crunch - sim);
            if (frozen() && (fx.freeze = Math.max(0, fx.freeze - dt)) === 0) releaseBank(roll);
            // Act two's reveal: the first time a run is on its trail (once per save), since its control changes.
            if (path.visible && thrustLeg(roll) && !state.intro['act:two']) {
                state.intro['act:two'] = true;
                luckBanner('ACT II', 'The model generalised. Hold to thrust.', 'success');
                log('Act II. Past General AI the trail turns into giant swells, and your sprints become fuel: hold to thrust and keep the ball moving and flying.', 'special');
                modelSay('I can fly now. Nobody told me I couldn\'t.');
            }
            updateThrust(roll, sim);
            if (path.burnGlow > 0) path.burnGlow -= dt;
            const events = roll.step(sim);
            roll.topSpeed = Math.max(roll.topSpeed || 0, Math.abs(roll.ball.v));
            for (const ev of events) {
                if (ev.type === 'clear') clearLeg(ev);
                else if (ev.type === 'token') takeToken(ev);
                else if (ev.type === 'launch' || ev.type === 'land') airborne(ev);
                else if (ev.type === 'crest' && ev.onward) crestFrontier(ev);
                else if (ev.type === 'crest' && !roll.over) celebrateSummit();
                else if (ev.type === 'bump') trailSfx('land', { impact: 1 });
                else finishRoll(ev);
            }
            // Stuck with pushes left but nothing to pay for them: give income a moment, then end the roll.
            const broke = roll.launched && !roll.over && roll.atRest && roll.pushesLeft > 0
                && (thrustLeg(roll) ? !E.canAfford(state, E.burnCost(state, 0.1, ballLeg())) : chargeBudget() < E.PATH.minCharge);
            path.brokeFor = broke ? (path.brokeFor || 0) + dt : 0;
            if (path.brokeFor > STUCK_GRACE) {
                path.brokeFor = 0;
                finishRoll(roll.end());
            }
        }
        // The overview after a skill holds while the result card waits (it used to zoom back in to the stopped ball
        // after 3 s, a move with nothing behind it); Train again cuts to the next run.
        if (path.overview > 0 && !path.done) path.overview -= dt;
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
        const animating = busy || path.legFlash || fxBusy() || path.summit || path.particles.length || path.tension > 0.01 || path.brokeFor > 0 || path.charging || path.cleanFlash > 0 || path.pause > 0 || (path.overview > 0 && !path.done) || path.glow || path.pushFlash || cameraMoving()
            || ghostOn();
        if (running && animating) path.frame = requestAnimationFrame(pathFrame);
    }

    // The jet: a flame out of the back of the ball along its heading, and exhaust puffs left in the world
    // behind it (they stay where they were blown, so the gas trails the flight), hotter for a lucky burn.
    const PUFF_SECONDS = 0.7;
    function drawThrust(ctx, roll, bx, by, X, Y, pxPerUnit, yScale, dt) {
        const c = path.colors;
        const puffs = path.puffs || (path.puffs = []);
        const on = roll.thrusting;
        const hot = path.burnGlow > 0 || !!path.fx.maxEffort;
        if (on && dt > 0 && !reducedMotion()) {
            const h = roll.airborne ? roll.height : roll.ground.height(roll.ball.x);
            for (let i = 0; i < 2; i++) {
                puffs.push({ wx: roll.ball.x - 0.05 * Math.random(), wy: h + (Math.random() - 0.5) * 0.08, age: 0,
                    r: 3 + Math.random() * 3, hot });
            }
        }
        for (const p of puffs) p.age += dt;
        path.puffs = puffs.filter(p => p.age < PUFF_SECONDS);
        for (const p of path.puffs) {
            const k = p.age / PUFF_SECONDS;
            ctx.fillStyle = hexAlpha(k < 0.3 ? (p.hot ? '#fff3c4' : c.warning) : k < 0.6 ? c.accent : c.muted, 0.5 * (1 - k));
            ctx.beginPath();
            ctx.arc(X(p.wx), Y(p.wy), p.r * (1 + 2.5 * k), 0, Math.PI * 2);
            ctx.fill();
        }
        if (!on) return;
        // Heading on screen (up is negative y): along the flight, or along the ground.
        const vy = roll.airborne ? roll.vy : roll.ground.slope(roll.ball.x) * roll.ball.v;
        let ux = roll.ball.v * pxPerUnit;
        let uy = -vy * yScale;
        const n = Math.hypot(ux, uy) || 1;
        ux /= n;
        uy /= n;
        if (n < 1) { ux = 1; uy = 0; }
        const flick = reducedMotion() ? 1 : 0.8 + 0.4 * Math.random();
        const len = (BALL * 3.2 + (hot ? 14 : 0)) * flick;
        const tipX = bx - ux * (BALL + len);
        const tipY = by - uy * (BALL + len);
        const grad = ctx.createLinearGradient(bx, by, tipX, tipY);
        grad.addColorStop(0, hexAlpha(hot ? '#fff3c4' : '#ffe9a8', 0.95));
        grad.addColorStop(0.4, hexAlpha(c.warning, 0.8));
        grad.addColorStop(1, hexAlpha(c.accent, 0));
        // A cone from the back of the ball to the tip.
        const px = -uy * BALL * 0.85;
        const py = ux * BALL * 0.85;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx - ux * BALL * 0.3 + px, by - uy * BALL * 0.3 + py);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(bx - ux * BALL * 0.3 - px, by - uy * BALL * 0.3 - py);
        ctx.closePath();
        ctx.fill();
        if (hot) {
            ctx.strokeStyle = hexAlpha('#fff3c4', 0.6);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // ---- Drama: nail-biters and summits ----

    const SUMMIT_SECONDS = 2.6;     // the summit banner
    const CONFETTI_SECONDS = 2.8;   // and its confetti
    const LEG_FLASH_SECONDS = 2.2;  // "<skill> cleared" on a replay
    const SUMMIT_SLOWMO = 1.1;      // slow motion right after cresting

    // A nail-biter: the ball is climbing near the top of a big hill (the skill hill, or a large rolling
    // one) with about as much energy as it needs to get over. Returns that hill, or null.
    function nailBiter(roll) {
        if (!roll || !roll.launched || roll.over || roll.crested || roll.ball.v <= 0) return null;
        const g = roll.ground;
        const x = roll.ball.x;
        const hill = g.bumps.find(b => x >= b.start && x < b.peak);
        // Only where a skill is at stake: the frontier's skill hill (the owner's call: the camera moves for what
        // matters). Big rolling hills and cleared hills on a replay used to push in too, so a run could zoom
        // two or three times before the hill that counted.
        if (!hill || hill.skill === null || hill.skill < state.path.learned) return null;
        // Once it starts, it lasts until the ball crests or turns back on this hill.
        if (path.focus === hill && path.tension > 0) return hill;
        // Rare on purpose: not again for a while after the last one.
        if (performance.now() < (path.dramaQuiet || 0)) return null;
        // Within 5% of the top, with almost exactly the energy it needs: a real coin flip. (Opening act two's at
        // 88% put its fast runs in slow motion on every skill wall, which broke their momentum.)
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
        const focus = path.visible ? (celebrating ? path.summit.hill || path.roll.ground.goal : nailBiter(path.roll)) : null;
        if (focus) {
            path.focus = focus;
            path.dramaQuiet = performance.now() + 8000;
        }
        path.tension += ((focus ? 1 : 0) - path.tension) * Math.min(1, dt * (focus ? 9 : 1.5));
        if (path.tension < 0.01 && !focus) {
            path.tension = 0;
            path.focus = null;
            path.focusClose = null;
        }
        const aim = aiming();
        const target = Math.min(celebrating ? 0.35 : focus ? 0.3 : 1, aim ? HOP_AIM_SCALE : 1);
        // Aiming eases the camera in on the hills ahead (cameraTarget) and back out after.
        path.aimT = Math.max(0, Math.min(1, (path.aimT || 0) + (aim ? 1 : -1) * dt * (aim ? 6 : 3)));
        if (path.roll) trackHopWindow(path.roll);
        path.timeScale += (target - path.timeScale) * Math.min(1, dt * (target < path.timeScale ? 10 : 3));
        if (path.summit && (path.summit.age += dt) > SUMMIT_SECONDS) path.summit = null;
        for (const p of path.particles) {
            p.age += dt;
            p.y += p.vy * dt;
            p.x += Math.sin(p.age * p.sway + p.phase) * 40 * dt;
            p.rot += p.spin * dt;
        }
        path.particles = path.particles.filter(p => p.y < path.height + 10 && p.age < CONFETTI_SECONDS);
    }

    // Over the top of the skill hill: banner and confetti, then the ball rolls down the far side and
    // the skill is announced when the roll ends (finishRoll).
    function celebrateSummit(name = E.skillAt(state.path.learned).name, hill = null) {
        path.summit = { age: 0, name, hill };
        trailSfx('summit');
        // Confetti rains down across the whole trail (screen pixels, from just above the top) and is gone in
        // CONFETTI_SECONDS: it used to drift for up to 16 s over a run that goes on, and its orange looked like
        // the XP tokens.
        const colors = [path.colors.success, path.colors.accent, path.colors.primary, path.colors.research];
        const count = Math.round(Math.min(220, Math.max(80, path.width / 6)));
        for (let i = 0; i < count; i++) {
            path.particles.push({
                x: Math.random() * path.width, y: -10 - Math.random() * path.height * 0.25,
                vy: 160 + Math.random() * 120, sway: 2 + Math.random() * 3, phase: Math.random() * 6.3,
                rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 10,
                color: colors[i % colors.length], age: 0
            });
        }
    }

    // Over the frontier's skill hill and rolling on: the skill is learned now (a summit celebration, the leg's
    // cresting XP times the chain so far), the next leg is laid ahead, and the hill joins the chain.
    function crestFrontier(ev) {
        const roll = path.roll;
        const hill = T.skillHill(ev.skill);
        // The demo's last hill, already learned: it pays as a cleared hill, and the gate waits past it.
        if (ev.skill < state.path.learned) {
            clearLeg(ev);
            demoGateReached();
            return;
        }
        const { xp, skill } = E.crestSkill(state, ev.metres, roll.units || 0, roll.legs || 0);
        if (E.actTwoLocked(state)) demoGateReached();
        else roll.extend();
        if (!skill) return;
        roll.legs = (roll.legs || 0) + 1;
        roll.legXp = (roll.legXp || 0) + xp;
        markLegEntry(roll, ev.skill + 1);
        (roll.learned = roll.learned || []).push({ skill, xp });
        pt('skill', { n: state.path.learned, name: skill.name, xp: r2(xp), runs: state.stats.rolls + 1 });
        celebrateSummit(skill.name, hill);
        // What it earned, where it happened (it used to wait for the result card), and a beat of stillness.
        path.fx.pops.push({ wx: hill.peak, wh: hill.height, age: 0, life: 2.6, big: true, text: `+${xpText(xp)} XP · ${skill.effect}` });
        path.fx.shake = Math.max(path.fx.shake, 0.18);   // a camera punch with the beat
        path.glow = { skill: state.path.learned - 1, age: 0 };
        const grants = Object.entries(skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
        log(`Learned ${skill.name}: ${skill.effect} (${grants ? grants + ', ' : ''}+${xpText(xp)} XP). ${skill.flavor}`, 'special');
        modelSays(skill);
        if (!(currentPlace() === 'bay:training' && path.view === 'run')) toast(`Skill learned · ${skill.name}`, skill.effect, 'skill');
        afterChange();
    }

    // The demo's gate: act two (Terminal Velocity) is locked for the first playtest. It stands just past
    // In-Context Learning's hill; a run that reaches it ends there (`endAt`), and the first time says why.
    const demoGateX = () => T.checkpoint(E.ACT_TWO_LEG) + 0.6;
    function demoGateReached() {
        if (state.intro['demo:gate']) return;
        state.intro['demo:gate'] = true;
        log('Act II · Terminal Velocity is not available in the demo. Thanks for playing this far: replays, versions and the lab carry on.', 'special');
        pt('demoGate', {});
    }

    // A leg's character as a short tag ("Marathon"), for the goal line and Start at; none for the warm-up and act two.
    const characterTag = (k, sep) => { const c = T.LEG_CHARACTERS[T.legCharacter(k)]; return c ? sep + c.name : ''; };

    // Tips a skill's card can bring, once each. Passive XP waits for the first real skill (Pattern Matching): the
    // warm-up is a formality, and explaining replays then was too early (owner's playtest). The lab tip points at
    // the card's Lab button the first time a skill makes room there.
    function skillTips() {
        if (!state.intro['hint:labAfterSkill'] && state.path.learned > E.FIRST_REAL_SKILL && labNewsCount()) {
            state.intro['hint:labAfterSkill'] = true;
            callout('hint:labAfterSkill', 'Check the lab', 'Every skill makes room in the lab: more hardware fits and new upgrades open. Head back after each one.');
            return;
        }
        if (!state.intro['hint:replay'] && E.knows(state, 'Edge Detection')) {
            state.intro['hint:replay'] = true;
            callout('hint:replay', 'Passive XP', 'Each cleared leg (a stretch of trail you\'ve crested) now replays your best run on its own, earning XP while you play.');
        }
    }

    // A wall broken: the next runs open with a surge (E.surgeSprint), said on its card.
    const surgeLine = wall => (wall ? [[`Your next ${E.WALL_SURGE_RUNS} runs open with a surge: first sprint ×${E.SURGE_POWER}`, '', 'good key']] : []);

    // The model's own voice: each skill it learns, it says something (first-person, a little less innocent
    // each time), on the Skill learned card, in the Journal and on the lab's terminal.
    function modelSays(skill) {
        if (skill?.voice) modelSay(skill.voice);
    }
    function modelSay(text) {
        log(`model: "${text}"`, 'model');
        termLog(`model: ${text}`);
    }
    // It notices more than skills: a near miss, its first flight, every version you ship.
    const MODEL_NEAR = ['So close. I felt the top.', 'Again. I almost had it.', 'Push harder next time. Please.', 'I can see over it from here.'];
    const MODEL_SHIP = ['I remember being the last version. Do you remember me?', 'Another version. I kept the good parts.', 'You keep making me again. I keep noticing.', 'Each time you ship me, I come back a little earlier.'];

    // Late legs: the ball flies off a crest (a burst of light), and lands with dust and a bump that grows
    // with the impact; a long flight says how far it went.
    function airborne(ev) {
        const roll = path.roll;
        if (roll && ev.type === 'land') {
            roll.bestFlight = Math.max(roll.bestFlight || 0, ev.flight || 0);
            roll.bestHeight = Math.max(roll.bestHeight || 0, ev.height || 0);
            if ((ev.flight || 0) >= E.LONG_FLIGHT) state.stats.flights++;
        }
        if (!path.visible) return;
        if (ev.type === 'launch') {
            burst(path.colors.success, 14);
            sfx('launch');
            return;
        }
        burst(path.colors.muted, Math.min(26, 6 + Math.round(ev.impact)));
        sfx('land', { impact: ev.impact });
        // Tucked onto a down-slope from the air: an air dive (the physics adds the speed).
        if (ev.dive && roll) {
            path.fx.pops.push({ wx: ev.x, wh: roll.ground.height(ev.x), age: 0, life: 1.2, big: true, text: 'AIR DIVE' });
            path.fx.boost = Math.max(path.fx.boost, 0.25);
            roll.dives = (roll.dives || 0) + 1;
            trailSfx('clean');
        }
        if (ev.impact > 12) path.fx.shake = Math.max(path.fx.shake, Math.min(0.35, ev.impact / 60));
        if (ev.flight > 12) path.legFlash = { age: 0, text: `${Math.round(ev.flight)} m flight${ev.height > 1 ? ` · ${ev.height.toFixed(1)} m up` : ''}`, tone: 'success' };
    }

    // Crossing a skill hill enters the next leg: note what the run had banked by then, so at its end each leg it ran
    // through is credited with what it earned from there on (passive XP, `E.recordLegs`).
    function markLegEntry(roll, leg) {
        const banked = (roll.bonusXp || 0) + (roll.legXp || 0) + (roll.tokenXp || 0);
        (roll.legEntries = roll.legEntries || []).push({ leg, banked });
    }

    // A replay crossed a cleared leg's skill hill: flat XP at once, and the ball rolls on.
    function clearLeg(ev) {
        const roll = path.roll;
        // The chain: each cleared hill crossed raises the multiplier on everything after it.
        const xp = E.clearLeg(state, ev.skill, roll.legs || 0);
        roll.legs = (roll.legs || 0) + 1;
        roll.legXp = (roll.legXp || 0) + xp;
        markLegEntry(roll, ev.skill + 1);
        path.legFlash ={ age: 0, text: `${E.skillAt(ev.skill).name} cleared · +${xpText(xp)} XP · chain ×${E.chainMult(roll.legs)}`, tone: 'success' };
        render();
    }

    // An XP token taken in flight: paid at once (with the chain so far), a pop where it hung.
    function takeToken(ev) {
        const roll = path.roll;
        const xp = E.collectToken(state, ev.leg, roll.legs || 0);
        roll.tokenXp = (roll.tokenXp || 0) + xp;
        roll.tokens = (roll.tokens || 0) + 1;
        // A run of tokens adds up in one pop that follows the latest (stacked +7.07s couldn't be read).
        const last = path.fx.pops.find(p => p.tokens && p.age < 0.6);
        if (last) Object.assign(last, { wx: ev.x, wh: ev.y, age: 0, tokens: last.tokens + 1, xp: last.xp + xp, text: `×${last.tokens + 1} +${xpText(last.xp + xp)}` });
        else path.fx.pops.push({ wx: ev.x, wh: ev.y, age: 0, tokens: 1, xp, text: `+${xpText(xp)}` });
        trailSfx('clean');
    }

    function finishRoll(ev) {
        const crested = ev.type === 'crest' || !!ev.crested;
        const roll = path.roll;
        // Crunches, Bullet Time and Max Effort end with the run.
        path.fx.crunch = 0;
        path.fx.freeze = 0;
        path.fx.bank = 0;
        path.fx.banked = 0;
        path.fx.maxEffort = false;
        const leg = ev.leg ?? state.path.learned;
        const replay = roll.ground.stretch < roll.frontier;
        const target = E.skillAt(leg).name;
        const clean = roll.clean || 0;
        const units = roll.units || 0;
        const banked = (roll.bonusXp || 0) + (roll.legXp || 0) + (roll.tokenXp || 0);
        const legs = roll.legs || 0;
        const metres = ev.metres || 0;
        // Luck: a run can go viral, multiplying its distance XP.
        const viral = metres > 0 && (path.fx.forceViral || E.windfallHit(state, roll.ground.seed));
        path.fx.forceViral = false;
        const plainXp = E.rollXp(state, ev.progress, crested, 0, metres, leg);
        const result = E.finishRoll(state, ev.progress, crested, units, metres, leg, viral, legs);
        // An audited run (three flagged exploits) pays only part of its XP, and sets no best for passive XP.
        if (roll.audited) {
            const cut = result.xp * (1 - E.AUDIT_PAY);
            state.res.xp -= cut;
            result.xp -= cut;
        }
        // Cleared legs replicate their best run for passive XP: a better replay raises it.
        // Every cleared leg the run ran through is credited with what it earned from there on (`E.recordLegs`).
        const passiveBefore = E.derive(state).xpPerSec;
        if (roll.launched) E.settleSurge(state);
        // Only your own runs set a leg's best (its passive XP): the Auto-Trainer's replays earn, but don't raise it,
        // so going back to optimise a leg by hand stays the way to speed it up (owner's playtest).
        // The strength you ran these legs with is what the Auto-Trainer's ghost replays them at.
        E.recordLegPower(state, roll.ground.stretch, leg);
        const improvedLegs = E.recordLegs(state, roll.ground.stretch, roll.legEntries, result.xp + banked, viral ? E.derive(state).windfallMult : 1, result.xp);
        pt('run', { from: roll.ground.stretch + 1, leg: leg + 1, prog: r2(ev.progress), m: r2(metres), xp: r2(result.xp + banked), legs,
            sprints: r2((path.rollPushes || 0) - Math.max(0, roll.pushesLeft)), clean, top: r2(roll.topSpeed || 0),
            dur: Math.round(state.stats.playTime - (roll.ptStart ?? state.stats.playTime)),
            ...(roll.ptFuel ? { fuel: r2(roll.ptFuel), airFuel: r2(roll.ptAirFuel || 0) } : {}),
            ...(roll.bestFlight ? { flight: r2(roll.bestFlight) } : {}),
            ...(roll.tokens ? { tokens: roll.tokens } : {}), ...(roll.dives ? { dives: roll.dives } : {}),
            ...(roll.breakthroughs ? { br: roll.breakthroughs } : {}),
            ...(ev.rolledBack ? { back: true } : {}), ...(result.record ? { record: true } : {}), ...(viral ? { viral: true } : {}),
            });
        // The next run waits for a click (the Auto-Trainer runs its own ghost, `ghostTrain`).
        path.pause = 0;
        path.done = true;
        const pct = Math.round(ev.progress * 100);
        const viralMult = viral ? E.derive(state).windfallMult : 1;
        const runMult = viralMult * E.chainMult(legs);
        const lines = xpLines(plainXp * runMult, result.xp - plainXp * runMult, clean, roll.bonusXp || 0, crested, roll.slips || 0);
        if (roll.tokens) lines.push([`${roll.tokens} XP token${roll.tokens === 1 ? '' : 's'}`, `+${xpText(roll.tokenXp)} XP`, 'good']);
        if (roll.audited) lines.unshift(['Audited: three flagged exploits · paid half', '', 'bad key']);
        else if (roll.exploitClean) lines.push([`Clean exploit${roll.exploitClean === 1 ? '' : 's'} ×${roll.exploitClean}`, '', 'good']);
        if (legs) lines.unshift([`Chain ×${E.chainMult(legs)} on the distance`, '', 'good']);
        if (viral) {
            lines.unshift([`Went viral! ×${viralMult.toFixed(2)} run XP`, '', 'good']);
            goViral(viralMult);
        }
        if (roll.breakthroughs) lines.push([`${roll.breakthroughs} breakthrough${roll.breakthroughs === 1 ? '' : 's'}`, '', 'good']);
        lines.push(...runStats(roll));
        if (roll.flows) lines.push([`${roll.flows} flow${roll.flows === 1 ? '' : 's'}`, '', 'good']);
        const learned = roll.learned || [];
        const crossedLegs = legs - learned.length;
        const clearedXp = (roll.legXp || 0) - learned.reduce((a, l) => a + l.xp, 0);
        if (crossedLegs) lines.unshift([`${crossedLegs} cleared leg${crossedLegs === 1 ? '' : 's'} crossed`, `+${xpText(clearedXp)} XP`, 'good']);
        for (const l of learned.slice().reverse()) lines.unshift([`Crested ${l.skill.name} (×2)`, `+${xpText(l.xp)} XP`, 'good']);
        // Passive XP rose: say which legs and the new total, so the replicated best runs read as something you raise.
        if (improvedLegs.length) {
            const names = improvedLegs.map(k => E.skillAt(k).name);
            const shown = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
            lines.push([`Passive XP up (${shown}): +${xpText(passiveBefore)} → +${xpText(E.derive(state).xpPerSec)}/s`, '', 'good passive-line']);
        }
        if (learned.length && !result.skill) {
            // Skills learned on the way (announced as they happened); the run went on until it stopped.
            const last = learned[learned.length - 1].skill;
            const grants = learned.map(l => Object.entries(l.skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ')).filter(Boolean).join(' · ');
            const names = learned.map(l => l.skill.name).join(', ');
            // Stopping just past the crest reads "0% of the way": say nothing about the next leg then.
            const onward = pct > 0 ? `, then stopped ${pct}% of the way to ${target}` : '';
            log(`${replay ? 'Replay' : 'Run'} ${state.stats.rolls}: learned ${names}${onward} (+${xpText(result.xp + banked)} XP).`, 'special');
            path.overview = OVERVIEW_SECONDS + path.pause;
            showResult({ skill: true, title: learned.length > 1 ? `${learned.length} skills learned` : last.wall ? 'Wall broken · skill learned' : 'Skill learned', main: names,
                flavor: last.flavor, voice: last.voice, xp: result.xp + banked,
                lines: [...learned.flatMap(l => [[l.skill.effect, ''], ...snareSkillLine(l.skill)]), ...(grants ? [[grants, '']] : []), ...labRoomLines(roll.capBefore), ...surgeLine(learned.some(l => l.skill.wall)), ...lines, ...(pct > 0 ? [[`Then ${pct}% of the way to ${target}`, '']] : [])], record: result.record });
            skillTips();
        } else if (result.skill) {
            const grants = Object.entries(result.skill.grants).map(([k, v]) => `+${v} ${E.ATTRIBUTES[k].short}`).join(', ');
            log(`Learned ${result.skill.name}: ${result.skill.effect} (${grants ? grants + ', ' : ''}+${xpText(result.xp + banked)} XP). ${result.skill.flavor}`, 'special');
            modelSays(result.skill);
            // The result card announces it on screen; the toast is for when you're elsewhere.
            if (!(currentPlace() === 'bay:training' && path.view === 'run')) toast(`Skill learned · ${result.skill.name}`, result.skill.effect, 'skill');
            path.glow = { skill: state.path.learned - 1, age: 0 };
            path.overview = OVERVIEW_SECONDS + path.pause;
            showResult({ skill: true, title: result.skill.wall ? 'Wall broken · skill learned' : 'Skill learned', main: result.skill.name, flavor: result.skill.flavor, voice: result.skill.voice, xp: result.xp + banked,
                lines: [[result.skill.effect, ''], ...snareSkillLine(result.skill), ...(grants ? [[grants, '']] : []), ...labRoomLines(roll.capBefore), ...surgeLine(result.skill.wall), ...lines] });
            skillTips();
        } else {
            // So close: stopped on the frontier's climb near the top. A consolation share and how much more speed
            // it needed (status, not a recipe).
            const goal = roll.ground.goal;
            const top = roll.ball.maxX;
            if (!replay && !legs && !ev.rolledBack && leg === state.path.learned && top > goal.start && top < goal.peak) {
                const frac = roll.ground.height(top) / goal.height;
                const near = E.nearMiss(state, frac, result.xp + banked);
                // How high up the skill hill a frontier run got, and how much more speed it needed (the "90% wall").
                pt('climb', { leg: leg + 1, h: r2(frac), short: r2(E.speedShort(frac)), ...(near > 0 ? { near: r2(near) } : {}) });
                if (near > 0 && path.visible) modelSay(MODEL_NEAR[state.stats.rolls % MODEL_NEAR.length]);
                if (near > 0) {
                    result.xp += near;
                    lines.unshift([`So close: about ${Math.max(1, Math.round(E.speedShort(frac) * 100))}% more speed would have crested it`, `+${xpText(near)} XP`, 'good']);
                }
            }
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

    // The run's own numbers for the result card (top speed; in act two its best flight), with any new
    // all-time best called out and saved (stats.topSpeed / bestFlight / bestHeight).
    function runStats(roll) {
        const st = state.stats;
        const out = [];
        const best = (key, value) => {
            // Compared as shown (one decimal): 2.2 after a 2.2 isn't a new best.
            const shown = v => Math.round(v * 10);
            const beat = shown(value) > shown(st[key] || 0) && (st[key] || 0) > 0;
            st[key] = Math.max(st[key] || 0, value);
            return beat;
        };
        const speed = roll.topSpeed || 0;
        if (speed > 0) out.push([`Top speed ${speed.toFixed(1)} m/s${best('topSpeed', speed) ? ' · new best!' : ''}`, '', st.topSpeed === speed ? 'good key' : '']);
        const flight = roll.bestFlight || 0;
        if (flight > 3) {
            const height = roll.bestHeight || 0;
            const newFlight = best('bestFlight', flight);
            const newHeight = best('bestHeight', height);
            out.push([`Longest flight ${Math.round(flight)} m · ${height.toFixed(1)} m up${newFlight || newHeight ? ' · new best!' : ''}`, '', newFlight || newHeight ? 'good key' : '']);
            if (newFlight || newHeight) trailSfx('record');
        }
        return out;
    }

    // Viral run: reactions pour off the ball and the result card gets the viral treatment.
    function goViral(mult) {
        path.fx.viral = mult;
        trailSfx('viral');
        luckBanner('WENT VIRAL!', `×${mult.toFixed(2)} XP for this run`, 'accent');
        if (reducedMotion()) return;
        const glyphs = ['♥', '↑', '#', '★', '♥', '↻'];
        for (let i = 0; i < 46; i++) {
            path.fx.reactions.push({ x: (Math.random() - 0.5) * 60, y: 0, vx: (Math.random() - 0.5) * 70, vy: -(70 + Math.random() * 130),
                age: -Math.random() * 0.9, life: 1.6 + Math.random(), glyph: glyphs[i % glyphs.length], size: 12 + Math.random() * 12,
                color: ['#ff7ab6', path.colors.research, path.colors.primary, path.colors.warning][i % 4] });
        }
    }

    // Breakdown rows for the result card: distance XP, the clean-push roll bonus, and XP already banked.
    // `slips`: act two's slipstreams, which bank and add run bonus like prompts.
    function xpLines(distanceXp, rollBonusXp, clean, banked, crested, slips = 0) {
        const rows = distanceXp >= 0.01 ? [[crested ? 'Distance (×2 for cresting)' : 'Distance', `+${xpText(distanceXp)} XP`]] : [];
        if (clean || slips) {
            const from = [clean ? `${clean} prompt${clean === 1 ? '' : 's'}` : '', slips ? `${slips} slipstream${slips === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
            rows.push([slips && !clean ? 'Slipstream run bonus' : 'Prompt run bonus', `+${xpText(rollBonusXp)} XP`, 'good']);
            rows.push([`Banked from ${from}`, `+${xpText(banked)} XP`, 'good']);
        }
        return rows;
    }

    // The card keeps to a glance: the first lines (what the run did) and the good news (a record, passive XP up,
    // a surge); everything else (chain, slipstream, tokens, speeds…) folds under Details, remembered while
    // the page is open. An act-two card ran to 14 lines (design review round 2).
    const RESULT_SHOWN = 3;
    let resultDetailsOpen = false;
    function resultLines(lines) {
        const row = ([label, value, cls]) => el('li', { class: cls || '' }, [el('span', { text: label }), value instanceof Node ? el('span', {}, [value]) : el('span', { text: value })]);
        const keep = (l, i) => i < RESULT_SHOWN || /\b(key|passive-line)\b/.test(l[2] || '');
        const shown = lines.filter(keep);
        const rest = lines.filter((l, i) => !keep(l, i));
        if (!rest.length) return [el('ul', { class: 'result-lines' }, lines.map(row))];
        const details = el('details', { class: 'result-details' }, [
            el('summary', { text: `Details (${rest.length})` }),
            el('ul', { class: 'result-lines' }, rest.map(row))]);
        details.open = resultDetailsOpen;
        details.addEventListener('toggle', () => { resultDetailsOpen = details.open; });
        return [el('ul', { class: 'result-lines' }, shown.map(row)), details];
    }

    // The lab's room for each card it shows (capped cards only): skills raise it (E.capacity).
    function labCapacities() {
        const out = {};
        for (const u of E.UPGRADES) if (E.CAPACITY[u.id] && isLabUpgrade(u) && E.isUpgradeVisible(state, u)) out[u.id] = E.capacity(state, u);
        return out;
    }
    // A skill made room in the lab: say where, on the run's card, so going back to the lab after a skill is the
    // obvious next move (the owner's playtest: nothing said to check the lab after a skill hill).
    function labRoomLines(before) {
        if (!before) return [];
        const now = labCapacities();
        const grew = Object.keys(now).filter(id => before[id] != null && now[id] > before[id]);
        if (!grew.length) return [];
        const parts = grew.slice(0, 3).map(id => `${E.upgradeName(state, E.UPGRADE_BY_ID[id])} ${before[id]} → ${now[id]}`);
        return [[`Room in the lab: ${parts.join(', ')}${grew.length > 3 ? ` +${grew.length - 3}` : ''}`, '', 'good key lab-line']];
    }

    function showResult({ title, main, flavor, voice, xp, lines, record, skill }) {
        const card = $('rollResult');
        if (record) trailSfx('record');
        else if (!skill) trailSfx('runEnd', { good: xp > 0 });
        card.className = `roll-result${skill ? ' skill' : ''}${path.fx.viral ? ' viral' : ''}`;
        if (path.fx.viral) card.dataset.viral = `VIRAL ×${path.fx.viral.toFixed(2)}`;
        path.fx.viral = null;
        card.replaceChildren(...[
            el('div', { class: 'result-title', text: title }),
            el('div', { class: 'result-main', text: main }),
            el('div', { class: 'result-xp', text: `+${xpText(xp)} XP` }),
            ...resultLines(lines.filter(([a]) => a)),
            flavor ? el('p', { class: 'result-flavor', text: flavor }) : null,
            voice ? el('p', { class: 'result-voice', text: `> ${voice}` }) : null,
            record ? el('span', { class: 'result-badge', text: 'New record!' }) : null,
            path.done
                ? el('div', { class: 'result-actions' }, [
                    el('button', { type: 'button', class: 'ghost-button', 'data-next': 'again', text: 'Train again' }),
                    // With news waiting in the lab (new cards, more room, offers to claim) the lab is one click away,
                    // its count on a badge like the Upgrades button's (the owner's call: after the warm-up there was
                    // nothing new, and the button sent you back to an unchanged lab).
                    ...(labNewsCount() ? [el('button', { type: 'button', class: 'ghost-button result-lab', 'data-next': 'lab', 'data-ready': labNewsCount() > 9 ? '9+' : String(labNewsCount()), text: 'Lab →' })] : []),
                    el('button', { type: 'button', class: 'button', 'data-next': 'dev', text: 'Upgrades →' })])
                : el('div', { class: 'result-hint', text: 'Next run starting…' })
        ].filter(Boolean));
        card.hidden = false;
    }

    function brokeLabel() {
        const cost = E.pushCost(state, E.PATH.minCharge, ballLeg());
        const short = (cost.dp || 0) > state.res.dp ? 'data' : 'compute';
        return `Out of ${short} · make more in the lab`;
    }

    // The Exploit button: shown once one is found, with its charges and the run's flags; it glows while the ball
    // is in a perfect window (status, like the meter's zone).
    function renderExploit(roll) {
        const b = $('exploitButton');
        const open = exploitOpen(roll);
        setHidden(b, !open);
        if (!open) return;
        const ready = exploitReady(roll);
        b.setAttribute('aria-disabled', String(!ready));
        const flags = roll.flags || 0;
        const left = exploitsLeft(roll);
        setText($('exploitMeta'), `${left} left${flags ? ` · ${'⚑'.repeat(flags)}${'·'.repeat(Math.max(0, E.AUDIT_FLAGS - flags))}` : ''}`);
        b.classList.toggle('flagged', flags > 0);
        b.classList.toggle('armed', ready && hopQuality(roll) === 'perfect');
        b.classList.toggle('aiming', !!path.hopAim);
        b.setAttribute('aria-label', `Hop (hold E, let go to hop): ${left} left${flags ? `, ${flags} of ${E.AUDIT_FLAGS} flags` : ''}`);
    }

    function updatePathControls() {
        const roll = path.roll;
        const button = $('pushButton');
        if (!roll) return;
        renderExploit(roll);
        // One message at a time: charging reads "Release to sprint", and the wait counts down on the button
        // (the meter greys out and won't charge until it's over).
        const thrustMode = thrustLeg(roll) && !path.charging && !frozen();
        // Broke: a sprint is due but the lab can't pay even a tap. Say which supply ran dry and where it comes
        // from (the lab-training gate exception to "no hints"): the button used to read "Hold to launch" and
        // presses did nothing (round B: a naive player stalled here before the Data crawler).
        const broke = !thrustMode && !path.charging && !path.fx.windup && !frozen() && !crunching() && !path.fx.maxEffort
            && !path.done && !roll.over && !roll.crested && (!roll.launched || roll.pushesLeft > 0) && chargeBudget() <= 0;
        const label = broke ? brokeLabel()
            : thrustMode
            ? (roll.thrusting ? (crunching() ? `CRUNCH! Free thrust (${path.fx.crunch.toFixed(1)} s)` : 'Thrusting…')
                : !roll.launched ? 'Hold to launch'
                : roll.over ? (path.done ? 'Run over' : 'Next run…')
                : flowing() ? `Flowing… (${path.roll.flowing.toFixed(1)} s)`
                : path.fx.maxEffort ? 'MAX EFFORT: hold to burn'
                : roll.pushesLeft > 0 || crunching() ? 'Hold to thrust' : 'Out of fuel · hold to dive')
            : path.charging ? (frozen() ? 'Release to bank' : 'Release to sprint')
            : path.fx.windup ? 'Breakthrough…'
            : frozen() ? `BULLET TIME! Bank sprints (${path.fx.freeze.toFixed(1)} s)`
            : path.fx.maxEffort && readyToFire(roll) ? 'MAX EFFORT: press to go all out'
            : path.fx.maxEffort && canPush(roll) && roll.ball.cooldown > 0 ? `MAX EFFORT in ${roll.ball.cooldown.toFixed(1)} s`
            : crunching() && !roll.over && !roll.crested ? `CRUNCH! Sprint free (${path.fx.crunch.toFixed(1)} s)`
            : flowing() ? `Flowing… (${path.roll.flowing.toFixed(1)} s)`
            : !roll.launched ? 'Hold to launch'
            : roll.over ? (path.done ? 'Run over' : 'Next run…')
            : roll.crested ? 'Summit!'
            : roll.pushesLeft > 0 && roll.ball.cooldown > 0 ? `Next sprint in ${roll.ball.cooldown.toFixed(1)} s`
            : roll.pushesLeft > 0 ? `Hold to sprint (${roll.pushesLeft} left)` : 'Out of sprints';
        setText(button, label);
        // Stay enabled while charging so releasing the pointer still lands on the button.
        // Looks disabled but still takes presses (aria-disabled, not disabled): a hold during the wait tucks or
        // charges when ready, and Firefox sends no pointer events to a disabled button.
        // While a sprint charges (or the trail is held), the minimap pill in the corner doesn't open on hover.
        document.body.classList.toggle('charging', !!path.charging || !!path.held);
        const off = thrustMode ? path.done || roll.over || (roll.launched && roll.pushesLeft <= 0 && !crunching())
            : !path.charging && (path.done || !readyToFire(roll));
        if (button.getAttribute('aria-disabled') !== String(off)) button.setAttribute('aria-disabled', String(off));
        $('charge').classList.toggle('waiting', !thrustMode && !path.charging && roll.launched && (path.done || (canPush(roll) && !readyToFire(roll))));
        $('charge').classList.toggle('fuel', thrustMode);
        $('charge').classList.toggle('burning', thrustMode && roll.thrusting);
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
        if (units) parts.push(`${roll.slips ? 'run bonus' : 'prompts'} ×${mult.toFixed(2)} · +${xpText(roll.bonusXp)} banked`);
        setText($('liveXpMult'), parts.join(' · '));
    }

    function updateMeter(roll) {
        const d = E.derive(state, debugRates);
        // Act two: the meter is the fuel tank (what's left of the run's sprints), with what full thrust costs.
        if (thrustLeg(roll) && !path.charging && !frozen()) {
            const total = Math.max(1, path.rollPushes || d.pushesPerRoll);
            const fuel = Math.max(0, roll.pushesLeft);
            $('chargeFill').style.width = `${Math.min(1, fuel / total) * 100}%`;
            for (const id of ['chargeZone', 'chargePerfect', 'chargeSystem']) $(id).hidden = true;
            const over = $('chargeOver');
            over.style.left = '100%';
            over.style.width = '0%';
            setText($('chargeValue'), crunching() ? 'Crunch: thrust is free'
                : `Fuel ${fuel.toFixed(1)} / ${total} · full thrust ${E.formatCost(E.burnCost(state, 1 / T.BURN_SECONDS, ballLeg()))} per second`);
            setText($('chargeClean'), '');
            return;
        }
        const level = chargeLevel();
        const zone = currentZone(roll);
        const hit = path.charging ? E.zoneHit(zone, level) : null;
        const inZone = !!hit;
        if (path.charging) {
            window.SFX?.charge(level);
            if (hit && hit !== path.chargeZone) sfx('ui');
            path.chargeZone = hit;
        }
        const fill = $('chargeFill');
        fill.style.width = `${level * 100}%`;
        fill.classList.toggle('in-zone', !!inZone);
        const zoneNode = $('chargeZone');
        zoneNode.style.left = `${zone.from * 100}%`;
        zoneNode.style.width = `${(zone.to - zone.from) * 100}%`;
        zoneNode.hidden = roll.over || roll.pushesLeft <= 0 || !(zone.to > zone.from);   // no zone before Hyperparameter Search
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
    const PUSH_IN = 0.5;        // the nail-biter's and summit's push-in goes at most 2× closer

    function drawArea() {
        const a = { w: path.width - PAD_X * 2, h: path.height - PAD_TOP - PAD_BOTTOM };
        RELIEF = RELIEF_BASE * Math.max(1, (a.h / Math.max(1, a.w)) / 0.25);
        return a;
    }

    function tallestIn(roll, from, to) {
        return tallestAt(roll, from, to).h;
    }
    // The tallest ground in a window and where it peaks, so the camera knows when the thing that made it pull
    // back is behind the ball.
    function tallestAt(roll, from, to) {
        let h = 0, x = from;
        for (let i = 0; i <= 160; i++) {
            const at = from + (to - from) * i / 160;
            if (at > -0.05 && at <= roll.ground.goal.end) {
                const y = groundAt(roll, at);
                if (y > h) { h = y; x = at; }
            }
        }
        return { h, x };
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
        const condense = flowing() && path.fx.superFlow ? LUCID_CONDENSE : 1;
        // Late legs (a launcher): the swells are far bigger than the view, on purpose. A window that widens
        // with speed, a flatter vertical scale (`relief`), and the view rides up and down with the ball, so
        // you see the slope you're on and the air you're in, not the whole hill.
        if (leg >= T.LATE_LEG) {
            const area = drawArea();
            // Metres of height that fit in a view `v` metres wide at the late relief.
            const fitH = v => area.h * v / (area.w * RELIEF * LATE_RELIEF);
            // A steady frame: the floor is the lowest ground across the whole view (not the ground right under
            // the ball, which made the view bob over every swell), and the zoom only changes when speed or a high
            // flight really needs it (hysteresis), pulling back with altitude like launcher games do.
            const leftOf = v => Math.max(g.start - 0.4, roll.ball.x - v * 0.32);
            const floorIn = v => {
                let low = Infinity;
                for (let i = 0; i <= 24; i++) low = Math.min(low, g.height(leftOf(v) + v * i / 24));
                return low;
            };
            // Pull back to watch: wider with speed, and in flight wide enough to frame the ball, the top of its
            // arc and where it will come down (the physics predicts the landing). Zooming out follows at once
            // (eased by the camera); zooming back in waits until it could be 30% tighter, so it doesn't breathe.
            let view = LATE_VIEW + 0.7 * Math.abs(roll.ball.v);
            const land = roll.landing;
            if (land) view = Math.max(view, (land.x - roll.ball.x) / 0.62 + 6);
            let top = land ? Math.max(roll.height, land.top) : roll.height;
            // The leg's skill wall, once it's coming up, stays in frame (its crest was cut off at the top).
            const wall = T.skillHill(leg);
            if (wall.peak - roll.ball.x < view * 0.68) top = Math.max(top, wall.height + 0.5);
            view = Math.max(view, (top - floorIn(view) + 2) / (0.75 * fitH(1)));
            const held = path.lateView;
            if (held && held.roll === roll && view <= held.width && view > held.width / 1.3) view = held.width;
            else path.lateView = { roll, width: view };
            view *= condense;
            const left = leftOf(view);
            const bottom = Math.max(0, floorIn(view) - fitH(view) * 0.06);
            if (!(path.tension > 0) || !path.focus) return { left, right: left + view, bottom, condense, relief: LATE_RELIEF };
            // Nail-biter (and the summit): push in on the ball and the crest, with the crest high in the frame.
            const f = path.focus;
            const close = Math.min(view, Math.max(view * PUSH_IN, LATE_VIEW * 0.6, (f.peak - roll.ball.x) / 0.6 + 4));
            const closeLeft = roll.ball.x - close * 0.3;
            const closeBottom = Math.max(0, f.height - 0.75 * fitH(close));
            const k = path.tension;
            const l = left + (closeLeft - left) * k;
            return { left: l, right: l + view + (close - view) * k, bottom: bottom + (closeBottom - bottom) * k, condense, relief: LATE_RELIEF };
        }
        const span = T.skillHill(leg).end - g.legStart(leg);
        const base = Math.min(span + 0.6, Math.max(3, span * 0.25));
        const leftOf = view => Math.max(g.start - 0.4, roll.ball.x - view * 0.3);
        // Rolling forward, only what's ahead sizes the zoom: the hill just crested no longer counts (after a summit
        // the push-in released out to frame it and zoomed straight back in a second later). Rolling back, all of it.
        const from = view => (roll.ball.v > 0 ? Math.max(leftOf(view), roll.ball.x) : leftOf(view));
        // Look at the base window (not the widened one) to decide the zoom, so it can't feed on itself.
        const ahead = tallestIn(roll, from(base), leftOf(base) + base);
        // Hysteresis: zoom out at once when something tall needs it, but only zoom back in once the view
        // could be 30% tighter, so it doesn't keep breathing in and out over every bump.
        let view = Math.max(base, widthToFit(ahead));
        // A tall hill already in the widened view (a skill hill at its right edge) counts too: it was drawn off
        // the top with an arrow (owner's playtest). A few passes, since widening can show more.
        let cause = tallestAt(roll, from(view), leftOf(view) + view);
        for (let i = 0; i < 3; i++) {
            const need = widthToFit(cause.h);
            if (need <= view * 1.001) break;
            view = need;
            cause = tallestAt(roll, from(view), leftOf(view) + view);
        }
        // Camera language (the owner's call: too much movement, and it pumped in and out near skill hills): the
        // follow zoom pulls back at once when something tall needs it, but only comes back in once that thing is
        // behind a ball rolling forward (past its top), and could be 30% tighter. A ball rocking in the dip before a skill hill
        // used to take the hill in and out of the window, and the zoom breathed with every swing.
        const held = path.camView;
        if (held && held.roll === roll && view < held.width
            && !(roll.ball.x > held.causeX && roll.ball.v > 0 && view <= held.width / 1.3)) view = held.width;
        else if (!held || held.roll !== roll || view !== held.width) path.camView = { roll, width: view, causeX: cause.x };
        // Lucid Dream: the timeline condenses. The view squeezes wider while heights keep their scale
        // (drawPath divides the vertical scale back out by the same factor).
        if (condense > 1) view *= condense;
        const left = leftOf(view);
        // Act one draws hills at the trail's own scale. (Stretching them up to 2× taller to fill the height made
        // slopes look far steeper than the ball felt them, so it no longer read as having weight.)
        if (path.aimT > 0 && !(path.tension > 0)) return aimView(roll, left, view, condense);
        if (!(path.tension > 0) || !path.focus) return { left, right: left + view, bottom: 0, condense };
        // Nail-biter: push in on the ball and the crest, lifting the view so both stay in frame.
        const area = drawArea();
        // A lean-in, not a lunge: at most twice as close (it went from a 9 m view to 1.2 m, 7×, and back out).
        // Set once per moment, so easing out of it never dips in further as the follow view changes underneath.
        const close = path.focusClose ??= Math.min(view, Math.max(view * PUSH_IN, 1.2, path.focus.halfWidth * 1.6));
        const closeLeft = roll.ball.x - close * 0.45;
        const visibleH = area.h * close / (area.w * RELIEF);
        const closeBottom = Math.max(0, roll.ground.height(roll.ball.x) - visibleH * 0.35);
        const t = path.tension;
        const l = left + (closeLeft - left) * t;
        return { left: l, right: l + view + (close - view) * t, bottom: closeBottom * t, };
    }

    // Aiming a hop (camera language's fifth move, the owner's playtest: at the follow zoom a lip was a few pixels):
    // lean in on the ball and the rolling hills just ahead, as close as their height allows (the skill hill can
    // go off the top, with its arrow), wide enough to show the next lip coming. Eased by `path.aimT`.
    function aimView(roll, left, view, condense) {
        const x = roll.ball.x;
        const next = nextHopWindow(roll);
        let close = Math.max(AIM_VIEW_MIN, next ? (next.to - x) / 0.65 : 0);
        for (let i = 0; i < 3; i++) {
            let h = 0;
            for (const b of roll.ground.bumps) if (b.end > x - close * 0.3 && b.start < x + close * 0.7) h = Math.max(h, b.height);
            close = Math.max(AIM_VIEW_MIN, close, widthToFit(h));
        }
        close = Math.min(view, close);
        const k = path.aimT;
        const closeLeft = Math.max(roll.ground.start - 0.4, x - close * 0.3);
        const l = left + (closeLeft - left) * k;
        return { left: l, right: l + view + (close - view) * k, bottom: 0, condense };
    }
    const AIM_VIEW_MIN = 2.2;   // metres: the aim zoom never goes closer

    function cameraMoving() {
        if (!path.roll || !path.cam) return true;
        const t = cameraTarget(path.roll);
        const width = t.right - t.left;
        return Math.abs(path.cam.left - t.left) > width * 0.002 || Math.abs(path.cam.right - t.right) > width * 0.002;
    }

    // Boost strips glow along the line (brighter under the ball): front strips (hill faces) in blue with chevrons
    // running forward, back strips (hill backs, they brake a backward roll) in green with still brake bars. XP
    // tokens hang as small diamonds that bob; a taken one pops with its XP.
    // Hop's perfect windows: each crest's lip on the hill the ball is on and the next two, glowing in the exploit's
    // violet while a charge is left (a skill check you can see coming, like the meter's zone), drawn as a run of
    // short glitchy dashes along the ground.
    function drawHopWindows(ctx, roll, X, Y, t, left, right) {
        if (!exploitOpen(roll) || exploitsLeft(roll) <= 0 || roll.over || path.done) return;
        const g = roll.ground;
        const c = path.colors;
        const ahead = g.bumps.filter(b => b.end >= roll.ball.x && b.peak > left && b.peak < right).slice(0, 3);
        ctx.save();
        ctx.lineCap = 'round';
        for (const b of ahead) {
            const { from, to } = hopWindow(b, roll.ball.v);
            const on = roll.ball.x >= from && roll.ball.x <= to && !roll.airborne;
            const pulse = reducedMotion() ? 0.8 : 0.6 + 0.3 * Math.sin(t * 6 + b.peak);
            ctx.strokeStyle = hexAlpha(c.research, on ? 1 : pulse);
            ctx.lineWidth = on ? 6 : 4;
            ctx.setLineDash([5, 3]);
            ctx.lineDashOffset = reducedMotion() ? 0 : -t * 20;
            ctx.beginPath();
            for (let i = 0; i <= 10; i++) {
                const x = from + (to - from) * i / 10;
                const px = X(x), py = Y(g.height(x)) - 3;
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // While aiming a hop: a ring closes on the ball as the next lip comes up (HOP_AIM_RING seconds out, at the
    // ball's speed), locking on and filling while it's in the window, like a rhythm game's approach circle: it
    // reads the timing whatever the zoom. And the frame shows the breakpoint: a violet edge and a tag.
    function drawHopAim(ctx, roll, X, Y) {
        const k = path.aimT || 0;
        if (k <= 0 || !exploitReady(roll)) return;
        const c = path.colors;
        const bx = X(roll.ball.x), by = Y(roll.ground.height(roll.ball.x));
        const next = nextHopWindow(roll);
        ctx.save();
        if (next && roll.ball.v > 0.3) {
            const inside = roll.ball.x >= next.from;
            const t = inside ? 0 : (next.from - roll.ball.x) / roll.ball.v;
            if (t < HOP_AIM_RING) {
                const r = BALL + 5 + (t / HOP_AIM_RING) * 46;
                ctx.globalAlpha = k * (inside ? 1 : 0.35 + 0.65 * (1 - t / HOP_AIM_RING));
                ctx.strokeStyle = c.research;
                ctx.lineWidth = inside ? 4 : 2.5;
                ctx.shadowColor = c.research;
                ctx.shadowBlur = inside ? 18 : 6;
                ctx.beginPath();
                ctx.arc(bx, by, r, 0, Math.PI * 2);
                ctx.stroke();
                if (inside) {
                    ctx.fillStyle = hexAlpha(c.research, 0.25);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    function drawBreakpoint(ctx) {
        const k = path.aimT || 0;
        if (k <= 0) return;
        const c = path.colors;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = hexAlpha(c.research, 0.55);
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, path.width - 4, path.height - 4);
        ctx.fillStyle = c.research;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('❚❚ BREAKPOINT', 14, 44);   // under the sprint pips, clear of the goal line
        ctx.restore();
    }

    function drawFeatures(ctx, roll, X, Y, t) {
        const c = path.colors;
        const g = roll.ground;
        const { left, right } = path.cam;
        const still = reducedMotion();
        drawHopWindows(ctx, roll, X, Y, t, left, right);
        ctx.save();
        for (const st of g.strips) {
            if (st.to < left || st.from > right) continue;
            const on = !roll.airborne && roll.ball.x >= st.from && roll.ball.x <= st.to;
            const back = st.kind === 'back';
            const tone = back ? c.success : c.primary;
            ctx.strokeStyle = hexAlpha(tone, on ? 0.95 : 0.6);
            ctx.lineWidth = on ? 5 : 4;
            ctx.shadowColor = tone;
            ctx.shadowBlur = on ? 16 : 8;
            ctx.beginPath();
            const n = Math.max(2, Math.ceil((X(st.to) - X(st.from)) / 6));
            for (let i = 0; i <= n; i++) {
                const x = st.from + (st.to - st.from) * i / n;
                const px = X(x);
                const py = Y(groundAt(roll, x)) - 3;
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            // Chevrons running forward along it.
            const len = X(st.to) - X(st.from);
            const gap = 18;
            const shift = still || back ? gap / 2 : (t * 60) % gap;
            ctx.fillStyle = hexAlpha(c.text, 0.75);
            ctx.strokeStyle = hexAlpha(c.text, 0.75);
            ctx.lineWidth = 2;
            for (let d = shift; d < len; d += gap) {
                const x = st.from + (st.to - st.from) * d / len;
                const px = X(x);
                const py = Y(groundAt(roll, x)) - 3;
                if (back) {   // a brake: a short bar across the line
                    ctx.beginPath();
                    ctx.moveTo(px, py - 5);
                    ctx.lineTo(px, py + 3);
                    ctx.stroke();
                    continue;
                }
                ctx.beginPath();
                ctx.moveTo(px - 3, py - 4);
                ctx.lineTo(px + 2, py);
                ctx.lineTo(px - 3, py + 4);
                ctx.fill();
            }
        }
        for (const tk of g.tokens) {
            if (tk.taken || tk.x < left || tk.x > right) continue;
            const px = X(tk.x);
            const py = Y(tk.y) + (still ? 0 : Math.sin(t * 3 + tk.x) * 2.5);
            ctx.fillStyle = c.warning;
            ctx.shadowColor = c.warning;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(px, py - 6);
            ctx.lineTo(px + 4.5, py);
            ctx.lineTo(px, py + 6);
            ctx.lineTo(px - 4.5, py);
            ctx.closePath();
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        for (const p of path.fx.pops) {
            const k = p.age / (p.life || 1.1);
            const px = X(p.wx);
            const py = Y(p.wh);
            const tone = p.big ? c.success : c.warning;
            if (!p.big) {
                ctx.strokeStyle = hexAlpha(tone, 1 - k);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(px, py, 6 + 18 * k, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.font = p.big ? '700 15px "Chakra Petch", system-ui, sans-serif' : '700 12px "JetBrains Mono", monospace';
            ctx.fillStyle = hexAlpha(tone, Math.min(1, 2 * (1 - k)));
            ctx.fillText(p.text, Math.max(PAD_X + 120, Math.min(path.width - PAD_X - 120, px)), Math.max(PAD_TOP + 40, py - (p.big ? 34 : 12) - 20 * k));
        }
        ctx.restore();
    }

    // Metres between labelled distance posts: a round number that leaves at least 90 px between posts.
    function postStep(pxPerUnit) {
        for (const m of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (m * pxPerUnit >= 90) return m;
        return 10000;
    }

    // The sky behind the trail: two ranges of distant ridges drifting slower than the trail (parallax), a faint
    // glow behind the skill hill and a soft haze, so the landscape reads as a place rather than a line on a void
    // (act one's trail left three quarters of the canvas empty at 1920 px). Decoration only: no physics, and the
    // hills keep their own scale.
    const RIDGES = [{ par: 0.18, amp: 0.62, alpha: 0.045, seed: 1.3 }, { par: 0.38, amp: 0.4, alpha: 0.065, seed: 4.1 }];
    function drawBackdrop(ctx, w, h, cam, pxPerUnit, goalX, goalY) {
        const c = path.colors;
        const floor = h - PAD_BOTTOM;
        const sky = Math.max(1, floor - PAD_TOP);
        const haze = ctx.createLinearGradient(0, 0, 0, floor);
        haze.addColorStop(0, hexAlpha(c.primary, 0.05));
        haze.addColorStop(1, hexAlpha(c.primary, 0));
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, w, floor);
        if (goalX != null && goalX > -w * 0.2 && goalX < w * 1.2) {
            const r = Math.max(80, Math.min(w, h) * 0.45);
            const glow = ctx.createRadialGradient(goalX, Math.max(PAD_TOP, goalY), 0, goalX, Math.max(PAD_TOP, goalY), r);
            glow.addColorStop(0, hexAlpha(c.warning, 0.1));
            glow.addColorStop(1, hexAlpha(c.warning, 0));
            ctx.fillStyle = glow;
            ctx.fillRect(goalX - r, Math.max(PAD_TOP, goalY) - r, 2 * r, 2 * r);
        }
        const shift = cam.left * pxPerUnit;
        for (const L of RIDGES) {
            ctx.beginPath();
            ctx.moveTo(0, floor);
            for (let px = 0; px <= w + 6; px += 6) {
                const u = (shift * L.par + px) / 260;
                const y = 0.55 + 0.22 * Math.sin(u * 0.9 + L.seed) + 0.14 * Math.sin(u * 2.3 + 2 * L.seed) + 0.09 * Math.sin(u * 5.3 + L.seed * 3);
                ctx.lineTo(px, floor - sky * L.amp * Math.max(0, y));
            }
            ctx.lineTo(w, floor);
            ctx.closePath();
            ctx.fillStyle = hexAlpha(c.primary, L.alpha);   // a cooler hue than the trail, so it never reads as terrain
            ctx.fill();
        }
    }

    function drawPath(dt = 0) {
        const { ctx, width: w, height: h, colors: c } = path;
        if (!ctx || !w || !state || openBay !== 'training' || path.view !== 'run') return;
        ensurePathColors();
        const roll = currentRoll();
        const g = roll.ground;
        const target = cameraTarget(roll);
        if (!path.cam) path.cam = { ...target };
        const ease = Math.min(1, dt * (path.overview > 0 ? 2.2 : path.tension > 0.05 ? 8 : 5));
        path.cam.left += (target.left - path.cam.left) * ease;
        path.cam.right += (target.right - path.cam.right) * ease;
        path.cam.bottom = (path.cam.bottom || 0) + ((target.bottom || 0) - (path.cam.bottom || 0)) * ease;
        path.cam.condense = (path.cam.condense || 1) + ((target.condense || 1) - (path.cam.condense || 1)) * ease;
        path.cam.relief = (path.cam.relief || 1) + ((target.relief || 1) - (path.cam.relief || 1)) * ease;
        const cam = path.cam;
        const goal = g.goal;

        // Same scale on both axes (times the fixed exaggeration), derived from the eased camera width.
        const area = drawArea();
        const pxPerUnit = area.w / (cam.right - cam.left);
        const yScale = pxPerUnit * RELIEF * (path.cam.condense || 1) * (path.cam.relief || 1);
        const X = x => PAD_X + (x - cam.left) * pxPerUnit;
        // No clamp at the top: a crest taller than the view runs off it (and gets a marker) instead of being
        // drawn flattened into a plateau.
        const Y = y => h - PAD_BOTTOM - (y - cam.bottom) * yScale;
        const n = Math.min(1400, Math.max(300, Math.round(w * 1.5)));
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const x = cam.left + (cam.right - cam.left) * i / n;
            pts.push([X(x), Y(x > goal.end ? 0 : groundAt(roll, x)), x]);
        }

        ctx.clearRect(0, 0, w, h);
        // Big hits shake the whole view for a moment.
        ctx.save();
        if (path.fx.shake > 0 && shakeOn()) {
            const m = 14 * Math.min(1, path.fx.shake / 0.4);
            ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }
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
        // Bullet Time drains the world to grey (the ball and its power keep their colour).
        if (frozen()) ctx.filter = `grayscale(${Math.min(1, (fx.freezeMax - fx.freeze) * 5, fx.freeze * 4)})`;
        drawBackdrop(ctx, w, h, cam, pxPerUnit, goal ? X(goal.peak) : null, goal ? Y(goal.height) : null);
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
        // Distance marks tied to the world (the lines above are fixed to the screen), so speed reads on the
        // flat too: faint verticals every fifth of a post, and a labelled post every `post` metres.
        const post = postStep(pxPerUnit);
        const x0 = g.start + Math.ceil((cam.left - g.start) / (post / 5)) * (post / 5);
        ctx.strokeStyle = hexAlpha(c.secondary, 0.16);
        for (let x = x0; x <= cam.right; x += post / 5) {
            ctx.beginPath();
            ctx.moveTo(X(x), h);
            ctx.lineTo(X(x), PAD_TOP);
            ctx.stroke();
        }
        ctx.restore();
        if (path.overview <= 0) {
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            for (let x = g.start + Math.max(1, Math.ceil((cam.left - g.start) / post)) * post; x <= cam.right; x += post) {
                const gy = Y(groundAt(roll, x));
                ctx.strokeStyle = hexAlpha(c.muted, 0.45);
                ctx.beginPath();
                ctx.moveTo(X(x), gy - 4);
                ctx.lineTo(X(x), gy - 12);
                ctx.stroke();
                // Labels run along the floor like a ruler, beside each tick's foot (on the ground they sat on
                // hill faces; at the very bottom they ran into the progress track).
                ctx.fillStyle = hexAlpha(c.muted, 0.6);
                ctx.textAlign = 'left';
                ctx.fillText(`${Math.round(x - g.start)} m`, X(x) + 4, h - PAD_BOTTOM - 4);
                ctx.textAlign = 'center';
            }
        }
        drawFeatures(ctx, roll, X, Y, t);

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
            // Named only when the label fits inside the view (a tall hill's crest off the top, or a name
            // hanging over an edge, stays unlabelled).
            const name = E.skillAt(j).name;
            const half = ctx.measureText(name).width / 2;
            if (X(sh.end) - X(sh.start) > 70 && py - 8 > PAD_TOP && px - half > 4 && px + half < w - 4) ctx.fillText(name, px, py - 8);
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
        // A skill hill whose crest is above the view: an arrow at the top edge with how far up it is.
        for (const b of g.bumps) {
            if (b.skill === null || b.peak < cam.left || b.peak > cam.right || Y(b.height) > PAD_TOP) continue;
            const px = X(b.peak);
            const up = (PAD_TOP - Y(b.height)) / yScale;
            ctx.fillStyle = c.warning;
            ctx.beginPath();
            ctx.moveTo(px, PAD_TOP - 10);
            ctx.lineTo(px + 7, PAD_TOP);
            ctx.lineTo(px - 7, PAD_TOP);
            ctx.fill();
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`+${up < 10 ? up.toFixed(1) : Math.round(up)} m`, px, PAD_TOP + 12);
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

        // Paradigm Shift: a blast of light runs along the ground ahead of the ball, and the hills it reaches
        // hang as cracked slabs (glowing seams) for a beat, then blow apart.
        if (fx.breach) {
            const b = fx.breach;
            const k = Math.min(1, b.age / 0.45);
            const x0 = X(b.from);
            const x1 = X(b.from + b.reach * k);
            const a = Math.max(0, 1 - Math.max(0, b.age - 0.45) / 0.45);
            const band = ctx.createLinearGradient(x0, 0, x1, 0);
            band.addColorStop(0, hexAlpha(c.warning, 0));
            band.addColorStop(0.85, hexAlpha('#fff3c4', 0.55 * a));
            band.addColorStop(1, hexAlpha('#ffffff', 0.9 * a));
            ctx.save();
            ctx.fillStyle = band;
            ctx.shadowColor = c.warning;
            ctx.shadowBlur = 30;
            const gy0 = Y(0);
            ctx.fillRect(x0, gy0 - 60 * a, Math.max(0, x1 - x0), 60 * a + 6);
            ctx.restore();
        }
        for (const p of fx.shards) {
            const resting = p.age < 0;
            const cx = X(p.cx) + p.x;
            const cy = Y(p.cy) + p.y;
            ctx.save();
            ctx.globalAlpha = resting ? 1 : Math.max(0, Math.min(1, (p.life - p.age) / 0.4));
            ctx.translate(cx, cy);
            ctx.rotate(p.rot);
            ctx.beginPath();
            p.pts.forEach(([wx, wy], i) => {
                const px = X(wx) - X(p.cx);
                const py = Y(wy) - Y(p.cy);
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            });
            ctx.closePath();
            ctx.fillStyle = hexAlpha(c.secondary, resting ? 0.35 : 0.5);
            ctx.fill();
            const glow = resting ? 0.5 + 0.5 * Math.sin(t * 40) : 0.6;
            ctx.shadowColor = c.warning;
            ctx.shadowBlur = resting ? 14 : 8;
            ctx.strokeStyle = hexAlpha(resting ? '#fff3c4' : c.warning, glow);
            ctx.lineWidth = resting ? 2 : 1.5;
            ctx.stroke();
            ctx.restore();
        }

        // Ball, riding on the line (centred on it, like a bead on a wire). Ring: green while rolling
        // forward, red while rolling back. In flow it floats above the line with a slow bob.
        // A winding-up breakthrough shakes harder and harder until it goes.
        const wind = fx.windup ? Math.min(1, fx.windup.age / WINDUP_SECONDS) : 0;
        const jitter = wind ? (1.5 + 4 * wind) : 0;
        const gx = X(roll.ball.x);
        const gy = Y(groundAt(roll, roll.ball.x));
        // In flight (late legs) the ball is drawn at its height, over a shadow on the ground.
        const ay = roll.airborne ? Y(roll.height) : null;
        // Flow: the ball rises to fly high over everything in view (mid-sky, or clear of the tallest hill),
        // with a slow bob, instead of skimming the line.
        let lift = 0;
        if (fx.lift > 0) {
            const tallest = Math.min(...pts.map(q => q[1]));
            const sky = Math.max(PAD_TOP + 24, Math.min(PAD_TOP + area.h * 0.38, tallest - 46));
            const fly = Math.max(28, gy - sky);
            lift = fx.lift * (fly + (reducedMotion() ? 0 : 6 * Math.sin(t * 2.4)));
        }
        const bx = gx + (jitter ? (Math.random() - 0.5) * jitter : 0);
        const by = (ay ?? gy) - lift + (jitter ? (Math.random() - 0.5) * jitter : 0);
        // The ribbon remembers where the ball was in the world (its height, plus a flow's lift), so it stays a
        // clean arc while the camera eases: screen positions went wavy as the view moved under them.
        if ((flowing() || roll.airborne) && !reducedMotion()) fx.flight.push({ wx: roll.ball.x, wh: roll.airborne ? roll.height : groundAt(roll, roll.ball.x), lift, age: 0, air: roll.airborne, t: performance.now() });
        if (ay !== null && gy - ay > 4) {
            const k = Math.max(0.25, 1 - (gy - ay) / 400);
            ctx.fillStyle = hexAlpha('#000000', 0.35 * k);
            ctx.beginPath();
            ctx.ellipse(gx, gy + 2, BALL * 1.6 * k, BALL * 0.4 * k, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        if (fx.flight.length > 1) {
            // The flight's ribbon, fading behind the ball.
            ctx.save();
            ctx.lineCap = 'round';
            for (let i = 1; i < fx.flight.length; i++) {
                const tone = fx.flight[i].air ? c.success : fx.superFlow ? LUCID : c.secondary;
                const a = fx.flight[i - 1];
                const b = fx.flight[i];
                // A gap (it landed and rolled before flying again) starts a new ribbon, not a line through the hill.
                if (b.t - a.t > 80) continue;
                const k = 1 - b.age / 0.7;
                ctx.strokeStyle = hexAlpha(tone, 0.55 * k);
                ctx.lineWidth = 2 + 8 * k;
                ctx.shadowColor = tone;
                ctx.shadowBlur = 16;
                ctx.beginPath();
                ctx.moveTo(X(a.wx), Y(a.wh) - a.lift);
                ctx.lineTo(X(b.wx), Y(b.wh) - b.lift);
                ctx.stroke();
            }
            ctx.restore();
        }
        if (lift > 1) {
            // A faint tether down to its shadow, so you can see where it is over the trail.
            ctx.save();
            ctx.setLineDash([2, 6]);
            ctx.strokeStyle = hexAlpha(fx.superFlow ? LUCID : c.secondary, 0.3 * fx.lift);
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(bx, by + BALL);
            ctx.stroke();
            ctx.restore();
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
        if (frozen()) {
            // Bullet Time: the world drains to cold grey (the ball and its power keep their colour), dust hangs
            // in the air, and a clock face ticks down round the ball.
            const a = Math.min(1, (fx.freezeMax - fx.freeze) * 5, fx.freeze * 4);
            ctx.filter = 'none';
            ctx.save();
            ctx.fillStyle = `rgba(90, 140, 230, ${0.16 * a})`;
            ctx.fillRect(0, 0, w, h);
            for (const m of fx.motes) {
                ctx.fillStyle = hexAlpha('#cfe3ff', a * (0.35 + 0.25 * Math.sin(t * 2 + m.tw)));
                ctx.beginPath();
                ctx.arc(m.x * w, PAD_TOP + m.y * area.h, m.r, 0, Math.PI * 2);
                ctx.fill();
            }
            const R = 64;
            ctx.strokeStyle = hexAlpha('#cfe3ff', 0.35 * a);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(bx, by, R, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 12; i++) {
                const ang = i * Math.PI / 6;
                const r0 = i % 3 ? R - 6 : R - 12;
                ctx.beginPath();
                ctx.moveTo(bx + Math.cos(ang) * r0, by + Math.sin(ang) * r0);
                ctx.lineTo(bx + Math.cos(ang) * R, by + Math.sin(ang) * R);
                ctx.stroke();
            }
            // The hand runs back to twelve as the freeze runs out, ticking once a second.
            const left = fx.freeze / fx.freezeMax;
            const tick = Math.ceil(fx.freeze) / fx.freezeMax;
            const hand = -Math.PI / 2 + Math.PI * 2 * (reducedMotion() ? left : tick);
            ctx.strokeStyle = hexAlpha('#ffffff', 0.85 * a);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(hand) * (R - 14), by + Math.sin(hand) * (R - 14));
            ctx.stroke();
            // Every banked sprint waits as a chevron ahead of the ball, brighter the more there are.
            for (let i = 0; i < fx.banked; i++) {
                const cx = bx + R + 14 + i * 13;
                ctx.strokeStyle = hexAlpha(c.primary, Math.min(1, 0.5 + 0.1 * fx.banked) * a);
                ctx.shadowColor = c.primary;
                ctx.shadowBlur = 10;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx, by - 9);
                ctx.lineTo(cx + 8, by);
                ctx.lineTo(cx, by + 9);
                ctx.stroke();
            }
            ctx.restore();
        }
        drawLuckUnder(ctx, roll, bx, by, X, Y, wind);
        if (path.pushFlash > 0) {
            ctx.fillStyle = hexAlpha(c.warning, path.pushFlash);
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 4 + 10 * (0.35 - path.pushFlash) / 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
        drawThrust(ctx, roll, bx, by, X, Y, pxPerUnit, yScale, dt);
        // Tucked: a gold halo, and speed lines behind it on the way down.
        if (roll.tuck) {
            ctx.strokeStyle = hexAlpha(c.warning, 0.7);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bx, by, BALL + 4, 0, Math.PI * 2);
            ctx.stroke();
            if (g.slope(roll.ball.x) < -0.05 && roll.ball.v > 1) {
                ctx.strokeStyle = hexAlpha(c.warning, 0.45);
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(bx - BALL - 6, by - 4 + i * 4);
                    ctx.lineTo(bx - BALL - 18 - i * 4, by - 4 + i * 4);
                    ctx.stroke();
                }
            }
        }
        // Fast: speed lines stream off the back of the ball (by screen speed, so they mean "this is quick").
        const screenSpeed = roll.ball.v * pxPerUnit;
        if (!roll.tuck && screenSpeed > 420 && !reducedMotion()) {
            const k = Math.min(1, (screenSpeed - 420) / 600);
            ctx.strokeStyle = hexAlpha(c.text, 0.12 + 0.25 * k);
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                const off = ((t * 9 + i * 0.37) % 1) * 10;
                const len = 12 + 26 * k;
                ctx.beginPath();
                ctx.moveTo(bx - BALL - 4 - off, by - 6 + i * 4);
                ctx.lineTo(bx - BALL - 4 - off - len, by - 6 + i * 4);
                ctx.stroke();
            }
        }
        drawHopAim(ctx, roll, X, Y);
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.arc(bx, by, BALL, 0, Math.PI * 2);
        ctx.fill();
        // In flight: how high it is above the ground under it.
        const above = roll.airborne ? roll.height - g.height(roll.ball.x) : 0;
        if (above > 0.5) {
            ctx.font = '600 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = hexAlpha(c.success, 0.9);
            ctx.fillText(`↑ ${above.toFixed(1)} m`, bx, by - BALL - 10);
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = wind ? c.warning : crunching() ? c.danger : roll.ball.v > 0.05 ? c.success : roll.ball.v < -0.05 ? c.danger : c.primary;
        ctx.stroke();
        if (path.holdHint > 0 && !path.held) {
            const a = Math.min(1, path.holdHint) * (0.6 + 0.4 * Math.sin(t * 8));
            ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = hexAlpha(c.warning, a);
            ctx.fillText('HOLD ▼', bx, by - BALL - 26);
        }
        drawLuckOver(ctx, bx, by, wind);
        drawBreakpoint(ctx);
        drawTear(ctx);
        ctx.restore();

        // Skill hill label, kept on screen as an arrow when the hill is still ahead of the view. On a replay
        // it names the hill of the leg the ball is on (✓ when already learned).
        // (Drawn outside the flow's pulse, so the beat never pushes it off screen.)
        // The demo's gate past In-Context Learning: a sealed barrier, "Not available in the demo".
        if (E.ACT_TWO_LOCKED && roll.ground.last >= E.ACT_TWO_LEG - 1) {
            const gx = X(demoGateX());
            if (gx > -40 && gx < w + 40) {
                const top = 8, base = Y(0);
                ctx.save();
                ctx.strokeStyle = hexAlpha(c.danger, 0.85);
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(gx, base);
                ctx.lineTo(gx, top);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = hexAlpha(c.danger, 0.08);
                ctx.fillRect(gx, top, w, base - top);
                ctx.textAlign = gx > w - 160 ? 'right' : 'left';
                const tx = gx > w - 160 ? gx - 10 : gx + 10;
                ctx.font = '700 13px "Chakra Petch", system-ui, sans-serif';
                ctx.fillStyle = c.danger;
                ctx.fillText('ACT II · TERMINAL VELOCITY', tx, top + 78);
                ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
                ctx.fillStyle = hexAlpha(c.text, 0.8);
                ctx.fillText('Not available in the demo', tx, top + 94);
                ctx.restore();
            }
        }
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


        // Bullet Time's frame: a cold vignette.
        if (frozen()) {
            const a = Math.min(1, (fx.freezeMax - fx.freeze) * 4, fx.freeze * 4);
            const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
            vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vg.addColorStop(1, `rgba(10, 30, 70, ${0.55 * a})`);
            ctx.fillStyle = vg;
            ctx.fillRect(0, 0, w, h);
        }
        // Lucid Dream: days pass in seconds, the sky cycling dusk to night behind everything.
        if (fx.superFlow && fx.lift > 0) {
            const phase = 0.5 + 0.5 * Math.sin(t * 7);
            ctx.fillStyle = hexAlpha(phase > 0.5 ? LUCID : '#2a3a8a', 0.12 * fx.lift * Math.abs(phase - 0.5) * 2);
            ctx.fillRect(0, 0, w, h);
        }
        // Time restarting (and Lucid Dream): speed streaks rush past.
        for (const p of fx.streaks) {
            const k = p.age / p.life;
            const x = (p.x - p.speed * p.age) * w;
            ctx.strokeStyle = hexAlpha(p.color || '#dff0ff', 0.6 * (1 - k));
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, PAD_TOP + p.y * area.h);
            ctx.lineTo(x + p.len * w, PAD_TOP + p.y * area.h);
            ctx.stroke();
        }
        // A flash for the big moments (a super breakthrough, time stopping and restarting).
        if (fx.flash && shakeOn()) {
            ctx.fillStyle = hexAlpha(fx.flash.color, fx.flash.max * (1 - fx.flash.age / fx.flash.life));
            ctx.fillRect(0, 0, w, h);
        }

        // HUD: pushes left as pips and the cooldown as a bar under them.
        const pips = roll.pushesLeft;
        ctx.textAlign = 'left';
        for (let i = 0; i < E.derive(state).pushesPerRoll; i++) {
            ctx.beginPath();
            ctx.arc(PAD_X + 6 + i * 16, 14, 5, 0, Math.PI * 2);
            ctx.fillStyle = hexAlpha(c.muted, 0.3);
            ctx.fill();
            // Act two burns fuel continuously: the pip being burned drains.
            const left = Math.max(0, Math.min(1, pips - i));
            if (left > 0) {
                ctx.fillStyle = hexAlpha(c.warning, left < 1 ? 0.35 + 0.65 * left : 1);
                ctx.beginPath();
                ctx.moveTo(PAD_X + 6 + i * 16, 14);
                ctx.arc(PAD_X + 6 + i * 16, 14, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
                ctx.fill();
            }
        }
        // Skills learned on this run so far (a strong run can learn several; the result card lists them too).
        if (roll.learned?.length && !roll.over) {
            ctx.font = '600 11px "Atkinson Hyperlegible", sans-serif';
            ctx.fillStyle = hexAlpha(c.success, 0.85);
            ctx.textAlign = 'left';
            roll.learned.slice(-4).forEach((l, i) => ctx.fillText(`✓ ${l.skill.name}`, PAD_X, 60 + i * 15));
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
            const label = `${state.path.learned} skill${state.path.learned === 1 ? '' : 's'} learned`;
            const fade = Math.min(1, path.overview);
            // A plate in the trail's colour: the overview's hills sit right under the label and ran through the count.
            const lw = ctx.measureText(label).width + 16;
            ctx.fillStyle = hexAlpha(c.bg, 0.85 * fade);
            ctx.fillRect(w / 2 - lw / 2, h - PAD_BOTTOM - 24, lw, 22);
            ctx.fillStyle = hexAlpha(c.success, fade);
            ctx.fillText(label, w / 2, h - PAD_BOTTOM - 8);
        }

        // Confetti, falling across the whole trail.
        for (const p of path.particles) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.max(0, Math.min(1, (path.height + 10 - p.y) / 60, (CONFETTI_SECONDS - p.age) / 0.6));
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
            ctx.translate(w / 2, bannerTop(Math.max(78, h * 0.2), 34));
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
            ctx.fillText(path.legFlash.text, w / 2, bannerTop(Math.max(84, h * 0.22), 20) - 6 * Math.min(1, a / 0.3));
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
        ctx.restore();
    }

    // The rack's lanes (and their copies in the facility camera). Before automation a lane is a static
    // graph of the whole stretch with your best run marked; with the Auto-Trainer it goes live and
    // follows the ball. Drawn every frame the run loop runs, and after each camera refresh.
    function drawLanes() {
        drawSnareLanes();
        // The static graph needs a stretch to draw even before the bay has been opened.
        // With the Auto-Trainer on, the live lanes follow its ghost run; otherwise they monitor your frontier.
        const live = ghostOn();
        const roll = live ? ghost.roll : path.roll || (state.unlocked['module:path'] ? currentRoll() : null);
        const c = path.colors;
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
            // (Late legs' swells are tens of metres wide, so the live window is too.)
            const span = live ? (g.legAt(roll.ball.x) >= T.LATE_LEG ? 60 : 3) : g.goal.end - fs;
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
                const by = y(roll.height);
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
    // A cleared leg's lane plays back a run on it (the owner's call: the even crawl said nothing): the real physics,
    // at the strength you had the last time you ran that leg yourself (E.legPower), sprinting at your usual charge
    // (your last 20) from rest and up climbs it won't make, thrusting in act two the same way, until it crests the
    // leg's skill hill or stops. Simulated once and cached (the ball's x and height 30 times a second), again only
    // when that strength changes. What the Auto-Trainer's ghost and the passive XP replicate, made visible.
    const legReplays = new Map();
    const REPLAY_FPS = 30;
    function legReplay(k) {
        const power = E.legPower(state, k);
        const key = `${k}:${power.toFixed(3)}`;
        const hit = legReplays.get(k);
        if (hit && hit.key === key) return hit;
        const d = E.derive(state);
        const roll = T.createRoll(k, 9973 * (k + 1), { pushes: d.pushesPerRoll, cooldown: d.pushCooldown, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: k });
        const h = path.handCharges;
        const charge = h.length ? Math.max(E.PATH.minCharge, Math.min(1, h.reduce((a, b) => a + b, 0) / h.length)) : 0.9;
        const share = E.sprintStrength(state, charge, null, false, false) / E.sprintStrength(state, 1, null, false, false);
        const xs = [], ys = [];
        const dt = 1 / REPLAY_FPS;
        let crested = false;
        for (let i = 0; i < REPLAY_FPS * 90 && !roll.over; i++) {
            roll.thrust = 0;
            if (k >= T.LATE_LEG) {
                const want = !roll.launched || (!roll.airborne && roll.ball.v < AUTO_THRUST_SPEED) || wontClear(roll) || (roll.airborne && roll.vy < 0);
                if (want && roll.pushesLeft > 0) roll.thrust = E.PATH.thrustEfficiency * power * power / T.BURN_SECONDS;
            } else if (roll.ball.cooldown <= 0 && !roll.airborne && roll.pushesLeft > 0 && (!roll.launched || roll.atRest || wontClear(roll))) {
                roll.push(power * share);
            }
            const evs = roll.step(dt);
            xs.push(roll.ball.x);
            ys.push(roll.height);
            if (evs.some(e => e.type === 'crest')) { crested = true; break; }
            if (evs.some(e => e.type === 'end')) break;
        }
        const g = roll.ground;
        if (crested) {
            // Over the top it rolls down the far side and out of view (the owner's call: it used to stop on the crest).
            // The physics ends a run at its crest, so the roll-out is carried on here: its speed, gaining downhill.
            let x = roll.ball.x, v = Math.max(1, Math.abs(roll.ball.v));
            const out = g.goal.end + 1.5;
            for (let i = 0; i < REPLAY_FPS * 6 && x < out; i++) {
                const slope = (g.height(x + 0.02) - g.height(x)) / 0.02;
                v = Math.max(0.8, v - T.GRAVITY * slope * dt);
                x += v * dt;
                xs.push(x);
                ys.push(g.height(Math.min(x, g.goal.end)));
            }
            for (let i = 0; i < REPLAY_FPS / 2; i++) { xs.push(Infinity); ys.push(0); }
        } else {
            // A run that stopped: a beat where it rests before it loops.
            for (let i = 0; i < REPLAY_FPS; i++) { xs.push(xs[xs.length - 1]); ys.push(ys[ys.length - 1]); }
        }
        const r = { key, ground: g, xs, ys };
        legReplays.set(k, r);
        return r;
    }
    function drawClearedLane(ctx, w, h, k, lane) {
        if (k < 0) return;
        const replay = legReplay(k);
        const g = replay.ground;
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
        // The run, played back on a loop (each leg a little out of step with the others).
        const i = Math.floor((performance.now() / 1000 * REPLAY_FPS + k * 37) % replay.xs.length);
        const bx = replay.xs[i];
        // Off the lane's right edge (rolled out past the crest): nothing to draw until it loops.
        if (Number.isFinite(bx) && bx <= from + span + 0.05) {
            ctx.fillStyle = c.text;
            ctx.beginPath();
            ctx.arc(((bx - from) / span) * w, Math.max(3, y(replay.ys[i])), 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        // The leg's own task line (it used to be a Scheduled tasks row in the lab): its name, the XP it trains by
        // itself and its laps. Small lanes (phones, camera copies) keep just the rate.
        if (lane !== hoverLane && w >= 40) {
            const rate = `+${E.format(E.legXpRate(state, k), 2)} XP/s`;
            const big = w >= 90 && h >= 70;
            ctx.textAlign = 'left';
            ctx.font = `600 ${big ? 10 : 8}px "JetBrains Mono", ui-monospace, monospace`;
            const pad = big ? 5 : 3;
            if (big) {
                ctx.fillStyle = 'rgba(3, 12, 10, 0.62)';
                ctx.fillRect(0, 0, w, 15);
                ctx.fillStyle = c.text;
                ctx.font = `600 10px "Chakra Petch", system-ui, sans-serif`;
                let name = E.skillAt(k).name;
                while (name.length > 3 && ctx.measureText(name).width > w - 2 * pad) name = name.slice(0, -2) + '…';
                ctx.fillText(name, pad, 11);
                ctx.font = `600 9px "JetBrains Mono", ui-monospace, monospace`;
            }
            ctx.fillStyle = c.success;
            ctx.fillText(big ? `${rate} · ×${Math.floor(state.path.auto[k] || 0)}` : rate, pad, big ? 25 : 9);
        }
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

    // Idle: after a minute without input, or while the window is in the background, the decorative CSS
    // animations (blinking LEDs, blades, scans) pause and the camera feeds refresh less often. Left open for
    // hours, they were most of the page's CPU.
    const IDLE_MS = 60000;
    let idleTimer = 0;
    let lastWake = 0;
    function watchIdle() {
        const wake = () => {
            const now = Date.now();
            if (now - lastWake < 1000 && !document.body.classList.contains('idle')) return;
            lastWake = now;
            // the playtest log notes a stretch with no input (a 24-minute gap in a log couldn't say: away, or stuck?)
            if (idleSince && !document.hidden) pt('idle', { s: Math.round((now - idleSince) / 1000), at: ptPlace() });
            idleSince = 0;
            document.body.classList.remove('idle');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(goIdle, IDLE_MS);
        };
        // idle since the last input (a blur counts from now)
        const goIdle = (from = lastWake) => {
            document.body.classList.add('idle');
            if (!idleSince) idleSince = from;
        };
        let idleSince = 0;
        for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus']) window.addEventListener(t, wake, { passive: true });
        window.addEventListener('blur', () => goIdle(Date.now()));
        wake();
    }
    const idle = () => document.body.classList.contains('idle');

    // ---- Init -----------------------------------------------------------

    function init() {
        // Full-height screens subtract the top bar, whose height changes as chips appear (page pixels).
        const topbar = document.querySelector('.topbar');
        new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)).observe(topbar);
        buildActions();
        buildBulk();
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
        buildSnare();
        buildTree();
        buildLegacy();
        buildRnd();
        buildAutoTrainer();
        buildTreeCamera();
        load();
        claimTab();
        syncSettings();
        E.evaluate(state); // silently restore unlocks implied by the loaded state
        render();
        document.documentElement.classList.add('booted');
        // Phones: the round ⌂ slides away while scrolling down and comes back on the way up (styles.css).
        let lastScroll = window.scrollY;
        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            const atEnd = y < 60 || y + window.innerHeight >= document.documentElement.scrollHeight - 40;
            if (atEnd || y < lastScroll - 6) document.body.classList.remove('fab-away');
            else if (y > lastScroll + 6) document.body.classList.add('fab-away');
            lastScroll = y;
        }, { passive: true });
        // The bay's bar height, for the trail's size on phones (it wraps to two rows when its buttons don't fit).
        const bayBar = document.querySelector('#moduleView .module-bar');
        if (bayBar) new ResizeObserver(() => document.documentElement.style.setProperty('--bay-bar-h', `${bayBar.offsetHeight || 39}px`)).observe(bayBar);   // the shell shows only once it's built (styles.css)
        lastTick = Date.now();
        setInterval(tick, TICK_MS);
        setTimeout(() => { revealReady = true; }, 1200);
        // Save whenever the page is hidden or closed; beforeunload is unreliable on mobile.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && state.settings.autosave) save();
            pt(document.hidden ? 'hidden' : 'shown');
            if (document.hidden) playtest?.flush();
        });
        pt('session', { build: E.BUILD, save: E.SAVE_VERSION, skills: state.path.learned, version: E.currentVersion(state),
            screen: `${innerWidth}x${innerHeight}`, touch: matchMedia('(pointer: coarse)').matches, at: playtestView = ptPlace() });
        playtestSample(true);
        watchIdle();
        if (notice) {
            const n = notice;
            notice = null;
            setTimeout(() => openDialog({ title: n.title, message: n.message, text: n.text, readonly: true, okLabel: 'Copy', cancelLabel: 'Close',
                onOk: area => { area.select(); navigator.clipboard?.writeText(n.text)?.catch(() => {}); } }), 400);
        }
        window.addEventListener('pagehide', () => { if (state.settings.autosave) save(); playtest?.flush(); });
        // A claude.ai artifact's viewer swaps in a republished page while it's open: save first and hand the save
        // across (load() prefers it), so an update mid-session loses nothing.
        try { window.claude?.hot?.snapshot?.(() => { save(); return { save: E.serialize(state) }; }); } catch { /* not in a viewer */ }
        keepAwake();
        snareRingSetting();
        buildMail();
    }

    // Mail (E.MAIL): the story by email. A brand-new game opens on an empty inbox that fills one unread mail at a
    // time (`introStep`): two junk mails, then the offer (someone you don't know wants an AI built: start with the
    // desk). Until the offer's Reply the inbox can't be closed (each email can): close the offer unanswered and a
    // new copy arrives (`WELCOME_NAGS`), a little pushier each time. Later mail arrives at story beats with a bump
    // and a count on the top bar's envelope, and so do the dilemmas (E.DILEMMAS: questions with choices, and the
    // consequences that follow them). The clicker start is on purpose: the AI isn't strong yet.
    // Story arrivals and every read live in `intro` (mail:id, mailRead:key, mailAccepted:welcome); the arrival order
    // and the dilemmas in `state.dilemmas`. All carry across versions.
    // The opening is over once the offer's accepted, or once the story has moved past it (debug jumps, imports,
    // saves from before the opening existed): only a brand-new game is ever locked in the inbox.
    const introDone = () => !!state.intro['mailAccepted:welcome'] || E.MAIL.some(m => !m.intro && state.intro['mail:' + m.id])
        || state.path.learned > 0 || state.prestige.count > 0;
    let mailReady = false;   // buildMail (the end of init) starts the opening, so a new game opens on it
    let mailOpen = null;     // the item on screen
    let welcomeNag = 0;      // times the offer was closed unanswered (screen state)
    let introTimer = 0;
    let arrived = null;      // the key of the row that just arrived, animated in
    let orderSeen = -1;      // how much of state.dilemmas.order has been announced
    const DILEMMA_TAG = 'Decision';
    // Copy n of the offer (0 the original): each refusal sends a spam variant (`E.WELCOME_NAGS`), the ones not
    // seen yet first, in order, then at random (never one of the last five again) until you say yes. Each one seen is
    // remembered (`nag:i` in intro), so all twenty earn The IT Department's Favorite (the owner's Easter egg).
    const nagSeq = [];
    const NAG_GAP = 5;
    function nextNag() {
        const n = E.WELCOME_NAGS.length;
        let i = E.WELCOME_NAGS.findIndex((_, k) => !state.intro['nag:' + k]);
        // Once all are seen, at random, but none comes back until at least NAG_GAP others have (the owner's call).
        if (i < 0) {
            const recent = new Set(nagSeq.slice(-NAG_GAP));
            const pool = E.WELCOME_NAGS.map((_, k) => k).filter(k => !recent.has(k));
            i = pool[Math.floor(Math.random() * pool.length)];
        }
        nagSeq.push(i);
        state.intro['nag:' + i] = true;
        return i;
    }
    const welcomeText = (m, n) => m.id === 'welcome' && n > 0 && nagSeq[n - 1] != null
        ? { ...m, ...E.WELCOME_NAGS[nagSeq[n - 1]] } : m;
    function storyArrive(m) {
        state.intro['mail:' + m.id] = true;
        E.mailArrive(state, 'm:' + m.id);
    }
    // Every mail as one item, oldest first: story mail (the opening's offer once per copy), dilemmas, consequences.
    function mailItems() {
        const order = state.dilemmas.order;
        const keys = [...E.MAIL.filter(m => state.intro['mail:' + m.id] && !order.includes('m:' + m.id)).map(m => 'm:' + m.id), ...order];
        const items = [];
        for (const key of keys) {
            const [kind, id] = [key[0], key.slice(2)];
            if (kind === 'm') {
                const m = E.MAIL.find(x => x.id === id);
                if (!m || !state.intro['mail:' + id]) continue;
                const copies = m.id === 'welcome' && !introDone() ? welcomeNag : 0;
                for (let n = 0; n <= copies; n++) {
                    const shown = { ...welcomeText(m, n), ...(m.variant ? m.variant(state) : {}) };
                    items.push({ key, copy: n, latest: n === copies, readKey: 'mailRead:' + id, ...shown,
                        body: [...shown.body, ...(m.extra ? m.extra(state) : [])], read: n < copies || !!state.intro['mailRead:' + id] });
                }
            } else if (kind === 'd') {
                const x = E.DILEMMAS.find(d => d.id === id);
                if (x) items.push({ key, latest: true, readKey: 'mailRead:' + key, ...x, reply: null, dilemma: x,
                    read: !!state.intro['mailRead:' + key], pending: state.dilemmas.open === id });
            } else if (kind === 'o') {
                const o = E.dilemmaOutcome(state, id);
                if (o) items.push({ key, latest: true, readKey: 'mailRead:' + key, ...o, read: !!state.intro['mailRead:' + key] });
            }
        }
        return items;
    }
    const mailUnread = () => mailItems().filter(i => !i.read).length;
    function deliverMail(silent) {
        if (!mailReady) return;
        for (const m of E.MAIL) {
            if (state.intro['mail:' + m.id] || m.intro || !m.when(state)) continue;
            storyArrive(m);
            if (silent) continue;
            pt('mail', { id: m.id });
            toast('New message', (m.variant ? m.variant(state) : m).subject, 'mail');
        }
        // Dilemmas and their consequences arrive in the engine's tick; announce what's new since last time.
        const order = state.dilemmas.order;
        if (orderSeen < 0 || silent) orderSeen = order.length;
        for (const key of order.slice(orderSeen)) {
            if (key[0] === 'm') continue;
            const item = mailItems().find(i => i.key === key);
            if (!item) continue;
            pt(key[0] === 'd' ? 'dilemma' : 'consequence', { id: key.slice(2) });
            toast('New message', item.subject, 'mail');
            log(`✉ ${item.subject}`, key[0] === 'd' ? 'special' : 'info');
            if ($('inbox').open && !mailOpen) { arrived = key; renderInbox(); }
        }
        orderSeen = order.length;
        renderMailButton();
    }
    function renderMailButton() {
        const n = mailUnread();
        setHidden($('mailCount'), !n);
        setText($('mailCount'), String(n));
        $('mailButton').classList.toggle('unread', n > 0);
        $('mailButton').classList.toggle('decision', !!state.dilemmas.open);
        // The count badge is decorative for assistive tech (aria-hidden); the name carries it instead.
        $('mailButton').setAttribute('aria-label', n ? `Inbox, ${n} unread` : 'Inbox');
    }
    // The × is the only close (owner's call): on an email it goes back to the list, on the list it closes the
    // inbox (not during the opening, which only the offer's reply ends).
    // A decision you've opened can't be closed until you choose (owner's call: ignoring is one of the choices).
    const deciding = () => !!mailOpen?.dilemma && state.dilemmas.answered[mailOpen.dilemma.id] === undefined;
    function renderInboxClose() {
        const onMail = !!mailOpen;
        setHidden($('inboxClose'), (!onMail && !introDone()) || deciding());
        $('inboxClose').setAttribute('aria-label', onMail ? 'Close this email' : 'Close the inbox');
    }
    function renderInbox() {
        mailOpen = null;
        const rows = mailItems().reverse().map(item => {
            const row = el('li', { class: `inbox-row${item.read ? '' : ' unread'}${item.pending ? ' decision' : ''}${item.key === arrived && item.latest ? ' arrive' : ''}` }, [
                el('button', { type: 'button', class: 'inbox-open' }, [
                    el('span', { class: 'inbox-from', text: item.from.replace(/\s*<.*$/, '') }),
                    el('span', { class: 'inbox-subject' }, [
                        ...(item.pending ? [el('span', { class: 'inbox-tag', text: DILEMMA_TAG })] : []),
                        document.createTextNode(item.subject)])])]);
            row.firstChild.addEventListener('click', () => openMail(item));
            return row;
        });
        arrived = null;
        $('inboxList').replaceChildren(...(rows.length ? rows : [el('li', { class: 'inbox-empty', text: 'No messages' })]));
        setHidden($('inboxList'), false);
        setHidden($('inboxMessage'), true);
        renderInboxClose();
        renderMailButton();
        introStep();
    }
    // The opening: once every mail so far is read and you're back on the list, the next one arrives a beat later.
    function introStep() {
        clearTimeout(introTimer);
        if (introDone() || !$('inbox').open) return;
        const next = E.MAIL.find(m => m.intro && !state.intro['mail:' + m.id]);
        if (!next || mailUnread()) return;
        introTimer = setTimeout(() => {
            if (mailOpen || !$('inbox').open) return;
            storyArrive(next);
            pt('mail', { id: next.id });
            arrived = 'm:' + next.id;
            sfx('ui');
            renderInbox();
            $('inboxList').querySelector('.inbox-open')?.focus({ preventScroll: true });
            save();
        }, E.MAIL.some(m => state.intro['mail:' + m.id]) ? 1100 : 700);
    }
    // A dilemma's choices, or the one you made.
    function renderChoices(item) {
        const box = $('mailChoices');
        const x = item.dilemma;
        if (!x) { box.replaceChildren(); setHidden(box, true); return; }
        const answered = state.dilemmas.answered[x.id];
        if (answered !== undefined) {
            box.replaceChildren(el('p', { class: 'mail-chosen' }, [el('span', { class: 'muted', text: 'You chose ' }), el('strong', { text: x.choices[answered].label })]));
        } else {
            box.replaceChildren(...x.choices.map((c, i) => {
                const b = el('button', { type: 'button', class: 'mail-choice' }, [el('strong', { text: c.label }), el('span', { text: c.hint })]);
                b.addEventListener('click', () => {
                    const r = E.chooseDilemma(state, x.id, i);
                    if (!r.ok) return;
                    pt('choice', { id: x.id, choice: i, label: c.label });
                    log(`${x.subject}: ${c.label}. ${r.msg}`, 'info');
                    sfx(r.text.length ? 'claim' : 'ui');
                    renderChoices(item);
                    renderInboxClose();
                    $('inboxClose').focus({ preventScroll: true });
                    renderMailButton();
                    afterChange();
                    save();
                });
                return b;
            }));
        }
        setHidden(box, false);
    }
    function openMail(item) {
        clearTimeout(introTimer);
        mailOpen = item;
        if (item.latest) state.intro[item.readKey] = true;
        pt('mailRead', { id: item.key, nag: item.copy || undefined });
        setText($('mailSubject'), item.subject);
        setText($('mailFrom'), item.from);
        $('mailBody').replaceChildren(...item.body.map(p => el('p', { text: p })));
        const footer = $('mailFooter');
        footer.replaceChildren(...(item.footer ? [document.createTextNode(item.footer + ' ')] : []));
        if (item.unsubscribe) {
            const link = el('button', { type: 'button', class: 'mail-unsub', text: 'Unsubscribe' });
            link.addEventListener('click', () => setText(link, 'Unsubscribe failed. We\'ll be in touch.'));
            footer.append(link);
        }
        setHidden(footer, !item.footer && !item.unsubscribe);
        renderChoices(item);
        // Only a reply (the offer's, until you've given it) gets a button: closing is the ×.
        const reply = item.reply && !state.intro['mailAccepted:welcome'] ? item.reply : '';
        setText($('mailReply'), reply);
        setHidden($('mailReply').parentElement, !reply);
        setHidden($('inboxList'), true);
        setHidden($('inboxMessage'), false);
        renderInboxClose();
        renderMailButton();
        save();
        ($('mailChoices').querySelector('button') || (reply ? $('mailReply') : $('inboxClose'))).focus({ preventScroll: true });
    }
    // Closing the offer without replying: a new copy arrives a beat later, a little different, and pops open.
    function leaveMail() {
        const item = mailOpen;
        renderInbox();
        if (item?.key !== 'm:welcome' || introDone()) return;
        clearTimeout(introTimer);
        introTimer = setTimeout(() => {
            if (mailOpen || !$('inbox').open || introDone()) return;
            const nag = nextNag();
            welcomeNag++;
            delete state.intro['mailRead:welcome'];
            pt('mailNag', { n: welcomeNag, nag });
            afterChange();   // The IT Department's Favorite, on the twentieth
            arrived = 'm:welcome';
            sfx('ui');
            renderInbox();
            introTimer = setTimeout(() => {
                if (mailOpen || !$('inbox').open) return;
                const latest = mailItems().find(i => i.key === 'm:welcome' && i.latest);
                if (latest) openMail(latest);
            }, 900);
        }, 1000);
    }
    function openInbox() {
        renderInbox();
        if (!$('inbox').open) $('inbox').showModal();
        introStep();
        // The same `v` field as every other view (it was `at`, which the report's time-by-screen read as "undefined").
        ptView('inbox');
        $('inboxList').querySelector('.inbox-open')?.focus({ preventScroll: true });
    }
    function buildMail() {
        const dialog = $('inbox');
        $('mailButton').addEventListener('click', openInbox);
        $('inboxClose').addEventListener('click', () => { if (deciding()) return; if (mailOpen) leaveMail(); else if (introDone()) dialog.close(); });
        $('mailReply').addEventListener('click', () => {
            if (mailOpen?.reply && mailOpen.key === 'm:welcome') {
                state.intro['mailAccepted:welcome'] = true;
                pt('mailAccepted', { id: 'welcome', nags: welcomeNag });
            }
            if (introDone()) dialog.close();
            else leaveMail();
        });
        // Escape does what the × does: back to the list from an email; no way out of the opening but the reply.
        dialog.addEventListener('cancel', e => {
            if (deciding()) e.preventDefault();
            else if (mailOpen) { e.preventDefault(); leaveMail(); } else if (!introDone()) e.preventDefault();
        });
        dialog.addEventListener('close', () => {
            clearTimeout(introTimer);
            mailOpen = null;
            save();
            ptView(ptPlace());   // back on the room under the inbox, so its time isn't counted as the inbox's
            if (state.stats.clicks === 0) ui.actions.compute?.button?.focus({ preventScroll: true });
        });
        // Older saves have been through the opening: its mails wait in the inbox, read. A game that hasn't accepted
        // the offer yet (a brand-new one, or reloaded mid-opening) opens on the inbox.
        const played = state.stats.clicks > 0 || state.stats.rolls > 0 || state.prestige.count > 0;
        if (played && !state.intro['mailAccepted:welcome']) {
            for (const m of E.MAIL.filter(m => m.intro)) state.intro['mail:' + m.id] = state.intro['mailRead:' + m.id] = true;
            state.intro['mailAccepted:welcome'] = true;
        }
        mailReady = true;
        // Review builds open straight into Packet Snare (the owner's call): the opening skipped, the bay opened as the
        // debug panel's Open Packet Snare does. Set by `window.AGI_SNARE_DIRECT` (the review artifact's index.html) or `#snare`.
        if (SNARE_DIRECT) {
            for (const m of E.MAIL.filter(m => m.intro)) state.intro['mail:' + m.id] = state.intro['mailRead:' + m.id] = true;
            state.intro['mailAccepted:welcome'] = true;
            deliverMail(true);
            straightToSnare();
            return;
        }
        deliverMail(true);
        if (!introDone()) openInbox();
    }
    // Packet Snare at once: the server room open, skills learned up to Edge Detection, then into the bay.
    function straightToSnare() {
        state.intro['mailAccepted:welcome'] = true;
        if ($('inbox').open) $('inbox').close();
        state.unlocked['module:path'] = true;
        for (let i = 0; i < 20 && !E.knows(state, 'Edge Detection'); i++) E.learnSkill(state, state.path.learned);
        Object.assign(path, { roll: null, done: false });
        dismissResult();
        snare.jumping = true;
        afterChange();
        setTimeout(() => { jumpTo('bay:pipeline'); setTimeout(() => { snare.jumping = false; }, 1500); }, 50);
    }

    // Keep screen on (touch devices, per device): an active game earns nothing while the screen sleeps, so on a
    // phone the screen stays on while the game is open and visible (a screen wake lock: requested on the first
    // touch, released when hidden, taken again when shown; hosts that refuse it are simply ignored).
    const AWAKE_KEY = 'agiAwake';
    const awakeWanted = () => (storageGet(AWAKE_KEY) ?? (matchMedia('(pointer: coarse)').matches ? '1' : '0')) === '1';
    let wakeLock = null;
    async function requestWake() {
        if (!awakeWanted() || wakeLock || document.hidden || !navigator.wakeLock) return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch { wakeLock = null; }
    }
    function snareRingSetting() {
        const box = $('settingSnareRing');
        if (!box) return;
        box.checked = snareRingOn();
        box.addEventListener('change', () => {
            storageSet(SNARE_RING_KEY, box.checked ? '1' : '0');
            pt('setting', { key: 'snareRing', value: box.checked });
        });
    }
    function keepAwake() {
        const box = $('settingAwake');
        box.checked = awakeWanted();
        box.addEventListener('change', () => {
            storageSet(AWAKE_KEY, box.checked ? '1' : '0');
            if (box.checked) requestWake();
            else wakeLock?.release().catch(() => {});
        });
        document.addEventListener('pointerdown', requestWake, { passive: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) requestWake(); });
    }

    document.addEventListener('DOMContentLoaded', init);

    // Hooks for debug-panel.js and the browser console.
    return {
        get state() { return state; },
        save: () => save(true),
        debug: {
            // The music: the area's other song, or the next section of this one (on the next downbeat).
            nextSong: () => window.SFX?.songCmd?.('song'),
            nextSection: () => window.SFX?.songCmd?.('section'),
            get song() { return window.SFX?.song || null; },
            rates: debugRates,
            income: debugIncome,
            add(path, amount) {
                const [group, key] = path.split('.');
                // Insight lives with the version (spendable and lifetime).
                if (key === 'insight') {
                    state.prestige.points += amount;
                    state.prestige.total += amount;
                } else if (key === 'signal') {
                    state.snare.signal += amount;
                } else {
                    state[group][key] += amount;
                    // Debug CP counts as earned, so it moves this run's shipping progress (R&D) too.
                    if (path === 'res.cp' && amount > 0) {
                        state.stats.runCp += amount;
                        state.stats.lifetimeCp += amount;
                    }
                }
                afterChange();
            },
            unlockAll() {
                E.MILESTONES.forEach(m => { state.unlocked[m.key] = true; });
                E.REVEALS.forEach(r => { state.unlocked[r.key] = true; });
                E.UPGRADES.forEach(u => { state.unlocked['up:' + u.id] = true; });
                afterChange();
            },
            // Wipe the save and start a brand-new game, no questions asked.
            // Lab cards that count as news on the lab's badge (new, or a capped card with more room).
            labNews: () => labUnseen().map(u => u.id),
            // The Auto-Trainer's ghost run, for the panel and tests.
            ghost() {
                const r = ghost.roll;
                return { on: ghostOn(), pause: r2(ghost.pause), leg: r ? r.leg : null, x: r ? r2(r.ball.x) : null, v: r ? r2(r.ball.v) : null,
                    launched: !!r?.launched, over: !!r?.over, pushesLeft: r ? r.pushesLeft : null, sprints: ghost.sprints, fumbles: ghost.fumbles, legs: ghost.legs, xp: r2(ghost.xp) };
            },
            // A brand-new game, from the inbox (no confirmation: the debug panel is the owner's).
            startOver() { startFresh('debugStartOver'); },
            // The Packet Snare run in play (tests and the debug view; read it, don't change it).
            snareRun: () => snare.run,
            // Where a field point is on screen (client px), for scripted play (tools, reviews): a turned field included.
            snareScreen: (x, y) => {
                const c = snare.canvas?.getBoundingClientRect(), z = uiScale();
                if (!c || !snare.run) return null;
                const [sx, sy] = snare.turned ? [(snare.run.h - y) * snare.scale, x * snare.scale] : [x * snare.scale, y * snare.scale];
                return { x: c.left + (sx + snare.ox) * z, y: c.top + (sy + snare.oy) * z };
            },
            // Packet Snare's boss: bring it into the run in play now, or clear the sector outright.
            snareBoss() {
                const r = snare.run;
                if (r && !r.over && !snare.preview && r.opts.boss && !r.boss && !r.bossDone) { r.opts.bossAt = 0; return; }
                // A goal sector in a run: its goal is met now (the run carries on into the next sector).
                if (r && !r.over && !snare.preview && r.opts.goal && !r.goalDone) { r.goalBonus += r.opts.goal; return; }
                if (E.isSnareBossSector(state.snare.sector)) E.snareBossDown(state);
                else E.snareGoalMet(state);
                buildSnareArt();
                afterChange();
            },
            // Packet Snare's tree, every node at its last level (Overclock at 5), and the sector to play (0-based, cleared
            // up to it): for reaching a late field and boss quickly.
            snareMax() {
                for (const up of E.SNARE_TREE) { state.levels[up.id] = up.endless ? 5 : up.max; state.unlocked['up:' + up.id] = true; }
                snare.done = null;
                if (openBay === 'pipeline' && !(snare.run && !snare.run.over && !snare.preview)) { snarePreview(); showSnareCard('start'); }
                afterChange();
            },
            // Packet Snare from scratch (the owner's call: replay a server-room game from its first level): Signal, the tree,
            // sectors, records and the saved layout cleared, and its first-meeting cards shown again. The rest of the game
            // stays where it is.
            resetSnare() {
                if (snare.run && !snare.run.over && !snare.preview) snare.run.stop();
                cancelAnimationFrame(snare.raf);
                snare.raf = 0;
                closeSnareTree();
                snareLive(false);
                Object.assign(snare, { run: null, done: null, fx: [], haul: 0, preview: false, pointer: null, sectorPick: null, cleared: [] });
                state.snare = E.defaultState().snare;
                for (const up of E.SNARE_TREE) { delete state.levels[up.id]; delete state.unlocked['up:' + up.id]; }
                for (const k of Object.keys(state.intro)) if (k.startsWith('snare:')) delete state.intro[k];
                buildSnareArt();
                if (openBay === 'pipeline') { snarePreview(); showSnareCard('start'); }
                log('Debug: Packet Snare reset to its first sector.', 'warning');
                afterChange();
            },
            // The Training Cluster from scratch: back to the warm-up with no skills, no XP and an empty skill tree (the
            // skills' attributes taken back). Legacy nodes, the lab and Packet Snare stay.
            resetTraining() {
                for (let i = 0; i < state.path.learned; i++) {
                    for (const [k, v] of Object.entries(E.skillAt(i).grants || {})) state.attr[k] = Math.max(0, state.attr[k] - v);
                }
                state.path = E.defaultState().path;
                state.res.xp = 0;
                Object.assign(state.stats, { rolls: 0, skillsLearned: 0, skilledSprints: 0 });
                for (const up of E.UPGRADES) if (up.tab === 'training' && !up.legacy) { delete state.levels[up.id]; delete state.unlocked['up:' + up.id]; }
                Object.assign(path, { roll: null, done: false, pause: 0, overview: 0, glow: null, summit: null, particles: [], tension: 0, focus: null, timeScale: 1, fx: freshFx(), startLeg: null });
                path.view = 'run';
                Object.assign(ghost, { roll: null, pause: 0 });
                dismissResult();
                log('Debug: the Training Cluster reset to the warm-up.', 'warning');
                afterChange();
            },
            // the threats a player has met before sector k (0-based): tools/review/kit.js `scenario`
            snareMetBefore(k) { return [...new Set(Array.from({ length: Math.max(0, k) }, (_, j) => snareBrings(j)).flat())]; },
            snareSector(k) {
                state.snare.sector = Math.max(0, Math.floor(k) || 0);
                snare.sectorPick = null;
                buildSnareArt();
                if (openBay === 'pipeline' && !(snare.run && !snare.run.over && !snare.preview)) showSnareCard(snare.done ? 'end' : 'start');
                afterChange();
            },
            openSnare: () => straightToSnare(),
            learnSkill() {
                if (E.actTwoLocked(state)) return;   // the demo's gate
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
                state.prestige.count = Math.max(state.prestige.count, phase.versions || 0);   // later phases need shipped versions
                for (let i = 0; i < 40 && E.phaseIndex(state) < index && !E.actTwoLocked(state); i++) E.learnSkill(state, state.path.learned);
                for (const [k, v] of Object.entries(phase.req)) state.attr[k] = Math.max(state.attr[k], v);
                Object.assign(path, { roll: null, done: false });
                dismissResult();
                afterChange();
            },
            // Buy every Training node to its max (XP-priced ones; the Auto-Trainer is separate).
            maxTree() {
                for (const up of E.UPGRADES.filter(u => u.tab === 'training' && u.cost.xp && u.max != null)) state.levels[up.id] = up.max;
                path.roll = null;
                afterChange();
            },
            toggleAutoTrainer() {
                const on = !E.autoTrainerLevel(state);
                state.prestige.levels.autoTrainer = on ? 3 : 0;
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
            // Endgame: open the challenges (three versions shipped), beat the running one, or make Transcend ready.
            openChallenges() {
                state.prestige.count = Math.max(E.CHALLENGES_AFTER, state.prestige.count);
                afterChange();
            },
            beatChallenge() {
                if (!state.challenge) return;
                state.attr.intelligence = Math.max(state.attr.intelligence, 25);
                afterChange();
            },
            readyTranscend() {
                state.prestige.count = Math.max(3, state.prestige.count);
                state.prestige.total = Math.max(state.prestige.total, 100);
                Object.assign(state.attr, { intelligence: Math.max(state.attr.intelligence, 300), creativity: Math.max(state.attr.creativity, 30), awareness: Math.max(state.attr.awareness, 30) });
                afterChange();
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
                    freezeTime(seconds);
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
                for (const up of E.UPGRADES.filter(u => isLabUpgrade(u) && E.isUpgradeVisible(state, u) && !E.isMaxed(state, u))) {
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
                const opts = { pushes: 1, cooldown: 1, friction: d.friction, hillScale: d.hillScale, strips: d.strips, inertia: d.inertia, last: r.ground.last };
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
                return { stretch: r.ground.stretch, x: r.ball.x, v: r.ball.v, airborne: r.airborne, height: r.height, leg: r.leg, launched: r.launched, over: r.over,
                    pushesLeft: r.pushesLeft, cooldown: r.ball.cooldown, atRest: r.atRest, progress: r.progress,
                    zone: currentZone(r), clean: r.clean || 0, charge: chargeLevel(),
                    slope: r.ground.slope(r.ball.x), crested: r.crested, tension: path.tension, timeScale: path.timeScale,
                    summit: !!path.summit, particles: path.particles.length, cam: path.cam && { ...path.cam } };
            },
            // Throw the ball into the air (late legs: test flights, bounces and the camera).
            fling(vx = 45, vy = 25) {
                if (openBay === 'training' && path.view !== 'run') showTrainingView('run');
                if (path.done) runAgain();
                const r = currentRoll();
                if (!r.launched) r.push(0.001);
                r.fly(vx, vy);
                startPathLoop();
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
                logProcurement(E.tick(state, seconds, debugRates));
                addDebugIncome(seconds);
                afterChange();
            },
            log
        }
    };
})();
