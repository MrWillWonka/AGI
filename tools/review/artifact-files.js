// tools/review/artifact-files.js — the review artifact's files and their sha256, to compare with the artifact's list_files
// before a publish, so only the files that changed are published (design/review/handoff.md, Publishing the artifact).
//   node tools/review/artifact-files.js review-out/<name>.html [--json]
// index.html is the generated one (tools/review-index.js); every other file is the repo's own, read as the artifact holds
// it (LF line endings, whatever the checkout has). --json prints the publish_files `files` list ({ as, path }) instead.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const FILES = ['debug-panel.js', 'engine.js', 'evals-ui.js', 'evals.js', 'game.js', 'packet-snare.js', 'playtest.js', 'sfx.js', 'snare-demos.js', 'styles.css',
    'training-path.js', 'tools/review/scenarios.json'];

const index = process.argv[2];
if (!index || !fs.existsSync(index)) {
    console.error('usage: node tools/review/artifact-files.js review-out/<name>.html [--json]  (make it with tools/review-index.js)');
    process.exit(1);
}
const lf = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const rows = [['index.html', path.resolve(index)], ...FILES.map(f => [f, path.join(root, f)])].map(([as, file]) => {
    const text = lf(file);
    // a CRLF checkout (no .gitattributes yet): write the LF copy beside the report, so what's published is what's hashed
    let from = file;
    if (text !== fs.readFileSync(file, 'utf8')) {
        from = path.join(path.dirname(path.resolve(index)), 'artifact-lf', as);
        fs.mkdirSync(path.dirname(from), { recursive: true });
        fs.writeFileSync(from, text);
    }
    return { as, path: from, sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'), size: Buffer.byteLength(text) };
});
if (process.argv.includes('--json')) console.log(JSON.stringify(rows.map(({ as, path: p }) => ({ as, path: p })), null, 2));
else for (const r of rows) console.log(`${r.sha256}  ${String(r.size).padStart(7)}  ${r.as}`);
