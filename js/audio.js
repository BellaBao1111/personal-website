/* ------------------------------------------------------------------
   audio.js — every sound is synthesised, there are no audio files.
   The scientist plays soft plucks in the left ear, the engineer plays
   square-wave blips in the right. At the merge, both move to the centre.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  let ac = null, master = null, wet = null, on = true, merged = false;
  let drones = [];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // major pentatonic
  const ROOT = 196; // G3
  const hz = (semi) => ROOT * Math.pow(2, semi / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') { try { ac.resume().catch(() => {}); } catch (e) {} } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = on ? 0.5 : 0;
    master.connect(ac.destination);

    // a small feedback delay stands in for a room
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    wet = ac.createGain(); wet.gain.value = 0.22;
    wet.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);

    startDrones();
  }

  function pan(side) {
    if (merged) return 0;
    return side === 'L' ? -0.75 : side === 'R' ? 0.75 : 0;
  }

  function out(node, side) {
    let last = node;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan(side);
      node.connect(p); last = p;
    }
    last.connect(master);
    last.connect(wet);
  }

  // one note. type: 'pluck' (scientist) or 'blip' (engineer)
  function note(freq, side, opts) {
    if (!ac || !on) return;
    opts = opts || {};
    const t = ac.currentTime + (opts.delay || 0);
    const dur = opts.dur || (side === 'L' ? 0.5 : 0.16);
    const vol = opts.vol || 0.16;
    const o = ac.createOscillator();
    const g = ac.createGain();
    if (side === 'R') {
      o.type = 'square';
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      o.connect(f); f.connect(g);
      g.gain.setValueAtTime(vol * 0.55, t);
      g.gain.setValueAtTime(vol * 0.55, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      o.type = side === 'L' ? 'triangle' : 'sine';
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(freq * opts.slide, t + dur);
    out(g, side);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(side, dur, vol, freq) {
    if (!ac || !on) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 600;
    const g = ac.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); out(g, side);
    src.start();
  }

  function startDrones() {
    // two quiet drones a fifth apart, one per ear
    [['L', 'sine', -12, 0.045], ['R', 'sawtooth', -5, 0.012]].forEach(([side, type, semi, vol]) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = hz(semi);
      const o2 = ac.createOscillator(); o2.type = type; o2.frequency.value = hz(semi) * 1.004;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = side === 'R' ? 500 : 900;
      const g = ac.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, ac.currentTime + 3);
      o.connect(f); o2.connect(f); f.connect(g);
      let p = null;
      if (ac.createStereoPanner) { p = ac.createStereoPanner(); p.pan.value = pan(side); g.connect(p); p.connect(master); }
      else g.connect(master);
      o.start(); o2.start();
      drones.push({ o, o2, g, p });
    });
  }

  let step = { L: 0, R: 0 };
  const sfx = {
    jump(side) { note(hz(side === 'L' ? 12 : 7), side, { dur: 0.14, vol: 0.07, slide: 1.5 }); },
    land(side) { noise(side, 0.06, 0.08, 400); },
    pickup(side) {
      const i = step[side]++ % SCALE.length;
      note(hz(SCALE[i] + (side === 'L' ? 12 : 0)), side, { vol: 0.17 });
      note(hz(SCALE[i] + (side === 'L' ? 19 : 7)), side, { vol: 0.08, delay: 0.07 });
    },
    key(side) { [0, 4, 7, 12].forEach((s, i) => note(hz(s + 12), side, { delay: i * 0.07, vol: 0.14 })); },
    bug(side) { note(hz(side === 'L' ? 21 : 14), side, { dur: 0.1, vol: 0.12, slide: 0.6 }); note(hz(24), side, { delay: 0.09, dur: 0.2, vol: 0.1 }); },
    open(side) { [0, 7, 12, 16].forEach((s, i) => note(hz(s), side, { delay: i * 0.06, vol: 0.13, dur: 0.4 })); noise(side, 0.4, 0.07, 900); },
    stamp(side) { noise(side, 0.12, 0.3, 260); note(hz(-12), side, { dur: 0.2, vol: 0.2 }); },
    fall(side) { note(hz(7), side, { dur: 0.3, vol: 0.09, slide: 0.4 }); },
    chapter() { [0, 7, 14].forEach((s, i) => { note(hz(s), 'L', { delay: i * 0.12, vol: 0.1, dur: 0.9 }); note(hz(s + 4), 'R', { delay: i * 0.12 + 0.06, vol: 0.1, dur: 0.3 }); }); },
    charge(p) { note(hz(SCALE[Math.floor(p * 10) % SCALE.length] + 12), p * 10 % 2 < 1 ? 'L' : 'R', { vol: 0.08, dur: 0.2 }); }
  };

  function merge() {
    if (!ac) { merged = true; return; }
    merged = true;
    const t = ac.currentTime;
    // everything walks to the centre of the head
    drones.forEach((d) => { if (d.p) d.p.pan.linearRampToValueAtTime(0, t + 1.6); });
    if (!on) return;
    // a rising run, then one whole chord
    for (let i = 0; i < 14; i++) {
      note(hz(SCALE[i % SCALE.length] + Math.floor(i / SCALE.length) * 12), 'C', { delay: i * 0.055, vol: 0.09, dur: 0.3 });
    }
    [-12, 0, 4, 7, 11, 14, 19].forEach((s, i) => {
      note(hz(s), 'C', { delay: 0.85 + i * 0.03, vol: 0.13, dur: 4.5 });
    });
    noise('C', 1.2, 0.1, 1400);
    // drones settle a major third apart
    if (drones[1]) {
      drones[1].o.frequency.linearRampToValueAtTime(hz(-8), t + 2);
      drones[1].o2.frequency.linearRampToValueAtTime(hz(-8) * 1.003, t + 2);
    }
  }

  function toggle() {
    on = !on;
    if (master) master.gain.linearRampToValueAtTime(on ? 0.5 : 0, ac.currentTime + 0.15);
    return on;
  }

  window.BellaAudio = {
    init, toggle, merge,
    sfx(name, a) { if (ac && sfx[name]) sfx[name](a); },
    get on() { return on; }
  };
})();
