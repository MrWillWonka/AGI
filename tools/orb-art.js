// tools/orb-art.js — the AI orb's art, made from the owner's pictures (design/orb/*.png, 1254 px on a dark ground).
//   node tools/orb-art.js
// Each picture is cropped square about its subject, its dark ground is turned into transparency (so the glow and the
// loose ribbons sit on the game's own background), and it is written to art/orb-<name>.webp at 512 px. The calm and
// talking spheres are also written at the picture's own size (art/orb-<name>-big.webp): the AI fills the whole screen
// for a moment when it arrives, and the small file went soft there (the owner, 2026-11-18).
// For the three sphere pictures the inside of the sphere stays solid glass; the crop puts the sphere's edge at
// SPHERE (a share of half the picture), which styles.css undoes so the sphere fills the orb's circle.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { chromium } = require(path.join(root, 'node_modules', 'playwright'));

const HALF = 610;
// name, source, the subject's centre in the picture, the sphere's radius there (0: no sphere)
const ART = [
    ['calm', 'calm.png', 619, 615, 492],
    ['talk', 'talking.png', 619, 615, 492],
    ['strong', 'strong.png', 620, 606, 492],
    ['free', 'unbound.png', 627, 627, 0],
    ['final', 'final.png', 627, 627, 0],
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    fs.mkdirSync(path.join(root, 'art'), { recursive: true });
    for (const [name, file, cx, cy, sphere] of ART) for (const [suffix, SIZE] of (name === 'calm' || name === 'talk' ? [['', 512], ['-big', HALF * 2]] : [['', 512]])) {
        const src = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'design', 'orb', file)).toString('base64');
        const out = await page.evaluate(async ({ src, cx, cy, sphere, HALF, SIZE }) => {
            const img = new Image(); img.src = src; await img.decode();
            const side = HALF * 2, c = document.createElement('canvas'); c.width = c.height = side;
            const g = c.getContext('2d', { willReadFrequently: true });
            // The ground's colour: the picture's corner. Fill with it first, so a crop past the picture's edge is ground too.
            const probe = document.createElement('canvas'); probe.width = probe.height = 8; const pg = probe.getContext('2d'); pg.drawImage(img, 0, 0, 8, 8, 0, 0, 8, 8);
            const pd = pg.getImageData(0, 0, 8, 8).data; let br = 0, bg = 0, bb = 0; for (let i = 0; i < pd.length; i += 4) { br += pd[i]; bg += pd[i + 1]; bb += pd[i + 2]; } br /= 64; bg /= 64; bb /= 64;
            g.fillStyle = `rgb(${br},${bg},${bb})`; g.fillRect(0, 0, side, side);
            g.drawImage(img, HALF - cx, HALF - cy);
            const data = g.getImageData(0, 0, side, side), d = data.data;
            for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
                const i = (y * side + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
                // How far the pixel is above the ground, as light: that is its opacity over the game's background.
                const up = Math.max(r - br, gr - bg, b - bb, 0);
                let a = Math.min(1, Math.pow(up / 96, 0.85));
                if (sphere) { const rr = Math.hypot(x - HALF, y - HALF); const inside = Math.max(0, Math.min(1, (sphere - 3 - rr) / 6)); a = Math.max(a, inside); }
                if (a < 0.012) { d[i + 3] = 0; continue; }
                // Take the ground back out of the colour, so a faint glow is its own colour, not darkened by the ground.
                const un = (v, g0) => Math.max(0, Math.min(255, (v - g0 * (1 - a)) / a));
                d[i] = un(r, br); d[i + 1] = un(gr, bg); d[i + 2] = un(b, bb); d[i + 3] = Math.round(a * 255);
            }
            g.putImageData(data, 0, 0);
            const o = document.createElement('canvas'); o.width = o.height = SIZE; const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, SIZE, SIZE);
            return o.toDataURL('image/webp', 0.92);
        }, { src, cx, cy, sphere, HALF, SIZE });
        const buf = Buffer.from(out.split(',')[1], 'base64');
        fs.writeFileSync(path.join(root, 'art', `orb-${name}${suffix}.webp`), buf);
        console.log(`art/orb-${name}${suffix}.webp  ${buf.length} bytes  (${out.slice(5, 15)})`);
    }
    await browser.close();
})();
