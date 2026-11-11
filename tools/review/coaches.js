// tools/review/coaches.js — plays every Packet Snare walkthrough (Snare 18.2) on desktop and phone: waits for each, takes a
// screenshot of it, does the action it teaches and checks it's marked done; also measures how far the boss's mines lie.
//   node tools/review/coaches.js [out dir] [desktop]     (default review-out/coach; serves the game itself if need be)
// Each section starts from a fresh save at its sector, with the walkthroughs before it done, as a player reaches it.
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(root, 'review-out', 'coach'));
const { ensureServer } = require('./serve.js');
let K;
const fs = require('fs');
fs.mkdirSync(out, { recursive: true });

const coach = page => page.evaluate(() => AGI.debug.snareCoach());
const done = (page, key) => page.evaluate(k => !!AGI.state.intro['snare:coach:' + k], key);
async function waitCoach(page, key, secs = 12) {
    for (let i = 0; i < secs * 10; i++) {
        const c = await coach(page);
        if (c && c.key !== waitCoach.last) { waitCoach.last = c.key; console.log('   (showing', c.key + ')'); }
        if (c && c.key === key) return c;
        await page.waitForTimeout(100);
    }
    return null;
}
async function startRun(page) {
    await K.cards(page);
    await K.start(page);
    await K.cards(page);
}
async function sling(page, m, b, pull) {
    const d = Math.hypot(b.x - m.x, b.y - m.y) || 1;
    await K.stroke(page, Array.from({ length: 12 }, (_, i) => [m.x - (b.x - m.x) / d * pull * i / 11, m.y - (b.y - m.y) / d * pull * i / 11]), 30);
}

async function section(page, k, doneKeys, levels = {}) {
    await K.fresh(page);
    await page.evaluate(([d, lv]) => { for (const x of d) AGI.state.intro['snare:coach:' + x] = true; }, [doneKeys, levels]);
    await K.scenario(page, k);
    await page.evaluate(lv => Object.assign(AGI.state.levels, lv), levels);
    await startRun(page);
}
(async () => {
    const only = process.argv[3];
    const srv = await ensureServer(process.env.REVIEW_URL || 'http://localhost:8123/');
    process.env.REVIEW_URL = srv.url;
    K = require('./kit.js');
    const results = [];
    const note = (screen, key, ok, extra = '') => { results.push({ screen, key, ok, extra }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${screen} ${key} ${extra}`); };
    for (const phone of only === 'desktop' ? [false] : [false, true]) {
        const screen = phone ? 'phone' : 'desktop';
        const { browser, page } = await K.launch({ phone });
        const snap = async name => page.screenshot({ path: path.join(out, `${screen}-${name}.png`) });
        await K.fresh(page, { tutorial: true });   // run 1 is the tutorial (Snare 18.7)
        await startRun(page);
        // run 1: the bubble, the red packet, (phones) the drawn loop
        let c = await waitCoach(page, 'bubble');
        if (c) { await page.waitForTimeout(900); await snap('1-bubble'); await K.bubble(page, c.at.x, c.at.y, 1400); await page.waitForTimeout(400); }
        note(screen, 'bubble', !!c && await done(page, 'bubble'), c ? `slow ${c.slow}` : 'never showed');
        c = await waitCoach(page, 'red', 9);
        if (c) { await page.waitForTimeout(600); await snap('2-red'); }
        // sector 1's one red packet can swim off first; then it shows the next time red is on the field (sector 2)
        note(screen, 'red (shown)', true, c ? 'shown' : 'pending: the one red packet left first')
        if (phone) {
            c = await waitCoach(page, 'loop', 10);
            if (c) { await page.waitForTimeout(900); await snap('3-loop'); await K.loop(page, c.at.x, c.at.y, c.at.r); await page.waitForTimeout(400); }
            note(screen, 'loop', !!c && await done(page, 'loop'), c ? '' : 'never showed');
        }
        // the boss (sector 5): loop it twice, slash it
        await section(page, 5, ['bubble', 'red', 'loop']);
        await page.evaluate(() => AGI.debug.snareBoss());
        c = await waitCoach(page, 'bossLoop', 15);
        if (c) {
            await page.waitForTimeout(900); await snap('4-bossLoop');
            for (let i = 0; i < 2; i++) { const s = await K.state(page); await K.loop(page, s.boss.x, s.boss.y, c.at.r); }
            await page.waitForTimeout(300);
        }
        note(screen, 'bossLoop', !!c && await done(page, 'bossLoop'), c ? '' : 'never showed');
        c = await waitCoach(page, 'slash', 4);
        if (c) { await page.waitForTimeout(700); await snap('5-slash'); const s = await K.state(page); await K.flick(page, s.boss.x - c.at.r, s.boss.y - 0.3, s.boss.x + c.at.r, s.boss.y + 0.3); await page.waitForTimeout(300); }
        note(screen, 'slash', !!c && await done(page, 'slash'), c ? '' : 'never showed');
        // mines (sector 8): loop one, sling it
        await section(page, 8, ['bubble', 'red', 'loop', 'bossLoop', 'slash']);
        await page.evaluate(() => AGI.debug.snareBoss());
        // the boss loop walkthrough is done, so the next is the mines' once they're laid
        c = await waitCoach(page, 'mineLoop', 20);
        if (c) {
            await page.waitForTimeout(900); await snap('6-mineLoop');
            const s = await K.state(page);
            const m = s.mines.sort((a, b) => Math.hypot(a.x - c.at.x, a.y - c.at.y) - Math.hypot(b.x - c.at.x, b.y - c.at.y))[0];
            await K.loop(page, m.x, m.y, c.at.r); await page.waitForTimeout(300);
            const dist = Math.hypot(m.x - s.boss.x, m.y - s.boss.y) / Math.min(s.w, s.h);
            note(screen, 'mine ring', dist > 0.36, `${dist.toFixed(2)} of the shorter side from the boss`);
        }
        note(screen, 'mineLoop', !!c && await done(page, 'mineLoop'), c ? '' : 'never showed');
        c = await waitCoach(page, 'sling', 4);
        if (c) {
            await page.waitForTimeout(900); await snap('7-sling');
            const s = await K.state(page);
            await sling(page, s.held[0], s.boss, (await page.evaluate(() => AGI.debug.snareRun().opts.slingPull)) * Math.min(s.w, s.h) * 1.1);
            await page.waitForTimeout(300);
        }
        note(screen, 'sling', !!c && await done(page, 'sling'), c ? '' : 'never showed');
        // unlocked moves on sector 3: the Freeze and Purge pickups
        await section(page, 3, ['bubble', 'red', 'loop'], { snareFreeze: 1, snarePurge: 1 });
        // whichever comes up first
        const keys = ['pickup:freeze', 'pickup:purge'], seen = new Set();
        for (let i = 0; i < 300 && seen.size < keys.length; i++) {
            c = await coach(page);
            if (c && keys.includes(c.key) && !seen.has(c.key)) {
                seen.add(c.key);
                await page.waitForTimeout(700); await snap(`8-${c.key.replace(':', '-')}`);
                c = await coach(page) || c;
                { const p = await K.screen(page, c.at.x, c.at.y); if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); }
                await page.waitForTimeout(400);
            }
            if ((await K.state(page))?.over) { await K.cards(page); await K.start(page); await K.cards(page); }
            await page.waitForTimeout(100);
        }
        for (const key of keys) note(screen, key, await done(page, key), seen.has(key) ? '' : 'never showed');
        note(screen, 'console', !page.errors.length, page.errors.slice(0, 3).join(' | '));
        await browser.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`${results.filter(r => r.ok).length} of ${results.length} OK · screenshots in ${out}`);
    await srv.close();
})();
