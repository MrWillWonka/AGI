// tools/review/evals.js — plays Evals (the third minigame) in a real browser at three screen sizes and checks it:
// three rounds of every family solved with real taps and mouse moves, each captcha in view with no scrolling and no
// target too small to tap, no console errors, a round with reduced motion (no hand), a run counted and logged, and (with a mouse) the pointer's path recorded
// and the ghost hand given your shapes to follow. Then the unlock ladder: one kind at first, more after a takeover. Takes a screenshot of each kind the first time it comes up.
//   node tools/review/evals.js [out dir]     (default review-out/evals; serves the game itself if nothing does)
// Prints PASS or FAIL a check and exits 1 if any failed. About a minute and a half.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(root, 'review-out', 'evals'));
const { ensureServer } = require('./serve.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch {
    console.error('Playwright is not installed here. From the repo: npm install --no-save playwright, then npx playwright install chromium (see design/review/handoff.md)');
    process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const SIZES = [
    { name: 'phone', viewport: { width: 390, height: 727 }, touch: true },
    { name: 'sideways', viewport: { width: 727, height: 390 }, touch: true },
    { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
    // With reduced motion there is no hand: one round, and the AI's line and rings still answer.
    { name: 'reduced motion', viewport: { width: 390, height: 727 }, touch: true, reduced: true, rounds: 1 },
];
const ROUNDS = 3;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed++; };

// The captcha up, and whether all of it can be seen and tapped.
const look = page => page.evaluate(() => {
    const run = EvalsUI.run, c = run && run.current;
    if (!c) return null;
    const stage = document.querySelector('.evals-stage');
    const buttons = [...document.querySelectorAll('.evals-target')];
    const boxes = buttons.map(b => b.getBoundingClientRect());
    const ends = [document.querySelector('.evals-prompt'), document.querySelector('.evals-verify') || document.querySelector('.evals-target')].map(n => n.getBoundingClientRect());
    return {
        kind: c.kind, id: c.id || '', answer: c.answer, wait: c.wait || 0, instant: !!c.instant, inline: c.targets.map(t => !!t.inline),
        scroll: stage.scrollHeight > stage.clientHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
        // A word in a sentence is as tall as its line; every other target is a finger's width at least.
        small: boxes.filter((r, j) => !c.targets[+buttons[j].dataset.i].inline && (r.width < 43.5 || r.height < 43.5)).length,
        cut: [...boxes, ...ends].some(r => r.top < -0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5),
    };
});

async function press(page, size, selector) {
    const box = await page.locator(selector).boundingBox();
    // Off the dead centre, as a hand is; with a mouse, by way of a bend, as a hand goes.
    const x = box.x + box.width * 0.62, y = box.y + box.height * 0.58;
    if (size.touch) return page.touchscreen.tap(x, y);
    const from = press.at || { x: 640, y: 700 };
    await page.mouse.move((from.x + x) / 2 + 60, (from.y + y) / 2 - 40, { steps: 6 });
    await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.click(x, y);
    press.at = { x, y };
}

// Drag one thing onto another, as a hand does: down, across in steps, up.
async function drag(page, from, to) {
    const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.55, { steps: 8 });
    await page.mouse.up();
    press.at = { x: b.x + b.width * 0.55, y: b.y + b.height * 0.55 };
    await page.waitForTimeout(140);
}

async function play(browser, size, url) {
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: size.touch ? 2 : 1, reducedMotion: size.reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/i.test(m.location()?.url || '')) errors.push(`${m.text()} ${m.location()?.url || ''}`); });
    await page.goto(url);
    await page.waitForTimeout(900);
    // Every kind from the start: the unlock ladder has its own tests (tests/evals-ladder.test.js).
    await page.evaluate(() => { AGI.debug.evalsLadder(false); AGI.debug.resetEvals(); AGI.debug.openEvals(); });
    await press(page, size, '.evals-go');
    await page.waitForTimeout(300);
    const kinds = await page.evaluate(() => ({ all: Object.keys(Evals.KINDS).length, order: Evals.ORDER.length }));
    const seen = new Set(), wrong = [], unfit = [];
    const rounds = size.rounds || ROUNDS;
    let hands = 0, answered = 0, dragged = 0;
    for (let n = 0; n < kinds.order * rounds; n++) {
        const c = await look(page);
        if (!c) { wrong.push(`no captcha at ${n}`); break; }
        const name = c.kind + (c.id ? ':' + c.id : '');
        if (c.scroll || c.small || c.cut) unfit.push(`${name}${c.scroll ? ' scrolls' : ''}${c.small ? ` ${c.small} small` : ''}${c.cut ? ' cut off' : ''}`);
        if (!seen.has(name)) { seen.add(name); await page.screenshot({ path: path.join(out, `${size.name.replace(/ /g, '-')}-${name.replace(/[.:]/g, '-')}.png`) }); }
        await page.waitForTimeout((c.wait + 0.85) * 1000);
        if (c.kind === 'handle.slide') { await drag(page, '.evals-piece-shape', `.evals-target[data-i="${c.answer[0]}"]`); dragged++; }
        else for (const i of c.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
        if (size.reduced && await page.evaluate(() => { const h = document.querySelector('.evals-hand'); return !!h && !h.hidden && h.getClientRects().length > 0; })) hands++;
        if (!c.instant) await press(page, size, '.evals-verify');
        await page.waitForTimeout(150);
        const status = await page.evaluate(() => document.querySelector('.evals-status')?.textContent || '');
        if (!status.startsWith('Verified')) wrong.push(`${name}: ${status}`);
        if (size.reduced && await page.evaluate(() => /^(Right|Wrong|It ticked)/.test(document.querySelector('.evals-its-line')?.textContent || ''))) answered++;
        await page.waitForTimeout(1050);
        // A takeover's card: carry on.
        if (await page.evaluate(() => !!document.querySelector('.evals-card'))) { await press(page, size, '.evals-go'); await page.waitForTimeout(200); }
    }
    const kindsSeen = new Set([...seen].map(s => s.split(':')[0]));
    check(wrong.length === 0, `${size.name}: ${kinds.order * rounds} captchas solved${wrong.length ? ' — ' + wrong.join('; ') : ''}`);
    check(kindsSeen.size >= kinds.order, `${size.name}: every family came up (${kindsSeen.size} kinds of ${kinds.all})`);
    check(unfit.length === 0, `${size.name}: every captcha in view, no scrolling, every target a finger wide${unfit.length ? ' — ' + [...new Set(unfit)].join('; ') : ''}`);
    if (dragged) check(!wrong.some(w => w.startsWith('handle.slide')), `${size.name}: the piece can be dragged into its slot (${dragged} dragged)`);
    if (size.reduced) {
        check(hands === 0, `${size.name}: the AI's hand never shows (${hands} captchas with it)`);
        check(answered > 0, `${size.name}: the AI's line still gives its answer (${answered} of ${kinds.order * rounds})`);
    }
    if (!size.touch) {
        // With a mouse, how the pointer moved is in the trace, and the ghost has your shapes to follow.
        const moved = await page.evaluate(() => {
            const kinds = Object.values(AGI.state.evals.learn.kinds);
            return { paths: kinds.filter(k => k.traces.some(t => t.path.length >= 9)).length, of: kinds.length, shapes: (EvalsUI.run.ghost.moves || []).filter(Boolean).length };
        });
        check(moved.paths === moved.of && moved.of > 0, `${size.name}: the pointer's path is recorded on every kind (${moved.paths} of ${moved.of})`);
        check(moved.shapes > 0, `${size.name}: the ghost hand has your shapes to follow (${moved.shapes} on the captcha up)`);
    }
    // Lose the run: every answer wrong (the tick box, ticked at once) until the lives are gone.
    for (let n = 0; n < 6 && await page.evaluate(() => !!(EvalsUI.run && !EvalsUI.run.over)); n++) {
        const c = await look(page);
        if (c.kind === 'trick.question' && c.id === 'nothing') await press(page, size, '.evals-target[data-i="0"]');
        await press(page, size, c.instant ? '.evals-target[data-i="0"]' : '.evals-verify');
        await page.waitForTimeout(2100);
    }
    const end = await page.evaluate(() => ({
        card: document.querySelector('.evals-card')?.innerText || '', runs: AGI.state.evals.runs, best: AGI.state.evals.best,
        logged: JSON.parse(localStorage.getItem('agiPlaytest') || '{"events":[]}').events.filter(e => e.e === 'evals').length,
        saved: !!JSON.parse(localStorage.getItem('agiGame') || '{}').evals,
    }));
    await page.screenshot({ path: path.join(out, `${size.name.replace(/ /g, '-')}-end.png`) });
    check(/Verification failed/.test(end.card) && /You solved \d+/.test(end.card), `${size.name}: the run ends on its card`);
    check(end.runs === 1 && end.best >= kinds.order * rounds - 3 && end.logged === 1 && end.saved, `${size.name}: the run is counted once, saved and logged (runs ${end.runs}, best ${end.best}, log lines ${end.logged})`);
    check(errors.length === 0, `${size.name}: no console errors${errors.length ? ' — ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
}

// The unlock ladder and handing over, on a phone: a new game shows one kind, warped words, and the AI never takes it;
// you hand it over, its card names the kinds that opened, the AI answers its own captcha, and you can take it back.
async function ladder(browser, url) {
    const size = SIZES[0];
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(900);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.evaluate(() => { AGI.debug.evalsLadder(true); AGI.debug.resetEvals(); AGI.debug.openEvals(); });
    const startCard = await page.evaluate(() => document.querySelector('.evals-card')?.innerText || '');
    check(/One kind of captcha to prove/.test(startCard), 'ladder: the start card says one kind is in');
    await press(page, size, '.evals-go');
    await page.waitForTimeout(300);
    const kinds = new Set(), unfit = [];
    const fit = async () => { const c = await look(page); if (c && (c.scroll || c.small || c.cut)) unfit.push(c.kind); const give = await page.locator('.evals-give').boundingBox(); if (!give || give.height < 43.5 || give.x + give.width > size.viewport.width) unfit.push('hand over button'); return c; };
    // Twelve solved by hand: it never takes the kind itself.
    for (let n = 0; n < 12; n++) {
        const c = await fit();
        if (!c) break;
        kinds.add(c.kind);
        await page.waitForTimeout(850);
        for (const i of c.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
        await press(page, size, '.evals-verify');
        await page.waitForTimeout(1250);
    }
    check(kinds.size === 1 && kinds.has('read.word') && !(await page.evaluate(() => !!document.querySelector('.evals-card'))), `ladder: only warped words come up at first, and it takes nothing itself (${[...kinds].join(', ')})`);
    // Hand the kind over: its card names what opened.
    await press(page, size, '.evals-handover');
    await page.waitForTimeout(250);
    const card = await page.evaluate(() => document.querySelector('.evals-card')?.innerText || '');
    check(/Handed over/.test(card) && /New to prove: sums and struck-through words/.test(card) && /2 kinds of captcha to prove\. The AI does one kind for you/.test(card), 'handover: its card names what opened');
    await page.screenshot({ path: path.join(out, 'handover-card.png') });
    await press(page, size, '.evals-go');
    await page.waitForTimeout(400);
    // The captcha up is the AI's now: it answers it alone, and its answer counts.
    const before = await page.evaluate(() => ({ auto: !!EvalsUI.run.current.auto, solved: EvalsUI.run.solved, lives: EvalsUI.run.lives, own: AGI.state.evals.learn.kinds['read.word'].own }));
    await fit();
    await page.screenshot({ path: path.join(out, 'handover-its-own.png') });
    await page.waitForFunction(() => /^The AI (verified|got it wrong)/.test(document.querySelector('.evals-status')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const status = await page.evaluate(() => document.querySelector('.evals-status')?.textContent || '');
    const after = await page.evaluate(() => ({ solved: EvalsUI.run.solved, lives: EvalsUI.run.lives, own: AGI.state.evals.learn.kinds['read.word'].own }));
    const counted = /verified/.test(status) ? after.solved === before.solved + 1 && after.lives === before.lives : after.lives === before.lives - 1 && after.solved === before.solved;
    check(before.auto && after.own === before.own + 1 && counted, `handover: the AI answers its own captcha and it counts (${status})`);
    // On through the run until one of its captchas is up again, solving your own; then take the kind back.
    let mine = new Set(), back = false, stopped = false;
    for (let n = 0; n < 12 && !back; n++) {
        await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed') && !!EvalsUI.run?.current, null, { timeout: 30000 }).catch(() => {});
        const c = await fit();
        if (!c) break;
        if (await page.evaluate(() => !!EvalsUI.run.current.auto)) {
            if (mine.size) { await press(page, size, '.evals-stop'); await page.waitForTimeout(300); stopped = await page.evaluate(() => !EvalsUI.run.current.auto && !!EvalsUI.run.current.stopped && AGI.state.evals.learn.kinds['read.word'].taken && !document.querySelector('.evals-verify').disabled); await fit(); await page.screenshot({ path: path.join(out, 'handover-stopped.png') }); await press(page, size, '.evals-takeback'); await page.waitForTimeout(300); back = await page.evaluate(() => !EvalsUI.run.current.auto && !AGI.state.evals.learn.kinds['read.word'].taken); break; }
            await page.waitForFunction(() => !!document.querySelector('.evals-captcha.passed, .evals-captcha.failed'), null, { timeout: 30000 }).catch(() => {});
            continue;
        }
        mine.add(c.kind);
        await page.waitForTimeout(850);
        for (const i of c.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
        await press(page, size, '.evals-verify');
        await page.waitForTimeout(300);
    }
    check([...mine].every(k => ['answer.sum', 'read.struck'].includes(k)) && mine.size > 0, `handover: the newly opened kinds come up for you (${[...mine].join(', ') || 'none'})`);
    check(stopped, 'handover: Stop makes its captcha yours to solve, the kind still handed over');
    check(back, 'handover: Take back makes the kind yours again');
    check(unfit.length === 0, `handover: everything in view and a finger wide${unfit.length ? ' — ' + [...new Set(unfit)].join('; ') : ''}`);
    check(errors.length === 0, `handover: no page errors${errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''}`);
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.evalsLadder(true); });
    await ctx.close();
}

(async () => {
    const srv = await ensureServer(process.env.REVIEW_URL || 'http://localhost:8123/');
    const browser = await chromium.launch();
    try {
        for (const size of SIZES) { press.at = null; await play(browser, size, srv.url); }
        await ladder(browser, srv.url);
    } finally {
        await browser.close();
        if (srv.close) srv.close();
    }
    console.log(failed ? `\n${failed} check${failed === 1 ? '' : 's'} failed. Screenshots in ${out}` : `\nAll checks passed. Screenshots in ${out}`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
