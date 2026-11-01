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

    // Audio may only start after a gesture: unlock on the first one.
    ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, () => {
        if (ensure() && ctx.state === 'suspended') ctx.resume();
    }, { capture: true }));

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, Number(v) || 0));
        if (master) master.gain.setTargetAtTime(volume * 0.6, ctx.currentTime, 0.02);
        if (volume <= 0) chargeStop();
    }

    // One tone: frequency sweep `f0` → `f1`, an attack/decay envelope, optional detuned partner.
    function tone({ f0, f1 = f0, dur = 0.15, type = 'sine', gain = 0.3, at = 0, attack = 0.005, detune = 0, cutoff = 0, q = 1 }) {
        const t = ctx.currentTime + base + at;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        if (detune) o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        if (cutoff) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = cutoff;
            f.Q.value = q;
            o.connect(f).connect(g);
        } else o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    let noiseBuf = null;
    // Filtered noise: whooshes, dust, impacts.
    function noise({ dur = 0.3, gain = 0.25, f0 = 800, f1 = f0, q = 1, type = 'bandpass', at = 0 }) {
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
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
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
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
    const S = () => (clock ? clock.len : STEP);     // one 16th at the current tempo

    // A filtered note: the house voice (a short blip through a lowpass, techno-style).
    const blip = (note, opts) => tone({ f0: NOTE(note), dur: 0.09, type: 'square', gain: 0.07, cutoff: 2600, ...opts });
    const arp = (notes, step, opts = {}) => notes.forEach((n, i) => blip(n, { ...opts, at: (opts.at || 0) + i * step }));
    // A techno delay throw: the same figure again a dotted 8th later, quieter.
    const echo = (fn, gain = 0.4) => { fn(1); fn(gain, 3 * S()); };
    const stab = (notes, opts) => notes.forEach(n => tone({ f0: NOTE(n), dur: 0.22, type: 'sawtooth', gain: 0.05, cutoff: 1800, q: 4, detune: 7, ...opts }));
    const sub = (from, to, dur, gain, at = 0) => tone({ f0: NOTE(from), f1: NOTE(to), dur, type: 'sine', gain, at });
    // The bar's position picks a click's note, so taps and holds play a figure that sits on the beat.
    const CLICK_NOTES = {
        cp: [81, 76, 79, 76, 84, 76, 79, 74],       // compute: a bright square figure round A5
        dp: [69, 64, 67, 64, 72, 64, 67, 62],       // data: an octave down, rounder
        rp: [88, 84, 86, 81, 91, 84, 86, 79]        // research: up high, bell-like
    };
    const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];   // the meter climbs these, A3 to A5

    const SOUNDS = {
        // Workbench jobs: a blip on the bar's current 8th (a hold lands on the 8ths: see holdDelay).
        click: ({ res = 'cp' } = {}) => {
            const notes = CLICK_NOTES[res] || CLICK_NOTES.cp;
            const i = clock ? Math.floor(Math.round(stepAt(ctx.currentTime + base)) / 2) % 8 : 0;
            const n = notes[(i + 8) % 8];
            if (res === 'dp') tone({ f0: NOTE(n), dur: 0.12, type: 'triangle', gain: 0.13, cutoff: 1600 });
            else if (res === 'rp') { tone({ f0: NOTE(n), dur: 0.16, type: 'sine', gain: 0.09 }); tone({ f0: NOTE(n + 12), dur: 0.06, type: 'sine', gain: 0.03 }); }
            else blip(n, { gain: 0.06, dur: 0.07 });
        },
        buy: () => { blip(81, { gain: 0.08 }); blip(88, { gain: 0.08, at: S() / 2 }); },
        buyBig: () => { arp([69, 72, 76, 81], S() / 2, { gain: 0.07 }); sub(45, 45, 0.3, 0.12); },
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
    // Stingers wait for the grid: steps to quantize to (1 = the next 16th, 2 = the next 8th).
    const QUANT = { buyBig: 1, summit: 2, record: 1, runEnd: 1, viral: 1, achievement: 1, phase: 2, ship: 2 };
    // Minimum seconds between two plays of the same sound (clicks and dust can come in floods).
    const GAP = { click: 0.045, land: 0.08, launch: 0.15, buy: 0.05, ui: 0.05, error: 0.2, clean: 0.05 };

    function play(name, opts) {
        if (volume <= 0 || !SOUNDS[name] || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (last[name] != null && now - last[name] < (GAP[name] ?? 0.03)) return;
        last[name] = now;
        // A held click (`q` from game.js) or a stinger lands on the grid; a grid point too far off plays now.
        const div = opts?.q ?? QUANT[name];
        base = div ? Math.max(0, nextStep(div).t - now) : 0;
        if (base > 0.25) base = 0;
        try { SOUNDS[name](opts); } catch { /* a bad node never breaks the game */ }
        base = 0;
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
    // The meter's voice changes every few charges, so a sound heard thousands of times doesn't go stale.
    // Every voice stays in A minor and rises with the charge; some move with the 16ths of the track.
    const CHORD = [57, 60, 64, 67, 69, 72, 76, 79, 81];           // Am7 tones, A3 to A5
    const CHARGE_VOICES = [
        // The pentatonic, note by note, an arpeggiator climbing.
        { type: 'triangle', gain: 0.05, note: (l) => PENTA[Math.min(PENTA.length - 1, Math.floor(l * PENTA.length))] },
        // Chord tones only, a filtered square opening as it rises.
        { type: 'square', gain: 0.035, cutoff: l => 600 + 3400 * l, note: (l) => CHORD[Math.min(CHORD.length - 1, Math.floor(l * CHORD.length))] },
        // Octave hops on the 16ths while it climbs.
        { type: 'triangle', gain: 0.05, note: (l, n) => PENTA[Math.min(PENTA.length - 1, Math.floor(l * PENTA.length))] - 12 + (n % 2 ? 12 : 0) },
        // An acid line: a low A whose resonant filter sweeps open with the charge.
        { type: 'sawtooth', gain: 0.045, q: 12, cutoff: l => 180 * Math.pow(24, l), note: (l, n) => (n % 4 === 3 ? 57 : 45) },
        // A gated pad: the pentatonic chopped into 16ths, the gate opening wider as it fills.
        { type: 'sawtooth', gain: 0.04, cutoff: l => 900 + 2000 * l, gate: true, note: (l) => PENTA[Math.min(PENTA.length - 1, Math.floor(l * PENTA.length))] }
    ];
    const VOICE_EVERY = 6;            // charges per voice
    let charges = 0;
    let voiceIdx = 0;

    function charge(level, free = false) {
        if (volume <= 0 || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const l = Math.max(0, Math.min(1, level));
        // `free` (act two's thrust) is always a smooth glide.
        const v = free ? { type: 'triangle', gain: 0.05 } : CHARGE_VOICES[voiceIdx];
        if (!chargeOsc) {
            if (!free && ++charges % VOICE_EVERY === 0) {
                voiceIdx = (voiceIdx + 1 + Math.floor(Math.random() * (CHARGE_VOICES.length - 1))) % CHARGE_VOICES.length;
            }
            const vv = free ? v : CHARGE_VOICES[voiceIdx];
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            const g = ctx.createGain();
            o.type = vv.type;
            f.type = 'lowpass';
            f.frequency.value = vv.cutoff ? vv.cutoff(l) : 12000;
            f.Q.value = vv.q || 1;
            g.gain.value = 0.0001;
            g.gain.setTargetAtTime(vv.gain, now, 0.03);
            o.connect(f).connect(g).connect(master);
            o.start();
            chargeOsc = { o, f, g, v: vv };
        }
        const cv = chargeOsc.v;
        if (free) {
            chargeOsc.o.frequency.setTargetAtTime(NOTE(57) * Math.pow(2, 2 * l), now, 0.015);
            return;
        }
        const pos = clock ? stepAt(now) : 0;
        const n = Math.floor(pos);
        chargeOsc.o.frequency.setTargetAtTime(NOTE(cv.note(l, n)), now, 0.004);
        if (cv.cutoff) chargeOsc.f.frequency.setTargetAtTime(cv.cutoff(l), now, 0.02);
        if (cv.gate) chargeOsc.g.gain.setTargetAtTime((pos % 1) < 0.35 + 0.5 * l ? cv.gain : cv.gain * 0.08, now, 0.006);
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
        bus.gain.value = musicVolume * 0.55;
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
        bus.connect(dry).connect(filter);
        bus.connect(drive).connect(wet).connect(filter);
        filter.connect(out);
        const first = nextStep(1, 0.05);           // joins the clock, so it's in time with the grid sounds already use
        music = { bus, drive, dry, wet, filter, nextStep: first.t, step: first.n };
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
    function voice(fn) {
        const g = ctx.createGain();
        g.connect(music.bus);
        fn(g);
    }
    function kick(t, gain) {
        voice(g => {
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.3);
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
        });
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
        });
    }
    function synth(t, note, dur, gain, type, cutoff) {
        voice(g => {
            const o = ctx.createOscillator();
            const f = ctx.createBiquadFilter();
            o.type = type;
            o.frequency.value = NOTE(note);
            f.type = 'lowpass';
            f.frequency.value = cutoff;
            f.Q.value = 6;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(f).connect(g);
            o.start(t);
            o.stop(t + dur + 0.02);
        });
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
            if (s % 4 === 0) kick(t, 0.5);
            if (BASS[s]) synth(t, BASS[s], len * 2.2, 0.22, 'sawtooth', 220 + 1600 * k);
            const off = layer(k, 0.2), clapL = layer(k, 0.45), sixteenth = layer(k, 0.65), arpL = layer(k, 0.8);
            if (off > 0.02 && s % 4 === 2) hat(t, (0.08 + 0.06 * k) * off);
            if (clapL > 0.02 && (s === 4 || s === 12)) clap(t, 0.16 * clapL);
            if (sixteenth > 0.02 && s % 2 === 1) hat(t, 0.05 * sixteenth, 0.025);
            if (arpL > 0.02) synth(t, ARP[s % ARP.length] + 12, len * 0.9, 0.05 * arpL, 'square', 1200 + 2000 * arpL);
            music.nextStep += len;
            music.step++;
        }
        // The mood: muffled in flow and bullet time, distorted in a crunch, opening up with speed.
        const cutoff = slow ? 600 : 900 + 9000 * k * k;
        music.filter.frequency.setTargetAtTime(cutoff, now, slow ? 0.6 : 0.5);
        music.wet.gain.setTargetAtTime(mode === 'crunch' ? 0.55 : 0, now, 0.15);
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
        music.bus.gain.setTargetAtTime(musicVolume * 0.85, now, 0.15);
        music.bus.gain.setTargetAtTime(musicVolume * 0.55, hit + 0.3, 0.4);
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

    function setMusic(v) {
        musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
        if (musicVolume <= 0) return stopMusic();
        if (music) music.bus.gain.setTargetAtTime(musicVolume * 0.55, ctx.currentTime, 0.05);
    }

    window.SFX = { play, holdDelay, charge, chargeStop, setVolume, setMusic, musicState, swell, get volume() { return volume; }, get musicVolume() { return musicVolume; } };
})();
