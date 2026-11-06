// tools/sim.js mirrors game.js's run loop by hand (the balance numbers in CLAUDE.md come from it). These checks
// keep the copied constants and the run's economy calls in step, so a change to one is noticed in the other.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const sim = fs.readFileSync(path.join(__dirname, '..', 'tools', 'sim.js'), 'utf8');
const constant = (src, name) => {
    const m = src.match(new RegExp(`const ${name} = ([0-9.]+);`));
    return m ? Number(m[1]) : undefined;
};
const calls = src => new Set([...src.matchAll(/\bE\.([a-zA-Z]+)(?:\?\.)?\(/g)].map(m => m[1]));

test('the balance sim uses the run loop\'s constants', () => {
    for (const [inGame, inSim] of [['FIRST_SUMMIT_MARGIN', 'FIRST_SUMMIT_MARGIN'], ['AUTO_THRUST_SPEED', 'AUTO_THRUST_SPEED'],
        ['STUCK_GRACE', 'STUCK_GRACE'], ['RESULT_PAUSE', 'AUTO_PAUSE']]) {
        const g = constant(game, inGame);
        assert.ok(g !== undefined, `game.js defines ${inGame}`);
        assert.equal(constant(sim, inSim), g, `tools/sim.js ${inSim} matches game.js ${inGame}`);
    }
});

test('the balance sim makes the run loop\'s economy calls (crunches and flows, legacy only, are known gaps)', () => {
    // Every engine call that pays for, rolls the luck of or settles a run in game.js.
    const RUN_ECONOMY = ['payPush', 'payBurn', 'grantPushBonus', 'crestSkill', 'clearLeg', 'collectToken', 'finishRoll', 'settleBreakCountdown',
        'settleSurge', 'recordLegs', 'nearMiss', 'surgeSprint', 'breakthroughHit', 'breakGuaranteed', 'firstBreakSmashes', 'superHit',
        'maxEffortHit', 'windfallHit', 'crunchHit', 'flowHit'];
    const KNOWN_GAPS = new Set(['crunchHit', 'flowHit']);
    const g = calls(game), s = calls(sim);
    for (const fn of RUN_ECONOMY) {
        assert.ok(g.has(fn), `game.js still calls E.${fn} (update this list if the run loop changed)`);
        if (KNOWN_GAPS.has(fn)) assert.ok(!s.has(fn), `tools/sim.js now calls E.${fn}: take it off the known gaps`);
        else assert.ok(s.has(fn), `tools/sim.js calls E.${fn} like game.js`);
    }
});
