// feed-ui.js — The Feed's screen (design/ring.md → The Feed; Build 1 of design/ring-build.md): draws the box of sand
// from feed.js's state (`AGI.state.feed`) and holds a point for the swarm while your finger or the mouse button is
// down (engine.js `feedPoint`). It knows no rules, and it doesn't step the pile: game.js's loop does (engine.js
// `feedStep`, so the swarm eats while you are elsewhere) and hands the events here (`FeedUI.events`).
// For now it is a full-screen dialog (the owner's pick) behind a test door: the debug panel (AGI.debug.openFeed) or
// #feed in the address. Its real door is an object on the desk (design/ring.md → Where the places live). While it is
// behind the test door it carries its own row of test buttons (the debug panel can't be reached under a dialog).
//
// **The view starts close and draws back** (the owner's call): it frames the pile, floor at the bottom, and widens as
// the pile grows until the whole box shows. Sand is drawn two pixels a cell on a small canvas, each grain solid in its own shade (it was three with its
// corners faded, which drew a mesh once the sand was finer), and scaled up. Data falls as packets, drawn as Packet Snare draws them, from a
// spout that swings from side to side; half way down they melt into sand (feed.js `drops`), which falls on in a
// colour between the packet's and its own, each delivery its own colour, so the pile lies in strata like sand art. Gold and
// fragments look like the sand round them until a mite's lamp has found them (feed.js `seenOf`).
(function () {
    'use strict';
    const POP_MS = 1800, SPARK_MS = 500, SUB = 2, MIN_COLS = 80, MARGIN = 12, EASE = 0.07;
    // The owner's dials (2026-11-15: "need to look at the camera to dial in what I want", mites too fast, early splits
    // too quick, late game stalls): sliders in the test panel that set the rules' own numbers and the view's, kept per
    // device, so the owner can find the values and say them. [key, label, min, max, step, where]
    const DIALS = [['speed', 'Mite speed', 60, 600, 20, 'feed'], ['chew', 'Eating speed', 0.25, 6, 0.25, 'feed'], ['layerFirst', 'First split (packets)', 5, 120, 1, 'feed'], ['layerGrow', 'Each split bigger by', 1.1, 2.5, 0.05, 'feed'],
        ['hungerTime', 'Hunger bar (s)', 10, 90, 5, 'feed'], ['minCols', 'Closest view (cells across)', 40, 256, 8, 'view'], ['ease', 'View catches up', 0.02, 0.4, 0.02, 'view']];
    // (The owner, 2026-11-15: the camera zoomed out to start. The view opens on the whole width of the box; + zooms in.)
    const dial = { minCols: 256, ease: EASE };
    const dialOn = () => /debug|feedtest|playground/.test(location.hash + location.search);
    const dialGet = ([key, , , , , where]) => (where === 'view' ? dial[key] : F().FEED[key]);
    const dialSet = ([key, , , , , where], v) => { if (where === 'view') dial[key] = v; else F().FEED[key] = v; };
    let dialBase = null;
    const dialSave = () => { try { localStorage.setItem('agiFeedDials3', JSON.stringify(Object.fromEntries(DIALS.map(d => [d[0], dialGet(d)])))); } catch { /* private mode */ } };
    function dialLoad() {
        if (dialBase || !dialOn()) return;
        dialBase = Object.fromEntries(DIALS.map(d => [d[0], dialGet(d)]));
        try { const kept = JSON.parse(localStorage.getItem('agiFeedDials3') || 'null'); if (kept) for (const d of DIALS) if (typeof kept[d[0]] === 'number' && kept[d[0]] >= d[2] && kept[d[0]] <= d[3]) dialSet(d, kept[d[0]]); } catch { /* private mode */ }
    }
    function dialPanel() {
        dialLoad();
        const out = el('output', { class: 'feed-dial-out' });
        const say = () => { out.textContent = DIALS.map(d => `${d[0]} ${dialGet(d)}`).join(' · '); };
        const rows = DIALS.map(d => { const val = el('b', { text: String(dialGet(d)) });
            const input = el('input', { type: 'range', min: String(d[2]), max: String(d[3]), step: String(d[4]), value: String(dialGet(d)), 'aria-label': d[1], oninput: () => { dialSet(d, Number(input.value)); val.textContent = input.value; view.want = null; dialSave(); say(); } });
            return el('label', { class: 'feed-dial' }, el('span', { text: d[1] }), input, val); });
        say();
        return el('details', { class: 'feed-dials' }, el('summary', { text: 'Dials' }), ...rows, out,
            el('button', { type: 'button', class: 'ghost-button', text: 'Back to the game\'s values', onclick: e => { for (const d of DIALS) dialSet(d, dialBase[d[0]]); dialSave(); const box = e.target.closest('.feed-dials'); box.replaceWith(dialPanel()); } }));
    }
    // Strata, in the order deliveries come (feed.js `bands`). Chosen to sit apart on the dark themes.
    // The layers' tones (2026-11-16: one colour, the packets', in six shades; the sand used to be six colours).
    const BAND_TONE = [0.84, 0.9, 0.96, 0.9, 0.82, 0.93];
    const TESTS = [['+40', [1, 40, 4]], ['+75 dirty', [2, 75, 6, 10]], ['+200 dirty', [4, 200, 15, 20, 20]]];
    let dlg = null, canvas = null, ctx = null, stage = null, promptEl = null, hungerEl = null, layerEl = null, mitesEl = null, researchEl = null, fragEl = null;
    let pickEl = null, endEl = null, pickKey = '', cardsEl = null, cardsKey = '', heldEl = null, heldKey = '', giveEl = null, arcs = [], bolts = [], shakeAt = 0, lastNow = 0;
    // Your own zoom on the box (the owner's ask: to work a spot closely): `k` times the view's own size, centred on a
    // cell. Pinch or two-finger drag on a touch screen; the wheel, a right-button drag, or the buttons with a mouse.
    const ZOOM_MAX = 6;
    // The camera (the owner's ask: a finger hides what it points at): a small window just above the point you hold,
    // showing the sand under it enlarged. Docked, it stays in the box's top corner instead (a choice kept on this device).
    // (Bigger and less enlarged since the owner's first play of it: it was 138 by 96 at six px a cell.)
    const CAM_W = 210, CAM_H = 140, CAM_CELL = 3.6, CAM_UP = 46;
    // A quick tap (under `TAP_MS`, the finger barely moving) sets a point that stays; a tap on that point clears it.
    const TAP_MS = 260, TAP_PX = 10;
    let downAt = 0, downXY = null;
    // (2026-11-14, the owner: "still way too small, I'd like the option to make it larger or smaller": the button goes
    // round Follows, Small, Large and Off; Large is most of the stage's width and a third of its height.)
    // (2026-11-16, the owner: on a phone the camera is off to start, and the small corner window when switched on, now that the
    // view closes in by itself; a desktop keeps the large one until the owner has judged it. A new key, so the old default
    // kept on a phone doesn't hold.)
    const PHONE = matchMedia('(pointer: coarse)').matches;
    const CAM_MODES = PHONE ? ['off', 'small', 'follow', 'large'] : ['follow', 'small', 'large', 'off'], CAM_NAME = { follow: 'follows', small: 'small', large: 'large', off: 'off' };
    let camMode = PHONE ? 'off' : 'large', camEl = null;
    try { const v = localStorage.getItem('agiFeedCam2'); if (CAM_MODES.includes(v)) camMode = v; } catch { /* private mode */ }
    const camLabel = () => { if (camEl) camEl.textContent = `Camera: ${CAM_NAME[camMode]}`; };
    const camSize = () => (camMode === 'large' ? [Math.max(CAM_W, Math.min(view.w - 16, view.w * 0.9)), Math.max(CAM_H, view.h * 0.34)] : camMode === 'follow' ? [Math.min(view.w - 16, 270), 180] : [CAM_W, CAM_H]);
    // The joystick (the owner's call: two fingers to move the view was awkward): shown while zoomed in; arrow keys too.
    let joyEl = null, joyKnob = null, joy = null, legendEl = null;
    const resetZoom = () => { zoom = { k: 1, cx: 0, cy: 0 }; zoomEl?.classList.remove('zoomed'); };
    let zoom = { k: 1, cx: 0, cy: 0 }, touches = new Map(), pinch = null, pan = null, zoomEl = null;
    let sand = null, sandCtx = null, image = null, pixels = null, palette = null;
    // The window on the box, in cells: `cols` × `rows` from (`x`, `y`), a cell `cell` px, drawn from (`ox`, `oy`).
    let view = { w: 0, h: 0, x: 0, y: 0, cols: 0, rows: 0, cell: 4, ox: 0, oy: 0, want: null };
    let raf = 0, frames = 0, colors = {}, fragShown = -1, held = null, pops = [], sparks = [];
    // The juice (2026-11-16, the owner's picks: eating feedback and a living tank). `bits`: particles in cells (crumbs, glints,
    // bursts), `floats`: numbers rising off the sand, `trails`: where each mite has been, `flash`: a full-screen flash, `quake`:
    // a shake, `motes`: dust drifting in the tank's light. All drawing; nothing here decides anything.
    let bits = [], floats = [], trails = [], flash = null, quake = 0, motes = [], paidAcc = 0, paidAt = 0, frenzyEl = null, lastDraw = 0;
    const MAX_BITS = 420;
    let life = [];
    // Whether the tank holds garbled sand (looked at twice a second: the scrubber's ward shows only where it matters).
    let garbledAt = 0, garbledHas = false;
    const hasGarbled = f => { const now = performance.now(); if (now - garbledAt > 500) { garbledAt = now; const lib = F(); garbledHas = f.cells.some(v => v && lib.kindOf(v) === 6); } return garbledHas; };

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
        // The frenzy (2026-11-16): four pips that fill as the swarm heats up, and what it pays.
        frenzyEl = el('div', { class: 'feed-frenzy', hidden: '', 'aria-label': 'Frenzy' }, el('span', { class: 'feed-frenzy-label', text: 'Frenzy' }),
            ...[1, 2, 3, 4].map(() => el('i', { class: 'feed-pip' }, el('b'))), el('span', { class: 'feed-frenzy-mult' }));
        researchEl = el('span', { class: 'feed-stat feed-research' });
        promptEl = el('div', { class: 'feed-prompt', 'aria-live': 'polite' });
        canvas = el('canvas', { class: 'feed-canvas', 'aria-label': 'The pile. Hold a point to lead the swarm there.' });
        // Between sessions (the ring): the stockpiles to pick from, over the empty box.
        pickEl = el('div', { class: 'feed-pick', hidden: '' });
        // At a split in a session: the cards to pick one from. The session waits.
        cardsEl = el('div', { class: 'feed-cards', hidden: '' });
        // Zoom and the camera, in a row under the box where a thumb reaches (the owner's call; they were in the box's top corner).
        camEl = el('button', { type: 'button', class: 'ghost-button feed-cam', onclick: () => { camMode = CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]; try { localStorage.setItem('agiFeedCam2', camMode); } catch { /* private mode */ } camLabel(); } });
        camLabel();
        zoomEl = el('div', { class: 'feed-zoom', 'aria-label': 'View' }, camEl,
            el('button', { type: 'button', class: 'ghost-button', 'aria-label': 'Zoom in', text: '+', onclick: () => { const [sx, sy] = swarmXY(); zoomAt(sx, sy, 1.5); } }),
            el('button', { type: 'button', class: 'ghost-button', 'aria-label': 'Zoom out', text: '−', onclick: () => zoomAt(view.w / 2, view.h / 2, 1 / 1.5) }),
            el('button', { type: 'button', class: 'ghost-button feed-zoom-reset', 'aria-label': 'Show the whole pile', text: '⟲', onclick: () => zoomAt(view.w / 2, view.h / 2, 0) }));
        joyKnob = el('span', { class: 'feed-joy-knob' });
        joyEl = el('div', { class: 'feed-joy', hidden: '', role: 'slider', 'aria-label': 'Move the view' }, joyKnob);
        const joyAt = e => { const b = joyEl.getBoundingClientRect(), r = b.width / 2; let x = (e.clientX - b.left - r) / r, y = (e.clientY - b.top - r) / r; const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; } joy = { id: e.pointerId, x, y }; joyKnob.style.transform = `translate(${x * r * 0.55}px, ${y * r * 0.55}px)`; };
        joyEl.addEventListener('pointerdown', e => { e.preventDefault(); try { joyEl.setPointerCapture(e.pointerId); } catch { /* gone */ } joyAt(e); });
        joyEl.addEventListener('pointermove', e => { if (joy && joy.id === e.pointerId) joyAt(e); });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joyEl.addEventListener(type, e => { if (joy && joy.id === e.pointerId) { joy = null; joyKnob.style.transform = ''; } });
        // What the sand is (the owner: "nothing to say what's good or bad sand"). PLACEHOLDER words.
        legendEl = el('div', { class: 'feed-legend', hidden: '', 'aria-label': 'What the sand is' },
            ...[['plain', 'data'], ['gold', 'gold: pays more'], ['bad', 'garbled: pays nothing']].map(([k, label]) => el('span', { class: 'feed-key feed-key-' + k }, el('i'), document.createTextNode(label))));
        stage = el('div', { class: 'feed-stage' }, canvas, joyEl, pickEl, cardsEl);
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
        // The test tools fold into one button in the bar (the owner's call, 2026-11-16): a drop-down over the field.
        const testBox = dialOn() ? el('details', { class: 'feed-testbox' }, el('summary', { class: 'ghost-button', 'aria-label': 'Test tools' }, el('span', { class: 'feed-testbox-long', text: 'Test' }), el('span', { class: 'feed-testbox-short', text: '⚙' })), el('div', { class: 'feed-testbox-body' }, tests, dialPanel())) : null;
        dlg = el('dialog', { class: 'feed-screen', 'aria-label': 'The Feed' },
            el('div', { class: 'feed-bar' },
                el('span', { class: 'feed-title', text: 'The Feed' }), layerEl, mitesEl, researchEl, ...(testBox ? [testBox] : []), endEl,
                el('button', { type: 'button', class: 'ghost-button feed-close', 'aria-label': 'Close The Feed', text: '×', onclick: close })),
            hungerEl, frenzyEl, (heldEl = el('div', { class: 'feed-held', hidden: '', 'aria-label': 'Cards this session' })), promptEl, stage, zoomEl, fragEl);   // (the legend and the prompt are not shown in a run: the owner's call, 2026-11-16)
        dlg.addEventListener('close', stop);
        dlg.addEventListener('keydown', e => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (d && zoom.k > 1) { e.preventDefault(); zoom.cx += d[0] * view.vc * 0.15; zoom.cy += d[1] * view.vr * 0.15; } });
        // One finger (or the left button) leads the swarm; two fingers zoom and move the view; the right button drags it.
        canvas.addEventListener('pointerdown', e => {
            try { canvas.setPointerCapture?.(e.pointerId); } catch { /* a pointer that is already gone */ }
            if (e.pointerType === 'mouse' && e.button === 2) { pan = { id: e.pointerId, xy: stageXY(e) }; return; }
            if (e.button !== 0) return;
            touches.set(e.pointerId, stageXY(e));
            if (touches.size === 2) { if (held !== null) letGo(); const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; return; }
            if (touches.size === 1) { held = e.pointerId; downAt = performance.now(); downXY = stageXY(e); lead(e); }
        });
        canvas.addEventListener('pointermove', e => {
            if (pan && pan.id === e.pointerId) { const xy = stageXY(e); panBy(xy[0] - pan.xy[0], xy[1] - pan.xy[1]); pan.xy = xy; return; }
            if (touches.has(e.pointerId)) touches.set(e.pointerId, stageXY(e));
            if (pinch && touches.size === 2) {
                const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
                zoomAt(mx, my, d / pinch.d); panBy(mx - pinch.mx, my - pinch.my);
                pinch = { d, mx, my };
                return;
            }
            if (held === e.pointerId) lead(e);
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => {
            if (pan && pan.id === e.pointerId) pan = null;
            touches.delete(e.pointerId);
            if (touches.size < 2) pinch = null;
            if (held === e.pointerId) {
                const xy = stageXY(e), tapped = e.type === 'pointerup' && downXY && performance.now() - downAt < TAP_MS && Math.hypot(xy[0] - downXY[0], xy[1] - downXY[1]) < TAP_PX;
                if (tapped && feed()?.session) { const at = cellAt(e), old = feed().spot, near = old && Math.hypot(old.x - at.x, old.y - at.y) < Math.max(6, 22 / view.cell); E().feedMark(game(), near ? null : at); }
                letGo();
            }
        });
        canvas.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = stageXY(e); zoomAt(sx, sy, e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
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
    const rgbs = {};
    const tint = (name, a) => { const c = rgbs[name] || [255, 255, 255]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    // A colour as the two pixel words a grain is drawn with (little-endian ABGR): its body, and its faded corners.
    const words = (c, k = 1) => { const r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0, base = (b << 16) | (g << 8) | r; return [(0xFF000000 | base) >>> 0, (0xB4000000 | base) >>> 0]; };
    // Each colour in five shades, so grains differ a little and the same grain is the same every frame.
    const shades = c => [0.9, 0.95, 1, 1.05, 1.1].map(k => words(c, k));
    function readColors() {
        const css = getComputedStyle(dlg), v = name => css.getPropertyValue(name).trim();
        colors = { bg: v('--bg'), border: v('--border'), text: v('--text'), muted: v('--muted'), gold: v('--warning'), good: v('--success'),
            research: v('--research'), primary: v('--primary'), mono: v('--font-mono') || 'monospace',
            packet: v('--snare-good') || v('--primary'), packetBad: v('--snare-bad') || v('--danger'), hot: v('--danger') || '#ff6a3d' };
        // The same colours as numbers, for see-through glows (`tint`).
        for (const k of ['primary', 'good', 'gold', 'research', 'hot', 'packetBad', 'text', 'bg']) rgbs[k] = rgb(colors[k]);
        const bg = rgb(colors.bg), muted = rgb(colors.muted), bad = rgb(v('--snare-bad') || v('--danger')), text = rgb(colors.text);
        // (The owner's call, 2026-11-16: "the multi color doesn't make as much visual sense now that we separate by sector".)
        // Good sand is the packets' colour, its layers only a shade apart so the depth still reads.
        const pk = rgb(colors.packet), bands = BAND_TONE.map(k => pk.map(v => Math.min(255, Math.round(v * k))));
        palette = {
            bands: bands.map(shades), known: bands.map(c => shades(mix(c, text, 0.35))), gold: shades(rgb(colors.gold)), fragment: text,
            // Sand just melted out of a packet and still in the air: a little brighter than it will be.
            falling: bands.map(c => shades(mix(c, text, 0.25))), fallingBad: shades(bad),
            // Sand the model has no skill for: grey, cold. Garbled sand: the bad packets' colour, dark. Both read as "not for eating".
            numbers: [shades(mix(bg, muted, 0.75)), shades(mix(bg, muted, 0.4))], pictures: [shades(mix(bg, rgb(colors.primary), 0.5)), shades(mix(bg, muted, 0.45))],
            garbled: [shades(mix(bg, bad, 0.62)), shades(mix(bg, bad, 0.32))],
            // A buried cache once a lamp has found it: research-violet glitter. Garbled sand's living edge: hotter.
            cache: [shades(rgb(colors.research)), shades(mix(rgb(colors.research), text, 0.5))], garbledHot: shades(mix(bg, bad, 0.9))
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
        if (f.session && !f.session.wait) return tankFrame(f);
        // The pile is the rows from the floor up that hold more than a thread of sand: the stream falling from the
        // spout is a grain or two wide, and the view shouldn't draw back for it.
        let minX = w, maxX = -1, top = h;
        for (let y = h - 1; y >= 0; y--) {
            let n = 0, lo = w, hi = -1;
            for (let x = 0; x < w; x++) if (cells[y * w + x]) { n++; if (x < lo) lo = x; if (x > hi) hi = x; }
            if (n < 10) break;
            top = y; if (lo < minX) minX = lo; if (hi > maxX) maxX = hi;
        }
        const pad = 8, aspect = (view.w - pad * 2) / (view.h - pad * 2);
        const reach = maxX < 0 ? 0 : Math.max(w / 2 - minX, maxX + 1 - w / 2) * 2;   // the pile's width about the spout's line
        let cols = Math.max(dial.minCols, reach + MARGIN * 2), rows = Math.max(h - top + MARGIN * 2, cols / aspect);
        rows = Math.min(box.h, rows); cols = Math.min(box.w, Math.max(cols, rows * aspect));
        return { cols, rows };
    }
    // A tank in a session (the owner's call, 2026-11-16: "start zoomed out and slowly zoom as the pile gets eaten"): the
    // remaining sand with a little sky over it, at the tank's width at the most; when the sand is low enough the view
    // narrows and follows the swarm across. At a session's start, the whole tank to its rim.
    function tankFrame(f) {
        const box = F().FEED, { w, h, cells } = f, L = f.x0, R = f.x1, tw = R - L;
        let top = h;
        if ((f.session.time || 0) < 1.2) top = f.tankTop;
        else for (let y = f.tankTop; y < h && top === h; y++) { let n = 0; for (let x = L; x < R && n < 4; x++) if (cells[y * w + x]) n++; if (n >= 4) top = y; }
        const pad = 8, aspect = (view.w - pad * 2) / (view.h - pad * 2), wide = tw + MARGIN * 2;
        let rows = Math.max(64, (h - top) * 1.22 + 16), cols = rows * aspect;
        if (cols > wide) { cols = wide; rows = cols / aspect; }
        cols = Math.min(box.w, Math.max(cols, Math.min(wide, 72))); rows = Math.min(box.h, Math.max(rows, cols / aspect));
        let cx = (L + R) / 2;
        if (cols < wide - 1) {
            // Narrower than the tank: centred where the swarm works (the point you hold, else the swarm's middle).
            const at = f.aim || f.spot || f.swarm.reduce((s, m) => ({ x: s.x + m.x / f.swarm.length, y: 0 }), { x: 0, y: 0 });
            cx = Math.max(L - MARGIN + cols / 2, Math.min(R + MARGIN - cols / 2, at.x));
        }
        return { cols, rows, cx };
    }
    function settle(f, snap) {
        const box = F().FEED, pad = 8;
        if (!view.want || frames % 8 === 0) view.want = frame(f);
        const k = snap || reduced() || !view.cols ? 1 : dial.ease;
        view.cols += (view.want.cols - view.cols) * k; view.rows += (view.want.rows - view.rows) * k;
        const wantCx = view.want.cx ?? box.w / 2;
        view.cx = view.cx === undefined || k === 1 ? wantCx : view.cx + (wantCx - view.cx) * k * 0.6;
        view.cell = Math.min((view.w - pad * 2) / view.cols, (view.h - pad * 2) / view.rows);
        // Show as much of the box as the stage has room for at that size, the floor at the bottom, the spout's line in the middle.
        const cols = Math.min(box.w, (view.w - pad * 2) / view.cell), rows = Math.min(box.h, (view.h - pad * 2) / view.cell);
        view.x = Math.max(0, Math.min(box.w - cols, view.cx - cols / 2)); view.y = box.h - rows;
        view.ox = (view.w - cols * view.cell) / 2; view.oy = (view.h - rows * view.cell) / 2;
        view.vc = cols; view.vr = rows;
        view.base = view.cell;
        if (zoom.k > 1) {
            // Zoomed in: the same view `k` times the size, round the cell you chose, kept inside the box.
            view.cell = view.base * zoom.k;
            const zc = Math.min(box.w, (view.w - pad * 2) / view.cell), zr = Math.min(box.h, (view.h - pad * 2) / view.cell);
            zoom.cx = Math.max(zc / 2, Math.min(box.w - zc / 2, zoom.cx)); zoom.cy = Math.max(zr / 2, Math.min(box.h - zr / 2, zoom.cy));
            view.x = zoom.cx - zc / 2; view.y = zoom.cy - zr / 2;
            view.ox = (view.w - zc * view.cell) / 2; view.oy = (view.h - zr * view.cell) / 2;
            view.vc = zc; view.vr = zr;
        }
    }
    // Zoom by `factor` keeping the cell under a point of the stage (px from its corner) where it is.
    function zoomAt(sx, sy, factor) {
        if (!view.base) return;
        const box = F().FEED, pad = 8, k = Math.max(1, Math.min(ZOOM_MAX, zoom.k * factor));
        const at = { x: (sx - view.ox) / view.cell + view.x, y: (sy - view.oy) / view.cell + view.y };
        zoom.k = k < 1.02 ? 1 : k;
        if (zoom.k > 1) {
            const cell = view.base * zoom.k, zc = Math.min(box.w, (view.w - pad * 2) / cell), zr = Math.min(box.h, (view.h - pad * 2) / cell);
            zoom.cx = at.x - (sx - (view.w - zc * cell) / 2) / cell + zc / 2; zoom.cy = at.y - (sy - (view.h - zr * cell) / 2) / cell + zr / 2;
        }
        if (zoomEl) zoomEl.classList.toggle('zoomed', zoom.k > 1);
    }
    // Where the buttons zoom in on: the point you hold, else the middle of the swarm.
    function swarmXY() {
        const f = feed(); if (!f) return [view.w / 2, view.h / 2];
        const at = f.aim || f.swarm.reduce((s, m) => ({ x: s.x + m.x / f.swarm.length, y: s.y + m.y / f.swarm.length }), { x: 0, y: 0 });
        const [sx, sy] = px(at.x, at.y);
        return [Math.max(0, Math.min(view.w, sx)), Math.max(0, Math.min(view.h, sy))];
    }
    function panBy(dx, dy) { if (zoom.k > 1) { zoom.cx -= dx / view.cell; zoom.cy -= dy / view.cell; } }
    const stageXY = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * view.w, (e.clientY - b.top) / b.height * view.h]; };
    const px = (x, y) => [view.ox + (x - view.x) * view.cell, view.oy + (y - view.y) * view.cell];
    // A pointer event's place in the box, in cells (the page may be zoomed, so by the canvas's own box).
    function cellAt(e) {
        const b = canvas.getBoundingClientRect();
        return { x: ((e.clientX - b.left) / b.width * view.w - view.ox) / view.cell + view.x, y: ((e.clientY - b.top) / b.height * view.h - view.oy) / view.cell + view.y };
    }
    function lead(e) { if (feed()) E().feedPoint(game(), cellAt(e)); }
    // ---- sessions (the ring): the stockpiles between them, and ending one --------------------------------------------
    const WHY = { hunger: 'The swarm went hungry.', empty: 'Every tank is eaten bare.', left: 'You ended the session.' };
    function endNow() { if (feed()?.session) { window.AGI.feedEnd(); pickKey = ''; } }
    function start(sector) { if (window.AGI.feedStart(sector)) { pickKey = ''; view.want = null; view.cx = undefined; pops = []; bits = []; floats = []; trails = []; resetZoom(); } }
    // The cards' words (placeholders, for the owner to write): a name and what a copy does.
    // (2026-11-16: the plain cards are bolder, and four trade one thing for another.)
    const CARD_TEXT = { chew: ['Sharper jaws', 'Mites eat 40% faster.'], hunger: ['Slow burn', 'The hunger bar lasts 35% longer.'], speed: ['Quick legs', 'Mites move 35% faster.'], pay: ['Rich grain', 'Good sand pays 30% more research.'], focus: ['Focus', 'The swarm tracks your point more tightly: less roaming, a straighter way there.'],
        glutton: ['Gluttons', 'Mites eat 80% faster, but the hunger bar drains 30% sooner.'], gambler: ['High stakes', 'Good sand pays 60% more, but mites move 20% slower.'],
        brood: ['Brood', 'Two more mites join now. Every mite eats 15% slower.'], adrenaline: ['Adrenaline', 'The frenzy builds twice as fast, but the hunger bar drains 20% sooner.'],
        scanner: ['Scanner', 'A beam sweeps the box and shows the gold and fragments hidden in the sand.'], pulse: ['Pulse', 'A burst eats every grain in a circle where you point.'],
        arc: ['Arc', 'Sparks jump between nearby mites and eat the sand between them.'], sorter: ['Sorter bots', 'Bots move gold to one side and garbled sand to the other.'],
        rhythm: ['Algo-rhythm', 'The box shakes on a beat. Garbled sand sinks and the rest rises.'],
        sonar: ['Sonar', 'A ring spreads from your finger, shows the sand it crosses, then draws the gold back in.'], storm: ['Storm', 'Chain lightning. Each mite sends bolts out through the sand round it.'],
        defrag: ['Defrag', 'Garbled sand packed in a clump is rewritten into good sand.'], tracer: ['Tracer', 'Sparks jump from each mite to gold in reach and take it.'],
        magnet: ['Magnet', 'Gold is drawn through the pile to where you point.'], resonance: ['Resonance', 'On every beat a small pulse goes off at each mite at once.'],
        sifter: ['Sifter', 'A beam sweeps on the beat and shakes the gold it crosses up toward the surface.'], demolition: ['Demolition bots', 'Bots fly to the biggest clumps of garbled sand and blow them away.'],
        relay: ['Relay bots', 'Sparks jump mite to bot to mite, right across the pile, eating along every line.'],
        drum: ['Drum line', 'Each beat a row of sparks drops on the pile. Soft sand is collected and hard sand is worn down, top and bottom.'] };
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
        const hint = coachCards(!!offer);
        if (!offer) return;
        if (held !== null) letGo();
        cardsEl.replaceChildren(el('h3', { class: 'feed-cards-title', text: 'The swarm split. Pick one.' }), ...(hint ? [hint] : []),
            el('div', { class: 'feed-cards-row' }, ...offer.map((id, n) => { const [name, what] = CARD_TEXT[id] || [id, '']; const have = s.cards[id] || 0;
                const k = F().CARDS[id] || {}, tag = k.combo && !have ? 'Combo' : have ? `You have ${have}` : k.tool ? 'Tool' : 'New';
                return el('button', { type: 'button', class: `feed-card${k.combo ? ' combo' : k.rare ? ' rare' : ''}`, onclick: () => window.AGI.feedPick(n) },
                    el('strong', { text: name }), el('span', { text: what }), ...(k.combo ? [el('small', { class: 'feed-card-uses', text: `Uses up ${recipe(id)}` })] : []), el('em', { text: tag })); })));
    }
    // The first sessions come in stages (feed.js `stageOf`): the result says what the next session adds. PLACEHOLDER words.
    const STAGE_NEWS = { 2: 'New next session: at each split you pick a card for the swarm.', 3: 'New next session: the frenzy, and caches buried in the sand.' };
    const stageNews = (last, f) => { const next = F().stageOf(f); return last.stage && last.stage < F().STAGES && next > last.stage ? STAGE_NEWS[next] || '' : ''; };
    // The squad (2026-11-16, the owner's call: you choose which mites come). Names and lines are PLACEHOLDERS.
    const MITE_TEXT = { grazer: ['Grazer', 'Eats what you lead it to.'], prospector: ['Prospector', 'Goes for gold, and sees it from twice as far.'],
        scrubber: ['Scrubber', 'Decodes garbled sand into good sand, and stops it spreading nearby.'], driller: ['Driller', 'Bites through tough sand three times as fast.'],
        chomper: ['Chomper', 'Takes two grains at a bite.'] };
    let squadSaid = '';
    const MITE_LOOK = { grazer: 'loner', prospector: 'gold', scrubber: 'tidy', driller: 'drill', chomper: 'mega' };
    function miteIcon(kind, size = 40) {
        const dpr = Math.min(3, window.devicePixelRatio || 1), mini = el('canvas', { class: 'feed-mite-icon', width: String(size * dpr), height: String(size * dpr), 'aria-hidden': 'true' });
        const keep = ctx; ctx = mini.getContext('2d'); ctx.scale(dpr, dpr);
        try { drawMite(MITE_LOOK[kind], size / 2, size / 2 + (kind === 'chomper' ? 2 : 0), kind === 'chomper' ? size * 0.26 : size * 0.3); } finally { ctx = keep; }
        return mini;
    }
    function renderSquad(kids) {
        const info = window.AGI.feedMites?.(); if (!info) return;
        const all = F().MITE_IDS, open = info.open, locked = all.length - open.length;
        if (open.length < 2 && !locked) return;
        const toggle = kind => { let next = info.squad.includes(kind) ? info.squad.filter(k => k !== kind) : [...info.squad, kind]; if (next.length > info.slots) next = next.slice(next.length - info.slots); if (!next.length) next = [kind]; squadSaid = kind; window.AGI.feedSquad(next); pickKey = ''; };
        // A row of small tiles (a phone has the tanks to show under it), and one line for the mite you last tapped.
        const said = open.includes(squadSaid) ? squadSaid : info.squad[0], [sname, swhat] = MITE_TEXT[said] || ['', ''];
        kids.push(el('h3', { class: 'feed-pick-title', text: `Squad · ${info.squad.length}/${info.slots}` }),
            el('div', { class: 'feed-squad' },
                ...open.map(kind => { const [name, what] = MITE_TEXT[kind]; const on = info.squad.includes(kind);
                    return el('button', { type: 'button', class: on ? 'feed-mite on' : 'feed-mite', 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${name}: ${what}`, title: what, onclick: () => toggle(kind) },
                        miteIcon(kind, 36), el('strong', { text: name }), el('em', { text: on ? String(info.squad.indexOf(kind) + 1) : '' })); }),
                ...Array.from({ length: locked }, () => el('div', { class: 'feed-mite locked', 'aria-label': 'Not found yet' }, el('span', { class: 'feed-mite-q', text: '?' }), el('strong', { text: '???' })))),
            el('p', { class: 'feed-squad-said' }, el('strong', { text: sname }), document.createTextNode(` ${swhat}`)));
    }
    function carry(sector) { if (window.AGI.feedCarry(sector)) { pickKey = ''; view.want = null; trails = []; resetZoom(); } }
    function renderPick() {
        const f = feed(), wait = !!f?.session?.wait, on = !!(f && f.sessioned && (!f.session || wait)), live = !!(f && f.session) && !wait;
        pickEl.hidden = !on; endEl.hidden = !live; if (zoomEl) zoomEl.hidden = !live || !!f.session.offer; if (giveEl) giveEl.disabled = !live;
        if (legendEl) legendEl.hidden = true;
        promptEl.hidden = !!f?.sessioned;   // the prompt only where there are no sessions (the old Feed's test door)
        if (joyEl) joyEl.hidden = !live || zoom.k <= 1 || !!f.session.offer;
        if (!on) { pickKey = ''; return; }
        const list = E().feedStock(game()), last = f.lastSession, s = f.session;
        const key = JSON.stringify([list.map(e => [e.sector, e.total, e.cap, e.gold, e.bad, e.record]), last, wait, !!game().unlocked['module:path'] && game().res.rp >= E().pushCost(game(), 1).rp, window.AGI.feedMites?.()]);
        if (key === pickKey) return;
        pickKey = key;
        const kids = [], some = list.some(e => e.total > 0);
        // A result: the research first and large, then how it went. (PLACEHOLDER words.)
        const result = (head, research, detail) => el('div', { class: 'feed-last' }, el('strong', { text: head }), el('b', { class: 'feed-last-sum', text: `+${E().format(research)} research` }), el('span', { text: detail }));
        if (wait) kids.push(result(`Sector ${s.sector} is eaten. Your swarm is still hungry.`, s.research, `${plural(f.mites, 'mite', 'mites')} · ${plural(f.layers, 'split', 'splits')} · ${Math.round(s.time)} s so far`));
        // What next (the owner's pick, 2026-11-15): one button, Training when a sprint can be paid for, else Packet Snare.
        const next = () => { const g = game(), train = !!g.unlocked['module:path'] && g.res.rp >= E().pushCost(g, 1).rp;
            return el('button', { type: 'button', class: 'button feed-next', text: train ? 'Spend it in Training' : 'Catch more in Packet Snare', onclick: () => window.AGI.ringOpen?.(train ? 'training' : 'snare') }); };
        // How the tank went (2026-11-16): how much was eaten, what is left in it, and the moments.
        const tankLine = l => [l.cleared !== undefined ? `${l.cleared}% eaten` : '', l.left ? `${l.left} left in the tank${l.bad ? ` (${l.bad} garbled)` : ''}` : '', l.caches ? plural(l.caches, 'cache', 'caches') : '', l.frenzy ? `frenzy ${l.frenzy}` : '', l.corrupted ? `${l.corrupted} turned garbled` : ''].filter(Boolean).join(' · ');
        // (Once there is something stockpiled again, 'Every tank is eaten bare.' is about the last session, and says so: it sat over two full tanks. The owner's screenshot, 2026-11-19. PLACEHOLDER words.)
        if (!wait && last && E().isRing()) { kids.push(result(last.why === 'empty' && some ? 'Last session: every tank eaten bare.' : WHY[last.why] || 'Session over.', last.research,
            `${last.piles > 1 ? `${last.piles} stockpiles` : `Sector ${last.sector}`} · ${plural(last.mites, 'mite', 'mites')} · ${plural(last.layers, 'split', 'splits')} · ${last.time} s${last.record ? ' · New best' : ''}${last.cards ? ` · ${plural(last.cards, 'card', 'cards')}` : ''}`), ...(tankLine(last) ? [el('p', { class: 'feed-last-tank', text: tankLine(last) })] : []), ...(stageNews(last, f) ? [el('p', { class: 'feed-last-new', text: stageNews(last, f) })] : []), next()); }
        else if (last) kids.push(result(WHY[last.why] || 'Session over.', last.research,
            `${last.piles > 1 ? `${last.piles} stockpiles` : `Sector ${last.sector}`} · ${plural(last.mites, 'mite', 'mites')} · ${plural(last.layers, 'split', 'splits')} · ${last.time} s${last.record ? ' · New best' : ''}${last.cards ? ` · ${plural(last.cards, 'card', 'cards')}` : ''}`));
        if (!wait && some) renderSquad(kids);
        kids.push(el('h3', { class: 'feed-pick-title', text: wait ? 'Carry on with' : 'Tanks' }));
        // (One button to Packet Snare, not two: the owner's card, 2026-11-19. The result's own is kept when it is there.)
        const snareAlready = kids.some(k => { const b = k.matches?.('.feed-next') ? k : k.querySelector?.('.feed-next'); return b && /Packet Snare/.test(b.textContent); });
        if (!some) { kids.push(el('p', { class: 'feed-pick-none', text: 'Nothing stockpiled. Catch packets in Packet Snare to fill one.' }));
            if (!snareAlready) kids.push(el('button', { type: 'button', class: 'button feed-pick-snare', text: 'Go to Packet Snare', onclick: () => window.AGI.ringOpen?.('snare') })); }
        for (const e of list) {
            if (!e.total && (wait || !some)) continue;   // an empty stockpile's dead button is noise
            const pct = Math.round(Math.min(1, e.total / e.cap) * 100);
            const parts = [`${e.total}/${e.cap} packets`]; if (e.gold) parts.push(`${e.gold} gold`); if (e.bad) parts.push(`${e.bad} garbled`); if (e.record) parts.push(`best ${plural(e.record, 'split', 'splits')}`);
            kids.push(el('div', { class: e.full ? 'feed-pile full' : 'feed-pile' },
                el('div', { class: 'feed-pile-head' }, el('strong', { text: `Sector ${e.sector}` }), el('span', { class: 'feed-pile-tag', text: e.full ? 'Full' : '' })),
                // The tank's fill, its garbled share in its own colour at the bottom of the bar.
                el('div', { class: 'feed-pile-bar' }, el('div', { class: 'feed-pile-fill', style: `width:${pct}%` }, ...(e.bad ? [el('i', { class: 'feed-pile-bad', style: `width:${Math.round(e.bad / Math.max(1, e.total) * 100)}%` })] : []))),
                el('div', { class: 'feed-pile-foot' }, el('span', { text: parts.map(p => String(p).replace(/ /g, '\u00a0')).join(' · ') }),
                    el('button', { type: 'button', class: 'button feed-pile-start', text: wait ? 'Carry on' : 'Start session', ...(e.total > 0 ? {} : { disabled: '' }), onclick: () => (wait ? carry(e.sector) : start(e.sector)) }))));
        }
        if (wait) kids.push(el('button', { type: 'button', class: 'ghost-button feed-pick-finish', text: 'Finish here', onclick: () => { window.AGI.feedEnd('empty'); pickKey = ''; } }));
        pickEl.replaceChildren(...kids);
    }
    function letGo() { held = null; if (feed()) E().feedPoint(game(), null); }

    // ---- what happened (from game.js's loop) ------------------------------------------------------------------------
    // Sounds (2026-11-16): the game's own effects, by name, in the track's key and on its beat (sfx.js); none of The Feed's own yet.
    const sfx = (name, opts) => { try { window.SFX?.play?.(name, opts); } catch { /* no audio */ } };
    // The mite that took a grain (the nearest), and its bite's sound: each kind its own, a few a second at the most.
    function chewer(x, y) { const sw = feed()?.swarm || []; let best = -1, d = 36; sw.forEach((m, n) => { const dd = (m.x - x) ** 2 + (m.y - y) ** 2; if (dd < d && life[n]) { d = dd; best = n; } }); return best; }
    const BITE = { loner: ['click', { res: 'cp' }], follower: ['click', { res: 'cp' }], gold: ['click', { res: 'dp' }], tidy: ['click', { res: 'rp' }], drill: ['snareSlash'], mega: ['snareHit'] };
    const BITE_GAP = { drill: 260, mega: 340 };
    let biteAt = {};
    function biteSound(c, ev) {
        // the grazers only on a grain that pays well (gold), the others on what they're for: the prospector's gold, the
        // scrubber's decoding, the driller's tough sand, the chomper's big bites
        const kind = c || 'loner', now = performance.now();
        const worth = kind === 'gold' || kind === 'loner' || kind === 'follower' ? ev.kind === 'vein' : kind === 'tidy' ? ev.type === 'decode' : true;
        if (!worth || now - (biteAt[kind] || 0) < (BITE_GAP[kind] || 160)) return;
        biteAt[kind] = now;
        const [name, opts] = BITE[kind] || BITE.loner; sfx(name, opts);
    }
    function events(list, research = 0) {
        if (!dlg?.open) return;
        const now = performance.now();
        let gold = 0, eats = 0, decodes = 0;
        if (research > 0) paidAcc += research;
        const still = reduced();
        for (const ev of list) {
            if (ev.type === 'eat' || ev.type === 'decode') { const m = chewer(ev.x + 0.5, ev.y + 0.5); if (m >= 0) { life[m].chewAt = now; if (ev.type === 'decode') life[m].washAt = now; biteSound(feed().swarm[m].c, ev); } }
            if (ev.type === 'eat') {
                // Crumbs: a few of the grains eaten each frame throw a crumb of their own colour.
                if (!still && (eats++ < 6 || Math.random() < 0.04)) crumb(ev.x + 0.5, ev.y + 0.5, ev.pays ? (ev.kind === 'vein' ? colors.gold : ev.kind === 'cache' ? colors.research : null) : colors.packetBad);
                continue;
            }
            if (ev.type === 'decode') { if (!still && decodes++ < 3) burstBits(ev.x + 0.5, ev.y + 0.5, colors.good, 3, 5); continue; }
            if (ev.type === 'corrupt') { if (!still) for (const [x, y] of ev.pts.slice(0, 8)) burstBits(x, y, colors.packetBad, 2, 3); continue; }
            if (ev.type === 'cache') {
                if (coach?.key === 'cache') coachEnd(true); else if (game()) game().intro['feed:coach:cache'] = true;
                burstBits(ev.x, ev.y, colors.research, 46, 26); burstBits(ev.x, ev.y, colors.gold, 26, 18);
                sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'cache', r: 18 });
                floatText(ev.x, ev.y - 6, `CACHE +${E().format(ev.pay)}`, 'research', true);
                pops.push({ at: now, text: 'Buried cache cracked · a free card', color: 'research', big: true }); sfx('record');
                flash = { at: now, color: colors.research, a: 0.22 }; quake = Math.max(quake, 7);
                continue;
            }
            if (ev.type === 'tankClear') {
                pops.push({ at: now, text: `Tank eaten bare · +${E().format(ev.pay)} research`, color: 'gold', big: true }); sfx('snareBossDown');
                flash = { at: now, color: colors.gold, a: 0.3 }; quake = Math.max(quake, 9);
                const f = feed(); if (f) for (let n = 0; n < 4; n++) burstBits(f.x0 + (f.x1 - f.x0) * (n + 0.5) / 4, f.h - 4, colors.gold, 30, 30);
                continue;
            }
            if (ev.type === 'frenzy') {
                if (ev.tier > ev.from) { pops.push({ at: now, text: ev.tier >= 4 ? 'FEEDING FRENZY · MAX' : `Frenzy ${ev.tier} · ×${(1 + 0.25 * ev.tier).toFixed(2)} research`, color: FRENZY_COLOR[ev.tier], big: true });
                    const f = feed(); if (f) for (const m of f.swarm) burstBits(m.x, m.y, colors[FRENZY_COLOR[ev.tier]] || colors.gold, 10, 10);
                    quake = Math.max(quake, 2 + ev.tier); sfx('snareRace', { step: Math.min(8, ev.tier * 2) }); }
                continue;
            }
            if (ev.type === 'found') { if (ev.kind === 'fragment' || gold++ % 8 === 0) sparks.push({ at: now, x: ev.x + 0.5, y: ev.y + 0.5, kind: ev.kind }); }
            else if (ev.type === 'pulse') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'pulse', r: ev.r });
            else if (ev.type === 'arc') arcs.push({ at: now, ...ev });
            else if (ev.type === 'shake') shakeAt = now;
            else if (ev.type === 'sonar') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'sonar', r: ev.r });
            else if (ev.type === 'bolt') bolts.push({ at: now, pts: ev.pts });
            else if (ev.type === 'drum') for (const [x, y] of ev.hits) arcs.push({ at: now, x1: x, y1: Math.max(0, y - 80), x2: x, y2: y, gold: true });
            else if (ev.type === 'defrag') sparks.push({ at: now, x: ev.x, y: ev.y, kind: 'pulse', r: 3 });
            else if (ev.type === 'card' && ev.merged) pops.push({ at: now, text: `${ev.merged.map(cardName).join(' + ')} = ${cardName(ev.card)}`, color: 'gold', big: true });
            else if (ev.type === 'fragment') pops.push({ at: now, text: `Fragment ${ev.found}/${ev.of}`, color: 'primary' });
            else if (ev.type === 'layer') {
                pops.push({ at: now, text: ev.mite ? `The swarm splits · ${plural(ev.mites, 'mite', 'mites')}` : 'Fed', color: 'good', big: true });
                const f = feed(), c = f && f.swarm.length ? f.swarm[f.swarm.length - 1] : null;
                if (c) { sparks.push({ at: now, x: c.x, y: c.y, kind: 'split', r: 30 }); burstBits(c.x, c.y, colors.good, 36, 22); floatText(c.x, c.y - 8, `+${E().format(ev.pay)}`, 'research', true); }
                flash = { at: now, color: colors.good, a: 0.16 }; quake = Math.max(quake, 4); sfx('claim');
            }
        }
        if (sparks.length > 40) sparks.splice(0, sparks.length - 40);
        // Research rising off the swarm, a number at a time (the sum of a moment, not every grain).
        if (paidAcc > 0 && now - paidAt > 420) {
            const f = feed(), at = f && (f.aim || f.spot || f.swarm[0]);
            if (at) floatText(at.x, at.y - 4, `+${E().format(paidAcc)}`, 'research');
            paidAcc = 0; paidAt = now;
        }
    }
    // ---- particles ---------------------------------------------------------------------------------------------------
    const FRENZY_COLOR = ['good', 'good', 'gold', 'hot', 'research'];
    function crumb(x, y, color) {
        if (bits.length >= MAX_BITS) return;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 14 + Math.random() * 30;
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 90, life: 0.45 + Math.random() * 0.3, age: 0, color: color || null, size: 1 });
    }
    function burstBits(x, y, color, n, speed) {
        for (let k = 0; k < n && bits.length < MAX_BITS; k++) {
            const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.9);
            bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: 40, life: 0.6 + Math.random() * 0.6, age: 0, color, size: 1.6, glow: true });
        }
    }
    function floatText(x, y, text, color, big) { floats.push({ x, y, text, color, big, at: performance.now() }); if (floats.length > 14) floats.shift(); }

    // ---- drawing --------------------------------------------------------------------------------------------------
    function drawSand(f, now) {
        const lib = F(), { w, h, cells } = f, W3 = w * SUB;
        const blink = words(palette.fragment, reduced() ? 1 : 0.6 + 0.4 * Math.sin(now / 160)), flick = reduced() || !f.session ? 0 : 1 + ((now / 90) | 0);   // garbled sand seethes, a little at a time
        pixels.fill(0);
        const first = Math.max(0, Math.floor(view.y) - 1) * w;
        // Gold shows only near a mite (in its lamp; a prospector's reaches twice as far) or under the scanner's beam (the
        // owner's call, 2026-11-16: "making the gold only show up when nearby"); elsewhere it looks like any other sand.
        const lamp = F().FEED.lamp, lamps = f.swarm.map(m => [m.x, m.y, (lamp * (m.c === 'gold' ? F().MITES.prospector.lamp : 1)) ** 2]), beam = f.session?.beam ?? -1;
        const near = (x, y) => (beam >= 0 && x > beam - 8 && x <= beam) || lamps.some(([mx, my, r2]) => (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2 <= r2);
        for (let i = first; i < cells.length; i++) {
            const v = cells[i];
            if (!v) continue;
            const kind = lib.kindOf(v), x = i % w, y = (i - x) / w, shade = (i * 2654435761 >>> 0) % 5;
            const falling = lib.airOf(v), band = lib.bandOf(v) % palette.bands.length;
            let c;
            if (kind === 6) c = falling ? palette.fallingBad[shade] : flick && ((x * 7 + y * 13 + (i >> 4)) & 15) === flick % 16 ? palette.garbledHot[shade] : palette.garbled[(x + y * 3 + (i >> 3)) & 1][shade];
            else if (kind === 7 && lib.seenOf(v)) c = palette.cache[((x + y + (now >> 7)) & 3) === 0 ? 1 : 0][shade];
            else if (falling) c = palette.falling[band][shade];
            else if (kind === 1 || !lib.seenOf(v)) c = palette.bands[band][shade];
            else if (kind === 2) c = near(x, y) ? palette.gold[2 + (shade & 1)] : palette.bands[band][shade];
            else if (kind === 3) c = blink;
            else if (f.readable.includes(lib.KIND_IDS[kind])) c = palette.bands[band][shade];   // (sand the model has learned to read is just sand)
            else c = kind === 4 ? palette.numbers[(x + y) & 1][shade] : palette.pictures[x & 1][shade];
            // A grain: two by two, solid, in its own shade (fine sand reads as sand by its shades; the faded corners the
            // coarser grains had drew a mesh over a pile this fine).
            const p = y * SUB * W3 + x * SUB, body = c[0];
            pixels[p] = body; pixels[p + 1] = body; pixels[p + W3] = body; pixels[p + W3 + 1] = body;
        }
        sandCtx.putImageData(image, 0, 0);
    }
    // A mite (the owner's character sheet, 2026-11-14; their own colours, the same in every theme): the gold-hungry a
    // yellow blob in round glasses with a small frown; the tidy an orange burst of eight spokes; the
    // loner a grey mound with two big eyes; the follower a blue four-pointed star with sparkles; the mega mite a big
    // cream puff with a body to it. Empty-handed (the owner's call: the sheet with sand in their hands is not used). `q` is its radius in px.
    const INK = '#0b1a1c';
    function blob(x, y, q, lobes, color) {
        const lw = Math.max(1.5, q * 0.16), at = k => { const a = k / lobes * Math.PI * 2 + 0.3; return [x + Math.cos(a) * q * 0.55, y + Math.sin(a) * q * 0.5]; };
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(x, y, q * 0.7 + lw, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < lobes; k++) { const [lx, ly] = at(k); ctx.beginPath(); ctx.arc(lx, ly, q * 0.5 + lw, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, q * 0.7, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < lobes; k++) { const [lx, ly] = at(k); ctx.beginPath(); ctx.arc(lx, ly, q * 0.5, 0, Math.PI * 2); ctx.fill(); }
    }
    function eye(x, y, r, lookX, white) {
        if (white) { ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.28); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + lookX, y, white ? r * 0.5 : r, 0, Math.PI * 2); ctx.fill();
    }
    function star4(x, y, rx, ry, pinch) {
        ctx.beginPath(); ctx.moveTo(x, y - ry);
        ctx.quadraticCurveTo(x + rx * pinch, y - ry * pinch, x + rx, y); ctx.quadraticCurveTo(x + rx * pinch, y + ry * pinch, x, y + ry);
        ctx.quadraticCurveTo(x - rx * pinch, y + ry * pinch, x - rx, y); ctx.quadraticCurveTo(x - rx * pinch, y - ry * pinch, x, y - ry);
        ctx.closePath();
    }
    // (2026-11-16, the owner's pick, mites with character: each kind moves like itself. `st`, when given: `look` the way it
    // is heading (−1 left … 1 right), `chew` how far into a bite (0–1), `spin` how far its working part has turned, `now`.
    // The icons on the pick screen draw it at rest.)
    function drawMite(kind, x, y, q, st) {
        const lw = Math.max(1.5, q * 0.16), look = st ? st.look : 0.35, chew = st ? st.chew : 0, spin = st ? st.spin : 0;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // A bite squashes it a little, from its feet.
        const squash = kind === 'drill' || kind === 'tidy' ? 0 : chew;
        if (squash) { ctx.save(); ctx.translate(x, y + q * 0.7); ctx.scale(1 + 0.1 * squash, 1 - 0.13 * squash); ctx.translate(-x, -y - q * 0.7); }
        try { drawMiteBody(kind, x, y, q, lw, look, chew, spin, st); } finally { if (squash) ctx.restore(); }
    }
    function drawMiteBody(kind, x, y, q, lw, look, chew, spin, st) {
        if (kind === 'tidy') {
            // A burst of eight rounded spokes, turning as it scrubs (faster while it decodes).
            for (const [color, w] of [[INK, q * 0.5 + lw * 2], ['#e8743b', q * 0.5]]) {
                ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
                for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2 + spin; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * q * 0.95, y + Math.sin(a) * q * 0.95); }
                ctx.stroke();
            }
            eye(x - q * 0.2, y - q * 0.05, q * 0.11, q * 0.04 * look); eye(x + q * 0.2, y - q * 0.05, q * 0.11, q * 0.04 * look);
        } else if (kind === 'loner') {
            // A grey mound, flat on the ground, with two oversized eyes looking the way it's going.
            ctx.beginPath(); ctx.moveTo(x - q, y + q * 0.7); ctx.bezierCurveTo(x - q * 1.05, y - q * 0.75, x + q * 1.05, y - q * 0.75, x + q, y + q * 0.7); ctx.quadraticCurveTo(x, y + q * 0.95, x - q, y + q * 0.7); ctx.closePath();
            ctx.fillStyle = '#c4c7cc'; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.fill(); ctx.stroke();
            const lx = q * 0.16 * Math.sign(look || 1) * Math.max(0.4, Math.abs(look)), ex = look < -0.2 ? -0.07 : 0;
            eye(x + q * (-0.36 + ex), y - q * 0.5, q * 0.46, lx, true); eye(x + q * (0.5 + ex), y - q * 0.55, q * 0.46, lx, true);
            // its mouth, open mid-bite
            if (chew > 0.2) { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x + q * 0.08 * look, y + q * 0.32, q * 0.16, q * 0.1 * chew, 0, 0, Math.PI * 2); ctx.fill(); }
        } else if (kind === 'follower') {
            // A four-pointed star, blue to violet, leaning the way it's going, with two small sparkles that twinkle.
            ctx.save(); ctx.translate(x, y); ctx.rotate(0.18 * look); ctx.translate(-x, -y);
            const g = ctx.createLinearGradient(x - q, y - q, x + q, y + q); g.addColorStop(0, '#4c9bf6'); g.addColorStop(1, '#8b6cf0');
            star4(x, y, q * 1.15, q * 1.25, 0.2); ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.fill(); ctx.stroke();
            ctx.fillStyle = INK; for (const ex of [-0.17, 0.17]) { ctx.beginPath(); ctx.ellipse(x + q * (ex + 0.06 * look), y, q * 0.07, q * 0.12 * (1 - 0.6 * chew), 0, 0, Math.PI * 2); ctx.fill(); }
            const tw = st ? 0.75 + 0.25 * Math.sin(st.now / 160 + x) : 1;
            ctx.fillStyle = '#4c9bf6'; star4(x + q * 0.75, y - q * 1.0, q * 0.26 * tw, q * 0.3 * tw, 0.2); ctx.fill(); star4(x + q * 1.1, y - q * 0.6, q * 0.18 * (1.75 - tw), q * 0.2 * (1.75 - tw), 0.2); ctx.fill();
            ctx.restore();
        } else if (kind === 'mega') {
            // A big cream puff with a body to it (the owner's sheet): a scalloped head over a wider belly, bumps down its
            // sides and two feet; its face in a soft ring; its arms open.
            const puffs = [[0, 0.3, 0.74], [0, -0.42, 0.6], [-0.36, 0.98, 0.27], [0.36, 0.98, 0.27]];
            for (let k = 0; k < 7; k++) { const t = Math.PI * (1.08 + k * 0.14); puffs.push([Math.cos(t) * 0.6, -0.42 + Math.sin(t) * 0.58, 0.25]); }
            for (const s of [-1, 1]) puffs.push([s * 0.66, -0.12, 0.25], [s * 0.76, 0.24, 0.27], [s * 0.7, 0.62, 0.27]);
            ctx.fillStyle = INK; for (const [px0, py0, pr] of puffs) { ctx.beginPath(); ctx.arc(x + px0 * q, y + py0 * q, pr * q + lw, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = '#f6e6c8'; for (const [px0, py0, pr] of puffs) { ctx.beginPath(); ctx.arc(x + px0 * q, y + py0 * q, pr * q, 0, Math.PI * 2); ctx.fill(); }
            const fy = y - q * 0.42;
            ctx.strokeStyle = '#d9b98a'; ctx.lineWidth = Math.max(1, q * 0.055); ctx.beginPath(); ctx.ellipse(x, fy, q * 0.5, q * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
            eye(x - q * 0.2, fy - q * 0.06, q * 0.08, 0); eye(x + q * 0.2, fy - q * 0.06, q * 0.08, 0);
            if (chew > 0.2) { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, fy + q * 0.12, q * 0.13, q * 0.13 * chew, 0, 0, Math.PI * 2); ctx.fill(); }   // a big chomp
            else { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, q * 0.06); ctx.beginPath(); ctx.arc(x, fy + q * 0.02, q * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
            ctx.fillStyle = 'rgba(240, 130, 110, 0.75)'; for (const bx of [-0.36, 0.36]) { ctx.beginPath(); ctx.arc(x + q * bx, fy + q * 0.08, q * 0.09, 0, Math.PI * 2); ctx.fill(); }
            ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, q * 0.07);
            ctx.beginPath(); ctx.arc(x - q * 0.34, y + q * 0.36, q * 0.17, 0.1 * Math.PI, 1.3 * Math.PI, true); ctx.stroke();
            ctx.beginPath(); ctx.arc(x + q * 0.34, y + q * 0.36, q * 0.17, 0.9 * Math.PI, -0.3 * Math.PI); ctx.stroke();
        } else if (kind === 'drill') {
            // The driller (2026-11-16, placeholder art in the sheet's style): a teal drill bit pointing down, a spiral groove
            // round it, a darker cap with two eyes on top. It leans the way it's going, and its groove runs as it bores.
            ctx.save(); ctx.translate(x, y); ctx.rotate(-0.4 * look); ctx.translate(-x, -y);
            if (chew) { ctx.translate(Math.sin(spin * 9) * q * 0.05, 0); }
            ctx.beginPath(); ctx.moveTo(x - q * 0.8, y - q * 0.35); ctx.lineTo(x + q * 0.8, y - q * 0.35); ctx.lineTo(x + q * 0.12, y + q * 1.05); ctx.lineTo(x - q * 0.12, y + q * 1.05); ctx.closePath();
            ctx.fillStyle = '#3cc6b8'; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#1f6f68'; ctx.lineWidth = Math.max(1, q * 0.1); ctx.beginPath();
            const run = ((spin % 1) + 1) % 1;
            for (const k of [0, 1, 2]) { const t = k + run, yy = y - q * 0.1 + t * q * 0.36, half = q * 0.68 * (1 - (t + 0.4) / 3.2); if (half > q * 0.05) { ctx.moveTo(x - half, yy); ctx.lineTo(x + half, yy + q * 0.16); } }
            ctx.stroke();
            ctx.beginPath(); ctx.roundRect(x - q * 0.62, y - q * 0.95, q * 1.24, q * 0.66, q * 0.24);
            ctx.fillStyle = '#2a8f86'; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.fill(); ctx.stroke();
            eye(x - q * 0.22, y - q * 0.62, q * 0.17, q * 0.06 * look, true); eye(x + q * 0.22, y - q * 0.62, q * 0.17, q * 0.06 * look, true);
            ctx.restore();
        } else {
            // The gold-hungry (and any mite with no character): a yellow blob in round glasses.
            blob(x, y, q, 7, '#f9c22e');
            ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, q * 0.09); ctx.beginPath(); ctx.moveTo(x - q * 0.03, y - q * 0.15); ctx.lineTo(x + q * 0.07, y - q * 0.15); ctx.stroke();
            eye(x - q * 0.3, y - q * 0.15, q * 0.27, q * 0.1 * look, true); eye(x + q * 0.34, y - q * 0.15, q * 0.27, q * 0.1 * look, true);
            // a glint sweeps across its glasses now and then
            const gl = st ? ((st.now / 1000 + x * 0.01) % 2.6) / 0.5 : 9;
            if (gl < 1) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, q * 0.07); for (const ex of [-0.3, 0.34]) { const gx = x + q * ex + q * 0.27 * (gl * 2 - 1) * 0.7; ctx.beginPath(); ctx.moveTo(gx - q * 0.06, y - q * 0.27); ctx.lineTo(gx + q * 0.06, y - q * 0.03); ctx.stroke(); } }
            // A small frown.
            ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, q * 0.09); ctx.beginPath(); ctx.arc(x + q * 0.38, y + q * 0.5, q * 0.14, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
        }
    }
    // The tank (the owner's pick, a living tank): a glow behind it, dark glass with a sheen, motes drifting up in its light,
    // marks up its side for how full it is, and walls that light up, in the frenzy's colour once the swarm is in one.
    function drawTank(f, now, c, still, tier, dt) {
        const [lx, ty] = px(f.x0, f.tankTop), [rx, by] = px(f.x1, f.h), wdt = rx - lx, hgt = by - ty, mid = (lx + rx) / 2;
        const hue = tier ? FRENZY_COLOR[tier] : 'primary';
        const back = ctx.createRadialGradient(mid, by, 8, mid, by, Math.max(wdt, hgt) * 1.15);
        back.addColorStop(0, tint(hue, tier ? 0.2 + tier * 0.03 : 0.14)); back.addColorStop(1, tint(hue, 0));
        ctx.fillStyle = back; ctx.fillRect(0, 0, view.w, view.h);
        const glass = ctx.createLinearGradient(lx, 0, rx, 0);
        glass.addColorStop(0, tint('primary', 0.13)); glass.addColorStop(0.18, tint('primary', 0.03)); glass.addColorStop(0.8, tint('primary', 0.02)); glass.addColorStop(1, tint('primary', 0.11));
        ctx.fillStyle = glass; ctx.fillRect(lx, ty, wdt, hgt);
        // A faint grid on the glass, every 16 cells.
        ctx.strokeStyle = tint('primary', 0.06); ctx.lineWidth = 1; ctx.beginPath();
        for (let x = f.x0 + 16; x < f.x1; x += 16) { const [gx] = px(x, 0); ctx.moveTo(gx, ty); ctx.lineTo(gx, by); }
        for (let y = f.h - 16; y > f.tankTop; y -= 16) { const [, gy] = px(0, y); ctx.moveTo(lx, gy); ctx.lineTo(rx, gy); }
        ctx.stroke();
        // Motes: dust rising through the glass.
        if (!still) {
            while (motes.length < 26) motes.push({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, p: Math.random() * 6 });
            ctx.fillStyle = tint(hue, 0.35);
            for (const m of motes) { m.y -= m.v * dt * (1 + tier * 0.5); if (m.y < 0) { m.y = 1; m.x = Math.random(); } const x = lx + (m.x + Math.sin(now / 1400 + m.p) * 0.02) * wdt, y = ty + m.y * hgt; ctx.globalAlpha = 0.25 + 0.5 * Math.sin(m.y * Math.PI); ctx.fillRect(x, y, 2, 2); }
            ctx.globalAlpha = 1;
        }
        // Marks up the left wall: a quarter, a half, three quarters; the rim, dashed.
        ctx.strokeStyle = tint('text', 0.35); ctx.lineWidth = 1.5; ctx.beginPath();
        for (const q of [0.25, 0.5, 0.75]) { const y = by - hgt * q; ctx.moveTo(lx - 9, y); ctx.lineTo(lx - 3, y); }
        ctx.stroke();
        ctx.setLineDash([5, 6]); ctx.strokeStyle = tint('text', 0.3); ctx.beginPath(); ctx.moveTo(lx, ty); ctx.lineTo(rx, ty); ctx.stroke(); ctx.setLineDash([]);
        // The walls and floor, glowing.
        const glowA = tier ? 0.55 + (still ? 0 : 0.25 * Math.sin(now / (200 - tier * 25))) : 0.5;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (const [w, a] of [[9, glowA * 0.18], [4, glowA * 0.45], [2, 1]]) {
            ctx.strokeStyle = a === 1 ? colors[hue] || colors.primary : tint(hue, a); ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(lx - 2, ty - 4); ctx.lineTo(lx - 2, by + 2); ctx.lineTo(rx + 2, by + 2); ctx.lineTo(rx + 2, ty - 4); ctx.stroke();
        }
    }
    // Where each mite has been: a fading ribbon, in the frenzy's colour.
    function drawTrails(f, tier, r) {
        while (trails.length < f.swarm.length) trails.push([]);
        trails.length = f.swarm.length;
        const hue = FRENZY_COLOR[tier] || 'good', keep = 8 + tier * 3;
        f.swarm.forEach((m, n) => {
            const t = trails[n]; t.push(px(m.x, m.y)); if (t.length > keep) t.splice(0, t.length - keep);
            if (t.length < 3) return;
            for (let k = 1; k < t.length; k++) {
                const a = k / t.length;
                if (Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1]) > r * 6) continue;   // a jump of the view, not a move
                ctx.strokeStyle = tint(hue, a * (0.18 + tier * 0.08)); ctx.lineWidth = Math.max(1, r * 0.5 * a);
                ctx.beginPath(); ctx.moveTo(t[k - 1][0], t[k - 1][1]); ctx.lineTo(t[k][0], t[k][1]); ctx.stroke();
            }
        });
    }
    function drawBits(c, dt) {
        if (!bits.length) return;
        const size = Math.max(1.6, c * 1.1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        bits = bits.filter(b => (b.age += dt) < b.life);
        for (const b of bits) {
            b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 1.5;
            const [x, y] = px(b.x, b.y), a = 1 - b.age / b.life, q = size * b.size * (b.glow ? 0.6 + a * 0.6 : 1);
            ctx.globalAlpha = a; ctx.fillStyle = b.color || colors.muted;
            ctx.fillRect(x - q / 2, y - q / 2, q, q);
        }
        ctx.restore(); ctx.globalAlpha = 1;
    }
    function drawFloats(now, still) {
        floats = floats.filter(t => now - t.at < 1100);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const t of floats) {
            const age = (now - t.at) / 1100, [x, y0] = px(t.x, t.y), y = y0 - (still ? 0 : age * 34) - 6;
            ctx.globalAlpha = Math.min(1, (1 - age) * 2.5);
            ctx.font = `700 ${t.big ? 16 : 12}px ${colors.mono}`;
            ctx.lineWidth = 3; ctx.strokeStyle = colors.bg; ctx.strokeText(t.text, x, y);
            ctx.fillStyle = colors[t.color] || colors.text; ctx.fillText(t.text, x, y);
        }
        ctx.globalAlpha = 1;
    }
    function draw(now) {
        const f = feed(); if (!f || !palette || !view.w) return;
        const box = F().FEED, still = reduced();
        settle(f);
        const c = view.cell;
        ctx.clearRect(0, 0, view.w, view.h);
        const dt = lastDraw ? Math.min(0.05, (now - lastDraw) / 1000) : 0; lastDraw = now;
        quake = still ? 0 : quake * Math.pow(0.004, dt); if (quake < 0.3) quake = 0;
        ctx.save();
        if (quake) ctx.translate((Math.random() - 0.5) * quake, (Math.random() - 0.5) * quake);
        const inTank = !!(f.session && !f.session.wait), tier = inTank ? f.session.tier || 0 : 0;
        if (inTank) drawTank(f, now, c, still, tier, dt);
        // The box: its floor, and its walls and the spout's mouth where they are in view (outside a session: it pours).
        const [x0, y0] = px(0, 0), [x1, y1] = px(box.w, box.h);
        if (!inTank) { ctx.strokeStyle = colors.border; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x0 - 1, Math.max(0, y0)); ctx.lineTo(x0 - 1, y1 + 1); ctx.lineTo(x1 + 1, y1 + 1); ctx.lineTo(x1 + 1, Math.max(0, y0)); ctx.stroke(); }
        if (!inTank && y0 > -c * 8) {
            // The spout, where it is on its swing.
            const [sx] = px(F().spoutX(f) + 0.5, 0), mouth = (box.spout + 6) * c;
            ctx.beginPath(); ctx.moveTo(sx - mouth * 1.5, y0 - 1); ctx.lineTo(sx - mouth, y0 + c * 3); ctx.moveTo(sx + mouth * 1.5, y0 - 1); ctx.lineTo(sx + mouth, y0 + c * 3); ctx.stroke();
        }
        drawSand(f, now);
        // Zoomed in, grains are drawn as crisp squares; drawn small they are smoothed.
        ctx.imageSmoothingEnabled = c < 7; ctx.imageSmoothingQuality = 'low';
        const jig = !still && now - shakeAt < 180 ? Math.sin(now / 12) * 2 : 0;   // the algo-rhythm's beat
        ctx.drawImage(sand, view.x * SUB, view.y * SUB, view.vc * SUB, view.vr * SUB, view.ox + jig, view.oy, view.vc * c, view.vr * c);
        // Packets on their way down: arrowheads, as in Packet Snare, with a little static in them.
        const size = Math.max(5, c * 6.4);
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
            const age = Math.max(0, (now - s.at) / SPARK_MS), [x, y] = px(s.x, s.y);   // never before its time: an event is stamped by the clock, a frame by when it began
            if (s.kind === 'split' || s.kind === 'cache') {
                // A shockwave: two rings racing out.
                ctx.globalAlpha = (1 - age) * 0.9; ctx.strokeStyle = s.kind === 'cache' ? colors.research : colors.good;
                for (const k of [1, 0.6]) { ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(x, y, c * s.r * (0.15 + age * k * 1.2) + 6, 0, Math.PI * 2); ctx.stroke(); }
                continue;
            }
            if (s.kind === 'vein' || s.kind === 'fragment') {
                // A glint: a four-pointed twinkle that turns as it fades.
                const r = (5 + age * 6) * (1 - age * 0.5); ctx.globalAlpha = 1 - age; ctx.fillStyle = s.kind === 'vein' ? colors.gold : colors.text;
                ctx.save(); ctx.translate(x, y); ctx.rotate(age * 1.5); ctx.beginPath();
                for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = k % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
                ctx.closePath(); ctx.fill(); ctx.restore();
                continue;
            }
            ctx.globalAlpha = 1 - age; ctx.strokeStyle = s.kind === 'pulse' ? colors.good : s.kind === 'sonar' ? colors.gold : colors.text; ctx.lineWidth = s.kind === 'pulse' || s.kind === 'sonar' ? 2.5 : 1.5;
            // A pulse grows; the Sonar's ring, at its full reach, closes back in.
            ctx.beginPath(); ctx.arc(x, y, s.kind === 'pulse' ? c * s.r * (0.4 + age * 0.8) : s.kind === 'sonar' ? c * s.r * (1 - age * 0.85) : c * (2 + age * 8), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The tools: the scanner's beam, arcs between mites, the sorter bots.
        const sess = f.session;
        if (sess && sess.beam >= 0) { const [bx] = px(sess.beam, 0); ctx.strokeStyle = colors.primary; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, view.h); ctx.stroke(); ctx.globalAlpha = 0.12; ctx.fillStyle = colors.primary; ctx.fillRect(bx - c * 8, 0, c * 8, view.h); ctx.globalAlpha = 1; }
        if (sess && sess.sift >= 0) { const [bx] = px(sess.sift, 0); ctx.strokeStyle = colors.gold; ctx.globalAlpha = 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, view.h); ctx.stroke(); ctx.globalAlpha = 1; }
        if (sess) for (const b of [sess.dbot, ...(sess.rbots || [])]) if (b) { const [x, y] = px(b.x, b.y), q = Math.max(4, c * 2.8); ctx.fillStyle = colors.bg; ctx.fillRect(x - q / 2 - 1, y - q * 1.5 - 1, q + 2, q + 2); ctx.fillStyle = b === sess.dbot ? colors.packetBad : colors.text; ctx.fillRect(x - q / 2, y - q * 1.5, q, q); }
        if (sess && sess.ring) { const [rx, ry] = px(sess.ring.x, sess.ring.y); ctx.strokeStyle = colors.primary; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, Math.max(1, sess.ring.r * c), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        bolts = bolts.filter(b => now - b.at < 320);
        for (const b of bolts) { ctx.globalAlpha = 1 - (now - b.at) / 320; ctx.strokeStyle = colors.text; ctx.lineWidth = 2; ctx.beginPath(); b.pts.forEach((p, n) => { const [x, y] = px(p[0], p[1]); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
        ctx.globalAlpha = 1;
        arcs = arcs.filter(a => now - a.at < 260);
        for (const a of arcs) { const [ax, ay] = px(a.x1, a.y1), [bx, by] = px(a.x2, a.y2), mx = (ax + bx) / 2 + (still ? 0 : Math.sin(a.at + now / 20) * 6), my = (ay + by) / 2 + (still ? 0 : Math.cos(a.at + now / 17) * 6);
            ctx.globalAlpha = 1 - (now - a.at) / 260; ctx.strokeStyle = a.gold ? colors.gold : colors.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.lineTo(bx, by); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (sess && sess.bots) for (const b of sess.bots) { const [x, y] = px(b.x, b.y), q = Math.max(4, c * 2.8); ctx.fillStyle = colors.bg; ctx.fillRect(x - q / 2 - 1, y - q / 2 - 1, q + 2, q + 2); ctx.fillStyle = colors.gold; ctx.fillRect(x - q / 2, y - q / 2, q, q); }
        // The point you tapped: a pin that stays until you tap elsewhere (or tap it again).
        if (f.spot && !f.aim) {
            const [x, y] = px(f.spot.x, f.spot.y);
            ctx.strokeStyle = colors.text; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([2, 5]);
            ctx.beginPath(); ctx.arc(x, y, c * box.near, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.globalAlpha = 0.95; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16); ctx.stroke();
            ctx.fillStyle = colors.text; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x + 10, y - 12.5); ctx.lineTo(x, y - 9); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
        }
        // The point you hold.
        if (f.aim) {
            const [x, y] = px(f.aim.x, f.aim.y);
            ctx.strokeStyle = colors.good; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(x, y, c * box.near, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        // The swarm, each mite drawn as its character (`drawMite`). They grow with the view, so zoomed in they show their detail.
        const r = Math.max(6, Math.min(26, c * 3.2));
        if (inTank && !still) drawTrails(f, tier, r);
        const bob = 1 + tier * 0.35;   // a frenzied swarm jitters faster
        // What each mite is up to, for the drawing (`life`): where it's heading, how far into a bite, its working part's turn.
        while (life.length < f.swarm.length) life.push({ x: null, y: null, look: 0.35, chewAt: -1e9, spin: 0, washAt: -1e9 });
        life.length = f.swarm.length;
        // The scrubber's ward (where nothing turns garbled) and the prospector's lamp, under the swarm.
        if (inTank) f.swarm.forEach((m, n) => {
            const [x, y] = px(m.x, m.y);
            if (m.c === 'tidy' && (f.session.corrupted || hasGarbled(f))) {
                ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#e8743b'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]); ctx.lineDashOffset = still ? 0 : -now / 90;
                ctx.beginPath(); ctx.arc(x, y, box.ward * c, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            } else if (m.c === 'gold') {
                const a = life[n].look >= 0 ? 0.35 : Math.PI - 0.35, reach = box.lamp * F().MITES.prospector.lamp * c;
                const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, reach); g.addColorStop(0, tint('gold', 0.2)); g.addColorStop(1, tint('gold', 0));
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, reach, a - 0.45, a + 0.45); ctx.closePath(); ctx.fill();
            }
        });
        f.swarm.forEach((m, n) => {
            let [x, y] = px(m.x, m.y);
            const L = life[n], dt2 = Math.max(0.001, dt);
            if (L.x != null) { const vx = (m.x - L.x) / dt2; if (Math.abs(vx) > 2) L.look += (Math.max(-1, Math.min(1, vx / 25)) - L.look) * Math.min(1, dt2 * 6); }
            L.x = m.x; L.y = m.y;
            const since = (now - L.chewAt) / 1000, chew = still || since > 0.25 ? 0 : Math.abs(Math.sin(since / 0.25 * Math.PI));
            L.spin += dt2 * (m.c === 'tidy' ? (now - L.washAt < 400 ? 3 : 0.6) : m.c === 'drill' ? (since < 0.3 ? 4 : 0.3) : 0);
            if (!still) { x += Math.cos(now / 90 * bob + n * 2.4) * r * 0.2; y += Math.sin(now / 70 * bob + n * 1.7) * r * 0.2; }
            if (tier > 0) {
                // A frenzied mite glows: wider and hotter with each tier.
                const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * (1.6 + tier * 0.35));
                glow.addColorStop(0, tint(FRENZY_COLOR[tier], 0.18 + tier * 0.08)); glow.addColorStop(1, tint(FRENZY_COLOR[tier], 0));
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * (1.6 + tier * 0.35), 0, Math.PI * 2); ctx.fill();
            }
            drawMite(m.c, x, y, m.c === 'mega' ? r * 1.5 : r, still ? null : { look: L.look, chew, spin: L.spin, now });
        });
        drawBits(c, dt);
        // The camera: the sand and the mites under the point you hold, enlarged, in a window of its own.
        if (f.aim && held !== null && camMode !== 'off') {
            const [CW, CH] = camSize();
            const [fx, fy] = px(f.aim.x, f.aim.y), k = Math.max(CAM_CELL, c * 1.6), cols = CW / k, rows = CH / k;
            let lx = Math.max(8, (view.w - CW) / 2), ly = 8;
            if (camMode === 'follow') { lx = Math.max(4, Math.min(view.w - CW - 4, fx - CW / 2)); ly = fy - CAM_UP - CH; if (ly < 4) ly = Math.min(view.h - CH - 4, fy + CAM_UP); }
            const x0 = f.aim.x - cols / 2, y0 = f.aim.y - rows / 2;
            ctx.save();
            ctx.beginPath(); ctx.roundRect(lx, ly, CW, CH, 8); ctx.clip();
            ctx.fillStyle = colors.bg; ctx.fillRect(lx, ly, CW, CH);
            // The part of the box that is in its frame (never asking the sand's canvas for pixels outside it).
            const sx0 = Math.max(0, x0), sy0 = Math.max(0, y0), sx1 = Math.min(box.w, x0 + cols), sy1 = Math.min(box.h, y0 + rows);
            if (sx1 > sx0 && sy1 > sy0) { ctx.imageSmoothingEnabled = false; ctx.drawImage(sand, sx0 * SUB, sy0 * SUB, (sx1 - sx0) * SUB, (sy1 - sy0) * SUB, lx + (sx0 - x0) * k, ly + (sy0 - y0) * k, (sx1 - sx0) * k, (sy1 - sy0) * k); }
            if (y0 + rows > box.h) { ctx.fillStyle = colors.border; ctx.fillRect(lx, ly + (box.h - y0) * k, CW, 2); }
            const mr = Math.max(7, Math.min(14, k * 2.6));
            for (const m of f.swarm) { const mx = lx + (m.x - x0) * k, my = ly + (m.y - y0) * k; if (mx > lx - 40 && mx < lx + CW + 40 && my > ly - 40 && my < ly + CH + 40) drawMite(m.c, mx, my, m.c === 'mega' ? mr * 1.5 : mr); }
            // The point itself.
            ctx.strokeStyle = colors.text; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5;
            const cx = lx + CW / 2, cy = ly + CH / 2;
            ctx.beginPath(); ctx.moveTo(cx - 7, cy); ctx.lineTo(cx - 2, cy); ctx.moveTo(cx + 2, cy); ctx.lineTo(cx + 7, cy); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy - 2); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy + 7); ctx.stroke();
            ctx.restore();
            ctx.globalAlpha = 1; ctx.strokeStyle = colors.good; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(lx, ly, CW, CH, 8); ctx.stroke();
        }
        drawFloats(now, still);
        ctx.restore();
        if (flash) { const age = (now - flash.at) / 380; if (age >= 1 || still) flash = null; else { ctx.fillStyle = flash.color; ctx.globalAlpha = flash.a * (1 - age); ctx.fillRect(0, 0, view.w, view.h); ctx.globalAlpha = 1; } }
        if (tier >= 3 && !still) {
            // The edges burn at the top of the frenzy.
            const pulse = 0.5 + 0.5 * Math.sin(now / (tier >= 4 ? 110 : 180));
            ctx.strokeStyle = tint(FRENZY_COLOR[tier], 0.25 + pulse * 0.35); ctx.lineWidth = 6 + pulse * 6; ctx.strokeRect(0, 0, view.w, view.h);
        }
        drawCoach(now);
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
        // (PLACEHOLDER lines.) Starving first; then how to lead; then, while it spreads, the garbled sand.
        if (f.sessioned) { const s = f.session; if (!s || s.wait) return '';
            if (f.life < 0.25) return '> They are starving. Lead them to good sand.';
            if (!f.aim && !f.spot) return '> Tap to set a point, or hold and drag to lead them.';
            if ((s.corrupted || 0) > 0 && s.time < 25) return '> The garbled sand is spreading.';
            return (s.tier || 0) >= 2 ? '> Keep them fed. Don\'t let them stop.' : ''; }
        if (!f.stats.delivered) return '> Nothing to eat yet.';
        if (lib.left(f) === 0) return '> It is still hungry.';
        if (!f.stats.eaten && !f.stats.cleaned && !f.aim) return '> Show it where to start.';
        return '';
    }
    // ---- the walkthrough ---------------------------------------------------------------------------------------------
    // (The owner's call, 2026-11-16: no legend or prompt in a run, "we can have a tutorial if anything to walk through the
    // game the first time".) As Packet Snare's walkthroughs: the first time each thing comes up in a session, a spotlight on
    // it, a ghost finger playing the gesture, and one line; the field slows while you're shown what to do with your hands
    // (`slow`), and a step that only tells you something shows for `info` seconds at full speed. Each step is done once
    // (state.intro `feed:coach:<key>`), or shown twice if you never do it (`feed:coachSeen:<key>`); Reset The Feed clears
    // them. The words are PLACEHOLDERS, in the terminal voice.
    const COACH_SLOW = 0.2, COACH_TRIES = 2, COACH_MAX = 14;
    let coach = null, coachOffer = false;
    const intro = () => game()?.intro || {};
    const swarmMid = f => { const n = f.swarm.length || 1; const x = f.swarm.reduce((a, m) => a + m.x, 0) / n, y = f.swarm.reduce((a, m) => a + m.y, 0) / n; return { x, y, r: Math.max(6, ...f.swarm.map(m => Math.hypot(m.x - x, m.y - y))) + 5 }; };
    // The good grain nearest the top of the sand, a little way from the swarm (somewhere worth leading them to).
    function goodTarget(f) {
        const lib = F(), { w, cells } = f, mid = swarmMid(f), lo = f.x0 || 0, hi = f.x1 || w;
        // a little under the surface, so the spotlight is on the field (a full tank's sand reaches the top of the view)
        const first = cells.findIndex(v => v), from = first < 0 ? 0 : (Math.floor(first / w) + 8) * w;
        let best = null;
        for (let i = from; i < cells.length && !best; i++) {
            const v = cells[i], x = i % w;
            if (!v || x < lo + 4 || x >= hi - 4) continue;
            const k = lib.kindOf(v);
            if ((k === 1 || k === 2 || k === 3) && Math.abs(x - mid.x) > Math.max(12, (hi - lo) * 0.25)) best = { x: x + 0.5, y: Math.floor(i / w) + 2.5 };
        }
        return best;
    }
    // The grain of a kind nearest the swarm (a garbled one; a found cache).
    function nearestOf(f, test) {
        const lib = F(), { w, cells } = f, mid = swarmMid(f);
        let best = null, d = Infinity;
        for (let i = 0; i < cells.length; i++) { const v = cells[i]; if (!v || !test(lib.kindOf(v), v)) continue; const x = i % w + 0.5, y = Math.floor(i / w) + 0.5, dd = Math.hypot(x - mid.x, y - mid.y); if (dd < d) { d = dd; best = { x, y }; } }
        return best;
    }
    const COACHES = [
        { key: 'lead', slow: COACH_SLOW, when: f => f.session.time > 0.4 && goodTarget(f),
            aim: (f, t) => { const m = swarmMid(f); return { x: t.x, y: t.y, r: 7, gesture: 'drag', from: { x: m.x, y: m.y } }; },
            keep: true,
            text: () => (PHONE ? '> Hold and drag to lead the swarm. They eat where you point.' : '> Hold the mouse button and drag to lead the swarm. They eat where you point.'),
            // done once you've led them and they've eaten a little there
            done: (f, c) => !!c.touched && (f.stats.eaten - c.eaten0) >= 12 },
        { key: 'garbled', after: 'lead', info: 4.5, when: f => nearestOf(f, k => k === 6),
            aim: (f, t) => ({ x: t.x, y: t.y, r: 6, gesture: 'mark', color: 'packetBad' }),
            text: () => '> That sand is garbled. It pays nothing, and it slowly turns the sand round it garbled too.' },
        { key: 'frenzy', after: 'lead', info: 4.5, when: f => (f.session.tier || 0) >= 1 && true,
            aim: f => ({ ...swarmMid(f), gesture: 'mark', color: 'gold' }), pulse: () => frenzyEl,
            text: () => '> A frenzy. Keep them eating and every grain pays more. Let them stop and it cools.' },
        { key: 'hunger', after: 'lead', info: 4.5, when: f => f.life < 0.4 && f.session.time > 4,
            aim: f => ({ ...swarmMid(f), gesture: 'mark', color: 'hot' }), pulse: () => hungerEl,
            text: () => '> They are getting hungry. Good sand feeds them. When the bar runs out, the session ends.' },
        { key: 'cache', after: 'lead', info: 5, when: f => nearestOf(f, (k, v) => k === 7 && F().seenOf(v)),
            aim: (f, t) => ({ x: t.x, y: t.y, r: F().FEED.cacheR + 4, gesture: 'mark', color: 'research' }),
            text: () => '> Something is buried here. Eat down to it and it cracks open for research and a free card.' }
    ];
    const coachDone = key => !!intro()[`feed:coach:${key}`];
    const coachTries = key => intro()[`feed:coachSeen:${key}`] || 0;
    function coachEnd(done) {
        if (!coach) return;
        const g = game(), def = COACHES.find(d => d.key === coach.key);
        if (g) { if (done) g.intro[`feed:coach:${coach.key}`] = true; else g.intro[`feed:coachSeen:${coach.key}`] = coachTries(coach.key) + 1; }
        window.AGI?.playtest?.('feedCoach', { key: coach.key, done: done ? 1 : 0, s: Math.round((performance.now() - coach.t0) / 100) / 10 });
        def?.pulse?.()?.classList.remove('coached');
        coach = null;
    }
    // Each frame: keep the step up, or start the next one due. Never stops the game: a step that throws is dropped.
    function coachStep(f) {
        try {
            const s = f?.session, now = performance.now();
            // A split's cards (or the stockpile picker) pause a step rather than end it: in the owner's first log a split
            // every four seconds cut the frenzy's and garbled sand's steps off twice each, and they were never seen whole.
            if (s && f.sessioned && (s.offer || s.wait)) { if (coach && !coach.paused) coach.paused = now; return; }
            if (!s || !f.sessioned) { if (coach) coachEnd(false); return; }
            if (coach?.paused) { coach.t0 += now - coach.paused; coach.paused = 0; }
            if (coach) {
                const def = COACHES.find(d => d.key === coach.key), secs = (performance.now() - coach.t0) / 1000;
                if (f.aim || f.spot) coach.touched = true;
                if (def.done?.(f, coach)) return coachEnd(true);
                if (def.info) { if (secs > def.info) coachEnd(true); return; }
                if (secs > COACH_MAX && !f.aim) return coachEnd(false);
                const t = def.when(f);
                if (t) coach.at = def.aim(f, t); else if (!def.keep) coachEnd(false);
                return;
            }
            for (const def of COACHES) {
                if (coachDone(def.key) || coachTries(def.key) >= COACH_TRIES || (def.after && !coachDone(def.after))) continue;
                const t = def.when(f);
                if (!t) continue;
                coach = { key: def.key, t0: performance.now(), at: def.aim(f, t), eaten0: f.stats.eaten, touched: false };
                def.pulse?.()?.classList.add('coached');
                return;
            }
        } catch (err) { coach = null; window.AGI?.playtest?.('feedCoachError', { msg: String(err?.message || err).slice(0, 80) }); }
    }
    // How fast the field runs this frame: slowed while a step waits for your hands and they're not on the sand yet.
    const coachSpeed = () => { const def = coach && COACHES.find(d => d.key === coach.key); return def?.slow && held === null && !coach.touched ? def.slow : 1; };
    function wrap(text, width) {
        const out = []; let line = '';
        for (const word of text.split(' ')) { const next = line ? line + ' ' + word : word; if (line && ctx.measureText(next).width > width) { out.push(line); line = word; } else line = next; }
        if (line) out.push(line);
        return out;
    }
    // The step on the field: the rest dimmed round a dashed spotlight, the ghost finger (hidden while yours is down), the line.
    function drawCoach(now) {
        if (!coach?.at || coach.paused) return;
        const def = COACHES.find(d => d.key === coach.key), at = coach.at, c = view.cell, calm = reduced();
        const real = (now - coach.t0) / 1000, fade = Math.min(1, real / 0.35);
        const sr = Math.max(26, at.r * c), [sx, sy0] = px(at.x, at.y), sy = Math.max(Math.min(sr, 40), sy0);   // (kept on the field)
        ctx.save();
        if (!def.info) {
            ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = colors.bg;
            ctx.beginPath(); ctx.rect(0, 0, view.w, view.h); ctx.moveTo(sx + sr, sy); ctx.arc(sx, sy, sr, 0, Math.PI * 2, true); ctx.fill('evenodd');
        }
        ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = colors[at.color] || colors.text; ctx.lineWidth = at.gesture === 'mark' ? 2.5 : 1.5;
        ctx.setLineDash([5, 7]); ctx.lineDashOffset = calm ? 0 : -now / 60;
        ctx.beginPath(); ctx.arc(sx, sy, sr * (at.gesture === 'mark' && !calm ? 1 + 0.06 * Math.sin(now / 180) : 1), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        if (at.gesture === 'drag' && held === null) {
            // a finger presses by the swarm and drags to the good sand, holding; a trail behind it
            const p = calm ? 0.7 : (real % 2.4) / 2.4, [fx, fy0] = px(at.from.x, at.from.y), fy = Math.max(18, fy0);
            const go = Math.max(0, Math.min(1, (p - 0.15) / 0.55)), ease = go * go * (3 - 2 * go), x = fx + (sx - fx) * ease, y = fy + (sy - fy) * ease;
            const down = p > 0.12 && p < 0.88, a = (p < 0.12 ? p / 0.12 : p > 0.88 ? 1 - (p - 0.88) / 0.12 : 1) * fade;
            if (go > 0) { ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = colors.good; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); }
            ctx.globalAlpha = a; ctx.strokeStyle = colors.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, down ? 11 : 14, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = a * (down ? 0.55 : 0.2); ctx.fillStyle = colors.text; ctx.beginPath(); ctx.arc(x, y, down ? 9 : 12, 0, Math.PI * 2); ctx.fill();
        }
        // the line: under the spotlight, or over it near the foot of the field, wrapped to the field
        ctx.font = `600 15px ${getComputedStyle(dlg).getPropertyValue('--font-body') || 'sans-serif'}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lines = wrap(def.text(), Math.min(420, view.w - 32)), lh = 20, block = lines.length * lh;
        const below = sy + sr + 18 + block < view.h - 8, top = below ? sy + sr + 22 : Math.max(18, sy - sr - 14 - block + lh);
        lines.forEach((line, i) => {
            const tw = ctx.measureText(line).width, x = Math.max(tw / 2 + 10, Math.min(view.w - tw / 2 - 10, sx)), y = Math.min(view.h - 14 - (lines.length - 1 - i) * lh, top + i * lh);
            ctx.globalAlpha = fade; ctx.lineWidth = 5; ctx.strokeStyle = colors.bg; ctx.lineJoin = 'round'; ctx.strokeText(line, x, y);
            ctx.fillStyle = colors.text; ctx.fillText(line, x, y);
        });
        ctx.restore();
    }
    // The cards' step is in the cards themselves: a line over them the first time, done once one is picked.
    function coachCards(offer) {
        if (offer) { coachOffer = !coachDone('cards'); return coachOffer ? el('p', { class: 'feed-cards-hint', text: '> The card you pick lasts for the rest of this session.' }) : null; }
        if (coachOffer && game()) { game().intro['feed:coach:cards'] = true; window.AGI?.playtest?.('feedCoach', { key: 'cards', done: 1 }); }
        coachOffer = false;
        return null;
    }

    // The fragment set as found so far: the parcel spam's own words (engine.js MAIL), cut into as many scraps as pieces.
    function renderFragment() {
        const f = feed(), set = 'parcel', of = F().FRAGMENTS[set].pieces, found = f.fragments[set] || [];
        const mail = (E().MAIL || []).find(m => m.id === set);
        const all = mail ? [mail.subject, ...(mail.body || [])].join(' ').split(/\s+/) : [];
        const per = Math.max(1, Math.min(9, Math.floor(all.length / of)));
        const scraps = Array.from({ length: of }, (_, n) => (found.includes(n) && all.length ? all.slice(n * per, n * per + per).join(' ') : '░░░░░░'));
        fragEl.replaceChildren(el('span', { class: 'feed-fragment-count', title: 'Scraps of a message, found in the sand', text: `Message scraps ${found.length}/${of}` }),
            ...scraps.map((text, n) => el('span', { class: found.includes(n) ? 'feed-scrap found' : 'feed-scrap', text })));
        fragEl.classList.toggle('none', !found.length);
    }
    function text(node, value) { if (node.textContent !== value) node.textContent = value; }
    function renderFrenzy(f) {
        const s = f.session, on = !!(s && !s.wait) && (s.stage || 3) >= 3;   // (not before its stage)
        frenzyEl.hidden = !on;
        if (!on) return;
        const step = F().FEED.frenzyStep, tier = s.tier || 0, heat = s.heat || 0;
        frenzyEl.dataset.tier = String(tier);
        [...frenzyEl.querySelectorAll('.feed-pip')].forEach((pip, n) => { const fill = Math.max(0, Math.min(1, heat / step - n)); const w = Math.round(fill * 100) + '%'; if (pip.firstChild.style.width !== w) pip.firstChild.style.width = w; pip.classList.toggle('on', n < tier); });
        text(frenzyEl.lastChild, tier ? `×${(1 + F().FEED.frenzyPay * tier).toFixed(2)}` : '');
    }
    function tick(now) {
        raf = requestAnimationFrame(tick);
        const f = feed(); if (!f) return;
        frames++;
        // The sand moves every frame it is drawn (it was stepped by the game's loop, ten times a second, and looked it).
        const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0; lastNow = now;
        coachStep(f);
        if (dt > 0) window.AGI?.feedFrame?.(dt * coachSpeed());
        if (joy && zoom.k > 1) { zoom.cx += joy.x * view.vc * 0.9 * dt; zoom.cy += joy.y * view.vr * 0.9 * dt; }
        // In a session the bar is the hunger bar (it empties; the session ends at nothing) and the stat is the way to the next split.
        const hunger = F().hunger(f), split = Math.round(hunger.share * 100), pct = f.sessioned ? Math.round(hunger.life * 100) : split;
        text(layerEl, f.sessioned ? (f.session ? `Split ${split}%` : '') : `Hunger ${pct}%`);
        hungerEl.classList.toggle('life', !!f.sessioned); hungerEl.classList.toggle('low', !!f.session && hunger.life < 0.25);
        renderPick(); renderCards(); renderHeld();
        if (hungerEl.firstChild.style.width !== pct + '%') { hungerEl.firstChild.style.width = pct + '%'; hungerEl.setAttribute('aria-valuenow', String(pct)); }
        text(mitesEl, plural(f.mites, 'mite', 'mites'));
        renderFrenzy(f);
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
        zoom = { k: 1, cx: 0, cy: 0 }; touches.clear(); pinch = null; pan = null; zoomEl?.classList.remove('zoomed');
        readColors(); pops = []; sparks = []; held = null; fragShown = -1; pickKey = ''; cardsKey = ''; heldKey = '\u0000'; arcs = []; bolts = []; view.cols = view.rows = 0;
        resize();
        lastNow = 0;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; if (held !== null) letGo(); if (coach) coachEnd(false); }
    function close() { if (dlg?.open) { dlg.close(); stop(); } }

    window.FeedUI = { open, close, events, get coach() { return coach && { key: coach.key, at: coach.at }; }, get isOpen() { return !!(dlg && dlg.open); }, get view() { return view; }, get zoom() { return zoom.k; }, zoomAt, px, drawMite,
        // A mite drawn on any canvas (a sheet of them for review): `st` as `drawMite`'s.
        drawMiteOn(c2, kind, x, y, q, st) { const keep = ctx; ctx = c2; try { drawMite(kind, x, y, q, st); } finally { ctx = keep; } } };
    if (location.hash === '#feed') window.addEventListener('load', () => setTimeout(open, 600));
})();
