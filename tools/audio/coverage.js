// tools/audio/coverage.js — what there is, written from the engine itself: every song's disposition, every effect in
// every track (its own, or Classic's through the track's profile), and the melody notes worth a second look.
//   node tools/audio/coverage.js            → design/audio/coverage.md
// No browser: it loads sfx.js and the theme files in Node, as tests/audio.test.js does.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const THEMES = ['classic', 'dark', 'soft', 'ominous', 'retro'];
global.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
global.document = { addEventListener() {}, hidden: false };
if (typeof navigator === 'undefined') global.navigator = {};
for (const f of [...THEMES.map(t => `music/${t}.js`), 'sfx.js']) require(path.join(root, f));
const SFX = global.window.SFX, cat = SFX.catalog, lab = SFX.lab;
const Cap = s => s[0].toUpperCase() + s.slice(1);

// What the overhaul did with each song (the owner's brief asks for all thirty to be accounted for).
const DISPOSITION = {
    'Night Survey': 'A kept and given an answering phrase; new B progression and melody; new form',
    'Uptime': 'Melodies kept; A now turns through G6, only B takes the E7; new form',
    'Overclock': 'Riff kept with a 16th pick-up; new B progression and melody; new form',
    'Packet Storm': 'Hook kept; new B progression and melody (with 16ths); new form',
    'Packet Sniffer': 'Kept; new stealth form', 'Dead Drop': 'Kept; new stealth form',
    'Foundry': 'New riff on the flat second (A) and a held line over a pedal (B); club form',
    'Rust': 'Melodies kept (a slow lab line); new form with a strip-down',
    'Warehouse': 'Riff kept; its own acid line; breakdown, build and drop',
    'Pressure': 'Riffs kept; its own acid line; new form',
    'Black Box': 'Kept; new stealth form', 'Tripwire': 'Kept; new stealth form',
    'Morning Lab': 'New syncopated A (8 bars); new B through the relative minor and a borrowed iv; new form',
    'Window Seat': 'Melodies kept; starts on the tune; a drumless middle; new form',
    'Gentle Climb': 'Melodies kept; new form', 'Glide Path': 'Melodies kept; a two-chord vamp; new form',
    'Tiptoe': 'Kept; new stealth form', 'Hushed Channel': 'Kept; new stealth form',
    'Vigil': 'Rewritten for 62 BPM: a four-note cell with bars of silence; new B through a diminished chord',
    'Static': 'Rewritten for 62 BPM around the fall to the flat second; a two-bar void',
    'Descent': 'New A with a pulse to it; B kept; new form', 'Undertow': 'A kept; B rewritten with triplets; new form',
    'Crawlspace': 'Kept, slower; heartbeat re-set for 62 BPM; short through-form', 'Lights Out': 'Kept, slower; short through-form',
    'Pixel Desk': 'Melodies kept; a walking bass; last chorus up a tone', 'Save Point': 'Melodies kept; starts on the tune; a bridge',
    'Boss Rush': 'Melodies kept; breakbeat and galloping bass; last chorus up a tone', 'Turbo': 'Melodies kept; breakbeat; last lap up a tone',
    'Sneaking Mission': 'Kept; new stealth form', 'Hide and Seek': 'Kept; new stealth form'
};

let md = `# Audio coverage\n\nWritten by \`node tools/audio/coverage.js\` from the engine and the theme files. Do not edit by hand.\n\n## Tracks\n\n| Track | BPM | Swing | Held-job notes a second | Effects' pitch | Layer order (first to last) | Space |\n|---|---|---|---|---|---|---|\n`;
const stepOf = bpm => 60 / bpm / 4, gridMul = bpm => Math.pow(2, Math.round(Math.log2(0.121 / stepOf(bpm))));
for (const th of THEMES) {
    const c = cat[th], hold = (c.holdDiv || 2 * gridMul(c.bpm)) * stepOf(c.bpm);
    const order = Object.entries(c.layers).sort((a, b) => a[1] - b[1]).map(([k, v]) => (v < 0 ? `**${k}**` : k)).join(', ');
    const sp = c.space || {};
    md += `| ${Cap(th)} | ${c.bpm} | ${c.swing ? Math.round(c.swing * 100) + '% of a 16th' : 'straight'} | ${(1 / hold).toFixed(2)} | ${c.pitch === 'key' ? "the track's key (tension kept)" : 'fitted to the chord'} | ${order} | ${[sp.reverb && `reverb ${sp.reverb.seconds} s`, sp.delay && `delay ${sp.delay.steps} steps`, sp.width != null && `width ${sp.width}`].filter(Boolean).join(', ') || 'dry'} |\n`;
}
md += `\nBold layers are always in. Income is 4.13 repeats a second in every track (engine.js \`holdClock\`).\n\n## Songs (${THEMES.reduce((a, t) => a + Object.values(cat[t].songs).flat().length, 0)})\n\n| Track | Area | Song | BPM | Bars | Length | Form (bars; n = no drums, s = sparse) | What the overhaul did |\n|---|---|---|---|---|---|---|---|\n`;
const missing = [];
for (const th of THEMES) for (const [area, list] of Object.entries(cat[th].songs)) for (const s of list) {
    if (!DISPOSITION[s.name]) missing.push(s.name);
    const form = s.sections.map(x => `${x.name} ${x.bars}${x.drums === 'none' ? 'n' : x.drums === 'sparse' ? 's' : ''}${x.up ? '↑' + x.up : ''}`).join(' · ');
    md += `| ${Cap(th)} | ${area} | ${s.name} | ${s.bpm} | ${s.bars} | ${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')} | ${form} | ${DISPOSITION[s.name] || '?'} |\n`;
}

const names = SFX.sounds;
md += `\n## Effects (${names.length} names)\n\n"own": written for the track. "shared": Classic's notes through the track's profile (an intended reuse where listed below). Simple sounds have one plain version of every effect in every track.\n\n| Effect | ${THEMES.map(Cap).join(' | ')} |\n|---|${THEMES.map(() => '---').join('|')}|\n`;
const reuse = {};
for (const n of names) {
    const key = n === 'buyBig' ? 'buy' : n;
    md += `| ${n} | ${THEMES.map(th => (th === 'classic' ? (cat.classic.own.includes(key) ? 'own' : 'the design') : cat[th].own.includes(key) ? 'own' : ((reuse[th] = reuse[th] || []).push(n), 'shared'))).join(' | ')} |\n`;
}
md += `\nSprint meter: Classic plays the four shared parts; ${THEMES.filter(t => cat[t].meter).map(Cap).join(', ')} have four parts of their own each.\n\n### Intended reuse\n\n`;
for (const th of THEMES.filter(t => t !== 'classic')) md += `- ${Cap(th)}: ${(reuse[th] || []).length ? reuse[th].join(', ') + ' play Classic\'s through its profile.' : 'none: every effect is its own.'}\n`;

// Melody notes to look at: a note of an 8th or longer, starting on a beat, a semitone from a chord tone it isn't.
md += `\n## Melody notes for review\n\nA note an 8th or longer that starts on a beat a semitone away from a tone of its chord (and isn't one). Some are meant (Dark's and Ominous's flat seconds); none is changed automatically.\n\n`;
const pc = n => ((n - 57) % 12 + 12) % 12;
let flagged = 0;
for (const th of THEMES) for (const [area, list] of Object.entries(lab.songs[th])) for (const song of list) {
    const seen = new Set();
    for (const sec of song.form) {
        if (sec.mel == null) continue;
        const mel = song.mel[sec.mel], chords = song.prog[sec.chords];
        for (let bar = 0; bar < sec.bars; bar++) for (let s = 0; s < 16; s += 4) {
            const e = mel[((bar + sec.from) * 16 + s) % mel.length];
            if (!e || e.len < 2) continue;
            const ch = chords[(bar + sec.from) % chords.length], n = lab.melNote(song, e), tones = ch.iv.map(x => (ch.pc + x) % 12);
            if (tones.includes(pc(n)) || !tones.some(p => [1, 11].includes((pc(n) - p + 12) % 12))) continue;
            const key = `${sec.mel}:${(bar + sec.from) % (mel.length / 16)}:${s}:${ch.name}`;
            if (seen.has(key)) continue;
            seen.add(key); flagged++;
            md += `- ${Cap(th)}, ${song.name} (${area}), melody ${sec.mel} bar ${((bar + sec.from) % (mel.length / 16)) + 1} beat ${s / 4 + 1}: over ${ch.name}\n`;
        }
    }
}
if (!flagged) md += 'None.\n';
fs.mkdirSync(path.join(root, 'design', 'audio'), { recursive: true });
fs.writeFileSync(path.join(root, 'design', 'audio', 'coverage.md'), md);
console.log(`design/audio/coverage.md: ${THEMES.length} tracks, ${names.length} effects, ${flagged} melody notes for review${missing.length ? '; NO DISPOSITION for ' + missing.join(', ') : ''}; engine faults: ${SFX.faults.count}`);
if (missing.length || SFX.faults.count) process.exit(1);
