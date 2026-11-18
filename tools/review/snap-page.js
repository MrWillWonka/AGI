// Draws a playtest snapshot's page as a picture. A phone that can't photograph its own screen (an iPhone) sends the
// page itself with a snapshot (game.js pageSnap: the document, its canvases as pictures, no scripts); this opens it at
// the phone's own size, against the game's files, and saves what was on screen.
//   node tools/review/snap-page.js <snap-…-page.json> [out.png]        (needs the play server: default http://127.0.0.1:8123/)
const fs = require('fs'), path = require('path');
const file = process.argv[2], base = process.env.REVIEW_URL || 'http://127.0.0.1:8123/';
if (!file) { console.error('usage: node tools/review/snap-page.js <snap-…-page.json> [out.png]'); process.exit(1); }
const out = process.argv[3] || file.replace(/\.json$/, '.png');
(async () => {
    const { chromium } = require('playwright');
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: snap.w, height: snap.h }, deviceScaleFactor: Math.min(3, snap.dpr || 2), hasTouch: true, isMobile: true, javaScriptEnabled: false });
    const page = await ctx.newPage();
    // Served from the game's own address, so its styles, fonts and art load.
    await page.route(base + '__snap', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: snap.html }));
    await page.goto(base + '__snap');
    await page.waitForTimeout(600);
    await browser.close().catch(() => {});
    // Scripts are off for the page above (it must not start a game); a second pass with them on only to put the modal
    // dialogs back on top and the scrolled panels where they were.
    const b2 = await chromium.launch(), c2 = await b2.newContext({ viewport: { width: snap.w, height: snap.h }, deviceScaleFactor: Math.min(3, snap.dpr || 2), hasTouch: true, isMobile: true });
    const p2 = await c2.newPage();
    await p2.route(base + '__snap', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: snap.html }));
    await p2.goto(base + '__snap');
    await p2.evaluate(s => {
        for (const d of document.querySelectorAll('dialog[open]')) { const key = d.id || d.className; if (s.modal.includes(key)) { d.removeAttribute('open'); try { d.showModal(); } catch { d.setAttribute('open', ''); } } }
        for (const sc of s.scrolls || []) { const n = sc.id ? document.getElementById(sc.id) : [...document.querySelectorAll('*')].find(x => String(x.className).slice(0, 60) === sc.cls); if (n) n.scrollTop = sc.top; }
    }, snap);
    await p2.waitForTimeout(500);
    await p2.screenshot({ path: out });
    await b2.close();
    console.log(out);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
