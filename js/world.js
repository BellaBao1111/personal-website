/* ------------------------------------------------------------------
   world.js — builds the three 3D worlds out of simple shapes.

   Both worlds are a desk seen from the height of something very small.
     L, forward:      a desk in daylight. Paper, books, pencils.
     R, the engineer: the same desk at night. Keycaps, circuit, screens.
     M, merged:       dawn. Both sets of things, one light.

   Everything is generated here: no model or image files.
   ------------------------------------------------------------------ */
import * as THREE from '../vendor/three.bundle.min.js';

const { LEVEL, CHAPTERS, END_X } = window.BELLA;

export const PAL = {
  paper: 0xEDF1F5, white: 0xF7F9FC, ink: 0x143C8C, cobalt: 0x2450B5, peri: 0xB4C3E6,
  sky: 0xE4EBF4, desk: 0xCBD6E8, amber: 0xFFB000, butter: 0xFFD98A, wood: 0xE9CFA8,
  crt: 0x100B06, dark: 0x1F1710, dark2: 0x2E2318, dark3: 0x443424, hot: 0xFF5A1F, deep: 0x0C2A6B
};
const SERIF = '"Old Standard TT", Georgia, serif';
const MONO = '"Martian Mono", ui-monospace, monospace';

// ---- helpers --------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mats = new Map();
function mat(color, o) {
  o = o || {};
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: o.rough === undefined ? 0.72 : o.rough, metalness: o.metal || 0,
      emissive: o.glow ? (o.glowColor === undefined ? color : o.glowColor) : 0x000000, emissiveIntensity: o.glow || 0,
      transparent: !!o.alpha, opacity: o.alpha === undefined ? 1 : o.alpha
    }));
  }
  return mats.get(key);
}
function shadow(m, cast, recv) { m.castShadow = cast !== false; m.receiveShadow = recv !== false; return m; }
function rbox(w, h, d, r) { return new THREE.RoundedBoxGeometry(w, h, d, 3, Math.min(r === undefined ? 0.08 : r, w / 2.01, h / 2.01, d / 2.01)); }
// a box given by its extents
function slab(parent, x0, x1, y0, y1, z0, z1, material, r) {
  const m = shadow(new THREE.Mesh(rbox(x1 - x0, y1 - y0, z1 - z0, r), material));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  parent.add(m); return m;
}
function cyl(parent, r0, r1, h, material, seg) {
  const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg || 20), material));
  parent.add(m); return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function textPlane(text, o) {
  const w = o.w || 512, h = o.h || 256;
  const tex = canvasTex(w, h, (c) => {
    if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, w, h); }
    c.fillStyle = o.color; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = Array.isArray(text) ? text : [text];
    lines.forEach((ln, i) => {
      const size = (o.sizes ? o.sizes[i] : o.size) || 120;
      c.font = (o.fonts ? o.fonts[i] : o.font).replace('SIZE', size + 'px');
      c.fillText(ln, w / 2, h * ((i + 0.5) / lines.length) + (o.dy || 0));
    });
  });
  const material = o.glow
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(o.glow, o.glow, o.glow) })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: !o.bg, roughness: 0.9 });
  return new THREE.Mesh(new THREE.PlaneGeometry(o.pw, o.pw * h / w), material);
}
const codeTex = [];
function codeTexture(i) {
  if (!codeTex[i]) {
    const r = rng(900 + i);
    codeTex[i] = canvasTex(256, 160, (c, w, h) => {
      c.fillStyle = '#0d0905'; c.fillRect(0, 0, w, h);
      for (let y = 12; y < h - 8; y += 11) {
        const ind = ((r() * 4) | 0) * 12;
        c.fillStyle = r() < 0.18 ? '#ffd27a' : r() < 0.3 ? '#7a5200' : '#ffb000';
        if (r() < 0.12) continue;
        c.fillRect(12 + ind, y, (w - 40 - ind) * (0.2 + r() * 0.8), 4);
      }
    });
  }
  return codeTex[i];
}
function chapterAt(x) { let c = 0; CHAPTERS.forEach((ch, i) => { if (x >= ch.start) c = i; }); return c; }
function overGround(side, x) { return LEVEL[side].ground.some((g) => x > g[0] + 1 && x < g[1] - 1); }

// ---- characters -------------------------------------------------------
// Each returns a group whose origin is at the feet.
function eye(parent, x, y, z, white, pupil) {
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), white); e.position.set(x, y, z); parent.add(e);
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), pupil); p.position.set(x, y, z + 0.075); parent.add(p);
  return e;
}
export function makeForward() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const b = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 22), mat(PAL.cobalt, { rough: 0.45 })));
  b.scale.set(1, 1.04, 0.94); b.position.y = 0.52; body.add(b);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat(PAL.white, { rough: 0.6 }));
  belly.scale.set(1, 0.9, 0.5); belly.position.set(0, 0.42, 0.26); body.add(belly);
  const w = mat(PAL.white, { rough: 0.3 }), p = mat(0x0A1A40, { rough: 0.2 });
  eye(body, -0.15, 0.64, 0.33, w, p); eye(body, 0.15, 0.64, 0.33, w, p);
  // round glasses and a pencil: she is the one taking notes in the room
  const rim = mat(PAL.amber, { rough: 0.3, metal: 0.4 });
  [-0.15, 0.15].forEach((x) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 24), rim); t.position.set(x, 0.64, 0.4); body.add(t); });
  const br = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6), rim); br.rotation.z = Math.PI / 2; br.position.set(0, 0.65, 0.41); body.add(br);
  // a pencil tucked on top
  const pen = cyl(body, 0.035, 0.035, 0.42, mat(PAL.amber), 6); pen.rotation.z = 1.1; pen.position.set(0.12, 0.98, 0);
  const tip = cyl(body, 0.035, 0.001, 0.09, mat(PAL.wood), 6); tip.rotation.z = 1.1 + Math.PI; tip.position.set(-0.105, 0.865, 0);
  const feet = [-0.17, 0.17].map((x) => { const f = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(PAL.white))); f.scale.set(1, 0.7, 1.3); f.position.set(x, 0.09, 0.04); g.add(f); return f; });
  g.userData = { body, feet };
  return g;
}
export function makeBuilder() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const b = shadow(new THREE.Mesh(rbox(0.8, 0.74, 0.7, 0.16), mat(PAL.dark3, { rough: 0.5 }))); b.position.y = 0.52; body.add(b);
  const face = new THREE.Mesh(rbox(0.6, 0.4, 0.06, 0.03), mat(0x0A0705, { rough: 0.25 })); face.position.set(0, 0.55, 0.34); body.add(face);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 0.2), toneMapped: false });
  [-0.14, 0.14].forEach((x) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.02), glow); e.position.set(x, 0.57, 0.375); body.add(e); });
  // a hard hat
  const hat = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.amber, { rough: 0.4, glow: 0.25 })));
  hat.scale.set(1.02, 0.62, 0.92); hat.position.y = 0.86; body.add(hat);
  const brim = shadow(new THREE.Mesh(rbox(0.94, 0.05, 0.9, 0.02), mat(PAL.amber, { rough: 0.4, glow: 0.25 }))); brim.position.set(0, 0.87, 0.06); body.add(brim);
  const feet = [-0.2, 0.2].map((x) => { const f = shadow(new THREE.Mesh(rbox(0.22, 0.16, 0.3, 0.05), mat(PAL.amber, { glow: 0.5 }))); f.position.set(x, 0.08, 0.03); g.add(f); return f; });
  g.userData = { body, feet };
  return g;
}
export function makeWhole() {
  // one body: her roundness, her hat, both pairs of eyes agreed on a look
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const b = shadow(new THREE.Mesh(rbox(0.84, 0.86, 0.76, 0.34), mat(PAL.white, { rough: 0.4 }))); b.position.y = 0.55; body.add(b);
  const w = mat(0x0C2A6B, { rough: 0.3 }), p = mat(PAL.white, { rough: 0.2 });
  eye(body, -0.16, 0.64, 0.33, w, p); eye(body, 0.16, 0.64, 0.33, w, p);
  const rim = mat(PAL.amber, { rough: 0.3, metal: 0.4, glow: 0.4 });
  [-0.16, 0.16].forEach((x) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.024, 8, 24), rim); t.position.set(x, 0.64, 0.4); body.add(t); });
  const hat = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.amber, { rough: 0.4, glow: 0.3 })));
  hat.scale.set(1.0, 0.6, 0.9); hat.position.y = 0.92; body.add(hat);
  const brim = shadow(new THREE.Mesh(rbox(0.96, 0.05, 0.92, 0.02), mat(PAL.amber, { rough: 0.4, glow: 0.3 }))); brim.position.set(0, 0.93, 0.06); body.add(brim);
  const pen = cyl(body, 0.035, 0.035, 0.42, mat(PAL.cobalt), 6); pen.rotation.z = 1.1; pen.position.set(0.16, 1.2, 0);
  const feet = [[-0.19, PAL.cobalt], [0.19, PAL.amber]].map(([x, c]) => { const f = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat(c))); f.scale.set(1, 0.7, 1.3); f.position.set(x, 0.09, 0.04); g.add(f); return f; });
  g.userData = { body, feet };
  return g;
}
export function poseCharacter(g, a, t, scale) {
  const u = g.userData, sq = a.squash || 0, s = scale || 1;
  g.position.set(a.x, a.y, a.z || 0);
  g.scale.set(s, s, s);
  const moving = a.onGround && Math.abs(a.vx) > 0.4;
  const ph = a.walk * 13;
  u.body.scale.set(1 + sq * 0.28, 1 - sq * 0.28, 1 + sq * 0.28);
  u.body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.07 : Math.sin(t * 2.4) * 0.015;
  u.body.rotation.z = -a.vx * 0.022;
  a.turn = (a.turn === undefined ? 0 : a.turn) + ((a.face || 1) * 0.62 - (a.turn || 0)) * 0.2;
  g.rotation.y = a.turn;
  u.feet[0].position.y = 0.09 + (moving ? Math.max(0, Math.sin(ph)) * 0.16 : 0) + (a.onGround ? 0 : 0.08);
  u.feet[1].position.y = 0.09 + (moving ? Math.max(0, -Math.sin(ph)) * 0.16 : 0) + (a.onGround ? 0 : 0.02);
  u.feet[0].position.z = 0.04 + (moving ? Math.cos(ph) * 0.12 : 0);
  u.feet[1].position.z = 0.04 - (moving ? Math.cos(ph) * 0.12 : 0);
}

// ---- scenery ------------------------------------------------------------
function yearSign(scene, side, x, year) {
  const L = side === 'L';
  const g = new THREE.Group();
  if (L) {
    const board = slab(g, -4.4, 4.4, 0, 5.2, -0.12, 0.12, mat(PAL.white, { rough: 0.9 }), 0.05);
    const t = textPlane(year, { w: 1024, h: 600, pw: 8.4, color: '#143C8C', font: `italic 400 SIZE ${SERIF}`, size: 430, dy: 20 });
    t.position.set(0, 2.6, 0.14); g.add(t);
    g.rotation.x = -0.12; g.position.set(x, 0, -8.5);
  } else {
    const t = textPlane(year, { w: 1024, h: 520, pw: 9, color: '#ffb000', font: `800 SIZE ${MONO}`, size: 300, glow: 1.6, dy: 10 });
    t.position.set(0, 3.2, 0); g.add(t);
    const frame = mat(PAL.dark3, { rough: 0.5 });
    slab(g, -4.8, 4.8, 0.7, 0.9, -0.2, 0.0, frame); slab(g, -4.8, 4.8, 5.5, 5.7, -0.2, 0.0, frame);
    slab(g, -4.4, -4.2, 0, 0.8, -0.2, 0.0, frame); slab(g, 4.2, 4.4, 0, 0.8, -0.2, 0.0, frame);
    g.position.set(x, 0, -8.5);
  }
  scene.add(g);
}

function dayProps(scene, x, ch, r, gy) {
  const k = r(), z = -3.6 - r() * 6.5;
  const g = new THREE.Group(); g.position.set(x, gy, z); scene.add(g);
  const cols = [PAL.cobalt, PAL.peri, PAL.white, PAL.ink, PAL.butter];
  if (k < (ch === 1 ? 0.75 : 0.34)) {
    // books standing on end, like a skyline
    const n = 1 + ((r() * 3) | 0); let ox = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 + r() * 0.9, h = (ch === 1 ? 5 : 3) + r() * (ch === 1 ? 6 : 4);
      const b = slab(g, ox, ox + w, 0, h, -1.5, 1.5, mat(cols[(r() * cols.length) | 0], { rough: 0.8 }), 0.06);
      slab(g, ox + 0.04, ox + w - 0.04, h * 0.72, h * 0.8, 1.46, 1.53, mat(PAL.white));
      if (i === n - 1 && r() < 0.5) { b.rotation.z = -0.16; b.position.x += h * 0.08; }
      ox += w + 0.04;
    }
  } else if (k < 0.56) {
    // a pencil, standing or lying
    const len = 5 + r() * 5, lying = r() < 0.4;
    const p = new THREE.Group(); g.add(p);
    const body = cyl(p, 0.28, 0.28, len, mat(r() < 0.6 ? PAL.amber : PAL.cobalt, { rough: 0.5 }), 6); body.position.y = len / 2 + 0.7;
    const wood = cyl(p, 0.28, 0.06, 0.7, mat(PAL.wood), 6); wood.position.y = 0.35; wood.rotation.x = Math.PI;
    const lead = cyl(p, 0.07, 0.0, 0.18, mat(PAL.ink), 6); lead.position.y = 0.05; lead.rotation.x = Math.PI;
    const cap = cyl(p, 0.29, 0.29, 0.4, mat(PAL.peri, { metal: 0.5, rough: 0.3 }), 12); cap.position.y = len + 0.9;
    if (lying) { p.rotation.z = Math.PI / 2 - 0.04; p.position.set(-len / 2, 0.3, 0); } else { p.rotation.z = (r() - 0.5) * 0.5; p.rotation.x = -0.1; }
  } else if (k < 0.7) {
    // a mug
    const m = cyl(g, 1.5, 1.35, 3, mat(ch === 2 ? PAL.cobalt : PAL.white, { rough: 0.35 }), 28); m.position.y = 1.5;
    const h = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.2, 10, 24), mat(ch === 2 ? PAL.cobalt : PAL.white, { rough: 0.35 }))); h.position.set(1.6, 1.6, 0); g.add(h);
    const c = cyl(g, 1.32, 1.32, 0.06, mat(0x3A2412, { rough: 0.2 }), 28); c.position.y = 2.9;
  } else if (k < 0.84) {
    // a magnifying glass, leaning
    const m = new THREE.Group(); g.add(m);
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 10, 36), mat(PAL.ink, { metal: 0.6, rough: 0.3 }))); ring.position.y = 3.4; m.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(1.26, 32), mat(0xBFD4FF, { alpha: 0.28, rough: 0.05 })); lens.position.y = 3.4; m.add(lens);
    const hd = cyl(m, 0.17, 0.2, 2.1, mat(PAL.amber, { rough: 0.5 }), 10); hd.position.y = 1.05;
    m.rotation.z = (r() - 0.5) * 0.7; m.rotation.y = (r() - 0.5) * 0.6;
  } else {
    // sticky notes
    const n = 2 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) { const s = slab(g, -0.9, 0.9, i * 0.07, i * 0.07 + 0.06, -0.9, 0.9, mat(i % 2 ? PAL.butter : PAL.white, { rough: 0.95 }), 0.01); s.rotation.y = (r() - 0.5) * 0.5; }
  }
}

function nightProps(scene, x, ch, r, gy) {
  const k = r(), z = -3.8 - r() * 6;
  const g = new THREE.Group(); g.position.set(x, gy, z); scene.add(g);
  if (k < (ch === 1 ? 0.3 : 0.42)) {
    // a monitor, the only daylight here
    const w = 4 + r() * 2.5, h = w * 0.6;
    slab(g, -w / 2, w / 2, 1.4, 1.4 + h, -0.15, 0.15, mat(PAL.dark2, { rough: 0.4 }), 0.08);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.3), new THREE.MeshBasicMaterial({ map: codeTexture((r() * 4) | 0), toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) }));
    scr.position.set(0, 1.4 + h / 2, 0.16); g.add(scr);
    const st = cyl(g, 0.16, 0.16, 1.4, mat(PAL.dark2), 10); st.position.y = 0.7;
    const ft = cyl(g, 0.9, 1.0, 0.1, mat(PAL.dark2), 20); ft.position.y = 0.05;
    g.rotation.y = (r() - 0.5) * 0.5;
  } else if (k < (ch === 1 ? 0.85 : 0.66)) {
    // a tower with status lights
    const w = 1.2 + r() * 1.2, h = (ch === 1 ? 6 : 3.5) + r() * (ch === 1 ? 6 : 4);
    slab(g, -w / 2, w / 2, 0, h, -1, 1, mat(PAL.dark2, { rough: 0.55 }), 0.06);
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.1), toneMapped: false });
    const dim = new THREE.MeshBasicMaterial({ color: 0x6b4500 });
    for (let y = 0.5; y < h - 0.3; y += 0.5) {
      const row = new THREE.Mesh(new THREE.BoxGeometry((w - 0.3) * (0.3 + r() * 0.7), 0.07, 0.02), r() < 0.3 ? led : dim);
      row.position.set(-(w - 0.3) * 0.1, y, 1.01); g.add(row);
    }
  } else if (k < 0.82) {
    // a chip
    const c = slab(g, -1.3, 1.3, 0.1, 0.5, -1.3, 1.3, mat(0x0d0a08, { rough: 0.35 }), 0.04);
    for (let i = -4; i <= 4; i++) { slab(g, i * 0.28 - 0.05, i * 0.28 + 0.05, 0, 0.14, 1.3, 1.6, mat(0xb9b9b9, { metal: 0.9, rough: 0.3 }), 0.01); }
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.1), toneMapped: false })); dot.rotation.x = -Math.PI / 2; dot.position.set(-0.9, 0.51, 0.9); g.add(dot);
    c.rotation.y = 0;
  } else {
    // a mug, with something warm in it
    const m = cyl(g, 1.5, 1.35, 3, mat(PAL.dark3, { rough: 0.35 }), 28); m.position.y = 1.5;
    const h = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.2, 10, 24), mat(PAL.dark3, { rough: 0.35 }))); h.position.set(-1.6, 1.6, 0); g.add(h);
    const band = cyl(g, 1.52, 1.5, 0.12, mat(PAL.amber, { glow: 1.6 }), 28); band.position.y = 2.2;
  }
}

function groundDay(scene, x0, x1, top) {
  if (top > 0.5) {
    // a cliff is a stack of books
    const cols = [PAL.cobalt, PAL.white, PAL.peri, PAL.ink, PAL.butter];
    const n = Math.round(top);
    for (let i = 0; i < n; i++) {
      const y0 = (top / n) * i, y1 = (top / n) * (i + 1), inset = (i * 37 % 5) * 0.12;
      slab(scene, x0 + (i === n - 1 ? 0 : inset * 0.3), x1 - inset * 0.3, y0 + 0.16, y1, -5.4 - inset, 3 - inset * 0.4, mat(PAL.white, { rough: 0.95 }), 0.05);
      slab(scene, x0, x1, y0, y0 + 0.16, -5.5, 3.1, mat(cols[i % cols.length], { rough: 0.8 }), 0.03);
    }
    slab(scene, x0, x1, top - 0.08, top, -5.5, 3.1, mat(cols[n % cols.length], { rough: 0.8 }), 0.03);
    return;
  }
  slab(scene, x0, x1, top - 0.55, top, -5.6, 3.1, mat(PAL.white, { rough: 0.95 }), 0.06);
  slab(scene, x0 - 0.12, x1 + 0.12, top - 1.5, top - 0.55, -5.75, 3.25, mat(PAL.cobalt, { rough: 0.8 }), 0.08);
  slab(scene, x0 + 0.1, x1 - 0.1, top - 1.42, top - 0.63, -5.6, 3.28, mat(PAL.paper, { rough: 1 }), 0.02);
  // ruled lines on the top sheet
  const line = mat(PAL.peri, { rough: 1 });
  for (let z = -4.6; z < 3; z += 1.1) { const l = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.5, 0.035), line); l.rotation.x = -Math.PI / 2; l.position.set((x0 + x1) / 2, top + 0.004, z); l.receiveShadow = true; scene.add(l); }
}
function groundNight(scene, x0, x1, top, r) {
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false });
  const dim = new THREE.MeshBasicMaterial({ color: 0x8a5a00 });
  if (top > 0.5) {
    const n = Math.round(top);
    for (let i = 0; i < n; i++) {
      const y0 = (top / n) * i, y1 = (top / n) * (i + 1);
      slab(scene, x0, x1, y0 + 0.05, y1, -5.5, 3.05, mat(i % 2 ? PAL.dark2 : PAL.dark, { rough: 0.5 }), 0.05);
      for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.45) { if (r() < 0.6) continue; const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.02), r() < 0.5 ? glow : dim); l.position.set(x, y0 + 0.55, 3.06); scene.add(l); }
    }
  } else {
    slab(scene, x0, x1, top - 1.5, top, -5.6, 3.1, mat(PAL.dark, { rough: 0.55 }), 0.06);
  }
  // circuit traces on top, and a lit front edge
  const edge = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.2, 0.05, 0.05), glow); edge.position.set((x0 + x1) / 2, top - 0.02, 3.09); scene.add(edge);
  [-4.2, -2.6, 1.9].forEach((z, i) => {
    let x = x0 + 0.4;
    while (x < x1 - 0.6) {
      const len = Math.min(1.5 + r() * 5, x1 - 0.4 - x);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07), i === 2 ? dim : (r() < 0.35 ? glow : dim)); t.rotation.x = -Math.PI / 2; t.position.set(x + len / 2, top + 0.006, z + (r() - 0.5) * 0.5); scene.add(t);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), dim); pad.rotation.x = -Math.PI / 2; pad.position.set(x + len, top + 0.007, t.position.z); scene.add(pad);
      x += len + 0.5 + r() * 2;
    }
  });
}

const LEGENDS = ['W', 'A', 'S', 'D', '{', '}', ';', '/', '=', '>', 'fn', '⏎'];
function block(scene, side, b, i) {
  const [x0, x1, y0, y1] = b;
  if (side === 'L') {
    const cols = [PAL.peri, PAL.white, PAL.butter, PAL.cobalt];
    const c = cols[i % cols.length];
    slab(scene, x0, x1, y0, y1, -1.5, 1.5, mat(c, { rough: 0.85 }), 0.1);
    // an eraser sleeve
    slab(scene, x0 + (x1 - x0) * 0.3, x1 - (x1 - x0) * 0.12, y0 - 0.0, y1 + 0.03, -1.54, 1.54, mat(c === PAL.cobalt ? PAL.white : PAL.cobalt, { rough: 0.7 }), 0.1);
  } else {
    slab(scene, x0, x1, y0, y1, -1.5, 1.5, mat(PAL.dark2, { rough: 0.5 }), 0.14);
    slab(scene, x0 + 0.16, x1 - 0.16, y1 - 0.02, y1 + 0.06, -1.3, 1.25, mat(PAL.dark3, { rough: 0.4 }), 0.06);
    const t = textPlane(LEGENDS[i % LEGENDS.length], { w: 128, h: 128, pw: Math.min(0.8, (y1 - y0) * 0.7), color: '#ffb000', font: `800 SIZE ${MONO}`, size: 84, glow: 1.5 });
    t.position.set((x0 + x1) / 2, (y0 + y1) / 2, 1.51); scene.add(t);
  }
}

// ---- interactive things ----------------------------------------------------
function makePlate(scene, side, p) {
  const L = side === 'L', g = new THREE.Group();
  g.position.set(p.x, p.y, 0.2); scene.add(g);
  const base = cyl(g, 0.95, 1.0, 0.1, mat(L ? PAL.ink : PAL.dark3, { rough: 0.5 }), 28); base.position.y = 0.05;
  const capMat = new THREE.MeshStandardMaterial({ color: p.sync ? (L ? PAL.cobalt : PAL.amber) : PAL.amber, roughness: 0.4, emissive: PAL.amber, emissiveIntensity: L ? 0.05 : 0.5 });
  const cap = cyl(g, 0.74, 0.78, 0.16, capMat, 28); cap.position.y = 0.16;
  let ring = null;
  if (p.sync) {
    ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(L ? 0.08 : 2.4, L ? 0.23 : 1.6, L ? 0.55 : 0.1), toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; g.add(ring);
  }
  return { spec: p, cap, capMat, ring, base: L ? 0.05 : 0.5 };
}
function halfDisc(g, L, y) {
  // the emblem on the paired doors: each world carries half a circle
  if (L) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32, Math.PI / 2, Math.PI), mat(PAL.white, { rough: 0.6 })); d.position.set(0, y, 2.33); g.add(d); }
  else { const d = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.95, 32, 1, -Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.1), toneMapped: false })); d.position.set(0, y, 2.33); g.add(d); }
}
function makeDoor(scene, side, d) {
  const L = side === 'L', g = new THREE.Group(), H = 6.4;
  g.position.set(d.x, 0, 0); scene.add(g);
  if (d.wall) {
    // a blocking error: hot stripes
    slab(g, -0.6, 0.6, 0, H, -2.3, 2.3, mat(0x2a0f05, { rough: 0.5 }), 0.08);
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.75, 0.15), toneMapped: false });
    for (let y = 0.5; y < H - 0.2; y += 0.8) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.22, 4.0), hot); s.position.set(0, y, 0); s.rotation.x = 0; g.add(s); }
    const t = textPlane('!', { w: 128, h: 128, pw: 1.6, color: '#ff7a3a', font: `800 SIZE ${MONO}`, size: 110, glow: 2.2 });
    t.position.set(0, 3.2, 2.34); g.add(t);
  } else if (L) {
    slab(g, -0.4, 0.4, 0, H, -2.3, 2.3, mat(d.sync ? PAL.cobalt : PAL.ink, { rough: 0.7 }), 0.08);
    [1.0, 5.2].forEach((y) => slab(g, -0.43, 0.43, y, y + 0.22, -2.33, 2.33, mat(PAL.white, { rough: 0.8 }), 0.02));
    if (d.sync) halfDisc(g, true, 3.2);
  } else {
    slab(g, -0.4, 0.4, 0, H, -2.3, 2.3, mat(PAL.dark2, { rough: 0.45 }), 0.08);
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false });
    for (let y = 0.6; y < H - 0.3; y += d.sync ? 2.3 : 0.7) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.07, 4.2), glow); s.position.set(0, y, 0.24); g.add(s); }
    if (d.sync) halfDisc(g, false, 3.2);
  }
  return { spec: d, group: g, H };
}
function makeLift(scene, side, l) {
  const L = side === 'L', g = new THREE.Group(), w = l.x1 - l.x0;
  g.position.set((l.x0 + l.x1) / 2, l.y0, 0); scene.add(g);
  slab(g, -w / 2, w / 2, -0.35, 0, -1.9, 1.9, mat(L ? PAL.white : PAL.dark2, { rough: 0.6 }), 0.08);
  slab(g, -w / 2 - 0.03, w / 2 + 0.03, -0.26, -0.12, -1.93, 1.93, L ? mat(PAL.cobalt) : mat(PAL.amber, { glow: 1.4 }), 0.03);
  const piston = cyl(scene, 0.32, 0.32, 1, mat(L ? PAL.peri : PAL.dark3, { metal: 0.6, rough: 0.35 }), 16);
  piston.position.set((l.x0 + l.x1) / 2, 0, 0);
  // chevrons on the front so it reads as "this goes up"
  const t = textPlane('⌃', { w: 128, h: 128, pw: 0.5, color: L ? '#143C8C' : '#ffb000', font: `800 SIZE ${MONO}`, size: 110, glow: L ? 0 : 1.6 });
  t.position.set(0, -0.2, 1.95); g.add(t);
  return { spec: l, group: g, piston };
}
function makeBridge(scene, side, b) {
  const L = side === 'L', g = new THREE.Group(); scene.add(g);
  const n = Math.max(1, Math.round((b.x1 - b.x0) / (b.step ? 2 : 0.8))), w = (b.x1 - b.x0) / n;
  const planks = [];
  for (let i = 0; i < n; i++) {
    let m;
    if (b.step) m = shadow(new THREE.Mesh(rbox(w, b.y, 3, 0.1), mat(L ? PAL.butter : PAL.dark2, { rough: 0.8 })));
    else if (L) { m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.6, 6), mat(i % 3 === 1 ? PAL.cobalt : PAL.amber, { rough: 0.55 }))); m.rotation.x = Math.PI / 2; m.scale.x = w / 0.42; }
    else m = shadow(new THREE.Mesh(rbox(w - 0.08, 0.3, 3.4, 0.07), mat(PAL.dark2, { rough: 0.45, glow: 0.0 })));
    m.position.set(b.x0 + w * (i + 0.5), b.step ? b.y / 2 : b.y - (L ? 0.2 : 0.15), 0);
    g.add(m); planks.push(m);
    if (!L && !b.step) { const e = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false })); e.position.set(0, 0.1, 1.71); m.add(e); }
  }
  let ghost = null;
  if (b.ghost) {
    // not built yet: a dashed outline of what will be there
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.x1 - b.x0, b.step ? b.y : 0.4, 3.2));
    ghost = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: L ? PAL.cobalt : PAL.amber, dashSize: 0.22, gapSize: 0.16 }));
    ghost.computeLineDistances();
    ghost.position.set((b.x0 + b.x1) / 2, b.step ? b.y / 2 : b.y - 0.2, 0);
    scene.add(ghost);
  }
  return { spec: b, planks, ghost };
}
function makeCarry(scene, side, c) {
  const L = side === 'L', g = new THREE.Group();
  g.position.set(c.from, c.y, 0); scene.add(g);
  if (L) {
    // a paper plane's cousin: a flying eraser
    slab(g, -c.w / 2, c.w / 2, -0.45, 0, -1.6, 1.6, mat(PAL.white, { rough: 0.85 }), 0.12);
    slab(g, -c.w / 2 + 0.5, c.w / 2 - 0.3, -0.48, 0.03, -1.64, 1.64, mat(PAL.amber, { rough: 0.6 }), 0.12);
  } else {
    slab(g, -c.w / 2, c.w / 2, -0.45, 0, -1.6, 1.6, mat(PAL.dark2, { rough: 0.45 }), 0.14);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(c.w - 0.5, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.1), toneMapped: false })); under.rotation.x = Math.PI / 2; under.position.y = -0.46; g.add(under);
    const e = new THREE.Mesh(new THREE.BoxGeometry(c.w - 0.3, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false })); e.position.set(0, -0.2, 1.61); g.add(e);
  }
  // two small rotors, because something has to hold it up
  const rotors = [-c.w / 2 + 0.4, c.w / 2 - 0.4].map((x) => { const r = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.12), mat(L ? PAL.ink : PAL.amber, { glow: L ? 0 : 1 })); r.position.set(x, -0.62, 0); g.add(r); const s = cyl(g, 0.04, 0.04, 0.2, mat(L ? PAL.ink : PAL.dark3), 6); s.position.set(x, -0.54, 0); return r; });
  return { spec: c, group: g, rotors };
}
function makeRail(scene, side, rail) {
  // where to walk to move the other player's platform
  const L = side === 'L';
  const m = L ? mat(PAL.amber, { rough: 0.6 }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false });
  for (let x = rail[0]; x < rail[1] - 0.2; x += 1) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.16), m); a.rotation.x = -Math.PI / 2; a.position.set(x + 0.5, 0.012, 1.9); scene.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), m); b.rotation.x = -Math.PI / 2; b.rotation.z = 0.8; b.position.set(x + 0.72, 0.012, 2.02); scene.add(b);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), m); c.rotation.x = -Math.PI / 2; c.rotation.z = -0.8; c.position.set(x + 0.72, 0.012, 1.78); scene.add(c);
  }
}
function makeBug(scene, side, b) {
  const L = side === 'L', g = new THREE.Group(); scene.add(g);
  const bodyMat = L ? mat(PAL.ink, { rough: 0.35 }) : new THREE.MeshStandardMaterial({ color: PAL.hot, roughness: 0.4, emissive: PAL.hot, emissiveIntensity: 1.1 });
  const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), bodyMat)); body.scale.set(1.15, 0.8, 1); body.position.y = 0.4; g.add(body);
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), bodyMat)); head.position.set(0.5, 0.36, 0); g.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: L ? new THREE.Color(2.4, 1.6, 0.1) : new THREE.Color(3, 3, 2.4), toneMapped: false });
  [-0.11, 0.11].forEach((z) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeM); e.position.set(0.68, 0.44, z); g.add(e); });
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 20), mat(L ? PAL.amber : 0x2a0f05)); stripe.rotation.y = Math.PI / 2; stripe.position.set(-0.05, 0.42, 0); stripe.scale.set(1, 0.86, 1); g.add(stripe);
  const legs = [];
  [-0.28, 0, 0.28].forEach((x) => [-1, 1].forEach((sz) => { const l = cyl(g, 0.03, 0.03, 0.42, mat(L ? PAL.ink : 0x7a2a08), 5); l.position.set(x, 0.16, sz * 0.38); l.rotation.x = sz * 0.7; legs.push(l); }));
  return { spec: b, group: g, legs };
}
function makePickup(scene, side, p) {
  const L = side === 'L', g = new THREE.Group();
  g.position.set(p.x, p.y, 0); scene.add(g);
  if (p.kind === 'comment') {
    // feedback from the customer: a speech bubble
    const m = mat(PAL.amber, { rough: 0.5, glow: 0.25 });
    const b = shadow(new THREE.Mesh(rbox(1.1, 0.74, 0.3, 0.14), m)); g.add(b);
    const tail = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), m)); tail.position.set(-0.25, -0.48, 0); tail.rotation.z = Math.PI; g.add(tail);
    [0.14, -0.02, -0.18].forEach((y, i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(i === 2 ? 0.45 : 0.76, 0.07, 0.02), mat(PAL.ink)); l.position.set(i === 2 ? -0.15 : 0, y, 0.16); g.add(l); });
  } else if (p.kind === 'commit') {
    // a shipped fix: a commit, a node on a line
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 0.6), toneMapped: false });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), hot));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.08), toneMapped: false })); g.add(ring);
    const ln = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.06), new THREE.MeshBasicMaterial({ color: 0x8a5a00 })); g.add(ln);
  } else if (L) {
    // a sign-off: a tick in a ring
    g.add(shadow(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 26), mat(PAL.cobalt, { rough: 0.4 }))));
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.07), mat(PAL.amber)); a.position.set(-0.09, -0.04, 0); a.rotation.z = 0.8; g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), mat(PAL.amber)); b.position.set(0.06, 0.02, 0); b.rotation.z = -0.6; g.add(b);
  } else {
    // a token: a small bright crystal
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.27), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.1), toneMapped: false })));
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.4)), new THREE.LineBasicMaterial({ color: PAL.amber })); g.add(w);
  }
  return { spec: p, group: g };
}
function makeSign(scene, side, sg, gy) {
  const L = side === 'L', g = new THREE.Group(); g.position.set(sg.x, gy, -2.6); scene.add(g);
  const post = cyl(g, 0.09, 0.09, 2.2, mat(L ? PAL.ink : PAL.dark3), 8); post.position.y = 1.1;
  slab(g, -1.9, 1.9, 2.0, 4.2, -0.08, 0.08, mat(L ? PAL.white : PAL.dark, { rough: 0.8 }), 0.05);
  const t = L
    ? textPlane(sg.text, { w: 512, h: 300, pw: 3.6, color: '#143C8C', fonts: [`italic 400 SIZE ${SERIF}`, `700 SIZE ${SERIF}`, `italic 400 SIZE ${SERIF}`], sizes: [52, 96, 52] })
    : textPlane(sg.text, { w: 512, h: 300, pw: 3.6, color: '#ffb000', fonts: [`400 SIZE ${MONO}`, `800 SIZE ${MONO}`, `400 SIZE ${MONO}`], sizes: [34, 74, 34], glow: 1.5 });
  t.position.set(0, 3.1, 0.1); g.add(t);
}
function makePad(scene, side) {
  const L = side === 'L', g = new THREE.Group(); g.position.set(END_X, 0, 0.2); scene.add(g);
  const base = cyl(g, 1.15, 1.2, 0.1, mat(L ? PAL.ink : PAL.dark3), 36); base.position.y = 0.05;
  const topMat = new THREE.MeshStandardMaterial({ color: L ? PAL.white : PAL.amber, roughness: 0.4, emissive: PAL.amber, emissiveIntensity: L ? 0 : 0.6 });
  const top = cyl(g, 0.95, 0.98, 0.14, topMat, 36); top.position.y = 0.14;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(L ? 0.08 : 2.4, L ? 0.23 : 1.6, L ? 0.55 : 0.1), toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; g.add(ring);
  return { topMat, ring };
}

// ---- a world ----------------------------------------------------------------
export function buildWorld(side) {
  const L = side === 'L', lvl = LEVEL[side];
  const scene = new THREE.Scene();
  const bg = L ? PAL.sky : PAL.crt;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 20, 60);

  // light
  const hemi = L ? new THREE.HemisphereLight(0xffffff, 0xB8C8E6, 1.25) : new THREE.HemisphereLight(0x5066A0, 0x24160A, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(L ? 0xFFE7C2 : 0xA9BCFF, L ? 3.1 : 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -14; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = L ? 5 : 3;
  scene.add(sun, sun.target);
  const sunOffset = L ? new THREE.Vector3(-9, 16, 11) : new THREE.Vector3(8, 15, 10);
  let lamp = null;
  if (!L) { lamp = new THREE.PointLight(0xFFB44A, 30, 13, 1.8); scene.add(lamp); }

  // the desk far below, visible through the pits
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(700, 80), mat(L ? PAL.desk : 0x0c0805, { rough: 0.9 }));
  desk.rotation.x = -Math.PI / 2; desk.position.set(110, -7, -12); desk.receiveShadow = true; scene.add(desk);

  const r = rng(L ? 11 : 23);
  lvl.ground.forEach((gseg) => (L ? groundDay(scene, gseg[0], gseg[1], gseg[2]) : groundNight(scene, gseg[0], gseg[1], gseg[2], r)));
  lvl.blocks.forEach((b, i) => block(scene, side, b, i));

  // scenery behind the path
  const topAt = (x) => { let t = 0; lvl.ground.forEach((gs) => { if (x >= gs[0] && x <= gs[1]) t = gs[2]; }); return t; };
  for (let x = -9; x < 236; x += 2.6 + r() * 3.4) {
    if (!overGround(side, x)) continue;
    if (CHAPTERS.some((c, i) => Math.abs(x - (i === 0 ? 21 : c.start + 9)) < 6.5)) continue;
    (L ? dayProps : nightProps)(scene, x, chapterAt(x), r, topAt(x));
  }
  CHAPTERS.forEach((c, i) => yearSign(scene, side, i === 0 ? 21 : c.start + 9, c.year));
  lvl.signs.forEach((sg) => makeSign(scene, side, sg, topAt(sg.x)));
  lvl.rails.forEach((rl) => makeRail(scene, side, rl));

  // weather: dust in the lamplight, and snow in New Haven
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = r() * 40 - 20; pos[i * 3 + 1] = r() * 14; pos[i * 3 + 2] = r() * 14 - 9; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: L ? 0x6F8FD8 : 0xFFC860, size: L ? 0.09 : 0.07, transparent: true, opacity: L ? 0 : 0.7, depthWrite: false }));
  motes.frustumCulled = false; scene.add(motes);

  const h = {
    side, scene, sun, sunOffset, lamp, motes, hemi,
    plates: lvl.plates.map((p) => makePlate(scene, side, p)),
    doors: lvl.doors.map((d) => makeDoor(scene, side, d)),
    lifts: lvl.lifts.map((l) => makeLift(scene, side, l)),
    bridges: lvl.bridges.map((b) => makeBridge(scene, side, b)),
    carry: lvl.carry.map((c) => makeCarry(scene, side, c)),
    bugs: lvl.bugs.map((b) => makeBug(scene, side, b)),
    pickups: lvl.pickups.map((p) => makePickup(scene, side, p)),
    pad: makePad(scene, side),
    hero: L ? makeForward() : makeBuilder(),
    intern: L ? makeForward() : makeBuilder()
  };
  scene.add(h.hero, h.intern);
  h.intern.visible = false;
  return h;
}

// ---- the merged world: the same desk at dawn ------------------------------------
export function buildMerged() {
  const scene = new THREE.Scene();
  const bg = 0x123A8F;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 20, 62);
  scene.add(new THREE.HemisphereLight(0x8FB0FF, 0x3A2A10, 1.0));
  const sun = new THREE.DirectionalLight(0xFFC56E, 3.4);
  sun.position.set(13, 9, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 18; sc.bottom = -8; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 5;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x6F9BFF, 0.9); fill.position.set(-10, 6, 8); scene.add(fill);

  const desk = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), mat(0x0A2466, { rough: 0.9 }));
  desk.rotation.x = -Math.PI / 2; desk.position.set(0, -7, -12); desk.receiveShadow = true; scene.add(desk);

  // one ground: paper on top, circuit running through it
  slab(scene, -60, 60, -0.55, 0, -5.6, 3.1, mat(PAL.white, { rough: 0.95 }), 0.06);
  slab(scene, -60.1, 60.1, -1.5, -0.55, -5.75, 3.25, mat(PAL.cobalt, { rough: 0.8 }), 0.08);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.1), toneMapped: false });
  const r = rng(77);
  [-4.2, -2.4, 1.9].forEach((z) => { let x = -40; while (x < 40) { const len = 1.5 + r() * 6; const t = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.07), glow); t.rotation.x = -Math.PI / 2; t.position.set(x + len / 2, 0.006, z + (r() - 0.5) * 0.4); scene.add(t); const p = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), glow); p.rotation.x = -Math.PI / 2; p.position.set(x + len, 0.007, t.position.z); scene.add(p); x += len + 1 + r() * 3; } });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(120, 0.05, 0.05), glow); edge.position.set(0, -0.02, 3.09); scene.add(edge);

  // both sets of things, sharing the desk; the middle stays clear for the words
  for (let x = -34; x < 34; x += 2.4 + r() * 2.6) {
    if (Math.abs(x) < 8) continue;
    if (r() < 0.5) dayProps(scene, x, r() < 0.4 ? 1 : 0, r, 0); else nightProps(scene, x, r() < 0.4 ? 1 : 0, r, 0);
  }
  // the whole circle, rising
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 1.9), toneMapped: false, fog: false }));
  disc.position.set(0, 12.2, -22); scene.add(disc);
  const halo = new THREE.Mesh(new THREE.RingGeometry(2.8, 2.9, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.1), toneMapped: false, fog: false }));
  halo.position.set(0, 12.2, -21.9); scene.add(halo);

  const N = 200, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = r() * 50 - 25; pos[i * 3 + 1] = r() * 13; pos[i * 3 + 2] = r() * 14 - 9; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xFFC860, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(motes);

  const hero = makeWhole(), a = makeForward(), b = makeBuilder();
  scene.add(hero, a, b); hero.visible = false;
  return { scene, sun, hero, a, b, motes, disc, halo };
}

export { THREE };
