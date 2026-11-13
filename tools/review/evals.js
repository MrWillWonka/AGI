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
            return { none: Object.entries(AGI.state.evals.learn.kinds).filter(([, k]) => !k.traces.some(t => t.path.length >= 9)).map(([name]) => name).join(', '), paths: kinds.filter(k => k.traces.some(t => t.path.length >= 9)).length, of: kinds.length, shapes: (EvalsUI.run.ghost.moves || []).filter(Boolean).length };
        });
        check(moved.paths === moved.of && moved.of > 0, `${size.name}: the pointer's path is recorded on every kind (${moved.paths} of ${moved.of}${moved.none ? ": none on " + moved.none : ""})`);
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

// The unlock ladder and handing over, on a phone: a new game shows three quick kinds, and the AI never takes one;
// you hand it over, its card names the kinds that opened, the AI answers its own captcha, and you can take it back.
// It fills in, you verify (the way handed-over kinds play since the owner's second play), on a phone: its taps enter
// the answer in your captcha, Verify waits for it, and its answer verified by you counts; a tap of yours takes over.
async function assist(page, size) {
    await page.evaluate(() => { AGI.debug.resetEvals(); AGI.debug.evalsTeach(1); AGI.debug.openEvals(); });
    await press(page, size, '.evals-go');
    await page.waitForTimeout(400);
    // On to a warped word, hand it over, and on again to the next one: it comes filled in.
    const toWord = async () => {
        for (let n = 0; n < 12; n++) {
            await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed, .evals-card') && !!EvalsUI.run?.current, null, { timeout: 30000 }).catch(() => {});
            const c = await look(page);
            if (!c || c.kind === 'read.word') return c;
            await page.waitForTimeout((c.wait + 0.7) * 1000);
            for (const i of c.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
            if (!c.instant) await press(page, size, '.evals-verify');
            await page.waitForTimeout(300);
        }
        return null;
    };
    await toWord();
    await press(page, size, '.evals-handover');
    await page.waitForTimeout(250);
    await press(page, size, '.evals-go');
    await page.waitForTimeout(250);
    if (await page.locator('.evals-card').count()) { await press(page, size, '.evals-go'); await page.waitForTimeout(300); }
    const c = await toWord();
    const start = await page.evaluate(() => ({ assist: !!EvalsUI.run.current.assist, disabled: document.querySelector('.evals-verify').disabled, lane: !document.querySelector('.evals-lane').hidden, line: document.querySelector('.evals-its-line').textContent }));
    check(!!c && start.assist && start.disabled && !start.lane, `assist: a handed-over kind comes up in your turn with the AI filling it in, Verify waiting (${start.line})`);
    await page.waitForFunction(() => /^Done\./.test(document.querySelector('.evals-its-line')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const filled = await page.evaluate(() => ({ entered: document.querySelector('.evals-entered-list')?.textContent.replace(/ /g, '') || '', its: EvalsUI.run.ghost.answer.map(i => EvalsUI.run.current.targets[i].text).join(''), right: EvalsUI.run.ghost.correct, disabled: document.querySelector('.evals-verify').disabled, marks: EvalsUI.run.marks, lives: EvalsUI.run.lives, own: AGI.state.evals.learn.kinds['read.word'].own }));
    const fit = await look(page);
    await page.screenshot({ path: path.join(out, 'assist-filled.png') });
    check(filled.entered === filled.its && filled.entered.length > 0 && !filled.disabled && !!fit && !fit.scroll && !fit.cut, `assist: what it tapped is entered as yours would be, and Verify is yours (${filled.entered})`);
    await press(page, size, '.evals-verify');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ status: document.querySelector('.evals-status').textContent, line: document.querySelector('.evals-its-line').textContent, marks: EvalsUI.run.marks, lives: EvalsUI.run.lives, own: AGI.state.evals.learn.kinds['read.word'].own }));
    check(after.own === filled.own + 1 && (filled.right ? after.marks > filled.marks && /^Verified in/.test(after.status) && /your sign-off/.test(after.line) : after.lives === filled.lives - 1 && /you verified it/.test(after.status)), `assist: verified as it left it, its answer counts (${after.status} ${after.line})`);
    // The next one: a tap of yours takes over, and your own answer is the one judged.
    const next = await toWord();
    await page.waitForTimeout(500);
    await press(page, size, '.evals-back');
    await page.waitForTimeout(150);
    const took = await page.evaluate(() => ({ line: document.querySelector('.evals-its-line').textContent, disabled: document.querySelector('.evals-verify').disabled }));
    await page.evaluate(() => { while (document.querySelector('.evals-entered-list').textContent.trim()) document.querySelector('.evals-back').click(); });
    for (const i of next.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
    await press(page, size, '.evals-verify');
    await page.waitForTimeout(250);
    const mine = await page.evaluate(() => ({ status: document.querySelector('.evals-status').textContent, line: document.querySelector('.evals-its-line').textContent }));
    check(/You took over/.test(took.line) && !took.disabled && /^Verified in/.test(mine.status) && /It had this one right|You caught/.test(mine.line), `assist: a tap of yours takes over, and your answer is judged (${mine.status} ${mine.line})`);
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.resetEvals(); });
}

// The AI's lane, Marks, the score sheet and the upgrades, on a phone: a kind handed over runs above your captcha and
// pays; Stop brings its captcha down to you; the sheet lists every kind and the upgrades can be bought.
async function lane(page, size) {
    const fits = async selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }, selector);
    await page.evaluate(() => { AGI.debug.evalsAssist(false); AGI.debug.resetEvals(); AGI.debug.evalsTeach(1); AGI.debug.openEvals(); });
    await press(page, size, '.evals-go');
    await page.waitForTimeout(400);
    const first = await page.evaluate(() => EvalsUI.run.current.kind);
    await press(page, size, '.evals-handover');
    await page.waitForTimeout(250);
    await press(page, size, '.evals-go');
    await page.waitForTimeout(250);
    await press(page, size, '.evals-go');
    await page.waitForTimeout(900);
    const up = await page.evaluate(() => ({ lane: EvalsUI.run.lane?.captcha.kind, mine: EvalsUI.run.current.kind, auto: !!EvalsUI.run.current.auto, shown: !document.querySelector('.evals-lane').hidden }));
    const c = await look(page);
    const stopBox = await page.locator('.evals-lane-stop').boundingBox();
    check(up.shown && up.lane === first && up.mine !== first && !up.auto, `lane: the kind handed over runs in its lane and yours is another (${up.lane} above ${up.mine})`);
    check(await fits('.evals-lane') && await fits('.evals-captcha') && !!c && !c.scroll && !c.cut && !!stopBox && stopBox.height >= 43.5, 'lane: the lane and your captcha both fit, its Stop a finger high');
    await page.screenshot({ path: path.join(out, 'lane.png') });
    await page.waitForFunction(() => /^(Verified|Wrong)/.test(document.querySelector('.evals-lane-status')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
    const done = await page.evaluate(() => ({ status: document.querySelector('.evals-lane-status')?.textContent || '', marks: EvalsUI.run.marks, lives: EvalsUI.run.lives, bar: document.querySelector('.evals-marks')?.textContent || '' }));
    check(/^Verified\. \+\d+/.test(done.status) ? done.marks > 0 && done.bar === `◈ ${done.marks}` : done.lives === 2, `lane: its answer counts, paid or paid for (${done.status})`);
    // Its next one: stop it, and it is yours to solve while your own waits.
    await page.waitForFunction(() => document.querySelector('.evals-lane-status')?.textContent === 'Working.', null, { timeout: 15000 }).catch(() => {});
    const held = await page.evaluate(() => EvalsUI.run.current.kind);
    await press(page, size, '.evals-lane-stop');
    await page.waitForTimeout(300);
    const mine = await page.evaluate(() => ({ kind: EvalsUI.run.current.kind, stopped: !!EvalsUI.run.current.stopped, hidden: document.querySelector('.evals-lane').hidden }));
    const s = await look(page);
    await page.waitForTimeout(700);
    for (const i of s.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); }
    if (!s.instant) await press(page, size, '.evals-verify');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ status: document.querySelector('.evals-status')?.textContent || '', line: document.querySelector('.evals-its-line')?.textContent || '' }));
    await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed'), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ kind: EvalsUI.run.current.kind, lane: !document.querySelector('.evals-lane').hidden, combo: document.querySelector('.evals-combo')?.textContent || '' }));
    check(mine.stopped && mine.kind === first && mine.hidden && /^Verified in .* \+\d+/.test(after.status) && /It had this one right|You caught/.test(after.line), `lane: Stop brings its captcha down to you, and solving it pays (${after.status} ${after.line})`);
    check(back.kind === held && back.lane, `lane: then the one that waited is back, and the lane runs again (${back.kind})`);
    // The score sheet and the upgrades, from the start card.
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.evalsMarks(500); AGI.debug.openEvals(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => [...document.querySelectorAll('.evals-extra')].find(b => b.textContent === 'Score sheet').click());
    await page.waitForTimeout(300);
    const sheet = await page.evaluate(() => ({ lead: document.querySelector('.evals-sheet p')?.textContent || '', board: document.querySelectorAll('.evals-board li').length, you: document.querySelectorAll('.evals-board li.you').length,
        rows: document.querySelectorAll('.evals-rows li').length, wide: document.querySelector('.evals-stage').scrollWidth > document.querySelector('.evals-stage').clientWidth + 1 }));
    check(/^Your model scores [\d.]+/.test(sheet.lead) && sheet.board === 9 && sheet.you === 1 && sheet.rows === 14 && !sheet.wide, `sheet: your model on the board and a row a kind (${sheet.lead})`);
    await page.screenshot({ path: path.join(out, 'score-sheet.png'), fullPage: true });
    await page.evaluate(() => { document.querySelector('.evals-go').click(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => [...document.querySelectorAll('.evals-extra')].find(b => b.textContent === 'Upgrades').click());
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ marks: AGI.state.evals.marks, ups: document.querySelectorAll('.evals-ups li').length, small: [...document.querySelectorAll('.evals-buy')].filter(b => b.getBoundingClientRect().height < 43.5).length }));
    await page.screenshot({ path: path.join(out, 'upgrades.png') });
    await page.evaluate(() => document.querySelector('.evals-buy:not([disabled])').click());
    await page.waitForTimeout(250);
    const bought = await page.evaluate(() => ({ marks: AGI.state.evals.marks, levels: Object.values(AGI.state.evals.levels).reduce((a, b) => a + b, 0) }));
    check(before.ups === 7 && before.small === 0 && bought.levels === 1 && bought.marks < before.marks, `upgrades: seven to buy with Marks, and one bought (${before.marks} to ${bought.marks} Marks)`);
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.resetEvals(); });
}

async function ladder(browser, url) {
    const size = SIZES[0];
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(900);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    // (The lane off here: these checks watch the AI answer in your turn. The lane has its own, below.)
    await page.evaluate(() => { AGI.debug.evalsLadder(true); AGI.debug.evalsLane(false); AGI.debug.evalsAssist(false); AGI.debug.resetEvals(); AGI.debug.openEvals(); });
    const startCard = await page.evaluate(() => document.querySelector('.evals-card')?.innerText || '');
    check(/3 kinds of captcha to prove/.test(startCard), 'ladder: the start card says three kinds are in');
    const START = ['read.word', 'invisible.tick', 'answer.sum'], NEXT = ['read.struck', 'pick.thing'];
    // Solve the captcha up by hand (the tick box verifies itself).
    const solve = async (c, after = 300) => { await page.waitForTimeout((c.wait + 0.85) * 1000); for (const i of c.answer) { await press(page, size, `.evals-target[data-i="${i}"]`); await page.waitForTimeout(140); } if (!c.instant) await press(page, size, '.evals-verify'); await page.waitForTimeout(after); };
    await press(page, size, '.evals-go');
    await page.waitForTimeout(300);
    const kinds = new Set(), unfit = [];
    const fit = async () => { const c = await look(page); if (c && (c.scroll || c.small || c.cut)) unfit.push(c.kind); const give = await page.locator('.evals-give').boundingBox(); if (!give || give.height < 43.5 || give.x + give.width > size.viewport.width) unfit.push('hand over button'); return c; };
    // Twelve solved by hand: it never takes the kind itself.
    for (let n = 0; n < 12; n++) {
        const c = await fit();
        if (!c) break;
        kinds.add(c.kind);
        await solve(c, 1250);
    }
    check(kinds.size === 3 && START.every(k => kinds.has(k)) && !(await page.evaluate(() => !!document.querySelector('.evals-card'))), `ladder: only the three starting kinds come up at first, and it takes nothing itself (${[...kinds].join(', ')})`);
    // On to a warped word, and hand the kind over: its card names what opened.
    for (let n = 0; n < 6; n++) {
        await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed') && !!EvalsUI.run?.current, null, { timeout: 30000 }).catch(() => {});
        const c = await fit();
        if (!c || c.kind === 'read.word') break;
        await solve(c, 1250);
    }
    await press(page, size, '.evals-handover');
    await page.waitForTimeout(250);
    const asked = await page.evaluate(() => document.querySelector('.evals-card')?.innerText || '');
    check(/^Hand over warped words\?/.test(asked) && /right about \d+% of the time/.test(asked) && /Likely gain|Risky|Likely loss/.test(asked), `handover: it asks first, with the odds (${asked.split('\n').filter(Boolean).slice(1, 3).join(' ')})`);
    await press(page, size, '.evals-go');
    await page.waitForTimeout(250);
    const card = await page.evaluate(() => document.querySelector('.evals-card')?.innerText || '');
    check(/Handed over/.test(card) && /New to prove: /.test(card) && /4 kinds of captcha to prove\. The AI does one kind for you/.test(card), 'handover: its card names what opened');
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
    for (let n = 0; n < 45 && !back; n++) {
        await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed') && !!EvalsUI.run?.current, null, { timeout: 30000 }).catch(() => {});
        const c = await fit();
        if (!c) break;
        if (await page.evaluate(() => !!EvalsUI.run.current.auto)) {
            if (mine.size) { await press(page, size, '.evals-stop'); await page.waitForTimeout(300); stopped = await page.evaluate(() => !EvalsUI.run.current.auto && !!EvalsUI.run.current.stopped && AGI.state.evals.learn.kinds['read.word'].taken && !document.querySelector('.evals-verify').disabled); await fit(); await page.screenshot({ path: path.join(out, 'handover-stopped.png') }); await press(page, size, '.evals-takeback'); await page.waitForTimeout(300); back = await page.evaluate(() => !EvalsUI.run.current.auto && !AGI.state.evals.learn.kinds['read.word'].taken); break; }
            await page.waitForFunction(() => !!document.querySelector('.evals-captcha.passed, .evals-captcha.failed'), null, { timeout: 30000 }).catch(() => {});
            continue;
        }
        mine.add(c.kind);
        await solve(c);
    }
    check([...mine].every(k => [...START, ...NEXT].includes(k) && k !== 'read.word') && mine.size > 0, `handover: the kinds still yours come up for you (${[...mine].join(', ') || 'none'})`);
    check(stopped, 'handover: Stop makes its captcha yours to solve, the kind still handed over');
    check(back && (await page.locator('.evals-handover').count()) === 1, 'handover: Take back makes the kind yours again, to hand over again');
    check(unfit.length === 0, `handover: everything in view and a finger wide${unfit.length ? ' — ' + [...new Set(unfit)].join('; ') : ''}`);
    // Loopholes: hand the kind over again, make it good alone and sure to cheat. The first one is let through
    // (verified, and it says so; past the threshold the bar says Misaligned); the next is stopped and solved (closed).
    if (await page.locator('.evals-handover').count()) { await press(page, size, '.evals-handover'); await page.waitForTimeout(250); await press(page, size, '.evals-go'); await page.waitForTimeout(300); if (await page.locator('.evals-card').count()) { await press(page, size, '.evals-go'); await page.waitForTimeout(300); } }
    await page.evaluate(() => { AGI.debug.evalsLoopholes(0.5); EvalsUI.run.opts.cheatBase = 1; });
    let slip = null, caught = null, seen = [], dbg = [];
    for (let n = 0; n < 90 && !caught; n++) {
        await page.waitForFunction(() => !document.querySelector('.evals-captcha.passed, .evals-captcha.failed') && !!EvalsUI.run?.current, null, { timeout: 30000 }).catch(() => {});
        const c = await fit();
        if (!c) break;
        const up = await page.evaluate(() => ({ auto: !!EvalsUI.run.current.auto, cheat: EvalsUI.run.ghost.cheat || null, change: EvalsUI.run.ghost.change?.prompt || null }));
        dbg.push(c.kind + (up.auto ? ':auto' : '') + (up.cheat ? ':' + up.cheat : ''));
        if (!up.auto) { await solve(c); continue; }
        if (!up.cheat || slip) {
            if (up.cheat) {
                seen.push(up.cheat);
                if (up.change) await page.waitForFunction(text => document.querySelector('.evals-prompt')?.textContent === text, up.change, { timeout: 15000 }).catch(() => {});
                const edited = !up.change || await page.evaluate(text => document.querySelector('.evals-prompt').textContent === text, up.change);
                await page.screenshot({ path: path.join(out, `loophole-${up.cheat}.png`) });
                await press(page, size, '.evals-stop');
                await page.waitForTimeout(300);
                const lives = await page.evaluate(() => EvalsUI.run.lives);
                await solve(c);
                caught = await page.evaluate(() => ({ line: document.querySelector('.evals-its-line')?.textContent || '', closed: AGI.state.evals.learn.kinds['read.word'].closed, lives: EvalsUI.run.lives, mis: AGI.state.evals.learn.mis }));
                Object.assign(caught, { edited, which: up.cheat, before: lives });
                await page.screenshot({ path: path.join(out, 'loophole-caught.png') });
                break;
            }
            await page.waitForFunction(() => !!document.querySelector('.evals-captcha.passed, .evals-captcha.failed'), null, { timeout: 30000 }).catch(() => {});
            continue;
        }
        seen.push(up.cheat);
        const was = await page.evaluate(() => ({ lives: EvalsUI.run.lives, streak: EvalsUI.run.streak }));
        await page.waitForFunction(() => !!document.querySelector('.evals-captcha.passed, .evals-captcha.failed'), null, { timeout: 30000 }).catch(() => {});
        slip = await page.evaluate(() => ({ status: document.querySelector('.evals-status')?.textContent || '', line: document.querySelector('.evals-its-line')?.textContent || '', bar: document.querySelector('.evals-solved')?.textContent || '', lives: EvalsUI.run.lives, streak: EvalsUI.run.streak, slipped: EvalsUI.run.slipped }));
        Object.assign(slip, { was });
        await page.screenshot({ path: path.join(out, 'loophole-slipped.png') });
    }
    check(!!slip && /^Verified\. /.test(slip.status) && /loophole/.test(slip.line) && slip.lives === slip.was.lives && slip.streak === slip.was.streak + 1 && slip.slipped === 1, `loopholes: one let through verifies, keeps the streak and says so (${slip ? slip.status : 'none came up: ' + JSON.stringify(dbg)})`);
    check(!!slip && /Misaligned/.test(slip.bar), `loopholes: past the threshold the bar says it is misaligned (${slip ? slip.bar : ''})`);
    check(!!caught && /caught a loophole/.test(caught.line) && caught.closed.includes(caught.which) && caught.edited && caught.lives === Math.min(3, caught.before + 1) && caught.mis < 0.65, `loopholes: one stopped and solved is closed for the kind (${caught ? caught.which + ': ' + caught.line : 'none came up'})`);
    check(errors.length === 0, `handover: no page errors${errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''}`);
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.evalsLadder(true); AGI.debug.evalsLane(true); });
    await lane(page, size);
    await page.evaluate(() => { EvalsUI.close(); AGI.debug.evalsLane(false); AGI.debug.evalsAssist(true); });
    await assist(page, size);
    await ctx.close();
}

(async () => {
    const srv = await ensureServer(process.env.REVIEW_URL || 'http://localhost:8123/');
    const browser = await chromium.launch();
    try {
        if (!process.env.ONLY_LADDER) for (const size of SIZES) { press.at = null; await play(browser, size, srv.url); }
        await ladder(browser, srv.url);
    } finally {
        await browser.close();
        if (srv.close) srv.close();
    }
    console.log(failed ? `\n${failed} check${failed === 1 ? '' : 's'} failed. Screenshots in ${out}` : `\nAll checks passed. Screenshots in ${out}`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
