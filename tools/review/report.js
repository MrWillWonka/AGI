// tools/review/report.js — everything a round can measure without a reviewer, in a couple of minutes: the tests (the slow
// pacing test included), the pacing on both screens (tools/review/pacing.js), the standard screenshots, layout and console
// checks, rule checks that must stay fixed (and a self-test that each can fail), and a full field's frame rate.
//   node tools/review/report.js <out dir> [--url http://localhost:8200/] [--quick] [--prev <an earlier report's dir>]
// The pacing runs and the desktop, phone and sideways browser passes run at once; the frame rate is measured alone
// afterwards, so the machine is quiet. Rule checks (PASS/FAIL): Start in full view on every first card, the look out card
// meets what its sector brings, no tip mid-run on a sector reached as a player reaches it, the sideways how-to above Start,
// no page scroll sideways, a clean console. The self-test breaks a page on purpose (Start pushed off, the page made to
// scroll, an error logged, a tip shown mid-run) and checks each rule catches it. With --prev, the still parts of each
// screenshot (cards, the tree, the HUD: the field moves every frame) are compared with the earlier report's, so reviewers
// look first at what moved. Writes <out>/report.md, <out>/*.png and a .json of each screenshot's still regions.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || 'review-out/report');
const argv = process.argv;
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : (process.env.REVIEW_URL || 'http://localhost:8123/');
process.env.REVIEW_URL = URL;
const QUICK = argv.includes('--quick');
const PREV = argv.includes('--prev') ? path.resolve(argv[argv.indexOf('--prev') + 1]) : null;
fs.mkdirSync(out, { recursive: true });
const K = require('./kit.js');
const md = [];
const say = x => md.push(x);
const run = (cmd, args, env = {}) => new Promise(res => execFile(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000, env: { ...process.env, ...env } },
    (err, stdout, stderr) => res((stdout || '') + (err ? stderr || '' : ''))));

const rules = [];
const rule = (name, ok, detail = '') => rules.push({ name, ok: !!ok, detail });
const shots = [];
// The checks a page can be put through (the self-test runs them on a broken page too).
const startVisible = page => page.evaluate(() => {
    const b = document.querySelector('#snareCard .result-actions .button'), c = document.getElementById('snareCard');
    if (!b || !c || c.hidden) return { ok: false, why: 'no card' };
    const r = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
    return { ok: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && r.bottom <= innerHeight + 1 && r.top >= 0, why: `button ${Math.round(r.top)}–${Math.round(r.bottom)}, card ${Math.round(cr.top)}–${Math.round(cr.bottom)}, window ${innerHeight}` };
});
const tipUp = page => page.evaluate(() => { const c = document.getElementById('snareCard'); return !!(c && !c.hidden && c.classList.contains('snare-intro')); });
const pageScroll = page => page.evaluate(() => Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth));
const overflow = page => page.evaluate(() => {
    const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
    const cut = [...document.querySelectorAll('#snarePanel button, #snareCard, #snareCard .button, .snare-tree-bar .button')]
        .filter(b => b.offsetParent && b.getClientRects().length)
        .map(b => ({ b, r: b.getBoundingClientRect() }))
        .filter(({ r }) => r.right > W + 1 || r.left < -1 || r.bottom > innerHeight + 1)
        .map(({ b }) => (b.id || b.className || b.tagName).toString().slice(0, 40));
    return { scroll: sw > W + 1 ? sw - W : 0, cut };
});
// A screenshot, its layout checks, and the still regions to compare later (cards, the tree, the HUD, in image pixels).
async function shoot(page, name, note) {
    await K.shot(page, path.join(out, name + '.png'));
    const still = await page.evaluate(() => ['snareCard', 'snareTree', 'snareHud'].map(id => document.getElementById(id))
        .filter(n => n && !n.hidden && n.offsetParent && n.getClientRects().length)
        .map(n => { const r = n.getBoundingClientRect(), d = devicePixelRatio; return [r.left * d, r.top * d, r.width * d, r.height * d].map(Math.round); }));
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ still }));
    shots.push({ name, note, ...(await overflow(page)) });
}

async function upright(phone) {
    const tag = phone ? 'phone' : 'desktop';
    const { browser, page } = await K.launch({ phone });
    try {
        await K.fresh(page);
        await shoot(page, `${tag}-01-first-card`, 'a new player\'s first card');
        const sv = await startVisible(page);
        rule(`${tag}: Start in full view on the first card`, sv.ok, sv.why);
        await K.start(page);
        const b = await K.bestSpot(page);
        if (b) await K.bubble(page, b.x, b.y, 900);
        await page.waitForTimeout(400);
        await shoot(page, `${tag}-02-first-run`, 'the first run, a catch made');
        for (let i = 0; i < 12; i++) { const s = await K.state(page); if (!s || s.over) break; const q = await K.bestSpot(page); if (q) await K.bubble(page, q.x, q.y, 1300); else await page.waitForTimeout(300); }
        await page.waitForTimeout(900);
        await shoot(page, `${tag}-03-first-end`, 'the first run\'s end card');
        for (const [k, name] of [[3, 'sector-3'], [5, 'boss-5'], [9, 'sector-9']]) {
            await K.scenario(page, k);
            await shoot(page, `${tag}-${name}-card`, `sector ${k}'s card with the campaign's build`);
            // the look out card meets every threat sector k brings (after an end card, Snare again shows it first, as a
            // player sees it)
            await K.start(page);
            const inRun = () => page.evaluate(() => { const r = AGI.debug.snareRun(); return !!(r && !r.over && document.getElementById('snareCard').hidden); });
            if (!(await inRun())) { await shoot(page, `${tag}-${name}-lookout`, `sector ${k}'s look out card (Snare again)`); await K.start(page); }
            const meets = await page.evaluate(k => { const need = AGI.debug.snareMetBefore(k).filter(x => !AGI.debug.snareMetBefore(k - 1).includes(x)); return { need, shown: need.filter(x => AGI.state.intro['snare:intro:' + x]) }; }, k);
            rule(`${tag}: sector ${k}'s card meets what it brings`, meets.shown.length === meets.need.length, `brings ${meets.need.join(', ') || 'nothing new'}; met ${meets.shown.join(', ') || '—'}`);
            let midTip = false;
            for (let i = 0; i < (k === 5 ? 13 : 7); i++) { await page.waitForTimeout(500); if (await tipUp(page)) midTip = true; }
            rule(`${tag}: no tip mid-run on sector ${k}`, !midTip);
            await K.cards(page, true);
            await shoot(page, `${tag}-${name}-run`, `sector ${k} mid-run`);
            await page.evaluate(() => AGI.debug.snareRun()?.stop?.());
            await page.waitForTimeout(600);
        }
        await page.keyboard.press('u');
        await page.waitForTimeout(700);
        await shoot(page, `${tag}-tree`, 'the tree with sector 9\'s build');
        await page.keyboard.press('Escape');
        rule(`${tag}: no console errors`, !page.errors.length, page.errors[0] || '');
    } catch (e) { rule(`${tag}: the browser pass ran`, false, String(e).slice(0, 200)); }
    await browser.close();
}

async function sideways() {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    try {
        await page.goto(URL); await page.waitForTimeout(700);
        await page.evaluate(() => localStorage.clear());
        await page.goto(URL); await page.waitForTimeout(700);
        await page.evaluate(() => { AGI.debug.openSnare(); AGI.debug.resetSnare(); });
        await page.waitForTimeout(1300);
        await shoot(page, 'sideways-01-first-card', 'a sideways phone\'s first card');
        const sv = await startVisible(page);
        rule('sideways: Start in full view on the first card', sv.ok, sv.why);
        const how = await page.evaluate(() => {
            const p = [...document.querySelectorAll('#snareCard p')].find(x => /^CONTROLS:|hold still|right mouse/i.test(x.textContent));
            const b = document.querySelector('#snareCard .result-actions');
            return p && b ? { ok: p.getBoundingClientRect().top < b.getBoundingClientRect().top - 10 } : { ok: false };
        });
        rule('sideways: the how-to starts above Start', how.ok);
        const sc = await pageScroll(page);
        rule('sideways: no page scroll', sc <= 1, `${sc} px`);
        rule('sideways: no console errors', !errs.length, errs[0] || '');
    } catch (e) { rule('sideways: the browser pass ran', false, String(e).slice(0, 200)); }
    await browser.close();
}

// The self-test: a rule that can't fail checks nothing. Each check runs on a page broken on purpose and must say FAIL.
async function selfTest() {
    const { browser, page } = await K.launch({ phone: false });
    const caught = [];
    try {
        await K.fresh(page);
        await page.addStyleTag({ content: '#snareCard .result-actions { transform: translateY(600px); }' });
        caught.push(['Start pushed off the card', !(await startVisible(page)).ok]);
        await page.evaluate(() => { const d = document.createElement('div'); d.id = 'selftest-tall'; d.style.height = '3000px'; document.body.append(d); });
        caught.push(['the page made to scroll', (await pageScroll(page)) > 1]);
        await page.evaluate(() => document.getElementById('selftest-tall').remove());
        await page.evaluate(() => { setTimeout(() => { throw new Error('selftest error'); }); });
        await page.waitForTimeout(100);
        caught.push(['an error thrown', page.errors.length > 0]);
        await page.evaluate(() => { const c = document.getElementById('snareCard'); c.hidden = false; c.classList.add('snare-intro'); });
        caught.push(['a tip shown', await tipUp(page)]);
    } catch (e) { caught.push(['the self-test ran', false]); }
    await browser.close();
    return caught;
}

async function frameRate() {
    const { browser, page } = await K.launch({ phone: false });
    try {
        await K.fresh(page);
        await page.evaluate(() => { AGI.debug.snareMax(); for (const k of AGI.debug.snareMetBefore(13)) AGI.state.intro['snare:intro:' + k] = true; AGI.debug.snareSector(12); });
        await page.waitForTimeout(500);
        await K.start(page);
        await K.cards(page, true);
        await page.waitForTimeout(2500);
        await page.evaluate(() => { window.__f = []; const f = t => { window.__f.push(t); if (window.__f.length < 1e5) requestAnimationFrame(f); }; requestAnimationFrame(f); });
        for (let i = 0; i < 5; i++) { const q = await K.bestSpot(page, 2, 0.2); if (q) await K.bubble(page, q.x, q.y, 1300); }
        const fr = await page.evaluate(() => { const f = window.__f, d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((a, b) => a - b); return { fps: +(d.length / ((f[f.length - 1] - f[0]) / 1000)).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), worst: +d[d.length - 1].toFixed(1), packets: AGI.debug.snareRun()?.packets.length }; });
        await shoot(page, 'desktop-max-field', `a maxed tree on sector 13: ${fr.fps} fps, p95 ${fr.p95} ms, worst ${fr.worst} ms, ${fr.packets} packets`);
        return `Full field (maxed tree, sector 13, desktop, measured alone): **${fr.fps} fps**, p95 frame ${fr.p95} ms, worst ${fr.worst} ms, ${fr.packets} packets.`;
    } catch (e) { return `Full-field check failed: ${String(e).slice(0, 200)}`; } finally { await browser.close(); }
}

// The still regions of a screenshot against the earlier report's: the share of their pixels that changed.
async function diffs() {
    const out2 = {};
    if (!PREV) return out2;
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const c of shots) {
        const a = path.join(out, c.name + '.png'), b = path.join(PREV, c.name + '.png');
        if (!fs.existsSync(b)) { out2[c.name] = 'new'; continue; }
        const still = JSON.parse(fs.readFileSync(path.join(out, c.name + '.json'), 'utf8')).still;
        if (!still.length) { out2[c.name] = 'field only'; continue; }
        out2[c.name] = await page.evaluate(async ([x, y, still]) => {
            const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
            const [p, q] = await Promise.all([load(x), load(y)]);
            if (p.width !== q.width || p.height !== q.height) return 'resized';
            const cv = document.createElement('canvas'); cv.width = p.width; cv.height = p.height;
            const g = cv.getContext('2d');
            let n = 0, all = 0;
            for (const [l, t, w, h] of still) {
                if (w < 1 || h < 1) continue;
                g.clearRect(0, 0, cv.width, cv.height);
                g.drawImage(p, 0, 0); const da = g.getImageData(l, t, w, h).data;
                g.drawImage(q, 0, 0); const db = g.getImageData(l, t, w, h).data;
                for (let i = 0; i < da.length; i += 4) { all++; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++; }
            }
            return all ? `${(n / all * 100).toFixed(1)}%` : 'field only';
        }, ['data:image/png;base64,' + fs.readFileSync(a).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(b).toString('base64'), still]);
    }
    await browser.close();
    return out2;
}

(async () => {
    const t0 = Date.now();
    const E = require(path.join(root, 'engine.js'));
    say(`# Review report · ${E.BUILD}`);
    say(`Served from ${URL} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    say('');
    // the tests (with the slow pacing test), both screens' pacing, and the three browser passes, at once
    const minutes = QUICK ? '12' : '20';
    // first, this build's scenarios (one seed: the builds the browser passes load), then everything else at once
    await run('node', ['tools/review/pacing.js', '--screen', 'phone', '--minutes', '20', '--seeds', '1', '--scenarios', path.join(__dirname, 'scenarios.json')]);
    const [t, pPhone, pDesk] = await Promise.all([
        run('node', ['--test'], { SLOW: '1' }),
        run('node', ['tools/review/pacing.js', '--screen', 'phone', '--minutes', minutes]),
        // one desktop seed: the phone campaign carries the targets, desktop is a check (and its field the slowest)
        run('node', ['tools/review/pacing.js', '--screen', 'desktop', '--minutes', minutes, '--seeds', '1']),
        upright(false), upright(true), sideways()
    ]);
    const pass = /# pass (\d+)/.exec(t)?.[1], fail = /# fail (\d+)/.exec(t)?.[1];
    say(`## Tests (the slow ones too): ${pass} pass, ${fail} fail`);
    if (Number(fail)) say('```\n' + t.split('\n').filter(l => l.startsWith('not ok')).join('\n') + '\n```');
    say('');
    say('## Pacing (a person-paced bot, tools/review/pacing.js)');
    say('');
    say(pPhone.trim().replace(/^# /, '### '));
    say('');
    say(pDesk.trim().replace(/^# /, '### '));
    say('');
    // alone, on a quiet machine
    const self = await selfTest();
    const fps = QUICK ? null : await frameRate();
    say('## Screens');
    if (fps) say(fps);
    say('');
    say(`### Rule checks: ${rules.filter(x => x.ok).length} of ${rules.length} pass`);
    for (const x of rules) say(`- ${x.ok ? 'PASS' : '**FAIL**'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
    say('');
    say(`### Rule self-test: ${self.filter(x => x[1]).length} of ${self.length} breakages caught`);
    for (const [name, ok] of self) say(`- ${ok ? 'caught' : '**MISSED**'}: ${name}`);
    const diff = await diffs();
    say('');
    if (PREV) say('Still parts changed: an unchanged build reads 0–1.5% (the demos animate inside cards); over about 3% something moved.');
    say(`| screenshot | what it shows | page scroll (px) | controls off screen |${PREV ? ' still parts changed since the last report |' : ''}`);
    say(`|---|---|---|---|${PREV ? '---|' : ''}`);
    for (const c of shots) say(`| ${c.name}.png | ${c.note} | ${c.scroll || 0} | ${c.cut?.length ? c.cut.join(', ') : '—'} |${PREV ? ` ${diff[c.name] ?? ''} |` : ''}`);
    say('');
    say(`Report made in ${Math.round((Date.now() - t0) / 1000)} s.`);
    fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
    console.log(`${path.join(out, 'report.md')} (${shots.length} screenshots, ${Math.round((Date.now() - t0) / 1000)} s)`);
})();
