// tools/review-index.js — the review build's index.html: the game's own, opening straight into Packet Snare
// (window.AGI_SNARE_DIRECT, read by game.js; the opening skipped, the bay opened as debug's Open Packet Snare does).
//   node tools/review-index.js <out.html>
'use strict';
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
if (!out) { console.error('usage: node tools/review-index.js <out.html>'); process.exit(1); }
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const tag = '    <script defer src="engine.js"></script>';
if (!html.includes(tag)) throw new Error('index.html: engine.js script tag not found');
fs.writeFileSync(out, html.replace(tag, '    <script>window.AGI_SNARE_DIRECT = true;</script>\n' + tag));
console.log('wrote', out);
