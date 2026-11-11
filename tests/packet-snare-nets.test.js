'use strict';
// K17 (the owner's call, 2026-11-11: the nets did nothing in the fight): from the nets' sector, a finished net shields the
// boss until every mine is disabled, a parry no longer breaks that shield, and a parry knocks the boss back harder, the
// way the flick went, disabling a mine it reels into. D20: the flick nodes are gone from the tree.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');
const E = require('../engine.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 20, h: 12, ...over });
    s.packets = [];
    return s;
}
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };
function flickLine(s, x0, y0, x1, y1) {
    for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); }
    s.liftPen();
}
function bossAt(s, x = 10, y = 6) {
    if (!s.boss) run(s, 0.05);
    Object.assign(s.boss, { x, y, vx: 0, vy: 0, stunned: 0, chargeAt: 0, charge: null, mineAt: 999 });
    s.step(1 / 60);
    return s.boss;
}
const pin = b => Object.assign(b, { vx: 0, vy: 0 });
const slash = s => flickLine(s, s.boss.x - 1.4, s.boss.y - 0.3, s.boss.x + 1.4, s.boss.y + 0.3);
// a mine and a finished net between two
function netted(s, pts) {
    const ids = pts.map(([x, y]) => { const m = { id: s.nextId++, x, y }; s.mines.push(m); return m.id; });
    for (let i = 1; i < ids.length; i++) s.links.push({ a: ids[i - 1], b: ids[i], t: 99 });
    return ids;
}

test('with netShield, a finished net keeps the boss shielded until the last mine is disabled', () => {
    const s = still({ boss: 10, bossAt: 0, bossStun: 1.6, netShield: 1, bossMines: 0 });
    const b = bossAt(s);
    netted(s, [[2, 2], [18, 10]]);
    s.step(1 / 60);
    assert.ok(b.netShield && b.shielded, 'the net shields it');
    // one mine disabled: its net goes, but the shield holds while a mine stands
    s.mines.shift(); s.links = [];
    b.stunned = s.time + 1.6; pin(b);
    s.step(1 / 60);
    assert.ok(b.shielded, 'one mine left still shields it in full');
    slash(s);
    assert.equal(b.hp, 10, 'the slash glanced');
    s.mines = [];
    s.step(1 / 60);
    assert.ok(!b.shielded && !b.netShield, 'every mine disabled: the shield is down');
    b.slashAt = -1;
    slash(s);
    assert.ok(b.hp < 10, 'now it lands');
});

test('without netShield (sector 8), two mines shield and one halves, as before', () => {
    const s = still({ boss: 10, bossAt: 0, bossStun: 1.6, bossMines: 0 });
    const b = bossAt(s);
    netted(s, [[2, 2], [18, 10]]);
    s.step(1 / 60);
    assert.ok(b.shielded && !b.netShield);
    s.mines.shift(); s.links = [];
    s.step(1 / 60);
    assert.ok(!b.shielded, 'one mine: no shield');
});

test('a parry does not break a net\'s shield, knocks the boss the way the flick went, and disables a mine it hits', () => {
    const s = still({ boss: 10, bossAt: 0, bossStun: 1.6, parry: 1, netShield: 1, bossMines: 0 });
    const b = bossAt(s);
    // two mines: one far away, one straight below the boss, a few units off
    netted(s, [[2, 1], [10, 9.5]]);
    s.step(1 / 60);
    assert.ok(b.charge && b.netShield, 'it locked on behind a net');
    const { dx, dy } = b.charge;
    // a downward flick across its warning line
    const mx = b.x + dx * 1.6, my = b.y + dy * 1.6;
    s.takeEvents();
    flickLine(s, mx, my - 1, mx, my + 1);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'parry'), 'parried');
    assert.ok(!ev.some(e => e.type === 'shieldBreak'), 'the net\'s shield holds through the parry');
    assert.ok(b.vy > 0 && Math.abs(b.vy) > Math.abs(b.vx), 'knocked back the way the flick went (down)');
    const y0 = b.y;
    run(s, 1.2);
    assert.ok(b.y - y0 > 2, `knocked well back (${(b.y - y0).toFixed(2)} units; it used to be about one)`);
    assert.equal(s.stats.minesKnocked, 1, 'the mine it reeled into is disabled');
    assert.ok(s.held.length === 1 && s.mines.length === 1, 'held, ready to fling');
});

test('the parry\'s knockback carries about parryKnock of the shorter side', () => {
    const s = still({ boss: 10, bossAt: 0, bossStun: 3, parry: 1, bossMines: 0, w: 30, h: 20 });
    const b = bossAt(s, 15, 10);
    const { dx, dy } = b.charge;
    const mx = b.x + dx * 1.6, my = b.y + dy * 1.6;
    const x0 = b.x, y0 = b.y;
    flickLine(s, mx - 1, my, mx + 1, my);
    run(s, 2.5);
    const moved = Math.hypot(b.x - x0, b.y - y0);
    assert.ok(moved > 0.25 * 20 && moved < 0.45 * 20, `moved ${moved.toFixed(2)} of a shorter side of 20`);
});

test('engine: nets shield the boss from the nets\' sector; the flick nodes are gone and v32 saves get the tree back', () => {
    // sectors are 0-based here: 10 is sector 11 (the third boss, its nets), 7 is sector 8 (mines, no net shield)
    assert.equal(E.snareOpts(E.defaultState(0), 10).netShield, 1);
    assert.equal(E.snareOpts(E.defaultState(0), 7).netShield, 0);
    for (const id of ['snareSpoof', 'snareForged', 'snareEscalate']) assert.equal(E.UPGRADE_BY_ID[id], undefined, `${id} gone`);
    assert.equal(E.UPGRADE_BY_ID.snareLaser.requires, 'snareParry');
    assert.equal(E.UPGRADE_BY_ID.snareBlueScreen.requires, 'snareLaser');
    const old = JSON.parse(JSON.stringify(E.defaultState(0)));
    old.version = 32;
    old.levels = { snareSeed: 1, snareSpoof: 2, snareLaser: 1 };
    old.snare.signal = 5; old.snare.earned = 9000;
    const s = E.migrate(old, 0);
    assert.ok(!Object.keys(s.levels).some(id => id.startsWith('snare')), 'the tree refunded');
    assert.equal(s.snare.signal, 9000, 'every Signal back');
});
