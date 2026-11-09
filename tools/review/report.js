// tools/review/report.js — everything a round can measure without a reviewer, in a few minutes: the tests, the pacing on
// both screens (tools/review/pacing.js), and one browser pass (one at a time, so the machine is quiet and the frame rate
// means something) that takes the standard screenshots, counts layout overflow and console errors, and measures a full
// field's frame rate.
//   node tools/review/report.js <out dir> [--url http://localhost:8200/] [--quick] [--prev <an earlier report's dir>]
// Rule checks (PASS/FAIL): things reviewers found once that must stay fixed (Start in full view on every first card, no
// tip mid-run on a sector reached as a player reaches it, the start card meets the threats its sector brings, the
// sideways card's how-to above Start, no sideways page scroll, a clean console). With --prev, each screenshot is compared
// with the earlier report's: the share of pixels that changed, so reviewers look first at what moved.
// Writes <out>/report.md and <out>/*.png; reviewers read the report and the pictures before they play, and spend their
// time on what only playing shows. The build is whatever the URL serves: freeze one per round (tools/review/freeze.sh).
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || 'review-out');
const argv = process.argv;
const URL = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : (process.env.REVIEW_URL || 'http://localhost:8123/');
process.env.REVIEW_URL = URL;
const QUICK = argv.includes('--quick');
const PREV = argv.includes('--prev') ? path.resolve(argv[argv.indexOf('--prev') + 1]) : null;
fs.mkdirSync(out, { recursive: true });
const K = require('./kit.js');
const md = [];
const say = x => md.push(x);
const run = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...opts }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

(async () => {
    const E = require(path.join(root, 'engine.js'));
    say(`# Review report · ${E.BUILD}`);
    say(`Served from ${URL} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    say('');
    // 1. tests
    const t = run('node', ['--test']);
    const pass = /# pass (\d+)/.exec(t)?.[1], fail = /# fail (\d+)/.exec(t)?.[1];
    say(`## Tests: ${pass} pass, ${fail} fail`);
    if (Number(fail)) say('```\n' + t.split('\n').filter(l => l.startsWith('not ok')).join('\n') + '\n```');
    say('');
    // 2. pacing, both screens (and the scenarios the browser pass and the reviewers use)
    say('## Pacing (a person-paced bot, tools/review/pacing.js)');
    for (const screen of ['phone', 'desktop']) {
        const args = ['tools/review/pacing.js', '--screen', screen, '--minutes', QUICK ? '12' : '20'];
        if (screen === 'phone') args.push('--scenarios', path.join(__dirname, 'scenarios.json'));
        say('');
        say(run('node', args, { timeout: 600000 }).trim().replace(/^# /, '### '));
    }
    say('');
    // 3. the browser pass
    say('## Screens');
    const checks = [];
    const rules = [];
    const rule = (name, ok, detail = '') => rules.push({ name, ok: !!ok, detail });
    // Start in full view on the card (inside the card and the window)
    const startVisible = page => page.evaluate(() => {
        const b = document.querySelector('#snareCard .result-actions .button'), c = document.getElementById('snareCard');
        if (!b || !c || c.hidden) return { ok: false, why: 'no card' };
        const r = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
        return { ok: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && r.bottom <= innerHeight + 1 && r.top >= 0, why: `button ${Math.round(r.top)}–${Math.round(r.bottom)}, card ${Math.round(cr.top)}–${Math.round(cr.bottom)}, window ${innerHeight}` };
    });
    const tipUp = page => page.evaluate(() => { const c = document.getElementById('snareCard'); return !!(c && !c.hidden && c.classList.contains('snare-intro')); });
    const overflow = page => page.evaluate(() => {
        const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
        const cut = [...document.querySelectorAll('#snarePanel button, #snareCard, #snareCard .button, .snare-tree-bar .button')]
            .filter(b => b.offsetParent && b.getClientRects().length)
            .map(b => ({ b, r: b.getBoundingClientRect() }))
            .filter(({ r }) => r.right > W + 1 || r.left < -1 || r.bottom > innerHeight + 1)
            .map(({ b }) => (b.id || b.className || b.tagName).toString().slice(0, 40));
        return { scroll: sw > W + 1 ? sw - W : 0, cut };
    });
    const shoot = async (page, name, note) => {
        await K.shot(page, path.join(out, name + '.png'));
        const o = await overflow(page);
        checks.push({ name, note, ...o });
    };
    for (const phone of [false, true]) {
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
                await shoot(page, `${tag}-${name}-card`, `sector ${k}'s start card with the campaign's build`);
                // the card meets every threat sector k brings that a player hasn't met yet (after an end card, Snare again
                // shows the start card that meets them first, as a player sees it)
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
            checks.push({ name: `${tag} console`, errors: page.errors.slice(0, 5) });
            rule(`${tag}: no console errors`, !page.errors.length, page.errors[0] || '');
        } catch (e) { checks.push({ name: `${tag} pass failed`, errors: [String(e).slice(0, 200)] }); }
        await browser.close();
    }
    // a sideways phone: the first card (its how-to above Start, Start in view) and no page scroll
    {
        const { chromium } = require('playwright');
        const browser = await chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        await page.goto(URL); await page.waitForTimeout(700);
        await page.evaluate(() => localStorage.clear());
        await page.goto(URL); await page.waitForTimeout(700);
        await page.evaluate(() => { AGI.debug.openSnare(); AGI.debug.resetSnare(); });
        await page.waitForTimeout(1300);
        await shoot(page, 'sideways-01-first-card', 'a sideways phone\'s first card');
        const sv = await startVisible(page);
        rule('sideways: Start in full view on the first card', sv.ok, sv.why);
        const how = await page.evaluate(() => {
            const p = [...document.querySelectorAll('#snareCard p')].find(x => /Hold still|RIGHT mouse/.test(x.textContent));
            const b = document.querySelector('#snareCard .result-actions');
            return p && b ? { ok: p.getBoundingClientRect().top < b.getBoundingClientRect().top - 10 } : { ok: false };
        });
        rule('sideways: the how-to starts above Start', how.ok);
        const sc = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        rule('sideways: no page scroll', sc <= 1, `${sc} px`);
        rule('sideways: no console errors', !errs.length, errs[0] || '');
        await browser.close();
    }
    // the frame rate on a full desktop field (a maxed tree, sector 13), the machine otherwise quiet
    if (!QUICK) {
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
            say(`Full field (maxed tree, sector 13, desktop): **${fr.fps} fps**, p95 frame ${fr.p95} ms, worst ${fr.worst} ms, ${fr.packets} packets.`);
        } catch (e) { say(`Full-field check failed: ${String(e).slice(0, 200)}`); }
        await browser.close();
    }
    say('');
    say(`### Rule checks: ${rules.filter(x => x.ok).length} of ${rules.length} pass`);
    for (const x of rules) say(`- ${x.ok ? 'PASS' : '**FAIL**'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
    // screenshot diffs against an earlier report: the share of pixels that changed (a field in motion always changes;
    // cards and the tree say most)
    const diff = {};
    if (PREV) {
        const { chromium } = require('playwright');
        const browser = await chromium.launch();
        const page = await browser.newPage();
        for (const c of checks.filter(c => c.note)) {
            const a = path.join(out, c.name + '.png'), b = path.join(PREV, c.name + '.png');
            if (!fs.existsSync(b)) { diff[c.name] = 'new'; continue; }
            diff[c.name] = await page.evaluate(async ([x, y]) => {
                const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
                const [p, q] = await Promise.all([load(x), load(y)]);
                if (p.width !== q.width || p.height !== q.height) return 'resized';
                const cv = document.createElement('canvas'); cv.width = p.width; cv.height = p.height;
                const g = cv.getContext('2d');
                g.drawImage(p, 0, 0); const da = g.getImageData(0, 0, p.width, p.height).data;
                g.drawImage(q, 0, 0); const db = g.getImageData(0, 0, p.width, p.height).data;
                let n = 0;
                for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
                return `${(n / (da.length / 4) * 100).toFixed(1)}%`;
            }, ['data:image/png;base64,' + fs.readFileSync(a).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(b).toString('base64')]);
        }
        await browser.close();
    }
    say('');
    say(`| screenshot | what it shows | page scroll (px) | controls off screen |${PREV ? ' changed since the last report |' : ''}`);
    say(`|---|---|---|---|${PREV ? '---|' : ''}`);
    for (const c of checks.filter(c => c.note)) say(`| ${c.name}.png | ${c.note} | ${c.scroll || 0} | ${c.cut?.length ? c.cut.join(', ') : '—'} |${PREV ? ` ${diff[c.name] ?? ''} |` : ''}`);
    say('');
    for (const c of checks.filter(c => c.errors)) say(`Console, ${c.name}: ${c.errors.length ? c.errors.join(' · ') : 'no errors'}`);
    fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
    console.log(`${path.join(out, 'report.md')} (${checks.filter(c => c.note).length} screenshots)`);
})();
