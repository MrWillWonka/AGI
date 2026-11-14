// The Feed's cards, tools and combos measured (design/ring-build.md): what each does to a session's research, length
// and how it ends, against a session with no cards. It changes nothing: the owner decides the numbers.
//
//   node tools/feed-balance.js             every card on two stockpiles, twelve seeds each (about a quarter of an hour, all cores)
//   node tools/feed-balance.js --seeds 24  more seeds
//
// Sessions vary a lot from seed to seed: with three seeds a row a card's research read up to a third off (Sonar read
// -34% and was +1% over 24 seeds). Each row prints its standard error; a difference under about twice that is noise.
//
// The player is a simple one: it holds the point on the highest column of the pile, moving it three times a second.
// A card is given at the session's start and no others are offered (`cardChoices` 0), so each is measured alone;
// "as played" sessions take a random card at every split, as a person would meet them.
const path = require('path');
const { fork } = require('child_process');
const os = require('os');
const Feed = require(path.join(__dirname, '..', 'feed.js'));

const STOCKS = [450, 1200];                       // packets in the stockpile
const LOAD = n => ({ sector: 1, packets: Math.round(n * 0.85), gold: Math.round(n * 0.1), garbled: Math.round(n * 0.15) });   // a tenth gold, 15% garbled
const colTop = (s, x) => { for (let y = s.h - 1; y >= 0; y--) if (!s.cells[y * s.w + x]) return y + 1; return 0; };
const peak = s => { let bx = -1, by = s.h; for (let x = 0; x < s.w; x += 2) { const y = colTop(s, x); if (y < by) { by = y; bx = x; } } return bx < 0 || by >= s.h ? null : { x: bx + 0.5, y: by + 0.5 }; };

function session(cards, stock, seed, played) {
    const s = Feed.sessions(Feed.newFeed({ seed }));
    // The stockpile is filled directly (its cap is the owner's rule for runs, not for this measure).
    const l = LOAD(stock); s.stock[1] = { n: l.packets - l.gold, gold: l.gold, bad: l.garbled }; s.best[1] = stock;
    Feed.startSession(s, 1);
    Object.assign(s.session.cards, cards);
    const opts = played ? undefined : { cardChoices: 0 };
    let research = 0, over = null, picks = 0;
    for (let t = 0; t < 12000 && s.session; t++) {
        if (s.session.offer) { Feed.pickCard(s, Math.floor(((seed * 9301 + picks++ * 49297) % 233280) / 233280 * s.session.offer.length)); continue; }
        if (t % 3 === 0) Feed.point(s, peak(s));
        const o = Feed.step(s, 0.1, opts);
        research += o.research;
        over = o.events.find(e => e.type === 'over') || over;
    }
    return { research, time: over ? over.time : 1200, why: over ? over.why : 'cap', splits: over ? over.layers : s.layers, cards: over ? over.cards : 0 };
}

function configs() {
    const list = [['(none)', {}]];
    for (const id of Object.keys(Feed.CARDS)) {
        const c = Feed.CARDS[id];
        if (c.combo) list.push([id, { [id]: 1 }]);
        else if (c.tool) { list.push([id, { [id]: 1 }]); list.push([id + ' x2', { [id]: 2 }]); }
        else { list.push([id, { [id]: 1 }]); list.push([id + ' x3', { [id]: 3 }]); }
    }
    return list;
}

if (process.send) {
    process.on('message', job => {
        const out = session(job.cards, job.stock, job.seed, job.played);
        process.send({ ...job, ...out });
    });
} else {
    const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? Number(process.argv[i + 1]) : null; };
    const seeds = Array.from({ length: arg('seeds') || 12 }, (_, n) => 11 + n * 7);
    const jobs = [];
    for (const [name, cards] of configs()) for (const stock of STOCKS) for (const seed of seeds) jobs.push({ name, cards, stock, seed, played: false });
    for (const stock of STOCKS) for (let n = 0; n < seeds.length * 4; n++) jobs.push({ name: 'as played', cards: {}, stock, seed: 101 + n * 13, played: true });
    const results = [], total = jobs.length;
    let live = 0;
    const done = () => {
        const mean = a => a.reduce((n, v) => n + v, 0) / a.length;
        const base = {};
        for (const stock of STOCKS) base[stock] = mean(results.filter(r => r.name === '(none)' && r.stock === stock).map(r => r.research));
        const kind = name => { const id = name.split(' ')[0], c = Feed.CARDS[id]; return !c ? '' : c.combo ? 'combo' : c.tool ? 'tool' : 'card'; };
        const names = [...new Set(results.map(r => r.name))];
        console.log(`The Feed's cards measured: ${seeds.length} seeds a row, sector 1, a tenth gold and 15% garbled, led on the pile's peak.`);
        for (const stock of STOCKS) {
            console.log(`\nStockpile of ${stock} packets`);
            console.log('card'.padEnd(16) + 'kind'.padEnd(7) + 'research'.padStart(9) + '  ±'.padEnd(6) + 'vs none'.padStart(9) + 'seconds'.padStart(9) + 'splits'.padStart(8) + '  ends');
            const rows = names.map(name => { const r = results.filter(x => x.name === name && x.stock === stock); const why = {}; for (const x of r) why[x.why] = (why[x.why] || 0) + 1;
                const m = mean(r.map(x => x.research)), se = r.length > 1 ? Math.sqrt(r.reduce((n, x) => n + (x.research - m) ** 2, 0) / (r.length - 1) / r.length) : 0;
                return { name, se, research: m, time: mean(r.map(x => x.time)), splits: mean(r.map(x => x.splits)), why: Object.entries(why).map(([k, v]) => `${k} ${v}`).join(', '), cards: mean(r.map(x => x.cards)) }; });
            rows.sort((a, b) => (a.name === '(none)' ? -1 : b.name === '(none)' ? 1 : b.research - a.research));
            for (const r of rows) console.log(r.name.padEnd(16) + kind(r.name).padEnd(7) + r.research.toFixed(0).padStart(9) + ('  ±' + r.se.toFixed(0)).padEnd(6) + (r.name === '(none)' ? '' : `${r.research >= base[stock] ? '+' : ''}${((r.research / base[stock] - 1) * 100).toFixed(0)}%`).padStart(9) + r.time.toFixed(0).padStart(9) + r.splits.toFixed(1).padStart(8) + '  ' + r.why + (r.name === 'as played' ? ` · ${r.cards.toFixed(1)} cards taken` : ''));
        }
        process.exit(0);
    };
    const workers = Array.from({ length: Math.max(1, Math.min(os.cpus().length - 1, 12)) }, () => fork(__filename));
    const next = w => { const job = jobs.shift(); if (!job) { if (--live === 0) done(); return; } w.send(job); };
    for (const w of workers) {
        live++;
        w.on('message', r => { results.push(r); if (results.length % 20 === 0) process.stderr.write(`${results.length}/${total}\n`); next(w); });
        next(w);
    }
}
