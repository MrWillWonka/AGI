// What plays the songs: the bus and its filter and drive, the drum and synth voices, the stealth and simple versions,
// the layers that build with progress and speed, levels and the music's settings. A copy from sfx.js, taken 2026-11-14; reference only.

// ---- The music bus and its voices (sfx.js lines 1203-1387) ----
// ---- Music: songs in each track's voice, that follow the run -----------------------------------------
// A step sequencer (16 steps a bar) scheduled a little ahead on the audio clock. Each track (Classic, Dark,
// Soft, Ominous, Retro) has its drums and instruments (`STYLES`) and six songs (`SONGS`): two for the lab
// (and Surveillance and R&D), two for the server room (and its bays) and two for Packet Snare's bay. A song is an eight-bar chord
// progression with voiced chords, a bass line that follows it, a four-bar melody (A) and an eight-bar one
// (B), played in a two-minute form (`FORM`): intro, A, B, A, a breakdown, B, A with a harmony, out. Then the
// area's other song takes over; moving between the lab and the server room changes song on the next bar,
// and coming back picks a song up at the section it left. Layers come in with the intensity (0-1, from the
// ball's speed in game.js): off-beat hats, a clap, 16th hats and an arpeggio of the chord when it's flying.
// Power-ups bend it: a crunch distorts it, flow and bullet time slow and muffle it, a breakthrough is a
// swell that opens the filter and lands on a crash. Its own volume (`setMusic`), so sounds and music can be
// set apart; silent until the first gesture, like everything here.
let music = null;               // { bus, parts, drive, dry, wet, filter, trim, nextStep, step, timer, song… }
let musicVolume = 0.35;
let intensity = 0;
let mode = null;                // null | 'crunch' | 'flow' | 'freeze'
let area = 'lab';               // 'lab' | 'server' | 'snare' (game.js, `setArea`)
let depth = 0;                  // 0-1: how much of the arrangement the game has earned (game.js, `setDepth`)
let training = false;           // the beat plays only while training (game.js, `setTraining`)
let songLvl = 1;                // the current song's level trim, on its pitched voices

function driveCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
}

function startMusic() {
    if (music || musicVolume <= 0 || !ensure() || ctx.state !== 'running') return;
    const bus = ctx.createGain();
    bus.gain.value = musicLevel();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;
    const drive = ctx.createWaveShaper();
    drive.curve = driveCurve(40);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.gain.value = 1;
    wet.gain.value = 0;
    const parts = { beat: ctx.createGain(), tones: ctx.createGain() };
    for (const [k, g] of Object.entries(parts)) { g.gain.value = partLevel(k); g.connect(bus); }
    bus.connect(dry).connect(filter);
    bus.connect(drive).connect(wet).connect(filter);
    // The beat's trim comes after the drive, which would otherwise saturate back up to full level.
    const trim = ctx.createGain();
    trim.gain.value = styleTrim();
    filter.connect(trim).connect(out);
    const first = nextStep(16, 0.05);          // joins the clock on a downbeat, in time with the grid sounds
    music = { bus, parts, drive, dry, wet, filter, trim, nextStep: first.t, step: first.n,
        area, song: songFor[area], songStep: first.n, left: {}, cmd: null };
    music.timer = setInterval(schedule, 25);
}

function stopMusic() {
    if (!music) return;
    clearInterval(music.timer);
    const m = music;
    music = null;
    if (clock.len !== STEP) { const n = Math.ceil(stepAt(ctx.currentTime)); retime(STEP, n, stepTime(n)); }
    m.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    setTimeout(() => m.filter.disconnect(), 600);
}

// One voice into the music, through its part: the beat (kick, hats, claps) or the tones (everything
// pitched), each with its own volume in Settings (`setMusicMix`).
function voice(fn, part = 'tones') {
    const g = ctx.createGain();
    g.connect(music.parts[part] || music.bus);
    fn(g);
}
const shift = () => (STYLES[style] || STYLES.classic).shift || 0;   // the track's key, from A
function kick(t, gain, from = 150, to = 45, decay = 0.28) {
    voice(g => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(from, t);
        o.frequency.exponentialRampToValueAtTime(to, t + 0.12);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g);
        o.start(t);
        o.stop(t + decay + 0.02);
    }, 'beat');
}
// A noise swell rising into the next bar (the fills): its gain and filter climb to the downbeat.
function riser(t, dur, gain) {
    voice(g => {
        if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(5000, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        src.connect(f).connect(g);
        src.start(t);
        src.stop(t + dur + 0.1);
    }, 'beat');
}
// A soft chord held for a bar (pads): slow attack, gentle release.
function pad(t, notes, dur, gain, type = 'triangle', cutoff = 1400) {
    for (const n of notes) voice(g => {
        const o = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        o.type = type;
        o.frequency.value = NOTE(n + shift());
        o.detune.value = (Math.random() - 0.5) * 10;
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain * songLvl, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
    });
}
function hat(t, gain, len = 0.04) {
    voice(g => {
        if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });   // builds the shared noise buffer
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(f).connect(g);
        src.start(t, Math.random() * 0.5);
        src.stop(t + len + 0.02);
    }, 'beat');
}
function clap(t, gain) {
    voice(g => {
        if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1600;
        f.Q.value = 0.9;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        src.connect(f).connect(g);
        src.start(t, Math.random() * 0.5);
        src.stop(t + 0.2);
    }, 'beat');
}
// A pitched voice; `q` the filter's resonance, `env` sweeps the filter down from cutoff × (1 + env) (acid),
// `attack` in seconds (pads and slow leads).
function synth(t, note, dur, gain, type, cutoff, q = 6, env = 0, detune = 0, attack = 0.008) {
    voice(g => {
        const o = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        o.type = type;
        o.frequency.value = NOTE(note + shift());
        if (detune) o.detune.value = detune;
        f.type = 'lowpass';
        f.Q.value = q;
        if (env) {
            f.frequency.setValueAtTime(cutoff * (1 + env), t);
            f.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff), t + Math.min(dur, 0.18));
        } else f.frequency.value = cutoff;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain * songLvl, t + Math.min(attack, dur * 0.5));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g);
        o.start(t);
        o.stop(t + dur + 0.02);
    });
}

// ---- Songs ----------------------------------------------------------------------------------------
// Everything is written in A (A minor, A Phrygian…, or C major for the bright songs, its relative), and the
// track's `shift` moves it to the track's key: Classic and Retro stay in A minor / C major, Dark goes to E
// (Phrygian), Soft to D minor / F major, Ominous to C. The sounds sit in the same keys (KEYS).

// ---- Stealth and simple versions, levels, the scheduler, settings (sfx.js lines 1899-2123) ----
// Packet Snare's songs are stealth versions of each track: until you're spotted their kick plays its own sparse
// pattern (`kick`: 'x' a kick, 'o' a softer one), hushed (`hush`), and crossfades into the track's own as the
// clap's layer comes in (the busier the field and the lower your Focus, the more of it); a quiet clock ticks
// (`tick`, the same marks) and hides under the 16th hats as they arrive; the whole mix sits under a closed
// filter at rest (`cut`) that opens with the intensity. `kickLevel` is the kick's level on a step (0: none).
function kickLevel(c, s, on, plain = false) {
    if (!c.drums && !plain) return 0;
    const p = c.song.kick;
    if (!p) return on ? 1 : 0;
    const hid = (p[s] === 'x' ? 1 : p[s] === 'o' ? 0.6 : 0) * (c.song.hush ?? 1);
    const g = hid * (1 - c.spot) + (on ? c.spot : 0);
    return g > 0.02 ? g : 0;
}
function stealthStep(t, s, k, len, L, c) {
    const m = c.song.tick?.[s];
    if (!m || m === '.' || !c.drums) return;
    const st = STYLES[style] || STYLES.classic;
    hat(t, (m === 'x' ? 1 : 0.55) * 0.05 * (st.tick ?? 1) * (1 - 0.7 * L.sixteenth), 0.014);
}

// Simple sounds: each song stripped to its bones, in its key: a kick (Ominous's on 1 and 3), the bass on
// beats 1 and 3 on the chord's root, one held chord tone each bar (voice-led, so it never rubs), and the
// melody in a plain sine (Retro: a square), all in the track's plain voice; no hats, claps, chords,
// arpeggios, fills or drive.
function simpleStep(st, t, s, k, len, c, L) {
    const sv = st.simpleVoice || 'triangle';
    const kg = kickLevel(c, s, st === STYLES.ominous ? s % 8 === 0 : s % 4 === 0, true);
    if (kg) kick(t, 0.38 * kg, 130, 45, 0.22);
    if (s === 0 || s === 8) synth(t, c.chord.root + 12, len * 6, 0.16, sv, 700, 1);
    if (L.pad > 0.02 && s === 0) synth(t, c.chord.hold, len * 14, 0.035 * L.pad, 'sine', 3000, 1);
    if (c.mel) synth(t, c.mel.n, Math.min(len * c.mel.len * 0.9, 0.7), 0.03 * c.melGain * (sv === 'square' ? 0.5 : 1), sv === 'square' ? 'square' : 'sine', 2500, 1);
}

// The bus level for the music volume, and each beat's trim (`gain` on the style, measured RMS against Classic,
// all at the same level (K-weighted, within about 1 dB of Classic; re-measure if a track changes).
const musicLevel = () => musicVolume * 0.55;
const styleTrim = () => { const st = STYLES[style] || STYLES.classic; return (simple ? st.simpleMix?.gain : st.gain) || 1; };
function setMusicStyle(name) {
    if (!STYLES[name]) return;
    style = name;
    chargeStop();
    if (music) {
        music.trim.gain.setTargetAtTime(styleTrim(), ctx.currentTime, 0.3);
        for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.3);
    }
}

// Layers fade in and out over a couple of bars rather than switching on a threshold: the intensity
// eases toward the ball's speed (faster on the way up than down), each layer's level ramps across a
// band around its threshold, and the tempo glides into and out of flow's slow-down.
const RISE = 1.2, FALL = 3;       // seconds (time constants) for the intensity to follow speed
const layer = (k, at) => Math.max(0, Math.min(1, (k - at) / 0.2 + 0.5));
const songsOf = () => (SONGS[style] || SONGS.classic);
const areaSongs = a => songsOf()[a] || songsOf().server;
// On a downbeat: change song if the area changed (the old area's place is kept, to its section), after a
// whole song (the area's other one), or on a debug command.
function songTurn() {
    const m = music;
    const bar = Math.floor((m.step - m.songStep) / 16);
    if (m.area !== area) {
        m.left[m.area] = { song: m.song, bar: Math.floor(bar / 8) * 8 % SONG_BARS };
        const back = m.left[area];
        m.area = area;
        m.song = back ? back.song : songFor[area];
        m.songStep = m.step - 16 * (back ? back.bar : 0);
    } else if (m.cmd === 'song' || bar >= SONG_BARS) {
        m.song = songFor[area] = (m.song + 1) % 2;
        m.songStep = m.step;
    } else if (m.cmd === 'section') m.songStep = m.step - 16 * ((Math.floor(bar / 8) + 1) * 8 % SONG_BARS);
    m.cmd = null;
}
function songContext(s) {
    const m = music, song = areaSongs(m.area)[m.song];
    const bar = Math.floor((m.step - m.songStep) / 16), barIn = bar % 8;
    const sec = FORM[Math.floor(bar / 8) % FORM.length];
    let e = null;
    if (sec === 'A' || sec === 'A2' || sec === 'break') e = song.melA[(barIn % 4) * 16 + s];
    else if (sec === 'B') e = song.melB[barIn * 16 + s];
    const n = song.chords.length;
    return {
        song, bar, barIn, sec, chord: song.chords[bar % n], next: song.chords[(bar + 1) % n],
        mel: e && { n: melNote(song, e), len: e.len, harm: sec === 'A2' ? melNote(song, e, -2) : 0 },
        melGain: sec === 'break' ? 0.6 : 1,
        drums: !(sec === 'break' && barIn < 6), bassOn: !(sec === 'break' && barIn < 4)
    };
}
function schedule() {
    if (!music || ctx.state !== 'running' || document.hidden) return;
    const now = ctx.currentTime;
    const dt = Math.min(0.5, now - (music.last ?? now));
    music.last = now;
    music.k ??= intensity;
    music.k += (intensity - music.k) * (1 - Math.exp(-dt / (intensity > music.k ? RISE : FALL)));
    const k = music.k;
    const slow = mode === 'flow' || mode === 'freeze';
    const target = STEP / (slow ? 0.6 : 1);
    while (music.nextStep < now + 0.12) {
        // The tempo glides a step at a time (about a bar to settle).
        const len = Math.abs(clock.len - target) < 1e-4 ? target : clock.len + (target - clock.len) * 0.12;
        if (len !== clock.len) retime(len, music.step, music.nextStep);
        const t = music.nextStep;
        const s = ((music.step % 16) + 16) % 16;
        if (s === 0) songTurn();
        // The arrangement builds: what the game has earned (`depth`) and the run's speed (`k`) add up to how
        // many parts play, each fading in over a band: chords, then off-beat hats, the melody, a clap, 16th
        // hats, the A2 harmony and fills, the arpeggio. A new game at rest is a kick and a bass.
        const S = 0.6 * depth + 0.6 * Math.max(0, k - 0.05);
        const L = { pad: layer(S, 0.12), off: layer(S, 0.28), mel: layer(S, 0.4), clap: layer(S, 0.52), sixteenth: layer(S, 0.64), harm: layer(S, 0.72), arp: layer(S, 0.82) };
        const st8 = STYLES[style] || STYLES.classic;
        const c = songContext(s);
        if (s === 0) { (music.chordLog ||= []).push({ t, ch: c.chord }); if (music.chordLog.length > 3) music.chordLog.shift(); }
        // A stealth song's tones stand a little forward while its drums are hushed (`rest`), so it keeps the level.
        c.spot = L.clap;
        const lvl = simple ? c.song.slvl ?? c.song.lvl : c.song.lvl, rest = simple ? c.song.srest ?? c.song.rest : c.song.rest;
        songLvl = lvl * (rest ? 1 + (rest - 1) * (1 - c.spot) : 1);
        // The melody waits for its layer; the A2 harmony for its own.
        if (c.mel && L.mel <= 0.02) c.mel = null;
        if (c.mel) { c.melGain *= L.mel; if (L.harm < 0.5) c.mel.harm = 0; }
        try {
            if (simple) simpleStep(st8, t, s, k, len, c, L);
            else {
                st8.step(t, s, k, len, L, c);
                if (c.song.tick) stealthStep(t, s, k, len, L, c);
                // Every eighth bar ends in a fill, so the song phrases instead of repeating one bar for ever.
                if (st8.fill && L.off > 0.5 && c.barIn === 7 && s >= 12) st8.fill(t, s, k, len, L, c);
            }
        } catch { /* a bad note never stops the music */ }
        songLvl = 1;
        music.nextStep += len;
        music.step++;
    }
    // The mood: muffled in flow and bullet time, distorted in a crunch, opening up with speed.
    const st = STYLES[style] || STYLES.classic;
    const cut = areaSongs(music.area)[music.song]?.cut;
    const cutoff = slow ? 600 : st.cutoff(k) * (cut ? cut + (1 - cut) * k : 1);
    music.filter.frequency.setTargetAtTime(cutoff, now, slow ? 0.6 : 0.5);
    music.wet.gain.setTargetAtTime(mode === 'crunch' ? 0.55 : simple ? 0 : st.drive, now, 0.15);
    music.dry.gain.setTargetAtTime(mode === 'crunch' ? 0.6 : 1, now, 0.15);
}

// Where the player is (game.js): 'lab' (the lab, Surveillance, R&D), 'server' (the server room and its bays) or
// 'snare' (Packet Snare's bay); anything else is the lab. The music changes song on the next bar.
function setArea(a) { area = AREAS.includes(a) ? a : 'lab'; }
function setDepth(d) { depth = Math.max(0, Math.min(1, Number(d) || 0)); }
// What's playing (the debug panel), and debug commands on the next downbeat: the area's other song, or the
// next section.
function songNow() {
    if (!music) return null;
    const bar = Math.floor((music.step - music.songStep) / 16);
    return { area: music.area, song: music.song + 1, section: FORM[Math.floor(bar / 8) % FORM.length], bar: (bar % 8) + 1 };
}
function songCmd(cmd) { if (music) music.cmd = cmd; }

// The ball's speed (0-1), and the power-up shaping the beat, from game.js.
function musicState(k, m = null) {
    intensity = Math.max(0, Math.min(1, Number(k) || 0));
    mode = m;
    if (musicVolume > 0 && ctx?.state === 'running') startMusic();
}

// A breakthrough: a rising swell into the filter, then a crash on the next beat.
function swell() {
    if (!music) return;
    const now = ctx.currentTime;
    const hit = nextStep(4, 0.45).t;            // the crash lands on a beat, half a second or so away
    music.filter.frequency.cancelScheduledValues(now);
    music.filter.frequency.setValueAtTime(music.filter.frequency.value, now);
    music.filter.frequency.exponentialRampToValueAtTime(14000, hit);
    music.bus.gain.setTargetAtTime(musicLevel() * 1.55, now, 0.15);
    music.bus.gain.setTargetAtTime(musicLevel(), hit + 0.3, 0.4);
    voice(g => {
        if (!noiseBuf) noise({ dur: 0.01, gain: 0.0001 });
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(400, now);
        f.frequency.exponentialRampToValueAtTime(6000, hit);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.25, hit - 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, hit + 0.8);
        src.connect(f).connect(g);
        src.start(now);
        src.stop(hit + 0.9);
    });
    kick(hit, 0.7);
    hat(hit, 0.2, 0.6);
    synth(hit, 33, 0.8, 0.2, 'sawtooth', 900);
}

// The music's parts, each 0-1 (Settings → Music: Beat and Tones, per device).
const musicMix = { beat: 1, tones: 1 };
function setMusicMix(m) {
    for (const k of Object.keys(musicMix)) if (m && m[k] != null) musicMix[k] = Math.max(0, Math.min(1, Number(m[k]) || 0));
    if (music) for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.05);
}
// A part's level: the player's slider times the track's balance (`beat`/`tones` on the style: the drums sit
// about 2 dB under the tones on every track, measured; at an even split the beat drowned the music).
// The beat (kick, hats, claps, fills) plays only while training (`setTraining`); everywhere else the music
// is its tones alone.
const partLevel = k => { const st = STYLES[style] || STYLES.classic; return musicMix[k] * ((simple ? st.simpleMix?.[k] : st[k]) ?? 1) * (k === 'beat' && !training ? 0 : 1); };
// In the training run view (game.js): the beat comes in over about a bar, and leaves the same way.
function setTraining(on) {
    on = !!on;
    if (on === training) return;
    training = on;
    if (music) music.parts.beat.gain.setTargetAtTime(Math.max(0.0001, partLevel('beat')), ctx.currentTime, 0.6);
}

function setMusic(v) {
    musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
    if (musicVolume <= 0) return stopMusic();
    if (music) music.bus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05);
}

// Simple sounds on or off: the music's levels follow (the simple tracks have their own balance).
function setSimple(v) {
    simple = !!v;
    chargeStop();
    if (music) {
        music.trim.gain.setTargetAtTime(styleTrim(), ctx.currentTime, 0.2);
        for (const k of Object.keys(musicMix)) music.parts[k].gain.setTargetAtTime(partLevel(k), ctx.currentTime, 0.2);
    }
}
