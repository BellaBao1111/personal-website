/* ------------------------------------------------------------------
   game.js — the engine.

   Two players, two worlds, two sets of keys. Each world holds the
   switches for the other one: plates open the other's doors, raise the
   other's lifts and hold the other's bridges; one player walking carries
   the other across a gap. At the end both stand on their marks and the
   worlds merge.

   Each world is rendered to its own texture. A small shader then cuts
   them along the seam, adds glow, and at the end opens the merged world
   outward from that line.
   ------------------------------------------------------------------ */
import { THREE, PAL, buildWorld, buildMerged, poseCharacter } from './world.js';

const B = window.BELLA, A = window.BellaAudio;
const { END_X, CHAPTERS, BEATS, LINES, LEVEL, WHOLE, CONFIG } = B;
const $ = (q, el) => (el || document).querySelector(q);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;
const ui = { L: $('#ui-l'), R: $('#ui-r') };
const SIDES = ['L', 'R'];
const other = (sd) => (sd === 'L' ? 'R' : 'L');

const HW = 0.36, HT = 0.9, SPEED = 5.2, JUMP = 10.9, GRAV = 26, DOOR_H = 6.4;

// ---- renderer and the three worlds ----------------------------------
const cv = $('#stage'), fx = $('#fx'), fxc = fx.getContext('2d');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { body.classList.add('no-webgl'); throw e; }
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the seam shader does the final encode itself
const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');

// The screen is always cut top and bottom: the surface world above, the code
// world beneath it. `portrait` is kept as the name for that stacked layout.
let W = 0, H = 0, DPR = 1, portrait = true, narrow = false;
const geo = { cx: 0, cy: 0, dx: 0, dy: 1, nx: 1, ny: 0, tilt: 0, gap: 10 };
const world = {}, cam = {}, rt = {};
let merged, camM, game;

function makeRT() {
  const t = new THREE.WebGLRenderTarget(4, 4, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4, depthBuffer: true });
  t.texture.generateMipmaps = true;
  t.texture.minFilter = THREE.LinearMipmapLinearFilter;
  t.texture.magFilter = THREE.LinearFilter;
  return t;
}

// the seam shader
const post = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    tL: { value: null }, tR: { value: null }, tM: { value: null },
    uRes: { value: new THREE.Vector2() }, uC: { value: new THREE.Vector2() }, uN: { value: new THREE.Vector2(1, 0) },
    uGap: { value: 10 }, uTime: { value: 0 }, uBand: { value: -1 }, uWhole: { value: 0 }, uFlash: { value: 0 },
    uCharge: { value: 0 }, uProg: { value: 0 }, uDisc: { value: new THREE.Vector3() }, uPx: { value: 1 }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    precision highp float;
    uniform sampler2D tL, tR, tM;
    uniform vec2 uRes, uC, uN;
    uniform float uGap, uTime, uBand, uWhole, uFlash, uCharge, uProg, uPx;
    uniform vec3 uDisc;
    varying vec2 vUv;
    // base image plus a soft halo taken from the blurred mip levels
    vec3 lit(sampler2D t, float halo) {
      vec3 c = texture2D(t, vUv).rgb;
      vec3 b = textureLod(t, vUv, 3.5).rgb * .45 + textureLod(t, vUv, 5.2).rgb * .35 + textureLod(t, vUv, 6.6).rgb * .2;
      return c + b * halo;
    }
    // roll off highlights by brightness, not per channel, so amber stays amber
    vec3 shoulder(vec3 c) { float m = max(c.r, max(c.g, c.b)); if (m < .72) return c; float k = (.72 + .28 * (1. - exp(-(m - .72) / .28))) / m; return mix(c * k, vec3(1.), smoothstep(2.6, 7., m) * .6); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 px = vUv * uRes;
      float sd = dot(px - uC, uN);
      float a = abs(sd);
      float along = dot(px - uC, vec2(-uN.y, uN.x));
      vec3 col;
      if (uWhole > .5) {
        col = lit(tM, .34);
      } else {
        col = sd < 0. ? lit(tL, .07) : lit(tR, .42);
        // half a circle each, sitting on the seam
        float dd = length(px - uDisc.xy);
        float r = uDisc.z * (1. + uCharge * .12);
        if (sd < 0.) {
          col = mix(col, vec3(.02, .09, .32), smoothstep(r + uPx, r - uPx, dd));
          col = mix(col, vec3(.02, .09, .32), .5 * smoothstep(1.5 * uPx, 0., abs(dd - r * 1.24)));
        } else {
          float ring = smoothstep(2.2 * uPx, .6 * uPx, abs(dd - r));
          col += vec3(2.2, 1.45, .1) * ring + vec3(1., .66, .05) * .35 * exp(-abs(dd - r) / (9. * uPx));
        }
        // the seam: a crack with something bright behind it
        float gap = uGap * .5;
        float core = smoothstep(gap + uPx, gap - uPx, a);
        float pulse = pow(.5 + .5 * sin(along * .018 / uPx - uTime * 2.6), 10.);
        float lit01 = step(along / length(uRes) + .5, uProg);          // the part of the story already walked
        vec3 inner = mix(vec3(.02, .09, .32), vec3(1.6, 1.25, .7), clamp(lit01 * .55 + pulse * .5 + uCharge, 0., 1.));
        col = mix(col, inner, core);
        col += vec3(1., .7, .2) * exp(-a / ((5. + 40. * uCharge) * uPx)) * (.12 + .5 * uCharge + .25 * pulse * lit01) * (1. - core);
        col += vec3(1.) * uFlash * exp(-a / (120. * uPx));
        // the merged world opens outward from the seam
        if (uBand >= 0.) {
          float inb = smoothstep(uBand + uPx, uBand - uPx, a);
          col = mix(col, lit(tM, .34), inb);
          col += vec3(1.8, 1.35, .7) * exp(-abs(a - uBand) / (7. * uPx)) + vec3(1., .7, .2) * .4 * exp(-abs(a - uBand) / (40. * uPx));
        }
      }
      // lens: vignette, a soft shoulder instead of clipping, a little grain
      vec2 q = vUv - .5;
      col *= 1. - dot(q, q) * .42;
      col = shoulder(col);
      col = pow(max(col, 0.), vec3(1. / 2.2));
      col += (hash(px + fract(uTime) * 91.) - .5) * .03;
      gl_FragColor = vec4(col, 1.);
    }`
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false; postScene.add(quad);

// ---- state --------------------------------------------------------------
function mkAv(x) {
  return { x, y: 0, vx: 0, vy: 0, face: 1, onGround: true, squash: 0, walk: 0, coyote: 0, buffer: 0, knock: 0, kvx: 0, ref: null, safeX: x, safeY: 0, hist: [] };
}
function reset() {
  game = {
    state: 'title', t: 0, playT: 0,
    av: { L: mkAv(2), R: mkAv(2) }, camX: { L: 2, R: 2 }, camY: { L: 0, R: 0 }, off: 0.25,
    door: {}, lift: {}, bridge: {}, carry: {}, plate: {}, active: {},
    counts: { L: 0, R: 0 }, totals: { L: 0, R: 0 }, bugs: 0, bugTotal: 0,
    chapter: { L: -1, R: -1 }, beats: { L: new Set(), R: new Set() },
    sparks: [], hold: 0, mergeT: 0, flash: 0, shake: 0, intern: 0, skipped: false, said: {}
  };
  SIDES.forEach((sd) => {
    const lvl = LEVEL[sd];
    lvl.doors.forEach((d) => { game.door[d.id] = game.door[d.id] || { t: 0, open: false }; });
    lvl.lifts.forEach((l) => { game.lift[l.id] = { y: l.y0, dy: 0, dx: 0 }; });
    lvl.bridges.forEach((b) => { game.bridge[b.id] = { t: 0, on: false, dx: 0, dy: 0 }; });
    lvl.carry.forEach((c) => { game.carry[c.id] = { x: c.from, dx: 0, dy: 0 }; });
    lvl.plates.forEach((p) => { game.plate[p.id] = { down: false, k: 0 }; });
    lvl.pickups.forEach((p) => { p.got = false; if (!p.key) game.totals[sd]++; });
    lvl.bugs.forEach((b) => { b.alive = true; b.x = (b.x0 + b.x1) / 2; b.dir = 1; b.dead = 0; game.bugTotal++; });
    if (world[sd]) {
      world[sd].pickups.forEach((p) => { p.group.visible = true; p.group.scale.setScalar(1); });
      world[sd].bugs.forEach((b) => { b.group.visible = true; b.group.scale.set(1, 1, 1); });
      world[sd].intern.visible = false;
    }
  });
  if (merged) { merged.hero.visible = false; merged.a.visible = merged.b.visible = true; }
}

// ---- layout ---------------------------------------------------------------
const FOV = 30, TAN = Math.tan((FOV / 2) * Math.PI / 180);
const view = { vfull: 12, d: 22, paneV: 12 };
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, W * H > 1.6e6 ? 1.25 : 1.75);
  narrow = W < 700 || W < H * 0.8;
  body.classList.add('portrait'); body.classList.remove('landscape');
  body.classList.toggle('narrow', narrow);
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  const w = Math.round(W * DPR), h = Math.round(H * DPR);
  ['L', 'R', 'M'].forEach((k) => rt[k].setSize(w, h));
  fx.width = w; fx.height = h;
  post.uniforms.uRes.value.set(w, h); post.uniforms.uPx.value = DPR;
  // how much world fits: about 11 m tall and at least 14 m wide in each half
  view.vfull = Math.max(15.5, 10 * H / W);
  view.paneV = portrait ? view.vfull / 2 : view.vfull;
  view.d = view.vfull / (2 * TAN);
  SIDES.forEach((sd) => { cam[sd].aspect = W / H; cam[sd].far = view.d + 80; world[sd].scene.fog.near = view.d + 4; world[sd].scene.fog.far = view.d + 30; });
  camM.aspect = W / H; camM.far = view.d + 90; camM.updateProjectionMatrix();
  merged.scene.fog.near = view.d + 6; merged.scene.fog.far = view.d + 44;
  geo.cx = W / 2; geo.cy = H / 2;
  fitTitle();
}
function fitTitle() {
  const target = narrow ? W * 0.52 : Math.min(W * 0.34, H * 0.46);
  SIDES.forEach((sd) => {
    const el = $('.t-name', ui[sd]); if (!el) return;
    el.style.fontSize = '100px';
    const w = el.getBoundingClientRect().width || 1;
    el.style.fontSize = (100 * target / w).toFixed(1) + 'px';
  });
}
function updateGeo(dt) {
  let target = 0;
  if (!reduce) {
    if (game.state === 'title') target = 0.1 + Math.sin(game.t * 0.4) * 0.012;
    else if (game.state === 'play') target = Math.sin(game.t * 0.23) * 0.035 * (1 - game.hold);
  }
  if (portrait) target = game.state === 'title' ? 0 : target * 0.6;
  geo.tilt += (target - geo.tilt) * Math.min(1, dt * 2.5);
  const a = geo.tilt;
  if (!portrait) { geo.dx = Math.sin(a); geo.dy = Math.cos(a); geo.nx = Math.cos(a); geo.ny = -Math.sin(a); }
  else { geo.dx = Math.cos(a); geo.dy = Math.sin(a); geo.nx = -Math.sin(a); geo.ny = Math.cos(a); }
  const gapT = game.state === 'title' ? 14 : 10 - 7 * game.hold;
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
const lastClip = { L: '', R: '' };
function setUiClip(sd) {
  const str = 'polygon(' + halfPoly(sd).map((p) => p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px').join(',') + ')';
  if (str !== lastClip[sd]) { lastClip[sd] = str; ui[sd].style.clipPath = str; ui[sd].style.webkitClipPath = str; }
}

// ---- words ----------------------------------------------------------------
const capEl = { L: $('[data-cap]', ui.L), R: $('[data-cap]', ui.R) };
let typer = null;
function say(sd, text) {
  const el = capEl[sd];
  if (!text || el.dataset.text === text) return;
  el.dataset.text = text;
  if (sd === 'L' || reduce) { el.textContent = text; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
  else {
    clearInterval(typer);
    let i = 0; el.textContent = ''; el.classList.add('in');
    typer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typer); }, 26);
  }
  $('#live').textContent = text;
}
function line(key) { const l = LINES[key]; if (!l) return; if (l.l) say('L', l.l); if (l.r) say('R', l.r); }
function showChapter(sd, i) {
  const ch = CHAPTERS[i], el = $('[data-chap]', ui[sd]), d = sd === 'L' ? ch.l : ch.r;
  $('.c-no', el).textContent = d.no; $('.c-title', el).textContent = d.title;
  $('.c-place', el).textContent = d.place; $('.c-zh', el).textContent = d.zh;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  if (i > 0 && sd === 'L') A.sfx('chapter');
}
function hud() {
  $('[data-count]', ui.L).textContent = game.counts.L + ' of ' + game.totals.L + ' sign-offs';
  $('[data-count]', ui.R).textContent = game.counts.R + '/' + game.totals.R + ' commits';
  $('[data-bugs]', ui.L).textContent = game.bugs ? game.bugs + ' of ' + game.bugTotal + ' bugs' : '';
  $('[data-bugs]', ui.R).textContent = game.bugs ? game.bugs + '/' + game.bugTotal + ' bugs' : '';
}

// ---- input ------------------------------------------------------------------
const input = { L: { left: false, right: false, jump: false, edge: false }, R: { left: false, right: false, jump: false, edge: false } };
const KEYS = {
  KeyA: ['L', 'left'], KeyD: ['L', 'right'], KeyW: ['L', 'jump'],
  ArrowLeft: ['R', 'left'], ArrowRight: ['R', 'right'], ArrowUp: ['R', 'jump']
};
function press(sd, what, down) {
  const i = input[sd];
  if (what === 'jump') { if (down && !i.jump) i.edge = true; i.jump = down; } else i[what] = down;
}
function onKey(e, down) {
  if (game.state === 'whole') return;
  const k = e.code;
  if (game.state === 'title') {
    if (down && (k === 'Space' || k === 'Enter')) { e.preventDefault(); start(); }
    return;
  }
  if (down) A.init();
  if (KEYS[k]) press(KEYS[k][0], KEYS[k][1], down);
  else if (k === 'Space') { press('L', 'jump', down); press('R', 'jump', down); }
  else if (k === 'KeyM' && down) toggleSound();
  else return;
  e.preventDefault();
}
window.addEventListener('keydown', (e) => onKey(e, true));
window.addEventListener('keyup', (e) => onKey(e, false));
window.addEventListener('blur', () => SIDES.forEach((sd) => { input[sd].left = input[sd].right = input[sd].jump = false; }));
document.querySelectorAll('#pads button').forEach((el) => {
  const sd = el.dataset.p, what = el.dataset.k;
  const down = (e) => { e.preventDefault(); body.classList.add('touch'); A.init(); press(sd, what, true); };
  const up = (e) => { e.preventDefault(); press(sd, what, false); };
  el.addEventListener('pointerdown', down);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, up));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
});
window.addEventListener('touchstart', () => body.classList.add('touch'), { passive: true, once: true });
$('#start').addEventListener('click', start);
$('#skip').addEventListener('click', () => { A.init(); if (game.state !== 'merging' && game.state !== 'whole') startMerge(true); });
$('#sound').addEventListener('click', toggleSound);
['#sound', '#skip'].forEach((q) => $(q).addEventListener('click', (e) => e.currentTarget.blur()));
function toggleSound() { A.init(); const on = A.toggle(); $('#sound').textContent = on ? 'Sound on' : 'Sound off'; $('#sound').setAttribute('aria-pressed', String(on)); }
function start() {
  if (game.state !== 'title') return;
  A.init();
  game.state = 'play';
  body.classList.remove('is-title'); body.classList.add('is-play');
  hud();
}

// ---- the level as boxes -----------------------------------------------------
const statics = { L: [], R: [] };
function buildStatics() {
  SIDES.forEach((sd) => {
    const out = [];
    LEVEL[sd].ground.forEach((g) => out.push({ x0: g[0], x1: g[1], y0: -40, y1: g[2] }));
    LEVEL[sd].blocks.forEach((b) => out.push({ x0: b[0], x1: b[1], y0: b[2], y1: b[3] }));
    out.push({ x0: -14, x1: -11, y0: -40, y1: 40 }, { x0: END_X + 7, x1: END_X + 10, y0: -40, y1: 40 });
    statics[sd] = out;
  });
}
function solidsFor(sd) {
  const lvl = LEVEL[sd], out = statics[sd].slice();
  lvl.doors.forEach((d) => { const top = DOOR_H * (1 - ease(clamp(game.door[d.id].t, 0, 1))); if (top > 0.25) out.push({ x0: d.x - (d.wall ? 0.6 : 0.4), x1: d.x + (d.wall ? 0.6 : 0.4), y0: -1, y1: top }); });
  lvl.lifts.forEach((l) => { const s = game.lift[l.id]; out.push({ x0: l.x0, x1: l.x1, y0: s.y - 0.35, y1: s.y, ref: s }); });
  lvl.bridges.forEach((b) => {
    const s = game.bridge[b.id];
    if (b.ghost) { if (s.t > 0.5) out.push({ x0: b.x0, x1: b.x1, y0: b.step ? 0 : b.y - 0.4, y1: b.y, ref: b.step ? null : s }); }
    else if (s.t > 0.04) out.push({ x0: b.x0, x1: b.x0 + (b.x1 - b.x0) * s.t, y0: b.y - 0.4, y1: b.y, ref: s });
  });
  lvl.carry.forEach((c) => { const s = game.carry[c.id]; out.push({ x0: s.x - c.w / 2, x1: s.x + c.w / 2, y0: c.y - 0.45, y1: c.y, ref: s }); });
  return out;
}
const hit = (a, s) => a.x + HW > s.x0 && a.x - HW < s.x1 && a.y < s.y1 && a.y + HT > s.y0;
function supported(sd, x, y) {
  return solidsFor(sd).some((s) => x > s.x0 && x < s.x1 && s.y1 <= y + 0.05 && s.y1 > y - 2.6);
}

function stepAvatar(sd, dt, solids) {
  const a = game.av[sd], inp = input[sd];
  // ride whatever you are standing on
  if (a.onGround && a.ref) { a.x += a.ref.dx || 0; a.y += a.ref.dy || 0; }
  let want = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * SPEED;
  if (a.knock > 0) { a.knock -= dt; want = a.kvx; }
  a.vx = approach(a.vx, want, (a.onGround ? 55 : 32) * dt);
  if (Math.abs(want) > 0.1 && a.knock <= 0) a.face = want > 0 ? 1 : -1;
  if (Math.abs(a.vx) > 0.4) a.walk += dt;
  a.coyote = a.onGround ? 0.1 : a.coyote - dt;
  a.buffer -= dt;
  if (inp.edge) a.buffer = 0.13;
  inp.edge = false;
  if (a.buffer > 0 && a.coyote > 0) { a.vy = JUMP; a.coyote = 0; a.buffer = 0; a.onGround = false; a.squash = -0.55; A.sfx('jump', sd); }
  if (!inp.jump && a.vy > 4 && a.knock <= 0 && !a.bounced) a.vy = 4;   // let go early for a short hop
  a.vy = Math.max(a.vy - GRAV * dt, -24);

  a.x += a.vx * dt;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!hit(a, s)) continue;
    if (s.y1 - a.y < 0.22 && a.vy <= 0) { a.y = s.y1; continue; }      // small lips are stepped over
    if (a.x < (s.x0 + s.x1) / 2) a.x = s.x0 - HW; else a.x = s.x1 + HW;
    a.vx = 0;
  }
  const was = a.onGround, vy0 = a.vy;
  a.y += a.vy * dt; a.onGround = false; let ref = null;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!hit(a, s)) continue;
    if (a.vy <= 0 || a.y + HT * 0.5 > s.y1) { a.y = s.y1; a.vy = 0; a.onGround = true; a.bounced = false; ref = s.ref || null; }
    else { a.y = s.y0 - HT; a.vy = 0; }
  }
  a.ref = a.onGround ? ref : null;
  if (a.onGround && !was && vy0 < -5) { a.squash = 0.6; A.sfx('land', sd); }
  a.squash += (0 - a.squash) * Math.min(1, dt * 12);
  if (a.onGround && !a.ref && supported(sd, a.x - a.face * 0.7, a.y) && supported(sd, a.x + a.face * 0.7, a.y)) { a.safeX = a.x; a.safeY = a.y; }
  if (a.y < -7) { a.x = a.safeX; a.y = a.safeY + 0.2; a.vx = a.vy = 0; A.sfx('fall', sd); }
  a.hist.push({ t: game.t, x: a.x, y: a.y, face: a.face, vx: a.vx, onGround: a.onGround, walk: a.walk });
  if (a.hist.length > 80) a.hist.shift();
}

function spark(from, to, done) { game.sparks.push({ from, to, t: 0, dur: reduce ? 0.01 : 0.6, done, trail: [] }); }

// ---- one step of play ---------------------------------------------------------
function play(dt) {
  game.playT += dt;
  // 1. switches
  game.active = {};
  const syncDown = {};
  SIDES.forEach((sd) => {
    const a = game.av[sd];
    LEVEL[sd].plates.forEach((p) => {
      const st = game.plate[p.id];
      const down = a.onGround && Math.abs(a.x - p.x) < 0.9 && Math.abs(a.y - p.y) < 0.3;
      if (down && !st.down) A.sfx('stamp', sd);
      st.down = down;
      if (p.drives && down) game.active[p.drives] = true;
      if (p.sync) syncDown[p.sync] = (syncDown[p.sync] || 0) + (down ? 1 : 0);
    });
  });
  Object.keys(syncDown).forEach((id) => {
    const d = game.door[id];
    if (!d.open && syncDown[id] === 2) { d.open = true; A.sfx('open', 'L'); A.sfx('open', 'R'); line('sync'); game.shake = 0.3; }
  });
  // 2. things the switches move
  SIDES.forEach((sd) => {
    const lvl = LEVEL[sd], a = game.av[sd], o = game.av[other(sd)];
    lvl.doors.forEach((d) => {
      const st = game.door[d.id];
      if (d.sync && sd === 'R') return;                       // the pair shares one state
      const want = st.open || game.active[d.id] ? 1 : 0;
      const inWay = SIDES.some((s2) => LEVEL[s2].doors.some((d2) => d2.id === d.id && Math.abs(game.av[s2].x - d2.x) < 0.85));
      if (want > st.t) st.t = Math.min(1, st.t + dt * 2.2); else if (!inWay) st.t = Math.max(0, st.t - dt * 1.4);
    });
    lvl.lifts.forEach((l) => {
      const st = game.lift[l.id], y = st.y;
      const under = a.x + HW > l.x0 && a.x - HW < l.x1 && a.y + HT < st.y - 0.2;
      if (game.active[l.id]) st.y = Math.min(l.y1, st.y + 2.7 * dt); else if (!under) st.y = Math.max(l.y0, st.y - 2.7 * dt);
      st.dy = st.y - y;
    });
    lvl.bridges.forEach((b) => {
      const st = game.bridge[b.id];
      if (b.ghost) { if (st.on) st.t = Math.min(1, st.t + dt * 2); return; }
      const onIt = a.x > b.x0 - 0.3 && a.x < b.x1 + 0.3 && a.y > b.y - 1.5;
      if (game.active[b.id]) st.t = Math.min(1, st.t + dt * 1.5); else if (!onIt) st.t = Math.max(0, st.t - dt * 1.2);
    });
    lvl.carry.forEach((c) => {
      const st = game.carry[c.id], x = st.x;
      const target = c.from + clamp(o.x - c.track[0], 0, c.track[1] - c.track[0]) * ((c.to - c.from) / (c.track[1] - c.track[0]));
      st.x = approach(st.x, target, 9 * dt);
      st.dx = st.x - x;
    });
  });
  // 3. the players
  SIDES.forEach((sd) => stepAvatar(sd, dt, solidsFor(sd)));
  // 4. things to touch
  SIDES.forEach((sd) => {
    const a = game.av[sd], lvl = LEVEL[sd], od = other(sd);
    lvl.pickups.forEach((p, i) => {
      if (p.got || Math.abs(a.x - p.x) > 0.85 || Math.abs(a.y + HT / 2 - p.y) > 0.95) return;
      p.got = true;
      if (p.key) {
        A.sfx('key', sd); line(p.kind);
        const isDoor = !!game.door[p.key];
        const t = isDoor ? LEVEL[od].doors.find((d) => d.id === p.key) : LEVEL[od].bridges.find((b) => b.id === p.key);
        spark({ sd, x: p.x, y: p.y }, { sd: od, x: isDoor ? t.x : (t.x0 + t.x1) / 2, y: isDoor ? 3 : t.y }, () => {
          if (isDoor) game.door[p.key].open = true; else game.bridge[p.key].on = true;
          A.sfx('open', od);
        });
      } else { game.counts[sd]++; A.sfx('pickup', sd); hud(); }
    });
    lvl.bugs.forEach((b) => {
      if (!b.alive) { b.dead += dt; return; }
      b.x += b.dir * 1.4 * dt;
      if (b.x > b.x1) b.dir = -1; else if (b.x < b.x0) b.dir = 1;
      if (Math.abs(a.x - b.x) > 0.8 || a.y > b.y + 0.8 || a.y + HT < b.y) return;
      if (a.vy < -0.5 && a.y > b.y + 0.28) {
        b.alive = false; game.bugs++; a.vy = 8.6; a.bounced = true; A.sfx('bug', sd); line(sd === 'L' ? 'stompL' : 'stompR'); hud();
      } else if (a.knock <= 0) {
        a.knock = 0.32; a.kvx = (a.x < b.x ? -1 : 1) * 6.5; a.vy = 6; a.onGround = false; a.bounced = true; A.sfx('fall', sd); game.shake = Math.max(game.shake, 0.15);
      }
    });
    // chapters and story beats, per player
    let ch = 0;
    CHAPTERS.forEach((c, i) => { if (a.x >= c.start) ch = i; });
    if (ch > game.chapter[sd]) { game.chapter[sd] = ch; showChapter(sd, ch); }
    BEATS.forEach((b, i) => {
      const text = sd === 'L' ? b.l : b.r;
      if (text && a.x >= b.x && !game.beats[sd].has(i)) { game.beats[sd].add(i); if (a.x < b.x + 12) say(sd, text); }
    });
  });
  for (let i = game.sparks.length - 1; i >= 0; i--) { const sp = game.sparks[i]; sp.t += dt; if (sp.t >= sp.dur) { if (sp.done) sp.done(); game.sparks.splice(i, 1); } }
  // the intern joins late in chapter four
  if (Math.min(game.av.L.x, game.av.R.x) > 195) game.intern = Math.min(1, game.intern + dt * 2);
  // both on their marks: merge
  const on = (a) => a.onGround && Math.abs(a.x - END_X) < 1.05;
  const both = on(game.av.L) && on(game.av.R);
  const before = game.hold;
  game.hold = clamp(game.hold + (both ? dt / 1.7 : -dt / 0.8), 0, 1);
  if (both && before === 0) line('finale');
  if (both && Math.floor(game.hold * 10) !== Math.floor(before * 10)) A.sfx('charge', game.hold);
  if (both && !reduce) game.shake = Math.max(game.shake, 0.05 + game.hold * 0.18);
  const near = Math.min(game.av.L.x, game.av.R.x) > END_X - 9;
  body.classList.toggle('is-finale', near);
  game.off += ((near ? 0.14 : 0.25) - game.off) * Math.min(1, dt * 1.5);
  $('#merge').style.setProperty('--p', game.hold.toFixed(3));
  if (game.hold >= 1) startMerge(false);
}

function startMerge(skipped) {
  game.state = 'merging'; game.mergeT = 0; game.flash = 1; game.skipped = skipped;
  body.classList.remove('is-title', 'is-play', 'is-finale'); body.classList.add('is-merging');
  A.merge();
}
function merging(dt) {
  game.mergeT += dt * (reduce ? 3 : 1);
  game.flash = Math.max(0, game.flash - dt * 1.3);
  if (game.mergeT > 2.5) { game.state = 'whole'; showWhole(); }
}

// ---- the ending page -----------------------------------------------------------
function showWhole() {
  const mm = Math.floor(game.playT / 60), ss = String(Math.floor(game.playT % 60)).padStart(2, '0');
  $('#w-stats').textContent = game.skipped
    ? 'You skipped ahead. The game is still there if you want it.'
    : `Played in ${mm}:${ss}. ${game.counts.L} of ${game.totals.L} sign-offs, ${game.counts.R} of ${game.totals.R} commits, ${game.bugs} of ${game.bugTotal} bugs.`;
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
  const links = [], k = CONFIG.links;
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

// ---- putting the state into the 3D scenes ----------------------------------------
const v3 = new THREE.Vector3();
function sync3D(dt) {
  const t = game.t;
  SIDES.forEach((sd) => {
    const w = world[sd], a = game.av[sd], lvl = LEVEL[sd], Lw = sd === 'L';
    poseCharacter(w.hero, a, t);
    // camera: follow, look a little ahead, sit a little above
    game.camX[sd] += (a.x + a.face * 1.3 + (game.state === 'title' && !narrow ? view.paneV * W / H * 0.42 : 0) - game.camX[sd]) * Math.min(1, dt * 3.2);
    game.camY[sd] += ((a.onGround ? a.y : Math.min(a.y, game.camY[sd] + 1.2)) - game.camY[sd]) * Math.min(1, dt * 2.6);
    const c = cam[sd], cx = game.camX[sd], ly = game.camY[sd] + view.paneV * 0.23;
    c.position.set(cx, ly + view.d * 0.15, view.d); c.lookAt(cx, ly, 0);
    const f = game.off * (sd === 'L' ? 1 : -1);
    if (portrait) c.setViewOffset(W, H, 0, H * 0.25 * (sd === 'L' ? 1 : -1), W, H); else c.setViewOffset(W, H, W * f, 0, W, H);
    w.sun.target.position.set(cx, game.camY[sd], 0); w.sun.position.copy(w.sun.target.position).add(w.sunOffset);
    if (w.lamp) w.lamp.position.set(a.x, a.y + 1.7, 2.2);
    // weather
    const snow = Lw ? clamp(1 - Math.abs((a.x - 135) / 34), 0, 1) : 1;
    w.motes.material.opacity = Lw ? Math.min(0.9, snow * 3) : 0.7;
    w.motes.position.x = cx;
    const pa = w.motes.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) - dt * (Lw ? 1.3 + (i % 5) * 0.2 : -0.12); if (y < 0) y += 14; else if (y > 14) y -= 14; pa.setY(i, y); }
    pa.needsUpdate = true;

    w.plates.forEach((p) => {
      const st = game.plate[p.spec.id]; st.k += ((st.down ? 1 : 0) - st.k) * Math.min(1, dt * 14);
      p.cap.position.y = 0.16 - st.k * 0.09; p.capMat.emissiveIntensity = p.base + st.k * 2.2;
      if (p.ring) { p.ring.position.y = 0.9 + Math.sin(t * 2.4) * 0.08 - st.k * 0.5; p.ring.rotation.z = t; }
    });
    w.doors.forEach((d) => { d.group.position.y = -d.H * ease(clamp(game.door[d.spec.id].t, 0, 1)); });
    w.lifts.forEach((l) => { const y = game.lift[l.spec.id].y; l.group.position.y = y; l.piston.scale.y = Math.max(0.05, y - 0.3 + 7); l.piston.position.y = (y - 0.3 - 7) / 2; });
    w.bridges.forEach((b) => {
      const st = game.bridge[b.spec.id], n = b.planks.length;
      b.planks.forEach((m, i) => { const k = clamp(st.t * n - i, 0, 1); m.visible = k > 0.02; const e = ease(k); if (b.spec.step) m.scale.set(1, e, 1); else if (Lw) m.scale.set(m.scale.x, e, e); else m.scale.set(e, e, 1); });
      if (b.ghost) { b.ghost.visible = st.t < 0.98; b.ghost.material.opacity = 1; b.ghost.position.y += Math.sin(t * 3) * 0.0006; }
    });
    w.carry.forEach((c2) => { const st = game.carry[c2.spec.id]; c2.group.position.x = st.x; c2.group.position.y = c2.spec.y + Math.sin(t * 2.2) * 0.0; c2.rotors.forEach((r) => { r.rotation.y = t * 22; }); });
    w.bugs.forEach((b) => {
      const s = b.spec;
      if (!s.alive) { const k = clamp(s.dead * 5, 0, 1); b.group.scale.set(1 + k * 0.5, Math.max(0.02, 1 - k), 1 + k * 0.5); b.group.visible = s.dead < 0.7; return; }
      b.group.position.set(s.x, s.y, 0.2); b.group.rotation.y = s.dir > 0 ? 0 : Math.PI;
      b.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 16 + i * 2.1) * 0.5; });
    });
    w.pickups.forEach((p, i) => {
      const s = p.spec;
      if (s.got) { const k = p.group.scale.x * 0.8; p.group.scale.setScalar(k); if (k < 0.05) p.group.visible = false; return; }
      p.group.position.y = s.y + Math.sin(t * 2.4 + i) * 0.12; p.group.rotation.y = s.kind === 'comment' ? Math.sin(t * 1.6 + i) * 0.4 : t * 1.8 + i;
    });
    w.pad.ring.position.y = 0.5 + Math.sin(t * 2) * 0.08 + game.hold * 1.6; w.pad.ring.scale.setScalar(1 + game.hold * 0.25);
    w.pad.topMat.emissiveIntensity = (Lw ? 0 : 0.6) + game.hold * 2.5;
    // the intern, a few steps behind, doing whatever you just did
    w.intern.visible = game.intern > 0.01;
    if (w.intern.visible) {
      let e = a.hist[0];
      for (let i = a.hist.length - 1; i >= 0; i--) if (game.t - a.hist[i].t >= 0.45) { e = a.hist[i]; break; }
      if (e) poseCharacter(w.intern, { x: e.x - e.face * 0.9, y: e.y, vx: e.vx, face: e.face, onGround: e.onGround, walk: e.walk, squash: 0, turn: w.intern.rotation.y }, t + 0.7, 0.6 * game.intern);
    }
  });
}
function syncMerged(dt) {
  const t = game.t, m = merged, k = game.state === 'whole' ? 1 : clamp(game.mergeT / 0.95, 0, 1);
  const cxm = game.state === 'whole' && !reduce ? Math.sin(t * 0.13) * 1.6 : 0;
  const vf = narrow ? Math.max(13, 13 * H / W) : 12.5, d = vf / (2 * TAN), ly = vf * (narrow ? 0.3 : 0.25);
  camM.position.set(cxm, ly + d * 0.13, d); camM.lookAt(cxm * 0.6, ly, 0); camM.updateProjectionMatrix();
  m.sun.target.position.set(0, 0, 0);
  // keep the whole circle near the top of the frame on any screen
  const dy = ly + 0.74 * (vf / 2) * (d + 22) / d, ds = (vf / 12.5) * (narrow ? 0.5 : 1);
  m.disc.position.y = m.halo.position.y = dy; m.disc.scale.setScalar(ds); m.halo.scale.setScalar(ds);
  const pa = m.motes.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) + dt * 0.18; if (y > 13) y -= 13; pa.setY(i, y); }
  pa.needsUpdate = true;
  if (k < 1) {
    // the two run in from their own sides and leap
    const e = ease(k), hop = Math.sin(k * Math.PI) * 2.4;
    poseCharacter(m.a, { x: -5.5 * (1 - e), y: hop, vx: 5, face: 1, onGround: false, walk: t, squash: -0.3 }, t);
    poseCharacter(m.b, { x: 5.5 * (1 - e), y: hop, vx: -5, face: -1, onGround: false, walk: t, squash: -0.3 }, t);
    m.a.visible = m.b.visible = true; m.hero.visible = false;
  } else {
    m.a.visible = m.b.visible = false; m.hero.visible = true;
    const since = game.state === 'whole' ? 9 : game.mergeT - 0.95;
    const hopT = (t % 4.2) / 0.55, hopY = hopT < 1 && !reduce ? Math.sin(hopT * Math.PI) * 0.9 : 0;
    poseCharacter(m.hero, { x: 0, y: hopY, vx: 0, face: 0, onGround: hopY === 0, walk: 0, squash: since < 0.4 ? 0.7 * (1 - since / 0.4) : (hopT > 1 && hopT < 1.25 ? 0.4 : 0), turn: Math.sin(t * 0.5) * 0.25 }, t, 1.25);
  }
  m.halo.rotation.z = t * 0.05;
}

// ---- the 2D layer on top: connections between the worlds ----------------------------
function toScreen(sd, x, y) {
  v3.set(x, y, 0.2).project(cam[sd]);
  return [(v3.x * 0.5 + 0.5) * W, (1 - (v3.y * 0.5 + 0.5)) * H];
}
function inPane(sd, p) {
  const s = signed(p) * (sd === 'L' ? -1 : 1);
  if (s > 24) return p;
  // pull the point back inside its own half
  const k = 24 - s, sg = sd === 'L' ? -1 : 1;
  return [p[0] + geo.nx * k * sg, p[1] + geo.ny * k * sg];
}
function wire(a, b, k, t) {
  const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 70;
  fxc.setLineDash([3, 9]); fxc.lineDashOffset = -t * 60; fxc.lineCap = 'round';
  fxc.strokeStyle = `rgba(12,42,107,${0.5 * k})`; fxc.lineWidth = 6;
  fxc.beginPath(); fxc.moveTo(a[0], a[1]); fxc.quadraticCurveTo(mx, my, b[0], b[1]); fxc.stroke();
  fxc.strokeStyle = `rgba(255,190,40,${k})`; fxc.lineWidth = 3;
  fxc.beginPath(); fxc.moveTo(a[0], a[1]); fxc.quadraticCurveTo(mx, my, b[0], b[1]); fxc.stroke();
  fxc.setLineDash([]);
  fxc.fillStyle = `rgba(255,190,40,${k})`; fxc.beginPath(); fxc.arc(b[0], b[1], 7, 0, 6.3); fxc.fill();
  fxc.strokeStyle = `rgba(255,255,255,${k})`; fxc.lineWidth = 2; fxc.beginPath(); fxc.arc(b[0], b[1], 11 + Math.sin(t * 6) * 2, 0, 6.3); fxc.stroke();
}
function drawFx(dt) {
  fxc.setTransform(DPR, 0, 0, DPR, 0, 0);
  fxc.clearRect(0, 0, W, H);
  if (game.state !== 'play') return;
  const t = game.t;
  const clampScr = (p) => [clamp(p[0], 14, W - 14), clamp(p[1], 14, H - 14)];
  const targetOf = (od, id) => {
    const lvl = LEVEL[od];
    const d = lvl.doors.find((q) => q.id === id); if (d) return [d.x, 3.4];
    const l = lvl.lifts.find((q) => q.id === id); if (l) return [(l.x0 + l.x1) / 2, game.lift[id].y];
    const b = lvl.bridges.find((q) => q.id === id); if (b) return [(b.x0 + b.x1) / 2, b.y];
    return null;
  };
  SIDES.forEach((sd) => {
    const od = other(sd);
    // a held plate shows what it is holding, across the seam
    LEVEL[sd].plates.forEach((p) => {
      const st = game.plate[p.id];
      if (st.k < 0.05) return;
      const id = p.drives || p.sync, tg = targetOf(od, id); if (!tg) return;
      wire(toScreen(sd, p.x, p.y + 0.3), clampScr(inPane(od, toScreen(od, tg[0], tg[1]))), st.k, t);
    });
    // walking the rail moves the other player's platform
    LEVEL[od].carry.forEach((c) => {
      const a = game.av[sd];
      if (a.x < c.track[0] - 1.5 || a.x > c.track[1] + 1.5) return;
      wire(toScreen(sd, a.x, a.y + 1.2), clampScr(inPane(od, toScreen(od, game.carry[c.id].x, c.y - 0.2))), 0.9, t);
    });
  });
  // a comment or a commit, flying over
  for (let i = game.sparks.length - 1; i >= 0; i--) {
    const sp = game.sparks[i];
    const k = ease(clamp(sp.t / sp.dur, 0, 1));
    const a = toScreen(sp.from.sd, sp.from.x, sp.from.y), b = clampScr(inPane(sp.to.sd, toScreen(sp.to.sd, sp.to.x, sp.to.y)));
    sp.trail.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 110]);
    if (sp.trail.length > 16) sp.trail.shift();
    sp.trail.forEach((p, j) => { const q = (j + 1) / sp.trail.length; fxc.fillStyle = `rgba(255,${180 + 60 * q | 0},${60 + 180 * q | 0},${q})`; fxc.beginPath(); fxc.arc(p[0], p[1], 2 + q * 7, 0, 6.3); fxc.fill(); });
  }
}

// ---- drawing a frame ------------------------------------------------------------
function scissorFor(sd, w, h) {
  // only draw the half that will be seen, plus a margin for the tilt and the glow
  const m = 0.14;
  if (!portrait) return sd === 'L' ? [0, 0, w * (0.5 + m), h] : [w * (0.5 - m), 0, w * (0.5 + m), h];
  return sd === 'L' ? [0, h * (0.5 - m), w, h * (0.5 + m)] : [0, 0, w, h * (0.5 + m)];
}
function render(dt) {
  const u = post.uniforms, w = rt.L.width, h = rt.L.height;
  const showSplit = game.state !== 'whole', showM = game.state === 'merging' || game.state === 'whole';
  if (showSplit) {
    sync3D(dt);
    SIDES.forEach((sd) => {
      setUiClip(sd);
      const s = scissorFor(sd, w, h);
      rt[sd].scissor.set(s[0], s[1], s[2], s[3]); rt[sd].scissorTest = true;
      renderer.setRenderTarget(rt[sd]); renderer.render(world[sd].scene, cam[sd]);
    });
  }
  if (showM) { syncMerged(dt); renderer.setRenderTarget(rt.M); renderer.render(merged.scene, camM); }
  renderer.setRenderTarget(null);

  let shx = 0, shy = 0;
  if (game.shake > 0 && !reduce) { shx = (Math.random() - 0.5) * game.shake * 18; shy = (Math.random() - 0.5) * game.shake * 18; }
  cv.style.transform = shx || shy ? `translate(${shx.toFixed(1)}px,${shy.toFixed(1)}px)` : '';
  u.tL.value = rt.L.texture; u.tR.value = rt.R.texture; u.tM.value = rt.M.texture;
  u.uC.value.set(geo.cx * DPR, (H - geo.cy) * DPR); u.uN.value.set(geo.nx, -geo.ny);
  u.uGap.value = geo.gap * DPR; u.uTime.value = game.t; u.uFlash.value = game.state === 'merging' ? game.flash : 0;
  u.uCharge.value = game.state === 'merging' ? 1 : game.hold;
  u.uProg.value = game.state === 'title' ? 0 : clamp((game.av.L.x + game.av.R.x) / 2 / END_X, 0, 1);
  u.uWhole.value = game.state === 'whole' ? 1 : 0;
  // the half discs ride the seam, above the middle
  const al = W * 0.37;
  u.uDisc.value.set((geo.cx + geo.dx * al) * DPR, (H - (geo.cy + geo.dy * al)) * DPR, Math.min(W, H) * (narrow ? 0.13 : 0.085) * DPR);
  if (game.state === 'merging') {
    const far = Math.max.apply(null, [[0, 0], [W, 0], [W, H], [0, H]].map((p) => Math.abs(signed(p))));
    u.uBand.value = ease(clamp((game.mergeT - 0.35) / 1.9, 0, 1)) * (far + 60) * DPR;
  } else u.uBand.value = -1;
  renderer.render(postScene, postCam);
  drawFx(dt);
}

// ---- loop -----------------------------------------------------------------------
function update(dt) {
  game.t += dt;
  game.shake = Math.max(0, game.shake - dt * 1.3);
  if (game.state === 'play') play(dt);
  else if (game.state === 'merging') merging(dt);
  if (game.state !== 'whole') updateGeo(dt);
}
let last = 0, frames = 0, slow = 0;
function frame(now) {
  const raw = (now - last) / 1000 || 0.016; last = now;
  const dt = Math.min(0.034, raw);
  update(dt);
  render(dt);
  // if the machine is struggling, trade sharpness for speed
  if (++frames > 30 && raw > 0.04 && DPR > 1) { if (++slow > 40) { slow = 0; DPR = Math.max(1, DPR - 0.25); const w = Math.round(W * DPR), h = Math.round(H * DPR); renderer.setPixelRatio(DPR); renderer.setSize(W, H, false); ['L', 'R', 'M'].forEach((k) => rt[k].setSize(w, h)); fx.width = w; fx.height = h; post.uniforms.uRes.value.set(w, h); post.uniforms.uPx.value = DPR; } }
  requestAnimationFrame(frame);
}

// ---- go -------------------------------------------------------------------------
async function boot() {
  if (document.fonts && document.fonts.load) {
    // the worlds have signs painted in these faces, so wait for them
    await Promise.race([
      Promise.all(['italic 400 40px "Old Standard TT"', '700 40px "Old Standard TT"', '800 40px "Martian Mono"', '400 40px "Martian Mono"'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500))
    ]).catch(() => {});
  }
  ['L', 'R', 'M'].forEach((k) => { rt[k] = makeRT(); });
  SIDES.forEach((sd) => { world[sd] = buildWorld(sd); cam[sd] = new THREE.PerspectiveCamera(FOV, 1, 1, 200); });
  merged = buildMerged(); camM = new THREE.PerspectiveCamera(FOV, 1, 1, 200);
  reset(); buildStatics(); buildWholePage(); resize();
  window.addEventListener('resize', resize);
  body.classList.add('is-ready');
  requestAnimationFrame(frame);
  // a handle for testing from the console
  window.__bella = { get game() { return game; }, input, start, startMerge, update, supported, press };
}
boot();
