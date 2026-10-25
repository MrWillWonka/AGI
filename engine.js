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

    // Training Path: every push costs CP and DP in proportion to how hard it is charged (energy, so
    // charge²), which ties training to passive income. How far a roll gets earns Experience (XP).
    // Costs and XP both scale with the stretch you are on (= skills learned).
    const PATH = {
        pushCost: { cp: 14, dp: 1.5 },  // a fully charged push on the first stretch
        pushCostScale: 1.4,
        xpPerStretch: 20,     // XP for reaching a skill hill's peak on the first stretch
        xpScale: 1.5,         // later stretches are much longer, so they pay much more
        crestBonus: 2,       // XP multiplier when the roll crests the skill hill
        hillFloor: 0.03,     // minimum distance XP per rolling hill crossed, as a share of a full stretch's XP
        cleanXp: 0.08,       // flat XP banked at once per clean push, as a share of a full stretch's distance XP
        cleanRollBonus: 0.1, // and +10% distance XP for the roll per clean push
        perfectMult: 3,      // a perfect push (inside the perfect spot) counts as this many clean pushes
        zoneWidth: 0.12,     // bonus zone width as a fraction of the strength meter
        perfectWidth: 0.025, // perfect spot width once Perfect Calibration is bought
        minCharge: 0.15,     // weakest push a quick tap gives
        basePush: 1.8,       // push strength before upgrades and skills
        basePushes: 1,       // pushes per roll: just the launch until More Epochs is bought
        baseCooldown: 2.0,   // seconds between pushes
        minCooldown: 0.3,
        clearedRate: 1 / 600  // a cleared stretch runs itself: this share of its full XP per second
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
        { id: 'software', name: 'Software', unlock: null },
        { id: 'algorithms', name: 'Algorithms', unlock: 'tab:algorithms' },
        { id: 'consciousness', name: 'Consciousness', unlock: 'tab:consciousness' }
    ];

    // Upgrades. `scale` makes it repeatable (cost × scale^level); `max: 1` makes it one-time.
    // `grants` adds attributes per level purchased. Production effects live in derive().
    const UPGRADES = [
        // Hardware
        { id: 'cpu', tab: 'hardware', name: 'Basic CPU', effect: '+0.5 CP/s', flavor: 'A desktop tower from the office cupboard. It wheezes.', cost: { cp: 15 }, scale: 1.18 },
        { id: 'server', tab: 'hardware', name: 'Server Cluster', effect: '+2 CP/s, +1 CP/click', flavor: 'Rack-mounted, fan-cooled, slightly too loud for the office.', cost: { cp: 120 }, scale: 1.18 },
        { id: 'quantum', tab: 'hardware', name: 'Quantum Processor', effect: '+10 CP/s', flavor: 'It\'s both working and not working until you check.', cost: { cp: 1100 }, scale: 1.15,
            unlock: s => s.stats.runCp >= 500, hint: 'Earn 500 CP this run' },
        { id: 'neural', tab: 'hardware', name: 'Neural Network Chip', effect: '+50 CP/s', flavor: 'A chip shaped like the thing you\'re trying to build.', cost: { cp: 12000 }, scale: 1.15,
            unlock: s => s.stats.runCp >= 5000, hint: 'Earn 5,000 CP this run' },
        { id: 'datacenter', tab: 'hardware', name: 'Hyperscale Datacenter', effect: '+250 CP/s', flavor: 'Bought a field. Filled it with computers.', cost: { cp: 130000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 1, hint: 'Reach General AI' },
        { id: 'optical', tab: 'hardware', name: 'Optical Computing', effect: '+1,400 CP/s', flavor: 'Computing at the speed of light. Literally.', cost: { cp: 1.4e6 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 2, hint: 'Reach Superintelligence' },

        // Software
        { id: 'dataProcessor', tab: 'software', name: 'Data Processor', effect: '+1 DP per collection', flavor: 'A script that cleans the data so you don\'t have to.', cost: { cp: 50, dp: 5 }, scale: 1.2 },
        { id: 'autoCollector', tab: 'software', name: 'Auto Data Collector', effect: 'Collects data for you: 0.5 times a second, 10 CP each', flavor: 'A crawler that never sleeps, paid for in compute.', cost: { cp: 800, dp: 80 }, scale: 1.35,
            unlock: s => s.path.learned >= 3, hint: 'Teach your AI Image Recognition' },
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
        { id: 'trainingOptimizer', tab: 'training', tree: { x: 0, y: -1 }, requires: 'initialWeights', icon: 'bolt', name: 'GPU Cluster', effect: '+10% sprint strength per level, and a steadier meter', flavor: 'You maxed out the company card on graphics cards.', cost: { xp: 4 }, scale: 1.8, max: 2, boost: { push: 0.1, sweep: 0.08 } },
        { id: 'optimizedCode', tab: 'training', tree: { x: 0, y: -2 }, icon: 'code', name: 'Better Optimizer', effect: '-5% drag', flavor: 'Swapped the default settings for ones a forum post swore by.', cost: { xp: 15 }, scale: 1.8, max: 1, requires: 'trainingOptimizer', boost: { friction: 1 } },
        { id: 'betterAlgorithms', tab: 'training', tree: { x: 1, y: -2 }, icon: 'mountain', name: 'Smoother Loss Landscape', effect: 'Rolling hills 6% lower per level', flavor: 'Fewer potholes on the road to genius.', cost: { xp: 38 }, scale: 2, max: 2, requires: 'optimizedCode', boost: { slope: 1 } },
        { id: 'efficientKernels', tab: 'training', tree: { x: -1, y: -2 }, icon: 'code', name: 'Learning Rate Schedule', effect: '-5% drag per level', flavor: 'Go fast early, ease off later. Like a sensible road trip.', cost: { xp: 120 }, scale: 1.8, max: 3, requires: 'optimizedCode', boost: { friction: 1 } },
        { id: 'gpuCluster2', tab: 'training', tree: { x: 0, y: -3 }, icon: 'bolt', name: 'Bigger GPU Cluster', effect: '+15% sprint strength per level', flavor: 'The power bill now has its own budget line.', cost: { xp: 60 }, scale: 1.6, max: 3, requires: 'optimizedCode', boost: { push: 0.15, sweep: 0.06 } },
        { id: 'smarterAlgorithms', tab: 'training', tree: { x: 1, y: -3 }, icon: 'mountain', name: 'Regularization', effect: 'Rolling hills 6% lower and -5% drag per level', flavor: 'Stop the model memorising the answer key.', cost: { xp: 180 }, scale: 1.8, max: 3, requires: 'betterAlgorithms', boost: { slope: 1, friction: 1 } },
        { id: 'gpuSupercluster', tab: 'training', tree: { x: 0, y: -4 }, icon: 'bolt', name: 'GPU Supercluster', effect: '+20% sprint strength per level', flavor: 'The building hums. The neighbours have questions.', cost: { xp: 225 }, scale: 1.7, max: 3, requires: 'gpuCluster2', boost: { push: 0.2, sweep: 0.05 } },
        // Secrets: these never show, not even as a lock, until the node next to them is owned.
        { id: 'batchNorm', tab: 'training', tree: { x: 1, y: -1 }, icon: 'bolt', name: 'Batch Normalization', effect: '+8% sprint strength', flavor: 'Everybody calm down. Especially the gradients.', cost: { xp: 25 }, max: 1, requires: 'trainingOptimizer', secret: true, boost: { push: 0.08 } },
        { id: 'dataAugmentation', tab: 'training', tree: { x: 1, y: 1 }, icon: 'stack', name: 'Data Augmentation', effect: '+10% XP from every run', flavor: 'Flip it, rotate it, call it new data.', cost: { xp: 18 }, max: 1, requires: 'bigDatasets', secret: true, boost: { xp: 0.1 } },
        { id: 'warmRestarts', tab: 'training', tree: { x: -1, y: 1 }, icon: 'chip', name: 'Warm Restarts', effect: '-15% wait between sprints', flavor: 'Have you tried turning it off and on again?', cost: { xp: 20 }, max: 1, requires: 'trainingEpochs', secret: true, boost: { cooldown: 1 } },
        // Late game: the outer ring, far stronger and far dearer, for the biggest skill hills.
        { id: 'quantumAccelerator', tab: 'training', tree: { x: 0, y: -5 }, icon: 'bolt', name: 'Quantum Accelerator', effect: '+40% sprint strength per level', flavor: 'Nobody fully understands it. It works anyway.', cost: { xp: 1500 }, scale: 1.8, max: 3, requires: 'gpuSupercluster', boost: { push: 0.4, sweep: 0.03 } },
        { id: 'exascaleCluster', tab: 'training', tree: { x: 0, y: -6 }, icon: 'bolt', name: 'Exascale Cluster', effect: '+80% sprint strength per level', flavor: 'A billion billion sums a second. Still can\'t fold a fitted sheet.', cost: { xp: 12000 }, scale: 1.9, max: 3, requires: 'quantumAccelerator', boost: { push: 0.8 } },
        { id: 'superconductors', tab: 'training', tree: { x: -2, y: -2 }, icon: 'mountain', name: 'Mixed Precision', effect: '-5% drag and rolling hills 6% lower per level', flavor: 'Half the decimal places, twice the speed. Nobody notices.', cost: { xp: 2000 }, scale: 1.8, max: 3, requires: 'efficientKernels', boost: { friction: 1, slope: 1 } },
        { id: 'neuralCompression', tab: 'training', tree: { x: -1, y: -3 }, icon: 'code', name: 'Model Distillation', effect: '-10% drag and rolling hills 6% lower per level', flavor: 'Teach a small model everything the big one knows.', cost: { xp: 6000 }, scale: 1.8, max: 3, requires: 'efficientKernels', boost: { friction: 2, slope: 1 } },
        // Precision (right): better XP from every run, then the meter's sweet spot.
        { id: 'bigDatasets', tab: 'training', tree: { x: 1, y: 0 }, requires: 'initialWeights', icon: 'stack', name: 'Bigger Datasets', effect: '+15% XP from every run, per level', flavor: 'You scraped the whole internet. Yes, even the comments.', cost: { xp: 5 }, scale: 2, max: 2, boost: { xp: 0.15 } },
        { id: 'precisionTuning', tab: 'training', tree: { x: 2, y: 0 }, icon: 'target', name: 'Hyperparameter Search', effect: 'Sweet spot 25% wider', flavor: 'Turn every knob until something works.', cost: { xp: 14 }, scale: 2.5, max: 1, requires: 'bigDatasets', boost: { zone: 0.25 } },
        { id: 'benchmarkPrizes', tab: 'training', tree: { x: 3, y: 0 }, icon: 'coin', name: 'Benchmark Prizes', effect: '+25% XP per clean sprint, per level', flavor: 'Top the leaderboard, collect the gift card.', cost: { xp: 22 }, scale: 1.7, max: 3, requires: 'precisionTuning', boost: { clean: 0.25 } },
        { id: 'curatedData', tab: 'training', tree: { x: 3, y: -1 }, icon: 'stack', name: 'Curated Data', effect: '+25% run bonus per clean sprint, per level', flavor: 'Less garbage in, less garbage out.', cost: { xp: 40 }, scale: 1.7, max: 2, requires: 'benchmarkPrizes', boost: { rollBonus: 0.25 } },
        { id: 'perfectCalibration', tab: 'training', tree: { x: 3, y: 1 }, icon: 'star', name: 'Perfect Calibration', effect: 'Adds a perfect spot worth 3 clean sprints', flavor: 'A bullseye inside the bullseye.', cost: { xp: 80 }, max: 1,
            requires: 'benchmarkPrizes', boost: { perfect: 1 } },
        { id: 'highResSensors', tab: 'training', tree: { x: 4, y: 0 }, icon: 'target', name: 'Automated Tuning', effect: 'Sweet spot 20% wider per level', flavor: 'A robot turns the knobs now. It never sleeps.', cost: { xp: 120 }, scale: 1.7, max: 3, requires: 'benchmarkPrizes', boost: { zone: 0.2 } },
        { id: 'handLabelled', tab: 'training', tree: { x: 4, y: -1 }, icon: 'stack', name: 'Hand-Labelled Data', effect: '+35% run bonus per clean sprint, per level', flavor: 'Interns. So many interns.', cost: { xp: 200 }, scale: 1.7, max: 3, requires: 'curatedData', boost: { rollBonus: 0.35 } },
        { id: 'fineCalibration', tab: 'training', tree: { x: 4, y: 1 }, icon: 'star', name: 'Fine Calibration', effect: 'Perfect spot 40% wider per level', flavor: 'Measure twice, sprint once.', cost: { xp: 250 }, scale: 1.8, max: 3, requires: 'perfectCalibration', boost: { perfect: 1 } },
        { id: 'leaderboardPrizes', tab: 'training', tree: { x: 5, y: 0 }, icon: 'coin', name: 'Leaderboard Prizes', effect: '+40% XP per clean sprint, per level', flavor: 'First place, and a trophy bigger than the team.', cost: { xp: 320 }, scale: 1.7, max: 3, requires: 'highResSensors', boost: { clean: 0.4 } },
        // Recursion (down): more sprints per run and less wait between them.
        { id: 'trainingEpochs', tab: 'training', tree: { x: 0, y: 1 }, requires: 'initialWeights', icon: 'plus', name: 'Investor Funding', effect: '+1 training sprint per run (sprint again mid-run!)', flavor: 'Dad lent you $100. Don\'t tell Mum.', cost: { xp: 6 }, scale: 3, max: 2, boost: { pushes: 1 } },
        { id: 'fasterIteration', tab: 'training', tree: { x: 0, y: 2 }, icon: 'chip', name: 'Faster Chips', effect: '-15% wait between sprints per level', flavor: 'Less waiting, more training. Coffee breaks cancelled.', cost: { xp: 10 }, scale: 1.7, max: 2, requires: 'trainingEpochs', boost: { cooldown: 1 } },
        { id: 'seriesA', tab: 'training', tree: { x: -1, y: 2 }, icon: 'plus', name: 'Series A', effect: '+1 training sprint per run', flavor: 'A real investor! They wear a fleece vest.', cost: { xp: 90 }, scale: 2.5, max: 1, requires: 'fasterIteration', boost: { pushes: 1 } },
        { id: 'overclockedChips', tab: 'training', tree: { x: 0, y: 3 }, icon: 'chip', name: 'Overclocked Chips', effect: '-15% wait between sprints per level', flavor: 'Voids the warranty. Worth it.', cost: { xp: 75 }, scale: 1.7, max: 3, requires: 'fasterIteration', boost: { cooldown: 1 } },
        { id: 'seriesB', tab: 'training', tree: { x: -1, y: 3 }, icon: 'plus', name: 'Series B', effect: '+1 training sprint per run, per level', flavor: 'Now with a board of directors and a ping-pong table.', cost: { xp: 450 }, scale: 2.5, max: 2, requires: 'seriesA', boost: { pushes: 1 } },
        { id: 'customSilicon', tab: 'training', tree: { x: 0, y: 4 }, icon: 'chip', name: 'Custom Silicon', effect: '-15% wait between sprints per level', flavor: 'Why buy chips when you can design your own?', cost: { xp: 375 }, scale: 1.7, max: 3, requires: 'overclockedChips', boost: { cooldown: 1 } },
        { id: 'ipo', tab: 'training', tree: { x: -1, y: 4 }, icon: 'plus', name: 'IPO', effect: '+1 training sprint per run, per level', flavor: 'Ring the bell. Mum framed the press release.', cost: { xp: 3000 }, scale: 3, max: 2, requires: 'seriesB', boost: { pushes: 1 } },
        // Capability (left): seeing ahead, then automation.
        { id: 'scoutingData', tab: 'training', tree: { x: -1, y: 0 }, requires: 'initialWeights', icon: 'eye', name: 'Eval Dashboards', effect: 'See 25% further ahead', flavor: 'Charts! Finally you can see where you\'re going.', cost: { xp: 8 }, scale: 2, max: 1, boost: { view: 0.25 } },
        { id: 'satelliteMaps', tab: 'training', tree: { x: -1, y: -1 }, icon: 'eye', name: 'Live Telemetry', effect: 'See 25% further ahead', flavor: 'Real-time numbers on everything, including the coffee machine.', cost: { xp: 90 }, scale: 2, max: 1, requires: 'scoutingData', boost: { view: 0.25 } },
        { id: 'autoTrainer', tab: 'training', tree: { x: -2, y: 0 }, icon: 'robot', name: 'Auto-Trainer', effect: 'Level 1 starts runs and sprints when the model stalls. Level 2 times its sprints', flavor: 'An intern who never gets tired. Or paid.', cost: { cp: 2000, dp: 200, rp: 20 }, scale: 5, max: 2,
            requires: 'scoutingData', unlock: s => s.prestige.count >= 1, hint: 'Transcend once' },
        { id: 'researchAssistant', tab: 'software', name: 'Research Assistant', effect: 'Researches for you: 0.2 times a second, paying CP and DP', flavor: 'Reads papers all night. Takes notes. Never complains.', cost: { cp: 6000, dp: 500, rp: 40 }, scale: 1.4,
            unlock: s => !!s.unlocked['action:research'] && s.path.learned >= 5, hint: 'Teach your AI Language Modeling' },
        { id: 'nlp', tab: 'software', name: 'Natural Language Processing', effect: '+5 DP per collection, +1 Intelligence', flavor: 'It reads now. Mostly forum posts, sadly.', cost: { cp: 2500, dp: 250 }, max: 1,
            grants: { intelligence: 1 }, unlock: s => s.res.dp >= 100, hint: 'Hold 100 DP' },
        { id: 'computerVision', tab: 'software', name: 'Computer Vision', effect: '+10 DP per collection, +2 Intelligence', flavor: 'It sees now. It has opinions about your photos.', cost: { cp: 8000, dp: 600 }, max: 1,
            grants: { intelligence: 2 }, requires: 'nlp' },

        // Algorithms
        { id: 'machineLearning', tab: 'algorithms', name: 'Machine Learning', effect: '+1 RP per research, +1 Intelligence', flavor: 'Stop writing rules. Let it figure them out.', cost: { cp: 3000, dp: 300, rp: 20 }, max: 1,
            grants: { intelligence: 1 } },
        { id: 'deepLearning', tab: 'algorithms', name: 'Deep Learning', effect: '+2 RP per research, +2 Intelligence', flavor: 'Like machine learning, but with more layers. And more GPUs.', cost: { cp: 10000, dp: 1000, rp: 60 }, max: 1,
            grants: { intelligence: 2 }, requires: 'machineLearning' },
        { id: 'reinforcementLearning', tab: 'algorithms', name: 'Reinforcement Learning', effect: '+3 RP per research, +2 Intelligence, +1 Creativity', flavor: 'Treats for good answers, nothing for bad ones.', cost: { cp: 30000, dp: 3000, rp: 150 }, max: 1,
            grants: { intelligence: 2, creativity: 1 }, requires: 'deepLearning' },
        { id: 'transferLearning', tab: 'algorithms', name: 'Transfer Learning', effect: '+5 RP per research, +3 Intelligence, +2 Creativity', flavor: 'Learned chess, now it\'s quite good at checkers too.', cost: { cp: 80000, dp: 8000, rp: 400 }, max: 1,
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
                rolls: 0,
                skillsLearned: 0,
                improves: 0,
                playTime: 0,
                runStart: now,
                firstStart: now,
                highestPhase: 0
            },
            path: { learned: 0, best: 0 },
            settings: { autosave: true, offline: true, autoBudget: AUTO_BUDGET.default },
            lastSaved: now
        };
    }

    // ---- Derived values -------------------------------------------------

    function level(s, id) {
        return s.levels[id] || 0;
    }

    // Skill-tree effects: each training node's `boost` times its level, summed by stat.
    const TREE_STATS = ['push', 'sweep', 'pushes', 'cooldown', 'zone', 'perfect', 'clean', 'rollBonus', 'friction', 'slope', 'view', 'xp'];
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

        const cpPerSec = (0.5 * L('cpu') + 2 * L('server') + 10 * L('quantum') + 50 * L('neural')
            + 250 * L('datacenter') + 1400 * L('optical')) * (1 + sk.cp) * mult * r.cp;
        const clickPower = (1 + L('server') + sk.click) * mult;
        const dpPerCollect = (1 + L('dataProcessor') + 5 * L('nlp') + 10 * L('computerVision') + sk.collect) * (1 + sk.dp) * mult;
        const rpPerResearch = (1 + L('machineLearning') + 2 * L('deepLearning') + 3 * L('reinforcementLearning')
            + 5 * L('transferLearning') + sk.research) * (1 + sk.rp) * mult;
        // Automation converts at the action prices: collections spend CP, research spends CP and DP.
        // It may only use the automation budget (a share of what is produced each second) and never
        // touches the stockpile, so compute always keeps climbing. Over budget, both slow down evenly.
        const collectCost = actionById('collect').cost;
        const researchCost = actionById('research').cost;
        const share = autoBudget(s);
        const wantCollects = 0.5 * L('autoCollector') * r.dp;
        const wantResearch = 0.2 * L('researchAssistant') * r.rp;
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
        const pushPower = PATH.basePush * (1 + tb.push + sk.push) * Math.sqrt(mult);
        const pushesPerRoll = PATH.basePushes + tb.pushes + sk.pushes;
        const pushCooldown = Math.max(PATH.minCooldown, PATH.baseCooldown * Math.pow(0.85, tb.cooldown));

        const zoneWidth = PATH.zoneWidth * (1 + tb.zone);
        const perfectWidth = tb.perfect ? PATH.perfectWidth * (1 + 0.4 * (tb.perfect - 1)) : 0;
        const cleanMult = 1 + tb.clean;
        const cleanRollBonus = PATH.cleanRollBonus * (1 + tb.rollBonus);
        // A stronger rig is easier to control: GPU nodes slow the meter's sweep a little.
        const sweepScale = Math.min(1.7, 1 + tb.sweep);
        // Small steps on purpose: handling the hills is the skill, so upgrades only take the edge off.
        const friction = Math.pow(0.95, tb.friction) * (1 - sk.glide);
        // 'Less steep hills' really lowers the rolling hills (never the skill hills: those stay walls).
        const hillScale = Math.pow(0.94, tb.slope);
        const xpMult = 1 + tb.xp;
        const viewScale = 1 + tb.view;
        // Cleared stretches keep training on their own, slowly: XP per second from every learned skill hill.
        let xpPerSec = 0;
        for (let k = 0; k < s.path.learned; k++) xpPerSec += stretchXpAt(k) * PATH.clearedRate * r.xp;

        return { mult, cpPerSec, clickPower, dpPerCollect, dpPerSec, rpPerResearch, rpPerSec,
            collectsPerSec, researchPerSec, cpUsePerSec, dpUsePerSec, autoThrottled,
            cpNet: cpPerSec - cpUsePerSec, dpNet: dpPerSec - dpUsePerSec, pushPower, pushesPerRoll, pushCooldown, zoneWidth, perfectWidth, cleanMult, cleanRollBonus, sweepScale, friction, hillScale, xpMult, viewScale, xpPerSec };
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
        if (!canAfford(s, cost)) return { ok: false, msg: `Not enough resources for ${up.name}.` };
        pay(s, cost);
        s.levels[id] = level(s, id) + 1;
        if (up.grants) {
            for (const [k, v] of Object.entries(up.grants)) s.attr[k] += v;
        }
        return { ok: true, msg: `${up.name} ${up.max === 1 ? 'acquired' : 'upgraded to level ' + s.levels[id]}: ${up.effect}` };
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
                return { ok: true, gained: d.dpPerCollect, resource: 'dp' };
            case 'research':
                s.res.rp += d.rpPerResearch;
                s.stats.researchDone++;
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

    // Cost of a push charged to `charge` (0–1). Rounded up, so even a light tap costs something.
    function pushCost(s, charge = 1) {
        const factor = Math.pow(PATH.pushCostScale, s.path.learned) * charge * charge;
        const cost = {};
        for (const [k, v] of Object.entries(PATH.pushCost)) cost[k] = Math.max(1, Math.ceil(v * factor));
        return cost;
    }

    // The fullest charge you can currently afford (0–1); below PATH.minCharge you cannot push at all.
    function affordableCharge(s) {
        if (canAfford(s, pushCost(s, 1))) return 1;
        if (!canAfford(s, pushCost(s, PATH.minCharge))) return 0;
        // Costs round up, so search for the largest charge whose rounded cost is affordable.
        let lo = PATH.minCharge;
        let hi = 1;
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            if (canAfford(s, pushCost(s, mid))) lo = mid;
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
    function payPush(s, charge) {
        if (!s.unlocked['module:path']) return false;
        const cost = pushCost(s, charge);
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

    // Where a release at `level` lands: 'perfect', 'clean' or null.
    function zoneHit(zone, level) {
        if (zone.perfectTo > zone.perfectFrom && level >= zone.perfectFrom && level <= zone.perfectTo) return 'perfect';
        return level >= zone.from && level <= zone.to ? 'clean' : null;
    }

    const stretchXpAt = k => PATH.xpPerStretch * Math.pow(PATH.xpScale, k);

    function stretchXp(s) {
        return stretchXpAt(s.path.learned);
    }

    // Clean-push "units": a clean push is 1, a perfect push counts as PATH.perfectMult.
    const cleanUnits = kind => (kind === 'perfect' ? PATH.perfectMult : kind ? 1 : 0);

    // Distance XP: where the ball ends up, to the power 1.5 (getting further pays more than linearly,
    // without making short early runs worthless on long stretches), boosted by clean pushes.
    // `hills` is how many rolling hills the ball got over: crossing any guarantees a small minimum,
    // even if it rolled back afterwards.
    function rollXp(s, progress, crested, units = 0, hills = 0) {
        const d = derive(s);
        const bonus = (1 + d.cleanRollBonus * units) * d.xpMult;
        const distance = Math.max(Math.pow(progress, 1.5), PATH.hillFloor * hills);
        return stretchXp(s) * distance * (crested ? PATH.crestBonus : 1) * bonus;
    }

    // XP for a clean or perfect push: a steady, flat amount banked immediately, whatever the distance.
    function pushBonusXp(s, kind) {
        if (!kind) return 0;
        const d = derive(s);
        return stretchXp(s) * PATH.cleanXp * d.cleanMult * cleanUnits(kind);
    }

    function grantPushBonus(s, kind) {
        const xp = pushBonusXp(s, kind);
        s.res.xp += xp;
        return xp;
    }

    // Settle a finished roll: XP, record distance, roll count, and the skill if it crested.
    function finishRoll(s, progress, crested, units = 0, hills = 0) {
        const xp = rollXp(s, progress, crested, units, hills);
        s.res.xp += xp;
        s.stats.rolls++;
        const record = progress > s.path.best;
        if (record) s.path.best = progress;
        const skill = crested ? learnSkill(s, s.path.learned) : null;
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
        for (const k of Object.keys(s.settings)) {
            s.settings[k] = typeof s.settings[k] === 'number'
                ? Math.min(AUTO_BUDGET.max, Math.max(AUTO_BUDGET.min, num(raw.settings?.[k], s.settings[k])))
                : bool(raw.settings?.[k], s.settings[k]);
        }
        s.path.learned = Math.floor(num(raw.path?.learned, 0));
        s.path.best = Math.min(1, num(raw.path?.best, 0));
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
        SAVE_VERSION, MAX_OFFLINE_SECONDS, AUTO_BUDGET, PRESTIGE_MIN_INTELLIGENCE, IMPROVE_GAIN, PATH, SKILLS,
        RESOURCES, ATTRIBUTES, PHASES, ACTIONS, TABS, UPGRADES, UPGRADE_BY_ID, TREE_BRANCHES, MILESTONES, ACHIEVEMENTS,
        defaultState, derive, level, phaseIndex, phaseProgress,
        upgradeCost, actionCost, canAfford, isMaxed, isUpgradeVisible, buy, act, tick, evaluate,
        prestigeGain, prestige, applyOffline,
        skillAt, pushCost, affordableCharge, rollSeed, payPush, bonusZone, zoneHit, cleanUnits, rollXp, pushBonusXp, grantPushBonus, finishRoll, learnSkill,
        migrate, serialize, deserialize,
        format, formatCost, formatDuration
    };
});
