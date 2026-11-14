// Retro: the track's drums and instruments, and how they play a song step by step.
// A copy from sfx.js, taken 2026-11-14; reference only. The voices it calls (kick, hat, clap, synth, pad, riser): ../shared/music-engine.js.

// ---- STYLES.retro (sfx.js lines 1828-1863) ----
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
