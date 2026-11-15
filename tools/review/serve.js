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

// The playtest inbox (the owner's ask, 2026-11-14): the game served from here sends its playtest log and snapshots, and
// they are saved under playtests/inbox/ (git-ignored), so a run can be read without pasting it.
//   GET  /__playtest/ping                          'playtest-inbox' (the game asks before it sends anything)
//   POST /__playtest/log?id=<run>                  the log as text            -> playtests/inbox/<run>.txt (rewritten each time)
//   POST /__playtest/shot?id=<run>&name=<n>&ext=   a png, jpg, webp or json   -> playtests/inbox/<run>/<n>.<ext>
const INBOX = path.join(root, 'playtests', 'inbox'), SAFE = /^[A-Za-z0-9_-]{1,80}$/, EXTS = new Set(['png', 'jpg', 'webp', 'json']), MAX_BODY = 25 * 1024 * 1024;
function playtestInbox(req, res) {
    const u = new URL(req.url, 'http://x'), kind = u.pathname.slice('/__playtest/'.length), say = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end(text); };
    if (kind === 'ping') return say(200, 'playtest-inbox');
    const id = u.searchParams.get('id') || '', name = u.searchParams.get('name') || '', ext = u.searchParams.get('ext') || '';
    if (req.method !== 'POST' || !SAFE.test(id) || (kind !== 'log' && !(kind === 'shot' && SAFE.test(name) && EXTS.has(ext)))) return say(400, 'bad request');
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { say(413, 'too large'); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
        if (size > MAX_BODY) return;
        const file = kind === 'log' ? path.join(INBOX, id + '.txt') : path.join(INBOX, id, `${name}.${ext}`);
        fs.mkdir(path.dirname(file), { recursive: true }, e1 => { if (e1) return say(500, 'cannot save'); fs.writeFile(file, Buffer.concat(chunks), e2 => say(e2 ? 500 : 200, e2 ? 'cannot save' : 'saved')); });
    });
}

function handler(req, res) {
    if (req.url.startsWith('/__playtest/')) return playtestInbox(req, res);
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
