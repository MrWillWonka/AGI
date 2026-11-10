// tools/review/serve.js — the review tools' own server: serves the repo with caching off, as server.py does, in Node, so
// the report and the kit need no Python (the owner's Windows machine had none) and no server started by hand.
//   node tools/review/serve.js [port]          serve the repo (default 8123) until stopped
//   const { ensureServer } = require('./serve.js');
//   const srv = await ensureServer('http://localhost:8123/'); ... srv.url ... srv.close();
// `ensureServer` uses a server already answering at the URL with the game (a frozen round's, server.py's); else it serves
// the repo itself there, or, if that port can't be had (taken by something else, or held by a socket Windows hasn't let
// go of), on the next free one up, and says which.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function handler(req, res) {
    let rel;
    try { rel = decodeURIComponent(req.url.split(/[?#]/)[0]); } catch { res.writeHead(400); return res.end(); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    });
}

// Listen on `port` (the OS's full connection queue: server.py's default of 5 refused the report's three browsers loading
// at once on Windows). Resolves to the server, or null if the port can't be had.
function listen(port) {
    return new Promise(res => {
        const server = http.createServer(handler);
        server.once('error', () => res(null));
        server.listen(port, '127.0.0.1', 511, () => res(server));
    });
}

// Is the game being served at `url`?
function answers(url) {
    return new Promise(res => {
        const req = http.get(url, r => {
            let body = '';
            r.setEncoding('utf8');
            r.on('data', c => { if (body.length < 4096) body += c; });
            r.on('end', () => res(r.statusCode === 200 && /Path to AGI/i.test(body)));
        });
        req.on('error', () => res(false));
        req.setTimeout(1500, () => { req.destroy(); res(false); });
    });
}

async function ensureServer(url = 'http://localhost:8123/') {
    if (await answers(url)) return { url, own: false, close: async () => {} };
    const u = new URL(url);
    const base = +u.port || 80;
    for (let port = base; port < base + 20; port++) {
        const server = await listen(port);
        if (!server) continue;
        u.port = String(port);
        return { url: u.toString(), own: true, port, close: () => new Promise(r => server.close(() => r())) };
    }
    throw new Error(`no free port from ${base} to ${base + 19} to serve the game on`);
}

module.exports = { ensureServer };

if (require.main === module) {
    const port = +process.argv[2] || 8123;
    ensureServer(`http://localhost:${port}/`).then(s => console.log(s.own ? `serving ${root} on ${s.url} (Ctrl+C to stop)` : `already served at ${s.url}`))
        .catch(e => { console.error(e.message); process.exit(1); });
}
