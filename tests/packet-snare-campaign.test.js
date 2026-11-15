'use strict';
// After the 18.7 log (the owner's calls): 15 sectors to a big end boss, bosses on 3, 6, 9, 12 and 15, endless after; each
// boss past the first answered by a Training skill (without it your hits do a fraction of their damage).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const P = require('../packet-snare.js');

test('bosses on sectors 3, 6, 9, 12 and the end boss on 15, then on every third sector after', () => {
    const bosses = [];
    for (let k = 0; k < 21; k++) if (E.isSnareBossSector(k)) bosses.push(k + 1);
    assert.deepEqual(bosses, [3, 6, 9, 12, 15, 18, 21]);
    assert.equal(E.SNARE_END_BOSS + 1, 15);
    assert.ok(E.snareBossHealth(14) > 2 * E.snareBossHealth(11), 'the end boss is big');
    assert.ok(E.snareBossHealth(17) > E.snareBossHealth(14), 'and the endless ones past it grow');
    const end = E.snareOpts(E.defaultState(1), 14);
    assert.ok(end.bossMines === 4 && end.bossMinions >= 1 && end.netShield === 1, 'the end boss brings every trick');
    assert.ok(end.bossFight > E.snareOpts(E.defaultState(1), 11).bossFight, 'and a longer fight');
});

test('each boss past the first names a Training skill, further along each time; without it hits do a fraction', () => {
    const s = E.defaultState(1);
    assert.equal(E.snareGateSkill(s, 2), null, 'the first boss needs no skill');
    assert.equal(E.snareGateSkill(s, 3), null, 'a goal sector needs none');
    assert.deepEqual(E.SNARE_GATE_SKILLS.map(([k, name]) => [k + 1, name]),
        [[6, 'Image Recognition'], [9, 'Speech Recognition'], [12, 'Translation'], [15, 'Analogy']]);
    const idx = E.SNARE_GATE_SKILLS.map(([, name]) => E.SKILL_INDEX[name] + 1);
    assert.equal(idx[0], 6, 'the first gate is skill 6');
    for (let i = 2; i < idx.length; i++) assert.ok(idx[i] - idx[i - 1] >= idx[i - 1] - idx[i - 2], 'each further than the last');
    // The playground link turns the gates off: every boss takes full damage.
    E.setPlayground(true);
    try {
        assert.equal(E.snareGateSkill(s, 5), null);
        assert.equal(E.snareOpts(s, 5).bossArmor, 1);
        assert.equal(E.snareOpts(s, 14).bossArmor, 1);
    } finally { E.setPlayground(false); }
    assert.equal(E.snareOpts(s, 5).bossArmor, E.SNARE_GATE_ARMOR);
    s.path.learned = E.SKILL_INDEX['Image Recognition'] + 1;
    assert.equal(E.snareOpts(s, 5).bossArmor, 1, 'learned: full damage');
    assert.equal(E.snareGateSkill(s, 8), 'Speech Recognition', 'the next boss needs the next skill');
    s.path.learned = E.SKILL_INDEX['Analogy'] + 1;
    assert.equal(E.snareGateSkill(s, 14), null);
    assert.equal(E.snareGateSkill(s, 17), null, 'the endless bosses need nothing more');
});

test('a gated boss takes that share of a slash', () => {
    const flick = (s, x0, y0, x1, y1) => { for (let i = 0; i <= 8; i++) { s.addPoint(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); if (i % 3 === 0) s.step(1 / 60); } s.liftPen(); };
    const hit = armor => {
        const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 20, h: 12, boss: 50, bossAt: 0, bossMines: 0, slashDamage: 4, bossArmor: armor });
        s.packets = [];
        for (let i = 0; i < 3 && !s.boss; i++) s.step(1 / 60);
        const b = s.boss;
        Object.assign(b, { x: 10, y: 6, vx: 0, vy: 0, chargeAt: 999, charge: null, mineAt: 999, stunned: s.time + 2 });
        const before = b.hp;
        s.events.length = 0;
        flick(s, 8.6, 5.7, 11.4, 6.3);
        hits[armor] = s.events.filter(e => e.type === 'bossHit');
        return before - b.hp;
    };
    const hits = {};
    const full = hit(1), gated = hit(E.SNARE_GATE_ARMOR);
    assert.ok(full > 0, 'a slash lands');
    assert.ok(Math.abs(gated - full * E.SNARE_GATE_ARMOR) < 1e-9, 'gated: ' + gated + ' of ' + full);
    // the hit says it was gated, so its pop can show the share (the owner's call on the 18.8 log)
    assert.ok(hits[E.SNARE_GATE_ARMOR].length && hits[E.SNARE_GATE_ARMOR].every(e => e.armor === E.SNARE_GATE_ARMOR), 'gated hits carry the share');
    assert.ok(hits[1].length && hits[1].every(e => !e.armor), 'full hits carry none');
});

// The owner's calls after the 18.7 log: keep players racing, not drawing one circle round the screen.
function still(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, corruptLure: 0, sweepFirst: Infinity, w: 20, h: 12, bubble: 1, loopCatch: 1, ...over });
    s.packets = [];
    return s;
}
const put = (s, x, y) => s.packets.push({ id: s.nextId++, kind: 'good', x, y, vx: 0, vy: 0, v: 0, r: P.PACKET_R, age: 1, school: 0, tag: 0 });
function drawCircle(s, cx, cy, r, secs = 1) {
    const n = Math.round(secs * 60), ev = [];
    for (let i = 0; i <= n + 4; i++) {
        const a = -Math.PI / 2 + i / n * Math.PI * 2;
        s.addPoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        s.step(1 / 60);
        ev.push(...s.takeEvents());
    }
    s.liftPen();
    s.step(1 / 60);
    ev.push(...s.takeEvents());
    return ev.filter(e => e.type === 'catch');
}

test('the wire reaches round a share of the field: a small loop closes, one round most of the field does not', () => {
    const o = E.snareOpts(E.defaultState(1), 4);
    assert.ok(Math.abs(o.wireShare - 0.2) < 1e-9, 'a full bubble\'s share to start');
    const st = E.defaultState(1); st.levels.snareLongWire = 1;
    assert.ok(E.snareOpts(st, 4).wireShare > o.wireShare, 'Bigger Buffers lengthens it');
    // 20 × 12: the wire is 2√(π · 0.2 · 240) ≈ 24.6 units, a circle of radius 3.9
    const small = still({ wireShare: 0.2 });
    put(small, 10, 6); put(small, 10.4, 6.2);
    assert.equal(drawCircle(small, 10, 6, 3).length, 1, 'a loop of radius 3 closes and catches');
    const big = still({ wireShare: 0.2 });
    put(big, 10, 6); put(big, 10.4, 6.2);
    assert.equal(drawCircle(big, 10, 6, 5.5, 1.5).length, 0, 'one of radius 5.5 runs out of wire and never closes');
    assert.ok(big.wireUsed > 0.95, 'and its wire says it ran out');
});

test('catches in quick succession build a combo, and a pause starts it again', () => {
    const s = still({ comboWindow: 2, streakPay: 0.1 });
    const pays = [];
    for (const x of [4, 8, 12]) { put(s, x, 6); put(s, x + 0.3, 6.2); pays.push(drawCircle(s, x, 6, 1.4, 0.6)[0]); }
    assert.deepEqual(pays.map(e => e.cleanRun), [0, 1, 2], 'each quick catch adds to it');
    assert.ok(pays[2].units > pays[0].units * 1.15, 'and pays more');
    for (let i = 0; i < 60 * 2.5; i++) s.step(1 / 60);
    put(s, 16, 6); put(s, 16.3, 6.2);
    assert.equal(drawCircle(s, 16, 6, 1.4, 0.6)[0].cleanRun, 0, 'a pause of more than 2 s starts it again');
});

// The owner's calls after the 18.7 log: Antivirus grow from sector 9, and the defences join the boss fight.
test('Antivirus grow in number and speed from sector 9', () => {
    const s = E.defaultState(1);
    const at = k => E.snareOpts(s, k);
    assert.ok(at(9).antivirus.length > at(7).antivirus.length, 'more of them (one more every two sectors, the owner\'s pick)');
    assert.ok(at(12).antivirus.length > at(9).antivirus.length, 'and more each sector');
    assert.ok(at(9).avSpeed / at(7).avSpeed > (1 + 0.08 * 9) / (1 + 0.08 * 7), 'and faster than the old rise');
});

function fightField(over = {}) {
    const s = P.createSnare({ seed: 7, density: 0, antivirus: [], idleDrain: 0, respawn: 1e9, sweepFirst: Infinity, w: 20, h: 12, boss: 50, bossAt: 0, bossMines: 0, ...over });
    s.packets = [];
    for (let i = 0; i < 3 && !s.boss; i++) s.step(1 / 60);
    Object.assign(s.boss, { x: 10, y: 6, vx: 0, vy: 0, chargeAt: 999, charge: null, mineAt: 999 });
    return s;
}

test('a turret in reach shoots the boss', () => {
    const s = fightField({ turretBoss: 2, turretRange: 4, turretEvery: 0.5 });
    s.turrets.push({ id: s.nextId++, x: 12, y: 6, at: 0 });
    const hp = s.boss.hp;
    for (let i = 0; i < 60; i++) { Object.assign(s.boss, { x: 10, y: 6, vx: 0, vy: 0, chargeAt: 999 }); s.step(1 / 60); }
    assert.ok(s.boss.hp <= hp - 2, `it took ${hp - s.boss.hp}`);
});

test('a decoy draws the boss\'s charge, and smashing it makes the boss reel', () => {
    const s = fightField({ decoyBoss: 1, bossSmash: 0.2, decoyStun: 1.2 });
    s.decoys.push({ id: s.nextId++, x: 16, y: 6 });
    s.drawing = true; s.wire = [{ x: 4, y: 6 }];
    const b = s.boss;
    // its target: the decoy, not the pen
    Object.assign(b, { chargeAt: 0 });
    let reeled = false;
    for (let i = 0; i < 60 * 8 && !reeled; i++) { s.step(1 / 60); reeled = s.takeEvents().some(e => e.type === 'bossLooped' && e.by === 'decoy'); }
    assert.ok(reeled, 'it smashed the decoy and reeled');
    assert.ok(b.stunned > s.time, 'a slash window');
});

test('later bosses send Antivirus in waves, the end boss faster and more of them', () => {
    const k9 = E.snareOpts(E.defaultState(1), 8), k15 = E.snareOpts(E.defaultState(1), 14);
    assert.ok(k9.bossWave > 0 && k15.bossWave < k9.bossWave && k15.minionCap > k9.minionCap);
    const s = fightField({ bossWave: 1, minionCap: 3 });
    for (let i = 0; i < 60 * 5; i++) { Object.assign(s.boss, { chargeAt: 999 }); s.step(1 / 60); }
    assert.equal(s.antivirus.filter(f => f.minion).length, 3, 'up to the cap');
});
