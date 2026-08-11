"use strict";
/* ============================================================
   TAPBLADE  -  a tiny offline top-down action game.
   One control: TAP. Where you tap, and how, is the whole game.
   Hold (or right click) to unleash a special once it is charged.

   Everything is drawn into a small pixel buffer that is sized to
   the screen at an integer scale, so it stays crisp and fills the
   device in any orientation.
   ============================================================ */

let W = 256, H = 224, SCALE = 3;
const FIELD = { x0: 8, y0: 32, x1: 248, y1: 216 };
const HUD_H = 28;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

function resize() {
  const vw = Math.max(240, window.innerWidth);
  const vh = Math.max(240, window.innerHeight);

  // integer scale whose short side lands nearest a comfortable pixel-art size
  let s = 1, err = Infinity;
  for (let k = 1; k <= 8; k++) {
    const mn = Math.min(vw / k, vh / k);
    if (mn < 140) continue;
    const e = Math.abs(mn - 210);
    if (e < err) { err = e; s = k; }
  }
  SCALE = s;
  let w = Math.floor(vw / s), h = Math.floor(vh / s);
  h = Math.min(h, Math.round(w * 1.9));   // letterbox absurd aspects
  w = Math.min(w, Math.round(h * 2.0));
  W = w; H = h;

  FIELD.x0 = 8; FIELD.y0 = HUD_H + 4;
  FIELD.x1 = W - 8; FIELD.y1 = H - 8;

  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // keep everyone inside the new field
  if (P) {
    P.x = clamp(P.x, FIELD.x0 + 3, FIELD.x1 - 3);
    P.y = clamp(P.y, FIELD.y0 + 3, FIELD.y1 - 1);
    P.tx = clamp(P.tx, FIELD.x0 + 3, FIELD.x1 - 3);
    P.ty = clamp(P.ty, FIELD.y0 + 3, FIELD.y1 - 1);
  }
  for (const e of enemies) {
    e.x = clamp(e.x, FIELD.x0 + 2, FIELD.x1 - 2);
    e.y = clamp(e.y, FIELD.y0 + 2, FIELD.y1 - 1);
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

/* ---------------- keep the browser from zooming ----------------
   iOS has ignored user-scalable=no since iOS 10, so the viewport tag alone
   never stops pinch or double-tap zoom. These handlers do. */
const stop = e => e.preventDefault();
for (const n of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(n, stop, { passive: false });
}
document.addEventListener('dblclick', stop, { passive: false });
// Pointer events have already fired by the time these run, so swallowing the
// touch defaults costs the game nothing and kills the zoom gestures outright.
document.addEventListener('touchstart', stop, { passive: false });
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('touchend', stop, { passive: false });

/* ---------------- tiny 3x5 bitmap font ---------------- */
const G = {
  '0':"###,#.#,#.#,#.#,###", '1':".#.,##.,.#.,.#.,###", '2':"###,..#,###,#..,###",
  '3':"###,..#,###,..#,###", '4':"#.#,#.#,###,..#,..#", '5':"###,#..,###,..#,###",
  '6':"###,#..,###,#.#,###", '7':"###,..#,..#,..#,..#", '8':"###,#.#,###,#.#,###",
  '9':"###,#.#,###,..#,###",
  'A':"###,#.#,###,#.#,#.#", 'B':"##.,#.#,##.,#.#,##.", 'C':"###,#..,#..,#..,###",
  'D':"##.,#.#,#.#,#.#,##.", 'E':"###,#..,##.,#..,###", 'F':"###,#..,##.,#..,#..",
  'G':"###,#..,#.#,#.#,###", 'H':"#.#,#.#,###,#.#,#.#", 'I':"###,.#.,.#.,.#.,###",
  'J':"..#,..#,..#,#.#,###", 'K':"#.#,#.#,##.,#.#,#.#", 'L':"#..,#..,#..,#..,###",
  'M':"#.#,###,###,#.#,#.#", 'N':"##.,#.#,#.#,#.#,#.#", 'O':"###,#.#,#.#,#.#,###",
  'P':"###,#.#,###,#..,#..", 'Q':"###,#.#,#.#,###,..#", 'R':"###,#.#,##.,#.#,#.#",
  'S':"###,#..,###,..#,###", 'T':"###,.#.,.#.,.#.,.#.", 'U':"#.#,#.#,#.#,#.#,###",
  'V':"#.#,#.#,#.#,#.#,.#.", 'W':"#.#,#.#,###,###,#.#", 'X':"#.#,#.#,.#.,#.#,#.#",
  'Y':"#.#,#.#,.#.,.#.,.#.", 'Z':"###,..#,.#.,#..,###",
  ' ':"...,...,...,...,...", ':':"...,.#.,...,.#.,...", '-':"...,...,###,...,...",
  '.':"...,...,...,...,.#.", ',':"...,...,...,.#.,#..", '!':".#.,.#.,.#.,...,.#.",
  '?':"###,..#,.#.,...,.#.", '/':"..#,..#,.#.,#..,#..", '+':"...,.#.,###,.#.,...",
  '*':"#.#,.#.,###,.#.,#.#", '>':"#..,.#.,..#,.#.,#..", '<':"..#,.#.,#..,.#.,..#",
  '%':"#.#,..#,.#.,#..,#.#", '(':".#.,#..,#..,#..,.#.", ')':".#.,..#,..#,..#,.#.",
  "'":".#.,.#.,...,...,...", '=':"...,###,...,###,...", '_':"...,...,...,...,###",
  '#':"#.#,###,#.#,###,#.#", '@':"###,#.#,###,#..,###",
};
const GLYPH = {};
for (const k in G) GLYPH[k] = G[k].split(',');

function textWidth(str, s = 1) { return String(str).length * 4 * s - s; }

function text(str, x, y, color, s = 1) {
  ctx.fillStyle = color;
  str = String(str).toUpperCase();
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const g = GLYPH[str[i]];
    if (!g) continue;
    const gx = x + i * 4 * s;
    for (let r = 0; r < 5; r++) {
      const row = g[r];
      for (let cc = 0; cc < 3; cc++) {
        if (row[cc] === '#') ctx.fillRect(gx + cc * s, y + r * s, s, s);
      }
    }
  }
}
function textC(str, cx, y, color, s = 1) { text(str, Math.round(cx - textWidth(str, s) / 2), y, color, s); }
function textR(str, rx, y, color, s = 1) { text(str, Math.round(rx - textWidth(str, s)), y, color, s); }

/* ---------------- sprites ---------------- */
function spr(map, x, y, pal, flip) {
  const h = map.length, w = map[0].length;
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < h; r++) {
    const row = map[r];
    for (let cc = 0; cc < w; cc++) {
      const ch = row[cc];
      if (ch === '.') continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + (flip ? w - 1 - cc : cc), y + r, 1, 1);
    }
  }
}

const HERO = {
  down: [
    ".hhhhhh.",
    "hhhhhhhh",
    "hssssssh",
    "hseesseh",
    "hssssssh",
    ".ssssss.",
    "bbbbbbbb",
    "BbbbbbbB",
    ".pp..pp.",
    ".oo..oo.",
  ],
  up: [
    ".hhhhhh.",
    "hhhhhhhh",
    "hhhhhhhh",
    "hhhhhhhh",
    "hhhhhhhh",
    ".hhhhhh.",
    "bbbbbbbb",
    "BbbbbbbB",
    ".pp..pp.",
    ".oo..oo.",
  ],
  side: [
    "..hhhh..",
    ".hhhhhh.",
    ".hssshhh",
    ".hseessh",
    ".hssssss",
    "..ssss..",
    ".bbbbbb.",
    "BbbbbbbB",
    "..pppp..",
    "..oo.oo.",
  ],
};

/* the wizard gets his own silhouette - pointed hat and a long robe */
const WIZ = {
  down: [
    "...hh...",
    "..hhhh..",
    ".hhhhhh.",
    "hhhhhhhh",
    ".ssssss.",
    ".seesse.",
    "bbbbbbbb",
    "BbbbbbbB",
    ".bbbbbb.",
    ".oo..oo.",
  ],
  up: [
    "...hh...",
    "..hhhh..",
    ".hhhhhh.",
    "hhhhhhhh",
    ".hhhhhh.",
    ".hhhhhh.",
    "bbbbbbbb",
    "BbbbbbbB",
    ".bbbbbb.",
    ".oo..oo.",
  ],
  side: [
    "..hh....",
    ".hhhh...",
    "hhhhhh..",
    "hhhhhhh.",
    ".sssss..",
    ".seess..",
    ".bbbbbb.",
    "BbbbbbbB",
    "..bbbb..",
    "..oo.oo.",
  ],
};

const ESPR = {
  crawler: [
    "..aaaa..",
    ".aaaaaa.",
    "aeaaaaea",
    "aaaaaaaa",
    "abaaaaba",
    ".aaaaaa.",
    "b.a..a.b",
    "........",
  ],
  charger: [
    ".bbbbbb.",
    "baaaaaab",
    "aeaaaaea",
    "aaaaaaaa",
    "aaaaaaaa",
    "baaaaaab",
    ".b.aa.b.",
    "..b..b..",
  ],
  spitter: [
    "...aa...",
    "..aaaa..",
    ".aeaaea.",
    ".aaaaaa.",
    "..baab..",
    ".a.aa.a.",
    "a..aa..a",
    "...bb...",
  ],
  flyer: [
    "..a..a..",
    ".aa..aa.",
    "b.aaaa.b",
    "baeaaeab",
    "b.aaaa.b",
    ".aa..aa.",
    "..a..a..",
    "........",
  ],
};

/* bosses are 16x16 */
const BSPR = {
  tusk: [
    "....bbbbbbbb....",
    "...bbaaaaaabb...",
    "..baaaaaaaaaab..",
    ".baaaaaaaaaaaab.",
    ".baaeaaaaaaeaab.",
    ".baaaaaaaaaaaab.",
    "tbaaaaaaaaaaaabt",
    "tbaaaabbbbaaaabt",
    "ttaaaabaabaaaatt",
    ".baaaaabbaaaaab.",
    ".bbaaaaaaaaaabb.",
    "..bbaaaaaaaabb..",
    "...bbbaaaabbb...",
    "...bb.bbbb.bb...",
    "..bb...bb...bb..",
    "..b.....b.....b.",
  ],
  ward: [
    "......aaaa......",
    ".....aaaaaa.....",
    "..b..aaaaaa..b..",
    ".bb..aeaaea..bb.",
    "bbba.aaaaaa.abbb",
    "bbbaaaaaaaaaabbb",
    ".bbaaaaaaaaaabb.",
    "..baaaaaaaaaab..",
    "...aaabbbbaaa...",
    "...aaabbbbaaa...",
    "....aaaaaaaa....",
    ".....aaaaaa.....",
    "......aaaa......",
    ".......aa.......",
    "................",
    "................",
  ],
};

/* ---------------- characters ---------------- */
const CHARS = [
  {
    name: 'KIT', title: 'THE BLADE', set: HERO,
    blurb: ['QUICK WIDE CUTS.', 'THREE DASH CHARGES.', 'SPECIAL: SPIN OF STEEL.'],
    hp: 5, speed: 1.05, dmg: 2, arc: 1.5, range: 24, cd: 0.20, swingTime: 0.16,
    ranged: false, homing: false, dashes: 3, dashCost: 22, jump: 3.2, flap: 1.85,
    flapCost: 26, glideFall: 0.45, glideBoost: 1.7, pound: 0,
    special: 'WHIRLWIND',
    pal: { h: '#f8d878', s: '#fcbcb0', e: '#301020', b: '#3060e8', B: '#1830a0', p: '#c07830', o: '#402000' },
    trail: '#8cc8ff',
  },
  {
    name: 'BRUX', title: 'THE HAMMER', set: HERO,
    blurb: ['HUGE SLOW ARCS.', 'SLAMS ON LANDING.', 'SPECIAL: EARTHQUAKE.'],
    hp: 8, speed: 0.85, dmg: 4, arc: 2.7, range: 27, cd: 0.46, swingTime: 0.3,
    ranged: false, homing: false, dashes: 2, dashCost: 30, jump: 2.9, flap: 1.6,
    flapCost: 40, glideFall: 0.85, glideBoost: 1.35, pound: 6,
    special: 'EARTHQUAKE',
    pal: { h: '#f85818', s: '#fcbcb0', e: '#301020', b: '#909090', B: '#404048', p: '#583010', o: '#302018' },
    trail: '#ffb060',
  },
  {
    name: 'ZIA', title: 'THE WING', set: HERO,
    blurb: ['FIRES SPARK BOLTS.', 'CHEAP FLAPS, LONG GLIDE.', 'SPECIAL: SPARK STORM.'],
    hp: 3, speed: 1.1, dmg: 2, arc: 0.5, range: 30, cd: 0.28, swingTime: 0.12,
    ranged: true, homing: false, dashes: 3, dashCost: 18, jump: 3.5, flap: 2.0,
    flapCost: 15, glideFall: 0.22, glideBoost: 1.9, pound: 0,
    special: 'SPARKSTORM',
    pal: { h: '#f0f0f8', s: '#fcbcb0', e: '#301020', b: '#a838d8', B: '#601080', p: '#403060', o: '#282040' },
    trail: '#e8a0ff',
  },
  {
    name: 'MORU', title: 'THE ARCANE', set: WIZ,
    blurb: ['ORBS THAT CHASE THEM DOWN.', 'HITS HIGH AND LOW ALIKE.', 'SPECIAL: SINGULARITY.'],
    hp: 4, speed: 0.95, dmg: 3, arc: 0.5, range: 34, cd: 0.44, swingTime: 0.12,
    ranged: true, homing: true, dashes: 2, dashCost: 20, jump: 3.0, flap: 1.8,
    flapCost: 22, glideFall: 0.35, glideBoost: 1.5, pound: 0,
    special: 'SINGULARITY',
    pal: { h: '#2f8fd8', s: '#fcbcb0', e: '#301020', b: '#1c4f9c', B: '#12306a', p: '#12306a', o: '#241a3c' },
    trail: '#7ce0ff',
  },
];

/* ---------------- upgrades ---------------- */
const UPGRADES = [
  { id: 'power',   name: 'POWER',   max: 5, desc: '+1 ATTACK DAMAGE' },
  { id: 'swift',   name: 'SWIFT',   max: 5, desc: 'ATTACK 12% FASTER' },
  { id: 'reach',   name: 'REACH',   max: 3, desc: 'LONGER, WIDER SWINGS' },
  { id: 'vigor',   name: 'VIGOR',   max: 4, desc: '+1 HEART AND HEAL 1' },
  { id: 'boots',   name: 'BOOTS',   max: 4, desc: 'MOVE 8% FASTER' },
  { id: 'wind',    name: 'WIND',    max: 2, desc: '+1 DASH CHARGE' },
  { id: 'feather', name: 'FEATHER', max: 3, desc: 'CHEAP FLAPS, SLOW FALL' },
  { id: 'focus',   name: 'FOCUS',   max: 3, desc: 'SPECIAL CHARGES FASTER' },
  { id: 'guard',   name: 'GUARD',   max: 2, desc: 'LONGER MERCY WHEN HIT' },
  { id: 'leech',   name: 'LEECH',   max: 2, desc: 'KILLS SOMETIMES HEAL' },
];

/* ---------------- audio (procedural, no assets) ---------------- */
let AC = null, muted = false;
function initAudio() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
}
function beep(freq, dur, type, vol, slide) {
  if (!AC || muted) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol) {
  if (!AC || muted) return;
  const n = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AC.createBufferSource(); src.buffer = buf;
  const g = AC.createGain(); g.gain.value = vol || 0.05;
  src.connect(g); g.connect(AC.destination); src.start();
}

/* ---------------- helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

const SELF_TAP_R = 11;   // tap this close to yourself = jump / flap
const STOP_DIST = 16;    // you halt this far from the tapped spot, so repeat
                         // taps on the same target stay attacks, not jumps
const BODY_H = 4;        // middle of a body, measured up from its feet
const SWING_Z = 16;      // how far up/down a sword reaches. Wide enough that a
                         // jump apex still covers a hovering flyer.
const SHOT_Z = 9;        // same, for bolts
const HOLD_T = 0.34;     // hold this long to arm the special
const SP_MAX = 100;

/* ---------------- state ---------------- */
const S = { MENU: 0, PLAY: 1, DEAD: 2, PAUSE: 3, HELP: 4, LEVEL: 5 };
let state = S.MENU;
let sel = 0;
let best = loadBest();
let shake = 0, hitStop = 0, flash = 0;
let time = 0, score = 0, wave = 1, kills = 0;
let spawnT = 0, waveT = 0, deadAt = 0;
let enemies = [], shots = [], parts = [], drops = [], texts = [], tapFx = [];
let rings = [], holes = [];
let bossAlive = false, bossIdx = 0, banner = null;
let cards = [], pendingLevels = 0;
let P = null;
let lastTap = { x: 0, y: 0, t: -9 };
let hold = null;

function loadBest() {
  try {
    const raw = localStorage.getItem('tapblade.best.v1');
    if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; }
  } catch (e) {}
  return {};
}
function saveBest() {
  try { localStorage.setItem('tapblade.best.v1', JSON.stringify(best)); } catch (e) {}
}

/* ---------------- player ---------------- */
function makePlayer(ci) {
  const c = CHARS[ci];
  const cx = (FIELD.x0 + FIELD.x1) / 2, cy = (FIELD.y0 + FIELD.y1) / 2;
  const p = {
    c, ci,
    x: cx, y: cy, z: 0, vz: 0, tx: cx, ty: cy,
    face: Math.PI / 2,
    hp: c.hp, maxhp: c.hp,
    stam: 100, sp: 0,
    dash: 0, dashDir: 0, dashLeft: c.dashes, dashRegen: 0,
    atkCd: 0, swing: null, spin: null,
    inv: 0, glide: 0, walkT: 0, moving: false,
    flapAnim: 0, hurtFlash: 0, charge: 0,
    level: 1, xp: 0, xpNeed: xpFor(1),
    up: {},
  };
  for (const u of UPGRADES) p.up[u.id] = 0;
  recalc(p);
  return p;
}

function xpFor(level) { return Math.round(24 + 15 * Math.pow(level, 1.42)); }

/* Effective stats live on the player, never on the shared character config. */
function recalc(p) {
  const c = p.c, u = p.up;
  p.dmg = c.dmg + u.power;
  p.cd = c.cd * Math.pow(0.88, u.swift);
  p.range = c.range + u.reach * 4;
  p.arc = c.arc + u.reach * 0.12;
  p.speed = c.speed * (1 + u.boots * 0.08);
  p.maxhp = c.hp + u.vigor;
  p.dashes = c.dashes + u.wind;
  p.flapCost = c.flapCost * Math.pow(0.75, u.feather);
  p.glideFall = c.glideFall * Math.pow(0.82, u.feather);
  p.spGain = 1 + u.focus * 0.35;
  p.invBonus = u.guard * 0.4;
  p.leech = u.leech;
  p.hp = Math.min(p.hp, p.maxhp);
}

/* ---------------- menu layout (adapts to the screen) ---------------- */
function menuLayout() {
  const wide = W >= 250;
  const ts = W >= 200 ? 3 : 2;                       // title scale
  const top = 6 + 5 * ts + 5 + 5 + 8;                // below title + tagline
  const btnY = H - 16;
  const startY = H - 40;
  const availTop = top, availBot = startY - 6;
  const infoH = 10 + 9 + 4 * 8 + 3 * 7;              // name/title + stat bars + blurb

  let pw, ph, gap, rects = [];
  if (wide) {
    pw = Math.min(78, Math.floor((W - 16) / 4) - 4);
    gap = Math.floor((W - pw * 4) / 5);
    ph = clamp((availBot - availTop) - infoH - 8, 30, 46);
  } else {
    pw = Math.min(W - 20, 152);
    gap = 4;
    ph = clamp(Math.floor(((availBot - availTop) - infoH - 8 - 3 * 4) / 4), 20, 32);
  }
  const stackH = wide ? ph : ph * 4 + gap * 3;
  const y0 = availTop + Math.max(0, Math.floor(((availBot - availTop) - (stackH + 8 + infoH)) / 2));
  for (let i = 0; i < 4; i++) {
    if (wide) rects.push({ x: gap + i * (pw + gap), y: y0, w: pw, h: ph });
    else rects.push({ x: Math.round((W - pw) / 2), y: y0 + i * (ph + gap), w: pw, h: ph });
  }
  const sw = Math.min(120, W - 40);
  return {
    wide, ts, rects, infoY: y0 + stackH + 8,
    start: { x: Math.round((W - sw) / 2), y: startY, w: sw, h: 18 },
    help: { x: Math.round(W / 2) - 72, y: btnY - 3, w: 70, h: 14 },
    sound: { x: Math.round(W / 2) + 2, y: btnY - 3, w: 70, h: 14 },
  };
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function cardRects() {
  const cw = Math.min(W - 24, 178), ch = Math.min(36, Math.floor((H - 80) / 3) - 6);
  const gap = 6, x = Math.round((W - cw) / 2);
  const y0 = Math.round((H - (ch * 3 + gap * 2)) / 2) + 6;
  return [0, 1, 2].map(i => ({ x, y: y0 + i * (ch + gap), w: cw, h: ch }));
}

/* ---------------- input ---------------- */
function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / (r.width / W), y: (e.clientY - r.top) / (r.height / H) };
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  const p = toGame(e);

  // right click is the desktop shortcut straight to the special
  if (e.button === 2) {
    if (state === S.PLAY) trySpecial(p.x, p.y);
    return;
  }

  // a second finger while the first is held down also fires it
  if (state === S.PLAY && hold && hold.id !== e.pointerId) {
    if (trySpecial(p.x, p.y)) return;
  }

  if (state === S.PLAY) hold = { id: e.pointerId, x: p.x, y: p.y, t: 0, fired: false };
  handleTap(p.x, p.y);
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (hold && hold.id === e.pointerId) {
    const p = toGame(e);
    hold.x = p.x; hold.y = p.y;
  }
}, { passive: false });

function endHold(e) {
  if (!hold || hold.id !== e.pointerId) return;
  // held long enough and charged? release fires the special where you point
  if (state === S.PLAY && !hold.fired && hold.t >= HOLD_T) trySpecial(hold.x, hold.y);
  hold = null;
}
window.addEventListener('pointerup', endHold);
window.addEventListener('pointercancel', endHold);
canvas.addEventListener('contextmenu', e => e.preventDefault());

function handleTap(x, y) {
  const now = time;

  if (state === S.MENU) {
    const L = menuLayout();
    for (let i = 0; i < 4; i++) {
      if (inRect(x, y, L.rects[i])) {
        if (sel === i) startGame(i);
        else { sel = i; beep(520, .05, 'square', .05); }
        return;
      }
    }
    if (inRect(x, y, L.start)) { startGame(sel); return; }
    if (inRect(x, y, L.help)) { state = S.HELP; beep(400, .05); return; }
    if (inRect(x, y, L.sound)) { muted = !muted; beep(600, .05); return; }
    return;
  }

  if (state === S.HELP) { state = S.MENU; beep(400, .05); return; }
  if (state === S.DEAD) { if (now - deadAt > 0.6) state = S.MENU; return; }
  if (state === S.PAUSE) { state = S.PLAY; beep(660, .05); return; }

  if (state === S.LEVEL) {
    const rs = cardRects();
    for (let i = 0; i < 3; i++) {
      if (inRect(x, y, rs[i])) { takeUpgrade(cards[i]); return; }
    }
    return;
  }

  /* ---- in game ---- */
  if (x > W - 16 && y < 14) { state = S.PAUSE; hold = null; beep(300, .06); return; }

  tapFx.push({ x, y, t: 0 });

  const d = dist(x, y, P.x, P.y - P.z);
  const dblSame = (now - lastTap.t < 0.28) && dist(x, y, lastTap.x, lastTap.y) < 16;
  lastTap = { x, y, t: now };

  /* TAP YOURSELF -> jump, or flap if already airborne */
  if (d < SELF_TAP_R) {
    if (P.z <= 0.01) {
      P.vz = P.c.jump;
      P.z = 0.1;
      P.flapAnim = .2;
      beep(300, .12, 'square', .05, 620);
      puff(P.x, P.y, 5, '#c8c8d8');
    } else if (P.stam >= P.flapCost) {
      P.stam -= P.flapCost;
      P.vz = Math.max(P.vz, P.c.flap);
      P.flapAnim = .22;
      P.glide = 0;
      beep(420, .10, 'triangle', .05, 780);
      puff(P.x, P.y - P.z + 4, 4, '#a0b8ff');
    } else {
      beep(160, .06, 'square', .03);
    }
    return;
  }

  const ang = Math.atan2(y - (P.y - P.z), x - P.x);
  P.face = ang;

  /* DOUBLE TAP THE SAME SPOT -> dash */
  if (dblSame && P.dashLeft > 0 && P.stam >= P.c.dashCost) {
    P.dashLeft--;
    P.stam -= P.c.dashCost;
    P.dash = 0.17;
    P.dashDir = ang;
    P.inv = Math.max(P.inv, 0.26);
    setTarget(x, y);
    beep(200, .14, 'sawtooth', .06, 700);
    for (let i = 0; i < 8; i++) puff(P.x, P.y, 1, P.c.trail);
    return;
  }

  setTarget(x, y);
  if (P.z > 0.01) P.glide = 0.9;      /* far tap while airborne -> glide that way */
  if (P.atkCd <= 0) attack(ang);
}

function setTarget(x, y) {
  P.tx = clamp(x, FIELD.x0 + 4, FIELD.x1 - 4);
  P.ty = clamp(y + P.z, FIELD.y0 + 4, FIELD.y1 - 2);
}

function attack(ang) {
  P.atkCd = P.cd;
  const c = P.c;
  if (c.ranged) {
    shots.push({
      x: P.x, y: P.y, z: P.z + BODY_H,
      vx: Math.cos(ang) * (c.homing ? 2.4 : 3.4), vy: Math.sin(ang) * (c.homing ? 2.4 : 3.4),
      life: c.homing ? 1.7 : 0.9, dmg: P.dmg, friendly: true, homing: c.homing,
      col: c.homing ? '#7ce0ff' : '#f0a0ff',
    });
    beep(c.homing ? 620 : 880, .08, 'square', .045, c.homing ? 900 : 420);
  } else {
    P.swing = { t: 0, dur: c.swingTime, ang, arc: P.arc, range: P.range, dmg: P.dmg, hits: new Set() };
    beep(c.pound ? 180 : 520, .07, 'square', .04, c.pound ? 90 : 260);
  }
}

/* ---------------- specials ---------------- */
function trySpecial(x, y) {
  if (state !== S.PLAY || !P || P.sp < SP_MAX) {
    if (P && state === S.PLAY) beep(140, .07, 'square', .03);
    return false;
  }
  if (hold) hold.fired = true;
  P.sp = 0;
  const ang = Math.atan2(y - (P.y - P.z), x - P.x);
  P.face = ang;
  fireSpecial(ang, x, y);
  return true;
}

function fireSpecial(ang, tx, ty) {
  const name = P.c.special;
  flash = .25;
  shake = Math.max(shake, 6);
  floatText(P.x, P.y - 18, name, '#f8f0a0');

  if (name === 'WHIRLWIND') {
    P.spin = { t: 0, dur: .62, tick: 0, hits: 0 };
    P.inv = Math.max(P.inv, .62);
    beep(300, .5, 'sawtooth', .07, 1200);
  } else if (name === 'EARTHQUAKE') {
    for (let i = 0; i < 3; i++) {
      rings.push({ x: P.x, y: P.y, r: 4, rMax: 96, speed: 62, dmg: P.dmg * 3, friendly: true, delay: i * .18, hit: new Set(), col: '#ffd070' });
    }
    noise(.5, .11);
    beep(60, .5, 'square', .08, 30);
  } else if (name === 'SPARKSTORM') {
    for (let v = 0; v < 3; v++) {
      for (let i = 0; i < 10; i++) {
        const a = ang + (i / 10) * Math.PI * 2 + v * .21;
        shots.push({
          x: P.x, y: P.y, z: P.z + BODY_H, vx: Math.cos(a) * 3.0, vy: Math.sin(a) * 3.0,
          life: 1.1, dmg: P.dmg, friendly: true, homing: false, col: '#f0a0ff', delay: v * .12,
        });
      }
    }
    beep(900, .4, 'square', .06, 1600);
  } else if (name === 'SINGULARITY') {
    holes.push({
      x: clamp(tx, FIELD.x0 + 10, FIELD.x1 - 10),
      y: clamp(ty + P.z, FIELD.y0 + 10, FIELD.y1 - 10),
      t: 0, dur: 2.6, tick: 0,
    });
    beep(120, .8, 'sine', .07, 40);
  }
}

/* ---------------- particles & fx ---------------- */
function puff(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(.3, 1.4);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .6, life: rnd(.2, .5), col, g: 0 });
  }
}
function blood(x, y, col) {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(.5, 2);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .7, life: rnd(.2, .55), col, g: .04 });
  }
}
function floatText(x, y, str, col) { texts.push({ x, y, str, col, life: .7 }); }

/* ---------------- enemies ---------------- */
const ETYPE = {
  crawler: { hp: 3,  spd: .42, score: 10, xp: 6,   pal: { a: '#58c840', b: '#207020', e: '#f8f8f8' }, z: 0,  r: 5, dmg: 1 },
  charger: { hp: 6,  spd: .30, score: 22, xp: 14,  pal: { a: '#e05038', b: '#802010', e: '#f8f0a0' }, z: 0,  r: 6, dmg: 1 },
  spitter: { hp: 3,  spd: .30, score: 18, xp: 9,   pal: { a: '#c058e0', b: '#582070', e: '#f8f8f8' }, z: 0,  r: 5, dmg: 1 },
  flyer:   { hp: 3,  spd: .55, score: 26, xp: 12,  pal: { a: '#48b0f8', b: '#2050a0', e: '#f8f8f8' }, z: 20, r: 5, dmg: 1 },
  tusk:    { hp: 58, spd: .34, score: 400, xp: 130, pal: { a: '#d07038', b: '#6a3010', e: '#f8f058', t: '#f8f0d8' }, z: 0,  r: 9, dmg: 2, boss: 'TUSKLORD' },
  ward:    { hp: 52, spd: .46, score: 460, xp: 140, pal: { a: '#9078f8', b: '#402088', e: '#f8f058' },                z: 22, r: 8, dmg: 2, boss: 'SKYWARDEN' },
};

function newEnemy(kind, x, y, hp) {
  const t = ETYPE[kind];
  return {
    kind, x, y, z: t.z, hp, maxhp: hp,
    spd: t.spd, r: t.r, dmg: t.dmg, boss: !!t.boss,
    t: 0, st: 0, phase: rnd(0, 6.28), state: null,
    flash: 0, kb: 0, kbx: 0, kby: 0, spawn: t.boss ? 1.1 : .35,
    atkCd: rnd(.5, 2), ca: 0, da: 0, act: 0, enraged: false,
  };
}

function spawnEnemy(kind) {
  const t = ETYPE[kind];
  const scale = 1 + (wave - 1) * 0.16;
  let x = FIELD.x0 + 2, y = FIELD.y0 + 2, side = Math.floor(Math.random() * 4);
  for (let tries = 0; tries < 12; tries++) {
    if (side === 0) { x = rnd(FIELD.x0, FIELD.x1); y = FIELD.y0 + 2; }
    else if (side === 1) { x = rnd(FIELD.x0, FIELD.x1); y = FIELD.y1 - 2; }
    else if (side === 2) { x = FIELD.x0 + 2; y = rnd(FIELD.y0, FIELD.y1); }
    else { x = FIELD.x1 - 2; y = rnd(FIELD.y0, FIELD.y1); }
    if (!P || dist(x, y, P.x, P.y) > 55) break;
    side = (side + 1) % 4;
  }
  enemies.push(newEnemy(kind, x, y, Math.round(t.hp * scale)));
}

function spawnBoss() {
  const kind = (bossIdx++ % 2 === 0) ? 'tusk' : 'ward';
  const t = ETYPE[kind];
  const hp = Math.round(t.hp * (1 + wave * 0.22));
  const e = newEnemy(kind, (FIELD.x0 + FIELD.x1) / 2, FIELD.y0 + 16, hp);
  enemies.push(e);
  bossAlive = true;
  banner = { text: t.boss, sub: 'WARNING', t: 0 };
  noise(.6, .1);
  beep(90, .8, 'sawtooth', .08, 50);
}

function pickKind() {
  const roll = Math.random();
  if (wave <= 1) return roll < .85 ? 'crawler' : 'spitter';
  if (wave <= 2) return roll < .60 ? 'crawler' : roll < .80 ? 'spitter' : 'flyer';
  if (wave <= 4) return roll < .42 ? 'crawler' : roll < .62 ? 'spitter' : roll < .82 ? 'flyer' : 'charger';
  return roll < .32 ? 'crawler' : roll < .50 ? 'spitter' : roll < .74 ? 'flyer' : 'charger';
}

/* ---------------- levelling ---------------- */
function gainXp(n) {
  P.xp += n;
  while (P.xp >= P.xpNeed) {
    P.xp -= P.xpNeed;
    P.level++;
    P.xpNeed = xpFor(P.level);
    pendingLevels++;
  }
  if (pendingLevels > 0 && state === S.PLAY) openLevelUp();
}

function openLevelUp() {
  const pool = UPGRADES.filter(u => P.up[u.id] < u.max);
  if (!pool.length) { pendingLevels = 0; return; }
  const pick = [];
  const bag = pool.slice();
  while (pick.length < 3 && bag.length) {
    pick.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  while (pick.length < 3) pick.push(pick[pick.length - 1]);
  cards = pick;
  state = S.LEVEL;
  hold = null;
  beep(700, .12, 'square', .06, 1180);
  setTimeout(() => beep(980, .14, 'square', .06, 1400), 100);
}

function takeUpgrade(u) {
  P.up[u.id] = Math.min(u.max, P.up[u.id] + 1);
  if (u.id === 'vigor') P.hp++;
  recalc(P);
  if (u.id === 'vigor') P.hp = Math.min(P.maxhp, P.hp);
  pendingLevels--;
  beep(880, .1, 'triangle', .06, 1320);
  if (pendingLevels > 0) openLevelUp();
  else { state = S.PLAY; floatText(P.x, P.y - 20, u.name, '#f8f0a0'); }
}

/* ---------------- game flow ---------------- */
function startGame(i) {
  sel = i;
  P = makePlayer(i);
  enemies = []; shots = []; parts = []; drops = []; texts = []; tapFx = [];
  rings = []; holes = []; cards = [];
  time = 0; score = 0; wave = 1; kills = 0; spawnT = .8; waveT = 0;
  shake = 0; hitStop = 0; flash = 0; pendingLevels = 0;
  bossAlive = false; bossIdx = 0; banner = null; hold = null;
  lastTap = { x: 0, y: 0, t: -9 };
  state = S.PLAY;
  beep(440, .07, 'square', .06, 880);
  setTimeout(() => beep(660, .1, 'square', .06, 990), 80);
}

function die() {
  state = S.DEAD;
  deadAt = time;
  hold = null;
  const key = P.c.name, sc = Math.floor(score);
  if (!best[key] || sc > best[key]) { best[key] = sc; saveBest(); }
  shake = 8; flash = .3;
  noise(.4, .1);
  beep(300, .5, 'sawtooth', .07, 60);
}

/* ---------------- update ---------------- */
function update(dt) {
  time += dt;
  const f = dt * 60;

  for (let i = tapFx.length - 1; i >= 0; i--) { tapFx[i].t += dt; if (tapFx[i].t > .3) tapFx.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * f; p.y += p.vy * f; p.vy += (p.g || 0) * f;
    p.vx *= .93; p.vy *= .93; p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].y -= 18 * dt; texts[i].life -= dt; if (texts[i].life <= 0) texts.splice(i, 1); }
  if (shake > 0) shake = Math.max(0, shake - 22 * dt);
  if (flash > 0) flash = Math.max(0, flash - dt * 2);
  if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null; }

  if (state !== S.PLAY) return;
  if (hitStop > 0) { hitStop -= dt; return; }

  if (hold) hold.t += dt;
  score += dt * 2.5;

  /* --- waves --- */
  waveT += dt;
  if (waveT > 18) {
    waveT = 0; wave++;
    if (wave % 5 === 0) spawnBoss();
    else { floatText(W / 2, H * .3, 'WAVE ' + wave, '#f8f0a0'); beep(700, .1, 'square', .05, 1000); }
  }
  spawnT -= dt;
  if (spawnT <= 0 && enemies.length < 26) {
    // the arena thins out while a boss holds the floor
    spawnT = Math.max(.42, 1.7 - wave * .11) * rnd(.75, 1.25) * (bossAlive ? 2.4 : 1);
    spawnEnemy(pickKind());
    if (wave > 3 && !bossAlive && Math.random() < .3) spawnEnemy(pickKind());
  }

  /* --- player --- */
  const c = P.c;
  P.inv = Math.max(0, P.inv - dt);
  P.atkCd = Math.max(0, P.atkCd - dt);
  P.glide = Math.max(0, P.glide - dt);
  P.flapAnim = Math.max(0, P.flapAnim - dt);
  P.hurtFlash = Math.max(0, P.hurtFlash - dt);
  P.charge = (hold && hold.t >= HOLD_T && P.sp >= SP_MAX) ? Math.min(1, P.charge + dt * 4) : 0;

  P.stam = clamp(P.stam + (P.z > 0 ? 9 : 24) * dt, 0, 100);
  if (P.dashLeft < P.dashes) {
    P.dashRegen += dt;
    if (P.dashRegen > 1.5) { P.dashRegen = 0; P.dashLeft++; beep(900, .05, 'triangle', .03); }
  }

  // height
  const gliding = P.glide > 0 && P.z > 0 && P.vz < 0;
  if (P.z > 0 || P.vz > 0) {
    P.vz -= 0.15 * f;
    if (gliding && P.vz < -P.glideFall) P.vz = -P.glideFall;
    P.z += P.vz * f;
    if (P.z <= 0) {
      const fell = -P.vz;
      P.z = 0; P.vz = 0; P.glide = 0;
      puff(P.x, P.y, 5, '#a0a090');
      if (c.pound > 0 && fell > 1.8) shockwave();
      else beep(140, .05, 'square', .03);
    }
  }

  // ground movement
  if (P.dash > 0) {
    P.dash -= dt;
    P.x += Math.cos(P.dashDir) * 3.4 * f;
    P.y += Math.sin(P.dashDir) * 3.4 * f;
    if (Math.random() < .8) parts.push({ x: P.x + rnd(-2, 2), y: P.y + rnd(-3, 1) - P.z, vx: 0, vy: 0, life: .18, col: c.trail, g: 0 });
  } else {
    const d = dist(P.x, P.y, P.tx, P.ty);
    P.moving = d > STOP_DIST;
    if (P.moving) {
      const sp = P.speed * (P.z > 0 ? (gliding ? c.glideBoost : 1.05) : 1);
      const a = Math.atan2(P.ty - P.y, P.tx - P.x);
      P.x += Math.cos(a) * sp * f;
      P.y += Math.sin(a) * sp * f;
      P.walkT += dt * sp * 7;
    }
  }
  P.x = clamp(P.x, FIELD.x0 + 3, FIELD.x1 - 3);
  P.y = clamp(P.y, FIELD.y0 + 3, FIELD.y1 - 1);

  // sword sweep
  if (P.swing) {
    const s = P.swing;
    s.t += dt;
    const prog = s.t / s.dur;
    if (prog >= 1) P.swing = null;
    else {
      // tested in the space the player sees: sprite positions, ground y minus height
      const px = P.x, py = P.y - P.z, swept = s.arc * prog;
      for (const e of enemies) {
        if (e.spawn > 0 || s.hits.has(e)) continue;
        if (Math.abs(e.z - P.z) > SWING_Z) continue;
        const ex = e.x, ey = e.y - e.z;
        if (dist(ex, ey, px, py) > s.range + e.r) continue;
        const rel = angDiff(Math.atan2(ey - py, ex - px), s.ang - s.arc / 2);
        if (rel >= -0.3 && rel <= swept + 0.3) {
          s.hits.add(e);
          hurtEnemy(e, s.dmg, s.ang);
        }
      }
    }
  }

  // whirlwind special: repeated full-circle bursts
  if (P.spin) {
    P.spin.t += dt;
    P.spin.tick -= dt;
    if (P.spin.tick <= 0) {
      P.spin.tick = .17;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.spawn > 0 || Math.abs(e.z - P.z) > SWING_Z) continue;
        if (dist(e.x, e.y - e.z, P.x, P.y - P.z) < P.range + 8 + e.r) {
          hurtEnemy(e, P.dmg * 2, Math.atan2(e.y - P.y, e.x - P.x));
          if (e.hp <= 0) killEnemy(e, j);
        }
      }
      beep(700, .09, 'sawtooth', .05, 300);
    }
    if (P.spin.t >= P.spin.dur) P.spin = null;
  }

  updateEnemies(dt, f);
  updateShots(dt, f);
  updateRings(dt);
  updateHoles(dt);

  /* --- pickups --- */
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.life -= dt; d.bob += dt * 6;
    if (d.life <= 0) { drops.splice(i, 1); continue; }
    if (dist(d.x, d.y, P.x, P.y) < 9 && P.z < 12) {
      if (d.kind === 'heart') { P.hp = Math.min(P.maxhp, P.hp + 1); floatText(d.x, d.y - 8, '+HP', '#f86868'); }
      else { P.stam = 100; P.dashLeft = P.dashes; floatText(d.x, d.y - 8, '+PWR', '#68d8f8'); }
      beep(880, .12, 'triangle', .06, 1320);
      drops.splice(i, 1);
    }
  }
}

function updateEnemies(dt, f) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.spawn > 0) { e.spawn -= dt; continue; }

    if (e.kb > 0) {
      e.kb -= dt;
      e.x += e.kbx * f; e.y += e.kby * f;
      e.kbx *= .82; e.kby *= .82;
    } else {
      const a = Math.atan2(P.y - e.y, P.x - e.x);
      if (e.kind === 'crawler') {
        e.x += Math.cos(a) * e.spd * f;
        e.y += Math.sin(a) * e.spd * f;
      } else if (e.kind === 'spitter') {
        const d = dist(e.x, e.y, P.x, P.y);
        const want = d < 55 ? -1 : d > 80 ? 1 : 0;
        e.x += Math.cos(a) * e.spd * want * f;
        e.y += Math.sin(a) * e.spd * want * f;
        e.atkCd -= dt;
        if (e.atkCd <= 0 && d < 130) {
          e.atkCd = rnd(1.6, 2.6);
          shots.push({ x: e.x, y: e.y, z: e.z + BODY_H, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 3.5, dmg: 1, friendly: false, col: '#f070f0' });
          beep(240, .1, 'sawtooth', .035, 140);
        }
      } else if (e.kind === 'charger') {
        e.st -= dt;
        if (!e.state) e.state = 'walk';
        if (e.state === 'walk') {
          e.x += Math.cos(a) * e.spd * f;
          e.y += Math.sin(a) * e.spd * f;
          if (dist(e.x, e.y, P.x, P.y) < 70 && e.st <= 0) { e.state = 'tell'; e.st = .65; e.ca = a; beep(120, .15, 'square', .03, 200); }
        } else if (e.state === 'tell') {
          e.ca = e.ca + angDiff(a, e.ca) * .15;
          if (e.st <= 0) { e.state = 'charge'; e.st = .55; }
        } else {
          e.x += Math.cos(e.ca) * 2.6 * f;
          e.y += Math.sin(e.ca) * 2.6 * f;
          if (Math.random() < .5) parts.push({ x: e.x, y: e.y + 3, vx: 0, vy: 0, life: .2, col: '#a05030', g: 0 });
          if (e.st <= 0) { e.state = 'walk'; e.st = 1.1; }
        }
      } else if (e.kind === 'flyer') {
        if (!e.state) { e.state = 'hover'; e.st = rnd(1.2, 3); }
        e.st -= dt;
        if (e.state === 'hover') {
          e.z += (20 - e.z) * 2 * dt;
          const orbit = a + Math.sin(e.t * 1.4 + e.phase) * .9;
          e.x += Math.cos(orbit) * e.spd * f;
          e.y += Math.sin(orbit) * e.spd * f;
          if (e.st <= 0) { e.state = 'dive'; e.st = .9; e.da = a; }
        } else {
          e.z += (2 - e.z) * 4 * dt;
          e.x += Math.cos(e.da) * 1.6 * f;
          e.y += Math.sin(e.da) * 1.6 * f;
          if (e.st <= 0) { e.state = 'hover'; e.st = rnd(1.4, 3); }
        }
      } else if (e.kind === 'tusk') {
        updateTusk(e, a, dt, f);
      } else if (e.kind === 'ward') {
        updateWard(e, a, dt, f);
      }
    }

    e.x = clamp(e.x, FIELD.x0 + 2, FIELD.x1 - 2);
    e.y = clamp(e.y, FIELD.y0 + 2, FIELD.y1 - 1);

    if (P.inv <= 0 && Math.abs(e.z - P.z) < 10 && dist(e.x, e.y, P.x, P.y) < e.r + 5) {
      hurtPlayer(e.dmg, Math.atan2(P.y - e.y, P.x - e.x));
    }
    if (e.hp <= 0) killEnemy(e, i);
  }
}

/* TUSKLORD - a ground boss. Charges, then slams out rings you must jump. */
function updateTusk(e, a, dt, f) {
  if (!e.state) { e.state = 'walk'; e.st = 2.2; }
  e.st -= dt;
  if (!e.enraged && e.hp < e.maxhp * .5) {
    e.enraged = true;
    banner = { text: 'ENRAGED', sub: 'TUSKLORD', t: 1.4 };
    for (let i = 0; i < 3; i++) spawnEnemy('crawler');
    beep(100, .4, 'sawtooth', .06, 60);
  }

  if (e.state === 'walk') {
    e.x += Math.cos(a) * e.spd * f;
    e.y += Math.sin(a) * e.spd * f;
    if (e.st <= 0) {
      e.act = (e.act + 1) % 2;
      if (e.act === 0) { e.state = 'tell'; e.st = .8; e.ca = a; beep(130, .2, 'square', .04, 220); }
      else { e.state = 'wind'; e.st = .7; beep(90, .3, 'square', .05, 150); }
    }
  } else if (e.state === 'tell') {
    e.ca = e.ca + angDiff(a, e.ca) * .12;
    if (e.st <= 0) { e.state = 'charge'; e.st = e.enraged ? 1.1 : .9; }
  } else if (e.state === 'charge') {
    e.x += Math.cos(e.ca) * (e.enraged ? 3.4 : 2.9) * f;
    e.y += Math.sin(e.ca) * (e.enraged ? 3.4 : 2.9) * f;
    if (Math.random() < .6) parts.push({ x: e.x + rnd(-6, 6), y: e.y + 4, vx: 0, vy: 0, life: .25, col: '#a06030', g: 0 });
    if (e.st <= 0) { e.state = 'walk'; e.st = e.enraged ? 1.6 : 2.4; }
  } else if (e.state === 'wind') {
    if (e.st <= 0) {
      e.state = 'walk'; e.st = e.enraged ? 1.6 : 2.6;
      const n = e.enraged ? 4 : 3;
      for (let i = 0; i < n; i++) {
        rings.push({ x: e.x, y: e.y, r: 6, rMax: 120, speed: 58, dmg: 1, friendly: false, delay: i * .26, hit: new Set(), col: '#f8a048' });
      }
      shake = Math.max(shake, 7);
      noise(.4, .1);
      beep(70, .45, 'square', .07, 35);
    }
  }
}

/* SKYWARDEN - an air boss. Sits out of sword reach and rains bolts. */
function updateWard(e, a, dt, f) {
  if (!e.state) { e.state = 'hover'; e.st = 2.4; }
  e.st -= dt;
  if (!e.enraged && e.hp < e.maxhp * .5) {
    e.enraged = true;
    banner = { text: 'ENRAGED', sub: 'SKYWARDEN', t: 1.4 };
    for (let i = 0; i < 2; i++) spawnEnemy('flyer');
    beep(300, .4, 'sawtooth', .06, 900);
  }

  if (e.state === 'hover') {
    e.z += (22 - e.z) * 2 * dt;
    const orbit = a + Math.sin(e.t * 1.1 + e.phase) * 1.1;
    e.x += Math.cos(orbit) * e.spd * f;
    e.y += Math.sin(orbit) * e.spd * f;
    if (e.st <= 0) {
      e.act = (e.act + 1) % 2;
      if (e.act === 0) { e.state = 'volley'; e.st = .55; }
      else { e.state = 'dive'; e.st = 1.1; e.da = a; }
    }
  } else if (e.state === 'volley') {
    if (e.st <= 0) {
      e.state = 'hover'; e.st = e.enraged ? 1.5 : 2.4;
      const n = e.enraged ? 14 : 10;
      for (let i = 0; i < n; i++) {
        const ang = a + (i / n) * Math.PI * 2;
        shots.push({ x: e.x, y: e.y, z: e.z + BODY_H, vx: Math.cos(ang) * 1.7, vy: Math.sin(ang) * 1.7, life: 4, dmg: 1, friendly: false, col: '#c0a0ff', fall: 14 });
      }
      beep(420, .25, 'sawtooth', .05, 180);
    }
  } else {
    e.z += (3 - e.z) * 3.4 * dt;
    e.x += Math.cos(e.da) * 2.1 * f;
    e.y += Math.sin(e.da) * 2.1 * f;
    if (e.st <= 0) { e.state = 'hover'; e.st = e.enraged ? 1.4 : 2.2; }
  }
}

function updateShots(dt, f) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    // boss bolts sink toward the floor so they can be out-climbed
    if (s.fall) s.z = Math.max(0, s.z - s.fall * dt);
    if (s.homing) {
      let bestE = null, bd = 9999;
      for (const e of enemies) {
        if (e.spawn > 0) continue;
        const d = dist(e.x, e.y, s.x, s.y);
        if (d < bd) { bd = d; bestE = e; }
      }
      if (bestE && bd < 90) {
        const want = Math.atan2(bestE.y - s.y, bestE.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        const na = cur + angDiff(want, cur) * 0.14;
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        s.z += (bestE.z + BODY_H - s.z) * 2.2 * dt;
      }
      if (Math.random() < .5) parts.push({ x: s.x, y: s.y - s.z, vx: 0, vy: 0, life: .22, col: '#7ce0ff', g: 0 });
    }
    s.x += s.vx * f; s.y += s.vy * f; s.life -= dt;
    if (s.life <= 0 || s.x < FIELD.x0 || s.x > FIELD.x1 || s.y < FIELD.y0 || s.y > FIELD.y1) { shots.splice(i, 1); continue; }
    if (s.friendly) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.spawn > 0 || Math.abs((e.z + BODY_H) - s.z) > SHOT_Z) continue;
        if (dist(e.x, e.y, s.x, s.y) < e.r + 3) {
          hurtEnemy(e, s.dmg, Math.atan2(s.vy, s.vx));
          shots.splice(i, 1);
          if (e.hp <= 0) killEnemy(e, j);
          break;
        }
      }
    } else if (P.inv <= 0 && Math.abs((P.z + BODY_H) - s.z) < SHOT_Z && dist(s.x, s.y, P.x, P.y) < 7) {
      hurtPlayer(s.dmg, Math.atan2(s.vy, s.vx));
      shots.splice(i, 1);
    }
  }
}

function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    if (g.delay > 0) { g.delay -= dt; continue; }
    g.r += g.speed * dt;
    if (g.r > g.rMax) { rings.splice(i, 1); continue; }
    if (g.friendly) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.spawn > 0 || g.hit.has(e) || e.z > 14) continue;
        if (Math.abs(dist(e.x, e.y, g.x, g.y) - g.r) < 6) {
          g.hit.add(e);
          hurtEnemy(e, g.dmg, Math.atan2(e.y - g.y, e.x - g.x));
          if (e.hp <= 0) killEnemy(e, j);
        }
      }
    } else if (!g.hitP && P.inv <= 0 && P.z < 10) {
      // jump the ring and it passes harmlessly underneath
      if (Math.abs(dist(P.x, P.y, g.x, g.y) - g.r) < 5) {
        g.hitP = true;
        hurtPlayer(g.dmg, Math.atan2(P.y - g.y, P.x - g.x));
      }
    }
  }
}

function updateHoles(dt) {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    h.t += dt; h.tick -= dt;
    if (h.t >= h.dur) { holes.splice(i, 1); continue; }
    const doDmg = h.tick <= 0;
    if (doDmg) h.tick = .3;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.spawn > 0) continue;
      const d = dist(e.x, e.y, h.x, h.y);
      if (d > 62) continue;
      const pull = (e.boss ? 14 : 46) * dt * (1 - d / 90);
      const a = Math.atan2(h.y - e.y, h.x - e.x);
      e.x += Math.cos(a) * pull;
      e.y += Math.sin(a) * pull;
      if (e.z > 0) e.z = Math.max(0, e.z - 16 * dt);
      if (doDmg && d < 34) {
        hurtEnemy(e, P.dmg, a + Math.PI);
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
    if (Math.random() < .6) {
      const a = Math.random() * Math.PI * 2, r = rnd(20, 46);
      parts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r * .7, vx: -Math.cos(a) * 1.8, vy: -Math.sin(a) * 1.2, life: .4, col: '#b070ff', g: 0 });
    }
  }
}

function shockwave() {
  shake = Math.max(shake, 5);
  noise(.2, .09);
  beep(80, .25, 'square', .07, 40);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    parts.push({ x: P.x + Math.cos(a) * 6, y: P.y + Math.sin(a) * 4, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 1.6, life: .35, col: '#ffd070', g: 0 });
  }
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (e.spawn > 0 || e.z > 12) continue;
    if (dist(e.x, e.y, P.x, P.y) < 34) {
      hurtEnemy(e, P.c.pound, Math.atan2(e.y - P.y, e.x - P.x));
      if (e.hp <= 0) killEnemy(e, j);
    }
  }
}

function hurtEnemy(e, dmg, ang) {
  e.hp -= dmg;
  e.flash = .12;
  if (!e.boss) { e.kb = .16; e.kbx = Math.cos(ang) * 2.2; e.kby = Math.sin(ang) * 2.2; }
  blood(e.x, e.y, ETYPE[e.kind].pal.a);
  hitStop = Math.max(hitStop, 0.035);
  shake = Math.max(shake, 2);
  P.sp = Math.min(SP_MAX, P.sp + 1.5 * P.spGain);
  beep(660, .05, 'square', .04, 300);
  floatText(e.x, e.y - 6, String(dmg), '#ffffff');
}

function killEnemy(e, idx) {
  const t = ETYPE[e.kind];
  const gain = Math.round(t.score * (1 + wave * .12));
  score += gain;
  kills++;
  floatText(e.x, e.y - 10, '+' + gain, '#f8f0a0');
  blood(e.x, e.y, t.pal.a);
  blood(e.x, e.y, t.pal.b);
  noise(e.boss ? .5 : .12, e.boss ? .12 : .05);
  beep(e.boss ? 120 : 200, e.boss ? .6 : .12, 'square', .05, e.boss ? 50 : 80);
  P.sp = Math.min(SP_MAX, P.sp + (e.boss ? 60 : 12) * P.spGain);
  if (P.leech > 0 && Math.random() < P.leech * .12) {
    P.hp = Math.min(P.maxhp, P.hp + 1);
    floatText(e.x, e.y - 16, '+HP', '#f86868');
  }
  enemies.splice(idx, 1);

  if (e.boss) {
    bossAlive = enemies.some(o => o.boss);
    banner = { text: 'BOSS DOWN', sub: t.boss, t: 0 };
    shake = Math.max(shake, 9); flash = .35;
    for (let i = 0; i < 5; i++) blood(e.x + rnd(-8, 8), e.y + rnd(-8, 8), t.pal.a);
    drops.push({ x: e.x, y: e.y, kind: 'heart', life: 14, bob: 0 });
    drops.push({ x: e.x + 12, y: e.y, kind: 'pwr', life: 14, bob: 0 });
  } else {
    const r = Math.random();
    if (r < .07 && P.hp < P.maxhp) drops.push({ x: e.x, y: e.y, kind: 'heart', life: 8, bob: 0 });
    else if (r < .14) drops.push({ x: e.x, y: e.y, kind: 'pwr', life: 8, bob: 0 });
  }
  gainXp(t.xp);
}

function hurtPlayer(dmg, ang) {
  P.hp -= dmg;
  P.inv = 1.1 + P.invBonus;
  P.hurtFlash = .3;
  shake = Math.max(shake, 5);
  hitStop = Math.max(hitStop, .06);
  flash = .18;
  blood(P.x, P.y - 4, '#f86868');
  P.x += Math.cos(ang) * 6;
  P.y += Math.sin(ang) * 6;
  P.tx = P.x; P.ty = P.y;
  noise(.15, .07);
  beep(180, .18, 'sawtooth', .06, 90);
  if (P.hp <= 0) { P.hp = 0; die(); }
}

/* ---------------- draw ---------------- */
function drawGround() {
  ctx.fillStyle = '#1b3a1f';
  ctx.fillRect(0, 0, W, H);
  for (let y = FIELD.y0; y < FIELD.y1; y += 16) {
    for (let x = FIELD.x0; x < FIELD.x1; x += 16) {
      ctx.fillStyle = (((x / 16) | 0) + ((y / 16) | 0)) % 2 ? '#2c5a2f' : '#26512a';
      ctx.fillRect(x, y, Math.min(16, FIELD.x1 - x), Math.min(16, FIELD.y1 - y));
    }
  }
  ctx.fillStyle = '#356a38';
  const fw = FIELD.x1 - FIELD.x0, fh = FIELD.y1 - FIELD.y0;
  for (let i = 0; i < 60; i++) {
    const x = FIELD.x0 + ((i * 53) % fw), y = FIELD.y0 + ((i * 89) % fh);
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  ctx.fillStyle = '#4a4a6a';
  ctx.fillRect(FIELD.x0 - 4, FIELD.y0 - 4, fw + 8, 4);
  ctx.fillRect(FIELD.x0 - 4, FIELD.y1, fw + 8, 4);
  ctx.fillRect(FIELD.x0 - 4, FIELD.y0 - 4, 4, fh + 8);
  ctx.fillRect(FIELD.x1, FIELD.y0 - 4, 4, fh + 8);
  ctx.fillStyle = '#6a6a92';
  for (let x = FIELD.x0 - 4; x < FIELD.x1 + 4; x += 8) {
    ctx.fillRect(x, FIELD.y0 - 4, 4, 1);
    ctx.fillRect(x + 2, FIELD.y1 + 3, 4, 1);
  }
}

function shadow(x, y, z, r) {
  const rr = Math.max(1, r * clamp(1 - z / 60, .35, 1));
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rr, Math.max(1, rr * .5), 0, 0, 6.284);
  ctx.fill();
}

function ringPath(x, y, r, col, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(Math.round(x) + .5, Math.round(y) + .5, Math.max(1, r), Math.max(1, r * .62), 0, 0, 6.284);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const c = P.c;
  const bx = Math.round(P.x - 4), by = Math.round(P.y - 10 - P.z);

  shadow(P.x, P.y + 1, P.z, 5);

  // charged-and-holding tell
  if (P.charge > 0) {
    ringPath(P.x, P.y - P.z - 4, 12 + Math.sin(time * 18) * 2, '#f8f0a0', .8);
    ringPath(P.x, P.y - P.z - 4, 16 + Math.sin(time * 18) * 2, '#ffffff', .35);
  }
  if (P.spin) {
    for (let k = 0; k < 3; k++) {
      ringPath(P.x, P.y - P.z - 4, (P.range + 8) * (0.5 + 0.5 * Math.sin(time * 22 + k)), c.trail, .7 - k * .18);
    }
  }

  if (P.inv > 0 && P.hurtFlash <= 0 && Math.floor(time * 20) % 2 === 0) return;

  if (P.z > 1) {   // wings out while airborne
    const flap = P.flapAnim > 0 ? -2 : Math.sin(time * 14) * 1.2;
    ctx.fillStyle = c.trail;
    ctx.globalAlpha = .85;
    ctx.fillRect(bx - 3, by + 4 + flap, 3, 2);
    ctx.fillRect(bx + 8, by + 4 + flap, 3, 2);
    ctx.fillRect(bx - 4, by + 5 + flap, 2, 2);
    ctx.fillRect(bx + 10, by + 5 + flap, 2, 2);
    ctx.globalAlpha = 1;
  }

  const deg = P.face * 180 / Math.PI;
  let map, flip = false;
  if (deg > -45 && deg <= 45) map = c.set.side;
  else if (deg > 45 && deg <= 135) map = c.set.down;
  else if (deg <= -45 && deg > -135) map = c.set.up;
  else { map = c.set.side; flip = true; }

  let pal = c.pal;
  if (P.hurtFlash > 0 && Math.floor(time * 30) % 2 === 0) {
    pal = { h: '#fff', s: '#fff', e: '#fff', b: '#fff', B: '#fff', p: '#fff', o: '#fff' };
  }
  const bob = (P.moving && P.z <= 0 && P.dash <= 0) ? (Math.floor(P.walkT) % 2) : 0;
  spr(map, bx, by - bob, pal, flip);

  if (P.swing) {
    const s = P.swing;
    const prog = clamp(s.t / s.dur, 0, 1);
    const cur = s.ang - s.arc / 2 + s.arc * prog;
    const cx = P.x, cy = P.y - 4 - P.z;
    for (let k = 0; k < 5; k++) {
      const aa = cur - k * (s.arc / 9);
      ctx.globalAlpha = 1 - k * .18;
      ctx.fillStyle = k === 0 ? '#ffffff' : c.trail;
      const rr = s.range * (0.62 + 0.38 * Math.sin(Math.PI * prog));
      for (let t2 = 0.45; t2 <= 1.0; t2 += 0.14) {
        ctx.fillRect(Math.round(cx + Math.cos(aa) * rr * t2) - 1, Math.round(cy + Math.sin(aa) * rr * t2 * .9) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  if (P.z > 2) {   // altitude thread down to the shadow
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(Math.round(P.x), Math.round(P.y - P.z + 6), 1, Math.min(P.z, 40) | 0);
  }
}

function drawEnemy(e) {
  const t = ETYPE[e.kind];
  const big = !!t.boss;
  shadow(e.x, e.y + (big ? 2 : 4), e.z, big ? 10 : (e.kind === 'charger' ? 6 : 5));
  if (e.spawn > 0) {
    const k = 1 - e.spawn / (big ? 1.1 : .35);
    ctx.fillStyle = Math.floor(time * 24) % 2 ? '#ffffff' : t.pal.a;
    const w = Math.max(1, Math.round((big ? 16 : 8) * k));
    ctx.fillRect(Math.round(e.x - w / 2), Math.round(e.y - 2 - e.z), w, Math.max(1, Math.round((big ? 16 : 8) * k)));
    return;
  }
  const bob = (e.kind === 'flyer' || e.kind === 'ward') ? Math.sin(e.t * 8 + e.phase) * 1.2
            : (e.kind === 'crawler' ? Math.sin(e.t * 9) * .8 : 0);
  let pal = t.pal;
  const telling = (e.state === 'tell' || e.state === 'wind') && Math.floor(time * 16) % 2;
  if (e.flash > 0) pal = { a: '#ffffff', b: '#ffffff', e: '#ffffff', t: '#ffffff' };
  else if (telling) pal = { a: '#ffffff', b: '#ffd0a0', e: '#000000', t: '#ffffff' };
  else if (e.enraged && Math.floor(time * 6) % 2) pal = { a: t.pal.a, b: '#f85030', e: t.pal.e, t: t.pal.t };

  if (big) spr(BSPR[e.kind], e.x - 8, e.y - 14 - e.z + bob, pal, false);
  else spr(ESPR[e.kind], e.x - 4, e.y - 4 - e.z + bob, pal, false);

  if (!big && e.hp < e.maxhp) {
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(e.x - 4), Math.round(e.y - 8 - e.z), 8, 2);
    ctx.fillStyle = '#f8f858';
    ctx.fillRect(Math.round(e.x - 4), Math.round(e.y - 8 - e.z), Math.max(1, Math.round(8 * e.hp / e.maxhp)), 2);
  }
}

function drawHUD() {
  ctx.fillStyle = '#12142a';
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = '#2a2d55';
  ctx.fillRect(0, HUD_H - 1, W, 1);

  // hearts, or a compact tally once upgrades pile them up
  let heartsEnd;
  if (P.maxhp <= 7) {
    for (let i = 0; i < P.maxhp; i++) {
      const x = 5 + i * 8, y = 3, full = i < P.hp;
      ctx.fillStyle = full ? '#e83838' : '#3a2030';
      ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 4, y, 2, 1);
      ctx.fillRect(x, y + 1, 7, 2);
      ctx.fillRect(x + 1, y + 3, 5, 1);
      ctx.fillRect(x + 2, y + 4, 3, 1);
      ctx.fillRect(x + 3, y + 5, 1, 1);
      if (full) { ctx.fillStyle = '#f88888'; ctx.fillRect(x + 1, y + 1, 1, 1); }
    }
    heartsEnd = 5 + P.maxhp * 8;
  } else {
    const x = 5, y = 3;
    ctx.fillStyle = '#e83838';
    ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 4, y, 2, 1);
    ctx.fillRect(x, y + 1, 7, 2);
    ctx.fillRect(x + 1, y + 3, 5, 1);
    ctx.fillRect(x + 2, y + 4, 3, 1);
    ctx.fillRect(x + 3, y + 5, 1, 1);
    const lbl = P.hp + '/' + P.maxhp;
    text(lbl, 14, y + 1, '#f88888');
    heartsEnd = 14 + textWidth(lbl) + 2;
  }

  // stamina, dash pips
  const bw = 40, bx = 5, by = 12;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, 4);
  ctx.fillStyle = '#1f8fd8'; ctx.fillRect(bx, by, Math.round(bw * P.stam / 100), 4);
  ctx.fillStyle = '#8fdcff'; ctx.fillRect(bx, by, Math.round(bw * P.stam / 100), 1);
  for (let i = 0; i < P.dashes && i < 5; i++) {
    ctx.fillStyle = i < P.dashLeft ? '#f8f058' : '#4a4030';
    ctx.fillRect(bx + bw + 4 + i * 5, by, 3, 4);
  }

  // special meter - flashes when it is ready to spend
  const ready = P.sp >= SP_MAX;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by + 6, bw, 4);
  ctx.fillStyle = ready ? (Math.floor(time * 8) % 2 ? '#f8f0a0' : '#ff9030') : '#8038c0';
  ctx.fillRect(bx, by + 6, Math.round(bw * P.sp / SP_MAX), 4);
  text(ready ? 'HOLD!' : 'SP', bx + bw + 4, by + 6, ready ? '#f8f0a0' : '#6a6a8a');

  // right-hand readouts, trailing ones drop off on narrow screens
  const cols = [
    ['SCORE', String(Math.floor(score)), '#ffffff'],
    ['WAVE', String(wave), '#f8f0a0'],
    ['LV', String(P.level), '#a0c8ff'],
    ['BEST', String(best[P.c.name] || 0), '#a0f0a0'],
  ];
  const fit = [];
  let avail = (W - 16) - heartsEnd - 4;
  for (const c of cols) {
    const cw = Math.max(textWidth(c[0]), textWidth(c[1])) + 7;
    if (cw > avail) break;
    fit.push(c); avail -= cw;
  }
  let rx = W - 16;
  for (let i = fit.length - 1; i >= 0; i--) {
    const [label, val, col] = fit[i];
    textR(label, rx, 3, '#8890c8');
    textR(val, rx, 11, col);
    rx -= Math.max(textWidth(label), textWidth(val)) + 7;
  }

  // xp strip along the bottom edge of the panel
  ctx.fillStyle = '#0d0f22';
  ctx.fillRect(0, HUD_H - 4, W, 3);
  ctx.fillStyle = '#5878f8';
  ctx.fillRect(0, HUD_H - 4, Math.round(W * clamp(P.xp / P.xpNeed, 0, 1)), 3);

  ctx.fillStyle = '#8890c8';
  ctx.fillRect(W - 11, 4, 2, 8);
  ctx.fillRect(W - 7, 4, 2, 8);

  // boss health across the top of the arena
  const boss = enemies.find(e => e.boss);
  if (boss && boss.spawn <= 0) {
    const t = ETYPE[boss.kind];
    const w = Math.min(W - 40, 150), x = Math.round((W - w) / 2), y = HUD_H + 3;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#601818'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = boss.enraged ? '#ff5030' : '#e83838';
    ctx.fillRect(x, y, Math.max(1, Math.round(w * clamp(boss.hp / boss.maxhp, 0, 1))), 4);
    ctx.fillStyle = '#f89090'; ctx.fillRect(x, y, Math.max(1, Math.round(w * clamp(boss.hp / boss.maxhp, 0, 1))), 1);
    textC(t.boss, W / 2, y + 6, '#f8c0c0');
  }
}

function drawScene() {
  drawGround();

  if (state === S.PLAY && dist(P.x, P.y, P.tx, P.ty) > STOP_DIST) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.15 * Math.sin(time * 10)).toFixed(2) + ')';
    ctx.fillRect(Math.round(P.tx) - 2, Math.round(P.ty), 5, 1);
    ctx.fillRect(Math.round(P.tx), Math.round(P.ty) - 2, 1, 5);
  }

  // singularities sit under everything
  for (const h of holes) {
    const k = Math.min(1, h.t * 3) * Math.min(1, (h.dur - h.t) * 2);
    for (let i = 0; i < 3; i++) {
      ringPath(h.x, h.y, (10 + i * 9) * k + Math.sin(time * 6 + i) * 2, '#b070ff', .5 - i * .12);
    }
    ctx.fillStyle = '#1a0630';
    ctx.beginPath();
    ctx.ellipse(Math.round(h.x), Math.round(h.y), 7 * k, 4.5 * k, 0, 0, 6.284);
    ctx.fill();
  }

  for (const g of rings) {
    if (g.delay > 0) continue;
    ringPath(g.x, g.y, g.r, g.col, clamp(1 - g.r / g.rMax, .15, .9));
    ringPath(g.x, g.y, g.r - 2, '#ffffff', clamp(.5 - g.r / g.rMax, 0, .5));
  }

  for (const d of drops) {
    shadow(d.x, d.y + 3, 0, 3);
    if (d.life < 2 && Math.floor(time * 12) % 2) continue;
    const yy = Math.round(d.y + Math.sin(d.bob) * 1.5), xx = Math.round(d.x);
    if (d.kind === 'heart') {
      ctx.fillStyle = '#e83838';
      ctx.fillRect(xx - 2, yy - 3, 2, 1); ctx.fillRect(xx + 1, yy - 3, 2, 1);
      ctx.fillRect(xx - 3, yy - 2, 7, 2); ctx.fillRect(xx - 2, yy, 5, 1); ctx.fillRect(xx - 1, yy + 1, 3, 1);
    } else {
      ctx.fillStyle = '#68d8f8';
      ctx.fillRect(xx - 1, yy - 4, 2, 4); ctx.fillRect(xx - 2, yy - 2, 4, 2); ctx.fillRect(xx, yy, 2, 3);
    }
  }

  const actors = enemies.map(e => ({ y: e.y, e })).concat([{ y: P.y, p: true }]);
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) { if (a.p) drawPlayer(); else drawEnemy(a.e); }

  for (const s of shots) {
    if (s.delay > 0) continue;
    if (!s.friendly) shadow(s.x, s.y + 3, s.z, 2);
    ctx.fillStyle = s.col;
    ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y - s.z) - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(s.x), Math.round(s.y - s.z), 1, 1);
  }

  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  ctx.globalAlpha = 1;

  for (const t of texts) {
    ctx.globalAlpha = clamp(t.life * 2, 0, 1);
    textC(t.str, t.x, t.y, t.col);
  }
  ctx.globalAlpha = 1;

  for (const t of tapFx) {
    const k = t.t / .3;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - k)).toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(t.x) + .5, Math.round(t.y) + .5, 3 + k * 9, 0, 6.284);
    ctx.stroke();
  }

  drawHUD();

  if (banner) {
    const a = clamp(Math.min(banner.t * 4, (2.4 - banner.t) * 2), 0, 1);
    ctx.globalAlpha = a;
    const cy = Math.round(H * .34);
    ctx.fillStyle = 'rgba(20,4,10,0.72)';
    ctx.fillRect(0, cy - 6, W, 28);
    textC(banner.sub, W / 2, cy - 3, Math.floor(time * 8) % 2 ? '#f86868' : '#f8f0a0');
    textC(banner.text, W / 2, cy + 6, '#ffffff', 2);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- menu ---------------- */
function drawCharPanel(r, i, on, wide) {
  const c = CHARS[i];
  ctx.fillStyle = on ? '#2a2f60' : '#171a34';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = on ? '#f8f0a0' : '#33385f';
  ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

  const bump = on ? Math.round(Math.sin(time * 6)) : 0;
  const b = best[c.name] || 0;

  if (wide) {
    const sx = r.x + r.w / 2 - 4, sy = r.y + 4 + bump;
    spr(c.set.down, sx, sy, c.pal, false);
    if (on) {
      ctx.fillStyle = c.trail;
      ctx.fillRect(Math.round(sx) - 4, Math.round(sy) + 5, 3, 2);
      ctx.fillRect(Math.round(sx) + 9, Math.round(sy) + 5, 3, 2);
    }
    textC(c.name, r.x + r.w / 2, r.y + 17, on ? '#ffffff' : '#9aa2d8');
    textC(c.title, r.x + r.w / 2, r.y + 25, on ? '#f8f0a0' : '#5a6296');
    if (r.h >= 40) textC(b > 0 ? 'BEST ' + b : '- - -', r.x + r.w / 2, r.y + r.h - 8, b > 0 ? '#7ad07a' : '#3f4570');
  } else {
    const sy = r.y + Math.round((r.h - 10) / 2) + bump;
    spr(c.set.down, r.x + 8, sy, c.pal, false);
    if (on) {
      ctx.fillStyle = c.trail;
      ctx.fillRect(r.x + 4, Math.round(sy) + 5, 3, 2);
      ctx.fillRect(r.x + 17, Math.round(sy) + 5, 3, 2);
    }
    text(c.name, r.x + 26, r.y + Math.round(r.h / 2) - 8, on ? '#ffffff' : '#9aa2d8');
    text(c.title, r.x + 26, r.y + Math.round(r.h / 2) + 1, on ? '#f8f0a0' : '#5a6296');
    if (b > 0) textR('BEST ' + b, r.x + r.w - 6, r.y + Math.round(r.h / 2) - 2, '#7ad07a');
  }
}

function drawMenu() {
  ctx.fillStyle = '#0b0d1a';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) {
    const x = (i * 37) % W, y = (i * 61) % Math.max(40, Math.round(H * .28));
    ctx.fillStyle = i % 3 ? '#1c2044' : '#2a3060';
    ctx.fillRect(x, y, 1, 1);
  }

  const L = menuLayout();
  textC('TAPBLADE', W / 2, 6, '#f8f0a0', L.ts);
  textC('TAP IS THE ONLY BUTTON', W / 2, 6 + 5 * L.ts + 5, '#7a84c0');

  for (let i = 0; i < 4; i++) drawCharPanel(L.rects[i], i, sel === i, L.wide);

  const c = CHARS[sel];
  let y = L.infoY;
  textC(c.name + ' - ' + c.title, W / 2, y, '#ffffff');
  y += 10;
  const stats = [
    ['HP', c.hp / 8], ['ATK', c.dmg / 4],
    ['SPD', (c.speed - .8) / .35], ['AIR', 1 - (c.glideFall - .2) / .7],
  ];
  const barW = Math.min(90, W - 80), barX = Math.round((W - barW) / 2) + 10;
  for (let i = 0; i < stats.length; i++) {
    const yy = y + i * 8;
    text(stats[i][0], barX - 16, yy, '#7a84c0');
    ctx.fillStyle = '#0d0f22';
    ctx.fillRect(barX, yy, barW, 5);
    ctx.fillStyle = c.trail;
    ctx.fillRect(barX, yy, Math.max(2, Math.round(barW * clamp(stats[i][1], .08, 1))), 5);
  }
  y += stats.length * 8 + 2;
  for (let i = 0; i < c.blurb.length; i++) textC(c.blurb[i], W / 2, y + i * 7, '#9aa2d8');

  const on = Math.floor(time * 2) % 2 === 0;
  ctx.fillStyle = on ? '#f8f0a0' : '#b8b070';
  ctx.fillRect(L.start.x, L.start.y, L.start.w, L.start.h);
  ctx.fillStyle = '#0b0d1a';
  ctx.fillRect(L.start.x + 2, L.start.y + 2, L.start.w - 4, L.start.h - 4);
  textC('TAP TO START', W / 2, L.start.y + 7, on ? '#f8f0a0' : '#b8b070');

  ctx.fillStyle = '#171a34'; ctx.fillRect(L.help.x, L.help.y, L.help.w, L.help.h);
  textC('HOW TO PLAY', L.help.x + L.help.w / 2, L.help.y + 5, '#9aa2d8');
  ctx.fillStyle = '#171a34'; ctx.fillRect(L.sound.x, L.sound.y, L.sound.w, L.sound.h);
  textC(muted ? 'SOUND OFF' : 'SOUND ON', L.sound.x + L.sound.w / 2, L.sound.y + 5, muted ? '#6a6a8a' : '#9aa2d8');
}

const HELP_LINES = [
  ['#ffffff', 'ONE INPUT: TAP. WHERE AND'],
  ['#ffffff', 'HOW YOU TAP IS EVERYTHING.'],
  ['#f8f0a0', 'TAP THE GROUND'],
  ['#9aa2d8', 'STEP THERE AND STRIKE THAT WAY.'],
  ['#f8f0a0', 'DOUBLE TAP ONE SPOT'],
  ['#9aa2d8', 'DASH. BRIEFLY UNTOUCHABLE.'],
  ['#f8f0a0', 'TAP YOURSELF'],
  ['#9aa2d8', 'JUMP. AGAIN IN MIDAIR TO FLAP.'],
  ['#f8f0a0', 'TAP FAR WHILE AIRBORNE'],
  ['#9aa2d8', 'GLIDE THAT WAY, FALL SLOWLY.'],
  ['#ff9030', 'HOLD WHEN SP IS FULL'],
  ['#9aa2d8', 'RELEASE TO UNLEASH A SPECIAL.'],
  ['#9aa2d8', 'TAP WITH A SECOND FINGER TOO,'],
  ['#9aa2d8', 'OR RIGHT CLICK ON DESKTOP.'],
  ['#68d8f8', 'FLYERS STAY HIGH - JUMP UP.'],
  ['#68d8f8', 'JUMP THE ORANGE SHOCK RINGS.'],
  ['#a0c8ff', 'KILLS GIVE XP. EVERY LEVEL'],
  ['#a0c8ff', 'YOU PICK ONE OF THREE BOONS.'],
  ['#f86868', 'A BOSS ARRIVES EVERY 5 WAVES.'],
];

function drawHelp() {
  ctx.fillStyle = '#0b0d1a';
  ctx.fillRect(0, 0, W, H);
  textC('HOW TO PLAY', W / 2, 8, '#f8f0a0', 2);
  const top = 24, bot = H - 18;
  const step = clamp(Math.floor((bot - top) / HELP_LINES.length), 6, 10);
  let y = top + Math.max(0, Math.floor((bot - top - step * HELP_LINES.length) / 2));
  for (const [col, s] of HELP_LINES) {
    textC(s, W / 2, y, col);
    y += step;
  }
  textC('TAP TO GO BACK', W / 2, H - 10, Math.floor(time * 2) % 2 ? '#f8f0a0' : '#5a6296');
}

function drawLevel() {
  drawScene();
  ctx.fillStyle = 'rgba(6,8,26,0.82)';
  ctx.fillRect(0, 0, W, H);
  const rs = cardRects();
  textC('LEVEL ' + P.level, W / 2, rs[0].y - 20, '#f8f0a0', 2);
  textC('CHOOSE A BOON', W / 2, rs[0].y - 8, '#9aa2d8');

  for (let i = 0; i < 3; i++) {
    const r = rs[i], u = cards[i], lvl = P.up[u.id];
    const glow = Math.floor(time * 3 + i) % 2 === 0;
    ctx.fillStyle = '#1d2145';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = glow ? '#f8f0a0' : '#4a5090';
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);

    text(u.name, r.x + 6, r.y + 5, '#ffffff');
    text(u.desc, r.x + 6, r.y + 15, '#9aa2d8');
    // pips showing how far this boon is already stacked
    for (let k = 0; k < u.max; k++) {
      ctx.fillStyle = k < lvl ? '#f8f058' : '#3a4070';
      ctx.fillRect(r.x + 6 + k * 5, r.y + r.h - 8, 3, 3);
    }
    textR(lvl > 0 ? 'LV ' + lvl : 'NEW', r.x + r.w - 6, r.y + r.h - 9, lvl > 0 ? '#7ad07a' : '#f8f0a0');
  }
  if (pendingLevels > 1) textC('+' + (pendingLevels - 1) + ' MORE', W / 2, rs[2].y + rs[2].h + 6, '#7a84c0');
}

function drawDead() {
  drawScene();
  ctx.fillStyle = 'rgba(10,6,16,0.74)';
  ctx.fillRect(0, 0, W, H);
  const cy = Math.round(H * .38);
  textC('YOU FELL', W / 2, cy - 34, '#f86868', W >= 200 ? 3 : 2);
  textC(P.c.name + ' - LV ' + P.level, W / 2, cy - 12, '#9aa2d8');
  textC('SCORE ' + Math.floor(score), W / 2, cy + 4, '#ffffff', 2);
  textC('KILLS ' + kills + '   WAVE ' + wave, W / 2, cy + 24, '#9aa2d8');
  const b = best[P.c.name] || 0;
  if (Math.floor(score) >= b) textC('NEW BEST!', W / 2, cy + 40, Math.floor(time * 4) % 2 ? '#f8f0a0' : '#ffffff', 2);
  else textC('BEST ' + b, W / 2, cy + 42, '#7ad07a');
  if (time - deadAt > 0.6) textC('TAP TO CONTINUE', W / 2, cy + 70, Math.floor(time * 2) % 2 ? '#ffffff' : '#5a6296');
}

function drawPause() {
  drawScene();
  ctx.fillStyle = 'rgba(10,6,16,0.74)';
  ctx.fillRect(0, 0, W, H);
  textC('PAUSED', W / 2, Math.round(H * .42), '#f8f0a0', W >= 200 ? 3 : 2);
  textC('TAP ANYWHERE TO RESUME', W / 2, Math.round(H * .42) + 24, '#9aa2d8');
}

/* ---------------- main loop ---------------- */
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;

  update(dt);

  ctx.save();
  if (shake > 0) ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
  if (state === S.MENU) drawMenu();
  else if (state === S.HELP) drawHelp();
  else if (state === S.PLAY) drawScene();
  else if (state === S.LEVEL) drawLevel();
  else if (state === S.DEAD) drawDead();
  else if (state === S.PAUSE) drawPause();
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (flash * .6).toFixed(2) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
