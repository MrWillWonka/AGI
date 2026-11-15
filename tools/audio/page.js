// tools/audio/page.js — runs in the render page (page.html). Builds the game's audio engine on an
// OfflineAudioContext and plays a timeline of game events into it, stepping the engine's own schedulers through
// render time, so what is rendered is what the game would play. Deterministic for a seed.
//
// A timeline (JSON):
//   { seconds, seed, style, simple, phone, sound, music, mix, musicMix, area, depth, training, intensity, mode,
//     events: [[t, method, ...args], …],          any engine method at time t: 'play', 'musicState', 'setArea', 'swell'…
//     holds:  [{ from, to, res }, …],              a job held: the press's click, then `held` at the game's hold rate
//     taps:   [{ at, res }, …],                    single clicks
//     sprints:[{ from, to, level }, …] }           the meter held (level 0-1 reached at `to`), then the sprint
'use strict';
(function () {
    const HOLD_MS = 1000 / (124 * 2 / 60);     // the game's hold rate (engine.js HOLD_INTERVAL_MS)
    const QUANTUM = 1024;                      // frames between engine ticks: 21.3 ms at 48 kHz (the game ticks every 25)

    function seeded(seed) {
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    function expand(spec) {
        const ev = (spec.events || []).map(e => e.slice());
        for (const h of spec.holds || []) {
            ev.push([h.from, 'play', 'click', { res: h.res, q: 1 }]);
            for (let k = 1; h.from + k * HOLD_MS / 1000 <= h.to + 1e-9; k++) ev.push([h.from + k * HOLD_MS / 1000, 'held', h.res]);
            ev.push([h.to, 'held', null]);
        }
        for (const t of spec.taps || []) ev.push([t.at, 'play', 'click', { res: t.res, q: 1 }]);
        for (const s of spec.sprints || []) {
            ev.push([s.to, 'chargeStop']);
            if (!s.silent) ev.push([s.to, 'play', 'sprint', { charge: s.level ?? 1 }]);
        }
        return ev.map((e, i) => [e, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(x => x[0]);
    }

    async function render(spec) {
        const sr = spec.sampleRate || 48000, seconds = spec.seconds;
        const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
        const faults = [];
        const sfx = window.SFXBuild({ ctx, offline: true, random: seeded(spec.seed || 1), phone: !!spec.phone, meterVoice: spec.meterVoice, onError: (where, e) => faults.push(where + ': ' + (e && e.message || e)) });
        sfx.setVolume(spec.sound ?? 0.5);
        sfx.setMusicStyle(spec.style || 'classic');
        sfx.setSimple(!!spec.simple);
        if (spec.mix) sfx.setMix(spec.mix);
        if (spec.musicMix) sfx.setMusicMix(spec.musicMix);
        sfx.setArea(spec.area || 'lab');
        sfx.setDepth(spec.depth ?? 0);
        sfx.setTraining(!!spec.training);
        sfx.setMusic(spec.music ?? 0.35);
        const ev = expand(spec), sprints = spec.sprints || [];
        const log = [];
        const musicOn = (spec.music ?? 0.35) > 0;
        let state = [spec.intensity ?? 0.05, spec.mode ?? null];
        let i = 0;
        const run = t => {
            while (i < ev.length && ev[i][0] <= t + 1e-9) {
                const [at, m, ...a] = ev[i++];
                if (typeof sfx[m] !== 'function') { faults.push('no engine method ' + m); continue; }
                sfx[m](...a);
                if (m === 'musicState') state = a;
                log.push([+at.toFixed(4), m, ...a]);
            }
            for (const s of sprints) if (t >= s.from && t < s.to) sfx.charge((s.level ?? 1) * (t - s.from) / (s.to - s.from), !!s.thrust);
            // The game reports its state every tick (game.js musicTick), which is also what restarts the music after
            // a change of track: so does the render.
            if (musicOn) sfx.musicState(...state);
            sfx.tick();
        };
        // The music starts when the game first reports its state.
        if (musicOn) sfx.musicState(...state);
        run(0);
        const step = QUANTUM / sr;
        for (let n = 1; n * step < seconds; n++) ctx.suspend(n * step).then(() => { run(n * step); ctx.resume(); });
        const buf = await ctx.startRendering();
        return { buf, faults, log, song: sfx.song };
    }

    // A 32-bit float WAV of the buffer, handed to Node in base64 pieces (window.__audioChunk, from render.js).
    async function save(buf, name) {
        const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
        const bytes = new ArrayBuffer(44 + n * ch * 4), v = new DataView(bytes);
        const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 4, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
        v.setUint16(20, 3, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 4, true);
        v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true); str(36, 'data'); v.setUint32(40, n * ch * 4, true);
        const data = [];
        for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
        const out = new Float32Array(bytes, 44);
        let bad = 0, peak = 0;
        for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
            const x = data[c][i];
            if (!Number.isFinite(x)) bad++;
            else if (Math.abs(x) > peak) peak = Math.abs(x);
            out[i * ch + c] = x;
        }
        const u8 = new Uint8Array(bytes), CHUNK = 3 * 262144;
        for (let o = 0; o < u8.length; o += CHUNK) {
            let s = '';
            const part = u8.subarray(o, Math.min(u8.length, o + CHUNK));
            for (let k = 0; k < part.length; k += 32768) s += String.fromCharCode.apply(null, part.subarray(k, k + 32768));
            await window.__audioChunk(name, btoa(s), o === 0);
        }
        return { bad, peak, frames: n, sampleRate: sr, channels: ch };
    }

    window.renderTimeline = async function (spec, name) {
        const t0 = performance.now();
        const { buf, faults, log, song } = await render(spec);
        const file = await save(buf, name);
        return { ...file, faults, events: log.length, song, ms: Math.round(performance.now() - t0) };
    };
})();
