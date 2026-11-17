/* ------------------------------------------------------------------
   render.js — draws the two worlds and the merged one.
   Left  (scientist): cobalt ink on cool white paper, like a cyanotype
                      specimen sheet.
   Right (engineer):  amber phosphor on warm black, like an old terminal.
   Whole:             a blueprint. White line and amber light on blue.
   Everything is drawn in code. There are no image files.
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  const { G, END_X, CHAPTERS, LEVEL } = window.BELLA;

  const C = {
    paper: '#EDF1F5', ink: '#143C8C', deep: '#0C2A6B', deeper: '#081C4D',
    amber: '#FFB000', crt: '#140E07', white: '#F5F8FC'
  };
  const ink = (a) => `rgba(20,60,140,${a})`;
  const amb = (a) => `rgba(255,176,0,${a})`;
  const wht = (a) => `rgba(245,248,252,${a})`;
  const SERIF = '"Old Standard TT", "Songti SC", Georgia, serif';
  const MONO = '"Martian Mono", ui-monospace, Menlo, monospace';

  // ---- small helpers ----------------------------------------------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function chapterAt(x) {
    let c = 0;
    for (let i = 0; i < CHAPTERS.length; i++) if (x >= CHAPTERS[i].start) c = i;
    return c;
  }

  function grainTile(r, g, b, alpha) {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const x = c.getContext('2d');
    const d = x.createImageData(160, 160);
    const rnd = rng(7);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b;
      d.data[i + 3] = rnd() < 0.5 ? 0 : rnd() * alpha;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  const grainInk = grainTile(20, 60, 140, 26);
  const grainLight = grainTile(255, 220, 160, 20);
  let patInk = null, patLight = null;

  // ---- decor, generated once ---------------------------------------
  const F_FAR = 0.35, F_MID = 0.6;
  const decor = { L: { mid: [], near: [] }, R: { mid: [], near: [] } };
  (function build() {
    const rl = rng(11), rr = rng(23);
    // mid layer, in layer space
    for (let x = -300; x < (END_X + 1400) * F_MID; ) {
      const ch = chapterAt(x / F_MID + 200);
      decor.L.mid.push({ x, ch, seed: (rl() * 1e9) | 0, k: rl() });
      x += [150, 105, 135, 170][ch] * (0.75 + rl() * 0.6);
    }
    for (let x = -300; x < (END_X + 1400) * F_MID; ) {
      const ch = chapterAt(x / F_MID + 200);
      const w = 60 + rr() * 70;
      decor.R.mid.push({ x, ch, w, seed: (rr() * 1e9) | 0, k: rr() });
      x += w + [60, 14, 90, 40][ch] * (0.5 + rr());
    }
    // near layer, in world space
    for (let x = -350; x < END_X + 900; ) {
      decor.L.near.push({ x, ch: chapterAt(x), seed: (rl() * 1e9) | 0, k: rl() });
      x += 70 + rl() * 170;
    }
    for (let x = -350; x < END_X + 900; ) {
      decor.R.near.push({ x, ch: chapterAt(x), seed: (rr() * 1e9) | 0, k: rr() });
      x += 110 + rr() * 220;
    }
  })();

  // ---- drawing primitives: the scientist's ink ----------------------
  function leaf(ctx, x, y, len, wid, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fill(); ctx.restore();
  }
  function fern(ctx, x, y, h, lean, n, sway) {
    // a frond: one curved stem with paired leaflets, drawn as a silhouette
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.2, y - h * 0.6, x + lean + sway, y - h);
    ctx.lineWidth = 2; ctx.stroke();
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const mx = x + lean * 0.2, my = y - h * 0.6;
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * (x + lean + sway);
      const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * (y - h);
      const size = (1 - t * 0.75) * h * 0.26;
      const up = -Math.PI / 2 + (lean / h) * t;
      leaf(ctx, px, py, size, size * 0.24, up - 1.05);
      leaf(ctx, px, py, size, size * 0.24, up + 1.05);
    }
  }
  function sprig(ctx, x, y, h, r, sway) {
    const n = 3 + ((r() * 3) | 0);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway, y - h * 0.5, x + sway * 2, y - h);
    ctx.lineWidth = 1.6; ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 0.5);
      const px = x + sway * 2 * t * t, py = y - h * t;
      const s = 9 + r() * 9;
      leaf(ctx, px, py, s, s * 0.36, (i % 2 ? -0.6 : Math.PI + 0.6) + (r() - 0.5) * 0.4);
    }
    leaf(ctx, x + sway * 2, y - h, 11, 4, -Math.PI / 2);
  }
  function palm(ctx, x, y, h, r, sway) {
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y);
    const tx = x + (r() - 0.5) * 50 + sway, ty = y - h;
    ctx.quadraticCurveTo(x + (r() - 0.5) * 30, y - h * 0.5, tx, ty); ctx.stroke();
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + (i / 7) * Math.PI + (r() - 0.5) * 0.2;
      const len = h * (0.32 + r() * 0.14);
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.55 + len * 0.42;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.75, ex, ey);
      ctx.stroke();
    }
  }
  function inkTower(ctx, x, y, w, h, r) {
    ctx.lineWidth = 1.5; ctx.strokeRect(x, y - h, w, h);
    const cols = Math.max(2, (w / 13) | 0), rows = (h / 15) | 0;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      if (r() < 0.55) ctx.fillRect(x + 5 + j * ((w - 8) / cols), y - h + 7 + i * 15, 4, 7);
    }
    if (r() < 0.5) { ctx.beginPath(); ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x + w / 2, y - h - 24); ctx.stroke(); }
  }
  function arch(ctx, x, y, w, h, r) {
    // a gothic bay: pointed window inside a buttressed wall
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.5, y - h - w * 0.5); ctx.lineTo(x + w, y - h); ctx.lineTo(x + w, y); ctx.stroke();
    const ww = w * 0.44, wx = x + (w - ww) / 2, wh = h * 0.62;
    ctx.beginPath(); ctx.moveTo(wx, y - 16); ctx.lineTo(wx, y - 16 - wh);
    ctx.quadraticCurveTo(wx, y - 16 - wh - ww * 0.9, wx + ww / 2, y - 16 - wh - ww * 1.1);
    ctx.quadraticCurveTo(wx + ww, y - 16 - wh - ww * 0.9, wx + ww, y - 16 - wh);
    ctx.lineTo(wx + ww, y - 16); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx + ww / 2, y - 16); ctx.lineTo(wx + ww / 2, y - 16 - wh - ww); ctx.stroke();
    if (r() < 0.4) { ctx.fillRect(x + w * 0.5 - 1, y - h - w * 0.5 - 18, 2, 18); }
  }
  function bareTree(ctx, x, y, len, ang, depth, r) {
    if (depth === 0 || len < 5) return;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    ctx.lineWidth = depth * 0.9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    bareTree(ctx, ex, ey, len * (0.62 + r() * 0.14), ang - 0.32 - r() * 0.3, depth - 1, r);
    bareTree(ctx, ex, ey, len * (0.62 + r() * 0.14), ang + 0.32 + r() * 0.3, depth - 1, r);
  }
  function orchard(ctx, x, y, h, r, a) {
    const cr = h * 0.42;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h + cr * 0.6); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y - h, cr, 0, 6.3); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y - h, cr, 0, 6.3); ctx.clip();
    ctx.lineWidth = 1;
    for (let i = -cr * 2; i < cr * 2; i += 7) { ctx.beginPath(); ctx.moveTo(x + i, y - h - cr); ctx.lineTo(x + i + cr, y - h + cr); ctx.stroke(); }
    ctx.restore();
    // the fruit is amber: the other world is starting to show through
    const keep = ctx.fillStyle; ctx.fillStyle = amb(a * 2.6);
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * cr * 1.5, y - h + (r() - 0.5) * cr * 1.4, 4, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = keep;
  }

  // ---- drawing primitives: the engineer's light ----------------------
  function glowLine(ctx, draw, color, w) {
    ctx.strokeStyle = amb(0.16); ctx.lineWidth = w * 5; draw(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; draw(); ctx.stroke();
  }
  function codeTower(ctx, x, y, w, h, r, ch, t) {
    ctx.fillStyle = C.crt; ctx.fillRect(x, y - h, w, h);
    ctx.strokeStyle = amb(0.3); ctx.lineWidth = 1.2; ctx.strokeRect(x, y - h, w, h);
    const rows = ((h - 12) / 9) | 0;
    for (let i = 0; i < rows; i++) {
      const indent = ((r() * 3) | 0) * 7, len = (w - 22 - indent) * (0.25 + r() * 0.75);
      const yy = y - h + 9 + i * 9;
      const hot = r() < 0.12;
      if (ch === 3) {
        // diff view: added and removed lines
        const plus = r() < 0.6;
        ctx.fillStyle = plus ? amb(0.5) : amb(0.16);
        ctx.fillRect(x + 5, yy + 1, 3, plus ? 3 : 1.4);
        if (plus) ctx.fillRect(x + 6, yy, 1.2, 5);
      }
      if (r() < 0.14) continue;
      ctx.fillStyle = amb(hot ? 0.6 + 0.3 * Math.sin(t * 3 + i) : 0.2);
      ctx.fillRect(x + 12 + indent, yy, len, 3);
    }
  }
  function termWindow(ctx, x, y, w, h, r) {
    ctx.fillStyle = C.crt; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = amb(0.34); ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x, y + 11); ctx.lineTo(x + w, y + 11); ctx.stroke();
    ctx.fillStyle = amb(0.4);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 7, y + 4, 3, 3);
    for (let i = 0; i < ((h - 20) / 9) | 0; i++) {
      ctx.fillStyle = amb(0.24); ctx.fillRect(x + 6, y + 18 + i * 9, 4, 3);
      ctx.fillRect(x + 14, y + 18 + i * 9, (w - 26) * (0.3 + r() * 0.7), 3);
    }
  }

  // ---- characters ---------------------------------------------------
  function avatarL(ctx, a, t, scale) {
    const s = scale || 1;
    ctx.save(); ctx.translate(a.x, a.y); ctx.scale(s, s);
    const sq = a.squash || 0;
    const walk = a.onGround && Math.abs(a.vx) > 5 ? Math.sin(a.walk * 14) : 0;
    // legs
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6 + walk * 5, 0); ctx.moveTo(6, -8); ctx.lineTo(6 - walk * 5, 0); ctx.stroke();
    ctx.translate(0, -8); ctx.scale(1 + sq * 0.25, 1 - sq * 0.25);
    // body
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(0, -15, 14.5, 15.5, 0, 0, 6.3); ctx.fill();
    // sprout
    const sway = clamp(-a.vx / 60, -5, 5) + Math.sin(t * 2.2) * 1.4;
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(sway * 0.3, -36, sway, -41); ctx.stroke();
    leaf(ctx, sway, -41, 13, 5, -0.5 + sway * 0.03);
    leaf(ctx, sway, -41, 11, 4.4, Math.PI + 0.6 + sway * 0.03);
    // eyes
    const f = a.face || 1;
    const blink = (t * 0.7 + 0.3) % 3.1 < 0.09 ? 0.15 : 1;
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.ellipse(f * 3 - 4.6, -17, 3.5, 4.2 * blink, 0, 0, 6.3); ctx.ellipse(f * 3 + 4.6, -17, 3.5, 4.2 * blink, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(f * 4.2 - 4.6, -16.6, 1.6 * blink, 0, 6.3); ctx.arc(f * 4.2 + 4.6, -16.6, 1.6 * blink, 0, 6.3); ctx.fill();
    ctx.restore();
  }
  function avatarR(ctx, a, t, scale) {
    const s = scale || 1;
    ctx.save(); ctx.translate(a.x, a.y); ctx.scale(s, s);
    const sq = a.squash || 0;
    const walk = a.onGround && Math.abs(a.vx) > 5 ? Math.sin(a.walk * 14) : 0;
    ctx.fillStyle = C.amber;
    ctx.fillRect(-9 + (walk > 0 ? 2 : 0), -7 - (walk > 0 ? 3 : 0), 6, 7);
    ctx.fillRect(3 - (walk < 0 ? 2 : 0), -7 - (walk < 0 ? 3 : 0), 6, 7);
    ctx.translate(0, -7); ctx.scale(1 + sq * 0.25, 1 - sq * 0.25);
    // body: a block cursor with a face
    ctx.fillStyle = amb(0.14); ctx.fillRect(-18, -35, 36, 39);
    ctx.fillStyle = C.crt; ctx.fillRect(-14, -31, 28, 31);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2.4; ctx.strokeRect(-14, -31, 28, 31);
    // caret antenna
    if ((t * 1.6) % 1 < 0.6) { ctx.fillStyle = C.amber; ctx.fillRect(-3, -42, 6, 8); }
    const f = a.face || 1;
    const blink = (t * 0.6) % 2.7 < 0.09 ? 0.2 : 1;
    ctx.fillStyle = C.amber;
    ctx.fillRect(f * 3 - 8, -21, 5, 6 * blink); ctx.fillRect(f * 3 + 3, -21, 5, 6 * blink);
    ctx.restore();
  }
  function avatarWhole(ctx, a, t, scale) {
    const s = scale || 1;
    ctx.save(); ctx.translate(a.x, a.y); ctx.scale(s, s);
    const sq = a.squash || 0;
    const walk = a.onGround && Math.abs(a.vx) > 5 ? Math.sin(a.walk * 14) : 0;
    ctx.strokeStyle = C.white; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6 + walk * 5, 0); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.fillRect(3 - walk * 2, -7, 6, 7);
    ctx.translate(0, -8); ctx.scale(1 + sq * 0.25, 1 - sq * 0.25);
    ctx.fillStyle = amb(0.16); ctx.beginPath(); ctx.arc(0, -15, 23, 0, 6.3); ctx.fill();
    // one body: round on the scientist's side, square on the engineer's
    ctx.fillStyle = C.white; ctx.beginPath();
    ctx.moveTo(0, -31); ctx.lineTo(14, -31); ctx.lineTo(14, 0); ctx.lineTo(0, 0.5);
    ctx.ellipse(0, -15, 14.5, 15.5, 0, Math.PI / 2, Math.PI * 1.5); ctx.fill();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -31); ctx.lineTo(14, -31); ctx.lineTo(14, 0); ctx.lineTo(0, 0); ctx.stroke();
    const sway = clamp(-a.vx / 60, -5, 5) + Math.sin(t * 2.2) * 1.4;
    ctx.strokeStyle = C.white; ctx.fillStyle = C.white; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-3, -30); ctx.quadraticCurveTo(-3 + sway * 0.3, -37, -3 + sway, -42); ctx.stroke();
    leaf(ctx, -3 + sway, -42, 13, 5, Math.PI + 0.6);
    if ((t * 1.6) % 1 < 0.6) { ctx.fillStyle = C.amber; ctx.fillRect(5, -42, 6, 8); }
    const f = a.face || 1;
    const blink = (t * 0.7) % 3.1 < 0.09 ? 0.15 : 1;
    ctx.fillStyle = C.deep;
    ctx.beginPath(); ctx.ellipse(f * 3 - 4.6, -17, 2.6, 3.4 * blink, 0, 0, 6.3); ctx.fill();
    ctx.fillRect(f * 3 + 2.4, -20.5, 4.6, 6.4 * blink);
    ctx.restore();
  }

  // ---- one pane of the split world ----------------------------------
  function drawWorld(ctx, side, v) {
    const L = side === 'L';
    const { px, py, pw, ph, s, camX, t, W, H, game } = v;
    const lvl = LEVEL[side];
    const a = game.av[side];
    const viewW = pw / s;
    const m = 200;

    // paper or glass
    ctx.fillStyle = L ? C.paper : C.crt;
    ctx.fillRect(0, 0, W, H);

    // the notebook grid / the terminal grid, sliding slowly
    const gs = 32 * s, gox = px - ((camX * 0.2 * s) % gs), goy = py + ((G * s) % gs);
    ctx.strokeStyle = L ? ink(0.085) : amb(0.05); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gox - gs * 8; x < W + gs; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = goy - gs * 40; y < H + gs; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // the half disc on the seam: a sun on paper, a ring on glass
    const d = v.disc;
    if (L) {
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.3); ctx.fill();
      ctx.strokeStyle = ink(0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.22 + d.pulse * 6, 0, 6.3); ctx.stroke();
    } else {
      ctx.strokeStyle = amb(0.16); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.3); ctx.stroke();
      ctx.setLineDash([3, 7]); ctx.strokeStyle = amb(0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.22 + d.pulse * 6, t * 0.1, t * 0.1 + 6.3); ctx.stroke(); ctx.setLineDash([]);
    }

    // far layer: the year, enormous
    ctx.save(); ctx.translate(px - camX * F_FAR * s, py); ctx.scale(s, s);
    for (let i = 0; i < CHAPTERS.length; i++) {
      const lx = i === 0 ? 640 : CHAPTERS[i].start * F_FAR + 250;
      if (lx < camX * F_FAR - 900 || lx > camX * F_FAR + viewW + m) continue;
      if (L) {
        ctx.font = `italic 400 250px ${SERIF}`; ctx.fillStyle = ink(0.1);
        ctx.fillText(CHAPTERS[i].year, lx, G - 120);
      } else {
        ctx.font = `800 condensed 190px ${MONO}`; ctx.strokeStyle = amb(0.2); ctx.lineWidth = 1.5;
        ctx.strokeText(CHAPTERS[i].year, lx, G - 130);
      }
    }
    ctx.restore();

    // mid layer: the skyline of each place
    ctx.save(); ctx.translate(px - camX * F_MID * s, py); ctx.scale(s, s);
    const mid = decor[side].mid, mc = camX * F_MID;
    for (let i = 0; i < mid.length; i++) {
      const o = mid[i];
      if (o.x < mc - m - 160 || o.x > mc + viewW + m) continue;
      const r = rng(o.seed);
      if (L) {
        ctx.strokeStyle = ink(0.26); ctx.fillStyle = ink(0.26);
        const sway = Math.sin(t * 0.8 + o.x) * 3;
        if (o.ch === 0) { if (o.k < 0.55) palm(ctx, o.x, G, 150 + r() * 110, r, sway); else { ctx.fillStyle = ink(0.2); fern(ctx, o.x, G, 70 + r() * 50, (r() - 0.5) * 60, 7, sway); } }
        else if (o.ch === 1) { if (o.k < 0.8) inkTower(ctx, o.x, G, 44 + r() * 50, 110 + r() * 210, r); else { ctx.lineWidth = 2.5; for (let j = 0; j < 3; j++) { const bx = o.x + j * 12; ctx.beginPath(); ctx.moveTo(bx, G); ctx.lineTo(bx + sway * 0.6, G - 130 - j * 24); ctx.stroke(); } } }
        else if (o.ch === 2) { if (o.k < 0.5) arch(ctx, o.x, G, 70 + r() * 30, 120 + r() * 80, r); else bareTree(ctx, o.x, G, 50 + r() * 26, -Math.PI / 2 + (r() - 0.5) * 0.2, 5, r); }
        else { orchard(ctx, o.x, G, 90 + r() * 50, r, 0.26); }
      } else {
        if (o.ch === 0) { if (o.k < 0.5) termWindow(ctx, o.x, G - 140 - r() * 150, o.w + 30, 60 + r() * 50, r); else codeTower(ctx, o.x, G, o.w, 60 + r() * 110, r, 0, t); }
        else if (o.ch === 1) codeTower(ctx, o.x, G, o.w, 130 + r() * 230, r, 1, t);
        else if (o.ch === 2) { if (o.k < 0.6) codeTower(ctx, o.x, G, o.w, 70 + r() * 120, r, 2, t); else termWindow(ctx, o.x, G - 150 - r() * 120, o.w + 20, 56 + r() * 40, r); }
        else {
          codeTower(ctx, o.x, G, o.w, 100 + r() * 200, r, 3, t);
          // a paper-white sprig growing on the code: the other world showing through
          if (o.k < 0.45) { ctx.strokeStyle = wht(0.5); ctx.fillStyle = wht(0.5); sprig(ctx, o.x + o.w * 0.5, G, 30 + r() * 26, r, 3); }
        }
      }
    }
    // New Haven: a heartbeat runs behind the engineer's skyline
    if (!L) {
      const e0 = CHAPTERS[2].start * F_MID, e1 = CHAPTERS[3].start * F_MID;
      const x0 = Math.max(e0, mc - m), x1 = Math.min(e1, mc + viewW + m);
      if (x1 > x0) {
        ctx.strokeStyle = amb(0.5); ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = Math.floor(x0 / 4) * 4; x < x1; x += 4) {
          const p = ((x % 190) + 190) % 190;
          let y = 0;
          if (p > 60 && p < 68) y = -8; else if (p >= 68 && p < 74) y = 60; else if (p >= 74 && p < 82) y = -22; else if (p > 100 && p < 124) y = 9 * Math.sin((p - 100) / 24 * Math.PI);
          ctx.lineTo(x, 150 - y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // world layer
    ctx.save(); ctx.translate(px - camX * s, py); ctx.scale(s, s);
    const x0 = camX - m, x1 = camX + viewW + m;

    // near decor
    const near = decor[side].near;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o.x < x0 - 60 || o.x > x1 + 60) continue;
      if (inPit(lvl, o.x)) continue;
      const r = rng(o.seed);
      if (L) {
        const sway = Math.sin(t * 1.3 + o.x * 0.05) * 2.5;
        ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink;
        if (o.ch === 2 && o.k < 0.5) { ctx.lineWidth = 1.4; for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.moveTo(o.x + j * 5, G); ctx.lineTo(o.x + j * 5 + (j - 1.5) * 4, G - 12 - r() * 12); ctx.stroke(); } }
        else if (o.k < 0.4) fern(ctx, o.x, G, 34 + r() * 44, (r() - 0.5) * 44, 6, sway);
        else if (o.k < 0.8) sprig(ctx, o.x, G, 26 + r() * 34, r, sway * 0.7);
        else { ctx.lineWidth = 1.4; for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.moveTo(o.x + j * 4, G); ctx.quadraticCurveTo(o.x + j * 4, G - 10, o.x + j * 4 + (j - 2) * 4 + sway, G - 14 - r() * 10); ctx.stroke(); } }
      } else {
        ctx.fillStyle = amb(0.5); ctx.strokeStyle = amb(0.5); ctx.lineWidth = 1.2;
        if (o.k < 0.35) { const h = 20 + r() * 50; ctx.beginPath(); ctx.moveTo(o.x, G); ctx.lineTo(o.x, G - h); ctx.stroke(); if ((t * 1.2 + o.k * 9) % 1.4 < 0.7) ctx.fillRect(o.x - 2.5, G - h - 5, 5, 5); }
        else if (o.k < 0.7) { const n = 2 + ((r() * 4) | 0); for (let j = 0; j < n; j++) ctx.strokeRect(o.x + j * 11, G - 9 - ((r() * 3) | 0) * 9, 8, 8); }
        else { ctx.font = `400 9px ${MONO}`; ctx.fillStyle = amb(0.42); ctx.fillText(['//', '0x' + ((o.x | 0) & 255).toString(16), '&&', '::', 'ok'][(r() * 5) | 0], o.x, G - 10); }
      }
    }

    // ground, pits and bridges
    drawGround(ctx, side, lvl, x0, x1, t, game);

    // signposts
    (lvl.signs || []).forEach((sg) => {
      if (sg.x < x0 - 100 || sg.x > x1 + 100) return;
      if (L) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sg.x, G); ctx.lineTo(sg.x, G - 120); ctx.stroke();
        ctx.fillStyle = C.paper; ctx.fillRect(sg.x - 62, G - 150, 124, 72); ctx.lineWidth = 2; ctx.strokeRect(sg.x - 62, G - 150, 124, 72);
        ctx.fillStyle = C.ink; ctx.textAlign = 'center';
        ctx.font = `italic 400 15px ${SERIF}`; ctx.fillText(sg.text[0], sg.x, G - 128);
        ctx.font = `700 22px ${SERIF}`; ctx.fillText(sg.text[1], sg.x, G - 104);
        ctx.font = `italic 400 14px ${SERIF}`; ctx.fillText(sg.text[2], sg.x, G - 87);
        ctx.textAlign = 'left';
      } else {
        ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sg.x, G); ctx.lineTo(sg.x, G - 120); ctx.stroke();
        ctx.fillStyle = C.crt; ctx.fillRect(sg.x - 62, G - 150, 124, 72); ctx.strokeRect(sg.x - 62, G - 150, 124, 72);
        ctx.fillStyle = C.amber; ctx.textAlign = 'center';
        ctx.font = `400 9.5px ${MONO}`; ctx.fillText(sg.text[0], sg.x, G - 130);
        ctx.font = `800 17px ${MONO}`; ctx.fillText(sg.text[1], sg.x, G - 106);
        ctx.font = `400 9.5px ${MONO}`; ctx.fillText('> ' + sg.text[2], sg.x, G - 89);
        ctx.textAlign = 'left';
      }
    });

    // crates
    lvl.solids.forEach((b, i) => {
      if (b.x + b.w < x0 || b.x > x1) return;
      if (L) {
        ctx.fillStyle = C.paper; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.strokeRect(b.x, b.y, b.w, b.h);
        // a specimen drawer: one rule, one handle, some hatching
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x, b.y + 12); ctx.lineTo(b.x + b.w, b.y + 12); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y + 12, b.w, b.h - 12); ctx.clip(); ctx.strokeStyle = ink(0.28);
        for (let k = -b.h; k < b.w; k += 9) { ctx.beginPath(); ctx.moveTo(b.x + k, b.y + b.h); ctx.lineTo(b.x + k + b.h, b.y); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = C.paper; ctx.fillRect(b.x + b.w / 2 - 22, b.y + 22, 44, 17); ctx.strokeStyle = C.ink; ctx.strokeRect(b.x + b.w / 2 - 22, b.y + 22, 44, 17);
        ctx.fillStyle = C.ink; ctx.font = `italic 400 11px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('fig. ' + (i + 1), b.x + b.w / 2, b.y + 34.5); ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = C.crt; ctx.fillRect(b.x, b.y, b.w, b.h);
        glowLine(ctx, () => { ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); }, C.amber, 1.8);
        ctx.fillStyle = amb(0.2);
        const r = rng(i * 99 + 5);
        for (let k = 0; k < ((b.h - 14) / 9) | 0; k++) ctx.fillRect(b.x + 10 + ((r() * 3) | 0) * 7, b.y + 12 + k * 9, (b.w - 40) * (0.3 + r() * 0.7), 3);
        ctx.fillStyle = C.amber; ctx.fillRect(b.x, b.y, 7, 7); ctx.fillRect(b.x + b.w - 7, b.y, 7, 7);
      }
    });

    // gates and review walls
    lvl.gates.forEach((g) => {
      if (g.x < x0 - 60 || g.x > x1 + 60) return;
      const st = game.gate[g.id];
      const open = ease(clamp(st.t, 0, 1));
      const h = 250 * (1 - open);
      if (h < 2) return;
      const top = G - h;
      if (L) {
        ctx.fillStyle = C.paper; ctx.fillRect(g.x, top, 26, h);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.strokeRect(g.x, top, 26, h);
        ctx.save(); ctx.beginPath(); ctx.rect(g.x, top, 26, h); ctx.clip(); ctx.lineWidth = 2;
        for (let y = G - 250; y < G + 20; y += 13) { ctx.beginPath(); ctx.moveTo(g.x, y + 13); ctx.lineTo(g.x + 13, y); ctx.lineTo(g.x + 26, y + 13); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = C.ink; ctx.font = `italic 400 14px ${SERIF}`; ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - open; ctx.fillText(st.ready ? 'waiting for both of me' : g.label, g.x + 13, top - 12); ctx.globalAlpha = 1; ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = C.crt; ctx.fillRect(g.x, top, 26, h);
        const r = rng(((t * 6) | 0) + g.x);
        ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'center';
        for (let y = top + 14; y < G; y += 15) { ctx.fillStyle = amb(0.35 + r() * 0.65); ctx.fillText(g.id[0] === 'w' ? '−' : '01{}<>/#'[(r() * 8) | 0], g.x + 13, y); }
        glowLine(ctx, () => { ctx.beginPath(); ctx.rect(g.x, top, 26, h); }, C.amber, 1.8);
        ctx.fillStyle = C.amber; ctx.font = `400 9.5px ${MONO}`;
        ctx.globalAlpha = 1 - open; ctx.fillText(st.ready ? 'waiting for both of me' : g.label, g.x + 13, top - 12); ctx.globalAlpha = 1; ctx.textAlign = 'left';
      }
    });

    // review pads
    (lvl.pads || []).forEach((p) => {
      if (p.x < x0 - 80 || p.x > x1 + 80) return;
      const done = game.pad[p.id];
      const cx = p.x + p.w / 2;
      if (L) {
        ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
        ctx.fillRect(cx - 34, p.y - 5, 68, 5); ctx.strokeRect(cx - 34, p.y - 5, 68, 5);
        if (!done.on) { ctx.fillStyle = C.ink; ctx.font = `italic 400 13px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('stand here to review', cx, p.y - 52 + Math.sin(t * 3) * 2); ctx.textAlign = 'left'; }
        else {
          const k = clamp(done.t * 5, 0, 1), sc = 1.7 - 0.7 * k;
          ctx.save(); ctx.translate(cx, p.y - 78); ctx.rotate(-0.14); ctx.scale(sc, sc); ctx.globalAlpha = k;
          ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4; ctx.strokeRect(-36, -20, 72, 40); ctx.lineWidth = 1; ctx.strokeRect(-31, -15, 62, 30);
          ctx.fillStyle = C.ink; ctx.font = `700 21px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('LGTM', 0, 7.5);
          ctx.restore(); ctx.textAlign = 'left';
        }
      } else {
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6; ctx.fillStyle = done.on ? C.amber : C.crt;
        ctx.fillRect(cx - 34, p.y - 5, 68, 5); ctx.strokeRect(cx - 34, p.y - 5, 68, 5);
        ctx.fillStyle = C.amber; ctx.font = `400 9.5px ${MONO}`; ctx.textAlign = 'center';
        if (!done.on) ctx.fillText('stand here to run tests', cx, p.y - 52 + Math.sin(t * 3) * 2);
        else { const n = Math.min(12, (done.t * 14) | 0); ctx.font = `700 11px ${MONO}`; ctx.fillText('✓'.repeat(Math.min(n, 6)), cx, p.y - 74); ctx.fillText(n >= 12 ? '12 passed' : 'running', cx, p.y - 58); }
        ctx.textAlign = 'left';
      }
    });

    // pickups
    lvl.pickups.forEach((p, i) => {
      if (p.got || p.x < x0 || p.x > x1) return;
      const y = p.y + Math.sin(t * 2.4 + i) * 4;
      const big = p.big;
      ctx.textAlign = 'center';
      if (L) {
        const R = big ? 21 : 15;
        ctx.strokeStyle = ink(0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, y, R + 5 + Math.sin(t * 3 + i) * 2, 0, 6.3); ctx.stroke();
        if (big) {
          ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(p.x, y, R, 0, 6.3); ctx.fill();
          ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = C.ink; ctx.font = `700 24px ${SERIF}`; ctx.fillText(p.glyph, p.x, y + 8.5);
          ctx.beginPath(); ctx.arc(p.x + Math.cos(t * 2.5) * (R + 9), y + Math.sin(t * 2.5) * (R + 9), 3, 0, 6.3); ctx.fill();
        } else {
          ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(p.x, y, R, 0, 6.3); ctx.fill();
          ctx.fillStyle = C.paper; ctx.font = `italic 400 20px ${SERIF}`; ctx.fillText(p.glyph, p.x - 0.5, y + 6.5);
        }
      } else {
        const R = big ? 22 : 14;
        ctx.fillStyle = amb(0.1); ctx.fillRect(p.x - R - 6, y - R - 6, R * 2 + 12, R * 2 + 12);
        ctx.fillStyle = C.crt; ctx.fillRect(p.x - R, y - R, R * 2, R * 2);
        ctx.strokeStyle = C.amber; ctx.lineWidth = big ? 2.4 : 1.6;
        if (big) {
          // a file with a folded corner
          ctx.beginPath(); ctx.moveTo(p.x - R, y - R); ctx.lineTo(p.x + R - 10, y - R); ctx.lineTo(p.x + R, y - R + 10); ctx.lineTo(p.x + R, y + R); ctx.lineTo(p.x - R, y + R); ctx.closePath(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p.x + R - 10, y - R); ctx.lineTo(p.x + R - 10, y - R + 10); ctx.lineTo(p.x + R, y - R + 10); ctx.stroke();
          ctx.fillStyle = C.amber; ctx.font = `700 11px ${MONO}`; ctx.fillText(p.glyph, p.x, y + 8);
        } else {
          const c = 5;
          ctx.beginPath();
          ctx.moveTo(p.x - R, y - R + c); ctx.lineTo(p.x - R, y - R); ctx.lineTo(p.x - R + c, y - R);
          ctx.moveTo(p.x + R - c, y - R); ctx.lineTo(p.x + R, y - R); ctx.lineTo(p.x + R, y - R + c);
          ctx.moveTo(p.x + R, y + R - c); ctx.lineTo(p.x + R, y + R); ctx.lineTo(p.x + R - c, y + R);
          ctx.moveTo(p.x - R + c, y + R); ctx.lineTo(p.x - R, y + R); ctx.lineTo(p.x - R, y + R - c);
          ctx.stroke();
          ctx.fillStyle = C.amber; ctx.font = `800 17px ${MONO}`; ctx.fillText(p.glyph, p.x, y + 6);
        }
      }
      ctx.textAlign = 'left';
    });

    // bugs, both kinds
    lvl.bugs.forEach((b, i) => {
      if (b.got || b.x < x0 || b.x > x1) return;
      const y = b.fly ? b.y + Math.sin(t * 3 + i) * 12 : b.y;
      ctx.save(); ctx.translate(b.x, y); ctx.scale(b.dir, 1);
      if (L) {
        ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 1.6;
        const w = Math.sin(t * 22 + i);
        if (b.fly) { // a moth
          ctx.globalAlpha = 0.75;
          ctx.beginPath(); ctx.ellipse(-3, -8, 13, 7 * Math.abs(w) + 2, -0.5, 0, 6.3); ctx.ellipse(3, -8, 11, 6 * Math.abs(w) + 2, 0.5, 0, 6.3); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.5, 0, 0, 6.3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(9, -2); ctx.lineTo(16, -9); ctx.moveTo(9, 0); ctx.lineTo(17, -4); ctx.stroke();
        } else { // a beetle
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 6, -6); ctx.lineTo(k * 6 + w * 3 * (k === 0 ? -1 : 1), 0); ctx.stroke(); }
          ctx.beginPath(); ctx.ellipse(0, -10, 13, 8, 0, 0, 6.3); ctx.fill();
          ctx.beginPath(); ctx.arc(13, -9, 5, 0, 6.3); ctx.fill();
          ctx.strokeStyle = C.paper; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, -11); ctx.lineTo(9, -11); ctx.stroke();
          ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(16, -12); ctx.lineTo(21, -18); ctx.moveTo(17, -10); ctx.lineTo(23, -13); ctx.stroke();
        }
      } else {
        // a software bug: a small pixel creature that flickers
        const px8 = 4, glitch = (t * 9 + i) % 3 < 0.25 ? 2 : 0;
        const rows = b.fly ? ['0100010', '1011101', '0111110', '1010101', '0000000'] : ['0010100', '0111110', '1101011', '1111111', '0100010'];
        ctx.fillStyle = amb(0.14); ctx.fillRect(-20, -28, 40, 30);
        ctx.fillStyle = C.amber;
        rows.forEach((row, ry) => { for (let cx = 0; cx < 7; cx++) if (row[cx] === '1') ctx.fillRect(-14 + cx * px8 + (ry === 2 ? glitch : 0), -22 + ry * px8 + (b.fly ? 0 : 2), px8, px8); });
      }
      ctx.restore();
    });

    // particles
    game.parts[side].forEach((p) => {
      const k = clamp(p.life / p.max, 0, 1);
      if (L) { ctx.fillStyle = ink(k); if (p.txt) { ctx.font = `italic 400 16px ${SERIF}`; ctx.fillText(p.txt, p.x, p.y); } else leaf(ctx, p.x, p.y, 8 * k + 2, 3, p.rot + p.life * 4); }
      else { ctx.fillStyle = amb(k); if (p.txt) { ctx.font = `700 11px ${MONO}`; ctx.fillText(p.txt, p.x, p.y); } else ctx.fillRect(p.x, p.y, 4, 4); }
    });

    // the intern, a few steps behind
    if (game.follower.on) {
      const f = game.follower[side];
      if (f) { ctx.globalAlpha = clamp(game.follower.t, 0, 1); (L ? avatarL : avatarR)(ctx, f, t + 0.7, 0.62); ctx.globalAlpha = 1; }
    }

    // the player
    if (!game.hideAvatars) {
      if (!L && Math.abs(a.vx) > 5) { ctx.globalAlpha = 0.25; ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; ctx.strokeRect(a.x - 14 - a.face * 9, a.y - 38, 28, 31); ctx.globalAlpha = 0.12; ctx.strokeRect(a.x - 14 - a.face * 18, a.y - 38, 28, 31); ctx.globalAlpha = 1; }
      (L ? avatarL : avatarR)(ctx, a, t);
    }
    ctx.restore();

    // weather in New Haven: snow on paper, falling digits on glass
    const wx = clamp(1 - Math.abs((a.x - (CHAPTERS[2].start + CHAPTERS[3].start) / 2) / ((CHAPTERS[3].start - CHAPTERS[2].start) / 2 + 100)), 0, 1);
    if (wx > 0) {
      const k = Math.min(1, wx * 4);
      if (!L) ctx.font = `400 ${10 * s}px ${MONO}`;
      for (let i = 0; i < 46; i++) {
        const sp = 40 + ((i * 37) % 50);
        const sx = px - 60 + (((i * 197.3 + t * (L ? 14 : 0) - camX * 0.3 * s) % (pw + 120)) + (pw + 120)) % (pw + 120);
        const sy = py + ((i * 91.7 + t * sp * (L ? 1 : 2.4)) % ph);
        if (L) { ctx.fillStyle = ink(0.5 * k); ctx.beginPath(); ctx.arc(sx + Math.sin(t + i) * 8, sy, (1.4 + (i % 3)) * s, 0, 6.3); ctx.fill(); }
        else { ctx.fillStyle = amb(0.3 * k); ctx.fillText((i + ((t * 3) | 0)) % 2 ? '1' : '0', sx, sy); }
      }
    }

    // paper grain / scanlines
    if (L) {
      patInk = patInk || ctx.createPattern(grainInk, 'repeat');
      ctx.fillStyle = patInk; ctx.fillRect(0, 0, W, H);
    } else {
      patLight = patLight || ctx.createPattern(grainLight, 'repeat');
      ctx.fillStyle = patLight; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let y = (py | 0); y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }
  }

  function inPit(lvl, x) {
    for (let i = 0; i < lvl.pits.length; i++) if (x > lvl.pits[i].x0 - 14 && x < lvl.pits[i].x1 + 14) return true;
    return false;
  }

  function drawGround(ctx, side, lvl, x0, x1, t, game) {
    const L = side === 'L';
    // ground runs everywhere except over the pits
    const segs = []; let cur = x0;
    lvl.pits.forEach((p) => { if (p.x1 < x0 || p.x0 > x1) return; segs.push([cur, p.x0]); cur = p.x1; });
    segs.push([cur, x1]);
    segs.forEach(([a, b]) => {
      if (b <= a) return;
      if (L) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a, G + 1.5); ctx.lineTo(b, G + 1.5); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = ink(0.45); ctx.beginPath();
        for (let x = Math.ceil(a / 12) * 12; x < b; x += 12) { ctx.moveTo(x, G + 6); ctx.lineTo(x - 9, G + 20); }
        ctx.stroke();
        ctx.strokeStyle = ink(0.2); ctx.beginPath(); ctx.moveTo(a, G + 30); ctx.lineTo(b, G + 30); ctx.stroke();
      } else {
        glowLine(ctx, () => { ctx.beginPath(); ctx.moveTo(a, G + 1); ctx.lineTo(b, G + 1); }, C.amber, 2);
        ctx.strokeStyle = amb(0.3); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.moveTo(Math.floor(a / 8) * 8, G + 16); ctx.lineTo(b, G + 16); ctx.stroke();
        ctx.strokeStyle = amb(0.16); ctx.setLineDash([2, 14]);
        ctx.beginPath(); ctx.moveTo(Math.floor(a / 16) * 16, G + 36); ctx.lineTo(b, G + 36); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = amb(0.4); ctx.font = `400 8px ${MONO}`;
        for (let x = Math.ceil(a / 256) * 256; x < b; x += 256) { ctx.fillRect(x, G + 2, 1, 9); ctx.fillText('0x' + (x >> 4 & 0xfff).toString(16), x + 4, G + 30); }
      }
    });
    lvl.pits.forEach((p) => {
      if (p.x1 < x0 || p.x0 > x1) return;
      const b = game.bridge[p.flag];
      const k = ease(clamp(b.t, 0, 1));
      const w = p.x1 - p.x0;
      if (L) {
        // pit walls
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x0, G); ctx.lineTo(p.x0, G + 240); ctx.moveTo(p.x1, G); ctx.lineTo(p.x1, G + 240); ctx.stroke();
        if (!b.on) {
          ctx.setLineDash([4, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = ink(0.5); ctx.beginPath(); ctx.moveTo(p.x0, G); ctx.lineTo(p.x1, G); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.ink; ctx.font = `italic 400 14px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('needs data', p.x0 + w / 2, G - 14); ctx.textAlign = 'left';
        } else {
          // a bridge made of double helix
          const end = p.x0 + w * k;
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; ctx.beginPath();
          for (let x = p.x0; x < end; x += 12) { const y = Math.sin((x - p.x0) * 0.07) * 7; ctx.moveTo(x, G + 9 - y); ctx.lineTo(x, G + 9 + y); }
          ctx.stroke();
          ctx.lineWidth = 2.6;
          [1, -1].forEach((sg) => { ctx.beginPath(); for (let x = p.x0; x <= end; x += 4) ctx.lineTo(x, G + 9 + sg * Math.sin((x - p.x0) * 0.07) * 7); ctx.stroke(); });
          ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x0, G + 1.5); ctx.lineTo(end, G + 1.5); ctx.stroke();
        }
      } else {
        glowLine(ctx, () => { ctx.beginPath(); ctx.moveTo(p.x0, G); ctx.lineTo(p.x0, G + 240); ctx.moveTo(p.x1, G); ctx.lineTo(p.x1, G + 240); }, C.amber, 2);
        if (!b.on) {
          ctx.setLineDash([4, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = amb(0.5); ctx.beginPath(); ctx.moveTo(p.x0, G); ctx.lineTo(p.x1, G); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.amber; ctx.font = `400 9.5px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('needs a hypothesis', p.x0 + w / 2, G - 14); ctx.textAlign = 'left';
        } else {
          // a bridge made of rows
          const n = Math.round(w / 25), cw = w / n;
          for (let i = 0; i < Math.ceil(n * k); i++) {
            ctx.fillStyle = C.crt; ctx.fillRect(p.x0 + i * cw + 1, G, cw - 2, 16);
            ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6; ctx.strokeRect(p.x0 + i * cw + 1, G + 1, cw - 2, 15);
            ctx.fillStyle = amb(0.6); ctx.fillRect(p.x0 + i * cw + 5, G + 7, (cw - 12) * (0.4 + ((i * 7) % 5) / 8), 3);
          }
        }
      }
    });
  }

  // ---- the seam -----------------------------------------------------
  // drawn as an unzipped strand: rungs bond from the bottom up as the
  // story progresses, and the last ones close when the player merges.
  function drawSeam(ctx, geo, progress, gap, t, flash) {
    const { cx, cy, dx, dy, nx, ny, len } = geo;
    const n = 44;
    const half = len / 2;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;            // 0 at the start of the line, 1 at the end
      const along = half - u * len;       // bonding starts from the far end
      const bx = cx + dx * along, by = cy + dy * along;
      const bonded = u < progress;
      const reach = bonded ? gap / 2 : 5 + Math.sin(t * 2 + i) * 1.5;
      const off = gap / 2;
      ctx.lineWidth = 2;
      if (bonded) {
        ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(bx - nx * (off + 7), by - ny * (off + 7)); ctx.lineTo(bx - nx * off, by - ny * off); ctx.stroke();
        ctx.strokeStyle = C.amber; ctx.beginPath(); ctx.moveTo(bx + nx * off, by + ny * off); ctx.lineTo(bx + nx * (off + 7), by + ny * (off + 7)); ctx.stroke();
        ctx.strokeStyle = C.white; ctx.beginPath(); ctx.moveTo(bx - nx * off, by - ny * off); ctx.lineTo(bx + nx * off, by + ny * off); ctx.stroke();
      } else {
        ctx.strokeStyle = ink(0.55); ctx.beginPath(); ctx.moveTo(bx - nx * (off + reach), by - ny * (off + reach)); ctx.lineTo(bx - nx * off, by - ny * off); ctx.stroke();
        ctx.strokeStyle = amb(0.55); ctx.beginPath(); ctx.moveTo(bx + nx * off, by + ny * off); ctx.lineTo(bx + nx * (off + reach), by + ny * (off + reach)); ctx.stroke();
      }
    }
    // the two strands
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(cx - dx * half - nx * gap / 2, cy - dy * half - ny * gap / 2); ctx.lineTo(cx + dx * half - nx * gap / 2, cy + dy * half - ny * gap / 2); ctx.stroke();
    ctx.strokeStyle = C.amber; ctx.beginPath(); ctx.moveTo(cx - dx * half + nx * gap / 2, cy - dy * half + ny * gap / 2); ctx.lineTo(cx + dx * half + nx * gap / 2, cy + dy * half + ny * gap / 2); ctx.stroke();
    if (flash > 0) {
      ctx.strokeStyle = wht(flash); ctx.lineWidth = 3 + flash * 26;
      ctx.beginPath(); ctx.moveTo(cx - dx * half, cy - dy * half); ctx.lineTo(cx + dx * half, cy + dy * half); ctx.stroke();
    }
  }

  // ---- the whole world: a blueprint -----------------------------------
  const plants = [];
  (function () {
    const r = rng(404);
    for (let i = 0; i < 26; i++) plants.push({ u: r(), h: 0.1 + r() * 0.26, seed: (r() * 1e9) | 0, k: r() });
  })();

  function drawMerged(ctx, W, H, t, o) {
    const gy = o.groundY;
    const grd = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
    grd.addColorStop(0, '#12388C'); grd.addColorStop(0.6, C.deep); grd.addColorStop(1, C.deeper);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // blueprint grid
    const g1 = Math.max(18, Math.round(W / 60));
    ctx.lineWidth = 1; ctx.strokeStyle = wht(0.05); ctx.beginPath();
    for (let x = (W / 2) % g1; x < W; x += g1) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = gy % g1; y < H; y += g1) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = wht(0.09); ctx.beginPath();
    for (let x = (W / 2) % (g1 * 5); x < W; x += g1 * 5) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = gy % (g1 * 5); y < H; y += g1 * 5) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // the whole disc
    const d = o.disc;
    ctx.fillStyle = amb(0.07); ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.9, 0, 6.3); ctx.fill();
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.22, 0, 6.3); ctx.stroke();
    ctx.setLineDash([2, 8]); ctx.strokeStyle = wht(0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.5, t * 0.05, t * 0.05 + 6.3); ctx.stroke(); ctx.setLineDash([]);

    // ground: hatched like the scientist's, lit like the engineer's
    ctx.strokeStyle = amb(0.2); ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.strokeStyle = C.white; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.strokeStyle = wht(0.35); ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x < W + 12; x += 12) { ctx.moveTo(x, gy + 6); ctx.lineTo(x - 9, gy + 20); }
    ctx.stroke();
    ctx.strokeStyle = amb(0.4); ctx.setLineDash([2, 8]); ctx.beginPath(); ctx.moveTo(0, gy + 30); ctx.lineTo(W, gy + 30); ctx.stroke(); ctx.setLineDash([]);

    // blueprint botany: plants drawn as engineering drawings
    const sc = Math.min(1.4, Math.max(0.7, H / 800));
    plants.forEach((p, i) => {
      // keep the middle clear for the words
      const u = i % 2 ? p.u * 0.31 : 0.69 + p.u * 0.31;
      const x = u * W, h = p.h * Math.min(H, W * 1.15) * (0.4 + 0.6 * Math.abs(u - 0.5) * 2) * (0.6 + 0.4 * Math.min(1, o.grow * 1.6 - (i % 5) * 0.08));
      if (h < 4) return;
      const r = rng(p.seed);
      const sway = Math.sin(t * 0.9 + i) * 4;
      ctx.strokeStyle = wht(0.85); ctx.lineWidth = 1.4; ctx.fillStyle = wht(0.07);
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.quadraticCurveTo(x + sway * 0.4, gy - h * 0.5, x + sway, gy - h); ctx.stroke();
      const n = 3 + ((r() * 4) | 0);
      for (let j = 0; j < n; j++) {
        const tt = (j + 1) / (n + 0.6);
        const px = x + sway * tt * tt, py = gy - h * tt;
        const len = (16 + r() * 22) * sc * (1 - tt * 0.4), ang = (j % 2 ? -0.5 : Math.PI + 0.5) + (r() - 0.5) * 0.3;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.45, -len * 0.3, len, 0); ctx.quadraticCurveTo(len * 0.45, len * 0.3, 0, 0);
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.lineWidth = 0.7; ctx.stroke(); ctx.lineWidth = 1.4;
        ctx.restore();
        // amber node at every joint
        ctx.fillStyle = C.amber; ctx.fillRect(px - 2, py - 2, 4, 4); ctx.fillStyle = wht(0.07);
      }
      // a dimension line beside the tall ones
      if (p.k < 0.4 && h > 60) {
        const dxl = x + 26 * sc;
        ctx.strokeStyle = amb(0.7); ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(dxl, gy); ctx.lineTo(dxl, gy - h); ctx.moveTo(dxl - 4, gy); ctx.lineTo(dxl + 4, gy); ctx.moveTo(dxl - 4, gy - h); ctx.lineTo(dxl + 4, gy - h); ctx.stroke();
        ctx.fillStyle = amb(0.85); ctx.font = `400 ${9 * sc}px ${MONO}`; ctx.fillText((h / 100).toFixed(2), dxl + 7, gy - h / 2);
      }
    });

    // fireflies
    for (let i = 0; i < 30; i++) {
      const x = ((i * 137.5 + t * (6 + (i % 5) * 3)) % (W + 40)) - 20;
      const y = gy - 30 - ((i * 71.3) % (gy * 0.8)) + Math.sin(t * 0.8 + i * 2) * 14;
      const k = 0.4 + 0.6 * Math.sin(t * 1.7 + i * 1.3);
      ctx.fillStyle = amb(0.12 * k); ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.3); ctx.fill();
      ctx.fillStyle = amb(0.9 * k); ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    if (o.avatar) avatarWhole(ctx, o.avatar, t, o.avatarScale);

    patLight = patLight || ctx.createPattern(grainLight, 'repeat');
    ctx.fillStyle = patLight; ctx.fillRect(0, 0, W, H);
  }

  window.BellaRender = { C, drawWorld, drawSeam, drawMerged, avatarL, avatarR, avatarWhole, ease, clamp };
})();
