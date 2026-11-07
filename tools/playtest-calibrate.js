// Turns a real playtest log (Journal → Settings → Playtest log, pasted into a file) into a player profile for the
// balance sim (tools/sim.js PROFILE=<file.json>), so the sim plays like the people who actually play.
// Usage: node tools/playtest-calibrate.js <log.txt> [more logs…] [--json]
// Reads the report's JSON event lines (or a JSON array of events). Measures, after the opening inbox:
//   clicks per second while in the lab (all jobs), and the split of time between the lab, training and the rest
//   (the skill tree, mail, other rooms, idle); the share of hand sprints that land a prompt once prompts exist,
//   and that go out at full charge; the pause between a run's end and the next run's first sprint (median, when
//   the player stayed in the bay); and the skill timeline to compare the sim against.
// Flags resource jumps no income explains (the debug panel), since banks after them aren't the player's.
'use strict';
const fs = require('fs');

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const JSON_OUT = process.argv.includes('--json');
if (!files.length) {
    console.error('Usage: node tools/playtest-calibrate.js <log.txt> [more logs…] [--json]');
    process.exit(1);
}

// The build a log was played on: its header's build line (logs from 2026-11-07 15:02 UTC on), else the session events'
// build, else the time it began, to read against playtests/README.md's list of builds.
function readBuild(file) {
    const text = fs.readFileSync(file, 'utf8');
    const head = text.match(/^build: (.+)$/m);
    if (head) return head[1].trim();
    const session = text.match(/"build":"([^"]+)"/);
    if (session) return session[1];
    const began = text.match(/began (\S+)/);
    return began ? `unstamped, began ${began[1]} (see playtests/README.md)` : 'unknown';
}
function readEvents(file) {
    const text = fs.readFileSync(file, 'utf8').trim();
    // The raw stored log ({ v, started, events }), a JSON array of events, or the copied report (one JSON line each).
    if (text.startsWith('{') && text.includes('"events"')) { try { return JSON.parse(text).events || []; } catch { /* the report */ } }
    if (text.startsWith('[')) return JSON.parse(text);
    const events = [];
    for (const line of text.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('{')) continue;
        try { events.push(JSON.parse(l)); } catch { /* a header line that happens to start with { */ }
    }
    return events;
}
const median = a => {
    if (!a.length) return null;
    const b = a.slice().sort((x, y) => x - y);
    return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
const r2 = x => (x == null ? null : Math.round(x * 100) / 100);
const place = v => (v === 'lab' ? 'lab' : v === 'bay:training' ? 'train' : v === 'tree' ? 'tree' : v === 'bay:pipeline' || v === 'snareTree' ? 'snare' : 'other');

function profileOf(events) {
    events = events.filter(e => e && typeof e.t === 'number').sort((a, b) => a.t - b.t || a.w - b.w);
    // The opening (until the first click or the offer's reply) is reading, not playing.
    const start = events.find(e => e.e === 'mailAccepted' || (e.e === 'achievement' && e.id === 'firstClick'))?.t ?? 0;
    const end = events.length ? events[events.length - 1].t : 0;
    // Time by place: each view lasts until the next view (or the end), after the opening.
    const time = { lab: 0, train: 0, tree: 0, snare: 0, other: 0 };   // snare: Packet Snare (the Data Pipeline bay)
    let at = null, since = start;
    for (const e of events) {
        if (e.e !== 'view') continue;
        if (at && e.t > since) time[at] += e.t - Math.max(since, start);
        at = place(e.v);
        since = Math.max(e.t, start);
    }
    if (at && end > since) time[at] += end - since;
    const total = Object.values(time).reduce((a, b) => a + b, 0) || 1;
    // Clicks while in the lab: the samples' hand counts (since the last sample, 30 s apart) taken in the lab.
    let labClicks = 0, labSpan = 0;
    let prev = null;
    const jumps = [];
    for (const e of events) {
        if (e.e !== 'sample') continue;
        if (prev && e.t > start) {
            const dt = e.t - prev.t;
            if (e.at === 'lab' && e.hand) {
                labClicks += Object.values(e.hand).reduce((a, b) => a + (+b || 0), 0);
                labSpan += dt;
            }
            // A bank that grew far beyond its income and any clicking: not the player's (the debug panel).
            const explained = Math.max(prev.cpNet || 0, e.cpNet || 0) * dt * 1.5 + 200;
            if (e.cp - prev.cp > Math.max(explained, 5 * (prev.cp + 100))) jumps.push({ t: e.t, cp: Math.round(e.cp - prev.cp) });
        }
        prev = e;
    }
    // Sprints by hand: prompt hits once prompts exist (the first clean, super or system prompt), and full charges.
    const hand = events.filter(e => e.e === 'sprint' && !e.auto);
    const firstPrompt = hand.find(e => e.k)?.t ?? Infinity;
    const withZone = hand.filter(e => e.t >= firstPrompt);
    const prompts = withZone.filter(e => e.k).length;
    const full = hand.filter(e => e.ch >= 0.95).length;
    const capped = hand.filter(e => e.cap != null && e.cap < 0.95).length;
    // The pause between a hand run's end and the next run's first sprint, when the player didn't leave the bay.
    const pauses = [];
    let lastRun = null, leftBay = false;
    for (const e of events) {
        if (e.e === 'run' && !e.auto) { lastRun = e.t; leftBay = false; } else if (e.e === 'view' && lastRun != null && e.v !== 'bay:training') leftBay = true;
        else if (e.e === 'sprint' && e.first && !e.auto && lastRun != null) {
            if (!leftBay) pauses.push(e.t - lastRun);
            lastRun = null;
        }
    }
    const runs = events.filter(e => e.e === 'run' && !e.auto);
    const skills = events.filter(e => e.e === 'skill').map(e => ({ n: e.n, name: e.name, min: r2(e.t / 60), fromStart: r2((e.t - start) / 60), runs: e.runs }));
    const phases = events.filter(e => e.e === 'phase').map(e => ({ name: e.name, min: r2(e.t / 60) }));
    const unlockAt = key => { const u = events.find(e => e.e === 'unlock' && e.key === key); return u ? r2((u.t - start) / 60) : null; };
    return {
        playMinutes: r2((end - start) / 60),
        openingSeconds: Math.round(start),
        share: { lab: r2(time.lab / total), train: r2(time.train / total), tree: r2(time.tree / total), snare: r2(time.snare / total), other: r2(time.other / total) },
        labClicksPerSecond: r2(labSpan ? labClicks / labSpan : null),
        handSprints: hand.length,
        promptRate: r2(withZone.length ? prompts / withZone.length : null),
        fullChargeRate: r2(hand.length ? full / hand.length : null),
        incomeCappedRate: r2(hand.length ? capped / hand.length : null),
        runPauseSeconds: r2(median(pauses)),
        runSeconds: r2(median(runs.map(e => e.dur).filter(d => d > 0))),
        minutesFromStart: { collect: unlockAt('action:collect'), serverRoom: unlockAt('module:path'), research: unlockAt('action:research') },
        skills, phases,
        debugJumps: jumps
    };
}

const profiles = files.map(f => ({ file: f, ...profileOf(readEvents(f)) }));
// The sim's knobs per log, and pooled over every log given: the mean and the median of each (each log weighs the
// same). tools/sim-variants.js runs the sim as each of these players.
const knobsOf = p => ({
    CLICKS: p.labClicksPerSecond,
    // The sim splits each minute after the server room opens into lab, idle (the tree, mail, other rooms) and training.
    LABSHARE: p.share.lab,
    IDLE: r2(p.share.tree + p.share.other),
    CLEAN: p.promptRate,
    PAUSE: p.runPauseSeconds
});
const pool = fn => {
    const out = {};
    for (const k of Object.keys(knobsOf(profiles[0]))) {
        const v = profiles.map(p => knobsOf(p)[k]).filter(x => x != null);
        out[k] = v.length ? r2(fn(v)) : null;
    }
    return out;
};
const sim = pool(v => v.reduce((a, b) => a + b, 0) / v.length);
const simMedian = pool(median);
for (const p of profiles) p.sim = knobsOf(p);
if (JSON_OUT) {
    console.log(JSON.stringify({ sim, simMedian, logs: profiles }, null, 2));
} else {
    for (const p of profiles) {
        console.log(`${p.file}: ${p.playMinutes} min after a ${p.openingSeconds} s opening`);
        console.log(`  build: ${readBuild(p.file)}`);
        console.log(`  time: lab ${p.share.lab}, training ${p.share.train}, tree ${p.share.tree}${p.share.snare ? `, packet snare ${p.share.snare}` : ''}, other ${p.share.other}`);
        console.log(`  lab clicks/s ${p.labClicksPerSecond}; sprints by hand ${p.handSprints}: prompts ${p.promptRate} (once they exist), full ${p.fullChargeRate}, income-capped ${p.incomeCappedRate}`);
        console.log(`  run ${p.runSeconds} s, pause before the next ${p.runPauseSeconds} s; Collect Data at ${p.minutesFromStart.collect} min, server room ${p.minutesFromStart.serverRoom}, Research ${p.minutesFromStart.research}`);
        console.log(`  skills: ${p.skills.map(s => `${s.n} ${s.name} ${s.fromStart}m/run ${s.runs}`).join(', ')}`);
        if (p.phases.length) console.log(`  phases: ${p.phases.map(x => `${x.name} ${x.min}m`).join(', ')}`);
        if (p.debugJumps.length) console.log(`  ⚠ resource jumps no income explains (the debug panel?): ${p.debugJumps.map(j => `+${j.cp} CP at ${r2(j.t / 60)}m`).join(', ')}`);
    }
    console.log(`sim profile (mean of ${profiles.length} log${profiles.length > 1 ? 's' : ''}): ${JSON.stringify(sim)}`);
    if (profiles.length > 1) console.log(`sim profile (median): ${JSON.stringify(simMedian)}`);
}
