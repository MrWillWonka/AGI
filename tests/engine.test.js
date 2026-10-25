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
        assert.ok(n.max >= 1 && n.max <= 3, `${n.id} has 1–3 levels`);
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
    E.evaluate(s);
    s.res.cp = 1000;
    assert.equal(E.buy(s, 'cpu').ok, true);
    assert.equal(s.res.cp, 1000 - 15);
    assert.deepEqual(E.upgradeCost(E.UPGRADE_BY_ID.cpu, 1), { cp: Math.ceil(15 * 1.15) });
    assert.equal(E.derive(s).cpPerSec, 0.5 * E.derive(s).mult);
});

test('one-time upgrades cannot be bought twice and grant attributes once', () => {
    const s = fresh();
    s.res = { cp: 1e9, dp: 1e9, rp: 1e9, xp: 0 };
    E.evaluate(s);
    assert.equal(E.buy(s, 'nlp').ok, true);
    assert.equal(s.attr.intelligence, 1);
    assert.equal(E.buy(s, 'nlp').ok, false);
    assert.equal(s.attr.intelligence, 1);
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
    assert.equal(E.phaseProgress(s), 1 / 3 + 0);
    s.attr.creativity = 5;
    s.attr.awareness = 5;
    assert.equal(E.phaseIndex(s), 2);
    s.attr = { intelligence: 50, creativity: 0, awareness: 0 };
    const changes = E.evaluate(s);
    assert.equal(changes.phase.name, 'General AI');
    assert.equal(E.evaluate(s).phase, null, 'phase change reported only once');
});

test('unlocks persist even after the triggering resource is spent', () => {
    const s = fresh();
    s.res.dp = 10;
    E.evaluate(s);
    s.res.dp = 0;
    E.evaluate(s);
    assert.equal(s.unlocked['action:research'], true);
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
    assert.equal(d.collectsPerSec, 0.5);
    E.tick(s, 10);
    assert.ok(Math.abs(s.res.cp - (1000 + 10 * d.cpPerSec - 50)) < 1e-6);
    assert.ok(Math.abs(s.res.dp - 5 * d.dpPerCollect) < 1e-9);

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
        s.settings.autoBudget = budget;
        s.levels.cpu = 4;
        s.levels.autoCollector = 20;
        s.levels.researchAssistant = 20;
        const d = E.derive(s);
        assert.ok(d.cpUsePerSec <= budget * d.cpPerSec + 1e-9, `cp at ${budget}`);
        assert.ok(d.dpUsePerSec <= budget * d.dpPerSec + 1e-9, `dp at ${budget}`);
        assert.ok(d.cpNet >= (1 - budget) * d.cpPerSec - 1e-9);
        assert.equal(d.autoThrottled, true, 'demand far above production');
        const cp = s.res.cp;
        E.tick(s, 60);
        assert.ok(s.res.cp >= cp, 'compute still climbs');
    }
});

test('the automation budget is saved and clamped', () => {
    assert.equal(E.migrate({ version: E.SAVE_VERSION, settings: { autoBudget: 0.3 } }).settings.autoBudget, 0.3);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, settings: { autoBudget: 5 } }).settings.autoBudget, E.AUTO_BUDGET.max);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, settings: { autoBudget: 'x' } }).settings.autoBudget, E.AUTO_BUDGET.default);
    assert.equal(E.migrate({ version: E.SAVE_VERSION, settings: {} }).settings.autosave, true);
});

test('a roll that crosses hills earns at least the hill floor', () => {
    const s = fresh();
    const none = E.rollXp(s, 0.01, false, 0, 0);
    const three = E.rollXp(s, 0.01, false, 0, 3);
    assert.ok(three > none);
    assert.ok(Math.abs(three / E.rollXp(s, 1, false, 0, 0) - E.PATH.hillFloor * 3) < 1e-9);
    assert.equal(E.rollXp(s, 0.9, false, 0, 3), E.rollXp(s, 0.9, false, 0, 0));
});

test('offline progress is capped and respects the setting', () => {
    const s = fresh();
    s.levels.cpu = 2;
    const seconds = E.applyOffline(s, NOW + 24 * 3600 * 1000);
    assert.equal(seconds, E.MAX_OFFLINE_SECONDS);
    assert.equal(s.res.cp, E.MAX_OFFLINE_SECONDS);

    const off = fresh();
    off.levels.cpu = 2;
    off.settings.offline = false;
    assert.equal(E.applyOffline(off, NOW + 3600 * 1000), 0);
    assert.equal(off.res.cp, 0);
});

test('prestige keeps achievements and points, resets the run', () => {
    const s = fresh();
    s.attr.intelligence = 10;
    s.stats.runCp = 8e5;
    s.res.cp = 123;
    s.levels.cpu = 5;
    s.achievements.firstClick = true;
    assert.equal(E.prestigeGain(s), 2);
    const r = E.prestige(s, NOW + 1);
    assert.equal(r.ok, true);
    assert.equal(r.state.prestige.points, 2);
    assert.equal(r.state.prestige.count, 1);
    assert.equal(r.state.res.cp, 0);
    assert.deepEqual(r.state.levels, {});
    assert.equal(r.state.achievements.firstClick, true);
    assert.ok(E.derive(r.state).mult > 1.2);
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
    assert.deepEqual(s.prestige, { points: 2, total: 3, count: 1 });
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
    assert.ok(Math.abs(rate - (E.PATH.xpPerStretch * (1 + E.PATH.xpScale)) * E.PATH.clearedRate) < 1e-9);
    E.tick(s, 100);
    assert.ok(Math.abs(s.res.xp - rate * 100) < 1e-9);
});

test('skills add pushes and glide as well as strength', () => {
    const s = fresh();
    const base = E.derive(s);
    s.path.learned = 11;
    const d = E.derive(s);
    assert.ok(d.pushesPerRoll >= base.pushesPerRoll + 3);
    assert.ok(d.friction < base.friction);
    assert.ok(d.pushPower > base.pushPower * 3);
});
