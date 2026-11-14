// feed-ui.js — The Feed's screen (design/ring.md → The Feed; Build 1 of design/ring-build.md): draws the box of sand
// from feed.js's state (`AGI.state.feed`) and holds a point for the swarm while your finger or the mouse button is
// down (engine.js `feedPoint`). It knows no rules, and it doesn't step the pile: game.js's loop does (engine.js
// `feedStep`, so the swarm eats while you are elsewhere) and hands the events here (`FeedUI.events`).
// For now it is a full-screen dialog (the owner's pick) behind a test door: the debug panel (AGI.debug.openFeed) or
// #feed in the address. Its real door is an object on the desk (design/ring.md → Where the places live). While it is
// behind the test door it carries its own row of test buttons (the debug panel can't be reached under a dialog).
//
// **The view starts close and draws back** (the owner's call): it frames the pile, floor at the bottom, and widens as
// the pile grows until the whole box shows. Sand is drawn three pixels a cell on a small canvas, each grain with its
// corners faded so it reads round, and scaled up. Packets fall in their own colour (as Packet Snare draws them) and
// turn to sand where they land, each delivery its own colour, so the pile lies in strata like sand art. Gold and
// fragments look like the sand round them until a mite's lamp has found them (feed.js `seenOf`).
(function () {
    'use strict';
    const POP_MS = 1800, SPARK_MS = 500, SUB = 3, MIN_COLS = 40, MARGIN = 6, EASE = 0.07;
    // Strata, in the order deliveries come (feed.js `bands`). Chosen to sit apart on the dark themes.
    const BANDS = ['#e8c07a', '#d98a5f', '#7fc8a9', '#6fa8dc', '#c9a0e8', '#e6dfc8'];
    const TESTS = [['+40', [1, 40, 4]], ['+75 dirty', [2, 75, 6, 10]], ['+200 dirty', [4, 200, 15, 20, 20]]];
    let dlg = null, canvas = null, ctx = null, stage = null, promptEl = null, layerEl = null, mitesEl = null, researchEl = null, fragEl = null;
    let sand = null, sandCtx = null, image = null, pixels = null, palette = null;
    // The window on the box, in cells: `cols` × `rows` from (`x`, `y`), a cell `cell` px, drawn from (`ox`, `oy`).
    let view = { w: 0, h: 0, x: 0, y: 0, cols: 0, rows: 0, cell: 4, ox: 0, oy: 0, want: null };
    let raf = 0, frames = 0, colors = {}, fragShown = -1, held = null, pops = [], sparks = [];

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
        const debug = window.AGI?.debug;
        const tests = el('div', { class: 'feed-test', 'aria-label': 'Testing' },
            el('span', { class: 'feed-test-label', text: 'Test' }),
            ...TESTS.map(([label, args]) => el('button', { type: 'button', class: 'ghost-button', text: label, onclick: () => debug?.feedDeliver(...args) })),
            el('button', { type: 'button', class: 'ghost-button', text: 'Empty', onclick: () => { debug?.resetFeed(); fragShown = -1; view.want = null; } }));
        dlg = el('dialog', { class: 'feed-screen', 'aria-label': 'The Feed' },
            el('div', { class: 'feed-bar' },
                el('span', { class: 'feed-title', text: 'The Feed' }), layerEl, mitesEl, researchEl,
                el('button', { type: 'button', class: 'ghost-button feed-close', 'aria-label': 'Close The Feed', text: '×', onclick: close })),
            tests, promptEl, stage, fragEl);
        dlg.addEventListener('close', stop);
        canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; canvas.setPointerCapture?.(e.pointerId); held = e.pointerId; lead(e); });
        canvas.addEventListener('pointermove', e => { if (held === e.pointerId) lead(e); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => { if (held === e.pointerId) letGo(); });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        new ResizeObserver(resize).observe(stage);
        document.body.append(dlg);
        ctx = canvas.getContext('2d');
        sand = document.createElement('canvas');
        sand.width = F().FEED.w * SUB; sand.height = F().FEED.h * SUB;
        sandCtx = sand.getContext('2d');
        image = sandCtx.createImageData(sand.width, sand.height);
        pixels = new Uint32Array(image.data.buffer);
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
    // A colour as the two pixel words a grain is drawn with (little-endian ABGR): its body, and its faded corners.
    const words = (c, k = 1) => { const r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0, base = (b << 16) | (g << 8) | r; return [(0xFF000000 | base) >>> 0, (0xB4000000 | base) >>> 0]; };
    // Each colour in five shades, so grains differ a little and the same grain is the same every frame.
    const shades = c => [0.9, 0.95, 1, 1.05, 1.1].map(k => words(c, k));
    function readColors() {
        const css = getComputedStyle(dlg), v = name => css.getPropertyValue(name).trim();
        colors = { bg: v('--bg'), border: v('--border'), text: v('--text'), muted: v('--muted'), gold: v('--warning'), good: v('--success'),
            research: v('--research'), primary: v('--primary'), mono: v('--font-mono') || 'monospace' };
        const bg = rgb(colors.bg), muted = rgb(colors.muted), bad = rgb(v('--snare-bad') || v('--danger')), text = rgb(colors.text);
        const bands = BANDS.map(rgb);
        palette = {
            bands: bands.map(shades), known: bands.map(c => shades(mix(c, text, 0.35))), gold: shades(rgb(colors.gold)), fragment: text,
            falling: shades(rgb(v('--snare-good') || colors.primary)), fallingBad: shades(bad),
            // Sand the model has no skill for: grey, cold. Garbled sand: the bad packets' colour, dark. Both read as "not for eating".
            numbers: [shades(mix(bg, muted, 0.75)), shades(mix(bg, muted, 0.4))], pictures: [shades(mix(bg, rgb(colors.primary), 0.5)), shades(mix(bg, muted, 0.45))],
            garbled: [shades(mix(bg, bad, 0.62)), shades(mix(bg, bad, 0.32))]
        };
    }

    // ---- layout and input -----------------------------------------------------------------------------------------
    function resize() {
        if (!dlg?.open) return;
        const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        view.w = w; view.h = h; view.want = null;
    }
    // The window the pile asks for: all of the pile with room round it and the floor at the bottom, never closer than
    // `MIN_COLS` cells across, never wider or taller than the box.
    function frame(f) {
        const box = F().FEED, { w, h, cells } = f;
        let minX = w, maxX = -1, top = h;
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i] || (i + w < cells.length && !cells[i + w])) continue;   // empty, or still falling
            const x = i % w, y = (i - x) / w;
            if (y < top) top = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
        const pad = 8, aspect = (view.w - pad * 2) / (view.h - pad * 2);
        const reach = maxX < 0 ? 0 : Math.max(w / 2 - minX, maxX + 1 - w / 2) * 2;   // the pile's width about the spout's line
        let cols = Math.max(MIN_COLS, reach + MARGIN * 2), rows = Math.max(h - top + MARGIN * 2, cols / aspect);
        rows = Math.min(box.h, rows); cols = Math.min(box.w, Math.max(cols, rows * aspect));
        return { cols, rows };
    }
    function settle(f, snap) {
        const box = F().FEED, pad = 8;
        if (!view.want || frames % 8 === 0) view.want = frame(f);
        const k = snap || reduced() || !view.cols ? 1 : EASE;
        view.cols += (view.want.cols - view.cols) * k; view.rows += (view.want.rows - view.rows) * k;
        view.cell = Math.min((view.w - pad * 2) / view.cols, (view.h - pad * 2) / view.rows);
        // Show as much of the box as the stage has room for at that size, the floor at the bottom, the spout's line in the middle.
        const cols = Math.min(box.w, (view.w - pad * 2) / view.cell), rows = Math.min(box.h, (view.h - pad * 2) / view.cell);
        view.x = (box.w - cols) / 2; view.y = box.h - rows;
        view.ox = (view.w - cols * view.cell) / 2; view.oy = (view.h - rows * view.cell) / 2;
        view.vc = cols; view.vr = rows;
    }
    const px = (x, y) => [view.ox + (x - view.x) * view.cell, view.oy + (y - view.y) * view.cell];
    // A pointer event's place in the box, in cells (the page may be zoomed, so by the canvas's own box).
    function cellAt(e) {
        const b = canvas.getBoundingClientRect();
        return { x: ((e.clientX - b.left) / b.width * view.w - view.ox) / view.cell + view.x, y: ((e.clientY - b.top) / b.height * view.h - view.oy) / view.cell + view.y };
    }
    function lead(e) { if (feed()) E().feedPoint(game(), cellAt(e)); }
    function letGo() { held = null; if (feed()) E().feedPoint(game(), null); }

    // ---- what happened (from game.js's loop) ------------------------------------------------------------------------
    function events(list) {
        if (!dlg?.open) return;
        const now = performance.now();
        let gold = 0;
        for (const ev of list) {
            if (ev.type === 'found') { if (ev.kind === 'fragment' || gold++ % 8 === 0) sparks.push({ at: now, x: ev.x + 0.5, y: ev.y + 0.5, kind: ev.kind }); }
            else if (ev.type === 'fragment') pops.push({ at: now, text: `Fragment ${ev.found}/${ev.of}`, color: 'primary' });
            else if (ev.type === 'layer') {
                pops.push({ at: now, text: `Layer ${ev.layer} digested · +${E().format(ev.pay)} research`, color: 'research', big: true });
                if (ev.mite) pops.push({ at: now + 500, text: `The swarm grows · ${plural(ev.mites, 'mite', 'mites')}`, color: 'good' });
            }
        }
        if (sparks.length > 40) sparks.splice(0, sparks.length - 40);
    }

    // ---- drawing --------------------------------------------------------------------------------------------------
    function drawSand(f, now) {
        const lib = F(), { w, h, cells } = f, W3 = w * SUB;
        const blink = words(palette.fragment, reduced() ? 1 : 0.6 + 0.4 * Math.sin(now / 160));
        pixels.fill(0);
        const first = Math.max(0, Math.floor(view.y) - 1) * w;
        for (let i = first; i < cells.length; i++) {
            const v = cells[i];
            if (!v) continue;
            const kind = lib.kindOf(v), x = i % w, y = (i - x) / w, shade = (i * 2654435761 >>> 0) % 5;
            const falling = y < h - 1 && !cells[i + w], band = lib.bandOf(v) % palette.bands.length;
            let c;
            if (kind === 6) c = falling ? palette.fallingBad[shade] : palette.garbled[(x + y * 3 + (i >> 3)) & 1][shade];
            else if (falling) c = palette.falling[shade];
            else if (kind === 1 || !lib.seenOf(v)) c = palette.bands[band][shade];
            else if (kind === 2) c = palette.gold[2 + (shade & 1)];
            else if (kind === 3) c = blink;
            else if (f.readable.includes(lib.KIND_IDS[kind])) c = palette.known[band][shade];
            else c = kind === 4 ? palette.numbers[(x + y) & 1][shade] : palette.pictures[x & 1][shade];
            // A grain: three by three, its corners faded.
            const p = y * SUB * W3 + x * SUB, body = c[0], edge = c[1];
            pixels[p] = edge; pixels[p + 1] = body; pixels[p + 2] = edge;
            pixels[p + W3] = body; pixels[p + W3 + 1] = body; pixels[p + W3 + 2] = body;
            pixels[p + 2 * W3] = edge; pixels[p + 2 * W3 + 1] = body; pixels[p + 2 * W3 + 2] = edge;
        }
        sandCtx.putImageData(image, 0, 0);
    }
    function draw(now) {
        const f = feed(); if (!f || !palette || !view.w) return;
        const box = F().FEED, still = reduced();
        settle(f);
        const c = view.cell;
        ctx.clearRect(0, 0, view.w, view.h);
        // The box: its floor, and its walls and the spout's mouth where they are in view.
        const [x0, y0] = px(0, 0), [x1, y1] = px(box.w, box.h);
        ctx.strokeStyle = colors.border; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0 - 1, Math.max(0, y0)); ctx.lineTo(x0 - 1, y1 + 1); ctx.lineTo(x1 + 1, y1 + 1); ctx.lineTo(x1 + 1, Math.max(0, y0)); ctx.stroke();
        if (y0 > -c * 2) {
            const mid = (x0 + x1) / 2, mouth = (box.spout + 3) * c;
            ctx.beginPath(); ctx.moveTo(mid - mouth, y0 - 1); ctx.lineTo(mid - mouth * 0.7, y0 + c * 2.5); ctx.moveTo(mid + mouth, y0 - 1); ctx.lineTo(mid + mouth * 0.7, y0 + c * 2.5); ctx.stroke();
        }
        drawSand(f, now);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(sand, view.x * SUB, view.y * SUB, view.vc * SUB, view.vr * SUB, view.ox, view.oy, view.vc * c, view.vr * c);
        // Each mite's lamp, faintly: what it has lit shows for good.
        const lamp = box.lamp * c;
        ctx.fillStyle = colors.good; ctx.globalAlpha = 0.07;
        for (const m of f.swarm) { const [x, y] = px(m.x, m.y); ctx.beginPath(); ctx.arc(x, y, lamp, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        // Sparks where gold or a fragment was found.
        sparks = sparks.filter(s => now - s.at < SPARK_MS);
        for (const s of sparks) {
            const age = (now - s.at) / SPARK_MS, [x, y] = px(s.x, s.y);
            ctx.globalAlpha = 1 - age; ctx.strokeStyle = s.kind === 'vein' ? colors.gold : colors.text; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, c * (1 + age * 4), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The point you hold.
        if (f.aim) {
            const [x, y] = px(f.aim.x, f.aim.y);
            ctx.strokeStyle = colors.good; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(x, y, c * box.near, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        // The swarm.
        const r = Math.max(3.5, Math.min(9, c * 1.3));
        f.swarm.forEach((m, n) => {
            let [x, y] = px(m.x, m.y);
            if (!still) { x += Math.cos(now / 90 + n * 2.4) * r * 0.25; y += Math.sin(now / 70 + n * 1.7) * r * 0.25; }
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
        const all = mail ? [mail.subject, ...(mail.body || [])].join(' ').split(/\s+/) : [];
        const per = Math.max(1, Math.min(9, Math.floor(all.length / of)));
        const scraps = Array.from({ length: of }, (_, n) => (found.includes(n) && all.length ? all.slice(n * per, n * per + per).join(' ') : '░░░░░░'));
        fragEl.replaceChildren(el('span', { class: 'feed-fragment-count', text: `Fragment ${found.length}/${of}` }),
            ...scraps.map((text, n) => el('span', { class: found.includes(n) ? 'feed-scrap found' : 'feed-scrap', text })));
        fragEl.classList.toggle('none', !found.length);
    }
    function text(node, value) { if (node.textContent !== value) node.textContent = value; }
    function tick(now) {
        raf = requestAnimationFrame(tick);
        const f = feed(); if (!f) return;
        frames++;
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
        readColors(); pops = []; sparks = []; held = null; fragShown = -1; view.cols = view.rows = 0;
        resize();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; if (held !== null) letGo(); }
    function close() { if (dlg?.open) { dlg.close(); stop(); } }

    window.FeedUI = { open, close, events, get isOpen() { return !!(dlg && dlg.open); }, get view() { return view; }, px };
    if (location.hash === '#feed') window.addEventListener('load', () => setTimeout(open, 600));
})();
