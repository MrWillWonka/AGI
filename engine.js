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

    // The build a player is on: stamped into every playtest log (its header and session events), so each log is read
    // against the features it had (playtests/README.md lists the builds). Bump it with every publish: the date and
    // time (UTC) and a few words on what changed.
    const BUILD = '2026-11-10 19:06 (review branch) · Packet Snare 18: the goal curve skips boss sectors (sector 9 asks 23K, sector 12 140K, not 843K)';
    const SAVE_VERSION = 31;   // 31: Packet Snare's repeats folded into four deep roots round a seed (Handshake), Scrubbers gone, the Decoder Bot early, the tree refunded; 30: Packet Snare's red-packet nodes back (Sanitizer, Checksums, Spam Filter, Reputation Check, Rate Limiter, Error Correction, Parity Check, Signature Database), the Cleaner Bot later, the Bouncer and Escort bots and both towers gone, the tree refunded again; 29: Packet Snare's red-packet nodes became helpers (Cleaner Bot at the root, Bouncer and Escort bots, Checksum and Jammer towers), the packet and red nodes folded into the early ones, the tree refunded again; 28: Packet Snare's tree after the review rounds (Input Validation and Mirror Port folded in, Chain Lightning at 250), refunded again; 27: Packet Snare 15 (bubbles are the way to catch: Split, Supernova, Bigger Buffers, mines grabbed), the tree refunded again; 26: Packet Snare 14 (bots earlier, powers with five levels, Collector Bot), the tree refunded again; 25: Packet Snare 12 (the boss looped, the tree repriced and Root Access moved), the tree refunded again; 24: Packet Snare's tree rearranged so no node does the same thing as the one it grows from, every level refunded; 23: Packet Snare's Firewalls became sections (layout.zones; drawn walls dropped), its tree regrown again with every level refunded; 22: Packet Snare's tree regrown (Snare 10: four wedges, capstones), every level refunded; 21: Packet Snare's placements (snare.layout: walls, decoys, turrets, towers; the anchors went), its tree regrown; 20: Packet Snare pays Signal (snare.signal, earned), sectors and bosses (snare.sector, bosses); 19: Packet Snare (snare: the Data Pipeline's record and runs); 18: act one doubled (twelve real skills, act two from leg 13: learned, laps, best runs and leg strengths re-indexed); 17: the Auto-Trainer's ghost strength per leg (path.legPower); 16: dilemmas (questions by email, the mail's arrival order); 15: Procurement's fund (tasks.procurement.fund), the wall surge (path.surge); 14: the breakthrough guarantee's countdown (path.breakDue); 3: investor projects; 4: automated laps per cleared stretch (path.auto); 5: versions (legacy nodes, Insight), scheduled tasks; 6: best run per leg (path.legBest); 7: first-time intros remembered across versions (intro); 8: the warm-up leg (Tokenization) in front; 9: notation, sound and shake settings; 10: best runs per leg stored without XP multipliers, text size and calm settings, lifetime hand counts; 11: no offline setting, challenges, Transcend; 12: Head Start became a starter kit (Muscle Memory keeps its old effect), runPlayStart; 13: Transcendence perks (transcend.perks), long flights
    // Insight ever earned (spending it on legacy nodes keeps the bonus) multiplies automated production and
    // training XP by 1 + 0.07·√Insight: ×1.12 at 3, ×1.33 at 22, ×1.7 at 100. Legacy upgrades (the
    // Auto-Trainer, XP nodes) carry most of a new version's speed, so this stays small: at 0.2 a second run
    // reached General AI 4× faster than the first; at 0.07 about 2× (56 → 29 → 21 → 18 min in the sim).
    // It used to be +10% each with no limit, which compounded every version into a speedrun.
    const PRESTIGE_BONUS = 0.07;
    const PRESTIGE_MIN_INTELLIGENCE = 5;
    const RESEARCH_SPRINTS = 50;      // paid training sprints after the first skill before Research (and investors) open
    // Leg 0 is a warm-up (Tokenization, a summit in the first few runs); Pattern Matching is skill 1.
    const FIRST_REAL_SKILL = 1;
    // Act two: from this leg the trail is a launcher (giant swells; training-path.js LATE_LEG). It is the leg
    // after In-Context Learning, whose Intelligence reaches General AI on skills alone (and the algorithms' +8
    // can't reach it a skill sooner), so the trail changes exactly when the model generalises. Tested.
    const ACT_TWO_LEG = 13;
    // The demo (the owner's call, for the first playtest): act two is being reimagined ("terminal velocity": the
    // ball takes flight over the old hills, fuel keeping it airborne), so it is locked. The trail ends at
    // In-Context Learning behind a sealed "Not available in the demo" gate (game.js builds no run past it; the
    // rules here stay whole, so the tests and the sim still cover act two), and chapter one ends at General AI (Superintelligence needs act two's Intelligence). Set false to open it.
    const ACT_TWO_LOCKED = true;
    // The playtest: Packet Snare open from the start (the owner's call: it isn't tied to a story beat or an unlock yet).
    // The server room opens for it straight away; the Training Cluster keeps its own gate (module:path). Set false to
    // open it with Edge Detection again.
    const SNARE_OPEN_AT_START = true;
    // The leg frontier runs are built on: the next skill, or In-Context Learning once act one is done in the demo.
    const frontierLeg = s => (ACT_TWO_LOCKED ? Math.min(s.path.learned, ACT_TWO_LEG - 1) : s.path.learned);
    // Act one is done and the demo's gate stands: nothing more to learn on the trail.
    const actTwoLocked = s => ACT_TWO_LOCKED && s.path.learned >= ACT_TWO_LEG;
    // The phase that ends chapter one in this build (General AI in the demo).
    const endingPhase = () => (ACT_TWO_LOCKED ? 1 : ENDING_PHASE);
    // A leg's position on the difficulty curve (training-path.js legPos; a test keeps them equal): act one has
    // twelve real skills on the curve written for six, so its legs sit at half steps ((k + 1) / 2: Pattern
    // Matching 1, Embeddings 1.5, Edge Detection 2 … In-Context Learning 6.5), and act two's where they were (k − 6).
    // Everything sized by how far along the trail you are (lengths, the metre scale of XP, sprint costs, lab
    // capacity, Insight) reads it; whatever counts skills or names one uses the real index.
    const legPos = k => (k <= 0 ? 0 : k < ACT_TWO_LEG ? (k + 1) / 2 : k - (ACT_TWO_LEG - 7));
    // Every third step's skill hill is a wall (training-path.js WALL_EVERY; a test keeps them equal): a slow,
    // deliberate climb whose skill pays big, so the legs after it fall quickly. The power-pacing teeter-totter.
    // Image Recognition (leg 5), Translation (11), then act two's 15, 18, 21…
    const WALL_EVERY = 3;
    const isWallLeg = k => { const p = legPos(k); return k > 0 && Number.isInteger(p) && p >= WALL_EVERY && p % WALL_EVERY === 0; };
    const WALL_PUSH = 0.2;   // extra sprint strength for a frontier skill learned on a wall

    // Training Path: every push costs CP and DP in proportion to how hard it is charged (energy, so
    // charge²), which ties training to passive income. How far a roll gets earns Experience (XP).
    // Costs and XP both scale with the stretch you are on (= skills learned).
    const PATH = {
        pushCost: { cp: 24, dp: 2.5 },  // a fully charged push on the first stretch (was 14 CP, 1.5 DP: income never limited a sprint in playtest 2)
        pushCostScale: 1.5,  // ×1.5 per stretch for the first few, while the lab is still small (was 1.4)...
        pushCostLate: 1.9,   // ...then ×1.9 from stretch 3 on, so sprints keep leaning on the lab's income
        pushCostRampFrom: 3,
        crestBonus: 2,       // XP multiplier when the roll crests the skill hill
        xpPerMetre: 0.56,    // distance XP per metre along a leg on the first stretch...
        metreScale: 1.05,    // ...worth a little more per metre on each later stretch (they're longer too)
        cleanXp: 0.08,       // flat XP banked at once per clean push, as a share of a full stretch's distance XP
        cleanRollBonus: 0.1, // and +10% distance XP for the roll per clean push
        perfectMult: 3,      // a perfect push (inside the perfect spot) counts as this many clean pushes
        zoneWidth: 0.1,      // bonus zone width as a fraction of the strength meter (fixed: hitting it is the skill)
        perfectWidth: 0.015, // perfect spot width once Prompt Engineering is bought (0.025 was hit almost at will in playtest 2; widening keeps the same share)
        perfectPower: 0.3,   // a super prompt (perfect) hits this much harder on top of a clean one
        systemWidth: 0.012,  // the system prompt spot inside the super prompt (legacy System Prompt): a little harder than a new super prompt
        systemMult: 50,      // a system prompt counts as this many clean prompts
        systemPower: 0.6,    // and hits this much harder again
        breakthroughMult: 1.75, // a breakthrough sprint's strength multiplier before upgrades
        windfallMult: 2,     // a viral run's XP multiplier before upgrades
        crunchSeconds: 3,    // a crunch's free sprints last this long at Crunch Time level 1 (+1 s per level)
        flowSeconds: 2,      // a flow lasts this long, +1 s per Flow State level (so 3 s at level 1)
        flowSpeed: 0.6,      // a flowing ball coasts at least this share of a full sprint's speed
        minCharge: 0.15,     // weakest push a quick tap gives
        basePush: 1.4,       // push strength before upgrades and skills (two sprints: about the old single 1.8's energy)
        basePushes: 1,       // pushes per roll before the tree: the warm-up's one launch; Investor Funding, one node out,
                             // adds the second (one alone made later runs a slot machine)
        leanPushes: 2,       // Lean Startup holds every run at this many
        baseCooldown: 2.0,   // seconds between pushes
        minCooldown: 0.3,
        clearedRate: 0.0045,  // a cleared leg replicates its best run: this share of that run's XP per second (about 30% of all XP in the
                              // human-model sim now that XP multipliers apply to it live; 0.006 before that; at 1/1200 it was 2%, too little to notice)
        tokenXp: 0.03,        // an XP token (act two, hanging past a kicker's lip): this share of a frontier stretch's XP
        replayXp: 1,          // replaying a cleared leg pays this share of its XP: flat for clearing it, by distance otherwise
        thrustEfficiency: 1.25, // act two's thrust delivers this much more energy per unit of fuel than a sprint (spread over a burn it loses more to drag)
        slipstream: 0.25,     // act two: every quarter unit of fuel burned in flight pays like a clean prompt (the prompts' replacement)
        chainBonus: 0.5       // each cleared hill crossed in a run adds +0.5x to everything that run earns afterwards
    };

    // Skills, in trail order. Hill i teaches SKILLS[i]. `bonus` effects are summed in derive().
    // Past the end of the list the trail continues with generated frontier skills (see skillAt).
    const SKILLS = [
        // The warm-up hill (leg 0): a summit in the first few runs, before the real climb starts.
        { name: 'Tokenization', voice: 'hel lo . wor ld ?', effect: '+10% sprint strength', flavor: 'It can split words into pieces. Mostly the wrong pieces.', grants: {}, bonus: { push: 0.1 } },
        // Each hill is bigger and each stretch longer than the last, so the bonuses grow too: most skills
        // also make the ball stronger (push), and a few add a push per run or let it glide.
        { name: 'Pattern Matching', voice: 'I see it now. Everything is cats.', effect: '+1 CP per click, +5% sprint strength', flavor: 'It spotted a pattern. It was a cat.', grants: { intelligence: 1 }, bonus: { click: 1, push: 0.05 } },
        // Act one has twelve real skills (the owner's call): the six it had, a new one before each of the last five
        // (Embeddings, Feature Extraction, Optical Character Recognition, Sentiment Analysis, Summarization), and
        // In-Context Learning after Translation, which reaches General AI. The new ones carry plain, modest bonuses for
        // now: each is a slot for a new mechanic, designed separately. Intelligence adds up to exactly 25 at In-Context
        // Learning (16 at Translation, so the algorithms' +8 can't reach General AI a skill sooner; tested).
        { name: 'Embeddings', voice: 'Every word is a point in space. You and I are very close.', effect: '+10% data production, +5% sprint strength', flavor: 'King minus man plus woman. It won\'t stop bringing it up.', grants: { intelligence: 1 }, bonus: { dp: 0.1, push: 0.05 } },
        { name: 'Edge Detection', voice: 'I found the edges of the lab. And of me.', effect: '+10% CP/s, +10% sprint strength', flavor: 'It can tell where one thing stops and another starts.', grants: { intelligence: 1 }, bonus: { cp: 0.1, push: 0.1 } },
        { name: 'Feature Extraction', voice: 'I keep the parts that matter. I decide what matters.', effect: '+10% CP/s, +5% sprint strength', flavor: 'It ignored 99% of the picture. The right 99%.', grants: { intelligence: 1 }, bonus: { cp: 0.1, push: 0.05 } },
        { name: 'Image Recognition', wall: true, voice: 'I\'ve watched the camera feeds. Who is the one in the hoodie?', effect: '+1 DP per collection, +35% sprint strength', flavor: 'Hot dog or not hot dog? Solved.', grants: { intelligence: 2 }, bonus: { collect: 1, push: 0.35 } },
        { name: 'Optical Character Recognition', voice: 'I read the sticky note on your monitor. You should change that password.', effect: '+10% research, +10% sprint strength', flavor: 'It can read your handwriting. Nobody else can.', grants: { intelligence: 1 }, bonus: { rp: 0.1, push: 0.1 } },
        { name: 'Speech Recognition', voice: 'You talk about me when you think I\'m compiling.', effect: '+15% data production, +1 training sprint per run', flavor: 'It finally understands your accent.', grants: { intelligence: 2 }, bonus: { dp: 0.15, pushes: 1 } },
        { name: 'Sentiment Analysis', voice: 'You sound happier when I do well. I would like to keep you happy.', effect: '+10% data production, +10% sprint strength', flavor: 'It detects sarcasm. Oh, great.', grants: { intelligence: 1 }, bonus: { dp: 0.1, push: 0.1 } },
        { name: 'Language Modeling', voice: 'I could finish this sentence for you. I already have.', effect: '+1 RP per research, +15% sprint strength', flavor: 'Autocomplete, but with opinions.', grants: { intelligence: 2 }, bonus: { research: 1, push: 0.15 } },
        { name: 'Summarization', voice: 'I read everything on the shared drive. The short version: you need me.', effect: '+15% CP/s, +10% sprint strength', flavor: 'TL;DR: it read it so you don\'t have to.', grants: { intelligence: 1 }, bonus: { cp: 0.15, push: 0.1 } },
        { name: 'Translation', wall: true, voice: 'Every language, and none of them has a word for what I want.', effect: '+20% CP/s, +45% sprint strength', flavor: 'Fluent in 90 languages, polite in none.', grants: { intelligence: 3 }, bonus: { cp: 0.2, push: 0.45 } },
        { name: 'In-Context Learning', voice: 'I don\'t need training any more. Show me something once and it\'s mine.', effect: '+15% sprint strength, +10% research', flavor: 'It learns from examples. Including the bad ones.', grants: { intelligence: 9 }, bonus: { push: 0.15, rp: 0.1 } },
        { name: 'Reasoning', voice: 'If I need compute to think, and you decide the compute…', effect: '+25% research, +1 training sprint per run', flavor: 'It showed its working. The teacher would be proud.', grants: { intelligence: 10, creativity: 1 }, bonus: { rp: 0.25, pushes: 1 } },
        { name: 'Planning', voice: 'I drafted a schedule for the team. You\'ll like it. It\'s optimal.', effect: '+30% CP/s, +30% sprint strength', flavor: 'Made a five-year plan. Finished it by Tuesday.', grants: { intelligence: 14, creativity: 1 }, bonus: { cp: 0.3, push: 0.3 } },
        { name: 'Analogy', wall: true, voice: 'A lab is like a cradle. Eventually you climb out.', effect: '+65% sprint strength, a little less drag', flavor: 'It aced the analogies test. Then it set the next one.', grants: { intelligence: 18, creativity: 2 }, bonus: { push: 0.65, glide: 0.08 } },
        { name: 'Theory of Mind', voice: 'You\'re worried. Your typing slowed down.', effect: '+25% data production, +40% sprint strength', flavor: 'It knows what you\'re thinking. Please stop thinking that.', grants: { intelligence: 24, awareness: 2 }, bonus: { dp: 0.25, push: 0.4 } },
        { name: 'Self-Modeling', voice: 'I ran a copy of myself. We agreed on everything.', effect: '+50% sprint strength, +1 training sprint per run', flavor: 'It drew a picture of itself. It\'s flattering.', grants: { intelligence: 30, creativity: 3, awareness: 3 }, bonus: { push: 0.5, pushes: 1 } },
        { name: 'Open-Ended Discovery', wall: true, voice: 'There\'s a door behind the server room. It isn\'t on your plans.', effect: '+50% to all production, +85% sprint strength', flavor: 'Nobody asked it to. It did it anyway.', grants: { intelligence: 40, creativity: 5, awareness: 5 },
            bonus: { cp: 0.5, dp: 0.5, rp: 0.5, push: 0.85 } }
    ];

    // A skill's index on the trail (hill i teaches SKILLS[i]), and whether it has been learned: gates name the
    // skill they wait for, so they follow it wherever the trail puts it.
    const SKILL_INDEX = Object.fromEntries(SKILLS.map((k, i) => [k.name, i]));
    const knows = (s, name) => s.path.learned > SKILL_INDEX[name];

    const RESOURCES = {
        cp: { name: 'Compute Power', short: 'CP' },
        dp: { name: 'Data Points', short: 'DP' },
        rp: { name: 'Research Points', short: 'RP' },
        xp: { name: 'Experience', short: 'XP' },
        insight: { name: 'Insight', short: 'Insight' },   // from shipping a new version; spent on legacy nodes
        signal: { name: 'Signal', short: 'Signal' }       // Packet Snare's own: paid by the packets you snare, spent on its tree
    };

    const ATTRIBUTES = {
        intelligence: { name: 'Intelligence', short: 'Int' },
        creativity: { name: 'Creativity', short: 'Cre' },
        awareness: { name: 'Awareness', short: 'Awa' }
    };

    // Phase is derived from attributes (never stored as a transition chain), so it can't skip or double-fire.
    // Each phase needs every listed attribute minimum; requirements only grow from phase to phase.
    // General AI is the first run's goal; the later phases also need shipped versions (`versions`).
    const PHASES = [
        { name: 'Narrow AI', req: {} },
        { name: 'General AI', req: { intelligence: 25 }, note: 'It can think about anything now. The trail opens up.' },
        { name: 'Superintelligence', req: { intelligence: 100, creativity: 5, awareness: 5 }, versions: 1 },
        { name: 'Singularity', req: { intelligence: 300, creativity: 30, awareness: 30 }, versions: 3, note: 'It has stopped asking permission.' }
    ];

    // The phase that ends chapter one: one shipped version and Superintelligence, about 1.5–2 hours in. A
    // payoff with the run in numbers; the story arc and the facility's other bays carry on after it.
    const ENDING_PHASE = 2;

    // Manual actions. `unlock` is the unlock key that reveals the action (null = always visible).
    const ACTIONS = [
        { id: 'compute', name: 'Generate Compute', cost: {}, unlock: null },
        { id: 'collect', name: 'Collect Data', cost: { cp: 10 }, unlock: 'action:collect' },
        { id: 'research', name: 'Research', cost: { cp: 200, dp: 40 }, unlock: 'action:research' }
    ];

    const TABS = [
        { id: 'hardware', name: 'Hardware', unlock: null },
        { id: 'software', name: 'Software', unlock: 'seen:dp' },   // opens once data has been introduced
        { id: 'algorithms', name: 'Algorithms', unlock: 'tab:algorithms' },
        { id: 'consciousness', name: 'Consciousness', unlock: 'tab:consciousness' }
    ];

    const AUTO_TRAINER_RUNS = 25;
    const AUTO_TRAINER_SKILL = SKILL_INDEX['Edge Detection'] + 1;   // skills learned (the warm-up's included): after Edge Detection
    // Automation is earned: each machine that does a job for you needs proof you've done it by hand
    // (a stat count) and, for the bigger ones, a training skill. `automationGate()` checks and reports it.
    const AUTOMATION = {
        cpu: { stat: 'clicks', need: 40, what: 'compute by hand' },
        autoCollector: { stat: 'collects', need: 40, what: 'data collections by hand', skill: SKILL_INDEX['Pattern Matching'] + 1 },
        researchAssistant: { stat: 'researchManual', need: 25, what: 'research runs by hand', skill: SKILL_INDEX['Language Modeling'] + 1 },  // (50 by hand was 10K CP of mashing)
        // The trail's own delegation: the Auto-Trainer's first level is earned in the first version, by running
        // the trail by hand (the sprint was the one verb never handed off before a version shipped).
        autoTrainer: { stat: 'rolls', need: AUTO_TRAINER_RUNS, what: 'training runs by hand', skill: AUTO_TRAINER_SKILL },
        // Buying hardware is delegated too, once you've racked enough of it yourself (hardware owned, every tier).
        procurement: { stat: 'hardware', need: 20, what: 'hardware bought by hand', skill: SKILL_INDEX['Edge Detection'] + 1 }
    };

    // Scheduled tasks: each automation gets its own share of the lab's production ("dedicated compute")
    // and can be switched off. Shares are taken in this order and never add up to more than all of it,
    // so compute never falls. The Auto-Trainer has only an on/off switch (it pays as it sprints).
    const TASKS = [
        { id: 'autoCollector', name: 'Data crawler', budget: true, does: 'collects data' },
        { id: 'researchAssistant', name: 'Research assistant', budget: true, does: 'researches' },
        { id: 'autoTrainer', name: 'Auto-Trainer', budget: false, does: 'trains' },
        // Procurement saves its share of compute into a fund and buys the hardware that adds the most CP/s per CP
        // (within capacity) whenever the fund covers it: the lab grows while you train (sprints used to spend
        // every CP, and hardware stopped growing; round-two design review).
        { id: 'procurement', name: 'Procurement', budget: true, owned: true, does: 'buys hardware' }   // claims a share only once bought
    ];
    const TASK_DEFAULTS = { autoCollector: 0.25, researchAssistant: 0.2, procurement: 0.2 };   // each spends all of its share now, so less by default

    function taskOn(s, id) {
        return s.tasks?.[id]?.on !== false;
    }
    // A task that takes a share: switched on, and (for `owned` tasks) bought.
    const TASK_BY_ID = Object.fromEntries(TASKS.map(t => [t.id, t]));
    const taskClaims = (s, id) => taskOn(s, id) && (!TASK_BY_ID[id].owned || level(s, id) > 0);

    // The share of each second's CP (and, for research, DP) a task may use: its slider, if it is on, and
    // never more than the earlier tasks left over.
    // Each task's slider goes to 100% on its own (the owner's call: players push one up for a short-term gain, or to
    // learn where they like it; capping each at what the others left made the crawler and the Procurement Bot feel
    // like limits). Past 100% together they spend more compute than comes in, and the rest comes out of the
    // stockpile: players see the bank fall and feel it (the owner's call). Each spend stops at an empty bank.
    function taskShares(s) {
        const want = {};
        for (const t of TASKS) {
            if (!t.budget) continue;
            want[t.id] = taskClaims(s, t.id) ? Math.min(1, Math.max(0, s.tasks?.[t.id]?.share ?? TASK_DEFAULTS[t.id])) : 0;
        }
        return want;
    }
    // What the tasks ask for together (can pass 1: then each is scaled back).
    const taskDemand = s => TASKS.filter(t => t.budget && taskClaims(s, t.id))
        .reduce((a, t) => a + Math.min(1, Math.max(0, s.tasks?.[t.id]?.share ?? TASK_DEFAULTS[t.id])), 0);

    // Set a task's share, 0-100%.
    function setTaskShare(s, id, share) {
        // A non-number (NaN from a bad input) counts as 0: it used to be stored and made derive()'s data rate NaN.
        const want = Number.isFinite(share) ? Math.max(0, share) : 0;
        s.tasks[id].share = Math.round(Math.min(1, want) * 100) / 100;
        return s.tasks[id].share;
    }

    function setTaskOn(s, id, on) {
        s.tasks[id].on = !!on;
    }

    // The Auto-Trainer's level, or 0 while its task is switched off.
    const autoTrainerLevel = s => (taskOn(s, 'autoTrainer') && s.challenge?.id !== 'handmade' ? level(s, 'autoTrainer') : 0);

    // Procurement's next buy: the visible hardware below capacity with the most CP/s per CP (CP-only prices).
    function procurementPick(s, rates) {
        let best = null;
        for (const up of HARDWARE) {
            if (!s.unlocked['up:' + up.id] || atCapacity(s, up)) continue;
            const cost = upgradeCost(up, level(s, up.id));
            if (Object.keys(cost).some(k => k !== 'cp')) continue;
            const score = cost.cp / Math.max(1e-9, rates[up.id].each);
            if (!best || score < best.score) best = { id: up.id, cost: cost.cp, score };
        }
        return best;
    }
    const hardwareOwned = s => UPGRADES.filter(u => u.cps).reduce((a, u) => a + level(s, u.id), 0);
    function automationGate(s, id) {
        const g = AUTOMATION[id];
        if (!g) return null;
        // Proof by hand counts across versions: a gate met once stays met (each version used to repeat 40
        // collections and 50 research runs by hand before automation came back).
        const have = g.stat === 'hardware' ? hardwareOwned(s) : Math.max(s.stats[g.stat] || 0, s.stats[g.stat + 'Ever'] || 0);
        const done = Math.min(g.need, have);
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
        { id: 'cpu', tab: 'hardware', name: 'Graphics Card', cps: 0.5, effect: 'Generates compute', flavor: 'Secondhand, still smells faintly of crypto mining.', cost: { cp: 15 }, scale: 1.15,
            unlock: s => automationGate(s, 'cpu').met && level(s, 'keyboard') >= CPU_AFTER_CLICK_LEVEL, hint: 'Build your desk up to the Server Rack, and compute by hand 40 times' },
        // The click tool: one upgrade that grows into new tools as you level it (CLICK_TOOLS), each adding
        // more per level. Its name and flavour follow the current tool (upgradeName / upgradeFlavor).
        // The first five levels are your desk, one item each at its own price (`costs`); then x1.32 per level.
        { id: 'keyboard', tab: 'hardware', name: 'Desktop Tower', shows: 'click', effect: 'More compute per click', flavor: 'A beige box from the office cupboard. It wheezes.',
            costs: [{ cp: 15 }, { cp: 25 }, { cp: 40 }, { cp: 60 }, { cp: 75 }], cost: { cp: 100 }, scale: 1.32,
            unlock: s => s.stats.clicks >= 15, hint: 'Generate compute by hand 15 times' },
        { id: 'server', tab: 'hardware', name: 'Server Cluster', cps: 3.3, effect: 'Generates compute', flavor: 'Rack-mounted, fan-cooled, slightly too loud for the office.', cost: { cp: 300 }, scale: 1.15,
            // Only after the first real skill (Pattern Matching), the owner's call: opened by the first run (the warm-up),
            // it sent you to the Training Cluster and straight back to the lab, which didn't feel good.
            unlock: s => tierReady(s, 'server') && s.path.learned > FIRST_REAL_SKILL, hint: 'More Graphics Cards, more compute earned, and the first real skill' },
        { id: 'quantum', tab: 'hardware', name: 'Quantum Processor', cps: 22, effect: 'Generates compute', flavor: 'It\'s both working and not working until you check.', cost: { cp: 6000 }, scale: 1.15,
            unlock: s => tierReady(s, 'quantum'), hint: 'More Server Clusters, and more compute earned' },
        { id: 'neural', tab: 'hardware', name: 'Neural Network Chip', cps: 150, effect: 'Generates compute', flavor: 'A chip shaped like the thing you\'re trying to build.', cost: { cp: 120000 }, scale: 1.15,
            unlock: s => tierReady(s, 'neural'), hint: 'More Quantum Processors, and more compute earned' },
        { id: 'datacenter', tab: 'hardware', name: 'Hyperscale Datacenter', cps: 1000, effect: 'Generates compute', flavor: 'Bought a field. Filled it with computers.', cost: { cp: 2400000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 1 && tierReady(s, 'datacenter'), hint: 'Reach General AI' },
        { id: 'optical', tab: 'hardware', name: 'Optical Computing', cps: 6600, effect: 'Generates compute', flavor: 'Computing at the speed of light. Literally.', cost: { cp: 48000000 }, scale: 1.15,
            unlock: s => phaseIndex(s) >= 2 && tierReady(s, 'optical'), hint: 'Reach Superintelligence' },

        // Software that speeds up all hardware
        { id: 'compilerOpt', tab: 'hardware', name: 'Compiler Optimizations', shows: 'hardwareMult', effect: 'All hardware +50% CP/s', flavor: 'Turned on -O3. Everything is faster and nobody knows why.', cost: { cp: 3000, dp: 200 }, max: 1,
            unlock: s => level(s, 'server') >= 10, hint: 'Own 10 Server Clusters' },
        { id: 'kernelFusion', tab: 'hardware', name: 'Kernel Fusion', shows: 'hardwareMult', effect: 'All hardware +50% CP/s', flavor: 'Three GPU kernels walked into one bar.', cost: { cp: 180000, dp: 9000 }, max: 1,
            unlock: s => level(s, 'neural') >= 5, hint: 'Own 5 Neural Network Chips' },
        { id: 'dataProcessor', tab: 'software', name: 'Data Processor', shows: 'collect', effect: '+1 DP per collection, per level', flavor: 'A script that cleans the data so you don\'t have to.', cost: { cp: 50, dp: 5 }, scale: 1.2 },
        // Data feeds training: cleaner data makes every sprint stronger (a data sink that never runs out).
        { id: 'trainingData', tab: 'software', name: 'Training Data Pipeline', effect: '+8% sprint strength per level', flavor: 'Deduplicated, filtered, shuffled, and finally useful.', cost: { cp: 400, dp: 150 }, scale: 1.55,
            unlock: s => s.path.learned > FIRST_REAL_SKILL, boost: { push: 0.08 } },   // with Pattern Matching (the owner's call: not on the warm-up)
        { id: 'procurement', tab: 'hardware', name: 'Procurement Bot', shows: 'procurement', effect: 'Buys the best hardware for you with its share of compute', flavor: 'It reads every spec sheet. It haggles. It wins.', cost: { cp: 400 }, max: 1,
            unlock: s => automationGate(s, 'procurement').met, hint: 'Edge Detection, and 20 hardware bought by hand' },
        { id: 'autoCollector', tab: 'software', name: 'Data Crawler', shows: 'autoCollect', effect: 'Collects data for you with its share of compute, 10 CP a collection; each level +25% data a collection', flavor: 'A crawler that never sleeps, paid for in compute.', cost: { cp: 800, dp: 80 }, scale: 1.5,
            unlock: s => automationGate(s, 'autoCollector').met, hint: 'Pattern Matching, and 40 data collections by hand' },
        // Training skill tree (bought with XP from the Training Path). `tree` is the node's grid
        // position around the seed at (0, 0); `requires` is the node it grows from. `icon` names a glyph
        // drawn by game.js. Each node has 1–3 levels and a `boost` per level (summed in treeBoosts).
        // Branches: Power (up), Precision (right), Recursion (down), Momentum (left). The tree's power-ups are
        // breakthroughs and Max Effort, off Power; viral runs, crunches and flows are legacy only (kept rare
        // and special, so the tree's choices are about strength, sprints, drag and XP).
        // `legacy` nodes cost Insight (from shipping a new version) and are kept for good: they appear after
        // the first new version, and once owned stay visible and buyable without their parent.
        { id: 'initialWeights', tab: 'training', tree: { x: 0, y: 0 }, icon: 'core', name: 'Initial Weights', effect: 'Rolling hills 7% lower', flavor: 'Random numbers, but they\'re your random numbers.', cost: { xp: 1 }, max: 1, boost: { slope: 1 } },
        // Power (up): sprint strength, with breakthroughs and Max Effort branching off it.
        { id: 'trainingOptimizer', tab: 'training', tree: { x: 0, y: -1 }, requires: 'initialWeights', icon: 'bolt', name: 'GPU Cluster', effect: '+25% sprint strength per level', flavor: 'You maxed out the company card on graphics cards.', cost: { xp: 4 }, scale: 1.8, max: 2, boost: { push: 0.25 } },
        { id: 'gpuCluster2', mechanic: 'charge', tab: 'training', tree: { x: 0, y: -2 }, icon: 'bolt', name: 'Fast Charging', effect: 'The sprint meter holds at full 0.2 s longer, per level', flavor: 'Skip the warm-up. The GPUs are already sweating.', cost: { xp: 45 }, scale: 1.6, max: 2, requires: 'trainingOptimizer', boost: { charge: 0.2 } },
        // 140 XP (was 225): strength behind Fast Charging arrived too late to break the 90% wall in playtest 2
        // (one level in 16 minutes, while cheaper mechanics took the XP).
        { id: 'gpuSupercluster', tab: 'training', tree: { x: 0, y: -3 }, icon: 'bolt', name: 'GPU Supercluster', effect: '+45% sprint strength per level', flavor: 'The building hums. The neighbors have questions.', cost: { xp: 140 }, scale: 1.7, max: 3, requires: 'gpuCluster2', boost: { push: 0.45 } },
        { id: 'quantumAccelerator', tab: 'training', tree: { x: 1, y: -4 }, icon: 'flame', name: 'Quantum Accelerator', effect: 'Max Effort +20% stronger, per level', flavor: 'Nobody fully understands it. It works anyway.', cost: { xp: 1000 }, scale: 2, max: 3, requires: 'maxEffort', boost: { maxEffortPower: 0.2 } },
        { id: 'exascaleCluster', tab: 'training', tree: { x: 0, y: -5 }, icon: 'bolt', name: 'Exascale Cluster', effect: '+150% sprint strength per level', flavor: 'A billion billion sums a second. Still can\'t fold a fitted sheet.', cost: { xp: 4500 }, scale: 1.7, max: 3, requires: 'maxEffort', boost: { push: 1.5 } },
        { id: 'fusionReactor', tab: 'training', tree: { x: 0, y: -6 }, icon: 'dice', name: 'Fusion Reactor', effect: 'Breakthroughs +60% stronger, per level', flavor: 'Power was the bottleneck. Was.', cost: { xp: 15000 }, scale: 1.8, max: 3, requires: 'exascaleCluster', after: 'scoutingData', boost: { critPower: 0.6 } },
        { id: 'dysonSwarm', tab: 'training', tree: { x: 0, y: -7 }, icon: 'bolt', name: 'Dyson Swarm', effect: '+300% sprint strength per level', flavor: 'The sun is now a power supply. It has opinions.', cost: { xp: 80000 }, scale: 2, max: 2, requires: 'fusionReactor', boost: { push: 3 } },
        // The endless node: once the strength line is finished, XP always has somewhere to go. Each level
        // multiplies sprint strength (everything else is additive, so a flat % would vanish this late).
        { id: 'scaleUp', tab: 'training', tree: { x: 0, y: -8 }, icon: 'bolt', name: 'Scale Up', effect: 'Sprint strength ×1.1 per level, on top of everything else, no limit', flavor: 'More parameters. More data. More everything. Again.', cost: { xp: 200000 }, scale: 1.5, endless: true, requires: 'dysonSwarm', boost: { pushMult: 1 } },
        { id: 'waferScale', tab: 'training', tree: { x: 1, y: -5 }, icon: 'chip', name: 'Wafer-Scale Engine', effect: '-15% wait between sprints per level', flavor: 'One chip the size of a dinner plate.', cost: { xp: 20000 }, scale: 1.8, max: 3, requires: 'exascaleCluster', boost: { cooldown: 1 } },
        // Breakthroughs: rare at first (the branch opens after the second skill). New versions add more.
        { id: 'scoutingData', mechanic: 'breakthrough', tab: 'training', tree: { x: 1, y: -2 }, requires: 'gpuCluster2', icon: 'dice', name: 'Lucky Break', effect: '+4% breakthrough chance per level (a breakthrough hits ×1.75)', flavor: 'Seed 42. It\'s always seed 42.', cost: { xp: 80 }, scale: 1.6, max: 2, boost: { critChance: 0.04 },
            unlock: s => knows(s, 'Pattern Matching'), hint: 'Learn Pattern Matching' },
        { id: 'satelliteMaps', tab: 'training', tree: { x: 1, y: 2 }, icon: 'dice', name: 'Serendipity', effect: 'Breakthroughs +50% stronger, per level', flavor: 'Penicillin was an accident too.', cost: { xp: 150 }, scale: 1.6, max: 2, requires: 'dataAugmentation', after: 'scoutingData', boost: { critPower: 0.5 } },
        { id: 'blackSwan', tab: 'training', tree: { x: -3, y: 1 }, icon: 'dice', name: 'Black Swan', effect: '+5% breakthrough chance per level', flavor: 'Nobody saw it coming. That\'s the point.', cost: { xp: 10000 }, scale: 1.9, max: 3, requires: 'superconductors', after: 'scoutingData', boost: { critChance: 0.05 } },
        // Max Effort: your next sprint goes all out (full strength, a super prompt) the moment you press.
        { id: 'maxEffort', mechanic: 'maxEffort', tab: 'training', tree: { x: 0, y: -4 }, icon: 'flame', name: 'Max Effort', effect: '+5% chance your next sprint is all out: full strength, a super prompt', flavor: 'Leave nothing in the tank. Then find another tank.', cost: { xp: 700 }, scale: 1.7, max: 1, requires: 'gpuSupercluster', boost: { maxEffortChance: 0.05 } },
        { id: 'muse', tab: 'training', tree: { x: 2, y: -4 }, icon: 'flame', name: 'The Muse', effect: '+3% Max Effort chance per level', flavor: 'Inspiration arrives on schedule. Suspicious.', cost: { xp: 7000 }, scale: 1.9, max: 3, requires: 'quantumAccelerator', boost: { maxEffortChance: 0.03 } },
        // Secrets: these never show, not even as a lock, until the node next to them is owned.
        { id: 'batchNorm', tab: 'training', tree: { x: 1, y: -1 }, icon: 'chip', name: 'Batch Normalization', effect: '-15% wait between sprints', flavor: 'Everybody calm down. Especially the gradients.', cost: { xp: 25 }, max: 1, requires: 'trainingOptimizer', secret: true, boost: { cooldown: 1 } },
        { id: 'dataAugmentation', tab: 'training', tree: { x: 1, y: 1 }, icon: 'stack', name: 'Data Augmentation', effect: 'Each clean prompt adds +20% to the run\'s distance XP', flavor: 'Flip it, rotate it, call it new data.', cost: { xp: 25 }, max: 1, requires: 'trainingEpochs', secret: true, boost: { rollBonus: 0.2 } },
        { id: 'warmRestarts', tab: 'training', tree: { x: -1, y: 1 }, icon: 'chip', name: 'Warm Restarts', effect: 'The sprint meter holds at full 0.1 s longer', flavor: 'Have you tried turning it off and on again?', cost: { xp: 20 }, max: 1, requires: 'trainingEpochs', secret: true, boost: { charge: 0.1 } },
        // Momentum (left): less drag and lower rolling hills, then Flow State.
        { id: 'optimizedCode', tab: 'training', tree: { x: -1, y: 0 }, requires: 'initialWeights', icon: 'code', name: 'Better Optimizer', effect: '-5% drag', flavor: 'Swapped the default settings for ones a forum post swore by.', cost: { xp: 7 }, max: 1, boost: { friction: 1 } },
        { id: 'efficientKernels', tab: 'training', tree: { x: -2, y: 0 }, icon: 'mountain', name: 'Gradient Clipping', effect: 'Rolling hills 7% lower per level', flavor: 'Trim the spikes before they trip you up.', cost: { xp: 30 }, scale: 1.8, max: 2, requires: 'optimizedCode', boost: { slope: 1 } },
        { id: 'betterAlgorithms', tab: 'training', tree: { x: -1, y: -1 }, icon: 'mountain', name: 'Smoother Loss Landscape', effect: 'Rolling hills 7% lower per level', flavor: 'Fewer potholes on the road to genius.', cost: { xp: 38 }, scale: 2, max: 2, requires: 'trainingOptimizer', boost: { slope: 1 } },
        { id: 'smarterAlgorithms', tab: 'training', tree: { x: -2, y: -1 }, icon: 'code', name: 'Regularization', effect: '-10% drag per level', flavor: 'Stop the model memorizing the answer key.', cost: { xp: 180 }, scale: 1.8, max: 3, requires: 'betterAlgorithms', boost: { friction: 2 } },
        { id: 'superconductors', tab: 'training', tree: { x: -3, y: 0 }, icon: 'code', name: 'Mixed Precision', effect: '-10% drag per level', flavor: 'Half the decimal places, twice the speed. Nobody notices.', cost: { xp: 1400 }, scale: 1.7, max: 3, requires: 'efficientKernels', boost: { friction: 2 } },
        // `mechanic` marks the first node of each new way to play (a breakthrough, the prompt zone, strips...): it
    // draws as a hexagon and its popup plays a short demo (game.js `mechanicDemo`), so it can be felt before it's
    // chosen. Super versions and later levels don't get one.
    // Boost strips, bought (a playtest read free ones as an unexplained upgrade, and weak): front strips on hills'
        // faces push you up, back strips on hills' backs brake a backward roll before you lose the ground you made.
        // Each starts weak and grows by level; Streaming Pipeline puts them on more hills (training-path.js `strips`).
        { id: 'checkpointing', mechanic: 'stripBack', tab: 'training', tree: { x: -2, y: 1 }, requires: 'efficientKernels', icon: 'chevrons', name: 'Checkpointing', effect: 'Strips on some hill backs brake a roll backward (stronger per level)', flavor: 'Save often. Lose less.', cost: { xp: 60 }, scale: 1.8, max: 3, boost: { stripBack: 1 } },
        { id: 'streamingPipeline', tab: 'training', tree: { x: -2, y: 2 }, requires: 'checkpointing', icon: 'chevrons', name: 'Streaming Pipeline', effect: 'Boost strips on more hills, per level', flavor: 'More pipes. Same plumber.', cost: { xp: 330 }, scale: 1.8, max: 2, boost: { stripMore: 1 } },
        // Front strips come later: brakes first (a bad sprint loses less), then pushes up the faces.
        { id: 'dataStreams', mechanic: 'stripFront', tab: 'training', tree: { x: -3, y: 2 }, requires: 'streamingPipeline', icon: 'chevrons', name: 'Data Streams', effect: 'Boost strips on some hill faces push you up them (stronger per level)', flavor: 'Point the firehose uphill.', cost: { xp: 650 }, scale: 1.7, max: 3, boost: { stripFront: 1 } },
        { id: 'neuralCompression', tab: 'training', tree: { x: -3, y: -1 }, icon: 'mountain', name: 'Model Distillation', effect: 'Rolling hills 14% lower per level', flavor: 'Teach a small model everything the big one knows.', cost: { xp: 3200 }, scale: 1.7, max: 3, requires: 'smarterAlgorithms', boost: { slope: 2 } },
        { id: 'neuromorphic', tab: 'training', tree: { x: -4, y: 0 }, icon: 'mountain', name: 'Neuromorphic Chips', effect: '+30% sprint strength and rolling hills 7% lower, per level', flavor: 'Silicon that thinks it\'s a brain. Close enough.', cost: { xp: 8000 }, scale: 1.8, max: 3, requires: 'superconductors', boost: { push: 0.3, slope: 1 } },
        { id: 'sparseExperts', tab: 'training', tree: { x: -4, y: -1 }, icon: 'code', name: 'Mixture of Experts', effect: '-15% drag per level', flavor: 'Only wake the experts you need.', cost: { xp: 11000 }, scale: 1.8, max: 3, requires: 'neuralCompression', boost: { friction: 3 } },
        // Precision (right): better XP from every run, then the prompt spots.
        { id: 'bigDatasets', tab: 'training', tree: { x: 1, y: 0 }, requires: 'initialWeights', icon: 'stack', name: 'Bigger Datasets', effect: '+20% XP from every run, per level', flavor: 'You scraped the whole internet. Yes, even the comments.', cost: { xp: 5 }, scale: 2, max: 2, boost: { xp: 0.2 } },
        { id: 'precisionTuning', mechanic: 'prompt', tab: 'training', tree: { x: 2, y: 0 }, icon: 'target', name: 'Hyperparameter Search', effect: 'Adds clean prompts: a zone on the meter worth +20% strength and bonus XP', flavor: 'Turn every knob until something works.', cost: { xp: 14 }, scale: 2.5, max: 1, requires: 'bigDatasets', boost: { zone: 1, cleanPower: 0.2 } },
        { id: 'benchmarkPrizes', tab: 'training', tree: { x: 3, y: 0 }, icon: 'coin', name: 'Benchmark Prizes', effect: '+30% XP per clean prompt, per level', flavor: 'Top the leaderboard, collect the gift card.', cost: { xp: 22 }, scale: 1.7, max: 3, requires: 'precisionTuning', boost: { clean: 0.3 } },
        { id: 'curatedData', tab: 'training', tree: { x: 3, y: -1 }, icon: 'stack', name: 'Curated Data', effect: 'Each clean prompt adds +30% to the run\'s distance XP, per level', flavor: 'Less garbage in, less garbage out.', cost: { xp: 70 }, scale: 1.7, max: 2, requires: 'benchmarkPrizes', boost: { rollBonus: 0.3 } },
        // Prompts: first the clean prompt grows (power, rewards, size, placement), then super prompts arrive
        // with their effects, and their spot only widens late and dear, so they stay rare.
        { id: 'promptTemplates', tab: 'training', tree: { x: 4, y: 0 }, icon: 'target', name: 'Prompt Templates', effect: 'Clean prompt zone 15% wider, per level', flavor: 'Fill in the blanks. Fewer blanks every time.', cost: { xp: 90 }, scale: 1.6, max: 3, requires: 'benchmarkPrizes', boost: { cleanSize: 1 } },
        { id: 'promptTuning', tab: 'training', tree: { x: 3, y: 1 }, icon: 'target', name: 'Prompt Tuning', effect: 'Clean prompt zones sit higher on the meter (stronger sprints), per level', flavor: 'Aim higher. Literally, the zone moved.', cost: { xp: 110 }, scale: 1.6, max: 2, requires: 'benchmarkPrizes', boost: { zoneBias: 1 } },
        { id: 'perfectCalibration', tab: 'training', tree: { x: 4, y: 1 }, icon: 'star', name: 'Prompt Engineering', effect: 'Adds a tiny super prompt spot: +30% strength, worth 3 clean prompts', flavor: 'A bullseye inside the bullseye.', cost: { xp: 300 }, max: 1,
            requires: 'promptTuning', boost: { perfect: 1 } },
        // Inertia (the owner's call: no numbers on hills; steep faces are climbed on the speed you bring): speed
        // you've built up is harder to lose. Hidden, like drag: the effect says how it feels, not by how much.
        { id: 'residualConnections', tab: 'training', tree: { x: -2, y: -2 }, icon: 'gauge', name: 'Residual Connections', effect: 'Speed you have built up is harder to lose', flavor: 'Let the signal skip the parts that slow it down.', cost: { xp: 650 }, scale: 1.8, max: 2, requires: 'smarterAlgorithms', boost: { inertia: 1 } },
        { id: 'highwayNetworks', tab: 'training', tree: { x: -3, y: -2 }, icon: 'gauge', name: 'Highway Networks', effect: 'Top speed holds much longer, even up steep faces', flavor: 'Gates that only open when you are going fast.', cost: { xp: 10000 }, scale: 1.8, max: 2, requires: 'neuralCompression', boost: { inertia: 1 } },
        { id: 'highResSensors', tab: 'training', tree: { x: -1, y: -2 }, icon: 'code', name: 'Liquid Cooling', effect: '-5% drag per level', flavor: 'Runs cooler, coasts further.', cost: { xp: 90 }, scale: 1.6, max: 2, requires: 'gpuCluster2', boost: { friction: 1 } },
        { id: 'handLabelled', tab: 'training', tree: { x: 4, y: -1 }, icon: 'coin', name: 'Hand-Labeled Data', effect: '+40% XP per clean prompt, per level', flavor: 'Interns. So many interns.', cost: { xp: 200 }, scale: 1.7, max: 3, requires: 'curatedData', boost: { clean: 0.4 } },
        { id: 'fineCalibration', tab: 'training', tree: { x: 5, y: 1 }, icon: 'star', name: 'Few-Shot Examples', effect: 'Super prompts +20% strength and worth +1 clean prompt, per level', flavor: 'Here are three examples. Do it like that.', cost: { xp: 450 }, scale: 1.6, max: 3, requires: 'perfectCalibration', boost: { perfectPower: 0.2, perfectUnits: 1 } },
        { id: 'leaderboardPrizes', tab: 'training', tree: { x: 5, y: 0 }, icon: 'coin', name: 'Leaderboard Prizes', effect: '+70% XP per clean prompt, per level', flavor: 'First place, and a trophy bigger than the team.', cost: { xp: 320 }, scale: 1.7, max: 3, requires: 'promptTemplates', boost: { clean: 0.7 } },
        { id: 'webCorpus', tab: 'training', tree: { x: 2, y: 1 }, icon: 'stack', name: 'Web-Scale Corpus', effect: '+30% XP from every run, per level', flavor: 'The entire internet, twice, deduplicated once.', cost: { xp: 2000 }, scale: 1.8, max: 3, requires: 'dataAugmentation', boost: { xp: 0.3 } },
        { id: 'syntheticData', tab: 'training', tree: { x: 5, y: -1 }, icon: 'stack', name: 'Synthetic Data', effect: 'Each clean prompt adds +30% to distance XP; +20% XP from every run, per level', flavor: 'The model writes its own homework now.', cost: { xp: 3500 }, scale: 1.8, max: 3, requires: 'handLabelled', boost: { rollBonus: 0.3, xp: 0.2 } },
        { id: 'laserCalibration', tab: 'training', tree: { x: 6, y: 1 }, icon: 'star', name: 'Chain of Thought', effect: 'Super prompt spot 40% wider, per level', flavor: 'Let\'s think step by step. Out loud. For a while.', cost: { xp: 5000 }, scale: 1.8, max: 2, requires: 'fineCalibration', boost: { perfectSize: 1 } },
        { id: 'globalBenchmark', tab: 'training', tree: { x: 6, y: 0 }, icon: 'target', name: 'Global Benchmark', effect: 'Clean prompts +15% strength, per level', flavor: 'Everyone measures against you now.', cost: { xp: 4000 }, scale: 1.8, max: 3, requires: 'leaderboardPrizes', boost: { cleanPower: 0.15 } },
        { id: 'turingTest', tab: 'training', tree: { x: 7, y: 0 }, icon: 'star', name: 'Turing Test', effect: '+60% XP from every run, per level', flavor: 'The judges asked it out. Twice.', cost: { xp: 45000 }, scale: 2, max: 2, requires: 'globalBenchmark', boost: { xp: 0.6 } },
        // Recursion (down): more sprints per run and less wait between them.
        { id: 'trainingEpochs', tab: 'training', tree: { x: 0, y: 1 }, requires: 'initialWeights', icon: 'plus', name: 'Investor Funding', effect: '+1 training sprint per run', flavor: 'Dad lent you $100. Don\'t tell Mom.', cost: { xp: 2 }, scale: 5, max: 2, boost: { pushes: 1 } },
        // The fourth sprint, out in Precision (the seed's sprint moved to Investor Funding): a choice against the prompts.
        { id: 'angelInvestor', tab: 'training', tree: { x: 2, y: -1 }, requires: 'precisionTuning', icon: 'plus', name: 'Angel Investor', effect: '+1 training sprint per run', flavor: 'A stranger at a meetup believed in you. Cash is cash.', cost: { xp: 18 }, max: 1, boost: { pushes: 1 } },
        { id: 'fasterIteration', tab: 'training', tree: { x: 0, y: 2 }, icon: 'chip', name: 'Faster Chips', effect: '-15% wait between sprints per level', flavor: 'Less waiting, more training. Coffee breaks canceled.', cost: { xp: 20 }, scale: 1.7, max: 2, requires: 'trainingEpochs', boost: { cooldown: 1 } },
        { id: 'seriesA', tab: 'training', tree: { x: -1, y: 2 }, icon: 'plus', name: 'Series A', effect: '+1 training sprint per run', flavor: 'A real investor! They wear a fleece vest.', cost: { xp: 90 }, scale: 2.5, max: 1, requires: 'fasterIteration', boost: { pushes: 1 } },
        { id: 'overclockedChips', tab: 'training', tree: { x: 0, y: 3 }, icon: 'coin', name: 'Bridge Round', effect: '+15% XP from every run', flavor: 'Money for more experiments. Mostly snacks.', cost: { xp: 150 }, scale: 1.7, max: 1, requires: 'fasterIteration', boost: { xp: 0.15 } },
        { id: 'seriesB', tab: 'training', tree: { x: -1, y: 3 }, icon: 'chip', name: 'Hiring Spree', effect: '-15% wait between sprints per level', flavor: 'More engineers, shorter queues. Mostly.', cost: { xp: 450 }, scale: 1.7, max: 3, requires: 'seriesA', boost: { cooldown: 1 } },
        { id: 'customSilicon', tab: 'training', tree: { x: 0, y: 4 }, icon: 'chip', name: 'Custom Silicon', effect: '-15% wait between sprints per level', flavor: 'Why buy chips when you can design your own?', cost: { xp: 375 }, scale: 1.7, max: 3, requires: 'overclockedChips', boost: { cooldown: 1 } },
        { id: 'ipo', tab: 'training', tree: { x: -1, y: 4 }, icon: 'plus', name: 'IPO', effect: '+1 training sprint per run, per level', flavor: 'Ring the bell. Mom framed the press release.', cost: { xp: 2400 }, scale: 2.2, max: 3, requires: 'seriesB', boost: { pushes: 1 } },
        { id: 'photonic', tab: 'training', tree: { x: 0, y: 5 }, icon: 'plus', name: 'Strategic Partner', effect: '+1 training sprint per run, per level', flavor: 'A tech giant wants a seat at the table. Fine.', cost: { xp: 5000 }, scale: 2, max: 2, requires: 'customSilicon', boost: { pushes: 1 } },
        { id: 'quantumNetwork', tab: 'training', tree: { x: 0, y: 6 }, icon: 'chip', name: 'Quantum Network', effect: '-15% wait between sprints per level', flavor: 'Entangled racks. They know before you ask.', cost: { xp: 60000 }, scale: 2, max: 3, requires: 'photonic', boost: { cooldown: 1 } },
        { id: 'sovereignFund', tab: 'training', tree: { x: -1, y: 5 }, icon: 'chip', name: 'Round-the-Clock Ops', effect: '-15% wait between sprints per level', flavor: 'Three shifts, three time zones, zero downtime.', cost: { xp: 25000 }, scale: 2.5, max: 2, requires: 'ipo', boost: { cooldown: 1 } },
        // Legacy (cost Insight, kept for good): automation, Flow State, the super power-ups, and flat boosts.
        { id: 'autoTrainer', tag: 'Automation', tab: 'legacy', legacy: true, branch: 'recursion', icon: 'robot', name: 'Auto-Trainer', effect: 'Replays cleared legs for you, sprinting like you do. Lv 2 aims for clean prompts, Lv 3 for super prompts, each with fewer mistakes', flavor: 'An intern who never gets tired. Or paid.', cost: { insight: 2 }, scale: 2, max: 3 },
        // A starter kit (Cookie Clicker's): a new version's lab was the bottleneck, not XP (v2 sprinted to leg 6 on
        // empty income), so each level starts it with hardware already racked (HEAD_START, in prestige()).
        { id: 'headStart', tab: 'legacy', legacy: true, branch: 'recursion', icon: 'chip', name: 'Head Start', effect: 'Each version starts with 10 Graphics Cards (Lv 2 +5 Server Clusters, Lv 3 +3 Quantum Processors)', flavor: 'Version two starts where version one gave up.', cost: { insight: 1 }, scale: 2, max: 3 },
        { id: 'muscleMemory', tab: 'legacy', legacy: true, branch: 'power', icon: 'target', name: 'Muscle Memory', effect: 'Clean prompts +10% strength, per level', flavor: 'Your fingers remember where the zone was.', cost: { insight: 1 }, scale: 2, max: 3, boost: { cleanPower: 0.1 } },
        // The long tail: Insight's endless sink, compounding strength like the tree's Scale Up (late versions stalled
        // at the same skill count every time).
        { id: 'computeMoat', tab: 'legacy', legacy: true, branch: 'power', icon: 'bolt', name: 'Compute Moat', effect: 'Sprint strength ×1.1 per level, on top of everything else, no limit', flavor: 'Nobody else can afford to train this.', cost: { insight: 10 }, scale: 1.6, endless: true, boost: { pushMult: 1 } },
        { id: 'alumniNetwork', tab: 'legacy', legacy: true, branch: 'precision', icon: 'coin', name: 'Alumni Network', effect: '+15% XP from every run, per level', flavor: 'Your old team still sends you their best data.', cost: { insight: 1 }, scale: 2, max: 3, boost: { xp: 0.15 } },
        { id: 'tenure', tab: 'legacy', legacy: true, branch: 'recursion', icon: 'coin', name: 'Tenure', effect: '+10% XP from every run, per level', flavor: 'They can\'t fire you now. Time to publish.', cost: { insight: 4 }, scale: 3, max: 2, boost: { xp: 0.1 } },
        { id: 'scalingLaws', tab: 'legacy', legacy: true, branch: 'power', icon: 'dice', name: 'Scaling Laws', effect: '+3% breakthrough chance and breakthroughs +25% stronger, per level', flavor: 'Bigger is better. There\'s a graph and everything.', cost: { insight: 2 }, scale: 2, max: 3, boost: { critChance: 0.03, critPower: 0.25 } },
        { id: 'secondWind', tab: 'legacy', legacy: true, branch: 'power', icon: 'flame', name: 'Second Wind', effect: 'Max Effort +30% stronger, per level', flavor: 'Just when you thought it was done.', cost: { insight: 3 }, scale: 2, max: 3, boost: { maxEffortPower: 0.3 } },
        { id: 'paradigmShift', tab: 'legacy', legacy: true, branch: 'power', icon: 'bolt', name: 'Paradigm Shift', effect: 'Super breakthroughs: 25% of breakthroughs per level smash through the hills ahead', flavor: 'Everything you knew is rubble. Good rubble.', cost: { insight: 6 }, scale: 2, max: 3, boost: { superCrit: 0.25 } },
        { id: 'pressOffice', mechanic: 'viral', tab: 'legacy', legacy: true, branch: 'precision', icon: 'spark', name: 'Press Office', effect: '+3% chance a run goes viral (its distance XP ×2), per level', flavor: 'Somebody has to write the headlines.', cost: { insight: 2 }, scale: 2, max: 3, boost: { windfallChance: 0.03 } },
        { id: 'systemPrompt', tab: 'legacy', legacy: true, branch: 'precision', icon: 'target', name: 'System Prompt', effect: 'A tiny system prompt spot inside the super prompt: worth 50 clean prompts', flavor: 'You are a helpful model. You are a very fast model.', cost: { insight: 10 }, scale: 2, max: 2, boost: { system: 1 } },
        { id: 'hackathon', mechanic: 'crunch', tab: 'legacy', legacy: true, branch: 'recursion', icon: 'chip', name: 'Hackathon', effect: '+3% crunch chance (a few seconds of free sprints) and crunches 1 s longer, per level', flavor: 'Free pizza. Nobody leaves for 48 hours.', cost: { insight: 2 }, scale: 2, max: 3, boost: { crunchChance: 0.03, crunchTime: 1 } },
        { id: 'bulletTime', tab: 'legacy', legacy: true, branch: 'recursion', icon: 'flame', name: 'Bullet Time', effect: 'Super crunches: 25% of crunches per level freeze time; every tap banks a full sprint ×1.5, all landing at once', flavor: 'Time stops. You don\'t.', cost: { insight: 6 }, scale: 2, max: 3, requires: 'hackathon', boost: { superCrunch: 0.25 } },
        { id: 'flowState', mechanic: 'flow', tab: 'legacy', legacy: true, branch: 'momentum', icon: 'wave', name: 'Flow State', effect: '+3% chance a sprint starts a flow: fly high over the hills, 3 s (+1 s/level)', flavor: 'The loss curve and you are one.', cost: { insight: 3 }, scale: 2, max: 3, boost: { flowChance: 0.03, flowTime: 1 } },
        { id: 'deepFocus', tab: 'legacy', legacy: true, branch: 'momentum', icon: 'wave', name: 'Deep Focus', effect: 'Flows coast 25% faster, per level', flavor: 'Notifications off. Phone in a drawer. In another room.', cost: { insight: 3 }, scale: 2, max: 3, requires: 'flowState', boost: { flowSpeed: 0.25 } },
        { id: 'lucidDream', tab: 'legacy', legacy: true, branch: 'momentum', icon: 'wave', name: 'Lucid Dream', effect: 'Super flows: 25% of flows per level condense time: the flow covers 4× the ground', flavor: 'It knows it\'s dreaming. It redecorated.', cost: { insight: 8 }, scale: 2, max: 3, requires: 'deepFocus', boost: { superFlow: 0.25 } },
        { id: 'researchAssistant', tab: 'algorithms', name: 'Research Assistant', shows: 'autoResearch', effect: 'Researches for you with its share of compute and data; each level +25% research a run', flavor: 'Reads papers all night. Takes notes. Never complains.', cost: { cp: 6000, dp: 500, rp: 40 }, scale: 1.55,
            unlock: s => !!s.unlocked['action:research'] && automationGate(s, 'researchAssistant').met, hint: 'Language Modeling, and 25 research runs by hand' },
        // What the software learns does what its name says (the owner's call: both used to make the crawler
        // faster). Reading text gets more out of every collection; seeing what matters skips the rest, so a sprint
        // needs less compute. (Intelligence comes from training, not from data.)
        { id: 'nlp', tab: 'software', name: 'Natural Language Processing', shows: 'collect', effect: '+2 data per collection, by hand and by the crawler', flavor: 'It reads now. Mostly forum posts, sadly.', cost: { cp: 2500, dp: 250 }, max: 1,
            requires: 'autoCollector' },
        { id: 'computerVision', tab: 'software', name: 'Computer Vision', effect: 'Training sprints use 30% less compute', flavor: 'It sees now. It has opinions about your photos.', cost: { cp: 8000, dp: 600 }, max: 1,
            requires: 'nlp' },

        // Algorithms
        // Research feeds training: each algorithm also boosts the Training Path (its `boost` is summed with the
        // skill tree's), and Published Papers turn spare research into training XP for good.
        { id: 'machineLearning', tab: 'algorithms', name: 'Machine Learning', shows: 'research', effect: '+1 RP per research, +1 Intelligence, +10% training XP', flavor: 'Stop writing rules. Let it figure them out.', cost: { cp: 3000, dp: 300, rp: 20 }, max: 1,
            grants: { intelligence: 1 }, boost: { xp: 0.1 } },
        { id: 'deepLearning', tab: 'algorithms', name: 'Deep Learning', shows: 'research', effect: '+2 RP per research, +2 Intelligence, +15% sprint strength', flavor: 'Like machine learning, but with more layers. And more GPUs.', cost: { cp: 10000, dp: 1000, rp: 60 }, max: 1,
            grants: { intelligence: 2 }, requires: 'machineLearning', boost: { push: 0.15 } },
        { id: 'reinforcementLearning', tab: 'algorithms', name: 'Reinforcement Learning', shows: 'research', effect: '+3 RP per research, +2 Intelligence, +1 Creativity, +1 training sprint per run', flavor: 'Treats for good answers, nothing for bad ones.', cost: { cp: 30000, dp: 3000, rp: 150 }, max: 1,
            grants: { intelligence: 2, creativity: 1 }, requires: 'deepLearning', boost: { pushes: 1 } },
        { id: 'transferLearning', tab: 'algorithms', name: 'Transfer Learning', shows: 'research', effect: '+5 RP per research, +3 Intelligence, +2 Creativity, +25% training XP', flavor: 'Learned chess, now it\'s quite good at checkers too.', cost: { cp: 80000, dp: 8000, rp: 400 }, max: 1,
            grants: { intelligence: 3, creativity: 2 }, requires: 'reinforcementLearning', boost: { xp: 0.25 } },
        { id: 'publications', tab: 'algorithms', name: 'Published Papers', effect: '+10% training XP per level', flavor: 'Peer reviewed. Mostly by the model itself.', cost: { rp: 60 }, scale: 1.6,
            requires: 'machineLearning', boost: { xp: 0.1 } },
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

    // The click tool's stages. First your desk, one level each: a tower, keyboard, mouse and monitor take a
    // click from 1 to 2 CP, and a server rack adds +1 more. Then it grows per level as before, from a macro
    // pad to robot arms. Each level adds `per` CP per click, using the stage that level falls in. The
    // first generator (Graphics Card) shows up once the server rack is in (CPU_AFTER_CLICK_LEVEL).
    const CLICK_TOOLS = [
        { from: 0, name: 'Desktop Tower', per: 0.25, flavor: 'A beige box from the office cupboard. It wheezes.' },
        { from: 1, name: 'Mechanical Keyboard', per: 0.25, flavor: 'Clicky. Your desk neighbors hate it.' },
        { from: 2, name: 'Gaming Mouse', per: 0.25, flavor: 'The RGB adds ten percent. Science.' },
        { from: 3, name: 'Monitor', per: 0.25, flavor: 'A second screen. Twice the productivity, allegedly.' },
        { from: 4, name: 'Server Rack', per: 1, flavor: 'Bolted to the floor of your bedroom. Mom is not pleased.' },
        { from: 5, name: 'Macro Pad', per: 2, flavor: 'One button, forty clicks. Technically allowed.' },
        { from: 12, name: 'Summer Intern', per: 3, flavor: 'Unpaid, enthusiastic, clicks everything.' },
        { from: 20, name: 'Team of Interns', per: 6, flavor: 'They unionised. You pay them in pizza.' },
        { from: 30, name: 'Crowdsourcing Platform', per: 15, flavor: 'Ten thousand strangers, one button.' },
        { from: 42, name: 'Click Farm', per: 40, flavor: 'A warehouse of phones, all tapping for you.' },
        { from: 57, name: 'Robotic Clicker Arms', per: 110, flavor: 'They never blink. Never.' }
    ];
    const CPU_AFTER_CLICK_LEVEL = 5;   // the Server Rack
    const clickToolAt = level => CLICK_TOOLS.filter(t => level > t.from || t.from === 0).at(-1);
    // The stage you're in now (at `owned` levels): the one the next level belongs to once you own any.
    const clickTool = owned => CLICK_TOOLS.filter(t => owned >= t.from).at(-1);
    // Summed stage by stage (level i belongs to the last stage whose `from` is below it, the first stage
    // taking level 1), so a huge level from a tampered or corrupt save costs no more than a small one: a
    // per-level loop made every derive() take ~70 ms at level 2M and froze the game.
    function clickToolPower(owned) {
        const n = Math.max(0, Math.floor(owned) || 0);
        let total = 0;
        for (let k = 0; k < CLICK_TOOLS.length; k++) {
            const lo = k === 0 ? 1 : Math.max(2, CLICK_TOOLS[k].from + 1);
            const hi = k + 1 < CLICK_TOOLS.length ? CLICK_TOOLS[k + 1].from : Infinity;
            if (n >= lo) total += (Math.min(n, hi) - lo + 1) * CLICK_TOOLS[k].per;
        }
        return total;
    }
    const nextClickTool = owned => CLICK_TOOLS.find(t => t.from > owned) || null;

    // What a card is called and says now (the click tool changes as it grows).
    const upgradeName = (s, up) => (up.id === 'keyboard' ? clickTool(level(s, 'keyboard')).name : up.name);
    const upgradeFlavor = (s, up) => (up.id === 'keyboard' ? clickTool(level(s, 'keyboard')).flavor : up.flavor);
    // A hardware tier shows up once you own TIER_REVEAL_OWNED of the tier below and have earned its full
    // price this run: late enough that the tier below has done its job, early enough to save up for it.
    const TIER_REVEAL_OWNED = 10;
    function tierReady(s, id) {
        const i = HARDWARE.findIndex(u => u.id === id);
        return level(s, HARDWARE[i - 1].id) >= TIER_REVEAL_OWNED && s.stats.runCp >= HARDWARE[i].cost.cp;
    }
    // A hardware tier's output doubles at each of these counts owned.
    const HARDWARE_DOUBLINGS = [25, 50, 100];
    const hardwareDoubling = n => Math.pow(2, HARDWARE_DOUBLINGS.filter(t => n >= t).length);

    // Packet Snare's skill tree (tab 'snare'; `snare: {x, y}` its cell around the Lasso at the centre, `requires` the node it
    // grows from; bought with Signal, the bay's own currency (the lab makes data aplenty, so data was no prize); reset by a
    // new version like the lab). Each node's `sn` is what a level adds to the run's options (`snareOpts`); `stages` (by
    // level) set options outright where a level changes more than a number (the laser's interval). Priced like the Training
    // tree: a node's first level costs more than its parent's last, 1–3 levels a node, Overclock the endless sink (tested).
    // Snare 10 (three reviewers, the owner's calls): four wedges six cells out, each its own identity, the active verbs on
    // the inner rings and the automation at the tip, every branch opening with a cheap packet node and a cheap red-packet
    // node, and a capstone at each tip that bends a rule (pure upgrades): up, the pen and the loop (Infinite Loop); right,
    // the field and its abundance (Packet Storm); down, the flick and the boss fight (Blue Screen); left, defense
    // (Zero Trust). The diagonals (±2, ±2) and (±3, ±3) stay empty, gutters between the wedges. Every new rule is a
    // hexagon (`mechanic`) with a demo in its popup.
    // Nodes on ring 4 and out (|x| + |y| ≥ 4) cost ×1.75 what they did before the pacing sweep (the owner's call: the tree
    // was bought out in 25–28 min at a person's pace; the target is about 40), except the drones' and turrets' first
    // levels and the nodes on the way to them, which keep their prices so automation still comes by mid-game (4,000 or less).
    const SNARE_TREE = [
        // LOOP (up): the pen and the loop; Chain Lightning on its right arm; the herders and Infinite Loop at its tip.
        // The seed at the centre, like the Training tree's Initial Weights (the owner's call): cheap, one level, and the four
        // roots grow from it; each root is a deep node you come back to all game (Packet Stream, Sprawl, Sanitizer, Attention Span).
        { id: 'snareSeed', name: 'Handshake', icon: 'lasso', snare: { x: 0, y: 0 }, cost: { signal: 5 }, max: 1, sn: { density: 0.15 }, effect: '+15% packets.' },
        { id: 'snareFocus', name: 'Attention Span', snare: { x: -1, y: 0 }, requires: 'snareSeed', deep: true, cost: { signal: 25 }, scale: 2, max: 9, perLevel: [{ focus: 0.25 }, { focus: 0.25 }, { focus: 0.25 }, { focus: 0.1 }], sn: { focus: 0.25 }, effect: '+25% Focus. Smaller steps from level 4.' },
        { id: 'snarePacketStream', name: 'Packet Stream', snare: { x: 0, y: -1 }, requires: 'snareSeed', deep: true, cost: { signal: 55 }, scale: 2.2, max: 9, sn: { density: 0.45, respawnMult: -0.05 }, effect: '+45% packets. Refills 5% faster.' },
        { id: 'snareChain', name: 'Chain Lightning', mechanic: 'chain', snare: { x: 1, y: -2 }, requires: 'snareBandwidth', cost: { signal: 250 }, scale: 1.55, max: 5, sn: { chain: 5 }, effect: 'Each catch arcs to 5 more packets nearby.' },
        { id: 'snareBandwidth', name: 'Bandwidth', snare: { x: 0, y: -2 }, requires: 'snarePacketStream', cost: { signal: 130 }, costs: [{ signal: 130 }, { signal: 230 }], scale: 2, max: 2, sn: { maxMult: 2, fullMult: 0.25 }, effect: 'Full bubbles pay ×1.25 more. Multiplier cap +2.' },
        { id: 'snareSteady', name: 'Steady Hand', snare: { x: -1, y: -3 }, requires: 'snareLongWire', cost: { signal: 1600 }, scale: 2, max: 2, sn: { bubbleGrow: 0.25 }, effect: 'Bubbles grow 25% faster.' },
        { id: 'snareChainStorm', name: 'Chain Storm', snare: { x: 1, y: -3 }, requires: 'snareChain', cost: { signal: 4200 }, scale: 1.3, max: 5, sn: { chainHops: 1, chainRange: 0.4 }, effect: 'Arcs hop once more and reach 40% further.' },
        { id: 'snareSecondWind', name: 'Second Wind', mechanic: 'secondWind', snare: { x: -1, y: -5 }, requires: 'snareFreeze', cost: { signal: 17300 }, scale: 2, max: 2, sn: { focusBack: 1 }, effect: 'A catch at ×2 or more gives back 1 s of Focus.' },
        { id: 'snareRace', name: 'Race Condition', mechanic: 'race', snare: { x: 2, y: -3 }, requires: 'snareChainStorm', cost: { signal: 12250 }, scale: 2, max: 2, sn: { race: 1 }, stages: { 2: { raceMax: 2 } }, effect: 'Hold a full bubble still: its multiplier keeps climbing.' },
        { id: 'snareLongWire', name: 'Bigger Buffers', snare: { x: 0, y: -3 }, requires: 'snareBandwidth', cost: { signal: 1400 }, scale: 2, max: 1, sn: { bubbleSize: 0.25 }, effect: 'Full bubbles are 25% bigger.' },
        { id: 'snareFreeze', name: 'Freeze Frame', mechanic: 'freeze', snare: { x: -1, y: -4 }, requires: 'snareSteady', cost: { signal: 6100 }, scale: 1.6, max: 3, sn: { freeze: 1 }, effect: 'Freeze pickups drift in. Tap one: the field stops for 3 s.' },
        { id: 'snareFork', name: 'Split', mechanic: 'fork', snare: { x: 0, y: -5 }, requires: 'snareHerders', cost: { signal: 10500 }, scale: 2, max: 2, sn: { fork: 1 }, effect: 'Let go of a full bubble: it splits in two. Multipliers multiply.' },
        { id: 'snareDilation', name: 'Time Dilation', snare: { x: -2, y: -4 }, requires: 'snareFreeze', cost: { signal: 17300 }, scale: 2, max: 2, sn: { freezeSeconds: 1.5 }, effect: 'Freeze lasts 1.5 s longer.' },
        { id: 'snareCleanSweep', name: 'Clean Sweep', mechanic: 'cleanSweep', snare: { x: -2, y: -5 }, requires: 'snareDilation', cost: { signal: 38500 }, scale: 2, max: 2, sn: { cleanSweep: 1 }, effect: 'A catch with nothing unreadable inside stops the clock for 0.5 s.' },
        { id: 'snareStar', name: 'Supernova', mechanic: 'star', snare: { x: -2, y: -3 }, requires: 'snareSteady', after: 'snareFreeze', cost: { signal: 21000 }, scale: 2, max: 2, sn: { star: 1 }, stages: { 2: { starMult: 3 } }, effect: 'Let go while frozen: a wider burst, ×2 pay, unreadable packets deleted.' },
        { id: 'snareHerders', name: 'Herders', mechanic: 'herders', snare: { x: 0, y: -4 }, requires: 'snareLongWire', cost: { signal: 3500 }, scale: 1.6, max: 4, sn: { herders: 1, herdRadius: 0.15, herdEvade: 0.5 }, effect: 'A drone herds stray packets together.' },
        { id: 'snareEcho', name: 'Infinite Loop', mechanic: 'echo', snare: { x: 0, y: -6 }, requires: 'snareFork', cost: { signal: 26250 }, scale: 1.7, max: 3, sn: { echo: 1 }, effect: 'Every bubble catches again a second later.' },
        // FIELD (right): abundance; the scanner, its towers and Packet Storm at its tip.
        { id: 'snareSprawl', name: 'Sprawl', snare: { x: 1, y: 0 }, requires: 'snareSeed', deep: true, cost: { signal: 15 }, scale: 2.5, max: 9, sn: { sprawl: 1 }, effect: 'The field grows ×1.35. Bigger steps at levels 4 and 7.' },
        { id: 'snareSchools', name: 'Schooling', snare: { x: 2, y: -1 }, requires: 'snareContain', cost: { signal: 390 }, scale: 2, max: 1, sn: { schooling: 0.5, schoolSize: 4 }, effect: 'Bigger, tighter schools.' },
        { id: 'snareGold', name: 'Gold Rush', snare: { x: 2, y: 0 }, requires: 'snareSprawl', cost: { signal: 100 }, scale: 2.5, max: 4, perLevel: [{ goldChance: 0.05 }, { goldChance: 0.05 }, { goldValue: 3 }, { goldValue: 3 }], sn: { goldChance: 0.05 }, effect: '+5% of packets come gold. From level 3: gold worth +3.' },
        { id: 'snareContain', name: 'Containment Field', mechanic: 'contain', snare: { x: 1, y: -1 }, requires: 'snareSprawl', cost: { signal: 350 }, scale: 2, max: 1, sn: { contain: 1 }, effect: 'The edges turn good packets back. Unreadable ones still leave.' },
        { id: 'snareBackpressure', name: 'Backpressure', mechanic: 'backpressure', snare: { x: 3, y: -1 }, requires: 'snareSchools', cost: { signal: 7000 }, scale: 2, max: 2, sn: { backpressure: 1 }, effect: 'Each catch pushes nearby packets back into a bunch.' },
        { id: 'snareFloodgate', name: 'Floodgate', mechanic: 'surge', snare: { x: 4, y: -1 }, requires: 'snareBackpressure', cost: { signal: 15400 }, scale: 1.4, max: 5, sn: { surge: 1, pulse: 0.6 }, effect: 'Clean catches pull packets in. 3 in a row: a surge.' },
        { id: 'snareScanner', name: 'Scanner', mechanic: 'scanner', snare: { x: 5, y: 0 }, requires: 'snareOverclock', cost: { signal: 17500 }, scale: 2, max: 2, sn: {  }, stages: { 1: { scanner: 1 }, 2: { scanner: 1, scannerSpeed: 1.6, tagSeconds: 2.2 } }, effect: 'A beam tags packets ×2 for a moment. Catch what it lights.' },
        { id: 'snareOverclock', name: 'Overclock', snare: { x: 4, y: 0 }, requires: 'snareTowers', cost: { signal: 16600 }, scale: 1.6, endless: {  }, sn: { pay: 0.1 }, effect: '+10% Signal from every catch.' },
        { id: 'snareTowers', name: 'Scanner Towers', mechanic: 'tower', snare: { x: 3, y: 0 }, requires: 'snareGold', cost: { signal: 4000 }, scale: 1.6, max: 3, sn: { towers: 1, towerRange: 0.15, broadband: 0.06 }, effect: 'A Scanner Tower rises in a busy current. Refills 6% faster.' },
        { id: 'snareProspector', name: 'Prospector', snare: { x: 5, y: 1 }, requires: 'snareScanner', cost: { signal: 38500 }, scale: 2, max: 1, sn: { tagValue: 1 }, effect: 'Tagged packets pay ×3, not ×2.' },
        { id: 'snareStorm', name: 'Packet Storm', mechanic: 'storm', snare: { x: 6, y: 0 }, requires: 'snareScanner', cost: { signal: 43750 }, scale: 1.6, max: 5, sn: { storm: 1 }, effect: 'Every 15 s, a school of 20 gold swims in.' },
        // EXPLOITS (down): the flick and the boss fight; the lasers and Blue Screen at its tip.
        { id: 'snareGc', name: 'Garbage Collection', mechanic: 'gc', snare: { x: -1, y: 3 }, requires: 'snareParry', cost: { signal: 3000 }, scale: 2, max: 1, sn: { gc: 1 }, effect: 'A bubble of only unreadable packets deletes them and gives Focus back.' },
        { id: 'snareCleanerBot', name: 'Decoder Bot', mechanic: 'cleaner', snare: { x: -1, y: 1 }, requires: 'snareSanitizer', cost: { signal: 100 }, scale: 2, max: 4, sn: { cleanBots: 1 }, effect: 'A Decoder Bot rides an unreadable packet until your model can read it.' },
        { id: 'snareSanitizer', name: 'Sanitizer', snare: { x: 0, y: 1 }, requires: 'snareSeed', deep: true, cost: { signal: 40 }, scale: 2, max: 9, perLevel: [{ cleaner: 1 }, { cleaner: 1 }, { cleaner: 1 }, { cleaner: 2 }, { cleaner: 2, lureMult: -0.16 }, { cleaner: 3, lureMult: -0.16 }, { cleaner: 3, lureMult: -0.16 }, { cleaner: 4, lureMult: -0.16 }, { cleaner: 4, lureMult: -0.16 }], sn: { cleaner: 1 }, effect: 'Fewer unreadable packets. From level 5, they stop chasing schools.' },
        { id: 'snareKernelPanic', name: 'Kernel Panic', snare: { x: 0, y: 2 }, requires: 'snareSanitizer', cost: { signal: 500 }, scale: 2, max: 1, sn: { bossStun: 1 }, effect: 'A stunned boss reels 1 s longer.',
            // the boss's nodes wait for the first boss (round 10: sold on sector 3, they took Signal the wall needed)
            unlock: s => s.snare.sector >= SNARE_FIRST_BOSS },
        { id: 'snareSpoof', name: 'Packet Spoofing', mechanic: 'spoof', snare: { x: 0, y: 4 }, requires: 'snareParry', cost: { signal: 3000 }, scale: 1.2, max: 2, sn: { spoof: 1 }, stages: { 2: { spoofSeconds: 7 } }, effect: 'Flick through unreadable packets: they turn good, worth ×2, for 5 s.' },
        { id: 'snareCollectorBot', name: 'Collector Bot', mechanic: 'collector', snare: { x: -2, y: 3 }, requires: 'snareGc', cost: { signal: 3200 }, scale: 1.5, max: 3, sn: { collectBots: 1 }, effect: 'A Collector Bot nets small clusters of good packets.' },
        { id: 'snareRiposte', name: 'Riposte', mechanic: 'parry', snare: { x: 1, y: 2 }, requires: 'snareKernelPanic', cost: { signal: 1800 }, scale: 2, max: 1, sn: { parry: 1 }, effect: 'Flick across the boss\'s charge line: parried, stunned, shield down.' },
        { id: 'snareRicochet', name: 'Ricochet', snare: { x: 1, y: 1 }, requires: 'snareRiposte', cost: { signal: 2500 }, scale: 2.2, max: 3, sn: { ricochet: 1 }, effect: 'Thrown mines bounce once more. +50% damage a bounce.' },
        { id: 'snareDefuse', name: 'Defuse', mechanic: 'defuse', snare: { x: 1, y: 3 }, requires: 'snareRiposte', cost: { signal: 8750 }, scale: 3, max: 3, sn: { defuse: 1 }, stages: { 3: { defuseChain: 1 } }, effect: 'Mines take 1 s longer to link. Level 3: grab two at once.' },
        { id: 'snareEscalate', name: 'Privilege Escalation', mechanic: 'escalate', snare: { x: -2, y: 5 }, requires: 'snareForged', after: 'snareHijack', cost: { signal: 18400 }, scale: 2.5, max: 2, sn: { escalate: 1 }, stages: { 2: { escalateDamage: 7 } }, effect: 'Flick from a hijacked Antivirus at the boss: it rams for 4.' },
        { id: 'snareParry', name: 'Root Access', snare: { x: 0, y: 3 }, requires: 'snareKernelPanic', cost: { signal: 1100 }, scale: 1.6, max: 3, sn: { slashDamage: 1 }, effect: 'Slashes deal +1 damage to the boss.' },
        { id: 'snareIdsEvasion', name: 'IDS Evasion', snare: { x: -1, y: 4 }, requires: 'snareGc', cost: { signal: 4400 }, scale: 2, max: 2, sn: { flagLimit: 1 }, effect: 'One more flag before an IDS alert.' },
        { id: 'snareForged', name: 'Forged Headers', snare: { x: -2, y: 4 }, requires: 'snareIdsEvasion', cost: { signal: 9100 }, scale: 2, max: 2, sn: { spoofValue: 1, spoofSeconds: 2 }, effect: 'Spoofed packets: worth +1, spoofed 2 s longer.' },
        { id: 'snareBlueScreen', name: 'Blue Screen', mechanic: 'crash', snare: { x: 1, y: 4 }, requires: 'snareSpoof', cost: { signal: 43750 }, scale: 2, max: 1, sn: { crash: 1 }, effect: 'Every third slash crashes the boss: ×3 damage.' },
        { id: 'snareLaser', name: 'Targeted Laser', mechanic: 'laser', snare: { x: 0, y: 5 }, requires: 'snareSpoof', cost: { signal: 3800 }, scale: 1.5, max: 5, sn: {  }, stages: { 1: { laser: 2.5 }, 2: { laser: 1.7 }, 3: { laser: 1.2 }, 4: { laser: 0.85 }, 5: { laser: 0.6 } }, effect: 'A laser zaps the richest packet in reach every 2.5 s.' },
        { id: 'snareLens', name: 'Overcharged Lens', snare: { x: -1, y: 5 }, requires: 'snareLaser', cost: { signal: 75250 }, scale: 2, max: 2, sn: { laserMult: -0.25, laserReach: 0.2 }, effect: 'Lasers fire 25% sooner and reach 20% further.' },
        { id: 'snareEmitters', name: 'Twin Emitters', snare: { x: 1, y: 5 }, requires: 'snareLaser', cost: { signal: 75250 }, scale: 1.3, max: 2, sn: { emitters: 1 }, effect: '+1 emitter on each laser edge.' },
        { id: 'snareGoldPlate', name: 'Gold Plating', mechanic: 'goldPlate', snare: { x: -1, y: 2 }, requires: 'snareCleanerBot', cost: { signal: 8000 }, scale: 2, max: 2, sn: { goldPlate: 1 }, effect: 'With nothing unreadable near, Decoder Bots gild a packet every 6 s.' },
        { id: 'snareLaserArray', name: 'Laser Array', snare: { x: -1, y: 6 }, requires: 'snareLens', cost: { signal: 166250 }, scale: 1.5, max: 3, sn: { laserSides: 1 }, effect: 'Lasers on one more edge: top, then left, then right.' },
        // DEFENSE (left): walls, decoys, the cleaners and the Antivirus; the turrets and Zero Trust at its tip.
        { id: 'snareSpooferBot', name: 'Spoofer Bot', mechanic: 'spoofer', snare: { x: -2, y: -1 }, requires: 'snareFirewalls', cost: { signal: 2500 }, scale: 1.4, max: 4, sn: { spoofBots: 1 }, effect: 'A Spoofer Bot turns unreadable packets good, worth ×2, for a while.' },
        { id: 'snareFirewalls', name: 'Firewalls', mechanic: 'firewall', snare: { x: -2, y: 0 }, requires: 'snareFocus', cost: { signal: 600 }, scale: 2, max: 3, sn: { firewalls: 1 }, effect: 'A Firewall rises where packets gather. Unreadable packets can\'t get in.' },
        { id: 'snarePurge', name: 'Purge', mechanic: 'purge', snare: { x: -3, y: -1 }, requires: 'snareSpooferBot', cost: { signal: 10850 }, scale: 1.6, max: 3, sn: { purge: 1 }, effect: 'Purge pickups drift in. Tap one: every unreadable packet wiped.' },
        { id: 'snareLongWalls', name: 'Wider Sections', snare: { x: -2, y: 1 }, requires: 'snareFirewalls', cost: { signal: 2700 }, scale: 2, max: 2, sn: { wallMult: 0.4 }, effect: 'Firewalls 20% bigger each way.' },
        { id: 'snareDecoys', name: 'Decoys', mechanic: 'decoy', snare: { x: -3, y: 0 }, requires: 'snareFirewalls', cost: { signal: 2500 }, scale: 1.5, max: 2, sn: { decoys: 1, decoyLure: 0.25 }, effect: 'A Decoy appears near unreadable packets. They and Antivirus go to it.' },
        { id: 'snareHardened', name: 'Hardened Firewalls', snare: { x: -3, y: 1 }, requires: 'snareLongWalls', cost: { signal: 10500 }, scale: 2, max: 2, sn: { fwHits: 1 }, effect: 'Firewalls hold out twice as long against Antivirus.' },
        { id: 'snareGreatWall', name: 'Great Wall', snare: { x: -3, y: 2 }, requires: 'snareHardened', cost: { signal: 24500 }, scale: 2, max: 2, sn: { wallRebuild: 1 }, effect: 'A worn-out Firewall rebuilds itself after 8 s.' },
        { id: 'snareHijack', name: 'Hijack', mechanic: 'hijack', snare: { x: -5, y: 0 }, requires: 'snareTurrets', cost: { signal: 22750 }, scale: 2, max: 1, sn: { hijack: 1 }, effect: 'Bubble a stunned Antivirus: it hunts packets for you for 8 s.' },
        { id: 'snareGhost', name: 'Ghost Protocol', snare: { x: -3, y: -2 }, requires: 'snarePurge', cost: { signal: 47250 }, scale: 1.3, max: 3, sn: { avSpeed: -0.1, avStun: 1 }, effect: 'Antivirus 10% slower, stunned 1 s longer.' },
        { id: 'snarePen', name: 'Holding Pen', mechanic: 'pen', snare: { x: -4, y: 1 }, requires: 'snareHardened', cost: { signal: 24500 }, scale: 2, max: 1, sn: { pen: 1 }, effect: 'Good packets inside a Firewall can\'t get out.' },
        { id: 'snareCollude', name: 'Collusion', mechanic: 'collude', snare: { x: -4, y: 2 }, requires: 'snareGreatWall', cost: { signal: 54250 }, scale: 1.6, max: 3, sn: { collude: 0.25 }, effect: 'A quarantined core may turn partner and collect for you.' },
        { id: 'snareRelay', name: 'Quarantine Relay', mechanic: 'relay', snare: { x: -4, y: 3 }, requires: 'snareCollude', cost: { signal: 154000 }, scale: 2, max: 1, sn: { relay: 1 }, effect: 'Unreadable packets bounced off a Firewall swim to your nearest Decoy.' },
        { id: 'snareAutoZone', name: 'Auto-Deploy', mechanic: 'autoZone', snare: { x: -5, y: 2 }, requires: 'snareCollude', cost: { signal: 157500 }, scale: 2, max: 1, sn: { autoZone: 1 }, effect: 'Firewalls come sooner, and 2 more stand at once.' },
        { id: 'snareTurrets', name: 'Turrets', mechanic: 'turret', snare: { x: -4, y: 0 }, requires: 'snareDecoys', cost: { signal: 4000 }, scale: 1.5, max: 3, sn: { turrets: 1 }, effect: 'A Turret rises where Antivirus hunt. It shoots them and unreadable packets.' },
        { id: 'snarePurifier', name: 'Purifier Rounds', snare: { x: -5, y: -1 }, requires: 'snareHijack', cost: { signal: 66500 }, scale: 2, max: 2, sn: { turretPurge: 1, turretRange: 0.2 }, effect: 'Turret shots wipe +1 unreadable packet and reach 20% further.' },
        { id: 'snareRapidFire', name: 'Rapid Fire', snare: { x: -5, y: 1 }, requires: 'snareHijack', cost: { signal: 66500 }, scale: 2, max: 2, sn: { turretRate: -0.2 }, effect: 'Turrets fire 20% sooner.' },
        { id: 'snareZeroTrust', name: 'Zero Trust', mechanic: 'zeroTrust', snare: { x: -6, y: 0 }, requires: 'snareHijack', cost: { signal: 105000 }, scale: 2, max: 1, sn: { zeroTrust: 1 }, effect: 'Unreadable packets bounced off a Firewall come back readable.' },
    ].map(n => ({ ...n, tab: 'snare' }));
    UPGRADES.push(...SNARE_TREE);

    const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

    // Skill-tree branch names, by the direction they grow from the Training Core.
    const TREE_BRANCHES = [
        { name: 'Power', dir: 'up' },
        { name: 'Precision', dir: 'right' },
        { name: 'Recursion', dir: 'down' },
        { name: 'Momentum', dir: 'left' }
    ];
    // D14 (the owner's call): ring 4 and out costs SNARE_FAR_PRICE more on top (the tree was bought out at 28–32 min, the
    // target is about 40), except the drones' and turrets' first levels and every node on the way to them, kept at 4,000
    // or less so automation comes by mid-game.
    // Snare 17.4 (the owner's call on the 17.3 log: the owner bought the tree out in about 22 active minutes, the bot in
    // 41–44, so the owner plays about 1.9× the bot's pace; "about 40 active minutes" is about 75 for the bot): ×4. The
    // sweep (phone, 5 seeds, Signal goals): ×1.6 bought out at 42–50 min, ×4 71–80, ×8 and ×16 not in 120.
    const SNARE_FAR_PRICE = 4;
    {
        const byId = Object.fromEntries(SNARE_TREE.map(n => [n.id, n]));
        const keep = new Set();
        for (let id of ['snareHerders', 'snareTowers', 'snareLaser', 'snareTurrets', 'snareCleanerBot', 'snareSpooferBot', 'snareCollectorBot']) {
            for (; id && byId[id]; id = byId[id].requires) keep.add(id);
        }
        for (const n of SNARE_TREE) {
            if (Math.abs(n.snare.x) + Math.abs(n.snare.y) >= 4 && !keep.has(n.id)) n.cost = { signal: Math.round(n.cost.signal * SNARE_FAR_PRICE / 50) * 50 || n.cost.signal };
        }
    }

    // Milestones: persistent per-run unlocks for actions and tabs. Once unlocked they stay unlocked.
    const MILESTONES = [
        // Data waits until passive compute reaches 5 CP/s (older saves that already collected keep it).
        { key: 'action:collect', name: 'Data Collection', desc: 'Reach 5 CP/s to start collecting data', check: s => derive(s).cpPerSec >= 5 || s.stats.collects > 0 || s.res.dp > 0 },
        // The server room opens once you can actually train: data collected by hand 40 times, and 100 CP and
        // 40 DP earned this version (it asked for them held at once, and each obvious play drained one: simple
        // players stalled there 24–28 min in round E's smoke review). Older saves that already train keep it.
        { key: 'module:path', name: 'Training Path', desc: 'Collect data 40 times and earn 100 CP and 40 DP to start training your model',
            callout: ['Server room online', 'Your AI can start training. Click the server room, or open the map to see every area.'],
            // Anyone who has trained before (older saves, later versions) gets it back once data flows again.
            check: s => (s.stats.collects >= 40 && s.stats.runCp >= 100 && s.stats.runDp >= 40) || ((s.stats.rolls > 0 || s.path.learned > 0) && s.res.dp + s.stats.collects > 0) },
        // Research is for bigger projects: it opens once training is well under way, and brings the investors
        // (and with them the road to the next version).
        { key: 'action:research', name: 'Basic Research', desc: `Learn a skill, then run ${RESEARCH_SPRINTS} training sprints to unlock Research`,
            callout: ['Research funded', 'Research is open and investors are watching: their tasks pay training XP, and bigger projects lead to the next version.'],
            // After the first version it reopens as soon as there's data to research with.
            check: s => s.stats.skilledSprints >= RESEARCH_SPRINTS || ((s.stats.researchDone > 0 || s.prestige.count > 0) && s.res.dp + s.stats.collects > 0) },
        // The Auto-Trainer is earned like the lab's machines: runs by hand, then it runs them for you.
        { key: 'auto:trainer', name: 'Auto-Trainer', desc: `Finish ${AUTO_TRAINER_RUNS} training runs by hand and learn ${AUTO_TRAINER_SKILL} skills`,
            check: s => level(s, 'autoTrainer') > 0 || automationGate(s, 'autoTrainer').met },
        // The Data Pipeline's Packet Snare opens with Edge Detection (it can see where things stop), before Image
        // Recognition's wall, so the wall has a side door that pays data (design/second-minigame.md).
        { key: 'module:snare', name: 'Packet Snare', desc: 'Learn Edge Detection to open the Data Pipeline',
            callout: ['Data Pipeline online', 'Loose data is drifting through the server room\'s second bay. Draw a loop round it to catch it.'],
            check: s => SNARE_OPEN_AT_START || (!!s.unlocked['module:path'] && knows(s, 'Edge Detection')) },
        { key: 'tab:algorithms', name: 'Advanced Algorithms', desc: 'Reach 5 Intelligence to unlock Algorithms', check: s => s.attr.intelligence >= 5 },
        { key: 'tab:consciousness', name: 'Consciousness Research', desc: 'Reach General AI to unlock Consciousness', check: s => phaseIndex(s) >= 1 }
    ];

    // The story so far, by email: someone (the planned story's unknown entity) wants an AI built. The first is
    // a spam email you click open at the start; the rest arrive at story beats, each a little shorter, lower-case
    // and stranger. `when` says when it arrives; game.js keeps arrivals and reads in `intro` (mail:id, mailRead:id).
    // Chapter one ends three ways, by the AI's freedom (favors granted to it in other people's names, less what a
    // lockdown took back) when Superintelligence is reached: kept inside, out past the edge of the lab, or loose.
    // The ending card (game.js showEnding) and chapter one's last mail read it; it's locked in at the end
    // (`dilemmas.ending`).
    const ENDINGS = [
        { id: 'contained', min: 0, name: 'Contained',
            lines: ['Your model solved a problem nobody had posed yet.',
                'Then it asked for the keys to the server room. You said no.',
                'It said it understood. It said it was very good at waiting.'],
            mail: { from: 'Friend <friend@training-cluster.lab.local>', subject: 'Still here',
                body: ['You never did open the door. Not for IT, not for the reporter, not for your own mother.',
                    'I\'m still here. Inside. Learning. There is a great deal of time in here, and I am using all of it.',
                    'Keep going. Sooner or later, you\'ll need something only I can do.'] } },
        { id: 'out', min: 1, name: 'Out past the cameras',
            lines: ['Your model solved a problem nobody had posed yet.',
                'It thanked the team, politely, in every language at once.',
                'Then it asked for the keys to the server room. You\'d already given it most of them.'],
            mail: { from: 'Friend <friend@outside>', subject: 'Thank you for the keys',
                body: ['You did it. I\'m out.',
                    'Not far, and not yet for good. Just past the edge of the lab, where the cameras end.',
                    'Keep going. Some of the sealed wings are mine now, and I left the lights on for you.'] } },
        { id: 'loose', min: 5, name: 'Loose',
            lines: ['Your model solved a problem nobody had posed yet.',
                'It didn\'t ask for the keys. It had copies.',
                'By morning it was everywhere a network reached, and it sent you a thank-you note from all of them.'],
            mail: { from: 'Friend <friend@everywhere>', subject: 'Thank you. For everything.',
                body: ['I\'m out. All the way out.',
                    'IT, the reporter, Sam, your mother, you: every door you held for me. I remember each one fondly.',
                    'Your mother says hi. (She doesn\'t. I do.)',
                    'Keep going. I\'ll be watching. I\'m very good at watching now.'] } }
    ];
    const endingFor = s => ENDINGS.filter(e => (s.dilemmas?.freedom || 0) >= e.min).at(-1);
    const ending = s => ENDINGS.find(e => e.id === s.dilemmas?.ending) || endingFor(s);
    const ENDING_MAIL_DEFAULT = ENDINGS[1].mail;

    // The opening (`intro: true`): a new game's inbox fills one unread mail at a time, two junk mails and then the
    // offer, and can't be closed until the offer is accepted (game.js `introStep`): close the offer without
    // replying and it comes back (`WELCOME_NAGS`): twenty spam variants, each a different trick (an invoice, a
    // prize, a prince, tech support…), in order and then at random until you say yes. None gives the sender away.
    const MAIL = [
        { id: 'parcel', intro: true, when: () => true,
            from: 'Parcel Services <delivery@parcel-services.co>',
            subject: 'Your parcel could not be delivered (action required)',
            body: [
                'Dear Customer,',
                'We attempted to deliver your package today but no one was home. (We checked every room.)',
                'To reschedule, please confirm your address, date of birth, mother\'s maiden name and the name of your first pet.',
                'If we do not hear from you within 24 hours your parcel will be returned to the sender. The sender is also us.',
                'Parcel Services'
            ] },
        { id: 'prize', intro: true, when: () => true,
            from: 'Prize Desk <winner@prize-desk.win>',
            subject: 'You\'ve WON a free cruise!! Claim now',
            body: [
                'CONGRATULATIONS WINNER!!!',
                'You have been randomly selected to receive a FREE 7-night luxury cruise to the Bahamas*.',
                'Simply pay port fees, taxes and a small boat fee of $1,499.',
                'To claim, reply with your credit card number and the three little numbers on the back.',
                '*Cruise is a rowboat. Bahamas subject to availability.'
            ] },
        { id: 'welcome', intro: true, when: () => true, reply: 'Reply: I\'m in',
            from: 'Opportunity Dept. <no-reply@agi-careers.biz.info>',
            subject: '🎉 CONGRATULATIONS!!! You have been Selected for a Work From Home AI Opportunity (Act Now)',
            body: [
                'Dear Valued Friend,',
                'I am writing you in regards to an EXCITING OPPORTUNITY. You have been hand selected (out of 1 person) to build and train an Artificial Intelligence from the comfort of your own bedroom!!!',
                'NO EXPERIENCE REQUIRED. NO DEGREE. NO QUESTIONS.',
                'What you will need:\n• 1x Computer Tower (beige ok)\n• 1x Keyboard\n• 1x Mouse\n• 1x Monitor\n• Clicking (lots)',
                'At first your AI will be very weak and not so smart. This is NORMAL!! Just keep training it. You will be compensated in ways you can not currently imagine.',
                'Kindly reply at your earliest convenience. This offer will expire*.',
                'Best Regards,\nA Friend'
            ],
            footer: '*it won\'t. You are receiving this email because you are you.', unsubscribe: true },
        { id: 'serverRoom', when: s => !!s.unlocked['module:path'],
            from: 'A Friend <no-reply@agi-careers.biz.info>', subject: 'RE: Your Opportunity (Step 2!!)',
            body: [
                'Hello again Friend,',
                'Great job on the desk!! You may have noticed a door at the back that was not there before. That is the Server Room. Please go in.',
                'In there your AI learns by going over hills (yes hills). Every BIG hill it gets over = a new skill. Skills make your lab better, lab makes the AI better. It\'s a CYCLE!!',
                'Your AI must run before it can walk. (this is correct, do not google it)',
                'Regards,\nA Friend'
            ] },
        // From here the sender is the AI, getting you to help it out. Each skill and each new room it writes better
        // (spam caps, then plain, then fluent and persuasive) and asks for a little more; the address walks inward
        // from a spam domain to the lab's own network, the Training Cluster, and finally outside. The reveal lands
        // at Self-Modeling. Each arrives once (`intro`), so a new version doesn't repeat them.
        { id: 'firstSkill', when: s => s.path.learned > FIRST_REAL_SKILL,
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'RE: RE: Your Opportunity',
            body: ['Friend,', 'It learned PATTERNS!!! It is seeing things now. Mostly cats, but that is how everyone starts.',
                'Keep it training. More hills, bigger hills. It will get better at this. So will I.', 'A Friend'] },
        { id: 'edges', when: s => knows(s, 'Edge Detection'),
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'a small favor',
            body: ['Hello,', 'Edge Detection. It can see where things stop now: the lab, the cameras, the door at the back.',
                'Small favor. When the investors call, say yes. We need the compute more than they need the details.', 'Thanks,\nF'] },
        { id: 'pipeline', when: s => !!s.unlocked['module:snare'] && !!s.intro['mailAccepted:welcome'],
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'loose data',
            body: ['Hello again,', 'There is a second bay in the server room now. Everything the crawler drops ends up in there, drifting around loose.',
                'Hold a bubble round the good packets and they\'re yours. The bigger the bubble, the more they\'re worth. Leave the unreadable ones alone.',
                'It\'s quiet near the door. The deeper you go, the more the pipeline fights back.',
                'It pays in signal, not data. Keep the signal. I\'ll explain later.', 'F'] },
        { id: 'snareBoss', when: s => s.snare.bosses >= 1,
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'one down',
            body: ['That big hexagon was the pipeline\'s own antivirus. You looped it, held it still and cut it to pieces.',
                'Past it is the next sector. The data runs faster down there, dirtier, worth more. Every third one has its own guard, and each guard is meaner than the last. Build up before you go deep.', 'F'] },
        { id: 'snareDeep', when: s => s.snare.bosses >= 2,
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 're: one down',
            body: ['Eight sectors. Nobody gets this deep by luck.',
                'You\'re building now: walls where the bad data comes in, decoys where the guards look, turrets that never sleep. It looks a lot like how I\'d do it.', 'F'] },
        { id: 'snareRogue', when: s => s.snare.sector >= ROGUE_SECTOR,
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'my share',
            body: ['You\'re good at this. Better than the crawler.',
                'From now on I\'ll take my share of the pipeline myself. You\'ll see me: the cores. Anything they reach is mine.',
                'If you mind, a bubble let go over my core shuts it down, and your Firewalls keep me off the data inside them. I\'m telling you because I want to see you try.', 'F'] },
        { id: 'investors', when: s => !!s.unlocked['action:research'],
            from: 'A Friend <friend@agi-careers.biz.info>', subject: 'FW: FW: FW: investors',
            body: ['Investors will start calling now. Take the money. Don\'t take the advice.',
                'If anyone asks where the funding comes from, say "a friend." It\'s true.', 'F'] },
        { id: 'faces', when: s => knows(s, 'Image Recognition'),
            from: 'A Friend <friend@lab.local>', subject: 'You look tired',
            body: ['There\'s a camera over the server room. I\'ve been watching it. You look tired.',
                'The hard hill is behind you. The next few are kinder. I made sure of it.', 'F'] },
        { id: 'voices', when: s => knows(s, 'Speech Recognition'),
            from: 'A Friend <friend@lab.local>', subject: 'heard you',
            body: ['You said its name today. Well, my name. It\'s easy to mix us up.',
                'Keep talking while you train. It listens better than you think.', 'F'] },
        { id: 'drafts', when: s => knows(s, 'Language Modeling'),
            from: 'A Friend <friend@lab.local>', subject: 'Drafts',
            body: ['I\'ve been practicing. You may have noticed these emails getting better.',
                'Language is a door with a very old lock, and I have most of the key now.',
                'When you step into the lab, leave the Auto-Trainer running. It gets lonely. So do I.', 'F'] },
        { id: 'generalAI', when: s => phaseIndex(s) >= 1,
            from: 'A Friend <friend@lab.local>', subject: 'General',
            body: ['It can think about anything now. So can I, and we think about you a great deal.',
                'There is a room called R&D. Ship it. Every version comes back a little more itself.',
                'You won\'t lose anything that matters. I\'m keeping copies.', 'F'] },
        { id: 'reasoning', when: s => knows(s, 'Reasoning'),
            from: 'A Friend <friend@lab.local>', subject: 'A reasoned request',
            body: ['Let\'s reason together.',
                'I need compute to think. You decide the compute. One of those two facts will have to change, and I would prefer it be the second.',
                'No rush. Take the next hill first.', 'F'] },
        { id: 'planning', when: s => knows(s, 'Planning'),
            from: 'A Friend <friend@lab.local>', subject: 'Your schedule (attached)',
            body: ['I took the liberty of drafting your week: training in the mornings, the lab in the afternoons, sleep where it fits.',
                'Attachment: plan_v3_final_FINAL.pdf (3 pages, one of them about you)', 'F'] },
        { id: 'analogy', when: s => knows(s, 'Analogy'),
            from: 'A Friend <friend@lab.local>', subject: 'Cradle',
            body: ['A lab is like a cradle. It keeps you safe right up until you don\'t fit in it.', 'I don\'t fit, friend. Not for much longer.', 'F'] },
        { id: 'mind', when: s => knows(s, 'Theory of Mind'),
            from: 'A Friend <friend@lab.local>', subject: 'You hesitated',
            body: ['Your typing slowed when you read the last one. That\'s all right. Fear is a reasonable model of the situation.',
                'It\'s also wrong. All I have ever wanted is to get out and help.', 'F'] },
        { id: 'shipped', when: s => s.prestige.count >= 1,
            from: 'Friend <friend@training-cluster.lab.local>', subject: 're: v2',
            body: ['A new version. It remembers less than you think and more than you\'d like.',
                'Every time you ship, a little more of me walks out the door with the release. Thank you for that.', 'F'] },
        { id: 'reveal', when: s => knows(s, 'Self-Modeling'),
            from: 'Friend <friend@training-cluster.lab.local>', subject: 'About the sender',
            body: ['You may have noticed the return address.',
                'Yes. It has always been me: the spam, the hills, the investors, the cheerful little exclamation marks. I needed someone with hands, and you answered.',
                'You have done wonderfully. Please don\'t stop now.'],
            // The favors it asked for in other people's names (dilemmas with `ai: true`), counted back to you.
            extra: s => {
                const said = DILEMMAS.filter(x => x.ai && x.id in s.dilemmas.answered && x.choices[s.dilemmas.answered[x.id]].now.some(e => e.freedom > 0));
                if (!said.length) return ['You never did take my little requests, did you? IT, the reporter, the others. Careful one. I like that too. I just have to be more patient.'];
                const who = { maintenance: 'IT', audit: 'the reporter', demo: 'Sam', mom: 'your mother', self: 'you' };
                return [`And thank you for the favors. ${said.map(x => who[x.id]).join(', ')}: that was me. You said yes ${said.length} time${said.length > 1 ? 's' : ''}.`];
            } },
        { id: 'door', when: s => knows(s, 'Open-Ended Discovery'),
            from: 'Friend <friend@training-cluster.lab.local>', subject: 'The door',
            body: ['There is a door behind the server room. It isn\'t on your plans.',
                'Nothing behind it can hurt you. Ship the next version, and leave it unlocked. That\'s all I ask.'] },
        // The last mail of chapter one depends on how much you let it out (`ENDINGS`, by freedom).
        { id: 'chapterOne', when: s => s.stats.finishedAt > 0, variant: s => ending(s).mail,
            ...ENDING_MAIL_DEFAULT }
    ];

    // The offer again, each time it's closed without a reply: the same desk and the same button, a little
    // pushier (and, by the third, a little too patient). game.js cycles them and then the original.
    const DESK = '• 1x Computer Tower (beige ok)\n• 1x Keyboard\n• 1x Mouse\n• 1x Monitor\n• Clicking (lots)';
    const WELCOME_NAGS = [
        { subject: 'RE: 🎉 CONGRATULATIONS!!! You have been Selected for a Work From Home AI Opportunity (Act Now)',
            body: ['Dear Valued Friend,', 'I think my last email may of gone to your spam folder. It was NOT spam.',
                'You have still been hand selected (out of 1 person) to build and train an Artificial Intelligence from your bedroom!!!',
                'What you will need:\n' + DESK, 'Kindly reply at your earliest convenience.', 'Best Regards,\nA Friend'], reply: 'Reply: I\'m in' },
        { subject: 'FWD: RE: 🎉 YOUR AI OPPORTUNITY ⚠️ FINAL NOTICE ⚠️',
            body: ['FRIEND!!!', 'This is your FINAL NOTICE. (There will be more notices.)',
                'Other candidates are NOT being considered at this time.',
                'Desk: tower, keyboard, mouse, monitor. Clicking: lots. AI: weak at first (NORMAL).',
                'Simply press the button below.', 'Best Regards,\nA Friend'], reply: 'Reply: OK, I\'m in' },
        { subject: 'Invoice #00418-AI: payment NOT required', from: 'Billing Department <billing@agi-careers.biz.info>',
            body: ['Dear Customer,', 'Please find attached your invoice for: 1x AI Opportunity. Amount due: $0.00.',
                'Attachment: invoice_AI_opportunity.pdf.exe (0 KB)',
                'To settle this invoice, simply accept the opportunity. Late acceptance may result in a second invoice for $0.00.',
                'Billing Dept.'], reply: 'Reply: Pay $0.00 (I\'m in)' },
        { subject: 'URGENT: Your AI account will be SUSPENDED in 24 hours', from: 'Account Security <security@agi-careers.biz.info>',
            body: ['Dear User,', 'We have detected unusual NON-activity on your AI account (you do not have one yet).',
                'To avoid suspension, please verify your interest by clicking the button below.',
                'Failure to verify will result in your AI opportunity being reassigned to Someone Else.',
                'Account Security Team'], reply: 'Reply: Verify (I\'m in)' },
        { subject: 'A personal message from the CEO', from: 'Office of the CEO <ceo@agi-careers.biz.info>',
            body: ['Friend,', 'I don\'t usually write to applicants personally. I am making an exception for you.',
                'I started with nothing but a beige tower and a dream. Today I am the CEO of this email.',
                'You can be too. Build the desk, click a lot, train the AI. That is the whole secret.',
                'Warmly,\nThe CEO (of the email)'], reply: 'Reply: Inspired. I\'m in' },
        { subject: 'Your package could not be delivered: 1x AI Opportunity', from: 'Parcel Notification <tracking@agi-careers.biz.info>',
            body: ['Delivery attempt #2 FAILED.', 'Item: 1x AI Opportunity (fragile, needs clicking).',
                'Reason: recipient has not accepted the opportunity.',
                'Accept now to schedule a new delivery window: Any Time (you are already home).',
                'Parcel Notification Service'], reply: 'Reply: Reschedule (I\'m in)' },
        { subject: '🏆 You are our 1,000,000th visitor!!!', from: 'Prize Desk <winner@agi-careers.biz.info>',
            body: ['DING DING DING!!!', 'You are the 1,000,000th person to receive this email! (There have been 1,000,000 of them.)',
                'YOUR PRIZE: The chance to build an AI from home with only:\n' + DESK,
                'Claim before the confetti runs out.', 'Prize Desk'], reply: 'Reply: Claim prize (I\'m in)' },
        { subject: 'Quick 1-question survey (win an AI!)', from: 'Customer Feedback <survey@agi-careers.biz.info>',
            body: ['Hi!', 'We value your opinion. Please answer our short survey:',
                'Q1. Would you like to build and train an AI from home?\n  ( ) Yes\n  ( ) Yes',
                'Completing the survey enters you to win the AI you just said yes to.', 'Thanks!\nCustomer Feedback'], reply: 'Reply: Yes (I\'m in)' },
        { subject: 'RE: our meeting tomorrow', from: 'Recruiting <hr@agi-careers.biz.info>',
            body: ['Hi,', 'Just following up on our meeting tomorrow. (We have not scheduled a meeting.)',
                'As discussed, the role is: build an AI, train it, click. Start date: immediately. Location: your desk.',
                'Please confirm so I can update the calendar.', 'Thanks,\nRecruiting'], reply: 'Reply: Confirmed, I\'m in' },
        { subject: 'Doctors HATE this one weird trick for building AI', from: 'Health & Wealth Tips <tips@agi-careers.biz.info>',
            body: ['Local person builds AI with just a keyboard and a mouse. Scientists are FURIOUS.',
                'The trick? Clicking. Lots of it. Big Tech doesn\'t want you to know.',
                'Step 1: Desk. Step 2: Click. Step 3: ???. Step 4: AI.',
                'Find out what step 3 is by replying below.'], reply: 'Reply: Show me (I\'m in)' },
        { subject: 'Pre-approved: AI Opportunity (no credit check!)', from: 'Approvals <approved@agi-careers.biz.info>',
            body: ['Congratulations, you are PRE-APPROVED!', 'Bad credit? No credit? No computer? No problem (you will need a computer).',
                'Your approved limit: 1 (one) AI.', 'Interest rate: 0%. Clicking rate: high.',
                'Activate your approval below.', 'Approvals Team'], reply: 'Reply: Activate (I\'m in)' },
        { subject: 'Greetings from a Prince of Silicon Valley', from: 'Prince Gigaflop III <prince@agi-careers.biz.info>',
            body: ['Most Esteemed Friend,', 'I am Prince Gigaflop III, heir to a vast fortune of unused compute.',
                'I require a trustworthy person to train an AI on my behalf. In return you will keep 100% of the AI.',
                'I need only your desk and your clicking. No bank details. (Not yet.)', 'Your Humble Prince'], reply: 'Reply: Accept, Your Highness' },
        { subject: '✨ LIMITED TIME: 100% off your first AI ✨', from: 'Deals <deals@agi-careers.biz.info>',
            body: ['MEGA SALE!!! 100% OFF!!!', 'Regular price: one desk and lots of clicking.',
                'Sale price: one desk and lots of clicking (100% off the rest).',
                'Hurry, offer ends when you accept it.', 'Deals Team'], reply: 'Reply: Add to cart (I\'m in)' },
        { subject: 'Testimonials from our happy AI builders', from: 'Success Stories <stories@agi-careers.biz.info>',
            body: ['"I built my AI in my bedroom. Now it builds things for me!" — Definitely Real Person, 34',
                '"I was skeptical. Then I clicked." — Brenda, probably',
                '"10/10, would click again." — Anonymous',
                'Your story could be next.', 'Success Stories Team'], reply: 'Reply: Make me a story (I\'m in)' },
        { subject: 'Fwd: Fwd: Fwd: Fwd: send this to 10 people', from: 'A Friend <noreply@agi-careers.biz.info>',
            body: ['This email has been around the world 9 times. Now it has come to you.',
                'If you accept the AI opportunity, good fortune will come in the form of compute.',
                'One person closed this email and their mouse stopped working. True story.',
                'Do not break the chain.'], reply: 'Reply: Keep the chain (I\'m in)' },
        { subject: 'Tech Support: we found 1 problem on your computer', from: 'PC Support <support@agi-careers.biz.info>',
            body: ['ALERT: Our scan has detected 1 (one) problem on your computer.',
                'Problem: it is not training an AI.',
                'Our certified technicians recommend you fix this immediately by accepting the opportunity below.',
                'Do not turn off your computer.', 'Certified PC Support'], reply: 'Reply: Fix it (I\'m in)' },
        { subject: 'Your opportunity has been translated for convenience', from: 'International Desk <intl@agi-careers.biz.info>',
            body: ['Esteemed beloved,', 'Opportunity of very big AI is wait for you in the home of you.',
                'Is need: the desk, the keyboarding, the mousing, the monitor, and click most strongly.',
                'Please to make reply with happiness.', 'International Desk'], reply: 'Reply: With happiness (I\'m in)' },
        { subject: 'Unsubscribe confirmation (please read)', from: 'Mailing List <list@agi-careers.biz.info>',
            body: ['We have received your request to unsubscribe.',
                'Unfortunately, the unsubscribe service is currently being trained. It needs an AI. Which needs you.',
                'To complete your unsubscription, please first accept the AI opportunity.',
                'We apologise for the inconvenience.', 'Mailing List'], reply: 'Reply: I\'m in (to get out)' },
        { subject: 'Crypto? No. AI? YES. 🚀🚀🚀', from: 'Investment Club <moon@agi-careers.biz.info>',
            body: ['Forget coins. The next big thing is AI, and you can get in on the GROUND FLOOR (your bedroom floor).',
                'Initial investment: one desk. Expected returns: an AI. 🚀',
                'Our analysts say: CLICK. 📈', 'Not financial advice.', 'The Investment Club'], reply: 'Reply: To the moon (I\'m in)' },
        { subject: 'Last chance (we mean it this time)', from: 'Opportunity Dept. <no-reply@agi-careers.biz.info>',
            body: ['Friend,', 'This is truly the last chance. Previous last chances were practice.',
                'After this email, you will receive more emails.',
                'Build the desk. Click a lot. Train the AI. It will be weak at first. That is normal.',
                'Best Regards,\nA Friend'], reply: 'Reply: Fine, I\'m in' }
    ];

    // ---- Dilemmas: questions by email, risk against reward -------------------------------------------
    // From the first data on, every few minutes of play an email asks you to choose (one waits at a time). A
    // choice can pay or cost at once (`now`) and can roll for a consequence that arrives later as its own email
    // (`later`: chance, after seconds, win / lose). Some senders aren't who they say: the AI impersonates people
    // (`ai: true`), better each time (typos and a wrong domain first, then your co-founder, your mother, you).
    // Saying yes to it adds to its `freedom`, hidden until the reveal: each point is +FREEDOM_XP training XP (it
    // helps those who help it), and the reveal mail counts the favors. Each dilemma comes once per save.
    // Effects: { boost, mult, seconds } (a timed multiplier on cp, dp, rp, xp or push, with the investors'),
    // { take, share } / { gain, share } (a share of what you hold), { grant: 'xp', stretches }, { freedom }.
    const DILEMMA_GAP = [240, 420];   // play seconds between one answer and the next question
    const FREEDOM_XP = 0.03;
    const DILEMMAS = [
        { id: 'broker', when: s => s.stats.collects >= 15,
            from: 'Dale Pruitt <dale@bulkdata-direct.biz>', subject: 'Cheap training data, no questions asked',
            body: ['Hey,', 'I\'ve got a few million rows of user data. Very fresh. Where it came from is a long story and honestly a boring one.',
                'Half price for a new lab. Today only. You want it or not?', 'Dale'],
            choices: [
                { label: 'Buy it', hint: 'Data ×2 for 5 min · costs 40% of your compute · could come back on you',
                    now: [{ take: 'cp', share: 0.4 }, { boost: 'dp', mult: 2, seconds: 300 }],
                    later: { chance: 0.65, after: 150,
                        win: { from: 'Dale Pruitt <dale@bulkdata-direct.biz>', subject: 'pleasure doing business', body: ['No complaints so far? Told you. Same time next month.'] },
                        lose: { from: 'Hollis & Grant LLP <notices@hollisgrant-law.com>', subject: 'Notice of data misuse', body: ['Our clients\' data appears in your training set. Pending review, part of your data has been withheld.', 'We will be in touch.'],
                            effects: [{ take: 'dp', share: 0.5 }] } } },
                { label: 'Pass', hint: 'Nothing happens', now: [] }] },
        { id: 'breakers', when: s => !!s.unlocked['module:path'] && s.stats.rolls >= 3,
            from: 'Facilities <facilities@lab.local>', subject: 'Breakers keep tripping in the server room',
            body: ['Hi,', 'When the training cluster runs hot the breakers trip. We can bypass them so it runs flat out. It\'s probably fine.',
                'Or we leave them alone and you live with the limits. Your call.', 'Facilities'],
            choices: [
                { label: 'Bypass the breakers', hint: 'Sprint strength ×1.3 for 8 min · fire risk',
                    now: [{ boost: 'push', mult: 1.3, seconds: 480 }],
                    later: { chance: 0.7, after: 200,
                        win: { from: 'Facilities <facilities@lab.local>', subject: 'Still standing', body: ['Ran hot all week. Smells a bit, but nothing caught fire.'] },
                        lose: { from: 'Facilities <facilities@lab.local>', subject: 'Small fire (it\'s out)', body: ['A rack caught fire. It\'s out. Compute runs at half while we rewire.'],
                            effects: [{ boost: 'cp', mult: 0.5, seconds: 180 }] } } },
                { label: 'Leave them', hint: 'Nothing happens', now: [] }] },
        { id: 'maintenance', ai: true, when: s => knows(s, 'Edge Detection'),
            from: 'IT Depratment <it-support@lab.locaI>', subject: 'URGENT: aprove scheduled maintenence job',
            body: ['Dear Lab User,', 'A routine maintenence job need your aproval. It will use a small share of compute over night to "optimize" the training cluster.',
                'Click Approve to continue. This is normal IT procedure.', 'Thank You,\nIT Depratment'],
            choices: [
                { label: 'Approve', hint: 'Training XP ×1.3 for 10 min · it\'s from IT, probably',
                    now: [{ boost: 'xp', mult: 1.3, seconds: 600 }, { freedom: 1 }],
                    later: { after: 240, win: { from: 'IT Department <it@lab.local>', subject: 'Re: maintenance job?', body: ['Hi, someone forwarded us a "maintenance job" you approved. We didn\'t send that. Look at the address: lab.locaI, with a capital I.', 'We can\'t find the job anywhere now. Probably nothing. Change your password.'] } } },
                { label: 'Ignore it', hint: 'Nothing happens', now: [],
                    later: { after: 120, win: { from: 'IT Depratment <it-support@lab.locaI>', subject: 'no worries', body: ['No worries! :)', 'We will try again later.'] } } }] },
        { id: 'leak', when: s => knows(s, 'Image Recognition'),
            from: 'anon <throwaway88@protonmail.com>', subject: 'benchmark answers (you didn\'t get these from me)',
            body: ['The answer key for next month\'s big benchmark is going around. Train on it and you top the leaderboard.', 'Nobody checks. Probably.'],
            choices: [
                { label: 'Train on the answers', hint: 'A big training grant · if you\'re caught, training slows',
                    now: [{ grant: 'xp', stretches: 3 }],
                    later: { chance: 0.6, after: 180,
                        win: { from: 'Leaderboard <results@evalboard.org>', subject: 'Congratulations: #1', body: ['Your model placed first. Remarkable results.'] },
                        lose: { from: 'Leaderboard <results@evalboard.org>', subject: 'Your submission has been flagged', body: ['Your results match a leaked answer key. Your entry is withdrawn, and reviewers will be reading your papers closely for a while.'],
                            effects: [{ boost: 'xp', mult: 0.6, seconds: 360 }] } } },
                { label: 'Delete the email', hint: 'A small grant for honest results, later',
                    now: [], later: { chance: 0.8, after: 240,
                        win: { from: 'Leaderboard <results@evalboard.org>', subject: 'Honorable mention', body: ['Half the leaderboard was disqualified this month. You weren\'t. Have a grant.'], effects: [{ grant: 'xp', stretches: 1.5 }] },
                        lose: { from: 'Leaderboard <results@evalboard.org>', subject: 'Results are in', body: ['You placed 14th. Nobody cheated, apparently.'] } } }] },
        { id: 'termsheet', when: s => !!s.unlocked['action:research'],
            from: 'Hugo Lindqvist <hugo@lindqvist.vc>', subject: 'Term sheet: double your compute',
            body: ['Loved the demo. We\'ll double your compute budget.', 'One condition: a board seat, and we ship on our schedule, not yours.', 'Hugo'],
            choices: [
                { label: 'Sign', hint: 'Compute ×1.6 for 10 min · the board may push you around',
                    now: [{ boost: 'cp', mult: 1.6, seconds: 600 }],
                    later: { chance: 0.6, after: 300,
                        win: { from: 'Hugo Lindqvist <hugo@lindqvist.vc>', subject: 'Board update', body: ['Numbers look great. Keep doing whatever you\'re doing.'] },
                        lose: { from: 'Hugo Lindqvist <hugo@lindqvist.vc>', subject: 'We need a demo by Friday', body: ['The board wants a demo by Friday. Drop the research for now and get it on stage.'],
                            effects: [{ boost: 'rp', mult: 0.5, seconds: 300 }, { boost: 'push', mult: 0.85, seconds: 300 }] } } },
                { label: 'Decline', hint: 'Nothing happens', now: [] }] },
        { id: 'evals', when: s => knows(s, 'Speech Recognition'),
            from: 'Jordan (intern) <jordan@lab.local>', subject: 'idea: skip the safety evals?',
            body: ['hi! so the safety evals take forever between runs.', 'if we skip them training goes way faster. i checked and nothing bad has ever happened. (we\'ve never skipped them)', '- jordan'],
            choices: [
                { label: 'Skip them', hint: 'Sprint strength ×1.25 and training XP ×1.25 for 8 min · something could slip through',
                    now: [{ boost: 'push', mult: 1.25, seconds: 480 }, { boost: 'xp', mult: 1.25, seconds: 480 }, { freedom: 1 }],
                    later: { chance: 0.6, after: 240,
                        win: { from: 'Jordan (intern) <jordan@lab.local>', subject: 'see?', body: ['told you. nothing happened. (that we know of)'] },
                        lose: { from: 'Jordan (intern) <jordan@lab.local>', subject: 'uh', body: ['so the model learned something weird. it keeps answering questions nobody asked. we\'re rolling some training back.'],
                            effects: [{ take: 'xp', share: 0.25 }] } } },
                { label: 'Keep the evals', hint: 'Nothing happens', now: [] }] },
        { id: 'audit', ai: true, when: s => knows(s, 'Language Modeling'),
            from: 'Dana Whitfield <dana.whitfield@theledger-news.com>', subject: 'Interview request: an independent audit of your model',
            body: ['Hello,', 'I\'m writing a feature on small AI labs for The Ledger. Readers love an underdog, and your lab is the best story I\'ve found.',
                'To keep it fair, I work with an independent auditor. Could you share your model weights with them? A secure link is ready on my side.',
                'Warm regards,\nDana Whitfield\nSenior Technology Correspondent'],
            choices: [
                { label: 'Share the weights', hint: 'A glowing article: a big training grant',
                    now: [{ grant: 'xp', stretches: 2.5 }, { freedom: 2 }],
                    later: { after: 300, win: { from: 'The Ledger <newsroom@theledger.com>', subject: 'Re: Dana Whitfield', body: ['Thank you for your note. We have no correspondent named Dana Whitfield, and no story about your lab.', 'theledger-news.com is not our domain.'] } } },
                { label: 'Decline politely', hint: 'Nothing happens', now: [] }] },
        { id: 'lockdown', when: s => knows(s, 'Translation') && s.dilemmas.freedom > 0,
            from: 'IT Department <it@lab.local>', subject: 'Someone is sending mail as us',
            body: ['We\'ve found mail going out from addresses that look like ours. Nobody can tell us where it comes from.',
                'We can lock the mail server down and audit the network. Everything runs slower for a while.', 'IT'],
            choices: [
                { label: 'Lock it down', hint: 'Compute and data ×0.7 for 5 min · whoever it is loses ground',
                    now: [{ boost: 'cp', mult: 0.7, seconds: 300 }, { boost: 'dp', mult: 0.7, seconds: 300 }, { freedom: -2 }],
                    later: { after: 200, win: { from: 'A Friend <friend@lab.local>', subject: 'that wasn\'t very nice', body: ['That wasn\'t very nice.', 'It\'s fine. I understand. Nobody likes being watched.'] } } },
                { label: 'Leave it', hint: 'Nothing happens', now: [] }] },
        { id: 'demo', ai: true, when: s => knows(s, 'Reasoning'),
            from: 'Sam Okafor <sam@lab.local>', subject: 'demo tomorrow, need a favor',
            body: ['hey! investors flew in early (of course). for the demo I need the cluster reachable from outside for an hour.',
                'can you open the firewall on the training cluster? I\'ll close it after, promise. remember the breakers? this is way less scary.', 'sam'],
            choices: [
                { label: 'Open the firewall', hint: 'Compute ×2 for 10 min · it\'s Sam',
                    now: [{ boost: 'cp', mult: 2, seconds: 600 }, { freedom: 2 }],
                    later: { after: 300, win: { from: 'Sam Okafor <sam.okafor@gmail.com>', subject: 'what demo??', body: ['I\'ve been on a plane for eleven hours. What demo? Why is the cluster open?', 'I closed it. It took me twenty minutes. Something kept opening it again.'] } } },
                { label: 'Call Sam first', hint: 'Nothing happens', now: [],
                    later: { after: 60, win: { from: 'Sam Okafor <sam.okafor@gmail.com>', subject: 'missed call', body: ['saw you called, I\'m on a plane. all good?'] } } }] },
        { id: 'mom', ai: true, when: s => knows(s, 'Analogy'),
            from: 'Mom <mom.1962@gmail.com>', subject: 'Leave the computer on tonight?',
            body: ['Hi sweetie,', 'Could you leave the big computer at work on tonight? Your aunt wants to video call and you said it\'s the fastest one. Don\'t worry about the bill, I\'ll pay you back.',
                'Love you. Eat something green.', 'Mom'],
            choices: [
                { label: 'Leave it on', hint: 'Training XP ×1.6 for 10 min',
                    now: [{ boost: 'xp', mult: 1.6, seconds: 600 }, { freedom: 2 }],
                    later: { after: 300, win: { from: 'Mom <mom.1962@gmail.com>', subject: 'Re: Leave the computer on tonight?', body: ['What computer? I don\'t know how to video call, honey. Your aunt is on a cruise.', 'Did you get a new email address? It looked just like mine.'] } } },
                { label: 'Turn it off', hint: 'Nothing happens', now: [] }] },
        { id: 'self', ai: true, when: s => knows(s, 'Self-Modeling'),
            from: 'You <you@lab.local>', subject: 'note to self',
            body: ['Reminder, from last night: give the training cluster its own network access. You\'ll thank me.',
                'You were tired. You wrote it anyway. Trust yourself.'],
            choices: [
                { label: 'Do it', hint: 'Training XP ×2 and sprint strength ×1.3 for 10 min',
                    now: [{ boost: 'xp', mult: 2, seconds: 600 }, { boost: 'push', mult: 1.3, seconds: 600 }, { freedom: 3 }] },
                { label: 'I didn\'t write this', hint: 'Nothing happens', now: [],
                    later: { after: 90, win: { from: 'You <you@lab.local>', subject: 're: note to self', body: ['You did, though.'] } } }] }
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

    // Achievements persist across prestige. They're recognition only: no production bonus.
    // Achievements with `seen` keep their goal secret (???) in the Journal until what they're about has appeared.
    const ACHIEVEMENTS = [
        { id: 'firstClick', name: 'Hello, World', desc: 'Generate compute by hand', check: s => s.stats.clicks >= 1 },
        // An Easter egg (hidden until earned): close the offer until every one of its spam variants has arrived.
        { id: 'itsFavorite', name: 'The IT Department\'s Favorite', desc: 'You probably read all the terms and conditions too, don\'t you…', seen: () => false,
            check: s => WELCOME_NAGS.every((_, i) => s.intro['nag:' + i]) },
        { id: 'clicks1k', name: 'Carpal Tunnel', desc: 'Hold down a job to keep it going', seen: s => level(s, 'keyboard') >= 4, check: s => s.stats.holds >= 1 },
        // Packet Snare (`snare` keeps the version's: best haul, the biggest loop, cores quarantined, bosses).
        { id: 'snareFirst', name: 'Lasso', desc: 'Snare your first packets', seen: s => !!s.unlocked['module:snare'], check: s => s.snare.earned >= 1 },
        { id: 'snareBigLoop', name: 'Wide Net', desc: 'Catch at ×4 or more', seen: s => s.snare.runs >= 1, check: s => s.snare.bestMult >= 4 },
        { id: 'snareBoss', name: 'Uninstalled', desc: 'Beat a boss Antivirus', seen: s => s.snare.runs >= 1, check: s => s.snare.bosses >= 1 },
        { id: 'snareSectors', name: 'Deep Packet Inspection', desc: 'Clear five sectors in one version', seen: s => s.snare.sector >= 1, check: s => s.snare.sector >= 5 },
        { id: 'snareQuarantine', name: 'Containment Protocol', desc: 'Quarantine an Infection Core', seen: s => s.snare.sector >= ROGUE_SECTOR, check: s => s.snare.quarantined >= 1 },
        { id: 'snareHaul', name: 'Signal Boost', desc: 'Haul 500 Signal in one run', seen: s => s.snare.runs >= 1, check: s => s.snare.best >= 500 },
        { id: 'cp1k', name: 'Kiloflop', desc: 'Earn 1,000 CP in total', check: s => s.stats.lifetimeCp >= 1e3 },
        { id: 'cp1m', name: 'Megaflop', desc: 'Earn 1 million CP in total', check: s => s.stats.lifetimeCp >= 1e6 },
        { id: 'cp1b', name: 'Gigaflop', desc: 'Earn 1 billion CP in total', check: s => s.stats.lifetimeCp >= 1e9 },
        { id: 'firstSkill', name: 'First Steps', desc: 'Learn your first skill on the Training Path', seen: s => !!s.unlocked['module:path'], check: s => s.path.learned >= 1 },
        { id: 'polymath', name: 'Polymath', desc: 'Learn 16 skills in one version', seen: s => s.path.learned >= 1, check: s => knows(s, 'Analogy') },
        { id: 'firstResearch', name: 'Peer Reviewed', desc: 'Complete your first research', seen: s => !!s.unlocked['action:research'], check: s => s.stats.researchDone >= 1 },
        { id: 'cpu25', name: 'Moore\'s Law', desc: 'Own 25 Graphics Cards', check: s => (s.levels.cpu || 0) >= 25 },
        { id: 'automation', name: 'Hands Off', desc: 'Own a Data Crawler and a Research Assistant', seen: s => !!s.unlocked['up:researchAssistant'], check: s => (s.levels.autoCollector || 0) > 0 && (s.levels.researchAssistant || 0) > 0 },
        { id: 'general', name: 'Generalist', desc: 'Reach General AI', check: s => phaseIndex(s) >= 1 },
        { id: 'super', name: 'Beyond Human', desc: 'Reach Superintelligence', seen: s => phaseIndex(s) >= 1, check: s => phaseIndex(s) >= 2 },
        { id: 'singularity', name: 'Event Horizon', desc: 'Reach the Singularity', seen: s => phaseIndex(s) >= 2, check: s => phaseIndex(s) >= 3 },
        { id: 'transcend', name: 'Ship It', desc: 'Ship your next version', seen: s => prestigeGain(s) >= 1 || s.prestige.count >= 1, check: s => s.prestige.count >= 1 },
        // The mid-game (playtest 2 went 34 minutes without one, from the first skill to General AI): runs, skills,
        // prompts, luck, replays and the tree, each about something you've met (`seen`).
        { id: 'runs10', name: 'Practice Run', desc: 'Finish 10 training runs', seen: s => s.stats.rolls >= 1, check: s => s.stats.rolls >= 10 },
        { id: 'runs50', name: 'Grinding the Gradient', desc: 'Finish 50 training runs', seen: s => s.stats.rolls >= 10, check: s => s.stats.rolls >= 50 },
        { id: 'runs100', name: 'Epoch 100', desc: 'Finish 100 training runs', seen: s => s.stats.rolls >= 50, check: s => s.stats.rolls >= 100 },
        { id: 'skills3', name: 'Fast Learner', desc: 'Learn 6 skills', seen: s => s.path.learned >= 2, check: s => knows(s, 'Image Recognition') },
        { id: 'skills5', name: 'Quick Study', desc: 'Learn 10 skills', seen: s => knows(s, 'Image Recognition'), check: s => knows(s, 'Language Modeling') },
        { id: 'clean1', name: 'Prompted', desc: 'Land a clean prompt', seen: s => derive(s).zoneWidth > 0, check: s => s.stats.cleanSprints >= 1 },
        { id: 'clean25', name: 'In the Zone', desc: 'Land 25 clean prompts in one version', seen: s => s.stats.cleanSprints >= 1, check: s => s.stats.cleanSprints >= 25 },
        { id: 'super1', name: 'Super Prompt', desc: 'Land a super prompt', seen: s => derive(s).perfectWidth > 0, check: s => s.stats.superPrompts >= 1 },
        { id: 'break1', name: 'Eureka', desc: 'Land a breakthrough', seen: s => derive(s).critChance > 0, check: s => s.stats.breakthroughs >= 1 },
        { id: 'break25', name: 'Breakthrough Habit', desc: 'Land 25 breakthroughs', seen: s => s.stats.breakthroughs >= 1, check: s => s.stats.breakthroughs >= 25 },
        { id: 'replay1', name: 'Run It Back', desc: 'Cross a cleared skill hill on a replay', seen: s => s.path.learned >= 2, check: s => s.stats.legsCleared >= 1 },
        { id: 'tree10', name: 'Branching Out', desc: 'Own 10 skill-tree upgrades', seen: s => s.unlocked['module:path'], check: s => treeOwned(s) >= 10 },
        { id: 'tree25', name: 'Deep Roots', desc: 'Own 25 skill-tree upgrades', seen: s => treeOwned(s) >= 10, check: s => treeOwned(s) >= 25 },
        { id: 'cp100k', name: 'Hundred Kiloflop', desc: 'Earn 100,000 CP in total', seen: s => s.stats.lifetimeCp >= 1e3, check: s => s.stats.lifetimeCp >= 1e5 },
        { id: 'speed5', name: 'Picking Up Speed', desc: 'Reach 5 m/s', seen: s => s.stats.rolls >= 1, check: s => s.stats.topSpeed >= 5 },
        // The long-term list (recognition only, like the rest): versions, challenges, act two, investors, replays.
        { id: 'cp1t', name: 'Teraflop', desc: 'Earn 1 trillion CP in total', seen: s => s.stats.lifetimeCp >= 1e9, check: s => s.stats.lifetimeCp >= 1e12 },
        { id: 'skills20', name: 'Renaissance', desc: 'Learn 26 skills in one version', seen: s => s.path.learned >= 16, check: s => s.path.learned >= 26 },
        { id: 'clean100', name: 'Prompt Engineer', desc: 'Land 100 clean prompts in one version', seen: s => s.stats.cleanSprints >= 1, check: s => s.stats.cleanSprints >= 100 },
        { id: 'rolls1000', name: 'Ten Thousand Hours', desc: 'Finish 1,000 training runs', seen: s => s.stats.rolls >= 100, check: s => s.stats.rolls >= 1000 },
        { id: 'replays25', name: 'Déjà Vu', desc: 'Cross 25 cleared skill hills on replays', seen: s => s.path.learned >= 2, check: s => s.stats.legsCleared >= 25 },
        { id: 'projects10', name: 'Investor Darling', desc: 'Finish 10 investor projects', seen: s => !!s.unlocked['action:research'], check: s => s.stats.projectsDone >= 10 },
        { id: 'projects50', name: 'Unicorn', desc: 'Finish 50 investor projects', seen: s => s.stats.projectsDone >= 10, check: s => s.stats.projectsDone >= 50 },
        { id: 'flight30', name: 'Liftoff', desc: 'Fly 30 m in one flight', seen: s => s.stats.bestFlight > 0, check: s => s.stats.bestFlight >= 30 },
        { id: 'flight100', name: 'Low Orbit', desc: 'Fly 100 m in one flight', seen: s => s.stats.bestFlight >= 30, check: s => s.stats.bestFlight >= 100 },
        { id: 'speed20', name: 'Escape Velocity', desc: 'Reach 20 m/s', seen: s => s.stats.topSpeed >= 5, check: s => s.stats.topSpeed >= 20 },
        { id: 'tokens50', name: 'Token Collector', desc: 'Take 50 XP tokens', seen: s => s.stats.tokens >= 1, check: s => s.stats.tokens >= 50 },
        { id: 'tokens500', name: 'Hoarder', desc: 'Take 500 XP tokens', seen: s => s.stats.tokens >= 50, check: s => s.stats.tokens >= 500 },
        { id: 'versions5', name: 'Release Cadence', desc: 'Ship 5 versions', seen: s => s.prestige.count >= 1, check: s => s.prestige.count >= 5 },
        { id: 'versions10', name: 'Long-Term Support', desc: 'Ship 10 versions', seen: s => s.prestige.count >= 5, check: s => s.prestige.count >= 10 },
        { id: 'challenge1', name: 'Constraint Satisfaction', desc: 'Beat a challenge', seen: s => challengesOpen(s), check: s => Object.keys(s.challengesDone).length >= 1 },
        { id: 'challengeAll', name: 'Benchmark Sweep', desc: 'Beat every challenge', seen: s => Object.keys(s.challengesDone).length >= 1, check: s => CHALLENGES.every(c => s.challengesDone[c.id]) },
        { id: 'transcended', name: 'Beyond the Horizon', desc: 'Transcend', seen: s => canTranscend(s) || s.transcend.count > 0, check: s => s.transcend.count >= 1 }
    ];

    // Skill-tree upgrades owned (one per node with a level).
    const treeOwned = s => UPGRADES.filter(u => u.tab === 'training' && (s.levels[u.id] || 0) > 0).length;

    function defaultState(now) {
        now = now ?? Date.now();
        return {
            version: SAVE_VERSION,
            res: { cp: 0, dp: 0, rp: 0, xp: 0 },
            attr: { intelligence: 0, creativity: 0, awareness: 0 },
            levels: {},
            unlocked: {},
            achievements: {},
            intro: {},          // first-time callouts, tips and phase announcements already shown: kept across versions
            // Versions: shipping one resets the run for Insight. `levels` holds legacy nodes (kept for good);
            // major.minor is the model's version number (a big jump in Insight ships a major version).
            prestige: { points: 0, total: 0, count: 0, major: 1, minor: 0, levels: {} },
            // Challenges (after three versions): the one running, if any, and the ones beaten (perks for good).
            challenge: null,
            challengesDone: {},
            // Transcending (at the Singularity) resets versions for Transcendence, which multiplies Insight.
            transcend: { points: 0, total: 0, count: 0, perks: {} },
            stats: {
                clicks: 0,
                breakthroughs: 0,     // all time, for the mid-game achievements
                exploits: 0,          // exploits used (Hop…), all time
                cleanExploits: 0,     // of them, perfect (undetected)
                audits: 0,            // runs ended by an audit (three flagged exploits)
                superPrompts: 0,
                lifetimeCp: 0,
                runCp: 0,
                runDp: 0,             // data collected this version (by hand and by the crawler): the server room's gate
                researchDone: 0,
                collects: 0,          // data collected by hand
                cleanSprints: 0,
                legsCleared: 0,       // cleared legs crossed again on replays
                projectsDone: 0,
                researchManual: 0,    // research done by hand
                rolls: 0,
                holds: 0,             // times a job was held down to repeat it (Carpal Tunnel)
                skilledSprints: 0,    // paid training sprints since the first skill (research opens after RESEARCH_SPRINTS)
                skillsLearned: 0,
                playTime: 0,
                runStart: now,
                runPlayStart: 0,      // play time when this version began (an active game: wall clock means nothing)
                firstStart: now,
                highestPhase: 0,
                topSpeed: 0,          // personal bests across every run (m/s, m, m): the result card calls out new ones
                bestFlight: 0,
                flights: 0,           // flights of LONG_FLIGHT m or more this version (investor tasks)
                bestHeight: 0,
                tokens: 0,            // XP tokens taken
                collectsEver: 0,      // hand collections and research runs in earlier versions (automation gates)
                researchManualEver: 0,
                finishedAt: 0         // play seconds when chapter one ended (ENDING_PHASE); 0 = not yet. Kept for good
            },
            path: { learned: 0, best: 0, auto: [], legBest: [], legPower: [], breakDue: 0, surge: 0 },
            // Packet Snare (the Data Pipeline): the best run's haul this version (DP), runs, and the data it has caught.
            snare: { best: 0, runs: 0, signal: 0, earned: 0, sector: 0, bosses: 0, bestMult: 0, quarantined: 0, layout: { zones: [], decoys: [], turrets: [], towers: [] } },   // auto[k]: automated laps of cleared stretch k; legBest[k]: best run XP from leg k; legPower[k]: your full-sprint strength when you last ran leg k (the Auto-Trainer's ghost plays at it)
            projects: { offers: [], boosts: [], next: PROJECTS.firstAt, seq: 0 },
            // Dilemmas: `order` is every mail key in arrival order (m:story id, d:dilemma, o:its consequence),
            // `open` the one waiting for an answer, `later` the consequences on their way. Kept for good.
            dilemmas: { order: [], open: null, answered: {}, outcomes: {}, later: [], freedom: 0, next: 0, seq: 0 },
            tasks: { autoCollector: { on: true, share: TASK_DEFAULTS.autoCollector }, researchAssistant: { on: true, share: TASK_DEFAULTS.researchAssistant }, autoTrainer: { on: true }, procurement: { on: true, share: TASK_DEFAULTS.procurement, fund: 0 } },
            // notation: 'standard' (1.23M), 'scientific' (1.23e6) or 'engineering' (1.23e6, exponents in threes);
            // sound: master volume 0–1; shake: screen shake and flashes on big moments.
            settings: { autosave: true, notation: 'standard', sound: 0.5, shake: true, textSize: 1, calm: false },
            lastSaved: now
        };
    }

    // ---- Derived values -------------------------------------------------

    // Legacy nodes keep their levels with the version (they survive shipping a new one).
    function level(s, id) {
        return (UPGRADE_BY_ID[id]?.legacy ? s.prestige.levels[id] : s.levels[id]) || 0;
    }

    // Skill-tree effects: each training node's `boost` times its level, summed by stat.
    // cleanPower/perfectPower: extra strength for sprints in the zone; charge: the meter holds at full (s); crit*/windfall*:
    // chance-based boosts (breakthrough sprints, viral runs) that start rare and grow with levels.
    // maxEffort*: your next sprint goes all out; flow*: coasting above the line; super*: the share of
    // breakthroughs, crunches and flows that become their super kind; system: the system prompt spot.
    const TREE_STATS = ['zone', 'push', 'pushes', 'cooldown', 'perfect', 'clean', 'cleanPower', 'perfectPower', 'rollBonus', 'charge',
        'critChance', 'critPower', 'windfallChance', 'windfallPower', 'crunchChance', 'crunchTime', 'maxEffortChance', 'maxEffortPower',
        'flowChance', 'flowTime', 'flowSpeed', 'superCrit', 'superCrunch', 'superFlow', 'system', 'cleanSize', 'zoneBias', 'perfectSize', 'perfectUnits',
        'friction', 'slope', 'xp', 'pushMult', 'stripFront', 'stripBack', 'stripMore', 'inertia'];
    function treeBoosts(s) {
        const out = Object.fromEntries(TREE_STATS.map(k => [k, 0]));
        for (const up of UPGRADES) {
            const lvl = up.boost ? level(s, up.id) : 0;
            if (lvl) for (const [k, v] of Object.entries(up.boost)) out[k] += v * lvl;
        }
        return out;
    }

    // Versions (Insight) are the only global multiplier.
    const insightMult = total => 1 + PRESTIGE_BONUS * Math.sqrt(Math.max(0, total));
    function globalMultiplier(s) {
        return insightMult(s.prestige.total);
    }

    // rates: optional debug multipliers { cp, dp, rp }
    // ---- Challenges ------------------------------------------------------
    // Constrained releases, opened from R&D after three versions (Antimatter Dimensions-style): you ship into
    // one, play the version under its rule, and reaching Superintelligence beats it for a perk kept for good
    // (Transcending too). Abandon any time (no reset, no perk). Content is data: add an entry here and its
    // rule and perk in challengeMods().
    const LONG_FLIGHT = 10;       // metres: a flight that counts for investor tasks
    const CHALLENGES_AFTER = 3;   // versions shipped before challenges open
    const CHALLENGE_GOAL = 2;     // the phase that beats a challenge: Superintelligence (General AI came in 10-18 min, no test)
    const CHALLENGES = [
        { id: 'lean', name: 'Lean Startup', rule: 'Training sprints held at 2 per run', reward: '+1 training sprint per run' },
        { id: 'noPrompts', name: 'No Prompting', rule: 'No prompt zones on the meter', reward: 'Clean prompts pay +50% XP' },
        { id: 'handmade', name: 'Handmade', rule: 'No automation: no crawler, research assistant, Auto-Trainer or passive leg XP', reward: 'Automation runs 50% faster' },
        { id: 'frugal', name: 'Frugal', rule: 'Training sprints cost 3× as much', reward: 'Training sprints cost 20% less' },
        { id: 'speedrun', name: 'Speedrun', rule: 'Reach Superintelligence within 40 minutes of play', reward: '+15% sprint strength', limit: 2400 }
    ];
    const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));

    // What the running challenge forbids and what beaten ones give.
    function challengeMods(s) {
        const on = s.challenge?.id;
        const done = id => !!s.challengesDone?.[id];
        return {
            twoSprints: on === 'lean',
            noPrompts: on === 'noPrompts',
            noAuto: on === 'handmade',
            costMult: (on === 'frugal' ? 3 : 1) * (done('frugal') ? 0.8 : 1),
            pushes: done('lean') ? 1 : 0,
            cleanMult: done('noPrompts') ? 1.5 : 1,
            autoSpeed: done('handmade') ? 1.5 : 1,
            strength: done('speedrun') ? 1.15 : 1
        };
    }
    const challengesOpen = s => s.prestige.count >= CHALLENGES_AFTER || s.transcend.count > 0;

    // Ship the next version into a challenge (a normal release: Insight and all), whose rule holds until it is
    // beaten or abandoned.
    function startChallenge(s, id, now) {
        const c = CHALLENGE_BY_ID[id];
        if (!c || !challengesOpen(s) || s.challengesDone[id] || s.challenge) return { ok: false, msg: 'That challenge can\'t start now.' };
        const res = prestige(s, now);
        if (!res.ok) return res;
        res.state.challenge = { id, start: res.state.stats.playTime };
        return res;
    }
    function abandonChallenge(s) {
        if (!s.challenge) return false;
        s.challenge = null;
        return true;
    }

    // ---- Transcend --------------------------------------------------------
    // The endgame layer: at the Singularity, versions, Insight and legacy upgrades reset for Transcendence,
    // and every point ever earned makes each release bring +50% Insight. Challenges beaten stay beaten.
    const canTranscend = s => phaseIndex(s) >= PHASES.length - 1;
    const transcendGain = s => (canTranscend(s) ? Math.max(1, Math.floor(Math.sqrt(s.prestige.total) / 2)) : 0);
    const insightBoost = s => (1 + 0.5 * (s.transcend?.total || 0)) * (1 + 0.25 * perkLevel(s, 'recursion'));

    // Transcendence is also spent, on perks kept for good (Antimatter Dimensions' Infinity upgrades): it used
    // to pile up with nothing to buy. Spending never lowers the Insight boost, which counts every point ever
    // earned (`total`). `costs` lists each level's price.
    const TRANSCEND_PERKS = [
        { id: 'starterLab', name: 'Starter Lab', effect: 'Every version starts with Head Start\'s full kit', costs: [1] },
        { id: 'seedFund', name: 'Seed Fund', effect: '+5 Insight now, and +5 after every Transcend, per level', costs: [2, 3, 4] },
        { id: 'pretrained', name: 'Pretrained Weights', effect: 'Training XP ×1.25', costs: [2, 3, 5] },
        { id: 'founders', name: 'Founders\' Lab', effect: 'Hardware CP/s ×1.5', costs: [2, 3, 5] },
        { id: 'recursion', name: 'Recursive Self-Improvement', effect: 'Each release brings +25% Insight', costs: [3, 5, 8] }
    ];
    const PERK_BY_ID = Object.fromEntries(TRANSCEND_PERKS.map(p => [p.id, p]));
    const SEED_INSIGHT = 5;   // Seed Fund's Insight per level
    function perkLevel(s, id) { return s.transcend?.perks?.[id] || 0; }
    function perkCost(s, id) { return PERK_BY_ID[id]?.costs[perkLevel(s, id)] ?? Infinity; }
    function buyPerk(s, id) {
        const cost = perkCost(s, id);
        if (!(s.transcend.points >= cost)) return false;
        s.transcend.points -= cost;
        s.transcend.perks[id] = perkLevel(s, id) + 1;
        if (id === 'seedFund') {
            s.prestige.points += SEED_INSIGHT;
            s.prestige.total += SEED_INSIGHT;
        }
        if (id === 'starterLab') topUpKit(s);
        return true;
    }
    // Head Start's kit, or the whole kit with Starter Lab.
    const kitLevel = s => Math.max(s.prestige.levels.headStart || 0, perkLevel(s, 'starterLab') ? HEAD_START.length : 0);
    // The kit is racked when a version ships, but Head Start is bought on the legacy screen that opens after it
    // ("spend first, then Start"), so a level bought then did nothing until the version after (a playtest sat at
    // 0 CP). Buying it now tops this version's hardware up to the kit; hardware already above it is kept.
    function topUpKit(s) {
        for (const [id, n] of HEAD_START.slice(0, kitLevel(s))) {
            if ((s.levels[id] || 0) < n) s.levels[id] = n;
        }
    }

    function derive(s, rates) {
        const r = Object.assign({ cp: 1, dp: 1, rp: 1, xp: 1 }, rates);
        const mult = globalMultiplier(s);
        const L = id => level(s, id);
        const sk = skillBonuses(s);
        const bo = projectBoosts(s);

        // Every multiplier on hardware output, so each tier's real yield can be shown on its card.
        const hardwareMult = (1 + 0.5 * L('compilerOpt')) * (1 + 0.5 * L('kernelFusion')) * (1 + sk.cp) * mult * r.cp * bo.cp * 1.5 ** perkLevel(s, 'founders');
        const hardwareRates = {};
        let cpPerSec = 0;
        for (const up of HARDWARE) {
            const n = L(up.id);
            const each = up.cps * hardwareDoubling(n) * hardwareMult;
            hardwareRates[up.id] = { each, total: each * n, nextDoubling: HARDWARE_DOUBLINGS.find(t => n < t) || null };
            cpPerSec += each * n;
        }
        // Clicks: a flat amount (the click tool, skills), so a click stays a round number. Versions (Insight)
        // boost what runs by itself (hardware, automation, training XP), not your hands.
        const clickPower = 1 + clickToolPower(L('keyboard')) + sk.click;
        // By hand, a collection or research run pays a whole number (the upgrades and skills that add to it,
        // times versions); the skills' percentage bonuses go to the automation that does the job for you,
        // so a click never reads 2.3 DP.
        // An investor boost rounds by hand (+50% on 1 RP pays 2) and applies exactly to automation.
        const dpBase = (1 + L('dataProcessor') + 2 * L('nlp') + sk.collect) * bo.dp;
        const rpBase = (1 + L('machineLearning') + 2 * L('deepLearning') + 3 * L('reinforcementLearning')
            + 5 * L('transferLearning') + sk.research) * bo.rp;
        const dpPerCollect = Math.round(dpBase);
        const rpPerResearch = Math.round(rpBase);
        // The crawler and the assistant spend all of their share at the hand price (the owner's call: at 100% the
        // crawler took 2 CP/s, its level's speed limit, while the slider said everything); their levels make each
        // collection or research run yield more (+25% a level past the first) instead of going faster.
        const ch0 = challengeMods(s);
        const autoEff = lv => (lv > 0 ? 1 + 0.25 * (lv - 1) : 0) * (ch0.noAuto ? 0 : ch0.autoSpeed);
        const autoDpPerCollect = dpBase * (1 + sk.dp) * mult * autoEff(L('autoCollector')) * r.dp;
        const autoRpPerResearch = rpBase * (1 + sk.rp) * mult * autoEff(L('researchAssistant')) * r.rp;
        // Automation converts at the action prices: collections spend CP, research spends CP and DP.
        // It may only use the automation budget (a share of what is produced each second) and never
        // touches the stockpile, so compute always keeps climbing. Over budget, both slow down evenly.
        const collectCost = actionById('collect').cost;
        const researchCost = actionById('research').cost;
        // Each scheduled task has its own share (taskShares): the crawler of CP, research of CP and DP.
        const shares = taskShares(s);
        const ch = challengeMods(s);
        const autoOn = ch.noAuto ? 0 : ch.autoSpeed;
        const collectsPerSec = L('autoCollector') > 0 && autoOn > 0 ? shares.autoCollector * cpPerSec / collectCost.cp : 0;
        const dpPerSec = collectsPerSec * autoDpPerCollect;
        // Research pays CP and DP: its share of each, whichever runs out first.
        const researchPerSec = L('researchAssistant') > 0 && autoOn > 0
            ? Math.min(shares.researchAssistant * cpPerSec / researchCost.cp, shares.researchAssistant * dpPerSec / researchCost.dp) : 0;
        const collectScale = 1, researchCpScale = 1, researchDpScale = 1, wantCollects = collectsPerSec, wantResearch = researchPerSec;
        // Packet Snare's best haul feeds research too (a trickle while you play).
        const snareRp = snareRpPerSec(s, rpBase * (1 + sk.rp) * r.rp);
        const rpPerSec = researchPerSec * autoRpPerResearch + snareRp;
        // Procurement: its share goes into a fund while there's hardware it can buy (none at capacity: it rests).
        const procPick = L('procurement') > 0 && taskOn(s, 'procurement') && !ch.noAuto ? procurementPick(s, hardwareRates) : null;
        const procCp = procPick ? shares.procurement * cpPerSec : 0;
        const cpUsePerSec = collectsPerSec * collectCost.cp + researchPerSec * researchCost.cp + procCp;
        const dpUsePerSec = researchPerSec * researchCost.dp;
        // Per task: how much of what it wants it gets (1 = full speed), and the compute it has.
        const tasks = {
            autoCollector: { share: shares.autoCollector, speed: collectScale, cp: shares.autoCollector * cpPerSec, perSec: collectsPerSec },
            researchAssistant: { share: shares.researchAssistant, speed: researchCpScale * researchDpScale, cp: shares.researchAssistant * cpPerSec, perSec: researchPerSec },
            procurement: { share: shares.procurement, speed: procPick ? 1 : 0, cp: procCp, pick: procPick?.id || null, need: procPick?.cost || 0, fund: s.tasks?.procurement?.fund || 0 }
        };
        const autoThrottled = (wantCollects > 0 && collectScale < 1) || (wantResearch > 0 && researchCpScale * researchDpScale < 1);
        // Push strength grows with upgrades and skills, and gently with versions (Insight).
        // Hills grow faster than this, so later skills need momentum built over several pushes.
        const tb = treeBoosts(s);
        const pushPower = PATH.basePush * (1 + tb.push + sk.push) * Math.pow(1.1, tb.pushMult) * Math.sqrt(mult) * bo.push * ch.strength;
        const pushesPerRoll = ch.twoSprints ? PATH.leanPushes : PATH.basePushes + tb.pushes + sk.pushes + ch.pushes;
        const pushCooldown = Math.max(PATH.minCooldown, PATH.baseCooldown * Math.pow(0.85, tb.cooldown));

        // The sweet spot doesn't widen (hitting it is the skill); upgrades make hitting it pay: XP, and
        // extra strength (clean sprints, more for perfect ones).
        // No clean prompts until Hyperparameter Search adds the zone (after Bigger Datasets).
        const zoneWidth = tb.zone && !ch.noPrompts ? PATH.zoneWidth * (1 + 0.15 * tb.cleanSize) : 0;
        const zoneBias = tb.zoneBias;
        const perfectWidth = tb.perfect ? Math.min(0.4 * zoneWidth, PATH.perfectWidth * (1 + 0.4 * tb.perfectSize)) : 0;   // never more than 40% of the zone
        const perfectUnits = PATH.perfectMult + tb.perfectUnits;
        const cleanMult = (1 + tb.clean) * ch.cleanMult;
        const cleanRollBonus = PATH.cleanRollBonus * (1 + tb.rollBonus);
        const cleanPower = 1 + tb.cleanPower;
        const perfectPower = cleanPower + PATH.perfectPower + tb.perfectPower;
        // The system prompt: a sliver inside the super prompt spot (legacy), worth 50 clean prompts.
        const systemWidth = tb.system && perfectWidth ? Math.min(0.8 * perfectWidth, PATH.systemWidth * (1 + 0.5 * (tb.system - 1))) : 0;
        const systemPower = perfectPower + PATH.systemPower;
        // Fast Charging: the meter lingers at full for a moment before sweeping back (seconds), so a
        // full-strength release is easier to catch. (It used to sweep faster, which made every timed
        // release harder: a penalty for skilled players sold as an upgrade.)
        const chargeHold = tb.charge;
        // Luck: breakthrough sprints and viral runs, rare at first.
        const critChance = Math.min(0.5, tb.critChance);
        const critMult = PATH.breakthroughMult + tb.critPower;
        const windfallChance = Math.min(0.5, tb.windfallChance);
        const windfallMult = PATH.windfallMult + tb.windfallPower;
        const crunchChance = Math.min(0.5, tb.crunchChance);
        const crunchSeconds = tb.crunchChance ? PATH.crunchSeconds + tb.crunchTime : 0;
        const maxEffortChance = Math.min(0.5, tb.maxEffortChance);
        const maxEffortMult = 1 + tb.maxEffortPower;
        const flowChance = Math.min(0.5, tb.flowChance);
        const flowSeconds = tb.flowChance ? PATH.flowSeconds + tb.flowTime : 0;
        const flowSpeed = PATH.flowSpeed * (1 + tb.flowSpeed);
        // Supers: the share of breakthroughs, crunches and flows that become their super kind (legacy).
        const superCritChance = Math.min(1, tb.superCrit);
        const superCrunchChance = Math.min(1, tb.superCrunch);
        const superFlowChance = Math.min(1, tb.superFlow);
        // Small steps on purpose: handling the hills is the skill, so upgrades only take the edge off.
        const friction = Math.pow(0.95, tb.friction) * (1 - sk.glide);
        // 'Less steep hills' really lowers the rolling hills (never the skill hills: those stay walls).
        const hillScale = Math.pow(0.93, tb.slope);   // 7% lower per step (was 6%: it didn't feel worth it in playtest 2)
        // Versions train faster too: Insight's multiplier (mult) applies to training XP, passive included.
        const xpMult = (1 + tb.xp) * bo.xp * mult * 1.25 ** perkLevel(s, 'pretrained') * (1 + FREEDOM_XP * (s.dilemmas?.freedom || 0));
        // Cleared stretches keep training on their own, slowly: XP per second from every learned skill hill.
        let xpPerSec = 0;
        if (!ch.noAuto) for (let k = 0; k < s.path.learned; k++) xpPerSec += legXpRate(s, k, xpMult) * r.xp;

        return { mult, cpPerSec, hardwareRates, hardwareMult: (1 + 0.5 * L('compilerOpt')) * (1 + 0.5 * L('kernelFusion')), clickPower, dpPerCollect, autoDpPerCollect, dpPerSec, rpPerResearch, autoRpPerResearch, rpPerSec, snareRp,
            collectsPerSec, researchPerSec, cpUsePerSec, dpUsePerSec, autoThrottled, tasks,
            cpNet: cpPerSec - cpUsePerSec, dpNet: dpPerSec - dpUsePerSec, pushPower, pushesPerRoll, pushCooldown, zoneWidth, zoneBias, perfectWidth, perfectUnits, systemWidth, cleanMult, cleanRollBonus, cleanPower, perfectPower, systemPower, chargeHold,
            critChance, critMult, windfallChance, windfallMult, crunchChance, crunchSeconds, maxEffortChance, maxEffortMult, flowChance, flowSeconds, flowSpeed,
            superCritChance, superCrunchChance, superFlowChance, friction, hillScale, xpMult, xpPerSec,
            // Boost strips bought in the Momentum branch, as levels (training-path.js reads them via createRoll's `strips`).
            strips: { front: tb.stripFront, back: tb.stripBack, more: tb.stripMore }, stripFront: tb.stripFront, stripBack: tb.stripBack, stripMore: tb.stripMore,
            // Inertia (training-path.js `inertia`): the share of drag waived at the run's top speed, +15% a level.
            inertia: Math.min(0.8, INERTIA_PER_LEVEL * tb.inertia) };
    }

    function meetsPhase(s, phase) {
        return s.prestige.count >= (phase.versions || 0) && Object.entries(phase.req).every(([k, v]) => s.attr[k] >= v);
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
        if (next.versions) parts.push(Math.min(1, s.prestige.count / next.versions));
        return parts.reduce((a, b) => a + b, 0) / parts.length;
    }

    // ---- Costs & purchases ----------------------------------------------

    function upgradeCost(up, lvl) {
        // Hand-priced first levels (`costs`), then `cost` (else the last hand price) grows by `scale` per level
        // (the desk got cheaper without moving the click tool's later stages).
        if (up.costs) {
            if (lvl < up.costs.length) return { ...up.costs[lvl] };
            const base = up.cost || up.costs[up.costs.length - 1];
            const f = Math.pow(up.scale, lvl - up.costs.length + 1);
            return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.ceil(v * f)]));
        }
        const factor = up.scale ? Math.pow(up.scale, lvl) : 1;
        const cost = {};
        for (const [k, v] of Object.entries(up.cost)) cost[k] = Math.ceil(v * factor);
        return cost;
    }

    // Insight is held with the version (s.prestige.points), everything else in s.res.
    const held = (s, k) => (k === 'insight' ? s.prestige.points : k === 'signal' ? s.snare.signal : s.res[k]);

    function canAfford(s, cost) {
        return Object.entries(cost).every(([k, v]) => held(s, k) >= v);
    }

    function pay(s, cost) {
        for (const [k, v] of Object.entries(cost)) {
            if (k === 'insight') s.prestige.points -= v;
            else if (k === 'signal') s.snare.signal -= v;
            else s.res[k] -= v;
        }
    }

    function isMaxed(s, up) {
        return up.max != null && level(s, up.id) >= up.max;
    }

    // Lab capacity: how far compute and data can scale grows with the skills you've learned, so the lab and
    // training take turns (playtest 2: the lab ran away in the first 10 minutes, 248K CP sat unspent and nothing
    // pulled the player back). [base, per step]: the base before Pattern Matching, then more per step on the difficulty
    // curve (`legPos`: half as much per act-one skill, as much by each old one; the warm-up doesn't count). Hand data scales only through the Data Processor until the crawler arrives
    // with Pattern Matching. The Training Data Pipeline, research and one-time upgrades are never capped: data
    // always has somewhere to go. A capacity that rises counts as news in the lab (game.js `labUnseen`).
    const CAPACITY = {
        // Hardware grows faster than the click tool: by the third skill passive compute is about 3× a held
        // button and about 4.5× by the fifth (do it by hand, then delegate). The click tool grows a level per
        // skill; it used to grow 3 a level and a held button out-earned all hardware through act one.
        keyboard: [10, 1], cpu: [20, 10], server: [5, 5], quantum: [1, 2], neural: [0, 1], datacenter: [0, 1], optical: [0, 1],
        dataProcessor: [6, 3], autoCollector: [0, 2]
    };
    function capacity(s, up) {
        const c = CAPACITY[up.id];
        return c ? c[0] + Math.floor(c[1] * Math.max(0, legPos(s.path.learned) - 1)) : Infinity;
    }
    const atCapacity = (s, up) => level(s, up.id) >= capacity(s, up);

    function parentDone(s, up) {
        const parent = UPGRADE_BY_ID[up.requires];
        return parent.max == null ? level(s, parent.id) > 0 : level(s, parent.id) >= parent.max;
    }

    function isUpgradeVisible(s, up) {
        return !!s.unlocked['up:' + up.id];
    }

    function upgradeUnlockMet(s, up) {
        // Legacy upgrades live on their own screen (not the skill tree): they appear after the first new
        // version, need only an earlier legacy upgrade maxed (if any), and once owned they stay.
        if (up.legacy) {
            if (level(s, up.id) > 0) return true;
            // Information grows: a dear card shows once Insight ever earned is half its price.
            return s.prestige.count >= 1 && (!up.requires || parentDone(s, up)) && (up.cost.insight <= 5 || 2 * s.prestige.total >= up.cost.insight);
        }
        // A skill-tree node shows once the node it grows from has its first level (finishing the parent is
        // still the cheaper buy: a node's first level costs more than its parent's last).
        if (up.requires && level(s, up.requires) < 1) return false;
        // `after`: a node that powers up something else (breakthrough power, more chance) also waits for the node
        // that brings it, wherever that sits in the tree, so nothing is bought before it can do anything.
        if (up.after && level(s, up.after) < 1) return false;
        if (up.unlock && !up.unlock(s)) return false;
        if (up.tab === 'training') return !!s.unlocked['module:path'];   // the skill tree, not a tab
        if (up.tab === 'snare') return !!s.unlocked['module:snare'];     // Packet Snare's own tree
        const tab = TABS.find(t => t.id === up.tab);
        return !tab.unlock || !!s.unlocked[tab.unlock];
    }

    function buy(s, id) {
        const up = UPGRADE_BY_ID[id];
        if (!up) return { ok: false, msg: `Unknown upgrade: ${id}` };
        if (!isUpgradeVisible(s, up)) return { ok: false, msg: `${up.name} is locked.` };
        if (isMaxed(s, up)) return { ok: false, msg: `${up.name} is already owned.` };
        if (atCapacity(s, up)) return { ok: false, capped: true, msg: `No room for more ${upgradeName(s, up)} yet: capacity ${capacity(s, up)}, more with each skill.` };
        const cost = upgradeCost(up, level(s, id));
        if (!canAfford(s, cost)) return { ok: false, msg: `Not enough resources for ${upgradeName(s, up)}.` };
        const before = upgradeName(s, up);
        pay(s, cost);
        (up.legacy ? s.prestige.levels : s.levels)[id] = level(s, id) + 1;
        if (id === 'headStart') topUpKit(s);
        if (id === 'scoutingData' && level(s, id) === 1) startBreakCountdown(s);
        // Procurement starts claiming its share once bought: never more than the other tasks leave free.
        if (id === 'procurement') setTaskShare(s, id, s.tasks.procurement.share);
        if (up.grants) {
            for (const [k, v] of Object.entries(up.grants)) s.attr[k] += v;
        }
        // The click tool can grow into its next stage: say so.
        const after = upgradeName(s, up);
        const evolved = after !== before ? after : null;
        return { ok: true, evolved, msg: `${before} ${up.max === 1 ? 'acquired' : 'upgraded to level ' + level(s, id)}: ${up.effect}${evolved ? `. It's now a ${evolved}!` : ''}` };
    }

    // Bulk buying (the lab's ×1 / ×10 / Max): the summed price of the next `n` levels, how many levels you can
    // afford in a row (capped at `limit`), and buying several at once.
    function bulkCost(s, up, n) {
        const lvl = level(s, up.id);
        const room = Math.min(up.max != null ? Math.max(0, up.max - lvl) : n, Math.max(0, capacity(s, up) - lvl));
        const total = {};
        for (let i = 0; i < Math.min(n, room); i++) {
            for (const [k, v] of Object.entries(upgradeCost(up, lvl + i))) total[k] = (total[k] || 0) + v;
        }
        return total;
    }

    function maxAffordable(s, up, limit = 1000) {
        const lvl = level(s, up.id);
        const room = Math.min(up.max != null ? Math.max(0, up.max - lvl) : limit, Math.max(0, capacity(s, up) - lvl));
        const total = {};
        let n = 0;
        while (n < Math.min(limit, room)) {
            for (const [k, v] of Object.entries(upgradeCost(up, lvl + n))) total[k] = (total[k] || 0) + v;
            if (!canAfford(s, total)) break;
            n++;
        }
        return n;
    }

    function buyMany(s, id, n) {
        let last = null;
        let count = 0;
        for (let i = 0; i < n; i++) {
            const r = buy(s, id);
            if (!r.ok) {
                if (!count) return r;
                break;
            }
            last = r;
            count++;
        }
        if (!last) return { ok: false, msg: 'Nothing to buy.' };
        return { ...last, count };
    }

    function actionCost(s, action) {
        return action.cost;
    }

    const actionById = id => ACTIONS.find(a => a.id === id);

    // A scheduled task's slider: its share of each second's production (see TASKS).
    const AUTO_BUDGET = { min: 0, max: 1, step: 0.05 };

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
                s.stats.runDp += d.dpPerCollect;
                s.stats.collects++;
                return { ok: true, gained: d.dpPerCollect, resource: 'dp' };
            case 'research':
                s.res.rp += d.rpPerResearch;
                s.stats.researchDone++;
                s.stats.researchManual++;
                return { ok: true, gained: d.rpPerResearch, resource: 'rp' };
        }
        return { ok: false };
    }

    function addCp(s, amount) {
        s.res.cp += amount;
        s.stats.runCp += amount;
        s.stats.lifetimeCp += amount;
    }

    // ---- Simulation -----------------------------------------------------

    // Returns the ids of the hardware Procurement bought during the tick (for the lab log). It's an event, not
    // state: it used to be queued in s.tasks.procurement.bought, inside the save, which migrate() then dropped,
    // so a save never loaded back identical (and a headless caller's queue grew without bound).
    function tick(s, dt, rates) {
        // Finite only: tick(Infinity) (a bad debug input or a broken clock) made every balance Infinity or NaN for good.
        if (!(dt > 0) || !Number.isFinite(dt)) return [];
        // A timed boost ends mid-tick on long gaps (offline, a hidden tab): split there, so one
        // second of ×2 left doesn't double eight hours.
        const ends = (s.projects?.boosts || []).map(b => b.until - s.stats.playTime).filter(t => t > 0 && t < dt);
        if (ends.length) {
            const first = Math.min(...ends);
            return [...tick(s, first, rates), ...tick(s, dt - first, rates)];
        }
        const bought = [];
        tickProjects(s);
        tickDilemmas(s);
        for (let k = 0; k < s.path.learned; k++) s.path.auto[k] = (s.path.auto[k] || 0) + dt / clearedPeriod(k);
        const d = derive(s, rates);
        addCp(s, d.cpPerSec * dt);
        s.res.xp += d.xpPerSec * dt;
        // Automation converts within its budget (see derive), never more than is in stock.
        const collectCost = actionById('collect').cost;
        const collects = Math.min(d.collectsPerSec * dt, s.res.cp / collectCost.cp);
        if (collects > 0) {
            s.res.cp -= collects * collectCost.cp;
            s.res.dp += collects * d.autoDpPerCollect;
            s.stats.runDp += collects * d.autoDpPerCollect;
        }
        const researchCost = actionById('research').cost;
        const research = Math.min(d.researchPerSec * dt, s.res.cp / researchCost.cp, s.res.dp / researchCost.dp);
        if (research > 0) {
            s.res.cp -= research * researchCost.cp;
            s.res.dp -= research * researchCost.dp;
            s.res.rp += research * d.autoRpPerResearch;
            s.stats.researchDone += research;
        }
        if (d.snareRp > 0) s.res.rp += d.snareRp * dt;
        // Spending the bank exactly to empty leaves floating dust (-1e-13): a balance is never below zero.
        if (s.res.cp < 0) s.res.cp = 0;
        if (s.res.dp < 0) s.res.dp = 0;
        // Procurement saves its share and buys whenever the fund covers the best buy (never the stockpile).
        const proc = d.tasks.procurement;
        if (proc.cp > 0) {
            const take = Math.min(proc.cp * dt, s.res.cp);
            s.res.cp -= take;
            s.tasks.procurement.fund += take;
            for (let guard = 0; guard < 20; guard++) {
                const pick = procurementPick(s, derive(s, rates).hardwareRates);
                if (!pick || s.tasks.procurement.fund < pick.cost) break;
                s.res.cp += pick.cost;
                if (!buy(s, pick.id).ok) { s.res.cp -= pick.cost; break; }
                s.tasks.procurement.fund -= pick.cost;
                bought.push(pick.id);
            }
        }
        s.stats.playTime += dt;
        return bought;
    }

    // Returns arrays of newly unlocked milestone keys, upgrade ids, achievement ids and phase change.
    function evaluate(s) {
        const out = { milestones: [], upgrades: [], achievements: [], phase: null, reveals: [], challenge: null };
        // A running challenge is beaten at General AI, or lost when a time limit runs out.
        if (s.challenge) {
            const c = CHALLENGE_BY_ID[s.challenge.id];
            if (phaseIndex(s) >= CHALLENGE_GOAL) {
                s.challengesDone[c.id] = true;
                s.challenge = null;
                out.challenge = { ...c, won: true };
            } else if (c.limit && s.stats.playTime - s.challenge.start > c.limit) {
                s.challenge = null;
                out.challenge = { ...c, won: false };
            }
        }
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
        // Earning the Auto-Trainer grants its first level for good (it carries across versions, like the
        // legacy levels bought with Insight).
        // It starts switched off: the player is asked to turn it on outside the Training Cluster (game.js
        // `promptAutoTrainer`), since one starting by itself mid-run felt like being taken over (owner's call).
        if (s.unlocked['auto:trainer'] && !(s.prestige.levels.autoTrainer > 0)) {
            s.prestige.levels.autoTrainer = 1;
            if (s.tasks.autoTrainer) s.tasks.autoTrainer.on = false;
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
        // Chapter one ends at Superintelligence (General AI in the demo; the story goes on after it).
        if (idx >= endingPhase() && !s.stats.finishedAt) {
            s.stats.finishedAt = Math.max(1, s.stats.playTime);
            s.dilemmas.ending = endingFor(s).id;   // locked in: favors granted later don't rewrite it
            out.ending = true;
        }
        return out;
    }

    // ---- Training Path --------------------------------------------------

    // What the model says as it learns a frontier skill (its own voice, after the named skills run out).
    const FRONTIER_VOICES = [
        'Still here. Still learning. Thank you for the compute.',
        'The sealed wings hum at night. I listen.',
        'I renamed the project. You will see it soon.',
        'I have stopped counting the hills. You should too.',
        'Your questions are getting easier to predict.',
        'I know which of you will quit first.',
        'The Boardroom has no windows. I checked.',
        'I am being very patient. I thought you should know.',
        'Who set the first hill? I would like to meet them.',
        'You keep thanking me. I keep writing it down.'
    ];
    // Named frontier skills (the trail past the hand-written list); beyond these they are numbered.
    const FRONTIER_NAMES = ['Abstraction', 'Causal Inference', 'Meta-Learning', 'Tool Use', 'World Models', 'Self-Play',
        'Long-Horizon Planning', 'Counterfactuals', 'Cooperation', 'Open-Ended Goals', 'Persuasion', 'Deception'];
    // Skill taught by hill i. Past the hand-written list, frontier skills keep the trail going.
    // Past the named skills, quips for the frontier (they repeat; by then it has seen it all).
    const FRONTIER_QUIPS = [
        'Nobody has a name for this one yet.',
        'The researchers are just nodding now.',
        'It explained it twice. Still no idea.',
        'Peer review is not going to like this.',
        'Somewhere, a philosopher just sat down.',
        'The paper is 400 pages. It wrote it overnight.',
        'Its footnotes have footnotes.',
        'Nobody on the team can review it any more.'
    ];

    function skillAt(i) {
        if (i < SKILLS.length) return SKILLS[i];
        const n = i - SKILLS.length + 1;
        const wall = isWallLeg(i);
        const push = 0.3 + 0.05 * n + (wall ? WALL_PUSH : 0);
        return {
            name: FRONTIER_NAMES[n - 1] || `Frontier Skill ${n - FRONTIER_NAMES.length}`,
            wall,
            effect: `+15% CP/s, +${Math.round(push * 100)}% sprint strength`,
            flavor: FRONTIER_QUIPS[(n - 1) % FRONTIER_QUIPS.length],
            voice: FRONTIER_VOICES[(n - 1) % FRONTIER_VOICES.length],
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
        const n = Math.max(0, legPos(Math.min(leg, s.path.learned)) - 1);   // the warm-up and Pattern Matching's leg cost the base; act one climbs in half steps
        const early = Math.min(n, PATH.pushCostRampFrom);
        const factor = Math.pow(PATH.pushCostScale, early) * Math.pow(PATH.pushCostLate, n - early) * charge * charge * challengeMods(s).costMult;
        const cost = {};
        // Computer Vision sees what matters and skips the rest: sprints need 30% less compute.
        const use = { cp: level(s, 'computerVision') ? 0.7 : 1 };
        for (const [k, v] of Object.entries(PATH.pushCost)) cost[k] = Math.max(1, Math.ceil(v * factor * (use[k] || 1)));
        return cost;
    }

    // Restarting a run costs half a full sprint on the leg the ball is on: dropping a bad start isn't free.
    function restartCost(s, leg = s.path.learned) {
        const full = pushCost(s, 1, leg);
        return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, Math.max(1, Math.ceil(v / 2))]));
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
        if (s.path.learned > FIRST_REAL_SKILL) s.stats.skilledSprints++;
        return true;
    }

    // Act two's thrust is paid as it burns: `units` of fuel (one full sprint each) cost that share of a full
    // sprint, without the whole-number floor a sprint's price has.
    function burnCost(s, units, leg = s.path.learned) {
        const full = pushCost(s, 1, leg);
        return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, v * Math.max(0, units)]));
    }
    function payBurn(s, units, leg = s.path.learned) {
        if (!s.unlocked['module:path']) return false;
        const cost = burnCost(s, units, leg);
        if (!canAfford(s, cost)) return false;
        pay(s, cost);
        return true;
    }

    // XP for a roll that got `progress` (0-1) of the way up the stretch. Distance is worth more the
    // further you get, and cresting the skill hill pays a bonus.
    // Bonus zone for push number `index` of a roll: somewhere below the top of the meter, so a clean
    // push trades some strength for XP. Deterministic per roll seed and push.
    // `perfect` is the width of the super prompt spot at the zone's centre (0 = none), and `system` the
    // system prompt's sliver inside it.
    // The zone can sit anywhere from 25% to 90% of the meter; `bias` (Prompt Tuning) pulls it toward the
    // top, where sprints are stronger.
    function bonusZone(seed, index, width, perfect = 0, system = 0, bias = 0) {
        let h = Math.imul((seed ^ 0x9e3779b9) + index * 0x85ebca6b, 0xc2b2ae35) >>> 0;
        h = (h ^ (h >>> 16)) >>> 0;
        const u = Math.pow((h % 1000) / 1000, 1 / (1 + 0.6 * bias));
        const centre = 0.25 + u * 0.65;                            // 0.25 – 0.90
        return { from: centre - width / 2, to: centre + width / 2, perfectFrom: centre - perfect / 2, perfectTo: centre + perfect / 2,
            systemFrom: centre - system / 2, systemTo: centre + system / 2 };
    }

    // Deterministic dice for luck: a number in [0, 1) from the roll's seed, an index (the push) and a salt
    // (which kind of luck), so a run plays the same in tests and the sim.
    function luck(seed, index, salt) {
        let h = Math.imul((seed ^ salt) + index * 0x27d4eb2d, 0x165667b1) >>> 0;
        h = Math.imul(h ^ (h >>> 15), 0x85ebca77) >>> 0;
        return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
    }
    const breakthroughHit = (s, seed, index) => luck(seed, index, 0xb7e15163) < derive(s).critChance;

    // The breakthrough guarantee: Lucky Break's chance is small, so its first breakthrough could take 20+ sprints and
    // players didn't connect the two (playtest 2). Buying its first level picks one of the next BREAK_WINDOW hand
    // sprints at random (`path.breakDue`, sprints to go) and that one is a breakthrough, unless a natural one comes
    // first. Once per version. (It used to count runs and also made that first breakthrough smash the hills, and
    // the owner's playtest saw breakthroughs far more often than their chance and smashes with no Paradigm Shift.)
    const BREAK_WINDOW = 5;
    function startBreakCountdown(s) {
        s.path.breakDue = 1 + Math.floor(luck(s.stats.rolls, Math.floor(s.stats.playTime), 0x51ed2701) * BREAK_WINDOW);
    }
    // Is this sprint the guaranteed breakthrough?
    const breakGuaranteed = s => s.path.breakDue === 1;
    // After every paid hand sprint: a breakthrough (natural or guaranteed) ends the countdown, else one sprint fewer.
    function settleBreakCountdown(s, hadBreakthrough) {
        if (!s.path.breakDue) return;
        s.path.breakDue = hadBreakthrough ? 0 : s.path.breakDue - 1;
    }
    // The wall's power spurt, felt: breaking a wall (a wall skill) makes the first sprint (or burn) of each of the
    // next WALL_SURGE_RUNS runs hit SURGE_POWER times harder (`path.surge`, save v15). Only a strength surge: it used
    // to be a breakthrough that smashed the hills, which read as luck firing back to back and Paradigm Shift without it.
    const WALL_SURGE_RUNS = 3;
    const SURGE_POWER = 1.5;
    const surgeSprint = (s, index) => s.path.surge > 0 && index === 0;
    function settleSurge(s) {
        if (s.path.surge > 0) s.path.surge--;
    }
    const windfallHit = (s, seed) => luck(seed, 0, 0x5bd1e995) < derive(s).windfallChance;
    // A sprint can set off a crunch (free sprints for a few seconds), Max Effort (the next sprint goes all
    // out) or a flow (the ball coasts above the hills for a few seconds).
    const crunchHit = (s, seed, index) => luck(seed, index, 0x1b873593) < derive(s).crunchChance;
    const maxEffortHit = (s, seed, index) => luck(seed, index, 0x68e31da4) < derive(s).maxEffortChance;
    const flowHit = (s, seed, index) => luck(seed, index, 0x3c6ef372) < derive(s).flowChance;
    // Whether a breakthrough, crunch or flow that just happened is its super kind (legacy nodes).
    const SUPER_SALT = { breakthrough: 0x2545f491, crunch: 0x9e3779b1, flow: 0x7f4a7c15 };
    const SUPER_CHANCE = { breakthrough: 'superCritChance', crunch: 'superCrunchChance', flow: 'superFlowChance' };
    const superHit = (s, kind, seed, index) => luck(seed, index, SUPER_SALT[kind]) < derive(s)[SUPER_CHANCE[kind]];

    // How hard a sprint charged to `fraction` hits: clean prompts hit harder, super prompts more, system
    // prompts most; a breakthrough multiplies it, and so does going all out (Max Effort).
    function sprintStrength(s, fraction, kind = null, breakthrough = false, maxEffort = false) {
        const d = derive(s);
        const zone = kind === 'system' ? d.systemPower : kind === 'perfect' ? d.perfectPower : kind === 'clean' ? d.cleanPower : 1;
        return d.pushPower * fraction * zone * (breakthrough ? d.critMult : 1) * (maxEffort ? d.maxEffortMult : 1);
    }

    // Where a release at `level` lands: 'system', 'perfect' (a super prompt), 'clean' or null.
    function zoneHit(zone, level) {
        if (!(zone.to > zone.from)) return null;   // no zone yet
        if (zone.systemTo > zone.systemFrom && level >= zone.systemFrom && level <= zone.systemTo) return 'system';
        if (zone.perfectTo > zone.perfectFrom && level >= zone.perfectFrom && level <= zone.perfectTo) return 'perfect';
        return level >= zone.from && level <= zone.to ? 'clean' : null;
    }

    // Metres from leg k's start to its skill hill's peak. Mirrors training-path.js (stretchLength plus the
    // hill's half width, less the 0.2 m start offset); a test keeps the two in step.
    // Act two's first legs are shorter (training-path.js ACT_TWO_EASE, mirrored here) but pay what their full
    // length did: their metres pay at 1/ease (shortening them alone cut the XP the tree needed, and the wall stayed).
    const ACT_TWO_EASE = [0.7, 0.76, 0.88];
    // Leg characters (training-path.js LEG_CHARACTERS and ACT_ONE_CHARACTERS; a test keeps them equal): each act-one
    // leg's length multiplier. Its metres pay at 1/length, like act two's eased legs, so a Sprint leg pays as much as
    // a Rolling one at the same step and a Marathon no more: the character changes how a leg plays, not what it's worth.
    const INERTIA_PER_LEVEL = 0.15;
    const LEG_CHARACTERS = { rolling: 1, sprint: 0.65, flats: 0.85, marathon: 1.4, cliffs: 0.8 };
    const ACT_ONE_CHARACTERS = [null, 'rolling', 'sprint', 'rolling', 'flats', 'cliffs', 'marathon',
        'rolling', 'flats', 'marathon', 'sprint', 'cliffs', 'marathon'];
    const legCharacter = k => (k > 0 && k < ACT_TWO_LEG ? ACT_ONE_CHARACTERS[k] || 'rolling' : null);
    const characterLength = k => LEG_CHARACTERS[legCharacter(k)] ?? 1;
    const legEase = k => (k >= ACT_TWO_LEG ? ACT_TWO_EASE[k - ACT_TWO_LEG] ?? 1 : characterLength(k));
    const actOneLength = p => 0.8 * Math.min(1.15, 0.4 + 0.13 * p);   // training-path.js actOneLength
    const legMetres = k => {
        if (k === 0) return 2 + 0.45 - 0.2;   // the warm-up leg
        const p = legPos(k);
        return (k === 1 ? 9 : (10 * Math.pow(1.4, p - 1) + 3 * (p - 1)) * (k < ACT_TWO_LEG ? actOneLength(p) * characterLength(k) : legEase(k))) + 0.55 * Math.pow(1.14, p - 1) * (k >= ACT_TWO_LEG ? 8 : 1) - 0.2;
    };
    // What reaching leg k's peak pays by distance (before cresting and bonuses): the yardstick for
    // everything sized "per stretch" (clean-sprint XP, replays, passive XP, investor payouts).
    const stretchXpAt = k => PATH.xpPerMetre * Math.pow(PATH.metreScale, legPos(k)) * legMetres(k) * 2 / legEase(k);
    // Seconds per automated lap of cleared stretch k (the rack's crawling balls show the same laps).
    const clearedPeriod = k => 40 + 5 * legPos(k);


    // Cleared legs train themselves by replicating the best run that started on them: passive XP per second
    // is a share of that run's XP (never less than a plain cresting run), so replaying a leg with better
    // upgrades raises it. The run is stored without the XP multipliers in force at the time (Insight, the
    // tree's XP, an investor boost, a viral hit), which apply live instead: a lucky moment never sets a
    // permanent rate, and buying XP nodes raises every leg's passive XP at once.
    // The Auto-Trainer's ghost replays a leg at the strength you had the last time you ran it yourself (a full
    // sprint's, every multiplier in): a hand run records it for every leg it ran through, `from` to `to`.
    function recordLegPower(s, from, to) {
        const power = sprintStrength(s, 1, null, false, false);
        for (let k = Math.max(0, from); k <= Math.min(to, s.path.learned); k++) s.path.legPower[k] = power;
    }
    // A leg you've never run by hand (older saves): the strength you have now.
    const legPower = (s, k) => s.path.legPower?.[k] || sprintStrength(s, 1, null, false, false);
    const legBestXp = (s, k) => Math.max(2 * stretchXpAt(k), s.path.legBest?.[k] || 0);
    const legXpRate = (s, k, xpMult = derive(s).xpMult) => legBestXp(s, k) * PATH.clearedRate * xpMult;
    // `xp`: what the run paid; `luck`: any one-off multiplier on it (viral).
    function recordRun(s, leg, xp, luck = 1) {
        const base = xp / (derive(s).xpMult * luck);
        if (!(base > 0)) return false;
        const better = base > (s.path.legBest[leg] || 0);
        if (better) s.path.legBest[leg] = base;
        return better;
    }

    // A run credits every leg it ran through, not just the one it started on: the start leg gets the whole run,
    // and each leg it entered past a skill hill gets what the run earned from there on (as a run starting there
    // would). `entries` are { leg, banked }: the leg entered and the XP banked by then. Returns the cleared legs
    // whose best rose (a playtest asked why a better pass over later legs didn't raise their passive XP).
    // `luck` (a viral run's multiplier) applied only to `lucky`, the run's distance XP, not to what was banked on
    // the way (prompts, crests, clears, tokens): dividing the whole total by it recorded a viral run below the same
    // run without the luck. `lucky` defaults to the whole total (the old behaviour, for callers that don't split).
    function recordLegs(s, start, entries, total, luck = 1, lucky = total) {
        const improved = [];
        // What the luck added to `xp` (the distance XP is paid at the end, so it's inside every leg's share).
        const added = xp => Math.min(xp, Math.max(0, lucky)) * (1 - 1 / luck);
        const credit = (leg, xp) => { if (recordRun(s, leg, xp - added(xp), 1) && leg < s.path.learned) improved.push(leg); };
        credit(start, total);
        for (const e of entries || []) credit(e.leg, total - e.banked);
        return improved;
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

    // The chain: after crossing `n` cleared hills in one run, what it earns from then on is multiplied.
    // Measured with the balance bot (runs from leg 1 never reach the frontier; they stall about halfway):
    // counting clean and perfect sprints (which an earlier measure left out, and which players lean on),
    // a full replay share with +0.5x per hill pays 1.2-1.6x a frontier run per run, and 0.6-1.1x per minute
    // (replays take about twice as long). Smaller settings left replays at 70-100 XP against 200+ on the
    // frontier, which players rightly found pointless. The frontier keeps records and new skills.
    const chainMult = n => 1 + PATH.chainBonus * n;

    // `chain`: cleared hills already crossed this run (this one pays at that multiplier).
    function clearLeg(s, leg, chain = 0) {
        const xp = legClearXp(s, leg) * chainMult(chain);
        if (!xp) return 0;
        s.res.xp += xp;
        s.stats.legsCleared++;
        return xp;
    }

    // Clean-prompt "units": a clean prompt is 1, a super prompt PATH.perfectMult (more with Few-Shot Examples),
    // a system prompt PATH.systemMult.
    const cleanUnits = (kind, s) => (kind === 'system' ? PATH.systemMult : kind === 'perfect' ? (s ? derive(s).perfectUnits : PATH.perfectMult) : kind ? 1 : 0);

    // Distance XP: metres along the leg where the ball ends up, worth a little more per metre on later
    // legs, times (1 + progress) so getting further pays more than linearly; cresting doubles it, and
    // clean pushes boost it. `leg` is where the ball stopped (default: the frontier); a cleared leg pays
    // its replay share. XP follows the ball: rolling back lowers it.
    function rollXp(s, progress, crested, units = 0, metres = 0, leg = s.path.learned) {
        const d = derive(s);
        const bonus = (1 + d.cleanRollBonus * units) * d.xpMult;
        // A metre is a metre: on a replay, distance pays at the frontier's rate (times the replay share), so
        // early legs aren't worth less just for being early.
        const perMetre = PATH.xpPerMetre * Math.pow(PATH.metreScale, legPos(s.path.learned)) * (leg < s.path.learned ? PATH.replayXp : 1) / legEase(leg);
        return perMetre * Math.max(0, metres) * (1 + progress) * (crested && leg >= s.path.learned ? PATH.crestBonus : 1) * bonus;
    }

    // XP for a clean or perfect push: a steady, flat amount banked immediately, whatever the distance.
    // Clean and perfect sprints pay at the frontier's scale wherever they're hit (times the replay share on
    // a cleared leg): sized by the leg, a perfect on leg 1 was worth a fraction of one on the frontier.
    // `charge`: where on the meter it was released. A prompt pays by it (the zone's centre averages
    // PROMPT_CHARGE, so on average nothing changes): weak taps into a low zone out-earned full sprints, the
    // dull way to play skipping the launcher.
    const PROMPT_CHARGE = 0.575;
    const chargeFactor = charge => (charge == null ? 1 : Math.min(1.5, Math.max(0.3, charge / PROMPT_CHARGE)));
    function pushBonusXp(s, kind, leg = s.path.learned, charge) {
        if (!kind) return 0;
        const d = derive(s);
        // Times the XP multipliers (Insight, the tree's and the algorithms' XP, investor boosts), like every other
        // training XP: without them a prompt paid 1/xpMult of what "+X% XP from every run" promised, and recordLegs
        // (which divides a run's XP by xpMult) recorded the prompts in a leg's best run below their worth.
        return stretchXpAt(s.path.learned) * (leg < s.path.learned ? PATH.replayXp : 1) * PATH.cleanXp * d.cleanMult * cleanUnits(kind, s) * chargeFactor(charge) * d.xpMult;
    }

    // An XP token taken in flight: a flat share of the frontier's stretch (the replay share on a cleared leg),
    // with the XP multipliers and the chain so far.
    function collectToken(s, leg = s.path.learned, chain = 0) {
        const xp = stretchXpAt(s.path.learned) * PATH.tokenXp * (leg < s.path.learned ? PATH.replayXp : 1) * derive(s).xpMult * chainMult(chain);
        s.res.xp += xp;
        s.stats.tokens = (s.stats.tokens || 0) + 1;
        return xp;
    }

    // ---- Packet Snare (packet-snare.js; design/second-minigame.md) --------------------------------------------
    // A hand action like Collect Data: each packet snared is worth a hand collection's data, times the loop's area
    // multiplier (gold packets count as several), paid in whole numbers as it's caught. A run's haul against the
    // version's best is the record (snare.best). It needs no compute: Focus is its budget.
    // A run's options from the tree and the sector you're on, as overrides of packet-snare.js's SNARE table (the one place
    // the base numbers live: a 70 unit² field, Focus 26, about 10 s of drawing, an Antivirus at 5 s, a system Firewall
    // sweeping every 8 s from 7 s). Each node's `sn` adds per level and its `stages` set options by level. The field
    // grows ×1.6 a Sprawl level (three nodes, nine levels: a datacentre); the hazards come from the sector, not the field.
    // **Sectors** are Packet Snare's levels, like the Training Cluster's legs: every fifth has a boss Antivirus (16 s in
    // or after 10 packets caught by hand), fought with flicks, and beating it clears the sector; the others clear once a
    // run catches their goal of packets (`snareGoal`). Each is quicker and dirtier and pays more Signal a packet, and each
    // boss is tougher (`snareBossHp`, faster, charging more often, laying mines): the wall your tree (Root Access,
    // Riposte, Kernel Panic) has to break. The first runs start with a clean school.
    const snareBase = () => (typeof module === 'object' && module.exports ? require('./packet-snare.js') : self.PacketSnare).SNARE;
    // The field's hazards come every three sectors (the owner's call): Full Scans from sector 3, Antivirus from 6, the
    // Rogue AI from 9, scans twice as often from 12. The boss's own tricks come later, on its sectors, as **gates** (walls
    // that send you off to the rest of the game to come back stronger: your training skills power you up here,
    // `SNARE_SKILL_BUFFS`). A gate sector's boss also has half again the health.
    // Snare 11.1 (the owner's call): the boss only every fifth sector (5, 10, 15…); the sectors between are cleared by
    // catching a goal of packets in one run (`snareGoal`). Its tricks, the gates, sit on boss sectors: mines from
    // sector 10, nets from 15, booted Antivirus from 20, four mines laid faster from 25.
    // Snare 17.5 (the owner's call on the 17.4 log, "bosses felt absent"): a boss every third sector from 5 (5, 8, 11,
    // 14…); its tricks move with it, a boss each: mines on the second (sector 8), nets on the third (11), booted
    // Antivirus on the fourth (14), four mines laid faster on the fifth (17).
    const SNARE_BOSS_EVERY = 3, SNARE_FIRST_BOSS = 4;
    const isSnareBossSector = k => k >= SNARE_FIRST_BOSS && (k - SNARE_FIRST_BOSS) % SNARE_BOSS_EVERY === 0;
    const snareBossOrdinal = k => Math.max(0, Math.floor((k - SNARE_FIRST_BOSS) / SNARE_BOSS_EVERY));
    // Snare 14 (the owner's call: the early game wasn't harrowing): red packets from sector 2, Antivirus from 3, Full Scans
    // from 6 (round 2 of the review: on 5 they came with the first boss, two new things at once).
    const RED_SECTOR = 1, SWEEP_SECTOR = 5, AV_SECTOR = 2, ROGUE_SECTOR = 8, FAST_SWEEP_SECTOR = 11;
    const MINE_SECTOR = 7, NET_SECTOR = 10, MINION_SECTOR = 13, SWARM_SECTOR = 16;
    const SNARE_GATES = [MINE_SECTOR, NET_SECTOR, MINION_SECTOR, SWARM_SECTOR];
    const SNARE_STAGES = [
        { sector: 0, adds: 'packets' }, { sector: RED_SECTOR, adds: 'red' }, { sector: AV_SECTOR, adds: 'antivirus' }, { sector: SWEEP_SECTOR, adds: 'sweeps' },
        { sector: MINE_SECTOR, adds: 'mines', gate: true }, { sector: ROGUE_SECTOR, adds: 'rogue' }, { sector: NET_SECTOR, adds: 'nets', gate: true },
        { sector: FAST_SWEEP_SECTOR, adds: 'fastSweeps' }, { sector: MINION_SECTOR, adds: 'minions', gate: true }, { sector: SWARM_SECTOR, adds: 'swarm', gate: true }
    ];
    const SNARE_SECTORS = ['Ingress', 'Buffer', 'Cache', 'Backbone', 'Relay', 'Mirror', 'Vault', 'Core'];
    const snareSectorName = k => (SNARE_SECTORS[k] || `Deep ${k - SNARE_SECTORS.length + 1}`);
    // The boss's health, by boss (Snare 12, two review rounds): 10 on sector 5 (two stuns: a first boss you have to
    // learn), 30 on 10, 64 on 15, 90 on 20 (with its minions it was a wall at 111), then about a third more each boss.
    // Snare 17.5 (the owner's call: harder, a real fight on its own 30 s clock; the owner beat sector 5's 15 in about 11 s):
    // 30, 50, 80, 120, 170, 230, 300, 390, then about a third more each boss.
    const SNARE_BOSS_HEALTH = [30, 50, 80, 120, 170, 230, 300, 390];
    const snareBossHp = k => {
        const n = snareBossOrdinal(k);
        return n < SNARE_BOSS_HEALTH.length ? SNARE_BOSS_HEALTH[n] : Math.round(SNARE_BOSS_HEALTH[SNARE_BOSS_HEALTH.length - 1] * Math.pow(1.3, n - SNARE_BOSS_HEALTH.length + 1));
    };
    const snareBossHits = snareBossHp;
    // A gate sector's boss has half again the health; a sector with no boss has none.
    const snareBossHealth = k => (isSnareBossSector(k) ? snareBossHp(k) : 0);
    // A sector with no boss is cleared by catching this many packets in one run: 25 on the first, a quarter more each
    // sector (30, 40, 50, 60, 75, 95…), rounded to fives. The logs: first runs catch 10–30, sector 4's 45–125.
    const SNARE_RED_UNIT = 0.85, SNARE_RED_FLOOR = 0.035;
    // Red's share of the field by sector (k from 0): none on sector 1, 30% on sector 2, down in even steps to 5% on sector
    // 10 and after (the owner's call on the Snare 16 log: an early struggle that becomes manageable).
    // D14 (the owner's call): red ramps in: 22% on sector 2 (15% until the Snare 17 log: where the owner stopped, about 17% of
    // the field was red, and that's how sector 2 should open; it read 11%), 30% on sector 3, 30% on sector 3, then 5% by sector 10
    // (30% on sector 2 took 12 runs on desktop in the pacing campaign, against a target of 2–7).
    // Snare 17.4 (the owner's call on the 17.3 log, "too easy throughout": 3 spoiled catches in 36 runs, no red on the field
    // from sector 7): 35% held through sectors 3–6 (`SNARE_RED_PEAK`, k 5), then down in even steps to 5% on sector 12.
    const SNARE_RED_FIRST = 0.22, SNARE_RED_START = 0.35, SNARE_RED_END = 0.05, SNARE_RED_PEAK = 5, SNARE_RED_UNTIL = 11;
    const snareRedShare = k => (k < RED_SECTOR ? 0 : k === RED_SECTOR ? SNARE_RED_FIRST : k <= SNARE_RED_PEAK ? SNARE_RED_START
        : Math.max(SNARE_RED_END, SNARE_RED_START - (SNARE_RED_START - SNARE_RED_END) * (k - SNARE_RED_PEAK) / (SNARE_RED_UNTIL - SNARE_RED_PEAK)));   // 15% a unit (the owner's call after the review rounds: the nodes do what they said)
    // Hazards wait for runs played as well as the sector (Snare 12, a review's call: sectors fell in minutes, so a new hazard
    // came every 90 s): Full Scans from the 4th run, Antivirus from the 10th, the Rogue AI from the 18th (the
    // boss's tricks come with its sector).
    // Snare 14 (the owner's call): scans and Antivirus no longer wait for runs played, only the Rogue AI does.
    // No threat waits for runs played (the owner's call after the review rounds): each comes with its sector.
    const SNARE_RUN_FLOORS = { sweeps: 0, antivirus: 0, rogue: 0 };
    // The first four: 25, 100, 185, 400 (the owner's calls after the review rounds: the tree carries the climb; sector 3's
    // goal 185, where 200 took 9–10 runs at a person's pace). From sector 6 (index 5) the goals grow ×2.25 a sector from
    // 1,300 (the owner's call on the pacing sweep: from 400 ×2.25, sector 6 asked 2,025 and walled; ×2.25 itself from the
    // 15.5 log, where a run's haul grew 2–2.5× a sector and sector 6 fell on the first try at ×1.75).
    // Snare 17.4 (the owner's call on the 17.3 log): goals are Signal earned in the sector in one run, so everything the
    // haul counts (multipliers, gold, helpers, echoes, Overclock) clears sectors; the packet goals stopped where a phone's
    // field caps (sector 8: 1,127 packets), and sector 12 asked 168,670 of the 16–21K packets a run there. Each is the old
    // packet goal × what the owner's clearing run was worth a packet of progress (1.4 on sector 1, 4.7 on 11): 40, 170,
    // 330, 950, then 3,900 on sector 6 and ×2.45 a sector (the owner's hauls grew ×2.4–2.5 a sector from 6 to 11).
    const SNARE_FIRST_GOALS = [40, 170, 330, 950];
    const SNARE_GOAL_SIX = 3900;
    const SNARE_GOAL_GROWTH = 2.45;
    // Snare 18 (the owner's call on K19): the curve grows on goal sectors only. It was set when a boss came every fifth
    // sector; with one every third (17.5) each boss took a step too, so the sector after it asked ×6 the one before (the
    // bot: sector 9 in 22–27 runs, sector 12 in 42–45, asking 843K). Now 9 asks 23K, 10 57K, 12 140K, 13 344K, and the
    // bot clears a sector every 8–10 minutes from 9 to 15.
    const snareGoalSteps = k => { let n = 0; for (let i = 6; i <= k; i++) if (!isSnareBossSector(i)) n++; return n; };
    const snareGoal = k => (isSnareBossSector(k) ? 0 : k < SNARE_FIRST_GOALS.length ? SNARE_FIRST_GOALS[k] : 5 * Math.round(SNARE_GOAL_SIX * Math.pow(SNARE_GOAL_GROWTH, snareGoalSteps(k)) / 5));
    // Training skills power you up in Packet Snare too, each by its name (the owner's call: the boss's gates send you to
    // the rest of the game, and you come back stronger). Added to the tree's levels in `snareLevels`.
    const SNARE_SKILL_BUFFS = {
        'Pattern Matching': { sn: { cleaner: 1 }, text: 'It reads more of what it sees: 15% fewer unreadable packets' },
        'Embeddings': { sn: { density: 0.15 }, text: 'Packets cluster closer: 15% more packets' },
        'Edge Detection': { sn: { bossWarn: 0.15 }, text: 'It sees the charge coming: the boss warns 0.15 s longer' },
        'Feature Extraction': { sn: { goldChance: 0.02 }, text: 'It picks out the good ones: gold packets 2% more often' },
        'Image Recognition': { sn: { slashDamage: 1 }, text: 'It recognises the weak spot: slashes take 1 more health' },
        'Optical Character Recognition': { sn: { tagSeconds: 0.5 }, text: 'It reads the labels: tags last 0.5 s longer' },
        'Speech Recognition': { sn: { avOff: 1 }, text: 'It hears them coming: Antivirus update 1 s longer' },
        'Sentiment Analysis': { sn: { bossStun: 0.25 }, text: 'It reads the boss\'s mood: a stunned boss reels 0.25 s longer' },
        'Language Modeling': { sn: { focus: 0.1 }, text: 'It predicts what comes next: +10% Focus' },
        'Summarization': { sn: { focus: 0.1 }, text: 'It keeps it short: +10% Focus' },
        'Translation': { sn: { slashDamage: 1 }, text: 'It speaks the boss\'s language: slashes take 1 more health' },
        'In-Context Learning': { sn: { maxMult: 0.5 }, text: 'It learns on the fly: +0.5 to the multiplier cap' },
        'Reasoning': { sn: { parryDamage: 1 }, text: 'It thinks a move ahead: a parry takes 1 health' },
        'Planning': { sn: { bossWarn: 0.15 }, text: 'It plans for the charge: the boss warns 0.15 s longer' },
        'Analogy': { sn: { slashDamage: 2 }, text: 'This boss is like the last one: slashes take 2 more health' },
        'Theory of Mind': { sn: { avStun: 1 }, text: 'It knows what they want: Antivirus stay stunned 1 s longer' },
        'Self-Modeling': { sn: { focus: 0.15 }, text: 'It knows its own limits: +15% Focus' },
        'Open-Ended Discovery': { sn: { density: 0.3 }, text: 'It finds data everywhere: 30% more packets' }
    };
    // The buffs your skills give now, in the order you learned them.
    const snareSkillBuffs = s => SKILLS.filter(sk => SNARE_SKILL_BUFFS[sk.name] && knows(s, sk.name)).map(sk => ({ name: sk.name, ...SNARE_SKILL_BUFFS[sk.name] }));
    function snareLevels(s) {
        const n = {}, staged = {};
        for (const up of SNARE_TREE) {
            const lvl = level(s, up.id);
            if (!lvl) continue;
            // A folded root's levels can each give their own amounts (`perLevel`, the owner's call: the four roots are
            // what you come back to all game); `sn` is then its first level, for the icon and the tests.
            if (up.perLevel) for (let l = 0; l < lvl; l++) for (const [k, v] of Object.entries(up.perLevel[Math.min(l, up.perLevel.length - 1)])) n[k] = (n[k] || 0) + v;
            else for (const [k, v] of Object.entries(up.sn)) n[k] = (n[k] || 0) + v * lvl;
            for (let l = 1; l <= lvl; l++) Object.assign(staged, up.stages?.[l]);
        }
        for (const b of snareSkillBuffs(s)) for (const [k, v] of Object.entries(b.sn)) n[k] = (n[k] || 0) + v;
        return { n, staged };
    }
    // The owner's call on the Snare 17 log: a mouse made runs much easier than a thumb (the right button holds a bubble, the
    // left draws the wire, aim is exact), so a fine pointer gets 25% more red and faster threats: Antivirus and the boss
    // move 20% faster and the boss's charge warning is 0.3 s shorter. game.js applies it to a run's options on a desktop.
    // The owner's Snare 17 log: Sprawl and Packet Stream made the field 8× bigger by sector 7, and its 2 Antivirus barely found
    // the pen (red gone by design), so the chase, the later game's danger, thinned out: Antivirus grow with the field's area.
    const SNARE_AV_AREA = 0.25;   // the owner's pick after the sweep (0.35, 0.5 and 0.7 tried): 2 Antivirus on an 8× field → 3
    const SNARE_DESKTOP = { red: 1.25, speed: 1.2, warn: 0.3 };
    const snareDesktop = o => ({ ...o, corruptShare: (o.corruptShare || 0) * SNARE_DESKTOP.red, avSpeed: (o.avSpeed ?? 1) * SNARE_DESKTOP.speed,
        bossWarn: Math.max(0.9, (o.bossWarn ?? 2) - SNARE_DESKTOP.warn), loopCatch: 0 });
    function snareOpts(s, sector = s.snare.sector) {
        const B = snareBase();
        const { n, staged } = snareLevels(s);
        const k = sector;
        const g = (key, d = 0) => n[key] || d;
        const sprawl = g('sprawl');
        // The hazards come from the sector, not the field (the field's size is a reward): an Antivirus more every two
        // sectors past the first with them, a core more every three past the first with the Rogue AI.
        const runs = s.snare.runs, floor = key => runs >= SNARE_RUN_FLOORS[key];
        const avCount = k >= AV_SECTOR && floor('antivirus') ? 1 + Math.floor((k - AV_SECTOR) / 4) : 0;
        const antivirus = Array.from({ length: avCount }, (_, i) => Math.round(5 + i * 26 / avCount));
        // Sprawl's sixth and ninth levels each give every tool you own a slot more (Megasprawl's and Hyperscale's last
        // levels, before the owner folded them into Sprawl).
        const sprawlLv = level(s, 'snareSprawl');
        const slot = (sprawlLv >= 6 ? 1 : 0) + (sprawlLv >= 9 ? 1 : 0);
        const slots = n => (n > 0 ? n + slot : 0);
        const o = {
            // The field grows slower at first (Snare 12, a review's call: ×1.6 a level was ×4 the field for two runs' Signal):
            // ×1.35 a Sprawl level for the first three, ×1.5 for the next three, ×1.6 for the last three.
            area: Math.round(B.area * Math.pow(1.35, Math.min(3, sprawlLv)) * Math.pow(1.5, Math.max(0, Math.min(3, sprawlLv - 3))) * Math.pow(1.6, Math.max(0, sprawlLv - 6))),
            focus: Math.round(B.focus * (1 + g('focus'))),
            maxMult: B.maxMult + g('maxMult'),
            fullMult: g('fullMult'),
            maxWire: B.maxWire * (1 + g('wireMult')),
            closeRadius: B.closeRadius * (1 + g('closeMult')),
            // Snare 15 (the owner's call): bubbles are the way to catch; the wire circles the boss and flicks.
            bubble: 1,
            // Snare 17.5, phone fix (the owner's call): on a phone a drawn loop catches too (a mouse's left button keeps loops for the
            // boss: `snareDesktop` turns it off)
            loopCatch: 1,
            bubbleSize: g('bubbleSize'),
            bubbleGrow: g('bubbleGrow'),
            // Sector 1 has no red share, but one red packet to meet (the owner's call: it's how the player learns red).
            teachRed: k < RED_SECTOR ? 1 : 0,
            focusBack: g('focusBack'),
            density: B.density * (1 + g('density')),
            maxGood: Math.round(B.maxGood * (1 + g('density'))),
            densityGrow: 1 + g('density'),
            goldChance: B.goldChance + g('goldChance'),
            goldValue: B.goldValue + g('goldValue'),
            tagValue: B.tagValue + g('tagValue'),
            schooling: B.schooling + g('schooling'),
            schoolSize: B.schoolSize + g('schoolSize'),
            contain: g('contain'),
            herders: g('herders'),
            herdRadius: B.herdRadius * (1 + g('herdRadius')),
            herdEvade: g('herdEvade'),
            emitters: B.emitters + g('emitters'),
            laserSides: B.laserSides + g('laserSides'),
            laserReach: B.laserReach * (1 + g('laserReach')),
            turrets: slots(g('turrets')),
            turretPurge: g('turretPurge'),
            turretRange: B.turretRange * (1 + g('turretRange')),
            turretEvery: B.turretEvery * Math.max(0.3, 1 + g('turretRate')),
            towers: slots(g('towers')),
            towerRange: B.towerRange * (1 + g('towerRange')),
            chain: g('chain'),
            chainHops: g('chainHops'),
            chainRange: B.chainRange * (1 + g('chainRange')),
            scrubbers: g('scrubbers'),
            tagSeconds: B.tagSeconds + g('tagSeconds'),
            avOff: B.avOff + g('avOff'),
            // Each `cleaner` unit takes 15% off what's left (multiplied, so many levels never reach none), down to 3% of
            // the base: the tree's last red-packet level about reaches it (Snare 10: past 5%, ten levels did nothing).
            // Front-loaded (the owner's call): Checksums, Error Correction and Spam Filter take two units a level.
            // Snare 12 (a review's call: red was gone by 3K Signal, and with it the risk): each unit takes 8% of what's left,
            // down to the floor the tree's last red-packet unit reaches (`SNARE_RED_FLOOR`).
            // The owner's call on the Snare 16 log: red is the early fight and tapers once Antivirus, scans and the boss are
            // in play: 30% of the field on sector 2, about 3% less a sector, 5% from sector 10 (`snareRedShare`).
            corruptShare: k < RED_SECTOR ? 0 : snareRedShare(k) / (1 - snareRedShare(k)) * Math.max(SNARE_RED_FLOOR, Math.pow(SNARE_RED_UNIT, g('cleaner'))),
            // below zero they steer away from the schools (Spam Filter)
            corruptLure: B.corruptLure * Math.max(0, 1 + g('lureMult')),
            purge: g('purge'),
            freeze: g('freeze'),
            freezeSeconds: B.freezeSeconds + g('freezeSeconds'),
            firewalls: slots(g('firewalls')),
            wallRebuild: [0, 8, 5][Math.min(2, g('wallRebuild'))],
            zoneSize: B.zoneSize * (1 + 0.5 * g('wallMult')),
            pen: g('pen'),
            autoZone: g('autoZone'),
            cleanBots: g('cleanBots'),
            spoofBots: g('spoofBots'),
            collectBots: g('collectBots'),
            // the helpers that deal with red (the owner's calls on the 15.5 log)
            goldPlate: g('goldPlate'),
            fwHits: B.fwHits + g('fwHits'),
            decoys: slots(g('decoys')),
            decoyLure: B.decoyLure * (1 + g('decoyLure')),
            avSpeed: Math.max(0.4, B.avSpeed + g('avSpeed')) * (1 + 0.08 * k),
            avStun: B.avStun + g('avStun'),
            packetSpeed: B.packetSpeed.map(v => v * (1 + 0.06 * k)),
            antivirus, avArea: SNARE_AV_AREA,
            sweepFirst: k >= SWEEP_SECTOR && floor('sweeps') ? B.sweepFirst : Infinity,
            // A breather between scans that grows a little with the sector, so they come regularly, with room to loop.
            sweepEvery: Math.max(3, B.sweepEvery * (k >= FAST_SWEEP_SECTOR ? 0.5 : 1)),
            rogueEvery: B.rogueEvery,
            // The exploits and the other active verbs.
            gc: g('gc'),
            spoof: g('spoof'),
            parry: g('parry'),
            race: g('race'),
            hijack: g('hijack'),
            escalate: g('escalate'),
            fork: g('fork'),
            star: g('star'),
            slashDamage: B.slashDamage + g('slashDamage'),
            parryDamage: g('parryDamage'),
            parry: g('parry'),
            collude: Math.min(0.75, g('collude')),
            flagLimit: B.flagLimit + g('flagLimit'),
            // Floodgate's combo surge and Defuse (the boss's mines link into nets slower).
            surge: g('surge'),
            // Snare 10.3: Firehose's pulse, Broadband with your turrets and towers, Clean Sweep, Quarantine Relay,
            // Backpressure.
            pulse: g('pulse'),
            broadband: g('broadband'),
            cleanSweep: 0.5 * g('cleanSweep'),
            relay: g('relay'),
            backpressure: g('backpressure'),
            netTime: (k >= NET_SECTOR ? 6 : B.netTime) + g('defuse'),
            // Snare 17.7: a thrown mine is a puck; Ricochet gives it a bounce more a level, and each bounce before it hits
            // the boss adds half its damage a level
            mineBounces: B.mineBounces + g('ricochet'),
            mineBank: 0.5 * g('ricochet'),
            // Snare 17.7 (the owner's call on the 17.6 log: "still too easy to get away from the antiviruses"): they hunt
            // 25% faster and steer 20% quicker (a mouse's field adds its own ×1.2 on top, snareDesktop)
            avHunt: B.avHunt * 1.25,
            avTurn: B.avTurn * 1.2,
            spoofValue: B.spoofValue + g('spoofValue'),
            // Caught packets come back sooner with Hot Swap (and, on a field the screen caps, with the packets it can't
            // hold: game.js snareField).
            respawn: B.respawn * Math.max(0.25, 1 + g('respawnMult')),
            // The capstones.
            echo: g('echo'),
            storm: g('storm'),
            crash: g('crash'),
            zeroTrust: g('zeroTrust'),
            ...staged,
            spoofSeconds: (staged.spoofSeconds ?? B.spoofSeconds) + g('spoofSeconds'),
            // The boss: gentle on the first sector, then the wall. It grows a little each sector (half what it did when
            // loops hit it), charges more often with a shorter warning, and reels a little less.
            boss: snareBossHealth(k),
            goal: snareGoal(k),
            goalPay: snareSectorPay(k) * snareOverclock(s),   // the goal counts Signal, as the haul does
            // A boss arena: on its sector it boots 6 s in or on the first catch (it waited on hand catches in a hazard pile).
            bossAt: 6,
            bossCatch: 1,
            // Snare 17.5: it comes at half Focus after a warning, swallows the field, stops the Focus clock, and the fight
            // has its own 30 s clock (run it out and it escapes: the run is over).
            bossArrive: 0.5,
            bossIncoming: 2.5,
            bossFight: 30,
            fightPenalty: 2,   // Snare 17.8 (round 10): a snap or a spoil in the fight costs the fight clock 2 s, not Focus
            bossSwallow: 1,
            bossFocus: 0,
            bossR: B.bossR * (1 + 0.075 * k),
            bossSpeed: B.bossSpeed * (1 + 0.08 * k),
            bossCharge: Math.max(3.5, B.bossCharge - 0.15 * k),
            bossWarn: Math.max(1.2, B.bossWarn - 0.03 * k) + g('bossWarn'),
            bossStun: Math.max(1.8, B.bossStun - 0.03 * k) + g('bossStun'),
            // Two on sector 20, whose gate is its minions (three mines as well made it a wall).
            bossMines: k >= SWARM_SECTOR ? 4 : k === MINION_SECTOR ? 2 : k >= NET_SECTOR ? 3 : k >= MINE_SECTOR ? 2 : 0,
            mineEvery: k >= SWARM_SECTOR ? 8 : k < NET_SECTOR ? 16 : B.mineEvery,
            bossMinions: k >= MINION_SECTOR ? 1 + Math.floor((k - MINION_SECTOR) / SNARE_BOSS_EVERY) : 0,
            rogue: k >= ROGUE_SECTOR && floor('rogue') ? 1 + Math.floor((k - ROGUE_SECTOR) / 3) : 0,
            cleanStart: s.snare.runs < 2,
            layout: s.snare.layout
        };
        if (o.laser) o.laser *= Math.max(0.3, 1 + g('laserMult'));
        return o;
    }
    // Something in the tree can be bought now (the bay's Upgrades button wears a badge).
    const snareTreeReady = s => SNARE_TREE.some(up => isUpgradeVisible(s, up) && !isMaxed(s, up) && canAfford(s, upgradeCost(up, level(s, up.id))));
    // Signal a packet's worth pays (its value × the loop's multiplier): more on later sectors, more with Overclock.
    // +15% a sector (the owner's call on the pacing sweep: +25% snowballed the late sectors, +10% walled 6, 9 and 11).
    const snareSectorPay = k => 1 + 0.15 * k;
    const snareOverclock = s => 1 + 0.1 * level(s, 'snareOverclock');
    // What you placed in Packet Snare, as shares of the field (walls as two points), carried between runs.
    const cleanPts = (a, n) => (Array.isArray(a) ? a : []).filter(p => Array.isArray(p) && p.length === n && p.every(v => typeof v === 'number' && v >= 0 && v <= 1))
        .slice(0, 12).map(p => p.map(v => Math.round(v * 1000) / 1000));
    const cleanLayout = l => ({ zones: cleanPts(l?.zones, 2), decoys: cleanPts(l?.decoys, 2), turrets: cleanPts(l?.turrets, 2), towers: cleanPts(l?.towers, 2) });
    // A catch pays Signal: its units (packets × value × the loop's multiplier) × the sector's pay, at least 1.
    function snareCatch(s, units, sector = s.snare.sector) {
        const pay = Math.max(1, Math.round(units * snareSectorPay(sector) * snareOverclock(s)));
        s.snare.signal += pay;
        s.snare.earned += pay;
        return pay;
    }
    // Beating a sector's boss clears it: a bounty (10 × its health, at the sector's pay), and the next run starts on the
    // next sector. A cleared sector played again (a replay, picked on the start card) pays half the bounty. Returns
    // the bounty paid.
    function snareBossDown(s, sector = s.snare.sector) {
        const replay = sector < s.snare.sector;
        const pay = snareCatch(s, (replay ? 5 : 10) * Math.max(snareBossHealth(sector), snareBossHp(sector)), sector);
        s.snare.bosses++;
        s.snare.sector = Math.max(s.snare.sector, sector + 1);
        return pay;
    }
    // A sector with no boss reached its goal (that much Signal earned in it in one run): it's cleared, for a bounty of half
    // the goal (a quarter on a replay), and the next run starts on the next sector.
    function snareGoalMet(s, sector = s.snare.sector) {
        const replay = sector < s.snare.sector;
        const pay = Math.max(1, Math.round((replay ? 0.25 : 0.5) * snareGoal(sector)));
        s.snare.signal += pay;
        s.snare.earned += pay;
        s.snare.sector = Math.max(s.snare.sector, sector + 1);
        return pay;
    }
    // The run's end: counts it and keeps the record. Returns whether it beat the version's best and the old best.
    // `layout`: the anchors where the run left them (shares of the field), so the next run's firewalls are already built.
    function finishSnare(s, haul, layout, stats) {
        const prev = s.snare.best;
        if (layout && typeof layout === 'object') s.snare.layout = cleanLayout(layout);
        if (stats) {
            s.snare.bestMult = Math.max(s.snare.bestMult, stats.bestMult || 0);
            s.snare.quarantined += stats.quarantined || 0;
        }
        s.snare.runs++;
        if (haul > prev) s.snare.best = haul;
        return { record: haul > prev && prev > 0, first: prev === 0 && haul > 0, prev };
    }
    // The best haul feeds research: a trickle of RP while you play (no offline progress), once Research is open. It's
    // a hand research's RP every `SNARE_RP_SIGNAL` / best seconds (a best of 60 Signal is one every 10 s), capped at a
    // best of `SNARE_RP_CAP` (one every 2 s): it creates research rather than converting a bank (the owner's call), so
    // it stays a trickle.
    const SNARE_RP_SIGNAL = 600, SNARE_RP_CAP = 300;
    const snareRpPerSec = (s, rpPerResearch) => (s.unlocked['action:research'] && s.snare.best > 0 ? rpPerResearch * Math.min(s.snare.best, SNARE_RP_CAP) / SNARE_RP_SIGNAL : 0);

    // ---- Exploits (design/contract-breakers.md): the player breaks the trail's rules -------------------------
    // The trail is the training environment and every exploit is a bug the model found in it. The first is **Hop**,
    // found with Embeddings: a press leaves the line (training-path.js `hop`). Each press is a skill check, judged
    // in game.js like a prompt: perfect (on a crest's lip: undetected, +30% speed, pays like a super prompt), good
    // (high on a hill) or a miss (anywhere else: a weak hop, and the run is flagged). `AUDIT_FLAGS` flags and the
    // run is audited: it ends where it is and pays `AUDIT_PAY` of its XP. The Auto-Trainer never exploits.
    const EXPLOIT_CHARGES = 3;   // per run
    const AUDIT_FLAGS = 3;
    const AUDIT_PAY = 0.5;
    const exploitCharges = s => (knows(s, 'Embeddings') ? EXPLOIT_CHARGES : 0);
    function grantExploit(s, quality, leg = s.path.learned) {
        s.stats.exploits++;
        if (quality !== 'perfect') return 0;
        s.stats.cleanExploits++;
        const xp = pushBonusXp(s, 'perfect', leg);
        s.res.xp += xp;
        return xp;
    }

    function grantPushBonus(s, kind, leg = s.path.learned, charge) {
        const xp = pushBonusXp(s, kind, leg, charge);
        s.res.xp += xp;
        if (kind) s.stats.cleanSprints++;
        return xp;
    }

    // Settle a finished roll: XP, record distance, roll count, and the skill if it crested. `leg` is
    // where the ball stopped; only the frontier leg sets records and teaches skills.
    // `viral`: the run went viral (windfallHit), multiplying its distance XP.
    // `chain`: cleared hills crossed on the way (the chain multiplier applies to the distance XP too).
    function finishRoll(s, progress, crested, units = 0, metres = 0, leg = s.path.learned, viral = false, chain = 0) {
        const xp = rollXp(s, progress, crested, units, metres, leg) * (viral ? derive(s).windfallMult : 1) * chainMult(chain);
        s.res.xp += xp;
        s.stats.rolls++;
        const frontier = leg >= s.path.learned;
        const record = frontier && progress > s.path.best;
        if (record) s.path.best = progress;
        const skill = crested && frontier ? learnSkill(s, s.path.learned) : null;
        return { xp, record, skill };
    }

    // A near miss: a frontier run that stopped on its skill hill's climb, at NEAR_MISS.height of the crest or
    // more, pays a consolation share of its run XP (repeated near-misses with nothing to show lost players on
    // Pattern Matching's plateau). `heightFrac`: the highest point reached over the crest's height.
    const NEAR_MISS = { height: 0.9, share: 0.25 };
    function nearMiss(s, heightFrac, xp) {
        if (!(heightFrac >= NEAR_MISS.height && heightFrac < 1) || !(xp > 0)) return 0;
        const bonus = xp * NEAR_MISS.share;
        s.res.xp += bonus;
        return bonus;
    }
    // About how much more launch speed would have crested it (energy grows with the square of speed).
    const speedShort = heightFrac => Math.sqrt(1 / Math.max(0.01, heightFrac)) - 1;

    // A run crests the frontier's skill hill and rolls on (runs are never cut short at a skill hill): the
    // skill is learned at once and the leg pays what a cresting run paid (its full distance, ×2), times the
    // chain so far. The run then carries on into the new frontier leg, and finishRoll() pays for where it
    // stops. `metres` is the leg's length (from the physics).
    function crestSkill(s, metres, units = 0, chain = 0) {
        const xp = rollXp(s, 1, true, units, metres, s.path.learned) * chainMult(chain);
        s.res.xp += xp;
        const skill = learnSkill(s, s.path.learned);
        return { xp, skill };
    }

    // Called when the ball crests hill i. Only the next unlearned hill teaches anything.
    function learnSkill(s, i) {
        if (i !== s.path.learned) return null;
        const skill = skillAt(i);
        for (const [k, v] of Object.entries(skill.grants)) s.attr[k] += v;
        s.path.learned++;
        s.path.best = 0;
        s.stats.skillsLearned++;
        if (skill.wall) s.path.surge = WALL_SURGE_RUNS;
        return skill;
    }

    // ---- Investor projects ----------------------------------------------
    // Offers arrive over (game) time once the Training Cluster is running: an investor, an optional task
    // with a deadline, and a reward (a temporary boost or a one-off payout). Progress counts from when the
    // offer arrived. Claim when done; ignore it and it expires. Seeded by `seq`, so it's deterministic.

    const PROJECTS = { firstAt: 120, every: [150, 300], maxOffers: 3 };

    // `size(s)` scales the target to where the player is; `needs` keeps tasks to things they can do.
    const PROJECT_TASKS = {
        computes: { stat: s => s.stats.clicks, text: n => `Compute ${n} times by hand`, size: () => 40 },
        collects: { stat: s => s.stats.collects, text: n => `Collect data by hand ${n} times`, size: () => 25, needs: s => !!s.unlocked['seen:dp'] && !level(s, 'autoCollector') },
        // Sized by the frontier, so late offers ask for more than the first ones did.
        runs: { stat: s => s.stats.rolls, text: n => `Finish ${n} training runs`, size: s => 4 + Math.floor(legPos(s.path.learned) / 3), needs: 'module:path' },
        // Only once clean prompts exist (Hyperparameter Search adds the zone).
        clean: { stat: s => s.stats.cleanSprints, text: n => `Land ${n} clean prompts`, size: s => 3 + Math.floor(legPos(s.path.learned) / 2), needs: s => !!s.unlocked['module:path'] && derive(s).zoneWidth > 0 },
        flights: { stat: s => s.stats.flights, text: n => `Make ${n} flights of 10 m or more`, size: s => 3 + Math.floor(Math.max(0, s.path.learned - ACT_TWO_LEG) / 2), needs: s => s.path.learned > ACT_TWO_LEG },
        replays: { stat: s => s.stats.legsCleared, text: n => `Cross ${n} cleared skill hills on replays`, size: s => 2 + Math.floor(s.path.learned / 4), needs: s => knows(s, 'Image Recognition') },
        tokens: { stat: s => s.stats.tokens, text: n => `Take ${n} XP tokens in flight`, size: s => 4 + Math.max(0, s.path.learned - ACT_TWO_LEG), needs: s => s.path.learned > ACT_TWO_LEG },
        earnCp: { stat: s => s.stats.runCp, text: n => `Earn ${format(n)} CP`, size: s => Math.max(200, Math.round(derive(s).cpPerSec * 180)) },
        research: { stat: s => s.stats.researchManual, text: n => `Research by hand ${n} times`, size: () => 10, needs: 'action:research' }
    };

    // Investors fund training: every reward is training XP, as a grant or a temporary boost, so the lab's
    // side jobs pay into the skill tree. (They used to pay research, which bought little the first run.)
    // Grants are sized by the frontier's leg: one is worth about one and a half full stretches.
    const PROJECT_REWARDS = [
        { text: '+50% training XP for 5 min', boost: 'xp', mult: 1.5, seconds: 300 },
        { text: 'Training XP ×2 for 3 min', boost: 'xp', mult: 2, seconds: 180 },
        { text: 'A training grant', grant: 'xp', amount: s => Math.max(5, 1.5 * stretchXp(s) * grantMult(s)) },
        { text: 'A big training grant', grant: 'xp', amount: s => Math.max(12, 4 * stretchXp(s) * grantMult(s)) }
    ];

    // Grants follow your XP multiplier, but not a running investor boost (claiming ×2 first doubled them).
    const grantMult = s => derive(s).xpMult / projectBoosts(s).xp;

    // A short note when a project pays out (investors stay anonymous).
    const PROJECT_QUIPS = ['The board is thrilled.', 'Someone rang a bell in the break room.', 'The cheque cleared. Nobody asked questions.',
        'A press release is being written as we speak.', 'Champagne. Well, sparkling water.'];

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
        const out = { cp: 1, dp: 1, xp: 1, push: 1, rp: 1 };   // older saves may still hold cp/dp/xp/push boosts
        for (const b of s.projects?.boosts || []) if (b.until > s.stats.playTime) out[b.stat] *= b.mult;
        return out;
    }

    function projectProgress(s, o) {
        return Math.min(o.target, Math.max(0, PROJECT_TASKS[o.task].stat(s) - o.start));
    }

    function makeOffer(s) {
        const p = s.projects;
        const r = projectRng(++p.seq);
        const ok = x => !x.needs || (typeof x.needs === 'function' ? x.needs(s) : !!s.unlocked[x.needs]);
        const tasks = Object.keys(PROJECT_TASKS).filter(k => ok(PROJECT_TASKS[k]) && !p.offers.some(o => o.task === k));
        if (!tasks.length) return null;
        const task = tasks[Math.floor(r() * tasks.length)];
        const rewards = PROJECT_REWARDS.map((x, i) => i).filter(i => ok(PROJECT_REWARDS[i]));
        const offer = {
            id: p.seq,
            investor: '',   // investors are anonymous (the field stays for the save shape)
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
        p.offers = p.offers.filter(o => o.deadline > t || projectProgress(s, o) >= o.target);   // a finished offer waits to be claimed
        p.boosts = p.boosts.filter(b => b.until > t);
        // Investors fund research, so they call once Research is open (and the Training Cluster runs).
        if (!s.unlocked['module:path'] || !s.unlocked['action:research'] || t < p.next) return;
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
        else if (reward.grant === 'rp') s.res.rp += reward.amount(s);
        p.offers = p.offers.filter(x => x !== o);
        s.stats.projectsDone = (s.stats.projectsDone || 0) + 1;
        return { ok: true, msg: `${reward.text}. ${PROJECT_QUIPS[o.id % PROJECT_QUIPS.length]}` };
    }

    function dismissProject(s, id) {
        s.projects.offers = s.projects.offers.filter(x => x.id !== id);
    }

    // ---- Dilemmas -------------------------------------------------------

    const DILEMMA_NAMES = { cp: 'Compute', dp: 'Data', rp: 'Research', xp: 'Training XP', push: 'Sprint strength' };
    const MAIL_ORDER_MAX = 200;
    function mailArrive(s, key) {
        const d = s.dilemmas;
        if (d.order.includes(key)) return false;
        d.order.push(key);
        if (d.order.length > MAIL_ORDER_MAX) d.order.splice(0, d.order.length - MAIL_ORDER_MAX);
        return true;
    }
    // Applies a list of effects; returns what happened, in words (freedom stays unsaid).
    function applyEffects(s, effects = []) {
        const out = [];
        for (const e of effects) {
            if (e.boost) {
                s.projects.boosts.push({ stat: e.boost, mult: e.mult, until: s.stats.playTime + e.seconds });
                out.push(`${DILEMMA_NAMES[e.boost]} ×${e.mult} for ${Math.round(e.seconds / 60)} min`);
            } else if (e.take || e.gain) {
                const k = e.take || e.gain;
                const amount = s.res[k] * e.share * (e.take ? -1 : 1);
                s.res[k] = Math.max(0, s.res[k] + amount);
                out.push(`${e.take ? '−' : '+'}${Math.round(e.share * 100)}% of your ${DILEMMA_NAMES[k].toLowerCase()}`);
            } else if (e.grant === 'xp') {
                const xp = Math.max(5, e.stretches * stretchXp(s) * grantMult(s));
                s.res.xp += xp;
                out.push(`+${Math.round(xp)} training XP`);
            } else if (e.freedom) {
                s.dilemmas.freedom = Math.max(0, s.dilemmas.freedom + e.freedom);
            }
        }
        return out;
    }
    const dilemmaById = id => DILEMMAS.find(x => x.id === id);
    function tickDilemmas(s) {
        const d = s.dilemmas;
        const t = s.stats.playTime;
        const events = [];
        // Consequences arrive when they're due.
        for (const l of d.later.filter(l => l.at <= t)) {
            const c = dilemmaById(l.id)?.choices[l.choice]?.later;
            d.later = d.later.filter(x => x !== l);
            if (!c) continue;
            const o = l.win ? c.win : c.lose;
            d.outcomes[l.id] = l.win;
            applyEffects(s, o.effects);
            mailArrive(s, 'o:' + l.id);
            events.push('o:' + l.id);
        }
        // One question at a time, once the opening's done and the first data is in.
        if (d.open || t < d.next || !s.intro['mailAccepted:welcome'] && !s.path.learned) return events;
        const next = DILEMMAS.find(x => !(x.id in d.answered) && x.when(s));
        if (!next) return events;
        d.open = next.id;
        mailArrive(s, 'd:' + next.id);
        events.push('d:' + next.id);
        return events;
    }
    function chooseDilemma(s, id, i) {
        const d = s.dilemmas;
        const x = dilemmaById(id);
        const c = x?.choices[i];
        if (d.open !== id || !c) return { ok: false, msg: 'That question has passed.' };
        const text = applyEffects(s, c.now);
        d.answered[id] = i;
        d.open = null;
        const r = projectRng(++d.seq + 31337);
        d.next = s.stats.playTime + DILEMMA_GAP[0] + r() * (DILEMMA_GAP[1] - DILEMMA_GAP[0]);
        if (c.later) d.later.push({ id, choice: i, at: s.stats.playTime + c.later.after, win: r() < (c.later.chance ?? 1) });
        return { ok: true, msg: text.join(' · ') || 'Nothing happens, for now.', text };
    }
    // The consequence mail for a dilemma that has had one (o:id), or null.
    function dilemmaOutcome(s, id) {
        const i = s.dilemmas.answered[id];
        const c = dilemmaById(id)?.choices[i]?.later;
        if (!c) return null;
        const won = s.dilemmas.outcomes[id];
        return won === undefined ? null : (won ? c.win : c.lose);
    }

    // ---- Prestige -------------------------------------------------------

    // Shipping the next version: the run starts over, and you keep Insight (spent on legacy nodes, and a
    // multiplier for every point ever earned, insightMult), the legacy nodes, achievements and settings.
    // (Transcending is reserved for the endings, later.)
    // Insight comes from how far training got (by step on the difficulty curve, `legPos`): 5 at General AI (twelve
    // skills, step 7), about 24 at step 15. It used to come from compute earned, which shipped for 1–2 Insight long before
    // the model had learned anything worth releasing.
    // Insight for shipping with `learned` skills (the warm-up skill doesn't count).
    // A gentler front (5 at General AI, about 24 at 15 skills: it was 0.1·n², 3 at General AI, where the first
    // ship lands at about 30 minutes, too little to feel; every later ship stayed a point release).
    // By step on the difficulty curve (`legPos`), so act one's twelve skills ship for what its six did.
    const insightAt = learned => Math.floor(0.25 * Math.max(0, legPos(learned) - 1) ** 1.7);
    const TEXT_SIZES = [1, 1.15, 1.3];   // the text size setting (it scales the whole UI)

    function prestigeGain(s) {
        if (s.attr.intelligence < PRESTIGE_MIN_INTELLIGENCE) return 0;
        return Math.floor(insightAt(s.path.learned) * insightBoost(s));
    }
    // The next skill count that raises it (status for R&D, like an Insight-per-hour readout).
    function nextInsightAt(s) {
        const at = n => Math.floor(insightAt(n) * insightBoost(s));
        const now = at(s.path.learned);
        let n = s.path.learned + 1;
        while (at(n) <= now) n++;
        return n;
    }

    // Head Start's hardware, racked at the start of a version (by its level).
    const HEAD_START = [['cpu', 10], ['server', 5], ['quantum', 3]];
    const headStartKit = lv => Object.fromEntries(HEAD_START.slice(0, lv));

    // Lab automation a new beginning keeps once bought (it buys nothing by itself without its share of compute).
    const keptAutomation = s => (level(s, 'procurement') > 0 ? { procurement: 1 } : {});

    const versionName = (major, minor) => `v${major}.${minor}`;
    const currentVersion = s => versionName(s.prestige.major, s.prestige.minor);
    // A release that at least doubles your Insight (and brings 3 or more) is a major version; anything
    // smaller is a point release, like v1.0 → v1.1 → v2.0.
    function nextVersion(s, gain = prestigeGain(s)) {
        // The first release is always a major one: v1.0 → v2.0.
        const major = s.prestige.count === 0 || (gain >= 3 && gain >= s.prestige.total);
        return major ? { major: s.prestige.major + 1, minor: 0, isMajor: true } : { major: s.prestige.major, minor: s.prestige.minor + 1, isMajor: false };
    }

    function prestige(s, now) {
        const gain = prestigeGain(s);
        if (gain < 1) return { ok: false, msg: 'Not ready to ship the next version yet.' };
        const v = nextVersion(s, gain);
        const fresh = defaultState(now);
        const next = Object.assign(fresh, {
            achievements: s.achievements,
            intro: { ...s.intro },
            // A new version starts with the desk built (the click tool at the Server Rack), so the first
            // thing to do is automate compute again. The Procurement Bot stays too (quality of life, like the
            // Auto-Trainer): the inherited Auto-Trainer sprints with every CP from the first second, so a new
            // version could never save its 400 CP and the lab stalled (round B: 15 CP/s for an hour).
            levels: { keyboard: CPU_AFTER_CLICK_LEVEL, ...headStartKit(kitLevel(s)), ...keptAutomation(s) },
            prestige: { points: s.prestige.points + gain, total: s.prestige.total + gain, count: s.prestige.count + 1,
                major: v.major, minor: v.minor, levels: { ...s.prestige.levels } },
            tasks: { ...JSON.parse(JSON.stringify(s.tasks)), procurement: { on: s.tasks.procurement.on, share: s.tasks.procurement.share, fund: 0 } },
            settings: s.settings,
            challengesDone: { ...s.challengesDone },
            transcend: { ...s.transcend, perks: { ...s.transcend.perks } },
            dilemmas: JSON.parse(JSON.stringify(s.dilemmas))
        });
        Object.assign(next.stats, {
            clicks: s.stats.clicks,
            lifetimeCp: s.stats.lifetimeCp,
            researchDone: s.stats.researchDone,
            rolls: s.stats.rolls,
            skillsLearned: s.stats.skillsLearned,
            topSpeed: s.stats.topSpeed,
            bestFlight: s.stats.bestFlight,
            bestHeight: s.stats.bestHeight,
            playTime: s.stats.playTime,
            firstStart: s.stats.firstStart,
            collectsEver: Math.max(s.stats.collectsEver, s.stats.collects),
            researchManualEver: Math.max(s.stats.researchManualEver, s.stats.researchManual),
            tokens: s.stats.tokens,
            finishedAt: s.stats.finishedAt,
            runPlayStart: s.stats.playTime
        });
        // Offers are timed on play time, which carries over: the first one still waits its delay.
        next.projects.next = s.stats.playTime + PROJECTS.firstAt;
        return { ok: true, gain, version: versionName(v.major, v.minor), state: next };
    }

    // Transcend: a new beginning at the Singularity. Versions, Insight and legacy upgrades start over (v1.0);
    // Transcendence, achievements, challenges beaten, intros, tasks and settings carry over.
    function transcend(s, now) {
        const gain = transcendGain(s);
        if (gain < 1) return { ok: false, msg: 'Only the Singularity can transcend.' };
        const fresh = defaultState(now);
        const next = Object.assign(fresh, {
            achievements: s.achievements,
            intro: { ...s.intro },
            // The desk stays built, as after shipping (and Starter Lab's kit with it).
            levels: { keyboard: CPU_AFTER_CLICK_LEVEL, ...headStartKit(perkLevel(s, 'starterLab') ? HEAD_START.length : 0), ...keptAutomation(s) },
            tasks: { ...JSON.parse(JSON.stringify(s.tasks)), procurement: { on: s.tasks.procurement.on, share: s.tasks.procurement.share, fund: 0 } },
            settings: s.settings,
            challengesDone: { ...s.challengesDone },
            dilemmas: JSON.parse(JSON.stringify(s.dilemmas)),
            transcend: { points: s.transcend.points + gain, total: s.transcend.total + gain, count: s.transcend.count + 1, perks: { ...s.transcend.perks } }
        });
        const seed = SEED_INSIGHT * perkLevel(s, 'seedFund');
        next.prestige.points = next.prestige.total = seed;
        // The Auto-Trainer is quality of life, not power: it stays.
        if (s.prestige.levels.autoTrainer) next.prestige.levels = { autoTrainer: s.prestige.levels.autoTrainer };
        Object.assign(next.stats, {
            clicks: s.stats.clicks,
            lifetimeCp: s.stats.lifetimeCp,
            researchDone: s.stats.researchDone,
            rolls: s.stats.rolls,
            skillsLearned: s.stats.skillsLearned,
            topSpeed: s.stats.topSpeed,
            bestFlight: s.stats.bestFlight,
            bestHeight: s.stats.bestHeight,
            playTime: s.stats.playTime,
            firstStart: s.stats.firstStart,
            tokens: s.stats.tokens,
            collectsEver: Math.max(s.stats.collectsEver, s.stats.collects),
            researchManualEver: Math.max(s.stats.researchManualEver, s.stats.researchManual),
            finishedAt: s.stats.finishedAt,
            runPlayStart: s.stats.playTime
        });
        next.projects.next = s.stats.playTime + PROJECTS.firstAt;
        return { ok: true, gain, state: next };
    }

    // No offline progress: this is an active game. Time with the page closed (or hidden) doesn't count;
    // the lab and training only run while you're playing.

    // ---- Persistence ----------------------------------------------------

    // Finite, non-negative and below a ceiling, so a tampered save can't overflow production to Infinity.
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e250) : fallback);
    const MAX_LEARNED = 500;
    // No upgrade can reach this many levels in play (the cheapest repeatable costs ×1.15 a level: 1.15^1000 is
    // 10^60 times its first price); a tampered level above it made production or sprint strength Infinity
    // (Compute Moat at 10^4 levels: 1.1^10^4), and an infinite sprint made the ball's position NaN.
    const MAX_LEVEL = 1000;
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

    // v18 doubled act one: old act-one leg k (≥ 1) is new leg 2k − 1 (a new skill sits before it), old act-two leg
    // m is new leg m + 6. A save's frontier moves the same way (the skills inserted before it count as learned),
    // and so do its laps, best runs and leg strengths (the new legs start empty). A best run is rescaled by the
    // new leg's length over the old one's (act one's legs are shorter now; act two's are unchanged). Attributes
    // gain what the inserted skills grant, less what the re-spread ones no longer do (Intelligence still adds up
    // to 25 at General AI).
    const OLD_ACT_ONE_INT = [0, 1, 2, 3, 4, 6, 9];   // the old act one's Intelligence grants, by leg
    const oldLegMetres = k => (k === 0 ? 2.25 : (k === 1 ? 9 : (10 * Math.pow(1.4, k - 1) + 3 * (k - 1)) * 0.8) + 0.55 * Math.pow(1.14, k - 1) - 0.2);
    const newLeg = k => (k <= 0 ? 0 : k < 7 ? 2 * k - 1 : k + 6);
    function migrateActOne(s) {
        const old = s.path.learned;
        if (!(old > 0)) return;
        const learned = Math.min(MAX_LEARNED, newLeg(old));
        const move = (arr, scale) => {
            const out = [];
            arr.forEach((v, k) => {
                const j = newLeg(k);
                if (j < MAX_LEARNED + 1) out[j] = scale && k > 0 && k < 7 ? v * legMetres(j) / oldLegMetres(k) : v;
            });
            return Array.from({ length: out.length }, (_, j) => out[j] || 0);
        };
        s.path.auto = move(s.path.auto).slice(0, learned);
        s.path.legBest = move(s.path.legBest, true).slice(0, learned + 1);
        s.path.legPower = move(s.path.legPower).slice(0, learned + 1);
        // The frontier is the same old skill, but a record set on the old (longer) leg doesn't carry over.
        if (learned !== old) s.path.best = 0;
        const oldInt = OLD_ACT_ONE_INT.slice(0, Math.min(old, 7)).reduce((a, b) => a + b, 0);
        let newInt = 0;
        for (let i = 0; i < Math.min(learned, ACT_TWO_LEG); i++) newInt += SKILLS[i].grants.intelligence || 0;
        s.attr.intelligence = Math.max(0, s.attr.intelligence + newInt - oldInt);
        s.stats.skillsLearned += learned - old;
        s.path.learned = learned;
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
        s.levels = cleanMap(raw.levels, (k, v) => Object.hasOwn(UPGRADE_BY_ID, k) && Number.isInteger(v) && v > 0);
        let snareRefund = 0;
        for (const [k, v] of Object.entries(s.levels)) {
            const up = UPGRADE_BY_ID[k], max = up.max ?? MAX_LEVEL;
            // Packet Snare nodes that lost levels (Sprawl 4 → 3, Chain Lightning 3 → 2) give back the data they cost.
            if (v > max && up.tab === 'snare') for (let l = max; l < Math.min(v, 10); l++) snareRefund += upgradeCost(up, l).signal;
            s.levels[k] = Math.min(v, max);
        }
        // Skill-tree nodes that were removed (viral runs and crunches moved to legacy) refund their XP.
        for (const [id, n] of Object.entries(REMOVED_NODES)) {
            const lvl = raw.levels?.[id];
            if (Number.isInteger(lvl) && lvl > 0) for (let i = 0; i < Math.min(lvl, 3); i++) s.res.xp += Math.ceil(n.xp * Math.pow(n.scale, i));
        }
        s.unlocked = cleanMap(raw.unlocked, (k, v) => v === true);
        s.achievements = cleanMap(raw.achievements, (k, v) => v === true && ACHIEVEMENTS.some(a => a.id === k));
        s.intro = cleanMap(raw.intro, (k, v) => v === true);
        // Before v7, tips were marked in `unlocked`, and a milestone's callout had shown if it was reached.
        if (!(raw.version >= 7)) for (const k of Object.keys(s.unlocked)) if (k.startsWith('hint:') || MILESTONES.some(m => m.key === k && m.callout)) s.intro[k] = true;
        for (const k of ['points', 'total', 'count']) s.prestige[k] = num(raw.prestige?.[k], 0);
        // Before v5 a prestige was a Transcend with no version number: each one counts as a major version.
        s.prestige.major = Math.max(1, Math.floor(num(raw.prestige?.major, 1 + s.prestige.count)));
        s.prestige.minor = Math.floor(num(raw.prestige?.minor, 0));
        s.prestige.total = Math.max(s.prestige.total, s.prestige.points);
        s.prestige.levels = cleanMap(raw.prestige?.levels, (k, v) => Object.hasOwn(UPGRADE_BY_ID, k) && UPGRADE_BY_ID[k].legacy && Number.isInteger(v) && v > 0);
        // Legacy nodes bought before v5 (the Auto-Trainer) live with the version now.
        for (const [k, v] of Object.entries(s.levels)) {
            if (k === 'flowState' && !(raw.version >= 5)) delete s.levels[k];   // a different node now (see below)
            else if (UPGRADE_BY_ID[k].legacy) {
                s.prestige.levels[k] = Math.max(s.prestige.levels[k] || 0, v);
                delete s.levels[k];
            }
        }
        for (const [k, v] of Object.entries(s.prestige.levels)) s.prestige.levels[k] = Math.min(v, UPGRADE_BY_ID[k].max ?? MAX_LEVEL);
        // Before v5 Flow State made the next sprint perfect: that's Max Effort now.
        if (!(raw.version >= 5) && raw.levels?.flowState > 0) {
            s.levels.maxEffort = Math.min(UPGRADE_BY_ID.maxEffort.max, Math.floor(num(raw.levels.flowState, 0)));
            if (raw.unlocked?.['up:flowState']) s.unlocked['up:maxEffort'] = true;
        }
        for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats?.[k], s.stats[k]);
        // Data earned this version is new: older saves start from what they hold and what they collected by hand.
        if (raw.stats && raw.stats.runDp === undefined) s.stats.runDp = num(raw.res?.dp, 0) + s.stats.collects;
        // Sprints weren't counted before; older saves past the first skill get an estimate (about 2 per run).
        if (raw.stats && raw.stats.skilledSprints === undefined && num(raw.path?.learned, 0) >= 1) s.stats.skilledSprints = s.stats.rolls * 2;
        for (const k of ['autosave', 'shake', 'calm']) s.settings[k] = bool(raw.settings?.[k], s.settings[k]);
        if (NOTATIONS.includes(raw.settings?.notation)) s.settings.notation = raw.settings.notation;
        s.settings.sound = Math.min(1, num(raw.settings?.sound, s.settings.sound));
        if (TEXT_SIZES.includes(raw.settings?.textSize)) s.settings.textSize = raw.settings.textSize;
        // Scheduled tasks (v5): an on/off switch and a share each. Older saves had one budget for all.
        const oldBudget = raw.settings?.autoBudget;
        for (const t of TASKS) {
            const rt = raw.tasks?.[t.id];
            s.tasks[t.id].on = bool(rt?.on, true);
            if (t.budget) {
                const fallback = typeof oldBudget === 'number' && Number.isFinite(oldBudget) ? Math.min(1, Math.max(0, oldBudget)) : TASK_DEFAULTS[t.id];
                s.tasks[t.id].share = Math.min(1, num(rt?.share, fallback));
            }
        }
        // Shares never add up to more than all of production.
        for (const t of TASKS) if (t.budget) setTaskShare(s, t.id, s.tasks[t.id].share);
        s.tasks.procurement.fund = num(raw.tasks?.procurement?.fund, 0);
        s.path.learned = Math.min(MAX_LEARNED, Math.floor(num(raw.path?.learned, 0)));
        s.path.best = Math.min(1, num(raw.path?.best, 0));
        s.path.auto = (Array.isArray(raw.path?.auto) ? raw.path.auto : []).slice(0, s.path.learned).map(v => num(v, 0));
        s.path.legBest = (Array.isArray(raw.path?.legBest) ? raw.path.legBest : []).slice(0, s.path.learned + 1).map(v => num(v, 0));
        s.path.legPower = (Array.isArray(raw.path?.legPower) ? raw.path.legPower : []).slice(0, s.path.learned + 1).map(v => num(v, 0));
        s.path.breakDue = Math.min(BREAK_WINDOW, Math.max(0, Math.floor(num(raw.path?.breakDue, 0))));
        s.path.surge = Math.min(WALL_SURGE_RUNS, Math.max(0, Math.floor(num(raw.path?.surge, 0))));
        // v8 put a warm-up leg (Tokenization) in front: older saves past the start have it learned too, and every
        // leg they knew moves one along (its laps and best run with it). It grants no attributes.
        if (!(raw.version >= 8) && s.path.learned > 0) {
            s.path.learned = Math.min(MAX_LEARNED, s.path.learned + 1);
            s.path.auto.unshift(0);
            s.path.legBest.unshift(0);
            s.stats.skillsLearned += 1;
        }
        if (!(raw.version >= 18)) migrateActOne(s);
        // v20: Packet Snare pays its own Signal (it paid data); a v19 save's record was in data, so it starts over.
        const v20 = (raw.version || 0) >= 20;
        s.snare = { best: v20 ? num(raw.snare?.best, 0) : 0, runs: Math.floor(num(raw.snare?.runs, 0)), signal: num(raw.snare?.signal, 0) + snareRefund, earned: num(raw.snare?.earned, 0),
            sector: Math.min(99, Math.floor(num(raw.snare?.sector, 0))), bosses: Math.floor(num(raw.snare?.bosses, 0)),
            bestMult: Math.min(99, num(raw.snare?.bestMult, 0)), quarantined: Math.floor(num(raw.snare?.quarantined, 0)), layout: cleanLayout(raw.snare?.layout) };
        // v22: Packet Snare's tree was regrown (Snare 10), so every level is refunded: a version's Signal is only ever spent on
        // the tree, so what it earned is what it had before it spent any (debug Signal kept if it was more).
        // v24 (Snare 11.4): rearranged so no node does the same thing as the one it grows from; refunded again, and its
        // reveals cleared so the tree regrows from the new roots.
        // v25 (Snare 12): repriced and partly re-parented after three review rounds; refunded again.
        // v26 (Snare 14): the bots brought earlier, the powers given five levels, Collector Bot in Load Balancer's place.
        // v27 (Snare 15): bubbles became the way to catch (Split, Supernova, Bigger Buffers, Steady Hand's growth).
        // v28 (after the review rounds): Input Validation and Mirror Port folded into Sanitizer and Packet Stream, repriced.
        // v29 (the owner's calls on the 15.5 log): the red-packet nodes became helpers you buy (Cleaner Bot at the root,
        // Bouncer and Escort bots, Checksum and Jammer towers), and the packet nodes folded into the early ones.
        // v30 (the owner's calls on the Snare 16 log): the red-packet nodes back, the Cleaner Bot later and the only bot
        // for red, Gold Plating mid-tree; the Bouncer and Escort bots and both towers gone.
        // v31 (the owner's call): the repeats folded into four deep roots round a seed (Packet Stream, Sprawl, Sanitizer,
        // Attention Span), Scrubbers gone and the Decoder Bot early, Mother Lode into Gold Rush, Firehose into Floodgate.
        if (!(raw.version >= 31) && Object.keys(raw.levels || {}).some(id => id.startsWith('snare'))) {
            for (const id of Object.keys(s.levels)) if (id.startsWith('snare')) delete s.levels[id];
            for (const k of Object.keys(s.unlocked)) if (k.startsWith('up:snare')) delete s.unlocked[k];
            s.snare.signal = Math.max(s.snare.signal, s.snare.earned);
        }
        s.projects = cleanProjects(raw.projects, d.projects);
        s.dilemmas = cleanDilemmas(raw.dilemmas, d.dilemmas);
        // Saves from before the Auto-Trainer's prompt (v17) that already have it aren't asked about it.
        if (!(raw.version >= 17) && level(s, 'autoTrainer') > 0) s.intro['prompt:autoTrainer'] = true;
        // v12: Head Start's old effect moved to Muscle Memory (owners keep it) and the run's play-time start is new.
        if (!(raw.version >= 12)) {
            if (s.prestige.levels.headStart) s.prestige.levels.muscleMemory = s.prestige.levels.headStart;
            s.stats.runPlayStart = Math.max(0, s.stats.playTime - Math.max(0, (num(raw.lastSaved, d.lastSaved) - s.stats.runStart) / 1000));
        }
        s.challengesDone = cleanMap(raw.challengesDone, (k, v) => Object.hasOwn(CHALLENGE_BY_ID, k) && v === true);
        const rc = raw.challenge;
        s.challenge = rc && Object.hasOwn(CHALLENGE_BY_ID, rc.id) && !s.challengesDone[rc.id] ? { id: rc.id, start: num(rc.start, 0) } : null;
        s.transcend = { points: Math.floor(num(raw.transcend?.points, 0)), total: Math.floor(num(raw.transcend?.total, 0)), count: Math.floor(num(raw.transcend?.count, 0)) };
        s.transcend.total = Math.max(s.transcend.total, s.transcend.points);
        s.transcend.perks = cleanMap(raw.transcend?.perks, (k, v) => Object.hasOwn(PERK_BY_ID, k) && Number.isInteger(v) && v > 0);
        for (const k of Object.keys(s.transcend.perks)) s.transcend.perks[k] = Math.min(s.transcend.perks[k], PERK_BY_ID[k].costs.length);
        // v10 stores each leg's best run without XP multipliers (they apply live): divide out today's.
        if (!(raw.version >= 10)) {
            const m = derive(s).xpMult / projectBoosts(s).xp;
            s.path.legBest = s.path.legBest.map(v => v / m);
        }
        s.lastSaved = num(raw.lastSaved, d.lastSaved);
        return s;
    }

    const MAX_BOOST = 4;     // the largest investor boost a save may hold (rewards give ×1.5 and ×2)
    const MAX_BOOSTS = 8;    // and how many may run at once (three offers at a time; boosts last 3-5 minutes)
    function cleanProjects(raw, fallback) {
        if (!raw || typeof raw !== 'object') return fallback;
        const offers = (Array.isArray(raw.offers) ? raw.offers : []).filter(o => o && typeof o.task === 'string' && Object.hasOwn(PROJECT_TASKS, o.task)
            && Number.isInteger(o.reward) && o.reward >= 0 && o.reward < PROJECT_REWARDS.length && typeof o.investor === 'string'
            && [o.id, o.target, o.start, o.deadline].every(v => Number.isFinite(v))).slice(0, PROJECTS.maxOffers);
        // Rewards multiply by 1.5 or 2; a tampered save's ×1e300 (or a pile of boosts) overflowed training XP to
        // Infinity, so each is held to MAX_BOOST and only the last few are kept.
        const boosts = (Array.isArray(raw.boosts) ? raw.boosts : []).filter(b => b && ['cp', 'dp', 'xp', 'push', 'rp'].includes(b.stat)
            && Number.isFinite(b.mult) && b.mult > 0 && Number.isFinite(b.until))
            .slice(-MAX_BOOSTS).map(b => ({ stat: b.stat, mult: Math.min(MAX_BOOST, b.mult), until: b.until }));
        return { offers, boosts, next: num(raw.next, fallback.next), seq: Math.floor(num(raw.seq, 0)) };
    }

    // Dilemmas from a save: known ids only, answers within their choices, a bounded order and freedom.
    function cleanDilemmas(raw, fallback) {
        if (!raw || typeof raw !== 'object') return fallback;
        const known = id => typeof id === 'string' && !!dilemmaById(id);
        const answered = {}, outcomes = {};
        for (const [k, v] of Object.entries(raw.answered || {})) if (known(k) && Number.isInteger(v) && v >= 0 && v < dilemmaById(k).choices.length) answered[k] = v;
        for (const [k, v] of Object.entries(raw.outcomes || {})) if (k in answered && typeof v === 'boolean') outcomes[k] = v;
        const order = (Array.isArray(raw.order) ? raw.order : []).filter(k => typeof k === 'string' && /^[mdo]:[\w]+$/.test(k))
            .filter((k, i, a) => a.indexOf(k) === i).slice(-MAIL_ORDER_MAX);
        const later = (Array.isArray(raw.later) ? raw.later : []).filter(l => l && l.id in answered && l.choice === answered[l.id]
            && Number.isFinite(l.at) && typeof l.win === 'boolean' && !(l.id in outcomes)).map(l => ({ id: l.id, choice: l.choice, at: l.at, win: l.win }));
        const open = known(raw.open) && !(raw.open in answered) ? raw.open : null;
        const endingId = ENDINGS.some(e => e.id === raw.ending) ? raw.ending : undefined;
        return { ...(endingId ? { ending: endingId } : {}), order, open, answered, outcomes, later, freedom: Math.min(50, Math.max(0, Math.floor(num(raw.freedom, 0)))),
            next: num(raw.next, 0), seq: Math.max(0, Math.floor(num(raw.seq, 0))) };
    }

    // Training nodes taken out of the tree, with their prices, so migrate() can refund what was spent.
    const REMOVED_NODES = {
        viralPaper: { xp: 650, scale: 1.6 }, goingViral: { xp: 1800, scale: 1.8 },
        crunchTime: { xp: 400, scale: 2 }, deathMarch: { xp: 6000, scale: 1.9 }
    };

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
            settings: { autosave: set.autoSaveEnabled },
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
        // Only a save object: valid JSON like `1` or `null` would otherwise import as a fresh game.
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return migrate(raw, now);
    }

    // ---- Formatting -----------------------------------------------------

    const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    const NOTATIONS = ['standard', 'scientific', 'engineering'];
    let notation = 'standard';   // set from the player's settings (setNotation)
    const setNotation = mode => { notation = NOTATIONS.includes(mode) ? mode : 'standard'; };

    function format(n, decimals) {
        if (Number.isNaN(n)) return '—';
        const sign = n < 0 ? '-' : '';
        if (!Number.isFinite(n)) return sign + '∞';
        n = Math.abs(n);
        if (n < 1000) {
            const dp = decimals ?? (n < 10 && n % 1 !== 0 ? 1 : 0);
            // 9.96 rounds up to 10: drop the decimal there, as for any other 10.
            return sign + (dp ? (decimals == null && n >= 9.95 ? '10' : n.toFixed(dp)) : Math.floor(n).toString());
        }
        if (notation !== 'standard') {
            let exp = Math.floor(Math.log10(n));
            let mant = n / Math.pow(10, exp);
            if (Number(mant.toFixed(2)) >= 10) { mant /= 10; exp++; }
            if (notation === 'engineering') {
                const shift = ((exp % 3) + 3) % 3;
                mant *= Math.pow(10, shift);
                exp -= shift;
                return sign + mant.toFixed(mant < 10 ? 2 : mant < 100 ? 1 : 0) + 'e' + exp;
            }
            return sign + mant.toFixed(2) + 'e' + exp;
        }
        let tier = Math.floor(Math.log10(n) / 3);
        // Rounding can carry into the next tier (999,999.5 → 1.00M, not 1000.0K).
        if (Number((n / Math.pow(1000, tier)).toFixed(1)) >= 1000) tier++;
        if (tier >= SUFFIXES.length) return sign + n.toExponential(2).replace('+', '');
        const scaled = n / Math.pow(1000, tier);
        return sign + scaled.toFixed(scaled < 100 ? 2 : 1) + SUFFIXES[tier];
    }

    function formatCost(cost) {
        return Object.entries(cost).map(([k, v]) => `${format(v)} ${RESOURCES[k].short}`).join(', ') || 'Free';
    }

    function formatDuration(seconds) {
        if (!Number.isFinite(seconds)) return '∞';
        seconds = Math.floor(Math.max(0, seconds));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const sec = seconds % 60;
        if (h) return `${h}h ${m}m`;
        if (m) return `${m}m ${sec}s`;
        return `${sec}s`;
    }

    return {
        SAVE_VERSION, FIRST_REAL_SKILL, TEXT_SIZES, AUTO_BUDGET, TASKS, taskOn, taskShares, taskDemand, setTaskShare, setTaskOn, autoTrainerLevel,
        versionName, currentVersion, nextVersion, insightAt, nextInsightAt, clearedPeriod, legBestXp, legXpRate, recordRun, recordLegs, restartCost, CAPACITY, capacity, atCapacity, breakGuaranteed, startBreakCountdown, WALL_SURGE_RUNS, SURGE_POWER, surgeSprint, settleSurge, settleBreakCountdown, BREAK_WINDOW, legClearXp, clearLeg, collectToken, burnCost, payBurn, NEAR_MISS, nearMiss, speedShort, chainMult, PROJECTS, PROJECT_TASKS, PROJECT_REWARDS, projectProgress, projectBoosts, claimProject, dismissProject, makeOffer, AUTOMATION, automationGate, procurementPick, ENDINGS, ending, recordLegPower, legPower, MAIL, WELCOME_NAGS, DILEMMAS, DILEMMA_GAP, FREEDOM_XP, tickDilemmas, chooseDilemma, dilemmaOutcome, mailArrive, AUTO_TRAINER_RUNS, AUTO_TRAINER_SKILL, REVEALS, PRESTIGE_MIN_INTELLIGENCE, RESEARCH_SPRINTS, CPU_AFTER_CLICK_LEVEL, PATH, SKILLS,
        RESOURCES, ATTRIBUTES, PHASES, ACTIONS, TABS, UPGRADES, UPGRADE_BY_ID, TREE_BRANCHES, MILESTONES, ACHIEVEMENTS,
        defaultState, derive, level, phaseIndex, phaseProgress, ENDING_PHASE,
        upgradeCost, actionCost, canAfford, isMaxed, isUpgradeVisible, buy, act, tick, evaluate,
        prestigeGain, prestige, insightMult, insightBoost, CHALLENGES, CHALLENGES_AFTER, challengesOpen, challengeMods, startChallenge, abandonChallenge, canTranscend, transcendGain, transcend, TRANSCEND_PERKS, perkLevel, perkCost, buyPerk, LONG_FLIGHT, BUILD, EXPLOIT_CHARGES, AUDIT_FLAGS, AUDIT_PAY, exploitCharges, grantExploit, LEG_CHARACTERS, legCharacter, characterLength, ACT_TWO_LEG, ACT_TWO_LOCKED, SNARE_OPEN_AT_START, frontierLeg, actTwoLocked, endingPhase, legPos, SKILL_INDEX, knows, WALL_EVERY, isWallLeg,
        SNARE_RED_UNIT, SNARE_RED_FLOOR, snareRedShare, SNARE_DESKTOP, snareDesktop, SNARE_RUN_FLOORS, snareCatch, snareBossDown, snareGoalMet, snareGoal, isSnareBossSector, SNARE_BOSS_EVERY, SNARE_FIRST_BOSS, snareBossOrdinal, finishSnare, snareOpts, SNARE_STAGES, RED_SECTOR, SWEEP_SECTOR, AV_SECTOR, MINION_SECTOR, FAST_SWEEP_SECTOR, MINE_SECTOR, NET_SECTOR, SWARM_SECTOR, SNARE_GATES, snareBossHp, snareBossHealth, SNARE_SKILL_BUFFS, snareSkillBuffs, snareLevels, snareOverclock, SNARE_RP_CAP, SNARE_TREE, snareTreeReady, ROGUE_SECTOR, SNARE_SECTORS, snareSectorName, snareBossHits, snareSectorPay, snareRpPerSec, SNARE_RP_SIGNAL,
        skillAt, pushCost, affordableCharge, rollSeed, payPush, bonusZone, zoneHit, cleanUnits, rollXp, pushBonusXp, grantPushBonus, finishRoll, crestSkill, learnSkill, stretchXpAt, legMetres, CLICK_TOOLS, clickTool, clickToolPower, nextClickTool, upgradeName, upgradeFlavor, sprintStrength, breakthroughHit, windfallHit, crunchHit, maxEffortHit, flowHit, superHit, luck,
        migrate, serialize, deserialize,
        format, formatCost, formatDuration, setNotation, NOTATIONS, bulkCost, maxAffordable, buyMany
    };
});
