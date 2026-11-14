// node tools/review/ring-nav.js <repo> <out dir>
// Under #ring: every way between the home screen and each app, there and back, on a phone and a laptop.
const repo = process.argv[2], out = process.argv[3];
const { chromium } = require(repo + '/node_modules/playwright');
const { spawn } = require('child_process');
const PORT = 8194;
(async () => {
    const server = spawn(process.execPath, [repo + '/tools/review/serve.js', String(PORT)], { cwd: repo, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 900));
    const browser = await chromium.launch();
    let bad = 0;
    for (const [name, width, height, touch] of [['phone', 390, 844, true], ['laptop', 1280, 800, false]]) {
        const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 300)));
        page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
        await page.goto(`http://localhost:${PORT}/#ring`);
        await page.waitForTimeout(1200);
        await page.click('.ring-playtest .button');
        await page.fill('#loginName', 'Sam'); await page.fill('#loginEmail', 'sam');
        await page.click('.device-login button[type=submit]');
        await page.waitForTimeout(400);
        // Past the opening, funded, the desk built, online, sand delivered: every app is on the home screen.
        await page.evaluate(() => { const s = AGI.state, i = s.intro; for (const m of AGIEngine.MAIL) if (m.intro) { i['mail:' + m.id] = true; i['mailRead:' + m.id] = true; }
            i['mailAccepted:welcome'] = true; i['ring:labInstalled'] = true; i['ring:welcome'] = true; i['ring:call'] = true; i['fund:m0m'] = true; i['mail:mom'] = true; i['mailRead:mom'] = true; i['fund:mom'] = true;
            });
        await page.waitForTimeout(300);
        await page.click('.home-icon-lab'); await page.waitForTimeout(500);
        await page.evaluate(() => { const s = AGI.state; s.stats.clicks = 40; s.stats.runCp = 40; s.res.cp = 500; s.levels.keyboard = 4; });
        await page.click('#actions button:not([hidden])'); await page.waitForTimeout(600);
        await page.evaluate(() => AGI.debug.feedDeliver(1, 30, 2, 3, 1));
        await page.waitForTimeout(600);
        for (const n of await page.$$('.device-notice')) await n.evaluate(x => x.remove());
        const place = () => page.evaluate(() => {
            const vis = n => !!n && !n.hidden && n.getClientRects().length > 0;
            const dlg = [...document.querySelectorAll('dialog[open]')].map(d => d.id || [...d.classList].pop()).join('+');
            if (dlg) return 'dialog:' + dlg;
            if (vis(document.getElementById('deviceHome'))) return vis(document.querySelector('.debug-panel')) ? 'home+debug' : 'home';
            if (vis(document.getElementById('snarePanel'))) return 'snare';
            if (vis(document.getElementById('facility'))) return 'SURVEILLANCE';
            if (vis(document.getElementById('labRoom'))) return 'lab';
            return 'other:' + document.body.dataset.view;
        });
        const log = [];
        const step = async (label, act, want, wait = 700) => {
            let err = '';
            try { await act(); } catch (e) { err = String(e).split('\n')[0].slice(0, 110); }
            await page.waitForTimeout(wait);
            const at = await place();
            const ok = !err && at === want;
            if (!ok) { bad++; await page.screenshot({ path: `${out}/navall-${name}-${log.length}.png` }); }
            log.push(`${ok ? 'ok  ' : 'FAIL'} ${label} -> ${at}${ok ? '' : ` (wanted ${want})${err ? ' ' + err : ''}`}`);
        };
        // On a phone Home is behind the dot at the foot of the screen.
        const tapHome = async sel => { if (sel === '.device-homebar') { await page.click('.device-homedot', { timeout: 3000 }); await page.waitForTimeout(200); } await page.click(sel, { timeout: 3000 }); };
        const click = sel => () => tapHome(sel);
        const goHomeFromLab = touch ? click('.device-homebar') : click('.window-close');
        const crumb = touch ? '.device-homebar' : '#labRoom .crumb-home';
        await step('start in the Lab', async () => {}, 'lab', 0);
        await step('Lab: home crumb (laptop) or home bar (phone)', click(crumb), 'home');
        await step('home: Lab icon', click('.home-icon-lab'), 'lab');
        if (touch) await step('Lab: home bar again', click('.device-homebar'), 'home');
        else await step('Lab: window x', click('.window-close'), 'home');
        await step('home: Lab icon again', click('.home-icon-lab'), 'lab');
        await step('Lab: Escape', () => page.keyboard.press('Escape'), 'home');
        await step('home: Mail', click('.home-icon-mail'), 'dialog:inbox');
        await step('Mail: open a mail', click('#inboxList .inbox-open'), 'dialog:inbox');
        await step('Mail: x back to the list', click('#inboxClose'), 'dialog:inbox');
        await step('Mail: x closes', click('#inboxClose'), 'home');
        await step('home: Mail, then Escape', async () => { await page.click('.home-icon-mail'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); }, 'home');
        await step('home: Packet Snare', click('.home-icon-snare'), 'snare', 1100);
        await step('Snare: server_room crumb', click('#backButton'), 'home', 1100);
        await step('home: Packet Snare again', click('.home-icon-snare'), 'snare', 1100);
        await step('Snare: home crumb or home bar', click(touch ? '.device-homebar' : '#moduleView .crumb-home'), 'home', 1100);
        await step('home: Packet Snare, Escape', async () => { await page.click('.home-icon-snare'); await page.waitForTimeout(1100); await page.keyboard.press('Escape'); }, 'home', 1100);
        await step('home: Lab after Snare', click('.home-icon-lab'), 'lab');
        await step('Lab: home', goHomeFromLab, 'home');
        await step('home: The Feed, its first-time card', click('.home-icon-feed'), 'dialog:feed-screen+ring-welcome');
        await step('Feed card: Got it', click('.ring-welcome .button'), 'dialog:feed-screen');
        await step('Feed: x', click('.feed-close'), 'home');
        await step('home: The Feed, Escape', async () => { await page.click('.home-icon-feed'); await page.waitForTimeout(300); await page.keyboard.press('Escape'); }, 'home');
        await step('home: Journal', click('.home-icon-journal'), 'dialog:journal');
        await step('Journal: close', click('#journalClose'), 'home');
        await step('home: Settings', click('.home-icon-settings'), 'dialog:journal');
        if (touch) { await step('Lab: dot, then Settings', async () => { await page.click('#journalClose'); await page.click('.home-icon-lab'); await page.waitForTimeout(400); await page.click('.device-homedot'); await page.waitForTimeout(200); await page.click('.device-switch-settings'); }, 'dialog:journal'); await step('Settings: close back to the Lab, dot, Home', async () => { await page.click('#journalClose'); await page.waitForTimeout(300); await tapHome('.device-homebar'); await page.waitForTimeout(300); await page.click('.home-icon-settings'); }, 'dialog:journal'); }
        await step('Settings: close', click('#journalClose'), 'home');
        await step('home: Playtest', click('.home-icon-playtest'), 'dialog:ring-survey');
        await step('Playtest: Close', click('.ring-survey .ghost-button'), 'home');
        await step('home: Playtest, save and copy', async () => { await page.click('.home-icon-playtest'); await page.waitForTimeout(300); await page.click('.ring-survey .dialog-actions .button'); }, 'dialog:dialog');
        await step('log dialog: Close', click('#dialog button:has-text("Close")'), 'home');
        await step('home: no Debug icon; holding the top strip opens it', async () => { if (await page.$('.home-icon-debug')) throw new Error('the Debug icon is still there'); await page.mouse.move(120, 20); await page.mouse.down(); await page.waitForTimeout(950); await page.mouse.up(); }, 'home+debug');
        await step('Debug: the same hold closes it', async () => { await page.mouse.move(120, 20); await page.mouse.down(); await page.waitForTimeout(950); await page.mouse.up(); }, 'home');
        await step('home: Lab', click('.home-icon-lab'), 'lab');
        await step('Lab: a mail notification opens Mail', async () => { await page.evaluate(() => { AGI.state.intro['mail:dad'] = true; AGIEngine.mailArrive(AGI.state, 'm:dad'); AGI.debug.notice('mail', 'Mail', 'your computor thing'); }); await page.click('.device-notice'); }, 'dialog:inbox');
        await step('Mail: x back to the Lab', click('#inboxClose'), 'lab');
        // Reloads: wherever you were, the game comes back somewhere that works.
        await step('reload in the Lab', () => page.reload(), 'home', 1800);
        await step('home after reload: Lab icon', click('.home-icon-lab'), 'lab');
        await step('to Packet Snare and reload', async () => { await tapHome(crumb); await page.waitForTimeout(500); await page.click('.home-icon-snare'); await page.waitForTimeout(1100); await page.reload(); }, 'home', 1800);
        await step('home, then reload', () => page.reload(), 'home', 1800);
        await step('after reload: Packet Snare opens', click('.home-icon-snare'), 'snare', 1100);
        await step('and its crumb goes home', click('#backButton'), 'home', 1100);
        console.log(`--- ${name} ---\n${log.join('\n')}\nerrors: ${JSON.stringify([...new Set(errors)])}`);
        if (errors.length) bad++;
        await ctx.close();
    }
    await browser.close(); server.kill();
    console.log(bad ? `${bad} PROBLEMS` : 'ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
