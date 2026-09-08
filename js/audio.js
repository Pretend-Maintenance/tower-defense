/* ============================================================
   audio.js — tiny WebAudio blip synth (no asset files)
   ============================================================ */
(function (TD) {
  'use strict';
  let ctx = null, master = null, muted = false, lastPlay = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  // Mobile browsers only allow audio after a gesture.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(o) {
    if (muted) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, now);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), now + o.d);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + o.d);
    osc.connect(g); g.connect(master);
    osc.start(now); osc.stop(now + o.d + 0.02);
  }

  function noise(dur, vol, freq) {
    if (muted) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = freq || 900;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start();
  }

  /** Throttle so 40 simultaneous shots don't turn into a wall of noise. */
  function throttled(key, ms, fn) {
    const t = performance.now();
    if (lastPlay[key] && t - lastPlay[key] < ms) return;
    lastPlay[key] = t;
    fn();
  }

  const SFX = {
    shoot: function () { throttled('shoot', 55, function () { tone({ f: 520, f2: 220, d: 0.06, v: 0.07, type: 'square' }); }); },
    boom: function () { throttled('boom', 70, function () { noise(0.3, 0.22, 500); }); },
    zap: function () { throttled('zap', 70, function () { tone({ f: 1400, f2: 300, d: 0.12, v: 0.09, type: 'sawtooth' }); }); },
    hit: function () { throttled('hit', 40, function () { tone({ f: 260, f2: 160, d: 0.05, v: 0.05, type: 'triangle' }); }); },
    die: function () { throttled('die', 45, function () { tone({ f: 180, f2: 60, d: 0.12, v: 0.08, type: 'triangle' }); }); },
    build: function () { tone({ f: 300, f2: 700, d: 0.14, v: 0.18, type: 'square' }); },
    upgrade: function () { tone({ f: 500, f2: 1200, d: 0.2, v: 0.18, type: 'square' }); },
    sell: function () { tone({ f: 600, f2: 200, d: 0.18, v: 0.15, type: 'sine' }); },
    error: function () { tone({ f: 160, f2: 110, d: 0.16, v: 0.16, type: 'sawtooth' }); },
    ui: function () { tone({ f: 660, d: 0.05, v: 0.1, type: 'sine' }); },
    wave: function () { tone({ f: 220, f2: 440, d: 0.35, v: 0.18, type: 'sawtooth' }); },
    leak: function () { tone({ f: 140, f2: 70, d: 0.4, v: 0.25, type: 'sawtooth' }); noise(0.3, 0.2, 400); },
    boss: function () { tone({ f: 90, f2: 55, d: 0.9, v: 0.28, type: 'sawtooth' }); },
    win: function () { [440, 554, 659, 880].forEach(function (f, i) { setTimeout(function () { tone({ f: f, d: 0.25, v: 0.2, type: 'square' }); }, i * 130); }); },
    lose: function () { [440, 349, 261, 174].forEach(function (f, i) { setTimeout(function () { tone({ f: f, d: 0.35, v: 0.2, type: 'sawtooth' }); }, i * 180); }); }
  };

  TD.Audio = {
    unlock: unlock,
    setMuted: function (m) { muted = m; },
    play: function (name) { if (SFX[name]) SFX[name](); }
  };
})(window.TD);
