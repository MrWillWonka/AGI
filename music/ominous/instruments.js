// Ominous: the track's drums and instruments, and how they play a song step by step.
// A copy from sfx.js, taken 2026-11-14; reference only. The voices it calls (kick, hat, clap, synth, pad, riser): ../shared/music-engine.js.

// ---- STYLES.ominous (sfx.js lines 1798-1827) ----
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
