'use strict';
// Packet Snare 9: the boss fought with flicks (parry its charge, slash it while it reels; health that grows each sector),
// its mines and nets (a shield until you loop them), the boss keeping to the middle, Antivirus working in shifts, Fork Bomb
// (figure eights), the star drawn while frozen, Privilege Escalation, and round 4's rule leaks.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, drawBase: 0, drawDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 12, h: 8, ...over });
    s.packets = [];
    return s;
}
const packet = (s, kind, x, y, vx = 0, vy = 0) => {
    const p = { id: s.nextId++, kind, x, y, vx, vy, v: Math.hypot(vx, vy), r: P.PACKET_R, age: 1, school: 0, tag: 0 };
    s.packets.push(p);
    return p;
};
const run = (s, seconds) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };
function circle(s, cx, cy, r, lift = true) {
    const n = Math.max(24, Math.ceil(2 * Math.PI * r / 0.12));
    for (let i = 0; i <= n + 2; i++) s.addPoint(cx + Math.cos(-Math.PI / 2 + i / n * Math.PI * 2) * r, cy + Math.sin(-Math.PI / 2 + i / n * Math.PI * 2) * r);
    if (lift) s.liftPen();
}
function flickLine(s, x0, y0, x1, y1) {
    for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); }
    s.liftPen();
}
// A boss pinned at (x, y), about to charge.
function bossAt(s, x = 6, y = 4) {
    if (!s.boss) run(s, 0.05);
    Object.assign(s.boss, { x, y, vx: 0, vy: 0, stunned: 0, chargeAt: 0, charge: null });
    s.step(1 / 60);
    return s.boss;
}
// A flick across the boss's warning line.
function parry(s) {
    const b = s.boss, { dx, dy } = b.charge;
    const mx = b.x + dx * 1.6, my = b.y + dy * 1.6;
    flickLine(s, mx - dy * 1.2, my + dx * 1.2, mx + dy * 1.2, my - dx * 1.2);
}
const slash = s => flickLine(s, s.boss.x - 1.4, s.boss.y - 0.3, s.boss.x + 1.4, s.boss.y + 0.3);

test('the boss fight (Riposte): parry its charge, then slash it while it reels; its health runs down to a cleared sector', () => {
    const s = still({ boss: 3, bossAt: 0, bossStun: 1.6, parry: 1 });
    const b = bossAt(s);
    assert.ok(b.charge, 'it locked on (a warning line)');
    parry(s);
    assert.equal(s.stats.parries, 1);
    assert.ok(b.stunned > s.time, 'it reels');
    assert.equal(b.hp, 3, 'a parry alone does no damage');
    slash(s);
    assert.equal(b.hp, 2);
    run(s, 0.32);
    slash(s);
    assert.equal(b.hp, 1, 'every flick through it while it reels is a slash');
    run(s, 0.32);
    slash(s);
    assert.equal(s.boss, null);
    assert.equal(s.stats.bosses, 1);
    assert.equal(s.stats.bossDamage, 3);
});

test('a loop round the boss stuns it (Snare 12): no parry needed, and slashes land while it reels', () => {
    const s = still({ boss: 3, bossAt: 0 });
    const b = bossAt(s);
    assert.ok(b.charge, 'it locked on');
    parry(s);
    assert.equal(s.stats.parries, 0, 'without Riposte a flick across its line is no parry');
    assert.ok(!(b.stunned > s.time));
    Object.assign(b, { charge: null, chargeAt: 1e9 });
    circle(s, b.x, b.y, b.r + 0.8);
    assert.equal(s.stats.loopStuns, 0, 'one loop isn\'t enough (Snare 12.7)');
    assert.equal(b.loops, 1);
    s.step(0.5);
    circle(s, b.x, b.y, b.r + 0.8);
    assert.equal(s.stats.loopStuns, 1, 'the second loop round it stuns it');
    assert.ok(b.stunned > s.time && !b.charge);
    slash(s);
    assert.equal(b.hp, 2, 'and a slash lands');
    // A loop that touches it snaps instead (the boss's body cuts the wire).
    const t = still({ boss: 3, bossAt: 0 });
    const c = bossAt(t);
    Object.assign(c, { charge: null, chargeAt: 1e9 });
    circle(t, c.x, c.y, c.r * 0.6);
    assert.equal(t.stats.loopStuns, 0);
});

test('its charge line is long and it dashes all of it (Snare 12)', () => {
    const s = still({ boss: 3, bossAt: 0 });
    packet(s, 'good', 11.5, 4);
    const b = bossAt(s, 6, 4);
    Object.assign(b, { x: 6, y: 4, charge: null, chargeAt: 0 });
    for (let i = 0; i < 6 && !b.charge; i++) s.step(1 / 60);
    assert.ok(b.charge, 'it locked on');
    const len = s.chargeReach(b);
    assert.ok(len >= 0.35 * s.w, `a long line: ${len.toFixed(2)} on a field ${s.w} wide (it stops short of the wall)`);
    const x0 = b.x, y0 = b.y, { dx, dy } = b.charge;
    run(s, b.charge.warn + 0.85);
    const went = (b.x - x0) * dx + (b.y - y0) * dy;
    assert.ok(went >= (len - b.r) * 0.85, `it dashed ${went.toFixed(2)} of ${(len - b.r).toFixed(2)}`);
});

test('a slash needs it reeling: through its guard nothing lands, and a Firewall\'s stun opens it too', () => {
    const s = still({ boss: 3, bossAt: 0, firewalls: 1 });
    const b = bossAt(s);
    b.charge = null;
    b.chargeAt = 1e9;
    slash(s);
    assert.equal(b.hp, 3);
    assert.ok(s.takeEvents().some(e => e.type === 'bossBlock' && e.reason === 'guard'));
    s.placeZone(8, 4);
    Object.assign(b, { x: 6.2, y: 4, vx: 2, vy: 0 });
    run(s, 0.3);
    assert.ok(b.stunned > s.time, 'the Firewall section stunned it');
    slash(s);
    assert.equal(b.hp, 2, 'and a slash lands');
});

test('Riposte: a parry that deals damage; more slash damage takes more off', () => {
    const s = still({ boss: 9, bossAt: 0, parryDamage: 2, slashDamage: 3, parry: 1 });
    bossAt(s);
    parry(s);
    assert.equal(s.boss.hp, 7);
    slash(s);
    assert.equal(s.boss.hp, 4);
});

test('its mines shield it until a loop clears them; finished nets wipe the data along and inside them', () => {
    const s = still({ boss: 5, bossAt: 0, bossMines: 3, netTime: 1, netRange: 0.6 });
    run(s, 2);
    assert.equal(s.mines.length, 3, 'it laid its mines');
    assert.ok(s.boss.shielded);
    // nets: a packet in the middle of the triangle is wiped once they're done
    run(s, 1.2);
    const [A, B, C] = s.mines;
    const mid = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
    assert.ok(s.netAreas().length >= 1, 'the three nets make a quarantined triangle');
    s.boss.stunned = s.time + 5;   // reeling, it wipes nothing itself
    packet(s, 'good', mid.x, mid.y);
    run(s, 1.1);
    assert.ok(s.stats.netted >= 1, 'the quarantined data is wiped');
    // shielded: a slash glances off
    Object.assign(s.boss, { x: 6, y: 4, vx: 0, vy: 0, stunned: s.time + 2, charge: null, chargeAt: 1e9 });
    slash(s);
    assert.equal(s.boss.hp, 5);
    assert.equal(s.stats.glanced, 1);
    // loop every mine
    for (const m of [...s.mines]) { Object.assign(s.boss, { x: 6, y: 4, vx: 0, vy: 0, stunned: s.time + 2, chargeAt: 1e9, charge: null }); circle(s, m.x, m.y, 0.8); }
    assert.equal(s.mines.length, 0);
    assert.equal(s.links.length, 0, 'their nets go with them');
    run(s, 0.35);
    assert.ok(!s.boss.shielded);
    slash(s);
    assert.equal(s.boss.hp, 4, 'the shield is down');
});

test('the boss keeps to the middle of the field (only its dash takes it out, and it walks back)', () => {
    const s = still({ boss: 3, bossAt: 0, bossCharge: 1e9 });
    // all the data along the left edge
    for (let i = 0; i < 6; i++) packet(s, 'good', 0.4, 1 + i);
    run(s, 0.05);
    s.boss.chargeAt = 1e9;
    let minX = Infinity;
    for (let i = 0; i < 600; i++) { s.step(1 / 60); minX = Math.min(minX, s.boss.x); }
    const e = 0.18 * Math.min(s.w, s.h) + s.boss.r;
    assert.ok(minX >= e - 0.01, `it stayed ${minX.toFixed(2)} from the edge (≥ ${e.toFixed(2)})`);
    assert.equal(s.stats.wiped, 0, 'and the data along the edge was safe from it');
});

test('Antivirus work in shifts: while they update they can\'t snap your wire', () => {
    const s = still({ antivirus: [0], avOn: 1, avOff: 3 });
    run(s, 1.1);
    const f = s.antivirus[0];
    assert.ok(f.off, 'off shift');
    Object.assign(f, { x: 6, y: 4 });
    for (let x = 4; x <= 8; x += 0.2) s.addPoint(x, 4);
    run(s, 0.5);
    assert.equal(s.stats.snaps, 0);
    run(s, 2.6);
    assert.ok(!f.off, 'back on shift');
});

test('Fork Bomb: a figure eight pays both lobes at their multipliers multiplied; one red packet spoils both', () => {
    const eight = (s, cx, cy, rx, ry) => {
        const n = 80;
        for (let i = 0; i <= n + 2; i++) { const t = i / n * Math.PI * 2 + Math.PI / 2; s.addPoint(cx + Math.cos(t) * rx, cy + Math.sin(2 * t) * ry); }
        s.liftPen();
    };
    const plain = still();
    packet(plain, 'good', 4.5, 4); packet(plain, 'good', 7.5, 4);
    eight(plain, 6, 4, 2.5, 1.2);
    const s = still({ fork: 1 });
    packet(s, 'good', 4.5, 4); packet(s, 'good', 7.5, 4);
    eight(s, 6, 4, 2.5, 1.2);
    assert.equal(s.stats.forks, 1);
    assert.equal(s.stats.catches, 1, 'one catch for both lobes');
    assert.ok(s.stats.units > plain.stats.units * 1.05, `${s.stats.units.toFixed(2)} > ${plain.stats.units.toFixed(2)}`);
    const bad = still({ fork: 1 });
    packet(bad, 'good', 4.5, 4); packet(bad, 'corrupt', 7.5, 4);
    eight(bad, 6, 4, 2.5, 1.2);
    assert.equal(bad.stats.corrupted, 1);
    assert.equal(bad.stats.caught, 0, 'the clean lobe is lost too');
});

test('a star drawn while frozen catches everything inside its outline ×2 and deletes the corrupt packets there', () => {
    const star = (s, cx, cy, r) => {
        const tips = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
        for (let i = 0; i < 5; i++) for (let k = 0; k < 8; k++) s.addPoint(tips[i][0] + (tips[i + 1][0] - tips[i][0]) * k / 8, tips[i][1] + (tips[i + 1][1] - tips[i][1]) * k / 8);
        s.addPoint(...tips[5]);
        s.addPoint(tips[5][0] + 0.05, tips[5][1] + 0.12);
        s.liftPen();
    };
    const s = still({ freeze: 1, star: 1 });
    packet(s, 'good', 6, 4); packet(s, 'good', 6.8, 3.6); packet(s, 'corrupt', 5.4, 4.3);
    s.usePower('freeze');
    star(s, 6, 4, 2);
    assert.equal(s.stats.stars, 1);
    assert.equal(s.stats.caught, 2);
    assert.equal(s.stats.corrupted, 0, 'a star never spoils');
    assert.ok(!s.packets.some(p => p.kind === 'corrupt'), 'the corrupt packet inside is gone');
    const thawed = still({ freeze: 1, star: 1 });
    packet(thawed, 'good', 6, 4);
    star(thawed, 6, 4, 2);
    assert.equal(thawed.stats.stars, 0, 'only while frozen');
});

test('Privilege Escalation: a flick from your hijacked Antivirus into the boss rams it, and spends the ally', () => {
    const s = still({ boss: 9, bossAt: 0, hijack: 1, escalate: 1, escalateDamage: 4, antivirus: [0] });
    run(s, 0.05);
    const f = s.antivirus[0];
    Object.assign(f, { ally: s.time + 8, x: 2, y: 4, vx: 0, vy: 0 });
    Object.assign(s.boss, { x: 7, y: 4, vx: 0, vy: 0, chargeAt: 1e9, charge: null });
    flickLine(s, 2, 4, 8, 4);
    assert.equal(s.stats.escalations, 1);
    assert.equal(s.boss.hp, 5);
    assert.ok(!s.antivirus.includes(f), 'the ally is spent');
    assert.equal(s.stats.snaps, 0, 'a flick through the boss isn\'t snapped');
});

test('round 4\'s leaks: a card\'s pen-cancel judges nothing; rebuilding walls are kept; spoofed packets pass your walls; a race counts only once held', () => {
    const s = still({ spoof: 1 });
    packet(s, 'corrupt', 2.5, 1.5);
    for (let i = 0; i <= 8; i++) s.addPoint(1 + 3 * i / 8, 1.2);
    s.cancelPen();
    assert.equal(s.flags, 0, 'no flag');
    assert.ok(!s.drawing);
    const g = still({ firewalls: 2, wallRebuild: 8, zoneHp: 0.5, antivirus: [0], avOn: 99 });
    g.placeZone(5, 4);
    g.placeZone(9.5, 4);
    run(g, 0.05);
    Object.assign(g.antivirus[0], { x: 3, y: 4, vx: 2, vy: 0 });
    run(g, 1.5);
    assert.equal(g.rebuild.length, 1);
    assert.equal(g.layoutOf().zones.length, 2, 'the section being rebuilt is in the layout');
    const w = still({ firewalls: 1, spoof: 1 });
    w.placeZone(6, 4);
    const c = packet(w, 'corrupt', 3, 4, 1, 0);
    c.spoof = 99;
    run(w, 3.5);
    assert.ok(c.x > 6, 'the spoofed packet went into the section');
    const r = still({ race: 1 });
    packet(r, 'good', 6, 4);
    circle(r, 6, 4, 1);
    assert.equal(r.stats.raced, 0, 'a ring lifted at once isn\'t a held race');
});

test('IDS alerts say what they set off', () => {
    const s = still({ spoof: 1, boss: 2, bossAt: 1e9, bossCatch: 1e9, flagLimit: 1 });
    packet(s, 'corrupt', 2.5, 1.6);
    flickLine(s, 1, 1, 4, 1);
    assert.equal(s.takeEvents().find(e => e.type === 'ids').what, 'boss');
    const t = still({ spoof: 1, flagLimit: 1 });
    packet(t, 'corrupt', 2.5, 1.6);
    flickLine(t, 1, 1, 4, 1);
    assert.equal(t.takeEvents().find(e => e.type === 'ids').what, 'antivirus');
});

test('training skills power you up in Packet Snare, each by its name', () => {
    const E = require('../engine.js');
    const s = E.defaultState(1);
    const base = E.snareOpts(s, E.RED_SECTOR);
    assert.deepEqual(E.snareSkillBuffs(s), [], 'none before any skill');
    s.path.learned = E.SKILL_INDEX['Translation'] + 1;
    const o = E.snareOpts(s, E.RED_SECTOR);
    const names = E.snareSkillBuffs(s).map(b => b.name);
    assert.ok(names.includes('Image Recognition') && names.includes('Translation'));
    assert.equal(o.slashDamage, base.slashDamage + 2, 'the two walls add slash damage');
    assert.ok(o.bossWarn > base.bossWarn && o.focus > base.focus && o.corruptShare < base.corruptShare && o.density > base.density);
    for (const [name, b] of Object.entries(E.SNARE_SKILL_BUFFS)) {
        assert.ok(E.SKILL_INDEX[name] !== undefined, `${name} is a skill`);
        assert.ok(b.text.length <= 80, `${name}: a short line`);
    }
    // The field's hazards (Snare 14, the owner's call: red on sector 2, Antivirus on 3, Full Scans on 5, then the Rogue
    // AI and faster scans every three sectors), the boss's gates on its sectors (every fifth, from the second boss),
    // never on one sector.
    const field = E.SNARE_STAGES.filter(x => !x.gate && x.sector).map(x => x.sector);
    const gates = E.SNARE_STAGES.filter(x => x.gate).map(x => x.sector);
    assert.deepEqual(field, [1, 2, 4, 8, 11]);
    assert.deepEqual(gates.map((k, i) => (i ? k - gates[i - 1] : 5)), gates.map(() => 5));
    assert.ok(gates.every(E.isSnareBossSector) && gates[0] > 4, 'gates are boss sectors, after the first boss');
    assert.ok(!gates.some(k => field.includes(k)));
});
