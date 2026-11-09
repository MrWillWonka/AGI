// tools/review/kit.js — play Packet Snare in a real browser (Playwright, Chromium) the way a person does.
//   const K = require('<repo>/tools/review/kit.js');
//   const { browser, page } = await K.launch({ phone: false });   // phone: true → 390 × 727 touch screen
//   await K.fresh(page);          // a new player's first visit to Packet Snare (its bay just opened, nothing bought)
//   await K.start(page);          // press Start on the card (or R); then K.cards(page) to read/close tip cards
//   await K.bubble(page, x, y, ms) // hold a bubble at field point (x, y) for ms, then let go (right mouse / a finger)
//   await K.loop(page, cx, cy, r, turns), K.flick(page, x0, y0, x1, y1)   // a drawn loop, a quick straight swipe
//   await K.state(page)           // the run: focus, sector, goal, packets, reds, boss, stats, over…
//   await K.shot(page, '/abs/path.png')
//   await K.scenario(page, k)    // sector k as a person reaches it: the build tools/review/pacing.js's campaign had there
//                                  (tools/review/scenarios.json), every threat met that a player would have met by then
//   await K.tour.firstRun(page, dir), K.tour.sector(page, k, dir), K.tour.boss(page, dir, k), K.tour.tree(page, dir, k):
//                                  the standard moments, played the same way every round, screenshots as they go
// The field is in field units (state().w × state().h); the server is REVIEW_URL (the round's frozen build, see
// tools/review/freeze.sh), default http://localhost:8123/.
// AGI.debug in the page (debug-panel.js) can jump ahead: snareSector(k) (0-based), snareMax(), snareBoss(),
// resetSnare(), openSnare(), and Resources → +Signal via AGI.state.snare.signal. Use it to reach later content, but judge
// the early game as a new player meets it.
'use strict';
const { chromium } = require('playwright');
const URL = process.env.REVIEW_URL || 'http://localhost:8123/';

async function launch({ phone = false } = {}) {
    const browser = await chromium.launch();
    const ctx = phone
        ? await browser.newContext({ viewport: { width: 390, height: 727 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
        : await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(String(e)));
    page.on('console', m => m.type() === 'error' && page.errors.push(m.text()));
    page.phone = phone;
    await page.goto(URL);
    await page.waitForTimeout(800);
    return { browser, page };
}

// A new player's first visit: a fresh save, the bay opened the way the game opens it, Packet Snare reset.
async function fresh(page) {
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(URL);
    await page.waitForTimeout(800);
    await page.evaluate(() => { AGI.debug.openSnare(); AGI.debug.resetSnare(); });
    await page.waitForTimeout(1200);
}

// The card over the field (start, end, or a ↻ tip): its text, and close it (a tip) with `close`.
async function cards(page, close = true) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        const c = await page.evaluate(() => { const c = document.getElementById('snareCard'); return c && !c.hidden && c.offsetParent ? { tip: c.classList.contains('snare-intro'), text: c.innerText } : null; });
        if (!c) break;
        out.push(c);
        if (!c.tip || !close) break;
        await page.click('#snareCard .result-actions button');
        await page.waitForTimeout(300);
    }
    return out;
}

async function start(page) {
    const btn = await page.$('#snareCard .result-actions .button');
    if (btn) await btn.click(); else await page.keyboard.press('r');
    await page.waitForTimeout(500);
}

const screen = (page, x, y) => page.evaluate(([a, b]) => AGI.debug.snareScreen(a, b), [x, y]);

let cdp = null;
async function touch(page, type, pts) {
    cdp = cdp || await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y })) });
}

// Hold a bubble at field point (x, y) for `ms`, then let go. Desktop: the right mouse button; phone: a finger.
async function bubble(page, x, y, ms = 1200, { follow = null } = {}) {
    let p = await screen(page, x, y);
    if (!p) return;
    if (page.phone) {
        await touch(page, 'touchStart', [p]);
        for (let t = 0; t < ms; t += 50) {
            await page.waitForTimeout(50);
            if (follow) { const q = await follow(); if (q) p = await screen(page, q.x, q.y); }
            await touch(page, 'touchMove', [{ x: p.x + (t / 50 % 2) * 0.3, y: p.y }]);
        }
        await touch(page, 'touchEnd', []);
    } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down({ button: 'right' });
        for (let t = 0; t < ms; t += 50) {
            await page.waitForTimeout(50);
            if (follow) { const q = await follow(); if (q) p = await screen(page, q.x, q.y); }
            await page.mouse.move(p.x + (t / 50 % 2) * 0.3, p.y);
        }
        await page.mouse.up({ button: 'right' });
    }
    await page.waitForTimeout(120);
}

async function stroke(page, pts, msPer = 16) {
    const s = [];
    for (const [x, y] of pts) s.push(await screen(page, x, y));
    if (page.phone) {
        await touch(page, 'touchStart', [s[0]]);
        for (const q of s.slice(1)) { await touch(page, 'touchMove', [q]); await page.waitForTimeout(msPer); }
        await touch(page, 'touchEnd', []);
    } else {
        await page.mouse.move(s[0].x, s[0].y);
        await page.mouse.down({ button: 'left' });
        for (const q of s.slice(1)) { await page.mouse.move(q.x, q.y); await page.waitForTimeout(msPer); }
        await page.mouse.up({ button: 'left' });
    }
    await page.waitForTimeout(100);
}
// A drawn loop round (cx, cy) (the boss: two in a row stun it).
const loop = (page, cx, cy, r, turns = 1) => stroke(page, Array.from({ length: Math.ceil(32 * turns) + 3 }, (_, i) => [cx + Math.cos(-Math.PI / 2 + i / 32 * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + i / 32 * Math.PI * 2) * r]), 12);
// A flick: a quick straight swipe (slash a reeling boss, parry its charge with Riposte, spoof red, throw a grabbed mine).
const flick = (page, x0, y0, x1, y1) => stroke(page, Array.from({ length: 7 }, (_, i) => [x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6]), 14);

async function state(page) {
    return page.evaluate(() => {
        const r = AGI.debug.snareRun();
        if (!r) return null;
        const g = r.packets.filter(p => p.kind !== 'corrupt');
        return { w: r.w, h: r.h, over: r.over, focus: +r.focus.toFixed(1), maxFocus: r.maxFocus, sector: AGI.state.snare.sector + 1, goal: r.opts.goal, progress: Math.floor(r.goalProgress()),
            goalDone: r.goalDone, signal: AGI.state.snare.signal, packets: g.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), kind: p.kind })),
            reds: r.packets.filter(p => p.kind === 'corrupt').map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) })),
            boss: r.boss && { x: r.boss.x, y: r.boss.y, r: r.boss.r, hp: r.boss.hp, stunned: r.boss.stunned > r.time, charge: !!r.boss.charge },
            mines: r.mines.map(m => ({ x: m.x, y: m.y })), held: r.held.map(m => ({ x: m.x, y: m.y })), antivirus: r.antivirus.length, cores: r.cores.map(c => ({ x: c.x, y: c.y })),
            stats: r.stats };
    });
}
// The densest spot of good packets with no red within `clear` units (a simple aim).
async function bestSpot(page, rad = 1.5, clear = 0.4) {
    const s = await state(page);
    if (!s) return null;
    let best = null, bn = 0;
    for (const p of s.packets) {
        const n = s.packets.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < rad).length;
        if (s.reds.some(q => Math.hypot(q.x - p.x, q.y - p.y) < rad + clear)) continue;
        if (n > bn) { bn = n; best = p; }
    }
    return best;
}
const shot = (page, path) => page.screenshot({ path });

// Sector k (1-based) as a person reaches it: the build the pacing campaign had there, the threats of the sectors before
// it already met (their look out cards shown), and the runs it took. Not a maxed tree: judge what a player would see.
const SCENARIOS = require('path').join(__dirname, 'scenarios.json');
async function scenario(page, k) {
    const all = JSON.parse(require('fs').readFileSync(SCENARIOS, 'utf8'));
    const keys = Object.keys(all).map(Number).filter(n => n <= k);
    const sc = all[Math.max(...keys)] || { levels: {}, signal: 0, runs: 0 };
    await page.evaluate(([sc, k]) => {
        const st = AGI.state;
        for (const id of Object.keys(st.levels)) if (id.startsWith('snare')) delete st.levels[id];
        Object.assign(st.levels, sc.levels);
        st.snare.signal = sc.signal; st.snare.earned = Math.max(st.snare.earned, sc.signal);
        st.snare.runs = Math.max(2, sc.runs);
        // the threats of earlier sectors met, as a player who got here has
        for (const kind of AGI.debug.snareMetBefore?.(k - 1) || []) st.intro['snare:intro:' + kind] = true;
        AGI.debug.snareSector(k - 1);
    }, [sc, k]);
    await page.waitForTimeout(600);
    return sc;
}

// Tours: the standard moments, played the same way every round, each taking screenshots as it goes (reviewers start
// from these instead of scripting their own play). Each returns [{ file, what }] for the screenshots it took in `dir`.
const path = require('path');
const fs = require('fs');
function taker(page, dir, prefix) {
    fs.mkdirSync(dir, { recursive: true });
    const shots = [];
    return Object.assign(async (name, what) => { const file = path.join(dir, `${prefix}-${name}.png`); await shot(page, file); shots.push({ file, what }); }, { shots });
}
// A bubble on the best clean cluster, for `n` catches or until the run ends.
async function play(page, n = 12, hold = 1300) {
    for (let i = 0; i < n; i++) {
        const s = await state(page);
        if (!s || s.over) return;
        const b = await bestSpot(page);
        if (b) await bubble(page, b.x, b.y, hold); else await page.waitForTimeout(300);
    }
}
const tour = {
    // A new player's first visit: the first card, a catch, the run, its end card.
    async firstRun(page, dir) {
        const take = taker(page, dir, 'first');
        await fresh(page);
        await take('card', 'the first card a new player sees');
        await start(page);
        const b = await bestSpot(page);
        if (b) await bubble(page, b.x, b.y, 900);
        await take('catch', 'the first catch');
        await play(page);
        await page.waitForTimeout(900);
        await take('end', 'the first run\'s end card');
        return take.shots;
    },
    // Sector k as a player reaches it: its card (and look out card), a run in the middle, the end card.
    async sector(page, k, dir) {
        const take = taker(page, dir, `sector${k}`);
        await scenario(page, k);
        await take('card', `sector ${k}'s card with the build a player has there`);
        await start(page);
        const inRun = () => page.evaluate(() => { const r = AGI.debug.snareRun(); return !!(r && !r.over && document.getElementById('snareCard').hidden); });
        if (!(await inRun())) { await take('lookout', `sector ${k}'s look out card`); await start(page); }
        await play(page, 3);
        await take('mid', `sector ${k} mid-run`);
        await play(page, 20);
        await page.waitForTimeout(900);
        await take('end', `sector ${k}'s end card`);
        return take.shots;
    },
    // The boss on sector k (5 by default): waits for it, loops round it twice while it charges, slashes while it reels.
    async boss(page, dir, k = 5) {
        const take = taker(page, dir, `boss${k}`);
        await scenario(page, k);
        await start(page);
        if (!(await page.evaluate(() => { const r = AGI.debug.snareRun(); return !!(r && !r.over); }))) await start(page);
        for (let i = 0; i < 40; i++) { const s = await state(page); if (s?.boss) break; await page.waitForTimeout(250); }
        await take('arrives', 'the boss on the field');
        for (let tries = 0; tries < 4; tries++) {
            let s = null;
            for (let i = 0; i < 40; i++) { s = await state(page); if (!s || s.over || s.boss?.charge) break; await page.waitForTimeout(150); }
            if (!s?.boss || s.over) break;
            await take(`charge${tries}`, 'it stops to charge: the moment to loop it');
            await loop(page, s.boss.x, s.boss.y, s.boss.r + 0.9, 2);
            await page.waitForTimeout(150);
            s = await state(page);
            await take(`looped${tries}`, 'after two loops round it');
            for (let i = 0; i < 6 && s?.boss?.stunned; i++) {
                await flick(page, s.boss.x - s.boss.r * 1.4, s.boss.y - s.boss.r * 0.4, s.boss.x + s.boss.r * 1.4, s.boss.y + s.boss.r * 0.4);
                await page.waitForTimeout(240);
                s = await state(page);
            }
            await take(`slashed${tries}`, 'after slashing it while it reels');
        }
        await page.waitForTimeout(600);
        return take.shots;
    },
    // The tree with the build a player has at sector k: the whole tree, then a node's popup.
    async tree(page, dir, k = 9) {
        const take = taker(page, dir, `tree${k}`);
        await scenario(page, k);
        await page.keyboard.press('u');
        await page.waitForTimeout(700);
        await take('whole', `the tree with sector ${k}'s build`);
        const node = await page.$('.snare-tree-grid .tree-node:not(.seed)');
        if (node) { await node.click(); await page.waitForTimeout(400); await take('popup', 'a node\'s popup'); }
        await page.keyboard.press('Escape');
        return take.shots;
    }
};

module.exports = { launch, fresh, cards, start, bubble, loop, flick, stroke, state, bestSpot, shot, screen, scenario, play, tour };
