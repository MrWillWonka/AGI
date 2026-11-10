'use strict';
// Snare 17.5 (the owner's calls on the 17.4 log, "bosses felt absent"): the boss comes once Focus falls to half (after a
// warning), swallows the field, stops the Focus clock and nothing new swims in; its fight has its own clock: beat it and
// what it swallowed bursts back out, run the clock out and it escapes and the run is over.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../packet-snare.js');

const fight = extra => P.createSnare({ seed: 5, w: 14, h: 9, antivirus: [], sweepFirst: Infinity, boss: 20, bossArrive: 0.5, bossIncoming: 2.5, bossFight: 30, bossSwallow: 1, bossFocus: 0, focus: 10, ...extra });
const stepFor = (s, secs) => { for (let i = 0; i < Math.round(secs * 60) && !s.over; i++) s.step(1 / 60); };

test('the boss comes once Focus falls to half, after a warning, and swallows the field', () => {
    const s = fight();
    stepFor(s, 4);
    assert.equal(s.boss, null, 'not while Focus is above half');
    let ev = [];
    for (let i = 0; i < 60 * 3 && !ev.some(e => e.type === 'bossIncoming'); i++) { s.step(1 / 60); ev = ev.concat(s.takeEvents()); }
    const inc = ev.find(e => e.type === 'bossIncoming');
    assert.ok(inc, 'a warning first');
    assert.ok(s.focus <= 0.5 * s.maxFocus + 0.05, 'at half the bar');
    const focusAtWarning = s.focus;
    const packetsBefore = s.packets.length;
    assert.ok(packetsBefore > 0);
    stepFor(s, 2.6);
    ev = s.takeEvents();
    assert.ok(s.boss, 'it arrives after the warning');
    const sw = ev.find(e => e.type === 'bossSwallow');
    assert.ok(sw && sw.packets.length > 0, 'it swallows the field (what hasn\'t drifted off during the warning)');
    assert.equal(s.packets.length, 0, 'the field is empty');
    assert.ok(s.swallowed.length > 0, 'the good ones held inside it');
    assert.ok(Math.abs(s.focus - focusAtWarning) < 1e-9, 'Focus held through the warning');
    stepFor(s, 5);
    assert.ok(Math.abs(s.focus - focusAtWarning) < 1e-9, 'and through the fight');
    assert.equal(s.packets.filter(p => !p.burst).length, 0, 'nothing new swims in while it stands');
    assert.ok(Math.abs(s.fight.left - 25) < 0.1, 'its own clock runs');
});

test('running its fight clock out lets it escape, and the run is over', () => {
    const s = fight();
    stepFor(s, 10);
    assert.ok(s.boss);
    stepFor(s, 31);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'bossEscape'), 'it escapes');
    assert.ok(s.over, 'the run ends');
    assert.equal(s.stats.bossEscaped, 1);
});

test('beating it bursts what it swallowed back out, and the clock runs again', () => {
    const s = fight({ boss: 1 });
    stepFor(s, 10);
    const b = s.boss;
    assert.ok(b);
    const held = s.swallowed.length;
    // a stunned boss takes a slash (the flick through it)
    b.stunned = s.time + 2;
    const fl = [[b.x - 2, b.y], [b.x - 1, b.y], [b.x, b.y], [b.x + 1, b.y], [b.x + 2, b.y]];
    for (const [x, y] of fl) s.addPoint(x, y);
    s.liftPen();
    stepFor(s, 0.1);
    const ev = s.takeEvents();
    assert.ok(ev.some(e => e.type === 'bossDown'), 'beaten');
    const burst = ev.find(e => e.type === 'bossBurst');
    assert.ok(burst && burst.count === held, 'what it swallowed bursts back out');
    assert.ok(s.packets.length >= held, 'onto the field');
    const f = s.focus;
    stepFor(s, 2);
    assert.ok(s.focus < f, 'the Focus clock runs again');
    assert.ok(s.packets.every(p => Math.hypot(p.vx, p.vy) <= p.v * 1.5 + 0.5), 'the burst eases back to a swim');
});

test('without the new options the old arena stands (bossAt, the clock running)', () => {
    const s = P.createSnare({ seed: 5, w: 14, h: 9, antivirus: [], sweepFirst: Infinity, boss: 20, bossAt: 1, bossCatch: 999, focus: 30 });
    stepFor(s, 1.5);
    assert.ok(s.boss && s.packets.length > 0, 'it boots at bossAt and leaves the field be');
    const f = s.focus;
    stepFor(s, 1);
    assert.ok(s.focus < f, 'the clock runs');
});

// Snare 17.8 (round 10, the owner's call): Focus really holds in the fight; a snap there costs the fight clock instead.
// A slow stroke dragged through the boss (a flick isn't snapped: it's how the boss is fought); returns the snap's frame.
function dragThrough(s) {
    const b = s.boss;
    s.addPoint(b.x - 4, b.y - 3);
    stepFor(s, 0.6);
    for (let i = 0; i < 60; i++) {
        const before = { focus: s.focus, left: s.fight?.left };
        const k = Math.min(8, i);
        s.addPoint(i < 9 ? b.x - 4 + k : s.boss.x + 0.1 * (i % 2), i < 9 ? b.y - 3 + k * 0.375 : s.boss.y);
        for (let j = 0; j < (i < 9 ? 4 : 1); j++) {
            const pre = { focus: s.focus, left: s.fight?.left };
            s.step(1 / 60);
            const ev = s.takeEvents();
            if (ev.some(e => e.type === 'snap' && e.by === 'boss')) return { ev, pre, before };
        }
    }
    return null;
}

test('a wire the boss snaps in the fight costs the fight clock, not Focus', () => {
    const s = fight({ fightPenalty: 2, bossCharge: 99 });
    stepFor(s, 10);
    assert.ok(s.boss && s.fight, 'the fight is on');
    s.takeEvents();
    const hit = dragThrough(s);
    assert.ok(hit, 'the boss snapped it');
    const cost = hit.ev.find(e => e.type === 'fightCost');
    assert.ok(cost && cost.secs === 2, 'it says what it cost');
    assert.ok(Math.abs(s.focus - hit.pre.focus) < 1e-9, 'Focus holds');
    const drop = hit.pre.left - s.fight.left;
    assert.ok(Math.abs(drop - (2 + 1 / 60)) < 1e-6, `2 s off the fight clock (${drop.toFixed(3)})`);
});

test('outside the fight (the old arena) a boss snap still costs Focus', () => {
    const s = P.createSnare({ seed: 5, w: 14, h: 9, antivirus: [], sweepFirst: Infinity, boss: 20, bossAt: 0, bossFight: 0, fightPenalty: 2, bossCharge: 99, focus: 10 });
    stepFor(s, 2);
    assert.ok(s.boss && !s.fight, 'an arena boss, no fight clock');
    s.takeEvents();
    const hit = dragThrough(s);
    assert.ok(hit, 'the boss snapped it');
    assert.ok(!hit.ev.some(e => e.type === 'fightCost'));
    const lost = hit.pre.focus - s.focus;
    assert.ok(Math.abs(lost - (3 + 1 / 60)) < 1e-6, `Focus paid the snap and half again (${lost.toFixed(3)})`);
});
