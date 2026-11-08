// tools/snare-bot.js — a Packet Snare player for the tools (tools/snare-boss.js, tools/sim.js): it loops clean clusters,
// clears the boss's mines with a loop round each, stuns the boss with a loop round it while it stands to charge (after a
// human reaction time; with Riposte it parries the charge with a flick across its line instead) and slashes it while it
// reels, a flick at a time. It never uses walls, decoys, powers or the other
// exploits, so it's a floor: a player with the tools does better.
//   const bot = createBot(run, { react: 0.3, slashEvery: 0.22 }); each frame: bot.step(dt); run.step(dt);
'use strict';

function createBot(s, opt = {}) {
    const react = opt.react ?? 0.3;          // seconds from a charge's warning to the parry
    const slashEvery = opt.slashEvery ?? 0.22;
    let plan = [], wait = 0, nextSlash = 0, parried = null;
    const ring = (cx, cy, rad) => {
        const n = Math.max(18, Math.ceil(2 * Math.PI * rad / 0.15));
        plan = [];
        for (let i = 0; i <= n + 2; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; plan.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
        plan.push('lift');
    };
    // A flick: a straight stroke from a to b, fed over three frames.
    const flick = (ax, ay, bx, by) => {
        plan = [];
        for (let i = 0; i <= 6; i++) plan.push([ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6]);
        plan.push('lift');
    };
    const L = () => Math.max(s.opts.flickLength * 1.4, 1.6);
    function step(dt) {
        // Feed the plan: two points a frame on a first run's field, more on a bigger one (a hand crosses the screen at
        // the same speed whatever the field's size), a flick in three frames.
        const per = plan.length && plan[plan.length - 1] === 'lift' && plan.length <= 8 ? 3 : Math.max(2, Math.round(1.2 * Math.sqrt(s.w * s.h / 70)));
        for (let k = 0; k < per && plan.length; k++) {
            const p = plan.shift();
            if (p === 'lift') s.liftPen(); else s.addPoint(p[0], p[1]);
        }
        if (plan.length || s.cooldown > 0) return;
        const b = s.boss;
        // The boss's charge, without Riposte: it stands still to charge, the moment to loop round it (if there's time).
        if (b && !s.opts.parry && b.charge && b.charge.t >= react && b.charge.warn - b.charge.t > 0.6 && parried !== b.charge && !(b.stunned > s.time)) {
            parried = b.charge;
            if (s.drawing) s.liftPen();
            ring(b.x, b.y, b.r + Math.max(0.6, s.closeR));
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
        // While it reels: slash it, unless its mines shield it.
        if (b && b.stunned > s.time && !b.shielded && s.real >= nextSlash) {
            nextSlash = s.real + slashEvery;
            const h = Math.max(L() / 2, b.r * 1.3), a = (s.real * 2.3) % Math.PI;
            flick(b.x - Math.cos(a) * h, b.y - Math.sin(a) * h, b.x + Math.cos(a) * h, b.y + Math.sin(a) * h);
            return;
        }
        if ((wait -= dt) > 0) return;
        // Its mines: the nearest, looped.
        if (s.mines.length) {
            const m = [...s.mines].sort((p, q) => Math.hypot(p.x - (b?.x ?? 0), p.y - (b?.y ?? 0)) - Math.hypot(q.x - (b?.x ?? 0), q.y - (b?.y ?? 0)))[0];
            ring(m.x, m.y, Math.max(0.7, s.closeR * 1.1));
            wait = 0.15;
            return;
        }
        // The biggest clean cluster.
        wait = 0.6;
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
        if (target && (!b || Math.hypot(target.x - b.x, target.y - b.y) > b.r + 2)) ring(target.x + target.vx * 0.3, target.y + target.vy * 0.3, rad);
    }
    return { step };
}

module.exports = { createBot };
