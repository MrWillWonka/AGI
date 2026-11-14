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
    'Night Survey': 'Variety pass: rewritten as slow dub in D Dorian, half-time, glass-bell lead, phrases of 6 and 5 bars',
    'Uptime': 'Kept (the owner likes it)', 'Overclock': 'Kept (the owner likes it)',
    'Packet Storm': 'Variety pass: rewritten as electro in E Phrygian, broken kick, plucked 16th riff, 4- and 6-bar phrases',
    'Packet Sniffer': 'Variety pass: rewritten in 6/8, muted plucks, 6-bar phrases', 'Dead Drop': 'Variety pass: rewritten in 7/8, a soft lead, a chord a bar',
    'Foundry': 'Variety pass: rewritten half-time in D minor: reese bass, struck-metal lead, no acid line',
    'Rust': 'Variety pass: rewritten nearly beatless: drone bass, a sliding voice, phrases of 5 and 7 bars',
    'Warehouse': 'Variety pass: melodies and acid line kept; faster; a club form with a 16-bar drop',
    'Pressure': 'Variety pass: rewritten as a 12-step shuffle: square stabs in 3-bar phrases, a triplet acid line',
    'Black Box': 'Variety pass: rewritten slower, struck metal in 6-bar phrases', 'Tripwire': 'Variety pass: rewritten fast in G Dorian, broken kick, square stabs',
    'Morning Lab': 'Kept (the owner likes it)',
    'Window Seat': 'Variety pass: rewritten as a waltz: flute lead, guitar on two and three',
    'Gentle Climb': 'Variety pass: melodies kept; soft house, straight, the electric piano leads; the long one',
    'Glide Path': 'Variety pass: melodies kept; a bossa on the clave, nylon guitar; short',
    'Tiptoe': 'Variety pass: rewritten as a slow shuffle, glass bell, a chord a bar', 'Hushed Channel': 'Variety pass: rewritten as a lullaby in F Lydian, 5-bar phrases, no struck chords',
    'Vigil': 'Kept (the owner likes it)',
    'Static': 'Variety pass: rewritten with no pulse, heard from E (Phrygian dominant), the tune tolled on a bell, phrases of 7 and 5 bars',
    'Descent': 'Variety pass: rewritten as a march: bowed low strings, a limping kick, voices, 4- and 6-bar phrases',
    'Undertow': 'Variety pass: rewritten in 6/8 over a rocking arpeggio, phrases of 6 and 8 bars',
    'Crawlspace': 'Variety pass: rewritten for a music box, faster, 5-bar phrases', 'Lights Out': 'Kept (the owner likes it)',
    'Pixel Desk': 'Kept (the owner likes it)', 'Save Point': 'Variety pass: rewritten as a lullaby in three, triangle lead, no kick; a short loop',
    'Boss Rush': 'Variety pass: rewritten faster in D Dorian, a hammered 16th riff on two squares, 4- and 6-bar phrases; the long one',
    'Turbo': 'Variety pass: rewritten as a shuffle in G Mixolydian with a boogie bass; three short laps',
    'Sneaking Mission': 'Variety pass: rewritten in 5/4 (3 + 3 + 2 + 2)', 'Hide and Seek': 'Kept (the owner likes it)'
};

let md = `# Audio coverage\n\nWritten by \`node tools/audio/coverage.js\` from the engine and the theme files. Do not edit by hand.\n\n## Tracks\n\n| Track | BPM | Swing | Held-job notes a second | Effects' pitch | Layer order (first to last) | Space |\n|---|---|---|---|---|---|---|\n`;
const stepOf = bpm => 60 / bpm / 4, gridMul = bpm => Math.pow(2, Math.round(Math.log2(0.121 / stepOf(bpm))));
for (const th of THEMES) {
    const c = cat[th], hold = (c.holdDiv || 2 * gridMul(c.bpm)) * stepOf(c.bpm);
    const order = Object.entries(c.layers).sort((a, b) => a[1] - b[1]).map(([k, v]) => (v < 0 ? `**${k}**` : k)).join(', ');
    const sp = c.space || {};
    md += `| ${Cap(th)} | ${c.bpm} | ${c.swing ? Math.round(c.swing * 100) + '% of a 16th' : 'straight'} | ${(1 / hold).toFixed(2)} | ${c.pitch === 'key' ? "the track's key (tension kept)" : 'fitted to the chord'} | ${order} | ${[sp.reverb && `reverb ${sp.reverb.seconds} s`, sp.delay && `delay ${sp.delay.steps} steps`, sp.width != null && `width ${sp.width}`].filter(Boolean).join(', ') || 'dry'} |\n`;
}
md += `\nBold layers are always in. Income is 4.13 repeats a second in every track (engine.js \`holdClock\`).\n\n## Songs (${THEMES.reduce((a, t) => a + Object.values(cat[t].songs).flat().length, 0)})\n\n| Track | Area | Song | Tempo | Meter | Lead | Bars | Length | Form (bars; n = no drums, s = sparse) | What the overhaul did |\n|---|---|---|---|---|---|---|---|---|---|\n`;
const missing = [];
const METER = { '16/4': '4/4', '12/4': '3/4', '12/6': '6/8', '12/3': '12/8', '14/4': '7/8', '20/4': '5/4' };
for (const th of THEMES) for (const [area, list] of Object.entries(cat[th].songs)) for (const s of list) {
    if (!DISPOSITION[s.name]) missing.push(s.name);
    const form = s.sections.map(x => `${x.name} ${x.bars}${x.drums === 'none' ? 'n' : x.drums === 'sparse' ? 's' : ''}${x.up ? '↑' + x.up : ''}`).join(' · ');
    md += `| ${Cap(th)} | ${area} | ${s.name} | ${s.tempo}${s.swing ? ' swung' : ''} | ${METER[s.steps + '/' + (s.tempo === s.bpm ? 4 : Math.round(4 * s.bpm / s.tempo))] || s.steps + ' steps'} | ${s.lead || "the track's"}${s.kit ? ', own kit' : ''} | ${s.bars} | ${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')} | ${form} | ${DISPOSITION[s.name] || '?'} |\n`;
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
        const N = song.steps;
        for (let bar = 0; bar < sec.bars; bar++) for (let s = 0; s < N; s += 4) {
            const e = mel[((bar + sec.from) * N + s) % mel.length];
            if (!e || e.len < 2) continue;
            const ch = chords[(bar + sec.from) % chords.length], n = lab.melNote(song, e), tones = ch.iv.map(x => (ch.pc + x) % 12);
            if (tones.includes(pc(n)) || !tones.some(p => [1, 11].includes((pc(n) - p + 12) % 12))) continue;
            const key = `${sec.mel}:${(bar + sec.from) % (mel.length / N)}:${s}:${ch.name}`;
            if (seen.has(key)) continue;
            seen.add(key); flagged++;
            md += `- ${Cap(th)}, ${song.name} (${area}), melody ${sec.mel} bar ${((bar + sec.from) % (mel.length / N)) + 1} beat ${s / 4 + 1}: over ${ch.name}\n`;
        }
    }
}
if (!flagged) md += 'None.\n';
fs.mkdirSync(path.join(root, 'design', 'audio'), { recursive: true });
fs.writeFileSync(path.join(root, 'design', 'audio', 'coverage.md'), md);
console.log(`design/audio/coverage.md: ${THEMES.length} tracks, ${names.length} effects, ${flagged} melody notes for review${missing.length ? '; NO DISPOSITION for ' + missing.join(', ') : ''}; engine faults: ${SFX.faults.count}`);
if (missing.length || SFX.faults.count) process.exit(1);
