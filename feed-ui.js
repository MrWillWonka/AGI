// feed-ui.js — The Feed's screen (design/ring.md → The Feed; Build 1 of design/ring-build.md): draws the box of sand
// from feed.js's state (`AGI.state.feed`) and holds a point for the swarm while your finger or the mouse button is
// down (engine.js `feedPoint`). It knows no rules, and it doesn't step the pile: game.js's loop does (engine.js
// `feedStep`, so the swarm eats while you are elsewhere) and hands the events here (`FeedUI.events`).
// For now it is a full-screen dialog (the owner's pick) behind a test door: the debug panel (AGI.debug.openFeed) or
// #feed in the address. Its real door is an object on the desk (design/ring.md → Where the places live).
//
// The box always fits the screen, a whole number of pixels a cell. Sand is drawn a cell a pixel on a small canvas and
// scaled up with no smoothing, so it reads as grains: packets fall in their own colour (as Packet Snare draws them) and
// turn to sand where they land, each delivery its own colour, so the pile lies in strata like sand art.
(function () {
    'use strict';
    const POP_MS = 1800, SPARK_MS = 500;
    // Strata, in the order deliveries come (feed.js `bands`). Chosen to sit apart on the dark themes.
    const BANDS = ['#e8c07a', '#d98a5f', '#7fc8a9', '#6fa8dc', '#c9a0e8', '#e6dfc8'];
    let dlg = null, canvas = null, ctx = null, stage = null, promptEl = null, layerEl = null, mitesEl = null, researchEl = null, fragEl = null;
    let sand = null, sandCtx = null, image = null, palette = null;
    let raf = 0, view = { w: 0, h: 0, cell: 4, ox: 0, oy: 0 }, colors = {};
    let fragShown = -1, held = null, pops = [], sparks = [];

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
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    function build() {
        layerEl = el('span', { class: 'feed-stat' });
        mitesEl = el('span', { class: 'feed-stat' });
        researchEl = el('span', { class: 'feed-stat feed-research' });
        promptEl = el('div', { class: 'feed-prompt', 'aria-live': 'polite' });
        canvas = el('canvas', { class: 'feed-canvas', 'aria-label': 'The pile. Hold a point to lead the swarm there.' });
        stage = el('div', { class: 'feed-stage' }, canvas);
        fragEl = el('div', { class: 'feed-fragment' });
        dlg = el('dialog', { class: 'feed-screen', 'aria-label': 'The Feed' },
            el('div', { class: 'feed-bar' },
                el('span', { class: 'feed-title', text: 'The Feed' }), layerEl, mitesEl, researchEl,
                el('button', { type: 'button', class: 'ghost-button feed-close', 'aria-label': 'Close The Feed', text: '×', onclick: close })),
            promptEl, stage, fragEl);
        dlg.addEventListener('close', stop);
        canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; canvas.setPointerCapture?.(e.pointerId); held = e.pointerId; lead(e); });
        canvas.addEventListener('pointermove', e => { if (held === e.pointerId) lead(e); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => { if (held === e.pointerId) letGo(); });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        new ResizeObserver(resize).observe(stage);
        document.body.append(dlg);
        ctx = canvas.getContext('2d');
        sand = document.createElement('canvas');
        sand.width = F().FEED.w; sand.height = F().FEED.h;
        sandCtx = sand.getContext('2d');
        image = sandCtx.createImageData(sand.width, sand.height);
    }

    // ---- colours --------------------------------------------------------------------------------------------------
    // A CSS colour as [r, g, b], read back from a pixel so any form a theme uses works.
    function rgb(color) {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = color; x.fillRect(0, 0, 1, 1);
        const d = x.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
    }
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    function readColors() {
        const css = getComputedStyle(dlg), v = name => css.getPropertyValue(name).trim();
        colors = { bg: v('--bg'), border: v('--border'), text: v('--text'), muted: v('--muted'), gold: v('--warning'), good: v('--success'),
            research: v('--research'), primary: v('--primary'), mono: v('--font-mono') || 'monospace' };
        const bg = rgb(colors.bg), muted = rgb(colors.muted), bad = rgb(v('--snare-bad') || v('--danger'));
        palette = {
            bands: BANDS.map(rgb), gold: rgb(colors.gold), fragment: rgb(colors.text), falling: rgb(v('--snare-good') || colors.primary), fallingBad: bad,
            // Sand the model has no skill for: grey, cold. Garbled sand: the bad packets' colour, dark. Both read as "not for eating".
            numbers: [mix(bg, muted, 0.75), mix(bg, muted, 0.4)], pictures: [mix(bg, rgb(colors.primary), 0.5), mix(bg, muted, 0.45)],
            garbled: [mix(bg, bad, 0.6), mix(bg, bad, 0.3)]
        };
    }

    // ---- layout and input -----------------------------------------------------------------------------------------
    function resize() {
        if (!dlg?.open) return;
        const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const box = F().FEED, pad = 8;
        view.w = w; view.h = h;
        view.cell = Math.max(1, Math.floor(Math.min((w - pad * 2) / box.w, (h - pad * 2) / box.h) * dpr) / dpr);
        view.ox = Math.round((w - box.w * view.cell) / 2); view.oy = Math.round((h - box.h * view.cell) / 2);
    }
    // A pointer event's place in the box, in cells (the page may be zoomed, so by the canvas's own box).
    function cellAt(e) {
        const b = canvas.getBoundingClientRect();
        return { x: ((e.clientX - b.left) / b.width * view.w - view.ox) / view.cell, y: ((e.clientY - b.top) / b.height * view.h - view.oy) / view.cell };
    }
    function lead(e) { if (feed()) E().feedPoint(game(), cellAt(e)); }
    function letGo() { held = null; if (feed()) E().feedPoint(game(), null); }
    const px = (x, y) => [view.ox + x * view.cell, view.oy + y * view.cell];

    // ---- what happened (from game.js's loop) ------------------------------------------------------------------------
    function events(list) {
        if (!dlg?.open) return;
        const now = performance.now();
        for (const ev of list) {
            if (ev.type === 'eat') { if (ev.kind === 'vein' || ev.kind === 'fragment') sparks.push({ at: now, x: ev.x + 0.5, y: ev.y + 0.5, kind: ev.kind }); }
            else if (ev.type === 'fragment') pops.push({ at: now, text: `Fragment ${ev.found}/${ev.of}`, color: 'primary' });
            else if (ev.type === 'layer') {
                pops.push({ at: now, text: `Layer ${ev.layer} digested · +${E().format(ev.pay)} research`, color: 'research', big: true });
                if (ev.mite) pops.push({ at: now + 500, text: `The swarm grows · ${plural(ev.mites, 'mite', 'mites')}`, color: 'good' });
            }
        }
        if (sparks.length > 60) sparks.splice(0, sparks.length - 60);
    }

    // ---- drawing --------------------------------------------------------------------------------------------------
    function drawSand(f, now) {
        const lib = F(), { w, h, cells } = f, data = image.data, blink = reduced() ? 1 : 0.6 + 0.4 * Math.sin(now / 160);
        for (let i = 0, p = 0; i < cells.length; i++, p += 4) {
            const v = cells[i];
            if (!v) { data[p + 3] = 0; continue; }
            const kind = lib.KIND_IDS[lib.kindOf(v)], x = i % w, y = (i - x) / w;
            const falling = y < h - 1 && !cells[i + w];
            const shade = 0.9 + ((i * 2654435761 >>> 0) % 21) / 100;   // each grain a touch lighter or darker, the same every frame
            let c;
            if (kind === 'garbled') c = falling ? palette.fallingBad : palette.garbled[(x + y * 3 + (i >> 3)) & 1];
            else if (falling) c = palette.falling;
            else if (kind === 'plain') c = palette.bands[lib.bandOf(v) % palette.bands.length];
            else if (kind === 'vein') c = palette.gold;
            else if (kind === 'fragment') c = palette.fragment;
            else if (f.readable.includes(kind)) c = mix(palette.bands[lib.bandOf(v) % palette.bands.length], palette.fragment, 0.35);
            else c = kind === 'numbers' ? palette.numbers[(x + y) & 1] : palette.pictures[x & 1];
            const k = kind === 'fragment' ? blink : kind === 'vein' ? 1 : shade;
            data[p] = Math.min(255, c[0] * k); data[p + 1] = Math.min(255, c[1] * k); data[p + 2] = Math.min(255, c[2] * k); data[p + 3] = 255;
        }
        sandCtx.putImageData(image, 0, 0);
    }
    function draw(now) {
        const f = feed(); if (!f || !palette) return;
        const box = F().FEED, c = view.cell, still = reduced();
        ctx.clearRect(0, 0, view.w, view.h);
        // The box: two walls and a floor, open at the top, with the spout's mouth over the middle.
        const [x0, y0] = px(0, 0), bw = box.w * c, bh = box.h * c;
        ctx.strokeStyle = colors.border; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0 - 1, y0); ctx.lineTo(x0 - 1, y0 + bh + 1); ctx.lineTo(x0 + bw + 1, y0 + bh + 1); ctx.lineTo(x0 + bw + 1, y0); ctx.stroke();
        const mouth = (box.spout + 2) * c;
        ctx.beginPath(); ctx.moveTo(x0 + bw / 2 - mouth, y0 - 1); ctx.lineTo(x0 + bw / 2 - mouth * 0.6, y0 + c * 1.5); ctx.moveTo(x0 + bw / 2 + mouth, y0 - 1); ctx.lineTo(x0 + bw / 2 + mouth * 0.6, y0 + c * 1.5); ctx.stroke();
        drawSand(f, now);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sand, x0, y0, bw, bh);
        // Sparks where gold or a fragment was eaten.
        sparks = sparks.filter(s => now - s.at < SPARK_MS);
        for (const s of sparks) {
            const age = (now - s.at) / SPARK_MS, [x, y] = px(s.x, s.y);
            ctx.globalAlpha = 1 - age; ctx.strokeStyle = s.kind === 'vein' ? colors.gold : colors.text; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, c * (1 + age * 3), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The point you hold.
        if (f.aim) {
            const [x, y] = px(f.aim.x, f.aim.y), r = c * F().FEED.near;
            ctx.strokeStyle = colors.good; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        // The swarm.
        const r = Math.max(3, Math.min(7, c * 0.9));
        f.swarm.forEach((m, n) => {
            let [x, y] = px(m.x, m.y);
            if (!still) { x += Math.cos(now / 90 + n * 2.4) * c * 0.35; y += Math.sin(now / 70 + n * 1.7) * c * 0.35; }
            ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colors.good; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.2, r * 0.32, 0, Math.PI * 2); ctx.fill();
        });
        // Pops: what a layer paid, a fragment found.
        pops = pops.filter(p => now - p.at < POP_MS);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let row = 0;
        for (const p of pops) {
            const age = (now - p.at) / POP_MS; if (age < 0) continue;
            ctx.globalAlpha = Math.min(1, (1 - age) * 3);
            ctx.font = `700 ${p.big ? 17 : 14}px ${colors.mono}`;
            const y = 26 + row++ * 26 - (still ? 0 : age * 8), w = Math.min(view.w - 16, ctx.measureText(p.text).width + 20);
            ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.roundRect(view.w / 2 - w / 2, y - 12, w, 24, 8); ctx.fill();
            ctx.fillStyle = colors[p.color]; ctx.fillText(p.text, view.w / 2, y, view.w - 28);
        }
        ctx.globalAlpha = 1;
    }

    // ---- the words round the pile ---------------------------------------------------------------------------------
    function prompt() {
        const f = feed(), lib = F();
        if (!f.stats.delivered) return '> Nothing to eat yet.';
        if (lib.left(f) === 0) return '> It is still hungry.';
        if (!f.stats.eaten && !f.stats.cleaned && !f.aim) return '> Show it where to start.';
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
        text(promptEl, prompt());
        const found = (f.fragments.parcel || []).length;
        if (found !== fragShown) { fragShown = found; renderFragment(); }
        draw(now);
    }

    function open() {
        if (!F() || !game()) return;
        if (!dlg) build();
        if (dlg.open) return;
        dlg.showModal();
        readColors(); pops = []; sparks = []; held = null; fragShown = -1;
        resize();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; if (held !== null) letGo(); }
    function close() { if (dlg?.open) { dlg.close(); stop(); } }

    window.FeedUI = { open, close, events, get isOpen() { return !!(dlg && dlg.open); }, get view() { return view; }, px };
    if (location.hash === '#feed') window.addEventListener('load', () => setTimeout(open, 600));
})();
