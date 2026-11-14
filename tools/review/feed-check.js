// The Feed's sessions in a browser, at phone and laptop size: the stockpile picker, a session started, paused while
// its screen is closed, kept across a reload, a split's cards (the session waits, a pick carries on), a session run to
// its end, End by hand returning the sand not yet poured, the camera's choice and the zoom's reset.
//   node tools/review/feed-check.js <repo> <out dir for screenshots>      prints ALL OK, or what failed
// It replaces two earlier scratch checks whose scripted players aimed at falling sand and stopped at card offers.
const repo = process.argv[2] || process.cwd(), out = process.argv[3] || repo + '/review-out';
const { chromium } = require(repo + '/node_modules/playwright');
const { spawn } = require('child_process');
const PORT = 8179, URL = `http://localhost:${PORT}`, T = { timeout: 6000 };
(async () => {
    const server = spawn(process.execPath, [repo + '/tools/review/serve.js', String(PORT)], { cwd: repo, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 900));
    const browser = await chromium.launch();
    const failed = [];
    for (const [name, w, h, touch] of [['phone', 390, 844, true], ['laptop', 1366, 768, false]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 260)));
        page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
        const check = (what, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${what}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); if (!ok) failed.push(`${name}: ${what}`); };
        // The scripted player: holds the point on the pile's highest column, takes the first card of any offer, and
        // steps the rules itself until `until(feed)` (so it runs faster than the clock).
        const forward = until => page.evaluate(src => {
            const stop = new Function('f', 'return ' + src), s = AGI.state, f = s.feed;
            const top = x => { for (let y = f.h - 1; y >= 0; y--) if (!f.cells[y * f.w + x]) return y + 1; return 0; };
            for (let t = 0; t < 9000 && f.session && !stop(f); t++) {
                if (f.session.offer) { AGI.feedPick(0); continue; }
                if (t % 3 === 0) { let bx = -1, by = f.h; for (let x = 0; x < f.w; x += 2) { const y = top(x); if (y < by) { by = y; bx = x; } } AGIEngine.feedPoint(s, bx < 0 || by >= f.h ? null : { x: bx + 0.5, y: by + 0.5 }); }
                AGI.feedFrame(0.1);
            }
            AGIEngine.feedPoint(s, null);
        }, until);
        try {
            await page.goto(`${URL}/#ring`); await page.waitForTimeout(1200);
            await page.click('.ring-playtest .button', T);
            await page.fill('#loginName', 'Sam'); await page.fill('#loginEmail', 'sam');
            await page.click('.device-login button[type=submit]', T); await page.waitForTimeout(400);
            await page.evaluate(() => { const s = AGI.state, i = s.intro; for (const m of AGIEngine.MAIL) if (m.intro) { i['mail:' + m.id] = true; i['mailRead:' + m.id] = true; }
                i['mailAccepted:welcome'] = true; i['ring:labInstalled'] = true; i['ring:welcome'] = true; i['ring:feedIntro'] = true;
                for (let k = 0; k < 3; k++) AGI.debug.feedDeliver(1, 100, 10, 12); AGI.debug.feedDeliver(2, 30, 3); AGI.save(); });
            await page.reload(); await page.waitForTimeout(1500);
            const stock = await page.evaluate(() => AGIEngine.feedStock(AGI.state).map(e => [e.sector, e.total, e.cap]));
            check('stockpiles are kept across a reload', stock.length === 2 && stock[0][1] > 0 && stock[1][1] === 30, stock);
            await page.evaluate(() => window.FeedUI.open()); await page.waitForTimeout(500);
            await page.screenshot({ path: `${out}/feed-check-${name}-1-pick.png` });
            const pick = await page.evaluate(() => ({ piles: document.querySelectorAll('.feed-pile').length, shown: !document.querySelector('.feed-pick').hidden, controls: document.querySelector('.feed-zoom').hidden, fits: document.documentElement.scrollWidth <= innerWidth }));
            check('the picker lists both stockpiles, with no view controls yet', pick.piles === 2 && pick.shown && pick.controls && pick.fits, pick);
            await page.click('.feed-pile-start', T); await page.waitForTimeout(2500);
            const mid = await page.evaluate(() => ({ session: !!AGI.state.feed.session, time: AGI.state.feed.session.time, life: AGI.state.feed.life, picker: document.querySelector('.feed-pick').hidden, end: !document.querySelector('.feed-end').hidden, controls: !document.querySelector('.feed-zoom').hidden }));
            check('a session starts and runs on the clock', mid.session && mid.time > 1.5 && mid.time < 3.5 && mid.life < 1 && mid.picker && mid.end && mid.controls, mid);
            await page.evaluate(() => window.FeedUI.close()); await page.waitForTimeout(1500);
            const away = await page.evaluate(() => AGI.state.feed.session.time);
            check('it waits while its screen is closed', Math.abs(away - mid.time) < 0.2, [mid.time, away]);
            await page.evaluate(() => AGI.save()); await page.reload(); await page.waitForTimeout(1500);
            const back = await page.evaluate(() => ({ session: !!AGI.state.feed.session, time: AGI.state.feed.session?.time, grains: AGI.state.feed.grains }));
            check('a reload keeps the session in play', back.session && Math.abs(back.time - away) < 0.2 && back.grains > 0, back);
            await page.evaluate(() => window.FeedUI.open()); await page.waitForTimeout(400);
            // To the first split: cards are offered and the session waits.
            await forward('f.layers >= 1 && f.session.offer');
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${out}/feed-check-${name}-2-cards.png` });
            const offer = await page.evaluate(() => ({ offer: AGI.state.feed.session?.offer, shown: !document.querySelector('.feed-cards').hidden, cards: [...document.querySelectorAll('.feed-card')].map(b => { const q = b.getBoundingClientRect(); return q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1; }), time: AGI.state.feed.session?.time }));
            check('a split offers three cards, all on screen', !!offer.offer && offer.offer.length === 3 && offer.shown && offer.cards.length === 3 && offer.cards.every(Boolean), offer);
            await page.waitForTimeout(1200);
            check('the session waits while you choose', await page.evaluate(() => AGI.state.feed.session.time) === offer.time);
            await page.click('.feed-card:nth-child(2)', T); await page.waitForTimeout(700);
            const picked = await page.evaluate(() => ({ cards: AGI.state.feed.session.cards, hidden: document.querySelector('.feed-cards').hidden, chips: document.querySelector('.feed-held').innerText, time: AGI.state.feed.session.time }));
            check('a pick is kept, shown as a chip, and the session carries on', picked.cards[offer.offer[1]] === 1 && picked.hidden && picked.chips.length > 0 && picked.time > offer.time, picked);
            // A tap sets a point that stays; a tap on it clears it; a hold leads and lets go.
            const cv = await page.locator('.feed-canvas').boundingBox(), tx = cv.x + cv.width * 0.5, ty = cv.y + cv.height * 0.8;
            await page.mouse.click(tx, ty); await page.waitForTimeout(150);
            const spot1 = await page.evaluate(() => ({ spot: !!AGI.state.feed.spot, aim: AGI.state.feed.aim }));
            await page.mouse.move(tx + 60, ty); await page.mouse.down(); await page.waitForTimeout(500);
            const holding = await page.evaluate(() => ({ aim: !!AGI.state.feed.aim, spot: !!AGI.state.feed.spot }));
            await page.mouse.up(); await page.waitForTimeout(100);
            const after = await page.evaluate(() => ({ aim: AGI.state.feed.aim, spot: !!AGI.state.feed.spot }));
            await page.mouse.click(tx, ty); await page.waitForTimeout(150);
            const spot2 = await page.evaluate(() => !!AGI.state.feed.spot);
            check('a tap sets a point that stays through a hold, and a tap on it clears it', spot1.spot && spot1.aim === null && holding.aim && after.aim === null && after.spot && !spot2, { spot1, holding, after, spot2 });
            // The camera and the zoom.
            await page.click('.feed-zoom button[aria-label="Zoom in"]', T);
            const cam0 = await page.evaluate(() => document.querySelector('.feed-cam').textContent);
            await page.click('.feed-cam', T);
            const cam1 = await page.evaluate(() => [document.querySelector('.feed-cam').textContent, localStorage.getItem('agiFeedCam'), FeedUI.zoom]);
            await page.click('.feed-cam', T);
            check('the camera can be docked and the view zoomed', cam0 !== cam1[0] && cam1[1] === 'dock' && cam1[2] > 1, [cam0, ...cam1]);
            // To the end.
            await forward('false');
            await page.waitForTimeout(600);
            await page.screenshot({ path: `${out}/feed-check-${name}-3-over.png` });
            const over = await page.evaluate(() => ({ session: AGI.state.feed.session, last: AGI.state.feed.lastSession, rp: Math.round(AGI.state.res.rp), card: document.querySelector('.feed-last')?.innerText.replace(/\n+/g, ' | '), picker: !document.querySelector('.feed-pick').hidden }));
            check('the session ends and says how', over.session === null && !!over.last && ['hunger', 'empty'].includes(over.last.why) && over.rp > 0 && !!over.card && over.picker, { why: over.last?.why, splits: over.last?.layers, research: over.last?.research, card: over.card });
            // End by hand: what had not poured goes back to the stockpile; the new session starts at the whole view.
            await page.click('.feed-pile-start:not([disabled])', T); await page.waitForTimeout(500);
            const zoom = await page.evaluate(() => FeedUI.zoom);
            await page.click('.feed-end', T); await page.waitForTimeout(400);
            const ended = await page.evaluate(() => ({ why: AGI.state.feed.lastSession.why, left: AGIEngine.feedStock(AGI.state).find(e => e.sector === 2)?.total }));
            check('End returns the sand not yet poured, and a new session starts unzoomed', ended.why === 'left' && ended.left > 0 && ended.left < 30 && zoom === 1, { ...ended, zoom });
            check('no errors on the page', errors.length === 0, errors);
        } catch (e) { check('ran to the end', false, String(e).split('\n')[0].slice(0, 240)); if (errors.length) console.log(errors); }
        await ctx.close();
    }
    await browser.close(); server.kill();
    console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'ALL OK');
    process.exit(failed.length ? 1 : 0);
})();
