// Playtest recorder: what happens in a real session, stamped with play time, kept on this device and copied out
// as text (Journal → Settings → Playtest log). No DOM and no game rules: game.js calls it at its hook points.
// UMD: window.Playtest in the browser, require() in Node (tests).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Playtest = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LOG_VERSION = 1;
    const MAX_EVENTS = 15000;    // ~1 MB of storage; at ~8 sprints a minute that is a day of play
    const SAMPLE_SECONDS = 30;   // play time between resource samples

    // storage: { get(key), set(key, value) } (game.js passes its safe localStorage wrappers).
    function create(storage, key = 'agiPlaytest') {
        let log = read();
        let counts = {};
        let dirty = false;

        function read() {
            try {
                const raw = JSON.parse(storage.get(key));
                if (raw && raw.v === LOG_VERSION && Array.isArray(raw.events)) return raw;
            } catch { /* empty or unreadable: start a new log */ }
            return { v: LOG_VERSION, started: Date.now(), dropped: 0, on: true, events: [] };
        }

        function flush() {
            if (!dirty) return;
            dirty = false;
            if (!storage.set(key, JSON.stringify(log))) {
                // Out of room: keep the newer half rather than stop recording.
                const cut = Math.ceil(log.events.length / 2);
                log.events.splice(0, cut);
                log.dropped += cut;
                storage.set(key, JSON.stringify(log));
            }
        }

        // t: play time in seconds (the game's stats.playTime); w: wall-clock seconds since the log began.
        function event(t, type, data) {
            if (!log.on) return;
            const e = { t: Math.round(t * 10) / 10, w: Math.round((Date.now() - log.started) / 1000), e: type };
            if (data) Object.assign(e, data);
            log.events.push(e);
            if (log.events.length > MAX_EVENTS) {
                const cut = log.events.length - MAX_EVENTS;
                log.events.splice(0, cut);
                log.dropped += cut;
            }
            dirty = true;
        }

        // Tallies between samples (hand clicks are many and small: counted, not logged one by one).
        function count(name, n = 1) {
            if (log.on) counts[name] = (counts[name] || 0) + n;
        }
        function takeCounts() {
            const out = counts;
            counts = {};
            return Object.keys(out).length ? out : undefined;
        }

        function clear() {
            const on = log.on;
            log = { v: LOG_VERSION, started: Date.now(), dropped: 0, on, events: [] };
            counts = {};
            dirty = true;
            flush();
        }

        function setEnabled(on) {
            log.on = !!on;
            dirty = true;
            flush();
        }

        return {
            event, count, takeCounts, flush, clear, setEnabled,
            get enabled() { return log.on; },
            get events() { return log.events; },
            report: meta => report(log, meta)
        };
    }

    // ---- Report: a readable summary on top, then every event as one JSON line ----

    const mins = t => `${(t / 60).toFixed(1)} min`;

    function summarize(events) {
        const lines = [];
        const last = events[events.length - 1];
        const playTime = events.reduce((m, e) => Math.max(m, e.t), 0);
        const sessions = events.filter(e => e.e === 'session').length;
        lines.push(`Play time ${mins(playTime)} over ${sessions} session${sessions === 1 ? '' : 's'}, ${events.length} events${last ? `, ${mins(last.w)} on the clock` : ''}.`);

        const skills = events.filter(e => e.e === 'skill');
        if (skills.length) {
            lines.push('', 'Skills (skills learned, play time, runs so far):');
            for (const s of skills) lines.push(`  ${String(s.n).padStart(2)} ${s.name.padEnd(24)} ${mins(s.t).padStart(10)}  run ${s.runs}`);
        }
        const phases = events.filter(e => e.e === 'phase' || e.e === 'ship' || e.e === 'transcend');
        if (phases.length) {
            lines.push('', 'Phases and versions:');
            for (const p of phases) lines.push(`  ${mins(p.t).padStart(10)}  ${p.e === 'phase' ? p.name : p.e === 'ship' ? `shipped ${p.version} (+${p.gain} Insight)` : `transcended (+${p.gain})`}`);
        }

        const runs = events.filter(e => e.e === 'run');
        const sprints = events.filter(e => e.e === 'sprint');
        if (runs.length) {
            const manual = sprints.filter(s => !s.auto);
            const full = manual.filter(s => s.ch >= 0.95).length;
            const capped = manual.filter(s => s.cap < 0.95).length;
            const prompts = manual.filter(s => s.k).length;
            const back = runs.filter(r => r.back).length;
            const avg = (list, f) => list.reduce((a, x) => a + f(x), 0) / (list.length || 1);
            lines.push('', `Runs: ${runs.length} (${back} rolled back), ${avg(runs, r => r.sprints || 0).toFixed(1)} sprints and ${avg(runs, r => r.dur || 0).toFixed(0)} s each on average.`);
            if (manual.length) {
                const pct = n => `${Math.round(n / manual.length * 100)}%`;
                lines.push(`Sprints by hand: ${manual.length}; ${pct(full)} at 95%+ charge, ${pct(capped)} with the meter capped by income, ${pct(prompts)} hit a prompt.`);
            }
        }

        const views = {};
        let prev = null;
        for (const e of events) {
            // A session starts on the screen it opened on (its `at`); time between sessions isn't counted.
            if (e.e === 'session') { if (prev) views[prev.v] = (views[prev.v] || 0) + (e.t - prev.t); prev = e.at ? { v: e.at, t: e.t } : null; continue; }
            if (e.e !== 'view') continue;
            if (prev) views[prev.v] = (views[prev.v] || 0) + (e.t - prev.t);
            prev = e;
        }
        if (prev && last) views[prev.v] = (views[prev.v] || 0) + (last.t - prev.t);
        const total = Object.values(views).reduce((a, b) => a + b, 0);
        if (total > 0) {
            lines.push('', 'Time by screen:');
            for (const [v, s] of Object.entries(views).sort((a, b) => b[1] - a[1])) {
                lines.push(`  ${v.padEnd(12)} ${mins(s).padStart(10)}  ${Math.round(s / total * 100)}%`);
            }
        }
        return lines;
    }

    function report(log, meta = {}) {
        const head = [
            'The Path to AGI · playtest log',
            `Log v${LOG_VERSION} · began ${new Date(log.started).toISOString()} · exported ${new Date().toISOString()}`,
            ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
            ...(log.dropped ? [`(${log.dropped} oldest events dropped to fit storage)`] : []),
            ''
        ];
        return [...head, ...summarize(log.events), '', '--- events (t = play seconds, w = wall seconds) ---',
            ...log.events.map(e => JSON.stringify(e))].join('\n');
    }

    return { create, summarize, LOG_VERSION, MAX_EVENTS, SAMPLE_SECONDS };
}));
