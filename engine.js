// engine.js — pure game logic: data, state, rules. No DOM access.
// Loaded in the browser as window.AGIEngine and in Node (tests) via require().
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.AGIEngine = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SAVE_VERSION = 2;
    const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
    const PRESTIGE_BONUS = 0.1;        // +10% production per prestige point
    const ACHIEVEMENT_BONUS = 0.02;    // +2% production per achievement
    const PRESTIGE_MIN_INTELLIGENCE = 5;
    const PRESTIGE_CP_DIVISOR = 1e5;
    const IMPROVE_GAIN = 5;

    // Loss Landscape module: dropping a ball costs CP; where it settles grants Intelligence.
    const LOSS = {
        dropCost: { cp: 60 },
        maxBalls: 5,
        baseGain: 0.4,       // Intelligence for a ball settling at loss 0
        convergeBonus: 2     // multiplier for reaching the global minimum (which also starts a new epoch)
    };

    const RESOURCES = {
        cp: { name: 'Compute Power', short: 'CP' },
        dp: { name: 'Data Points', short: 'DP' },
        rp: { name: 'Research Points', short: 'RP' }
    };

    const ATTRIBUTES = {
        intelligence: { name: 'Intelligence', short: 'Int' },
        creativity: { name: 'Creativity', short: 'Cre' },
        awareness: { name: 'Awareness', short: 'Awa' }
    };

    // Phase is derived from attributes (never stored as a transition chain), so it can't skip or double-fire.
    // Each phase needs every listed attribute minimum; requirements only grow from phase to phase.
    const PHASES = [
        { name: 'Narrow AI', req: {} },
        { name: 'General AI', req: { intelligence: 25 } },
        { name: 'Superintelligence', req: { intelligence: 100, creativity: 5, awareness: 5 } },
        { name: 'Singularity', req: { intelligence: 300, creativity: 30, awareness: 30 } }
    ];

    // Manual actions. `unlock` is the unlock key that reveals the action (null = always visible).
    const ACTIONS = [
        { id: 'compute', name: 'Generate Compute', cost: {}, unlock: null },
        { id: 'collect', name: 'Collect Data', cost: { cp: 10 }, unlock: null },
        { id: 'research', name: 'Research', cost: { cp: 50, dp: 10 }, unlock: 'action:research' },
        { id: 'train', name: 'Train Model', cost: { cp: 100, dp: 10 }, unlock: 'action:train' },
        { id: 'improve', name: 'Self-Improve', cost: { cp: 1000, dp: 50, rp: 10 }, unlock: 'action:improve' }
    ];

    const TABS = [
        { id: 'hardware', name: 'Hardware', unlock: null },
        { id: 'software', name: 'Software', unlock: null },
        { id: 'algorithms', name: 'Algorithms', unlock: 'tab:algorithms' },
        { id: 'consciousness', name: 'Consciousness', unlock: 'tab:consciousness' }
    ];

    // Upgrades. `scale` makes it repeatable (cost × scale^level); `max: 1` makes it one-time.
    // `grants` adds attributes per level purchased. Production effects live in derive().
    const UPGRADES = [
        // Hardware
        { id: 'cpu', tab: 'hardware', name: 'Basic CPU', effect: '+0.5 CP/s', cost: { cp: 15 }, scale: 1.15 },
        { id: 'server', tab: 'hardware', name: 'Server Cluster', effect: '+2 CP/s, +1 CP/click', cost: { cp: 100 }, scale: 1.15 },
        { id: 'quantum', tab: 'hardware', name: 'Quantum Processor', effect: '+10 CP/s', cost: { cp: 1100 }, scale: 1.15,
            unlock: s => s.stats.runCp >= 500, hint: 'Earn 500 CP this run' },
        { id: 'neural', tab: 'hardware', name: 'Neural Network Chip', effect: '+50 CP/s', cost: { cp: 12000 }, scale: 1.15,
            unlock: s => s.stats.runCp >= 5000, hint: 'Earn 5,000 CP this run' },
        { id: 'datacenter', tab: 'hardware', name: 'Hyperscale Datacenter', effect: '+250 CP/s', cost: { cp: 130000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 1, hint: 'Reach General AI' },
        { id: 'optical', tab: 'hardware', name: 'Optical Computing', effect: '+1,400 CP/s', cost: { cp: 1.4e6 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 2, hint: 'Reach Superintelligence' },

        // Software
        { id: 'dataProcessor', tab: 'software', name: 'Data Processor', effect: '+1 DP per collection', cost: { cp: 50, dp: 5 }, scale: 1.2 },
        { id: 'autoCollector', tab: 'software', name: 'Auto Data Collector', effect: '+0.5 automatic collections/s', cost: { cp: 200, dp: 20 }, scale: 1.25 },
        { id: 'trainingOptimizer', tab: 'software', name: 'Training Optimizer', effect: '+50% Intelligence per training', cost: { cp: 500, dp: 50 }, scale: 1.6,
            unlock: s => !!s.unlocked['action:train'], hint: 'Unlock Training' },
        { id: 'researchAssistant', tab: 'software', name: 'Research Assistant', effect: '+0.2 automatic research/s', cost: { cp: 1500, dp: 100, rp: 10 }, scale: 1.3,
            unlock: s => !!s.unlocked['action:research'], hint: 'Unlock Research' },
        { id: 'nlp', tab: 'software', name: 'Natural Language Processing', effect: '+5 DP per collection, +1 Intelligence', cost: { cp: 2500, dp: 250 }, max: 1,
            grants: { intelligence: 1 }, unlock: s => s.res.dp >= 100, hint: 'Hold 100 DP' },
        { id: 'computerVision', tab: 'software', name: 'Computer Vision', effect: '+10 DP per collection, +2 Intelligence', cost: { cp: 8000, dp: 600 }, max: 1,
            grants: { intelligence: 2 }, requires: 'nlp' },

        // Algorithms
        { id: 'machineLearning', tab: 'algorithms', name: 'Machine Learning', effect: '+1 RP per research, +1 Intelligence', cost: { cp: 3000, dp: 300, rp: 20 }, max: 1,
            grants: { intelligence: 1 } },
        { id: 'deepLearning', tab: 'algorithms', name: 'Deep Learning', effect: '+2 RP per research, +2 Intelligence', cost: { cp: 10000, dp: 1000, rp: 60 }, max: 1,
            grants: { intelligence: 2 }, requires: 'machineLearning' },
        { id: 'reinforcementLearning', tab: 'algorithms', name: 'Reinforcement Learning', effect: '+3 RP per research, +2 Intelligence, +1 Creativity', cost: { cp: 30000, dp: 3000, rp: 150 }, max: 1,
            grants: { intelligence: 2, creativity: 1 }, requires: 'deepLearning' },
        { id: 'transferLearning', tab: 'algorithms', name: 'Transfer Learning', effect: '+5 RP per research, +3 Intelligence, +2 Creativity', cost: { cp: 80000, dp: 8000, rp: 400 }, max: 1,
            grants: { intelligence: 3, creativity: 2 }, requires: 'reinforcementLearning' },
        { id: 'generativeModels', tab: 'algorithms', name: 'Generative Models', effect: '+1 Creativity', cost: { cp: 5000, dp: 500, rp: 50 }, scale: 1.6,
            grants: { creativity: 1 }, requires: 'reinforcementLearning' },

        // Consciousness
        { id: 'selfAwareness', tab: 'consciousness', name: 'Self-Awareness Module', effect: '+5 Awareness', cost: { cp: 50000, dp: 5000, rp: 300 }, max: 1,
            grants: { awareness: 5 } },
        { id: 'introspection', tab: 'consciousness', name: 'Introspection', effect: '+1 Awareness', cost: { cp: 30000, dp: 3000, rp: 150 }, scale: 1.5,
            grants: { awareness: 1 }, requires: 'selfAwareness' },
        { id: 'creativeSynthesis', tab: 'consciousness', name: 'Creative Synthesis', effect: '+10 Creativity, +2 Awareness', cost: { cp: 100000, dp: 10000, rp: 600 }, max: 1,
            grants: { creativity: 10, awareness: 2 }, requires: 'selfAwareness' },
        { id: 'metacognition', tab: 'consciousness', name: 'Metacognition', effect: '+10 Intelligence, +5 Awareness', cost: { cp: 250000, dp: 25000, rp: 1500 }, max: 1,
            grants: { intelligence: 10, awareness: 5 }, requires: 'creativeSynthesis' },
        { id: 'consciousnessEmergence', tab: 'consciousness', name: 'Consciousness Emergence', effect: '+20 Awareness, +10 Creativity', cost: { cp: 600000, dp: 60000, rp: 4000 }, max: 1,
            grants: { awareness: 20, creativity: 10 }, requires: 'metacognition' }
    ];
    const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

    // Milestones: persistent per-run unlocks for actions and tabs. Once unlocked they stay unlocked.
    const MILESTONES = [
        { key: 'module:loss', name: 'Gradient Descent', desc: 'Earn 100 CP this run to unlock the Loss Landscape', check: s => s.stats.runCp >= 100 },
        { key: 'action:research', name: 'Basic Research', desc: 'Hold 10 DP to unlock Research', check: s => s.res.dp >= 10 },
        { key: 'action:train', name: 'Training Capability', desc: 'Earn 500 CP this run to unlock Training', check: s => s.stats.runCp >= 500 },
        { key: 'action:improve', name: 'Self-Improvement', desc: 'Hold 25 RP to unlock Self-Improvement', check: s => s.res.rp >= 25 },
        { key: 'tab:algorithms', name: 'Advanced Algorithms', desc: 'Reach 5 Intelligence to unlock Algorithms', check: s => s.attr.intelligence >= 5 },
        { key: 'tab:consciousness', name: 'Consciousness Research', desc: 'Reach General AI to unlock Consciousness', check: s => phaseIndex(s) >= 1 }
    ];

    // Achievements persist across prestige and each add ACHIEVEMENT_BONUS to all production.
    const ACHIEVEMENTS = [
        { id: 'firstClick', name: 'Hello, World', desc: 'Generate compute manually', check: s => s.stats.clicks >= 1 },
        { id: 'clicks1k', name: 'Carpal Tunnel', desc: 'Click 1,000 times', check: s => s.stats.clicks >= 1000 },
        { id: 'cp1k', name: 'Kiloflop', desc: 'Earn 1,000 CP in total', check: s => s.stats.lifetimeCp >= 1e3 },
        { id: 'cp1m', name: 'Megaflop', desc: 'Earn 1 million CP in total', check: s => s.stats.lifetimeCp >= 1e6 },
        { id: 'cp1b', name: 'Gigaflop', desc: 'Earn 1 billion CP in total', check: s => s.stats.lifetimeCp >= 1e9 },
        { id: 'firstDescent', name: 'Downhill From Here', desc: 'Settle a gradient in the Loss Landscape', check: s => s.stats.lossDrops >= 1 },
        { id: 'globalMinimum', name: 'Global Minimum', desc: 'Find the global minimum of a loss landscape', check: s => s.stats.lossConverged >= 1 },
        { id: 'firstResearch', name: 'Peer Reviewed', desc: 'Complete your first research', check: s => s.stats.researchDone >= 1 },
        { id: 'cpu25', name: 'Moore\'s Law', desc: 'Own 25 Basic CPUs', check: s => (s.levels.cpu || 0) >= 25 },
        { id: 'automation', name: 'Hands Off', desc: 'Own an Auto Data Collector and a Research Assistant', check: s => (s.levels.autoCollector || 0) > 0 && (s.levels.researchAssistant || 0) > 0 },
        { id: 'general', name: 'Generalist', desc: 'Reach General AI', check: s => phaseIndex(s) >= 1 },
        { id: 'super', name: 'Beyond Human', desc: 'Reach Superintelligence', check: s => phaseIndex(s) >= 2 },
        { id: 'singularity', name: 'Event Horizon', desc: 'Reach the Singularity', check: s => phaseIndex(s) >= 3 },
        { id: 'transcend', name: 'Rebirth', desc: 'Transcend for the first time', check: s => s.prestige.count >= 1 }
    ];

    function defaultState(now) {
        now = now ?? Date.now();
        return {
            version: SAVE_VERSION,
            res: { cp: 0, dp: 0, rp: 0 },
            attr: { intelligence: 0, creativity: 0, awareness: 0 },
            levels: {},
            unlocked: {},
            achievements: {},
            prestige: { points: 0, total: 0, count: 0 },
            stats: {
                clicks: 0,
                lifetimeCp: 0,
                runCp: 0,
                researchDone: 0,
                lossDrops: 0,
                lossConverged: 0,
                playTime: 0,
                runStart: now,
                firstStart: now,
                highestPhase: 0
            },
            loss: { epoch: 0 },
            settings: { autosave: true, offline: true },
            lastSaved: now
        };
    }

    // ---- Derived values -------------------------------------------------

    function level(s, id) {
        return s.levels[id] || 0;
    }

    function globalMultiplier(s) {
        const achieved = Object.keys(s.achievements).length;
        return (1 + PRESTIGE_BONUS * s.prestige.points) * (1 + ACHIEVEMENT_BONUS * achieved);
    }

    // rates: optional debug multipliers { cp, dp, rp }
    function derive(s, rates) {
        const r = Object.assign({ cp: 1, dp: 1, rp: 1 }, rates);
        const mult = globalMultiplier(s);
        const L = id => level(s, id);

        const cpPerSec = (0.5 * L('cpu') + 2 * L('server') + 10 * L('quantum') + 50 * L('neural')
            + 250 * L('datacenter') + 1400 * L('optical')) * mult * r.cp;
        const clickPower = (1 + L('server')) * mult;
        const dpPerCollect = (1 + L('dataProcessor') + 5 * L('nlp') + 10 * L('computerVision')) * mult;
        const dpPerSec = 0.5 * L('autoCollector') * dpPerCollect * r.dp;
        const rpPerResearch = (1 + L('machineLearning') + 2 * L('deepLearning') + 3 * L('reinforcementLearning')
            + 5 * L('transferLearning')) * mult;
        const rpPerSec = 0.2 * L('researchAssistant') * rpPerResearch * r.rp;
        const trainGain = 1 + 0.5 * L('trainingOptimizer');

        return { mult, cpPerSec, clickPower, dpPerCollect, dpPerSec, rpPerResearch, rpPerSec, trainGain };
    }

    function meetsPhase(s, phase) {
        return Object.entries(phase.req).every(([k, v]) => s.attr[k] >= v);
    }

    function phaseIndex(s) {
        let idx = 0;
        while (idx + 1 < PHASES.length && meetsPhase(s, PHASES[idx + 1])) idx++;
        return idx;
    }

    // Progress (0–1) toward the next phase: the average of each requirement's completion. 1 at the final phase.
    function phaseProgress(s) {
        const next = PHASES[phaseIndex(s) + 1];
        if (!next) return 1;
        const parts = Object.entries(next.req).map(([k, v]) => Math.min(1, s.attr[k] / v));
        return parts.reduce((a, b) => a + b, 0) / parts.length;
    }

    // ---- Costs & purchases ----------------------------------------------

    function upgradeCost(up, lvl) {
        const factor = up.scale ? Math.pow(up.scale, lvl) : 1;
        const cost = {};
        for (const [k, v] of Object.entries(up.cost)) cost[k] = Math.ceil(v * factor);
        return cost;
    }

    function canAfford(s, cost) {
        return Object.entries(cost).every(([k, v]) => s.res[k] >= v);
    }

    function pay(s, cost) {
        for (const [k, v] of Object.entries(cost)) s.res[k] -= v;
    }

    function isMaxed(s, up) {
        return up.max != null && level(s, up.id) >= up.max;
    }

    function isUpgradeVisible(s, up) {
        return !!s.unlocked['up:' + up.id];
    }

    function upgradeUnlockMet(s, up) {
        if (up.requires && level(s, up.requires) < 1) return false;
        if (up.unlock && !up.unlock(s)) return false;
        const tab = TABS.find(t => t.id === up.tab);
        return !tab.unlock || !!s.unlocked[tab.unlock];
    }

    function buy(s, id) {
        const up = UPGRADE_BY_ID[id];
        if (!up) return { ok: false, msg: `Unknown upgrade: ${id}` };
        if (!isUpgradeVisible(s, up)) return { ok: false, msg: `${up.name} is locked.` };
        if (isMaxed(s, up)) return { ok: false, msg: `${up.name} is already owned.` };
        const cost = upgradeCost(up, level(s, id));
        if (!canAfford(s, cost)) return { ok: false, msg: `Not enough resources for ${up.name}.` };
        pay(s, cost);
        s.levels[id] = level(s, id) + 1;
        if (up.grants) {
            for (const [k, v] of Object.entries(up.grants)) s.attr[k] += v;
        }
        return { ok: true, msg: `${up.name} ${up.max === 1 ? 'acquired' : 'upgraded to level ' + s.levels[id]}: ${up.effect}` };
    }

    function act(s, id, rates) {
        const action = ACTIONS.find(a => a.id === id);
        if (!action) return { ok: false, msg: `Unknown action: ${id}` };
        if (action.unlock && !s.unlocked[action.unlock]) return { ok: false, msg: `${action.name} is locked.` };
        if (!canAfford(s, action.cost)) return { ok: false, msg: `Not enough resources to ${action.name.toLowerCase()}.` };
        const d = derive(s, rates);
        pay(s, action.cost);
        switch (id) {
            case 'compute':
                addCp(s, d.clickPower);
                s.stats.clicks++;
                return { ok: true, gained: d.clickPower, resource: 'cp' };
            case 'collect':
                s.res.dp += d.dpPerCollect;
                return { ok: true, gained: d.dpPerCollect, resource: 'dp' };
            case 'research':
                s.res.rp += d.rpPerResearch;
                s.stats.researchDone++;
                return { ok: true, gained: d.rpPerResearch, resource: 'rp' };
            case 'train':
                s.attr.intelligence += d.trainGain;
                return { ok: true, msg: `Training complete: +${format(d.trainGain)} Intelligence` };
            case 'improve':
                s.attr.intelligence += IMPROVE_GAIN;
                return { ok: true, msg: `Self-improvement complete: +${IMPROVE_GAIN} Intelligence` };
        }
        return { ok: false };
    }

    function addCp(s, amount) {
        s.res.cp += amount;
        s.stats.runCp += amount;
        s.stats.lifetimeCp += amount;
    }

    // ---- Simulation -----------------------------------------------------

    function tick(s, dt, rates) {
        if (!(dt > 0)) return;
        const d = derive(s, rates);
        addCp(s, d.cpPerSec * dt);
        s.res.dp += d.dpPerSec * dt;
        s.res.rp += d.rpPerSec * dt;
        s.stats.playTime += dt;
    }

    // Returns arrays of newly unlocked milestone keys, upgrade ids, achievement ids and phase change.
    function evaluate(s) {
        const out = { milestones: [], upgrades: [], achievements: [], phase: null };
        for (const m of MILESTONES) {
            if (!s.unlocked[m.key] && m.check(s)) {
                s.unlocked[m.key] = true;
                out.milestones.push(m);
            }
        }
        for (const up of UPGRADES) {
            const key = 'up:' + up.id;
            if (!s.unlocked[key] && upgradeUnlockMet(s, up)) {
                s.unlocked[key] = true;
                out.upgrades.push(up);
            }
        }
        for (const a of ACHIEVEMENTS) {
            if (!s.achievements[a.id] && a.check(s)) {
                s.achievements[a.id] = true;
                out.achievements.push(a);
            }
        }
        const idx = phaseIndex(s);
        if (idx > s.stats.highestPhase) {
            s.stats.highestPhase = idx;
            out.phase = PHASES[idx];
        }
        return out;
    }

    // ---- Loss Landscape -------------------------------------------------

    // The landscape is derived from the run and epoch, never stored: same run + epoch = same terrain.
    function lossSeed(s) {
        let h = 2166136261 ^ s.loss.epoch;
        h = Math.imul(h ^ (s.stats.runStart >>> 0), 16777619);
        h = Math.imul(h ^ Math.floor(s.stats.runStart / 4294967296), 16777619);
        return (h ^ (h >>> 15)) >>> 0;
    }

    function lossGain(loss, converged) {
        const depth = Math.max(0, 1 - loss);
        return LOSS.baseGain * depth * depth * depth * (converged ? LOSS.convergeBonus : 1);
    }

    // Pay for a drop. The caller (UI) owns the physics sim and reports back via settleLoss().
    function payLossDrop(s) {
        if (!s.unlocked['module:loss'] || !canAfford(s, LOSS.dropCost)) return false;
        pay(s, LOSS.dropCost);
        return true;
    }

    function settleLoss(s, loss, converged) {
        const gain = lossGain(loss, converged);
        s.attr.intelligence += gain;
        s.stats.lossDrops++;
        if (converged) {
            s.stats.lossConverged++;
            s.loss.epoch++;
        }
        return gain;
    }

    // ---- Prestige -------------------------------------------------------

    function prestigeGain(s) {
        if (s.attr.intelligence < PRESTIGE_MIN_INTELLIGENCE) return 0;
        return Math.floor(Math.cbrt(s.stats.runCp / PRESTIGE_CP_DIVISOR) * (1 + phaseIndex(s)));
    }

    function prestige(s, now) {
        const gain = prestigeGain(s);
        if (gain < 1) return { ok: false, msg: 'Not ready to transcend yet.' };
        const fresh = defaultState(now);
        const next = Object.assign(fresh, {
            achievements: s.achievements,
            prestige: { points: s.prestige.points + gain, total: s.prestige.total + gain, count: s.prestige.count + 1 },
            settings: s.settings
        });
        Object.assign(next.stats, {
            clicks: s.stats.clicks,
            lifetimeCp: s.stats.lifetimeCp,
            researchDone: s.stats.researchDone,
            lossDrops: s.stats.lossDrops,
            lossConverged: s.stats.lossConverged,
            playTime: s.stats.playTime,
            firstStart: s.stats.firstStart
        });
        return { ok: true, gain, state: next };
    }

    // ---- Offline progress -----------------------------------------------

    function applyOffline(s, now, rates) {
        if (!s.settings.offline) return 0;
        const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (now - s.lastSaved) / 1000));
        if (seconds < 1) return 0;
        tick(s, seconds, rates);
        return seconds;
    }

    // ---- Persistence ----------------------------------------------------

    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
    const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

    function cleanMap(obj, valid) {
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
                if (valid(k, v)) out[k] = v;
            }
        }
        return out;
    }

    // Accepts any parsed save (v1 or v2, possibly partial/corrupt) and returns a valid v2 state.
    function migrate(raw, now) {
        const d = defaultState(now);
        if (!raw || typeof raw !== 'object') return d;

        if (raw.version !== SAVE_VERSION) raw = migrateV1(raw);

        const s = d;
        for (const k of Object.keys(s.res)) s.res[k] = num(raw.res?.[k], 0);
        for (const k of Object.keys(s.attr)) s.attr[k] = num(raw.attr?.[k], 0);
        s.levels = cleanMap(raw.levels, (k, v) => UPGRADE_BY_ID[k] && Number.isInteger(v) && v > 0);
        for (const [k, v] of Object.entries(s.levels)) {
            const max = UPGRADE_BY_ID[k].max;
            if (max != null) s.levels[k] = Math.min(v, max);
        }
        s.unlocked = cleanMap(raw.unlocked, (k, v) => v === true);
        s.achievements = cleanMap(raw.achievements, (k, v) => v === true && ACHIEVEMENTS.some(a => a.id === k));
        for (const k of Object.keys(s.prestige)) s.prestige[k] = num(raw.prestige?.[k], 0);
        for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats?.[k], s.stats[k]);
        for (const k of Object.keys(s.settings)) s.settings[k] = bool(raw.settings?.[k], s.settings[k]);
        s.loss.epoch = Math.floor(num(raw.loss?.epoch, 0));
        s.lastSaved = num(raw.lastSaved, d.lastSaved);
        return s;
    }

    // Original save format (v1, unversioned).
    function migrateV1(o) {
        const r = o.resources || {};
        const a = o.attributes || {};
        const u = o.upgrades || {};
        const p = o.progress || {};
        const st = o.stats || {};
        const set = o.settings || {};
        return {
            res: { cp: r.computePower, dp: r.dataPoints, rp: r.researchPoints },
            attr: { intelligence: a.intelligence, creativity: a.creativity, awareness: a.awareness },
            levels: {
                cpu: u.cpuLevel,
                server: u.serverLevel,
                quantum: u.quantumLevel,
                neural: u.neuralNetworkLevel,
                dataProcessor: u.dataProcessorLevel,
                autoCollector: o.features?.autoCollect ? 1 : 0
            },
            prestige: { points: p.prestigePoints, total: p.totalPrestigePoints, count: st.totalPrestigeCount },
            stats: {
                clicks: st.totalClicks,
                lifetimeCp: st.totalComputeGenerated,
                runCp: st.totalComputeGenerated,
                researchDone: st.totalResearchDone,
                runStart: st.gameStartTime,
                firstStart: st.gameStartTime
            },
            settings: { autosave: set.autoSaveEnabled, offline: set.backgroundProcessingEnabled },
            lastSaved: o.saveTime
        };
    }

    function serialize(s) {
        return JSON.stringify(s);
    }

    function deserialize(json, now) {
        let raw;
        try {
            raw = JSON.parse(json);
        } catch {
            return null;
        }
        return migrate(raw, now);
    }

    // ---- Formatting -----------------------------------------------------

    const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

    function format(n, decimals) {
        if (!Number.isFinite(n)) return '∞';
        const sign = n < 0 ? '-' : '';
        n = Math.abs(n);
        if (n < 1000) {
            const dp = decimals ?? (n < 10 && n % 1 !== 0 ? 1 : 0);
            return sign + (dp ? n.toFixed(dp) : Math.floor(n).toString());
        }
        const tier = Math.floor(Math.log10(n) / 3);
        if (tier >= SUFFIXES.length) return sign + n.toExponential(2).replace('+', '');
        const scaled = n / Math.pow(1000, tier);
        return sign + scaled.toFixed(scaled < 100 ? 2 : 1) + SUFFIXES[tier];
    }

    function formatCost(cost) {
        return Object.entries(cost).map(([k, v]) => `${format(v)} ${RESOURCES[k].short}`).join(', ') || 'Free';
    }

    function formatDuration(seconds) {
        seconds = Math.floor(seconds);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const sec = seconds % 60;
        if (h) return `${h}h ${m}m`;
        if (m) return `${m}m ${sec}s`;
        return `${sec}s`;
    }

    return {
        SAVE_VERSION, MAX_OFFLINE_SECONDS, PRESTIGE_MIN_INTELLIGENCE, IMPROVE_GAIN, LOSS,
        RESOURCES, ATTRIBUTES, PHASES, ACTIONS, TABS, UPGRADES, UPGRADE_BY_ID, MILESTONES, ACHIEVEMENTS,
        defaultState, derive, level, phaseIndex, phaseProgress,
        upgradeCost, canAfford, isMaxed, isUpgradeVisible, buy, act, tick, evaluate,
        prestigeGain, prestige, applyOffline,
        lossSeed, lossGain, payLossDrop, settleLoss,
        migrate, serialize, deserialize,
        format, formatCost, formatDuration
    };
});
