// Pulls the newest playtest log out of the session transcript and measures its last game (from the last erase).
const fs = require('fs'), readline = require('readline');
const src = process.argv[2], outFile = process.argv[3];
(async () => {
    let best = '';
    const rl = readline.createInterface({ input: fs.createReadStream(src, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.includes('exported 2026-11-14T13:30:15')) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        const c = o.message?.content;
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
        if (o.type === 'user' && text.includes('--- events') && text.length > best.length) best = text;
    }
    if (!best) throw new Error('log not found');
    fs.writeFileSync(outFile, best);
    const ev = best.split('\n').filter(l => l.startsWith('{"t":')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let start = 0; ev.forEach((e, i) => { if (e.e === 'save' && e.op === 'erase') start = i + 1; });
    const g = ev.slice(start);
    const m = t => (t / 60).toFixed(1);
    const P = (...a) => console.log(...a);
    P('events in last game:', g.length, 'play minutes:', m(g[g.length - 1].t));

    // Time by screen, with the home screen and The Feed pulled out of "lab" from the home/back events.
    let place = 'home', last = 0; const time = {};
    const go = (p, t) => { time[place] = (time[place] || 0) + (t - last); place = p; last = t; };
    let hidden = false;
    for (const e of g) {
        if (e.e === 'view') go(e.v === 'servers' ? place : e.v, e.t);
        else if (e.e === 'home' && e.back) go('home', e.t);
        else if (e.e === 'home' && e.open === 'lab') go('lab', e.t);
        else if (e.e === 'home' && e.open === 'feed') go('feed', e.t);
        else if (e.e === 'home' && (e.open === 'snare' || e.open === 'training')) go(place, e.t);
        else if (e.e === 'login') go('home', e.t);
    }
    go(place, g[g.length - 1].t);
    P('\nTIME BY SCREEN (min):', Object.entries(time).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${m(v)}`).join(' · '));
    const idle = g.filter(e => e.e === 'idle').reduce((a, e) => a + e.s, 0);
    P('idle seconds logged (wall):', idle, '· app switches (hidden):', g.filter(e => e.e === 'hidden').length);

    // Notifications: how long from an arrival to its tap.
    const notices = g.filter(e => e.e === 'notice');
    P('\nNOTICES tapped:', notices.map(n => `${n.open}@${m(n.t)}`).join(' '));
    const homeHops = g.filter(e => e.e === 'home' && e.back).length;
    P('trips to the home screen:', homeHops, '· app opens from home:', g.filter(e => e.e === 'home' && e.open).reduce((a, e) => (a[e.open] = (a[e.open] || 0) + 1, a), {}));

    // Packet Snare by sector.
    const runs = g.filter(e => e.e === 'snare');
    const bySector = {};
    for (const r of runs) { const s = bySector[r.sector] = bySector[r.sector] || { runs: 0, first: r.t, last: r.t, hauls: [], secs: 0, snaps: 0, corrupted: 0, popped: 0, partial: 0, cleared: false, escapes: 0, caught: 0 }; s.runs++; s.last = r.t; s.hauls.push(r.haul); s.secs += r.secs; s.snaps += r.snaps; s.corrupted += r.corrupted; s.cleared = s.cleared || r.sectorsCleared > 0; s.escapes += r.bossEscaped; s.caught += r.caught; }
    const clocks = g.filter(e => e.e === 'snareClock');
    for (const c of clocks) if (bySector[c.sector] && !c.full) bySector[c.sector].partial++;
    P('\nPACKET SNARE BY SECTOR');
    for (const [k, s] of Object.entries(bySector)) P(` sector ${k}: ${s.runs} runs, ${m(s.first)}–${m(s.last)} min (${m(s.last - s.first)} min), in-run ${s.secs}s, hauls ${Math.min(...s.hauls)}–${Math.max(...s.hauls)}, garbled catches ${s.corrupted}, snaps ${s.snaps}, short clocks ${s.partial}, boss escapes ${s.escapes}`);
    P(' runs:', runs.length, '· in-run seconds:', runs.reduce((a, r) => a + r.secs, 0), '· compute spent on clocks:', clocks.reduce((a, c) => a + c.cost, 0), '· short clocks:', clocks.filter(c => !c.full).length, 'of', clocks.length);
    const gaps = []; for (let i = 1; i < runs.length; i++) { const c = clocks.find(c => c.t > runs[i - 1].t && c.t <= runs[i].t); if (c) gaps.push(c.t - runs[i - 1].t); }
    gaps.sort((a, b) => a - b);
    P(' seconds between a run ending and the next starting: median', gaps[Math.floor(gaps.length / 2)].toFixed(1), '· over 30 s:', gaps.filter(x => x > 30).length, 'of', gaps.length);
    const why = {}; for (const r of runs) for (const [k, v] of Object.entries(r.why || {})) why[k] = (why[k] || 0) + v;
    P(' "why" tallies:', JSON.stringify(why));
    P(' bubbles vs catches by sector:', Object.entries(runs.reduce((a, r) => { const s = a[r.sector] = a[r.sector] || [0, 0]; s[0] += r.bubbles; s[1] += r.catches; return a; }, {})).map(([k, v]) => `${k}:${v[0]}/${v[1]}`).join(' '));
    const coach = g.filter(e => e.e === 'snareCoach');
    P(' walkthroughs:', coach.map(c => `${c.key}${c.wrong ? '(wrong)' : c.done ? '' : '(not done)'} ${c.secs ?? ''}`).join(' · '));

    // Signal: what was bought, in order, and how often the cheapest.
    const buys = g.filter(e => e.e === 'buy' && e.id.startsWith('snare'));
    const spent = {}; for (const b of buys) spent[b.id] = (spent[b.id] || 0) + (b.price || 0);
    P('\nSIGNAL SPENT BY NODE:', Object.entries(spent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace('snare', '')} ${v}`).join(' · '));
    P(' first eight buys:', buys.slice(0, 8).map(b => `${b.id.replace('snare', '')}${b.lvl}@${m(b.t)}`).join(' '));
    const sprawl = buys.find(b => b.id === 'snareSprawl'); P(' first Sprawl bought at minute', sprawl ? m(sprawl.t) : 'never', '· it was the cheapest affordable in', buys.filter(b => b.cheapest === 'snareSprawl' && b.id !== 'snareSprawl').length, 'buys where something else was bought');

    // The Feed.
    const del = g.filter(e => e.e === 'feedDelivery');
    const tot = del.reduce((a, d) => ({ p: a.p + d.packets, g: a.g + d.gold, ga: a.ga + d.garbled, po: a.po + d.popped }), { p: 0, g: 0, ga: 0, po: 0 });
    P('\nTHE FEED: deliveries', del.length, 'packets', tot.p, 'gold', tot.g, 'garbled', tot.ga, 'popped', tot.po, `(${Math.round(100 * (tot.ga + tot.po) / (tot.p + tot.ga + tot.po))}% of what arrived was bad sand)`);
    P(' layers:', g.filter(e => e.e === 'feedLayer').map(l => `L${l.layer}@${m(l.t)} pays ${l.pay} (${l.mites} mites)`).join(' · '));
    P(' empty at:', g.filter(e => e.e === 'feedEmpty').map(e => m(e.t)).join(', ') || 'never', '· fragments:', g.filter(e => e.e === 'feedFragment').map(f => `${f.found}@${m(f.t)}`).join(' '));
    const feedOpens = g.filter(e => e.e === 'home' && e.open === 'feed').map(e => m(e.t));
    P(' opened at minutes:', feedOpens.join(', '));
    // Research rate with The Feed open against closed, from the samples.
    const samples = g.filter(e => e.e === 'sample');
    let openGain = 0, openSecs = 0, shutGain = 0, shutSecs = 0, spentRp = 0; place = 'home';
    const at = t => { let p = 'home'; for (const e of g) { if (e.t > t) break; if (e.e === 'home' && e.open === 'feed') p = 'feed'; else if (e.e === 'view' || (e.e === 'home' && (e.back || e.open))) p = e.e === 'home' && e.open === 'feed' ? 'feed' : 'other'; } return p; };
    for (let i = 1; i < samples.length; i++) { const a = samples[i - 1], b = samples[i], d = b.rp - a.rp, dt = b.t - a.t; if (dt <= 0 || dt > 40) continue; if (d < 0) { spentRp -= d; continue; } if (at(a.t + 1) === 'feed' && at(b.t - 1) === 'feed') { openGain += d; openSecs += dt; } else if (at(a.t + 1) !== 'feed' && at(b.t - 1) !== 'feed') { shutGain += d; shutSecs += dt; } }
    P(` research per second: Feed open ${(openGain / openSecs).toFixed(2)} over ${Math.round(openSecs)} s · closed ${(shutGain / shutSecs).toFixed(2)} over ${Math.round(shutSecs)} s`);

    // Training.
    const sprints = g.filter(e => e.e === 'sprint'), truns = g.filter(e => e.e === 'run' && !e.auto), auto = g.filter(e => e.e === 'run' && e.auto);
    P('\nTRAINING: hand runs', truns.length, 'sprints', sprints.length, '· auto runs', auto.length);
    const byLeg = {}; for (const s of sprints) { const l = byLeg[s.leg] = byLeg[s.leg] || { n: 0, full: 0, back: 0, low: 0 }; l.n++; if (s.ch >= 0.95) l.full++; if (s.v < -0.05) l.back++; if (s.ch < 0.7) l.low++; }
    for (const [k, l] of Object.entries(byLeg)) P(`  leg ${k}: ${l.n} sprints, ${l.full} at 95%+ charge, ${l.low} under 70%, ${l.back} while rolling back`);
    P(' skills:', g.filter(e => e.e === 'skill').map(s => `${s.name}@${m(s.t)} (run ${s.runs})`).join(' · '));
    P(' climbs that fell short (height reached):', g.filter(e => e.e === 'climb').map(c => `L${c.leg}:${c.h}`).join(' '));
    P(' hops:', JSON.stringify(g.filter(e => e.e === 'exploit').reduce((a, x) => (a[x.q] = (a[x.q] || 0) + 1, a), {})));
    // Gaps inside Training with no sprint: the time from entering the bay to the first sprint of that visit.
    const visits = []; let enter = null;
    for (const e of g) { if (e.e === 'view' && e.v === 'bay:training') enter = e.t; else if (e.e === 'sprint' && enter != null) { visits.push({ at: enter, wait: e.t - enter }); enter = null; } else if ((e.e === 'view' && e.v !== 'bay:training' && e.v !== 'tree' && e.v !== 'servers') || (e.e === 'home' && e.back)) { if (enter != null) visits.push({ at: enter, wait: null, left: e.t - enter }); enter = null; } }
    P(' visits to Training: seconds from entering to the first sprint:', visits.map(v => v.wait != null ? `${v.wait.toFixed(0)}s@${m(v.at)}` : `LEFT after ${v.left.toFixed(0)}s@${m(v.at)}`).join(' · '));
    // Long gaps between a run ending and the next sprint while staying in the bay.
    const lg = []; for (const r of truns) { const nx = sprints.find(s => s.t > r.t); const leftBay = g.find(e => e.t > r.t && (e.e === 'home' || (e.e === 'view' && e.v !== 'bay:training'))); if (nx && (!leftBay || leftBay.t > nx.t)) lg.push(nx.t - r.t); }
    lg.sort((a, b) => a - b); P(' seconds from a run ending to the next sprint (same visit): median', lg[Math.floor(lg.length / 2)]?.toFixed(1), 'max', lg[lg.length - 1]?.toFixed(1), '· over 5 s:', lg.filter(x => x > 5).length, 'of', lg.length);
    P(' tips:', g.filter(e => e.e === 'tipClosed').map(t => `${t.key.replace('hint:', '')} ${t.s}s`).join(' · '));
    const tb = g.filter(e => e.e === 'buy' && e.held != null && !e.id.startsWith('snare'));
    P(' training tree buys:', tb.length, '· xp spent', tb.reduce((a, b) => a + b.price, 0), '· biggest:', tb.sort((a, b) => b.price - a.price).slice(0, 4).map(b => `${b.id} ${b.price}`).join(', '));

    // Compute and research over time.
    P('\nCOMPUTE/RESEARCH every ~5 min:', samples.filter((s, i) => i % 10 === 0).map(s => `${m(s.t)}m cp ${Math.round(s.cp)} (+${s.cpNet}/s) rp ${Math.round(s.rp)} xp ${Math.round(s.xp)}`).join(' | '));
    P(' research spent on sprints (from sample drops):', Math.round(spentRp));
    P(' hand clicking: samples with hand compute:', samples.filter(s => s.hand?.compute).length, '· total hand compute:', samples.reduce((a, s) => a + (s.hand?.compute || 0), 0));
    P('\nACHIEVEMENTS:', g.filter(e => e.e === 'achievement').map(a => `${a.id}@${m(a.t)}`).join(' '));
    P('MAILS:', g.filter(e => e.e === 'mail').map(a => `${a.id}@${m(a.t)}`).join(' '));
    const reads = g.filter(e => e.e === 'mailRead');
    P('SETTINGS:', g.filter(e => e.e === 'setting').map(a => `${a.key}=${a.value}@${m(a.t)}`).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
