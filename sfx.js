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
        if (!simple && !opts.raw) { f0 = keyHz(f0); f1 = keyHz(f1); }
        else if (simple && varDeg) { const r = Math.pow(2, [0, 2, -2, 4][VARIANTS.findIndex(v => v[0] === varDeg)] / 12); f0 *= r; f1 *= r; }
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
        const t = ctx.currentTime + base + at;
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
        const t = ctx.currentTime + base + at;
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
    // Phone speakers push the upper mids, where compute's square blip sits: it's quieter and darker there.
    const PHONE = !!window.matchMedia?.('(pointer: coarse)').matches;
    const CLICK_NOTES = {
        cp: [81, 76, 79, 76, 84, 76, 79, 74],       // compute: a bright square figure round A5
        dp: [69, 64, 67, 64, 72, 64, 67, 62],       // data: an octave down, rounder
        rp: [88, 84, 86, 81, 91, 84, 86, 79]        // research: up high, bell-like
    };
    const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];   // the meter climbs these, A3 to A5

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
        legacy: [
            g => { stab([57, 64, 69, 72, 76], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(33, 33, 0.8, 0.2 * g); },
            g => { stab([55, 62, 67, 71, 74], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(31, 31, 0.8, 0.2 * g); },
            g => { stab([53, 60, 64, 69, 72], { gain: 0.045 * g, dur: 0.7, cutoff: 2600 }); sub(29, 29, 0.8, 0.2 * g); }
        ]
    };

    // A click's note: where it falls in the bar picks it from the job's figure.
    function clickNote(res) {
        const notes = CLICK_NOTES[res] || CLICK_NOTES.cp;
        const i = clock ? Math.floor(Math.round(stepAt(ctx.currentTime + base)) / 2) % 8 : 0;
        return notes[(i + 8) % 8];
    }

    const SOUNDS = {
        // Workbench jobs: a blip on the bar's current 8th (a hold lands on the 8ths: see holdDelay).
        click: ({ res = 'cp' } = {}) => {
            const n = clickNote(res);
            if (res === 'dp') tone({ f0: NOTE(n), dur: 0.12, type: 'triangle', gain: 0.13, cutoff: 1600 });
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
        // An investor's reward claimed: a bright figure, varied.
        claim: () => [
            () => arp([76, 81, 84, 88, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
            () => arp([81, 88, 84, 93], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 }),
            () => arp([72, 76, 79, 84, 88], S() / 2, { type: 'triangle', gain: 0.06, cutoff: 5000 })
        ][vary('claim', 3)](),
        error: () => tone({ f0: NOTE(52), f1: NOTE(45), dur: 0.12, type: 'square', gain: 0.05, cutoff: 700 }),
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
    const PANEL_INST = { hardware: 0, legacy: 0, software: 1, consciousness: 1, algorithms: 2, training: 2 };
    const PANEL_OCT = { hardware: 0, software: 12, algorithms: 12, consciousness: -12, training: 0, legacy: -12 };
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

    // Each track's sound set, levelled to Classic's loudness (measured with a K-weighted meter, like the music).
    const SFX_TRIM = { classic: 1, dark: 1.18, soft: 1.03, ominous: 0.76, retro: 1.82 };

    const TRACK_SOUNDS = {
        dark: {
            click: ({ res = 'cp' }) => { saw(clickNote(res) - 12, { dur: 0.06, gain: phone(0.045) }); metal(phone(0.035)); },
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
            error: () => { saw(40, { dur: 0.18, gain: 0.05, cutoff: 600 }); saw(41, { dur: 0.18, gain: 0.04, cutoff: 600 }); },
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
            ship: () => { [45, 52, 57].forEach(n => saw(n, { dur: 1.6, gain: 0.04, cutoff: 1200, attack: 0.05 })); T(33, { to: 21, dur: 1.6, gain: 0.3 }); [0, 2, 4].forEach(k => metal(0.06, k * S(), 3600)); }
        },
        soft: {
            click: ({ res = 'cp' }) => marimba(clickNote(res) - (res === 'rp' ? 0 : 12), { gain: phone(0.06) }),
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
            ship: () => { padChord([57, 64, 69, 72, 76], { dur: 2 }); [69, 76, 81, 88].forEach((n, i) => softBell(n, { at: i * S(), gain: 0.04 })); }
        },
        ominous: {
            click: ({ res = 'cp' }) => { knock(clickNote(res) - 24, { gain: phone(0.07) }); T(clickNote(res) + 12, { type: 'sine', dur: 0.4, gain: phone(0.006), detune: -15 }); },
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
            error: () => { T(52, { type: 'sawtooth', dur: 0.3, gain: 0.035, cutoff: 600 }); T(53, { type: 'sawtooth', dur: 0.3, gain: 0.035, cutoff: 600 }); },
            ui: () => noise({ dur: 0.02, gain: 0.04, f0: 2500, q: 12 }),
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
            ship: () => { [0, 2, 4].forEach(k => toll(45 + k * 6, { at: k * S(), gain: 0.06 })); T(33, { dur: 2.4, gain: 0.22, attack: 0.4 }); }
        },
        retro: {
            click: ({ res = 'cp' }) => { const n = clickNote(res); sq(n, { dur: 0.03, gain: phone(0.03) }); sq(n + 12, { dur: 0.04, gain: phone(0.025), at: 0.03 }); },
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
            error: () => seq([45, 44], 0.12, { type: 'square', dur: 0.11, gain: 0.03 }),
            ui: () => sq(93, { dur: 0.015, gain: 0.02 }),
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
            ship: () => { seq([69, 0, 69, 76, 81, 0, 88], S() / 2, { type: 'square', dur: 0.1, gain: 0.032 }); seq([45, 0, 45, 52, 57, 0, 64], S() / 2, { type: 'triangle', dur: 0.12, gain: 0.08 }); }
        }
    };

    // Sound groups, each with its own volume in Settings (per device): a group at 0 is silent.
    const GROUPS = {
        clicks: ['click'],
        buys: ['buy', 'buyBig', 'claim'],
        training: ['sprint', 'clean', 'perfect', 'system', 'breakthrough', 'smash', 'windup', 'launch', 'land', 'nearMiss', 'crunch', 'flow', 'freeze', 'release'],
        events: ['summit', 'runEnd', 'record', 'viral', 'achievement', 'phase', 'ship'],
        ui: ['ui', 'error']
    };
    const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, names]) => names.map(n => [n, g])));
    const mix = { clicks: 1, buys: 1, training: 1, events: 1, ui: 1 };
    function setMix(m) { for (const k of Object.keys(mix)) if (m && m[k] != null) mix[k] = Math.max(0, Math.min(1, Number(m[k]) || 0)); }

    // Simple sounds only: plain short sine beeps, nothing on the grid, no arpeggios or variations.
    let simple = false;
    const beep = (f, dur = 0.08, gain = 0.07, at = 0) => tone({ f0: f, dur, type: 'sine', gain, at });
    const SIMPLE = {
        click: () => beep(880, 0.04, 0.05),
        buy: () => { beep(660, 0.07); beep(880, 0.09, 0.07, 0.06); },
        buyBig: () => { beep(660, 0.07); beep(880, 0.07, 0.07, 0.06); beep(1100, 0.1, 0.07, 0.12); },
        claim: () => { beep(880, 0.07); beep(1320, 0.1, 0.07, 0.07); },
        error: () => beep(220, 0.12, 0.05),
        ui: () => beep(1200, 0.03, 0.04),
        sprint: ({ charge = 1 } = {}) => beep(220 + 220 * charge, 0.12, 0.06 + 0.06 * charge),
        clean: () => beep(1320, 0.1),
        perfect: () => { beep(1320, 0.08); beep(1760, 0.12, 0.07, 0.07); },
        system: () => { beep(1320, 0.08); beep(1760, 0.08, 0.07, 0.07); beep(2200, 0.14, 0.07, 0.14); },
        land: ({ impact = 3 } = {}) => beep(110, 0.12, 0.05 + 0.1 * Math.min(1, impact / 15)),
        summit: () => { beep(660, 0.1); beep(880, 0.1, 0.07, 0.1); beep(1320, 0.25, 0.07, 0.2); },
        achievement: () => { beep(880, 0.1); beep(1320, 0.2, 0.07, 0.1); },
        default: () => beep(660, 0.12)
    };

    // Stingers wait for the grid: steps to quantize to (1 = the next 16th, 2 = the next 8th).
    const QUANT = { buy: 1, buyBig: 1, claim: 1, summit: 2, record: 1, runEnd: 1, viral: 1, achievement: 1, phase: 2, ship: 2 };
    // Minimum seconds between two plays of the same sound (clicks and dust can come in floods).
    const GAP = { click: 0.045, land: 0.08, launch: 0.15, buy: 0.05, ui: 0.05, error: 0.2, clean: 0.05 };

    function play(name, opts) {
        const gv = mix[GROUP_OF[name] || 'ui'];
        if (volume <= 0 || gv <= 0 || !SOUNDS[name] || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (last[name] != null && now - last[name] < (GAP[name] ?? 0.03)) return;
        last[name] = now;
        // A held click (`q` from game.js) or a stinger lands on the grid; a grid point too far off plays now.
        const div = simple ? 0 : opts?.q ?? QUANT[name];
        base = div ? Math.max(0, nextStep(div).t - now) : 0;
        if (base > 0.25) base = 0;
        gmul = gv * (simple ? 1 : SFX_TRIM[style] || 1);
        if (name !== 'click') [varDeg, varNoise] = VARIANTS[vary('v:' + name, VARIANTS.length)];
        // A track's own version of the sound if it has one (TRACK_SOUNDS), else the shared one in its profile.
        const own = !simple && TRACK_SOUNDS[style]?.[name === 'buyBig' ? 'buy' : name];
        ownSound = !!own;
        try {
            if (simple) (SIMPLE[name] || SIMPLE.default)(opts);
            else if (own) own(name === 'buyBig' ? { ...opts, big: true } : opts || {});
            else SOUNDS[name](opts);
        } catch { /* a bad node never breaks the game */ }
        base = 0;
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

    // The sprint meter: a soft tone that rises with the charge while you hold.
    // The meter: most charges are a quiet pluck that retriggers on the track's 16ths and climbs the pentatonic
    // with the charge, so it plays along with the beat. Now and then (once in 25 to 50 charges) a special voice
    // takes over for one charge, never the same special twice running.
    const CHORD = [57, 60, 64, 67, 69, 72, 76, 79, 81];           // Am7 tones, A3 to A5
    const pick = (list, l) => list[Math.min(list.length - 1, Math.floor(l * list.length))];
    const BASE_VOICE = { type: 'triangle', gain: 0.022, sustain: 0.35, cutoff: () => 1800, note: l => pick(PENTA, l) };
    const SPECIAL_VOICES = [
        // Chord tones only, a filtered square opening as it rises.
        { type: 'square', gain: 0.026, sustain: 0.4, cutoff: l => 600 + 3000 * l, note: l => pick(CHORD, l) },
        // Octave hops on the 16ths while it climbs.
        { type: 'triangle', gain: 0.03, sustain: 0.3, cutoff: () => 3000, note: (l, n) => pick(PENTA, l) - 12 + (n % 2 ? 12 : 0) },
        // An acid line: a low A whose resonant filter sweeps open with the charge.
        { type: 'sawtooth', gain: 0.028, sustain: 0.6, q: 10, cutoff: l => 180 * Math.pow(20, l), note: (l, n) => (n % 4 === 3 ? 57 : 45) },
        // A gated pad: short chops on every 16th, opening as it fills.
        { type: 'sawtooth', gain: 0.026, sustain: 0.05, cutoff: l => 900 + 1800 * l, note: l => pick(PENTA, l) }
    ];
    const SPECIAL_EVERY = [25, 50];
    let specialIn = SPECIAL_EVERY[0] + Math.floor(Math.random() * (SPECIAL_EVERY[1] - SPECIAL_EVERY[0] + 1));
    let lastSpecial = -1;

    function chargeVoice() {
        if (--specialIn > 0) return BASE_VOICE;
        specialIn = SPECIAL_EVERY[0] + Math.floor(Math.random() * (SPECIAL_EVERY[1] - SPECIAL_EVERY[0] + 1));
        let i = Math.floor(Math.random() * SPECIAL_VOICES.length);
        if (i === lastSpecial) i = (i + 1 + Math.floor(Math.random() * (SPECIAL_VOICES.length - 1))) % SPECIAL_VOICES.length;
        lastSpecial = i;
        return SPECIAL_VOICES[i];
    }

    // One 16th of the meter: the note for the charge then, struck at time t and decaying to its sustain.
    function strikeCharge(c, l, n, t) {
        const v = c.v;
        const P = simple ? null : PROFILES[style];
        const hz = NOTE(v.note(l, n) + (P?.oct || 0) * 12);
        c.o.frequency.setValueAtTime(simple ? hz : keyHz(hz), t);   // in the track's key, like every sound
        c.f.frequency.setTargetAtTime(v.cutoff(l), t, 0.02);
        c.g.gain.cancelScheduledValues(t);
        const lvl = mix.training * (simple ? 1 : SFX_TRIM[style] || 1);
        c.g.gain.setValueAtTime(v.gain * lvl, t);
        c.g.gain.setTargetAtTime(Math.max(0.0001, v.gain * v.sustain * lvl), t + 0.005, 0.045);
        c.sched = n;
    }

    function charge(level, free = false) {
        if (volume <= 0 || mix.training <= 0 || !ensure() || ctx.state !== 'running') return;
        free = free || simple;   // simple sounds: a plain rising tone
        const now = ctx.currentTime;
        const l = Math.max(0, Math.min(1, level));
        if (!chargeOsc) {
            // `free` (act two's thrust) is a smooth glide instead.
            const v = free ? null : chargeVoice();
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            const g = ctx.createGain();
            const P = simple ? null : PROFILES[style];
            o.type = free ? 'triangle' : P ? P.wave(v.type, 440) : v.type;
            f.type = 'lowpass';
            f.frequency.value = free ? 4000 : v.cutoff(l);
            f.Q.value = v?.q || 1;
            g.gain.value = 0.0001;
            if (free) g.gain.setTargetAtTime(0.04 * mix.training, now, 0.03);
            o.connect(f).connect(g).connect(master);
            o.start();
            chargeOsc = { o, f, g, v, free, sched: -Infinity };
            // The press sounds at once; after that the notes land on the grid.
            if (!free) strikeCharge(chargeOsc, l, Math.floor(stepAt(now)), now);
        }
        const c = chargeOsc;
        if (c.free) {
            c.o.frequency.setTargetAtTime((simple ? NOTE(57) : keyHz(NOTE(57))) * Math.pow(2, 2 * l), now, 0.015);
            return;
        }
        // Schedule the next 16th a little ahead, so it's struck exactly on the beat.
        const next = Math.floor(stepAt(now)) + 1;
        if (c.sched < next && stepTime(next) - now < 0.06) strikeCharge(c, l, next, stepTime(next));
    }

    function chargeStop() {
        if (!chargeOsc) return;
        const { o, g } = chargeOsc;
        chargeOsc = null;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        o.stop(ctx.currentTime + 0.2);
    }

    // ---- Music: a techno backbeat that follows the run -------------------------------------------------
    // A step sequencer (16 steps a bar) scheduled a little ahead on the audio clock. Layers come in with the
    // intensity (0-1, from the ball's speed in game.js): kick and bass always, off-beat hats, then a clap, 16th
    // hats and an arpeggio when it's flying. Power-ups bend it: a crunch distorts it, flow and bullet time slow
    // and muffle it, a breakthrough is a swell that opens the filter and lands on a crash. Its own volume
    // (`setMusic`), so sounds and music can be set apart; silent until the first gesture, like everything here.
    let music = null;               // { bus, drive, dry, wet, filter, nextStep, step, timer }
    let musicVolume = 0.35;
    let intensity = 0;
    let mode = null;                // null | 'crunch' | 'flow' | 'freeze'
    const BASS = [45, 0, 0, 45, 0, 0, 48, 0, 45, 0, 0, 43, 0, 0, 40, 0];   // A minor, a pulse with a lift
    const ARP = [69, 72, 76, 79, 76, 72, 69, 64];
    const BASS_B = [45, 0, 0, 45, 0, 0, 48, 0, 50, 0, 0, 48, 0, 45, 43, 0];  // the fourth bar of a phrase answers

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
        const first = nextStep(1, 0.05);           // joins the clock, so it's in time with the grid sounds already use
        music = { bus, parts, drive, dry, wet, filter, trim, nextStep: first.t, step: first.n };
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

    // One voice into the music bus.
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
    // A soft chord held for a bar (the Soft beat's pad): slow attack, gentle release.
    function pad(t, notes, dur, gain) {
        for (const n of notes) voice(g => {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            o.type = 'triangle';
            o.frequency.value = NOTE(n + shift());
            o.detune.value = (Math.random() - 0.5) * 10;
            f.type = 'lowpass';
            f.frequency.value = 1400;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
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
    // A pitched voice; `q` the filter's resonance, `env` sweeps the filter down from cutoff × (1 + env) (acid).
    function synth(t, note, dur, gain, type, cutoff, q = 6, env = 0, detune = 0) {
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
            g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(f).connect(g);
            o.start(t);
            o.stop(t + dur + 0.02);
        });
    }

    // Three beats to pick from (Settings → Beat, per device), all at 124 BPM in A minor so every sound and the
    // held clicks still sit on them; the layers come in with the same intensity bands.
    // - Classic: the original: a pulse bass with a lift, off-beat hats, a clap, 16th hats, a square arpeggio.
    // - Dark: harder and heavier: a longer, deeper kick, a distorted rolling 16th bass on A with a flat-two
    //   (B flat) turn, metallic hats, a driven snare and sparse minor stabs; drive always partly in.
    // - Soft: deep and gentle: a soft kick, a round bass on the beats, a pad moving Am – F – C – G a bar each,
    //   quiet shakers, a rim, and a soft sine arpeggio.
    let style = 'classic';
    // Dark's acid line (written in A, played in E): roots, the flat second and the octave, accents on the turns.
    const DARK_ACID = [45, 0, 45, 57, 0, 46, 45, 0, 48, 0, 45, 57, 46, 0, 45, 52];
    const DARK_ACCENT = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1];
    const DARK_ACID_B = [45, 0, 57, 0, 46, 0, 45, 52, 0, 45, 0, 58, 0, 57, 45, 0];
    const DARK_ACCENT_B = [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0];
    const PROGRESSION = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 60, 64, 67], [55, 59, 62, 67]];
    const ROOTS = [45, 41, 48, 43];
    const STYLES = {
        classic: {
            cutoff: k => 900 + 9000 * k * k, drive: 0,
            beat: 0.659, tones: 1.97,   // drums 2 dB under the tones, measured (K-weighted)
            step(t, s, k, len, L, bar) {
                const bass = bar % 4 === 3 ? BASS_B : BASS;
                if (s % 4 === 0) kick(t, 0.5);
                if (bass[s]) synth(t, bass[s], len * 2.2, 0.22, 'sawtooth', 220 + 1600 * k);
                if (L.off > 0.02 && s % 4 === 2) hat(t, (0.08 + 0.06 * k) * L.off);
                if (L.clap > 0.02 && (s === 4 || s === 12)) clap(t, 0.16 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.05 * L.sixteenth, 0.025);
                // The arpeggio starts a step later each bar, so the figure turns over a four-bar phrase.
                if (L.arp > 0.02) synth(t, ARP[(s + 2 * (bar % 4)) % ARP.length] + 12, len * 0.9, 0.05 * L.arp, 'square', 1200 + 2000 * L.arp);
            },
            // The end of every eighth bar: a clap roll building into the next phrase.
            fill(t, s, k, len, L) {
                clap(t, 0.08 + 0.03 * (s - 12));
                if (s === 15) synth(t, 57, len, 0.06, 'square', 2400);
            }
        },
        // Dark (reimagined): hard warehouse techno in E Phrygian. A punchy kick with a distorted rumble rolling
        // off it on the 16ths between (the sub that makes the genre), an acid line with a resonant filter that
        // snaps shut on every note and opens with speed, open hats on the off-beats, a ride of 16ths, a snare
        // layered with metal on 2 and 4, and a detuned hoover stab with a flat second every other bar.
        dark: {
            cutoff: k => 1400 + 8000 * k * k, drive: 0.04, gain: 0.94, shift: -5,   // E Phrygian; trim set from measured loudness
            beat: 0.31, tones: 3.49,   // drums 2 dB under the tones, measured (K-weighted)
            step(t, s, k, len, L, bar) {
                if (s % 4 === 0) kick(t, 0.6, 170, 42, 0.32);
                // The rumble: a low saw on the three 16ths after each kick, fading, its filter opening with speed.
                if (s % 4) synth(t, 33, len * 0.95, [0, 0.12, 0.09, 0.06][s % 4], 'sawtooth', 240 + 260 * k, 1, 0);   // bright enough for small speakers
                // The acid line, in from the off-beat hats' band.
                const B = bar % 4 >= 2;   // the second half of each phrase answers with its own line
                const acid = (B ? DARK_ACID_B : DARK_ACID)[s], acc = (B ? DARK_ACCENT_B : DARK_ACCENT)[s];
                // Always there (quieter at rest, so the lab has its line too), opening up with speed.
                if (acid) synth(t, acid, len * (acc ? 1.4 : 0.8), (acc ? 0.08 : 0.055) * (0.6 + 0.4 * L.off), 'sawtooth', 600 + 2200 * k, 12, acc ? 5 : 2.5);
                if (L.off > 0.02 && s % 4 === 2) hat(t, (0.09 + 0.05 * k) * L.off, 0.11);
                if (L.clap > 0.02 && (s === 4 || s === 12)) { clap(t, 0.2 * L.clap); hat(t, 0.08 * L.clap, 0.05); }
                if (L.sixteenth > 0.02) hat(t, (s % 4 === 2 ? 0 : s % 2 ? 0.045 : 0.025) * L.sixteenth, 0.02);
                if (L.arp > 0.02 && bar % 2 === 1 && (s === 0 || s === 10)) for (const [n, dt] of [[57, -14], [58, 12], [64, -6]]) synth(t, n + 12, len * 3, 0.028 * L.arp, 'sawtooth', 1800 + 2400 * L.arp, 2, 0, dt);
            },
            // A snare roll with metal and a riser into the next phrase.
            fill(t, s, k, len) {
                clap(t, 0.12 + 0.04 * (s - 12));
                hat(t, 0.06, 0.03);
                if (s === 12) riser(t, len * 4, 0.12);
            }
        },
        // Ominous: a half-time feel on the same grid: a deep kick on 1 and 3, a sub drone under every bar, a bell
        // tolling every other bar, a clock ticking, a low reversed swell, and a slow motif rubbing A against B flat.
        ominous: {
            cutoff: k => 500 + 3500 * k * k, drive: 0, gain: 1.42, shift: 3,    // C, with its flat second
            beat: 0.598, tones: 2.145,   // drums 2 dB under the tones, measured (K-weighted)
            step(t, s, k, len, L, bar) {
                if (s === 0 || s === 8) kick(t, 0.55, 110, 32, 0.6);
                if (s === 0) synth(t, bar % 2 ? 34 : 33, len * 16, 0.13, 'sawtooth', 160 + 260 * k);
                if (s === 0 && bar % 2 === 0) { synth(t, 69, len * 12, 0.05, 'sine', 4000); synth(t, 88, len * 6, 0.012, 'sine', 4000); }
                if (L.off > 0.02 && s % 4 === 2) hat(t, 0.035 * L.off, 0.02);
                if (L.clap > 0.02 && s === 12) clap(t, 0.08 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.02 * L.sixteenth, 0.015);
                const motif = bar % 4 >= 2 ? [69, 70, 72, 70] : [69, 70, 69, 64];
                if (L.arp > 0.02 && s % 4 === 0) synth(t, motif[(s / 4) % 4], len * 3.5, 0.045 * L.arp, 'triangle', 1400);
            },
            // A reversed swell rising into the next phrase.
            fill(t, s, k, len) {
                if (s === 12) riser(t, len * 4, 0.1);
            }
        },
        // Retro: chiptune: a short punchy kick, a triangle bass bouncing octaves on the 8ths, noise snares and hats,
        // and a square arpeggio through Am – F – C – G (its 16ths once it's flying).
        retro: {
            cutoff: k => 4000 + 9000 * k, drive: 0, gain: 1.62,
            beat: 0.701, tones: 1.829,   // drums 2 dB under the tones, measured (K-weighted)
            step(t, s, k, len, L, bar) {
                const chord = PROGRESSION[bar % 4];
                const root = ROOTS[bar % 4];
                if (s % 4 === 0) kick(t, 0.45, 220, 50, 0.12);
                if (s % 2 === 0) synth(t, root + (s % 4 === 2 ? 12 : 0), len * 1.6, 0.14, 'triangle', 9000);
                if (L.off > 0.02 && s % 4 === 2) hat(t, 0.07 * L.off, 0.02);
                if (L.clap > 0.02 && (s === 4 || s === 12)) clap(t, 0.13 * L.clap);
                if (L.sixteenth > 0.02 && s % 2 === 1) hat(t, 0.035 * L.sixteenth, 0.012);
                const arpEvery = L.arp > 0.5 ? 1 : 2;
                // Up on even bars, down on odd ones.
                const i = (s / arpEvery) % 4, idx = bar % 2 ? 3 - i : i;
                if (L.clap > 0.3 && s % arpEvery === 0) synth(t, chord[idx] + 12, len * 0.8, 0.03 * Math.max(L.clap, L.arp), 'square', 9000);
            },
            // A noise-snare roll and a square run up into the next phrase.
            fill(t, s, k, len) {
                clap(t, 0.1 + 0.02 * (s - 12));
                synth(t, [69, 72, 76, 81][s - 12] + 12, len * 0.8, 0.035, 'square', 9000);
            }
        },
        soft: {
            cutoff: k => 700 + 4500 * k * k, drive: 0, gain: 1.7, shift: 5,     // F major: Dm – Bb – F – C
            beat: 0.738, tones: 1.487,   // drums 2 dB under the tones, measured (K-weighted)
            step(t, s, k, len, L, bar) {
                if (s % 4 === 0) kick(t, 0.32, 110, 48, 0.22);
                const chord = bar % 4;
                if (s === 0) pad(t, PROGRESSION[chord], len * 16, 0.028);
                if (s === 0 || s === 7 || s === 10) synth(t, ROOTS[chord] + (s === 10 ? 7 : 0), len * 3, 0.16, 'triangle', 500 + 600 * k);
                if (L.off > 0.02 && s % 2 === 1) hat(t, 0.025 * L.off, 0.03);
                if (L.clap > 0.02 && s === 12) hat(t, 0.06 * L.clap, 0.08);
                if (L.arp > 0.02 && s % 2 === 0) {
                    // The arpeggio rises for two bars, then falls for two.
                    const notes = PROGRESSION[chord], i = (s / 2) % notes.length;
                    synth(t, notes[bar % 4 >= 2 ? notes.length - 1 - i : i] + 12, len * 1.8, 0.035 * L.arp, 'sine', 3000);
                }
            },
            // A soft rim pattern and a pad note leading into the next phrase.
            fill(t, s, k, len) {
                if (s === 12 || s === 14 || s === 15) hat(t, 0.05, 0.07);
                if (s === 14) synth(t, 76, len * 3, 0.04, 'sine', 3000);
            }
        }
    };
    // The bus level for the music volume, and each beat's trim (`gain` on the style, measured RMS against Classic,
    // all at the same level (K-weighted, within about 1 dB of Classic; re-measure if a track changes).
    const musicLevel = () => musicVolume * 0.55;
    const styleTrim = () => (STYLES[style] || STYLES.classic).gain || 1;
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
            const L = { off: layer(k, 0.2), clap: layer(k, 0.45), sixteenth: layer(k, 0.65), arp: layer(k, 0.8) };
            const st8 = STYLES[style] || STYLES.classic, bar = Math.floor(music.step / 16);
            st8.step(t, s, k, len, L, bar);
            // Every eighth bar ends in a fill, so the loop phrases instead of repeating one bar for ever.
            if (st8.fill && ((bar % 8) + 8) % 8 === 7 && s >= 12) st8.fill(t, s, k, len, L);
            music.nextStep += len;
            music.step++;
        }
        // The mood: muffled in flow and bullet time, distorted in a crunch, opening up with speed.
        const st = STYLES[style] || STYLES.classic;
        const cutoff = slow ? 600 : st.cutoff(k);
        music.filter.frequency.setTargetAtTime(cutoff, now, slow ? 0.6 : 0.5);
        music.wet.gain.setTargetAtTime(mode === 'crunch' ? 0.55 : st.drive, now, 0.15);
        music.dry.gain.setTargetAtTime(mode === 'crunch' ? 0.6 : 1, now, 0.15);
    }

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
    const partLevel = k => musicMix[k] * ((STYLES[style] || STYLES.classic)[k] ?? 1);

    function setMusic(v) {
        musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
        if (musicVolume <= 0) return stopMusic();
        if (music) music.bus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05);
    }

    window.SFX = { play, holdDelay, setMusicMix, get musicMix() { return { ...musicMix }; }, setMix, setSimple(v) { simple = !!v; chargeStop(); }, get mix() { return { ...mix }; }, get simple() { return simple; }, setMusicStyle, MUSIC_STYLES: ['classic', 'dark', 'soft', 'ominous', 'retro'], get musicStyle() { return style; }, charge, chargeStop, setVolume, setMusic, musicState, swell, get volume() { return volume; }, get state() { return ctx ? ctx.state : 'none'; }, get playing() { return !!music; }, get musicVolume() { return musicVolume; } };
})();
