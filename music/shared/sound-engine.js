// What plays every effect: the output and its compressor, tone and noise, the 124 BPM grid, keys and profiles,
// variations, panels, levels, sound groups, simple sounds, quantizing and gaps, and the sprint meter.
// A copy from sfx.js, taken 2026-11-14; reference only.

// ---- Output, unlock, tone, noise, the grid, keys, variations, profiles (sfx.js lines 1-236) ----
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

// ---- Never the same variation twice (sfx.js lines 257-264) ----
// A different variation from last time: `vary(key, n)` never returns the same index twice running.
const lastVar = {};
function vary(key, n) {
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === lastVar[key]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    lastVar[key] = i;
    return i;
}

// ---- Panels: instrument and register (sfx.js lines 459-469) ----
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

// ---- Packet Snare helpers and each track's overall level (sfx.js lines 489-499) ----
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

// ---- How Packet Snare's levels were set (sfx.js lines 501-509) ----
// Packet Snare's effects, levelled per track (and simple version) against that track's own effects, measured
// K-weighted (the peak 100 ms, averaged over four plays, against the mean of 17 existing effects): a catch, a
// placement and a broken decoy at the clicks' level, a spoil, a snap and a hit on the boss 1.5 dB over, your
// laser, a turret's zap and a chain 3.5 dB under (they come often, by themselves), the sweep's warning 3.5 dB
// over, the boss locking on and the powers 4 dB over and the boss 5.5 dB over. The second wave the same way: a sloppy
// flick's flag at the clicks' level; a quarantine, a stun, a core appearing, a parry, a slash, a spoof, a garbage
// collection, a hijack, a rebuild and a herder knocked out 1.5 dB over; a hijacked Antivirus or partner taking packets
// and a held loop's ticks 3.5 dB under; the IDS alarm 3.5 dB over and the boss beaten 5.5 dB over (an option's
// variations, partner, down, step, flags, averaged). Keys `name` or `name:kind`.

// ---- What each Packet Snare effect is, across the tracks (sfx.js lines 522-538) ----
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

// ---- Groups, simple sounds, play, the sprint meter (sfx.js lines 956-1201) ----
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
