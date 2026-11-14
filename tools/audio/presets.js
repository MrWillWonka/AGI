// tools/audio/presets.js — standard timelines for tools/audio/render.js: the same game moments, played the same way
// every time, so one render can be compared with the next. Each takes options and returns a timeline (page.js).
'use strict';
const base = o => ({ seed: o.seed ?? 1, style: o.style || 'classic', simple: !!o.simple, sound: 0.5, music: 0.35 });
// The music starts on its first downbeat, about two seconds in; a second song is asked for at once.
const pick = o => (o.song === 2 ? [[0, 'songCmd', 'song']] : []);

module.exports = {
    // One song from its top at a set intensity and depth (the default: everything in, as late in the game on a fast run).
    song: o => ({ ...base(o), seconds: o.seconds ?? 128, area: o.area || 'lab', depth: o.depth ?? 1, training: o.training ?? true,
        intensity: o.intensity ?? 1, events: pick(o) }),
    // The arrangement building: a new game at rest, then progress and speed rising to full over the render.
    build: o => {
        const seconds = o.seconds ?? 96, ev = pick(o);
        for (let t = 0; t < seconds; t += 0.5) {
            const k = t / seconds;
            ev.push([t, 'setDepth', Math.min(1, k * 1.2)], [t, 'musicState', Math.min(1, 0.05 + k * 1.1), null]);
        }
        return { ...base(o), seconds, area: o.area || 'server', depth: 0, training: true, intensity: 0.05, events: ev };
    },
    // The lab: jobs tapped and held over the music (the tones alone: no beat outside training), a buy now and then.
    hold: o => ({ ...base(o), seconds: o.seconds ?? 60, area: 'lab', depth: o.depth ?? 0.5, training: false, intensity: 0.05,
        events: [...pick(o), [14, 'play', 'buy', { panel: 'hardware' }], [29, 'play', 'buy', { panel: 'software', big: true }], [44, 'play', 'claim'], [52, 'play', 'error']],
        taps: [3, 3.4, 3.9, 4.2, 4.6, 5.3].map(at => ({ at, res: 'cp' })).concat([31, 31.5, 32.1, 32.4].map(at => ({ at, res: 'dp' }))),
        holds: [{ from: 6, to: 13.5, res: 'cp' }, { from: 16, to: 28, res: 'dp' }, { from: 34, to: 43, res: 'rp' }, { from: 46, to: 58, res: 'cp' }] }),
    // A training run: the meter held, sprints, prompts, the run's speed driving the music, a breakthrough, a summit.
    run: o => {
        const ev = pick(o), sprints = [];
        const speed = [[0, 0.15], [4, 0.5], [9, 0.8], [15, 0.55], [20, 0.9], [27, 1], [34, 0.7], [40, 0.95], [48, 0.6], [56, 0.3]];
        for (const [t, k] of speed) ev.push([t, 'musicState', k, null]);
        [[3, 4.2, 0.9], [8, 9.1, 0.7], [14, 15.3, 1], [19, 20.2, 0.8], [26, 27.2, 1], [33, 34.1, 0.6], [39, 40.3, 1]].forEach(([from, to, level]) => sprints.push({ from, to, level }));
        ev.push([4.25, 'play', 'clean'], [9.15, 'play', 'perfect'], [15.35, 'play', 'clean'], [20.25, 'play', 'windup'], [20.9, 'swell'], [21, 'play', 'breakthrough'],
            [24, 'play', 'launch'], [25.5, 'play', 'land', { impact: 9 }], [27.25, 'play', 'system'], [36, 'play', 'nearMiss'], [41, 'play', 'record'],
            [44, 'play', 'summit'], [50, 'play', 'runEnd', { good: true }]);
        return { ...base(o), seconds: o.seconds ?? 60, area: 'server', depth: o.depth ?? 0.6, training: true, intensity: 0.15, events: ev, sprints };
    },
    // Everything at once, for peaks: a held job, buys, a milestone, a power-up and a change of room, on a fast run.
    stress: o => {
        const ev = pick(o);
        for (let t = 2; t < 30; t += 4) ev.push([t, 'play', 'buy', { panel: ['hardware', 'software', 'algorithms', 'training', 'legacy'][(t / 4 | 0) % 5], big: true }]);
        ev.push([6, 'play', 'achievement'], [6.1, 'play', 'summit'], [6.2, 'play', 'phase'], [10, 'swell'], [10.1, 'play', 'breakthrough'], [10.2, 'play', 'smash'],
            [14, 'musicState', 1, 'crunch'], [14, 'play', 'crunch'], [18, 'musicState', 1, null], [18, 'play', 'release'], [19, 'play', 'ship'],
            [22, 'setArea', 'lab'], [24, 'setArea', 'server'], [25, 'play', 'summit'], [25, 'play', 'land', { impact: 15 }], [25, 'play', 'smash'], [25.05, 'play', 'phase']);
        return { ...base(o), seconds: o.seconds ?? 32, area: 'server', depth: 1, training: true, intensity: 1, events: ev,
            holds: [{ from: 1, to: 30, res: 'cp' }], sprints: [{ from: 3, to: 5, level: 1 }, { from: 11, to: 13, level: 1 }, { from: 26, to: 28, level: 1 }] };
    },
    // Every effect in turn with the music off: `names` from the engine (render.js fills it in), one every `gap` seconds.
    effects: o => {
        const names = o.names || [], gap = o.gap ?? 1.6, ev = [];
        names.forEach((n, i) => ev.push([0.2 + i * gap, 'play', ...(Array.isArray(n) ? n : [n])]));
        return { ...base(o), music: 0, seconds: 0.2 + names.length * gap + 1.5, events: ev };
    }
};
