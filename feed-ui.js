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
// corners faded so it reads round, and scaled up. Data falls as packets, drawn as Packet Snare draws them, from a
// spout that swings from side to side; half way down they melt into sand (feed.js `drops`), which falls on in a
// colour between the packet's and its own, each delivery its own colour, so the pile lies in strata like sand art. Gold and
// fragments look like the sand round them until a mite's lamp has found them (feed.js `seenOf`).
(function () {
    'use strict';
    const POP_MS = 1800, SPARK_MS = 500, SUB = 3, MIN_COLS = 40, MARGIN = 6, EASE = 0.07;
    // Strata, in the order deliveries come (feed.js `bands`). Chosen to sit apart on the dark themes.
    const BANDS = ['#e8c07a', '#d98a5f', '#7fc8a9', '#6fa8dc', '#c9a0e8', '#e6dfc8'];
    const TESTS = [['+40', [1, 40, 4]], ['+75 dirty', [2, 75, 6, 10]], ['+200 dirty', [4, 200, 15, 20, 20]]];
    let dlg = null, canvas = null, ctx = null, stage = null, promptEl = null, hungerEl = null, layerEl = null, mitesEl = null, researchEl = null, fragEl = null;
    let pickEl = null, endEl = null, pickKey = '', cardsEl = null, cardsKey = '', heldEl = null, heldKey = '', giveEl = null, arcs = [], bolts = [], shakeAt = 0;
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
        // The hunger meter. In a session (the ring) it is the hunger bar that ends it; otherwise full, the swarm splits.
        hungerEl = el('div', { class: 'feed-hunger', role: 'progressbar', 'aria-label': 'Hunger', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('div', { class: 'feed-hunger-fill' }));
        mitesEl = el('span', { class: 'feed-stat' });
        researchEl = el('span', { class: 'feed-stat feed-research' });
        promptEl = el('div', { class: 'feed-prompt', 'aria-live': 'polite' });
        canvas = el('canvas', { class: 'feed-canvas', 'aria-label': 'The pile. Hold a point to lead the swarm there.' });
        // Between sessions (the ring): the stockpiles to pick from, over the empty box.
        pickEl = el('div', { class: 'feed-pick', hidden: '' });
        // At a split in a session: the cards to pick one from. The session waits.
        cardsEl = el('div', { class: 'feed-cards', hidden: '' });
        stage = el('div', { class: 'feed-stage' }, canvas, pickEl, cardsEl);
        endEl = el('button', { type: 'button', class: 'ghost-button feed-end', text: 'End', hidden: '', onclick: endNow });
        fragEl = el('div', { class: 'feed-fragment' });
        const debug = window.AGI?.debug;
        const tests = el('div', { class: 'feed-test', 'aria-label': 'Testing' },
            el('span', { class: 'feed-test-label', text: 'Test' }),
            ...TESTS.map(([label, args]) => el('button', { type: 'button', class: 'ghost-button', text: label, onclick: () => debug?.feedDeliver(...args) })),
            // Give any card in the session in play (the tools are rare; the owner's ask, to try them and the combos).
            (giveEl = el('select', { class: 'feed-give', 'aria-label': 'Give a card', onchange: () => { if (giveEl.value) debug?.feedCard(giveEl.value); giveEl.value = ''; } },
                el('option', { value: '', text: 'Give card…' }), ...Object.keys(F().CARDS).map(id => el('option', { value: id, text: cardName(id) })))),
            el('button', { type: 'button', class: 'ghost-button', text: 'Empty', onclick: () => { debug?.resetFeed(); fragShown = -1; view.want = null; } }));
        dlg = el('dialog', { class: 'feed-screen', 'aria-label': 'The Feed' },
            el('div', { class: 'feed-bar' },
                el('span', { class: 'feed-title', text: 'The Feed' }), layerEl, mitesEl, researchEl, endEl,
                el('button', { type: 'button', class: 'ghost-button feed-close', 'aria-label': 'Close The Feed', text: '×', onclick: close })),
            hungerEl, (heldEl = el('div', { class: 'feed-held', hidden: '', 'aria-label': 'Cards this session' })), tests, promptEl, stage, fragEl);
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
            research: v('--research'), primary: v('--primary'), mono: v('--font-mono') || 'monospace',
            packet: v('--snare-good') || v('--primary'), packetBad: v('--snare-bad') || v('--danger') };
        const bg = rgb(colors.bg), muted = rgb(colors.muted), bad = rgb(v('--snare-bad') || v('--danger')), text = rgb(colors.text);
        const bands = BANDS.map(rgb);
        palette = {
            bands: bands.map(shades), known: bands.map(c => shades(mix(c, text, 0.35))), gold: shades(rgb(colors.gold)), fragment: text,
            // Sand just melted out of a packet and still in the air: half way between the packet's colour and its own.
            falling: bands.map(c => shades(mix(c, rgb(colors.packet), 0.5))), fallingBad: shades(bad),
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
        // The pile is the rows from the floor up that hold more than a thread of sand: the stream falling from the
        // spout is a grain or two wide, and the view shouldn't draw back for it.
        let minX = w, maxX = -1, top = h;
        for (let y = h - 1; y >= 0; y--) {
            let n = 0, lo = w, hi = -1;
            for (let x = 0; x < w; x++) if (cells[y * w + x]) { n++; if (x < lo) lo = x; if (x > hi) hi = x; }
            if (n < 5) break;
            top = y; if (lo < minX) minX = lo; if (hi > maxX) maxX = hi;
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
    // ---- sessions (the ring): the stockpiles between them, and ending one --------------------------------------------
    const WHY = { hunger: 'The swarm went hungry.', empty: 'The stockpile is eaten.', left: 'You ended the session.' };
    function endNow() { if (feed()?.session) { window.AGI.feedEnd(); pickKey = ''; } }
    function start(sector) { if (window.AGI.feedStart(sector)) { pickKey = ''; view.want = null; pops = []; } }
    // The cards' words (placeholders, for the owner to write): a name and what a copy does.
    const CARD_TEXT = { chew: ['Sharper jaws', 'Mites eat 25% faster.'], hunger: ['Slow burn', 'The hunger bar drains 25% slower.'], speed: ['Quick legs', 'Mites move 30% faster.'], pay: ['Rich grain', 'Good sand pays 20% more research.'],
        scanner: ['Scanner', 'A beam sweeps the box and shows the gold and fragments hidden in the sand.'], pulse: ['Pulse', 'A burst eats every grain in a circle where you point.'],
        arc: ['Arc', 'Sparks jump between nearby mites and eat the sand between them.'], sorter: ['Sorter bots', 'Bots move gold to one side and garbled sand to the other.'],
        rhythm: ['Algo-rhythm', 'The box shakes on a beat. Garbled sand sinks and the rest rises.'],
        sonar: ['Sonar', 'A ring spreads from your finger, shows the sand it crosses, then draws the gold back in.'], storm: ['Storm', 'Chain lightning. Each mite sends bolts out through the sand round it.'],
        defrag: ['Defrag', 'Garbled sand packed in a clump is rewritten into good sand.'], tracer: ['Tracer', 'Sparks jump from each mite to gold in reach and take it.'],
        magnet: ['Magnet', 'Gold is drawn through the pile to where you point.'], resonance: ['Resonance', 'On every beat a small pulse goes off at each mite at once.'] };
    const recipe = id => { const k = F().CARDS[id]; return k && k.combo ? k.combo.map(cardName).join(' + ') : ''; };
    const cardName = id => (CARD_TEXT[id] || [id])[0];
    function renderHeld() {
        const c = feed()?.session?.cards, key = c ? JSON.stringify(c) : '';
        if (key === heldKey) return;
        heldKey = key;
        const ids = c ? Object.keys(c) : [];
        heldEl.hidden = !ids.length;
        heldEl.replaceChildren(...ids.map(id => el('span', { class: `feed-chip${F().CARDS[id]?.combo ? ' combo' : F().CARDS[id]?.rare ? ' rare' : ''}`, text: c[id] > 1 ? `${cardName(id)} ×${c[id]}` : cardName(id) })));
    }
    function renderCards() {
        const s = feed()?.session, offer = s?.offer;
        cardsEl.hidden = !offer;
        const key = offer ? offer.join(',') + '|' + JSON.stringify(s.cards) : '';
        if (key === cardsKey) return;
        cardsKey = key;
        if (!offer) return;
        if (held !== null) letGo();
        cardsEl.replaceChildren(el('h3', { class: 'feed-cards-title', text: 'The swarm split. Pick one.' }),
            el('div', { class: 'feed-cards-row' }, ...offer.map((id, n) => { const [name, what] = CARD_TEXT[id] || [id, '']; const have = s.cards[id] || 0;
                const k = F().CARDS[id] || {}, tag = k.combo && !have ? 'Combo' : have ? `You have ${have}` : k.tool ? 'Tool' : 'New';
                return el('button', { type: 'button', class: `feed-card${k.combo ? ' combo' : k.rare ? ' rare' : ''}`, onclick: () => window.AGI.feedPick(n) },
                    el('strong', { text: name }), el('span', { text: what }), ...(k.combo ? [el('small', { class: 'feed-card-uses', text: `Uses up ${recipe(id)}` })] : []), el('em', { text: tag })); })));
    }
    function renderPick() {
        const f = feed(), on = !!(f && f.sessioned && !f.session);
        pickEl.hidden = !on; endEl.hidden = !(f && f.session); if (giveEl) giveEl.disabled = !(f && f.session);
        if (!on) { pickKey = ''; return; }
        const list = E().feedStock(game()), last = f.lastSession;
        const key = JSON.stringify([list.map(e => [e.sector, e.total, e.cap, e.gold, e.bad, e.record]), last]);
        if (key === pickKey) return;
        pickKey = key;
        const kids = [];
        if (last) kids.push(el('div', { class: 'feed-last' },
            el('strong', { text: WHY[last.why] || 'Session over.' }),
            el('span', { text: `Sector ${last.sector} · ${plural(last.layers, 'split', 'splits')} · +${E().format(last.research)} research · ${last.time} s${last.record ? ' · New best' : ''}${last.cards ? ` · ${plural(last.cards, 'card', 'cards')}` : ''}` })));
        kids.push(el('h3', { class: 'feed-pick-title', text: 'Stockpiles' }));
        if (!list.some(e => e.total > 0)) kids.push(el('p', { class: 'feed-pick-none', text: 'Nothing stockpiled. Catch packets in Packet Snare to fill one.' }));
        for (const e of list) {
            const pct = Math.round(Math.min(1, e.total / e.cap) * 100);
            const parts = [`${e.total}/${e.cap} packets`]; if (e.gold) parts.push(`${e.gold} gold`); if (e.bad) parts.push(`${e.bad} garbled`); if (e.record) parts.push(`best ${plural(e.record, 'split', 'splits')}`);
            kids.push(el('div', { class: e.full ? 'feed-pile full' : 'feed-pile' },
                el('div', { class: 'feed-pile-head' }, el('strong', { text: `Sector ${e.sector}` }), el('span', { class: 'feed-pile-tag', text: e.full ? 'Full' : '' })),
                el('div', { class: 'feed-pile-bar' }, el('div', { class: 'feed-pile-fill', style: `width:${pct}%` })),
                el('div', { class: 'feed-pile-foot' }, el('span', { text: parts.join(' · ') }),
                    el('button', { type: 'button', class: 'button feed-pile-start', text: 'Start session', ...(e.total > 0 ? {} : { disabled: '' }), onclick: () => start(e.sector) }))));
        }
        pickEl.replaceChildren(...kids);
    }
    function letGo() { held = null; if (feed()) E().feedPoint(game(), null); }

    // ---- what happened (from game.js's loop) ------------------------------------------------------------------------
    function events(list) {
        if (!dlg?.open) return;
        const now = performance.now();
        let gold = 0;
        for (const ev of list) {
            if (ev.type === 'found') { if (ev.kind === 'fragment' || gold++ % 8 === 0) sparks.push({ at: now, x: ev.x + 0.5, y: ev.y + 0.5, kind: ev.kind }); }
            else if (ev.type === 'pulse') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'pulse', r: ev.r });
            else if (ev.type === 'arc') arcs.push({ at: now, ...ev });
            else if (ev.type === 'shake') shakeAt = now;
            else if (ev.type === 'sonar') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'sonar', r: ev.r });
            else if (ev.type === 'bolt') bolts.push({ at: now, pts: ev.pts });
            else if (ev.type === 'defrag') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'pulse', r: 3 });
            else if (ev.type === 'card' && ev.merged) pops.push({ at: now, text: `${ev.merged.map(cardName).join(' + ')} = ${cardName(ev.card)}`, color: 'gold', big: true });
            else if (ev.type === 'fragment') pops.push({ at: now, text: `Fragment ${ev.found}/${ev.of}`, color: 'primary' });
            else if (ev.type === 'layer') {
                pops.push({ at: now, text: ev.mite ? `The swarm splits · ${plural(ev.mites, 'mite', 'mites')}` : 'Fed', color: 'good', big: true });
                pops.push({ at: now + 400, text: `+${E().format(ev.pay)} research`, color: 'research' });
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
            const falling = lib.airOf(v), band = lib.bandOf(v) % palette.bands.length;
            let c;
            if (kind === 6) c = falling ? palette.fallingBad[shade] : palette.garbled[(x + y * 3 + (i >> 3)) & 1][shade];
            else if (falling) c = palette.falling[band][shade];
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
        if (y0 > -c * 4) {
            // The spout, where it is on its swing.
            const [sx] = px(F().spoutX(f) + 0.5, 0), mouth = (box.spout + 3) * c;
            ctx.beginPath(); ctx.moveTo(sx - mouth * 1.5, y0 - 1); ctx.lineTo(sx - mouth, y0 + c * 3); ctx.moveTo(sx + mouth * 1.5, y0 - 1); ctx.lineTo(sx + mouth, y0 + c * 3); ctx.stroke();
        }
        drawSand(f, now);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
        const jig = !still && now - shakeAt < 180 ? Math.sin(now / 12) * 2 : 0;   // the algo-rhythm's beat
        ctx.drawImage(sand, view.x * SUB, view.y * SUB, view.vc * SUB, view.vr * SUB, view.ox + jig, view.oy, view.vc * c, view.vr * c);
        // Packets on their way down: arrowheads, as in Packet Snare, with a little static in them.
        const size = Math.max(5, c * 3.2);
        f.drops.forEach((d, n) => {
            const [x, y] = px(d.x + 0.5, d.y);
            if (y < -size || y > view.h + size) return;
            const jolt = still ? 0 : Math.sin(now / 45 + n * 12.9898 + d.x) > 0.93 ? size * 0.25 : 0;
            ctx.fillStyle = d.k === 6 ? colors.packetBad : d.k === 2 ? colors.gold : d.k === 4 || d.k === 5 ? colors.muted : colors.packet;
            ctx.strokeStyle = colors.bg; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + jolt, y + size * 0.6); ctx.lineTo(x + size * 0.55 + jolt, y - size * 0.5); ctx.lineTo(x + jolt, y - size * 0.2); ctx.lineTo(x - size * 0.55 + jolt, y - size * 0.5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            if (jolt) { ctx.strokeStyle = colors.text; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(x - size * 0.9, y); ctx.lineTo(x - size * 0.5, y - size * 0.3); ctx.lineTo(x - size * 0.7, y + size * 0.2); ctx.stroke(); ctx.globalAlpha = 1; }
        });
        // Each mite's lamp, faintly: what it has lit shows for good.
        const lamp = box.lamp * c;
        ctx.fillStyle = colors.good; ctx.globalAlpha = 0.07;
        for (const m of f.swarm) { const [x, y] = px(m.x, m.y); ctx.beginPath(); ctx.arc(x, y, lamp, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        // Sparks where gold or a fragment was found.
        sparks = sparks.filter(s => now - s.at < SPARK_MS);
        for (const s of sparks) {
            const age = (now - s.at) / SPARK_MS, [x, y] = px(s.x, s.y);
            ctx.globalAlpha = 1 - age; ctx.strokeStyle = s.kind === 'vein' ? colors.gold : s.kind === 'pulse' ? colors.good : s.kind === 'sonar' ? colors.gold : colors.text; ctx.lineWidth = s.kind === 'pulse' || s.kind === 'sonar' ? 2.5 : 1.5;
            // A pulse grows; the Sonar's ring, at its full reach, closes back in.
            ctx.beginPath(); ctx.arc(x, y, s.kind === 'pulse' ? c * s.r * (0.4 + age * 0.8) : s.kind === 'sonar' ? c * s.r * (1 - age * 0.85) : c * (1 + age * 4), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The tools: the scanner's beam, arcs between mites, the sorter bots.
        const sess = f.session;
        if (sess && sess.beam >= 0) { const [bx] = px(sess.beam, 0); ctx.strokeStyle = colors.primary; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, view.h); ctx.stroke(); ctx.globalAlpha = 0.12; ctx.fillStyle = colors.primary; ctx.fillRect(bx - c * 4, 0, c * 4, view.h); ctx.globalAlpha = 1; }
        if (sess && sess.ring) { const [rx, ry] = px(sess.ring.x, sess.ring.y); ctx.strokeStyle = colors.primary; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, Math.max(1, sess.ring.r * c), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        bolts = bolts.filter(b => now - b.at < 320);
        for (const b of bolts) { ctx.globalAlpha = 1 - (now - b.at) / 320; ctx.strokeStyle = colors.text; ctx.lineWidth = 2; ctx.beginPath(); b.pts.forEach((p, n) => { const [x, y] = px(p[0], p[1]); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
        ctx.globalAlpha = 1;
        arcs = arcs.filter(a => now - a.at < 260);
        for (const a of arcs) { const [ax, ay] = px(a.x1, a.y1), [bx, by] = px(a.x2, a.y2), mx = (ax + bx) / 2 + (still ? 0 : Math.sin(a.at + now / 20) * 6), my = (ay + by) / 2 + (still ? 0 : Math.cos(a.at + now / 17) * 6);
            ctx.globalAlpha = 1 - (now - a.at) / 260; ctx.strokeStyle = a.gold ? colors.gold : colors.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.lineTo(bx, by); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (sess && sess.bots) for (const b of sess.bots) { const [x, y] = px(b.x, b.y), q = Math.max(4, c * 1.4); ctx.fillStyle = colors.bg; ctx.fillRect(x - q / 2 - 1, y - q / 2 - 1, q + 2, q + 2); ctx.fillStyle = colors.gold; ctx.fillRect(x - q / 2, y - q / 2, q, q); }
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
        if (f.sessioned) return !f.session ? '' : f.life < 0.25 ? '> They are starving. Lead them to good sand.' : !f.stats.eaten && !f.aim ? '> Show it where to start.' : '';
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
        // In a session the bar is the hunger bar (it empties; the session ends at nothing) and the stat is the way to the next split.
        const hunger = F().hunger(f), split = Math.round(hunger.share * 100), pct = f.sessioned ? Math.round(hunger.life * 100) : split;
        text(layerEl, f.sessioned ? (f.session ? `Split ${split}%` : '') : `Hunger ${pct}%`);
        hungerEl.classList.toggle('life', !!f.sessioned); hungerEl.classList.toggle('low', !!f.session && hunger.life < 0.25);
        renderPick(); renderCards(); renderHeld();
        if (hungerEl.firstChild.style.width !== pct + '%') { hungerEl.firstChild.style.width = pct + '%'; hungerEl.setAttribute('aria-valuenow', String(pct)); }
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
        readColors(); pops = []; sparks = []; held = null; fragShown = -1; pickKey = ''; cardsKey = ''; heldKey = '\u0000'; arcs = []; bolts = []; view.cols = view.rows = 0;
        resize();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; if (held !== null) letGo(); }
    function close() { if (dlg?.open) { dlg.close(); stop(); } }

    window.FeedUI = { open, close, events, get isOpen() { return !!(dlg && dlg.open); }, get view() { return view; }, px };
    if (location.hash === '#feed') window.addEventListener('load', () => setTimeout(open, 600));
})();
