// feed-ui.js — The Feed's screen (design/ring.md → The Feed; Build 1 of design/ring-build.md): draws the heap from
// feed.js's state (`AGI.state.feed`), turns a drag into a pointed line (engine.js `feedPoint`), and shows what the
// swarm uncovers. It knows no rules, and it doesn't step the heap: game.js's loop does (engine.js `feedStep`, so the
// swarm grazes while you are elsewhere) and hands the events here (`FeedUI.events`).
// For now it is a full-screen dialog (the owner's pick) behind a test door: the debug panel (AGI.debug.openFeed) or
// #feed in the address. Where its real door goes waits on the owner's call about where the five places live.
//
// The heap: a layer always fits the screen until its tiles would be smaller than a finger can point at (`MIN_TILE`);
// past that the tiles keep their size and the layer is panned (the owner's pick: later layers are explored). One
// finger (or the left button) draws the line; two fingers, the right button or the wheel pan.
(function () {
    'use strict';
    const MIN_TILE = { coarse: 34, fine: 26 }, MAX_TILE = 64, GAP = 0.1, FLASH_MS = 650, POP_MS = 1800;
    let dlg = null, canvas = null, ctx = null, stage = null, promptEl = null, layerEl = null, mitesEl = null, researchEl = null, fragEl = null;
    let raf = 0, view = { w: 0, h: 0, tile: 40, ox: 0, oy: 0, camX: 0, camY: 0, panX: false, panY: false }, colors = {};
    let fragShown = -1, drag = null, pan = null, pointers = new Map(), flashes = new Map(), pops = [], said = '', saidUntil = 0, seenLayer = -1;

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
    const F = () => window.Feed, E = () => window.AGIEngine, game = () => window.AGI?.state;
    const feed = () => game()?.feed;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = () => matchMedia('(pointer: coarse)').matches;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    function build() {
        layerEl = el('span', { class: 'feed-stat' });
        mitesEl = el('span', { class: 'feed-stat' });
        researchEl = el('span', { class: 'feed-stat feed-research' });
        promptEl = el('div', { class: 'feed-prompt', 'aria-live': 'polite' });
        canvas = el('canvas', { class: 'feed-canvas', 'aria-label': 'The heap. Drag across it to show the swarm where to eat.' });
        stage = el('div', { class: 'feed-stage' }, canvas);
        fragEl = el('div', { class: 'feed-fragment' });
        dlg = el('dialog', { class: 'feed-screen', 'aria-label': 'The Feed' },
            el('div', { class: 'feed-bar' },
                el('span', { class: 'feed-title', text: 'The Feed' }), layerEl, mitesEl, researchEl,
                el('button', { type: 'button', class: 'ghost-button feed-close', 'aria-label': 'Close The Feed', text: '×', onclick: close })),
            promptEl, stage, fragEl);
        dlg.addEventListener('close', stop);
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, up);
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('wheel', e => { e.preventDefault(); panBy(-e.deltaX, -e.deltaY); }, { passive: false });
        new ResizeObserver(resize).observe(stage);
        document.body.append(dlg);
        ctx = canvas.getContext('2d');
    }

    // ---- layout ---------------------------------------------------------------------------------------------------
    function readColors() {
        const css = getComputedStyle(dlg), v = name => css.getPropertyValue(name).trim();
        colors = { bg: v('--bg'), panel: v('--panel-2'), border: v('--border'), text: v('--text'), muted: v('--muted'),
            gold: v('--warning'), good: v('--success'), research: v('--research'), primary: v('--primary'),
            mono: v('--font-mono') || 'monospace' };
    }
    function resize() {
        if (!dlg?.open) return;
        const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        view.w = w; view.h = h;
        layout();
    }
    // The tile size and where the layer sits: fitted to the stage, never smaller than a finger can point at.
    function layout() {
        const f = feed(); if (!f || !view.w) return;
        const g = F().grid(f), pad = 10;
        const fit = Math.min((view.w - pad * 2) / g.cols, (view.h - pad * 2) / g.rows);
        view.tile = Math.max(coarse() ? MIN_TILE.coarse : MIN_TILE.fine, Math.min(MAX_TILE, fit));
        const gw = g.cols * view.tile, gh = g.rows * view.tile;
        view.panX = gw > view.w - pad * 2 + 0.5; view.panY = gh > view.h - pad * 2 + 0.5;
        view.ox = view.panX ? pad : (view.w - gw) / 2; view.oy = view.panY ? pad : (view.h - gh) / 2;
        view.maxX = Math.max(0, gw + pad * 2 - view.w); view.maxY = Math.max(0, gh + pad * 2 - view.h);
        panBy(0, 0);
    }
    function panBy(dx, dy) {
        view.camX = Math.max(0, Math.min(view.maxX || 0, view.camX - dx));
        view.camY = Math.max(0, Math.min(view.maxY || 0, view.camY - dy));
    }
    const centre = i => { const f = feed(), c = F().cellOf(f, i); return [view.ox - view.camX + (c.c + 0.5) * view.tile, view.oy - view.camY + (c.r + 0.5) * view.tile]; };
    // A pointer event's place on the canvas in its own pixels (the page may be zoomed), and the slot under it.
    function at(e) {
        const box = canvas.getBoundingClientRect();
        return [(e.clientX - box.left) / box.width * view.w, (e.clientY - box.top) / box.height * view.h];
    }
    function slotAt([x, y]) {
        const f = feed();
        return F().indexOf(f, Math.floor((x - view.ox + view.camX) / view.tile), Math.floor((y - view.oy + view.camY) / view.tile));
    }

    // ---- input ----------------------------------------------------------------------------------------------------
    function down(e) {
        if (!feed()) return;
        canvas.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId, at(e));
        if (pointers.size >= 2 || e.button === 2) { drag = null; pan = { last: mid() }; return; }
        if (e.button !== 0) return;
        drag = { id: e.pointerId, cells: [] };
        extend(at(e));
    }
    function move(e) {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, at(e));
        if (pan) { const m = mid(); panBy(m[0] - pan.last[0], m[1] - pan.last[1]); pan.last = m; return; }
        if (drag && drag.id === e.pointerId) extend(at(e));
    }
    function up(e) {
        pointers.delete(e.pointerId);
        if (drag && drag.id === e.pointerId) drag = null;
        if (pan) pan = pointers.size ? { last: mid() } : null;
    }
    const mid = () => { const ps = [...pointers.values()]; return [ps.reduce((n, p) => n + p[0], 0) / ps.length, ps.reduce((n, p) => n + p[1], 0) / ps.length]; };
    // The drag so far is the line: the swarm starts on it at once, and takes more of it as it eats (feed.js keeps the
    // first `lineMax` tiles still uneaten).
    function extend(p) {
        const i = slotAt(p), f = feed();
        if (i < 0 || !f.tiles[i] || f.tiles[i].e || drag.cells.includes(i)) return;
        drag.cells.push(i);
        repoint();
    }
    function repoint() { if (drag && feed()) E().feedPoint(game(), drag.cells); }

    // ---- what happened (from game.js's loop) ------------------------------------------------------------------------
    function events(list) {
        if (!dlg?.open) return;
        const now = performance.now();
        for (const ev of list) {
            if (ev.type === 'eat') flashes.set(ev.cell, { at: now, kind: ev.kind });
            else if (ev.type === 'locked') say(`> Unreadable. It hasn't learned ${ev.kind} yet.`, 3500);
            else if (ev.type === 'fragment') { pops.push({ at: now, text: `Fragment ${ev.found}/${ev.of}`, color: 'primary' }); renderFragment(); }
            else if (ev.type === 'layer') {
                flashes.clear(); drag = null; view.camX = view.camY = 0;
                pops.push({ at: now, text: `Layer ${ev.layer} digested · +${E().format(ev.pay)} research`, color: 'research', big: true });
                if (ev.mite) pops.push({ at: now + 500, text: `The swarm grows · ${plural(ev.mites, 'mite', 'mites')}`, color: 'good' });
                layout();
            }
        }
        if (drag) repoint();
    }
    function say(text, ms) { said = text; saidUntil = performance.now() + ms; }

    // ---- drawing --------------------------------------------------------------------------------------------------
    const GLYPH = { numbers: i => String((i * 7 + 3) % 10), pictures: () => '▦' };
    const letter = i => 'etaoinshrdlucmfw'[(i * 5 + 1) % 16];
    function box(x, y, s, r) { ctx.beginPath(); ctx.roundRect(x, y, s, s, r); }
    function draw(now) {
        const f = feed(); if (!f) return;
        if (f.layers !== seenLayer) { seenLayer = f.layers; layout(); }
        const t = view.tile, gap = Math.max(1.5, t * GAP), s = t - gap, r = Math.max(2, t * 0.16), lib = F();
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < f.size; i++) {
            const [cx, cy] = centre(i);
            if (cx < -t || cy < -t || cx > view.w + t || cy > view.h + t) continue;
            const x = cx - s / 2, y = cy - s / 2, tile = f.tiles[i];
            if (!tile || tile.e) {
                const flash = tile && flashes.get(i), age = flash ? (now - flash.at) / FLASH_MS : 1;
                ctx.globalAlpha = 0.35; ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
                box(x, y, s, r); ctx.stroke(); ctx.globalAlpha = 1;
                if (flash && age < 1) {
                    ctx.globalAlpha = 1 - age;
                    ctx.fillStyle = flash.kind === 'vein' ? colors.gold : flash.kind === 'fragment' ? colors.primary : colors.text;
                    ctx.font = `700 ${Math.round(s * 0.55)}px ${colors.mono}`;
                    ctx.fillText(flash.kind === 'vein' ? '◆' : flash.kind === 'fragment' ? '✉' : GLYPH[flash.kind] ? GLYPH[flash.kind](i) : letter(i), cx, cy - age * s * 0.25);
                    ctx.globalAlpha = 1;
                } else if (flash) flashes.delete(i);
                continue;
            }
            const locked = tile.s && lib.KINDS[tile.k].skill && !f.readable.includes(tile.k);
            ctx.fillStyle = colors.panel; box(x, y, s, r); ctx.fill();
            ctx.strokeStyle = colors.border; ctx.lineWidth = 1; ctx.stroke();
            if (tile.s && tile.k === 'vein') {
                ctx.strokeStyle = colors.gold; ctx.lineWidth = Math.max(2, t * 0.07); box(x + 1, y + 1, s - 2, r); ctx.stroke();
                ctx.fillStyle = colors.gold; ctx.font = `700 ${Math.round(s * 0.42)}px ${colors.mono}`; ctx.fillText('◆', cx, cy);
            } else if (locked) {
                ctx.globalAlpha = 0.55; ctx.setLineDash([3, 3]); ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.5; box(x + 1, y + 1, s - 2, r); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = colors.muted; ctx.font = `700 ${Math.round(s * 0.5)}px ${colors.mono}`; ctx.fillText(GLYPH[tile.k](i), cx, cy); ctx.globalAlpha = 1;
            } else {
                // Face down: garbled marks, the same for a slot every frame.
                ctx.fillStyle = colors.muted; ctx.globalAlpha = 0.45;
                for (let k = 0; k < 3; k++) { const w = s * (0.25 + ((i * 13 + k * 7) % 5) * 0.08); ctx.fillRect(cx - s * 0.3, cy - s * 0.22 + k * s * 0.2, w, Math.max(1.5, s * 0.07)); }
                ctx.globalAlpha = 1;
            }
            // Bitten into: a corner eaten away for each bite taken.
            const full = lib.bitesFor(tile.q), taken = full - tile.b;
            if (taken > 0) { ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.arc(x + s, y, s * 0.55 * (taken / full) + s * 0.12, 0, Math.PI * 2); ctx.save(); box(x, y, s, r); ctx.clip(); ctx.fill(); ctx.restore(); }
        }
        // Your line, front first.
        const line = f.line.filter(i => f.tiles[i] && !f.tiles[i].e);
        if (line.length) {
            ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = colors.good;
            for (const [width, alpha] of [[t * 0.5, 0.18], [Math.max(2, t * 0.09), 0.9]]) {
                ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.beginPath();
                line.forEach((i, n) => { const [x, y] = centre(i); if (n) ctx.lineTo(x, y); else { ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); } });
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        // The swarm: a mite on each tile being eaten; the rest wait in the middle.
        const work = lib.working(f), still = reduced(), mite = Math.max(3, Math.min(7, t * 0.14));
        for (let m = 0; m < f.mites; m++) {
            const wob = still ? 0 : now / 90 + m * 2.4;
            let [x, y] = m < work.length ? centre(work[m]) : [view.w / 2 + Math.cos(m * 2.4 + (still ? 0 : now / 1400)) * (14 + m * 5), view.h / 2 + Math.sin(m * 2.4 + (still ? 0 : now / 1400)) * (10 + m * 4)];
            if (m < work.length) { x += Math.cos(wob) * t * 0.16; y += Math.sin(wob * 1.3) * t * 0.16; }
            ctx.fillStyle = colors.good; ctx.beginPath(); ctx.arc(x, y, mite, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.arc(x + mite * 0.35, y - mite * 0.2, mite * 0.32, 0, Math.PI * 2); ctx.fill();
        }
        // Pops: what a layer paid, a fragment found.
        pops = pops.filter(p => now - p.at < POP_MS);
        let row = 0;
        for (const p of pops) {
            const age = (now - p.at) / POP_MS; if (age < 0) continue;
            ctx.globalAlpha = Math.min(1, (1 - age) * 3);
            ctx.font = `700 ${p.big ? 17 : 14}px ${colors.mono}`;
            const y = 26 + row++ * 24 - (still ? 0 : age * 8), w = Math.min(view.w - 16, ctx.measureText(p.text).width + 20);
            ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.roundRect(view.w / 2 - w / 2, y - 12, w, 24, 8); ctx.fill();
            ctx.fillStyle = colors[p.color]; ctx.fillText(p.text, view.w / 2, y, view.w - 28);
        }
        ctx.globalAlpha = 1;
    }

    // ---- the words round the heap ---------------------------------------------------------------------------------
    function prompt(now) {
        const f = feed(), lib = F();
        if (now < saidUntil) return said;
        if (!f.stats.delivered) return '> Nothing to eat yet.';
        if (lib.left(f) === 0) return '> It is still hungry.';
        if (!f.stats.eaten && !f.line.length) return '> Show it where to start.';
        if ((view.panX || view.panY) && !f.line.length) return coarse() ? '> Two fingers move the heap.' : '> The wheel or the right button moves the heap.';
        return '';
    }
    // The fragment set as found so far: the parcel spam's own words (engine.js MAIL), cut into as many scraps as pieces.
    function renderFragment() {
        const f = feed(), set = 'parcel', of = F().FRAGMENTS[set].pieces, found = f.fragments[set] || [];
        const mail = (E().MAIL || []).find(m => m.id === set);
        const words = mail ? [mail.subject, ...(mail.body || [])].join(' ').split(/\s+/) : [];
        const per = Math.max(1, Math.min(9, Math.floor(words.length / of)));
        const scraps = Array.from({ length: of }, (_, n) => (found.includes(n) && words.length ? words.slice(n * per, n * per + per).join(' ') : '░░░░░░'));
        fragEl.replaceChildren(el('span', { class: 'feed-fragment-count', text: `Fragment ${found.length}/${of}` }),
            ...scraps.map((text, n) => el('span', { class: found.includes(n) ? 'feed-scrap found' : 'feed-scrap', text })));
        fragEl.classList.toggle('none', !found.length);
    }
    function text(node, value) { if (node.textContent !== value) node.textContent = value; }
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const f = feed(); if (!f) return;
        text(layerEl, `Layer ${f.layers + 1}`);
        text(mitesEl, plural(f.mites, 'mite', 'mites'));
        text(researchEl, `${E().format(Math.floor(game().res.rp))} research`);
        text(promptEl, prompt(now));
        const found = (f.fragments.parcel || []).length;
        if (found !== fragShown) { fragShown = found; renderFragment(); }
        draw(now);
    }

    function open() {
        if (!F() || !game()) return;
        if (!dlg) build();
        if (dlg.open) return;
        dlg.showModal();
        readColors(); seenLayer = -1; flashes.clear(); pops = []; said = ''; saidUntil = 0; drag = pan = null; pointers.clear();
        resize(); fragShown = -1;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; drag = pan = null; pointers.clear(); }
    function close() { if (dlg?.open) { dlg.close(); stop(); } }

    window.FeedUI = { open, close, events, get isOpen() { return !!(dlg && dlg.open); }, get view() { return view; }, centre };
    if (location.hash === '#feed') window.addEventListener('load', () => setTimeout(open, 600));
})();
