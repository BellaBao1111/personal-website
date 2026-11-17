/* ------------------------------------------------------------------
   game.js — the engine. One set of keys moves two characters through
   two worlds. Each world holds what the other one needs. At the end
   the player holds a key and the worlds merge.
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  const B = window.BELLA, R = window.BellaRender, A = window.BellaAudio;
  const { G, END_X, CHAPTERS, BEATS, LINES, LEVEL, WHOLE, CONFIG } = B;
  const { C, clamp, ease } = R;
  const $ = (q, el) => (el || document).querySelector(q);
  const $$ = (q, el) => Array.from((el || document).querySelectorAll(q));

  const cv = $('#stage'), ctx = cv.getContext('2d');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const ui = { L: $('#ui-l'), R: $('#ui-r') };

  const VH = 640, HW = 14, AH = 38, SPEED = 235, JUMP = 720, GRAV = 1950, TETHER = 170;
  const SIDES = ['L', 'R'];

  let W = 0, H = 0, DPR = 1, portrait = false, s = 1;
  const pane = { L: {}, R: {} };
  const geo = { cx: 0, cy: 0, dx: 0, dy: 1, nx: 1, ny: 0, len: 0, tilt: 0, gap: 10 };
  let game;

  // ---- state --------------------------------------------------------
  function mkAv(x) {
    return { x, y: G, vx: 0, vy: 0, face: 1, onGround: true, squash: 0, walk: 0, coyote: 0, buffer: 0, hist: [] };
  }
  function reset() {
    game = {
      state: 'title', t: 0, playT: 0,
      av: { L: mkAv(120), R: mkAv(120) }, cam: { L: { x: -100, a: 0.38 }, R: { x: -100, a: 0.38 } },
      gate: {}, pad: {}, bridge: {}, parts: { L: [], R: [] },
      follower: { on: false, t: 0, L: null, R: null },
      flags: {}, bugs: 0, counts: { L: 0, R: 0 }, totals: { L: 0, R: 0 },
      chapter: -1, beat: 0, sparks: [], hold: 0, mergeT: 0, shake: 0, flash: 0,
      hideAvatars: false, fly: null, whole: null, grow: 0, tetherSaid: 0, bugsSaid: 0
    };
    SIDES.forEach((sd) => {
      const lvl = LEVEL[sd];
      lvl.gates.forEach((g) => { game.gate[g.id] = { open: false, t: 0, ready: false }; });
      lvl.pads.forEach((p) => { game.pad[p.id] = { on: false, t: 0 }; });
      lvl.pits.forEach((p) => { game.bridge[p.flag] = { on: false, t: 0 }; });
      lvl.pickups.forEach((p) => { p.got = false; if (!p.key) game.totals[sd]++; });
      lvl.bugs.forEach((b) => { b.got = false; b.x = b.x0; b.dir = 1; });
    });
  }

  // ---- layout -------------------------------------------------------
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    portrait = W < H * 0.8;
    body.classList.toggle('portrait', portrait);
    body.classList.toggle('landscape', !portrait);
    if (portrait) { pane.L = { x: 0, y: 0, w: W, h: H / 2 }; pane.R = { x: 0, y: H / 2, w: W, h: H / 2 }; }
    else { pane.L = { x: 0, y: 0, w: W / 2, h: H }; pane.R = { x: W / 2, y: 0, w: W / 2, h: H }; }
    s = Math.min(pane.L.h / VH, pane.L.w / 500);
    SIDES.forEach((sd) => { pane[sd].oy = pane[sd].h * (portrait ? 0.76 : 0.734) - G * s; });
    geo.cx = W / 2; geo.cy = H / 2; geo.len = Math.hypot(W, H) * 1.2;
    fitTitle();
  }

  function fitTitle() {
    // both versions of the name are sized to the same width, so the seam
    // cuts through one word set in two voices
    const target = portrait ? W * 0.52 : Math.min(W * 0.6, H * 1.02);
    SIDES.forEach((sd) => {
      const el = $('.t-name', ui[sd]);
      if (!el) return;
      el.style.fontSize = '100px';
      const w = el.getBoundingClientRect().width || 1;
      el.style.fontSize = (100 * target / w).toFixed(1) + 'px';
    });
  }

  function updateGeo(dt) {
    let target = 0;
    if (!reduce) {
      if (game.state === 'title') target = 0.1 + Math.sin(game.t * 0.4) * 0.012;
      else if (game.state === 'play') target = Math.sin(game.t * 0.23) * 0.03;
    }
    if (portrait) target = game.state === 'title' ? 0 : target * 0.6;
    geo.tilt += (target - geo.tilt) * Math.min(1, dt * 2.5);
    const a = geo.tilt;
    if (!portrait) { geo.dx = Math.sin(a); geo.dy = Math.cos(a); geo.nx = Math.cos(a); geo.ny = -Math.sin(a); }
    else { geo.dx = Math.cos(a); geo.dy = Math.sin(a); geo.nx = -Math.sin(a); geo.ny = Math.cos(a); }
    const gapT = game.state === 'finale' ? 10 - 8 * game.hold : game.state === 'title' ? 14 : 10;
    geo.gap += (gapT - geo.gap) * Math.min(1, dt * 8);
  }

  function clipPoly(poly, f) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    return out;
  }
  const signed = (p) => (p[0] - geo.cx) * geo.nx + (p[1] - geo.cy) * geo.ny;
  function halfPoly(sd) {
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    return clipPoly(rect, sd === 'L' ? (p) => -signed(p) - geo.gap / 2 : (p) => signed(p) - geo.gap / 2);
  }
  function bandPoly(hw) {
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    return clipPoly(clipPoly(rect, (p) => hw - signed(p)), (p) => hw + signed(p));
  }
  function path(poly) {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
  const lastClip = { L: '', R: '' };
  function setUiClip(sd, poly) {
    const str = 'polygon(' + poly.map((p) => p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px').join(',') + ')';
    if (str !== lastClip[sd]) { lastClip[sd] = str; ui[sd].style.clipPath = str; ui[sd].style.webkitClipPath = str; }
  }
  function discAt() {
    const a = portrait ? W * 0.37 : -H * 0.365;
    const pulse = game.state === 'finale' ? game.hold : 0;
    return { x: geo.cx + geo.dx * a, y: geo.cy + geo.dy * a, r: portrait ? W * 0.07 : Math.min(W, H) * 0.072, pulse };
  }
  const toScreen = (sd, wx, wy) => [pane[sd].x + (wx - game.cam[sd].x) * s, pane[sd].y + pane[sd].oy + wy * s];

  // ---- words --------------------------------------------------------
  const capEl = { L: $('[data-cap]', ui.L), R: $('[data-cap]', ui.R) };
  let typer = null;
  function say(sd, text) {
    const el = capEl[sd];
    if (!text || el.dataset.text === text) return;
    el.dataset.text = text;
    if (sd === 'L' || reduce) {
      el.textContent = text;
      el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    } else {
      clearInterval(typer);
      let i = 0; el.textContent = ''; el.classList.add('in');
      typer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typer); }, 28);
    }
    $('#live').textContent = text;
  }
  function line(key) { const l = LINES[key]; if (!l) return; if (l.l) say('L', l.l); if (l.r) say('R', l.r); }

  function showChapter(i) {
    const ch = CHAPTERS[i];
    SIDES.forEach((sd) => {
      const el = $('[data-chap]', ui[sd]), d = sd === 'L' ? ch.l : ch.r;
      $('.c-no', el).textContent = d.no;
      $('.c-title', el).textContent = d.title;
      $('.c-place', el).textContent = d.place;
      $('.c-zh', el).textContent = d.zh;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    });
    if (i > 0) A.sfx('chapter');
  }

  function hud() {
    $('[data-count]', ui.L).textContent = game.counts.L + ' of ' + game.totals.L + ' bases';
    $('[data-count]', ui.R).textContent = game.counts.R + '/' + game.totals.R + ' tokens';
    const showBugs = game.chapter === 1;
    $('[data-bugs]', ui.L).textContent = showBugs ? game.bugs + ' of 6 bugs' : '';
    $('[data-bugs]', ui.R).textContent = showBugs ? game.bugs + '/6 bugs' : '';
  }

  // ---- input --------------------------------------------------------
  const input = { left: false, right: false, jump: false, jumpEdge: false, hold: false };
  function onKey(e, down) {
    if (game.state === 'whole') return;
    const k = e.code;
    if (game.state === 'title') {
      if (down && (k === 'Space' || k === 'Enter') && document.activeElement !== $('#skip') && document.activeElement !== $('#sound')) { e.preventDefault(); start(); }
      return;
    }
    if (down) A.init();   // some browsers only wake audio on a later gesture
    if (k === 'ArrowLeft' || k === 'KeyA') input.left = down;
    else if (k === 'ArrowRight' || k === 'KeyD') input.right = down;
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
      if (down && !input.jump) input.jumpEdge = true;
      input.jump = down;
    } else if (k === 'KeyM' && down) toggleSound();
    else return;
    e.preventDefault();
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { input.left = input.right = input.jump = input.hold = false; });

  function bindHold(el, on, off) {
    const down = (e) => { e.preventDefault(); body.classList.add('touch'); on(); };
    const up = (e) => { e.preventDefault(); off(); };
    el.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, up));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindHold($('#btn-left'), () => (input.left = true), () => (input.left = false));
  bindHold($('#btn-right'), () => (input.right = true), () => (input.right = false));
  bindHold($('#btn-jump'), () => { input.jumpEdge = true; input.jump = true; }, () => (input.jump = false));
  bindHold($('#merge'), () => (input.hold = true), () => (input.hold = false));
  window.addEventListener('touchstart', () => body.classList.add('touch'), { passive: true, once: true });

  $('#start').addEventListener('click', start);
  // a focused button would swallow the space bar, which is also the jump key
  ['#sound', '#skip'].forEach((q) => $(q).addEventListener('click', (e) => e.currentTarget.blur()));
  $('#skip').addEventListener('click', () => { A.init(); if (game.state !== 'merging' && game.state !== 'whole') startMerge(true); });
  $('#sound').addEventListener('click', toggleSound);
  function toggleSound() { A.init(); const on = A.toggle(); $('#sound').textContent = on ? 'Sound on' : 'Sound off'; $('#sound').setAttribute('aria-pressed', String(on)); }

  function start() {
    if (game.state !== 'title') return;
    A.init();
    game.state = 'play';
    body.classList.remove('is-title'); body.classList.add('is-play');
    hud();
  }

  // ---- physics ------------------------------------------------------
  const groundSegs = { L: [], R: [] };
  function buildGround() {
    SIDES.forEach((sd) => {
      const segs = []; let cur = -3000;
      LEVEL[sd].pits.forEach((p) => { segs.push({ x: cur, y: G, w: p.x0 - cur, h: 500 }); cur = p.x1; });
      segs.push({ x: cur, y: G, w: END_X + 3000 - cur, h: 500 });
      segs.push({ x: -200, y: -400, w: 40, h: G + 400 });
      segs.push({ x: END_X + 420, y: -400, w: 40, h: G + 400 });
      groundSegs[sd] = segs;
    });
  }
  function solidsFor(sd) {
    const lvl = LEVEL[sd];
    const out = groundSegs[sd].concat(lvl.solids);
    lvl.gates.forEach((g) => { if (game.gate[g.id].t < 0.8) out.push({ x: g.x, y: G - 250, w: 26, h: 250 }); });
    lvl.pits.forEach((p) => { const b = game.bridge[p.flag]; if (b.on) out.push({ x: p.x0, y: G, w: (p.x1 - p.x0) * clamp(b.t * 1.2, 0, 1), h: 16 }); });
    return out;
  }
  const hit = (a, b) => a.x + HW > b.x && a.x - HW < b.x + b.w && a.y > b.y && a.y - AH < b.y + b.h;

  function stepAvatar(sd, dt, dir, auto) {
    const a = game.av[sd], o = game.av[sd === 'L' ? 'R' : 'L'];
    const solids = solidsFor(sd);
    let vx = dir * SPEED;
    // you can't leave yourself behind
    if (!auto) {
      if ((vx > 0 && a.x - o.x > TETHER) || (vx < 0 && o.x - a.x > TETHER)) {
        vx = 0;
        if (game.t - game.tetherSaid > 6) { game.tetherSaid = game.t; say(sd, sd === 'L' ? LINES.tether.l : LINES.tether.r); }
      }
    }
    a.vx = vx;
    if (vx) { a.face = vx > 0 ? 1 : -1; a.walk += dt; }

    a.coyote = a.onGround ? 0.1 : a.coyote - dt;
    a.buffer -= dt;
    if (input.jumpEdge && !auto) a.buffer = 0.12;
    if (a.buffer > 0 && a.coyote > 0) {
      a.vy = -JUMP; a.coyote = 0; a.buffer = 0; a.onGround = false; a.squash = -0.5;
      A.sfx('jump', sd);
    }
    if (!input.jump && a.vy < -260) a.vy = -260;   // let go early for a short hop
    a.vy = Math.min(a.vy + GRAV * dt, 1300);

    a.x += vx * dt;
    for (let i = 0; i < solids.length; i++) {
      const b = solids[i];
      if (hit(a, b)) { if (vx > 0) a.x = b.x - HW; else if (vx < 0) a.x = b.x + b.w + HW; }
    }
    const was = a.onGround, vy0 = a.vy;
    a.y += a.vy * dt; a.onGround = false;
    for (let i = 0; i < solids.length; i++) {
      const b = solids[i];
      if (hit(a, b)) {
        if (a.vy >= 0) { a.y = b.y; a.vy = 0; a.onGround = true; }
        else { a.y = b.y + b.h + AH; a.vy = 0; }
      }
    }
    if (a.onGround && !was && vy0 > 300) { a.squash = 0.6; A.sfx('land', sd); }
    a.squash += (0 - a.squash) * Math.min(1, dt * 12);

    // fell into a pit: back to the edge
    if (a.y > G + 300) {
      const pit = LEVEL[sd].pits.find((p) => a.x > p.x0 - 60 && a.x < p.x1 + 60) || LEVEL[sd].pits[0];
      a.x = pit.x0 - 46; a.y = G; a.vy = 0; A.sfx('fall', sd); burst(sd, a.x, a.y - 20, 8);
    }
    a.hist.push({ t: game.t, x: a.x, y: a.y, face: a.face, vx: a.vx, onGround: a.onGround, walk: a.walk });
    if (a.hist.length > 90) a.hist.shift();
  }

  function burst(sd, x, y, n, txt) {
    const arr = game.parts[sd];
    for (let i = 0; i < n; i++) {
      const an = Math.random() * 6.28, sp = 50 + Math.random() * 120;
      arr.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, life: 0.6, max: 0.6, rot: an });
    }
    if (txt) arr.push({ x: x - 8, y: y - 24, vx: 0, vy: -40, life: 1, max: 1, txt, rot: 0 });
  }

  function spark(from, to, done) {
    game.sparks.push({ from, to, t: 0, dur: reduce ? 0.01 : 0.65, done, trail: [] });
  }

  // ---- one frame of play --------------------------------------------
  function play(dt) {
    game.playT += dt;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    SIDES.forEach((sd) => stepAvatar(sd, dt, dir, false));
    input.jumpEdge = false;
    const L = game.av.L, Rr = game.av.R;
    const minX = Math.min(L.x, Rr.x);

    SIDES.forEach((sd) => {
      const a = game.av[sd], lvl = LEVEL[sd], other = sd === 'L' ? 'R' : 'L';
      // pickups
      lvl.pickups.forEach((p) => {
        if (p.got) return;
        const rr = p.big ? 30 : 24;
        if (Math.abs(a.x - p.x) < rr && Math.abs(a.y - AH / 2 - p.y) < rr + 12) {
          p.got = true; burst(sd, p.x, p.y, 9);
          if (p.key) {
            A.sfx('key', sd); game.flags[p.key] = true; line(p.key);
            const og = LEVEL[other];
            if (p.key === 'gotDataset' || p.key === 'gotHypo') {
              const pit = og.pits[0];
              spark({ sd, x: p.x, y: p.y }, { sd: other, x: (pit.x0 + pit.x1) / 2, y: G }, () => { game.bridge[pit.flag].on = true; A.sfx('open', other); });
            } else {
              spark({ sd, x: p.x, y: p.y }, { sd: other, x: 1960, y: G - 120 }, () => A.sfx('pickup', other));
            }
          } else { game.counts[sd]++; A.sfx('pickup', sd); hud(); }
        }
      });
      // bugs
      lvl.bugs.forEach((b, i) => {
        if (b.got) return;
        b.x += b.dir * (b.fly ? 55 : 40) * dt;
        if (b.x > b.x1) b.dir = -1; else if (b.x < b.x0) b.dir = 1;
        const by = b.fly ? b.y + Math.sin(game.t * 3 + i) * 12 : b.y - 10;
        if (Math.abs(a.x - b.x) < 28 && Math.abs(a.y - AH / 2 - by) < 34) {
          b.got = true; game.bugs++; burst(sd, b.x, by, 10, sd === 'L' ? 'catalogued' : 'fixed'); A.sfx('bug', sd); hud();
        }
      });
      // review pads
      lvl.pads.forEach((p) => {
        const st = game.pad[p.id];
        if (st.on) { st.t += dt; return; }
        if (a.onGround && Math.abs(a.y - p.y) < 2 && a.x > p.x && a.x < p.x + p.w) {
          st.on = true; A.sfx('stamp', sd); game.shake = 0.25; line(p.line);
          const g = LEVEL[other].gates.find((q) => q.id === p.opens);
          spark({ sd, x: p.x + p.w / 2, y: p.y - 70 }, { sd: other, x: g.x + 13, y: G - 120 }, () => { game.gate[p.opens].open = true; A.sfx('open', other); });
        }
      });
      // particles
      const arr = game.parts[sd];
      for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.txt) p.vy += 300 * dt; if (p.life <= 0) arr.splice(i, 1); }
    });

    // the two doors that need both of you
    const near = (a, x) => a.x + HW >= x - 18 && a.x < x + 26;
    const g1 = game.gate.g1, g2 = game.gate.g2;
    g1.ready = !!(game.flags.gotQuestion && game.flags.gotScript);
    g2.ready = game.bugs >= 6;
    if (!g1.open && g1.ready && near(L, 1960) && near(Rr, 1960)) { g1.open = true; A.sfx('open', 'L'); A.sfx('open', 'R'); line('gate1'); }
    if (!g2.open && near(L, 4100) && near(Rr, 4100)) {
      if (g2.ready) { g2.open = true; A.sfx('open', 'L'); A.sfx('open', 'R'); line('gate2'); }
      else if (game.t - game.bugsSaid > 5) { game.bugsSaid = game.t; line('bugsLeft'); }
    }
    Object.keys(game.gate).forEach((id) => { const g = game.gate[id]; if (g.open && g.t < 1) g.t += dt / 0.6; });
    Object.keys(game.bridge).forEach((id) => { const b = game.bridge[id]; if (b.on && b.t < 1) b.t += dt / 0.5; });

    // chapters and beats
    let ch = 0;
    for (let i = 0; i < CHAPTERS.length; i++) if (minX >= CHAPTERS[i].start) ch = i;
    if (ch !== game.chapter) { game.chapter = ch; showChapter(ch); hud(); }
    while (game.beat < BEATS.length && minX >= BEATS[game.beat].x) {
      const b = BEATS[game.beat++];
      if (b.l) say('L', b.l);
      if (b.r) say('R', b.r);
    }

    // the intern joins in chapter four
    if (!game.follower.on && minX > 7500) { game.follower.on = true; SIDES.forEach((sd) => burst(sd, game.av[sd].x - 50, G - 20, 10)); }
    followers(dt);

    if (L.x >= END_X && Rr.x >= END_X) {
      game.state = 'finale'; body.classList.add('is-finale');
      line('finale');
      input.jumpEdge = false;
    }
  }

  function followers(dt) {
    if (!game.follower.on) return;
    game.follower.t += dt * 2;
    SIDES.forEach((sd) => {
      const h = game.av[sd].hist;
      let e = h[0];
      for (let i = h.length - 1; i >= 0; i--) if (game.t - h[i].t >= 0.42) { e = h[i]; break; }
      if (e) game.follower[sd] = { x: e.x - e.face * 44, y: e.y, face: e.face, vx: e.vx, onGround: e.onGround, walk: e.walk, squash: 0 };
    });
  }

  function finale(dt) {
    // both walk to the seam and face each other
    SIDES.forEach((sd) => {
      const a = game.av[sd], tx = END_X + 70;
      const dir = Math.abs(a.x - tx) > 4 ? Math.sign(tx - a.x) : 0;
      stepAvatar(sd, dt, dir, true);
      if (!dir && !portrait) a.face = sd === 'L' ? 1 : -1;
      game.cam[sd].a += ((portrait ? 0.5 : sd === 'L' ? 0.8 : 0.2) - game.cam[sd].a) * Math.min(1, dt * 2);
    });
    followers(dt);
    SIDES.forEach((sd) => { const arr = game.parts[sd]; for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) arr.splice(i, 1); } });
    const holding = input.jump || input.hold;
    const before = game.hold;
    game.hold = clamp(game.hold + (holding ? dt / 1.5 : -dt / 0.7), 0, 1);
    if (holding && Math.floor(game.hold * 10) !== Math.floor(before * 10)) A.sfx('charge', game.hold);
    if (holding && !reduce) game.shake = Math.max(game.shake, 0.08 + game.hold * 0.2);
    $('#merge').style.setProperty('--p', game.hold.toFixed(3));
    if (game.hold >= 1) startMerge(false);
  }

  function startMerge(skipped) {
    const from = {};
    SIDES.forEach((sd) => { const a = game.av[sd], p = toScreen(sd, a.x, a.y); from[sd] = { x: clamp(p[0], -60, W + 60), y: clamp(p[1], 0, H), face: a.face }; });
    game.fly = from;
    game.hideAvatars = true;
    game.state = 'merging'; game.mergeT = 0; game.flash = 1;
    body.classList.remove('is-title', 'is-play', 'is-finale'); body.classList.add('is-merging');
    game.skipped = skipped;
    A.merge();
  }

  function groundYWhole() { return portrait ? H * 0.8 : pane.L.oy + G * s; }

  function merging(dt) {
    game.mergeT += dt * (reduce ? 3 : 1);
    game.flash = Math.max(0, game.flash - dt * 1.4);
    if (game.mergeT > 2.3) {
      game.state = 'whole'; game.grow = 0.5;
      game.whole = { x: W / 2, y: groundYWhole(), vx: 0, vy: 0, face: 1, onGround: true, squash: 0.5, walk: 0, hop: 2 };
      showWhole();
    }
  }

  function whole(dt) {
    game.grow = Math.min(1, game.grow + dt * 0.5);
    const a = game.whole;
    a.y = groundYWhole(); a.x = W / 2;
    // a small hop now and then, for joy
    a.hop -= dt;
    if (a.hop < 0 && !reduce) { a.vy = -430; a.hop = 3 + Math.random() * 3; a.squash = -0.4; }
    a.lift = (a.lift || 0) + a.vy * dt; a.vy += 1500 * dt;
    if (a.lift > 0) { if (a.vy > 200) a.squash = 0.5; a.lift = 0; a.vy = 0; }
    a.squash += (0 - a.squash) * Math.min(1, dt * 10);
  }

  // ---- the ending page ----------------------------------------------
  function showWhole() {
    const mm = Math.floor(game.playT / 60), ss = String(Math.floor(game.playT % 60)).padStart(2, '0');
    const stats = game.skipped
      ? 'You skipped ahead. The game is still there if you want it.'
      : `Played in ${mm}:${ss}. ${game.counts.L} of ${game.totals.L} bases, ${game.counts.R} of ${game.totals.R} tokens, ${game.bugs} of 6 bugs.`;
    $('#w-stats').textContent = stats;
    body.classList.remove('is-merging'); body.classList.add('is-whole');
    $('#whole').hidden = false;
    $('#whole').focus({ preventScroll: true });
  }

  function buildWholePage() {
    $('#w-hello').textContent = WHOLE.hello;
    $('#w-line').textContent = WHOLE.line;
    $('#w-about').innerHTML = WHOLE.about.map((p) => `<p>${p}</p>`).join('');
    $('#w-path').innerHTML = WHOLE.path.map((p) => `<li><span class="when">${p.when}</span><span class="what">${p.what}</span><span class="more">${p.more || ''}</span></li>`).join('');
    $('#w-loadout').innerHTML = WHOLE.loadout.map((p) => `<li>${p}</li>`).join('');
    $('#w-side').innerHTML = WHOLE.sidequests.map((p) => `<li>${p}</li>`).join('');
    $('#w-credits').textContent = WHOLE.credits;
    const links = [];
    const k = CONFIG.links;
    if (k.github) links.push(`<a href="${k.github}" rel="noopener">${k.github.replace('https://', '')}</a>`);
    if (k.linkedin) links.push(`<a href="${k.linkedin}" rel="noopener">${k.linkedin.replace('https://', '').replace('www.', '')}</a>`);
    if (k.email) links.push(`<a href="mailto:${k.email}">${k.email}</a>`);
    $('#w-links').innerHTML = links.map((l) => `<li>${l}</li>`).join('');
  }

  $('#replay').addEventListener('click', () => {
    window.scrollTo(0, 0);
    $('#whole').hidden = true;
    body.classList.remove('is-whole'); body.classList.add('is-title');
    SIDES.forEach((sd) => { capEl[sd].textContent = ''; capEl[sd].dataset.text = ''; });
    reset(); hud();
  });

  // ---- drawing ------------------------------------------------------
  function camera(dt) {
    SIDES.forEach((sd) => {
      const c = game.cam[sd], a = game.av[sd];
      const target = a.x - (pane[sd].w / s) * c.a;
      c.x += (target - c.x) * Math.min(1, dt * 6);
    });
  }

  function drawSparks(sd) {
    const col = sd === 'L' ? C.ink : C.amber;
    game.sparks.forEach((sp) => {
      sp.trail.forEach((p, i) => {
        const k = (i + 1) / sp.trail.length;
        ctx.fillStyle = col; ctx.globalAlpha = k * 0.8;
        ctx.beginPath(); ctx.arc(p[0], p[1], 2 + k * 5, 0, 6.3); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (sp.trail.length) {
        const p = sp.trail[sp.trail.length - 1];
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, 6.3); ctx.stroke();
      }
    });
  }
  function updateSparks(dt) {
    for (let i = game.sparks.length - 1; i >= 0; i--) {
      const sp = game.sparks[i];
      sp.t += dt;
      const k = ease(clamp(sp.t / sp.dur, 0, 1));
      const a = toScreen(sp.from.sd, sp.from.x, sp.from.y), b = toScreen(sp.to.sd, sp.to.x, sp.to.y);
      b[0] = clamp(b[0], pane[sp.to.sd].x + 20, pane[sp.to.sd].x + pane[sp.to.sd].w - 20);
      b[1] = clamp(b[1], pane[sp.to.sd].y + 20, pane[sp.to.sd].y + pane[sp.to.sd].h - 20);
      const arc = Math.sin(k * Math.PI) * -90;
      sp.trail.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + arc]);
      if (sp.trail.length > 14) sp.trail.shift();
      if (sp.t >= sp.dur) { if (sp.done) sp.done(); game.sparks.splice(i, 1); }
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const t = game.t;
    const disc = discAt();

    if (game.state === 'whole') {
      const a = game.whole;
      R.drawMerged(ctx, W, H, t, { groundY: groundYWhole(), disc, grow: game.grow, avatar: { x: a.x, y: a.y + (a.lift || 0), vx: 0, face: 1, onGround: true, squash: a.squash, walk: 0 }, avatarScale: Math.max(1, s * 1.15) });
      return;
    }

    // the seam is a crack; the blueprint blue shows through it
    ctx.fillStyle = C.deep; ctx.fillRect(0, 0, W, H);
    let shx = 0, shy = 0;
    if (game.shake > 0 && !reduce) { shx = (Math.random() - 0.5) * game.shake * 22; shy = (Math.random() - 0.5) * game.shake * 22; }

    SIDES.forEach((sd) => {
      const poly = halfPoly(sd);
      setUiClip(sd, poly);
      ctx.save(); path(poly); ctx.clip();
      ctx.translate(shx, shy);
      const P = pane[sd];
      R.drawWorld(ctx, sd, { px: P.x, py: P.y + P.oy, pw: P.w, ph: P.h, s, camX: game.cam[sd].x, t, W, H, game, disc });
      drawSparks(sd);
      ctx.restore();
    });

    // progress along the story bonds the rungs from the far end
    const avg = (game.av.L.x + game.av.R.x) / 2;
    let prog = clamp(avg / END_X, 0, 1) * 0.82;
    if (game.state === 'finale') prog = 0.82 + 0.18 * game.hold;
    if (game.state === 'merging') prog = 1;
    if (game.state === 'title') prog = 0;
    R.drawSeam(ctx, geo, prog, geo.gap, t, game.state === 'merging' ? game.flash : 0);

    if (game.state === 'merging') {
      const m = game.mergeT;
      const gy = groundYWhole();
      // the whole world opens outward from the seam
      const far = Math.max.apply(null, [[0, 0], [W, 0], [W, H], [0, H]].map((p) => Math.abs(signed(p))));
      const k = ease(clamp((m - 0.3) / 1.7, 0, 1));
      const hw = k * (far + 4);
      if (hw > 0.5) {
        ctx.save(); path(bandPoly(hw)); ctx.clip();
        R.drawMerged(ctx, W, H, t, { groundY: gy, disc, grow: k * 0.5, avatar: null });
        ctx.restore();
        if (k < 1) {
          [-1, 1].forEach((sg) => {
            const ox = geo.cx + geo.nx * hw * sg, oy = geo.cy + geo.ny * hw * sg, hl = geo.len / 2;
            ctx.strokeStyle = 'rgba(255,176,0,0.35)'; ctx.lineWidth = 12;
            ctx.beginPath(); ctx.moveTo(ox - geo.dx * hl, oy - geo.dy * hl); ctx.lineTo(ox + geo.dx * hl, oy + geo.dy * hl); ctx.stroke();
            ctx.strokeStyle = C.white; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(ox - geo.dx * hl, oy - geo.dy * hl); ctx.lineTo(ox + geo.dx * hl, oy + geo.dy * hl); ctx.stroke();
          });
        }
      }
      // the two players leap to the middle and land as one
      const f = clamp(m / 0.75, 0, 1), fe = ease(f);
      const sc = Math.max(1, s * 1.15);
      if (f < 1) {
        SIDES.forEach((sd) => {
          const p0 = game.fly[sd];
          const x = p0.x + (W / 2 - p0.x) * fe, y = p0.y + (gy - p0.y) * fe - Math.sin(f * Math.PI) * 120 * s;
          ctx.save(); ctx.translate(x, y); ctx.scale(s + (sc - s) * fe, s + (sc - s) * fe);
          (sd === 'L' ? R.avatarL : R.avatarR)(ctx, { x: 0, y: 0, vx: 0, face: sd === 'L' ? 1 : -1, onGround: false, squash: -0.3, walk: 0 }, t);
          ctx.restore();
        });
      } else {
        const land = clamp((m - 0.75) / 0.3, 0, 1);
        R.avatarWhole(ctx, { x: W / 2, y: gy, vx: 0, face: 1, onGround: true, squash: 0.6 * (1 - land), walk: 0 }, t, sc);
        if (land < 1) { ctx.strokeStyle = `rgba(245,248,252,${1 - land})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, gy - 20 * sc, 20 + land * 160, 0, 6.3); ctx.stroke(); }
      }
    }
  }

  // ---- loop ---------------------------------------------------------
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.034, (now - last) / 1000 || 0.016); last = now;
    game.t += dt;
    game.shake = Math.max(0, game.shake - dt * 1.2);
    if (game.state === 'play') play(dt);
    else if (game.state === 'finale') finale(dt);
    else if (game.state === 'merging') merging(dt);
    else if (game.state === 'whole') whole(dt);
    if (game.state !== 'whole') { updateGeo(dt); camera(dt); updateSparks(dt); }
    render();
    requestAnimationFrame(frame);
  }

  // ---- go -----------------------------------------------------------
  reset();
  buildGround();
  buildWholePage();
  resize();
  window.addEventListener('resize', resize);
  SIDES.forEach((sd) => { game.cam[sd].x = game.av[sd].x - (pane[sd].w / s) * 0.38; });
  const ready = () => { fitTitle(); body.classList.add('is-ready'); };
  if (document.fonts && document.fonts.ready) {
    Promise.all([
      document.fonts.load('italic 400 40px "Old Standard TT"'), document.fonts.load('700 40px "Old Standard TT"'),
      document.fonts.load('800 40px "Martian Mono"'), document.fonts.load('400 40px "Martian Mono"')
    ]).then(ready, ready);
    setTimeout(ready, 2500);
  } else ready();
  requestAnimationFrame(frame);

  // a small handle for testing from the console
  window.__bella = { get game() { return game; }, input, start, startMerge };
})();
