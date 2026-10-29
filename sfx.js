// sfx.js — sound effects, synthesised with Web Audio (no files, no dependencies).
// window.SFX.play(name, opts) for one-shots; SFX.charge(level) / SFX.chargeStop() for the held sprint meter.
// Silent until the first user gesture (browsers block audio before one) and at volume 0.
(function () {
    'use strict';

    let ctx = null;
    let master = null;
    let volume = 0.5;
    const last = {};            // name -> time last played, to thin out rapid repeats
    let chargeOsc = null;

    function ensure() {
        if (ctx || volume <= 0) return ctx;
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
    function tone({ f0, f1 = f0, dur = 0.15, type = 'sine', gain = 0.3, at = 0, attack = 0.005, detune = 0 }) {
        const t = ctx.currentTime + at;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        if (detune) o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(master);
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
        const t = ctx.currentTime + at;
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
    const arp = (notes, step, opts) => notes.forEach((n, i) => tone({ f0: NOTE(n), dur: 0.25, at: i * step, ...opts }));

    const SOUNDS = {
        // Workbench jobs: a soft tick, pitched by resource.
        click: ({ res = 'cp' } = {}) => tone({ f0: { cp: 880, dp: 660, rp: 990 }[res] || 880, f1: 600, dur: 0.05, type: 'triangle', gain: 0.12 }),
        buy: () => { tone({ f0: NOTE(76), dur: 0.09, type: 'triangle', gain: 0.18 }); tone({ f0: NOTE(83), dur: 0.14, type: 'triangle', gain: 0.18, at: 0.07 }); },
        buyBig: () => arp([72, 76, 79, 84], 0.06, { type: 'triangle', gain: 0.16 }),
        error: () => tone({ f0: 220, f1: 160, dur: 0.12, type: 'square', gain: 0.06 }),
        // A sprint: a whoosh as strong as the charge.
        sprint: ({ charge = 1 } = {}) => {
            noise({ dur: 0.25 + 0.25 * charge, gain: 0.12 + 0.2 * charge, f0: 300, f1: 1800 + 2000 * charge, q: 0.8 });
            tone({ f0: 110, f1: 70, dur: 0.18, type: 'sine', gain: 0.25 * charge });
        },
        clean: () => { tone({ f0: NOTE(84), dur: 0.18, type: 'sine', gain: 0.18 }); tone({ f0: NOTE(91), dur: 0.3, type: 'sine', gain: 0.12, at: 0.05 }); },
        perfect: () => arp([84, 88, 91, 96], 0.045, { type: 'sine', gain: 0.15 }),
        system: () => { arp([72, 79, 84, 88, 91, 96, 100], 0.04, { type: 'triangle', gain: 0.14 }); noise({ dur: 0.8, gain: 0.08, f0: 4000, f1: 9000, type: 'highpass' }); },
        breakthrough: () => {
            tone({ f0: 70, f1: 40, dur: 0.6, type: 'sine', gain: 0.45 });
            noise({ dur: 0.5, gain: 0.25, f0: 200, f1: 3000, q: 0.6 });
            arp([79, 86, 91], 0.06, { type: 'triangle', gain: 0.1, at: 0.15 });
        },
        smash: () => { noise({ dur: 0.9, gain: 0.4, f0: 1200, f1: 120, q: 0.5, type: 'lowpass' }); tone({ f0: 55, f1: 30, dur: 0.8, gain: 0.5 }); },
        windup: () => tone({ f0: 120, f1: 520, dur: 0.6, type: 'sawtooth', gain: 0.05, attack: 0.3 }),
        // Act two: off a crest, and back down (louder the harder it lands).
        launch: () => noise({ dur: 0.35, gain: 0.15, f0: 400, f1: 2400, q: 1.2 }),
        land: ({ impact = 3 } = {}) => {
            const k = Math.min(1, impact / 15);
            tone({ f0: 90, f1: 50, dur: 0.15 + 0.2 * k, gain: 0.12 + 0.35 * k });
            noise({ dur: 0.2 + 0.2 * k, gain: 0.06 + 0.15 * k, f0: 500, f1: 150, type: 'lowpass' });
        },
        // Learning a skill: a short fanfare.
        summit: () => {
            arp([67, 72, 76, 79, 84], 0.09, { type: 'triangle', gain: 0.2 });
            tone({ f0: NOTE(84), dur: 0.9, type: 'sine', gain: 0.12, at: 0.45 });
            tone({ f0: NOTE(88), dur: 0.9, type: 'sine', gain: 0.1, at: 0.45 });
        },
        nearMiss: () => tone({ f0: 300, f1: 260, dur: 0.6, type: 'triangle', gain: 0.08 }),
        runEnd: ({ good = false } = {}) => good ? arp([72, 79], 0.1, { type: 'sine', gain: 0.14 }) : tone({ f0: NOTE(67), f1: NOTE(64), dur: 0.3, type: 'sine', gain: 0.1 }),
        record: () => arp([76, 79, 83, 88], 0.07, { type: 'square', gain: 0.05 }),
        crunch: () => { noise({ dur: 0.4, gain: 0.15, f0: 900, f1: 300 }); tone({ f0: 160, f1: 320, dur: 0.3, type: 'sawtooth', gain: 0.06 }); },
        flow: () => arp([60, 67, 72, 76], 0.12, { type: 'sine', gain: 0.1, dur: 0.6 }),
        freeze: () => tone({ f0: 900, f1: 120, dur: 0.7, type: 'sine', gain: 0.15 }),
        release: () => { noise({ dur: 0.6, gain: 0.3, f0: 200, f1: 5000, q: 0.5 }); tone({ f0: 60, f1: 35, dur: 0.6, gain: 0.45 }); },
        viral: () => arp([72, 76, 79, 84, 88, 91], 0.05, { type: 'square', gain: 0.05 }),
        achievement: () => arp([79, 84, 88], 0.08, { type: 'triangle', gain: 0.14 }),
        phase: () => { arp([60, 64, 67, 72, 76, 79, 84], 0.08, { type: 'triangle', gain: 0.14 }); tone({ f0: NOTE(48), dur: 1.4, gain: 0.15, at: 0.1 }); },
        ship: () => { arp([60, 67, 72, 79, 84], 0.12, { type: 'sawtooth', gain: 0.05 }); tone({ f0: NOTE(36), dur: 1.6, gain: 0.2 }); },
        ui: () => tone({ f0: 1200, f1: 1000, dur: 0.03, type: 'sine', gain: 0.05 })
    };
    // Minimum seconds between two plays of the same sound (clicks and dust can come in floods).
    const GAP = { click: 0.045, land: 0.08, launch: 0.15, buy: 0.05, ui: 0.05, error: 0.2, clean: 0.05 };

    function play(name, opts) {
        if (volume <= 0 || !SOUNDS[name] || !ensure() || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (last[name] != null && now - last[name] < (GAP[name] ?? 0.03)) return;
        last[name] = now;
        try { SOUNDS[name](opts); } catch { /* a bad node never breaks the game */ }
    }

    // The sprint meter: a soft tone that rises with the charge while you hold.
    function charge(level) {
        if (volume <= 0 || !ensure() || ctx.state !== 'running') return;
        if (!chargeOsc) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            g.gain.value = 0.0001;
            g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.03);
            o.connect(g).connect(master);
            o.start();
            chargeOsc = { o, g };
        }
        chargeOsc.o.frequency.setTargetAtTime(180 + 520 * Math.max(0, Math.min(1, level)), ctx.currentTime, 0.015);
    }

    function chargeStop() {
        if (!chargeOsc) return;
        const { o, g } = chargeOsc;
        chargeOsc = null;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        o.stop(ctx.currentTime + 0.2);
    }

    window.SFX = { play, charge, chargeStop, setVolume, get volume() { return volume; } };
})();
