// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const NOW = 1_700_000_000_000;
const fresh = () => E.defaultState(NOW);

test('the skill tree starts sparse: one 1-XP seed, short nodes around it, dearer further out', () => {
    const nodes = E.UPGRADES.filter(u => u.tab === 'training');
    const depth = n => (n.requires ? 1 + depth(E.UPGRADE_BY_ID[n.requires]) : 1);
    const seeds = nodes.filter(n => !n.requires);
    assert.deepEqual(seeds.map(n => n.id), ['initialWeights'], 'one seed');
    assert.equal(seeds[0].cost.xp, 1);
    assert.equal(seeds[0].max, 1);
    for (const n of nodes) {
        if (n.endless) assert.equal(n.max, undefined, `${n.id}: the endless node has no cap`);
        else assert.ok(n.max >= 1 && n.max <= 3, `${n.id} has 1–3 levels`);
        if (n.cost.xp == null) continue;
        assert.ok(n.boost, `${n.id} declares its boost`);
        if (depth(n) === 2) assert.ok(n.cost.xp <= 10 && n.max <= 2, `${n.id}: the ring around the seed is cheap and short`);
        if (depth(n) <= 3) assert.ok(n.max <= 2, `${n.id}: no 3-level nodes near the centre`);
        if (n.requires && E.UPGRADE_BY_ID[n.requires].cost.xp) {
            assert.ok(n.cost.xp > E.UPGRADE_BY_ID[n.requires].cost.xp, `${n.id} costs more than its parent`);
        }
    }
    assert.ok(nodes.filter(n => n.secret).length >= 3, 'some nodes are secrets');
    for (const n of nodes) {
        assert.ok(n.flavor && n.flavor.length <= 70, `${n.id} has a short quip`);
        assert.ok(n.effect && n.effect.length <= 80, `${n.id} has a short, plain effect`);
    }
});

test('skill-tree nodes do not overlap and grow from a neighbouring node', () => {
    const nodes = E.UPGRADES.filter(u => u.tab === 'training');
    const seen = new Set();   // the seed node takes the centre cell
    for (const n of nodes) {
        const key = `${n.tree.x},${n.tree.y}`;
        assert.ok(!seen.has(key), `${n.id} overlaps another node`);
        seen.add(key);
        if (!n.requires) {
            assert.deepEqual(n.tree, { x: 0, y: 0 }, `${n.id}: the seed sits at the centre`);
            continue;
        }
        const parent = E.UPGRADE_BY_ID[n.requires].tree;
        assert.equal(Math.abs(parent.x - n.tree.x) + Math.abs(parent.y - n.tree.y), 1, `${n.id} is adjacent to what it grows from`);
    }
});

test('every upgrade has a valid tab, cost and dependency', () => {
    const tabs = new Set(E.TABS.map(t => t.id));
    for (const up of E.UPGRADES) {
        if (up.tab === 'training') {
            assert.ok(up.tree && Number.isInteger(up.tree.x) && Number.isInteger(up.tree.y), `${up.id} tree position`);
            assert.ok(up.icon, `${up.id} icon`);
        } else if (up.tab === 'legacy') {
            assert.ok(up.legacy && ['power', 'precision', 'recursion', 'momentum'].includes(up.branch), `${up.id} legacy branch`);
            assert.ok(!up.requires || E.UPGRADE_BY_ID[up.requires].legacy, `${up.id} grows only from another legacy upgrade`);
        } else {
            assert.ok(tabs.has(up.tab), `${up.id} tab`);
        }
        assert.ok(Object.keys(up.cost).length > 0, `${up.id} cost`);
        for (const [k, v] of Object.entries(up.cost)) {
            assert.ok(k in E.RESOURCES, `${up.id} cost resource ${k}`);
            assert.ok(Number.isFinite(v) && v > 0, `${up.id} cost value`);
        }
        assert.ok(up.scale || up.max === 1, `${up.id} must be repeatable or one-time`);
        if (up.requires) assert.ok(E.UPGRADE_BY_ID[up.requires], `${up.id} requires ${up.requires}`);
        for (const k of Object.keys(up.grants || {})) assert.ok(k in E.ATTRIBUTES, `${up.id} grants ${k}`);
    }
});

test('compute action adds click power and counts stats', () => {
    const s = fresh();
    const r = E.act(s, 'compute');
    assert.equal(r.ok, true);
    assert.equal(s.res.cp, 1);
    assert.equal(s.stats.clicks, 1);
    assert.equal(s.stats.runCp, 1);
});

test('locked and unaffordable actions are rejected without side effects', () => {
    const s = fresh();
    assert.equal(E.act(s, 'research').ok, false);
    assert.equal(E.act(s, 'collect').ok, false);
    assert.deepEqual(s.res, { cp: 0, dp: 0, rp: 0, xp: 0 });
});

test('buying an upgrade pays the scaled cost and increases production', () => {
    const s = fresh();
    s.stats.clicks = 40;
    s.levels.keyboard = 7;                    // the CPU is earned by computing by hand first
    E.evaluate(s);
    s.res.cp = 1000;
    assert.equal(E.buy(s, 'cpu').ok, true);
    assert.equal(s.res.cp, 1000 - 15);
    assert.deepEqual(E.upgradeCost(E.UPGRADE_BY_ID.cpu, 1), { cp: Math.ceil(15 * 1.18) });
    assert.equal(E.derive(s).cpPerSec, 0.5 * E.derive(s).mult);
});

test('one-time upgrades cannot be bought twice and grant attributes once', () => {
    const s = fresh();
    s.res = { cp: 1e9, dp: 1e9, rp: 1e9, xp: 0 };
    s.unlocked['tab:algorithms'] = true;
    E.evaluate(s);
    assert.equal(E.buy(s, 'machineLearning').ok, true);
    assert.equal(s.attr.intelligence, 1);
    assert.equal(E.buy(s, 'machineLearning').ok, false);
    assert.equal(s.attr.intelligence, 1);
});

test('data per collection grows only through the Data Processor; NLP and Computer Vision speed up the crawler, no Intelligence', () => {
    const s = fresh();
    s.levels.cpu = 200;
    s.levels.autoCollector = 1;
    const before = E.derive(s);
    s.levels.nlp = 1;
    s.levels.computerVision = 1;
    const after = E.derive(s);
    assert.equal(after.dpPerCollect, before.dpPerCollect);
    assert.ok(Math.abs(after.collectsPerSec - 3 * before.collectsPerSec) < 1e-9);
    assert.ok(!E.UPGRADE_BY_ID.nlp.grants && !E.UPGRADE_BY_ID.computerVision.grants);
});

test('upgrades in locked tabs stay hidden until the tab unlocks', () => {
    const s = fresh();
    s.res = { cp: 1e9, dp: 1e9, rp: 1e9, xp: 0 };
    E.evaluate(s);
    assert.equal(E.buy(s, 'machineLearning').ok, false);
    s.attr.intelligence = 5;
    E.evaluate(s);
    assert.equal(E.buy(s, 'machineLearning').ok, true);
});

test('creativity and awareness are obtainable (consciousness path is not a dead end)', () => {
    const grants = E.UPGRADES.flatMap(u => Object.keys(u.grants || {}));
    assert.ok(grants.includes('creativity'));
    assert.ok(grants.includes('awareness'));
    const gate = E.MILESTONES.find(m => m.key === 'tab:consciousness');
    const s = fresh();
    s.attr.intelligence = 25;
    assert.equal(gate.check(s), true);
});

test('phases require every attribute minimum and never skip', () => {
    const s = fresh();
    assert.equal(E.phaseIndex(s), 0);
    s.attr.intelligence = 1e6;
    assert.equal(E.phaseIndex(s), 1, 'intelligence alone cannot pass General AI');
    assert.equal(E.phaseProgress(s), 1 / 4, "Int done; Cre, Awa and versions not");
    s.attr.creativity = 5;
    s.attr.awareness = 5;
    assert.equal(E.phaseIndex(s), 1, 'Superintelligence also needs a shipped version');
    s.prestige.count = 1;
    assert.equal(E.phaseIndex(s), 2);
    s.attr = { intelligence: 1e6, creativity: 1e6, awareness: 1e6 };
    assert.equal(E.phaseIndex(s), 2, 'the Singularity needs three versions');
    s.prestige.count = 3;
    assert.equal(E.phaseIndex(s), 3);
    s.prestige.count = 0;
    s.attr = { intelligence: 50, creativity: 0, awareness: 0 };
    const changes = E.evaluate(s);
    assert.equal(changes.phase.name, 'General AI');
    assert.equal(E.evaluate(s).phase, null, 'phase change reported only once');
});

test('unlocks persist even after the triggering resource is spent', () => {
    const s = fresh();
    s.res.cp = 100;
    s.res.dp = 40;
    s.stats.collects = 40;
    E.evaluate(s);
    s.res.cp = s.res.dp = 0;
    E.evaluate(s);
    assert.equal(s.unlocked['module:path'], true);
});

test('research waits for a good stretch of training, not a data stockpile', () => {
    const s = fresh();
    s.res.dp = 1e6;
    s.res.cp = 1e6;
    s.unlocked['module:path'] = true;
    for (let i = 0; i < 60; i++) E.payPush(s, 1);
    E.evaluate(s);
    s.path.learned = 1;
    for (let i = 0; i < 60; i++) E.payPush(s, 1);
    E.evaluate(s);
    assert.equal(!!s.unlocked['action:research'], false, 'sprints before Pattern Matching (the warm-up included) do not count');
    s.path.learned = 2;
    for (let i = 0; i < 49; i++) E.payPush(s, 1);
    E.evaluate(s);
    assert.equal(!!s.unlocked['action:research'], false);
    assert.equal(E.payPush(s, 1), true);
    assert.equal(s.stats.skilledSprints, 50);
    E.evaluate(s);
    assert.equal(s.unlocked['action:research'], true);
    // Older saves past the first skill estimate their sprints from their runs.
    const old = E.migrate({ version: 5, stats: { rolls: 40 }, path: { learned: 2 } });
    assert.equal(old.stats.skilledSprints, 80);
    assert.equal(old.path.learned, 3, 'and gain the warm-up skill in front');
});

test('skill-tree nodes open once their parent has its first level', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.levels.initialWeights = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.gpuCluster2), false, 'not before GPU Cluster is bought');
    s.levels.trainingOptimizer = 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.gpuCluster2), true, 'GPU Cluster still has a level left');
});

test('Carpal Tunnel: holding a job down to repeat it', () => {
    const s = fresh();
    s.stats.clicks = 5000;
    E.evaluate(s);
    assert.equal(!!s.achievements.clicks1k, false, 'clicking alone is not enough');
    s.stats.holds = 1;
    E.evaluate(s);
    assert.equal(s.achievements.clicks1k, true);
});

test('research stays open after the first version, once there is data again', () => {
    const s = fresh();
    s.prestige.count = 1;
    s.stats.rolls = 12;
    E.evaluate(s);
    assert.ok(!s.unlocked['action:research'], 'no research before data');
    assert.ok(!s.unlocked['module:path'], 'the server room waits for data too');
    s.res.dp = 1;
    E.evaluate(s);
    assert.equal(s.unlocked['action:collect'], true);
    assert.equal(s.unlocked['action:research'], true);
    assert.equal(s.unlocked['module:path'], true);
});

test('investors never ask for clean prompts before the zone exists', () => {
    const s = fresh();
    s.unlocked['module:path'] = s.unlocked['action:research'] = s.unlocked['seen:dp'] = true;
    for (let i = 0; i < 40; i++) {
        s.projects.offers = [];
        assert.notEqual(E.makeOffer(s).task, 'clean');
    }
    s.levels.precisionTuning = 1;
    const tasks = new Set();
    for (let i = 0; i < 80; i++) {
        s.projects.offers = [];
        tasks.add(E.makeOffer(s).task);
    }
    assert.ok(tasks.has('clean'));
});

test('tick produces resources over time', () => {
    const s = fresh();
    s.levels.cpu = 2;
    E.tick(s, 10);
    assert.equal(s.res.cp, 10);
    assert.equal(s.stats.playTime, 10);
});

test('automation converts resources instead of creating them', () => {
    const s = fresh();
    s.res.cp = 1000;
    s.levels.cpu = 200;                     // plenty of production: automation runs at full speed
    s.levels.autoCollector = 1;
    const d = E.derive(s);
    assert.equal(d.autoThrottled, false);
    assert.equal(d.collectsPerSec, 0.2);
    E.tick(s, 10);
    assert.ok(Math.abs(s.res.cp - (1000 + 10 * d.cpPerSec - 20)) < 1e-6);
    assert.ok(Math.abs(s.res.dp - 2 * d.dpPerCollect) < 1e-9);

    const r = fresh();
    r.res.dp = 1000;
    r.levels.cpu = 2000;
    r.levels.researchAssistant = 1;
    const before = r.res.dp;
    E.tick(r, 10);                          // research needs DP income, not stock: none is produced
    assert.equal(r.res.dp, before);
    assert.equal(r.res.rp, 0);
});

test('automation never spends more than its budget of production', () => {
    for (const budget of [0, 0.5, 1]) {
        const s = fresh();
        s.tasks.autoCollector.share = budget;
        s.tasks.researchAssistant.share = budget;
        s.levels.cpu = 4;
        s.levels.autoCollector = 20;
        s.levels.researchAssistant = 20;
        const d = E.derive(s);
        // Shares are taken in order and never add up to more than everything.
        assert.ok(d.cpUsePerSec <= Math.min(1, 2 * budget) * d.cpPerSec + 1e-9, `cp at ${budget}`);
        assert.ok(d.cpNet >= -1e-9, 'compute never falls');
        assert.ok(d.dpUsePerSec <= budget * d.dpPerSec + 1e-9, `dp at ${budget}`);
        assert.equal(d.autoThrottled, true, 'demand far above production');
        const cp = s.res.cp;
        E.tick(s, 60);
        assert.ok(s.res.cp >= cp, 'compute still climbs');
    }
});

test('scheduled tasks: each has its own share and switch, saved and clamped, never over 100% in total', () => {
    const m = tasks => E.migrate({ version: E.SAVE_VERSION, tasks }, NOW).tasks;
    assert.equal(m({ autoCollector: { on: true, share: 0.3 } }).autoCollector.share, 0.3);
    assert.equal(m({ autoCollector: { share: 5 } }).autoCollector.share, 0.7, 'capped by what the research assistant leaves free');
    assert.equal(m({ autoCollector: { share: 'x' } }).autoCollector.share, 0.4, 'the default');
    assert.equal(m({ researchAssistant: { on: false } }).researchAssistant.on, false);
    const both = m({ autoCollector: { share: 0.8 }, researchAssistant: { share: 0.8 } });
    assert.ok(both.autoCollector.share + both.researchAssistant.share <= 1 + 1e-9, 'shares fit in 100%');
    // Older saves had one budget for everything: each task starts from it.
    const old = E.migrate({ version: 4, settings: { autoBudget: 0.3 } }, NOW).tasks;
    assert.equal(old.autoCollector.share, 0.3);
    assert.equal(old.researchAssistant.share, 0.3);
    // A switched-off task uses nothing, and its share is free for the others.
    const s = fresh();
    s.levels.cpu = 50;
    s.levels.autoCollector = 5;
    E.setTaskOn(s, 'autoCollector', false);
    assert.equal(E.derive(s).collectsPerSec, 0);
    assert.equal(E.setTaskShare(s, 'researchAssistant', 1), 1, 'all of it is free');
    E.setTaskOn(s, 'autoCollector', true);
    assert.equal(E.taskShares(s).autoCollector + E.taskShares(s).researchAssistant, 1);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, settings: {} }, NOW).settings.autosave, true);
});

test('XP is paid by distance: per metre, more per metre further along, and more on later legs', () => {
    const s = fresh();
    assert.equal(E.rollXp(s, 0, false, 0, 0), 0, 'no distance, no XP');
    // Same leg: twice the metres (and further along) pays more than twice.
    assert.ok(E.rollXp(s, 0.6, false, 0, 6) > 2 * E.rollXp(s, 0.3, false, 0, 3));
    // Per metre: 1 + progress.
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 0, 5) - E.PATH.xpPerMetre * 5 * 1.5) < 1e-9);
    // A metre is worth a little more on a later leg.
    s.path.learned = 3;
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 0, 5) / (E.PATH.xpPerMetre * 5 * 1.5) - Math.pow(E.PATH.metreScale, 3)) < 1e-9);
});

test('an active game: there is no offline progress (loading a save adds nothing, whenever it was saved)', () => {
    const s = fresh();
    s.levels.cpu = 2;
    const back = E.deserialize(E.serialize(s), NOW + 24 * 3600 * 1000);
    assert.equal(back.res.cp, 0);
    assert.equal(E.applyOffline, undefined);
    assert.equal('offline' in back.settings, false);
});

test('prestige keeps achievements and points, resets the run', () => {
    const s = fresh();
    s.attr.intelligence = 10;
    s.path.learned = 6;
    s.res.cp = 123;
    s.levels.cpu = 5;
    s.achievements.cp1k = true;
    assert.equal(E.prestigeGain(s), 3, 'Insight comes from skills learned past the warm-up: floor(0.25 × 5^1.7)');
    const r = E.prestige(s, NOW + 1);
    assert.equal(r.ok, true);
    assert.equal(r.state.prestige.points, 3);
    assert.equal(r.state.prestige.count, 1);
    assert.equal(r.state.res.cp, 0);
    assert.deepEqual(r.state.levels, { keyboard: E.CPU_AFTER_CLICK_LEVEL }, 'the run starts over, with the desk built');
    assert.equal(r.state.achievements.cp1k, true);
    assert.ok(Math.abs(E.derive(r.state).mult - (1 + 0.07 * Math.sqrt(3))) < 1e-9, 'three Insight: 1 + 0.07√3, achievements add nothing');
});

test('a new version remembers first-time intros, trains faster, and starts with the desk built', () => {
    const s = fresh();
    s.attr.intelligence = 10;
    s.path.learned = 5;
    s.intro['module:path'] = true;
    const t = E.prestige(s, NOW).state;
    assert.equal(t.intro['module:path'], true, 'callouts and tips stay seen');
    t.path.learned = 1;
    s.path.learned = 1;
    assert.ok(Math.abs(E.derive(t).xpMult / E.derive(s).xpMult - E.derive(t).mult) < 1e-9, 'Insight boosts training XP');
    assert.ok(E.derive(t).xpPerSec > E.derive(s).xpPerSec, 'passive XP too');
    assert.equal(E.level(t, 'keyboard'), E.CPU_AFTER_CLICK_LEVEL);
    const old = E.migrate({ version: 6, unlocked: { 'module:path': true, 'hint:hold': true, 'action:collect': true } });
    assert.deepEqual(Object.keys(old.intro).sort(), ['hint:hold', 'module:path'], 'older saves: tips and reached callouts count as seen');
});

test('prestige is refused below the intelligence requirement', () => {
    const s = fresh();
    s.stats.runCp = 1e9;
    assert.equal(E.prestigeGain(s), 0);
    assert.equal(E.prestige(s).ok, false);
});

test('save round-trips', () => {
    const s = fresh();
    s.res.cp = 42.5;
    s.levels.server = 3;
    s.unlocked['action:research'] = true;
    assert.deepEqual(E.deserialize(E.serialize(s), NOW), s);
});

test('corrupt or hostile saves are sanitized', () => {
    assert.equal(E.deserialize('not json', NOW), null);
    const s = E.migrate({
        version: 2,
        res: { cp: -5, dp: 'x', rp: Infinity },
        levels: { cpu: 3, bogus: 9, nlp: 7, server: 1.5 },
        achievements: { firstClick: true, fake: true },
        settings: { autosave: 'yes' }
    }, NOW);
    assert.deepEqual(s.res, { cp: 0, dp: 0, rp: 0, xp: 0 });
    assert.deepEqual(s.levels, { cpu: 3, nlp: 1 });
    assert.deepEqual(s.achievements, { firstClick: true });
    assert.equal(s.settings.autosave, true);
});

test('v1 saves migrate to the current format', () => {
    const v1 = {
        resources: { computePower: 5000, dataPoints: 120, researchPoints: 7, knowledge: 0, funding: 100, time: 99 },
        attributes: { intelligence: 3.5, creativity: 0, awareness: 0, efficiency: 1 },
        upgrades: { cpuLevel: 4, serverLevel: 2, quantumLevel: 1, neuralNetworkLevel: 0, dataProcessorLevel: 3 },
        features: { autoCollect: true },
        progress: { prestigePoints: 2, totalPrestigePoints: 3, phase: 'Narrow AI' },
        settings: { autoSaveEnabled: false, backgroundProcessingEnabled: true },
        stats: { totalClicks: 50, totalComputeGenerated: 9000, totalPrestigeCount: 1, gameStartTime: NOW - 1000 },
        saveTime: NOW - 500
    };
    const s = E.migrate(v1, NOW);
    assert.equal(s.version, E.SAVE_VERSION);
    assert.deepEqual(s.res, { cp: 5000, dp: 120, rp: 7, xp: 0 });
    assert.equal(s.attr.intelligence, 3.5);
    assert.deepEqual(s.levels, { cpu: 4, server: 2, quantum: 1, dataProcessor: 3, autoCollector: 1 });
    assert.deepEqual(s.prestige, { points: 2, total: 3, count: 1, major: 2, minor: 0, levels: {} });
    assert.equal(s.settings.autosave, false);
    assert.equal(s.stats.clicks, 50);
    assert.equal(s.lastSaved, NOW - 500);
});

test('number formatting', () => {
    assert.equal(E.format(0), '0');
    assert.equal(E.format(2.5), '2.5');
    assert.equal(E.format(999), '999');
    assert.equal(E.format(1234), '1.23K');
    assert.equal(E.format(1.5e6), '1.50M');
    assert.equal(E.format(123.4e9), '123.4B');
    assert.equal(E.format(1e40), '1.00e40');
    assert.equal(E.formatCost({ cp: 1500, dp: 20 }), '1.50K CP, 20 DP');
    assert.equal(E.formatDuration(3725), '1h 2m');
});

test('cleared stretches earn XP slowly on their own', () => {
    const s = fresh();
    assert.equal(E.derive(s).xpPerSec, 0);
    s.path.learned = 2;
    const rate = E.derive(s).xpPerSec;
    assert.ok(rate > 0);
    assert.ok(Math.abs(rate - 2 * (E.stretchXpAt(0) + E.stretchXpAt(1)) * E.PATH.clearedRate) < 1e-9, 'a plain cresting run at least');
    E.tick(s, 100);
    assert.ok(Math.abs(s.res.xp - rate * 100) < 1e-9);
});

test('cleared legs replicate their best run: a better replay raises passive XP, a worse one doesn\'t', () => {
    const s = fresh();
    s.path.learned = 2;
    const base = E.derive(s).xpPerSec;
    assert.equal(E.recordRun(s, 0, 2 * E.stretchXpAt(0) * 3), true);
    const better = E.derive(s).xpPerSec;
    assert.ok(Math.abs(better - base - 4 * E.stretchXpAt(0) * E.PATH.clearedRate) < 1e-9);
    assert.equal(E.recordRun(s, 0, 1), false, 'a worse run keeps the best');
    assert.equal(E.derive(s).xpPerSec, better);
    const old = E.migrate({ version: 8, path: { learned: 2 } });
    assert.deepEqual(old.path.legBest, []);
    assert.equal(E.derive(old).xpPerSec, base, 'older saves start from a plain cresting run');
});

test('skills add pushes and glide as well as strength', () => {
    const s = fresh();
    const base = E.derive(s);
    s.path.learned = 12;
    const d = E.derive(s);
    assert.ok(d.pushesPerRoll >= base.pushesPerRoll + 3);
    assert.ok(d.friction < base.friction);
    assert.ok(d.pushPower > base.pushPower * 3);
});

test('skills and lab upgrades have a short quip and a plain effect too', () => {
    for (let i = 0; i < 20; i++) {
        const k = E.skillAt(i);
        assert.ok(k.flavor && k.flavor.length <= 70 && k.effect, `skill ${i}`);
    }
    for (const up of E.UPGRADES) assert.ok(up.flavor && up.flavor.length <= 70, `${up.id} has a quip`);
});

test('automation is earned: a skill and proof of doing the job by hand', () => {
    const s = fresh();
    s.res.cp = 1e6; s.res.dp = 1e6; s.res.rp = 1e6;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.cpu), false, 'CPU waits for compute by hand');
    s.stats.clicks = 40;
    s.levels.keyboard = 7;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.cpu), true);
    s.path.learned = 3;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoCollector), false, 'the skill alone is not enough');
    assert.deepEqual(E.automationGate(s, 'autoCollector').done, 0);
    s.unlocked['action:collect'] = true;
    for (let i = 0; i < 100; i++) E.act(s, 'collect');
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.autoCollector), true);
    s.levels.autoCollector = 1;
    assert.ok(Math.abs(E.derive(s).collectsPerSec - 0.2) < 1e-9 || E.derive(s).autoThrottled, 'starts slow');
});

test('top-bar resources and attributes are revealed once they matter', () => {
    const s = fresh();
    assert.equal(E.evaluate(s).reveals.length, 0);
    s.res.dp = 1;
    s.attr.intelligence = 1;
    assert.deepEqual(E.evaluate(s).reveals.map(r => r.key), ['seen:dp', 'seen:int']);
    assert.equal(E.evaluate(s).reveals.length, 0, 'only once');
});

test('investor projects: offers arrive over time, track progress, pay out training XP, and expire', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.stats.playTime = E.PROJECTS.firstAt;
    E.tick(s, 1);
    assert.equal(s.projects.offers.length, 0, 'investors come with Research: nothing until it is open');
    s.unlocked['action:research'] = true;
    s.stats.playTime = 0;
    E.tick(s, 1);
    assert.equal(s.projects.offers.length, 0, 'nothing before the first offer time');
    s.stats.playTime = E.PROJECTS.firstAt;
    E.tick(s, 1);
    assert.equal(s.projects.offers.length, 1);
    const o = s.projects.offers[0];
    assert.equal(E.projectProgress(s, o), 0, 'progress counts from when it arrived');
    assert.equal(E.claimProject(s, o.id).ok, false, 'not finished');
    // Finish it by moving its stat on.
    const stat = { computes: 'clicks', collects: 'collects', runs: 'rolls', clean: 'cleanSprints', earnCp: 'runCp', research: 'researchManual' }[o.task];
    s.stats[stat] += o.target;
    const before = { xp: s.res.xp };
    const r = E.claimProject(s, o.id);
    assert.equal(r.ok, true, r.msg);
    assert.equal(s.projects.offers.length, 0);
    const reward = E.PROJECT_REWARDS[o.reward];
    if (reward.boost) assert.equal(s.projects.boosts.length, 1);
    else assert.ok(s.res.xp > before.xp, 'a training grant');
    assert.ok(E.PROJECT_REWARDS.every(x => x.boost === 'xp' || x.grant === 'xp'), 'investors fund training: every reward is XP');
    // Deadlines: an unclaimed offer disappears.
    s.stats.playTime = s.projects.next;
    E.tick(s, 1);
    const late = s.projects.offers[0];
    s.stats.playTime = late.deadline + 1;
    E.tick(s, 1);
    assert.ok(!s.projects.offers.some(x => x.id === late.id), 'expired');
});

test('project boosts multiply production while they last', () => {
    const s = fresh();
    s.levels.cpu = 10;
    const base = E.derive(s).cpPerSec;
    s.projects.boosts.push({ stat: 'cp', mult: 1.5, until: s.stats.playTime + 60 });
    assert.ok(Math.abs(E.derive(s).cpPerSec - base * 1.5) < 1e-9);
    s.stats.playTime += 61;
    assert.ok(Math.abs(E.derive(s).cpPerSec - base) < 1e-9);
});

test('v2 saves load with empty projects; bad project data is dropped', () => {
    const v2 = E.migrate({ version: 2, res: { cp: 50 }, path: { learned: 2 } });
    assert.equal(v2.res.cp, 50);
    assert.equal(v2.path.learned, 3, 'with the warm-up leg in front');
    assert.deepEqual(v2.projects.offers, []);
    const bad = E.migrate({ version: 3, projects: { offers: [{ id: 1, task: 'nope' }, 'x'], boosts: [{ stat: 'cp', mult: -1, until: 5 }] } });
    assert.deepEqual(bad.projects.offers, []);
    assert.deepEqual(bad.projects.boosts, []);
});

test('cleared stretches add no compute: their laps only train (XP/s)', () => {
    const s = fresh();
    s.levels.cpu = 10;
    s.path.learned = 2;
    s.path.auto = [0, 0];
    const before = E.derive(s).cpPerSec;
    E.tick(s, E.clearedPeriod(0) * 10);
    assert.ok(Math.abs(s.path.auto[0] - 10) < 1e-6, 'laps accumulate with time');
    assert.equal(E.derive(s).cpPerSec, before);
    assert.ok(E.derive(s).xpPerSec > 0);
});

test('v3 saves load with no automated laps', () => {
    const v3 = E.migrate({ version: 3, path: { learned: 2, best: 0.3 } });
    assert.deepEqual(v3.path.auto, [0], 'the warm-up leg in front, no laps yet');
    assert.equal(v3.path.learned, 3);
});

test('replays: cleared legs push cheaper, pay a share of their XP, and never teach or set records', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.path.learned = 3;
    s.path.best = 0.4;
    // Push costs follow the leg the ball is on.
    assert.ok(E.pushCost(s, 1, 0).cp < E.pushCost(s, 1, 2).cp);
    assert.deepEqual(E.pushCost(s, 1), E.pushCost(s, 1, 3));
    // Clearing a cleared leg's hill again pays flat XP, more for later legs; the frontier pays none.
    assert.ok(E.legClearXp(s, 0) > 0 && E.legClearXp(s, 2) > E.legClearXp(s, 0));
    assert.equal(E.legClearXp(s, 3), 0);
    const xp0 = s.res.xp;
    E.clearLeg(s, 1);
    assert.ok(s.res.xp > xp0);
    assert.equal(s.stats.legsCleared, 1);
    // A metre is a metre: distance on a cleared leg pays the frontier's rate times the replay share.
    assert.ok(Math.abs(E.rollXp(s, 0.5, false, 0, 10, 2) - E.rollXp(s, 0.5, false, 0, 10, 3) * E.PATH.replayXp) < 1e-9);
    // And a clean sprint on a cleared leg is worth the frontier's, times the replay share.
    assert.ok(Math.abs(E.pushBonusXp(s, 'clean', 0) - E.pushBonusXp(s, 'clean') * E.PATH.replayXp) < 1e-9);
    // Stopping on a cleared leg: XP, but no record and no skill even if "crested".
    const r = E.finishRoll(s, 0.9, true, 0, 0, 1);
    assert.equal(r.skill, null);
    assert.equal(r.record, false);
    assert.equal(s.path.learned, 3);
    assert.equal(s.path.best, 0.4);
    // Reaching the frontier leg on a replay counts as a normal frontier run.
    const f = E.finishRoll(s, 1, true, 0, 0, 3);
    assert.ok(f.skill);
    assert.equal(s.path.learned, 4);
});

test('data automation opens with Pattern Matching (the 40 collections the server room needed)', () => {
    const s = fresh();
    s.stats.collects = 40;
    assert.equal(E.automationGate(s, 'autoCollector').met, false);
    s.path.learned = 1;
    assert.equal(E.automationGate(s, 'autoCollector').met, false, 'the warm-up skill is not enough');
    s.path.learned = 2;
    assert.equal(E.automationGate(s, 'autoCollector').met, true);
});

test('luck: breakthroughs and viral runs start at zero, grow with levels, and are deterministic per seed', () => {
    const s = fresh();
    const rate = hit => { let n = 0; for (let seed = 1; seed <= 2000; seed++) n += hit(seed) ? 1 : 0; return n / 2000; };
    assert.equal(rate(seed => E.breakthroughHit(s, seed, 0)), 0);
    assert.equal(rate(seed => E.windfallHit(s, seed)), 0);
    s.levels.scoutingData = 1;
    const low = rate(seed => E.breakthroughHit(s, seed, 0));
    assert.ok(low > 0.025 && low < 0.06, `uncommon at first: ${low}`);
    s.levels.scoutingData = 2;
    s.levels.satelliteMaps = 2;
    s.levels.blackSwan = 1;
    const high = rate(seed => E.breakthroughHit(s, seed, 1));
    assert.ok(high > 2 * low, `likelier with levels: ${high}`);
    assert.equal(E.breakthroughHit(s, 77, 2), E.breakthroughHit(s, 77, 2), 'deterministic');
    const weak = E.derive(fresh()).critMult;
    assert.ok(E.derive(s).critMult > weak, 'and stronger');
    assert.ok(Math.abs(E.sprintStrength(s, 1, null, true) / E.sprintStrength(s, 1) - E.derive(s).critMult) < 1e-9);
    // Viral runs are legacy only (Press Office).
    assert.ok(!E.UPGRADES.some(u => u.tab === 'training' && u.boost && ('windfallChance' in u.boost || 'crunchChance' in u.boost)), 'viral runs and crunches are legacy only');
    s.prestige.levels.pressOffice = 3;
    const viral = rate(seed => E.windfallHit(s, seed));
    assert.ok(viral > 0.06 && viral < 0.12, `viral ${viral}`);
    const plain = E.finishRoll(fresh(), 0.5, false, 0, 5).xp;
    const t = fresh();
    t.prestige.levels.pressOffice = 2;
    assert.ok(Math.abs(E.finishRoll(t, 0.5, false, 0, 5, 0, true).xp / plain - E.derive(t).windfallMult) < 1e-9);
});

test('the sweet spot widens only a little (Prompt Templates); hitting it makes the sprint stronger, super prompts most', () => {
    const s = fresh();
    assert.equal(E.derive(s).zoneWidth, 0, 'no clean prompts until Hyperparameter Search');
    s.levels.precisionTuning = 1;
    const width = E.derive(s).zoneWidth;
    assert.ok(width > 0);
    for (const up of E.UPGRADES.filter(u => u.tab === 'training')) s.levels[up.id] = up.max || 1;
    assert.ok(E.derive(s).zoneWidth > width && E.derive(s).zoneWidth <= 1.5 * width, 'a little wider at most');
    assert.ok(E.derive(s).perfectWidth < E.derive(s).zoneWidth / 2, 'the super prompt spot stays small');
    const plain = E.sprintStrength(s, 0.7);
    const clean = E.sprintStrength(s, 0.7, 'clean');
    const perfect = E.sprintStrength(s, 0.7, 'perfect');
    assert.ok(clean > 1.15 * plain && perfect > 1.3 * clean, `${plain} ${clean} ${perfect}`);
});

test('no two nodes growing from the same node upgrade the same thing', () => {
    const kids = {};
    for (const up of E.UPGRADES.filter(u => u.tab === 'training' && u.requires)) (kids[up.requires] ||= []).push(up);
    for (const list of Object.values(kids)) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const same = Object.keys(list[i].boost || {}).filter(k => k in (list[j].boost || {}));
            assert.deepEqual(same, [], `${list[i].name} & ${list[j].name}`);
        }
    }
});

test('no skill-tree node upgrades the same thing as the node it grows from', () => {
    for (const up of E.UPGRADES.filter(u => u.tab === 'training' && u.requires)) {
        const parent = Object.keys(E.UPGRADE_BY_ID[up.requires].boost || {});
        const same = Object.keys(up.boost || {}).filter(k => parent.includes(k));
        assert.deepEqual(same, [], `${E.UPGRADE_BY_ID[up.requires].name} → ${up.name}`);
    }
});

test('Fast Charging holds the meter at full instead of speeding it up', () => {
    const s = fresh();
    assert.equal(E.derive(s).chargeHold, 0);
    s.levels.gpuCluster2 = 2;
    s.levels.warmRestarts = 1;
    assert.ok(Math.abs(E.derive(s).chargeHold - 0.5) < 1e-9, 'half a second at full');
});

test('luck is earned: the branch opens after two skills; crunches (legacy) and Max Effort start at zero and grow', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.levels.initialWeights = 1;
    s.levels.trainingOptimizer = 2;
    s.levels.gpuCluster2 = 2;
    E.evaluate(s);
    s.path.learned = 2;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.scoutingData), false, 'hidden before the second skill past the warm-up');
    s.path.learned = 3;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.scoutingData), true);
    const rate = hit => { let n = 0; for (let seed = 1; seed <= 2000; seed++) n += hit(seed) ? 1 : 0; return n / 2000; };
    assert.equal(rate(seed => E.crunchHit(s, seed, 0)), 0);
    assert.equal(rate(seed => E.maxEffortHit(s, seed, 0)), 0);
    assert.equal(E.derive(s).crunchSeconds, 0);
    s.prestige.levels.hackathon = 1;
    s.levels.maxEffort = 1;
    const crunch = rate(seed => E.crunchHit(s, seed, 0));
    const effort = rate(seed => E.maxEffortHit(s, seed, 0));
    assert.ok(crunch > 0.015 && crunch < 0.05, `crunch: ${crunch}`);
    assert.ok(effort > 0.03 && effort < 0.075, `Max Effort: ${effort}`);
    assert.equal(E.derive(s).crunchSeconds, 4);
    s.prestige.levels.hackathon = 3;
    assert.equal(E.derive(s).crunchSeconds, 6, 'Hackathon makes crunches longer');
});

test('the engine\'s leg lengths match the physics, so "a full stretch" of XP is what reaching its peak pays', () => {
    const T = require('../training-path.js');
    for (let k = 0; k < 12; k++) {
        const g = T.terrain(k, 1);
        assert.ok(Math.abs(E.legMetres(k) - g.legLength(k)) < 1e-9, `leg ${k}`);
        const s = fresh();
        s.path.learned = k;
        assert.ok(Math.abs(E.rollXp(s, 1, false, 0, g.legLength(k)) - E.stretchXpAt(k)) < 1e-9);
    }
});

test('hardware is a spaced-out ladder: each tier costs more per CP/s but gives more per purchase, and doubles at milestones', () => {
    const tiers = E.UPGRADES.filter(u => u.cps);
    assert.deepEqual(tiers.map(u => u.id), ['cpu', 'server', 'quantum', 'neural', 'datacenter', 'optical']);
    for (let i = 1; i < tiers.length; i++) {
        const [a, b] = [tiers[i - 1], tiers[i]];
        // Spaced out: a new tier is about 3x worse value than the one below when it appears, so the
        // older tier stays worth buying for a while instead of going stale at once.
        const ratio = (b.cost.cp / b.cps) / (a.cost.cp / a.cps);
        assert.ok(ratio > 2.5 && ratio < 3.5, `${b.id} pays back about 3x slower than ${a.id} (${ratio.toFixed(2)})`);
        assert.ok(b.cps >= 5 * a.cps, `${b.id} gives far more per purchase`);
        assert.ok(Math.abs(b.cost.cp / a.cost.cp - 20) < 1e-9, `${b.id} costs 20x ${a.id}`);
    }
    const s = fresh();
    s.levels.cpu = 24;
    const before = E.derive(s).cpPerSec;
    s.levels.cpu = 25;
    assert.ok(Math.abs(E.derive(s).cpPerSec / before - 2 * 25 / 24) < 1e-9, 'doubles at 25 owned');
    // Server Cluster doesn't touch clicks; the click tool does, in round numbers.
    const t = fresh();
    const click = E.derive(t).clickPower;
    t.levels.server = 10;
    assert.equal(E.derive(t).clickPower, click);
    t.levels.keyboard = 5;
    assert.equal(E.derive(t).clickPower, click + 2, 'the desk and server rack: 1 → 3 per click');
    t.levels.compilerOpt = 1;
    const u = fresh();
    u.levels.server = 10;
    assert.ok(Math.abs(E.derive(t).cpPerSec / E.derive(u).cpPerSec - 1.5) < 1e-9, 'Compiler Optimizations +50%');
});

test('a hardware tier shows up only once you own ten of the tier below and earned its price', () => {
    const s = fresh();
    s.stats.clicks = 30;
    s.stats.rolls = 1;                          // and only once the first training run is done
    s.levels.cpu = 9;
    s.stats.runCp = 1e9;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.server), false, 'needs 10 Basic CPUs');
    s.levels.cpu = 10;
    s.stats.runCp = E.UPGRADE_BY_ID.server.cost.cp - 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.server), false, 'needs its price earned');
    s.stats.runCp += 1;
    E.evaluate(s);
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.server), true);
    // Each tier's live yield includes every multiplier.
    s.levels.server = 2;
    const d = E.derive(s);
    assert.ok(Math.abs(d.hardwareRates.server.total + d.hardwareRates.cpu.total - d.cpPerSec) < 1e-9);
    assert.equal(d.hardwareRates.cpu.nextDoubling, 25);
});

test('the click tool starts with your desk, one item each, then grows per level; the first generator comes after', () => {
    const s = fresh();
    s.stats.clicks = 40;
    E.evaluate(s);
    const up = E.UPGRADE_BY_ID.keyboard;
    assert.equal(E.upgradeName(s, up), 'Desktop Tower');
    assert.deepEqual(E.CLICK_TOOLS.slice(0, 5).map(t => t.name), ['Desktop Tower', 'Mechanical Keyboard', 'Gaming Mouse', 'Monitor', 'Server Rack'], 'the desk comes first');
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(l => E.upgradeCost(up, l).cp), [25, 45, 45, 75, 100, 132], 'hand-priced, then x1.32');
    assert.equal(E.clickToolPower(4), 1, 'tower, keyboard, mouse and monitor take a click to 2 CP');
    assert.equal(E.clickToolPower(5), 2, 'the server rack adds +1');
    s.res.cp = 1e9;
    const seen = [];
    for (let i = 0; i < 5; i++) {
        assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.cpu), false, `no generator before the server rack (level ${i})`);
        seen.push(E.buy(s, 'keyboard').evolved);
        E.evaluate(s);
    }
    assert.deepEqual(seen, ['Mechanical Keyboard', 'Gaming Mouse', 'Monitor', 'Server Rack', 'Macro Pad'], 'one level each');
    assert.equal(E.isUpgradeVisible(s, E.UPGRADE_BY_ID.cpu), true, 'the Graphics Card shows after the server rack');
    assert.equal(E.UPGRADE_BY_ID.cpu.name, 'Graphics Card');
    // Every stage adds at least as much per level as the last, and the names are all different.
    for (let i = 1; i < E.CLICK_TOOLS.length; i++) assert.ok(E.CLICK_TOOLS[i].per >= E.CLICK_TOOLS[i - 1].per);
    assert.equal(new Set(E.CLICK_TOOLS.map(t => t.name)).size, E.CLICK_TOOLS.length);
    assert.ok(Math.abs(E.derive(s).clickPower - (1 + E.clickToolPower(5)) * E.derive(s).mult) < 1e-9);
    // Achievements carry no bonus, so a click stays exactly 1.
    const f = fresh();
    E.act(f, 'compute');
    E.evaluate(f);
    assert.equal(E.derive(f).clickPower, 1);
    f.achievements.cp1k = true;
    assert.equal(E.derive(f).clickPower, 1, 'achievements carry no bonus');
    assert.equal(E.derive(f).mult, 1);
});

test('the server room waits until you can train: data collected by hand and a stockpile built', () => {
    const s = fresh();
    s.stats.runCp = 1e4;
    s.res.cp = 1000;
    E.evaluate(s);
    assert.equal(!!s.unlocked['module:path'], false, 'compute alone is not enough');
    s.stats.collects = 40;
    s.res.dp = 39;
    E.evaluate(s);
    assert.equal(!!s.unlocked['module:path'], false, 'a stockpile of data comes first');
    s.res.dp = 40;
    E.evaluate(s);
    assert.equal(s.unlocked['module:path'], true);
});

test('the lab splits by resource: hardware is compute, software is data, research lives on the research wall', () => {
    const tab = id => E.UPGRADE_BY_ID[id].tab;
    for (const id of ['cpu', 'server', 'keyboard', 'compilerOpt', 'kernelFusion']) assert.equal(tab(id), 'hardware', id);
    for (const id of ['dataProcessor', 'autoCollector', 'nlp', 'computerVision']) assert.equal(tab(id), 'software', id);
    assert.equal(tab('researchAssistant'), 'algorithms');
    const s = fresh();
    s.levels.machineLearning = 1;
    const base = E.derive(s).rpPerResearch;
    s.projects.boosts.push({ stat: 'rp', mult: 2, until: s.stats.playTime + 60 });
    assert.ok(Math.abs(E.derive(s).rpPerResearch - 2 * base) < 1e-9, 'research boosts work');
});

test('chains: each cleared hill crossed in a run multiplies what the run earns afterwards', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.path.learned = 4;
    assert.equal(E.chainMult(0), 1);
    assert.equal(E.chainMult(3), 1 + 3 * E.PATH.chainBonus);
    const before = s.res.xp;
    const first = E.clearLeg(s, 0, 0);
    const third = E.clearLeg(s, 0, 2);
    assert.ok(Math.abs(third - first * E.chainMult(2)) < 1e-9);
    assert.ok(s.res.xp > before);
    const plain = E.finishRoll(fresh(), 0.5, false, 0, 5).xp;
    const t = fresh();
    assert.ok(Math.abs(E.finishRoll(t, 0.5, false, 0, 5, 0, false, 3).xp - plain * E.chainMult(3)) < 1e-9, 'the distance at the end too');
});

test('versions: shipping one keeps Insight, legacy nodes and their effects; numbering follows the jump', () => {
    const s = fresh();
    s.attr.intelligence = 10;
    s.path.learned = 9;
    s.levels.gpuCluster2 = 1;
    assert.equal(E.currentVersion(s), 'v1.0');
    assert.equal(E.nextVersion(s).isMajor, true, 'the first release with 3+ Insight is a major one');
    const gain = E.prestigeGain(s);
    const r = E.prestige(s, NOW);
    assert.equal(r.version, 'v2.0');
    const t = r.state;
    assert.equal(t.prestige.points, gain);
    assert.equal(t.levels.gpuCluster2, undefined, 'the run starts over');
    // Legacy upgrades cost Insight, show on their own screen from the first new version, and stay owned.
    E.evaluate(t);
    assert.equal(E.isUpgradeVisible(t, E.UPGRADE_BY_ID.headStart), true, 'no skill-tree parent needed');
    assert.equal(E.isUpgradeVisible(t, E.UPGRADE_BY_ID.deepFocus), false, 'an earlier legacy upgrade maxed first');
    const before = E.derive(t).cleanPower;
    assert.equal(E.buy(t, 'muscleMemory').ok, true);
    assert.equal(t.prestige.points, gain - 1);
    assert.ok(E.derive(t).cleanPower > before);
    assert.ok(Math.abs(E.derive(t).mult - E.insightMult(gain)) < 1e-9, 'spending Insight keeps its production bonus');
    t.attr.intelligence = 10;
    t.path.learned = 5;
    const small = E.prestige(t, NOW);
    assert.equal(small.version, 'v2.1', 'a small gain is a point release');
    const u = small.state;
    assert.equal(E.level(u, 'muscleMemory'), 1, 'legacy levels survive');
    u.unlocked['module:path'] = true;
    E.evaluate(u);
    assert.equal(E.isUpgradeVisible(u, E.UPGRADE_BY_ID.muscleMemory), true, 'and stay visible without their parent');
    assert.ok(E.derive(u).pushPower > E.derive(fresh()).pushPower);
});

test('legacy nodes stay hidden until the first new version, and old saves move theirs to the version', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    for (const up of E.UPGRADES.filter(u => u.tab === 'training' && !u.legacy)) s.levels[up.id] = up.max || 1;
    s.path.learned = 5;
    E.evaluate(s);
    for (const up of E.UPGRADES.filter(u => u.legacy)) assert.equal(E.isUpgradeVisible(s, up), false, `${up.id} hidden in the first version`);
    for (const up of E.UPGRADES.filter(u => u.legacy)) assert.ok(up.cost.insight > 0 && !up.cost.xp, `${up.id} costs Insight`);
    const old = E.migrate({ version: 4, levels: { autoTrainer: 2, flowState: 2 }, prestige: { points: 1, total: 1, count: 1 } }, NOW);
    assert.equal(old.prestige.levels.autoTrainer, 2);
    assert.equal(old.levels.autoTrainer, undefined);
    assert.equal(old.levels.maxEffort, 1, 'the old Flow State (next sprint perfect) is Max Effort now (capped at its one level)');
    assert.equal(E.level(old, 'flowState'), 0);
    assert.equal(old.prestige.major, 2);
});

test('prompts: system inside super inside clean; each pays and hits harder; supers and flow are legacy', () => {
    const s = fresh();
    s.levels.precisionTuning = 1;
    s.levels.perfectCalibration = 1;
    s.prestige.levels.systemPrompt = 1;
    const d = E.derive(s);
    assert.ok(d.systemWidth > 0 && d.systemWidth <= d.perfectWidth / 2);
    const z = E.bonusZone(9, 0, d.zoneWidth, d.perfectWidth, d.systemWidth);
    const mid = (z.systemFrom + z.systemTo) / 2;
    assert.equal(E.zoneHit(z, mid), 'system');
    assert.equal(E.zoneHit(z, z.perfectFrom + 1e-6), 'perfect');
    assert.equal(E.zoneHit(z, z.from + 1e-6), 'clean');
    assert.equal(E.cleanUnits('system'), 50);
    assert.ok(E.sprintStrength(s, 0.7, 'system') > E.sprintStrength(s, 0.7, 'perfect'));
    assert.ok(Math.abs(E.sprintStrength(s, 1, null, false, true) / E.sprintStrength(s, 1) - d.maxEffortMult) < 1e-9);
    const t = fresh();
    assert.equal(E.derive(t).flowSeconds, 0);
    assert.equal(E.superHit(t, 'breakthrough', 3, 0), false);
    t.prestige.levels.flowState = 1;
    t.prestige.levels.paradigmShift = 1;
    assert.equal(E.derive(t).flowSeconds, 3);
    const rate = hit => { let n = 0; for (let seed = 1; seed <= 2000; seed++) n += hit(seed) ? 1 : 0; return n / 2000; };
    const sup = rate(seed => E.superHit(t, 'breakthrough', seed, 0));
    assert.ok(sup > 0.18 && sup < 0.32, `25% of breakthroughs are super: ${sup}`);
});

test('Collect Data stays hidden until compute reaches 5 CP/s', () => {
    const s = fresh();
    s.res.cp = 1000;
    s.levels.cpu = 9;
    E.evaluate(s);
    assert.ok(E.derive(s).cpPerSec < 5);
    assert.equal(E.act(s, 'collect').ok, false);
    s.levels.cpu = 10;
    E.evaluate(s);
    assert.equal(E.act(s, 'collect').ok, true);
    // Saves that had already collected keep it.
    const old = fresh();
    old.stats.collects = 3;
    E.evaluate(old);
    assert.equal(!!old.unlocked['action:collect'], true);
});

test('a node never costs as little as the last level of the node it grows from', () => {
    // Otherwise the next node is a better buy than finishing its parent (Lucky Break 2 vs Serendipity).
    for (const n of E.UPGRADES.filter(u => u.tab === 'training' && u.cost.xp && u.requires)) {
        const parent = E.UPGRADE_BY_ID[n.requires];
        if (!parent.cost.xp) continue;
        const last = E.upgradeCost(parent, (parent.max || 1) - 1).xp;
        assert.ok(n.cost.xp > last, `${n.id} (${n.cost.xp}) must cost more than ${parent.id}'s last level (${last})`);
    }
});

test('hand actions pay whole numbers; percentage bonuses go to automation', () => {
    const s = fresh();
    s.path.learned = 6;                 // skills with +% data and research
    s.prestige.total = 3;               // Insight ×1.3
    s.levels.keyboard = 9;
    s.levels.dataProcessor = 2;
    s.levels.machineLearning = 1;
    s.levels.autoCollector = 2;
    s.levels.cpu = 20;
    const d = E.derive(s);
    for (const k of ['clickPower', 'dpPerCollect', 'rpPerResearch']) assert.equal(d[k] % 1, 0, `${k} is ${d[k]}`);
    assert.ok(d.autoDpPerCollect > d.dpPerCollect, 'the crawler gets the +% data and Insight');
});

test('cresting the frontier mid-run learns the skill and pays the leg at the crest bonus, times the chain', () => {
    const s = fresh();
    const metres = E.legMetres(0);
    const plain = E.rollXp(s, 1, true, 0, metres, 0);
    const { xp, skill } = E.crestSkill(s, metres, 0, 1);
    assert.equal(skill.name, E.skillAt(0).name);
    assert.equal(s.path.learned, 1);
    assert.ok(Math.abs(xp - plain * E.chainMult(1)) < 1e-9);
});

test('a tampered save is cleaned, never crashes or freezes, and non-object JSON never imports', () => {
    const s = E.migrate({ version: 7, levels: { constructor: 3, toString: 2 },
        path: { learned: 1e7 }, prestige: { total: 1e300, points: 0 },
        projects: { offers: [{ id: 1, task: 'constructor', reward: 0, investor: '', target: 1, start: 0, deadline: 1e9 },
            { id: 2, task: Object.keys(E.PROJECT_TASKS)[0], reward: 'length', investor: '', target: 1, start: 0, deadline: 1e9 }] } }, NOW);
    assert.deepEqual(s.levels, {});
    assert.equal(s.projects.offers.length, 0);
    assert.ok(s.path.learned <= 500);
    E.tick(s, 10);
    assert.ok(Number.isFinite(s.res.cp));
    for (const json of ['1', 'null', '[]', '"x"']) assert.equal(E.deserialize(json, NOW), null, json);
});

test('a timed boost covers only its own seconds of a long tick', () => {
    const base = E.defaultState(NOW);
    base.levels.cpu = 10;
    const plain = JSON.parse(JSON.stringify(base));
    base.projects.boosts.push({ stat: 'cp', mult: 2, until: base.stats.playTime + 1 });
    E.tick(base, 3600);
    E.tick(plain, 3600);
    const rate = E.derive(plain).cpPerSec;
    assert.ok(Math.abs(base.res.cp - plain.res.cp - rate) < 1e-6 * plain.res.cp);
});

test('shipping a version waits the first-offer delay again', () => {
    const s = fresh();
    s.stats.playTime = 50000;
    s.path.learned = 8;
    s.attr.intelligence = 100;
    const r = E.prestige(s, NOW);
    assert.ok(r.ok);
    assert.equal(r.state.projects.next, 50000 + E.PROJECTS.firstAt);
});

test('numbers format cleanly at tier edges and in error states', () => {
    assert.equal(E.format(999999.5), '1.00M');
    assert.equal(E.format(9.96), '10');
    assert.equal(E.format(-Infinity), '-∞');
    assert.equal(E.format(NaN), '—');
    assert.equal(E.formatDuration(Infinity), '∞');
});

test('the lab feeds training: research and data buy training strength, sprints and XP', () => {
    const s = fresh();
    const base = E.derive(s);
    s.levels.machineLearning = 1;
    assert.ok(E.derive(s).xpMult > base.xpMult, 'Machine Learning: training XP');
    s.levels.deepLearning = 1;
    assert.ok(E.derive(s).pushPower > base.pushPower, 'Deep Learning: sprint strength');
    s.levels.reinforcementLearning = 1;
    assert.equal(E.derive(s).pushesPerRoll, base.pushesPerRoll + 1, 'Reinforcement Learning: a sprint per run');
    const papers = E.UPGRADE_BY_ID.publications;
    assert.ok(papers.cost.rp && !papers.cost.cp && papers.max == null, 'Published Papers: an endless research sink');
    const data = E.UPGRADE_BY_ID.trainingData;
    assert.equal(data.tab, 'software');
    assert.ok(data.cost.dp && data.max == null && data.boost.push > 0, 'the Training Data Pipeline: an endless data sink');
});

test('Scale Up: the endless node multiplies sprint strength, with a geometric price', () => {
    const up = E.UPGRADE_BY_ID.scaleUp;
    assert.ok(up.endless && up.max == null);
    const s = fresh();
    const one = E.derive(s).pushPower;
    s.levels.scaleUp = 5;
    assert.ok(Math.abs(E.derive(s).pushPower / one - Math.pow(1.1, 5)) < 1e-9);
    assert.ok(E.upgradeCost(up, 10).xp > 50 * E.upgradeCost(up, 0).xp);
    const parent = E.UPGRADE_BY_ID[up.requires];
    assert.ok(up.cost.xp > E.upgradeCost(parent, parent.max - 1).xp, 'dearer than the end of the strength line');
});

test('Insight comes from skills learned and its bonus diminishes', () => {
    const s = fresh();
    s.attr.intelligence = 50;
    s.path.learned = 7;
    assert.equal(E.prestigeGain(s), 5, 'General AI (6 skills past the warm-up) ships for 5');
    s.path.learned = 11;
    assert.equal(E.prestigeGain(s), 12);
    s.stats.runCp = 1e15;
    assert.equal(E.prestigeGain(s), 12, 'compute earned no longer counts');
    const step = n => E.insightMult(n + 10) - E.insightMult(n);
    assert.ok(step(0) > step(100), 'each Insight is worth less the more you have');
    assert.ok(E.insightMult(100) <= 2, 'no runaway: ×1.7 at 100 Insight');
});

test('removed skill-tree nodes (viral runs, crunches) refund their XP on load', () => {
    const s = E.migrate({ version: 7, res: { xp: 10 }, levels: { crunchTime: 2, viralPaper: 1 } }, NOW);
    assert.equal(s.res.xp, 10 + 400 + 800 + 650);
    assert.equal(s.levels.crunchTime, undefined);
    const again = E.migrate(JSON.parse(E.serialize(s)), NOW);
    assert.equal(again.res.xp, s.res.xp, 'once');
});

test('bulk buying: ×N prices add up level by level, Max buys what you can afford, one-time cards stop at their max', () => {
    const s = fresh();
    s.unlocked['up:cpu'] = true;
    const cpu = E.UPGRADE_BY_ID.cpu;
    const ten = E.bulkCost(s, cpu, 10).cp;
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += E.upgradeCost(cpu, i).cp;
    assert.equal(ten, sum);
    s.res.cp = ten;
    assert.equal(E.maxAffordable(s, cpu), 10);
    const r = E.buyMany(s, 'cpu', 10);
    assert.equal(r.ok, true);
    assert.equal(r.count, 10);
    assert.equal(E.level(s, 'cpu'), 10);
    assert.ok(s.res.cp >= 0 && s.res.cp < E.upgradeCost(cpu, 10).cp);
    assert.equal(E.maxAffordable(s, cpu), 0);
    assert.equal(E.buyMany(s, 'cpu', 5).ok, false, 'nothing affordable');
    const opt = E.UPGRADE_BY_ID.compilerOpt;
    assert.deepEqual(E.bulkCost(s, opt, 10), E.upgradeCost(opt, 0), 'a one-time card prices one level');
});

test('number notation: standard suffixes, scientific and engineering; settings survive a save', () => {
    try {
        assert.equal(E.format(1234567), '1.23M');
        E.setNotation('scientific');
        assert.equal(E.format(1234567), '1.23e6');
        assert.equal(E.format(999), '999', 'small numbers stay plain');
        E.setNotation('engineering');
        assert.equal(E.format(1234567), '1.23e6');
        assert.equal(E.format(12345678), '12.3e6');
    } finally {
        E.setNotation('standard');
    }
    const s = fresh();
    Object.assign(s.settings, { notation: 'scientific', sound: 0.25, shake: false });
    assert.deepEqual(E.deserialize(E.serialize(s), NOW).settings, s.settings);
    const bad = E.migrate({ version: 8, settings: { notation: 'roman', sound: 7, shake: 'yes' } }, NOW).settings;
    assert.deepEqual([bad.notation, bad.sound, bad.shake], ['standard', 1, true]);
});

test('a leg\'s best run is stored without XP multipliers, which apply to passive XP live', () => {
    const s = fresh();
    s.path.learned = 2;
    const plain = E.derive(s).xpPerSec;
    // A run under an investor ×2 boost doesn't double that leg's passive XP for good.
    s.projects.boosts.push({ stat: 'xp', mult: 2, until: s.stats.playTime + 60 });
    const boosted = E.derive(s).xpPerSec;
    assert.ok(Math.abs(boosted - 2 * plain) < 1e-9, 'the boost reaches passive XP while it runs');
    E.recordRun(s, 0, 2 * E.stretchXpAt(0) * 2);   // a plain cresting run, doubled by the boost
    s.projects.boosts = [];
    assert.ok(Math.abs(E.derive(s).xpPerSec - plain) < 1e-9, 'no lasting gain from the boost');
    // A viral run doesn't either.
    E.recordRun(s, 1, 2 * E.stretchXpAt(1) * 3, 3);
    assert.ok(Math.abs(E.derive(s).xpPerSec - plain) < 1e-9);
    // Older saves' best runs had the multipliers in: v10 divides them out.
    const old = E.migrate({ version: 9, path: { learned: 2, legBest: [10, 20] }, prestige: { total: 100 } });
    const m = E.derive(old).xpMult;
    assert.ok(m > 1);
    assert.ok(Math.abs(old.path.legBest[1] - 20 / m) < 1e-9);
});

test('finished investor offers wait to be claimed; grants ignore a running boost', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.unlocked['action:research'] = true;
    const o = E.makeOffer(s);
    s.projects.offers = [o];
    o.target = 1;
    o.start = E.PROJECT_TASKS[o.task].stat(s) - 1;   // done
    s.stats.playTime = o.deadline + 10;
    E.tick(s, 0.1);
    assert.ok(s.projects.offers.some(x => x.id === o.id), 'a finished offer outlives its deadline');
    const grant = E.PROJECT_REWARDS.find(r => r.grant === 'xp');
    const before = grant.amount(s);
    s.projects.boosts.push({ stat: 'xp', mult: 2, until: s.stats.playTime + 60 });
    assert.ok(Math.abs(grant.amount(s) - before) < 1e-9);
});

test('automation gates count hand work across versions; text size and calm settings are sanitized', () => {
    const s = fresh();
    s.stats.collects = 40;
    s.attr.intelligence = 100;
    s.path.learned = 8;
    const next = E.prestige(s, NOW).state;
    assert.equal(next.stats.collects, 0, 'this version starts counting again');
    assert.equal(next.stats.collectsEver, 40);
    next.path.learned = 2;
    assert.equal(E.automationGate(next, 'autoCollector').met, true, 'a gate met once stays met');
    const m = E.migrate({ version: 10, settings: { textSize: 7, calm: true } });
    assert.equal(m.settings.textSize, 1);
    assert.equal(m.settings.calm, true);
    assert.equal(E.migrate({ version: 10, settings: { textSize: 1.3 } }).settings.textSize, 1.3);
});

test('R&D status: the next skill count that raises Insight', () => {
    const s = fresh();
    s.path.learned = 7;
    const n = E.nextInsightAt(s);
    assert.ok(E.insightAt(n) > E.insightAt(7) && E.insightAt(n - 1) === E.insightAt(7));
});

test('challenges: open after three versions, ship into one, its rule holds until Superintelligence beats it for a perk', () => {
    const s = fresh();
    s.attr.intelligence = 30;
    s.path.learned = 8;
    assert.equal(E.startChallenge(s, 'lean', NOW).ok, false, 'closed before three versions');
    s.prestige.count = E.CHALLENGES_AFTER;
    const r = E.startChallenge(s, 'lean', NOW);
    assert.equal(r.ok, true);
    const v = r.state;
    assert.equal(v.challenge.id, 'lean');
    assert.equal(E.derive(v).pushesPerRoll, E.PATH.basePushes, 'sprints held at the base');
    v.attr.intelligence = 25;
    assert.equal(E.evaluate(v).challenge, null, 'General AI is not enough');
    Object.assign(v.attr, { intelligence: 100, creativity: 5, awareness: 5 });
    const out = E.evaluate(v);
    assert.equal(out.challenge.won, true);
    assert.equal(v.challenge, null);
    assert.equal(E.derive(v).pushesPerRoll, E.derive(fresh()).pushesPerRoll + 1, 'the perk: +1 sprint for good');
    // Kept across versions; a save keeps it; a bogus id doesn't load.
    const back = E.migrate(JSON.parse(E.serialize(v)));
    assert.equal(back.challengesDone.lean, true);
    assert.equal(E.migrate({ version: 11, challenge: { id: 'nope' } }).challenge, null);
});

test('challenge rules: no prompts, no automation, dear sprints, and a time limit that fails', () => {
    const s = fresh();
    s.levels.hyperparamSearch = 1;
    const base = { zone: E.derive(s).zoneWidth, cost: E.pushCost(s, 1).cp };
    s.challenge = { id: 'noPrompts', start: 0 };
    assert.equal(E.derive(s).zoneWidth, 0);
    s.challenge = { id: 'frugal', start: 0 };
    assert.ok(E.pushCost(s, 1).cp >= 3 * base.cost - 1);
    s.levels.autoCollector = 2;
    s.levels.cpu = 50;
    s.prestige.levels.autoTrainer = 1;
    s.path.learned = 3;
    s.challenge = { id: 'handmade', start: 0 };
    assert.equal(E.derive(s).collectsPerSec, 0);
    assert.equal(E.autoTrainerLevel(s), 0, 'no Auto-Trainer');
    assert.equal(E.derive(s).xpPerSec, 0, 'no passive leg XP');
    s.challenge = { id: 'speedrun', start: 0 };
    s.stats.playTime = 2401;
    const out = E.evaluate(s);
    assert.equal(out.challenge.won, false);
    assert.equal(s.challenge, null);
    assert.equal(s.challengesDone.speedrun, undefined);
});

test('Transcend: only at the Singularity; versions and Insight start over, Transcendence multiplies Insight', () => {
    const s = fresh();
    assert.equal(E.transcendGain(s), 0);
    s.prestige = { points: 50, total: 144, count: 3, major: 4, minor: 0, levels: { autoTrainer: 1 } };
    Object.assign(s.attr, { intelligence: 300, creativity: 30, awareness: 30 });
    s.challengesDone.lean = true;
    assert.equal(E.transcendGain(s), 6);
    const r = E.transcend(s, NOW);
    assert.equal(r.ok, true);
    const t = r.state;
    assert.equal(t.prestige.count, 0);
    assert.equal(t.prestige.total, 0);
    assert.deepEqual(t.prestige.levels, { autoTrainer: 1 }, 'only the Auto-Trainer stays');
    assert.equal(t.levels.keyboard, E.CPU_AFTER_CLICK_LEVEL, 'the desk stays built');
    assert.equal(t.transcend.total, 6);
    assert.equal(t.challengesDone.lean, true, 'challenges stay beaten');
    t.attr.intelligence = 30;
    t.path.learned = 8;
    assert.equal(E.prestigeGain(t), Math.floor(E.insightAt(8) * 4), '+50% Insight per point');
});

test('act two\'s first legs are shorter but pay what their full length did', () => {
    const full = k => E.PATH.xpPerMetre * Math.pow(E.PATH.metreScale, k) * ((10 * Math.pow(1.4, k - 1) + 3 * (k - 1)) + 0.55 * Math.pow(1.14, k - 1) * 8 - 0.2) * 2;
    for (const k of [E.ACT_TWO_LEG, E.ACT_TWO_LEG + 1, E.ACT_TWO_LEG + 2]) {
        const short = E.stretchXpAt(k);
        assert.ok(short > 0.9 * full(k) && short < 1.15 * full(k), `leg ${k}: ${short.toFixed(1)} vs ${full(k).toFixed(1)}`);
    }
});

test('Head Start racks hardware at the start of each version; Compute Moat compounds strength without limit', () => {
    const s = fresh();
    s.attr.intelligence = 30;
    s.path.learned = 8;
    s.prestige.levels.headStart = 2;
    const t = E.prestige(s, NOW).state;
    assert.equal(t.levels.cpu, 10);
    assert.equal(t.levels.server, 5);
    assert.equal(t.levels.quantum, undefined);
    const base = E.derive(t).pushPower;
    t.prestige.levels.computeMoat = 3;
    assert.ok(Math.abs(E.derive(t).pushPower / base - 1.1 ** 3) < 1e-9);
    // Older saves' Head Start was today's Muscle Memory: they keep it.
    const old = E.migrate({ version: 11, prestige: { count: 1, levels: { headStart: 2 } } });
    assert.equal(old.prestige.levels.muscleMemory, 2);
});

test('investor tasks grow with the frontier, and dear legacy cards wait until they are within reach', () => {
    const s = fresh();
    s.path.learned = 12;
    assert.ok(E.PROJECT_TASKS.runs.size(s) > E.PROJECT_TASKS.runs.size(fresh()));
    const v = fresh();
    v.prestige.count = 1;
    v.prestige.total = 3;
    E.evaluate(v);
    assert.equal(E.isUpgradeVisible(v, E.UPGRADE_BY_ID.computeMoat), false, '10 Insight with 3 earned');
    v.prestige.total = 5;
    E.evaluate(v);
    assert.equal(E.isUpgradeVisible(v, E.UPGRADE_BY_ID.computeMoat), true);
});

test('Transcendence perks: bought with points, kept through Transcend, never lower the Insight boost', () => {
    const s = fresh();
    s.transcend = { points: 3, total: 3, count: 1, perks: {} };
    const boost = E.insightBoost(s);
    assert.equal(E.buyPerk(s, 'recursion'), true);
    assert.equal(s.transcend.points, 0);
    assert.ok(E.insightBoost(s) > boost, 'spending points never lowers the boost');
    assert.equal(E.buyPerk(s, 'starterLab'), false, 'no points left');
    s.transcend.points = 1;
    assert.equal(E.buyPerk(s, 'starterLab'), true);
    assert.equal(E.buyPerk(s, 'starterLab'), false, 'one level only');
    s.transcend.points = 2;
    const insight = s.prestige.total;
    assert.equal(E.buyPerk(s, 'seedFund'), true);
    assert.equal(s.prestige.total, insight + 5, 'Seed Fund pays at once');
    s.attr.intelligence = 30;
    s.path.learned = 8;
    const v = E.prestige(s, NOW).state;
    assert.equal(v.levels.quantum, 3, 'Starter Lab racks the whole kit');
    assert.deepEqual(v.transcend.perks, { recursion: 1, starterLab: 1, seedFund: 1 });
    Object.assign(v.attr, { intelligence: 300, creativity: 30, awareness: 30 });
    v.prestige.count = 3;
    v.prestige.total = 100;
    const t = E.transcend(v, NOW).state;
    assert.equal(t.prestige.total, 5, 'Seed Fund at every new beginning');
    assert.equal(t.levels.cpu, 10);
    assert.equal(E.perkLevel(t, 'recursion'), 1);
    const m = E.migrate(JSON.parse(E.serialize(t)));
    assert.deepEqual(m.transcend.perks, t.transcend.perks);
    const bad = E.migrate({ ...JSON.parse(E.serialize(t)), transcend: { points: 1, total: 1, count: 1, perks: { recursion: 9, nope: 1 } } });
    assert.deepEqual(bad.transcend.perks, { recursion: 3 });
});

test('Pretrained Weights and Founders\' Lab multiply training XP and hardware', () => {
    const s = fresh();
    s.levels.cpu = 10;
    const a = E.derive(s);
    s.transcend.perks = { pretrained: 2, founders: 1 };
    const b = E.derive(s);
    assert.ok(Math.abs(b.xpMult / a.xpMult - 1.5625) < 1e-9);
    assert.ok(Math.abs(b.cpPerSec / a.cpPerSec - 1.5) < 1e-6);
});

test('a near miss on the skill hill pays a consolation share; anything lower pays nothing', () => {
    const s = fresh();
    assert.equal(E.nearMiss(s, 0.85, 100), 0);
    assert.equal(E.nearMiss(s, 1, 100), 0, 'a crest is not a near miss');
    assert.equal(E.nearMiss(s, 0.95, 100), 100 * E.NEAR_MISS.share);
    assert.equal(s.res.xp, 100 * E.NEAR_MISS.share);
    assert.ok(Math.abs(E.speedShort(0.81) - 1 / 9) < 1e-9);
});

test('act two thrust is paid as it burns: a share of a full sprint, no whole-number floor', () => {
    const s = fresh();
    s.unlocked['module:path'] = true;
    s.path.learned = 8;
    const full = E.pushCost(s, 1);
    const tenth = E.burnCost(s, 0.1);
    for (const k of Object.keys(full)) assert.ok(Math.abs(tenth[k] - full[k] * 0.1) < 1e-9);
    s.res.cp = 1e9;
    s.res.dp = 1e9;
    assert.equal(E.payBurn(s, 0.1), true);
    assert.ok(Math.abs(s.res.cp - (1e9 - tenth.cp)) < 1e-6);
    s.res.cp = 0;
    assert.equal(E.payBurn(s, 0.1), false, 'not without the money');
});
