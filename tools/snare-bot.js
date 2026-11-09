// tools/snare-bot.js — a Packet Snare player for the tools (tools/snare-boss.js, tools/sim.js), playing the bubble game
// (Snare 15): it holds a bubble on the biggest clean cluster and lets go when it's grown (or when red is about to swim
// in), grabs the boss's mines with a bubble and flicks them at the boss, stuns the boss with loops round it while it
// stands to charge (after a human reaction time; with Riposte it parries the charge with a flick across its line instead)
// and slashes it while it reels, a flick at a time. It never uses walls, decoys, powers or the other exploits, so it's a
// floor: a player with the tools does better.
//   const bot = createBot(run, { react: 0.3, slashEvery: 0.22 }); each frame: bot.step(dt); run.step(dt);
// `createBot(run, HUMAN)` plays at a person's pace (tools/review: calibrated to the owner's phone log of 2026-11-09): a
// pause between bubbles (`gap`), a longer hold, a slower slash, an aim that's off by up to `aim` units, and a little
// carelessness about red (`careless`: the share of bubbles let go late).
'use strict';

function createBot(s, opt = {}) {
    const react = opt.react ?? 0.3;          // seconds from a charge's warning to the parry
    // never quicker than the game takes slashes (a slash inside `slashGap` of the last is ignored: TOO FAST)
    const slashEvery = Math.max(opt.slashEvery ?? 0.22, (s.opts.slashGap ?? 0) + 0.03);
    const holdFor = opt.hold ?? 1.2;         // seconds a catching bubble is held
    const gap = opt.gap ?? 0.35;             // seconds between bubbles
    const aim = opt.aim ?? 0;                // units a bubble lands off where it's meant to
    const careless = opt.careless ?? 0;      // share of bubbles that ignore red coming in
    const rand = opt.rand || (() => 0.5);
    let plan = [], wait = 0, nextSlash = 0, parried = null, hold = null, ringing = false;
    // `turns` times round (the boss takes more than one loop to stun)
    const ring = (cx, cy, rad, turns = 1) => {
        const n = Math.max(18, Math.ceil(2 * Math.PI * rad / 0.15));
        plan = [{ pen: 'wire', ring: true }];
        ringing = true;
        for (let i = 0; i <= n * turns + 2; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; plan.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
        plan.push('lift');
    };
    // A flick: a straight stroke from a to b, fed over three frames.
    const flick = (ax, ay, bx, by) => {
        plan = [{ pen: 'wire' }];
        for (let i = 0; i <= 6; i++) plan.push([ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6]);
        plan.push('lift');
    };
    // A bubble held at (x, y) for `secs`, let go early if `early` says so.
    const bubble = (x, y, secs, early = null) => {
        if (s.drawing) s.liftPen();
        s.setPen('bubble');
        s.addPoint(x, y);
        hold = { x, y, until: s.real + secs, early };
    };
    const L = () => Math.max(s.opts.flickLength * 1.4, 1.6);
    function step(dt) {
        if (hold) {
            if (s.real >= hold.until || hold.early?.() || !s.drawing) {
                if (s.drawing) s.liftPen();
                s.setPen(null);
                hold = null;
            } else s.addPoint(hold.x, hold.y);
            return;
        }
        // Stunned mid-loop: the rest of the loop is wasted time, lift and slash (the stun's seconds are the fight)
        if (ringing && plan.length && s.boss && s.boss.stunned > s.time) { plan = []; if (s.drawing) s.liftPen(); s.setPen(null); ringing = false; }
        if (!plan.length) ringing = false;
        // Feed the plan: two points a frame on a first run's field, more on a bigger one (a hand crosses the screen at
        // the same speed whatever the field's size), a flick in three frames.
        const per = plan.length && plan[plan.length - 1] === 'lift' && plan.length <= 9 ? 3 : Math.max(2, Math.round(1.2 * Math.sqrt(s.w * s.h / 70)));
        for (let k = 0; k < per && plan.length; k++) {
            const p = plan.shift();
            if (p === 'lift') { s.liftPen(); s.setPen(null); } else if (p.pen) { s.setPen(p.pen); k--; } else s.addPoint(p[0], p[1]);
        }
        if (plan.length || s.cooldown > 0) return;
        const b = s.boss;
        // The boss's charge, without Riposte: it stands still to charge, the moment to loop round it (if there's time).
        if (b && !s.opts.parry && b.charge && b.charge.t >= react && b.charge.warn - b.charge.t > 0.6 && parried !== b.charge && !(b.stunned > s.time)) {
            parried = b.charge;
            if (s.drawing) s.liftPen();
            ring(b.x, b.y, b.r + Math.max(0.6, s.closeR), s.opts.bossLoops || 1);
            return;
        }
        // With Riposte: parry once the reaction time is up, if the warning hasn't run out.
        if (b && s.opts.parry && b.charge && b.charge.t >= react && b.charge.t < b.charge.warn - 0.05 && parried !== b.charge) {
            parried = b.charge;
            const d = 1.4, mx = b.x + b.charge.dx * d, my = b.y + b.charge.dy * d, h = L() / 2;
            if (s.drawing) s.liftPen();
            flick(mx - b.charge.dy * h, my + b.charge.dx * h, mx + b.charge.dy * h, my - b.charge.dx * h);
            return;
        }
        // A grabbed mine: throw it at the boss (a flick from it, its way).
        if (b && s.held.length && s.real >= nextSlash) {
            nextSlash = s.real + slashEvery;
            const m = s.held[0], d = Math.hypot(b.x - m.x, b.y - m.y) || 1, len = Math.min(L(), d);
            flick(m.x, m.y, m.x + (b.x - m.x) / d * len, m.y + (b.y - m.y) / d * len);
            return;
        }
        // While it reels: slash it, unless its mines shield it.
        if (b && b.stunned > s.time && !b.shielded && s.real >= nextSlash) {
            nextSlash = s.real + slashEvery;
            const h = Math.max(L() / 2, b.r * 1.3), a = (s.real * 2.3) % Math.PI;
            flick(b.x - Math.cos(a) * h, b.y - Math.sin(a) * h, b.x + Math.cos(a) * h, b.y + Math.sin(a) * h);
            return;
        }
        if ((wait -= dt) > 0) return;
        // Its mines: the nearest, grabbed with a quick bubble.
        if (s.mines.length) {
            const m = [...s.mines].sort((p, q) => Math.hypot(p.x - (b?.x ?? 0), p.y - (b?.y ?? 0)) - Math.hypot(q.x - (b?.x ?? 0), q.y - (b?.y ?? 0)))[0];
            bubble(m.x, m.y, 0.4);
            wait = 0.1;
            return;
        }
        // The biggest clean cluster, held until it's grown or red comes near.
        wait = gap;
        let best = 0, target = null;
        const rad = Math.max(1.3, s.closeR * 1.2), reach = rad + 0.4;
        for (const p of s.packets) {
            if (p.kind === 'corrupt') continue;
            let n = 0, bad = false;
            for (const q of s.packets) {
                if (Math.abs(q.x - p.x) > reach || Math.abs(q.y - p.y) > reach || Math.hypot(q.x - p.x, q.y - p.y) > reach) continue;
                if (q.kind === 'corrupt') { bad = true; break; }
                n++;
            }
            if (!bad && n > best) { best = n; target = p; }
        }
        if (target && (!b || Math.hypot(target.x - b.x, target.y - b.y) > b.r + 2)) {
            const off = aim * rand(), ang = rand() * Math.PI * 2;
            const x = target.x + target.vx * 0.3 + Math.cos(off ? ang : 0) * off, y = target.y + target.vy * 0.3 + Math.sin(off ? ang : 0) * off;
            const blind = rand() < careless;
            bubble(x, y, holdFor * (0.8 + 0.4 * rand()), () => {
                if (blind) return false;
                const bb = s.bubble;
                if (!bb?.growing) return false;
                return s.packets.some(q => q.kind === 'corrupt' && !(q.spoof > s.time) && Math.hypot(q.x - bb.x, q.y - bb.y) < bb.r + 0.25);
            });
        }
    }
    return { step };
}

// A person's pace (the owner's phone log of 2026-11-09: 5–9 catches in a 12–18 s run, about 7 packets a catch, two spoils
// in 18 runs); `tools/review/pacing.js` checks it against that log.
const HUMAN = { react: 0.4, slashEvery: 0.25, hold: 2.0, gap: 0.3, aim: 0.15, careless: 0.2 };

module.exports = { createBot, HUMAN };
