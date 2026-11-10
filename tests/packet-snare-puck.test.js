'use strict';
// Snare 17.7 (the owner's calls on the 17.6 log): boss mines are laid out in the arena (they sat too close), a thrown mine
// is a puck that flies the way it was flicked and bounces off the field's edges (air hockey), each bounce before a hit
// adding damage with Ricochet, and the Antivirus hunt faster.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function arena(over = {}) {
    const s = P.createSnare({ seed: 3, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 20, h: 12, bubble: 1, boss: 60, bossAt: 0, bossMines: 2, mineEvery: 99, ...over });
    s.packets = [];
    for (let i = 0; i < 3; i++) s.step(1 / 60);
    Object.assign(s.boss, { x: 10, y: 6, vx: 0, vy: 0, chargeAt: 999, charge: null, mineAt: 999 });
    return s;
}
const hold = (s, x, y) => { s.held.push({ id: 900 + s.held.length, x, y, until: s.time + 99 }); };
function flick(s, x0, y0, x1, y1) {
    s.setPen('wire');
    for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); }
    s.liftPen();
    s.setPen(null);
}
const fly = (s, secs) => { for (let i = 0; i < secs * 60; i++) { if (s.boss) Object.assign(s.boss, { vx: 0, vy: 0, x: 10, y: 6, chargeAt: 999, charge: null }); s.step(1 / 60); } };

test('mines are laid out in the arena, not hugging the boss', () => {
    const s = P.createSnare({ seed: 9, density: 0, antivirus: [], idleDrain: 0, sweepFirst: Infinity, w: 20, h: 12, boss: 60, bossAt: 0, bossMines: 3, mineEvery: 1 });
    for (let i = 0; i < 3 * 60 && s.mines.length < 3; i++) s.step(1 / 60);
    assert.equal(s.mines.length, 3);
    const short = 12;
    for (const m of s.mines) assert.ok(Math.hypot(m.x - s.boss.x, m.y - s.boss.y) > 0.2 * short, 'at least a fifth of the field out');
    assert.ok(s.links.length >= 2, 'still linking into nets across the ring');
});

test('a thrown mine flies the way it was flicked, bounces off the edge and can bank into the boss', () => {
    const s = arena();
    hold(s, 16, 6);
    // flick at the boss's mirror image over the top edge (10, -5.36): it bounces down off it into the boss
    flick(s, 16, 6, 15.1, 4.3);
    assert.equal(s.thrown.length, 1, 'in flight');
    let ev = [];
    for (let i = 0; i < 90 && !ev.some(e => e.type === 'mineThrow' || e.type === 'mineDud'); i++) { fly(s, 1 / 60); ev = ev.concat(s.takeEvents()); }
    assert.ok(ev.some(e => e.type === 'mineBounce'), 'it bounced off the top edge');
    const hit = ev.find(e => e.type === 'mineThrow');
    assert.ok(hit && hit.bounces === 1, 'and banked into the boss');
    assert.equal(hit.damage, P.SNARE.mineThrow, 'no bonus without Ricochet');
});

test('Ricochet: each bounce before a hit adds damage; past its bounces a mine is a dud', () => {
    const s = arena({ mineBounces: 3, mineBank: 0.5 });
    hold(s, 16, 6);
    flick(s, 16, 6, 15.1, 4.3);
    let ev = [];
    for (let i = 0; i < 90 && !ev.some(e => e.type === 'mineThrow'); i++) { fly(s, 1 / 60); ev = ev.concat(s.takeEvents()); }
    const hit = ev.find(e => e.type === 'mineThrow');
    assert.ok(hit);
    assert.equal(hit.damage, Math.round(P.SNARE.mineThrow * 1.5));
    // straight into a wall with no bounces allowed: a dud
    const d = arena({ mineBounces: 0 });
    hold(d, 17, 6);
    flick(d, 17, 6, 19, 6);
    let dv = [];
    for (let i = 0; i < 60 && !dv.some(e => e.type === 'mineDud'); i++) { fly(d, 1 / 60); dv = dv.concat(d.takeEvents()); }
    assert.ok(dv.some(e => e.type === 'mineDud'), 'a dud at the edge');
    assert.equal(d.stats.mineHits, 0);
});

test('the game gives a puck its bounces and Ricochet; Antivirus hunt faster', () => {
    const st = E.defaultState(Date.now());
    const o = E.snareOpts(st, 7);
    assert.equal(o.mineBounces, P.SNARE.mineBounces);
    assert.equal(o.mineBank, 0);
    st.levels.snareRicochet = 2;
    const r = E.snareOpts(st, 7);
    assert.equal(r.mineBounces, P.SNARE.mineBounces + 2);
    assert.equal(r.mineBank, 1);
    assert.ok(o.avHunt > P.SNARE.avHunt * 1.2, 'they hunt faster');
});
