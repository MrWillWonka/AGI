// tools/review/layout.js <out dir> [--url http://localhost:8211/] [--prev <an earlier layout run's dir>] [--only <size,…>]
// Packet Snare's layout at every screen shape (the owner's call, 2026-11-11: a review round on layout alone, phones and
// desktops, upright and sideways, compared over time so layout improves and doesn't regress). For each screen size it
// plays the same moments the same way (the tutorial, the first card, a run, an end card, a Look out card, a late run, the
// boss fight, the tree and a node's popup), screenshots each and measures what a person would trip over:
//   scroll     the page scrolling (it never should)
//   offscreen  a control outside the screen and not inside something that scrolls to it
//   covered    a control another element sits on (its middle isn't it)
//   overlap    two controls on top of each other
//   clipped    text cut off by its own box (ellipsis or overflow) or by the screen's edge
//   small      a touch target under 32 px (touch screens only)
//   tiny       text under 11 px
//   card       a card that hides its button below its fold, or that needs scrolling
// and records the field's share of the screen in a run. With --prev, each measurement against the earlier run's (a
// problem that's new is a regression, one that's gone a fix) and how much the still parts of each screenshot changed.
// Writes <out>/<size>-<moment>.png and .json, <out>/layout.json and <out>/report.md.
'use strict';
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const out = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))) || 'review-out/layout');
const PREV = opt('prev') ? path.resolve(opt('prev')) : null;
fs.mkdirSync(out, { recursive: true });
const repo = path.join(__dirname, '..', '..');

// The screen shapes: phones upright and sideways (the smallest common and the reviewers' usual), tablets both ways,
// desktops at the common laptop and full HD sizes.
const SIZES = [
    { key: 'phone-360x640', w: 360, h: 640, touch: true, label: 'small phone, upright' },
    { key: 'phone-390x727', w: 390, h: 727, touch: true, label: 'phone, upright' },
    { key: 'phone-640x360', w: 640, h: 360, touch: true, label: 'small phone, sideways' },
    { key: 'phone-844x390', w: 844, h: 390, touch: true, label: 'phone, sideways' },
    { key: 'tablet-768x1024', w: 768, h: 1024, touch: true, label: 'tablet, upright' },
    { key: 'tablet-1024x768', w: 1024, h: 768, touch: true, label: 'tablet, sideways' },
    { key: 'desktop-1280x800', w: 1280, h: 800, touch: false, label: 'laptop' },
    { key: 'desktop-1920x1080', w: 1920, h: 1080, touch: false, label: 'full HD desktop' },
];
const only = opt('only') ? opt('only').split(',') : null;
const sizes = SIZES.filter(s => !only || only.some(o => s.key.includes(o)));

// Everything the page measures for a shot (run in the page).
function measure(touch) {
    const vw = innerWidth, vh = innerHeight;
    const visible = e => { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
    const name = e => (e.id ? '#' + e.id : '') + (e.getAttribute('aria-label') || e.title || e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 32);
    const scrollsTo = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return true; } return false; };
    const pannable = e => !!e.closest('#snareTreeGrid') && !e.closest('.node-detail');   // the tree pans and zooms: nodes off its view are fine
    const controls = [...document.querySelectorAll('button, select, input, a[href], [role="button"]')].filter(visible).filter(e => !e.closest('#debugPanel, .debug-panel'));
    const p = { scroll: [], offscreen: [], covered: [], overlap: [], clipped: [], small: [], tiny: [], card: [] };
    const sx = document.scrollingElement.scrollWidth - vw, sy = document.scrollingElement.scrollHeight - vh;
    if (sx > 1 || sy > 1) p.scroll.push(`page scrolls ${Math.max(0, sx)} × ${Math.max(0, sy)} px`);
    for (const c of controls) {
        const r = c.getBoundingClientRect();
        if (pannable(c)) continue;
        const out = r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
        if (out && !scrollsTo(c)) { p.offscreen.push(name(c)); continue; }
        if (out) continue;
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        const at = document.elementFromPoint(cx, cy);
        if (at && at !== c && !c.contains(at) && !at.contains(c)) p.covered.push(`${name(c)} under ${name(at)}`);
        if (touch && Math.min(r.width, r.height) < 32) p.small.push(`${name(c)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const free = controls.filter(c => !pannable(c));
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const a = free[i], b = free[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ix > 4 && iy > 4) p.overlap.push(`${name(a)} / ${name(b)}`);
    }
    // text: leaves with words
    const leaves = [...document.querySelectorAll('body *')].filter(e => e.childElementCount === 0 && e.textContent.trim().length > 1 && !/^(SCRIPT|STYLE|OPTION|svg|path)$/i.test(e.tagName) && visible(e) && !e.closest('#debugPanel, .debug-panel, #snareTreeGrid .tree-node, [aria-live], .sr-only, .visually-hidden'))
        // text kept for screen readers only (a 0 px font, a 1 px box) isn't on screen
        .filter(e => { const r = e.getBoundingClientRect(); return parseFloat(getComputedStyle(e).fontSize) >= 1 && r.width > 2 && r.height > 2; });
    for (const e of leaves) {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (parseFloat(cs.fontSize) < 11) p.tiny.push(`${name(e)} ${parseFloat(cs.fontSize).toFixed(1)}px`);
        const cut = (e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX) && e.clientWidth > 0) || (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1);
        const edge = !scrollsTo(e) && !pannable(e) && (r.left < -1 || r.right > vw + 1 || r.bottom > vh + 1);
        if (cut || edge) p.clipped.push(`${name(e)}${edge ? ' (screen edge)' : ''}`);
    }
    const card = document.getElementById('snareCard');
    if (card && !card.hidden && card.offsetParent) {
        const b = card.querySelector('.result-actions .button, .result-actions button');
        const cr = card.getBoundingClientRect(), br = b?.getBoundingClientRect();
        if (br && (br.bottom > Math.min(vh, cr.bottom) + 1 || br.top < cr.top - 1)) p.card.push('its button is below the fold');
        if (card.scrollHeight > card.clientHeight + 4) p.card.push(`needs ${card.scrollHeight - card.clientHeight} px of scrolling`);
    }
    const wrap = document.querySelector('#snarePanel .canvas-wrap, .snare-view > .canvas-wrap');
    const wr = wrap?.getBoundingClientRect();
    const field = wr ? Math.round(wr.width * wr.height / (vw * vh) * 100) : null;
    // the parts that don't animate, for comparing screenshots: the bars, a card, the tree's popup
    const still = ['.topbar', '#snareBar', '#snareCard', '#snareTreeDetail', '.snare-tree-bar'].map(q => document.querySelector(q)).filter(e => e && visible(e))
        .map(e => { const r = e.getBoundingClientRect(); return [Math.max(0, Math.round(r.left)), Math.max(0, Math.round(r.top)), Math.round(Math.min(r.width, vw - Math.max(0, r.left))), Math.round(Math.min(r.height, vh - Math.max(0, r.top)))]; });
    return { problems: p, field, still, live: document.body.classList.contains('snare-live') };
}

const wait = (page, ms) => page.waitForTimeout(ms);
// The moments, each from a fresh visit so a size's shots don't depend on each other.
const MOMENTS = [
    { key: '01-tutorial', note: 'the first run ever: the tutorial\'s bubble walkthrough', async go(page, K) {
        await K.fresh(page, { tutorial: true }); await K.cards(page); await K.start(page); await K.cards(page);
        for (let i = 0; i < 40 && !(await page.evaluate(() => AGI.debug.snareCoach()?.key)); i++) await wait(page, 100);
        await wait(page, 900);
    } },
    { key: '02-first-card', note: 'the first card (sector 1, after the tutorial)', async go(page, K) { await K.fresh(page); } },
    { key: '03-run', note: 'a first run in play', async go(page, K) { await K.fresh(page); await K.cards(page); await K.start(page); await K.cards(page); await wait(page, 2500); } },
    { key: '04-end-card', note: 'the end card after a run', async go(page, K) {
        await K.fresh(page); await K.cards(page); await K.start(page); await K.cards(page); await wait(page, 1500);
        await page.evaluate(() => { const r = AGI.debug.snareRun(); if (r) r.focus = 0; });
        for (let i = 0; i < 40 && !(await page.evaluate(() => { const c = document.getElementById('snareCard'); return c && !c.hidden; })); i++) await wait(page, 100);
        await wait(page, 600);
    } },
    { key: '05-lookout', note: 'sector 3\'s start card with its Look out (Antivirus)', async go(page, K) { await K.fresh(page); await K.scenario(page, 3); await wait(page, 400); } },
    { key: '06-late-run', note: 'sector 9 in play with the build a person has there', async go(page, K) { await K.fresh(page); await K.scenario(page, 9); await K.cards(page); await K.start(page); await K.cards(page); await wait(page, 3000); } },
    { key: '07-boss', note: 'the boss fight on sector 5 (health bar, clock)', async go(page, K) {
        await K.fresh(page); await K.scenario(page, 5); await K.cards(page); await K.start(page); await K.cards(page); await wait(page, 600);
        await page.evaluate(() => AGI.debug.snareBoss()); await wait(page, 4200); await K.cards(page);
    } },
    { key: '08-tree', note: 'the upgrade tree at sector 9\'s build', async go(page, K) {
        await K.fresh(page); await K.scenario(page, 9);
        await page.evaluate(() => { const b = document.getElementById('snareTreeButton'); b.hidden = false; b.click(); }); await wait(page, 900);
    } },
    { key: '09-popup', note: 'a node\'s popup in the tree (Chain Lightning, else the first one shown)', async go(page, K) {
        await K.fresh(page); await K.scenario(page, 9);
        await page.evaluate(() => { const b = document.getElementById('snareTreeButton'); b.hidden = false; b.click(); }); await wait(page, 900);
        await page.evaluate(() => {
            const ids = AGIEngine.SNARE_TREE.map(u => u.id), btns = [...document.querySelectorAll('#snareTreeGrid button.tree-node')];
            const b = btns[ids.indexOf('snareChain')];
            (b && !b.hidden ? b : btns.find(x => !x.hidden))?.click();
        });
        await wait(page, 700);
    } },
];

async function diff(page, a, b, still) {
    if (!fs.existsSync(b)) return 'new';
    if (!still.length) return 'field only';
    return page.evaluate(async ([x, y, still]) => {
        const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
        const [p, q] = await Promise.all([load(x), load(y)]);
        if (p.width !== q.width || p.height !== q.height) return 'resized';
        const cv = document.createElement('canvas'); cv.width = p.width; cv.height = p.height;
        const g = cv.getContext('2d');
        let n = 0, all = 0;
        for (const [l, t, w, h] of still) {
            if (w < 1 || h < 1) continue;
            g.clearRect(0, 0, cv.width, cv.height); g.drawImage(p, 0, 0); const da = g.getImageData(l, t, w, h).data;
            g.clearRect(0, 0, cv.width, cv.height); g.drawImage(q, 0, 0); const db = g.getImageData(l, t, w, h).data;
            for (let i = 0; i < da.length; i += 4) { all++; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++; }
        }
        return all ? `${(n / all * 100).toFixed(1)}%` : 'field only';
    }, ['data:image/png;base64,' + fs.readFileSync(a).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(b).toString('base64'), still]);
}

(async () => {
    const { ensureServer } = require('./serve.js');
    const srv = await ensureServer(opt('url') || 'http://localhost:8123/');
    process.env.REVIEW_URL = srv.url;
    const K = require('./kit.js');
    let chromium;
    try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(repo, 'node_modules', 'playwright'))); }
    const browser = await chromium.launch();
    const results = [];
    const t0 = Date.now();
    // two sizes at a time (each its own browser context)
    const queue = sizes.slice();
    async function worker() {
        for (let s; (s = queue.shift());) {
            const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
            for (const m of MOMENTS) {
                const page = await ctx.newPage();
                const errors = [];
                page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
                page.errors = errors; page.phone = s.touch;
                await page.goto(srv.url); await wait(page, 700);
                let err = null;
                try { await m.go(page, K); } catch (e) { err = String(e).slice(0, 200); }
                const name = `${s.key}-${m.key}`;
                await page.screenshot({ path: path.join(out, name + '.png') });
                const meas = await page.evaluate(measure, s.touch).catch(e => ({ problems: {}, still: [], error: String(e) }));
                const rec = { name, size: s.key, label: s.label, moment: m.key, note: m.note, ...meas, errors, failed: err };
                fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(rec, null, 1));
                results.push(rec);
                await page.close();
            }
            await ctx.close();
            console.log(`${s.key} done (${Math.round((Date.now() - t0) / 1000)} s)`);
        }
    }
    await Promise.all([worker(), worker()]);
    results.sort((a, b) => a.name.localeCompare(b.name));
    // against the earlier run
    const prev = PREV && fs.existsSync(path.join(PREV, 'layout.json')) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(PREV, 'layout.json'), 'utf8')).results.map(r => [r.name, r])) : null;
    const dpage = prev ? await browser.newPage() : null;
    const regressions = [], fixes = [];
    for (const r of results) {
        if (!prev) continue;
        const was = prev[r.name];
        r.changed = await diff(dpage, path.join(out, r.name + '.png'), path.join(PREV, r.name + '.png'), r.still);
        if (!was) continue;
        // the same problem with a different number (a card needing 170 px of scrolling, now 114) is one that moved:
        // better or worse by its number (less scrolling is better; a bigger target or font is better)
        const shape = x => x.replace(/[d.,]+/g, '#');
        const num = x => parseFloat((x.match(/[d.]+/) || [NaN])[0]);
        const higherBetter = { small: true, tiny: true };
        for (const kind of Object.keys(r.problems || {})) {
            const now = [...new Set(r.problems[kind])], then = [...new Set(was.problems?.[kind] || [])];
            const gone = then.filter(x => !now.includes(x)), fresh = now.filter(x => !then.includes(x));
            for (const x of fresh) {
                const i = gone.findIndex(y => shape(y) === shape(x));
                if (i < 0) { regressions.push(`${r.name} · ${kind}: ${x}`); continue; }
                const y = gone.splice(i, 1)[0], better = higherBetter[kind] ? num(x) > num(y) : num(x) < num(y);
                (better ? fixes : regressions).push(`${r.name} · ${kind}: ${y} → ${x.match(/[d.]+/)?.[0]}`);
            }
            for (const y of gone) fixes.push(`${r.name} · ${kind}: ${y}`);
        }
        if (was.field != null && r.field != null && Math.abs(was.field - r.field) >= 3) (r.field > was.field ? fixes : regressions).push(`${r.name} · field: ${was.field}% → ${r.field}% of the screen`);
    }
    await browser.close(); await srv.close();
    const kinds = ['scroll', 'offscreen', 'covered', 'overlap', 'clipped', 'small', 'tiny', 'card'];
    const count = (r, k) => (r.problems?.[k] || []).length;
    const totals = Object.fromEntries(kinds.map(k => [k, results.reduce((n, r) => n + count(r, k), 0)]));
    fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify({ when: new Date().toISOString(), url: srv.url, totals, regressions, fixes, results }, null, 1));
    const L = [];
    L.push(`# Packet Snare layout · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '');
    L.push(`${results.length} screenshots: ${sizes.length} screen sizes × ${MOMENTS.length} moments, in ${Math.round((Date.now() - t0) / 1000)} s.${PREV ? ` Compared with ${PREV}.` : ''}`, '');
    L.push('**Problems found:** ' + kinds.map(k => `${k} ${totals[k]}`).join(' · '), '');
    if (PREV) {
        L.push(`## Against the earlier run: ${regressions.length} new problem${regressions.length === 1 ? '' : 's'}, ${fixes.length} gone`, '');
        for (const x of regressions) L.push(`- [regression] ${x}`);
        for (const x of fixes) L.push(`- [fixed] ${x}`);
        L.push('', 'Still parts changed: the bars, cards and popups; an unchanged build reads 0–1.5% (demos animate in cards), over about 3% something moved.', '');
    }
    L.push('## By screen', '', `| shot | field % | ${kinds.join(' | ')} |${PREV ? ' changed |' : ''}`, `|---|---|${kinds.map(() => '---|').join('')}${PREV ? '---|' : ''}`);
    for (const r of results) L.push(`| ${r.name}.png | ${r.field ?? ''} | ${kinds.map(k => count(r, k) || '').join(' | ')} |${PREV ? ` ${r.changed ?? ''} |` : ''}`);
    L.push('', '## Details', '');
    for (const r of results) {
        const lines = kinds.flatMap(k => (r.problems?.[k] || []).map(x => `  - ${k}: ${x}`));
        if (!lines.length && !r.failed && !r.errors.length) continue;
        L.push(`- **${r.name}** (${r.label}; ${r.note})${r.failed ? ` · the moment didn't play: ${r.failed}` : ''}${r.errors.length ? ` · errors: ${r.errors.join(' | ')}` : ''}`, ...lines);
    }
    fs.writeFileSync(path.join(out, 'report.md'), L.join('\n') + '\n');
    console.log(path.join(out, 'report.md'), '·', kinds.map(k => `${k} ${totals[k]}`).join(' · '), PREV ? `· ${regressions.length} new, ${fixes.length} gone` : '');
})();
