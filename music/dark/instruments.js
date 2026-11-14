// Dark: the track's drums and instruments, and how they play a song step by step.
// A copy from sfx.js, taken 2026-11-14; reference only. The voices it calls (kick, hat, clap, synth, pad, riser): ../shared/music-engine.js.

// ---- STYLES.dark (sfx.js lines 1759-1797) ----
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
        if (L.off > 0.02 && c.drums && s % 4 === 2) hat(t, (0.09 + 0.05 * k) * L.off, 0.11);
        if (L.clap > 0.02 && c.drums && (s === 4 || s === 12)) { clap(t, 0.2 * L.clap); hat(t, 0.08 * L.clap, 0.05); }
        if (L.sixteenth > 0.02 && c.drums) hat(t, (s % 4 === 2 ? 0 : s % 2 ? 0.045 : 0.025) * L.sixteenth, 0.02);
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

// ---- The acid line (sfx.js lines 1713-1718) ----
// Dark's acid line, as offsets from the chord's root (snapped into E Phrygian): roots, the flat second and
// the octave, accents on the turns; the second half of each phrase answers with its own line.
const DARK_ACID = [0, null, 0, 12, null, 1, 0, null, 3, null, 0, 12, 1, null, 0, 7];
const DARK_ACCENT = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1];
const DARK_ACID_B = [0, null, 12, null, 1, null, 0, 7, null, 0, null, 13, null, 12, 0, null];
const DARK_ACCENT_B = [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0];
