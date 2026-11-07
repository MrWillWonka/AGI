// sfx.js — sound effects, synthesised with Web Audio (no files, no dependencies).
// window.SFX.play(name, opts) for one-shots; SFX.charge(level) / SFX.chargeStop() for the held sprint meter.
// Silent until the first user gesture (browsers block audio before one) and at volume 0.
(function () {
    'use strict';

    let ctx = null;
    let master = null;
    let out = null;             // the compressor everything ends in (music joins here, apart from the sounds' volume)
    let volume = 0.5;
    const last = {};            // name -> time last played, to thin out rapid repeats
    let chargeOsc = null;

    function ensure() {
        if (ctx || (volume <= 0 && musicVolume <= 0)) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = volume * 0.6;
        // A gentle compressor keeps stacked effects from clipping.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 6;
        master.connect(comp).connect(ctx.destination);
        out = comp;
        retime(STEP, 0, ctx.currentTime);
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
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, unlock, { capture: true, passive: true }));
    // Back from the background (a phone call, another app): resume on the next gesture, and try at once.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });

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
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    let noiseBuf = null;
    // Filtered noise: whooshes, dust, impacts.
    function noise({ dur = 0.3, gain = 0.25, f0 = 800, f1 = f0, q = 1, type = 'bandpass', at = 0, attack = 0.01 }) {
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
        src.connect(f).connect(g).connect(master);
        src.start(t);
        src.stop(t + dur + 0.05);
    }

    const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz

    // ---- The clock: one 124 BPM grid for the music and the sounds -------------------------------------
    // Step n (a 16th note) plays at t0 + (n - n0) × len on the audio clock. The music schedules on it, and
    // stingers wait for its next 16th or 8th (`q` in `play`), so they land in time with the track; feedback
    // that must feel instant (clicks, sprints, impacts) plays at once but takes its pitch from the bar.
    // Everything is in the track's key, A minor, mostly its pentatonic (A C D E G), which never clashes.
    const BPM = 124;
    const STEP = 60 / BPM / 4;                      // a 16th note, 0.121 s
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
    const KEYS = {
        classic: null,                                          // A minor pentatonic, as written
        dark: { root: 52, set: [0, 1, 3, 7, 8] },               // E Phrygian: E F G B C
        soft: { root: 53, set: [0, 2, 4, 7, 9] },               // F major pentatonic: F G A C D
        ominous: { root: 60, set: [0, 1, 3, 6, 7] },            // C with its flat second and tritone: C Db Eb F# G
        retro: { root: 60, set: [0, 2, 4, 7, 9] }               // C major pentatonic: C D E G A
    };
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
    const PROFILES = {
        classic: null,
        // Dark: saws an octave down through a drive, a closed filter.
        dark: { wave: t => ({ triangle: 'sawtooth', sine: 'triangle', square: 'sawtooth' })[t] || t, oct: -1, cut: 0.7, lp: 2400, gain: 0.8, drive: true,
            noise: n => ({ ...n, gain: n.gain * 1.1, f0: n.f0 * 0.8, f1: n.f1 * 0.8 }) },
        // Soft: rounded triangles, a slower attack, a darker filter, a little longer.
        soft: { wave: t => (t === 'square' || t === 'sawtooth' ? 'triangle' : t), cut: 0.55, lp: 2200, gain: 0.85, len: 1.25, attack: 0.012,
            noise: n => ({ ...n, gain: n.gain * 0.7 }) },
        // Ominous: an octave down, slow swells with a long tail and a detuned shadow, each answered by an echo.
        ominous: { wave: t => (t === 'square' ? 'triangle' : t), oct: -1, cut: 0.45, lp: 1600, gain: 0.9, len: 1.7, attack: 0.02, detune: -14, echo: 0.3,
            noise: n => ({ ...n, dur: n.dur * 1.4, f0: n.f0 * 0.6, f1: n.f1 * 0.6 }) },
        // Retro: raw square waves (a triangle for the low end), short, with chip-style stepped slides.
        retro: { wave: (t, f) => (f < 200 ? 'triangle' : 'square'), raw: true, gain: 0.45, len: 0.75, steps: true,
            noise: n => ({ ...n, dur: n.dur * 0.6 }) }
    };
    const S = () => (clock ? clock.len : STEP);     // one 16th at the current tempo

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
    const PHONE = !!window.matchMedia?.('(pointer: coarse)').matches;
    const CLICK_NOTES = {
        cp: [69, 64, 67, 64, 72, 64, 67, 62],       // compute: round, round A4
        dp: [81, 76, 79, 76, 84, 76, 79, 74],       // data: a bright figure an octave up
        rp: [88, 84, 86, 81, 91, 84, 86, 79]        // research: up high, bell-like
    };

    // A different variation from last time: `vary(key, n)` never returns the same index twice running.
    const lastVar = {};
    function vary(key, n) {
        let i = Math.floor(Math.random() * n);
        if (n > 1 && i === lastVar[key]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
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
        const i = clock ? Math.floor(Math.round(stepAt(startAt ?? ctx.currentTime + base)) / 2) % 8 : 0;
        return notes[(i + 8) % 8];
    }

    const SOUNDS = {
        // Workbench jobs: a note on the bar's current 8th (a hold lands on the 8ths: see holdDelay). Compute a
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

    // Dark: industrial: distorted saws, metal hits, sub drops, flat seconds (E Phrygian).
    const metal = (gain = 0.05, at = 0, f = 3200) => noise({ dur: 0.04, gain, f0: f, q: 9, at });
    const saw = (n, o = {}) => T(n, { type: 'sawtooth', dur: 0.12, gain: 0.05, cutoff: 1500, q: 6, drive: true, ...o });
    // Soft: mallets and bells: a marimba, a kalimba, glassy bells and a warm pad (F major pentatonic).
    const marimba = (n, o = {}) => { T(n, { type: 'sine', dur: 0.25, gain: 0.07, ...o }); T(n + 24, { type: 'sine', dur: 0.05, gain: (o.gain ?? 0.07) * 0.22, at: o.at }); };
    const softBell = (n, o = {}) => { T(n, { type: 'sine', dur: 0.7, gain: 0.05, attack: 0.008, ...o }); T(n + 12, { type: 'triangle', dur: 0.25, gain: (o.gain ?? 0.05) * 0.25, at: o.at }); };
    const padChord = (notes, o = {}) => notes.forEach(n => T(n, { type: 'triangle', dur: 1.4, gain: 0.025, attack: 0.15, cutoff: 1800, ...o }));
    // Ominous: tolling bells with an inharmonic partial, knocks, reversed swells, drones (C, b2, tritone).
    const toll = (n, o = {}) => {
        T(n, { type: 'sine', dur: 1.6, gain: 0.06, ...o });
        tone({ f0: NOTE(mapNote(degShift(n, varDeg))) * 2.76, dur: 0.6, type: 'sine', gain: (o.gain ?? 0.06) * 0.25, at: o.at, raw: true });
    };
    const knock = (n, o = {}) => { T(n, { type: 'triangle', dur: 0.09, gain: 0.07, cutoff: 900, ...o }); noise({ dur: 0.05, gain: 0.03, f0: 700, q: 3, at: o.at }); };
    const swellUp = (dur, gain) => noise({ dur, gain, f0: 300, f1: 2400, type: 'lowpass', attack: dur * 0.85 });
    // Retro: an 8-bit console: square pulses, a triangle bass, noise drums, stepped slides (C major pentatonic).
    const sq = (n, o = {}) => T(n, { type: 'square', dur: 0.07, gain: 0.03, ...o });
    const tri = (n, o = {}) => T(n, { type: 'triangle', dur: 0.12, gain: 0.08, ...o });
    const chipNoise = (dur, gain, at = 0) => noise({ dur, gain, f0: 6000, type: 'highpass', at });
    // Packet Snare: a catch's notes, two to six by the loop's multiplier, low down (a pocket, not a prompt).
    const catchNotes = mult => [57, 60, 62, 64, 67, 69].slice(0, 2 + Math.min(4, Math.round((mult - 1) * 1.5)));
    const lastAt = notes => (notes.length - 1) * S() / 2;
    // A held-open loop's ticks climb the scale, a degree a step (snareRace, never varied, so the climb holds).
    const raceNote = step => degShift(69, Math.max(0, Math.min(8, Math.round(Number(step) || 0))));
    // An inharmonic partial `mult` times a note (a metal ring), kept in the play's variation and the track's key.
    const ping = (n, mult, o = {}) => tone({ f0: NOTE(mapNote(degShift(n, varDeg))) * mult, type: 'sine', dur: 0.2, gain: 0.02, ...o, raw: true });

    // Each track's sound set, levelled to Classic's loudness (measured with a K-weighted meter, like the music).
    const SFX_TRIM = { classic: 1, dark: 1.29, soft: 1.21, ominous: 0.81, retro: 2.1 };
    const SIMPLE_TRIM = { classic: 2.33, dark: 4.65, soft: 1.56, ominous: 1.37, retro: 4.17 };   // the simple sets, levelled the same way

    // Packet Snare's effects, levelled per track (and simple version) against that track's own effects, measured
    // K-weighted (the peak 100 ms, averaged over four plays, against the mean of 17 existing effects): a catch, a
    // placement and a broken decoy at the clicks' level, a spoil, a snap and a hit on the boss 1.5 dB over, your
    // laser, a turret's zap and a chain 3.5 dB under (they come often, by themselves), the sweep's warning 3.5 dB
    // over, the boss locking on and the powers 4 dB over and the boss 5.5 dB over. The second wave the same way: a sloppy
    // flick's flag at the clicks' level; a quarantine, a stun, a core appearing, a parry, a slash, a spoof, a garbage
    // collection, a hijack, a rebuild and a herder knocked out 1.5 dB over; a hijacked Antivirus or partner taking packets
    // and a held loop's ticks 3.5 dB under; the IDS alarm 3.5 dB over and the boss beaten 5.5 dB over (an option's
    // variations, partner, down, step, flags, averaged). Keys `name` or `name:kind`.
    const SNARE_TRIM = {
        classic: { snareCatch: 1.81, snareSpoil: 1.55, snareSnap: 0.95, snareLaser: 1.49, snareChain: 3.39, snareSweep: 2.47, snareCharge: 2.21, snareBoss: 1.02, snareHit: 2.24, 'snarePlace:wall': 0.87, 'snarePlace:decoy': 2.35, 'snarePlace:turret': 2.05, 'snarePlace:tower': 0.58, snareRemove: 2.07, 'snarePower:freeze': 0.5, 'snarePower:purge': 1.64, snareZap: 1.73, snareDecoy: 1.54, snareQuarantine: 1.17, snareStun: 1.27, snareCore: 0.5, snareBossDown: 0.58, snareParry: 2.4, snareSlash: 3.13, snareSpoof: 2.66, snareGarbage: 1.56, snareRace: 2.67, snareHijack: 2.07, snareTaken: 4.32, snareFlag: 2.14, snareIds: 1.23, snareRebuild: 1.43, snareHerdStun: 2.09 },
        dark: { snareCatch: 1.39, snareSpoil: 0.68, snareSnap: 0.86, snareLaser: 1.55, snareChain: 5.41, snareSweep: 1.21, snareCharge: 0.48, snareBoss: 0.67, snareHit: 2.11, 'snarePlace:wall': 0.54, 'snarePlace:decoy': 3.05, 'snarePlace:turret': 2.13, 'snarePlace:tower': 0.77, snareRemove: 1.4, 'snarePower:freeze': 0.41, 'snarePower:purge': 1.05, snareZap: 1.79, snareDecoy: 1.88, snareQuarantine: 0.69, snareStun: 0.63, snareCore: 0.55, snareBossDown: 0.48, snareParry: 1.82, snareSlash: 2.08, snareSpoof: 1.98, snareGarbage: 0.48, snareRace: 3.8, snareHijack: 2.12, snareTaken: 3.14, snareFlag: 1.81, snareIds: 0.77, snareRebuild: 0.71, snareHerdStun: 1.79 },
        soft: { snareCatch: 1.37, snareSpoil: 0.6, snareSnap: 1.16, snareLaser: 1.77, snareChain: 1.77, snareSweep: 1.59, snareCharge: 2.67, snareBoss: 0.97, snareHit: 1.22, 'snarePlace:wall': 0.74, 'snarePlace:decoy': 1.59, 'snarePlace:turret': 2.01, 'snarePlace:tower': 0.96, snareRemove: 1.53, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.39, snareZap: 2, snareDecoy: 1.72, snareQuarantine: 0.85, snareStun: 0.8, snareCore: 0.54, snareBossDown: 0.71, snareParry: 1.43, snareSlash: 2.27, snareSpoof: 1.68, snareGarbage: 1.11, snareRace: 3.14, snareHijack: 1.27, snareTaken: 4.12, snareFlag: 2.3, snareIds: 1.11, snareRebuild: 0.76, snareHerdStun: 1.57 },
        ominous: { snareCatch: 1.58, snareSpoil: 2.14, snareSnap: 1.86, snareLaser: 1.64, snareChain: 8.85, snareSweep: 1.39, snareCharge: 3.01, snareBoss: 0.88, snareHit: 1.27, 'snarePlace:wall': 0.96, 'snarePlace:decoy': 1.96, 'snarePlace:turret': 1.81, 'snarePlace:tower': 0.79, snareRemove: 1.54, 'snarePower:freeze': 0.86, 'snarePower:purge': 1.22, snareZap: 2.3, snareDecoy: 1.59, snareQuarantine: 1.14, snareStun: 1.32, snareCore: 0.9, snareBossDown: 0.59, snareParry: 1.87, snareSlash: 2.19, snareSpoof: 2.8, snareGarbage: 1.74, snareRace: 2.48, snareHijack: 2.64, snareTaken: 4.04, snareFlag: 2.27, snareIds: 0.93, snareRebuild: 1.79, snareHerdStun: 2.1 },
        retro: { snareCatch: 0.71, snareSpoil: 0.91, snareSnap: 0.7, snareLaser: 1.48, snareChain: 1.31, snareSweep: 2.33, snareCharge: 1.37, snareBoss: 0.99, snareHit: 0.82, 'snarePlace:wall': 0.55, 'snarePlace:decoy': 2.77, 'snarePlace:turret': 2.03, 'snarePlace:tower': 0.49, snareRemove: 1.73, 'snarePower:freeze': 0.46, 'snarePower:purge': 0.91, snareZap: 1.3, snareDecoy: 1.01, snareQuarantine: 0.63, snareStun: 0.76, snareCore: 0.53, snareBossDown: 0.44, snareParry: 1.66, snareSlash: 0.92, snareSpoof: 1.93, snareGarbage: 0.54, snareRace: 3.43, snareHijack: 1.04, snareTaken: 3.23, snareFlag: 2.19, snareIds: 0.68, snareRebuild: 0.85, snareHerdStun: 1.53 },
        's:classic': { snareCatch: 1.06, snareSpoil: 1.02, snareSnap: 1.52, snareLaser: 3.42, snareChain: 2.01, snareSweep: 2.69, snareCharge: 1.41, snareBoss: 1.24, snareHit: 1.04, 'snarePlace:wall': 1.34, 'snarePlace:decoy': 1.32, 'snarePlace:turret': 1.37, 'snarePlace:tower': 1.36, snareRemove: 1.25, 'snarePower:freeze': 1.05, 'snarePower:purge': 1.26, snareZap: 1.55, snareDecoy: 1.54, snareQuarantine: 1.2, snareStun: 1.15, snareCore: 0.76, snareBossDown: 0.61, snareParry: 2.67, snareSlash: 1.75, snareSpoof: 2.08, snareGarbage: 1.36, snareRace: 2.55, snareHijack: 2.1, snareTaken: 4.09, snareFlag: 1.75, snareIds: 2, snareRebuild: 1.57, snareHerdStun: 1.43 },
        's:dark': { snareCatch: 0.98, snareSpoil: 1.03, snareSnap: 2.08, snareLaser: 2.2, snareChain: 1.82, snareSweep: 2.46, snareCharge: 1.31, snareBoss: 1.43, snareHit: 0.98, 'snarePlace:wall': 1.3, 'snarePlace:decoy': 1.29, 'snarePlace:turret': 1.26, 'snarePlace:tower': 1.32, snareRemove: 1.23, 'snarePower:freeze': 1.06, 'snarePower:purge': 1.35, snareZap: 1.63, snareDecoy: 1.5, snareQuarantine: 1.12, snareStun: 1.28, snareCore: 0.82, snareBossDown: 0.69, snareParry: 2.48, snareSlash: 1.66, snareSpoof: 1.97, snareGarbage: 1.87, snareRace: 2.53, snareHijack: 2.02, snareTaken: 3.88, snareFlag: 1.77, snareIds: 1.94, snareRebuild: 1.51, snareHerdStun: 1.38 },
        's:soft': { snareCatch: 0.98, snareSpoil: 0.9, snareSnap: 1.65, snareLaser: 1.94, snareChain: 1.69, snareSweep: 2.5, snareCharge: 1.25, snareBoss: 1.36, snareHit: 0.9, 'snarePlace:wall': 1.19, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.25, 'snarePlace:tower': 1.29, snareRemove: 1.19, 'snarePower:freeze': 1.03, 'snarePower:purge': 1.37, snareZap: 1.66, snareDecoy: 1.55, snareQuarantine: 1.13, snareStun: 1.17, snareCore: 0.88, snareBossDown: 0.68, snareParry: 2.45, snareSlash: 1.62, snareSpoof: 1.78, snareGarbage: 1.62, snareRace: 2.59, snareHijack: 2.15, snareTaken: 4.06, snareFlag: 1.66, snareIds: 1.92, snareRebuild: 1.56, snareHerdStun: 1.38 },
        's:ominous': { snareCatch: 0.9, snareSpoil: 1.06, snareSnap: 2.48, snareLaser: 2.17, snareChain: 1.8, snareSweep: 2.25, snareCharge: 1.23, snareBoss: 2.28, snareHit: 0.88, 'snarePlace:wall': 1.16, 'snarePlace:decoy': 1.24, 'snarePlace:turret': 1.14, 'snarePlace:tower': 1.18, snareRemove: 1.09, 'snarePower:freeze': 1.18, 'snarePower:purge': 1.4, snareZap: 1.68, snareDecoy: 1.49, snareQuarantine: 1.04, snareStun: 1.38, snareCore: 1.44, snareBossDown: 0.83, snareParry: 2.41, snareSlash: 1.53, snareSpoof: 1.71, snareGarbage: 2.25, snareRace: 2.47, snareHijack: 2.06, snareTaken: 3.91, snareFlag: 1.53, snareIds: 1.8, snareRebuild: 1.4, snareHerdStun: 1.27 },
        's:retro': { snareCatch: 1.06, snareSpoil: 1.05, snareSnap: 1.5, snareLaser: 2.02, snareChain: 1.68, snareSweep: 2.71, snareCharge: 1.43, snareBoss: 1.21, snareHit: 1.06, 'snarePlace:wall': 1.37, 'snarePlace:decoy': 1.3, 'snarePlace:turret': 1.38, 'snarePlace:tower': 1.35, snareRemove: 1.25, 'snarePower:freeze': 0.95, 'snarePower:purge': 1.28, snareZap: 1.65, snareDecoy: 1.53, snareQuarantine: 1.22, snareStun: 1.18, snareCore: 0.73, snareBossDown: 0.62, snareParry: 2.43, snareSlash: 1.78, snareSpoof: 2.11, snareGarbage: 1.34, snareRace: 2.58, snareHijack: 2.17, snareTaken: 4.03, snareFlag: 1.76, snareIds: 1.97, snareRebuild: 1.57, snareHerdStun: 1.43 }
    };
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
    const TRACK_SOUNDS = {
        classic: {
            // Dub techno, quiet: muted saw plucks, filtered square blips, sub thumps, a delay throw.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'sawtooth', dur: 0.07, gain: 0.06, cutoff: 900 + 250 * i, q: 7, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.04, gain: 0.035, at: lastAt(f) }); noise({ dur: 0.015, gain: 0.04, f0: 6000, q: 3 }); },
            snareSpoil: () => { T(52, { to: 45, type: 'sawtooth', dur: 0.28, gain: 0.05, cutoff: 700, q: 4, detune: -20 }); T(53, { to: 46, type: 'sawtooth', dur: 0.28, gain: 0.04, cutoff: 700, q: 4 }); noise({ dur: 0.12, gain: 0.07, f0: 300, type: 'lowpass' }); },
            snareSnap: () => { noise({ dur: 0.03, gain: 0.12, f0: 7000, q: 2 }); noise({ dur: 0.08, gain: 0.05, f0: 1800, f1: 600, q: 5, at: 0.02 }); T(45, { type: 'sine', dur: 0.1, gain: 0.14 }); },
            snareLaser: () => { T(100, { to: 81, type: 'sine', dur: 0.06, gain: 0.045 }); T(88, { type: 'square', dur: 0.025, gain: 0.015, cutoff: 5000 }); },
            snareChain: () => [81, 84, 88].forEach((n, i) => { noise({ dur: 0.02, gain: 0.05, f0: 4000 + 2000 * i, q: 8, at: i * S() / 4 }); T(n, { type: 'square', dur: 0.03, gain: 0.015, cutoff: 4000, at: i * S() / 4 }); }),
            snareSweep: () => { [0, 2].forEach(k => stab([64, 69], { at: k * S(), dur: 0.14, gain: 0.05, cutoff: 1400, q: 6 })); noise({ dur: 0.5, gain: 0.06, f0: 600, f1: 3000, q: 2, attack: 0.4 }); },
            snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => blip(n, { at: i * S() / 2, gain: 0.04 + 0.01 * i, cutoff: 1500 + 800 * i, dur: 0.05 })); T(45, { to: 57, type: 'sawtooth', dur: 0.45, gain: 0.045, cutoff: 1200, q: 8, attack: 0.3 }); },
            snareBoss: () => { sub(33, 30, 0.18, 0.32); sub(33, 30, 0.15, 0.22, 2 * S()); stab([45, 52, 57], { gain: 0.04, dur: 0.4, cutoff: 700, echo: 0.35 }); },
            snareHit: () => { T(57, { type: 'square', dur: 0.12, gain: 0.04, cutoff: 1600 }); tone({ f0: NOTE(mapNote(degShift(57, varDeg))) * 2.76, dur: 0.1, type: 'sine', gain: 0.025, raw: true }); noise({ dur: 0.04, gain: 0.08, f0: 3000, q: 6 }); },
            snarePlace: ({ kind = 'wall' }) => {
                if (kind === 'decoy') blip(76, { gain: 0.045, dur: 0.08, cutoff: 2000, echo: 0.4 });
                else if (kind === 'turret') { [0, 1].forEach(i => noise({ dur: 0.015, gain: 0.06, f0: 3500, q: 5, at: i * S() / 4 })); blip(64, { at: S() / 2, gain: 0.055, dur: 0.07, cutoff: 1800 }); }
                else if (kind === 'tower') { sub(45, 45, 0.2, 0.12); blip(69, { gain: 0.04, dur: 0.1 }); blip(76, { gain: 0.04, dur: 0.12, at: S() / 2 }); }
                else { T(45, { type: 'triangle', dur: 0.12, gain: 0.14 }); noise({ dur: 0.05, gain: 0.05, f0: 900, q: 2 }); blip(69, { gain: 0.035, dur: 0.05, cutoff: 1500, at: S() / 2 }); }
            },
            snareRemove: () => { T(72, { to: 64, type: 'square', dur: 0.07, gain: 0.04, cutoff: 1600 }); noise({ dur: 0.015, gain: 0.04, f0: 5000, q: 3 }); },
            snarePower: ({ kind = 'freeze' }) => {
                if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.1, f0: 500, f1: 7000, q: 1.2, attack: 3.5 * S() }); stab([57, 64, 69, 76], { gain: 0.035, dur: 0.35, cutoff: 2400, at: 4 * S(), echo: 0.3 }); }
                else { T(93, { to: 81, type: 'sine', dur: 0.6, gain: 0.05 }); noise({ dur: 0.7, gain: 0.08, f0: 5000, f1: 300, type: 'lowpass' }); sub(45, 33, 0.6, 0.12); }
            },
            snareZap: () => { T(88, { to: 64, type: 'square', dur: 0.05, gain: 0.035, cutoff: 3000 }); noise({ dur: 0.04, gain: 0.05, f0: 6000, type: 'highpass' }); },
            snareDecoy: () => { noise({ dur: 0.08, gain: 0.07, f0: 6000, type: 'highpass' }); T(84, { type: 'triangle', dur: 0.08, gain: 0.045 }); T(76, { type: 'triangle', dur: 0.1, gain: 0.04, at: S() / 2 }); },
            snareQuarantine: ({ partner = false }) => {
                noise({ dur: 0.02, gain: 0.08, f0: 5200, q: 6 }); noise({ dur: 0.025, gain: 0.08, f0: 3600, q: 6, at: S() / 4 }); T(45, { type: 'triangle', dur: 0.1, gain: 0.13, at: S() / 4 });
                if (partner) { seq([64, 67, 72], S() / 2, { type: 'sawtooth', dur: 0.2, gain: 0.03, cutoff: 1100, q: 3, detune: -8, at: S() / 2 }); T(76, { type: 'sine', dur: 0.3, gain: 0.025, at: 2 * S(), echo: 0.4 }); }
                else { blip(69, { gain: 0.05, dur: 0.07, cutoff: 1800, at: S() / 2 }); blip(57, { gain: 0.055, dur: 0.14, cutoff: 1200, at: S() }); sub(33, 33, 0.12, 0.12, S()); }
            },
            snareStun: ({ down = false }) => {
                noise({ dur: 0.05, gain: 0.08, f0: 1200, q: 3 }); T(52, { type: 'triangle', dur: 0.08, gain: 0.12 });
                seq([88, 84, 88], S() / 2, { type: 'sine', dur: 0.05, gain: 0.022, at: S() / 2 });
                if (down) { noise({ dur: 0.05, gain: 0.12, f0: 4500, type: 'highpass', at: S() / 4 }); noise({ dur: 0.12, gain: 0.06, f0: 2500, f1: 600, q: 4, at: S() / 4 }); T(46, { type: 'square', dur: 0.16, gain: 0.035, cutoff: 900, at: S() / 4 }); }
            },
            snareCore: () => { T(45, { type: 'sine', dur: 0.7, gain: 0.1, attack: 0.3 }); T(58, { type: 'sawtooth', dur: 0.6, gain: 0.02, cutoff: 800, q: 4, detune: -15, attack: 0.3 }); blip(82, { gain: 0.02, dur: 0.08, cutoff: 3000, at: 2 * S(), echo: 0.4 }); },
            snareBossDown: () => {
                sub(33, 33, 0.3, 0.25); stab([57, 64, 69], { gain: 0.045, dur: 0.25, cutoff: 2000 });
                seq([76, 79, 81], S(), { type: 'square', dur: 0.08, gain: 0.055, cutoff: 3200, at: S() });
                stab([60, 67, 72, 76], { gain: 0.045, dur: 0.8, cutoff: 2800, at: 4 * S(), echo: 0.3 }); T(88, { type: 'sine', dur: 0.9, gain: 0.06, at: 4 * S() }); sub(33, 33, 0.9, 0.22, 4 * S());
                noise({ dur: 0.7, gain: 0.07, f0: 7000, f1: 2000, type: 'highpass', at: 4 * S() });
            },
            snareParry: () => { noise({ dur: 0.05, gain: 0.1, f0: 6500, q: 12 }); T(81, { to: 93, type: 'square', dur: 0.06, gain: 0.035, cutoff: 5000 }); ping(81, 2.76, { dur: 0.25, gain: 0.018 }); },
            snareSlash: () => { noise({ dur: 0.1, gain: 0.12, f0: 1500, f1: 9000, q: 3, attack: 0.06 }); T(64, { type: 'sawtooth', dur: 0.08, gain: 0.035, cutoff: 2000, q: 5, at: S() / 2 }); },
            snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.035, cutoff: 3000 }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.03, gain: 0.025, cutoff: 4000, at: S() / 2 }); T(69, { type: 'triangle', dur: 0.1, gain: 0.05, at: 1.5 * S(), echo: 0.35 }); },
            snareGarbage: () => { noise({ dur: 0.15, gain: 0.12, f0: 3000, f1: 200, type: 'lowpass' }); T(45, { to: 40, type: 'square', dur: 0.14, gain: 0.04, cutoff: 900 }); T(76, { to: 81, type: 'sine', dur: 0.1, gain: 0.05, at: 2 * S() }); },
            snareRace: ({ step = 0 }) => { T(raceNote(step), { type: 'triangle', dur: 0.045, gain: 0.05, cutoff: 3000 }); noise({ dur: 0.01, gain: 0.025, f0: 7000, q: 4 }); },
            snareHijack: () => { T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.045 }); T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.04, at: S() / 2 }); blip(57, { gain: 0.05, dur: 0.1, cutoff: 1400, at: S() }); },
            snareTaken: () => T(79, { to: 84, type: 'triangle', dur: 0.04, gain: 0.035, cutoff: 4000 }),
            snareFlag: ({ flags = 1, limit = 3 }) => {
                const k = Math.min(1, flags / Math.max(1, limit));
                blip(70, { gain: 0.045, dur: 0.05, cutoff: 1400 + 1600 * k }); blip(69, { gain: 0.04, dur: 0.06, cutoff: 1400 + 1600 * k, at: S() / 2 });
                if (flags >= limit - 1) blip(70, { gain: 0.035, dur: 0.04, cutoff: 3000, at: S() });
            },
            snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.045, cutoff: 3000 }); sub(33, 33, 0.15, 0.2); noise({ dur: 0.35, gain: 0.05, f0: 2000, f1: 5000, q: 3 }); },
            snareRebuild: () => { [0, 1, 2, 3].forEach(i => noise({ dur: 0.015, gain: 0.05, f0: 1200 + 600 * i, q: 3, at: i * S() / 4 })); T(45, { type: 'triangle', dur: 0.1, gain: 0.11, at: S() }); blip(64, { gain: 0.035, dur: 0.06, cutoff: 1600, at: S() }); },
            snareHerdStun: () => { T(72, { to: 52, type: 'square', dur: 0.22, gain: 0.035, cutoff: 1200 }); noise({ dur: 0.03, gain: 0.04, f0: 6000, type: 'highpass' }); }
        },
        dark: {
            // Compute a short saw with a tick, data a metal tick on a thin square, research a detuned triangle ping.
            click: ({ res = 'cp' }) => {
                const n = clickNote(res);
                if (res === 'cp') { saw(n, { dur: 0.07, gain: 0.08, cutoff: 2400, q: 3 }); T(n + 24, { type: 'sine', dur: 0.035, gain: 0.1 }); noise({ dur: 0.012, gain: 0.08, f0: 3500, q: 2 }); }
                else if (res === 'rp') { T(n - 12, { type: 'triangle', dur: 0.2, gain: 0.05, detune: -20, drive: true }); T(n + 12, { type: 'sine', dur: 0.12, gain: 0.03 }); }
                else { T(n + 12, { type: 'square', dur: 0.04, gain: phone(0.05), cutoff: 6000 }); metal(phone(0.08), 0, 5200); }
            },
            buy: ({ panel = 'hardware', big }) => {
                const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
                const figs = [[57, 58, 57], [57, 64, 58], [64, 58, 57], [57, 57, 64]];
                const f = figs[vary('buy:dark:' + inst, figs.length)].map(n => n + o);
                if (inst === 0) seq(f, S() / 2, { type: 'sawtooth', dur: 0.12, gain: 0.05, cutoff: 1600, q: 5, drive: true });
                else if (inst === 1) { seq(f.map(n => n + 12), S() / 4, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 5000 }); metal(0.05, 0, 5200); }
                else seq(f, S(), { type: 'triangle', dur: 0.3, gain: 0.06, detune: -20, drive: true });
                if (big) { T(33, { to: 21, dur: 0.5, gain: 0.3 }); noise({ dur: 0.5, gain: 0.1, f0: 3000, f1: 700, type: 'highpass', at: S() * 2 }); }
            },
            claim: () => { seq([57, 64, 69], S() / 2, { type: 'sawtooth', dur: 0.15, gain: 0.05, cutoff: 2200, drive: true }); metal(0.06, S() * 1.5, 4500); },
            error: () => { T(64, { type: 'square', dur: 0.18, gain: 0.04, cutoff: 3000 }); T(65, { type: 'square', dur: 0.18, gain: 0.035, cutoff: 3000 }); },
            ui: () => metal(0.035, 0, 6000),
            sprint: ({ charge = 1 }) => { noise({ dur: 0.2 + 0.25 * charge, gain: 0.1 + 0.2 * charge, f0: 400, f1: 2500 + 2000 * charge, q: 2 }); T(33, { to: 21, dur: 0.25, gain: 0.3 * charge, drive: true }); },
            clean: () => { saw(81, { type: 'square', dur: 0.06, gain: 0.04, cutoff: 4000 }); metal(0.05, S() / 2, 5000); saw(88, { type: 'square', dur: 0.08, gain: 0.03, cutoff: 4000, at: S() / 2 }); },
            perfect: () => { seq([82, 81, 76, 69], S() / 2, { type: 'sawtooth', dur: 0.1, gain: 0.045, cutoff: 3000, drive: true }); metal(0.06, 0, 4000); },
            summit: () => {
                [45, 52, 57, 58].forEach(n => saw(n, { dur: 1.1, gain: 0.04, cutoff: 1400, detune: 8 }));
                T(33, { to: 21, dur: 1, gain: 0.35 });
                noise({ dur: 1, gain: 0.12, f0: 6000, f1: 1500, type: 'highpass' });
                [0, 3].forEach(k => metal(0.06, k * S(), 4200));
            },
            achievement: () => { [0, 2].forEach(k => [57, 64, 69].forEach(n => saw(n, { dur: 0.16, gain: 0.035, at: k * S(), cutoff: 2000 }))); },
            land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(40, { to: 28, dur: 0.2 + 0.25 * k, gain: 0.15 + 0.35 * k, drive: true }); noise({ dur: 0.25, gain: 0.08 + 0.15 * k, f0: 900, f1: 200, type: 'lowpass' }); },
            launch: () => { noise({ dur: 0.3, gain: 0.14, f0: 600, f1: 3500, q: 3 }); saw(57, { to: 64, dur: 0.2, gain: 0.035 }); },
            runEnd: ({ good }) => good ? seq([57, 64], S(), { type: 'sawtooth', dur: 0.2, gain: 0.04, cutoff: 1800, drive: true }) : saw(58, { to: 57, dur: 0.35, gain: 0.04, cutoff: 900 }),
            record: () => { seq([57, 64, 69, 76], S() / 2, { type: 'sawtooth', dur: 0.12, gain: 0.04, cutoff: 2600, drive: true }); metal(0.05, S() * 2, 4500); },
            nearMiss: () => saw(64, { to: 58, dur: 0.7, gain: 0.04, cutoff: 900 }),
            breakthrough: () => { T(33, { to: 18, dur: 0.7, gain: 0.45, drive: true }); noise({ dur: 0.5, gain: 0.25, f0: 300, f1: 4000, q: 1 }); [45, 52, 58].forEach(n => saw(n, { dur: 0.5, gain: 0.04, at: S() })); },
            phase: () => { seq([45, 52, 57, 58, 64, 69, 70, 76], S() / 2, { type: 'sawtooth', dur: 0.14, gain: 0.04, cutoff: 2400, drive: true }); T(33, { dur: 1.4, gain: 0.25 }); },
            ship: () => { [45, 52, 57].forEach(n => saw(n, { dur: 1.6, gain: 0.04, cutoff: 1200, attack: 0.05 })); T(33, { to: 21, dur: 1.6, gain: 0.3 }); [0, 2, 4].forEach(k => metal(0.06, k * S(), 3600)); },
            // Packet Snare, held back: driven saws muted low, metal ticks, sub thumps, the flat second for alarms.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => saw(n, { dur: 0.06, gain: 0.05, cutoff: 700 + 220 * i, q: 8, at: i * S() / 2 })); metal(0.05, lastAt(f), 6500); },
            snareSpoil: () => { saw(52, { to: 45, dur: 0.3, gain: 0.05, cutoff: 600, q: 3 }); saw(53, { to: 46, dur: 0.3, gain: 0.04, cutoff: 600, q: 3 }); noise({ dur: 0.15, gain: 0.08, f0: 350, type: 'lowpass' }); },
            snareSnap: () => { metal(0.1, 0, 7000); T(33, { dur: 0.12, gain: 0.22, drive: true }); noise({ dur: 0.06, gain: 0.05, f0: 1200, q: 4, at: 0.02 }); },
            snareLaser: () => T(100, { to: 76, type: 'square', dur: 0.05, gain: 0.03, cutoff: 5000, drive: true }),
            snareChain: () => [0, 1, 2].forEach(i => metal(0.05, i * S() / 4, 4000 + 1500 * i)),
            snareSweep: () => { [0, 2].forEach(k => { saw(57, { dur: 0.12, gain: 0.05, cutoff: 1600, at: k * S() }); saw(58, { dur: 0.12, gain: 0.04, cutoff: 1600, at: k * S() }); }); noise({ dur: 0.5, gain: 0.06, f0: 800, f1: 4000, q: 3, attack: 0.4 }); },
            snareCharge: () => { seq([57, 58, 64, 69], S() / 2, { type: 'sawtooth', dur: 0.06, gain: 0.045, cutoff: 1500, q: 6, drive: true }); T(33, { to: 45, dur: 0.45, gain: 0.2, drive: true, attack: 0.3 }); },
            snareBoss: () => { T(33, { to: 28, dur: 0.2, gain: 0.35, drive: true }); T(33, { to: 28, dur: 0.16, gain: 0.24, drive: true, at: 2 * S() }); metal(0.05, 0, 2500); [45, 46].forEach(n => saw(n, { dur: 0.4, gain: 0.03, cutoff: 700 })); },
            snareHit: () => { metal(0.1, 0, 3000); saw(45, { dur: 0.12, gain: 0.05, cutoff: 1200 }); },
            snarePlace: ({ kind = 'wall' }) => {
                if (kind === 'decoy') { T(76, { type: 'square', dur: 0.06, gain: 0.03, cutoff: 3000 }); T(76, { type: 'square', dur: 0.06, gain: 0.012, cutoff: 2000, at: 3 * S() }); }
                else if (kind === 'turret') { metal(0.05, 0, 5000); metal(0.05, S() / 4, 5000); saw(64, { dur: 0.06, gain: 0.045, at: S() / 2 }); }
                else if (kind === 'tower') { T(33, { dur: 0.25, gain: 0.2 }); saw(57, { dur: 0.12, gain: 0.04 }); saw(64, { dur: 0.12, gain: 0.04, at: S() / 2 }); }
                else { T(40, { dur: 0.12, gain: 0.2, drive: true }); metal(0.045, S() / 2, 4000); }
            },
            snareRemove: () => { saw(64, { to: 57, dur: 0.08, gain: 0.045, cutoff: 1400 }); metal(0.03, 0, 6000); },
            snarePower: ({ kind = 'freeze' }) => {
                if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.12, f0: 600, f1: 8000, q: 2, attack: 3.5 * S() }); [45, 52, 57].forEach(n => saw(n, { dur: 0.4, gain: 0.035, cutoff: 2000, at: 4 * S() })); metal(0.06, 4 * S(), 3500); }
                else { noise({ dur: 0.8, gain: 0.1, f0: 4000, f1: 200, type: 'lowpass' }); T(33, { to: 24, dur: 0.8, gain: 0.25, drive: true }); saw(81, { to: 69, dur: 0.6, gain: 0.025, cutoff: 1200 }); }
            },
            snareZap: () => { saw(88, { to: 64, type: 'square', dur: 0.05, gain: 0.03, cutoff: 4000 }); metal(0.05, 0, 7000); },
            snareDecoy: () => { metal(0.07, 0, 6500); metal(0.05, S() / 4, 5000); saw(76, { to: 70, dur: 0.15, gain: 0.03, cutoff: 2000 }); },
            snareQuarantine: ({ partner = false }) => {
                metal(0.08, 0, 6000); metal(0.08, S() / 4, 4200); T(33, { dur: 0.12, gain: 0.24, drive: true, at: S() / 4 });
                if (partner) seq([57, 64, 67], S() / 2, { type: 'sawtooth', dur: 0.18, gain: 0.035, cutoff: 1100, q: 3, detune: -10, at: S() / 2 });
                else { saw(64, { dur: 0.06, gain: 0.045, cutoff: 1800, at: S() / 2 }); saw(57, { dur: 0.14, gain: 0.05, cutoff: 1200, at: S() }); }
            },
            snareStun: ({ down = false }) => {
                T(40, { dur: 0.1, gain: 0.2, drive: true }); metal(0.06, 0, 2600); saw(81, { to: 76, type: 'square', dur: 0.08, gain: 0.02, cutoff: 3000, at: S() / 2 });
                if (down) { noise({ dur: 0.06, gain: 0.14, f0: 5000, type: 'highpass', at: S() / 4 }); metal(0.08, S() / 4, 1800); saw(46, { dur: 0.2, gain: 0.04, cutoff: 800, at: S() / 4 }); }
            },
            snareCore: () => { T(33, { dur: 0.8, gain: 0.18, attack: 0.35, drive: true }); saw(46, { dur: 0.7, gain: 0.025, cutoff: 600, attack: 0.3, detune: -12 }); metal(0.03, 2 * S(), 7000); },
            snareBossDown: () => {
                T(33, { to: 21, dur: 0.5, gain: 0.35, drive: true }); [45, 52, 57].forEach(n => saw(n, { dur: 0.3, gain: 0.04, cutoff: 1800 }));
                seq([64, 69, 76], S(), { type: 'sawtooth', dur: 0.12, gain: 0.045, cutoff: 2600, drive: true, at: S() });
                [57, 64, 69, 76].forEach(n => saw(n, { dur: 0.8, gain: 0.035, cutoff: 2200, detune: 8, at: 4 * S() })); T(33, { dur: 0.8, gain: 0.25, at: 4 * S() });
                [0, 4].forEach(k => metal(0.07, k * S(), 4500)); noise({ dur: 0.8, gain: 0.1, f0: 6000, f1: 1500, type: 'highpass', at: 4 * S() });
            },
            snareParry: () => { metal(0.12, 0, 7500); saw(81, { to: 93, type: 'square', dur: 0.06, gain: 0.03, cutoff: 6000 }); ping(81, 2.76, { dur: 0.25, gain: 0.02 }); },
            snareSlash: () => { noise({ dur: 0.09, gain: 0.14, f0: 2000, f1: 10000, q: 4, attack: 0.06 }); metal(0.06, S() / 2, 3000); saw(45, { dur: 0.08, gain: 0.04, cutoff: 900, at: S() / 2 }); },
            snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.03, cutoff: 3500, drive: true }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.03, gain: 0.025, cutoff: 4000, at: S() / 2 }); saw(69, { dur: 0.1, gain: 0.035, at: 1.5 * S() }); },
            snareGarbage: () => { noise({ dur: 0.18, gain: 0.14, f0: 3000, f1: 150, type: 'lowpass' }); T(40, { to: 33, dur: 0.15, gain: 0.2, drive: true }); metal(0.05, S() / 4, 2000); saw(76, { to: 81, type: 'square', dur: 0.08, gain: 0.03, cutoff: 3000, at: 2 * S() }); },
            snareRace: ({ step = 0 }) => { T(raceNote(step), { type: 'square', dur: 0.035, gain: 0.02, cutoff: 3500 }); metal(0.025, 0, 6500); },
            snareHijack: () => { seq([64, 69, 76], S() / 4, { type: 'square', dur: 0.04, gain: 0.03, cutoff: 4000, drive: true }); metal(0.05, 3 * S() / 4, 5500); saw(57, { dur: 0.1, gain: 0.035, at: S() }); },
            snareTaken: () => T(76, { to: 81, type: 'square', dur: 0.035, gain: 0.025, cutoff: 4000 }),
            snareFlag: ({ flags = 1, limit = 3 }) => {
                const k = Math.min(1, flags / Math.max(1, limit));
                saw(70, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 1600 + 2000 * k }); saw(69, { type: 'square', dur: 0.06, gain: 0.03, cutoff: 1600 + 2000 * k, at: S() / 2 });
                if (flags >= limit - 1) metal(0.05, S(), 4000);
            },
            snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.035, cutoff: 3000, drive: true }); T(33, { dur: 0.15, gain: 0.25, drive: true }); metal(0.07, 0, 3000); metal(0.07, 1.5 * S(), 3000); },
            snareRebuild: () => { [0, 1, 2, 3].forEach(i => metal(0.04, i * S() / 4, 1500 + 700 * i)); T(40, { dur: 0.1, gain: 0.18, drive: true, at: S() }); saw(64, { dur: 0.06, gain: 0.035, cutoff: 1800, at: S() }); },
            snareHerdStun: () => { saw(72, { to: 52, dur: 0.22, gain: 0.035, cutoff: 1400 }); metal(0.04, 0, 6000); }
        },
        soft: {
            // Compute a marimba, data a glassy kalimba, research a bell.
            click: ({ res = 'cp' }) => {
                const n = clickNote(res);
                if (res === 'cp') { marimba(n, { gain: 0.06 }); T(n + 24, { type: 'sine', dur: 0.04, gain: 0.03 }); }
                else if (res === 'rp') softBell(n, { gain: 0.045 });
                else { T(n + 12, { type: 'sine', dur: 0.09, gain: phone(0.05) }); T(n + 24, { type: 'sine', dur: 0.03, gain: phone(0.015) }); }
            },
            buy: ({ panel = 'hardware', big }) => {
                const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
                const figs = [[57, 60, 64], [60, 64, 67], [64, 67, 72], [57, 64, 69]];
                const f = figs[vary('buy:soft:' + inst, figs.length)].map(n => n + o);
                if (inst === 0) f.forEach((n, i) => marimba(n, { at: i * S() / 2, gain: 0.06 }));
                else if (inst === 1) f.forEach((n, i) => T(n + 24, { type: 'sine', dur: 0.12, gain: 0.04, at: i * S() / 4 }));
                else f.forEach((n, i) => softBell(n + 12, { at: i * S(), gain: 0.04 }));
                if (big) padChord([57, 64, 69, 72], { at: S() * 2 });
            },
            claim: () => [88, 84, 81, 76].forEach((n, i) => softBell(n, { at: i * S() / 2, gain: 0.04 })),
            error: () => T(64, { to: 60, type: 'sine', dur: 0.28, gain: 0.05 }),
            ui: () => T(93, { type: 'sine', dur: 0.025, gain: 0.025 }),
            sprint: ({ charge = 1 }) => { noise({ dur: 0.3 + 0.3 * charge, gain: 0.05 + 0.1 * charge, f0: 400, f1: 1500, type: 'lowpass', attack: 0.06 }); T(45, { to: 57, type: 'sine', dur: 0.3, gain: 0.14 * charge, attack: 0.03 }); },
            clean: () => { softBell(76, { gain: 0.045 }); softBell(81, { gain: 0.035, at: S() / 2 }); },
            perfect: () => [69, 72, 76, 81, 84].forEach((n, i) => T(n, { type: 'sine', dur: 0.7, gain: 0.04, at: i * S() / 4 })),
            summit: () => { padChord([57, 64, 69, 72], { dur: 1.8 }); [76, 81, 84, 88].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.045 })); T(45, { type: 'sine', dur: 1.6, gain: 0.12, attack: 0.1 }); },
            achievement: () => [81, 88, 93].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })),
            land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(45, { to: 40, type: 'sine', dur: 0.2, gain: 0.08 + 0.2 * k }); noise({ dur: 0.25, gain: 0.04 + 0.08 * k, f0: 500, f1: 200, type: 'lowpass' }); },
            launch: () => { noise({ dur: 0.35, gain: 0.08, f0: 500, f1: 1800, type: 'lowpass', attack: 0.1 }); T(69, { to: 76, type: 'sine', dur: 0.3, gain: 0.04 }); },
            runEnd: ({ good }) => good ? [76, 81].forEach((n, i) => marimba(n, { at: i * S(), gain: 0.06 })) : [64, 60].forEach((n, i) => marimba(n, { at: i * S(), gain: 0.05 })),
            record: () => [81, 84, 88, 93].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })),
            nearMiss: () => T(76, { to: 74, type: 'sine', dur: 0.7, gain: 0.05 }),
            breakthrough: () => { noise({ dur: 0.6, gain: 0.1, f0: 300, f1: 2500, type: 'lowpass', attack: 0.4 }); padChord([57, 64, 69, 76], { at: 0.45, dur: 1.4 }); softBell(88, { at: 0.45, gain: 0.05 }); },
            phase: () => { [57, 64, 69, 72, 76, 81, 84, 88].forEach((n, i) => T(n, { type: 'sine', dur: 0.8, gain: 0.035, at: i * S() / 2 })); padChord([57, 64, 69], { at: 4 * S() }); },
            ship: () => { padChord([57, 64, 69, 72, 76], { dur: 2 }); [69, 76, 81, 88].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })); },
            // Packet Snare, secretive: muted triangles and glassy sines, soft bells, a sine heartbeat, a warm pad.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'triangle', dur: 0.08, gain: 0.07, cutoff: 1000 + 200 * i, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.12, gain: 0.02, at: lastAt(f) }); },
            snareSpoil: () => { T(52, { to: 45, type: 'sine', dur: 0.35, gain: 0.09 }); T(53, { to: 46, type: 'triangle', dur: 0.3, gain: 0.035, cutoff: 600 }); noise({ dur: 0.15, gain: 0.04, f0: 400, type: 'lowpass' }); },
            snareSnap: () => { noise({ dur: 0.04, gain: 0.06, f0: 5000, q: 2 }); T(45, { type: 'sine', dur: 0.12, gain: 0.12 }); T(64, { type: 'triangle', dur: 0.05, gain: 0.03, cutoff: 1500 }); },
            snareLaser: () => T(96, { to: 84, type: 'sine', dur: 0.06, gain: 0.045 }),
            snareChain: () => [88, 91, 93].forEach((n, i) => T(n, { type: 'sine', dur: 0.05, gain: 0.03, at: i * S() / 4 })),
            snareSweep: () => { softBell(69, { gain: 0.05, dur: 0.4 }); softBell(64, { gain: 0.05, dur: 0.4, at: 2 * S() }); noise({ dur: 0.5, gain: 0.04, f0: 500, f1: 2000, type: 'lowpass', attack: 0.35 }); },
            snareCharge: () => { [69, 72, 76, 81].forEach((n, i) => T(n, { type: 'sine', dur: 0.08, gain: 0.035 + 0.008 * i, at: i * S() / 2 })); noise({ dur: 0.45, gain: 0.05, f0: 300, f1: 2400, type: 'lowpass', attack: 0.4 }); },
            snareBoss: () => { T(45, { to: 40, type: 'sine', dur: 0.2, gain: 0.2 }); T(45, { to: 40, type: 'sine', dur: 0.16, gain: 0.14, at: 2 * S() }); padChord([45, 52, 57], { dur: 0.8, gain: 0.03, cutoff: 900 }); },
            snareHit: () => { T(57, { type: 'sine', dur: 0.15, gain: 0.08 }); T(76, { type: 'sine', dur: 0.08, gain: 0.025 }); noise({ dur: 0.03, gain: 0.03, f0: 2500, q: 4 }); },
            snarePlace: ({ kind = 'wall' }) => {
                if (kind === 'decoy') softBell(76, { gain: 0.035, dur: 0.4 });
                else if (kind === 'turret') { T(81, { type: 'sine', dur: 0.03, gain: 0.03 }); T(81, { type: 'sine', dur: 0.03, gain: 0.03, at: S() / 4 }); T(64, { type: 'triangle', dur: 0.15, gain: 0.05, cutoff: 1500, at: S() / 2 }); }
                else if (kind === 'tower') { padChord([57, 64, 69], { dur: 0.6, gain: 0.025 }); softBell(81, { gain: 0.035, at: S() / 2 }); }
                else { T(45, { type: 'sine', dur: 0.15, gain: 0.14 }); T(57, { type: 'triangle', dur: 0.12, gain: 0.045, cutoff: 1200, at: S() / 2 }); }
            },
            snareRemove: () => T(72, { to: 64, type: 'sine', dur: 0.12, gain: 0.05 }),
            snarePower: ({ kind = 'freeze' }) => {
                if (kind === 'purge') { noise({ dur: 4 * S(), gain: 0.06, f0: 400, f1: 4000, type: 'lowpass', attack: 3 * S() }); [69, 76, 81, 88].forEach((n, i) => softBell(n, { at: 4 * S() + i * S() / 2, gain: 0.035 })); }
                else { T(93, { to: 81, type: 'sine', dur: 0.8, gain: 0.045 }); noise({ dur: 0.8, gain: 0.06, f0: 3000, f1: 200, type: 'lowpass' }); padChord([57, 64, 72], { dur: 1.2, gain: 0.022, cutoff: 800 }); }
            },
            snareZap: () => { T(84, { to: 72, type: 'sine', dur: 0.06, gain: 0.045 }); noise({ dur: 0.03, gain: 0.03, f0: 6000, type: 'highpass' }); },
            snareDecoy: () => { noise({ dur: 0.08, gain: 0.04, f0: 7000, type: 'highpass' }); T(88, { type: 'sine', dur: 0.1, gain: 0.035 }); T(81, { type: 'sine', dur: 0.12, gain: 0.035, at: S() / 2 }); },
            snareQuarantine: ({ partner = false }) => {
                noise({ dur: 0.025, gain: 0.04, f0: 4000, q: 4 }); noise({ dur: 0.025, gain: 0.04, f0: 3000, q: 4, at: S() / 4 }); marimba(45, { gain: 0.1, at: S() / 4 });
                if (partner) { padChord([60, 64, 67], { dur: 0.7, gain: 0.025, at: S() / 2 }); T(76, { type: 'sine', dur: 0.3, gain: 0.03, at: S() }); }
                else { softBell(69, { gain: 0.04, dur: 0.3, at: S() / 2 }); marimba(57, { gain: 0.08, at: S() }); }
            },
            snareStun: ({ down = false }) => {
                marimba(52, { gain: 0.09 }); T(88, { type: 'sine', dur: 0.08, gain: 0.02, at: S() / 2 }); T(84, { type: 'sine', dur: 0.08, gain: 0.02, at: S() });
                if (down) { noise({ dur: 0.05, gain: 0.05, f0: 5000, type: 'highpass', at: S() / 4 }); T(46, { type: 'triangle', dur: 0.2, gain: 0.05, cutoff: 700, at: S() / 4 }); }
            },
            snareCore: () => { T(45, { type: 'sine', dur: 0.8, gain: 0.1, attack: 0.3 }); T(58, { type: 'sine', dur: 0.6, gain: 0.02, attack: 0.3, detune: -10 }); softBell(82, { gain: 0.015, dur: 0.5, at: 2 * S() }); },
            snareBossDown: () => {
                T(45, { type: 'sine', dur: 0.3, gain: 0.15 }); padChord([57, 64, 69], { dur: 0.5, gain: 0.03 });
                [64, 69, 72].forEach((n, i) => marimba(n, { gain: 0.07, at: (1 + i) * S() }));
                softBell(76, { gain: 0.06, dur: 1, at: 4 * S() }); padChord([60, 64, 67, 72], { dur: 1.2, gain: 0.03, at: 4 * S() }); T(45, { type: 'sine', dur: 0.6, gain: 0.12, at: 4 * S() });
            },
            snareParry: () => { softBell(88, { gain: 0.04, dur: 0.4 }); T(81, { to: 93, type: 'sine', dur: 0.05, gain: 0.03 }); noise({ dur: 0.03, gain: 0.04, f0: 7000, q: 8 }); },
            snareSlash: () => { noise({ dur: 0.1, gain: 0.06, f0: 1500, f1: 8000, q: 3, attack: 0.06 }); T(64, { type: 'sine', dur: 0.12, gain: 0.05, at: S() / 2 }); },
            snareSpoof: () => { T(52, { to: 76, type: 'triangle', dur: 0.12, gain: 0.05, cutoff: 2400 }); seq([76, 75, 76], S() / 4, { type: 'sine', dur: 0.04, gain: 0.03, at: S() / 2 }); marimba(69, { gain: 0.05, at: 1.5 * S() }); },
            snareGarbage: () => { noise({ dur: 0.18, gain: 0.06, f0: 2500, f1: 200, type: 'lowpass' }); T(45, { to: 40, type: 'sine', dur: 0.15, gain: 0.12 }); T(76, { to: 81, type: 'sine', dur: 0.1, gain: 0.045, at: 2 * S() }); },
            snareRace: ({ step = 0 }) => T(raceNote(step) + 12, { type: 'sine', dur: 0.05, gain: 0.03 }),
            snareHijack: () => { T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.04 }); T(76, { to: 88, type: 'sine', dur: 0.05, gain: 0.035, at: S() / 2 }); marimba(57, { gain: 0.06, at: S() }); },
            snareTaken: () => T(79, { to: 84, type: 'sine', dur: 0.04, gain: 0.03 }),
            snareFlag: ({ flags = 1, limit = 3 }) => {
                const k = Math.min(1, flags / Math.max(1, limit));
                T(70, { type: 'triangle', dur: 0.07, gain: 0.05, cutoff: 1200 + 1500 * k }); T(69, { type: 'triangle', dur: 0.09, gain: 0.045, cutoff: 1200 + 1500 * k, at: S() / 2 });
                if (flags >= limit - 1) T(82, { type: 'sine', dur: 0.06, gain: 0.025, at: S() });
            },
            snareIds: () => { [76, 70, 76, 70].forEach((n, i) => softBell(n, { gain: 0.045, dur: 0.22, at: i * S() })); T(45, { type: 'sine', dur: 0.15, gain: 0.12 }); },
            snareRebuild: () => { [57, 62, 64, 69].forEach((n, i) => marimba(n, { gain: 0.04 + 0.01 * i, at: i * S() / 4 })); noise({ dur: 0.02, gain: 0.03, f0: 3000, q: 3, at: S() }); },
            snareHerdStun: () => { T(72, { to: 52, type: 'sine', dur: 0.28, gain: 0.05 }); noise({ dur: 0.04, gain: 0.03, f0: 5000, type: 'highpass' }); }
        },
        ominous: {
            // Compute a knock, data a ghostly ping with its echo, research a short toll.
            click: ({ res = 'cp' }) => {
                const n = clickNote(res);
                if (res === 'cp') { knock(n, { gain: 0.18, cutoff: 1900 }); T(n + 24, { type: 'sine', dur: 0.04, gain: 0.045 }); }
                else if (res === 'rp') toll(n - 12, { gain: 0.065, dur: 0.7 });
                else T(n, { type: 'sine', dur: 0.22, gain: phone(0.052), detune: -15, echo: 0.4 });
            },
            buy: ({ panel = 'hardware', big }) => {
                const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
                const figs = [[45, 52], [45, 48], [52, 45], [48, 45]];
                const f = figs[vary('buy:ominous:' + inst, figs.length)].map(n => n + o + 12);
                if (inst === 0) f.forEach((n, i) => toll(n, { at: i * S() * 2, gain: 0.06 }));
                else if (inst === 1) f.forEach((n, i) => T(n + 24, { type: 'sine', dur: 0.9, gain: 0.025, at: i * S(), detune: -12, echo: 0.35 }));
                else f.forEach((n, i) => T(n, { type: 'triangle', dur: 1, gain: 0.04, attack: 0.15, detune: i ? 12 : -12, cutoff: 1400, at: i * S() }));
                if (big) { swellUp(0.5, 0.12); T(33, { to: 24, dur: 1.2, gain: 0.3, at: 0.45 }); }
            },
            claim: () => [81, 76, 69].forEach((n, i) => toll(n, { at: i * S(), gain: 0.04 })),
            error: () => { T(64, { type: 'sawtooth', dur: 0.3, gain: 0.03, cutoff: 1500 }); T(65, { type: 'sawtooth', dur: 0.3, gain: 0.03, cutoff: 1500 }); },
            ui: () => noise({ dur: 0.025, gain: 0.06, f0: 4000, q: 8 }),
            sprint: ({ charge = 1 }) => { swellUp(0.3 + 0.2 * charge, 0.08 + 0.15 * charge); T(33, { to: 26, dur: 0.6, gain: 0.25 * charge, at: 0.25 + 0.17 * charge }); },
            clean: () => T(76, { type: 'sine', dur: 0.9, gain: 0.04, echo: 0.4 }),
            perfect: () => { toll(69, { gain: 0.05 }); toll(76, { gain: 0.04, at: S() }); },
            summit: () => {
                toll(45, { gain: 0.09 });
                [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 2.4, gain: 0.03, attack: 0.4, cutoff: 1200, detune: -10 }));
                toll(81, { at: 4 * S(), gain: 0.04 });
                T(33, { dur: 2, gain: 0.2, attack: 0.3 });
            },
            achievement: () => { toll(69, { gain: 0.05 }); toll(64, { gain: 0.05, at: 2 * S() }); },
            land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); T(45, { to: 33, dur: 0.5 + 0.4 * k, gain: 0.15 + 0.25 * k }); noise({ dur: 0.6 + 0.4 * k, gain: 0.05 + 0.1 * k, f0: 400, f1: 80, type: 'lowpass' }); },
            launch: () => { swellUp(0.35, 0.1); T(64, { to: 69, type: 'sine', dur: 0.4, gain: 0.03, detune: -12 }); },
            runEnd: ({ good }) => good ? toll(76, { gain: 0.05 }) : T(60, { to: 57, type: 'sine', dur: 0.8, gain: 0.05, detune: -10 }),
            record: () => [69, 72, 76].forEach((n, i) => toll(n, { at: i * S(), gain: 0.04 })),
            nearMiss: () => T(64, { to: 62, type: 'sawtooth', dur: 0.9, gain: 0.03, cutoff: 700 }),
            breakthrough: () => { swellUp(0.5, 0.2); T(33, { to: 21, dur: 1.2, gain: 0.45, at: 0.45 }); [45, 48, 52].forEach(n => T(n, { type: 'triangle', dur: 1.2, gain: 0.035, at: 0.45, cutoff: 1500 })); },
            phase: () => { toll(45, { gain: 0.08 }); toll(57, { at: 2 * S(), gain: 0.06 }); toll(69, { at: 4 * S(), gain: 0.05 }); T(33, { dur: 2.2, gain: 0.2, attack: 0.3 }); },
            ship: () => { [0, 2, 4].forEach(k => toll(45 + k * 6, { at: k * S(), gain: 0.06 })); T(33, { dur: 2.4, gain: 0.22, attack: 0.4 }); },
            // Packet Snare, creeping: muffled detuned triangles, knocks, a bell's warning down to the flat second,
            // a deep heartbeat with a toll, reversed swells.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => T(n, { type: 'triangle', dur: 0.08, gain: 0.065, cutoff: 800, detune: -12, at: i * S() / 2 })); T(f[f.length - 1] + 24, { type: 'sine', dur: 0.3, gain: 0.014, detune: -15, at: lastAt(f) }); },
            snareSpoil: () => { T(52, { to: 45, type: 'sawtooth', dur: 0.45, gain: 0.03, cutoff: 500 }); T(53, { to: 46, type: 'sawtooth', dur: 0.45, gain: 0.03, cutoff: 500 }); noise({ dur: 0.4, gain: 0.05, f0: 300, f1: 80, type: 'lowpass' }); },
            snareSnap: () => { noise({ dur: 0.03, gain: 0.08, f0: 4500, q: 6 }); knock(45, { gain: 0.1, cutoff: 600 }); },
            snareLaser: () => T(96, { to: 76, type: 'sine', dur: 0.1, gain: 0.035, detune: -15 }),
            snareChain: () => [0, 1, 2].forEach(i => noise({ dur: 0.03, gain: 0.05, f0: 3000 + 1200 * i, q: 10, at: i * S() / 4 })),
            snareSweep: () => { toll(64, { gain: 0.05, dur: 0.8 }); toll(58, { gain: 0.045, dur: 0.8, at: 2 * S() }); },
            snareCharge: () => { swellUp(4 * S(), 0.08); seq([57, 58, 60, 63], S() / 2, { type: 'triangle', dur: 0.1, gain: 0.045, cutoff: 1200, detune: -10 }); },
            snareBoss: () => { T(33, { to: 28, dur: 0.25, gain: 0.32 }); T(33, { to: 28, dur: 0.2, gain: 0.22, at: 2 * S() }); toll(45, { gain: 0.05, dur: 1.2 }); },
            snareHit: () => { toll(57, { gain: 0.05, dur: 0.4 }); knock(52, { gain: 0.06 }); },
            snarePlace: ({ kind = 'wall' }) => {
                if (kind === 'decoy') T(76, { type: 'sine', dur: 0.3, gain: 0.035, detune: -15, echo: 0.4 });
                else if (kind === 'turret') { knock(64, { gain: 0.06 }); knock(64, { gain: 0.05, at: S() / 2 }); }
                else if (kind === 'tower') { toll(57, { gain: 0.045, dur: 0.9 }); T(33, { dur: 0.5, gain: 0.1, attack: 0.1 }); }
                else { knock(45, { gain: 0.11, cutoff: 700 }); T(33, { dur: 0.25, gain: 0.12 }); }
            },
            snareRemove: () => T(64, { to: 57, type: 'triangle', dur: 0.2, gain: 0.045, cutoff: 900, detune: -10 }),
            snarePower: ({ kind = 'freeze' }) => {
                if (kind === 'purge') { swellUp(4 * S(), 0.14); toll(69, { gain: 0.05, at: 4 * S() }); toll(76, { gain: 0.04, at: 5 * S() }); }
                else { T(93, { to: 69, type: 'sine', dur: 1, gain: 0.035, detune: -15 }); noise({ dur: 1, gain: 0.07, f0: 2500, f1: 100, type: 'lowpass' }); T(33, { dur: 1, gain: 0.15, attack: 0.2 }); }
            },
            snareZap: () => { T(81, { to: 64, type: 'triangle', dur: 0.08, gain: 0.04, cutoff: 2000 }); noise({ dur: 0.04, gain: 0.04, f0: 5000, q: 4 }); },
            snareDecoy: () => { noise({ dur: 0.12, gain: 0.05, f0: 6000, type: 'highpass' }); T(82, { type: 'sine', dur: 0.4, gain: 0.025, detune: -15 }); T(76, { type: 'sine', dur: 0.4, gain: 0.025, detune: -15, at: S() }); },
            snareQuarantine: ({ partner = false }) => {
                noise({ dur: 0.03, gain: 0.07, f0: 4000, q: 8 }); knock(45, { gain: 0.1, cutoff: 700, at: S() / 4 });
                if (partner) { toll(64, { gain: 0.035, dur: 0.9, at: S() / 2 }); T(67, { type: 'triangle', dur: 0.6, gain: 0.03, cutoff: 900, detune: -15, at: S() }); }
                else { knock(57, { gain: 0.07, at: S() / 2 }); toll(45, { gain: 0.045, dur: 0.8, at: S() }); }
            },
            snareStun: ({ down = false }) => {
                knock(52, { gain: 0.1 }); T(88, { type: 'sine', dur: 0.25, gain: 0.015, detune: -15, at: S() / 2 }); T(82, { type: 'sine', dur: 0.25, gain: 0.012, detune: -15, at: S() });
                if (down) { noise({ dur: 0.06, gain: 0.07, f0: 3000, q: 5, at: S() / 4 }); toll(46, { gain: 0.04, dur: 0.6, at: S() / 4 }); }
            },
            snareCore: () => { swellUp(4 * S(), 0.05); T(33, { dur: 1, gain: 0.15, attack: 0.4 }); toll(58, { gain: 0.025, dur: 1.2, at: 4 * S() }); },
            snareBossDown: () => {
                T(33, { to: 28, dur: 0.4, gain: 0.3 }); toll(57, { gain: 0.05, dur: 1 });
                seq([64, 67, 69], S(), { type: 'triangle', dur: 0.2, gain: 0.05, cutoff: 1400, detune: -10, at: S() });
                toll(69, { gain: 0.06, dur: 1.4, at: 4 * S() }); [45, 52, 57].forEach(n => T(n, { type: 'triangle', dur: 1.2, gain: 0.035, cutoff: 900, attack: 0.05, at: 4 * S() })); T(33, { dur: 1, gain: 0.22, at: 4 * S() });
            },
            snareParry: () => { noise({ dur: 0.04, gain: 0.09, f0: 6000, q: 12 }); toll(81, { gain: 0.03, dur: 0.5 }); T(76, { to: 88, type: 'triangle', dur: 0.06, gain: 0.03, cutoff: 3000 }); },
            snareSlash: () => { noise({ dur: 0.12, gain: 0.1, f0: 1200, f1: 7000, q: 3, attack: 0.08 }); knock(45, { gain: 0.07, at: S() / 2 }); },
            snareSpoof: () => { T(52, { to: 76, type: 'triangle', dur: 0.15, gain: 0.04, cutoff: 2000, detune: -15 }); seq([76, 75, 76], S() / 4, { type: 'sine', dur: 0.04, gain: 0.025, detune: -15, at: S() / 2 }); T(69, { type: 'sine', dur: 0.3, gain: 0.03, detune: -15, at: 1.5 * S() }); },
            snareGarbage: () => { noise({ dur: 0.25, gain: 0.08, f0: 2000, f1: 100, type: 'lowpass' }); knock(40, { gain: 0.1, cutoff: 500 }); T(76, { to: 81, type: 'sine', dur: 0.2, gain: 0.03, detune: -15, at: 2 * S() }); },
            snareRace: ({ step = 0 }) => knock(raceNote(step), { gain: 0.035, cutoff: 1600 }),
            snareHijack: () => { T(64, { to: 76, type: 'triangle', dur: 0.12, gain: 0.04, cutoff: 1800, detune: -10 }); T(76, { to: 88, type: 'sine', dur: 0.08, gain: 0.025, at: S() / 2 }); knock(57, { gain: 0.06, at: S() }); },
            snareTaken: () => T(79, { to: 84, type: 'sine', dur: 0.06, gain: 0.025, detune: -15 }),
            snareFlag: ({ flags = 1, limit = 3 }) => {
                const k = Math.min(1, flags / Math.max(1, limit));
                T(70, { type: 'triangle', dur: 0.1, gain: 0.045, cutoff: 1000 + 1500 * k, detune: -10 }); T(69, { type: 'triangle', dur: 0.12, gain: 0.04, cutoff: 1000 + 1500 * k, detune: -10, at: S() / 2 });
                if (flags >= limit - 1) knock(70, { gain: 0.04, at: S() });
            },
            snareIds: () => { toll(70, { gain: 0.04, dur: 0.6 }); seq([76, 70, 76, 70], S(), { type: 'triangle', dur: 0.12, gain: 0.045, cutoff: 1800 }); T(33, { dur: 0.2, gain: 0.2 }); },
            snareRebuild: () => { [45, 52, 57, 64].forEach((n, i) => knock(n, { gain: 0.05, at: i * S() / 4 })); T(69, { type: 'sine', dur: 0.3, gain: 0.025, detune: -15, at: S() }); },
            snareHerdStun: () => { T(72, { to: 48, type: 'triangle', dur: 0.35, gain: 0.04, cutoff: 1200, detune: -12 }); noise({ dur: 0.05, gain: 0.03, f0: 4000, q: 4 }); }
        },
        retro: {
            // Compute a triangle blip with a noise tick, data a two-step square, research a square jumping up the scale.
            click: ({ res = 'cp' }) => {
                const n = clickNote(res);
                if (res === 'cp') { tri(n, { dur: 0.07, gain: 0.09 }); sq(n + 24, { dur: 0.02, gain: 0.025 }); chipNoise(0.012, 0.04); }
                else if (res === 'rp') { sq(n, { dur: 0.035, gain: 0.048 }); sq(degShift(n, 2), { dur: 0.05, gain: 0.048, at: 0.035 }); }
                else { sq(n, { dur: 0.03, gain: phone(0.032) }); sq(n + 12, { dur: 0.04, gain: phone(0.027), at: 0.03 }); }
            },
            buy: ({ panel = 'hardware', big }) => {
                const o = PANEL_OCT[panel] ?? 0, inst = PANEL_INST[panel] ?? 0;
                const figs = [[76, 81], [81, 88], [72, 76, 79], [81, 84, 88]];
                const f = figs[vary('buy:retro:' + inst, figs.length)].map(n => n + Math.min(0, o));
                if (inst === 0) seq(f, 0.06, { type: 'square', dur: 0.08, gain: 0.03 });
                else if (inst === 1) seq([...f, ...f.map(n => n + 12)], S() / 4, { type: 'square', dur: 0.04, gain: 0.025 });
                else { seq(f, S() / 2, { type: 'square', dur: 0.06, gain: 0.025 }); tri(f[0] - 24, { dur: 0.2 }); }
                if (big) { seq([69, 72, 76, 81, 84, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.025, at: S() * 2 }); chipNoise(0.08, 0.05, S() * 2); }
            },
            claim: () => [0, 1, 2].forEach(k => { sq(81, { at: k * 0.12, dur: 0.04 }); sq(88, { at: k * 0.12 + 0.04, dur: 0.07 }); }),
            error: () => seq([69, 68], 0.12, { type: 'square', dur: 0.11, gain: 0.03 }),
            ui: () => sq(93, { dur: 0.02, gain: 0.035 }),
            sprint: ({ charge = 1 }) => { chipNoise(0.08 + 0.1 * charge, 0.05 + 0.08 * charge); T(57, { to: 69 + Math.round(12 * charge), type: 'square', dur: 0.15, gain: 0.03, steps: true }); },
            clean: () => seq([76, 81, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.03 }),
            perfect: () => seq([69, 72, 76, 81, 84, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }),
            system: () => { seq([69, 72, 76, 81, 84, 88, 93, 96], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }); chipNoise(0.3, 0.04); },
            summit: () => { seq([69, 69, 76, 81, 0, 81, 88], S(), { type: 'square', dur: 0.1, gain: 0.032 }); seq([45, 45, 52, 57, 0, 57, 64], S(), { type: 'triangle', dur: 0.12, gain: 0.08 }); },
            achievement: () => seq([72, 76, 79, 84], S() / 2, { type: 'square', dur: 0.07, gain: 0.03 }),
            land: ({ impact = 3 }) => { const k = Math.min(1, impact / 15); chipNoise(0.06 + 0.08 * k, 0.04 + 0.08 * k); tri(45, { to: 33, dur: 0.12 + 0.1 * k, gain: 0.08 + 0.12 * k, steps: true }); },
            launch: () => T(64, { to: 81, type: 'square', dur: 0.2, gain: 0.028, steps: true }),
            runEnd: ({ good }) => good ? seq([81, 88], S() / 2, { type: 'square', dur: 0.08, gain: 0.03 }) : seq([64, 60, 57], S() / 2, { type: 'square', dur: 0.1, gain: 0.028 }),
            record: () => seq([81, 84, 88, 93], S() / 2, { type: 'square', dur: 0.06, gain: 0.03 }),
            nearMiss: () => seq([76, 74, 76, 74], 0.06, { type: 'square', dur: 0.05, gain: 0.025 }),
            breakthrough: () => { chipNoise(0.3, 0.12); seq([57, 64, 69, 76, 81, 88], S() / 4, { type: 'square', dur: 0.05, gain: 0.03 }); tri(33, { dur: 0.4, gain: 0.15 }); },
            phase: () => { seq([57, 60, 64, 69, 72, 76, 81, 84, 88, 93], S() / 4, { type: 'square', dur: 0.05, gain: 0.028 }); tri(45, { dur: 0.8, gain: 0.1, at: S() * 2.5 }); },
            ship: () => { seq([69, 0, 69, 76, 81, 0, 88], S() / 2, { type: 'square', dur: 0.1, gain: 0.032 }); seq([45, 0, 45, 52, 57, 0, 64], S() / 2, { type: 'triangle', dur: 0.12, gain: 0.08 }); },
            // Packet Snare, an 8-bit stealth game: triangle pockets low, chip ticks, a two-tone alarm, stepped slides.
            snareCatch: ({ mult = 1 }) => { const f = catchNotes(mult); f.forEach((n, i) => tri(n - 12, { dur: 0.05, gain: 0.09, at: i * S() / 2 })); sq(f[f.length - 1] + 24, { dur: 0.025, gain: 0.02, at: lastAt(f) }); },
            snareSpoil: () => { T(52, { to: 40, type: 'square', dur: 0.25, gain: 0.025, steps: true }); chipNoise(0.12, 0.05); },
            snareSnap: () => { chipNoise(0.04, 0.08); tri(45, { dur: 0.08, gain: 0.11 }); },
            snareLaser: () => T(100, { to: 84, type: 'square', dur: 0.05, gain: 0.02, steps: true }),
            snareChain: () => [93, 96, 100].forEach((n, i) => { chipNoise(0.015, 0.035, i * S() / 4); sq(n, { dur: 0.02, gain: 0.015, at: i * S() / 4 }); }),
            snareSweep: () => seq([76, 69, 76, 69], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }),
            snareCharge: () => { T(57, { to: 81, type: 'square', dur: 0.4, gain: 0.025, steps: true }); chipNoise(0.03, 0.04, 3 * S()); },
            snareBoss: () => { tri(33, { dur: 0.15, gain: 0.2 }); tri(33, { dur: 0.12, gain: 0.14, at: 2 * S() }); seq([45, 46], S(), { type: 'square', dur: 0.1, gain: 0.022 }); },
            snareHit: () => { chipNoise(0.05, 0.07); sq(57, { dur: 0.06, gain: 0.03 }); tri(45, { dur: 0.08, gain: 0.08 }); },
            snarePlace: ({ kind = 'wall' }) => {
                if (kind === 'decoy') { sq(76, { dur: 0.04, gain: 0.025 }); sq(76, { dur: 0.04, gain: 0.012, at: 3 * S() }); }
                else if (kind === 'turret') { sq(64, { dur: 0.03, gain: 0.025 }); sq(69, { dur: 0.03, gain: 0.025, at: S() / 4 }); chipNoise(0.015, 0.04, S() / 2); }
                else if (kind === 'tower') { seq([57, 64, 69], S() / 4, { type: 'square', dur: 0.04, gain: 0.022 }); tri(45, { dur: 0.15, gain: 0.1 }); }
                else { tri(45, { dur: 0.08, gain: 0.13 }); chipNoise(0.02, 0.04); }
            },
            snareRemove: () => seq([69, 64], S() / 4, { type: 'square', dur: 0.03, gain: 0.024 }),
            snarePower: ({ kind = 'freeze' }) => {
                if (kind === 'purge') { chipNoise(0.25, 0.08); seq([88, 84, 81, 76, 72, 69], S() / 4, { type: 'square', dur: 0.04, gain: 0.02, at: S() }); }
                else { T(93, { to: 69, type: 'square', dur: 0.6, gain: 0.02, steps: true }); chipNoise(0.3, 0.04); tri(45, { dur: 0.5, gain: 0.08 }); }
            },
            snareZap: () => { T(84, { to: 64, type: 'square', dur: 0.05, gain: 0.024, steps: true }); chipNoise(0.02, 0.04); },
            snareDecoy: () => { chipNoise(0.08, 0.06); seq([81, 76], S() / 2, { type: 'square', dur: 0.04, gain: 0.022 }); },
            snareQuarantine: ({ partner = false }) => {
                chipNoise(0.015, 0.05); chipNoise(0.015, 0.05, S() / 4); tri(45, { dur: 0.08, gain: 0.12, at: S() / 4 });
                if (partner) seq([64, 67, 72], S() / 2, { type: 'square', dur: 0.06, gain: 0.022, at: S() / 2 });
                else { seq([69, 57], S() / 2, { type: 'square', dur: 0.06, gain: 0.026, at: S() / 2 }); tri(45, { dur: 0.1, gain: 0.1, at: S() }); }
            },
            snareStun: ({ down = false }) => {
                tri(52, { dur: 0.06, gain: 0.1 }); chipNoise(0.03, 0.05); seq([88, 84, 88], S() / 4, { type: 'square', dur: 0.025, gain: 0.014, at: S() / 2 });
                if (down) { chipNoise(0.08, 0.09, S() / 4); T(58, { to: 46, type: 'square', dur: 0.15, gain: 0.022, steps: true, at: S() / 4 }); }
            },
            snareCore: () => { tri(33, { dur: 0.5, gain: 0.12, attack: 0.2 }); sq(58, { dur: 0.3, gain: 0.012, attack: 0.15 }); sq(82, { dur: 0.03, gain: 0.012, at: 2 * S() }); },
            snareBossDown: () => {
                seq([64, 69, 72, 76], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }); seq([45, 0, 52, 57], S() / 2, { type: 'triangle', dur: 0.06, gain: 0.08 });
                sq(81, { dur: 0.12, gain: 0.032, at: 2 * S() }); sq(79, { dur: 0.06, gain: 0.03, at: 3 * S() }); sq(81, { dur: 0.5, gain: 0.032, at: 4 * S() }); sq(88, { dur: 0.4, gain: 0.02, at: 4 * S() });
                tri(45, { dur: 0.5, gain: 0.1, at: 4 * S() }); chipNoise(0.1, 0.06, 4 * S());
            },
            snareParry: () => { chipNoise(0.02, 0.07); T(81, { to: 93, type: 'square', dur: 0.05, gain: 0.025, steps: true }); sq(100, { dur: 0.03, gain: 0.012, at: S() / 2 }); },
            snareSlash: () => { chipNoise(0.05, 0.09); sq(93, { dur: 0.02, gain: 0.015 }); tri(57, { dur: 0.05, gain: 0.08, at: S() / 2 }); },
            snareSpoof: () => { T(52, { to: 76, type: 'square', dur: 0.12, gain: 0.022, steps: true }); seq([76, 75, 76], S() / 4, { type: 'square', dur: 0.025, gain: 0.018, at: S() / 2 }); sq(69, { dur: 0.06, gain: 0.022, at: 1.5 * S() }); },
            snareGarbage: () => { chipNoise(0.12, 0.08); tri(45, { to: 33, dur: 0.12, gain: 0.1, steps: true }); seq([76, 81], S() / 4, { type: 'square', dur: 0.04, gain: 0.022, at: 2 * S() }); },
            snareRace: ({ step = 0 }) => sq(raceNote(step), { dur: 0.025, gain: 0.016 }),
            snareHijack: () => { seq([64, 69, 76, 88], S() / 4, { type: 'square', dur: 0.03, gain: 0.02 }); tri(57, { dur: 0.08, gain: 0.08, at: S() }); },
            snareTaken: () => { sq(79, { dur: 0.02, gain: 0.014 }); sq(84, { dur: 0.02, gain: 0.012, at: 0.025 }); },
            snareFlag: ({ flags = 1, limit = 3 }) => { sq(70, { dur: 0.04, gain: 0.022 }); sq(69, { dur: 0.05, gain: 0.02, at: S() / 2 }); if (flags >= limit - 1) sq(70, { dur: 0.03, gain: 0.018, at: S() }); },
            snareIds: () => { seq([76, 70, 76, 70, 76, 70], S() / 2, { type: 'square', dur: 0.05, gain: 0.028 }); chipNoise(0.05, 0.07); tri(45, { dur: 0.15, gain: 0.1 }); },
            snareRebuild: () => { [0, 1, 2, 3].forEach(i => chipNoise(0.012, 0.04, i * S() / 4)); tri(45, { dur: 0.08, gain: 0.1, at: S() }); sq(69, { dur: 0.04, gain: 0.022, at: S() }); },
            snareHerdStun: () => { T(72, { to: 48, type: 'square', dur: 0.25, gain: 0.02, steps: true }); chipNoise(0.02, 0.03); }
        }
    };

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
    const SIMPLE_VOICE = {
        classic: { type: 'square', oct: 0, cutoff: 1800, len: 1, gain: 0.55 },
        dark: { type: 'sawtooth', oct: 0, cutoff: 2200, len: 1, gain: 0.5 },
        soft: { type: 'sine', oct: 0, len: 1.4, gain: 1, attack: 0.008 },
        ominous: { type: 'sine', oct: -12, len: 1.8, gain: 1, attack: 0.02 },
        retro: { type: 'square', oct: 0, len: 0.8, gain: 0.35 }
    };
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
        if (volume <= 0 || gv <= 0 || !SOUNDS[name] || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (last[name] != null && now - last[name] < (GAP[name] ?? 0.03)) return;
        last[name] = now;
        // Every sound lands on the track's grid, in every track and in simple sounds: the next 16th (a held
        // click and the stingers the next 8th, `q` from game.js or QUANT). If a slowed track puts the 8th too
        // far off, the next 16th.
        const div = opts?.q ?? QUANT[name] ?? 1;
        base = Math.max(0, nextStep(div).t - now);
        if (base > 0.3 && div > 1) base = Math.max(0, nextStep(1).t - now);
        startAt = now + base;
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
        } catch { /* a bad node never breaks the game */ }
        base = 0;
        startAt = null;
        gmul = 1;
        ownSound = false;
        varDeg = 0; varNoise = 1;
    }

    // Milliseconds until the next held-job beat: the next 8th note (at least `minMs` away), or while the track
    // is slowed, the grid step closest to an 8th at full tempo. Null without a running audio clock (game.js
    // then repeats at its own 8th, 242 ms).
    function holdDelay(minMs = 60) {
        if (!ctx || ctx.state !== 'running' || !clock) return null;
        const div = Math.max(1, Math.round((2 * STEP) / clock.len));
        return (nextStep(div, minMs / 1000).t - ctx.currentTime) * 1000;
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
    const CHARGE_TRIM = {
        classic: [1.92, 2.8, 4.11, 11.53, 2.78],
        dark: [2.31, 4.21, 8.55, 9.11, 5.43],
        soft: [1.72, 2.31, 6.47, 7.14, 3.05],
        ominous: [0.74, 2.46, 4.37, 7.33, 1.34],
        retro: [1.56, 2.63, 5.75, 9.7, 6.08],
        's:classic': [0.26, 1.07, 3.03, 7.25, 2.41],
        's:dark': [2.02, 2.06, 11.3, 16, 6.39],
        's:soft': [0.17, 0.72, 6.12, 5.25, 3.8],
        's:ominous': [0.22, 0.83, 2.38, 3.32, 2.11],
        's:retro': [1.11, 0.47, 0.63, 3.89, 3.98]
    };
    const BASE_TRIM = { classic: 1.76, dark: 1.8, soft: 1.48, ominous: 1.66, retro: 0.91, 's:classic': 1.93, 's:dark': 3.24, 's:soft': 1.22, 's:ominous': 1.29, 's:retro': 3.05 };
    let lastVoice = -1;
    function chargeVoice() {
        let i = Math.floor(Math.random() * CHARGE_VOICES.length);
        if (i === lastVoice) i = (i + 1 + Math.floor(Math.random() * (CHARGE_VOICES.length - 1))) % CHARGE_VOICES.length;
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
        if (volume <= 0 || mix.training <= 0 || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const l = Math.max(0, Math.min(1, level));
        if (chargeOsc && chargeOsc.free !== free) chargeStop();
        if (!chargeOsc) {
            const out = ctx.createGain();
            out.connect(master);
            // The first note waits for the next 16th, like every sound.
            const v = free ? THRUST_VOICE : chargeVoice();
            chargeOsc = { out, v, vi: free ? 4 : CHARGE_VOICES.indexOf(v), free, sched: Math.floor(stepAt(now)) };
        }
        const c = chargeOsc;
        // Strike each 16th a little ahead, so it lands exactly on the beat.
        let next = Math.max(c.sched + 1, Math.ceil(stepAt(now)));
        while (stepTime(next) - now < 0.06) { strikeCharge(c, l, next, stepTime(next)); next++; }
    }

    function chargeStop() {
        if (!chargeOsc) return;
        const { out } = chargeOsc;
        chargeOsc = null;
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        setTimeout(() => out.disconnect(), 500);
    }

    // ---- Music: songs in each track's voice, that follow the run -----------------------------------------
    // A step sequencer (16 steps a bar) scheduled a little ahead on the audio clock. Each track (Classic, Dark,
    // Soft, Ominous, Retro) has its drums and instruments (`STYLES`) and six songs (`SONGS`): two for the lab
    // (and Surveillance and R&D), two for the server room (and its bays) and two for Packet Snare's bay. A song is an eight-bar chord
    // progression with voiced chords, a bass line that follows it, a four-bar melody (A) and an eight-bar one
    // (B), played in a two-minute form (`FORM`): intro, A, B, A, a breakdown, B, A with a harmony, out. Then the
    // area's other song takes over; moving between the lab and the server room changes song on the next bar,
    // and coming back picks a song up at the section it left. Layers come in with the intensity (0-1, from the
    // ball's speed in game.js): off-beat hats, a clap, 16th hats and an arpeggio of the chord when it's flying.
    // Power-ups bend it: a crunch distorts it, flow and bullet time slow and muffle it, a breakthrough is a
    // swell that opens the filter and lands on a crash. Its own volume (`setMusic`), so sounds and music can be
    // set apart; silent until the first gesture, like everything here.
    let music = null;               // { bus, parts, drive, dry, wet, filter, trim, nextStep, step, timer, song… }
    let musicVolume = 0.35;
    let intensity = 0;
    let mode = null;                // null | 'crunch' | 'flow' | 'freeze'
    let area = 'lab';               // 'lab' | 'server' | 'snare' (game.js, `setArea`)
    let depth = 0;                  // 0-1: how much of the arrangement the game has earned (game.js, `setDepth`)
    let training = false;           // the beat plays only while training (game.js, `setTraining`)
    let songLvl = 1;                // the current song's level trim, on its pitched voices

    function driveCurve(k) {
        const n = 1024;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }

    function startMusic() {
        if (music || musicVolume <= 0 || !ensure() || ctx.state !== 'running') return;
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
        for (const [k, g] of Object.entries(parts)) { g.gain.value = partLevel(k); g.connect(bus); }
        bus.connect(dry).connect(filter);
        bus.connect(drive).connect(wet).connect(filter);
        // The beat's trim comes after the drive, which would otherwise saturate back up to full level.
        const trim = ctx.createGain();
        trim.gain.value = styleTrim();
        filter.connect(trim).connect(out);
        const first = nextStep(16, 0.05);          // joins the clock on a downbeat, in time with the grid sounds
        music = { bus, parts, drive, dry, wet, filter, trim, nextStep: first.t, step: first.n,
            area, song: songFor[area], songStep: first.n, left: {}, cmd: null };
        music.timer = setInterval(schedule, 25);
    }

    function stopMusic() {
        if (!music) return;
        clearInterval(music.timer);
        const m = music;
        music = null;
        if (clock.len !== STEP) { const n = Math.ceil(stepAt(ctx.currentTime)); retime(STEP, n, stepTime(n)); }
        m.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
        setTimeout(() => m.filter.disconnect(), 600);
    }

    // One voice into the music, through its part: the beat (kick, hats, claps) or the tones (everything
    // pitched), each with its own volume in Settings (`setMusicMix`).
    function voice(fn, part = 'tones') {
        const g = ctx.createGain();
        g.connect(music.parts[part] || music.bus);
        fn(g);
    }
    const shift = () => (STYLES[style] || STYLES.classic).shift || 0;   // the track's key, from A
    function kick(t, gain, from = 150, to = 45, decay = 0.28) {
        voice(g => {
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(from, t);
            o.frequency.exponentialRampToValueAtTime(to, t + 0.12);
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
            o.connect(g);
            o.start(t);
            o.stop(t + decay + 0.02);
        }, 'beat');
    }
    // A noise swell rising into the next bar (the fills): its gain and filter climb to the downbeat.
    function riser(t, dur, gain) {
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.setValueAtTime(400, t);
            f.frequency.exponentialRampToValueAtTime(5000, t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + dur);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
            src.connect(f).connect(g);
            src.start(t);
            src.stop(t + dur + 0.1);
        }, 'beat');
    }
    // A soft chord held for a bar (pads): slow attack, gentle release.
    function pad(t, notes, dur, gain, type = 'triangle', cutoff = 1400) {
        for (const n of notes) voice(g => {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            o.type = type;
            o.frequency.value = NOTE(n + shift());
            o.detune.value = (Math.random() - 0.5) * 10;
            f.type = 'lowpass';
            f.frequency.value = cutoff;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain * songLvl, t + dur * 0.3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(f).connect(g);
            o.start(t);
            o.stop(t + dur + 0.05);
        });
    }
    function hat(t, gain, len = 0.04) {
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });   // builds the shared noise buffer
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 7000;
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            src.connect(f).connect(g);
            src.start(t, Math.random() * 0.5);
            src.stop(t + len + 0.02);
        }, 'beat');
    }
    function clap(t, gain) {
        voice(g => {
            if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 1600;
            f.Q.value = 0.9;
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            src.connect(f).connect(g);
            src.start(t, Math.random() * 0.5);
            src.stop(t + 0.2);
        }, 'beat');
    }
    // A pitched voice; `q` the filter's resonance, `env` sweeps the filter down from cutoff × (1 + env) (acid),
    // `attack` in seconds (pads and slow leads).
    function synth(t, note, dur, gain, type, cutoff, q = 6, env = 0, detune = 0, attack = 0.008) {
        voice(g => {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            o.type = type;
            o.frequency.value = NOTE(note + shift());
            if (detune) o.detune.value = detune;
            f.type = 'lowpass';
            f.Q.value = q;
            if (env) {
                f.frequency.setValueAtTime(cutoff * (1 + env), t);
                f.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff), t + Math.min(dur, 0.18));
            } else f.frequency.value = cutoff;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain * songLvl, t + Math.min(attack, dur * 0.5));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(f).connect(g);
            o.start(t);
            o.stop(t + dur + 0.02);
        });
    }

    // ---- Songs ----------------------------------------------------------------------------------------
    // Everything is written in A (A minor, A Phrygian…, or C major for the bright songs, its relative), and the
    // track's `shift` moves it to the track's key: Classic and Retro stay in A minor / C major, Dark goes to E
    // (Phrygian), Soft to D minor / F major, Ominous to C. The sounds sit in the same keys (KEYS).
    const AEOL = [0, 2, 3, 5, 7, 8, 10], PHRY = [0, 1, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
    const HARM = [0, 2, 3, 5, 7, 8, 11], ION = [0, 2, 4, 5, 7, 9, 11];
    const PC = { A: 0, B: 2, C: 3, D: 5, E: 7, F: 8, G: 10 };
    const QUALITY = {
        '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 6: [0, 4, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
        9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7],
        sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], dim: [0, 3, 6]
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
    // flat, ' for each octave up and , for each octave down; '-' holds the note on, '.' rests, and 'x+y' splits
    // the 8th into two 16ths. Bars may be split with '|' for reading. Each note: { deg, acc, len } in 16ths.
    function parseMelody(str, steps) {
        const ev = new Array(steps).fill(null);
        let i = 0, cur = null;
        const put = tok => {
            if (tok === '-') { if (cur) cur.len++; }
            else if (tok === '.') cur = null;
            else {
                const m = /^([b#]?)([1-7])('*|,*)$/.exec(tok);
                if (!m) throw new Error('note ' + tok);
                const oct = m[3][0] === "'" ? m[3].length : -m[3].length;
                cur = { deg: +m[2] - 1 + 7 * oct, acc: m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, len: 1 };
                ev[i] = cur;
            }
            i++;
        };
        for (const tk of str.replace(/\|/g, ' ').trim().split(/\s+/)) {
            if (tk.includes('+')) tk.split('+').forEach(put);
            else { put(tk); put(tk === '.' ? '.' : '-'); }
        }
        if (i !== steps) throw new Error(`melody of ${i} steps, not ${steps}`);
        return ev;
    }
    // A melody note, `harm` degrees away in the song's scale (−2: a third below, the A2 section's harmony).
    function melNote(song, e, harm = 0) {
        const d = e.deg + harm, o = Math.floor(d / 7), sc = song.scale;
        return 69 + song.tonic + sc[d - 7 * o] + 12 * o + 12 * song.oct + (harm ? 0 : e.acc);
    }
    // Snap a note into the song's scale (the Dark acid line's turns, written over any root).
    function snap(song, n) {
        const inScale = x => song.scale.includes(((pcOf(x) - song.tonic) % 12 + 12) % 12);
        return inScale(n) ? n : inScale(n - 1) ? n - 1 : n + 1;
    }
    // Bass patterns: 16 characters a bar. '.' rest, r root, o its octave, f the fifth, d the fifth below,
    // t the chord's third (sus chords: their 4th or 2nd).
    function bassAt(song, s, ch) {
        const c = song.bass[s];
        if (!c || c === '.') return 0;
        return ch.root + ({ r: 0, o: 12, f: 7, d: -5, t: ch.third }[c] ?? 0);
    }
    function buildSong(def) {
        const song = { tonic: 0, oct: 0, lvl: 1, comp: [], bass: 'r.......r.......', acid: 1, ...def };
        let prev = null, hold = 69, bell = 69;
        song.chords = def.chords.map(name => {
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
        song.melA = parseMelody(def.melA, 64);
        song.melB = parseMelody(def.melB, 128);
        return song;
    }
    // The form, eight bars a section: two minutes at 124 BPM, then the area's other song.
    const FORM = ['intro', 'A', 'B', 'A', 'break', 'B', 'A2', 'out'];
    const SONG_BARS = FORM.length * 8;

    // Two songs for the lab, two for the server room and two for Packet Snare, per track. Lab songs are steadier and
    // more melodic; server-room songs drive harder (busier bass, syncopated chords, riffs); Packet Snare's are the
    // track gone stealthy (sparse, muted, suspended chords that don't resolve, a hushed kick of their own and a
    // ticking clock: see `kickLevel`) until you're spotted and the beat drops in. `lvl` trims each song's pitched
    // voices so every song measures the same (K-weighted, the tones 2 dB over the beat); a stealth song's `rest`
    // lifts its tones while it's hushed (fading out as you're spotted), so it measures the same then too
    // (`slvl`/`srest`: the same for its simple version).
    const SONGS = {
        classic: {
            lab: [
                {   // Night Survey: dub chords on the off-beats, a long-breathed line.
                    lvl: 0.91, scale: AEOL, chords: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Dm7', 'Cmaj7'],
                    bass: 'r..r..o.r..r.f..', comp: [2, 10],
                    melA: "5 - 1' - 7 5 - 3 | 4 3 1 - - - . . | 3 - 5 - 6 5 3 1 | 2 - 3 - 7, - - .",
                    melB: "1' - - 7 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - 5 6 - 1' - | 7 - 6 - 5 - 3 - | 5 - - 3 5 - 7 - | 1' - 7 - 5 - 3 - | 4 - 5 - 7 - 2' - | 1' - 7 - 5 - - -"
                },
                {   // Uptime: i – VI – III – VII, wide and hopeful, chords late in the bar.
                    lvl: 1.01, scale: AEOL, chords: ['Am7', 'Fmaj9', 'C6', 'Gsus2', 'Am7', 'Fmaj9', 'Dm7', 'E7'],
                    bass: 'r...r.f.r...o...', comp: [6, 14],
                    melA: "3' - 2' - 1' - 5 - | 6 - 1' - 5 - 3 - | 5 - 3 - 1' - 3' - | 2' - - - 5 - - .",
                    melB: "1 - 3 - 5 - 1' - | 7 - 6 - 5 - - . | 5 - 3 - 5 - 1' - | 2' - 1' - 2' - - . | 3' - 2' - 1' - 5 - | 6 - - 5 6 - 3' - | 2' - 1' - 6 - 4 - | #7, - - - 2 - - ."
                }
            ],
            server: [
                {   // Overclock: a rolling bass, a riff, harmonic minor's E7 at the turn.
                    lvl: 0.85, scale: AEOL, chords: ['Am7', 'Am7', 'Dm7', 'Dm7', 'Fmaj7', 'G', 'Esus4', 'E7'],
                    bass: 'r.rr.or.r.rr.o.f', comp: [3, 6, 14],
                    melA: "1' . 1' 7 . 5 . 3 | 4 3 . 1 . . 5, . | 4 . 4 3 . 1 . 6, | 2 - - - 7, - - .",
                    melB: "5 . 5 . 6 5 3 1 | 2 . 3 . 1 - - . | 4 . 4 . 5 4 3 1 | 6, . 1 . 3 - - . | 3 . 5 . 1' . 7 5 | 7 - 6 - 5 - 2 - | 1 - 2 - 4 - 2 - | #7, - - - 2 - - -"
                },
                {   // Packet Storm: the Andalusian cadence (Am – G – F – E) under a 16th-note hook.
                    lvl: 0.82, scale: AEOL, chords: ['Am', 'G', 'Fmaj7', 'E7', 'Am', 'G', 'Dm9', 'E7'],
                    bass: 'r.o.r.o.r.o.f.o.', comp: [2, 7, 10],
                    melA: "1' 7 1' 5 . 1' 7 5 | 7 5 7 2 . 7 5 2 | 6 5 6 1 . 6 5 3 | #7, 2 #7, 2 3 2 #7, .",
                    melB: "5 - - - 1' - 3' - | 2' - 1' - 7 - - . | 1' - 7 - 6 - 3 - | #7 - - - 2' - - . | 5 - 1' - 2'+3' 2'+1' - - | 7 - 5 - 2 - 5 - | 4 - 6 - 1' - 2' - | #7 - 2' - #7 - . ."
                }
            ],
            snare: [
                {   // Packet Sniffer: dub techno gone quiet: Am9 and Dm9 hanging on an unresolved Esus4, one muted stab a bar.
                    lvl: 1.62, rest: 1.40, slvl: 0.82, srest: 1.34, scale: AEOL, chords: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7', 'Dm9', 'Dm9', 'Esus4', 'Esus4'],
                    bass: 'r..r......r.....', comp: [10], kick: 'x.........x.....', hush: 0.45, tick: '..o..x..o.o..x..', cut: 0.75,
                    melA: "5, . . 1 . . 3 . | 1 - - - . . . . | 5 . . . 1' . . . | 5 - - - . . . .",
                    melB: "1 . 1 . 3 . 5 . | 7 - - - 5 . 3 . | 1 . 1 . 3 . 5 . | 1' - - - 5 - - - | 6 . 4 . 3 . 1 . | 3 - - - 5 - - - | 5 . 4 . 5 . 1' . | 2' - - - 1' - - -"
                },
                {   // Dead Drop: i – v – VI – VII held on sus chords, a bass that steps and stops.
                    lvl: 1.37, rest: 1.36, slvl: 0.85, srest: 1.30, scale: AEOL, chords: ['Am7', 'Am7', 'Em7', 'Em7', 'Fmaj7', 'Fmaj7', 'Gsus4', 'Gsus4'],
                    bass: 'r..r..r.....r...', comp: [6], kick: 'x......x........', hush: 0.45, tick: 'o..x..o...o..x..', cut: 0.75,
                    melA: ". . 3 . . . 1 . | 5, - - - . . . . | . . 5 . . . 4 . | 5 - - - . . . .",
                    melB: "1 . . 3 . . 5 . | 3 - - - 1 - - - | 5 . . 7 . . 2' . | 7 - - - 5 - - - | 6 . . 1' . . 3' . | 1' - - - 5 - - - | 4 . . 5 . . 1' . | 4 - - - 5 - - -"
                }
            ]
        },
        dark: {
            lab: [
                {   // Foundry: Phrygian (the flat second), a low pad, the acid line held back.
                    lvl: 1.05, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Am', 'Dm', 'Dm', 'Bb', 'C'], comp: [0], acid: 0.45,
                    melA: "1' - - - 2' - 1' - | 5 - - - . . 7 6 | 6 - 4 - 2 - - . | 1 - - - . . . .",
                    melB: "1 . 1 . 2 1 . 5, | 1 . 1 . 3 2 1 . | 2 . 2 . 4 2 . 6, | 1 - - - 5, - 7, - | 4 . 4 . 6 4 . 1 | 4 . 3 . 2 - 1 - | 2 - 4 - 6 - 4 - | 3 - 5 - 7 - 5 -"
                },
                {   // Rust: a slow descent, i – vii – VI – vii.
                    lvl: 0.86, scale: PHRY, chords: ['Am', 'Gm', 'F', 'Gm', 'Am', 'Bb', 'F', 'Bb'], comp: [0], acid: 0.35,
                    melA: "5 - - - 3 - 1 - | 2 - - - 4 - 7, - | 1 - - - 3 - 6, - | 2 - 4 - 6 - 4 -",
                    melB: "1' - - 7 1' - 5 - | 4' - - 2' 7 - - - | 6 - - 5 6 - 1' - | 7 - 6 - 4 - 2 - | 5 - - - 1' - 3' - | 2' - - - 6 - 4 - | 3' - 1' - 7 - 5 - | 4 - 2 - 1 - - -"
                }
            ],
            server: [
                {   // Warehouse: the acid line at full tilt, a hoover riff over it.
                    lvl: 0.84, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Bb', 'Am', 'Am', 'F', 'Gm'], comp: [0],
                    melA: "1' . . 1' . . 2' . | 1' . . 7 . . 5 . | 2' . . 2' . . 4' . | 3' . . 2' . . 6 .",
                    melB: "5 - - - 6 - 5 - | 1' - - - 7 - 6 - | 4 - - - 6 - 4 - | 2 - - - - - . . | 5 - 6 - 1' - 2' - | 1' - 7 - 5 - - - | 6 - 5 - 3 - 1 - | 2 - 4 - 7 - - -"
                },
                {   // Pressure: a low hoover stabbing on the 16ths, stabs on the off-beats.
                    lvl: 0.77, scale: PHRY, chords: ['Am', 'Bb', 'Am', 'Gm', 'Am', 'Bb', 'Dm', 'Bb'], comp: [0, 3, 11], oct: -1,
                    melA: "1 . 1 . . 5 . 1 | 2 . 2 . . 4 . 6, | 1 . 1 . . 5 . 3 | 2 . 7, . . 4 . 2",
                    melB: "5 . 5 6 5 . 3 1 | 2 . 2 4 2 . 6, . | 5 . 5 6 5 . 1' . | 7 . 6 . 4 . 2 . | 1' . 1' 2' 1' . 5 . | 4' . 2' . 6 . 4 . | 6 . 4 . 3 . 1 . | 2 - - - 6, - - -"
                }
            ],
            snare: [
                {   // Black Box: the warehouse held back: the acid line low and closed, the kick a pulse, the flat second waiting.
                    lvl: 0.91, rest: 2.01, slvl: 0.80, srest: 1.39, scale: PHRY, chords: ['Am', 'Am', 'Bb', 'Bb', 'Am', 'Am', 'Gm', 'Gm'], comp: [0], acid: 0.3, rumble: 0.6,
                    kick: 'x.......x.......', hush: 0.5, tick: 'x.o.x.o.x.o.x.oo', cut: 0.7,
                    melA: "1 - - - . . . . | . . 5, - 1 - - . | 4 - - - . . 2 . | 2 - - - . . . .",
                    melB: "1 . 1 . 2 . 1 . | 5, - - - . . . . | 4 . 4 . 6 . 4 . | 2 - - - . . . . | 1 . 3 . 5 . 3 . | 1 - - - 2 - 1 - | 7, . 2 . 4 . 2 . | 7, - - - 5, - - -"
                },
                {   // Tripwire: A against B flat, a hoover creeping up the D minor, never home.
                    lvl: 0.89, rest: 2.20, slvl: 0.82, srest: 1.32, scale: PHRY, chords: ['Am', 'Bb', 'Am', 'Bb', 'Dm', 'C', 'Dm', 'Bb'], comp: [0], acid: 0.25, rumble: 0.5,
                    kick: 'x.........x.....', hush: 0.5, tick: '..x...x...x..xx.', cut: 0.7,
                    melA: "1 . . . . . 3 . | 4 - - - . . . . | 1 . . 4 . . . . | 2 - - - . . . .",
                    melB: "1 - - - 5, - - - | 2 - - - 4 - - - | 1 . 1 . 3 . 5 . | 4 - - - 2 - - - | 4 . 6 . 1' . 6 . | 5 - - - 3 - - - | 4 . 1 . 6, . 4 . | 4 - - - - - . ."
                }
            ]
        },
        soft: {
            lab: [
                {   // Morning Lab: major sevenths, a Rhodes on the off-beats, a kalimba line.
                    lvl: 0.87, scale: ION, tonic: 3, oct: -1, chords: ['Cmaj7', 'Am7', 'Fmaj7', 'G6', 'Cmaj7', 'Em7', 'Fmaj7', 'Gsus4'],
                    bass: 'r......f..r.....', comp: [6, 14],
                    melA: "3 - 5 - 7 - 5 - | 6 - - - 5 - 3 - | 4 - 6 - 1' - 6 - | 5 - - - 2 - - .",
                    melB: "1' - - - 7 - 5 - | 6 - - - 1' - 3' - | 2' - - - 1' - 6 - | 7 - - - 5 - - - | 3 - 5 - 1' - 7 - | 5 - - - 7 - 3' - | 2' - 1' - 6 - 4 - | 5 - - - - - . ."
                },
                {   // Window Seat: IV – V – iii – vi, unhurried.
                    lvl: 0.83, scale: ION, tonic: 3, oct: -1, chords: ['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', 'G', 'Cmaj7', 'Cmaj7'],
                    bass: 'r.....f...r...o.', comp: [3, 10],
                    melA: "3 - 4 - 6 - 3 - | 2 - - - 7, - 5, - | 7, - 2 - 3 - 5 - | 6 - - - 3 - - .",
                    melB: "6 - 5 - 3 - 1 - | 2 - - - 4 - 7, - | 5 - 3 - 2 - 7, - | 1 - - - 3 - 5 - | 6 - - - 4 - 2 - | 7, - 2 - 4 - 5 - | 3 - 2 - 1 - 7, - | 1 - - - - - . ."
                }
            ],
            server: [
                {   // Gentle Climb: minor ninths, the bass on 1, the and of 2 and 3.
                    lvl: 0.91, scale: AEOL, chords: ['Am9', 'Fmaj7', 'Cadd9', 'G6', 'Dm9', 'Fmaj7', 'Cadd9', 'Esus4'],
                    bass: 'r......r..f.....', comp: [4, 12],
                    melA: "5 - 3 - 2 - 3 - | 1 - - - 3 - 5 - | 4 - 3 - 2 - 5, - | 2 - - - 7, - - .",
                    melB: "1' - 7 - 5 - 3 - | 5 - - - 3 - 1 - | 2 - 3 - 5 - 7 - | 5 - - - 2' - - - | 1' - - - 6 - 4 - | 3 - 5 - 1' - 7 - | 5 - 3 - 2 - 1 - | 2 - - - - - . ."
                },
                {   // Glide Path: Dorian (the bright sixth), a funky Rhodes on every off-beat.
                    lvl: 0.77, scale: DOR, chords: ['Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Am7', 'Esus4'],
                    bass: 'r..r..f.r..r..o.', comp: [2, 6, 10, 14],
                    melA: "5 - 7 - 1' - 7 5 | 6 - 5 - 4 - 1 - | 5 - 7 - 2' - 1' 7 | 6 - - - 4 - - .",
                    melB: "1' - - 7 5 - 3 - | 4 - 6 - 1' - 3' - | 2' - 1' - 7 - 5 - | 6 - - - 3' - - - | 3' - 1' - 7 - 5 - | 4' - - - 2' - 7 - | 1' - 5 - 3 - 1 - | 2 - - - 4 - - -"
                }
            ],
            snare: [
                {   // Tiptoe: minor ninths and sus chords, a mallet whispering low, the bass on one and the and of three.
                    lvl: 1.14, rest: 1.32, slvl: 0.85, srest: 1.31, scale: AEOL, chords: ['Am9', 'Am9', 'Gsus2', 'Gsus2', 'Fmaj7', 'Fmaj7', 'Esus4', 'Esus4'],
                    bass: 'r.......f.......', comp: [6, 14], kick: 'x.......x.......', hush: 0.5, tick: '...o...x...o..o.', cut: 0.8,
                    melA: "5 . . . 3 . . . | 1 - - - . . . . | 2 . . . 1 . . . | 5, - - - . . . .",
                    melB: "1 . 3 . 5 . 7 . | 5 - - - 3 - - - | 4 . 5 . 2 . 1 . | 2 - - - . . . . | 6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 5 . 4 . 2 . 1 . | 2 - - - 1 - - -"
                },
                {   // Hushed Channel: F major sevenths drifting to a Gsus4 that never lands, a kalimba line kept low.
                    lvl: 1.27, rest: 1.26, slvl: 0.85, srest: 1.31, scale: ION, tonic: 3, oct: -1, chords: ['Fmaj7', 'Fmaj7', 'Dm9', 'Dm9', 'Am7', 'Am7', 'Gsus4', 'Gsus4'],
                    bass: 'r.....r.........', comp: [10], kick: 'x.....x.........', hush: 0.5, tick: '.o...o...o...x..', cut: 0.8,
                    melA: "3 . . . . . 1 . | 6, - - - . . . . | 2 . . . 1 . . . | 2 - - - . . . .",
                    melB: "6 . 5 . 3 . 1 . | 3 - - - 5 - - - | 4 . 3 . 2 . 6, . | 1 - - - . . . . | 3 . 5 . 6 . 1' . | 5 - - - 3 - - - | 5 . 4 . 2 . 1 . | 2 - - - 5 - - -"
                }
            ]
        },
        ominous: {
            lab: [
                {   // Vigil: harmonic minor, half notes, the flat second and E7's flat ninth.
                    lvl: 0.88, scale: HARM, oct: -1, chords: ['Am', 'Am', 'Bb', 'Bb', 'Dm', 'Dm', 'E7', 'E7'], comp: [0],
                    melA: "1 - - - 3 - - - | 5 - - - - - 3 - | b2 - - - 4 - - - | 6 - - - - - . .",
                    melB: "5 - - - 6 - 5 - | 3 - - - 1 - - - | 4 - - - b2 - 4 - | 6 - - - 5 - 4 - | 4 - - - 6 - 1' - | 1' - - - 6 - 3 - | 7, - - - 2 - 4 - | 3 - - - 2 - 7, -"
                },
                {   // Static: a motif that keeps falling back to the flat second.
                    lvl: 0.95, scale: HARM, oct: -1, chords: ['Am', 'Dm', 'Am', 'Bb', 'Am', 'Dm', 'F', 'E'], comp: [0],
                    melA: "3' - - - 2' - 1' - | 1' - - - 6 - - - | 5 - - - 7, - 1 - | b2 - - - - - . .",
                    melB: "1 - - - 5 - - - | 6 - - - 4 - - - | 3 - - - 2 - 1 - | 4 - - - b2 - - - | 5 - - - 1' - - - | 6' - - - 4' - - - | 3' - - - 1' - 6 - | 7 - - - - - . ."
                }
            ],
            server: [
                {   // Descent: A against B flat, then down through F to E.
                    lvl: 0.91, scale: HARM, oct: -1, chords: ['Am', 'Bb', 'Am', 'Bb', 'Fmaj7', 'Dm', 'Bb', 'E7'], comp: [0],
                    melA: "1' - - - b2' - - - | 1' - - - 6 - - - | 1' - - - b2' - 3' - | b2' - - - - - . .",
                    melB: "5 - - - 1' - - - | b2' - - - 4' - - - | 3' - - - 1' - 5 - | 4 - - - 6 - - - | 5 - - - 3 - 1 - | 6, - - - 1 - - - | 4 - - - 6 - 1' - | 7 - - - 6 - 5 -"
                },
                {   // Undertow: a dotted figure climbing the chord, and back.
                    lvl: 0.95, scale: HARM, oct: -1, chords: ['Am', 'Am', 'Bb', 'C', 'Am', 'Am', 'Bb', 'E7'], comp: [0],
                    melA: "1 . . 3 . . 5 . | 6 . . 5 . . 3 . | b2 . . 4 . . 6 . | 5 . . 3 . . 1 .",
                    melB: "5 - - - - - 6 5 | 3 - - - 1 - - - | 4 - - - 6 - b2' - | 1' - - - 5 - - - | 1' - - - - - b2' 1' | 3 - - - 5 - - - | 4 - - - b2 - 4 - | 7, - - - 2 - - -"
                }
            ],
            snare: [
                {   // Crawlspace: a heartbeat for a kick, A against B flat, the bell far off.
                    lvl: 0.93, rest: 1.14, slvl: 0.96, srest: 1.14, scale: HARM, oct: -1, chords: ['Am', 'Bb', 'Am', 'Bb', 'Dm', 'Bb', 'E', 'E'], comp: [0],
                    kick: 'x.o.....x.o.....', hush: 0.6, tick: 'x.......o.......', cut: 0.8,
                    melA: "1 - - - . . . . | b2 - - - . . . . | 5 - - - . . . . | 4 - - - . . . .",
                    melB: "5 - - - 3 - - - | 4 - - - b2 - - - | 1 - - - 3 - 5 - | 4 - - - - - . . | 6 - - - 4 - - - | 4 - - - b2 - - - | 7, - - - 2 - - - | 5 - - - - - . ."
                },
                {   // Lights Out: Am – F – Dm – E, the line stepping down and stopping to listen.
                    lvl: 0.89, rest: 1.22, slvl: 0.93, srest: 1.24, scale: HARM, oct: -1, chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Bb', 'E7'], comp: [0],
                    kick: 'x..o............', hush: 0.6, tick: '....x.......o...', cut: 0.8,
                    melA: "5 - - - . . 3 . | 1 - - - . . . . | 4 - - - . . . . | 2 - - - . . . .",
                    melB: "1 - - - - - . . | 1 - - - 3 - - - | 4 - - - 6 - - - | 5 - - - 7, - - - | 3 - - - 5 - - - | 6 - - - 1' - - - | b2' - - - 6 - - - | 7 - - - - - . ."
                }
            ]
        },
        retro: {
            lab: [
                {   // Pixel Desk: I – V – vi – IV, a square lead with its echo channel.
                    lvl: 0.89, scale: ION, tonic: 3, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
                    melA: "1 - 3 - 5 - 3 - | 2 - 5, - 7, - 2 - | 3 - 1 - 6, - 1 - | 4 - 3 - 2 - - .",
                    melB: "5 - 5 - 6 - 5 - | 4 - 2 - 7, - 5, - | 1 - 3 - 6 - 5 - | 4 - 6 - 1' - - - | 1' - 7 - 5 - 3 - | 2 - 4 - 7 - 5 - | 6 - 4 - 1 - 4 - | 5 - - - 7, - 2 -"
                },
                {   // Save Point: IV – I – V – vi, gentle.
                    lvl: 0.91, scale: ION, tonic: 3, chords: ['F', 'C', 'G', 'Am', 'F', 'C', 'Dm', 'G'],
                    melA: "6 - 5 - 4 - 1 - | 3 - 2 - 1 - 5, - | 7, - 2 - 5 - 4 - | 3 - - - 2 - - .",
                    melB: "1' - 6 - 4 - 6 - | 5 - 3 - 1 - 3 - | 2 - 7, - 2 - 4 - | 3 - 6 - 1' - - - | 1' - 6 - 5 - 4 - | 3 - 5 - 1' - 5 - | 4 - 6 - 2' - 1' - | 7 - - - 5 - - -"
                }
            ],
            server: [
                {   // Boss Rush: A minor, a 16th-note riff, the chords arpeggiated.
                    lvl: 0.87, scale: AEOL, chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'E5'],
                    melA: "1 1 5 1' . 7 5 3 | 1 1 6 1' . 6 5 3 | 7, 7, 2 5 . 4 2 7, | 5, 5, 7, 2 . 5 2 7,",
                    melB: "1' - 7 - 1' - 3' - | 1' - 6 - 5 - 3 - | 2' - 1' - 7 - 5 - | 7 - 5 - 2 - - - | 1' - 5 - 1' - 3' - | 1' - 3' - 6 - 1' - | 4' - 3' - 2' - 6 - | 5 - - - 7 - 2' -"
                },
                {   // Turbo: Dorian's raised sixth over D, a race to the finish.
                    lvl: 0.89, scale: AEOL, chords: ['Am', 'Am', 'C', 'D', 'Am', 'Am', 'F', 'G'],
                    melA: "1' . 1' . 5 . 7 1' | . 1' 7 5 . 3 5 . | 5 . 5 . 3 . 5 1' | #6 . 5 . 4 - - .",
                    melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 3' . 1' . 5 . 3 . | #6 . 4 . 1' . #6 . | 5 . 1' . 3' . 2' . | 1' . 7 . 5 - - . | 6 . 1' . 3' . 1' . | 2' . 7 . 5 . 2' ."
                }
            ],
            snare: [
                {   // Sneaking Mission: an 8-bit infiltration: a triangle bass tiptoeing, a pulse creeping up the A minor.
                    lvl: 1.39, rest: 1.29, slvl: 0.91, srest: 1.27, scale: AEOL, chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'Esus4'],
                    bass: 'r...f...r...f.o.', walk: true, kick: 'x.......x.......', hush: 0.5, tick: '..x...x...x...x.', cut: 0.85,
                    melA: "1 . 1 . . . 3 . | 5, . . . . . . . | 6 . 6 . . . 1' . | 5 - - - . . . .",
                    melB: "1 . 3 . 5 . 1' . | 7 . 5 . 3 . 5 . | 6 . 1' . 3' . 1' . | 2' - - - 7 - - - | 1' . 1' . 7 . 5 . | 3 . 5 . 1' - - - | 6 . 4 . 6 . 1' . | 2' - - - 1' - - -"
                },
                {   // Hide and Seek: A minor seen from C, sus chords that never land, a pulse peeking out and back.
                    lvl: 1.44, rest: 1.51, slvl: 0.85, srest: 1.29, scale: ION, tonic: 3, chords: ['Am', 'Am', 'Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gsus4', 'Gsus4'],
                    bass: 'r.....r...o.....', walk: true, kick: 'x.....x.........', hush: 0.5, tick: 'o...x...o...x.o.', cut: 0.85,
                    melA: "6, . . 1 . . . . | 2 - - - . . . . | 6, . . 1 . . . . | 2 - - - 5, . . .",
                    melB: "3 . 1 . 6, . 1 . | 3 - - - 2 - - - | 1 . 3 . 5 . 3 . | 6, - - - . . . . | 4 . 6 . 1' . 6 . | 4 - - - 2 - - - | 1 . 2 . 5 . 2 . | 1 - - - 5, - - -"
                }
            ]
        }
    };
    for (const st of Object.values(SONGS)) for (const a of Object.keys(st)) st[a] = st[a].map(buildSong);
    const songFor = { lab: 0, server: 0, snare: 0 };   // which of the area's two songs plays next (flips each cycle)
    const AREAS = Object.keys(songFor);

    // Dark's acid line, as offsets from the chord's root (snapped into E Phrygian): roots, the flat second and
    // the octave, accents on the turns; the second half of each phrase answers with its own line.
    const DARK_ACID = [0, null, 0, 12, null, 1, 0, null, 3, null, 0, 12, 1, null, 0, 7];
    const DARK_ACCENT = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1];
    const DARK_ACID_B = [0, null, 12, null, 1, null, 0, 7, null, 0, null, 13, null, 12, 0, null];
    const DARK_ACCENT_B = [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0];

    // Each step gets `c`: { song, chord, next (the next bar's chord), bar (in the song), sec (FORM), barIn
    // (in the section), mel (a melody note starting now: { n, len, harm }), melGain, drums, bassOn }.
    let style = 'classic';
    const STYLES = {
        // Classic: the original techno: a pulse bass on the song's line, off-beat hats, a clap, 16th hats; dub
        // chords (a filtered saw stab with its echo a dotted 8th later), a filtered square lead with a delay
        // throw, and an arpeggio of the chord when it's flying.
        classic: {
            cutoff: k => 900 + 9000 * k * k, drive: 0,
            beat: 0.659, tones: 1.97,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 0.987, tones: 2.455 }, simpleVoice: 'triangle',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.5 * kg);
                const b = c.bassOn && bassAt(c.song, s, ch);
                if (b) synth(t, b, len * 2.2, 0.22, 'sawtooth', 220 + 1600 * k);
                if (L.off > 0.02 && s % 4 === 2) hat(t, (0.08 + 0.06 * k) * L.off);
                if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) clap(t, 0.16 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.05 * L.sixteenth, 0.025);
                if (L.pad > 0.02 && c.song.comp.includes(s)) for (const n of ch.v) {
                    synth(t, n, len * 1.6, 0.02 * L.pad, 'sawtooth', 700 + 1500 * k, 2);
                    synth(t + 3 * len, n, len * 1.4, 0.008 * L.pad, 'sawtooth', 600 + 900 * k, 2);
                }
                // The arpeggio starts a step later each bar, so the figure turns over a four-bar phrase.
                if (L.arp > 0.02) synth(t, ch.v[(s + 2 * (c.bar % 4)) % ch.v.length] + 12, len * 0.9, 0.04 * L.arp, 'square', 1200 + 2000 * L.arp);
                if (c.mel) {
                    const d = len * c.mel.len * 0.92;
                    synth(t, c.mel.n, d, 0.05 * c.melGain, 'square', 1800 + 1500 * k, 2);
                    synth(t + 3 * len, c.mel.n, d, 0.015 * c.melGain, 'square', 1100, 2);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.025, 'square', 1500, 2);
                }
            },
            // The end of every eighth bar: a clap roll building into the next phrase.
            fill(t, s, k, len, L, c) {
                clap(t, 0.08 + 0.03 * (s - 12));
                if (s === 15) synth(t, c.next.root + 24, len, 0.06, 'square', 2400);
            }
        },
        // Dark: hard warehouse techno in E Phrygian. A punchy kick with a distorted rumble rolling off it on the
        // 16ths between (on the chord's root), an acid line with a resonant filter that snaps shut on every
        // note and opens with speed, open hats on the off-beats, a ride of 16ths, a snare layered with metal on
        // 2 and 4, a low pad of detuned saws, a hoover lead, and detuned hoover stabs every other bar.
        dark: {
            cutoff: k => 1400 + 8000 * k * k, drive: 0.04, gain: 0.94, shift: -5,   // E Phrygian; trim set from measured loudness
            beat: 0.31, tones: 3.49,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 1.032, tones: 3.515 }, simpleVoice: 'sawtooth',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord, song = c.song;
                // A stealth song's acid line and rumble start held back and open up once you're spotted.
                const spot = song.kick ? c.spot : 0, acid = song.acid + (1 - song.acid) * 0.6 * spot, rumble = (song.rumble ?? 1) + (1 - (song.rumble ?? 1)) * spot;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.6 * kg, 170, 42, 0.32);
                // The rumble: a low saw on the three 16ths after each kick, fading, its filter opening with speed.
                if (c.bassOn && s % 4) synth(t, ch.root, len * 0.95, [0, 0.12, 0.09, 0.06][s % 4] * rumble, 'sawtooth', 240 + 260 * k, 1, 0);   // bright enough for small speakers
                const B = c.bar % 4 >= 2;
                const off = (B ? DARK_ACID_B : DARK_ACID)[s], acc = (B ? DARK_ACCENT_B : DARK_ACCENT)[s];
                // Always there (quieter at rest and in the lab's songs), opening up with speed.
                if (off != null && c.bassOn) synth(t, snap(song, ch.root + 12 + off), len * (acc ? 1.4 : 0.8), (acc ? 0.08 : 0.055) * (0.6 + 0.4 * L.off) * acid, 'sawtooth', 600 + 2200 * k, 12, acc ? 5 : 2.5);
                if (L.off > 0.02 && s % 4 === 2) hat(t, (0.09 + 0.05 * k) * L.off, 0.11);
                if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) { clap(t, 0.2 * L.clap); hat(t, 0.08 * L.clap, 0.05); }
                if (L.sixteenth > 0.02) hat(t, (s % 4 === 2 ? 0 : s % 2 ? 0.045 : 0.025) * L.sixteenth, 0.02);
                if (L.pad > 0.02 && s === 0 && song.comp.includes(0)) for (const [n, dt] of ch.v.map((n, i) => [n, i % 2 ? 9 : -9])) synth(t, n - 12, len * 16, 0.014 * L.pad, 'sawtooth', 500 + 700 * k, 1, 0, dt, 0.35);
                if (L.pad > 0.02) for (const st of song.comp) if (st && st === s) for (const n of ch.v) synth(t, n, len * 1.2, 0.018 * L.pad, 'sawtooth', 1600 + 1600 * k, 3, 1.5);
                if (L.arp > 0.02 && c.bar % 2 === 1 && (s === 0 || s === 10)) ch.v.slice(0, 3).forEach((n, i) => synth(t, n + 12, len * 3, 0.026 * L.arp, 'sawtooth', 1800 + 2400 * L.arp, 2, 0, [-14, 12, -6][i]));
                if (c.mel) {
                    const d = len * c.mel.len * 0.95;
                    for (const dt of [-12, 12]) synth(t, c.mel.n, d, 0.026 * c.melGain, 'sawtooth', 1300 + 1500 * k, 3, 1, dt);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.016, 'sawtooth', 1200, 3, 0, 8);
                }
            },
            // A snare roll with metal and a riser into the next phrase.
            fill(t, s, k, len) {
                clap(t, 0.12 + 0.04 * (s - 12));
                hat(t, 0.06, 0.03);
                if (s === 12) riser(t, len * 4, 0.12);
            }
        },
        // Ominous: a half-time feel on the same grid: a deep kick on 1 and 3, a sub drone on the chord's root, a
        // bell tolling a chord tone every other bar, a clock ticking, a low string pad, and a slow lead (a
        // triangle swelling in, with a faint bell an octave up).
        ominous: {
            cutoff: k => 500 + 3500 * k * k, drive: 0, gain: 1.42, shift: 3,    // C, with its flat second
            beat: 0.598, tones: 2.145,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 1.378, tones: 1.951 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s === 0 || s === 8);
                if (kg) kick(t, 0.55 * kg, 110, 32, 0.6);
                if (c.bassOn && s === 0) synth(t, ch.root, len * 16, 0.13, 'sawtooth', 160 + 260 * k);
                if (L.pad > 0.02 && s === 0 && c.bar % 2 === 0) { synth(t, ch.bell, len * 12, 0.05 * L.pad, 'sine', 4000); synth(t, ch.bell + 19, len * 6, 0.012 * L.pad, 'sine', 4000); }
                if (L.off > 0.02 && s === 0 && c.song.comp.includes(0)) pad(t, ch.v.map(n => n - 12), len * 16, 0.016 * L.off, 'triangle', 900);
                if (L.off > 0.02 && s % 4 === 2) hat(t, 0.035 * L.off, 0.02);
                if (L.clap > 0.02 && c.drums && s === 12) clap(t, 0.08 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.02 * L.sixteenth, 0.015);
                if (L.arp > 0.02 && s % 4 === 0) synth(t, ch.v[(s / 4) % ch.v.length] + 12, len * 3.5, 0.03 * L.arp, 'triangle', 1400);
                if (c.mel) {
                    const d = len * c.mel.len * 1.05;
                    synth(t, c.mel.n, d, 0.05 * c.melGain, 'triangle', 1300, 1, 0, -10, Math.min(0.08, d * 0.3));
                    synth(t, c.mel.n + 12, Math.min(d, 0.8), 0.008 * c.melGain, 'sine', 4000, 1);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.025, 'triangle', 1100, 1, 0, 10, 0.06);
                }
            },
            // A reversed swell rising into the next phrase.
            fill(t, s, k, len) {
                if (s === 12) riser(t, len * 4, 0.1);
            }
        },
        // Retro: chiptune: a short punchy kick, a triangle bass bouncing octaves on the chord's root, noise
        // snares and hats, the chord as a square arpeggio (8ths, 16ths once it's flying), and a square lead with
        // its echo channel (the same line a dotted 8th later, quieter).
        retro: {
            cutoff: k => 4000 + 9000 * k, drive: 0, gain: 1.62,
            beat: 0.701, tones: 1.829,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 1.013, tones: 1.855 }, simpleVoice: 'square',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.45 * kg, 220, 50, 0.12);
                // The bass bounces octaves on the 8ths; a song with its own line (`walk`) tiptoes it, staccato.
                if (c.bassOn && c.song.walk) { const b = bassAt(c.song, s, ch); if (b) synth(t, b + 12, len * 0.9, 0.16, 'triangle', 9000); }
                else if (c.bassOn && s % 2 === 0) synth(t, ch.root + 12 + (s % 4 === 2 ? 12 : 0), len * 1.6, 0.14, 'triangle', 9000);
                if (L.off > 0.02 && s % 4 === 2) hat(t, 0.07 * L.off, 0.02);
                if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) clap(t, 0.13 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.035 * L.sixteenth, 0.012);
                const every = L.arp > 0.5 ? 1 : 2;
                // Up on even bars, down on odd ones.
                if (L.pad > 0.02 && s % every === 0) {
                    const v = ch.v, i = (s / every) % v.length, idx = c.bar % 2 ? v.length - 1 - i : i;
                    synth(t, v[idx], len * 0.8, (0.016 + 0.014 * Math.max(L.clap, L.arp)) * L.pad, 'square', 9000);
                }
                if (c.mel) {
                    const d = len * c.mel.len * 0.85;
                    synth(t, c.mel.n, d, 0.03 * c.melGain, 'square', 9000);
                    synth(t + 3 * len, c.mel.n, d, 0.01 * c.melGain, 'square', 9000);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.016, 'square', 9000);
                }
            },
            // A noise-snare roll and a square run up the next chord into the next phrase.
            fill(t, s, k, len, L, c) {
                clap(t, 0.1 + 0.02 * (s - 12));
                synth(t, c.next.v[(s - 12) % c.next.v.length] + 12, len * 0.8, 0.035, 'square', 9000);
            }
        },
        // Soft: deep and gentle: a soft kick, a round bass on the song's line, a pad of the chord each bar, a
        // Rhodes-like comp (soft sines) on the song's off-beats, quiet shakers, a rim, a kalimba lead (a sine
        // with a bright octave tick) and a sine arpeggio rising two bars and falling two.
        soft: {
            cutoff: k => 700 + 4500 * k * k, drive: 0, gain: 1.7, shift: 5,     // D minor / F major
            beat: 0.738, tones: 1.487,   // drums 2 dB under the tones, measured (K-weighted)
            simpleMix: { gain: 1, beat: 0.997, tones: 2.032 }, simpleVoice: 'sine',   // the simple version (simpleStep)
            step(t, s, k, len, L, c) {
                const ch = c.chord;
                const kg = kickLevel(c, s, s % 4 === 0);
                if (kg) kick(t, 0.32 * kg, 110, 48, 0.22);
                if (L.pad > 0.02 && s === 0) pad(t, ch.v, len * 16, 0.02 * L.pad);
                const b = c.bassOn && bassAt(c.song, s, ch);
                if (b) synth(t, b, len * 3, 0.16, 'triangle', 500 + 600 * k);
                if (L.off > 0.02 && s % 2 === 1) hat(t, 0.025 * L.off, 0.03);
                if (L.clap > 0.02 && s === 12) hat(t, 0.06 * L.clap, 0.08);
                if (L.off > 0.02 && c.song.comp.includes(s)) for (const n of ch.v) synth(t, n + 12, len * 2.5, 0.009 * L.off, 'sine', 3000, 1);
                if (L.arp > 0.02 && s % 2 === 0) {
                    const v = ch.v, i = (s / 2) % v.length;
                    synth(t, v[c.bar % 4 >= 2 ? v.length - 1 - i : i] + 12, len * 1.8, 0.03 * L.arp, 'sine', 3000);
                }
                if (c.mel) {
                    const d = Math.min(len * c.mel.len * 1.1, 0.9);
                    synth(t, c.mel.n, d, 0.06 * c.melGain, 'sine', 4000, 1);
                    synth(t, c.mel.n + 12, 0.07, 0.012 * c.melGain, 'sine', 5000, 1);
                    if (c.mel.harm) synth(t, c.mel.harm, d, 0.03, 'sine', 4000, 1);
                }
            },
            // A soft rim pattern and the next chord's top note leading into the next phrase.
            fill(t, s, k, len, L, c) {
                if (s === 12 || s === 14 || s === 15) hat(t, 0.05, 0.07);
                if (s === 14) synth(t, c.next.v[c.next.v.length - 1] + 12, len * 3, 0.035, 'sine', 3000);
            }
        }
    };
    // Packet Snare's songs are stealth versions of each track: until you're spotted their kick plays its own sparse
    // pattern (`kick`: 'x' a kick, 'o' a softer one), hushed (`hush`), and crossfades into the track's own as the
    // clap's layer comes in (the busier the field and the lower your Focus, the more of it); a quiet clock ticks
    // (`tick`, the same marks) and hides under the 16th hats as they arrive; the whole mix sits under a closed
    // filter at rest (`cut`) that opens with the intensity. `kickLevel` is the kick's level on a step (0: none).
    function kickLevel(c, s, on, plain = false) {
        if (!c.drums && !plain) return 0;
        const p = c.song.kick;
        if (!p) return on ? 1 : 0;
        const hid = (p[s] === 'x' ? 1 : p[s] === 'o' ? 0.6 : 0) * (c.song.hush ?? 1);
        const g = hid * (1 - c.spot) + (on ? c.spot : 0);
        return g > 0.02 ? g : 0;
    }
    function stealthStep(t, s, k, len, L, c) {
        const m = c.song.tick?.[s];
        if (!m || m === '.' || !c.drums) return;
        const st = STYLES[style] || STYLES.classic;
        hat(t, (m === 'x' ? 1 : 0.55) * 0.05 * (st.tick ?? 1) * (1 - 0.7 * L.sixteenth), 0.014);
    }

    // Simple sounds: each song stripped to its bones, in its key: a kick (Ominous's on 1 and 3), the bass on
    // beats 1 and 3 on the chord's root, one held chord tone each bar (voice-led, so it never rubs), and the
    // melody in a plain sine (Retro: a square), all in the track's plain voice; no hats, claps, chords,
    // arpeggios, fills or drive.
    function simpleStep(st, t, s, k, len, c, L) {
        const sv = st.simpleVoice || 'triangle';
        const kg = kickLevel(c, s, st === STYLES.ominous ? s % 8 === 0 : s % 4 === 0, true);
        if (kg) kick(t, 0.38 * kg, 130, 45, 0.22);
        if (s === 0 || s === 8) synth(t, c.chord.root + 12, len * 6, 0.16, sv, 700, 1);
        if (L.pad > 0.02 && s === 0) synth(t, c.chord.hold, len * 14, 0.035 * L.pad, 'sine', 3000, 1);
        if (c.mel) synth(t, c.mel.n, Math.min(len * c.mel.len * 0.9, 0.7), 0.03 * c.melGain * (sv === 'square' ? 0.5 : 1), sv === 'square' ? 'square' : 'sine', 2500, 1);
    }

    // The bus level for the music volume, and each beat's trim (`gain` on the style, measured RMS against Classic,
    // all at the same level (K-weighted, within about 1 dB of Classic; re-measure if a track changes).
    const musicLevel = () => musicVolume * 0.55;
    const styleTrim = () => { const st = STYLES[style] || STYLES.classic; return (simple ? st.simpleMix?.gain : st.gain) || 1; };
    function setMusicStyle(name) {
        if (!STYLES[name]) return;
        style = name;
        chargeStop();
        if (music) {
            music.trim.gain.setTargetAtTime(styleTrim(), ctx.currentTime, 0.3);
            for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.3);
        }
    }

    // Layers fade in and out over a couple of bars rather than switching on a threshold: the intensity
    // eases toward the ball's speed (faster on the way up than down), each layer's level ramps across a
    // band around its threshold, and the tempo glides into and out of flow's slow-down.
    const RISE = 1.2, FALL = 3;       // seconds (time constants) for the intensity to follow speed
    const layer = (k, at) => Math.max(0, Math.min(1, (k - at) / 0.2 + 0.5));
    const songsOf = () => (SONGS[style] || SONGS.classic);
    const areaSongs = a => songsOf()[a] || songsOf().server;
    // On a downbeat: change song if the area changed (the old area's place is kept, to its section), after a
    // whole song (the area's other one), or on a debug command.
    function songTurn() {
        const m = music;
        const bar = Math.floor((m.step - m.songStep) / 16);
        if (m.area !== area) {
            m.left[m.area] = { song: m.song, bar: Math.floor(bar / 8) * 8 % SONG_BARS };
            const back = m.left[area];
            m.area = area;
            m.song = back ? back.song : songFor[area];
            m.songStep = m.step - 16 * (back ? back.bar : 0);
        } else if (m.cmd === 'song' || bar >= SONG_BARS) {
            m.song = songFor[area] = (m.song + 1) % 2;
            m.songStep = m.step;
        } else if (m.cmd === 'section') m.songStep = m.step - 16 * ((Math.floor(bar / 8) + 1) * 8 % SONG_BARS);
        m.cmd = null;
    }
    function songContext(s) {
        const m = music, song = areaSongs(m.area)[m.song];
        const bar = Math.floor((m.step - m.songStep) / 16), barIn = bar % 8;
        const sec = FORM[Math.floor(bar / 8) % FORM.length];
        let e = null;
        if (sec === 'A' || sec === 'A2' || sec === 'break') e = song.melA[(barIn % 4) * 16 + s];
        else if (sec === 'B') e = song.melB[barIn * 16 + s];
        const n = song.chords.length;
        return {
            song, bar, barIn, sec, chord: song.chords[bar % n], next: song.chords[(bar + 1) % n],
            mel: e && { n: melNote(song, e), len: e.len, harm: sec === 'A2' ? melNote(song, e, -2) : 0 },
            melGain: sec === 'break' ? 0.6 : 1,
            drums: !(sec === 'break' && barIn < 6), bassOn: !(sec === 'break' && barIn < 4)
        };
    }
    function schedule() {
        if (!music || ctx.state !== 'running' || document.hidden) return;
        const now = ctx.currentTime;
        const dt = Math.min(0.5, now - (music.last ?? now));
        music.last = now;
        music.k ??= intensity;
        music.k += (intensity - music.k) * (1 - Math.exp(-dt / (intensity > music.k ? RISE : FALL)));
        const k = music.k;
        const slow = mode === 'flow' || mode === 'freeze';
        const target = STEP / (slow ? 0.6 : 1);
        while (music.nextStep < now + 0.12) {
            // The tempo glides a step at a time (about a bar to settle).
            const len = Math.abs(clock.len - target) < 1e-4 ? target : clock.len + (target - clock.len) * 0.12;
            if (len !== clock.len) retime(len, music.step, music.nextStep);
            const t = music.nextStep;
            const s = ((music.step % 16) + 16) % 16;
            if (s === 0) songTurn();
            // The arrangement builds: what the game has earned (`depth`) and the run's speed (`k`) add up to how
            // many parts play, each fading in over a band: chords, then off-beat hats, the melody, a clap, 16th
            // hats, the A2 harmony and fills, the arpeggio. A new game at rest is a kick and a bass.
            const S = 0.6 * depth + 0.6 * Math.max(0, k - 0.05);
            const L = { pad: layer(S, 0.12), off: layer(S, 0.28), mel: layer(S, 0.4), clap: layer(S, 0.52), sixteenth: layer(S, 0.64), harm: layer(S, 0.72), arp: layer(S, 0.82) };
            const st8 = STYLES[style] || STYLES.classic;
            const c = songContext(s);
            if (s === 0) { (music.chordLog ||= []).push({ t, ch: c.chord }); if (music.chordLog.length > 3) music.chordLog.shift(); }
            // A stealth song's tones stand a little forward while its drums are hushed (`rest`), so it keeps the level.
            c.spot = L.clap;
            const lvl = simple ? c.song.slvl ?? c.song.lvl : c.song.lvl, rest = simple ? c.song.srest ?? c.song.rest : c.song.rest;
            songLvl = lvl * (rest ? 1 + (rest - 1) * (1 - c.spot) : 1);
            // The melody waits for its layer; the A2 harmony for its own.
            if (c.mel && L.mel <= 0.02) c.mel = null;
            if (c.mel) { c.melGain *= L.mel; if (L.harm < 0.5) c.mel.harm = 0; }
            try {
                if (simple) simpleStep(st8, t, s, k, len, c, L);
                else {
                    st8.step(t, s, k, len, L, c);
                    if (c.song.tick) stealthStep(t, s, k, len, L, c);
                    // Every eighth bar ends in a fill, so the song phrases instead of repeating one bar for ever.
                    if (st8.fill && L.off > 0.5 && c.barIn === 7 && s >= 12) st8.fill(t, s, k, len, L, c);
                }
            } catch { /* a bad note never stops the music */ }
            songLvl = 1;
            music.nextStep += len;
            music.step++;
        }
        // The mood: muffled in flow and bullet time, distorted in a crunch, opening up with speed.
        const st = STYLES[style] || STYLES.classic;
        const cut = areaSongs(music.area)[music.song]?.cut;
        const cutoff = slow ? 600 : st.cutoff(k) * (cut ? cut + (1 - cut) * k : 1);
        music.filter.frequency.setTargetAtTime(cutoff, now, slow ? 0.6 : 0.5);
        music.wet.gain.setTargetAtTime(mode === 'crunch' ? 0.55 : simple ? 0 : st.drive, now, 0.15);
        music.dry.gain.setTargetAtTime(mode === 'crunch' ? 0.6 : 1, now, 0.15);
    }

    // Where the player is (game.js): 'lab' (the lab, Surveillance, R&D), 'server' (the server room and its bays) or
    // 'snare' (Packet Snare's bay); anything else is the lab. The music changes song on the next bar.
    function setArea(a) { area = AREAS.includes(a) ? a : 'lab'; }
    function setDepth(d) { depth = Math.max(0, Math.min(1, Number(d) || 0)); }
    // What's playing (the debug panel), and debug commands on the next downbeat: the area's other song, or the
    // next section.
    function songNow() {
        if (!music) return null;
        const bar = Math.floor((music.step - music.songStep) / 16);
        return { area: music.area, song: music.song + 1, section: FORM[Math.floor(bar / 8) % FORM.length], bar: (bar % 8) + 1 };
    }
    function songCmd(cmd) { if (music) music.cmd = cmd; }

    // The ball's speed (0-1), and the power-up shaping the beat, from game.js.
    function musicState(k, m = null) {
        intensity = Math.max(0, Math.min(1, Number(k) || 0));
        mode = m;
        if (musicVolume > 0 && ctx?.state === 'running') startMusic();
    }

    // A breakthrough: a rising swell into the filter, then a crash on the next beat.
    function swell() {
        if (!music) return;
        const now = ctx.currentTime;
        const hit = nextStep(4, 0.45).t;            // the crash lands on a beat, half a second or so away
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
    function setMusicMix(m) {
        for (const k of Object.keys(musicMix)) if (m && m[k] != null) musicMix[k] = Math.max(0, Math.min(1, Number(m[k]) || 0));
        if (music) for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.05);
    }
    // A part's level: the player's slider times the track's balance (`beat`/`tones` on the style: the drums sit
    // about 2 dB under the tones on every track, measured; at an even split the beat drowned the music).
    // The beat (kick, hats, claps, fills) plays only while training (`setTraining`); everywhere else the music
    // is its tones alone.
    const partLevel = k => { const st = STYLES[style] || STYLES.classic; return musicMix[k] * ((simple ? st.simpleMix?.[k] : st[k]) ?? 1) * (k === 'beat' && !training ? 0 : 1); };
    // In the training run view (game.js): the beat comes in over about a bar, and leaves the same way.
    function setTraining(on) {
        on = !!on;
        if (on === training) return;
        training = on;
        if (music) music.parts.beat.gain.setTargetAtTime(Math.max(0.0001, partLevel('beat')), ctx.currentTime, 0.6);
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
            for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.2);
        }
    }
    window.SFX = { play, holdDelay, setArea, setDepth, setTraining, songCmd, get song() { return songNow(); }, setMusicMix, get musicMix() { return { ...musicMix }; }, setMix, setSimple, get mix() { return { ...mix }; }, get simple() { return simple; }, setMusicStyle, MUSIC_STYLES: ['classic', 'dark', 'soft', 'ominous', 'retro'], get musicStyle() { return style; }, charge, chargeStop, setVolume, setMusic, musicState, swell, get volume() { return volume; }, get state() { return ctx ? ctx.state : 'none'; }, get playing() { return !!music; }, get musicVolume() { return musicVolume; } };
})();
