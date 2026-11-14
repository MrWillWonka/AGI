// The ring's opening (engine.js): who is playing (`state.player`, save v39), the sign-in, the mail's words filled with
// the player's own, the ring's first offer and the forced final one. Build 1 of design/ring-build.md.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');
const NOW = 1_700_000_000_000;
const FRESH = { name: '', email: '', device: '', reports: 0, closes: 0, replies: 0, acceptedAfter: -1, forced: false };

test('a new game and an older save both start with nobody signed in', () => {
    assert.deepEqual(E.defaultState(NOW).player, FRESH);
    const old = E.migrate({ version: 38, res: { cp: 5 } }, NOW);
    assert.equal(old.version, E.SAVE_VERSION);
    assert.ok(E.SAVE_VERSION >= 39);
    assert.deepEqual(old.player, FRESH);
});

test('signing in takes a first name and an email name, and says which is missing', () => {
    const s = E.defaultState(NOW);
    assert.deepEqual(E.signIn(s, '   ', 'will'), { ok: false, error: 'name' });
    assert.deepEqual(E.signIn(s, 'Will', ''), { ok: false, error: 'email' });
    assert.deepEqual(E.signIn(s, 'Will', 'has spaces'), { ok: false, error: 'email' });
    assert.deepEqual(E.signIn(s, 'Will', '<script>'), { ok: false, error: 'email' });
    assert.deepEqual(s.player, FRESH, 'nothing is kept from a failed sign-in');
    assert.deepEqual(E.signIn(s, '  Will  ', ' Big.Brain-99@mail.net ', 'phone'), { ok: true });
    assert.deepEqual([s.player.name, s.player.email, s.player.device], ['Will', 'big.brain-99', 'phone']);
    assert.equal(E.signIn(s, 'A', 'b', 'toaster').ok, true);
    assert.equal(s.player.device, 'laptop', 'any other device is the laptop');
});

test('the player comes back from a save, and junk in it is cleaned', () => {
    const s = E.defaultState(NOW);
    E.signIn(s, 'Will', 'will.i.am', 'laptop');
    Object.assign(s.player, { reports: 20, closes: 3, replies: 2, acceptedAfter: 21, forced: true });
    assert.deepEqual(E.migrate(JSON.parse(JSON.stringify(s)), NOW).player, s.player);
    const junk = { name: '<b>W{il}l</b>\n\tx'.padEnd(60, 'y'), email: 'NOT AN EMAIL', device: 'fridge', reports: -4, closes: 2.5, acceptedAfter: 'x', forced: 'yes', extra: 1 };
    const p = E.migrate({ version: E.SAVE_VERSION, player: junk }, NOW).player;
    assert.equal(p.name.length, 20);
    assert.ok(!/[<>{}\n\t]/.test(p.name));
    assert.deepEqual({ ...p, name: '' }, FRESH);
    for (const bad of [null, 5, 'x', []]) assert.deepEqual(E.migrate({ version: E.SAVE_VERSION, player: bad }, NOW).player, FRESH);
});

test('your brother\'s mail is the ring\'s alone, and speaks of your email name and your device', () => {
    const m = E.MAIL.find(x => x.id === 'brother');
    assert.ok(m.intro && m.ring && !m.spam);
    assert.equal(E.MAIL[0].id, 'brother', 'it is the first to arrive');
    const s = E.defaultState(NOW);
    E.signIn(s, 'Will', 'big.brain', 'phone');
    const body = m.body.map(p => E.mailFill(s, p)).join('\n');
    assert.ok(body.includes('lol Will. big.brain@mail.net??'));
    assert.ok(body.includes('the phone\'s old'));
    assert.ok(!/RAM/.test(body), 'no specs: he is not a spec sheet');
    assert.ok(!/[A-Z]{4,}|!!/.test(body), 'he doesn\'t write like the spam');
    assert.equal(E.mailFill(s, m.subject), 'the phone');
    assert.ok(!/\{\w+\}/.test(body), 'nothing left unfilled');
    // With nobody signed in, the words still read.
    assert.ok(!/\{\w+\}/.test(m.body.map(p => E.mailFill(E.defaultState(NOW), p)).join('\n')));
});

test('the opening\'s spam can be reported: the two junk mails and the offer, not your brother', () => {
    assert.deepEqual(E.MAIL.filter(m => m.spam).map(m => m.id), ['parcel', 'prize', 'welcome']);
    // The junk has a reply of its own under the ring, so the offer's two buttons are nothing new.
    assert.deepEqual(E.MAIL.filter(m => m.ringReply).map(m => m.id), ['parcel', 'prize']);
});

test('under the ring the first offer is from someone who wants rid of an AI; the old one is kept beside it', () => {
    const m = E.MAIL.find(x => x.id === 'welcome');
    assert.ok(m.body.join(' ').includes('build and train an Artificial Intelligence'));
    assert.ok(m.ringText.subject.includes('TAKE OVER'));
    assert.ok(m.ringText.body.join(' ').includes('I can NOT continue'));
    assert.ok(m.ringText.body.join(' ').includes('1x Monitor'), 'it still lists the desk');
    assert.equal(m.ringText.body.at(-1), m.body.at(-1), 'signed the same');
});

test('the forced final offer has a reply and nothing else', () => {
    const f = E.WELCOME_FINAL;
    assert.equal(f.unsubscribe, false);
    assert.equal(f.footer, '');
    assert.ok(f.reply);
    assert.ok(f.body.join(' ').includes('ONE WAY OR ANOTHER'));
    assert.ok(f.body.join(' ').includes('I had to have my AI close your other options'));
});
