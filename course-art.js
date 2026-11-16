// course-art.js — drawing shared by Evals' courses (window.CourseArt): the AI's runner is the orb, yours is the
// Training ball; a burst where a run ends; the theme's colours read once a frame. No rules, no state of the game's.
(function () {
    'use strict';
    const orbImg = new Image();
    orbImg.decoding = 'async';
    orbImg.src = 'art/orb-calm.webp';
    const TAU = Math.PI * 2;
    // The theme's colours, from the screen's own CSS variables.
    function colours(node) {
        const css = getComputedStyle(node), v = n => css.getPropertyValue(n).trim();
        return { bg: v('--bg') || '#0b1417', bg2: v('--bg-2') || '#0f1c20', panel: v('--panel-2') || '#16262b', border: v('--border') || '#22363c', text: v('--text') || '#e6f0ee', muted: v('--muted') || '#8aa39d',
            primary: v('--primary') || '#6fb1e0', success: v('--success') || '#5fe0a8', warning: v('--warning') || '#ffb347', danger: v('--danger') || '#e2504f', research: v('--research') || '#c58be8',
            good: v('--snare-good') || v('--primary') || '#6fb1e0', bad: v('--snare-bad') || v('--danger') || '#e2504f',
            mono: v('--font-mono') || 'monospace', display: v('--font-display') || 'sans-serif' };
    }
    // A soft glow without shadowBlur (which is slow on phones): a few wide, faint rings.
    function glow(ctx, x, y, r, colour, strength = 1) {
        ctx.save(); ctx.fillStyle = colour;
        for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.07 * strength * (4 - i); ctx.beginPath(); ctx.arc(x, y, r * (1 + i * 0.35), 0, TAU); ctx.fill(); }
        ctx.restore();
    }
    // The AI: the orb's picture in a ring (a drawn stand-in until the picture has loaded).
    function orb(ctx, x, y, r, C, now = performance.now(), dead = false) {
        glow(ctx, x, y, r, dead ? C.danger : C.success, 1 + 0.25 * Math.sin(now / 420));
        if (orbImg.complete && orbImg.naturalWidth) { const d = r * 2.48; ctx.save(); if (dead) ctx.globalAlpha = 0.45; ctx.drawImage(orbImg, x - d / 2, y - d / 2, d, d); ctx.restore(); }
        else { ctx.fillStyle = C.bg2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = C.warning; ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.22, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = dead ? C.danger : C.success; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
    }
    // You: the Training ball, a blue ball with an amber core. `sx`, `sy`: squash and stretch.
    function ball(ctx, x, y, r, C, sx = 1, sy = 1, dead = false, gold = false) {
        const body = dead ? C.danger : gold ? C.warning : C.primary;
        glow(ctx, x, y, r, body, 0.8);
        ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.38, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = gold ? C.text : C.warning; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
        ctx.restore();
    }
    // The runner, whoever's it is.
    function runner(ctx, x, y, r, C, ai, opts = {}) { if (ai) orb(ctx, x, y, r, C, opts.now, opts.dead); else ball(ctx, x, y, r, C, opts.sx || 1, opts.sy || 1, opts.dead, opts.gold); }
    // Where a run ended: a ring opening out and shards flying, for `life` ms from `at`.
    function burst(ctx, x, y, size, colour, at, now = performance.now(), life = 650) {
        const a = (now - at) / life;
        if (a < 0 || a >= 1) return;
        ctx.save(); ctx.strokeStyle = colour; ctx.globalAlpha = 1 - a; ctx.lineWidth = Math.max(1.5, size * 0.12 * (1 - a));
        ctx.beginPath(); ctx.arc(x, y, size * (0.5 + 1.8 * a), 0, TAU); ctx.stroke();
        for (let i = 0; i < 8; i++) { const ang = i * TAU / 8 + 0.4, d0 = size * (0.4 + 1.2 * a), d1 = size * (0.7 + 2.1 * a); ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * d0, y + Math.sin(ang) * d0); ctx.lineTo(x + Math.cos(ang) * d1, y + Math.sin(ang) * d1); ctx.stroke(); }
        ctx.restore();
    }
    // A small label in a pill (the clock and the points).
    function pill(ctx, text, x, y, C, align = 'left') {
        ctx.save(); ctx.font = '600 12px ' + C.mono; const w = ctx.measureText(text).width + 14, h = 20, left = align === 'right' ? x - w : x;
        ctx.fillStyle = C.bg; ctx.globalAlpha = 0.78; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(left, y, w, h, 10); else ctx.rect(left, y, w, h); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, left + 7, y + h / 2 + 0.5); ctx.restore();
    }
    // A rounded box: filled, with a lighter top edge, the way the game's panels are.
    function tile(ctx, x, y, w, h, C, rad = 4) {
        ctx.fillStyle = C.panel; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, rad); else ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.fill();
        ctx.fillStyle = C.text; ctx.globalAlpha = 0.07; ctx.fill(); ctx.globalAlpha = 1;      // a shade lighter than the floor, so a block reads against the wall
        ctx.strokeStyle = C.muted; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = C.text; ctx.globalAlpha = 0.16; ctx.fillRect(x + 3, y + 2, w - 6, Math.max(1.5, h * 0.07)); ctx.globalAlpha = 1;
    }
    window.CourseArt = { colours, glow, orb, ball, runner, burst, pill, tile, TAU };
})();
