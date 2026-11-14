// Soft: the track's drums and instruments, and how they play a song step by step.
// A copy from sfx.js, taken 2026-11-14; reference only. The voices it calls (kick, hat, clap, synth, pad, riser): ../shared/music-engine.js.

// ---- STYLES.soft (sfx.js lines 1864-1897) ----
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
