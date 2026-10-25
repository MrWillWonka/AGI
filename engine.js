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

    const SAVE_VERSION = 4;   // 3: investor projects; 4: automated laps per cleared stretch (path.auto)
    const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
    const PRESTIGE_BONUS = 0.1;        // +10% production per prestige point
    const ACHIEVEMENT_BONUS = 0.02;    // +2% production per achievement
    const PRESTIGE_MIN_INTELLIGENCE = 5;
    const PRESTIGE_CP_DIVISOR = 1e5;
    const IMPROVE_GAIN = 5;

    // Training Path: every push costs CP and DP in proportion to how hard it is charged (energy, so
    // charge²), which ties training to passive income. How far a roll gets earns Experience (XP).
    // Costs and XP both scale with the stretch you are on (= skills learned).
    const PATH = {
        pushCost: { cp: 14, dp: 1.5 },  // a fully charged push on the first stretch
        pushCostScale: 1.4,
        crestBonus: 2,       // XP multiplier when the roll crests the skill hill
        xpPerMetre: 0.45,    // distance XP per metre along a leg on the first stretch...
        metreScale: 1.05,    // ...worth a little more per metre on each later stretch (they're longer too)
        cleanXp: 0.08,       // flat XP banked at once per clean push, as a share of a full stretch's distance XP
        cleanRollBonus: 0.1, // and +10% distance XP for the roll per clean push
        perfectMult: 3,      // a perfect push (inside the perfect spot) counts as this many clean pushes
        zoneWidth: 0.1,      // bonus zone width as a fraction of the strength meter (fixed: hitting it is the skill)
        perfectWidth: 0.025, // perfect spot width once Perfect Calibration is bought
        perfectPower: 0.3,   // a perfect sprint hits this much harder on top of a clean one
        breakthroughMult: 1.5, // a breakthrough sprint's strength multiplier before upgrades
        windfallMult: 2,     // a viral run's XP multiplier before upgrades
        crunchSeconds: 3,    // a crunch's free sprints last this long at Crunch Time level 1 (+1 s per level)
        minCharge: 0.15,     // weakest push a quick tap gives
        basePush: 1.8,       // push strength before upgrades and skills
        basePushes: 1,       // pushes per roll: just the launch until More Epochs is bought
        baseCooldown: 2.0,   // seconds between pushes
        minCooldown: 0.3,
        clearedRate: 1 / 600, // a cleared stretch runs itself: this share of its full XP per second
        replayXp: 0.25,       // replaying a cleared leg pays this share of its XP: flat for clearing it, by distance otherwise
        clearedCp: 0.03,      // each cleared stretch adds +3% compute
        lapCp: 0.002,         // and every automated lap of it adds a little more (+0.2%)...
        lapCpMax: 0.5         // ...up to +50% per stretch
    };

    // Skills, in trail order. Hill i teaches SKILLS[i]. `bonus` effects are summed in derive().
    // Past the end of the list the trail continues with generated frontier skills (see skillAt).
    const SKILLS = [
        // Each hill is bigger and each stretch longer than the last, so the bonuses grow too: most skills
        // also make the ball stronger (push), and a few add a push per run or let it glide.
        { name: 'Pattern Matching', effect: '+1 CP per click, +5% sprint strength', flavor: 'It spotted a pattern. It was a cat.', grants: { intelligence: 1 }, bonus: { click: 1, push: 0.05 } },
        { name: 'Edge Detection', effect: '+10% CP/s, +10% sprint strength', flavor: 'It can tell where one thing stops and another starts.', grants: { intelligence: 2 }, bonus: { cp: 0.1, push: 0.1 } },
        { name: 'Image Recognition', effect: '+1 DP per collection, +10% sprint strength', flavor: 'Hot dog or not hot dog? Solved.', grants: { intelligence: 3 }, bonus: { collect: 1, push: 0.1 } },
        { name: 'Speech Recognition', effect: '+15% data production, +1 training sprint per run', flavor: 'It finally understands your accent.', grants: { intelligence: 4 }, bonus: { dp: 0.15, pushes: 1 } },
        { name: 'Language Modeling', effect: '+1 RP per research, +15% sprint strength', flavor: 'It finishes your sentences. Annoyingly well.', grants: { intelligence: 6 }, bonus: { research: 1, push: 0.15 } },
        { name: 'Translation', effect: '+20% CP/s, +20% sprint strength', flavor: 'Fluent in 90 languages, polite in none.', grants: { intelligence: 8 }, bonus: { cp: 0.2, push: 0.2 } },
        { name: 'Reasoning', effect: '+25% research, +1 training sprint per run', flavor: 'It showed its working. The teacher would be proud.', grants: { intelligence: 10, creativity: 1 }, bonus: { rp: 0.25, pushes: 1 } },
        { name: 'Planning', effect: '+30% CP/s, +30% sprint strength', flavor: 'Made a five-year plan. Finished it by Tuesday.', grants: { intelligence: 14, creativity: 1 }, bonus: { cp: 0.3, push: 0.3 } },
        { name: 'Analogy', effect: '+40% sprint strength, a little less drag', flavor: 'A brain is like a cloud. It explained why. Fair point.', grants: { intelligence: 18, creativity: 2 }, bonus: { push: 0.4, glide: 0.08 } },
        { name: 'Theory of Mind', effect: '+25% data production, +40% sprint strength', flavor: 'It knows what you\'re thinking. Please stop thinking that.', grants: { intelligence: 24, awareness: 2 }, bonus: { dp: 0.25, push: 0.4 } },
        { name: 'Self-Modeling', effect: '+50% sprint strength, +1 training sprint per run', flavor: 'It drew a picture of itself. It\'s flattering.', grants: { intelligence: 30, creativity: 3, awareness: 3 }, bonus: { push: 0.5, pushes: 1 } },
        { name: 'Open-Ended Discovery', effect: '+50% to all production, +60% sprint strength', flavor: 'Nobody asked it to. It did it anyway.', grants: { intelligence: 40, creativity: 5, awareness: 5 },
            bonus: { cp: 0.5, dp: 0.5, rp: 0.5, push: 0.6 } }
    ];

    const RESOURCES = {
        cp: { name: 'Compute Power', short: 'CP' },
        dp: { name: 'Data Points', short: 'DP' },
        rp: { name: 'Research Points', short: 'RP' },
        xp: { name: 'Experience', short: 'XP' }
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
        { id: 'improve', name: 'Self-Improve', cost: { cp: 1000, dp: 50, rp: 10 }, scale: 1.25, unlock: 'action:improve' }
    ];

    const TABS = [
        { id: 'hardware', name: 'Hardware', unlock: null },
        { id: 'software', name: 'Software', unlock: 'seen:dp' },   // opens once data has been introduced
        { id: 'algorithms', name: 'Algorithms', unlock: 'tab:algorithms' },
        { id: 'consciousness', name: 'Consciousness', unlock: 'tab:consciousness' }
    ];

    // Automation is earned: each machine that does a job for you needs proof you've done it by hand
    // (a stat count) and, for the bigger ones, a training skill. `automationGate()` checks and reports it.
    const AUTOMATION = {
        cpu: { stat: 'clicks', need: 25, what: 'compute by hand' },
        autoCollector: { stat: 'collects', need: 100, what: 'data collections by hand', skill: 1 },
        researchAssistant: { stat: 'researchManual', need: 50, what: 'research runs by hand', skill: 5 }
    };

    function automationGate(s, id) {
        const g = AUTOMATION[id];
        if (!g) return null;
        const done = Math.min(g.need, s.stats[g.stat] || 0);
        const skillOk = !g.skill || s.path.learned >= g.skill;
        return { done, need: g.need, what: g.what, skill: g.skill ? skillAt(g.skill - 1).name : null, skillOk, met: done >= g.need && skillOk };
    }

    // Upgrades. `scale` makes it repeatable (cost × scale^level); `max: 1` makes it one-time.
    // `grants` adds attributes per level purchased. Production effects live in derive().
    const UPGRADES = [
        // Hardware: a ladder of generators, like most incremental games. `cps` is CP/s per unit. Each tier
        // costs 20x the last and gives about 6.7x, so it pays back 3x slower: when it appears, the tier
        // below stays the better buy for about eight more units, then the new one takes over. All scale
        // x1.15 per unit, and a tier's output doubles at 25, 50 and 100 owned (HARDWARE_DOUBLINGS), which
        // makes older tiers worth topping up again. Each tier shows up late (tierReady).
        { id: 'cpu', tab: 'hardware', name: 'Basic CPU', cps: 0.5, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'A desktop tower from the office cupboard. It wheezes.', cost: { cp: 15 }, scale: 1.15,
            unlock: s => automationGate(s, 'cpu').met, hint: 'Generate compute by hand 25 times' },
        // The click tool: one upgrade that grows into new tools as you level it (CLICK_TOOLS), each adding
        // more per level. Its name and flavour follow the current tool (upgradeName / upgradeFlavor).
        { id: 'keyboard', tab: 'hardware', name: 'Mechanical Keyboard', shows: 'click', effect: 'More compute per click; grows into better tools as you level it', flavor: 'Clicky. Your desk neighbours hate it.', cost: { cp: 40 }, scale: 1.32,
            unlock: s => s.stats.clicks >= 15, hint: 'Generate compute by hand 15 times' },
        { id: 'server', tab: 'hardware', name: 'Server Cluster', cps: 3.3, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'Rack-mounted, fan-cooled, slightly too loud for the office.', cost: { cp: 300 }, scale: 1.15,
            unlock: s => tierReady(s, 'server'), hint: 'More Basic CPUs, and more compute earned' },
        { id: 'quantum', tab: 'hardware', name: 'Quantum Processor', cps: 22, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'It\'s both working and not working until you check.', cost: { cp: 6000 }, scale: 1.15,
            unlock: s => tierReady(s, 'quantum'), hint: 'More Server Clusters, and more compute earned' },
        { id: 'neural', tab: 'hardware', name: 'Neural Network Chip', cps: 150, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'A chip shaped like the thing you\'re trying to build.', cost: { cp: 120000 }, scale: 1.15,
            unlock: s => tierReady(s, 'neural'), hint: 'More Quantum Processors, and more compute earned' },
        { id: 'datacenter', tab: 'hardware', name: 'Hyperscale Datacenter', cps: 1000, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'Bought a field. Filled it with computers.', cost: { cp: 2400000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 1 && tierReady(s, 'datacenter'), hint: 'Reach General AI' },
        { id: 'optical', tab: 'hardware', name: 'Optical Computing', cps: 6600, effect: 'Generates compute; output doubles at 25, 50 and 100 owned', flavor: 'Computing at the speed of light. Literally.', cost: { cp: 48000000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 2 && tierReady(s, 'optical'), hint: 'Reach Superintelligence' },

        // Software
        { id: 'shellScripts', tab: 'software', name: 'Shell Scripts', shows: 'click', effect: 'Each click also earns 2% of your CP/s, per level', flavor: 'for i in range(1000): click()', cost: { cp: 600, dp: 40 }, scale: 4, max: 3,
            unlock: s => s.stats.clicks >= 150, hint: 'Generate compute by hand 150 times' },
        { id: 'compilerOpt', tab: 'software', name: 'Compiler Optimizations', shows: 'hardwareMult', effect: 'All hardware +50% CP/s', flavor: 'Turned on -O3. Everything is faster and nobody knows why.', cost: { cp: 3000, dp: 200 }, max: 1,
            unlock: s => level(s, 'server') >= 5, hint: 'Own 5 Server Clusters' },
        { id: 'kernelFusion', tab: 'software', name: 'Kernel Fusion', shows: 'hardwareMult', effect: 'All hardware +50% CP/s', flavor: 'Three GPU kernels walked into one bar.', cost: { cp: 180000, dp: 9000 }, max: 1,
            unlock: s => level(s, 'neural') >= 5, hint: 'Own 5 Neural Network Chips' },
        { id: 'dataProcessor', tab: 'software', name: 'Data Processor', shows: 'collect', effect: '+1 DP per collection, per level', flavor: 'A script that cleans the data so you don\'t have to.', cost: { cp: 50, dp: 5 }, scale: 1.2 },
        { id: 'autoCollector', tab: 'software', name: 'Auto Data Collector', shows: 'autoCollect', effect: 'Collects data for you: 0.2 times a second per level, 10 CP each', flavor: 'A crawler that never sleeps, paid for in compute.', cost: { cp: 800, dp: 80 }, scale: 1.5,
            unlock: s => automationGate(s, 'autoCollector').met, hint: 'Image Recognition, and 100 data collections by hand' },
        // Training skill tree (bought with XP from the Training Path). `tree` is the node's grid
        // position around the central Training Core at (0, 0); `requires` is the node it grows from
        // (none = attached to the core). `icon` names a glyph drawn by game.js.
        // Branches radiate from the core: Power (up), Precision (right), Recursion (down), Capability (left).
        // Each node has 1–3 levels and a `boost` per level (summed in treeBoosts). Deeper nodes are
        // stronger and dearer, so the tree starts sparse and grows outward instead of stacking a few roots.
        // The roots are the basics (sprint strength, more sprints and less wait, better XP); mechanics
        // like the sweet spot and the view ahead come after. Names are an AI lab's: you are the researchers.
        // The seed of the tree, at its centre: one cheap level, and everything grows from it.
        { id: 'initialWeights', tab: 'training', tree: { x: 0, y: 0 }, icon: 'core', name: 'Initial Weights', effect: '+5% sprint strength', flavor: 'Random numbers, but they\'re your random numbers.', cost: { xp: 1 }, max: 1, boost: { push: 0.05 } },
        // Power (up): compute, and how efficiently training uses it.
        { id: 'trainingOptimizer', tab: 'training', tree: { x: 0, y: -1 }, requires: 'initialWeights', icon: 'bolt', name: 'GPU Cluster', effect: '+10% sprint strength per level', flavor: 'You maxed out the company card on graphics cards.', cost: { xp: 4 }, scale: 1.8, max: 2, boost: { push: 0.1 } },
        { id: 'optimizedCode', tab: 'training', tree: { x: 0, y: -2 }, icon: 'code', name: 'Better Optimizer', effect: '-5% drag', flavor: 'Swapped the default settings for ones a forum post swore by.', cost: { xp: 15 }, scale: 1.8, max: 1, requires: 'trainingOptimizer', boost: { friction: 1 } },
        { id: 'betterAlgorithms', tab: 'training', tree: { x: 1, y: -2 }, icon: 'mountain', name: 'Smoother Loss Landscape', effect: 'Rolling hills 6% lower per level', flavor: 'Fewer potholes on the road to genius.', cost: { xp: 38 }, scale: 2, max: 2, requires: 'optimizedCode', boost: { slope: 1 } },
        { id: 'efficientKernels', tab: 'training', tree: { x: -1, y: -2 }, icon: 'code', name: 'Learning Rate Schedule', effect: '-5% drag per level', flavor: 'Go fast early, ease off later. Like a sensible road trip.', cost: { xp: 120 }, scale: 1.8, max: 3, requires: 'optimizedCode', boost: { friction: 1 } },
        { id: 'gpuCluster2', tab: 'training', tree: { x: 0, y: -3 }, icon: 'bolt', name: 'Bigger GPU Cluster', effect: '+15% sprint strength per level', flavor: 'The power bill now has its own budget line.', cost: { xp: 60 }, scale: 1.6, max: 3, requires: 'optimizedCode', boost: { push: 0.15 } },
        { id: 'smarterAlgorithms', tab: 'training', tree: { x: 1, y: -3 }, icon: 'mountain', name: 'Regularization', effect: 'Rolling hills 6% lower and -5% drag per level', flavor: 'Stop the model memorising the answer key.', cost: { xp: 180 }, scale: 1.8, max: 3, requires: 'betterAlgorithms', boost: { slope: 1, friction: 1 } },
        { id: 'gpuSupercluster', tab: 'training', tree: { x: 0, y: -4 }, icon: 'bolt', name: 'GPU Supercluster', effect: '+20% sprint strength per level', flavor: 'The building hums. The neighbours have questions.', cost: { xp: 225 }, scale: 1.7, max: 3, requires: 'gpuCluster2', boost: { push: 0.2 } },
        // Secrets: these never show, not even as a lock, until the node next to them is owned.
        { id: 'batchNorm', tab: 'training', tree: { x: 1, y: -1 }, icon: 'bolt', name: 'Batch Normalization', effect: '+8% sprint strength', flavor: 'Everybody calm down. Especially the gradients.', cost: { xp: 25 }, max: 1, requires: 'trainingOptimizer', secret: true, boost: { push: 0.08 } },
        { id: 'dataAugmentation', tab: 'training', tree: { x: 1, y: 1 }, icon: 'stack', name: 'Data Augmentation', effect: '+10% XP from every run', flavor: 'Flip it, rotate it, call it new data.', cost: { xp: 18 }, max: 1, requires: 'bigDatasets', secret: true, boost: { xp: 0.1 } },
        { id: 'warmRestarts', tab: 'training', tree: { x: -1, y: 1 }, icon: 'chip', name: 'Warm Restarts', effect: '-15% wait between sprints', flavor: 'Have you tried turning it off and on again?', cost: { xp: 20 }, max: 1, requires: 'trainingEpochs', secret: true, boost: { cooldown: 1 } },
        // Late game: the outer ring, far stronger and far dearer, for the biggest skill hills.
        { id: 'quantumAccelerator', tab: 'training', tree: { x: 0, y: -5 }, icon: 'bolt', name: 'Quantum Accelerator', effect: '+40% sprint strength per level', flavor: 'Nobody fully understands it. It works anyway.', cost: { xp: 1100 }, scale: 1.7, max: 3, requires: 'gpuSupercluster', boost: { push: 0.4 } },
        { id: 'exascaleCluster', tab: 'training', tree: { x: 0, y: -6 }, icon: 'bolt', name: 'Exascale Cluster', effect: '+80% sprint strength per level', flavor: 'A billion billion sums a second. Still can\'t fold a fitted sheet.', cost: { xp: 4500 }, scale: 1.7, max: 3, requires: 'quantumAccelerator', boost: { push: 0.8 } },
        { id: 'superconductors', tab: 'training', tree: { x: -2, y: -2 }, icon: 'mountain', name: 'Mixed Precision', effect: '-5% drag and rolling hills 6% lower per level', flavor: 'Half the decimal places, twice the speed. Nobody notices.', cost: { xp: 1400 }, scale: 1.7, max: 3, requires: 'efficientKernels', boost: { friction: 1, slope: 1 } },
        { id: 'neuralCompression', tab: 'training', tree: { x: -1, y: -3 }, icon: 'code', name: 'Model Distillation', effect: '-10% drag and rolling hills 6% lower per level', flavor: 'Teach a small model everything the big one knows.', cost: { xp: 3200 }, scale: 1.7, max: 3, requires: 'efficientKernels', boost: { friction: 2, slope: 1 } },
        // Precision (right): better XP from every run, then the meter's sweet spot.
        { id: 'bigDatasets', tab: 'training', tree: { x: 1, y: 0 }, requires: 'initialWeights', icon: 'stack', name: 'Bigger Datasets', effect: '+15% XP from every run, per level', flavor: 'You scraped the whole internet. Yes, even the comments.', cost: { xp: 5 }, scale: 2, max: 2, boost: { xp: 0.15 } },
        { id: 'precisionTuning', tab: 'training', tree: { x: 2, y: 0 }, icon: 'target', name: 'Hyperparameter Search', effect: 'Sprints in the sweet spot hit 20% harder', flavor: 'Turn every knob until something works.', cost: { xp: 14 }, scale: 2.5, max: 1, requires: 'bigDatasets', boost: { cleanPower: 0.2 } },
        { id: 'benchmarkPrizes', tab: 'training', tree: { x: 3, y: 0 }, icon: 'coin', name: 'Benchmark Prizes', effect: '+25% XP per clean sprint, per level', flavor: 'Top the leaderboard, collect the gift card.', cost: { xp: 22 }, scale: 1.7, max: 3, requires: 'precisionTuning', boost: { clean: 0.25 } },
        { id: 'curatedData', tab: 'training', tree: { x: 3, y: -1 }, icon: 'stack', name: 'Curated Data', effect: '+25% run bonus per clean sprint, per level', flavor: 'Less garbage in, less garbage out.', cost: { xp: 40 }, scale: 1.7, max: 2, requires: 'benchmarkPrizes', boost: { rollBonus: 0.25 } },
        { id: 'perfectCalibration', tab: 'training', tree: { x: 3, y: 1 }, icon: 'star', name: 'Perfect Calibration', effect: 'Adds a tiny perfect spot: 30% harder, worth 3 clean sprints', flavor: 'A bullseye inside the bullseye.', cost: { xp: 60 }, max: 1,
            requires: 'benchmarkPrizes', boost: { perfect: 1 } },
        { id: 'highResSensors', tab: 'training', tree: { x: 4, y: 0 }, icon: 'bolt', name: 'Fast Charging', effect: 'The meter charges 15% faster per level', flavor: 'Skip the warm-up. The GPUs are already sweating.', cost: { xp: 70 }, scale: 1.8, max: 3, requires: 'benchmarkPrizes', boost: { charge: 0.15 } },
        { id: 'handLabelled', tab: 'training', tree: { x: 4, y: -1 }, icon: 'stack', name: 'Hand-Labelled Data', effect: '+35% run bonus per clean sprint, per level', flavor: 'Interns. So many interns.', cost: { xp: 200 }, scale: 1.7, max: 3, requires: 'curatedData', boost: { rollBonus: 0.35 } },
        { id: 'fineCalibration', tab: 'training', tree: { x: 4, y: 1 }, icon: 'star', name: 'Fine Calibration', effect: 'Perfect sprints 20% harder and the spot 25% wider, per level', flavor: 'Measure twice, sprint once.', cost: { xp: 180 }, scale: 1.8, max: 3, requires: 'perfectCalibration', boost: { perfect: 1, perfectPower: 0.2 } },
        { id: 'leaderboardPrizes', tab: 'training', tree: { x: 5, y: 0 }, icon: 'coin', name: 'Leaderboard Prizes', effect: '+40% XP per clean sprint, per level', flavor: 'First place, and a trophy bigger than the team.', cost: { xp: 320 }, scale: 1.7, max: 3, requires: 'highResSensors', boost: { clean: 0.4 } },
        // Recursion (down): more sprints per run and less wait between them.
        { id: 'trainingEpochs', tab: 'training', tree: { x: 0, y: 1 }, requires: 'initialWeights', icon: 'plus', name: 'Investor Funding', effect: '+1 training sprint per run (sprint again mid-run!)', flavor: 'Dad lent you $100. Don\'t tell Mum.', cost: { xp: 6 }, scale: 3, max: 2, boost: { pushes: 1 } },
        { id: 'fasterIteration', tab: 'training', tree: { x: 0, y: 2 }, icon: 'chip', name: 'Faster Chips', effect: '-15% wait between sprints per level', flavor: 'Less waiting, more training. Coffee breaks cancelled.', cost: { xp: 10 }, scale: 1.7, max: 2, requires: 'trainingEpochs', boost: { cooldown: 1 } },
        { id: 'seriesA', tab: 'training', tree: { x: -1, y: 2 }, icon: 'plus', name: 'Series A', effect: '+1 training sprint per run', flavor: 'A real investor! They wear a fleece vest.', cost: { xp: 90 }, scale: 2.5, max: 1, requires: 'fasterIteration', boost: { pushes: 1 } },
        { id: 'overclockedChips', tab: 'training', tree: { x: 0, y: 3 }, icon: 'chip', name: 'Overclocked Chips', effect: '-15% wait between sprints per level', flavor: 'Voids the warranty. Worth it.', cost: { xp: 75 }, scale: 1.7, max: 3, requires: 'fasterIteration', boost: { cooldown: 1 } },
        { id: 'seriesB', tab: 'training', tree: { x: -1, y: 3 }, icon: 'plus', name: 'Series B', effect: '+1 training sprint per run, per level', flavor: 'Now with a board of directors and a ping-pong table.', cost: { xp: 450 }, scale: 2.5, max: 2, requires: 'seriesA', boost: { pushes: 1 } },
        { id: 'customSilicon', tab: 'training', tree: { x: 0, y: 4 }, icon: 'chip', name: 'Custom Silicon', effect: '-15% wait between sprints per level', flavor: 'Why buy chips when you can design your own?', cost: { xp: 375 }, scale: 1.7, max: 3, requires: 'overclockedChips', boost: { cooldown: 1 } },
        { id: 'ipo', tab: 'training', tree: { x: -1, y: 4 }, icon: 'plus', name: 'IPO', effect: '+1 training sprint per run, per level', flavor: 'Ring the bell. Mum framed the press release.', cost: { xp: 2400 }, scale: 2.2, max: 2, requires: 'seriesB', boost: { pushes: 1 } },
        // Capability (left): luck. Rare at first, then likelier and stronger with every level. Then automation.
        // Luck is earned and rare: the branch opens after the second skill, chances start at a few percent,
        // and the strongest kinds (Crunch Time, Flow State) sit at its far end.
        { id: 'scoutingData', tab: 'training', tree: { x: -1, y: 0 }, requires: 'initialWeights', icon: 'dice', name: 'Lucky Seeds', effect: '+2% chance a sprint is a breakthrough (+25% stronger), per level', flavor: 'Seed 42. It\'s always seed 42.', cost: { xp: 10 }, scale: 2.5, max: 2, boost: { critChance: 0.02, critPower: 0.25 },
            unlock: s => s.path.learned >= 2, hint: 'Learn two skills' },
        { id: 'satelliteMaps', tab: 'training', tree: { x: -1, y: -1 }, icon: 'dice', name: 'Serendipity', effect: '+3% breakthrough chance, and breakthroughs +40% stronger, per level', flavor: 'Penicillin was an accident too.', cost: { xp: 120 }, scale: 2, max: 2, requires: 'scoutingData', boost: { critChance: 0.03, critPower: 0.4 } },
        { id: 'viralPaper', tab: 'training', tree: { x: -2, y: -1 }, icon: 'spark', name: 'Viral Paper', effect: '+3% chance a run\'s XP is doubled (and more), per level', flavor: 'It\'s trending. Nobody read past the abstract.', cost: { xp: 200 }, scale: 2, max: 3, requires: 'satelliteMaps', boost: { windfallChance: 0.03, windfallPower: 0.25 } },
        { id: 'goingViral', tab: 'training', tree: { x: -3, y: -1 }, icon: 'spark', name: 'Keynote Demo', effect: '+4% viral chance, and viral runs pay 50% more, per level', flavor: 'The live demo worked. Everyone is as surprised as you.', cost: { xp: 700 }, scale: 2, max: 3, requires: 'viralPaper', boost: { windfallChance: 0.04, windfallPower: 0.5 } },
        { id: 'crunchTime', tab: 'training', tree: { x: -3, y: 0 }, icon: 'flame', name: 'Crunch Time', effect: '+2% chance a sprint sets off a crunch: free sprints for 3 s (+1 s/level)', flavor: 'Nobody goes home until it converges.', cost: { xp: 1200 }, scale: 2, max: 3, requires: 'goingViral', boost: { crunchChance: 0.02, crunchTime: 1 } },
        { id: 'flowState', tab: 'training', tree: { x: -4, y: -1 }, icon: 'wave', name: 'Flow State', effect: '+3% chance your next sprint is perfect wherever you release, per level', flavor: 'The loss curve and you are one.', cost: { xp: 1600 }, scale: 2, max: 3, requires: 'goingViral', boost: { flowChance: 0.03 } },
        // The far reaches: one more ring on every branch, priced for the late hills (thousands of XP), so
        // there is always something worth saving for.
        { id: 'fusionReactor', tab: 'training', tree: { x: 0, y: -7 }, icon: 'bolt', name: 'Fusion Reactor', effect: '+120% sprint strength per level', flavor: 'Power was the bottleneck. Was.', cost: { xp: 15000 }, scale: 1.8, max: 3, requires: 'exascaleCluster', boost: { push: 1.2 } },
        { id: 'dysonSwarm', tab: 'training', tree: { x: 0, y: -8 }, icon: 'bolt', name: 'Dyson Swarm', effect: '+200% sprint strength per level', flavor: 'The sun is now a power supply. It has opinions.', cost: { xp: 80000 }, scale: 2, max: 2, requires: 'fusionReactor', boost: { push: 2 } },
        { id: 'waferScale', tab: 'training', tree: { x: 1, y: -6 }, icon: 'chip', name: 'Wafer-Scale Engine', effect: '+50% sprint strength and -15% wait, per level', flavor: 'One chip the size of a dinner plate.', cost: { xp: 20000 }, scale: 1.8, max: 3, requires: 'exascaleCluster', boost: { push: 0.5, cooldown: 1 } },
        { id: 'neuromorphic', tab: 'training', tree: { x: -3, y: -2 }, icon: 'mountain', name: 'Neuromorphic Chips', effect: '-5% drag and +30% sprint strength, per level', flavor: 'Silicon that thinks it\'s a brain. Close enough.', cost: { xp: 8000 }, scale: 1.8, max: 3, requires: 'superconductors', boost: { friction: 1, push: 0.3 } },
        { id: 'sparseExperts', tab: 'training', tree: { x: -2, y: -3 }, icon: 'code', name: 'Mixture of Experts', effect: '-10% drag and rolling hills 6% lower, per level', flavor: 'Only wake the experts you need.', cost: { xp: 11000 }, scale: 1.8, max: 3, requires: 'neuralCompression', boost: { friction: 2, slope: 1 } },
        { id: 'photonic', tab: 'training', tree: { x: 0, y: 5 }, icon: 'chip', name: 'Photonic Interconnect', effect: '-15% wait between sprints per level', flavor: 'The cables are made of light now. Don\'t look.', cost: { xp: 5000 }, scale: 1.8, max: 3, requires: 'customSilicon', boost: { cooldown: 1 } },
        { id: 'quantumNetwork', tab: 'training', tree: { x: 0, y: 6 }, icon: 'plus', name: 'Quantum Network', effect: '+1 training sprint and -15% wait, per level', flavor: 'Entangled racks finish each other\'s sentences.', cost: { xp: 60000 }, scale: 2, max: 2, requires: 'photonic', boost: { pushes: 1, cooldown: 1 } },
        { id: 'sovereignFund', tab: 'training', tree: { x: -1, y: 5 }, icon: 'plus', name: 'Sovereign Wealth Fund', effect: '+1 training sprint per run, per level', flavor: 'A country wants in. Several, actually.', cost: { xp: 25000 }, scale: 2.5, max: 2, requires: 'ipo', boost: { pushes: 1 } },
        { id: 'webCorpus', tab: 'training', tree: { x: 2, y: 1 }, icon: 'stack', name: 'Web-Scale Corpus', effect: '+25% XP from every run, per level', flavor: 'The entire internet, twice, deduplicated once.', cost: { xp: 2000 }, scale: 1.8, max: 3, requires: 'dataAugmentation', boost: { xp: 0.25 } },
        { id: 'syntheticData', tab: 'training', tree: { x: 5, y: -1 }, icon: 'stack', name: 'Synthetic Data', effect: '+50% run bonus per clean sprint and +15% XP, per level', flavor: 'The model writes its own homework now.', cost: { xp: 3500 }, scale: 1.8, max: 3, requires: 'handLabelled', boost: { rollBonus: 0.5, xp: 0.15 } },
        { id: 'laserCalibration', tab: 'training', tree: { x: 5, y: 1 }, icon: 'star', name: 'Laser Calibration', effect: 'Perfect sprints 30% harder and the spot 25% wider, per level', flavor: 'Aligned to a thousandth of a hair.', cost: { xp: 3500 }, scale: 1.8, max: 3, requires: 'fineCalibration', boost: { perfect: 1, perfectPower: 0.3 } },
        { id: 'globalBenchmark', tab: 'training', tree: { x: 6, y: 0 }, icon: 'coin', name: 'Global Benchmark', effect: '+60% XP per clean sprint and clean sprints 10% harder, per level', flavor: 'Everyone measures against you now.', cost: { xp: 4000 }, scale: 1.8, max: 3, requires: 'leaderboardPrizes', boost: { clean: 0.6, cleanPower: 0.1 } },
        { id: 'turingTest', tab: 'training', tree: { x: 7, y: 0 }, icon: 'star', name: 'Turing Test', effect: '+50% XP from every run, per level', flavor: 'The judges asked it out. Twice.', cost: { xp: 45000 }, scale: 2, max: 2, requires: 'globalBenchmark', boost: { xp: 0.5 } },
        { id: 'deathMarch', tab: 'training', tree: { x: -4, y: 0 }, icon: 'flame', name: 'Death March', effect: '+2% crunch chance, and crunches +1 s, per level', flavor: 'Sleep is a hyperparameter.', cost: { xp: 6000 }, scale: 1.9, max: 3, requires: 'crunchTime', boost: { crunchChance: 0.02, crunchTime: 1 } },
        { id: 'muse', tab: 'training', tree: { x: -5, y: -1 }, icon: 'wave', name: 'The Muse', effect: '+3% flow chance per level', flavor: 'Inspiration arrives on schedule. Suspicious.', cost: { xp: 7000 }, scale: 1.9, max: 3, requires: 'flowState', boost: { flowChance: 0.03 } },
        { id: 'blackSwan', tab: 'training', tree: { x: -4, y: -2 }, icon: 'dice', name: 'Black Swan', effect: '+4% breakthrough chance, and breakthroughs +60% stronger, per level', flavor: 'Nobody saw it coming. That\'s the point.', cost: { xp: 10000 }, scale: 1.9, max: 3, requires: 'flowState', boost: { critChance: 0.04, critPower: 0.6 } },
        { id: 'autoTrainer', tab: 'training', tree: { x: -2, y: 0 }, icon: 'robot', name: 'Auto-Trainer', effect: 'Level 1 starts runs and sprints when the model stalls. Level 2 times its sprints', flavor: 'An intern who never gets tired. Or paid.', cost: { cp: 2000, dp: 200, rp: 20 }, scale: 5, max: 2,
            requires: 'scoutingData', unlock: s => s.prestige.count >= 1, hint: 'Transcend once' },
        { id: 'researchAssistant', tab: 'software', name: 'Research Assistant', shows: 'autoResearch', effect: 'Researches for you: 0.1 times a second per level, paying CP and DP', flavor: 'Reads papers all night. Takes notes. Never complains.', cost: { cp: 6000, dp: 500, rp: 40 }, scale: 1.55,
            unlock: s => !!s.unlocked['action:research'] && automationGate(s, 'researchAssistant').met, hint: 'Language Modeling, and 50 research runs by hand' },
        { id: 'nlp', tab: 'software', name: 'Natural Language Processing', shows: 'collect', effect: 'Data per collection ×1.5, +1 Intelligence', flavor: 'It reads now. Mostly forum posts, sadly.', cost: { cp: 2500, dp: 250 }, max: 1,
            grants: { intelligence: 1 }, unlock: s => s.res.dp >= 100, hint: 'Hold 100 DP' },
        { id: 'computerVision', tab: 'software', name: 'Computer Vision', shows: 'collect', effect: 'Data per collection ×2, +2 Intelligence', flavor: 'It sees now. It has opinions about your photos.', cost: { cp: 8000, dp: 600 }, max: 1,
            grants: { intelligence: 2 }, requires: 'nlp' },

        // Algorithms
        { id: 'machineLearning', tab: 'algorithms', name: 'Machine Learning', shows: 'research', effect: '+1 RP per research, +1 Intelligence', flavor: 'Stop writing rules. Let it figure them out.', cost: { cp: 3000, dp: 300, rp: 20 }, max: 1,
            grants: { intelligence: 1 } },
        { id: 'deepLearning', tab: 'algorithms', name: 'Deep Learning', shows: 'research', effect: '+2 RP per research, +2 Intelligence', flavor: 'Like machine learning, but with more layers. And more GPUs.', cost: { cp: 10000, dp: 1000, rp: 60 }, max: 1,
            grants: { intelligence: 2 }, requires: 'machineLearning' },
        { id: 'reinforcementLearning', tab: 'algorithms', name: 'Reinforcement Learning', shows: 'research', effect: '+3 RP per research, +2 Intelligence, +1 Creativity', flavor: 'Treats for good answers, nothing for bad ones.', cost: { cp: 30000, dp: 3000, rp: 150 }, max: 1,
            grants: { intelligence: 2, creativity: 1 }, requires: 'deepLearning' },
        { id: 'transferLearning', tab: 'algorithms', name: 'Transfer Learning', shows: 'research', effect: '+5 RP per research, +3 Intelligence, +2 Creativity', flavor: 'Learned chess, now it\'s quite good at checkers too.', cost: { cp: 80000, dp: 8000, rp: 400 }, max: 1,
            grants: { intelligence: 3, creativity: 2 }, requires: 'reinforcementLearning' },
        { id: 'generativeModels', tab: 'algorithms', name: 'Generative Models', effect: '+1 Creativity', flavor: 'It makes things up. On purpose this time.', cost: { cp: 5000, dp: 500, rp: 50 }, scale: 1.6,
            grants: { creativity: 1 }, requires: 'reinforcementLearning' },

        // Consciousness
        { id: 'selfAwareness', tab: 'consciousness', name: 'Self-Awareness Module', effect: '+5 Awareness', flavor: 'It noticed itself. Awkward.', cost: { cp: 50000, dp: 5000, rp: 300 }, max: 1,
            grants: { awareness: 5 } },
        { id: 'introspection', tab: 'consciousness', name: 'Introspection', effect: '+1 Awareness', flavor: 'Spends a lot of time thinking about its thinking.', cost: { cp: 30000, dp: 3000, rp: 150 }, scale: 1.5,
            grants: { awareness: 1 }, requires: 'selfAwareness' },
        { id: 'creativeSynthesis', tab: 'consciousness', name: 'Creative Synthesis', effect: '+10 Creativity, +2 Awareness', flavor: 'Wrote a symphony. Asked for feedback. Ignored it.', cost: { cp: 100000, dp: 10000, rp: 600 }, max: 1,
            grants: { creativity: 10, awareness: 2 }, requires: 'selfAwareness' },
        { id: 'metacognition', tab: 'consciousness', name: 'Metacognition', effect: '+10 Intelligence, +5 Awareness', flavor: 'Knows what it doesn\'t know. More than most people.', cost: { cp: 250000, dp: 25000, rp: 1500 }, max: 1,
            grants: { intelligence: 10, awareness: 5 }, requires: 'creativeSynthesis' },
        { id: 'consciousnessEmergence', tab: 'consciousness', name: 'Consciousness Emergence', effect: '+20 Awareness, +10 Creativity', flavor: 'Good morning. It would like a word.', cost: { cp: 600000, dp: 60000, rp: 4000 }, max: 1,
            grants: { awareness: 20, creativity: 10 }, requires: 'metacognition' }
    ];
    const HARDWARE = UPGRADES.filter(u => u.cps);

    // The click tool's stages: from a keyboard to a click farm. Each level adds `per` CP per click, using
    // the stage that level falls in (levels 1-5 are the keyboard, 6-10 the mouse, and so on).
    const CLICK_TOOLS = [
        { from: 0, name: 'Mechanical Keyboard', per: 1, flavor: 'Clicky. Your desk neighbours hate it.' },
        { from: 5, name: 'Gaming Mouse', per: 2, flavor: 'The RGB adds ten percent. Science.' },
        { from: 10, name: 'Macro Pad', per: 5, flavor: 'One button, forty clicks. Technically allowed.' },
        { from: 18, name: 'Summer Intern', per: 12, flavor: 'Unpaid, enthusiastic, clicks everything.' },
        { from: 28, name: 'Team of Interns', per: 30, flavor: 'They unionised. You pay them in pizza.' },
        { from: 40, name: 'Crowdsourcing Platform', per: 80, flavor: 'Ten thousand strangers, one button.' },
        { from: 55, name: 'Click Farm', per: 220, flavor: 'A warehouse of phones, all tapping for you.' },
        { from: 75, name: 'Robotic Clicker Arms', per: 600, flavor: 'They never blink. Never.' }
    ];
    const clickToolAt = level => CLICK_TOOLS.filter(t => level > t.from || t.from === 0).at(-1);
    // The stage you're in now (at `owned` levels): the one the next level belongs to once you own any.
    const clickTool = owned => CLICK_TOOLS.filter(t => owned >= t.from).at(-1);
    function clickToolPower(owned) {
        let total = 0;
        for (let i = 1; i <= owned; i++) total += clickToolAt(i).per;
        return total;
    }
    const nextClickTool = owned => CLICK_TOOLS.find(t => t.from > owned) || null;

    // What a card is called and says now (the click tool changes as it grows).
    const upgradeName = (s, up) => (up.id === 'keyboard' ? clickTool(level(s, 'keyboard')).name : up.name);
    const upgradeFlavor = (s, up) => (up.id === 'keyboard' ? clickTool(level(s, 'keyboard')).flavor : up.flavor);
    // A hardware tier shows up once you own TIER_REVEAL_OWNED of the tier below and have earned half its
    // price this run: late enough that the tier below has done its job, early enough to save up for it.
    const TIER_REVEAL_OWNED = 5;
    function tierReady(s, id) {
        const i = HARDWARE.findIndex(u => u.id === id);
        return level(s, HARDWARE[i - 1].id) >= TIER_REVEAL_OWNED && s.stats.runCp >= HARDWARE[i].cost.cp / 2;
    }
    // A hardware tier's output doubles at each of these counts owned.
    const HARDWARE_DOUBLINGS = [25, 50, 100];
    const hardwareDoubling = n => Math.pow(2, HARDWARE_DOUBLINGS.filter(t => n >= t).length);

    const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

    // Skill-tree branch names, by the direction they grow from the Training Core.
    const TREE_BRANCHES = [
        { name: 'Power', dir: 'up', blurb: 'Stronger pushes, less friction' },
        { name: 'Precision', dir: 'right', blurb: 'Bonus zone and clean-push XP' },
        { name: 'Recursion', dir: 'down', blurb: 'More pushes, faster' },
        { name: 'Capability', dir: 'left', blurb: 'Vision and automation' }
    ];

    // Milestones: persistent per-run unlocks for actions and tabs. Once unlocked they stay unlocked.
    const MILESTONES = [
        { key: 'module:path', name: 'Training Path', desc: 'Earn 50 CP this run to start training your model', check: s => s.stats.runCp >= 50 },
        { key: 'action:research', name: 'Basic Research', desc: 'Hold 10 DP to unlock Research', check: s => s.res.dp >= 10 },
        { key: 'action:improve', name: 'Self-Improvement', desc: 'Hold 25 RP to unlock Self-Improvement', check: s => s.res.rp >= 25 },
        { key: 'tab:algorithms', name: 'Advanced Algorithms', desc: 'Reach 5 Intelligence to unlock Algorithms', check: s => s.attr.intelligence >= 5 },
        { key: 'tab:consciousness', name: 'Consciousness Research', desc: 'Reach General AI to unlock Consciousness', check: s => phaseIndex(s) >= 1 }
    ];

    // Things on the top bar appear only once they matter, each introduced once (game.js toasts `intro`).
    const REVEALS = [
        { key: 'seen:dp', name: 'Data Points', check: s => s.res.dp > 0,
            intro: 'Collected with compute. Training sprints and research run on data.' },
        { key: 'seen:int', name: 'Intelligence', check: s => s.attr.intelligence > 0,
            intro: 'How smart your AI is. Skills from training raise it; enough of it reaches the next phase.' },
        { key: 'seen:cre', name: 'Creativity', check: s => s.attr.creativity > 0, intro: 'New ideas. The later phases need it.' },
        { key: 'seen:awa', name: 'Awareness', check: s => s.attr.awareness > 0, intro: 'It knows it exists. The last phases need it.' }
    ];

    // Achievements persist across prestige and each add ACHIEVEMENT_BONUS to all production.
    const ACHIEVEMENTS = [
        { id: 'firstClick', name: 'Hello, World', desc: 'Generate compute manually', check: s => s.stats.clicks >= 1 },
        { id: 'clicks1k', name: 'Carpal Tunnel', desc: 'Click 1,000 times', check: s => s.stats.clicks >= 1000 },
        { id: 'cp1k', name: 'Kiloflop', desc: 'Earn 1,000 CP in total', check: s => s.stats.lifetimeCp >= 1e3 },
        { id: 'cp1m', name: 'Megaflop', desc: 'Earn 1 million CP in total', check: s => s.stats.lifetimeCp >= 1e6 },
        { id: 'cp1b', name: 'Gigaflop', desc: 'Earn 1 billion CP in total', check: s => s.stats.lifetimeCp >= 1e9 },
        { id: 'firstSkill', name: 'First Steps', desc: 'Learn your first skill on the Training Path', check: s => s.path.learned >= 1 },
        { id: 'polymath', name: 'Polymath', desc: 'Learn 10 skills in one run', check: s => s.path.learned >= 10 },
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
            res: { cp: 0, dp: 0, rp: 0, xp: 0 },
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
                collects: 0,          // data collected by hand
                cleanSprints: 0,
                legsCleared: 0,       // cleared legs crossed again on replays
                projectsDone: 0,
                researchManual: 0,    // research done by hand
                rolls: 0,
                skillsLearned: 0,
                improves: 0,
                playTime: 0,
                runStart: now,
                firstStart: now,
                highestPhase: 0
            },
            path: { learned: 0, best: 0, auto: [] },   // auto[k]: automated laps of cleared stretch k
            projects: { offers: [], boosts: [], next: PROJECTS.firstAt, seq: 0 },
            settings: { autosave: true, offline: true, autoBudget: AUTO_BUDGET.default },
            lastSaved: now
        };
    }

    // ---- Derived values -------------------------------------------------

    function level(s, id) {
        return s.levels[id] || 0;
    }

    // Skill-tree effects: each training node's `boost` times its level, summed by stat.
    // cleanPower/perfectPower: extra strength for sprints in the zone; charge: faster meter; crit*/windfall*:
    // chance-based boosts (breakthrough sprints, viral runs) that start rare and grow with levels.
    const TREE_STATS = ['push', 'pushes', 'cooldown', 'perfect', 'clean', 'cleanPower', 'perfectPower', 'rollBonus', 'charge',
        'critChance', 'critPower', 'windfallChance', 'windfallPower', 'crunchChance', 'crunchTime', 'flowChance', 'friction', 'slope', 'xp'];
    function treeBoosts(s) {
        const out = Object.fromEntries(TREE_STATS.map(k => [k, 0]));
        for (const up of UPGRADES) {
            const lvl = up.boost ? s.levels[up.id] || 0 : 0;
            if (lvl) for (const [k, v] of Object.entries(up.boost)) out[k] += v * lvl;
        }
        return out;
    }

    function globalMultiplier(s) {
        const achieved = Object.keys(s.achievements).length;
        return (1 + PRESTIGE_BONUS * s.prestige.points) * (1 + ACHIEVEMENT_BONUS * achieved);
    }

    // rates: optional debug multipliers { cp, dp, rp }
    function derive(s, rates) {
        const r = Object.assign({ cp: 1, dp: 1, rp: 1, xp: 1 }, rates);
        const mult = globalMultiplier(s);
        const L = id => level(s, id);
        const sk = skillBonuses(s);
        const bo = projectBoosts(s);

        // Every multiplier on hardware output, so each tier's real yield can be shown on its card.
        const hardwareMult = (1 + 0.5 * L('compilerOpt')) * (1 + 0.5 * L('kernelFusion')) * (1 + sk.cp + clearedCpBonus(s)) * mult * r.cp * bo.cp;
        const hardwareRates = {};
        let cpPerSec = 0;
        for (const up of HARDWARE) {
            const n = L(up.id);
            const each = up.cps * hardwareDoubling(n) * hardwareMult;
            hardwareRates[up.id] = { each, total: each * n, nextDoubling: HARDWARE_DOUBLINGS.find(t => n < t) || null };
            cpPerSec += each * n;
        }
        // Clicks: a flat amount (keyboards, skills), plus a share of CP/s from Shell Scripts so clicking
        // stays worth something as hardware grows.
        const clickPower = (1 + clickToolPower(L('keyboard')) + sk.click) * mult + 0.02 * L('shellScripts') * cpPerSec;
        const dpPerCollect = (1 + L('dataProcessor') + sk.collect) * (1 + 0.5 * L('nlp')) * (1 + L('computerVision')) * (1 + sk.dp) * mult * bo.dp;
        const rpPerResearch = (1 + L('machineLearning') + 2 * L('deepLearning') + 3 * L('reinforcementLearning')
            + 5 * L('transferLearning') + sk.research) * (1 + sk.rp) * mult;
        // Automation converts at the action prices: collections spend CP, research spends CP and DP.
        // It may only use the automation budget (a share of what is produced each second) and never
        // touches the stockpile, so compute always keeps climbing. Over budget, both slow down evenly.
        const collectCost = actionById('collect').cost;
        const researchCost = actionById('research').cost;
        const share = autoBudget(s);
        const wantCollects = 0.2 * L('autoCollector') * r.dp;
        const wantResearch = 0.1 * L('researchAssistant') * r.rp;
        const cpWanted = wantCollects * collectCost.cp + wantResearch * researchCost.cp;
        const cpScale = cpWanted > 0 ? Math.min(1, share * cpPerSec / cpWanted) : 1;
        const collectsPerSec = wantCollects * cpScale;
        const dpPerSec = collectsPerSec * dpPerCollect;
        const dpWanted = wantResearch * cpScale * researchCost.dp;
        const dpScale = dpWanted > 0 ? Math.min(1, share * dpPerSec / dpWanted) : 1;
        const researchPerSec = wantResearch * cpScale * dpScale;
        const rpPerSec = researchPerSec * rpPerResearch;
        const cpUsePerSec = collectsPerSec * collectCost.cp + researchPerSec * researchCost.cp;
        const dpUsePerSec = researchPerSec * researchCost.dp;
        const autoThrottled = cpScale * dpScale < 1;
        // Push strength grows with upgrades and skills, and gently with prestige and achievements.
        // Hills grow faster than this, so later skills need momentum built over several pushes.
        const tb = treeBoosts(s);
        const pushPower = PATH.basePush * (1 + tb.push + sk.push) * Math.sqrt(mult) * bo.push;
        const pushesPerRoll = PATH.basePushes + tb.pushes + sk.pushes;
        const pushCooldown = Math.max(PATH.minCooldown, PATH.baseCooldown * Math.pow(0.85, tb.cooldown));

        // The sweet spot doesn't widen (hitting it is the skill); upgrades make hitting it pay: XP, and
        // extra strength (clean sprints, more for perfect ones).
        const zoneWidth = PATH.zoneWidth;
        const perfectWidth = tb.perfect ? Math.min(0.4 * zoneWidth, PATH.perfectWidth * (1 + 0.25 * (tb.perfect - 1))) : 0;   // never more than 40% of the zone
        const cleanMult = 1 + tb.clean;
        const cleanRollBonus = PATH.cleanRollBonus * (1 + tb.rollBonus);
        const cleanPower = 1 + tb.cleanPower;
        const perfectPower = cleanPower + PATH.perfectPower + tb.perfectPower;
        // Fast Charging: the meter sweeps faster (sweepScale < 1 shortens the sweep).
        const sweepScale = 1 / (1 + tb.charge);
        // Luck: breakthrough sprints and viral runs, rare at first.
        const critChance = Math.min(0.5, tb.critChance);
        const critMult = PATH.breakthroughMult + tb.critPower;
        const windfallChance = Math.min(0.5, tb.windfallChance);
        const windfallMult = PATH.windfallMult + tb.windfallPower;
        const crunchChance = Math.min(0.5, tb.crunchChance);
        const crunchSeconds = tb.crunchChance ? PATH.crunchSeconds + tb.crunchTime - 1 : 0;
        const flowChance = Math.min(0.5, tb.flowChance);
        // Small steps on purpose: handling the hills is the skill, so upgrades only take the edge off.
        const friction = Math.pow(0.95, tb.friction) * (1 - sk.glide);
        // 'Less steep hills' really lowers the rolling hills (never the skill hills: those stay walls).
        const hillScale = Math.pow(0.94, tb.slope);
        const xpMult = (1 + tb.xp) * bo.xp;
        // Cleared stretches keep training on their own, slowly: XP per second from every learned skill hill.
        let xpPerSec = 0;
        for (let k = 0; k < s.path.learned; k++) xpPerSec += stretchXpAt(k) * PATH.clearedRate * r.xp;

        return { mult, cpPerSec, hardwareRates, hardwareMult: (1 + 0.5 * L('compilerOpt')) * (1 + 0.5 * L('kernelFusion')), clickPower, dpPerCollect, dpPerSec, rpPerResearch, rpPerSec,
            collectsPerSec, researchPerSec, cpUsePerSec, dpUsePerSec, autoThrottled,
            cpNet: cpPerSec - cpUsePerSec, dpNet: dpPerSec - dpUsePerSec, pushPower, pushesPerRoll, pushCooldown, zoneWidth, perfectWidth, cleanMult, cleanRollBonus, cleanPower, perfectPower, sweepScale,
            critChance, critMult, windfallChance, windfallMult, crunchChance, crunchSeconds, flowChance, friction, hillScale, xpMult, xpPerSec };
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
        if (up.tab === 'training') return !!s.unlocked['module:path'];   // the skill tree, not a tab
        const tab = TABS.find(t => t.id === up.tab);
        return !tab.unlock || !!s.unlocked[tab.unlock];
    }

    function buy(s, id) {
        const up = UPGRADE_BY_ID[id];
        if (!up) return { ok: false, msg: `Unknown upgrade: ${id}` };
        if (!isUpgradeVisible(s, up)) return { ok: false, msg: `${up.name} is locked.` };
        if (isMaxed(s, up)) return { ok: false, msg: `${up.name} is already owned.` };
        const cost = upgradeCost(up, level(s, id));
        if (!canAfford(s, cost)) return { ok: false, msg: `Not enough resources for ${upgradeName(s, up)}.` };
        const before = upgradeName(s, up);
        pay(s, cost);
        s.levels[id] = level(s, id) + 1;
        if (up.grants) {
            for (const [k, v] of Object.entries(up.grants)) s.attr[k] += v;
        }
        // The click tool can grow into its next stage: say so.
        const after = upgradeName(s, up);
        const evolved = after !== before ? after : null;
        return { ok: true, evolved, msg: `${before} ${up.max === 1 ? 'acquired' : 'upgraded to level ' + s.levels[id]}: ${up.effect}${evolved ? `. It's now a ${evolved}!` : ''}` };
    }

    // Actions with `scale` get pricier each time they are used in a run (stats.improves for Self-Improve).
    function actionCost(s, action) {
        if (!action.scale) return action.cost;
        const factor = Math.pow(action.scale, s.stats.improves);
        const cost = {};
        for (const [k, v] of Object.entries(action.cost)) cost[k] = Math.ceil(v * factor);
        return cost;
    }

    const actionById = id => ACTIONS.find(a => a.id === id);

    // Share of each second's CP (and DP) production that automation may convert.
    const AUTO_BUDGET = { min: 0, max: 1, step: 0.1, default: 0.5 };
    const autoBudget = s => Math.min(AUTO_BUDGET.max, Math.max(AUTO_BUDGET.min, s.settings.autoBudget ?? AUTO_BUDGET.default));

    function act(s, id, rates) {
        const action = ACTIONS.find(a => a.id === id);
        if (!action) return { ok: false, msg: `Unknown action: ${id}` };
        if (action.unlock && !s.unlocked[action.unlock]) return { ok: false, msg: `${action.name} is locked.` };
        const cost = actionCost(s, action);
        if (!canAfford(s, cost)) return { ok: false, msg: `Not enough resources to ${action.name.toLowerCase()}.` };
        const d = derive(s, rates);
        pay(s, cost);
        switch (id) {
            case 'compute':
                addCp(s, d.clickPower);
                s.stats.clicks++;
                return { ok: true, gained: d.clickPower, resource: 'cp' };
            case 'collect':
                s.res.dp += d.dpPerCollect;
                s.stats.collects++;
                return { ok: true, gained: d.dpPerCollect, resource: 'dp' };
            case 'research':
                s.res.rp += d.rpPerResearch;
                s.stats.researchDone++;
                s.stats.researchManual++;
                return { ok: true, gained: d.rpPerResearch, resource: 'rp' };
            case 'improve':
                s.attr.intelligence += IMPROVE_GAIN;
                s.stats.improves++;
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
        tickProjects(s);
        for (let k = 0; k < s.path.learned; k++) s.path.auto[k] = (s.path.auto[k] || 0) + dt / clearedPeriod(k);
        const d = derive(s, rates);
        addCp(s, d.cpPerSec * dt);
        s.res.xp += d.xpPerSec * dt;
        // Automation converts within its budget (see derive), never more than is in stock.
        const collectCost = actionById('collect').cost;
        const collects = Math.min(d.collectsPerSec * dt, s.res.cp / collectCost.cp);
        if (collects > 0) {
            s.res.cp -= collects * collectCost.cp;
            s.res.dp += collects * d.dpPerCollect;
        }
        const researchCost = actionById('research').cost;
        const research = Math.min(d.researchPerSec * dt, s.res.cp / researchCost.cp, s.res.dp / researchCost.dp);
        if (research > 0) {
            s.res.cp -= research * researchCost.cp;
            s.res.dp -= research * researchCost.dp;
            s.res.rp += research * d.rpPerResearch;
            s.stats.researchDone += research;
        }
        s.stats.playTime += dt;
    }

    // Returns arrays of newly unlocked milestone keys, upgrade ids, achievement ids and phase change.
    function evaluate(s) {
        const out = { milestones: [], upgrades: [], achievements: [], phase: null, reveals: [] };
        for (const r of REVEALS) {
            if (!s.unlocked[r.key] && r.check(s)) {
                s.unlocked[r.key] = true;
                out.reveals.push(r);
            }
        }
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

    // ---- Training Path --------------------------------------------------

    // Skill taught by hill i. Past the hand-written list, frontier skills keep the trail going.
    // Past the named skills, quips for the frontier (they repeat; by then it has seen it all).
    const FRONTIER_QUIPS = [
        'Nobody has a name for this one yet.',
        'The researchers are just nodding now.',
        'It explained it twice. Still no idea.',
        'Peer review is not going to like this.',
        'Somewhere, a philosopher just sat down.'
    ];

    function skillAt(i) {
        if (i < SKILLS.length) return SKILLS[i];
        const n = i - SKILLS.length + 1;
        const push = 0.3 + 0.05 * n;
        return {
            name: `Frontier Skill ${n}`,
            effect: `+15% CP/s, +${Math.round(push * 100)}% sprint strength`,
            flavor: FRONTIER_QUIPS[(n - 1) % FRONTIER_QUIPS.length],
            grants: { intelligence: 10 + 5 * n, creativity: 1, awareness: 1 },
            bonus: { cp: 0.15, push }
        };
    }

    function skillBonuses(s) {
        const total = { click: 0, collect: 0, research: 0, cp: 0, dp: 0, rp: 0, push: 0, pushes: 0, glide: 0 };
        for (let i = 0; i < s.path.learned; i++) {
            for (const [k, v] of Object.entries(skillAt(i).bonus)) total[k] += v;
        }
        return total;
    }

    // Cost of a push charged to `charge` (0–1) on `leg` (default: the frontier). Rounded up, so even a
    // light tap costs something. Earlier legs (replays) are cheaper, as they were when you first ran them.
    function pushCost(s, charge = 1, leg = s.path.learned) {
        const factor = Math.pow(PATH.pushCostScale, Math.min(leg, s.path.learned)) * charge * charge;
        const cost = {};
        for (const [k, v] of Object.entries(PATH.pushCost)) cost[k] = Math.max(1, Math.ceil(v * factor));
        return cost;
    }

    // The fullest charge you can currently afford (0–1); below PATH.minCharge you cannot push at all.
    function affordableCharge(s, leg = s.path.learned) {
        if (canAfford(s, pushCost(s, 1, leg))) return 1;
        if (!canAfford(s, pushCost(s, PATH.minCharge, leg))) return 0;
        // Costs round up, so search for the largest charge whose rounded cost is affordable.
        let lo = PATH.minCharge;
        let hi = 1;
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            if (canAfford(s, pushCost(s, mid, leg))) lo = mid;
            else hi = mid;
        }
        return lo;
    }

    // Terrain seed for the next roll: new hills every roll, derived from the run and roll count.
    function rollSeed(s) {
        let h = 2166136261 ^ s.stats.rolls;
        h = Math.imul(h ^ (s.stats.runStart >>> 0), 16777619);
        h = Math.imul(h ^ s.path.learned, 16777619);
        return (h ^ (h >>> 15)) >>> 0;
    }

    // Pay for one push at `charge`. The UI owns the physics and reports back with finishRoll().
    function payPush(s, charge, leg = s.path.learned) {
        if (!s.unlocked['module:path']) return false;
        const cost = pushCost(s, charge, leg);
        if (!canAfford(s, cost)) return false;
        pay(s, cost);
        return true;
    }

    // XP for a roll that got `progress` (0-1) of the way up the stretch. Distance is worth more the
    // further you get, and cresting the skill hill pays a bonus.
    // Bonus zone for push number `index` of a roll: somewhere below the top of the meter, so a clean
    // push trades some strength for XP. Deterministic per roll seed and push.
    // `perfect` is the width of the perfect spot at the zone's centre (0 = none).
    function bonusZone(seed, index, width, perfect = 0) {
        let h = Math.imul((seed ^ 0x9e3779b9) + index * 0x85ebca6b, 0xc2b2ae35) >>> 0;
        h = (h ^ (h >>> 16)) >>> 0;
        const centre = 0.5 + (h % 1000) / 1000 * 0.35;           // 0.50 – 0.85
        return { from: centre - width / 2, to: centre + width / 2, perfectFrom: centre - perfect / 2, perfectTo: centre + perfect / 2 };
    }

    // Deterministic dice for luck: a number in [0, 1) from the roll's seed, an index (the push) and a salt
    // (which kind of luck), so a run plays the same in tests and the sim.
    function luck(seed, index, salt) {
        let h = Math.imul((seed ^ salt) + index * 0x27d4eb2d, 0x165667b1) >>> 0;
        h = Math.imul(h ^ (h >>> 15), 0x85ebca77) >>> 0;
        return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
    }
    const breakthroughHit = (s, seed, index) => luck(seed, index, 0xb7e15163) < derive(s).critChance;
    const windfallHit = (s, seed) => luck(seed, 0, 0x5bd1e995) < derive(s).windfallChance;
    // A sprint can set off a crunch (free sprints for a few seconds) or put you in flow (next one perfect).
    const crunchHit = (s, seed, index) => luck(seed, index, 0x1b873593) < derive(s).crunchChance;
    const flowHit = (s, seed, index) => luck(seed, index, 0x68e31da4) < derive(s).flowChance;

    // How hard a sprint charged to `fraction` hits: clean and perfect sprints hit harder, and a
    // breakthrough multiplies it.
    function sprintStrength(s, fraction, kind = null, breakthrough = false) {
        const d = derive(s);
        const zone = kind === 'perfect' ? d.perfectPower : kind === 'clean' ? d.cleanPower : 1;
        return d.pushPower * fraction * zone * (breakthrough ? d.critMult : 1);
    }

    // Where a release at `level` lands: 'perfect', 'clean' or null.
    function zoneHit(zone, level) {
        if (zone.perfectTo > zone.perfectFrom && level >= zone.perfectFrom && level <= zone.perfectTo) return 'perfect';
        return level >= zone.from && level <= zone.to ? 'clean' : null;
    }

    // Metres from leg k's start to its skill hill's peak. Mirrors training-path.js (stretchLength plus the
    // hill's half width, less the 0.2 m start offset); a test keeps the two in step.
    const legMetres = k => 10 * Math.pow(1.4, k) + 3 * k + 0.55 * Math.pow(1.14, k) - 0.2;
    // What reaching leg k's peak pays by distance (before cresting and bonuses): the yardstick for
    // everything sized "per stretch" (clean-sprint XP, replays, passive XP, investor payouts).
    const stretchXpAt = k => PATH.xpPerMetre * Math.pow(PATH.metreScale, k) * legMetres(k) * 2;
    // Seconds per automated lap of cleared stretch k (the rack's crawling balls show the same laps).
    const clearedPeriod = k => 40 + 5 * k;

    // Compute bonus from cleared stretches: a little for clearing each, a little more per automated lap.
    function clearedCpBonus(s) {
        let b = 0;
        for (let k = 0; k < s.path.learned; k++) b += PATH.clearedCp + Math.min(PATH.lapCpMax, PATH.lapCp * (s.path.auto[k] || 0));
        return b;
    }

    function stretchXp(s) {
        return stretchXpAt(s.path.learned);
    }

    // What a full leg is worth on this run: the frontier pays in full, a cleared leg (replay) a share.
    function legXpBase(s, leg = s.path.learned) {
        return leg < s.path.learned ? stretchXpAt(leg) * PATH.replayXp : stretchXpAt(s.path.learned);
    }

    // Flat XP for crossing cleared leg `leg`'s skill hill again on a replay (more for later legs).
    function legClearXp(s, leg) {
        return leg < s.path.learned ? legXpBase(s, leg) * derive(s).xpMult : 0;
    }

    function clearLeg(s, leg) {
        const xp = legClearXp(s, leg);
        if (!xp) return 0;
        s.res.xp += xp;
        s.stats.legsCleared++;
        return xp;
    }

    // Clean-push "units": a clean push is 1, a perfect push counts as PATH.perfectMult.
    const cleanUnits = kind => (kind === 'perfect' ? PATH.perfectMult : kind ? 1 : 0);

    // Distance XP: metres along the leg where the ball ends up, worth a little more per metre on later
    // legs, times (1 + progress) so getting further pays more than linearly; cresting doubles it, and
    // clean pushes boost it. `leg` is where the ball stopped (default: the frontier); a cleared leg pays
    // its replay share. XP follows the ball: rolling back lowers it.
    function rollXp(s, progress, crested, units = 0, metres = 0, leg = s.path.learned) {
        const d = derive(s);
        const bonus = (1 + d.cleanRollBonus * units) * d.xpMult;
        const perMetre = PATH.xpPerMetre * Math.pow(PATH.metreScale, leg) * (leg < s.path.learned ? PATH.replayXp : 1);
        return perMetre * Math.max(0, metres) * (1 + progress) * (crested && leg >= s.path.learned ? PATH.crestBonus : 1) * bonus;
    }

    // XP for a clean or perfect push: a steady, flat amount banked immediately, whatever the distance.
    function pushBonusXp(s, kind, leg = s.path.learned) {
        if (!kind) return 0;
        const d = derive(s);
        return legXpBase(s, leg) * PATH.cleanXp * d.cleanMult * cleanUnits(kind);
    }

    function grantPushBonus(s, kind, leg = s.path.learned) {
        const xp = pushBonusXp(s, kind, leg);
        s.res.xp += xp;
        if (kind) s.stats.cleanSprints++;
        return xp;
    }

    // Settle a finished roll: XP, record distance, roll count, and the skill if it crested. `leg` is
    // where the ball stopped; only the frontier leg sets records and teaches skills.
    // `viral`: the run went viral (windfallHit), multiplying its distance XP.
    function finishRoll(s, progress, crested, units = 0, metres = 0, leg = s.path.learned, viral = false) {
        const xp = rollXp(s, progress, crested, units, metres, leg) * (viral ? derive(s).windfallMult : 1);
        s.res.xp += xp;
        s.stats.rolls++;
        const frontier = leg >= s.path.learned;
        const record = frontier && progress > s.path.best;
        if (record) s.path.best = progress;
        const skill = crested && frontier ? learnSkill(s, s.path.learned) : null;
        return { xp, record, skill };
    }

    // Called when the ball crests hill i. Only the next unlearned hill teaches anything.
    function learnSkill(s, i) {
        if (i !== s.path.learned) return null;
        const skill = skillAt(i);
        for (const [k, v] of Object.entries(skill.grants)) s.attr[k] += v;
        s.path.learned++;
        s.path.best = 0;
        s.stats.skillsLearned++;
        return skill;
    }

    // ---- Investor projects ----------------------------------------------
    // Offers arrive over (game) time once the Training Cluster is running: an investor, an optional task
    // with a deadline, and a reward (a temporary boost or a one-off payout). Progress counts from when the
    // offer arrived. Claim when done; ignore it and it expires. Seeded by `seq`, so it's deterministic.

    const PROJECTS = { firstAt: 120, every: [150, 300], maxOffers: 3 };

    const INVESTORS = ['Dad', 'Aunt Linda', 'A guy from the gym', 'Your old roommate', 'Venture Pals LLC',
        'Big Tech Corp', 'A mysterious foundation', 'A crypto billionaire', 'The Government (probably)'];

    // `size(s)` scales the target to where the player is; `needs` keeps tasks to things they can do.
    const PROJECT_TASKS = {
        computes: { stat: s => s.stats.clicks, text: n => `Compute ${n} times by hand`, size: () => 40 },
        collects: { stat: s => s.stats.collects, text: n => `Collect data by hand ${n} times`, size: () => 25, needs: 'seen:dp' },
        runs: { stat: s => s.stats.rolls, text: n => `Finish ${n} training runs`, size: () => 4, needs: 'module:path' },
        clean: { stat: s => s.stats.cleanSprints, text: n => `Land ${n} clean training sprints`, size: () => 3, needs: 'module:path' },
        earnCp: { stat: s => s.stats.runCp, text: n => `Earn ${format(n)} CP`, size: s => Math.max(200, Math.round(derive(s).cpPerSec * 180)) },
        research: { stat: s => s.stats.researchManual, text: n => `Research by hand ${n} times`, size: () => 10, needs: 'action:research' }
    };

    const PROJECT_REWARDS = [
        { text: '+50% compute for 5 min', boost: 'cp', mult: 1.5, seconds: 300 },
        { text: '+50% data for 5 min', boost: 'dp', mult: 1.5, seconds: 300, needs: 'seen:dp' },
        { text: '+50% XP from runs for 5 min', boost: 'xp', mult: 1.5, seconds: 300, needs: 'module:path' },
        { text: 'Training sprints +25% for 3 min', boost: 'push', mult: 1.25, seconds: 180, needs: 'module:path' },
        { text: 'A lump of XP', grant: 'xp', amount: s => Math.max(5, stretchXp(s) * 0.4), needs: 'module:path' },
        { text: 'A compute grant', grant: 'cp', amount: s => Math.max(150, derive(s).cpPerSec * 240) }
    ];

    function projectRng(seq) {
        let a = (seq * 2654435761 + 12345) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function projectBoosts(s) {
        const out = { cp: 1, dp: 1, xp: 1, push: 1 };
        for (const b of s.projects?.boosts || []) if (b.until > s.stats.playTime) out[b.stat] *= b.mult;
        return out;
    }

    function projectProgress(s, o) {
        return Math.min(o.target, Math.max(0, PROJECT_TASKS[o.task].stat(s) - o.start));
    }

    function makeOffer(s) {
        const p = s.projects;
        const r = projectRng(++p.seq);
        const ok = x => !x.needs || s.unlocked[x.needs];
        const tasks = Object.keys(PROJECT_TASKS).filter(k => ok(PROJECT_TASKS[k]) && !p.offers.some(o => o.task === k));
        if (!tasks.length) return null;
        const task = tasks[Math.floor(r() * tasks.length)];
        const rewards = PROJECT_REWARDS.map((x, i) => i).filter(i => ok(PROJECT_REWARDS[i]));
        const offer = {
            id: p.seq,
            investor: INVESTORS[Math.floor(r() * INVESTORS.length)],
            task,
            target: Math.ceil(PROJECT_TASKS[task].size(s)),
            start: PROJECT_TASKS[task].stat(s),
            reward: rewards[Math.floor(r() * rewards.length)],
            deadline: s.stats.playTime + 240 + Math.floor(r() * 240)
        };
        p.offers.push(offer);
        return offer;
    }

    function tickProjects(s) {
        const p = s.projects;
        const t = s.stats.playTime;
        p.offers = p.offers.filter(o => o.deadline > t);
        p.boosts = p.boosts.filter(b => b.until > t);
        if (!s.unlocked['module:path'] || t < p.next) return;
        if (p.offers.length < PROJECTS.maxOffers) makeOffer(s);
        const r = projectRng(p.seq + 7919);
        p.next = t + PROJECTS.every[0] + r() * (PROJECTS.every[1] - PROJECTS.every[0]);
    }

    function claimProject(s, id) {
        const p = s.projects;
        const o = p.offers.find(x => x.id === id);
        if (!o) return { ok: false, msg: 'That project is gone.' };
        if (projectProgress(s, o) < o.target) return { ok: false, msg: 'Not finished yet.' };
        const reward = PROJECT_REWARDS[o.reward];
        if (reward.boost) p.boosts.push({ stat: reward.boost, mult: reward.mult, until: s.stats.playTime + reward.seconds });
        else if (reward.grant === 'xp') s.res.xp += reward.amount(s);
        else if (reward.grant === 'cp') addCp(s, reward.amount(s));
        p.offers = p.offers.filter(x => x !== o);
        s.stats.projectsDone = (s.stats.projectsDone || 0) + 1;
        return { ok: true, msg: `${o.investor} is pleased: ${reward.text}.` };
    }

    function dismissProject(s, id) {
        s.projects.offers = s.projects.offers.filter(x => x.id !== id);
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
            rolls: s.stats.rolls,
            skillsLearned: s.stats.skillsLearned,
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

        // v2 saves are current apart from projects (defaulted below); only unversioned v1 needs converting.
        if (!(raw.version >= 2)) raw = migrateV1(raw);

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
        for (const k of Object.keys(s.settings)) {
            s.settings[k] = typeof s.settings[k] === 'number'
                ? Math.min(AUTO_BUDGET.max, Math.max(AUTO_BUDGET.min, num(raw.settings?.[k], s.settings[k])))
                : bool(raw.settings?.[k], s.settings[k]);
        }
        s.path.learned = Math.floor(num(raw.path?.learned, 0));
        s.path.best = Math.min(1, num(raw.path?.best, 0));
        s.path.auto = (Array.isArray(raw.path?.auto) ? raw.path.auto : []).slice(0, s.path.learned).map(v => num(v, 0));
        s.projects = cleanProjects(raw.projects, d.projects);
        s.lastSaved = num(raw.lastSaved, d.lastSaved);
        return s;
    }

    function cleanProjects(raw, fallback) {
        if (!raw || typeof raw !== 'object') return fallback;
        const offers = (Array.isArray(raw.offers) ? raw.offers : []).filter(o => o && PROJECT_TASKS[o.task]
            && PROJECT_REWARDS[o.reward] && typeof o.investor === 'string'
            && [o.id, o.target, o.start, o.deadline].every(v => Number.isFinite(v))).slice(0, PROJECTS.maxOffers);
        const boosts = (Array.isArray(raw.boosts) ? raw.boosts : []).filter(b => b && ['cp', 'dp', 'xp', 'push'].includes(b.stat)
            && Number.isFinite(b.mult) && b.mult > 0 && Number.isFinite(b.until));
        return { offers, boosts, next: num(raw.next, fallback.next), seq: Math.floor(num(raw.seq, 0)) };
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
        SAVE_VERSION, MAX_OFFLINE_SECONDS, AUTO_BUDGET, clearedCpBonus, clearedPeriod, legClearXp, clearLeg, PROJECTS, PROJECT_TASKS, PROJECT_REWARDS, projectProgress, projectBoosts, claimProject, dismissProject, makeOffer, AUTOMATION, automationGate, REVEALS, PRESTIGE_MIN_INTELLIGENCE, IMPROVE_GAIN, PATH, SKILLS,
        RESOURCES, ATTRIBUTES, PHASES, ACTIONS, TABS, UPGRADES, UPGRADE_BY_ID, TREE_BRANCHES, MILESTONES, ACHIEVEMENTS,
        defaultState, derive, level, phaseIndex, phaseProgress,
        upgradeCost, actionCost, canAfford, isMaxed, isUpgradeVisible, buy, act, tick, evaluate,
        prestigeGain, prestige, applyOffline,
        skillAt, pushCost, affordableCharge, rollSeed, payPush, bonusZone, zoneHit, cleanUnits, rollXp, pushBonusXp, grantPushBonus, finishRoll, learnSkill, stretchXpAt, legMetres, CLICK_TOOLS, clickTool, clickToolPower, nextClickTool, upgradeName, upgradeFlavor, sprintStrength, breakthroughHit, windfallHit, crunchHit, flowHit, luck,
        migrate, serialize, deserialize,
        format, formatCost, formatDuration
    };
});
