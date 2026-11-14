// Classic: the track's drums and instruments, and how they play a song step by step.
// A copy from sfx.js, taken 2026-11-14; reference only. The voices it calls (kick, hat, clap, synth, pad, riser): ../shared/music-engine.js.

// ---- STYLES.classic (sfx.js lines 1724-1758) ----
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
        if (L.off > 0.02 && c.drums && s % 4 === 2) hat(t, (0.08 + 0.06 * k) * L.off);
        if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) clap(t, 0.16 * L.clap);
        if (L.sixteenth > 0.02 && c.drums && s % 2 === 1) hat(t, 0.05 * L.sixteenth, 0.025);
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
