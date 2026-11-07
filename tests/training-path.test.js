// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../training-path.js');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;

// Play one roll: push whenever `rule` says so, until the roll ends.
function play(k, seed, strength, opts, rule) {
    const roll = T.createRoll(k, seed, opts);
    for (let t = 0; t < 180; t += 1 / 60) {
        if (rule(roll)) roll.push(strength);
        const [ev] = roll.step(1 / 60);
        if (ev) return ev;
    }
    throw new Error('roll never ended');
}
const launchOnly = roll => !roll.launched;
const rescue = roll => roll.atRest || (roll.ball.v > 0 && roll.ball.v < 0.5 && roll.ground.slope(roll.ball.x) > 0.05);
const blind = () => true;

function crestRate(k, strength, opts, rule, n = 40) {
    let crests = 0;
    let progress = 0;
    for (let seed = 1; seed <= n; seed++) {
        const ev = play(k, seed, strength, opts, rule);
        if (ev.type === 'crest') crests++;
        progress += ev.progress;
    }
    return { crests: crests / n, progress: progress / n };
}

test('skill hills grow along the trail and stretches do not overlap', () => {
    for (let k = 0; k < 25; k++) {
        const a = T.skillHill(k);
        const b = T.skillHill(k + 1);
        // Hills grow, except the one after a wall, which eases off (still taller than the hill before the wall).
        assert.ok(T.isWallLeg(k) ? b.height > T.skillHill(k - 1).height : b.height > a.height, `hill ${k + 1}`);
        assert.ok(T.skillHeight(k + 1) > T.skillHeight(k) && b.halfWidth > a.halfWidth);
        assert.ok(T.checkpoint(k + 1) > a.end, 'next checkpoint is past this skill hill');
        assert.ok(a.start > T.checkpoint(k));
    }
});

test('rolling hills are random per roll, deterministic per seed, and smaller than the skill hill', () => {
    const a = T.rollingHills(3, 11);
    assert.deepEqual(a, T.rollingHills(3, 11));
    assert.notDeepEqual(a, T.rollingHills(3, 12));
    const goal = T.skillHill(3);
    for (const hill of a) {
        assert.ok(hill.height < goal.height * 0.7);
        assert.ok(hill.end < goal.start && hill.start > T.checkpoint(3));
    }
    const sizes = a.map(h => h.height);
    assert.ok(Math.max(...sizes) > 2 * Math.min(...sizes), 'hills vary in size');
});

test('terrain slope matches its height curve', () => {
    const g = T.terrain(2, 5);
    for (const x of [g.start, ...g.bumps.flatMap(b => [b.start + 0.05, b.peak - 0.03, b.end - 0.1])]) {
        const numeric = (g.height(x + 1e-6) - g.height(x - 1e-6)) / 2e-6;
        assert.ok(Math.abs(numeric - g.slope(x)) < 1e-3, `x=${x}`);
    }
});

test('a stretch is long: a single launch covers only part of it, and more pushes go further', () => {
    const weak = crestRate(1, 1.8, { pushes: 1, cooldown: 2 }, launchOnly);
    assert.equal(weak.crests, 0, 'one launch never reaches the first skill hill');
    assert.ok(weak.progress > 0.03 && weak.progress < 0.5, `launch-only progress ${weak.progress}`);
    const strong = crestRate(1, 2.5, { pushes: 6, cooldown: 0.8 }, rescue);
    assert.ok(strong.progress > weak.progress * 2, `upgraded runs go further (${strong.progress} vs ${weak.progress})`);
});

test('saving pushes for stalls beats firing them all at once', () => {
    const opts = { pushes: 4, cooldown: 0.6 };
    for (const k of [1, 3]) {
        const smart = crestRate(k, 2.5, opts, rescue);
        const dumb = crestRate(k, 2.5, opts, blind);
        // Score: how often the skill hill is cleared, plus average distance.
        const score = r => r.crests + r.progress;
        // Relative, so it holds however long the stretch is: saving pushes must go clearly further.
        assert.ok(score(smart) > score(dumb) * 1.3, `stretch ${k}: ${JSON.stringify(smart)} vs ${JSON.stringify(dumb)}`);
    }
});

test('upgrades that cut friction let the same push roll further', () => {
    // On a Rolling leg (on a short Sprint leg a slick ball that misses the skill hill rolls back over the start).
    const normal = crestRate(3, 2, { pushes: 1, cooldown: 2 }, launchOnly);
    const slick = crestRate(3, 2, { pushes: 1, cooldown: 2, friction: 0.6, slopeDrag: 0.5 }, launchOnly);
    assert.ok(slick.progress > normal.progress, `${slick.progress} vs ${normal.progress}`);
});

test('pushing against a backward roll is wasted energy', () => {
    const roll = T.createRoll(1, 1, { pushes: 3, cooldown: 0 });
    roll.ball.v = -2;
    roll.push(1.5);
    assert.ok(roll.ball.v < 0 && roll.ball.v > -2, 'it only slows the ball');
});

test('pushes are limited per roll and have a cooldown', () => {
    const roll = T.createRoll(1, 1, { pushes: 2, cooldown: 1 });
    assert.equal(roll.push(1), true);
    assert.equal(roll.push(1), false, 'cooling down');
    for (let t = 0; t < 1.05; t += 0.05) roll.step(0.05);
    assert.equal(roll.push(1), true);
    for (let t = 0; t < 1.05; t += 0.05) roll.step(0.05);
    assert.equal(roll.push(1), false, 'out of pushes');
    assert.equal(roll.pushesLeft, 0);
});

test('a roll is deterministic', () => {
    const run = () => {
        const roll = T.createRoll(3, 9, { pushes: 3, cooldown: 0.5 });
        const trace = [];
        for (let t = 0; t < 30 && !roll.over; t += 0.05) {
            if (rescue(roll)) roll.push(2.4);
            trace.push(...roll.step(0.05), +roll.ball.x.toFixed(6));
        }
        return trace;
    };
    assert.deepEqual(run(), run());
});

test('engine: pushes cost CP and DP by charge; XP rewards distance, records and crests', () => {
    const s = E.defaultState(NOW);
    s.res.cp = 100;
    s.res.dp = 40;
    assert.equal(E.payPush(s, 1), false, 'locked until the milestone');
    s.stats.collects = 40;
    s.stats.runCp = 100;
    s.stats.runDp = 40;
    E.evaluate(s);
    const full = E.pushCost(s, 1);
    const half = E.pushCost(s, 0.5);
    assert.ok(half.cp < full.cp / 2, 'cost grows with the square of the charge');
    assert.equal(E.payPush(s, 1), true);
    assert.equal(s.res.cp, 100 - full.cp);

    // The affordable charge is capped by your resources.
    s.res.cp = full.cp / 4;
    const cap = E.affordableCharge(s);
    assert.ok(cap > 0.4 && cap < 0.6, `cap ${cap}`);
    assert.equal(E.payPush(s, 1), false, 'cannot pay for a full push');
    assert.equal(E.payPush(s, cap), true);
    s.res.cp = 0;
    assert.equal(E.affordableCharge(s), 0);

    assert.ok(E.rollXp(s, 0.8, false, 0, 8) > 2 * E.rollXp(s, 0.4, false, 0, 4), 'further is worth disproportionately more');
    assert.equal(E.rollXp(s, 1, true, 0, 10), E.rollXp(s, 1, false, 0, 10) * E.PATH.crestBonus);

    const seed = E.rollSeed(s);
    const r1 = E.finishRoll(s, 0.5, false);
    assert.equal(r1.record, true);
    assert.equal(s.path.best, 0.5);
    assert.notEqual(E.rollSeed(s), seed, 'every roll gets new terrain');
    assert.equal(E.finishRoll(s, 0.3, false).record, false);
    const r3 = E.finishRoll(s, 1, true);
    assert.equal(r3.skill.name, E.SKILLS[0].name);
    assert.equal(s.path.learned, 1);
    assert.equal(s.path.best, 0, 'record resets for the new stretch');
    assert.equal(E.pushCost(s, 1).cp, E.PATH.pushCost.cp, 'Pattern Matching\'s leg costs what the warm-up did');
    E.learnSkill(s, 1);
    assert.ok(E.pushCost(s, 1).cp > E.PATH.pushCost.cp, 'pushes cost more further along');
});

test('engine: training upgrades are bought with XP and change the roll setup', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    const base = E.derive(s);
    assert.equal(base.pushesPerRoll, 1, 'the warm-up runs on one sprint');
    assert.equal(base.pushCooldown, E.PATH.baseCooldown);
    assert.equal(E.buy(s, 'initialWeights').ok, false, 'needs XP');
    s.res.xp = 1000;
    for (const id of ['initialWeights', 'trainingEpochs', 'fasterIteration', 'trainingOptimizer']) {
        assert.equal(E.buy(s, id).ok, true, id);
        E.evaluate(s);   // buying a node opens the ones that grow from it
        if (id === 'trainingEpochs') {
            assert.equal(E.derive(s).pushesPerRoll, 2, 'Investor Funding, one node out, is the second sprint');
            assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.fasterIteration), true, 'shows after Investor Funding\'s first level');
            assert.equal(E.buy(s, id).ok, true);
            E.evaluate(s);
        }
    }
    const d = E.derive(s);
    assert.equal(d.pushesPerRoll, 3, "one to start and two levels of Investor Funding");
    assert.ok(d.pushCooldown < base.pushCooldown);
    assert.ok(d.pushPower > base.pushPower);
    s.levels.fasterIteration = 12;
    assert.equal(E.derive(s).pushCooldown, E.PATH.minCooldown);
});

test('engine: skills grant attributes and permanent bonuses, in order only', () => {
    const s = E.defaultState(NOW);
    const before = E.derive(s);
    assert.equal(E.learnSkill(s, 1), null, 'cannot skip ahead');
    assert.equal(E.learnSkill(s, 0).name, 'Tokenization', 'the warm-up hill');
    assert.deepEqual(s.attr, before && E.defaultState(NOW).attr, 'it grants no attributes');
    assert.equal(E.learnSkill(s, 1).name, 'Pattern Matching');
    assert.equal(E.derive(s).clickPower, before.clickPower + 1);
    for (let i = 2; i < E.SKILLS.length; i++) E.learnSkill(s, i);
    assert.ok(E.derive(s).pushPower > before.pushPower, 'Analogy and Self-Modeling boost pushes');
    // Frontier skills have names now (a flat "Frontier Skill 1" landed on the Skill learned card at the 70-minute mark);
    // past the list they are numbered again.
    assert.equal(E.learnSkill(s, E.SKILLS.length).name, 'Abstraction');
    assert.equal(E.skillAt(E.SKILLS.length + 12).name, 'Frontier Skill 1');
});

test('engine: push strength does not grow with Intelligence (no runaway loop)', () => {
    const s = E.defaultState(NOW);
    const base = E.derive(s).pushPower;
    s.attr.intelligence = 1e6;
    assert.equal(E.derive(s).pushPower, base);
});

test('engine: Self-Improve is gone; Intelligence comes from training and the algorithms', () => {
    assert.equal(E.ACTIONS.some(a => a.id === 'improve'), false);
    assert.equal(E.MILESTONES.some(m => m.key === 'action:improve'), false);
});

test('engine: path progress and XP save; prestige resets the run but keeps lifetime stats', () => {
    const s = E.defaultState(NOW);
    E.finishRoll(s, 0.6, false);
    E.finishRoll(s, 1, true);
    const loaded = E.deserialize(E.serialize(s), NOW);
    assert.equal(loaded.path.learned, 1);
    assert.equal(loaded.res.xp, s.res.xp);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, path: { learned: -2, best: 7 } }, NOW).path.best, 1);
    s.attr.intelligence = 10;
    s.path.learned = 9;
    const next = E.prestige(s, NOW + 1).state;
    assert.deepEqual([next.path.learned, next.res.xp, next.stats.rolls, next.stats.skillsLearned], [0, 0, 2, 1]);
});

test('engine: the Auto-Trainer needs Faster Chips and a new version, costs Insight, and can be switched off', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false);
    s.levels.fasterIteration = 2;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), false, 'still needs a new version');
    s.prestige.count = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoTrainer), true);
    assert.equal(E.buy(s, 'autoTrainer').ok, false, 'costs Insight');
    s.prestige.points = 2;
    assert.equal(E.buy(s, 'autoTrainer').ok, true);
    assert.equal(E.autoTrainerLevel(s), 1);
    E.setTaskOn(s, 'autoTrainer', false);
    assert.equal(E.autoTrainerLevel(s), 0);
});

test('engine: the Auto-Trainer\'s first level is earned in the first version by running the trail by hand', () => {
    const s = E.defaultState(NOW);
    s.unlocked['module:path'] = true;
    s.stats.rolls = E.AUTO_TRAINER_RUNS;
    s.path.learned = E.AUTO_TRAINER_SKILL - 1;
    E.evaluate(s);
    assert.equal(E.level(s, 'autoTrainer'), 0, 'needs the skill too');
    s.path.learned = E.AUTO_TRAINER_SKILL;
    s.stats.rolls = E.AUTO_TRAINER_RUNS - 1;
    E.evaluate(s);
    assert.equal(E.level(s, 'autoTrainer'), 0, 'needs the runs too');
    s.stats.rolls = E.AUTO_TRAINER_RUNS;
    const out = E.evaluate(s);
    assert.ok(out.milestones.some(m => m.key === 'auto:trainer'), 'announced once');
    assert.equal(E.level(s, 'autoTrainer'), 1, 'level 1, no Insight spent');
    assert.equal(E.autoTrainerLevel(s), 0, 'it starts switched off: the player is asked to turn it on');
    E.setTaskOn(s, 'autoTrainer', true);
    assert.equal(E.autoTrainerLevel(s), 1);
    assert.equal(s.prestige.count, 0);
    // It's kept for good: a new version starts with it.
    s.attr.intelligence = 30;
    s.path.learned = 7;
    const next = E.prestige(s, NOW + 1).state;
    assert.equal(E.level(next, 'autoTrainer'), 1);
    // The Handmade challenge still switches it off.
    next.challenge = { id: 'handmade', start: 0 };
    assert.equal(E.autoTrainerLevel(next), 0);
});

test('engine: bonus zones land anywhere on the meter, vary per push, are repeatable, and Prompt Tuning lifts them', () => {
    const zones = [];
    const avg = bias => { let t = 0; for (let seed = 1; seed <= 300; seed++) t += E.bonusZone(seed * 31, 0, 0.12, 0, 0, bias).from; return t / 300; };
    assert.ok(avg(2) > avg(0) + 0.08, 'biased zones sit higher on average');
    for (let seed = 1; seed <= 50; seed++) {
        for (let i = 0; i < 6; i++) {
            const z = E.bonusZone(seed * 7919, i, 0.12);
            assert.ok(z.from >= 0.18 && z.to <= 0.97, `zone ${z.from}-${z.to}`);
            assert.ok(Math.abs(z.to - z.from - 0.12) < 1e-9);
            zones.push(z.from);
        }
    }
    assert.deepEqual(E.bonusZone(42, 3, 0.12), E.bonusZone(42, 3, 0.12));
    assert.ok(new Set(zones.map(z => z.toFixed(2))).size > 20, 'zones move around');
});

test('engine: clean pushes bank flat XP and boost the roll; perfect counts triple; all upgradable', () => {
    const s = E.defaultState(NOW);
    const plain = E.rollXp(s, 0.5, false, 0, 5);
    const clean = E.pushBonusXp(s, 'clean');
    assert.ok(clean > 0 && clean < plain, 'a small flat amount');
    assert.equal(E.pushBonusXp(s, null), 0);
    assert.ok(Math.abs(E.pushBonusXp(s, 'perfect') - 3 * clean) < 1e-9);
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 2, 5) - plain * (1 + 2 * E.PATH.cleanRollBonus)) < 1e-9, 'roll multiplier');

    const zone = E.bonusZone(9, 0, 0.12, 0.03);
    const mid = (zone.from + zone.to) / 2;
    assert.equal(E.zoneHit(zone, mid), 'perfect');
    assert.equal(E.zoneHit(zone, zone.from + 0.001), 'clean');
    assert.equal(E.zoneHit(zone, zone.to + 0.01), null);
    assert.equal(E.zoneHit(E.bonusZone(9, 0, 0.12, 0), mid), 'clean', 'no perfect spot without the upgrade');

    s.levels.benchmarkPrizes = 2;
    s.levels.curatedData = 2;
    s.levels.precisionTuning = 2;
    assert.ok(Math.abs(E.pushBonusXp(s, 'clean') - clean * 1.6) < 1e-9);
    assert.ok(Math.abs(E.derive(s).cleanRollBonus - E.PATH.cleanRollBonus * 1.6) < 1e-9);
    assert.equal(E.derive(s).perfectWidth, 0);
    s.levels.perfectCalibration = 1;
    assert.ok(E.derive(s).perfectWidth > 0);

    const before = s.res.xp;
    E.grantPushBonus(s, 'clean');
    assert.ok(s.res.xp > before, 'banked immediately');
});

test('XP follows the ball: rolling back lowers it, and the payout is where it stops', () => {
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 2 });
    roll.push(1.8);
    let peak = 0;
    let end;
    for (let t = 0; t < 30 && !end; t += 1 / 60) {
        [end] = roll.step(1 / 60);
        peak = Math.max(peak, roll.ground.progress(roll.ball.maxX));
    }
    assert.ok(end.progress <= peak + 1e-9);
    assert.ok(Math.abs(end.progress - roll.ground.progress(roll.ball.x)) < 1e-9, 'payout uses the resting point');
});


test('a roll can be ended early and reports how far it got', () => {
    const roll = T.createRoll(1, 3, { pushes: 3, cooldown: 0.5 });
    roll.push(1.2);
    for (let t = 0; t < 10 && !roll.atRest; t += 0.05) roll.step(0.05);
    const ev = roll.end();
    assert.equal(ev.type, 'end');
    assert.ok(ev.progress > 0 && ev.progress < 1);
    assert.equal(roll.over, true);
    assert.equal(roll.end(), null, 'only once');
});

test('rollOut: cresting celebrates first, then the ball rolls down the far side and the roll ends crested', () => {
    const roll = T.createRoll(1, 1, { pushes: 1, cooldown: 1, rollOut: true });
    roll.push(20);
    const events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events.push(...roll.step(0.05));
    const crest = events.findIndex(e => e.type === 'crest');
    const end = events.findIndex(e => e.type === 'end');
    assert.ok(crest >= 0 && end > crest, 'crest comes before the end');
    assert.equal(events[end].crested, true);
    assert.equal(events[end].progress, 1);
    assert.ok(roll.ball.x > T.skillHill(1).end, 'it rolled down the far side');
    assert.equal(roll.push(5), false, 'no pushes after the crest');
});

test('without rollOut, cresting still ends the roll at once', () => {
    const roll = T.createRoll(1, 1, { pushes: 1, cooldown: 1 });
    roll.push(20);
    let events = [];
    for (let i = 0; i < 2000 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(events.at(-1).type, 'crest');
    assert.ok(roll.ball.x < T.skillHill(1).end);
});

test('hillScale lowers the rolling hills but never the skill hill', () => {
    const a = T.terrain(1, 42);
    const b = T.terrain(1, 42, 0.8);
    const roll = t => t.bumps.filter(x => x.skill === null);
    roll(a).forEach((h, i) => assert.ok(Math.abs(roll(b)[i].height - h.height * 0.8) < 1e-12));
    assert.equal(b.goal.height, a.goal.height);
});

test('with sprints left, the start line bounces the ball back instead of ending the run', () => {
    const roll = T.createRoll(1, 5, { pushes: 3, cooldown: 0 });
    roll.push(0.01);
    roll.ball.v = -1.5;
    let events = [];
    for (let i = 0; i < 40 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(roll.over, false, 'the run goes on');
    assert.ok(events.some(e => e.type === 'bump'));
    assert.ok(roll.ball.x >= roll.ground.start - 0.2);
});

test('the start is flat, and rolling back to the start line with no sprints left ends the run', () => {
    for (const k of [1, 3]) {
        const g = T.terrain(k, 3);
        assert.equal(g.height(g.start - 1), 0, 'nothing behind the start');
        assert.equal(g.height(g.start), 0);
    }
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 0 });
    roll.push(0.01);
    roll.ball.v = -1.5;
    roll.ball.maxX = roll.ball.x + 3;   // it had got 3 m out before rolling back
    let events = [];
    for (let i = 0; i < 200 && !roll.over; i++) events = events.concat(roll.step(0.05));
    assert.equal(roll.over, true, 'the run ended');
    assert.equal(events.at(-1).rolledBack, true);
    assert.ok(Math.abs(events.at(-1).metres - 1.5) < 1e-9, 'half the furthest distance still pays');
    assert.equal(events.at(-1).progress, 0);
});

test('legs: a roll from a cleared leg runs on through every later skill hill to the last', () => {
    // A single-leg roll is unchanged by the leg support.
    const one = T.terrain(3, 77);
    const same = T.terrain(3, 77, 1, 3);
    assert.deepEqual(one.bumps, same.bumps);
    // From leg 1 to leg 3: three skill hills, the first two cleared on the way.
    const g = T.terrain(1, 77, 1, 3);
    assert.deepEqual(g.bumps.filter(b => b.skill !== null).map(b => b.skill), [1, 2, 3]);
    assert.equal(g.goal.skill, 3);
    assert.equal(g.legAt(g.start + 1), 1);
    assert.equal(g.legAt(T.skillHill(1).peak + 0.5), 2);
    assert.equal(g.legAt(T.skillHill(3).end + 5), 3);
    assert.equal(g.progressIn(2, T.skillHill(2).peak), 1);
    assert.equal(g.progress(T.checkpoint(2) + 0.2), 0, 'progress restarts on each leg');

    // A strong ball pushed whenever it can: clears legs 1 and 2 in order, then crests leg 3.
    const roll = T.createRoll(1, 77, { pushes: 40, cooldown: 0.3, last: 3, rollOut: true });
    const events = [];
    for (let t = 0; t < 400 && !roll.over; t += 1 / 60) {
        if (roll.ball.cooldown === 0 && roll.pushesLeft > 0 && (!roll.launched || roll.ball.v < 3)) roll.push(9);
        events.push(...roll.step(1 / 60));
    }
    assert.deepEqual(events.map(e => e.type + (e.skill ?? '')), ['clear1', 'clear2', 'crest3', 'end3']);
    assert.equal(events.at(-1).leg, 3);

    // A weak one stops part-way along leg 1 and reports that leg.
    const weak = T.createRoll(1, 77, { pushes: 1, cooldown: 1, last: 3 });
    weak.push(2);
    let end = null;
    for (let t = 0; t < 120 && !end; t += 1 / 60) end = weak.step(1 / 60).find(e => e.type === 'end') || null;
    assert.equal(end.leg, 1);
    assert.ok(end.progress > 0 && end.progress < 1);
});

test('free pushes (a crunch) work with no pushes left and barely wait; holdOpen keeps a resting roll going', () => {
    let open = true;
    const roll = T.createRoll(1, 5, { pushes: 1, cooldown: 2, holdOpen: () => open });
    assert.equal(roll.push(1), true);
    assert.equal(roll.pushesLeft, 0);
    for (let i = 0; i < 400; i++) roll.step(1 / 60);
    assert.equal(roll.over, false, 'held open while resting');
    assert.equal(roll.push(1), false, 'no normal push left');
    assert.equal(roll.push(1, true), true, 'a free one works');
    assert.ok(roll.ball.cooldown <= 0.35);
    assert.equal(roll.pushesLeft, 0);
    open = false;
    for (let i = 0; i < 2000 && !roll.over; i++) roll.step(1 / 60);
    assert.equal(roll.over, true, 'ends once no longer held');
});

test('power-ups: a flow coasts over hills, a smash flattens the hills ahead, a boost ignores the cooldown', () => {
    const opts = { pushes: 1, cooldown: 2, rollOut: true };
    const plain = T.createRoll(1, 11, opts);
    plain.push(2);
    for (let i = 0; i < 2400 && !plain.over; i++) plain.step(1 / 60);
    const flowing = T.createRoll(1, 11, opts);
    flowing.push(2);
    flowing.coast(3, 3);
    assert.ok(flowing.flowing > 0);
    const run = (roll, sec) => { for (let i = 0; i < sec * 60; i++) roll.step(1 / 60); };
    const x0 = flowing.ball.x;
    run(flowing, 1);
    assert.ok(flowing.ball.x - x0 >= 2.9, 'holds its speed over the hills');
    for (let i = 0; i < 2400 && !flowing.over; i++) flowing.step(1 / 60);
    assert.ok(flowing.ball.maxX > plain.ball.maxX, 'and gets further');

    const smashed = T.createRoll(1, 11, opts);
    const ahead = smashed.smash(5);
    assert.ok(ahead.length > 0 && ahead.every(b => b.skill === null), 'only rolling hills break');
    run(smashed, 2);
    assert.ok(ahead.every(b => b.height < 1e-3), 'they settle flat');
    assert.ok(smashed.ground.goal.height > 0, 'the skill hill stands');

    const shrunk = T.createRoll(1, 11, opts);
    shrunk.push(1);
    shrunk.coast(2, 3, 0.25);
    run(shrunk, 2);
    const low = shrunk.ground.bumps.filter(b => b.base != null);
    assert.ok(low.length > 0 && low.every(b => b.target <= b.base * 0.25 + 1e-9), 'a super flow shrinks the hills it passes');
    assert.ok(low.filter(b => b.peak < shrunk.ball.x - 3).every(b => b.height <= b.base * 0.26), 'and they settle low');

    const banked = T.createRoll(1, 11, opts);
    banked.push(1);
    assert.equal(banked.push(1, true), false, 'cooling down');
    const v = banked.ball.v;
    assert.equal(banked.boost(2), true);
    assert.ok(banked.ball.v > v);
    assert.equal(banked.pushesLeft, 0);
});

test('onward: cresting the last skill hill emits crest once and the ball rolls on into an extended leg', () => {
    const roll = T.createRoll(1, 3, { pushes: 1, cooldown: 1, onward: true });
    const g = roll.ground;
    roll.push(0.001);
    Object.assign(roll.ball, { x: g.goal.peak - 0.01, v: 3, maxX: g.goal.peak - 0.01 });
    const crests = [];
    for (let i = 0; i < 40 && !roll.over; i++) {
        for (const e of roll.step(0.05)) {
            if (e.type === 'crest') { crests.push(e); roll.extend(); }
            assert.notEqual(e.type, 'clear', 'the crested hill is not cleared again after extending');
        }
    }
    assert.equal(crests.length, 1);
    assert.equal(crests[0].onward, true);
    assert.equal(g.last, 2, 'the next leg was laid');
    assert.equal(g.goal.skill, 2);
    assert.ok(roll.ball.x > T.skillHill(1).peak && !roll.crested, 'still rolling past the old hill');
});

test('act one is many small hills; act two (from General AI) a few giant swells, many times wider', () => {
    const before = T.rollingHills(T.LATE_LEG - 1, 9);
    assert.ok(before.length > 15);
    const widest = Math.max(...before.map(h => 2 * h.halfWidth));
    for (const k of [T.LATE_LEG, T.LATE_LEG + 4]) {
        const late = T.rollingHills(k, 9);
        assert.ok(late.length >= 4 && late.length <= 8, `${late.length}`);
        for (const h of late) assert.ok(2 * h.halfWidth > 3.5 * widest && h.height < 0.7 * T.skillHeight(k));
    }
    // The engine's copy of the boundary, and General AI arriving exactly with it on skills alone.
    assert.equal(E.ACT_TWO_LEG, T.LATE_LEG);
    const s = E.defaultState(NOW);
    s.attr.intelligence = 1 + 2 + 2 + 3;   // every algorithm's Intelligence
    for (let i = 0; i < T.LATE_LEG - 1; i++) E.learnSkill(s, i);
    assert.equal(E.phaseIndex(s), 0, 'not a skill sooner, whatever research bought');
    s.attr.intelligence -= 8;
    E.learnSkill(s, T.LATE_LEG - 1);
    assert.equal(E.phaseIndex(s), 1, 'General AI with the skill that opens act two');
});

test('late legs: a fast ball flies off a crest, lands, bounces and rolls on; early legs never launch', () => {
    const fly = k => {
        const roll = T.createRoll(k, 4, { pushes: 1, cooldown: 1 });
        const hill = roll.ground.bumps.find(b => b.skill === null && b.peak > roll.ground.start + 1);
        roll.push(0.001);
        Object.assign(roll.ball, { x: hill.peak - 0.05 * hill.halfWidth, v: 40, maxX: hill.peak });
        const seen = [];
        for (let i = 0; i < 400 && !roll.over; i++) for (const e of roll.step(0.02)) seen.push(e.type);
        return seen;
    };
    const late = fly(T.LATE_LEG);
    assert.ok(late.includes('launch'), 'takes off');
    assert.ok(late.includes('land'), 'lands');
    const early = fly(3);
    assert.ok(!early.includes('launch'));
});

test('a super flow condenses time: the ball covers warp times the ground', () => {
    const run = warp => {
        const roll = T.createRoll(6, 21, { pushes: 2, cooldown: 0.1 });
        roll.push(2);
        const x0 = roll.ball.x;
        roll.coast(2, 1, 0, 1, warp);
        for (let i = 0; i < 40; i++) roll.step(0.05);
        return roll.ball.x - x0;
    };
    const plain = run(1);
    const dream = run(4);
    assert.ok(dream > 3 * plain, `${dream} vs ${plain}`);
});

test('a flight is capped in height, comes back within seconds and settles onto the line without bouncing', () => {
    // A huge upward boost at a fast speed, in scale with the leg.
    for (const k of [T.LATE_LEG, T.LATE_LEG + 4]) {
        const roll = T.createRoll(k, 5, { pushes: 3, cooldown: 0.1 });
        roll.push(0.001);
        const x = roll.ground.start + 0.2 * (T.skillHill(k).start - roll.ground.start);
        const y0 = roll.ground.height(x);
        Object.assign(roll.ball, { x, v: 3.5 * Math.sqrt(9.8 * T.skillHeight(k)), maxX: x, air: { y: y0, vy: 200, peak: y0, from: x, ceil: y0 + T.maxAbove(k) } });
        let t = 0;
        let top = y0;
        const lands = [];
        while (roll.airborne && t < 20) {
            for (const e of roll.step(0.05)) if (e.type === 'land') lands.push(e);
            top = Math.max(top, roll.height);
            t += 0.05;
        }
        assert.ok(top <= y0 + T.maxAbove(k) + 0.01, `top ${top}`);
        assert.ok(t < 4, `aloft ${t.toFixed(1)} s`);
        assert.equal(lands.filter(e => e.bounce).length, 0, `leg ${k}: eases onto the slope, no bounce`);
    }
});

test('flights come down on the nearest down-slope, never on a face', () => {
    let flights = 0;
    let down = 0;
    // Speeds in scale with the leg (its skill hill's height): a fast, a faster and a very fast ball.
    for (let seed = 1; seed <= 40; seed++) for (const f of [1.5, 2.5, 3.5]) {
        const k = T.LATE_LEG + (seed % 3) * 2;
        const roll = T.createRoll(k, seed * 17, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = f * Math.sqrt(9.8 * T.skillHeight(k));
        for (let t = 0; t < 20 && !roll.over && !roll.atRest; t += 0.05) {
            for (const e of roll.step(0.05)) {
                if (e.type !== 'land' || e.flight <= 3) continue;
                flights++;
                const s = roll.ground.slope(e.x);
                assert.ok(s < 0.03, `landed on a face (slope ${s.toFixed(2)})`);
                assert.ok(!e.bounce, 'no bounce');
                if (s < -0.04) down++;
            }
        }
    }
    // The rest come down on a valley floor (a kicker's steep launch can't always bend onto a down-slope).
    assert.ok(flights > 10 && down >= 0.8 * flights, `${down}/${flights} on down-slopes`);
});

test('the warm-up hill: a good sprint or two medium ones crest it on a first run; weak taps fall short', () => {
    const run = charges => {
        const roll = T.createRoll(0, 1, { pushes: charges.length, cooldown: 2, onward: true });
        roll.push(1.4 * charges[0]);
        let i = 1;
        for (let t = 0; t < 30 && !roll.over; t += 0.05) {
            if (i < charges.length && roll.ball.cooldown === 0 && roll.ball.v < 0.4) roll.push(1.4 * charges[i++]);
            if (roll.step(0.05).some(e => e.type === 'crest')) return true;
        }
        return false;
    };
    assert.equal(run([0.6, 0.7]), true);
    assert.equal(run([1, 1]), true);
    assert.equal(run([1]), true, 'one full sprint');
    assert.equal(run([0.4, 0.4]), false, 'it still takes a real effort');
    assert.deepEqual(T.rollingHills(0, 5), [], 'nothing in the way');
});

test('act two: most swells are kickers whose face steepens to a lip, so crests launch with real upward speed', () => {
    let kickers = 0;
    let swells = 0;
    for (let seed = 1; seed <= 30; seed++) {
        for (const b of T.rollingHills(T.LATE_LEG + (seed % 4), seed)) {
            swells++;
            if (!b.up || b.up === 1) continue;
            kickers++;
            const lip = T.bumpSlope(b, b.peak - 1e-6);
            assert.ok(lip >= T.KICK_SLOPE[0] * 0.999 || b.up * b.halfWidth <= 0.4 * b.halfWidth + 1e-9 || lip > 0.3, `lip slope ${lip}`);
            assert.ok(Math.abs(T.bumpAt(b, b.peak) - b.height) < 1e-9 && T.bumpAt(b, b.start) < 1e-9, 'the face runs from the floor to the lip');
            assert.ok(b.end - b.start <= (T.checkpoint(T.LATE_LEG + 1) - T.checkpoint(T.LATE_LEG)), 'fits its pitch');
        }
    }
    assert.ok(kickers / swells > 0.7, `${kickers}/${swells} kickers`);
    // A fast ball leaves a lip climbing.
    let climbs = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = 2.5 * Math.sqrt(9.8 * T.skillHeight(T.LATE_LEG));
        for (let t = 0; t < 10 && !roll.over; t += 0.05) {
            if (roll.step(0.05).some(e => e.type === 'launch') && roll.ball.air?.vy > 0.3 * roll.ball.v) climbs++;
        }
    }
    assert.ok(climbs >= 10, `${climbs} launches climbing off a lip`);
});

test('terrain features: their own random stream (the hills are unchanged), bought strips push and brake, flights take tokens', () => {
    const a = T.terrain(T.LATE_LEG, 11);
    assert.deepEqual(a.bumps.filter(b => b.skill === null).map(b => b.peak), T.rollingHills(T.LATE_LEG, 11).map(b => b.peak));
    // No strips until they're bought (a playtest read free ones as an unexplained upgrade); buying them never moves
    // a hill or a token.
    const owned = { front: 1, back: 1 };
    let tokens = 0;
    let strips = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const k = 2 + (seed % 5);
        assert.equal(T.terrain(k, seed).strips.length, 0, 'none until bought');
        const g = T.terrain(k, seed, 1, k, owned);
        strips += g.strips.length;
        const late = T.terrain(T.LATE_LEG + (seed % 3), seed);
        const lateBought = T.terrain(T.LATE_LEG + (seed % 3), seed, 1, T.LATE_LEG + (seed % 3), owned);
        assert.deepEqual(lateBought.tokens.map(t => t.x), late.tokens.map(t => t.x), 'tokens stay put');
        tokens += late.tokens.length;
        for (const tk of late.tokens) assert.ok(tk.y > 0);
        for (const st of g.strips) {
            const hill = g.bumps.find(h => st.from >= h.start && st.to <= h.end);
            assert.ok(hill, 'a strip sits on one hill');
            assert.ok(st.kind === 'front' ? st.to <= hill.peak : st.from >= hill.peak, `${st.kind} strips sit on the ${st.kind === 'front' ? 'face' : 'back'}`);
        }
    }
    assert.ok(tokens > 20 && strips > 10, `${tokens} tokens, ${strips} strips`);
    assert.equal(T.terrain(0, 3, 1, 0, owned).strips.length, 0, 'the warm-up stays bare');
    // More strips with the `more` level, and stronger ones by level.
    const count = more => [...Array(30)].reduce((n, _, i) => n + T.terrain(3, i + 1, 1, 3, { front: 1, back: 1, more }).strips.length, 0);
    assert.ok(count(2) > count(0) * 1.4);
    assert.ok(T.STRIP_PUSH[3] > T.STRIP_PUSH[1] && T.STRIP_BRAKE[3] > T.STRIP_BRAKE[1]);
    // A front strip speeds a ball rolling forward over it; a back strip slows a ball rolling backward, never pushes.
    const over = (kind, keep, v) => {
        for (let seed = 1; seed <= 60; seed++) {
            const roll = T.createRoll(3, seed, { pushes: 1, cooldown: 1, strips: owned });
            const st = roll.ground.strips.find(x => x.kind === kind);
            if (!st) continue;
            if (!keep) roll.ground.strips.length = 0;
            roll.push(0.001);
            roll.ball.x = (st.from + st.to) / 2;
            roll.ball.maxX = roll.ball.x;
            roll.ball.v = v;
            roll.step(0.1);
            return roll.ball.v;
        }
        return null;
    };
    assert.ok(over('front', true, 0.8) > over('front', false, 0.8), 'front strips push');
    assert.ok(over('back', true, -1.5) > over('back', false, -1.5), 'back strips brake a backward roll');
    assert.ok(over('back', true, -1.5) <= 0, 'and never turn it round');
    let taken = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        roll.ball.v = 2.5 * Math.sqrt(9.8 * T.skillHeight(T.LATE_LEG));
        for (let t = 0; t < 12 && !roll.over; t += 0.05) taken += roll.step(0.05).filter(e => e.type === 'token').length;
    }
    assert.ok(taken > 0, 'fast flights take tokens');
});

test('the tuck: held on act two, the ball gains on the way down and loses on the way up', () => {
    const run = (tuck, from) => {
        const roll = T.createRoll(T.LATE_LEG, 5, { pushes: 1, cooldown: 1 });
        roll.push(0.001);
        const b = roll.ground.bumps.find(h => h.skill === null && h.up && h.up !== 1 && h.peak > roll.ground.start + 5);
        roll.ball.x = from === 'back' ? b.peak + 0.1 * b.halfWidth : b.start + 0.05 * b.halfWidth * b.up;
        roll.ball.v = from === 'back' ? 1 : 8;
        roll.tuck = tuck;
        roll.step(0.25);
        return roll.ball.v;
    };
    assert.ok(run(true, 'back') > run(false, 'back'), 'faster down the back');
    assert.ok(run(true, 'face') < run(false, 'face'), 'slower up the face');
    // Act one ignores it.
    const one = tuck => { const r = T.createRoll(2, 3, { pushes: 1, cooldown: 1 }); r.push(1); r.tuck = tuck; for (let i = 0; i < 20; i++) r.step(0.05); return r.ball.x; };
    assert.equal(one(true), one(false));
});

test('a stuck ball swings freely on the slopes and is only braked near the floor of its dip', () => {
    // Rolling back down a slope it can't climb, it speeds up like any falling ball. (It used to be braked on
    // the slopes too, as if through syrup: these seeds gained speed on 0-5% of their downhill steps.)
    for (const seed of [4, 7, 9, 15, 33, 34]) {
        const roll = T.createRoll(1 + seed % 5, seed, { pushes: 1, cooldown: 1 });
        roll.push(1.4 + (seed % 5) * 0.3);
        let downhill = 0, gaining = 0;
        for (let i = 0; i < 3600 && !roll.over; i++) {
            const before = Math.abs(roll.ball.v);
            const slope = roll.ground.slope(roll.ball.x);
            roll.step(1 / 60);
            if (!roll.trapped || Math.abs(slope) <= 0.08) continue;
            if (Math.sign(-slope) === Math.sign(roll.ball.v)) {
                downhill++;
                if (Math.abs(roll.ball.v) > before) gaining++;
            }
        }
        assert.ok(roll.over, `seed ${seed}: it still comes to rest`);
        assert.ok(gaining >= 0.6 * downhill, `seed ${seed}: gained speed on ${gaining}/${downhill} downhill steps`);
    }
});

test('a spent ball sloshing over a boost strip still ends its run (it used to never end)', () => {
    const roll = T.createRoll(2, 1148255, { pushes: 1, cooldown: 1, friction: 0.75, hillScale: 0.8, onward: true, last: 2, strips: { front: 3, back: 3, more: 2 } });
    roll.push(2.4);
    for (let t = 0; t < 120 && !roll.over; t += 0.05) roll.step(0.05);
    assert.equal(roll.over, true);
});

test('an air dive (tucked in flight) comes down sooner, on a down-slope, and keeps its speed', () => {
    let tried = 0, sooner = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const fling = tuck => {
            const roll = T.createRoll(T.LATE_LEG, seed, { pushes: 0, cooldown: 1, onward: true, last: T.LATE_LEG });
            for (let i = 0; i < 40; i++) roll.step(1 / 60);   // settle on the line
            roll.fly(9, 6);
            let land = null;
            for (let i = 0; i < 1200 && !land; i++) {
                if (i === 12) roll.tuck = tuck;
                land = roll.step(1 / 60).find(e => e.type === 'land');
            }
            return { land, v: roll.ball.v };
        };
        const a = fling(false);
        const b = fling(true);
        if (!a.land || !b.land) continue;
        tried++;
        assert.ok(b.land.x <= a.land.x + 0.5, `seed ${seed}: dived at ${b.land.x.toFixed(2)}, glided to ${a.land.x.toFixed(2)}`);
        if (b.land.x < a.land.x - 0.5) sooner++;
        if (b.land.dive) {
            assert.equal(b.land.bounce, false, 'an air dive sticks');
            assert.ok(b.v > 0, 'and rolls on forward');
        }
    }
    assert.ok(tried >= 6 && sooner >= tried / 3, `${sooner}/${tried} came down sooner`);
});

test('tucked, the ball takes tokens from further away', () => {
    assert.ok(T.TOKEN_PULL > 1);
    assert.ok(T.AIR_DIVE > 1 && T.AIR_DIVE < 1.15);
});

test('act two thrust: held, it drives the ball and burns one sprint of fuel per BURN_SECONDS', () => {
    const roll = T.createRoll(T.LATE_LEG, 4, { pushes: 3, cooldown: 1, onward: true, last: T.LATE_LEG });
    roll.thrust = 25 / T.BURN_SECONDS;
    const steps = Math.round(T.BURN_SECONDS * 60);
    for (let i = 0; i < steps; i++) roll.step(1 / 60);
    assert.ok(roll.launched && roll.ball.v > 2, `it got going (${roll.ball.v.toFixed(2)} m/s)`);
    assert.ok(Math.abs(roll.pushesLeft - 2) < 0.05, `one unit burned (${roll.pushesLeft.toFixed(3)} left)`);
    roll.thrustFree = true;
    for (let i = 0; i < steps; i++) roll.step(1 / 60);
    assert.ok(Math.abs(roll.pushesLeft - 2) < 0.05, 'a free burn (crunch) uses no fuel');
    roll.thrustFree = false;
    for (let i = 0; i < 600 && roll.pushesLeft > 0; i++) roll.step(1 / 60);
    assert.equal(roll.pushesLeft, 0, 'the tank runs dry');
    assert.equal(roll.thrusting, false, 'and the jet stops');
    for (let i = 0; i < 6000 && !roll.over; i++) roll.step(1 / 60);
    assert.ok(roll.over, 'an empty tank ends the run once the ball rests');
});

test('act two thrust keeps a flight up: thrust in the air stays aloft longer and goes further', () => {
    const flight = thrust => {
        const roll = T.createRoll(T.LATE_LEG, 6, { pushes: 3, cooldown: 1, onward: true, last: T.LATE_LEG });
        for (let i = 0; i < 30; i++) roll.step(1 / 60);
        roll.fly(8, 4);
        let air = 0;
        for (let i = 0; i < 1200 && roll.airborne; i++) {
            roll.thrust = thrust;
            roll.step(1 / 60);
            air += 1 / 60;
        }
        return { air, x: roll.ball.x };
    };
    const glide = flight(0);
    const jet = flight(40);
    assert.ok(jet.air > glide.air * 1.3, `airtime ${jet.air.toFixed(2)} s vs ${glide.air.toFixed(2)} s`);
    assert.ok(jet.x > glide.x, 'and further');
});

test('power pacing: every third skill hill is a wall, the next one eases off, and wall skills pay big', () => {
    assert.equal(T.WALL_EVERY, E.WALL_EVERY, 'the engine mirrors the physics');
    for (let k = 0; k <= 30; k++) assert.equal(T.isWallLeg(k), E.isWallLeg(k), `leg ${k}`);
    // Walls stand where they did on the old six-skill act one: Image Recognition (5), Translation (11), then
    // act two's every third leg (old 9, 12, 15 → 15, 18, 21).
    assert.deepEqual(Array.from({ length: 25 }, (_, k) => k).filter(T.isWallLeg), [5, 11, 15, 18, 21, 24]);
    assert.equal(E.skillAt(5).name, 'Image Recognition');
    assert.equal(E.skillAt(11).name, 'Translation');
    assert.ok(T.skillHill(5).height > T.skillHeight(5) * 1.2, 'a wall stands taller than the curve');
    assert.ok(T.skillHill(6).height < T.skillHeight(6) && T.skillHill(7).height < T.skillHeight(7), 'the legs up to a step after a wall ease off');
    assert.equal(T.skillHill(8).height, T.skillHeight(8));
    assert.ok(T.skillHill(16).height < T.skillHeight(16) && T.skillHill(17).height === T.skillHeight(17), 'act two: the next leg eases off');
    // A wall's skill gives more sprint strength than its neighbours' (the power spurt).
    for (const k of [5, 11, 15, 18, 21]) {
        const push = i => E.skillAt(i).bonus.push || 0;
        assert.ok(E.skillAt(k).wall, `skill ${k} is a wall skill`);
        assert.ok(push(k) > push(k - 1) && push(k) > push(k + 1), `skill ${k} pays more than its neighbours`);
    }
});

test('act one has twelve real skills: one difficulty curve, read at half steps, mirrored in the engine', () => {
    // The engine's copy of each leg's position on the curve, and the boundary.
    for (let k = 0; k <= 30; k++) assert.equal(E.legPos(k), T.legPos(k), `leg ${k}`);
    assert.deepEqual([0, 1, 2, 3, 11, 12, 13, 14, 19].map(T.legPos), [0, 1, 1.5, 2, 6, 6.5, 7, 8, 13]);
    assert.equal(T.LATE_LEG, 13);
    // Old act-one leg n is new leg 2n − 1, old act-two leg m is new leg m + 6: the old legs keep their heights and
    // widths (act one's legs are shorter now, the warm-up's and Pattern Matching's unchanged), and act two's
    // geometry is exactly what it was.
    const old = { height: n => 0.3 * Math.pow(n < 7 ? 1.25 : 1.5, n - 1), half: n => 0.55 * Math.pow(1.14, n - 1) * (n >= 7 ? 8 : 1),
        length: n => (10 * Math.pow(1.4, n - 1) + 3 * (n - 1)) * ([0.7, 0.76, 0.88][n - 7] ?? 1) };
    for (let n = 1; n < 7; n++) {
        assert.ok(Math.abs(T.skillHeight(2 * n - 1) - old.height(n)) < 1e-12, `old leg ${n}'s height`);
        assert.ok(Math.abs(T.skillHill(2 * n - 1).halfWidth - old.half(n)) < 1e-12, `old leg ${n}'s width`);
    }
    for (let m = 7; m < 16; m++) {
        const h = T.skillHill(m + 6);
        assert.ok(Math.abs(h.height / T.wallMult(m + 6) - old.height(m)) < 1e-9 && Math.abs(h.halfWidth - old.half(m)) < 1e-9, `act two leg ${m}`);
        assert.ok(Math.abs(h.start - T.checkpoint(m + 6) - old.length(m)) < 1e-9, `act two leg ${m}'s length`);
        assert.equal(T.rollingHills(m + 6, 5).length, 5 + Math.floor(T.rng(5)() * 3) + Math.floor((m - 7) / 3), `act two leg ${m}'s swells`);
    }
    assert.equal(T.skillHill(1).start - T.checkpoint(1), 9, 'Pattern Matching\'s leg is as it was');
    assert.equal(T.skillHill(0).start - T.checkpoint(0), 2, 'and the warm-up');
    // After Embeddings, act one's legs grow steadily.
    // Each leg is longer than the last on the curve; its character then stretches or shortens it (a Sprint leg is short).
    const nominal = k => (T.skillHill(k).start - T.checkpoint(k)) / T.characterLength(k);
    for (let k = 3; k < T.LATE_LEG; k++) assert.ok(nominal(k) > nominal(k - 1), `leg ${k} is longer`);
    // The skills: twelve real ones in act one, the new ones between the old.
    assert.deepEqual(Array.from({ length: 14 }, (_, i) => E.skillAt(i).name), ['Tokenization', 'Pattern Matching', 'Embeddings', 'Edge Detection',
        'Feature Extraction', 'Image Recognition', 'Optical Character Recognition', 'Speech Recognition', 'Sentiment Analysis', 'Language Modeling',
        'Summarization', 'Translation', 'In-Context Learning', 'Reasoning']);
    for (let i = 0; i < 13; i++) {
        const k = E.skillAt(i);
        assert.ok(k.voice && k.effect && k.flavor.length <= 70 && k.bonus, `${k.name} has a voice, an effect, a quip and a bonus`);
    }
});

test('Intelligence adds up to General AI exactly at In-Context Learning, the last act-one skill', () => {
    const total = n => Array.from({ length: n }, (_, i) => E.skillAt(i).grants.intelligence || 0).reduce((a, b) => a + b, 0);
    assert.equal(total(T.LATE_LEG), 25, 'through In-Context Learning');
    assert.ok(total(T.LATE_LEG - 1) + 8 < 25, 'Translation plus every algorithm falls short');
    for (let n = 2; n <= T.LATE_LEG; n++) assert.ok(E.skillAt(n - 1).grants.intelligence > 0, `skill ${n - 1} grants Intelligence`);
    const grants = Array.from({ length: T.LATE_LEG }, (_, i) => E.skillAt(i).grants.intelligence || 0);
    assert.equal(grants[T.LATE_LEG - 1], Math.max(...grants), 'the last one carries the big step');
    // Where the old six-skill act one stood at each old skill, the new one stands there or below.
    const OLD = [0, 1, 3, 6, 10, 16];
    for (let n = 1; n < 6; n++) assert.ok(total(2 * n) <= OLD[n], `old skill ${n}`);
});

test('gates follow the skill they name, wherever the trail puts it', () => {
    const s = E.defaultState(NOW);
    const at = name => { s.path.learned = E.SKILL_INDEX[name]; const before = E.knows(s, name); s.path.learned++; return !before && E.knows(s, name); };
    for (const name of ['Pattern Matching', 'Edge Detection', 'Image Recognition', 'Language Modeling', 'Translation', 'In-Context Learning', 'Reasoning']) assert.ok(at(name), name);
    // Automation gates count skills learned, the warm-up's included, and name the skill.
    assert.equal(E.AUTO_TRAINER_SKILL, E.SKILL_INDEX['Edge Detection'] + 1);
    s.path.learned = E.SKILL_INDEX['Edge Detection'];
    assert.equal(E.automationGate(s, 'autoTrainer').skill, 'Edge Detection');
    assert.equal(E.automationGate(s, 'autoTrainer').skillOk, false);
    s.path.learned++;
    assert.equal(E.automationGate(s, 'autoTrainer').skillOk, true);
    s.path.learned = E.SKILL_INDEX['Language Modeling'];
    assert.equal(E.automationGate(s, 'researchAssistant').skillOk, false);
    s.path.learned++;
    assert.equal(E.automationGate(s, 'researchAssistant').skillOk, true);
    // Story mail and dilemmas wait for their skill.
    const mail = id => E.MAIL.find(m => m.id === id).when(s);
    s.path.learned = E.SKILL_INDEX['Self-Modeling'];
    assert.equal(mail('reveal'), false);
    s.path.learned++;
    assert.equal(mail('reveal'), true);
});

test('saves before v18 move onto the doubled act one: the same frontier skill, legs re-indexed, Intelligence re-spread', () => {
    // An old act-one save on Image Recognition (old leg 3), with laps, best runs and strengths on old legs 0–3, and
    // Intelligence from the old grants through Edge Detection (0 + 1 + 2) plus Machine Learning's 1.
    const s = E.migrate({ version: 17, attr: { intelligence: 4 }, path: { learned: 3, best: 0.6, auto: [5, 6, 7], legBest: [10, 20, 30, 40], legPower: [1, 2, 3, 4] },
        stats: { skillsLearned: 3 } }, NOW);
    assert.equal(s.version, E.SAVE_VERSION);
    assert.equal(E.SAVE_VERSION, 18);
    assert.equal(s.path.learned, 5, 'Embeddings and Feature Extraction count as learned');
    assert.equal(E.skillAt(s.path.learned).name, 'Image Recognition', 'the same frontier skill');
    assert.equal(s.path.best, 0, 'a record on the old, longer leg doesn\'t carry over');
    assert.deepEqual(s.path.auto, [5, 6, 0, 7]);
    assert.deepEqual(s.path.legPower, [1, 2, 0, 3, 0, 4]);
    assert.equal(s.path.legBest[0], 10);
    assert.equal(s.path.legBest[2], 0);
    assert.ok(Math.abs(s.path.legBest[1] - 20) < 1e-9, 'Pattern Matching\'s leg is the same length');
    assert.ok(s.path.legBest[3] > 0 && s.path.legBest[3] < 30 && s.path.legBest[5] < 40, 'later ones rescaled to the shorter legs');
    assert.equal(s.attr.intelligence, 1 + 1 + 1 + 1 + 1, 'the new grants through Feature Extraction, plus Machine Learning\'s');
    assert.equal(s.stats.skillsLearned, 5);
    // Act two: old frontier m is m + 6, and Intelligence is unchanged (both acts add up to 25 by General AI).
    const late = E.migrate({ version: 17, attr: { intelligence: 40 }, path: { learned: 9, legBest: Array(10).fill(100) } }, NOW);
    assert.equal(late.path.learned, 15);
    assert.equal(E.skillAt(late.path.learned).name, 'Analogy', 'the same frontier skill');
    assert.equal(late.attr.intelligence, 40);
    assert.equal(late.path.legBest[15], 100, 'act two\'s legs are the same length: kept as they were');
    assert.equal(late.path.legBest[12], 0, 'In-Context Learning\'s leg starts empty');
    // A new game, and a current save, are untouched.
    assert.equal(E.migrate({ version: 17, path: { learned: 0 } }, NOW).path.learned, 0);
    assert.equal(E.migrate({ version: 18, path: { learned: 3 } }, NOW).path.learned, 3);
});

test('demo: act two is locked behind a gate past In-Context Learning', () => {
    const s = E.defaultState(0);
    assert.equal(E.ACT_TWO_LOCKED, true, 'the demo build locks act two (set false to open it)');
    s.path.learned = 12;
    assert.equal(E.frontierLeg(s), 12, 'In-Context Learning is still the frontier');
    assert.equal(E.actTwoLocked(s), false);
    s.path.learned = 13;
    assert.equal(E.frontierLeg(s), 12, 'once learned, runs stay on its leg');
    assert.equal(E.actTwoLocked(s), true);
    assert.equal(E.endingPhase(), 1, 'the demo ends at General AI');
    // A run that passes the gate ends there, paid as the whole last leg.
    const gate = T.checkpoint(13) + 0.6;
    const roll = T.createRoll(12, 7, { pushes: 50, cooldown: 0, onward: true, last: 12, endAt: gate });
    roll.ball.x = T.skillHill(12).end;
    let end = null;
    for (let i = 0; i < 4000 && !end; i++) {
        roll.push(4);
        end = roll.step(0.05).find(e => e.type === 'end');
    }
    assert.ok(end, 'the run ends');
    assert.ok(roll.ball.x <= gate + 0.5, 'at the gate, not past it');
    assert.equal(end.leg, 12);
    assert.equal(end.progress, 1, 'paid as the whole last leg');
});

test('leg characters: one table in the physics and the engine, and each shapes its hills', () => {
    for (let k = 0; k <= 14; k++) {
        assert.equal(E.legCharacter(k), T.legCharacter(k), `leg ${k}`);
        assert.equal(E.characterLength(k), T.characterLength(k), `leg ${k}`);
    }
    for (const [id, c] of Object.entries(T.LEG_CHARACTERS)) assert.equal(E.LEG_CHARACTERS[id], c.length, id);
    assert.equal(T.legCharacter(0), null, 'the warm-up has none');
    assert.equal(T.legCharacter(T.LATE_LEG), null, 'act two keeps its swells');
    assert.equal(T.legCharacter(1), 'rolling', "Pattern Matching's leg is as it was");
    // Every character appears in act one, and the walls are cliffs.
    const used = new Set(Array.from({ length: T.LATE_LEG - 1 }, (_, i) => T.legCharacter(i + 1)));
    for (const id of Object.keys(T.LEG_CHARACTERS)) assert.ok(used.has(id), id);
    for (let k = 1; k < T.LATE_LEG; k++) if (T.isWallLeg(k)) assert.equal(T.legCharacter(k), 'cliffs', `wall ${k}`);
    // Shapes, averaged over seeds: steepness (height over half-width) and spacing.
    const stats = k => {
        let steep = 0, n = 0, gaps = 0;
        for (let seed = 1; seed <= 30; seed++) {
            const hs = T.rollingHills(k, seed);
            hs.forEach((h, i) => { steep += h.height / h.halfWidth; n++; if (i) gaps += h.start - hs[i - 1].end; });
        }
        return { steep: steep / n, gap: gaps / n };
    };
    const rolling = stats(7), flats = stats(8), cliffs = stats(11), marathon = stats(9);
    assert.ok(flats.steep < rolling.steep * 0.4, `flats are gentle: ${flats.steep} vs ${rolling.steep}`);
    assert.ok(cliffs.steep > rolling.steep * 2, `cliffs are steep: ${cliffs.steep} vs ${rolling.steep}`);
    assert.ok(marathon.gap > rolling.gap * 2, 'marathons are sparse');
});

test('a leg is worth what its step on the curve is worth, whatever its character', () => {
    // XP for reaching the peak, per nominal metre: a Sprint leg pays the same rate as its neighbours.
    const perStep = k => E.stretchXpAt(k) / (E.legMetres(k) / E.characterLength(k));
    for (let k = 2; k < T.LATE_LEG; k++) assert.ok(perStep(k) > perStep(k - 1) * 0.95, `leg ${k}`);
    // And the engine's metres match the physics on every character.
    for (let k = 1; k < T.LATE_LEG; k++) {
        const h = T.skillHill(k);
        assert.ok(Math.abs(E.legMetres(k) - (h.peak - T.checkpoint(k) - 0.3)) < 0.35, `leg ${k}`);
    }
});

test('Inertia: speed you have built is harder to lose, and a slow ball gets no help', () => {
    // A flat run-out: the same launch keeps more speed with Inertia.
    const coast = inertia => {
        const roll = T.createRoll(9, 3, { pushes: 1, cooldown: 0, inertia });
        roll.push(3);
        for (let i = 0; i < 40; i++) roll.step(0.05);
        return roll.ball.maxX - roll.ground.start;
    };
    assert.ok(coast(0.45) > coast(0) * 1.03, `${coast(0.45)} vs ${coast(0)}`);
    // Capped, and nothing at 0.
    assert.equal(coast(0), coast(undefined));
    // A crawling ball near its top speed is helped; one far below its top speed barely is.
    const helped = (v, top) => {
        const roll = T.createRoll(9, 3, { pushes: 1, cooldown: 0, inertia: 0.6 });
        roll.push(1); roll.ball.top = top; roll.ball.v = v;
        const plain = T.createRoll(9, 3, { pushes: 1, cooldown: 0 });
        plain.push(1); plain.ball.v = v;
        roll.step(0.2); plain.step(0.2);
        return roll.ball.v - plain.ball.v;
    };
    assert.ok(helped(3, 3) > helped(3, 30) * 3, 'help scales with speed against the run\'s top');
});

test('Hop: an act-one exploit that leaves the line, falls naturally, and can never clear a skill hill alone', () => {
    const roll = T.createRoll(5, 3, { pushes: 3, cooldown: 0 });
    roll.push(3);
    for (let i = 0; i < 20; i++) roll.step(0.05);
    assert.equal(roll.hop(1), true);
    assert.ok(roll.airborne);
    assert.equal(roll.hop(1), false, 'not again in the air');
    let land = null;
    for (let i = 0; i < 80 && !land; i++) land = roll.step(0.05).find(e => e.type === 'land');
    assert.ok(land && land.flight > 0.2 && land.flight < 3, `a hop, not a launch: ${land && land.flight}`);
    // The ceiling stays under the leg's skill hill, however fast the ball.
    for (const k of [2, 5, 11]) {
        const r = T.createRoll(k, 1, { pushes: 1, cooldown: 0 });
        r.ball.x = T.skillHill(k).start - 0.05;
        r.ball.v = 40;
        r.hop(1);
        let top = 0;
        for (let i = 0; i < 400 && r.airborne; i++) { r.step(0.01); top = Math.max(top, r.height); }
        assert.ok(top < T.skillHill(k).height, `leg ${k}: ${top} < ${T.skillHill(k).height}`);
    }
    // Act two has none.
    const late = T.createRoll(T.LATE_LEG, 1, { pushes: 1, cooldown: 0 });
    late.push(1);
    assert.equal(late.hop(1), false);
});
