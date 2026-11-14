// How a song is written: scales, chords, melodies, bass, the form. A copy from sfx.js, taken 2026-11-14; reference only.

// ---- Scales, chords, melodies, bass, the form (sfx.js lines 1388-1490) ----
const AEOL = [0, 2, 3, 5, 7, 8, 10], PHRY = [0, 1, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11], ION = [0, 2, 4, 5, 7, 9, 11];
const PC = { A: 0, B: 2, C: 3, D: 5, E: 7, F: 8, G: 10 };
const QUALITY = {
    '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 6: [0, 4, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
    9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7],
    sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], dim: [0, 3, 6]
};
const pcOf = n => (((n - 57) % 12) + 12) % 12;     // pitch class from A
// A chord name ('Am9', 'Fmaj7', 'E7', 'G/B') → its bass note (A1 to G#2), chord tones, third and fifth.
function parseChord(name) {
    const m = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/.exec(name);
    if (!m) throw new Error('chord ' + name);
    const acc = a => (a === 'b' ? -1 : a === '#' ? 1 : 0);
    const pc = (PC[m[1]] + acc(m[2]) + 12) % 12;
    const iv = QUALITY[m[3]];
    if (!iv) throw new Error('chord ' + name);
    const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : pc;
    return { name, pc, iv, root: 33 + bass, third: iv.find(x => x === 3 || x === 4 || x === 5 || x === 2) ?? 7 };
}
// Voice a chord close to the last one (smooth voice leading, A3 to about D5); five-note chords leave the
// root to the bass.
function voiceChord(c, prev) {
    const pcs = (c.iv.length >= 5 ? c.iv.slice(1) : c.iv).map(x => (c.pc + x) % 12).filter((p, i, a) => a.indexOf(p) === i);
    let best = null, cost = Infinity;
    for (let inv = 0; inv < pcs.length; inv++) {
        const order = pcs.slice(inv).concat(pcs.slice(0, inv));
        for (let lo = 52; lo <= 63; lo++) {
            if (pcOf(lo) !== order[0]) continue;
            const v = [lo];
            for (const p of order.slice(1)) { let n = v[v.length - 1] + 1; while (pcOf(n) !== p) n++; v.push(n); }
            const top = v[v.length - 1];
            const c2 = (prev ? v.reduce((a, n, i) => a + Math.abs(n - prev[Math.min(i, prev.length - 1)]), 0) : Math.abs(v[0] - 57))
                + Math.max(0, top - 74) * 3;
            if (c2 < cost) { cost = c2; best = v; }
        }
    }
    return best;
}
// A melody: one token per 8th note. A scale degree (1-7, from the song's tonic), with b/# for a sharp or
// flat, ' for each octave up and , for each octave down; '-' holds the note on, '.' rests, and 'x+y' splits
// the 8th into two 16ths. Bars may be split with '|' for reading. Each note: { deg, acc, len } in 16ths.
function parseMelody(str, steps) {
    const ev = new Array(steps).fill(null);
    let i = 0, cur = null;
    const put = tok => {
        if (tok === '-') { if (cur) cur.len++; }
        else if (tok === '.') cur = null;
        else {
            const m = /^([b#]?)([1-7])('*|,*)$/.exec(tok);
            if (!m) throw new Error('note ' + tok);
            const oct = m[3][0] === "'" ? m[3].length : -m[3].length;
            cur = { deg: +m[2] - 1 + 7 * oct, acc: m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, len: 1 };
            ev[i] = cur;
        }
        i++;
    };
    for (const tk of str.replace(/\|/g, ' ').trim().split(/\s+/)) {
        if (tk.includes('+')) tk.split('+').forEach(put);
        else { put(tk); put(tk === '.' ? '.' : '-'); }
    }
    if (i !== steps) throw new Error(`melody of ${i} steps, not ${steps}`);
    return ev;
}
// A melody note, `harm` degrees away in the song's scale (−2: a third below, the A2 section's harmony).
function melNote(song, e, harm = 0) {
    const d = e.deg + harm, o = Math.floor(d / 7), sc = song.scale;
    return 69 + song.tonic + sc[d - 7 * o] + 12 * o + 12 * song.oct + (harm ? 0 : e.acc);
}
// Snap a note into the song's scale (the Dark acid line's turns, written over any root).
function snap(song, n) {
    const inScale = x => song.scale.includes(((pcOf(x) - song.tonic) % 12 + 12) % 12);
    return inScale(n) ? n : inScale(n - 1) ? n - 1 : n + 1;
}
// Bass patterns: 16 characters a bar. '.' rest, r root, o its octave, f the fifth, d the fifth below,
// t the chord's third (sus chords: their 4th or 2nd).
function bassAt(song, s, ch) {
    const c = song.bass[s];
    if (!c || c === '.') return 0;
    return ch.root + ({ r: 0, o: 12, f: 7, d: -5, t: ch.third }[c] ?? 0);
}
function buildSong(def) {
    const song = { tonic: 0, oct: 0, lvl: 1, comp: [], bass: 'r.......r.......', acid: 1, ...def };
    let prev = null, hold = 69, bell = 69;
    song.chords = def.chords.map(name => {
        const c = parseChord(name);
        c.v = voiceChord(c, prev);
        prev = c.v;
        // Simple sounds' held note: the chord tone nearest the last one, E4 to E5 (no wrong notes).
        const tones = [];
        for (let n = 52; n <= 88; n++) if (c.iv.some(x => (c.pc + x) % 12 === pcOf(n))) tones.push(n);
        const near = (lo, hi, to) => tones.filter(n => n >= lo && n <= hi).sort((a, b) => Math.abs(a - to) - Math.abs(b - to))[0];
        c.hold = hold = near(64, 76, hold);
        c.bell = bell = near(64, 76, bell);       // Ominous's bell tolls a chord tone
        return c;
    });
    song.melA = parseMelody(def.melA, 64);
    song.melB = parseMelody(def.melB, 128);
    return song;
}
// The form, eight bars a section: two minutes at 124 BPM, then the area's other song.
const FORM = ['intro', 'A', 'B', 'A', 'break', 'B', 'A2', 'out'];
const SONG_BARS = FORM.length * 8;

// ---- What a song's fields mean (sfx.js lines 1492-1498) ----
// Two songs for the lab, two for the server room and two for Packet Snare, per track. Lab songs are steadier and
// more melodic; server-room songs drive harder (busier bass, syncopated chords, riffs); Packet Snare's are the
// track gone stealthy (sparse, muted, suspended chords that don't resolve, a hushed kick of their own and a
// ticking clock: see `kickLevel`) until you're spotted and the beat drops in. `lvl` trims each song's pitched
// voices so every song measures the same (K-weighted, the tones 2 dB over the beat); a stealth song's `rest`
// lifts its tones while it's hushed (fading out as you're spotted), so it measures the same then too
// (`slvl`/`srest`: the same for its simple version).
