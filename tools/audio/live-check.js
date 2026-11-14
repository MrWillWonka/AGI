// tools/audio/live-check.js — the game in a real browser (headless Chromium): does it load without errors, does a held
// job pay at the game's rate whatever the audio is doing, and does the audio engine report any fault?
//   node tools/audio/live-check.js
// It holds Generate Compute for a set time in several audio states (sound on, all sound off, music off, each track)
// and counts what the game paid. Every state must pay the same: the press, then one repeat per hold interval.
'use strict';
const { ensureServer } = require('../review/serve.js');
const E = require('../../engine.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch { throw new Error('Playwright is not installed here (see tools/review/kit.js)'); }

const HOLD_MS = 3050;
(async () => {
    const srv = await ensureServer(process.env.AUDIO_URL || 'http://localhost:8151/');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => (m.type() === 'error' || /^\[audio\]/.test(m.text())) && errors.push(m.text()));
    await page.goto(new URL('#bays', srv.url).href);
    await page.waitForTimeout(1200);
    await page.mouse.click(640, 400);            // a gesture: audio may start
    await page.waitForTimeout(300);
    const hold = async label => {
        const r = await page.evaluate(async ms => {
            const b = document.querySelector('#actions button');
            const count = () => AGI.state.stats.clicks ?? AGI.state.stats.computes ?? 0;
            const cp0 = AGI.state.res.cp, n0 = count();
            const ev = t => b.dispatchEvent(new PointerEvent(t, { button: 0, bubbles: true }));
            ev('pointerdown');
            await new Promise(res => setTimeout(res, ms));
            ev('pointerup');
            await new Promise(res => setTimeout(res, 300));       // nothing may be paid after the release
            return { cp: AGI.state.res.cp - cp0, n: count() - n0, audio: SFX.context ? SFX.context.state : 'none', faults: SFX.faults.count, song: SFX.song };
        }, HOLD_MS);
        return { label, ...r };
    };
    const expected = 1 + Math.floor(HOLD_MS / E.HOLD_INTERVAL_MS);
    const out = [];
    out.push(await hold('sound and music on'));
    await page.evaluate(() => { SFX.setVolume(0); SFX.setMusic(0); });
    out.push(await hold('all sound off'));
    await page.evaluate(() => { SFX.setVolume(0.5); SFX.setMusic(0); });
    out.push(await hold('music off'));
    await page.evaluate(() => { SFX.setMusic(0.35); SFX.setSimple(true); });
    out.push(await hold('simple sounds'));
    await page.evaluate(() => SFX.setSimple(false));
    for (const st of await page.evaluate(() => SFX.MUSIC_STYLES)) {
        await page.evaluate(s => SFX.setMusicStyle(s), st);
        out.push(await hold('track ' + st));
    }
    await browser.close();
    srv.close?.();
    let ok = !errors.length;
    for (const r of out) {
        const pass = r.n === expected && r.faults === 0;
        ok = ok && pass;
        console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(22)} paid ${r.n} (expected ${expected}: the press and ${expected - 1} repeats in ${HOLD_MS} ms)  audio ${r.audio}  faults ${r.faults}`);
    }
    console.log(errors.length ? 'Console errors:\n  ' + errors.join('\n  ') : 'No console errors, no audio faults.');
    process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
