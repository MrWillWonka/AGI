// sfx.js — sound effects, synthesised with Web Audio (no files, no dependencies).
// window.SFX.play(name, opts) for one-shots; SFX.charge(level) / SFX.chargeStop() for the held sprint meter.
// Silent until the first user gesture (browsers block audio before one) and at volume 0.
// The engine is built by `build(env)`. The game's is `build()`: a live AudioContext, real timers, the page's
// gestures. Tools build a second one on an OfflineAudioContext (`window.SFXBuild({ ctx, offline: true, random })`)
// and drive it with `tick()`, so renders and measurements run the same code the game plays (tools/audio/).
(function () {
    'use strict';
    window.SFXBuild = build;
    window.SFX = build();
    function build(env = {}) {
    // (The body below keeps its old indent, so the history stays readable.)
    const rnd = env.random || Math.random;
    // Is audio running? An offline context renders later, so it always counts as running.
    const live = () => !!ctx && (!!env.offline || ctx.state === 'running');
    // Clean-up after a fade: real time in the game; offline, the nodes just stay (silent) until the render ends.
    const later = (fn, ms) => { if (!env.offline) setTimeout(fn, ms); };
    // A scheduler's timer: offline, the tool calls `tick()` at each step of render time.
    const every = (fn, ms) => (env.offline ? (ticks.add(fn), fn) : setInterval(fn, ms));
    const stopEvery = id => { if (env.offline) ticks.delete(id); else clearInterval(id); };
    const ticks = new Set();
    function tick() { for (const fn of [...ticks]) fn(); }
    // A sound or a step of music that threw: the game carries on, but it is never silent about it. The first few go
    // to the console (all of them with window.AGI_AUDIO_DEBUG); tools collect every one (`env.onError`).
    const faults = { count: 0, last: null };
    function fault(where, e) {
        faults.count++;
        faults.last = where + ': ' + ((e && e.message) || e);
        if (env.onError) env.onError(where, e);
        else if (faults.count <= 3 || window.AGI_AUDIO_DEBUG) console.warn('[audio] ' + faults.last);
    }

    let ctx = null;
    let master = null;          // the effects' bus (the Sound volume)
    let out = null;             // where the music joins (its own volume: `musicVolume`)
    let duck = null;            // the music stepped down under the big moments
    let limiter = null;         // the last stage: nothing leaves louder than its ceiling
    let volume = 0.5;
    const last = {};            // name -> time last played, to thin out rapid repeats
    let chargeOsc = null;

    function ensure() {
        if (ctx || (volume <= 0 && musicVolume <= 0)) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!env.ctx && !AC) return null;
        ctx = env.ctx || new AC();
        master = ctx.createGain();
        master.gain.value = volume * 0.6;
        // The mixer: effects and music on a bus each, meeting at a limiter.
        //   effects → `master` → a gentle compressor (stacked effects stay in hand) ┐
        //   music   → `out` → `duck` (stepped down under the big moments, on purpose)  ┴→ limiter → trim → speakers
        // A DynamicsCompressorNode adds make-up gain of its own (from its threshold, ratio and knee): `MUSIC_MAKEUP`
        // gives the music what the old shared compressor gave it, and the limiter's is taken back out after it, so
        // below its threshold the limiter changes nothing.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 6;
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = LIMIT_DB; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
        const flat = ctx.createGain();
        flat.gain.value = Math.pow(10, -0.6 * (-LIMIT_DB * (1 - 1 / 20)) / 20);
        out = ctx.createGain();
        out.gain.value = MUSIC_MAKEUP;
        duck = ctx.createGain();
        master.connect(comp).connect(limiter);
        out.connect(duck).connect(limiter);
        limiter.connect(flat).connect(ctx.destination);
        retime(stepOf(bpmOf(null)), 0, ctx.currentTime);
        return ctx;
    }

    // Audio may only start after a gesture: unlock on every one until it runs. Phones need care:
    // - WebKit (every iOS browser) doesn't count pointerdown or touchstart as a gesture, only touchend, click
    //   and keys, so those are listened for too;
    // - the ring/silent switch mutes Web Audio unless the page's audio session is 'playback' (Safari 16.4+);
    //   older iOS needs a media element playing once inside the gesture to take the same session;
    // - a context put on hold by a call or by leaving the app comes back 'interrupted', not 'suspended'.
    let unlocked = false;
    function unlock() {
        if (!ensure()) return;
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        if (unlocked) return;
        unlocked = true;
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not offered */ }
        if (!navigator.audioSession) {
            try {
                // A tenth of a second of silence (a tiny WAV), played once, moves iOS onto the media session.
                const a = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA');
                a.setAttribute('playsinline', '');
                a.play().catch(() => {});
            } catch { /* no media element */ }
        }
        // An empty buffer started inside the gesture: the old WebKit unlock, harmless elsewhere.
        try {
            const src = ctx.createBufferSource();
            src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
            src.connect(ctx.destination);
            src.start();
        } catch { /* fine */ }
    }
    if (!env.offline) ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, unlock, { capture: true, passive: true }));
    // Back from the background (a phone call, another app): resume on the next gesture, and try at once.
    if (!env.offline) document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, Number(v) || 0));
        if (master) master.gain.setTargetAtTime(volume * 0.6, ctx.currentTime, 0.02);
        if (volume <= 0) chargeStop();
    }

    // One tone: frequency sweep `f0` → `f1`, an attack/decay envelope, optional detuned partner.
    // Every effect goes through here, so each beat's sound profile (PROFILES) reshapes the whole game's sounds:
    // the waveform, the octave, the filter, the length and attack, a drive, an echo, chip-style stepped slides.
    function tone(opts) {
        const P = simple || ownSound ? null : PROFILES[style];
        let { f0, f1 = f0, dur = 0.15, type = 'sine', gain = 0.3, at = 0, attack = 0.005, detune = 0, cutoff = 0, q = 1 } = opts;
        // Every note is written in A minor pentatonic; the track's key re-voices it (KEYS, `raw` skips it).
        if (!opts.raw) { f0 = keyHz(f0); f1 = keyHz(f1); }   // simple sounds too: they're in the track's key
        if (opts.echo && !opts.echoed) tone({ ...opts, echo: 0, echoed: true, gain: (opts.gain ?? 0.3) * opts.echo, at: (opts.at || 0) + 3 * S() });
        if (P) {
            type = P.wave(type, f0);
            if (P.oct && f0 > 160) { const m = Math.pow(2, P.oct); f0 *= m; f1 *= m; }
            if (P.raw) cutoff = 0;
            else if (cutoff) cutoff *= P.cut || 1;
            else if (P.lp) cutoff = P.lp;
            dur *= P.len || 1;
            attack = Math.max(attack, P.attack || 0);
            gain *= P.gain || 1;
            if (P.detune) detune += P.detune;
            if (P.echo && !opts.echoed) tone({ ...opts, echoed: true, gain: (opts.gain ?? 0.3) * P.echo, at: (opts.at || 0) + 3 * S() });
        }
        const t = (startAt ?? ctx.currentTime + base) + at;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if ((opts.steps || P?.steps) && f1 !== f0) {
            // Chip-style: a slide is four quick steps, not a glide.
            for (let i = 1; i <= 4; i++) o.frequency.setValueAtTime(f0 * Math.pow(f1 / f0, i / 4), t + (dur * i) / 5);
        } else o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        if (detune) o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * gmul), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        let src = o;
        if (cutoff) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = cutoff;
            f.Q.value = q;
            src = src.connect(f);
        }
        if (opts.drive || P?.drive) {
            const sh = ctx.createWaveShaper();
            sh.curve = sfxDrive || (sfxDrive = driveCurve(6));
            src = src.connect(sh);
        }
        src.connect(g);
        place(g, opts, P);
        o.start(t);
        o.stop(t + dur + 0.05);
    }
    // An effect's voice into the effects' bus: panned if it asks (`pan`), with a send into the track's room (`rev`)
    // or its delay (`dly`). A track's profile may give every shared effect a little room (`rev` on the profile).
    function place(g, opts, P) {
        let tail = g;
        if (opts.pan && ctx.createStereoPanner && !simple) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); g.connect(p); tail = p; }
        tail.connect(master);
        if (simple) return;
        const rev = opts.rev ?? (P && P.rev) ?? 0, dly = opts.dly ?? 0;
        if (!(rev > 0) && !(dly > 0)) return;
        const sp = fxSends();
        if (rev > 0 && sp.rev) { const sg = ctx.createGain(); sg.gain.value = rev; tail.connect(sg).connect(sp.rev); }
        if (dly > 0 && sp.dly) { const sg = ctx.createGain(); sg.gain.value = dly; tail.connect(sg).connect(sp.dly); }
    }

    let noiseBuf = null;
    // Filtered noise: whooshes, dust, impacts.
    function noise({ dur = 0.3, gain = 0.25, f0 = 800, f1 = f0, q = 1, type = 'bandpass', at = 0, attack = 0.01, pan = 0, rev, dly }) {
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
        }
        const P = simple || ownSound ? null : PROFILES[style];
        if (P?.noise) ({ dur, gain, f0, f1 } = P.noise({ dur, gain, f0, f1 }));
        f0 *= varNoise; f1 *= varNoise;
        const t = (startAt ?? ctx.currentTime + base) + at;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * gmul), t + Math.min(attack, dur * 0.9));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g);
        place(g, { pan, rev, dly }, P);
        src.start(t);
        src.stop(t + dur + 0.05);
    }

    const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz

    // ---- The clock: one 124 BPM grid for the music and the sounds -------------------------------------
    // Step n (a 16th note) plays at t0 + (n - n0) × len on the audio clock. The music schedules on it, and
    // stingers wait for its next 16th or 8th (`q` in `play`), so they land in time with the track; feedback
    // that must feel instant (clicks, sprints, impacts) plays at once but takes its pitch from the bar.
    // Everything is in the track's key, A minor, mostly its pentatonic (A C D E G), which never clashes.
    const STEP = 60 / 124 / 4;                      // a 16th note at 124 BPM, 0.121 s: the grid the sounds were written on
    const LIMIT_DB = -1.5;                          // the limiter's threshold: the ceiling is a touch over it
    const MUSIC_MAKEUP = 1.155;                     // the music's level into the mixer (measured against the old mix)
    // The music steps down under the big moments (dB, and how long), so they land without the whole mix pumping.
    const DUCK = { summit: [5, 1.3], phase: [5, 1.5], ship: [5, 1.7], breakthrough: [4, 0.8], smash: [4, 0.9], snareBossDown: [5, 1.3], achievement: [2.5, 0.6], release: [3, 0.6] };
    let clock = null;                               // { t0, n0, len }
    const stepTime = n => clock.t0 + (n - clock.n0) * clock.len;
    const stepAt = t => clock.n0 + (t - clock.t0) / clock.len;
    function nextStep(div = 1, ahead = 0) {         // the first step on a multiple of `div` at least `ahead` s away
        const n = Math.ceil(stepAt(ctx.currentTime + ahead) / div - 1e-6) * div;
        return { n, t: stepTime(n) };
    }
    function retime(len, n, t) {                    // tempo change (flow slows the track) without a jump
        clock = { t0: t, n0: n, len };
    }
    let base = 0;                                   // seconds every note of the current sound is delayed by
    let startAt = null;                             // the current sound's grid time (audio clock), while it plays
    let gmul = 1;                                   // the current sound's group volume (see GROUPS)
    let sfxDrive = null;
    let ownSound = false;                           // a track's own sound is playing: no profile on top of it
    // Each track has its own key and scale. Sounds are written in A minor pentatonic (A C D E G, from A3);
    // a note's degree in that scale moves to the same degree of the track's scale, and a note off the scale
    // keeps its distance from the degree below (so a B flat stays a flat second).
    const KEYS = {};           // key in music/<theme>.js (Classic: null, A minor pentatonic as written)
    const WRITTEN = [0, 3, 5, 7, 10];
    function mapNote(m) {
        const K = KEYS[style];
        if (!K) return m;
        const rel = m - 57;
        const oct = Math.floor(rel / 12);
        const pc = rel - 12 * oct;
        let d = 0;
        while (d < 4 && WRITTEN[d + 1] <= pc) d++;
        return K.root + 12 * oct + K.set[d] + (pc - WRITTEN[d]);
    }
    // This play's variation: the whole figure moved by `varDeg` degrees of the scale (so it stays in key and
    // on the beat), noise coloured by `varNoise`. Set per play in `play` (never the same twice running); the
    // generate clicks don't vary (they already play a figure across the bar).
    let varDeg = 0, varNoise = 1;
    const VARIANTS = [[0, 1], [1, 1.19], [-1, 0.84], [2, 1.41]];
    function degShift(m, k) {
        if (!k) return m;
        const rel = m - 57;
        let oct = Math.floor(rel / 12);
        const pc = rel - 12 * oct;
        let d = 0;
        while (d < 4 && WRITTEN[d + 1] <= pc) d++;
        let d2 = d + k;
        oct += Math.floor(d2 / 5);
        d2 = ((d2 % 5) + 5) % 5;
        return 57 + 12 * oct + WRITTEN[d2] + (pc - WRITTEN[d]);
    }
    function keyHz(f) {
        if (!(f > 0) || (!KEYS[style] && !varDeg)) return f;
        const m = 69 + 12 * Math.log2(f / 440);
        const r = Math.round(m);
        return Math.abs(m - r) > 0.03 ? f : 440 * Math.pow(2, (mapNote(degShift(r, varDeg)) - 69) / 12);
    }
    // Each beat brings its own sound for every effect (applied in tone and noise; Simple sounds skip it).
    const keep = t => t;
    const PROFILES = {};       // profile in music/<theme>.js
    // The sounds' unit of time: the division of the track's grid nearest a 16th at 124 BPM (so a figure written in
    // 16ths keeps about its speed in a slow or a fast song, and stays on that song's grid).
    const S = () => (clock ? clock.len * gridMul() : STEP);

    // A filtered note: the house voice (a short blip through a lowpass, techno-style).
    const blip = (note, opts) => tone({ f0: NOTE(note), dur: 0.09, type: 'square', gain: 0.07, cutoff: 2600, ...opts });
    const arp = (notes, step, opts = {}) => notes.forEach((n, i) => blip(n, { ...opts, at: (opts.at || 0) + i * step }));
    // A techno delay throw: the same figure again a dotted 8th later, quieter.
    const echo = (fn, gain = 0.4) => { fn(1); fn(gain, 3 * S()); };
    const stab = (notes, opts) => notes.forEach(n => tone({ f0: NOTE(n), dur: 0.22, type: 'sawtooth', gain: 0.05, cutoff: 1800, q: 4, detune: 7, ...opts }));
    const sub = (from, to, dur, gain, at = 0) => tone({ f0: NOTE(from), f1: NOTE(to), dur, type: 'sine', gain, at });
    // The bar's position picks a click's note, so taps and holds play a figure that sits on the beat.
    // Each job has its own instrument in every track, so they never sound alike: compute round, in the middle
    // register with a short tick (it took data's old sound, the owner's call; an octave lower it sat under the
    // tracks' basses and couldn't be heard), data bright and short, research high and bell-like.
    // Phone speakers push the upper mids, where data's square blip sits: it's quieter and darker there.
    const PHONE = env.phone ?? !!window.matchMedia?.('(pointer: coarse)').matches;
    const CLICK_NOTES = {
        cp: [69, 64, 67, 64, 72, 64, 67, 62],       // compute: round, round A4
        dp: [81, 76, 79, 76, 84, 76, 79, 74],       // data: a bright figure an octave up
        rp: [88, 84, 86, 81, 91, 84, 86, 79]        // research: up high, bell-like
    };

    // A different variation from last time: `vary(key, n)` never returns the same index twice running.
    const lastVar = {};
    function vary(key, n) {
        let i = Math.floor(rnd() * n);
        if (n > 1 && i === lastVar[key]) i = (i + 1 + Math.floor(rnd() * (n - 1))) % n;
        lastVar[key] = i;
        return i;
    }
    const bell = (n, o = {}) => { tone({ f0: NOTE(n), dur: 0.35, type: 'sine', gain: 0.06, ...o }); tone({ f0: NOTE(n + 19), dur: 0.12, type: 'sine', gain: 0.015, ...o }); };
    const pluck = (n, o = {}) => tone({ f0: NOTE(n), dur: 0.18, type: 'sawtooth', gain: 0.04, cutoff: 2200, q: 3, ...o });
    const run = (fn, notes, step, g = 1, at = 0) => notes.forEach((n, i) => fn(n, { at: at + i * step, gain: (fn === bell ? 0.06 : fn === pluck ? 0.04 : 0.07) * g }));
    // Every panel in its own colour of the track: hardware square blips with a sub (the sound the owner liked),
    // software (data) quick high triangles like a terminal, research bells, consciousness a soft pad, the skill
    // tree saw plucks, legacy a wide chord.
    const BUY_SETS = {
        hardware: [
            g => run(blip, [69, 72, 76, 81], S() / 2, g),
            g => run(blip, [64, 69, 72, 76], S() / 2, g),
            g => run(blip, [57, 64, 69, 76], S() / 2, g),
            g => run(blip, [69, 76, 72, 81], S() / 2, g)
        ],
        software: [
            g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [81, 84, 88, 93], S() / 4, g),
            g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [88, 84, 81, 88], S() / 4, g),
            g => run((n, o) => blip(n, { type: 'triangle', cutoff: 6000, dur: 0.06, ...o }), [76, 81, 79, 84, 88], S() / 4, g)
        ],
        algorithms: [
            g => run(bell, [69, 76, 81], S(), g),
            g => run(bell, [72, 79, 84], S(), g),
            g => run(bell, [64, 69, 76, 81], S() / 2, g)
        ],
        consciousness: [
            g => [57, 64, 69, 72].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 })),
            g => [55, 62, 67, 71].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 })),
            g => [60, 64, 67, 72].forEach(n => tone({ f0: NOTE(n), dur: 0.9, type: 'sawtooth', gain: 0.02 * g, cutoff: 1200, attack: 0.12, detune: 6 }))
        ],
        training: [
            g => run(pluck, [57, 64, 69, 72], S() / 2, g),
            g => run(pluck, [64, 69, 72, 76], S() / 2, g),
            g => run(pluck, [60, 67, 72, 76], S() / 2, g),
            g => run(pluck, [57, 62, 64, 69], S() / 2, g)
        ],
        // Packet Snare's tree: glassy triangle runs going up, in the packets' register.
        snare: [
            g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [72, 76, 81, 88], S() / 2, g),
            g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [76, 79, 84, 91], S() / 2, g),
            g => run((n, o) => tone({ f0: NOTE(n), dur: 0.1, type: 'triangle', cutoff: 5200, ...o }), [69, 76, 79, 88], S() / 2, g)
        ],
        legacy: [
            g => { stab([57, 64, 69, 72, 76], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(33, 33, 0.8, 0.2 * g); },
            g => { stab([55, 62, 67, 71, 74], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(31, 31, 0.8, 0.2 * g); },
            g => { stab([53, 60, 64, 69, 72], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(29, 29, 0.8, 0.2 * g); }
        ]
    };

    // A click's note: where it falls in the bar picks it from the job's figure.
    function clickNote(res) {
        const notes = CLICK_NOTES[res] || CLICK_NOTES.cp;
        const i = clock ? Math.floor(stepAt(startAt ?? ctx.currentTime + base) / (2 * gridMul()) + 1e-6) % 8 : 0;
        return notes[(i + 8) % 8];
    }

    const SOUNDS = {
        // Workbench jobs: a note on the bar's current 8th (a hold plays the 8ths: see `held`). Compute a
        // round triangle, data the square blip, research a sine with its octave.
        click: ({ res = 'cp' } = {}) => {
            const n = clickNote(res);
            if (res === 'cp') { tone({ f0: NOTE(n), dur: 0.12, type: 'triangle', gain: 0.13, cutoff: 1600 }); tone({ f0: NOTE(n + 24), dur: 0.03, type: 'sine', gain: 0.05 }); noise({ dur: 0.012, gain: 0.04, f0: 3500, q: 2 }); }
            else if (res === 'rp') { tone({ f0: NOTE(n), dur: 0.16, type: 'sine', gain: 0.09 }); tone({ f0: NOTE(n + 12), dur: 0.06, type: 'sine', gain: 0.03 }); }
            else blip(n, { gain: 0.06 * (PHONE ? 0.55 : 1), dur: 0.07, cutoff: PHONE ? 1800 : 2600 });
        },
        // Buying: each panel has its own sound, in a few variations that never repeat back to back; a big buy
        // (several at once, a one-time upgrade, a tool growing) adds a sub and a top note.
        buy: ({ panel = 'hardware', big = false } = {}) => {
            const set = BUY_SETS[panel] || BUY_SETS.hardware;
            const i = vary('buy:' + panel, set.length);
            set[i](big ? 1.15 : 1);
            if (big) { sub(45, 45, 0.3, 0.12); blip(93, { gain: 0.035, at: 3 * S() / 2 + S() * 0.5, dur: 0.16 }); }
        },
        buyBig: (o = {}) => SOUNDS.buy({ ...o, big: true }),
        // Packet Snare's own: the shared versions (each track writes its own in TRACK_SOUNDS; a track that didn't
        // would hear these through its profile). Stealthy and short, out of the training sounds' way: a catch is a
        // run of muted plucks low down (longer the bigger the loop's multiplier), not a prompt's bright blips; a
        // snap a static crack and a dull thud, not the near miss's slow bend.
        snareCatch: ({ mult = 1 } = {}) => {
            const notes = [57, 60, 62, 64, 67, 69].slice(0, 2 + Math.min(4, Math.round((mult - 1) * 1.5)));
            notes.forEach((n, i) => tone({ f0: NOTE(n), dur: 0.07, type: 'triangle', gain: 0.09, cutoff: 1100 + 250 * i, at: i * S() / 2 }));
            tone({ f0: NOTE(notes[notes.length - 1] + 24), dur: 0.04, type: 'sine', gain: 0.03, at: (notes.length - 1) * S() / 2 });
        },
        snareSpoil: () => { tone({ f0: NOTE(52), f1: NOTE(45), dur: 0.28, type: 'sawtooth', gain: 0.05, cutoff: 700, detune: -20 }); tone({ f0: NOTE(53), f1: NOTE(46), dur: 0.28, type: 'sawtooth', gain: 0.04, cutoff: 700 }); noise({ dur: 0.12, gain: 0.07, f0: 300, type: 'lowpass' }); },
        snareSnap: () => { noise({ dur: 0.03, gain: 0.12, f0: 7000, q: 2 }); noise({ dur: 0.08, gain: 0.05, f0: 1800, f1: 600, q: 5, at: 0.02 }); tone({ f0: NOTE(45), dur: 0.1, type: 'sine', gain: 0.12 }); },
        snareLaser: () => tone({ f0: NOTE(100), f1: NOTE(81), dur: 0.06, type: 'sine', gain: 0.045 }),
        snareChain: () => [81, 84, 88].forEach((n, i) => { noise({ dur: 0.02, gain: 0.05, f0: 4000 + 2000 * i, q: 8, at: i * S() / 4 }); tone({ f0: NOTE(n), dur: 0.03, type: 'square', gain: 0.015, cutoff: 4000, at: i * S() / 4 }); }),
        snareSweep: () => { [0, 2].forEach(k => stab([64, 69], { at: k * S(), dur: 0.14, gain: 0.045, cutoff: 1400, q: 6 })); noise({ dur: 0.5, gain: 0.06, f0: 600, f1: 3000, q: 2, attack: 0.4 }); },
        snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => blip(n, { at: i * S() / 2, gain: 0.04 + 0.01 * i, cutoff: 1500 + 800 * i, dur: 0.05 })); tone({ f0: NOTE(45), f1: NOTE(57), dur: 0.45, type: 'sawtooth', gain: 0.04, cutoff: 1200, q: 8, attack: 0.3 }); },
        snareBoss: () => { sub(33, 30, 0.18, 0.3); sub(33, 30, 0.15, 0.2, 2 * S()); stab([45, 52, 57], { gain: 0.035, dur: 0.4, cutoff: 700 }); },
        snareHit: () => { tone({ f0: NOTE(57), dur: 0.12, type: 'square', gain: 0.04, cutoff: 1600 }); tone({ f0: NOTE(57) * 2.76, dur: 0.1, type: 'sine', gain: 0.025, raw: true }); noise({ dur: 0.04, gain: 0.08, f0: 3000, q: 6 }); },
        snarePlace: ({ kind = 'wall' } = {}) => {
            if (kind === 'decoy') blip(76, { gain: 0.045, dur: 0.08, cutoff: 2000, echo: 0.4 });
            else if (kind === 'turret') { [0, 1].forEach(i => noise({ dur: 0.015, gain: 0.06, f0: 3500, q: 5, at: i * S() / 4 })); blip(64, { at: S() / 2, gain: 0.055, dur: 0.07, cutoff: 1800 }); }
            else if (kind === 'tower') { sub(45, 45, 0.2, 0.12); blip(69, { gain: 0.04, dur: 0.1 }); blip(76, { gain: 0.04, dur: 0.12, at: S() / 2 }); }
            else { tone({ f0: NOTE(45), dur: 0.12, type: 'triangle', gain: 0.14 }); noise({ dur: 0.05, gain: 0.05, f0: 900, q: 2 }); blip(69, { gain: 0.035, dur: 0.05, cutoff: 1500, at: S() / 2 }); }
        },
        snareRemove: () => { tone({ f0: NOTE(72), f1: NOTE(64), dur: 0.07, type: 'square', gain: 0.04, cutoff: 1600 }); noise({ dur: 0.015, gain: 0.04, f0: 5000, q: 3 }); },
        snarePower: ({ kind = 'freeze' } = {}) => kind === 'purge'
            ? (noise({ dur: 4 * S(), gain: 0.1, f0: 500, f1: 7000, q: 1.2, attack: 3.5 * S() }), stab([57, 64, 69, 76], { gain: 0.035, dur: 0.35, cutoff: 2400, at: 4 * S() }))
            : (tone({ f0: NOTE(93), f1: NOTE(81), dur: 0.6, type: 'sine', gain: 0.05 }), noise({ dur: 0.7, gain: 0.08, f0: 5000, f1: 300, type: 'lowpass' }), sub(45, 33, 0.6, 0.12)),
        snareZap: () => { tone({ f0: NOTE(88), f1: NOTE(64), dur: 0.05, type: 'square', gain: 0.035, cutoff: 3000 }); noise({ dur: 0.04, gain: 0.05, f0: 6000, type: 'highpass' }); },
        snareDecoy: () => { noise({ dur: 0.08, gain: 0.07, f0: 6000, type: 'highpass' }); tone({ f0: NOTE(84), dur: 0.08, type: 'triangle', gain: 0.045 }); tone({ f0: NOTE(76), dur: 0.1, type: 'triangle', gain: 0.04, at: S() / 2 }); },
        // The second wave: the Rogue AI's cores, Firewalls stunning Antivirus, the flicks against the boss, the IDS.
        snareQuarantine: ({ partner = false } = {}) => {
            noise({ dur: 0.02, gain: 0.08, f0: 5200, q: 6 }); noise({ dur: 0.025, gain: 0.08, f0: 3600, q: 6, at: S() / 4 });
            tone({ f0: NOTE(45), dur: 0.1, type: 'triangle', gain: 0.13, at: S() / 4 });
            if (partner) [64, 67, 72].forEach((n, i) => tone({ f0: NOTE(n), dur: 0.2, type: 'triangle', gain: 0.05, cutoff: 1600, detune: -8, at: (1 + i) * S() / 2 }));
            else { blip(69, { gain: 0.05, dur: 0.07, cutoff: 1800, at: S() / 2 }); blip(57, { gain: 0.055, dur: 0.14, cutoff: 1200, at: S() }); }
        },
        snareStun: ({ down = false } = {}) => {
            noise({ dur: 0.05, gain: 0.08, f0: 1200, q: 3 }); tone({ f0: NOTE(52), dur: 0.08, type: 'triangle', gain: 0.12 });
            [88, 84, 88].forEach((n, i) => tone({ f0: NOTE(n), dur: 0.05, type: 'sine', gain: 0.022, at: (1 + i) * S() / 2 }));
            if (down) { noise({ dur: 0.05, gain: 0.12, f0: 4500, type: 'highpass', at: S() / 4 }); noise({ dur: 0.12, gain: 0.06, f0: 2500, f1: 600, q: 4, at: S() / 4 }); tone({ f0: NOTE(46), dur: 0.16, type: 'square', gain: 0.035, cutoff: 900, at: S() / 4 }); }
        },
        snareCore: () => { tone({ f0: NOTE(45), dur: 0.7, type: 'sine', gain: 0.1, attack: 0.3 }); tone({ f0: NOTE(58), dur: 0.6, type: 'triangle', gain: 0.03, cutoff: 900, detune: -15, attack: 0.3 }); blip(82, { gain: 0.02, dur: 0.08, cutoff: 3000, at: 2 * S(), echo: 0.4 }); },
        snareBossDown: () => {
            sub(33, 33, 0.3, 0.25); stab([57, 64, 69], { gain: 0.045, dur: 0.25, cutoff: 2000 });
            [76, 79, 81].forEach((n, i) => blip(n, { gain: 0.055, dur: 0.08, cutoff: 3200, at: (1 + i) * S() }));
            stab([60, 67, 72, 76], { gain: 0.045, dur: 0.8, cutoff: 2800, at: 4 * S() }); tone({ f0: NOTE(88), dur: 0.9, type: 'sine', gain: 0.06, at: 4 * S() }); sub(33, 33, 0.9, 0.22, 4 * S());
            noise({ dur: 0.7, gain: 0.07, f0: 7000, f1: 2000, type: 'highpass', at: 4 * S() });
        },
        snareParry: () => { noise({ dur: 0.05, gain: 0.1, f0: 6500, q: 12 }); tone({ f0: NOTE(81), f1: NOTE(93), dur: 0.06, type: 'square', gain: 0.035, cutoff: 5000 }); tone({ f0: NOTE(81) * 2.76, dur: 0.25, type: 'sine', gain: 0.018, raw: true }); },
        snareSlash: () => { noise({ dur: 0.1, gain: 0.12, f0: 1500, f1: 9000, q: 3, attack: 0.06 }); tone({ f0: NOTE(64), dur: 0.08, type: 'sawtooth', gain: 0.035, cutoff: 2000, at: S() / 2 }); },
        snareSpoof: () => {
            tone({ f0: NOTE(52), f1: NOTE(76), dur: 0.12, type: 'square', gain: 0.035, cutoff: 3000 });
            [76, 75, 76].forEach((n, i) => blip(n, { gain: 0.03, dur: 0.03, cutoff: 4000, at: S() / 2 + i * S() / 4 }));
            tone({ f0: NOTE(69), dur: 0.1, type: 'triangle', gain: 0.05, at: 1.5 * S() });
        },
        snareGarbage: () => { noise({ dur: 0.15, gain: 0.12, f0: 3000, f1: 200, type: 'lowpass' }); tone({ f0: NOTE(45), f1: NOTE(40), dur: 0.14, type: 'square', gain: 0.04, cutoff: 900 }); tone({ f0: NOTE(76), f1: NOTE(81), dur: 0.1, type: 'sine', gain: 0.05, at: 2 * S() }); },
        snareRace: ({ step = 0 } = {}) => { tone({ f0: NOTE(raceNote(step)), dur: 0.045, type: 'triangle', gain: 0.05, cutoff: 3000 }); noise({ dur: 0.01, gain: 0.025, f0: 7000, q: 4 }); },
        snareHijack: () => { tone({ f0: NOTE(76), f1: NOTE(88), dur: 0.05, type: 'sine', gain: 0.045 }); tone({ f0: NOTE(76), f1: NOTE(88), dur: 0.05, type: 'sine', gain: 0.04, at: S() / 2 }); tone({ f0: NOTE(57), dur: 0.1, type: 'triangle', gain: 0.07, at: S() }); },
        snareTaken: () => tone({ f0: NOTE(79), f1: NOTE(84), dur: 0.04, type: 'triangle', gain: 0.035, cutoff: 4000 }),
        snareFlag: ({ flags = 1, limit = 3 } = {}) => {
            const k = Math.min(1, flags / Math.max(1, limit));
            blip(70, { gain: 0.045, dur: 0.05, cutoff: 1400 + 1600 * k }); blip(69, { gain: 0.04, dur: 0.06, cutoff: 1400 + 1600 * k, at: S() / 2 });
            if (flags >= limit - 1) blip(70, { gain: 0.035, dur: 0.04, cutoff: 3000, at: S() });
        },
        snareIds: () => { [76, 70, 76, 70, 76, 70].forEach((n, i) => blip(n, { gain: 0.045, dur: 0.05, cutoff: 3000, at: i * S() / 2 })); sub(33, 33, 0.15, 0.2); noise({ dur: 0.35, gain: 0.05, f0: 2000, f1: 5000, q: 3 }); },
        snareRebuild: () => { [0, 1, 2, 3].forEach(i => noise({ dur: 0.015, gain: 0.05, f0: 1200 + 600 * i, q: 3, at: i * S() / 4 })); tone({ f0: NOTE(45), dur: 0.1, type: 'triangle', gain: 0.11, at: S() }); blip(64, { gain: 0.035, dur: 0.06, cutoff: 1600, at: S() }); },
        snareHerdStun: () => { tone({ f0: NOTE(72), f1: NOTE(52), dur: 0.22, type: 'square', gain: 0.035, cutoff: 1200 }); noise({ dur: 0.03, gain: 0.04, f0: 6000, type: 'highpass' }); },
        // An investor's reward claimed: a bright figure, varied.
        claim: () => [
            () => arp([76, 81, 84, 88, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
            () => arp([81, 88, 84, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
            () => arp([72, 76, 79, 84, 88], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 })
        ][vary('claim', 3)](),
        error: () => tone({ f0: NOTE(64), f1: NOTE(57), dur: 0.12, type: 'square', gain: 0.045, cutoff: 1800 }),
        // A sprint: a filter riser as strong as the charge, and a sub drop to A.
        sprint: ({ charge = 1 } = {}) => {
            noise({ dur: 0.25 + 0.25 * charge, gain: 0.12 + 0.2 * charge, f0: 300, f1: 1800 + 2000 * charge, q: 0.8 });
            sub(45, 33, 0.2, 0.28 * charge);
        },
        clean: () => echo((g, at = 0) => { blip(88, { gain: 0.08 * g, at }); blip(93, { gain: 0.06 * g, at: at + S() / 2, dur: 0.14 }); }),
        perfect: () => echo((g, at = 0) => arp([81, 84, 88, 93], S() / 2, { gain: 0.07 * g, at }), 0.35),
        system: () => {
            echo((g, at = 0) => arp([69, 72, 76, 79, 81, 84, 88, 91, 93], S() / 2, { gain: 0.06 * g, at }), 0.3);
            noise({ dur: 0.8, gain: 0.08, f0: 4000, f1: 9000, type: 'highpass' });
        },
        breakthrough: () => {
            sub(33, 21, 0.6, 0.45);
            noise({ dur: 0.5, gain: 0.25, f0: 200, f1: 3000, q: 0.6 });
            stab([57, 64, 69, 72], { at: S(), gain: 0.06, dur: 0.35, cutoff: 2600 });
        },
        smash: () => { noise({ dur: 0.9, gain: 0.4, f0: 1200, f1: 120, q: 0.5, type: 'lowpass' }); sub(33, 21, 0.8, 0.5); stab([45, 52, 57], { gain: 0.07, dur: 0.5, cutoff: 900 }); },
        windup: () => tone({ f0: NOTE(45), f1: NOTE(69), dur: 0.6, type: 'sawtooth', gain: 0.05, attack: 0.3, cutoff: 3000 }),
        // Act two: off a crest (a riser up a fifth), and back down (a sub thump, harder the harder it lands).
        launch: () => { noise({ dur: 0.35, gain: 0.15, f0: 400, f1: 2400, q: 1.2 }); tone({ f0: NOTE(69), f1: NOTE(76), dur: 0.2, type: 'triangle', gain: 0.04 }); },
        land: ({ impact = 3 } = {}) => {
            const k = Math.min(1, impact / 15);
            sub(45, 33, 0.15 + 0.2 * k, 0.12 + 0.35 * k);
            noise({ dur: 0.2 + 0.2 * k, gain: 0.06 + 0.15 * k, f0: 500, f1: 150, type: 'lowpass' });
        },
        // Learning a skill: stabs on the 16ths, Am, Am, G, then Am held with a high E.
        summit: () => {
            const s = S();
            stab([57, 64, 69, 72], { gain: 0.06 });
            stab([57, 64, 69, 72], { gain: 0.05, at: s });
            stab([55, 62, 67, 71], { gain: 0.06, at: 3 * s });
            stab([57, 64, 69, 72, 76], { gain: 0.05, at: 4 * s, dur: 1.1, cutoff: 3200 });
            tone({ f0: NOTE(88), dur: 1.1, type: 'sine', gain: 0.08, at: 4 * s });
            sub(33, 33, 1, 0.25, 4 * s);
        },
        nearMiss: () => tone({ f0: NOTE(76), f1: NOTE(74), dur: 0.6, type: 'triangle', gain: 0.08 }),
        runEnd: ({ good = false } = {}) => good ? arp([76, 81], S(), { gain: 0.07 }) : tone({ f0: NOTE(72), f1: NOTE(69), dur: 0.3, type: 'triangle', gain: 0.08, cutoff: 1500 }),
        record: () => arp([81, 84, 88, 93], S(), { gain: 0.06 }),
        crunch: () => { noise({ dur: 0.4, gain: 0.15, f0: 900, f1: 300 }); stab([45, 52], { type: 'square', gain: 0.07, cutoff: 1200, q: 8 }); },
        flow: () => [57, 64, 69, 72].forEach((n, i) => tone({ f0: NOTE(n), dur: 1.2, type: 'sine', gain: 0.07, at: i * S(), attack: 0.1 })),
        freeze: () => tone({ f0: NOTE(93), f1: NOTE(45), dur: 0.7, type: 'sine', gain: 0.15 }),
        release: () => { noise({ dur: 0.6, gain: 0.3, f0: 200, f1: 5000, q: 0.5 }); sub(33, 21, 0.6, 0.45); stab([57, 64, 69], { gain: 0.06 }); },
        viral: () => arp([69, 72, 76, 79, 81, 84], S() / 2, { gain: 0.06 }),
        achievement: () => arp([76, 81, 84, 88], S(), { gain: 0.07 }),
        phase: () => { arp([57, 64, 69, 72, 76, 81, 84, 88], S() / 2, { gain: 0.06 }); stab([57, 64, 69], { gain: 0.04, at: 4 * S(), dur: 1.2 }); sub(33, 33, 1.4, 0.2); },
        ship: () => { arp([57, 64, 69, 76, 81], S(), { type: 'sawtooth', gain: 0.05, cutoff: 2200 }); sub(33, 33, 1.6, 0.25); },
        ui: () => noise({ dur: 0.025, gain: 0.05, f0: 9000, type: 'highpass' })
    };
    // ---- Each track's own sounds -------------------------------------------------------------------------
    // The important effects are written again for each track, in its instruments (notes in A minor
    // pentatonic as everywhere, re-voiced into the track's key by tone). Anything a track doesn't list falls
    // back to the shared sound, shaped by the track's profile. Panels keep their identity inside each track:
    // hardware and legacy, software and consciousness, research and the skill tree each get their own
    // instrument (PANEL_INST) and register (PANEL_OCT).
    const T = (n, o = {}) => tone({ f0: NOTE(n), ...o, ...(o.to != null ? { f1: NOTE(o.to) } : {}) });
    const seq = (notes, step, o = {}) => notes.forEach((n, i) => { if (n) T(n, { ...o, at: (o.at || 0) + i * step }); });
    const PANEL_INST = { hardware: 0, legacy: 0, software: 1, consciousness: 1, algorithms: 2, training: 2, snare: 1 };
    const PANEL_OCT = { hardware: 0, software: 12, algorithms: 12, consciousness: -12, training: 0, legacy: -12, snare: 12 };
    const phone = g => g * (PHONE ? 0.6 : 1);

    // Packet Snare: a catch's notes, two to six by the loop's multiplier, low down (a pocket, not a prompt).
    const catchNotes = mult => [57, 60, 62, 64, 67, 69].slice(0, 2 + Math.min(4, Math.round((mult - 1) * 1.5)));
    const lastAt = notes => (notes.length - 1) * S() / 2;
    // A held-open loop's ticks climb the scale, a degree a step (snareRace, never varied, so the climb holds).
    const raceNote = step => degShift(69, Math.max(0, Math.min(8, Math.round(Number(step) || 0))));
    // An inharmonic partial `mult` times a note (a metal ring), kept in the play's variation and the track's key.
    const ping = (n, mult, o = {}) => tone({ f0: NOTE(mapNote(degShift(n, varDeg))) * mult, type: 'sine', dur: 0.2, gain: 0.02, ...o, raw: true });

    // Each track's sound set, levelled to Classic's loudness (measured with a K-weighted meter, like the music).
    const SFX_TRIM = {}, SIMPLE_TRIM = {};   // trims.sfx and trims.simple in music/<theme>.js

    // Packet Snare's effects, levelled per track (and simple version) against that track's own effects, measured
    // K-weighted (the peak 100 ms, averaged over four plays, against the mean of 17 existing effects): a catch, a
    // placement and a broken decoy at the clicks' level, a spoil, a snap and a hit on the boss 1.5 dB over, your
    // laser, a turret's zap and a chain 3.5 dB under (they come often, by themselves), the sweep's warning 3.5 dB
    // over, the boss locking on and the powers 4 dB over and the boss 5.5 dB over. The second wave the same way: a sloppy
    // flick's flag at the clicks' level; a quarantine, a stun, a core appearing, a parry, a slash, a spoof, a garbage
    // collection, a hijack, a rebuild and a herder knocked out 1.5 dB over; a hijacked Antivirus or partner taking packets
    // and a held loop's ticks 3.5 dB under; the IDS alarm 3.5 dB over and the boss beaten 5.5 dB over (an option's
    // variations, partner, down, step, flags, averaged). Keys `name` or `name:kind`.
    const SNARE_TRIM = {};     // trims.snare in music/<theme>.js
    // Packet Snare's sounds are written for every track (Classic included), in the stealth spirit: quiet ticks, muted
    // plucks, filtered noise, a heartbeat sub for the boss. Each effect keeps its idea across the tracks: a catch is
    // muted plucks low down, rising with the multiplier, with a small tick on top; a spoil a semitone cluster falling;
    // a snap a static crack and a thud; your laser a thin zap down; a chain a crackle; a system Firewall's warning
    // two pulses and a rising hiss; the boss locking on a run of ticks climbing over a rising tone, and the boss
    // itself a heartbeat; placing a wall a clunk, a decoy a hollow note, a turret two ticks and a note, a tower a
    // low note and two up; taking one back a short fall; freeze a long fall with the world muffling, purge a
    // rising sweep into a chord; a turret's zap a fizz; a broken decoy a glassy shatter.
    // The second wave: a core quarantined two lock clicks, a thud and a step down to the root (a partner a warm, sly
    // rise instead); an Antivirus stunned on a Firewall a bonk and a few dizzy stars (a crack and a flat second when
    // the wall breaks); a core appearing a low swell with a faint flat second over it and a drip; the boss beaten a
    // chord, a run up and a bright major chord held over a sub; a parry a metal ping deflected upward; a slash a
    // swish and a cut; a spoof a glitchy bend up into a stutter; garbage collected a crunch down and a small refund
    // note rising; a held loop's ticks climbing the scale a degree a step (never varied); a hijack a reprogrammed
    // chirp; a hijacked helper's take a tiny pop up; a flag a semitone fall (brighter with each flag, a third note on
    // the last warning); the IDS a tritone siren; a Firewall rebuilding a ratchet and a clunk; a herder knocked out
    // a short power-down.
    const TRACK_SOUNDS = {};   // sounds in music/<theme>.js

    // Sound groups, each with its own volume in Settings (per device): a group at 0 is silent.
    const GROUPS = {
        clicks: ['click'],
        buys: ['buy', 'buyBig', 'claim'],
        training: ['sprint', 'clean', 'perfect', 'system', 'breakthrough', 'smash', 'windup', 'launch', 'land', 'nearMiss', 'crunch', 'flow', 'freeze', 'release',
            'snareCatch', 'snareSpoil', 'snareSnap', 'snareLaser', 'snareChain', 'snareSweep', 'snareBoss', 'snareHit',
            'snareCharge', 'snarePlace', 'snareRemove', 'snarePower', 'snareZap', 'snareDecoy', 'snareQuarantine', 'snareStun', 'snareCore',
            'snareParry', 'snareSlash', 'snareSpoof', 'snareGarbage', 'snareRace', 'snareHijack', 'snareTaken', 'snareFlag', 'snareIds', 'snareRebuild',
            'snareHerdStun'],
        events: ['summit', 'runEnd', 'record', 'viral', 'achievement', 'phase', 'ship', 'snareBossDown'],
        ui: ['ui', 'error']
    };
    const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, names]) => names.map(n => [n, g])));
    const mix = { clicks: 1, buys: 1, training: 1, events: 1, ui: 1 };
    function setMix(m) { for (const k of Object.keys(mix)) if (m && m[k] != null) mix[k] = Math.max(0, Math.min(1, Number(m[k]) || 0)); }

    // Simple sounds only: every effect as a plain one-to-three-note figure, nothing on the grid, in the track's
    // key and its plain voice, still varying play to play. Notes are written in A minor pentatonic like
    // everywhere. The voice is the plain form of the track's instruments: Classic a filtered square (its blip),
    // Dark a filtered saw, Soft a sine that rings like a mallet, Ominous a low sine with a long tail,
    // Retro a raw square.
    let simple = false;
    const SIMPLE_VOICE = {};   // simpleVoice in music/<theme>.js
    const sv = () => SIMPLE_VOICE[style] || SIMPLE_VOICE.classic;
    const sb = (n, dur = 0.08, gain = 0.07, at = 0, to = null) => {
        const v = sv();
        tone({ f0: NOTE(n + v.oct), ...(to != null ? { f1: NOTE(to + v.oct) } : {}), dur: dur * v.len, type: v.type, at,
            cutoff: v.cutoff || 0, gain: gain * v.gain, attack: v.attack || 0.005 });
    };
    const SIMPLE = {
        // Compute a note sliding down with a bright tick, data a short high note, research two notes up.
        click: ({ res = 'cp' } = {}) => res === 'rp' ? (sb(88, 0.05, 0.09), sb(100, 0.04, 0.04, 0.03))
            : res === 'dp' ? sb(84, 0.035, 0.065 * (PHONE ? 0.6 : 1)) : (sb(72, 0.08, 0.065, 0, 67), sb(91, 0.02, 0.03)),
        buy: () => { sb(76, 0.07); sb(81, 0.09, 0.07, 0.06); },
        buyBig: () => { sb(76, 0.07); sb(81, 0.07, 0.07, 0.06); sb(88, 0.1, 0.07, 0.12); },
        claim: () => { sb(81, 0.07); sb(88, 0.1, 0.07, 0.07); },
        // Packet Snare: low and short, away from the prompts' high notes and the near miss's bend.
        snareCatch: ({ mult = 1 } = {}) => { sb(64, 0.05, 0.07); sb(mult >= 2.5 ? 76 : 69, 0.06, 0.07, 0.06); },
        snareSpoil: () => sb(52, 0.2, 0.06, 0, 45),
        snareSnap: () => { sb(45, 0.06, 0.08); sb(81, 0.02, 0.03); },
        snareLaser: () => sb(100, 0.04, 0.03, 0, 88),
        snareChain: () => { sb(93, 0.03, 0.03); sb(96, 0.03, 0.03, 0.04); },
        snareSweep: () => { sb(69, 0.08, 0.05); sb(64, 0.08, 0.05, 0.12); },
        snareCharge: () => { sb(57, 0.3, 0.05, 0, 69); sb(81, 0.05, 0.05, 0.36); },
        snareBoss: () => { sb(45, 0.15, 0.1, 0, 40); sb(45, 0.12, 0.07, 0.24, 40); },
        snareHit: () => sb(57, 0.12, 0.08),
        snarePlace: ({ kind = 'wall' } = {}) => { const n = { wall: 57, decoy: 76, turret: 64, tower: 69 }[kind] ?? 64; sb(n, 0.06, 0.07); sb(n + 12, 0.03, 0.035, 0.06); },
        snareRemove: () => sb(72, 0.06, 0.06, 0, 64),
        snarePower: ({ kind = 'freeze' } = {}) => kind === 'purge' ? (sb(69, 0.08, 0.06), sb(81, 0.08, 0.06, 0.12), sb(88, 0.18, 0.06, 0.24)) : sb(93, 0.4, 0.05, 0, 76),
        snareZap: () => sb(88, 0.04, 0.045, 0, 72),
        snareDecoy: () => { sb(84, 0.04, 0.045); sb(76, 0.06, 0.045, 0.06); },
        snareQuarantine: ({ partner = false } = {}) => partner ? (sb(57, 0.05, 0.07), sb(64, 0.06, 0.06, 0.06), sb(67, 0.1, 0.06, 0.12)) : (sb(45, 0.05, 0.08), sb(69, 0.04, 0.05, 0.05), sb(57, 0.1, 0.07, 0.1)),
        snareStun: ({ down = false } = {}) => { sb(52, 0.06, 0.08); if (down) sb(46, 0.15, 0.06, 0.06, 40); else sb(88, 0.03, 0.025, 0.06); },
        snareCore: () => { sb(45, 0.4, 0.06); sb(58, 0.3, 0.025, 0.1); },
        snareBossDown: () => { sb(69, 0.08); sb(76, 0.08, 0.07, 0.08); sb(81, 0.3, 0.08, 0.16); sb(45, 0.3, 0.1, 0.16); },
        snareParry: () => { sb(81, 0.04, 0.05, 0, 93); sb(100, 0.03, 0.025, 0.05); },
        snareSlash: () => { sb(64, 0.03, 0.06, 0, 93); sb(57, 0.05, 0.06, 0.05); },
        snareSpoof: () => { sb(52, 0.08, 0.05, 0, 76); sb(75, 0.03, 0.04, 0.09); sb(69, 0.06, 0.05, 0.13); },
        snareGarbage: () => { sb(45, 0.08, 0.08, 0, 33); sb(76, 0.06, 0.05, 0.12, 81); },
        snareRace: ({ step = 0 } = {}) => sb(raceNote(step), 0.03, 0.035),
        snareHijack: () => { sb(64, 0.04, 0.05, 0, 76); sb(88, 0.04, 0.04, 0.06); },
        snareTaken: () => sb(79, 0.025, 0.025, 0, 84),
        snareFlag: ({ flags = 1, limit = 3 } = {}) => { sb(70, 0.04, 0.05); sb(69, 0.05, 0.045, 0.06); if (flags >= limit - 1) sb(70, 0.03, 0.035, 0.12); },
        snareIds: () => [76, 70, 76, 70].forEach((n, i) => sb(n, 0.05, 0.06, i * 0.07)),
        snareRebuild: () => { sb(57, 0.03, 0.05); sb(64, 0.03, 0.05, 0.04); sb(69, 0.06, 0.06, 0.08); },
        snareHerdStun: () => sb(72, 0.2, 0.045, 0, 52),
        error: () => { sb(64, 0.14, 0.05, 0, 57); sb(65, 0.14, 0.035, 0, 58); },
        ui: () => sb(93, 0.03, 0.03),
        sprint: ({ charge = 1 } = {}) => sb(57, 0.12, 0.05 + 0.06 * charge, 0, 64),
        clean: () => sb(88, 0.1),
        perfect: () => { sb(88, 0.08); sb(93, 0.12, 0.07, 0.07); },
        system: () => { sb(88, 0.08); sb(93, 0.08, 0.07, 0.07); sb(100, 0.14, 0.07, 0.14); },
        breakthrough: () => { sb(45, 0.3, 0.12, 0, 33); sb(81, 0.2, 0.06, 0.1); },
        smash: () => sb(45, 0.4, 0.12, 0, 28),
        windup: () => sb(57, 0.5, 0.04, 0, 69),
        launch: () => sb(69, 0.15, 0.04, 0, 76),
        land: ({ impact = 3 } = {}) => sb(57, 0.12, 0.04 + 0.08 * Math.min(1, impact / 15), 0, 52),
        summit: () => { sb(76, 0.1); sb(81, 0.1, 0.07, 0.1); sb(88, 0.25, 0.07, 0.2); },
        nearMiss: () => sb(76, 0.3, 0.05, 0, 74),
        runEnd: ({ good = false } = {}) => good ? (sb(76, 0.1), sb(81, 0.15, 0.07, 0.1)) : sb(64, 0.2, 0.05, 0, 60),
        record: () => { sb(81, 0.08); sb(88, 0.12, 0.07, 0.08); },
        crunch: () => sb(52, 0.2, 0.06),
        flow: () => sb(69, 0.5, 0.05),
        freeze: () => sb(93, 0.4, 0.06, 0, 69),
        release: () => sb(57, 0.3, 0.08, 0, 69),
        viral: () => { sb(81, 0.06); sb(84, 0.06, 0.07, 0.06); sb(88, 0.1, 0.07, 0.12); },
        achievement: () => { sb(81, 0.1); sb(88, 0.2, 0.07, 0.1); },
        phase: () => { sb(69, 0.12); sb(76, 0.12, 0.07, 0.12); sb(81, 0.3, 0.07, 0.24); },
        ship: () => { sb(57, 0.15); sb(69, 0.15, 0.07, 0.15); sb(81, 0.4, 0.07, 0.3); },
        default: () => sb(76, 0.12)
    };

    // Stingers wait for the grid: steps to quantize to (1 = the next 16th, 2 = the next 8th).
    const QUANT = { buy: 1, buyBig: 1, claim: 1, summit: 2, record: 1, runEnd: 1, viral: 1, achievement: 1, phase: 2, ship: 2, snareBossDown: 2 };
    // Minimum seconds between two plays of the same sound (clicks and dust can come in floods).
    const GAP = { click: 0.045, land: 0.08, launch: 0.15, buy: 0.05, ui: 0.05, error: 0.2, clean: 0.05,
        snareCatch: 0.05, snareChain: 0.06, snareLaser: 0.06, snareZap: 0.06, snareSnap: 0.1, snareHit: 0.06,
        snareTaken: 0.07, snareRace: 0.2, snareStun: 0.08, snareSpoof: 0.1, snareRebuild: 0.1, snareHerdStun: 0.1, snareFlag: 0.1, snareQuarantine: 0.08 };

    // The generate clicks and a held loop's climbing ticks already play a figure: they don't vary.
    const NO_VARY = { click: true, snareRace: true };
    function play(name, opts) {
        const gv = mix[GROUP_OF[name] || 'ui'];
        if (volume <= 0 || gv <= 0 || !SOUNDS[name] || !ensure() || !live()) return;
        const now = ctx.currentTime;
        const at = opts?.t;      // an exact audio time (the held-job part schedules its own grid points)
        if (at == null) {
            if (last[name] != null && now - last[name] < (GAP[name] ?? 0.03)) return;
            last[name] = now;
        }
        // Every sound lands on the track's grid, in every track and in simple sounds: the next 16th (a held
        // click and the stingers the next 8th, `q` from game.js or QUANT). If a slowed track puts the 8th too
        // far off, the next 16th.
        const g1 = gridMul(), div = (opts?.q ?? QUANT[name] ?? 1) * g1;
        base = Math.max(0, (at ?? nextStep(div).t) - now);
        if (at == null && base > 0.3 && div > g1) base = Math.max(0, nextStep(g1).t - now);
        startAt = now + base;
        if (DUCK[name] && duck && !simple) {
            const [db, secs] = DUCK[name];
            duck.gain.setTargetAtTime(Math.pow(10, -db / 20), startAt, 0.03);
            duck.gain.setTargetAtTime(1, startAt + secs, 0.3);
        }
        if (name === 'click') lastClickAt = startAt;
        gmul = gv * ((simple ? SIMPLE_TRIM : SFX_TRIM)[style] || 1);
        const st = SNARE_TRIM[(simple ? 's:' : '') + style];
        if (st && name.startsWith('snare')) gmul *= st[name + ':' + (opts?.kind ?? { snarePlace: 'wall', snarePower: 'freeze' }[name])] ?? st[name] ?? 1;
        if (!NO_VARY[name]) [varDeg, varNoise] = VARIANTS[vary('v:' + name, VARIANTS.length)];
        // A track's own version of the sound if it has one (TRACK_SOUNDS), else the shared one in its profile.
        const own = !simple && TRACK_SOUNDS[style]?.[name === 'buyBig' ? 'buy' : name];
        ownSound = !!own;
        try {
            if (simple) (SIMPLE[name] || SIMPLE.default)(opts);
            else if (own) own(name === 'buyBig' ? { ...opts, big: true } : opts || {});
            else SOUNDS[name](opts);
        } catch (e) { fault('play ' + name, e); }   // a bad node never breaks the game
        base = 0;
        startAt = null;
        gmul = 1;
        ownSound = false;
        varDeg = 0; varNoise = 1;
    }

    // A held job: while the game says a job is held (`held(res)` with each repeat it pays, `held(null)` on
    // release), its click figure plays on the track's grid, a note every `HOLD_DIV` steps (the 8ths). The game
    // times its own repeats (`E.holdClock`): this part only accompanies them, so it needn't be a note a repeat,
    // and it never plays on after the hold (it stops on release, or `HOLD_KEEP` s after the last repeat, and
    // schedules at most `HOLD_AHEAD` s ahead). The first note takes the next 16th, a pick-up into the 8ths.
    const HOLD_KEEP = 0.4, HOLD_AHEAD = 0.08;
    // The held figure's grid: the track's own (`holdDiv` on the style, in steps), else the division nearest an 8th
    // at 124 BPM (so about four notes a second in any song; the income's rate is the game's business, not this).
    const holdDiv = () => styleOf().holdDiv || 2 * gridMul();
    let holdPart = null;            // { res, until, next (step), first, timer }
    let lastClickAt = 0;            // the audio time of the last click scheduled (taps included)
    function held(res) {
        if (!res) {
            if (holdPart) { stopEvery(holdPart.timer); holdPart = null; }
            return;
        }
        if (volume <= 0 || mix.clicks <= 0 || !ensure() || !live()) return;
        const until = ctx.currentTime + HOLD_KEEP;
        if (holdPart) { holdPart.res = res; holdPart.until = until; return; }
        const from = Math.max(ctx.currentTime, lastClickAt + S() / 2);
        const g1 = Math.min(gridMul(), holdDiv());
        holdPart = { res, until, next: Math.ceil(stepAt(from) / g1 - 1e-6) * g1, first: true, timer: every(holdTick, 25) };
        holdTick();
    }
    function holdTick() {
        const h = holdPart;
        if (!h) return;
        const now = ctx.currentTime;
        if (now > h.until || !live()) return held(null);
        // After a stall, pick the grid up from now: never a burst of the notes that were missed.
        const div = holdDiv();
        if (stepTime(h.next) < now - 0.05) h.next = Math.ceil(stepAt(now) / div - 1e-6) * div;
        while (stepTime(h.next) < now + HOLD_AHEAD && stepTime(h.next) <= h.until) {
            play('click', { res: h.res, t: Math.max(now, stepTime(h.next)) });
            h.next = h.first ? Math.floor(h.next / div + 1e-6 + 1) * div : h.next + div;
            h.first = false;
        }
    }

    // The sprint meter: while you hold, it plays along with the track instead of a rising tone (the owner
    // found that grating): notes of the chord the music is on (the song's chord; with the music off, the
    // track's first lab song), struck on the track's 16ths in the track's instruments. Each charge takes one
    // of four parts, never the same twice running: an arpeggio through the chord, octave hops on its root, an
    // acid line whose filter opens with the charge, and the whole chord gated on the 16ths. The charge shows
    // as brightness (the filter opens) and density (8ths, then 16ths past half way), not as pitch. Act two's
    // thrust is a driving pulse on the root and its fifth.
    const CHARGE_VOICES = [
        { type: 'triangle', gain: 0.034, dur: 0.16, q: 2, cutoff: l => 900 + 3200 * l, notes: (l, n, ch) => [ch.v[n % ch.v.length] + 24] },
        { type: 'triangle', gain: 0.036, dur: 0.12, q: 1, cutoff: () => 3000, notes: (l, n, ch) => [ch.root + 36 + (n % 2 ? 12 : 0)] },
        { type: 'sawtooth', gain: 0.03, dur: 0.14, q: 10, cutoff: l => 500 * Math.pow(10, l), notes: (l, n, ch) => [ch.root + 24 + (n % 4 === 3 ? 12 : 0)] },
        { type: 'sawtooth', gain: 0.012, dur: 0.07, q: 1, cutoff: l => 1200 + 3000 * l, notes: (l, n, ch) => ch.v.map(x => x + 12) }
    ];
    const THRUST_VOICE = { type: 'sawtooth', gain: 0.036, dur: 0.09, q: 6, every: 1, cutoff: l => 900 + 3000 * l, notes: (l, n, ch) => [ch.root + 24 + (n % 4 === 2 ? 7 : 0)] };
    // Each part's level per track (arpeggio, hops, acid, gated chord, thrust; `s:` the simple versions), set so
    // it stands about 7 dB over the track's music in its own third-octave bands while you hold (measured in the
    // server room at a run's pace, averaged over three passes), never louder than about −37 dB K-weighted (Dark's
    // dense mix would have needed more): at the old quiet pluck's level it sat under the music in every track. BASE_TRIM evens the tracks' instruments first.
    const CHARGE_TRIM = {}, BASE_TRIM = {};   // trims.charge and trims.base in music/<theme>.js
    let lastVoice = -1;
    function chargeVoice() {
        let i = Math.floor(rnd() * CHARGE_VOICES.length);
        if (i === lastVoice) i = (i + 1 + Math.floor(rnd() * (CHARGE_VOICES.length - 1))) % CHARGE_VOICES.length;
        lastVoice = i;
        return CHARGE_VOICES[i];
    }
    // The chord the music plays at time t (it logs each bar's chord as it schedules it).
    function chordAt(t) {
        const log = music?.chordLog;
        if (log) for (let i = log.length - 1; i >= 0; i--) if (log[i].t <= t + 1e-3) return log[i].ch;
        const s = (SONGS[style] || SONGS.classic).lab[0], n = s.chords.length;
        return s.chords[((Math.floor(stepAt(t) / 16) % n) + n) % n];
    }

    // One 16th of the meter: the voice's notes for the chord then, struck at time t.
    function strikeCharge(c, l, n, t) {
        c.sched = n;
        const v = c.v;
        if ((v.every || (l < 0.5 ? 2 : 1)) === 2 && n % 2) return;
        const ch = chordAt(t), P = simple ? null : PROFILES[style];
        const type = simple ? sv().type : P ? P.wave(v.type, 440) : v.type;
        const key = (simple ? 's:' : '') + style;
        const lvl = mix.training * (simple ? sv().gain : 1) * (BASE_TRIM[key] || 1) * ((CHARGE_TRIM[key] || [])[c.vi] ?? 1);
        const cut = simple && sv().cutoff ? Math.min(v.cutoff(l), sv().cutoff * 1.5) : v.cutoff(l);
        for (const note of v.notes(l, n, ch)) {
            const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = type;
            o.frequency.value = NOTE(note + shift());   // in the music's key, like the chord it comes from
            f.type = 'lowpass';
            f.frequency.value = cut;
            f.Q.value = v.q;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain * lvl), t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
            o.connect(f).connect(g).connect(c.out);
            o.start(t);
            o.stop(t + v.dur + 0.02);
        }
    }

    // Held: `level` is the charge (0-1); `free` is act two's thrust.
    function charge(level, free = false) {
        if (volume <= 0 || mix.training <= 0 || !ensure() || !live()) return;
        const now = ctx.currentTime;
        const l = Math.max(0, Math.min(1, level));
        if (chargeOsc && chargeOsc.free !== free) chargeStop();
        if (!chargeOsc) {
            const out = ctx.createGain();
            out.connect(master);
            // The first note waits for the next 16th, like every sound.
            const v = free ? THRUST_VOICE : chargeVoice();
            chargeOsc = { out, v, vi: free ? 4 : CHARGE_VOICES.indexOf(v), free, sched: Math.floor(stepAt(now) / gridMul()) };
        }
        const c = chargeOsc;
        // Strike each 16th a little ahead, so it lands exactly on the beat.
        const g1 = gridMul();
        let next = Math.max(c.sched + 1, Math.ceil(stepAt(now) / g1));
        while (stepTime(next * g1) - now < 0.06) { strikeCharge(c, l, next, stepTime(next * g1)); next++; }
    }

    function chargeStop() {
        if (!chargeOsc) return;
        const { out } = chargeOsc;
        chargeOsc = null;
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        later(() => out.disconnect(), 500);
    }

    // ---- Music: songs in each track's voice, that follow the run -----------------------------------------
    // A step sequencer (16 steps a bar) scheduled a little ahead on the audio clock. Each track has its own
    // tempo, drums and instruments (`STYLES`, from music/<theme>.js) and a list of songs per area (`SONGS`): the
    // lab (with Surveillance and R&D), the server room (with its bays) and Packet Snare's bay. A song is chord
    // progressions, bass lines, melodies and a form: a list of sections, each saying which of them it plays, for
    // how many bars, and how much of the drum kit is in. When a song ends the area's next one takes over; moving
    // between areas changes song on the next bar (the next beat in a slow song), and coming back picks a song up
    // at the section it left. Parts come in with what the game has earned and the run's speed, in an order and at
    // thresholds each track sets (`layers`). Power-ups bend it: a crunch distorts it, flow and bullet time slow
    // and muffle it, a breakthrough is a swell that opens the filter and lands on a crash.
    // The music never times the game: it reads the game's state (`musicState`, `setArea`, `setDepth`,
    // `setTraining`, `held`) and nothing in the game waits on it.
    let music = null;               // the running music: buses, sends, the scheduler's place in the song
    let musicVolume = 0.35;
    let intensity = 0;
    let mode = null;                // null | 'crunch' | 'flow' | 'freeze'
    let area = 'lab';               // 'lab' | 'server' | 'snare' (game.js, `setArea`)
    let depth = 0;                  // 0-1: how much of the arrangement the game has earned (game.js, `setDepth`)
    let training = false;           // the beat plays only while training (game.js, `setTraining`)
    let songLvl = 1;                // the current song's level trim, on its pitched voices
    // Presentation policy, not architecture: the beat (kick, hats, claps, fills) plays only while training (the
    // owner's call). `setPolicy({ beatAlways: true })` lifts it without touching the game.
    const policy = { beatAlways: false };
    function setPolicy(p) { if (p && p.beatAlways != null) policy.beatAlways = !!p.beatAlways; setParts(0.3); }

    function driveCurve(k) {
        const n = 1024;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }

    // ---- Space: a track's delay and reverb, shared by all its voices through sends -------------------------
    // `space` on a style: { reverb: { seconds, damp (Hz), level, pre (s) }, delay: { steps, feedback, cutoff,
    // level, pan }, width }. One convolver and one delay line per bus (the music's, the effects'), never one a note.
    const impulses = {};
    function impulse(sp) {
        const key = [sp.seconds, sp.damp, sp.pre].join(':');
        if (impulses[key] && impulses[key].sampleRate === ctx.sampleRate) return impulses[key];
        const sr = ctx.sampleRate, n = Math.ceil(sr * sp.seconds), pre = Math.floor(sr * (sp.pre || 0.008));
        const buf = ctx.createBuffer(2, n, sr);
        // Noise that dies away (60 dB over `seconds`) and darkens as it does: each channel its own, for width.
        let seed = 0x9E3779B9 ^ Math.round(sp.seconds * 1000);
        const r = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            let y = 0;
            for (let i = pre; i < n; i++) {
                const t = (i - pre) / sr;
                const cut = Math.max(600, (sp.damp || 5000) * Math.exp(-t * 1.6 / sp.seconds));
                const a = 1 - Math.exp(-2 * Math.PI * cut / sr);
                y += a * (r() - y);
                d[i] = y * Math.exp(-6.9 * t / sp.seconds);
            }
        }
        // Even energy whatever the length: a long hall is not louder than a short room at the same send.
        let e = 0;
        for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) e += d[i] * d[i]; }
        const k = 1 / Math.sqrt(e / 2 || 1);
        for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
        return (impulses[key] = buf);
    }
    // Build a space into `dest`: returns its send inputs ({ rev, dly }, either may be missing) and how to dispose of it.
    function buildSpace(sp, dest) {
        const s = { nodes: [] };
        if (!sp) return s;
        if (sp.reverb) {
            const inp = ctx.createGain(), conv = ctx.createConvolver(), out = ctx.createGain();
            conv.buffer = impulse(sp.reverb);
            out.gain.value = sp.reverb.level ?? 0.3;
            inp.connect(conv).connect(out).connect(dest);
            s.rev = inp; s.nodes.push(inp, conv, out);
        }
        if (sp.delay) {
            const inp = ctx.createGain(), d = ctx.createDelay(2), lp = ctx.createBiquadFilter(), fb = ctx.createGain(), out = ctx.createGain();
            d.delayTime.value = (sp.delay.steps ?? 3) * clock.len;
            lp.type = 'lowpass'; lp.frequency.value = sp.delay.cutoff ?? 2600;
            fb.gain.value = Math.min(0.7, sp.delay.feedback ?? 0.35);       // bounded: it always dies away
            out.gain.value = sp.delay.level ?? 0.4;
            inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
            let tail = lp;
            if (sp.delay.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.delay.pan; lp.connect(p); tail = p; s.nodes.push(p); }
            tail.connect(out); out.connect(dest);
            s.dly = inp; s.delay = d; s.steps = sp.delay.steps ?? 3; s.nodes.push(inp, d, lp, fb, out);
        }
        return s;
    }
    function dropSpace(s, after = 0) {
        if (!s || !s.nodes.length) return;
        const go = () => { for (const n of s.nodes) try { n.disconnect(); } catch { /* gone */ } };
        if (after) later(go, after); else go();
    }
    // The effects' own space (the same room as the track's music, on the effects' bus): built on first use.
    let fxSpace = null;
    function fxSends() {
        if (fxSpace && fxSpace.style === style) return fxSpace;
        if (fxSpace) dropSpace(fxSpace, 6000);
        fxSpace = buildSpace(styleOf().space, master);
        fxSpace.style = style;
        return fxSpace;
    }

    // ---- Tempo ---------------------------------------------------------------------------------------------
    // Each track has its tempo (`bpm` on the style) and a song may have its own. The clock's step is a 16th at
    // that tempo. Sounds that wait for the grid wait for the division of it nearest the old 16th at 124 BPM
    // (121 ms), so a tap never waits longer in a slow song (`gridMul`: 1 at 124, ½ at 62).
    const styleOf = () => STYLES[style] || STYLES.classic || {};
    const bpmOf = song => (song && song.bpm) || styleOf().bpm || 124;
    const stepOf = bpm => 60 / bpm / 4;
    const baseLen = () => stepOf(music ? music.bpm : bpmOf(null));
    const gridMul = () => Math.pow(2, Math.round(Math.log2(0.121 / baseLen())));
    // The clock takes a new tempo from now on, without a jump in step time.
    function tempoNow(bpm) {
        if (!ctx) return;
        const now = ctx.currentTime;
        retime(stepOf(bpm), clock ? stepAt(now) : 0, now);
    }

    function startMusic() {
        if (music || musicVolume <= 0 || !ensure() || !live()) return;
        const st = styleOf();
        const songs = areaSongs(area), song = songFor[area] % songs.length, bpm = bpmOf(songs[song]);
        tempoNow(bpm);
        const bus = ctx.createGain();
        bus.gain.value = musicLevel();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1400;
        filter.Q.value = 0.7;
        const drive = ctx.createWaveShaper();
        drive.curve = driveCurve(40);
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        dry.gain.value = 1;
        wet.gain.value = 0;
        const parts = { beat: ctx.createGain(), tones: ctx.createGain() };
        // Sends follow their part's fader, so a muted part is muted in the reverb too.
        const sendIn = { beat: {}, tones: {} };
        const space = simple ? { nodes: [] } : buildSpace(st.space, bus);
        for (const [k, g] of Object.entries(parts)) {
            g.gain.value = partLevel(k);
            g.connect(bus);
            for (const kind of ['rev', 'dly']) if (space[kind]) { const sg = ctx.createGain(); sg.gain.value = partLevel(k); sg.connect(space[kind]); sendIn[k][kind] = sg; }
        }
        bus.connect(dry).connect(filter);
        bus.connect(drive).connect(wet).connect(filter);
        // The beat's trim comes after the drive, which would otherwise saturate back up to full level.
        const trim = ctx.createGain();
        trim.gain.value = styleTrim();
        filter.connect(trim).connect(out);
        const first = nextStep(4, 0.05);           // joins on a beat, in time with the grid sounds
        music = { bus, parts, sendIn, space, drive, dry, wet, filter, trim, nextStep: first.t, step: first.n, origin: first.n,
            area, songs, song, bpm, songStep: first.n, left: {}, cmd: null, style, voices: 0 };
        music.timer = every(schedule, 25);
    }

    function stopMusic(fade = 0.1) {
        if (!music) return;
        stopEvery(music.timer);
        const m = music;
        music = null;
        m.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, fade);
        later(() => { m.filter.disconnect(); m.trim.disconnect(); dropSpace(m.space); for (const k of Object.keys(m.sendIn)) for (const g of Object.values(m.sendIn[k])) g.disconnect(); }, 600 + fade * 4000);
        if (clock.len !== baseLen()) tempoNow(bpmOf(null));
    }

    // ---- Voices ----------------------------------------------------------------------------------------------
    // One voice into the music, through its part: the beat (kick, hats, claps) or the tones (everything pitched),
    // each with its own volume in Settings (`setMusicMix`). `o`: { pan (-1 to 1), rev, dly (send amounts) }.
    // Voices are counted (`voices`), and a voice marked `low` (decoration: doublings, arpeggios) is dropped while
    // the count is over `VOICE_SOFT`: the tune and the beat always play.
    const voices = { music: 0, peak: 0 };
    const VOICE_SOFT = env.phone ? 70 : 120;
    function count(node) {
        voices.music++;
        if (voices.music > voices.peak) voices.peak = voices.music;
        node.onended = () => { voices.music--; };
    }
    function voice(fn, part = 'tones', o) {
        if (!music) return;
        const g = ctx.createGain();
        let tail = g;
        if (o && o.pan && ctx.createStereoPanner && !simple) {
            const p = ctx.createStereoPanner();
            p.pan.value = Math.max(-1, Math.min(1, o.pan * (styleOf().space?.width ?? 1)));
            g.connect(p);
            tail = p;
        }
        tail.connect(music.parts[part] || music.bus);
        if (o && !simple) for (const kind of ['rev', 'dly']) {
            const to = music.sendIn[part] && music.sendIn[part][kind];
            if (o[kind] && to) { const sg = ctx.createGain(); sg.gain.value = o[kind]; tail.connect(sg).connect(to); }
        }
        fn(g);
    }
    const shift = () => styleOf().shift || 0;   // the track's key, from A
    // Pulse waves of other widths than a square's (chip voices): 'pulse25', 'pulse12'.
    const waves = {};
    function pulse(name) {
        const m = /^pulse(\d+)$/.exec(name);
        if (!m || !ctx.createPeriodicWave) return null;
        if (waves[name] && waves[name].ctx === ctx) return waves[name].w;
        const d = Number(m[1]) / 100, N = 48, re = new Float32Array(N), im = new Float32Array(N);
        for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
        const w = ctx.createPeriodicWave(re, im);
        waves[name] = { ctx, w };
        return w;
    }
    // A kick: a sine dropping `from` → `to` Hz. `o`: { drive (0-1: its own saturation), click (a tick on top) }.
    function kick(t, gain, from = 150, to = 45, decay = 0.28, o) {
        voice(g => {
            const osc = ctx.createOscillator();
            osc.frequency.setValueAtTime(from, t);
            osc.frequency.exponentialRampToValueAtTime(to, t + 0.12);
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
            if (o && o.drive) { const sh = ctx.createWaveShaper(); sh.curve = driveCurve(2 + 30 * o.drive); osc.connect(sh).connect(g); } else osc.connect(g);
            osc.start(t);
            osc.stop(t + decay + 0.02);
            count(osc);
        }, 'beat', o);
        if (o && o.click) perc(t, o.click, { f: 3200, q: 1.5, len: 0.012 });
    }
    // A noise swell rising into the next bar (the fills): its gain and filter climb to the downbeat.
    function riser(t, dur, gain, o) {
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.setValueAtTime((o && o.from) || 400, t);
            f.frequency.exponentialRampToValueAtTime((o && o.to) || 5000, t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + dur);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
            src.connect(f).connect(g);
            src.start(t);
            src.stop(t + dur + 0.1);
            count(src);
        }, (o && o.part) || 'beat', o);
    }
    // A soft chord held for a bar (pads): slow attack, gentle release.
    function pad(t, notes, dur, gain, type = 'triangle', cutoff = 1400, o) {
        for (const n of notes) voice(g => {
            const osc = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            osc.type = type;
            osc.frequency.value = NOTE(n + shift());
            osc.detune.value = (rnd() - 0.5) * 10;
            f.type = 'lowpass';
            f.frequency.value = cutoff;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain * songLvl, t + dur * 0.3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(f).connect(g);
            osc.start(t);
            osc.stop(t + dur + 0.05);
            count(osc);
        }, 'tones', o);
    }
    // Filtered noise in the beat: hats, shakers, rims, snares. `o`: { type, f, f1 (sweeps to), q, len, attack, pan, rev }.
    function perc(t, gain, o = {}) {
        const len = o.len ?? 0.04;
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });   // builds the shared noise buffer
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter();
            f.type = o.type || 'bandpass';
            f.frequency.setValueAtTime(o.f ?? 3000, t);
            if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + len);
            f.Q.value = o.q ?? 1;
            if (o.attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + o.attack); } else g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            src.connect(f).connect(g);
            src.start(t, rnd() * 0.5);
            src.stop(t + len + 0.02);
            count(src);
        }, o.part || 'beat', o);
    }
    const hat = (t, gain, len = 0.04, o) => perc(t, gain, { type: 'highpass', f: 7000, len, ...o });
    const clap = (t, gain, o) => perc(t, gain, { f: 1600, q: 0.9, len: 0.16, ...o });
    // A pitched voice. `o`:
    //   type ('sine'…) or wave ('pulse25', 'pulse12'); detune (cents); glide (from this note) and glideTime
    //   cutoff, q, env (the filter starts at cutoff × (1 + env) and snaps down: acid), ftype
    //   attack; then either a plain decay over `dur` (a pluck), or with `sus` (0-1) a held note: it falls to
    //   `sus` over `dec`, holds to the end of `dur`, and lets go over `rel`. Duration, envelope and level are
    //   separate: a long note is long because of `sus`, not because the helper happens to decay slowly.
    //   fm: { ratio, index, decay, sus } a modulator on its pitch (electric keys, bells: bright at the strike)
    //   vib: { rate, depth (cents), delay }
    //   pan, rev, dly: its place and its sends; part; low (decoration: dropped first when voices run short)
    function note(t, n, dur, gain, o = {}) {
        if (!music || (o.low && voices.music > VOICE_SOFT)) return;
        voice(g => {
            const osc = ctx.createOscillator();
            const f0 = NOTE(n + (o.raw ? 0 : shift()));
            const w = o.wave && pulse(o.wave);
            if (w) osc.setPeriodicWave(w); else osc.type = o.type || 'sine';
            if (o.glide != null) {
                osc.frequency.setValueAtTime(NOTE(o.glide + (o.raw ? 0 : shift())), t);
                osc.frequency.exponentialRampToValueAtTime(f0, t + (o.glideTime || 0.06));
            } else osc.frequency.value = f0;
            if (o.detune) osc.detune.value = o.detune;
            const held = o.sus != null, rel = held ? (o.rel ?? 0.08) : 0, end = t + dur + rel;
            if (o.vib) {
                const lfo = ctx.createOscillator(), lg = ctx.createGain();
                lfo.frequency.value = o.vib.rate || 5.5;
                lg.gain.setValueAtTime(0, t + (o.vib.delay || 0));
                lg.gain.linearRampToValueAtTime(o.vib.depth || 12, t + (o.vib.delay || 0) + 0.15);
                lfo.connect(lg).connect(osc.detune);
                lfo.start(t); lfo.stop(end + 0.02);
            }
            if (o.fm) {
                const mod = ctx.createOscillator(), mg = ctx.createGain();
                mod.frequency.value = f0 * (o.fm.ratio || 1);
                const top = f0 * (o.fm.index || 1);
                mg.gain.setValueAtTime(top, t);
                mg.gain.exponentialRampToValueAtTime(Math.max(0.01, top * (o.fm.sus ?? 0.12)), t + (o.fm.decay || 0.15));
                mod.connect(mg).connect(osc.frequency);
                mod.start(t); mod.stop(end + 0.02);
            }
            let srcNode = osc;
            if (o.cutoff) {
                const f = ctx.createBiquadFilter();
                f.type = o.ftype || 'lowpass';
                f.Q.value = o.q ?? 1;
                if (o.env) {
                    f.frequency.setValueAtTime(o.cutoff * (1 + o.env), t);
                    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff), t + Math.min(dur, o.envTime || 0.18));
                } else f.frequency.value = o.cutoff;
                srcNode = osc.connect(f);
            }
            const peak = Math.max(0.0002, gain * songLvl), attack = Math.min(o.attack ?? 0.008, dur * 0.5);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(peak, t + attack);
            if (held) {
                const level = Math.max(0.0002, peak * o.sus), dec = Math.max(0.005, Math.min(o.dec ?? 0.12, dur - attack - 0.005));
                g.gain.exponentialRampToValueAtTime(level, t + attack + dec);
                g.gain.setValueAtTime(level, Math.max(t + attack + dec, t + dur));
                g.gain.exponentialRampToValueAtTime(0.0001, end);
            } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            srcNode.connect(g);
            osc.start(t);
            osc.stop(end + 0.02);
            count(osc);
        }, o.part || 'tones', o);
    }
    // The older call (the tracks not yet rewritten use it): a plucked voice through a resonant lowpass.
    const synth = (t, n, dur, gain, type, cutoff, q = 6, env = 0, detune = 0, attack = 0.008) => note(t, n, dur, gain, { type, cutoff, q, env, detune, attack });

    // ---- Songs ----------------------------------------------------------------------------------------
    // Everything is written in A (A minor, A Phrygian…, or C major for the bright songs, its relative), and the
    // track's `shift` moves it to the track's key. The sounds sit in the same keys (KEYS).
    // A song (in music/<theme>.js):
    //   name, bpm (else the track's), scale, tonic (semitones from A), oct, lvl (a trim on its pitched voices)
    //   chords   a progression, a bar a chord: ['Am9', 'Fmaj7', …], or several by name: { A: […], B: […] }
    //   bass     a bar's pattern (see `bassAt`), or several by name; comp: the chords' steps in the bar, likewise
    //   mel      melodies by name: { A: '…', B: '…' }, each any whole number of bars (see `parseMelody`)
    //   form     its sections in order: [name, bars, { mel, chords, bass, comp, drums, bassOn, melGain, harm, lift,
    //            entry, fill }]. `mel` names a melody (default: the section's own name if there is one, else none);
    //            `chords`, `bass`, `comp` name which to play (default 'A'); `drums` is 'full', 'sparse' (the
    //            track decides what that is: usually the kick alone) or 'none'; `harm` adds the harmony line;
    //            `lift` raises (or with a negative number thins) the arrangement for that section; a section is a
    //            place to come back in unless `entry: false`; `fill: false` ends it without the track's fill.
    //            Without a form a song plays its track's (`form` on the style), else the old eight-section one.
    //   swing    how far odd 16ths are delayed, as a share of a step (else the track's)
    const AEOL = [0, 2, 3, 5, 7, 8, 10], PHRY = [0, 1, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
    const HARM = [0, 2, 3, 5, 7, 8, 11], ION = [0, 2, 4, 5, 7, 9, 11], MIXO = [0, 2, 4, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11];
    const PC = { A: 0, B: 2, C: 3, D: 5, E: 7, F: 8, G: 10 };
    const QUALITY = {
        '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
        9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], sus2: [0, 2, 7],
        sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], '7b9': [0, 4, 7, 10, 13],
        m11: [0, 3, 7, 10, 17], 13: [0, 4, 10, 14, 21], '6/9': [0, 4, 7, 9, 14]
    };
    const pcOf = n => (((n - 57) % 12) + 12) % 12;     // pitch class from A
    // A chord name ('Am9', 'Fmaj7', 'E7', 'G/B') → its bass note (A1 to G#2), chord tones, third and fifth.
    function parseChord(name) {
        const m = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/.exec(name);
        if (!m) throw new Error('chord ' + name);
        const acc = a => (a === 'b' ? -1 : a === '#' ? 1 : 0);
        const pc = (PC[m[1]] + acc(m[2]) + 12) % 12;
        const iv = QUALITY[m[3]];
        if (!iv) throw new Error('chord ' + name);
        const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : pc;
        return { name, pc, iv, root: 33 + bass, third: iv.find(x => x === 3 || x === 4 || x === 5 || x === 2) ?? 7 };
    }
    // Voice a chord close to the last one (smooth voice leading, A3 to about D5); five-note chords leave the
    // root to the bass.
    function voiceChord(c, prev) {
        const pcs = (c.iv.length >= 5 ? c.iv.slice(1) : c.iv).map(x => (c.pc + x) % 12).filter((p, i, a) => a.indexOf(p) === i);
        let best = null, cost = Infinity;
        for (let inv = 0; inv < pcs.length; inv++) {
            const order = pcs.slice(inv).concat(pcs.slice(0, inv));
            for (let lo = 52; lo <= 63; lo++) {
                if (pcOf(lo) !== order[0]) continue;
                const v = [lo];
                for (const p of order.slice(1)) { let n = v[v.length - 1] + 1; while (pcOf(n) !== p) n++; v.push(n); }
                const top = v[v.length - 1];
                const c2 = (prev ? v.reduce((a, n, i) => a + Math.abs(n - prev[Math.min(i, prev.length - 1)]), 0) : Math.abs(v[0] - 57))
                    + Math.max(0, top - 74) * 3;
                if (c2 < cost) { cost = c2; best = v; }
            }
        }
        return best;
    }
    // A melody: one token per 8th note. A scale degree (1-7, from the song's tonic), with b/# for a sharp or
    // flat, ' for each octave up and , for each octave down; '-' holds the note on, '.' rests; 'x+y' splits the
    // 8th into two 16ths; 'x/y/z' is a triplet across a quarter note (it takes the place of two tokens). Bars
    // may be split with '|' for reading. Any whole number of bars. Each note: { deg, acc, len, off } in 16ths
    // (`off`: how far past its step it starts, for triplets).
    function parseMelody(str) {
        const ev = [];
        let i = 0, cur = null;
        const mk = tok => {
            const m = /^([b#]?)([1-7])('*|,*)$/.exec(tok);
            if (!m) throw new Error('note ' + tok);
            const oct = m[3][0] === "'" ? m[3].length : -m[3].length;
            return { deg: +m[2] - 1 + 7 * oct, acc: m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, len: 1, off: 0 };
        };
        const put = tok => {
            if (tok === '-') { if (cur) cur.len++; ev[i] = ev[i] || null; }
            else if (tok === '.') { cur = null; ev[i] = null; }
            else ev[i] = cur = mk(tok);
            i++;
        };
        for (const tk of str.replace(/\|/g, ' ').trim().split(/\s+/)) {
            if (tk.includes('/')) {
                const parts = tk.split('/');
                if (parts.length !== 3) throw new Error('triplet ' + tk);
                parts.forEach((p, k) => {
                    if (p === '.') { ev[i + k] = null; return; }
                    if (p === '-') { if (cur) cur.len += 4 / 3; ev[i + k] = null; return; }
                    cur = mk(p); cur.len = 4 / 3; cur.off = k / 3; ev[i + k] = cur;
                });
                ev[i + 3] = null;
                i += 4;
            } else if (tk.includes('+')) tk.split('+').forEach(put);
            else { put(tk); put(tk === '.' ? '.' : '-'); }
        }
        if (!i || i % 16) throw new Error(`melody of ${i} steps: not whole bars`);
        for (let k = 0; k < i; k++) ev[k] = ev[k] || null;
        return ev;
    }
    // A melody note; `harm` degrees away in the song's scale.
    function melNote(song, e, harm = 0) {
        const d = e.deg + harm, o = Math.floor(d / 7), sc = song.scale;
        return 69 + song.tonic + sc[d - 7 * o] + 12 * o + 12 * song.oct + (harm ? 0 : e.acc);
    }
    // The harmony line under a melody note: a third below in the song's scale, unless that rubs against the
    // chord (a semitone from a chord tone it isn't), where it takes the chord tone under the melody instead.
    function harmNote(song, e, ch) {
        const top = melNote(song, e), third = melNote(song, e, -2);
        const tones = ch.iv.map(x => (ch.pc + x) % 12);
        const isTone = n => tones.includes(pcOf(n));
        const rubs = n => !isTone(n) && tones.some(p => { const d = (pcOf(n) - p + 12) % 12; return d === 1 || d === 11; });
        if (!rubs(third)) return third;
        for (let n = top - 3; n >= top - 9; n--) if (isTone(n)) return n;
        return third;
    }
    // Snap a note into the song's scale (the Dark acid line's turns, written over any root).
    function snap(song, n) {
        const inScale = x => song.scale.includes(((pcOf(x) - song.tonic) % 12 + 12) % 12);
        return inScale(n) ? n : inScale(n - 1) ? n - 1 : n + 1;
    }
    // Bass patterns: 16 characters a bar. '.' rest, r root, o its octave, f the fifth, d the fifth below,
    // t the chord's third (sus chords: their 4th or 2nd), s the seventh below the root (a walk-up).
    function bassAt(song, s, ch) {
        const c = song.bass[s];
        if (!c || c === '.') return 0;
        return ch.root + ({ r: 0, o: 12, f: 7, d: -5, t: ch.third, s: -2 }[c] ?? 0);
    }
    // The old form every song shared (the tracks not yet rewritten play it): eight bars a section; the breakdown
    // loses its drums for six bars and its bass for four.
    const LEGACY_FORM = [
        ['intro', 8, { mel: null }], ['A', 8], ['B', 8], ['A', 8],
        ['break', 4, { mel: 'A', melGain: 0.6, drums: 'none', bassOn: false, fill: false }], ['break', 2, { mel: 'A', melGain: 0.6, drums: 'none', fill: false, entry: false, from: 4 }],
        ['break', 2, { mel: 'A', melGain: 0.6, entry: false, from: 6 }],
        ['B', 8], ['A2', 8, { mel: 'A', harm: true }], ['out', 8, { mel: null }]
    ];
    const byName = (v, fallback) => (v && typeof v === 'object' && !Array.isArray(v) ? v : { A: v ?? fallback });
    function buildSong(def, st = {}) {
        const song = { tonic: 0, oct: 0, lvl: 1, acid: 1, ...def };
        song.prog = {};
        for (const [key, names] of Object.entries(byName(def.chords))) {
            if (!Array.isArray(names) || !names.length) throw new Error('chords ' + key + ' are missing');
            let prev = null, hold = 69, bell = 69;
            song.prog[key] = names.map(name => {
                const c = parseChord(name);
                c.v = voiceChord(c, prev);
                prev = c.v;
                // Simple sounds' held note: the chord tone nearest the last one, E4 to E5 (no wrong notes).
                const tones = [];
                for (let n = 52; n <= 88; n++) if (c.iv.some(x => (c.pc + x) % 12 === pcOf(n))) tones.push(n);
                const near = (lo, hi, to) => tones.filter(n => n >= lo && n <= hi).sort((a, b) => Math.abs(a - to) - Math.abs(b - to))[0];
                c.hold = hold = near(64, 76, hold);
                c.bell = bell = near(64, 76, bell);       // Ominous's bell tolls a chord tone
                return c;
            });
        }
        song.chords = song.prog.A || Object.values(song.prog)[0];
        song.bassBy = byName(def.bass, 'r.......r.......');
        song.compBy = byName(def.comp, []);
        for (const [k, p] of Object.entries(song.bassBy)) if (typeof p !== 'string' || p.length !== 16) throw new Error(`bass ${k}: 16 characters a bar, not "${p}"`);
        song.bass = song.bassBy.A || Object.values(song.bassBy)[0];
        song.comp = song.compBy.A || Object.values(song.compBy)[0];
        const mels = def.mel || { A: def.melA, B: def.melB };
        song.mel = {};
        for (const [k, str] of Object.entries(mels)) {
            if (typeof str !== 'string') throw new Error('melody ' + k + ' is missing');
            try { song.mel[k] = parseMelody(str); } catch (e) { throw new Error(`melody ${k}: ${e.message}`); }
        }
        let start = 0;
        const form = def.form || st.form || LEGACY_FORM;
        if (!Array.isArray(form) || !form.length) throw new Error('an empty form');
        song.form = form.map(row => {
            const [name, bars, o = {}] = Array.isArray(row) ? row : [row.name, row.bars, row];
            if (!(bars > 0) || bars % 1) throw new Error(`section ${name}: ${bars} bars`);
            const sec = { name, bars, start, mel: 'mel' in o ? o.mel : (song.mel[name] ? name : null), chords: o.chords || 'A', bass: o.bass || (song.bassBy[o.chords] ? o.chords : 'A'),
                comp: o.comp || (song.compBy[o.chords] ? o.chords : 'A'), drums: o.drums || 'full', bassOn: o.bassOn !== false, melGain: o.melGain ?? 1, harm: !!o.harm,
                lift: o.lift || 0, entry: o.entry !== false, fill: o.fill !== false, from: o.from || 0 };
            if (sec.mel != null && !song.mel[sec.mel]) throw new Error(`section ${name}: no melody "${sec.mel}"`);
            for (const [what, table] of [['chords', song.prog], ['bass', song.bassBy], ['comp', song.compBy]])
                if (!table[sec[what]]) { if (what === 'chords' || o[what]) throw new Error(`section ${name}: no ${what} "${sec[what]}"`); sec[what] = Object.keys(table)[0]; }
            if (!['full', 'sparse', 'none'].includes(sec.drums)) throw new Error(`section ${name}: drums "${sec.drums}"`);
            start += bars;
            return sec;
        });
        song.bars = start;
        return song;
    }
    const sectionAt = (song, bar) => song.form.find(x => bar < x.start + x.bars) || song.form[song.form.length - 1];
    // Where a song may be picked up again: the start of the section, or of the last one before it that is an entry.
    function entryAt(song, bar) {
        let i = song.form.indexOf(sectionAt(song, bar));
        while (i > 0 && !song.form[i].entry) i--;
        return song.form[i].start;
    }

    const SONGS = {};        // each track's songs: music/<theme>.js
    const songFor = { lab: 0, server: 0, snare: 0 };   // which of the area's songs plays next
    const AREAS = Object.keys(songFor);

    // Each step gets `c`: { song, chord, next (the next bar's chord), bar (in the song), sec (the section's name),
    // section, barIn (in the section), last (its last bar), mel (a melody note starting now: { n, len, harm, t }),
    // melGain, harmGain, drums (false: none of the kit), sparse (only the track's sparse kit), bassOn, comp, len
    // (a step, s), sw (this step's swing, s), trip(i) (the i-th triplet 8th of a beat, s), pick(n, salt) (a choice
    // 0…n-1 that is the same every time this bar of this song comes round: bounded variation) }.
    let style = 'classic';
    const STYLES = {};       // each track's instruments: music/<theme>.js (built below, "The themes")
    // Packet Snare's songs are stealth versions of each track: until you're spotted their kick plays its own sparse
    // pattern (`kick`: 'x' a kick, 'o' a softer one), hushed (`hush`), and crossfades into the track's own as the
    // clap's layer comes in (the busier the field and the lower your Focus, the more of it); a quiet clock ticks
    // (`tick`, the same marks) and hides under the 16th hats as they arrive; the whole mix sits under a closed
    // filter at rest (`cut`) that opens with the intensity. `kickLevel` is the kick's level on a step (0: none).
    // A section with no drums has no kick, in the simple version too.
    function kickLevel(c, s, on) {
        if (!c.drums) return 0;
        const p = c.song.kick;
        if (!p) return on ? 1 : 0;
        const hid = (p[s] === 'x' ? 1 : p[s] === 'o' ? 0.6 : 0) * (c.song.hush ?? 1);
        const g = hid * (1 - c.spot) + (on ? c.spot : 0);
        return g > 0.02 ? g : 0;
    }
    function stealthStep(t, s, k, len, L, c) {
        const m = c.song.tick?.[s];
        if (!m || m === '.' || !c.drums) return;
        hat(t, (m === 'x' ? 1 : 0.55) * 0.05 * (styleOf().tick ?? 1) * (1 - 0.7 * L.sixteenth), 0.014);
    }

    // Simple sounds: each song stripped to its bones, in its key: a kick (`simpleKick` on the style says where:
    // every beat unless it says otherwise), the bass on beats 1 and 3 on the chord's root, one held chord tone each
    // bar (voice-led, so it never rubs), and the melody in a plain sine (Retro: a square), all in the track's
    // plain voice; no hats, claps, chords, arpeggios, fills, sends or drive.
    function simpleStep(st, t, s, k, len, c, L) {
        const sv = st.simpleVoice || 'triangle';
        const kg = kickLevel(c, s, s % (st.simpleKick || (st === STYLES.ominous ? 8 : 4)) === 0);
        if (kg) kick(t, 0.38 * kg, 130, 45, 0.22);
        if (c.bassOn && (s === 0 || s === 8)) synth(t, c.chord.root + 12, len * 6, 0.16, sv, 700, 1);
        if (L.pad > 0.02 && s === 0) synth(t, c.chord.hold, len * 14, 0.035 * L.pad, 'sine', 3000, 1);
        if (c.mel) synth(c.mel.t, c.mel.n, Math.min(len * c.mel.len * 0.9, 0.7), 0.03 * c.melGain * (sv === 'square' ? 0.5 : 1), sv === 'square' ? 'square' : 'sine', 2500, 1);
    }

    // The bus level for the music volume, and each track's trim (`gain` on the style), all measured to the same
    // loudness (tools/audio; re-measure if a track changes).
    const musicLevel = () => musicVolume * 0.55;
    const styleTrim = () => { const st = styleOf(); return (simple ? st.simpleMix?.gain : st.gain) || 1; };
    // Changing track: tracks differ in tempo, so the old one fades out and the new one starts on a beat of its own
    // (the game calls `musicState` every tick, which starts it), never two grooves at once.
    function setMusicStyle(name) {
        if (!STYLES[name] || name === style) return;
        chargeStop();
        if (music) stopMusic(0.06);
        style = name;
        if (ctx && !music) tempoNow(bpmOf(null));
    }

    // Layers fade in and out over a couple of bars rather than switching on a threshold: the intensity
    // eases toward the ball's speed (faster on the way up than down), each layer's level ramps across a
    // band around its threshold, and the tempo glides into and out of flow's slow-down.
    // Each track sets where its layers come in (`layers` on the style: name → threshold, below 0 for "always"):
    // the order the parts arrive in is part of what a track is. Tracks without one use the old order.
    const RISE = 1.2, FALL = 3;       // seconds (time constants) for the intensity to follow speed
    const layer = (k, at) => Math.max(0, Math.min(1, (k - at) / 0.2 + 0.5));
    const OLD_LAYERS = { pad: 0.12, off: 0.28, mel: 0.4, clap: 0.52, sixteenth: 0.64, harm: 0.72, arp: 0.82 };
    function levels(st, S) {
        const L = {};
        for (const [k, at] of Object.entries(st.layers || OLD_LAYERS)) L[k] = at < 0 ? 1 : layer(S, at);
        for (const k of Object.keys(OLD_LAYERS)) if (L[k] == null) L[k] = layer(S, OLD_LAYERS[k]);
        return L;
    }
    const songsOf = () => (SONGS[style] || SONGS.classic);
    const areaSongs = a => songsOf()[a] || songsOf().server;
    // On a downbeat (or, when the area changed in a slow song, on a beat: nobody waits four seconds for a room's
    // music): change song if the area changed (the old area's place is kept, to an entry point), after a whole
    // song (the area's next one), or on a debug command. True when the bar grid starts again here.
    function songTurn(s) {
        const m = music;
        const song = m.songs[m.song];
        const bar = Math.floor((m.step - m.songStep) / 16);
        let moved = false;
        if (m.area !== area) {
            m.left[m.area] = { song: m.song, bar: entryAt(song, Math.min(bar, song.bars - 1)) };
            const back = m.left[area];
            m.area = area;
            m.songs = areaSongs(area);
            m.song = (back ? back.song : songFor[area]) % m.songs.length;
            m.songStep = m.step - 16 * (back ? back.bar : 0);
            moved = true;
        } else if (s !== 0) return false;
        else if (m.cmd === 'song' || bar >= song.bars) {
            m.song = songFor[area] = (m.song + 1) % m.songs.length;
            m.songStep = m.step;
            moved = true;
        } else if (m.cmd === 'section') {
            const sec = sectionAt(song, bar);
            m.songStep = m.step - 16 * ((sec.start + sec.bars) % song.bars);
            moved = true;
        }
        m.cmd = null;
        if (moved) {
            m.origin = m.step;
            const bpm = bpmOf(m.songs[m.song]);
            if (bpm !== m.bpm) { m.bpm = bpm; m.jump = true; }     // a new tempo starts on this beat, with no glide
        }
        return moved;
    }
    const hash = (a, b) => { let x = (Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA6B)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D) >>> 0; x ^= x >>> 12; return x / 4294967296; };
    function songContext(s) {
        const m = music, song = m.songs[m.song];
        const bar = Math.max(0, Math.floor((m.step - m.songStep) / 16));
        const i = song.form.indexOf(sectionAt(song, bar)), sec = song.form[i], barIn = bar - sec.start;
        const chords = song.prog[sec.chords];
        const after = song.form[(i + 1) % song.form.length];
        const mel = sec.mel != null ? song.mel[sec.mel] : null;
        const e = mel ? mel[((barIn + sec.from) * 16 + s) % mel.length] : null;
        const chord = chords[(barIn + sec.from) % chords.length];
        // The older tracks read these off the song.
        song.bass = song.bassBy[sec.bass];
        song.comp = song.compBy[sec.comp];
        return {
            song, bar, barIn, sec: sec.name, section: sec, last: barIn === sec.bars - 1, chord,
            next: barIn + 1 < sec.bars ? chords[(barIn + 1 + sec.from) % chords.length] : song.prog[after.chords][after.from % song.prog[after.chords].length],
            mel: e && { n: melNote(song, e), len: e.len, off: e.off, harm: sec.harm ? harmNote(song, e, chord) : 0 },
            melGain: sec.melGain, drums: sec.drums !== 'none', sparse: sec.drums === 'sparse', bassOn: sec.bassOn, comp: song.comp,
            pick: (n, salt = 0) => Math.floor(hash(m.song * 131 + bar, salt) * n)
        };
    }
    function schedule() {
        if (!music || !live() || (!env.offline && document.hidden)) return;
        const now = ctx.currentTime;
        const dt = Math.min(0.5, now - (music.last ?? now));
        music.last = now;
        // Back from a hidden tab or a long stall: pick the song up from now. The steps that were missed are
        // skipped (the song went on while you were away), never scheduled all at once.
        if (music.nextStep < now - 0.3) {
            const k = Math.ceil((now + 0.02 - music.nextStep) / clock.len);
            music.step += k;
            music.nextStep += k * clock.len;
        }
        music.k ??= intensity;
        music.k += (intensity - music.k) * (1 - Math.exp(-dt / (intensity > music.k ? RISE : FALL)));
        const k = music.k;
        const slow = mode === 'flow' || mode === 'freeze';
        const st = styleOf();
        while (music.nextStep < now + 0.12) {
            let s = (((music.step - music.origin) % 16) + 16) % 16;
            if (s === 0 || (music.area !== area && s % 4 === 0 && 16 * clock.len > 2)) { if (songTurn(s)) s = 0; }
            // The tempo glides a step at a time into and out of a slow-down (about a bar to settle); a new song's
            // tempo starts at once.
            const target = stepOf(music.bpm) / (slow ? 0.6 : 1);
            const len = music.jump || Math.abs(clock.len - target) < 1e-4 ? target : clock.len + (target - clock.len) * 0.12;
            music.jump = false;
            if (len !== clock.len) retime(len, music.step, music.nextStep);
            const t = music.nextStep;
            const c = songContext(s);
            // The arrangement builds: what the game has earned (`depth`) and the run's speed (`k`) add up to how
            // many parts play, each fading in over a band; a section may lift or thin it.
            const S = 0.6 * depth + 0.6 * Math.max(0, k - 0.05) + c.section.lift;
            const L = levels(st, S);
            if (s === 0) { (music.chordLog ||= []).push({ t, ch: c.chord }); if (music.chordLog.length > 3) music.chordLog.shift(); }
            // A stealth song's tones stand a little forward while its drums are hushed (`rest`), so it keeps the level.
            c.spot = L.clap;
            const lvl = simple ? c.song.slvl ?? c.song.lvl : c.song.lvl, rest = simple ? c.song.srest ?? c.song.rest : c.song.rest;
            songLvl = lvl * (rest ? 1 + (rest - 1) * (1 - c.spot) : 1);
            c.len = len;
            c.sw = s % 2 ? (c.song.swing ?? st.swing ?? 0) * len : 0;
            c.trip = i => (i * len * 4) / 3;
            c.harmGain = L.harm;
            // The melody waits for its layer; the harmony fades in with its own (the older tracks switch it).
            if (c.mel && L.mel <= 0.02) c.mel = null;
            if (c.mel) {
                c.melGain *= L.mel;
                c.mel.t = t + c.mel.off * len + (c.mel.off ? 0 : c.sw);
                if (!st.layers && L.harm < 0.5) c.mel.harm = 0;
            }
            c.fill = c.last && c.section.fill && c.drums && (st.fillAt != null ? S >= st.fillAt : L.off > 0.5);
            try {
                if (simple) simpleStep(st, t, s, k, len, c, L);
                else {
                    st.step(t, s, k, len, L, c);
                    if (c.song.tick) stealthStep(t, s, k, len, L, c);
                    // A section ends in the track's fill, so the song phrases instead of repeating one bar for ever.
                    if (st.fill && c.fill && s >= 12) st.fill(t, s, k, len, L, c);
                }
            } catch (e) { fault(`music ${style} "${c.song.name || ''}" ${c.sec} bar ${c.barIn + 1} step ${s}`, e); }   // a bad note never stops the music
            songLvl = 1;
            music.nextStep += len;
            music.step++;
        }
        // The mood: muffled in flow and bullet time, distorted in a crunch, opening up with speed. A swell owns
        // the filter until it has landed (`music.hold`).
        const cut = music.songs[music.song]?.cut;
        const cutoff = slow ? 600 : st.cutoff(k) * (cut ? cut + (1 - cut) * k : 1);
        if (!(music.hold > now)) music.filter.frequency.setTargetAtTime(cutoff, now, slow ? 0.6 : 0.5);
        music.wet.gain.setTargetAtTime(mode === 'crunch' ? 0.55 : simple ? 0 : st.drive || 0, now, 0.15);
        music.dry.gain.setTargetAtTime(mode === 'crunch' ? 0.6 : 1, now, 0.15);
        if (music.space.delay) music.space.delay.delayTime.setTargetAtTime(music.space.steps * clock.len, now, 0.2);
    }

    // Where the player is (game.js): 'lab' (the lab, Surveillance, R&D), 'server' (the server room and its bays) or
    // 'snare' (Packet Snare's bay); anything else is the lab. The music changes song on the next bar.
    function setArea(a) { area = AREAS.includes(a) ? a : 'lab'; }
    function setDepth(d) { depth = Math.max(0, Math.min(1, Number(d) || 0)); }
    // What's playing (the debug panel), and debug commands on the next downbeat: the area's next song, or the
    // next section.
    function songNow() {
        if (!music) return null;
        const song = music.songs[music.song], bar = Math.max(0, Math.floor((music.step - music.songStep) / 16)), sec = sectionAt(song, bar);
        return { area: music.area, song: music.song + 1, of: music.songs.length, name: song.name || null, section: sec.name, bar: bar - sec.start + 1, bars: sec.bars, bpm: music.bpm, voices: voices.music };
    }
    function songCmd(cmd) { if (music) music.cmd = cmd; }

    // The ball's speed (0-1), and the power-up shaping the beat, from game.js.
    function musicState(k, m = null) {
        intensity = Math.max(0, Math.min(1, Number(k) || 0));
        mode = m;
        if (musicVolume > 0 && (live() || (env.offline && ensure()))) startMusic();
    }

    // A breakthrough: a rising swell into the filter, then a crash on the next beat.
    function swell() {
        if (!music) return;
        const now = ctx.currentTime;
        const hit = nextStep(4, 0.45).t;            // the crash lands on a beat, half a second or so away
        music.hold = hit + 0.3;                     // the swell owns the filter until it has landed
        music.filter.frequency.cancelScheduledValues(now);
        music.filter.frequency.setValueAtTime(music.filter.frequency.value, now);
        music.filter.frequency.exponentialRampToValueAtTime(14000, hit);
        music.bus.gain.setTargetAtTime(musicLevel() * 1.55, now, 0.15);
        music.bus.gain.setTargetAtTime(musicLevel(), hit + 0.3, 0.4);
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.setValueAtTime(400, now);
            f.frequency.exponentialRampToValueAtTime(6000, hit);
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(0.25, hit - 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, hit + 0.8);
            src.connect(f).connect(g);
            src.start(now);
            src.stop(hit + 0.9);
        });
        kick(hit, 0.7);
        hat(hit, 0.2, 0.6);
        synth(hit, 33, 0.8, 0.2, 'sawtooth', 900);
    }

    // The music's parts, each 0-1 (Settings → Music: Beat and Tones, per device).
    const musicMix = { beat: 1, tones: 1 };
    // A part's level: the player's slider times the track's balance (`beat`/`tones` on the style, measured).
    // The beat (kick, hats, claps, fills) plays only while training (`setTraining`, `policy`); everywhere else
    // the music is its tones alone.
    const partLevel = k => { const st = styleOf(); return musicMix[k] * ((simple ? st.simpleMix?.[k] : st[k]) ?? 1) * (k === 'beat' && !training && !policy.beatAlways ? 0 : 1); };
    // Set the parts' faders, and their sends with them.
    function setParts(time = 0.05, only = null) {
        if (!music) return;
        for (const k of Object.keys(musicMix)) {
            if (only && k !== only) continue;
            const v = Math.max(0.0001, partLevel(k));
            music.parts[k].gain.setTargetAtTime(v, ctx.currentTime, time);
            for (const g of Object.values(music.sendIn[k])) g.gain.setTargetAtTime(v, ctx.currentTime, time);
        }
    }
    function setMusicMix(m) {
        for (const k of Object.keys(musicMix)) if (m && m[k] != null) musicMix[k] = Math.max(0, Math.min(1, Number(m[k]) || 0));
        setParts(0.05);
    }
    // In the training run view (game.js): the beat comes in over about a bar, and leaves the same way.
    function setTraining(on) {
        on = !!on;
        if (on === training) return;
        training = on;
        setParts(0.6, 'beat');
    }

    function setMusic(v) {
        musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
        if (musicVolume <= 0) return stopMusic();
        if (music) music.bus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05);
    }

    // Simple sounds on or off: the music's levels follow (the simple tracks have their own balance).
    function setSimple(v) {
        simple = !!v;
        chargeStop();
        if (music) {
            music.trim.gain.setTargetAtTime(styleTrim(), ctx.currentTime, 0.2);
            setParts(0.2);
        }
    }

    // ---- The themes ----------------------------------------------------------------------------------------
    // Each track lives in music/<theme>.js: a function of this toolkit that returns its key, profile, levels,
    // instruments (`style`), songs and sound effects. Built here, once everything they use exists.
    const H = { note, perc, MIXO, LYD, harmNote, stepOf, voices, tone, noise, NOTE, T, seq, S, blip, arp, echo, stab, sub, bell, pluck, run, vary, mapNote, degShift, PANEL_INST, PANEL_OCT, phone, PHONE, clickNote, catchNotes, lastAt, raceNote, ping, kick, hat, clap, synth, pad, riser, bassAt, snap, kickLevel, AEOL, PHRY, DOR, HARM, ION, varDeg: () => varDeg };
    for (const [name, make] of Object.entries(window.SFXThemes || {})) {
        const th = make(H);
        KEYS[name] = th.key; PROFILES[name] = th.profile; SIMPLE_VOICE[name] = th.simpleVoice;
        SFX_TRIM[name] = th.trims.sfx; SIMPLE_TRIM[name] = th.trims.simple;
        BASE_TRIM[name] = th.trims.base; BASE_TRIM['s:' + name] = th.trims.baseSimple;
        CHARGE_TRIM[name] = th.trims.charge; CHARGE_TRIM['s:' + name] = th.trims.chargeSimple;
        SNARE_TRIM[name] = th.trims.snare; SNARE_TRIM['s:' + name] = th.trims.snareSimple;
        STYLES[name] = th.style; TRACK_SOUNDS[name] = th.sounds;
        SONGS[name] = {};
        for (const a of Object.keys(th.songs)) {
            // A song that can't be built says which and why, and is left out: the others play.
            SONGS[name][a] = th.songs[a].map((def, i) => {
                try { return buildSong(def, th.style); } catch (e) { fault(`song ${name}/${a} ${i + 1}${def.name ? ' "' + def.name + '"' : ''}`, e); return null; }
            }).filter(Boolean);
            if (!SONGS[name][a].length) delete SONGS[name][a];
        }
    }

    return { tick, setPolicy, get voices() { return { ...voices }; }, get context() { return ctx; }, get faults() { return { ...faults }; }, get sounds() { return Object.keys(SOUNDS); }, play, held, setArea, setDepth, setTraining, songCmd, get song() { return songNow(); }, setMusicMix, get musicMix() { return { ...musicMix }; }, setMix, setSimple, get mix() { return { ...mix }; }, get simple() { return simple; }, setMusicStyle, MUSIC_STYLES: ['classic', 'dark', 'soft', 'ominous', 'retro'], get musicStyle() { return style; }, charge, chargeStop, setVolume, setMusic, musicState, swell, get volume() { return volume; }, get state() { return ctx ? ctx.state : 'none'; }, get playing() { return !!music; }, get musicVolume() { return musicVolume; } };
    }
})();
